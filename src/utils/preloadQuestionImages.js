import { resolveStemImageSrcForOnlineTest } from "./scriptApi";

/**
 * Decode image via browser so it enters HTTP cache (no CORS required).
 * @param {string} url
 * @returns {Promise<void>}
 */
function decodeImageElement(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

/**
 * Preload every question stem image: try fetch→blob URL (local memory) first; fall back to Image decode (disk cache).
 * Deduplicates URLs. Safe to call with empty questions.
 *
 * @param {Array<object>} questions
 * @param {string} paperId
 * @param {(done: number, total: number) => void} [onProgress] - called after each question with a figure
 * @returns {Promise<{ idToSrc: Record<string, string>, blobUrlsToRevoke: string[] }>}
 */
export async function preloadAllQuestionStemImages(questions, paperId, onProgress) {
  const blobUrlsToRevoke = [];
  const urlToDisplay = new Map();
  const inflight = new Map();

  const jobs = [];
  (questions || []).forEach((q, i) => {
    const src = resolveStemImageSrcForOnlineTest(q, paperId, i);
    if (src) jobs.push({ questionId: q.id, url: src });
  });
  const total = jobs.length;
  let completed = 0;

  async function resolveUrl(url) {
    if (!url) return "";
    if (url.startsWith("data:")) {
      urlToDisplay.set(url, url);
      return url;
    }
    if (urlToDisplay.has(url)) return urlToDisplay.get(url);
    if (inflight.has(url)) return inflight.get(url);

    const promise = (async () => {
      let display = url;
      try {
        const res = await fetch(url, { mode: "cors", cache: "force-cache" });
        if (res.ok) {
          const blob = await res.blob();
          if (blob && String(blob.type || "").startsWith("image/")) {
            const b = URL.createObjectURL(blob);
            blobUrlsToRevoke.push(b);
            display = b;
          }
        }
      } catch {
        /* CORS or network — use decode path */
      }
      if (display === url) {
        await decodeImageElement(url);
      }
      urlToDisplay.set(url, display);
      return display;
    })();

    inflight.set(url, promise);
    try {
      return await promise;
    } finally {
      inflight.delete(url);
    }
  }

  const idToSrc = {};
  for (const { questionId, url } of jobs) {
    idToSrc[questionId] = await resolveUrl(url);
    completed += 1;
    onProgress?.(completed, total);
  }

  return { idToSrc, blobUrlsToRevoke };
}
