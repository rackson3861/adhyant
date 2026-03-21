/**
 * Parse PDF-extracted text into online test questions.
 *
 * Supports:
 * 1) ASAT / ALLEN-style papers: (1)(2)(3)(4) options, numbered 1–80, PART-I / SECTION-A : PHYSICS, etc.
 *    — Instructions and boilerplate are skipped; section labels are attached for the online UI.
 * 2) Legacy format: (a)(b)(c)(d), Answer: / Ans: lines, Q1. / 1. numbering.
 *
 * Output item: { id, type, question, options?, answer, min?, max?, section?, needsAnswerKey? }
 * When the PDF has no answer key, answer is null and needsAnswerKey is true (MCQ).
 */

const SECTION_MARK = "\uE000"; // private-use char unlikely in PDF text
const SECTION_END = "\uE001";

/** Strip instructions, headers/footers; insert section markers for ALLEN-style papers */
export function preprocessExamPdfText(rawText) {
  if (!rawText || typeof rawText !== "string") return "";
  let t = rawText.replace(/\r/g, " ");

  // Footers / headers (ALLEN / ASAT style)
  t = t.replace(/ASAT\s*:\s*Class-IX\s+\d+\s*\/\s*\d+/gi, " ");
  t = t.replace(/ASAT\s*:\s*Class-\w+\s+\d+\s*\/\s*\d+/gi, " ");
  t = t.replace(/AB Quest\s*:[^\n]*/gi, " ");
  t = t.replace(/Corporate Office[\s\S]*?www\.allen\.ac\.in/gi, " ");
  t = t.replace(/FORM NUMBER[^]*?Paper Code[^]*?\)/gi, " ");
  t = t.replace(/Paper Code\s*\([^)]+\)/gi, " ");
  t = t.replace(/Things NOT ALLOWED[\s\S]*?own risk/gi, " ");
  t = t.replace(/NOTE\s*:-\s*Return this Test Paper/gi, " ");

  // Skip cover / instruction pages. Prefer first real MCQ block (XII→XIII booklets mention IQ earlier in instructions).
  const firstMcqSection = /This\s+section\s+contains\s+\d+\s+Multiple\s+Choice\s+Questions/i.exec(t);
  const part1 = /PART-I\s+IQ\s*\(\s*MENTAL\s+ABILITY\s*\)/i.exec(t);
  const iqMental = /IQ\s*\(\s*Mental\s+Ability\s*\)/i.exec(t);
  const sliceIndex = firstMcqSection
    ? firstMcqSection.index
    : part1
      ? part1.index
      : iqMental
        ? iqMental.index
        : 0;
  if (sliceIndex > 0) {
    t = t.slice(sliceIndex);
  }

  // Repeated English boilerplate before each subject block → insert section labels (order = Mental, Physics, Chem, Math, Bio)
  const SECTION_BOILER =
    /This\s+section\s+contains\s+\d+\s+Multiple\s+Choice\s+Questions\.\s*Each\s+question\s+has\s+four\s+choices\s+\(1\),\s*\(2\),\s*\(3\)\s+and\s+\(4\)\s+out\s+of\s+which\s+ONLY\s+ONE\s+is\s+correct\.\s*/gi;
  const SECTION_FROM_BOILER = [
    "Part-I · Mental Ability",
    "Part-II · Physics",
    "Part-II · Chemistry",
    "Part-II · Mathematics",
    "Part-II · Biology",
  ];
  let boilerIdx = 0;
  t = t.replace(SECTION_BOILER, () => {
    const label = SECTION_FROM_BOILER[Math.min(boilerIdx, SECTION_FROM_BOILER.length - 1)] || "General";
    boilerIdx += 1;
    return `${SECTION_MARK}${label}${SECTION_END} `;
  });

  // Section markers (order matters: more specific first)
  t = t.replace(/PART-I\s+IQ\s*\(\s*MENTAL\s+ABILITY\s*\)/gi, `${SECTION_MARK}PART-I · IQ (Mental Ability)${SECTION_END}`);
  t = t.replace(/PART-II\s+SECTION-A\s*:\s*PHYSICS/gi, `${SECTION_MARK}PART-II · Physics${SECTION_END}`);
  t = t.replace(/PART-II\s+SECTION-B\s*:\s*CHEMISTRY/gi, `${SECTION_MARK}PART-II · Chemistry${SECTION_END}`);
  t = t.replace(/PART-II\s+SECTION-C\s*:\s*BIOLOGY/gi, `${SECTION_MARK}PART-II · Biology${SECTION_END}`);
  t = t.replace(/PART-II\s+SECTION-D\s*:\s*MATHEMATICS/gi, `${SECTION_MARK}PART-II · Mathematics${SECTION_END}`);
  // Continuation pages use SECTION-B without PART-II prefix
  t = t.replace(/SECTION-B\s*:\s*CHEMISTRY/gi, `${SECTION_MARK}PART-II · Chemistry${SECTION_END}`);
  t = t.replace(/SECTION-C\s*:\s*BIOLOGY/gi, `${SECTION_MARK}PART-II · Biology${SECTION_END}`);
  t = t.replace(/SECTION-D\s*:\s*MATHEMATICS/gi, `${SECTION_MARK}PART-II · Mathematics${SECTION_END}`);
  t = t.replace(/SECTION-A\s*:\s*PHYSICS/gi, `${SECTION_MARK}PART-II · Physics${SECTION_END}`);
  // "Section (A) : Physics" style (some Class XII / XIII booklets)
  t = t.replace(/Section\s*\(\s*A\s*\)\s*:\s*Physics/gi, `${SECTION_MARK}PART-II · Physics${SECTION_END}`);
  t = t.replace(/Section\s*\(\s*B\s*\)\s*:\s*Chemistry/gi, `${SECTION_MARK}PART-II · Chemistry${SECTION_END}`);
  t = t.replace(/Section\s*\(\s*C\s*\)\s*:\s*Mathematics/gi, `${SECTION_MARK}PART-II · Mathematics${SECTION_END}`);
  t = t.replace(/Section\s*\(\s*C\s*\)\s*:\s*Maths?/gi, `${SECTION_MARK}PART-II · Mathematics${SECTION_END}`);
  t = t.replace(/Section\s*\(\s*D\s*\)\s*:\s*Biology/gi, `${SECTION_MARK}PART-II · Biology${SECTION_END}`);

  // Repeated boilerplate under each section
  t = t.replace(
    /This section contains\s+\d+\s+Multiple Choice Questions\.\s*Each question has four choices \(1\), \(2\), \(3\) and \(4\) out of which ONLY ONE\s+is correct\.\s*/gi,
    " "
  );

  // Collapse whitespace (PDF line joins become spaces)
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/**
 * PDF flattening often produces false "N." matches (e.g. "100x + 50. It is released…" — the "50."
 * is a coefficient, not question 50). The "+" sits before the matched digits, so the check must
 * look at a small window that includes the match, not only text strictly before it.
 */
