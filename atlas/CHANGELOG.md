# Changelog

All notable changes to **Atlas** (FMUP · IA — AI usage statement generator) are
documented here. This file tracks changes to **statement content** and the
**policy basis** they reflect, alongside functional changes to the tool.

The version number lives as a single constant (`APP_VERSION`) in `app.js`.
**Whenever the wording in `i18n/en.js` or `i18n/pt.js` changes, the version
must be incremented** so that previously generated statements remain
traceable to the wording that produced them.

This project follows a `MAJOR.MINOR.PATCH` scheme:

- **MAJOR** — incompatible changes to the URL hash format, the i18n shape,
  or removal/restructuring of an entire branch (student / teacher /
  researcher).
- **MINOR** — new questions, new options, materially new statement wording,
  or new disclosure targets / funder conventions.
- **PATCH** — wording corrections, typo fixes, small clarifications that do
  not alter the substance of the statement.

---

## [0.4.0] — 2026-05-10

Bug-hunt sweep across the SPA after the v0.3.0 monorepo migration.

### Added
- Two-link back bar at the top of the page: **← Quadro** (to the framework
  sidebar at `../quadro/`) and **← Início** / **← Home** (to the site
  landing). Replaces the single ambiguous "Voltar ao FMUP·IA" link.
- Risk panel now exposes the `principle_ref` and `scenario_ref` from
  `policy.json`. Each matched rule now shows a chip "Princípio: 3 — protecção
  de dados" (parsed from the slug) and a link "Ver cenário no Quadro" / "View
  scenario in the framework" that opens the canonical scenario page in a new
  tab.
- Distinct `aria-label` on each output's *Copy* and *Copy as Markdown*
  buttons (now suffixed with the output heading) for clearer screen-reader
  navigation in multi-output flows (teacher branch).
- Static `<title>` fallback in `index.html` so browser tabs show a label
  before JS runs.
- Mobile breakpoint at `<480 px`: option grids collapse to a single column.
- Dark-mode support via `prefers-color-scheme: dark`. Yellow accent kept;
  surfaces darken; risk-panel coloured backgrounds dimmed for the dark
  theme.
- Print stylesheet now forces white backgrounds on `.risk-panel`,
  `.risk-item` and `.review-note` so the teacher PDF has clean black-on-white
  output.

### Changed
- URL-hash schema gains an explicit version constant `HASH_V = 1`. Hashes
  with a different `v` are rejected and the user is shown the toast
  "Ligação inválida ou de versão antiga." / "Invalid or outdated link.";
  the bad fragment is stripped to avoid loops.
- `i18n/{pt,en}.js` headers updated from "FMUP AI Usage Statement Generator"
  to "Atlas (FMUP · IA)".
- `APP_VERSION` bumped to **0.4.0**.

### Fixed
- (BLOCKER from README) `atlas/README.md` "Hosted" URL was truncated to
  `<https://github.com/>` and dev instructions referenced the legacy
  `cd ai-usage-tool`. Both now point to `tiagojct.eu/fmup-ia/atlas/` and the
  monorepo paths.

---

## [0.3.0] — 2026-05-10

Integration into the unified `tiagojct/fmup-ia` monorepo and rebrand to
**Atlas**.

### Added
- Lives now under `tiagojct/fmup-ia` at `tiagojct.eu/fmup-ia/atlas/`. Linked
  from the parent Quarto site (navbar, landing card) and links back to it
  (header "← Voltar" link, footer link to `../quadro/`).
