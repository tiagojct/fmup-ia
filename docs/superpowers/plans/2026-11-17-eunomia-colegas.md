# Eunomia 0.3 (for reluctant colleagues) Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Goal: apply points 1-9 of the spec: invitation, two entry routes, more areas, plain labels, a no-AI example, adapt an existing activity, gentler tips, what Tiago sees (true in code), the tool's status.

Architecture: same stack as 0.2. Server changes in eunomia-server/src (draft-routes.js, drafts.js, exemplos.js, prompts.js, assemble.js); content in eunomia/interview.json, exemplos.json, i18n-pt.js, ajuda-pt.js; UI in eunomia/app.js, api.js, style.css.

Tech Stack: vanilla JS (no build), jsdom tests in eunomia/test (`cd eunomia/test && npm test`); Node 22, node:test, ajv in eunomia-server (`cd eunomia-server && npm test`).

Spec: docs/superpowers/specs/2026-11-17-eunomia-colegas-design.md

## Global Constraints

- European Portuguese with the Quadro spelling (actividade, objectivo, correcção). No emojis anywhere.
- All UI copy in eunomia/i18n-pt.js or eunomia/ajuda-pt.js; no copy in app.js.
- Vanilla JS, no build step; Node 22, node:test, ajv; no new npm dependency.
- Write routes: CSRF header or JSON body, own drafts only, maxLength, C0 and emoji rejection, personal-data gate (422 motivo `dados_pessoais`, bypass `confirmo_sem_dados_pessoais: true`).
- Own-key headers only on model routes. Logs: method, path, status and ms only.
- Accessibility: headings in order, focus moves to new content, aria-live for status, keyboard reachable.
- Status sentence, verbatim: "A Eunomia é uma ferramenta desenvolvida por Tiago Jacinto (MEDCIDS) como proposta, para testar, melhorar e construir com colegas. Não é uma ferramenta oficial da FMUP. O uso é voluntário."
- What-Tiago-sees text, verbatim: "Tiago Jacinto vê o seu nome, quantos rascunhos tem e em que estado, quantos pedidos faz ao modelo e as opiniões que deixar em «Foi útil?». A Eunomia só lhe mostra o texto de uma actividade depois de a submeter para revisão. A revisão é opcional e não é uma avaliação do seu trabalho."
- No claim about the Quadro's status or any endorsement. Stored ids and the ficha output do not change (except the new area ids and area_outra).
- Version 0.3.0.

## Review Focus

1. An admin opens the URL of another teacher's draft in estado `rascunho` or `plano`: expect 404, also on exportar, verificacao-final and every model route (Task 1 test).
2. The model returns a step with one invalid field (an option id that does not exist, a duracao of "45 min"): the whole step is dropped, the others are kept, no 500 (Task 4 test).
3. The model returns non-JSON or `{}`: the draft is still made with the text in materials and `propostos: []` (Task 4 test).
4. A status-0 failure on POST /rascunhos/adaptar must not be retried (a second draft would appear) (Task 5 test).
5. Area `outra` with an empty area_outra fails validation; with text, the ficha meta "Áreas" shows that text, not "Outra" (Task 2 test).

---

### Task 1: The admin reads another author's draft only after submission

Files:
- Modify: `eunomia-server/src/draft-routes.js` (readable, around line 87)
- Test: `eunomia-server/test/review-routes.test.js` (or a new `eunomia-server/test/colegas.test.js`)

Interfaces:
- Produces: `readable(ctx)` throws 404 NOT_FOUND when `d.autor.id !== ctx.user.id` and `d.estado` is not one of `submetida`, `aprovada`, `devolvida`.

- [ ] Step 1: Failing tests: admin GET /rascunhos/:id of a teacher's draft in estado `rascunho` → 404; same draft after the teacher submits it → 200; after devolver → 200; admin GET exportar?formato=html of an unsubmitted draft → 404; the teacher's own access unchanged; GET /uso still lists the teacher's counts.
- [ ] Step 2: Run `cd eunomia-server && npm test`; the new tests fail.
- [ ] Step 3: Implement in readable(); update the comment at the top of draft-routes.js ("an admin may read any draft") and the header comment of review-routes.js to say "a submitted draft".
- [ ] Step 4: Run the server tests; all pass. Fix any old test that relied on admin reading an unsubmitted draft by submitting it first, and say so in the report.
- [ ] Step 5: Commit `eunomia: the admin reads a draft only after it is submitted`.

