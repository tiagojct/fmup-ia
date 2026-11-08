# Themis hardening implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed Themis privacy, accessibility, state-validation, summary, and version-traceability defects without changing the declaration branches or policy rules.

**Architecture:** Small, additive changes to the existing vanilla-JS SPA. Tests drive each behavior change. Fonts become local assets, policy metadata becomes strictly versioned, and restored URL state is validated by role.

**Tech Stack:** HTML, CSS, vanilla JavaScript, JSON, Node.js test runner, jsdom, Python build checks, Quarto.

**Spec:** `docs/superpowers/specs/2026-11-07-themis-hardening-design.md`

## Global Constraints

- Keep Themis dependency-free at runtime and usable from `file://`.
- Keep European Portuguese in pre-AO90 orthography.
- Preserve the v2 and v3 URL hash formats and invalid-link recovery.
- Do not change policy rules, risk levels, or institutional wording.
- Do not add a `scope` trigger in this pass.
- Do not commit. The parent repository contains unrelated framework v1.7 edits.
- Only touch `themis/`, `_quarto.yml` resources, and `_variables.yml` versions.
- App version becomes `1.3.2`; policy version becomes `1.7.2`.
- The policy framework reference stays `FMUP Quadro de Referência v1.7 (2026-10-20)`.

## Review Focus

- Malformed optional policy data must not break the form.
- Crafted or cross-role shared links must not show unrelated risk state.
- Impossible calendar dates must be rejected.
- A missing policy must show the unavailable notice on the form.
- Custom free text must survive the selections summary.
- Printed output must include the selections summary.
- The page must make no third-party font request.
- Dark-mode navigation must stay readable.
- Portuguese UI text must use pt-PT vocabulary and pre-AO90 spelling.

---

### Task 1: Add regression tests

**Files:**
- Modify: `themis/test/smoke.js`

**Interfaces:**
- Consumes: existing `boot`, `fillUse`, `hash`, `policy` helpers.
- Produces: failing tests for every confirmed defect. No production interface changes.

- [ ] **Step 1: Add shared-state and policy tests**

Append these tests to `themis/test/smoke.js`:

```js
test('invalid calendar dates are rejected from shared links', async t => {
  for (const useDate of ['2026-02-30', '2026-13-01', '2026-00-10']) {
    const a = await boot(t, { state: { v: 3, role: 'student', lang: 'pt', submission: 'individual', assignment: ['report'], tasks: ['editing'], tools: 'X', scope: 'auxiliary', modification: 'edited', contextReviewed: true, useDate } });
    assert.ok(a.$('.role-card'));
    assert.equal(a.w.location.hash, '');
  }
});

test('teacher shared links cannot inject student no-use or risk context', async t => {
  const a = await boot(t, { state: { v: 3, role: 'teacher', lang: 'pt', courseType: 'uc_master', assignment: ['essay'], policy: 'with_disclosure', noUse: true, riskFlags: ['sensitive_public'] } });
  assert.ok(a.$('input[name=courseType]:checked'));
  assert.equal(a.$('#no-use'), null);
  assert.equal(a.$('.risk-4'), null);
  assert.doesNotMatch(a.$('main').textContent, /Não foi declarada utilização|No AI use was declared/);
});

test('malformed optional policy data does not break the form', async t => {
  const a = await boot(t, { loadedPolicy: { ...policy, recommended_tools: [null, { name: 'IAedu', tier: 'institutional', privacy_pt: 'Local', privacy_en: 'Local' }] } });
  a.role('student');
  assert.ok(a.$('input[name=submission]'));
  assert.ok(a.$('.tool-chips-wrap'));
  assert.match(a.$('.tool-chips-wrap').textContent, /IAedu/);
});

test('unavailable policy is announced on the form after a selection', async t => {
  const a = await boot(t, { loadedPolicy: null });
  a.role('student');
  a.pick('submission', 'individual');
  assert.ok(a.$('.risk-panel'));
  assert.match(a.$('.risk-panel').textContent, /indisponível|unavailable/);
});
```

