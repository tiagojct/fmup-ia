/*
 * Eunomia (FMUP IA): the link from the preview page to Themis (spec D9).
 *
 * window.EUNOMIA_THEMIS = {
 *   state(respostas)  The Themis state of a teacher, from the interview answers of a draft:
 *                     { v, lang, role, level, courseType, policy, assignment, assignmentOther }.
 *   href(respostas)   '../themis/#s=' and the state as base64url of its UTF-8 JSON, without
 *                     padding. This is the encoding that b64decode of themis/app.js reads.
 * }
 *
 * A field with no safe mapping is null (or [] and ''): Themis leaves it empty and the teacher
 * chooses. regime_themis counts only when the activity is summative (evidencia.avaliacao), and
 * assignmentOther only when 'other' is in assignment. Nothing here calls the server or the model.
 * This file has no UI copy and stays ASCII only. It also exports the same object with
 * module.exports, for the tests.
 */
(function () {
  'use strict';

  // The schema version of the hash of themis/app.js (HASH_V). A test compares the two.
  var HASH_V = 3;

  // contexto.nivel (the Themis courseType keys) to the Themis level.
  var LEVEL = { uc_undergrad: 'undergraduate', uc_master: 'postgraduate', uc_phd: 'doctoral' };
  // regime.regime (the traffic light of the activity) to the Themis policy.
  var POLICY = { permitido: 'without_restrictions', condicionado: 'with_disclosure', proibido: 'not_permitted' };
  var POLICIES = ['not_permitted', 'with_disclosure', 'without_restrictions'];

  function isObject(x) {
    return x !== null && typeof x === 'object' && !Array.isArray(x);
  }

  function pick(map, key) {
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
  }

  function state(respostas) {
    var r = isObject(respostas) ? respostas : {};
    var contexto = isObject(r.contexto) ? r.contexto : {};
    var regime = isObject(r.regime) ? r.regime : {};
    // regime_themis is current only for a summative activity. The server keeps the answer when the
    // activity changes to formativa, so a stale one must not reach the link.
    var summative = isObject(r.evidencia) && r.evidencia.avaliacao === 'sumativa';
    var themis = summative && isObject(r.regime_themis) ? r.regime_themis : {};
    var policy = POLICIES.indexOf(themis.policy) !== -1 ? themis.policy : pick(POLICY, regime.regime);
    var assignment = Array.isArray(themis.assignment)
      ? themis.assignment.filter(function (v, i, all) { return typeof v === 'string' && all.indexOf(v) === i; })
      : [];
    // The free text belongs to "other": without it in the list, the text is a leftover.
    var other = assignment.indexOf('other') !== -1 && typeof themis.assignmentOther === 'string' ? themis.assignmentOther : '';
    return {
      v: HASH_V,
      lang: 'pt',
      role: 'teacher',
      level: pick(LEVEL, contexto.nivel),
      courseType: typeof contexto.nivel === 'string' && contexto.nivel !== '' ? contexto.nivel : null,
      policy: policy,
      assignment: assignment,
      assignmentOther: other,
    };
  }

  // The encoding of b64encode in themis/app.js: UTF-8, base64, then + to -, / to _, no padding.
  function encode(text) {
    return btoa(unescape(encodeURIComponent(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function href(respostas) {
    return '../themis/#s=' + encode(JSON.stringify(state(respostas)));
  }

  var api = { state: state, href: href };
  if (typeof window !== 'undefined') window.EUNOMIA_THEMIS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
