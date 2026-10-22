// Cloudflare Pages Function: retain the custom domain at / and at /newsHub.
const PREFIX = '/newsHub';
const ORIGIN = 'https://0xaptx.github.io/ai-daily/';

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const mounted = incoming.pathname === PREFIX || incoming.pathname.startsWith(PREFIX + '/');
    const base = mounted ? PREFIX + '/' : '/';
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const suffix = (mounted ? incoming.pathname.slice(PREFIX.length) : incoming.pathname).replace(/^\//, '');
    const upstream = new URL(suffix || 'index.html', ORIGIN);
    // Keep this a fixed public-site proxy, including after URL normalization.
    if (!upstream.href.startsWith(ORIGIN)) {
      return new Response('Not found', { status: 404 });
    }
    upstream.search = incoming.search;
    let origin;
    try {
      // Do not forward visitor cookies, credentials, or arbitrary request headers.
      origin = await fetch(upstream, {
        method: request.method,
        redirect: 'manual',
        cf: { cacheTtl: 60, cacheEverything: true },
      });
    } catch {
      return new Response('资讯站暂时无法连接，请稍后刷新。', {
        status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    const headers = new Headers(origin.headers);
    headers.delete('set-cookie');
    headers.set('X-NewsHub-Version', '2026-10-22-2');
    headers.set('Cache-Control', 'no-cache');
    if (origin.status >= 300 && origin.status < 400) {
      const location = headers.get('location');
      const target = location && new URL(location, upstream);
      if (!target || !target.href.startsWith(ORIGIN)) {
        return new Response('Unexpected upstream redirect', { status: 502 });
      }
      headers.set('location', incoming.origin + base + target.href.slice(ORIGIN.length));
    }
    const isHtml = (headers.get('content-type') || '').includes('text/html');
    if (request.method === 'GET' && origin.ok && isHtml) {
      const html = (await origin.text()).replace(/<head>/i,
        '<head><base href="' + base + '">' +
        '<script>if(!location.hash){history.replaceState(null,"",location.pathname+location.search+"' + (mounted ? '#/news' : '#/') + '");}</script>');
      for (const name of ['content-length', 'content-encoding', 'etag', 'last-modified']) headers.delete(name);
      return new Response(html, { status: origin.status, headers });
    }
    return new Response(request.method === 'HEAD' ? null : origin.body, { status: origin.status, headers });
  },
};
