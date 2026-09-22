// UI controller. Plain DOM string-templating, no framework — kept
// consistent with the rest of this prototype (rough functional build,
// static/in-memory data, no backend).

const STRENGTH_LABEL = {
  verified: { de: 'Verifiziert', en: 'Verified' },
  demonstrated: { de: 'Nachgewiesen', en: 'Demonstrated' },
  'self-reported': { de: 'Selbstauskunft', en: 'Self-reported' },
};
const STRENGTH_CLASS = { verified: 'badge-verified', demonstrated: 'badge-demonstrated', 'self-reported': 'badge-self' };
const ART_LABEL_DE = { sprache: 'Sprache', verhalten: 'Verhalten', physisch: 'Physisch', fachlich: 'Fachlich' };

let DB = null;
const STATE = {
  screen: 'home',
  studentId: 'S-3001',
  answerLanguage: null,
  languageForced: false,
  questionQueue: [],
  qIndex: 0,
  showingFollowUp: false,
  answers: {}, // requirement_code -> { main, followUp }
  currentJobId: null,
};

const app = document.getElementById('app');

function t(de, en) { return STATE.answerLanguage === 'en' ? en : de; }

function currentStudent() { return DB.studentsById[STATE.studentId]; }

function unionRequirementCodes() {
  const set = new Set();
  Object.values(DB.jobRequirements).forEach((codes) => codes.forEach((c) => set.add(c)));
  return Array.from(set).filter((c) => DB.requirements[c].art !== 'sprache');
}


function anySprachRequirementMeta() {
  const codes = new Set();
  Object.values(DB.jobRequirements).forEach((list) => list.forEach((c) => {
    if (DB.requirements[c].art === 'sprache') codes.add(c);
  }));
  // MVP has one language requirement in play (deutsch_c1); take the first if more exist.
  const code = Array.from(codes)[0];
  return code ? { code, ...LANGUAGE_REQUIREMENT_META[code] } : null;
}

async function init() {
  app.innerHTML = '<div class="loading">Lade Daten…</div>';
  const raw = await loadAllData();
  const requirements = {};
  Object.entries(raw.requirementsByCode).forEach(([code, r]) => {
    requirements[code] = { ...r, requirement_code: code, ...(REQUIREMENT_CONTENT[code] || {}) };
  });
  DB = { ...raw, requirements };
  render();
}

function render() {
  app.innerHTML = '';
  const screens = {
    home: renderHome,
    language: renderLanguage,
    category: renderCategory,
    results: renderResults,
    jobDetail: renderJobDetail,
  };
  screens[STATE.screen]();
}

function frame(innerHtml, { back } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'phone';
  wrap.innerHTML = `
    ${back ? `<button class="back-btn" id="backBtn" aria-label="Zurück">←</button>` : ''}
    ${innerHtml}
  `;
  app.appendChild(wrap);
  if (back) document.getElementById('backBtn').addEventListener('click', back);
}

// ---------------------------------------------------------------------- HOME

function renderHome() {
  const s = currentStudent();
  const age = 2026 - Number(s.geburtsjahr);
  const screeningRows = DB.screeningScope.map((p) => `
    <div class="check-row">
      <span class="check-ok">✓</span>
      <span>${p.inhalt}</span>
    </div>`).join('');

  const studentOptions = DB.students.map((st) => `<option value="${st.student_id}" ${st.student_id === STATE.studentId ? 'selected' : ''}>${st.student_id} — ${st.vorname} ${st.nachname_initial}</option>`).join('');

  frame(`
    <div class="eyebrow">Angemeldet als</div>
    <select id="studentSwitch" class="student-switch">${studentOptions}</select>

    <div class="card profile-card">
      <div class="avatar">${s.vorname[0]}${s.nachname_initial[0]}</div>
      <div>
        <div class="profile-name">${s.vorname} ${s.nachname_initial}.</div>
        <div class="profile-meta">${s.studienfach} · ${age} Jahre · ${s.stadt}</div>
        <div class="profile-meta">Deutsch ${s.sprache_deutsch} · Englisch ${s.sprache_englisch}</div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">Grund-Screening bestanden</div>
      ${screeningRows}
      <p class="muted small" style="margin-top:8px">Das sagt noch nichts über deine Eignung für einen bestimmten Job — dafür ist der Skill Fit Check da.</p>
    </div>

    <button class="cta-btn" id="startBtn">Check your Skill Fit</button>
  `);

  document.getElementById('studentSwitch').addEventListener('change', (e) => {
    STATE.studentId = e.target.value;
    render();
  });
  document.getElementById('startBtn').addEventListener('click', () => {
    STATE.questionQueue = unionRequirementCodes();
    STATE.qIndex = 0;
    STATE.showingFollowUp = false;
    STATE.answers = {};
    const meta = anySprachRequirementMeta();
    if (meta) {
      const level = currentStudent()[meta.profileField] || 'keine Angabe';
      STATE.languageForced = CEFR_RANK[level] >= CEFR_RANK[meta.level];
      if (STATE.languageForced) STATE.answerLanguage = meta.lang;
      STATE.screen = 'language';
    } else {
      STATE.answerLanguage = 'de';
      STATE.screen = 'category';
    }
    render();
  });
}

