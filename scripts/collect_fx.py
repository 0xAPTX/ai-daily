"""Collect official ECB daily reference rates; preserve good history on failure."""
import argparse
from datetime import date, datetime, timezone
import json
import math
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'site/data/fx.json'
SOURCE_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml'
SOURCE_PAGE = 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html'
CURRENCIES = [
    ('CNY', '人民币'), ('USD', '美元'), ('HKD', '港币'), ('EUR', '欧元'),
    ('JPY', '日元'), ('GBP', '英镑'), ('SGD', '新加坡元'), ('AUD', '澳元'),
    ('CAD', '加元'), ('CHF', '瑞士法郎'), ('KRW', '韩元'), ('NZD', '新西兰元'),
    ('THB', '泰铢'), ('MYR', '马来西亚林吉特'), ('INR', '印度卢比'),
]


def parse_rates(raw, today=None):
    today = today or datetime.now(timezone.utc).date()
    required = {code for code, _ in CURRENCIES} - {'EUR'}
    observations = {}
    for cube in ET.fromstring(raw).iter():
        if not cube.tag.endswith('Cube') or 'time' not in cube.attrib:
            continue
        day = cube.attrib['time']
        parsed = date.fromisoformat(day)
        if parsed.isoformat() != day or parsed > today:
            raise ValueError('Invalid or future observation date')
        if day in observations:
            raise ValueError('Duplicate observation date')
        rates = {'EUR': 1.0}
        for item in cube:
            code = item.attrib.get('currency')
            if code not in required:
                continue
            if code in rates:
                raise ValueError('Duplicate currency')
            value = float(item.attrib['rate'])
            if not math.isfinite(value) or value <= 0:
                raise ValueError('Non-positive or non-finite rate')
            rates[code] = value
        if not required.issubset(rates):
            raise ValueError('Incomplete currency coverage')
        observations[day] = {'date': day, 'rates': rates}
    if len(observations) < 2:
        raise ValueError('Insufficient daily reference history')
    return [observations[key] for key in sorted(observations)]


def collect(output=OUTPUT, fetch=None, now=None):
    now = now or datetime.now(timezone.utc)
    stamp = now.isoformat(timespec='seconds')
    output = Path(output)
    previous = json.loads(output.read_text()) if output.exists() else {}
    try:
        if fetch is None:
            def fetch():
                request = urllib.request.Request(SOURCE_URL, headers={'User-Agent': 'APTX-NewsHub/1.0 (public ECB reference rates)'})
                with urllib.request.urlopen(request, timeout=40) as response:
                    raw = response.read(4_000_001)
                if len(raw) > 4_000_000:
                    raise ValueError('Unexpected response size')
                return raw
        history = parse_rates(fetch(), today=now.date())
        if previous.get('asOf', '') > history[-1]['date']:
            raise ValueError('Source regressed to older data')
        payload = {
            'schemaVersion': 1, 'status': 'ok', 'asOf': history[-1]['date'],
            'previousDate': history[-2]['date'], 'base': 'EUR',
            'checkedAt': stamp, 'lastSuccessfulAt': stamp,
            'source': {'name': '欧洲央行 ECB', 'url': SOURCE_PAGE, 'dataUrl': SOURCE_URL},
            'currencies': [{'code': code, 'name': name} for code, name in CURRENCIES],
            'history': history,
        }
    except Exception as error:
        # Preserve dated observations and last successful time, never fabricate a price.
        payload = {**previous, 'schemaVersion': 1, 'status': 'error', 'checkedAt': stamp}
        payload['error'] = '本次采集未成功，保留最近一次有效数据。' if previous.get('history') else '汇率来源暂时无法读取，请稍后重试。'
        print(f'::warning title=ECB reference rates::{type(error).__name__}; existing observations preserved')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    return payload


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input-file', type=Path)
    args = parser.parse_args()
    result = collect(fetch=args.input_file.read_bytes if args.input_file else None)
    print('ECB FX:', result['status'], result.get('asOf', 'no observations'))
