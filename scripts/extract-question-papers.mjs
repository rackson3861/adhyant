#!/usr/bin/env node
/**
 * Scan repo /questions/*.pdf → parse text + crop JPEGs → public/questions/papers/<slug>/
 * Preserves displayName & activePaperId from existing papers-index.json when re-running.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { applyNascentClass80SectionOverrides, parseTextToQuestions } from "../src/utils/pdfQuestionParser.js";
import { extractPaperMetaFromPdfText } from "../src/utils/pdfPaperMeta.js";
import { getQuestionPdfPageRange } from "../src/utils/pdfQuestionPageRange.js";
import { extractQuestionJpegBuffersByNumber } from "./lib/pdfQuestionImagesNode.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PDF_INPUT_DIR = path.join(ROOT, "questions");
const OUT_PUBLIC = path.join(ROOT, "public", "questions");
const PAPERS_ROOT = path.join(OUT_PUBLIC, "papers");
const INDEX_PATH = path.join(OUT_PUBLIC, "papers-index.json");

GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(ROOT, "node_modules", "pdfjs-dist", "build", "pdf.worker.mjs")
).href;

function slugFromPdfBasename(base) {
  const noExt = base.replace(/\.pdf$/i, "");
  const s = noExt
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return (s || "paper").slice(0, 96);
}

function defaultDisplayName(base) {
  return base.replace(/\.pdf$/i, "").replace(/_/g, " ").trim() || "Question paper";
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function stripAnswersForStudent(q) {
  const type = q.type === "integer" ? "integer" : "mcq";
  const opts =
    type === "mcq"
      ? Array.isArray(q.options) && q.options.length >= 2
        ? q.options.map((o) => String(o))
        : ["1", "2", "3", "4"]
      : [];
  const stem = q.question != null ? String(q.question) : "";
  return {
    id: q.id,
    num: q.paperQuestionNum != null ? q.paperQuestionNum : null,
    type,
    section: q.section != null && String(q.section).trim() ? String(q.section).trim() : undefined,
    question: stem,
    options: opts,
    min: q.min != null ? q.min : 0,
    max: q.max != null ? q.max : 999,
  };
}

async function processOnePdf(absPath, baseName, prevById) {
  const slug = slugFromPdfBasename(baseName);
  const paperDir = path.join(PAPERS_ROOT, slug);
  fs.mkdirSync(paperDir, { recursive: true });

  const buf = fs.readFileSync(absPath);
  const data = new Uint8Array(buf);
  const pdf = await getDocument({ data, useSystemFonts: true }).promise;

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
  const parsed = parseTextToQuestions(fullText);
  const imageMap = await extractQuestionJpegBuffersByNumber(pdf);

  let wrote = 0;
  for (const [num, jpegBuf] of imageMap.entries()) {
    const outFile = path.join(paperDir, `q-${num}.jpg`);
    fs.writeFileSync(outFile, jpegBuf);
    wrote += 1;
  }

  let questions = parsed.map((q) => {
    const pub = stripAnswersForStudent(q);
    const n = pub.num;
    if (n != null && imageMap.has(n)) {
      pub.image = `papers/${slug}/q-${n}.jpg`;
    }
    return pub;
  });
  questions = applyNascentClass80SectionOverrides(slug, questions);

  /** Live exam timer — keep at 120 minutes; PDF readTimeMinutes stays metadata only. */
  const durationMinutes = 120;

  const titleHint = paperMeta.paperTitleHint ? String(paperMeta.paperTitleHint) : defaultDisplayName(baseName);

  /** Timer + marking scheme live in the instructions UI; optional PDF-only lines only */
  let mergedInstructions = Array.isArray(paperMeta.instructions) ? [...paperMeta.instructions] : [];

  const paperJson = {
    paperId: slug,
    title: titleHint,
    durationMinutes,
    maxMarks: paperMeta.maxMarks != null ? paperMeta.maxMarks : null,
    readTimeMinutes: paperMeta.readTimeMinutes,
    instructions: mergedInstructions,
    paperTitleHint: paperMeta.paperTitleHint || null,
    sourcePdf: baseName,
    answerKeyPresent: false,
    questions,
  };

  fs.writeFileSync(path.join(paperDir, "paper.json"), JSON.stringify(paperJson, null, 2), "utf8");

  const prev = prevById.get(slug);
  return {
    id: slug,
    sourcePdf: baseName,
    displayName: prev?.displayName || defaultDisplayName(baseName),
    questionCount: questions.length,
    imagesWritten: wrote,
    durationMinutes,
  };
}

async function main() {
  if (!fs.existsSync(PDF_INPUT_DIR)) {
    fs.mkdirSync(PDF_INPUT_DIR, { recursive: true });
    console.log(`Created ${PDF_INPUT_DIR} — add PDFs and run again.`);
    return;
  }

  const files = fs.readdirSync(PDF_INPUT_DIR).filter((f) => /\.pdf$/i.test(f));
  if (files.length === 0) {
    console.log(`No PDFs in ${PDF_INPUT_DIR}`);
    return;
  }

  const oldIndex = readJsonSafe(INDEX_PATH) || {};
  const oldPapers = Array.isArray(oldIndex.papers) ? oldIndex.papers : [];
  const prevById = new Map(oldPapers.map((p) => [p.id, p]));

  fs.mkdirSync(PAPERS_ROOT, { recursive: true });

  const papers = [];
  for (const f of files.sort()) {
    const abs = path.join(PDF_INPUT_DIR, f);
    console.log(`Processing ${f}…`);
    try {
      const row = await processOnePdf(abs, f, prevById);
      papers.push(row);
      console.log(`  → ${row.id}: ${row.questionCount} questions, ${row.imagesWritten} JPEGs`);
    } catch (e) {
      console.error(`  ✗ Failed ${f}:`, e.message || e);
    }
  }

  const oldActive = oldIndex.activePaperId;
  const stillValid = papers.some((p) => p.id === oldActive);
  const activePaperId = stillValid ? oldActive : papers[0]?.id || null;

  const index = {
    papers,
    activePaperId,
  };
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
  console.log(`\nWrote ${INDEX_PATH} (${papers.length} paper(s), active: ${activePaperId || "none"})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
