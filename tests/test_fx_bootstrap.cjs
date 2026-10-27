const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('site/index.html','utf8');
const snapshot=JSON.parse(html.match(/<script id="fx-bootstrap" type="application\/json">(.*?)<\/script>/s)[1]);
const script=fs.readFileSync('site/fx.js','utf8');
const params=period=>new URLSearchParams({period});
const readRange=url=>JSON.parse(fs.readFileSync('site/'+url.split('?')[0].replace('./',''),'utf8'));
function boot(fetch,store=new Map(),hostname="localhost"){
  const ctx=vm.createContext({URLSearchParams,URL,AbortController,setTimeout,clearTimeout,fetch,location:{hostname},
    document:{querySelector:selector=>selector==='#fx-bootstrap'?{textContent:JSON.stringify(snapshot)}:null},
    localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)}
  });
  vm.runInContext(script,ctx);
  return vm.runInContext('FX',ctx);
}

test('published one-year chart is ready without any data network request',async()=>{
  let requests=0;
  const fx=boot(async()=>{requests++;throw new Error('No network');});
  await fx.load(false,params('1y'));
  assert.equal(requests,0);
  assert.equal(fx.ready(params('1y')),true);
  assert.equal(fx.ready(params('3y')),false);
  assert.match(fx.render(params('1y')),/class="fx-chart /);
  assert.ok(fx.render(params('1y')).includes(snapshot.history.asOf+' 汇率走势'));
});

test('each long range takes one request and a later visit reuses its versioned local cache',async()=>{
  const calls=[],store=new Map();
  const fx=boot(async url=>{calls.push(url);return {ok:true,json:async()=>readRange(url)};},store);
  await fx.load(false,params('3y'));
  assert.equal(calls.length,1);
  assert.equal(fx.ready(params('3y')),true);
  await fx.load(false,params('1y'));
  assert.equal(calls.length,1);
  const next=boot(async()=>{throw new Error('Offline');},store);
  await next.load(false,params('3y'));
  assert.equal(next.ready(params('3y')),true);
  assert.match(next.render(params('3y')),/class="fx-chart /);
});

test('a slower short-range response cannot discard an already loaded ten-year range',async()=>{
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const fx=boot(async url=>({ok:true,json:async()=>{if(url.includes('3y'))await gate;return readRange(url);}}));
  const short=fx.load(false,params('3y'));
  await fx.load(false,params('10y'));
  release();await short;
  assert.equal(fx.ready(params('10y')),true);
  assert.match(fx.render(params('10y')),/class="fx-chart /);
});

test('compact snapshots retain every published day and all original currency values',()=>{
  const original=new Map();
  for(const name of fs.readdirSync('site/data/fx-history').filter(name=>/^\d{4}\.json$/.test(name))){
    for(const row of JSON.parse(fs.readFileSync('site/data/fx-history/'+name)).history)original.set(row.date,row.rates);
  }
  for(const row of JSON.parse(fs.readFileSync('site/data/fx.json')).history)original.set(row.date,row.rates);
  for(const packet of [snapshot.history,...Object.values(snapshot.ranges).map(readRange)]){
    const expected=[...original.keys()].filter(day=>day>=packet.startDate&&day<=packet.asOf).sort();
    assert.deepEqual(packet.rows.filter(row=>row[0]>=packet.startDate).map(row=>row[0]),expected);
    for(const row of packet.rows)packet.codes.forEach((code,i)=>assert.equal(row[i+1],original.get(row[0])[code]));
  }
});


test('custom domain reads public history directly and keeps the proxy as fallback',async()=>{
  const calls=[];
  const fx=boot(async(url,options)=>{
    calls.push(url);assert.equal(options.credentials,'omit');
    if(url.startsWith('https://'))throw new Error('Origin temporarily unavailable');
    return {ok:true,json:async()=>readRange(url)};
  },new Map(),'aptx.dev');
  await fx.load(false,params('3y'));
  assert.equal(calls.length,2);
  assert.ok(calls[0].startsWith('https://0xaptx.github.io/ai-daily/data/fx-history/range-3y.json?v='));
  assert.ok(calls[1].startsWith('./data/fx-history/range-3y.json?v='));
  assert.match(fx.render(params('3y')),/class="fx-chart /);
});
