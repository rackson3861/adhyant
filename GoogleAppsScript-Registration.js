/**
 * ============================================================================
 *  ADHYANT - Google Apps Script Backend
 * ============================================================================
 *
 *  Single-file backend for Adhyant's online test platform + registration form.
 *  Deployed as a Google Apps Script Web App (doGet / doPost).
 *
 *  SECTIONS (search for "=== SECTION" to jump):
 *    1. CONFIGURATION        - IDs, emails, constants
 *    2. RESPONSE HELPERS     - JSON response builders
 *    3. STORAGE HELPERS      - Sheet / Drive access with correct getRange
 *    4. SHEET SCHEMAS        - getOrCreate for every sheet tab
 *    5. DRIVE FOLDERS        - Root folders + student subfolders
 *    6. STUDENT IDENTITY     - Email normalization, passcode helpers
 *    7. STUDENT PASSCODES    - Pool generation, claiming, validation
 *    8. TEST CODES           - Generate, validate, activate/deactivate
 *    9. TEST SESSIONS        - Start, abandon, expire stale sessions
 *   9B. TEST PROGRESS        - Cross-device resume (save/load/clear)
 *   10. SUBMISSIONS          - Metadata + video upload (single & chunked)
 *   11. QUESTION PAPERS      - CRUD + image upload + answer key merge
 *   12. FEEDBACK             - Rating + comment storage
 *   13. TEST SIGN-UPS        - Sign-up form for upcoming tests
 *   14. REGISTRATION         - Legacy registration form
 *   15. EMAIL NOTIFICATIONS  - All outbound emails
 *   16. ADMIN OPERATIONS     - Bulk delete, clear data, per-student delete
 *   17. API ROUTING          - doGet + doPost dispatchers
 *
 * ============================================================================
 */

// === SECTION 1: CONFIGURATION ===============================================

var CONFIG = {
  SPREADSHEET_ID: '1fC7EVW1Gs_y4knbuXRHO_dZ_xb6NIw37PXri-dE55Q8',
  DRIVE_LABEL_MAX_LEN: 200,
  STUDENT_GATE_PASSWORD_MIN_LEN: 4,
  STUDENT_GATE_SENTINEL: '__ADHYANT_STUDENT_GATE__',
  TIMEZONE: 'Asia/Kolkata',
  NOTIFICATION_EMAILS: [
    'sumitrairkt@gmail.com',
    'k.artiism06@gmail.com',
    'adhyantforyou@gmail.com'
  ],
  RATING_LABELS: { 1: 'Poor', 2: 'Fair', 3: 'OK', 4: 'Good', 5: 'Great' }
};


// === SECTION 2: RESPONSE HELPERS ============================================

/** Build a JSON ContentService response. */
function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonSuccess_(data) {
  if (!data) data = {};
  data.status = 'success';
  return jsonResponse_(data);
}

function jsonError_(message) {
  return jsonResponse_({ status: 'error', message: message });
}

/** Verify admin secret from request params. Returns null if OK, or an error response. */
function requireAdmin_(secret) {
  var stored = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
  if (!secret || secret !== stored) return jsonError_('Unauthorized');
  return null;
}


// === SECTION 3: STORAGE HELPERS =============================================

function openSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

/**
 * Get or create a sheet tab. Tries canonical name first, then legacy names.
 * If creating new, calls setupFn(sheet) for initial headers.
 */
function getOrCreateSheet_(canonicalName, legacyNames, setupFn) {
  var ss = openSpreadsheet_();
  var sheet = ss.getSheetByName(canonicalName);
  if (sheet) return sheet;

  for (var i = 0; i < (legacyNames || []).length; i++) {
    sheet = ss.getSheetByName(legacyNames[i]);
    if (sheet) {
      try { sheet.setName(canonicalName); } catch (_) {}
      return ss.getSheetByName(canonicalName) || sheet;
    }
  }

  sheet = ss.insertSheet(canonicalName);
  if (setupFn) setupFn(sheet);
  return sheet;
}

/**
 * Read all data rows (excluding header) from a sheet.
 * FIXES the widespread bug: getRange(2, 1, lastRow, cols) reads one extra row.
 * Correct: getRange(2, 1, lastRow - 1, cols).
 */
function getDataRows_(sheet, minCols) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var cols = Math.max(minCols || 1, sheet.getLastColumn());
  return sheet.getRange(2, 1, lastRow - 1, cols).getValues();
}

/**
 * Read a single row's values. FIXES the bug where getRange(r, 1, r, cols)
 * was used instead of getRange(r, 1, 1, cols).
 */
function getRowValues_(sheet, rowNum, minCols) {
  var cols = Math.max(minCols || 1, sheet.getLastColumn());
  return sheet.getRange(rowNum, 1, 1, cols).getValues()[0];
}

/** Format current time as IST string. */
function nowIST_(fmt) {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, fmt || 'yyyy-MM-dd HH:mm:ss');
}

/** Truncate a string for Drive names. */
function truncate_(s, maxLen) {
  var m = maxLen || CONFIG.DRIVE_LABEL_MAX_LEN;
  var t = String(s || '');
  if (t.length <= m) return t;
  return t.substring(0, Math.max(1, m - 5)) + '_TRNC';
}

/** Sanitize a string for use in Drive folder/file names. */
function sanitizeForDrive_(raw, maxChars) {
  var s = String(raw || '')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');
  if (maxChars && s.length > maxChars) s = s.substring(0, maxChars);
  return s || 'Unknown';
}


// === SECTION 4: SHEET SCHEMAS ===============================================

function getRegistrationsSheet_() {
  var sheet = getOrCreateSheet_('Adhyant_Storage_Registrations', ['Queries', 'Registrations'], function(s) {
    var headers = ['Timestamp', 'Full Name', 'Email', 'Phone', 'School', 'Course/Interest', 'Class', 'Message'];
    s.getRange(1, 1, 1, headers.length).setValues([headers]);
    var hr = s.getRange(1, 1, 1, headers.length);
    hr.setBackground('#023997').setFontColor('#FFFFFF').setFontWeight('bold')
      .setHorizontalAlignment('center').setFontSize(11);
    s.setColumnWidths(1, 8, 180);
    s.setFrozenRows(1);
  });
  if (sheet.getLastRow() === 0) {
    var headers = ['Timestamp', 'Full Name', 'Email', 'Phone', 'School', 'Course/Interest', 'Class', 'Message'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function getTestSubmissionsSheet_() {
  var headers = [
    'Timestamp', 'Student Name', 'Email', 'Aadhaar', 'Phone',
    'Score', 'Total', 'Mobile', 'Events', 'File ID',
    'File Name', 'File Size (bytes)', 'Video status', 'Upload error', 'Test code',
    'Metadata file ID', 'Submission key', 'Drive folder ID', 'Session code', 'Gate passcode',
    'Video chunk log', 'Metadata chunk log'
  ];
  var sheet = getOrCreateSheet_('Adhyant_Storage_TestSubmissions', ['TestSubmissions'], function(s) {
    s.getRange(1, 1, 1, headers.length).setValues([headers]);
    s.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  });
  // Ensure all columns exist (migration)
  for (var i = 0; i < headers.length; i++) {
    var colNum = i + 1;
    if (sheet.getLastColumn() < colNum || !String(sheet.getRange(1, colNum).getValue() || '').trim()) {
      sheet.getRange(1, colNum).setValue(headers[i]).setFontWeight('bold');
    }
  }
  return sheet;
}

function getTestSessionsSheet_() {
  var headers = ['Code', 'Email', 'Name', 'StartedAt', 'Status', 'SecondaryCode', 'Class', 'SessionToken', 'StudentResumePassword', 'GatePasscode'];
  var sheet = getOrCreateSheet_('Adhyant_Storage_TestSessions', ['TestSessions'], function(s) {
    s.getRange(1, 1, 1, headers.length).setValues([headers]);
    s.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  });
  for (var i = 0; i < headers.length; i++) {
    var colNum = i + 1;
    if (sheet.getLastColumn() < colNum || !String(sheet.getRange(1, colNum).getValue() || '').trim()) {
      sheet.getRange(1, colNum).setValue(headers[i]).setFontWeight('bold');
    }
  }
  return sheet;
}

function getTestCodesSheet_() {
  var headers = ['Code', 'CreatedAt', 'CreatedBy', 'QuestionPaperId', 'Started', 'Active', 'AccessPassword', 'StudentPasscodeQuota'];
  var sheet = getOrCreateSheet_('Adhyant_Storage_TestCodes', ['TestCodes'], function(s) {
    s.getRange(1, 1, 1, headers.length).setValues([headers]);
    s.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  });
  for (var i = 0; i < headers.length; i++) {
    var colNum = i + 1;
    if (sheet.getLastColumn() < colNum || !String(sheet.getRange(1, colNum).getValue() || '').trim()) {
      sheet.getRange(1, colNum).setValue(headers[i]).setFontWeight('bold');
    }
  }
  return sheet;
}

function getResumeCodesSheet_() {
  return getOrCreateSheet_('Adhyant_Storage_ResumeCodes', ['ResumeCodes'], function(s) {
    s.getRange(1, 1, 1, 2).setValues([['SecondaryCode', 'PrimaryCode']]);
    s.getRange(1, 1, 1, 2).setFontWeight('bold');
  });
}

function getQuestionPapersSheet_() {
  var headers = ['Id', 'Name', 'CreatedAt', 'CreatedBy', 'QuestionsJson', 'DurationMinutes', 'PaperMetaJson', 'AnswerKeyPresent'];
  var sheet = getOrCreateSheet_('Adhyant_Storage_QuestionPapers', ['QuestionPapers'], function(s) {
    s.getRange(1, 1, 1, headers.length).setValues([headers]);
    s.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  });
  for (var i = 0; i < headers.length; i++) {
    var colNum = i + 1;
    if (sheet.getLastColumn() < colNum || !String(sheet.getRange(1, colNum).getValue() || '').trim()) {
      sheet.getRange(1, colNum).setValue(headers[i]).setFontWeight('bold');
    }
  }
  return sheet;
}

function getFeedbackSheet_() {
  var headers = ['Timestamp', 'Rating', 'RatingLabel', 'Comment', 'Student Name', 'Student Email', 'Student Phone', 'Class', 'Drive status'];
  var sheet = getOrCreateSheet_('Adhyant_Storage_TestFeedbackRows', ['Feedback'], function(s) {
    s.getRange(1, 1, 1, headers.length).setValues([headers]);
    s.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  });
  // Migration: old 8-col layout had Drive status at col 8; insert Class before it
  if (sheet.getLastColumn() === 8) {
    var h8 = String(sheet.getRange(1, 8).getValue() || '').trim();
    if (h8 === 'Drive status') {
      sheet.insertColumnBefore(8);
      sheet.getRange(1, 8).setValue('Class').setFontWeight('bold');
    }
  }
  for (var i = 0; i < headers.length; i++) {
    if (sheet.getLastColumn() < (i + 1)) {
      sheet.getRange(1, i + 1).setValue(headers[i]).setFontWeight('bold');
    }
  }
  return sheet;
}

function getTestSignUpsSheet_() {
  var headers = ['Timestamp', 'Full Name', 'Email', 'Phone', 'Class', 'Test Type', 'Test Date', 'Message'];
  var sheet = getOrCreateSheet_('Adhyant_Storage_TestSignUps', ['TestSignUps'], function(s) {
    s.getRange(1, 1, 1, headers.length).setValues([headers]);
    s.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  });
  // Migration: old 7-col layout had Test Type at col 5; insert Class before it
  var lc = sheet.getLastColumn();
  if (lc === 7 && String(sheet.getRange(1, 5).getValue() || '').trim() === 'Test Type') {
    sheet.insertColumnBefore(5);
    sheet.getRange(1, 5).setValue('Class').setFontWeight('bold');
  }
  return sheet;
}

function getStudentPasscodesSheet_() {
  return getOrCreateSheet_('Adhyant_Storage_TestCodeStudentPasscodes', ['TestCodeStudentPasscodes'], function(s) {
    s.getRange(1, 1, 1, 3).setValues([['TestCode', 'Passcode', 'ClaimedEmail']]);
    s.getRange(1, 1, 1, 3).setFontWeight('bold');
  });
}

function getTestProgressSheet_() {
  var headers = ['TestCode', 'GatePasscode', 'Email', 'SavedAt', 'ProgressJson'];
  return getOrCreateSheet_('Adhyant_Storage_TestProgress', ['TestProgress'], function(s) {
    s.getRange(1, 1, 1, headers.length).setValues([headers]);
    s.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  });
}


// === SECTION 5: DRIVE FOLDERS ===============================================

function getDriveFolder_(preferredName, legacyNames) {
  var it = DriveApp.getFoldersByName(preferredName);
  if (it.hasNext()) return it.next();
  for (var j = 0; j < (legacyNames || []).length; j++) {
    it = DriveApp.getFoldersByName(legacyNames[j]);
    if (it.hasNext()) {
      var f = it.next();
      try { f.setName(preferredName); } catch (_) {}
      return f;
    }
  }
  return DriveApp.createFolder(preferredName);
}

function getChildFolder_(parent, name) {
  var n = truncate_(name);
  var it = parent.getFoldersByName(n);
  if (it.hasNext()) return it.next();
  return parent.createFolder(n);
}

function getOnlineTestUploadsRoot_() {
  return getDriveFolder_('Adhyant_Storage_OnlineTest_Uploads', ['Adhyant_OnlineTest_Uploads']);
}

function getLegacyZipRoot_() {
  return getDriveFolder_('Adhyant_Storage_LegacyZipSubmissions', ['Adhyant_Test_Submissions']);
}

function getQuestionPaperImagesRoot_() {
  return getDriveFolder_('Adhyant_Storage_QuestionPaperImages', ['Adhyant_QuestionPaperImages']);
}

function getFeedbackRoot_() {
  return getDriveFolder_('Adhyant_Storage_TestFeedback', ['Adhyant_Test_Feedback']);
}


// === SECTION 6: STUDENT IDENTITY ============================================

/** Student tag for Drive paths: Student_<Name>_Mob<phone>. */
function studentTag_(nameOrMeta, phone) {
  var name, ph;
  if (typeof nameOrMeta === 'object' && nameOrMeta !== null) {
    name = (nameOrMeta.studentName || 'Unknown');
    ph = (nameOrMeta.studentPhone || '');
  } else {
    name = nameOrMeta || 'Unknown';
    ph = phone || '';
  }
  var safeName = sanitizeForDrive_(name, 40);
  var digits = String(ph).replace(/\D/g, '').substring(0, 15) || 'NoMobile';
  return truncate_('Student_' + safeName + '_Mob' + digits, 90);
}

/** Normalize email to lowercase. */
function normalizeEmail_(raw) {
  return String(raw || '').trim().toLowerCase();
}

/** Basic email shape check. */
function isPlausibleEmail_(e) {
  if (!e || e.length < 5 || e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** Stored in "Session code" column: email (lowercase) or legacy uppercase token. */
function normalizeStudentKey_(raw) {
  var s = String(raw || '').trim();
  if (s.indexOf('@') >= 0) return normalizeEmail_(s);
  return s.toUpperCase();
}

/** Extract gate passcode from metadata object. */
function gatePasscodeFromMeta_(meta) {
  var m = meta || {};
  return String(m.gatePasscode || m.gatePassword || '').trim();
}


// === SECTION 7: STUDENT PASSCODES ===========================================

function normalizePasscode_(raw) {
  return String(raw || '').trim().toUpperCase();
}

/** Get passcode quota from a TestCodes row (col H / index 7). */
function getPasscodeQuota_(row) {
  if (!row || row.length < 8) return 0;
  var q = parseInt(String(row[7] != null ? row[7] : '0'), 10);
  return (isNaN(q) || q < 0) ? 0 : q;
}

/** Get passcode quota for a test code by looking it up. */
function getPasscodeQuotaForCode_(testCode) {
  var code = String(testCode || '').trim().toUpperCase();
  if (!code) return 0;
  var rows = getDataRows_(getTestCodesSheet_(), 8);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toUpperCase() === code) {
      return getPasscodeQuota_(rows[i]);
    }
  }
  return 0;
}

/** Count distinct active (non-abandoned) student emails for a test code. */
function countActiveStudents_(testCode) {
  var code = String(testCode || '').trim().toUpperCase();
  if (!code) return 0;
  var rows = getDataRows_(getTestSessionsSheet_(), 5);
  var emails = {};
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toUpperCase() !== code) continue;
    var st = String(rows[i][4] || '').trim().toLowerCase();
    if (st === 'abandoned') continue;
    var em = normalizeEmail_(rows[i][1]);
    if (em) emails[em] = true;
  }
  var n = 0;
  for (var k in emails) { if (emails.hasOwnProperty(k)) n++; }
  return n;
}

/** Generate unique 8-char passcodes. */
function generatePasscodes_(count) {
  var n = parseInt(count, 10);
  if (!n || n < 1) return [];
  var existing = {};
  var sheet = getStudentPasscodesSheet_();
  var rows = getDataRows_(sheet, 2);
  for (var i = 0; i < rows.length; i++) {
    var p = normalizePasscode_(rows[i][1]);
    if (p) existing[p] = true;
  }
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var out = [];
  var safety = 0;
  while (out.length < n && safety < n * 200) {
    safety++;
    var s = '';
    for (var j = 0; j < 8; j++) {
      s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (!existing[s]) {
      existing[s] = true;
      out.push(s);
    }
  }
  return out;
}

/** Store generated passcodes for a test code. */
function appendPasscodes_(primaryCode, passcodes) {
  var code = String(primaryCode || '').trim().toUpperCase();
  if (!code || !passcodes || !passcodes.length) return;
  var sheet = getStudentPasscodesSheet_();
  for (var i = 0; i < passcodes.length; i++) {
    sheet.appendRow([code, String(passcodes[i]).trim().toUpperCase(), '']);
  }
}

/** Check if a passcode exists in the pool for a test. */
function isPasscodeInPool_(primaryCode, passcode) {
  var code = String(primaryCode || '').trim().toUpperCase();
  var p = normalizePasscode_(passcode);
  if (!code || !p) return false;
  var rows = getDataRows_(getStudentPasscodesSheet_(), 2);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toUpperCase() === code &&
        normalizePasscode_(rows[i][1]) === p) {
      return true;
    }
  }
  return false;
}