- [ ] **Step 2: Add form, summary, print, and language tests**

```js
test('researcher other-task input is hidden until selected', async t => {
  const a = await boot(t);
  a.role('researcher');
  assert.ok(a.$('#tasks-other-wrap'));
  assert.equal(a.$('#tasks-other-wrap').hidden, true);
  a.pick('tasks', 'other');
  assert.equal(a.$('#tasks-other-wrap').hidden, false);
  a.change('input[name="tasks"][value="other"]', false);
  assert.equal(a.$('#tasks-other-wrap').hidden, true);
});

test('selection summaries preserve custom task and assignment text', async t => {
  const researcher = await boot(t);
  researcher.role('researcher');
  fillUse(researcher);
  researcher.pick('tasks', 'other');
  researcher.type('tasks-other-input', 'custom task');
  researcher.generate();
  assert.match(researcher.$('.selections-summary').textContent, /custom task/);

  const teacher = await boot(t);
  teacher.role('teacher');
  teacher.pick('courseType', 'uc_master');
  teacher.pick('assignment', 'other');
  teacher.type('teacher-assignment-other-input', 'video educativo');
  teacher.pick('policy', 'with_disclosure');
  teacher.generate();
  assert.match(teacher.$('.selections-summary').textContent, /video educativo/);
});

test('student no-use output includes a no-use summary and print target', async t => {
  const a = await boot(t);
  a.role('student');
  a.pick('submission', 'individual');
  a.pick('assignment', 'report');
  a.check('no-use');
  a.generate();
  assert.match(a.$('.selections-summary').textContent, /não-utilização|non-use/i);
  assert.ok(a.$('.selections-summary.print-target'));
});

test('Portuguese UI uses pt-PT vocabulary', async t => {
  const a = await boot(t);
  assert.doesNotMatch(a.w.I18N_PT.ui.restoredChoices, /arquivo/i);
  assert.match(a.w.I18N_PT.ui.restoredChoices, /ficheiro/i);
});
```

- [ ] **Step 3: Add static security and policy schema tests**

```js
test('the page makes no third-party font request', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.doesNotMatch(css, /fonts\.googleapis\.com|fonts\.gstatic\.com|@import\s+url\(['"]https?:/i);
  assert.match(css, /@font-face/);
  for (const file of ['AtkinsonHyperlegibleNext-Variable-Latin.woff2', 'AtkinsonHyperlegibleNext-Variable-Italic-Latin.woff2', 'GeistMono-Variable-Latin.woff2']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'fonts', file)), file);
  }
});

test('page metadata declares CSP, referrer and color scheme', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /http-equiv="Content-Security-Policy"/i);
  assert.match(html, /default-src 'self'/);
  assert.match(html, /name="referrer" content="no-referrer"/i);
  assert.match(html, /name="color-scheme" content="light dark"/i);
});

test('dark-mode navigation links do not use dark text on dark background', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.doesNotMatch(css, /\.back-bar \.back-link\s*\{[^}]*color:\s*#1A1A1A/i);
});

test('policy schema is complete and unique', async t => {
  const a = await boot(t);
  assert.match(policy.version, /^\d+\.\d+\.\d+$/);
  assert.match(policy.framework_version, /FMUP Quadro/);
  const ids = new Set();
  for (const rule of policy.rules) {
    assert.ok(rule.id);
    assert.equal(ids.has(rule.id), false, rule.id);
    ids.add(rule.id);
    assert.ok(rule.message_pt, rule.id);
    assert.ok(rule.message_en, rule.id);
  }
  assert.equal(new Set(policy.gaidet.order).size, policy.gaidet.order.length);
  for (const domain of policy.gaidet.order) assert.ok(a.w.I18N_PT.shared.gaidet[domain], domain);
  assert.equal(Object.keys(a.w.I18N_PT.principles).length, 7);
  for (const ref of Object.keys(a.w.I18N_PT.principles)) assert.ok(a.w.I18N_EN.principles[ref], ref);
  for (const tool of policy.recommended_tools) {
    assert.ok(tool.name);
    assert.ok(tool.tier);
    assert.ok(tool.privacy_pt);
    assert.ok(tool.privacy_en);
  }
  for (const meta of Object.values(policy.risk_levels)) {
    assert.ok(meta.label_pt && meta.label_en && meta.description_pt && meta.description_en);
  }
});
```

