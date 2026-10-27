'use strict';
// Prices are units per EUR; all pairs use observations from the same ECB date.
const FX = (() => {
  let data = null;
  let conversion = {amount: '1000', from: null, to: null};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const DAY = 86400000;
  const dateMs = value => Date.parse(value + 'T00:00:00Z');
  const rate = (row, from, to) => {
    const a = row?.rates?.[from], b = row?.rates?.[to];
    return Number.isFinite(a) && a > 0 && Number.isFinite(b) && b > 0 ? b / a : null;
  };
  const baseline = (history, days) => {
    if (days === 1) return history.at(-2) || null;
    const cutoff = dateMs(history.at(-1)?.date) - days * DAY;
    return history.filter(row => dateMs(row.date) <= cutoff).at(-1) || null;
  };
  const change = (history, from, to, days) => {
    const reference = baseline(history, days), current = rate(history.at(-1), from, to), previous = rate(reference, from, to);
    return reference && current !== null && previous !== null ? {value: (current / previous - 1) * 100, date: reference.date} : null;
  };
  const number = value => value === null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('zh-CN', {minimumFractionDigits: 4, maximumFractionDigits: value < .1 ? 6 : 4}).format(value);
  const money = value => new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 2}).format(value);
  const tone = value => !value || Math.abs(value) < .005 ? 'flat' : value > 0 ? 'up' : 'down';
  const delta = item => {
    if (!item) return '<span class="fx-change flat">—</span>';
    const value = Math.abs(item.value) < .005 ? 0 : item.value;
    return `<span class="fx-change ${tone(value)}" title="与 ${escape(item.date)} 的公布值相比">${value > 0 ? '+' : ''}${value.toFixed(2)}%</span>`;
  };
  function conversionText(amountText, from, to) {
    const amount = Number(amountText), unit = rate(data?.history?.at(-1), from, to);
    return String(amountText).trim() !== '' && Number.isFinite(amount) && amount >= 0 && amount <= 1e12 && unit !== null
      ? money(amount * unit) + ' ' + to : '请输入有效的非负金额';
  }
  const series = (history, days) => {
    const cutoff = dateMs(history.at(-1).date) - days * DAY;
    return history.filter(row => dateMs(row.date) >= cutoff);
  };
  function plot(history, from, to, compact = false) {
    const points = history.map(row => ({date: row.date, value: rate(row, from, to)})).filter(p => p.value !== null);
    if (points.length < 2) return '<p class="method-note">历史数据不足，暂不绘制走势。</p>';
    const values = points.map(p => p.value), low = Math.min(...values), high = Math.max(...values), spread = high - low || high * .002 || .01;
    const small = typeof window !== 'undefined' && window.matchMedia('(max-width:760px)').matches;
    const width = compact ? 110 : small ? 360 : 640, height = compact ? 30 : small ? 210 : 240;
    const left = compact ? 1 : 68, right = compact ? 1 : 18, top = compact ? 3 : 18, bottom = compact ? 3 : 31;
    const minimum = low - spread * .12, maximum = high + spread * .12;
    const first = dateMs(points[0].date), span = dateMs(points.at(-1).date) - first || DAY;
    const x = p => left + (dateMs(p.date) - first) / span * (width - left - right);
    const y = value => top + (maximum - value) / (maximum - minimum) * (height - top - bottom);
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
    const color = tone((values.at(-1) / values[0] - 1) * 100);
    const grid = compact ? '' : [low, (low + high) / 2, high].filter((v, i, all) => all.indexOf(v) === i).map(v => `<line x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}" class="fx-gridline"/><text x="${left-10}" y="${y(v)+3}" text-anchor="end">${escape(number(v))}</text>`).join('');
    const dates = compact ? '' : `<text x="${left}" y="${height-7}">${points[0].date}</text><text x="${width-right}" y="${height-7}" text-anchor="end">${points.at(-1).date}</text>`;
    const dots = compact ? '' : points.map(p => `<circle cx="${x(p)}" cy="${y(p.value)}" r="7" class="fx-hit"><title>${p.date} · 1 ${from} = ${number(p.value)} ${to}</title></circle>`).join('');
    return `<svg class="${compact ? 'fx-spark' : 'fx-chart'} ${color}" viewBox="0 0 ${width} ${height}" ${compact ? 'aria-hidden="true"' : `role="img" aria-label="${from} 兑 ${to}，${points[0].date} 至 ${points.at(-1).date} 汇率走势，纵轴非零起点"`}><title>${from}/${to} · ${points[0].date} — ${points.at(-1).date}</title>${grid}<path d="${path}" class="fx-line"/>${dots}${dates}</svg>`;
  }
  async function load(force = false) {
    if (data && !force) return;
    const response = await fetch('./data/fx.json?t=' + Date.now(), {cache:'no-store'});
    if (!response.ok) throw new Error('FX data unavailable');
    const value = await response.json();
    if (value.schemaVersion !== 1) throw new Error('Unsupported FX data');
    data = value;
  }
  function render(params) {
    if (!data?.history?.length) return `<div class="page-heading"><div><h1>汇率观察</h1><p>主流法币参考汇率与变化趋势。</p></div></div><div class="empty"><strong>汇率数据暂时无法加载。</strong>稍后可以重新读取。<br><button class="quiet-button" id="fx-refresh">重试汇率数据</button></div>`;
    const history = data.history, latest = history.at(-1), currencies = data.currencies;
    const codes = currencies.map(c => c.code), names = Object.fromEntries(currencies.map(c => [c.code,c.name]));
    const quote = codes.includes(params.get('quote')) ? params.get('quote') : 'CNY';
    const requested = params.get('from'), from = codes.includes(requested) && requested !== quote ? requested : quote === 'USD' ? 'EUR' : 'USD';
    const days = params.get('period') === '90' ? 90 : 30;
    const convertFrom = codes.includes(conversion.from) ? conversion.from : from;
    const convertTo = codes.includes(conversion.to) ? conversion.to : quote;
    const convertRate = rate(latest, convertFrom, convertTo);
    const selected = series(history, days), current = rate(latest, from, quote), movement = change(history, from, quote, 1);
    const optionList = selectedCode => currencies.map(c => `<option value="${c.code}" ${c.code === selectedCode ? 'selected' : ''}>${c.code} · ${escape(c.name)}${c.code==='CNY'?'（RMB）':''}</option>`).join('');
    const age = Math.floor((Date.now() - dateMs(latest.date)) / DAY);
    const status = data.status === 'error' ? '本次采集未成功，以下保留上次有效数据。' : age > 4 ? '来源已超过 4 天没有新公布值，请结合数据日期阅读。' : '';
    const checkTime = value => value ? new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)) : '暂无';
    const cards = ['USD','HKD','EUR','JPY','GBP'].filter(code => code !== quote).slice(0,4).map(code => `<button class="fx-spot ${code === from ? 'selected' : ''}" data-fx-from="${code}" aria-pressed="${code === from}"><span class="fx-spot-label"><b>${code} <small>${names[code]}</small></b><span aria-hidden="true">↗</span></span><strong>${number(rate(latest,code,quote))}<small>${quote}</small></strong><span class="fx-spot-bottom"><span>1 ${code} 折合</span>${delta(change(history,code,quote,1))}</span></button>`).join('');
    const rows = currencies.filter(c => c.code !== quote).map(c => `<tr class="${c.code === from ? 'selected' : ''}"><th scope="row"><button data-fx-from="${c.code}"><b>${c.code}</b><span>${escape(c.name)}</span></button></th><td class="fx-rate-cell">${number(rate(latest,c.code,quote))}</td>${[1,7,30].map(d => `<td>${delta(change(history,c.code,quote,d))}</td>`).join('')}<td>${plot(series(history,30),c.code,quote,true)}</td><td><button class="fx-open" data-fx-from="${c.code}" aria-label="查看${escape(c.name)}走势">查看 ↗</button></td></tr>`).join('');
    return `<div class="fx-page"><div class="page-heading"><div><span class="fx-eyebrow">CURRENCY / 汇率</span><h1>看清汇率，也看清变化。</h1><p>主流法币参考价，放在一起比较。</p></div><button class="quiet-button" id="fx-refresh">↻ 刷新数据</button></div><div class="fx-status"><span><i class="live-dot"></i>数据日期 <b>${latest.date}</b></span><span>较前次：${escape(data.previousDate)}</span><span>最近检查 ${checkTime(data.checkedAt)} · 北京时间</span><a href="${escape(data.source.url)}" target="_blank" rel="noopener noreferrer">欧洲央行 ECB ↗</a></div>${status ? `<div class="notice">${escape(status)}${data.lastSuccessfulAt ? ' 最近成功采集：'+checkTime(data.lastSuccessfulAt)+'。' : ''}</div>` : ''}<div class="fx-overview-head"><h2>主流币种速览 <small>变化为较前次公布值</small></h2><label>折算为 <select id="fx-quote" aria-label="折算币种">${optionList(quote)}</select></label></div><div class="fx-spots">${cards}</div><div class="fx-main"><section class="fx-panel"><header class="fx-chart-header"><div><span class="fx-eyebrow">${from} / ${quote}</span><h2>${names[from]}兑${names[quote]}</h2></div><div class="segmented" role="group" aria-label="走势时间范围"><button data-fx-period="30" aria-pressed="${days===30}" class="${days===30?'active':''}">近 30 日</button><button data-fx-period="90" aria-pressed="${days===90}" class="${days===90?'active':''}">近 90 日</button></div></header><div class="fx-chart-value"><strong>${number(current)}</strong><span>1 ${from} = ${number(current)} ${quote}</span>${delta(movement)}</div>${plot(selected,from,quote)}<div class="fx-chart-foot"><span>公布日连线 · 纵轴非零起点</span><span>区间低 ${number(Math.min(...selected.map(r=>rate(r,from,quote))))} / 高 ${number(Math.max(...selected.map(r=>rate(r,from,quote))))}</span></div></section><section class="fx-panel fx-converter"><span class="fx-eyebrow">CONVERT / 换算</span><h2>这笔钱，能换多少？</h2><p>使用 ${latest.date} 的参考汇率估算</p><label for="fx-amount">换算金额</label><input id="fx-amount" type="number" min="0" step="any" value="${escape(conversion.amount)}" inputmode="decimal"><div class="fx-pair"><label>原币种<select id="fx-convert-from">${optionList(convertFrom)}</select></label><button id="fx-swap" aria-label="交换换算币种">⇄</button><label>目标币种<select id="fx-convert-to">${optionList(convertTo)}</select></label></div><div class="fx-conversion" aria-live="polite"><span>约合</span><strong id="fx-result">${escape(conversionText(conversion.amount,convertFrom,convertTo))}</strong><small id="fx-equation">1 ${convertFrom} = ${number(convertRate)} ${convertTo}</small></div><p class="fx-converter-note">参考价不含银行点差、手续费，也不区分现钞与现汇。</p></section></div><section class="fx-panel fx-table-panel"><header><div><h2>全部币种，一眼比较</h2><p>每 1 单位外币可折合多少 ${quote} · 点击币种查看走势</p></div><span>${currencies.length-1} 个货币对</span></header><div class="fx-table-wrap" tabindex="0" role="region" aria-label="主流币种汇率比较表，可横向滚动"><table class="fx-table"><thead><tr><th scope="col">币种</th><th scope="col">折合 ${quote}</th><th scope="col">较前次</th><th scope="col">近 7 日</th><th scope="col">近 30 日</th><th scope="col">30 日走势</th><th scope="col"><span class="sr-only">操作</span></th></tr></thead><tbody>${rows}</tbody></table></div></section><div class="fx-source-note"><b>数据怎么读</b><p>来源：<a href="${escape(data.source.url)}" target="_blank" rel="noopener noreferrer">欧洲央行官方参考汇率 ↗</a>。通常每个工作日欧洲时间约 16:00 发布；周末与休市日不新增报价。本站每半小时检查，但数据频率仍为工作日参考价。</p><p>所有货币对均以同一公布日的欧元报价交叉换算。正值表示该外币相对折算币种升值，负值表示贬值；7 / 30 日变化与对应日期或之前最近公布日相比，历史不足时显示“—”。仅供了解汇率，不代表银行实际成交报价。</p></div></div>`;
  }
  function convert() {
    const input = document.getElementById('fx-amount');
    if (!input || !data?.history?.length) return;
    const from = document.getElementById('fx-convert-from').value, to = document.getElementById('fx-convert-to').value, unit = rate(data.history.at(-1),from,to);
    conversion = {amount: input.value, from, to};
    document.getElementById('fx-result').textContent = conversionText(input.value,from,to);
    document.getElementById('fx-equation').textContent = `1 ${from} = ${number(unit)} ${to}`;
  }
  return {load,render,convert,rate,baseline,change,series};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FX;
