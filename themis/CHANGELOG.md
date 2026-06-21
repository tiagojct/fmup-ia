# Changelog

All notable changes to **Themis** (FMUP · IA — AI usage statement generator,
formerly **Atlas** until June 2026) are documented here. This file tracks
changes to **statement content** and the **policy basis** they reflect,
alongside functional changes to the tool.

Pre-1.0.0 entries below refer to the tool under its previous name (Atlas);
the textual history is preserved as it was written at the time. Beginning
with the 1.0.0 entry, the tool is named Themis.

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

## [1.0.4] — 2026-06-21 — Policy detail + assignment-other input

### Added
- `teacher.step3Help` and detailed descriptions for the three teacher
  `policy` options (PT + EN). The "Qual será a política de uso de IA?"
  step now opens with a paragraph that explains how to choose between
  not-permitted, with-disclosure and without-restrictions, and each
  option carries a one- or two-sentence description shown directly
  under its label.
- `state.assignmentOther` field (encoded in URL hash). When the user
  ticks the "Outro / Other" assignment option in the student or teacher
  form, a text input appears immediately below the checkbox group
  asking to specify the type of work. The custom text replaces the
  generic "trabalho" / "piece of work" wherever the assignment is
  mentioned in the generated statement.

### Changed
- `fmtAssignmentNoun()` / `fmtAssignmentPrep()` in both i18n files now
  accept an optional `otherText` argument and, when the assignment key
  is `other` and the text is non-empty, substitute the custom text for
  the generic noun and the appropriate preposition ("neste(a) X" in
  PT, "in this X" in EN).
- `pushRow()` for the teacher summary now reads
  `i.teacher.policy[state.policy].label` instead of the bare value, so
  the summary continues to show only the short label.

`APP_VERSION` 1.0.3 → **1.0.4**. `policy.version` unchanged (1.3.0).

---

## [1.0.3] — 2026-06-21 — Detailed option descriptions for step 5

The "Como integrou os contributos da IA?" step in the student form
showed three terse radio labels ("Apenas como referência",
"Substancialmente editados", "Sem alterações substanciais") with no
guidance, which is the step with the most consequential ambiguity for
the user (it shapes the final clause of the statement and the
authorship claim).

### Added
- `student.step5Help` (PT + EN): a paragraph that explains how to map
  what was actually done with the AI output onto each of the three
  options, and warns that the choice affects the authorship implied
  by the statement.
- `student.modification` is now a map of `{label, description}`
  objects instead of plain strings. Each option carries a one- or
  two-sentence description shown directly under the label in the
  radio group, replacing the unannotated previous labels.

### Changed
- `radioGroup()` in `app.js` accepts options with a `description`
  field and renders a `.option-description` line under the label.
  When any option in the group has a description, the layout
  automatically switches to a single-column stack so each option has
  room to breathe.
- `asOptions()` understands either string values (legacy) or
  `{label, description}` objects.
- `pushRow()` for the student summary now reads
  `i.student.modification[state.modification].label` instead of the
  bare value, so the summary continues to show only the short label.
- The summary row for the teacher form now uses `step0CourseType`
  and `courseType` (matching the corrected form flow from 1.0.2).
- New `.option-description`, `.option-text`,
  `.option-with-description` CSS classes; dark-mode-safe (uses
  `var(--c-text-muted)`).

`APP_VERSION` 1.0.2 → **1.0.3**. `policy.version` unchanged (1.3.0).

---

## [1.0.2] — 2026-06-21 — Form-flow corrections + chip detail

Post-implementation fixes following manual smoke-test on dark mode.

### Removed
- **CPD options from the student `submission` dictionary.** CPD is a
  programme-level distinction made by the teacher when writing the
  syllabus clause; a student answering the form is already enrolled
  in a programme of a given type and only chooses between individual
  and group submission.
- **The teacher form's step "Qual é o nível da UC?".** It was a
  one-to-one duplicate of the previous step (`courseType`, which
  already covers undergraduate / master's / doctoral / CPD /
  microcredential / other). The teacher form now has 4 steps instead
  of 5. `state.level` is preserved in the URL hash for backward
  compatibility with older shared declarations, but the form does
  not render it and statement renderers ignore it.

### Changed
- Teacher statement renderers derive the subject ("estudantes",
  "doutorandos", "formandos" / "students", "doctoral candidates",
  "participants") from `state.courseType` instead of `state.level`.
  The hard-coded phrase "unidade curricular" inside the
  `not_permitted` and `without_restrictions` clauses is replaced by
  "oferta formativa" / "programme" so the text reads correctly for
  CPD courses and microcredentials.
- **Tool-suggestion chips are now structured.** Each chip displays
  the tool name on the top line and the privacy / data-handling note
  on a second line, replacing the tooltip-only version. Each tier
  block now opens with a short blurb explaining when to use that
  tier (institutional first; enterprise opt-out when IAedu does not
  fit; specialised for specific tasks; consumer free tiers with
  data-handling caveat). A subtle "added" state (green border + tick)
  is now shown on chips already present in the free-text field.
- **Dark-mode styles for the chip block.** All colours now come from
  CSS custom properties (`--c-bg`, `--c-surface`, `--c-border`,
  `--c-border-strong`, `--c-text`, `--c-text-muted`,
  `--c-fmup-yellow`) plus a `@media (prefers-color-scheme: dark)`
  override that keeps yellow legible on dark surfaces and softens
  the consumer-warning tone for dark backgrounds.

`APP_VERSION` 1.0.1 → **1.0.2**. `policy.version` unchanged (1.3.0).

---

## [1.0.1] — 2026-06-XX — Post-meeting feature pass

Feature pass following the apresentação à direcção. Bumps
`policy.version` to **1.3.0** and `framework_version` to **v1.1**
(harmonisation of the Quadro with the CE-FMUP White Paper on
research integrity, plus the additions described below).

