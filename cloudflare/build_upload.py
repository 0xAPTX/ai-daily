"""Build the Cloudflare Pages advanced-mode upload, without copying news data."""
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent
target = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/aptx-news-hub.zip')
with ZipFile(target, 'w', ZIP_DEFLATED) as bundle:
    bundle.write(root / 'news-hub.mjs', '_worker.js')
    bundle.writestr('index.html', '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>知新</title><p>请访问 /newsHub</p></html>')
print(target)
