import React, { useState, useRef } from "react";
import { getScriptPostUrl, postToAppsScript, getPaperUrl } from "../../utils/scriptApi";
import { parsePdfBytesToQuestionsWithImages, setLocalPdfWorker } from "../../utils/pdfExtractQuestionsWithImages";
import { parseAnswerKeyCsv, buildKeyQuestionsFromCsvRows } from "../../utils/parseAnswerKeyCsv";

function questionHasGradableAnswer(q) {
  if (!q) return false;
  if (q.type === "integer") {
    return q.answer !== undefined && q.answer !== null && q.answer !== "" && !Number.isNaN(Number(q.answer));
  }
  return q.answer !== undefined && q.answer !== null && String(q.answer).trim() !== "";
}

function isCsvFile(f) {
  if (!f?.name) return false;
  const n = f.name.toLowerCase();
  return n.endsWith(".csv") || f.type === "text/csv" || f.type === "application/vnd.ms-excel";
}

function isPdfFile(f) {
  if (!f?.name) return false;
  return f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf";
}

export default function UploadAnswerKeyModal({ isOpen, onClose, onSaved, adminSecret, papers }) {
  const [paperId, setPaperId] = useState("");
  const [file, setFile] = useState(null);
  const [sourceKind, setSourceKind] = useState("none"); // none | csv | pdf
  const [csvRows, setCsvRows] = useState([]);
  const [csvParseError, setCsvParseError] = useState(null);
  const [pdfParsed, setPdfParsed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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
    setCsvRows([]);
    setCsvParseError(null);
    setPdfParsed([]);
    setSourceKind("none");
    if (!f) {
      setFile(null);
      return;
    }

    if (isCsvFile(f)) {
      setFile(f);
      setLoading(true);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = typeof reader.result === "string" ? reader.result : "";
          const { rows, error: parseErr } = parseAnswerKeyCsv(text);
          if (parseErr) {
            setCsvParseError(parseErr);
            setSourceKind("none");
            setFile(null);
          } else {
            setCsvRows(rows);
            setSourceKind("csv");
          }
        } catch (err) {
          setCsvParseError(err.message || "Could not read CSV.");
          setSourceKind("none");
          setFile(null);
        } finally {
          setLoading(false);
        }
      };
      reader.onerror = () => {
        setCsvParseError("Failed to read file.");
        setLoading(false);
        setFile(null);
      };
      reader.readAsText(f, "UTF-8");
      return;
    }

    if (isPdfFile(f)) {
      setFile(f);
      setLoading(true);
      setLocalPdfWorker();
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const typed = new Uint8Array(reader.result);
          const { questions } = await parsePdfBytesToQuestionsWithImages(typed);
          setPdfParsed(questions);
          const withAns = questions.filter(questionHasGradableAnswer);
          if (questions.length === 0) {
            setError("No questions could be parsed from this PDF.");
            setSourceKind("none");
            setFile(null);
          } else if (withAns.length === 0) {
            setError("Parsed PDF has no detectable answers. Try a CSV answer key instead.");
            setSourceKind("none");
            setFile(null);
          } else {
            setSourceKind("pdf");
            setError("");
          }
        } catch (err) {
          setError(err.message || "Failed to read PDF.");
          setPdfParsed([]);
          setSourceKind("none");
          setFile(null);
        } finally {
          setLoading(false);
        }
      };
      reader.readAsArrayBuffer(f);
      return;
    }

    setError("Please choose a .csv or .pdf file.");
    setFile(null);
  };

  const handleSave = async () => {
    if (!adminSecret) {
      setError("Admin secret not configured.");
      return;
    }
    const pid = (paperId || "").trim();
    if (!pid) {
      setError("Select a question paper.");
      return;
    }

    const url = getScriptPostUrl();
    if (!url || !/^https?:\/\//i.test(url)) {
      setError("Script URL is not set. Add NEXT_PUBLIC_RECORDING_UPLOAD_URL (or VITE_RECORDING_UPLOAD_URL) in .env.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      let keyQuestions = [];

      if (sourceKind === "csv") {
        const paperUrl = getPaperUrl(pid);
        if (!paperUrl) {
          setError("Could not build paper URL.");
          setSaving(false);
          return;
        }
        const pres = await fetch(paperUrl);
        const pdata = await pres.json();
        if (pdata.status !== "success" || !Array.isArray(pdata.paper?.questions)) {
          setError(pdata.message || "Could not load the question paper. Check paper id and script URL.");
          setSaving(false);
          return;
        }
        keyQuestions = buildKeyQuestionsFromCsvRows(pdata.paper.questions, csvRows);
        if (keyQuestions.length === 0) {
          setError(
            "No answers could be matched. Check that question numbers in the CSV line up with this paper (1…N or paperQuestionNum), and MCQ answer keys are 1–4 for option position."
          );
          setSaving(false);
          return;
        }
      } else if (sourceKind === "pdf") {
        pdfParsed.forEach((q, i) => {
          if (!questionHasGradableAnswer(q)) return;
          keyQuestions.push({
            paperQuestionNum: q.paperQuestionNum != null ? q.paperQuestionNum : i + 1,
            questionIndex: i,
            answer: q.answer,
            type: q.type,
            ...(Array.isArray(q.options) && q.options.length > 0 ? { options: q.options } : {}),
            ...(q.min != null ? { min: q.min } : {}),
            ...(q.max != null ? { max: q.max } : {}),
          });
        });
        if (keyQuestions.length === 0) {
          setError("No answers to upload from PDF.");
          setSaving(false);
          return;
        }
      } else {
        setError("Choose a CSV or PDF answer key file.");
        setSaving(false);
        return;
      }

      const r = await postToAppsScript(url, {
        action: "uploadPaperAnswerKey",
        adminSecret,
        paperId: pid,
        keyQuestions,
      });
      const data = await parseJsonResponse(r);
      if (data.status !== "success") {
        setError(data.message || "Upload failed.");
        return;
      }
      onSaved?.();
      onClose();
      setFile(null);
      setPaperId("");
      setCsvRows([]);
      setPdfParsed([]);
      setSourceKind("none");
      setCsvParseError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      const msg = err?.message || "";
      if (/failed to fetch|networkerror|load failed|err_failed/i.test(msg)) {
        setError("Could not reach Google Apps Script. Check deployment URL and redeploy if needed.");
      } else {
        setError(msg || "Upload failed.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPaperId("");
    setCsvRows([]);
    setPdfParsed([]);
    setSourceKind("none");
    setCsvParseError(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClose();
  };

  if (!isOpen) return null;

  const pdfKeyCount = pdfParsed.filter(questionHasGradableAnswer).length;
  const readyCount = sourceKind === "csv" ? csvRows.length : sourceKind === "pdf" ? pdfKeyCount : 0;
  const canMerge = Boolean(paperId && readyCount > 0 && !csvParseError);

  return (
    <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Upload answer key (CSV or PDF)</h5>
            <button type="button" className="btn-close" onClick={handleClose} aria-label="Close" />
          </div>
          <div className="modal-body">
            <p className="text-muted small">
              <strong>CSV (recommended):</strong> two columns — <code>Question Number</code> and <code>Answer Key</code>. For MCQ, use{" "}
              <strong>1–4</strong> for the correct option (same order as on the online test). Rows are merged into the selected paper; scoring uses the real option text.{" "}
              <strong>PDF:</strong> optional; uses the same parser as question papers.
            </p>
            {error && <div className="alert alert-danger py-2 small">{error}</div>}
            {csvParseError && <div className="alert alert-warning py-2 small">{csvParseError}</div>}
            <div className="mb-3">
              <label className="form-label">Question paper</label>
              <select className="form-select" value={paperId} onChange={(e) => setPaperId(e.target.value)}>
                <option value="">Select paper…</option>
                {(papers || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.id}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label">Answer key file</label>
              <input
                ref={fileInputRef}
                type="file"
                className="form-control"
                accept=".csv,text/csv,application/vnd.ms-excel,.pdf,application/pdf"
                onChange={handleFileChange}
              />
              <p className="form-text small text-muted mb-0">Example CSV: first row <code>Question Number,Answer Key</code> then <code>1,2</code> for Q1 → option 2.</p>
            </div>
            {loading && <p className="text-muted">Reading file…</p>}
            {sourceKind === "csv" && csvRows.length > 0 && (
              <p className="small fw-bold mb-0 text-success">
                Loaded <strong>{csvRows.length}</strong> answer row{csvRows.length === 1 ? "" : "s"} from CSV (will map to MCQ options / integers on merge).
              </p>
            )}
            {sourceKind === "pdf" && pdfKeyCount > 0 && (
              <p className="small fw-bold mb-0">
                Parsed {pdfParsed.length} block(s) · {pdfKeyCount} with answers (will merge)
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={handleClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || !canMerge}>
              {saving ? "Uploading…" : "Apply answer key"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
