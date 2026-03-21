const SCRIPT_URL = (
  import.meta.env.NEXT_PUBLIC_RECORDING_UPLOAD_URL ||
  import.meta.env.VITE_RECORDING_UPLOAD_URL ||
  import.meta.env.VITE_TEST_SUBMISSION_URL ||
  ""
)
  .toString()
  .trim();

function getBaseAndId() {
  if (!SCRIPT_URL) return { base: "", scriptId: null };
  const base = SCRIPT_URL.replace(/\/exec\/?$/, "").replace(/\/macros\/s\/[^/]+\/?$/, "");
  const scriptId = SCRIPT_URL.match(/\/macros\/s\/([^/]+)/)?.[1];
  return { base, scriptId };
}

/** In Vite dev, route through /__gas/exec (see vite.config.js proxy) so script.google.com CORS does not block fetch. */
function useGasDevProxy() {
  if (!import.meta.env.DEV) return false;
  if (import.meta.env.VITE_GAS_DEV_PROXY === "false") return false;
  return !!getBaseAndId().scriptId;
}

function buildUrl(params) {
  const { base, scriptId } = getBaseAndId();
  const q = new URLSearchParams(params).toString();
  if (useGasDevProxy() && scriptId) {
    return `/__gas/exec?${q}`;
  }
  if (scriptId) return `${base}/macros/s/${scriptId}/exec?${q}`;
  return SCRIPT_URL + (SCRIPT_URL.indexOf("?") >= 0 ? "&" : "?") + q;
}

/**
 * Gate: test code + passcode. Student-chosen passcode (min length on server) unless the sheet has a fixed organiser password.
 */
export function getValidateCodeUrl(code, studentPassword, studentEmail) {
  const p = { action: "validateCode", code: code || "" };
  const pw = (studentPassword || "").toString().trim();
  if (pw) p.studentPassword = pw;
  const em = (studentEmail || "").toString().trim().toLowerCase();
  if (em) p.studentEmail = em;
  return buildUrl(p);
}

export function getGenerateCodeUrl(adminSecret, adminEmail, questionPaperId, studentPasscodeCount) {
  const p = {
    action: "generateCode",
    adminSecret: adminSecret || "",
    adminEmail: adminEmail || "",
    questionPaperId: questionPaperId || "",
  };
  const n = parseInt(String(studentPasscodeCount ?? ""), 10);
  if (n >= 1 && n <= 500) p.studentPasscodeCount = String(n);
  return buildUrl(p);
}

export function getListTestCodesUrl(adminSecret) {
  return buildUrl({ action: "listTestCodes", adminSecret: adminSecret || "" });
}

export function getStartTestUrl(adminSecret, code) {
  return buildUrl({ action: "startTest", adminSecret: adminSecret || "", code: code || "" });
}

/** active: true = students can use code; false = closed (validate fails). */
export function getSetTestCodeActiveUrl(adminSecret, code, active) {
  return buildUrl({
    action: "setTestCodeActive",
    adminSecret: adminSecret || "",
    code: code || "",
    active: active ? "yes" : "no",
  });
}

/** @param {string} secondaryCode - student registration email (lowercase); stored on session row for admin */
export function getRecordTestStartUrl(code, email, name, secondaryCode, studentClass, resumePassword, gatePasscode) {
  const p = {
    action: "recordTestStart",
    code: code || "",
    email: email || "",
    name: name || "",
  };
  const g = (secondaryCode || "").toString().trim().toLowerCase();
  if (g) p.secondaryCode = g;
  const cls = (studentClass || "").toString().trim();
  if (cls) p.studentClass = cls;
  const rp = (resumePassword || "").toString().trim();
  if (rp) p.resumePassword = rp.slice(0, 80);
  const gp = (gatePasscode || "").toString().trim();
  if (gp) p.gatePasscode = gp.slice(0, 64);
  return buildUrl(p);
}

/** Release in-progress session so the same code+student email can start again (e.g. after “Start over”). */
export function getAbandonTestSessionUrl(code, email) {
  return buildUrl({
    action: "abandonTestSession",
    code: code || "",
    email: (email || "").toString().trim(),
  });
}

