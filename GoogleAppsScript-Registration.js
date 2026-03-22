/**
 * ADHYANT REGISTRATION FORM - GOOGLE APPS SCRIPT
 * 
 * This script handles form submissions from the Adhyant registration popup
 * Includes: Full Name, Email, Phone, School, Course, Class, Message
 * 
 * SETUP: Copy this entire file to Google Apps Script
 */

/**
 * Single spreadsheet (ID below) with one tab per storage domain.
 * Tabs (legacy names auto-renamed on first access):
 *   Adhyant_Storage_Registrations, Adhyant_Storage_TestSubmissions, Adhyant_Storage_TestSessions,
 *   Adhyant_Storage_TestCodes, Adhyant_Storage_ResumeCodes, Adhyant_Storage_QuestionPapers,
 *   Adhyant_Storage_TestFeedbackRows, Adhyant_Storage_TestSignUps
 * Drive roots: Adhyant_Storage_OnlineTest_Uploads, Adhyant_Storage_LegacyZipSubmissions,
 *   Adhyant_Storage_QuestionPaperImages, Adhyant_Storage_TestFeedback
 * Student uploads use folder/file prefix Student_<Name>_Mob<phone>.
 */
var ADHYANT_MAIN_SPREADSHEET_ID = '1fC7EVW1Gs_y4knbuXRHO_dZ_xb6NIw37PXri-dE55Q8';
var DRIVE_LABEL_MAX_LEN = 200;

function openAdhyantSpreadsheet() {
  return SpreadsheetApp.openById(ADHYANT_MAIN_SPREADSHEET_ID);
}

/**
 * One tab per storage domain. Legacy names (e.g. TestSubmissions) rename to canonical on first open.
 */
function getOrCreateStorageSheet(canonicalName, legacyNames, setupIfNewSheet) {
  var ss = openAdhyantSpreadsheet();
  var sheet = ss.getSheetByName(canonicalName);
  if (sheet) return sheet;
  var i;
  for (i = 0; i < (legacyNames || []).length; i++) {
    sheet = ss.getSheetByName(legacyNames[i]);
    if (sheet) {
      try {
        sheet.setName(canonicalName);
      } catch (renameErr) {
        Logger.log('Sheet tab rename skipped: ' + renameErr.toString());
      }
      return ss.getSheetByName(canonicalName) || sheet;
    }
  }
  sheet = ss.insertSheet(canonicalName);
  if (setupIfNewSheet) setupIfNewSheet(sheet);
  return sheet;
}

function getDriveFolderByPreferredName(preferredName, legacyNames) {
  var drive = DriveApp;
  var it = drive.getFoldersByName(preferredName);
  if (it.hasNext()) return it.next();
  var j;
  for (j = 0; j < (legacyNames || []).length; j++) {
    it = drive.getFoldersByName(legacyNames[j]);
    if (it.hasNext()) {
      var f = it.next();
      try {
        f.setName(preferredName);
      } catch (e2) {
        Logger.log('Drive folder rename skipped: ' + e2.toString());
      }
      return f;
    }
  }
  return drive.createFolder(preferredName);
}

function getOrCreateChildFolder(parentFolder, folderName) {
  var n = truncateDriveName(folderName, DRIVE_LABEL_MAX_LEN);
  var it = parentFolder.getFoldersByName(n);
  if (it.hasNext()) return it.next();
  return parentFolder.createFolder(n);
}

function truncateDriveName(s, maxLen) {
  var m = maxLen != null ? maxLen : DRIVE_LABEL_MAX_LEN;
  var t = String(s || '');
  if (t.length <= m) return t;
  return t.substring(0, Math.max(1, m - 5)) + '_TRNC';
}

function sanitizeDriveSegment(raw, maxChars) {
  var s = String(raw || '').replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_').replace(/_+/g, '_');
  if (maxChars && s.length > maxChars) s = s.substring(0, maxChars);
  return s || 'Unknown';
}

/** Student prefix for Drive paths and filenames: Student_<Name>_Mob<phone>. */
function studentNameMobileTagFromMetadata(metadata) {
  var name = sanitizeDriveSegment((metadata && metadata.studentName) || 'Unknown', 40);
  var digits = String((metadata && metadata.studentPhone) || '').replace(/\D/g, '').substring(0, 15);
  if (!digits) digits = 'NoMobile';
  return truncateDriveName('Student_' + name + '_Mob' + digits, 90);
}

function studentNameMobileTagFromParts(studentName, studentPhone) {
  return studentNameMobileTagFromMetadata({
    studentName: studentName || 'Unknown',
    studentPhone: studentPhone || ''
  });
}

function buildOnlineTestSessionFolderLabel(metadata, submissionKey) {
  var tag = studentNameMobileTagFromMetadata(metadata);
  var datePart = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  var testCode = String((metadata && metadata.testCode) || '').trim().toUpperCase() || 'NoCode';
  var keyShort = String(submissionKey || '').substring(0, 8);
  return truncateDriveName(tag + '__Date_' + datePart + '__Test_' + testCode + '__Key_' + keyShort, DRIVE_LABEL_MAX_LEN);
}

function fileNameStudentSubmissionMeta(metadata) {
  return truncateDriveName(studentNameMobileTagFromMetadata(metadata) + '_submission_metadata.json', DRIVE_LABEL_MAX_LEN);
}

function fileNameStudentRecording(metadata) {
  return truncateDriveName(studentNameMobileTagFromMetadata(metadata) + '_recording.webm', DRIVE_LABEL_MAX_LEN);
}

/** TestSubmissions sheet: submission key is column Q (17) → 0-based index 16. */
function findSubmissionRowBySubmissionKey_(submissionKey) {
  var k = String(submissionKey || '').trim();
  if (!k) return -1;
  var sheet = getOrCreateTestSubmissionsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var numCols = Math.max(20, sheet.getLastColumn());
  var rows = sheet.getRange(2, 1, lastRow, numCols).getValues();
  var ri;
  for (ri = 0; ri < rows.length; ri++) {
    if (String(rows[ri][16] || '').trim() === k) {
      return ri + 2;
    }
  }
  return -1;
}

function markTestSessionSubmittedFromChunked_(testCode, studentEmail) {
  try {
    var code = String(testCode || '').trim().toUpperCase();
    var em = String(studentEmail || '').trim().toLowerCase();
    if (!code || !em) return;
    var sessionsSheet = getOrCreateTestSessionsSheet();
    var sData = sessionsSheet.getDataRange().getValues();
    for (var si = 1; si < sData.length; si++) {
      if (String(sData[si][0]).trim().toUpperCase() === code &&
          String(sData[si][1]).trim().toLowerCase() === em) {
        sessionsSheet.getRange(si + 1, 5).setValue('submitted');
        break;
      }
    }
  } catch (_) {}
}

/**
 * Chunked online test: periodic metadata snapshots + ~10 min video segments in one Drive folder / submissionKey.
 * Legacy clients omit metadata.chunkedUpload — unchanged single end-of-test upload.
 */
function doPostSubmitChunkedTestMetadata_(data) {
  var metadata = data.metadata || {};
  var submissionKey = (data.submissionKey || '').toString().trim();
  if (!submissionKey) {
    submissionKey = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
  }
  var phase = String(metadata.chunkPhase || 'periodic').toLowerCase();
  var testCode = (metadata.testCode || '').toString().trim().toUpperCase();
  var secMeta = normalizeMetadataStudentKey_(metadata.secondaryCode || '');
  var gateMeta = gatePasscodeFromMetadata_(metadata);
  var snapRaw = (metadata.snapshotFileName || 'metadata_snapshot.json').toString();
  if (snapRaw.indexOf('/') >= 0 || snapRaw.indexOf('\\') >= 0) snapRaw = 'metadata_snapshot.json';
  var snapName = truncateDriveName(snapRaw, DRIVE_LABEL_MAX_LEN);
  var timestamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd_HH-mm-ss');
  var sheet = getOrCreateTestSubmissionsSheet();
  var rowNum = findSubmissionRowBySubmissionKey_(submissionKey);
  var sessionFolder = null;
  var metaBlob = Utilities.newBlob(JSON.stringify(metadata, null, 2), 'application/json', snapName);

  if (rowNum < 2) {
    if (phase === 'final') {
      var folderLabelF = buildOnlineTestSessionFolderLabel(metadata, submissionKey);
      var rootF = getOrCreateOnlineTestUploadsRootFolder();
      var studentFolderF = getOrCreateChildFolder(rootF, studentNameMobileTagFromMetadata(metadata));
      sessionFolder = getOrCreateChildFolder(studentFolderF, folderLabelF);
      var metaFileF = sessionFolder.createFile(metaBlob);
      sheet.appendRow([
        timestamp,
        metadata.studentName || '',
        metadata.studentEmail || '',
        metadata.studentAdhar || '',
        metadata.studentPhone || '',
        scoreDisplayForSubmissionRow(metadata),
        metadata.totalQuestions != null ? metadata.totalQuestions : '',
        metadata.isMobile === true ? 'Yes' : 'No',
        metadata.events ? JSON.stringify(metadata.events) : '',
        '',
        fileNameStudentRecording(metadata),
        '',
        'metadata_uploaded',
        '',
        testCode,
        metaFileF.getId(),
        submissionKey,
        sessionFolder.getId(),
        secMeta,
        gateMeta
      ]);
      markTestSessionSubmittedFromChunked_(testCode, metadata.studentEmail);
      appendMetadataChunkLogLine_(sheet, sheet.getLastRow(), metadata.segmentIndex, snapName, true);
      notifyChunkedMetadataChunkEmail_(metadata, submissionKey, snapName, sessionFolder.getId(), 'final');
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Final metadata saved',
        submissionKey: submissionKey,
        folderId: sessionFolder.getId()
      })).setMimeType(ContentService.MimeType.JSON);
    }
    var folderLabel = buildOnlineTestSessionFolderLabel(metadata, submissionKey);
    var root = getOrCreateOnlineTestUploadsRootFolder();
    var studentFolder = getOrCreateChildFolder(root, studentNameMobileTagFromMetadata(metadata));
    sessionFolder = getOrCreateChildFolder(studentFolder, folderLabel);
    var metaCreated = sessionFolder.createFile(metaBlob);
    sheet.appendRow([
      timestamp,
      metadata.studentName || '',
      metadata.studentEmail || '',
      metadata.studentAdhar || '',
      metadata.studentPhone || '',
      scoreDisplayForSubmissionRow(metadata),
      metadata.totalQuestions != null ? metadata.totalQuestions : '',
      metadata.isMobile === true ? 'Yes' : 'No',
      metadata.events ? JSON.stringify(metadata.events) : '',
        '',
        '',
        '',
        'chunked_open',
        '',
        testCode,
        metaCreated.getId(),
        submissionKey,
        sessionFolder.getId(),
        secMeta,
        gateMeta
    ]);
    appendMetadataChunkLogLine_(sheet, sheet.getLastRow(), metadata.segmentIndex, snapName, false);
    notifyChunkedMetadataChunkEmail_(metadata, submissionKey, snapName, sessionFolder.getId(), 'session_start');
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Chunk session opened',
      submissionKey: submissionKey,
      folderId: sessionFolder.getId()
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var folderId = String(sheet.getRange(rowNum, 18).getValue() || '').trim();
  try {
    sessionFolder = DriveApp.getFolderById(folderId);
  } catch (eFolder) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Session folder missing' })).setMimeType(ContentService.MimeType.JSON);
  }
  sessionFolder.createFile(metaBlob);
  appendMetadataChunkLogLine_(sheet, rowNum, metadata.segmentIndex, snapName, phase === 'final');

  if (phase === 'final') {
    markTestSessionSubmittedFromChunked_(testCode, metadata.studentEmail);
    sheet.getRange(rowNum, 5).setValue(scoreDisplayForSubmissionRow(metadata));
    sheet.getRange(rowNum, 6).setValue(metadata.totalQuestions != null ? metadata.totalQuestions : '');
    sheet.getRange(rowNum, 7).setValue(metadata.isMobile === true ? 'Yes' : 'No');
    sheet.getRange(rowNum, 8).setValue(metadata.events ? JSON.stringify(metadata.events) : '');
    if (sheet.getLastColumn() < 14) sheet.getRange(1, 14).setValue('Upload error').setFontWeight('bold');
    sheet.getRange(rowNum, 13).setValue('metadata_uploaded');
    notifyChunkedMetadataChunkEmail_(metadata, submissionKey, snapName, folderId, 'final');
  } else {
    notifyChunkedMetadataChunkEmail_(metadata, submissionKey, snapName, folderId, 'periodic');
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: phase === 'final' ? 'Final snapshot saved' : 'Periodic snapshot saved',
    submissionKey: submissionKey
  })).setMimeType(ContentService.MimeType.JSON);
}

