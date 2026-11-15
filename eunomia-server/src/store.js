'use strict';

// JSON files in one folder (EUNOMIA_DATA). All calls are synchronous: the files are small, and a
// read-modify-write in one tick cannot be interleaved with another request in the same process.
// Paths are relative to the folder and may not leave it. A write goes to a temporary file in the
// same folder, then a rename replaces the target, so a reader sees the old file or the new one.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Temporary files: ".<name>.<pid>.<random>.tmp". list() hides them.
const TEMP_FILE = /^\..*\.tmp$/;

function missing(e) {
  return e && (e.code === 'ENOENT' || e.code === 'ENOTDIR');
}

function createStore(dir) {
  if (typeof dir !== 'string' || dir === '') throw new TypeError('A pasta de dados é obrigatória.');
  const root = path.resolve(dir);

  // Absolute paths, ".." segments and null bytes are refused. The empty path is the folder itself,
  // and only list() accepts it.
  function resolve(rel, { allowRoot = false } = {}) {
    const refuse = () => new Error(`Caminho fora da pasta de dados: ${JSON.stringify(rel)}`);
    if (typeof rel !== 'string' || rel.includes('\0') || path.isAbsolute(rel)) throw refuse();
    if (rel === '' || rel === '.') {
      if (allowRoot) return root;
      throw refuse();
    }
    if (rel.split(/[\\/]+/).includes('..')) throw refuse();
    const full = path.resolve(root, rel);
    const inside = path.relative(root, full);
    if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside)) throw refuse();
    return full;
  }

  // The parsed file, or fallback when there is no file. A file that is not valid JSON throws:
  // the fallback would hide a damaged file and the next write would overwrite it.
  function read(rel, fallback) {
    const file = resolve(rel);
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (e) {
      if (missing(e)) return fallback;
      throw e;
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Ficheiro de dados inválido (${rel}): ${e.message}`);
    }
  }

  function write(rel, obj) {
    const file = resolve(rel);
    if (obj === undefined) throw new TypeError('Não há nada para guardar.');
    const text = `${JSON.stringify(obj, null, 2)}\n`; // throws on a circular object, before any file exists
    const folder = path.dirname(file);
    fs.mkdirSync(folder, { recursive: true });
    const temp = path.join(folder, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
    let fd;
    try {
      fd = fs.openSync(temp, 'wx');
      fs.writeSync(fd, text);
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(temp, file);
    } catch (e) {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {
          // already closed
        }
      }
      try {
        fs.rmSync(temp, { force: true });
      } catch {
        // nothing more to do
      }
      throw e;
    }
  }

  // The names (files and folders) in a folder, sorted. A missing folder is an empty list.
  function list(relDir) {
    const folder = resolve(relDir, { allowRoot: true });
    try {
      return fs
        .readdirSync(folder)
        .filter((name) => !TEMP_FILE.test(name))
        .sort();
    } catch (e) {
      if (missing(e)) return [];
      throw e;
    }
  }

  // True when a file was removed, false when there was none.
  function remove(rel) {
    const file = resolve(rel);
    try {
      fs.unlinkSync(file);
      return true;
    } catch (e) {
      if (missing(e)) return false;
      throw e;
    }
  }

  return { read, write, list, remove };
}

module.exports = { createStore };
