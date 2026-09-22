// ---------------------------------------------------------------------------
// Per-requirement-code content: the question text and the topic keywords the
// MVP heuristic looks for. This is the only per-requirement thing that
// varies — the *method* (which function evaluates the answer) is fixed by
// `art` in engine.js and is identical across jobs. Adding a new job that
// reuses an existing requirement_code (like both jobs reusing deutsch_c1)
// needs zero new code here; a genuinely new requirement code needs one entry.
// ---------------------------------------------------------------------------

const REQUIREMENT_CONTENT = {
  tablett_service: {
    keywords_de: ['tablett', 'teller', 'trag', 'kellner', 'service', 'bedient', 'stehen', 'schwer', 'balancier', 'kiste', 'umzug', 'lager', 'sport', 'fitness'],
    keywords_en: ['tray', 'plates', 'carry', 'waiter', 'waitress', 'serving', 'stand', 'heavy', 'balance', 'boxes', 'moving', 'gym', 'sports'],
    main_de: 'Beschreibe eine Situation, in der du körperlich gefordert warst – z. B. viel getragen, lange gestanden oder dich schnell bewegt hast. Job, Sport, Umzug, Alltag: egal wo.',
    main_en: 'Describe a situation where you were physically challenged — e.g. carried a lot, stood for a long time, or had to move quickly. Job, sport, moving house, everyday life — anywhere counts.',
    followUp_de: 'Diese Aufgabe bedeutet: mehrere Teller oder ein Tablett gleichzeitig tragen und über längere Zeit stehen. Hast du so etwas schon gemacht – auch privat oder im Verein? Erzähl kurz davon.',
    followUp_en: 'This role means carrying several plates or a tray at once and standing for long periods. Have you ever done something like that — even privately or in a club? Tell us briefly.',
  },
  selbststaendig: {
    keywords_de: ['allein', 'selbst', 'eigenständig', 'entschieden', 'entscheidung', 'druck', 'stress', 'schnell', 'gelöst', 'organisiert', 'verantwortung', 'ohne hilfe', 'improvisiert'],
    keywords_en: ['alone', 'myself', 'independent', 'decided', 'decision', 'pressure', 'stress', 'quickly', 'solved', 'organized', 'responsibility', 'without help', 'improvised'],
    main_de: 'Beschreibe eine Situation, in der du unter Zeitdruck selbständig eine Aufgabe lösen musstest, ohne dass dir jemand genau gesagt hat, was zu tun ist.',
    main_en: 'Describe a situation where you had to solve a task independently under time pressure, without anyone telling you exactly what to do.',
  },
  gastkontakt: {
    keywords_de: ['gast', 'gäste', 'kunde', 'kundin', 'kunden', 'freundlich', 'geholfen', 'beraten', 'beschwerde', 'lächeln', 'begrüßt', 'serviert', 'besucher'],
    keywords_en: ['guest', 'customer', 'client', 'friendly', 'helped', 'advised', 'complaint', 'smile', 'greeted', 'served', 'visitor'],
    main_de: 'Beschreibe eine Situation, in der du dich um eine fremde Person – als Gast, Kundin/Kunde oder Besucher:in – gekümmert hast. Was ist passiert?',
    main_en: 'Describe a situation where you looked after a stranger — as a guest, customer, or visitor. What happened?',
  },
  aktive_ansprache: {
    keywords_de: ['angesprochen', 'zugegangen', 'fremde', 'fremden', 'initiative', 'vorgestellt', 'kontakt', 'gefragt', 'eingeladen', 'aufgesprochen'],
    keywords_en: ['approached', 'stranger', 'strangers', 'initiative', 'introduced', 'reached out', 'asked', 'invited'],
    main_de: 'Beschreibe eine Situation, in der du von dir aus auf eine fremde Person zugegangen bist – im Job, im Ehrenamt oder im Alltag. Warum, und wie ist es gelaufen?',
    main_en: 'Describe a situation where you actively approached a stranger — at work, volunteering, or in everyday life. Why, and how did it go?',
  },
  produkterklaerung: {
    keywords_de: ['produkt', 'erklär', 'vorteil', 'ausprobieren', 'kostenlos', 'angebot', 'aktion', 'teilnehmen', 'teilnahme', 'funktioniert', 'nutzen'],
    keywords_en: ['product', 'explain', 'benefit', 'try', 'free', 'offer', 'campaign', 'participate', 'works', 'use'],
    // Function so the live task can be phrased using the actual job the
    // student is being checked against.
    main_de: (job) => `Stell dir vor, du stehst gerade am Stand für „${job.titel}" und eine Person bleibt stehen. Erklär in 2–3 Sätzen, worum es geht:\n„${job.beschreibung_freitext}"`,
    main_en: (job) => `Imagine you're at the stand for "${job.titel}" and someone stops by. Explain in 2–3 sentences what it's about:\n"${job.beschreibung_freitext}"`,
  },
};

// Adaptive opening question: a few fixed conditions, not ML. The chosen
// option reorders which category questions come first and adds a light hint
// for students with little/no formal work history.
const OPENING_OPTIONS = [
  {
    id: 'service',
    text_de: 'Ich habe schon im Service / in der Gastronomie gearbeitet (Kellnern, Catering, Events).',
    text_en: 'I’ve worked in service / hospitality before (waiting tables, catering, events).',
    priority: ['gastkontakt', 'tablett_service', 'selbststaendig', 'aktive_ansprache', 'produkterklaerung'],
  },
  {
    id: 'sales',
    text_de: 'Ich habe im Verkauf, in der Promotion oder mit viel Kundenkontakt gearbeitet.',
    text_en: 'I’ve worked in sales, promotion, or with a lot of customer contact.',
    priority: ['aktive_ansprache', 'produkterklaerung', 'gastkontakt', 'selbststaendig', 'tablett_service'],
  },
  {
    id: 'physical',
    text_de: 'Ich hatte vor allem körperliche/handwerkliche Tätigkeiten (z. B. Umzüge, Lager, Sport).',
    text_en: 'I’ve mostly done physical/manual work (e.g. moving, warehouse work, sport).',
    priority: ['tablett_service', 'selbststaendig', 'gastkontakt', 'aktive_ansprache', 'produkterklaerung'],
  },
  {
    id: 'other',
    text_de: 'Ich habe bisher vor allem im Büro/an der Uni gearbeitet oder noch gar nicht gejobbt.',
    text_en: 'I’ve mostly worked in an office/at university, or haven’t had a job yet.',
    priority: ['selbststaendig', 'gastkontakt', 'aktive_ansprache', 'tablett_service', 'produkterklaerung'],
    hint_de: 'Auch nicht-berufliche Erfahrungen zählen – Ehrenamt, Verein, Familie, Alltag.',
    hint_en: 'Non-work experience counts too — volunteering, clubs, family, everyday life.',
  },
];
