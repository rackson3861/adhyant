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

function buildUrl(params) {
  const { base, scriptId } = getBaseAndId();
  const q = new URLSearchParams(params).toString();
  if (scriptId) return `${base}/macros/s/${scriptId}/exec?${q}`;
  return SCRIPT_URL + (SCRIPT_URL.indexOf("?") >= 0 ? "&" : "?") + q;
}

export function getValidateCodeUrl(code, secondaryCode) {
  const p = { action: "validateCode", code: code || "" };
  const sec = (secondaryCode || "").toString().trim().toUpperCase();
  if (sec) p.secondaryCode = sec;
  return buildUrl(p);
}

/** @param {number} [resumeCodeCount] - N secondary (resume) codes to create per primary test code */
export function getGenerateCodeUrl(adminSecret, adminEmail, questionPaperId, resumeCodeCount) {
  const p = { action: "generateCode", adminSecret: adminSecret || "", adminEmail: adminEmail || "", questionPaperId: questionPaperId || "" };
  if (resumeCodeCount != null && resumeCodeCount !== "") p.resumeCodeCount = String(resumeCodeCount);
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

export function getRecordTestStartUrl(code, email, name, secondaryCode, studentClass) {
  const p = {
    action: "recordTestStart",
    code: code || "",
    email: email || "",
    name: name || "",
  };
  const sec = (secondaryCode || "").toString().trim().toUpperCase();
  if (sec) p.secondaryCode = sec;
  const cls = (studentClass || "").toString().trim();
  if (cls) p.studentClass = cls;
  return buildUrl(p);
}

export function getListTestCodeActivityUrl(adminSecret, code) {
  return buildUrl({ action: "listTestCodeActivity", adminSecret: adminSecret || "", code: code || "" });
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
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fid)}&sz=w2000`;
}

/** Second try if primary thumbnail fails (different size sometimes succeeds). */
export function getDriveThumbnailFallbackUrl(fileId) {
  const id = String(fileId || "").trim();
  if (!id) return "";
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w400`;
}

export function getListFeedbackUrl() {
  return buildUrl({ action: "listFeedback" });
}

export function getScriptPostUrl() {
  const { base, scriptId } = getBaseAndId();
  if (scriptId) return `${base}/macros/s/${scriptId}/exec`;
  return SCRIPT_URL;
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

export { SCRIPT_URL };
