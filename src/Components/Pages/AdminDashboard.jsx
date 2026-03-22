import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { useAdmin } from "../../context/AdminContext";
import {
  getGenerateCodeUrl,
  getListTestCodesUrl,
  getStartTestUrl,
  getListTestCodeActivityUrl,
  getScriptPostUrl,
  postSetTestCodeActive,
  isScriptPostUrlReady,
  getListFeedbackUrl,
  getListSubmissionsUrl,
  getAppsScriptDownloadUrl,
  getClearAllTestDataUrl,
  ADMIN_BULK_RESET_PHRASE_HINT,
  isAdminBulkResetPhraseValid,
  parseAppsScriptFetchResponse,
  SCRIPT_URL
} from "../../utils/scriptApi";
import { getBundledPaperBrandTitle } from "../../utils/bundledPaperBrandTitles";
import { getPapersIndexUrl } from "../../utils/localPapersCatalog";
import "/src/assets/css/adminDashboard.css";

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET || "";

/** Expandable list of snapshot / segment lines (subsection under summary). */
function AdminChunkLogSubsection({ title, summary, logText }) {
  const lines = React.useMemo(() => {
    if (typeof logText !== "string" || !String(logText).trim()) return [];
    return String(logText)
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }, [logText]);
  const sum = summary != null && String(summary).trim() ? String(summary).trim() : "";
  if (!lines.length && !sum) {
    return <span className="text-muted">—</span>;
  }
  return (
    <div className="admin-chunk-log-subsection">
      {sum ? <div className="text-muted small mb-1">{sum}</div> : null}
      {lines.length > 0 ? (
        <details className="admin-chunk-details small">
          <summary className="admin-chunk-details-summary">
            {title}{" "}
            <span className="text-secondary fw-normal">({lines.length})</span>
          </summary>
          <ol className="admin-chunk-line-list mb-0 mt-2 ps-3">
            {lines.map((ln, idx) => (
              <li key={idx} className="text-break small">
                {ln}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

/** Build rows for admin: gate passcode + email + activity (API returns gatePasscode per row when available). */
function studentSessionRowsFromActivity(activity) {
  const ip = Array.isArray(activity?.inProgress) ? activity.inProgress : [];
  const to = Array.isArray(activity?.timedOut) ? activity.timedOut : [];
  const sub = Array.isArray(activity?.submissions) ? activity.submissions : [];
  const rows = [];
  ip.forEach((s, i) => {
    const vLogIp = typeof s.videoChunkLog === "string" ? s.videoChunkLog : typeof s.chunkUploadLog === "string" ? s.chunkUploadLog : "";
    const mLogIp = typeof s.metadataChunkLog === "string" ? s.metadataChunkLog : "";
    const chSumIp = s.chunkSummary ? String(s.chunkSummary) : "";
    const metaSumIp = s.metadataChunkSummary ? String(s.metadataChunkSummary) : "";
    const detailIp = [s.startedAt ? `Started ${s.startedAt}` : "", chSumIp, metaSumIp].filter(Boolean).join(" · ") || "—";
    rows.push({
      key: `p-${i}-${s.email}`,
      gatePasscode: s.gatePasscode || "—",
      sessionCode: s.secondaryCode || s.email || "—",
      resumePassword: s.resumePassword || "—",
      name: s.name || "—",
      email: s.email || "—",
      studentClass: s.studentClass || "—",
      status: "In progress",
      detail: detailIp,
      metadataChunkLog: mLogIp,
      videoChunkLog: vLogIp,
      metadataChunkSummary: metaSumIp || undefined,
      chunkSummary: chSumIp || undefined,
    });
  });
  to.forEach((s, i) => {
    const vLogTo = typeof s.videoChunkLog === "string" ? s.videoChunkLog : typeof s.chunkUploadLog === "string" ? s.chunkUploadLog : "";
    const mLogTo = typeof s.metadataChunkLog === "string" ? s.metadataChunkLog : "";
    const chSumTo = s.chunkSummary ? String(s.chunkSummary) : "";
    const metaSumTo = s.metadataChunkSummary ? String(s.metadataChunkSummary) : "";
    const detailPartsTo = [];
    if (s.startedAt) {
      detailPartsTo.push(
        `Started ${s.startedAt} — session exceeded allowed time without a server submit (often browser closed); video/metadata may be missing.`
      );
    }
    if (chSumTo) detailPartsTo.push(chSumTo);
    if (metaSumTo) detailPartsTo.push(metaSumTo);
    const detailTo = detailPartsTo.length ? detailPartsTo.join(" · ") : "—";
    rows.push({
      key: `t-${i}-${s.email}`,
      gatePasscode: s.gatePasscode || "—",
      sessionCode: s.secondaryCode || s.email || "—",
      resumePassword: s.resumePassword || "—",
      name: s.name || "—",
      email: s.email || "—",
      studentClass: s.studentClass || "—",
      status: "Timed out",
      detail: detailTo,
      metadataChunkLog: mLogTo,
      videoChunkLog: vLogTo,
      metadataChunkSummary: metaSumTo || undefined,
      chunkSummary: chSumTo || undefined,
    });
  });
  sub.forEach((s, i) => {
    const ts = s.timestamp != null ? String(s.timestamp) : "";
    const vs = (s.videoStatus || "").toString().toLowerCase();
    const examStillUploading =
      vs === "chunked_partial" || vs === "chunked_open" || vs === "metadata_uploaded";
    const statusLabel = examStillUploading ? "Recording (uploads ongoing)" : "Submitted";
    const scorePart = s.score != null && s.total != null ? `Score ${s.score}/${s.total}` : "";
    const videoSummary = s.chunkSummary ? String(s.chunkSummary) : "";
    const metaSummary = s.metadataChunkSummary ? String(s.metadataChunkSummary) : "";
    const detailParts = [
      scorePart,
      videoSummary,
      metaSummary,
      examStillUploading && s.videoStatus ? `Sheet status: ${s.videoStatus}` : "",
    ].filter(Boolean);
    const vLog = typeof s.videoChunkLog === "string" ? s.videoChunkLog : typeof s.chunkUploadLog === "string" ? s.chunkUploadLog : "";
    const mLog = typeof s.metadataChunkLog === "string" ? s.metadataChunkLog : "";
    rows.push({
      key: `s-${i}-${s.email}-${ts}`,
      gatePasscode: s.gatePasscode || "—",
      sessionCode: s.secondaryCode || s.email || "—",
      resumePassword: "—",
      name: s.studentName || "—",
      email: s.email || "—",
      studentClass: s.studentClass || "—",
      status: statusLabel,
      detail: detailParts.length ? detailParts.join(" · ") : "—",
      submissionTimestamp: ts,
      metadataChunkLog: mLog,
      videoChunkLog: vLog,
    });
  });
  return rows;
}

function isGasProxyHtmlError(message) {
  return typeof message === "string" && message.toLowerCase().includes("html instead of json");
}

/** Normalize detail for admin feedback modal (string with newlines or string array). */
function splitAdminMessageLines(detail) {
  if (detail == null) return [];
  if (Array.isArray(detail)) return detail.map((s) => String(s).trim()).filter(Boolean);
  return String(detail)
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Shown in dev when Apps Script returns HTML to the Vite proxy (restricted web app access). */
function GasProxyDevHelpCallout() {
  if (!import.meta.env.DEV) return null;
  return (
    <div className="mt-2 pt-2 border-top small">
      <strong className="d-block mb-1">Fix for local dev</strong>
      <ul className="mb-0 ps-3">
        <li>
          <strong>Fastest:</strong> Apps Script → <strong>Deploy → Manage deployments</strong> → edit this deployment → <strong>Who has access: Anyone</strong> → Deploy.
        </li>
        <li>
          <strong>Or keep production restricted:</strong> create a <strong>second</strong> deployment (same project) with <strong>Anyone</strong>, copy its <code>/exec</code> URL into <code>.env.development.local</code> as <code>VITE_RECORDING_UPLOAD_URL</code> (template: <code>.env.development.example</code>), restart <code>npm run dev</code>.
        </li>
      </ul>
    </div>
  );
}

/** Test codes store bundled `questionPaperId` (slug); resolve display name from papers-index. */
function formatBundledPaperColumn(questionPaperId, bundledPapers) {
  const id = (questionPaperId || "").toString().trim();
  if (!id) return "—";
  const brand = getBundledPaperBrandTitle(id);
  if (brand) return brand;
  const list = Array.isArray(bundledPapers) ? bundledPapers : [];
  const p = list.find((x) => String(x.id ?? "").trim() === id);
  const name = p && String(p.displayName || "").trim();
  if (name) return name;
  return id;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isAdmin, loginAdmin, logoutAdmin } = useAdmin();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [generatedCode, setGeneratedCode] = useState(null);
  const [studentPasscodeSlots, setStudentPasscodeSlots] = useState(50);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [selectedPaperId, setSelectedPaperId] = useState("");
  const [bundledPapers, setBundledPapers] = useState([]);
  const [bundledPapersLoading, setBundledPapersLoading] = useState(false);
  const [bundledPapersError, setBundledPapersError] = useState("");
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
  const [bulkClearPhrase, setBulkClearPhrase] = useState("");
  const [bulkClearing, setBulkClearing] = useState(false);
  /** In-app toast-style modal (avoids browser “localhost says” alerts). */
  const [adminFeedback, setAdminFeedback] = useState({
    open: false,
    variant: "success",
    title: "",
    lines: [],
  });

  const showAdminFeedback = React.useCallback((variant, title, detail) => {
    const lines = splitAdminMessageLines(detail);
    setAdminFeedback({
      open: true,
      variant: variant === "error" ? "error" : "success",
      title: title || (variant === "error" ? "Something went wrong" : "All set"),
      lines: lines.length ? lines : [variant === "error" ? "Please try again." : "Done."],
    });
  }, []);

  const closeAdminFeedback = React.useCallback(() => {
    setAdminFeedback((prev) => ({ ...prev, open: false }));
  }, []);

  useEffect(() => {
    if (!adminFeedback.open) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeAdminFeedback();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [adminFeedback.open, closeAdminFeedback]);

  const reloadSubmissions = React.useCallback(() => {
    const url = SCRIPT_URL ? getListSubmissionsUrl() : null;
    if (!url) return;
    fetch(url)
      .then((r) => parseAppsScriptFetchResponse(r))
      .then((data) => {
        if (data.status === "success" && Array.isArray(data.submissions)) {
          setSubmissions(data.submissions);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const url = SCRIPT_URL ? getListSubmissionsUrl() : null;
    if (!url) {
      setError("Set NEXT_PUBLIC_RECORDING_UPLOAD_URL (Apps Script Web App URL) to load submissions.");
      setLoading(false);
      return;
    }
    fetch(url)
      .then((r) => parseAppsScriptFetchResponse(r))
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
    setBundledPapersError("");
    setBundledPapersLoading(true);
    fetch(getPapersIndexUrl())
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((data) => {
        const list = Array.isArray(data.papers) ? data.papers : [];
        setBundledPapers(list);
        setSelectedPaperId((cur) => {
          const c = String(cur || "").trim();
          if (c && list.some((p) => String(p.id) === c)) return c;
          return list[0]?.id ? String(list[0].id) : "";
        });
      })
      .catch(() => {
        setBundledPapers([]);
        setBundledPapersError("Could not load question papers list.");
      })
      .finally(() => setBundledPapersLoading(false));
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
      .then((r) => parseAppsScriptFetchResponse(r))
      .then((d) => {
        if (d.status === "success" && Array.isArray(d.codes)) {
          setTestCodes(d.codes);
          setCodesError(null);
        } else {
          const msg = d.message || "Could not load test codes.";
          const authHint =
            /unauthorized/i.test(msg)
              ? " Match VITE_ADMIN_SECRET in .env to Script properties → ADMIN_SECRET in the same Apps Script project."
              : "";
          const hint = msg.indexOf("Use ?action=") !== -1
            ? " Redeploy your Apps Script (Deploy → Manage deployments → New version → Deploy) so listTestCodes is available."
            : "";
          setCodesError(msg + authHint + hint);
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
      .then((r) => parseAppsScriptFetchResponse(r))
      .then((d) => {
        if (d.status === "success")
          setCodeActivity((prev) => ({
            ...prev,
            [code]: {
              inProgress: d.inProgress || [],
              timedOut: d.timedOut || [],
              submissions: d.submissions || [],
              staleSessionsClosedOnRefresh: typeof d.staleSessionsClosedOnRefresh === "number" ? d.staleSessionsClosedOnRefresh : 0,
            },
          }));
      })
      .catch(() => {})
      .finally(() => setLoadingActivityCode((prev) => (prev === code ? null : prev)));
  }, []);

  useEffect(() => {
    if (!ADMIN_SECRET || !testCodes.length) return;
    testCodes.forEach((c) => {
      if (c.started && !codeActivity[c.code]) fetchCodeActivity(c.code);
    });
  }, [testCodes, ADMIN_SECRET, fetchCodeActivity]);

  useEffect(() => {
    if (!isAdmin) return;
    const url = getListFeedbackUrl();
    if (!url) return;
    setFeedbackLoading(true);
    fetch(url)
      .then((r) => parseAppsScriptFetchResponse(r))
      .then((data) => {
        if (data.status === "success" && Array.isArray(data.feedback)) {
          setFeedbackList(data.feedback);
        }
      })
      .catch(() => {})
      .finally(() => setFeedbackLoading(false));
  }, [isAdmin]);

  const handleDownload = (fileId, fileName) => {
    if (!SCRIPT_URL) return;
    const url = getAppsScriptDownloadUrl(fileId);
    if (!url) return;
    setDownloadingId(fileId);
    fetch(url)
      .then((r) => parseAppsScriptFetchResponse(r))
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
          showAdminFeedback("error", "Download didn’t work", data.message || "Download failed.");
        }
      })
      .catch(() => showAdminFeedback("error", "Download didn’t work", "Network error or script unavailable."))
      .finally(() => setDownloadingId(null));
  };

  const handleGenerateCode = () => {
    if (!ADMIN_SECRET) {
      setGenerateError("Set VITE_ADMIN_SECRET in .env and ADMIN_SECRET in Apps Script (Script Properties) to generate codes.");
      return;
    }
    if (!selectedPaperId || !String(selectedPaperId).trim()) {
      setGenerateError("Select a question paper first.");
      return;
    }
    const slotN = parseInt(String(studentPasscodeSlots), 10);
    if (!slotN || slotN < 1 || slotN > 500) {
      setGenerateError("Enter max students between 1 and 500 (capacity for this test code).");
      return;
    }
    setGenerateError(null);
    setGenerating(true);
    const url = getGenerateCodeUrl(ADMIN_SECRET, "", selectedPaperId || "", slotN);
    if (!url) {
      setGenerateError("Script URL not configured.");
      setGenerating(false);
      return;
    }
    fetch(url)
      .then((r) => parseAppsScriptFetchResponse(r))
      .then((data) => {
        if (data.status === "success" && data.code) {
          setGeneratedCode(data.code);
          const quota = data.studentPasscodeQuota ?? slotN;
          const newRow = {
            code: data.code,
            createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
            questionPaperId: selectedPaperId || "",
            started: false,
            active: true,
            accessPassword: data.accessPassword ?? null,
            studentGatePassword: Boolean(data.studentGatePassword),
            studentPasscodeQuota: quota,
            studentPasscodesClaimed: 0,
            studentPasscodesDetail: [],
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
      .then((r) => parseAppsScriptFetchResponse(r))
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
    const postUrl = getScriptPostUrl();
    if (!isScriptPostUrlReady(postUrl)) {
      setTogglingActiveCode(null);
      showAdminFeedback("error", "Script URL not configured", "Set VITE_TEST_SUBMISSION_URL (or recording URL) in .env.");
      return;
    }
    postSetTestCodeActive(ADMIN_SECRET, code, makeActive)
      .then((r) => parseAppsScriptFetchResponse(r))
      .then((data) => {
        if (data.status === "success") {
          setTestCodes((prev) => prev.map((c) => (c.code === code ? { ...c, active: makeActive } : c)));
        } else {
          showAdminFeedback("error", "Code status unchanged", data.message || "Could not update code.");
        }
      })
      .catch(() => showAdminFeedback("error", "Code status unchanged", "Network error."))
      .finally(() => setTogglingActiveCode(null));
  };

  const handleBulkClearEverything = () => {
    if (!ADMIN_SECRET) {
      showAdminFeedback("error", "Admin secret needed", "Set VITE_ADMIN_SECRET in .env.");
      return;
    }
    const phrase = bulkClearPhrase.trim();
    if (!isAdminBulkResetPhraseValid(phrase)) {
      showAdminFeedback("error", "Wrong confirmation", [
        "Type one of these (letters only, case doesn’t matter):",
        "everything",
        "delete everything",
        "delete all test data",
        "delete all",
      ]);
      return;
    }
    if (
      !window.confirm(
        "Clear ALL test codes, ALL sessions, ALL submissions, ALL feedback rows, ALL legacy resume-code rows, ALL legacy pooled-passcode sheet rows, and trash everything under Adhyant online-upload, legacy zip, and feedback Drive folders (restore from Drive trash if needed). Bundled papers in the app are not deleted. Continue?"
      )
    ) {
      return;
    }
    const url = getClearAllTestDataUrl(ADMIN_SECRET, phrase);
    if (!url) {
      showAdminFeedback("error", "Not connected", "Script URL not configured.");
      return;
    }
    setBulkClearing(true);
    fetch(url)
      .then((r) => parseAppsScriptFetchResponse(r))
      .then((data) => {
        if (data.status === "success") {
          const rm = data.removed || {};
          setBulkClearPhrase("");
          setCodeActivity({});
          showAdminFeedback("success", "Fresh start unlocked", [
            data.message || "Bulk reset complete.",
            `Submissions cleared: ${rm.submissions ?? 0}`,
            `Test sessions cleared: ${rm.testSessions ?? 0}`,
            `Test codes removed: ${rm.testCodes ?? 0}`,
            `Feedback rows cleared: ${rm.feedbackRows ?? 0}`,
            `Resume-code rows cleared: ${rm.resumeCodes ?? 0}`,
            `Student passcode rows cleared: ${rm.studentPasscodeRows ?? 0}`,
            ...(Array.isArray(rm.errors) && rm.errors.length
              ? ["Warnings: " + rm.errors.join(" · ")]
              : []),
          ]);
          fetchTestCodes();
          reloadSubmissions();
          const fu = getListFeedbackUrl();
          if (fu) {
            setFeedbackLoading(true);
            fetch(fu)
              .then((res) => parseAppsScriptFetchResponse(res))
              .then((d) => {
                if (d.status === "success" && Array.isArray(d.feedback)) setFeedbackList(d.feedback);
              })
              .catch(() => {})
              .finally(() => setFeedbackLoading(false));
          }
        } else {
          showAdminFeedback("error", "Reset blocked", data.message || "Bulk clear failed.");
        }
      })
      .catch((err) => showAdminFeedback("error", "Reset blocked", err.message || "Network error."))
      .finally(() => setBulkClearing(false));
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
                Test codes, submissions, and feedback — all in one place.
              </p>
            </div>
            <button type="button" className="btn admin-dash-logout" onClick={() => { logoutAdmin(); navigate("/"); }}>
              Log out
            </button>
          </div>
        </header>

        <div className="container admin-dash-body">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-4">
          <span className="admin-dash-stat-pill">Submissions & monitoring</span>
        </div>

        <div className="card admin-dash-card mb-4">
          <div className="card-body">
            <h5 className="card-title">Question paper & test code</h5>
            <p className="text-muted small mb-2">
              Choose the <strong>question paper</strong>, set the <strong>maximum number of students</strong> (1–500), then generate. You get one shared <strong>test code</strong>. Students each <strong>create their own passcode</strong> at the gate (and reuse it to resume); you do not hand out passcodes. They are asked to <strong>save that passcode</strong> when entering the test code. You can see each student’s passcode in <strong>student activity</strong> after they start. Abandoned / “start over” sessions free a slot for another student. <strong>Legacy</strong> sheet rows with no student cap still use a free-form gate password or a fixed organiser password.
            </p>
            {bundledPapersError && <div className="alert alert-warning py-2 small mb-2">{bundledPapersError}</div>}
            {generateError && <div className="alert alert-danger py-2 small">{generateError}</div>}
            {generatedCode && (
              <div className="alert alert-success py-2 mb-2">
                <div>
                  <strong>Test code (share with everyone):</strong> <code className="user-select-all">{generatedCode}</code>
                </div>
                <p className="small mb-0 mt-2">
                  Students choose their own passcode at the gate. Watch <strong>slots used</strong> and each student’s passcode under <strong>Refresh student activity</strong> in the table below.
                </p>
              </div>
            )}
            <div className="mb-3">
              <label className="form-label">Question paper</label>
              <select
                className="form-select"
                value={selectedPaperId}
                onChange={(e) => setSelectedPaperId(e.target.value)}
                disabled={bundledPapersLoading}
              >
                {bundledPapers.length === 0 ? (
                  <option value="">{bundledPapersLoading ? "Loading…" : "No papers available"}</option>
                ) : (
                  <>
                    <option value="">Select a question paper</option>
                    {bundledPapers.map((p) => {
                      const label = getBundledPaperBrandTitle(p.id) || (p.displayName || p.id).slice(0, 72);
                      return (
                        <option key={p.id} value={p.id}>
                          {label}
                          {p.questionCount != null ? ` · ${p.questionCount} Q` : ""}
                        </option>
                      );
                    })}
                  </>
                )}
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="admin-student-passcode-slots">
                Max students (capacity for this test code)
              </label>
              <input
                id="admin-student-passcode-slots"
                type="number"
                min={1}
                max={500}
                className="form-control"
                value={studentPasscodeSlots}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setStudentPasscodeSlots(Number.isFinite(n) ? Math.min(500, Math.max(1, n)) : 50);
                }}
                disabled={generating || bundledPapersLoading}
              />
              <div className="form-text">At most this many different students can start the test on this code. Each creates their own passcode at the gate; you only share the test code.</div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleGenerateCode}
              disabled={
                generating ||
                bundledPapersLoading ||
                bundledPapers.length === 0 ||
                !String(selectedPaperId || "").trim() ||
                !parseInt(String(studentPasscodeSlots), 10) ||
                parseInt(String(studentPasscodeSlots), 10) < 1 ||
                parseInt(String(studentPasscodeSlots), 10) > 500
              }
            >
              {generating ? "Generating…" : "Generate new test code"}
            </button>
          </div>
        </div>

        <div className="card admin-dash-card mb-4 border-danger border-2">
          <div className="card-body">
            <h5 className="card-title text-danger">Clear all test data — only reset option</h5>
            <p className="text-muted small mb-2">
              This is the <strong>only</strong> dashboard action that removes sessions, submissions, or feedback (there are no per–test-code or per-row deletes). It removes <strong>every</strong> test code, session, submission, and feedback row from the spreadsheet, deletes all legacy resume-code rows and any <strong>legacy pooled passcode</strong> sheet rows, trashes linked submission files from sheet IDs, and empties the{" "}
              <strong>Adhyant_Storage_OnlineTest_Uploads</strong>, legacy zip, and test-feedback Drive roots (orphans included).{" "}
              Bundled question assets in the app repo are <em>not</em> removed. Items go to Drive trash (recoverable for a limited time). Runs every step even if one part fails (see success message for warnings).
            </p>
            <div className="row g-2 align-items-end flex-wrap">
              <div className="col-12 col-md-8 col-lg-6">
                <label className="form-label small mb-1" htmlFor="bulk-clear-phrase">
                  Type <strong>{ADMIN_BULK_RESET_PHRASE_HINT}</strong> to confirm (case-insensitive; or &quot;delete everything&quot; / &quot;delete all&quot;)
                </label>
                <input
                  id="bulk-clear-phrase"
                  type="text"
                  className="form-control form-control-sm font-monospace"
                  autoComplete="off"
                  placeholder={ADMIN_BULK_RESET_PHRASE_HINT}
                  value={bulkClearPhrase}
                  onChange={(e) => setBulkClearPhrase(e.target.value)}
                  disabled={bulkClearing || !ADMIN_SECRET}
                />
              </div>
              <div className="col-12 col-md-auto">
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  disabled={!ADMIN_SECRET || bulkClearing}
                  onClick={handleBulkClearEverything}
                >
                  {bulkClearing ? "Clearing…" : "Clear everything + Drive"}
                </button>
              </div>
            </div>
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
                <div className="mb-0">{codesError}</div>
                {isGasProxyHtmlError(codesError) && <GasProxyDevHelpCallout />}
                <button type="button" className="btn btn-sm btn-outline-dark mt-2" onClick={fetchTestCodes}>Retry</button>
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
                      <th>Capacity / gate</th>
                      <th>Created</th>
                      <th>Question paper</th>
                      <th>Test started</th>
                      <th>Code open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testCodes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted">No test codes yet. Generate one above.</td>
                      </tr>
                    ) : (
                      testCodes.map((c) => {
                        const act = codeActivity[c.code];
                        const studentRows = act ? studentSessionRowsFromActivity(act) : [];
                        return (
                          <React.Fragment key={c.code}>
                            <tr>
                              <td><code className="fw-semibold">{c.code}</code></td>
                              <td>
                                {c.studentPasscodeQuota > 0 ? (
                                  <span className="small">
                                    <strong>{c.studentPasscodesClaimed ?? 0}</strong>
                                    <span className="text-muted"> / {c.studentPasscodeQuota} students</span>
                                  </span>
                                ) : c.studentGatePassword ? (
                                  <span className="text-muted small">Student-chosen at gate</span>
                                ) : (
                                  <code className="small user-select-all">{c.accessPassword}</code>
                                )}
                              </td>
                              <td>{c.createdAt || "—"}</td>
                              <td>{formatBundledPaperColumn(c.questionPaperId, bundledPapers)}</td>
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
                              <td colSpan={6} className="p-0">
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
                                      <h6 className="small fw-bold mb-2">Student access</h6>
                                      <p className="text-muted small mb-0">
                                        Students use the shared <strong>test code</strong> and each creates a <strong>personal passcode</strong> at the gate (you do not distribute passcodes). They should save that passcode when entering — the same passcode resumes on another device. Their passcode appears in the activity table after they start.{" "}
                                        <span className="d-block mt-2">
                                          <strong>Refresh student activity</strong> updates the sheet: if someone stayed &quot;In progress&quot; after exam time + grace but never finished submit on the server (closed tab, crash, offline), they move to <strong>Timed out</strong> — video may be missing. <strong>Metadata snapshots</strong> and <strong>Video chunks</strong> list each JSON snapshot and .webm segment (10‑min + final); Drive filenames are prefixed with student name and passcode.
                                        </span>{" "}
                                        {Array.isArray(c.secondaryCodes) && c.secondaryCodes.length > 0 ? (
                                          <span className="d-block mt-2">
                                            <strong>Legacy:</strong> {c.secondaryCodes.length} old session-code row(s) may still exist in the sheet for this code (cleared when you use <strong>Clear all test data</strong> above).
                                          </span>
                                        ) : null}
                                      </p>
                                    </div>
                                    <div className="col-lg-7">
                                      <h6 className="small fw-bold mb-2">Students (passcode & activity)</h6>
                                      {loadingActivityCode === c.code ? (
                                        <p className="text-muted small mb-0">Loading…</p>
                                      ) : !act ? (
                                        <p className="text-muted small mb-0">
                                          Click <strong>Refresh student activity</strong> to load emails and progress for this test code.
                                        </p>
                                      ) : studentRows.length === 0 ? (
                                        <p className="text-muted small mb-0">
                                          No students yet. After they pass the gate and start the timer, they appear here with <strong>student passcode</strong> (in progress only).
                                        </p>
                                      ) : (
                                        <div className="table-responsive">
                                          <table className="table table-sm table-bordered mb-0 bg-white small">
                                            <thead className="table-light">
                                              <tr>
                                                <th>Student passcode</th>
                                                <th>Secondary (email)</th>
                                                <th>Student</th>
                                                <th>Class</th>
                                                <th>Email</th>
                                                <th>Status</th>
                                                <th>Detail</th>
                                                <th>Metadata snapshots</th>
                                                <th>Video chunks</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {studentRows.map((r) => (
                                                <tr key={r.key}>
                                                  <td>
                                                    <code className="user-select-all small">
                                                      {r.gatePasscode !== "—" ? r.gatePasscode : r.resumePassword}
                                                    </code>
                                                  </td>
                                                  <td><code>{r.sessionCode}</code></td>
                                                  <td>{r.name}</td>
                                                  <td>{r.studentClass}</td>
                                                  <td className="text-break">{r.email}</td>
                                                  <td>
                                                    <span
                                                      className={
                                                        r.status === "Submitted"
                                                          ? "text-success"
                                                          : r.status === "Timed out"
                                                            ? "text-danger"
                                                            : r.status === "Recording (uploads ongoing)"
                                                              ? "text-info"
                                                              : "text-warning"
                                                      }
                                                    >
                                                      {r.status}
                                                    </span>
                                                  </td>
                                                  <td>{r.detail}</td>
                                                  <td className="small text-break" style={{ maxWidth: 300, verticalAlign: "top" }}>
                                                    <AdminChunkLogSubsection
                                                      title="Snapshots"
                                                      summary={r.metadataChunkSummary}
                                                      logText={r.metadataChunkLog}
                                                    />
                                                  </td>
                                                  <td className="small text-break" style={{ maxWidth: 300, verticalAlign: "top" }}>
                                                    <AdminChunkLogSubsection
                                                      title="Video segments"
                                                      summary={r.chunkSummary}
                                                      logText={r.videoChunkLog}
                                                    />
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                          {act.staleSessionsClosedOnRefresh > 0 ? (
                                            <p className="small text-secondary mt-2 mb-0">
                                              This refresh moved <strong>{act.staleSessionsClosedOnRefresh}</strong> row(s) from{" "}
                                              <strong>In progress</strong> to <strong>Timed out</strong> (exam duration + 45 min upload
                                              grace elapsed without the server receiving submit/metadata — e.g. browser closed at the end).
                                            </p>
                                          ) : null}
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
                      s.videoStatus === "chunked_partial" ||
                      s.videoStatus === "chunked_open" ||
                      (s.videoStatus && s.videoStatus.startsWith("retry"))
                  ) && (
                    <span className="text-warning ms-1">
                      (
                      {submissions.filter(
                        (s) =>
                          s.videoStatus === "pending" ||
                          s.videoStatus === "metadata_uploaded" ||
                          s.videoStatus === "chunked_partial" ||
                          s.videoStatus === "chunked_open" ||
                          (s.videoStatus && s.videoStatus.startsWith("retry"))
                      ).length}{" "}
                      pending/metadata/retry/chunks)
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
          Status <strong>metadata_uploaded</strong> means answers/metadata are saved even if video is still pending or failed. Legacy zip uploads also land under that root. Download uses the video/zip file ID when present. To clear stored attempts and Drive uploads, use <strong>Clear all test data</strong> above.
        </p>
        {error && (
          <div className="alert alert-danger">
            <div className="mb-0">{error}</div>
            {isGasProxyHtmlError(error) && <GasProxyDevHelpCallout />}
          </div>
        )}
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
                    <th>Metadata snapshots</th>
                    <th>Video chunks</th>
                    <th>Download</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="text-center text-muted">No submissions yet.</td>
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
                          : videoStatus === "chunked_partial"
                            ? `Partial recording (${row.chunkSegmentCount != null ? row.chunkSegmentCount : "?"} segment(s) on Drive)`
                            : videoStatus === "chunked_open"
                              ? "Chunk session started (video in progress)"
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
                          : videoStatus === "pending" ||
                              videoStatus === "metadata_uploaded" ||
                              videoStatus === "chunked_partial" ||
                              videoStatus === "chunked_open" ||
                              videoStatus.startsWith("retry")
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
                          <td className="small" style={{ maxWidth: 300, verticalAlign: "top" }}>
                            <AdminChunkLogSubsection
                              title="Snapshots"
                              summary={row.metadataChunkSummary}
                              logText={row.metadataChunkLog}
                            />
                          </td>
                          <td className="small" style={{ maxWidth: 300, verticalAlign: "top" }}>
                            <AdminChunkLogSubsection
                              title="Video segments"
                              summary={row.chunkSummary}
                              logText={row.videoChunkLog || row.chunkUploadLog}
                            />
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

      {adminFeedback.open && (
        <div className="admin-dash-feedback-backdrop" onClick={closeAdminFeedback} role="presentation">
          <div
            className={`admin-dash-feedback-modal admin-dash-feedback-modal--${adminFeedback.variant}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-feedback-title"
          >
            <div className="admin-dash-feedback-modal__glow" aria-hidden />
            <div className="admin-dash-feedback-modal__icon" aria-hidden>
              {adminFeedback.variant === "success" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              )}
            </div>
            <h2 id="admin-feedback-title" className="admin-dash-feedback-modal__title">
              {adminFeedback.title}
            </h2>
            {adminFeedback.lines.length <= 1 ? (
              <p className="admin-dash-feedback-modal__body">{adminFeedback.lines[0]}</p>
            ) : (
              <ul className="admin-dash-feedback-modal__lines">
                {adminFeedback.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
            <div className="admin-dash-feedback-modal__actions">
              <button
                type="button"
                className={adminFeedback.variant === "success" ? "btn btn-primary" : "btn btn-danger"}
                onClick={closeAdminFeedback}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