- [ ] **Step 4: Run the suite and confirm the new tests fail**

Run: `cd themis/test && npm test`

Expected: new assertions fail on invalid dates, role injection, malformed tools, unavailable-policy panel, researcher other-task wrapper, custom summary text, no-use summary, print target, "arquivo", external font import, CSP metadata, and dark back-link rule.

Do not commit. The parent tree is intentionally dirty.

---

### Task 2: Harden state and policy loading

**Files:**
- Modify: `themis/app.js`

**Interfaces:**
- Consumes: `decodeState(hash)`, `freshState()`, `renderToolChips(toolsInputId)`, `renderRiskPanel(showOnEmpty)`.
- Produces: `decodeState()` rejects impossible dates and sanitises role-specific fields; `renderToolChips()` filters malformed tools; `renderRiskPanel(false)` shows an unavailable panel after any form selection.

- [ ] **Step 1: Add real calendar validation**

Add a helper near `decodeState`:

```js
function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
```

Replace the shape-only check with `if (s.useDate && !isValidDate(s.useDate)) return { __invalid: true };`.

- [ ] **Step 2: Sanitise restored state by role**

After the existing arrays/enums validation and before returning `s`, clear unrelated fields:

```js
const keep = {
  student: ['submission', 'assignment', 'assignmentOther', 'tasks', 'tasksOther', 'tools', 'modification', 'useDate', 'scope', 'noUse', 'affectedSections', 'verifications', 'promptsRef', 'privacyConfirmed', 'reviewConfirmed', 'groupConfirmed', 'contextReviewed', 'riskFlags'],
  teacher: ['level', 'assignment', 'assignmentOther', 'policy', 'skills', 'skillsOther', 'courseType'],
  researcher: ['tasks', 'tasksOther', 'tools', 'scope', 'noUse', 'activity', 'target', 'promptsRef', 'affectedSections', 'verifications', 'privacyConfirmed', 'reviewConfirmed', 'contextReviewed', 'riskFlags', 'useDate'],
};
for (const key of Object.keys(s)) {
  if (['lang', 'role', 'done', 'sourceVersions'].includes(key)) continue;
  if (!keep[s.role] || !keep[s.role].includes(key)) {
    if (key === 'groupConfirmed' || key === 'privacyConfirmed' || key === 'reviewConfirmed' || key === 'contextReviewed') s[key] = false;
    else if (Array.isArray(s[key])) s[key] = [];
    else if (typeof s[key] === 'string') s[key] = '';
    else s[key] = null;
  }
}
if (s.submission !== 'group') s.groupConfirmed = false;
if ((s.riskFlags || []).includes('sensitive_public')) s.privacyConfirmed = false;
```

Keep `sourceVersions`, `lang`, `role`, and `done` (which is forced false later).

- [ ] **Step 3: Filter malformed recommended tools**

In `renderToolChips`, replace direct use of `POLICY.recommended_tools` with:

```js
const validTools = POLICY.recommended_tools.filter((tool) =>
  tool && typeof tool === 'object' &&
  typeof tool.name === 'string' && tool.name.trim() &&
  typeof tool.tier === 'string'
);
if (!validTools.length) return null;
```

Use `validTools` in the tier loop. Add a privacy fallback:

```js
const privacy = isPt ? (tool.privacy_pt || tool.privacy_en || '') : (tool.privacy_en || tool.privacy_pt || '');
```

- [ ] **Step 4: Show the unavailable policy notice on forms**

