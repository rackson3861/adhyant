import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { useAdmin } from "../../context/AdminContext";
import {
  getListPapersUrl,
  getPaperUrl,
  getGenerateCodeUrl,
  getListTestCodesUrl,
  getStartTestUrl,
  getSetTestCodeActiveUrl,
  getListTestCodeActivityUrl,
  getScriptPostUrl,
  getListFeedbackUrl,
  SCRIPT_URL
} from "../../utils/scriptApi";
import UploadQuestionPaperModal from "./UploadQuestionPaperModal";
import UploadAnswerKeyModal from "./UploadAnswerKeyModal";
import "/src/assets/css/adminDashboard.css";

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET || "";

/** List row: explicit "No" in sheet → no key; Yes or blank (legacy) → show as present. */
function listShowsAnswerKeyPresent(p) {
  return p && p.answerKeyPresent !== false;
}

/** Build rows for admin: in-progress and submitted students with session codes. */
function studentSessionRowsFromActivity(activity) {
  const ip = Array.isArray(activity?.inProgress) ? activity.inProgress : [];
  const sub = Array.isArray(activity?.submissions) ? activity.submissions : [];
  const rows = [];
  ip.forEach((s, i) => {
    rows.push({
      key: `p-${i}-${s.email}`,
      sessionCode: s.secondaryCode || "—",
      name: s.name || "—",
      email: s.email || "—",
      studentClass: s.studentClass || "—",
      status: "In progress",
      detail: s.startedAt ? `Started ${s.startedAt}` : "—",
    });
  });
  sub.forEach((s, i) => {
    rows.push({
      key: `s-${i}-${s.email}-${s.timestamp}`,
      sessionCode: s.secondaryCode || "—",
      name: s.studentName || "—",
      email: s.email || "—",
      studentClass: s.studentClass || "—",
      status: "Submitted",
      detail: s.score != null && s.total != null ? `Score ${s.score}/${s.total}` : "—",
    });
  });
  return rows;
}

