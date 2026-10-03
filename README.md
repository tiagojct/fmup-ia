# FMUP · IA

**Quadro de referência institucional para o uso de IA generativa na Faculdade de Medicina da Universidade do Porto + ferramenta operacional Themis.**

- 🌐 Site: <https://tiagojacinto.eu/fmup-ia/>
- 📖 Quadro: <https://tiagojacinto.eu/fmup-ia/quadro/>
- ⚖️ Themis (ferramenta): <https://tiagojacinto.eu/fmup-ia/themis/>
- 🪪 Licença: [CC BY 4.0](LICENSE)

## O que é

Um repositório que reúne, num único site Quarto:

1. **Quadro** (`/quadro/`) — proposta institucional sobre uso de GenAI na FMUP, em duas partes: comparação externa (Parte I) e proposta operacional para a FMUP (Parte II), seguidas de dez anexos.
2. **Themis** (`/themis/`) — SPA cliente em vanilla JS sem _build_ que gera declarações de uso de IA para estudantes e investigadores e cláusulas de UC para docentes. Devolve uma avaliação indicativa de risco em quatro níveis (HEAT-AI), com base nas regras codificadas em `themis/policy.json`. Os avisos são indicativos e não bloqueiam a declaração. Chamava-se *Atlas* até Junho de 2026; foi renomeada para evitar colisão com o portal institucional *Atlas U.Porto* (`atlas.up.pt`).

Tudo está cruzadamente ligado: o site liga à Themis (navbar, _landing_, anexos); a Themis liga ao Quadro (header "voltar", _footer_, e via `framework_url` em `policy.json`).

## Estrutura

```
fmup-ia/
├── _quarto.yml          # Quarto website config
├── theme.scss           # overrides locais sobre o tema FMUP
├── index.qmd            # landing
├── sintese.qmd, sobre.qmd, recursos.qmd, convencoes.qmd, 404.qmd
├── quadro/              # o documento (17 capítulos + 10 anexos + bibliografia)
│   ├── index.qmd
│   ├── 10-…15-          # Parte I (comparação)
│   ├── 01-…09b-         # Parte II (proposta FMUP)
│   ├── A-…J-            # Anexos
│   ├── references.bib, chicago-author-date.csl
│   └── guias/           # 4 handouts em format: fmup-typst (PDF)
├── apresentacoes/       # slides em format: fmup-revealjs
├── themis/              # SPA: index.html, app.js, style.css, policy.json, i18n/
├── assets/
│   ├── logos/           # logos institucionais FMUP / U.Porto
│   └── favicon.svg
└── .github/workflows/
    └── publish.yml      # CI: testes + build Quarto e formação + deploy VPS
```

## Build local

Requer **Quarto 1.9+** instalado.

```bash
quarto preview          # dev server com live reload
quarto render           # build completo para _site/ (HTML + 4 PDFs dos guias)
```

Para testar a Themis juntamente com o site renderizado:

```bash
cd _site && python3 -m http.server 8000
# abrir http://localhost:8000/themis/
```

## Deploy

Push para `main` dispara o workflow `publish.yml` (`.github/workflows/`), que:

1. instala Quarto;
2. verifica as versões e executa os testes da Themis;
3. corre `quarto render` na raiz e em `training/`, agregando os dois sites e os quatro PDFs;
4. envia `_site/` para o servidor pessoal via rsync (`/opt/vps/caddy/srv/fmup-ia/`), servido em <https://tiagojacinto.eu/fmup-ia/>.

O URL antigo `tiagojct.eu/fmup-ia/` redirecciona (301) para o novo domínio.

## Identidade visual

- Cor primária: amarelo FMUP `#FFCD00`.
- Texto: preto `#1A1A1A`.
- Tipografia: [Inter](https://rsms.me/inter/) por omissão + Geist Mono para código; Atkinson Hyperlegible Next continua disponível como opção de alta legibilidade no tema FMUP.
- Logos institucionais em `assets/logos/`.

## Citação

Metadados estruturados em [CITATION.cff](CITATION.cff). Sugestão de citação livre:

> Jacinto T. *FMUP · IA — Quadro de referência institucional para a utilização de inteligência artificial generativa na FMUP*. Faculdade de Medicina da Universidade do Porto, 2026. <https://tiagojacinto.eu/fmup-ia/>

## Histórico

Este repositório consolida dois repositórios anteriores, hoje arquivados:

- [`tiagojct/ia-fmup`](https://github.com/tiagojct/ia-fmup) — versão inicial do livro Quarto.
- [`tiagojct/ai-usage-tool`](https://github.com/tiagojct/ai-usage-tool) — versão inicial da ferramenta (v0.1.0–v0.2.0, antes do rebrand para Atlas e, depois, para Themis).

## Licença

[CC BY 4.0](LICENSE) para o conteúdo, código e dados deste repositório. Os logos institucionais não estão cobertos por esta licença — ver nota em `LICENSE`.

## Verificação antes de publicar

```bash
npm ci --prefix themis/test
npm test --prefix themis/test
python3 scripts/sync-versions.py --check
python3 scripts/check-content.py
```

Depois de editar as versões em `_variables.yml` (e em `training/_variables.yml` para a formação), execute `python3 scripts/sync-versions.py`. As versões derivadas são verificadas em CI.

A revalidação de fontes de 2–3 de Outubro de 2026, incluindo correcções e limitações de acesso, está em [audits/referencias-2026-10-03.md](audits/referencias-2026-10-03.md). Para repetir a recolha de metadados e a verificação de URLs: `python3 scripts/audit-references.py --output /tmp/fmup-ia-references.json`. Uma resposta HTTP não substitui a verificação do conteúdo.
