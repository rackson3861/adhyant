import React, { useState, useRef } from "react";
import { getScriptPostUrl, postToAppsScript } from "../../utils/scriptApi";
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
  const fileInputRef = useRef(null);

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
        if (meta?.readTimeMinutes && meta.readTimeMinutes > 0 && meta.readTimeMinutes <= 600) {
          setDurationMinutes(meta.readTimeMinutes);
        }
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
    if (!url || !/^https?:\/\//i.test(url)) {
      setError("Script URL is not set. Add NEXT_PUBLIC_RECORDING_UPLOAD_URL (or VITE_RECORDING_UPLOAD_URL) in .env.");
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
      // Each image = 1 round-trip to Apps Script + Drive + Sheet update. Sequential = very slow
      // (e.g. 80 × ~2–5s). Run a few uploads in parallel (still small enough for quotas).
      const PARALLEL = 4;
      const totalImg = imageIndices.length;
      let completed = 0;
      let sharedNext = 0;
      let uploadFail = null;

      async function uploadWorker() {
        while (sharedNext < imageIndices.length && !uploadFail) {
          const slot = sharedNext++;
          const i = imageIndices[slot];
          const b64 = dataUrlToBase64(parsed[i].questionImage);
          if (!b64) {
            completed += 1;
            setImageUploadProgress({ current: completed, total: totalImg });
            continue;
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
              break;
            }
          } catch (e) {
            uploadFail = { i, message: e?.message || "Upload failed" };
            break;
          }
          completed += 1;
          setImageUploadProgress({ current: completed, total: totalImg });
        }
      }

      const nWorkers = Math.min(PARALLEL, Math.max(1, totalImg));
      await Promise.all(Array.from({ length: nWorkers }, () => uploadWorker()));

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
    onClose();
  };

  if (!isOpen) return null;

  const withImages = parsed.filter((q) => q.questionImage).length;

  return (
    <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Upload question paper (PDF)</h5>
            <button type="button" className="btn-close" onClick={handleClose} aria-label="Close" />
          </div>
          <div className="modal-body">
            <p className="text-muted small">
              Uses <strong>local pdf.js</strong> only (no CDN). Text and options are parsed; each question is also <strong>cropped from the PDF as a JPEG image</strong> so figures and diagrams show in the online test. Printed instructions are skipped for text; images are taken from exam pages only (
              <code>PART-I</code> / <code>PART-II</code> style blocks). MCQ without parseable options falls back to placeholder choices; use{" "}
              <code>Answer: 42</code> for integer-type items. Saving: metadata first, then <strong>one request per question image</strong> to Google Apps Script (each uploads to Drive and updates the sheet). Big papers need many round-trips—we run <strong>4 uploads in parallel</strong> to shorten wait; progress shows below.
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
                  <label className="form-label">Test duration (minutes)</label>
                  <input
                    type="number"
                    className="form-control"
                    min={1}
                    max={600}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 120)}
                  />
                  <p className="form-text small text-muted mb-0">e.g. 120 for a 2-hour paper. Filled from PDF when detected.</p>
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
                  Parsed {parsed.length} question(s) · {withImages} with figure image(s)
                </p>
                <ul className="list-group list-group-flush small mb-3" style={{ maxHeight: "240px", overflowY: "auto" }}>
                  {parsed.slice(0, 15).map((q, i) => (
                    <li key={i} className="list-group-item py-2 d-flex gap-2 align-items-start">
                      {q.questionImage ? (
                        <img
                          src={q.questionImage}
                          alt=""
                          className="rounded border flex-shrink-0"
                          style={{ width: 72, height: 54, objectFit: "cover" }}
                        />
                      ) : (
                        <span className="badge bg-secondary flex-shrink-0" style={{ width: 72, height: 54, lineHeight: "54px" }}>
                          No img
                        </span>
                      )}
                      <span className="text-truncate" style={{ maxWidth: "100%" }}>
                        {i + 1}. [{q.type}] {q.question?.slice(0, 55)}
                        {q.question?.length > 55 ? "…" : ""}
                      </span>
                    </li>
                  ))}
                  {parsed.length > 15 && <li className="list-group-item py-1 text-muted">… and {parsed.length - 15} more</li>}
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
  );
}
