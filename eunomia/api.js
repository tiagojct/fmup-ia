/*
 * Eunomia (FMUP IA): the client of the API.
 *
 * window.EUNOMIA_API = {
 *   request(method, path, body?)  JSON in and out. Resolves with the data of a 2xx answer.
 *                                 Rejects with an ApiError { status, erro, motivo, erros, data }.
 *                                 status 0 means the server could not be reached.
 *   retry = { delay: 1500 }       A model request (MODEL_ROUTE) that fails with status 0 is sent
 *                                 once more after retry.delay ms; the error of that second attempt
 *                                 has retried: true. The first request may have reached the server
 *                                 (only the answer was lost): then the second gets a 409 with motivo
 *                                 rev, and the caller reloads the draft. Other routes never retry.
 *   download(path)                A file: resolves with { blob, filename, avisos }.
 *   setUser(id)                   The user of the session (from /me or the login), or null.
 *   setOwnKey({ key, agent, channel }, remember)  The own IAedu key of the user.
 *   clearOwnKey(), ownKey(), remembered()
 * }
 *
 * The own key lives in a module variable. It goes to localStorage['eunomia-chave'] only when the
 * teacher ticks "lembrar neste computador", with the id of the user. A remembered key is used only
 * for that user: after a logout it stays stored, but another user on the same computer does not
 * use it. A key that is not remembered leaves memory at logout. A stored key without a user id is
 * ignored. Every localStorage access is in try/catch: a browser that blocks storage still works, in
 * memory. This file has no UI copy.
 */
(function () {
  'use strict';

  var BASE = '/fmup-ia/eunomia/api';
  var STORE_KEY = 'eunomia-chave';

  var own = null;
  var remember = false;
  var user = null;

  function validKey(v) {
    return !!v && typeof v.key === 'string' && v.key !== '' && typeof v.agent === 'string' && v.agent !== '' &&
      typeof v.channel === 'string' && v.channel !== '';
  }

  function storageGet() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null; // blocked storage or a damaged value: start without a key
    }
  }

  function storageSet(value) {
    try {
      if (value) window.localStorage.setItem(STORE_KEY, JSON.stringify(value));
      else window.localStorage.removeItem(STORE_KEY);
    } catch (_e) {
      /* Storage is optional: the key stays in memory for this tab. */
    }
  }

  // The session user changes: use the key remembered for this user, if there is one.
  function setUser(id) {
    user = typeof id === 'string' && id !== '' ? id : null;
    own = null;
    remember = false;
    if (!user) return;
    var v = storageGet();
    if (validKey(v) && v.user === user) {
      own = { key: v.key, agent: v.agent, channel: v.channel };
      remember = true;
    }
  }

  function ApiError(status, data) {
    this.name = 'ApiError';
    this.status = status;
    this.data = data || null;
    this.erro = data && typeof data.erro === 'string' ? data.erro : null;
    this.motivo = data && typeof data.motivo === 'string' ? data.motivo : null;
    this.erros = data && Array.isArray(data.erros) ? data.erros.filter(function (x) { return typeof x === 'string'; }) : [];
    this.message = this.erro || ('HTTP ' + status);
    this.retried = false; // true on the error of the second attempt of a model request (retry)
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  // The routes that call the model: the only ones that get the own-key headers.
  var MODEL_ROUTE = /^\/rascunhos\/[^/?]+\/(?:objectivo\/sugerir|padroes\/explicar|seccoes\/[^/?]+\/gerar)(?:\?|$)/;

  // X-Eunomia: 1 on every request: the server refuses a POST, PUT or DELETE that has neither this
  // header nor the JSON content type (a form from another site can send neither). The own key goes
  // only to the model routes, so that it travels as little as possible.
  function headers(withBody, path) {
    var h = { Accept: 'application/json', 'X-Eunomia': '1' };
    if (withBody) h['Content-Type'] = 'application/json';
    if (own && MODEL_ROUTE.test(path)) {
      h['X-Iaedu-Key'] = own.key;
      h['X-Iaedu-Agent'] = own.agent;
      h['X-Iaedu-Channel'] = own.channel;
    }
    return h;
  }

  function send(method, path, body) {
    var init = { method: method, headers: headers(body !== undefined, path), credentials: 'same-origin', cache: 'no-store' };
    if (body !== undefined) init.body = JSON.stringify(body);
    return Promise.resolve()
      .then(function () { return window.fetch(BASE + path, init); })
      .catch(function () { throw new ApiError(0, null); });
  }

  function readJson(res) {
    return res.json().catch(function () { return null; });
  }

  function once(method, path, body) {
    return send(method, path, body).then(function (res) {
      return readJson(res).then(function (data) {
        if (!res.ok) throw new ApiError(res.status, data);
        return data;
      });
    });
  }

  // The delay is read at the time of the failure, from the exported object (tests shorten it).
  function retryDelay() {
    var r = window.EUNOMIA_API && window.EUNOMIA_API.retry;
    var ms = r && typeof r.delay === 'number' ? r.delay : 1500;
    return ms >= 0 ? ms : 0;
  }

  function request(method, path, body) {
    var first = once(method, path, body);
    if (!MODEL_ROUTE.test(path)) return first;
    return first.catch(function (err) {
      if (!(err instanceof ApiError) || err.status !== 0) throw err;
      return new Promise(function (resolve) { setTimeout(resolve, retryDelay()); })
        .then(function () { return once(method, path, body); })
        .catch(function (again) {
          if (again instanceof ApiError) again.retried = true;
          throw again;
        });
    });
  }

  function filenameOf(res) {
    var cd = res.headers.get('Content-Disposition') || '';
    var m = /filename="([^"]+)"/.exec(cd);
    return m ? m[1] : null;
  }

  function download(path) {
    return send('GET', path).then(function (res) {
      if (!res.ok) return readJson(res).then(function (data) { throw new ApiError(res.status, data); });
      return res.blob().then(function (blob) {
        return { blob: blob, filename: filenameOf(res), avisos: Number(res.headers.get('X-Eunomia-Avisos')) || 0 };
      });
    });
  }

  // The text of a file answer (the HTML preview).
  function text(path) {
    return send('GET', path).then(function (res) {
      if (!res.ok) return readJson(res).then(function (data) { throw new ApiError(res.status, data); });
      return res.text();
    });
  }

  function setOwnKey(value, keep) {
    var v = { key: String(value.key || '').trim(), agent: String(value.agent || '').trim(), channel: String(value.channel || '').trim() };
    if (!validKey(v)) return false;
    own = v;
    remember = !!keep && user !== null;
    if (remember) storageSet({ key: v.key, agent: v.agent, channel: v.channel, user: user });
    else clearStoredForUser();
    return true;
  }

  // Removes the stored key only when it belongs to this user (never another user's key).
  function clearStoredForUser() {
    var v = storageGet();
    if (v && v.user === user) storageSet(null);
  }

  function clearOwnKey() {
    own = null;
    remember = false;
    clearStoredForUser();
  }

  window.EUNOMIA_API = {
    BASE: BASE,
    ApiError: ApiError,
    request: request,
    retry: { delay: 1500 },
    download: download,
    text: text,
    setUser: setUser,
    setOwnKey: setOwnKey,
    clearOwnKey: clearOwnKey,
    ownKey: function () { return own ? { key: own.key, agent: own.agent, channel: own.channel } : null; },
    remembered: function () { return remember; },
  };
})();