/**
 * Claim a passcode for an email. Returns { ok, message }.
 * - If unclaimed: claims it
 * - If already claimed by same email: OK
 * - If claimed by different email: error
 */
function claimPasscode_(primaryCode, passcode, email) {
  var code = String(primaryCode || '').trim().toUpperCase();
  var p = normalizePasscode_(passcode);
  var em = normalizeEmail_(email);
  if (!code || !p || !em) return { ok: false, message: 'Missing passcode or email' };

  var sheet = getStudentPasscodesSheet_();
  var rows = getDataRows_(sheet, 3);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toUpperCase() !== code) continue;
    if (normalizePasscode_(rows[i][1]) !== p) continue;
    var claimed = normalizeEmail_(rows[i][2]);
    if (!claimed) {
      sheet.getRange(i + 2, 3).setValue(em);
      SpreadsheetApp.flush();
      return { ok: true };
    }
    if (claimed === em) return { ok: true };
    return { ok: false, message: 'This passcode is already linked to another student.' };
  }
  return { ok: false, message: 'Invalid passcode for this test' };
}

/** Release a passcode claim (clear the email). */
function releasePasscode_(primaryCode, passcode) {
  var code = String(primaryCode || '').trim().toUpperCase();
  var p = normalizePasscode_(passcode);
  if (!code || !p) return;
  var sheet = getStudentPasscodesSheet_();
  var rows = getDataRows_(sheet, 3);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toUpperCase() === code &&
        normalizePasscode_(rows[i][1]) === p) {
      sheet.getRange(i + 2, 3).setValue('');
      SpreadsheetApp.flush();
      return;
    }
  }
}

/** Clear all claims for a test code's passcodes. */
function clearAllPasscodeClaims_(primaryCode) {
  var want = String(primaryCode || '').trim().toUpperCase();
  if (!want) return 0;
  var sheet = getStudentPasscodesSheet_();
  var rows = getDataRows_(sheet, 3);
  var cleared = 0;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toUpperCase() !== want) continue;
    if (String(rows[i][2] || '').trim()) {
      sheet.getRange(i + 2, 3).setValue('');
      cleared++;
    }
  }
  if (cleared) SpreadsheetApp.flush();
  return cleared;
}

/** Delete all passcode rows for a test code. */
function deletePasscodesForCode_(primaryCode) {
  var want = String(primaryCode || '').trim().toUpperCase();
  if (!want) return 0;
  var sheet = getStudentPasscodesSheet_();
  var rows = getDataRows_(sheet, 1);
  var toDelete = [];
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][0] || '').trim().toUpperCase() === want) {
      toDelete.push(i + 2);
    }
  }
  for (var j = 0; j < toDelete.length; j++) {
    sheet.deleteRow(toDelete[j]);
  }
  return toDelete.length;
}

/** Load passcode details grouped by primary code. */
function loadPasscodesByPrimary_() {
  var sheet = getStudentPasscodesSheet_();
  var rows = getDataRows_(sheet, 3);
  var by = {};
  for (var i = 0; i < rows.length; i++) {
    var tc = String(rows[i][0] || '').trim().toUpperCase();
    var pc = String(rows[i][1] || '').trim();
    var em = normalizeEmail_(rows[i][2]);
    if (!tc || !pc) continue;
    if (!by[tc]) by[tc] = [];
    by[tc].push({ passcode: pc, claimedByEmail: em || null });
  }
  return by;
}


// === SECTION 8: TEST CODES ==================================================

/** Generate a random test code: 3 letters + 6 digits. */
function randomTestCode_() {
  var letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  var prefix = '';
  for (var i = 0; i < 3; i++) {
    prefix += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return prefix + String(Math.floor(100000 + Math.random() * 900000));
}

/** Random 8-char access password. */
function randomPassword_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var s = '';
  for (var i = 0; i < 8; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

/** Is this a student-chosen gate mode (no org password)? */
function isStudentGateMode_(accessPassRow) {
  var ap = String(accessPassRow || '').trim();
  return !ap || ap === CONFIG.STUDENT_GATE_SENTINEL;
}

/** Parse the Active flag from a TestCodes row (col F / index 5). Default: active. */
function isCodeActive_(row) {
  var cell = row.length >= 6 ? row[5] : null;
  var v = String(cell != null && cell !== '' ? cell : '').trim().toLowerCase();
  return !(v === 'no' || v === 'false' || v === '0' || v === 'inactive' || v === 'off');
}

/** Resume codes: secondary → primary mapping. */
function loadResumeCodesByPrimary_() {
  var sheet = getResumeCodesSheet_();
  var rows = getDataRows_(sheet, 2);
  var by = {};
  for (var i = 0; i < rows.length; i++) {
    var sec = String(rows[i][0] || '').trim().toUpperCase();
    var prim = String(rows[i][1] || '').trim().toUpperCase();
    if (!prim || !sec) continue;
    if (!by[prim]) by[prim] = [];
    by[prim].push(sec);
  }
  return by;
}

function randomResumeCode_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var s = '';
  for (var i = 0; i < 10; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

/** Get exam duration in minutes for a question paper by ID. Default 120. */
function getPaperDuration_(paperId) {
  var want = String(paperId || '').trim();
  if (!want) return 120;
  var rows = getDataRows_(getQuestionPapersSheet_(), 8);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === want) {
      var n = Number(rows[i][5]);
      if (!isNaN(n) && n > 0) return Math.min(600, n);
      return 120;
    }
  }
  return 120;
}

/** Get exam duration by primary test code (follows TestCodes → paper). */
function getCodeDuration_(testCode) {
  var code = String(testCode || '').trim().toUpperCase();
  if (!code) return 120;
  var rows = getDataRows_(getTestCodesSheet_(), 8);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toUpperCase() === code) {
      var paperId = rows[i].length >= 4 ? String(rows[i][3] || '').trim() : '';
      return getPaperDuration_(paperId);
    }
  }
  return 120;
}


// === SECTION 9: TEST SESSIONS ===============================================

function newSessionToken_() {
  return Utilities.getUuid().replace(/-/g, '');
}

/** Find a test session row by code + email. Returns { row, status, sessionToken }. */
function findSessionRow_(code, email) {
  var wantCode = String(code || '').trim().toUpperCase();
  var wantEmail = normalizeEmail_(email);
  var rows = getDataRows_(getTestSessionsSheet_(), 10);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toUpperCase() === wantCode &&
        normalizeEmail_(rows[i][1]) === wantEmail) {
      return {
        row: i + 2,
        status: String(rows[i][4] || '').trim().toLowerCase(),
        sessionToken: String(rows[i][7] || '').trim()
      };
    }
  }
  return { row: -1, status: '', sessionToken: '' };
}

/**
 * Parse a StartedAt value to epoch millis.
 * Handles both Date objects and IST-formatted strings.
 */
function parseStartedAt_(raw) {
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw.getTime();
  var s = String(raw || '').trim();
  if (!s) return NaN;
  try {
    return Utilities.parseDate(s, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss').getTime();
  } catch (_) {
    return NaN;
  }
}

/**
 * Mark stale in_progress sessions as timed_out.
 * A session is stale if: now - startedAt > (examDuration + 45min grace).
 */
function expireStaleSessions_(testCode) {
  var code = String(testCode || '').trim().toUpperCase();
  if (!code) return 0;
  var limitMs = (getCodeDuration_(code) + 45) * 60 * 1000;
  var now = Date.now();
  var sheet = getTestSessionsSheet_();
  var rows = getDataRows_(sheet, 10);
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim().toUpperCase() !== code) continue;
    if (String(rows[i][4] || '').trim().toLowerCase() !== 'in_progress') continue;
    var startMs = parseStartedAt_(rows[i][3]);
    if (isNaN(startMs) || now - startMs <= limitMs) continue;
    sheet.getRange(i + 2, 5).setValue('timed_out');
    n++;
  }
  if (n > 0) SpreadsheetApp.flush();
  return n;
}

/**
 * Record a test start. Creates or updates a TestSessions row.
 * Called from both doGet and doPost (single implementation - no more duplication).
 */
