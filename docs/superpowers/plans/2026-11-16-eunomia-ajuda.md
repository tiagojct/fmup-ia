# Eunomia 0.2 (help, tutorial, guidance, ten improvements) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a colleague who gets Eunomia by email understand it, finish a first ficha and recover from errors without help, and give Tiago usage, feedback and a review queue for the pilot.

**Architecture:** Help, worked examples and step guidance are data files read by the front end (ajuda-pt.js, exemplos.json, interview.json `minutos` and `erros_comuns`); none of them calls the model. The server gets new draft lifecycle routes (from example, duplicate, soft delete), pilot routes in a new module (opinion, submission, review, usage) and two new export formats (docx with the `docx` package, a student handout built by code). The front end adds pages to the hash router; routes come before the pages that use them.

**Tech Stack:** Node 22 (`node:http`, `node:test`), `ajv`, `docx` 9.x (new, pure JS, CommonJS `require('docx')`, `Packer.toBuffer(doc)` returns `Promise<Buffer>`), vanilla HTML/CSS/JS with no build, `jsdom` for front-end tests.

**Spec:** `docs/superpowers/specs/2026-11-16-eunomia-ajuda-design.md` (approved 2026-11-16). Read it before any task; "spec D5" means item 5 of section D. The 0.1 design and plan (`2026-11-14-eunomia-design.md`, `2026-11-14-eunomia.md`) still bind where this plan is silent.

Branch: `eunomia-ajuda`. Stay on it.

## Global Constraints

- Node 22. Server runtime dependencies: `ajv` and `docx` only ("one new dependency only (`docx`)"). Front end: no dependencies, no build step, no CDN.
- All user-facing text in European Portuguese with the Quadro spelling ("actividade", "objectivo", "correcção", "directamente"), "estudantes" not "alunos", "doentes" not "pacientes". No emojis in any file or output.
- All UI copy in `eunomia/i18n-pt.js` (`window.EUNOMIA_PT`), except the help copy, which goes in `eunomia/ajuda-pt.js` (`window.EUNOMIA_AJUDA`). `app.js`, `api.js` and `themis-link.js` stay ASCII only. Every string of `i18n-pt.js` is used by `app.js` (existing test; maps read with a computed key go in its `dynamic`/`computed` sets).
- API base path `/fmup-ia/eunomia/api`. Errors are JSON `{ erro, motivo?, erros? }`. Every 409 carries a `motivo`.
- New write routes follow the 0.1 rules: JSON content type or `X-Eunomia: 1`, `rev` concurrency where a draft is changed, own drafts only (admin routes use access `'admin'`), maxLength, C0 control characters refused (400), emoji refused (422), personal-data gate (422 `motivo: 'dados_pessoais'`, bypass with `confirmo_sem_dados_pessoais: true`) on free text over 200 characters and on every comment.
- Own-key headers `X-Iaedu-Key`, `X-Iaedu-Agent`, `X-Iaedu-Channel` are never stored or logged, and go only to the model routes. Logs keep method, path, status and ms only.
- The model never writes `regime_ia`, `referencias` or `declaracao`. Help, examples, guidance, the side panel, the handout and the Themis link make no model call.
- Draft states: `rascunho`, `submetida`, `devolvida`, `aprovada`, `rejeitada`, `substituida`. Editable: `rascunho`, `devolvida`.
- Accessibility as in 0.1: headings in order, focus moves to new content, aria-live for status, every control reachable by keyboard, no click handlers on div or span (existing test).
- localStorage only in try/catch; the app works with storage blocked.
- Do not edit `training/fichas/*.qmd`. Do not copy Themis code: load or test against it.
- No GitHub commit and no public library in this version.
- Commit messages: `eunomia: <imperative>`, no AI co-author or session lines. Do not commit until the task's tests pass.
- Test commands: `npm test --prefix eunomia-server`, `npm test --prefix eunomia/test`, `npm test --prefix themis/test`, `python3 scripts/sync-versions.py --check`.

## Review Focus

- A model request (gerar) reaches the server but the reply is lost (status 0). The retry then gets 409 `rev`. Expected: the client reloads the draft and shows the new text, no error box, no third request. Test in Task 7.
- A teacher opens `#/ajuda` or `#/exemplos/2` from the invitation email, with or without a session. Expected: the page shows (no redirect to `#/entrar` or `#/inicio`), and a later login goes to `#/inicio`, not back to the help. Test in Task 5.
- A draft is deleted in one tab while another tab still has it open. Expected: the stale tab's next write gets 404 "Rascunho não encontrado.", never a re-created file. Test in Task 2.
- A Themis link for answers with no safe Themis mapping (`nivel` `cpd` or `other`, formative activity with no `regime_themis`). Expected: Themis decodes it with no invalid-link toast and leaves the unmapped fields empty. Test in Task 9.
- Section text with Markdown escapes and special characters (`\@`, `\|` in a table cell, `&`, `<`, a C0 character) in the docx export. Expected: a valid document that shows `@`, `|`, `&`, `<` and has no control character. Test in Task 4.

---

### Task 1: Content data (interview guidance, examples, help copy)

**Files:**
- Modify: `eunomia/interview.json` (each of the nine steps gets `minutos` and `erros_comuns`)
- Create: `eunomia/exemplos.json`
- Create: `eunomia-server/src/exemplos.js`
- Create: `eunomia/ajuda-pt.js`
- Test: `eunomia-server/test/exemplos.test.js`, `eunomia-server/test/drafts.test.js` (interview fields), `eunomia/test/content.test.js`
- Modify: `eunomia/test/package.json` script to `node --test "*.test.js"`

