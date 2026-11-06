const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function boot(url){
  const location=new URL(url), events={};
  const ctx=vm.createContext({location,URL,URLSearchParams,
    document:{querySelectorAll:()=>[],addEventListener:(name,fn)=>events[name]=fn},
    window:{addEventListener:(name,fn)=>events[name]=fn},
    history:{replaceState:(_s,_t,url)=>location.href=new URL(url,location).href,
      pushState:(_s,_t,url)=>location.href=new URL(url,location).href}});
  vm.runInContext(fs.readFileSync('site/routing.js','utf8'),ctx);
  return {routes:vm.runInContext('SiteRoutes',ctx),location,events};
}
test('old custom-domain bookmarks migrate with filters and article identity intact',()=>{
  const {routes,location}=boot('https://aptx.dev/#/fx?period=1y&quote=HKD');
  routes.install(()=>{});
  assert.equal(location.href,'https://aptx.dev/fx/?period=1y&quote=HKD');
  assert.equal(routes.current().name,'fx');
  assert.equal(routes.current().params.get('quote'),'HKD');
  const article=boot('https://aptx.dev/newsHub/#/article/2026-11-06/abc123');
  article.routes.install(()=>{});
  assert.equal(article.location.hash,'');
  assert.deepEqual([...article.routes.current().parts],['article','2026-11-06','abc123']);
});
test('clean paths retain filters on reload and history traversal triggers rendering',()=>{
  const {routes,location,events}=boot('https://aptx.dev/news/?topic=conflict&zh=0');
  let renders=0;routes.install(()=>renders++);
  assert.equal(routes.current().params.get('zh'),'0');
  routes.go(routes.href('fx',{period:'90'}));
  assert.equal(location.pathname,'/fx/');assert.equal(location.hash,'');
  events.popstate();assert.equal(renders,2);
});
test('GitHub Pages keeps existing hash links and real static entrypoints exist',()=>{
  const {routes}=boot('https://0xaptx.github.io/ai-daily/#/news?topic=ai');
  assert.equal(routes.href('fx'),'#/fx');
  assert.equal(routes.current().params.get('topic'),'ai');
  for(const name of ['fx','news','tools','article','daily','sources']){
    const html=fs.readFileSync('site/'+name+'/index.html','utf8');
    assert.match(html,/base.href="\.\.\/"/);
    assert.match(html,/routing.js\?v=/);
  }
});
