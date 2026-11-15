'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createIaeduClient, parseJsonReply, IaeduError } = require('../src/iaedu.js');

// ---------------------------------------------------------------- mock IAedu

const KEY = 'sk-usr-test-key-0123456789';

// A mock server on 127.0.0.1:0. Each request is parsed (multipart included) and recorded; the
// handler writes the reply. close() also drops connections that the test left open.
async function startMock(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    let form = null;
    const type = req.headers['content-type'] || '';
    if (type.startsWith('multipart/form-data')) {
      form = await new Response(body, { headers: { 'content-type': type } }).formData();
    }
    const record = { method: req.method, url: req.url, headers: req.headers, form };
    requests.push(record);
    handler(req, res, record);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close() {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

function ndjson(res, objects, { status = 200 } = {}) {
  res.writeHead(status, { 'content-type': 'application/x-ndjson' });
  res.end(objects.map((o) => (typeof o === 'string' ? o : JSON.stringify(o))).join('\n') + '\n');
}

const MESSAGE = {
  type: 'message',
  content: { content: 'Olá', response_metadata: { model_name: 'gpt-4o-2024-11-20' } },
};

function opts(extra = {}) {
  return { key: KEY, agentId: 'agent-1', channelId: 'chan-1', threadId: 'thread-1', message: 'Diz olá.', ...extra };
}

async function withMock(handler, fn, clientOpts = {}) {
  const mock = await startMock(handler);
  try {
    const client = createIaeduClient({ baseUrl: mock.url, ...clientOpts });
    return await fn(client, mock);
  } finally {
    await mock.close();
  }
}

function isError(code, messagePt) {
  return (e) => {
    assert.ok(e instanceof IaeduError, `IaeduError esperado, recebido ${e && e.name}: ${e && e.message}`);
    assert.equal(e.code, code);
    assert.equal(e.messagePt, messagePt);
    assert.equal(e.message, messagePt);
    return true;
  };
}

const MSG = {
  auth: 'A chave IAedu indicada não é válida.',
  limite: 'A IAedu recusou o pedido por excesso de utilização. Tente daqui a alguns minutos.',
  servico: 'A IAedu devolveu um erro. Tente de novo.',
  tempo: 'A IAedu não respondeu a tempo.',
  formato: 'A resposta do modelo não tinha o formato esperado.',
};

// ---------------------------------------------------------------- the request

test('send: POST to /agent/{id}/stream with x-api-key and a multipart body', async () => {
  await withMock(
    (req, res) => ndjson(res, [{ type: 'start', content: 'Processing' }, MESSAGE, { type: 'done' }]),
    async (client, mock) => {
      await client.send(opts());
      assert.equal(mock.requests.length, 1);
      const r = mock.requests[0];
      assert.equal(r.method, 'POST');
      assert.equal(r.url, '/agent/agent-1/stream');
      assert.equal(r.headers['x-api-key'], KEY);
      assert.match(r.headers['content-type'], /^multipart\/form-data; boundary=/);
      assert.equal(r.form.get('channel_id'), 'chan-1');
      assert.equal(r.form.get('thread_id'), 'thread-1');
      assert.equal(r.form.get('user_info'), '{}');
      assert.equal(r.form.get('message'), 'Diz olá.');
      assert.equal(r.form.has('user_context'), false);
    },
  );
});

test('send: user_context is the JSON of the object, only when given', async () => {
  await withMock(
    (req, res) => ndjson(res, [MESSAGE]),
    async (client, mock) => {
      const ctx = { name: 'Docente', nivel: 2 };
      await client.send(opts({ userContext: ctx }));
      assert.equal(mock.requests[0].form.get('user_context'), JSON.stringify(ctx));
      await client.send(opts({ userContext: null }));
      assert.equal(mock.requests[1].form.has('user_context'), false);
    },
  );
});

test('send: user_context that is not an object is refused before any request', async () => {
  await withMock(
    (req, res) => ndjson(res, [MESSAGE]),
    async (client, mock) => {
      await assert.rejects(client.send(opts({ userContext: 'Docente' })), TypeError);
      await assert.rejects(client.send(opts({ userContext: ['a'] })), TypeError);
      assert.equal(mock.requests.length, 0);
    },
  );
});

test('send: a base URL with a trailing slash or a path keeps working', async () => {
  const mock = await startMock((req, res) => ndjson(res, [MESSAGE]));
  try {
    const client = createIaeduClient({ baseUrl: `${mock.url}/agent-chat/api/v1/` });
    await client.send(opts({ agentId: 'a b' }));
    assert.equal(mock.requests[0].url, '/agent-chat/api/v1/agent/a%20b/stream');
  } finally {
    await mock.close();
  }
});

test('send: a missing key is an auth error and nothing is sent', async () => {
  await withMock(
    (req, res) => ndjson(res, [MESSAGE]),
    async (client, mock) => {
      await assert.rejects(client.send(opts({ key: '' })), isError('auth', MSG.auth));
      assert.equal(mock.requests.length, 0);
    },
  );
});

// ---------------------------------------------------------------- the reply

test('send: tokens, then the message, give the full text and the model name', async () => {
  await withMock(
    (req, res) =>
      ndjson(res, [
        { run_id: 'r1', type: 'start', content: 'Processing' },
        '',
        { type: 'token', content: 'Ol' },
        '',
        { type: 'token', content: 'á' },
        '',
        MESSAGE,
        '',
        { type: 'done', content: 'Done' },
      ]),
    async (client) => {
      assert.deepEqual(await client.send(opts()), { text: 'Olá', model: 'gpt-4o-2024-11-20' });
    },
  );
});

test('send: the text of the message line wins over the joined tokens', async () => {
  await withMock(
    (req, res) =>
      ndjson(res, [
        { type: 'token', content: 'texto parcial' },
        { type: 'message', content: { content: 'texto completo', response_metadata: { model_name: 'amalia-llm/amalia-v1.0' } } },
        { type: 'done' },
      ]),
    async (client) => {
      assert.deepEqual(await client.send(opts()), { text: 'texto completo', model: 'amalia-llm/amalia-v1.0' });
    },
  );
});

test('send: the model is null when the message has no metadata', async () => {
  await withMock(
    (req, res) => ndjson(res, [{ type: 'message', content: { content: 'Olá' } }, { type: 'done' }]),
    async (client) => {
      assert.deepEqual(await client.send(opts()), { text: 'Olá', model: null });
    },
  );
});

test('send: a data: prefix on each line is accepted', async () => {
  await withMock(
    (req, res) =>
      ndjson(res, [
        `data: ${JSON.stringify({ type: 'token', content: 'Ol' })}`,
        `data:${JSON.stringify({ type: 'token', content: 'á' })}`,
        `data: ${JSON.stringify(MESSAGE)}`,
        'data: [DONE]',
      ]),
    async (client) => {
      assert.deepEqual(await client.send(opts()), { text: 'Olá', model: 'gpt-4o-2024-11-20' });
    },
  );
});

test('send: lines split across chunks, and a multibyte letter split across chunks, are joined', async () => {
  await withMock(
    async (req, res) => {
      const bytes = Buffer.from(`${JSON.stringify({ type: 'start' })}\n${JSON.stringify(MESSAGE)}\n${JSON.stringify({ type: 'done' })}\n`);
      const cut = bytes.indexOf(Buffer.from('Olá')) + 3; // between the two bytes of "á"
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(bytes.subarray(0, cut - 20));
      await new Promise((r) => setTimeout(r, 15));
      res.write(bytes.subarray(cut - 20, cut));
      await new Promise((r) => setTimeout(r, 15));
      res.end(bytes.subarray(cut));
    },
    async (client) => {
      assert.deepEqual(await client.send(opts()), { text: 'Olá', model: 'gpt-4o-2024-11-20' });
    },
  );
});

test('send: a last line without a newline is read', async () => {
  await withMock(
    (req, res) => {
      res.writeHead(200);
      res.end(`${JSON.stringify({ type: 'start' })}\n${JSON.stringify(MESSAGE)}`);
    },
    async (client) => {
      assert.deepEqual(await client.send(opts()), { text: 'Olá', model: 'gpt-4o-2024-11-20' });
    },
  );
});

// ---------------------------------------------------------------- errors

test('send: an error line gives the servico error', async () => {
  await withMock(
    (req, res) => ndjson(res, [{ type: 'start' }, { type: 'error', content: 'Unexpected error' }]),
    async (client) => {
      await assert.rejects(client.send(opts()), isError('servico', MSG.servico));
    },
  );
});

test('send: tokens with no message line and a closed stream give the servico error', async () => {
  await withMock(
    (req, res) => ndjson(res, [{ type: 'start' }, { type: 'token', content: 'Ol' }, { type: 'token', content: 'á' }, { type: 'done' }]),
    async (client) => {
      await assert.rejects(client.send(opts()), isError('servico', MSG.servico));
    },
  );
});

test('send: an empty stream, an empty message and a body that is not JSON give the servico error', async () => {
  for (const reply of [[], [{ type: 'message', content: { content: '' } }], ['<html>Bad gateway</html>']]) {
    await withMock(
      (req, res) => ndjson(res, reply),
      async (client) => {
        await assert.rejects(client.send(opts()), isError('servico', MSG.servico));
      },
    );
  }
});

test('send: HTTP 401 gives auth, 429 gives limite, other statuses give servico', async () => {
  const expected = { 401: ['auth', MSG.auth], 429: ['limite', MSG.limite], 500: ['servico', MSG.servico], 404: ['servico', MSG.servico] };
  for (const [status, [code, text]] of Object.entries(expected)) {
    await withMock(
      (req, res) => {
        res.writeHead(Number(status), { 'content-type': 'application/json' });
        res.end(JSON.stringify({ detail: 'x' }));
      },
      async (client) => {
        await assert.rejects(client.send(opts()), isError(code, text), `status ${status}`);
      },
    );
  }
});

test('send: no reply within timeoutMs gives tempo', async () => {
  await withMock(
    () => {}, // never answers
    async (client) => {
      await assert.rejects(client.send(opts()), isError('tempo', MSG.tempo));
    },
    { timeoutMs: 50 },
  );
});

test('send: a stream that stalls after the headers gives tempo', async () => {
  await withMock(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(`${JSON.stringify({ type: 'start' })}\n`); // then nothing
    },
    async (client) => {
      await assert.rejects(client.send(opts()), isError('tempo', MSG.tempo));
    },
    { timeoutMs: 80 },
  );
});

test('send: a line longer than 1 MB gives servico at once, without waiting for the time limit', async () => {
  await withMock(
    (req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write('{"type":"token","content":"' + 'a'.repeat(1024 * 1024 + 10)); // no newline, then nothing
    },
    async (client) => {
      const started = Date.now();
      await assert.rejects(client.send(opts()), isError('servico', MSG.servico));
      assert.ok(Date.now() - started < 4000);
    },
    { timeoutMs: 5000 },
  );
});

test('send: a refused connection gives servico', async () => {
  const mock = await startMock(() => {});
  const url = mock.url;
  await mock.close();
  const client = createIaeduClient({ baseUrl: url, timeoutMs: 2000 });
  await assert.rejects(client.send(opts()), isError('servico', MSG.servico));
});

test('send: an error never carries the key', async () => {
  await withMock(
    (req, res) => {
      res.writeHead(401);
      res.end(`bad key ${KEY}`);
    },
    async (client) => {
      try {
        await client.send(opts());
        assert.fail('devia falhar');
      } catch (e) {
        assert.ok(!String(e.stack).includes(KEY));
        assert.ok(!JSON.stringify({ ...e, message: e.message }).includes(KEY));
      }
    },
  );
});

test('IaeduError: the five codes carry the Portuguese messages', () => {
  for (const [code, text] of Object.entries(MSG)) {
    const e = new IaeduError(code);
    assert.equal(e.code, code);
    assert.equal(e.messagePt, text);
    assert.ok(e instanceof Error);
  }
  assert.throws(() => new IaeduError('outro'), TypeError);
});

// ---------------------------------------------------------------- parseJsonReply

test('parseJsonReply: strips a json fence', () => {
  assert.deepEqual(parseJsonReply('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonReply('  ```json\r\n{"a":1}\r\n```  \n'), { a: 1 });
  assert.deepEqual(parseJsonReply('```\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonReply('```JSON\n{"a":1}\n```'), { a: 1 });
});

test('parseJsonReply: plain JSON, and a fence with only one side, are read', () => {
  assert.deepEqual(parseJsonReply('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonReply('\n {"a":[1,2]} \n'), { a: [1, 2] });
  assert.deepEqual(parseJsonReply('```json\n{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonReply('{"a":1}\n```'), { a: 1 });
});

test('parseJsonReply: backticks inside a string value stay', () => {
  const text = '```json\n' + JSON.stringify({ prompt_base: 'Usa:\n```\ncódigo\n```\nfim' }) + '\n```';
  assert.deepEqual(parseJsonReply(text), { prompt_base: 'Usa:\n```\ncódigo\n```\nfim' });
  const bare = JSON.stringify({ prompt_base: 'Usa:\n```\ncódigo\n```' });
  assert.deepEqual(parseJsonReply(bare), { prompt_base: 'Usa:\n```\ncódigo\n```' });
});

test('parseJsonReply: text that is not a JSON object throws the formato error', () => {
  for (const bad of ['texto', '', '   ', '```json\n```', '```json\n{"a":\n```', '42', 'null', '"texto"', 'true', undefined, null, 5]) {
    assert.throws(() => parseJsonReply(bad), isError('formato', MSG.formato), `entrada: ${String(bad)}`);
  }
});
