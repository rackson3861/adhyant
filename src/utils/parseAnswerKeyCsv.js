/**
 * Answer-key CSV format (e.g. Class9.csv):
 *   Question Number,Answer Key
 *   1,2
 *   2,3
 * For MCQ, Answer Key is option index 1–4 → mapped to options[index - 1] text for scoring.
 * For integer-type questions, Answer Key is the numeric answer.
 */

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (!inQ && c === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function normalizeHeader(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {string} text - full CSV file contents
 * @returns {{ rows: { questionNumber: number, answerKey: string }[], error: string | null }}
 */
export function parseAnswerKeyCsv(text) {
  if (!text || typeof text !== "string") {
    return { rows: [], error: "Empty file." };
  }
  const lines = text.split(/\r?\n/).filter((l) => String(l).trim() !== "");
  if (lines.length < 2) {
    return { rows: [], error: "CSV needs a header row and at least one data row." };
  }

  const headerCells = parseCsvLine(lines[0]).map(normalizeHeader);
  let qCol = headerCells.findIndex(
    (h) => h === "question number" || (h.includes("question") && h.includes("number")) || /^q\.?\s*no\.?$/.test(h)
  );
  let aCol = headerCells.findIndex(
    (h) => h === "answer key" || (h.includes("answer") && h.includes("key")) || h === "key" || h === "answer"
  );
  if (qCol < 0) qCol = 0;
  if (aCol < 0) aCol = headerCells.length > 1 ? 1 : -1;
  if (aCol < 0) {
    return { rows: [], error: "Could not find an Answer Key column. Use headers like “Question Number” and “Answer Key”." };
  }

  const rows = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvLine(lines[li]);
    const qStr = (cells[qCol] ?? "").trim();
    const aStr = (cells[aCol] ?? "").trim();
    if (qStr === "" && aStr === "") continue;
    const qn = parseInt(qStr, 10);
    if (Number.isNaN(qn) || qn < 1) continue;
    if (aStr === "") continue;
    rows.push({ questionNumber: qn, answerKey: aStr });
  }

  if (rows.length === 0) {
    return {
      rows: [],
      error: "No valid rows. Expected numbered questions and answers (e.g. 1,2 for Q1 option 2).",
    };
  }
  return { rows, error: null };
}

function findQuestionIndex(questions, paperQuestionNum) {
  const n = Number(paperQuestionNum);
  if (!n || n < 1 || !Array.isArray(questions)) return -1;
  const byNum = questions.findIndex((q) => q && Number(q.paperQuestionNum) === n);
  if (byNum >= 0) return byNum;
  if (n <= questions.length) return n - 1;
  return -1;
}

/**
 * Map CSV cell to stored answer: MCQ → option text (1–4), integer → number.
 */
export function csvAnswerCellToQuestionAnswer(question, answerKeyCell) {
  const raw = String(answerKeyCell ?? "").trim();
  if (raw === "") return null;
  const type = question?.type === "integer" ? "integer" : "mcq";

  if (type === "integer") {
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
  }

  const choice = parseInt(raw, 10);
  const opts = Array.isArray(question?.options) ? question.options : [];
  if (!Number.isNaN(choice) && choice >= 1 && choice <= opts.length) {
    const opt = opts[choice - 1];
    return opt !== undefined && opt !== null ? String(opt) : null;
  }

  // Non-numeric: treat as literal option text (if CSV uses full option string)
  return raw;
}

/**
 * Build payload for uploadPaperAnswerKey from paper questions + CSV rows.
 * @param {object[]} questions - from getPaper (options required; answers may be stripped)
 * @param {{ questionNumber: number, answerKey: string }[]} rows
 * @returns {{ paperQuestionNum: number, answer: string|number, type: string, questionIndex?: number }[]}
 */
export function buildKeyQuestionsFromCsvRows(questions, rows) {
  if (!Array.isArray(questions) || !Array.isArray(rows)) return [];
  const keyQuestions = [];
  for (const row of rows) {
    const idx = findQuestionIndex(questions, row.questionNumber);
    if (idx < 0) continue;
    const q = questions[idx];
    const answer = csvAnswerCellToQuestionAnswer(q, row.answerKey);
    if (answer === null || answer === undefined) continue;
    const pnum =
      q.paperQuestionNum != null && !Number.isNaN(Number(q.paperQuestionNum))
        ? Number(q.paperQuestionNum)
        : row.questionNumber;
    keyQuestions.push({
      paperQuestionNum: pnum,
      questionIndex: idx,
      answer,
      type: q.type === "integer" ? "integer" : "mcq",
    });
  }
  return keyQuestions;
}