export function getListTestCodeActivityUrl(adminSecret, code) {
  return buildUrl({ action: "listTestCodeActivity", adminSecret: adminSecret || "", code: code || "" });
}

/** Admin: delete a question paper row (blocked if any test code references that paper). */
export function getDeleteQuestionPaperUrl(adminSecret, paperId) {
  return buildUrl({
    action: "deleteQuestionPaper",
    adminSecret: adminSecret || "",
    paperId: paperId || "",
  });
}

/** Shown in the bulk-reset field — server also accepts delete everything, delete all test data, delete all (case-insensitive). */
export const ADMIN_BULK_RESET_PHRASE_HINT = "everything";

/**
 * Same rules as Apps Script isBulkResetConfirmOk_: case-insensitive, normalized spaces.
 */
export function isAdminBulkResetPhraseValid(phrase) {
  const p = String(phrase || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return (
    p === "everything" ||
    p === "delete everything" ||
    p === "delete all test data" ||
    p === "delete all" ||
    p === "yes delete all"
  );
}

/** @deprecated use ADMIN_BULK_RESET_PHRASE_HINT */
export const ADMIN_CLEAR_ALL_CONFIRM_PHRASE = ADMIN_BULK_RESET_PHRASE_HINT;

/**
 * Admin: remove ALL test codes, sessions, submissions, feedback sheet rows, and trash contents of
 * online uploads / legacy zip / feedback Drive roots. Does not delete question papers.
 */
export function getClearAllTestDataUrl(adminSecret, confirmPhrase) {
  return buildUrl({
    action: "clearAllTestData",
    adminSecret: adminSecret || "",
    confirmPhrase: confirmPhrase || "",
  });
}

export function getListPapersUrl() {
  return buildUrl({ action: "listPapers" });
}

/** @param {string} [adminSecret] - When set and valid on the server, responses include answers for admin review. */
export function getPaperUrl(id, adminSecret) {
  const p = { action: "getPaper", id: id || "" };
  const sec = (adminSecret || "").toString().trim();
  if (sec) p.adminSecret = sec;
  return buildUrl(p);
}

/** Extract Google Drive file id from legacy uc?export=view, thumbnail, or /file/d/ links. */
export function driveFileIdFromUrl(url) {
  if (!url || typeof url !== "string") return "";
  const idParam = url.match(/[?&]id=([^&]+)/);
  if (idParam) {
    try {
      return decodeURIComponent(idParam[1]);
    } catch {
      return idParam[1];
    }
  }
  const dslash = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return dslash ? dslash[1] : "";
}

/** Data URL when parsing locally; otherwise Drive thumbnail (reliable in <img> vs uc?export=view). */
export function resolveQuestionImageSrc(question) {
  if (!question || typeof question !== "object") return "";
  if (question.questionImage) return question.questionImage;
  const fid = question.imageFileId || driveFileIdFromUrl(question.imageUrl);
  if (!fid) return question.imageUrl || "";
  /* w2000 = max width; larger helps sharpness on retina when Drive allows */
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fid)}&sz=w2400`;
}

/**
 * GET URL that streams the question image via Apps Script (works in <img> when Drive thumbnail is blocked).
 * @param {string} paperId
 * @param {number} questionIndex - 0-based index in paper.questions
 */
export function getServePaperQuestionImageUrl(paperId, questionIndex) {
  return buildUrl({
    action: "servePaperQuestionImage",
    paperId: paperId || "",
    questionIndex: String(questionIndex ?? 0),
  });
}

/**
 * Best src for online test: data URL, else proxied image when paperId known, else Drive thumbnail.
 */
export function getQuestionImageSrcForOnlineTest(question, paperId, questionIndex) {
  if (!question || typeof question !== "object") return "";
  const qi = question.questionImage;
  if (typeof qi === "string" && qi.startsWith("data:")) return qi;
  const fid = question.imageFileId || driveFileIdFromUrl(question.imageUrl || "");
  if (!fid) return "";
  const pid = (paperId || "").toString().trim();
  if (pid && pid !== "default") {
    return getServePaperQuestionImageUrl(pid, questionIndex);
  }
  return resolveQuestionImageSrc(question);
}

/** Second try if primary / proxy fails (use large width — w400 looked blurry). */
export function getDriveThumbnailFallbackUrl(fileId) {
  const id = String(fileId || "").trim();
  if (!id) return "";
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w2000`;
}