export function isPlausibleQuestionNumberAt(text, matchIndex) {
  const winStart = Math.max(0, matchIndex - 28);
  const snip = text.slice(winStart, matchIndex + 6);
  // "100x + 50. It" — require variable/digit before the + so we don't reject "…+ + 67. The additive…"
  const coef = /(?:[xX]|\d)\s*\+\s*(\d{1,3})\.\s/.exec(snip);
  if (coef) {
    const numInMatch = coef[1];
    const rel = coef[0].indexOf(numInMatch);
    const digitStart = winStart + coef.index + rel;
    if (digitStart === matchIndex) return false;
  }
  return true;
}

/**
 * Split ALLEN-style body into blocks starting with "N. " (1–200+; dot must be followed by whitespace, not "1.5")
 */
function findQuestionSpans(text) {
  const re = /\b([1-9]\d{0,2})\.(\s+)/g;
  const hits = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const num = parseInt(m[1], 10);
    const afterDot = m[2] || "";
    if (afterDot.length === 0) continue;
    if (num > 250) continue;
    if (!isPlausibleQuestionNumberAt(text, m.index)) continue;
    hits.push({ num, index: m.index, bodyStart: m.index + m[0].length });
  }
  // Same "N." can appear twice in flattened PDF text (footer, repeated line). Dedupe by strictly
  // increasing N while in the same section; reset when the section label changes (per-section numbering).
  const filtered = [];
  let prevNum = 0;
  let prevSection = "";
  for (let hi = 0; hi < hits.length; hi++) {
    const h = hits[hi];
    const n = h.num;
    const section = currentSectionFromIndex(text, h.index);
    if (section !== prevSection) {
      prevNum = 0;
      prevSection = section;
    }
    if (n <= prevNum) continue;
    // Stems often contain values like "80 and 120 amu" → spurious "120." between real questions
    if (prevNum > 0 && n > prevNum + 15) continue;
    filtered.push(h);
    prevNum = n;
  }
  const spans = [];
  for (let i = 0; i < filtered.length; i++) {
    const end = i + 1 < filtered.length ? filtered[i + 1].index : text.length;
    spans.push({
      num: filtered[i].num,
      questionStartIndex: filtered[i].index,
      raw: text.slice(filtered[i].bodyStart, end).trim()
    });
  }
  return spans;
}