**Interfaces:**
- Produces: step fields `minutos: integer 1..30` and `erros_comuns: string[]` (2 to 4 items, each 1..200 characters).
- Produces: `exemplos.json` = `{ versao: 1, nota: string, exemplos: Exemplo[], por_passo: { [stepId]: number[] } }`, with `Exemplo = { n: 1..6, titulo: string, respostas: { [stepId]: valor }, porque: { [stepId]: string }, nota?: { [stepId]: string } }`. `respostas` has every applicable step, `plano` included (`titulo` without the "Ficha N." prefix, `subtitulo` from the reference meta). `porque` has one sentence per answered step. `nota` marks an answer the ficha does not state (spec "Left to the builder"). `por_passo` lists two or three example numbers for each step except `regime_themis` (zero to three) and `plano` (none).
- Produces (`src/exemplos.js`): `EXEMPLOS` (the parsed file), `findExample(n: unknown) -> Exemplo | null` (only an integer 1..6), `referenceFicha(n) -> object | null` (reads `path.join(__dirname, '..', 'referencia', 'ficha-N.json')`, cached), `draftFromExample(user, n, now) -> Draft` (createDraft, then `applyAnswer` for each step in `INTERVIEW.passos` order that has an answer; throws `Error('exemplos.json: passo <id>: <errors>')` on errors; `plano_aprovado` stays false).
- Produces (`ajuda-pt.js`): `window.EUNOMIA_AJUDA = { pagina, titulo, oQueE: { titulo, paragrafos[] }, antes: { titulo, paragrafos[] }, etapas: { titulo, lista: [{ id: 'entrevista'|'plano'|'seccoes'|'exportar', titulo, docente, modelo }] }, glossario: { titulo, termos: [{ id, termo, texto, valores?: [{ id, rotulo }], ligacao: { rotulo, url } }] }, perguntas: { titulo, lista: [{ id, pergunta, resposta }] }, contacto: { titulo, nome: 'Tiago Jacinto', unidade: 'MEDCIDS', email: 'tiagojacinto@med.up.pt' } }`.
- Glossary ids: `regime`, `papel`, `padrao`, `competencia_protegida`, `clausula_themis`, `estados_seccao`, `chave`. FAQ ids: `rede`, `limite`, `modelo_ve`, `quem_ve`, `word_moodle`, `ajuste_parcial`, `aviso`, `apagar`, `submeter`.

- [ ] **Step 1: Write the failing tests.**
  - `drafts.test.js` `every step has minutos and two to four erros_comuns`: for each step, `Number.isInteger(minutos) && minutos >= 1 && minutos <= 30`; `erros_comuns.length` in 2..4; each item a non-empty string of at most 200 characters.
  - `exemplos.test.js`:
    - `there are six examples, n 1 to 6, one per reference ficha`.
    - `every example passes the answer validation and the plan gate`: `const d = draftFromExample({ id: 'u1', name: 'Ana' }, n, Date.now())`; `drafts.missingSteps(d)` deep-equals `[]`; `d.plano_aprovado === false`; `drafts.approvePlan(d)` does not throw.
    - `every example leads to its ficha`: `findPattern(respostas.padrao.padrao).ficha_exemplo` contains `/${n}-`; the pattern `papel_ia` equals `respostas.papel_ia.papel`; when `referenceFicha(n).meta.duracao.min` is a number, `contexto.duracao_min` and `duracao_max` equal the ficha's min and max, else `nota.contexto` is a non-empty string.
    - `every answered step has a porque sentence, and por_passo names examples that answer the step`: for each `[step, list]` of `por_passo`, length 2..3 (0..3 for `regime_themis`), every n has `respostas[step]`.
    - `findExample accepts only an integer from 1 to 6`: `findExample(0)`, `(7)`, `('1')`, `(1.5)` are null.
  - `eunomia/test/content.test.js` (loads `ajuda-pt.js` with `new Function('window', src)(w)`):
    - `the regime and papel glossary entries have every value of interview.json, with the same labels`: `termos.find(t => t.id === 'regime').valores` deep-equals the `regime` field `opcoes` mapped to `{ id, rotulo }`; same for `papel`.
    - `the estados_seccao entry has the four section states`: ids `['vazia', 'gerada', 'aceite', 'a-actualizar']`, rotulos equal `EUNOMIA_PT.seccao.estadoCurto`.
    - `every glossary entry links to a page of the site that exists`: same URL rule and file check as the `porque` link test in `eunomia-server/test/drafts.test.js`.
    - `the FAQ has the nine required questions; apagar says 30 dias; the contact is the work address`.
    - `the help has no emoji and uses the Quadro spelling` (the regexes of the existing copy test).
