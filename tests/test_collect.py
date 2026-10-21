import sys
from pathlib import Path
import unittest
from datetime import datetime, timezone
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from collect import canonical_url, merge_articles, parse_feed

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


if __name__ == "__main__":
    unittest.main()
