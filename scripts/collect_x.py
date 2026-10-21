"""Opt-in official X API collector. No credential/budget means no API calls.

Pricing checked 2026-10-21: $0.005/post and $0.010/user. Local estimates
conservatively count repeat reads/expanded users; use X console spending limits
for the authoritative billing cap. No cookies, scraping or hidden guest APIs.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json
import math
import os
from pathlib import Path
import re
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from collect import parse_date, write_json

ROOT = Path(__file__).resolve().parents[1]
POST_COST = Decimal("0.005")
USER_COST = Decimal("0.010")


class BudgetExceeded(Exception):
    pass


def usernames(config):
    names = list(dict.fromkeys(str(n).lstrip("@").lower() for n in config.get("usernames", [])))
    if len(names) > 100 or any(not re.fullmatch(r"[A-Za-z0-9_]{1,15}", n) for n in names):
        raise ValueError("Watchlist must contain at most 100 valid usernames")
    return names


def eligible(user, config):
    count = user.get("public_metrics", {}).get("followers_count")
    return (isinstance(count, int) and not isinstance(count, bool) and
            0 <= count < min(int(config.get("maxFollowers", 100000)), 100000) and
            user.get("protected") is not True)


def metric(value, name, fallback=None):
    result = value.get(name, value.get(fallback) if fallback else None)
    return result if isinstance(result, int) and not isinstance(result, bool) and result >= 0 else None


def normalize(post, user, now, config):
    created = parse_date(post.get("created_at"))
    if (not eligible(user, config) or not created or created > now + timedelta(minutes=1) or
            created < now - timedelta(hours=int(config.get("lookbackHours", 48))) or
            not str(post.get("id", "")).isdigit()):
        return None
    metrics = post.get("public_metrics", {})
    likes, reposts, replies, quotes = (metric(metrics, "like_count"), metric(metrics, "repost_count", "retweet_count"), metric(metrics, "reply_count"), metric(metrics, "quote_count"))
    if any(v is None for v in (likes, reposts, replies, quotes)):
        return None  # Incomplete metrics cannot establish heat.
    followers = user["public_metrics"]["followers_count"]
    score = likes + 2 * reposts + replies + 2 * quotes
    threshold = max(int(config.get("minScore", 50)), math.ceil(followers * float(config.get("followerScoreRatio", .005))))
    text = (post.get("note_post") or post.get("note_tweet") or {}).get("text") or post.get("text", "")
    return {"id": str(post["id"]), "authorId": str(user["id"]), "username": user["username"], "name": user.get("name", user["username"]),
            "text": str(text), "createdAt": created.isoformat(), "url": f'https://x.com/{user["username"]}/status/{post["id"]}',
            "followersCount": followers, "followersObservedAt": now.isoformat(), "metricsObservedAt": now.isoformat(),
            "likes": likes, "reposts": reposts, "replies": replies, "quotes": quotes, "impressions": metric(metrics, "impression_count"),
            "score": score, "threshold": threshold, "hot": score >= threshold}


def request_api(path, params, token):
    request = Request("https://api.x.com/2/" + path + "?" + urlencode(params), headers={"Authorization": "Bearer " + token, "User-Agent": "Zhixin-X-monitor/1.0"})
    with urlopen(request, timeout=35) as response:
        value = json.load(response)
    if not isinstance(value, dict):
        raise ValueError("Unexpected API response")
    return value


def reserve(ledger, maximum, budget, root):
    estimated = Decimal(str(ledger.get("reservedUsd", 0))) + maximum
    if estimated > budget:
        raise BudgetExceeded()
    ledger["reservedUsd"] = float(estimated)
    ledger["requests"] = ledger.get("requests", 0) + 1
    # Persist before the call. This is a conservative estimate, not an X invoice.
    write_json(root / "site/data/x-budget.json", ledger)


def collect(config, previous, ledger, token, now, api=request_api, root=ROOT):
    names = usernames(config)
    hours = max(1, min(168, int(config.get("lookbackHours", 48))))
    config = dict(config, lookbackHours=hours)
    output = {"schemaVersion": 1, "checkedAt": now.isoformat(), "lastSuccessAt": previous.get("lastSuccessAt"),
              "status": "not_configured", "watchlist": names, "accounts": [], "posts": [],
              "rule": {"maxFollowersExclusive": min(int(config.get("maxFollowers", 100000)), 100000), "lookbackHours": hours,
                       "minScore": int(config.get("minScore", 50)), "followerScoreRatio": float(config.get("followerScoreRatio", .005)),
                       "formula": "点赞 + 2×转发 + 回复 + 2×引用"}}
    output["candidates"] = [p for p in config.get("candidates", []) if p.get("username", "").lower() in names]
    retained = [p for p in previous.get("posts", []) if p.get("username", "").lower() in names and
                isinstance(p.get("followersCount"), int) and 0 <= p["followersCount"] < output["rule"]["maxFollowersExclusive"] and
                parse_date(p.get("createdAt")) and now - parse_date(p["createdAt"]) <= timedelta(hours=hours)]
    output["posts"] = retained
    output["accounts"] = previous.get("accounts", [])
    if not config.get("enabled") or not token or not names or Decimal(str(config.get("monthlyBudgetUsd", 0))) <= 0:
        output["setupRequired"] = {"enabled": bool(config.get("enabled")), "tokenPresent": bool(token), "watchlistPresent": bool(names), "budgetPresent": Decimal(str(config.get("monthlyBudgetUsd", 0))) > 0}
        return output
    month = now.strftime("%Y-%m")
    if ledger.get("month") != month:
        ledger.clear(); ledger.update(month=month, reservedUsd=0, requests=0)
    budget = Decimal(str(config["monthlyBudgetUsd"]))
    limit = max(10, min(100, int(config.get("maxResults", 20))))
    max_pages = max(1, min(5, int(config.get("maxPages", 1))))
    try:
        reserve(ledger, len(names) * USER_COST, budget, root)
        lookup = api("users/by", {"usernames": ",".join(names), "user.fields": "id,name,username,public_metrics,protected"}, token)
        partial_errors = bool(lookup.get("errors"))
        users = {str(u["id"]): u for u in lookup.get("data", []) if u.get("username", "").lower() in names}
        output["accounts"] = [{"username": name, "eligible": eligible(next((u for u in users.values() if u["username"].lower() == name), {}), config),
                               "followersCount": next((u.get("public_metrics", {}).get("followers_count") for u in users.values() if u["username"].lower() == name), None), "observedAt": now.isoformat()} for name in names]
        allowed = {uid: u for uid, u in users.items() if eligible(u, config)}
        retained = [p for p in retained if p.get("authorId") in allowed]
        posts = {p["id"]: p for p in retained}
        # Remove now-ineligible/unknown authors even if a later search request fails.
        output["posts"] = list(posts.values())
        params = {"query": "(" + " OR ".join("from:" + u["username"] for u in allowed.values()) + ") -is:retweet -is:reply",
                  "start_time": (now - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ"), "max_results": limit,
                  "sort_order": "recency", "expansions": "author_id", "user.fields": "id,name,username,public_metrics,protected"}
        fields = "tweet.fields" if config.get("legacyFields") else "post.fields"
        params[fields] = "id,text,created_at,public_metrics," + ("note_tweet" if config.get("legacyFields") else "note_post") + ",lang"
        truncated = False
        if allowed:
            for page in range(max_pages):
                # Count every requested expanded author as billable; don't assume daily dedup discounts.
                reserve(ledger, limit * (POST_COST + USER_COST), budget, root)
                response = api("tweets/search/recent", params, token)
                partial_errors = partial_errors or bool(response.get("errors"))
                expanded = {str(u["id"]): u for u in response.get("includes", {}).get("users", []) if str(u.get("id")) in allowed}
                for uid, user in expanded.items():
                    if not eligible(user, config):
                        allowed.pop(uid, None)
                        posts = {k: v for k, v in posts.items() if v["authorId"] != uid}
                for post in response.get("data", []):
                    uid = str(post.get("author_id"))
                    if uid not in allowed:
                        continue
                    item = normalize(post, expanded.get(uid, allowed[uid]), now, config)
                    if item:
                        posts[item["id"]] = item
                output["posts"] = list(posts.values())
                next_token = response.get("meta", {}).get("next_token")
                if not next_token:
                    break
                params["next_token"] = next_token
                truncated = page == max_pages - 1
        output.update(status="partial" if truncated or partial_errors else "ok", lastSuccessAt=now.isoformat(), capped=truncated)
    except BudgetExceeded:
        output["status"] = "budget_limited"
    except HTTPError as error:
        output["status"] = "rate_limited" if error.code == 429 else "auth_error" if error.code in (401, 403) else "api_error"
        output["httpStatus"] = error.code
    except Exception as error:
        output["status"] = "api_error"
        print("X API failure:", type(error).__name__)  # Never log headers or bearer token.
    output["posts"] = sorted(output["posts"], key=lambda p: p["createdAt"], reverse=True)
    output["budget"] = {"month": month, "reservedUsd": ledger.get("reservedUsd", 0), "limitUsd": float(budget), "basis": "保守预估，实际计费与硬性限额以 X 控制台为准"}
    return output


def main():
    config = json.loads((ROOT / "x-watchlist.json").read_text())
    path = ROOT / "site/data/x-feed.json"
    budget_path = ROOT / "site/data/x-budget.json"
    previous = json.loads(path.read_text()) if path.exists() else {}
    ledger = json.loads(budget_path.read_text()) if budget_path.exists() else {}
    output = collect(config, previous, ledger, os.environ.get("X_BEARER_TOKEN", ""), datetime.now(timezone.utc))
    write_json(path, output)
    print(json.dumps({"status": output["status"], "accounts": len(output["accounts"]), "posts": len(output["posts"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
