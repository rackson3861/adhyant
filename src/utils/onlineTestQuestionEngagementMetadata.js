/**
 * Per-question engagement for proctoring / review (metadata snapshots).
 * Indices are 0-based paper order (same as questionTimesSeconds / palette).
 */
export const QUESTION_ENGAGEMENT_METADATA_LABEL =
  "Per-question status in UI order (Q1 = index 0). answered = non-empty response; flagged = marked for review; " +
  "seen = student opened the question; never_seen = not opened and no answer. " +
  "answered_flagged = answered and still marked for review.";

/**
 * @param {Array<{ id: string }>} questions
 * @param {Record<string, unknown>} answers
 * @param {Iterable<number>} seenIndices
 * @param {Iterable<number>} flaggedIndices
 */
export function buildQuestionEngagementPayload(questions, answers, seenIndices, flaggedIndices) {
  const seen = seenIndices instanceof Set ? seenIndices : new Set(seenIndices || []);
  const flagged = flaggedIndices instanceof Set ? flaggedIndices : new Set(flaggedIndices || []);
  const byNumber = {};
  const byQuestionId = {};
  const answeredQuestionNumbers = [];
  const flaggedForReviewQuestionNumbers = [];
  const seenUnansweredQuestionNumbers = [];
  const neverSeenQuestionNumbers = [];
  const answeredFlaggedQuestionNumbers = [];

  const n = Array.isArray(questions) ? questions.length : 0;
  for (let i = 0; i < n; i++) {
    const q = questions[i] || {};
    const qid = q.id != null ? String(q.id) : "";
    const num = i + 1;
    const hasAns = answers[q.id] !== undefined && answers[q.id] !== "";
    const isSeen = seen.has(i);
    const isFlag = flagged.has(i);

    let status;
    if (hasAns && isFlag) {
      status = "answered_flagged";
      answeredFlaggedQuestionNumbers.push(num);
    } else if (hasAns) {
      status = "answered";
      answeredQuestionNumbers.push(num);
    } else if (isFlag) {
      status = "flagged_unanswered";
      flaggedForReviewQuestionNumbers.push(num);
    } else if (isSeen) {
      status = "seen_unanswered";
      seenUnansweredQuestionNumbers.push(num);
    } else {
      status = "never_seen";
      neverSeenQuestionNumbers.push(num);
    }

    byNumber[String(num)] = status;
    if (qid) byQuestionId[qid] = status;
  }

  return {
    questionEngagementLabel: QUESTION_ENGAGEMENT_METADATA_LABEL,
    questionEngagementByQuestionNumber: byNumber,
    questionEngagementByQuestionId: byQuestionId,
    answeredQuestionNumbers,
    answeredFlaggedQuestionNumbers,
    flaggedForReviewQuestionNumbers,
    seenUnansweredQuestionNumbers,
    neverSeenQuestionNumbers,
    engagementCounts: {
      total: n,
      answered: answeredQuestionNumbers.length + answeredFlaggedQuestionNumbers.length,
      answeredFlagged: answeredFlaggedQuestionNumbers.length,
      flaggedForReviewUnanswered: flaggedForReviewQuestionNumbers.length,
      seenUnanswered: seenUnansweredQuestionNumbers.length,
      neverSeen: neverSeenQuestionNumbers.length,
    },
  };
}
