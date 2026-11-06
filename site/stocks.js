'use strict';
const StockPrices = (() => {
  let data=null, pending=null;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=(value,digits=2)=>Number.isFinite(value)?value.toLocaleString('zh-CN',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
  const stamp=value=>value?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'暂无报价';
  const change=(value,suffix='')=>Number.isFinite(value)?`${value>0?'+':''}${number(value)}${suffix}`:'—';
  async function load(force=false){
    if(data&&!force)return;
    if(!pending)pending=(async()=>{const r=await fetch('./data/stocks.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('Quotes unavailable');const value=await r.json();if(value.schemaVersion!==1||!Array.isArray(value.markets)||value.markets.length!==4)throw new Error('Invalid quotes');data=value;})();
    try{await pending;}finally{pending=null;}
  }
  function render(params){
    const intro='<div class="page-heading"><div><h1>股票价格</h1><p>A股、港股、美股、韩股 · 用各市场原币种查看报价与涨跌</p></div><button class="quiet-button" id="stock-refresh">↻ 读取最新快照</button></div>';
    if(!data)return intro+'<div class="empty"><strong>股票报价暂时无法读取</strong><p>请稍后重试，或打开 <a href="https://finance.yahoo.com/" target="_blank" rel="noopener">Yahoo Finance 原站 ↗</a>。</p></div>';
    const market=data.markets.find(m=>m.id===params.get('market'))||data.markets[0];
    const q=(params.get('q')||'').trim().toLowerCase(),sort=params.get('sort')||'default';
    let rows=market.stocks.filter(s=>`${s.code} ${s.symbol} ${s.name}`.toLowerCase().includes(q));
    if(sort==='up'||sort==='down')rows=rows.slice().sort((a,b)=>{const av=a.changePercent,bv=b.changePercent;if(!Number.isFinite(av))return Number.isFinite(bv)?1:0;if(!Number.isFinite(bv))return -1;return sort==='up'?bv-av:av-bv;});
    const tabs='<div class="stock-tabs" role="group" aria-label="股票市场">'+data.markets.map(m=>`<button data-stock-market="${escape(m.id)}" aria-pressed="${m.id===market.id}" class="${m.id===market.id?'active':''}">${escape(m.name)}<small>${escape(m.currency)}</small></button>`).join('')+'</div>';
    const body=rows.map(s=>{const tone=s.change>0?'positive':s.change<0?'negative':'neutral';return `<tr><th scope="row"><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer"><strong>${escape(s.name)}</strong><small>${escape(s.code)} · ${escape(s.symbol)}</small></a></th><td class="stock-price">${number(s.price,market.currency==='KRW'?0:2)}<small>${escape(market.currency)}</small></td><td class="${tone}">${change(s.change)}</td><td class="${tone}">${change(s.changePercent,'%')}</td><td class="stock-time">${escape(stamp(s.quotedAt))}<small>${s.status==='stale'?'本次读取失败 · 保留旧报价':s.status==='unavailable'?'报价暂不可用':'延迟快照 · 北京时间'}</small></td><td><a class="text-link" href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">详情 ↗</a></td></tr>`;}).join('');
    return '<div class="stock-page">'+intro+tabs+`<div class="stock-meta"><span>来源：<a href="https://finance.yahoo.com/" target="_blank" rel="noopener">Yahoo Finance ↗</a></span><span>最近检查 ${escape(stamp(data.checkedAt))} · 北京时间</span><b>延迟快照 · 每半小时检查</b></div><div class="stock-controls"><label>查找股票<input id="stock-search" type="search" placeholder="名称或代码，按 Enter 确认" value="${escape(params.get('q')||'')}"></label><label>排序<select id="stock-sort"><option value="default" ${sort==='default'?'selected':''}>默认顺序</option><option value="up" ${sort==='up'?'selected':''}>涨幅优先</option><option value="down" ${sort==='down'?'selected':''}>跌幅优先</option></select></label><span>当前 ${rows.length} 只</span></div><div class="stock-table-wrap" role="region" aria-label="${escape(market.name)}股票价格" tabindex="0"><table class="stock-table"><thead><tr><th>股票 / 代码</th><th>最新价</th><th>涨跌额</th><th>涨跌幅</th><th>行情时间</th><th>出处</th></tr></thead><tbody>${body||'<tr><td colspan="6">没有匹配的股票，请更换名称或代码。</td></tr>'}</tbody></table></div><div class="stock-notes"><b>报价怎么读</b><p>涨跌额与涨跌幅均相对数据源提供的前收盘价计算。四个市场分别使用 CNY、HKD、USD、KRW，未做汇率转换。行情时间统一显示为北京时间。</p><p>这是代表性股票观察名单，不是全市场排名。报价可能延迟，休市时显示最近交易报价；网页刷新只读取后台已发布快照。单只股票读取失败会保留旧报价并标注，未取得报价时显示“—”。</p></div></div>`;
  }
  return {load,render};
})();
