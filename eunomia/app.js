/*
 * Eunomia (FMUP IA): the front end.
 *
 * No build step, no dependencies, no CDN. All the text of the interface is in i18n-pt.js
 * (window.EUNOMIA_PT); the interview (steps, fields, help, "porque" boxes) is data in
 * interview.json. This file has no UI copy and stays ASCII only.
 *
 * Hash routes (see ROUTES): #/entrar, #/inicio, #/rascunho/:id, #/rascunho/:id/passo/:passo,
 * #/rascunho/:id/plano, #/rascunho/:id/seccao/:sec, #/rascunho/:id/referencias,
 * #/rascunho/:id/previsao, #/definicoes, #/codigos (admin).
 *
 * Not in this version (they come with the submission and review of Task 11): the submit dialog,
 * the review pages (#/revisao, #/revisao/:id) and the refine mode. Each is one more line in ROUTES
 * and one more page function; an unknown route goes to #/inicio, so no button points to them yet.
 *
 * Errors: a 401 with motivo "auth" is a wrong own IAedu key (the session is fine). Any other 401
 * ends the session. A 409 on a write with motivo "rev" (another window saved the draft) offers
 * "Recarregar"; other 409s (bloqueado, plano, passo, incompleto, invalido) show the message only.
 * Model calls show a busy state.
 */
