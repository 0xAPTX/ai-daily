"""Twice-daily official X following sync. Disabled/no token/zero budget => no API calls.

Only a fully validated, complete snapshot replaces the prior list. Failed or
capped pagination preserves all prior follow relationships. No browser cookies.
"""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json
import os
from pathlib import Path
import re
from urllib.error import HTTPError

from collect import parse_date, write_json
from collect_x import BudgetExceeded, USER_COST, request_api, reserve

ROOT = Path(__file__).resolve().parents[1]
SHANGHAI = timezone(timedelta(hours=8))


def sync_window(value):
    # Anchor half-day windows to the scheduled 07:43 / 19:43 Beijing runs.
    # A delayed morning run must not suppress the evening run.
    shifted = value.astimezone(SHANGHAI) - timedelta(hours=7, minutes=43)
    return shifted.date(), shifted.hour // 12


def sync_following(config, previous, ledger, token, now, api=request_api, root=ROOT):
    settings = config.get('followingSync', {})
    owner = str(settings.get('owner', '0xAPTX')).lstrip('@')
    status = {'schemaVersion': 1, 'owner': owner, 'checkedAt': now.isoformat(),
              'lastSuccessAt': previous.get('lastSuccessAt'), 'status': 'disabled',
              'schedule': '每天北京时间 07:43、19:43（每 12 小时），GitHub 调度可能延迟',
              'count': config.get('followingImport', {}).get('count', 0)}
    result = {'status': status, 'config': config, 'snapshot': None}
    if not settings.get('enabled'):
        return result
    budget = Decimal(str(config.get('monthlyBudgetUsd', 0)))
    if not token or budget <= 0:
        status.update(status='not_configured', tokenPresent=bool(token), budgetPresent=budget > 0)
        return result
    if not re.fullmatch(r'[A-Za-z0-9_]{1,15}', owner):
        status['status'] = 'invalid_config'
        return result
    last = parse_date(previous.get('lastSuccessAt'))
    if last and sync_window(last) == sync_window(now):
        status['status'] = 'ok'  # Avoid duplicate paid syncs within the same scheduled half-day.
        status['skippedAlreadySynced'] = True
        return result
    month = now.strftime('%Y-%m')
    if ledger.get('month') != month:
        ledger.clear()
        ledger.update(month=month, reservedUsd=0, requests=0)
    page_size = max(1, min(100, int(settings.get('pageSize', 100))))
    max_pages = max(1, min(50, int(settings.get('maxPages', 50))))
    try:
        reserve(ledger, USER_COST, budget, root)
        response = api('users/by/username/' + owner, {'user.fields': 'id,name,username,public_metrics'}, token)
        user = response.get('data', {})
        user_id = str(user.get('id', ''))
        expected = user.get('public_metrics', {}).get('following_count')
        if response.get('errors') or not user_id.isdigit() or str(user.get('username', '')).lower() != owner.lower() or type(expected) is not int or expected < 0:
            raise ValueError('Incomplete owner lookup')
        accounts, seen, tokens = [], set(), set()
        params = {'max_results': page_size, 'user.fields': 'id,name,username'}
        for page in range(max_pages):
            # Reserve the whole requested page before reading. Do not rely on
            # a discount or an earlier following count as a spending guarantee.
            reserve(ledger, page_size * USER_COST, budget, root)
            response = api('users/' + user_id + '/following', params, token)
            rows = response.get('data', [])
            meta = response.get('meta', {})
            if response.get('errors') or not isinstance(rows, list) or len(rows) > page_size or meta.get('result_count') != len(rows):
                raise ValueError('Incomplete following page')
            for row in rows:
                name = str(row.get('username', ''))
                if not re.fullmatch(r'[A-Za-z0-9_]{1,15}', name) or name.lower() in seen:
                    raise ValueError('Invalid or duplicate following account')
                seen.add(name.lower())
                accounts.append({'username': name, 'name': str(row.get('name') or name), 'url': 'https://x.com/' + name})
            next_token = meta.get('next_token')
            if not next_token:
                break
            if page == max_pages - 1 or next_token in tokens:
                status['status'] = 'partial'
                return result
            tokens.add(next_token)
            params['pagination_token'] = next_token
        if len(accounts) != expected:
            # An API error or follow changes during pagination must not silently
            # delete relationships. Try again next day; keep the good snapshot.
            status['status'] = 'partial'
            return result
        updated = deepcopy(config)
        extras = updated.get('supplementalCandidates', [p for p in config.get('candidates', []) if p.get('origin') != 'following'])
        updated['supplementalCandidates'] = extras
        imported = dict(owner=owner, sourceUrl=f'https://x.com/{owner}/following', importedAt=now.isoformat(),
                        expectedCount=expected, count=len(accounts), method='official_api')
        profiles = [dict(a, origin='following', referenceUrl=imported['sourceUrl']) for a in accounts]
        profiles += [p for p in extras if p['username'].lower() not in seen]
        updated.update(followingImport=imported, candidates=profiles, usernames=[p['username'].lower() for p in profiles])
        snapshot = dict(imported, accounts=accounts)
        status.update(status='ok', lastSuccessAt=now.isoformat(), count=len(accounts))
        result.update(config=updated, snapshot=snapshot)
    except BudgetExceeded:
        status['status'] = 'budget_limited'
    except HTTPError as error:
        status['status'] = 'rate_limited' if error.code == 429 else 'auth_error' if error.code in (401, 403) else 'api_error'
        status['httpStatus'] = error.code
    except Exception as error:
        status['status'] = 'api_error'
        print('Following sync failure:', type(error).__name__)  # Never print token/response.
    finally:
        status['budget'] = {'month': month, 'reservedUsd': ledger.get('reservedUsd', 0), 'limitUsd': float(budget)}
    return result


def main():
    config_path = ROOT / 'x-watchlist.json'
    config = json.loads(config_path.read_text())
    path = ROOT / 'site/data/x-following-status.json'
    budget_path = ROOT / 'site/data/x-budget.json'
    previous = json.loads(path.read_text()) if path.exists() else {}
    ledger = json.loads(budget_path.read_text()) if budget_path.exists() else {}
    result = sync_following(config, previous, ledger, os.environ.get('X_BEARER_TOKEN', ''), datetime.now(timezone.utc))
    if result['snapshot'] is not None:
        write_json(ROOT / 'imports/0xaptx-following.json', result['snapshot'])
        write_json(config_path, result['config'])
    write_json(path, result['status'])
    print(json.dumps({'status': result['status']['status'], 'count': result['status']['count']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
