// Themis (FMUP · IA) — European Portuguese strings and statement generators.
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
    conceptualisation: 'conceptualização do objecto e das perguntas de investigação',
    drafting: 'elaboração de versões iniciais do texto',
    editing: 'revisão linguística e estilística',
    translation: 'tradução',
    coding: 'auxílio na escrita de código',
    data_analysis: 'apoio à análise de dados',
    data_management: 'tratamento e organização de dados',
    literature_search: 'pesquisa bibliográfica',
    methodology: 'apoio ao desenho metodológico',
    ethics_review: 'verificação de conformidade ética e regulatória',
    supervision: 'acompanhamento e validação de etapas do trabalho',
    quality_control: 'controlo de qualidade e verificação sistemática',
    statistics: 'análise estatística',
    figures: 'preparação de imagens ou figuras',
    poster_design: 'preparação de poster',
    presentation_prep: 'preparação de apresentação oral',
    reflective_journal: 'apoio à escrita de diário reflexivo',
    portfolio: 'organização de portefólio',
    case_report: 'preparação de relatório de caso clínico',
    study_summary: 'resumos, mapas conceptuais e materiais de estudo',
    other: 'outras tarefas auxiliares', // replaced by tasksOther when provided
  };

  const ASSIGNMENT_NOUN = {
    essay: 'ensaio',
    report: 'relatório',
    data_analysis: 'análise de dados',
    code: 'trabalho de programação',
    presentation: 'apresentação',
    case_discussion: 'discussão de caso clínico',
    clinical_simulation: 'simulação clínica',
    portfolio: 'portefólio',
    poster: 'poster',
    reflective_journal: 'diário reflexivo',
    other: 'trabalho',
  };

  const ASSIGNMENT_PREP = {
    essay: 'neste ensaio',
    report: 'neste relatório',
    data_analysis: 'nesta análise de dados',
    code: 'neste trabalho de programação',
    presentation: 'nesta apresentação',
    case_discussion: 'nesta discussão de caso clínico',
    clinical_simulation: 'nesta simulação clínica',
    portfolio: 'neste portefólio',
    poster: 'neste poster',
    reflective_journal: 'neste diário reflexivo',
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

  const resolveAssignmentNoun = (k, otherText) => {
    if (k === 'other' && otherText && trim(otherText)) return trim(otherText);
    return ASSIGNMENT_NOUN[k] || ASSIGNMENT_NOUN.other;
  };

  const resolveAssignmentPrep = (k, otherText) => {
    if (k === 'other' && otherText && trim(otherText)) return 'neste(a) ' + trim(otherText);
    return ASSIGNMENT_PREP[k] || ASSIGNMENT_PREP.other;
  };

  const fmtAssignmentNoun = (a, otherText) => {
    const arr = assignmentArr(a);
    if (arr.length === 1) return resolveAssignmentNoun(arr[0], otherText);
    return list(arr.map((k) => resolveAssignmentNoun(k, otherText)));
  };

  const fmtAssignmentPrep = (a, otherText) => {
    const arr = assignmentArr(a);
    if (arr.length === 1) return resolveAssignmentPrep(arr[0], otherText);
    return 'neste trabalho (' + fmtAssignmentNoun(a, otherText) + ')';
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
    metacognition: 'reflexão metacognitiva sobre o próprio percurso',
    inter_professional_communication: 'comunicação interprofissional',
    patient_communication: 'comunicação com a pessoa doente',
    ethics_reasoning: 'raciocínio ético',
  };

  const ACTIVITY_PHRASE = {
    manuscript: 'na preparação deste manuscrito',
    grant: 'na elaboração desta candidatura a financiamento',
    review: 'na realização desta revisão sistemática e pesquisa bibliográfica',
    data_analysis: 'na análise de dados e desenvolvimento de código associado',
    abstract: 'na preparação deste resumo para conferência',
    protocol: 'na elaboração deste protocolo de investigação',
    thesis_chapter: 'na preparação deste capítulo de tese ou dissertação',
    book_chapter: 'na preparação deste capítulo de livro',
    software: 'no desenvolvimento de software ou código de análise associado',
    dataset_documentation: 'na documentação deste conjunto de dados',
    poster_scientific: 'na preparação deste poster científico',
    presentation_scientific: 'na preparação desta comunicação oral científica',
    other: 'na preparação deste trabalho de investigação',
  };

  const TARGET_LEAD = {
    journal: 'Para efeitos de submissão a uma revista científica, e em linha com as recomendações do ICMJE,',
    fct: 'Para efeitos de divulgação à Fundação para a Ciência e a Tecnologia (FCT),',
    horizon: 'Para efeitos de divulgação no âmbito do programa Horizonte Europa, e em linha com as orientações do ERA Forum sobre o uso responsável de IA generativa na investigação,',
    wellcome: 'Para efeitos de divulgação ao Wellcome Trust, em conformidade com a sua política sobre o uso de IA generativa,',
    institutional: 'Para efeitos de relatório institucional,',
    conference: 'Para efeitos de submissão a uma conferência,',
    book: 'Para efeitos de submissão a uma editora de livro,',
    repository: 'Para efeitos de depósito em repositório institucional ou repositório de dados aberto (Zenodo, OSF, ou equivalente),',
    phd_jury: 'Para efeitos de apreciação pelo júri de doutoramento,',
    master_jury: 'Para efeitos de apreciação pelo júri de mestrado,',
  };

  // GAIDeT macrodomains (Suchikova et al. 2026) plus the two U.Porto
  // operational extensions. Keys match GAIDET_ORDER in app.js.
  const GAIDET_LABELS = {
    conceptualisation: 'conceptualização',
    literature_review: 'revisão da literatura',
    methodology: 'metodologia',
    software: 'desenvolvimento de software e automação',
    data_management: 'gestão de dados',
    writing: 'escrita e edição',
    ethics_review: 'revisão ética',
    supervision: 'supervisão',
    quality_control: 'controlo de qualidade',
    visuals: 'visuais/multimédia',
  };

  const SCOPE_SENTENCE = {
    technical: 'O âmbito da utilização foi de apoio técnico: tarefas operacionais ou formais, sem influência relevante no conteúdo intelectual do trabalho.',
    auxiliary: 'O âmbito da utilização foi de apoio auxiliar com impacto limitado: organização, compreensão, revisão ou exploração inicial de ideias, mantendo-se as decisões, os argumentos e os resultados sob responsabilidade autoral.',
    substantive: 'O âmbito da utilização foi de contributo substantivo: a ferramenta influenciou de forma relevante o conteúdo intelectual do trabalho, o que determina a apresentação desta declaração estruturada.',
  };

  const fmtDate = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };

  const footer = (version, policy) => {
    const d = fmtDate(new Date());
    let s = ' Declaração gerada a ' + d + ' através da Themis (FMUP · IA), versão ' + version + '.';
    if (policy && policy.framework_version) {
      s += ' Em conformidade com ' + policy.framework_version + '.';
    }
    return s;
  };

  // Level 1 of the two-tier disclosure regime adopted by the U.Porto
  // framework: a short normalised note, required in every final work.
  // Three variants — no use, non-material use, material use.
  const shortNote = (s, version, policy) => {
    const tools = trim(s.tools) || 'ferramentas de inteligência artificial generativa não especificadas';
    const period = trim(s.useDate) ? ' em ' + trim(s.useDate) + ',' : '';

    if (s.noUse) {
      return 'O autor declara não ter utilizado ferramentas de IA generativa na preparação deste trabalho.' +
        footer(version, policy);
    }

    if (s.scope === 'substantive') {
      return 'O autor declara ter utilizado ' + tools + ' em tarefas com influência material na preparação deste trabalho. ' +
        'A descrição das tarefas delegadas, das partes afectadas e das verificações efectuadas consta da declaração estruturada anexa.' +
        footer(version, policy);
    }

    const purposes = (s.tasks || []).map((k) => TASK_PHRASES[k]).filter(Boolean);
    const purposeFrag = purposes.length ? list(purposes) : 'tarefas auxiliares de preparação';

    return 'O autor declara ter utilizado ' + tools + ',' + period + ' apenas para ' + purposeFrag +
      ', mantendo integral responsabilidade pelo conteúdo final.' + footer(version, policy);
  };

  const studentStatement = (s, version, policy) => {
    const subj = s.submission === 'group'
      ? 'Os autores deste trabalho declaram que recorreram'
      : 'Declaro que recorri';
    const aPrep = fmtAssignmentPrep(s.assignment, s.assignmentOther);
    const aNoun = fmtAssignmentNoun(s.assignment, s.assignmentOther);
    const tools = trim(s.tools) || 'ferramentas de inteligência artificial generativa não especificadas';
    const tasks = (s.tasks || []).map((k) => {
      if (k === 'other' && trim(s.tasksOther)) return trim(s.tasksOther);
      return TASK_PHRASES[k];
    }).filter(Boolean);
    const tasksClause = tasks.length
      ? ' especificamente para ' + list(tasks)
      : '';

    const modification = {
      as_is: 'Os contributos gerados pelas ferramentas foram integrados sem alterações substanciais, mantendo-se o conteúdo, em larga medida, conforme produzido pelas mesmas.',
      edited: 'Os contributos gerados pelas ferramentas foram revistos e substancialmente editados, sendo o conteúdo final fruto do juízo crítico ' + (s.submission === 'group' ? 'dos autores' : 'do(a) próprio(a) autor(a)') + '.',
      reference: 'Os contributos gerados pelas ferramentas foram utilizados apenas como referência, não tendo sido incorporados diretamente no conteúdo submetido.',
    }[s.modification] || '';

    const scopeClause = SCOPE_SENTENCE[s.scope] ? ' ' + SCOPE_SENTENCE[s.scope] : '';

    // Group work: the U.Porto framework asks for an individual contribution
    // record and confirmation that every member approves the final version,
    // by analogy with authorship practice in scientific publishing.
    const groupClause = s.submission === 'group'
      ? ' A contribuição individual de cada autor consta do registo que acompanha o trabalho, e todos os autores aprovam a versão final submetida.'
      : '';

    const responsibility = s.submission === 'group'
      ? 'Os autores assumem plena responsabilidade pelo conteúdo apresentado, pela sua exactidão e pela sua conformidade com as normas académicas da FMUP.'
      : 'Assumo plena responsabilidade pelo conteúdo apresentado, pela sua exactidão e pela sua conformidade com as normas académicas da FMUP.';

    const intro = subj + ' à utilização de ferramentas de inteligência artificial generativa ' + aPrep +
      ' (' + aNoun + (s.submission === 'group' ? ' submetido em grupo' : ' de autoria individual') + '). ' +
      'A(s) ferramenta(s) utilizada(s) foi(foram): ' + tools + tasksClause + '.';

    const useDateClause = trim(s.useDate) ? ' A utilização principal ocorreu em ' + trim(s.useDate) + '.' : '';

    return intro + ' ' + modification + scopeClause + useDateClause + groupClause + ' ' + responsibility + footer(version, policy);
  };

  const teacherSubjects = (courseType) => {
    if (courseType === 'uc_phd') {
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
    if (courseType === 'cpd' || courseType === 'microcredential' || courseType === 'other') {
      return {
        capPlural: 'Os formandos',
        plural: 'os formandos',
        byPlural: 'pelos formandos',
        possPlural: 'dos formandos',
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
    const aNoun = fmtAssignmentNoun(s.assignment, s.assignmentOther);
    const subj = teacherSubjects(s.courseType);
    const COURSE_LEAD_PT = {
      uc_undergrad: 'No âmbito desta UC de licenciatura',
      uc_master: 'No âmbito desta UC de mestrado',
      uc_phd: 'No âmbito desta UC de doutoramento',
      cpd: 'No âmbito deste Curso de Formação Contínua',
      microcredential: 'No âmbito desta microcredencial',
      other: 'No âmbito desta oferta formativa',
    };
    const courseLead = COURSE_LEAD_PT[s.courseType] || 'No âmbito desta oferta formativa';
    // Traffic-light marker required by the U.Porto framework on every
    // assessed activity, so the clause is legible under both frameworks.
    const SEMAFORO = {
      not_permitted: '🟥 Proibido — ',
      with_disclosure: '🟨 Permitido com condições — ',
      without_restrictions: '🟩 Permitido — ',
    };
    const marker = SEMAFORO[s.policy] || '';
    const lead = marker + courseLead + ', e relativamente ao trabalho avaliativo do tipo ' + aNoun + ',';

    const policyText = {
      not_permitted: ' não é permitida a utilização de ferramentas de inteligência artificial generativa na produção do trabalho submetido. Os trabalhos avaliativos devem refletir exclusivamente a produção intelectual ' + subj.possPlural + ', sendo qualquer recurso a estas ferramentas considerado uma falta à integridade académica.',
      with_disclosure: ' é permitida a utilização de ferramentas de inteligência artificial generativa, sob condição de divulgação integral. ' + subj.capPlural + ' ' + subj.verbDevem + ' declarar de forma transparente as ferramentas empregues, as tarefas para as quais recorreram a essas ferramentas e o grau de modificação dos contributos gerados, mantendo plena responsabilidade pelo conteúdo submetido.',
      without_restrictions: ' é permitida a utilização de ferramentas de inteligência artificial generativa sem restrições específicas. ' + subj.capPlural + ' ' + subj.verbMantem + ', contudo, plena responsabilidade pelo conteúdo submetido e pela sua adequação aos objectivos pedagógicos.',
    }[s.policy] || '';

    return lead + policyText + footer(version, policy);
  };

  const teacherDisclosure = (s, version, policy) => {
    const subj = teacherSubjects(s.courseType);
    const skills = (s.skills || []).map((k) => SKILL_PHRASES[k]).filter(Boolean);
    if (trim(s.skillsOther)) skills.push(trim(s.skillsOther));
    const skillsClause = skills.length
      ? ' Em particular, as seguintes competências devem ser produzidas integralmente ' + subj.byPlural + ', sem qualquer recurso a ferramentas de IA generativa: ' + list(skills) + '.'
      : '';

    if (s.policy === 'not_permitted') {
      return 'Não é exigida qualquer declaração, na medida em que o uso de ferramentas de inteligência artificial generativa não é permitido nesta oferta formativa.' + skillsClause +
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

    // Macrodomains delegated, in canonical GAIDeT order. The map lives in
    // policy.json (policy.gaidet); when it is unavailable (file://), the
    // clause is simply omitted.
    const g = policy && policy.gaidet;
    const seen = {};
    if (g && g.map) (s.tasks || []).forEach((k) => { if (g.map[k]) seen[g.map[k]] = true; });
    const domains = (g && Array.isArray(g.order) ? g.order : []).filter((d) => seen[d]).map((d) => GAIDET_LABELS[d]).filter(Boolean);
    const domainsClause = domains.length
      ? ' Segundo a taxonomia GAIDeT de delegação de tarefas, adoptada como referência pela Universidade do Porto, os macrodomínios delegados foram: ' + list(domains) + '.'
      : '';
    const scopeClause = SCOPE_SENTENCE[s.scope] ? ' ' + SCOPE_SENTENCE[s.scope] : '';

    let body = lead + ' declara-se que, ' + activity + ', foram utilizadas as seguintes ferramentas de inteligência artificial generativa — ' + tools +
      ' —' + tasksClause + '.' + domainsClause + scopeClause + ' Os contributos gerados foram revistos criticamente ' + (s.activity === 'manuscript' ? 'pelos autores' : 'pelo(s) investigador(es)') + ', que assumem responsabilidade integral pelo conteúdo final, pela sua exactidão e pela sua integridade científica. As ferramentas de inteligência artificial não são listadas como autoras, na medida em que não preenchem os critérios de autoria aplicáveis (designadamente, a capacidade de assumir responsabilidade pública pelo conteúdo). Não foram introduzidos dados pessoais, sensíveis ou confidenciais em serviços não autorizados.';

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

    const replicabilityTargets = ['journal', 'fct', 'horizon', 'wellcome'];
    if (trim(s.promptsRef) && replicabilityTargets.indexOf(s.target) !== -1) {
      body += ' Os prompts utilizados e a interacção completa com as ferramentas encontram-se disponíveis em / no ' + trim(s.promptsRef) + '.';
    }

    if (trim(s.useDate)) {
      body += ' A utilização principal das ferramentas ocorreu em ' + trim(s.useDate) + '.';
    }

    return body + footer(version, policy);
  };

  const researcherInline = (s, version, policy) => {
    const tools = trim(s.tools) || 'ferramentas de IA generativa não especificadas';
    const tasks = (s.tasks || []).map((k) => TASK_PHRASES[k]).filter(Boolean);
    const tasksFrag = tasks.length ? list(tasks) : 'tarefas auxiliares';
    const fw = policy && policy.framework_version ? '; em conformidade com ' + policy.framework_version : '';
    const useDate = trim(s.useDate) ? '; utilização em ' + trim(s.useDate) : '';
    return 'Os autores declaram a utilização de ' + tools + ' para ' + tasksFrag +
      ', tendo revisto criticamente os respetivos contributos e assumindo responsabilidade integral pelo conteúdo (gerado pela Themis (FMUP · IA), v' + version + useDate + fw + ').';
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
      appTitle: 'Themis — Declarações de uso de IA',
      appSubtitle: 'Apoio à elaboração de declarações de utilização de inteligência artificial em contexto académico e de investigação na FMUP',
      switchLanguage: 'Mudar para English',
      footerPrototype: 'Demonstrador prototípico',
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
      outputHeadingShortNote: 'Nota curta normalizada',
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
      toolsSuggestedHeader: 'Sugestões institucionais (clique para adicionar)',
      toolsSuggestedHelp: 'Em primeiro a plataforma institucional (IAedu); depois plataformas com contrato e opt-out de treino; depois ferramentas especializadas; por fim, versões grátis que requerem cautela com os dados.',
      toolsTierInstitutional: 'Plataforma institucional',
      toolsTierEnterprise: 'Versões empresariais (contrato + opt-out de treino)',
      toolsTierSpecialised: 'Ferramentas especializadas',
      toolsTierConsumerWarning: 'Versões públicas — atenção aos dados',
      studentUCPolicyReminder: 'Antes de submeter esta declaração, verifique a política da sua unidade curricular — o programa da UC ou o <a href="../quadro/B-clausula.html" target="_blank">Anexo B</a> indicam o regime aplicável (permitido, condicionado ou proibido). Esta declaração reflecte o Quadro institucional, não necessariamente o regime específico da UC.',
      teacherAdaptReminder: 'Este texto é um modelo. Adapte-o ao desenho pedagógico concreto da sua unidade curricular antes de o incluir no programa — nomeadamente, especificando o nome da UC, o semestre e quaisquer condições específicas. O <a href="../quadro/B-clausula.html" target="_blank">Anexo B</a> contém exemplos adicionais por regime.',
      landingPrivacyNote: 'Esta ferramenta corre inteiramente no seu navegador — sem servidor, sem cookies, sem registo de dados. Não introduza informação pessoal, clínica ou identificável nos campos de texto livre. A avaliação de risco é orientadora; a decisão final pertence sempre ao utilizador.',
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
      submission: {
        individual: 'Trabalho individual',
        group: 'Trabalho em grupo'
      },
      step2: 'Que tipo de trabalho é?',
      step2Help: 'Selecione todos os tipos aplicáveis (um trabalho pode combinar vários).',
      assignmentOtherLabel: 'Especifique o tipo de trabalho',
      assignmentOtherPlaceholder: 'Por exemplo: revisão narrativa, vídeo educativo, infografia clínica…',
      assignment: {
        essay: 'Ensaio',
        report: 'Relatório',
        data_analysis: 'Análise de dados',
        code: 'Programação / código',
        presentation: 'Apresentação',
        case_discussion: 'Discussão de caso clínico',
        clinical_simulation: 'Simulação clínica',
        portfolio: 'Portefólio',
        poster: 'Poster',
        reflective_journal: 'Diário reflexivo',
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
        poster_design: 'Preparação de poster',
        presentation_prep: 'Preparação de apresentação oral',
        reflective_journal: 'Diário reflexivo',
        portfolio: 'Portefólio',
        case_report: 'Relatório de caso clínico',
        study_summary: 'Resumos / materiais de estudo',
        other: 'Outra tarefa',
      },
      tasksOtherLabel: 'Especifique (ex.: graphical abstract, poster, análise de imagem…)',
      step4: 'Que ferramentas usou?',
      step4Help: 'Indique o nome e, sempre que possível, a versão das ferramentas (por exemplo: ChatGPT 4o, Claude Sonnet 4.6, GitHub Copilot).',
      step4Placeholder: 'Por exemplo: ChatGPT 4o; DeepL',
      step5: 'Como integrou os contributos da IA?',
      step5Help: 'Pense no que fez com o que a ferramenta produziu. Se usou só para confirmar uma ideia ou explorar abordagens, escolha "Apenas como referência". Se pegou no texto/código gerado, reescreveu partes substanciais, verificou e refez raciocínios, escolha "Substancialmente editados". Se copiou tal-e-qual ou fez ajustes pontuais (vírgulas, sinónimos), escolha "Sem alterações substanciais". Esta escolha condiciona a frase final da declaração e tem implicações sobre o seu nível de autoria.',
      modification: {
        reference: {
          label: 'Apenas como referência',
          description: 'O output da ferramenta serviu como inspiração ou termo de comparação. Não foi incorporado no trabalho submetido.',
        },
        edited: {
          label: 'Substancialmente editados',
          description: 'Reescreveu partes significativas, verificou factos e fontes, e o resultado final reflecte o seu juízo crítico. Mantém autoria plena.',
        },
        as_is: {
          label: 'Sem alterações substanciais',
          description: 'O conteúdo permanece em larga medida como foi gerado, com edição apenas superficial (formatação, pequenas correcções). Implica menor grau de autoria pessoal --- declarar com transparência.',
        },
      },
      step6UseDate: 'Quando ocorreu a utilização principal?',
      step6UseDateHelp: 'Opcional. Se a utilização ocorreu em data anterior à geração desta declaração (por exemplo, tese ou trabalho elaborado ao longo de meses), indique-a aqui. Se deixar em branco, a data de utilização será considerada a mesma da geração.',
      step6UseDateLabel: 'Data de utilização (opcional)',
    },
    teacher: {
      step0CourseType: 'Que tipo de oferta formativa é?',
      step0CourseTypeHelp: 'Selecione o enquadramento da oferta formativa para que a cláusula gerada use a terminologia adequada.',
      courseType: {
        uc_undergrad: 'UC de licenciatura',
        uc_master: 'UC de mestrado',
        uc_phd: 'UC de doutoramento',
        cpd: 'Curso de Formação Contínua',
        microcredential: 'Microcredencial',
        other: 'Outra',
      },
      step1: 'Qual é o nível da unidade curricular?',
      level: {
        undergraduate: 'Licenciatura',
        postgraduate: 'Mestrado',
        doctoral: 'Doutoramento',
      },
      step2: 'Que tipo de trabalho será avaliado?',
      step2Help: 'Selecione todos os tipos aplicáveis (uma UC pode combinar vários).',
      assignmentOtherLabel: 'Especifique o tipo de trabalho',
      assignmentOtherPlaceholder: 'Por exemplo: revisão narrativa, vídeo educativo, infografia clínica, OSCE escrito…',
      assignment: {
        essay: 'Ensaio',
        report: 'Relatório',
        data_analysis: 'Análise de dados',
        code: 'Programação / código',
        presentation: 'Apresentação',
        case_discussion: 'Discussão de caso clínico',
        clinical_simulation: 'Simulação clínica',
        portfolio: 'Portefólio',
        poster: 'Poster',
        reflective_journal: 'Diário reflexivo',
        other: 'Outro',
      },
      step3: 'Qual será a política de uso de IA?',
      step3Help: 'Decida o regime aplicável ao(s) trabalho(s) avaliativo(s) desta oferta formativa. A escolha condiciona a cláusula gerada para o programa da UC e o tipo de declaração que os estudantes/formandos terão de submeter. Em caso de dúvida, considere se o objectivo de aprendizagem em causa pode ser atingido com o auxílio de GenAI (permitir, com ou sem divulgação) ou se requer produção integralmente humana para ser avaliável (não permitir). É também legítimo combinar regimes diferentes em momentos avaliativos distintos — neste caso, escolha o regime do momento avaliativo predominante e clarifique no programa.',
      policy: {
        not_permitted: {
          label: 'Não permitido',
          description: 'O uso de GenAI no trabalho submetido é proibido. Adequado quando a competência avaliada exige produção integralmente humana (raciocínio clínico em tempo real, expressão original, demonstração de conhecimento sem assistência). Implica desenho de avaliação robusto à utilização não declarada — por exemplo, momentos presenciais ou orais.',
        },
        with_disclosure: {
          label: 'Permitido com divulgação integral',
          description: 'O uso de GenAI é permitido desde que declarado em conformidade com o Anexo A do Quadro: ferramentas, tarefas, secções e grau de modificação. Adequado para a maioria dos trabalhos académicos. A omissão da declaração constitui violação autónoma de integridade académica, independentemente da qualidade do conteúdo.',
        },
        without_restrictions: {
          label: 'Permitido sem restrições específicas',
          description: 'O uso de GenAI é permitido sem exigência formal de declaração. Adequado a tarefas de baixo impacto avaliativo onde a competência avaliada não depende da autoria do texto (e.g., exercícios de exploração, esboços iniciais). Recomenda-se ainda assim que os estudantes/formandos indiquem ferramentas usadas, em prol da transparência.',
        },
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
        metacognition: 'Reflexão metacognitiva',
        inter_professional_communication: 'Comunicação interprofissional',
        patient_communication: 'Comunicação com a pessoa doente',
        ethics_reasoning: 'Raciocínio ético',
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
        protocol: 'Protocolo de investigação',
        thesis_chapter: 'Capítulo de tese / dissertação',
        book_chapter: 'Capítulo de livro',
        software: 'Software / código de análise',
        dataset_documentation: 'Documentação de dataset',
        poster_scientific: 'Poster científico',
        presentation_scientific: 'Comunicação oral científica',
        other: 'Outra',
      },
      step2: 'Para que tarefas recorreu à IA?',
      step2Help: 'Selecione todas as tarefas aplicáveis.',
      tasks: {
        conceptualisation: 'Conceptualização (objecto, perguntas, enquadramento)',
        literature_search: 'Pesquisa bibliográfica',
        methodology: 'Metodologia (desenho do estudo, protocolo)',
        coding: 'Programação',
        data_management: 'Gestão de dados (limpeza, transformação)',
        statistics: 'Análise estatística',
        drafting: 'Redação',
        editing: 'Edição / revisão linguística',
        translation: 'Tradução',
        figures: 'Preparação de imagens / figuras',
        ethics_review: 'Revisão ética',
        supervision: 'Supervisão de etapas do trabalho',
        quality_control: 'Controlo de qualidade',
        other: 'Outra',
      },
      step3: 'Que ferramentas usou?',
      step3Help: 'Indique o nome e, sempre que possível, a versão das ferramentas.',
      step3Placeholder: 'Por exemplo: ChatGPT 4o; Elicit; R copilot',
      step4: 'A quem se destina a divulgação?',
      promptsRefLabel: 'URL ou referência do anexo de prompts e interacções (opcional)',
      promptsRefPlaceholder: 'Ex.: https://… ou "Anexo 1 — Registo de interacções"',
      target: {
        journal: 'Submissão a revista científica (ICMJE)',
        fct: 'FCT — Fundação para a Ciência e a Tecnologia',
        horizon: 'Horizonte Europa',
        wellcome: 'Wellcome Trust',
        institutional: 'Relatório institucional',
        conference: 'Submissão a conferência',
        book: 'Submissão a editora de livro',
        repository: 'Depósito em repositório (Zenodo, OSF, …)',
        phd_jury: 'Júri de doutoramento',
        master_jury: 'Júri de mestrado',
      },
      step5UseDate: 'Quando ocorreu a utilização principal?',
      step5UseDateHelp: 'Opcional. Indique a data em que a utilização principal das ferramentas ocorreu (por exemplo, durante a redacção de um manuscrito ao longo de meses). Se deixar em branco, a data de utilização será considerada a mesma da geração desta declaração.',
      step5UseDateLabel: 'Data de utilização (opcional)',
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
    shared: {
      stepScope: 'Qual foi o âmbito da utilização?',
      stepScopeHelp: 'Este eixo distingue-se do grau de modificação: não descreve o que fez ao output, mas quanto é que a ferramenta influenciou o conteúdo intelectual do trabalho. É o critério que determina, no quadro da Universidade do Porto, se basta uma nota curta ou se é exigida declaração estruturada. Passo opcional: sem selecção, a declaração assume utilização não material.',
      scope: {
        technical: {
          label: 'Apoio técnico',
          description: 'Tarefas operacionais ou formais — formatação, organização de referências, conversão de formatos — sem influência relevante no conteúdo intelectual.',
        },
        auxiliary: {
          label: 'Apoio auxiliar com impacto limitado',
          description: 'Organização, compreensão, revisão ou exploração inicial de ideias. As decisões, os argumentos e os resultados permanecem sob a sua responsabilidade autoral.',
        },
        substantive: {
          label: 'Contributo substantivo',
          description: 'A ferramenta influenciou de forma relevante a conceptualização, a metodologia, a revisão da literatura, a análise, o código, a interpretação, a escrita de resultados ou as conclusões. Implica declaração estruturada.',
        },
      },
      noUseLabel: 'Não utilizei ferramentas de IA generativa neste trabalho',
      noUseHelp: 'O quadro da Universidade do Porto exige uma nota curta normalizada em todos os trabalhos finais, mesmo quando não houve qualquer utilização. Assinale para gerar essa declaração de não-utilização.',
      noUseSummary: 'Declaração de não-utilização',
      gaidetLabel: 'Macrodomínios delegados (GAIDeT)',
      gaidet: GAIDET_LABELS,
    },
    statements: {
      shortNote: shortNote,
      student: studentStatement,
      teacherSyllabus: teacherSyllabus,
      teacherDisclosure: teacherDisclosure,
      researcherFull: researcherFull,
      researcherInline: researcherInline,
    },
  };
})();
