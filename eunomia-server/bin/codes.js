#!/usr/bin/env node
'use strict';

// Admin command for the access codes. The server stores only a hash, so a code is shown once.
//   node bin/codes.js add "<nome>" [--admin]   makes a code and prints it
//   node bin/codes.js list                     lists the codes (never the code itself)
//   node bin/codes.js revoke <id>              revokes a code; its sessions stop at once
// The data folder is EUNOMIA_DATA (default ./data), as for the server. On the server:
//   docker exec eunomia node bin/codes.js add "<nome>"
// Run it as the user of the server, not as root, so that the files stay readable for the server.

const crypto = require('node:crypto');
const { createStore } = require('../src/store.js');
const { createAuth } = require('../src/auth.js');

const USAGE = `Uso:
  node bin/codes.js add "<nome>" [--admin]
  node bin/codes.js list
  node bin/codes.js revoke <id>
`;

function main(argv, { env = process.env, stdout = process.stdout, stderr = process.stderr } = {}) {
  const [command, ...args] = argv;
  const out = (text) => stdout.write(`${text}\n`);
  const fail = (text) => {
    stderr.write(`${text}\n`);
    return 1;
  };

  // The command never signs a session, so a throwaway secret is enough when the variable is not set.
  const secret = typeof env.EUNOMIA_SECRET === 'string' && env.EUNOMIA_SECRET.length >= 32 ? env.EUNOMIA_SECRET : crypto.randomBytes(32).toString('hex');

  try {
    const auth = createAuth({ store: createStore(env.EUNOMIA_DATA || './data'), secret });

    if (command === 'add') {
      const flags = args.filter((a) => a.startsWith('--'));
      const names = args.filter((a) => !a.startsWith('--'));
      if (flags.some((f) => f !== '--admin') || names.length !== 1 || names[0].trim() === '') {
        return fail(`Falta o nome, ou há opções desconhecidas.\n${USAGE}`);
      }
      const role = flags.includes('--admin') ? 'admin' : 'teacher';
      const { id, code } = auth.addCode(names[0], role);
      out(`Código de acesso de ${names[0].trim()} (id ${id}, perfil ${role}).`);
      out('O código só é mostrado agora. Guarde-o e entregue-o a quem vai usá-lo.');
      out('');
      out(code);
      return 0;
    }

    if (command === 'list' && args.length === 0) {
      const rows = auth.list();
      if (rows.length === 0) {
        out('Sem códigos.');
        return 0;
      }
      out(['id'.padEnd(8), 'perfil'.padEnd(7), 'estado'.padEnd(9), 'criado'.padEnd(10), 'nome'].join(' '));
      for (const c of rows) {
        const state = c.revoked ? 'revogado' : 'activo';
        out([c.id.padEnd(8), c.role.padEnd(7), state.padEnd(9), c.created.slice(0, 10), c.name].join(' '));
      }
      return 0;
    }

    if (command === 'revoke' && args.length === 1 && args[0] !== '') {
      if (!auth.revoke(args[0])) return fail(`Código desconhecido ou já revogado: ${args[0]}`);
      out(`Código ${args[0]} revogado.`);
      return 0;
    }

    return fail(USAGE.trimEnd());
  } catch (e) {
    return fail(`Erro: ${e.message}`);
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main };
