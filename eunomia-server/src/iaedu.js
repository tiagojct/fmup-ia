'use strict';

// Client for the IAedu chat API. One call is one POST that streams one JSON object per line.
// Facts (tested on 2026-11-14, see the design, section 4.1):
//   POST {base}/agent/{agentId}/stream, header x-api-key, a multipart body (channel_id, thread_id,
//   user_info = "{}", message, and optionally user_context as a JSON object).
//   Lines: start, token (text delta), message (the full text and response_metadata.model_name),
//   done, error. Blank lines appear between objects. Some gateways add a "data:" prefix.
// The full text is the one in the message line. Tokens alone are not a reply: a stream that closes
// with tokens and no message line is a service error.
// The key, the agent ID and the channel ID are used for the call only. Errors carry a code and a
// Portuguese message, never the request, the reply or the key.

const DEFAULT_BASE_URL = 'https://api.iaedu.pt/agent-chat/api/v1';

// A line of the stream longer than this is not a reply: the read stops with a service error.
const MAX_LINE = 1024 * 1024;

const MESSAGES = {
  auth: 'A chave IAedu indicada não é válida.',
  limite: 'A IAedu recusou o pedido por excesso de utilização. Tente daqui a alguns minutos.',
  servico: 'A IAedu devolveu um erro. Tente de novo.',
  tempo: 'A IAedu não respondeu a tempo.',
  formato: 'A resposta do modelo não tinha o formato esperado.',
};

class IaeduError extends Error {
  constructor(code) {
    const messagePt = MESSAGES[code];
    if (messagePt === undefined) throw new TypeError(`Código de erro IAedu desconhecido: ${code}`);
    super(messagePt);
    this.name = 'IaeduError';
    this.code = code;
    this.messagePt = messagePt;
  }
}

// ---------------------------------------------------------------- the stream

// One line of the stream as an object, or null for a blank line, a line that is not JSON
// (for example "data: [DONE]" or an SSE "event:" line) and JSON that is not an object.
function parseLine(raw) {
  let line = raw.trim();
  if (line.startsWith('data:')) line = line.slice(5).trim();
  if (!line.startsWith('{')) return null;
  try {
    const value = JSON.parse(line);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

// The text and the model name of a message line. content is {content, response_metadata} on IAedu;
// a plain string is accepted too. Null when the line has no text.
function readMessage(content) {
  const text = typeof content === 'string' ? content : content && typeof content === 'object' ? content.content : undefined;
  if (typeof text !== 'string' || text.trim() === '') return null;
  const name = content && typeof content === 'object' && content.response_metadata ? content.response_metadata.model_name : undefined;
  return { text, model: typeof name === 'string' && name !== '' ? name : null };
}

async function readReply(body) {
  const decoder = new TextDecoder();
  let pending = '';
  let message = null;
  let finished = false;

  // Returns true when the stream is complete (done).
  function handle(raw) {
    const event = parseLine(raw);
    if (!event) return false;
    if (event.type === 'error') throw new IaeduError('servico');
    if (event.type === 'message') message = readMessage(event.content) || message;
    return event.type === 'done';
  }

  for await (const chunk of body) {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop();
    if (pending.length > MAX_LINE) throw new IaeduError('servico');
    for (const line of lines) {
      if (handle(line)) {
        finished = true;
        break;
      }
    }
    if (finished) break;
  }
  if (!finished) {
    pending += decoder.decode();
    if (pending !== '') handle(pending);
  }

  if (!message) throw new IaeduError('servico');
  return message;
}

// ---------------------------------------------------------------- the client

function requireText(value, name) {
  if (typeof value !== 'string' || value === '') throw new TypeError(`${name} em falta.`);
  return value;
}

function createIaeduClient({ baseUrl = DEFAULT_BASE_URL, timeoutMs = 60000 } = {}) {
  const base = String(baseUrl).replace(/\/+$/, '');

  // opts = { key, agentId, channelId, threadId, message, userContext? }
  async function send(opts) {
    const { key, agentId, channelId, threadId, message, userContext } = opts || {};
    if (typeof key !== 'string' || key === '') throw new IaeduError('auth');
    requireText(agentId, 'agentId');
    requireText(channelId, 'channelId');
    requireText(threadId, 'threadId');
    requireText(message, 'message');
    if (userContext !== undefined && userContext !== null) {
      if (typeof userContext !== 'object' || Array.isArray(userContext)) {
        throw new TypeError('userContext tem de ser um objecto: a IAedu recusa texto simples.');
      }
    }

    // No Content-Type here: fetch sets multipart/form-data with its boundary.
    const form = new FormData();
    form.append('channel_id', channelId);
    form.append('thread_id', threadId);
    form.append('user_info', '{}');
    form.append('message', message);
    if (userContext !== undefined && userContext !== null) form.append('user_context', JSON.stringify(userContext));

    const signal = AbortSignal.timeout(timeoutMs);
    const failure = (e) => (e instanceof IaeduError ? e : new IaeduError(signal.aborted ? 'tempo' : 'servico'));

    let res;
    try {
      // redirect: 'error' so that the key never follows a redirect to another host.
      res = await fetch(`${base}/agent/${encodeURIComponent(agentId)}/stream`, {
        method: 'POST',
        headers: { 'x-api-key': key },
        body: form,
        signal,
        redirect: 'error',
      });
    } catch (e) {
      throw failure(e);
    }

    if (!res.ok) {
      try {
        await res.body?.cancel();
      } catch {
        // the reply is not needed
      }
      throw new IaeduError(res.status === 401 ? 'auth' : res.status === 429 ? 'limite' : 'servico');
    }

    try {
      return await readReply(res.body);
    } catch (e) {
      throw failure(e);
    }
  }

  return { send };
}

// ---------------------------------------------------------------- JSON replies

// The model is asked for JSON and often wraps it in a ```json fence. This strips a fence at the
// start and at the end, then parses. Text before or after the fence is not searched for: a JSON
// value can hold ``` inside a string. The result must be an object or an array.
function parseJsonReply(text) {
  if (typeof text !== 'string') throw new IaeduError('formato');
  const stripped = text
    .trim()
    .replace(/^```[ \t]*(?:json)?[ \t]*\r?\n?/i, '')
    .replace(/\r?\n?```$/, '')
    .trim();
  let value;
  try {
    value = JSON.parse(stripped);
  } catch {
    throw new IaeduError('formato');
  }
  if (value === null || typeof value !== 'object') throw new IaeduError('formato');
  return value;
}

module.exports = { createIaeduClient, parseJsonReply, IaeduError, DEFAULT_BASE_URL };
