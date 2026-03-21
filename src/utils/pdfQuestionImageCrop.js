/**
 * Heuristics to trim per-question PDF crops so SECTION-/Part/boilerplate lines
 * are not included in JPEG exports (e.g. SECTION-C : BIOLOGY after Q50).
 *
 * PDF.js often splits one printed line into many items; we merge by Y-bucket before matching.
 */

/** Pixels to leave above a detected section line when trimming the bottom of a question crop. */
export const SECTION_CROP_PAD_ABOVE_LINE = 14;
/** Pixels below detected boilerplate before the next question number starts. */
export const SECTION_CROP_PAD_AFTER_BLOCK = 10;

/**
 * Merge items onto the same printed line using vertical overlap (handles split "SECTION-C" / "BIOLOGY"
 * with different baselines or bucket drift).
 */
export function mergeSegmentsIntoHorizontalLines(segments, yLow, yHigh) {
  const segs = segments.filter((s) => s.bottom > yLow && s.top < yHigh);
  segs.sort((a, b) => a.top - b.top || (a.left ?? 0) - (b.left ?? 0));
  const lines = [];
  for (const s of segs) {
    let placed = false;
    for (const L of lines) {
      const overlap = Math.min(s.bottom, L.maxB) - Math.max(s.top, L.minT);
      const sh = Math.max(4, s.bottom - s.top);
      if (overlap > 1 && overlap >= sh * 0.28) {
        L.items.push(s);
        L.minT = Math.min(L.minT, s.top);
        L.maxB = Math.max(L.maxB, s.bottom);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lines.push({
        minT: s.top,
        maxB: s.bottom,
        items: [s],
      });
    }
  }
  /** Collapse near-duplicate baselines (large fonts / italics). */
  lines.sort((a, b) => a.minT - b.minT);
  const collapsed = [];
  for (const L of lines) {
    const prev = collapsed[collapsed.length - 1];
    if (prev && Math.abs(L.minT - prev.minT) < 10 && Math.abs(L.maxB - prev.maxB) < 14) {
      prev.items.push(...L.items);
      prev.minT = Math.min(prev.minT, L.minT);
      prev.maxB = Math.max(prev.maxB, L.maxB);
    } else {
      collapsed.push(L);
    }
  }
  return collapsed
    .map((L) => {
      L.items.sort((a, b) => (a.left ?? 0) - (b.left ?? 0));
      const top = Math.min(...L.items.map((x) => x.top));
      const bottom = Math.max(...L.items.map((x) => x.bottom));
      const text = L.items
        .map((x) => (x.str || "").trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return { top, bottom, text };
    })
    .filter((x) => x.text.length > 0)
    .sort((a, b) => a.top - b.top);
}

function normalizeForSectionMatch(t) {
  return (t || "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when this text item is the standard MCQ instruction block (contains "(4)" but is not option (4)).
 * Used so findMcqOptionsBottom does not pick "…(4) out of which ONLY ONE…" as the last option row.
 */
export function isAnswerSheetBoilerplateTextSegment(str) {
  const t = normalizeForSectionMatch(str || "");
  if (t.length < 16) return false;
  if (/out of which ONLY ONE/i.test(t)) return true;
  if (/Each question has four choices \(1\)/i.test(t)) return true;
  if (/This section contains \d+ Multiple Choice/i.test(t)) return true;
  if (/^\d+ Multiple Choice Questions\.?$/i.test(t)) return true;
  return false;
}

/**
 * Match on merged logical lines (and fall back to raw long segments).
 */
const SECTION_OR_BOILERPLATE_RES = [
  /SECTION\s*-\s*[A-D]\s*:\s*(PHYSICS|CHEMISTRY|MATHEMATICS|MATHS?|BIOLOGY|BOTANY|ZOOLOGY)/i,
  /SECTION\s*-\s*[A-D]\s*:/i,
  /SECTION\s*-\s*[A-D]\b/i,
  /^Section\s*\(\s*[A-D]\s*\)\s*:/i,
  /This\s+section\s+contains\s+\d+\s+Multiple\s+Choice/i,
  /Each\s+question\s+has\s+four\s+choices\s+\(1\)/i,
  /out\s+of\s+which\s+ONLY\s+ONE\s+is\s+correct/i,
  /^PART\s*-?\s*II\b/i,
  /^PART\s*-?\s*I\s+IQ\b/i,
  /^PART\s*-?\s*I\s*\(\s*IQ/i,
  /** Bold centred subject line right after SECTION- (merged line may be only the subject). */
  /^(PHYSICS|CHEMISTRY|MATHEMATICS|MATHS?|BIOLOGY)\s*$/i,
];

/** Any printed line that clearly starts a new section (PDFs vary spacing / unicode hyphens). */
function lineMatchesSectionOrBoilerplate(text) {
  const t = normalizeForSectionMatch(text);
  if (t.length < 6) return false;
  for (const re of SECTION_OR_BOILERPLATE_RES) {
    if (re.test(t)) return true;
  }
  if (/SECTION/i.test(t) && t.length < 140 && /[A-D]\s*:|SECTION\s*-\s*[A-D]/i.test(t)) return true;
  return false;
}

/**
 * Last resort: smallest top among segments whose text contains SECTION (handles odd glyph splits).
 */
function findRawSectionKeywordTop(segments, yLow, yHigh) {
  let best = null;
  for (const seg of segments) {
    if (seg.bottom <= yLow || seg.top >= yHigh) continue;
    const t = normalizeForSectionMatch(seg.str || "");
    if (t.length < 4 || t.length > 100) continue;
    if (!/SECTION/i.test(t)) continue;
    if (best == null || seg.top < best) best = seg.top;
  }
  return best;
}

function segmentOverlapsVerticalRange(seg, yLow, yHigh) {
  return seg.top < yHigh && seg.bottom > yLow;
}

/**
 * Smallest line top in range that matches section/boilerplate (merged lines + raw segments).
 */
export function findFirstSectionOrBoilerplateTopInVerticalRange(segments, yLow, yHigh) {
  let best = null;
  const lines = mergeSegmentsIntoHorizontalLines(segments, yLow, yHigh);
  for (const line of lines) {
    if (line.bottom <= yLow || line.top >= yHigh) continue;
    if (lineMatchesSectionOrBoilerplate(line.text)) {
      if (best == null || line.top < best) best = line.top;
    }
  }
  for (const seg of segments) {
    if (!segmentOverlapsVerticalRange(seg, yLow, yHigh)) continue;
    const t = normalizeForSectionMatch(seg.str || "");
    if (t.length < 8) continue;
    if (lineMatchesSectionOrBoilerplate(t)) {
      if (best == null || seg.top < best) best = seg.top;
    }
  }
  if (best == null) {
    const raw = findRawSectionKeywordTop(segments, yLow, yHigh);
    if (raw != null) best = raw;
  }
  return best;
}

/**
 * Largest bottom among matching lines between yFrom and yTo (next question start).
 */
export function findMaxSectionLikeBottomBetween(segments, yFrom, yTo) {
  let best = null;
  const lines = mergeSegmentsIntoHorizontalLines(segments, yFrom, yTo);
  for (const line of lines) {
    if (line.top >= yTo || line.bottom <= yFrom) continue;
    if (lineMatchesSectionOrBoilerplate(line.text)) {
      if (best == null || line.bottom > best) best = line.bottom;
    }
  }
  for (const seg of segments) {
    if (seg.top >= yTo || seg.bottom <= yFrom) continue;
    const t = normalizeForSectionMatch(seg.str || "");
    if (t.length < 10) continue;
    if (lineMatchesSectionOrBoilerplate(t)) {
      if (best == null || seg.bottom > best) best = seg.bottom;
    }
  }
  return best;
}

/**
 * Cap question crop bottom so it does not include SECTION/boilerplate before the next question.
 */
export function capQuestionCropBottomForSectionHeaders(segments, y1, nextTop, optBottom, tentativeY2) {
  if (nextTop <= y1 + 20) return tentativeY2;
  /** Search from just below question start; widen below options in case (4) bbox is tight. */
  const searchLow = optBottom != null ? Math.max(y1 + 12, optBottom - 24) : y1 + 36;
  const capTop = findFirstSectionOrBoilerplateTopInVerticalRange(segments, searchLow, nextTop);
  if (capTop == null) return tentativeY2;
  if (capTop <= y1 + 20) return tentativeY2;
  /** Section must sit at or below the option row (allow small overlap for line bucket). */
  if (optBottom != null && capTop < optBottom - 12) return tentativeY2;
  const capped = Math.floor(capTop - SECTION_CROP_PAD_ABOVE_LINE);
  const nextY2 = Math.min(tentativeY2, capped);
  if (nextY2 <= y1 + 28) return tentativeY2;
  return nextY2;
}
