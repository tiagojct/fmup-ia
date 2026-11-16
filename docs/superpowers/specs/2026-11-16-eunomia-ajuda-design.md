# Eunomia 0.2: help, tutorial, guidance and ten improvements

Status: approved by the user on 2026-11-16 ("sozinhos, por email. avança com tudo").
Base: Eunomia 0.1.0 on main (15f6ba7), design 2026-11-14-eunomia-design.md.

## Intent

Colleagues get Eunomia by email: a link and an access code. Nobody shows it to them first. They
must be able to understand what Eunomia does, finish a first activity and recover from errors
without help from Tiago. The second aim is to give Tiago what he needs to run the pilot: usage,
feedback and a review queue.

Success: a colleague who never saw Eunomia opens the email, reads the help or the worked example,
and exports a usable ficha in one sitting of about 45 minutes, with no message to Tiago.

Anti-goals: a help text that repeats the Quadro; a tutorial that the teacher must finish before
working; any new path for personal data to reach the model or the logs; any change that weakens the
0.1 security measures (cookie, CSRF, rate limits, own-key rules, personal-data gate, maxLength).

## Approaches considered

1. Static help pages in the Quarto site (fmup-ia/eunomia-ajuda.qmd). Easy to write, but outside the
   app: no link to the step the teacher is on, and the examples cannot become drafts.
2. Help, tutorial and guidance inside the app, driven by data files (chosen). One source for the
   examples (exemplos.json) feeds the worked example, "Ver exemplo" on each step and "Começar a partir
   deste exemplo". The help is public, so the email can link to it before login.
3. A guided overlay tour (step-by-step pop-ups). Fragile with the hash router and poor with screen
   readers; teachers skip it. Rejected.

## Scope

### A. Help page (`#/ajuda`, public, no login)

- Link "Ajuda" in the header of every page and on the login page.
- Copy in a new file eunomia/ajuda-pt.js (window.EUNOMIA_AJUDA), so i18n-pt.js stays short.
- Sections: O que é a Eunomia; Antes de começar (code, time of about 45 min, data rules); As quatro
  etapas (Entrevista, Plano, Secções, Exportar) with what the teacher does and what the model does in
  each; Glossário (regime de IA and its three values, papel da IA and its values, padrão de
  actividade, competência protegida, cláusula Themis, estados de uma secção, chave partilhada e chave
  própria), each entry with a link to the Quadro chapter that defines it; Perguntas frequentes (at
  least: the connection error, the daily limit, what the model sees, who sees my drafts, how to use
  the export in Word or Moodle, what "ajuste parcial" means, what to do with a warning, how to
  delete a draft, how to submit for review); Contacto.
- Contact: Tiago Jacinto, MEDCIDS, tiagojacinto@med.up.pt (his public work address).
- The glossary terms must match the values in interview.json, patterns.json and the Quadro text
  exactly. A test checks that every regime and papel value has a glossary entry.

### B. Tutorial (worked example)

- New data file eunomia/exemplos.json: for each of the six reference fichas (training/fichas,
  eunomia-server/referencia/ficha-N.json) the interview answers that lead to it, step by step.
  Every answer set must pass the server's answer validation. A test checks this.
- `#/exemplos`: list of the six examples (title, area, papel da IA, duration).
- `#/exemplos/:n`: read-only walk-through. For each interview step: the question, the example
  answer, and one line on why this answer (field `porque` in exemplos.json). Then the ficha sections
  of the reference ficha. Button "Começar uma actividade a partir deste exemplo".
- First visit: the home page shows a box "Primeira vez? Veja uma actividade de exemplo (5 min) ou
  leia a ajuda." with a close button. Closed state in localStorage per user (try/catch); it comes
  back if storage is blocked, which is acceptable.

### C. Guidance on each step

- Progress line on every interview step: "Passo N de 9 · cerca de M min até ao plano". Minutes per
  step in interview.json (`minutos`).
- "Ver exemplo" disclosure (details/summary) under each step: the answers of two or three examples
  for this step, from exemplos.json, with the example title.
- "Erros comuns" disclosure per step: two to four short items in interview.json (`erros_comuns`).
- Side panel "A sua ficha até agora" on the interview and plan pages (below the form on narrow
  screens): the meta table, the objective and the AI regime as they would appear in the ficha, built
  in the browser from the saved answers. No model call.

### D. The ten improvements

