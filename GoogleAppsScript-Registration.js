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
    // Log what we received for debugging
    Logger.log('Received POST request');
    Logger.log('Content: ' + e.postData.contents);
    
    // Parse incoming data
    var data = JSON.parse(e.postData.contents);
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

// Handle GET requests (for testing)
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    'status': 'success',
    'message': 'Adhyant Registration Form Handler is running!'
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