// Main function to handle POST requests
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'No payload' })).setMimeType(ContentService.MimeType.JSON);
    }
    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid JSON' })).setMimeType(ContentService.MimeType.JSON);
    }
    if (data.action === 'setTestCodeActive') {
      return runSetTestCodeActive_(data.adminSecret, data.code, data.active);
    }
    // Online test: metadata JSON first (always), then video in separate request — same submissionKey
    if (data.action === 'submitTestMetadata' && data.metadata) {
      return doPostSubmitTestMetadata(data);
    }
    if (data.action === 'submitTestVideo' && data.videoBase64 && data.submissionKey) {
      return doPostSubmitTestVideo(data);
    }
    // Test submission: zip + metadata (from online test) — legacy single upload
    if (data.zipBase64 && data.metadata) {
      return doPostTestSubmission(data);
    }
    // Create question paper (admin only) — text/metadata only; images via uploadPaperQuestionImage
    if (data.action === 'createPaper' && data.adminSecret && data.name) {
      return doPostCreateQuestionPaper(data);
    }
    if (data.action === 'uploadPaperAnswerKey' && data.adminSecret && data.paperId && Array.isArray(data.keyQuestions)) {
      return doPostUploadPaperAnswerKey(data);
    }
    if (data.action === 'uploadPaperQuestionImage' && data.adminSecret && data.paperId) {
      return doPostUploadPaperQuestionImage(data);
    }
    // Test feedback (rating + comment) – store in sheet and in Drive folder
    if (data.action === 'submitFeedback') {
      return doPostFeedback(data);
    }
    // Sign up for online test (date choice: 15, 22, 29)
    if (data.action === 'testSignUp') {
      return doPostTestSignUp(data);
    }
    // Legacy registration form
    Logger.log('Received POST request');
    Logger.log('Parsed data: ' + JSON.stringify(data));
    
    // Get or create the sheet
    var sheet = getOrCreateSheet();
    
    // Append the data in correct order (ALL FIELDS)
    var rowData = [
      data.timestamp || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      data.fullName || '',
      data.email || '',
      data.phone || '',
      data.school || '',
      data.course || '',
      data.class || '',
      data.message || ''
    ];
    
    Logger.log('Appending row: ' + JSON.stringify(rowData));
    sheet.appendRow(rowData);
    
    // Send email notifications
    try {
      sendEmailNotifications(data);
      Logger.log('Email sent successfully');
    } catch (emailError) {
      Logger.log('Email error: ' + emailError.toString());
      // Don't fail the whole request if email fails
    }
    
    // Return success response
    return ContentService.createTextOutput(JSON.stringify({
      'status': 'success',
      'message': 'Registration saved successfully'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('Error: ' + error.toString());
    Logger.log('Error stack: ' + error.stack);
    return ContentService.createTextOutput(JSON.stringify({
      'status': 'error',
      'message': error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Sheet "Score" column: numeric score when computed; otherwise admin-only note (e.g. missing answer key).
 */
function scoreDisplayForSubmissionRow(metadata) {
  var m = metadata || {};
  if (m.score != null && m.score !== '') return m.score;
  var msg = (m.scoreMessage || '').toString().trim();
  if (msg) return msg;
  return '';
}

/**
 * Handle online test submission: save zip (recording + metadata) to Google Drive.
 * Writes a row as "pending" first, then uploads with up to 3 retries; updates row to uploaded or failed.
 * Expects JSON: { zipBase64: "...", metadata: { studentName, studentEmail, studentAdhar, ... } }
 */
function doPostTestSubmission(data) {
  var sheet, lastRow, folder, zipBlob, fileName, timestamp, metadata;
  try {
    var zipBase64 = data.zipBase64;
    metadata = data.metadata || {};
    var studentName = (metadata.studentName || 'Unknown').replace(/[/\\?%*:|"<>]/g, '-');
    timestamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd_HH-mm-ss');
    var stuTag = studentNameMobileTagFromMetadata(metadata);
    fileName = truncateDriveName(stuTag + '_TestRecording_' + timestamp + '.zip', DRIVE_LABEL_MAX_LEN);

    var zipBytes = Utilities.base64Decode(zipBase64);
    zipBlob = Utilities.newBlob(zipBytes).setContentType('application/zip').setName(fileName);
    var rootZip = getOrCreateTestSubmissionsFolder();
    var zipFolderLabel = truncateDriveName(stuTag + '__LegacyZip_' + timestamp, DRIVE_LABEL_MAX_LEN);
    folder = rootZip.createFolder(zipFolderLabel);
    sheet = getOrCreateTestSubmissionsSheet();

    var testCode = (metadata.testCode || '').toString().trim().toUpperCase();
    // Append row as pending first so admin sees "Pending" while upload runs
    var secZip = normalizeMetadataStudentKey_(metadata.secondaryCode || '');
    var gateZip = gatePasscodeFromMetadata_(metadata);
    sheet.appendRow([
      timestamp,
      metadata.studentName || '',
      metadata.studentEmail || '',
      metadata.studentAdhar || '',
      metadata.studentPhone || '',
      scoreDisplayForSubmissionRow(metadata),
      metadata.totalQuestions != null ? metadata.totalQuestions : '',
      metadata.isMobile === true ? 'Yes' : 'No',
      metadata.events ? JSON.stringify(metadata.events) : '',
      '',
      fileName,
      '',
      'pending',
      '',
      testCode,
      '',
      '',
      folder.getId(),
      secZip,
      gateZip
    ]);
    lastRow = sheet.getLastRow();

    // Upload with up to 3 retries; update status to retry_1, retry_2, retry_3 then failed if still failing
    var file = null;
    var lastError = null;
    for (var attempt = 1; attempt <= 4; attempt++) {
      if (attempt > 1) {
        sheet.getRange(lastRow, 13).setValue('retry_' + (attempt - 1));
      }
      try {
        file = folder.createFile(zipBlob);
        break;
      } catch (e) {
        lastError = e;
      }
    }

    if (!file) {
      sheet.getRange(lastRow, 13).setValue('failed');
      var errMsg = (lastError && lastError.toString()) ? lastError.toString() : 'Upload failed after retries';
      try {
        if (sheet.getLastColumn() < 14) sheet.getRange(1, 14).setValue('Upload error').setFontWeight('bold');
        sheet.getRange(lastRow, 14).setValue(errMsg);
      } catch (_) {}
      Logger.log('Test submission upload failed after 3 retries: ' + errMsg);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: errMsg
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var fileId = file.getId();
    var fileSizeBytes = file.getSize ? file.getSize() : (file.getBlob().getBytes().length);
    sheet.getRange(lastRow, 10).setValue(fileId);
    sheet.getRange(lastRow, 11).setValue(fileName);
    sheet.getRange(lastRow, 12).setValue(fileSizeBytes);
    sheet.getRange(lastRow, 13).setValue('uploaded');
    if (testCode && sheet.getLastColumn() >= 15) sheet.getRange(lastRow, 15).setValue(testCode);
    Logger.log('Test submission saved to Drive: ' + fileId);

    try {
      var sessionsSheet = getOrCreateTestSessionsSheet();
      var sData = sessionsSheet.getDataRange().getValues();
      for (var si = 1; si < sData.length; si++) {
        if (String(sData[si][0]).trim().toUpperCase() === testCode &&
            String(sData[si][1]).trim().toLowerCase() === String(metadata.studentEmail || '').trim().toLowerCase()) {
          sessionsSheet.getRange(si + 1, 5).setValue('submitted');
          break;
        }
      }
    } catch (_) {}

    try {
      var emailSubject = 'Adhyant: New test submission – ' + (metadata.studentName || 'Unknown');
      var emailBody =
        'New online test submission received\n\n' +
        'Student Name : ' + (metadata.studentName || '—') + '\n' +
        'Email        : ' + (metadata.studentEmail || '—') + '\n' +
        'Phone        : ' + (metadata.studentPhone || '—') + '\n' +
        'Score        : ' + (metadata.score != null ? metadata.score : (metadata.scoreMessage || '—')) + ' / ' + (metadata.totalQuestions != null ? metadata.totalQuestions : '—') + '\n' +
        'Mobile       : ' + (metadata.isMobile === true ? 'Yes' : 'No') + '\n' +
        'Timestamp    : ' + timestamp + '\n' +
        'File         : ' + fileName + '\n' +
        'File ID      : ' + fileId + '\n';
      sendTestNotificationEmails(emailSubject, emailBody);
    } catch (mailErr) {
      Logger.log('Test submission email notification error: ' + mailErr.toString());
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Test submission saved to Google Drive',
      fileId: fileId
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('Test submission error: ' + err.toString());
    if (sheet && lastRow) {
      try {
        sheet.getRange(lastRow, 13).setValue('failed');
        var errMsg = err.toString();
        if (sheet.getLastColumn() < 14) sheet.getRange(1, 14).setValue('Upload error').setFontWeight('bold');
        sheet.getRange(lastRow, 14).setValue(errMsg);
      } catch (_) {}
    }
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateQuestionPaperImagesRootFolder() {
  return getDriveFolderByPreferredName('Adhyant_Storage_QuestionPaperImages', ['Adhyant_QuestionPaperImages']);
}

function findQuestionPaperRowById(sheet, paperId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var want = String(paperId || '').trim();
  var colA = sheet.getRange(2, 1, lastRow, 1).getValues();
  var ri;
  for (ri = 0; ri < colA.length; ri++) {
    if (String(colA[ri][0]).trim() === want) return ri + 2;
  }
  return -1;
}

/** Count TestCodes rows whose QuestionPaperId (col D) matches. */
function countTestCodesUsingPaperId_(paperId) {
  var sheet = getOrCreateTestCodesSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var numCols = Math.max(4, sheet.getLastColumn());
  var data = sheet.getRange(2, 1, lastRow, numCols).getValues();
  var pid = String(paperId || '').trim();
  var n = 0;
  var i;
  for (i = 0; i < data.length; i++) {
    if (String(data[i][3] || '').trim() === pid) n++;
  }
  return n;
}

/**
 * Duration (minutes) for a question paper row by id (col F / index 5). Default 120.
 */
function getQuestionPaperDurationMinutesById_(paperId) {
  var want = String(paperId || '').trim();
  if (!want) return 120;
  var sheet = getOrCreateQuestionPapersSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 120;
  var numCols = Math.max(8, sheet.getLastColumn());
  var data = sheet.getRange(2, 1, lastRow, numCols).getValues();
  var i;
  for (i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === want) {
      var dm = data[i][5];
      if (dm !== null && dm !== undefined && dm !== '') {
        var n = Number(dm);
        if (!isNaN(n) && n > 0) return Math.min(600, n);
      }
      return 120;
    }
  }
  return 120;
}

/**
 * Exam duration for a primary test code: follow TestCodes → QuestionPaperId → papers sheet.
 */
function getDurationMinutesForPrimaryTestCode_(testCode) {
  var code = String(testCode || '').trim().toUpperCase();
  if (!code) return 120;
  var sheet = getOrCreateTestCodesSheet();
  var last = sheet.getLastRow();
  if (last < 2) return 120;
  var numCols = Math.max(8, sheet.getLastColumn());
  var data = sheet.getRange(2, 1, last, numCols).getValues();
  var i;
  for (i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim().toUpperCase() === code) {
      var paperId = data[i].length >= 4 && data[i][3] != null ? String(data[i][3]).trim() : '';
      return getQuestionPaperDurationMinutesById_(paperId);
    }
  }
  return 120;
}

/**
 * StartedAt cell: Date from Sheets or yyyy-MM-dd HH:mm:ss string (stored as IST).
 * @returns {number} epoch ms or NaN
 */
function sessionStartedToMillis_(startedRaw) {
  if (startedRaw instanceof Date && !isNaN(startedRaw.getTime())) {
    return startedRaw.getTime();
  }
  var s = String(startedRaw || '').trim();
  if (!s) return NaN;
  try {
    var d = Utilities.parseDate(s, 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
    return d.getTime();
  } catch (e) {
    return NaN;
  }
}

/**
 * Client auto-submit calls the server only if the browser stays open through metadata upload.
 * Stale in_progress rows (browser closed at timeout, crash, etc.) are marked timed_out when an admin
 * refreshes activity — after exam duration + grace minutes from StartedAt.
 * @returns {number} rows updated
 */
function expireStaleInProgressSessionsForTestCode_(testCode) {
  var code = String(testCode || '').trim().toUpperCase();
  if (!code) return 0;
  var durationMin = getDurationMinutesForPrimaryTestCode_(code);
  /** Extra time after timer for student to reach result screen + metadata/video upload */
  var graceMin = 45;
  var limitMs = (durationMin + graceMin) * 60 * 1000;
  var now = new Date().getTime();
  var sessionsSheet = getOrCreateTestSessionsSheet();
  var last = sessionsSheet.getLastRow();
  if (last < 2) return 0;
  var nCol = Math.max(10, sessionsSheet.getLastColumn());
  var data = sessionsSheet.getRange(2, 1, last, nCol).getValues();
  var n = 0;
  var i;
  for (i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim().toUpperCase() !== code) continue;
    if (String(data[i][4] || '').trim().toLowerCase() !== 'in_progress') continue;
    var startMs = sessionStartedToMillis_(data[i][3]);
    if (isNaN(startMs)) continue;
    if (now - startMs <= limitMs) continue;
    sessionsSheet.getRange(i + 2, 5).setValue('timed_out');
    n++;
  }
  if (n > 0) {
    SpreadsheetApp.flush();
  }
  return n;
}

/** Delete TestSessions rows for primary test code. If onlyInProgress, only status in_progress. Returns count removed. */
function deleteTestSessionsForCode_(code, onlyInProgress) {
  var want = String(code || '').trim().toUpperCase();
  if (!want) return 0;
  var sheet = getOrCreateTestSessionsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var sCols = Math.max(10, sheet.getLastColumn());
  var removed = 0;
  var r;
  for (r = lastRow; r >= 2; r--) {
    var vals = sheet.getRange(r, 1, r, sCols).getValues()[0];
    if (String(vals[0] || '').trim().toUpperCase() !== want) continue;
    if (onlyInProgress) {
      var st = String(vals[4] || '').trim().toLowerCase();
      if (st !== 'in_progress') continue;
    }
    sheet.deleteRow(r);
    removed++;
  }
  return removed;
}

/** Move a Drive file or folder to trash; ignore errors (already trashed, missing id, permissions). */
function trashDriveItemByIdSafe_(id) {
  var s = id != null ? String(id).trim() : '';
  if (!s) return;
  try {
    DriveApp.getFileById(s).setTrashed(true);
  } catch (e) {
    Logger.log('trashDriveItemByIdSafe_: ' + s + ' — ' + e.toString());
  }
}

/**
 * From TestSubmissions row values (0-based): legacy zip File ID (col 10), Metadata file ID (col 16),
 * Drive folder ID (col 18). Trashes metadata and zip first, then session folder (contains recording etc.).
 */
function trashDriveArtifactsForSubmissionRow_(vals) {
  if (!vals || vals.length < 10) return;
  var legacyZipId = vals[9] != null ? String(vals[9]).trim() : '';
  var metaId = vals.length > 15 && vals[15] != null ? String(vals[15]).trim() : '';
  var folderId = vals.length > 17 && vals[17] != null ? String(vals[17]).trim() : '';
  trashDriveItemByIdSafe_(metaId);
  trashDriveItemByIdSafe_(legacyZipId);
  trashDriveItemByIdSafe_(folderId);
}

/** Trash immediate child folders and files under a root (e.g. empty uploads after sheet wipe). Returns counts. */
function trashAllImmediateChildrenOfFolder_(folder) {
  var out = { folders: 0, files: 0 };
  if (!folder) return out;
  var sub = folder.getFolders();
  while (sub.hasNext()) {
    try {
      sub.next().setTrashed(true);
      out.folders++;
    } catch (e) {
      Logger.log('trashAllImmediateChildrenOfFolder_ folder: ' + e.toString());
    }
  }
  var files = folder.getFiles();
  while (files.hasNext()) {
    try {
      files.next().setTrashed(true);
      out.files++;
    } catch (e2) {
      Logger.log('trashAllImmediateChildrenOfFolder_ file: ' + e2.toString());
    }
  }
  return out;
}

/** Bulk reset confirmation: case-insensitive, any spacing. */
function isBulkResetConfirmOk_(raw) {
  var p = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return (
    p === 'everything' ||
    p === 'delete everything' ||
    p === 'delete all test data' ||
    p === 'delete all' ||
    p === 'yes delete all'
  );
}

/** Read all submission rows, trash linked Drive items, delete all data rows. Returns { rows: number }. */
function clearAllSubmissionsSheetAndTrashDrive_() {
  var sheet = getOrCreateTestSubmissionsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { rows: 0 };
  var numCols = Math.max(20, sheet.getLastColumn());
  var data = sheet.getRange(2, 1, lastRow, numCols).getValues();
  var i;
  for (i = 0; i < data.length; i++) {
    trashDriveArtifactsForSubmissionRow_(data[i]);
  }
  sheet.deleteRows(2, lastRow - 1);
  return { rows: data.length };
}

/** Delete TestSubmissions rows where col 15 = test code. If trashDrive, move linked Drive files/folders to trash first. */
function deleteSubmissionsForTestCode_(code, trashDrive) {
  var want = String(code || '').trim().toUpperCase();
  if (!want) return 0;
  var doTrash = trashDrive === true;
  var sheet = getOrCreateTestSubmissionsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var numCols = Math.max(19, sheet.getLastColumn());
  var removed = 0;
  var r;
  for (r = lastRow; r >= 2; r--) {
    var vals = sheet.getRange(r, 1, r, numCols).getValues()[0];
    if (String(vals[14] || '').trim().toUpperCase() !== want) continue;
    if (doTrash) trashDriveArtifactsForSubmissionRow_(vals);
    sheet.deleteRow(r);
    removed++;
  }
  return removed;
}

/** Delete ResumeCodes rows where PrimaryCode (col B) matches. Returns count removed. */
function deleteResumeCodesForPrimary_(code) {
  var want = String(code || '').trim().toUpperCase();
  if (!want) return 0;
  var sheet = getOrCreateResumeCodesSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var removed = 0;
  var r;
  for (r = lastRow; r >= 2; r--) {
    var prim = String(sheet.getRange(r, 2).getValue() || '').trim().toUpperCase();
    if (prim !== want) continue;
    sheet.deleteRow(r);
    removed++;
  }
  return removed;
}

/** Delete TestSessions rows matching code + email (any status). Returns count removed. */
function deleteTestSessionsForCodeAndEmail_(code, email) {
  var wantCode = String(code || '').trim().toUpperCase();
  var wantEmail = String(email || '').trim().toLowerCase();
  if (!wantCode || !wantEmail) return 0;
  var sheet = getOrCreateTestSessionsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var sCols = Math.max(7, sheet.getLastColumn());
  var removed = 0;
  var r;
  for (r = lastRow; r >= 2; r--) {
    var vals = sheet.getRange(r, 1, r, sCols).getValues()[0];
    if (String(vals[0] || '').trim().toUpperCase() !== wantCode) continue;
    if (String(vals[1] || '').trim().toLowerCase() !== wantEmail) continue;
    sheet.deleteRow(r);
    removed++;
  }
  return removed;
}

/** Delete TestSubmissions rows for code + email; if timestamp provided, must match col A string. Returns count removed. */
function deleteSubmissionsForCodeEmailTimestamp_(code, email, timestamp) {
  var wantCode = String(code || '').trim().toUpperCase();
  var wantEmail = String(email || '').trim().toLowerCase();
  if (!wantCode || !wantEmail) return 0;
  var ts = timestamp != null ? String(timestamp).trim() : '';
  var sheet = getOrCreateTestSubmissionsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var numCols = Math.max(19, sheet.getLastColumn());
  var removed = 0;
  var r;
  for (r = lastRow; r >= 2; r--) {
    var vals = sheet.getRange(r, 1, r, numCols).getValues()[0];
    if (String(vals[14] || '').trim().toUpperCase() !== wantCode) continue;
    if (String(vals[2] || '').trim().toLowerCase() !== wantEmail) continue;
    if (ts) {
      var rowTs = vals[0] != null ? String(vals[0]).trim() : '';
      if (rowTs !== ts) continue;
    }
    sheet.deleteRow(r);
    removed++;
  }
  return removed;
}

function getOrCreatePaperImageSubfolder(paperId, paperDisplayName) {
  var root = getOrCreateQuestionPaperImagesRootFolder();
  var safeName = sanitizeDriveSegment(paperDisplayName || 'Paper', 55);
  var safeId = sanitizeDriveSegment(String(paperId || ''), 35);
  var folderName = truncateDriveName('Paper_' + safeName + '__ID_' + safeId, DRIVE_LABEL_MAX_LEN);
  var it = root.getFoldersByName(folderName);
  if (it.hasNext()) return it.next();
  var leg = root.getFoldersByName(String(paperId || '').trim());
  if (leg.hasNext()) {
    var fold = leg.next();
    try {
      fold.setName(folderName);
    } catch (eRen) {}
    return fold;
  }
  return root.createFolder(folderName);
}

/**
 * One question image per request (avoids multi‑MB POST body limits on Apps Script / proxies).
 */
function doPostUploadPaperQuestionImage(data) {
  try {
    var adminSecret = data.adminSecret || '';
    var storedSecret = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
    if (!adminSecret || adminSecret !== storedSecret) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
    }
    var paperId = String(data.paperId || '').trim();
    var qIndex = parseInt(data.questionIndex, 10);
    var b64 = data.imageBase64;
    if (!paperId || isNaN(qIndex) || qIndex < 0 || !b64 || String(b64).length < 20) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid image upload payload' })).setMimeType(ContentService.MimeType.JSON);
    }
    var sheet = getOrCreateQuestionPapersSheet();
    var row = findQuestionPaperRowById(sheet, paperId);
    if (row < 0) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Paper not found' })).setMimeType(ContentService.MimeType.JSON);
    }
    var questionsJson = sheet.getRange(row, 5).getValue();
    var questions = [];
    try {
      questions = questionsJson ? JSON.parse(String(questionsJson)) : [];
    } catch (e) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid stored questions' })).setMimeType(ContentService.MimeType.JSON);
    }
    if (!Array.isArray(questions) || qIndex >= questions.length) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Bad question index' })).setMimeType(ContentService.MimeType.JSON);
    }
    var paperDisplayName = String(sheet.getRange(row, 2).getValue() || 'Untitled').trim() || 'Untitled';
    var folder = getOrCreatePaperImageSubfolder(paperId, paperDisplayName);
    var bytes = Utilities.base64Decode(String(b64));
    var paperFilePrefix = truncateDriveName('Paper_' + sanitizeDriveSegment(paperDisplayName, 40) + '__ID_' + sanitizeDriveSegment(paperId, 30) + '_Q' + (qIndex + 1), DRIVE_LABEL_MAX_LEN - 5) + '.jpg';
    var blob = Utilities.newBlob(bytes, 'image/jpeg', paperFilePrefix);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var q = questions[qIndex];
    if (!q || typeof q !== 'object') {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid question slot' })).setMimeType(ContentService.MimeType.JSON);
    }
    q.imageFileId = file.getId();
    delete q.imageBase64;
    delete q.questionImage;
    var outJson = JSON.stringify(questions);
    if (outJson.length > 50000) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Question set too large for sheet cell after adding image' })).setMimeType(ContentService.MimeType.JSON);
    }
    sheet.getRange(row, 5).setValue(outJson);
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', questionIndex: qIndex, imageFileId: q.imageFileId })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPostCreateQuestionPaper(data) {
  try {
    var adminSecret = data.adminSecret || '';
    var storedSecret = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
    if (!adminSecret || adminSecret !== storedSecret) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
    }
    var sheet = getOrCreateQuestionPapersSheet();
    var id = 'paper_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    var name = (data.name || 'Untitled').toString().trim().substring(0, 500);
    var createdAt = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
    var createdBy = (data.adminEmail || '').toString().trim();
    var questions = data.questions;
    if (!Array.isArray(questions)) questions = [];
    var qi;
    for (qi = 0; qi < questions.length; qi++) {
      var q = questions[qi];
      if (!q || typeof q !== 'object') continue;
      delete q.imageBase64;
      delete q.questionImage;
    }
    var questionsJson = JSON.stringify(questions);
    if (questionsJson.length > 50000) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Question set too large' })).setMimeType(ContentService.MimeType.JSON);
    }
    var durationMinutes = Number(data.durationMinutes);
    if (isNaN(durationMinutes) || durationMinutes < 1) durationMinutes = 120;
    if (durationMinutes > 600) durationMinutes = 600;
    var paperMetaStr = (data.paperMeta || '').toString().trim();
    if (paperMetaStr.length > 12000) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'PaperMetaJson too large' })).setMimeType(ContentService.MimeType.JSON);
    }
    var keyCol = 'No';
    if (data.answerKeyPresent === true || String(data.answerKeyPresent || '').toLowerCase() === 'yes') {
      keyCol = 'Yes';
    }
    sheet.appendRow([id, name, createdAt, createdBy, questionsJson, durationMinutes, paperMetaStr, keyCol]);
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', id: id })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Merge answers from a separate answer-key PDF (client-parsed) into QuestionsJson; set AnswerKeyPresent = Yes.
 */
function doPostUploadPaperAnswerKey(data) {
  try {
    var adminSecret = data.adminSecret || '';
    var storedSecret = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
    if (!adminSecret || adminSecret !== storedSecret) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
    }
    var paperId = (data.paperId || '').toString().trim();
    if (!paperId) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'paperId required' })).setMimeType(ContentService.MimeType.JSON);
    }
    var updates = data.keyQuestions;
    if (!Array.isArray(updates) || updates.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'keyQuestions array required' })).setMimeType(ContentService.MimeType.JSON);
    }
    var sheet = getOrCreateQuestionPapersSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Paper not found' })).setMimeType(ContentService.MimeType.JSON);
    }
    var numCols = Math.max(8, sheet.getLastColumn());
    var rowData = sheet.getRange(2, 1, lastRow, numCols).getValues();
    var i;
    var foundRow = -1;
    var questions = [];
    for (i = 0; i < rowData.length; i++) {
      if (String(rowData[i][0]).trim() === paperId) {
        foundRow = i + 2;
        var qj = rowData[i][4] ? String(rowData[i][4]) : '[]';
        try {
          questions = JSON.parse(qj);
        } catch (e) {
          questions = [];
        }
        break;
      }
    }
    if (foundRow < 0) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Paper not found' })).setMimeType(ContentService.MimeType.JSON);
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Paper has no questions' })).setMimeType(ContentService.MimeType.JSON);
    }
    var ui;
    var merged = 0;
    for (ui = 0; ui < updates.length; ui++) {
      var k = updates[ui];
      if (!k || typeof k !== 'object') continue;
      var pnum = k.paperQuestionNum != null ? Number(k.paperQuestionNum) : NaN;
      var qidx = k.questionIndex != null ? Number(k.questionIndex) : (k.index != null ? Number(k.index) : NaN);
      var target = -1;
      if (!isNaN(pnum) && pnum > 0) {
        var ti;
        for (ti = 0; ti < questions.length; ti++) {
          var pq = questions[ti];
          if (pq && Number(pq.paperQuestionNum) === pnum) {
            target = ti;
            break;
          }
        }
      }
      if (target < 0 && !isNaN(qidx) && qidx >= 0 && qidx < questions.length) {
        target = qidx;
      }
      // CSV keys often use serial Q1..Qn without paperQuestionNum on each question — match by position
      if (target < 0 && !isNaN(pnum) && pnum >= 1 && pnum <= questions.length) {
        target = Math.floor(pnum) - 1;
      }
      if (target < 0) continue;
      if (k.answer !== undefined) {
        questions[target].answer = k.answer;
        merged++;
      }
      var t = String(k.type || '').toLowerCase();
      if (t === 'mcq' || t === 'integer') {
        questions[target].type = t;
      }
      if (Array.isArray(k.options) && k.options.length > 0) {
        questions[target].options = k.options;
      }
      if (k.min != null && !isNaN(Number(k.min))) {
        questions[target].min = Number(k.min);
      }
      if (k.max != null && !isNaN(Number(k.max))) {
        questions[target].max = Number(k.max);
      }
    }
    if (merged === 0) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'No answers matched any question (use paperQuestionNum or question index order)' })).setMimeType(ContentService.MimeType.JSON);
    }
    var newJson = JSON.stringify(questions);
    if (newJson.length > 50000) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Question set too large after merge' })).setMimeType(ContentService.MimeType.JSON);
    }
    sheet.getRange(foundRow, 5).setValue(newJson);
    if (sheet.getLastColumn() < 8) {
      sheet.getRange(1, 8).setValue('AnswerKeyPresent').setFontWeight('bold');
    }
    sheet.getRange(foundRow, 8).setValue('Yes');
    SpreadsheetApp.flush();
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', merged: merged, paperId: paperId })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

