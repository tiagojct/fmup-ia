#!/usr/bin/env python3
"""Check local links/assets/anchors in the merged Quarto output, offline."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse, urljoin, unquote
import json, sys
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'_site';BASE='https://tiagojacinto.eu/fmup-ia/'
class Page(HTMLParser):
    def __init__(self,path):
        super().__init__();self.ids=set();self.links=[];self.feed(path.read_text(errors='replace'))
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.add(a['id'])
        for k in ('href','src'):
            if a.get(k):self.links.append(a[k])
pages={str(p.relative_to(OUT)):Page(p) for p in OUT.rglob('*.html') if 'site_libs' not in p.parts and 'node_modules' not in p.parts}
if not pages:sys.exit('No rendered HTML: run quarto render first.')
errors=[]
def check(source,link):
    u=urlparse(urljoin(BASE+source,link))
    if u.netloc!='tiagojacinto.eu' or not u.path.startswith('/fmup-ia/'):return
    path=unquote(u.path[len('/fmup-ia/'):]);p=OUT/path
    if p.is_dir():p=p/'index.html'
    if not p.exists():errors.append(f'{source}: missing {link}');return
    key=str(p.relative_to(OUT));frag=unquote(u.fragment)
    if frag and key in pages and frag not in pages[key].ids and not frag.startswith(('/', 's=')):
        errors.append(f'{source}: missing anchor {link}')
for src,page in pages.items():
    for link in page.links:check(src,link)
for rule in json.loads((ROOT/'themis/policy.json').read_text())['rules']:
    check('themis/index.html',rule['scenario_ref'])
    check('themis/index.html','../quadro/02-principios.html#'+rule['principle_ref'])
if errors:print('\n'.join(sorted(set(errors))));sys.exit(1)
print(f'{len(pages)} HTML pages: internal links, assets and policy anchors valid.')
