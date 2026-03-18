import React, { useState, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { getScriptPostUrl } from "../../utils/scriptApi";
import { parseTextToQuestions } from "../../utils/pdfQuestionParser";

// Use legacy build for simpler worker handling in browser
if (typeof window !== "undefined" && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

export default function UploadQuestionPaperModal({ isOpen, onClose, onSaved, adminSecret, adminEmail }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [parsed, setParsed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    setError("");
    setParsed([]);
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
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const typed = new Uint8Array(reader.result);
        const pdf = await pdfjsLib.getDocument({ data: typed, useSystemFonts: true }).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map((it) => it.str).join(" ");
          fullText += pageText + "\n";
        }
        const questions = parseTextToQuestions(fullText);
        setParsed(questions);
        if (questions.length === 0) setError("No questions could be parsed. Try a PDF with clear numbering (1. 2. or Q1. Q2.) and options (a) (b) (c) (d).");
      } catch (err) {
        setError(err.message || "Failed to read PDF.");
        setParsed([]);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(f);
  };

  const handleSave = () => {
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
    setError("");
    setSaving(true);
    const url = getScriptPostUrl();
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "createPaper",
        adminSecret,
        adminEmail: adminEmail || "",
        name: paperName,
        questions: parsed
      })
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "success") {
          onSaved?.();
          onClose();
          setFile(null);
          setName("");
          setParsed([]);
        } else {
          setError(data.message || "Save failed.");
        }
      })
      .catch(() => setError("Network error."))
      .finally(() => setSaving(false));
  };

  const handleClose = () => {
    setFile(null);
    setName("");
    setParsed([]);
    setError("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} tabIndex={-1}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Upload question paper (PDF)</h5>
            <button type="button" className="btn-close" onClick={handleClose} aria-label="Close" />
          </div>
          <div className="modal-body">
            <p className="text-muted small">Upload a PDF. The parser looks for numbered questions (1. 2. or Q1. Q2.), MCQ options (a) (b) (c) (d), and Answer: / Ans: lines. Results may need manual review.</p>
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
            {loading && <p className="text-muted">Reading PDF…</p>}
            {parsed.length > 0 && (
              <>
                <div className="mb-3">
                  <label className="form-label">Paper name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Physics Unit 1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <p className="small fw-bold">Parsed {parsed.length} question(s):</p>
                <ul className="list-group list-group-flush small mb-3" style={{ maxHeight: "200px", overflowY: "auto" }}>
                  {parsed.slice(0, 20).map((q, i) => (
                    <li key={i} className="list-group-item py-1">
                      {i + 1}. [{q.type}] {q.question?.slice(0, 60)}…
                    </li>
                  ))}
                  {parsed.length > 20 && <li className="list-group-item py-1 text-muted">… and {parsed.length - 20} more</li>}
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
