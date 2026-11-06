"""Give static JS/CSS content hashes so browsers refresh changed resources."""
import hashlib
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def main():
    from build_fx_bootstrap import build
    build()
    path = ROOT / 'site/index.html'
    original = text = path.read_text()
    for name in ('app.js', 'routing.js', 'fx.js', 'stocks.js', 'tools.js', 'style.css'):
        digest = hashlib.sha256((ROOT / 'site' / name).read_bytes()).hexdigest()[:12]
        pattern = r'(?P<attr>(?:src|href)=["\'])\./' + re.escape(name) + r'(?:\?v=[0-9a-f]+)?(?P<end>["\'])'
        text, count = re.subn(pattern, lambda match: match['attr'] + './' + name + '?v=' + digest + match['end'], text)
        if count != 1:
            raise ValueError('Expected one asset reference: ' + name)
    if text != original:
        path.write_text(text)
    # Real static entrypoints let clean URLs survive refresh on GitHub Pages and
    # the existing custom-domain proxy. The proxy supplies its own root base.
    shell = text.replace('<head>', '<head><script>if(!document.querySelector("base")){const base=document.createElement("base");base.href="../";document.head.append(base);}</script>', 1)
    for name in ('news','fx','stocks','tools','daily','hot','x','sources','saved','about','article'):
        target=ROOT/'site'/name/'index.html'
        target.parent.mkdir(parents=True,exist_ok=True)
        if not target.exists() or target.read_text()!=shell:target.write_text(shell)


if __name__ == '__main__':
    main()
