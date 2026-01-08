# FMUP · IA

**Quadro de referência institucional para o uso de IA generativa na Faculdade de Medicina da Universidade do Porto + ferramenta operacional Atlas.**

- 🌐 Site: <https://tiagojct.eu/fmup-ia/>
- 📖 Quadro: <https://tiagojct.eu/fmup-ia/quadro/>
- 🧭 Atlas (ferramenta): <https://tiagojct.eu/fmup-ia/atlas/>
- 🪪 Licença: [CC BY 4.0](LICENSE)

## O que é

Um repositório que reúne, num único site Quarto:

1. **Quadro** (`/quadro/`) — proposta institucional sobre uso de GenAI na FMUP, em duas partes: análise comparativa internacional (Parte I) e proposta operacional para a FMUP (Parte II), seguidas de seis anexos.
2. **Atlas** (`/atlas/`) — SPA cliente em vanilla JS sem _build_ que gera declarações estruturadas de uso de IA para três papéis (estudante, docente, investigador) e devolve avaliação guidante de risco em quatro níveis (HEAT-AI), com base nas regras codificadas em `atlas/policy.json`. A ferramenta é guidante, não bloqueante.

Tudo está cruzadamente ligado: o site liga ao Atlas (navbar, _landing_, anexos); o Atlas liga ao Quadro (header "voltar", _footer_, e via `framework_url` em `policy.json`).

## Estrutura

```
fmup-ia/
├── _quarto.yml          # Quarto website config
├── theme.scss           # paleta amarelo FMUP + Atkinson Hyperlegible Next
├── index.qmd            # landing
├── sobre.qmd, recursos.qmd, 404.qmd
├── quadro/              # o livro (16 capítulos + 6 anexos + bibliografia)
│   ├── index.qmd
│   ├── 10-…15-          # Parte I (análise comparativa)
│   ├── 01-…09-          # Parte II (proposta FMUP)
│   ├── A-…F-            # Anexos
│   ├── references.bib, ieee.csl
│   └── guias/           # 4 PDFs (handouts) renderizados por render-guias.sh
├── atlas/               # SPA: index.html, app.js, style.css, policy.json, i18n/
├── assets/
│   ├── logos/           # logos institucionais FMUP / U.Porto
│   └── favicon.svg
├── render-guias.sh      # post-render: renderiza os 4 guias PDF
└── .github/workflows/
    └── publish.yml      # CI: build Quarto + deploy gh-pages
```

## Build local

Requer **Quarto 1.9+** instalado.

```bash
quarto preview          # dev server com live reload
quarto render           # build completo para _site/
bash render-guias.sh    # opcional: renderizar os 4 guias PDF
```

Para testar o Atlas juntamente com o site renderizado:

```bash
cd _site && python3 -m http.server 8000
# abrir http://localhost:8000/
```

## Deploy

Push para `main` dispara o workflow `publish.yml` (`.github/workflows/`), que:

1. instala Quarto;
2. corre `quarto render` (build do site);
3. corre `render-guias.sh` (build dos 4 PDFs);
4. publica `_site/` no branch `gh-pages` via `peaceiris/actions-gh-pages`.

GitHub Pages está configurado para servir do branch `gh-pages`. URL custom: `tiagojct.eu/fmup-ia/` (herdado do CNAME de `tiagojct.github.io`).

## Identidade visual

- Cor primária: amarelo FMUP `#FFCD00`.
- Texto: preto `#1A1A1A`.
- Tipografia: [Atkinson Hyperlegible Next](https://www.brailleinstitute.org/freefont) (Braille Institute, OFL) + Geist Mono para código.
- Logos institucionais em `assets/logos/`.

## Citação

Sugestão (DOI a atribuir após depósito Zenodo — ver [CITATION.cff](CITATION.cff)):

> Jacinto T. *FMUP · IA — Quadro de referência institucional para a utilização de inteligência artificial generativa na FMUP*. Faculdade de Medicina da Universidade do Porto, 2026. <https://tiagojct.eu/fmup-ia/>

## Histórico

Este repositório consolida dois repositórios anteriores, hoje arquivados:

- [`tiagojct/ia-fmup`](https://github.com/tiagojct/ia-fmup) — versão inicial do livro Quarto.
- [`tiagojct/ai-usage-tool`](https://github.com/tiagojct/ai-usage-tool) — versão inicial da ferramenta (v0.1.0–v0.2.0, antes do rebrand para Atlas).

## Licença

[CC BY 4.0](LICENSE) para o conteúdo, código e dados deste repositório. Os logos institucionais não estão cobertos por esta licença — ver nota em `LICENSE`.