In `renderRiskPanel`, change the `!POLICY` branch to return the unavailable panel whenever the function is reached, without checking `showOnEmpty` again:

```js
if (!POLICY) {
  return el('div',
    { class: 'risk-panel risk-na', role: 'note' },
    el('h3', { class: 'risk-heading', text: i.risk.unavailableHeading }),
    el('p', { class: 'risk-body', text: i.risk.unavailableBody })
  );
}
```

The earlier `hasAnyFormSelection()` guard still keeps the panel hidden before the first selection.

- [ ] **Step 5: Run the targeted tests**

Run: `cd themis/test && npm test`

Expected: the state, malformed-tools, role-injection, invalid-date, and unavailable-policy tests pass. Summary, font, CSP, and dark-mode tests still fail.

---

### Task 3: Fix form and summary behavior

**Files:**
- Modify: `themis/app.js`
- Modify: `themis/i18n/pt.js`
- Modify: `themis/i18n/en.js`

**Interfaces:**
- Consumes: `renderResearcherForm()`, `makeSelectionsSummary()`, `computeOutputs()`.
- Produces: `#tasks-other-wrap` on the researcher form; custom summary text; student no-use row; `selections-summary print-target`.

- [ ] **Step 1: Hide the researcher other-task input**

In `renderResearcherForm`, create the wrapper before the task checkbox group, exactly as the student form does:

```js
const tasksOtherWrap = el('div', { id: 'tasks-other-wrap', hidden: state.tasks.indexOf('other') === -1 });
tasksOtherWrap.appendChild(textInputRow(
  'tasks-other-input',
  i.student.tasksOtherLabel,
  state.tasksOther,
  v => { state.tasksOther = v; syncHash(true); refreshGenerate(screen); },
  i.student.tasksOtherLabel
));
screen.appendChild(checkboxGroup('tasks', asOptions(i.researcher.tasks), state.tasks, (v) => {
  state.tasks = v;
  tasksOtherWrap.hidden = v.indexOf('other') === -1;
  syncHash(true);
  refreshGenerate(screen);
}));
screen.appendChild(tasksOtherWrap);
```

Use the existing `i.student.tasksOtherLabel` or add a researcher-specific key if adding one keeps parity in both languages. Do not duplicate the input unconditionally.

- [ ] **Step 2: Fix summary custom text and no-use row**

In `makeSelectionsSummary`:

```js
pushRow(rows, i.teacher.step2, (state.assignment || []).map((k) =>
  k === 'other' && state.assignmentOther.trim() ? state.assignmentOther.trim() : i.teacher.assignment[k]
).filter(Boolean).join(', '));

pushRow(rows, i.researcher.step2, (state.tasks || []).map((k) =>
  k === 'other' && state.tasksOther.trim() ? state.tasksOther.trim() : i.researcher.tasks[k]
).filter(Boolean).join(', '));
```

In the student branch, after the role row or with the other student rows:

```js
if (state.noUse) pushRow(rows, i.shared.noUseLabel, i.shared.noUseSummary);
```

- [ ] **Step 3: Mark the summary for print**

Change:

```js
const wrap = el('section', { class: 'selections-summary' });
```

to:

```js
const wrap = el('section', { class: 'selections-summary print-target' });
```

- [ ] **Step 4: Move hardcoded UI copy and correct Portuguese**

Add `ui.toolsTierInstitutionalBlurb`, `toolsTierEnterpriseBlurb`, `toolsTierSpecialisedBlurb`, and `toolsTierConsumerWarningBlurb` to both i18n files. Replace the `tierBlurbs` object in `renderToolChips` with lookups from `i.ui`.

Move the seven principle names from `app.js` into an `i.principles` map in both i18n files. Update `principleInfo` to read `i.principles[ref]`.

In `i18n/pt.js`, change `restoredChoices` from "arquivo" to "ficheiro". Keep pre-AO90 forms such as "actuais".

