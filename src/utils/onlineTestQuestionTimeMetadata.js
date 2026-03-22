/**
 * Submission metadata: documents how question timing arrays/maps relate to the paper.
 * questionTimesSeconds (legacy array) is parallel to questions[] in UI order: index 0 = Q1.
 */
export const QUESTION_TIME_SPENT_METADATA_LABEL =
  "Seconds spent on each question screen while taking the test, in the same order as questions appear in the UI. " +
  "questionTimesSeconds[i] and timeSpentSecondsByQuestionNumber[String(i+1)] refer to the same question. " +
  "null means the student did not open that question or no time was recorded. " +
  "timeSpentSecondsByQuestionId maps stable question id → seconds (same values as by number).";

/**
 * @param {Array<{ id?: string, paperQuestionNum?: string|number }>} questions - paper order in the test UI
 * @param {Array<number|null|undefined>} timesSeconds - parallel array (same length as questions when complete)
 * @returns {{ questionTimeSpentLabel: string, timeSpentSecondsByQuestionNumber: Record<string, number|null>, timeSpentSecondsByQuestionId: Record<string, number|null> }}
 */
export function buildQuestionTimeSpentMaps(questions, timesSeconds) {
  const byNumber = {};
  const byQuestionId = {};
  const arr = Array.isArray(timesSeconds) ? timesSeconds : [];
  const n = Array.isArray(questions) ? questions.length : 0;
  for (let i = 0; i < n; i++) {
    const q = questions[i] || {};
    const raw = arr[i];
    let sec = null;
    if (typeof raw === "number" && !Number.isNaN(raw)) {
      sec = Math.round(raw * 1000) / 1000;
    }
    byNumber[String(i + 1)] = sec;
    const id = q.id != null && String(q.id).trim() !== "" ? String(q.id) : null;
    if (id) byQuestionId[id] = sec;
  }
  return {
    questionTimeSpentLabel: QUESTION_TIME_SPENT_METADATA_LABEL,
    timeSpentSecondsByQuestionNumber: byNumber,
    timeSpentSecondsByQuestionId: byQuestionId,
  };
}
