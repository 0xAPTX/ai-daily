"""Embed the published stock snapshot so first paint needs no quote request."""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def build(site=ROOT / 'site'):
    site = Path(site)
    source = site / 'data/stocks.json'
    if not source.exists():
        return
    value = json.loads(source.read_text())
    if value.get('schemaVersion') != 1 or len(value.get('markets', [])) != 4:
        raise ValueError('Invalid stock bootstrap')
    snapshot = json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    tag = '<script id="stocks-bootstrap" type="application/json">' + snapshot + '</script>'
    path = site / 'index.html'
    html = path.read_text()
    if 'id="stocks-bootstrap"' in html:
        html = re.sub(r'<script id="stocks-bootstrap" type="application/json">.*?</script>', lambda _: tag, html, flags=re.S)
    else:
        html = html.replace('</head>', '  ' + tag + '\n</head>')
    if path.read_text() != html:
        path.write_text(html)


if __name__ == '__main__':
    build()
