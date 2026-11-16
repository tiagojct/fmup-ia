'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createStore } = require('../src/store.js');

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eunomia-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('write then read gives the same object, with nested folders made on the way', (t) => {
  const dir = tempDir(t);
  const store = createStore(dir);
  const value = { nome: 'Docente', itens: [1, 2, { a: 'á' }] };
  store.write('drafts/abc/d1.json', value);
  assert.deepEqual(store.read('drafts/abc/d1.json'), value);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'drafts', 'abc', 'd1.json'), 'utf8')), value);
});

test('read: a missing file gives the fallback, a corrupt file throws', (t) => {
  const dir = tempDir(t);
  const store = createStore(dir);
  assert.deepEqual(store.read('nada.json', { codes: [] }), { codes: [] });
  assert.equal(store.read('nada.json', null), null);
  assert.equal(store.read('nada.json'), undefined);
  fs.writeFileSync(path.join(dir, 'mau.json'), '{"a":');
  assert.throws(() => store.read('mau.json', {}), /mau\.json/);
});

test('write: the atomic write leaves no temporary file', (t) => {
  const dir = tempDir(t);
  const store = createStore(dir);
  for (let i = 0; i < 5; i += 1) store.write('codes.json', { i });
  store.write('drafts/x/d.json', { ok: true });
  assert.deepEqual(fs.readdirSync(dir).sort(), ['codes.json', 'drafts']);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'drafts', 'x')), ['d.json']);
  assert.deepEqual(store.read('codes.json'), { i: 4 });
});

test('write: a failure leaves the old file and no temporary file', (t) => {
  const dir = tempDir(t);
  const store = createStore(dir);
  store.write('a.json', { v: 1 });
  const circular = {};
  circular.self = circular;
  assert.throws(() => store.write('a.json', circular));
  assert.deepEqual(store.read('a.json'), { v: 1 });
  // The target is a folder, so the final rename fails after the temporary file exists.
  fs.mkdirSync(path.join(dir, 'pasta.json'));
  assert.throws(() => store.write('pasta.json', { v: 2 }));
  assert.deepEqual(fs.readdirSync(dir).sort(), ['a.json', 'pasta.json']);
});

test('paths are confined to the data folder', (t) => {
  const dir = tempDir(t);
  const store = createStore(path.join(dir, 'data'));
  store.write('ok.json', { v: 1 });
  fs.writeFileSync(path.join(dir, 'fora.json'), '{"segredo":true}');
  for (const bad of ['../x', '../fora.json', 'a/../../fora.json', 'a/../b.json', '..', '/etc/passwd', path.join(dir, 'fora.json'), '', 'a\0b.json']) {
    assert.throws(() => store.read(bad, null), undefined, `read ${JSON.stringify(bad)}`);
    assert.throws(() => store.write(bad, {}), undefined, `write ${JSON.stringify(bad)}`);
    assert.throws(() => store.remove(bad), undefined, `remove ${JSON.stringify(bad)}`);
  }
  for (const bad of ['..', '../x', '/etc', 'a/../..', 'a\0b']) {
    assert.throws(() => store.list(bad), undefined, `list ${JSON.stringify(bad)}`);
  }
  assert.deepEqual(fs.readdirSync(dir).sort(), ['data', 'fora.json']);
  assert.equal(fs.readFileSync(path.join(dir, 'fora.json'), 'utf8'), '{"segredo":true}');
});

test('list: names in a folder, sorted, without temporary files; missing folder gives []', (t) => {
  const dir = tempDir(t);
  const store = createStore(dir);
  assert.deepEqual(store.list('drafts/nada'), []);
  store.write('drafts/u1/b.json', {});
  store.write('drafts/u1/a.json', {});
  store.write('drafts/u2/c.json', {});
  fs.writeFileSync(path.join(dir, 'drafts', 'u1', '.a.json.123.tmp'), '{}');
  assert.deepEqual(store.list('drafts/u1'), ['a.json', 'b.json']);
  assert.deepEqual(store.list('drafts'), ['u1', 'u2']);
  assert.deepEqual(store.list(''), ['drafts']);
  assert.deepEqual(store.list('.'), ['drafts']);
});

test('remove: deletes a file and says whether there was one', (t) => {
  const dir = tempDir(t);
  const store = createStore(dir);
  store.write('a.json', {});
  assert.equal(store.remove('a.json'), true);
  assert.equal(store.remove('a.json'), false);
  assert.equal(store.read('a.json', 'gone'), 'gone');
});

test('move moves the file and creates the folder; a missing source is false; a .. path throws', (t) => {
  const dir = tempDir(t);
  const store = createStore(dir);
  store.write('rascunhos/u1/d1.json', { id: 'd1' });
  assert.equal(store.move('rascunhos/u1/d1.json', 'apagados/u1/d1.json'), true);
  assert.equal(store.read('rascunhos/u1/d1.json', null), null);
  assert.deepEqual(store.read('apagados/u1/d1.json'), { id: 'd1' });
  assert.equal(store.move('rascunhos/u1/d1.json', 'apagados/u1/d1.json'), false);
  assert.deepEqual(store.read('apagados/u1/d1.json'), { id: 'd1' });
  assert.throws(() => store.move('../x.json', 'a.json'), /fora da pasta/);
  assert.throws(() => store.move('apagados/u1/d1.json', '../fora.json'), /fora da pasta/);
  assert.throws(() => store.move('apagados/u1/d1.json', ''), /fora da pasta/);
  assert.ok(fs.existsSync(path.join(dir, 'apagados', 'u1', 'd1.json')));
});

test('createStore needs a folder name', () => {
  assert.throws(() => createStore(''), TypeError);
  assert.throws(() => createStore(undefined), TypeError);
});
