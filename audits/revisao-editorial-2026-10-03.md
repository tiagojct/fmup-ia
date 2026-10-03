# Revisão editorial — 3 de Outubro de 2026

Revisão do Quadro v1.6, Themis 1.3.1, regras 1.7.1 e formação v1.3, realizada com assistência do Codex a pedido do autor. Abrange os 54 ficheiros QMD do projecto: páginas principais, 17 capítulos, dez anexos, bibliografia apresentada, quatro guias PDF, slides e formação. Foram também revistos os textos PT/EN da Themis, as descrições das regras, os README e os dois guiões de apoio.

## Critério editorial

A revisão procurou formulações típicas de texto gerado por IA: superlativos sem fundamento, garantias excessivas, generalizações, contrastes retóricos repetidos, explicações redundantes e tom promocional. Esses padrões são problemas de redacção, não prova de autoria por IA. Foram preservados o português europeu pré-AO90, os títulos e as citações das fontes, as listas funcionais e os exemplos de prompts.

## Correcções principais

- Distinção entre proposta individual e política aprovada, incluindo a autoria dos PDFs e o carácter proposto dos grupos de trabalho. As páginas descrevem o destino da apreciação, sem afirmar uma submissão formal que esta sessão não documenta.
- Descrições da Themis ajustadas às saídas reais: declarações para estudantes e investigadores, cláusulas de UC para docentes, avaliação indicativa e versões identificadas. A ligação recupera escolhas; não arquiva o texto original.
- Remoção de garantias de autoria plena, conformidade automática, soberania de dados e rastreabilidade total.
- Harmonização do regime de três marcadores por actividade, dos sete princípios, dos seis perfis disciplinares e das nove lacunas. A proibição gerada para docentes refere-se ao trabalho seleccionado; regimes distintos exigem cláusulas distintas.
- Correcção dos resumos do AI Act e do EHDS. Distinção entre recomendações, obrigações jurídicas e medidas propostas para o piloto.
- Harmonização da regra de dados: acesso à IAedu, pagamento de conta, contrato ou exclusão de treino não autorizam, isoladamente, o tratamento de dados de doentes. É necessário verificar finalidade, fundamento jurídico, autorização e ambiente.
- Correcção da equivalência indevida entre dados clínicos pseudonimizados e aplicação do MDR/IVDR. A qualificação do sistema depende da finalidade prevista.
- Revisão das comparações internacionais: retirada de classificações regionais e percentagens sem fonte identificada; exemplos institucionais associados às fontes primárias. O relatório Cornell de Janeiro de 2024 referia o projecto do AI Act, anterior à aprovação do regulamento. A adopção inicial da ASU foi descrita por projectos, não como adopção integral.
- Remoção da reclassificação da U.Porto a partir do inquérito anónimo CNIPES. Os resultados da amostra não identificam a resposta individual da Universidade.
- Fichas de formação: duração corrigida, três blocos de substituição em vez de dois, comparação fundamentada sem obrigação de inventar erros e manutenção ou revisão de posição com justificação. Um prompt e uma base RAG não garantem exactidão, recusa ou segurança dos dados.
- Os resultados de Anand et al. são identificados como descritivos, incluindo o seguimento com cinco respostas. Intenção de uso não é mudança de prática nem validação desta sessão de duas horas.
- Guias correctamente descritos como PDFs para impressão, com duas ou três páginas, em vez de guias de uma página. A referência bibliográfica do próprio Quadro passou a acompanhar automaticamente a versão central.

## Fontes adicionais conferidas

Estas consultas complementam a [revalidação bibliográfica e institucional](referencias-2026-10-03.md); não constituem uma nova revisão sistemática de todos os artigos.

- [Comissão Europeia: calendário AI Omnibus](https://digital-strategy.ec.europa.eu/en/news/ai-omnibus-enters-force) e [EHDS](https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space-regulation-ehds_en).
- [Cornell: relatório de administração, Janeiro de 2024](https://it.cornell.edu/ai-strategy/aiinadministration).
- [Stanford: relatório do comité consultivo](https://provost.stanford.edu/news/report-ai-stanford-advisory-committee).
- [Harvard: orientações centrais](https://www.huit.harvard.edu/ai/guidelines) e [HMS: aprovação por nível de dados](https://it.hms.harvard.edu/about/policies-and-guidelines/generative-ai-guidelines).
- [ASU: projectos de adopção em Maio de 2024](https://tech.asu.edu/features/a-step-forward-in-charting-the-future-of-AI-in-higher-education).
- [Karolinska: comunicação de regras aos estudantes](https://staff.ki.se/tools-and-support/ai-at-ki/generative-ai-education/communicating-with-students-about-ai).
- [Unicamp: regulamentação de Abril de 2026](https://www.unicamp.br/noticias/2026/04/23/uso-de-ia-generativa-e-regulamentado-na-universidade/) e [Crefia](https://inteligenciaartificial.unicamp.br/institucional/crefia/).
- [UNAM: criação do conselho em Março](https://www.dgcs.unam.mx/boletin/bdboletin/2026_155.html) e [instalação em Maio](https://www.dgcs.unam.mx/boletin/bdboletin/may26.html). A pesquisa oficial confirmou a criação; a abertura directa do boletim de Março teve uma falha temporária de acesso.
- [FURM: finalidade clínica e operacional](https://arxiv.org/abs/2403.07911), [segurança clínica digital no NHS](https://www.england.nhs.uk/long-read/digital-clinical-safety-strategy/) e [TEHDAS2](https://tehdas.eu/).
- [U.S. Copyright Office: contribuição humana e material gerado por IA](https://www.copyright.gov/ai/), com distinção explícita entre o regime norte-americano e o português.

## Verificação

Passaram os 35 testes da Themis em PT/EN, a verificação das 62 entradas bibliográficas e chaves de citação, e a sincronização das versões. Foram construídas 41 saídas do projecto principal e 13 da formação. Os quatro PDFs foram conferidos quanto a autoria, versão e número de páginas: docentes, estudantes e serviços com duas páginas; investigadores com três. A primeira página do guia de docentes foi também inspeccionada visualmente. A auditoria das 52 páginas HTML agregadas confirmou ligações internas, recursos e âncoras das regras. `git diff --check` não encontrou erros de formatação. A publicação usa o [workflow Publish](https://github.com/tiagojct/fmup-ia/actions/workflows/publish.yml). As notas históricas de versões anteriores e `quadro/full-references.md` não foram convertidas em afirmações de validade actual. A revisão não certifica aprovação institucional nem conformidade jurídica de uma implementação concreta.