1. Connection failure: when a model request fails with status 0, the client waits 1.5 s and sends it
   once more. If the second answer is a 409 with motivo `rev`, the first request did reach the
   server: the client reloads the draft and shows the result. Only model routes retry. New copy for
   `erros.rede`: say that the request did not reach the server, that the text is kept, and to try
   again in a moment; if it repeats, see Ajuda.
2. Side panel of item C (counts as this improvement).
3. Start from an existing ficha: (a) from an example: `POST /rascunhos` with `{ modo: 'criar',
   exemplo: N }` makes a draft with the example's answers; the plan is not approved, so the teacher
   reviews every step. (b) duplicate one's own draft: `POST /rascunhos/:id/duplicar` copies the
   answers and the accepted sections into a new draft in estado `rascunho`, title prefixed
   "Cópia de ". Both count against the cap of 100 drafts.
4. Delete a draft: `DELETE /rascunhos/:id` with `rev`, own draft only, not in estado `submetida`.
   The file moves to data/apagados/ and is removed after 30 days by the retention sweep. The front
   end asks for confirmation and names the title. The help says how long a deleted draft is kept.
5. Export .docx: `GET /rascunhos/:id/exportar?formato=docx`, built from the ficha JSON with the npm
   package `docx` (pure JavaScript; no pandoc in the image). Same sections, headings and meta table
   as the HTML export; same gate (complete, valid). Control characters stripped.
6. "Foi útil?" on each generated section: two buttons (Sim, Não) and an optional comment (max 500
   characters, personal-data gate, no emoji). `POST /rascunhos/:id/seccoes/:sec/opiniao`. Stored in
   the section (`opiniao: { util, comentario, data, modelo }`). The data notice says that Tiago
   sees these opinions.
7. Usage page for the admin (`#/uso`, `GET /uso`, admin only): per user, name, drafts by estado,
   model calls today and in the last 30 days, the daily limit; per section, the counts of Sim and Não
   and the comments (without the section text). usage.json keeps 30 days.
8. Student handout: `GET /rascunhos/:id/exportar?formato=folheto` (HTML, printable, and `folheto-md`
   for Markdown): title, subtitle, objective, what the student does (from formato and papeis: the
   student role only), the AI regime for students in words, the Themis clause when the regime is not
   `proibido`, and the declaration line. Built by code only, no model call.
9. "Abrir no Themis": a link from the preview page to ../themis/ with the hash state `#s=` of a
   teacher already filled (role, level, policy from the regime, course type when known). If a field
   has no safe mapping, it stays empty. The link must decode in themis/app.js decodeState without the
   invalid-link toast. A test runs the encoded state through Themis's decoder.
10. Submit for review: `POST /rascunhos/:id/submeter` (complete and valid draft only; estado
    `submetida`; read-only for the author). Admin queue `#/revisao` (`GET /revisao`): list, preview,
    `POST /revisao/:id/aprovar` and `POST /revisao/:id/devolver` with a comment (max 2000). A returned
    draft goes back to estado `devolvida`, editable, with the comment shown at the top of the draft.
    The admin's home shows "N actividades à espera de revisão". No GitHub commit and no public
    library in this version (that stays for phase 2).

### E. Invitation text

On the access-codes page, after a code is created, show "Texto do convite" with a copy button: a
short email in European Portuguese with the Eunomia link, the code, the help link, the worked example
link and the contact. The code appears only in this one view, as today.

## Constraints

- Everything in 0.1's Global Constraints still holds: European Portuguese with the Quadro spelling
  (actividade, objectivo, correcção), no emojis, all UI copy in i18n files, vanilla JS with no build,
  Node 22 with node:test, ajv, one new dependency only (`docx`), no secrets in the repo.
- All new write routes follow the 0.1 rules: CSRF header or JSON, rev concurrency, own drafts only
  (admin routes check the admin flag), maxLength, C0 and emoji rejection, personal-data gate on
  free text over 200 characters and on every comment.
- Logs keep method, path, status and ms only.
- The help, the examples and the guidance work without a model call.
- Accessibility as in 0.1: headings in order, focus moves to the new content, aria-live for
  status, every control reachable by keyboard.
- Version 0.2.0 (`eunomia.versao` in _variables.yml; sync-versions).

## Left to the builder

- Exact layout and CSS of the side panel and the help page, in the 0.1 style.
- The wording of the help, the FAQ and the common errors, within the rules above. Tiago reviews the
  content before the pilot.
- The example answers, derived from the six fichas; where a ficha does not state an answer, choose
  the one that leads to it and mark it in exemplos.json `nota`.
