/**
 * Fixed display names for ABQuest class papers (admin picker + student exam header).
 * Match order: XIII → XII → XI (avoid "class-xi" matching inside "class-xii") → IX → X.
 */

export function getBundledPaperBrandTitle(paperId) {
  const id = String(paperId || "").toLowerCase();
  if (!id) return null;
  if (id.includes("class-xiii")) return "BLAZE (Class XIII)";
  if (id.includes("class-xii")) return "FLAME (Class XII)";
  if (id.includes("class-xi") && !id.includes("class-xii") && !id.includes("class-xiii")) {
    return "IGNITE (Class XI)";
  }
  if (id.includes("class-ix")) return "NASCENT (Class IX)";
  if (/\bclass-x-\d/.test(id)) return "SPARK (Class X)";
  return null;
}
