import sys
from pathlib import Path
import unittest
from datetime import datetime, timezone
import json
import tempfile
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import collect as collector
from collect import canonical_url, merge_articles, parse_feed, parse_date, parse_anthropic_article, parse_deepseek, cluster_titles, decorate

SOURCE = {"id": "test", "name": "Official", "category": "产品与应用"}
NOW = datetime(2026, 10, 21, 10, tzinfo=timezone.utc)


class FeedTests(unittest.TestCase):
    def test_rss_dates_html_and_unsafe_urls(self):
        payload = b'''<rss><channel>
        <item><title>New &amp; useful</title><link>https://example.com/post?utm_source=rss</link><pubDate>Wed, 21 Oct 2026 01:00:00 GMT</pubDate><description>&lt;p&gt;Publisher excerpt&lt;/p&gt;</description></item>
        <item><title>Unsafe</title><link>javascript:alert(1)</link><pubDate>Wed, 21 Oct 2026 01:00:00 GMT</pubDate></item>
        <item><title>No date</title><link>https://example.com/nodate</link></item>
        <item><title>Future</title><link>https://example.com/future</link><pubDate>Thu, 22 Oct 2026 01:00:00 GMT</pubDate></item>
        </channel></rss>'''
        items = parse_feed(payload, SOURCE, NOW)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["excerpt"], "Publisher excerpt")
        self.assertEqual(items[0]["url"], "https://example.com/post")
        self.assertEqual(items[0]["date"], "2026-10-21")

    def test_atom_uses_publication_not_update(self):
        payload = b'''<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>A paper</title><link href="https://example.com/paper"/><published>2026-10-20T20:00:00Z</published><updated>2026-10-21T01:00:00Z</updated></entry></feed>'''
        article = parse_feed(payload, SOURCE, NOW)[0]
        self.assertEqual(article["date"], "2026-10-21")
        self.assertEqual(article["publishedAt"], "2026-10-20T20:00:00+00:00")
        self.assertEqual(article["category"], "模型与技术")

    def test_merge_retains_history_and_deduplicates(self):
        item = {"url": "https://example.com/a", "sourceId": "test", "title": "A", "publishedAt": "2026-10-20T00:00:00+00:00"}
        other = dict(item, url="https://example.com/a-duplicate")
        self.assertEqual(len(merge_articles([item], [other], NOW)), 1)
        self.assertIsNone(canonical_url("https://user:password@example.com"))

    def test_html_response_is_failure(self):
        with self.assertRaises(ValueError):
            parse_feed(b"<html><body>Blocked</body></html>", SOURCE, NOW)

    def test_chinese_feed_date_and_arxiv_versions(self):
        self.assertEqual(parse_date('2026-10-21 17:00:27  +0800').isoformat(), '2026-10-21T09:00:27+00:00')
        self.assertEqual(canonical_url('http://arxiv.org/abs/2610.12345v2'), 'https://arxiv.org/abs/2610.12345')

    def test_multicategory_paper_is_one_record_with_two_origins(self):
        one = {'id':'a', 'url':'https://arxiv.org/abs/2610.12345','sourceId':'arxiv-ai','source':'arXiv AI','title':'One important research paper','publishedAt':'2026-10-21T00:00:00+00:00'}
        two = dict(one, sourceId='arxiv-ml', source='arXiv ML')
        records = merge_articles([one], [two], NOW)
        self.assertEqual(len(records), 1)
        self.assertEqual(len(records[0]['origins']), 2)
        for origin in records[0]['origins']:
            origin['group'] = 'arXiv'
        self.assertEqual(cluster_titles(records), [])

    def test_anthropic_uses_publication_not_site_edit(self):
        payload = b'<script type="application/ld+json">{"@type":"NewsArticle","headline":"New product","datePublished":"2026-10-18T00:00:00Z","dateModified":"2026-10-21T08:00:00Z","description":"Official description"}</script>'
        article = parse_anthropic_article(payload, 'https://www.anthropic.com/news/test', SOURCE, NOW)
        self.assertEqual(article['date'], '2026-10-18')
        self.assertEqual(article['dateType'], 'published')

    def test_deepseek_changelog_keeps_dated_fragments(self):
        payload = '<article><h2 id="时间-2026-10-17">时间: 2026-10-17</h2><h3>发布更新</h3><p>实际说明。</p><h2 id="时间-2026-09-10">时间: 2026-09-10</h2><h3>旧版更新</h3><p>历史说明。</p></article>'.encode()
        articles = parse_deepseek(payload, dict(SOURCE, feed='https://api-docs.deepseek.com/zh-cn/updates'), NOW)
        self.assertEqual(len(articles), 2)
        self.assertNotEqual(articles[0]['id'], articles[1]['id'])
        self.assertTrue(articles[0]['url'].endswith('#时间-2026-10-17'))
        self.assertEqual(articles[0]['date'], '2026-10-17')

    def test_release_internal_builds_are_excluded(self):
        payload = b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>viable/strict/123</title><link href="https://example.com/internal"/><published>2026-10-21T01:00:00Z</published></entry></feed>'
        self.assertEqual(parse_feed(payload, SOURCE, NOW), [])
        article = decorate({'title':'v2.0.0-rc1'}, dict(SOURCE, feed='https://github.com/test/test/releases.atom',topic='ship'))
        self.assertTrue(article['isPrerelease'])
        self.assertEqual(article['changeType'], '预发布')

    def test_repeated_titles_on_different_days_are_preserved(self):
        one = {'id':'a','url':'https://example.com/one','sourceId':'test','title':'Daily market update','publishedAt':'2026-10-20T00:00:00+00:00','date':'2026-10-20'}
        two = dict(one, id='b', url='https://example.com/two', date='2026-10-21', publishedAt='2026-10-21T00:00:00+00:00')
        self.assertEqual(len(merge_articles([one],[two],NOW)),2)

    def test_archive_preserves_all_records_when_initial_index_is_capped(self):
        source = dict(SOURCE,topic='ai',kind='official',language='en',group='Official',status='ok',adapter='rss',feed='https://example.com/rss',url='https://example.com')
        articles = [{'id':str(i),'url':f'https://example.com/{i}','sourceId':'test','source':'Official','title':f'Unique article number {i}','publishedAt':'2026-10-21T01:00:00+00:00','date':'2026-10-21'} for i in range(45)]
        with tempfile.TemporaryDirectory() as folder, patch.object(collector,'ROOT',Path(folder)):
            data = collector.build_outputs([], articles, [source], NOW, NOW.isoformat())
            self.assertEqual(data['stats']['totalArticles'],45)
            self.assertEqual(len(data['articles']),40)
            archived=json.loads((Path(folder)/'site/data/archive/2026-10-21.json').read_text())
            self.assertEqual(len(archived['articles']),45)
            self.assertTrue((Path(folder)/'site/feed.xml').exists())


if __name__ == "__main__":
    unittest.main()
