/**
 * Load bundled question papers from /public/questions/ (catalog + per-paper JSON + images).
 */
import { STORAGE_KEY_QUESTION_PAPER_ID } from "../Components/TestCodeGate.jsx";
import { getPaperBundleUrl, getPapersIndexUrl } from "./localPapersCatalog.js";
import { getBundledPaperBrandTitle } from "./bundledPaperBrandTitles.js";
import {
  getAbquestMarkingSchemeInstructionBlock,
  getIgniteFlameBlazeStreamInstructionBlock,
  isAbquestBundledPaper,
  isClass11To13StreamPaper,
} from "./seniorStreamPaperInstructions.js";
import { applyNascentClass80SectionOverrides } from "./pdfQuestionParser.js";

function vitePublicUrl(relativePath) {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  const path = String(relativePath || "").replace(/^\//, "");
  return path ? `${base}/${path}` : "";
}

/**
 * Legacy single-file manifest (optional fallback).
 * @returns {Promise<object|null>}
 */
async function fetchLegacySinglePaperJson() {
  const url = vitePublicUrl("questions/paper.json");
  try {
    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) return null;
    const raw = await r.json();
    if (!raw || typeof raw !== "object") return null;
    if (raw._info && (!Array.isArray(raw.questions) || raw.questions.length === 0)) return null;
    if (!Array.isArray(raw.questions) || raw.questions.length === 0) return null;
    return normalizeLocalPaperPayload(raw);
  } catch {
    return null;
  }
}

/**
 * Load active paper from papers-index.json + papers/<id>/paper.json.
 * @returns {Promise<object|null>}
 */
export async function fetchLocalQuestionsPaper() {
  try {
    const ir = await fetch(getPapersIndexUrl(), { cache: "force-cache" });
    if (ir.ok) {
      const index = await ir.json();
      const papers = Array.isArray(index.papers) ? index.papers : [];
      if (papers.length > 0) {
        let preferredId = "";
        try {
          preferredId = (typeof sessionStorage !== "undefined" && sessionStorage.getItem(STORAGE_KEY_QUESTION_PAPER_ID)) || "";
        } catch {
          preferredId = "";
        }
        preferredId = String(preferredId).trim();
        const fromGate =
          preferredId && papers.some((p) => String(p.id) === preferredId) ? preferredId : "";
        const activeId = fromGate || index.activePaperId || papers[0].id;
        const meta = papers.find((p) => String(p.id) === String(activeId)) || papers[0];
        const bundleUrl = getPaperBundleUrl(meta.id);
        const br = await fetch(bundleUrl, { cache: "force-cache" });
        if (br.ok) {
          const raw = await br.json();
          const brandTitle = getBundledPaperBrandTitle(meta.id);
          const displayTitle =
            brandTitle ||
            (meta.displayName && String(meta.displayName).trim()) ||
            raw.title ||
            "Online Assessment";
          return normalizeLocalPaperPayload({ ...raw, title: displayTitle });
        }
      }
    }
  } catch {
    /* fall through */
  }
  return fetchLegacySinglePaperJson();
}

/**
 * @param {object} raw
 * @returns {{ paperId: string, title: string, durationMinutes: number, maxMarks: number|null, readTimeMinutes: number|null, instructions: string[], paperTitleHint: string|null, questions: object[], answerKeyPresent: false, paperSource: string }}
 */
export function normalizeLocalPaperPayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  const paperId = String(raw.paperId || "local-questions").trim() || "local-questions";
  const brandTitle = getBundledPaperBrandTitle(paperId);
  const title =
    brandTitle || String(raw.title || "Online Assessment").trim() || "Online Assessment";
  /** Bundled ABQuest PDF papers are always 120 minutes online (ignore accidental JSON edits). */
  let durationMinutes = Math.max(1, Math.min(600, Number(raw.durationMinutes) || 120));
  if (/^abquest-class-/i.test(paperId)) {
    durationMinutes = 120;
  }
  const maxMarks = raw.maxMarks != null && !Number.isNaN(Number(raw.maxMarks)) ? Number(raw.maxMarks) : null;
  const readTimeMinutes =
    raw.readTimeMinutes != null && !Number.isNaN(Number(raw.readTimeMinutes)) ? Number(raw.readTimeMinutes) : null;
  const instructions = Array.isArray(raw.instructions) ? raw.instructions.map((s) => String(s)) : [];
  const paperTitleHint = raw.paperTitleHint != null ? String(raw.paperTitleHint) : null;

  const list = Array.isArray(raw.questions) ? raw.questions : [];
  const questions = list.map((q, i) => {
    const num = q.num != null ? Number(q.num) : i + 1;
    const imageRel = q.image || q.imagePath || q.imageFile;
    let imageUrl = "";
    if (imageRel) {
      const imgPath = String(imageRel).trim();
      if (imgPath.startsWith("data:") || imgPath.startsWith("http://") || imgPath.startsWith("https://")) {
        imageUrl = imgPath;
      } else if (imgPath.startsWith("/")) {
        imageUrl = imgPath;
      } else {
        let rel = imgPath.replace(/^\//, "");
        /** JPEGs live under /public/questions/…; extract script stores paths as papers/<id>/q-n.jpg */
        if (rel && !rel.startsWith("questions/")) {
          rel = `questions/${rel}`;
        }
        imageUrl = vitePublicUrl(rel);
      }
    }
    const type = q.type === "integer" ? "integer" : "mcq";
    const opts = Array.isArray(q.options) && q.options.length ? q.options.map((o) => String(o)) : [];
    return {
      id: String(q.id || `q${num}`),
      type,
      paperQuestionNum: Number.isFinite(num) ? num : i + 1,
      section: q.section != null && String(q.section).trim() ? String(q.section).trim() : undefined,
      question: q.question != null ? String(q.question) : "",
      options: type === "integer" ? opts : opts.length ? opts : ["1", "2", "3", "4"],
      min: q.min != null ? Number(q.min) : 0,
      max: q.max != null ? Number(q.max) : 999,
      imageUrl,
    };
  });

  const questionsWithNascentSections = applyNascentClass80SectionOverrides(paperId, questions);

  const instructionsCallout = isAbquestBundledPaper(paperId)
    ? getAbquestMarkingSchemeInstructionBlock()
    : null;

  const streamInstructionsCallout = isClass11To13StreamPaper(paperId)
    ? getIgniteFlameBlazeStreamInstructionBlock()
    : null;

  return {
    paperId,
    title,
    durationMinutes,
    maxMarks,
    readTimeMinutes,
    instructions,
    paperTitleHint,
    questions: questionsWithNascentSections,
    answerKeyPresent: false,
    paperSource: "local_questions",
    instructionsCallout,
    streamInstructionsCallout,
  };
}
