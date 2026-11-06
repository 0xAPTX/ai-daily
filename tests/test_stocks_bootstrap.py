import json
from pathlib import Path
import re
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from build_stocks_bootstrap import build

class StockBootstrapTests(unittest.TestCase):
    def test_embedding_preserves_quotes_dates_and_escapes_html(self):
        with tempfile.TemporaryDirectory() as directory:
            site = Path(directory)
            (site/'data').mkdir()
            (site/'index.html').write_text('<html><head></head><body></body></html>')
            value = {'schemaVersion':1,'checkedAt':'2026-11-06T03:00:00Z',
                     'markets':[{'id':key,'stocks':[{'name':'</script><script>example</script>',
                         'price':123.45,'quotedAt':'2026-11-06T02:00:00Z'}]} for key in ['cn','hk','us','kr']]}
            (site/'data/stocks.json').write_text(json.dumps(value))
            build(site)
            first = (site/'index.html').read_text()
            self.assertNotIn('</script><script>example', first)
            payload = re.search(r'<script id="stocks-bootstrap" type="application/json">(.*?)</script>', first)[1]
            self.assertEqual(json.loads(payload),value)
            build(site)
            self.assertEqual((site/'index.html').read_text(), first)