function currentSectionFromIndex(text, pos) {
  const re = new RegExp(`${SECTION_MARK}([^${SECTION_END}]+)${SECTION_END}`, "g");
  let section = "General";
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index <= pos) section = m[1].trim();
    else break;
  }
  return section;
}

/** Extract (1)…(2)…(3)…(4) options from one question block */
function extractNumericOptions(block) {
  const positions = [];
  for (let i = 1; i <= 4; i++) {
    const re = new RegExp(`\\(${i}\\)\\s*`);
    const match = block.match(re);
    if (!match) return null;
    const idx = block.search(re);
    if (idx < 0) return null;
    positions.push({ n: i, start: idx, labelEnd: idx + match[0].length });
  }
  const stem = block.slice(0, positions[0].start).trim();
  const options = [];
  for (let i = 0; i < 4; i++) {
    const from = positions[i].labelEnd;
    const to = i < 3 ? positions[i + 1].start : block.length;
    let text = block.slice(from, to).trim();
    text = text.replace(/\s+/g, " ").trim();
    options.push(text);
  }
  return { stem, options };
}

/** Fallback: (a)(b)(c)(d) in block */
function extractLetterOptions(block) {
  const positions = [];
  for (const letter of ["a", "b", "c", "d"]) {
    const re = new RegExp(`\\(${letter}\\)\\s*`, "i");
    const idx = block.search(re);
    if (idx < 0) return null;
    const match = block.match(re);
    positions.push({ start: idx, labelEnd: idx + match[0].length });
  }
  const stem = block.slice(0, positions[0].start).trim();
  const options = [];
  for (let i = 0; i < 4; i++) {
    const from = positions[i].labelEnd;
    const to = i < 3 ? positions[i + 1].start : block.length;
    options.push(block.slice(from, to).trim().replace(/\s+/g, " "));
  }
  return { stem, options };
}

function normalizeOptionsForUi(options) {
  return options.map((o, i) => {
    if (o && o.length > 0) return o;
    return `Choice ${i + 1} (refer to figure in original paper if needed)`;
  });
}

function parseAnswerFromBlock(block) {
  // Require ":" so we don't match "ans" inside words like "means"
  const answerMatch = block.match(/(?:^|\s)(?:Answer|Ans\.?)\s*:\s*(.+)$/i);
  if (!answerMatch) return { answerText: "", hasLine: false };
  return { answerText: answerMatch[1].trim(), hasLine: true, full: answerMatch[0] };
}

function normalizeMcqAnswer(ans, options) {
  const a = (ans || "").trim();
  if (!a) return null;
  const lower = a.toLowerCase();
  const optMap = { a: 0, b: 1, c: 2, d: 3, "1": 0, "2": 1, "3": 2, "4": 3 };
  if (optMap[lower] !== undefined) return options[optMap[lower]];
  const n = parseInt(lower, 10);
  if (n >= 1 && n <= 4 && options[n - 1]) return options[n - 1];
  const match = options.find((o) => o.toLowerCase() === lower || o === a);
  if (match) return match;
  return null;
}

export function parseAllenMcqFromSpan(rawBlock, section, qIndex, paperQuestionNum) {
  const { answerText, hasLine } = parseAnswerFromBlock(rawBlock);
  let work = rawBlock;
  if (hasLine) {
    work = work.replace(/(?:^|\s)(?:Answer|Ans\.?)\s*:\s*.+$/i, "").trim();
  }

  let parsed = extractNumericOptions(work);
  if (!parsed) parsed = extractLetterOptions(work);

  let stem;
  let options;
  let type = "mcq";

  if (!parsed) {
    const intGuess = work.match(/(?:^|\s)(?:Answer|Ans\.?)\s*:\s*(-?\d+)\s*$/i);
    if (intGuess) {
      const n = parseInt(intGuess[1], 10);
      const clean = work.replace(/(?:^|\s)(?:Answer|Ans\.?)\s*:\s*-?\d+\s*$/i, "").trim();
      return {
        id: `q${qIndex}`,
        type: "integer",
        question: clean.slice(0, 500) || `Question ${paperQuestionNum}`,
        answer: n,
        min: Math.min(0, n - 100),
        max: Math.max(999, n + 100),
        needsAnswerKey: false,
        section,
        paperQuestionNum,
      };
    }
    stem = work.replace(/\s+/g, " ").trim().slice(0, 400) || `Question ${paperQuestionNum}`;
    options = ["(1)", "(2)", "(3)", "(4)"].map((l, i) => `Choice ${i + 1} ${l} — see image`);
  } else {
    ({ stem, options } = parsed);
    stem = stem.replace(/\s+/g, " ").trim();
    options = normalizeOptionsForUi(options);
    if (stem.length < 3) stem = `Question ${paperQuestionNum}`;
  }

  let answer = hasLine && parsed ? normalizeMcqAnswer(answerText, options) : null;
  if (answer === undefined) answer = null;

  return {
    id: `q${qIndex}`,
    type,
    question: stem,
    options,
    answer: answer !== null ? answer : null,
    needsAnswerKey: type === "mcq" && (!hasLine || answer === null),
    section,
    paperQuestionNum,
  };
}