### Task 2: More areas and "Outra"

Files:
- Modify: `eunomia/interview.json` (step contexto: area options, new field area_outra)
- Modify: `eunomia-server/src/assemble.js:35`, `eunomia-server/src/drafts.js:317` (area label)
- Modify: `eunomia/app.js` (area label at about lines 557 and 904; any other optionText of area)
- Test: `eunomia-server/test/drafts.test.js`, `eunomia-server/test/ficha.test.js` or assemble test, `eunomia/test/guidance.test.js`

Interfaces:
- Produces: area ids `ciencias_basicas`, `medicina`, `cirurgia`, `saude_publica`, `outra` added after the seven current ones, labels exactly as in spec section 3. Field `area_outra` (tipo texto, max 100, `obrigatorio_se: { campo: 'area', igual: 'outra' }`, rotulo "Qual é a área?").
- Produces: a server helper `areaLabel(contexto) -> string|undefined` in drafts.js (exported), used by assemble.js and the draft summary; the front end has the same rule in one local function `areaText(c)`.

- [ ] Step 1: Failing tests: applyAnswer contexto with area `outra` and no area_outra → error; with area_outra "Farmacologia" → ok and areaLabel returns "Farmacologia"; area `ciencias_basicas` → "Ciências básicas (anatomia, fisiologia, bioquímica, histologia)"; assembled ficha meta.areas for `outra` is the text; filterPatterns with area `cirurgia` still returns patterns (no throw, non-empty for a valid set of answers); front end: the side panel shows the area_outra text.
- [ ] Step 2: Run both test suites; new tests fail.
- [ ] Step 3: Implement. Check the obrigatorio_se syntax already used in interview.json and copy it.
- [ ] Step 4: Both suites pass.
- [ ] Step 5: Commit `eunomia: more areas and Outra`.

### Task 3: Example 7, Anatomia without AI

Files:
- Create: `eunomia-server/referencia/ficha-7.json`
- Modify: `eunomia/exemplos.json`, `eunomia-server/src/exemplos.js` (findExample 1..7), `eunomia/i18n-pt.js` (examples intro: seven examples; six from the training fichas, one written for Eunomia), `eunomia-server/src/draft-routes.js` (GET /exemplos/:n regex already allows 1-99; check)
- Test: `eunomia-server/test/exemplos.test.js`, `eunomia/test/exemplos-ui.test.js`

Interfaces:
- Consumes: area `ciencias_basicas` (Task 2).
- Produces: example n 7: area `ciencias_basicas`, papel `nenhum`, regime `proibido`, evidencia.avaliacao `sumativa`, regime_themis assignment `["report"]` with the policy id that matches `proibido` (read the mapping in eunomia-server/src/regime.js), a catalogue pattern with no AI (`jigsaw` or `discussao_caso`). `nota` on every answer the reader could take as real: UC, year, numbers invented for the example, not one of the six training fichas.

- [ ] Step 1: Failing tests: findExample(7) is not null and findExample(8) is null; draftFromExample(user, 7) has no errors; referenceFicha(7) validates against ficha.schema.json (use the existing validator in ficha.js); GET /exemplos/7 → 200; the examples page lists 7 items.
- [ ] Step 2: Run; fail.
- [ ] Step 3: Write ficha-7.json in the shape of ficha-1.json (read it first). The model-free sections only (regime_ia, referencias, declaracao) come from code in the real flow; copy how ficha-1.json stores them. Keep anatomy content general, first-year level, no clinical claim. Write exemplos.json entry 7 with `porque` for every step.
- [ ] Step 4: Both suites pass (the existing test that every example passes validation now covers 7).
- [ ] Step 5: Commit `eunomia: example 7, an anatomy activity without AI`.

### Task 4: Adapt an activity: server

Files:
- Modify: `eunomia-server/src/prompts.js` (new proposeAnswers), `eunomia-server/src/draft-routes.js` (new route; PUT respostas clears propostos; view includes propostos), `eunomia-server/src/drafts.js` (createDraft 'refinar' sets `propostos: []`; duplicateDraft copies `propostos: []`)
- Test: `eunomia-server/test/colegas.test.js`

