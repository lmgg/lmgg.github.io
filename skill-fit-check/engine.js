// ---------------------------------------------------------------------------
// The core abstraction: ONE evaluation method is chosen per requirement `art`
// (sprache / verhalten / physisch / fachlich). That method is defined once
// here and reused for every requirement of that art, on every job — a new
// job just supplies new requirement codes via job_requirements.csv, it never
// needs new evaluation logic.
//
// Every method returns an evidence strength from the same fixed vocabulary:
//   'verified'      - confirmed by an objective record (not produced by any
//                      of the four check-in methods below; reserved for e.g.
//                      document checks. Kept in the model so the UI has a
//                      real slot for it, not just decoration.)
//   'demonstrated'  - the student's own answer/action in the check-in
//                      supports the requirement (functional language use,
//                      a relevant recalled example, a live task attempt).
//   'self-reported' - all we have is what the student says about themselves
//                      (a CEFR self-rating, or an answer too thin/off-topic
//                      to count as a demonstration).
// No requirement here is ever marked pass/fail — only which of these three
// kinds of evidence backs it.
// ---------------------------------------------------------------------------

const CEFR_RANK = {
  'keine Angabe': 0, A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6, muttersprachlich: 7,
};

// The only mapping needed to turn a `sprache` requirement code into a
// language + required level. New language requirements just add a row here.
const LANGUAGE_REQUIREMENT_META = {
  deutsch_c1: { lang: 'de', level: 'C1', profileField: 'sprache_deutsch', label_de: 'Deutsch C1', label_en: 'German C1' },
};

// MVP heuristics standing in for what would be an LLM-graded rubric in
// production: real length + on-topic-keyword scoring instead of a model call.
const MIN_WORDS_FOR_EVIDENCE = 12;

function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

function containsAny(text, keywords) {
  const t = (text || '').toLowerCase();
  return keywords.some((k) => t.includes(k.toLowerCase()));
}

// Whole-word match (word-boundary), used for keywords auto-derived from job
// description text (see deriveKeywordsFromText) rather than the hand-picked,
// deliberately partial word stems in REQUIREMENT_CONTENT (e.g. 'trag' is
// meant to match 'getragen'/'trägt'). A plain substring check on generic
// derived words like 'einer' would false-positive inside 'meiner'/'seiner'.
function containsAnyWord(text, words) {
  const t = (text || '').toLowerCase();
  return words.some((w) => new RegExp(`\\b${w.toLowerCase()}\\b`, 'u').test(t));
}

// Very rough German-ness check for the functional language test: enough
// words, and at least one common German function word or umlaut. Placeholder
// for a real language-detection / LLM-graded check in production.
const GERMAN_MARKERS = ['und', 'ich', 'der', 'die', 'das', 'war', 'habe', 'eine', 'nicht', 'mit', 'für', 'ä', 'ö', 'ü', 'ß'];
function looksLikeCoherentGerman(text) {
  return wordCount(text) >= MIN_WORDS_FOR_EVIDENCE && containsAny(text, GERMAN_MARKERS);
}

// requirement.keywords_de / keywords_en are the topic markers this MVP looks
// for; see requirements-meta.js for the actual lists per requirement code.
function evaluateOpenRecall(requirement, answers, lang) {
  const combined = [answers.main, answers.followUp].filter(Boolean).join(' ');
  const keywords = lang === 'en' ? requirement.keywords_en : requirement.keywords_de;
  const onTopic = containsAny(combined, keywords);
  const longEnough = wordCount(combined) >= MIN_WORDS_FOR_EVIDENCE;

  if (!combined.trim()) {
    return { strength: 'self-reported', note_de: 'Keine Antwort gegeben.', note_en: 'No answer given.' };
  }
  if (longEnough && onTopic) {
    return { strength: 'demonstrated', note_de: 'Konkretes, thematisch passendes Beispiel genannt.', note_en: 'Gave a concrete, on-topic example.' };
  }
  return {
    strength: 'self-reported',
    note_de: 'Antwort vorhanden, aber zu kurz oder ohne erkennbaren Bezug zur Anforderung — zählt als Selbstauskunft, nicht als Beleg.',
    note_en: 'Answer given, but too short or not clearly related to the requirement — counted as self-report, not evidence.',
  };
}

function evaluateLiveTask(requirement, answers, lang, job) {
  const text = answers.main || '';
  const jobKeywords = deriveKeywordsFromText(job ? job.beschreibung_freitext : '');
  const requirementKeywords = lang === 'en' ? requirement.keywords_en : requirement.keywords_de;
  const onTopic = containsAny(text, requirementKeywords) || containsAnyWord(text, jobKeywords);
  const longEnough = wordCount(text) >= MIN_WORDS_FOR_EVIDENCE;

  if (!text.trim()) {
    return { strength: 'self-reported', note_de: 'Aufgabe nicht bearbeitet.', note_en: 'Task not attempted.' };
  }
  if (longEnough && onTopic) {
    return { strength: 'demonstrated', note_de: 'Aufgabe live bearbeitet, Erklärung passt inhaltlich zum Angebot.', note_en: 'Task attempted live, explanation matches the offer.' };
  }
  return {
    strength: 'self-reported',
    note_de: 'Versuch vorhanden, aber zu kurz oder am Thema vorbei — reicht nicht als Nachweis, nur als Selbstauskunft.',
    note_en: 'Attempt given, but too short or off-topic — not enough to count as a demonstration, only a self-report.',
  };
}

