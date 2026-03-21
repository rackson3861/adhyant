/**
 * URLs for bundled question papers under /public/questions/
 */

export function getPublicQuestionsBaseUrl() {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${base}/questions`;
}

export function getPapersIndexUrl() {
  return `${getPublicQuestionsBaseUrl()}/papers-index.json`;
}

export function getPaperBundleUrl(paperId) {
  const id = encodeURIComponent(String(paperId || "").trim());
  return `${getPublicQuestionsBaseUrl()}/papers/${id}/paper.json`;
}
