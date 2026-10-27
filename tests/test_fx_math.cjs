const {test} = require('node:test');
const assert = require('node:assert/strict');
const fx = require('../site/fx.js');
const history = [
  {date:'2026-09-25',rates:{EUR:1,USD:2,CNY:10}},
  {date:'2026-10-16',rates:{EUR:1,USD:2,CNY:11}},
  {date:'2026-10-23',rates:{EUR:1,USD:2,CNY:12}},
  {date:'2026-10-26',rates:{EUR:1,USD:2,CNY:13}},
];
test('cross rates have the declared direction and reciprocal conversion',()=>{
  assert.equal(fx.rate(history[3],'USD','CNY'),6.5);
  assert.equal(fx.rate(history[3],'CNY','USD'),1/6.5);
  assert.equal(fx.rate(history[3],'CNY','CNY'),1);
  assert.equal(fx.rate(history[3],'INVALID','CNY'),null);
  assert.equal(fx.rate({rates:{USD:0,CNY:10}},'USD','CNY'),null);
});
test('previous observation skips weekends; 7 and 30 days use preceding actual publication',()=>{
  assert.equal(fx.baseline(history,1).date,'2026-10-23');
  assert.equal(fx.baseline(history,7).date,'2026-10-16');
  assert.equal(fx.baseline(history,30).date,'2026-09-25');
  assert.ok(Math.abs(fx.change(history,'USD','CNY',1).value-100/12)<1e-10);
  assert.ok(fx.change(history,'CNY','USD',1).value<0);
});
test('insufficient history does not imply zero movement or invented weekend observations',()=>{
  assert.equal(fx.change(history.slice(-1),'USD','CNY',1),null);
  assert.equal(fx.change(history.slice(-2),'USD','CNY',30),null);
  assert.deepEqual(fx.series(history,7).map(r=>r.date),['2026-10-23','2026-10-26']);
});
test('unavailable first load and refresh failures do not invent market data',async t=>{
  t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({schemaVersion:1,status:'error'})}));
  await fx.load(true);
  assert.match(fx.render(new URLSearchParams()),/汇率数据暂时无法加载/);
  globalThis.fetch.mock.mockImplementation(async()=>({ok:true,json:async()=>({schemaVersion:1,status:'error',previousDate:'2026-10-23',checkedAt:'2026-10-27T00:00:00Z',lastSuccessfulAt:'2026-10-26T00:00:00Z',source:{url:'https://www.ecb.europa.eu/'},currencies:[{code:'CNY',name:'人民币'},{code:'USD',name:'美元'},{code:'EUR',name:'欧元'}],history})}));
  await fx.load(true);
  const html=fx.render(new URLSearchParams());
  assert.match(html, /<option value="CNY" selected>.*人民币（RMB）/);
  assert.match(html, /每 1 单位外币可折合多少 CNY/);
  assert.match(html,/本次采集未成功/);
  assert.match(html,/6\.5000/);
  assert.match(html,/2026-10-26/);
  const dollars=fx.render(new URLSearchParams('quote=USD'));
  assert.match(dollars,/欧元兑美元/);
  assert.match(dollars, /<option value="USD" selected>/);
  assert.match(dollars, /每 1 单位外币可折合多少 USD/);
  globalThis.fetch.mock.mockImplementation(async()=>{throw new Error('network');});
  await assert.rejects(fx.load(true));
  assert.match(fx.render(new URLSearchParams()),/6\.5000/);
});
test('multi-year ranges use calendar anniversaries including leap day',()=>{
  assert.equal(new Date(fx.periodStart('2024-02-29','1y')).toISOString().slice(0,10),'2023-02-28');
  assert.equal(new Date(fx.periodStart('2026-10-26','10y')).toISOString().slice(0,10),'2016-10-26');
  assert.deepEqual(fx.series([{date:'2016-10-25'},{date:'2016-10-26'},{date:'2026-10-26'}],'10y').map(r=>r.date),['2016-10-26','2026-10-26']);
});
test('long charts retain endpoints and extrema without inventing observations',()=>{
  const points=Array.from({length:2600},(_,i)=>({date:i,value:Math.sin(i/21)}));
  points[391].value=90;points[1872].value=-65;
  const chosen=fx.samplePoints(points,120);
  assert.ok(chosen.length<=120);
  assert.equal(chosen[0],points[0]);assert.equal(chosen.at(-1),points.at(-1));
  assert.ok(chosen.includes(points[391]));assert.ok(chosen.includes(points[1872]));
  assert.ok(chosen.every((p,i)=>points.includes(p)&&(!i||p.date>chosen[i-1].date)));
});
test('long history loads required years once and reports missing history honestly',async t=>{
  const calls=[], years=Array.from({length:11},(_,i)=>2016+i);
  const recent={schemaVersion:1,status:'ok',asOf:'2026-10-26',previousDate:'2026-10-23',checkedAt:'2026-10-27T00:00:00Z',source:{url:'https://www.ecb.europa.eu/'},currencies:[{code:'CNY',name:'人民币'},{code:'USD',name:'美元'},{code:'EUR',name:'欧元'}],history:history.slice(-2)};
  let fail=false;
  t.mock.method(globalThis,'fetch',async url=>{
    calls.push(String(url));
    if(String(url).includes('/fx.json?'))return {ok:true,json:async()=>recent};
    if(String(url).includes('/index.json?'))return {ok:true,json:async()=>({schemaVersion:1,startDate:'2016-01-04',years:years.map(year=>({year}))})};
    const match=String(url).match(/(\d{4})\.json/);assert.ok(match);
    if(fail)return {ok:false};
    const year=Number(match[1]);
    return {ok:true,json:async()=>({schemaVersion:1,year,base:'EUR',history:[{date:`${year}-01-04`,rates:{EUR:1,USD:2,CNY:8}},{date:`${year}-10-26`,rates:{EUR:1,USD:2,CNY:10}}]})};
  });
  await fx.load(true,new URLSearchParams('period=1y'));
  assert.equal(calls.filter(u=>/\/\d{4}\.json/.test(u)).length,2);
  await fx.load(false,new URLSearchParams('period=10y'));
  assert.equal(calls.filter(u=>/\/\d{4}\.json/.test(u)).length,11);
  const count=calls.length;
  await fx.load(false,new URLSearchParams('period=5y'));
  assert.equal(calls.length,count);
  const html=fx.render(new URLSearchParams('period=10y'));
  for(const key of ['1y','3y','5y','10y'])assert.match(html,new RegExp(`data-fx-period="${key}"`));
  assert.match(html,/2016-10-26 至 2026-10-26/);
  assert.match(html,/区间变化/);
  fail=true;
  await fx.load(true,new URLSearchParams('period=10y'));
  assert.match(fx.render(new URLSearchParams('period=10y')),/长期历史暂时无法读取/);
  assert.doesNotMatch(fx.render(new URLSearchParams('period=10y')),/class="fx-chart /);
  assert.match(fx.render(new URLSearchParams()),/class="fx-chart /);
});
test('hover chooses an actual nearest publication date and clamps chart edges',()=>{
  const points=[{date:'2026-10-23',value:1},{date:'2026-10-26',value:2},{date:'2026-10-27',value:3}];
  const at=day=>Date.parse(day+'T00:00:00Z');
  assert.equal(fx.nearestIndex(points,at('2026-10-24')),0);
  assert.equal(fx.nearestIndex(points,at('2026-10-25')),1);
  assert.equal(fx.nearestIndex(points,at('2026-10-26')),1);
  assert.equal(fx.nearestIndex(points,at('2026-10-28')),2);
  assert.equal(fx.nearestIndex(points,at('2026-10-01')),0);
  assert.equal(fx.nearestIndex(points,(at('2026-10-23')+at('2026-10-26'))/2),0);
  assert.equal(fx.nearestIndex([],at('2026-10-26')),-1);
  assert.equal(fx.nearestIndex(points,NaN),-1);
});
test('hover inspects daily records omitted from a sampled long-term line',()=>{
  const points=Array.from({length:2600},(_,i)=>({date:String(i),time:i*86400000,value:Math.sin(i/13)}));
  const drawn=new Set(fx.samplePoints(points,120));
  const omitted=points.find((p,i)=>i>100&&!drawn.has(p));
  assert.ok(omitted);
  assert.equal(points[fx.nearestIndex(points,omitted.time)],omitted);
});
test('slow response headers and JSON bodies both time out and abort',async t=>{
  let signal;
  t.mock.method(globalThis,'fetch',async(_url,options)=>{signal=options.signal;return new Promise(()=>{});});
  await assert.rejects(fx.readJSON('/slow-headers',20),{name:'TimeoutError'});
  assert.equal(signal.aborted,true);
  globalThis.fetch.mock.mockImplementation(async(_url,options)=>{signal=options.signal;return {ok:true,json:()=>new Promise(()=>{})};});
  await assert.rejects(fx.readJSON('/slow-body',20),{name:'TimeoutError'});
  assert.equal(signal.aborted,true);
});
test('concurrent year switches share the same index and overlapping year requests',async t=>{
  const calls=[],recent={schemaVersion:1,status:'ok',asOf:'2026-10-26',currencies:[{code:'EUR'},{code:'USD'},{code:'CNY'}],history:history.slice(-2)};
  t.mock.method(globalThis,'fetch',async url=>{
    calls.push(String(url));await new Promise(resolve=>setImmediate(resolve));
    if(String(url).includes('/fx.json?'))return {ok:true,json:async()=>recent};
    if(String(url).includes('/index.json?'))return {ok:true,json:async()=>({schemaVersion:1,startDate:'2016-01-04',years:[2023,2024,2025,2026].map(year=>({year}))})};
    const year=Number(String(url).match(/(\d{4})\.json/)[1]);
    return {ok:true,json:async()=>({schemaVersion:1,year,history:[{date:`${year}-01-04`,rates:{EUR:1,USD:2,CNY:10}}]})};
  });
  await fx.loadRecent(true);
  await Promise.all([fx.load(false,new URLSearchParams('period=1y')),fx.load(false,new URLSearchParams('period=3y'))]);
  assert.equal(calls.filter(u=>u.includes('/index.json?')).length,1);
  for(const year of [2023,2024,2025,2026])assert.equal(calls.filter(u=>u.includes(`/${year}.json?`)).length,1);
  assert.equal(fx.ready(new URLSearchParams('period=1y')),true);
});
