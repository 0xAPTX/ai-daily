"""Source-backed static news collection; no API key required."""
import concurrent.futures
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime, format_datetime
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import sys
import unicodedata
import xml.etree.ElementTree as ET
from summary_utils import MODEL, enrich, read_cache
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode, urljoin

ROOT = Path(__file__).resolve().parents[1]
UTC = timezone.utc
SHANGHAI = timezone(timedelta(hours=8))
ATOM = "{http://www.w3.org/2005/Atom}"
TOPICS = {"ai":"AI 动态", "invest":"投资市场", "biz":"产品商业", "ship":"开发工具", "research":"学术研究", "crypto":"加密 Web3"}
TAGS = {
 "OpenAI":r"openai|chatgpt|gpt[- ]?\d|codex", "Anthropic":r"anthropic|claude", "Google":r"google|gemini|deepmind|谷歌",
 "DeepSeek":r"deepseek|深度求索", "Qwen":r"qwen|千问|通义", "Meta":r"\bmeta\b|\bllama\b", "NVIDIA":r"nvidia|英伟达|cuda",
 "Microsoft":r"microsoft|微软|copilot", "Apple":r"\bapple\b|苹果|\bmlx\b", "Agent":r"agent|智能体|智能代理",
 "开源":r"open.source|开源|open.weights", "模型发布":r"新模型|模型发布|introducing.+model|new model",
 "机器人":r"robot|机器人|具身", "推理":r"reasoning|inference|推理", "多模态":r"multimodal|vision|多模态|图像生成|视频生成",
 "融资并购":r"funding|acqui\w*|融资|收购|并购", "算力":r"data.center|datacenter|compute|算力|数据中心|gpu",
 "产品增长":r"growth|subscription|增长|订阅|运营", "美联储":r"federal.reserve|\bfed\b|美联储", "利率":r"interest.rate|利率|降息|加息",
 "Bitcoin":r"bitcoin|比特币|\bbtc\b", "Ethereum":r"ethereum|以太坊|\beth\b", "ETF":r"\betf\b", "稳定币":r"stablecoin|稳定币",
 "安全":r"security|vulnerability|\bcve[- ]|安全|漏洞", "更新":r"release|changelog|更新|升级|发布新版本",
 "AI 编程":r"coding|codegen|编程|代码生成", "大模型":r"\bllm\b|language.model|大模型",
}


def text_only(value):
 value=re.sub(r"<(script|style)\b[^>]*>.*?</\1>"," ",value or "",flags=re.S|re.I)
 return re.sub(r"\s+"," ",html.unescape(re.sub(r"<[^>]*>"," ",value))).replace("\u200b","").strip()


def parse_date(value):
 if not value:return None
 value=str(value).strip()
 try:date=parsedate_to_datetime(value)
 except (ValueError,TypeError,OverflowError):
  try:date=datetime.fromisoformat(value.replace("Z","+00:00"))
  except ValueError:
   date=None
   for fmt in ("%Y-%m-%d %H:%M:%S %z","%Y-%m-%d","%a, %d %b %Y %H:%M:%S %Z"):
    try:date=datetime.strptime(re.sub(r"\s+"," ",value),fmt);break
    except ValueError:pass
   if date is None:return None
 return date.replace(tzinfo=UTC) if date.tzinfo is None else date.astimezone(UTC)


def canonical_url(value):
 parts=urlsplit(value.strip())
 if parts.scheme not in ("https","http") or not parts.hostname or parts.username or parts.password:return None
 if parts.hostname in ("arxiv.org","www.arxiv.org","export.arxiv.org") and parts.path.startswith("/abs/"):
  return "https://arxiv.org"+re.sub(r"v\d+$","",parts.path)
 query=urlencode([(k,v) for k,v in parse_qsl(parts.query) if not k.lower().startswith("utm_") and k not in ("fbclid","gclid")])
 return urlunsplit((parts.scheme,parts.netloc.lower(),parts.path.rstrip("/") or "/",query,""))


def classify(title,source):
 if source.get("topic"):return source["category"]
 if re.search(r"\b(funding|acqui\w*|invest\w*|partnership|revenue|earnings|billion|quarter)\b",title.lower()):return "行业与商业"
 if re.search(r"\b(paper|research|benchmark|weights|training|reasoning|dataset|architecture)\b",title.lower()):return "模型与技术"
 return source["category"]


