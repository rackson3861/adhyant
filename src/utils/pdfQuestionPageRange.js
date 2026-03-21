/**
 * ABQuest / booklet PDFs: cover + instructions on pages 1–2, MCQs from page 3 onward,
 * final page often blank. Scanning 1–2 and the last page causes false "N." hits and bad crops.
 */

/** First 1-based page index to include for question detection (skip cover + instructions). */
export const PDF_FIRST_QUESTION_PAGE = 3;

/**
 * Inclusive 1-based page range to extract text + question images from.
 * @param {number} numPages
 * @returns {{ startPage: number, endPage: number }}
 */
export function getQuestionPdfPageRange(numPages) {
  const n = Math.max(0, Math.floor(Number(numPages) || 0));
  if (n <= 0) {
    return { startPage: 1, endPage: 0 };
  }
  if (n < PDF_FIRST_QUESTION_PAGE) {
    return { startPage: 1, endPage: n };
  }
  const endPage = n > PDF_FIRST_QUESTION_PAGE ? n - 1 : n;
  if (endPage < PDF_FIRST_QUESTION_PAGE) {
    return { startPage: PDF_FIRST_QUESTION_PAGE, endPage: n };
  }
  return { startPage: PDF_FIRST_QUESTION_PAGE, endPage };
}
