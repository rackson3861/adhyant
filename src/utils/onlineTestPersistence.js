/**
 * Save / restore in-progress online test so students can resume after leaving the page.
 * Stored in localStorage, scoped by paper + test code + gate passcode + student email (lowercase).
 * Passcode is required so multiple students on the same shared test code do not share one local snapshot.
 */

const STORAGE_PREFIX = "adhyant_online_test_progress_v2_";
const MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

/** Stable root for one paper + test code + passcode (no email). */
export function progressKeyRoot(paperId, testCode, gatePasscode) {
  const p = (paperId || "default").toString().trim() || "default";
  const c = (testCode || "").toString().trim().toUpperCase() || "NOCODE";
  const passRaw = (gatePasscode || "").toString().trim();
  const passSeg = passRaw ? encodeURIComponent(passRaw) : "nopass";
  return STORAGE_PREFIX + encodeURIComponent(p) + "_" + encodeURIComponent(c) + "_" + passSeg;
}

function storageKey(paperId, testCode, gatePasscode, gateEmail) {
  const root = progressKeyRoot(paperId, testCode, gatePasscode);
  const s = (gateEmail || "").toString().trim().toLowerCase();
  if (!s) return root;
  return root + "_" + encodeURIComponent(s);
}

/**
 * @param {object} payload
 * @param {string} payload.paperId
 * @param {string} payload.testCode
 * @param {string} [payload.gatePasscode] - same value as gate session passcode; scopes localStorage to this student
 * @param {string} [payload.secondaryCode] - student email (lowercase); kept as secondaryCode for payload compatibility
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
 * @param {string} [payload.submissionKey] - Apps Script chunked upload session key (resume)
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
      studentResumePassword,
      gatePasscode,
      questionTimesSeconds,
      testStartedAt,
      seenIndices,
      flaggedIndices,
      violations,
      submissionKey,
    } = payload;
    const gatePw = (gatePasscode != null ? String(gatePasscode) : "").trim();
    if (timeLeft == null || timeLeft <= 0) {
      clearTestProgress(paperId, testCode, secondaryCode, gatePw);
      return;
    }
    const data = {
      v: 1,
      savedAt: Date.now(),
      paperId: paperId || "default",
      testCode: (testCode || "").toUpperCase(),
      secondaryCode: (secondaryCode || "").toLowerCase(),
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
      studentResumePassword: studentResumePassword || "",
      questionTimesSeconds: Array.isArray(questionTimesSeconds) ? questionTimesSeconds : [],
      testStartedAt: typeof testStartedAt === "number" ? testStartedAt : Date.now(),
      seenIndices: Array.isArray(seenIndices) ? seenIndices : [],
      flaggedIndices: Array.isArray(flaggedIndices) ? flaggedIndices : [],
      violations: Array.isArray(violations) ? violations : [],
      submissionKey: typeof submissionKey === "string" && submissionKey.trim() ? submissionKey.trim() : "",
    };
    localStorage.setItem(storageKey(paperId, testCode, gatePw, secondaryCode), JSON.stringify(data));
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
export function loadTestProgress(paperId, testCode, currentQuestionCount, secondaryCode, gatePasscode) {
  try {
    if (typeof localStorage === "undefined") return null;
    const gatePw = (gatePasscode != null ? String(gatePasscode) : "").trim();
    const raw = localStorage.getItem(storageKey(paperId, testCode, gatePw, secondaryCode));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.v !== 1 || !data) return null;
    if (Date.now() - (data.savedAt || 0) > MAX_AGE_MS) {
      clearTestProgress(paperId, testCode, secondaryCode, gatePw);
      return null;
    }
    if (typeof data.timeLeft !== "number" || data.timeLeft <= 0) return null;
    if (typeof currentQuestionCount === "number" && currentQuestionCount > 0 && data.questionCount !== currentQuestionCount) {
      clearTestProgress(paperId, testCode, secondaryCode, gatePw);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearTestProgress(paperId, testCode, secondaryCode, gatePasscode) {
  try {
    if (typeof localStorage === "undefined") return;
    const gatePw = (gatePasscode != null ? String(gatePasscode) : "").trim();
    localStorage.removeItem(storageKey(paperId, testCode, gatePw, secondaryCode));
  } catch {
    /* ignore */
  }
}

/**
 * When student email is not yet typed, pick the most recently saved in-progress snapshot for this
 * paper + test code + gate passcode (same device). Never merges progress across different passcodes.
 */
export function findLatestTestProgressForPaperAndCode(paperId, testCode, currentQuestionCount, gatePasscode) {
  try {
    if (typeof localStorage === "undefined") return null;
    const root = progressKeyRoot(paperId, testCode, gatePasscode);
    let best = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || (k !== root && !k.startsWith(root + "_"))) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }
      if (data.v !== 1 || !data) continue;
      if (Date.now() - (data.savedAt || 0) > MAX_AGE_MS) continue;
      if (typeof data.timeLeft !== "number" || data.timeLeft <= 0) continue;
      if (typeof currentQuestionCount === "number" && currentQuestionCount > 0 && data.questionCount !== currentQuestionCount) continue;
      if (!best || (data.savedAt || 0) > (best.savedAt || 0)) best = data;
    }
    return best;
  } catch {
    return null;
  }
}