function recordTestStart_(params) {
  try {
    var code = String(params.code || '').trim().toUpperCase();
    var email = String(params.email || '').trim();
    var name = String(params.name || '').trim();
    var secStart = normalizeEmail_(params.secondaryCode || params.studentGateEmail || params.email || '');
    var studentClass = String(params.studentClass || params.class || '').trim();
    var resumePass = String(params.resumePassword || params.studentResumePassword || '').trim().slice(0, 80);
    var gatePcRaw = String(params.gatePasscode || params.gatePassword || '').trim();

    if (!code) return jsonError_('Code required');

    var quota = getPasscodeQuotaForCode_(code);
    var gateForSession = gatePcRaw;

    if (quota > 0) {
      // Passcode-gated test: student must provide a passcode >= min length
      if (gatePcRaw.length < CONFIG.STUDENT_GATE_PASSWORD_MIN_LEN) {
        return jsonError_('Choose a passcode with at least ' + CONFIG.STUDENT_GATE_PASSWORD_MIN_LEN + ' characters.');
      }
    } else if (isStudentGateMode_(null)) {
      // Student-chosen gate mode without pool
      if (gatePcRaw.length < CONFIG.STUDENT_GATE_PASSWORD_MIN_LEN) {
        return jsonError_('Choose a passcode with at least ' + CONFIG.STUDENT_GATE_PASSWORD_MIN_LEN + ' characters.');
      }
    }

    // Mirror gate passcode as resume password when not separately provided
    if (!resumePass && gateForSession) {
      resumePass = gateForSession.slice(0, 80);
    }

    var sheet = getTestSessionsSheet_();
    var startedAt = nowIST_();
    var rows = getDataRows_(sheet, 10);

    // Check for existing session for this code + email
    for (var si = 0; si < rows.length; si++) {
      if (String(rows[si][0]).trim().toUpperCase() !== code) continue;
      if (normalizeEmail_(rows[si][1]) !== normalizeEmail_(email)) continue;

      var rowNum = si + 2;
      var rowTok = String(rows[si][7] || '').trim();
      var prevStatus = String(rows[si][4] || '').trim().toLowerCase();

      // Generate new token if abandoned or missing
      if (prevStatus === 'abandoned' || !rowTok) {
        rowTok = newSessionToken_();
        sheet.getRange(rowNum, 8).setValue(rowTok);
      }
      sheet.getRange(rowNum, 3).setValue(name);

      // Don't reset StartedAt for reconnecting in-progress students (preserves fair duration)
      var existingStarted = String(rows[si][3] || '').trim();
      if (prevStatus !== 'in_progress' || !existingStarted) {
        sheet.getRange(rowNum, 4).setValue(startedAt);
      }
      sheet.getRange(rowNum, 5).setValue('in_progress');
      sheet.getRange(rowNum, 6).setValue(secStart);
      if (studentClass) sheet.getRange(rowNum, 7).setValue(studentClass);
      if (resumePass) sheet.getRange(rowNum, 9).setValue(resumePass);
      if (gateForSession) sheet.getRange(rowNum, 10).setValue(gateForSession);
      SpreadsheetApp.flush();
      return jsonSuccess_({ message: 'Test start recorded', sessionToken: rowTok });
    }

    // New session - check quota
    if (quota > 0 && countActiveStudents_(code) >= quota) {
      return jsonError_('Maximum number of students for this test has been reached. Contact the organiser if you need access.');
    }

    var newTok = newSessionToken_();
    sheet.appendRow([code, email, name, startedAt, 'in_progress', secStart, studentClass, newTok, resumePass, gateForSession || '']);
    SpreadsheetApp.flush();
    return jsonSuccess_({ message: 'Test start recorded', sessionToken: newTok });
  } catch (err) {
    return jsonError_(err.toString());
  }
}


// === SECTION 9B: TEST PROGRESS (cross-device resume) ========================

/**
 * Save in-progress test state so the student can resume on another device.
 * Key: testCode + gatePasscode + email (lowercase).
 * Payload is a JSON blob stored in a single cell.
 */
function handleSaveProgress_(p) {
  var code = String(p.code || '').trim().toUpperCase();
  var gatePc = String(p.gatePasscode || '').trim();
  var email = normalizeEmail_(p.email || '');
  if (!code || !gatePc || !email) return jsonError_('code, gatePasscode and email are required');

  var progressJson = String(p.progress || '');
  if (!progressJson || progressJson.length < 2) return jsonError_('progress payload required');
  // Sanity: must be valid JSON and cap at 500KB
  try { JSON.parse(progressJson); } catch (_) { return jsonError_('progress must be valid JSON'); }
  if (progressJson.length > 500000) return jsonError_('progress payload too large');

  var sheet = getTestProgressSheet_();
  var rows = getDataRows_(sheet, 5);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toUpperCase() !== code) continue;
    if (String(rows[i][1]).trim() !== gatePc) continue;
    if (normalizeEmail_(rows[i][2]) !== email) continue;
    // Update existing row
    var rowNum = i + 2;
    sheet.getRange(rowNum, 4).setValue(new Date().toISOString());
    sheet.getRange(rowNum, 5).setValue(progressJson);
    SpreadsheetApp.flush();
    return jsonSuccess_({ message: 'Progress saved' });
  }
  // New row
  sheet.appendRow([code, gatePc, email, new Date().toISOString(), progressJson]);
  SpreadsheetApp.flush();
  return jsonSuccess_({ message: 'Progress saved' });
}

/**
 * Load saved progress for cross-device resume.
 * Returns the progress JSON or null if no snapshot exists.
 */
function handleLoadProgress_(p) {
  var code = String(p.code || '').trim().toUpperCase();
  var gatePc = String(p.gatePasscode || '').trim();
  var email = normalizeEmail_(p.email || '');
  if (!code || !gatePc || !email) return jsonError_('code, gatePasscode and email are required');

  var rows = getDataRows_(getTestProgressSheet_(), 5);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toUpperCase() !== code) continue;
    if (String(rows[i][1]).trim() !== gatePc) continue;
    if (normalizeEmail_(rows[i][2]) !== email) continue;
    var raw = String(rows[i][4] || '').trim();
    if (!raw) return jsonSuccess_({ progress: null });
    try {
      var data = JSON.parse(raw);
      // Reject expired snapshots (48h)
      if (data.savedAt && Date.now() - data.savedAt > 48 * 60 * 60 * 1000) {
        return jsonSuccess_({ progress: null });
      }
      // Reject if timeLeft expired
      if (typeof data.timeLeft === 'number' && data.timeLeft <= 0) {
        return jsonSuccess_({ progress: null });
      }
      return jsonSuccess_({ progress: data });
    } catch (_) {
      return jsonSuccess_({ progress: null });
    }
  }
  return jsonSuccess_({ progress: null });
}

/**
 * Clear saved progress (called after final submission).
 */
function handleClearProgress_(p) {
  var code = String(p.code || '').trim().toUpperCase();
  var gatePc = String(p.gatePasscode || '').trim();
  var email = normalizeEmail_(p.email || '');
  if (!code || !gatePc || !email) return jsonError_('code, gatePasscode and email are required');

  var sheet = getTestProgressSheet_();
  var rows = getDataRows_(sheet, 5);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][0]).trim().toUpperCase() !== code) continue;
    if (String(rows[i][1]).trim() !== gatePc) continue;
    if (normalizeEmail_(rows[i][2]) !== email) continue;
    sheet.deleteRow(i + 2);
    SpreadsheetApp.flush();
    return jsonSuccess_({ message: 'Progress cleared' });
  }
  return jsonSuccess_({ message: 'No progress found' });
}


// === SECTION 10: SUBMISSIONS ================================================

/** Score display: numeric score, or message, or empty. */
function scoreDisplay_(meta) {
  var m = meta || {};
  if (m.score != null && m.score !== '') return m.score;
  return String(m.scoreMessage || '').trim();
}

/** Build a session folder label for Drive. */
function sessionFolderLabel_(meta, submissionKey) {
  var tag = studentTag_(meta);
  var date = nowIST_('yyyy-MM-dd');
  var tc = String((meta && meta.testCode) || '').trim().toUpperCase() || 'NoCode';
  var keyShort = String(submissionKey || '').substring(0, 8);
  return truncate_(tag + '__Date_' + date + '__Test_' + tc + '__Key_' + keyShort);
}

/** Find a submission row by submission key (col Q / index 16). */
function findSubmissionRow_(submissionKey) {
  var k = String(submissionKey || '').trim();
  if (!k) return -1;
  var rows = getDataRows_(getTestSubmissionsSheet_(), 20);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][16] || '').trim() === k) return i + 2;
  }
  return -1;
}

/** Mark a test session as submitted (from chunked upload). */
function markSessionSubmitted_(testCode, studentEmail) {
  try {
    var code = String(testCode || '').trim().toUpperCase();
    var em = normalizeEmail_(studentEmail);
    if (!code || !em) return;
    var sheet = getTestSessionsSheet_();
    var rows = getDataRows_(sheet, 5);
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toUpperCase() === code &&
          normalizeEmail_(rows[i][1]) === em) {
        sheet.getRange(i + 2, 5).setValue('submitted');
        break;
      }
    }
  } catch (_) {}
}

/** Check if a submission exists for test code + student key (email or legacy code). */
function submissionExists_(testCode, studentKey) {
  var code = String(testCode || '').trim().toUpperCase();
  var raw = String(studentKey || '').trim();
  if (!code || !raw) return false;
  var keyNorm = raw.indexOf('@') >= 0 ? normalizeEmail_(raw) : raw.toUpperCase();
  var rows = getDataRows_(getTestSubmissionsSheet_(), 20);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][14] || '').trim().toUpperCase() !== code) continue;
    var cellKey = String(rows[i][18] || '').trim();
    var rowNorm = cellKey.indexOf('@') >= 0 ? normalizeEmail_(cellKey) : cellKey.toUpperCase();
    if (rowNorm !== keyNorm) continue;
    var st = String(rows[i][12] || '').trim().toLowerCase();
    if (st === 'failed' || st.indexOf('video_failed') === 0 || st.indexOf('retry') === 0) continue;
    if (st === 'uploaded' || st === 'metadata_uploaded' || st === 'pending' || st === 'chunked_open' || st === 'chunked_partial') return true;
  }
  return false;
}

/** Check if a submission exists for test code + gate passcode. */
function submissionExistsByPasscode_(testCode, gatePasscode) {
  var code = String(testCode || '').trim().toUpperCase();
  var gate = String(gatePasscode || '').trim();
  if (!code || !gate) return false;
  var rows = getDataRows_(getTestSubmissionsSheet_(), 20);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][14] || '').trim().toUpperCase() !== code) continue;
    var cellGate = rows[i].length >= 20 ? String(rows[i][19] || '').trim() : '';
    if (cellGate !== gate) continue;
    var st = String(rows[i][12] || '').trim().toLowerCase();
    if (st === 'failed' || st.indexOf('video_failed') === 0 || st.indexOf('retry') === 0) continue;
    if (st === 'uploaded' || st === 'metadata_uploaded' || st === 'pending') return true;
  }
  return false;
}

/** Append a line to the video chunk log (col 21). */
function appendVideoChunkLog_(sheet, rowNum, segIdx, fileName, isFinal) {
  if (!sheet || rowNum < 2) return;
  var at = nowIST_();
  var segN = (segIdx != null && !isNaN(Number(segIdx))) ? (Number(segIdx) + 1) : '?';
  var line = 'Seg ' + segN + ': ' + String(fileName || '').slice(0, 150) + ' @ ' + at + (isFinal ? ' [final]' : ' [partial]');
  var cur = String(sheet.getRange(rowNum, 21).getValue() || '').trim();
  var next = cur ? (cur + '\n' + line) : line;
  if (next.length > 48000) next = '...(truncated)...\n' + next.slice(next.length - 47000);
  sheet.getRange(rowNum, 21).setValue(next);
}

/** Append a line to the metadata chunk log (col 22). */
function appendMetaChunkLog_(sheet, rowNum, segIdx, fileName, isFinal) {
  if (!sheet || rowNum < 2) return;
  var at = nowIST_();
  var segN = (segIdx != null && !isNaN(Number(segIdx))) ? (Number(segIdx) + 1) : '?';
  var line = 'Meta seg ' + segN + ': ' + String(fileName || '').slice(0, 150) + ' @ ' + at + (isFinal ? ' [final]' : ' [partial]');
  var cur = String(sheet.getRange(rowNum, 22).getValue() || '').trim();
  var next = cur ? (cur + '\n' + line) : line;
  if (next.length > 48000) next = '...(truncated)...\n' + next.slice(next.length - 47000);
  sheet.getRange(rowNum, 22).setValue(next);
}

/** Parse chunk log text into summary objects for admin UI. */
function chunkLogSummary_(videoLog, metaLog) {
  var vLines = videoLog ? String(videoLog).split('\n').filter(function(l) { return l.trim(); }) : [];
  var mLines = metaLog ? String(metaLog).split('\n').filter(function(l) { return l.trim(); }) : [];
  return {
    videoChunkLog: videoLog || null,
    metadataChunkLog: metaLog || null,
    chunkSegmentCount: vLines.length,
    metadataChunkCount: mLines.length,
    chunkSummary: vLines.length ? vLines.length + ' video chunk(s); latest: ' + vLines[vLines.length - 1].slice(0, 160) : null,
    metadataChunkSummary: mLines.length ? mLines.length + ' metadata snapshot(s); latest: ' + mLines[mLines.length - 1].slice(0, 160) : null
  };
}

