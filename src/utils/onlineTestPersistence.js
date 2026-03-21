/**
 * Save / restore in-progress online test so students can resume after leaving the page.
 * Stored in localStorage, scoped by paper + test code + session (secondary) code when present.
 */

const STORAGE_PREFIX = "adhyant_online_test_progress_v1_";
const MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

function storageKey(paperId, testCode, secondaryCode) {
  const p = (paperId || "default").toString().trim() || "default";
  const c = (testCode || "").toString().trim().toUpperCase() || "NOCODE";
  const base = STORAGE_PREFIX + encodeURIComponent(p) + "_" + encodeURIComponent(c);
  const s = (secondaryCode || "").toString().trim().toUpperCase();
  if (!s) return base;
  return base + "_" + encodeURIComponent(s);
}

/**
 * @param {object} payload
 * @param {string} payload.paperId
 * @param {string} payload.testCode
 * @param {string} [payload.secondaryCode] - session / resume code (required for new test codes with secondaries)
 * @param {number} payload.timeLeft
 * @param {number} payload.durationMinutes
 * @param {number} payload.questionCount
 * @param {Record<string, unknown>} payload.answers
 * @param {number} payload.currentIndex
 * @param {string} payload.studentName
 * @param {string} payload.studentEmail
 * @param {string} payload.studentPhone
 * @param {string} [payload.studentClass]
 * @param {string} payload.studentAdhar
 * @param {number[]} payload.questionTimesSeconds
 * @param {number} payload.testStartedAt - epoch ms
 * @param {number[]} payload.seenIndices
 * @param {number[]} payload.flaggedIndices
 * @param {object[]} payload.violations
 */
export function saveTestProgress(payload) {
  try {
    if (typeof localStorage === "undefined") return;
    const {
      paperId,
      testCode,
      secondaryCode,
      timeLeft,
      durationMinutes,
      questionCount,
      answers,
      currentIndex,
      studentName,
      studentEmail,
      studentPhone,
      studentClass,
      studentAdhar,
      questionTimesSeconds,
      testStartedAt,
      seenIndices,
      flaggedIndices,
      violations,
    } = payload;
    if (timeLeft == null || timeLeft <= 0) {
      clearTestProgress(paperId, testCode, secondaryCode);
      return;
    }
    const data = {
      v: 1,
      savedAt: Date.now(),
      paperId: paperId || "default",
      testCode: (testCode || "").toUpperCase(),
      secondaryCode: (secondaryCode || "").toUpperCase(),
      timeLeft: Math.floor(timeLeft),
      durationMinutes,
      questionCount,
      answers: answers && typeof answers === "object" ? answers : {},
      currentIndex: Math.max(0, Math.floor(currentIndex || 0)),
      studentName: studentName || "",
      studentEmail: studentEmail || "",
      studentPhone: studentPhone || "",
      studentClass: studentClass || "",
      studentAdhar: studentAdhar || "",
      questionTimesSeconds: Array.isArray(questionTimesSeconds) ? questionTimesSeconds : [],
      testStartedAt: typeof testStartedAt === "number" ? testStartedAt : Date.now(),
      seenIndices: Array.isArray(seenIndices) ? seenIndices : [],
      flaggedIndices: Array.isArray(flaggedIndices) ? flaggedIndices : [],
      violations: Array.isArray(violations) ? violations : [],
    };
    localStorage.setItem(storageKey(paperId, testCode, secondaryCode), JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

/**
 * @param {string|null} paperId
 * @param {string|null} testCode
 * @param {number} currentQuestionCount - must match snapshot or resume is rejected
 * @returns {object|null}
 */
export function loadTestProgress(paperId, testCode, currentQuestionCount, secondaryCode) {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(storageKey(paperId, testCode, secondaryCode));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.v !== 1 || !data) return null;
    if (Date.now() - (data.savedAt || 0) > MAX_AGE_MS) {
      clearTestProgress(paperId, testCode, secondaryCode);
      return null;
    }
    if (typeof data.timeLeft !== "number" || data.timeLeft <= 0) return null;
    if (typeof currentQuestionCount === "number" && currentQuestionCount > 0 && data.questionCount !== currentQuestionCount) {
      clearTestProgress(paperId, testCode, secondaryCode);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearTestProgress(paperId, testCode, secondaryCode) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(storageKey(paperId, testCode, secondaryCode));
  } catch {
    /* ignore */
  }
}
