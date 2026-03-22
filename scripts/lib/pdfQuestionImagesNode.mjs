/**
 * Node-only: crop per-question JPEGs from a PDF (same heuristics as browser pdfExtractQuestionsWithImages.js).
 */
import { createCanvas } from "@napi-rs/canvas";
import {
  isPlausibleQuestionNumberAt,
  isInstructionOrSummaryQuestionFalsePositive,
} from "../../src/utils/pdfQuestionParser.js";
import { getQuestionPdfPageRange } from "../../src/utils/pdfQuestionPageRange.js";
import {
  capQuestionCropBottomForSectionHeaders,
  findMaxSectionLikeBottomBetween,
  isAnswerSheetBoilerplateTextSegment,
  SECTION_CROP_PAD_AFTER_BLOCK,
} from "../../src/utils/pdfQuestionImageCrop.js";

const RENDER_SCALE = 2;
const CROP_PAD = 6;
/** Extra canvas px below last “(4)” label so diagrams/dice under options 3–4 are not clipped (2× PDF scale). */
const OPTION_PAD_BELOW = 120;
const LAST_QUESTION_MAX_FALLBACK_H = 720;
const JPEG_QUALITY = 70;
const Q_RE = /\b([1-9]\d{0,2})\.(\s+)/g;

async function getPageTextSegments(page, viewport) {
  const content = await page.getTextContent();
  const segments = [];
  for (const item of content.items) {
    if (!item || typeof item.str !== "string" || item.str.length === 0) continue;
    const tm = item.transform;
    const pdfX = tm[4];
    const pdfY = tm[5];
    const w = item.width || 0;
    const h = Math.hypot(tm[2], tm[3]) || 10;
    const corners = [
      [pdfX, pdfY],
      [pdfX + w, pdfY],
      [pdfX, pdfY + h],
      [pdfX + w, pdfY + h],
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of corners) {
      const [vx, vy] = viewport.convertToViewportPoint(px, py);
      minX = Math.min(minX, vx);
      minY = Math.min(minY, vy);
      maxX = Math.max(maxX, vx);
      maxY = Math.max(maxY, vy);
    }
    segments.push({
      str: item.str,
      left: minX,
      top: minY,
      right: maxX,
      bottom: maxY,
    });
  }
  segments.sort((a, b) => a.top - b.top || a.left - b.left);
  return segments;
}

function segmentAtCharIndex(segments, charIndex) {
  let pos = 0;
  for (const seg of segments) {
    const chunk = `${seg.str} `;
    if (charIndex >= pos && charIndex < pos + chunk.length) return seg;
    pos += chunk.length;
  }
  return segments.length ? segments[segments.length - 1] : null;
}

async function renderPageToCanvas(page) {
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const w = Math.floor(viewport.width);
  const h = Math.floor(viewport.height);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { canvas, viewport };
}

function cropCanvasToJpegBuffer(source, sx, sy, sw, sh) {
  const w = Math.max(1, Math.floor(sw));
  const h = Math.max(1, Math.floor(sh));
  const out = createCanvas(w, h);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  return out.toBuffer("image/jpeg", { quality: JPEG_QUALITY / 100 });
}

function normalizePdfMark(str) {
  return (str || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\uFF08/g, "(")
    .replace(/\uFF09/g, ")");
}

function findMcqOptionsBottom(segments, yMin, yMax) {
  let best = null;
  for (const seg of segments) {
    if (seg.top < yMin - 2 || seg.bottom > yMax + 10) continue;
    if (isAnswerSheetBoilerplateTextSegment(seg.str)) continue;
    const compact = normalizePdfMark(seg.str);
    if (!compact || compact.length > 96) continue;
    /** Only treat "(4)" at start of item as option label — not "…(4) out of which…" in instructions. */
    if (/^\(4\)/.test(compact) || /^4[.)]/.test(compact)) {
      if (best == null || seg.bottom > best) best = seg.bottom;
    }
  }
  return best;
}

function findMcqOptionClusterMaxBottom(segments, yMin, yMax) {
  const bottoms = { 1: null, 2: null, 3: null, 4: null };
  for (const seg of segments) {
    if (seg.top < yMin - 2 || seg.bottom > yMax + 10) continue;
    if (isAnswerSheetBoilerplateTextSegment(seg.str)) continue;
    const compact = normalizePdfMark(seg.str);
    if (!compact || compact.length > 120) continue;
    for (let n = 1; n <= 4; n++) {
      const re = new RegExp(`^\\(${n}\\)|^${n}[.)]`);
      if (re.test(compact)) {
        const prev = bottoms[n];
        if (prev == null || seg.bottom > prev) bottoms[n] = seg.bottom;
        break;
      }
    }
  }
  const found = [1, 2, 3, 4].filter((n) => bottoms[n] != null);
  if (found.length < 2) return null;
  if (bottoms[4] != null) return bottoms[4];
  return Math.max(...found.map((n) => bottoms[n]));
}

