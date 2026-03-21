/**
 * Parse PDF-extracted text into online test questions.
 *
 * Supports:
 * 1) ASAT / ALLEN-style papers: (1)(2)(3)(4) options, numbered 1–80, PART-I / SECTION-A : PHYSICS, etc.
 *    — Instructions and boilerplate are skipped; section labels are attached for the online UI.
 * 2) Legacy format: (a)(b)(c)(d), Answer: / Ans: lines, Q1. / 1. numbering.
 *
 * Output item: { id, type, question, options?, answer, correctChoice?, min?, max?, section?, needsAnswerKey? }
 * correctChoice: "1"|"2"|"3"|"4" when known (for scoring with numeric student response).
 * When the PDF has no answer key, answer is null and needsAnswerKey is true (MCQ).
 */

const SECTION_MARK = "\uE000"; // private-use char unlikely in PDF text
const SECTION_END = "\uE001";

/**
 * Canonical section bucket for grouping (palette, counts). Maps many PDF variants to one key.
 */
export function normalizeQuestionSection(raw) {
  if (raw == null) return "general";
  const s = String(raw).trim().toLowerCase();
  if (!s || s === "general") return "general";

  /** Part II first so "Part II" is never mistaken for "Part I". */
  if (/part[-\s]*ii\b|part[-\s]*2\b/.test(s)) {
    if (/\bphysics\b/.test(s)) return "part2-physics";
    if (/\bchemistry\b/.test(s)) return "part2-chemistry";
    if (/\bmathematics\b|\bmaths?\b/.test(s)) return "part2-math";
    if (/\bbiology\b|\bbotany\b|\bzoology\b/.test(s)) return "part2-biology";
  }
  /** Do not use bare `mental` — it matches inside "environmental", "fundamental", etc. */
  if (
    /\bmental\s+ability\b/.test(s) ||
    /^mental$/i.test(s) ||
    /\biq\s*\(\s*mental/i.test(s) ||
    /part[-\s]*i\s*[·.:]?\s*(iq|mental)/i.test(s) ||
    (/\bpart\s*[-_]?\s*i\b/i.test(s) && /\bmental\b/.test(s))
  ) {
    return "part1-mental";
  }
  if (/\bphysics\b/.test(s)) return "part2-physics";
  if (/\bchemistry\b/.test(s)) return "part2-chemistry";
  if (/\bmathematics\b|\bmaths?\b/.test(s)) return "part2-math";
  if (/\bbiology\b|\bbotany\b|\bzoology\b/.test(s)) return "part2-biology";

  return `other:${s.slice(0, 64)}`;
}

/** Palette / instruction labels — subject only (no Part I / Part II). */
export function paletteSectionDisplay(sectionKey, originalRaw) {
  if (!sectionKey || sectionKey === "general") return "General";
  const labels = {
    "part1-mental": "Mental Ability",
    "part2-physics": "Physics",
    "part2-chemistry": "Chemistry",
    "part2-math": "Maths",
    "part2-biology": "Biology",
  };
  if (labels[sectionKey]) return labels[sectionKey];
  if (String(sectionKey).startsWith("other:")) {
    const rest = String(sectionKey).slice(6).trim();
    const raw = (originalRaw && String(originalRaw).trim()) || "";
    const rawL = raw.toLowerCase();
    if ((/\bmental\s+ability\b|^mental$/i.test(rawL) || /\biq\b/i.test(rawL)) && !/part[-\s]*ii/i.test(rawL)) return "Mental Ability";
    if (/\bphysics\b/i.test(rawL)) return "Physics";
    if (/\bchemistry\b/i.test(rawL)) return "Chemistry";
    if (/\bmathematics\b|\bmaths?\b/i.test(rawL)) return "Maths";
    if (/\bbiology\b|\bbotany\b|\bzoology\b/i.test(rawL)) return "Biology";
    const pretty = rest ? rest.replace(/\b\w/g, (c) => c.toUpperCase()) : "";
    return pretty || "Other";
  }
  const o = (originalRaw && String(originalRaw).trim()) || "";
  return o || "Other";
}

/**
 * Class IX / X (80-Q booklets): Mental → Physics → Chemistry → Biology → Maths.
 */
export const SECTION_PALETTE_ORDER_CLASS_9_10 = [
  "part1-mental",
  "part2-physics",
  "part2-chemistry",
  "part2-biology",
  "part2-math",
  "general",
];

/**
 * Class XI / XII / XIII: Mental → Physics → Chemistry → Maths → Biology.
 */
export const SECTION_PALETTE_ORDER_CLASS_11_12_13 = [
  "part1-mental",
  "part2-physics",
  "part2-chemistry",
  "part2-math",
  "part2-biology",
  "general",
];

/** @deprecated Use SECTION_PALETTE_ORDER_CLASS_9_10 or getSectionPaletteOrderForPaperId */
export const SECTION_PALETTE_ORDER = SECTION_PALETTE_ORDER_CLASS_9_10;

/**
 * Sidebar palette section order by paper id (slug), e.g. abquest-class-ix-… vs abquest-class-xii-….
 */
export function getSectionPaletteOrderForPaperId(paperId) {
  const id = String(paperId || "").toLowerCase();
  if (/^abquest-class-xiii/.test(id)) return SECTION_PALETTE_ORDER_CLASS_11_12_13;
  if (/^abquest-class-xii/.test(id)) return SECTION_PALETTE_ORDER_CLASS_11_12_13;
  if (/^abquest-class-xi(-|$)/.test(id)) return SECTION_PALETTE_ORDER_CLASS_11_12_13;
  if (/^abquest-class-ix/.test(id)) return SECTION_PALETTE_ORDER_CLASS_9_10;
  if (/^abquest-class-x(-|$)/.test(id)) return SECTION_PALETTE_ORDER_CLASS_9_10;
  if (/(class-xiii|class-xii|class-xi-|class-13|class-12|class-11)(?:-|$)/i.test(id)) {
    return SECTION_PALETTE_ORDER_CLASS_11_12_13;
  }
  return SECTION_PALETTE_ORDER_CLASS_9_10;
}

/**
 * Official NASCENT / ABQuest Class IX & X (80 questions) section by printed question number.
 */
export function nascentClass80SectionForPaperNumber(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 1) return null;
  if (x <= 20) return "Mental Ability";
  if (x <= 35) return "Physics";
  if (x <= 50) return "Chemistry";
  if (x <= 65) return "Biology";
  return "Maths";
}

