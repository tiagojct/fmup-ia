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

## [0.9.1] — 2026-05-23

Internal audit pass: language-preservation bug in `backToLanding()` and policy
sanity check at startup. No statement-wording changes; bumped strictly for
behavioural fidelity (so that a 0.9.0 declaration remains distinguishable from
a 0.9.1 one in archived URL hashes).

### Fixed
- `backToLanding()` previously called `freshState()` which re-ran
  `detectLang()` from scratch, reverting the user's `lang` selection back
  to the browser default on every "Back" click. Now preserves
  `state.lang` across the reset.

### Added
- `validatePolicy()` runs once at startup against both the inline and
  fetched `POLICY` object. Logs a `console.warn` if any rule references a
  `risk` level that is not declared in `policy.risk_levels`. Non-blocking;
  intended as a sentinel for future `policy.json` edits.

---

## [0.9.0] — 2026-05-14

External feedback pass: landing page hierarchy, Atlas privacy framing, student task free-text, researcher replicability field.

### Added
- `landingPrivacyNote` i18n string (pt/en): renders as a `.review-note` on the Atlas landing screen, before the role cards. States that the tool runs entirely in-browser (no server, no cookies, no data logging) and warns against entering personal or clinical data in free-text fields. Also states that risk assessment is advisory.
- Student tasks now include an `other` option with a conditional free-text field (`tasksOther`). When "Outra tarefa / Other task" is checked, a text input appears ("Especifique / Specify…"). If filled, the literal value replaces "outras tarefas auxiliares / other ancillary tasks" in the generated declaration. Requested by Ricardo Correia (graphical abstract example).
- Researcher form: optional `promptsRef` text field added after the target step ("URL ou referência do anexo de prompts e interacções / URL or reference of prompts and interaction log"). If filled, the researcher full statement (targets: journal, FCT, Horizon, Wellcome) appends a replicability sentence pointing to the provided reference. Requested by Ricardo Correia.

### Changed
- `APP_VERSION` bumped to **0.9.0**; `index.html` cache-bust query strings updated to `?v=0.9.0`.
- `freshState()` and `encodeState()` extended with `tasksOther` and `promptsRef` fields; both serialised in the URL hash for round-trip fidelity.

---

## [0.8.0] — 2026-05-14

Teacher SWOT review: template reminder on teacher output screen; classification warning scoped to permissive policies.

### Added
- New i18n string `teacherAdaptReminder` (pt/en): renders as a `.review-note`
  on the teacher output screen, after the risk panel and before the output
  blocks. Reminds the teacher that the generated text is a template to be
  adapted to the specific course unit (name, semester, conditions) before
  inclusion in the syllabus. Links to Appendix B for worked examples.
- `policy_any` trigger field added to `matchesTrigger()` in `app.js`: works
  analogously to `tasks_any` and `target_any` — fires the rule only when
  `state.policy` is in the specified array.

### Changed
- `R-TEACHER-CLASSIFICATION-WARNING` trigger narrowed from `{ "role": "teacher" }`
  to `{ "role": "teacher", "policy_any": ["with_disclosure", "without_restrictions"] }`.
  The warning is now suppressed when the teacher selects "not_permitted", where
  GenAI-assisted grading is already a non-issue by definition.
- `policy.version` bumped to **1.2.3** (rule trigger change).
- `APP_VERSION` bumped to **0.8.0**; `index.html` cache-bust query strings
  updated to `?v=0.8.0`.

---

## [0.7.0] — 2026-05-14

Student SWOT review: UC policy reminder on student output screen.

### Added
- New i18n string `studentUCPolicyReminder` (pt/en): renders as a `.review-note`
  on the student output screen, after the risk panel and before the output
  blocks. Reminds the student to verify their course unit's GenAI policy
  (syllabus or Appendix B) before submitting the declaration. Addresses the gap
  where a student in a "not_permitted" course unit could generate an Atlas
  declaration and mistakenly believe it validated their use.
- `APP_VERSION` bumped to **0.7.0**; `index.html` cache-bust query strings
  updated to `?v=0.7.0`.

---

## [0.6.5] — 2026-05-13 → 2026-05-14

Initial 2026-05-13 release bumped `APP_VERSION` to 0.6.5 and `policy.version` to 1.2.1 (MDR/IVDR wording fix). A follow-up patch on 2026-05-14 added a new rule and bumped `policy.version` to 1.2.2 without re-bumping `APP_VERSION` (statement wording unchanged).

### Added (policy.version 1.2.2, 2026-05-14)
- New rule `R-RESEARCHER-STATISTICS` (risk 2): fires when a researcher
  selects statistical analysis as a task. Warns that language models produce
  plausible but potentially incorrect statistical prose; reminds that in
  clinical trial contexts, GenAI contributions to the SAP must be recorded
  in the document version history per ICH E6(R3). Links to scenario 11.

