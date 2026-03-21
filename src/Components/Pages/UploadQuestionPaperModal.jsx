import React, { useState, useRef, useEffect } from "react";
import { getScriptPostUrl, isScriptPostUrlReady, postToAppsScript } from "../../utils/scriptApi";
import { parsePdfBytesToQuestionsWithImages, dataUrlToBase64, setLocalPdfWorker } from "../../utils/pdfExtractQuestionsWithImages";

export default function UploadQuestionPaperModal({ isOpen, onClose, onSaved, adminSecret, adminEmail }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [parsed, setParsed] = useState([]);
  const [paperMeta, setPaperMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(null);
  const [error, setError] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!lightboxSrc) return;
    const onKey = (e) => {
      if (e.key === "Escape") setLightboxSrc(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxSrc]);

  async function parseJsonResponse(res) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 280);
      throw new Error(snippet || `Server returned HTTP ${res.status} (not JSON). Check Apps Script deployment URL.`);
    }
  }

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    setError("");
    setParsed([]);
    setPaperMeta(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.type !== "application/pdf") {
      setError("Please select a PDF file.");
      setFile(null);
      return;
    }
    setFile(f);
    setLoading(true);
    setLocalPdfWorker();
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const typed = new Uint8Array(reader.result);
        const { questions, paperMeta: meta } = await parsePdfBytesToQuestionsWithImages(typed);
        setParsed(questions);
        setPaperMeta(meta);
        // Exam duration defaults to 120mins (2hrs); do not use PDF "read time" as timer — that is metadata only.
        setDurationMinutes(120);
        if (questions.length === 0) {
          setError("No questions could be parsed. Try a PDF with clear numbering (1. 2.) and options (1)–(4) or (a)–(d).");
        }
      } catch (err) {
        setError(err.message || "Failed to read PDF.");
        setParsed([]);
        setPaperMeta(null);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(f);
  };

  const handleSave = async () => {
    if (!adminSecret) {
      setError("Admin secret not configured.");
      return;
    }
    const paperName = (name || file?.name || "Untitled").trim().substring(0, 500);
    if (!paperName) {
      setError("Enter a name for the question paper.");
      return;
    }
    if (parsed.length === 0) {
      setError("No questions to save. Parse a PDF first.");
      return;
    }
    const url = getScriptPostUrl();
    if (!isScriptPostUrlReady(url)) {
      setError(
        "Script URL is not set or not recognized. Add NEXT_PUBLIC_RECORDING_UPLOAD_URL (or VITE_RECORDING_UPLOAD_URL) with your Apps Script /exec URL (must include /macros/s/…/exec). Restart npm run dev after editing .env."
      );
      return;
    }
    setError("");
    setSaving(true);
    setImageUploadProgress(null);
    const questionsPayload = parsed.map((q) => {
      const { questionImage, imageBase64: _ib, ...rest } = q;
      return rest;
    });
    try {
      const r1 = await postToAppsScript(url, {
        action: "createPaper",
        adminSecret,
        adminEmail: adminEmail || "",
        name: paperName,
        durationMinutes: Math.min(600, Math.max(1, parseInt(String(durationMinutes), 10) || 120)),
        questions: questionsPayload,
        paperMeta: paperMeta && typeof paperMeta === "object" ? JSON.stringify(paperMeta) : "",
        // Official answer key is uploaded separately; until then students see no key and scores are not computed.
        answerKeyPresent: false,
      });
      const data1 = await parseJsonResponse(r1);
      if (data1.status !== "success" || !data1.id) {
        setError(data1.message || "Save failed.");
        return;
      }
      const paperId = data1.id;
      const imageIndices = [];
      parsed.forEach((q, i) => {
        if (dataUrlToBase64(q.questionImage)) imageIndices.push(i);
      });
      // Each image = Apps Script + Drive + sheet update. Process in batches with limited parallelism
      // (faster than one-by-one) + short pause between batches to reduce Drive quota errors.
      const IMAGE_BATCH_SIZE = 10;
      const UPLOAD_CONCURRENCY = 4;
      const PAUSE_MS_BETWEEN_BATCHES = 600;
      const totalImg = imageIndices.length;
      let completed = 0;
      let uploadFail = null;

      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      /** At most `limit` uploads in flight; preserves question index order only per batch scheduling, not completion order. */
      async function runBatchConcurrent(indices, limit, task) {
        if (indices.length === 0) return;
        const n = Math.max(1, Math.min(limit, indices.length));
        let next = 0;
        async function slot() {
          while (!uploadFail) {
            const k = next++;
            if (k >= indices.length) return;
            await task(indices[k]);
          }
        }
        await Promise.all(Array.from({ length: n }, () => slot()));
      }

      for (let batchStart = 0; batchStart < imageIndices.length; batchStart += IMAGE_BATCH_SIZE) {
        if (uploadFail) break;
        const batch = imageIndices.slice(batchStart, batchStart + IMAGE_BATCH_SIZE);
        await runBatchConcurrent(batch, UPLOAD_CONCURRENCY, async (i) => {
          if (uploadFail) return;
          const b64 = dataUrlToBase64(parsed[i].questionImage);
          if (!b64) {
            completed += 1;
            setImageUploadProgress({ current: completed, total: totalImg });
            return;
          }
          try {
            const r2 = await postToAppsScript(url, {
              action: "uploadPaperQuestionImage",
              adminSecret,
              paperId,
              questionIndex: i,
              imageBase64: b64
            });
            const data2 = await parseJsonResponse(r2);
            if (data2.status !== "success") {
              uploadFail = {
                i,
                message: data2.message || `Image upload failed for question ${i + 1}. Paper id: ${paperId}.`
              };
              return;
            }
          } catch (e) {
            uploadFail = { i, message: e?.message || "Upload failed" };
            return;
          }
          completed += 1;
          setImageUploadProgress({ current: completed, total: totalImg });
        });
        if (uploadFail) break;
        if (batchStart + IMAGE_BATCH_SIZE < imageIndices.length) {
          await sleep(PAUSE_MS_BETWEEN_BATCHES);
        }
      }

      if (uploadFail) {
        setError(uploadFail.message);
        return;
      }
      onSaved?.();
      onClose();
      setFile(null);
      setName("");
      setDurationMinutes(120);
      setParsed([]);
      setPaperMeta(null);
    } catch (err) {
      const msg = err?.message || "";
      if (/failed to fetch|networkerror|load failed|err_failed/i.test(msg)) {
        setError(
          "Could not reach Google Apps Script (network/CORS). We send JSON as text/plain to avoid browser blocks. Also check: Web app deployed as “Anyone” (or you’re signed in), URL ends in /exec, no ad‑blocker on script.google.com, and redeploy the script after code changes."
        );
      } else {
        setError(msg || "Save failed. Check browser console and Apps Script Executions.");
      }
    } finally {
      setSaving(false);
      setImageUploadProgress(null);
    }
  };

  const handleClose = () => {
    setFile(null);
    setName("");
    setDurationMinutes(120);
    setParsed([]);
    setPaperMeta(null);
    setError("");
    setLightboxSrc(null);
    onClose();
  };

  if (!isOpen) return null;

  const withImages = parsed.filter((q) => q.questionImage).length;

  return (
    <>
    <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Upload question paper (PDF)</h5>
            <button type="button" className="btn-close" onClick={handleClose} aria-label="Close" />
          </div>
          <div className="modal-body">
            <p className="text-muted small">
              Uses <strong>local pdf.js</strong> only (no CDN). Text and options are parsed; each question gets a <strong>vertical crop from the PDF</strong> (question line through option (4)) as a JPEG for the online test. Printed instructions are skipped for text; crops come from exam pages only (
              <code>PART-I</code> / <code>PART-II</code> style blocks). MCQ without parseable options falls back to placeholder choices; use{" "}
              <code>Answer: 42</code> for integer-type items. Saving: metadata first, then <strong>one request per question image</strong> to Google Apps Script (each uploads to Drive and updates the sheet). Images upload in <strong>batches of 10</strong> with up to <strong>4 at a time</strong> per batch, then a short pause before the next batch, to stay fast while limiting Google Drive / quota errors; progress shows below.
            </p>
            {error && <div className="alert alert-danger py-2 small">{error}</div>}
            <div className="mb-3">
              <label className="form-label">PDF file</label>
              <input
                ref={fileInputRef}
                type="file"
                className="form-control"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
              />
            </div>
            {loading && <p className="text-muted">Reading PDF, rendering pages, and building question images…</p>}
            {saving && imageUploadProgress && (
              <p className="text-primary small mb-0">
                Uploading question images… {imageUploadProgress.current} / {imageUploadProgress.total}
              </p>
            )}
            {parsed.length > 0 && (
              <>
                <div className="mb-3">
                  <label className="form-label">Paper name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Class X — March 2026"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Test duration (default 2 hours = 120mins)</label>
                  <input
                    type="number"
                    className="form-control"
                    min={1}
                    max={600}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 120)}
                  />
                  <p className="form-text small text-muted mb-0">Stored as minutes (e.g. 120). During the exam, the student timer counts down every second (e.g. 119:59). Filled from PDF when detected.</p>
                </div>
                {paperMeta &&
                  (paperMeta.readTimeMinutes ||
                    paperMeta.maxMarks ||
                    (paperMeta.instructions && paperMeta.instructions.length) ||
                    paperMeta.paperTitleHint) && (
                    <div className="alert alert-light border py-2 small mb-3">
                      <div className="fw-semibold mb-1">Detected from PDF (saved with paper)</div>
                      {paperMeta.paperTitleHint && <div className="text-muted mb-1">{paperMeta.paperTitleHint}</div>}
                      <ul className="mb-0 ps-3">
                        {paperMeta.readTimeMinutes != null && <li>Read time: {paperMeta.readTimeMinutes} minutes</li>}
                        {paperMeta.maxMarks != null && <li>Max marks: {paperMeta.maxMarks}</li>}
                        {paperMeta.instructions && paperMeta.instructions.length > 0 && (
                          <li>{paperMeta.instructions.length} instruction line(s) for students (online-relevant only)</li>
                        )}
                      </ul>
                    </div>
                  )}
                <p className="small fw-bold mb-1">
                  Parsed {parsed.length} question(s) · {withImages} with page snapshot image(s). Scroll the list below; click a thumbnail to enlarge.
                </p>
                <ul className="list-group list-group-flush small mb-3" style={{ maxHeight: "min(55vh, 420px)", overflowY: "auto" }}>
                  {parsed.map((q, i) => {
                    const preview =
                      (q.question && String(q.question).trim()) ||
                      (q.paperQuestionNum != null ? `Q${q.paperQuestionNum}` : "") ||
                      "(no parsed text)";
                    return (
                      <li key={i} className="list-group-item py-2 d-flex gap-2 align-items-start">
                        {q.questionImage ? (
                          <button
                            type="button"
                            className="p-0 border-0 bg-transparent rounded flex-shrink-0"
                            onClick={() => setLightboxSrc(q.questionImage)}
                            aria-label={`Enlarge preview for question ${i + 1}`}
                          >
                            <img
                              src={q.questionImage}
                              alt=""
                              className="rounded border"
                              style={{ width: 72, height: 54, objectFit: "cover", cursor: "zoom-in", display: "block" }}
                            />
                          </button>
                        ) : (
                          <span className="badge bg-secondary flex-shrink-0" style={{ width: 72, height: 54, lineHeight: "54px" }}>
                            No img
                          </span>
                        )}
                        <span className="text-truncate" style={{ maxWidth: "100%" }} title={preview}>
                          {i + 1}. [{q.type}] {preview.length > 55 ? `${preview.slice(0, 55)}…` : preview}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={handleClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || parsed.length === 0}>
              {saving ? "Saving…" : "Save question paper"}
            </button>
          </div>
        </div>
      </div>
    </div>
    {lightboxSrc ? (
      <div
        className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-2"
        style={{ backgroundColor: "rgba(0,0,0,0.9)", zIndex: 1060 }}
        role="dialog"
        aria-modal="true"
        aria-label="Enlarged question image"
        onClick={() => setLightboxSrc(null)}
      >
        <button
          type="button"
          className="btn-close btn-close-white position-absolute top-0 end-0 m-3"
          aria-label="Close preview"
          onClick={(e) => {
            e.stopPropagation();
            setLightboxSrc(null);
          }}
        />
        <img
          src={lightboxSrc}
          alt="Enlarged question preview"
          className="rounded shadow"
          style={{ maxHeight: "92vh", maxWidth: "96vw", objectFit: "contain" }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    ) : null}
    </>
  );
}
