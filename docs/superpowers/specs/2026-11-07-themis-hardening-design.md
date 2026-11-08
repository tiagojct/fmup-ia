# Themis hardening design

**Date:** 2026-11-07
**Status:** Approved by the user in this session.
**Scope:** `themis/` plus the minimum parent wiring needed for local assets.

## Intent

Fix the confirmed audit findings without changing the public shape of the
three declaration branches. Keep Themis a dependency-free, client-side
tool. Preserve existing v2 and v3 shared links unless their content is
invalid.

## Goals

- Remove the third-party Google Fonts request and self-host the existing
  Atkinson Hyperlegible Next and Geist Mono WOFF2 assets.
- Add a Content Security Policy, referrer policy, and correct
  `color-scheme` metadata.
- Make dark-mode navigation readable and printed output complete.
- Harden shared-state restoration: real dates, role-specific fields, and
  no-use state.
- Make policy loading fail gracefully for malformed optional blocks and
  show the unavailable notice on forms.
- Fix the researcher "other task" control and the selections summary.
- Move remaining hardcoded UI copy into i18n and correct pt-PT wording.
- Bump the app to 1.3.2 and policy to 1.7.2 without changing policy rules.
- Add regression and static-contract tests.

## Non-goals

- No change to the policy rules, risk levels, or framework wording.
- No `scope` trigger predicate in this pass. That is a separate policy
  review.
- No redesign of the form, statement wording, or institutional content.
- No certification claim, security review, DPIA, or deployment change.
- No commit while the parent working tree contains unrelated framework
  v1.7 edits.

## Constraints

- Vanilla JavaScript, HTML, and CSS. No runtime dependency and no build
  step.
- Keep European Portuguese in pre-AO90 orthography.
- Keep the tool fully usable from `file://`; policy guidance stays
  optional.
- Preserve the v2 and v3 URL hash formats and invalid-link recovery.
- Keep changes inside `themis/`, except:
  - `_quarto.yml` resource glob for `themis/fonts/*.woff2`;
  - `_variables.yml` version values.
- Do not revert or rewrite unrelated parent changes.

## Decisions

1. **Fonts:** self-host the existing WOFF2 files from
   `_extensions/tiagojct/fmup/fonts/`. This removes the external request
   and preserves the brand typography.
2. **Policy version:** bump `themis.regras` from 1.7.1 to 1.7.2. Rules do
   not change; the version records the framework v1.7 reference.
3. **App version:** bump `themis.versao` from 1.3.1 to 1.3.2. UI,
   accessibility, and i18n behavior change.
4. **Scope trigger:** defer. Do not add `scope` to `matchesTrigger()` or
   change `R-RESEARCHER-DRAFTING-SUBSTANTIVE` in this pass.
5. **Execution:** native in this session. The tasks share files and test
   fixtures, so one implementer keeps the interfaces consistent.

## Risks and mitigations

- Font metrics may shift slightly. Use the same variable fonts and verify
  the rendered page.
- State sanitisation can reject crafted links. Valid v2 and v3 links stay
  covered by tests.
- CSP can block a resource if a URL is missed. All assets become
  same-origin, and the rendered page is checked.
- Version bumps touch generated metadata. `sync-versions.py --check`
  validates the result.
- The parent repository is dirty. Change only the two additive parent
  lines and do not commit.
