const SCRIPT_URL = import.meta.env.NEXT_PUBLIC_RECORDING_UPLOAD_URL || import.meta.env.VITE_RECORDING_UPLOAD_URL || import.meta.env.VITE_TEST_SUBMISSION_URL || "";

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

export function getValidateCodeUrl(code) {
  return buildUrl({ action: "validateCode", code: code || "" });
}

export function getGenerateCodeUrl(adminSecret, adminEmail, questionPaperId) {
  const p = { action: "generateCode", adminSecret: adminSecret || "", adminEmail: adminEmail || "", questionPaperId: questionPaperId || "" };
  return buildUrl(p);
}

export function getListTestCodesUrl(adminSecret) {
  return buildUrl({ action: "listTestCodes", adminSecret: adminSecret || "" });
}

export function getStartTestUrl(adminSecret, code) {
  return buildUrl({ action: "startTest", adminSecret: adminSecret || "", code: code || "" });
}

export function getRecordTestStartUrl(code, email, name) {
  return buildUrl({
    action: "recordTestStart",
    code: code || "",
    email: email || "",
    name: name || "",
  });
}

export function getListTestCodeActivityUrl(adminSecret, code) {
  return buildUrl({ action: "listTestCodeActivity", adminSecret: adminSecret || "", code: code || "" });
}

export function getListPapersUrl() {
  return buildUrl({ action: "listPapers" });
}

export function getPaperUrl(id) {
  return buildUrl({ action: "getPaper", id: id || "" });
}

export function getListFeedbackUrl() {
  return buildUrl({ action: "listFeedback" });
}

export function getScriptPostUrl() {
  const { base, scriptId } = getBaseAndId();
  if (scriptId) return `${base}/macros/s/${scriptId}/exec`;
  return SCRIPT_URL;
}

export { SCRIPT_URL };
