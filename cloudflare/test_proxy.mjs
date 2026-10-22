import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import worker from './news-hub.mjs';

afterEach(() => mock.restoreAll());
const html = '<!doctype html><html><head><title>知新</title></head><body></body></html>';

test('apex serves the homepage without redirecting to GitHub', async () => {
  const origin = mock.method(globalThis, 'fetch', async () => new Response(html, {headers: {'content-type': 'text/html', etag: 'old'}}));
  const response = await worker.fetch(new Request('https://aptx.dev/'));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('etag'), null);
  assert.match(body, /<base href="\/">/);
  assert.match(body, /location.search\+"#\/"/);
  assert.equal(String(origin.mock.calls[0].arguments[0]), 'https://0xaptx.github.io/ai-daily/index.html');
});

test('newsHub still defaults to news and keeps its asset base', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(html, {headers: {'content-type': 'text/html'}}));
  for (const path of ['/newsHub', '/newsHub/']) {
    const response = await worker.fetch(new Request('https://www.aptx.dev' + path));
    const body = await response.text();
    assert.match(body, /<base href="\/newsHub\/">/);
    assert.match(body, /location.search\+"#\/news"/);
  }
});

test('assets and newspaper data map correctly at both bases without forwarding credentials', async () => {
  const origin = mock.method(globalThis, 'fetch', async () => new Response('{}', {headers: {'content-type': 'application/json'}}));
  for (const path of ['/data/editions/2026-10-21.json', '/newsHub/data/editions/2026-10-21.json']) {
    await worker.fetch(new Request('https://aptx.dev' + path + '?v=2', {headers: {cookie: 'private', authorization: 'private'}}));
    const [url, options] = origin.mock.calls.at(-1).arguments;
    assert.equal(String(url), 'https://0xaptx.github.io/ai-daily/data/editions/2026-10-21.json?v=2');
    assert.equal(options.headers, undefined);
  }
});

test('origin redirects stay on the custom domain and retain the current base', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(null, {status: 301, headers: {location: 'https://0xaptx.github.io/ai-daily/folder/'}}));
  assert.equal((await worker.fetch(new Request('https://aptx.dev/folder'))).headers.get('location'), 'https://aptx.dev/folder/');
  assert.equal((await worker.fetch(new Request('https://www.aptx.dev/newsHub/folder'))).headers.get('location'), 'https://www.aptx.dev/newsHub/folder/');
});

test('non-read methods and cross-origin redirects are rejected', async () => {
  assert.equal((await worker.fetch(new Request('https://aptx.dev/', {method: 'POST'}))).status, 405);
  mock.method(globalThis, 'fetch', async () => new Response(null, {status: 302, headers: {location: 'https://example.com/'}}));
  assert.equal((await worker.fetch(new Request('https://aptx.dev/'))).status, 502);
});
