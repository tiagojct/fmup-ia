# Eunomia: activity design assistant for FMUP teachers

Date: 2026-11-14. Status: design for approval. Owner: Tiago Jacinto.

Eunomia is the second tool of FMUP · IA, next to Themis. In the myth, Eunomia ("good order") is a daughter of Themis.

## 1. Intent

MEDCIDS teachers need help to refine their activities and exercises and to create new ones. The courses are in seven areas: primary care, bioethics, palliative care, medical and health informatics, digital health, artificial intelligence, and health technology assessment (HTA). Most colleagues are not technical. They do not have the time to learn instructional design frameworks.

Eunomia guides a teacher through a short design conversation. The result is an activity sheet (ficha) with the same structure as the six fichas in `training/fichas/`. The Quadro is the base: its principles, disciplinary profiles (Annex I), clause model and traffic-light regime (Annex B), and the rules in `themis/policy.json`.

A colleague can download the ficha, or submit it to a shared library. Tiago reviews each submission. An approved ficha is published on the fmup-ia site.

The Wharton Primer project (https://gail.wharton.upenn.edu/primer/) is the prior art. Eunomia keeps its main ideas: a guided interview with the teacher, a design that the teacher reads and approves, and the AI as an assistant to the teacher's expertise. Eunomia differs in four ways:

- Its output is any activity, not only AI simulations.
- It applies the FMUP rules.
- It writes European Portuguese.
- It runs on IAedu, the FCT/FCCN institutional platform.

### Stages

1. Stage 1 (this design): the design assistant and the reviewed library. Students do not use Eunomia. When an activity needs an AI counterpart, the ficha includes an IAedu base prompt that the teacher pastes into IAedu.
2. Stage 3 (later, not in this design): a runtime for the activity types that need a controlled AI counterpart (hidden facts, leak checks, rubric scoring). The runtime grows from `teaching/schoolmaster`. Stage 1 must not block it (see 6.12).

## 2. Users

- Teacher (colleague). Gets an access code from Tiago. Creates, refines, downloads and submits fichas.
- Reviewer and administrator (Tiago). Issues access codes, reviews submissions, approves, returns or rejects them.
- Reader (anyone). Reads the published library on the fmup-ia site. No login.

## 3. Goals, non-goals, anti-goals

Goals:

- A colleague with no help produces a usable ficha in about 30 minutes.
- Each question in the interview tells the teacher why it is asked, with a link to the relevant Quadro section.
- Refine mode improves an existing activity. Create mode makes a new one.
- Each ficha states the AI regime of the activity (permitted, conditioned or forbidden) and the matching clause text.
- The library grows only through Tiago's review.
- The six existing fichas, converted to JSON, pass the schema in its reference profile (6.8). They are the acceptance fixtures for the format. The published training fichas are not edited.

Non-goals for stage 1:

- Students do not log in or play activities in Eunomia.
- No U.Porto single sign-on.
- No LMS (Moodle, Sigarra) integration.
- No voice and no images.
- No English interface.

Anti-goals (a failure even if the software works):

- The model writes the whole ficha and the teacher only clicks "accept". The teacher must decide the learning outcome, the activity pattern and the assessment.
- Invented references, invented study results or invented statistics appear in a ficha.
- Brazilian Portuguese forms, or a spelling that differs from the Quadro.
- Patient data or student data goes to IAedu.
- Colleagues need technical setup to start (in the shared mode).

## 4. Constraints

### 4.1 IAedu API (tested on 2026-11-14)

The API format is observed, not officially documented. docs.iaedu.pt did not respond during the research. Facts from the tests:

- Endpoint: `POST https://api.iaedu.pt/agent-chat/api/v1/agent/{agent_id}/stream`. The portal shows a double slash (`agent-chat//api`). Both forms work.
- Auth: header `x-api-key`. The key has the form `sk-usr-...`. Each agent has its own key: the AMALIA agent and the GPT-4o agent of the same user have different keys. The portal shows the key, the agent ID and the channel ID under "Uso da API do Chatbot".
- Body: `multipart/form-data` with `channel_id`, `thread_id`, `user_info` (required, `"{}"`), `message`. Optional fields: `user_id`, `user_context` (a JSON object), `image`. Do not set the Content-Type header by hand. Let the HTTP client set the boundary.
- Response: one JSON object per line. Types: `start`, `token` (text delta in `content`), `message` (`content.response_metadata.model_name`), `done`, `error` (`content: "Unexpected error"`).
- Threads keep the history on the server. Reuse `thread_id` to continue a conversation.
- IAedu wraps each message in a template: `current date/time: {{ current_time }} / user you're talking to: {{ user_context.name }}. {question}`. `user_context` fills this template. It is not an instruction channel: the model ignored rules sent in it. All instructions go inside `message`.
- `user_context` sent as a plain string causes `"Unexpected error"`. Send it as a JSON object, or do not send it.
- Models: the GPT-4o agent answered as `gpt-4o-2024-11-20` in 1.5 to 3 s. The AMALIA agent answered as `amalia-llm/amalia-v1.0` in 2 to 5 s.
- GPT-4o followed counts and returned valid JSON, inside a ```json fence. It did not follow "one question at a time". It wrote "pacientes" and mixed "objetivo" with "objectivo".
- AMALIA followed the one-question rule. It ignored the number of items, mixed spellings, used "alunos", and invented today's weather.
- CORS: a POST returns `access-control-allow-origin: *`, but the preflight `OPTIONS` returns 404. A browser cannot send `x-api-key` directly. All calls go through the Eunomia server.
- Rate limits, quotas, key regeneration and terms of use for a shared key are not documented.
- The content tests ran from the Mac. From Rokovoko, a POST without a key returned 401 in 0.12 s, so the server can reach the API. Run one call with a key from the server before the pilot.

### 4.2 Other constraints

- Language: European Portuguese only. Spelling follows the Quadro and the fichas: the pre-1990 forms used there ("actividade", "objectivo", "correcção", "directamente"). Use "estudantes" (not "alunos") and "doentes" (not "pacientes"). All activity examples are fictional.
- Data: no patient data, no student data. Teachers' drafts are the only personal content (name and text).
- Hosting: Rokovoko. Static files in `/opt/vps/caddy/srv/fmup-ia` (rsync from CI). Apps in `/opt/vps/apps/<app>`, image from GHCR, pulled by quarterdeck-pull. Request path: Cloudflare, tunnel, Caddy, container. See `powerslave/systems/rokovoko.md`.
- Secrets: GitHub repository secrets or files outside the repo. Never in the repo, the vault or the image.
- The front end follows Themis: vanilla JavaScript, no build step, local fonts, same style tokens.

## 5. Approaches considered

1. Static front end next to Themis, with a small server on Rokovoko. Chosen. The front end lives in fmup-ia and shares policy.json and the look of Themis. A small Node server holds the IAedu key, runs the interview steps, validates each section, stores drafts and submissions, and commits approved fichas to fmup-ia. The library stays as text files in the repo.
2. A full Next.js application, like teaching-lab. Rejected. It has accounts and a database from the start, but it is much more code, it is separate from Themis, and it stores the fichas in a database instead of files.
3. An extension of the schoolmaster server. Rejected for stage 1. It reuses the validation engine, but schoolmaster was never deployed and is built on pi and GPT-OSS. Stage 1 would wait for it. Approved fichas can feed schoolmaster in stage 3.

Tiago chose approach 1, the name Eunomia, and access codes per colleague on 2026-11-14.

## 6. Design

### 6.1 Layout

- `fmup-ia/eunomia/`: the static front end (`index.html`, `app.js`, `style.css`, data files). Add it to the `resources` of `_quarto.yml` as Themis is. Public URL: `https://tiagojacinto.eu/fmup-ia/eunomia/`.
- `fmup-ia/eunomia-server/`: Node 22 server, `Dockerfile`, tests. Exclude it from the Quarto render and from the site output.
- `fmup-ia/biblioteca/`: the published library. One `.qmd` per approved ficha and a Quarto listing page `index.qmd`.
- API path: `https://tiagojacinto.eu/fmup-ia/eunomia/api/`. The front end and the API have the same origin, so CORS does not apply. Add a path route in the tiagojacinto.eu Caddy snippet (`handle_path /fmup-ia/eunomia/api/*`, `reverse_proxy eunomia:<port>`). The route must come before the static file handler of the site. The `d3-feedback` and `mais-assistente` apps already use path routes on this host. Copy their pattern.
- Image `ghcr.io/tiagojct/eunomia`, tags `latest` and the commit SHA, with the label `org.opencontainers.image.revision`. Compose in `/opt/vps/apps/eunomia` with a `.quarterdeck-pull` marker, the external network `proxy`, and no published host port. Data in a bind-mounted `data/` folder, which the nightly restic backup already covers (`/opt/vps/apps`).
- CI: the existing `publish.yml` runs the Eunomia tests too. A new workflow builds and pushes the image when `eunomia-server/` changes.

### 6.2 Access

- Tiago runs an admin command on the server (`docker exec eunomia node bin/codes.js add "<name>"`). It prints a one-time access code. The server stores only a hash of the code, with the name and the role (`teacher` or `admin`).
- Login with the code sets a signed, httpOnly, Secure cookie, valid for 12 hours. The code stays valid until Tiago revokes it.
- Limits per code: login attempts, requests per minute, and model calls per day (default 200; configurable).
- The colleague's name appears as the author of each ficha.

### 6.3 Model access: two key modes

- Shared mode (default). The server reads `IAEDU_API_KEY`, `IAEDU_AGENT_ID` and `IAEDU_CHANNEL_ID` from its `.env` (owner 1000:1000, not in git). A second set (`IAEDU_ALT_*`) configures the AMALIA agent as an alternative.
- Own-key mode. In the settings page, a teacher enters their own key, agent ID and channel ID. The browser keeps them in memory, or in localStorage only if the teacher ticks "lembrar neste computador". The browser sends them to the server in request headers with each call. The server uses them for that call only, never stores them, and never logs them. The server removes these headers from all logs and error reports.
- One adapter in the server, `iaedu.js`. It builds the multipart body, reads the NDJSON stream, joins the tokens, strips a ```json fence, parses JSON when the task needs it, and maps errors (401 wrong key, 429 limit, `type: error`, time-out) to short messages in Portuguese. The adapter has one interface, so another provider can replace IAedu later.
- Each draft has one IAedu thread per generation step. A step does not depend on the server's thread memory: each request carries everything the step needs. If the thread is lost, the step still works.
- Default model: GPT-4o. The model name from `response_metadata` is stored with each generated section.

### 6.4 Principle: the code leads, the model writes

Section 4.1 shows that neither model follows a long procedure reliably. So:

- The code runs the interview. The questions, their order and the conditions are data (`eunomia/interview.json`), not model output.
- The model does bounded tasks: rephrase or sharpen a learning outcome, propose activity patterns from a given list, write one section from a given schema, review an existing activity against a checklist.
- Every model output goes through code validation (6.8). On failure, the server retries once with the list of errors. On a second failure, the teacher sees the text with the warnings and edits it.
- The model never decides the AI regime, the risk level or the references.

### 6.5 Create mode

1. Context. Curricular unit (free text, with a list of MEDCIDS UCs as suggestions), programme and year, area (one of the seven), number of students, setting (in class, autonomous, mixed), duration. Annex I (disciplinary profiles) enters here as guidance only: when the area matches a profile (bioethics, health informatics; data science for the AI area), the later steps show that profile's text on evidence and assessment design in the "porquê" box. Profiles do not constrain answers. Areas with no profile (primary care, palliative care, digital health, HTA) show none until Tiago writes them, through the process in "Como propor novos perfis" of Annex I. (Builder's call, marked for Tiago's check.)
2. Learning outcome. The teacher writes it. The model proposes up to two sharper versions with an observable verb. The code checks for a verb from a Portuguese list of observable verbs (Bloom). The teacher picks or keeps their own. Then the teacher states the protected competence: what the student must do without help. The fichas name this explicitly ("A competência protegida é...").
3. Evidence and assessment. How the teacher will know the outcome is reached. Formative or summative.
4. Role of AI. None, counterpart (AI plays a role), tool (students use AI), or object of critique (students judge AI output). The answer sets the AI regime question next.
5. AI regime of the activity (Tiago's decision, 2026-11-14). The regime covers what students may do with AI during this activity. The teacher picks permitted, conditioned (with the conditions in free text) or forbidden. The traffic light appears as text ("verde: permitido", "amarelo: permitido com condições", "vermelho: proibido"), never as an emoji. If the activity is assessed (step 3), one extra short step asks the Themis teacher fields that apply: the type of submitted work and the policy. Eunomia then builds the Themis clause and its warnings from `themis/policy.json` with the same rules as the Themis teacher branch. Reuse the Themis rule function. If it is not separable, move it to a shared module that both tools load. Do not copy it. For a formative activity, no Themis clause is built.
6. Pattern. Eunomia proposes two or three patterns from the catalogue (6.7), filtered by the code from steps 1 to 5. The model explains in two sentences why each pattern fits this outcome. The teacher picks one.
7. Materials (optional). The teacher pastes text or uploads `.md`, `.txt` or `.docx` (text only). A notice says: no patient data and no student data. Text above a size limit is cut, with a warning.
8. Plan. The code shows a one-page summary of steps 1 to 7. The teacher edits it and approves it before any section is written. This is the design gate.
9. Sections. The model writes the sections one at a time, in the ficha order. The teacher edits each one, asks for a new version with a comment, or accepts it. A change to the plan marks the dependent sections as "to update".
10. Preview and output. A rendered preview in the ficha style. Downloads: `.qmd` (fmup-ia format), `.md`, and a printable HTML page. Then "Submeter à biblioteca" (6.9).

Each step shows one or two lines of "porquê esta pergunta", with a link to the relevant Quadro section or framework. This is the guidance for colleagues. The text is data in `interview.json`.

### 6.6 Refine mode

1. The teacher pastes or uploads an existing activity.
2. The model maps it to the ficha schema as JSON. Missing parts stay empty. They are not invented.
3. The code runs the checklist: the outcome has an observable verb; the protected competence is stated; the evidence matches the outcome; the roles are clear; the activity has a debrief or discussion; it has pitfalls; it has a plan B when it needs the internet; the AI regime is stated; the references are known (6.8).
4. The model comments on alignment between outcome, task and evidence, in at most five points, each tied to a section.
5. The teacher sees the gaps and comments. The teacher accepts or rejects each proposed change. Then the flow continues at Create step 8, with the plan prefilled.

A published library ficha can also be the start of refine mode ("Usar como ponto de partida"). Eunomia loads it from the JSON in its front matter (6.10).

### 6.7 Pattern catalogue

`eunomia/patterns.json`. Each pattern has: id, name, mechanism (what the interlocutor or the task does), protected competence, when it fits, when it does not fit, the AI role it needs, typical duration, typical group format, a link to an example ficha, and known pitfalls.

Initial content:

- The six fichas, as mechanisms: restricted interlocutor (ficha 1), output critique with planted errors (2), student as marker (3), devil's advocate (4), do and compare (5), restricted tutor (6).
- Patterns without AI: structured case discussion, roleplay between students with an observer grid, structured appraisal with a checklist (for HTA), debate with assigned positions, jigsaw, and a guided data exercise.

Tiago owns this file. The builder writes a first version from the fichas and marks every non-ficha pattern as "rascunho" for Tiago to review.

### 6.8 Ficha schema and validation

The ficha is JSON with a JSON Schema (`eunomia/ficha.schema.json`). It renders to `.qmd`. Sections, in the order of the existing fichas:

- `meta`: title, subtitle, Competência, Formato, Duração, Ano sugerido, Áreas, Ferramenta (the `.ficha-meta` table).
- `objectivo`: Objectivo de aprendizagem, including the protected competence.
- `formato`: Formato e duração em aula, as timed blocks whose total equals the duration.
- `prompt_base`: Prompt base, only when AI has a role. A text block the teacher pastes into IAedu, with optional "Variantes por área".
- `extras`: zero or more free sections with a title (for example "Verificação obrigatória antes da aula").
- `papeis`: Papéis (student, teacher).
- `correccao`: Como se corrige ou discute.
- `armadilhas`: Armadilhas conhecidas, three to six items.
- `plano_b`: Plano B sem ligação à internet, required when the activity needs the internet.
- `regime_ia`: new section, written by the code from the interview, not by the model. It has three parts: the role of AI in the activity (none, counterpart, tool, object of critique; with "Esta actividade não usa IA." for none); the regime for students during the activity, as text with its conditions; and, only for an assessed activity, the Themis clause and its policy warnings.
- `referencias`: Referência. Entries come only from `eunomia/references.json` (the curated list from the fichas and `quadro/references.bib`) or are typed by the teacher. Entries typed by the teacher get the flag "a verificar na revisão". The model never writes a reference.
- `declaracao`: new section. A short AI-use declaration for the material, as Quadro chapter 4 recommends: the tool and model used, and the author who reviewed it.

Section rules that follow the existing fichas:

- `formato`: the duration may be a range ("30 a 45 minutos"). The total of the timed blocks must fall inside the range. Timed blocks are optional when the activity has no fixed sequence (ficha 6).
- `extras`: each extra section has a position (before `objectivo`, or after a named section), because ficha 6 has a callout before the objective.
- `plano_b`: may state that no plan B exists, with a reason (ficha 6).

Two profiles of the schema:

- New profile: for fichas made in Eunomia. `regime_ia` and `declaracao` are required.
- Reference profile: for the six training fichas and other fichas written before Eunomia. `regime_ia` and `declaracao` are optional.

Validation in code. The schema checks apply to every ficha. The lints apply only to text the model generated, not to text the teacher wrote or to the fixtures:

- JSON Schema: required fields, types, counts.
- Language lint. A list of Brazilian forms and of forms against the Quadro spelling, with the suggested replacement: "objetivo" becomes "objectivo", "aluno" becomes "estudante", "paciente" becomes "doente", "você" is flagged, "tela" becomes "ecrã". The builder writes the list from the fmup-ia text and the schoolmaster pt-PT lint, if that one is reusable.
- Style lint: no emojis. Generated text follows the house style of the fichas: bold time labels in `formato` ("**5 min.**") and a bold lead-in phrase per item in `armadilhas` are allowed. Other bold at the start of list items is flagged.
- References: no DOI, PMID or author-year citation in the generated text unless it is in `referencias`.
- Numbers: in generated text, flag percentages and statistics that are not in the teacher's materials. Do not block them. The teacher confirms them.

The six existing fichas, converted to JSON, must pass the schema and the lints. Use them as fixtures.

### 6.9 Submission and review

States: `rascunho`, `submetida`, `devolvida`, `aprovada`, `rejeitada`, `substituida`.

- At submission, the teacher confirms three statements: the ficha is published under CC BY 4.0, as the rest of the fmup-ia site; the teacher has the right to publish any material included in it; and the teacher's name is published as author. (Builder's call, marked for Tiago's check.)
- A ficha that started from a published library ficha has a `derived_from` field (slug and author of the source). The published page credits the source ("Adaptada de ..."). Refine mode from the teacher's own material has no such field.
- The teacher submits a ficha. It becomes `submetida` and is locked.
- Tiago sees a queue in the admin view (`#/revisao`). For each submission he sees the ficha, the lint warnings, the flagged references and numbers, and the difference from the previous version if one exists.
- Return: Tiago writes comments per section. The teacher sees them, edits, and submits again. The version increases.
- Reject: with a reason.
- Approve: the server renders the `.qmd` and commits it to `fmup-ia` on `main` as `biblioteca/<slug>.qmd` through the GitHub contents API. The token is a fine-grained token with contents write on `tiagojct/fmup-ia` only, in the server `.env`. The commit message is `biblioteca: add <slug> (<author>)`, with Tiago's git identity and no AI co-author line. The existing publish workflow publishes the site.
- A new version of an approved ficha replaces the file and marks the old version `substituida` in the server records. Git keeps the history.
- Email notifications are out of scope. The teacher sees the state when they log in.

### 6.10 Library

- `biblioteca/index.qmd` is a Quarto listing with filters by area, pattern and AI regime.
- Each `.qmd` carries the ficha JSON in its front matter (`eunomia:` key), the author, the reviewer, the approval date and the version. The body is the rendered ficha.
- The Eunomia front end links to the library. It can load a published ficha into refine mode from the front matter. The server reads the published site, not the repo.
- The six training fichas stay where they are. The library index lists them too, as "fichas de referência".

### 6.11 Front end

- Same tokens, fonts and components as Themis. The header links back to the Quadro.
- Pages: login, home (my drafts, my submissions, new, refine), the interview (one step per screen, with a progress bar), the plan, the section editor (one section at a time, with the text, the warnings, and the buttons accept, new version and edit), the preview, settings (key mode), and the admin pages (codes, review queue).
- The drafts are saved on the server after each step. A teacher can stop and continue later.
- Accessibility: keyboard use, labels, focus states, and contrast as in Themis. Test with the same jsdom setup.

### 6.12 Data kept and privacy

- Server files in `data/`: `codes.json` (hashes, names, roles), `drafts/<code-id>/<draft-id>.json`, `submissions/<id>.json`, `usage.json` (model calls per code and day).
- No key in own-key mode is stored. The logs do not contain the text of drafts.
- A notice on the login page says what goes to IAedu (FCT/FCCN), what the server keeps, and for how long. Drafts that nobody has opened for 12 months are deleted. Tiago can change this period.
- Stage 3 hook: the schema has an optional `runtime` object (empty in stage 1). Later, schoolmaster can read approved fichas with a runtime case.

### 6.13 Tests

- Server, with the Node test runner:
  - the IAedu adapter against a mock NDJSON server (tokens, the message event, errors, the fence, 401, 429, time-out);
  - the interview state machine;
  - the design gate (no section is written before the plan is approved);
  - schema validation and the lints on the six ficha fixtures;
  - the reference rule;
  - access codes and limits;
  - removal of the key headers from logs;
  - the review states;
  - the commit call against a mock GitHub API.
- Front end: jsdom tests, as in `themis/test`.
- End to end: one full create flow and one refine flow, with a deterministic mock model.
- Manual: one create flow with the real IAedu GPT-4o agent and one with AMALIA, before the first colleague uses the tool. Record the results in the test report.
- Acceptance: two fichas from different areas, made through the interface without code changes. Suggested: a bioethics roleplay without AI and an HTA appraisal with the output-critique pattern.

## 7. Left to the builder

- The internal module layout of the server and of the front end, and the HTTP framework (none, or a minimal one).
- The exact wording of the interview questions and the "porquê" texts. Tiago reviews them before release.
- The first version of `patterns.json` (6.7) and of the lint lists (6.8).
- How to share the Themis rule function (6.5, step 5), with the condition that the two tools never disagree.
- The prompt text for each model task, within the rules in 6.4.
- The layout of the admin pages.

## 8. Open items and risks

- FCCN terms: Tiago must confirm with IAedu/FCCN that one key may serve several teachers in the shared mode. Until then, the shared mode is for Tiago and a small pilot group. Own-key mode has no such problem.
- The API format is observed, not documented. Keep the adapter small and tested, so that a change costs one file.
- The keys shown on 2026-11-14 were pasted in a chat log. Regenerate them if the portal allows it.
- Quotas are unknown. The per-code daily limit protects the shared key.
- GPT-4o may change or go away. The model name is stored with each section, and the adapter allows another agent.
- The pattern catalogue and the lint lists decide most of the quality. They need Tiago's review before the pilot.
