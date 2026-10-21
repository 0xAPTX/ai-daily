"""Collect public publisher feeds; retain publication time and honest source status."""
import concurrent.futures
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import hashlib
import html
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

ROOT = Path(__file__).resolve().parents[1]
UTC = timezone.utc
SHANGHAI = timezone(timedelta(hours=8))
ATOM = "{http://www.w3.org/2005/Atom}"


def text_only(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", " ", value or ""))).strip()


def parse_date(value):
    if not value:
        return None
    try:
        date = parsedate_to_datetime(value)
    except (ValueError, TypeError, OverflowError):
        try:
            date = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None
    return date.replace(tzinfo=UTC) if date.tzinfo is None else date.astimezone(UTC)


def canonical_url(value):
    parts = urlsplit(value.strip())
    if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
        return None
    query = urlencode([(k, v) for k, v in parse_qsl(parts.query) if not k.lower().startswith("utm_")])
    return urlunsplit((parts.scheme, parts.netloc.lower(), parts.path.rstrip("/") or "/", query, ""))


def classify(title, source):
    title = title.lower()
    # Category is an explicit keyword rule, not an AI judgment or a ranking.
    if re.search(r"\b(funding|acqui\w*|invest\w*|partnership|revenue|earnings|billion|quarter|partner\w*)\b", title):
        return "行业与商业"
    if re.search(r"\b(paper|research|benchmark|weights|training|reasoning|dataset|architecture)\b", title):
        return "模型与技术"
    return source["category"]


def parse_feed(payload, source, now):
    root = ET.fromstring(payload)
    entries = root.findall(".//item") or root.findall(ATOM + "entry")
    if not entries and root.tag not in ("rss", ATOM + "feed", "{http://www.w3.org/1999/02/22-rdf-syntax-ns#}RDF"):
        raise ValueError("Response is not a supported RSS/Atom feed")
    articles = []
    for entry in entries:
        title = text_only(entry.findtext("title") or entry.findtext(ATOM + "title"))
        link = entry.findtext("link")
        if not link:
            link = next((e.get("href") for e in entry.findall(ATOM + "link") if e.get("rel", "alternate") == "alternate"), "")
        link = canonical_url(link or "")
        date = parse_date(entry.findtext("pubDate") or entry.findtext(ATOM + "published") or entry.findtext(ATOM + "updated") or entry.findtext("{http://purl.org/dc/elements/1.1/}date"))
        if not title or not link or not date or date > now + timedelta(minutes=10):
            continue
        if date < now - timedelta(days=90):
            continue
        excerpt = text_only(entry.findtext("description") or entry.findtext(ATOM + "summary"))
        # Small publisher excerpt only; do not copy article bodies into the site.
        excerpt = " ".join(excerpt.split()[:22])[:180]
        articles.append({
            "id": hashlib.sha256(link.encode()).hexdigest()[:16],
            "title": title, "url": link, "publishedAt": date.isoformat(),
            "date": date.astimezone(SHANGHAI).date().isoformat(),
            "sourceId": source["id"], "source": source["name"],
            "category": classify(title, source), "excerpt": excerpt,
            "contentType": "publisher_excerpt" if excerpt else "title_only",
        })
    return articles


def fetch_source(source, now):
    payload = subprocess.run([
        "curl", "--fail", "--location", "--silent", "--show-error",
        "--proto", "=https", "--proto-redir", "=https", "--max-time", "35",
        "--max-filesize", "6000000", "--user-agent", "AI-Daily/1.0 public RSS reader",
        source["feed"],
    ], check=True, capture_output=True).stdout
    return parse_feed(payload, source, now)


def merge_articles(previous, incoming, now):
    # Canonical URLs remove tracking variants; title+publisher remove duplicate feed entries.
    by_url = {a["url"]: a for a in previous if parse_date(a.get("publishedAt")) and now - timedelta(days=90) <= parse_date(a["publishedAt"]) <= now + timedelta(minutes=10)}
    by_url.update({a["url"]: a for a in incoming})
    seen = set()
    output = []
    for article in sorted(by_url.values(), key=lambda a: a["publishedAt"], reverse=True):
        key = (article["sourceId"], re.sub(r"\W+", "", article["title"].lower()))
        if key not in seen:
            output.append(article)
            seen.add(key)
    return output


def main():
    now = datetime.now(UTC)
    path = ROOT / "site/data/feed.json"
    previous = json.loads(path.read_text()) if path.exists() else {"articles": [], "sources": []}
    sources = json.loads((ROOT / "sources.json").read_text())
    old_sources = {s["id"]: s for s in previous.get("sources", [])}
    incoming, results = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        jobs = {pool.submit(fetch_source, source, now): source for source in sources}
        for job in concurrent.futures.as_completed(jobs):
            source = jobs[job]
            record = dict(source, checkedAt=now.isoformat())
            try:
                items = job.result()
                incoming.extend(items)
                record.update(status="ok", lastSuccessAt=now.isoformat(), itemCount=len(items))
                print(f'{source["name"]}: {len(items)} recent items')
            except Exception as error:
                record.update(status="error", lastSuccessAt=old_sources.get(source["id"], {}).get("lastSuccessAt"), itemCount=0)
                record["error"] = "本次未能读取订阅源；已保留历史内容。"
                # Avoid printing downloaded HTML or credentials in an exception.
                print(f'{source["name"]}: {type(error).__name__}', file=sys.stderr)
            results.append(record)
    successes = sum(s["status"] == "ok" for s in results)
    data = {
        "generatedAt": now.isoformat(),
        "lastSuccessfulAt": now.isoformat() if successes else previous.get("lastSuccessfulAt"),
        "timezone": "Asia/Shanghai", "retentionDays": 90,
        "summaryMode": "publisher_excerpt",
        "sources": sorted(results, key=lambda s: next(i for i, v in enumerate(sources) if v["id"] == s["id"])),
        "articles": merge_articles(previous.get("articles", []), incoming, now),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)
    if not successes:
        raise SystemExit("All feeds failed. Historical articles were retained; do not deploy as a fresh successful update.")


if __name__ == "__main__":
    main()
