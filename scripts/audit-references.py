#!/usr/bin/env python3
"""Inventory and check bibliography metadata / external links; no source edits.
HTTP failures are inconclusive, not evidence that a reference does not exist.
Usage: python3 scripts/audit-references.py --output /tmp/references.json
"""
import argparse, concurrent.futures, json, re, time, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, timezone
ROOT = Path(__file__).resolve().parents[1]
def entries():
    text = (ROOT / 'quadro/references.bib').read_text()
    result = []
    for match in re.finditer(r'(?m)^@(\w+)\{([^,]+),', text):
        i, depth = match.end(), 1
        start = i
        while i < len(text) and depth:
            if text[i] == '{' and text[i-1] != '\\': depth += 1
            if text[i] == '}' and text[i-1] != '\\': depth -= 1
            i += 1
        raw = text[start:i-1]
        fields = {}
        for f in re.finditer(r'(?m)^\s*(\w+)\s*=\s*\{', raw):
            j, level = f.end(), 1
            begin = j
            while j < len(raw) and level:
                if raw[j] == '{' and raw[j-1] != '\\': level += 1
                if raw[j] == '}' and raw[j-1] != '\\': level -= 1
                j += 1
            fields[f[1]] = raw[begin:j-1]
        result.append({'key': match[2], 'type': match[1], **fields})
    return result

def fetch(url, accept='*/*', attempt=0):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'FMUP-IA-reference-audit/1.0', 'Accept': accept})
        with urllib.request.urlopen(req, timeout=25) as r:
            data = r.read(3_000_000)
            out = {'status': r.status, 'url': r.url}
            if accept == 'application/json': out['data'] = json.loads(data)
            else:
                m = re.search(r'<title[^>]*>(.*?)</title>',data.decode(errors='replace'),re.I|re.S)
                if m: out['title'] = re.sub(r'\s+', ' ',m[1]).strip()
            return out
    except Exception as e:
        status = getattr(e, 'code', None)
        if status in (429, 502, 503, 504) and attempt < 2:
            time.sleep(2 ** (attempt + 1))
            return fetch(url, accept, attempt + 1)
        return {'status': status, 'error': str(e), 'url':url}

def check_entry(e):
    out = {'entry': e}
    if e.get('doi'):
        api = ('https://api.datacite.org/dois/' if e['doi'].startswith(('10.5281/','10.82110/')) else 'https://api.crossref.org/works/') + e['doi']
        out['metadata'] = fetch(api, 'application/json')
        if out['metadata'].get('status') == 404 and 'crossref.org' in api:
            alternate = fetch('https://api.datacite.org/dois/' + e['doi'], 'application/json')
            if alternate.get('status') == 200: out['metadata'] = alternate
    if e.get('url'): out['link'] = fetch(e['url'])
    return out

def external_urls():
    result = {}
    files = list(ROOT.rglob('*.qmd')) + [ROOT/'themis/policy.json']
    for p in files:
        if any(x in p.parts for x in ('_site','node_modules','.quarto','_extensions')): continue
        for url in re.findall(r'https?://[^\s<>"\]\){}]+', p.read_text()):
            url = url.rstrip('.,;\\')
            if any(host in url for host in ['tiagojacinto.eu', 'tiagojct.eu', 'doi.org']): continue
            result.setdefault(url, []).append(str(p.relative_to(ROOT)))
    return result

def main():
    parser = argparse.ArgumentParser();parser.add_argument('--output',default='/tmp/fmup-ia-references.json');args=parser.parse_args()
    es = entries(); urls = external_urls()
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        checked = list(pool.map(check_entry, es))
        links = list(pool.map(lambda u:{'source_url':u,'files':sorted(set(urls[u])),**fetch(u)},urls))
    out = {'checked_at':datetime.now(timezone.utc).isoformat(),'references':checked,'external_links':links}
    Path(args.output).write_text(json.dumps(out,ensure_ascii=False,indent=2))
    print(f'{len(es)} references, {len(links)} external URLs; evidence: {args.output}')
    for c in checked:
        for k in ('metadata','link'):
            if k in c and c[k].get('status') != 200: print(c['entry']['key'],k,c[k].get('status'),c[k].get('error'))
if __name__=='__main__': main()
