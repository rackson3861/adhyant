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
  getSetTestCodeActiveUrl,
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

/** Build merged rows for admin: one card per student (keyed by email), with all activity entries combined. */
function studentSessionRowsFromActivity(activity) {
  const ip = Array.isArray(activity?.inProgress) ? activity.inProgress : [];
  const to = Array.isArray(activity?.timedOut) ? activity.timedOut : [];
  const sub = Array.isArray(activity?.submissions) ? activity.submissions : [];
  const byEmail = {};

  function getOrCreate(email, name, studentClass, gatePasscode, resumePassword) {
    const key = (email || "").trim().toLowerCase() || name || "unknown";
    if (!byEmail[key]) {
      byEmail[key] = {
        key: `stu-${key}`,
        name: name || "—",
        email: email || "—",
        studentClass: studentClass || "—",
        gatePasscode: gatePasscode || "—",
        resumePassword: resumePassword || "—",
        statuses: [],
        entries: [],
      };
    }
    const r = byEmail[key];
    if (r.name === "—" && name) r.name = name;
    if (r.studentClass === "—" && studentClass) r.studentClass = studentClass;
    if (r.gatePasscode === "—" && gatePasscode) r.gatePasscode = gatePasscode;
    if (r.resumePassword === "—" && resumePassword) r.resumePassword = resumePassword;
    return r;
  }

  ip.forEach((s) => {
    const r = getOrCreate(s.email, s.name, s.studentClass, s.gatePasscode || s.resumePassword, s.resumePassword);
    r.statuses.push("In progress");
    const vLog = typeof s.videoChunkLog === "string" ? s.videoChunkLog : typeof s.chunkUploadLog === "string" ? s.chunkUploadLog : "";
    const mLog = typeof s.metadataChunkLog === "string" ? s.metadataChunkLog : "";
    const chSum = s.chunkSummary ? String(s.chunkSummary) : "";
    const metaSum = s.metadataChunkSummary ? String(s.metadataChunkSummary) : "";
    const detail = [s.startedAt ? `Started ${s.startedAt}` : "", chSum, metaSum].filter(Boolean).join(" · ") || "";
    r.entries.push({ label: "Session", status: "In progress", detail, metadataChunkLog: mLog, videoChunkLog: vLog, metadataChunkSummary: metaSum, chunkSummary: chSum });
  });

  to.forEach((s) => {
    const r = getOrCreate(s.email, s.name, s.studentClass, s.gatePasscode || s.resumePassword, s.resumePassword);
    r.statuses.push("Timed out");
    const vLog = typeof s.videoChunkLog === "string" ? s.videoChunkLog : typeof s.chunkUploadLog === "string" ? s.chunkUploadLog : "";
    const mLog = typeof s.metadataChunkLog === "string" ? s.metadataChunkLog : "";
    const chSum = s.chunkSummary ? String(s.chunkSummary) : "";
    const metaSum = s.metadataChunkSummary ? String(s.metadataChunkSummary) : "";
    const detailParts = [];
    if (s.startedAt) detailParts.push(`Started ${s.startedAt} — timed out`);
    if (chSum) detailParts.push(chSum);
    if (metaSum) detailParts.push(metaSum);
    r.entries.push({ label: "Session", status: "Timed out", detail: detailParts.join(" · ") || "", metadataChunkLog: mLog, videoChunkLog: vLog, metadataChunkSummary: metaSum, chunkSummary: chSum });
  });

  sub.forEach((s) => {
    const r = getOrCreate(s.email, s.studentName, s.studentClass, s.gatePasscode || s.resumePassword, "");
    const vs = (s.videoStatus || "").toString().toLowerCase();
    const uploading = vs === "chunked_partial" || vs === "chunked_open" || vs === "metadata_uploaded";
    const statusLabel = uploading ? "Uploads ongoing" : "Submitted";
    r.statuses.push(statusLabel);
    const scorePart = s.score != null && s.total != null ? `Score ${s.score}/${s.total}` : "";
    const videoSummary = s.chunkSummary ? String(s.chunkSummary) : "";
    const metaSummary = s.metadataChunkSummary ? String(s.metadataChunkSummary) : "";
    const detailParts = [scorePart, videoSummary, metaSummary, uploading && s.videoStatus ? `Sheet status: ${s.videoStatus}` : ""].filter(Boolean);
    const vLog = typeof s.videoChunkLog === "string" ? s.videoChunkLog : typeof s.chunkUploadLog === "string" ? s.chunkUploadLog : "";
    const mLog = typeof s.metadataChunkLog === "string" ? s.metadataChunkLog : "";
    r.entries.push({ label: "Submission", status: statusLabel, detail: detailParts.join(" · ") || "", metadataChunkLog: mLog, videoChunkLog: vLog, metadataChunkSummary: metaSummary || "", chunkSummary: videoSummary || "", submissionTimestamp: s.timestamp != null ? String(s.timestamp) : "" });
  });

  return Object.values(byEmail).map((r) => {
    // Pick best status for the badge: Submitted > Uploads ongoing > In progress > Timed out
    const statusPriority = ["Submitted", "Uploads ongoing", "In progress", "Timed out"];
    const bestStatus = statusPriority.find((s) => r.statuses.includes(s)) || r.statuses[0] || "Unknown";
    return { ...r, status: bestStatus };
  });
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
  /** In-app toast-style modal (avoids browser "localhost says" alerts). */
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
    const url = getSetTestCodeActiveUrl(ADMIN_SECRET, code, makeActive);
    if (!url) {
      setTogglingActiveCode(null);
      showAdminFeedback("error", "Script URL not configured", "Set VITE_TEST_SUBMISSION_URL (or recording URL) in .env.");
      return;
    }
    fetch(url)
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

        {/* ── Section 1: Generate test code ── */}
        <details className="admin-dash-section" open>
          <summary className="admin-dash-section__header">
            <span className="admin-dash-section__icon">+</span>
            <span className="admin-dash-section__title">Generate test code</span>
            <span className="admin-dash-section__hint">Pick paper, set capacity, generate</span>
          </summary>
          <div className="admin-dash-section__body">
            <p className="text-muted small mb-2">
              Choose a <strong>question paper</strong>, set <strong>max students</strong> (1–500), then generate. Students create their own passcode at the gate.
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
        </details>

        {/* ── Section 2: Test codes & students ── */}
        <details className="admin-dash-section" open>
          <summary className="admin-dash-section__header">
            <span className="admin-dash-section__icon">&#9654;</span>
            <span className="admin-dash-section__title">Test codes & students</span>
            <span className="admin-dash-section__hint">{testCodes.length} code{testCodes.length !== 1 ? "s" : ""}</span>
          </summary>
          <div className="admin-dash-section__body">
            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={fetchTestCodes} disabled={codesLoading || !ADMIN_SECRET}>
                {codesLoading ? "Loading…" : "Refresh list"}
              </button>
            </div>
            {codesError && (
              <div className="alert alert-warning py-2 small mb-3">
                <div className="mb-0">{codesError}</div>
                {isGasProxyHtmlError(codesError) && <GasProxyDevHelpCallout />}
                <button type="button" className="btn btn-sm btn-outline-dark mt-2" onClick={fetchTestCodes}>Retry</button>
              </div>
            )}
            {codesLoading && testCodes.length === 0 ? (
              <p className="text-muted">Loading…</p>
            ) : testCodes.length === 0 ? (
              <p className="text-muted small">No test codes yet. Generate one above.</p>
            ) : (
              <div className="admin-student-cards">
                {testCodes.map((c) => {
                  const act = codeActivity[c.code];
                  const studentRows = act ? studentSessionRowsFromActivity(act) : [];
                  return (
                    <details key={c.code} className="admin-code-card">
                      <summary className="admin-code-card__header">
                        <div className="admin-code-card__top">
                          <code className="admin-code-card__code">{c.code}</code>
                          {c.active === false ? (
                            <span className="admin-student-badge admin-student-badge--danger">Closed</span>
                          ) : c.started ? (
                            <span className="admin-student-badge admin-student-badge--success">Live</span>
                          ) : (
                            <span className="admin-student-badge admin-student-badge--warning">Not started</span>
                          )}
                        </div>
                        <div className="admin-student-card__meta">
                          <span>{formatBundledPaperColumn(c.questionPaperId, bundledPapers)}</span>
                          {c.studentPasscodeQuota > 0 && (
                            <span><strong>{c.studentPasscodesClaimed ?? 0}</strong> / {c.studentPasscodeQuota} students</span>
                          )}
                          <span>{c.createdAt || "—"}</span>
                        </div>
                      </summary>
                      <div className="admin-code-card__body">
                        <div className="d-flex flex-wrap align-items-center gap-2 mb-3 pb-2 border-bottom">
                          {!c.started && c.active !== false && (
                            <button type="button" className="btn btn-sm btn-primary" disabled={startingCode === c.code} onClick={() => handleStartTest(c.code)}>
                              {startingCode === c.code ? "Starting…" : "Start test"}
                            </button>
                          )}
                          {c.active !== false ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              disabled={togglingActiveCode === c.code}
                              onClick={() => {
                                if (window.confirm(`Close test code ${c.code}?`)) handleSetCodeActive(c.code, false);
                              }}
                            >
                              {togglingActiveCode === c.code ? "…" : "Close code"}
                            </button>
                          ) : (
                            <button type="button" className="btn btn-sm btn-outline-success" disabled={togglingActiveCode === c.code} onClick={() => handleSetCodeActive(c.code, true)}>
                              {togglingActiveCode === c.code ? "…" : "Reopen code"}
                            </button>
                          )}
                          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => fetchCodeActivity(c.code)} disabled={loadingActivityCode === c.code}>
                            {loadingActivityCode === c.code ? "Loading…" : "Refresh students"}
                          </button>
                        </div>

                        {loadingActivityCode === c.code ? (
                          <p className="text-muted small mb-0">Loading student activity…</p>
                        ) : !act ? (
                          <p className="text-muted small mb-0">Click <strong>Refresh students</strong> to load activity.</p>
                        ) : studentRows.length === 0 ? (
                          <p className="text-muted small mb-0">No students yet.</p>
                        ) : (
                          <div className="admin-student-cards">
                            {studentRows.map((r) => {
                              const passcode = r.gatePasscode !== "—" ? r.gatePasscode : r.resumePassword;
                              const statusClass =
                                r.status === "Submitted" ? "admin-student-badge--success"
                                  : r.status === "Timed out" ? "admin-student-badge--danger"
                                    : r.status === "Uploads ongoing" ? "admin-student-badge--info"
                                      : "admin-student-badge--warning";
                              return (
                                <details key={r.key} className="admin-student-card">
                                  <summary className="admin-student-card__header">
                                    <div className="admin-student-card__identity">
                                      <span className="admin-student-card__name">{r.name}</span>
                                      <span className={`admin-student-badge ${statusClass}`}>{r.status}</span>
                                    </div>
                                    <div className="admin-student-card__meta">
                                      <span>{r.email}</span>
                                      {r.studentClass !== "—" && <span>Class {r.studentClass}</span>}
                                      {passcode !== "—" && <span>Passcode: <code>{passcode}</code></span>}
                                    </div>
                                  </summary>
                                  <div className="admin-student-card__body">
                                    {r.entries.map((entry, ei) => (
                                      <div key={ei} className="admin-student-card__entry">
                                        <div className="admin-student-card__entry-header">
                                          <strong>{entry.label}</strong>
                                          <span className={`admin-student-badge admin-student-badge--${entry.status === "Submitted" ? "success" : entry.status === "Timed out" ? "danger" : entry.status === "Uploads ongoing" ? "info" : "warning"}`} style={{fontSize: "0.75rem"}}>{entry.status}</span>
                                        </div>
                                        {entry.detail && <p className="small text-muted mb-2">{entry.detail}</p>}
                                        <div className="admin-student-card__uploads">
                                          <div className="admin-student-card__section">
                                            <h6 className="admin-student-card__section-title">Metadata snapshots</h6>
                                            <AdminChunkLogSubsection title="Snapshots" summary={entry.metadataChunkSummary} logText={entry.metadataChunkLog} />
                                          </div>
                                          <div className="admin-student-card__section">
                                            <h6 className="admin-student-card__section-title">Video chunks</h6>
                                            <AdminChunkLogSubsection title="Video segments" summary={entry.chunkSummary} logText={entry.videoChunkLog} />
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              );
                            })}
                            {act.staleSessionsClosedOnRefresh > 0 && (
                              <p className="small text-secondary mt-2 mb-0">
                                Moved <strong>{act.staleSessionsClosedOnRefresh}</strong> stale session(s) to <strong>Timed out</strong>.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </div>
        </details>

        {/* ── Section 3: Submissions ── */}
        <details className="admin-dash-section">
          <summary className="admin-dash-section__header">
            <span className="admin-dash-section__icon">&#128196;</span>
            <span className="admin-dash-section__title">Submissions</span>
            <span className="admin-dash-section__hint">{loading ? "…" : `${submissions.length} attempt${submissions.length !== 1 ? "s" : ""}`}</span>
          </summary>
          <div className="admin-dash-section__body">
            {error && (
              <div className="alert alert-danger mb-3">
                <div className="mb-0">{error}</div>
                {isGasProxyHtmlError(error) && <GasProxyDevHelpCallout />}
              </div>
            )}
            {loading ? (
              <p className="text-muted">Loading…</p>
            ) : submissions.length === 0 ? (
              <p className="text-muted small">No submissions yet.</p>
            ) : (
              <div className="admin-student-cards">
                {submissions.map((row, i) => {
                  const sizeBytes = row.fileSizeBytes != null ? Number(row.fileSizeBytes) : 0;
                  const sizeMB = sizeBytes / (1024 * 1024);
                  const videoStatus = row.videoStatus || (row.fileId ? "uploaded" : "pending");
                  const statusLabel =
                    videoStatus === "uploaded" ? "Uploaded"
                      : videoStatus === "chunked_partial" ? "Partial"
                        : videoStatus === "chunked_open" ? "In progress"
                          : videoStatus === "metadata_uploaded" ? "Metadata saved"
                            : videoStatus === "pending" ? "Pending"
                              : videoStatus === "failed" || videoStatus === "video_failed" ? "Failed"
                                : videoStatus.startsWith("retry_") ? "Retry"
                                  : videoStatus;
                  const statusBadge =
                    videoStatus === "uploaded" ? "admin-student-badge--success"
                      : videoStatus === "failed" || videoStatus === "video_failed" ? "admin-student-badge--danger"
                        : "admin-student-badge--warning";
                  return (
                    <details key={i} className="admin-student-card">
                      <summary className="admin-student-card__header">
                        <div className="admin-student-card__identity">
                          <span className="admin-student-card__name">{row.studentName || "—"}</span>
                          <span className={`admin-student-badge ${statusBadge}`}>{statusLabel}</span>
                          {row.score != null && row.total != null && (
                            <span className="small text-muted ms-auto">{row.score}/{row.total}</span>
                          )}
                        </div>
                        <div className="admin-student-card__meta">
                          <span>{row.email}</span>
                          <span>{String(row.timestamp)}</span>
                          {sizeBytes > 0 && <span>{sizeMB.toFixed(1)} MB</span>}
                        </div>
                      </summary>
                      <div className="admin-student-card__body">
                        <div className="admin-student-card__uploads">
                          <div className="admin-student-card__section">
                            <h6 className="admin-student-card__section-title">Info</h6>
                            <div className="small text-muted">
                              {row.phone && <div>Phone: {row.phone}</div>}
                              {row.adhar && <div>Aadhaar: {row.adhar}</div>}
                              {row.isMobile && <div>Mobile: {row.isMobile}</div>}
                              {row.events && <div className="mt-1">Events: <pre className="d-inline mb-0" style={{ maxWidth: 200, overflow: "auto" }}>{row.events}</pre></div>}
                            </div>
                          </div>
                          <div className="admin-student-card__section">
                            <h6 className="admin-student-card__section-title">Downloads</h6>
                            <div className="d-flex flex-wrap gap-1">
                              {row.fileId && (
                                <button type="button" className="btn btn-sm btn-primary" disabled={downloadingId === row.fileId} onClick={() => handleDownload(row.fileId, row.fileName)}>
                                  {downloadingId === row.fileId ? "…" : "Video / zip"}
                                </button>
                              )}
                              {row.metadataFileId && (
                                <button type="button" className="btn btn-sm btn-outline-secondary" disabled={downloadingId === row.metadataFileId} onClick={() => handleDownload(row.metadataFileId, "submission_metadata.json")}>
                                  {downloadingId === row.metadataFileId ? "…" : "Metadata"}
                                </button>
                              )}
                              {!row.fileId && !row.metadataFileId && <span className="text-muted small">No files</span>}
                            </div>
                          </div>
                        </div>
                        <div className="admin-student-card__uploads mt-2">
                          <div className="admin-student-card__section">
                            <h6 className="admin-student-card__section-title">Metadata snapshots</h6>
                            <AdminChunkLogSubsection title="Snapshots" summary={row.metadataChunkSummary} logText={row.metadataChunkLog} />
                          </div>
                          <div className="admin-student-card__section">
                            <h6 className="admin-student-card__section-title">Video chunks</h6>
                            <AdminChunkLogSubsection title="Video segments" summary={row.chunkSummary} logText={row.videoChunkLog || row.chunkUploadLog} />
                          </div>
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </div>
        </details>

        {/* ── Section 4: Feedback ── */}
        <details className="admin-dash-section">
          <summary className="admin-dash-section__header">
            <span className="admin-dash-section__icon">&#9733;</span>
            <span className="admin-dash-section__title">Feedback</span>
            <span className="admin-dash-section__hint">{feedbackLoading ? "…" : `${feedbackList.length} response${feedbackList.length !== 1 ? "s" : ""}`}</span>
          </summary>
          <div className="admin-dash-section__body">
            {feedbackLoading ? (
              <p className="text-muted">Loading…</p>
            ) : feedbackList.length === 0 ? (
              <p className="text-muted small">No feedback yet.</p>
            ) : (
              <div className="admin-student-cards">
                {feedbackList.map((fb, i) => {
                  const ds = fb.driveStatus || "uploaded";
                  const dsBadge = ds === "uploaded" ? "admin-student-badge--success" : ds === "failed" ? "admin-student-badge--danger" : "admin-student-badge--warning";
                  const dsLabel = ds === "uploaded" ? "Uploaded" : ds === "pending" ? "Pending" : ds === "failed" ? "Failed" : ds;
                  return (
                    <details key={i} className="admin-student-card">
                      <summary className="admin-student-card__header">
                        <div className="admin-student-card__identity">
                          <span className="admin-student-card__name">{fb.studentName || "Anonymous"}</span>
                          <span className="admin-student-badge admin-student-badge--info">{fb.ratingLabel || fb.rating}</span>
                          <span className={`admin-student-badge ${dsBadge}`}>{dsLabel}</span>
                        </div>
                        <div className="admin-student-card__meta">
                          {fb.studentEmail && <span>{fb.studentEmail}</span>}
                          <span>{String(fb.timestamp)}</span>
                        </div>
                      </summary>
                      <div className="admin-student-card__body">
                        <div className="admin-student-card__section">
                          <h6 className="admin-student-card__section-title">Comment</h6>
                          <p className="small mb-0">{fb.comment || "—"}</p>
                        </div>
                        <div className="admin-student-card__meta mt-2">
                          {fb.studentClass && <span>Class {fb.studentClass}</span>}
                          {fb.studentPhone && <span>Phone: {fb.studentPhone}</span>}
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </div>
        </details>

        {/* ── Section 5: Danger zone ── */}
        <details className="admin-dash-section admin-dash-section--danger">
          <summary className="admin-dash-section__header">
            <span className="admin-dash-section__icon">&#9888;</span>
            <span className="admin-dash-section__title">Danger zone</span>
            <span className="admin-dash-section__hint">Clear all test data</span>
          </summary>
          <div className="admin-dash-section__body">
            <p className="text-muted small mb-2">
              Removes <strong>every</strong> test code, session, submission, and feedback row. Trashes Drive uploads (recoverable from trash). Bundled papers are not deleted.
            </p>
            <div className="row g-2 align-items-end flex-wrap">
              <div className="col-12 col-md-8 col-lg-6">
                <label className="form-label small mb-1" htmlFor="bulk-clear-phrase">
                  Type <strong>{ADMIN_BULK_RESET_PHRASE_HINT}</strong> to confirm
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
                <button type="button" className="btn btn-sm btn-danger" disabled={!ADMIN_SECRET || bulkClearing} onClick={handleBulkClearEverything}>
                  {bulkClearing ? "Clearing…" : "Clear everything + Drive"}
                </button>
              </div>
            </div>
          </div>
        </details>

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