def decorate(article,source):
 title=article.get("originalTitle",article["title"])
 ai_context=bool(re.search(r"(?<![a-z])ai(?![a-z])|人工智能|大模型|智能体|机器学习|深度学习|llm|openai|anthropic|deepseek|chatgpt|claude|gemini|qwen|具身|机器人|language.model|neural.network",title+" "+article.get("excerpt",""),re.I))
 article.update(sourceId=source["id"],source=source["name"],kind=source.get("kind","official"),region=source.get("region","Global"))
 article["language"]="zh" if re.search(r"[\u3400-\u9fff]",title) else source.get("language","en")
 topic=source.get("topic","ai");topics=[topic]
 market=re.search(r"股票|股价|资金净|净买入|净卖出|南向资金|回购|买入|卖出|美股|港股|央行|降息|加息|债券|特朗普账户|\b(stocks?|shares?|bonds?|yields?|inflation|treasur\w*|etf)\b",title,re.I)
 crypto=re.search(r"bitcoin|ethereum|crypto|blockchain|web3|token|stablecoin|zcash|solana|chainlink|uniswap|\bsui\b|\bbtc\b|\beth\b|比特币|以太坊|代币|区块链|加密|币安|稳定币|链上",title,re.I)
 if topic=="biz" and market:topics=["invest"]
 if topic=="crypto" and not crypto:
  if market:topics=["invest"]
  elif re.search(r"coding|code|编程|开发",title,re.I):topics=["ship"]
  elif ai_context:topics=["ai"]
 if source["id"] in ("qbitai","leiphone") and not ai_context:topics=["biz"]
 if topic in ("biz","ship","invest") and re.search(r"(?<![a-z])ai(?![a-z])|llm|openai|anthropic|deepseek|人工智能|大模型|智能体",title,re.I):topics.append("ai")
 if topic=="crypto" and re.search(r"etf|监管|\bsec\b|利率|美联储|institutional",title,re.I):topics.append("invest")
 article["topics"]=list(dict.fromkeys(topics))
 article["sourceGroup"]=source.get("group",source["name"])
 article["category"]=classify(title,source)
 article["tags"]=[tag for tag,pattern in TAGS.items() if re.search(pattern,title,re.I)][:5]
 article["isPromotional"]=bool(re.search(r"人才大赛|工作AI先锋|招聘|限时促销|vip retreat|sponsored",title,re.I))
 article["isPrerelease"]=bool(re.search(r"(?:\d|[.-])(rc\d*|alpha\d*|beta\d*)\b|pre.release|nightly|canary|preview",title,re.I))
 article["changeType"]="安全" if re.search(r"security|vulnerability|\bcve[- ]|漏洞|安全修复",title,re.I) else "重大变更" if re.search(r"breaking|deprecat|弃用|不兼容",title,re.I) else "预发布" if article["isPrerelease"] else "版本更新" if source.get("feed","").endswith("releases.atom") else ""
 if source.get("feed","").endswith("releases.atom"):
  article["originalTitle"]=title;article["title"]=f'{source["name"]} · {title}'
 return article


def make_article(title,link,date,excerpt,source,now,date_type="published"):
 link=canonical_url(link or "")
 if not title or not link or not date or date>now+timedelta(minutes=10) or date<now-timedelta(days=90):return None
 title=text_only(title)
 if re.search(r"^viable/|^nightly/|^trunk/|^stable$|^latest$",title,re.I):return None
 excerpt=" ".join(text_only(excerpt).split()[:22])[:180].rstrip()
 return decorate({"id":hashlib.sha256(link.encode()).hexdigest()[:16],"title":title,"url":link,"publishedAt":date.isoformat(),"date":date.astimezone(SHANGHAI).date().isoformat(),"dateType":date_type,"excerpt":excerpt,"contentType":"publisher_excerpt" if excerpt else "title_only"},source)


def parse_feed(payload,source,now):
 root=ET.fromstring(payload)
 entries=root.findall(".//item") or root.findall(ATOM+"entry") or root.findall("{http://purl.org/rss/1.0/}item")
 if not entries and root.tag not in ("rss",ATOM+"feed","{http://www.w3.org/1999/02/22-rdf-syntax-ns#}RDF"):raise ValueError("Response is not RSS or Atom")
 articles=[]
 for entry in entries[:160]:
  title=entry.findtext("title") or entry.findtext(ATOM+"title") or entry.findtext("{http://purl.org/rss/1.0/}title")
  link=entry.findtext("link") or entry.findtext("{http://purl.org/rss/1.0/}link")
  if not link:link=next((e.get("href") for e in entry.findall(ATOM+"link") if e.get("rel","alternate")=="alternate"),"")
  published=entry.findtext("pubDate") or entry.findtext(ATOM+"published") or entry.findtext("{http://purl.org/dc/elements/1.1/}date")
  fallback=entry.findtext(ATOM+"updated")
  excerpt=entry.findtext("description") or entry.findtext(ATOM+"summary") or entry.findtext(ATOM+"content") or entry.findtext("{http://purl.org/rss/1.0/}description")
  article=make_article(title,link,parse_date(published or fallback),excerpt,source,now,"published" if published else "updated")
  if article:
   if re.fullmatch(r"\d{4}-\d{2}-\d{2}", (published or fallback or "").strip()):article["datePrecision"]="day"
   articles.append(article)
 return articles


