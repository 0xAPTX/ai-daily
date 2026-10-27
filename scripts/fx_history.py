"""Bootstrap ECB history once; merge recent observations into compact year files."""
from datetime import date
import json
from pathlib import Path
import urllib.request

from collect_fx import ROOT, SOURCE_PAGE, parse_rates

HISTORY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml'
HISTORY_DIR = ROOT / 'site/data/fx-history'


def write_json(path, value):
    text = json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n'
    if not path.exists() or path.read_text() != text:
        path.write_text(text)


def update_history(recent, directory=HISTORY_DIR, fetch=None):
    directory = Path(directory)
    manifest_path = directory / 'index.json'
    first_year = int(recent['asOf'][:4]) - 10
    last_year = int(recent['asOf'][:4])
    try:
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
        if manifest.get('asOf', '') > recent['asOf']:
            raise ValueError('Historical source must not regress')
        entries = {entry['year']: entry for entry in manifest.get('years', [])}
        recent_years = {int(row['date'][:4]) for row in recent['history']}
        complete = (manifest.get('schemaVersion') == 1 and all(
            (year in entries and (directory / f'{year}.json').exists()) or
            (year == last_year and year in recent_years and year not in entries and int(manifest.get('asOf', '0000')[:4]) < last_year)
            for year in range(first_year, last_year + 1)))
        grouped = {}
        if not complete:
            if fetch is None:
                def fetch():
                    request = urllib.request.Request(HISTORY_URL, headers={'User-Agent': 'APTX-NewsHub/1.0 (public ECB reference rates)'})
                    with urllib.request.urlopen(request, timeout=60) as response:
                        raw = response.read(16_000_001)
                    if len(raw) > 16_000_000:
                        raise ValueError('Unexpected historical response size')
                    return raw
            observations = parse_rates(fetch(), today=date.fromisoformat(recent['asOf']), since=date(first_year, 1, 1))
            for row in observations:
                grouped.setdefault(int(row['date'][:4]), {})[row['date']] = row
            if not all(year in grouped for year in range(first_year, last_year + 1)):
                raise ValueError('Historical coverage is incomplete')
            entries = {}
        for row in recent['history']:
            year = int(row['date'][:4])
            if year < first_year:
                continue
            if year not in grouped:
                path = directory / f'{year}.json'
                existing = json.loads(path.read_text())['history'] if path.exists() else []
                grouped[year] = {item['date']: item for item in existing}
            grouped[year][row['date']] = row
        directory.mkdir(parents=True, exist_ok=True)
        for year, by_day in grouped.items():
            rows = [by_day[key] for key in sorted(by_day)]
            write_json(directory / f'{year}.json', {'schemaVersion': 1, 'year': year, 'base': 'EUR', 'history': rows})
            entries[year] = {'year': year, 'count': len(rows), 'firstDate': rows[0]['date'], 'lastDate': rows[-1]['date']}
        ordered = [entries[year] for year in range(first_year, last_year + 1)]
        write_json(manifest_path, {
            'schemaVersion': 1, 'base': 'EUR', 'asOf': recent['asOf'],
            'startDate': ordered[0]['firstDate'], 'years': ordered,
            'source': {'url': SOURCE_PAGE, 'dataUrl': HISTORY_URL},
        })
        # Delete only generated year files outside the retained calendar-year window.
        for path in directory.glob('????.json'):
            if path.stem.isdigit() and int(path.stem) < first_year:
                path.unlink()
        return {'status': 'ok', 'startDate': ordered[0]['firstDate'], 'asOf': recent['asOf']}
    except Exception as error:
        print(f'::warning title=ECB long history::{type(error).__name__}; existing historical files preserved')
        return {'status': 'error', 'error': '长期历史本次未能更新，保留已有历史文件。'}
