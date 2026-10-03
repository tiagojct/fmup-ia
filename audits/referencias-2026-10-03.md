# Revalidação bibliográfica e institucional — 3 de Outubro de 2026

Foram inventariadas as **62 entradas da bibliografia**, confirmados os metadados dos **39 DOI** em Crossref/DataCite e verificadas **77 ligações externas** presentes nas páginas e nas regras da Themis. A evidência compacta está em [referencias-2026-10-03.json](referencias-2026-10-03.json). As verificações HTTP são auxiliares: uma resposta 200 pode ser uma página de desafio ou um documento diferente do citado.

A revisão abrange identidade bibliográfica, autoria, título, edição, identificadores e correspondência das principais disposições institucionais usadas pelo projecto. Não constitui uma nova revisão sistemática da literatura nem a leitura integral de todos os artigos e reportagens. O ficheiro `quadro/full-references.md`, excluído da publicação, foi identificado como notas históricas e deixou de afirmar que todas as suas referências estavam verificadas.

## Correcções com impacto no conteúdo

| Referência | Problema encontrado e correcção | Evidência |
|---|---|---|
| Jin et al. | O DOI terminado em `100340` identificava outro artigo. Corrigido para `100348`, incluindo número do artigo e autores. | [Registo Crossref](https://api.crossref.org/works/10.1016/j.caeai.2024.100348) |
| Ng et al. | O PMID `37875117` identificava um trabalho sobre peixe-zebra. Corrigido para `37852174`, correspondente ao DOI citado. | [PubMed](https://pubmed.ncbi.nlm.nih.gov/37852174/) |
| Stogiannos et al. | O título misturava um inquérito de 2024 com uma revisão de âmbito de 2023. Mantido o DOI da revisão que efectivamente fundamenta o modelo de governação; corrigidos título e autores. | [Registo editorial](https://doi.org/10.1259/bjr.20221157) |
| Temper et al., HEAT-AI | Corrigidos título e nomes dos autores; removidas notas provisórias. | [Artigo](https://doi.org/10.3389/feduc.2025.1505370) |
| Restantes artigos | Corrigidos nomes de autores incompletos ou incorrectos, incluindo März, McDonald, Shin, Iqbal, Toohey e outros. Conferidos títulos com subtítulos e dados de publicação nos registos. | Registos individualizados no JSON |
| Franklin / Postman | Separadas datas das conferências/obra original das edições efectivamente referenciadas: Franklin, edição revista de 1999; Postman, Vintage de 1993 associada ao ISBN indicado. | [Franklin, editora](https://houseofanansi.com/products/the-real-world-of-technology); [Postman, editora](https://www.penguinrandomhouse.com/books/132784/technopoly-by-neil-postman/) |
| CNIPES | Bibliografia passou a identificar os autores da ficha técnica. O PDF usa **Syeda Faryal**, enquanto o registo DataCite usa **Syeda Khurrum**; manteve-se a forma do documento e explicitou-se a divergência. | [Relatório e registo](https://doi.org/10.5281/zenodo.19555760) |
| MedSimAI | A referência da formação passou a apontar para a versão 2, de Janeiro de 2026, que sustenta os dados apresentados; preservada a data da primeira versão. | [arXiv v2](https://arxiv.org/abs/2503.05793v2) |

## Fontes institucionais consultadas

- **U.Porto:** consultados os sete PDFs públicos, edição de Junho de 2026, disponíveis em [Documentos orientadores](https://www.up.pt/portal/pt/inovacao-educativa/recursos/documentos-orientadores/). Conferidos autoria, títulos, declaração em dois níveis, limiar de materialidade, governação em cinco níveis, aprovação de ferramentas e encaminhamento de incidentes. Os ficheiros inicialmente recusaram algumas requisições automáticas, mas a consulta posterior foi bem-sucedida. O JSON regista as somas SHA-256 dos PDFs consultados. A disponibilização dos documentos não equivale à aprovação desta proposta FMUP.
- **Guia base U.Porto:** confirmados os modelos B1 e B2 (p. 29), a regra prudencial para ferramentas públicas e o prazo indicativo de 30 dias úteis (pp. 9–10). Os guias práticos de docentes e estudantes deixaram de ser descritos como documentos de uma página.
- **CNIPES:** consultado o PDF de 73 páginas; confirmados N=68, 52,9%/42,6%/26,5% de adopção por domínio, 19,1% com adopção nos três domínios e 14,7% com políticas em prática (pp. 29–31). Conferida a ficha técnica e identificada a divergência de nome indicada acima.
- **CNE:** consultado o [estudo de Abril de 2026](https://www.cnedu.pt/content/content/edicoes/estudos/Estudo_IA_contexto_educativo_vf.pdf) e o texto oficial da [Recomendação 4/2026](https://diariodarepublica.pt/dr/detalhe/recomendacao/4-2026-1124911989). Confirmados autores, data, título e recomendações dirigidas ao ensino superior.
- **ANIA:** substituída a referência sem endereço por ligação ao [texto oficial da Resolução 2/2026](https://diariodarepublica.pt/dr/detalhe/resolucao-conselho-ministros/2-2026-1000882016).
- **CE-FMUP:** acrescentado o [PDF do White Paper de integridade científica](https://upbioetica.org/wp-content/uploads/2023/09/Relatorio-Integridade-Cientifica-Final-Comissao-Etica-FMUP.pdf), anteriormente sem ligação.
- **Comissão Europeia / ERA Forum:** o endereço já remete para a [terceira edição das Living Guidelines, Maio de 2026](https://research-and-innovation.ec.europa.eu/document/download/2b6cf7e5-36ac-41cb-aab5-0d32050143dc_en). Corrigidos ano e edição. Explicitado o carácter não vinculativo das recomendações e a distinção entre uso substantivo na revisão por pares e apoio auxiliar sem exposição de informação confidencial.
- **Wellcome:** corrigida a descrição da [política de candidaturas, actualizada em Abril de 2026](https://wellcome.org/research-funding/guidance/policies-grant-conditions/use-of-generative-ai). A obrigação de divulgação de uso substantivo não é uma obrigação universal para toda a assistência linguística ou para todas as publicações. A Themis deixou de afirmar automaticamente conformidade com essa política.
- **FCT:** removida a afirmação geral, não demonstrada, de inexistência de orientações; o texto manda consultar as condições da chamada concreta.
- **AAMC:** corrigida a versão dos princípios para 1.0, final de 3 de Janeiro de 2025, e a ligação do [CGEA Artificial Intelligence Framework for Educators](https://www.aamc.org/about-us/mission-areas/medical-education/advancing-ai-resource-collection/cgea-artificial-intelligence-framework-educators). Algumas requisições automáticas devolvem `Client Challenge`; isso não foi classificado como validação de conteúdo.
- **UPdigital / IAedu:** confirmados acesso institucional e informação sobre treino em [UPdigital](https://www.up.pt/portal/pt/updigital/software/sistemas-inteligencia-artificial-generativa/). Retiradas garantias genéricas de adequação a dados de saúde baseadas apenas no nome de uma plataforma ou subscrição.
- **OCDE:** corrigidas as datas dos princípios (actualização em Maio de 2024) e do quadro de classificação (2022), com ligações primárias no capítulo 13.
- **São João:** actualizada a designação hospitalar para ULS São João, segundo o [SNS](https://www.sns.min-saude.pt/expansao-do-projeto/uls-sao-joao/).

## Calendários e estatuto jurídico

Os capítulos 6, 7, 11 e 14 foram corrigidos para distinguir os prazos de alto risco do AI Act: **2 de Dezembro de 2027 para o Anexo III** e **2 de Agosto de 2028 para produtos regulados do Anexo I**, de acordo com a [actualização da Comissão Europeia publicada em Julho de 2026](https://digital-strategy.ec.europa.eu/en/news/ai-omnibus-enters-force). A consulta automática directa do texto no EUR-Lex encontrou uma página de verificação; a fonte utilizada para esta actualização foi a comunicação oficial da Comissão.

No EHDS, **Março de 2027** foi corrigido como marco de actos de execução, distinguindo-o das principais obrigações de utilização primária e secundária em **2029 e 2031**, segundo o [calendário oficial](https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space-regulation-ehds_en). O texto deixou de apresentar uma obrigação geral de operacionalização hospitalar até 2027.

A Convenção do Conselho da Europa passou a distinguir assinatura, entrada em vigor, ratificação e aplicabilidade. Foi retirada a afirmação de que a faculdade dispensaria qualquer adaptação institucional. Esta revisão editorial não certifica a conformidade jurídica de uma implementação concreta.

## Limites e reprodução

- Os 39 DOI da bibliografia têm metadados recuperados; isso verifica a identidade dos trabalhos, não todas as conclusões que deles possam ser extraídas.
- Os quatro DOI da página de recursos da formação e os três PMID correspondentes foram conferidos. As reportagens adicionais tiveram verificação de ligação, sem nova leitura integral de todas.
- Bloqueios HTTP, desafios de navegador, redireccionamentos e tempos limite estão registados no JSON. Não foram tratados como prova de inexistência. Persistem limitações de consulta automática em UNESCO, ISO, Conselho da Europa, EUR-Lex e alguns fornecedores; para várias destas referências usou-se também a página oficial disponibilizada pela pesquisa web.
- As afirmações comparativas sobre todas as universidades estrangeiras e as notas históricas não foram objecto de uma nova auditoria documental exaustiva. O registo permite separar essa limitação da verificação das fontes institucionais centrais acima.

Para repetir a recolha: `python3 scripts/audit-references.py --output /tmp/fmup-ia-references.json`. Para validação local sem rede: `python3 scripts/check-content.py` e `python3 scripts/sync-versions.py --check`.

## Verificação das correcções técnicas

- 35 testes DOM passaram: PT/EN, três papéis, não utilização, evidência obrigatória, risco 4, armazenamento indisponível, estados partilhados inválidos, falhas de cópia e cronómetro com suspensão da execução.
- Construídos o projecto principal (41 saídas, incluindo quatro PDF) e a formação (13 HTML), sem avisos de referências ou erros de construção, com Quarto 1.10.18 local. A configuração CI mantém Quarto 1.9.38; esta versão não foi executada localmente.
- Verificadas as ligações locais, recursos e âncoras das regras nas 52 páginas HTML agregadas.
- Testado o depósito da ficha com o marcador por preencher e com URL HTTPS configurado, sem alterar a configuração real da sessão.
- Conferidos no navegador o percurso de não utilização em grupo, PT/EN e a reabertura de ligações para revisão; sem erros de consola nesse percurso.
- A publicação das alterações usa o workflow `Publish`, após autorização do responsável. O estado da implantação é registado nas execuções do GitHub Actions.
