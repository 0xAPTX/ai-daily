import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from summary_utils import choose_candidates, enrich, evidence_excerpt, evidence_valid, fingerprint, protected_names, valid_summary
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
        self.assertEqual(evidence, {"title": self.article["title"], "publisher_excerpt": self.article["excerpt"], "preserve_names": []})
        self.assertEqual(payload["temperature"], 0)

    def test_changed_amounts_and_lost_company_names_are_rejected(self):
        article = dict(self.article, title="Shinhan, SBI send $109M in 2 days", excerpt="")
        self.assertFalse(evidence_valid(article, {"titleZh": "银行在2天内转账1090万美元", "summaryZh": "银行转账"}))
        self.assertTrue(evidence_valid(article, {"titleZh": "Shinhan、SBI在2天内转账$109M", "summaryZh": "转账$109M"}))

    def test_title_only_has_no_model_added_paragraph(self):
        response = {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(dict(self.entry, summaryZh="模型添加的解释不应保留"))}}]}
        with patch.object(summarize, "request_json", return_value=response):
            result = summarize.translate(dict(self.article, excerpt=""))
        self.assertEqual(result["summaryZh"], result["titleZh"])

    def test_incomplete_publisher_sentence_is_not_sent_to_model(self):
        self.assertEqual(evidence_excerpt({"excerpt": "A complete sentence. The rest is"}), "A complete sentence.")
        self.assertEqual(evidence_excerpt({"excerpt": "NVIDIA announced new tools, along"}), "")
        self.assertEqual(evidence_excerpt({"excerpt": "The U.S. government plans to"}), "")
        self.assertEqual(evidence_excerpt({"excerpt": "Nov. 5 is the target."}), "Nov. 5 is the target.")


if __name__ == "__main__":
    unittest.main()
