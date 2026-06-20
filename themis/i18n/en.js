// Themis (FMUP · IA) — English strings and statement generators.
// Edit this file (and pt.js) to update wording. Bump APP_VERSION in app.js
// whenever you change statement content.

(function () {
  const list = (items) => {
    const arr = items.filter(Boolean);
    if (arr.length === 0) return '';
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return arr[0] + ' and ' + arr[1];
    return arr.slice(0, -1).join(', ') + ', and ' + arr[arr.length - 1];
  };

  const trim = (s) => (s || '').trim();

  const TASK_PHRASES = {
    ideation: 'idea exploration',
    drafting: 'drafting initial versions of the text',
    editing: 'language and stylistic editing',
    translation: 'translation',
    coding: 'assistance with writing code',
    data_analysis: 'support with data analysis',
    literature_search: 'literature searching',
    statistics: 'statistical analysis',
    figures: 'image or figure preparation',
    poster_design: 'poster preparation',
    presentation_prep: 'oral presentation preparation',
    reflective_journal: 'support for reflective journal writing',
    portfolio: 'portfolio organisation',
    case_report: 'clinical case report preparation',
    study_summary: 'summaries, concept maps and study materials',
    other: 'other ancillary tasks',
  };

  const ASSIGNMENT_NOUN = {
    essay: 'essay',
    report: 'report',
    data_analysis: 'data analysis',
    code: 'coding assignment',
    presentation: 'presentation',
    case_discussion: 'clinical case discussion',
    clinical_simulation: 'clinical simulation',
    portfolio: 'portfolio',
    poster: 'poster',
    reflective_journal: 'reflective journal',
    other: 'piece of work',
  };

  const ASSIGNMENT_PREP = {
    essay: 'in this essay',
    report: 'in this report',
    data_analysis: 'in this data analysis',
    code: 'in this coding assignment',
    presentation: 'in this presentation',
    case_discussion: 'in this clinical case discussion',
    clinical_simulation: 'in this clinical simulation',
    portfolio: 'in this portfolio',
    poster: 'in this poster',
    reflective_journal: 'in this reflective journal',
    other: 'in this piece of work',
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
    return 'in this piece of work (' + fmtAssignmentNoun(a) + ')';
  };

  const LEVEL_LABEL = {
    undergraduate: 'undergraduate course unit',
    postgraduate: 'postgraduate (master’s) course unit',
    doctoral: 'doctoral course unit',
  };

  const LEVEL_STUDENT = {
    undergraduate: 'students',
    postgraduate: 'students',
    doctoral: 'doctoral candidates',
  };

  const LEVEL_STUDENT_SG = {
    undergraduate: 'the student',
    postgraduate: 'the student',
    doctoral: 'the doctoral candidate',
  };

  const SKILL_PHRASES = {
    critical_thinking: 'critical thinking and argumentation',
    clinical_reasoning: 'clinical reasoning',
    original_writing: 'original writing',
    data_interpretation: 'interpretation of results',
    bibliography: 'bibliography selection and synthesis',
    oral_presentation: 'oral presentation',
    metacognition: 'metacognitive reflection on one’s own learning',
    inter_professional_communication: 'interprofessional communication',
    patient_communication: 'communication with patients',
    ethics_reasoning: 'ethical reasoning',
  };

  const ACTIVITY_PHRASE = {
    manuscript: 'in the preparation of this manuscript',
    grant: 'in the preparation of this grant application',
    review: 'in carrying out this systematic review and literature search',
    data_analysis: 'in the data analysis and associated code development',
    abstract: 'in the preparation of this conference abstract',
    protocol: 'in the preparation of this research protocol',
    thesis_chapter: 'in the preparation of this thesis or dissertation chapter',
    book_chapter: 'in the preparation of this book chapter',
    software: 'in the development of associated software or analysis code',
    dataset_documentation: 'in the documentation of this dataset',
    poster_scientific: 'in the preparation of this scientific poster',
    presentation_scientific: 'in the preparation of this scientific oral presentation',
    other: 'in the preparation of this research output',
  };

  const TARGET_LEAD = {
    journal: 'For the purpose of submission to a peer-reviewed journal, and in line with ICMJE recommendations,',
    fct: 'For the purpose of disclosure to the Fundação para a Ciência e a Tecnologia (FCT),',
    horizon: 'For the purpose of disclosure under the Horizon Europe programme, and in line with the European Commission and ERA Forum guidance on the responsible use of generative AI in research,',
    wellcome: 'For the purpose of disclosure to the Wellcome Trust, in compliance with its policy on the use of generative AI,',
    institutional: 'For the purpose of institutional reporting,',
    conference: 'For the purpose of conference submission,',
    book: 'For the purpose of submission to a book publisher,',
    repository: 'For the purpose of deposit in an institutional or open data repository (Zenodo, OSF, or equivalent),',
    phd_jury: 'For the purpose of appraisal by the doctoral examination committee,',
    master_jury: 'For the purpose of appraisal by the master’s examination committee,',
  };

  const fmtDate = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };

  const footer = (version, policy) => {
    const d = fmtDate(new Date());
    let s = ' Statement generated on ' + d + ' using Themis (FMUP · IA), version ' + version + '.';
    if (policy && policy.framework_version) {
      s += ' In line with ' + policy.framework_version + '.';
    }
    return s;
  };

  const studentStatement = (s, version, policy) => {
    const subj = s.submission === 'group'
      ? 'The authors of this work declare that they made use of'
      : 'I declare that I made use of';
    const aPrep = fmtAssignmentPrep(s.assignment);
    const aNoun = fmtAssignmentNoun(s.assignment);
    const tools = trim(s.tools) || 'unspecified generative artificial intelligence tools';
    const tasks = (s.tasks || []).map((k) => {
      if (k === 'other' && trim(s.tasksOther)) return trim(s.tasksOther);
      return TASK_PHRASES[k];
    }).filter(Boolean);
    const tasksClause = tasks.length
      ? ', specifically for ' + list(tasks)
      : '';

    const modification = {
      as_is: 'The contributions produced by these tools were incorporated without substantial changes, with the content remaining largely as generated.',
      edited: 'The contributions produced by these tools were reviewed and substantially edited, and the final content reflects the critical judgement of ' + (s.submission === 'group' ? 'the authors' : 'the author') + '.',
      reference: 'The contributions produced by these tools were used only as reference and were not directly incorporated into the submitted work.',
    }[s.modification] || '';

    const responsibility = s.submission === 'group'
      ? 'The authors take full responsibility for the content presented, for its accuracy, and for its compliance with FMUP’s academic standards.'
      : 'I take full responsibility for the content presented, for its accuracy, and for its compliance with FMUP’s academic standards.';

    const intro = subj + ' generative artificial intelligence tools ' + aPrep +
      ' (' + aNoun + (s.submission === 'group' ? ', submitted as a group' : ', individual submission') + '). ' +
      'The tool(s) used: ' + tools + tasksClause + '.';

    const useDateClause = trim(s.useDate) ? ' The main use took place on ' + trim(s.useDate) + '.' : '';

    return intro + ' ' + modification + useDateClause + ' ' + responsibility + footer(version, policy);
  };

  const teacherSyllabus = (s, version, policy) => {
    const lvl = LEVEL_LABEL[s.level] || LEVEL_LABEL.undergraduate;
    const aNoun = fmtAssignmentNoun(s.assignment);
    const subjPlural = LEVEL_STUDENT[s.level] || 'students';
    const COURSE_LEAD_EN = {
      uc_undergrad: 'In this undergraduate course unit',
      uc_master: 'In this Master’s course unit',
      uc_phd: 'In this doctoral course unit',
      cpd: 'In this Continuing Professional Development course',
      microcredential: 'In this microcredential',
      other: 'In this programme',
    };
    const courseLead = COURSE_LEAD_EN[s.courseType] || ('In this ' + lvl);
    const lead = courseLead + ', and with respect to the ' + aNoun + '(s) used for assessment,';

    const policyText = {
      not_permitted: ' the use of generative artificial intelligence tools in producing the submitted work is not permitted. Assessed work must reflect exclusively the intellectual production of ' + subjPlural + '; any reliance on such tools will be treated as a breach of academic integrity.',
      with_disclosure: ' the use of generative artificial intelligence tools is permitted, subject to full disclosure. ' + (s.level === 'doctoral' ? 'Doctoral candidates' : 'Students') + ' must transparently declare the tools they used, the tasks for which those tools were used, and the degree of modification applied to the generated contributions, while retaining full responsibility for the submitted content.',
      without_restrictions: ' the use of generative artificial intelligence tools is permitted without specific restrictions. ' + (s.level === 'doctoral' ? 'Doctoral candidates' : 'Students') + ' nonetheless retain full responsibility for the content submitted and for its alignment with the pedagogical aims of the course unit.',
    }[s.policy] || '';

    return lead + policyText + footer(version, policy);
  };

  const teacherDisclosure = (s, version, policy) => {
    const subjSg = LEVEL_STUDENT_SG[s.level] || 'the student';
    const subjPl = LEVEL_STUDENT[s.level] || 'students';
    const skills = (s.skills || []).map((k) => SKILL_PHRASES[k]).filter(Boolean);
    if (trim(s.skillsOther)) skills.push(trim(s.skillsOther));
    const skillsClause = skills.length
      ? ' In particular, the following must be produced entirely by ' + subjPl + ', without any reliance on generative AI tools: ' + list(skills) + '.'
      : '';

    if (s.policy === 'not_permitted') {
      return 'No disclosure statement is required, since the use of generative artificial intelligence tools is not permitted in this course unit.' + skillsClause +
        ' Any indication that such tools have been used will be assessed under FMUP’s academic integrity rules.' + footer(version, policy);
    }

    const reportClause = s.policy === 'with_disclosure'
      ? 'Together with the submitted work, ' + subjSg + ' must attach a brief disclosure statement indicating: (i) the generative AI tools used, including version where applicable; (ii) the specific tasks for which those tools were used; (iii) the degree of modification applied to the generated contributions; and (iv) confirmation that ' + subjSg + ' takes full responsibility for the submitted content. Failing to provide this statement, or providing an inaccurate one, may constitute a breach of academic integrity.'
      : 'Although the use of these tools is permitted without specific restrictions, ' + subjPl + ' are encouraged to indicate, briefly, the tools used and the tasks for which they were used, in the interests of academic transparency.';

    return reportClause + skillsClause + footer(version, policy);
  };

  const researcherFull = (s, version, policy) => {
    const lead = TARGET_LEAD[s.target] || TARGET_LEAD.institutional;
    const activity = ACTIVITY_PHRASE[s.activity] || ACTIVITY_PHRASE.other;
    const tools = trim(s.tools) || 'unspecified generative artificial intelligence tools';
    const tasks = (s.tasks || []).map((k) => TASK_PHRASES[k]).filter(Boolean);
    const tasksClause = tasks.length ? ' for the following tasks: ' + list(tasks) : ' for ancillary preparatory tasks';
    const subj = s.activity === 'manuscript' ? 'the authors' : 'the researcher(s)';

    let body = lead + ' it is hereby declared that, ' + activity + ', the following generative artificial intelligence tools were used — ' + tools +
      ' —' + tasksClause + '. The contributions generated were critically reviewed by ' + subj +
      ', who take full responsibility for the final content, for its accuracy, and for its scientific integrity. The artificial intelligence tools are not listed as authors, since they do not meet the applicable authorship criteria (notably, the ability to take public responsibility for the content).';

    if (s.target === 'journal') {
      body += ' This statement is intended for inclusion in the Methods or Acknowledgements section of the manuscript, in line with the ICMJE recommendations on the use of chatbots and large language models in scientific publication.';
    } else if (s.target === 'fct') {
      body += ' This statement accompanies the formal materials of the application submitted to the Fundação para a Ciência e a Tecnologia.';
    } else if (s.target === 'horizon') {
      body += ' This statement follows the guidance issued by the European Commission and the ERA Forum on the responsible use of generative AI in projects funded by Horizon Europe.';
    } else if (s.target === 'wellcome') {
      body += ' This statement follows the Wellcome Trust’s policy on the use of generative AI in projects it funds.';
    } else if (s.target === 'conference') {
      body += ' This statement accompanies the material submitted to the conference.';
    } else if (s.target === 'institutional') {
      body += ' This statement is included in the corresponding institutional report.';
    }

    const replicabilityTargets = ['journal', 'fct', 'horizon', 'wellcome'];
    if (trim(s.promptsRef) && replicabilityTargets.indexOf(s.target) !== -1) {
      body += ' The prompts used and the complete interaction log are available at / in ' + trim(s.promptsRef) + '.';
    }

    if (trim(s.useDate)) {
      body += ' The main use of the tools took place on ' + trim(s.useDate) + '.';
    }

    return body + footer(version, policy);
  };

  const researcherInline = (s, version, policy) => {
    const tools = trim(s.tools) || 'unspecified generative AI tools';
    const tasks = (s.tasks || []).map((k) => TASK_PHRASES[k]).filter(Boolean);
    const tasksFrag = tasks.length ? list(tasks) : 'ancillary tasks';
    const fw = policy && policy.framework_version ? '; in line with ' + policy.framework_version : '';
    const useDate = trim(s.useDate) ? '; use on ' + trim(s.useDate) : '';
    return 'The authors disclose the use of ' + tools + ' for ' + tasksFrag +
      '; the resulting contributions were critically reviewed and the authors take full responsibility for the content (generated by Themis (FMUP · IA), v' + version + useDate + fw + ').';
  };

  window.I18N_EN = {
    code: 'en',
    label: 'English',
    altLabel: 'PT',
    altLangCode: 'pt',
    htmlLang: 'en',
    ui: {
      brand: 'FMUP',
      brandFull: 'Faculty of Medicine of the University of Porto',
      appTitle: 'Themis — AI Usage Statements',
      appSubtitle: 'A tool to help draft statements on the use of artificial intelligence in academic and research contexts at FMUP',
      switchLanguage: 'Mudar para Português',
      footerPrototype: 'Prototype demonstrator',
      footerVersion: 'Version',
      footerDate: 'Date',
      footerFramework: 'Framework:',
      startOver: 'Start over',
      back: 'Back',
      continue: 'Continue',
      generate: 'Generate statement',
      copyPlain: 'Copy as plain text',
      copyMarkdown: 'Copy as Markdown',
      copyLink: 'Copy shareable link',
      printPdf: 'Print / Save as PDF',
      copied: 'Copied!',
      linkCopied: 'Link copied!',
      required: 'Required field',
      step: 'Step',
      of: 'of',
      landingPrompt: 'Select your role',
      landingHelp: 'This tool generates statements on the use of generative artificial intelligence tools, suitable for the FMUP context. Select the role that best describes your situation to begin.',
      outputHeading: 'Generated statement',
      outputHeadingSyllabus: 'Text for the course-unit syllabus',
      outputHeadingTeacherDisclosure: 'Disclosure requirement to communicate to students',
      outputHeadingResearcherFull: 'Methods / Acknowledgements statement',
      outputHeadingResearcherInline: 'Brief inline statement',
      yourSelections: 'Your selections',
      reviewBeforeCopy: 'Please review the statement before using it. The content should reflect, in good faith, the actual use made of the tools indicated.',
      requiredAsterisk: '*',
      backToQuadro: '← Framework',
      backToHome: '← Home',
      linkInvalid: 'Invalid or outdated link.',
      viewScenario: 'View scenario in the framework',
      principleLabel: 'Principle',
      footerNationalPlatform: 'Articulated with the National Platform for AI Pedagogical Practices',
      toolsSuggestedHeader: 'Suggested tools (click to add)',
      toolsSuggestedHelp: 'First the institutional platform (IAedu); then platforms with a contract and training opt-out; then specialised tools; finally consumer versions that require caution with data.',
      toolsTierInstitutional: 'Institutional platform',
      toolsTierEnterprise: 'Enterprise tiers (contract + training opt-out)',
      toolsTierSpecialised: 'Specialised tools',
      toolsTierConsumerWarning: 'Consumer versions — mind the data',
      studentUCPolicyReminder: 'Before submitting this declaration, check your course unit\'s policy — the course syllabus or <a href="../quadro/B-clausula.html" target="_blank">Appendix B</a> specify the applicable regime (permitted, conditioned or prohibited). This declaration reflects the institutional framework, not necessarily the specific course unit policy.',
      teacherAdaptReminder: 'This text is a template. Adapt it to the specific pedagogical design of your course unit before including it in the syllabus — in particular, specify the course name, semester, and any specific conditions. <a href="../quadro/B-clausula.html" target="_blank">Appendix B</a> contains additional examples by regime.',
      landingPrivacyNote: 'This tool runs entirely in your browser — no server, no cookies, no data logging. Do not enter personal, clinical or identifiable information in any free-text field. The risk assessment is advisory; the final decision always belongs to the user.',
    },
    roles: {
      student: 'Student',
      teacher: 'Teacher',
      researcher: 'Researcher',
    },
    rolesDesc: {
      student: 'Generate a statement to accompany a submitted assignment',
      teacher: 'Define an AI-use policy for a course unit',
      researcher: 'Disclose the use of AI in a manuscript, application, or communication',
    },
    student: {
      step1: 'Is this individual or group work?',
      submission: {
        individual: 'Individual assignment',
        group: 'Group assignment',
        cpd_individual: 'Continuing Professional Development course (individual)',
        cpd_group: 'Continuing Professional Development course (group)'
      },
      step2: 'What type of assignment is it?',
      step2Help: 'Select all that apply (an assignment can combine several).',
      assignment: {
        essay: 'Essay',
        report: 'Report',
        data_analysis: 'Data analysis',
        code: 'Code / programming',
        presentation: 'Presentation',
        case_discussion: 'Clinical case discussion',
        clinical_simulation: 'Clinical simulation',
        portfolio: 'Portfolio',
        poster: 'Poster',
        reflective_journal: 'Reflective journal',
        other: 'Other',
      },
      step3: 'For which tasks did you use AI?',
      step3Help: 'Select all that apply.',
      tasks: {
        ideation: 'Idea exploration',
        drafting: 'Drafting',
        editing: 'Editing / language polishing',
        translation: 'Translation',
        coding: 'Coding',
        data_analysis: 'Data analysis',
        literature_search: 'Literature searching',
        poster_design: 'Poster preparation',
        presentation_prep: 'Oral presentation preparation',
        reflective_journal: 'Reflective journal',
        portfolio: 'Portfolio',
        case_report: 'Clinical case report',
        study_summary: 'Summaries / study materials',
        other: 'Other task',
      },
      tasksOtherLabel: 'Specify (e.g., graphical abstract, poster, image analysis…)',
      step4: 'Which tools did you use?',
      step4Help: 'Indicate the name and, where possible, the version of the tools (e.g. ChatGPT 4o, Claude Sonnet 4.6, GitHub Copilot).',
      step4Placeholder: 'For example: ChatGPT 4o; DeepL',
      step5: 'How did you integrate the AI contributions?',
      modification: {
        reference: 'Reference only',
        edited: 'Substantially edited',
        as_is: 'Without substantial changes',
      },
      step6UseDate: 'When did the main use occur?',
      step6UseDateHelp: 'Optional. If the AI tools were used at a date earlier than the generation of this statement (e.g. a thesis or project written over several months), indicate that date here. If left blank, the use date is taken to be the generation date.',
      step6UseDateLabel: 'Date of use (optional)',
    },
    teacher: {
      step0CourseType: 'What kind of programme is this?',
      step0CourseTypeHelp: 'Select the type of programme so the generated clause uses the appropriate terminology.',
      courseType: {
        uc_undergrad: 'Undergraduate course unit',
        uc_master: 'Master’s course unit',
        uc_phd: 'Doctoral course unit',
        cpd: 'Continuing Professional Development course',
        microcredential: 'Microcredential',
        other: 'Other',
      },
      step1: 'What is the course-unit level?',
      level: {
        undergraduate: 'Undergraduate',
        postgraduate: 'Master’s',
        doctoral: 'Doctoral',
      },
      step2: 'What type of work will be assessed?',
      step2Help: 'Select all that apply (a course-unit can combine several).',
      assignment: {
        essay: 'Essay',
        report: 'Report',
        data_analysis: 'Data analysis',
        code: 'Code / programming',
        presentation: 'Presentation',
        case_discussion: 'Clinical case discussion',
        clinical_simulation: 'Clinical simulation',
        portfolio: 'Portfolio',
        poster: 'Poster',
        reflective_journal: 'Reflective journal',
        other: 'Other',
      },
      step3: 'What will the AI-use policy be?',
      policy: {
        not_permitted: 'Not permitted',
        with_disclosure: 'Permitted with full disclosure',
        without_restrictions: 'Permitted without specific restrictions',
      },
      step4: 'Which skills must be student-generated?',
      step4Help: 'Select and/or add the skills that must be the work of the student(s).',
      skills: {
        critical_thinking: 'Critical thinking and argumentation',
        clinical_reasoning: 'Clinical reasoning',
        original_writing: 'Original writing',
        data_interpretation: 'Interpretation of results',
        bibliography: 'Bibliography selection and synthesis',
        oral_presentation: 'Oral presentation',
        metacognition: 'Metacognitive reflection',
        inter_professional_communication: 'Interprofessional communication',
        patient_communication: 'Communication with patients',
        ethics_reasoning: 'Ethical reasoning',
      },
      skillsOther: 'Other (please specify)',
    },
    researcher: {
      step1: 'What type of activity?',
      activity: {
        manuscript: 'Manuscript writing',
        grant: 'Grant application',
        review: 'Systematic review / literature search',
        data_analysis: 'Data analysis / coding',
        abstract: 'Conference abstract',
        protocol: 'Research protocol',
        thesis_chapter: 'Thesis / dissertation chapter',
        book_chapter: 'Book chapter',
        software: 'Software / analysis code',
        dataset_documentation: 'Dataset documentation',
        poster_scientific: 'Scientific poster',
        presentation_scientific: 'Scientific oral presentation',
        other: 'Other',
      },
      step2: 'For which tasks did you use AI?',
      step2Help: 'Select all that apply.',
      tasks: {
        literature_search: 'Literature searching',
        drafting: 'Drafting',
        editing: 'Editing / language polishing',
        translation: 'Translation',
        statistics: 'Statistical analysis',
        coding: 'Coding',
        figures: 'Image / figure preparation',
        other: 'Other',
      },
      step3: 'Which tools did you use?',
      step3Help: 'Indicate the name and, where possible, the version of the tools.',
      step3Placeholder: 'For example: ChatGPT 4o; Elicit; R copilot',
      step4: 'Who is the disclosure for?',
      promptsRefLabel: 'URL or reference of prompts and interaction log (optional)',
      promptsRefPlaceholder: 'E.g., https://… or "Appendix 1 — Interaction log"',
      target: {
        journal: 'Journal submission (ICMJE)',
        fct: 'FCT — Fundação para a Ciência e a Tecnologia',
        horizon: 'Horizon Europe',
        wellcome: 'Wellcome Trust',
        institutional: 'Institutional report',
        conference: 'Conference submission',
        book: 'Book publisher submission',
        repository: 'Repository deposit (Zenodo, OSF, …)',
        phd_jury: 'Doctoral examination committee',
        master_jury: 'Master’s examination committee',
      },
      step5UseDate: 'When did the main use occur?',
      step5UseDateHelp: 'Optional. Indicate the date on which the main use of the tools occurred (e.g. during the drafting of a manuscript over several months). If left blank, the use date is taken to be the generation date of this statement.',
      step5UseDateLabel: 'Date of use (optional)',
    },
    risk: {
      heading: 'Institutional assessment — Level',
      levelShort: 'Level',
      cleanHeading: 'Institutional assessment — no alerts',
      cleanBody: 'Your selections did not trigger any FMUP framework rule. Please still review the statement before using it.',
      unavailableHeading: 'Institutional assessment unavailable',
      unavailableBody: 'policy.json could not be loaded (file:// access or missing file). The tool still works; automatic risk classification will be disabled.',
      guidanceFoot: 'Guiding warnings — they do not block statement generation. Final responsibility is the user’s.',
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
