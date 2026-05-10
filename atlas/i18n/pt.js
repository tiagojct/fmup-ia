// Atlas (FMUP · IA) — European Portuguese strings and statement generators.
// Edit this file (and en.js) to update wording. Bump APP_VERSION in app.js
// whenever you change statement content.

(function () {
  const list = (items) => {
    const arr = items.filter(Boolean);
    if (arr.length === 0) return '';
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return arr[0] + ' e ' + arr[1];
    return arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1];
  };

  const trim = (s) => (s || '').trim();

  const TASK_PHRASES = {
    ideation: 'exploração de ideias',
    drafting: 'elaboração de versões iniciais do texto',
    editing: 'revisão linguística e estilística',
    translation: 'tradução',
    coding: 'auxílio na escrita de código',
    data_analysis: 'apoio à análise de dados',
    literature_search: 'pesquisa bibliográfica',
    statistics: 'análise estatística',
    figures: 'preparação de imagens ou figuras',
    other: 'outras tarefas auxiliares',
  };

  const ASSIGNMENT_NOUN = {
    essay: 'ensaio',
    report: 'relatório',
    data_analysis: 'análise de dados',
    code: 'trabalho de programação',
    presentation: 'apresentação',
    other: 'trabalho',
  };

  const ASSIGNMENT_PREP = {
    essay: 'neste ensaio',
    report: 'neste relatório',
    data_analysis: 'nesta análise de dados',
    code: 'neste trabalho de programação',
    presentation: 'nesta apresentação',
    other: 'neste trabalho',
  };

  // Normalize state.assignment which can be either a string (legacy URL
  // hash) or an array (current state). Always returns a non-empty array
  // — defaults to ['other'] if empty.
  const assignmentArr = (a) => {
    if (Array.isArray(a)) return a.length ? a : ['other'];
    if (typeof a === 'string' && a) return [a];
    return ['other'];
  };

  const fmtAssignmentNoun = (a) => {
    const arr = assignmentArr(a);
    if (arr.length === 1) return ASSIGNMENT_NOUN[arr[0]] || ASSIGNMENT_NOUN.other;
    return list(arr.map((k) => ASSIGNMENT_NOUN[k] || ASSIGNMENT_NOUN.other));
  };

  const fmtAssignmentPrep = (a) => {
    const arr = assignmentArr(a);
    if (arr.length === 1) return ASSIGNMENT_PREP[arr[0]] || ASSIGNMENT_PREP.other;
    return 'neste trabalho (' + fmtAssignmentNoun(a) + ')';
  };

  const LEVEL_LABEL = {
    undergraduate: 'unidade curricular de licenciatura',
    postgraduate: 'unidade curricular de mestrado',
    doctoral: 'unidade curricular de doutoramento',
  };

  const SKILL_PHRASES = {
    critical_thinking: 'pensamento crítico e argumentação',
    clinical_reasoning: 'raciocínio clínico',
    original_writing: 'redacção original',
    data_interpretation: 'interpretação de resultados',
    bibliography: 'selecção e síntese bibliográfica',
    oral_presentation: 'apresentação oral',
  };

  const ACTIVITY_PHRASE = {
    manuscript: 'na preparação deste manuscrito',
    grant: 'na elaboração desta candidatura a financiamento',
    review: 'na realização desta revisão sistemática e pesquisa bibliográfica',
    data_analysis: 'na análise de dados e desenvolvimento de código associado',
    abstract: 'na preparação deste resumo para conferência',
    other: 'na preparação deste trabalho de investigação',
  };

  const TARGET_LEAD = {
    journal: 'Para efeitos de submissão a uma revista científica, e em linha com as recomendações do ICMJE,',
    fct: 'Para efeitos de divulgação à Fundação para a Ciência e a Tecnologia (FCT),',
    horizon: 'Para efeitos de divulgação no âmbito do programa Horizonte Europa, e em linha com as orientações do ERA Forum sobre o uso responsável de IA generativa na investigação,',
    wellcome: 'Para efeitos de divulgação ao Wellcome Trust, em conformidade com a sua política sobre o uso de IA generativa,',
    institutional: 'Para efeitos de relatório institucional,',
    conference: 'Para efeitos de submissão a uma conferência,',
  };

  const fmtDate = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };

  const footer = (version, policy) => {
    const d = fmtDate(new Date());
    let s = ' Declaração gerada a ' + d + ' através da Atlas (FMUP · IA), versão ' + version + '.';
    if (policy && policy.framework_version) {
      s += ' Em conformidade com ' + policy.framework_version + '.';
    }
    return s;
  };

  const studentStatement = (s, version, policy) => {
    const subj = s.submission === 'group'
      ? 'Os autores deste trabalho declaram que recorreram'
      : 'Declaro que recorri';
    const aPrep = fmtAssignmentPrep(s.assignment);
    const aNoun = fmtAssignmentNoun(s.assignment);
    const tools = trim(s.tools) || 'ferramentas de inteligência artificial generativa não especificadas';
    const tasks = (s.tasks || []).map((k) => TASK_PHRASES[k]).filter(Boolean);
    const tasksClause = tasks.length
      ? ' especificamente para ' + list(tasks)
      : '';

    const modification = {
      as_is: 'Os contributos gerados pelas ferramentas foram integrados sem alterações substanciais, mantendo-se o conteúdo, em larga medida, conforme produzido pelas mesmas.',
      edited: 'Os contributos gerados pelas ferramentas foram revistos e substancialmente editados, sendo o conteúdo final fruto do juízo crítico ' + (s.submission === 'group' ? 'dos autores' : 'do(a) próprio(a) autor(a)') + '.',
      reference: 'Os contributos gerados pelas ferramentas foram utilizados apenas como referência, não tendo sido incorporados diretamente no conteúdo submetido.',
    }[s.modification] || '';

    const responsibility = s.submission === 'group'
      ? 'Os autores assumem plena responsabilidade pelo conteúdo apresentado, pela sua exactidão e pela sua conformidade com as normas académicas da FMUP.'
      : 'Assumo plena responsabilidade pelo conteúdo apresentado, pela sua exactidão e pela sua conformidade com as normas académicas da FMUP.';

    const intro = subj + ' à utilização de ferramentas de inteligência artificial generativa ' + aPrep +
      ' (' + aNoun + (s.submission === 'group' ? ' submetido em grupo' : ' de autoria individual') + '). ' +
      'A(s) ferramenta(s) utilizada(s) foi(foram): ' + tools + tasksClause + '.';

    return intro + ' ' + modification + ' ' + responsibility + footer(version, policy);
  };

  const teacherSubjects = (level) => {
    if (level === 'doctoral') {
      return {
        capPlural: 'Os doutorandos',
        plural: 'os doutorandos',
        byPlural: 'pelos doutorandos',
        possPlural: 'dos doutorandos',
        verbDevem: 'devem',
        verbMantem: 'mantêm',
        verbAssumem: 'assumem',
      };
    }
    return {
      capPlural: 'Os estudantes',
      plural: 'os estudantes',
      byPlural: 'pelos estudantes',
      possPlural: 'dos estudantes',
      verbDevem: 'devem',
      verbMantem: 'mantêm',
      verbAssumem: 'assumem',
    };
  };

  const teacherSyllabus = (s, version, policy) => {
    const lvl = LEVEL_LABEL[s.level] || LEVEL_LABEL.undergraduate;
    const aNoun = fmtAssignmentNoun(s.assignment);
    const subj = teacherSubjects(s.level);
    const lead = 'No âmbito desta ' + lvl + ', e relativamente ao trabalho avaliativo do tipo ' + aNoun + ',';

    const policyText = {
      not_permitted: ' não é permitida a utilização de ferramentas de inteligência artificial generativa na produção do trabalho submetido. Os trabalhos avaliativos devem refletir exclusivamente a produção intelectual ' + subj.possPlural + ', sendo qualquer recurso a estas ferramentas considerado uma falta à integridade académica.',
      with_disclosure: ' é permitida a utilização de ferramentas de inteligência artificial generativa, sob condição de divulgação integral. ' + subj.capPlural + ' ' + subj.verbDevem + ' declarar de forma transparente as ferramentas empregues, as tarefas para as quais recorreram a essas ferramentas e o grau de modificação dos contributos gerados, mantendo plena responsabilidade pelo conteúdo submetido.',
      without_restrictions: ' é permitida a utilização de ferramentas de inteligência artificial generativa sem restrições específicas. ' + subj.capPlural + ' ' + subj.verbMantem + ', contudo, plena responsabilidade pelo conteúdo submetido e pela sua adequação aos objectivos pedagógicos da unidade curricular.',
    }[s.policy] || '';

    return lead + policyText + footer(version, policy);
  };

  const teacherDisclosure = (s, version, policy) => {
    const subj = teacherSubjects(s.level);
    const skills = (s.skills || []).map((k) => SKILL_PHRASES[k]).filter(Boolean);
    if (trim(s.skillsOther)) skills.push(trim(s.skillsOther));
    const skillsClause = skills.length
      ? ' Em particular, as seguintes competências devem ser produzidas integralmente ' + subj.byPlural + ', sem qualquer recurso a ferramentas de IA generativa: ' + list(skills) + '.'
      : '';

    if (s.policy === 'not_permitted') {
      return 'Não é exigida qualquer declaração, na medida em que o uso de ferramentas de inteligência artificial generativa não é permitido nesta unidade curricular.' + skillsClause +
        ' Caso seja detetado qualquer indício de utilização destas ferramentas, o trabalho será objeto de avaliação no âmbito do regulamento de integridade académica da FMUP.' + footer(version, policy);
    }

    const reportClause = s.policy === 'with_disclosure'
      ? 'Junto ao trabalho submetido, ' + subj.plural + ' ' + subj.verbDevem + ' anexar uma breve declaração indicando: (i) as ferramentas de inteligência artificial generativa utilizadas, incluindo a versão sempre que aplicável; (ii) as tarefas específicas para as quais essas ferramentas foram empregues; (iii) o grau de modificação aplicado aos contributos gerados; e (iv) a confirmação de que ' + subj.verbAssumem + ' responsabilidade integral pelo conteúdo submetido. A omissão desta declaração ou a sua imprecisão pode constituir falta à integridade académica.'
      : 'Embora o uso destas ferramentas seja permitido sem restrições específicas, recomenda-se que ' + subj.plural + ' indiquem, de forma sucinta, as ferramentas empregues e as tarefas para as quais recorreram às mesmas, em prol da transparência académica.';

    return reportClause + skillsClause + footer(version, policy);
  };

  const researcherFull = (s, version, policy) => {
    const lead = TARGET_LEAD[s.target] || TARGET_LEAD.institutional;
    const activity = ACTIVITY_PHRASE[s.activity] || ACTIVITY_PHRASE.other;
    const tools = trim(s.tools) || 'ferramentas de inteligência artificial generativa não especificadas';
    const tasks = (s.tasks || []).map((k) => TASK_PHRASES[k]).filter(Boolean);
    const tasksClause = tasks.length ? ' nas seguintes tarefas: ' + list(tasks) : ' em tarefas auxiliares de preparação';

    let body = lead + ' declara-se que, ' + activity + ', foram utilizadas as seguintes ferramentas de inteligência artificial generativa — ' + tools +
      ' —' + tasksClause + '. Os contributos gerados foram revistos criticamente ' + (s.activity === 'manuscript' ? 'pelos autores' : 'pelo(s) investigador(es)') + ', que assumem responsabilidade integral pelo conteúdo final, pela sua exactidão e pela sua integridade científica. As ferramentas de inteligência artificial não são listadas como autoras, na medida em que não preenchem os critérios de autoria aplicáveis (designadamente, a capacidade de assumir responsabilidade pública pelo conteúdo).';

    if (s.target === 'journal') {
      body += ' Esta declaração destina-se a ser incluída na secção de Métodos ou de Agradecimentos do manuscrito, em conformidade com as recomendações do ICMJE relativas ao uso de chatbots e modelos de linguagem na produção científica.';
    } else if (s.target === 'fct') {
      body += ' A presente declaração acompanha os elementos formais da candidatura submetida à Fundação para a Ciência e a Tecnologia.';
    } else if (s.target === 'horizon') {
      body += ' A presente declaração observa as orientações da Comissão Europeia e do ERA Forum sobre o uso responsável de IA generativa em projetos financiados pelo Horizonte Europa.';
    } else if (s.target === 'wellcome') {
      body += ' A presente declaração observa a política do Wellcome Trust sobre o uso de IA generativa em projetos por si financiados.';
    } else if (s.target === 'conference') {
      body += ' A presente declaração acompanha o material submetido à conferência.';
    } else if (s.target === 'institutional') {
      body += ' A presente declaração integra o relatório institucional correspondente.';
    }

    return body + footer(version, policy);
  };

  const researcherInline = (s, version, policy) => {
    const tools = trim(s.tools) || 'ferramentas de IA generativa não especificadas';
    const tasks = (s.tasks || []).map((k) => TASK_PHRASES[k]).filter(Boolean);
    const tasksFrag = tasks.length ? list(tasks) : 'tarefas auxiliares';
    const fw = policy && policy.framework_version ? '; em conformidade com ' + policy.framework_version : '';
    return 'Os autores declaram a utilização de ' + tools + ' para ' + tasksFrag +
      ', tendo revisto criticamente os respetivos contributos e assumindo responsabilidade integral pelo conteúdo (gerado pela Atlas (FMUP · IA), v' + version + fw + ').';
  };

  window.I18N_PT = {
    code: 'pt',
    label: 'Português',
    altLabel: 'EN',
    altLangCode: 'en',
    htmlLang: 'pt-PT',
    ui: {
      brand: 'FMUP',
      brandFull: 'Faculdade de Medicina da Universidade do Porto',
      appTitle: 'Atlas — Declarações de uso de IA',
      appSubtitle: 'Apoio à elaboração de declarações de utilização de inteligência artificial em contexto académico e de investigação na FMUP',
      switchLanguage: 'Mudar para English',
      footerVersion: 'Versão',
      footerDate: 'Data',
      footerFramework: 'Quadro:',
      startOver: 'Recomeçar',
      back: 'Voltar',
      continue: 'Continuar',
      generate: 'Gerar declaração',
      copyPlain: 'Copiar como texto simples',
      copyMarkdown: 'Copiar como Markdown',
      copyLink: 'Copiar ligação partilhável',
      printPdf: 'Imprimir / Guardar como PDF',
      copied: 'Copiado!',
      linkCopied: 'Ligação copiada!',
      required: 'Campo obrigatório',
      step: 'Passo',
      of: 'de',
      landingPrompt: 'Selecione o seu papel',
      landingHelp: 'Esta ferramenta gera declarações de utilização de ferramentas de inteligência artificial generativa adequadas ao contexto da FMUP. Selecione o papel que melhor descreve a sua situação para começar.',
      outputHeading: 'Declaração gerada',
      outputHeadingSyllabus: 'Texto para o programa da unidade curricular',
      outputHeadingTeacherDisclosure: 'Requisito de divulgação a comunicar aos estudantes',
      outputHeadingResearcherFull: 'Declaração para Métodos / Agradecimentos',
      outputHeadingResearcherInline: 'Declaração breve em linha',
      yourSelections: 'As suas seleções',
      reviewBeforeCopy: 'Reveja a declaração antes de a utilizar. O conteúdo deve refletir, de boa-fé, a utilização efetivamente feita das ferramentas indicadas.',
      requiredAsterisk: '*',
      backToQuadro: '← Quadro',
      backToHome: '← Início',
      linkInvalid: 'Ligação inválida ou de versão antiga.',
      viewScenario: 'Ver cenário no Quadro',
      principleLabel: 'Princípio',
      footerNationalPlatform: 'Articula-se com a Plataforma Nacional de Práticas Pedagógicas de IA',
    },
    roles: {
      student: 'Estudante',
      teacher: 'Docente',
      researcher: 'Investigador(a)',
    },
    rolesDesc: {
      student: 'Gerar uma declaração para acompanhar um trabalho submetido',
      teacher: 'Definir uma política de uso de IA para uma unidade curricular',
      researcher: 'Declarar o uso de IA num manuscrito, candidatura ou comunicação',
    },
    student: {
      step1: 'O trabalho é individual ou em grupo?',
      submission: { individual: 'Individual', group: 'Em grupo' },
      step2: 'Que tipo de trabalho é?',
      step2Help: 'Selecione todos os tipos aplicáveis (um trabalho pode combinar vários).',
      assignment: {
        essay: 'Ensaio',
        report: 'Relatório',
        data_analysis: 'Análise de dados',
        code: 'Programação / código',
        presentation: 'Apresentação',
        other: 'Outro',
      },
      step3: 'Para que tarefas recorreu à IA?',
      step3Help: 'Selecione todas as tarefas aplicáveis.',
      tasks: {
        ideation: 'Exploração de ideias',
        drafting: 'Redação',
        editing: 'Edição / revisão linguística',
        translation: 'Tradução',
        coding: 'Programação',
        data_analysis: 'Análise de dados',
        literature_search: 'Pesquisa bibliográfica',
      },
      step4: 'Que ferramentas usou?',
      step4Help: 'Indique o nome e, sempre que possível, a versão das ferramentas (por exemplo: ChatGPT 4o, Claude Sonnet 4.6, GitHub Copilot).',
      step4Placeholder: 'Por exemplo: ChatGPT 4o; DeepL',
      step5: 'Como integrou os contributos da IA?',
      modification: {
        reference: 'Apenas como referência',
        edited: 'Substancialmente editados',
        as_is: 'Sem alterações substanciais',
      },
    },
    teacher: {
      step1: 'Qual é o nível da unidade curricular?',
      level: {
        undergraduate: 'Licenciatura',
        postgraduate: 'Mestrado',
        doctoral: 'Doutoramento',
      },
      step2: 'Que tipo de trabalho será avaliado?',
      step2Help: 'Selecione todos os tipos aplicáveis (uma UC pode combinar vários).',
      assignment: {
        essay: 'Ensaio',
        report: 'Relatório',
        data_analysis: 'Análise de dados',
        code: 'Programação / código',
        presentation: 'Apresentação',
        other: 'Outro',
      },
      step3: 'Qual será a política de uso de IA?',
      policy: {
        not_permitted: 'Não permitido',
        with_disclosure: 'Permitido com divulgação integral',
        without_restrictions: 'Permitido sem restrições específicas',
      },
      step4: 'Que competências têm de ser do(s) estudante(s)?',
      step4Help: 'Selecione e/ou acrescente as competências que devem ser, obrigatoriamente, da autoria do(s) estudante(s).',
      skills: {
        critical_thinking: 'Pensamento crítico e argumentação',
        clinical_reasoning: 'Raciocínio clínico',
        original_writing: 'Redação original',
        data_interpretation: 'Interpretação de resultados',
        bibliography: 'Seleção e síntese bibliográfica',
        oral_presentation: 'Apresentação oral',
      },
      skillsOther: 'Outras (especifique)',
    },
    researcher: {
      step1: 'Que tipo de actividade?',
      activity: {
        manuscript: 'Redação de manuscrito',
        grant: 'Candidatura a financiamento',
        review: 'Revisão sistemática / pesquisa bibliográfica',
        data_analysis: 'Análise de dados / programação',
        abstract: 'Resumo para conferência',
        other: 'Outra',
      },
      step2: 'Para que tarefas recorreu à IA?',
      step2Help: 'Selecione todas as tarefas aplicáveis.',
      tasks: {
        literature_search: 'Pesquisa bibliográfica',
        drafting: 'Redação',
        editing: 'Edição / revisão linguística',
        translation: 'Tradução',
        statistics: 'Análise estatística',
        coding: 'Programação',
        figures: 'Preparação de imagens / figuras',
        other: 'Outra',
      },
      step3: 'Que ferramentas usou?',
      step3Help: 'Indique o nome e, sempre que possível, a versão das ferramentas.',
      step3Placeholder: 'Por exemplo: ChatGPT 4o; Elicit; R copilot',
      step4: 'A quem se destina a divulgação?',
      target: {
        journal: 'Submissão a revista científica (ICMJE)',
        fct: 'FCT — Fundação para a Ciência e a Tecnologia',
        horizon: 'Horizonte Europa',
        wellcome: 'Wellcome Trust',
        institutional: 'Relatório institucional',
        conference: 'Submissão a conferência',
      },
    },
    risk: {
      heading: 'Avaliação institucional — Nível',
      levelShort: 'Nível',
      cleanHeading: 'Avaliação institucional — sem alertas',
      cleanBody: 'As suas seleções não accionaram regras do Quadro de Referência FMUP. Reveja, ainda assim, a declaração antes de a utilizar.',
      unavailableHeading: 'Avaliação institucional indisponível',
      unavailableBody: 'O ficheiro policy.json não foi carregado (acesso a partir de file:// ou ficheiro em falta). A ferramenta continua a funcionar; a categorização automática de risco ficará desactivada.',
      guidanceFoot: 'Avisos guidantes — não bloqueiam a geração da declaração. A responsabilidade final é do utilizador.',
    },
    statements: {
      student: studentStatement,
      teacherSyllabus: teacherSyllabus,
      teacherDisclosure: teacherDisclosure,
      researcherFull: researcherFull,
      researcherInline: researcherInline,
    },
  };
})();
