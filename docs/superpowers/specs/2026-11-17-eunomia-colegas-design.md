# Eunomia 0.3: for reluctant colleagues

Status: approved by the user on 2026-11-17 ("aplica 1-9", then "sim, avança com tudo").
Base: Eunomia 0.2.0 on main (28e1d5c), specs 2026-11-14-eunomia-design.md and
2026-11-16-eunomia-ajuda-design.md.

## Intent

A role-play of a reluctant teacher with little AI literacy found nine problems. The teacher gets the
email and reads "design an activity with AI", but their real problem is students who use ChatGPT in
graded work. The area list has only the seven MEDCIDS areas. The labels use the Quadro's terms
(regime, papel, contraparte, competência protegida). All six examples use AI. Nothing lets the
teacher start from an activity they already run. The "Erros comuns" boxes lecture. Nothing on the
first screen says what Tiago sees, or whether the tool is official.

Status of the tool, from Tiago: for now, Eunomia is a tool that Tiago Jacinto developed as a
proposal, to test and improve it and to build it with colleagues. It is not an official FMUP tool.
Using it is voluntary.

Success: a teacher from any FMUP area who does not want AI in class opens the email, sees within one
screen that (a) Eunomia is for them too, (b) "no AI" is a valid result, (c) there is a 5-minute route
to the AI rule for a graded assignment, and (d) what Tiago can and cannot see. They can then start
from their own activity text.

Anti-goals: any claim on screen that the code does not make true; the model taking a decision for
the teacher; any weakening of the 0.1 and 0.2 security rules; a second copy of the Themis clause
logic inside Eunomia.

## Approaches considered (the user approved the picks)

- Short route (point 2): (a) a card that opens the Themis, which already writes the clause in about
  5 minutes without a code (chosen); (b) a "clause only" draft mode inside Eunomia. Rejected:
  duplicates the Themis.
- Adapt an existing activity (point 6): (a) the model reads the pasted text and proposes interview
  answers; the server validates each step; the teacher reviews every step (chosen); (b) the 0.1
  design: map the text straight to the ficha sections (prompts.mapExisting). Rejected: it skips the
  interview, so the decisions are the model's. mapExisting stays unused.

## Scope

### 1. Invitation

Rewrite `S.codigos.convite` (i18n-pt.js). Order: the teacher's problem first ("Os seus estudantes
usam IA nos trabalhos?"); the two routes (the AI rule for a graded assignment in about 5 minutes,
with the Themis link, no code needed; an activity in about 45 minutes, which can be an activity
without AI); the status sentence (section 9); the link, the code, the help and the examples; the data
rule; the contact. The function gets `c.themis` (absolute URL of ../themis/) in addition to the
current fields. Under 200 words.

### 2. Two entry routes

