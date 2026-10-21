from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from collect_x import collect, eligible, normalize, reserve, BudgetExceeded

NOW = datetime(2026, 10, 21, 10, tzinfo=timezone.utc)
CONFIG = {"enabled": True, "usernames": ["example"], "monthlyBudgetUsd": 1, "maxPages": 1, "maxResults": 10}
USER = {"id": "1", "username": "example", "name": "Example", "public_metrics": {"followers_count": 99999}}
POST = {"id": "123", "author_id": "1", "text": "An original post", "created_at": (NOW - timedelta(hours=1)).isoformat(), "public_metrics": {"like_count": 500, "repost_count": 10, "reply_count": 2, "quote_count": 1}}


class XTests(unittest.TestCase):
    def test_large_following_list_is_preserved_without_oversized_lookup(self):
        names=[f'account{i}' for i in range(120)]
        config=dict(CONFIG,usernames=names,monthlyBudgetUsd=3)
        api=Mock(return_value={'data':[]})
        with tempfile.TemporaryDirectory() as folder:
            result=collect(config,{}, {},'token',NOW,api=api,root=Path(folder))
        self.assertEqual(len(result['watchlist']),120)
        self.assertTrue(result['monitoringCapped'])
        self.assertEqual(result['status'],'partial')
        self.assertEqual(len(api.call_args.args[1]['usernames'].split(',')),100)

    def test_follower_limit_is_strict_and_unknown_is_excluded(self):
        self.assertTrue(eligible(USER, CONFIG))
        for metrics in ({"followers_count": 100000}, {}, {"followers_count": -1}, {"followers_count": True}):
            self.assertFalse(eligible(dict(USER, public_metrics=metrics), CONFIG))
        self.assertFalse(eligible(dict(USER, protected=True), CONFIG))

    def test_disabled_missing_key_or_budget_never_calls_api(self):
        api = Mock(side_effect=AssertionError("No paid request authorized"))
        for config, token in ((dict(CONFIG, enabled=False), "token"), (CONFIG, ""), (dict(CONFIG, monthlyBudgetUsd=0), "token"), (dict(CONFIG, usernames=[]), "token")):
            self.assertEqual(collect(config, {}, {}, token, NOW, api=api)["status"], "not_configured")
        api.assert_not_called()

    def test_heat_math_long_text_and_legacy_metrics(self):
        item = normalize(dict(POST, note_post={"text": "Full long post"}), USER, NOW, CONFIG)
        self.assertEqual(item["score"], 524)
        self.assertEqual(item["threshold"], 500)
        self.assertTrue(item["hot"])
        self.assertEqual(item["text"], "Full long post")
        legacy = dict(POST, note_tweet={"text": "Legacy full text"}, public_metrics={"like_count": 50, "retweet_count": 3, "reply_count": 1, "quote_count": 0})
        self.assertEqual(normalize(legacy, USER, NOW, CONFIG)["reposts"], 3)
        self.assertIsNone(normalize(dict(POST, public_metrics={}), USER, NOW, CONFIG))

    def test_budget_blocks_call_and_lookup_is_batched(self):
        api = Mock(return_value={"data": [USER]})
        with tempfile.TemporaryDirectory() as folder:
            output = collect(dict(CONFIG, monthlyBudgetUsd=.02), {}, {}, "token", NOW, api=api, root=Path(folder))
            self.assertEqual(output["status"], "budget_limited")
            self.assertEqual(api.call_count, 1)
            self.assertEqual(api.call_args.args[0], "users/by")

    def test_pagination_cap_and_created_time_order(self):
        response = {"data": [POST, dict(POST, id="124", created_at=NOW.isoformat())], "includes": {"users": [USER]}, "meta": {"next_token": "more"}}
        api = Mock(side_effect=[{"data": [USER]}, response])
        with tempfile.TemporaryDirectory() as folder:
            output = collect(CONFIG, {}, {}, "token", NOW, api=api, root=Path(folder))
        self.assertEqual(output["status"], "partial")
        self.assertTrue(output["capped"])
        self.assertEqual([p["id"] for p in output["posts"]], ["124", "123"])
        self.assertIn("post.fields", api.call_args.args[1])

    def test_over_limit_author_removed_even_when_search_not_needed(self):
        post = normalize(POST, USER, NOW, CONFIG)
        api = Mock(return_value={"data": [dict(USER, public_metrics={"followers_count": 100000})]})
        with tempfile.TemporaryDirectory() as folder:
            output = collect(CONFIG, {"posts": [post]}, {}, "token", NOW, api=api, root=Path(folder))
        self.assertEqual(output["posts"], [])
        self.assertEqual(api.call_count, 1)

    def test_partial_search_errors_are_not_reported_as_complete(self):
        api = Mock(side_effect=[{"data": [USER]}, {"errors": [{"detail": "partial result"}]}])
        with tempfile.TemporaryDirectory() as folder:
            output = collect(CONFIG, {}, {}, "token", NOW, api=api, root=Path(folder))
        self.assertEqual(output["status"], "partial")


if __name__ == "__main__":
    unittest.main()