/** Legacy single-zip test submissions (older client flow). */
function getOrCreateTestSubmissionsFolder() {
  return getDriveFolderByPreferredName('Adhyant_Storage_LegacyZipSubmissions', ['Adhyant_Test_Submissions']);
}

/**
 * Per-attempt uploads: metadata JSON + recording.webm, grouped under structured student folders.
 */
function getOrCreateOnlineTestUploadsRootFolder() {
  return getDriveFolderByPreferredName('Adhyant_Storage_OnlineTest_Uploads', ['Adhyant_OnlineTest_Uploads']);
}

/**
 * Step 1: create session subfolder, save submission_metadata.json, append sheet row (video pending).
 */
function doPostSubmitTestMetadata(data) {
  var sheet;
  var lastRow;
  try {
    var metadata = data.metadata || {};
    if (metadata.chunkedUpload === true) {
      return doPostSubmitChunkedTestMetadata_(data);
    }
    var submissionKey = (data.submissionKey || '').toString().trim();
    if (!submissionKey) {
      submissionKey = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    }
    var studentName = (metadata.studentName || 'Unknown').replace(/[/\\?%*:|"<>]/g, '-');
    var timestamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd_HH-mm-ss');
    var folderLabel = buildOnlineTestSessionFolderLabel(metadata, submissionKey);
    var root = getOrCreateOnlineTestUploadsRootFolder();
    var studentRootTag = studentNameMobileTagFromMetadata(metadata);
    var studentFolder = getOrCreateChildFolder(root, studentRootTag);
    var sessionFolder = getOrCreateChildFolder(studentFolder, folderLabel);

    var jsonStr = JSON.stringify(metadata, null, 2);
    var metaBlob = Utilities.newBlob(jsonStr, 'application/json', fileNameStudentSubmissionMeta(metadata));
    var metaFile = sessionFolder.createFile(metaBlob);

    var testCode = (metadata.testCode || '').toString().trim().toUpperCase();
    var secMeta = normalizeMetadataStudentKey_(metadata.secondaryCode || '');
    var gateMeta = gatePasscodeFromMetadata_(metadata);
    sheet = getOrCreateTestSubmissionsSheet();
    sheet.appendRow([
      timestamp,
      metadata.studentName || '',
      metadata.studentEmail || '',
      metadata.studentAdhar || '',
      metadata.studentPhone || '',
      scoreDisplayForSubmissionRow(metadata),
      metadata.totalQuestions != null ? metadata.totalQuestions : '',
      metadata.isMobile === true ? 'Yes' : 'No',
      metadata.events ? JSON.stringify(metadata.events) : '',
      '',
      fileNameStudentRecording(metadata),
      '',
      'metadata_uploaded',
      '',
      testCode,
      metaFile.getId(),
      submissionKey,
      sessionFolder.getId(),
      secMeta,
      gateMeta
    ]);
    lastRow = sheet.getLastRow();

    try {
      var sessionsSheet = getOrCreateTestSessionsSheet();
      var sData = sessionsSheet.getDataRange().getValues();
      for (var si = 1; si < sData.length; si++) {
        if (String(sData[si][0]).trim().toUpperCase() === testCode &&
            String(sData[si][1]).trim().toLowerCase() === String(metadata.studentEmail || '').trim().toLowerCase()) {
          sessionsSheet.getRange(si + 1, 5).setValue('submitted');
          break;
        }
      }
    } catch (_) {}

    try {
      var emailSubject = 'Adhyant: Test metadata received – ' + (metadata.studentName || 'Unknown');
      var emailBody =
        'Metadata saved (video may follow separately).\n\n' +
        'Student Name : ' + (metadata.studentName || '—') + '\n' +
        'Email        : ' + (metadata.studentEmail || '—') + '\n' +
        'Phone        : ' + (metadata.studentPhone || '—') + '\n' +
        'Submission   : ' + submissionKey + '\n' +
        'Folder ID    : ' + sessionFolder.getId() + '\n' +
        'Metadata file: ' + metaFile.getId() + '\n';
      sendTestNotificationEmails(emailSubject, emailBody);
    } catch (mailErr) {
      Logger.log('Metadata notification error: ' + mailErr.toString());
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Metadata saved',
      submissionKey: submissionKey,
      metadataFileId: metaFile.getId(),
      folderId: sessionFolder.getId()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('submitTestMetadata error: ' + err.toString());
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Step 2: add recording.webm into the same session folder; update sheet row by submissionKey.
 */
function doPostSubmitTestVideo(data) {
  var sheet;
  try {
    var submissionKey = (data.submissionKey || '').toString().trim();
    var videoBase64 = data.videoBase64;
    if (!submissionKey || !videoBase64) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'submissionKey and videoBase64 required' })).setMimeType(ContentService.MimeType.JSON);
    }

    var metaMin = data.metadata || {};
    var chunkedVid = data.chunkedUpload === true;
    var isLastChunk = data.isLastChunk === true;
    var segIxVid = -1;
    var videoBytes = Utilities.base64Decode(videoBase64);
    var nameFromClient = (data.videoFileName || '').toString().trim();
    if (nameFromClient.indexOf('/') >= 0 || nameFromClient.indexOf('\\') >= 0) nameFromClient = '';
    var recName = nameFromClient ? truncateDriveName(nameFromClient, DRIVE_LABEL_MAX_LEN) : fileNameStudentRecording(metaMin);
    var videoBlob = Utilities.newBlob(videoBytes, 'video/webm', recName);

    sheet = getOrCreateTestSubmissionsSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'No submission row for key' })).setMimeType(ContentService.MimeType.JSON);
    }
    var numCols = Math.max(20, sheet.getLastColumn());
    var rows = sheet.getRange(2, 1, lastRow, numCols).getValues();
    var found = -1;
    var keyCol = 16;
    var folderCol = 17;
    for (var ri = 0; ri < rows.length; ri++) {
      if (String(rows[ri][keyCol] || '').trim() === submissionKey) {
        found = ri + 2;
        break;
      }
    }

    var folder = null;
    if (found > 0) {
      var folderId = rows[found - 2][folderCol];
      if (folderId) {
        try {
          folder = DriveApp.getFolderById(String(folderId));
        } catch (e) {
          folder = null;
        }
      }
    }
    if (!folder) {
      var root2 = getOrCreateOnlineTestUploadsRootFolder();
      var stuTag2 = studentNameMobileTagFromMetadata(metaMin);
      var studentFolder2 = getOrCreateChildFolder(root2, stuTag2);
      var orphanLabel = truncateDriveName(stuTag2 + '__VideoOrphan__Key_' + submissionKey.substring(0, 8), DRIVE_LABEL_MAX_LEN);
      folder = getOrCreateChildFolder(studentFolder2, orphanLabel);
    }

    var file = null;
    var lastError = null;
    for (var attempt = 1; attempt <= 4; attempt++) {
      try {
        file = folder.createFile(videoBlob);
        break;
      } catch (e) {
        lastError = e;
      }
    }
    if (!file) {
      if (found > 0) {
        sheet.getRange(found, 13).setValue('video_failed');
        if (sheet.getLastColumn() >= 14) sheet.getRange(found, 14).setValue((lastError && lastError.toString()) ? lastError.toString() : 'Video upload failed');
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: lastError ? lastError.toString() : 'Video upload failed'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var fileId = file.getId();
    var fileSizeBytes = file.getSize ? file.getSize() : (file.getBlob().getBytes().length);

    if (found > 0) {
      sheet.getRange(found, 10).setValue(fileId);
      sheet.getRange(found, 11).setValue(recName);
      sheet.getRange(found, 12).setValue(fileSizeBytes);
      if (chunkedVid && !isLastChunk) {
        sheet.getRange(found, 13).setValue('chunked_partial');
        if (sheet.getLastColumn() >= 14) sheet.getRange(found, 14).setValue('');
      } else {
        sheet.getRange(found, 13).setValue('uploaded');
        if (sheet.getLastColumn() >= 14) sheet.getRange(found, 14).setValue('');
      }
      if (chunkedVid && found > 0) {
        var segIxRaw = data.chunkSegmentIndex;
        segIxVid = parseInt(String(segIxRaw != null ? segIxRaw : ''), 10);
        if (isNaN(segIxVid)) segIxVid = -1;
        appendChunkUploadLogLine_(sheet, found, segIxVid, recName, isLastChunk);
      }
      var secVid = normalizeMetadataStudentKey_(metaMin.secondaryCode || '');
      if (secVid && sheet.getLastColumn() >= 19) {
        var curS = String(sheet.getRange(found, 19).getValue() || '').trim();
        if (!curS) sheet.getRange(found, 19).setValue(secVid);
      }
      var gateVid = gatePasscodeFromMetadata_(metaMin);
      if (gateVid && sheet.getLastColumn() >= 20) {
        var curG = String(sheet.getRange(found, 20).getValue() || '').trim();
        if (!curG) sheet.getRange(found, 20).setValue(gateVid);
      }
    } else {
      var timestamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd_HH-mm-ss');
      var testCode = (metaMin.testCode || '').toString().trim().toUpperCase();
      var secOrphan = normalizeMetadataStudentKey_(metaMin.secondaryCode || '');
      var gateOrphan = gatePasscodeFromMetadata_(metaMin);
      sheet.appendRow([
        timestamp,
        metaMin.studentName || '',
        metaMin.studentEmail || '',
        metaMin.studentAdhar || '',
        metaMin.studentPhone || '',
        metaMin.score != null ? metaMin.score : '',
        metaMin.totalQuestions != null ? metaMin.totalQuestions : '',
        metaMin.isMobile === true ? 'Yes' : 'No',
        metaMin.events ? JSON.stringify(metaMin.events) : '',
        fileId,
        recName,
        fileSizeBytes,
        'uploaded',
        '',
        testCode,
        '',
        submissionKey,
        folder.getId(),
        secOrphan,
        gateOrphan
      ]);
    }

    if (chunkedVid) {
      var folderIdEmail = '';
      if (found > 0) {
        try {
          folderIdEmail = String(sheet.getRange(found, 18).getValue() || '').trim();
        } catch (eMailFolder) {}
      }
      if (!folderIdEmail && folder) folderIdEmail = folder.getId();
      var tcVid = (metaMin.testCode || '').toString().trim().toUpperCase() || '—';
      notifyChunkedVideoChunkEmail_(
        metaMin,
        submissionKey,
        recName,
        fileId,
        fileSizeBytes,
        isLastChunk,
        folderIdEmail,
        tcVid,
        segIxVid
      );
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Video saved',
      fileId: fileId
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('submitTestVideo error: ' + err.toString());
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/** Feedback CSV files on Drive, grouped by student name + mobile. */
function getOrCreateTestFeedbackFolder() {
  return getDriveFolderByPreferredName('Adhyant_Storage_TestFeedback', ['Adhyant_Test_Feedback']);
}

/**
 * Feedback storage tab.
 */
function getOrCreateFeedbackSheet() {
  var sheet = getOrCreateStorageSheet('Adhyant_Storage_TestFeedbackRows', ['Feedback'], function (s) {
    s.getRange(1, 1, 1, 9).setValues([['Timestamp', 'Rating', 'RatingLabel', 'Comment', 'Student Name', 'Student Email', 'Student Phone', 'Class', 'Drive status']]);
    s.getRange(1, 1, 1, 9).setFontWeight('bold');
  });
  if (sheet.getLastColumn() === 8) {
    var h8 = String(sheet.getRange(1, 8).getValue() || '').trim();
    if (h8 === 'Drive status') {
      sheet.insertColumnBefore(8);
      sheet.getRange(1, 8).setValue('Class').setFontWeight('bold');
    }
  }
  if (sheet.getLastColumn() < 8) {
    sheet.getRange(1, 8).setValue('Drive status').setFontWeight('bold');
  }
  if (sheet.getLastColumn() < 9) {
    sheet.getRange(1, 9).setValue('Drive status').setFontWeight('bold');
  }
  return sheet;
}

var RATING_LABELS = { 1: 'Poor', 2: 'Fair', 3: 'OK', 4: 'Good', 5: 'Great' };

/**
 * Handle feedback submission: append row as "pending", then create file in Drive with up to 3 retries; update to uploaded or failed.
 * Expects JSON: { action: 'submitFeedback', rating: 1-5, comment: string, studentName?: string, studentEmail?: string }
 */
function doPostFeedback(data) {
  var sheet, lastRow, folder, blob;
  try {
    var rating = data.rating != null ? Number(data.rating) : 0;
    var comment = (data.comment || '').toString().trim();
    var studentName = (data.studentName || '').toString().trim();
    var studentEmail = (data.studentEmail || '').toString().trim();
    var studentPhone = (data.studentPhone || '').toString().trim();
    var studentClassFb = (data.studentClass || data.class || '').toString().trim();
    var timestamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
    var ratingLabel = RATING_LABELS[rating] || '';

    sheet = getOrCreateFeedbackSheet();
    sheet.appendRow([timestamp, rating, ratingLabel, comment, studentName, studentEmail, studentPhone, studentClassFb, 'pending']);
    lastRow = sheet.getLastRow();

    var feedbackRoot = getOrCreateTestFeedbackFolder();
    var stuFbTag = studentNameMobileTagFromParts(studentName, studentPhone);
    folder = getOrCreateChildFolder(feedbackRoot, stuFbTag);
    var fileTimestamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd_HH-mm-ss');
    var fileName = truncateDriveName(stuFbTag + '_Feedback_' + fileTimestamp + '.csv', DRIVE_LABEL_MAX_LEN);
    var csv = 'Timestamp,Rating,RatingLabel,Comment,Student Name,Student Email,Student Phone,Class\n' +
      '"' + timestamp + '",' + rating + ',"' + ratingLabel.replace(/"/g, '""') + '","' + (comment.replace(/"/g, '""')) + '","' + studentName.replace(/"/g, '""') + '","' + studentEmail.replace(/"/g, '""') + '","' + (studentPhone.replace(/"/g, '""')) + '","' + (studentClassFb.replace(/"/g, '""')) + '"';
    blob = Utilities.newBlob(csv, 'text/csv', fileName);

    var file = null;
    var lastError = null;
    for (var attempt = 1; attempt <= 4; attempt++) {
      if (attempt > 1) {
        sheet.getRange(lastRow, 9).setValue('retry_' + (attempt - 1));
      }
      try {
        file = folder.createFile(blob);
        break;
      } catch (e) {
        lastError = e;
      }
    }

    if (!file) {
      sheet.getRange(lastRow, 9).setValue('failed');
      Logger.log('Feedback Drive upload failed after 3 retries: ' + (lastError && lastError.toString()));
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: lastError ? lastError.toString() : 'Upload failed after retries'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    sheet.getRange(lastRow, 9).setValue('uploaded');

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Feedback saved to Google Drive'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('Feedback error: ' + err.toString());
    if (sheet && lastRow) {
      try {
        sheet.getRange(lastRow, 9).setValue('failed');
      } catch (_) {}
    }
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/** Email addresses to notify for test form sign-ups and test submissions */
var TEST_NOTIFICATION_EMAILS = ['sumitrairkt@gmail.com', 'k.artiism06@gmail.com', 'adhyantforyou@gmail.com'];

function sendTestNotificationEmails(subject, body) {
  var emails = TEST_NOTIFICATION_EMAILS;
  for (var i = 0; i < emails.length; i++) {
    var to = (emails[i] || '').toString().trim();
    if (!to) continue;
    try {
      MailApp.sendEmail({ to: to, subject: subject, body: body });
      Logger.log('Test notification sent to: ' + to);
    } catch (e) {
      Logger.log('Failed to send test notification to ' + to + ': ' + e.toString());
    }
  }
}

/** Email admins for each chunked metadata JSON saved (session start, periodic, or final). */
function notifyChunkedMetadataChunkEmail_(metadata, submissionKey, snapName, folderId, kind) {
  var name = (metadata.studentName || 'Unknown').toString();
  var em = (metadata.studentEmail || '—').toString();
  var code = (metadata.testCode || '').toString().trim().toUpperCase() || '—';
  var seg = metadata.segmentIndex != null && metadata.segmentIndex !== '' ? String(metadata.segmentIndex) : '—';
  var label =
    kind === 'final' ? 'FINAL metadata snapshot' : kind === 'session_start' ? 'Session started (first metadata)' : 'Periodic metadata snapshot';
  var subj = 'Adhyant: [' + label + '] ' + name + ' · ' + code;
  var body =
    'Chunked test — metadata JSON saved on Drive\n\n' +
    'Type         : ' +
    label +
    '\n' +
    'File         : ' +
    (snapName || '—') +
    '\n' +
    'Segment idx  : ' +
    seg +
    '\n' +
    'Student      : ' +
    name +
    '\n' +
    'Email        : ' +
    em +
    '\n' +
    'Test code    : ' +
    code +
    '\n' +
    'Submission   : ' +
    submissionKey +
    '\n' +
    'Folder ID    : ' +
    (folderId || '—') +
    '\n';
  try {
    sendTestNotificationEmails(subj, body);
  } catch (e) {
    Logger.log('notifyChunkedMetadataChunkEmail_: ' + e.toString());
  }
}

/** Email admins for each chunked video segment saved (partial or final). */
function notifyChunkedVideoChunkEmail_(metaMin, submissionKey, recName, fileId, sizeBytes, isFinal, folderId, testCode, segmentIndex) {
  var name = (metaMin.studentName || 'Unknown').toString();
  var em = (metaMin.studentEmail || '—').toString();
  var segStr =
    segmentIndex != null && !isNaN(Number(segmentIndex)) && Number(segmentIndex) >= 0 ? String(Number(segmentIndex)) : '—';
  var label = isFinal ? 'FINAL video chunk' : 'Partial video chunk';
  var subj = 'Adhyant: [' + label + '] ' + name + ' · ' + (testCode || '—');
  var sizeMb = sizeBytes != null && !isNaN(Number(sizeBytes)) ? (Number(sizeBytes) / (1024 * 1024)).toFixed(2) + ' MB' : '—';
  var body =
    'Chunked test — recording segment saved on Drive\n\n' +
    'Type         : ' +
    label +
    '\n' +
    'File         : ' +
    (recName || '—') +
    '\n' +
    'Segment idx  : ' +
    segStr +
    '\n' +
    'Size         : ' +
    sizeMb +
    '\n' +
    'File ID      : ' +
    (fileId || '—') +
    '\n' +
    'Student      : ' +
    name +
    '\n' +
    'Email        : ' +
    em +
    '\n' +
    'Test code    : ' +
    (testCode || '—') +
    '\n' +
    'Submission   : ' +
    submissionKey +
    '\n' +
    'Folder ID    : ' +
    (folderId || '—') +
    '\n';
  try {
    sendTestNotificationEmails(subj, body);
  } catch (e) {
    Logger.log('notifyChunkedVideoChunkEmail_: ' + e.toString());
  }
}

/**
 * Handle sign-up for test (online or offline): store in TestSignUps sheet.
 * Expects JSON: { action: 'testSignUp', fullName, email, phone, studentClass?, testType: 'online'|'offline', testDate, message? }
 */
function doPostTestSignUp(data) {
  try {
    var fullName = (data.fullName || '').toString().trim();
    var email = (data.email || '').toString().trim();
    var phone = (data.phone || '').toString().trim().replace(/\s/g, '');
    var studentClass = (data.studentClass || data.classOrGrade || data.class || '').toString().trim();
    var testType = (data.testType || 'online').toString().trim();
    var testDate = (data.testDate || '').toString().trim();
    var message = (data.message || '').toString().trim();
    var timestamp = data.timestamp || Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
    var sheet = getOrCreateTestSignUpsSheet();
    sheet.appendRow([timestamp, fullName, email, phone, studentClass, testType, testDate, message]);
    try {
      var emailSubject = 'Adhyant: New test form sign-up – ' + (fullName || 'Unknown');
      var emailBody =
        'New test form sign-up received\n\n' +
        'Full Name : ' + (fullName || '—') + '\n' +
        'Email     : ' + (email || '—') + '\n' +
        'Phone     : ' + (phone || '—') + '\n' +
        'Class     : ' + (studentClass || '—') + '\n' +
        'Test Type : ' + (testType || '—') + '\n' +
        'Test Date : ' + (testDate || '—') + '\n' +
        'Message   : ' + (message || '—') + '\n' +
        'Timestamp : ' + timestamp + '\n';
      sendTestNotificationEmails(emailSubject, emailBody);
    } catch (mailErr) {
      Logger.log('Test sign-up email notification error: ' + mailErr.toString());
    }
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Test sign-up saved'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('Test sign-up error: ' + err.toString());
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/** Legacy 7-col layout had Test Type in column E — insert Class before it. */
function migrateTestSignUpsSheetForClass(sheet) {
  var lc = sheet.getLastColumn();
  if (lc >= 8) return;
  var h5 = String(sheet.getRange(1, 5).getValue() || '').trim();
  if (lc === 7 && h5 === 'Test Type') {
    sheet.insertColumnBefore(5);
    sheet.getRange(1, 5).setValue('Class').setFontWeight('bold');
  }
}

function getOrCreateTestSignUpsSheet() {
  var sheet = getOrCreateStorageSheet('Adhyant_Storage_TestSignUps', ['TestSignUps'], function (s) {
    s.getRange(1, 1, 1, 8).setValues([['Timestamp', 'Full Name', 'Email', 'Phone', 'Class', 'Test Type', 'Test Date', 'Message']]);
    s.getRange(1, 1, 1, 8).setFontWeight('bold');
  });
  if (sheet.getLastColumn() < 7) {
    sheet.insertColumnAfter(4);
    sheet.getRange(1, 5).setValue('Test Type').setFontWeight('bold');
  }
  migrateTestSignUpsSheetForClass(sheet);
  return sheet;
}

function getOrCreateTestSubmissionsSheet() {
  var sheet = getOrCreateStorageSheet('Adhyant_Storage_TestSubmissions', ['TestSubmissions'], function (s) {
    s.getRange(1, 1, 1, 19).setValues([['Timestamp', 'Student Name', 'Email', 'Aadhaar', 'Phone', 'Score', 'Total', 'Mobile', 'Events', 'File ID', 'File Name', 'File Size (bytes)', 'Video status', 'Upload error', 'Test code', 'Metadata file ID', 'Submission key', 'Drive folder ID', 'Session code']]);
    s.getRange(1, 1, 1, 19).setFontWeight('bold');
  });
  if (sheet.getLastColumn() < 13) sheet.getRange(1, 13).setValue('Video status').setFontWeight('bold');
  if (sheet.getLastColumn() < 14) sheet.getRange(1, 14).setValue('Upload error').setFontWeight('bold');
  if (sheet.getLastColumn() < 15) sheet.getRange(1, 15).setValue('Test code').setFontWeight('bold');
  if (sheet.getLastColumn() < 16) sheet.getRange(1, 16).setValue('Metadata file ID').setFontWeight('bold');
  if (sheet.getLastColumn() < 17) sheet.getRange(1, 17).setValue('Submission key').setFontWeight('bold');
  if (sheet.getLastColumn() < 18) sheet.getRange(1, 18).setValue('Drive folder ID').setFontWeight('bold');
  if (sheet.getLastColumn() < 19) sheet.getRange(1, 19).setValue('Session code').setFontWeight('bold');
  if (sheet.getLastColumn() < 20 || !String(sheet.getRange(1, 20).getValue() || '').trim()) {
    sheet.getRange(1, 20).setValue('Gate passcode').setFontWeight('bold');
  }
  if (sheet.getLastColumn() < 21 || !String(sheet.getRange(1, 21).getValue() || '').trim()) {
    sheet.getRange(1, 21).setValue('Video chunk log').setFontWeight('bold');
  }
  if (sheet.getLastColumn() < 22 || !String(sheet.getRange(1, 22).getValue() || '').trim()) {
    sheet.getRange(1, 22).setValue('Metadata chunk log').setFontWeight('bold');
  }
  return sheet;
}

/** Append one line to col 21 — video .webm chunks (chunked exams). */
function appendChunkUploadLogLine_(sheet, rowNum, segmentIndex, fileName, isFinalChunk) {
  if (!sheet || rowNum < 2) return;
  if (sheet.getLastColumn() < 21) {
    sheet.getRange(1, 21).setValue('Video chunk log').setFontWeight('bold');
  }
  var at = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
  var segN = segmentIndex != null && !isNaN(Number(segmentIndex)) ? (Number(segmentIndex) + 1) : '?';
  var base = String(fileName || '').slice(0, 150);
  var line = 'Seg ' + segN + ': ' + base + ' @ ' + at + (isFinalChunk ? ' [final]' : ' [partial]');
  var cur = String(sheet.getRange(rowNum, 21).getValue() || '').trim();
  var next = cur ? (cur + '\n' + line) : line;
  if (next.length > 48000) {
    next = '…(truncated)…\n' + next.slice(next.length - 47000);
  }
  sheet.getRange(rowNum, 21).setValue(next);
}

/** Append one line to col 22 — JSON metadata snapshot files (chunked exams). */
function appendMetadataChunkLogLine_(sheet, rowNum, segmentIndex, fileName, isFinalChunk) {
  if (!sheet || rowNum < 2) return;
  if (sheet.getLastColumn() < 22) {
    sheet.getRange(1, 22).setValue('Metadata chunk log').setFontWeight('bold');
  }
  var at = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
  var segN = segmentIndex != null && !isNaN(Number(segmentIndex)) ? (Number(segmentIndex) + 1) : '?';
  var base = String(fileName || '').slice(0, 150);
  var line = 'Meta seg ' + segN + ': ' + base + ' @ ' + at + (isFinalChunk ? ' [final]' : ' [partial]');
  var cur = String(sheet.getRange(rowNum, 22).getValue() || '').trim();
  var next = cur ? (cur + '\n' + line) : line;
  if (next.length > 48000) {
    next = '…(truncated)…\n' + next.slice(next.length - 47000);
  }
  sheet.getRange(rowNum, 22).setValue(next);
}

/** Build summaries for admin UI from raw chunk log cell text (cols 21–22). */
function chunkLogSummariesFromRaw_(videoChunkLog, metadataChunkLog) {
  var v = String(videoChunkLog || '');
  var m = String(metadataChunkLog || '');
  var chLines = v ? v.split('\n').filter(function (ln) { return String(ln).trim() !== ''; }) : [];
  var metaLines = m ? m.split('\n').filter(function (ln) { return String(ln).trim() !== ''; }) : [];
  var chSummary = '';
  if (chLines.length > 0) {
    chSummary = chLines.length + ' video chunk(s); latest: ' + String(chLines[chLines.length - 1]).slice(0, 160);
  }
  var metaSummary = '';
  if (metaLines.length > 0) {
    metaSummary = metaLines.length + ' metadata snapshot(s); latest: ' + String(metaLines[metaLines.length - 1]).slice(0, 160);
  }
  return {
    videoChunkLog: v ? v : null,
    metadataChunkLog: m ? m : null,
    chunkUploadLog: v ? v : null,
    chunkSummary: chSummary ? chSummary : null,
    metadataChunkSummary: metaSummary ? metaSummary : null,
    chunkSegmentCount: chLines.length,
    metadataChunkCount: metaLines.length
  };
}

/**
 * In-progress / timed-out students: pull chunk log columns from their open submission row
 * (same test code + session email on TestSubmissions).
 */
function attachChunkLogsFromSubmissions_(subData, codeUpper, emailNorm) {
  var bestV = '';
  var bestM = '';
  var ei;
  for (ei = 0; ei < subData.length; ei++) {
    var row = subData[ei];
    if (String(row[14] || '').trim().toUpperCase() !== codeUpper) continue;
    var sec = row.length >= 19 ? String(row[18] || '').trim().toLowerCase() : '';
    if (sec !== emailNorm) continue;
    var st = String(row[12] || '').trim().toLowerCase();
    if (st !== 'chunked_open' && st !== 'chunked_partial' && st !== 'metadata_uploaded' && st !== 'uploaded') continue;
    var vv = row.length >= 21 ? String(row[20] != null ? row[20] : '') : '';
    var mm = row.length >= 22 ? String(row[21] != null ? row[21] : '') : '';
    if (vv.length >= bestV.length) bestV = vv;
    if (mm.length >= bestM.length) bestM = mm;
  }
  return chunkLogSummariesFromRaw_(bestV, bestM);
}

/** Normalize email for gate / submission identity (lowercase). */
function normalizeGateEmail_(raw) {
  return (raw || '').toString().trim().toLowerCase();
}

/** Basic email shape check for gate (not full RFC). */
function isPlausibleStudentEmail_(e) {
  if (!e || e.length < 5 || e.length > 254) return false;
  var at = e.indexOf('@');
  if (at < 1 || at !== e.lastIndexOf('@')) return false;
  var domain = e.slice(at + 1);
  if (domain.indexOf('.') < 0 || domain.length < 3) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** Stored in sheet col "Session code": student email (lowercase) or legacy uppercase session token. */
function normalizeMetadataStudentKey_(raw) {
  var s = (raw || '').toString().trim();
  if (s.indexOf('@') >= 0) return normalizeGateEmail_(s);
  return s.toUpperCase();
}

/** Col 15 = test code (index 14), col 13 = status (index 12), col 19 = student key (index 18) — email (new) or legacy session code. */
function submissionExistsForTestAndSession(testCode, studentKey) {
  var code = (testCode || '').toString().trim().toUpperCase();
  var raw = (studentKey || '').toString().trim();
  if (!code || !raw) return false;
  var keyNorm = raw.indexOf('@') >= 0 ? normalizeGateEmail_(raw) : raw.toUpperCase();
  var sheet = getOrCreateTestSubmissionsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var numCols = Math.max(20, sheet.getLastColumn());
  var data = sheet.getRange(2, 1, lastRow, numCols).getValues();
  var i;
  for (i = 0; i < data.length; i++) {
    var row = data[i];
    if (String(row[14] || '').trim().toUpperCase() !== code) continue;
    var cellKey = String(row[18] != null ? row[18] : '').trim();
    var rowNorm = cellKey.indexOf('@') >= 0 ? normalizeGateEmail_(cellKey) : cellKey.toUpperCase();
    if (rowNorm !== keyNorm) continue;
    var st = String(row[12] || '').trim().toLowerCase();
    if (st === 'failed' || st.indexOf('video_failed') === 0) continue;
    if (st.indexOf('retry') === 0) continue;
    if (st === 'uploaded' || st === 'metadata_uploaded' || st === 'pending') return true;
  }
  return false;
}

/** Col 15 = test code (index 14), col 20 = gate passcode (index 19), col 13 = status (index 12). */
function submissionExistsForTestCodeAndGatePasscode(testCode, gatePasscode) {
  var code = (testCode || '').toString().trim().toUpperCase();
  var gate = (gatePasscode || '').toString().trim();
  if (!code || !gate) return false;
  var sheet = getOrCreateTestSubmissionsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var numCols = Math.max(20, sheet.getLastColumn());
  var data = sheet.getRange(2, 1, lastRow, numCols).getValues();
  var i;
  for (i = 0; i < data.length; i++) {
    var row = data[i];
    if (String(row[14] || '').trim().toUpperCase() !== code) continue;
    var cellGate = row.length >= 20 && row[19] != null ? String(row[19]).trim() : '';
    if (cellGate !== gate) continue;
    var st = String(row[12] || '').trim().toLowerCase();
    if (st === 'failed' || st.indexOf('video_failed') === 0) continue;
    if (st.indexOf('retry') === 0) continue;
    if (st === 'uploaded' || st === 'metadata_uploaded' || st === 'pending') return true;
  }
  return false;
}

function getOrCreateTestSessionsSheet() {
  var sheet = getOrCreateStorageSheet('Adhyant_Storage_TestSessions', ['TestSessions'], function (s) {
    s.getRange(1, 1, 1, 9).setValues([['Code', 'Email', 'Name', 'StartedAt', 'Status', 'SecondaryCode', 'Class', 'SessionToken', 'StudentResumePassword']]);
    s.getRange(1, 1, 1, 9).setFontWeight('bold');
  });
  if (sheet.getLastColumn() < 6) {
    sheet.getRange(1, 6).setValue('SecondaryCode').setFontWeight('bold');
  }
  if (sheet.getLastColumn() < 7) {
    sheet.getRange(1, 7).setValue('Class').setFontWeight('bold');
  }
  if (sheet.getLastColumn() < 8) {
    sheet.getRange(1, 8).setValue('SessionToken').setFontWeight('bold');
  }
  if (sheet.getLastColumn() < 9 || !String(sheet.getRange(1, 9).getValue() || '').trim()) {
    sheet.getRange(1, 9).setValue('StudentResumePassword').setFontWeight('bold');
  }
  if (sheet.getLastColumn() < 10 || !String(sheet.getRange(1, 10).getValue() || '').trim()) {
    sheet.getRange(1, 10).setValue('GatePasscode').setFontWeight('bold');
  }
  return sheet;
}

function newAttemptSessionToken_() {
  return Utilities.getUuid().replace(/-/g, '');
}

/** @returns {{ row: number, status: string, sessionToken: string }} row is 1-based sheet row or -1 */
function findTestSessionRow_(code, emailNorm) {
  var wantCode = String(code || '').trim().toUpperCase();
  var wantEmail = String(emailNorm || '').trim().toLowerCase();
  var sheet = getOrCreateTestSessionsSheet();
  var last = sheet.getLastRow();
  if (last < 2) return { row: -1, status: '', sessionToken: '' };
  var n = Math.max(10, sheet.getLastColumn());
  var data = sheet.getRange(2, 1, last, n).getValues();
  var i;
  for (i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === wantCode && String(data[i][1]).trim().toLowerCase() === wantEmail) {
      var st = data[i].length >= 5 && data[i][4] != null ? String(data[i][4]).trim().toLowerCase() : '';
      var tok = data[i].length >= 8 && data[i][7] != null ? String(data[i][7]).trim() : '';
      return { row: i + 2, status: st, sessionToken: tok };
    }
  }
  return { row: -1, status: '', sessionToken: '' };
}

function getOrCreateTestCodesSheet() {
  var sheet = getOrCreateStorageSheet('Adhyant_Storage_TestCodes', ['TestCodes'], function (s) {
    s.getRange(1, 1, 1, 7).setValues([['Code', 'CreatedAt', 'CreatedBy', 'QuestionPaperId', 'Started', 'Active', 'AccessPassword']]);
    s.getRange(1, 1, 1, 7).setFontWeight('bold');
  });
  if (sheet.getLastColumn() < 5) {
    sheet.getRange(1, 5).setValue('Started').setFontWeight('bold');
  }
  if (sheet.getLastColumn() < 6 || !sheet.getRange(1, 6).getValue()) {
    sheet.getRange(1, 6).setValue('Active').setFontWeight('bold');
  }
  if (sheet.getLastColumn() < 7 || !String(sheet.getRange(1, 7).getValue() || '').trim()) {
    sheet.getRange(1, 7).setValue('AccessPassword').setFontWeight('bold');
  }
  if (sheet.getLastColumn() < 8 || !String(sheet.getRange(1, 8).getValue() || '').trim()) {
    sheet.getRange(1, 8).setValue('StudentPasscodeQuota').setFontWeight('bold');
  }
  return sheet;
}

/** One row per issued student slot passcode: TestCode, Passcode, ClaimedEmail (empty until first recordTestStart). */
function getOrCreateTestCodeStudentPasscodesSheet() {
  return getOrCreateStorageSheet('Adhyant_Storage_TestCodeStudentPasscodes', ['TestCodeStudentPasscodes'], function (s) {
    s.getRange(1, 1, 1, 3).setValues([['TestCode', 'Passcode', 'ClaimedEmail']]);
    s.getRange(1, 1, 1, 3).setFontWeight('bold');
  });
}

function normalizeStudentSlotPasscode_(raw) {
  return String(raw || '').trim().toUpperCase();
}

function getStudentPasscodeQuotaFromTestRow_(row) {
  if (!row || row.length < 8) return 0;
  var q = parseInt(String(row[7] != null ? row[7] : '0'), 10);
  if (isNaN(q) || q < 0) return 0;
  return q;
}

function deleteStudentPasscodesForPrimary_(primaryCode) {
  var want = String(primaryCode || '').trim().toUpperCase();
  if (!want) return 0;
  var sheet = getOrCreateTestCodeStudentPasscodesSheet();
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var data = sheet.getRange(2, 1, last, 1).getValues();
  var toDelete = [];
  var i;
  for (i = data.length - 1; i >= 0; i--) {
    if (String(data[i][0] || '').trim().toUpperCase() === want) {
      toDelete.push(i + 2);
    }
  }
  toDelete.sort(function (a, b) {
    return b - a;
  });
  for (i = 0; i < toDelete.length; i++) {
    sheet.deleteRow(toDelete[i]);
  }
  return toDelete.length;
}

function loadStudentPasscodeDetailsByPrimary_() {
  var sheet = getOrCreateTestCodeStudentPasscodesSheet();
  var last = sheet.getLastRow();
  var by = {};
  if (last < 2) return by;
  var data = sheet.getRange(2, 1, last, 3).getValues();
  var i;
  for (i = 0; i < data.length; i++) {
    var tc = String(data[i][0] || '').trim().toUpperCase();
    var pc = String(data[i][1] != null ? data[i][1] : '').trim();
    var em = String(data[i][2] != null ? data[i][2] : '').trim().toLowerCase();
    if (!tc || !pc) continue;
    if (!by[tc]) by[tc] = [];
    by[tc].push({ passcode: pc, claimedByEmail: em || null });
  }
  return by;
}

function loadAllStudentPasscodesForUniqueness_() {
  var set = {};
  var sheet = getOrCreateTestCodeStudentPasscodesSheet();
  var last = sheet.getLastRow();
  if (last < 2) return set;
  var col = sheet.getRange(2, 2, last, 2).getValues();
  var i;
  for (i = 0; i < col.length; i++) {
    var p = normalizeStudentSlotPasscode_(col[i][0]);
    if (p) set[p] = true;
  }
  return set;
}

function generateUniqueStudentSlotPasscodes_(count) {
  var n = parseInt(count, 10);
  if (!n || n < 1) return [];
  var existing = loadAllStudentPasscodesForUniqueness_();
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var out = [];
  var safety = 0;
  while (out.length < n && safety < n * 200) {
    safety++;
    var s = '';
    var j;
    for (j = 0; j < 8; j++) {
      s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (!existing[s]) {
      existing[s] = true;
      out.push(s);
    }
  }
  return out;
}

function appendStudentPasscodesForTest_(primaryCode, passcodes) {
  var pc = String(primaryCode || '').trim().toUpperCase();
  if (!pc || !passcodes || !passcodes.length) return;
  var sheet = getOrCreateTestCodeStudentPasscodesSheet();
  var i;
  for (i = 0; i < passcodes.length; i++) {
    sheet.appendRow([pc, String(passcodes[i]).trim().toUpperCase(), '']);
  }
}

function getStudentPasscodeQuotaForTestCode_(testCode) {
  var c = String(testCode || '').trim().toUpperCase();
  var sheet = getOrCreateTestCodesSheet();
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var numCols = Math.max(8, sheet.getLastColumn());
  var data = sheet.getRange(2, 1, last, numCols).getValues();
  var i;
  for (i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() === c) {
      return getStudentPasscodeQuotaFromTestRow_(data[i]);
    }
  }
  return 0;
}

/** Distinct student emails on TestSessions for this code, excluding abandoned rows (frees a slot after “start over”). */
function countDistinctActiveStudentEmailsForTestCode_(testCode) {
  var code = String(testCode || '').trim().toUpperCase();
  if (!code) return 0;
  var sheet = getOrCreateTestSessionsSheet();
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var nCol = Math.max(5, sheet.getLastColumn());
  var data = sheet.getRange(2, 1, last, nCol).getValues();
  var set = {};
  var i;
  for (i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim().toUpperCase() !== code) continue;
    var st = data[i].length >= 5 && data[i][4] != null ? String(data[i][4]).trim().toLowerCase() : '';
    if (st === 'abandoned') continue;
    var em = String(data[i][1] || '').trim().toLowerCase();
    if (em) set[em] = true;
  }
  var n = 0;
  var k;
  for (k in set) {
    if (set.hasOwnProperty(k)) n++;
  }
  return n;
}

function gatePasscodeFromMetadata_(metadata) {
  var m = metadata || {};
  return String(m.gatePasscode || m.gatePassword || '').trim();
}

function isPasscodeInPoolForTest_(primaryCode, passNorm) {
  var code = String(primaryCode || '').trim().toUpperCase();
  var p = normalizeStudentSlotPasscode_(passNorm);
  if (!code || !p) return false;
  var sheet = getOrCreateTestCodeStudentPasscodesSheet();
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var data = sheet.getRange(2, 1, last, 2).getValues();
  var i;
  for (i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim().toUpperCase() === code &&
        normalizeStudentSlotPasscode_(data[i][1]) === p) {
      return true;
    }
  }
  return false;
}

/**
 * @returns {{ ok: boolean, message?: string }}
 */
function claimStudentPasscodeForEmail_(primaryCode, passNorm, emailLower) {
  var code = String(primaryCode || '').trim().toUpperCase();
  var p = normalizeStudentSlotPasscode_(passNorm);
  var em = String(emailLower || '').trim().toLowerCase();
  if (!code || !p || !em) {
    return { ok: false, message: 'Missing passcode or email' };
  }
  var sheet = getOrCreateTestCodeStudentPasscodesSheet();
  var last = sheet.getLastRow();
  if (last < 2) {
    return { ok: false, message: 'No passcodes configured for this test' };
  }
  var data = sheet.getRange(2, 1, last, 3).getValues();
  var i;
  for (i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim().toUpperCase() !== code) continue;
    if (normalizeStudentSlotPasscode_(data[i][1]) !== p) continue;
    var rowIx = i + 2;
    var claimed = String(data[i][2] != null ? data[i][2] : '').trim().toLowerCase();
    if (!claimed) {
      sheet.getRange(rowIx, 3).setValue(em);
      SpreadsheetApp.flush();
      return { ok: true };
    }
    if (claimed === em) {
      return { ok: true };
    }
    return { ok: false, message: 'This passcode is already linked to another student.' };
  }
  return { ok: false, message: 'Invalid passcode for this test' };
}

function releaseStudentPasscodeClaim_(primaryCode, passNorm) {
  var code = String(primaryCode || '').trim().toUpperCase();
  var p = normalizeStudentSlotPasscode_(passNorm);
  if (!code || !p) return;
  var sheet = getOrCreateTestCodeStudentPasscodesSheet();
  var last = sheet.getLastRow();
  if (last < 2) return;
  var data = sheet.getRange(2, 1, last, 3).getValues();
  var i;
  for (i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim().toUpperCase() === code &&
        normalizeStudentSlotPasscode_(data[i][1]) === p) {
      sheet.getRange(i + 2, 3).setValue('');
      SpreadsheetApp.flush();
      return;
    }
  }
}

/** Clear ClaimedEmail for every passcode row for this test (e.g. after bulk session wipe). */
function clearAllClaimsForTestPasscodes_(primaryCode) {
  var want = String(primaryCode || '').trim().toUpperCase();
  if (!want) return 0;
  var sheet = getOrCreateTestCodeStudentPasscodesSheet();
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var data = sheet.getRange(2, 1, last, 3).getValues();
  var cleared = 0;
  var i;
  for (i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim().toUpperCase() !== want) continue;
    if (String(data[i][2] || '').trim()) {
      sheet.getRange(i + 2, 3).setValue('');
      cleared++;
    }
  }
  if (cleared) SpreadsheetApp.flush();
  return cleared;
}

/** Random gate password (legacy / manual organiser password in sheet col 7). */
function randomAccessPassword_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var out = '';
  for (var i = 0; i < 8; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

/** Stored in TestCodes col 7: gate password is chosen by each student (not issued by admin). */
var STUDENT_GATE_SENTINEL = '__ADHYANT_STUDENT_GATE__';

function isStudentGateMode_(accessPassRow) {
  return String(accessPassRow || '').trim() === STUDENT_GATE_SENTINEL;
}

/** Student-chosen passcode at gate: sentinel in sheet, empty col, or legacy row with no organiser password. */
function isStudentChosenGatePasscode_(accessPassRow) {
  var ap = String(accessPassRow || '').trim();
  return !ap || isStudentGateMode_(ap);
}

var STUDENT_GATE_PASSWORD_MIN_LEN = 4;

/** Col F Active: Yes (default) = code can be used; No = blocked (validate fails). */
function parseRowActiveFlag(row) {
  var cell = row.length >= 6 ? row[5] : null;
  var v = String(cell != null && cell !== '' ? cell : '').trim().toLowerCase();
  if (v === 'no' || v === 'false' || v === '0' || v === 'inactive' || v === 'off') return false;
  return true;
}

// 3 letter prefix + 6 digit number (e.g. ABC123456)
function randomTestCode() {
  var letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  var prefix = '';
  for (var i = 0; i < 3; i++) {
    prefix += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  var num = Math.floor(100000 + Math.random() * 900000);
  return prefix + String(num);
}

/** Session / resume codes: each row SecondaryCode → PrimaryCode (test code). */
function getOrCreateResumeCodesSheet() {
  return getOrCreateStorageSheet('Adhyant_Storage_ResumeCodes', ['ResumeCodes'], function (s) {
    s.getRange(1, 1, 1, 2).setValues([['SecondaryCode', 'PrimaryCode']]);
    s.getRange(1, 1, 1, 2).setFontWeight('bold');
  });
}

function loadResumeCodesGroupedByPrimary() {
  var sheet = getOrCreateResumeCodesSheet();
  var last = sheet.getLastRow();
  var byPrimary = {};
  if (last < 2) return byPrimary;
  var data = sheet.getRange(2, 1, last, 2).getValues();
  for (var i = 0; i < data.length; i++) {
    var sec = String(data[i][0] || '').trim().toUpperCase();
    var prim = String(data[i][1] || '').trim().toUpperCase();
    if (!prim || !sec) continue;
    if (!byPrimary[prim]) byPrimary[prim] = [];
    byPrimary[prim].push(sec);
  }
  return byPrimary;
}

function getSecondaryCodesForPrimary(primaryCode) {
  var all = loadResumeCodesGroupedByPrimary();
  var key = String(primaryCode || '').trim().toUpperCase();
  return all[key] || [];
}

function loadExistingSecondaryCodeSet() {
  var sheet = getOrCreateResumeCodesSheet();
  var last = sheet.getLastRow();
  var set = {};
  if (last < 2) return set;
  var col = sheet.getRange(2, 1, last, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    var c = String(col[i][0] || '').trim().toUpperCase();
    if (c) set[c] = true;
  }
  return set;
}

function randomResumeCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var s = '';
  for (var i = 0; i < 10; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

function generateUniqueResumeCodes(count, existingSet) {
  var list = [];
  for (var n = 0; n < count; n++) {
    var code;
    var attempts = 0;
    do {
      code = randomResumeCode();
      attempts++;
    } while (existingSet[code] && attempts < 500);
    if (existingSet[code]) continue;
    existingSet[code] = true;
    list.push(code);
  }
  return list;
}

function getOrCreateQuestionPapersSheet() {
  var sheet = getOrCreateStorageSheet('Adhyant_Storage_QuestionPapers', ['QuestionPapers'], function (s) {
    s.getRange(1, 1, 1, 8).setValues([['Id', 'Name', 'CreatedAt', 'CreatedBy', 'QuestionsJson', 'DurationMinutes', 'PaperMetaJson', 'AnswerKeyPresent']]);
    s.getRange(1, 1, 1, 8).setFontWeight('bold');
  });
  if (sheet.getLastColumn() < 6 || !sheet.getRange(1, 6).getValue()) {
    sheet.getRange(1, 6).setValue('DurationMinutes').setFontWeight('bold');
  }
  if (sheet.getLastColumn() < 7) {
    sheet.getRange(1, 7).setValue('PaperMetaJson').setFontWeight('bold');
  }
  if (sheet.getLastColumn() < 8) {
    sheet.getRange(1, 8).setValue('AnswerKeyPresent').setFontWeight('bold');
  }
  return sheet;
}

/**
 * Admin: open/close test code (column 6 Active on TestCodes sheet).
 * Used from doGet (query string) and doPost (JSON body) so "Close code" works even when GET redirects drop query params.
 */
function runSetTestCodeActive_(adminSecret, codeRaw, activeRaw) {
  try {
    var adminSecret2 = (adminSecret || '').toString();
    var storedSecret2 = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
    if (!adminSecret2 || adminSecret2 !== storedSecret2) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
    }
    var code2 = (codeRaw || '').toString().trim().toUpperCase();
    var activeParam = String(activeRaw != null ? activeRaw : 'yes').trim().toLowerCase();
    var setYes = (activeParam === 'yes' || activeParam === 'true' || activeParam === '1' || activeParam === 'on');
    if (!code2) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Code required' })).setMimeType(ContentService.MimeType.JSON);
    }
    var sheet2 = getOrCreateTestCodesSheet();
    var lastRow2 = sheet2.getLastRow();
    if (lastRow2 < 2) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'No codes found' })).setMimeType(ContentService.MimeType.JSON);
    }
    var numCols2 = Math.max(6, sheet2.getLastColumn());
    var data2 = sheet2.getRange(2, 1, lastRow2, numCols2).getValues();
    for (var j = 0; j < data2.length; j++) {
      if (String(data2[j][0]).trim().toUpperCase() === code2) {
        sheet2.getRange(j + 2, 6).setValue(setYes ? 'Yes' : 'No');
        SpreadsheetApp.flush();
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          message: setYes ? 'Code is open again.' : 'Code closed. Students cannot use it.',
          active: setYes
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Code not found' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err2) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err2.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Handle GET: action=list returns submissions (metadata only); action=download&fileId=xxx returns zip as base64 for admin download
function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = params.action;
  if (action === 'list') {
    try {
      var sheet = getOrCreateTestSubmissionsSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'success', submissions: [], total: 0 })).setMimeType(ContentService.MimeType.JSON);
      }
      var numCols = Math.max(22, sheet.getLastColumn());
      var data = sheet.getRange(2, 1, lastRow, numCols).getValues();
      var dataFiltered = data.filter(function (row) {
        var first = row[0];
        return first !== null && first !== undefined && String(first).trim() !== '';
      });
      var submissions = dataFiltered.map(function (row) {
        // Old format (10 cols): Timestamp, Name, Email, Aadhaar, Score, Total, Mobile, Events, File ID, File Name
        // New format (13+ cols): ... Video status, [Upload error]
        var col8Str = typeof row[8] === 'string' ? row[8].trim() : '';
        var col7Str = typeof row[7] === 'string' ? row[7].trim() : '';
        var col8IsJsonArray = col8Str.indexOf('[') === 0;
        var col7IsJsonArray = col7Str.indexOf('[') === 0;
        var col8LooksLikeFileId = col8Str.length >= 15 && /^[a-zA-Z0-9_-]+$/.test(col8Str);
        var isNewFormat = row.length >= 12 && (col8IsJsonArray || !(col7IsJsonArray && col8LooksLikeFileId));
        var eventsVal = isNewFormat ? (row[8] != null ? row[8] : '') : (col7IsJsonArray ? row[7] : row[8]);
        var fileIdVal = isNewFormat ? (row[9] != null ? row[9] : '') : (row[8] != null ? row[8] : '');
        var fileNameVal = isNewFormat ? (row[10] != null ? row[10] : '') : (row[9] != null ? row[9] : '');
        var fileSizeVal = (row.length > 11 && row[11] != null && row[11] !== '') ? Number(row[11]) : null;
        var hasVideoStatus = row.length >= 13 && row[12] !== undefined && row[12] !== '';
        var uploadErrorVal = (row.length > 13 && row[13] != null && row[13] !== '') ? String(row[13]) : '';
        var testCodeVal = (row.length > 14 && row[14] != null) ? String(row[14]) : '';
        var metadataFileIdVal = (row.length > 15 && row[15] != null) ? String(row[15]) : '';
        var submissionKeyVal = (row.length > 16 && row[16] != null) ? String(row[16]) : '';
        var driveFolderIdVal = (row.length > 17 && row[17] != null) ? String(row[17]) : '';
        var videoChunkLogVal = (row.length > 20 && row[20] != null) ? String(row[20]) : '';
        var metadataChunkLogVal = (row.length > 21 && row[21] != null) ? String(row[21]) : '';
        var chunkLines = videoChunkLogVal ? videoChunkLogVal.split('\n').filter(function (ln) { return String(ln).trim() !== ''; }) : [];
        var metaLines = metadataChunkLogVal ? metadataChunkLogVal.split('\n').filter(function (ln) { return String(ln).trim() !== ''; }) : [];
        var chunkCount = chunkLines.length;
        var metaChunkCount = metaLines.length;
        var chunkSummary = '';
        if (chunkCount > 0) {
          chunkSummary = chunkCount + ' video segment(s); latest: ' + String(chunkLines[chunkLines.length - 1]).slice(0, 200);
        }
        var metadataChunkSummary = '';
        if (metaChunkCount > 0) {
          metadataChunkSummary = metaChunkCount + ' metadata file(s); latest: ' + String(metaLines[metaLines.length - 1]).slice(0, 200);
        }
        return {
          timestamp: row[0],
          studentName: row[1],
          email: row[2],
          adhar: row[3],
          phone: isNewFormat ? (row[4] || '') : '',
          score: isNewFormat ? row[5] : row[4],
          total: isNewFormat ? row[6] : row[5],
          isMobile: isNewFormat ? row[7] : row[6],
          events: eventsVal,
          fileId: fileIdVal,
          fileName: fileNameVal,
          fileSizeBytes: fileSizeVal,
          videoStatus: hasVideoStatus ? String(row[12]) : (fileIdVal ? 'uploaded' : 'pending'),
          uploadError: uploadErrorVal,
          testCode: testCodeVal,
          metadataFileId: metadataFileIdVal,
          submissionKey: submissionKeyVal,
          driveFolderId: driveFolderIdVal,
          chunkUploadLog: videoChunkLogVal,
          videoChunkLog: videoChunkLogVal,
          metadataChunkLog: metadataChunkLogVal,
          chunkSegmentCount: chunkCount,
          metadataChunkCount: metaChunkCount,
          chunkSummary: chunkSummary,
          metadataChunkSummary: metadataChunkSummary
        };
      });
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', submissions: submissions, total: submissions.length })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (action === 'listFeedback') {
    try {
      var feedbackSheet = getOrCreateFeedbackSheet();
      var flastRow = feedbackSheet.getLastRow();
      if (flastRow < 2) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'success', feedback: [], total: 0 })).setMimeType(ContentService.MimeType.JSON);
      }
      var fnumCols = Math.max(9, feedbackSheet.getLastColumn());
      var fdata = feedbackSheet.getRange(2, 1, flastRow, fnumCols).getValues();
      var fdataFiltered = fdata.filter(function (row) {
        var first = row[0];
        return first !== null && first !== undefined && String(first).trim() !== '';
      });
      var feedbackList = fdataFiltered.map(function (row) {
        var nc = row.length;
        var driveStatus = 'uploaded';
        var studentClassOut = null;
        if (nc >= 9) {
          studentClassOut = row[7] != null ? String(row[7]) : '';
          driveStatus = row[8] != null && row[8] !== '' ? String(row[8]) : 'uploaded';
        } else if (nc >= 8) {
          driveStatus = row[7] != null && row[7] !== '' ? String(row[7]) : 'uploaded';
        }
        return {
          timestamp: row[0],
          rating: row[1],
          ratingLabel: row[2],
          comment: row[3] || '',
          studentName: row[4] || '',
          studentEmail: row[5] || '',
          studentPhone: row[6] || '',
          studentClass: studentClassOut || null,
          driveStatus: driveStatus
        };
      });
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', feedback: feedbackList, total: feedbackList.length })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (action === 'download' && params.fileId) {
    try {
      var file = DriveApp.getFileById(params.fileId);
      var blob = file.getBlob();
      var base64 = Utilities.base64Encode(blob.getBytes());
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        content: base64,
        fileName: file.getName()
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (action === 'generateCode') {
    try {
      var adminSecret = params.adminSecret || '';
      var storedSecret = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
      if (!adminSecret || adminSecret !== storedSecret) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
      }
      var slotCount = parseInt(String(params.studentPasscodeCount || params.passcodeSlots || params.maxStudents || '0'), 10);
      if (!slotCount || slotCount < 1 || slotCount > 500) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'studentPasscodeCount (or maxStudents) required: 1–500. Maximum number of students who can take this test; each student creates their own passcode at the gate.'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      var sheet = getOrCreateTestCodesSheet();
      var code = randomTestCode();
      var createdAt = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
      var createdBy = params.adminEmail || '';
      var questionPaperId = (params.questionPaperId || '').toString().trim();
      sheet.appendRow([code, createdAt, createdBy, questionPaperId, '', 'Yes', STUDENT_GATE_SENTINEL, slotCount]);
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        code: code,
        accessPassword: null,
        studentGatePassword: false,
        studentPasscodeQuota: slotCount,
        studentPasscodes: [],
        secondaryCodes: [],
        secondaryCount: 0
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (action === 'validateCode') {
    try {
      var code = (params.code || '').toString().trim().toUpperCase();
      if (!code) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'success', valid: false })).setMimeType(ContentService.MimeType.JSON);
      }
      var pwdIn = (params.studentPassword || params.password || '').toString().trim();
      var emailParam = normalizeGateEmail_(params.studentEmail || params.email || '');
      var sheet = getOrCreateTestCodesSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'success', valid: false })).setMimeType(ContentService.MimeType.JSON);
      }
      var numCols = Math.max(8, sheet.getLastColumn());
      var data = sheet.getRange(2, 1, lastRow, numCols).getValues();
      for (var i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim().toUpperCase() === code) {
          var questionPaperIdEarly = data[i][3] ? String(data[i][3]).trim() : '';
          var accessPassRow = data[i].length >= 7 && data[i][6] != null ? String(data[i][6]).trim() : '';
          var slotQuota = getStudentPasscodeQuotaFromTestRow_(data[i]);
          if (slotQuota > 0) {
            if (String(pwdIn).trim().length < STUDENT_GATE_PASSWORD_MIN_LEN) {
              return ContentService.createTextOutput(JSON.stringify({
                status: 'success',
                valid: false,
                reason: 'password_too_short'
              })).setMimeType(ContentService.MimeType.JSON);
            }
          } else if (isStudentChosenGatePasscode_(accessPassRow)) {
            if (String(pwdIn).trim().length < STUDENT_GATE_PASSWORD_MIN_LEN) {
              return ContentService.createTextOutput(JSON.stringify({
                status: 'success',
                valid: false,
                reason: 'password_too_short'
              })).setMimeType(ContentService.MimeType.JSON);
            }
          } else if (pwdIn !== accessPassRow) {
            return ContentService.createTextOutput(JSON.stringify({
              status: 'success',
              valid: false,
              reason: 'invalid_password'
            })).setMimeType(ContentService.MimeType.JSON);
          }
          if (emailParam && isPlausibleStudentEmail_(emailParam) && submissionExistsForTestAndSession(code, emailParam)) {
            return ContentService.createTextOutput(JSON.stringify({
              status: 'success',
              valid: true,
              alreadySubmitted: true,
              started: true,
              questionPaperId: questionPaperIdEarly || null,
              secondaryRequired: false
            })).setMimeType(ContentService.MimeType.JSON);
          }
          if (pwdIn && submissionExistsForTestCodeAndGatePasscode(code, pwdIn)) {
            return ContentService.createTextOutput(JSON.stringify({
              status: 'success',
              valid: true,
              alreadySubmitted: true,
              started: true,
              questionPaperId: questionPaperIdEarly || null,
              secondaryRequired: false
            })).setMimeType(ContentService.MimeType.JSON);
          }
          if (!parseRowActiveFlag(data[i])) {
            return ContentService.createTextOutput(JSON.stringify({
              status: 'success',
              valid: false,
              reason: 'inactive'
            })).setMimeType(ContentService.MimeType.JSON);
          }
          var rowIndex = i + 2;
          var questionPaperId = questionPaperIdEarly;
          var startedCell = sheet.getRange(rowIndex, 5).getValue();
          var startedVal = String(startedCell != null && startedCell !== '' ? startedCell : '').trim().toLowerCase();
          var started = (startedVal === 'yes' || startedVal === 'true' || startedVal === '1');
          return ContentService.createTextOutput(JSON.stringify({
            status: 'success',
            valid: true,
            started: started,
            questionPaperId: questionPaperId || null,
            secondaryRequired: false
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', valid: false })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (action === 'listTestCodes') {
    try {
      var adminSecret = params.adminSecret || '';
      var storedSecret = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
      if (!adminSecret || adminSecret !== storedSecret) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
      }
      var sheet = getOrCreateTestCodesSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'success', codes: [] })).setMimeType(ContentService.MimeType.JSON);
      }
      var numCols = Math.max(8, sheet.getLastColumn());
      var data = sheet.getRange(2, 1, lastRow, numCols).getValues();
      var byPrimary = loadResumeCodesGroupedByPrimary();
      var codes = data.map(function (row) {
        var col5 = (row.length >= 5) ? row[4] : null;
        var startedVal = String(col5 != null && col5 !== '' ? col5 : '').trim().toLowerCase();
        var started = (startedVal === 'yes' || startedVal === 'true' || startedVal === '1');
        var createdAt = row[1];
        if (createdAt instanceof Date) {
          createdAt = Utilities.formatDate(createdAt, 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
        } else {
          createdAt = createdAt != null ? String(createdAt) : '';
        }
        var ccode = String(row[0]).trim().toUpperCase();
        var ap = row.length >= 7 && row[6] != null ? String(row[6]).trim() : '';
        var quota = getStudentPasscodeQuotaFromTestRow_(row);
        var usedSlots = quota > 0 ? countDistinctActiveStudentEmailsForTestCode_(ccode) : 0;
        var studentGate = quota > 0 ? false : isStudentChosenGatePasscode_(ap);
        return {
          code: String(row[0]).trim(),
          createdAt: createdAt,
          createdBy: row[2] ? String(row[2]) : '',
          questionPaperId: row[3] ? String(row[3]).trim() : '',
          started: started,
          active: parseRowActiveFlag(row),
          accessPassword: studentGate ? null : (ap || null),
          studentGatePassword: studentGate,
          studentPasscodeQuota: quota,
          studentPasscodesClaimed: usedSlots,
          studentPasscodesDetail: [],
          secondaryCodes: byPrimary[ccode] || []
        };
      });
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', codes: codes })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (action === 'startTest') {
    try {
      var adminSecret = params.adminSecret || '';
      var storedSecret = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
      if (!adminSecret || adminSecret !== storedSecret) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
      }
      var code = (params.code || '').toString().trim().toUpperCase();
      if (!code) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Code required' })).setMimeType(ContentService.MimeType.JSON);
      }
      var sheet = getOrCreateTestCodesSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'No codes found' })).setMimeType(ContentService.MimeType.JSON);
      }
      var numCols = Math.max(5, sheet.getLastColumn());
      var data = sheet.getRange(2, 1, lastRow, numCols).getValues();
      for (var i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim().toUpperCase() === code) {
          var rowIndex = i + 2;
          var cell = sheet.getRange(rowIndex, 5);
          cell.setValue('Yes');
          SpreadsheetApp.flush();
          return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Test started for code ' + code })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Code not found' })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (action === 'setTestCodeActive') {
    return runSetTestCodeActive_(params.adminSecret, params.code, params.active);
  }
  if (action === 'listPapers') {
    try {
      var sheet = getOrCreateQuestionPapersSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'success', papers: [] })).setMimeType(ContentService.MimeType.JSON);
      }
      var numColsP = Math.max(8, sheet.getLastColumn());
      var data = sheet.getRange(2, 1, lastRow, numColsP).getValues();
      var papers = data
        .map(function (row) {
          var rawAk = row.length > 7 ? row[7] : undefined;
          var answerKeyPresent = null;
          if (rawAk !== undefined && rawAk !== null && String(rawAk).trim() !== '') {
            answerKeyPresent = String(rawAk).trim().toLowerCase() === 'yes';
          }
          return { id: row[0], name: row[1], createdAt: row[2], createdBy: row[3], answerKeyPresent: answerKeyPresent };
        })
        .filter(function (p) {
          return p.id != null && String(p.id).trim() !== '';
        });
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', papers: papers })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (action === 'getPaper' && params.id) {
    try {
      var adminSecretGetPaper = params.adminSecret || '';
      var storedSecretGetPaper = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
      var isAdminFullPaper = adminSecretGetPaper && storedSecretGetPaper && adminSecretGetPaper === storedSecretGetPaper;
      var sheet = getOrCreateQuestionPapersSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Not found' })).setMimeType(ContentService.MimeType.JSON);
      }
      var numCols = Math.max(8, sheet.getLastColumn());
      var data = sheet.getRange(2, 1, lastRow, numCols).getValues();
      var paperId = (params.id || '').toString().trim();
      for (var i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === paperId) {
          var questionsJson = data[i][4] ? String(data[i][4]) : '[]';
          var questions = [];
          try {
            questions = JSON.parse(questionsJson);
          } catch (e) {}
          var dm = data[i][5];
          var durationMinutes = 120;
          if (dm !== null && dm !== undefined && dm !== '') {
            var n = Number(dm);
            if (!isNaN(n) && n > 0) durationMinutes = n;
          }
          var paperMeta = {};
          if (data[i][6]) {
            try {
              paperMeta = JSON.parse(String(data[i][6]));
            } catch (e) {}
          }
          var rawKeyCell = data[i].length > 7 ? data[i][7] : undefined;
          var hasExplicitKey = rawKeyCell !== undefined && rawKeyCell !== null && String(rawKeyCell).trim() !== '';
          var answerKeyPresent = false;
          if (hasExplicitKey) {
            answerKeyPresent = String(rawKeyCell).trim().toLowerCase() === 'yes';
          } else {
            var li;
            for (li = 0; li < questions.length; li++) {
              var lq = questions[li];
              if (!lq || typeof lq !== 'object') continue;
              if (String(lq.type || 'mcq').toLowerCase() === 'integer') {
                if (lq.answer !== undefined && lq.answer !== null && lq.answer !== '' && !isNaN(Number(lq.answer))) {
                  answerKeyPresent = true;
                  break;
                }
              } else if (lq.answer !== undefined && lq.answer !== null && String(lq.answer).trim() !== '') {
                answerKeyPresent = true;
                break;
              }
            }
          }
          var qj;
          var questionsOut = [];
          for (qj = 0; qj < questions.length; qj++) {
            var src = questions[qj];
            var qq = {};
            var kkey;
            for (kkey in src) {
              if (src.hasOwnProperty(kkey)) {
                qq[kkey] = src[kkey];
              }
            }
            if (!answerKeyPresent && !isAdminFullPaper) {
              delete qq.answer;
              qq.needsAnswerKey = true;
            }
            // Thumbnail API embeds reliably in <img>; uc?export=view often returns HTML and shows broken images.
            if (qq && qq.imageFileId) {
              qq.imageUrl = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(String(qq.imageFileId)) + '&sz=w2000';
            }
            questionsOut.push(qq);
          }
          return ContentService.createTextOutput(JSON.stringify({
            status: 'success',
            paper: {
              id: data[i][0],
              name: data[i][1],
              createdAt: data[i][2],
              createdBy: data[i][3],
              questions: questionsOut,
              title: data[i][1],
              durationMinutes: durationMinutes,
              maxMarks: paperMeta.maxMarks != null ? paperMeta.maxMarks : null,
              readTimeMinutes: paperMeta.readTimeMinutes != null ? paperMeta.readTimeMinutes : null,
              instructions: Array.isArray(paperMeta.instructions) ? paperMeta.instructions : [],
              paperTitleHint: paperMeta.paperTitleHint || null,
              answerKeyPresent: answerKeyPresent
            }
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Not found' })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  /** Serve question JPEG/PNG from Drive for <img src> — avoids broken drive.google.com/thumbnail embeds (referrer/CORP). */
  if (action === 'servePaperQuestionImage') {
    try {
      var sidImg = (params.paperId || '').toString().trim();
      var qixImg = parseInt(params.questionIndex, 10);
      if (!sidImg || isNaN(qixImg) || qixImg < 0) {
        return ContentService.createTextOutput('Not found').setMimeType(ContentService.MimeType.TEXT);
      }
      var sheetServe = getOrCreateQuestionPapersSheet();
      var rowServe = findQuestionPaperRowById(sheetServe, sidImg);
      if (rowServe < 0) {
        return ContentService.createTextOutput('Not found').setMimeType(ContentService.MimeType.TEXT);
      }
      var qjsonServe = sheetServe.getRange(rowServe, 5).getValue();
      var qarrServe = [];
      try {
        qarrServe = qjsonServe ? JSON.parse(String(qjsonServe)) : [];
      } catch (eServe) {
        return ContentService.createTextOutput('Not found').setMimeType(ContentService.MimeType.TEXT);
      }
      if (!Array.isArray(qarrServe) || qixImg >= qarrServe.length) {
        return ContentService.createTextOutput('Not found').setMimeType(ContentService.MimeType.TEXT);
      }
      var qcellServe = qarrServe[qixImg];
      var imgFidServe = qcellServe && qcellServe.imageFileId ? String(qcellServe.imageFileId).trim() : '';
      if (!imgFidServe) {
        return ContentService.createTextOutput('Not found').setMimeType(ContentService.MimeType.TEXT);
      }
      var driveFileServe = DriveApp.getFileById(imgFidServe);
      var blobServe = driveFileServe.getBlob();
      var mtServe = blobServe.getContentType();
      if (!mtServe || String(mtServe).indexOf('image/') !== 0) {
        mtServe = 'image/jpeg';
      }
      return ContentService.createBlobOutput(blobServe).setMimeType(mtServe);
    } catch (errServe) {
      return ContentService.createTextOutput('Not found').setMimeType(ContentService.MimeType.TEXT);
    }
  }
  if (action === 'recordTestStart') {
    try {
      var code = (params.code || '').toString().trim().toUpperCase();
      var email = (params.email || '').toString().trim();
      var name = (params.name || '').toString().trim();
      var secStart = normalizeGateEmail_(params.secondaryCode || params.studentGateEmail || params.email || '');
      var studentClassStart = (params.studentClass || params.class || '').toString().trim();
      var resumePass = (params.resumePassword || params.studentResumePassword || '').toString().trim().slice(0, 80);
      var gatePcRaw = (params.gatePasscode || params.gatePassword || '').toString().trim();
      if (!code) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Code required' })).setMimeType(ContentService.MimeType.JSON);
      }
      var codeQuotaRt = getStudentPasscodeQuotaForTestCode_(code);
      var gateForSession = gatePcRaw;
      if (codeQuotaRt > 0) {
        if (String(gatePcRaw).trim().length < STUDENT_GATE_PASSWORD_MIN_LEN) {
          return ContentService.createTextOutput(JSON.stringify({
            status: 'error',
            message: 'Choose a passcode with at least ' + STUDENT_GATE_PASSWORD_MIN_LEN + ' characters (same one you used at the gate).'
          })).setMimeType(ContentService.MimeType.JSON);
        }
        gateForSession = gatePcRaw;
      } else if (gatePcRaw) {
        gateForSession = gatePcRaw;
      }
      /** Students no longer set a separate "resume password"; mirror gate passcode for sheet col 9 when omitted. */
      if (!resumePass && gateForSession) {
        resumePass = String(gateForSession).trim().slice(0, 80);
      }
      var sessionsSheet = getOrCreateTestSessionsSheet();
      var nCol = Math.max(10, sessionsSheet.getLastColumn());
      var startedAt = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
      var sData = sessionsSheet.getDataRange().getValues();
      for (var si = 1; si < sData.length; si++) {
        if (String(sData[si][0]).trim().toUpperCase() === code &&
            String(sData[si][1]).trim().toLowerCase() === email.toLowerCase()) {
          var rowTok = sData[si].length >= 8 && sData[si][7] != null ? String(sData[si][7]).trim() : '';
          var prevStRec = sData[si].length >= 5 && sData[si][4] != null ? String(sData[si][4]).trim().toLowerCase() : '';
          if (prevStRec === 'abandoned' || !rowTok) {
            rowTok = newAttemptSessionToken_();
            sessionsSheet.getRange(si + 1, 8).setValue(rowTok);
          }
          sessionsSheet.getRange(si + 1, 3).setValue(name);
          sessionsSheet.getRange(si + 1, 4).setValue(startedAt);
          sessionsSheet.getRange(si + 1, 5).setValue('in_progress');
          if (nCol >= 6) {
            sessionsSheet.getRange(si + 1, 6).setValue(secStart);
          }
          if (nCol >= 7 && studentClassStart) {
            sessionsSheet.getRange(si + 1, 7).setValue(studentClassStart);
          }
          if (nCol >= 9 && resumePass) {
            sessionsSheet.getRange(si + 1, 9).setValue(resumePass);
          }
          if (nCol >= 10 && gateForSession) {
            sessionsSheet.getRange(si + 1, 10).setValue(gateForSession);
          }
          SpreadsheetApp.flush();
          return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Test start recorded', sessionToken: rowTok })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      if (codeQuotaRt > 0) {
        var usedNow = countDistinctActiveStudentEmailsForTestCode_(code);
        if (usedNow >= codeQuotaRt) {
          return ContentService.createTextOutput(JSON.stringify({
            status: 'error',
            message: 'Maximum number of students for this test has been reached. Contact the organiser if you need access.'
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      var newTok = newAttemptSessionToken_();
      sessionsSheet.appendRow([code, email, name, startedAt, 'in_progress', secStart, studentClassStart, newTok, resumePass, gateForSession || '']);
      SpreadsheetApp.flush();
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Test start recorded', sessionToken: newTok })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (action === 'abandonTestSession') {
    try {
      var codeAb = (params.code || '').toString().trim().toUpperCase();
      var emailAb = (params.email || '').toString().trim();
      if (!codeAb || !emailAb) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Code and student email required' })).setMimeType(ContentService.MimeType.JSON);
      }
      var foundAb = findTestSessionRow_(codeAb, emailAb.toLowerCase());
      if (foundAb.row < 0) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Session not found' })).setMimeType(ContentService.MimeType.JSON);
      }
      if (foundAb.status !== 'in_progress') {
        return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Nothing to abandon' })).setMimeType(ContentService.MimeType.JSON);
      }
      var shAb = getOrCreateTestSessionsSheet();
      shAb.getRange(foundAb.row, 5).setValue('abandoned');
      SpreadsheetApp.flush();
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Session released' })).setMimeType(ContentService.MimeType.JSON);
    } catch (errAb) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: errAb.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (action === 'listTestCodeActivity') {
    try {
      var adminSecret = params.adminSecret || '';
      var storedSecret = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
      if (!adminSecret || adminSecret !== storedSecret) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
      }
      var code = (params.code || '').toString().trim().toUpperCase();
      if (!code) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Code required' })).setMimeType(ContentService.MimeType.JSON);
      }
      /** Mark in_progress rows past exam duration + upload grace (browser may never have called submit). */
      var staleClosed = expireStaleInProgressSessionsForTestCode_(code);
      var inProgress = [];
      var timedOut = [];
      var subSheetEarly = getOrCreateTestSubmissionsSheet();
      var subLastEarly = subSheetEarly.getLastRow();
      var numColsEarly = Math.max(22, subSheetEarly.getLastColumn());
      var subData = subLastEarly >= 2 ? subSheetEarly.getRange(2, 1, subLastEarly, numColsEarly).getValues() : [];
      var sessionsSheet = getOrCreateTestSessionsSheet();
      var sLast = sessionsSheet.getLastRow();
      if (sLast >= 2) {
        var sCols = Math.max(10, sessionsSheet.getLastColumn());
        var sData = sessionsSheet.getRange(2, 1, sLast, sCols).getValues();
        for (var si = 0; si < sData.length; si++) {
          if (String(sData[si][0]).trim().toUpperCase() !== code) continue;
          var stRow = String(sData[si][4]).trim().toLowerCase();
          var secProg = sData[si].length >= 6 && sData[si][5] != null ? String(sData[si][5]).trim() : '';
          var classProg = sData[si].length >= 7 && sData[si][6] != null ? String(sData[si][6]).trim() : '';
          var resumePwProg = sData[si].length >= 9 && sData[si][8] != null ? String(sData[si][8]).trim() : '';
          var gateProg = sData[si].length >= 10 && sData[si][9] != null ? String(sData[si][9]).trim() : '';
          var emailNormAct = normalizeGateEmail_(String(sData[si][1]).trim());
          var chunkAttach = emailNormAct ? attachChunkLogsFromSubmissions_(subData, code, emailNormAct) : chunkLogSummariesFromRaw_('', '');
          var rowObj = {
            email: String(sData[si][1]).trim(),
            name: String(sData[si][2]).trim(),
            startedAt: sData[si][3] != null ? String(sData[si][3]) : '',
            secondaryCode: secProg || null,
            gatePasscode: gateProg || null,
            studentClass: classProg || null,
            resumePassword: resumePwProg || null,
            videoChunkLog: chunkAttach.videoChunkLog,
            metadataChunkLog: chunkAttach.metadataChunkLog,
            chunkUploadLog: chunkAttach.chunkUploadLog,
            chunkSummary: chunkAttach.chunkSummary,
            metadataChunkSummary: chunkAttach.metadataChunkSummary,
            chunkSegmentCount: chunkAttach.chunkSegmentCount,
            metadataChunkCount: chunkAttach.metadataChunkCount
          };
          if (stRow === 'in_progress') {
            inProgress.push(rowObj);
          } else if (stRow === 'timed_out') {
            timedOut.push(rowObj);
          }
        }
      }
      var submissions = [];
      var subSheet = subSheetEarly;
      var subLast = subLastEarly;
      var numCols = numColsEarly;
      if (subLast >= 2) {
        for (var ri = 0; ri < subData.length; ri++) {
          var row = subData[ri];
          var rowCode = (row.length >= 15 && row[14] != null && row[14] !== '') ? String(row[14]).trim().toUpperCase() : '';
          if (rowCode === code) {
            var secSub = row.length >= 19 && row[18] != null ? String(row[18]).trim() : '';
            var gateSub = row.length >= 20 && row[19] != null ? String(row[19]).trim() : '';
            var vStat = row.length >= 13 && row[12] != null ? String(row[12]).trim() : '';
            var videoChunkLog = row.length >= 21 && row[20] != null ? String(row[20]) : '';
            var metadataChunkLog = row.length >= 22 && row[21] != null ? String(row[21]) : '';
            var chLines = videoChunkLog ? videoChunkLog.split('\n').filter(function (ln) { return String(ln).trim() !== ''; }) : [];
            var metaLines = metadataChunkLog ? metadataChunkLog.split('\n').filter(function (ln) { return String(ln).trim() !== ''; }) : [];
            var chSummary = '';
            if (chLines.length > 0) {
              chSummary = chLines.length + ' video chunk(s); latest: ' + String(chLines[chLines.length - 1]).slice(0, 160);
            }
            var metaSummary = '';
            if (metaLines.length > 0) {
              metaSummary = metaLines.length + ' metadata snapshot(s); latest: ' + String(metaLines[metaLines.length - 1]).slice(0, 160);
            }
            submissions.push({
              studentName: row[1] != null ? String(row[1]) : '',
              email: row[2] != null ? String(row[2]) : '',
              score: row[5] != null ? row[5] : '',
              total: row[6] != null ? row[6] : '',
              timestamp: row[0] != null ? String(row[0]) : '',
              secondaryCode: secSub || null,
              gatePasscode: gateSub || null,
              videoStatus: vStat || null,
              chunkUploadLog: videoChunkLog || null,
              videoChunkLog: videoChunkLog || null,
              metadataChunkLog: metadataChunkLog || null,
              chunkSegmentCount: chLines.length,
              metadataChunkCount: metaLines.length,
              chunkSummary: chSummary || null,
              metadataChunkSummary: metaSummary || null
            });
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        code: code,
        inProgress: inProgress,
        timedOut: timedOut,
        staleSessionsClosedOnRefresh: staleClosed,
        submissions: submissions
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (action === 'deleteQuestionPaper') {
    try {
      var adminDelPaper = params.adminSecret || '';
      var storedDelPaper = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
      if (!adminDelPaper || adminDelPaper !== storedDelPaper) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
      }
      var paperIdToDel = (params.paperId || params.id || '').toString().trim();
      if (!paperIdToDel) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'paperId required' })).setMimeType(ContentService.MimeType.JSON);
      }
      var nRef = countTestCodesUsingPaperId_(paperIdToDel);
      if (nRef > 0) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'Cannot delete: ' + nRef + ' test code(s) still reference this paper. Change their question paper or remove those codes in the sheet first.'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      var qpSheet = getOrCreateQuestionPapersSheet();
      var delRow = findQuestionPaperRowById(qpSheet, paperIdToDel);
      if (delRow < 0) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Paper not found' })).setMimeType(ContentService.MimeType.JSON);
      }
      qpSheet.deleteRow(delRow);
      SpreadsheetApp.flush();
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Question paper deleted.', paperId: paperIdToDel })).setMimeType(ContentService.MimeType.JSON);
    } catch (errDelPaper) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: errDelPaper.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (action === 'clearAllTestData') {
    try {
      var adminAll = params.adminSecret || '';
      var storedAll = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
      if (!adminAll || adminAll !== storedAll) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
      }
      if (!isBulkResetConfirmOk_(params.confirmPhrase)) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'Wrong confirmation. Type: everything (also: delete everything, delete all test data, delete all)'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      var bulk = { errors: [] };
      try {
        bulk.submissions = clearAllSubmissionsSheetAndTrashDrive_().rows;
      } catch (eSub) {
        bulk.errors.push('submissions: ' + eSub.toString());
        bulk.submissions = 0;
        try {
          var shSubOnly = getOrCreateTestSubmissionsSheet();
          var lrSubOnly = shSubOnly.getLastRow();
          if (lrSubOnly >= 2) {
            shSubOnly.deleteRows(2, lrSubOnly - 1);
            bulk.submissions = lrSubOnly - 1;
          }
        } catch (eSub2) {
          bulk.errors.push('submissions sheet-only: ' + eSub2.toString());
        }
      }
      try {
        var tsSheetAll = getOrCreateTestSessionsSheet();
        var tsLastAll = tsSheetAll.getLastRow();
        bulk.testSessions = 0;
        if (tsLastAll >= 2) {
          bulk.testSessions = tsLastAll - 1;
          tsSheetAll.deleteRows(2, tsLastAll - 1);
        }
      } catch (eTs) {
        bulk.errors.push('testSessions: ' + eTs.toString());
        bulk.testSessions = 0;
      }
      try {
        var resumeSheetAll = getOrCreateResumeCodesSheet();
        var rcLastAll = resumeSheetAll.getLastRow();
        bulk.resumeCodes = 0;
        if (rcLastAll >= 2) {
          bulk.resumeCodes = rcLastAll - 1;
          resumeSheetAll.deleteRows(2, rcLastAll - 1);
        }
      } catch (eRc) {
        bulk.errors.push('resumeCodes: ' + eRc.toString());
        bulk.resumeCodes = 0;
      }
      try {
        var spSheetAll = getOrCreateTestCodeStudentPasscodesSheet();
        var spLastAll = spSheetAll.getLastRow();
        bulk.studentPasscodeRows = 0;
        if (spLastAll >= 2) {
          bulk.studentPasscodeRows = spLastAll - 1;
          spSheetAll.deleteRows(2, spLastAll - 1);
        }
      } catch (eSp) {
        bulk.errors.push('studentPasscodes: ' + eSp.toString());
        bulk.studentPasscodeRows = 0;
      }
      try {
        var codesSheetAll = getOrCreateTestCodesSheet();
        var tcLastAll = codesSheetAll.getLastRow();
        bulk.testCodes = 0;
        if (tcLastAll >= 2) {
          bulk.testCodes = tcLastAll - 1;
          codesSheetAll.deleteRows(2, tcLastAll - 1);
        }
      } catch (eTc) {
        bulk.errors.push('testCodes: ' + eTc.toString());
        bulk.testCodes = 0;
      }
      try {
        var feedbackSheetAll = getOrCreateFeedbackSheet();
        var fbLastAll = feedbackSheetAll.getLastRow();
        bulk.feedbackRows = 0;
        if (fbLastAll >= 2) {
          bulk.feedbackRows = fbLastAll - 1;
          feedbackSheetAll.deleteRows(2, fbLastAll - 1);
        }
      } catch (eFb) {
        bulk.errors.push('feedback: ' + eFb.toString());
        bulk.feedbackRows = 0;
      }
      bulk.driveRoots = {};
      try {
        bulk.driveRoots.onlineTestUploads = trashAllImmediateChildrenOfFolder_(getOrCreateOnlineTestUploadsRootFolder());
      } catch (eO) {
        bulk.driveRoots.onlineTestUploadsError = eO.toString();
      }
      try {
        bulk.driveRoots.legacyZipSubmissions = trashAllImmediateChildrenOfFolder_(getOrCreateTestSubmissionsFolder());
      } catch (eL) {
        bulk.driveRoots.legacyZipSubmissionsError = eL.toString();
      }
      try {
        bulk.driveRoots.testFeedback = trashAllImmediateChildrenOfFolder_(getOrCreateTestFeedbackFolder());
      } catch (eF) {
        bulk.driveRoots.testFeedbackError = eF.toString();
      }
      SpreadsheetApp.flush();
      var okMsg =
        'Bulk reset complete. Test codes, sessions, submissions, and feedback rows cleared; Drive roots emptied (trash). Question papers were not deleted.';
      if (bulk.errors.length) {
        okMsg += ' Some spreadsheet steps had errors (other steps still ran): ' + bulk.errors.join(' | ');
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: okMsg,
        removed: bulk
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (errAll) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: errAll.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (action === 'clearTestCodeData') {
    try {
      var adminClear = params.adminSecret || '';
      var storedClear = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
      if (!adminClear || adminClear !== storedClear) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
      }
      var codeClear = (params.code || '').toString().trim().toUpperCase();
      if (!codeClear) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Code required' })).setMimeType(ContentService.MimeType.JSON);
      }
      var scopeRaw = String(params.scope || 'in_progress').trim().toLowerCase();
      var delDriveRaw = String(params.deleteDrive || params.trashDrive || '').trim().toLowerCase();
      var trashDriveClear = delDriveRaw === '1' || delDriveRaw === 'yes' || delDriveRaw === 'true';
      var removedClear = { inProgressSessions: 0, sessionRows: 0, submissions: 0, resumeCodes: 0, driveTrashed: trashDriveClear };
      if (scopeRaw === 'all') {
        removedClear.submissions = deleteSubmissionsForTestCode_(codeClear, trashDriveClear);
        removedClear.sessionRows = deleteTestSessionsForCode_(codeClear, false);
        removedClear.resumeCodes = deleteResumeCodesForPrimary_(codeClear);
      } else if (scopeRaw === 'in_progress') {
        removedClear.inProgressSessions = deleteTestSessionsForCode_(codeClear, true);
      } else if (scopeRaw === 'session_rows' || scopeRaw === 'sessions') {
        removedClear.sessionRows = deleteTestSessionsForCode_(codeClear, false);
      } else if (scopeRaw === 'submissions') {
        removedClear.submissions = deleteSubmissionsForTestCode_(codeClear, trashDriveClear);
      } else if (scopeRaw === 'resume_codes' || scopeRaw === 'resumecodes') {
        removedClear.resumeCodes = deleteResumeCodesForPrimary_(codeClear);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'Unknown scope. Use in_progress, session_rows, submissions, resume_codes, or all'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      SpreadsheetApp.flush();
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Data cleared for test code ' + codeClear + (trashDriveClear ? ' (linked Drive items moved to trash)' : ''),
        removed: removedClear
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (errClear) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: errClear.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (action === 'deleteStudentSession') {
    try {
      var adminSess = params.adminSecret || '';
      var storedSess = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
      if (!adminSess || adminSess !== storedSess) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
      }
      var codeSess = (params.code || '').toString().trim().toUpperCase();
      var emailSess = (params.email || '').toString().trim();
      if (!codeSess || !emailSess) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'code and email required' })).setMimeType(ContentService.MimeType.JSON);
      }
      var nSess = deleteTestSessionsForCodeAndEmail_(codeSess, emailSess);
      SpreadsheetApp.flush();
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: nSess ? 'Removed ' + nSess + ' session row(s).' : 'No matching session row found.',
        removed: nSess
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (errSess) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: errSess.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (action === 'deleteStudentSubmission') {
    try {
      var adminSub = params.adminSecret || '';
      var storedSub = PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
      if (!adminSub || adminSub !== storedSub) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' })).setMimeType(ContentService.MimeType.JSON);
      }
      var codeSub = (params.code || '').toString().trim().toUpperCase();
      var emailSub = (params.email || '').toString().trim();
      if (!codeSub || !emailSub) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'code and email required' })).setMimeType(ContentService.MimeType.JSON);
      }
      var tsSub = params.timestamp != null ? String(params.timestamp) : '';
      var nSub = deleteSubmissionsForCodeEmailTimestamp_(codeSub, emailSub, tsSub);
      SpreadsheetApp.flush();
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: nSub ? 'Removed ' + nSub + ' submission row(s).' : 'No matching submission row found.',
        removed: nSub
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (errSub) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: errSub.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: 'Adhyant Registration Form Handler. Use ?action=list|download|generateCode|validateCode|listTestCodes|startTest|setTestCodeActive|listPapers|getPaper|servePaperQuestionImage|listFeedback|recordTestStart|abandonTestSession|listTestCodeActivity|deleteQuestionPaper|clearTestCodeData|clearAllTestData|deleteStudentSession|deleteStudentSubmission'
  })).setMimeType(ContentService.MimeType.JSON);
}


