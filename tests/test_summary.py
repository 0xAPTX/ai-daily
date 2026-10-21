import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from summary_utils import choose_candidates, enrich, fingerprint, valid_summary
import summarize


class SummaryTests(unittest.TestCase):
    def setUp(self):
        self.article = {"id": "a", "title": "Example launches model v2", "excerpt": "A new release.", "sourceId": "test", "language": "en", "publishedAt": "2026-10-21T09:00:00+00:00"}
        self.entry = {"titleZh": "Example 发布模型 v2", "summaryZh": "Example 发布了新版本。", "inputHash": fingerprint(self.article), "summarizedAt": "2026-10-21T10:00:00+00:00"}

    def test_cache_invalidates_when_input_changes_and_preserves_originals(self):
        cache = {"entries": {"a": self.entry}}
        item = dict(self.article)
        enrich([item], cache)
        self.assertEqual(item["title"], self.article["title"])
        self.assertEqual(item["summaryZh"], self.entry["summaryZh"])
        item["excerpt"] = "Corrected excerpt"
        enrich([item], cache)
        self.assertNotIn("summaryZh", item)

    def test_bad_and_truncated_model_responses_are_rejected(self):
        self.assertFalse(valid_summary({"titleZh": "Hello", "summaryZh": "No Chinese"}))
        self.assertFalse(valid_summary(dict(self.entry, summaryZh="点击 https://spam.example 获取信息")))
        response = {"choices": [{"finish_reason": "length", "message": {"content": json.dumps(self.entry)}}]}
        with patch.object(summarize, "request_json", return_value=response), self.assertRaises(ValueError):
            summarize.translate(self.article)

    def test_incremental_candidates_skip_completed_and_chinese(self):
        items = [self.article, dict(self.article, id="b", language="zh"), dict(self.article, id="c")]
        self.assertEqual([a["id"] for a in choose_candidates(items, {"entries": {"a": self.entry}}, 10)], ["c"])

    def test_request_uses_only_supplied_evidence_and_constrained_output(self):
        with patch.object(summarize, "request_json", return_value={"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(self.entry)}}]}) as request:
            summarize.translate(self.article)
        payload = request.call_args.args[1]
        evidence = json.loads(payload["messages"][1]["content"])
        self.assertEqual(evidence, {"title": self.article["title"], "publisher_excerpt": self.article["excerpt"]})
        self.assertEqual(payload["temperature"], 0)


if __name__ == "__main__":
    unittest.main()
