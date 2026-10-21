/* Plain static files: works at a user site or /repository/ GitHub Pages path. */
'use strict';
const $ = (selector) => document.querySelector(selector);
const CATEGORIES = ['模型与技术', '产品与应用', '行业与商业'];
const labels = {brief:'每日简报', all:'全部资讯', saved:'我的收藏', sources:'订阅来源'};
const state = {view:'brief', category:'all', period:'7', query:'', date:'', limit:18, data:null};
let saved = {}, reads = [], storageAvailable = true;
try {
  const value = JSON.parse(localStorage.getItem('zhixin-saved') || '{}');
  if (value && typeof value === 'object' && !Array.isArray(value)) saved = value;
  const readValue = JSON.parse(localStorage.getItem('zhixin-read') || '[]');
  if (Array.isArray(readValue)) reads = readValue.filter(v => typeof v === 'string');
} catch { storageAvailable = false; }
function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function safeURL(value) { try {const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : '#';} catch {return '#';} }
function chinaDate(date = new Date()) { return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai', year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
function timestamp(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? '暂无' : new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d); }
function toast(message) { $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('#toast').hidden=true,2800); }
function persist() { try {localStorage.setItem('zhixin-saved', JSON.stringify(saved));localStorage.setItem('zhixin-read',JSON.stringify(reads));} catch {storageAvailable=false;toast('浏览器暂时无法保存，当前记录仅本次打开有效。');} }
function selectBrief(items) {
  const counts = {};
  return items.filter(a => {counts[a.category] = counts[a.category] || 0; return ++counts[a.category] <= 3;});
}
function timeMatches(a) {
  if(state.period==='today') return a.date===chinaDate();
  if(state.period==='date') return !state.date || a.date===state.date;
  if(state.period==='7') return new Date(a.publishedAt).getTime() >= Date.now()-7*86400000;
  return true;
}
function itemsForView() {
  let items = state.view==='saved' ? Object.values(saved) : state.data.articles;
  items = items.filter(a=> a && a.id && a.title && a.url && timeMatches(a)).sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt));
  if(state.view==='brief') items=selectBrief(items);
  return items.filter(a=>(state.category==='all'||a.category===state.category) && `${a.title} ${a.source} ${a.excerpt || ''}`.toLowerCase().includes(state.query));
}
function renderCard(a) {
  const type = a.category===CATEGORIES[0]?'tech':a.category===CATEGORIES[2]?'business':'';
  const source = state.data.sources.find(s=>s.id===a.sourceId);
  const color = /^#[a-f\d]{6}$/i.test(source?.color || '') ? source.color : '#486648';
  return `<article class="news-card ${reads.includes(a.id)?'is-read':''}">
    <div class="card-top"><span class="category ${type}">${escapeHTML(a.category)}</span><button class="save-button ${saved[a.id]?'saved':''}" data-save="${escapeHTML(a.id)}" aria-label="${saved[a.id]?'取消收藏':'收藏'}：${escapeHTML(a.title)}" aria-pressed="${!!saved[a.id]}">${saved[a.id]?'★':'☆'}</button></div>
    <div class="card-body"><h3><a href="${escapeHTML(safeURL(a.url))}" target="_blank" rel="noopener noreferrer" data-read="${escapeHTML(a.id)}">${escapeHTML(a.title)}</a></h3><p>${escapeHTML(a.excerpt || '该订阅源未提供摘录，打开来源原文查看完整内容。')}</p></div>
    <div class="card-bottom"><span class="source-mark" style="--source-color:${color}">${escapeHTML(a.source.slice(0,1))}</span><span>${escapeHTML(a.source)}</span>${reads.includes(a.id)?'<span class="read-tag">已读</span>':''}<time datetime="${escapeHTML(a.publishedAt)}">${escapeHTML(a.date?.slice(5) || '')}</time><a class="read-link" href="${escapeHTML(safeURL(a.url))}" target="_blank" rel="noopener noreferrer" data-read="${escapeHTML(a.id)}" aria-label="打开来源原文：${escapeHTML(a.title)}">↗</a></div>
  </article>`;
}
function renderSources() {
  const intro='<p class="sources-explainer">首批追踪 6 个发布方订阅入口。Hugging Face 含社区作者文章，请在原文核对作者身份。这里只确认发布方说了什么，性能和商业效果仍需独立验证。<br>分类依据标题关键词与来源默认类别生成；当前按链接和同源标题去重，跨来源的同一事件可能仍会重复。</p>';
  $('#results').innerHTML=intro+'<div class="source-grid">'+state.data.sources.map(s=>`<article class="source-card"><div class="source-heading"><span class="source-mark">${escapeHTML(s.name.slice(0,1))}</span><div><h3>${escapeHTML(s.name)}</h3><small>${escapeHTML(s.category)}</small></div><span class="source-status ${s.status==='ok'?'':'error'}">${s.status==='ok'?'● 采集正常':'○ 本次读取失败'}</span></div><p>${s.status==='ok'?`最近一次读取：${escapeHTML(timestamp(s.lastSuccessAt))}<br>订阅源内近 90 天内容：${Number(s.itemCount) || 0} 条`:`本次未能获取内容，已保留历史资讯。<br>上次成功：${escapeHTML(timestamp(s.lastSuccessAt))}`}</p><a href="${escapeHTML(safeURL(s.url))}" target="_blank" rel="noopener noreferrer">访问官方来源 ↗</a></article>`).join('')+'</div>';
}
function render() {
  if(!state.data) return;
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);if(b.dataset.view===state.view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  document.querySelectorAll('[data-category]').forEach(b=>{b.classList.toggle('active',b.dataset.category===state.category);b.setAttribute('aria-pressed',String(b.dataset.category===state.category));});
  $('#breadcrumb-view').textContent=labels[state.view];
  $('#page-title').textContent=({brief:'每天，知新一点。',all:'信息有迹，探索有源。',saved:'留住值得回看的内容。',sources:'好内容，从好来源开始。'})[state.view];
  $('#hero').hidden=state.view!=='brief';
  $('#metrics').hidden=state.view==='sources';
  $('.filter-row').hidden=state.view==='sources';
  $('.search').hidden=state.view==='sources';
  $('#content-note').hidden=state.view==='sources';
  $('#list-title').textContent=({brief:'今日阅读',all:'全部资讯',saved:'我的收藏',sources:'一手来源清单'})[state.view];
  $('#list-subtitle').textContent=state.view==='brief'?'按发布日期选取各类最新内容':state.view==='all'?'自动留档最近 90 天的内容':state.view==='saved'?'收藏仅保存在当前浏览器，不跨设备同步':'公开 RSS · 保留原始出处';
  const ok=state.data.sources.filter(s=>s.status==='ok').length;
  $('#source-health').textContent=`${ok} / ${state.data.sources.length} 个来源采集正常`;
  $('#update-time').textContent='采集时间 '+timestamp(state.data.generatedAt);
  const stale=!state.data.lastSuccessfulAt || Date.now()-new Date(state.data.lastSuccessfulAt).getTime()>86400000;
  $('#next-info').textContent=stale?'内容可能已过期，请查看来源状态':'计划每日 08:17 / 18:17 更新';
  $('#all-count').textContent=state.data.articles.length;
  $('#saved-count').textContent=Object.keys(saved).length;
  $('#new-count').textContent=state.data.articles.filter(a=>Date.now()-new Date(a.publishedAt).getTime()<=86400000).length;
  $('#brief-count').textContent=selectBrief(state.data.articles.filter(a=>new Date(a.publishedAt)>=new Date(Date.now()-7*86400000))).length;
  $('#source-count').textContent=ok;
  $('#read-count').textContent=reads.length;
  $('#load-more').hidden=true;
  if(state.view==='sources'){renderSources();return;}
  const items=itemsForView();
  const note=state.view==='brief'&&state.period==='7'?'过去 7 天没有符合条件的内容。试试全部留档，或查看来源状态。':state.view==='saved'?'点击资讯卡片上的 ☆，把值得回看的内容放在这里。':'该时间范围或搜索条件下没有资讯，试试其他日期。';
  $('#results').innerHTML=(stale?'<div class="error-banner">最近一次成功采集距今已超过 24 小时。以下是已留档内容，请留意发布日期。</div>':'')+(items.length?'<div class="news-grid">'+items.slice(0,state.limit).map(renderCard).join('')+'</div>':`<div class="empty"><b>${state.view==='saved'?'好内容，慢慢积累。':'这里暂时安静。'}</b>${note}<br><button class="outline-button" id="reset-filters">清除筛选</button></div>`);
  $('#load-more').hidden=items.length<=state.limit;
}
async function loadData() {
  const button=$('#refresh');button.disabled=true;
  try {
    const response=await fetch(`./data/feed.json?t=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const data=await response.json();
    if(!Array.isArray(data.articles)||!Array.isArray(data.sources))throw new Error('Invalid feed');
    state.data=data;render();
  } catch {
    if(!state.data)$('#results').innerHTML='<div class="empty"><b>资讯还没送达。</b>数据暂时无法读取，请稍后刷新。<br><button class="outline-button" id="retry-load">重新加载</button></div>';
    else toast('暂时无法刷新，继续显示已加载的内容。');
  } finally {button.disabled=false;}
}
document.addEventListener('click', event=>{
  const nav=event.target.closest('[data-view]');
  if(nav){state.view=nav.dataset.view;state.category='all';state.query='';state.limit=18;state.period=state.view==='brief'?'7':'all';$('#period').value=state.period;$('#archive-date').hidden=true;$('#search').value='';render();return;}
  const category=event.target.closest('[data-category]');
  if(category){state.category=category.dataset.category;state.limit=18;render();return;}
  const save=event.target.closest('[data-save]');
  if(save){const id=save.dataset.save;if(saved[id]){delete saved[id];toast('已取消收藏');}else{const article=state.data.articles.find(a=>a.id===id);if(article)saved[id]=article;toast(storageAvailable?'已加入收藏 · 保存在当前浏览器':'已加入本次阅读收藏');}persist();render();return;}
  const read=event.target.closest('[data-read]');
  if(read&&!reads.includes(read.dataset.read)){reads.push(read.dataset.read);persist();setTimeout(render,100);}
  if(event.target.closest('#reset-filters')){state.query='';state.category='all';state.period='all';state.limit=18;$('#search').value='';$('#period').value='all';$('#archive-date').hidden=true;render();}
  if(event.target.closest('#retry-load'))loadData();
});
$('#search').addEventListener('input',e=>{state.query=e.target.value.trim().toLowerCase();state.limit=18;render();});
$('#period').addEventListener('change',e=>{state.period=e.target.value;state.limit=18;$('#archive-date').hidden=state.period!=='date';if(state.period==='date'){state.date=$('#archive-date').value||chinaDate();$('#archive-date').value=state.date;}render();});
$('#archive-date').addEventListener('change',e=>{state.date=e.target.value;state.limit=18;render();});
$('#load-more').addEventListener('click',()=>{state.limit+=18;render();});
$('#refresh').addEventListener('click',()=>loadData().then(()=>{if(state.data)toast('已读取最新发布的数据；采集由后台计划执行。');}));
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&state.view!=='sources'){e.preventDefault();$('#search').focus();}});
$('#today-label').textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date());
$('#archive-date').max=chinaDate();
if(!storageAvailable)toast('当前浏览器存储不可用，收藏可能无法长期保留。');
loadData();
