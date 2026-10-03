/*
 * FMUP AI Usage Statement Generator — main app
 *
 * No build step. No dependencies. No CDN. Runs from file:// for development.
 * All user-facing strings live in i18n/pt.js and i18n/en.js — this file
 * contains no hardcoded UI copy.
 */

(function () {
  'use strict';

  // Derived from _variables.yml by scripts/sync-versions.py.
  // Bump themis.versao there when statement content changes.
  const APP_VERSION = '1.3.1';

  // Schema version for the URL hash payload. Bump when state shape
  // changes incompatibly. Hashes with a different `v` are rejected.
  // v3 adds explicit context, evidence and confirmations. v2 links reopen for review.
  const HASH_V = 3;

  const I18N = { pt: window.I18N_PT, en: window.I18N_EN };
  const DEFAULT_LANG = 'pt';

  // Loaded from policy.json at startup. May remain null if fetch fails
  // (e.g. file:// without a server) — the app still works, with the
  // institutional risk panel disabled.
  let POLICY = null;

  // A malformed or unsupported policy disables guidance instead of silently
  // ignoring predicates and widening the set of matching rules.
  function validatePolicy(p) {
    const scalars = ['role', 'submission', 'modification', 'policy', 'level', 'activity', 'target', 'tools_regex'];
    const arrays = ['policy_any', 'activity_any', 'target_any', 'assignment_any', 'tasks_any', 'riskFlags_any'];
    try {
      if (!p || typeof p.version !== 'string' || !Array.isArray(p.rules) || !p.risk_levels) return false;
      for (const r of p.rules) {
        if (!r || !Number.isInteger(r.risk) || r.risk < 1 || r.risk > 4 || !p.risk_levels[String(r.risk)] || !r.trigger) return false;
        for (const [key, value] of Object.entries(r.trigger)) {
          if (scalars.includes(key)) { if (typeof value !== 'string') return false; }
          else if (arrays.includes(key)) { if (!Array.isArray(value) || !value.length || value.some(v => typeof v !== 'string')) return false; }
          else return false;
        }
        if (r.trigger.tools_regex) new RegExp(r.trigger.tools_regex, 'i');
      }
      return true;
    } catch (_e) { return false; }
  }

  // -------- State --------

  // The full decision path. Encoded into the URL hash on every change.
  let state = freshState();

  function freshState() {
    return {
      lang: detectLang(),
      role: null,
      done: false,
      // shared: GAIDeT âmbito axis (apoio técnico / apoio auxiliar com
      // impacto limitado / contributo substantivo) and the null-use flag
      // that drives the "declaro não ter utilizado" short note.
      scope: null,
      noUse: false,
      // student
      submission: null,
      assignment: [],
      assignmentOther: '',
      tasks: [],
      tasksOther: '',
      tools: '',
      modification: null,
      useDate: '',
      // teacher
      level: null,
      policy: null,
      skills: [],
      skillsOther: '',
      courseType: null,
      // researcher
      activity: null,
      target: null,
      promptsRef: '',
      affectedSections: '',
      verifications: '',
      privacyConfirmed: false,
      reviewConfirmed: false,
      groupConfirmed: false,
      contextReviewed: false,
      riskFlags: [],
      sourceVersions: null,
    };
  }

  function detectLang() {
    let stored = null;
    try { stored = localStorage.getItem('fmup-ai-lang'); } catch (_e) { /* Optional preference. */ }
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
      scope: s.scope,
      noUse: s.noUse,
      submission: s.submission,
      assignment: s.assignment,
      assignmentOther: s.assignmentOther,
      tasks: s.tasks,
      tasksOther: s.tasksOther,
      tools: s.tools,
      modification: s.modification,
      useDate: s.useDate,
      level: s.level,
      policy: s.policy,
      skills: s.skills,
      skillsOther: s.skillsOther,
      courseType: s.courseType,
      activity: s.activity,
      target: s.target,
      promptsRef: s.promptsRef,
      affectedSections: s.affectedSections,
      verifications: s.verifications,
      privacyConfirmed: s.privacyConfirmed,
      reviewConfirmed: s.reviewConfirmed,
      groupConfirmed: s.groupConfirmed,
      contextReviewed: s.contextReviewed,
      riskFlags: s.riskFlags,
      sourceVersions: s.sourceVersions,
      versions: { app: APP_VERSION, policy: POLICY ? POLICY.version : null },
    };
    return b64encode(JSON.stringify(persisted));
  }

  function decodeState(hash) {
    const m = String(hash || '').match(/(?:^#?|[#&])s=([^&]+)/);
    if (!m) return null;
    if (m[1].length > 200000) return { __invalid: true };
    try {
      const obj = JSON.parse(b64decode(m[1]));
      if (!obj || Array.isArray(obj) || ![2, HASH_V].includes(obj.v)) return { __invalid: true };
      const s = freshState();
      const stringKeys = ['assignmentOther', 'tasksOther', 'tools', 'useDate', 'skillsOther', 'promptsRef', 'affectedSections', 'verifications'];
      const boolKeys = ['done', 'noUse', 'privacyConfirmed', 'reviewConfirmed', 'groupConfirmed', 'contextReviewed'];
      const enums = {
        lang: ['pt', 'en'], role: ['student', 'teacher', 'researcher'],
        submission: Object.keys(I18N.pt.student.submission),
        modification: Object.keys(I18N.pt.student.modification),
        scope: Object.keys(I18N.pt.shared.scope),
        level: Object.keys(I18N.pt.teacher.level), courseType: Object.keys(I18N.pt.teacher.courseType),
        policy: Object.keys(I18N.pt.teacher.policy), activity: Object.keys(I18N.pt.researcher.activity),
        target: Object.keys(I18N.pt.researcher.target),
      };
      const arrays = {
        assignment: Object.keys(I18N.pt.student.assignment),
        tasks: Object.keys(obj.role === 'researcher' ? I18N.pt.researcher.tasks : I18N.pt.student.tasks),
        skills: Object.keys(I18N.pt.teacher.skills),
        riskFlags: Object.keys(I18N.pt.shared.riskFlags),
      };
      for (const k of stringKeys) if (k in obj) {
        if (typeof obj[k] !== 'string' || obj[k].length > 4000) return { __invalid: true };
        s[k] = obj[k];
      }
      for (const k of boolKeys) if (k in obj) {
        if (typeof obj[k] !== 'boolean') return { __invalid: true };
        s[k] = obj[k];
      }
      for (const [k, values] of Object.entries(enums)) if (k in obj) {
        if (obj[k] !== null && !values.includes(obj[k])) return { __invalid: true };
        s[k] = obj[k];
      }
      for (const [k, values] of Object.entries(arrays)) if (k in obj) {
        if (!Array.isArray(obj[k]) || obj[k].length > values.length || obj[k].some(v => !values.includes(v))) return { __invalid: true };
        s[k] = [...new Set(obj[k])];
      }
      if (s.useDate && !/^\d{4}-\d{2}-\d{2}$/.test(s.useDate)) return { __invalid: true };
      if (obj.versions && typeof obj.versions.app === 'string' &&
          (obj.versions.policy === null || typeof obj.versions.policy === 'string')) {
        s.sourceVersions = { app: obj.versions.app.slice(0, 40), policy: obj.versions.policy && obj.versions.policy.slice(0, 40) };
      }
      // A link restores choices, never certifies a historical declaration.
      // Force a fresh review, even for a link saved on the output screen.
      s.sourceVersions = s.sourceVersions || { app: 'legacy', policy: null };
      s.done = false;
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

    const proto = document.getElementById('footer-prototype');
    if (proto) proto.textContent = i.ui.footerPrototype || 'Prototype demonstrator';
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
    if (state.sourceVersions) main.appendChild(el('p', { class: 'review-note', text: t().ui.restoredChoices }));
    document.body.classList.remove('printing-output');

    if (!state.role) {
      main.appendChild(renderLanding());
    } else if (state.done) {
      main.appendChild(renderOutput());
    } else {
      main.appendChild(renderForm());
    }

    main.querySelectorAll('.field-group').forEach((group, n) => {
      let previous = group.previousElementSibling;
      while (previous && !previous.querySelector('.step-title')) previous = previous.previousElementSibling;
      const title = previous && previous.querySelector('.step-title');
      if (title) { title.id = title.id || 'question-' + n; group.setAttribute('role', group.querySelector('input[type=radio]') ? 'radiogroup' : 'group'); group.setAttribute('aria-labelledby', title.id); }
    });

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
    if (trigger.policy_any && trigger.policy_any.indexOf(s.policy) === -1) return false;
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
    if (trigger.riskFlags_any && !trigger.riskFlags_any.some(k => (s.riskFlags || []).includes(k))) return false;
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
    if (s.noUse || !POLICY || !POLICY.rules) return { matches: [], maxRisk: 0 };
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

  // The task-key → GAIDeT-macrodomain map lives in policy.json
  // (`policy.gaidet`), because it is institutional taxonomy — data, not
  // behaviour — and because the statement generators in i18n/*.js need the
  // same map and already receive POLICY as an argument. Keys absent from
  // the map contribute no macrodomain — deliberate: an unmapped task is
  // still declared in prose, it just does not claim a taxonomy slot it
  // does not fill. When policy.json is unavailable (file://), declarations
  // simply omit the macrodomain clause, consistent with the risk panel
  // being disabled in that mode. See Anexo H of the Quadro.
  function gaidetDomains(s) {
    const g = POLICY && POLICY.gaidet;
    if (!g || !g.map || !Array.isArray(g.order)) return [];
    const seen = {};
    (s.tasks || []).forEach((k) => {
      const d = g.map[k];
      if (d) seen[d] = true;
    });
    return g.order.filter((d) => seen[d]);
  }

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

  function hasAnyFormSelection() {
    if (state.noUse || state.riskFlags.length || state.contextReviewed) return true;
    if (state.role === 'student') {
      return !!(state.submission || (state.assignment || []).length || (state.tasks || []).length || (state.tools || '').trim() || state.modification || state.scope);
    }
    if (state.role === 'teacher') {
      return !!(state.courseType || (state.assignment || []).length || state.policy || (state.skills || []).length || (state.skillsOther || '').trim());
    }
    if (state.role === 'researcher') {
      return !!(state.activity || (state.tasks || []).length || (state.tools || '').trim() || state.target || state.scope || state.noUse);
    }
    return false;
  }

  function renderRiskPanel(showOnEmpty) {
    const i = t();
    const lang = state.lang || DEFAULT_LANG;
    if (!showOnEmpty && !hasAnyFormSelection()) return null;
    if (!POLICY) {
      if (!showOnEmpty) return null;
      return el('div',
        { class: 'risk-panel risk-na', role: 'note' },
        el('h3', { class: 'risk-heading', text: i.risk.unavailableHeading }),
        el('p', { class: 'risk-body', text: i.risk.unavailableBody })
      );
    }
    if (state.noUse) return el('div', { class: 'risk-panel risk-na', role: 'note' }, el('p', { text: i.shared.noUseRisk }));
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
    if (i.ui.landingPrivacyNote) {
      screen.appendChild(el('p', { class: 'review-note', html: i.ui.landingPrivacyNote }));
    }

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
    const hasDescriptions = options.some((o) => o.description);
    const colsClass = hasDescriptions ? 'cols-1' : ('cols-' + (options.length > 3 ? '2' : options.length));
    const fg = el('div', { class: 'field-group ' + colsClass });
    options.forEach((opt) => {
      const input = el('input', {
        type: 'radio',
        name: name,
        value: opt.value,
        checked: selected === opt.value,
        onchange: () => { if (input.checked) onchange(opt.value); },
      });
      const textWrap = el('span', { class: 'option-text' });
      textWrap.appendChild(el('span', { class: 'option-label', text: opt.label }));
      if (opt.description) {
        textWrap.appendChild(el('span', { class: 'option-description', text: opt.description }));
      }
      const label = el('label', { class: 'option' + (opt.description ? ' option-with-description' : '') }, input, textWrap);
      fg.appendChild(label);
    });
    return fg;
  }

  function checkboxGroup(name, options, selected, onchange) {
    const fg = el('div', { class: 'field-group ' + (options.length > 4 ? 'cols-2' : '') });
    // Derive the new selection from the DOM rather than from the `selected`
    // array captured at render time. The caller replaces state.<field> with
    // a fresh array on every change and the group is not re-rendered, so the
    // captured array goes stale after the first tick — reading it would drop
    // every previously ticked option. The checkboxes are the live truth.
    const readChecked = () => Array.prototype.slice
      .call(fg.querySelectorAll('input[type="checkbox"]'))
      .filter((x) => x.checked)
      .map((x) => x.value);
    options.forEach((opt) => {
      const input = el('input', {
        type: 'checkbox',
        name: name,
        value: opt.value,
        checked: selected.indexOf(opt.value) !== -1,
        onchange: () => onchange(readChecked()),
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
    return Object.keys(map).map((k) => {
      const v = map[k];
      if (v && typeof v === 'object') {
        return { value: k, label: v.label, description: v.description || '' };
      }
      return { value: k, label: v };
    });
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
    row.appendChild(el('p', { class: 'review-note validation-help', hidden: canGenerate, text: i.shared.requiredHelp }));
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
    const lang = state.lang;
    state = freshState();
    state.lang = lang;
    syncHash(false);
    render();
  }

  // ---- Student form ----

  function renderStudentForm() {
    const i = t();
    const total = state.noUse ? 2 : 9;
    const screen = el('section', { class: 'screen' });

    screen.appendChild(stepHeader(1, total, i.student.step1));
    screen.appendChild(radioGroup(
      'submission',
      asOptions(i.student.submission),
      state.submission,
      (v) => { state.submission = v; syncHash(true); render(); }
    ));

    screen.appendChild(stepHeader(2, total, i.student.step2, i.student.step2Help));
    const studentAssignmentOtherWrap = el('div', { id: 'student-assignment-other-wrap', hidden: state.assignment.indexOf('other') === -1 });
    studentAssignmentOtherWrap.appendChild(textInputRow(
      'student-assignment-other-input',
      i.student.assignmentOtherPlaceholder || i.student.assignmentOtherLabel,
      state.assignmentOther || '',
      (v) => { state.assignmentOther = v; syncHash(true); refreshGenerate(screen); },
      i.student.assignmentOtherLabel
    ));
    screen.appendChild(checkboxGroup(
      'assignment',
      asOptions(i.student.assignment),
      state.assignment,
      (v) => {
        state.assignment = v;
        studentAssignmentOtherWrap.hidden = v.indexOf('other') === -1;
        syncHash(true);
        refreshGenerate(screen);
      }
    ));
    screen.appendChild(studentAssignmentOtherWrap);

    screen.appendChild(noUseControl());
    if (state.noUse) {
      screen.appendChild(renderRiskPanel(true));
      screen.appendChild(navRow(canGenerateStudent()));
      return screen;
    }

    screen.appendChild(stepHeader(3, total, i.student.step3, i.student.step3Help));
    const tasksOtherWrap = el('div', { id: 'tasks-other-wrap', hidden: state.tasks.indexOf('other') === -1 });
    tasksOtherWrap.appendChild(textInputRow(
      'tasks-other-input',
      i.student.tasksOtherLabel,
      state.tasksOther || '',
      (v) => { state.tasksOther = v; syncHash(true); refreshGenerate(screen); },
      i.student.tasksOtherLabel
    ));
    screen.appendChild(checkboxGroup(
      'tasks',
      asOptions(i.student.tasks),
      state.tasks,
      (v) => {
        state.tasks = v;
        tasksOtherWrap.hidden = v.indexOf('other') === -1;
        syncHash(true);
        refreshGenerate(screen);
      }
    ));
    screen.appendChild(tasksOtherWrap);

    screen.appendChild(stepHeader(4, total, i.student.step4, i.student.step4Help));
    const studentChips = renderToolChips('tools-input');
    if (studentChips) screen.appendChild(studentChips);
    screen.appendChild(textInputRow(
      'tools-input',
      i.student.step4Placeholder,
      state.tools,
      (v) => { state.tools = v; syncHash(true); refreshGenerate(screen); }
    ));

    screen.appendChild(stepHeader(5, total, i.student.step5, i.student.step5Help));
    screen.appendChild(radioGroup(
      'modification',
      asOptions(i.student.modification),
      state.modification,
      (v) => { state.modification = v; syncHash(true); refreshGenerate(screen); }
    ));

    screen.appendChild(stepHeader(6, total, i.shared.stepScope, i.shared.stepScopeHelp));
    screen.appendChild(radioGroup(
      'scope',
      asOptions(i.shared.scope),
      state.scope,
      (v) => { state.scope = v; syncHash(true); refreshGenerate(screen); }
    ));

    screen.appendChild(stepHeader(7, total, i.student.step6UseDate, i.student.step6UseDateHelp));
    screen.appendChild(dateInputRow(
      'use-date-input',
      state.useDate,
      (v) => { state.useDate = v; syncHash(true); refreshGenerate(screen); },
      i.student.step6UseDateLabel
    ));

    screen.appendChild(stepHeader(8, total, i.shared.detailsTitle, i.shared.detailsHelp));
    appendEvidence(screen);
    screen.appendChild(stepHeader(9, total, i.shared.contextTitle, i.shared.contextHelp));
    appendContext(screen);
    const panel = renderRiskPanel(false);
    if (panel) screen.appendChild(panel);
    screen.appendChild(navRow(canGenerateStudent()));
    return screen;
  }

  function canGenerateStudent() {
    return !!(state.submission && state.assignment.length && (!state.assignment.includes('other') || state.assignmentOther.trim()) && (state.noUse || (state.modification && completeUse())));
  }

  // ---- Teacher form ----

  function renderTeacherForm() {
    const i = t();
    const total = 4;
    const screen = el('section', { class: 'screen' });

    screen.appendChild(stepHeader(1, total, i.teacher.step0CourseType, i.teacher.step0CourseTypeHelp));
    screen.appendChild(radioGroup(
      'courseType',
      asOptions(i.teacher.courseType),
      state.courseType,
      (v) => { state.courseType = v; syncHash(true); refreshGenerate(screen); }
    ));

    screen.appendChild(stepHeader(2, total, i.teacher.step2, i.teacher.step2Help));
    const teacherAssignmentOtherWrap = el('div', { id: 'teacher-assignment-other-wrap', hidden: state.assignment.indexOf('other') === -1 });
    teacherAssignmentOtherWrap.appendChild(textInputRow(
      'teacher-assignment-other-input',
      i.teacher.assignmentOtherPlaceholder || i.teacher.assignmentOtherLabel,
      state.assignmentOther || '',
      (v) => { state.assignmentOther = v; syncHash(true); refreshGenerate(screen); },
      i.teacher.assignmentOtherLabel
    ));
    screen.appendChild(checkboxGroup(
      'assignment',
      asOptions(i.teacher.assignment),
      state.assignment,
      (v) => {
        state.assignment = v;
        teacherAssignmentOtherWrap.hidden = v.indexOf('other') === -1;
        syncHash(true);
        refreshGenerate(screen);
      }
    ));
    screen.appendChild(teacherAssignmentOtherWrap);

    screen.appendChild(stepHeader(3, total, i.teacher.step3, i.teacher.step3Help));
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
    return !!(state.courseType && state.assignment.length && state.policy && (!state.assignment.includes('other') || state.assignmentOther.trim()));
  }

  // ---- Researcher form ----

  function renderResearcherForm() {
    const i = t();
    const total = state.noUse ? 2 : 8;
    const screen = el('section', { class: 'screen' });

    screen.appendChild(stepHeader(1, total, i.researcher.step1));
    screen.appendChild(radioGroup(
      'activity',
      asOptions(i.researcher.activity),
      state.activity,
      (v) => { state.activity = v; syncHash(true); refreshGenerate(screen); }
    ));

    // Null declaration. The U.Porto regime requires a short normalised note
    // in every final work, including when no GenAI was used at all — so the
    // tool has to be able to state the absence of use, not only its extent.
    // Ticking this collapses the remaining steps: there is nothing to
    // describe, only a target to address the note to.
    screen.appendChild(noUseControl());

    if (!state.noUse) {
      screen.appendChild(stepHeader(2, total, i.researcher.step2, i.researcher.step2Help));
      screen.appendChild(checkboxGroup(
        'tasks',
        asOptions(i.researcher.tasks),
        state.tasks,
        (v) => { state.tasks = v; syncHash(true); refreshGenerate(screen); }
      ));

      screen.appendChild(textInputRow('tasks-other-input', i.student.tasksOtherLabel, state.tasksOther,
        v => { state.tasksOther = v; syncHash(true); refreshGenerate(screen); }, i.student.tasksOtherLabel));
      screen.appendChild(stepHeader(3, total, i.researcher.step3, i.researcher.step3Help));
      const researcherChips = renderToolChips('tools-input');
      if (researcherChips) screen.appendChild(researcherChips);
      screen.appendChild(textInputRow(
        'tools-input',
        i.researcher.step3Placeholder,
        state.tools,
        (v) => { state.tools = v; syncHash(true); refreshGenerate(screen); }
      ));

      screen.appendChild(stepHeader(4, total, i.shared.stepScope, i.shared.stepScopeHelp));
      screen.appendChild(radioGroup(
        'scope',
        asOptions(i.shared.scope),
        state.scope,
        (v) => { state.scope = v; syncHash(true); refreshGenerate(screen); }
      ));
    }

    const targetStep = state.noUse ? 2 : 5;
    screen.appendChild(stepHeader(targetStep, total, i.researcher.step4));
    screen.appendChild(radioGroup(
      'target',
      asOptions(i.researcher.target),
      state.target,
      (v) => { state.target = v; syncHash(true); refreshGenerate(screen); }
    ));

    if (!state.noUse) {


      screen.appendChild(stepHeader(6, total, i.researcher.step5UseDate, i.researcher.step5UseDateHelp));
      screen.appendChild(dateInputRow(
        'use-date-input',
        state.useDate,
        (v) => { state.useDate = v; syncHash(true); refreshGenerate(screen); },
        i.researcher.step5UseDateLabel
      ));
    }

    if (!state.noUse) {
      screen.appendChild(stepHeader(7, total, i.shared.detailsTitle, i.shared.detailsHelp));
      appendEvidence(screen);
      screen.appendChild(stepHeader(8, total, i.shared.contextTitle, i.shared.contextHelp));
      appendContext(screen);
    }
    const panel = renderRiskPanel(false);
    if (panel) screen.appendChild(panel);
    screen.appendChild(navRow(canGenerateResearcher()));
    return screen;
  }

  function canGenerateResearcher() {
    return !!(state.activity && state.target && (state.noUse || completeUse()));
  }

  function completeUse() {
    return !!(state.tasks.length && state.tools.trim() && state.scope && state.contextReviewed &&
      (!state.tasks.includes('other') || state.tasksOther.trim()) &&
      (state.scope !== 'substantive' || (state.useDate && state.affectedSections.trim() && state.verifications.trim() && state.promptsRef.trim())));
  }

  function noUseControl() {
    const i = t();
    return singleCheckbox('no-use', i.shared.noUseLabel, i.shared.noUseHelp, state.noUse, v => {
      state.noUse = v;
      if (v) {
        for (const k of ['tasks', 'riskFlags']) state[k] = [];
        for (const k of ['tools', 'tasksOther', 'promptsRef', 'affectedSections', 'verifications', 'useDate']) state[k] = '';
        for (const k of ['privacyConfirmed', 'reviewConfirmed', 'groupConfirmed', 'contextReviewed']) state[k] = false;
        state.scope = null;
        state.modification = null;
      }
      syncHash(true);
      render();
    });
  }

  function appendEvidence(screen) {
    const i = t();
    for (const key of ['affectedSections', 'verifications', 'promptsRef']) {
      screen.appendChild(textInputRow(key + '-input', i.shared[key], state[key], v => {
        state[key] = v; syncHash(true); refreshGenerate(screen);
      }, i.shared[key]));
    }
  }

  function appendContext(screen) {
    const i = t();
    screen.appendChild(checkboxGroup('riskFlags', asOptions(i.shared.riskFlags), state.riskFlags, v => {
      state.riskFlags = v;
      if (v.includes('sensitive_public')) state.privacyConfirmed = false;
      syncHash(true);
      const privacy = screen.querySelector('#privacyConfirmed');
      if (privacy) { privacy.checked = state.privacyConfirmed; privacy.disabled = v.includes('sensitive_public'); }
      refreshGenerate(screen);
    }));
    for (const key of ['contextReviewed', 'reviewConfirmed', 'privacyConfirmed', 'groupConfirmed']) {
      if (key === 'groupConfirmed' && !(state.role === 'student' && state.submission === 'group')) continue;
      screen.appendChild(singleCheckbox(key, i.shared[key], '', state[key], v => {
        state[key] = v; syncHash(true); refreshGenerate(screen);
      }));
    }
    const privacy = screen.querySelector('#privacyConfirmed');
    if (privacy) privacy.disabled = state.riskFlags.includes('sensitive_public');
  }

  function singleCheckbox(id, label, help, checked, onchange) {
    const wrap = el('div', { class: 'field-group cols-1 single-checkbox' });
    const input = el('input', {
      type: 'checkbox',
      id: id,
      name: id,
      checked: !!checked,
      onchange: () => onchange(input.checked),
    });
    const textWrap = el('span', { class: 'option-text' });
    textWrap.appendChild(el('span', { class: 'option-label', text: label }));
    if (help) textWrap.appendChild(el('span', { class: 'option-description', text: help }));
    wrap.appendChild(el('label', { class: 'option option-with-description' }, input, textWrap));
    return wrap;
  }

  function textInputRow(id, placeholder, value, oninput, label) {
    const wrap = el('div', { class: 'field-row' });
    if (label) wrap.appendChild(el('label', { for: id, text: label }));
    const input = el('input', {
      type: 'text',
      id: id,
      class: 'text-input',
      placeholder: placeholder || '',
      'aria-label': label || placeholder || t().student.step4,
      maxlength: '4000',
      value: value || '',
    });
    input.addEventListener('input', () => oninput(input.value));
    wrap.appendChild(input);
    return wrap;
  }

  function dateInputRow(id, value, oninput, label) {
    const wrap = el('div', { class: 'field-row' });
    if (label) wrap.appendChild(el('label', { for: id, text: label }));
    const input = el('input', {
      type: 'date',
      id: id,
      class: 'text-input date-input',
      value: value || '',
    });
    input.addEventListener('input', () => oninput(input.value));
    wrap.appendChild(input);
    return wrap;
  }

  function renderToolChips(toolsInputId) {
    if (!POLICY || !Array.isArray(POLICY.recommended_tools) || !POLICY.recommended_tools.length) {
      return null;
    }
    const i = t();
    const isPt = state.lang === 'pt';
    const tierLabels = {
      institutional: i.ui.toolsTierInstitutional,
      enterprise_optout: i.ui.toolsTierEnterprise,
      specialised: i.ui.toolsTierSpecialised,
      consumer_warning: i.ui.toolsTierConsumerWarning,
    };
    const tierBlurbs = {
      institutional: isPt
        ? 'Acesso institucional. Confirme as condições de utilização e a adequação aos dados tratados.'
        : 'Institutional access. Check the terms of use and suitability for the data processed.',
      enterprise_optout: isPt
        ? 'Verifique o contrato, a configuração da conta e a autorização institucional. A designação comercial não garante adequação a dados sensíveis.'
        : 'Check the contract, account settings and institutional authorisation. A commercial name does not establish suitability for sensitive data.',
      specialised: isPt
        ? 'Ferramentas com função específica (tradução, revisão, leitura assistida). Confirme política de dados antes de usar.'
        : 'Tools with a specific function (translation, language polishing, assisted reading). Confirm data policy before use.',
      consumer_warning: isPt
        ? 'Contas de consumo. Verifique retenção e utilização para treino; não introduza informação sensível nestes serviços públicos.'
        : 'Consumer accounts. Check retention and training use; do not enter sensitive information in these public services.',
    };
    const wrap = el('div', { class: 'tool-chips-wrap' });
    if (i.ui.toolsSuggestedHeader) {
      wrap.appendChild(el('p', { class: 'tool-chips-header', text: i.ui.toolsSuggestedHeader }));
    }
    if (i.ui.toolsSuggestedHelp) {
      wrap.appendChild(el('p', { class: 'tool-chips-help', text: i.ui.toolsSuggestedHelp }));
    }

    function chipIsAdded(toolName) {
      const cur = (document.getElementById(toolsInputId) || { value: state.tools }).value || '';
      return cur.indexOf(toolName) !== -1;
    }

    const tiers = ['institutional', 'enterprise_optout', 'specialised', 'consumer_warning'];
    tiers.forEach((tier) => {
      const tools = POLICY.recommended_tools.filter((tool) => tool.tier === tier);
      if (!tools.length) return;
      const tierKey = tier.replace(/_/g, '-');
      const tierBlock = el('div', { class: 'tool-chips-tier tool-chips-tier-' + tierKey });
      if (tierLabels[tier]) {
        tierBlock.appendChild(el('h5', { class: 'tool-chips-tier-label', text: tierLabels[tier] }));
      }
      if (tierBlurbs[tier]) {
        tierBlock.appendChild(el('p', { class: 'tool-chips-tier-blurb', text: tierBlurbs[tier] }));
      }
      const row = el('div', { class: 'tool-chips' });
      tools.forEach((tool) => {
        const privacy = isPt ? tool.privacy_pt : tool.privacy_en;
        const added = chipIsAdded(tool.name);
        const chipClasses = ['tool-chip', 'tool-chip-' + tierKey];
        if (added) chipClasses.push('tool-chip-added');
        const chip = el('button', {
          type: 'button',
          class: chipClasses.join(' '),
          'aria-label': tool.name + ' — ' + privacy,
          'aria-pressed': added ? 'true' : 'false',
        });
        chip.appendChild(el('span', { class: 'tool-chip-name', text: tool.name }));
        chip.appendChild(el('span', { class: 'tool-chip-meta', text: privacy }));
        chip.addEventListener('click', () => {
          const input = document.getElementById(toolsInputId);
          if (!input) return;
          const current = input.value.trim();
          if (current.indexOf(tool.name) !== -1) {
            return;
          }
          const next = current ? (current.replace(/[;,]\s*$/, '') + '; ' + tool.name) : tool.name;
          input.value = next;
          state.tools = next;
          syncHash(true);
          refreshGenerate(wrap.closest('.screen'));
          chip.classList.add('tool-chip-added');
          chip.setAttribute('aria-pressed', 'true');
        });
        row.appendChild(chip);
      });
      tierBlock.appendChild(row);
      wrap.appendChild(tierBlock);
    });
    return wrap;
  }

  function refreshGenerate(screen) {
    const btn = screen.querySelector('.nav-row .btn-primary');
    if (btn) btn.disabled = !canGenerateNow();
    const help = screen.querySelector('.validation-help');
    if (help) help.hidden = canGenerateNow();
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

    if (state.role === 'student' && i.ui.studentUCPolicyReminder) {
      screen.appendChild(el('p', { class: 'review-note', html: i.ui.studentUCPolicyReminder }));
    }
    if (state.role === 'teacher' && i.ui.teacherAdaptReminder) {
      screen.appendChild(el('p', { class: 'review-note', html: i.ui.teacherAdaptReminder }));
    }

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
      out.push({ key: 'student-note', heading: i.ui.outputHeadingShortNote,
        text: i.statements.shortNote(state, APP_VERSION, POLICY), printTarget: true });
      if (state.noUse) return out;
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
      // Level 1 of the U.Porto two-tier regime: the short normalised note,
      // required in every final work — including when nothing was used.
      out.push({
        key: 'researcher-note',
        heading: i.ui.outputHeadingShortNote,
        text: i.statements.shortNote(state, APP_VERSION, POLICY),
        markdownTitle: i.ui.outputHeadingShortNote,
        printTarget: true,
      });
      // Level 2 is only meaningful when there is a use to describe.
      if (!state.noUse) {
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
      pushRow(rows, i.student.step2, (state.assignment || []).map((k) => k === 'other' ? state.assignmentOther || i.student.assignment[k] : i.student.assignment[k]).filter(Boolean).join(', '));
      pushRow(rows, i.student.step3, (state.tasks || []).map((k) => {
        if (k === 'other' && (state.tasksOther || '').trim()) return state.tasksOther.trim();
        return i.student.tasks[k];
      }).filter(Boolean).join(', '));
      pushRow(rows, i.student.step4, state.tools);
      pushRow(rows, i.student.step5, (i.student.modification[state.modification] || {}).label || '');
      pushRow(rows, i.shared.stepScope, (i.shared.scope[state.scope] || {}).label || '');
      pushRow(rows, i.shared.gaidetLabel, gaidetDomains(state).map((d) => i.shared.gaidet[d]).filter(Boolean).join(', '));
    } else if (state.role === 'teacher') {
      pushRow(rows, i.teacher.step0CourseType, i.teacher.courseType[state.courseType]);
      pushRow(rows, i.teacher.step2, (state.assignment || []).map((k) => i.teacher.assignment[k]).filter(Boolean).join(', '));
      pushRow(rows, i.teacher.step3, (i.teacher.policy[state.policy] || {}).label || '');
      const skills = (state.skills || []).map((k) => i.teacher.skills[k]).filter(Boolean);
      if ((state.skillsOther || '').trim()) skills.push(state.skillsOther.trim());
      pushRow(rows, i.teacher.step4, skills.join(', '));
    } else if (state.role === 'researcher') {
      pushRow(rows, i.researcher.step1, i.researcher.activity[state.activity]);
      if (state.noUse) {
        pushRow(rows, i.shared.noUseLabel, i.shared.noUseSummary);
      } else {
        pushRow(rows, i.researcher.step2, (state.tasks || []).map((k) => i.researcher.tasks[k]).filter(Boolean).join(', '));
        pushRow(rows, i.researcher.step3, state.tools);
        pushRow(rows, i.shared.stepScope, (i.shared.scope[state.scope] || {}).label || '');
        pushRow(rows, i.shared.gaidetLabel, gaidetDomains(state).map((d) => i.shared.gaidet[d]).filter(Boolean).join(', '));
      }
      pushRow(rows, i.researcher.step4, i.researcher.target[state.target]);
    }

    if (!state.noUse && state.role !== 'teacher') {
      for (const k of ['affectedSections', 'verifications', 'promptsRef']) pushRow(rows, i.shared[k], state[k]);
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
      let copied = false;
      try { copied = document.execCommand('copy'); } catch (_e) {}
      document.body.removeChild(ta);
      return copied;
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        () => toast(okMsg),
        () => toast(fallback() ? okMsg : t().ui.copyFailed)
      );
    } else {
      toast(fallback() ? okMsg : t().ui.copyFailed);
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
    try { localStorage.setItem('fmup-ai-lang', next); } catch (_e) { /* Continue in memory. */ }
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
    if (validatePolicy(window.POLICY_DATA)) POLICY = window.POLICY_DATA;

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
        if (validatePolicy(p)) {
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
