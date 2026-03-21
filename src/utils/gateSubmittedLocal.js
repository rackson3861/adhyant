/**
 * Remember that this browser completed a test for a given test code + gate passcode,
 * so the gate can show the success state without relying on sessionStorage alone.
 */

const PREFIX = "adhyant_gate_submitted_v1_";

function storageKey(code, pass) {
  const c = String(code || "")
    .trim()
    .toUpperCase();
  const p = String(pass || "").trim();
  return `${PREFIX}${c}__${encodeURIComponent(p)}`;
}

export function markGatePairSubmittedLocally(code, pass) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(storageKey(code, pass), "1");
  } catch {
    /* quota / private mode */
  }
}

export function isGatePairSubmittedLocally(code, pass) {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(storageKey(code, pass)) === "1";
  } catch {
    return false;
  }
}