/** Standard submission row for appendRow. */
function buildSubmissionRow_(timestamp, meta, fileId, fileName, fileSize, videoStatus, uploadError, testCode, metaFileId, submissionKey, folderId) {
  var secMeta = normalizeStudentKey_(meta.secondaryCode || '');
  var gateMeta = gatePasscodeFromMeta_(meta);
  return [
    timestamp,
    meta.studentName || '',
    meta.studentEmail || '',
    meta.studentAdhar || '',
    meta.studentPhone || '',
    scoreDisplay_(meta),
    meta.totalQuestions != null ? meta.totalQuestions : '',
    meta.isMobile === true ? 'Yes' : 'No',
    meta.events ? JSON.stringify(meta.events) : '',
    fileId || '',
    fileName || '',
    fileSize || '',
    videoStatus || 'pending',
    uploadError || '',
    testCode || '',
    metaFileId || '',
    submissionKey || '',
    folderId || '',
    secMeta,
    gateMeta
  ];
}

/** Upload a blob to a folder with up to 3 retries. Returns { file, error }. */
function uploadWithRetry_(folder, blob, sheet, rowNum, statusCol) {
  var file = null;
  var lastError = null;
  for (var attempt = 1; attempt <= 4; attempt++) {
    if (attempt > 1 && sheet && rowNum && statusCol) {
      sheet.getRange(rowNum, statusCol).setValue('retry_' + (attempt - 1));
    }
    try {
      file = folder.createFile(blob);
      break;
    } catch (e) {
      lastError = e;
    }
  }
  return { file: file, error: lastError };
}


// ---------- Submission handlers ----------

/** Step 1: Save metadata JSON to Drive, create/update sheet row. */
function handleSubmitMetadata_(data) {
  try {
    var meta = data.metadata || {};
    if (meta.chunkedUpload === true) {
      return handleChunkedMetadata_(data);
    }

    var submissionKey = String(data.submissionKey || '').trim() || Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    var timestamp = nowIST_('yyyy-MM-dd_HH-mm-ss');
    var testCode = String(meta.testCode || '').trim().toUpperCase();

    // Create Drive folder structure
    var root = getOnlineTestUploadsRoot_();
    var studentFolder = getChildFolder_(root, studentTag_(meta));
    var sessionFolder = getChildFolder_(studentFolder, sessionFolderLabel_(meta, submissionKey));

    // Save metadata JSON
    var metaBlob = Utilities.newBlob(JSON.stringify(meta, null, 2), 'application/json',
      truncate_(studentTag_(meta) + '_submission_metadata.json'));
    var metaFile = sessionFolder.createFile(metaBlob);

    // Append sheet row
    var sheet = getTestSubmissionsSheet_();
    var row = buildSubmissionRow_(timestamp, meta, '', truncate_(studentTag_(meta) + '_recording.webm'), '',
      'metadata_uploaded', '', testCode, metaFile.getId(), submissionKey, sessionFolder.getId());
    sheet.appendRow(row);

    // Mark session as submitted
    markSessionSubmitted_(testCode, meta.studentEmail);

    // Notify admins
    notifyMetadata_(meta, submissionKey, sessionFolder.getId(), metaFile.getId());

    return jsonSuccess_({
      message: 'Metadata saved',
      submissionKey: submissionKey,
      metadataFileId: metaFile.getId(),
      folderId: sessionFolder.getId()
    });
  } catch (err) {
    return jsonError_(err.toString());
  }
}

/** Step 2: Save video recording to the same session folder. */
function handleSubmitVideo_(data) {
  try {
    var submissionKey = String(data.submissionKey || '').trim();
    var videoBase64 = data.videoBase64;
    if (!submissionKey || !videoBase64) return jsonError_('submissionKey and videoBase64 required');

    var metaMin = data.metadata || {};
    var isChunked = data.chunkedUpload === true;
    var isLastChunk = data.isLastChunk === true;
    var videoBytes = Utilities.base64Decode(videoBase64);
    var nameFromClient = String(data.videoFileName || '').trim();
    if (nameFromClient.indexOf('/') >= 0 || nameFromClient.indexOf('\\') >= 0) nameFromClient = '';
    var recName = nameFromClient ? truncate_(nameFromClient) : truncate_(studentTag_(metaMin) + '_recording.webm');
    var videoBlob = Utilities.newBlob(videoBytes, 'video/webm', recName);

    var sheet = getTestSubmissionsSheet_();
    var rowNum = findSubmissionRow_(submissionKey);
    var folder = null;

    // Try to find existing session folder
    if (rowNum > 0) {
      var folderId = String(sheet.getRange(rowNum, 18).getValue() || '').trim();
      if (folderId) {
        try { folder = DriveApp.getFolderById(folderId); } catch (_) {}
      }
    }

    // Fallback: create orphan folder
    if (!folder) {
      var root = getOnlineTestUploadsRoot_();
      var stuFolder = getChildFolder_(root, studentTag_(metaMin));
      folder = getChildFolder_(stuFolder, truncate_(studentTag_(metaMin) + '__VideoOrphan__Key_' + submissionKey.substring(0, 8)));
    }

    // Upload with retries
    var result = uploadWithRetry_(folder, videoBlob, sheet, rowNum, 13);
    if (!result.file) {
      if (rowNum > 0) {
        sheet.getRange(rowNum, 13).setValue('video_failed');
        sheet.getRange(rowNum, 14).setValue(result.error ? result.error.toString() : 'Video upload failed');
      }
      return jsonError_(result.error ? result.error.toString() : 'Video upload failed');
    }

    var fileId = result.file.getId();
    var fileSize = result.file.getSize ? result.file.getSize() : 0;

    if (rowNum > 0) {
      sheet.getRange(rowNum, 10).setValue(fileId);
      sheet.getRange(rowNum, 11).setValue(recName);
      sheet.getRange(rowNum, 12).setValue(fileSize);
      sheet.getRange(rowNum, 13).setValue(isChunked && !isLastChunk ? 'chunked_partial' : 'uploaded');
      sheet.getRange(rowNum, 14).setValue('');

      if (isChunked) {
        var segIdx = parseInt(String(data.chunkSegmentIndex || ''), 10);
        appendVideoChunkLog_(sheet, rowNum, isNaN(segIdx) ? -1 : segIdx, recName, isLastChunk);
      }

      // Fill in secondary/gate if missing
      var secVid = normalizeStudentKey_(metaMin.secondaryCode || '');
      if (secVid && !String(sheet.getRange(rowNum, 19).getValue() || '').trim()) {
        sheet.getRange(rowNum, 19).setValue(secVid);
      }
      var gateVid = gatePasscodeFromMeta_(metaMin);
      if (gateVid && !String(sheet.getRange(rowNum, 20).getValue() || '').trim()) {
        sheet.getRange(rowNum, 20).setValue(gateVid);
      }
    } else {
      // Orphan row: no metadata row found
      var timestamp = nowIST_('yyyy-MM-dd_HH-mm-ss');
      var testCode = String(metaMin.testCode || '').trim().toUpperCase();
      sheet.appendRow(buildSubmissionRow_(timestamp, metaMin, fileId, recName, fileSize,
        'uploaded', '', testCode, '', submissionKey, folder.getId()));
    }

    if (isChunked) {
      var fIdEmail = rowNum > 0 ? String(sheet.getRange(rowNum, 18).getValue() || '').trim() : '';
      if (!fIdEmail && folder) fIdEmail = folder.getId();
      notifyVideoChunk_(metaMin, submissionKey, recName, fileId, fileSize, isLastChunk, fIdEmail);
    }

    return jsonSuccess_({ message: 'Video saved', fileId: fileId });
  } catch (err) {
    return jsonError_(err.toString());
  }
}

/** Chunked metadata: periodic snapshots + final submission in one Drive folder. */
function handleChunkedMetadata_(data) {
  var meta = data.metadata || {};
  var submissionKey = String(data.submissionKey || '').trim() || Utilities.getUuid().replace(/-/g, '').slice(0, 20);
  var phase = String(meta.chunkPhase || 'periodic').toLowerCase();
  var testCode = String(meta.testCode || '').trim().toUpperCase();
  var snapRaw = String(meta.snapshotFileName || 'metadata_snapshot.json');
  if (snapRaw.indexOf('/') >= 0 || snapRaw.indexOf('\\') >= 0) snapRaw = 'metadata_snapshot.json';
  var snapName = truncate_(snapRaw);
  var timestamp = nowIST_('yyyy-MM-dd_HH-mm-ss');
  var sheet = getTestSubmissionsSheet_();
  var rowNum = findSubmissionRow_(submissionKey);
  var metaBlob = Utilities.newBlob(JSON.stringify(meta, null, 2), 'application/json', snapName);

  // No existing row: create new session folder + row
  if (rowNum < 2) {
    var root = getOnlineTestUploadsRoot_();
    var studentFolder = getChildFolder_(root, studentTag_(meta));
    var sessionFolder = getChildFolder_(studentFolder, sessionFolderLabel_(meta, submissionKey));
    sessionFolder.createFile(metaBlob);

    var videoStatus = phase === 'final' ? 'metadata_uploaded' : 'chunked_open';
    sheet.appendRow(buildSubmissionRow_(timestamp, meta, '', phase === 'final' ? truncate_(studentTag_(meta) + '_recording.webm') : '',
      '', videoStatus, '', testCode, '', submissionKey, sessionFolder.getId()));
    var newRowNum = sheet.getLastRow();
    appendMetaChunkLog_(sheet, newRowNum, meta.segmentIndex, snapName, phase === 'final');

    if (phase === 'final') markSessionSubmitted_(testCode, meta.studentEmail);
    notifyMetaChunk_(meta, submissionKey, snapName, sessionFolder.getId(), phase === 'final' ? 'final' : 'session_start');

    return jsonSuccess_({
      message: phase === 'final' ? 'Final metadata saved' : 'Chunk session opened',
      submissionKey: submissionKey,
      folderId: sessionFolder.getId()
    });
  }

  // Existing row: add snapshot to existing folder
  var folderId = String(sheet.getRange(rowNum, 18).getValue() || '').trim();
  var sessionFolder2;
  try {
    sessionFolder2 = DriveApp.getFolderById(folderId);
  } catch (_) {
    return jsonError_('Session folder missing');
  }
  sessionFolder2.createFile(metaBlob);
  appendMetaChunkLog_(sheet, rowNum, meta.segmentIndex, snapName, phase === 'final');

  if (phase === 'final') {
    markSessionSubmitted_(testCode, meta.studentEmail);
    sheet.getRange(rowNum, 6).setValue(scoreDisplay_(meta));
    sheet.getRange(rowNum, 7).setValue(meta.totalQuestions != null ? meta.totalQuestions : '');
    sheet.getRange(rowNum, 8).setValue(meta.isMobile === true ? 'Yes' : 'No');
    sheet.getRange(rowNum, 9).setValue(meta.events ? JSON.stringify(meta.events) : '');
    sheet.getRange(rowNum, 13).setValue('metadata_uploaded');
  }
  notifyMetaChunk_(meta, submissionKey, snapName, folderId, phase === 'final' ? 'final' : 'periodic');

  return jsonSuccess_({
    message: phase === 'final' ? 'Final snapshot saved' : 'Periodic snapshot saved',
    submissionKey: submissionKey
  });
}

/** Legacy single-zip test submission. */
function handleLegacyZipSubmission_(data) {
  var sheet, lastRow;
  try {
    var meta = data.metadata || {};
    var timestamp = nowIST_('yyyy-MM-dd_HH-mm-ss');
    var stuTag = studentTag_(meta);
    var fileName = truncate_(stuTag + '_TestRecording_' + timestamp + '.zip');

    var zipBytes = Utilities.base64Decode(data.zipBase64);
    var zipBlob = Utilities.newBlob(zipBytes).setContentType('application/zip').setName(fileName);
    var rootZip = getLegacyZipRoot_();
    var folder = rootZip.createFolder(truncate_(stuTag + '__LegacyZip_' + timestamp));
    var testCode = String(meta.testCode || '').trim().toUpperCase();

    sheet = getTestSubmissionsSheet_();
    sheet.appendRow(buildSubmissionRow_(timestamp, meta, '', fileName, '', 'pending', '', testCode, '', '', folder.getId()));
    lastRow = sheet.getLastRow();

    var result = uploadWithRetry_(folder, zipBlob, sheet, lastRow, 13);
    if (!result.file) {
      sheet.getRange(lastRow, 13).setValue('failed');
      sheet.getRange(lastRow, 14).setValue(result.error ? result.error.toString() : 'Upload failed');
      return jsonError_(result.error ? result.error.toString() : 'Upload failed after retries');
    }

    var fileId = result.file.getId();
    var fileSize = result.file.getSize ? result.file.getSize() : 0;
    sheet.getRange(lastRow, 10).setValue(fileId);
    sheet.getRange(lastRow, 11).setValue(fileName);
    sheet.getRange(lastRow, 12).setValue(fileSize);
    sheet.getRange(lastRow, 13).setValue('uploaded');

    markSessionSubmitted_(testCode, meta.studentEmail);
    notifySubmission_(meta, timestamp, fileName, fileId);

    return jsonSuccess_({ message: 'Test submission saved to Google Drive', fileId: fileId });
  } catch (err) {
    if (sheet && lastRow) {
      try {
        sheet.getRange(lastRow, 13).setValue('failed');
        sheet.getRange(lastRow, 14).setValue(err.toString());
      } catch (_) {}
    }
    return jsonError_(err.toString());
  }
}


