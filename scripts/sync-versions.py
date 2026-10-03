#!/usr/bin/env python3
"""Synchronise derived release metadata. --check makes no changes."""
from pathlib import Path
import argparse, json, re, sys
ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(); parser.add_argument('--check', action='store_true'); args = parser.parse_args()
def variables(path):
    result = {}; section = None
    for line in path.read_text().splitlines():
        top = re.match(r'^([\w-]+):\s*$', line)
        if top: section = top[1]
        field = re.match(r'^  ([\w-]+):\s*"([^"]*)"', line)
        if field: result[f'{section}.{field[1]}'] = field[2]
    return result
v=variables(ROOT/'_variables.yml');tv=variables(ROOT/'training/_variables.yml')
version=v['quadro.versao'];date=v['quadro.data-iso'];label=v['quadro.data'].replace(' de ', ' ')
framework=f'FMUP Quadro de Referência {version} ({date})'
changes=[]
def update(path, content):
    p=ROOT/path
    if p.read_text()!=content:
        changes.append(path)
        if not args.check:p.write_text(content)
def replace(path, pattern, value):
    p=ROOT/path; content,count=re.subn(pattern,lambda _:value,p.read_text())
    if count!=1:raise ValueError(f'{path}: expected one version marker, found {count}')
    update(path,content)
replace('_quarto.yml',r'Quadro v[\d.]+ · [^\n]+',f'Quadro {version} · {label}')
replace('training/_quarto.yml',r'Sessão de formação v[\d.]+ · [^\n]+',f"Sessão de formação {tv['sessao.versao']} · {tv['sessao.data'].replace(' de ', ' ')}")
replace('themis/app.js',r"const APP_VERSION = '[^']+';",f"const APP_VERSION = '{v['themis.versao']}';")
p=ROOT/'themis/index.html';update('themis/index.html',re.sub(r'\?v=[\d.]+',f"?v={v['themis.versao']}",p.read_text()))
d=json.loads((ROOT/'themis/policy.json').read_text());d.update(version=v['themis.regras'],framework_version=framework,framework_short_pt=f'Quadro FMUP {version}',framework_short_en=f'FMUP Framework {version}',revised=date)
update('themis/policy.json',json.dumps(d,ensure_ascii=False,indent=2)+'\n')
replace('CITATION.cff',r'(?m)^version: .+$',f'version: "{version.removeprefix("v")}.0"')
replace('CITATION.cff',r'(?m)^date-released: .+$',f'date-released: "{date}"')
# Zenodo deposition metadata supports version and publication_date.
d=json.loads((ROOT/'.zenodo.json').read_text());d.update(version=version.removeprefix('v')+'.0',publication_date=date)
update('.zenodo.json',json.dumps(d,ensure_ascii=False,indent=2)+'\n')
if changes:
    print(('Inconsistent versions: ' if args.check else 'Updated: ')+', '.join(changes))
    if args.check:sys.exit(1)
else:print('Version metadata consistent.')
