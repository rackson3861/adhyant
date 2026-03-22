/**
 * Bundled ABQuest papers: marking scheme callout on the instructions screen.
 * (Legacy name kept for import path stability.)
 */

/** Class XI / XII / XIII slugs — used by extract script when merging paper metadata. */
export function isClass11To13StreamPaper(paperId) {
  const p = String(paperId || "");
  return (
    /^abquest-class-xiii-/i.test(p) ||
    /^abquest-class-xii-/i.test(p) ||
    /^abquest-class-xi-/i.test(p)
  );
}

/** Any bundled paper under public/questions/papers/abquest-class-… */
export function isAbquestBundledPaper(paperId) {
  return /^abquest-class-/i.test(String(paperId || ""));
}

/** Structured block for the instructions screen (bold labels in UI). */
export function getAbquestMarkingSchemeInstructionBlock() {
  return {
    heading: "Marking scheme",
    lines: [
      {
        label: "All sections",
        text: "Each question carries 4 marks in every section.",
      },
      {
        label: "Physics, Chemistry, Maths & Biology",
        text:
          "Negative marking applies: +4 marks for a correct answer, −1 mark for a wrong answer, and 0 marks if you do not select an answer (unattempted).",
      },
    ],
  };
}

/**
 * IGNITE (XI), FLAME (XII), BLAZE (XIII): PCM vs PCB attempt rules.
 * Timer copy stays in the main “Time” bullet above — no duplicate here.
 */
export function getIgniteFlameBlazeStreamInstructionBlock() {
  return {
    heading: "Stream — IGNITE, FLAME & BLAZE (Class XI–XIII)",
    lines: [
      {
        label: "Engineering stream",
        text: "Physics, Chemistry, and Maths are to be attempted.",
      },
      {
        label: "Medical stream",
        text: "Physics, Chemistry, and Biology are to be attempted.",
      },
    ],
  };
}
