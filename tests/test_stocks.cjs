const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const markets=['cn','hk','us','kr'].map((id,i)=>({id,name:['A股','港股','美股','韩股'][i],currency:['CNY','HKD','USD','KRW'][i],stocks:[{name:'Example',code:'ONE',symbol:'ONE',price:100,change:5,changePercent:5,quotedAt:'2026-11-06T02:00:00Z',status:'ok',url:'https://finance.yahoo.com/quote/ONE/'},{name:'Other',code:'TWO',symbol:'TWO',status:'unavailable',url:'https://finance.yahoo.com/quote/TWO/'}]}));
test('four currencies, missing quotes, sorting and text filters render honestly',async()=>{
 const ctx=vm.createContext({URLSearchParams,fetch:async()=>({ok:true,json:async()=>({schemaVersion:1,checkedAt:'2026-11-06T03:00:00Z',markets})})});
 vm.runInContext(fs.readFileSync('site/stocks.js','utf8'),ctx);
 const page=vm.runInContext('StockPrices',ctx);await page.load();
 for(const market of markets){const html=page.render(new URLSearchParams({market:market.id,sort:'down'}));assert.match(html,new RegExp(market.currency));assert.match(html,/报价暂不可用/);assert.match(html,/延迟快照/);}
 const filtered=page.render(new URLSearchParams({market:'us',q:'ONE'}));assert.match(filtered,/Example/);assert.doesNotMatch(filtered,/>Other</);
 const empty=page.render(new URLSearchParams({q:'NO_MATCH'}));assert.match(empty,/没有匹配的股票/);
});