- [ ] **Step 2: Run** `npm test --prefix eunomia-server` and `npm test --prefix eunomia/test`. Expected: FAIL (fields and files missing).
- [ ] **Step 3: Write the data.** Add `minutos` and `erros_comuns` to `interview.json`. Write `exemplos.json` from `eunomia-server/referencia/ficha-1..6.json` and `training/fichas/1..6`. Write `src/exemplos.js` and `ajuda-pt.js`. Help copy: the four stages say what the teacher does and what the model does; "Antes de começar" names the access code, about 45 minutes and the data rules; the FAQ answers use the words the UI shows (the pattern step says "Adequação parcial", so the `ajuste_parcial` answer names that label); `apagar` says a deleted draft is kept 30 days; `quem_ve` says Tiago sees the "Foi útil?" opinions and the submitted drafts.
- [ ] **Step 4: Run** both suites. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "eunomia: add step guidance, worked examples and help copy"`.

### Task 2: Server draft lifecycle (from example, duplicate, soft delete)

**Files:**
- Modify: `eunomia-server/src/store.js` (add `move`)
- Modify: `eunomia-server/src/drafts.js` (add `duplicateDraft`, `deleteDraft`, `purgeDeleted`, `listAllDrafts`, `DELETED_DAYS`)
- Modify: `eunomia-server/src/draft-routes.js` (POST `/rascunhos` with `exemplo`, POST `/rascunhos/:id/duplicar`, DELETE `/rascunhos/:id`, GET `/exemplos/:n`; return the helpers)
- Modify: `eunomia-server/src/main.js` (daily purge also calls `purgeDeleted`)
- Test: `eunomia-server/test/lifecycle.test.js`, `eunomia-server/test/store.test.js`

**Interfaces:**
- Consumes: `findExample`, `referenceFicha`, `draftFromExample` (Task 1).
- Produces: `store.move(fromRel, toRel) -> boolean` (same path rules as `write`; creates the target folder; `fs.renameSync`; false when the source is missing).
- Produces: `duplicateDraft(source, user, now) -> Draft`: a new `createDraft(user, 'criar', now)` with a deep copy of `respostas` and `referencias`, `plano_aprovado` copied, only the sections with `estado: 'aceite'` copied as `{ dados, estado: 'aceite', avisos, modelo, origem }` (no `anterior`, no `opiniao`), then `syncSections` when the plan is approved. `respostas.plano.titulo` becomes `'Cópia de ' + titulo`, cut to 150 characters; no title, no change. No `threads`, `revisao`, `submetida`.
- Produces: `deleteDraft(store, draft, now) -> string` (sets `draft.apagado` to the ISO time, writes it, moves `rascunhos/<uid>/<id>.json` to `apagados/<uid>/<id>.json`, returns the time). `DELETED_DAYS = 30`. `purgeDeleted(store, now, days = DELETED_DAYS) -> number` (removes files of `apagados/*/` whose `apagado` is older than `days`; a damaged file or one without a valid `apagado` is kept). `listAllDrafts(store) -> Draft[]` (every user folder of `rascunhos/`).
- Produces: `registerDraftRoutes(...)` returns `{ readable, writable, save, view, modelSection, personalDataGate, checkText, optionalText, readyFicha, now }` for Task 3.
- Routes:
  - `POST /rascunhos` body `{ modo?: 'criar', exemplo?: 1..6 }`: 201 `view(d)`; `exemplo` present and `findExample` null: 400 `'Exemplo desconhecido.'`; at 100 drafts: 409 `motivo: 'limite'`.
  - `POST /rascunhos/:id/duplicar` (no body needed; the source is not changed, so no `rev`): 201 `view(copy)`; not found: 404; an admin on another user's draft: 403 `'Só o autor pode duplicar este rascunho.'`; at 100 drafts: 409 `limite`. Any source state.
  - `DELETE /rascunhos/:id` body `{ rev }`: 200 `{ ok: true, apagado }`; no integer rev: 400; stale rev: 409 `rev`; `estado === 'submetida'`: 409 `bloqueado` `'Uma actividade submetida para revisão não pode ser apagada.'`; another teacher: 404; an admin on another user's draft: 403 `'Só o autor pode apagar este rascunho.'`.
  - `GET /exemplos/:n` access `'public'`: 200 `{ ficha }` (the reference ficha); unknown n: 404 `'Exemplo não encontrado.'`.

- [ ] **Step 1: Write the failing tests** in `lifecycle.test.js` (use `startApp` and `person` from `helpers.js`):
  - `POST /rascunhos with exemplo 1 makes a draft with the example answers and the plan not approved`: 201; `json.rascunho.respostas` deep-equals `draftFromExample(...).respostas`; `plano_aprovado === false`; `json.proximo_passo === 'plano'`.
  - `exemplo 0, 7, "1" and 1.5 are 400 Exemplo desconhecido.`
  - `at 100 drafts, a new draft, an example and a duplicate are 409 limite` (write 100 files with `store.write`).
  - `duplicar copies the answers and the accepted sections only`: source `estado: 'submetida'`, `objectivo` aceite with `anterior` and `opiniao`, `formato` gerada; copy has `estado: 'rascunho'`, `rev: 1`, a new id, `respostas.plano.titulo === 'Cópia de Debate sobre o fim de vida'`, `seccoes.objectivo.estado === 'aceite'` without `anterior` or `opiniao`, `seccoes.formato` deep-equals `{ estado: 'vazia', avisos: [], modelo: null }`, `threads` deep-equals `{}`; the source file is unchanged (same `rev`).
  - `a copy of a 150-character title has 150 characters`.
  - `another teacher gets 404 on duplicar and DELETE; an admin gets 403`.
  - `DELETE moves the draft to apagados and the list no longer shows it`: 200; `store.read('apagados/<uid>/<id>.json').apagado` is the ISO time; GET `/rascunhos/:id` is 404; GET `/rascunhos` has no row with that id.
  - `DELETE without rev is 400, with an old rev 409 rev, on a submetida draft 409 bloqueado`.
  - `a stale tab that writes after the delete gets 404` (Review Focus): DELETE, then PUT `/respostas/contexto` with the old rev is 404 and `rascunhos/<uid>/<id>.json` does not exist.
  - `purgeDeleted removes a draft deleted 31 days ago, keeps one deleted 29 days ago, a damaged file and a file without apagado`: returns 1.
  - `GET /exemplos/3 without a session returns the reference ficha 3; /exemplos/9 is 404`.
  - `store.test.js`: `move moves the file and creates the folder; a missing source is false; a .. path throws`.
- [ ] **Step 2: Run** `npm test --prefix eunomia-server`. Expected: FAIL.
- [ ] **Step 3: Implement** `move`, the drafts functions and the routes. Share one cap check (`MAX_DRAFTS`, `TOO_MANY`) between the three create paths. Add `purgeDeleted(store, Date.now())` inside `purge` in `main.js`. Update the header comment of `draft-routes.js` (the list of 409 motivos is unchanged here).
- [ ] **Step 4: Run** the suite. Expected: PASS, old tests included.
- [ ] **Step 5: Commit** `git commit -m "eunomia: start from an example, duplicate and delete drafts"`.

### Task 3: Server pilot routes (opinion, submission, review, usage)

**Files:**
- Create: `eunomia-server/src/review-routes.js`
- Modify: `eunomia-server/src/server.js` (call `registerReviewRoutes` with the helpers that `registerDraftRoutes` returns)
- Modify: `eunomia-server/src/draft-routes.js` (PUT `/seccoes/:sec` and `/aceitar` keep `opiniao`)
- Modify: `eunomia-server/src/auth.js` (`USAGE_DAYS = 30`, add `usageSummary`)
- Test: `eunomia-server/test/review-routes.test.js`, `eunomia-server/test/auth.test.js`

**Interfaces:**
- Consumes: the helpers of Task 2, `drafts.listAllDrafts`, `drafts.MODEL_SECTIONS`, `validateFicha`.
- Produces: `registerReviewRoutes(route, config, { HttpError, sendJson, readable, writable, save, view, modelSection, personalDataGate, checkText, optionalText, readyFicha, now })`.
- Produces: `auth.usageSummary() -> { limite: number, utilizadores: { [userId]: { hoje: number, dias30: number } } }` (`dias30` counts today and the 29 days before). `usage.json` keeps 30 days.
- New draft fields: `seccoes[sec].opiniao = { util: boolean, comentario?: string, data: iso, modelo: string|null }`; `submetida: iso`; `revisao = { decisao: 'aprovada'|'devolvida', comentario?: string, data: iso, revisor: string }`.
- New motivo: `estado` (a review action on a draft that is not `submetida`): `'Esta actividade não está à espera de revisão.'`
- Routes:
  - `POST /rascunhos/:id/seccoes/:sec/opiniao` body `{ rev, util, comentario?, confirmo_sem_dados_pessoais? }`: `modelSection`, `writable`; `util` not boolean: 400 `'Indique se a secção foi útil (sim ou não).'`; `comentario` over 500: 400 (`optionalText(v, 500, 'comentario')`); `checkText`, then `personalDataGate` on the comment; the section has no `dados` or `origem !== 'modelo'`: 409 `incompleto` `'Só pode dar opinião sobre texto escrito pelo modelo.'`; 200 `view(save(d))`.
  - `POST /rascunhos/:id/submeter` body `{ rev }`: `writable`, `readyFicha` (its 409s), then `validateFicha(ficha, 'new')` not empty: 409 `invalido` `'A ficha tem erros. Corrija-os antes de submeter.'` with `erros`; sets `estado: 'submetida'`, `submetida`, deletes `revisao`; 200 `view`.
  - `GET /revisao` admin: `{ revisao: [{ id, titulo, autor, submetida, rev }] }`, the `submetida` drafts of all users, oldest `submetida` first.
  - `POST /revisao/:id/aprovar` admin, body `{ rev }`: 404; not `submetida`: 409 `estado`; stale rev: 409 `rev`; sets `estado: 'aprovada'`, `revisao: { decisao: 'aprovada', data, revisor }`; 200 `view`.
  - `POST /revisao/:id/devolver` admin, body `{ rev, comentario, confirmo_sem_dados_pessoais? }`: as aprovar; `comentario` missing or blank: 400 `'Escreva o comentário para o autor.'`; over 2000: 400; `checkText` and `personalDataGate`; sets `estado: 'devolvida'`, `revisao: { decisao: 'devolvida', comentario, data, revisor }`.
  - `GET /uso` admin: `{ limite_diario, utilizadores: [{ id, nome, perfil, revogado: boolean, rascunhos: { [estado]: n }, pedidos_hoje, pedidos_30_dias }], seccoes: [{ id, sim, nao, comentarios: [{ util, texto, data, modelo }] }] }`. Users from `auth.list()`, sorted by name; `rascunhos` has only states with a count. `seccoes` has the seven `MODEL_SECTIONS` in order, zeros included, and counts `opiniao` and `anterior.opiniao` of every draft. No section text, no author name in `seccoes`.
- Draft-routes change: the section that `PUT /seccoes/:sec` writes keeps `prev.opiniao`; `gerar` already moves the old section, with its `opiniao`, into `anterior`.

- [ ] **Step 1: Write the failing tests** in `review-routes.test.js` (a complete draft as in `export.test.js` `fullDraft`, written with `store.write`):
  - `opiniao stores util, comentario, data and modelo in the section and bumps rev`.
  - `opiniao: util "sim" is 400; a 501-character comment is 400; an emoji is 422; a comment with a valid NIF is 422 dados_pessoais and is stored with confirmo_sem_dados_pessoais`.
  - `opiniao on a teacher-written or empty section is 409 incompleto; on regime_ia it is 400`.
  - `a new version keeps the opinion in anterior; an edit and an accept keep it in the section`.
  - `submeter makes a complete draft submetida; the next PUT is 409 bloqueado`.
  - `submeter with a section not accepted is 409 incompleto; with schema errors 409 invalido with erros` (store a draft with `armadilhas` of one item).
  - `submeter removes the revisao of an earlier return`.
  - `GET /revisao lists the submitted drafts of every teacher, oldest first; a teacher gets 403`.
  - `aprovar sets aprovada and revisao.decisao; a rascunho is 409 estado; a stale rev is 409 rev`.
  - `devolver without a comment is 400; with one it sets devolvida and the comment; the author can PUT again`.
  - `GET /uso has, per user, the drafts by state, the calls today and in 30 days and the limit; per section, Sim and Não counts and the comments, and no section text` (assert `JSON.stringify(json)` does not contain a section `dados` text); a teacher gets 403.
  - `auth.test.js`: `usageSummary counts today and the last 30 days; a day 30 days ago is dropped from usage.json`.
- [ ] **Step 2: Run** `npm test --prefix eunomia-server`. Expected: FAIL.
- [ ] **Step 3: Implement** `review-routes.js`, `usageSummary`, the server wiring and the `opiniao` keep. A local `reviewable(ctx)` reads the draft with `readable`, checks `estado === 'submetida'` (409 `estado`) and `rev` (409 `rev`). Add `estado` to the motivo comment of `draft-routes.js`.
- [ ] **Step 4: Run** the suite. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "eunomia: add section opinions, submission, review queue and usage"`.

### Task 4: Server exports (docx, student handout)

**Files:**
- Modify: `eunomia-server/package.json`, `eunomia-server/package-lock.json` (`npm install docx@^9 --prefix eunomia-server`)
- Create: `eunomia-server/src/docx.js`, `eunomia-server/src/folheto.js`
- Modify: `eunomia-server/src/export.js` (extract `htmlPage(title, subtitle, bodyMarkdown) -> string`, used by `renderHtml` and the handout)
- Modify: `eunomia-server/src/draft-routes.js` (`EXPORTS` gets `docx`, `folheto`, `folheto-md`; the route awaits `body`)
- Test: `eunomia-server/test/docx-folheto.test.js`

**Interfaces:**
- Produces: `renderDocx(ficha) -> Promise<Buffer>`. It walks the same blocks as `renderQmd` (`SECTION_ORDER`, extras by slot, `SECTION_HEADINGS`), turns each section's Markdown (`renderSection`) into docx: `# title` as `HeadingLevel.TITLE`, subtitle paragraph, `##` as `HEADING_1`, `###` as `HEADING_2`, paragraphs, `- ` and `1. ` lists (`bullet: { level: 0 }` or a numbering config), the meta table as a 2-column `Table`, fenced code as monospace paragraphs, `**bold**`, `*italic*`, `` `code` ``, `[label](url)` as `ExternalHyperlink`. Backslash escapes (`\@`, `\|`) are removed; C0 characters stripped with `stripControl`; `:::` fence lines dropped.
- Produces: `renderFolhetoMd(ficha) -> string` (Markdown) and `renderFolhetoHtml(ficha) -> string` (`htmlPage(titulo, subtitulo, <the Markdown without the title and subtitle>)`). Content, in this order: `# <titulo>`, the subtitle, `## Objectivo` (`objectivo.texto`), `## O que vai fazer` (`renderSection('formato', ...)`, then `papeis.estudante`), `## Uso de IA nesta actividade` (the student sentence, `Condições: <condicoes>` when present, the Themis clause when `regime_ia.themis` exists and `regime !== 'proibido'`), `## Declaração de uso de IA` (`declaracao.texto`). Student sentences: `permitido` `'Pode usar ferramentas de IA nesta actividade.'`, `condicionado` `'Pode usar ferramentas de IA nesta actividade, nas condições indicadas.'`, `proibido` `'Não pode usar ferramentas de IA nesta actividade.'`. Never `papeis.docente`, `prompt_base`, `correccao`, `armadilhas`, `plano_b`, `referencias` or the meta table.
- `EXPORTS` entries: `{ type, suffix, body: (ficha) => string | Promise<Buffer> }`. Filenames: `<slug>.docx`, `<slug>-folheto.html`, `<slug>-folheto.md`. Types: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/html; charset=utf-8` (with the HTML CSP header), `text/markdown; charset=utf-8`. Same gate (`readyFicha`) and `X-Eunomia-Avisos` for every format. Unknown format: 400 `'Formato desconhecido. Use qmd, md, html, docx, folheto ou folheto-md.'`

- [ ] **Step 1: Write the failing tests** (read `word/document.xml` with `require('fflate').unzipSync`, a dependency of `docx`; fetch binary routes with `fetch(...).arrayBuffer()`, not `call()`, which reads text):
  - `renderDocx has the title, the subtitle, the section headings in ficha order and the meta table`: `document.xml` contains each `SECTION_HEADINGS` value of the ficha at increasing indexes, `<w:tbl>`, `Competência`.
  - `renderDocx strips control characters, removes Markdown escapes and keeps special characters` (Review Focus): section text `'a\u0007b contacto\\@med.up.pt & <x> | c'` and a meta cell with `\|`; the XML has `ab`, `contacto@med.up.pt`, `&amp;`, `&lt;x&gt;`, no `\@`, no U+0007.
  - `bold Markdown becomes a bold run`: `<w:b/>` present.
  - `GET exportar?formato=docx is 200 with the Word type, filename slug.docx, X-Eunomia-Avisos, and a body that starts with PK`; `an incomplete draft is 409 incompleto`.
  - `the handout has the student content only`: contains the objective, a formato block, `papeis.estudante`, `Pode usar ferramentas de IA nesta actividade.` and the declaration; does not contain `papeis.docente`, the `prompt_base` text or the `correccao` text.
  - `the handout shows the Themis clause for a summative activity with regime condicionado, and not for proibido`.
  - `formato=folheto is HTML with the CSP header; formato=folheto-md is Markdown; formato=xyz is 400 and names the six formats`.
- [ ] **Step 2: Run** `npm test --prefix eunomia-server`. Expected: FAIL.
- [ ] **Step 3: Implement** `docx.js`, `folheto.js`, `htmlPage` and the `EXPORTS` change. Keep `renderHtml` output identical (existing export tests).
- [ ] **Step 4: Run** the suite and `docker build -f eunomia-server/Dockerfile -t eunomia:local .` (the image runs `npm ci --omit=dev`; `docx` must be in `dependencies`). Expected: PASS, image builds.
- [ ] **Step 5: Commit** `git commit -m "eunomia: export the ficha as docx and the student handout"`.

### Task 5: Front end help page, header and login links, first-visit box, invitation text

**Files:**
- Create: `eunomia/test/harness.js` (move `FakeApi`, `boot`, `lastCall`, fixtures and constants out of `ui.test.js`; export them)
- Modify: `eunomia/test/ui.test.js` (require the harness; no test changes)
- Modify: `eunomia/index.html` (header link `<a href="#/ajuda" id="help-link" class="btn-ghost">`; `<script src="ajuda-pt.js?v=...">` before `app.js`)
- Modify: `eunomia/app.js`, `eunomia/i18n-pt.js`, `eunomia/style.css`
- Test: `eunomia/test/ajuda.test.js`

**Interfaces:**
- Consumes: `window.EUNOMIA_AJUDA` (Task 1).
- Produces: a route flag `open: true` (with `public: true`): the page shows with or without a session, `route()` does not redirect it to `#/inicio`, and `rememberPage` does not keep it. Route `{ re: /^#\/ajuda$/, page: 'ajuda', render: pageHelp, public: true, open: true }`.
- Produces: harness `SCRIPTS = ['i18n-pt.js', 'ajuda-pt.js', 'api.js', 'app.js']` (Task 9 adds `themis-link.js`). Later tasks add FakeApi routes in `harness.js`.
- Page `#/ajuda`: h2 `EUNOMIA_AJUDA.titulo`; h3 per section in this order: oQueE, antes, etapas, glossario, perguntas, contacto; glossary as `dl` with an external link per term; contact as `mailto:` link. Anchors `id="ajuda-<id>"` on each section, so other pages can link to `#/ajuda` and the FAQ.
- First-visit box on `#/inicio`: `#primeira-vez` with `S.inicio.primeiraVez` text and links to `#/exemplos` and `#/ajuda`, and a close button `#fechar-primeira-vez`. Storage key `'eunomia-boas-vindas:' + user.id`, value `'1'`, read and written in try/catch. Closing moves the focus to the h2.
- Codes page: after a code is created, `#convite` section with a read-only textarea `#convite-texto` (value `S.codigos.convite({ nome, codigo, app, ajuda, exemplos, contacto })`) and a copy button `#copiar-convite`. URLs: `app = location.origin + location.pathname`, `ajuda = app + '#/ajuda'`, `exemplos = app + '#/exemplos'`; `contacto` from `EUNOMIA_AJUDA.contacto`. Like the code, it is shown only in this view.
- New i18n keys: `app.ajuda`, `entrar.ajuda`, `inicio.primeiraVez`, `inicio.verExemplo`, `inicio.lerAjuda`, `inicio.fechar`, `codigos.conviteTitulo`, `codigos.convite` (function), `codigos.copiarConvite`, `codigos.conviteCopiado`.

- [ ] **Step 1: Move the harness** to `harness.js` and run `npm test --prefix eunomia/test`. Expected: PASS (same tests).
- [ ] **Step 2: Write the failing tests** in `ajuda.test.js`:
  - `#/ajuda without a session shows the help, not the login page; with a session too` (Review Focus): `page('ajuda')`, `w.location.hash === '#/ajuda'`, the h2 text equals `EUNOMIA_AJUDA.titulo`.
  - `after #/ajuda without a session, a login goes to #/inicio` (Review Focus).
  - `the header has the Ajuda link on every page; the login page links to the help`.
  - `the help has the six sections in order, a link for each glossary term, the nine questions and a mailto link to tiagojacinto@med.up.pt`; headings are h2 then h3 only.
  - `the first-visit box shows on the first visit, closes, and stays closed after a reload`; `with storage blocked it shows and closes without an error`.
  - `after a new code, the invitation text has the code, the app, help and examples links and the contact; leaving the page drops it`.
- [ ] **Step 3: Run** the suite. Expected: FAIL.
- [ ] **Step 4: Implement** the route flag, `pageHelp`, the links, the box, the invitation, the copy and CSS in the 0.1 style. Update the header comment of `app.js` (routes).
- [ ] **Step 5: Run** the suite. Expected: PASS.
- [ ] **Step 6: Commit** `git commit -m "eunomia: add the help page, the first-visit box and the invitation text"`.

### Task 6: Front end examples, start from an example, duplicate and delete on the home page

**Files:**
- Modify: `eunomia/app.js`, `eunomia/i18n-pt.js`, `eunomia/style.css`, `eunomia/test/harness.js` (FakeApi: `POST /rascunhos` with `exemplo`, `POST /rascunhos/:id/duplicar`, `DELETE /rascunhos/:id`, `GET /exemplos/:n` from `eunomia-server/referencia`)
- Test: `eunomia/test/exemplos-ui.test.js`

**Interfaces:**
- Consumes: `exemplos.json` (Task 1); routes of Task 2.
- Produces: `state.exemplos` (loaded in `start()` with `loadStatic('exemplos.json')`), `answerRows(step, valor) -> [{ rotulo, texto }]` (option ids as their labels, numbers as text, blank fields left out; used again in Task 7), `metaTable(meta) -> HTMLElement` (the `.ficha-meta` rows with the labels of the ficha; used again in Task 7).
- Routes: `#/exemplos` (`open`), `#/exemplos/([1-6])` (`open`).
- `#/exemplos`: one item per example: title (link), area label, papel label, duration (`duracaoTexto` rule: `min a max minutos` or `min minutos`).
- `#/exemplos/:n`: for each step of the example in interview order: h3 step `titulo`, a `dl` of `answerRows`, `porque` as a paragraph, `nota` as `.eu-nota`. Then h3 `S.exemplos.fichaTitulo`, `metaTable`, and the sections of `GET /exemplos/:n` with `sectionView`, the extras and the references. A failed GET shows the error in a slot and keeps the answers. Button `#comecar-exemplo` (session): POST `/rascunhos` `{ modo: 'criar', exemplo: n }`, then `go(stepHref(id, 'contexto'))`. Without a session: a link to `#/entrar` that sets `state.returnTo = { hash: '#/exemplos/' + n, user: null }`.
- Home rows: `Duplicar` (`.duplicar`, `aria-label` with the title) posts `/rascunhos/:id/duplicar` and opens the copy; `Apagar` (`.apagar`, not shown when `estado === 'submetida'`) shows an inline confirmation that names the title (`S.inicio.confirmarApagar(titulo)`), `Apagar` (`.confirmar-apagar`) sends `DELETE` with the row `rev`, `Cancelar` restores; after a delete the list reloads and the status line says `S.inicio.apagado(titulo)` and takes the focus. Home also links to `#/exemplos`.

- [ ] **Step 1: Write the failing tests** in `exemplos-ui.test.js`:
  - `#/exemplos without a session lists six examples with title, area, papel and duration`.
  - `#/exemplos/1 shows each question, the answers as labels, the porque line and the reference ficha sections` (assert an area label from `interview.json`, not the id; a heading of `SECTION_HEADINGS`; no model route in `api.calls`).
  - `start from example posts modo criar and exemplo 1 and opens the first step`.
  - `without a session the start control is a login link, and after the login the example opens again`.
  - `Duplicar posts to duplicar and opens the copy`.
  - `Apagar asks for confirmation with the title, sends DELETE with the rev, and the row goes; Cancelar keeps it`.
  - `a submetida draft has Duplicar but no Apagar`.
- [ ] **Step 2: Run** `npm test --prefix eunomia/test`. Expected: FAIL.
- [ ] **Step 3: Implement** the pages, the helpers, the home controls and the copy.
- [ ] **Step 4: Run** the suite. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "eunomia: add the worked examples and the duplicate and delete actions"`.

### Task 7: Front end step guidance, side panel and the retry on status 0

**Files:**
- Modify: `eunomia/api.js` (retry), `eunomia/app.js`, `eunomia/i18n-pt.js`, `eunomia/style.css`
- Modify: `eunomia-server/src/ficha.js` (export `PAPEL_TEXTO`, `REGIME_TEXTO`)
- Test: `eunomia/test/guidance.test.js`, `eunomia-server/test/painel.test.js`

**Interfaces:**
- Consumes: `minutos`, `erros_comuns`, `por_passo` (Task 1); `answerRows`, `metaTable`, `state.exemplos` (Task 6).
- Produces (`api.js`): `EUNOMIA_API.retry = { delay: 1500 }` (tests set it to 10). `request` on a `MODEL_ROUTE` path that fails with status 0 waits `retry.delay` ms and sends once more; the error of the second attempt has `retried: true`. Other routes never retry.
- Produces (`app.js`):
  - Progress: `S.passo.progresso(n, total, minutos)` -> `'Passo N de T · cerca de M min até ao plano'`. T is the number of applicable steps, `plano` included (8 for a formative activity, 9 for a summative one); M is the sum of `minutos` from this step to the last step before `plano`.
  - `exampleDisclosure(step) -> HTMLDetailsElement | null`: `<details class="eu-exemplo"><summary>S.passo.verExemplo</summary>` with, for each n of `por_passo[step.id]`, the example title (h4) and `answerRows`. Null when the list is empty.
  - `commonErrors(step) -> HTMLDetailsElement`: `<details class="eu-erros-comuns"><summary>S.passo.errosComuns</summary><ul>`.
  - `fichaPanel(d) -> HTMLElement`: `<aside class="eu-painel-ficha" aria-labelledby=...>` with h3 `S.painel.titulo`, `metaTable` of the meta built from `d.respostas` (same rules as `assemble.js buildMeta`; `formato` from `padrao.formato_grupo` or the pattern of `patterns.json`, loaded in `start()`), the objective text, and the regime as in the ficha: `S.painel.papeis[papel]` and `S.painel.regimeFrase(rotulo)`. Shown on the step and plan pages; in CSS it is beside the form on wide screens and below it on narrow ones.
  - In `drawSection` `generate`: an error with `retried && status === 409 && motivo === 'rev'` reloads the draft (`loadDraft`), announces `S.seccao.recuperada` and redraws with the focus on `#seccao-texto`.
  - `report()`: status 0 shows `S.erros.rede` and a link `S.erros.verAjuda` to `#/ajuda`.
- Copy: `S.erros.rede = 'O pedido não chegou ao servidor. O texto que escreveu continua nesta página. Tente de novo daqui a um momento. Se o erro se repetir, veja a Ajuda.'`. `S.painel.papeis` holds the same four strings as `ficha.js PAPEL_TEXTO`; `S.painel.regimeFrase(rotulo)` returns `'Regime para os estudantes durante a actividade, ' + rotulo + '.'`. Add `painel.papeis` to the `dynamic` set of the i18n test.

- [ ] **Step 1: Write the failing tests** in `guidance.test.js`:
  - `a step shows Passo 1 de 8 and the minutes to the plan` (expected M computed from `INTERVIEW`).
  - `Ver exemplo is a details element with the answers and titles of the examples of por_passo; regime_themis without examples has none`.
  - `Erros comuns lists the items of interview.json for the step`.
  - `the side panel shows the meta table, the objective and the regime from the saved answers, on a step and on the plan page, with no POST`.
  - `a model request that fails with status 0 is sent once more after the delay; a PUT of an answer is not` (FakeApi override that rejects with `TypeError` once).
  - `when the retry of gerar gets 409 rev, the draft is reloaded and the new text shown, with no error box` (Review Focus).
  - `two failures show the new rede message and a link to #/ajuda`.
  - `painel.test.js` (server suite): `the panel strings in i18n-pt.js equal ficha.js PAPEL_TEXTO and the regime sentence of the ficha` (load `i18n-pt.js` with `new Function('window', src)`).
- [ ] **Step 2: Run** both suites. Expected: FAIL.
- [ ] **Step 3: Implement** the retry, the guidance, the panel, the export of the two constants, the copy and the CSS.
- [ ] **Step 4: Run** both suites. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "eunomia: add step guidance, the ficha panel and a retry for lost model requests"`.

### Task 8: Front end opinions, submission, review queue and usage page

**Files:**
- Modify: `eunomia/app.js`, `eunomia/i18n-pt.js`, `eunomia/style.css`, `eunomia/test/harness.js` (FakeApi: opiniao, submeter, revisao, aprovar, devolver, uso)
- Modify: `eunomia/test/ui.test.js` (replace `routes outside the MVP (review) go to #/inicio` with `a teacher on #/revisao goes to #/inicio`; replace `8: the copy promises no submission ...` with a test that the data notice names the opinions and who sees them; the references copy assertions stay)
- Test: `eunomia/test/revisao-ui.test.js`

**Interfaces:**
- Consumes: routes of Task 3.
- Produces:
  - `feedbackBox(ctx, d, sec, s, slot, redraw)`: on a section with `dados` and `origem === 'modelo'` in an editable draft: a fieldset with legend `S.seccao.foiUtil`, buttons `#util-sim` and `#util-nao`, an optional textarea `#opiniao-comentario` (`maxlength="500"`) and `#enviar-opiniao`. It posts `{ rev, util, comentario? }`; a 422 `dados_pessoais` uses `personalDataBox` and resends with the flag. A section with `opiniao` shows `S.seccao.opiniaoDada(util)` and allows a change.
  - Preview: when the check has no missing sections, steps or schema errors and the draft is editable, `#submeter` (`S.previsao.submeter`) posts `{ rev }` and redraws; then `draftLayout` shows the submitted note.
  - `draftLayout`: `estado === 'devolvida'` and `revisao.comentario`: a `.review-note` with `S.rascunho.devolvida` and the comment at the top of every draft page; `aprovada`: `S.rascunho.aprovada` in place of `S.rascunho.bloqueado`.
  - Routes (admin): `#/revisao` (`pageReview`: list with title, author, date, link), `#/revisao/([0-9a-f]{12})` (`pageReviewItem`: the HTML export in the sandboxed iframe as on the preview page, `#aprovar`, and a form with `#devolver-comentario` (`maxlength="2000"`, required) and `#devolver`; after either, go to `#/revisao` and announce), `#/uso` (`pageUsage`: a table per user and a table per section with the comments as a list).
  - Admin home: `GET /revisao`, then `#a-rever` with `S.inicio.aRever(n)` (`'1 actividade à espera de revisão'`, `'N actividades à espera de revisão'`) linking to `#/revisao`, and links to `#/revisao` and `#/uso`. A teacher's home makes no `/revisao` call.
  - Copy: `S.entrar.avisoServidor` adds that Tiago Jacinto, the person in charge of Eunomia, sees the "Foi útil?" opinions and the drafts submitted for review.

- [ ] **Step 1: Write the failing tests** in `revisao-ui.test.js`:
  - `a model section shows Foi útil?; Não with a comment posts util false, the comment and the rev`.
  - `a teacher-written section has no Foi útil?; the comment field has maxlength 500`.
  - `personal data in the comment asks for the confirmation and resends with the flag`.
  - `the preview of a complete draft offers Submeter para revisão; it posts the rev and the page then shows the submitted note and no edit buttons`.
  - `a devolvida draft shows the review comment at the top of the step, section and preview pages`.
  - `the admin home shows 2 actividades à espera de revisão with a link to #/revisao; a teacher home makes no /revisao call`.
  - `#/revisao lists; #/revisao/:id shows the ficha preview; Aprovar posts the rev; Devolver with an empty comment does not post, with a comment it posts it`.
  - `#/uso shows a row per user with drafts by state, calls today and in 30 days and the limit, and the section counts and comments`.
  - `a teacher on #/revisao or #/uso goes to #/inicio`.
- [ ] **Step 2: Run** `npm test --prefix eunomia/test`. Expected: FAIL.
- [ ] **Step 3: Implement** the controls, pages and copy. Update the header comment of `app.js` (remove "Not in this version").
- [ ] **Step 4: Run** the suite. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "eunomia: add opinions, submission, the review queue and the usage page"`.

### Task 9: Front end Themis link and the docx and handout buttons

**Files:**
- Create: `eunomia/themis-link.js`
- Modify: `eunomia/index.html` (load `themis-link.js` before `app.js`), `eunomia/app.js`, `eunomia/i18n-pt.js`, `eunomia/test/harness.js` (`SCRIPTS`)
- Modify: `eunomia/test/package.json` only if needed (Themis files are read from `../../themis`)
- Test: `eunomia/test/themis-link.test.js`

**Interfaces:**
- Produces (`themis-link.js`, ASCII, browser global and `module.exports`): `window.EUNOMIA_THEMIS = { state(respostas) -> object, href(respostas) -> string }`.
  - `state`: `{ v: 3, lang: 'pt', role: 'teacher', level, courseType, policy, assignment, assignmentOther }`. `level`: `uc_undergrad` -> `undergraduate`, `uc_master` -> `postgraduate`, `uc_phd` -> `doctoral`, else `null`. `courseType`: `contexto.nivel` or `null` (the ids are the Themis `courseType` keys). `policy`: `regime_themis.policy`, else `permitido` -> `without_restrictions`, `condicionado` -> `with_disclosure`, `proibido` -> `not_permitted`, else `null`. `assignment` and `assignmentOther` only from `regime_themis` (else `[]` and `''`).
  - `href`: `'../themis/#s=' + base64url(UTF-8 JSON)` with no padding (`btoa(unescape(encodeURIComponent(json)))`, then `+` -> `-`, `/` -> `_`, strip `=`), the encoding Themis `b64decode` reads.
- Preview page: `#abrir-themis`, an external link (new window) with `S.previsao.abrirThemis` and a note `S.previsao.themisNota`, shown when the regime step is answered.
- `exportBox`: buttons for `docx`, `folheto` and `folheto-md` next to `qmd`, `md`, `html` (ids `exportar-<formato>`); copy `S.previsao.docx`, `S.previsao.folheto`, `S.previsao['folheto-md']`, added to the `computed` set of the i18n test; `exportarNota` names Word and the student handout.

- [ ] **Step 1: Write the failing tests** in `themis-link.test.js`:
  - `every contexto nivel id is a Themis courseType key, and the mapped level and policy values are Themis keys` (load `themis/i18n/pt.js` with `new Function('window', src)`).
  - `state maps undergrad formativa permitido to level undergraduate, policy without_restrictions, no assignment`.
  - `state of a summative activity takes policy, assignment and assignmentOther from regime_themis`.
  - `Themis decodes the link without the invalid-link toast and shows the teacher choices` (Review Focus): for three answer sets (undergrad formativa permitido; `cpd` sumativa condicionado with `['essay', 'other']` and an `assignmentOther`; `other` formativa proibido), boot `themis/index.html` in jsdom at `https://example.test/themis/` plus the hash (scripts `i18n/pt.js`, `i18n/en.js`, `policy-rules.js`, `app.js`, as `themis/test/smoke.js` does), wait 300 ms; `#toast` has no `is-visible`, `location.hash` starts with `#s=`, `input[name="policy"][value="<policy>"]` is checked.
  - In the same file with the Eunomia harness: `the preview has the Abrir no Themis link to ../themis/#s=`; `the docx, folheto and folheto-md buttons download with formato=docx, folheto and folheto-md`.
- [ ] **Step 2: Run** `npm test --prefix eunomia/test`. Expected: FAIL.
- [ ] **Step 3: Implement** `themis-link.js`, the link and the buttons.
- [ ] **Step 4: Run** `npm test --prefix eunomia/test` and `npm test --prefix themis/test`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "eunomia: link the preview to Themis and add the docx and handout downloads"`.

### Task 10: Version 0.2.0, README and docs

**Files:**
- Modify: `_variables.yml` (`eunomia.versao: "0.2.0"`)
- Modify: `scripts/sync-versions.py` (also set `"version"` of `eunomia-server/package.json` from `eunomia.versao`, with `replace` on `"version": "..."`)
- Modify (by the script): `eunomia/index.html` `?v=`, `eunomia-server/package.json`
- Modify: `eunomia-server/README.md` (new routes and access levels; `data/apagados/` and the 30-day purge; `usage.json` keeps 30 days; back up `apagados/` with `rascunhos/`; the `docx` dependency)

- [ ] **Step 1: Run** `python3 scripts/sync-versions.py --check`. Expected: FAIL after the `_variables.yml` change ("Inconsistent versions").
- [ ] **Step 2: Extend** `sync-versions.py`, then run `python3 scripts/sync-versions.py`. Expected: "Updated: eunomia/index.html, eunomia-server/package.json".
- [ ] **Step 3: Update** the README.
- [ ] **Step 4: Run** `python3 scripts/sync-versions.py --check`, `npm test --prefix eunomia-server`, `npm test --prefix eunomia/test`, `npm test --prefix themis/test`. Expected: "Version metadata consistent." and all PASS.
- [ ] **Step 5: Commit** `git commit -m "eunomia: version 0.2.0"`.
