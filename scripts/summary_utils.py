"""Shared, input-bound summary cache. Originals are always retained."""
import hashlib
import json
import re

MODEL = "Qwen2.5-1.5B-Instruct Q4_K_M"
PROMPT_VERSION = "zh-brief-v1"


def fingerprint(article):
    text = json.dumps([PROMPT_VERSION, article["title"], article.get("excerpt", "")], ensure_ascii=False)
    return hashlib.sha256(text.encode()).hexdigest()


def valid_summary(value):
    return (isinstance(value, dict) and all(isinstance(value.get(k), str) and
            2 <= len(value[k]) <= limit and re.search(r"[\u3400-\u9fff]", value[k])
            for k, limit in (("titleZh", 160), ("summaryZh", 240)))
            and not any(re.search(r"<|https?://|作为.{0,5}(模型|助手)", value[k]) for k in ("titleZh", "summaryZh")))


def read_cache(root):
    path = root / "site/data/summaries.json"
    return json.loads(path.read_text()) if path.exists() else {"entries": {}}


def enrich(articles, cache):
    entries = cache.get("entries", {})
    for article in articles:
        for key in ("titleZh", "summaryZh", "summaryModel", "summarizedAt", "summaryBasis"):
            article.pop(key, None)
        value = entries.get(article["id"], {})
        if value.get("inputHash") == fingerprint(article) and valid_summary(value):
            article.update({k: value[k] for k in ("titleZh", "summaryZh", "summarizedAt")})
            article.update(summaryModel=MODEL, summaryBasis="title_and_excerpt" if article.get("excerpt") else "title_only")
    return articles


def choose_candidates(articles, cache, limit):
    pending = [a for a in articles if a.get("language") != "zh" and
               not (cache.get("entries", {}).get(a["id"], {}).get("inputHash") == fingerprint(a)
                    and valid_summary(cache["entries"][a["id"]]))]
    # Recent reading first, then rotate across channels and publishers to avoid a paper/release flood.
    ordered = sorted(pending, key=lambda a: a["publishedAt"], reverse=True)
    selected = ordered[:min(16, limit)]
    ids = {a["id"] for a in selected}
    for quota in (1, 2, 4, 8, 9999):
        counts = {}
        for a in selected:
            group = a.get("sourceGroup", a["sourceId"])
            counts[group] = counts.get(group, 0) + 1
        for a in ordered:
            group = a.get("sourceGroup", a["sourceId"])
            if len(selected) >= limit:
                return selected
            if a["id"] not in ids and counts.get(group, 0) < quota:
                selected.append(a); ids.add(a["id"]); counts[group] = counts.get(group, 0) + 1
    return selected
