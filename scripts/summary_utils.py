"""Shared, input-bound summary cache. Originals are always retained."""
import hashlib
import json
import re

MODEL = "Qwen3-4B-Instruct-2507 Q4_K_M"
PROMPT_VERSION = "zh-brief-v3-complete-excerpt"


def evidence_excerpt(article):
    text = article.get("excerpt", "")
    end = 0
    for match in re.finditer(r"[.!?。！？][\"'’”]?(?=\s|$)", text):
        prefix = text[:match.end()].rstrip("\"'’”")
        if re.search(r"(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Inc|Corp|Ltd|vs|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|U\.S|U\.K)|\b[A-Z])\.$", prefix):
            continue
        end = match.end()
    return text[:end].strip()


def numeric_tokens(text):
    return set(re.findall(r"\d+(?:\.\d+)*", re.sub(r"(?<=\d),(?=\d{3}(?:\D|$))", "", text)))


def protected_names(title):
    # Preserve company/product acronyms and mixed-case names instead of inventing Chinese entities.
    return sorted(set(re.findall(r"\b(?:[A-Z]{2,}[A-Za-z0-9]*|[A-Za-z]*[a-z][A-Z][A-Za-z0-9]*)\b", title)))


def evidence_valid(article, value):
    title = article["title"]
    original_numbers = numeric_tokens(title)
    # Omission or conversion of critical headline numbers is rejected; original text remains available.
    if numeric_tokens(value["titleZh"]) != original_numbers:
        return False
    if any(name.lower() not in value["titleZh"].lower() for name in protected_names(title)):
        return False
    allowed = numeric_tokens(title + " " + article.get("excerpt", ""))
    # Allow explicit month-name rendering, but no new quantities.
    months = "January February March April May June July August September October November December".split()
    for index, month in enumerate(months, 1):
        if re.search(r"\b" + month[:3] + r"(?:" + month[3:] + r")?\b", title + " " + article.get("excerpt", ""), re.I):
            allowed.add(str(index))
    return numeric_tokens(value["summaryZh"]).issubset(allowed)


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
        if value.get("inputHash") == fingerprint(article) and valid_summary(value) and evidence_valid(article, value):
            article.update({k: value[k] for k in ("titleZh", "summaryZh", "summarizedAt")})
            article.update(summaryModel=MODEL, summaryBasis="title_and_excerpt" if evidence_excerpt(article) else "title_only")
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
