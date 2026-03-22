/** Wall-clock interval between periodic recording uploads (10 minutes). */
export const CHUNK_INTERVAL_MS = 10 * 60 * 1000;

/** When timer has this many seconds left, flush current segment once so the last minute is its own clip. */
export const PRE_END_FLUSH_AT_SEC_LEFT = 60;

/** @param {number} ms */
export function epochToSafeFilePart(ms) {
  try {
    return new Date(ms).toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
  } catch {
    return String(ms);
  }
}

/** Safe segment for Drive filenames: studentName_passcode_ */
export function buildChunkUploadPrefix(studentName, gatePasscode) {
  const safe = (x) =>
    String(x ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 48) || "x";
  const a = safe(studentName) || "Student";
  const b = safe(gatePasscode) || "pass";
  return `${a}_${b}_`;
}

/**
 * @param {number} segmentStartMs
 * @param {number} segmentEndMs
 * @param {string} [filePrefix] - e.g. StudentName_passcode_
 */
export function buildChunkFileBaseNames(segmentStartMs, segmentEndMs, filePrefix = "") {
  const p = typeof filePrefix === "string" && filePrefix.trim() ? String(filePrefix).trim() : "";
  const a = epochToSafeFilePart(segmentStartMs);
  const b = epochToSafeFilePart(segmentEndMs);
  return {
    snapshotFileName: `${p}metadata_snapshot_${a}_to_${b}.json`,
    videoFileName: `${p}recording_${a}_to_${b}.webm`,
  };
}
