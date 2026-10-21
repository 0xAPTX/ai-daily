"""Give static JS/CSS content hashes so browsers refresh changed resources."""
import hashlib
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def main():
    path = ROOT / 'site/index.html'
    original = text = path.read_text()
    for name in ('app.js', 'style.css'):
        digest = hashlib.sha256((ROOT / 'site' / name).read_bytes()).hexdigest()[:12]
        pattern = r'(?P<attr>(?:src|href)=["\'])\./' + re.escape(name) + r'(?:\?v=[0-9a-f]+)?(?P<end>["\'])'
        text, count = re.subn(pattern, lambda match: match['attr'] + './' + name + '?v=' + digest + match['end'], text)
        if count != 1:
            raise ValueError('Expected one asset reference: ' + name)
    if text != original:
        path.write_text(text)


if __name__ == '__main__':
    main()