// ------------------------------------------------------------------ LANGUAGE

function renderLanguage() {
  const s = currentStudent();
  const meta = anySprachRequirementMeta();
  const level = s[meta.profileField] || 'keine Angabe';

  if (STATE.languageForced) {
    frame(`
      <div class="eyebrow">Sprachcheck</div>
      <h2 class="q-title">Dein Profil zeigt Deutsch auf Niveau „${level}".</h2>
      <p class="muted">Ein Job hier verlangt ${meta.label_de}. Statt dich erneut nach deinem Niveau zu fragen, beantwortest du die folgenden Fragen einfach auf Deutsch — deine Antworten sind der Nachweis.</p>
      <button class="cta-btn" id="okBtn">Verstanden, weiter auf Deutsch</button>
    `, { back: () => { STATE.screen = 'home'; render(); } });
    document.getElementById('okBtn').addEventListener('click', () => {
      STATE.screen = 'category';
      render();
    });
    return;
  }

  frame(`
    <div class="eyebrow">Sprachcheck</div>
    <h2 class="q-title">In welcher Sprache möchtest du die folgenden Fragen beantworten?</h2>
    <p class="muted">Dein Profil-Niveau in Deutsch (${level}) reicht für die Sprachanforderung eines Jobs aktuell nicht sicher aus — du kannst trotzdem frei wählen.</p>
    <div class="option-list">
      <button class="option-card" data-lang="de">Auf Deutsch antworten</button>
      <button class="option-card" data-lang="en">Answer in English</button>
    </div>
  `, { back: () => { STATE.screen = 'home'; render(); } });

  document.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      STATE.answerLanguage = btn.dataset.lang;
      STATE.screen = 'category';
      render();
    });
  });
}

// ------------------------------------------------------------------ CATEGORY

function renderCategory() {
  const code = STATE.questionQueue[STATE.qIndex];
  const req = DB.requirements[code];
  const lang = STATE.answerLanguage;
  const fachlichJob = DB.jobs.find((j) => (DB.jobRequirements[j.job_id] || []).includes('produkterklaerung'));

  const showingFollowUp = STATE.showingFollowUp;
  const mainText = showingFollowUp
    ? (lang === 'en' ? req.followUp_en : req.followUp_de)
    : (typeof req.main_de === 'function' ? (lang === 'en' ? req.main_en(fachlichJob) : req.main_de(fachlichJob)) : (lang === 'en' ? req.main_en : req.main_de));

  const progress = `${STATE.qIndex + 1} / ${STATE.questionQueue.length}`;

  frame(`
    <div class="eyebrow">Frage ${progress} · ${ART_LABEL_DE[req.art]}</div>
    <h2 class="q-title">${(mainText || '').replace(/\n/g, '<br>')}</h2>
    <textarea id="answerBox" class="answer-box" rows="6" placeholder="${t('Deine Antwort…', 'Your answer…')}"></textarea>
    <button class="cta-btn" id="nextBtn">${t('Weiter', 'Next')}</button>
  `, { back: () => {
    if (showingFollowUp) { STATE.showingFollowUp = false; }
    else if (STATE.qIndex > 0) { STATE.qIndex -= 1; }
    else { STATE.screen = 'home'; }
    render();
  } });

  document.getElementById('nextBtn').addEventListener('click', () => {
    const text = document.getElementById('answerBox').value.trim();
    if (!STATE.answers[code]) STATE.answers[code] = {};
    if (showingFollowUp) {
      STATE.answers[code].followUp = text;
      advance();
      return;
    }
    STATE.answers[code].main = text;

    // physisch (tablett_service): only ask the targeted follow-up if the
    // open recall answer didn't already cover the job's specific ask.
    if (req.art === 'physisch' && req.followUp_de) {
      const onTopic = containsAny(text, lang === 'en' ? req.keywords_en : req.keywords_de);
      const longEnough = wordCount(text) >= MIN_WORDS_FOR_EVIDENCE;
      if (!(onTopic && longEnough)) {
        STATE.showingFollowUp = true;
        render();
        return;
      }
    }
    advance();
  });

  function advance() {
    STATE.showingFollowUp = false;
    if (STATE.qIndex < STATE.questionQueue.length - 1) {
      STATE.qIndex += 1;
    } else {
      STATE.screen = 'results';
    }
    render();
  }
}

