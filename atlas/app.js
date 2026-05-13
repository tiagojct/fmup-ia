/*
 * FMUP AI Usage Statement Generator — main app
 *
 * No build step. No dependencies. No CDN. Runs from file:// for development.
 * All user-facing strings live in i18n/pt.js and i18n/en.js — this file
 * contains no hardcoded UI copy.
 */

(function () {
  'use strict';

  // ---- Single source of truth for the tool version. ----
  // Bump this when statement content (any i18n file) changes.
  const APP_VERSION = '0.6.5';

  // Schema version for the URL hash payload. Bump when state shape
  // changes incompatibly. Hashes with a different `v` are rejected.
  const HASH_V = 1;

  const I18N = { pt: window.I18N_PT, en: window.I18N_EN };
  const DEFAULT_LANG = 'pt';

  // Loaded from policy.json at startup. May remain null if fetch fails
  // (e.g. file:// without a server) — the app still works, with the
  // institutional risk panel disabled.
  let POLICY = null;

  // -------- State --------

  // The full decision path. Encoded into the URL hash on every change.
  let state = freshState();

  function freshState() {
    return {
      lang: detectLang(),
      role: null,
      done: false,
      // student
      submission: null,
      assignment: [],
      tasks: [],
      tools: '',
      modification: null,
      // teacher
      level: null,
      policy: null,
      skills: [],
      skillsOther: '',
      // researcher
      activity: null,
      target: null,
    };
  }

  function detectLang() {
    const stored = localStorage.getItem('fmup-ai-lang');
    if (stored && I18N[stored]) return stored;
    const nav = (navigator.language || '').toLowerCase();
    if (nav.startsWith('en')) return 'en';
    return DEFAULT_LANG;
  }

  function t() {
    return I18N[state.lang] || I18N[DEFAULT_LANG];
  }

  // -------- Hash encoding --------

  function b64encode(s) {
    return btoa(unescape(encodeURIComponent(s)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64decode(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return decodeURIComponent(escape(atob(s)));
  }

  function encodeState(s) {
    const persisted = {
      v: HASH_V,
      lang: s.lang,
      role: s.role,
      done: s.done,
      submission: s.submission,
      assignment: s.assignment,
      tasks: s.tasks,
      tools: s.tools,
      modification: s.modification,
      level: s.level,
      policy: s.policy,
      skills: s.skills,
      skillsOther: s.skillsOther,
      activity: s.activity,
      target: s.target,
    };
    return b64encode(JSON.stringify(persisted));
  }

  function decodeState(hash) {
    const m = String(hash || '').match(/(?:^#?|[#&])s=([^&]+)/);
    if (!m) return null;
    try {
      const obj = JSON.parse(b64decode(m[1]));
      if (obj.v !== HASH_V) {
        return { __invalid: true };
      }
      const s = freshState();
      Object.assign(s, obj);
      if (!I18N[s.lang]) s.lang = DEFAULT_LANG;
      return s;
    } catch (_e) {
      return { __invalid: true };
    }
  }

  let suppressHashListener = false;

  function syncHash(replace) {
    if (!state.role) {
      if (location.hash) {
        suppressHashListener = true;
        history.replaceState(null, '', location.pathname + location.search);
        setTimeout(() => { suppressHashListener = false; }, 0);
      }
      return;
    }
    const newHash = '#s=' + encodeState(state);
    if (location.hash === newHash) return;
    suppressHashListener = true;
    if (replace) history.replaceState(null, '', newHash);
    else history.pushState(null, '', newHash);
    setTimeout(() => { suppressHashListener = false; }, 0);
  }

  // -------- DOM helpers --------

  function el(tag, props) {
    const e = document.createElement(tag);
    const children = Array.prototype.slice.call(arguments, 2);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'dataset') {
          for (const dk in v) e.dataset[dk] = v[dk];
        } else if (k.indexOf('on') === 0 && typeof v === 'function') {
          e.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'type') {
          e[k] = v;
        } else {
          e.setAttribute(k, v);
        }
      }
    }
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) {
        for (let j = 0; j < c.length; j++) {
          const cc = c[j];
          if (cc == null || cc === false) continue;
          e.appendChild(typeof cc === 'string' ? document.createTextNode(cc) : cc);
        }
      } else if (typeof c === 'string' || typeof c === 'number') {
        e.appendChild(document.createTextNode(String(c)));
      } else {
        e.appendChild(c);
      }
    }
    return e;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // -------- Toast --------

  let toastTimer = null;
  function toast(msg) {
    const node = document.getElementById('toast');
    node.textContent = msg;
    node.classList.add('is-visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('is-visible'), 1800);
  }

  // -------- Header / footer / chrome --------

  function applyChrome() {
    const i = t();
    document.documentElement.lang = i.htmlLang;
    document.title = i.ui.brand + ' — ' + i.ui.appTitle;

    document.getElementById('brand-short').textContent = i.ui.brand;
    document.getElementById('brand-full').textContent = i.ui.brandFull;
    document.getElementById('app-title').textContent = i.ui.appTitle;
    document.getElementById('app-subtitle').textContent = i.ui.appSubtitle;

    const backQuadro = document.getElementById('back-link-quadro');
    if (backQuadro) backQuadro.textContent = i.ui.backToQuadro;
    const backHome = document.getElementById('back-link-home');
    if (backHome) backHome.textContent = i.ui.backToHome;

    const langBtn = document.getElementById('lang-toggle');
    langBtn.textContent = i.altLabel;
    langBtn.setAttribute('aria-label', i.ui.switchLanguage);
    langBtn.title = i.ui.switchLanguage;

    const startOver = document.getElementById('start-over-btn');
    startOver.textContent = i.ui.startOver;
    startOver.hidden = !state.role;

    document.getElementById('footer-version').textContent =
      i.ui.footerVersion + ' ' + APP_VERSION;
    document.getElementById('footer-date').textContent =
      i.ui.footerDate + ' ' + formatDate(new Date());

    const fw = document.getElementById('footer-framework');
    const fwDot = document.getElementById('footer-framework-dot');
    if (fw) {
      if (POLICY && POLICY.framework_version) {
        fw.textContent = (i.ui.footerFramework || '') + ' ' + POLICY.framework_version;
        fw.hidden = false;
        if (fwDot) fwDot.hidden = false;
      } else {
        fw.hidden = true;
        if (fwDot) fwDot.hidden = true;
      }
    }

    // National platform articulation (CNIPES). Renders only if the
    // current policy.json declares a `national_platform` block; the
    // text is linked to the platform reference URL.
    const np = document.getElementById('footer-national-platform');
    const npDot = document.getElementById('footer-national-platform-dot');
    if (np) {
      if (POLICY && POLICY.national_platform && i.ui.footerNationalPlatform) {
        np.textContent = i.ui.footerNationalPlatform;
        if (POLICY.national_platform.url) {
          np.href = POLICY.national_platform.url;
        }
        np.hidden = false;
        if (npDot) npDot.hidden = false;
      } else {
        np.hidden = true;
        if (npDot) npDot.hidden = true;
      }
    }
  }

  function formatDate(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // -------- Rendering --------

  function render() {
    applyChrome();
    const main = document.getElementById('main');
    clear(main);
    document.body.classList.remove('printing-output');

    if (!state.role) {
      main.appendChild(renderLanding());
    } else if (state.done) {
      main.appendChild(renderOutput());
    } else {
      main.appendChild(renderForm());
    }

    // Move focus to main on screen change for keyboard users.
    main.focus({ preventScroll: true });
  }

  // -------- Risk evaluation against policy.json --------

  function matchesTrigger(trigger, s) {
    if (!trigger) return true;
    if (trigger.role && trigger.role !== s.role) return false;
    if (trigger.submission && trigger.submission !== s.submission) return false;
    if (trigger.modification && trigger.modification !== s.modification) return false;
    if (trigger.policy && trigger.policy !== s.policy) return false;
    if (trigger.level && trigger.level !== s.level) return false;
    if (trigger.activity && trigger.activity !== s.activity) return false;
    if (trigger.target && trigger.target !== s.target) return false;
    if (trigger.assignment_any) {
      const aList = Array.isArray(s.assignment) ? s.assignment : (s.assignment ? [s.assignment] : []);
      const hit = trigger.assignment_any.some((a) => aList.indexOf(a) !== -1);
      if (!hit) return false;
    }
    if (trigger.activity_any && trigger.activity_any.indexOf(s.activity) === -1) return false;
    if (trigger.target_any && trigger.target_any.indexOf(s.target) === -1) return false;
    if (trigger.tasks_any) {
      const taskList = s.tasks || [];
      const hit = trigger.tasks_any.some((t) => taskList.indexOf(t) !== -1);
      if (!hit) return false;
    }
    if (trigger.tools_regex) {
      const tools = (s.tools || '').toString();
      if (!tools) return false;
      try {
        const re = new RegExp(trigger.tools_regex, 'i');
        if (!re.test(tools)) return false;
      } catch (_e) { return false; }
    }
    return true;
  }

  function evaluateRisk(s) {
    if (!POLICY || !POLICY.rules) return { matches: [], maxRisk: 0 };
    const matches = [];
    POLICY.rules.forEach((rule) => {
      if (matchesTrigger(rule.trigger, s)) matches.push(rule);
    });
    const maxRisk = matches.reduce((m, r) => Math.max(m, r.risk || 0), 0);
    return { matches: matches, maxRisk: maxRisk };
  }

  function policyText(key) {
    if (!POLICY) return null;
    const lang = state.lang || DEFAULT_LANG;
    const keyL = key + '_' + lang;
    return POLICY[keyL] || POLICY[key + '_pt'] || POLICY[key];
  }

  function levelMeta(level) {
    if (!POLICY || !POLICY.risk_levels) return null;
    const entry = POLICY.risk_levels[String(level)];
    if (!entry) return null;
    const lang = state.lang || DEFAULT_LANG;
    return {
      label: entry['label_' + lang] || entry.label_pt,
      description: entry['description_' + lang] || entry.description_pt,
    };
  }

  function ruleMessage(rule) {
    const lang = state.lang || DEFAULT_LANG;
    return rule['message_' + lang] || rule.message_pt || '';
  }

  // Canonical principle names (pré-AO90, with accents) keyed by the slug
  // used in policy.json. Mirrors the H2 anchors in quadro/02-principios.qmd.
  const PRINCIPLE_NAMES = {
    'principio-1-agencia-humana':   { pt: 'Agência humana', en: 'Human agency' },
    'principio-2-integridade':      { pt: 'Integridade académica e científica', en: 'Academic and scientific integrity' },
    'principio-3-protecao-dados':   { pt: 'Protecção de dados', en: 'Data protection' },
    'principio-4-transparencia':    { pt: 'Transparência', en: 'Transparency' },
    'principio-5-equidade':         { pt: 'Equidade de acesso', en: 'Equity of access' },
    'principio-6-literacia':        { pt: 'Literacia crítica', en: 'Critical literacy' },
    'principio-7-revisao':          { pt: 'Revisão contínua', en: 'Continuous revision' },
  };

  // Returns { number, name, href } for a principle_ref, or null if it cannot
  // be parsed. `href` points to the anchor in the rendered Quadro chapter.
  function principleInfo(ref, lang) {
    if (!ref) return null;
    const m = String(ref).match(/^principi[oa]-(\d+)-/i);
    if (!m) return null;
    const number = m[1];
    const entry = PRINCIPLE_NAMES[ref];
    const name = entry ? (entry[lang] || entry.pt) : '';
    const href = '../quadro/02-principios.html#' + ref;
    return { number: number, name: name, href: href };
  }

  function renderRiskPanel(showOnEmpty) {
    const i = t();
    const lang = state.lang || DEFAULT_LANG;
    if (!POLICY) {
      if (!showOnEmpty) return null;
      return el('div',
        { class: 'risk-panel risk-na', role: 'note' },
        el('h3', { class: 'risk-heading', text: i.risk.unavailableHeading }),
        el('p', { class: 'risk-body', text: i.risk.unavailableBody })
      );
    }
    const ev = evaluateRisk(state);
    if (!ev.matches.length) {
      if (!showOnEmpty) return null;
      return el('div',
        { class: 'risk-panel risk-1', role: 'note' },
        el('h3', { class: 'risk-heading', text: i.risk.cleanHeading }),
        el('p', { class: 'risk-body', text: i.risk.cleanBody })
      );
    }
    const lvl = ev.maxRisk;
    const meta = levelMeta(lvl);
    const wrap = el('div', { class: 'risk-panel risk-' + lvl, role: 'note' });
    wrap.appendChild(el('h3', {
      class: 'risk-heading',
      text: i.risk.heading + ' ' + lvl + (meta ? ' — ' + meta.label : ''),
    }));
    if (meta && meta.description) {
      wrap.appendChild(el('p', { class: 'risk-body', text: meta.description }));
    }
    const list = el('ul', { class: 'risk-list' });
    ev.matches.forEach((rule) => {
      const refs = el('div', { class: 'risk-refs' });
      const info = principleInfo(rule.principle_ref, lang);
      if (info && info.name) {
        refs.appendChild(el('a', {
          class: 'principle-chip',
          href: info.href,
          target: '_blank',
          rel: 'noopener',
          text: i.ui.principleLabel + ' ' + info.number + ' — ' + info.name,
        }));
      }
      if (rule.scenario_ref) {
        refs.appendChild(el('a', {
          class: 'scenario-link',
          href: rule.scenario_ref,
          target: '_blank',
          rel: 'noopener',
          text: i.ui.viewScenario,
        }));
      }
      list.appendChild(el('li',
        { class: 'risk-item risk-item-' + (rule.risk || 0) },
        el('div', { class: 'risk-line' },
          el('span', { class: 'risk-tag', text: i.risk.levelShort + ' ' + rule.risk }),
          ' ',
          el('span', { class: 'risk-msg', text: ruleMessage(rule) })
        ),
        refs.children.length ? refs : null
      ));
    });
    wrap.appendChild(list);
    wrap.appendChild(el('p', { class: 'risk-foot', text: i.risk.guidanceFoot }));
    return wrap;
  }

  function renderLanding() {
    const i = t();
    const screen = el('section', { class: 'screen', 'aria-labelledby': 'landing-prompt' });
    screen.appendChild(el('p', { class: 'landing-help', text: i.ui.landingHelp }));
    screen.appendChild(el('h2', { class: 'landing-prompt', id: 'landing-prompt', text: i.ui.landingPrompt }));

    const grid = el('div', { class: 'role-grid', role: 'group', 'aria-labelledby': 'landing-prompt' });
    ['student', 'teacher', 'researcher'].forEach((role) => {
      const card = el('button',
        {
          type: 'button',
          class: 'role-card',
          onclick: () => selectRole(role),
        },
        el('span', { class: 'role-name', text: i.roles[role] }),
        el('span', { class: 'role-desc', text: i.rolesDesc[role] })
      );
      grid.appendChild(card);
    });
    screen.appendChild(grid);
    return screen;
  }

  function selectRole(role) {
    state = Object.assign(freshState(), { lang: state.lang, role: role });
    syncHash(false);
    render();
  }

  // -------- Form rendering --------

  function renderForm() {
    if (state.role === 'student') return renderStudentForm();
    if (state.role === 'teacher') return renderTeacherForm();
    if (state.role === 'researcher') return renderResearcherForm();
    return renderLanding();
  }

  function radioGroup(name, options, selected, onchange) {
    const fg = el('div', { class: 'field-group cols-' + (options.length > 3 ? '2' : options.length) });
    options.forEach((opt) => {
      const input = el('input', {
        type: 'radio',
        name: name,
        value: opt.value,
        checked: selected === opt.value,
        onchange: () => { if (input.checked) onchange(opt.value); },
      });
      const label = el('label', { class: 'option' }, input, el('span', { class: 'option-label', text: opt.label }));
      fg.appendChild(label);
    });
    return fg;
  }

  function checkboxGroup(name, options, selected, onchange) {
    const fg = el('div', { class: 'field-group ' + (options.length > 4 ? 'cols-2' : '') });
    options.forEach((opt) => {
      const input = el('input', {
        type: 'checkbox',
        name: name,
        value: opt.value,
        checked: selected.indexOf(opt.value) !== -1,
        onchange: () => {
          const next = selected.slice();
          const idx = next.indexOf(opt.value);
          if (input.checked && idx === -1) next.push(opt.value);
          else if (!input.checked && idx !== -1) next.splice(idx, 1);
          onchange(next);
        },
      });
      const label = el('label', { class: 'option' }, input, el('span', { class: 'option-label', text: opt.label }));
      fg.appendChild(label);
    });
    return fg;
  }

  function stepHeader(num, total, title, help) {
    const i = t();
    const head = el('div', {});
    head.appendChild(el('p', {
      class: 'step-progress',
      text: i.ui.step + ' ' + num + ' ' + i.ui.of + ' ' + total,
    }));
    head.appendChild(el('h2', { class: 'step-title', text: title }));
    if (help) head.appendChild(el('p', { class: 'step-help', text: help }));
    return head;
  }

  function asOptions(map) {
    return Object.keys(map).map((k) => ({ value: k, label: map[k] }));
  }

  function canGenerateNow() {
    if (state.role === 'student') return canGenerateStudent();
    if (state.role === 'teacher') return canGenerateTeacher();
    if (state.role === 'researcher') return canGenerateResearcher();
    return false;
  }

  function navRow(canGenerate) {
    const i = t();
    const row = el('div', { class: 'nav-row' });
    row.appendChild(el('button', {
      type: 'button',
      class: 'btn-secondary',
      text: i.ui.back,
      onclick: backToLanding,
    }));
    row.appendChild(el('span', { class: 'spacer' }));
    row.appendChild(el('button', {
      type: 'button',
      class: 'btn-primary',
      text: i.ui.generate,
      disabled: !canGenerate,
      onclick: () => {
        // Re-check at click time: refreshGenerate() flips the disabled
        // attribute when the user fills the last required field, but the
        // captured `canGenerate` parameter is from initial render. Always
        // recompute against the live state here.
        if (!canGenerateNow()) return;
        state.done = true;
        syncHash(false);
        render();
      },
    }));
    return row;
  }

  function backToLanding() {
    state = freshState();
    state.lang = state.lang || detectLang();
    syncHash(false);
    render();
  }

  // ---- Student form ----

  function renderStudentForm() {
    const i = t();
    const total = 5;
    const screen = el('section', { class: 'screen' });

    screen.appendChild(stepHeader(1, total, i.student.step1));
    screen.appendChild(radioGroup(
      'submission',
      asOptions(i.student.submission),
      state.submission,
      (v) => { state.submission = v; syncHash(true); refreshGenerate(screen); }
    ));

    screen.appendChild(stepHeader(2, total, i.student.step2, i.student.step2Help));
    screen.appendChild(checkboxGroup(
      'assignment',
      asOptions(i.student.assignment),
      state.assignment,
      (v) => { state.assignment = v; syncHash(true); refreshGenerate(screen); }
    ));

    screen.appendChild(stepHeader(3, total, i.student.step3, i.student.step3Help));
    screen.appendChild(checkboxGroup(
      'tasks',
      asOptions(i.student.tasks),
      state.tasks,
      (v) => { state.tasks = v; syncHash(true); refreshGenerate(screen); }
    ));

    screen.appendChild(stepHeader(4, total, i.student.step4, i.student.step4Help));
    screen.appendChild(textInputRow(
      'tools-input',
      i.student.step4Placeholder,
      state.tools,
      (v) => { state.tools = v; syncHash(true); refreshGenerate(screen); }
    ));

    screen.appendChild(stepHeader(5, total, i.student.step5));
    screen.appendChild(radioGroup(
      'modification',
      asOptions(i.student.modification),
      state.modification,
      (v) => { state.modification = v; syncHash(true); refreshGenerate(screen); }
    ));

    const panel = renderRiskPanel(false);
    if (panel) screen.appendChild(panel);
    screen.appendChild(navRow(canGenerateStudent()));
    return screen;
  }

  function canGenerateStudent() {
    return !!(state.submission && (state.assignment || []).length && state.modification);
  }

  // ---- Teacher form ----

  function renderTeacherForm() {
    const i = t();
    const total = 4;
    const screen = el('section', { class: 'screen' });

    screen.appendChild(stepHeader(1, total, i.teacher.step1));
    screen.appendChild(radioGroup(
      'level',
      asOptions(i.teacher.level),
      state.level,
      (v) => { state.level = v; syncHash(true); refreshGenerate(screen); }
    ));

    screen.appendChild(stepHeader(2, total, i.teacher.step2, i.teacher.step2Help));
    screen.appendChild(checkboxGroup(
      'assignment',
      asOptions(i.teacher.assignment),
      state.assignment,
      (v) => { state.assignment = v; syncHash(true); refreshGenerate(screen); }
    ));

    screen.appendChild(stepHeader(3, total, i.teacher.step3));
    screen.appendChild(radioGroup(
      'policy',
      asOptions(i.teacher.policy),
      state.policy,
      (v) => { state.policy = v; syncHash(true); refreshGenerate(screen); }
    ));

    screen.appendChild(stepHeader(4, total, i.teacher.step4, i.teacher.step4Help));
    screen.appendChild(checkboxGroup(
      'skills',
      asOptions(i.teacher.skills),
      state.skills,
      (v) => { state.skills = v; syncHash(true); refreshGenerate(screen); }
    ));
    screen.appendChild(textInputRow(
      'skills-other-input',
      i.teacher.skillsOther,
      state.skillsOther,
      (v) => { state.skillsOther = v; syncHash(true); refreshGenerate(screen); },
      i.teacher.skillsOther
    ));

    const panel = renderRiskPanel(false);
    if (panel) screen.appendChild(panel);
    screen.appendChild(navRow(canGenerateTeacher()));
    return screen;
  }

  function canGenerateTeacher() {
    return !!(state.level && (state.assignment || []).length && state.policy);
  }

  // ---- Researcher form ----

  function renderResearcherForm() {
    const i = t();
    const total = 4;
    const screen = el('section', { class: 'screen' });

    screen.appendChild(stepHeader(1, total, i.researcher.step1));
    screen.appendChild(radioGroup(
      'activity',
      asOptions(i.researcher.activity),
      state.activity,
      (v) => { state.activity = v; syncHash(true); refreshGenerate(screen); }
    ));

    screen.appendChild(stepHeader(2, total, i.researcher.step2, i.researcher.step2Help));
    screen.appendChild(checkboxGroup(
      'tasks',
      asOptions(i.researcher.tasks),
      state.tasks,
      (v) => { state.tasks = v; syncHash(true); refreshGenerate(screen); }
    ));

    screen.appendChild(stepHeader(3, total, i.researcher.step3, i.researcher.step3Help));
    screen.appendChild(textInputRow(
      'tools-input',
      i.researcher.step3Placeholder,
      state.tools,
      (v) => { state.tools = v; syncHash(true); refreshGenerate(screen); }
    ));

    screen.appendChild(stepHeader(4, total, i.researcher.step4));
    screen.appendChild(radioGroup(
      'target',
      asOptions(i.researcher.target),
      state.target,
      (v) => { state.target = v; syncHash(true); refreshGenerate(screen); }
    ));

    const panel = renderRiskPanel(false);
    if (panel) screen.appendChild(panel);
    screen.appendChild(navRow(canGenerateResearcher()));
    return screen;
  }

  function canGenerateResearcher() {
    return !!(state.activity && state.target);
  }

  function textInputRow(id, placeholder, value, oninput, label) {
    const wrap = el('div', { class: 'field-row' });
    if (label) wrap.appendChild(el('label', { for: id, text: label }));
    const input = el('input', {
      type: 'text',
      id: id,
      class: 'text-input',
      placeholder: placeholder || '',
      value: value || '',
    });
    input.addEventListener('input', () => oninput(input.value));
    wrap.appendChild(input);
    return wrap;
  }

  function refreshGenerate(screen) {
    const btn = screen.querySelector('.nav-row .btn-primary');
    if (btn) btn.disabled = !canGenerateNow();
    // Refresh the risk panel so guidance reflects the live selection.
    const oldPanel = screen.querySelector('.risk-panel');
    const navRowEl = screen.querySelector('.nav-row');
    const newPanel = renderRiskPanel(false);
    if (oldPanel) {
      if (newPanel) oldPanel.parentNode.replaceChild(newPanel, oldPanel);
      else oldPanel.parentNode.removeChild(oldPanel);
    } else if (newPanel && navRowEl) {
      navRowEl.parentNode.insertBefore(newPanel, navRowEl);
    }
  }

  // -------- Output rendering --------

  function renderOutput() {
    const i = t();
    const screen = el('section', { class: 'screen' });

    screen.appendChild(el('p', { class: 'review-note', text: i.ui.reviewBeforeCopy }));

    const panel = renderRiskPanel(true);
    if (panel) screen.appendChild(panel);

    const blocks = computeOutputs();
    blocks.forEach((b) => screen.appendChild(makeOutputBlock(b)));

    screen.appendChild(makeSelectionsSummary());

    screen.appendChild(makeShareRow());

    return screen;
  }

  function computeOutputs() {
    const i = t();
    const out = [];
    if (state.role === 'student') {
      out.push({
        key: 'student',
        heading: i.ui.outputHeading,
        text: i.statements.student(state, APP_VERSION, POLICY),
        markdownTitle: i.ui.outputHeading,
        printTarget: true,
      });
    } else if (state.role === 'teacher') {
      out.push({
        key: 'syllabus',
        heading: i.ui.outputHeadingSyllabus,
        text: i.statements.teacherSyllabus(state, APP_VERSION, POLICY),
        markdownTitle: i.ui.outputHeadingSyllabus,
        printTarget: true,
      });
      out.push({
        key: 'disclosure',
        heading: i.ui.outputHeadingTeacherDisclosure,
        text: i.statements.teacherDisclosure(state, APP_VERSION, POLICY),
        markdownTitle: i.ui.outputHeadingTeacherDisclosure,
        printTarget: true,
      });
    } else if (state.role === 'researcher') {
      out.push({
        key: 'researcher-full',
        heading: i.ui.outputHeadingResearcherFull,
        text: i.statements.researcherFull(state, APP_VERSION, POLICY),
        markdownTitle: i.ui.outputHeadingResearcherFull,
        printTarget: true,
      });
      out.push({
        key: 'researcher-inline',
        heading: i.ui.outputHeadingResearcherInline,
        text: i.statements.researcherInline(state, APP_VERSION, POLICY),
        markdownTitle: i.ui.outputHeadingResearcherInline,
        printTarget: true,
      });
    }
    return out;
  }

  function makeOutputBlock(b) {
    const i = t();
    const wrap = el('div', { class: 'output-block' + (b.printTarget ? ' print-target' : '') });
    wrap.appendChild(el('h2', { class: 'output-heading', text: b.heading }));
    const taId = 'output-' + b.key;
    const ta = el('textarea', {
      id: taId,
      readonly: 'readonly',
      'aria-label': b.heading,
    });
    ta.value = b.text;
    autoSize(ta);
    wrap.appendChild(ta);

    const actions = el('div', { class: 'output-actions' });
    actions.appendChild(el('button', {
      type: 'button',
      class: 'btn-secondary',
      text: i.ui.copyPlain,
      'aria-label': i.ui.copyPlain + ' — ' + b.heading,
      onclick: () => copyText(b.text, i.ui.copied),
    }));
    actions.appendChild(el('button', {
      type: 'button',
      class: 'btn-secondary',
      text: i.ui.copyMarkdown,
      'aria-label': i.ui.copyMarkdown + ' — ' + b.heading,
      onclick: () => copyText(toMarkdown(b), i.ui.copied),
    }));
    if (state.role === 'teacher') {
      actions.appendChild(el('button', {
        type: 'button',
        class: 'btn-secondary',
        text: i.ui.printPdf,
        onclick: triggerPrint,
      }));
    }
    wrap.appendChild(actions);
    return wrap;
  }

  function autoSize(ta) {
    requestAnimationFrame(() => {
      ta.style.height = 'auto';
      ta.style.height = (ta.scrollHeight + 4) + 'px';
    });
  }

  function toMarkdown(b) {
    return '## ' + b.heading + '\n\n' + b.text + '\n';
  }

  function makeSelectionsSummary() {
    const i = t();
    const wrap = el('section', { class: 'selections-summary' });
    wrap.appendChild(el('h3', { text: i.ui.yourSelections }));
    const dl = el('dl');
    const rows = [];

    const role = i.roles[state.role];
    rows.push([role, '']);

    if (state.role === 'student') {
      pushRow(rows, i.student.step1, i.student.submission[state.submission]);
      pushRow(rows, i.student.step2, (state.assignment || []).map((k) => i.student.assignment[k]).filter(Boolean).join(', '));
      pushRow(rows, i.student.step3, (state.tasks || []).map((k) => i.student.tasks[k]).join(', '));
      pushRow(rows, i.student.step4, state.tools);
      pushRow(rows, i.student.step5, i.student.modification[state.modification]);
    } else if (state.role === 'teacher') {
      pushRow(rows, i.teacher.step1, i.teacher.level[state.level]);
      pushRow(rows, i.teacher.step2, (state.assignment || []).map((k) => i.teacher.assignment[k]).filter(Boolean).join(', '));
      pushRow(rows, i.teacher.step3, i.teacher.policy[state.policy]);
      const skills = (state.skills || []).map((k) => i.teacher.skills[k]).filter(Boolean);
      if ((state.skillsOther || '').trim()) skills.push(state.skillsOther.trim());
      pushRow(rows, i.teacher.step4, skills.join(', '));
    } else if (state.role === 'researcher') {
      pushRow(rows, i.researcher.step1, i.researcher.activity[state.activity]);
      pushRow(rows, i.researcher.step2, (state.tasks || []).map((k) => i.researcher.tasks[k]).filter(Boolean).join(', '));
      pushRow(rows, i.researcher.step3, state.tools);
      pushRow(rows, i.researcher.step4, i.researcher.target[state.target]);
    }

    rows.forEach(([k, v]) => {
      if (!v) return;
      dl.appendChild(el('dt', { text: k }));
      dl.appendChild(el('dd', { text: v }));
    });
    wrap.appendChild(dl);
    return wrap;
  }

  function pushRow(rows, k, v) {
    if (!v) return;
    rows.push([k, v]);
  }

  function makeShareRow() {
    const i = t();
    const row = el('div', { class: 'nav-row' });
    row.appendChild(el('button', {
      type: 'button',
      class: 'btn-secondary',
      text: i.ui.back,
      onclick: () => {
        state.done = false;
        syncHash(false);
        render();
      },
    }));
    row.appendChild(el('span', { class: 'spacer' }));
    row.appendChild(el('button', {
      type: 'button',
      class: 'btn-secondary',
      text: i.ui.copyLink,
      onclick: copyLink,
    }));
    return row;
  }

  // -------- Copy / share / print --------

  function copyText(text, okMsg) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_e) {}
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        () => toast(okMsg),
        () => { fallback(); toast(okMsg); }
      );
    } else {
      fallback();
      toast(okMsg);
    }
  }

  function copyLink() {
    const i = t();
    syncHash(true);
    let url = location.href;
    if (location.protocol === 'file:') {
      url = location.href;
    }
    copyText(url, i.ui.linkCopied);
  }

  function triggerPrint() {
    document.body.classList.add('printing-output');
    const cleanup = () => {
      document.body.classList.remove('printing-output');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      window.print();
      // Some browsers don't fire afterprint; clean up after a tick.
      setTimeout(cleanup, 1000);
    }, 50);
  }

  // -------- Language toggle --------

  function toggleLanguage() {
    const cur = t();
    const next = cur.altLangCode;
    state.lang = next;
    localStorage.setItem('fmup-ai-lang', next);
    syncHash(true);
    render();
  }

  // -------- Init --------

  function loadPolicy() {
    // Tries to load policy.json from the same origin. Fails silently on
    // file:// without a server — the app still works with no risk panel.
    if (typeof fetch !== 'function') return Promise.resolve(null);
    return fetch('./policy.json', { cache: 'no-cache' })
      .then((resp) => (resp.ok ? resp.json() : null))
      .catch(() => null);
  }

  function applyRestoredState(restored, withToast) {
    if (restored && restored.__invalid) {
      state = freshState();
      if (withToast) toast(t().ui.linkInvalid);
      // Strip the bad fragment so a refresh does not re-trigger the toast.
      if (location.hash) {
        suppressHashListener = true;
        history.replaceState(null, '', location.pathname + location.search);
        setTimeout(() => { suppressHashListener = false; }, 0);
      }
      return;
    }
    if (restored) state = restored;
    else state = freshState();
  }

  function init() {
    // Wire up persistent header buttons.
    document.getElementById('lang-toggle').addEventListener('click', toggleLanguage);
    document.getElementById('start-over-btn').addEventListener('click', backToLanding);
    document.getElementById('brand-link').addEventListener('click', (e) => {
      e.preventDefault();
      backToLanding();
    });

    // Inline policy from a <script>-injected global wins over fetch (lets
    // the page work from file:// when the file has been pre-bundled).
    if (window.POLICY_DATA) POLICY = window.POLICY_DATA;

    // Restore from URL hash if present.
    const restored = decodeState(location.hash);
    if (restored && !restored.__invalid) {
      state = restored;
    } else if (restored && restored.__invalid) {
      // Defer the toast: i18n strings need DOM ready and language detected.
      state.lang = detectLang();
      setTimeout(() => toast(t().ui.linkInvalid), 200);
      // Strip the bad fragment.
      suppressHashListener = true;
      history.replaceState(null, '', location.pathname + location.search);
      setTimeout(() => { suppressHashListener = false; }, 0);
    } else {
      state.lang = detectLang();
    }

    // Listen for back/forward.
    window.addEventListener('hashchange', () => {
      if (suppressHashListener) return;
      const next = decodeState(location.hash);
      applyRestoredState(next, true);
      render();
    });

    // Listen for popstate as a backup (covers history.pushState navigation).
    window.addEventListener('popstate', () => {
      if (suppressHashListener) return;
      const next = decodeState(location.hash);
      applyRestoredState(next, true);
      render();
    });

    // First render happens immediately; if policy fetch succeeds later,
    // re-render so the institutional risk panel appears.
    render();
    if (!POLICY) {
      loadPolicy().then((p) => {
        if (p) {
          POLICY = p;
          render();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