/**
 * Resolved figure URL for one question (same rules as OnlineTest stem image).
 */
export function resolveStemImageSrcForOnlineTest(question, paperId, questionIndex) {
  if (!question || typeof question !== "object") return "";
  const direct = String(question.imageUrl || question.questionImage || "").trim();
  if (direct) {
    if (direct.startsWith("data:") || direct.startsWith("http://") || direct.startsWith("https://")) return direct;
    if (direct.startsWith("/")) return direct;
    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    return `${base}/${direct.replace(/^\//, "")}`;
  }
  const fid = question.imageFileId || driveFileIdFromUrl(question.imageUrl || "");
  const pid = (paperId || "").toString().trim();
  if (fid && pid && pid !== "default") {
    return getServePaperQuestionImageUrl(pid, questionIndex);
  }
  return String(resolveQuestionImageSrc(question) || "").trim();
}

export function getListFeedbackUrl() {
  return buildUrl({ action: "listFeedback" });
}

/** Submissions list (doGet action=list) — use this instead of building the script URL manually. */
export function getListSubmissionsUrl() {
  return buildUrl({ action: "list" });
}

/** Drive file download via Apps Script (doGet action=download). */
export function getAppsScriptDownloadUrl(fileId) {
  return buildUrl({ action: "download", fileId: fileId || "" });
}

export function getScriptPostUrl() {
  const { base, scriptId } = getBaseAndId();
  if (useGasDevProxy() && scriptId) {
    return "/__gas/exec";
  }
  if (scriptId) return `${base}/macros/s/${scriptId}/exec`;
  return SCRIPT_URL;
}

/**
 * True when POST can be sent: full http(s) URL, or Vite dev proxy path `/__gas/exec` (not http — see vite.config).
 */
export function isScriptPostUrlReady(url) {
  const u = (url || "").toString().trim();
  if (!u) return false;
  if (/^https?:\/\//i.test(u)) return true;
  if (u.startsWith("/__gas/")) return true;
  return false;
}

/**
 * POST JSON to a Google Apps Script web app in a way browsers allow cross-origin.
 * Using Content-Type: application/json triggers a CORS preflight (OPTIONS) that
 * Apps Script often does not answer → net::ERR_FAILED. Sending the same body as
 * text/plain avoids preflight; doPost still JSON.parse(postData.contents).
 */
export function postToAppsScript(url, payload) {
  const u = (url || "").toString().trim();
  return fetch(u, {
    method: "POST",
    mode: "cors",
    cache: "no-store",
    headers: { "Content-Type": "text/plain" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

/** Prefer POST for open/close code: some deployments lose GET query params on redirects → "Code required". */
export function postSetTestCodeActive(adminSecret, code, active) {
  return postToAppsScript(getScriptPostUrl(), {
    action: "setTestCodeActive",
    adminSecret: adminSecret || "",
    code: (code || "").toString().trim(),
    active: active ? "yes" : "no",
  });
}

/**
 * Parse JSON from Apps Script web app responses. When the Vite dev proxy calls Google
 * without a logged-in user, deployments restricted to "Anyone with Google account"
 * return an HTML sign-in page — this detects that and throws a clear error.
 * @param {Response} response
 * @returns {Promise<any>}
 */
export async function parseAppsScriptFetchResponse(response) {
  const text = await response.text();
  const t = text.trim();
  if (!t) {
    throw new Error("Empty response from Apps Script.");
  }
  if (t.startsWith("<!") || (t.startsWith("<") && t.toLowerCase().includes("doctype"))) {
    throw new Error(
      "Apps Script returned HTML instead of JSON. For local dev with the Vite proxy, redeploy the web app with “Who has access: Anyone”. “Anyone with Google account” only works when the browser calls Google while signed in — the proxy cannot sign in."
    );
  }
  try {
    return JSON.parse(t);
  } catch (e) {
    throw new Error(
      `Apps Script response is not valid JSON (${e.message}). First bytes: ${t.slice(0, 80).replace(/\s+/g, " ")}`
    );
  }
}

export { SCRIPT_URL };
