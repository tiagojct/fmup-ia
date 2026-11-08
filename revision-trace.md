## 2026-10-20, T2, revise --pass structure, site e Quadro (sem formação nem slides)
- Asked: uma fonte por tema, ordem de leitura linear, sem mudar números, citações nem força das afirmações; sem renomear ficheiros nem letras de anexo.
- Returned: 14 movimentos de secções (05b, K, L criados; procurement 08 para 06; investigação clínica 14 para 05; Três Pilares 02 para 12b; tabela Themis 02 para D; blocos U.Porto, nacionais e regulatórios de C para recursos; passos de §9 da nota para H; limitações 15 para preâmbulo; iniciativas nacionais 01 e 12 para 12b; síntese de 09b para 09; callout 12b; módulo 1.º ciclo em 07), 9 duplicados cortados para ligação (calendário regulatório em 06 e síntese, adopção mínima na síntese, calendário no preâmbulo, nota U.Porto §1-2, §4-8, convenções HEAT-AI e SaMD, declaração em 03 e 05, financiamento em sobre), 4 parciais únicos para Anexo D e guias PDF, 7 entradas novas no glossário, barra lateral reordenada, Quadro v1.7.
- Kept: todas. Gate de corpus: 63 tokens removidos por desenho, todos ainda presentes no corpus excepto o marcador de ligação "[13]" (substituído por título) e "2544331" (número de artigo GAIDeT, presente em references.bib).
- Tool: Claude (claude-opus-5-5), via o plugin working-draft

## 2026-11-06, T2, revise --pass prose, site e Quadro, lote 1 (quadro/01-04), com segunda opinião
- Asked: passagem de prosa; âmbito todo o quadro/ e .qmd da raiz, por lotes com aprovação; sem mudar números, citações nem força das afirmações.
- Returned: 10 edições em 3 ficheiros (3 frases longas partidas em 01 e 02, 3 cortes de enchimento, 2 formas verbais mais directas em 04, 2 correcções de convenção Quadro/quadro em 02, 2 siglas UC por extenso). 03 sem alterações. 5 propostas não aplicadas (sujeito, verbo ou força da afirmação), listadas ao autor.
- Kept: todos os números e chaves de citação (gate lint.py compare: 0 removidos, 0 adicionados, 0 movidos).
- Second opinion: Gemini (nível baixo, 12 achados); 3 confirmados, 4 propostas pendentes de aprovação, 5 rejeitados.
- Tool: Claude (claude-sonnet-5-5), via o plugin working-draft

## 2026-11-06, T2, revise --pass prose, site e Quadro, lote 2 (quadro/05-09b), com segunda opinião
- Asked: continuação do lote 1; mesmas regras.
- Returned: 17 edições em 6 ficheiros (11 correcções de convenção Quadro/quadro em 05, 05b, 06 e 07; 3 frases longas partidas em 05b, 06 e 07; 1 "violações às regras" para "violações das regras" em 05b; 1 corte de redundância em 05; "três recomendações específicas" para "três delas" em 07). 08, 09 e 09b sem alterações. Pendente do autor: afirmação sem fonte em 08 (sub-representação em datasets de imagiologia).
- Kept: todos os números e chaves de citação (gate lint.py compare: 0 removidos, 0 adicionados, 0 movidos).
- Second opinion: Gemini (nível baixo, 10 achados); 2 aplicados, 1 sinalizado ao autor, 7 rejeitados (2 erros de regência falsos: "disponível à", "não se substitui ao").
- Tool: Claude (claude-sonnet-5-5), via o plugin working-draft

## 2026-11-06, T2, revise --pass prose, site e Quadro, lote 3 (quadro/10-15), com segunda opinião
- Asked: continuação dos lotes 1 e 2; mesmas regras.
- Returned: 6 edições em 3 ficheiros (12b: frase sem verbo corrigida, 2 frases longas partidas, "organizada em relação com" para "articula-se com"; 13: travessões uniformizados; 14: fragmento da síntese corrigido). 10, 11, 12 e 15 sem alterações. Pendentes do autor: título da secção "Outras experiências europeias e comparadas" em 11 inclui a Austrália; frase final de 13 e ponto 8 de 15 afirmam sem fonte; 12b diz que a evidência "sustenta" a regra de avaliação sem IA, enquanto 02 a descreve como "sugestiva mas mista"; título "NHS, MHRA, NICE" em 14 só trata o NHS; construção "X não demonstra Y" repetida cerca de 25 vezes no corpus.
- Kept: todos os números e chaves de citação (gate lint.py compare: 0 removidos, 0 adicionados, 0 movidos).
- Second opinion: Gemini (nível baixo, 8 achados); 3 aplicados, 3 sinalizados ao autor, 2 rejeitados (reescritas que removem conteúdo).
- Tool: Claude (claude-sonnet-5-5), via o plugin working-draft