function getOrCreateSheet() {
    var sheet = getOrCreateStorageSheet('Adhyant_Storage_Registrations', ['Queries', 'Registrations'], function (s) {
      setupSheet(s);
    });
    if (sheet.getLastRow() === 0) {
      setupSheet(sheet);
    }
    return sheet;
  }

// Set up sheet with headers and formatting
function setupSheet(sheet) {
  // Set headers - ALL FIELDS FROM REGISTRATION FORM
  var headers = [
    'Timestamp', 
    'Full Name', 
    'Email', 
    'Phone', 
    'School', 
    'Course/Interest', 
    'Class', 
    'Message'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // Format header row
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#023997');  // Adhyant blue color
  headerRange.setFontColor('#FFFFFF');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  headerRange.setFontSize(11);
  
  // Set column widths
  sheet.setColumnWidth(1, 180);  // Timestamp
  sheet.setColumnWidth(2, 200);  // Full Name
  sheet.setColumnWidth(3, 220);  // Email
  sheet.setColumnWidth(4, 130);  // Phone
  sheet.setColumnWidth(5, 250);  // School
  sheet.setColumnWidth(6, 180);  // Course/Interest
  sheet.setColumnWidth(7, 100);  // Class
  sheet.setColumnWidth(8, 300);  // Message
  
  // Freeze header row
  sheet.setFrozenRows(1);
  
  Logger.log('Sheet setup complete');
}

// Send email notifications
function sendEmailNotifications(data) {
  try {
    Logger.log('Sending email notifications...');
    
    // Admin emails - UPDATE THESE WITH YOUR ACTUAL EMAILS
    var adminEmail = 'adhyantforyou@gmail.com';
    var additionalEmails = ['sumitrairkt@gmail.com', 'k.artiism06@gmail.com'];
    
    // Verify we have data
    if (!data) {
      Logger.log('No data to send in email');
      return;
    }
    
    // EMAIL TO ADMIN
    var adminSubject = '🎓 New Registration: ' + (data.fullName || 'Unknown Student');
    var adminBody = 
      '═══════════════════════════════════════════════════\n' +
      '          NEW REGISTRATION RECEIVED\n' +
      '═══════════════════════════════════════════════════\n\n' +
      '📋 STUDENT DETAILS:\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      'Full Name       : ' + (data.fullName || 'Not provided') + '\n' +
      'Email           : ' + (data.email || 'Not provided') + '\n' +
      'Phone           : ' + (data.phone || 'Not provided') + '\n' +
      'School          : ' + (data.school || 'Not provided') + '\n' +
      'Interested In   : ' + (data.course || 'Not provided') + '\n' +
      'Current Class   : ' + (data.class || 'Not provided') + '\n' +
      'Message         : ' + (data.message || 'No message') + '\n' +
      'Timestamp       : ' + (data.timestamp || new Date().toLocaleString()) + '\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '⚡ ACTION REQUIRED:\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '1. Call the student at ' + (data.phone || 'N/A') + '\n' +
      '2. Send course details to ' + (data.email || 'N/A') + '\n' +
      '3. Discuss their interest in: ' + (data.course || 'N/A') + '\n' +
      '4. Process the enrollment for Class ' + (data.class || 'N/A') + '\n\n' +
      '📊 View all registrations:\n' +
      SpreadsheetApp.getActiveSpreadsheet().getUrl() + '\n\n' +
      '═══════════════════════════════════════════════════\n' +
      '        Adhyant - Registration System\n' +
      '═══════════════════════════════════════════════════';
    
    Logger.log('Sending to: ' + adminEmail);
    
    // Send to primary admin
    MailApp.sendEmail({
      to: adminEmail,
      subject: adminSubject,
      body: adminBody
    });
    
    Logger.log('Primary email sent');
    
    // Send to additional emails if any
    additionalEmails.forEach(function(email) {
      if (email && email.trim() !== '') {
        try {
          MailApp.sendEmail({
            to: email,
            subject: adminSubject,
            body: adminBody
          });
          Logger.log('Email sent to: ' + email);
        } catch (e) {
          Logger.log('Failed to send to ' + email + ': ' + e.toString());
        }
      }
    });
    
    // OPTIONAL: Send confirmation email to student
    if (data.email && data.email.trim() !== '') {
      try {
        sendStudentConfirmation(data);
        Logger.log('Confirmation email sent to student');
      } catch (e) {
        Logger.log('Failed to send student confirmation: ' + e.toString());
      }
    }
    
    Logger.log('All emails sent successfully');
    
  } catch (error) {
    Logger.log('Email error: ' + error.toString());
    Logger.log('Email error stack: ' + error.stack);
    // Don't throw - let the registration succeed even if email fails
  }
}

// Send confirmation email to student
function sendStudentConfirmation(data) {
  var studentSubject = '✅ Registration Confirmed - Adhyant';
  var studentBody = 
    'Dear ' + (data.fullName || 'Student') + ',\n\n' +
    '🌟 Welcome to the Adhyant Family! We are truly blessed to have you with us! 🎉\n\n' +
    'Your decision to join Adhyant marks the beginning of an extraordinary journey towards excellence. We are honored to be part of your success story!\n\n' +
    'You have taken a phenomenal step towards your dreams, and we promise to guide you every step of the way. 💫\n\n' +
    'Here are your query details:\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
    'Course Interest : ' + (data.course || 'N/A') + '\n' +
    'Current Class   : ' + (data.class || 'N/A') + '\n' +
    'Phone           : ' + (data.phone || 'N/A') + '\n' +
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
    '✨ Our dedicated expert will reach out to you very soon to craft a personalized learning path just for you!\n\n' +
    'Feel free to connect with us anytime:\n' +
    '📞 WhatsApp: +91 9085287242\n' +
    '📧 Email: adhyantforyou@gmail.com\n\n' +
    'Get ready to unlock your true potential and achieve greatness! 🚀\n\n' +
    'We\'re excited to be on this journey with you!\n\n' +
    'With warm regards,\n' +
    'Team Adhyant\n' +
    'Mentored by IITians, Destined for Excellence';
  
  MailApp.sendEmail({
    to: data.email,
    subject: studentSubject,
    body: studentBody
  });
}

// Optional: Test the system manually
function testSubmission() {
  var testData = {
    timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    fullName: 'Test Student',
    email: 'test@example.com',
    phone: '9999999999',
    school: 'Test School, Bhiwadi',
    course: 'IIT-JEE Preparation',
    class: '11',
    message: 'This is a test message from the registration system.'
  };
  
  Logger.log('Running test submission...');
  
  var sheet = getOrCreateSheet();
  sheet.appendRow([
    testData.timestamp,
    testData.fullName,
    testData.email,
    testData.phone,
    testData.school,
    testData.course,
    testData.class,
    testData.message
  ]);
  
  sendEmailNotifications(testData);
  Logger.log('Test submission completed successfully!');
  Logger.log('Check your email at: sumitrairkt@gmail.com');
  Logger.log('Check Google Sheet for test data');
}

// Optional: Clear all data (use with caution!)
function clearAllData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Registrations');
  if (sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
      Logger.log('Cleared ' + (lastRow - 1) + ' rows');
    }
  }
}

