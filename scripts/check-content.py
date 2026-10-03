#!/usr/bin/env python3
"""Offline checks for bibliography identity, citations and policy coverage."""
import importlib.util, json, re, sys
from pathlib import Path
from urllib.parse import urlparse
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('references', ROOT/'scripts/audit-references.py')
module = importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
entries = module.entries();keys = [e['key'] for e in entries];errors=[]
deposit = re.search(r'^  url: "([^"]*)"', (ROOT/'training/_variables.yml').read_text(), re.M)
if not deposit:
    errors.append('Missing training deposit URL configuration')
elif deposit[1] not in ('', 'FICHA_PARTILHADA_URL'):
    parsed = urlparse(deposit[1])
    if parsed.scheme != 'https' or not parsed.netloc or re.search(r'\s', deposit[1]):
        errors.append('Training deposit URL must be HTTPS or FICHA_PARTILHADA_URL')
if len(keys) != len(set(keys)): errors.append('Duplicate bibliography keys')
# Key DOI/PMID regressions: these previously resolved to unrelated articles.
by_key = {e['key']:e for e in entries}
if by_key['jin2025global'].get('doi') != '10.1016/j.caeai.2024.100348':errors.append('Jin DOI does not identify the cited article')
if 'PMID: 37852174' not in by_key['ng2023aieducation'].get('note',''):errors.append('Ng PMID does not identify the cited article')
for p in ROOT.rglob('*.qmd'):
    if any(part in ('_site','.quarto','node_modules','_extensions') for part in p.parts):continue
    body = re.sub(r'```[\s\S]*?```|`[^`]*`', '', p.read_text())
    for key in re.findall(r'(?<![\w])@([A-Za-z][\w-]+)',body):
        # Quarto cross-references and email domains are not citation keys.
        if key.startswith(('sec-','fig-','tbl-','eq-')) or key in ('up','fmup'):continue
        if key not in keys:errors.append(f'{p.relative_to(ROOT)}: unknown citation {key}')
policy=json.loads((ROOT/'themis/policy.json').read_text())
if set(r['risk'] for r in policy['rules']) != {1,2,3,4}:errors.append('Risk rules do not cover all four declared levels')
for rule in policy['rules']:
    if rule['risk']==4 and not rule['trigger'].get('riskFlags_any'):errors.append(f"{rule['id']}: prohibited risk requires explicit context")
if errors:print('\n'.join(errors));sys.exit(1)
print(f'{len(entries)} bibliography entries; citation keys and risk coverage valid.')
