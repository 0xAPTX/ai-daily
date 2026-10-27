"""Publish a one-year inline FX snapshot and compact single-request long ranges."""
from datetime import date
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def year_start(day, years):
    try:
        return day.replace(year=day.year - years)
    except ValueError:
        return day.replace(year=day.year - years, day=28)


def build(site=ROOT / 'site'):
    site = Path(site)
    recent = json.loads((site / 'data/fx.json').read_text())
    if not recent.get('history'):
        return
    directory = site / 'data/fx-history'
    by_day = {}
    for path in sorted(directory.glob('????.json')):
        for row in json.loads(path.read_text())['history']:
            if row['date'] <= recent['asOf']:
                by_day[row['date']] = row
    by_day.update((row['date'], row) for row in recent['history'])
    rows = [by_day[key] for key in sorted(by_day)]
    codes = [currency['code'] for currency in recent['currencies'] if currency['code'] != 'EUR']
    end = date.fromisoformat(recent['asOf'])

    def pack(years):
        start = year_start(end, years).isoformat()
        # The last publication before the boundary proves coverage across holidays.
        before = [row for row in rows if row['date'] <= start]
        first = before[-1]['date'] if before else rows[0]['date']
        selected = [row for row in rows if row['date'] >= first]
        return {'schemaVersion': 1, 'asOf': recent['asOf'], 'startDate': start,
                'codes': codes, 'rows': [[row['date'], *[row['rates'][code] for code in codes]] for row in selected]}

    ranges = {}
    for years in (3, 5, 10):
        start = year_start(end, years).isoformat()
        if rows[0]['date'] > start:
            continue
        text = compact(pack(years)) + '\n'
        digest = hashlib.sha256(text.encode()).hexdigest()[:12]
        name = f'range-{years}y.json'
        (directory / name).write_text(text)
        ranges[f'{years}y'] = './data/fx-history/' + name + '?v=' + digest
    snapshot = {'recent': {key: value for key, value in recent.items() if key != 'history'},
                'history': pack(1), 'ranges': ranges}
    # Never infer a full year from a newly initialized/incomplete archive.
    if rows[0]['date'] > snapshot['history']['startDate']:
        snapshot['history']['startDate'] = rows[0]['date']
    path = site / 'index.html'
    html = path.read_text()
    tag = '<script id="fx-bootstrap" type="application/json">' + compact(snapshot).replace('<', '\\u003c') + '</script>'
    if 'id="fx-bootstrap"' in html:
        html = re.sub(r'<script id="fx-bootstrap" type="application/json">.*?</script>', lambda _: tag, html, flags=re.S)
    else:
        html = html.replace('</head>', '  ' + tag + '\n</head>')
    path.write_text(html)


if __name__ == '__main__':
    build()