/** Test codes store `questionPaperId`; show human-readable name with id when known. */
function formatQuestionPaperColumn(questionPaperId, papers) {
  const id = (questionPaperId || "").toString().trim();
  if (!id) return "Default";
  const list = Array.isArray(papers) ? papers : [];
  const p = list.find((x) => String(x.id ?? "").trim() === id);
  const name = p && String(p.name || "").trim();
  if (name) return `${name} (${id})`;
  return id;
}

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
  const [generatedSecondaryCodes, setGeneratedSecondaryCodes] = useState([]);
  const [resumeCodeCount, setResumeCodeCount] = useState(25);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [selectedPaperId, setSelectedPaperId] = useState("");
  const [papers, setPapers] = useState([]);
  const [papersLoading, setPapersLoading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [answerKeyModalOpen, setAnswerKeyModalOpen] = useState(false);
  const [feedbackList, setFeedbackList] = useState([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [testCodes, setTestCodes] = useState([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [codesError, setCodesError] = useState(null);
  const [startingCode, setStartingCode] = useState(null);
  const [togglingActiveCode, setTogglingActiveCode] = useState(null);
  const [codeActivity, setCodeActivity] = useState({});
  const [loadingActivityCode, setLoadingActivityCode] = useState(null);
  const [answerKeyViewOpen, setAnswerKeyViewOpen] = useState(false);
  const [answerKeyViewPaper, setAnswerKeyViewPaper] = useState(null);
  const [answerKeyViewQuestions, setAnswerKeyViewQuestions] = useState([]);
  const [answerKeyViewLoading, setAnswerKeyViewLoading] = useState(false);
  const [answerKeyViewError, setAnswerKeyViewError] = useState("");

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
    testCodes.forEach((c) => {
      const hasIssued = Array.isArray(c.secondaryCodes) && c.secondaryCodes.length > 0;
      if (c.started || hasIssued) {
        if (!codeActivity[c.code]) fetchCodeActivity(c.code);
      }
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

  const openAnswerKeyView = React.useCallback(async (p) => {
    if (!ADMIN_SECRET || !p?.id) {
      alert("Set VITE_ADMIN_SECRET in .env to view answer keys.");
      return;
    }
    setAnswerKeyViewPaper(p);
    setAnswerKeyViewOpen(true);
    setAnswerKeyViewLoading(true);
    setAnswerKeyViewError("");
    setAnswerKeyViewQuestions([]);
    const url = getPaperUrl(p.id, ADMIN_SECRET);
    if (!url) {
      setAnswerKeyViewError("Script URL not configured.");
      setAnswerKeyViewLoading(false);
      return;
    }
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== "success" || !data.paper) {
        setAnswerKeyViewError(data.message || "Failed to load paper.");
        return;
      }
      setAnswerKeyViewQuestions(Array.isArray(data.paper.questions) ? data.paper.questions : []);
    } catch (e) {
      setAnswerKeyViewError(e.message || "Network error.");
    } finally {
      setAnswerKeyViewLoading(false);
    }
  }, []);

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
    const url = getGenerateCodeUrl(ADMIN_SECRET, "", selectedPaperId || "", resumeCodeCount);
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
          setGeneratedSecondaryCodes(Array.isArray(data.secondaryCodes) ? data.secondaryCodes : []);
          const newRow = {
            code: data.code,
            createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
            questionPaperId: selectedPaperId || "",
            started: false,
            active: true
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

  const handleSetCodeActive = (code, makeActive) => {
    if (!ADMIN_SECRET) return;
    setTogglingActiveCode(code);
    const url = getSetTestCodeActiveUrl(ADMIN_SECRET, code, makeActive);
    if (!url) {
      setTogglingActiveCode(null);
      return;
    }
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "success") {
          setTestCodes((prev) => prev.map((c) => (c.code === code ? { ...c, active: makeActive } : c)));
        } else {
          alert(data.message || "Could not update code.");
        }
      })
      .catch(() => alert("Network error."))
      .finally(() => setTogglingActiveCode(null));
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
      <div className="admin-dash-page">
        <header className="admin-dash-hero">
          <div className="container admin-dash-hero-inner">
            <div className="admin-dash-hero-titles">
              <span className="admin-dash-kicker">Adhyant</span>
              <h1 className="admin-dash-title">Admin console</h1>
              <p className="admin-dash-subtitle">
                Test codes, question papers, submissions, and feedback — all in one place.
              </p>
            </div>
            <button type="button" className="btn admin-dash-logout" onClick={() => { logoutAdmin(); navigate("/"); }}>
              Log out
            </button>
          </div>
        </header>

        <div className="container admin-dash-body">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-4">
          <span className="admin-dash-stat-pill">Submissions &amp; monitoring</span>
        </div>

        <div className="card admin-dash-card mb-4">
          <div className="card-body">
            <h5 className="card-title">Question papers</h5>
            <p className="text-muted small mb-2">
              Upload a PDF to create a new question paper, or use an existing one when generating a test code. New papers start{" "}
              <strong>without</strong> a published answer key—upload an answer-sheet PDF later so scores can be computed for students.
            </p>
            {papersLoading ? (
              <p className="text-muted">Loading…</p>
            ) : (
              <>
                {papers.length > 0 && (
                  <ul className="list-group list-group-flush mb-3">
                    {papers.map((p) => (
                      <li key={p.id} className="list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <span>{p.name || p.id}</span>
                        <span className="d-flex align-items-center gap-2">
                          {listShowsAnswerKeyPresent(p) ? (
                            <button
                              type="button"
                              className="badge bg-success border-0"
                              style={{ cursor: "pointer" }}
                              onClick={() => openAnswerKeyView(p)}
                              title="View answers stored for this paper (admin only)"
                            >
                              Answer Key Present
                            </button>
                          ) : (
                            <span className="badge bg-secondary">No Answer Key</span>
                          )}
                          <span className="text-muted small">{p.createdAt}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="d-flex flex-wrap gap-2">
                  <button type="button" className="btn btn-outline-primary" onClick={() => setUploadModalOpen(true)}>
                    Upload new question paper (PDF)
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setAnswerKeyModalOpen(true)}
                    disabled={papers.length === 0}
                    title={papers.length === 0 ? "Upload a question paper first" : undefined}
                  >
                    Upload answer key (CSV / PDF)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card admin-dash-card mb-4">
          <div className="card-body">
            <h5 className="card-title">Generate test code</h5>
            <p className="text-muted small mb-2">
              Creates one <strong>test code</strong> (shared) plus <strong>session codes</strong> (personal—one per student). Students must enter <strong>both</strong> the test code and their own session code to start and to resume the same attempt on another browser/device.
            </p>
            {generateError && <div className="alert alert-danger py-2 small">{generateError}</div>}
            {generatedCode && (
              <div className="alert alert-success py-2 mb-2">
                <strong>Test code: {generatedCode}</strong>
                <p className="small mb-1 mt-1">Share this with everyone taking this test.</p>
                {generatedSecondaryCodes.length > 0 && (
                  <details className="small mt-2 admin-dash-secondary-codes">
                    <summary className="fw-semibold cursor-pointer">
                      Session codes ({generatedSecondaryCodes.length}) — assign one per student
                    </summary>
                    <p className="text-muted mb-1 mt-2">Copy or export from the list below. Each code is tied only to this test code.</p>
                    <textarea
                      className="form-control font-monospace small"
                      readOnly
                      rows={Math.min(12, Math.max(4, Math.ceil(generatedSecondaryCodes.length / 4)))}
                      value={generatedSecondaryCodes.join("\n")}
                    />
                  </details>
                )}
              </div>
            )}
            <div className="mb-3">
              <label className="form-label">Number of session codes to create</label>
              <input
                type="number"
                className="form-control"
                min={1}
                max={5000}
                value={resumeCodeCount}
                onChange={(e) => setResumeCodeCount(Math.max(1, Math.min(5000, parseInt(e.target.value, 10) || 25)))}
              />
              <div className="form-text">Typical: one code per registered student (max 5000).</div>
            </div>
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

        <div className="card admin-dash-card mb-4">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
              <h5 className="card-title mb-0">Test codes – Start test</h5>
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={fetchTestCodes} disabled={codesLoading || !ADMIN_SECRET}>
                {codesLoading ? "Loading…" : "Refresh list"}
              </button>
            </div>
            <p className="text-muted small mb-2">
              <strong>Start test</strong> lets students who already entered the code begin (until then they see &quot;Test not active yet&quot;).{" "}
              <strong>Close code</strong> blocks <em>everyone</em> from using that code (invalid / inactive)—use when the exam window is over or to revoke access. You can <strong>Reopen code</strong> later if needed.
            </p>
            {codesError && (
              <div className="alert alert-warning py-2 small mb-2">
                {codesError}
                <button type="button" className="btn btn-sm btn-outline-dark ms-2" onClick={fetchTestCodes}>Retry</button>
              </div>
            )}
            {codesLoading && testCodes.length === 0 ? (
              <p className="text-muted">Loading…</p>
            ) : (
              <div className="table-responsive admin-dash-table-wrap">
                <table className="table table-bordered mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Test code</th>
                      <th>Created</th>
                      <th>Question paper</th>
                      <th>Test started</th>
                      <th>Code open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testCodes.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center text-muted">No test codes yet. Generate one above.</td>
                      </tr>
                    ) : (
                      testCodes.map((c) => {
                        const act = codeActivity[c.code];
                        const studentRows = act ? studentSessionRowsFromActivity(act) : [];
                        return (
                          <React.Fragment key={c.code}>
                            <tr>
                              <td><code className="fw-semibold">{c.code}</code></td>
                              <td>{c.createdAt || "—"}</td>
                              <td>{formatQuestionPaperColumn(c.questionPaperId, papers)}</td>
                              <td>{c.started ? "Yes" : "No"}</td>
                              <td>
                                {c.active === false ? (
                                  <span className="badge bg-secondary">Closed</span>
                                ) : (
                                  <span className="badge bg-success">Open</span>
                                )}
                              </td>
                            </tr>
                            <tr className="table-light">
                              <td colSpan={5} className="p-0">
                                <div className="admin-dash-test-code-panel p-3 border-top">
                                  <div className="d-flex flex-wrap align-items-center gap-2 mb-3 pb-2 border-bottom">
                                    <span className="small fw-semibold text-muted text-uppercase me-1">Actions</span>
                                    {!c.started && c.active !== false && (
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-primary"
                                        disabled={startingCode === c.code}
                                        onClick={() => handleStartTest(c.code)}
                                      >
                                        {startingCode === c.code ? "Starting…" : "Start test"}
                                      </button>
                                    )}
                                    {c.started && c.active !== false && (
                                      <span className="text-success small">Test started — students can take the test</span>
                                    )}
                                    {c.active !== false ? (
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-danger"
                                        disabled={togglingActiveCode === c.code}
                                        onClick={() => {
                                          if (window.confirm(`Close test code ${c.code}? No one will be able to use this code until you reopen it.`)) {
                                            handleSetCodeActive(c.code, false);
                                          }
                                        }}
                                      >
                                        {togglingActiveCode === c.code ? "…" : "Close code"}
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-success"
                                        disabled={togglingActiveCode === c.code}
                                        onClick={() => handleSetCodeActive(c.code, true)}
                                      >
                                        {togglingActiveCode === c.code ? "…" : "Reopen code"}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-secondary"
                                      onClick={() => fetchCodeActivity(c.code)}
                                      disabled={loadingActivityCode === c.code}
                                    >
                                      {loadingActivityCode === c.code ? "Loading activity…" : "Refresh student activity"}
                                    </button>
                                  </div>
                                  <div className="row g-3">
                                    <div className="col-lg-5">
                                      <h6 className="small fw-bold mb-2">Issued session codes (give one per student)</h6>
                                      {Array.isArray(c.secondaryCodes) && c.secondaryCodes.length > 0 ? (
                                        <details className="small">
                                          <summary className="cursor-pointer">{c.secondaryCodes.length} codes — show / hide list</summary>
                                          <pre className="small mt-2 mb-0 p-2 bg-white border rounded admin-dash-code-pre">{c.secondaryCodes.join("\n")}</pre>
                                        </details>
                                      ) : (
                                        <p className="text-muted small mb-0">No pre-generated list (legacy test code). Students may only need the test code.</p>
                                      )}
                                    </div>
                                    <div className="col-lg-7">
                                      <h6 className="small fw-bold mb-2">Session codes used by students</h6>
                                      {loadingActivityCode === c.code ? (
                                        <p className="text-muted small mb-0">Loading…</p>
                                      ) : !act ? (
                                        <p className="text-muted small mb-0">
                                          Click <strong>Refresh student activity</strong> to load session codes students used when starting or submitting.
                                        </p>
                                      ) : studentRows.length === 0 ? (
                                        <p className="text-muted small mb-0">
                                          No students yet. After they enter their test + session code and start the timer, their session code appears here.
                                        </p>
                                      ) : (
                                        <div className="table-responsive">
                                          <table className="table table-sm table-bordered mb-0 bg-white small">
                                            <thead className="table-light">
                                              <tr>
                                                <th>Session code</th>
                                                <th>Student</th>
                                                <th>Class</th>
                                                <th>Email</th>
                                                <th>Status</th>
                                                <th>Detail</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {studentRows.map((r) => (
                                                <tr key={r.key}>
                                                  <td><code>{r.sessionCode}</code></td>
                                                  <td>{r.name}</td>
                                                  <td>{r.studentClass}</td>
                                                  <td className="text-break">{r.email}</td>
                                                  <td>
                                                    <span className={r.status === "Submitted" ? "text-success" : "text-warning"}>{r.status}</span>
                                                  </td>
                                                  <td>{r.detail}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
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
                  {submissions.some(
                    (s) =>
                      s.videoStatus === "pending" ||
                      s.videoStatus === "metadata_uploaded" ||
                      (s.videoStatus && s.videoStatus.startsWith("retry"))
                  ) && (
                    <span className="text-warning ms-1">
                      (
                      {submissions.filter(
                        (s) =>
                          s.videoStatus === "pending" ||
                          s.videoStatus === "metadata_uploaded" ||
                          (s.videoStatus && s.videoStatus.startsWith("retry"))
                      ).length}{" "}
                      pending/metadata/retry)
                    </span>
                  )}
                  {submissions.some((s) => s.videoStatus === "failed" || s.videoStatus === "video_failed") && (
                    <span className="text-danger ms-1">
                      ({submissions.filter((s) => s.videoStatus === "failed" || s.videoStatus === "video_failed").length} failed)
                    </span>
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
        <p className="text-muted small">
          Submissions use folder <strong>Adhyant_OnlineTest_Uploads</strong> on Drive (one subfolder per attempt: <code>submission_metadata.json</code> first, then <code>recording.webm</code>).
          Status <strong>metadata_uploaded</strong> means answers/metadata are saved even if video is still pending or failed. Legacy zip uploads also land under that root. Download uses the video/zip file ID when present.
        </p>
        {error && <div className="alert alert-danger">{error}</div>}
        {loading ? (
          <p>Loading…</p>
        ) : (
          <>
            <div className="mb-4 d-flex flex-wrap align-items-center gap-2">
              <strong>Total attempts: {submissions.length}</strong>
            </div>
            <div className="table-responsive admin-dash-table-wrap mb-4">
              <table className="table table-bordered mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Timestamp</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Aadhaar</th>
                    <th title="If no answer key was published, Score shows an internal note for organisers only (students do not see this).">
                      Score
                    </th>
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
                      const statusLabel =
                        videoStatus === "uploaded"
                          ? "Uploaded"
                          : videoStatus === "metadata_uploaded"
                            ? "Metadata saved (video pending)"
                            : videoStatus === "pending"
                              ? "Pending"
                              : videoStatus === "failed" || videoStatus === "video_failed"
                                ? "Failed"
                                : videoStatus.startsWith("retry_")
                                  ? `Retry ${videoStatus.replace("retry_", "")}`
                                  : videoStatus;
                      const statusClass =
                        videoStatus === "uploaded"
                          ? "text-success"
                          : videoStatus === "pending" || videoStatus === "metadata_uploaded" || videoStatus.startsWith("retry")
                            ? "text-warning"
                            : videoStatus === "failed" || videoStatus === "video_failed"
                              ? "text-danger"
                              : "";
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
                            <div className="d-flex flex-wrap gap-1">
                              {row.fileId ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  disabled={downloadingId === row.fileId}
                                  onClick={() => handleDownload(row.fileId, row.fileName)}
                                >
                                  {downloadingId === row.fileId ? "…" : "Video / zip"}
                                </button>
                              ) : null}
                              {row.metadataFileId ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary"
                                  disabled={downloadingId === row.metadataFileId}
                                  onClick={() => handleDownload(row.metadataFileId, "submission_metadata.json")}
                                >
                                  {downloadingId === row.metadataFileId ? "…" : "Metadata JSON"}
                                </button>
                              ) : null}
                              {!row.fileId && !row.metadataFileId ? "—" : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <h5 className="mt-4 mb-3 fw-bold text-dark">Feedback</h5>
            {feedbackLoading ? (
              <p className="text-muted">Loading…</p>
            ) : (
              <div className="table-responsive admin-dash-table-wrap">
                <table className="table table-bordered mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Timestamp</th>
                      <th>Rating</th>
                      <th>Comment</th>
                      <th>Student Name</th>
                      <th>Class</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Drive status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedbackList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center text-muted">No feedback yet.</td>
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
                            <td>{fb.studentClass || "—"}</td>
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
      <UploadAnswerKeyModal
        isOpen={answerKeyModalOpen}
        onClose={() => setAnswerKeyModalOpen(false)}
        papers={papers}
        onSaved={() => {
          const url = getListPapersUrl();
          if (url) fetch(url).then((r) => r.json()).then((d) => { if (d.status === "success" && Array.isArray(d.papers)) setPapers(d.papers); });
        }}
        adminSecret={ADMIN_SECRET}
      />
      {answerKeyViewOpen && (
        <div
          className="modal d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="answer-key-view-title"
        >
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id="answer-key-view-title">
                  Answer key — {answerKeyViewPaper?.name || answerKeyViewPaper?.id || "Paper"}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => {
                    setAnswerKeyViewOpen(false);
                    setAnswerKeyViewPaper(null);
                    setAnswerKeyViewQuestions([]);
                    setAnswerKeyViewError("");
                  }}
                />
              </div>
              <div className="modal-body">
                {answerKeyViewLoading && <p className="text-muted mb-0">Loading…</p>}
                {answerKeyViewError && <div className="alert alert-danger py-2 small">{answerKeyViewError}</div>}
                {!answerKeyViewLoading && !answerKeyViewError && (
                  <div className="table-responsive">
                    <table className="table table-sm table-bordered align-middle">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Type</th>
                          <th>Answer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {answerKeyViewQuestions.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="text-muted small">
                              No questions or no answers in stored data. Upload an answer key if needed.
                            </td>
                          </tr>
                        ) : (
                          answerKeyViewQuestions.map((q, idx) => {
                            const num = q.paperQuestionNum != null ? q.paperQuestionNum : idx + 1;
                            const ans = q.answer;
                            const ansStr =
                              ans === undefined || ans === null || ans === ""
                                ? "—"
                                : typeof ans === "object"
                                  ? JSON.stringify(ans)
                                  : String(ans);
                            return (
                              <tr key={q.id || idx}>
                                <td>{num}</td>
                                <td>{q.type || "mcq"}</td>
                                <td className="font-monospace small">{ansStr}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
