'use strict';
const $ = s => document.querySelector(s);
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TOPICS = {
  ai:{name:'AI',zh:'智能进展',intro:'模型、智能体、产品与产业动态'},
  invest:{name:'Invest',zh:'投资市场',intro:'宏观政策、监管公告与全球市场'},
  biz:{name:'Biz',zh:'产品商业',intro:'产品增长、创业与商业观察'},
  ship:{name:'Ship',zh:'开发工具',intro:'版本发布、工程实践与安全更新'},
  research:{name:'Research',zh:'学术研究',intro:'原始论文、实验室与研究机构'},
  crypto:{name:'Web3',zh:'加密生态',intro:'协议进展、行业研究与加密市场'},
};
const KIND = {official:'官方发布',media:'媒体报道',research:'研究来源',community:'社区观点'};
let xData = null;
let data = null, route = null, pageLimit = 24, routeVersion = 0;
let saved = {}, reads = [], hiddenSources = [], storageOK = true;
const records = new Map(), archiveCache = new Map();
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
function renderHome(){
  const stats=data.stats,all=recentItems(),today=chinaDate(),todayInfo=data.archives.find(x=>x.date===today);
  const channels=Object.entries(TOPICS).map(([id,t])=>{
    const pool=all.filter(a=>matchesTopic(a,id));const recent=pool.filter(a=>Date.now()-new Date(a.publishedAt)<7*86400000);const candidates=recent.length?recent:pool;const selected=candidates.slice().sort(byDate).slice(0,6);const lead=selected[0];
    return `<section class="channel" aria-label="${t.name} ${t.zh}"><div class="channel-heading"><h2>${t.name}<small>${t.zh}</small></h2><a href="${e(newsLink({topic:id}))}" aria-label="进入${t.zh}">↗</a></div><div class="mini-label"><span>${todayInfo?.topics?.[id]?`今日收录 ${num(todayInfo.topics[id])} 条`:'最新可读'}</span><a href="${linkFor('daily',{topic:id})}">日报 →</a></div>${lead?`<div class="daily-preview"><h3><a href="${e(articleLink(lead))}">${e(displayTitle(lead))}</a></h3><p>${e(summary(lead))}</p><div class="preview-meta">${e(lead.source)} · ${e(shortTime(lead))}${lead.summaryZh?' · AI 中文摘要':lead.language!=='zh'?' · EN':''}</div></div><ul class="mini-news">${selected.slice(1).map(miniItem).join('')}</ul>`:'<div class="daily-preview"><p>该频道暂时没有近期收录。</p></div>'}<a class="channel-more" href="${e(newsLink({topic:id}))}">进入 ${t.name} <span aria-hidden="true">→</span></a></section>`;
  }).join('');
  return `<section class="opening"><div><div class="eyebrow">YOUR DAILY SIGNAL, FROM MORE PERSPECTIVES</div><h1>AI、投资与商业，<br><span>一站看见，更广一点。</span></h1><p class="lead">跨越语言与平台，把值得追踪的变化放在一起。</p><p class="fine">GitHub 自动更新 · 中文摘要 · 按日留档 · 免登录阅读</p></div><div class="coverage-box"><div class="coverage-head">A BROADER VIEW</div><div class="coverage-numbers"><div><b>${stats.configuredSources}</b><span>个订阅入口</span></div><div><b>${stats.chineseSources}</b><span>个中文信源</span></div><div><b>6</b><span>个主题频道</span></div></div><a href="#/sources">官方、媒体、研究与社区 <span>↗</span></a></div></section><div class="quick-topics"><div>${Object.entries(TOPICS).map(([id,t])=>`<a href="${e(newsLink({topic:id}))}">${t.zh}</a>`).join('')}</div><span class="date-label">${e(today)} / BEIJING</span></div>${summaryStatus()}${renderHomeTimeline()}<details class="channel-overview"><summary>按频道浏览 <span>AI / Invest / Biz / Ship / Research / Web3</span></summary><div class="channel-grid">${channels}</div></details><div class="home-bottom"><section class="subpanel"><h2>过去 24 小时，哪些话题被收录最多？</h2><p>按站内已收录标题的关键词计数；这是阅读线索。</p><div class="tag-cloud">${hotTags().slice(0,8).map(t=>`<a class="tag" href="${e(newsLink({tag:t.tag}))}">#${e(t.tag)}<b>${t.count}</b></a>`).join('')||'<span class="method-note">暂时没有匹配的话题。</span>'}</div><a class="text-link" href="#/hot">查看站内热点 →</a></section><section class="subpanel"><h2>信息更丰富，出处也要更清楚。</h2><p>官方公告、媒体报道、原始论文和社区观点分别标识。英文逐批生成中文摘要，同时保留原文与发布方摘录。多读一份原始材料，多一个判断的角度。</p><div class="tag-cloud">${Object.entries(KIND).map(([k,v])=>`<span class="kind ${k}">${v}</span>`).join('')}</div><a class="text-link" href="#/about">了解收录与编排规则 →</a></section></div>`;
}
function summaryStatus(){const s=data.summaryService;if(!s)return '<p class="method-note">中文摘要服务等待首次运行。</p>';return `<div class="summary-status"><span class="summary-badge">中文摘要</span><span>近期英文资讯已覆盖 ${num(s.recentSummarized)} / ${num(s.recentEnglish)} 条 · 分批补充${s.status==='error'?' · 最近生成失败，保留已有摘要':''}</span><a href="#/about">生成规则 ↗</a></div>`;}
function renderHomeTimeline(){
  const items=filteredNews(),p=route.params;
  let previousDate='';const rows=[];
  for(const a of items.slice(0,pageLimit)){if(a.date!==previousDate){rows.push(`<div class="list-date"><span>${e(a.date)}${a.date===chinaDate()?' · 今天':''}</span><span>北京时间 · 新到旧</span></div>`);previousDate=a.date;}rows.push(newsItem(a));}
  return `<section class="home-timeline"><div class="timeline-heading"><h2>最新资讯</h2><span>按发布时间倒序 · 北京时间</span></div>${topicTabs(p.get('topic')||'all')}<div class="news-layout"><div class="news-main"><div class="toolbar"><label class="check-label"><input type="checkbox" id="chinese-only" ${p.get('zh')==='1'?'checked':''}>中文可读</label><span class="method-note">${items.length} 条近期索引 · 仅有日期的来源不补造时分</span></div>${rows.join('')||empty('暂时没有匹配资讯。','请切换频道或语言筛选。')}${items.length>pageLimit?'<button class="more-button" id="load-more">再看 24 条 ↓</button>':''}</div>${aside()}</div></section>`;
}
function newsPool(){const date=route.params.get('date');return date?(archiveCache.get(date)||[]):data.articles;}
function filteredNews(){
  const p=route.params,topic=p.get('topic')||'all',kind=p.get('kind')||'',sid=p.get('source')||'',q=(p.get('q')||'').toLowerCase(),tag=p.get('tag')||'';
  let items=(route.name==='saved'?Object.values(saved):newsPool()).filter(a=>visible(a)&&matchesTopic(a,topic)&&(!kind||(a.kind||source(a.sourceId)?.kind)===kind)&&(!sid||a.sourceId===sid)&&(p.get('zh')!=='1'||a.language==='zh'||a.summaryZh)&&(!tag||(a.tags||[]).includes(tag))&&(!q||`${a.title} ${a.titleZh||''} ${a.summaryZh||''} ${a.source} ${a.excerpt||''}`.toLowerCase().includes(q)));
  items=items.sort(byDate);
  if(p.get('mode')==='selected')items=pickDiverse(items,60,3).sort(byDate);
  return items;
}
function aside(){const counts={};for(const a of recentItems())counts[a.source]=(counts[a.source]||0)+1;return `<aside class="news-aside"><section class="aside-section"><h2>多源阅读站</h2><div class="aside-number">${num(data.stats.totalArticles)}<small>条已留档</small></div><p>最近 90 天已采集记录。近期索引按频道保留；选择日期可查看当日完整留档。</p></section><section class="aside-section"><h2>近期收录较多的来源</h2>${Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,count])=>`<div class="aside-source"><span>${e(name)}</span><span>${count}</span></div>`).join('')}<a class="aside-link" href="#/sources">查看全部 ${data.sources.length} 个信源 →</a></section><section class="aside-section"><h2>阅读提示</h2><p>“多源编排”优先中文、时效和来源多样性，并隐藏预发布版本。它不代表人工审核或模型判断。<br><br>标有“AI 中文摘要”的条目由开源模型生成，仅依据标题和来源短摘录；未覆盖条目保留原文。</p><a class="aside-link" href="#/about">编排规则 →</a></section></aside>`;}
function renderNews(){
  const p=route.params,topic=p.get('topic')||'all',isSaved=route.name==='saved',date=p.get('date')||'',mode=p.get('mode')||'latest',items=filteredNews();
  const parts=[];let previousDate='';
  for(const a of items.slice(0,pageLimit)){if(a.date!==previousDate){parts.push(`<div class="list-date"><span>${e(a.date)}${a.date===chinaDate()?' · 今天':''}</span><span>北京时间</span></div>`);previousDate=a.date;}parts.push(newsItem(a));}
  return heading(isSaved?'我的收藏':'资讯，按你的节奏读。',isSaved?'收藏包含文章快照，保存在当前浏览器，不跨设备同步。':'AI、市场、产品、工具、研究与 Web3，回到原始出处。',`<button class="quiet-button" id="refresh-data">↻ 刷新数据</button>`)+topicTabs(topic)+`<div class="news-layout"><div class="news-main"><div class="toolbar">${!isSaved?`<div class="segmented" role="group" aria-label="编排方式"><button data-mode="latest" class="${mode==='latest'?'active':''}" aria-pressed="${mode==='latest'}">最新</button><button data-mode="selected" class="${mode==='selected'?'active':''}" aria-pressed="${mode==='selected'}">多源编排</button></div>`:''}<label class="check-label"><input type="checkbox" id="chinese-only" ${p.get('zh')==='1'?'checked':''}>中文可读</label><label class="sr-only" for="news-kind">来源类型</label><select id="news-kind"><option value="">全部类型</option>${Object.entries(KIND).map(([k,v])=>`<option value="${k}" ${p.get('kind')===k?'selected':''}>${v}</option>`).join('')}</select>${!isSaved?`<label class="sr-only" for="news-date">查看历史日期</label><input type="date" id="news-date" value="${e(date)}" max="${chinaDate()}" min="${e(data.archives.at(-1)?.date||'')}">`:''}<span class="count-label">当前 ${num(items.length)} 条</span></div><div class="inline-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="list-search" type="search" aria-label="搜索当前列表" placeholder="搜索当前列表，按 Enter 确认" value="${e(p.get('q')||'')}"></div>${p.get('tag')?`<div class="notice">当前话题：#${e(p.get('tag'))} <a class="text-link" href="${e(newsLink({topic}))}">清除筛选 ×</a></div>`:''}<p class="method-note">${date?e(date)+' 的完整收录。':'当前为各频道近期索引；历史完整内容请按日期查阅。'}分类来自关键词规则。AI 中文摘要单独标记，其余为发布方摘录。</p>${parts.length?parts.join(''):empty(isSaved?'好内容，慢慢留下来。':'当前条件下没有资讯。',isSaved?'点击任意资讯旁的 ☆ 收藏。':'可以切换日期、语言或来源类型。')}${items.length>pageLimit?'<button class="more-button" id="load-more">再看 24 条 ↓</button>':''}</div>${aside()}</div>`;
}
function renderDaily(){
  const date=route.params.get('date')||chinaDate(),topic=route.params.get('topic')||'all',items=(archiveCache.get(date)||[]).filter(visible),info=data.archives.find(a=>a.date===date);
  const controls=`<div class="daily-controls"><button class="quiet-button" data-day="prev" aria-label="前一天">←</button><label class="sr-only" for="daily-date">日报日期</label><input type="date" id="daily-date" value="${e(date)}" max="${chinaDate()}" min="${e(data.archives.at(-1)?.date||'')}"><button class="quiet-button" data-day="next" aria-label="后一天" ${date>=chinaDate()?'disabled':''}>→</button><button class="quiet-button" data-today>今天</button></div>`;
  const sections=Object.entries(TOPICS).filter(([id])=>topic==='all'||id===topic).map(([id,t])=>{const pool=items.filter(a=>matchesTopic(a,id));const selection=pool.slice().sort(byDate).slice(0,6);return `<section class="daily-section"><div class="daily-section-title"><h2>${t.name}</h2><span>${t.zh} · ${pool.length} 条收录</span><a href="${e(newsLink({topic:id,date}))}">全部 →</a></div>${selection.length?'<div class="daily-rows">'+selection.map(a=>newsItem(a)).join('')+'</div>':`<p class="method-note">当天没有符合条件的正式发布内容。</p>`}</section>`;}).join('');
  return heading('每日简报','按北京时间倒序排列，每个频道展示最新 6 条，完整内容可进入频道查看。',controls)+`<div class="daily-stats"><span><b>${num(items.length)}</b>条当日收录</span><span><b>${num(info?.sourceCount)}</b>个来源入口</span><span><b>${num(items.filter(a=>a.language==='zh').length)}</b>条中文内容</span><span class="date-badge">${e(date)} · BEIJING</span></div>`+topicTabs(topic)+`<p class="method-note">自动编排 · AI 中文摘要逐批生成，明确标注；其余保留发布方原文摘录。</p>`+(items.length?sections:empty('这一天，暂时没有留档。','初次接入的来源仅提供其订阅源内现有历史；不会补造过往日报。',linkFor('daily',{date:data.archives[0]?.date||chinaDate()})));
}
function renderSources(){
  const p=route.params,query=(p.get('q')||'').toLowerCase();let list=data.sources.filter(s=>(!p.get('topic')||p.get('topic')==='all'||s.topic===p.get('topic'))&&(!p.get('kind')||s.kind===p.get('kind'))&&(!p.get('language')||s.language===p.get('language'))&&(!p.get('status')||s.status===p.get('status'))&&`${s.name} ${s.category} ${s.group}`.toLowerCase().includes(query));
  const stats=data.stats;
  const cards=list.map(s=>`<article class="source-card"><div class="source-title"><div><h2>${e(s.name)}</h2><p>${e(TOPICS[s.topic]?.zh||'')} · ${e(s.category)}</p></div><span class="status ${e(s.status)}">${s.status==='ok'?'● 正常':s.status==='quiet'?'○ 暂无近期内容':'○ 本次失败'}</span></div><div class="source-info">${e(KIND[s.kind]||'来源')} · ${s.region==='CN'?'中国': '海外'} · ${s.language==='zh'?'中文':'英文'}<br>最近成功：${e(time(s.lastSuccessAt))}<br>本次近 90 天有效条目：${num(s.itemCount)} 条${s.status==='error'?'<br>保留历史内容，等待下次重试。':''}</div><div class="source-links"><a href="${e(safeURL(s.url))}" target="_blank" rel="noopener">官网 ↗</a><a href="${e(safeURL(s.feed))}" target="_blank" rel="noopener">${s.adapter==='rss'?'RSS':'发布页'} ↗</a><button data-mute="${e(s.id)}" class="${hiddenSources.includes(s.id)?'muted-source':''}" aria-pressed="${!hiddenSources.includes(s.id)}">${hiddenSources.includes(s.id)?'恢复显示':'已订阅 ✓'}</button></div></article>`).join('');
  return heading('从更丰富的来源，看同一个世界。','来源目录可筛选、可核对。订阅入口可能属于同一发布方，数量不代表独立机构数量。',`<a class="quiet-button" href="./sources.opml" download>导出 OPML ↓</a>`)+`<div class="source-stats"><div><b>${stats.configuredSources}</b><span>已配置订阅入口</span></div><div><b>${stats.healthySources}</b><span>本次读取有内容</span></div><div><b>${stats.activeSources7d}</b><span>近 7 天有发布</span></div><div><b>${stats.chineseSources}</b><span>中文订阅来源</span></div><div><b>${stats.organizations}</b><span>发布方分组</span></div></div><div class="notice">已订阅内容默认全部显示。点击“已订阅”可在当前浏览器隐藏该源，不会更改后台采集。${hiddenSources.length?` 已隐藏 ${hiddenSources.length} 个源。 <button class="quiet-button" id="restore-sources">恢复全部</button>`:''}<br>公开 RSS 和可读取的官方发布页持续采集。X 热帖监测见独立页面，需先配置官方 API；微信公众号、Telegram 及其他需要登录的来源尚未接入。</div>${topicTabs(p.get('topic')||'all')}<div class="source-tools"><input type="search" id="source-search" aria-label="搜索信源" placeholder="搜索来源名称或分类，按 Enter 确认" value="${e(p.get('q')||'')}"><label class="sr-only" for="source-kind">来源类型</label><select id="source-kind"><option value="">全部类型</option>${Object.entries(KIND).map(([k,v])=>`<option value="${k}" ${p.get('kind')===k?'selected':''}>${v}</option>`).join('')}</select><label class="sr-only" for="source-language">来源语言</label><select id="source-language"><option value="">全部语言</option><option value="zh" ${p.get('language')==='zh'?'selected':''}>中文</option><option value="en" ${p.get('language')==='en'?'selected':''}>英文</option></select><label class="sr-only" for="source-status">采集状态</label><select id="source-status"><option value="">全部状态</option><option value="ok" ${p.get('status')==='ok'?'selected':''}>采集正常</option><option value="quiet" ${p.get('status')==='quiet'?'selected':''}>暂无近期内容</option><option value="error" ${p.get('status')==='error'?'selected':''}>本次失败</option></select></div><p class="source-grid-count">当前显示 ${list.length} 个入口 · 最近采集 ${e(time(data.lastSuccessfulAt||data.generatedAt))}</p><div class="source-grid">${cards}</div>`;
}
function renderHot(){
  return heading('热点，先看站内证据。','按过去 24 小时收录标题的关键词频次排序；不代表全网热度或事件已获多方证实。')+`<div class="notice">同标题归并只匹配格式归一后相同的标题，并限制在 48 小时内。跨语言、同事件不同措辞暂不进行语义合并。</div><div class="hot-grid">${hotTags().slice(0,15).map((t,i)=>`<section class="hot-card"><div class="hot-card-top"><h2>${e(t.tag)}</h2><span class="hot-rank">${String(i+1).padStart(2,'0')}</span></div><p class="hot-count">${t.count} 条相关标题 · ${t.sourceCount} 个来源入口</p><ul class="mini-news">${t.articles.filter(visible).slice(0,3).map(miniItem).join('')}</ul><a class="channel-more" href="${e(newsLink({tag:t.tag}))}">查看相关资讯 →</a></section>`).join('')}</div>`;
}
function renderX(){
  const x=xData||{},r=x.rule||{maxFollowersExclusive:100000,lookbackHours:48,minScore:50,followerScoreRatio:.005};
  const states={not_configured:'等待接入官方 API',ok:'最近采集成功',partial:'部分结果 · 达到分页上限或有账号未返回',budget_limited:'已达到本月程序用量上限',rate_limited:'API 限流，等待下次任务',auth_error:'API 凭证或权限需要检查',api_error:'最近读取失败，保留历史记录',unavailable:'监测数据暂时无法加载'};
  const all=(x.posts||[]).filter(p=>p.hot&&Number.isInteger(p.followersCount)&&p.followersCount<r.maxFollowersExclusive&&Date.now()-new Date(p.createdAt)<=r.lookbackHours*3600000).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const author=route.params.get('author')||'',items=all.filter(p=>!author||p.username.toLowerCase()===author.toLowerCase());
  const accounts=x.accounts||[];
  const rows=items.slice(0,pageLimit).map(p=>`<article class="x-post"><div class="x-post-heading"><a href="${e(safeURL('https://x.com/'+p.username))}" target="_blank" rel="noopener"><strong>${e(p.name)}</strong><span>@${e(p.username)} · ${num(p.followersCount)} 粉丝</span></a><time datetime="${e(p.createdAt)}">${e(time(p.createdAt,true))}</time></div><p class="x-post-text">${e(p.text)}</p><div class="x-metrics"><span>♡ ${num(p.likes)} 点赞</span><span>↻ ${num(p.reposts)} 转发</span><span>◌ ${num(p.replies)} 回复</span><span>引用 ${num(p.quotes)}</span>${p.impressions==null?'':`<span>${num(p.impressions)} 浏览</span>`}</div><div class="x-post-bottom"><span>热度分 ${num(p.score)} ≥ 门槛 ${num(p.threshold)} · 指标采样 ${e(time(p.metricsObservedAt))}<br>粉丝核验 ${e(time(p.followersObservedAt))}</span><a class="text-link" href="${e(safeURL(p.url))}" target="_blank" rel="noopener noreferrer">查看原帖 ↗</a></div></article>`).join('');
  return heading('X 热帖，小账号里的大信号。','关注粉丝数低于 10 万的指定账号，按原帖发布时间倒序。',`<button class="quiet-button" id="refresh-data">↻ 刷新数据</button>`)+`<div class="x-status"><span class="status">${e(states[x.status]||'状态待核对')}</span><span>最近成功：${e(time(x.lastSuccessAt,true))}</span></div><div class="notice">观察范围：指定账号近 ${r.lookbackHours} 小时的公开原创帖；排除回复和转发。粉丝数以采样时为准，未知或达到 ${num(r.maxFollowersExclusive)} 的账号不纳入。<br>热度分 = 点赞 + 2×转发 + 回复 + 2×引用；门槛 = max(${r.minScore}, 粉丝数 × ${r.followerScoreRatio*100}%)。指标为采样累计值，不代表增长速度或全网热度。</div>${x.status==='not_configured'?`<section class="x-setup"><h2>监测页面已就绪，等待真实数据连接</h2><p>需要选定账号，并在 GitHub 配置 X 官方 API Bearer Token 和用量预算。当前未发起付费调用，也没有用示例帖子填充页面。</p><ol><li>在仓库 <code>x-watchlist.json</code> 填写关注账号。</li><li>把凭证存入 GitHub Actions Secret：<code>X_BEARER_TOKEN</code>。</li><li>确认预算后启用监测，并在 X 控制台设置消费限额。</li></ol><a class="text-link" href="https://github.com/0xAPTX/ai-daily/blob/main/docs/x-setup.md" target="_blank" rel="noopener">查看接入和费用说明 ↗</a></section>`:''}<div class="x-toolbar"><label for="x-author">观察账号</label><select id="x-author"><option value="">全部账号</option>${(x.watchlist||[]).map(n=>`<option value="${e(n)}" ${author===n?'selected':''}>@${e(n)}</option>`).join('')}</select><span class="method-note">${items.length} 条达到门槛的热帖 · 北京时间</span></div>${accounts.length?`<div class="x-accounts">${accounts.map(a=>`<span>@${e(a.username)} · ${a.followersCount==null?'粉丝数待核验':num(a.followersCount)+' 粉丝'} · ${a.eligible?'纳入观察':'未纳入'}</span>`).join('')}</div>`:''}${rows||`<div class="empty"><strong>${x.status==='not_configured'?'接通后，这里会出现热帖时间线。':'本次没有达到门槛的热帖。'}</strong>${x.status==='not_configured'?'账号、粉丝数、互动指标与原帖链接会一起展示。':'可检查账号状态、采样时间或调整观察账号。'}</div>`}${items.length>pageLimit?'<button class="more-button" id="load-more">继续查看 ↓</button>':''}${x.budget?`<p class="method-note">本月程序保守预估已预留 $${e(x.budget.reservedUsd)} / $${e(x.budget.limitUsd)}，实际费用及硬性限额以 X 控制台为准。</p>`:''}<p class="method-note">页面读取已发布的静态数据，打开网页不会触发 X 付费请求。后台由 GitHub Actions 每两小时检查；接口失败会保留窗口内历史并标注状态。</p>`;
}
function renderArticle(){
  const id=route.parts[2],a=records.get(id)||saved[id];if(!a)return heading('内容暂时找不到。','这条资讯可能已超出留档期限。')+empty('可以回到资讯流继续阅读。','已收藏的文章快照会保存在当前浏览器。');
  const s=source(a.sourceId);if(!reads.includes(a.id)){reads.push(a.id);persist();}
  const originRows=(a.origins||[{sourceId:a.sourceId,source:a.source}]).map(o=>`<div><span>收录入口</span><b>${e(o.source)}${source(o.sourceId)?.kind==='research'?' · 研究/论文订阅':''}</b></div>`).join('');
  const peers=a.sameTitleGroup?[...records.values()].filter(x=>x.sameTitleGroup===a.sameTitleGroup&&x.id!==a.id):[];
  return `<article class="article-page"><a class="back-link" href="${e(newsLink({topic:topics(a)[0]}))}">← 返回资讯</a><h1>${e(displayTitle(a))}</h1><div class="article-meta">${sourceBadge(a)}<span>${e(a.source)}</span><time>${a.datePrecision==='day'?e(a.date):e(time(a.publishedAt,true))} ${a.dateType==='updated'?'更新':'发布'}</time><span>${a.language==='zh'?'中文原文':'英文原文'}</span></div><h2>${a.summaryZh?'AI 中文摘要':'发布方摘录'}</h2><p class="article-excerpt">${e(summary(a))}</p>${a.summaryZh?`<p class="method-note">${e(a.summaryModel)} · ${e(time(a.summarizedAt,true))} 生成 · ${a.summaryBasis==='title_only'?'仅依据标题转述':'依据标题与来源短摘录'}，请结合原文核对。</p><details class="original-excerpt"><summary>查看原始标题与发布方摘录</summary><h3>${e(a.title)}</h3><p>${e(a.excerpt||'来源未提供摘录。')}</p></details>`:''}${a.originalTitle?`<p class="original-title">原始标题：${e(a.originalTitle)}</p>`:''}<p class="method-note">摘要和摘录均不等于独立核实。模型未读取文章全文，请打开原文阅读完整上下文与适用条件。</p><div class="article-actions"><a class="primary-button" href="${e(safeURL(a.url))}" target="_blank" rel="noopener noreferrer" data-read="${e(a.id)}">阅读原文 ↗</a><button class="quiet-button ${saved[a.id]?'saved':''}" data-save="${e(a.id)}" aria-pressed="${!!saved[a.id]}">${saved[a.id]?'★ 已收藏':'☆ 收藏'}</button><button class="quiet-button" data-copy="${e(a.id)}">复制本站链接</button></div><div class="tag-cloud">${tagLinks(a)}</div><h2>来源与记录</h2><div class="provenance-table"><div><span>原文出处</span><b><a href="${e(safeURL(a.url))}" target="_blank" rel="noopener">${e(a.url)}</a></b></div><div><span>来源类型</span><b>${e(KIND[a.kind]||KIND[s?.kind]||'来源原文')}</b></div>${originRows}<div><span>归类</span><b>${topics(a).map(t=>e(TOPICS[t]?.zh||t)).join(' / ')} · ${e(a.category)}</b></div><div><span>时间依据</span><b>${a.dateType==='updated'?'订阅源更新时间（未提供原始发布日期）':'发布方提供的原始发布日期'}${a.datePrecision==='day'?' · 精确到日':''} · 北京时间展示</b></div></div>${peers.length?'<h2>同标题收录</h2><ul class="mini-news">'+peers.map(miniItem).join('')+'</ul>':''}</article>`;
}
function renderAbout(){return heading('让来源更广，让判断有据。','知新是一座个人多源阅读站。')+`<div class="prose"><h2>参考了什么</h2><p>借鉴 <a class="text-link" href="https://wqu.guru/" target="_blank" rel="noopener">wqu.guru</a> 的多频道首页、资讯流与日报组织方式。本站内容直接从列出的公开来源收录，不复制参考站的新闻综述、排名或课程。</p><h2>覆盖什么</h2><p>AI 动态、投资市场、产品商业、开发工具、学术研究、加密 Web3 六个频道。每个订阅入口在信源目录中展示实际采集状态、类型和语言；多个入口可能属于同一发布方。</p><h2>如何编排</h2><ul><li>“最新”按发布方提供的时间排列；没有发布时间但有更新时间时，明确标为更新。</li><li>“多源编排”在时效基础上优先中文，限制单一来源数量，隐藏预发布版本。它不代表人工精选或重要性评分。</li><li>同一原始链接只保留一条；arXiv 同一论文的分类订阅合并。格式归一后标题完全相同、时间相近的记录，可显示多个发布方。跨语言的同事件不同标题尚未语义合并。</li><li>话题与跨频道分类来自关键词规则，可能有误；热点依据站内过去 24 小时标题计数。</li></ul><h2>中文与摘要</h2>${summaryStatus()}<p>GitHub Actions 使用 Qwen2.5-1.5B 开源模型在 runner 内生成中文标题和短摘要，不需要付费模型 API 或个人 token。仅输入原始标题与发布方短摘录，没有读取全文。每次有限额，优先处理近期内容；未处理或失败的条目保留原文。AI 中文摘要可能有误，原始标题、摘录和出处始终保留。</p><h2>留档、更新与收藏</h2><p>保留最近 90 天已采集记录；初次接入能取得的历史受来源订阅长度限制。首页加载各频道近期索引，完整内容按日加载。计划每两小时采集一次，GitHub 调度可能延迟；静态网页打开时读取最新已发布数据。</p><p>单源失败保留历史；全部来源失败时停止该次发布。收藏、已读和隐藏来源只保存在当前浏览器。清除网站数据会移除这些记录。已收藏的文章保留快照，可从收藏页面导出备份。</p><h2>尚未接入的范围</h2><p>X 监测程序已准备，实际接入状态见 X 热帖页面；它需要官方 API 凭证、账号清单和用量预算。微信公众号、Telegram 及其他需要登录的站点尚未接入。Qwen 当前官方博客暂未找到稳定的可读取日期接口；相关动态目前由已接入的媒体与研究来源覆盖。官方、媒体和社区观点均需结合上下文核对。</p></div>`;}
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
  if(!data)return;route=getRoute();const version=++routeVersion;updateShell();
  try{
    let date=route.params.get('date');if(route.name==='daily')date=date||chinaDate();if(route.name==='article')date=route.parts[1];
    if(date&&!archiveCache.has(date)){$('#main').innerHTML='<div class="loading">正在读取日期归档…</div>';await ensureArchive(date);}
    if(route.name==='x'&&!xData){try{const r=await fetch('./data/x-feed.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error();xData=await r.json();}catch{xData={status:'unavailable',posts:[],accounts:[],watchlist:[]};}}
    if(version!==routeVersion)return;
    const renderers={home:renderHome,news:renderNews,daily:renderDaily,sources:renderSources,hot:renderHot,x:renderX,article:renderArticle,saved:renderNews,about:renderAbout};
    $('#main').innerHTML=(renderers[route.name]||(()=>heading('这个页面还没有内容。','请从首页继续阅读。')))();
    if(route.name==='saved')$('#main').insertAdjacentHTML('beforeend','<button class="more-button" id="export-saved">导出收藏备份 JSON ↓</button>');
    document.title=({home:'知新 · 多源资讯，每日有新知',news:'资讯流 · 知新',daily:'每日简报 · 知新',hot:'站内热点 · 知新',x:'X 热帖监测 · 知新',sources:'完整信源目录 · 知新',saved:'我的收藏 · 知新',article:'原文与出处 · 知新',about:'收录规则 · 知新'})[route.name]||'知新';
    if(!keepScroll)window.scrollTo({top:0,behavior:'instant'});
  }catch{$('#main').innerHTML=heading('这份归档暂时无法加载。','请检查网络后重试。')+'<button class="more-button" id="retry-route">重新读取</button>';}
}
async function loadData(){
  const response=await fetch(`./data/feed.json?t=${Date.now()}`,{cache:'no-store'});if(!response.ok)throw new Error('Data unavailable');const value=await response.json();if(value.schemaVersion!==2||!Array.isArray(value.articles)||!Array.isArray(value.sources)||!value.stats)throw new Error('Unsupported feed');
  data=value;xData=null;records.clear();archiveCache.clear();for(const a of data.articles)records.set(a.id,a);for(const t of data.hotTags||[])for(const a of t.articles||[])records.set(a.id,a);
  for(const a of Object.values(saved)){if(!a||!a.id||!a.title)continue;const fresh=records.get(a.id);if(fresh)saved[a.id]=fresh;else if(!a.topics)a.topics=[source(a.sourceId)?.topic||'ai'];records.set(a.id,saved[a.id]);}
  await renderRoute();
}
function searchResults(){const q=$('#global-search').value.trim().toLowerCase();const items=q?[...records.values()].filter(a=>visible(a)&&`${a.title} ${a.titleZh||''} ${a.summaryZh||''} ${a.source} ${(a.tags||[]).join(' ')}`.toLowerCase().includes(q)).sort(byDate).slice(0,12):[];$('#global-results').innerHTML=q?(items.map(a=>`<a class="search-result" href="${e(articleLink(a))}" data-search-result>${e(displayTitle(a))}<small>${e(a.source)} · ${e(shortTime(a))}</small></a>`).join('')||'<p class="method-note">没有匹配结果，可以在资讯页切换日期继续查找。</p>'):'<p class="method-note">试试 OpenAI、DeepSeek、融资、产品增长或 Bitcoin。</p>';}
function openSearch(){$('#search-dialog').showModal();$('#global-search').focus();searchResults();}
function findArticle(id){return records.get(id)||saved[id];}
function shiftDay(direction){const date=route.params.get('date')||chinaDate();const d=new Date(date+'T12:00:00+08:00');d.setUTCDate(d.getUTCDate()+(direction==='next'?1:-1));updateParams({date:chinaDate(d)});}
document.addEventListener('click',async event=>{
  const t=event.target;
  if(t.closest('.skip')){event.preventDefault();$('#main').focus();$('#main').scrollIntoView({behavior:'instant'});return;}
  const topic=t.closest('[data-topic]');if(topic){updateParams({topic:topic.dataset.topic==='all'?'':topic.dataset.topic});return;}
  const mode=t.closest('[data-mode]');if(mode){updateParams({mode:mode.dataset.mode==='latest'?'':mode.dataset.mode});return;}
  const save=t.closest('[data-save]');if(save){const id=save.dataset.save;if(saved[id]){delete saved[id];toast('已取消收藏');}else{const a=findArticle(id);if(a)saved[id]=a;toast(storageOK?'已收藏 · 保存在当前浏览器':'已加入本次收藏');}persist();await renderRoute({keepScroll:true});return;}
  const copy=t.closest('[data-copy]');if(copy){const a=findArticle(copy.dataset.copy);if(a){const url=new URL(location.href);url.hash=articleLink(a).slice(1);try{await navigator.clipboard.writeText(url.href);toast('链接已复制');}catch{toast('复制不可用，可打开详情后复制浏览器地址。');}}return;}
  const read=t.closest('[data-read]');if(read&&!reads.includes(read.dataset.read)){reads.push(read.dataset.read);persist();}
  const mute=t.closest('[data-mute]');if(mute){const id=mute.dataset.mute;if(hiddenSources.includes(id))hiddenSources=hiddenSources.filter(x=>x!==id);else hiddenSources.push(id);persist();await renderRoute({keepScroll:true});return;}
  if(t.closest('#restore-sources')){hiddenSources=[];persist();renderRoute({keepScroll:true});}
  const day=t.closest('[data-day]');if(day){shiftDay(day.dataset.day);return;}
  if(t.closest('[data-today]')){updateParams({date:chinaDate()});return;}
  if(t.closest('#load-more')){pageLimit+=24;renderRoute({keepScroll:true});return;}
  if(t.closest('#refresh-data')){const button=t.closest('#refresh-data');button.disabled=true;try{await loadData();toast('已读取最新发布数据；后台计划每两小时采集。');}catch{toast('暂时无法刷新，请稍后重试。');button.disabled=false;}}
  if(t.closest('#retry-route'))renderRoute();
  if(t.closest('#retry-data'))start();
  if(t.closest('[data-search-result]'))$('#search-dialog').close();
  if(t.closest('#export-saved')){const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),articles:Object.values(saved)},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='zhixin-bookmarks-'+chinaDate()+'.json';a.click();URL.revokeObjectURL(url);}
});
document.addEventListener('change',event=>{
  const t=event.target;
  const mappings={'news-kind':'kind','news-date':'date','daily-date':'date','source-kind':'kind','source-language':'language','source-status':'status','x-author':'author'};
  if(mappings[t.id]){pageLimit=24;updateParams({[mappings[t.id]]:t.value});}
  if(t.id==='chinese-only')updateParams({zh:t.checked?'1':''});
});
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
