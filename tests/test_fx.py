from datetime import date, datetime, timezone
import importlib.util
import json
from pathlib import Path
import tempfile
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from fx_history import update_history
import unittest

spec = importlib.util.spec_from_file_location('collect_fx', Path(__file__).resolve().parents[1] / 'scripts/collect_fx.py')
fx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fx)


def document(days=('2026-10-23', '2026-10-26'), change=None):
    cubes = []
    for day in days:
        rates = {code: str(2 + i) for i, (code, _) in enumerate(fx.CURRENCIES) if code != 'EUR'}
        if change:
            change(rates)
        cubes.append('<Cube time="' + day + '">' + ''.join(f'<Cube currency="{code}" rate="{rate}"/>' for code, rate in rates.items()) + '</Cube>')
    return '<Envelope xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><Cube>' + ''.join(cubes) + '</Cube></Envelope>'


class FXTests(unittest.TestCase):
    def test_orders_real_publication_dates_without_filling_weekends(self):
        result = fx.parse_rates(document(('2026-10-26', '2026-10-23')), date(2026, 10, 27))
        self.assertEqual([row['date'] for row in result], ['2026-10-23', '2026-10-26'])
        self.assertTrue(all(row['rates']['EUR'] == 1 for row in result))

    def test_rejects_invalid_incomplete_future_and_duplicate_data(self):
        for raw in [document(change=lambda rates: rates.pop('CNY')), document(('2026-10-23', '2026-10-23')),
                    document(('2026-10-23', '2026-10-28')),
                    *(document(change=lambda rates, v=v: rates.update(CNY=v)) for v in ('0', '-1', 'NaN', 'Infinity'))]:
            with self.subTest(raw=raw[:100]), self.assertRaises(ValueError):
                fx.parse_rates(raw, date(2026, 10, 27))

    def test_failure_and_regression_preserve_dated_observations(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'fx.json'
            now = datetime(2026, 10, 27, tzinfo=timezone.utc)
            good = fx.collect(path, lambda: document().encode(), now)
            for fetch in (lambda: b'not xml', lambda: document(('2026-10-21', '2026-10-22')).encode()):
                failed = fx.collect(path, fetch, now)
                self.assertEqual(failed['status'], 'error')
                for key in ('history', 'asOf', 'previousDate', 'lastSuccessfulAt'):
                    self.assertEqual(failed[key], good[key])
                self.assertEqual(json.loads(path.read_text())['history'], good['history'])

    def test_first_failure_has_no_fictional_rates(self):
        with tempfile.TemporaryDirectory() as directory:
            result = fx.collect(Path(directory) / 'fx.json', lambda: b'bad')
            self.assertEqual(result['status'], 'error')
            self.assertNotIn('history', result)


class LongHistoryTests(unittest.TestCase):
    def test_bootstrap_incremental_merge_and_new_year_do_not_redownload_history(self):
        def recent(days):
            rows = fx.parse_rates(document(days), date(2027, 1, 10))
            return {'asOf': rows[-1]['date'], 'history': rows}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            full = document(tuple(f'{year}-01-04' for year in range(2016, 2026)) + ('2026-10-23', '2026-10-26'))
            result = update_history(recent(('2026-10-23', '2026-10-26')), root, lambda: full.encode())
            self.assertEqual(result['status'], 'ok')
            self.assertEqual(len(json.loads((root / 'index.json').read_text())['years']), 11)
            oldest = (root / '2016.json').read_text()
            def forbidden():
                self.fail('Complete history must not be fetched again')
            self.assertEqual(update_history(recent(('2026-10-26', '2026-10-27')), root, forbidden)['status'], 'ok')
            self.assertEqual((root / '2016.json').read_text(), oldest)
            self.assertEqual(json.loads((root / '2026.json').read_text())['history'][-1]['date'], '2026-10-27')
            self.assertEqual(update_history(recent(('2026-12-31', '2027-01-04')), root, forbidden)['status'], 'ok')
            self.assertFalse((root / '2016.json').exists())
            self.assertTrue((root / '2027.json').exists())
            manifest = (root / 'index.json').read_text()
            self.assertEqual(update_history(recent(('2026-10-26', '2026-10-27')), root, forbidden)['status'], 'error')
            self.assertEqual((root / 'index.json').read_text(), manifest)

    def test_incomplete_bootstrap_does_not_publish_a_ten_year_claim(self):
        with tempfile.TemporaryDirectory() as directory:
            recent = {'asOf': '2026-10-26', 'history': fx.parse_rates(document(), date(2026, 10, 27))}
            result = update_history(recent, Path(directory), lambda: document().encode())
            self.assertEqual(result['status'], 'error')
            self.assertFalse((Path(directory) / 'index.json').exists())


if __name__ == '__main__':
    unittest.main()