/**
 * @param {import("pdfjs-dist").PDFDocumentProxy} pdfDocument
 * @returns {Promise<Map<number, Buffer>>}
 */
export async function extractQuestionJpegBuffersByNumber(pdfDocument) {
  const map = new Map();
  const numPages = pdfDocument.numPages;
  const { startPage, endPage } = getQuestionPdfPageRange(numPages);

  for (let pageIndex = startPage; pageIndex <= endPage; pageIndex++) {
    const page = await pdfDocument.getPage(pageIndex);
    const { canvas, viewport } = await renderPageToCanvas(page);
    const segments = await getPageTextSegments(page, viewport);
    if (segments.length === 0) continue;

    const pageText = segments.map((s) => s.str).join(" ");
    if (pageText.length < 30) continue;

    const starts = [];
    let m;
    Q_RE.lastIndex = 0;
    while ((m = Q_RE.exec(pageText)) !== null) {
      const afterDot = m[2] || "";
      if (afterDot.length === 0) continue;
      const num = parseInt(m[1], 10);
      if (num > 250) continue;
      if (!isPlausibleQuestionNumberAt(pageText, m.index)) continue;
      if (isInstructionOrSummaryQuestionFalsePositive(pageText, m.index, m[0].length)) continue;
      const tail = pageText.slice(m.index + m[0].length, m.index + m[0].length + 48).toLowerCase();
      if (
        /^(this booklet|fill your|the answer sheet|total questions|marking scheme|after breaking|there are\s+\d+\s+pages)/i.test(
          tail.trim()
        )
      ) {
        continue;
      }
      const seg = segmentAtCharIndex(segments, m.index);
      if (!seg) continue;
      starts.push({ num, yTop: seg.top });
    }

    if (starts.length === 0) continue;

    starts.sort((a, b) => a.yTop - b.yTop);
    const startsDedup = [];
    let prevN = -1;
    for (let si = 0; si < starts.length; si++) {
      const n = starts[si].num;
      if (n <= prevN) continue;
      startsDedup.push(starts[si]);
      prevN = n;
    }
    const w = canvas.width;

    const cropBottomByK = [];

    for (let k = 0; k < startsDedup.length; k++) {
      let y1 = Math.max(0, Math.floor(startsDedup[k].yTop - CROP_PAD));
      if (k > 0 && cropBottomByK[k - 1] != null) {
        const junkBottom = findMaxSectionLikeBottomBetween(
          segments,
          cropBottomByK[k - 1],
          startsDedup[k].yTop
        );
        if (junkBottom != null && junkBottom < startsDedup[k].yTop - 2) {
          y1 = Math.max(y1, Math.ceil(junkBottom + SECTION_CROP_PAD_AFTER_BLOCK));
        }
      }

      const nextTop = k + 1 < startsDedup.length ? startsDedup[k + 1].yTop : canvas.height;
      const ySearchMax = nextTop;

      let optBottom = findMcqOptionsBottom(segments, y1, ySearchMax);
      if (optBottom == null) {
        optBottom = findMcqOptionClusterMaxBottom(segments, y1, ySearchMax);
      }

      let y2;
      if (optBottom != null) {
        y2 = Math.ceil(optBottom + OPTION_PAD_BELOW);
      } else if (k + 1 < startsDedup.length) {
        y2 = Math.floor(nextTop - 2);
      } else {
        const cap = Math.min(Math.floor(canvas.height * 0.4), LAST_QUESTION_MAX_FALLBACK_H);
        y2 = Math.min(y1 + cap, canvas.height);
      }
      if (k + 1 < startsDedup.length) {
        y2 = Math.min(y2, Math.floor(nextTop - 1));
      }
      y2 = capQuestionCropBottomForSectionHeaders(segments, y1, nextTop, optBottom, y2);
      if (y2 <= y1) y2 = Math.min(y1 + 80, canvas.height);
      cropBottomByK[k] = y2;
      const h = Math.max(40, y2 - y1);
      const buf = cropCanvasToJpegBuffer(canvas, 0, y1, w, h);
      if (buf && !map.has(startsDedup[k].num)) map.set(startsDedup[k].num, buf);
    }
  }

  return map;
}
