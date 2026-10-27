'use strict';
const $ = s => document.querySelector(s);
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TOPICS = {
  ai:{name:'AI',zh:'智能进展',intro:'模型、智能体、产品与产业动态'},
  invest:{name:'Invest',zh:'投资市场',intro:'宏观政策、监管公告与全球市场'},
  stocks:{name:'美股',zh:'美股资讯',intro:'美股市场、上市公司财报与公告、美国政策监管'},
  hk:{name:'港股',zh:'港股资讯',intro:'恒生指数、港股公司动态与港交所公告'},
  biz:{name:'Biz',zh:'产品商业',intro:'产品增长、创业与商业观察'},
  ship:{name:'Ship',zh:'开发工具',intro:'版本发布、工程实践与安全更新'},
  research:{name:'Research',zh:'学术研究',intro:'原始论文、实验室与研究机构'},
  crypto:{name:'Web3',zh:'加密生态',intro:'协议进展、行业研究与加密市场'},
};
const KIND = {official:'官方发布',media:'媒体报道',research:'研究来源',community:'社区观点'};
let xData = null;
let data = null, route = null, pageLimit = 24, routeVersion = 0;
let saved = {}, reads = [], hiddenSources = [], storageOK = true;
const records = new Map(), archiveCache = new Map(), editionCache = new Map();
function readStorage(key, fallback) { try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {storageOK=false;return fallback;} }
saved=readStorage('zhixin-saved',{});if(!saved||Array.isArray(saved)||typeof saved!=='object')saved={};
reads=readStorage('zhixin-read',[]);if(!Array.isArray(reads))reads=[];
hiddenSources=readStorage('zhixin-hidden',[]);if(!Array.isArray(hiddenSources))hiddenSources=[];
const theme=readStorage('zhixin-theme','light');if(theme==='dark')document.documentElement.dataset.theme='dark';
function persist() {try{localStorage.setItem('zhixin-saved',JSON.stringify(saved));localStorage.setItem('zhixin-read',JSON.stringify(reads));localStorage.setItem('zhixin-hidden',JSON.stringify(hiddenSources));}catch{storageOK=false;toast('浏览器存储不可用，当前记录仅本次有效。');}}
function safeURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'#';}catch{return '#';}}
function chinaDate(date=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
function time(value, full=false){if(!value)return '暂无';const d=new Date(value);if(Number.isNaN(d.getTime()))return '暂无';return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',...(full?{year:'numeric'}:{}),hour:'2-digit',minute:'2-digit',hour12:false}).format(d);}
function clock(a){return a.datePrecision==='day'?'时间未提供':new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(a.publishedAt));}
function shortTime(a){return a.date.slice(5)+' '+(a.datePrecision==='day'?'（未提供时分）':clock(a));}
function num(value){return Number(value||0).toLocaleString('zh-CN');}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,3000);}
function source(id){return data.sources.find(s=>s.id===id);}
function topics(a){return Array.isArray(a.topics)?a.topics:[source(a.sourceId)?.topic||'ai'];}
function visible(a){return a&&a.id&&a.title&&a.url&&!hiddenSources.includes(a.sourceId);}
function recentItems(){return data.articles.filter(visible);}
function articleLink(a){return `#/article/${a.date}/${a.id}`;}
function newsLink(params={}){const q=new URLSearchParams(Object.entries(params).filter(([,v])=>v!==''&&v!=null));return '#/news'+(q.size?'?'+q:'');}
function linkFor(path, params={}){const q=new URLSearchParams(Object.entries(params).filter(([,v])=>v!==''&&v!=null));return '#/'+path+(q.size?'?'+q:'');}
function getRoute(){const value=location.hash.slice(1)||'/';const [path,query]=value.split('?');const parts=path.split('/').filter(Boolean);return {name:parts[0]||'home',parts,params:new URLSearchParams(query||'')};}
function updateParams(values){const p=new URLSearchParams(route.params);for(const[k,v]of Object.entries(values)){if(v===''||v==null||v===false)p.delete(k);else p.set(k,String(v));}location.hash='/'+route.name+(p.size?'?'+p:'');}
function sourceBadge(a){return `<span class="kind ${e(a.kind||source(a.sourceId)?.kind||'official')}">${e(KIND[a.kind||source(a.sourceId)?.kind]||'来源原文')}</span>`;}
function tagLinks(a){return (a.tags||[]).slice(0,4).map(t=>`<a href="${e(newsLink({tag:t}))}">#${e(t)}</a>`).join('');}
function matchesTopic(a,topic){return !topic||topic==='all'||topics(a).includes(topic);}
function byDate(a,b){const day=(b.date||'').localeCompare(a.date||'');if(day)return day;if(a.datePrecision==='day'&&b.datePrecision!=='day')return 1;if(b.datePrecision==='day'&&a.datePrecision!=='day')return -1;return new Date(b.publishedAt)-new Date(a.publishedAt);}
function pickDiverse(items,count=6,quota=1){
  const scores=a=>(a.language==='zh'?2:0)+(a.kind==='official'?.4:a.kind==='research'?.7:0)-(Date.now()-new Date(a.publishedAt))/86400000;
  const sorted=items.filter(a=>!a.isPrerelease&&!a.isPromotional).sort((a,b)=>scores(b)-scores(a));
  const seen={},chosen=[],groupSeen=new Set();
  for(const a of sorted){const k=a.sameTitleGroup||a.id;const sourceKey=a.sourceGroup||a.sourceId;if((seen[sourceKey]||0)>=quota||groupSeen.has(k))continue;chosen.push(a);seen[sourceKey]=(seen[sourceKey]||0)+1;groupSeen.add(k);if(chosen.length>=count)break;}
  return chosen;
}
function displayTitle(a){return a.titleZh||a.title;}
function summaryBadge(a){return a.summaryZh?'<span class="summary-badge">AI 中文摘要</span>':a.language!=='zh'?'<span class="summary-pending">原文 · 待摘要</span>':'';}
function summary(a){if(a.summaryZh)return a.summaryZh;const text=a.excerpt||'';if(!text)return '来源未提供摘录。打开原文查看作者的完整说明。';return (text.length>=175||text.split(/\s+/).length>=22)&&!/[。.!?！？…]$/.test(text)?text+'…':text;}
function newsItem(a,{excerpt=true}={}){
  return `<article class="news-item ${reads.includes(a.id)?'read':''}"><div class="item-meta"><time datetime="${e(a.publishedAt)}">${e(shortTime(a))}${a.dateType==='updated'?' · 更新':''}</time><span>${e(a.source)}</span>${sourceBadge(a)}${summaryBadge(a)}${a.sameTitleSources>1?`<span class="same-title">同标题 · ${a.sameTitleSources} 个发布方</span>`:''}${a.changeType?`<span class="change-flag ${a.changeType==='安全'?'security':''}">${e(a.changeType)}</span>`:''}</div><h3><a href="${e(articleLink(a))}">${e(displayTitle(a))}</a></h3>${excerpt?`<p class="excerpt">${e(summary(a))}</p>`:''}<div class="item-bottom"><div class="item-tags">${tagLinks(a)}</div><div class="item-actions"><button data-save="${e(a.id)}" class="${saved[a.id]?'saved':''}" aria-label="${saved[a.id]?'取消收藏':'收藏'}：${e(displayTitle(a))}" aria-pressed="${!!saved[a.id]}"><span class="save-icon">${saved[a.id]?'★':'☆'}</span>${saved[a.id]?'已收藏':'收藏'}</button><button data-copy="${e(a.id)}">复制链接</button><a href="${e(safeURL(a.url))}" target="_blank" rel="noopener noreferrer" data-read="${e(a.id)}">原文 ↗</a></div></div></article>`;
}
function miniItem(a){return `<li><a href="${e(articleLink(a))}">${e(displayTitle(a))}</a><div class="meta"><time>${e(shortTime(a))}</time><span>·</span><span>${e(a.source)}</span>${summaryBadge(a)}</div></li>`;}
function empty(title,text,link=newsLink()){return `<div class="empty"><strong>${e(title)}</strong>${e(text)}<br><a href="${e(link)}">查看近期资讯 →</a></div>`;}
function heading(title,subtitle,action=''){return `<div class="page-heading"><div><h1>${e(title)}</h1><p>${e(subtitle)}</p></div>${action}</div>`;}
function topicTabs(topic='all'){return `<div class="topic-tabs" role="group" aria-label="资讯频道"><button class="topic-tab ${topic==='all'?'active':''}" data-topic="all" aria-pressed="${topic==='all'}">全部</button>${Object.entries(TOPICS).map(([id,t])=>`<button class="topic-tab ${topic===id?'active':''}" data-topic="${id}" aria-pressed="${topic===id}">${t.name}<span class="sr-only"> · ${t.zh}</span></button>`).join('')}</div>`;}
function hotTags(){if(data.hotTags)return data.hotTags;const m=new Map();for(const a of recentItems().filter(a=>Date.now()-new Date(a.publishedAt)<86400000))for(const tag of a.tags||[]){if(!m.has(tag))m.set(tag,[]);m.get(tag).push(a);}return [...m].map(([tag,articles])=>({tag,count:articles.length,sourceCount:new Set(articles.map(a=>a.sourceId)).size,articles:articles.slice(0,4)})).sort((a,b)=>b.count-a.count);}
function renderHome(){return renderNews({home:true});}
function summaryStatus(){const s=data.summaryService;if(!s)return '<p class="method-note">中文摘要服务等待首次运行。</p>';return `<div class="summary-status"><span class="summary-badge">中文摘要</span><span>近期英文资讯已覆盖 ${num(s.recentSummarized)} / ${num(s.recentEnglish)} 条 · 分批补充${s.status==='error'?' · 最近生成失败，保留已有摘要':''}</span><a href="#/about">生成规则 ↗</a></div>`;}
function newsPool(){const date=route.params.get('date');return date?(archiveCache.get(date)||[]):data.articles;}
function filteredNews(){
  const p=route.params,topic=p.get('topic')||'all',kind=p.get('kind')||'',sid=p.get('source')||'',q=(p.get('q')||'').toLowerCase(),tag=p.get('tag')||'';
  let items=(route.name==='saved'?Object.values(saved):newsPool()).filter(a=>visible(a)&&matchesTopic(a,topic)&&(!kind||(a.kind||source(a.sourceId)?.kind)===kind)&&(!sid||a.sourceId===sid)&&(p.get('zh')!=='1'||a.language==='zh'||a.summaryZh)&&(!tag||(a.tags||[]).includes(tag))&&(!q||`${a.title} ${a.titleZh||''} ${a.summaryZh||''} ${a.source} ${a.excerpt||''}`.toLowerCase().includes(q)));
  const section=p.get('section');if(section&&sectionDefinitions(topic).some(s=>s.id===section))items=items.filter(a=>sectionFor(a,topic)?.id===section);
  items=items.sort(byDate);
  if(p.get('mode')==='selected')items=pickDiverse(items,60,3).sort(byDate);
  return items;
}
function aside(){const counts={};for(const a of recentItems())counts[a.source]=(counts[a.source]||0)+1;return `<aside class="news-aside"><section class="aside-section"><h2>多源阅读站</h2><div class="aside-number">${num(data.stats.totalArticles)}<small>条已留档</small></div><p>最近 90 天已采集记录。近期索引按频道保留；选择日期可查看当日完整留档。</p></section><section class="aside-section"><h2>近期收录较多的来源</h2>${Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,count])=>`<div class="aside-source"><span>${e(name)}</span><span>${count}</span></div>`).join('')}<a class="aside-link" href="#/sources">查看全部 ${data.sources.length} 个信源 →</a></section><section class="aside-section"><h2>阅读提示</h2><p>“多源编排”优先中文、时效和来源多样性，并隐藏预发布版本。它不代表人工审核或模型判断。<br><br>标有“AI 中文摘要”的条目由开源模型生成，仅依据标题和来源短摘录；未覆盖条目保留原文。</p><a class="aside-link" href="#/about">编排规则 →</a></section></aside>`;}
function renderSavedNews(){
  const p=route.params,topic=p.get('topic')||'all',isSaved=route.name==='saved',date=p.get('date')||'',mode=p.get('mode')||'latest',items=filteredNews();
  const parts=[];let previousDate='';
  for(const a of items.slice(0,pageLimit)){if(a.date!==previousDate){parts.push(`<div class="list-date"><span>${e(a.date)}${a.date===chinaDate()?' · 今天':''}</span><span>北京时间</span></div>`);previousDate=a.date;}parts.push(newsItem(a));}
  return heading(isSaved?'我的收藏':topic==='hk'?'港股资讯':topic==='stocks'?'美股资讯':'资讯，按你的节奏读。',isSaved?'收藏包含文章快照，保存在当前浏览器，不跨设备同步。':topic==='hk'?'恒生指数、港股公司动态、港交所公告与互联互通 · 按北京时间倒序。':topic==='stocks'?'市场新闻、公司财报与公告、美国政策监管 · 按北京时间倒序。':'AI、市场、美股、港股、产品、工具、研究与 Web3，回到原始出处。',`<button class="quiet-button" id="refresh-data">↻ 刷新数据</button>`)+topicTabs(topic)+`<div class="news-layout"><div class="news-main"><div class="toolbar">${!isSaved?`<div class="segmented" role="group" aria-label="编排方式"><button data-mode="latest" class="${mode==='latest'?'active':''}" aria-pressed="${mode==='latest'}">最新</button><button data-mode="selected" class="${mode==='selected'?'active':''}" aria-pressed="${mode==='selected'}">多源编排</button></div>`:''}<label class="check-label"><input type="checkbox" id="chinese-only" ${p.get('zh')==='1'?'checked':''}>中文可读</label><label class="sr-only" for="news-kind">来源类型</label><select id="news-kind"><option value="">全部类型</option>${Object.entries(KIND).map(([k,v])=>`<option value="${k}" ${p.get('kind')===k?'selected':''}>${v}</option>`).join('')}</select>${!isSaved?`<label class="sr-only" for="news-date">查看历史日期</label><input type="date" id="news-date" value="${e(date)}" max="${chinaDate()}" min="${e(data.archives.at(-1)?.date||'')}">`:''}<span class="count-label">当前 ${num(items.length)} 条</span></div><div class="inline-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="list-search" type="search" aria-label="搜索当前列表" placeholder="搜索当前列表，按 Enter 确认" value="${e(p.get('q')||'')}"></div>${p.get('tag')?`<div class="notice">当前话题：#${e(p.get('tag'))} <a class="text-link" href="${e(newsLink({topic}))}">清除筛选 ×</a></div>`:''}<p class="method-note">${date?e(date)+' 的完整收录。':'当前为各频道近期索引；历史完整内容请按日期查阅。'}分类来自关键词规则。AI 中文摘要单独标记，其余为发布方摘录。</p>${topic==='hk'?'<p class="method-note">港交所来源为交易所新闻稿和市场通告，暂未接入全部上市公司披露。香港电台财经按关键词归入港股；香港来源保留繁体中文。</p>':''}${topic==='stocks'?'<p class="method-note stock-note">公司公告标注官方来源；全球财经来源按美股关键词归类。部分原文可能需要订阅，本站保留标题、短摘录与原文入口。</p>':''}${parts.length?parts.join(''):empty(isSaved?'好内容，慢慢留下来。':'当前条件下没有资讯。',isSaved?'点击任意资讯旁的 ☆ 收藏。':'可以切换日期、语言或来源类型。')}${items.length>pageLimit?'<button class="more-button" id="load-more">再看 24 条 ↓</button>':''}</div>${aside()}</div>`;
}
// Module membership is exclusive; the latest panel is taken out of category rows.
const boardText = a => `${a.originalTitle||a.title} ${a.titleZh||''}`;
function sectionDefinitions(topic){
  const match=pattern=>a=>pattern.test(boardText(a));
  const official=a=>(a.kind||source(a.sourceId)?.kind)==='official';
  const market=match(/股市|恒指|恆指|恒生|恆生|恒科|科指|南向|北水|收市|收盘|收盤|开盘|開市|盘后|盤後|盘前|標普|标普|纳斯达克|納斯達克|道琼斯|道瓊斯|s&p|nasdaq|dow jones|stock market|futures|premarket|pre-market|market today/i);
  const company=match(/股價|股价|控股|集團|集团|騰訊|腾讯|美團|美团|阿里|中人壽|中國人壽|中国人寿|國泰|国泰|聯想|联想|小米|股份|财报|財報|业绩|業績|盈利|營收|营收|股權|股权|配股|招股|新股|上市|收购|收購|并购|併購|回购|回購|分红|派息|earnings|revenue|profit|dividend|buyback|guidance|acqui\w*|merger|\bipo\b/i);
  const definitions={
    hk:[['market','盘面与资金',a=>!official(a)&&market(a)],['companies','公司与财报',a=>!String(a.sourceId||'').startsWith('hkex-')&&company(a)],['official','交易所与市场公告',official],['context','宏观与市场观察',()=>true]],
    stocks:[['market','指数与盘前动态',market],['companies','财报与公司动态',company],['official','政策与官方公告',official],['context','行业与市场观察',()=>true]],
    ai:[['models','模型与技术进展',match(/模型|model|reasoning|推理|multimodal|多模态|benchmark|训练|training/i)],['products','产品与智能体',match(/agent|智能体|工具|产品|coding|code|编程|launch|发布|release/i)],['official','官方动态',official],['context','产业与观点',()=>true]],
    invest:[['policy','政策与监管',official],['market','市场与资金',market],['companies','公司与财报',company],['context','宏观与投资观察',()=>true]],
    biz:[['companies','融资与公司动态',match(/融资|收购|财报|营收|公司|funding|acqui\w*|revenue|earnings|startup/i)],['products','产品与增长',match(/产品|增长|用户|运营|product|growth|launch|subscription/i)],['views','商业观点',a=>a.kind==='community'],['context','行业观察',()=>true]],
    ship:[['security','安全与漏洞',a=>a.changeType==='安全'||/security|vulnerability|\bcve\b|漏洞|安全/.test(boardText(a).toLowerCase())],['releases','版本与更新',a=>!!a.changeType||/release|版本|更新|升级/i.test(boardText(a))],['official','官方工具动态',official],['context','工程与实践',()=>true]],
    research:[['papers','论文与预印本',a=>a.kind==='research'],['labs','实验室与机构',official],['context','研究解读',()=>true]],
    crypto:[['policy','监管与机构',match(/监管|監管|\bsec\b|regulat|institution|\betf\b/i)],['protocols','协议与官方动态',official],['market','市场与资金',match(/价格|资金|上涨|下跌|bitcoin|\bbtc\b|market|price|fund|million|billion/i)],['context','生态与研究',()=>true]],
  };
  return (definitions[topic]||[]).map(([id,title,test])=>({id,title,test}));
}
function sectionFor(article,topic){return sectionDefinitions(topic).find(section=>section.test(article));}
function boardLink(values={}){const p=Object.fromEntries(route.params);delete p.section;delete p.view;return newsLink({...p,...values});}
function moduleRow(a,{lead=false}={}){
  return `<li class="module-row ${reads.includes(a.id)?'read':''}"><div class="module-row-meta"><time datetime="${e(a.publishedAt)}">${e(shortTime(a))}${a.dateType==='updated'?' · 更新':''}</time><span>${e(a.source)}</span>${a.summaryZh?'<span class="module-zh">中文摘要</span>':''}</div><h3><a href="${e(articleLink(a))}">${e(displayTitle(a))}</a></h3>${lead&&(a.summaryZh||a.excerpt)?`<p>${e(summary(a))}</p>`:''}<div class="module-row-actions"><button data-save="${e(a.id)}" class="${saved[a.id]?'saved':''}" aria-label="${saved[a.id]?'取消收藏':'收藏'}：${e(displayTitle(a))}" aria-pressed="${!!saved[a.id]}">${saved[a.id]?'★':'☆'}</button><a href="${e(safeURL(a.url))}" target="_blank" rel="noopener noreferrer" data-read="${e(a.id)}">原文 ↗</a></div></li>`;
}
function newsModule({id,title,subtitle='',items,total,href,lead=false}){
  return `<section class="news-module ${lead?'module-lead':''}" id="module-${e(id)}" aria-label="${e(title)}"><header><div><h2>${e(title)}</h2>${subtitle?`<span>${e(subtitle)}</span>`:''}</div><span class="module-total">${num(total)} 条</span></header>${items.length?`<ul class="module-rows">${items.map(a=>moduleRow(a,{lead})).join('')}</ul>`:'<p class="module-empty">当前筛选下暂无本类内容。</p>'}<a class="module-more" aria-label="${e(lead?'查看完整时间线':'查看'+title+'全部资讯')}" href="${e(href)}">${lead?'完整时间线':'查看全部'} <span aria-hidden="true">→</span></a></section>`;
}
function renderNewsBoard(items,topic){
  const seen=new Set(),take=(pool,n)=>pool.filter(a=>!seen.has(a.id)).slice(0,n).map(a=>{seen.add(a.id);return a;});
  if(topic==='all'||!TOPICS[topic]){
    const order=['ai','stocks','hk','invest','biz','ship','research','crypto'];
    const modules=order.map(id=>{const pool=items.filter(a=>matchesTopic(a,id));return newsModule({id,title:TOPICS[id].zh,subtitle:TOPICS[id].intro,items:take(pool,6),total:pool.length,href:boardLink({topic:id})});});
    const latest=take(items,6);
    return `<div class="news-board all-channels">${modules.join('')}${newsModule({id:'latest',title:'更多动态',subtitle:'其他近期收录 · 北京时间',items:latest,total:items.length,href:boardLink({view:'timeline',topic:''})})}</div>`;
  }
  const latest=take(items,4),defs=sectionDefinitions(topic);
  const lead=newsModule({id:'latest',title:'最新动态',subtitle:'北京时间 · 新到旧',items:latest,total:items.length,href:boardLink({view:'timeline'}),lead:true});
  const modules=defs.map(def=>{const pool=items.filter(a=>sectionFor(a,topic)?.id===def.id);return newsModule({id:def.id,title:def.title,subtitle:'按时间倒序',items:take(pool,5),total:pool.length,href:boardLink({view:'timeline',section:def.id})});});
  return `<div class="news-board channel-board">${lead}${modules.join('')}</div>`;
}
function renderNews({home=false}={}){
  if(route.name==='saved')return renderSavedNews();
  const p=route.params,topic=p.get('topic')||'all',date=p.get('date')||'',items=filteredNews(),timeline=p.get('view')==='timeline',mode=p.get('mode')||'latest';
  const title=home?'今天，值得看什么。':topic==='all'?'资讯总览':(TOPICS[topic]?.zh||'资讯总览');
  const intro=home?'AI、市场与商业，分区浏览，一页看全。':TOPICS[topic]?.intro||'八个频道，同一页看见不同领域的变化。';
  const kpis=home?`<div class="board-kpis"><span><b>${Object.keys(TOPICS).length}</b> 个频道</span><span><b>${num(data.sources.length)}</b> 个订阅入口</span><span><b>${num(data.archives.find(a=>a.date===chinaDate())?.count)}</b> 条今日收录</span><span>每小时更新 · 北京时间</span></div>`:'';
  const controls=`<div class="board-controls"><div class="board-controls-main"><div class="segmented" role="group" aria-label="展示方式"><button data-view="modules" class="${!timeline?'active':''}" aria-pressed="${!timeline}">模块总览</button><button data-view="timeline" class="${timeline?'active':''}" aria-pressed="${timeline}">时间线</button></div><details class="board-filter-details" ${window.matchMedia('(min-width:761px)').matches?'open':''}><summary>筛选${p.get('kind')||p.get('date')||p.get('zh')?' · 已选':''}</summary><div class="board-advanced"><label class="check-label"><input type="checkbox" id="chinese-only" ${p.get('zh')==='1'?'checked':''}>中文可读</label><label class="sr-only" for="news-kind">来源类型</label><select id="news-kind"><option value="">全部类型</option>${Object.entries(KIND).map(([k,v])=>`<option value="${k}" ${p.get('kind')===k?'selected':''}>${v}</option>`).join('')}</select><label class="sr-only" for="news-date">查看历史日期</label><input type="date" id="news-date" value="${e(date)}" max="${chinaDate()}" min="${e(data.archives.at(-1)?.date||'')}"></div></details><span class="count-label">当前 ${num(items.length)} 条</span></div><div class="inline-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="list-search" type="search" aria-label="搜索当前列表" placeholder="搜索当前页所有模块，按 Enter 确认" value="${e(p.get('q')||'')}"></div></div>`;
  const section=sectionDefinitions(topic).find(s=>s.id===p.get('section'));
  const filterNote=p.get('tag')||section?`<div class="notice">当前筛选：${e(section?.title||'#'+p.get('tag'))} <a class="text-link" href="${e(boardLink({view:timeline?'timeline':'',tag:''}))}">清除筛选 ×</a></div>`:'';
  const notes=`<div class="board-note"><span>${date?e(date)+' 完整归档':'近期索引 · 历史内容可按日期查看'} · 模块内按时间倒序</span><span>AI 中文摘要单独标记 · 仅有日期时不补造时分</span></div>`;
  let content;
  if(!items.length)content=empty('当前条件下没有资讯。','可以切换频道、日期、语言或关键词。');
  else if(!timeline)content=renderNewsBoard(items,topic);
  else{
    let previousDate='';const rows=[];
    for(const a of items.slice(0,pageLimit)){if(a.date!==previousDate){rows.push(`<div class="list-date"><span>${e(a.date)}${a.date===chinaDate()?' · 今天':''}</span><span>北京时间</span></div>`);previousDate=a.date;}rows.push(newsItem(a));}
    content=`<div class="news-layout"><div class="news-main"><div class="toolbar"><div class="segmented" role="group" aria-label="编排方式"><button data-mode="latest" class="${mode==='latest'?'active':''}" aria-pressed="${mode==='latest'}">最新</button><button data-mode="selected" class="${mode==='selected'?'active':''}" aria-pressed="${mode==='selected'}">多源编排</button></div><span class="method-note">按发布方时间由新到旧</span></div>${rows.join('')}${items.length>pageLimit?'<button class="more-button" id="load-more">再看 24 条 ↓</button>':''}</div>${aside()}</div>`;
  }
  const jumps=!timeline&&topic!=='all'?`<nav class="module-jumps" aria-label="模块导航"><button data-module-jump="latest">最新</button>${sectionDefinitions(topic).map(def=>`<button data-module-jump="${e(def.id)}">${e(def.title)}</button>`).join('')}</nav>`:'';
  const coverage=topic==='hk'?'<p class="board-coverage">港交所模块收录交易所新闻稿及市场通告；上市公司信息来自已接入媒体，暂未覆盖全部披露易公告。</p>':topic==='stocks'?'<p class="board-coverage">公司公告、政策与媒体报道分区展示；部分原文可能需要订阅。</p>':'';
  return `<div class="modular-page">${heading(title,intro,'<button class="quiet-button" id="refresh-data">↻ 刷新数据</button>')}${kpis}${topicTabs(topic)}${controls}${filterNote}${notes}${jumps}${content}${coverage}<div class="board-footer"><a href="#/fx">查看主流币种汇率 →</a><a href="#/daily">阅读昨日资讯报 →</a><a href="#/sources">查看全部信源与状态 →</a><a href="#/about">收录与摘要规则 →</a></div></div>`;
}