Remove dead code while touching these files: `policyText()` in `app.js`, `LEVEL_LABEL` in both i18n files, the unused `subj` in `en.js`, and the unused `markdownTitle` fields if they remain unused.

- [ ] **Step 5: Guard duplicate location handling**

Add a module-level `lastHandledHash`. Create one handler that decodes, applies, and renders, then call it from both `hashchange` and `popstate`. After handling, set `lastHandledHash = location.hash`. In `init`, initialise it after the initial restore. This prevents one navigation from rendering twice.

- [ ] **Step 6: Run the tests**

Run: `cd themis/test && npm test`

Expected: researcher other-task, summary custom text, student no-use summary, print target, PT vocabulary, and i18n parity tests pass.

---

### Task 4: Self-host fonts and add browser security metadata

**Files:**
- Create: `themis/fonts/AtkinsonHyperlegibleNext-Variable-Latin.woff2`
- Create: `themis/fonts/AtkinsonHyperlegibleNext-Variable-Italic-Latin.woff2`
- Create: `themis/fonts/GeistMono-Variable-Latin.woff2`
- Modify: `themis/style.css`
- Modify: `themis/index.html`
- Modify: `_quarto.yml`

**Interfaces:**
- Consumes: existing font files in `_extensions/tiagojct/fmup/fonts/`.
- Produces: local `@font-face` rules, no external font request, CSP/referrer/color-scheme metadata, readable dark navigation.

- [ ] **Step 1: Copy the existing WOFF2 files**

```sh
mkdir -p themis/fonts
cp _extensions/tiagojct/fmup/fonts/AtkinsonHyperlegibleNext-Variable-Latin.woff2 themis/fonts/
cp _extensions/tiagojct/fmup/fonts/AtkinsonHyperlegibleNext-Variable-Italic-Latin.woff2 themis/fonts/
cp _extensions/tiagojct/fmup/fonts/GeistMono-Variable-Latin.woff2 themis/fonts/
```

Add `"themis/fonts/**"` to the `resources` list in `_quarto.yml`.

- [ ] **Step 2: Replace the Google Fonts import with local @font-face rules**

Remove the `@import url('https://fonts.googleapis.com/...')` line. Add above `:root`:

```css
@font-face {
  font-family: 'Atkinson Hyperlegible Next';
  font-style: normal;
  font-weight: 400 800;
  font-display: swap;
  src: url('fonts/AtkinsonHyperlegibleNext-Variable-Latin.woff2') format('woff2');
}

@font-face {
  font-family: 'Atkinson Hyperlegible Next';
  font-style: italic;
  font-weight: 400 800;
  font-display: swap;
  src: url('fonts/AtkinsonHyperlegibleNext-Variable-Italic-Latin.woff2') format('woff2');
}

@font-face {
  font-family: 'Geist Mono';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('fonts/GeistMono-Variable-Latin.woff2') format('woff2');
}
```

Change `--font-mono` to `"Geist Mono", ui-monospace, ...`. Keep the Atkinson family in `--font-stack`.

- [ ] **Step 3: Fix dark navigation and focus visibility**

In the dark-mode block, change the base back-link color to a light token:

```css
.back-bar .back-link {
  color: var(--c-text-muted);
  border-color: transparent;
}
```

Keep the hover rule with dark text on yellow. Change the global focus rule to:

```css
:focus-visible {
  outline: 3px solid var(--c-text);
  outline-offset: 2px;
  box-shadow: 0 0 0 5px rgba(255, 205, 0, 0.45);
  border-radius: var(--radius-sm);
}
```

Add reduced-motion handling:

```css
@media (prefers-reduced-motion: reduce) {
  .screen { animation: none; }
  .tool-chip:active { transform: none; }
}
```

- [ ] **Step 4: Add metadata to index.html**

Change `color-scheme` to `light dark`. Add:

```html
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">
```

Keep the existing favicon and local script/style paths.

- [ ] **Step 5: Run static and DOM tests**