- Brand refresh aligned with FMUP institutional identity: yellow (#FFCD00) +
  black palette, Atkinson Hyperlegible Next typography (high-legibility
  open-source family by the Braille Institute).

### Changed
- New name: **Atlas**. `appTitle` (pt/en) renamed to "Atlas — Declarações de
  uso de IA" / "Atlas — AI Usage Statements". Statement footers identify the
  tool as "Atlas (FMUP · IA)".
- `policy.json` — `framework_url` and all `scenario_ref` entries now use
  absolute URLs to `https://tiagojct.eu/fmup-ia/quadro/…html`.
- Header now shows the FMUP yellow square mark (FM/UP); SVG circular badge
  removed in favour of the official institutional yellow tile.

### Removed
- Standalone `.github/workflows/deploy.yml` (deploy is now handled by the
  parent repo's unified Quarto + Pages workflow).

---

## [0.2.0] — 2026-05-10

Operational alignment with the **FMUP Quadro de Referência v1.0
(2026-04-21)**, the institutional book of which this tool is the operational
companion.

### Added
- `policy.json` — versioned ruleset reflecting the framework. Schema:
  `version`, `framework_version`, `framework_url`, `risk_levels` (four levels,
  pt/en), `rules` (each with `trigger`, `risk`, `principle_ref`,
  `scenario_ref`, `message_pt`, `message_en`).
- Client-side, **guiding (not blocking)** institutional risk panel rendered
  above the *Generate statement* button on every form screen and at the top
  of every output screen. Levels 1–4 use a WCAG-AA contrast palette
  (green / amber / orange / institutional red).
- Footer now shows the loaded framework version (when `policy.json` is
  available).
- Each generated statement now includes the framework version it was
  evaluated against, so declarations remain traceable to a specific ruleset.
- `README.md` — institutional context, fork-and-adapt instructions, privacy
  statement.

### Changed
- `APP_VERSION` bumped to **0.2.0** to reflect the addition of the
  framework-version footer in every generated statement.
- Statement generators (`pt.js`, `en.js`) now accept a third argument
  `policy` and append the framework reference to the footer.

### Notes
- Fully backwards-compatible with v0.1.0 URL hashes.
- If `policy.json` cannot be loaded (e.g. `file://` access without a server),
  the tool still works; only the institutional risk panel is disabled and a
  corresponding notice is shown.

---

## [0.1.0] — 2026-05-09

Initial release.

### Added
- Three branches: **student** (assignment submission statement),
  **teacher** (course-unit syllabus policy + disclosure requirement to
  communicate to students), **researcher** (Methods/Acknowledgements
  statement + brief inline statement).
- Landing screen with three role cards.
- Language toggle on every screen. European Portuguese (default) and
  English. UI strings and statement generators live exclusively in
  `i18n/pt.js` and `i18n/en.js`.
- URL hash encodes the complete decision path. State round-trips on reload
  and via the **Copy shareable link** button on the output screen.
- **Copy as plain text** and **Copy as Markdown** on every output block.
- **Print / Save as PDF** on the teacher branch, using a print-only
  stylesheet that shows only the output blocks and the selections summary.
- **Start over** button visible on every screen after the landing screen.
- Footer shows the tool version and the current date on every screen.
- Generated statements include a timestamp and the tool version.
- Mobile-first, keyboard-navigable layout. No framework, no CDN.
- GitHub Actions deployment to the `gh-pages` branch.

### Policy basis for statement wording
- **Student / teacher** branches: drafted to align with the academic
  integrity expectations of the Faculdade de Medicina da Universidade do
  Porto (FMUP) and with broader good practice in higher-education
  generative-AI policies.
- **Researcher — journal submission**: wording aligned with the ICMJE
  recommendations on the use of chatbots and large language models in
  scholarly publication (authors retain full responsibility; AI tools are
  not listed as authors).
- **Researcher — FCT**: drafted in keeping with the disclosure
  expectations of the Fundação para a Ciência e a Tecnologia (FCT) for
  funded research outputs.
- **Researcher — Horizon Europe**: drafted in line with the European
  Commission and ERA Forum *Living guidelines on the responsible use of
  generative AI in research*.
- **Researcher — Wellcome Trust**: drafted in line with Wellcome's policy
  on the use of generative AI in funded outputs.
- **Researcher — institutional report / conference submission**: generic
  formal academic register suitable for those venues.

### Notes
- The single source of truth for the version number is `APP_VERSION` in
  `app.js`. The version appears in the footer of every screen and is
  appended to every generated statement.
- All wording is editable in `i18n/pt.js` and `i18n/en.js`. No statement
  text is hardcoded in `app.js` or `index.html`.
