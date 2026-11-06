"""Public delayed stock snapshots. Preserve each last good quote on failure."""
import concurrent.futures
from datetime import datetime, timezone, timedelta
import json
import math
from pathlib import Path
import subprocess
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'site/data/stocks.json'
MARKETS = [
    {'id': 'cn', 'name': 'A股', 'currency': 'CNY', 'timezone': 'Asia/Shanghai', 'stocks': [
        ('600519.SS', '600519', '贵州茅台'), ('300750.SZ', '300750', '宁德时代'),
        ('002594.SZ', '002594', '比亚迪'), ('601318.SS', '601318', '中国平安'), ('000001.SZ', '000001', '平安银行'),
        ('600036.SS', '600036', '招商银行'), ('601398.SS', '601398', '工商银行'),
        ('601939.SS', '601939', '建设银行'), ('601988.SS', '601988', '中国银行'),
        ('601288.SS', '601288', '农业银行'), ('600941.SS', '600941', '中国移动'),
        ('600938.SS', '600938', '中国海油'), ('600900.SS', '600900', '长江电力'),
        ('601088.SS', '601088', '中国神华'), ('000333.SZ', '000333', '美的集团'),
        ('000651.SZ', '000651', '格力电器'), ('000858.SZ', '000858', '五粮液'),
        ('603288.SS', '603288', '海天味业'), ('002475.SZ', '002475', '立讯精密'), ('688981.SS', '688981', '中芯国际')]},
    {'id': 'hk', 'name': '港股', 'currency': 'HKD', 'timezone': 'Asia/Hong_Kong', 'stocks': [
        ('0700.HK', '00700', '腾讯控股'), ('9988.HK', '09988', '阿里巴巴'),
        ('3690.HK', '03690', '美团'), ('1810.HK', '01810', '小米集团'), ('0005.HK', '00005', '汇丰控股'),
        ('9618.HK', '09618', '京东集团'), ('9999.HK', '09999', '网易'),
        ('9888.HK', '09888', '百度集团'), ('9626.HK', '09626', '哔哩哔哩'),
        ('0981.HK', '00981', '中芯国际'), ('1024.HK', '01024', '快手'),
        ('1211.HK', '01211', '比亚迪股份'), ('2269.HK', '02269', '药明生物'),
        ('1299.HK', '01299', '友邦保险'), ('0388.HK', '00388', '香港交易所'),
        ('0941.HK', '00941', '中国移动'), ('0883.HK', '00883', '中国海洋石油'),
        ('0939.HK', '00939', '建设银行'), ('2318.HK', '02318', '中国平安'), ('2015.HK', '02015', '理想汽车')]},
    {'id': 'us', 'name': '美股', 'currency': 'USD', 'timezone': 'America/New_York', 'stocks': [
        ('AAPL', 'AAPL', '苹果'), ('MSFT', 'MSFT', '微软'), ('NVDA', 'NVDA', '英伟达'),
        ('AMZN', 'AMZN', '亚马逊'), ('GOOGL', 'GOOGL', 'Alphabet'), ('META', 'META', 'Meta'), ('TSLA', 'TSLA', '特斯拉'),
        ('AMD', 'AMD', '超微半导体'), ('AVGO', 'AVGO', '博通'), ('ORCL', 'ORCL', '甲骨文'),
        ('TSM', 'TSM', '台积电 ADR'), ('NFLX', 'NFLX', '奈飞'), ('ADBE', 'ADBE', 'Adobe'),
        ('CRM', 'CRM', 'Salesforce'), ('PLTR', 'PLTR', 'Palantir'), ('INTC', 'INTC', '英特尔'),
        ('QCOM', 'QCOM', '高通'), ('JPM', 'JPM', '摩根大通'), ('V', 'V', 'Visa'), ('WMT', 'WMT', '沃尔玛')]},
    {'id': 'kr', 'name': '韩股', 'currency': 'KRW', 'timezone': 'Asia/Seoul', 'stocks': [
        ('005930.KS', '005930', '三星电子'), ('000660.KS', '000660', 'SK海力士'),
        ('005380.KS', '005380', '现代汽车'), ('035420.KS', '035420', 'NAVER'), ('373220.KS', '373220', 'LG新能源'),
        ('000270.KS', '000270', '起亚'), ('012330.KS', '012330', '现代摩比斯'),
        ('105560.KS', '105560', 'KB金融'), ('055550.KS', '055550', '新韩金融'),
        ('005490.KS', '005490', '浦项控股'), ('207940.KS', '207940', '三星生物制剂'),
        ('068270.KS', '068270', '赛尔群'), ('006400.KS', '006400', '三星SDI'),
        ('051910.KS', '051910', 'LG化学'), ('012450.KS', '012450', '韩华航空航天'),
        ('034020.KS', '034020', '斗山能源'), ('011200.KS', '011200', 'HMM'),
        ('035720.KS', '035720', 'Kakao'), ('030200.KS', '030200', '韩国电信'), ('086790.KS', '086790', '韩亚金融')]},
]