// ------------------------------------------------------------------- RESULTS

function evaluateJob(job) {
  const student = currentStudent();
  const checkIn = { answers: STATE.answers, answerLanguage: STATE.answerLanguage };
  const codes = DB.jobRequirements[job.job_id] || [];
  return codes.map((code) => {
    const requirement = DB.requirements[code];
    const evalResult = evaluateRequirement(requirement, student, checkIn, job);
    return { requirement, ...evalResult };
  });
}

function summarize(results) {
  const counts = { verified: 0, demonstrated: 0, 'self-reported': 0 };
  results.forEach((r) => { counts[r.strength] += 1; });
  return counts;
}

function renderResults() {
  const cards = DB.jobs.map((job) => {
    const results = evaluateJob(job);
    const counts = summarize(results);
    const summaryParts = Object.entries(counts).filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${STRENGTH_LABEL[k].de.toLowerCase()}`).join(' · ');

    return `
      <div class="card job-card" data-job="${job.job_id}">
        <div class="job-title">${job.titel}</div>
        <div class="job-meta"><span class="pin">📍</span> ${job.stadt} · ${job.datum}</div>
        <div class="job-desc">${job.beschreibung_freitext.slice(0, 110)}…</div>
        <div class="evidence-summary">${summaryParts}</div>
        <button class="row-btn" data-job="${job.job_id}">→</button>
      </div>`;
  }).join('');

  frame(`
    <div class="eyebrow">Dein Skill Fit Check ist fertig</div>
    <h2 class="q-title">Jobs & wie gut deine Angaben dazu passen</h2>
    <p class="muted small">Kein Score, kein Bestanden/Nicht bestanden — nur ehrliche Evidenzstärke pro Anforderung.</p>
    ${cards}
  `, { back: () => { STATE.screen = 'home'; render(); } });

  document.querySelectorAll('[data-job]').forEach((el2) => {
    el2.addEventListener('click', () => {
      STATE.currentJobId = el2.dataset.job;
      STATE.screen = 'jobDetail';
      render();
    });
  });
}

// ---------------------------------------------------------------- JOB DETAIL

function renderJobDetail() {
  const job = DB.jobs.find((j) => j.job_id === STATE.currentJobId);
  const results = evaluateJob(job);

  const rows = results.map((r) => {
    const code = r.requirement.requirement_code;
    const ans = STATE.answers[code];
    const answerText = r.requirement.art === 'sprache'
      ? `Profil-Selbstrating: ${r.studentLevel}`
      : [ans && ans.main, ans && ans.followUp].filter(Boolean).join(' / ') || '(keine Antwort)';
    const method = METHOD_BY_ART[r.requirement.art];

    return `
      <div class="req-row">
        <div class="req-row-head">
          <span class="art-tag">${ART_LABEL_DE[r.requirement.art]}</span>
          <span class="badge ${STRENGTH_CLASS[r.strength]}">${STRENGTH_LABEL[r.strength].de}</span>
        </div>
        <div class="req-text">${r.requirement.requirement_text}</div>
        <div class="muted small">Methode: ${method.label_de}</div>
        <div class="answer-quote">„${answerText}"</div>
        <div class="muted small">${r.note_de}</div>
      </div>`;
  }).join('');

  frame(`
    <div class="eyebrow">${job.job_type} · ${job.stadt}</div>
    <h2 class="q-title">${job.titel}</h2>
    <p class="muted">${job.datum} · ${job.slots} Plätze</p>
    <div class="card" style="margin-bottom:16px">${job.beschreibung_freitext}</div>
    ${rows}
  `, { back: () => { STATE.screen = 'results'; render(); } });
}

init();