## 2026-11-07, T2, revise --pass prose, site e Quadro, lote 4 (aprovações dos lotes 1-3, anexos A-L, guias, ficheiros da raiz), com segunda opinião
- Asked: aplicar as recomendações pendentes dos lotes 1-3 e continuar pelos anexos, guias e ficheiros da raiz.
- Returned: aprovações aplicadas (01 voz activa e "visa reduzir"; 03 ordem da frase de Moorhouse; 04 "Propõe-se que"; 11 título "Outras experiências europeias e internacionais"; 12b evidência "sugestiva mas mista" alinhada com 02; 14 título "NHS: pilar regulatório britânico"; convencoes.qmd com a linha UC). Novas edições: 14 correcções de convenção Quadro/quadro em E, F e G; "adoptado em 2024, com aplicação escalonada" em F; "IAedu" no feminino em K; frases partidas ou clarificadas em A, C, D, E, I; concordância e termos em _docentes, _investigadores e _servicos; UC, RCM, ES, browser e links por extenso ou por termo único em sintese, recursos, sobre, quadro/index e convencoes. 30 ficheiros alterados no total desta passagem. Sem alterações: B, J, L, 08, 09, 09b, 10, 11 (excepto título), 12, 15, index, 404, nota, guias PDF.
- Kept: todos os números e chaves de citação (gate lint.py compare: 0 removidos, 0 adicionados, 0 movidos, em todos os ficheiros).
- Second opinion: Gemini (nível baixo, 10 achados nos anexos); 1 aplicado, 9 rejeitados (falsos erros de género de "Themis", de regência de "condicionada a" e de "em abstracto"; reescritas que alteram conteúdo). Pendentes do autor: uso misto de "governança" (21) e "governação" (25); "Revisões futuras (v1.7, v2.0)" em sobre.qmd, quando a v1.7 já existe; afirmações sem fonte em 08, 13 e 15; "X não demonstra Y" repetido cerca de 25 vezes.
- Tropes: verificação mecânica das 74 linhas alteradas (português europeu): nenhuma marca introduzida pelas edições.
- Tool: Claude (claude-sonnet-5-5), via o plugin working-draft

## 2026-11-07, T2, revise --pass prose, site e Quadro, lote 5 (decisões do autor)
- Asked: uniformizar "governação", corrigir a versão futura em sobre.qmd, procurar e citar fontes para três afirmações, variar "X não demonstra Y".
- Returned: 18 ocorrências de "governança" passaram a "governação" em 11 ficheiros (excepto os eixos e a recomendação 3.5 do CNE, citados à letra); "Revisões futuras" de v1.7 para v1.8; 6 entradas novas em references.bib (daneshjou2022dermatology, seyyedkalantari2021underdiagnosis, ibrahim2021datapoverty, steinberg2021female, freeman2024hepi, freeman2025hepi), citadas em 08 e 15; afirmação de 13 apoiada no diagnóstico CNIPES (pp. 34-37, como já citado em 12b); 10 variações de "não demonstra" em 6 ficheiros.
- Claim changes (autorizadas): 08, "sub-representação histórica do sexo feminino em estudos clínicos de referência" passou a "em estudos clínicos de algumas áreas" e "escassez de dados para condições que afectam populações minoritárias" a "escassez de dados representativos de populações minoritárias", para coincidir com as fontes; 15 item 8, "confirma" passou a "indicam... o que sugere", porque as fontes são inquéritos do Reino Unido; 13, a comparação com "documentos institucionais europeus" passou a referir o diagnóstico CNIPES.
- Kept: nenhum número nem chave de citação removidos; o gate regista apenas as chaves novas (e as páginas 34 e 37 em 13).
- Fontes verificadas: PubMed (PMIDs 35960806, 34893776, 33678589, 34143192) e os PDFs do HEPI (Policy Notes 51 e 61). Não verificado: os resumos de Humble, Wilson e Jin (acesso recusado); não foram usados para a nova afirmação.
- Tool: Claude (claude-sonnet-5-5), via o plugin working-draft