(function () {
  'use strict';

  var S = window.EUNOMIA_PT;
  var API = window.EUNOMIA_API;

  // The sections the model writes, in the ficha order (server: drafts.MODEL_SECTIONS).
  var MODEL_SECTIONS = ['objectivo', 'formato', 'prompt_base', 'papeis', 'correccao', 'armadilhas', 'plano_b'];
  var AI_ONLY_SECTIONS = ['prompt_base', 'plano_b'];
  var EDITABLE = ['rascunho', 'devolvida'];
  var LONG_TEXT_COUNTER = 5000; // a texto_longo field with a larger max shows a counter and is cut on save

  // The fields of each section for the editor. Labels come from S.seccao.campos.
  var SECTION_FORMS = {
    objectivo: { fields: [{ id: 'texto', kind: 'long', req: true }, { id: 'competencia_protegida', kind: 'long', req: true }] },
    formato: {
      fields: [
        { id: 'introducao', kind: 'long' },
        { id: 'blocos', kind: 'list', itemLabel: 'bloco', addLabel: 'adicionarBloco',
          item: [{ id: 'minutos', kind: 'number', req: true }, { id: 'minutos_max', kind: 'number' }, { id: 'texto', kind: 'long', req: true }] },
        { id: 'texto', label: 'textoFinal', kind: 'long' },
      ],
    },
    prompt_base: { fields: [{ id: 'texto', kind: 'long', mono: true, req: true }, { id: 'variantes', kind: 'long' }] },
    papeis: { fields: [{ id: 'estudante', kind: 'long', req: true }, { id: 'docente', kind: 'long', req: true }] },
    correccao: { fields: [{ id: 'texto', kind: 'long', req: true }] },
    armadilhas: {
      list: { id: 'armadilhas', kind: 'list', itemLabel: 'armadilha', addLabel: 'adicionarArmadilha',
        item: [{ id: 'lead', kind: 'short', req: true }, { id: 'texto', kind: 'long', req: true }] },
    },
    plano_b: { fields: [{ id: 'texto', kind: 'long' }, { id: 'sem_plano_b_motivo', kind: 'short' }] },
  };

  var main = document.getElementById('main');
  var statusLine = document.getElementById('estado-pedido');

  var state = {
    user: null,
    interview: null,
    refs: [],
    flash: null,
    token: 0,
  };

  // ---------------------------------------------------------------- DOM helpers

  function el(tag, props) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === undefined || v === null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'value') node.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'required') node[k] = !!v;
        else node.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }

  function append(node, child) {
    if (child === undefined || child === null || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (c) { append(node, c); });
      return;
    }
    node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function on(node, type, fn) {
    node.addEventListener(type, fn);
    return node;
  }

  function button(text, props, fn) {
    var b = el('button', Object.assign({ type: 'button', class: 'btn-secondary' }, props || {}), text);
    if (fn) on(b, 'click', fn);
    return b;
  }

  function link(text, href, props) {
    return el('a', Object.assign({ href: href }, props || {}), text);
  }

  function externalLink(text, href) {
    return el('a', { href: href, target: '_blank', rel: 'noopener' }, text, el('span', { class: 'visually-hidden', text: ' ' + S.comum.novaJanela }));
  }

  var uid = 0;
  function nextId(prefix) {
    uid += 1;
    return prefix + '-' + uid;
  }

  function focusTitle() {
    var heading = main.querySelector('h2');
    if (!heading) return;
    heading.setAttribute('tabindex', '-1');
    heading.focus();
  }

  // The status line (role status). A message hides after a few seconds, unless it is persistent
  // (the wait for the model).
  var announceTimer = null;
  function announce(text, persistent) {
    clearTimeout(announceTimer);
    statusLine.textContent = text || '';
    statusLine.classList.toggle('is-visible', !!text);
    if (text && !persistent) announceTimer = setTimeout(function () { announce(''); }, 6000);
  }

  // A small, safe Markdown subset for the texts of the ficha: paragraphs, lists, **bold**, *italic*,
  // `code`, [text](https://...) and <https://...>. Built with DOM nodes, never with innerHTML.
  // Every repeated group has an upper bound and link labels stop at a bracket: an unbounded group
  // on a long text without its closing marker is quadratic (300 KB of "[a" froze the page).
  var INLINE = /(\*\*[^*]{1,500}\*\*)|(\*[^*\s][^*]{0,500}\*)|(`[^`]{1,1000}`)|(\[[^[\]\n]{1,500}\]\((https?:\/\/[^()[\]\s]{1,2000})\))|(<(https?:\/\/[^<>\s]{1,2000})>)/g;

  function inline(text, opts) {
    var out = [];
    var s = String(text === undefined || text === null ? '' : text).replace(/\\@/g, '@');
    var last = 0;
    var m;
    INLINE.lastIndex = 0;
    while ((m = INLINE.exec(s)) !== null) {
      if (m.index > last) out.push(s.slice(last, m.index));
      if (m[1]) out.push(el('strong', { text: m[1].slice(2, -2) }));
      else if (m[2]) out.push(el('em', { text: m[2].slice(1, -1) }));
      else if (m[3]) out.push(el('code', { text: m[3].slice(1, -1) }));
      else if (m[4]) {
        var label = m[4].slice(1, m[4].indexOf(']('));
        out.push(opts && opts.noLinks ? label : externalLink(label, m[5]));
      } else if (m[6]) out.push(opts && opts.noLinks ? m[7] : externalLink(m[7], m[7]));
      last = INLINE.lastIndex;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
  }

  function markdown(text) {
    var frag = document.createDocumentFragment();
    String(text === undefined || text === null ? '' : text).split(/\n\s*\n/).forEach(function (block) {
      var lines = block.split('\n').filter(function (l) { return l.trim() !== ''; });
      if (lines.length === 0) return;
      var bullets = lines.every(function (l) { return /^\s*[-*]\s+/.test(l); });
      var numbered = lines.every(function (l) { return /^\s*\d+\.\s+/.test(l); });
      if (bullets || numbered) {
        var list = el(bullets ? 'ul' : 'ol');
        lines.forEach(function (l) { list.appendChild(el('li', null, inline(l.replace(/^\s*([-*]|\d+\.)\s+/, '')))); });
        frag.appendChild(list);
      } else {
        frag.appendChild(el('p', null, inline(lines.join(' '))));
      }
    });
    return frag;
  }

  // ---------------------------------------------------------------- errors and busy state

  function errorSlot() {
    return el('div', { class: 'eu-erro-slot' });
  }

  function sessionEnded() {
    setUser(null);
    state.flash = S.erros.sessaoTerminou;
    redirect('#/entrar');
  }

  // Shows err in slot. opts.write: the request was a write (a 409 with motivo rev offers Recarregar).
  // opts.login: a 401 is a wrong access code, not the end of a session.
  function report(slot, err, opts) {
    opts = opts || {};
    if (!(err instanceof API.ApiError)) {
      setTimeout(function () { throw err; }, 0); // a bug: keep it visible in the console
      err = new API.ApiError(-1, null);
    }
    if (err.status === 401 && err.motivo !== 'auth' && !opts.login) {
      sessionEnded();
      return;
    }
    clear(slot);
    var text;
    if (err.status === 401 && err.motivo === 'auth') text = S.erros.chaveInvalida;
    else if (err.status === 0) text = S.erros.rede;
    else text = err.erro || S.erros.desconhecido;
    var box = el('div', { class: 'eu-erro', role: 'alert', tabindex: '-1' }, el('p', { class: 'eu-erro-texto', text: text }));
    if (err.erros.length) box.appendChild(el('ul', null, err.erros.map(function (e) { return el('li', { text: e }); })));
    if (err.status === 401 && err.motivo === 'auth') box.appendChild(el('p', null, link(S.erros.verDefinicoes, '#/definicoes')));
    if (err.status === 409 && opts.write && err.motivo === 'rev') {
      box.appendChild(el('p', { text: S.erros.conflito }));
      box.appendChild(button(S.comum.recarregar, { id: 'recarregar', class: 'btn-primary' }, function () { route(); }));
    }
    slot.appendChild(box);
    box.focus();
  }

  function clearSlot(slot) {
    clear(slot);
  }

  // Runs fn with btn disabled and marked busy. opts.model: a model call (it can take seconds).
  function busy(btn, fn, opts) {
    opts = opts || {};
    if (btn.disabled) return Promise.resolve();
    var label = btn.textContent;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = opts.label || (opts.model ? S.comum.aPedir : S.comum.aGuardar);
    if (opts.model) announce(S.comum.esperaModelo, true);
    var restore = function () {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.textContent = label;
      if (opts.model) announce('');
    };
    return Promise.resolve()
      .then(fn)
      .then(function (v) { restore(); return v; }, function (e) { restore(); throw e; });
  }

  // ---------------------------------------------------------------- router

  var ID = '([0-9a-f]{12})';
  var ROUTES = [
    { re: /^#\/entrar$/, page: 'entrar', title: function () { return S.entrar.pagina; }, render: pageLogin, public: true },
    { re: /^#\/inicio$/, page: 'inicio', title: function () { return S.inicio.pagina; }, render: pageHome },
    { re: new RegExp('^#/rascunho/' + ID + '$'), page: 'rascunho', title: function () { return S.comum.aCarregar; }, render: pageResume },
    { re: new RegExp('^#/rascunho/' + ID + '/passo/([a-z_]+)$'), page: 'passo', title: function () { return S.rascunho.entrevista; }, render: pageStep },
    { re: new RegExp('^#/rascunho/' + ID + '/plano$'), page: 'plano', title: function () { return S.plano.pagina; }, render: pagePlan },
    { re: new RegExp('^#/rascunho/' + ID + '/seccao/([a-z_]+)$'), page: 'seccao', title: function () { return S.seccao.pagina; }, render: pageSection },
    { re: new RegExp('^#/rascunho/' + ID + '/referencias$'), page: 'referencias', title: function () { return S.referencias.pagina; }, render: pageReferences },
    { re: new RegExp('^#/rascunho/' + ID + '/previsao$'), page: 'previsao', title: function () { return S.previsao.pagina; }, render: pagePreview },
    { re: /^#\/definicoes$/, page: 'definicoes', title: function () { return S.definicoes.pagina; }, render: pageSettings },
    { re: /^#\/codigos$/, page: 'codigos', title: function () { return S.codigos.pagina; }, render: pageCodes, admin: true },
  ];

  function redirect(hash) {
    window.history.replaceState(null, '', hash);
    route();
  }

  function go(hash) {
    if (window.location.hash === hash) route();
    else window.location.hash = hash;
  }

  function route() {
    var hash = window.location.hash || '';
    var found = null;
    var args = [];
    for (var i = 0; i < ROUTES.length; i++) {
      var m = ROUTES[i].re.exec(hash);
      if (m) {
        found = ROUTES[i];
        args = m.slice(1);
        break;
      }
    }
    if (!found) return redirect(state.user ? '#/inicio' : '#/entrar');
    if (!found.public && !state.user) return redirect('#/entrar');
    if (found.public && state.user) return redirect('#/inicio');
    if (found.admin && state.user.perfil !== 'admin') return redirect('#/inicio');

    state.token += 1;
    var token = state.token;
    var ctx = { alive: function () { return token === state.token; } };
    clear(main);
    main.dataset.pagina = 'a-carregar';
    main.setAttribute('aria-busy', 'true');
    announce('');
    document.title = S.app.tituloPagina(found.title());

    var finish = function () {
      if (!ctx.alive()) return;
      main.removeAttribute('aria-busy');
      main.dataset.pagina = found.page;
      // An error box that took the focus keeps it: the message matters more than the heading.
      var active = document.activeElement;
      if (active && main.contains(active) && active.classList.contains('eu-erro')) return;
      if (main.querySelector('h2')) focusTitle();
      else main.focus();
    };
    Promise.resolve()
      .then(function () { return found.render.apply(null, [ctx].concat(args)); })
      .then(finish, function (err) {
        if (!ctx.alive()) return;
        var slot = errorSlot();
        main.appendChild(slot);
        report(slot, err);
        finish();
      });
  }

  // ---------------------------------------------------------------- the shell

  function setStaticText() {
    var text = function (id, value) {
      var node = document.getElementById(id);
      if (node) node.textContent = value;
    };
    text('skip-link', S.app.saltar);
    text('back-link-quadro', S.app.voltarQuadro);
    text('back-link-home', S.app.voltarInicio);
    text('brand-short', S.app.nome);
    text('brand-full', S.app.nomeCompleto);
    text('app-title', S.app.titulo);
    text('app-subtitle', S.app.subtitulo);
    text('footer-name', S.app.rodape);
    text('footer-link-quadro', S.app.quadro);
    text('footer-link-themis', S.app.themis);
    text('logout-btn', S.app.terminarSessao);
    var nav = document.getElementById('back-bar');
    if (nav) nav.setAttribute('aria-label', S.app.navSitio);
    var skip = document.getElementById('skip-link');
    if (skip) {
      on(skip, 'click', function (e) {
        e.preventDefault(); // the hash holds the route
        main.focus();
      });
    }
    on(document.getElementById('logout-btn'), 'click', logout);
  }

  // The user of the session. The API client uses it to pick the own key remembered for this user.
  function setUser(user) {
    state.user = user || null;
    API.setUser(user ? user.id : null);
    var name = document.getElementById('user-name');
    var out = document.getElementById('logout-btn');
    name.textContent = user ? S.app.sessaoDe(user.nome) : '';
    name.hidden = !user;
    out.hidden = !user;
  }

  function logout() {
    var btn = document.getElementById('logout-btn');
    busy(btn, function () {
      return API.request('POST', '/logout').catch(function () { return null; });
    }, { label: S.app.terminarSessao }).then(function () {
      setUser(null);
      go('#/entrar');
    });
  }

  // ---------------------------------------------------------------- interview helpers

  function steps() {
    return state.interview.passos;
  }

  function stepById(id) {
    return steps().filter(function (p) { return p.id === id; })[0] || null;
  }

  function applies(step, respostas) {
    var c = step.condicao;
    if (!c) return true;
    var answer = respostas[c.passo];
    return !!answer && typeof answer === 'object' && answer[c.campo] === c.igual;
  }

  function applicableSteps(respostas) {
    return steps().filter(function (p) { return applies(p, respostas); });
  }

  function applicableSections(respostas) {
    var papel = respostas.papel_ia && respostas.papel_ia.papel;
    var ai = papel !== undefined && papel !== 'nenhum';
    return MODEL_SECTIONS.filter(function (id) { return ai || AI_ONLY_SECTIONS.indexOf(id) === -1; });
  }

  function stepHref(id, stepId) {
    return stepId === 'plano' ? '#/rascunho/' + id + '/plano' : '#/rascunho/' + id + '/passo/' + stepId;
  }

  function sectionHref(id, sec) {
    return '#/rascunho/' + id + '/seccao/' + sec;
  }

  function loadDraft(id) {
    return API.request('GET', '/rascunhos/' + id);
  }

  function isEditable(d) {
    return EDITABLE.indexOf(d.estado) !== -1;
  }

  // The page frame of a draft: the list of its stages and the content area.
  // where = { step } | { plano: true } | { sec } | { refs: true } | { previsao: true }
  function draftLayout(view, where) {
    var d = view.rascunho;
    var base = '#/rascunho/' + d.id;
    var current = function (isIt, a) {
      if (isIt) a.setAttribute('aria-current', 'page');
      return a;
    };
    var items = [];
    var interview = applicableSteps(d.respostas).filter(function (p) { return p.id !== 'plano'; });
    var stepList = el('ol', { class: 'eu-etapas-lista' }, interview.map(function (p) {
      var done = d.respostas[p.id] !== undefined;
      return el('li', { class: done ? 'is-feito' : null },
        current(where.step === p.id, link([p.titulo, done ? el('span', { class: 'visually-hidden', text: ' ' + S.rascunho.respondido }) : null], stepHref(d.id, p.id))));
    }));
    items.push(el('li', null, el('span', { class: 'eu-etapas-grupo', text: S.rascunho.entrevista }), stepList));
    items.push(el('li', null, current(where.plano, link(S.rascunho.plano, base + '/plano'))));
    if (d.plano_aprovado) {
      var secs = el('ol', { class: 'eu-etapas-lista' }, applicableSections(d.respostas).map(function (sec) {
        var s = d.seccoes[sec] || { estado: 'vazia' };
        return el('li', { class: s.estado === 'aceite' ? 'is-feito' : null },
          current(where.sec === sec, link([S.seccao.titulos[sec], ' ', el('span', { class: 'eu-etapa-estado', text: '(' + (S.seccao.estadoCurto[s.estado] || s.estado) + ')' })], sectionHref(d.id, sec))));
      }));
      items.push(el('li', null, el('span', { class: 'eu-etapas-grupo', text: S.rascunho.seccoes }), secs));
    }
    items.push(el('li', null, current(where.refs, link(S.rascunho.referencias, base + '/referencias'))));
    items.push(el('li', null, current(where.previsao, link(S.rascunho.previsao, base + '/previsao'))));

    var nav = el('nav', { class: 'eu-etapas', 'aria-label': S.rascunho.nav },
      el('p', { class: 'eu-etapas-voltar' }, link(S.rascunho.inicio, '#/inicio')),
      el('ol', { class: 'eu-etapas-raiz' }, items));
    var content = el('div', { class: 'eu-conteudo' });
    if (!isEditable(d)) content.appendChild(el('p', { class: 'review-note', text: S.rascunho.bloqueado }));
    var wrap = el('div', { class: 'eu-rascunho screen' }, nav, content);
    main.appendChild(wrap);
    return content;
  }

  function porqueBox(step, respostas) {
    var titleId = nextId('porque');
    var box = el('aside', { class: 'eu-porque', 'aria-labelledby': titleId },
      el('h3', { id: titleId, text: S.passo.porqueTitulo }),
      el('p', { text: step.porque }),
      step.ligacao ? el('p', null, externalLink(step.ligacao.rotulo, step.ligacao.url)) : null);
    var area = respostas.contexto && respostas.contexto.area;
    var perfil = step.porque_area && area && step.porque_area[area];
    if (!perfil) return box;
    var perfilId = nextId('perfil');
    return [box, el('aside', { class: 'eu-porque eu-perfil', 'aria-labelledby': perfilId },
      el('h3', { id: perfilId, text: S.passo.perfilTitulo(perfil.perfil) }),
      el('p', { text: perfil.texto }),
      el('p', { class: 'eu-nota', text: S.passo.perfilNota }))];
  }

  // ---------------------------------------------------------------- interview fields

  function requiredNow(campo, values) {
    if (campo.obrigatorio) return true;
    var c = campo.obrigatorio_se;
    if (!c) return false;
    var other = values[c.campo];
    if (c.igual !== undefined) return other === c.igual;
    if (c.contem !== undefined) return Array.isArray(other) && other.indexOf(c.contem) !== -1;
    return false;
  }

  function labelText(campo) {
    var need = campo.obrigatorio || campo.obrigatorio_se;
    return [campo.rotulo, ' ', el('span', { class: 'eu-req', text: need ? S.comum.obrigatorio : S.comum.opcional })];
  }

  // One field of the interview. Returns { campo, row, get() }.
  function makeField(campo, value, choices) {
    var id = 'campo-' + campo.id;
    var help = campo.ajuda ? el('p', { class: 'eu-ajuda', id: 'ajuda-' + campo.id, text: campo.ajuda }) : null;
    var describedBy = help ? 'ajuda-' + campo.id : null;
    var row;
    var get;

    if (campo.tipo === 'escolha' || campo.tipo === 'escolha_multipla') {
      var multi = campo.tipo === 'escolha_multipla';
      var options = choices || campo.opcoes || [];
      var selected = multi ? (Array.isArray(value) ? value : []) : value;
      var group = el('div', { class: 'field-group' }, options.map(function (o) {
        return el('label', { class: 'option' },
          el('input', { type: multi ? 'checkbox' : 'radio', name: campo.id, value: o.id,
            checked: multi ? selected.indexOf(o.id) !== -1 : selected === o.id }),
          el('span', { class: 'option-label', text: o.rotulo }));
      }));
      row = el('fieldset', { class: 'field-row eu-fieldset', id: id, 'aria-describedby': describedBy },
        el('legend', null, labelText(campo)), help, group);
      get = function () {
        var picked = Array.prototype.filter.call(row.querySelectorAll('input[name="' + campo.id + '"]'), function (i) { return i.checked; })
          .map(function (i) { return i.value; });
        return multi ? picked : picked[0];
      };
      return { campo: campo, row: row, get: get };
    }

    var input;
    if (campo.tipo === 'texto_longo') {
      input = el('textarea', { id: id, 'aria-describedby': describedBy, rows: campo.max > 1500 ? 10 : 5 });
      if (campo.max && campo.max <= LONG_TEXT_COUNTER) input.setAttribute('maxlength', campo.max);
    } else if (campo.tipo === 'numero') {
      input = el('input', { id: id, class: 'text-input eu-numero', type: 'number', inputmode: 'numeric', step: '1',
        min: campo.min, max: campo.max, 'aria-describedby': describedBy });
    } else {
      input = el('input', { id: id, class: 'text-input', type: 'text', maxlength: campo.max, 'aria-describedby': describedBy });
    }
    if (value !== undefined && value !== null) input.value = String(value);
    var counter = null;
    if (campo.tipo === 'texto_longo' && campo.max > LONG_TEXT_COUNTER) {
      counter = el('p', { class: 'eu-contador', id: 'contador-' + campo.id, 'aria-live': 'polite' });
      var update = function () { counter.textContent = S.comum.caracteres(input.value.length, campo.max); };
      on(input, 'input', update);
      update();
      input.setAttribute('aria-describedby', [describedBy, counter.id].filter(Boolean).join(' '));
    }
    row = el('div', { class: 'field-row' }, el('label', { for: id }, labelText(campo)), help, input, counter);
    get = function () {
      var v = input.value;
      if (campo.tipo === 'numero') {
        v = v.trim();
        if (v === '') return undefined;
        return /^-?\d+$/.test(v) ? Number(v) : v;
      }
      return v.trim() === '' ? undefined : v;
    };
    return { campo: campo, row: row, get: get, input: input };
  }

  // The answers of a set of fields. Hidden conditional fields are left out.
  function collect(fields) {
    var values = {};
    fields.forEach(function (f) {
      if (f.row.hidden) return;
      var v = f.get();
      if (v !== undefined && !(Array.isArray(v) && v.length === 0)) values[f.campo.id] = v;
      else if (Array.isArray(v) && f.campo.tipo === 'escolha_multipla') values[f.campo.id] = v;
    });
    return values;
  }

  // Shows a field with obrigatorio_se only when its condition holds.
  function bindConditions(form, fields) {
    var update = function () {
      var values = {};
      fields.forEach(function (f) { values[f.campo.id] = f.get(); });
      fields.forEach(function (f) {
        if (f.campo.obrigatorio_se) f.row.hidden = !requiredNow(f.campo, values);
      });
    };
    on(form, 'change', update);
    on(form, 'input', update);
    update();
  }

  // ---------------------------------------------------------------- pages: login and home

  function pageLogin() {
    var flash = state.flash;
    state.flash = null;
    var slot = errorSlot();
    var input = el('input', { id: 'codigo', class: 'text-input', type: 'password', autocomplete: 'current-password',
      autocapitalize: 'characters', spellcheck: 'false', 'aria-describedby': 'codigo-ajuda' });
    var submit = el('button', { type: 'submit', class: 'btn-primary', text: S.entrar.botao });
    var form = el('form', { id: 'login-form', class: 'eu-cartao', novalidate: true },
      el('div', { class: 'field-row' },
        el('label', { for: 'codigo', text: S.entrar.codigo }),
        el('p', { class: 'eu-ajuda', id: 'codigo-ajuda', text: S.entrar.codigoAjuda }),
        input),
      slot,
      el('div', { class: 'nav-row' }, submit));
    on(form, 'submit', function (e) {
      e.preventDefault();
      clearSlot(slot);
      var codigo = input.value.trim();
      if (codigo === '') {
        report(slot, new API.ApiError(400, { erro: S.entrar.semCodigo }), { login: true });
        return;
      }
      busy(submit, function () { return API.request('POST', '/login', { codigo: codigo }); }, { label: S.entrar.aEntrar })
        .then(function (user) {
          input.value = '';
          setUser(user);
          go('#/inicio');
        })
        .catch(function (err) { report(slot, err, { login: true }); });
    });

    var notice = el('section', { id: 'aviso-dados', class: 'eu-aviso-dados-login', 'aria-labelledby': 'aviso-dados-titulo' },
      el('h3', { id: 'aviso-dados-titulo', text: S.entrar.avisoTitulo }),
      el('h4', { text: S.entrar.avisoIaeduTitulo }), el('p', { text: S.entrar.avisoIaedu }),
      el('h4', { text: S.entrar.avisoServidorTitulo }), el('p', { text: S.entrar.avisoServidor }),
      el('h4', { text: S.entrar.avisoPrazoTitulo }), el('p', { text: S.entrar.avisoPrazo }));

    main.appendChild(el('div', { class: 'screen eu-estreito' },
      el('h2', { class: 'step-title', text: S.entrar.titulo }),
      flash ? el('p', { class: 'review-note', text: flash }) : null,
      el('p', { class: 'step-help', text: S.entrar.intro }),
      form,
      notice));
    if (flash) announce(flash);
  }

  function pageHome(ctx) {
    var user = state.user;
    var slot = errorSlot();
    var list = el('div', { id: 'lista-rascunhos', 'aria-live': 'polite' }, el('p', { text: S.comum.aCarregar }));
    var newBtn = button(S.inicio.novo, { id: 'novo-rascunho', class: 'btn-primary' }, function () {
      clearSlot(slot);
      busy(newBtn, function () { return API.request('POST', '/rascunhos', { modo: 'criar' }); }, { label: S.inicio.aCriar })
        .then(function (view) { go(stepHref(view.rascunho.id, steps()[0].id)); })
        .catch(function (err) { report(slot, err); });
    });
    var tools = el('ul', { class: 'eu-ligacoes' },
      el('li', null, link(S.inicio.definicoes, '#/definicoes')),
      user.perfil === 'admin' ? el('li', null, link(S.inicio.codigos, '#/codigos')) : null);
    main.appendChild(el('div', { class: 'screen' },
      el('h2', { class: 'step-title', text: S.inicio.ola(user.nome) }),
      el('p', { class: 'step-help', text: S.inicio.intro }),
      el('p', { id: 'modo-chave', class: 'eu-nota' },
        API.ownKey() ? S.inicio.modoProprio : S.inicio.modoPartilhado, ' ', link(S.inicio.mudarModo, '#/definicoes')),
      el('div', { class: 'nav-row' }, newBtn),
      slot,
      el('section', { class: 'eu-seccao', 'aria-labelledby': 'meus-titulo' }, el('h3', { id: 'meus-titulo', text: S.inicio.meus }), list),
      el('section', { class: 'eu-seccao', 'aria-labelledby': 'ferramentas-titulo' }, el('h3', { id: 'ferramentas-titulo', text: S.inicio.ferramentas }), tools)));

    return API.request('GET', '/rascunhos').then(function (data) {
      if (!ctx.alive()) return;
      clear(list);
      var rows = (data && data.rascunhos) || [];
      if (rows.length === 0) {
        list.appendChild(el('p', { text: S.inicio.nenhum }));
        return;
      }
      list.appendChild(el('ul', { class: 'eu-rascunhos' }, rows.map(function (r) {
        var titulo = r.titulo || S.comum.semTitulo;
        var next = r.proximo_passo;
        var nextText = next === null ? S.inicio.prontoSeccoes
          : S.inicio.proximo(next === 'plano' ? S.rascunho.plano : ((stepById(next) || {}).titulo || next));
        return el('li', null,
          el('p', { class: 'eu-rascunho-titulo' }, link(titulo, '#/rascunho/' + r.id, { 'aria-label': S.inicio.continuar(titulo) })),
          el('p', { class: 'eu-rascunho-meta' },
            el('span', { class: 'eu-etiqueta', text: S.estados[r.estado] || r.estado }), ' ',
            S.inicio.actualizado(S.comum.data(r.actualizado)), '. ', nextText, '.'));
      })));
    }, function (err) {
      if (!ctx.alive()) return;
      clear(list);
      report(slot, err);
    });
  }

  // #/rascunho/:id goes to the place where the teacher stopped.
  function pageResume(ctx, id) {
    return loadDraft(id).then(function (view) {
      if (!ctx.alive()) return;
      var d = view.rascunho;
      var next = view.proximo_passo;
      if (next) return redirect(stepHref(id, next));
      var open = applicableSections(d.respostas).filter(function (s) { return !(d.seccoes[s] && d.seccoes[s].estado === 'aceite'); });
      redirect(open.length ? sectionHref(id, open[0]) : '#/rascunho/' + id + '/previsao');
    });
  }

  // ---------------------------------------------------------------- page: interview step

  function pageStep(ctx, id, stepId) {
    if (stepId === 'plano') return redirect('#/rascunho/' + id + '/plano');
    var step = stepById(stepId);
    var extra = stepId === 'padrao'
      ? Promise.all([API.request('GET', '/padroes?rascunho=' + id), API.request('GET', '/padroes')])
      : Promise.resolve(null);
    return Promise.all([loadDraft(id), extra]).then(function (r) {
      if (!ctx.alive()) return;
      var view = r[0];
      var d = view.rascunho;
      if (!step || !applies(step, d.respostas)) return redirect('#/rascunho/' + id);
      drawStep(ctx, view, step, r[1]);
    });
  }

  function drawStep(ctx, view, step, patterns) {
    var d = view.rascunho;
    var content = draftLayout(view, { step: step.id });
    var list = applicableSteps(d.respostas);
    var index = list.map(function (p) { return p.id; }).indexOf(step.id);
    var answer = d.respostas[step.id] || {};
    var slot = errorSlot();
    var after = el('div', { class: 'eu-depois', 'aria-live': 'polite' });

    var progressId = nextId('progresso');
    content.appendChild(el('div', { class: 'eu-progresso' },
      el('p', { class: 'step-progress', id: progressId, text: S.passo.progresso(index + 1, list.length) }),
      el('progress', { max: list.length, value: index + 1, 'aria-label': S.passo.progressoRotulo, 'aria-describedby': progressId })));
    content.appendChild(el('h2', { class: 'step-title', text: step.titulo }));
    append(content, porqueBox(step, d.respostas));
    if (step.id === 'materiais') content.appendChild(el('p', { class: 'eu-aviso-dados', role: 'note', text: S.passo.materiaisAviso }));

    var fields = [];
    var form = el('form', { id: 'passo-form', novalidate: true });
    step.campos.forEach(function (campo) {
      if (campo.opcoes === 'catalogo') {
        var picker = patternPicker(d, campo, answer[campo.id], patterns, slot);
        fields.push(picker.field);
        form.appendChild(picker.node);
        return;
      }
      var f = makeField(campo, answer[campo.id]);
      fields.push(f);
      form.appendChild(f.row);
      if (step.id === 'objectivo' && campo.id === 'texto') form.appendChild(outcomeHelper(d, f.input, slot));
    });
    bindConditions(form, fields);

    var save = el('button', { type: 'submit', id: 'guardar-passo', class: 'btn-primary', text: S.passo.guardar });
    var prev = index > 0 ? link(S.passo.anterior, stepHref(d.id, list[index - 1].id), { class: 'btn-ghost' }) : null;
    form.appendChild(slot);
    form.appendChild(el('div', { class: 'nav-row' }, prev, el('span', { class: 'spacer' }), save));
    content.appendChild(form);
    content.appendChild(after);

    on(form, 'submit', function (e) {
      e.preventDefault();
      clearSlot(slot);
      clear(after);
      var valor = collect(fields);
      var avisos = [];
      fields.forEach(function (f) {
        var max = f.campo.max;
        if (f.campo.tipo === 'texto_longo' && max > LONG_TEXT_COUNTER && typeof valor[f.campo.id] === 'string' && valor[f.campo.id].length > max) {
          valor[f.campo.id] = valor[f.campo.id].slice(0, max);
          f.input.value = valor[f.campo.id];
          avisos.push(S.passo.materiaisCortado(max));
        }
      });
      busy(save, function () {
        return API.request('PUT', '/rascunhos/' + d.id + '/respostas/' + step.id, { rev: d.rev, valor: valor });
      }).then(function (next) {
        if (!ctx.alive()) return;
        d = next.rascunho;
        view = next;
        avisos = avisos.concat(next.avisos || []);
        var nextHref = followingStep(d, step.id);
        if (avisos.length === 0) return go(nextHref);
        after.appendChild(el('div', { class: 'review-note' },
          el('p', { text: S.passo.avisosTitulo }),
          el('ul', null, avisos.map(function (a) { return el('li', { text: a }); })),
          el('p', null, link(S.passo.continuar, nextHref, { class: 'btn-primary', id: 'continuar-passo' }))));
        after.querySelector('a').focus();
      }).catch(function (err) { report(slot, err, { write: true }); });
    });
  }

  function followingStep(d, stepId) {
    var list = applicableSteps(d.respostas);
    var ids = list.map(function (p) { return p.id; });
    var i = ids.indexOf(stepId);
    var next = list[i + 1] ? list[i + 1].id : 'plano';
    return stepHref(d.id, next);
  }

  // The outcome step: the model proposes sharper versions; the teacher picks one or keeps theirs.
  function outcomeHelper(d, textarea, slot) {
    var results = el('div', { class: 'eu-sugestoes', 'aria-live': 'polite' });
    var btn = button(S.passo.sugerir, { id: 'sugerir-objectivo', 'aria-describedby': 'sugerir-ajuda' }, function () {
      clearSlot(slot);
      clear(results);
      busy(btn, function () {
        return API.request('POST', '/rascunhos/' + d.id + '/objectivo/sugerir', { texto: textarea.value });
      }, { model: true }).then(function (data) {
        var list = (data && data.sugestoes) || [];
        if (list.length === 0) {
          results.appendChild(el('p', { text: S.passo.semSugestoes }));
          return;
        }
        results.appendChild(el('h3', { class: 'eu-subtitulo', text: S.passo.sugestoesTitulo }));
        list.forEach(function (s) {
          results.appendChild(el('div', { class: 'eu-sugestao' },
            el('p', { class: 'eu-sugestao-texto', text: s.texto }),
            el('p', { class: 'eu-nota', text: s.ok ? S.passo.verboOk(s.verbo) : S.passo.verboFalta }),
            modelAvisos(s.avisos),
            button(S.passo.usar, { class: 'btn-ghost' }, function () {
              textarea.value = s.texto;
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
              announce(S.passo.usada);
              textarea.focus();
            })));
        });
        announce(S.comum.respostaModelo);
      }).catch(function (err) { report(slot, err); });
    });
    return el('div', { class: 'eu-ajuda-modelo' },
      el('p', { class: 'eu-ajuda', id: 'sugerir-ajuda', text: S.passo.sugerirAjuda }),
      btn, results);
  }

  // The pattern step: the proposed patterns first, then (on request) the rest of the catalogue.
  function patternPicker(d, campo, value, patterns, slot) {
    var proposed = (patterns && patterns[0] && patterns[0].padroes) || [];
    var nota = patterns && patterns[0] && patterns[0].nota;
    var all = (patterns && patterns[1] && patterns[1].padroes) || [];
    var proposedIds = proposed.map(function (p) { return p.id; });
    var others = all.filter(function (p) { return proposedIds.indexOf(p.id) === -1; });

    var card = function (p, cls) {
      return el('div', { class: cls, 'data-padrao': p.id },
        el('label', { class: 'option option-with-description' },
          el('input', { type: 'radio', name: campo.id, value: p.id, checked: value === p.id }),
          el('span', { class: 'option-text' },
            el('span', { class: 'option-label' }, p.nome, p.estado === 'rascunho' ? el('span', { class: 'eu-nota', text: ' ' + S.passo.rascunhoPadrao }) : null),
            el('span', { class: 'option-description', text: p.mecanismo }))),
        // A pattern proposed with a relaxed filter (duration or setting): say so, with the reason.
        p.ajuste === 'parcial' ? el('p', { class: 'eu-ajuste' }, el('strong', { text: S.passo.ajusteParcial }), ' ', p.ajuste_motivo || '') : null,
        el('dl', { class: 'eu-padrao-detalhe' },
          el('dt', { text: S.passo.quandoServe }), el('dd', { text: p.quando_serve || '' }),
          el('dt', { text: S.passo.quandoNaoServe }), el('dd', { text: p.quando_nao_serve || '' }),
          el('dt', { text: S.passo.duracao }), el('dd', { text: S.passo.duracaoValor(p.duracao_tipica) }),
          el('dt', { text: S.passo.formatoGrupo }), el('dd', { text: p.formato_grupo || '' })),
        p.ficha_exemplo ? el('p', { class: 'eu-nota' }, externalLink(S.passo.exemplo + ': ' + p.nome, p.ficha_exemplo)) : null);
    };

    var explain = null;
    var proposedBox = el('div', { class: 'field-group' }, proposed.map(function (p) { return card(p, 'eu-padrao'); }));
    if (proposed.length > 0) {
      explain = button(S.passo.explicar, { id: 'explicar-padroes' }, function () {
        clearSlot(slot);
        busy(explain, function () {
          return API.request('POST', '/rascunhos/' + d.id + '/padroes/explicar', {});
        }, { model: true }).then(function (data) {
          ((data && data.padroes) || []).forEach(function (p) {
            // Compare the ids in a loop: an id from the server never becomes part of a selector.
            var c = null;
            Array.prototype.forEach.call(proposedBox.children, function (card) {
              if (card.dataset.padrao === p.id) c = card;
            });
            if (!c) return;
            var old = c.querySelector('.eu-explicacao');
            if (old) old.parentNode.removeChild(old);
            c.appendChild(el('div', { class: 'eu-explicacao' },
              el('p', { class: 'eu-explicacao-titulo', text: S.passo.explicacaoTitulo }),
              el('p', { text: p.explicacao || S.passo.semExplicacao }),
              modelAvisos(p.avisos)));
          });
          announce(S.comum.respostaModelo);
        }).catch(function (err) { report(slot, err); });
      });
    }

    var catalogueId = nextId('catalogo');
    var otherInList = others.some(function (p) { return p.id === value; });
    var catalogue = el('div', { id: catalogueId, class: 'eu-catalogo', hidden: !(otherInList || proposed.length === 0) },
      el('h3', { class: 'eu-subtitulo', text: S.passo.catalogo }),
      el('div', { class: 'field-group' }, others.map(function (p) { return card(p, 'eu-padrao-catalogo'); })));
    var toggle = null;
    if (others.length > 0 && proposed.length > 0) {
      toggle = button(catalogue.hidden ? S.passo.mostrarCatalogo : S.passo.esconderCatalogo,
        { id: 'mostrar-catalogo', class: 'btn-ghost', 'aria-controls': catalogueId, 'aria-expanded': String(!catalogue.hidden) },
        function () {
          catalogue.hidden = !catalogue.hidden;
          toggle.setAttribute('aria-expanded', String(!catalogue.hidden));
          toggle.textContent = catalogue.hidden ? S.passo.mostrarCatalogo : S.passo.esconderCatalogo;
        });
    }

    var row = el('fieldset', { class: 'field-row eu-fieldset', id: 'campo-' + campo.id },
      el('legend', null, labelText(campo)),
      el('p', { class: 'eu-ajuda', text: proposed.length ? S.passo.padroesNota : S.passo.semPadroes }),
      nota ? el('p', { class: 'eu-nota', id: 'padroes-nota', text: nota }) : null,
      proposed.length ? el('h3', { class: 'eu-subtitulo', text: S.passo.padroesPropostos }) : null,
      proposedBox,
      explain ? el('div', { class: 'nav-row' }, explain, toggle) : null,
      catalogue);
    var field = {
      campo: campo,
      row: row,
      get: function () {
        var c = row.querySelector('input[name="' + campo.id + '"]:checked');
        return c ? c.value : undefined;
      },
    };
    return { node: row, field: field };
  }

  // ---------------------------------------------------------------- page: plan

  function pagePlan(ctx, id) {
    return loadDraft(id).then(function (view) {
      if (!ctx.alive()) return;
      drawPlan(ctx, view);
    });
  }

  function drawPlan(ctx, view) {
    var d = view.rascunho;
    var step = stepById('plano');
    var content = draftLayout(view, { plano: true });
    var slot = errorSlot();
    content.appendChild(el('h2', { class: 'step-title', text: S.plano.titulo }));
    append(content, porqueBox(step, d.respostas));

    content.appendChild(el('section', { id: 'plano-resumo', class: 'selections-summary', 'aria-labelledby': 'resumo-titulo' },
      el('h3', { id: 'resumo-titulo', text: S.plano.resumo }),
      el('dl', null, (view.plano || []).map(function (l) { return [el('dt', { text: l.rotulo }), el('dd', { text: l.valor })]; }))));

    content.appendChild(el('section', { class: 'eu-seccao', 'aria-labelledby': 'alterar-titulo' },
      el('h3', { id: 'alterar-titulo', text: S.plano.alterar }),
      el('ul', { class: 'eu-ligacoes' }, applicableSteps(d.respostas).filter(function (p) { return p.id !== 'plano'; }).map(function (p) {
        return el('li', null, link(p.titulo, stepHref(d.id, p.id)));
      }))));

    content.appendChild(el('p', { class: d.plano_aprovado ? 'review-note' : 'eu-nota', text: d.plano_aprovado ? S.plano.aprovado : S.plano.porAprovar }));

    var answer = d.respostas.plano || {};
    var fields = step.campos.map(function (c) { return makeField(c, answer[c.id]); });
    var form = el('form', { id: 'plano-form', novalidate: true }, fields.map(function (f) { return f.row; }));
    var saveOnly = button(d.plano_aprovado ? S.plano.guardar : S.plano.guardarSemAprovar,
      { id: 'guardar-plano', class: d.plano_aprovado ? 'btn-primary' : 'btn-secondary' });
    var approve = d.plano_aprovado ? null : el('button', { type: 'submit', id: 'aprovar-plano', class: 'btn-primary', text: S.plano.aprovar });
    form.appendChild(slot);
    form.appendChild(el('div', { class: 'nav-row' },
      saveOnly, el('span', { class: 'spacer' }), approve,
      d.plano_aprovado ? link(S.plano.irSeccoes, sectionHref(d.id, applicableSections(d.respostas)[0]), { class: 'btn-ghost' }) : null));
    content.appendChild(form);

    var savePlan = function () {
      return API.request('PUT', '/rascunhos/' + d.id + '/respostas/plano', { rev: d.rev, valor: collect(fields) });
    };
    on(saveOnly, 'click', function () {
      clearSlot(slot);
      busy(saveOnly, savePlan).then(function (next) {
        if (!ctx.alive()) return;
        announce(S.comum.guardado);
        clear(main);
        drawPlan(ctx, next);
        focusTitle();
      }).catch(function (err) { report(slot, err, { write: true }); });
    });
    on(form, 'submit', function (e) {
      e.preventDefault();
      if (!approve) return;
      clearSlot(slot);
      busy(approve, function () {
        return savePlan().then(function (saved) {
          d = saved.rascunho;
          return API.request('POST', '/rascunhos/' + d.id + '/plano/aprovar', { rev: d.rev });
        });
      }, { label: S.plano.aAprovar }).then(function (next) {
        if (!ctx.alive()) return;
        go(sectionHref(d.id, applicableSections(next.rascunho.respostas)[0]));
      }).catch(function (err) {
        if (!ctx.alive()) return;
        report(slot, err, { write: true });
      });
    });
  }

  // ---------------------------------------------------------------- page: section editor

  function pageSection(ctx, id, sec) {
    return loadDraft(id).then(function (view) {
      if (!ctx.alive()) return;
      var d = view.rascunho;
      if (MODEL_SECTIONS.indexOf(sec) === -1 || applicableSections(d.respostas).indexOf(sec) === -1) return redirect('#/rascunho/' + id);
      if (!d.plano_aprovado) {
        var content = draftLayout(view, { sec: sec });
        content.appendChild(el('h2', { class: 'step-title', text: S.seccao.titulos[sec] }));
        content.appendChild(el('p', { class: 'review-note' }, S.rascunho.planoPrimeiro, ' ', link(S.rascunho.plano, '#/rascunho/' + id + '/plano')));
        return;
      }
      drawSection(ctx, view, sec);
    });
  }

  function drawSection(ctx, view, sec, focusId) {
    clear(main);
    var d = view.rascunho;
    var s = d.seccoes[sec] || { estado: 'vazia', avisos: [] };
    var hasText = s.dados !== undefined && s.dados !== null;
    var content = draftLayout(view, { sec: sec });
    var slot = errorSlot();
    var order = applicableSections(d.respostas);
    var i = order.indexOf(sec);

    var redraw = function (next, focus) {
      if (!ctx.alive()) return;
      view = next;
      drawSection(ctx, next, sec, focus);
      if (!focus) focusTitle();
    };
    var generate = function (btn, comentario) {
      clearSlot(slot);
      var body = { rev: d.rev };
      if (comentario) body.comentario = comentario;
      busy(btn, function () {
        return API.request('POST', '/rascunhos/' + d.id + '/seccoes/' + sec + '/gerar', body);
      }, { model: true }).then(function (next) {
        announce(S.comum.respostaModelo);
        redraw(next, 'seccao-texto');
      }).catch(function (err) { report(slot, err, { write: true }); });
    };

    content.appendChild(el('h2', { class: 'step-title', text: S.seccao.titulos[sec] }));
    content.appendChild(el('p', { class: 'eu-estado', text: S.seccao.estado[s.estado] || s.estado }));
    if (s.estado === 'a-actualizar') content.appendChild(el('p', { class: 'review-note', text: S.seccao.aActualizar }));

    if (!hasText) {
      content.appendChild(el('p', { text: S.seccao.vazia }));
      content.appendChild(slot);
      var gen = button(S.seccao.gerar, { id: 'gerar', class: 'btn-primary' }, function () { generate(gen); });
      content.appendChild(el('div', { class: 'nav-row' }, gen));
    } else {
      content.appendChild(el('p', { class: 'eu-nota', text: s.origem === 'docente' ? S.seccao.origemDocente : S.seccao.origemModelo(s.modelo) }));
      content.appendChild(el('section', { id: 'seccao-texto', class: 'output-block eu-texto', tabindex: '-1', 'aria-label': S.seccao.titulos[sec] }, sectionView(sec, s.dados)));
      content.appendChild(avisosBox(s.avisos || []));
      content.appendChild(slot);

      var commentPanel = el('div', { id: 'painel-versao', class: 'eu-painel', hidden: true });
      var editPanel = el('div', { id: 'painel-editar', class: 'eu-painel', hidden: true });
      var accept = s.estado === 'aceite' ? null : button(S.seccao.aceitar, { id: 'aceitar', class: 'btn-primary' }, function () {
        clearSlot(slot);
        busy(accept, function () {
          return API.request('POST', '/rascunhos/' + d.id + '/seccoes/' + sec + '/aceitar', { rev: d.rev });
        }).then(function (next) {
          announce(S.seccao.aceite);
          redraw(next);
        }).catch(function (err) { report(slot, err, { write: true }); });
      });
      var toggle = function (btn, panel, other, otherBtn) {
        return function () {
          var open = panel.hidden;
          panel.hidden = !open;
          btn.setAttribute('aria-expanded', String(open));
          if (open) {
            other.hidden = true;
            otherBtn.setAttribute('aria-expanded', 'false');
            var first = panel.querySelector('textarea, input');
            if (first) first.focus();
          }
        };
      };
      var newVersion = button(S.seccao.novaVersao, { id: 'nova-versao', 'aria-controls': 'painel-versao', 'aria-expanded': 'false' });
      var edit = button(S.seccao.editar, { id: 'editar', 'aria-controls': 'painel-editar', 'aria-expanded': 'false' });
      on(newVersion, 'click', toggle(newVersion, commentPanel, editPanel, edit));
      on(edit, 'click', toggle(edit, editPanel, commentPanel, newVersion));
      content.appendChild(el('div', { class: 'nav-row' }, accept, s.estado === 'aceite' ? el('p', { class: 'eu-nota', text: S.seccao.aceite }) : null, newVersion, edit));

      var comment = el('textarea', { id: 'comentario', rows: 3, maxlength: 2000, 'aria-describedby': 'comentario-ajuda' });
      var ask = button(S.seccao.pedirVersao, { id: 'pedir-versao', class: 'btn-primary' }, function () { generate(ask, comment.value.trim()); });
      append(commentPanel, [
        el('div', { class: 'field-row' },
          el('label', { for: 'comentario', text: S.seccao.comentario }),
          el('p', { class: 'eu-ajuda', id: 'comentario-ajuda', text: S.seccao.comentarioAjuda }),
          comment),
        el('div', { class: 'nav-row' }, ask),
      ]);
      editPanel.appendChild(sectionEditor(ctx, d, sec, s.dados, slot, redraw));
      content.appendChild(commentPanel);
      content.appendChild(editPanel);
    }

    var prev = i > 0 ? link(S.seccao.anterior(S.seccao.titulos[order[i - 1]]), sectionHref(d.id, order[i - 1]), { class: 'btn-ghost' }) : null;
    var next = i < order.length - 1
      ? link(S.seccao.seguinte(S.seccao.titulos[order[i + 1]]), sectionHref(d.id, order[i + 1]), { class: 'btn-ghost' })
      : link(S.seccao.irReferencias, '#/rascunho/' + d.id + '/referencias', { class: 'btn-ghost' });
    content.appendChild(el('div', { class: 'nav-row eu-navegacao' }, prev, el('span', { class: 'spacer' }), next));

    if (focusId) {
      var target = document.getElementById(focusId);
      if (target) target.focus();
    }
    main.removeAttribute('aria-busy');
    main.dataset.pagina = 'seccao';
  }

  function avisosBox(avisos) {
    var box = el('section', { class: 'eu-avisos', 'aria-labelledby': 'avisos-titulo' },
      el('h3', { id: 'avisos-titulo', text: S.seccao.avisosTitulo + (avisos.length ? ' (' + avisos.length + ')' : '') }));
    var inner = el('div', { id: 'seccao-avisos' });
    if (avisos.length === 0) {
      inner.appendChild(el('p', { text: S.seccao.semAvisos }));
    } else {
      inner.appendChild(el('ul', null, avisos.map(function (a) {
        return el('li', null,
          el('span', { class: 'eu-etiqueta', text: S.seccao.regras[a.regra] || a.regra }), ' ', a.texto,
          a.trecho ? el('span', { class: 'eu-trecho', text: ' ' + S.seccao.trecho(a.trecho) }) : null);
      })));
      inner.appendChild(el('p', { class: 'eu-nota', text: S.seccao.avisosNota }));
    }
    box.appendChild(inner);
    return box;
  }

  // The lint avisos of a model text that does not go into the ficha (a suggestion, an explanation).
  function modelAvisos(avisos) {
    if (!Array.isArray(avisos) || avisos.length === 0) return null;
    return el('div', { class: 'eu-avisos-modelo' },
      el('p', { class: 'eu-nota', text: S.passo.avisosModelo }),
      el('ul', null, avisos.map(function (a) {
        return el('li', null,
          el('span', { class: 'eu-etiqueta', text: S.seccao.regras[a.regra] || a.regra }), ' ', a.texto,
          a.trecho ? el('span', { class: 'eu-trecho', text: ' ' + S.seccao.trecho(a.trecho) }) : null);
      })));
  }

  // The read view of the data of one section.
  function sectionView(sec, dados) {
    var C = S.seccao.campos;
    var frag = document.createDocumentFragment();
    var str = function (v) { return typeof v === 'string' ? v : (v === undefined || v === null ? '' : String(v)); };
    var obj = dados && typeof dados === 'object' ? dados : {};
    var heading = function (t) { return el('h4', { class: 'eu-subtitulo', text: t }); };
    switch (sec) {
      case 'objectivo':
        frag.appendChild(markdown(str(obj.texto)));
        if (obj.competencia_protegida) frag.appendChild(heading(C.competencia_protegida));
        frag.appendChild(markdown(str(obj.competencia_protegida)));
        break;
      case 'formato':
        frag.appendChild(markdown(str(obj.introducao)));
        if (Array.isArray(obj.blocos)) {
          frag.appendChild(el('ul', null, obj.blocos.map(function (b) {
            b = b || {};
            return el('li', null, el('strong', { text: S.seccao.blocoMinutos(b.minutos, b.minutos_max) }), ' ', inline(str(b.texto)));
          })));
        }
        frag.appendChild(markdown(str(obj.texto)));
        break;
      case 'prompt_base':
        frag.appendChild(el('pre', { class: 'eu-prompt', text: str(obj.texto) }));
        if (obj.variantes) {
          frag.appendChild(heading(C.variantes));
          frag.appendChild(markdown(str(obj.variantes)));
        }
        break;
      case 'papeis':
        frag.appendChild(heading(C.estudante));
        frag.appendChild(markdown(str(obj.estudante)));
        frag.appendChild(heading(C.docente));
        frag.appendChild(markdown(str(obj.docente)));
        break;
      case 'armadilhas':
        frag.appendChild(el('ol', null, (Array.isArray(dados) ? dados : []).map(function (a) {
          a = a || {};
          return el('li', null, el('strong', { text: str(a.lead) }), ' ', inline(str(a.texto)));
        })));
        break;
      case 'plano_b':
        if (obj.sem_plano_b_motivo) frag.appendChild(el('p', { text: S.seccao.semPlanoB(str(obj.sem_plano_b_motivo)) }));
        frag.appendChild(markdown(str(obj.texto)));
        break;
      default:
        frag.appendChild(markdown(str(obj.texto)));
    }
    return frag;
  }

  // The structured editor of one section. Labels from S.seccao.campos.
  function sectionEditor(ctx, d, sec, dados, slot, redraw) {
    var C = S.seccao.campos;
    var spec = SECTION_FORMS[sec];
    var form = el('form', { id: 'editar-form', novalidate: true });
    var prefix = 'ed-' + sec;
    var getters = [];

    var textControl = function (f, id, value) {
      var input = f.kind === 'long'
        ? el('textarea', { id: id, rows: f.mono ? 10 : 5, class: f.mono ? 'eu-mono' : null })
        : el('input', { id: id, type: f.kind === 'number' ? 'number' : 'text', class: 'text-input' + (f.kind === 'number' ? ' eu-numero' : ''),
          min: f.kind === 'number' ? '1' : null, step: f.kind === 'number' ? '1' : null, inputmode: f.kind === 'number' ? 'numeric' : null });
      if (value !== undefined && value !== null) input.value = String(value);
      return input;
    };
    var readControl = function (f, input) {
      var v = input.value.trim();
      if (v === '') return undefined;
      if (f.kind === 'number') return /^\d+$/.test(v) ? Number(v) : v;
      return v;
    };
    var fieldRow = function (f, id, value, labelText) {
      var input = textControl(f, id, value);
      var row = el('div', { class: 'field-row' },
        el('label', { for: id }, labelText, ' ', el('span', { class: 'eu-req', text: f.req ? S.comum.obrigatorio : S.comum.opcional })),
        input);
      return { row: row, get: function () { return readControl(f, input); } };
    };

    // A list of items (time blocks, traps): fieldsets with Remover, and one Adicionar button.
    var listEditor = function (f, items) {
      var box = el('div', { class: 'eu-lista' });
      var current = (Array.isArray(items) ? items : []).map(function (x) { return x || {}; });
      var itemGetters = [];
      var draw = function () {
        clear(box);
        itemGetters = [];
        current.forEach(function (item, n) {
          var label = C[f.itemLabel](n + 1);
          var rows = f.item.map(function (sub) {
            return fieldRow(sub, prefix + '-' + f.id + '-' + n + '-' + sub.id, item[sub.id], C[sub.id] || sub.id);
          });
          itemGetters.push(function () {
            var out = {};
            f.item.forEach(function (sub, k) {
              var v = rows[k].get();
              if (v !== undefined) out[sub.id] = v;
            });
            return out;
          });
          box.appendChild(el('fieldset', { class: 'eu-item' },
            el('legend', { text: label }),
            rows.map(function (r) { return r.row; }),
            button(S.seccao.remover, { class: 'btn-ghost eu-remover', 'aria-label': S.seccao.removerItem(label) }, function () {
              current = read();
              current.splice(n, 1);
              draw();
              var add = box.parentNode && box.parentNode.querySelector('.eu-adicionar');
              if (add) add.focus();
            })));
        });
      };
      var read = function () { return itemGetters.map(function (g) { return g(); }); };
      draw();
      var add = button(C[f.addLabel], { class: 'btn-ghost eu-adicionar' }, function () {
        current = read();
        current.push({});
        draw();
        var inputs = box.querySelectorAll('.eu-item:last-child input, .eu-item:last-child textarea');
        if (inputs[0]) inputs[0].focus();
      });
      return {
        node: el('div', { class: 'field-row' }, el('span', { class: 'eu-lista-titulo', text: C[f.id] }), box, el('div', null, add)),
        get: function () {
          return read().filter(function (o) { return Object.keys(o).length > 0; });
        },
      };
    };

    var collectData;
    if (spec.list) {
      var only = listEditor(spec.list, dados);
      form.appendChild(only.node);
      collectData = only.get;
    } else {
      var obj = dados && typeof dados === 'object' ? dados : {};
      spec.fields.forEach(function (f) {
        if (f.kind === 'list') {
          var le = listEditor(f, obj[f.id]);
          form.appendChild(le.node);
          getters.push(function (out) {
            var v = le.get();
            if (v.length) out[f.id] = v;
          });
          return;
        }
        var r = fieldRow(f, prefix + '-' + f.id, obj[f.id], C[f.label || f.id] || f.id);
        form.appendChild(r.row);
        getters.push(function (out) {
          var v = r.get();
          if (v !== undefined) out[f.id] = v;
        });
      });
      collectData = function () {
        var out = {};
        getters.forEach(function (g) { g(out); });
        return out;
      };
    }

    var save = el('button', { type: 'submit', id: 'guardar-edicao', class: 'btn-primary', text: S.seccao.guardarEdicao });
    form.appendChild(el('p', { class: 'eu-nota', text: S.seccao.edicaoNota }));
    form.appendChild(el('div', { class: 'nav-row' }, save));
    on(form, 'submit', function (e) {
      e.preventDefault();
      clearSlot(slot);
      busy(save, function () {
        return API.request('PUT', '/rascunhos/' + d.id + '/seccoes/' + sec, { rev: d.rev, dados: collectData() });
      }).then(function (next) {
        announce(S.comum.guardado);
        redraw(next, 'seccao-texto');
      }).catch(function (err) { report(slot, err, { write: true }); });
    });
    return form;
  }

  // ---------------------------------------------------------------- page: references

  function pageReferences(ctx, id) {
    return loadDraft(id).then(function (view) {
      if (!ctx.alive()) return;
      drawReferences(ctx, view);
    });
  }

  function drawReferences(ctx, view, focusHeading) {
    clear(main);
    var d = view.rascunho;
    var content = draftLayout(view, { refs: true });
    var slot = errorSlot();
    var chosen = (d.referencias || []).filter(function (r) { return r.origem === 'curada'; }).map(function (r) { return r.id; });
    var own = (d.referencias || []).filter(function (r) { return r.origem === 'docente'; }).map(function (r) { return r.texto; });

    content.appendChild(el('h2', { class: 'step-title', text: S.referencias.titulo }));
    content.appendChild(el('p', { class: 'step-help', text: S.referencias.intro }));

    var curated = el('fieldset', { class: 'field-row eu-fieldset' },
      el('legend', { text: S.referencias.curadas }),
      el('div', { class: 'field-group' }, state.refs.map(function (r) {
        return el('label', { class: 'option' },
          el('input', { type: 'checkbox', name: 'ref', value: r.id, checked: chosen.indexOf(r.id) !== -1 }),
          el('span', { class: 'option-label' }, inline(r.texto, { noLinks: true })));
      })));

    var ownList = el('div', { id: 'refs-docente', 'aria-live': 'polite' });
    var drawOwn = function () {
      clear(ownList);
      if (own.length === 0) {
        ownList.appendChild(el('p', { class: 'eu-nota', text: S.referencias.semDocente }));
        return;
      }
      ownList.appendChild(el('ol', { class: 'eu-refs-docente' }, own.map(function (t, n) {
        return el('li', null, el('span', { text: t }), ' ',
          button(S.referencias.remover, { class: 'btn-ghost', 'aria-label': S.referencias.removerRef(n + 1) }, function () {
            own.splice(n, 1);
            drawOwn();
            newRef.focus();
          }));
      })));
    };
    drawOwn();
    var newRef = el('textarea', { id: 'ref-nova', rows: 3, maxlength: 2000, 'aria-describedby': 'ref-nova-ajuda' });
    var add = button(S.referencias.adicionar, { id: 'ref-adicionar' }, function () {
      var t = newRef.value.trim();
      if (t === '') {
        newRef.focus();
        return;
      }
      own.push(t);
      newRef.value = '';
      drawOwn();
      newRef.focus();
    });

    var save = el('button', { type: 'submit', id: 'guardar-referencias', class: 'btn-primary', text: S.referencias.guardar });
    var form = el('form', { id: 'referencias-form', novalidate: true },
      curated,
      el('section', { class: 'eu-seccao', 'aria-labelledby': 'refs-docente-titulo' },
        el('h3', { id: 'refs-docente-titulo', text: S.referencias.docente }),
        ownList,
        el('div', { class: 'field-row' },
          el('label', { for: 'ref-nova', text: S.referencias.nova }),
          el('p', { class: 'eu-ajuda', id: 'ref-nova-ajuda', text: S.referencias.novaAjuda }),
          newRef),
        el('div', null, add)),
      slot,
      el('div', { class: 'nav-row' }, save, el('span', { class: 'spacer' }), link(S.rascunho.previsao, '#/rascunho/' + d.id + '/previsao', { class: 'btn-ghost' })));
    content.appendChild(form);

    on(form, 'submit', function (e) {
      e.preventDefault();
      clearSlot(slot);
      var ids = Array.prototype.filter.call(form.querySelectorAll('input[name="ref"]'), function (i) { return i.checked; })
        .map(function (i) { return { id: i.value }; });
      var list = ids.concat(own.map(function (t) { return { texto: t }; }));
      busy(save, function () {
        return API.request('PUT', '/rascunhos/' + d.id + '/referencias', { rev: d.rev, referencias: list });
      }).then(function (next) {
        if (!ctx.alive()) return;
        drawReferences(ctx, next, true);
        announce(S.referencias.guardadas);
      }).catch(function (err) { report(slot, err, { write: true }); });
    });
    if (focusHeading) focusTitle();
    main.removeAttribute('aria-busy');
    main.dataset.pagina = 'referencias';
  }

  // ---------------------------------------------------------------- page: preview and export

  function pagePreview(ctx, id) {
    return loadDraft(id).then(function (view) {
      if (!ctx.alive()) return;
      var d = view.rascunho;
      var content = draftLayout(view, { previsao: true });
      var slot = errorSlot();
      var check = el('section', { id: 'verificacao', class: 'eu-seccao', 'aria-labelledby': 'verificacao-titulo' },
        el('h3', { id: 'verificacao-titulo', text: S.previsao.verificacao }));
      content.appendChild(el('h2', { class: 'step-title', text: S.previsao.titulo }));
      content.appendChild(check);
      content.appendChild(slot);
      if (!d.plano_aprovado) {
        check.appendChild(el('p', { class: 'review-note' }, S.rascunho.planoPrimeiro, ' ', link(S.rascunho.plano, '#/rascunho/' + id + '/plano')));
        return;
      }
      return API.request('GET', '/rascunhos/' + id + '/verificacao-final').then(function (v) {
        if (!ctx.alive()) return;
        var missing = v.seccoes_em_falta || [];
        var steps = v.passos_em_falta || [];
        if (steps.length) {
          check.appendChild(el('p', { text: S.previsao.passosFalta }));
          check.appendChild(el('ul', null, steps.map(function (passo) {
            var p = stepById(passo);
            return el('li', null, link(p ? p.titulo : passo, stepHref(id, passo)));
          })));
        }
        // tipo 'aviso': for the teacher to act on. tipo 'informacao': the Themis policy messages,
        // which the ficha prints next to the clause.
        var notes = v.avisos_regime || [];
        var warn = notes.filter(function (a) { return a.tipo !== 'informacao'; });
        var info = notes.filter(function (a) { return a.tipo === 'informacao'; });
        if (warn.length) {
          check.appendChild(el('p', { text: S.previsao.avisosRegime }));
          check.appendChild(el('ul', { id: 'avisos-regime' }, warn.map(function (a) { return el('li', { text: a.texto }); })));
        }
        if (info.length) {
          check.appendChild(el('p', { class: 'eu-nota', text: S.previsao.informacaoRegime }));
          check.appendChild(el('ul', { id: 'informacao-regime', class: 'eu-informacao' }, info.map(function (a) { return el('li', { text: a.texto }); })));
        }
        if (missing.length) {
          check.appendChild(el('p', { text: S.previsao.faltam }));
          check.appendChild(el('ul', null, missing.map(function (sec) {
            return el('li', null, link(S.seccao.titulos[sec] || sec, sectionHref(id, sec)));
          })));
        }
        if ((v.erros || []).length) {
          check.appendChild(el('p', { text: S.previsao.erros }));
          check.appendChild(el('ul', null, v.erros.map(function (e) { return el('li', { text: e }); })));
        } else if (!missing.length) {
          check.appendChild(el('p', { text: S.previsao.semErros }));
        }
        if (!(d.referencias || []).length) {
          check.appendChild(el('p', null, S.previsao.semReferencias, ' ', link(S.previsao.escolherReferencias, '#/rascunho/' + id + '/referencias')));
        } else if (v.referencias_a_verificar > 0) {
          check.appendChild(el('p', { text: S.previsao.refsVerificar(v.referencias_a_verificar) }));
        }
        if (missing.length) {
          content.appendChild(el('p', { class: 'eu-nota', text: S.previsao.semPrevisao }));
          return;
        }
        content.appendChild(exportBox(id, slot));
        var frameBox = el('section', { class: 'eu-seccao', 'aria-labelledby': 'previsao-ficha-titulo' },
          el('h3', { id: 'previsao-ficha-titulo', text: S.previsao.fichaTitulo }),
          el('p', { text: S.comum.aCarregar }));
        content.appendChild(frameBox);
        return API.text('/rascunhos/' + id + '/exportar?formato=html').then(function (html) {
          if (!ctx.alive()) return;
          frameBox.removeChild(frameBox.querySelector('p'));
          // sandbox with no tokens: no scripts, no forms, no navigation of this page.
          frameBox.appendChild(el('iframe', { id: 'previsao-ficha', class: 'eu-previsao', title: S.previsao.fichaTitulo, sandbox: '', srcdoc: html }));
        }, function (err) {
          if (!ctx.alive()) return;
          frameBox.removeChild(frameBox.querySelector('p'));
          report(slot, err);
        });
      });
    });
  }

  function exportBox(id, slot) {
    var make = function (formato) {
      var b = button(S.previsao[formato], { id: 'exportar-' + formato }, function () {
        clearSlot(slot);
        busy(b, function () {
          return API.download('/rascunhos/' + id + '/exportar?formato=' + formato);
        }, { label: S.previsao.aDescarregar }).then(function (file) {
          var name = file.filename || 'ficha.' + formato;
          saveFile(file.blob, name);
          announce(S.previsao.descarregado(name) + (file.avisos > 0 ? ' ' + S.previsao.avisosExportar(file.avisos) : ''));
        }).catch(function (err) { report(slot, err); });
      });
      return b;
    };
    return el('section', { class: 'eu-seccao', 'aria-labelledby': 'exportar-titulo' },
      el('h3', { id: 'exportar-titulo', text: S.previsao.exportar }),
      el('p', { class: 'eu-nota', text: S.previsao.exportarNota }),
      el('div', { class: 'nav-row' }, make('qmd'), make('md'), make('html')));
  }

  function saveFile(blob, name) {
    if (!window.URL || typeof window.URL.createObjectURL !== 'function') return;
    var url = window.URL.createObjectURL(blob);
    var a = el('a', { href: url, download: name, hidden: true }, name);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { window.URL.revokeObjectURL(url); }, 10000);
  }

  // ---------------------------------------------------------------- page: settings (own key)

  function pageSettings(ctx) {
    var slot = errorSlot();
    var mine = API.ownKey();
    var mode = el('p', { id: 'modo-actual', class: 'review-note', role: 'status',
      text: mine ? (API.remembered() ? S.definicoes.modoProprioGuardado : S.definicoes.modoProprio) : S.definicoes.modoPartilhado });
    var input = function (id, label, type, value) {
      return el('div', { class: 'field-row' },
        el('label', { for: id, text: label }),
        el('input', { id: id, class: 'text-input', type: type, autocomplete: 'off', spellcheck: 'false', value: value || '',
          'aria-describedby': 'chave-ajuda' }));
    };
    var save = el('button', { type: 'submit', id: 'guardar-chave', class: 'btn-primary', text: S.definicoes.guardar });
    var remove = mine ? button(S.definicoes.remover, { id: 'remover-chave' }, function () {
      API.clearOwnKey();
      route();
      announce(S.definicoes.removida);
    }) : null;
    var form = el('form', { id: 'chave-form', class: 'eu-cartao', novalidate: true },
      el('p', { class: 'eu-ajuda', id: 'chave-ajuda', text: S.definicoes.ajuda }),
      input('chave', S.definicoes.chave, 'password', mine && mine.key),
      input('agente', S.definicoes.agente, 'text', mine && mine.agent),
      input('canal', S.definicoes.canal, 'text', mine && mine.channel),
      el('div', { class: 'field-row' },
        el('label', { class: 'option' },
          el('input', { type: 'checkbox', id: 'lembrar', checked: API.remembered(), 'aria-describedby': 'lembrar-ajuda' }),
          el('span', { class: 'option-label', text: S.definicoes.lembrar })),
        el('p', { class: 'eu-ajuda', id: 'lembrar-ajuda', text: S.definicoes.lembrarAjuda })),
      slot,
      el('div', { class: 'nav-row' }, save, remove));
    on(form, 'submit', function (e) {
      e.preventDefault();
      clearSlot(slot);
      var value = { key: form.querySelector('#chave').value, agent: form.querySelector('#agente').value, channel: form.querySelector('#canal').value };
      var ok = API.setOwnKey(value, form.querySelector('#lembrar').checked);
      if (!ok) {
        report(slot, new API.ApiError(400, { erro: S.definicoes.faltam }));
        return;
      }
      route();
      announce(S.definicoes.guardada);
    });
    main.appendChild(el('div', { class: 'screen eu-estreito' },
      el('h2', { class: 'step-title', text: S.definicoes.titulo }),
      el('p', { class: 'step-help', text: S.definicoes.intro }),
      mode,
      form));
  }

  // ---------------------------------------------------------------- page: access codes (admin)

  function pageCodes(ctx) {
    var slot = errorSlot();
    var created = el('div', { class: 'eu-codigo-slot' });
    var table = el('div', { id: 'codigos-tabela', class: 'eu-tabela', 'aria-live': 'polite' }, el('p', { text: S.comum.aCarregar }));

    var name = el('input', { id: 'novo-nome', class: 'text-input', type: 'text', maxlength: 120, autocomplete: 'off', 'aria-describedby': 'novo-nome-ajuda' });
    var admin = el('input', { type: 'checkbox', id: 'novo-admin' });
    var create = el('button', { type: 'submit', id: 'criar-codigo', class: 'btn-primary', text: S.codigos.criar });
    var form = el('form', { id: 'codigo-form', class: 'eu-cartao', novalidate: true },
      el('h3', { text: S.codigos.novo }),
      el('div', { class: 'field-row' },
        el('label', { for: 'novo-nome', text: S.codigos.novoNome }),
        el('p', { class: 'eu-ajuda', id: 'novo-nome-ajuda', text: S.codigos.novoNomeAjuda }),
        name),
      el('div', { class: 'field-row' }, el('label', { class: 'option' }, admin, el('span', { class: 'option-label', text: S.codigos.novoAdmin }))),
      el('div', { class: 'nav-row' }, create));

    var load = function () {
      return API.request('GET', '/codigos').then(function (data) {
        if (!ctx.alive()) return;
        drawTable((data && data.codigos) || []);
      }, function (err) {
        if (!ctx.alive()) return;
        clear(table);
        report(slot, err);
      });
    };

    var drawTable = function (codes) {
      clear(table);
      if (codes.length === 0) {
        table.appendChild(el('p', { text: S.codigos.nenhum }));
        return;
      }
      table.appendChild(el('table', null,
        el('caption', { class: 'visually-hidden', text: S.codigos.lista }),
        el('thead', null, el('tr', null, [S.codigos.nome, S.codigos.perfil, S.codigos.criado, S.codigos.estado, S.codigos.accoes].map(function (t) {
          return el('th', { scope: 'col', text: t });
        }))),
        el('tbody', null, codes.map(function (c) {
          var actions = el('td');
          var plain = function () {
            clear(actions);
            if (c.revogado) return;
            var revoke = button(S.codigos.revogar, { class: 'btn-ghost revogar', 'aria-label': S.codigos.revogarDe(c.nome) }, function () {
              clear(actions);
              var confirm = button(S.codigos.confirmar, { class: 'btn-primary confirmar-revogar', 'aria-label': S.codigos.confirmarDe(c.nome) }, function () {
                clearSlot(slot);
                busy(confirm, function () { return API.request('DELETE', '/codigos/' + encodeURIComponent(c.id)); })
                  .then(function () { return load(); })
                  .then(function () {
                    // The row was redrawn: the focus goes to the status line that confirms it.
                    announce(S.codigos.revogadoOk(c.nome));
                    statusLine.focus();
                  })
                  .catch(function (err) { report(slot, err); });
              });
              append(actions, [
                el('p', { class: 'eu-nota', text: S.codigos.confirmarNota }),
                confirm, ' ',
                button(S.comum.cancelar, { class: 'btn-ghost' }, function () {
                  plain();
                  var again = actions.querySelector('button');
                  if (again) again.focus();
                }),
              ]);
              confirm.focus();
            });
            actions.appendChild(revoke);
          };
          plain();
          return el('tr', { class: c.revogado ? 'is-revogado' : null },
            el('td', { text: c.nome }),
            el('td', { text: S.codigos.perfis[c.perfil] || c.perfil }),
            el('td', { text: S.comum.data(c.criado) }),
            el('td', { text: c.revogado ? S.codigos.revogado : S.codigos.activo }),
            actions);
        }))));
    };

    on(form, 'submit', function (e) {
      e.preventDefault();
      clearSlot(slot);
      var nome = name.value.trim();
      if (nome === '') {
        report(slot, new API.ApiError(400, { erro: S.codigos.semNome }));
        return;
      }
      busy(create, function () { return API.request('POST', '/codigos', { nome: nome, admin: admin.checked }); }, { label: S.codigos.aCriar })
        .then(function (data) {
          if (!ctx.alive()) return;
          name.value = '';
          admin.checked = false;
          showCreated(nome, data.codigo);
          return load();
        })
        .catch(function (err) { report(slot, err); });
    });

    // The new code, once. It is only in this page: leaving the page drops it.
    var showCreated = function (nome, code) {
      clear(created);
      var codeText = el('p', { class: 'eu-codigo', id: 'codigo-valor', text: code });
      var copy = button(S.codigos.copiar, { class: 'btn-ghost' }, function () {
        var done = function () { announce(S.codigos.copiado); };
        var fail = function () {
          var range = document.createRange();
          range.selectNodeContents(codeText);
          var sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
          announce(S.codigos.naoCopiado);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, fail);
        else fail();
      });
      var box = el('section', { id: 'codigo-novo', class: 'eu-codigo-novo', tabindex: '-1', 'aria-labelledby': 'codigo-novo-titulo' },
        el('h3', { id: 'codigo-novo-titulo', text: S.codigos.criadoTitulo(nome) }),
        codeText,
        el('p', { text: S.codigos.criadoNota }),
        copy);
      created.appendChild(box);
      box.focus();
    };

    main.appendChild(el('div', { class: 'screen' },
      el('h2', { class: 'step-title', text: S.codigos.titulo }),
      el('p', { class: 'step-help', text: S.codigos.intro }),
      form,
      slot,
      created,
      el('section', { class: 'eu-seccao', 'aria-labelledby': 'lista-codigos-titulo' },
        el('h3', { id: 'lista-codigos-titulo', text: S.codigos.lista }),
        table)));
    return load();
  }

  // ---------------------------------------------------------------- start

  function loadStatic(file) {
    return window.fetch(file, { credentials: 'same-origin', cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('static ' + file + ' ' + res.status);
      return res.json();
    });
  }

  function start() {
    setStaticText();
    var me = API.request('GET', '/me').catch(function (err) {
      if (err.status === 401) return null;
      throw err;
    });
    Promise.all([loadStatic('interview.json'), loadStatic('references.json'), me]).then(function (r) {
      state.interview = r[0];
      state.refs = (r[1] && r[1].referencias) || [];
      setUser(r[2]);
      window.addEventListener('hashchange', route);
      route();
    }).catch(function (err) {
      clear(main);
      var slot = errorSlot();
      main.appendChild(el('div', { class: 'screen' }, el('h2', { class: 'step-title', text: S.erros.titulo }), slot));
      if (err instanceof API.ApiError) report(slot, err);
      else slot.appendChild(el('div', { class: 'eu-erro', role: 'alert' }, el('p', { text: S.erros.dados })));
      main.removeAttribute('aria-busy');
      main.dataset.pagina = 'erro';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