// Optional: Check quota remaining
function checkEmailQuota() {
  var quota = MailApp.getRemainingDailyQuota();
  Logger.log('Remaining email quota: ' + quota);
  return quota;
}

// Optional: Get statistics
function getStatistics() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Registrations');
  if (!sheet) {
    Logger.log('No registrations sheet found');
    return;
  }
  
  var lastRow = sheet.getLastRow();
  var totalRegistrations = lastRow - 1; // Excluding header
  
  Logger.log('═══════════════════════════════════');
  Logger.log('REGISTRATION STATISTICS');
  Logger.log('═══════════════════════════════════');
  Logger.log('Total Registrations: ' + totalRegistrations);
  
  if (totalRegistrations > 0) {
    // Get all data
    var data = sheet.getRange(2, 1, totalRegistrations, 8).getValues();
    
    // Count by course
    var courseCounts = {};
    var classCounts = {};
    
    data.forEach(function(row) {
      var course = row[5] || 'Unknown';
      var studentClass = row[6] || 'Unknown';
      
      courseCounts[course] = (courseCounts[course] || 0) + 1;
      classCounts[studentClass] = (classCounts[studentClass] || 0) + 1;
    });
    
    Logger.log('\nBy Course:');
    for (var course in courseCounts) {
      Logger.log('  ' + course + ': ' + courseCounts[course]);
    }
    
    Logger.log('\nBy Class:');
    for (var cls in classCounts) {
      Logger.log('  Class ' + cls + ': ' + classCounts[cls]);
    }
  }
  
  Logger.log('═══════════════════════════════════');
}