Interfaces:
- Produces: `prompts.proposeAnswers(texto: string) -> string`. Lists the steps contexto, objectivo, evidencia, papel_ia, regime with their field ids, types and option ids read from drafts.INTERVIEW (not hard-coded); asks for `{ "respostas": { "<passo>": { "<campo>": valor } } }`; says: copy only what the text states, leave out the rest, invent nothing, no personal data; ends with RULES. Uses block() and the MAX_MATERIALS cut like materialsBlock.
- Produces: `POST /rascunhos/adaptar` body `{ texto, confirmo_sem_dados_pessoais? }` → 201 `{ ...view(draft), propostos: string[] }`. Order: texto required string (400 "Cole o texto da actividade."), max 60000 (400), checkText (C0 400, emoji 422), personalDataGate([texto]), checkRoom, askOnce(ctx, prompts.proposeAnswers(texto)) inside a try that keeps model errors as today (askOnce errors propagate: 401/429/502 unchanged), then createDraft(user, 'refinar'), apply materiais {texto}, then each of the five steps in interview order with applyAnswer; a step whose value is not a plain object or returns errors is skipped; `propostos` lists the applied steps. Register this route before any `/rascunhos/:id` POST route if the router matches in order.
- Produces: PUT /rascunhos/:id/respostas/:passo removes `passo` from `d.propostos` when present.
- Produces: the model route list for own-key headers on the server side, if there is one, includes adaptar (check how sugerir gets creds; askOnce handles it).

- [ ] Step 1: Failing tests with the mock iaedu: (a) model returns valid contexto and papel_ia → 201, modo 'refinar', propostos ['contexto','papel_ia'], respostas.materiais.texto equals the input; (b) model returns contexto with duracao_min "45 min" and a valid objectivo → propostos ['objectivo']; (c) model returns "não sei" (non-JSON) → 201, propostos [] (if parseJsonReply throws today, catch only that parse error here); (d) texto with "Utente SNS 123456789" → 422 dados_pessoais, no draft written, and with confirmo → 201; (e) no texto → 400; 60001 chars → 400; (f) the 101st draft → 409 limite and the model is not called; (g) PUT respostas/contexto on that draft → propostos no longer has contexto; (h) a request without X-Eunomia and without JSON content type → refused as other POSTs; (i) the log line of the request has no text.
- [ ] Step 2: Run; fail.
- [ ] Step 3: Implement.
- [ ] Step 4: Server suite passes.
- [ ] Step 5: Commit `eunomia: adapt an existing activity (server)`.

### Task 5: Adapt an activity: front end

