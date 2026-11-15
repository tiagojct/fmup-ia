'use strict';

// Root of the fmup-ia repository. In the container the data files (schema,
// interview, patterns) are copied next to the app and this variable points there.
const path = require('node:path');

const repoRoot = process.env.EUNOMIA_REPO_ROOT || path.resolve(__dirname, '..', '..');

function repoPath(...parts) {
  return path.join(repoRoot, ...parts);
}

module.exports = { repoRoot, repoPath };
