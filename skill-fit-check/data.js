// Loads the five source CSVs (jobs, requirements, job_requirements, screening_scope,
// students) and parses them into in-memory arrays/maps. No backend, no database —
// this is the entire "data layer" for the prototype, exactly as delivered by ucm.

const DATA_FILES = {
  jobs: 'data/jobs.csv',
  requirements: 'data/requirements.csv',
  jobRequirements: 'data/job_requirements.csv',
  screeningScope: 'data/screening_scope.csv',
  students: 'data/students.csv',
};

// Minimal CSV parser: handles quoted fields containing commas (used by the
// German free-text columns), which a naive split(',') would break on.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      if (field !== '' || row.length > 0) pushRow();
    } else if (c === '\r') {
      // skip
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) pushRow();

  const header = rows.shift();
  return rows
    .filter((r) => r.length === header.length && r.some((v) => v !== ''))
    .map((r) => {
      const obj = {};
      header.forEach((h, idx) => { obj[h.trim()] = (r[idx] || '').trim(); });
      return obj;
    });
}

async function fetchCSV(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path}: ${res.status}`);
  return parseCSV(await res.text());
}

async function loadAllData() {
  const [jobsRaw, requirementsRaw, jobRequirementsRaw, screeningRaw, studentsRaw] =
    await Promise.all([
      fetchCSV(DATA_FILES.jobs),
      fetchCSV(DATA_FILES.requirements),
      fetchCSV(DATA_FILES.jobRequirements),
      fetchCSV(DATA_FILES.screeningScope),
      fetchCSV(DATA_FILES.students),
    ]);

  const requirementsByCode = {};
  requirementsRaw.forEach((r) => { requirementsByCode[r.requirement_code] = r; });

  const jobRequirements = {};
  jobRequirementsRaw.forEach((jr) => {
    if (!jobRequirements[jr.job_id]) jobRequirements[jr.job_id] = [];
    // job_requirements.csv repeats requirement_text/art per job; the canonical
    // requirement definition still comes from requirements.csv by code.
    jobRequirements[jr.job_id].push(jr.requirement_code);
  });

  return {
    jobs: jobsRaw,
    requirementsByCode,
    jobRequirements,
    screeningScope: screeningRaw,
    students: studentsRaw,
    studentsById: Object.fromEntries(studentsRaw.map((s) => [s.student_id, s])),
  };
}
