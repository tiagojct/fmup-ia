// Eunomia (FMUP · IA): the text of the help page (#/ajuda), in European Portuguese with the spelling
// of the Quadro (actividade, objectivo, correcção). The rest of the interface copy is in i18n-pt.js.
// The glossary values must match interview.json and i18n-pt.js (test: eunomia/test/content.test.js).

(function () {
  'use strict';

  window.EUNOMIA_AJUDA = {
    pagina: 'Ajuda',
    titulo: 'Ajuda da Eunomia',

    oQueE: {
      titulo: 'O que é a Eunomia',
      paragrafos: [
        'A Eunomia ajuda a desenhar uma actividade de ensino com IA, ou uma actividade que deixa a IA de fora por decisão sua. Faz as perguntas que um colega com experiência faria, propõe padrões de actividade já usados e escreve a ficha da actividade no formato das seis fichas de formação do FMUP · IA.',
        'As decisões são suas. O modelo de linguagem escreve o texto das secções a partir do plano que aprovar. O regime de IA, as referências e a declaração de uso vêm do código, nunca do modelo.',
        'Se nunca usou a Eunomia, veja primeiro uma actividade de exemplo: mostra, passo a passo, as respostas que levam a uma das seis fichas e porque foram escolhidas.',
      ],
    },

    antes: {
      titulo: 'Antes de começar',
      paragrafos: [
        'Precisa do código de acesso que recebeu por email. A sessão dura 12 horas; depois, entre de novo com o mesmo código.',
        'Reserve cerca de 45 minutos para a primeira actividade: perto de 25 para a entrevista e o plano, o resto para rever as secções e descarregar a ficha. Pode parar a meio, porque o rascunho fica guardado.',
        'Não escreva dados de doentes nem de estudantes em nenhum campo. As respostas, os materiais e o texto das secções vão para a IAedu, o serviço de IA da FCT/FCCN, por isso os casos têm de ser fictícios. Quando um texto parece ter dados pessoais, a Eunomia mostra o que encontrou e pede confirmação antes de o guardar.',
      ],
    },

    etapas: {
      titulo: 'As quatro etapas',
      lista: [
        {
          id: 'entrevista',
          titulo: 'Entrevista',
          docente: 'Responde, passo a passo, sobre o contexto, o objectivo, a evidência, o papel da IA, o regime de IA, a cláusula da avaliação (só numa actividade sumativa), o padrão e os materiais. Cada passo diz porque pergunta, com erros comuns e respostas de exemplo.',
          modelo: 'Só quando o pede: propõe versões mais precisas do objectivo e explica porque serve cada padrão proposto. Os padrões propostos são escolhidos pelo código, a partir das suas respostas.',
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
      termos: [
        {
          id: 'regime',
          termo: 'Regime de IA',
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
          texto: 'Um mecanismo de aula já usado, com duração típica, formato de grupo e armadilhas conhecidas. O catálogo tem doze padrões, seis com IA e seis sem IA. A Eunomia propõe dois ou três que servem o papel da IA e o tempo que indicou.',
          ligacao: {
            rotulo: 'Fichas de actividade: como escolher',
            url: 'https://tiagojacinto.eu/fmup-ia/training/fichas/index.html#como-escolher',
          },
        },
        {
          id: 'competencia_protegida',
          termo: 'Competência protegida',
          texto: 'A parte do objectivo que o estudante tem de fazer sem ajuda, nem da IA nem dos colegas. A actividade e a avaliação são desenhadas para a preservar, como pede o pilar Ser sem IA do Quadro.',
          ligacao: {
            rotulo: 'Princípios orientadores: os três pilares',
            url: 'https://tiagojacinto.eu/fmup-ia/quadro/02-principios.html#tres-pilares',
          },
        },
        {
          id: 'clausula_themis',
          termo: 'Cláusula Themis',
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
          pergunta: 'Quem vê os meus rascunhos?',
          resposta: 'O autor e o responsável da Eunomia, Tiago Jacinto, que pode abrir um rascunho para dar apoio. Os outros docentes não os vêem. Tiago Jacinto vê também as opiniões que deixar em «Foi útil?» e as actividades que submeter para revisão. Os registos do servidor não guardam o texto dos rascunhos.',
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
          resposta: 'Sim. Na página inicial, use Duplicar ao lado do rascunho: a cópia tem as mesmas respostas e as secções aceites, com «Cópia de» antes do título. Também pode começar a partir de uma das seis actividades de exemplo. Cada docente pode ter até 100 rascunhos.',
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