// === SECTION 11: QUESTION PAPERS ============================================

function findPaperRow_(sheet, paperId) {
  var want = String(paperId || '').trim();
  if (!want) return -1;
  var rows = getDataRows_(sheet, 1);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === want) return i + 2;
  }
  return -1;
}

/** Count test codes referencing a paper ID. */
function countCodesUsingPaper_(paperId) {
  var pid = String(paperId || '').trim();
  if (!pid) return 0;
  var rows = getDataRows_(getTestCodesSheet_(), 4);
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][3] || '').trim() === pid) n++;
  }
  return n;
}

function handleCreatePaper_(data) {
  try {
    var authErr = requireAdmin_(data.adminSecret);
    if (authErr) return authErr;

    var sheet = getQuestionPapersSheet_();
    var id = 'paper_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    var name = String(data.name || 'Untitled').trim().substring(0, 500);
    var createdAt = nowIST_();
    var createdBy = String(data.adminEmail || '').trim();
    var questions = Array.isArray(data.questions) ? data.questions : [];

    // Strip base64 images from questions (uploaded separately)
    for (var i = 0; i < questions.length; i++) {
      if (questions[i] && typeof questions[i] === 'object') {
        delete questions[i].imageBase64;
        delete questions[i].questionImage;
      }
    }

    var qJson = JSON.stringify(questions);
    if (qJson.length > 50000) return jsonError_('Question set too large');

    var duration = Math.min(600, Math.max(1, Number(data.durationMinutes) || 120));
    var paperMeta = String(data.paperMeta || '').trim();
    if (paperMeta.length > 12000) return jsonError_('PaperMetaJson too large');

    var hasKey = data.answerKeyPresent === true || String(data.answerKeyPresent || '').toLowerCase() === 'yes' ? 'Yes' : 'No';
    sheet.appendRow([id, name, createdAt, createdBy, qJson, duration, paperMeta, hasKey]);
    return jsonSuccess_({ id: id });
  } catch (err) {
    return jsonError_(err.toString());
  }
}

function handleUploadAnswerKey_(data) {
  try {
    var authErr = requireAdmin_(data.adminSecret);
    if (authErr) return authErr;

    var paperId = String(data.paperId || '').trim();
    if (!paperId) return jsonError_('paperId required');

    var updates = data.keyQuestions;
    if (!Array.isArray(updates) || updates.length === 0) return jsonError_('keyQuestions array required');

    var sheet = getQuestionPapersSheet_();
    var row = findPaperRow_(sheet, paperId);
    if (row < 0) return jsonError_('Paper not found');

    var questions = [];
    try {
      questions = JSON.parse(String(sheet.getRange(row, 5).getValue() || '[]'));
    } catch (_) { questions = []; }

    if (!Array.isArray(questions) || questions.length === 0) return jsonError_('Paper has no questions');

    var merged = 0;
    for (var ui = 0; ui < updates.length; ui++) {
      var k = updates[ui];
      if (!k || typeof k !== 'object') continue;

      var pnum = k.paperQuestionNum != null ? Number(k.paperQuestionNum) : NaN;
      var qidx = k.questionIndex != null ? Number(k.questionIndex) : (k.index != null ? Number(k.index) : NaN);
      var target = -1;

      // Match by paperQuestionNum field
      if (!isNaN(pnum) && pnum > 0) {
        for (var ti = 0; ti < questions.length; ti++) {
          if (questions[ti] && Number(questions[ti].paperQuestionNum) === pnum) { target = ti; break; }
        }
      }
      // Match by question index
      if (target < 0 && !isNaN(qidx) && qidx >= 0 && qidx < questions.length) target = qidx;
      // Match by position (1-based)
      if (target < 0 && !isNaN(pnum) && pnum >= 1 && pnum <= questions.length) target = Math.floor(pnum) - 1;
      if (target < 0) continue;

      if (k.answer !== undefined) { questions[target].answer = k.answer; merged++; }
      var t = String(k.type || '').toLowerCase();
      if (t === 'mcq' || t === 'integer') questions[target].type = t;
      if (Array.isArray(k.options) && k.options.length > 0) questions[target].options = k.options;
      if (k.min != null && !isNaN(Number(k.min))) questions[target].min = Number(k.min);
      if (k.max != null && !isNaN(Number(k.max))) questions[target].max = Number(k.max);
    }

    if (merged === 0) return jsonError_('No answers matched any question');

    var newJson = JSON.stringify(questions);
    if (newJson.length > 50000) return jsonError_('Question set too large after merge');

    sheet.getRange(row, 5).setValue(newJson);
    sheet.getRange(row, 8).setValue('Yes');
    SpreadsheetApp.flush();
    return jsonSuccess_({ merged: merged, paperId: paperId });
  } catch (err) {
    return jsonError_(err.toString());
  }
}

function handleUploadPaperImage_(data) {
  try {
    var authErr = requireAdmin_(data.adminSecret);
    if (authErr) return authErr;

    var paperId = String(data.paperId || '').trim();
    var qIndex = parseInt(data.questionIndex, 10);
    var b64 = data.imageBase64;
    if (!paperId || isNaN(qIndex) || qIndex < 0 || !b64 || String(b64).length < 20) {
      return jsonError_('Invalid image upload payload');
    }

    var sheet = getQuestionPapersSheet_();
    var row = findPaperRow_(sheet, paperId);
    if (row < 0) return jsonError_('Paper not found');

    var questions = [];
    try { questions = JSON.parse(String(sheet.getRange(row, 5).getValue() || '[]')); } catch (_) {}
    if (!Array.isArray(questions) || qIndex >= questions.length) return jsonError_('Bad question index');

    var paperName = String(sheet.getRange(row, 2).getValue() || 'Untitled').trim() || 'Untitled';
    var imgRoot = getQuestionPaperImagesRoot_();
    var folderName = truncate_('Paper_' + sanitizeForDrive_(paperName, 55) + '__ID_' + sanitizeForDrive_(paperId, 35));

    var imgFolder;
    var it = imgRoot.getFoldersByName(folderName);
    if (it.hasNext()) { imgFolder = it.next(); } else { imgFolder = imgRoot.createFolder(folderName); }

    var bytes = Utilities.base64Decode(String(b64));
    var imgName = truncate_('Paper_' + sanitizeForDrive_(paperName, 40) + '__ID_' + sanitizeForDrive_(paperId, 30) + '_Q' + (qIndex + 1), CONFIG.DRIVE_LABEL_MAX_LEN - 5) + '.jpg';
    var file = imgFolder.createFile(Utilities.newBlob(bytes, 'image/jpeg', imgName));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var q = questions[qIndex];
    if (!q || typeof q !== 'object') return jsonError_('Invalid question slot');
    q.imageFileId = file.getId();
    delete q.imageBase64;
    delete q.questionImage;

    var outJson = JSON.stringify(questions);
    if (outJson.length > 50000) return jsonError_('Question set too large after adding image');
    sheet.getRange(row, 5).setValue(outJson);

    return jsonSuccess_({ questionIndex: qIndex, imageFileId: q.imageFileId });
  } catch (err) {
    return jsonError_(err.toString());
  }
}


// === SECTION 12: FEEDBACK ===================================================