Run: `cd themis/test && npm test`

Expected: no external font request test, font file existence, CSP/referrer/color-scheme, dark navigation, and print target tests pass.

---

### Task 5: Update version metadata and documentation

**Files:**
- Modify: `_variables.yml`
- Modify: `themis/CHANGELOG.md`
- Modify: `themis/README.md`
- Generated: `themis/policy.json`, `themis/app.js`, `themis/index.html`

**Interfaces:**
- Consumes: `scripts/sync-versions.py`.
- Produces: app `1.3.2`, policy `1.7.2`, framework v1.7, consistent docs.

- [ ] **Step 1: Bump both version streams**

In `_variables.yml`:

```yaml
themis:
  versao: "1.3.2"
  regras: "1.7.2"
```

Run: `python3 scripts/sync-versions.py`

Expected: `themis/app.js`, `themis/index.html`, and `themis/policy.json` update.

- [ ] **Step 2: Update README**

In "Privacy", state that no form data is transmitted and all assets, including fonts, are served locally. Add font attribution under License: Atkinson Hyperlegible Next (Braille Institute, SIL OFL 1.1) and Geist Mono (Vercel, SIL OFL 1.1).

In "Versioning", state that `_variables.yml` is the source and that `APP_VERSION` is generated. Clarify that policy 1.7.2 tracks framework v1.7 with unchanged rules.

- [ ] **Step 3: Add the changelog entry**

Add above `[1.3.1]`:

```md
## [1.3.2] — 2026-11-07

- Self-host Atkinson Hyperlegible Next and Geist Mono; no third-party font request.
- Add CSP, referrer policy and `color-scheme: light dark`.
- Fix dark-mode navigation contrast and focus visibility.
- Validate real calendar dates and sanitise shared state by role.
- Filter malformed optional policy data instead of crashing.
- Show the policy-unavailable notice on forms after a first selection.
- Hide the researcher other-task input until selected.
- Preserve custom task and assignment text in summaries; add student no-use summary.
- Include the selections summary in printed output.
- Move remaining UI copy into i18n; correct the Portuguese "ficheiro" wording.
- Policy 1.7.2 references framework v1.7. Rules are unchanged.
```

- [ ] **Step 4: Run consistency checks**

Run:

```sh
python3 scripts/sync-versions.py --check
python3 scripts/check-content.py
```

Expected: both pass.

---

### Task 6: Full verification

- [ ] **Step 1: Run the complete test suite**

Run: `cd themis/test && npm test`

Expected: all tests pass.

- [ ] **Step 2: Render the site**

Run: `quarto render`

Expected: no errors. The rendered site includes `_site/themis/fonts/*.woff2`.

- [ ] **Step 3: Verify rendered privacy and links**

Run:

```sh
python3 scripts/audit-links.py
grep -R "fonts.googleapis.com" _site/themis || true
```

Expected: audit passes and the grep finds no external font URL.

- [ ] **Step 4: Verify local and file behavior**

Run `cd themis && python3 -m http.server 8000`, open `http://localhost:8000`, and check:

- landing page in light and dark mode;
- back links visible in dark mode;
- one student, one teacher, and one researcher flow;
- share link restore shows the review note;
- print preview includes outputs and the selections summary;
- browser console has no CSP violations.

Stop the server.

- [ ] **Step 5: Report the final diff**

Run `git diff --stat -- themis _quarto.yml _variables.yml docs/superpowers` and summarize the changes. Do not commit.

---

### Task 7: Optional jsdom upgrade

Only run this after Task 6 passes.

**Files:**
- Modify: `themis/test/package.json`
- Generated: `themis/test/package-lock.json`

- [ ] **Step 1: Upgrade the dev dependency**

Change `jsdom` to `^31.0.0`, then run `npm install` in `themis/test`.

- [ ] **Step 2: Run the suite**

Run: `npm test`.

Expected: all tests pass. If the upgrade introduces unrelated failures, revert only the jsdom changes and report the reason.
