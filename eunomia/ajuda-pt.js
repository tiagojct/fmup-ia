// Eunomia (FMUP · IA): the text of the help page (#/ajuda), in European Portuguese with the spelling
// of the Quadro (actividade, objectivo, correcção). The rest of the interface copy is in i18n-pt.js.
// The glossary values must match interview.json and i18n-pt.js (test: eunomia/test/content.test.js).

(function () {
  'use strict';

  // The status of the tool and what Tiago sees: the same text as S.app.estado and S.app.oQueVe in
  // i18n-pt.js (test: content.test.js). This file loads on its own, so it keeps its own copy.
  var ESTADO = 'A Eunomia é uma ferramenta desenvolvida por Tiago Jacinto (MEDCIDS) como proposta, para testar, melhorar e construir com colegas. Não é uma ferramenta oficial da FMUP. O uso é voluntário.';
  var O_QUE_VE = 'Tiago Jacinto vê o seu nome, quantos rascunhos tem e em que estado, quantos pedidos faz ao modelo e as opiniões que deixar em «Foi útil?». A Eunomia só lhe mostra o texto de uma actividade depois de a submeter para revisão. A revisão é opcional e não é uma avaliação do seu trabalho.';

  window.EUNOMIA_AJUDA = {
    pagina: 'Ajuda',
    titulo: 'Ajuda da Eunomia',

    oQueE: {
      titulo: 'O que é a Eunomia',
      paragrafos: [
        'A Eunomia ajuda a desenhar uma actividade de ensino com IA, ou uma actividade que deixa a IA de fora por decisão sua. Uma actividade sem IA também é um resultado válido. A Eunomia faz as perguntas que um colega com experiência faria, propõe padrões de actividade já usados e escreve a ficha da actividade no formato das seis fichas de formação do FMUP · IA.',
        'As decisões são suas. O modelo de linguagem escreve o texto das secções a partir do plano que aprovar. O regime de IA, as referências e a declaração de uso vêm do código, nunca do modelo.',
        'Se nunca usou a Eunomia, veja primeiro uma actividade de exemplo: mostra, passo a passo, as respostas que levam a uma ficha e porque foram escolhidas. Há sete exemplos: seis seguem as fichas de formação e um mostra uma actividade sem IA.',
        ESTADO,
      ],
    },

    antes: {
      titulo: 'Antes de começar',
      // Shown first in this section, with a link to the Themis (../themis/).
      themis: {
        texto: 'Se só precisa da regra de IA para um trabalho avaliado, use a Themis, a outra ferramenta do FMUP · IA, que escreve a regra de IA para o enunciado de um trabalho. Leva cerca de 5 minutos, não pede código e não guarda nada.',
        link: 'Abrir a Themis',
        url: '../themis/',
      },
      paragrafos: [
        'Precisa do código de acesso que recebeu por email. A sessão dura 12 horas; depois, entre de novo com o mesmo código.',
        'Reserve cerca de 45 minutos para a primeira actividade: perto de 25 para a entrevista e o plano, o resto para rever as secções e descarregar a ficha. Pode parar a meio, porque o rascunho fica guardado.',
        'Não escreva dados de doentes nem de estudantes em nenhum campo. As respostas, os materiais e o texto das secções vão para a IAedu, o serviço de IA da FCT/FCCN para o ensino superior. Por isso, os casos têm de ser fictícios. Não precisa de conta: a Eunomia usa a chave da FMUP. Quando um texto parece ter dados pessoais, a Eunomia mostra o que encontrou e pede confirmação antes de o guardar.',
      ],
    },

    etapas: {
      titulo: 'As quatro etapas',
      rotuloDocente: 'O que faz',
      rotuloModelo: 'O que faz o modelo',
      lista: [
        {
          id: 'entrevista',
          titulo: 'Entrevista',
          docente: 'Responde, passo a passo, sobre o contexto, o objectivo e a evidência da actividade. Diz também o que a IA faz (papel da IA) e o que os estudantes podem fazer com IA (regime de IA). Numa actividade sumativa, responde ainda sobre a regra de IA no enunciado da avaliação (cláusula). Os últimos passos são a forma da actividade (padrão) e os materiais. Cada passo diz porque pergunta, com dicas e respostas de exemplo. Se começar com «Adaptar uma actividade que já faço», cola o texto de uma actividade sua. Depois, revê cada passo que o modelo preencheu.',
          modelo: 'Só quando o pede: propõe versões mais precisas do objectivo e explica porque serve cada padrão proposto. Os padrões propostos são escolhidos pelo código, a partir das suas respostas. Ao adaptar uma actividade, propõe respostas para os primeiros cinco passos a partir do seu texto.',
        },
        {
          id: 'plano',
          titulo: 'Plano',
          docente: 'Revê numa página as decisões da entrevista, dá um título e um subtítulo à ficha e, se quiser, deixa notas para a redacção. Depois aprova o plano.',
          modelo: 'Nada. O modelo só escreve depois de o plano estar aprovado.',
        },
        {
          id: 'seccoes',
          titulo: 'Secções',
          docente: 'Lê cada secção e aceita-a, edita-a ou pede uma nova versão com um comentário. Escolhe as referências da lista ou escreve as suas.',
          modelo: 'Escreve o objectivo, o formato, os papéis, a correcção e as armadilhas a partir do plano aprovado; o prompt base e o plano B também, quando a actividade usa IA. Não escreve o regime de IA, as referências nem a declaração de uso.',
        },
        {
          id: 'exportar',
          titulo: 'Exportar',
          docente: 'Lê a verificação final e descarrega a ficha em .docx, página HTML, .md ou .qmd. Se quiser, submete-a para revisão.',
          modelo: 'Nada. O código monta a ficha a partir das secções que aceitou.',
        },
      ],
    },

    glossario: {
      titulo: 'Glossário',
      // The line with comum, the common-words title of the step or field in the interview.
      rotuloComum: function (comum) { return 'Na entrevista: «' + comum + '».'; },
      termos: [
        {
          id: 'regime',
          termo: 'Regime de IA',
          comum: 'O que os estudantes podem fazer com IA',
          texto: 'O que os estudantes podem fazer com IA durante a actividade. Segue o semáforo da Universidade do Porto, com três valores. No regime amarelo, as condições dizem quando, para quê e com que registo os estudantes usam a IA.',
          valores: [
            { id: 'permitido', rotulo: 'verde: permitido' },
            { id: 'condicionado', rotulo: 'amarelo: permitido com condições' },
            { id: 'proibido', rotulo: 'vermelho: proibido' },
          ],
          ligacao: {
            rotulo: 'Vertente Estudantes: utilizações permitidas, condicionadas e proibidas',
            url: 'https://tiagojacinto.eu/fmup-ia/quadro/03-estudantes.html',
          },
        },
        {
          id: 'papel',
          termo: 'Papel da IA',
          comum: 'O que a IA faz nesta actividade',
          texto: 'O que a IA faz na actividade. O que os estudantes podem fazer com ela é o regime, uma escolha separada. As seis fichas de formação têm exemplos dos três papéis com IA.',
          valores: [
            { id: 'nenhum', rotulo: 'Nenhum: a actividade não usa IA' },
            { id: 'contraparte', rotulo: 'Contraparte: a IA assume um papel, por exemplo um doente ou um oponente' },
            { id: 'ferramenta', rotulo: 'Ferramenta: os estudantes usam a IA na tarefa' },
            { id: 'objecto_de_critica', rotulo: 'Objecto de crítica: os estudantes avaliam texto gerado pela IA' },
          ],
          ligacao: {
            rotulo: 'Fichas de actividade',
            url: 'https://tiagojacinto.eu/fmup-ia/training/fichas/index.html',
          },
        },
        {
          id: 'padrao',
          termo: 'Padrão de actividade',
          comum: 'A forma da actividade',
          texto: 'Um mecanismo de aula já usado, com duração típica, formato de grupo e armadilhas conhecidas. O catálogo tem doze padrões, seis com IA e seis sem IA. A Eunomia propõe dois ou três que servem o papel da IA e o tempo que indicou.',
          ligacao: {
            rotulo: 'Fichas de actividade: como escolher',
            url: 'https://tiagojacinto.eu/fmup-ia/training/fichas/index.html#como-escolher',
          },
        },
        {
          id: 'competencia_protegida',
          termo: 'Competência protegida',
          comum: 'O que o estudante tem de fazer sem ajuda',
          texto: 'A parte do objectivo que o estudante tem de fazer sem ajuda, nem da IA nem dos colegas. A actividade e a avaliação são desenhadas para a preservar, como pede o pilar Ser sem IA do Quadro.',
          ligacao: {
            rotulo: 'Princípios orientadores: os três pilares',
            url: 'https://tiagojacinto.eu/fmup-ia/quadro/02-principios.html#tres-pilares',
          },
        },
        {
          id: 'clausula_themis',
          termo: 'Cláusula Themis',
          comum: 'A regra de IA no enunciado da avaliação',
          texto: 'O texto que o enunciado de uma actividade sumativa traz para dizer como a IA pode ser usada no trabalho avaliado. A Eunomia gera-o com as regras da Themis, a partir do tipo de trabalho e da política, e junta os avisos da política.',
          ligacao: {
            rotulo: 'Anexo B. Modelo de cláusula',
            url: 'https://tiagojacinto.eu/fmup-ia/quadro/B-clausula.html',
          },
        },
        {
          id: 'estados_seccao',
          termo: 'Estados de uma secção',
          texto: 'Cada secção da ficha está num de quatro estados. A ficha só se descarrega com todas as secções aceites. Depois de aprovar o plano, uma secção passa a actualizar quando muda uma resposta de que ela depende.',
          valores: [
            { id: 'vazia', rotulo: 'por escrever' },
            { id: 'gerada', rotulo: 'por rever' },
            { id: 'aceite', rotulo: 'aceite' },
            { id: 'a-actualizar', rotulo: 'a actualizar' },
          ],
          ligacao: {
            rotulo: 'Princípio 1. Agência humana',
            url: 'https://tiagojacinto.eu/fmup-ia/quadro/02-principios.html#principio-1-agencia-humana',
          },
        },
        {
          id: 'chave',
          termo: 'Chave partilhada e chave própria',
          texto: 'Por omissão, a Eunomia usa a chave IAedu partilhada da FMUP. Nas Definições pode indicar a sua própria chave IAedu: o pedido vai com ela e o servidor não a guarda. O limite diário de pedidos ao modelo conta nos dois casos.',
          ligacao: {
            rotulo: 'Infraestrutura e governação: plataformas institucionais',
            url: 'https://tiagojacinto.eu/fmup-ia/quadro/06-infraestrutura.html#plataformas-institucionais',
          },
        },
      ],
    },

    perguntas: {
      titulo: 'Perguntas frequentes',
      lista: [
        {
          id: 'rede',
          pergunta: 'Apareceu «O pedido não chegou ao servidor». O que faço?',
          resposta: 'A ligação entre o navegador e o servidor falhou, ou a resposta perdeu-se no caminho. O texto que escreveu continua nesta página e o que já guardou está no rascunho. Tente de novo daqui a um momento; num pedido ao modelo, a Eunomia repete o pedido uma vez por si. Se o erro se repetir, verifique a ligação à internet e, depois, contacte o responsável da Eunomia.',
        },
        {
          id: 'limite',
          pergunta: 'Atingi o limite diário de pedidos ao modelo. E agora?',
          resposta: 'Cada docente tem um número máximo de pedidos ao modelo por dia, também com a sua própria chave. Contam como pedidos: escrever uma secção ou uma nova versão, sugerir versões do objectivo e explicar os padrões. O contador recomeça no dia seguinte. Entretanto, pode responder à entrevista, editar e aceitar secções e descarregar a ficha, porque nada disso usa o modelo.',
        },
        {
          id: 'modelo_ve',
          pergunta: 'O que vê o modelo?',
          resposta: 'As suas respostas à entrevista, os materiais que colar, o texto das secções e o comentário que escrever ao pedir uma nova versão. Não recebe o seu nome nem o código de acesso. Os pedidos vão para a IAedu, o serviço de IA da FCT/FCCN.',
        },
        {
          id: 'quem_ve',
          pergunta: 'O que vê o Tiago Jacinto?',
          resposta: O_QUE_VE + ' Os outros docentes não vêem os seus rascunhos, e os registos do servidor não guardam o texto dos rascunhos.',
        },
        {
          id: 'adaptar',
          pergunta: 'Posso partir de uma actividade que já faço?',
          resposta: 'Sim. Na página inicial, use «Adaptar uma actividade que já faço» e cole o enunciado ou a descrição da actividade. O modelo lê o texto e propõe respostas para os primeiros cinco passos da entrevista: o contexto, o objectivo, a evidência, o que a IA faz e o que os estudantes podem fazer com IA. Tem instruções para usar só o que o texto diz, por isso alguns passos podem ficar por responder. Depois, reveja cada passo: as decisões são suas, e o plano fica por aprovar. O texto vai para a IAedu, por isso não pode ter dados de doentes nem de estudantes. Fica guardado inteiro nos materiais do rascunho; o modelo lê os primeiros 20 000 caracteres.',
        },
        {
          id: 'word_moodle',
          pergunta: 'Como uso a ficha no Word ou no Moodle?',
          resposta: 'Para o Word, descarregue o .docx e abra-o. Para o Moodle, abra a página HTML no navegador, copie o texto e cole-o num recurso Página; os títulos e as tabelas costumam manter-se. O .md abre em qualquer editor de texto, e o .qmd serve a quem usa Quarto, como as fichas de formação do FMUP · IA.',
        },
        {
          id: 'ajuste_parcial',
          pergunta: 'O que quer dizer «Adequação parcial» num padrão proposto?',
          resposta: 'A marca Adequação parcial diz que o padrão falha um dos filtros e foi proposto porque menos de dois os cumpriam todos. A razão vem ao lado: a duração típica do padrão é maior do que o tempo que indicou, até 50 % mais, ou o padrão decorre fora da aula e a sua actividade é em aula. Pode escolhê-lo, mas tem de adaptar as fases ou o lugar.',
        },
        {
          id: 'aviso',
          pergunta: 'Uma secção tem avisos. O que faço?',
          resposta: 'Leia cada aviso e o trecho que cita. Um problema de estrutura impede aceitar a secção: edite o texto ou peça uma nova versão. Os outros avisos (língua, estilo, número a confirmar, referência) não impedem, mas convém tratá-los: um número a confirmar pode estar errado, e uma referência que o modelo escreveu pode não existir.',
        },
        {
          id: 'apagar',
          pergunta: 'Como apago um rascunho?',
          resposta: 'Na página inicial, use Apagar ao lado do rascunho e confirme. O rascunho sai da sua lista e fica guardado no servidor durante 30 dias; depois é removido. Nesse prazo, o responsável da Eunomia ainda o pode recuperar a pedido. Uma actividade submetida para revisão não pode ser apagada.',
        },
        {
          id: 'submeter',
          pergunta: 'Como submeto uma actividade para revisão?',
          resposta: 'Quando todas as secções estão aceites e não há passos por responder, use Submeter para revisão na página de pré-visualização. A actividade fica só de leitura até Tiago Jacinto a rever. Se for aprovada, fica marcada como aprovada. Se for devolvida, volta a poder ser editada, com o comentário da revisão no topo do rascunho.',
        },
        {
          id: 'duplicar',
          pergunta: 'Posso reutilizar uma actividade que já fiz?',
          resposta: 'Sim. Na página inicial, use Duplicar ao lado do rascunho: a cópia tem as mesmas respostas e as secções aceites, com «Cópia de» antes do título. Também pode começar a partir de uma das sete actividades de exemplo. Cada docente pode ter até 100 rascunhos.',
        },
      ],
    },

    contacto: {
      titulo: 'Contacto',
      nome: 'Tiago Jacinto',
      unidade: 'MEDCIDS',
      email: 'tiagojacinto@med.up.pt',
    },
  };
})();