### Changed (policy.version 1.2.1, 2026-05-13)
- `R-RESEARCHER-DATA` message reworded to qualify MDR/IVDR as
  conditional ("quando aplicável / where applicable"). The previous
  wording read "RGPD e MDR/IVDR" as a flat conjunction, which
  overstated the scope for non-clinical research (epidemiological
  studies in Saúde Pública, methodological AI research in the
  Doutoramento em Ciência de Dados de Saúde, ethics studies in the
  Doutoramento em Bioética). The RGPD always applies; MDR/IVDR
  applies only when clinical data or medical-device software is
  involved. This aligns the rule with the broadened scope made
  explicit in capítulo 1 of the Quadro.
- `policy.version` bumped to **1.2.1** (wording-only patch).
- `APP_VERSION` bumped to **0.6.5**; `index.html` cache-bust query
  strings updated to `?v=0.6.5`.

---

## [0.6.0] — 2026-05-11

National articulation with the CNIPES diagnosis.

### Added
- `policy.json` ships a new top-level `national_platform` block
  declaring the Plataforma Nacional de Práticas Pedagógicas de IA no
  Ensino Superior proposed by the CNIPES (Conselho Nacional para a
  Inovação Pedagógica no Ensino Superior) in its April 2026 report
  (DOI 10.5281/zenodo.19555760). The block carries pt/en names, issuer,
  status (`proposta`), and the reference URL.
- Footer now renders, when `policy.national_platform` is present, a
  short articulated link "Articula-se com a Plataforma Nacional de
  Práticas Pedagógicas de IA" / "Articulated with the National
  Platform for AI Pedagogical Practices" pointing to the platform's
  reference URL.
- New i18n string `footerNationalPlatform` (pt/en).

### Changed
- `policy.version` bumped to **1.2.0** (new field added; backwards
  compatible — earlier policies without `national_platform` continue
  to work, the footer line stays hidden).
- `APP_VERSION` bumped to **0.6.0**; `index.html` cache-bust query
  strings updated to `?v=0.6.0`.

### Notes
- The CNIPES Plataforma is still a proposal in the report's Phase 2;
  the Atlas declares articulation, not integration. When and if the
  Platform is published, this block becomes a federation pointer.

---

## [0.5.1] — 2026-05-10

Dark-mode contrast fixes.

### Fixed
- `.option:hover` was using a hard-coded light grey (`#EFEFEF`) that
  flashed bright when an unselected option was hovered in dark mode.
  Added a dark-mode-specific hover (`#2A2A2A`) and a checked+hover
  variant (`#3A2E00`).
- Yellow-background surfaces — the `.back-bar`, the `.brand-mark`
  yellow tile, the primary button — were inheriting the dark-mode
  light text from `--c-text`, producing white-on-yellow with poor
  contrast. Pinned dark text (`#1A1A1A`) on every yellow surface so
  the institutional yellow always carries readable black.
- `APP_VERSION` bumped to **0.5.1** and cache-bust query strings on
  the stylesheet and scripts updated to `?v=0.5.1`.

---

## [0.5.0] — 2026-05-10

Quadro ↔ Atlas alignment pass.

### Added
- Each rule's `scenario_ref` now points to a specific cenário inside Anexo E
  (e.g. `E-cenarios.html#cenario-4`) instead of the page root, so "Ver
  cenário no Quadro" jumps straight to the matching scenario. Stable
  ASCII-only anchors `{#cenario-1}`–`{#cenario-10}` were added to the book.
- `PRINCIPLE_NAMES` map in `app.js` keyed by the seven `principle_ref`
  slugs. The risk-panel chip now displays the canonical principle name in
  pré-AO90 with diacritics (e.g. "Princípio 3 — Protecção de dados") and
  is rendered as a link to the corresponding `quadro/02-principios.html`
  anchor in a new tab.

### Changed
- pré-AO90 orthography sweep across `i18n/pt.js`: `redação` → `redacção`,
  `seleção` → `selecção`, `exatidão` → `exactidão` (×3), `objetivos` →
  `objectivos`, `atividade` → `actividade`. Brings Atlas into line with the
  load-bearing pré-AO90 convention used throughout the Quadro.
- `policy.version` bumped to **1.1.0** (rule scenario anchors).
- `APP_VERSION` bumped to **0.5.0**.

### Notes
- The Quadro side received parallel changes: principles 1–7 are now H2
  sections with explicit `{#principio-N-…}` anchors; framework version is
  now the canonical `FMUP Quadro de Referência v1.0 (2026-04-21)` in the
  preface; risk-level labels (Mínimo/Limitado/Alto/Inaceitável) are now
  defined in chapter 6; FCT, Horizonte Europa, Wellcome Trust and ICMJE
  disclosure regimes are substantiated in chapter 5; Anexo A points to
  Atlas as the prose-form generator.

---

## [0.4.1] — 2026-05-10

Visual cleanup pass — minimalist option/risk-panel chrome.

### Changed
- `.option` (selected): no `border-left` accent; selection is conveyed only
  by the soft yellow tint (`#FFF4BF`) and the bolded label.
- `.risk-panel`: removed the coloured `border-left` (green / amber / orange /
  red) for risk levels 1–4. Level is now conveyed only by the tinted
  background and heading colour.
- Print stylesheet adjusted to drop the explicit black left border on the
  risk panel and review note (consistent with the new minimal chrome).
- `APP_VERSION` bumped to **0.4.1**.

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
