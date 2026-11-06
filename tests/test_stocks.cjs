const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const markets=['cn','hk','us','kr'].map((id,i)=>({id,name:['A股','港股','美股','韩股'][i],currency:['CNY','HKD','USD','KRW'][i],stocks:[{name:'Example',code:'ONE',symbol:'ONE',price:100,change:5,changePercent:5,quotedAt:'2026-11-06T02:00:00Z',status:'ok',url:'https://finance.yahoo.com/quote/ONE/'},{name:'Other',code:'TWO',symbol:'TWO',status:'unavailable',url:'https://finance.yahoo.com/quote/TWO/'}]}));
test('four currencies, missing quotes, sorting and text filters render honestly',async()=>{
 const ctx=vm.createContext({URLSearchParams,fetch:async()=>({ok:true,json:async()=>({schemaVersion:1,checkedAt:'2026-11-06T03:00:00Z',markets})})});
 vm.runInContext(fs.readFileSync('site/stocks.js','utf8'),ctx);
 const page=vm.runInContext('StockPrices',ctx);await page.load();
 const overview=page.render(new URLSearchParams({market:'hk'}));
 for(const market of markets)assert.ok(overview.includes(`aria-label="${market.name}股票价格"`));
 assert.doesNotMatch(overview,/data-stock-market/);
 for(const market of markets){const html=page.render(new URLSearchParams({market:market.id,sort:'down'}));assert.match(html,new RegExp(market.currency));assert.match(html,/报价暂不可用/);assert.match(html,/延迟快照/);}
 const filtered=page.render(new URLSearchParams({market:'us',q:'ONE'}));assert.match(filtered,/Example/);assert.doesNotMatch(filtered,/>Other</);
 const empty=page.render(new URLSearchParams({q:'NO_MATCH'}));assert.equal((empty.match(/没有匹配的股票/g)||[]).length,4);
});
test('embedded prices render all four markets without a quote network request',async()=>{
 const snapshot={schemaVersion:1,checkedAt:'2026-11-06T03:00:00Z',markets};
 const requests=[];
 const ctx=vm.createContext({URLSearchParams,
  document:{querySelector:()=>({textContent:JSON.stringify(snapshot)})},
  fetch:async(...args)=>{requests.push(args);throw new Error('offline');}});
 vm.runInContext(fs.readFileSync('site/stocks.js','utf8'),ctx);
 const page=vm.runInContext('StockPrices',ctx);
 assert.equal(page.ready(),true);
 for(const market of markets){await page.load();assert.match(page.render(new URLSearchParams({market:market.id})),/100/);}
 assert.equal(requests.length,0);
 await assert.rejects(page.load(true),/offline/);
 assert.equal(requests.length,1);
 assert.equal(requests[0][1].cache,'no-store');
 assert.match(page.render(new URLSearchParams()),/100/);
});
test('invalid embedded data falls back to a cacheable published snapshot',async()=>{
 let requested;
 const ctx=vm.createContext({URLSearchParams,
  document:{querySelector:()=>({textContent:'invalid json'})},
  fetch:async(url,options)=>{requested={url,options};return {ok:true,json:async()=>({schemaVersion:1,markets})};}});
 vm.runInContext(fs.readFileSync('site/stocks.js','utf8'),ctx);
 const page=vm.runInContext('StockPrices',ctx);await page.load();
 assert.equal(requested.url,'./data/stocks.json');assert.equal(requested.options.cache,'default');
 assert.equal(page.ready(),true);
});
