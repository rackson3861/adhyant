/**
 * Heuristic parser: converts PDF-extracted text into question paper format.
 * Expects patterns like:
 * - "1. Question text?" or "Q1. Question" or "Question 1."
 * - MCQ: "(a) option (b) option (c) option (d) option" or "a. option b. option"
 * - Integer: "Answer: 5" or "Ans: 10" or question that looks numeric
 * Output: { id, type: 'mcq'|'integer', question, options?, answer, min?, max? }
 */
export function parseTextToQuestions(rawText) {
  if (!rawText || typeof rawText !== "string") return [];
  const questions = [];
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fullText = lines.join("\n");

  // Split by question starters: 1. 2. Q1. Q2. Question 1 Question 2 etc.
  const questionBlocks = fullText.split(/\n(?=\d+[.)]\s|\nQ\d+[.)]\s|Question\s*\d+[.)]\s)/i).filter(Boolean);

  questionBlocks.forEach((block, idx) => {
    const q = parseOneBlock(block.trim(), idx + 1);
    if (q) questions.push(q);
  });

  // If no blocks found, try alternate pattern: lines with "?" as question end
  if (questions.length === 0 && fullText.length > 50) {
    const alt = parseAlternateFormat(fullText);
    if (alt.length > 0) return alt;
  }

  return questions;
}

function parseOneBlock(block, index) {
  const id = "q" + index;
  // Detect answer line: Answer: X or Ans: X or (Answer) X
  const answerMatch = block.match(/(?:Answer|Ans\.?)\s*[:.]?\s*(.+?)(?:\n|$)/i);
  let answerText = answerMatch ? answerMatch[1].trim() : "";
  let questionText = block;
  if (answerMatch) {
    questionText = block.slice(0, block.indexOf(answerMatch[0])).trim();
  }

  // Check for MCQ options: (a) (b) (c) (d) or a. b. c. d.
  const optionRegex = /\((?:a|b|c|d)\)\s*(.+?)(?=\((?:a|b|c|d)\)|Answer|Ans\.?|$)/gis;
  const optionDots = block.match(/(?:^|\n)\s*([a-d])[.)]\s*(.+?)(?=\n\s*[a-d][.)]|\n\s*Answer|\n\s*Ans\.?|$)/gis);
  let options = [];
  let optionBlocks = block.match(/(?:\([a-d]\)|[a-d][.)])\s*[^\n]+/gi);
  if (optionBlocks && optionBlocks.length >= 2) {
    options = optionBlocks.map((o) => o.replace(/^[a-d][.)]\s*|^\([a-d]\)\s*/i, "").trim()).filter(Boolean);
  }
  if (options.length >= 2 && options.length <= 6) {
    const answer = normalizeMcqAnswer(answerText, options);
    const cleanQ = questionText.replace(/(?:\([a-d]\)|[a-d][.)])\s*[^\n]+/gi, "").replace(/(?:Answer|Ans\.?)\s*[:.]?\s*.+/i, "").trim();
    if (cleanQ.length > 5) {
      return {
        id,
        type: "mcq",
        question: cleanQ,
        options,
        answer: answer || options[0]
      };
    }
  }

  // Integer answer
  const numMatch = answerText.match(/-?\d+/);
  const intAnswer = numMatch ? parseInt(numMatch[0], 10) : null;
  const cleanQ2 = questionText.replace(/(?:Answer|Ans\.?)\s*[:.]?\s*.+/i, "").trim();
  if (cleanQ2.length > 5) {
    return {
      id,
      type: "integer",
      question: cleanQ2,
      answer: intAnswer !== null ? intAnswer : 0,
      min: 0,
      max: 999
    };
  }

  return null;
}

function normalizeMcqAnswer(ans, options) {
  const a = (ans || "").trim();
  if (!a) return options[0];
  const lower = a.toLowerCase();
  const optMap = { a: 0, b: 1, c: 2, d: 3 };
  if (optMap[lower] !== undefined) return options[optMap[lower]];
  const match = options.find((o) => o.toLowerCase() === lower || o === a);
  if (match) return match;
  return options[0];
}

function parseAlternateFormat(fullText) {
  const questions = [];
  const parts = fullText.split(/\n\s*\n+/);
  parts.forEach((p, i) => {
    const q = parseOneBlock(p, i + 1);
    if (q) questions.push(q);
  });
  return questions;
}