function yesterdayDate(now=new Date()){return chinaDate(new Date(now.getTime()-86400000));}
function dailyDate(){const date=route.params.get('date');return /^\d{4}-\d{2}-\d{2}$/.test(date||'')&&date<=yesterdayDate()?date:yesterdayDate();}
function editionStories(report){return (report.sections||[]).flatMap(s=>s.stories||[]);}
function editionRefs(ids,report){const all=editionStories(report);return `<span class="paper-citations">${[...new Set(ids||[])].map(id=>{const index=all.findIndex(a=>a.id===id),a=all[index];return a?`<a href="${e(articleLink(a))}" title="${e(a.source+' · '+displayTitle(a))}">[${index+1}] ${e(a.source)}</a>`:'';}).join(' ')}</span>`;}
function paperText(a){return a.text||a.summaryZh||a.excerpt||displayTitle(a);}
function paperStory(a,report,{lead=false}={}){return `<article class="paper-story ${lead?'paper-lead':''}"><div class="paper-story-meta"><time datetime="${e(a.publishedAt)}">${e(clock(a))}${a.dateType==='updated'?' · 更新':''}</time><span>${e(a.source)}</span>${a.summaryZh?'<span>AI 中文摘要</span>':''}</div><h${lead?'2':'3'}><a href="${e(articleLink(a))}">${e(displayTitle(a))}</a></h${lead?'2':'3'}><p>${e(paperText(a))}</p><div class="paper-story-links"><a href="${e(articleLink(a))}">出处与摘录 →</a><a href="${e(safeURL(a.url))}" target="_blank" rel="noopener noreferrer">原文 ↗</a></div></article>`;}
function fallbackEdition(date){
  const items=(archiveCache.get(date)||[]).filter(a=>!a.isPrerelease&&!a.isPromotional),used=new Set();
  const sections=Object.entries(TOPICS).map(([topic,t])=>{const pool=items.filter(a=>matchesTopic(a,topic)&&!used.has(a.id));const stories=pickDiverse(pool,3,1);stories.forEach(a=>used.add(a.id));return {topic,name:t.zh,count:pool.length,stories};}).filter(s=>s.stories.length);
  return {date,articleCount:items.length,sourceCount:new Set(items.map(a=>a.sourceId)).size,selectedCount:sections.reduce((n,s)=>n+s.stories.length,0),sections,summaryMode:'source_digest'};
}
function renderDaily(){
  const date=dailyDate(),topic=route.params.get('topic')||'all',report=editionCache.get(date)||fallbackEdition(date),all=editionStories(report),sections=report.sections.filter(s=>topic==='all'||s.topic===topic);
  const weekday=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',weekday:'long'}).format(new Date(date+'T12:00:00+08:00'));
  const controls=`<div class="paper-toolbar"><div class="daily-controls"><button class="quiet-button" data-day="prev" aria-label="前一期" ${date<=(data.archives.at(-1)?.date||date)?'disabled':''}>←</button><label class="sr-only" for="daily-date">日报报道日期</label><input type="date" id="daily-date" value="${e(date)}" max="${yesterdayDate()}" min="${e(data.archives.at(-1)?.date||'')}"><button class="quiet-button" data-day="next" aria-label="后一期" ${date>=yesterdayDate()?'disabled':''}>→</button><button class="quiet-button" data-yesterday>昨日版</button></div><div><span>按报道日期翻阅</span><button class="quiet-button" data-print-edition>打印 / 存为 PDF</button></div></div>`;
  const masthead=`<header class="paper-masthead"><div class="paper-masthead-top"><span>把昨天读懂，再开始今天。</span><span>ZHIXIN DAILY · 昨日资讯报</span></div><div class="paper-name"><span>多源<br>见闻</span><h1>知新日报</h1><span>一日<br>一报</span></div><div class="paper-dateline"><span>${e(date)} · ${e(weekday)} · 北京时间</span><span>报道区间 00:00—23:59</span><span>第 ${e(date.replaceAll('-',''))} 期</span></div></header>`;
  if(!all.length)return controls+`<div class="paper-edition">${masthead}${empty('这一期尚无可用资料。','日报只整理已收录的昨日及历史资讯，不补造新闻；请切换其他日期。',linkFor('daily',{date:yesterdayDate()}))}</div>`;
  const ai=report.summaryMode==='ai_synthesis'&&report.synthesis,synthesis=ai?report.synthesis:report.digest;
  const overview=topic==='all'?`<section class="paper-overview"><div><span class="paper-kicker">THE DAY IN BRIEF</span><h2>昨日总览</h2><span class="paper-label">${ai?'AI 综述':'来源摘编'}</span></div><div>${synthesis?.overview?`<p class="paper-overview-text">${e(synthesis.overview.text)}</p>${editionRefs(synthesis.overview.sourceIds,report)}`:`<p>本期从 ${num(report.articleCount)} 条当日收录中，按版块和来源分散选读 ${num(report.selectedCount)} 条。${report.sections.slice(0,3).map(s=>`${s.name}版关注“${displayTitle(s.stories[0])}”`).join('；')}。</p>${editionRefs(report.sections.slice(0,3).map(s=>s.stories[0].id),report)}`}</div></section>`:'';
  const lead=sections[0]?.stories[0],side=sections.flatMap(s=>s.stories.slice(0,1)).filter(a=>a.id!==lead?.id).slice(0,3);
  const front=lead?`<section class="paper-front"><div><div class="paper-kicker">本期焦点 · 自动选读</div>${paperStory(lead,report,{lead:true})}</div><aside class="paper-briefing"><h2>速读要点 <small>READ IN A MINUTE</small></h2>${side.map((a,i)=>`<article><span>0${i+1}</span><div><h3><a href="${e(articleLink(a))}">${e(displayTitle(a))}</a></h3><p>${e(paperText(a).slice(0,100))}${paperText(a).length>100?'…':''}</p>${editionRefs([a.id],report)}</div></article>`).join('')||'<p>本版完整摘录见下方。</p>'}</aside></section>`:'';
  const pages=sections.map((s,index)=>{const digest=synthesis?.sections.find(x=>x.topic===s.topic);const stories=s.stories.filter(a=>a.id!==lead?.id);return `<section class="paper-section" aria-label="${e(s.name)}版"><header><span>${String(index+1).padStart(2,'0')} / ${e(s.topic.toUpperCase())}</span><h2>${e(s.name)}</h2><a href="${e(newsLink({topic:s.topic,date}))}">本版收录 ${num(s.count)} 条 →</a></header><div class="paper-section-brief"><span class="paper-label">${ai&&digest?'AI 版块综述':'版块提要'}</span><p>${e(digest?digest.text:s.stories.slice(0,2).map(a=>paperText(a).slice(0,130)+(paperText(a).length>130?'…':'')).join(' '))}</p>${editionRefs(digest?digest.sourceIds:s.stories.slice(0,2).map(a=>a.id),report)}</div>${stories.map(a=>paperStory(a,report)).join('')}${!stories.length?'<p class="paper-small">本版焦点已在头版呈现。</p>':''}</section>`;}).join('');
  return `<div class="newspaper-page">${controls}<div class="paper-edition">${masthead}<div class="paper-statline"><span>当日收录 <b>${num(report.articleCount)}</b> 条</span><span>来源入口 <b>${num(report.sourceCount)}</b> 个</span><span>本期选读 <b>${num(report.selectedCount)}</b> 条</span><span>${ai?'免费开源模型辅助编写':'按来源摘录编排'}</span></div>${overview}<div class="paper-navigation">${topicTabs(topic)}</div>${front}<div class="paper-sections">${pages}</div><footer class="paper-colophon"><strong>知新日报 · 资料与编排说明</strong><p>本期回顾 ${e(date)} 北京时间全天已经收录的资讯；版块互斥分配，同标题去重，并分散来源选读，选读顺序不代表全网重要性排名。${ai?'“AI 综述”基于所引标题和短摘录生成，可能有误；':'总览与版块提要基于来源摘录压缩整理，保留原有中文摘要；'}每段保留出处，不将摘录视为独立核实。${report.generatedAt?'编排于 '+e(time(report.generatedAt,true))+'。':''}</p><p>日报为固定版面，资讯流的隐藏信源设置不改变已生成的日报。未收录内容不代表当天没有发生；英文内容按批次生成中文摘要。<a href="${e(newsLink({date}))}">查看当天完整收录 →</a></p></footer></div></div>`;
}
async function ensureEdition(date){
  if(editionCache.has(date))return;
  try{const response=await fetch(`./data/editions/${date}.json?t=${Date.now()}`,{cache:'no-store'});if(!response.ok)throw new Error('Edition unavailable');const report=await response.json();if(report.schemaVersion!==1||report.date!==date||!Array.isArray(report.sections))throw new Error('Invalid edition');editionCache.set(date,report);for(const a of editionStories(report))records.set(a.id,a);}
  catch{editionCache.set(date,null);await ensureArchive(date);}
}
function renderSources(){
  const p=route.params,query=(p.get('q')||'').toLowerCase();let list=data.sources.filter(s=>(!p.get('topic')||p.get('topic')==='all'||s.topic===p.get('topic'))&&(!p.get('kind')||s.kind===p.get('kind'))&&(!p.get('language')||s.language===p.get('language'))&&(!p.get('status')||s.status===p.get('status'))&&`${s.name} ${s.category} ${s.group}`.toLowerCase().includes(query));
  const stats=data.stats;
  const cards=list.map(s=>`<article class="source-card"><div class="source-title"><div><h2>${e(s.name)}</h2><p>${e(TOPICS[s.topic]?.zh||'')} · ${e(s.category)}</p></div><span class="status ${e(s.status)}">${s.status==='ok'?'● 正常':s.status==='quiet'?'○ 暂无近期内容':'○ 本次失败'}</span></div><div class="source-info">${e(KIND[s.kind]||'来源')} · ${({CN:'中国内地',HK:'香港',US:'美国'})[s.region]||'海外'} · ${s.language==='zh'?'中文':'英文'}<br>最近成功：${e(time(s.lastSuccessAt))}<br>本次近 90 天有效条目：${num(s.itemCount)} 条${s.status==='error'?'<br>保留历史内容，等待下次重试。':''}</div><div class="source-links"><a href="${e(safeURL(s.url))}" target="_blank" rel="noopener">官网 ↗</a><a href="${e(safeURL(s.feed))}" target="_blank" rel="noopener">${s.adapter==='rss'?'RSS':'发布页'} ↗</a><button data-mute="${e(s.id)}" class="${hiddenSources.includes(s.id)?'muted-source':''}" aria-pressed="${!hiddenSources.includes(s.id)}">${hiddenSources.includes(s.id)?'恢复显示':'已订阅 ✓'}</button></div></article>`).join('');
  return heading('从更丰富的来源，看同一个世界。','来源目录可筛选、可核对。订阅入口可能属于同一发布方，数量不代表独立机构数量。',`<a class="quiet-button" href="./sources.opml" download>导出 OPML ↓</a>`)+`<div class="source-stats"><div><b>${stats.configuredSources}</b><span>已配置订阅入口</span></div><div><b>${stats.healthySources}</b><span>本次读取有内容</span></div><div><b>${stats.activeSources7d}</b><span>近 7 天有发布</span></div><div><b>${stats.chineseSources}</b><span>中文订阅来源</span></div><div><b>${stats.organizations}</b><span>发布方分组</span></div></div><div class="notice">已订阅内容默认全部显示。点击“已订阅”可在当前浏览器隐藏该源，不会更改后台采集。${hiddenSources.length?` 已隐藏 ${hiddenSources.length} 个源。 <button class="quiet-button" id="restore-sources">恢复全部</button>`:''}<br>公开 RSS 和可读取的官方发布页持续采集。X 热帖监测见独立页面，需先配置官方 API；微信公众号、Telegram 及其他需要登录的来源尚未接入。</div>${topicTabs(p.get('topic')||'all')}<div class="source-tools"><input type="search" id="source-search" aria-label="搜索信源" placeholder="搜索来源名称或分类，按 Enter 确认" value="${e(p.get('q')||'')}"><label class="sr-only" for="source-kind">来源类型</label><select id="source-kind"><option value="">全部类型</option>${Object.entries(KIND).map(([k,v])=>`<option value="${k}" ${p.get('kind')===k?'selected':''}>${v}</option>`).join('')}</select><label class="sr-only" for="source-language">来源语言</label><select id="source-language"><option value="">全部语言</option><option value="zh" ${p.get('language')==='zh'?'selected':''}>中文</option><option value="en" ${p.get('language')==='en'?'selected':''}>英文</option></select><label class="sr-only" for="source-status">采集状态</label><select id="source-status"><option value="">全部状态</option><option value="ok" ${p.get('status')==='ok'?'selected':''}>采集正常</option><option value="quiet" ${p.get('status')==='quiet'?'selected':''}>暂无近期内容</option><option value="error" ${p.get('status')==='error'?'selected':''}>本次失败</option></select></div><p class="source-grid-count">当前显示 ${list.length} 个入口 · 最近采集 ${e(time(data.lastSuccessfulAt||data.generatedAt))}</p><div class="source-grid">${cards}</div>`;
}
function renderHot(){
  return heading('热点，先看站内证据。','按过去 24 小时收录标题的关键词频次排序；不代表全网热度或事件已获多方证实。')+`<div class="notice">同标题归并只匹配格式归一后相同的标题，并限制在 48 小时内。跨语言、同事件不同措辞暂不进行语义合并。</div><div class="hot-grid">${hotTags().slice(0,15).map((t,i)=>`<section class="hot-card"><div class="hot-card-top"><h2>${e(t.tag)}</h2><span class="hot-rank">${String(i+1).padStart(2,'0')}</span></div><p class="hot-count">${t.count} 条相关标题 · ${t.sourceCount} 个来源入口</p><ul class="mini-news">${t.articles.filter(visible).slice(0,3).map(miniItem).join('')}</ul><a class="channel-more" href="${e(newsLink({tag:t.tag}))}">查看相关资讯 →</a></section>`).join('')}</div>`;
}
function renderXProfiles(x){
  const profiles=x.candidates||[];if(!profiles.length)return '';
  const following=profiles.filter(p=>p.origin==='following'),extra=profiles.filter(p=>p.origin!=='following'),info=x.followingImport;
  const labels={ai:'AI',invest:'投资',crypto:'加密'};
  const cards=list=>`<div class="x-candidate-grid">${list.map(p=>`<article class="x-candidate"><div><span class="summary-badge">${e(labels[p.topic]||'观察')}</span><span class="candidate-pending">待粉丝数核验</span></div><h3><a href="${e(safeURL('https://x.com/'+p.username))}" target="_blank" rel="noopener">${e(p.name)} ↗</a></h3><a class="candidate-handle" href="${e(safeURL('https://x.com/'+p.username))}" target="_blank" rel="noopener">@${e(p.username)}</a><p>${e(p.focus)}</p><a class="text-link" href="${e(safeURL(p.referenceUrl))}" target="_blank" rel="noopener">公开资料 ↗</a></article>`).join('')}</div>`;
  const mine=info?`<section class="x-candidate-section"><h2>我的 X 关注 <small>${following.length} 个账号 · 已导入</small></h2><p class="method-note">来源：<a class="text-link" href="${e(safeURL(info?.sourceUrl))}" target="_blank" rel="noopener">@${e(info?.owner||'0xAPTX')} 的正在关注列表 ↗</a> · ${e(time(info?.importedAt,true))} 导入。<br>全部账号均保留在名单中；热帖检测另按粉丝数低于 10 万筛选。${x.followingSync?.status==='ok'?'已启用每半天同步，失败时保留上次完整名单。':'当前为导入快照；每半天同步流程已准备，尚未启用。'}</p><div class="x-following-grid">${following.map(p=>`<a class="x-following-account" href="${e(safeURL('https://x.com/'+p.username))}" target="_blank" rel="noopener"><strong>${e(p.name)}</strong><span>@${e(p.username)}</span><small>已关注 · 热帖资格待核验 ↗</small></a>`).join('')}</div></section>`:'';
  const syncStates={disabled:'未启用 · 不产生接口费用',not_configured:'等待 API 凭证和预算',ok:'最近同步成功',partial:'未获取完整列表，保留原名单',budget_limited:'预算不足，保留原名单',auth_error:'凭证或权限需检查，保留原名单',rate_limited:'接口限流，保留原名单',api_error:'接口读取失败，保留原名单',invalid_config:'配置需检查'};
  const sync=x.followingSync?`<div class="notice"><strong>每半天关注同步：${e(syncStates[x.followingSync.status]||'等待核对')}</strong><br>${e(x.followingSync.schedule)} · 最近成功：${e(time(x.followingSync.lastSuccessAt,true))}<br>由 GitHub Actions 执行；需要官方 API 凭证与已批准预算。同步与热帖采集分别启用。</div>`:'';
  return sync+mine+(extra.length?`<section class="x-candidate-section">${following.length?`<details class="x-extra-candidates"><summary>补充候选 <span>${extra.length} 个账号</span></summary>`:`<h2>候选观察名单 <small>${extra.length} 个账号</small></h2>`}<p class="method-note">按内容方向初选，粉丝数与账号可用性尚未通过官方 API 核验。</p>${cards(extra)}${following.length?'</details>':''}</section>`:'');
}
function renderX(){
  const x=xData||{},r=x.rule||{maxFollowersExclusive:100000,lookbackHours:48,minScore:50,followerScoreRatio:.005};
  const states={not_configured:'等待接入官方 API',ok:'最近采集成功',partial:'部分结果 · 达到分页上限或有账号未返回',budget_limited:'已达到本月程序用量上限',rate_limited:'API 限流，等待下次任务',auth_error:'API 凭证或权限需要检查',api_error:'最近读取失败，保留历史记录',unavailable:'监测数据暂时无法加载'};
  const all=(x.posts||[]).filter(p=>p.hot&&Number.isInteger(p.followersCount)&&p.followersCount<r.maxFollowersExclusive&&Date.now()-new Date(p.createdAt)<=r.lookbackHours*3600000).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const author=route.params.get('author')||'',items=all.filter(p=>!author||p.username.toLowerCase()===author.toLowerCase());
  const accounts=x.accounts||[];
  const rows=items.slice(0,pageLimit).map(p=>`<article class="x-post"><div class="x-post-heading"><a href="${e(safeURL('https://x.com/'+p.username))}" target="_blank" rel="noopener"><strong>${e(p.name)}</strong><span>@${e(p.username)} · ${num(p.followersCount)} 粉丝</span></a><time datetime="${e(p.createdAt)}">${e(time(p.createdAt,true))}</time></div><p class="x-post-text">${e(p.text)}</p><div class="x-metrics"><span>♡ ${num(p.likes)} 点赞</span><span>↻ ${num(p.reposts)} 转发</span><span>◌ ${num(p.replies)} 回复</span><span>引用 ${num(p.quotes)}</span>${p.impressions==null?'':`<span>${num(p.impressions)} 浏览</span>`}</div><div class="x-post-bottom"><span>热度分 ${num(p.score)} ≥ 门槛 ${num(p.threshold)} · 指标采样 ${e(time(p.metricsObservedAt))}<br>粉丝核验 ${e(time(p.followersObservedAt))}</span><a class="text-link" href="${e(safeURL(p.url))}" target="_blank" rel="noopener noreferrer">查看原帖 ↗</a></div></article>`).join('');
  return heading('X 热帖，小账号里的大信号。','关注粉丝数低于 10 万的指定账号，按原帖发布时间倒序。',`<button class="quiet-button" id="refresh-data">↻ 刷新数据</button>`)+`<div class="x-status"><span class="status">${e(states[x.status]||'状态待核对')}</span><span>最近成功：${e(time(x.lastSuccessAt,true))}</span></div><div class="notice">观察范围：指定账号近 ${r.lookbackHours} 小时的公开原创帖；排除回复和转发。粉丝数以采样时为准，未知或达到 ${num(r.maxFollowersExclusive)} 的账号不参与热帖筛选，仍保留在完整关注名单。<br>热度分 = 点赞 + 2×转发 + 回复 + 2×引用；门槛 = max(${r.minScore}, 粉丝数 × ${r.followerScoreRatio*100}%)。指标为采样累计值，不代表增长速度或全网热度。</div>${x.status==='not_configured'?`<section class="x-setup"><h2>${x.followingImport?'关注名单已导入，热帖采集暂未启用':x.watchlist?.length?'候选名单已准备，采集暂未启用':'监测页面已就绪，等待真实数据连接'}</h2><p>中文摘要继续采用免费方案。X 接口预算待定，付费采集保持关闭；接通还需要官方 API 凭证。当前没有实际热帖数据。</p><ol><li>${x.followingImport?'已导入 '+x.followingImport.count+' 个 X 关注账号，合计 '+x.watchlist.length+' 个观察账号。':x.watchlist?.length?'已预选 '+x.watchlist.length+' 个候选账号，可在仓库 <code>x-watchlist.json</code> 调整。':'在仓库 <code>x-watchlist.json</code> 填写关注账号。'}</li><li>把凭证存入 GitHub Actions Secret：<code>X_BEARER_TOKEN</code>。</li><li>确认预算后启用监测，并在 X 控制台设置消费限额。</li></ol><a class="text-link" href="https://github.com/0xAPTX/ai-daily/blob/main/docs/x-setup.md" target="_blank" rel="noopener">查看接入和费用说明 ↗</a></section>`:''}${renderXProfiles(x)}<div class="x-toolbar"><label for="x-author">观察账号</label><select id="x-author"><option value="">全部账号</option>${(x.watchlist||[]).map(n=>`<option value="${e(n)}" ${author===n?'selected':''}>@${e(n)}</option>`).join('')}</select><span class="method-note">${items.length} 条达到门槛的热帖 · 北京时间</span></div>${x.monitoringCapped?'<p class="method-note">完整名单超过 100 个账号，本轮热帖最多核验前 100 个；其余账号仍保留在名单中。</p>':''}${accounts.length?`<div class="x-accounts">${accounts.map(a=>`<span>@${e(a.username)} · ${a.followersCount==null?'粉丝数待核验':num(a.followersCount)+' 粉丝'} · ${a.eligible?'纳入观察':'未纳入'}</span>`).join('')}</div>`:''}${rows||`<div class="empty"><strong>${x.status==='not_configured'?'接通后，这里会出现热帖时间线。':'本次没有达到门槛的热帖。'}</strong>${x.status==='not_configured'?'账号、粉丝数、互动指标与原帖链接会一起展示。':'可检查账号状态、采样时间或调整观察账号。'}</div>`}${items.length>pageLimit?'<button class="more-button" id="load-more">继续查看 ↓</button>':''}${x.budget?`<p class="method-note">本月程序保守预估已预留 $${e(x.budget.reservedUsd)} / $${e(x.budget.limitUsd)}，实际费用及硬性限额以 X 控制台为准。</p>`:''}<p class="method-note">页面读取已发布的静态数据，打开网页不会触发 X 付费请求。后台由 GitHub Actions 每小时检查；接口失败会保留窗口内历史并标注状态。</p>`;
}
function renderArticle(){
  const id=route.parts[2],a=records.get(id)||saved[id];if(!a)return heading('内容暂时找不到。','这条资讯可能已超出留档期限。')+empty('可以回到资讯流继续阅读。','已收藏的文章快照会保存在当前浏览器。');
  const s=source(a.sourceId);if(!reads.includes(a.id)){reads.push(a.id);persist();}
  const originRows=(a.origins||[{sourceId:a.sourceId,source:a.source}]).map(o=>`<div><span>收录入口</span><b>${e(o.source)}${source(o.sourceId)?.kind==='research'?' · 研究/论文订阅':''}</b></div>`).join('');
  const peers=a.sameTitleGroup?[...records.values()].filter(x=>x.sameTitleGroup===a.sameTitleGroup&&x.id!==a.id):[];
  return `<article class="article-page"><a class="back-link" href="${e(newsLink({topic:topics(a)[0]}))}">← 返回资讯</a><h1>${e(displayTitle(a))}</h1><div class="article-meta">${sourceBadge(a)}<span>${e(a.source)}</span><time>${a.datePrecision==='day'?e(a.date):e(time(a.publishedAt,true))} ${a.dateType==='updated'?'更新':'发布'}</time><span>${a.language==='zh'?'中文原文':'英文原文'}</span></div><h2>${a.summaryZh?'AI 中文摘要':'发布方摘录'}</h2><p class="article-excerpt">${e(summary(a))}</p>${a.summaryZh?`<p class="method-note">${e(a.summaryModel)} · ${e(time(a.summarizedAt,true))} 生成 · ${a.summaryBasis==='title_only'?'仅依据标题转述':'依据标题与来源短摘录'}，请结合原文核对。</p><details class="original-excerpt"><summary>查看原始标题与发布方摘录</summary><h3>${e(a.title)}</h3><p>${e(a.excerpt||'来源未提供摘录。')}</p></details>`:''}${a.originalTitle?`<p class="original-title">原始标题：${e(a.originalTitle)}</p>`:''}<p class="method-note">摘要和摘录均不等于独立核实。模型未读取文章全文，请打开原文阅读完整上下文与适用条件。</p><div class="article-actions"><a class="primary-button" href="${e(safeURL(a.url))}" target="_blank" rel="noopener noreferrer" data-read="${e(a.id)}">阅读原文 ↗</a><button class="quiet-button ${saved[a.id]?'saved':''}" data-save="${e(a.id)}" aria-pressed="${!!saved[a.id]}">${saved[a.id]?'★ 已收藏':'☆ 收藏'}</button><button class="quiet-button" data-copy="${e(a.id)}">复制本站链接</button></div><div class="tag-cloud">${tagLinks(a)}</div><h2>来源与记录</h2><div class="provenance-table"><div><span>原文出处</span><b><a href="${e(safeURL(a.url))}" target="_blank" rel="noopener">${e(a.url)}</a></b></div><div><span>来源类型</span><b>${e(KIND[a.kind]||KIND[s?.kind]||'来源原文')}</b></div>${originRows}<div><span>归类</span><b>${topics(a).map(t=>e(TOPICS[t]?.zh||t)).join(' / ')} · ${e(a.category)}</b></div><div><span>时间依据</span><b>${a.dateType==='updated'?'订阅源更新时间（未提供原始发布日期）':'发布方提供的原始发布日期'}${a.datePrecision==='day'?' · 精确到日':''} · 北京时间展示</b></div></div>${peers.length?'<h2>同标题收录</h2><ul class="mini-news">'+peers.map(miniItem).join('')+'</ul>':''}</article>`;
}
function renderAbout(){return heading('让来源更广，让判断有据。','知新是一座个人多源阅读站。')+`<div class="prose"><h2>参考了什么</h2><p>借鉴 <a class="text-link" href="https://wqu.guru/" target="_blank" rel="noopener">wqu.guru</a> 的多频道首页、资讯流与日报组织方式。本站内容直接从列出的公开来源收录，不复制参考站的新闻综述、排名或课程。</p><h2>覆盖什么</h2><p>AI 动态、投资市场、美股资讯、港股资讯、产品商业、开发工具、学术研究、加密 Web3 八个频道。每个订阅入口在信源目录中展示实际采集状态、类型和语言；多个入口可能属于同一发布方。</p><h2>如何编排</h2><ul><li>“最新”按发布方提供的时间排列；没有发布时间但有更新时间时，明确标为更新。</li><li>“多源编排”在时效基础上优先中文，限制单一来源数量，隐藏预发布版本。它不代表人工精选或重要性评分。</li><li>同一原始链接只保留一条；arXiv 同一论文的分类订阅合并。格式归一后标题完全相同、时间相近的记录，可显示多个发布方。跨语言的同事件不同标题尚未语义合并。</li><li>话题与跨频道分类来自关键词规则，可能有误；热点依据站内过去 24 小时标题计数。</li></ul><h2>中文与摘要</h2>${summaryStatus()}<p>GitHub Actions 使用 Qwen3-4B-Instruct-2507 开源模型在 runner 内生成中文标题和短摘要，不需要付费模型 API 或个人 token。仅输入原始标题与发布方短摘录，没有读取全文。每次有限额，优先处理近期内容；未处理或失败的条目保留原文。AI 中文摘要可能有误，原始标题、摘录和出处始终保留。</p><h2>昨日资讯报</h2><p>日报默认回顾北京时间昨天已收录的资讯，按来源与版块分散选读，呈现头版、昨日总览和版块摘要。AI 综述只基于所引标题与短摘录，保留出处编号；未生成时使用来源摘编，往期可以按日期翻阅。</p><h2>留档、更新与收藏</h2><p>保留最近 90 天已采集记录；初次接入能取得的历史受来源订阅长度限制。首页加载各频道近期索引，完整内容按日加载。计划每小时采集一次，GitHub 调度可能延迟；静态网页打开时读取最新已发布数据。</p><p>单源失败保留历史；全部来源失败时停止该次发布。收藏、已读和隐藏来源只保存在当前浏览器。清除网站数据会移除这些记录。已收藏的文章保留快照，可从收藏页面导出备份。</p><h2>尚未接入的范围</h2><p>X 监测程序已准备，实际接入状态见 X 热帖页面；它需要官方 API 凭证、账号清单和用量预算。微信公众号、Telegram 及其他需要登录的站点尚未接入。Qwen 当前官方博客暂未找到稳定的可读取日期接口；相关动态目前由已接入的媒体与研究来源覆盖。官方、媒体和社区观点均需结合上下文核对。</p></div>`;}
async function ensureArchive(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||archiveCache.has(date))return;
  const entry=data.archives.find(x=>x.date===date);if(!entry){archiveCache.set(date,[]);return;}
  const response=await fetch(`./data/archive/${date}.json`);if(!response.ok)throw new Error('Archive unavailable');const value=await response.json();if(!Array.isArray(value.articles))throw new Error('Invalid archive');archiveCache.set(date,value.articles);for(const a of value.articles)records.set(a.id,a);
}
function updateShell(){
  $('#saved-count').textContent=Object.keys(saved).length;
  document.querySelectorAll('[data-nav]').forEach(a=>{const active=a.dataset.nav===route.name;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  document.querySelectorAll('[data-mobile]').forEach(a=>a.classList.toggle('active',a.dataset.mobile===route.name));
  const healthy=data.stats.healthySources,quiet=data.stats.quietSources,failed=data.sources.length-healthy-quiet;
  $('#live-status').textContent=`${healthy} 个来源读取有内容${failed?' · '+failed+' 个本次未成功':''} · 最近采集 ${time(data.lastSuccessfulAt||data.generatedAt)}`;
}
async function renderRoute({keepScroll=false}={}){
  if(!data)return;route=getRoute();
  // Keep the public homepage URL clean without changing deep links or filters.
  if(location.hostname==='aptx.dev'&&location.pathname==='/'&&route.name==='home'&&!route.params.size&&location.hash){
    history.replaceState(history.state,'',location.pathname+location.search);
  }
  const version=++routeVersion;updateShell();
  try{
    if(route.name==='fx'){if(!FX.ready(route.params))$('#main').innerHTML='<div class="loading" role="status">正在读取汇率与历史走势，首次加载可能稍久…</div>';try{await FX.load(false,route.params);}catch{}}
    let date=route.params.get('date');if(route.name==='daily'){date=dailyDate();await ensureEdition(date);}if(route.name==='article')date=route.parts[1];
    if(date&&route.name!=='daily'&&!archiveCache.has(date)){$('#main').innerHTML='<div class="loading">正在读取日期归档…</div>';await ensureArchive(date);}
    if(route.name==='x'&&!xData){try{const r=await fetch('./data/x-feed.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error();xData=await r.json();}catch{xData={status:'unavailable',posts:[],accounts:[],watchlist:[]};}}
    if(version!==routeVersion)return;
    const renderers={home:renderHome,news:renderNews,fx:()=>FX.render(route.params),daily:renderDaily,sources:renderSources,hot:renderHot,x:renderX,article:renderArticle,saved:renderNews,about:renderAbout};
    $('#main').innerHTML=(renderers[route.name]||(()=>heading('这个页面还没有内容。','请从首页继续阅读。')))();
    if(route.name==='fx')FX.bindChart();
    if(route.name==='saved')$('#main').insertAdjacentHTML('beforeend','<button class="more-button" id="export-saved">导出收藏备份 JSON ↓</button>');
    document.title=({home:'知新 · 多源资讯，每日有新知',news:route.params.get('topic')==='hk'?'港股资讯 · 知新':route.params.get('topic')==='stocks'?'美股资讯 · 知新':'资讯流 · 知新',daily:dailyDate()+' · 知新日报',fx:'主流币种汇率 · 知新',hot:'站内热点 · 知新',x:'X 热帖监测 · 知新',sources:'完整信源目录 · 知新',saved:'我的收藏 · 知新',article:'原文与出处 · 知新',about:'收录规则 · 知新'})[route.name]||'知新';
    if(!keepScroll)window.scrollTo({top:0,behavior:'instant'});
  }catch{$('#main').innerHTML=heading('这份归档暂时无法加载。','请检查网络后重试。')+'<button class="more-button" id="retry-route">重新读取</button>';}
}
async function loadData(){
  const response=await fetch(`./data/feed.json?t=${Date.now()}`,{cache:'no-store'});if(!response.ok)throw new Error('Data unavailable');const value=await response.json();if(value.schemaVersion!==2||!Array.isArray(value.articles)||!Array.isArray(value.sources)||!value.stats)throw new Error('Unsupported feed');
  data=value;xData=null;records.clear();archiveCache.clear();editionCache.clear();for(const a of data.articles)records.set(a.id,a);for(const t of data.hotTags||[])for(const a of t.articles||[])records.set(a.id,a);
  for(const a of Object.values(saved)){if(!a||!a.id||!a.title)continue;const fresh=records.get(a.id);if(fresh)saved[a.id]=fresh;else if(!a.topics)a.topics=[source(a.sourceId)?.topic||'ai'];records.set(a.id,saved[a.id]);}
  await renderRoute();
}
function searchResults(){const q=$('#global-search').value.trim().toLowerCase();const items=q?[...records.values()].filter(a=>visible(a)&&`${a.title} ${a.titleZh||''} ${a.summaryZh||''} ${a.source} ${(a.tags||[]).join(' ')}`.toLowerCase().includes(q)).sort(byDate).slice(0,12):[];$('#global-results').innerHTML=q?(items.map(a=>`<a class="search-result" href="${e(articleLink(a))}" data-search-result>${e(displayTitle(a))}<small>${e(a.source)} · ${e(shortTime(a))}</small></a>`).join('')||'<p class="method-note">没有匹配结果，可以在资讯页切换日期继续查找。</p>'):'<p class="method-note">试试 OpenAI、DeepSeek、融资、产品增长或 Bitcoin。</p>';}
function openSearch(){$('#search-dialog').showModal();$('#global-search').focus();searchResults();}
function findArticle(id){return records.get(id)||saved[id];}
function shiftDay(direction){const date=route.name==='daily'?dailyDate():(route.params.get('date')||chinaDate());const d=new Date(date+'T12:00:00+08:00');d.setUTCDate(d.getUTCDate()+(direction==='next'?1:-1));updateParams({date:chinaDate(d)});}
document.addEventListener('click',async event=>{
  const t=event.target;
  const fxFrom=t.closest('[data-fx-from]');if(fxFrom){updateParams({from:fxFrom.dataset.fxFrom});return;}
  const fxPeriod=t.closest('[data-fx-period]');if(fxPeriod){updateParams({period:fxPeriod.dataset.fxPeriod});return;}
  if(t.closest('#fx-swap')){const a=$('#fx-convert-from'),b=$('#fx-convert-to');[a.value,b.value]=[b.value,a.value];FX.convert();return;}
  if(t.closest('#fx-refresh,[data-fx-retry]')){const button=t.closest('#fx-refresh,[data-fx-retry]');button.disabled=true;try{await FX.load(true,route.params);await renderRoute({keepScroll:true});toast('已读取最新发布的汇率数据。');}catch{button.disabled=false;toast('汇率暂时无法读取，请稍后重试。');}return;}
  if(t.closest('.skip')){event.preventDefault();$('#main').focus();$('#main').scrollIntoView({behavior:'instant'});return;}
  const topic=t.closest('[data-topic]');if(topic){pageLimit=24;updateParams({topic:topic.dataset.topic==='all'?'':topic.dataset.topic,section:''});return;}
  const jump=t.closest('[data-module-jump]');if(jump){document.getElementById('module-'+jump.dataset.moduleJump)?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  const view=t.closest('[data-view]');if(view){pageLimit=24;updateParams({view:view.dataset.view==='modules'?'':'timeline',section:''});return;}
  const mode=t.closest('[data-mode]');if(mode){updateParams({mode:mode.dataset.mode==='latest'?'':mode.dataset.mode});return;}
  const save=t.closest('[data-save]');if(save){const id=save.dataset.save;if(saved[id]){delete saved[id];toast('已取消收藏');}else{const a=findArticle(id);if(a)saved[id]=a;toast(storageOK?'已收藏 · 保存在当前浏览器':'已加入本次收藏');}persist();await renderRoute({keepScroll:true});return;}
  const copy=t.closest('[data-copy]');if(copy){const a=findArticle(copy.dataset.copy);if(a){const url=new URL(location.href);url.hash=articleLink(a).slice(1);try{await navigator.clipboard.writeText(url.href);toast('链接已复制');}catch{toast('复制不可用，可打开详情后复制浏览器地址。');}}return;}
  const read=t.closest('[data-read]');if(read&&!reads.includes(read.dataset.read)){reads.push(read.dataset.read);persist();}
  const mute=t.closest('[data-mute]');if(mute){const id=mute.dataset.mute;if(hiddenSources.includes(id))hiddenSources=hiddenSources.filter(x=>x!==id);else hiddenSources.push(id);persist();await renderRoute({keepScroll:true});return;}
  if(t.closest('#restore-sources')){hiddenSources=[];persist();renderRoute({keepScroll:true});}
  const day=t.closest('[data-day]');if(day){shiftDay(day.dataset.day);return;}
  if(t.closest('[data-yesterday]')){updateParams({date:yesterdayDate()});return;}
  if(t.closest('[data-print-edition]')){window.print();return;}
  if(t.closest('#load-more')){pageLimit+=24;renderRoute({keepScroll:true});return;}
  if(t.closest('#refresh-data')){const button=t.closest('#refresh-data');button.disabled=true;try{await loadData();toast('已读取最新发布数据；后台计划每小时采集。');}catch{toast('暂时无法刷新，请稍后重试。');button.disabled=false;}}
  if(t.closest('#retry-route'))renderRoute();
  if(t.closest('#retry-data'))start();
  if(t.closest('[data-search-result]'))$('#search-dialog').close();
  if(t.closest('#export-saved')){const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),articles:Object.values(saved)},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='zhixin-bookmarks-'+chinaDate()+'.json';a.click();URL.revokeObjectURL(url);}
});
document.addEventListener('change',event=>{
  const t=event.target;
  if(t.id==='fx-quote'){updateParams({quote:t.value});return;}
  if(t.id==='fx-convert-from'||t.id==='fx-convert-to'){FX.convert();return;}
  const mappings={'news-kind':'kind','news-date':'date','daily-date':'date','source-kind':'kind','source-language':'language','source-status':'status','x-author':'author'};
  if(mappings[t.id]){pageLimit=24;updateParams({[mappings[t.id]]:t.value});}
  if(t.id==='chinese-only')updateParams({zh:t.checked?'1':''});
});
document.addEventListener('input',event=>{if(event.target.id==='fx-amount')FX.convert();});
document.addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openSearch();return;}
  if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){event.preventDefault();openSearch();}
  if(event.key==='Enter'&&event.target.id==='list-search')updateParams({q:event.target.value.trim()});
  if(event.key==='Enter'&&event.target.id==='source-search')updateParams({q:event.target.value.trim()});
});
$('#open-search').addEventListener('click',openSearch);$('#close-search').addEventListener('click',()=>$('#search-dialog').close());$('#global-search').addEventListener('input',searchResults);
$('#search-dialog').addEventListener('click',event=>{if(event.target===$('#search-dialog'))$('#search-dialog').close();});
$('#theme-toggle').addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('zhixin-theme',JSON.stringify(next));}catch{}});
window.addEventListener('hashchange',()=>{pageLimit=24;renderRoute();});
$('#year').textContent=new Date().getFullYear();
async function start(){try{await loadData();}catch{$('#main').innerHTML='<div class="loading">数据暂时未能加载，请稍后重试。<br><button class="more-button" id="retry-data">重新加载</button></div>';}}
start();