function deriveKeywordsFromText(text) {
  if (!text) return [];
  const stop = new Set([
    'und', 'der', 'die', 'das', 'mit', 'für', 'ein', 'eine', 'einer', 'einem', 'einen', 'eines',
    'sie', 'sich', 'auch', 'the', 'and', 'with', 'for', 'a', 'an', 'dieser', 'diese', 'dieses',
    'jeder', 'jede', 'jedes', 'keiner', 'seiner', 'ihrer', 'unserer', 'sollen', 'sollte', 'sollten',
    'werden', 'wurden', 'können', 'müssen', 'dürfen', 'mögen', 'worden', 'anderen', 'andere', 'stark',
  ]);
  return Array.from(new Set(
    (text.toLowerCase().match(/[a-zäöüß]{5,}/gu) || []).filter((w) => !stop.has(w)),
  )).slice(0, 15);
}

// Language requirement: reuses the profile's self-rated CEFR level rather
// than asking again. If that level already meets the job's threshold, the
// student was made to answer the category questions in that language, and
// we treat a coherent answer as a functional demonstration. Otherwise all we
// have is the self-rating.
function evaluateLanguage(requirement, student, checkIn) {
  const meta = LANGUAGE_REQUIREMENT_META[requirement.requirement_code];
  const studentLevel = student[meta.profileField] || 'keine Angabe';
  const meetsThreshold = CEFR_RANK[studentLevel] >= CEFR_RANK[meta.level];

  if (meetsThreshold && checkIn.answerLanguage === meta.lang) {
    const sample = Object.values(checkIn.answers).map((a) => [a.main, a.followUp].filter(Boolean).join(' ')).join(' ');
    if (meta.lang === 'de' ? looksLikeCoherentGerman(sample) : wordCount(sample) >= MIN_WORDS_FOR_EVIDENCE) {
      return {
        strength: 'demonstrated',
        studentLevel,
        note_de: `Profil-Level (${studentLevel}) erreicht die Anforderung; die Folgefragen wurden auf ${meta.lang === 'de' ? 'Deutsch' : 'Englisch'} beantwortet und die Antworten sind sprachlich kohärent — funktionaler Nachweis statt reinem Selbstrating.`,
        note_en: `Profile level (${studentLevel}) meets the requirement; the follow-up questions were answered in ${meta.lang === 'de' ? 'German' : 'English'} and the answers are coherent — a functional check, not just self-rating.`,
      };
    }
    return {
      strength: 'self-reported',
      studentLevel,
      note_de: 'Profil-Level erreicht die Anforderung, aber die Antworten waren zu kurz, um es funktional zu bestätigen — bleibt Selbstauskunft.',
      note_en: 'Profile level meets the requirement, but the answers were too short to confirm it functionally — stays a self-report.',
    };
  }

  return {
    strength: 'self-reported',
    studentLevel,
    note_de: meetsThreshold
      ? 'Profil-Level würde ausreichen, wurde aber nicht funktional geprüft (Folgefragen in anderer Sprache beantwortet).'
      : `Profil-Level (${studentLevel}) liegt unter der Anforderung (${meta.level}) oder ist nicht angegeben — nur Selbstauskunft aus dem Profil.`,
    note_en: meetsThreshold
      ? 'Profile level would be sufficient, but was not functionally checked (follow-ups answered in a different language).'
      : `Profile level (${studentLevel}) is below the requirement (${meta.level}) or not given — self-report from the profile only.`,
  };
}

// The one place that maps `art` -> method. Everything above is reused
// identically regardless of which job or which requirement code is involved.
const METHOD_BY_ART = {
  sprache: { key: 'sprache', label_de: 'Funktionaler Sprachcheck', label_en: 'Functional language check' },
  verhalten: { key: 'verhalten', label_de: 'Erlebte Situation (offene Frage)', label_en: 'Recalled experience (open question)' },
  physisch: { key: 'physisch', label_de: 'Erlebte Situation + ggf. Zielfrage', label_en: 'Recalled experience + optional targeted follow-up' },
  fachlich: { key: 'fachlich', label_de: 'Live-Aufgabe im Kontext', label_en: 'Live in-context task' },
};

// Evaluates one requirement for one student, given the single check-in
// answer set (collected once, reused across every job).
function evaluateRequirement(requirement, student, checkIn, job) {
  const lang = checkIn.answerLanguage;
  switch (requirement.art) {
    case 'sprache':
      return evaluateLanguage(requirement, student, checkIn);
    case 'fachlich':
      return evaluateLiveTask(requirement, checkIn.answers[requirement.requirement_code] || {}, lang, job);
    case 'physisch':
    case 'verhalten':
    default:
      return evaluateOpenRecall(requirement, checkIn.answers[requirement.requirement_code] || {}, lang);
  }
}
