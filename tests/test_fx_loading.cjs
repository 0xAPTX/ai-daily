const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('FX opens without the news index; switching away from a pending year never gets overwritten',async()=>{
  const nodes=new Map(),events={},urls=[];
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',value:'',dataset:{},hidden:false,addEventListener(){},focus(){},showModal(){},close(){},insertAdjacentHTML(_where,text){this.innerHTML+=text;}});return nodes.get(selector);};
  const latest={date:'2026-10-26',rates:{EUR:1,USD:2,CNY:13}};
  const recent={schemaVersion:1,status:'ok',asOf:latest.date,previousDate:'2026-10-23',source:{url:'https://www.ecb.europa.eu/'},currencies:[{code:'CNY',name:'人民币'},{code:'USD',name:'美元'},{code:'EUR',name:'欧元'}],history:[{date:'2026-10-23',rates:{EUR:1,USD:2,CNY:12}},latest]};
  let releaseIndex;
  const pendingIndex=new Promise(resolve=>{releaseIndex=resolve;});
  const ctx=vm.createContext({URLSearchParams,AbortController,setTimeout,clearTimeout,
    location:{hash:'#/fx?period=1y',hostname:'localhost',pathname:'/',search:''},
    localStorage:{getItem(){return null;},setItem(){}},
    document:{querySelector:s=>s==='.fx-chart-wrap'?null:node(s),querySelectorAll:()=>[],addEventListener(){},documentElement:{dataset:{}},title:''},
    window:{addEventListener:(type,callback)=>{events[type]=callback;},scrollTo(){},matchMedia:()=>({matches:false})},
    fetch:async url=>{
      urls.push(String(url));
      if(String(url).includes('/fx.json?'))return {ok:true,json:async()=>recent};
      if(String(url).includes('/index.json?'))return {ok:true,json:()=>pendingIndex};
      if(String(url).includes('/feed.json?'))return {ok:true,json:async()=>({schemaVersion:2,sources:[],articles:[],archives:[],stats:{healthySources:0,quietSources:0},generatedAt:'2026-10-27T00:00:00Z'})};
      const year=Number(String(url).match(/(\d{4})\.json/)[1]);
      return {ok:true,json:async()=>({schemaVersion:1,year,history:[{date:`${year}-01-02`,rates:{EUR:1,USD:2,CNY:10}},...(year===2026?[latest]:[])]})};
    }
  });
  vm.runInContext(fs.readFileSync('site/fx.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync('site/app.js','utf8'),ctx);
  for(let i=0;i<4;i++)await tick();
  assert.ok(!urls.some(u=>u.includes('/feed.json?')));
  assert.match(node('#main').innerHTML,/正在读取所选范围/);
  assert.match(node('#main').innerHTML,/id="fx-amount"/);
  assert.match(node('#main').innerHTML,/data-fx-period="90"/);
  ctx.location.hash='#/fx?period=90';events.hashchange();
  for(let i=0;i<3;i++)await tick();
  assert.match(node('#main').innerHTML,/data-fx-period="90" aria-pressed="true"/);
  assert.match(node('#main').innerHTML,/class="fx-chart /);
  releaseIndex({schemaVersion:1,startDate:'2016-01-04',years:[{year:2025},{year:2026}]});
  for(let i=0;i<4;i++)await tick();
  assert.match(node('#main').innerHTML,/data-fx-period="90" aria-pressed="true"/);
  ctx.location.hash='#/news';events.hashchange();
  for(let i=0;i<4;i++)await tick();
  assert.equal(urls.filter(u=>u.includes('/feed.json?')).length,1);
  assert.match(node('#main').innerHTML,/资讯总览/);
});
