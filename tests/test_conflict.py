"""Keep the conflict channel scoped to literal conflict and attributed sources."""
from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from collect import is_conflict_news, make_article, decorate
from daily_edition import plan_edition


class ConflictTests(unittest.TestCase):
    def test_literal_conflict_and_humanitarian_context(self):
        for title in ['Ukraine ceasefire talks resume', 'Israeli forces kill four in Gaza', 'US strikes Iran island', '加沙人道援助受阻',
                      '苏丹难民面临饥荒', '以色列宣布停火', 'Military strikes hit port',
                      'UN peacekeeping mission extended']:
            self.assertTrue(is_conflict_news(title), title)
        for title in ['AI price war intensifies', 'US-China trade war',
                      '星球大战推出新游戏', 'Israel wins football match',
                      'Ukraine wheat harvest rises', 'Company releases security patch']:
            self.assertFalse(is_conflict_news(title), title)

    def test_mixed_feeds_filter_before_creating_articles(self):
        source = dict(id='world', name='World', topic='conflict', category='国际冲突',
                      kind='media', conflictOnly=True)
        now = datetime(2026, 11, 3, tzinfo=timezone.utc)
        self.assertIsNone(make_article('Election results', 'https://example.com/a', now, '', source, now))
        self.assertIsNone(make_article('RBA raises interest rates', 'https://example.com/rba', now, 'The war in Iran affects prices.', source, now))
        a = make_article('Ukraine ceasefire talks', 'https://example.com/b', now, '', source, now)
        self.assertEqual(a['topics'], ['conflict'])
        self.assertEqual(a['kind'], 'media')
        self.assertEqual(a['source'], 'World')

    def test_cross_channel_and_newspaper_include_conflict(self):
        a = decorate(dict(id='a', title='Oil rises after airstrikes', date='2026-11-03',
                          publishedAt='2026-11-03T00:00:00Z', url='https://example.com/a'),
                     dict(id='finance', name='Finance', topic='invest', category='市场', kind='media'))
        self.assertEqual(a['topics'], ['invest', 'conflict'])
        plan = plan_edition('2026-11-03', [a])
        section = next(s for s in plan['sections'] if s['topic'] == 'conflict')
        self.assertEqual(section['count'], 1)
        self.assertFalse(any(s['topic'] == 'invest' for s in plan['sections']))


if __name__ == '__main__':
    unittest.main()