export function parseAllenAsatStyle(rawText) {
  const text = preprocessExamPdfText(rawText);
  if (!text || text.length < 80) return [];

  const spans = findQuestionSpans(text);
  const out = [];
  let qIndex = 0;

  for (const { raw, questionStartIndex, num } of spans) {
    const section = currentSectionFromIndex(text, questionStartIndex);
    const q = parseAllenMcqFromSpan(raw, section, ++qIndex, num);
    if (q) out.push(q);
  }

  return out;
}

function parseOneLegacyBlock(block, index) {
  const id = "q" + index;
  const answerMatch = block.match(/(?:^|\s)(?:Answer|Ans\.?)\s*:\s*(.+)$/i);
  let answerText = answerMatch ? answerMatch[1].trim() : "";
  let questionText = block;
  if (answerMatch) {
    questionText = block.slice(0, block.indexOf(answerMatch[0])).trim();
  }

  let optionBlocks = block.match(/(?:\([a-d]\)|[a-d][.)])\s*[^\n]+/gi);
  let options = [];
  if (optionBlocks && optionBlocks.length >= 2) {
    options = optionBlocks.map((o) => o.replace(/^[a-d][.)]\s*|^\([a-d]\)\s*/i, "").trim()).filter(Boolean);
  }
  if (options.length >= 2 && options.length <= 6) {
    const answer = normalizeMcqAnswer(answerText, options);
    const cleanQ = questionText
      .replace(/(?:\([a-d]\)|[a-d][.)])\s*[^\n]+/gi, "")
      .replace(/(?:^|\s)(?:Answer|Ans\.?)\s*:\s*.+$/i, "")
      .trim();
    if (cleanQ.length > 5) {
      return {
        id,
        type: "mcq",
        question: cleanQ,
        options,
        answer: answer || options[0],
        needsAnswerKey: false,
        paperQuestionNum: index,
      };
    }
  }

  const numMatch = answerText.match(/-?\d+/);
  const intAnswer = numMatch ? parseInt(numMatch[0], 10) : null;
  const cleanQ2 = questionText.replace(/(?:^|\s)(?:Answer|Ans\.?)\s*:\s*.+$/i, "").trim();
  if (cleanQ2.length > 5) {
    return {
      id,
      type: "integer",
      question: cleanQ2,
      answer: intAnswer !== null ? intAnswer : 0,
      min: 0,
      max: 999,
      paperQuestionNum: index,
    };
  }

  return null;
}

function parseLegacyLineBased(fullText) {
  const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const text = lines.join("\n");
  const questionBlocks = text.split(/\n(?=\d+[.)]\s|\nQ\d+[.)]\s|Question\s*\d+[.)]\s)/i).filter(Boolean);
  const questions = [];
  questionBlocks.forEach((block, idx) => {
    const q = parseOneLegacyBlock(block.trim(), idx + 1);
    if (q) questions.push(q);
  });
  if (questions.length === 0 && fullText.length > 50) {
    const parts = fullText.split(/\n\s*\n+/);
    parts.forEach((p, i) => {
      const q = parseOneLegacyBlock(p, i + 1);
      if (q) questions.push(q);
    });
  }
  return questions;
}

/**
 * Main entry: try ALLEN/ASAT pipeline first, then legacy heuristics on original text.
 */
export function parseTextToQuestions(rawText) {
  if (!rawText || typeof rawText !== "string") return [];

  const allen = parseAllenAsatStyle(rawText);
  if (allen.length >= 8) {
    return renumberIds(allen);
  }

  const legacy = parseLegacyLineBased(rawText);
  return renumberIds(legacy);
}

function renumberIds(questions) {
  return questions.map((q, i) => ({
    ...q,
    id: `q${i + 1}`,
    paperQuestionNum: q.paperQuestionNum != null ? q.paperQuestionNum : i + 1
  }));
}

/** For instructions UI: counts per `section` on each question. */
export function countQuestionsBySection(questions) {
  if (!Array.isArray(questions)) return [];
  const map = new Map();
  for (const q of questions) {
    const s = (q.section && String(q.section).trim()) || "General";
    map.set(s, (map.get(s) || 0) + 1);
  }
  return Array.from(map.entries()).map(([section, count]) => ({ section, count }));
}