- Home page (logged in): above "Os meus rascunhos", two cards side by side (stacked on narrow
  screens):
  - "Preparar a regra de IA para um trabalho avaliado": one line ("Cerca de 5 minutos, na Themis, a
    outra ferramenta do FMUP · IA. Não guarda nada.") and a link to ../themis/.
  - "Desenhar ou adaptar uma actividade": the buttons "Nova actividade", "Adaptar uma actividade que
    já faço" (section 6) and the link "Começar a partir de um exemplo" (#/exemplos).
- The login page and the help ("Antes de começar") say the same in one line each, with the Themis
  link.
- "Sem IA" is a valid result: one sentence on the home card and in the help "O que é a Eunomia".

### 3. Areas

- `contexto.area` options, in this order: the seven current ones, then `ciencias_basicas` "Ciências
  básicas (anatomia, fisiologia, bioquímica, histologia)", `medicina` "Medicina e especialidades
  médicas", `cirurgia` "Cirurgia e especialidades cirúrgicas", `saude_publica` "Saúde pública e
  epidemiologia", `outra` "Outra".
- New field `area_outra` (texto, max 100), required when area is `outra` (obrigatorio_se). Where the
  area label is shown or written (ficha meta areas, the side panel, the example list, the draft
  summary), `outra` shows the text of `area_outra`.
- The new areas have no Anexo I profile (porque_area) and no pattern lists them. Patterns with an
  empty area list keep scoring as today. No new pattern.

### 4. Plain labels

The step titles and field labels say what is asked in common words, with the Quadro term in
parentheses. The ficha output and the stored ids do not change.

| where | today | 0.3 |
|---|---|---|
| step papel_ia | Papel da IA | O que a IA faz nesta actividade (papel da IA) |
| step regime | Regime de IA para os estudantes | O que os estudantes podem fazer com IA (regime de IA) |
| step regime_themis | Cláusula para a avaliação | A regra de IA no enunciado da avaliação (cláusula) |
| step padrao | Padrão de actividade | A forma da actividade (padrão) |
| field competencia_protegida | Competência protegida | O que o estudante tem de fazer sem ajuda (competência protegida) |

- Each option of papel and regime keeps its label; the help line under the field explains it in
  one sentence of common words.
- First mention of IAedu on a page explains it ("o serviço de IA da FCT/FCCN para o ensino superior;
  não precisa de conta: a Eunomia usa a chave da FMUP"). First mention of Themis explains it ("a
  outra ferramenta do FMUP · IA, que escreve a regra de IA para o enunciado de um trabalho").
- The glossary keeps the Quadro terms and adds the common-words title of each step.

### 5. Example 7: Anatomia, no AI

- New example n = 7 in exemplos.json and a new reference ficha eunomia-server/referencia/ficha-7.json
  (valid against ficha.schema.json). Area `ciencias_basicas`, papel `nenhum`, regime `proibido`,
  evaluation `sumativa` with a report (assignment `report`) and the policy that matches `proibido`,
  so the walk-through shows the Themis clause. Pattern from the catalogue that has no AI (for
  example `jigsaw` or `discussao_caso`).
- Fictitious and marked: `nota` says that the UC, the year and the numbers are invented for the
  example, and that it is not one of the six training fichas. The anatomy content stays general
  (structures named at the level of a first-year course); no clinical claim.
- findExample accepts 1 to 7. The examples page says seven examples; the intro no longer says "uma
  por cada ficha de formação" for all of them.
- The answers pass the server validation (the existing test covers every example).

### 6. Adapt an activity the teacher already runs

- Home: "Adaptar uma actividade que já faço" opens #/adaptar: a page with one textarea ("Cole o
  enunciado ou a descrição da actividade"), the data rule, and the button "Propor respostas".
- `POST /rascunhos/adaptar` with `{ texto, confirmo_sem_dados_pessoais? }`. texto required, max
  60 000 characters, C0 and emoji rules, personal-data gate (422 dados_pessoais as for materials).
  checkRoom (cap of 100 drafts). Model route: own-key headers, daily limit, askOnce.
- New prompt `prompts.proposeAnswers(texto)`: the interview steps contexto, objectivo, evidencia,
  papel_ia and regime, with their field ids and option ids; copy only what the text states, leave
  out the rest, invent nothing. Answer shape `{ "respostas": { "<passo>": { ... } } }`.
- The server makes a draft in modo `refinar`, then applies each proposed step in the interview order
  with applyAnswer. A step with errors is dropped whole. It stores the pasted text as
  `respostas.materiais.texto` (so the sections later use the teacher's own content), and
  `propostos: [stepIds]` with the steps that were applied. Plan not approved. Response 201 with the
  draft view and `propostos`.
- The draft opens at the first step. A note at the top of the interview: "A Eunomia preencheu N
  passos a partir do seu texto. Reveja cada um: as decisões são suas." Each step in `propostos`
  shows "Proposto a partir do seu texto" until the teacher saves it; saving the step removes it
  from `propostos`.
- If the model answer is empty or every step fails: the draft is still made, with the text in
  materials, and the note says that no answer could be proposed and the interview starts empty.
- No automatic retry on this route (it creates a draft): api.js keeps one list for the own-key
  headers (adds adaptar) and a separate list for the retry (without adaptar). The error text says
  to check "Os meus rascunhos" before trying again.
- The help gets a FAQ entry and the four-steps text mentions this start.

### 7. Gentler tone

- Label "Erros comuns" becomes "Dicas". Each item is rewritten as advice in the positive ("Indique
  só o tempo desta actividade, não o da aula inteira."). The JSON key stays erros_comuns.
- The objectivo tips drop the item on compreender/saber/conhecer and the objectivo field help keeps
  one example only. The verb rule shows only when the saved or typed objective fails
  checkOutcomeVerb, in one friendly sentence with three example verbs. Check what the UI shows
  today and keep one message, not two.

### 8. What Tiago sees

- Make it true in code first: an admin reads another author's draft (GET /rascunhos/:id and every
  route that uses the read helper, and exports) only when its estado is `submetida`, `aprovada` or
  `devolvida`. Otherwise 404, as for any other user. The admin's own drafts are unchanged. The usage
  page (counts and opinions) is unchanged.
- Then say it, in the login data notice, the first-visit box and a FAQ entry: "Tiago Jacinto vê o
  seu nome, quantos rascunhos tem e em que estado, quantos pedidos faz ao modelo e as opiniões que
  deixar em «Foi útil?». A Eunomia só lhe mostra o texto de uma actividade depois de a submeter
  para revisão. A revisão é opcional e não é uma avaliação do seu trabalho."

### 9. Status of the tool

The sentence "A Eunomia é uma ferramenta desenvolvida por Tiago Jacinto (MEDCIDS) como proposta,
para testar, melhorar e construir com colegas. Não é uma ferramenta oficial da FMUP. O uso é
voluntário." goes on the login page, in the help "O que é a Eunomia", in the invitation and in the
page footer. No claim about the Quadro's status or any endorsement.

## Constraints

- All 0.1 and 0.2 constraints hold: European Portuguese with the Quadro spelling (actividade,
  objectivo, correcção), no emojis, all UI copy in i18n-pt.js or ajuda-pt.js, vanilla JS with no
  build, Node 22 with node:test, ajv, no new dependency, no secrets in the repo.
- Write routes: CSRF header or JSON, own drafts only, maxLength, C0 and emoji rejection,
  personal-data gate. Logs keep method, path, status and ms only.
- Accessibility as before: headings in order, focus moves to new content, aria-live for status,
  keyboard reachable, the two cards are links or buttons with clear names.
- Version 0.3.0 (eunomia.versao in _variables.yml; sync-versions).

## Left to the builder

- The exact wording of the rewritten tips, the help lines and the invitation, within the rules
  above. Tiago reviews the content before the pilot.
- The content of example 7, within section 5.
- The layout of the two cards, in the 0.2 style.