function handleFeedback_(data) {
  var sheet, lastRow;
  try {
    var rating = data.rating != null ? Number(data.rating) : 0;
    var comment = String(data.comment || '').trim();
    var studentName = String(data.studentName || '').trim();
    var studentEmail = String(data.studentEmail || '').trim();
    var studentPhone = String(data.studentPhone || '').trim();
    var studentClass = String(data.studentClass || data.class || '').trim();
    var timestamp = nowIST_();
    var ratingLabel = CONFIG.RATING_LABELS[rating] || '';

    sheet = getFeedbackSheet_();
    sheet.appendRow([timestamp, rating, ratingLabel, comment, studentName, studentEmail, studentPhone, studentClass, 'pending']);
    lastRow = sheet.getLastRow();

    // Save to Drive
    var feedbackRoot = getFeedbackRoot_();
    var stuTag = studentTag_(studentName, studentPhone);
    var folder = getChildFolder_(feedbackRoot, stuTag);
    var fileTimestamp = nowIST_('yyyy-MM-dd_HH-mm-ss');
    var fileName = truncate_(stuTag + '_Feedback_' + fileTimestamp + '.csv');
    var csv = 'Timestamp,Rating,RatingLabel,Comment,Student Name,Student Email,Student Phone,Class\n' +
      '"' + timestamp + '",' + rating + ',"' + ratingLabel.replace(/"/g, '""') + '","' +
      comment.replace(/"/g, '""') + '","' + studentName.replace(/"/g, '""') + '","' +
      studentEmail.replace(/"/g, '""') + '","' + studentPhone.replace(/"/g, '""') + '","' +
      studentClass.replace(/"/g, '""') + '"';

    var result = uploadWithRetry_(folder, Utilities.newBlob(csv, 'text/csv', fileName), sheet, lastRow, 9);
    if (!result.file) {
      sheet.getRange(lastRow, 9).setValue('failed');
      return jsonError_(result.error ? result.error.toString() : 'Upload failed');
    }
    sheet.getRange(lastRow, 9).setValue('uploaded');
    return jsonSuccess_({ message: 'Feedback saved to Google Drive' });
  } catch (err) {
    if (sheet && lastRow) { try { sheet.getRange(lastRow, 9).setValue('failed'); } catch (_) {} }
    return jsonError_(err.toString());
  }
}


// === SECTION 13: TEST SIGN-UPS ==============================================

function handleTestSignUp_(data) {
  try {
    var fullName = String(data.fullName || '').trim();
    var email = String(data.email || '').trim();
    var phone = String(data.phone || '').trim().replace(/\s/g, '');
    var studentClass = String(data.studentClass || data.classOrGrade || data.class || '').trim();
    var testType = String(data.testType || 'online').trim();
    var testDate = String(data.testDate || '').trim();
    var message = String(data.message || '').trim();
    var timestamp = data.timestamp || nowIST_();

    getTestSignUpsSheet_().appendRow([timestamp, fullName, email, phone, studentClass, testType, testDate, message]);

    notifySignUp_(fullName, email, phone, studentClass, testType, testDate, message, timestamp);
    return jsonSuccess_({ message: 'Test sign-up saved' });
  } catch (err) {
    return jsonError_(err.toString());
  }
}


// === SECTION 14: REGISTRATION ===============================================

function handleRegistration_(data) {
  var sheet = getRegistrationsSheet_();
  sheet.appendRow([
    data.timestamp || new Date().toLocaleString('en-IN', { timeZone: CONFIG.TIMEZONE }),
    data.fullName || '', data.email || '', data.phone || '',
    data.school || '', data.course || '', data.class || '', data.message || ''
  ]);

  try { sendRegistrationEmails_(data); } catch (_) {}

  return jsonSuccess_({ message: 'Registration saved successfully' });
}


// === SECTION 15: EMAIL NOTIFICATIONS ========================================

function sendToAdmins_(subject, body) {
  var emails = CONFIG.NOTIFICATION_EMAILS;
  for (var i = 0; i < emails.length; i++) {
    var to = String(emails[i] || '').trim();
    if (!to) continue;
    try { MailApp.sendEmail({ to: to, subject: subject, body: body }); } catch (_) {}
  }
}

function notifySubmission_(meta, timestamp, fileName, fileId) {
  var subj = 'Adhyant: New test submission - ' + (meta.studentName || 'Unknown');
  var body = 'New online test submission received\n\n' +
    'Student Name : ' + (meta.studentName || '--') + '\n' +
    'Email        : ' + (meta.studentEmail || '--') + '\n' +
    'Phone        : ' + (meta.studentPhone || '--') + '\n' +
    'Score        : ' + (meta.score != null ? meta.score : (meta.scoreMessage || '--')) + ' / ' + (meta.totalQuestions != null ? meta.totalQuestions : '--') + '\n' +
    'Timestamp    : ' + timestamp + '\n' +
    'File         : ' + fileName + '\n' +
    'File ID      : ' + fileId + '\n';
  sendToAdmins_(subj, body);
}

function notifyMetadata_(meta, submissionKey, folderId, metaFileId) {
  var subj = 'Adhyant: Test metadata received - ' + (meta.studentName || 'Unknown');
  var body = 'Metadata saved (video may follow separately).\n\n' +
    'Student Name : ' + (meta.studentName || '--') + '\n' +
    'Email        : ' + (meta.studentEmail || '--') + '\n' +
    'Submission   : ' + submissionKey + '\n' +
    'Folder ID    : ' + folderId + '\n' +
    'Metadata file: ' + metaFileId + '\n';
  sendToAdmins_(subj, body);
}

function notifyMetaChunk_(meta, submissionKey, snapName, folderId, kind) {
  var label = kind === 'final' ? 'FINAL metadata snapshot' :
              kind === 'session_start' ? 'Session started (first metadata)' : 'Periodic metadata snapshot';
  var subj = 'Adhyant: [' + label + '] ' + (meta.studentName || 'Unknown') + ' - ' + (String(meta.testCode || '').toUpperCase() || '--');
  var body = 'Chunked test - metadata JSON saved on Drive\n\n' +
    'Type         : ' + label + '\n' +
    'File         : ' + (snapName || '--') + '\n' +
    'Student      : ' + (meta.studentName || 'Unknown') + '\n' +
    'Email        : ' + (meta.studentEmail || '--') + '\n' +
    'Submission   : ' + submissionKey + '\n' +
    'Folder ID    : ' + (folderId || '--') + '\n';
  sendToAdmins_(subj, body);
}

function notifyVideoChunk_(meta, submissionKey, recName, fileId, sizeBytes, isFinal, folderId) {
  var label = isFinal ? 'FINAL video chunk' : 'Partial video chunk';
  var sizeMb = !isNaN(Number(sizeBytes)) ? (Number(sizeBytes) / (1024 * 1024)).toFixed(2) + ' MB' : '--';
  var subj = 'Adhyant: [' + label + '] ' + (meta.studentName || 'Unknown');
  var body = 'Chunked test - recording segment saved\n\n' +
    'Type         : ' + label + '\n' +
    'File         : ' + (recName || '--') + '\n' +
    'Size         : ' + sizeMb + '\n' +
    'File ID      : ' + (fileId || '--') + '\n' +
    'Student      : ' + (meta.studentName || 'Unknown') + '\n' +
    'Submission   : ' + submissionKey + '\n' +
    'Folder ID    : ' + (folderId || '--') + '\n';
  sendToAdmins_(subj, body);
}

function notifySignUp_(fullName, email, phone, studentClass, testType, testDate, message, timestamp) {
  var subj = 'Adhyant: New test sign-up - ' + (fullName || 'Unknown');
  var body = 'New test form sign-up received\n\n' +
    'Full Name : ' + (fullName || '--') + '\n' +
    'Email     : ' + (email || '--') + '\n' +
    'Phone     : ' + (phone || '--') + '\n' +
    'Class     : ' + (studentClass || '--') + '\n' +
    'Test Type : ' + (testType || '--') + '\n' +
    'Test Date : ' + (testDate || '--') + '\n' +
    'Message   : ' + (message || '--') + '\n' +
    'Timestamp : ' + timestamp + '\n';
  sendToAdmins_(subj, body);
}

function sendRegistrationEmails_(data) {
  var subj = 'New Registration: ' + (data.fullName || 'Unknown Student');
  var body =
    '=== NEW REGISTRATION RECEIVED ===\n\n' +
    'STUDENT DETAILS:\n' +
    'Full Name       : ' + (data.fullName || 'Not provided') + '\n' +
    'Email           : ' + (data.email || 'Not provided') + '\n' +
    'Phone           : ' + (data.phone || 'Not provided') + '\n' +
    'School          : ' + (data.school || 'Not provided') + '\n' +
    'Interested In   : ' + (data.course || 'Not provided') + '\n' +
    'Current Class   : ' + (data.class || 'Not provided') + '\n' +
    'Message         : ' + (data.message || 'No message') + '\n' +
    'Timestamp       : ' + (data.timestamp || new Date().toLocaleString()) + '\n\n' +
    'ACTION REQUIRED:\n' +
    '1. Call the student at ' + (data.phone || 'N/A') + '\n' +
    '2. Send course details to ' + (data.email || 'N/A') + '\n' +
    '3. Discuss their interest in: ' + (data.course || 'N/A') + '\n\n' +
    'View all registrations:\n' +
    openSpreadsheet_().getUrl() + '\n';

  sendToAdmins_(subj, body);

  // Confirmation email to student
  if (data.email && data.email.trim()) {
    try {
      MailApp.sendEmail({
        to: data.email,
        subject: 'Registration Confirmed - Adhyant',
        body: 'Dear ' + (data.fullName || 'Student') + ',\n\n' +
          'Welcome to the Adhyant Family! We are truly blessed to have you with us!\n\n' +
          'Your decision to join Adhyant marks the beginning of an extraordinary journey towards excellence.\n\n' +
          'Here are your query details:\n' +
          'Course Interest : ' + (data.course || 'N/A') + '\n' +
          'Current Class   : ' + (data.class || 'N/A') + '\n\n' +
          'Our dedicated expert will reach out to you very soon!\n\n' +
          'Contact us anytime:\n' +
          'WhatsApp: +91 9085287242\n' +
          'Email: adhyantforyou@gmail.com\n\n' +
          'With warm regards,\nTeam Adhyant\nMentored by IITians, Destined for Excellence'
      });
    } catch (_) {}
  }
}


// === SECTION 16: ADMIN OPERATIONS ===========================================

/** Move a Drive item to trash (safe, ignores errors). */
function trashItem_(id) {
  var s = id != null ? String(id).trim() : '';
  if (!s) return;
  try { DriveApp.getFileById(s).setTrashed(true); } catch (_) {}
}

/** Trash Drive artifacts linked to a submission row. */
function trashSubmissionArtifacts_(row) {
  if (!row || row.length < 10) return;
  trashItem_(row.length > 9 ? String(row[9] || '').trim() : '');    // legacy zip
  trashItem_(row.length > 15 ? String(row[15] || '').trim() : '');   // metadata file
  trashItem_(row.length > 17 ? String(row[17] || '').trim() : '');   // session folder
}

/** Trash all children of a folder. */
function trashChildren_(folder) {
  var out = { folders: 0, files: 0 };
  if (!folder) return out;
  var sub = folder.getFolders();
  while (sub.hasNext()) { try { sub.next().setTrashed(true); out.folders++; } catch (_) {} }
  var files = folder.getFiles();
  while (files.hasNext()) { try { files.next().setTrashed(true); out.files++; } catch (_) {} }
  return out;
}

/** Delete session rows for a test code. */
function deleteSessionsForCode_(code, onlyInProgress) {
  var want = String(code || '').trim().toUpperCase();
  if (!want) return 0;
  var sheet = getTestSessionsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var removed = 0;
  for (var r = lastRow; r >= 2; r--) {
    var vals = getRowValues_(sheet, r, 10);
    if (String(vals[0] || '').trim().toUpperCase() !== want) continue;
    if (onlyInProgress && String(vals[4] || '').trim().toLowerCase() !== 'in_progress') continue;
    sheet.deleteRow(r);
    removed++;
  }
  return removed;
}

/** Delete submission rows for a test code. Optionally trash Drive artifacts. */
function deleteSubmissionsForCode_(code, doTrash) {
  var want = String(code || '').trim().toUpperCase();
  if (!want) return 0;
  var sheet = getTestSubmissionsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var removed = 0;
  for (var r = lastRow; r >= 2; r--) {
    var vals = getRowValues_(sheet, r, 20);
    if (String(vals[14] || '').trim().toUpperCase() !== want) continue;
    if (doTrash) trashSubmissionArtifacts_(vals);
    sheet.deleteRow(r);
    removed++;
  }
  return removed;
}

/** Delete resume codes for a primary test code. */
function deleteResumeCodesForCode_(code) {
  var want = String(code || '').trim().toUpperCase();
  if (!want) return 0;
  var sheet = getResumeCodesSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var removed = 0;
  for (var r = lastRow; r >= 2; r--) {
    if (String(sheet.getRange(r, 2).getValue() || '').trim().toUpperCase() !== want) continue;
    sheet.deleteRow(r);
    removed++;
  }
  return removed;
}

/** Delete sessions for a specific student. */
function deleteSessionsForStudent_(code, email) {
  var wantCode = String(code || '').trim().toUpperCase();
  var wantEmail = normalizeEmail_(email);
  if (!wantCode || !wantEmail) return 0;
  var sheet = getTestSessionsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var removed = 0;
  for (var r = lastRow; r >= 2; r--) {
    var vals = getRowValues_(sheet, r, 7);
    if (String(vals[0] || '').trim().toUpperCase() !== wantCode) continue;
    if (normalizeEmail_(vals[1]) !== wantEmail) continue;
    sheet.deleteRow(r);
    removed++;
  }
  return removed;
}

/** Delete submission rows for a specific student, optionally filtered by timestamp. */
function deleteSubmissionsForStudent_(code, email, timestamp) {
  var wantCode = String(code || '').trim().toUpperCase();
  var wantEmail = normalizeEmail_(email);
  if (!wantCode || !wantEmail) return 0;
  var ts = timestamp != null ? String(timestamp).trim() : '';
  var sheet = getTestSubmissionsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var removed = 0;
  for (var r = lastRow; r >= 2; r--) {
    var vals = getRowValues_(sheet, r, 20);
    if (String(vals[14] || '').trim().toUpperCase() !== wantCode) continue;
    if (normalizeEmail_(vals[2]) !== wantEmail) continue;
    if (ts && String(vals[0] || '').trim() !== ts) continue;
    sheet.deleteRow(r);
    removed++;
  }
  return removed;
}

function isBulkResetConfirm_(raw) {
  var p = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return p === 'everything' || p === 'delete everything' || p === 'delete all test data' || p === 'delete all' || p === 'yes delete all';
}


// === SECTION 17: API ROUTING ================================================

// ---------- doPost ----------

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return jsonError_('No payload');
    var data;
    try { data = JSON.parse(e.postData.contents); } catch (_) { return jsonError_('Invalid JSON'); }

    // Route by action
    switch (data.action) {
      case 'setTestCodeActive':
        return handleSetCodeActive_(data.adminSecret, data.code, data.active);

      case 'recordTestStart':
        return recordTestStart_(data);

      case 'submitTestMetadata':
        if (data.metadata) return handleSubmitMetadata_(data);
        break;

      case 'submitTestVideo':
        if (data.videoBase64 && data.submissionKey) return handleSubmitVideo_(data);
        break;

      case 'createPaper':
        if (data.adminSecret && data.name) return handleCreatePaper_(data);
        break;

      case 'uploadPaperAnswerKey':
        if (data.adminSecret && data.paperId && Array.isArray(data.keyQuestions)) return handleUploadAnswerKey_(data);
        break;

      case 'uploadPaperQuestionImage':
        if (data.adminSecret && data.paperId) return handleUploadPaperImage_(data);
        break;

      case 'submitFeedback':
        return handleFeedback_(data);

      case 'testSignUp':
        return handleTestSignUp_(data);
    }

    // Legacy zip submission (no action field)
    if (data.zipBase64 && data.metadata) return handleLegacyZipSubmission_(data);

    // Legacy registration form (no action field)
    return handleRegistration_(data);

  } catch (error) {
    return jsonError_(error.toString());
  }
}

// ---------- doGet ----------

function doGet(e) {
  var p = e && e.parameter ? e.parameter : {};
  var action = p.action;

  try {
    switch (action) {

      // ---- Public: Validate a test code ----
      case 'validateCode':
        return handleValidateCode_(p);

      // ---- Public: Record test start ----
      case 'recordTestStart':
        return recordTestStart_(p);  // FIX: was duplicated code, now calls shared function

      // ---- Public: Abandon session ----
      case 'abandonTestSession':
        return handleAbandonSession_(p);

      // ---- Public: List papers (names only) ----
      case 'listPapers':
        return handleListPapers_();

      // ---- Public: Get a specific paper ----
      case 'getPaper':
        if (p.id) return handleGetPaper_(p);
        break;

      // ---- Public: Serve question image ----
      case 'servePaperQuestionImage':
        return handleServeImage_(p);

      // ---- Public: Save test progress (cross-device resume) ----
      case 'saveProgress':
        return handleSaveProgress_(p);

      // ---- Public: Load test progress (cross-device resume) ----
      case 'loadProgress':
        return handleLoadProgress_(p);

      // ---- Public: Clear test progress (after submission) ----
      case 'clearProgress':
        return handleClearProgress_(p);

      // ---- Admin: Generate test code ----
      case 'generateCode':
        return handleGenerateCode_(p);

      // ---- Admin: Start test ----
      case 'startTest':
        return handleStartTest_(p);

      // ---- Admin: Open/close code ----
      case 'setTestCodeActive':
        return handleSetCodeActive_(p.adminSecret, p.code, p.active);

      // ---- Admin: List test codes ----
      case 'listTestCodes':
        return handleListTestCodes_(p);

      // ---- Admin: List submissions ----
      case 'list':
        return handleListSubmissions_();

      // ---- Admin: Download file ----
      case 'download':
        if (p.fileId) return handleDownload_(p.fileId);
        break;

      // ---- Admin: List feedback ----
      case 'listFeedback':
        return handleListFeedback_();

      // ---- Admin: Test code activity ----
      case 'listTestCodeActivity':
        return handleListActivity_(p);

      // ---- Admin: Delete question paper ----
      case 'deleteQuestionPaper':
        return handleDeletePaper_(p);

      // ---- Admin: Clear test code data ----
      case 'clearTestCodeData':
        return handleClearCodeData_(p);

      // ---- Admin: Clear ALL test data ----
      case 'clearAllTestData':
        return handleClearAllData_(p);

      // ---- Admin: Delete student session ----
      case 'deleteStudentSession':
        return handleDeleteStudentSession_(p);

      // ---- Admin: Delete student submission ----
      case 'deleteStudentSubmission':
        return handleDeleteStudentSubmission_(p);
    }

    // Default: show available actions
    return jsonSuccess_({
      message: 'Adhyant API. Available actions: validateCode, recordTestStart, abandonTestSession, ' +
        'saveProgress, loadProgress, clearProgress, ' +
        'listPapers, getPaper, servePaperQuestionImage, generateCode, startTest, setTestCodeActive, ' +
        'listTestCodes, list, download, listFeedback, listTestCodeActivity, deleteQuestionPaper, ' +
        'clearTestCodeData, clearAllTestData, deleteStudentSession, deleteStudentSubmission'
    });
  } catch (err) {
    return jsonError_(err.toString());
  }
}