Files:
- Modify: `eunomia/api.js` (MODEL_ROUTE adds `^/rascunhos/adaptar$`; a separate RETRY_ROUTE without it), `eunomia/app.js` (route #/adaptar; home button; interview note and per-step mark), `eunomia/i18n-pt.js` (copy), `eunomia/style.css` (only if needed)
- Test: `eunomia/test/colegas-ui.test.js` (new), `eunomia/test/ui.test.js` if api tests live there

Interfaces:
- Consumes: POST /rascunhos/adaptar and `propostos` (Task 4).
- Produces: i18n keys under `S.adaptar`: pagina, titulo, intro, campo, aviso (data rule), botao "Propor respostas", aProcessar, erro (says to check "Os meus rascunhos" before trying again), notaPreenchido(n), notaVazio, marca "Proposto a partir do seu texto". Home key `S.inicio.adaptar` "Adaptar uma actividade que já faço".

- [ ] Step 1: Failing tests: #/adaptar renders an h1, a labelled textarea and the button; submitting calls POST /rascunhos/adaptar with JSON `{ texto }` and then navigates to the draft's first step; a 422 dados_pessoais shows the findings and the confirm checkbox as the materials step does, and resubmits with confirmo; a status-0 failure on adaptar is NOT retried (fetch called once) while a status-0 on objectivo/sugerir is still retried once; own-key headers are sent on adaptar; the interview shows notaPreenchido(2) when propostos has 2 steps, and the mark on a proposed step disappears after saving it; focus moves to the h1 of the new page.
- [ ] Step 2: Run `cd eunomia/test && npm test`; fail.
- [ ] Step 3: Implement. Reuse the existing personal-data confirm UI of the materials step; do not copy it.
- [ ] Step 4: Suite passes.
- [ ] Step 5: Commit `eunomia: adapt an existing activity (front end)`.

### Task 6: Entry routes, status, what Tiago sees, invitation

Files:
- Modify: `eunomia/app.js` (home cards, login lines, first-visit box line, footer status, convite call adds `themis`), `eunomia/i18n-pt.js`, `eunomia/style.css`
- Test: `eunomia/test/colegas-ui.test.js`, `eunomia/test/ui.test.js`

Interfaces:
- Consumes: S.inicio.adaptar and #/adaptar (Task 5).
- Produces: i18n keys `S.app.estado` (status sentence, verbatim from Global Constraints), `S.app.oQueVe` (what-Tiago-sees text, verbatim), `S.inicio.cartaRegra` {titulo "Preparar a regra de IA para um trabalho avaliado", texto, link}, `S.inicio.cartaActividade` {titulo "Desenhar ou adaptar uma actividade", texto (includes that an activity without AI is a valid result), exemplo "Começar a partir de um exemplo"}, `S.entrar.themis` (one line with the Themis link). The Themis URL is `../themis/` relative to the app; the invitation gets the absolute URL built like `app`.

- [ ] Step 1: Failing tests: home shows two cards with headings, the regra card links to ../themis/, the actividade card has the buttons Nova actividade and Adaptar and the exemplos link; login page shows S.app.estado and the Themis line; the login data notice contains S.app.oQueVe (replacing the old last sentence of avisoServidor that names Tiago); the first-visit box contains S.app.oQueVe; footer shows S.app.estado; the invitation text contains the status sentence, the Themis absolute URL, the words "sem IA", and has fewer than 200 words; the cards stack at 400 px (no horizontal overflow) if the harness can test layout, else a CSS rule check.
- [ ] Step 2: Run; fail.
- [ ] Step 3: Implement. Invitation order and content as spec section 1.
- [ ] Step 4: Suite passes.
- [ ] Step 5: Commit `eunomia: two entry routes, status, what Tiago sees, new invitation`.

### Task 7: Plain labels, gentler tips, help

Files:
- Modify: `eunomia/interview.json` (step titles, field labels and help, erros_comuns rewritten as advice), `eunomia/i18n-pt.js` (`S.passo.errosComuns` → "Dicas"; verb messages), `eunomia-server/src/drafts.js:214` (verb aviso wording), `eunomia/ajuda-pt.js`
- Test: `eunomia/test/content.test.js`, `eunomia/test/ajuda.test.js`, server tests that assert the old strings

Interfaces:
- Produces: titles and labels exactly as the table in spec section 4. Verb aviso: "Experimente começar o objectivo por um verbo que se observa, como identificar, explicar ou justificar. Pode manter o seu texto." `S.passo.verboFalta`: "Sem um verbo que se observe.".
- Produces in ajuda-pt.js: oQueE gets the status sentence and one sentence that an activity without AI is a valid result; antes gets the Themis route line and explains IAedu on first mention (spec 4); etapas.entrevista mentions the adapt start; FAQ entries "O que vê o Tiago Jacinto?" (the what-Tiago-sees text) and "Posso partir de uma actividade que já faço?" (the adapt flow, the model proposes, the teacher reviews every step, the text goes to IAedu and stays as the materials); the glossary adds the common-words title next to papel, regime, padrão, competência protegida and cláusula.

- [ ] Step 1: Failing tests: content test asserts the five titles/labels from the table; no erros_comuns item contains "compreender"; every erros_comuns item starts with a verb in the imperative or a positive form (assert none starts with "Não " and none with "Usar compreender"); "Dicas" is the summary text; the help has the two new FAQ questions and the status sentence; the existing glossary test still passes.
- [ ] Step 2: Run both suites; fail.
- [ ] Step 3: Rewrite. Keep 2 to 4 items per step. Update old tests that assert old strings.
- [ ] Step 4: Both suites pass.
- [ ] Step 5: Commit `eunomia: plain labels, tips in place of common errors, help for colleagues`.

### Task 8: Version 0.3.0

Files:
- Modify: `_variables.yml` (eunomia.versao 0.3.0), then run the repo's sync-versions script (find it: `ls scripts/ | grep sync`) which sets eunomia-server/package.json and package-lock.json; `eunomia-server/README.md` (the adapt route and the admin read rule).

- [ ] Step 1: Set the version and run sync-versions; check it reports consistency.
- [ ] Step 2: Run both suites and the Themis tests (`ls themis/test` or the command in the README); all pass.
- [ ] Step 3: Commit `eunomia: version 0.3.0`.