/**
 * ===============================================
 * DEPLOYMENT INSTRUCTIONS:
 * ===============================================
 * 
 * STEP 1: CREATE GOOGLE SHEET
 * ----------------------------
 * 1. Go to Google Sheets (sheets.google.com)
 * 2. Create a new blank spreadsheet
 * 3. Name it "Adhyant Registrations"
 * 
 * STEP 2: OPEN APPS SCRIPT
 * ------------------------
 * 1. In your Google Sheet, click Extensions > Apps Script
 * 2. Delete all existing code in the editor
 * 
 * STEP 3: PASTE THIS CODE
 * -----------------------
 * 1. Copy this ENTIRE file
 * 2. Paste into the Apps Script editor
 * 3. Click Save (💾) - name it "RegistrationHandler"
 * 
 * STEP 4: TEST THE SCRIPT
 * -----------------------
 * 1. Select "testSubmission" from function dropdown
 * 2. Click Run (▶)
 * 3. Authorize the script when prompted
 * 4. Check your Google Sheet - should see test data
 * 5. Check email at sumitrairkt@gmail.com
 * 
 * STEP 5: DEPLOY AS WEB APP
 * -------------------------
 * 1. Click Deploy > New Deployment
 * 2. Click "Select type" > Web App
 * 3. Description: "Adhyant Registration Form Handler"
 * 4. Execute as: Me
 * 5. Who has access: Anyone
 * 6. Click Deploy
 * 7. COPY THE WEB APP URL (you'll need this!)
 * 
 * STEP 6: UPDATE YOUR REACT APP
 * -----------------------------
 * Create a new file in your React app or update RegistrationModal.jsx
 * with the Web App URL from Step 5
 * 
 * STEP 7: VERIFY EMAILS
 * ---------------------
 * Update these lines (around line 127-128):
 * var adminEmail = 'YOUR_EMAIL@gmail.com';
 * var additionalEmails = ['ANOTHER_EMAIL@gmail.com'];
 * 
 * ===============================================
 * TESTING:
 * ===============================================
 * 
 * 1. Run "testSubmission" function
 * 2. Check Google Sheet for test row
 * 3. Check email inbox
 * 4. Run "getStatistics" to see summary
 * 5. Run "checkEmailQuota" to verify email limits
 * 
 * ===============================================
 * TROUBLESHOOTING:
 * ===============================================
 * 
 * - Check execution logs: View > Executions
 * - Verify email addresses are correct
 * - Check spam folder for test emails
 * - Ensure sheet name is exactly "Registrations"
 * - Make sure deployment is set to "Anyone"
 * - Try re-deploying with "New Version"
 * 
 * ===============================================
 * FIELDS CAPTURED:
 * ===============================================
 * 
 * 1. Timestamp (Auto-generated)
 * 2. Full Name (Required)
 * 3. Email (Required, validated)
 * 4. Phone (Required, 10-digit validation)
 * 5. School (Required)
 * 6. Course/Interest (Required - IIT-JEE/NEET/Foundation/Career)
 * 7. Class (Required - 8/9/10/11/12/Dropper)
 * 8. Message (Optional)
 * 
 * ===============================================
 */