// ---------- doGet handlers ----------

function handleValidateCode_(p) {
  var code = String(p.code || '').trim().toUpperCase();
  if (!code) return jsonSuccess_({ valid: false });

  var pwdIn = String(p.studentPassword || p.password || '').trim();
  var emailParam = normalizeEmail_(p.studentEmail || p.email || '');

  var rows = getDataRows_(getTestCodesSheet_(), 8);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toUpperCase() !== code) continue;

    var paperId = rows[i][3] ? String(rows[i][3]).trim() : '';
    var accessPass = rows[i].length >= 7 ? String(rows[i][6] || '').trim() : '';
    var quota = getPasscodeQuota_(rows[i]);

    // IMPORTANT: Check active flag FIRST (FIX: was checked too late before)
    if (!isCodeActive_(rows[i])) {
      return jsonSuccess_({ valid: false, reason: 'inactive' });
    }

    // Validate password/passcode
    if (quota > 0 || isStudentGateMode_(accessPass)) {
      // Student-gate mode: student chooses a passcode >= min length
      if (pwdIn.length < CONFIG.STUDENT_GATE_PASSWORD_MIN_LEN) {
        return jsonSuccess_({ valid: false, reason: 'password_too_short' });
      }
    } else if (accessPass && pwdIn !== accessPass) {
      // Organiser-set password mode
      return jsonSuccess_({ valid: false, reason: 'invalid_password' });
    }

    // Check if already submitted (by email or gate passcode)
    if (emailParam && isPlausibleEmail_(emailParam) && submissionExists_(code, emailParam)) {
      return jsonSuccess_({ valid: true, alreadySubmitted: true, started: true, questionPaperId: paperId || null, secondaryRequired: false });
    }
    if (pwdIn && submissionExistsByPasscode_(code, pwdIn)) {
      return jsonSuccess_({ valid: true, alreadySubmitted: true, started: true, questionPaperId: paperId || null, secondaryRequired: false });
    }

    // Check if test has been started by admin
    var startedVal = String(rows[i][4] || '').trim().toLowerCase();
    var started = (startedVal === 'yes' || startedVal === 'true' || startedVal === '1');

    return jsonSuccess_({ valid: true, started: started, questionPaperId: paperId || null, secondaryRequired: false });
  }

  return jsonSuccess_({ valid: false });
}

function handleAbandonSession_(p) {
  var code = String(p.code || '').trim().toUpperCase();
  var email = String(p.email || '').trim();
  if (!code || !email) return jsonError_('Code and student email required');

  var found = findSessionRow_(code, normalizeEmail_(email));
  if (found.row < 0) return jsonError_('Session not found');
  if (found.status !== 'in_progress') return jsonSuccess_({ message: 'Nothing to abandon' });

  getTestSessionsSheet_().getRange(found.row, 5).setValue('abandoned');
  SpreadsheetApp.flush();
  return jsonSuccess_({ message: 'Session released' });
}

function handleSetCodeActive_(adminSecret, codeRaw, activeRaw) {
  try {
    var authErr = requireAdmin_(adminSecret);
    if (authErr) return authErr;

    var code = String(codeRaw || '').trim().toUpperCase();
    if (!code) return jsonError_('Code required');

    var activeParam = String(activeRaw != null ? activeRaw : 'yes').trim().toLowerCase();
    var setYes = (activeParam === 'yes' || activeParam === 'true' || activeParam === '1' || activeParam === 'on');

    var sheet = getTestCodesSheet_();
    var rows = getDataRows_(sheet, 6);
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toUpperCase() === code) {
        sheet.getRange(i + 2, 6).setValue(setYes ? 'Yes' : 'No');
        SpreadsheetApp.flush();
        return jsonSuccess_({
          message: setYes ? 'Code is open again.' : 'Code closed. Students cannot use it.',
          active: setYes
        });
      }
    }
    return jsonError_('Code not found');
  } catch (err) {
    return jsonError_(err.toString());
  }
}

function handleGenerateCode_(p) {
  var authErr = requireAdmin_(p.adminSecret);
  if (authErr) return authErr;

  var slotCount = parseInt(String(p.studentPasscodeCount || p.passcodeSlots || p.maxStudents || '0'), 10);
  if (!slotCount || slotCount < 1 || slotCount > 500) {
    return jsonError_('studentPasscodeCount (or maxStudents) required: 1-500. Maximum number of students who can take this test.');
  }

  var sheet = getTestCodesSheet_();
  var code = randomTestCode_();
  var createdAt = nowIST_();
  var createdBy = p.adminEmail || '';
  var paperId = String(p.questionPaperId || '').trim();

  sheet.appendRow([code, createdAt, createdBy, paperId, '', 'Yes', CONFIG.STUDENT_GATE_SENTINEL, slotCount]);

  return jsonSuccess_({
    code: code,
    accessPassword: null,
    studentGatePassword: false,
    studentPasscodeQuota: slotCount,
    studentPasscodes: [],
    secondaryCodes: [],
    secondaryCount: 0
  });
}

function handleStartTest_(p) {
  var authErr = requireAdmin_(p.adminSecret);
  if (authErr) return authErr;

  var code = String(p.code || '').trim().toUpperCase();
  if (!code) return jsonError_('Code required');

  var sheet = getTestCodesSheet_();
  var rows = getDataRows_(sheet, 5);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toUpperCase() === code) {
      sheet.getRange(i + 2, 5).setValue('Yes');
      SpreadsheetApp.flush();
      return jsonSuccess_({ message: 'Test started for code ' + code });
    }
  }
  return jsonError_('Code not found');
}

function handleListTestCodes_(p) {
  var authErr = requireAdmin_(p.adminSecret);
  if (authErr) return authErr;

  var rows = getDataRows_(getTestCodesSheet_(), 8);
  var byPrimary = loadResumeCodesByPrimary_();
  var codes = rows.map(function(row) {
    var ccode = String(row[0]).trim().toUpperCase();
    var ap = row.length >= 7 ? String(row[6] || '').trim() : '';
    var quota = getPasscodeQuota_(row);
    var usedSlots = quota > 0 ? countActiveStudents_(ccode) : 0;
    var studentGate = quota > 0 ? false : isStudentGateMode_(ap);
    var createdAt = row[1];
    if (createdAt instanceof Date) createdAt = Utilities.formatDate(createdAt, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    else createdAt = createdAt != null ? String(createdAt) : '';

    return {
      code: String(row[0]).trim(),
      createdAt: createdAt,
      createdBy: row[2] ? String(row[2]) : '',
      questionPaperId: row[3] ? String(row[3]).trim() : '',
      started: String(row[4] || '').trim().toLowerCase() === 'yes',
      active: isCodeActive_(row),
      accessPassword: studentGate ? null : (ap || null),
      studentGatePassword: studentGate,
      studentPasscodeQuota: quota,
      studentPasscodesClaimed: usedSlots,
      secondaryCodes: byPrimary[ccode] || []
    };
  });

  return jsonSuccess_({ codes: codes });
}

function handleListSubmissions_() {
  var rows = getDataRows_(getTestSubmissionsSheet_(), 22);
  var submissions = [];
  for (var ri = 0; ri < rows.length; ri++) {
    var row = rows[ri];
    if (row[0] == null || String(row[0]).trim() === '') continue;

    var logs = chunkLogSummary_(
      row.length > 20 ? String(row[20] || '') : '',
      row.length > 21 ? String(row[21] || '') : ''
    );

    submissions.push({
      timestamp: row[0],
      studentName: row[1],
      email: row[2],
      adhar: row[3],
      phone: row[4] || '',
      score: row[5],
      total: row[6],
      isMobile: row[7],
      events: row[8] || '',
      fileId: row[9] || '',
      fileName: row[10] || '',
      fileSizeBytes: (row[11] != null && row[11] !== '') ? Number(row[11]) : null,
      videoStatus: row[12] ? String(row[12]) : 'pending',
      uploadError: row[13] ? String(row[13]) : '',
      testCode: row[14] ? String(row[14]) : '',
      metadataFileId: row[15] ? String(row[15]) : '',
      submissionKey: row[16] ? String(row[16]) : '',
      driveFolderId: row[17] ? String(row[17]) : '',
      videoChunkLog: logs.videoChunkLog,
      metadataChunkLog: logs.metadataChunkLog,
      chunkSegmentCount: logs.chunkSegmentCount,
      metadataChunkCount: logs.metadataChunkCount,
      chunkSummary: logs.chunkSummary,
      metadataChunkSummary: logs.metadataChunkSummary
    });
  }
  return jsonSuccess_({ submissions: submissions, total: submissions.length });
}

function handleDownload_(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    return jsonSuccess_({
      content: Utilities.base64Encode(blob.getBytes()),
      fileName: file.getName()
    });
  } catch (err) {
    return jsonError_(err.toString());
  }
}

function handleListFeedback_() {
  var rows = getDataRows_(getFeedbackSheet_(), 9);
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row[0] == null || String(row[0]).trim() === '') continue;
    list.push({
      timestamp: row[0],
      rating: row[1],
      ratingLabel: row[2],
      comment: row[3] || '',
      studentName: row[4] || '',
      studentEmail: row[5] || '',
      studentPhone: row[6] || '',
      studentClass: row[7] ? String(row[7]) : null,
      driveStatus: row[8] ? String(row[8]) : 'uploaded'
    });
  }
  return jsonSuccess_({ feedback: list, total: list.length });
}

function handleListPapers_() {
  var rows = getDataRows_(getQuestionPapersSheet_(), 8);
  var papers = [];
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i][0] || !String(rows[i][0]).trim()) continue;
    var rawAk = rows[i].length > 7 ? rows[i][7] : null;
    var ak = (rawAk != null && String(rawAk).trim()) ? String(rawAk).trim().toLowerCase() === 'yes' : null;
    papers.push({ id: rows[i][0], name: rows[i][1], createdAt: rows[i][2], createdBy: rows[i][3], answerKeyPresent: ak });
  }
  return jsonSuccess_({ papers: papers });
}

function handleGetPaper_(p) {
  var isAdmin = false;
  var adminSecret = p.adminSecret || '';
  var storedSecret = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
  if (adminSecret && storedSecret && adminSecret === storedSecret) isAdmin = true;

  var rows = getDataRows_(getQuestionPapersSheet_(), 8);
  var paperId = String(p.id || '').trim();

  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() !== paperId) continue;

    var questions = [];
    try { questions = JSON.parse(String(rows[i][4] || '[]')); } catch (_) {}
    var dm = Number(rows[i][5]);
    var duration = (!isNaN(dm) && dm > 0) ? dm : 120;
    var paperMeta = {};
    if (rows[i][6]) { try { paperMeta = JSON.parse(String(rows[i][6])); } catch (_) {} }

    // Determine if answer key is present
    var rawKey = rows[i].length > 7 ? rows[i][7] : null;
    var hasKey = false;
    if (rawKey != null && String(rawKey).trim()) {
      hasKey = String(rawKey).trim().toLowerCase() === 'yes';
    } else {
      for (var qi = 0; qi < questions.length; qi++) {
        var q = questions[qi];
        if (!q || typeof q !== 'object') continue;
        if (q.answer !== undefined && q.answer !== null && String(q.answer).trim() !== '') { hasKey = true; break; }
      }
    }

    // Build output questions
    var qOut = [];
    for (var j = 0; j < questions.length; j++) {
      var src = questions[j];
      var qq = {};
      for (var k in src) { if (src.hasOwnProperty(k)) qq[k] = src[k]; }
      if (!hasKey && !isAdmin) { delete qq.answer; qq.needsAnswerKey = true; }
      if (qq.imageFileId) {
        qq.imageUrl = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(String(qq.imageFileId)) + '&sz=w2000';
      }
      qOut.push(qq);
    }

    return jsonSuccess_({
      paper: {
        id: rows[i][0], name: rows[i][1], createdAt: rows[i][2], createdBy: rows[i][3],
        questions: qOut, title: rows[i][1], durationMinutes: duration,
        maxMarks: paperMeta.maxMarks != null ? paperMeta.maxMarks : null,
        readTimeMinutes: paperMeta.readTimeMinutes != null ? paperMeta.readTimeMinutes : null,
        instructions: Array.isArray(paperMeta.instructions) ? paperMeta.instructions : [],
        paperTitleHint: paperMeta.paperTitleHint || null,
        answerKeyPresent: hasKey
      }
    });
  }
  return jsonError_('Not found');
}