/**
 * Force correct sections for bundled 80-Q Class IX / X papers (ignores wrong PDF-derived sections).
 */
export function applyNascentClass80SectionOverrides(paperId, questions) {
  if (!Array.isArray(questions) || questions.length !== 80) return questions;
  const id = String(paperId || "").toLowerCase();
  const isIx = /^abquest-class-ix-/.test(id);
  const isX = /^abquest-class-x(-|$)/.test(id) && !/^abquest-class-xi/.test(id);
  if (!isIx && !isX) return questions;
  return questions.map((q) => {
    const n = Number(q.paperQuestionNum != null ? q.paperQuestionNum : q.num != null ? q.num : NaN);
    const sec = nascentClass80SectionForPaperNumber(n);
    if (!sec) return q;
    return { ...q, section: sec };
  });
}

/** MCQ labels only — stem and option text come from the question image, not parsed PDF text. */
const IMAGE_MCQ_OPTIONS = ["1", "2", "3", "4"];

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

  // Explicit part/section headers first (markers store display names only — no Part I/II).
  t = t.replace(/PART-I\s+IQ\s*\(\s*MENTAL\s+ABILITY\s*\)/gi, `${SECTION_MARK}Mental Ability${SECTION_END}`);
  t = t.replace(/PART-II\s+SECTION-A\s*:\s*PHYSICS/gi, `${SECTION_MARK}Physics${SECTION_END}`);
  t = t.replace(/PART-II\s+SECTION-B\s*:\s*CHEMISTRY/gi, `${SECTION_MARK}Chemistry${SECTION_END}`);
  t = t.replace(/PART-II\s+SECTION-C\s*:\s*BIOLOGY/gi, `${SECTION_MARK}Biology${SECTION_END}`);
  t = t.replace(/PART-II\s+SECTION-D\s*:\s*MATHEMATICS/gi, `${SECTION_MARK}Maths${SECTION_END}`);
  // Some papers swap C/D for Math vs Bio
  t = t.replace(/PART-II\s+SECTION-C\s*:\s*MATHEMATICS/gi, `${SECTION_MARK}Maths${SECTION_END}`);
  t = t.replace(/PART-II\s+SECTION-D\s*:\s*BIOLOGY/gi, `${SECTION_MARK}Biology${SECTION_END}`);
  t = t.replace(/SECTION-B\s*:\s*CHEMISTRY/gi, `${SECTION_MARK}Chemistry${SECTION_END}`);
  t = t.replace(/SECTION-C\s*:\s*BIOLOGY/gi, `${SECTION_MARK}Biology${SECTION_END}`);
  t = t.replace(/SECTION-C\s*:\s*MATHEMATICS/gi, `${SECTION_MARK}Maths${SECTION_END}`);
  t = t.replace(/SECTION-D\s*:\s*MATHEMATICS/gi, `${SECTION_MARK}Maths${SECTION_END}`);
  t = t.replace(/SECTION-D\s*:\s*BIOLOGY/gi, `${SECTION_MARK}Biology${SECTION_END}`);
  t = t.replace(/SECTION-A\s*:\s*PHYSICS/gi, `${SECTION_MARK}Physics${SECTION_END}`);
  t = t.replace(/Section\s*\(\s*A\s*\)\s*:\s*Physics/gi, `${SECTION_MARK}Physics${SECTION_END}`);
  t = t.replace(/Section\s*\(\s*B\s*\)\s*:\s*Chemistry/gi, `${SECTION_MARK}Chemistry${SECTION_END}`);
  t = t.replace(/Section\s*\(\s*C\s*\)\s*:\s*Mathematics/gi, `${SECTION_MARK}Maths${SECTION_END}`);
  t = t.replace(/Section\s*\(\s*C\s*\)\s*:\s*Maths?/gi, `${SECTION_MARK}Maths${SECTION_END}`);
  t = t.replace(/Section\s*\(\s*D\s*\)\s*:\s*Biology/gi, `${SECTION_MARK}Biology${SECTION_END}`);
  t = t.replace(/Section\s*\(\s*C\s*\)\s*:\s*Biology/gi, `${SECTION_MARK}Biology${SECTION_END}`);
  t = t.replace(/Section\s*\(\s*D\s*\)\s*:\s*Mathematics/gi, `${SECTION_MARK}Maths${SECTION_END}`);

  // Boilerplate before each block — infer subject from following text; fallback to fixed sequence.
  const SECTION_BOILER =
    /This\s+section\s+contains\s+\d+\s+Multiple\s+Choice\s+Questions\.\s*Each\s+question\s+has\s+four\s+choices\s+\(1\),\s*\(2\),\s*\(3\)\s+and\s+\(4\)\s+out\s+of\s+which\s+ONLY\s+ONE\s+is\s+correct\.\s*/gi;
  /**
   * When explicit PART-II / SECTION headers were already turned into markers, the same block of PDF
   * text often repeats the MCQ boiler immediately after. Emitting a second marker here used
   * SECTION_FROM_BOILER (or weak lookahead) and overwrote the real subject — e.g. Biology → Mathematics
   * for Class IX (q45–50 still "Chemistry" from an earlier wrong marker chain).
   */
  const BOILER_LOOKBACK = 1100;
  const SECTION_FROM_BOILER = [
    "Mental Ability",
    "Physics",
    "Chemistry",
    "Maths",
    "Biology",
  ];
  let boilerIdx = 0;
  t = t.replace(SECTION_BOILER, (match, offset, fullStr) => {
    const before = fullStr.slice(Math.max(0, offset - BOILER_LOOKBACK), offset);
    const lastMark = before.lastIndexOf(SECTION_MARK);
    if (lastMark !== -1) {
      const fromMark = before.slice(lastMark);
      if (fromMark.includes(SECTION_END)) {
        return " ";
      }
    }
    const look = fullStr.slice(offset + match.length, offset + match.length + 900).toLowerCase();
    let label = null;
    if (/\bphysics\b|section\s*\(?\s*a\s*\)?\s*[:.]?\s*phys|part-ii\s+section-a\s*:\s*phys/.test(look)) label = "Physics";
    else if (/\bchemistry\b|\bchem\b|section\s*\(?\s*b\s*\)?\s*[:.]?\s*chem|part-ii\s+section-b\s*:\s*chem/.test(look)) label = "Chemistry";
    // Class IX often uses Section (C)=Biology, (D)=Mathematics; some papers swap — match both letters for each subject.
    // Prefer biology before loose "mathematics" / "maths" matches (stems may mention "mathematical").
    else if (
      /\bbiology\b|\bbotany\b|\bzoology\b|section\s*\(?\s*[cd]\s*\)?\s*[:.]?\s*bio|part-ii\s+section-[cd]\s*:\s*bio/.test(look)
    )
      label = "Biology";
    else if (
      /\bmathematics\b|\bmaths?\b|section\s*\(?\s*[cd]\s*\)?\s*[:.]?\s*math|part-ii\s+section-[cd]\s*:\s*math/.test(look)
    )
      label = "Maths";
    else if (/mental|ability|iq\s*\(|part\s*[-_]?\s*i\b/.test(look)) label = "Mental Ability";
    if (!label) {
      label = SECTION_FROM_BOILER[Math.min(boilerIdx, SECTION_FROM_BOILER.length - 1)] || "General";
    }
    boilerIdx += 1;
    return `${SECTION_MARK}${label}${SECTION_END} `;
  });

  // Repeated boilerplate under each section (variant spacing)
  t = t.replace(
    /This section contains\s+\d+\s+Multiple Choice Questions\.\s*Each question has four choices \(1\), \(2\), \(3\) and \(4\) out of which ONLY ONE\s+is correct\.\s*/gi,
    " "
  );

  // Collapse whitespace (PDF line joins become spaces)
  t = t.replace(/\s+/g, " ").trim();

  // Drop consecutive duplicate section markers (PDF repeats same header + boiler)
  let lastEmittedSection = null;
  const markRe = new RegExp(`${SECTION_MARK}([^${SECTION_END}]+)${SECTION_END}`, "g");
  t = t.replace(markRe, (full, inner) => {
    const cur = String(inner).trim();
    if (lastEmittedSection === cur) return " ";
    lastEmittedSection = cur;
    return full;
  });
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
 * Reject "N." that is part of exam instructions (e.g. "Total Questions to be Attempted 80. Part-I : 20…")
 * — not an actual question stem.
 */
export function isInstructionOrSummaryQuestionFalsePositive(text, matchIndex, matchLength) {
  const prefix = text.slice(Math.max(0, matchIndex - 60), matchIndex);
  if (/\battempted\s*$/i.test(prefix)) return true;
  if (/\bto be attempted\s*$/i.test(prefix)) return true;
  if (/\bquestions\s+to\s+be\s+attempted\s*$/i.test(prefix)) return true;

  const rest = text.slice(matchIndex + matchLength, matchIndex + matchLength + 50).trim();
  if (/^part\s*[-–—:]?\s*i\b/i.test(rest) || /^part\s*[-–—:]?\s*ii\b/i.test(rest)) return true;
  if (/^&\s*part\s*[-–—:]?\s*ii\b/i.test(rest)) return true;

  return false;
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
    if (isInstructionOrSummaryQuestionFalsePositive(text, m.index, m[0].length)) continue;
    hits.push({ num, index: m.index, bodyStart: m.index + m[0].length });
  }
  // Same "N." can appear twice in flattened PDF text (footer, repeated line). Dedupe by strictly
  // increasing N while in the same section; reset when the section label changes (per-section numbering).
  const filtered = [];
  let prevNum = 0;
  let prevSectionKey = "";
  for (let hi = 0; hi < hits.length; hi++) {
    const h = hits[hi];
    const n = h.num;
    const rawSec = currentSectionFromIndex(text, h.index);
    const sectionKey = normalizeQuestionSection(rawSec);
    if (sectionKey !== prevSectionKey) {
      prevNum = 0;
      prevSectionKey = sectionKey;
    }
    if (n <= prevNum) continue;
    // Stems may contain numbers like "120." — skip huge jumps within the same section only
    if (prevNum > 0 && sectionKey === prevSectionKey && n > prevNum + 30) continue;
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
    const answerMcq = hasLine ? normalizeMcqAnswer(answerText, IMAGE_MCQ_OPTIONS) : null;
    let correctChoiceNone = null;
    if (answerMcq !== null && answerMcq !== undefined) {
      const idx = IMAGE_MCQ_OPTIONS.findIndex((o) => String(o).trim() === String(answerMcq).trim());
      if (idx >= 0 && idx < 4) correctChoiceNone = String(idx + 1);
    }
    return {
      id: `q${qIndex}`,
      type,
      question: "",
      options: [...IMAGE_MCQ_OPTIONS],
      answer: answerMcq !== undefined && answerMcq !== null ? answerMcq : null,
      correctChoice: correctChoiceNone,
      needsAnswerKey: type === "mcq" && (!hasLine || answerMcq === null || answerMcq === undefined),
      section,
      paperQuestionNum,
    };
  }

  const options = [...IMAGE_MCQ_OPTIONS];
  let answer = hasLine ? normalizeMcqAnswer(answerText, options) : null;
  if (answer === undefined) answer = null;

  let correctChoice = null;
  if (type === "mcq" && answer !== null && options.length) {
    const idx = options.findIndex((o) => String(o).trim() === String(answer).trim());
    if (idx >= 0 && idx < 4) correctChoice = String(idx + 1);
  }

  return {
    id: `q${qIndex}`,
    type,
    question: "",
    options,
    answer: answer !== null ? answer : null,
    correctChoice,
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
    const rawSection = currentSectionFromIndex(text, questionStartIndex);
    const key = normalizeQuestionSection(rawSection);
    const section = paletteSectionDisplay(key, rawSection);
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
      const resolved = answer || options[0];
      let correctChoice = null;
      const idx = options.findIndex((o) => String(o).trim() === String(resolved).trim());
      if (idx >= 0 && idx < 4) correctChoice = String(idx + 1);
      return {
        id,
        type: "mcq",
        question: cleanQ,
        options,
        answer: resolved,
        correctChoice,
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

/**
 * For instructions UI: counts per palette section (normalized), same order as question palette.
 * @param {string} [paperId] - used with getSectionPaletteOrderForPaperId when provided
 */
export function countQuestionsBySection(questions, paperId) {
  if (!Array.isArray(questions)) return [];
  const bucket = new Map();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const raw = (q.section && String(q.section).trim()) || "";
    const key = normalizeQuestionSection(raw || "General");
    const label = paletteSectionDisplay(key, raw);
    if (!bucket.has(key)) {
      bucket.set(key, { key, section: label, count: 0, firstIndex: i });
    }
    bucket.get(key).count += 1;
  }
  const paletteOrderArr = getSectionPaletteOrderForPaperId(paperId);
  const rank = (k) => {
    const j = paletteOrderArr.indexOf(k);
    return j >= 0 ? j : 999;
  };
  return Array.from(bucket.values())
    .sort(
      (a, b) =>
        rank(a.key) - rank(b.key) ||
        a.firstIndex - b.firstIndex ||
        String(a.section).localeCompare(String(b.section))
    )
    .map(({ section, count }) => ({ section, count }));
}