### Added
- **Date of use** (`state.useDate`, optional). Students and
  researchers may now indicate the date on which the main use of the
  tools occurred, separately from the date on which the statement is
  generated. The statement renderers append a conditional clause "A
  utilização principal ocorreu em DATE" / "The main use took place on
  DATE" when the date is set and differs from the generation date.
  New step 6 for students, new step 5 for researchers.
- **Continuing Professional Development** as a submission type for
  students (`cpd_individual`, `cpd_group`).
- **Course type** field for teachers (`state.courseType`), with
  options for undergraduate, master’s, doctoral, CPD,
  microcredential, and other. The teacher syllabus statement now
  opens with "Neste Curso de Formação Contínua…", "Nesta
  microcredencial…" etc. as appropriate.
- **Recommended-tools chip strip** above the free-text `tools` field
  (student step 4 and researcher step 3). Driven by a new
  `recommended_tools` array in `policy.json` with four tiers:
  `institutional` (IAedu, always first), `enterprise_optout`
  (ChatGPT Enterprise/Team, Claude Team), `specialised` (DeepL Pro,
  Writefull, NotebookLM, Perplexity), and `consumer_warning` (free
  consumer ChatGPT and Claude with explicit data-handling caveats).
  Clicking a chip appends the tool name to the free-text field.
  New `ui.toolsSuggested*` and `ui.toolsTier*` i18n strings (PT/EN).
- **More work typologies** across the board:
  - Student tasks: added `poster_design`, `presentation_prep`,
    `reflective_journal`, `portfolio`, `case_report`,
    `study_summary` (10 → 16 options).
  - Teacher and student assignments: added `case_discussion`,
    `clinical_simulation`, `portfolio`, `poster`, `reflective_journal`
    (6 → 11 options). OSCE intentionally not added: it is a
    real-time presential assessment with no GenAI-relevant design
    space.
  - Teacher skills: added `metacognition`,
    `inter_professional_communication`, `patient_communication`,
    `ethics_reasoning` (6 → 10 options).
  - Researcher activities: added `protocol`, `thesis_chapter`,
    `book_chapter`, `software`, `dataset_documentation`,
    `poster_scientific`, `presentation_scientific` (6 → 13 options).
  - Researcher targets: added `book`, `repository`, `phd_jury`,
    `master_jury` (6 → 10 options).

### Changed
- `policy.version`: 1.2.4 → **1.3.0**.
- `framework_version`: "FMUP Quadro de Referência v1.0 (2026-04-21)"
  → "FMUP Quadro de Referência v1.1 (2026-06-XX)". The bump reflects
  the addition of the CE-FMUP White Paper articulation in chapter 5
  of the Quadro and the cross-refs in chapters 2, 6 and 14.
- `APP_VERSION`: 1.0.0 → **1.0.1** (i18n strings changed; new state
  keys added).

### Compatibility
- New state keys (`useDate`, `courseType`) are optional and default
  to empty/null in `freshState()`. Old shared URL hashes from
  pre-1.0.1 continue to decode without error — the new fields are
  simply rendered as the empty state.
- The CPD options in `submission` are additions; existing
  `individual` / `group` values continue to decode and render
  unchanged.

---

## [1.0.0] — 2026-06-XX — Rebrand to Themis

The tool is renamed from **Atlas** to **Themis** to avoid collision with
the U.Porto institutional application portal at `atlas.up.pt`. Themis is
the Greek goddess of divine order, custom and law — apt for a tool of
institutional declaration and risk evaluation.

Major version bump: while the URL hash format and i18n shape are preserved,
the name in the title bar, the appTitle i18n strings, the statement
footers ("gerada pela Themis (FMUP · IA)" / "generated by Themis (FMUP ·
IA)"), the console namespace (`[themis]`), and the canonical URL
(`tiagojct.eu/fmup-ia/themis/` replacing `/atlas/`) all change. Previously
shared links to `/atlas/#…` no longer resolve; this is deliberate and
acceptable at this stage of the prototype.

### Changed
- Directory rename: `atlas/` → `themis/`.
- `appTitle` (pt/en): "Themis — Declarações de uso de IA" / "Themis —
  AI Usage Statements".
- Statement footers reference Themis instead of Atlas.
- README, CHANGELOG header, navbar, footer link, page-footer text — all
  reflect the new name.
- Console diagnostic namespace `[atlas]` → `[themis]`.

### Preserved
- URL hash payload format (existing shared declarations on the new
  domain continue to render).
- i18n keys, file layout, JSON shape of `policy.json`.

---

## [0.9.2] — 2026-06-15

Status reframing pass. The README, the in-app footer, and the
companion site now explicitly describe Atlas as a **prototype
demonstrator** rather than an "operational" or "institutional" tool,
in line with the broader editorial-status clarification on the
project site. New `ui.footerPrototype` i18n key (PT and EN) renders a
short clickable note in the footer pointing at the editorial-status
section on the companion site.

No rule changes; `policy.version` unchanged (1.2.4). `APP_VERSION`
bumped to 0.9.2 because i18n strings changed.

---

## [0.9.1] — 2026-06-02

`policy.version` bump to **1.2.4**: integration of the CNE Recomendação
n.º 4/2026 (DR, 21 May 2026) as an additional legal reference. New
top-level `legal_references` array in `policy.json` listing AI Act,
RGPD, CNE Rec 4/2026, and RCM 2/2026 (ANIA). No rules added — the
Recommendation's transversal exigencies (human validation, algorithmic
transparency, teacher training literacy in four axes) are already
covered by the seven principles. No statement wording changed in
`i18n/*.js`, so `APP_VERSION` remains `0.9.1`.

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