def download(url):
 return subprocess.run(["curl","--fail","--location","--silent","--show-error","--proto","=https","--proto-redir","=https","--max-time","25","--retry","1","--retry-delay","2","--retry-max-time","35","--max-filesize","6000000","--user-agent","Mozilla/5.0 (Zhixin public feed reader; +https://github.com/0xAPTX/ai-daily)",url],check=True,capture_output=True).stdout


class MetadataParser(HTMLParser):
 def __init__(self):
  super().__init__();self.meta={};self.json_ld=[];self.links=[];self.in_json=False;self.buffer=[]
 def handle_starttag(self,tag,attrs):
  attrs=dict(attrs)
  if tag=="meta":self.meta[attrs.get("property",attrs.get("name",""))]=attrs.get("content","")
  if tag=="script" and attrs.get("type")=="application/ld+json":self.in_json=True;self.buffer=[]
  if tag=="a" and attrs.get("href"):self.links.append(attrs["href"])
 def handle_data(self,data):
  if self.in_json:self.buffer.append(data)
 def handle_endtag(self,tag):
  if tag=="script" and self.in_json:
   self.in_json=False
   try:
    value=json.loads("".join(self.buffer));self.json_ld.extend(value if isinstance(value,list) else [value])
   except ValueError:pass


def parse_anthropic_article(payload,url,source,now):
 parser=MetadataParser();parser.feed(payload.decode("utf-8",errors="replace"));nodes=[]
 for node in parser.json_ld:
  if isinstance(node,dict):nodes.extend(node.get("@graph",[node]))
 node=next((n for n in nodes if isinstance(n,dict) and "NewsArticle" in str(n.get("@type",""))),{})
 return make_article(node.get("headline") or parser.meta.get("og:title"),url,parse_date(node.get("datePublished") or parser.meta.get("article:published_time")),node.get("description") or parser.meta.get("description"),source,now)


def parse_deepseek(payload,source,now):
 document=payload.decode("utf-8",errors="replace");headings=list(re.finditer(r'<h2\b[^>]*\bid="([^"]+)"[^>]*>(.*?)</h2>',document,re.S));articles=[]
 for index,heading in enumerate(headings):
  match=re.search(r"\d{4}-\d{2}-\d{2}",text_only(heading.group(2)))
  if not match:continue
  date=datetime.strptime(match.group(),"%Y-%m-%d").replace(tzinfo=SHANGHAI).astimezone(UTC)
  section=document[heading.end():headings[index+1].start() if index+1<len(headings) else document.find("</article>",heading.end())]
  subtitle=re.search(r"<h3\b[^>]*>(.*?)</h3>",section,re.S)
  title=text_only(subtitle.group(1)) if subtitle else "官方更新"
  article=make_article("DeepSeek · "+title,source["feed"],date,section,source,now)
  if article:
   article["url"]=source["feed"]+"#"+heading.group(1);article["id"]=hashlib.sha256(article["url"].encode()).hexdigest()[:16];article["datePrecision"]="day";articles.append(article)
 return articles


def fetch_source(source,now):
 payload=download(source["feed"])
 if source.get("adapter")=="deepseek":return parse_deepseek(payload,source,now)
 if source.get("adapter")=="anthropic":
  document=payload.decode("utf-8",errors="replace");rows=re.findall(r"<li\b[^>]*data-listing-row[^>]*>.*?</li>",document,re.S);links=[]
  for row in rows[:10]:
   parser=MetadataParser();parser.feed(row)
   for link in parser.links:
    link=urljoin(source["url"],link)
    if urlsplit(link).hostname=="www.anthropic.com" and link not in links:links.append(link)
  if not links:raise ValueError("Anthropic listing changed")
  articles=[]
  with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
   jobs={pool.submit(download,link):link for link in links[:10]}
   for job in concurrent.futures.as_completed(jobs):
    try:
     item=parse_anthropic_article(job.result(),jobs[job],source,now)
     if item:articles.append(item)
    except (subprocess.SubprocessError,ValueError):continue
  if not articles:raise ValueError("No dated Anthropic articles")
  return articles
 return parse_feed(payload,source,now)


