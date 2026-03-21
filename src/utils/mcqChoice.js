/**
 * MCQ responses in the UI are stored as "1" | "2" | "3" | "4" (choice index).
 * Answer keys may store option text, A–D, (1)–(4), or explicit correctChoice from the parser.
 */

/**
 * @param {{ type?: string, answer?: unknown, correctChoice?: unknown, options?: string[] }} q
 * @returns {"1"|"2"|"3"|"4"|null}
 */
export function getMcqCorrectChoice1to4(q) {
  if (!q || q.type !== "mcq") return null;
  const opts = Array.isArray(q.options) ? q.options : [];
  const cc = q.correctChoice != null ? String(q.correctChoice).trim() : "";
  if (/^[1-4]$/.test(cc)) return cc;

  const ans = q.answer;
  if (ans === undefined || ans === null) return null;
  const s = String(ans).trim();
  if (/^[1-4]$/.test(s)) return s;
  const paren = s.match(/^\(?([1-4])\)?$/);
  if (paren) return paren[1];

  const lower = s.toLowerCase();
  const letterMap = { a: "1", b: "2", c: "3", d: "4" };
  if (letterMap[lower] !== undefined) return letterMap[lower];
  const n = parseInt(lower, 10);
  if (n >= 1 && n <= 4) return String(n);

  const idx = opts.findIndex((o) => String(o).trim() === s);
  if (idx >= 0 && idx < 4) return String(idx + 1);
  return null;
}

/**
 * Whether the student's stored value matches option index i (0-based), including legacy option-text saves.
 */
export function isMcqOptionSelected(answers, q, optionIndex0) {
  if (!q || q.type !== "mcq") return false;
  const choice = String(optionIndex0 + 1);
  const raw = answers[q.id];
  if (raw === undefined || raw === "") return false;
  const stored = String(raw).trim();
  if (stored === choice) return true;
  const opts = Array.isArray(q.options) ? q.options : [];
  const text = opts[optionIndex0];
  if (text != null && String(text).trim() === stored) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} answers
 * @param {{ type?: string, answer?: unknown, correctChoice?: unknown, options?: string[] }} q
 */
export function isMcqAnswerCorrect(answers, q) {
  const correct = getMcqCorrectChoice1to4(q);
  if (!correct) return false;
  const raw = answers[q.id];
  if (raw === undefined || raw === "") return false;
  const stored = String(raw).trim();
  if (stored === correct) return true;
  const opts = Array.isArray(q.options) ? q.options : [];
  const idx = opts.findIndex((o) => String(o).trim() === stored);
  return idx >= 0 && String(idx + 1) === correct;
}
