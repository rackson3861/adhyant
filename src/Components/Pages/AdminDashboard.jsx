import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { useAdmin } from "../../context/AdminContext";
import {
  getListPapersUrl,
  getGenerateCodeUrl,
  getListTestCodesUrl,
  getStartTestUrl,
  getListTestCodeActivityUrl,
  getScriptPostUrl,
  getListFeedbackUrl,
  SCRIPT_URL
} from "../../utils/scriptApi";
import UploadQuestionPaperModal from "./UploadQuestionPaperModal";

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET || "";

function getListUrl() {
  if (!SCRIPT_URL) return null;
  const base = SCRIPT_URL.replace(/\/exec\/?$/, "").replace(/\/macros\/s\/[^/]+\/?$/, "");
  const scriptId = SCRIPT_URL.match(/\/macros\/s\/([^/]+)/)?.[1];
  if (scriptId) return `${base}/macros/s/${scriptId}/exec?action=list`;
  return SCRIPT_URL + (SCRIPT_URL.indexOf("?") >= 0 ? "&" : "?") + "action=list";
}

function getDownloadUrl(fileId) {
  if (!SCRIPT_URL) return null;
  const base = SCRIPT_URL.replace(/\/exec\/?$/, "").replace(/\/macros\/s\/[^/]+\/?$/, "");
  const scriptId = SCRIPT_URL.match(/\/macros\/s\/([^/]+)/)?.[1];
  if (scriptId) return `${base}/macros/s/${scriptId}/exec?action=download&fileId=${encodeURIComponent(fileId)}`;
  return SCRIPT_URL + (SCRIPT_URL.indexOf("?") >= 0 ? "&" : "?") + "action=download&fileId=" + encodeURIComponent(fileId);
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isAdmin, loginAdmin, logoutAdmin } = useAdmin();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [generatedCode, setGeneratedCode] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [selectedPaperId, setSelectedPaperId] = useState("");
  const [papers, setPapers] = useState([]);
  const [papersLoading, setPapersLoading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [feedbackList, setFeedbackList] = useState([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [testCodes, setTestCodes] = useState([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [codesError, setCodesError] = useState(null);
  const [startingCode, setStartingCode] = useState(null);
  const [codeActivity, setCodeActivity] = useState({});
  const [loadingActivityCode, setLoadingActivityCode] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    const url = getListUrl();
    if (!url) {
      setError("Set NEXT_PUBLIC_RECORDING_UPLOAD_URL (Apps Script Web App URL) to load submissions.");
      setLoading(false);
      return;
    }
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "success" && Array.isArray(data.submissions)) {
          setSubmissions(data.submissions);
        } else {
          setError(data.message || "Failed to load list.");
        }
      })
      .catch((err) => setError(err.message || "Network error."))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const url = getListPapersUrl();
    if (!url) return;
    setPapersLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "success" && Array.isArray(data.papers)) {
          setPapers(data.papers);
        }
      })
      .catch(() => {})
      .finally(() => setPapersLoading(false));
  }, [isAdmin]);

  const fetchTestCodes = React.useCallback(() => {
    const listUrl = getListTestCodesUrl(ADMIN_SECRET);
    if (!listUrl) {
      setCodesError("Script URL not set. Add NEXT_PUBLIC_RECORDING_UPLOAD_URL or VITE_RECORDING_UPLOAD_URL or VITE_TEST_SUBMISSION_URL in .env");
      return;
    }
    if (!ADMIN_SECRET) {
      setCodesError("Admin secret not set. Add VITE_ADMIN_SECRET in .env and ADMIN_SECRET in Apps Script (Script Properties).");
      return;
    }
    setCodesError(null);
    setCodesLoading(true);
    fetch(listUrl)
      .then((r) => r.json())
      .then((d) => {
        if (d.status === "success" && Array.isArray(d.codes)) {
          setTestCodes(d.codes);
          setCodesError(null);
        } else {
          const msg = d.message || "Could not load test codes.";
          const hint = msg.indexOf("Use ?action=") !== -1
            ? " Redeploy your Apps Script (Deploy → Manage deployments → New version → Deploy) so listTestCodes is available."
            : "";
          setCodesError(msg + hint);
        }
      })
      .catch((err) => {
        setCodesError(err.message || "Network error loading test codes.");
      })
      .finally(() => setCodesLoading(false));
  }, []);

  useEffect(() => {
    if (!isAdmin || !ADMIN_SECRET) return;
    fetchTestCodes();
  }, [isAdmin, fetchTestCodes]);

  const fetchCodeActivity = React.useCallback((code) => {
    const url = getListTestCodeActivityUrl(ADMIN_SECRET, code);
    if (!url) return;
    setLoadingActivityCode((prev) => (prev === code ? prev : code));
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (d.status === "success")
          setCodeActivity((prev) => ({ ...prev, [code]: { inProgress: d.inProgress || [], submissions: d.submissions || [] } }));
      })
      .catch(() => {})
      .finally(() => setLoadingActivityCode((prev) => (prev === code ? null : prev)));
  }, []);

  useEffect(() => {
    if (!ADMIN_SECRET || !testCodes.length) return;
    testCodes.filter((c) => c.started).forEach((c) => {
      if (!codeActivity[c.code]) fetchCodeActivity(c.code);
    });
  }, [testCodes, ADMIN_SECRET, fetchCodeActivity]);

  useEffect(() => {
    if (!isAdmin) return;
    const url = getListFeedbackUrl();
    if (!url) return;
    setFeedbackLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "success" && Array.isArray(data.feedback)) {
          setFeedbackList(data.feedback);
        }
      })
      .catch(() => {})
      .finally(() => setFeedbackLoading(false));
  }, [isAdmin]);

  const handleDownload = (fileId, fileName) => {
    const url = getDownloadUrl(fileId);
    if (!url) return;
    setDownloadingId(fileId);
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "success" && data.content) {
          const binary = atob(data.content);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: "application/zip" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = data.fileName || fileName || "recording.zip";
          a.click();
          URL.revokeObjectURL(a.href);
        } else {
          alert(data.message || "Download failed.");
        }
      })
      .catch(() => alert("Download failed."))
      .finally(() => setDownloadingId(null));
  };

  const handleGenerateCode = () => {
    if (!ADMIN_SECRET) {
      setGenerateError("Set VITE_ADMIN_SECRET in .env and ADMIN_SECRET in Apps Script (Script Properties) to generate codes.");
      return;
    }
    setGenerateError(null);
    setGenerating(true);
    const url = getGenerateCodeUrl(ADMIN_SECRET, "", selectedPaperId || "");
    if (!url) {
      setGenerateError("Script URL not configured.");
      setGenerating(false);
      return;
    }
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "success" && data.code) {
          setGeneratedCode(data.code);
          const newRow = {
            code: data.code,
            createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
            questionPaperId: selectedPaperId || "",
            started: false
          };
          setTestCodes((prev) => [newRow, ...prev]);
          fetchTestCodes();
        } else {
          setGenerateError(data.message || "Failed to generate code.");
        }
      })
      .catch(() => setGenerateError("Network error."))
      .finally(() => setGenerating(false));
  };

  const handleStartTest = (code) => {
    if (!ADMIN_SECRET) return;
    setStartingCode(code);
    const url = getStartTestUrl(ADMIN_SECRET, code);
    if (!url) {
      setStartingCode(null);
      return;
    }
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "success") {
          setTestCodes((prev) => prev.map((c) => (c.code === code ? { ...c, started: true } : c)));
          fetchCodeActivity(code);
        }
      })
      .catch(() => {})
      .finally(() => setStartingCode(null));
  };

  if (!isAdmin) {
    return (
      <>
        <Navbar />
        <div className="container py-5">
          <div className="row justify-content-center">
            <div className="col-md-5">
              <div className="card shadow">
                <div className="card-body p-4">
                  <h5 className="card-title mb-3">Admin login</h5>
                  <p className="text-muted small mb-3">Enter admin username and password.</p>
                  {loginError && <div className="alert alert-danger py-2 small">{loginError}</div>}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setLoginError("");
                      if (loginAdmin(loginUser, loginPass)) {
                        navigate("/admin", { replace: true });
                      } else {
                        setLoginError("Invalid username or password.");
                      }
                    }}
                  >
                    <div className="mb-2">
                      <label className="form-label">Username</label>
                      <input
                        type="text"
                        className="form-control"
                        value={loginUser}
                        onChange={(e) => setLoginUser(e.target.value)}
                        autoComplete="username"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Password</label>
                      <input
                        type="password"
                        className="form-control"
                        value={loginPass}
                        onChange={(e) => setLoginPass(e.target.value)}
                        autoComplete="current-password"
                      />
                    </div>
                    <button type="submit" className="btn btn-primary w-100">Login</button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="container py-5">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2 className="mb-0">Admin – Test submissions</h2>
          <button type="button" className="btn btn-outline-secondary" onClick={() => { logoutAdmin(); navigate("/"); }}>
            Logout
          </button>
        </div>

        <div className="card mb-4">
          <div className="card-body">
            <h5 className="card-title">Generate test code</h5>
            <p className="text-muted small mb-2">Test code format: 3 letters + 6 digits (e.g. ABC123456). Share with students to access the test. Select which question paper this code will use.</p>
            {generateError && <div className="alert alert-danger py-2 small">{generateError}</div>}
            {generatedCode && (
              <div className="alert alert-success py-2 mb-2">
                <strong>Test code: {generatedCode}</strong>
                <p className="small mb-0 mt-1">Students enter this on the test page to get access.</p>
              </div>
            )}
            <div className="mb-3">
              <label className="form-label">Question paper for this code</label>
              <select
                className="form-select"
                value={selectedPaperId}
                onChange={(e) => setSelectedPaperId(e.target.value)}
                disabled={papersLoading}
              >
                <option value="">Default (built-in paper)</option>
                {papers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name || p.id}</option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-primary" onClick={handleGenerateCode} disabled={generating}>
              {generating ? "Generating…" : "Generate new test code"}
            </button>
          </div>
        </div>

        <div className="card mb-4">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
              <h5 className="card-title mb-0">Test codes – Start test</h5>
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={fetchTestCodes} disabled={codesLoading || !ADMIN_SECRET}>
                {codesLoading ? "Loading…" : "Refresh list"}
              </button>
            </div>
            <p className="text-muted small mb-2">Only when you start a test for a code can students with that code begin. Until then they see: &quot;Test not active yet. Please wait for organiser to start.&quot;</p>
            {codesError && (
              <div className="alert alert-warning py-2 small mb-2">
                {codesError}
                <button type="button" className="btn btn-sm btn-outline-dark ms-2" onClick={fetchTestCodes}>Retry</button>
              </div>
            )}
            {codesLoading && testCodes.length === 0 ? (
              <p className="text-muted">Loading…</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-bordered mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Code</th>
                      <th>Created at</th>
                      <th>Question paper</th>
                      <th>Started</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testCodes.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center text-muted">No test codes yet. Generate one above.</td>
                      </tr>
                    ) : (
                      testCodes.map((c) => (
                        <React.Fragment key={c.code}>
                          <tr>
                            <td><code>{c.code}</code></td>
                            <td>{c.createdAt || "—"}</td>
                            <td>{c.questionPaperId || "Default"}</td>
                            <td>{c.started ? "Yes" : "No"}</td>
                            <td>
                              {c.started ? (
                                <span className="text-success small">Active</span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  disabled={startingCode === c.code}
                                  onClick={() => handleStartTest(c.code)}
                                >
                                  {startingCode === c.code ? "Starting…" : "Start test"}
                                </button>
                              )}
                            </td>
                          </tr>
                          {c.started && (
                            <tr className="table-light">
                              <td colSpan={5} className="p-3">
                                <div className="small">
                                  <div className="d-flex align-items-center gap-2 flex-wrap">
                                    <strong>Activity under this code</strong>
                                    <button type="button" className="btn btn-sm btn-outline-secondary py-0 px-2" onClick={() => fetchCodeActivity(c.code)} disabled={loadingActivityCode === c.code}>
                                      {loadingActivityCode === c.code ? "Loading…" : "Refresh"}
                                    </button>
                                  </div>
                                  {loadingActivityCode === c.code ? (
                                    <p className="text-muted mb-0 mt-1">Loading…</p>
                                  ) : (
                                    <>
                                      {codeActivity[c.code] && (
                                        <>
                                          {((codeActivity[c.code].inProgress || []).length > 0 || (codeActivity[c.code].submissions || []).length > 0) ? (
                                            <>
                                              {(codeActivity[c.code].inProgress || []).length > 0 && (
                                                <p className="mb-1 mt-2"><strong>In progress:</strong></p>
                                              )}
                                              <ul className="list-unstyled mb-2">
                                                {(codeActivity[c.code].inProgress || []).map((s, i) => (
                                                  <li key={i} className="text-warning">• {s.name || s.email || "—"} ({s.email || "—"}) — Test in progress</li>
                                                ))}
                                              </ul>
                                              {(codeActivity[c.code].submissions || []).length > 0 && (
                                                <p className="mb-1 mt-2"><strong>Submitted:</strong></p>
                                              )}
                                              <ul className="list-unstyled mb-0">
                                                {(codeActivity[c.code].submissions || []).map((s, i) => (
                                                  <li key={i} className="text-success">• {s.studentName || s.email || "—"} — Submitted — Score: {s.score != null && s.total != null ? `${s.score}/${s.total}` : "—"}</li>
                                                ))}
                                              </ul>
                                            </>
                                          ) : (
                                            <p className="text-muted mb-0 mt-1">No activity yet. When a student starts the test (enters code and starts the timer), they will appear under &quot;In progress&quot;. Click Refresh to update.</p>
                                          )}
                                        </>
                                      )}
                                      {!codeActivity[c.code] && loadingActivityCode !== c.code && (
                                        <button type="button" className="btn btn-sm btn-link p-0 mt-1" onClick={() => fetchCodeActivity(c.code)}>Load activity</button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card mb-4">
          <div className="card-body">
            <h5 className="card-title">Question papers</h5>
            <p className="text-muted small mb-2">Upload a PDF to create a new question paper, or use an existing one when generating a test code.</p>
            {papersLoading ? (
              <p className="text-muted">Loading…</p>
            ) : (
              <>
                {papers.length > 0 && (
                  <ul className="list-group list-group-flush mb-3">
                    {papers.map((p) => (
                      <li key={p.id} className="list-group-item d-flex justify-content-between align-items-center">
                        <span>{p.name || p.id}</span>
                        <span className="text-muted small">{p.createdAt}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className="btn btn-outline-primary" onClick={() => setUploadModalOpen(true)}>
                  Upload new question paper (PDF)
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mb-4 p-3 rounded border bg-light">
          <h6 className="mb-2">Drive status</h6>
          <div className="d-flex flex-wrap gap-4">
            <div>
              <span className="fw-bold">Recording video → Drive:</span>{" "}
              {loading ? "…" : (
                <>
                  <span className="text-success">{submissions.filter((s) => s.videoStatus === "uploaded").length} uploaded</span>
                  {submissions.some((s) => s.videoStatus === "pending" || (s.videoStatus && s.videoStatus.startsWith("retry"))) && (
                    <span className="text-warning ms-1">({submissions.filter((s) => s.videoStatus === "pending" || (s.videoStatus && s.videoStatus.startsWith("retry"))).length} pending/retry)</span>
                  )}
                  {submissions.some((s) => s.videoStatus === "failed") && (
                    <span className="text-danger ms-1">({submissions.filter((s) => s.videoStatus === "failed").length} failed)</span>
                  )}
                </>
              )}
            </div>
            <div>
              <span className="fw-bold">Feedback form → Drive:</span>{" "}
              {feedbackLoading ? "…" : (
                <>
                  <span className="text-success">{feedbackList.filter((f) => f.driveStatus === "uploaded").length} uploaded</span>
                  {feedbackList.some((f) => f.driveStatus === "pending" || (f.driveStatus && f.driveStatus.startsWith("retry"))) && (
                    <span className="text-warning ms-1">({feedbackList.filter((f) => f.driveStatus === "pending" || (f.driveStatus && f.driveStatus.startsWith("retry"))).length} pending/retry)</span>
                  )}
                  {feedbackList.some((f) => f.driveStatus === "failed") && (
                    <span className="text-danger ms-1">({feedbackList.filter((f) => f.driveStatus === "failed").length} failed)</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        <p className="text-muted">Metadata only below. Video status: Pending (uploading), Retry 1/2/3, Uploaded, or Failed. Use Download to get the recording zip from Google Drive.</p>
        {error && <div className="alert alert-danger">{error}</div>}
        {loading ? (
          <p>Loading…</p>
        ) : (
          <>
            <div className="mb-4">
              <strong>Total students who gave the test: {submissions.length}</strong>
            </div>
            <div className="table-responsive">
              <table className="table table-bordered">
                <thead className="table-light">
                  <tr>
                    <th>Timestamp</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Aadhaar</th>
                    <th>Score</th>
                    <th>Total</th>
                    <th>Video size</th>
                    <th>Mobile</th>
                    <th>Events</th>
                    <th>Video status</th>
                    <th>Download</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center text-muted">No submissions yet.</td>
                    </tr>
                  ) : (
                    submissions.map((row, i) => {
                      const sizeBytes = row.fileSizeBytes != null ? Number(row.fileSizeBytes) : 0;
                      const sizeMB = sizeBytes / (1024 * 1024);
                      const maxMB = 20;
                      const barPct = maxMB > 0 ? Math.min(100, (sizeMB / maxMB) * 100) : 0;
                      const videoStatus = row.videoStatus || (row.fileId ? "uploaded" : "pending");
                      const statusLabel = videoStatus === "uploaded" ? "Uploaded" : videoStatus === "pending" ? "Pending" : videoStatus === "failed" ? "Failed" : videoStatus.startsWith("retry_") ? `Retry ${videoStatus.replace("retry_", "")}` : videoStatus;
                      const statusClass = videoStatus === "uploaded" ? "text-success" : videoStatus === "pending" || videoStatus.startsWith("retry") ? "text-warning" : videoStatus === "failed" ? "text-danger" : "";
                      return (
                        <tr key={i}>
                          <td>{String(row.timestamp)}</td>
                          <td>{row.studentName}</td>
                          <td>{row.email}</td>
                          <td>{row.phone || "—"}</td>
                          <td>{row.adhar}</td>
                          <td>{row.score}</td>
                          <td>{row.total}</td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <div className="progress flex-grow-1" style={{ width: 80, height: 18 }}>
                                <div
                                  className="progress-bar bg-primary"
                                  role="progressbar"
                                  style={{ width: `${barPct}%` }}
                                  aria-valuenow={barPct}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                />
                              </div>
                              <span className="small">{sizeBytes ? `${sizeMB.toFixed(2)} MB` : "—"}</span>
                            </div>
                          </td>
                          <td>{row.isMobile}</td>
                          <td><pre className="small mb-0" style={{ maxWidth: "200px", overflow: "auto" }}>{row.events || "—"}</pre></td>
                          <td>
                            <span className={`small ${statusClass}`}>{statusLabel}</span>
                            {videoStatus === "failed" && row.uploadError && (
                              <div className="small text-muted mt-1 text-break" style={{ maxWidth: 320, maxHeight: 80, overflow: "auto" }} title={row.uploadError}>
                                {row.uploadError}
                              </div>
                            )}
                          </td>
                          <td>
                            {row.fileId ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  disabled={downloadingId === row.fileId}
                                  onClick={() => handleDownload(row.fileId, row.fileName)}
                                >
                                  {downloadingId === row.fileId ? "…" : "Download"}
                                </button>
                              </>
                            ) : "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <h5 className="mt-5 mb-3">Feedback submissions</h5>
            {feedbackLoading ? (
              <p className="text-muted">Loading…</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-bordered">
                  <thead className="table-light">
                    <tr>
                      <th>Timestamp</th>
                      <th>Rating</th>
                      <th>Comment</th>
                      <th>Student Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Drive status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedbackList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center text-muted">No feedback yet.</td>
                      </tr>
                    ) : (
                      feedbackList.map((fb, i) => {
                        const ds = fb.driveStatus || "uploaded";
                        const dsLabel = ds === "uploaded" ? "Uploaded" : ds === "pending" ? "Pending" : ds === "failed" ? "Failed" : ds.startsWith("retry_") ? `Retry ${ds.replace("retry_", "")}` : ds;
                        const dsClass = ds === "uploaded" ? "text-success" : ds === "pending" || ds.startsWith("retry") ? "text-warning" : ds === "failed" ? "text-danger" : "";
                        return (
                          <tr key={i}>
                            <td>{String(fb.timestamp)}</td>
                            <td>{fb.ratingLabel || fb.rating}</td>
                            <td><span className="d-inline-block text-truncate" style={{ maxWidth: 200 }} title={fb.comment}>{fb.comment || "—"}</span></td>
                            <td>{fb.studentName || "—"}</td>
                            <td>{fb.studentEmail || "—"}</td>
                            <td>{fb.studentPhone || "—"}</td>
                            <td><span className={`small ${dsClass}`}>{dsLabel}</span></td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
      <Footer />
      <UploadQuestionPaperModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSaved={() => {
          const url = getListPapersUrl();
          if (url) fetch(url).then((r) => r.json()).then((d) => { if (d.status === "success" && Array.isArray(d.papers)) setPapers(d.papers); });
        }}
        adminSecret={ADMIN_SECRET}
        adminEmail=""
      />
    </>
  );
}
