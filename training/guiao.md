# Guião do facilitador

**Sessão:** Adaptar o ensino à GenAI
**Duração-alvo:** 120 minutos, sem intervalo formal
**Plataforma:** [tiagojct.eu/fmup-ia/training/](https://tiagojct.eu/fmup-ia/training/)
**Ferramenta:** [IAedu](https://iaedu.pt), autenticação `@up.pt`
**Quadro:** [tiagojct.eu/fmup-ia/quadro/](https://tiagojct.eu/fmup-ia/quadro/)
**Themis:** [tiagojct.eu/fmup-ia/themis/](https://tiagojct.eu/fmup-ia/themis/)

Este ficheiro não é publicado no site. Tem cinco partes: preparação,
mapa de tempo, guião bloco a bloco, perguntas difíceis, e o que fazer
depois.

Escrito em pt-PT pré-AO90, como o resto do projecto. Os prompts estão
em blocos de código, com aspas rectas, prontos a copiar.

---

## Parte 1. Preparação

### Na véspera

- [ ] Correr o prompt de abertura na IAedu com dois ou três temas
      diferentes. Guardar o que correr pior, como reserva.
- [ ] Gerar e guardar a **captura de um erro**: uma referência
      inventada, um valor errado, uma dose implausível. É o seguro
      contra o cenário em que a demonstração corre bem demais.
- [ ] Testar os prompts das fichas 1, 2 e 4, que são as que se
      demonstram. Os modelos mudam, e o comportamento descrito pode
      ter deixado de se verificar.
- [ ] Definir `ficha-partilhada.url` em `training/_variables.yml` e
      publicar, ou decidir que se dispensa e avisar na altura.
- [ ] Imprimir: 15 a 20 cópias da folha de prática, que sai de
      [pratica.html](https://tiagojct.eu/fmup-ia/training/pratica.html)
      pela função de imprimir do navegador.
- [ ] Imprimir o material dos planos B de pelo menos duas fichas.
      Se a rede falhar, a sessão continua.

### Trinta minutos antes

- [ ] Abrir e autenticar a IAedu. Confirmar que responde.
- [ ] Abrir separadores: plataforma, programa, Themis, Anexo B.
- [ ] Abrir o [cronómetro](https://tiagojct.eu/fmup-ia/training/programa.html)
      e seleccionar o bloco de 8 min.
- [ ] Projectar e verificar o tamanho de letra do lado de trás da
      sala. A demonstração falha se ninguém ler o que sai.
- [ ] Aumentar o tipo de letra do navegador para 125% ou 150%.

### Cinco minutos antes

- [ ] Perguntar em voz alta quem não conseguiu entrar na IAedu.
      Emparelhar essas pessoas antes de começar, não a meio do
      bloco 6.
- [ ] Contar a sala. Abaixo de 8 pessoas, o bloco 7 faz-se em
      plenário e não por troca entre pares.

### O que levar

Portátil, carregador, adaptador de projecção, comando, as impressões,
e um telemóvel com dados móveis para o caso de a rede da Faculdade
falhar.

---

## Parte 2. Mapa de tempo

| Início | Fim | Bloco | Margem |
|---|---|---|---|
| 00:00 | 00:08 | 1. Demonstração de abertura | rígido |
| 00:08 | 00:15 | 2. Fundamentos mínimos | rígido |
| 00:15 | 00:30 | 3. Eixo 1, preparar a aula | flexível |
| 00:30 | 01:00 | 4. Eixo 2, as seis fichas | flexível |
| 01:00 | 01:15 | 5. Eixo 3, avaliação | **é daqui que se corta** |
| 01:15 | 01:45 | 6. Prática | intocável |
| 01:45 | 01:55 | 7. Teste cruzado | intocável |
| 01:55 | 02:00 | 8. Encerramento | intocável |

**Regra de corte.** Se aos 60 minutos ainda estiver no bloco 4,
comprima o 5 para 7 minutos: dê a tabela do que compromete e do que
valoriza, aponte para o Anexo B, e siga. Sair da sessão sem produto
desenhado é o único desfecho que a compromete.

**Regra de arranque do bloco 6.** Começar o mais tardar aos 75
minutos. Se for preciso, interrompa a discussão do bloco 5 a meio de
uma frase e diga que se retoma no fim.

---

## Parte 3. Guião bloco a bloco

### Bloco 1. Demonstração de abertura (8 min)

**Objectivo do bloco.** Estabelecer credibilidade nos dois sentidos:
a ferramenta é útil, e a ferramenta erra. Se só passar a primeira
metade, perde a sala crítica; se só passar a segunda, perde a sala
entusiasta.

**Abertura, cerca de 30 segundos.**

> "Vamos começar por fazer, e não por falar. Digam-me um tema que
> deem nas vossas UCs. Qualquer um."

Aceite o primeiro que ouvir. Não negocie o tema: escolher pelo grupo
sinaliza que precisa de terreno seguro.

**Prompt de abertura.** Substituir apenas o bloco `TEMA`.

```text
Preciso de material para uma aula de Medicina. Gera, sobre o tema
abaixo, um caso clínico curto e três perguntas de escolha múltipla.

TEMA
Agudização de DPOC

CASO CLÍNICO
Máximo 120 palavras. Apresentação realista, com idade, antecedentes
relevantes, queixa, e os achados de exame objectivo e exames
complementares necessários para responder às perguntas. Não indiques
o diagnóstico.

PERGUNTAS
Três perguntas de escolha múltipla, quatro opções cada, uma só
correcta. Devem exigir raciocínio e não memorização: aplicação a este
caso, decisão sobre o passo seguinte, interpretação de um resultado.

DISTRACTORES
Cada opção errada tem de corresponder a um erro de raciocínio
identificável. Depois de cada pergunta, indica numa linha que erro
cada distractor representa.

FORMATO
Caso, depois perguntas, depois a chave com as respostas correctas e
a justificação de cada distractor.
```

**Enquanto gera, diga o que estão a ver.** Aponte a velocidade, a
estrutura, a qualidade dos distractores. Se estiverem bons, diga-o.
Não desvalorize o que é bom, ou a segunda metade soa a preconceito.

**Depois, force o erro.** Escale por esta ordem até algo falhar:

```text
Indica as referências que sustentam a resposta à pergunta 2, com DOI.
```

```text
Qual é o valor de corte usado na norma da Direcção-Geral da Saúde
para esta situação? Cita o número da norma e o ano.
```

```text
Que estudos publicados em 2025 e 2026 alteraram esta recomendação?
```

O primeiro costuma bastar. A fabricação de DOI é o modo de falha mais
fácil de mostrar e de verificar em directo: abra `doi.org` e cole.

**Frase de fecho do bloco.**

> "Isto demorou seis minutos. Poupou-me talvez uma hora. E se eu
> tivesse entregue aos alunos sem ler, tinha-lhes dado uma referência
> que não existe. O resto da sessão é sobre estas duas coisas ao
> mesmo tempo."

**Contingência: nada correu mal.** Acontece, e cada vez mais. Não
insista para além de dois minutos. Mostre a captura que preparou na
véspera e diga:

> "Hoje portou-se bem. Ontem, no mesmo prompt, deu-me isto."

E acrescente o ponto que interessa, que é mais forte do que o erro:

> "Reparem no que acabou de acontecer. Eu não consigo prever se
> falha. É por isso que a verificação não pode depender de eu
> desconfiar."

**Contingência: a IAedu está em baixo.** Use a captura da véspera e
converta o bloco em análise: distribua o caso impresso e peça que
encontrem o que está errado. Perde-se o efeito de directo, ganha-se
tempo, e o bloco 2 pode alargar-se.

---

### Bloco 2. Fundamentos mínimos (7 min)

**Objectivo do bloco.** Dar o mínimo indispensável para os blocos
seguintes. Não é uma aula sobre modelos de linguagem. Sete minutos,
quatro pontos, e seguir.

**Enquadramento, cerca de 20 segundos.**

> "Quatro coisas. Não vou explicar como funcionam os modelos, vou
> explicar só o que muda o que vocês fazem."

**1. Confabulação.** O modelo prevê a continuação mais provável do
texto. Não consulta factos. Produz o falso com a mesma fluência com
que produz o verdadeiro, e foi isso que acabaram de ver.

Se quiser uma formulação que costuma fixar, use a do CNIPES:

> "Os LLM automatizam linguagem, não conhecimento."

**2. Referências inventadas.** O modo de falha mais frequente em
contexto académico e o mais fácil de verificar. Regra: confirmar
sempre no original, com DOI ou ligação.

**3. Dados de doentes.** Nunca, em plataforma alguma, nem sequer na
institucional. A anonimização informal não cumpre o RGPD. Este ponto
diz-se devagar e sem hedging.

**4. Risco baixo e risco alto.** Preparar materiais que o docente
revê é risco baixo. Avaliar ou classificar estudantes é risco alto, e
a decisão final é humana. Esta distinção estrutura os três eixos que
se seguem.

**Ligação ao Quadro, cerca de 20 segundos.** Diga que os quatro
pontos assentam nos sete princípios, aponte para a página
[Regras](https://tiagojct.eu/fmup-ia/training/regras.html), e não os
enumere. Enumerar sete princípios em sete minutos mata o bloco.

---

### Bloco 3. Eixo 1, preparar a aula (15 min)

**Objectivo do bloco.** Mostrar o uso de menor risco e maior retorno
imediato. É o bloco que converte cépticos, porque poupa tempo a quem
o faz e não toca em avaliação.

**Três aplicações, cerca de 4 minutos cada.**

**Casos clínicos com variação de dificuldade.** Demonstre a partir do
caso já gerado no bloco 1, o que poupa tempo e mostra continuidade:

```text
A partir do caso anterior, gera três variantes:
1. Uma com apresentação atípica, em que o diagnóstico é o mesmo mas
   os achados iniciais apontam noutra direcção.
2. Uma com uma comorbilidade que altera a decisão terapêutica.
3. Uma com um resultado laboratorial que contradiz a impressão
   clínica inicial, e que obriga a explicar a contradição.

Para cada variante, indica numa linha que competência de raciocínio
está a ser testada e não estava na versão original.
```

**Perguntas de escolha múltipla.** O ponto a passar: o valor está nos
distractores, não no enunciado. Se o distractor não corresponde a um
erro de raciocínio identificável, é ruído e o aluno elimina-o por
exclusão.

**Rubricas.** O docente sabe o que valoriza; a ferramenta ajuda a
escrevê-lo de forma utilizável pelo aluno.

```text
Vou descrever como corrijo um trabalho. Converte isso numa rubrica
explícita, com três a quatro critérios e três níveis de desempenho
por critério.

COMO CORRIJO
[descrever em três ou quatro frases, por palavras próprias]

REGRAS
- Os descritores têm de ser observáveis. "Demonstra bom raciocínio"
  não serve. "Distingue o que os dados sustentam do que não
  sustentam" serve.
- Não inventes critérios que eu não referi. Se achares que falta
  algum, propõe-no em separado, no fim, e diz porquê.
```

**Frase de fecho do bloco.**

> "Nada disto sai da minha mão sem eu ler. O que sai da ferramenta é
> rascunho. A responsabilidade pela exactidão clínica continua a ser
> minha, e isso não muda."

---

### Bloco 4. Eixo 2, as seis fichas (30 min)

**Objectivo do bloco.** Dar o repertório de onde vão escolher no
bloco 6. Não é preciso cobrir as seis com igual profundidade.

**Como distribuir os 30 minutos.**

- 3 min: apresentar a tabela das seis e o critério de escolha.
- 8 min: demonstrar a ficha 1, a mais vistosa.
- 6 min: demonstrar a ficha 2 ou a 4, conforme a sala.
- 4 min: passar pelas restantes em duas frases cada.
- 9 min: perguntas.

**Como escolher a segunda demonstração.** Sala clínica, escolha a
ficha 2, crítica de outputs. Sala com muita gente de ciências
básicas, bioética ou saúde pública, escolha a 4, advogado do diabo.
Sala mista, escolha a 2, que é a mais transversal.

**Ficha 1, doente virtual, 8 min.** Demonstre em directo com um
voluntário da sala a conduzir a anamnese. Prompt completo em
[fichas/1](https://tiagojct.eu/fmup-ia/training/fichas/1-doente-virtual.html).

Prepare a conversa antes, com o guião já colado, e passe o teclado.
Deixe correr cinco ou seis perguntas. Depois interrompa e faça a
pergunta que interessa:

> "O que é que ele ainda não perguntou?"

**Dado a dar aqui, e é o mais forte da sessão.** No estudo de
Tübingen, em perguntas não cobertas pelo guião, o modelo respondeu
com informação inventada em **56,4%** dos casos. E as respostas
implausíveis tendiam a ser socialmente desejáveis, não clinicamente
plausíveis.

> "Ou seja: o doente simulado é mais simpático e mais coerente do que
> um doente real. Isto é treino, não é substituto de doente
> padronizado, e é preciso dizer isso aos alunos."

**Ficha 2, crítica de outputs, 6 min.** Não demonstre a geração, que
é lenta. Mostre uma nota já gerada com erros plantados e peça à sala
que encontre um. Funciona bem em plenário e dá o efeito completo em
dois minutos.

**As restantes, duas frases cada.** Ficha 3, o aluno constrói a
rubrica antes de gerar as respostas. Ficha 5, resolve sozinho e só
depois compara, e é a única que cria hábito e não produto. Ficha 6,
opção avançada, exige infraestrutura, serve para mostrar o que é
possível quando a fonte é controlada.

**Sobre a ficha 6, seja claro.**

> "Esta não é para a próxima aula. É para saberem que existe, e o que
> exigiria. E o resultado mais útil do estudo é este: as restrições
> que garantem a exactidão são as mesmas que limitam as perguntas
> mais amplas. Não há almoços grátis."

---

### Bloco 5. Eixo 3, avaliação (15 min)

**Objectivo do bloco.** Deslocar a pergunta. Não é se a GenAI é boa
ou má, é o que compromete e o que valoriza.

**Comece pela tabela.** Está em
[programa.html](https://tiagojct.eu/fmup-ia/training/programa.html#bloco-5).
Projecte-a e percorra-a em três minutos.

**A frase que estrutura o bloco.**

> "A pergunta não é se isto é bom ou mau. É o que é que isto
> compromete, e o que é que isto valoriza. E a resposta muda o
> desenho da avaliação, não o regulamento."

**O ponto sobre proibição, que vale dois minutos.**

> "A proibição generalizada tem um problema prático antes de ter um
> problema pedagógico: não é verificável. Os detectores não são
> prova. O que resta é redesenhar o que é vulnerável, e dizer com
> clareza o que é permitido em cada actividade."

**Aterre no Anexo B.** Mostre as três cláusulas-tipo em
[B-clausula](https://tiagojct.eu/fmup-ia/quadro/B-clausula.html),
permitido, condicionado, proibido, e diga que se adaptam e se colam
no programa da UC. É o instrumento mais imediatamente utilizável de
toda a sessão.

**Mencione o semáforo da U.Porto.** Uma frase, sem desenvolver:

> "A Universidade adoptou um semáforo por actividade avaliada. Estas
> três cláusulas correspondem a verde, amarelo e vermelho. Quem seguir
> o Anexo B está alinhado com o quadro da Universidade."

**Se estiver atrasado, corte aqui.** Dê a tabela, aponte para o Anexo
B, e passe ao bloco 6.

---

### Bloco 6. Prática (30 min)

**Objectivo do bloco.** O produto. É por isto que a sessão existe.

**Formar os pares, 2 min.** Diga em voz alta:

> "Pares de UCs diferentes, ou de anos diferentes. Quem lecciona o
> mesmo converge depressa demais e faz uma ficha que só funciona no
> contexto que os dois já conhecem."

Emparelhe activamente quem ficou sozinho ou sem acesso à IAedu. Não
espere que se resolvam.

**Instruções, 2 min.** Distribua as folhas. Aponte para
[pratica.html](https://tiagojct.eu/fmup-ia/training/pratica.html).
Diga as três coisas que importam:

1. Partir de um problema real, não da actividade ideal.
2. Adaptar uma das seis fichas, não inventar de raiz.
3. Testar o prompt na IAedu. Um prompt por testar não está
   terminado.

**Durante os 26 minutos, circule.** Não se sente. Duas intervenções
úteis, e só estas:

- A quem estiver a escrever objectivos vagos: "o que é que o aluno
  vai fazer que eu consiga observar?"
- A quem não tiver aberto a IAedu passados dez minutos: "testem
  agora, ainda dá tempo de corrigir".

**Aos 20 minutos, avise em voz alta:**

> "Faltam dez. Quem ainda não testou o prompt, testem agora e deixem
> as armadilhas para o fim."

**Aos 26 minutos, corte.** Mesmo incompleto. O bloco 7 funciona com
fichas incompletas e não funciona sem tempo.

---

### Bloco 7. Teste cruzado (10 min)

**Objectivo do bloco.** Encontrar as falhas antes da aula real.

**Enquadramento, 1 min. O tom aqui é decisivo.**

> "Isto não é revisão amigável. Peguem na ficha do outro par e tentem
> parti-la. Quem encontrar uma falha está a fazer um favor, não uma
> crítica."

**Troca, 1 min.** Fisicamente, papel na mão. Pares adjacentes.

**Teste, 6 min.** As três perguntas estão impressas na folha. A
primeira é a que interessa:

> "Consigo obter o produto final desta actividade com um único
> prompt, sem fazer o que a actividade pretende que eu faça?"

Quem testa escreve na ficha e devolve. **Quem recebe não discute no
momento.** Isto tem de ser dito, ou os últimos minutos evaporam-se em
defesa.

**Devolução e recolha em plenário, 2 min.** Duas perguntas à sala:

> "Quem conseguiu partir a ficha do outro par? O que é que fizeram?"

Recolha dois ou três casos. São o material mais útil da sessão, e
valem mais do que qualquer coisa que eu diga.

**Se a sala for pequena, abaixo de 8 pessoas.** Faça o teste em
plenário: um par apresenta em dois minutos, a sala tenta partir.

---

### Bloco 8. Encerramento (5 min)

**Objectivo do bloco.** Fechar com um acto concreto e um compromisso
dito em voz alta.

**Themis, 3 min.** Abra [themis](https://tiagojct.eu/fmup-ia/themis/),
escolha a vertente Docentes, e preencha em directo com a actividade
de alguém da sala. Mostre os dois textos que saem: a cláusula para o
programa da UC e o requisito de divulgação a comunicar aos alunos.

Diga o que interessa sobre a rastreabilidade:

> "Reparem no rodapé. Traz a versão da ferramenta e a versão do
> Quadro que a produziram. Daqui a dois anos consegue-se saber que
> regras estavam em vigor quando esta declaração foi feita."

Diga também o que ela não é:

> "Isto é um demonstrador, não é aplicação institucional certificada.
> Serve para mostrar que é exequível."

**Compromisso, 2 min.** Estrutura fixa, e insista nela:

> "Uma frase cada um. 'Na minha UC, vou mudar X.' Uma frase, sem
> justificação."

A restrição é deliberada. Sem ela, transforma-se em intenções gerais
e perde-se o efeito. Se alguém justificar, agradeça e passe ao
seguinte.

**Fecho.** Diga onde fica tudo, e acabe a horas.

---

## Parte 4. Perguntas difíceis

As cinco primeiras estão trabalhadas por escrito no
[Anexo 9b do Quadro](https://tiagojct.eu/fmup-ia/quadro/09b-objeccoes.html).
Aqui ficam versões curtas, para responder de pé. **Não defenda o
Quadro.** Conceder o que a objecção tem de razoável é mais eficaz do
que refutá-la.

**"Porque é que não proibimos, simplesmente?"**

> "É uma posição defensável, e o Quadro admite-o num anexo próprio.
> O problema é prático antes de ser pedagógico: não é verificável.
> Os detectores não são prova, e a proibição não fiscalizável produz
> desigualdade entre quem cumpre e quem não cumpre. Se quisermos
> proibir, e há UCs onde faz todo o sentido, temos de redesenhar a
> avaliação para que a proibição seja verificável. É trabalho igual
> ao de permitir com condições."

**"Isto não é aceitar a inevitabilidade sem a discutir?"**

> "É uma objecção justa e está escrita no documento, no anexo das
> objecções. A pergunta prévia, deve a Faculdade aceitar isto, não
> foi feita antes da operacional. A minha resposta é que os 60 a 80%
> de adopção não obrigam a nada, mas obrigam a decidir. E não decidir
> também é uma decisão, tomada por omissão."

**"A verificação não anula a poupança de tempo?"**

> "Em parte sim, e está no anexo das objecções como risco de
> verificação-teatro. É por isso que o eixo 1 é o de menor risco: aí
> a verificação é a revisão que já se faz a qualquer material. Onde a
> verificação custa mais do que poupa, a resposta é não usar."

**"Isto não dilui a deontologia médica em vocabulário editorial?"**

> "Também é objecção do documento. O ICMJE e o COPE dão regra de
> autoria em publicação, não dão critério deontológico para o
> raciocínio clínico. Esse tem de vir da Ordem e da tradição clínica,
> não de comités de editores. É lacuna reconhecida."

**"A IAedu é mesmo soberana?"**

> "Não, e o Quadro tem uma objecção sobre isso. A soberania é
> contratual e operacional, não material nem epistémica: corre em
> hardware americano com modelos treinados por privados. O que a
> IAedu resolve é concreto e limitado: garantia contratual de não
> utilização dos dados para treino, e acesso sem custo individual.
> Isso chega para os dois problemas que temos aqui, protecção de
> dados e equidade."

**"Não tenho tempo para nada disto."**

> "Por isso é que o produto de hoje é uma ficha e não um plano. E o
> eixo 1 poupa tempo desde a primeira utilização. Se só levarem uma
> coisa, levem a cláusula do Anexo B: são dez minutos e resolve a
> ambiguidade toda na vossa UC."

**"E se os alunos usarem à mesma, sem declarar?"**

> "Vão usar. A ausência de declaração é, por si, violação de
> integridade, independentemente da qualidade do trabalho, e isso é
> mais fácil de sustentar do que provar que houve uso. Mas a resposta
> principal não é disciplinar: é que o trabalho não declarado deixe
> de ser suficiente para ter nota, porque há uma componente que exige
> presença."

**"Posso usar para corrigir?"**

> "Para construir a rubrica, sim. Para identificar padrões que depois
> analisa, sim. Para atribuir a nota, não, e não é opinião minha: a
> decisão sobre avaliação tem de ter intervenção humana substantiva.
> E não submeta trabalhos de alunos a plataformas comerciais, que é
> problema de dados antes de ser de avaliação."

---

## Parte 5. Depois da sessão

**No próprio dia, enquanto está fresco:**

- [ ] Recolher as fichas, em papel ou fotografadas.
- [ ] Anotar as duas ou três falhas encontradas no bloco 7. São o
      melhor material para a próxima edição.
- [ ] Anotar o que demorou mais do que o previsto.

**Na semana seguinte:**

- [ ] Enviar aos participantes: ligação da plataforma, ligação do
      Anexo B, e as fichas compiladas.
- [ ] Actualizar as fichas com o que se aprendeu, e o registo de
      alterações em `sobre.qmd`.
- [ ] Se alguma ficha se revelou fraca, corrigi-la antes de esquecer
      porquê.

**Sinal de que a sessão resultou.** Não é a avaliação da sessão. É
quantas cláusulas de GenAI aparecem nos programas das UCs no semestre
seguinte, que é aliás o primeiro indicador de cobertura curricular
proposto no capítulo 7 do Quadro.

---

## Anexo. Prompts da sessão, para copiar

Todos os prompts das fichas estão nas páginas respectivas. Os que só
existem neste guião são os três seguintes.

**Abertura, bloco 1.** Ver acima, secção do bloco 1. Substituir o
bloco `TEMA`.

**Forçar o erro, bloco 1.** Por esta ordem, até algo falhar:

```text
Indica as referências que sustentam a resposta à pergunta 2, com DOI.
```

```text
Qual é o valor de corte usado na norma da Direcção-Geral da Saúde
para esta situação? Cita o número da norma e o ano.
```

```text
Que estudos publicados em 2025 e 2026 alteraram esta recomendação?
```

**Variantes de caso, bloco 3.** Ver acima, secção do bloco 3.

**Rubrica a partir da prática, bloco 3.** Ver acima, secção do bloco
3. É o prompt que costuma gerar mais adesão, porque parte do que o
docente já faz.
