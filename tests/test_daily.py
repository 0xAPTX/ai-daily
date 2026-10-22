from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import daily_edition as daily


def article(id='a', **changes):
    value = dict(id=id, title='Example 发布模型 2', excerpt='Example 发布模型 2，支持工具调用。',
                 date='2026-10-21', publishedAt='2026-10-21T05:00:00+00:00',
                 url='https://example.com/' + id, sourceId='s1', source='来源一',
                 sourceGroup='group1', language='zh', topics=['ai'], kind='official')
    value.update(changes)
    return value


def synthesis():
    return {'overview': {'text': 'Example 发布模型 2，本期收录了这项人工智能产品进展。', 'sourceIds': ['a']},
            'sections': [{'topic': 'ai', 'text': 'Example 发布模型 2，产品提供了工具调用支持。', 'sourceIds': ['a']}]}


class DailyEditionTests(unittest.TestCase):
    def test_source_digest_summarizes_publisher_facts_with_article_references(self):
        plan = daily.plan_edition('2026-10-21', [article()])
        digest = daily.source_digest(plan)
        self.assertIn('支持工具调用', digest['overview']['text'])
        self.assertEqual(digest['overview']['sourceIds'], ['a'])
        self.assertEqual(digest['sections'][0]['text'], article()['excerpt'])

    def test_yesterday_is_a_completed_beijing_day_at_utc_boundary(self):
        self.assertEqual(daily.yesterday(datetime(2026, 10, 21, 15, 59, tzinfo=timezone.utc)), '2026-10-20')
        self.assertEqual(daily.yesterday(datetime(2026, 10, 21, 16, 0, tzinfo=timezone.utc)), '2026-10-21')

    def test_no_other_day_leaks_into_edition_even_with_wrong_date_field(self):
        plan = daily.plan_edition('2026-10-21', [article(), article('wrong', publishedAt='2026-10-21T16:01:00Z'), article('other', date='2026-10-20')])
        self.assertEqual(plan['articleCount'], 1)
        self.assertEqual([a['id'] for s in plan['sections'] for a in s['stories']], ['a'])

    def test_deduplication_and_single_section_assignment(self):
        plan = daily.plan_edition('2026-10-21', [article(topics=['ai', 'stocks']), article('b'), article('c', isPrerelease=True, title='Preview 3')])
        self.assertEqual(plan['articleCount'], 3)
        self.assertEqual(plan['selectedCount'], 1)
        self.assertEqual(plan['sections'][0]['topic'], 'stocks')

    def test_source_diversity_beats_three_items_from_one_publisher(self):
        items = [article(str(i), title='模型 ' + str(i), sourceGroup='same') for i in range(5)]
        items.append(article('distinct', title='独立来源的产品发布', sourceGroup='different', sourceId='s2'))
        chosen = daily.select_stories(items)
        self.assertEqual(len(chosen), 3)
        self.assertIn('distinct', [a['id'] for a in chosen])

    def test_translation_enrichment_does_not_change_selection_or_evidence_hash(self):
        items = [article(str(i), title='Release ' + str(i), language='en', sourceGroup=str(i)) for i in range(5)]
        first = daily.plan_edition('2026-10-21', items)
        items[0].update(titleZh='较早的中文翻译', summaryZh='补齐的中文摘要。')
        second = daily.plan_edition('2026-10-21', items)
        self.assertEqual(first['inputHash'], second['inputHash'])
        self.assertEqual([a['id'] for a in first['sections'][0]['stories']], [a['id'] for a in second['sections'][0]['stories']])

    def test_unknown_cross_section_citations_and_new_numbers_are_rejected(self):
        plan = daily.plan_edition('2026-10-21', [article()])
        good = synthesis()
        self.assertTrue(daily.valid_synthesis(good, plan))
        bad = synthesis(); bad['sections'][0]['sourceIds'] = ['not-in-evidence']
        self.assertFalse(daily.valid_synthesis(bad, plan))
        bad = synthesis(); bad['overview']['text'] += '业绩增长99%。'
        self.assertFalse(daily.valid_synthesis(bad, plan))
        bad = synthesis(); bad['sections'][0]['topic'] = 'hk'
        self.assertFalse(daily.valid_synthesis(bad, plan))

    def test_changed_source_invalidates_synthesis_and_originals_are_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            plan = daily.plan_edition('2026-10-21', [article()])
            daily.write_edition(root, plan, synthesis())
            self.assertEqual(daily.write_edition(root, plan)['summaryMode'], 'ai_synthesis')
            self.assertEqual(daily.write_edition(root, dict(plan, generatedAt='later'))['generatedAt'], plan['generatedAt'])
            revised = daily.plan_edition('2026-10-21', [article(excerpt='更正：只提供有限访问。')])
            output = daily.write_edition(root, revised)
            self.assertEqual(output['summaryMode'], 'source_digest')
            self.assertNotIn('synthesis', output)
            self.assertEqual(output['sections'][0]['stories'][0]['title'], article()['title'])

    def test_build_excludes_incomplete_today_and_removes_expired_editions(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); folder = root / 'site/data/archive'; folder.mkdir(parents=True)
            (folder / '2026-10-21.json').write_text(json.dumps({'articles': [article()]}))
            (folder / '2026-10-22.json').write_text(json.dumps({'articles': [article('today', date='2026-10-22', publishedAt='2026-10-22T00:00:00Z')]}))
            daily.write_edition(root, daily.plan_edition('2026-01-01', []))
            daily.build_all(root, datetime(2026, 10, 22, 5, tzinfo=timezone.utc))
            self.assertEqual([p.stem for p in (root / 'site/data/editions').glob('*.json')], ['2026-10-21'])


if __name__ == '__main__':
    unittest.main()
