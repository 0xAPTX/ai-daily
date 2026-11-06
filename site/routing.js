'use strict';
const SiteRoutes = (() => {
  const names = ['news','fx','tools','daily','hot','x','sources','saved','about','article'];
  const clean = ['aptx.dev','www.aptx.dev','localhost','127.0.0.1'].includes(location.hostname);
  let changed = () => {};
  function href(path='', params={}) {
    const parts=path.replace(/^\/+|\/+$/g,'').split('/').filter(Boolean);
    const q=new URLSearchParams(Object.entries(params).filter(([,v])=>v!==''&&v!=null));
    if(clean&&parts[0]==='article'&&parts.length===3){q.set('date',parts[1]);q.set('id',parts[2]);parts.splice(1);}
    return (clean?'/'+parts.join('/')+(parts.length?'/':''):'#/'+parts.join('/'))+(q.size?'?'+q:'');
  }
  function fromHash(hash) {
    const [path,query]=hash.slice(2).split('?');
    return href(path,Object.fromEntries(new URLSearchParams(query||'')));
  }
  function current() {
    const legacy=location.hash.startsWith('#/');
    const value=legacy?location.hash.slice(1):clean?location.pathname.replace(/^\/newsHub\/?/,'/'):'/';
    const [path,query]=value.split('?');
    const parts=path.split('/').filter(Boolean);
    const params=new URLSearchParams(legacy?query||'':clean?location.search:'');
    if(clean&&!legacy&&parts[0]==='article'){parts.push(params.get('date')||'',params.get('id')||'');}
    return {name:parts[0]||'home',parts,params};
  }
  function normalizeLinks() {
    if(clean)document.querySelectorAll('a[href^="#/"]').forEach(a=>a.setAttribute('href',fromHash(a.getAttribute('href'))));
  }
  function go(url) {
    if(!clean){location.hash=url.startsWith('#')?url.slice(1):url;return;}
    history.pushState(null,'',url.startsWith('#/')?fromHash(url):url);changed();
  }
  function install(onChange) {
    changed=onChange;
    if(clean&&location.hash.startsWith('#/'))history.replaceState(null,'',fromHash(location.hash));
    normalizeLinks();
    window.addEventListener('popstate',changed);
    window.addEventListener('hashchange',()=>{
      if(clean&&location.hash.startsWith('#/'))history.replaceState(null,'',fromHash(location.hash));
      changed();
    });
    document.addEventListener('click',event=>{
      if(!clean||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const a=event.target.closest('a[href]');
      if(!a||a.hasAttribute('download')||(a.target&&a.target!=='_self'))return;
      const raw=a.getAttribute('href');
      if(raw.startsWith('#')&&!raw.startsWith('#/'))return;
      const url=new URL(raw.startsWith('#/')?fromHash(raw):a.href,location.href);
      if(url.origin!==location.origin||url.hash)return;
      if(url.pathname!=='/'&&!names.some(name=>url.pathname==='/'+name||url.pathname==='/'+name+'/'))return;
      event.preventDefault();go(url.pathname+url.search);
    });
  }
  return {href,current,normalizeLinks,go,install};
})();
