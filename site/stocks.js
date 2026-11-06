'use strict';
const StockPrices = (() => {
  let data=null, pending=null;
  const valid=value=>value?.schemaVersion===1&&Array.isArray(value.markets)&&value.markets.length===4&&value.markets.every(m=>Array.isArray(m.stocks));
  try{const snapshot=typeof document!=='undefined'?document.querySelector('#stocks-bootstrap'):null;if(snapshot){const value=JSON.parse(snapshot.textContent);if(valid(value))data=value;}}catch{/* Fall back to the published JSON when the embedded snapshot is absent or invalid. */}
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=(value,digits=2)=>Number.isFinite(value)?value.toLocaleString('zh-CN',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
  const stamp=value=>value?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'暂无报价';
  const change=(value,suffix='')=>Number.isFinite(value)?`${value>0?'+':''}${number(value)}${suffix}`:'—';
  async function load(force=false){
    if(data&&!force)return;
    if(!pending)pending=(async()=>{const r=await fetch('./data/stocks.json'+(force?'?t='+Date.now():''),{cache:force?'no-store':'default'});if(!r.ok)throw new Error('Quotes unavailable');const value=await r.json();if(!valid(value))throw new Error('Invalid quotes');data=value;})();
    try{await pending;}finally{pending=null;}
  }
  function render(params){
    const intro='<div class="page-heading"><div><h1>股票价格</h1><p>A股、港股、美股、韩股 · 用各市场原币种查看报价与涨跌</p></div><button class="quiet-button" id="stock-refresh">↻ 读取最新快照</button></div>';
    if(!data)return intro+'<div class="empty"><strong>股票报价暂时无法读取</strong><p>请稍后重试，或打开 <a href="https://finance.yahoo.com/" target="_blank" rel="noopener">Yahoo Finance 原站 ↗</a>。</p></div>';
    const q=(params.get('q')||'').trim().toLowerCase(),sort=params.get('sort')||'default';
    let count=0;
    const panels=data.markets.map(market=>{
      let rows=market.stocks.filter(s=>`${s.code} ${s.symbol} ${s.name}`.toLowerCase().includes(q));
      if(sort==='up'||sort==='down')rows=rows.slice().sort((a,b)=>{const av=a.changePercent,bv=b.changePercent;if(!Number.isFinite(av))return Number.isFinite(bv)?1:0;if(!Number.isFinite(bv))return -1;return sort==='up'?bv-av:av-bv;});
      count+=rows.length;
      const body=rows.map(s=>{
        const tone=s.change>0?'positive':s.change<0?'negative':'neutral';
        const status=s.status==='stale'?'读取失败，保留旧报价':s.status==='unavailable'?'报价暂不可用':'';
        return `<tr><th scope="row"><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer"><strong>${escape(s.name)}</strong><small>${escape(s.code)}</small></a><time datetime="${escape(s.quotedAt||'')}">${escape(stamp(s.quotedAt))}</time>${status?`<small class="stock-row-status">${status}</small>`:''}</th><td class="stock-price">${number(s.price,market.currency==='KRW'?0:2)}<small class="${tone}">${change(s.change)}</small></td><td class="stock-percent ${tone}">${change(s.changePercent,'%')}</td></tr>`;
      }).join('');
      return `<section class="stock-market-panel" aria-label="${escape(market.name)}股票价格"><header><h2>${escape(market.name)}<span>${escape(market.currency)}</span></h2><small>${rows.length} 只</small></header><div class="stock-panel-table" tabindex="0" role="region" aria-label="${escape(market.name)}报价列表"><table class="stock-table"><thead><tr><th>股票 / 时间</th><th>最新价 / 涨跌额</th><th>涨跌幅</th></tr></thead><tbody>${body||'<tr><td colspan="3" class="stock-no-match">没有匹配的股票</td></tr>'}</tbody></table></div></section>`;
    }).join('');
    return '<div class="stock-page">'+intro+`<div class="stock-meta"><span>来源：<a href="https://finance.yahoo.com/" target="_blank" rel="noopener">Yahoo Finance ↗</a></span><span>最近检查 ${escape(stamp(data.checkedAt))} · 北京时间</span><b>延迟快照 · 每半小时检查</b></div><div class="stock-controls"><label>查找股票<input id="stock-search" type="search" placeholder="同时查找四个市场，按 Enter 确认" value="${escape(params.get('q')||'')}"></label><label>各市场内排序<select id="stock-sort"><option value="default" ${sort==='default'?'selected':''}>默认顺序</option><option value="up" ${sort==='up'?'selected':''}>涨幅优先</option><option value="down" ${sort==='down'?'selected':''}>跌幅优先</option></select></label><span>四个市场 · 当前 ${count} 只</span></div><div class="stock-markets-grid">${panels}</div><div class="stock-notes"><b>报价怎么读</b><p>每列使用该市场原币种；最新价下方为较前收盘的涨跌额，右侧为涨跌幅。各行显示行情日期与时间，统一为北京时间。点击股票名称查看来源详情。</p><p>这是代表性股票观察名单，不是全市场排名。报价可能延迟，休市时显示最近交易报价；网页刷新只读取后台已发布快照。单只股票读取失败会保留旧报价并标注，未取得报价时显示“—”。</p></div></div>`;
  }
  return {load,render,ready:()=>!!data};
})();
