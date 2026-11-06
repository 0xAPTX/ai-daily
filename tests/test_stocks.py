from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import collect_stocks as stocks

NOW = datetime(2026, 11, 6, 5, tzinfo=timezone.utc)
def payload(**fields):
    meta = dict(symbol='AAPL', currency='USD', regularMarketPrice=110, previousClose=100,
                regularMarketTime=NOW.timestamp())
    meta.update(fields)
    return json.dumps({'chart': {'result': [{'meta': meta}]}})

class StocksTests(unittest.TestCase):
    def test_change_uses_previous_session_close_not_intraday_open(self):
        row = stocks.parse_quote(payload(chartPreviousClose=90), 'AAPL', 'USD', NOW)
        self.assertEqual(row['change'], 10)
        self.assertAlmostEqual(row['changePercent'], 10)
        self.assertEqual(row['quotedAt'], NOW.isoformat())

    def test_invalid_identity_currency_price_and_future_time_are_rejected(self):
        for fields in [dict(symbol='MSFT'), dict(currency='HKD'), dict(regularMarketPrice=0),
                       dict(previousClose=None), dict(previousClose=float('nan')),
                       dict(regularMarketTime=NOW.timestamp()+3600)]:
            with self.subTest(fields=fields), self.assertRaises((ValueError, TypeError)):
                stocks.parse_quote(payload(**fields), 'AAPL', 'USD', NOW)

    def test_failure_keeps_last_good_price_and_never_creates_zero(self):
        market = dict(id='us', name='美股', currency='USD', timezone='America/New_York',
                      stocks=[('AAPL','AAPL','苹果'),('MISSING','MISSING','缺失')])
        with tempfile.TemporaryDirectory() as directory, patch.object(stocks, 'MARKETS', [market]):
            output = Path(directory)/'stocks.json'
            good = stocks.parse_quote(payload(), 'AAPL', 'USD', NOW)
            output.write_text(json.dumps({'markets': [{'stocks': [{'symbol':'AAPL', **good}]}]}))
            def fail(_): raise ValueError('temporarily unavailable')
            result = stocks.collect(output, fetch=fail, now=NOW)
            a, missing = result['markets'][0]['stocks']
            self.assertEqual(a['price'], 110)
            self.assertEqual(a['quotedAt'], good['quotedAt'])
            self.assertEqual(a['status'], 'stale')
            self.assertEqual(missing['status'], 'unavailable')
            self.assertNotIn('price', missing)

    def test_four_markets_have_unique_symbols_and_expected_currencies(self):
        self.assertEqual([m['currency'] for m in stocks.MARKETS], ['CNY','HKD','USD','KRW'])
        self.assertEqual([len(m['stocks']) for m in stocks.MARKETS], [20,20,20,20])
        symbols = [s[0] for m in stocks.MARKETS for s in m['stocks']]
        self.assertEqual(len(symbols), len(set(symbols)))
