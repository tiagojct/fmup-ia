# Atlas — AI Usage Statement Generator

**Atlas** is the **prototype demonstrator** of the FMUP · IA framework. It is a
self-contained, dependency-free web tool that generates standardised AI-usage
declarations for academic and research contexts at the **Faculty of Medicine of
the University of Porto (FMUP)**.

Status: this is a prototype demonstrator, **not a certified institutional
application**. The accompanying framework is an individual contribution
submitted for institutional appraisal — see the [Editorial status
note](../sobre.qmd#estatuto-editorial) on the project site. Any transition
to a certified institutional tool will require an independent security
review, a DPIA, registration in the University of Porto application
inventory, and a designated technical owner.

Three branches:

- **Student** — declaration to accompany a submitted assignment.
- **Teacher** — course-unit syllabus policy text + disclosure requirement to
  communicate to students.
- **Researcher** — Methods/Acknowledgements statement + brief inline statement.

The tool is **client-side only** (HTML + vanilla JS + a single JSON policy
file). It does not send any data to a server, does not use cookies for
tracking, and does not require a build step.

## Relationship to the FMUP framework

This tool is the operational companion to the **FMUP · IA Quadro de Referência
Institucional para a Utilização de IA Generativa** (Quarto site at
<https://tiagojct.eu/fmup-ia/quadro/>). Each generated declaration is footed
with the exact framework version it reflects.

While the user fills in the form, the tool reads `policy.json` and runs
the selected state through a list of institutional rules adapted from the
HEAT-AI four-level risk taxonomy (Temper et al. 2025, Frontiers in Education,
DOI 10.3389/feduc.2025.1505370). When a rule fires, a guiding panel appears
above the *Generate statement* button, naming the rule, the relevant
principle, and the matching scenario in Appendix E of the book. **The panel is
guiding, not blocking** — the user remains in control and the tool always
generates the requested statement.

If `policy.json` cannot be loaded (e.g. opening `index.html` directly via
`file://` in a browser that disallows cross-origin reads), the tool still
works; only the institutional risk panel is disabled and a corresponding
notice is shown.

## Articulation with the CNIPES National Platform

From v0.6.0 (April 2026), the `policy.json` carries a `national_platform`
block declaring articulation with the **Plataforma Nacional de Práticas
Pedagógicas de IA no Ensino Superior** proposed by the **CNIPES**
(Conselho Nacional para a Inovação Pedagógica no Ensino Superior) in
its April 2026 diagnostic report (DOI
[10.5281/zenodo.19555760](https://doi.org/10.5281/zenodo.19555760)).
The footer now renders a short articulated link to the platform's
reference URL, when present.

The CNIPES platform is, at the time of writing, a proposal under
development in Phase 2 of the CNIPES project. Atlas declares
articulation, not integration: when and if the Platform is published,
the Atlas-generated declarations and the framework-versioned risk
evaluations can contribute as registrable institutional practice.

The detailed mapping between Atlas / the FMUP framework and the
CNIPES diagnosis is in
[Chapter 12b — Enquadramento nacional](https://tiagojct.eu/fmup-ia/quadro/12b-panorama-portugal.html)
and in [Annex G — Grelha de maturidade](https://tiagojct.eu/fmup-ia/quadro/G-maturidade-cnipes.html)
of the FMUP framework.

## Use it

- Hosted: <https://tiagojct.eu/fmup-ia/atlas/> (deployed to GitHub Pages on every
  push to `main` of the parent monorepo `tiagojct/fmup-ia`).
- Locally with a server (recommended for full functionality):
  ```sh
  # from the repo root, after `quarto render`:
  cd _site && python3 -m http.server 8000
  # then open http://localhost:8000/atlas/
  ```
  Or, to develop only the SPA without a Quarto build:
  ```sh
  cd fmup-ia/atlas && python3 -m http.server 8000
  # then open http://localhost:8000
  ```
- Locally from `file://`: open `atlas/index.html` in a browser. Statement
  generation works; the institutional risk panel is disabled because
  `policy.json` cannot be fetched cross-origin from `file://`.

## Adapt for another institution

The branding (`FMUP`), the wording inside generated statements
(`i18n/pt.js`, `i18n/en.js`), and the institutional rules (`policy.json`) are
all editable as plain text. To create a derivative for another institution:

1. Fork the repository.
2. In `index.html` and `style.css`, change brand text and accent colours.
3. In `i18n/pt.js` and `i18n/en.js`, update institutional names and any
   wording specific to your context. Bump `APP_VERSION` in `app.js` whenever
   statement wording changes.
4. In `policy.json`, edit `framework_version`, `framework_url`, the four
   risk levels, and the rules list. Each rule has:
   - `id` (stable identifier);
   - `trigger` (a small object describing the state predicate that fires the
     rule — supported keys: `role`, `submission`, `assignment`,
     `assignment_any`, `tasks_any`, `tools_regex`, `policy`, `level`,
     `activity`, `activity_any`, `target`, `target_any`, `modification`);
   - `risk` (1 = minimal, 2 = limited, 3 = high, 4 = unacceptable);
   - `principle_ref`, `scenario_ref` (informational anchors);
   - `message_pt`, `message_en` (user-visible guidance).

## Versioning

The tool follows two independent semver streams:

- `APP_VERSION` (in `app.js`) — covers UI behaviour, statement wording, and
  i18n. Bumped whenever text in `i18n/*.js` changes.
- `policy.version` (in `policy.json`) — covers the institutional rules and
  framework reference. Bumped whenever rules, levels, or framework version
  change.

Both versions appear in the footer and are referenced in generated
declarations, so a declaration can always be traced to the exact wording and
ruleset that produced it.

## Privacy

- No user input is sent to a server.
- No cookies; only `localStorage` is used, and only to remember the language
  preference (`fmup-ai-lang`).
- The URL hash encodes the user's selections (base64 of a small JSON), so
  copying the page URL produces a shareable link that reproduces the form.
  Anyone with the link can reconstruct the selections; do not paste links
  containing sensitive free-text into channels you do not control.

## License

The tool is distributed under the same licence as the FMUP framework book:
**Creative Commons Attribution 4.0 (CC BY 4.0)**.

## Contact

Tiago Jacinto — Faculdade de Medicina da Universidade do Porto.
