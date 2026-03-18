/**
 * ADHYANT REGISTRATION FORM - GOOGLE APPS SCRIPT
 * 
 * This script handles form submissions from the Adhyant registration popup
 * Includes: Full Name, Email, Phone, School, Course, Class, Message
 * 
 * SETUP: Copy this entire file to Google Apps Script
 */

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
    // Test submission: zip + metadata (from online test)
    if (data.zipBase64 && data.metadata) {
      return doPostTestSubmission(data);
    }
    // Create question paper (admin only)
    if (data.action === 'createPaper' && data.adminSecret && data.name) {
      return doPostCreateQuestionPaper(data);
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
    fileName = 'Test_' + studentName + '_' + timestamp + '.zip';

    var zipBytes = Utilities.base64Decode(zipBase64);
    zipBlob = Utilities.newBlob(zipBytes).setContentType('application/zip').setName(fileName);
    folder = getOrCreateTestSubmissionsFolder();
    sheet = getOrCreateTestSubmissionsSheet();

    var testCode = (metadata.testCode || '').toString().trim().toUpperCase();
    // Append row as pending first so admin sees "Pending" while upload runs
    sheet.appendRow([
      timestamp,
      metadata.studentName || '',
      metadata.studentEmail || '',
      metadata.studentAdhar || '',
      metadata.studentPhone || '',
      metadata.score != null ? metadata.score : '',
      metadata.totalQuestions != null ? metadata.totalQuestions : '',
      metadata.isMobile === true ? 'Yes' : 'No',
      metadata.events ? JSON.stringify(metadata.events) : '',
      '',
      fileName,
      '',
      'pending',
      testCode
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
        'Score        : ' + (metadata.score != null ? metadata.score : '—') + ' / ' + (metadata.totalQuestions != null ? metadata.totalQuestions : '—') + '\n' +
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
    var questionsJson = JSON.stringify(questions);
    if (questionsJson.length > 50000) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Question set too large' })).setMimeType(ContentService.MimeType.JSON);
    }
    sheet.appendRow([id, name, createdAt, createdBy, questionsJson]);
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', id: id })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateTestSubmissionsFolder() {
  var drive = DriveApp;
  var folderName = 'Adhyant_Test_Submissions';
  var folders = drive.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return drive.createFolder(folderName);
}

/**
 * Feedback folder on Drive: Adhyant_Test_Feedback (separate directory for feedback files).
 */
function getOrCreateTestFeedbackFolder() {
  var drive = DriveApp;
  var folderName = 'Adhyant_Test_Feedback';
  var folders = drive.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return drive.createFolder(folderName);
}

/**
 * Feedback sheet – columns: Timestamp, Rating, RatingLabel, Comment, Student Name, Student Email, Student Phone, Drive status.
 */
function getOrCreateFeedbackSheet() {
  var SPREADSHEET_ID = '1fC7EVW1Gs_y4knbuXRHO_dZ_xb6NIw37PXri-dE55Q8';
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Feedback');
  if (!sheet) {
    sheet = ss.insertSheet('Feedback');
    sheet.getRange(1, 1, 1, 8).setValues([['Timestamp', 'Rating', 'RatingLabel', 'Comment', 'Student Name', 'Student Email', 'Student Phone', 'Drive status']]);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
  } else if (sheet.getLastColumn() < 8) {
    sheet.getRange(1, 8).setValue('Drive status').setFontWeight('bold');
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
    var timestamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
    var ratingLabel = RATING_LABELS[rating] || '';

    sheet = getOrCreateFeedbackSheet();
    sheet.appendRow([timestamp, rating, ratingLabel, comment, studentName, studentEmail, studentPhone, 'pending']);
    lastRow = sheet.getLastRow();

    folder = getOrCreateTestFeedbackFolder();
    var safeName = (studentName || 'Anonymous').replace(/[/\\?%*:|"<>]/g, '-').substring(0, 50);
    var fileTimestamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd_HH-mm-ss');
    var fileName = 'Feedback_' + safeName + '_' + fileTimestamp + '.csv';
    var csv = 'Timestamp,Rating,RatingLabel,Comment,Student Name,Student Email,Student Phone\n' +
      '"' + timestamp + '",' + rating + ',"' + ratingLabel.replace(/"/g, '""') + '","' + (comment.replace(/"/g, '""')) + '","' + studentName.replace(/"/g, '""') + '","' + studentEmail.replace(/"/g, '""') + '","' + (studentPhone.replace(/"/g, '""')) + '"';
    blob = Utilities.newBlob(csv, 'text/csv', fileName);

    var file = null;
    var lastError = null;
    for (var attempt = 1; attempt <= 4; attempt++) {
      if (attempt > 1) {
        sheet.getRange(lastRow, 8).setValue('retry_' + (attempt - 1));
      }
      try {
        file = folder.createFile(blob);
        break;
      } catch (e) {
        lastError = e;
      }
    }

    if (!file) {
      sheet.getRange(lastRow, 8).setValue('failed');
      Logger.log('Feedback Drive upload failed after 3 retries: ' + (lastError && lastError.toString()));
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: lastError ? lastError.toString() : 'Upload failed after retries'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    sheet.getRange(lastRow, 8).setValue('uploaded');

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Feedback saved to Google Drive'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('Feedback error: ' + err.toString());
    if (sheet && lastRow) {
      try {
        sheet.getRange(lastRow, 8).setValue('failed');
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

/**
 * Handle sign-up for test (online or offline): store in TestSignUps sheet.
 * Expects JSON: { action: 'testSignUp', fullName, email, phone, testType: 'online'|'offline', testDate, message? }
 */
function doPostTestSignUp(data) {
  try {
    var fullName = (data.fullName || '').toString().trim();
    var email = (data.email || '').toString().trim();
    var phone = (data.phone || '').toString().trim().replace(/\s/g, '');
    var testType = (data.testType || 'online').toString().trim();
    var testDate = (data.testDate || '').toString().trim();
    var message = (data.message || '').toString().trim();
    var timestamp = data.timestamp || Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
    var sheet = getOrCreateTestSignUpsSheet();
    sheet.appendRow([timestamp, fullName, email, phone, testType, testDate, message]);
    try {
      var emailSubject = 'Adhyant: New test form sign-up – ' + (fullName || 'Unknown');
      var emailBody =
        'New test form sign-up received\n\n' +
        'Full Name : ' + (fullName || '—') + '\n' +
        'Email     : ' + (email || '—') + '\n' +
        'Phone     : ' + (phone || '—') + '\n' +
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

function getOrCreateTestSignUpsSheet() {
  var SPREADSHEET_ID = '1fC7EVW1Gs_y4knbuXRHO_dZ_xb6NIw37PXri-dE55Q8';
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('TestSignUps');
  if (!sheet) {
    sheet = ss.insertSheet('TestSignUps');
    sheet.getRange(1, 1, 1, 7).setValues([['Timestamp', 'Full Name', 'Email', 'Phone', 'Test Type', 'Test Date', 'Message']]);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
  } else if (sheet.getLastColumn() < 7) {
    sheet.insertColumnAfter(4);
    sheet.getRange(1, 5).setValue('Test Type').setFontWeight('bold');
  }
  return sheet;
}

function getOrCreateTestSubmissionsSheet() {
  var SPREADSHEET_ID = '1fC7EVW1Gs_y4knbuXRHO_dZ_xb6NIw37PXri-dE55Q8';
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('TestSubmissions');
  if (!sheet) {
    sheet = ss.insertSheet('TestSubmissions');
    sheet.getRange(1, 1, 1, 15).setValues([['Timestamp', 'Student Name', 'Email', 'Aadhaar', 'Phone', 'Score', 'Total', 'Mobile', 'Events', 'File ID', 'File Name', 'File Size (bytes)', 'Video status', 'Upload error', 'Test code']]);
    sheet.getRange(1, 1, 1, 15).setFontWeight('bold');
  } else {
    if (sheet.getLastColumn() < 13) sheet.getRange(1, 13).setValue('Video status').setFontWeight('bold');
    if (sheet.getLastColumn() < 14) sheet.getRange(1, 14).setValue('Upload error').setFontWeight('bold');
    if (sheet.getLastColumn() < 15) sheet.getRange(1, 15).setValue('Test code').setFontWeight('bold');
  }
  return sheet;
}

function getOrCreateTestSessionsSheet() {
  var SPREADSHEET_ID = '1fC7EVW1Gs_y4knbuXRHO_dZ_xb6NIw37PXri-dE55Q8';
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('TestSessions');
  if (!sheet) {
    sheet = ss.insertSheet('TestSessions');
    sheet.getRange(1, 1, 1, 5).setValues([['Code', 'Email', 'Name', 'StartedAt', 'Status']]);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  }
  return sheet;
}

function getOrCreateTestCodesSheet() {
  var SPREADSHEET_ID = '1fC7EVW1Gs_y4knbuXRHO_dZ_xb6NIw37PXri-dE55Q8';
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('TestCodes');
  if (!sheet) {
    sheet = ss.insertSheet('TestCodes');
    sheet.getRange(1, 1, 1, 5).setValues([['Code', 'CreatedAt', 'CreatedBy', 'QuestionPaperId', 'Started']]);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  } else if (sheet.getLastColumn() < 5) {
    sheet.getRange(1, 5).setValue('Started').setFontWeight('bold');
  }
  return sheet;
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

function getOrCreateQuestionPapersSheet() {
  var SPREADSHEET_ID = '1fC7EVW1Gs_y4knbuXRHO_dZ_xb6NIw37PXri-dE55Q8';
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('QuestionPapers');
  if (!sheet) {
    sheet = ss.insertSheet('QuestionPapers');
    sheet.getRange(1, 1, 1, 5).setValues([['Id', 'Name', 'CreatedAt', 'CreatedBy', 'QuestionsJson']]);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  }
  return sheet;
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
      var numCols = Math.max(14, sheet.getLastColumn());
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
          uploadError: uploadErrorVal
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
      var fnumCols = Math.max(8, feedbackSheet.getLastColumn());
      var fdata = feedbackSheet.getRange(2, 1, flastRow, fnumCols).getValues();
      var fdataFiltered = fdata.filter(function (row) {
        var first = row[0];
        return first !== null && first !== undefined && String(first).trim() !== '';
      });
      var feedbackList = fdataFiltered.map(function (row) {
        var driveStatus = row.length >= 8 && row[7] !== undefined && row[7] !== '' ? String(row[7]) : 'uploaded';
        return {
          timestamp: row[0],
          rating: row[1],
          ratingLabel: row[2],
          comment: row[3] || '',
          studentName: row[4] || '',
          studentEmail: row[5] || '',
          studentPhone: row[6] || '',
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
      var sheet = getOrCreateTestCodesSheet();
      var code = randomTestCode();
      var createdAt = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
      var createdBy = params.adminEmail || '';
      var questionPaperId = (params.questionPaperId || '').toString().trim();
      sheet.appendRow([code, createdAt, createdBy, questionPaperId]);
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', code: code })).setMimeType(ContentService.MimeType.JSON);
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
      var sheet = getOrCreateTestCodesSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'success', valid: false })).setMimeType(ContentService.MimeType.JSON);
      }
      var numCols = Math.max(5, sheet.getLastColumn());
      var data = sheet.getRange(2, 1, lastRow, numCols).getValues();
      for (var i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim().toUpperCase() === code) {
          var rowIndex = i + 2;
          var questionPaperId = data[i][3] ? String(data[i][3]).trim() : '';
          var startedCell = sheet.getRange(rowIndex, 5).getValue();
          var startedVal = String(startedCell != null && startedCell !== '' ? startedCell : '').trim().toLowerCase();
          var started = (startedVal === 'yes' || startedVal === 'true' || startedVal === '1');
          return ContentService.createTextOutput(JSON.stringify({
            status: 'success',
            valid: true,
            started: started,
            questionPaperId: questionPaperId || null
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
      var numCols = Math.max(5, sheet.getLastColumn());
      var data = sheet.getRange(2, 1, lastRow, numCols).getValues();
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
        return {
          code: String(row[0]).trim(),
          createdAt: createdAt,
          createdBy: row[2] ? String(row[2]) : '',
          questionPaperId: row[3] ? String(row[3]).trim() : '',
          started: started
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
  if (action === 'listPapers') {
    try {
      var sheet = getOrCreateQuestionPapersSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'success', papers: [] })).setMimeType(ContentService.MimeType.JSON);
      }
      var data = sheet.getRange(2, 1, lastRow, 4).getValues();
      var papers = data.map(function (row) {
        return { id: row[0], name: row[1], createdAt: row[2], createdBy: row[3] };
      });
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', papers: papers })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (action === 'getPaper' && params.id) {
    try {
      var sheet = getOrCreateQuestionPapersSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Not found' })).setMimeType(ContentService.MimeType.JSON);
      }
      var data = sheet.getRange(2, 1, lastRow, 5).getValues();
      var paperId = (params.id || '').toString().trim();
      for (var i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === paperId) {
          var questionsJson = data[i][4] ? String(data[i][4]) : '[]';
          var questions = [];
          try {
            questions = JSON.parse(questionsJson);
          } catch (e) {}
          return ContentService.createTextOutput(JSON.stringify({
            status: 'success',
            paper: {
              id: data[i][0],
              name: data[i][1],
              createdAt: data[i][2],
              createdBy: data[i][3],
              questions: questions,
              title: data[i][1],
              durationMinutes: 30
            }
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Not found' })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (action === 'recordTestStart') {
    try {
      var code = (params.code || '').toString().trim().toUpperCase();
      var email = (params.email || '').toString().trim();
      var name = (params.name || '').toString().trim();
      if (!code) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Code required' })).setMimeType(ContentService.MimeType.JSON);
      }
      var sessionsSheet = getOrCreateTestSessionsSheet();
      var startedAt = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
      var sData = sessionsSheet.getDataRange().getValues();
      for (var si = 1; si < sData.length; si++) {
        if (String(sData[si][0]).trim().toUpperCase() === code &&
            String(sData[si][1]).trim().toLowerCase() === email.toLowerCase()) {
          sessionsSheet.getRange(si + 1, 3).setValue(name);
          sessionsSheet.getRange(si + 1, 4).setValue(startedAt);
          sessionsSheet.getRange(si + 1, 5).setValue('in_progress');
          return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Test start recorded' })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      sessionsSheet.appendRow([code, email, name, startedAt, 'in_progress']);
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Test start recorded' })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
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
      var inProgress = [];
      var sessionsSheet = getOrCreateTestSessionsSheet();
      var sLast = sessionsSheet.getLastRow();
      if (sLast >= 2) {
        var sData = sessionsSheet.getRange(2, 1, sLast, 5).getValues();
        for (var si = 0; si < sData.length; si++) {
          if (String(sData[si][0]).trim().toUpperCase() === code && String(sData[si][4]).trim().toLowerCase() === 'in_progress') {
            inProgress.push({
              email: String(sData[si][1]).trim(),
              name: String(sData[si][2]).trim(),
              startedAt: sData[si][3] != null ? String(sData[si][3]) : ''
            });
          }
        }
      }
      var submissions = [];
      var subSheet = getOrCreateTestSubmissionsSheet();
      var subLast = subSheet.getLastRow();
      var numCols = Math.max(15, subSheet.getLastColumn());
      if (subLast >= 2) {
        var subData = subSheet.getRange(2, 1, subLast, numCols).getValues();
        for (var ri = 0; ri < subData.length; ri++) {
          var row = subData[ri];
          var rowCode = (row.length >= 15 && row[14] != null && row[14] !== '') ? String(row[14]).trim().toUpperCase() : '';
          if (rowCode === code) {
            submissions.push({
              studentName: row[1] != null ? String(row[1]) : '',
              email: row[2] != null ? String(row[2]) : '',
              score: row[5] != null ? row[5] : '',
              total: row[6] != null ? row[6] : '',
              timestamp: row[0] != null ? String(row[0]) : ''
            });
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        code: code,
        inProgress: inProgress,
        submissions: submissions
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: 'Adhyant Registration Form Handler. Use ?action=list|download|generateCode|validateCode|listTestCodes|startTest|listPapers|getPaper|listFeedback|recordTestStart|listTestCodeActivity'
  })).setMimeType(ContentService.MimeType.JSON);
}


function getOrCreateSheet() {
    // 🔴 IMPORTANT: PUT YOUR SHEET ID HERE
    var SPREADSHEET_ID = '1fC7EVW1Gs_y4knbuXRHO_dZ_xb6NIw37PXri-dE55Q8';
  
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('Queries');
  
    if (!sheet) {
      sheet = ss.insertSheet('Queries');
      setupSheet(sheet);
    }
  
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
