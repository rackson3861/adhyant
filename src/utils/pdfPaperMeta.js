/**
 * Extract exam booklet metadata from raw PDF text (before question parsing).
 * Keeps lines useful for online tests; drops ORS / seal / physical-paper boilerplate.
 */

const SKIP_LINE =
  /ORS|optical response|bubble|breaking\s+seal|booklet\s+until|form\s+no\.?|machine\s+readable|darkening|ball\s+point|things\s+not\s+allowed|return\s+this\s+test\s+paper|total\s+pages\s+in\s+the\s+booklet|after\s+breaking|part-?i\s*:?\s*\d+\s*questions\s*&\s*part-?ii|corporate\s+office|www\.allen|paper\s+code|form\s+number/i;

const SKIP_START =
  /^(instructions\s*\(|note\s*:|read\s+the\s+following|this\s+booklet\s+is\s+your\s+question\s+paper)\s*$/i;

/**
 * @param {string} rawText
 * @returns {{ readTimeMinutes: number | null, maxMarks: number | null, instructions: string[], paperTitleHint: string | null }}
 */
export function extractPaperMetaFromPdfText(rawText) {
  if (!rawText || typeof rawText !== "string") {
    return { readTimeMinutes: null, maxMarks: null, instructions: [], paperTitleHint: null };
  }

  const head = rawText.slice(0, 12000);
  let readTimeMinutes = null;
  let maxMarks = null;

  const hMatch =
    head.match(/(?:time|duration)\s*[:\s]+\s*(\d+)\s*(?:hours?|hrs?\.?)\b/i) ||
    head.match(/\b(\d+)\s*(?:hours?|hrs?\.?)\s*(?:duration|time)?\b/i);
  if (hMatch) {
    const h = parseInt(hMatch[1], 10);
    if (h > 0 && h <= 12) readTimeMinutes = h * 60;
  }
  const mMatch =
    head.match(/(?:time|duration)\s*[:\s]+\s*(\d+)\s*(?:minutes?|mins?\.?)\b/i) ||
    head.match(/\b(\d+)\s*(?:minutes?|mins?\.?)\s*(?:duration|time)?\b/i);
  if (mMatch) {
    const m = parseInt(mMatch[1], 10);
    if (m > 0 && m <= 600) {
      readTimeMinutes = readTimeMinutes != null ? readTimeMinutes + m : m;
    }
  }

  const marksMatch = head.match(/(?:maximum|max\.?)\s*marks?\s*[:\s]+\s*(\d{2,4})\b/i) || head.match(/\b(\d{3,4})\s*marks?\b/i);
  if (marksMatch) {
    const mk = parseInt(marksMatch[1], 10);
    if (mk >= 10 && mk <= 2000) maxMarks = mk;
  }

  let paperTitleHint = null;
  const asat = head.match(/ASAT\s*:\s*Class-[^\s,]+/i);
  if (asat) paperTitleHint = asat[0].replace(/\s+/g, " ").trim();

  const instructions = extractUsefulInstructionLines(head);

  return { readTimeMinutes, maxMarks, instructions, paperTitleHint };
}

function extractUsefulInstructionLines(head) {
  const lines = [];
  const seen = new Set();

  const blocks = head.split(/\n+/);
  for (const line of blocks) {
    const t = line.replace(/\s+/g, " ").trim();
    if (t.length < 12 || t.length > 220) continue;
    if (SKIP_LINE.test(t)) continue;
    if (SKIP_START.test(t)) continue;
    if (/^\d+\.\s*$/.test(t)) continue;

    const useful =
      /^(attempt|answer|duration|time|marking|negative|correct|incorrect|choice|option|multiple\s+choice|rough\s+work|calculator|internet|mobile|proctor|camera|microphone|tab|window|submit|auto|each\s+question|section\s+contains)/i.test(
        t
      ) ||
      /^(you\s+must|do\s+not|students?\s+should|ensure|use\s+only|select|choose|mark)/i.test(t);

    if (!useful) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(t);
    if (lines.length >= 12) break;
  }

  return lines;
}