def merge_articles(previous,incoming,now):
 by_url={}
 for article in previous+incoming:
  date=parse_date(article.get("publishedAt"))
  if not date or not now-timedelta(days=90)<=date<=now+timedelta(minutes=10):continue
  url=article["url"];old=by_url.get(url,{})
  origins={o["sourceId"]:o for o in old.get("origins",[])}
  for origin in article.get("origins",[])+[{"sourceId":article["sourceId"],"source":article.get("source",article["sourceId"])}]:origins[origin["sourceId"]]=origin
  merged=dict(old,**article);merged["firstSeenAt"]=old.get("firstSeenAt",article.get("firstSeenAt",now.isoformat()));merged["origins"]=list(origins.values());by_url[url]=merged
 seen=set();output=[]
 for article in sorted(by_url.values(),key=lambda a:a["publishedAt"],reverse=True):
  key=(article["sourceId"],article.get("date",article["publishedAt"][:10]),re.sub(r"\W+","",article["title"].lower()))
  if key not in seen:output.append(article);seen.add(key)
 return output


def title_key(value):return re.sub(r"[\W_]+","",unicodedata.normalize("NFKC",value).lower())


def cluster_titles(articles):
 clusters=defaultdict(list)
 for article in articles:
  key=title_key(article.get("originalTitle",article["title"]))
  if len(key)>=15:clusters[key].append(article)
 groups=[]
 for key,members in clusters.items():
  recent=[a for a in members if parse_date(members[0]["publishedAt"])-parse_date(a["publishedAt"])<=timedelta(days=2)]
  source_ids={o.get("group",o["sourceId"]) for a in recent for o in a.get("origins",[{"sourceId":a["sourceId"]}])}
  if len(source_ids)>1:
   group={"id":hashlib.sha256(key.encode()).hexdigest()[:16],"articleIds":[a["id"] for a in recent],"sourceCount":len(source_ids)};groups.append(group)
   for article in recent:article["sameTitleGroup"]=group["id"];article["sameTitleSources"]=group["sourceCount"]
 return groups


def write_json(path,value):
 path.parent.mkdir(parents=True,exist_ok=True);temporary=path.with_suffix(".tmp");temporary.write_text(json.dumps(value,ensure_ascii=False,separators=(",",":"))+"\n");temporary.replace(path)


def export_rss(articles,sources):
 root=ET.Element("rss",version="2.0");channel=ET.SubElement(root,"channel")
 for key,value in (("title","知新 · 多源资讯"),("link","https://0xaptx.github.io/ai-daily/"),("description","AI、投资、商业、工具、研究与 Web3 的公开来源标题。")):ET.SubElement(channel,key).text=value
 for article in articles[:80]:
  item=ET.SubElement(channel,"item")
  for key,value in (("title",article["title"]),("link",article["url"]),("guid",article["url"]),("pubDate",format_datetime(parse_date(article["publishedAt"]))),("description","来源："+article["source"])):ET.SubElement(item,key).text=value
 ET.ElementTree(root).write(ROOT/"site/feed.xml",encoding="utf-8",xml_declaration=True)
 opml=ET.Element("opml",version="2.0");ET.SubElement(ET.SubElement(opml,"head"),"title").text="知新订阅源";body=ET.SubElement(opml,"body")
 for source in sources:
  if source.get("adapter","rss")=="rss":ET.SubElement(body,"outline",text=source["name"],title=source["name"],type="rss",xmlUrl=source["feed"],htmlUrl=source["url"])
 ET.ElementTree(opml).write(ROOT/"site/sources.opml",encoding="utf-8",xml_declaration=True)


