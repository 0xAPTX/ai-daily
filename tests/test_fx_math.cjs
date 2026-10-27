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