def parse_quote(payload, symbol, currency, now):
    result = json.loads(payload)['chart']['result'][0]
    meta = result['meta']
    if meta.get('symbol') != symbol or meta.get('currency') != currency:
        raise ValueError('Mismatched quote identity or currency')
    price, previous = meta['regularMarketPrice'], meta.get('previousClose', meta.get('chartPreviousClose'))
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v <= 0 for v in (price, previous)):
        raise ValueError('Invalid price or previous close')
    observed = datetime.fromtimestamp(meta['regularMarketTime'], timezone.utc)
    if observed > now + timedelta(minutes=10):
        raise ValueError('Future quote')
    return {'price': price, 'previousClose': previous, 'change': price - previous,
            'changePercent': (price / previous - 1) * 100,
            'quotedAt': observed.isoformat(), 'exchange': meta.get('exchangeName', ''),
            'currency': currency, 'checkedAt': now.isoformat(), 'status': 'ok'}


def fetch_quote(symbol):
    url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + quote(symbol, safe='') + '?range=1d&interval=5m'
    return subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location',
                           '--proto', '=https', '--proto-redir', '=https', '--max-time', '20',
                           '--retry', '1', '--max-filesize', '2000000', '--user-agent', 'Mozilla/5.0', url],
                          check=True, capture_output=True).stdout


def collect(output=OUTPUT, fetch=fetch_quote, now=None):
    now = now or datetime.now(timezone.utc)
    previous = json.loads(output.read_text()) if output.exists() else {}
    old = {s['symbol']: s for m in previous.get('markets', []) for s in m['stocks']}
    markets = [{**m, 'stocks': []} for m in MARKETS]
    jobs = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for index, market in enumerate(MARKETS):
            for symbol, code, name in market['stocks']:
                jobs.append((index, symbol, code, name, pool.submit(fetch, symbol)))
        for index, symbol, code, name, job in jobs:
            row = {'symbol': symbol, 'code': code, 'name': name,
                   'url': 'https://finance.yahoo.com/quote/' + quote(symbol, safe='') + '/',
                   'currency': markets[index]['currency']}
            try:
                row.update(parse_quote(job.result(), symbol, row['currency'], now))
            except Exception as error:
                row = {**old.get(symbol, {}), **row, 'status': 'stale' if old.get(symbol, {}).get('quotedAt') else 'unavailable',
                       'checkedAt': now.isoformat()}
                print(f'{symbol}: {type(error).__name__}; last good quote retained', flush=True)
            markets[index]['stocks'].append(row)
    result = {'schemaVersion': 1, 'checkedAt': now.isoformat(), 'markets': markets,
              'source': {'name': 'Yahoo Finance', 'url': 'https://finance.yahoo.com/'},
              'frequency': '每半小时检查；延迟快照，非实时行情'}
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(output)
    print(f'Stock quotes: {sum(s["status"]=="ok" for m in markets for s in m["stocks"])} / {len(jobs)} fresh')
    return result


if __name__ == '__main__':
    collect()
