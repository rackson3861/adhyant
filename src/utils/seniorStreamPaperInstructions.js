/**
 * Class XI / XII / XIII papers: PCM (Engineering) vs PCB (Medical) attempt rules.
 */

export function isClass11To13StreamPaper(paperId) {
  const p = String(paperId || "");
  return (
    /^abquest-class-xiii-/i.test(p) ||
    /^abquest-class-xii-/i.test(p) ||
    /^abquest-class-xi-/i.test(p)
  );
}

/** Structured block for the instructions screen (bold labels in UI). */
export function getSeniorStreamInstructionBlock(durationMinutes = 120) {
  const mins = Math.max(1, Math.min(600, Number(durationMinutes) || 120));
  return {
    heading: "Stream — which sections to attempt",
    lines: [
      {
        label: "Time",
        text: `Total duration for this online test is ${mins} minutes. The test will auto-submit when the timer ends.`,
      },
      {
        label: "Engineering stream",
        text: "Attempt Physics, Chemistry, and Maths.",
      },
      {
        label: "Medical stream",
        text: "Attempt Physics, Chemistry, and Biology.",
      },
    ],
  };
}