function handleServeImage_(p) {
  try {
    var paperId = String(p.paperId || '').trim();
    var qIdx = parseInt(p.questionIndex, 10);
    if (!paperId || isNaN(qIdx) || qIdx < 0) return ContentService.createTextOutput('Not found').setMimeType(ContentService.MimeType.TEXT);

    var sheet = getQuestionPapersSheet_();
    var row = findPaperRow_(sheet, paperId);
    if (row < 0) return ContentService.createTextOutput('Not found').setMimeType(ContentService.MimeType.TEXT);

    var questions = [];
    try { questions = JSON.parse(String(sheet.getRange(row, 5).getValue() || '[]')); } catch (_) {}
    if (!Array.isArray(questions) || qIdx >= questions.length) return ContentService.createTextOutput('Not found').setMimeType(ContentService.MimeType.TEXT);

    var imgId = questions[qIdx] && questions[qIdx].imageFileId ? String(questions[qIdx].imageFileId).trim() : '';
    if (!imgId) return ContentService.createTextOutput('Not found').setMimeType(ContentService.MimeType.TEXT);

    var blob = DriveApp.getFileById(imgId).getBlob();
    return ContentService.createBlobOutput(blob);
  } catch (_) {
    return ContentService.createTextOutput('Not found').setMimeType(ContentService.MimeType.TEXT);
  }
}

function handleListActivity_(p) {
  var authErr = requireAdmin_(p.adminSecret);
  if (authErr) return authErr;

  var code = String(p.code || '').trim().toUpperCase();
  if (!code) return jsonError_('Code required');

  // Expire stale sessions first
  var staleClosed = expireStaleSessions_(code);

  // Load submissions for cross-referencing chunk logs
  var subRows = getDataRows_(getTestSubmissionsSheet_(), 22);

  // Build in-progress and timed-out lists
  var inProgress = [];
  var timedOut = [];
  var sessionRows = getDataRows_(getTestSessionsSheet_(), 10);

  for (var si = 0; si < sessionRows.length; si++) {
    var sr = sessionRows[si];
    if (String(sr[0] || '').trim().toUpperCase() !== code) continue;
    var st = String(sr[4] || '').trim().toLowerCase();
    if (st !== 'in_progress' && st !== 'timed_out') continue;

    var emailNorm = normalizeEmail_(sr[1]);
    var gateDisplay = String(sr[9] || sr[8] || '').trim() || null;

    // Attach chunk logs from submission rows
    var bestV = '', bestM = '';
    for (var ei = 0; ei < subRows.length; ei++) {
      if (String(subRows[ei][14] || '').trim().toUpperCase() !== code) continue;
      if (normalizeEmail_(subRows[ei][18]) !== emailNorm) continue;
      var vv = subRows[ei].length >= 21 ? String(subRows[ei][20] || '') : '';
      var mm = subRows[ei].length >= 22 ? String(subRows[ei][21] || '') : '';
      if (vv.length >= bestV.length) bestV = vv;
      if (mm.length >= bestM.length) bestM = mm;
    }
    var logs = chunkLogSummary_(bestV, bestM);

    var obj = {
      email: String(sr[1]).trim(),
      name: String(sr[2]).trim(),
      startedAt: sr[3] != null ? String(sr[3]) : '',
      secondaryCode: String(sr[5] || '').trim() || null,
      gatePasscode: gateDisplay,
      studentClass: String(sr[6] || '').trim() || null,
      resumePassword: String(sr[8] || '').trim() || null,
      videoChunkLog: logs.videoChunkLog,
      metadataChunkLog: logs.metadataChunkLog,
      chunkSummary: logs.chunkSummary,
      metadataChunkSummary: logs.metadataChunkSummary,
      chunkSegmentCount: logs.chunkSegmentCount,
      metadataChunkCount: logs.metadataChunkCount
    };

    if (st === 'in_progress') inProgress.push(obj);
    else timedOut.push(obj);
  }

  // Build submissions list
  var submissions = [];
  for (var ri = 0; ri < subRows.length; ri++) {
    var row = subRows[ri];
    var rowCode = String(row[14] || '').trim().toUpperCase();
    if (rowCode !== code) continue;

    var logs2 = chunkLogSummary_(
      row.length >= 21 ? String(row[20] || '') : '',
      row.length >= 22 ? String(row[21] || '') : ''
    );

    submissions.push({
      studentName: String(row[1] || ''),
      email: String(row[2] || ''),
      score: row[5] != null ? row[5] : '',
      total: row[6] != null ? row[6] : '',
      timestamp: String(row[0] || ''),
      secondaryCode: String(row[18] || '').trim() || null,
      gatePasscode: String(row[19] || '').trim() || null,
      videoStatus: String(row[12] || '').trim() || null,
      videoChunkLog: logs2.videoChunkLog,
      metadataChunkLog: logs2.metadataChunkLog,
      chunkSegmentCount: logs2.chunkSegmentCount,
      metadataChunkCount: logs2.metadataChunkCount,
      chunkSummary: logs2.chunkSummary,
      metadataChunkSummary: logs2.metadataChunkSummary
    });
  }

  return jsonSuccess_({
    code: code,
    inProgress: inProgress,
    timedOut: timedOut,
    staleSessionsClosedOnRefresh: staleClosed,
    submissions: submissions
  });
}

function handleDeletePaper_(p) {
  var authErr = requireAdmin_(p.adminSecret);
  if (authErr) return authErr;

  var paperId = String(p.paperId || p.id || '').trim();
  if (!paperId) return jsonError_('paperId required');

  var nRef = countCodesUsingPaper_(paperId);
  if (nRef > 0) return jsonError_('Cannot delete: ' + nRef + ' test code(s) still reference this paper.');

  var sheet = getQuestionPapersSheet_();
  var row = findPaperRow_(sheet, paperId);
  if (row < 0) return jsonError_('Paper not found');

  sheet.deleteRow(row);
  SpreadsheetApp.flush();
  return jsonSuccess_({ message: 'Question paper deleted.', paperId: paperId });
}

function handleClearCodeData_(p) {
  var authErr = requireAdmin_(p.adminSecret);
  if (authErr) return authErr;

  var code = String(p.code || '').trim().toUpperCase();
  if (!code) return jsonError_('Code required');

  var scope = String(p.scope || 'in_progress').trim().toLowerCase();
  var doTrash = String(p.deleteDrive || p.trashDrive || '').trim().toLowerCase();
  doTrash = (doTrash === '1' || doTrash === 'yes' || doTrash === 'true');
  var removed = { inProgressSessions: 0, sessionRows: 0, submissions: 0, resumeCodes: 0, driveTrashed: doTrash };

  if (scope === 'all') {
    removed.submissions = deleteSubmissionsForCode_(code, doTrash);
    removed.sessionRows = deleteSessionsForCode_(code, false);
    removed.resumeCodes = deleteResumeCodesForCode_(code);
  } else if (scope === 'in_progress') {
    removed.inProgressSessions = deleteSessionsForCode_(code, true);
  } else if (scope === 'session_rows' || scope === 'sessions') {
    removed.sessionRows = deleteSessionsForCode_(code, false);
  } else if (scope === 'submissions') {
    removed.submissions = deleteSubmissionsForCode_(code, doTrash);
  } else if (scope === 'resume_codes' || scope === 'resumecodes') {
    removed.resumeCodes = deleteResumeCodesForCode_(code);
  } else {
    return jsonError_('Unknown scope. Use: in_progress, session_rows, submissions, resume_codes, or all');
  }

  SpreadsheetApp.flush();
  return jsonSuccess_({
    message: 'Data cleared for test code ' + code + (doTrash ? ' (Drive items trashed)' : ''),
    removed: removed
  });
}

function handleClearAllData_(p) {
  var authErr = requireAdmin_(p.adminSecret);
  if (authErr) return authErr;

  if (!isBulkResetConfirm_(p.confirmPhrase)) {
    return jsonError_('Wrong confirmation. Type: everything (also: delete everything, delete all test data, delete all)');
  }

  var bulk = { errors: [] };
  var sheetsToClear = [
    { name: 'submissions', fn: function() {
      var sh = getTestSubmissionsSheet_(); var lr = sh.getLastRow();
      if (lr >= 2) {
        var data = getDataRows_(sh, 20);
        for (var i = 0; i < data.length; i++) trashSubmissionArtifacts_(data[i]);
        sh.deleteRows(2, lr - 1);
        return data.length;
      }
      return 0;
    }},
    { name: 'testSessions', fn: function() {
      var sh = getTestSessionsSheet_(); var lr = sh.getLastRow();
      if (lr >= 2) { sh.deleteRows(2, lr - 1); return lr - 1; }
      return 0;
    }},
    { name: 'resumeCodes', fn: function() {
      var sh = getResumeCodesSheet_(); var lr = sh.getLastRow();
      if (lr >= 2) { sh.deleteRows(2, lr - 1); return lr - 1; }
      return 0;
    }},
    { name: 'studentPasscodes', fn: function() {
      var sh = getStudentPasscodesSheet_(); var lr = sh.getLastRow();
      if (lr >= 2) { sh.deleteRows(2, lr - 1); return lr - 1; }
      return 0;
    }},
    { name: 'testCodes', fn: function() {
      var sh = getTestCodesSheet_(); var lr = sh.getLastRow();
      if (lr >= 2) { sh.deleteRows(2, lr - 1); return lr - 1; }
      return 0;
    }},
    { name: 'feedback', fn: function() {
      var sh = getFeedbackSheet_(); var lr = sh.getLastRow();
      if (lr >= 2) { sh.deleteRows(2, lr - 1); return lr - 1; }
      return 0;
    }}
  ];

  for (var i = 0; i < sheetsToClear.length; i++) {
    try {
      bulk[sheetsToClear[i].name] = sheetsToClear[i].fn();
    } catch (e) {
      bulk.errors.push(sheetsToClear[i].name + ': ' + e.toString());
      bulk[sheetsToClear[i].name] = 0;
    }
  }

  // Trash Drive roots
  bulk.driveRoots = {};
  try { bulk.driveRoots.onlineTestUploads = trashChildren_(getOnlineTestUploadsRoot_()); } catch (e) { bulk.driveRoots.onlineTestUploadsError = e.toString(); }
  try { bulk.driveRoots.legacyZipSubmissions = trashChildren_(getLegacyZipRoot_()); } catch (e) { bulk.driveRoots.legacyZipSubmissionsError = e.toString(); }
  try { bulk.driveRoots.testFeedback = trashChildren_(getFeedbackRoot_()); } catch (e) { bulk.driveRoots.testFeedbackError = e.toString(); }

  SpreadsheetApp.flush();
  var msg = 'Bulk reset complete. Test codes, sessions, submissions, and feedback cleared; Drive roots emptied.';
  if (bulk.errors.length) msg += ' Errors: ' + bulk.errors.join(' | ');

  return jsonSuccess_({ message: msg, removed: bulk });
}

function handleDeleteStudentSession_(p) {
  var authErr = requireAdmin_(p.adminSecret);
  if (authErr) return authErr;

  var code = String(p.code || '').trim().toUpperCase();
  var email = String(p.email || '').trim();
  if (!code || !email) return jsonError_('code and email required');

  var n = deleteSessionsForStudent_(code, email);
  SpreadsheetApp.flush();
  return jsonSuccess_({
    message: n ? 'Removed ' + n + ' session row(s).' : 'No matching session row found.',
    removed: n
  });
}

function handleDeleteStudentSubmission_(p) {
  var authErr = requireAdmin_(p.adminSecret);
  if (authErr) return authErr;

  var code = String(p.code || '').trim().toUpperCase();
  var email = String(p.email || '').trim();
  if (!code || !email) return jsonError_('code and email required');

  var n = deleteSubmissionsForStudent_(code, email, p.timestamp || '');
  SpreadsheetApp.flush();
  return jsonSuccess_({
    message: n ? 'Removed ' + n + ' submission row(s).' : 'No matching submission row found.',
    removed: n
  });
}


// === UTILITY FUNCTIONS (for manual testing in Apps Script editor) ============

function testSubmission() {
  var testData = {
    timestamp: new Date().toLocaleString('en-IN', { timeZone: CONFIG.TIMEZONE }),
    fullName: 'Test Student', email: 'test@example.com', phone: '9999999999',
    school: 'Test School', course: 'IIT-JEE Preparation', class: '11',
    message: 'Test message from registration system.'
  };
  handleRegistration_(testData);
  Logger.log('Test submission completed!');
}

function checkEmailQuota() {
  Logger.log('Remaining email quota: ' + MailApp.getRemainingDailyQuota());
}

/**
 * ============================================================================
 * DEPLOYMENT INSTRUCTIONS:
 * ============================================================================
 *
 * 1. Open Google Sheets > Extensions > Apps Script
 * 2. Delete existing code, paste this entire file
 * 3. Click Save
 * 4. Set ADMIN_SECRET: File > Project properties > Script properties
 *    Key: ADMIN_SECRET   Value: (your secret string)
 * 5. Deploy > New Deployment > Web App
 *    Execute as: Me | Who has access: Anyone
 * 6. Copy the Web App URL for your frontend
 *
 * To update: Deploy > Manage deployments > Edit > New version > Deploy
 *
 * ============================================================================
 */