def build_outputs(previous,incoming,sources,now,last_success):
 source_map={s["id"]:s for s in sources};articles=merge_articles(previous,incoming,now)
 articles=[a for a in articles if not re.search(r"^viable/|^nightly/|^trunk/",a.get("originalTitle",a["title"]),re.I)]
 for article in articles:
  if article["sourceId"] in source_map:decorate(article,source_map[article["sourceId"]])
 cache=read_cache(ROOT);enrich(articles,cache)
 for article in articles:
  for origin in article.get("origins",[]):origin["group"]=source_map.get(origin["sourceId"],{}).get("group",origin["sourceId"])
 groups=cluster_titles(articles);by_day=defaultdict(list)
 for article in articles:by_day[article["date"]].append(article)
 archives=[]
 for day,items in sorted(by_day.items(),reverse=True):
  write_json(ROOT/"site/data/archive"/(day+".json"),{"date":day,"articles":items})
  archives.append({"date":day,"count":len(items),"topics":dict(Counter(t for a in items for t in a.get("topics",["ai"]))),"sourceCount":len({a["sourceId"] for a in items}),"path":"./data/archive/"+day+".json"})
 for path in (ROOT/"site/data/archive").glob("????-??-??.json"):
  if path.stem not in by_day:path.unlink()
 latest=[];quotas=Counter();source_quotas=Counter();group_quotas=Counter()
 for article in articles:
  topic=source_map.get(article["sourceId"],{}).get("topic","ai")
  group=article.get("sourceGroup",article["sourceId"])
  if quotas[topic]<300 and source_quotas[article["sourceId"]]<40 and group_quotas[group]<80:
   latest.append(article);quotas[topic]+=1;source_quotas[article["sourceId"]]+=1;group_quotas[group]+=1
 stats={"totalArticles":len(articles),"configuredSources":len(sources),"healthySources":sum(s["status"]=="ok" for s in sources),"quietSources":sum(s["status"]=="quiet" for s in sources),"activeSources7d":len({o["sourceId"] for a in articles if now-parse_date(a["publishedAt"])<timedelta(days=7) for o in a.get("origins",[{"sourceId":a["sourceId"]}])}),"chineseSources":sum(s.get("language")=="zh" for s in sources),"organizations":len({s.get("group",s["name"]) for s in sources}),"topicCounts":dict(Counter(t for a in articles for t in a.get("topics",["ai"])))}
 data={"schemaVersion":2,"generatedAt":now.isoformat(),"lastSuccessfulAt":last_success,"timezone":"Asia/Shanghai","retentionDays":90,"summaryMode":"publisher_excerpt","sources":sources,"articles":latest,"archives":archives,"groups":groups,"stats":stats,"topics":TOPICS}
 data["summaryMode"]="local_model_incremental"
 data["summaryService"]={"model":MODEL,"status":cache.get("status","pending"),"checkedAt":cache.get("checkedAt"),"lastSuccessAt":cache.get("lastSuccessAt"),"summarizedArticles":sum(bool(a.get("summaryZh")) for a in articles),"recentSummarized":sum(bool(a.get("summaryZh")) for a in latest),"recentEnglish":sum(a.get("language")!="zh" for a in latest),"basis":"仅基于标题和发布方短摘录；增量生成，未覆盖内容保留原文。"}
 tag_items=defaultdict(list)
 for article in articles:
  if now-parse_date(article["publishedAt"])<timedelta(days=1):
   for tag in article.get("tags",[]):tag_items[tag].append(article)
 data["hotTags"]=sorted([{"tag":tag,"count":len(items),"sourceCount":len({a["sourceId"] for a in items}),"articles":items[:5]} for tag,items in tag_items.items()],key=lambda t:(-t["count"],t["tag"]))
 write_json(ROOT/"site/data/feed.json",data);export_rss(articles,sources);return data


def main():
 now=datetime.now(UTC);path=ROOT/"site/data/feed.json";previous=json.loads(path.read_text()) if path.exists() else {"articles":[],"sources":[]};prior_articles=previous["articles"][:]
 for archive in (ROOT/"site/data/archive").glob("*.json"):prior_articles.extend(json.loads(archive.read_text()).get("articles",[]))
 sources=json.loads((ROOT/"sources.json").read_text());old_sources={s["id"]:s for s in previous.get("sources",[])};incoming=[];results=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
  jobs={pool.submit(fetch_source,source,now):source for source in sources}
  for job in concurrent.futures.as_completed(jobs):
   source=jobs[job];record=dict(source,checkedAt=now.isoformat())
   try:
    items=job.result();incoming.extend(items);record.update(status="ok" if items else "quiet",lastSuccessAt=now.isoformat(),itemCount=len(items));print(f'{source["name"]}: {len(items)} recent items',flush=True)
   except Exception as error:
    record.update(status="error",lastSuccessAt=old_sources.get(source["id"],{}).get("lastSuccessAt"),itemCount=0,error="本次读取失败，已保留历史内容。");print(f'{source["name"]}: {type(error).__name__}',file=sys.stderr,flush=True)
   results.append(record)
 order={s["id"]:index for index,s in enumerate(sources)};results.sort(key=lambda s:order[s["id"]]);successes=sum(s["status"]!="error" for s in results)
 data=build_outputs(prior_articles,incoming,results,now,now.isoformat() if successes else previous.get("lastSuccessfulAt"));print(json.dumps(data["stats"],ensure_ascii=False))
 if not successes:raise SystemExit("All sources failed; historical articles retained, refusing a fresh deployment.")


if __name__=="__main__":main()
