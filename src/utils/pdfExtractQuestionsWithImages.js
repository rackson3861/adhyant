/**
 * Local pdf.js only (no CDN): render PDF pages and crop each numbered question to a JPEG data URL
 * so diagrams / figures stay visible in the online test.
 */
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { isPlausibleQuestionNumberAt, isInstructionOrSummaryQuestionFalsePositive } from "./pdfQuestionParser.js";
import { extractPaperMetaFromPdfText } from "./pdfPaperMeta.js";
import { getQuestionPdfPageRange } from "./pdfQuestionPageRange.js";
import {
  capQuestionCropBottomForSectionHeaders,
  findMaxSectionLikeBottomBetween,
  isAnswerSheetBoilerplateTextSegment,
  SECTION_CROP_PAD_AFTER_BLOCK,
} from "./pdfQuestionImageCrop.js";

const RENDER_SCALE = 2;
const CROP_PAD = 6;
/** Pixels below the last option marker (e.g. (4)); large pad so diagrams under (3)/(4) are not clipped (same as extract script). */
const OPTION_PAD_BELOW = 120;
const LAST_QUESTION_MAX_FALLBACK_H = 720;
const JPEG_QUALITY = 0.7;
const Q_RE = /\b([1-9]\d{0,2})\.(\s+)/g;

/** Call once before getDocument (browser only). Uses bundled worker from node_modules. */
export function setLocalPdfWorker() {
  if (typeof window === "undefined" || !pdfjsLib.GlobalWorkerOptions) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
}

/**
 * Sorted text items with viewport bounds (top-left origin, y grows downward).
 */
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
  segments.sort((a, b) => (a.top - b.top) || (a.left - b.left));
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

/**
 * Render one page to canvas; returns { canvas, viewport }.
 */
async function renderPageToCanvas(page) {
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { canvas, viewport };
}

/**
 * Crop rectangle from source canvas to JPEG data URL (with data:image/jpeg;base64, prefix).
 */
function cropCanvasToJpegUrl(source, sx, sy, sw, sh) {
  const w = Math.max(1, Math.floor(sw));
  const h = Math.max(1, Math.floor(sh));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  return out.toDataURL("image/jpeg", JPEG_QUALITY);
}

/** True if crop region looks like a diagram/photo (color or gray fill), not plain black-on-white text only. */
function regionHasLikelyFigure(canvas, sx, sy, sw, sh) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  sx = Math.max(0, Math.floor(sx));
  sy = Math.max(0, Math.floor(sy));
  sw = Math.max(1, Math.floor(sw));
  sh = Math.max(1, Math.floor(sh));
  if (sx + sw > canvas.width || sy + sh > canvas.height) return false;
  let imageData;
  try {
    imageData = ctx.getImageData(sx, sy, sw, sh);
  } catch {
    return false;
  }
  const d = imageData.data;
  let chromatic = 0;
  let midTone = 0;
  const total = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    const sat = maxc > 1 ? (maxc - minc) / maxc : 0;
    const l = (r + g + b) / 3;
    if (sat > 0.14 && l > 40 && l < 248) chromatic++;
    if (sat < 0.1 && l > 70 && l < 215) midTone++;
  }
  const cr = chromatic / total;
  const mr = midTone / total;
  return cr > 0.016 || (cr > 0.006 && mr > 0.085);
}

function normalizePdfMark(str) {
  return (str || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\uFF08/g, "(")
    .replace(/\uFF09/g, ")");
}

/**
 * Bottom of last "(4)" / "4." option label in viewport, within [yMin, yMax].
 */
function findMcqOptionsBottom(segments, yMin, yMax) {
  let best = null;
  for (const seg of segments) {
    if (seg.top < yMin - 2 || seg.bottom > yMax + 10) continue;
    if (isAnswerSheetBoilerplateTextSegment(seg.str)) continue;
    const compact = normalizePdfMark(seg.str);
    if (!compact || compact.length > 96) continue;
    if (/^\(4\)/.test(compact) || /^4[.)]/.test(compact)) {
      if (best == null || seg.bottom > best) best = seg.bottom;
    }
  }
  return best;
}

/**
 * When "(4)" is missing from the text layer, use max bottom among (1)–(4) line starts (needs ≥2 markers).
 */
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
 * @returns {Map<number, { dataUrl: string, hasFigure: boolean }>} paper question number → full question+options crop
 */
export async function extractQuestionImagesByNumber(pdfDocument) {
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
    // Drop repeated "N." on the same page (footer / repeated line) — keep strictly increasing N top-to-bottom
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
      const hasFigure = regionHasLikelyFigure(canvas, 0, y1, w, h);
      const dataUrl = cropCanvasToJpegUrl(canvas, 0, y1, w, h);
      // First page wins: same paperQuestionNum on a later page must not overwrite (avoids wrong crop).
      if (dataUrl && !map.has(startsDedup[k].num)) map.set(startsDedup[k].num, { dataUrl, hasFigure });
    }
  }

  return map;
}

/**
 * Full pipeline: text/option parse + per-question JPEG (browser only).
 * @param {Uint8Array} uint8Array
 * @returns {Promise<{ questions: Array, paperMeta: { readTimeMinutes: number|null, maxMarks: number|null, instructions: string[], paperTitleHint: string|null } }>}
 */
export async function parsePdfBytesToQuestionsWithImages(uint8Array) {
  setLocalPdfWorker();
  const pdf = await pdfjsLib.getDocument({ data: uint8Array, useSystemFonts: true }).promise;
  let metaText = "";
  for (let i = 1; i <= Math.min(2, pdf.numPages); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    metaText += content.items.map((it) => it.str).join(" ") + "\n";
  }
  const paperMeta = extractPaperMetaFromPdfText(metaText);

  const { startPage, endPage } = getQuestionPdfPageRange(pdf.numPages);
  let fullText = "";
  for (let i = startPage; i <= endPage; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((it) => it.str).join(" ") + "\n";
  }
  const { parseTextToQuestions } = await import("./pdfQuestionParser.js");
  const questions = parseTextToQuestions(fullText);
  const imageMap = await extractQuestionImagesByNumber(pdf);
  questions.forEach((q) => {
    const n = q.paperQuestionNum;
    if (n == null || !imageMap.has(n)) return;
    const entry = imageMap.get(n);
    const dataUrl = entry && typeof entry === "object" && entry.dataUrl ? entry.dataUrl : entry;
    if (dataUrl) {
      // Always attach full vertical slice: stem + in-question figure + options (1)–(4), not only “diagram” items.
      q.questionImage = dataUrl;
    }
  });
  return { questions, paperMeta };
}

/**
 * Strip data URL prefix for JSON upload; returns raw base64 or null.
 */
export function dataUrlToBase64(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const i = dataUrl.indexOf("base64,");
  if (i < 0) return null;
  return dataUrl.slice(i + 7);
}
