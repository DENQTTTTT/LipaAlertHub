// functions/index.js - Improved Implementation with Region Fix and Optimizations

const { setGlobalOptions } = require("firebase-functions");
const { onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { Resend } = require("resend");
const crypto = require("crypto");
const sharp = require("sharp");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

// Initialize Firebase Admin
admin.initializeApp();

// Set global options for cost control and region
setGlobalOptions({ 
  maxInstances: 3,        // Reduced from 10 to 3
  region: "asia-southeast1",
  cpu: 0.5,              // Add global CPU limit
  memory: "256MiB"       // Add global memory limit
});

// Initialize Resend client with error handling
const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable is not set");
  }
  return new Resend(apiKey);
};

// Constants
const OTP_EXPIRY_MINUTES = 5;
const MAX_VERIFY_ATTEMPTS = 5;
const RATE_LIMIT_SECONDS = 60; // Improved: More restrictive rate limiting
const PASSWORD_RESET_WINDOW_MINUTES = 10;
const MAX_OTP_REQUESTS_PER_HOUR = 3; // New: Hourly rate limit
const PUSH_NOTIFICATION_BATCH_SIZE = 100;
const MAX_RETRY_ATTEMPTS = 3;


// Weather & Disaster Alert Constants
const OPENWEATHER_API_KEY = "0baa706a6ca53436f3aa0b5bd9f0d25b";
const LIPA_LAT = 13.9411;
const LIPA_LON = 121.1631;
const USGS_RADIUS = 200;

/* ===================================================================
   UTILITY FUNCTIONS FOR RATE LIMITING AND ERROR HANDLING
=================================================================== */

// Enhanced rate limiting with hourly limits
async function checkRateLimit(email, operation = 'otp') {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - RATE_LIMIT_SECONDS * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Check recent requests (1 minute)
  const recentQuery = await admin
    .firestore()
    .collection("rate_limits")
    .where("email", "==", email)
    .where("operation", "==", operation)
    .where("timestamp", ">", admin.firestore.Timestamp.fromDate(oneMinuteAgo))
    .get();

  if (!recentQuery.empty) {
    throw new Error(`Rate limit exceeded. Please wait ${RATE_LIMIT_SECONDS} seconds before requesting again.`);
  }

  // Check hourly requests
  const hourlyQuery = await admin
    .firestore()
    .collection("rate_limits")
    .where("email", "==", email)
    .where("operation", "==", operation)
    .where("timestamp", ">", admin.firestore.Timestamp.fromDate(oneHourAgo))
    .get();

  if (hourlyQuery.size >= MAX_OTP_REQUESTS_PER_HOUR) {
    throw new Error(`Hourly limit exceeded. You can only request ${MAX_OTP_REQUESTS_PER_HOUR} OTPs per hour.`);
  }

  // Record this request
  await admin.firestore().collection("rate_limits").add({
    email,
    operation,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    ip: null // Can be enhanced to include IP tracking
  });
}

// Retry mechanism for critical operations
async function retryOperation(operation, maxRetries = MAX_RETRY_ATTEMPTS) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
      logger.warn(`Operation failed, retrying (${attempt}/${maxRetries})`, error);
    }
  }
  throw lastError;
}

// Enhanced email validation
function validateEmail(email) {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(email)) {
    throw new Error("Invalid email format");
  }
  if (email.length > 254) {
    throw new Error("Email address too long");
  }
}

/* ===================================================================
   PASSWORD RESET OTP SYSTEM - Enhanced with Better Rate Limiting
=================================================================== */
// Add this migration function as a callable export
const { onRequest } = require("firebase-functions/v2/https");

exports.migrateUsersNow = onRequest({
  region: "asia-southeast1",
  cors: true
}, async (req, res) => {
  try {
    console.log("🚀 Starting immediate migration of existing users...");
    
    const db = admin.firestore();
    
    // Check if migration already completed
    const migrationStatus = await db.collection("_system").doc("migration_status").get();
    if (migrationStatus.exists && migrationStatus.data().completed) {
      console.log("ℹ️ Migration already completed");
      return res.status(200).json({
        success: true,
        message: "Migration already completed",
        alreadyCompleted: true
      });
    }

    // Use the correct collection name
    const usersSnapshot = await db.collection("users").get();
    const allUsers = usersSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    
    const batch = db.batch();
    let migratedCount = 0;
    
    // Define cutoff date when approval system started
    const approvalSystemDate = new Date("2025-09-27");
    
    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      const createdAt = userData.createdAt?.toDate?.() || new Date(0);
      
      // Check if user needs update
      const needsMigration =
        !userData.hasOwnProperty("status") ||
        (userData.status === "pending" && createdAt < approvalSystemDate) ||
        userData.status == null ||
        userData.migrated !== true;
      
      if (needsMigration) {
        const updates = {
          status: "active", // Set existing users to active
          statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          statusUpdatedBy: "system_migration",
          migrated: true,
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        
        // Add moderation fields if missing
        if (userData.warnings === undefined) updates.warnings = 0;
        if (userData.strikes === undefined) updates.strikes = 0;
        if (userData.lastViolationReason === undefined) updates.lastViolationReason = "";
        if (userData.lastViolationDate === undefined) updates.lastViolationDate = null;
        if (userData.suspensionUntil === undefined) updates.suspensionUntil = null;
        if (userData.duplicateFlag === undefined) updates.duplicateFlag = false;
        
        // Check for duplicate (same name + barangay)
        if (userData.name && userData.barangay) {
          const duplicate = allUsers.find(
            (u) =>
              u.name === userData.name &&
              u.barangay === userData.barangay &&
              u.id !== doc.id
          );
          if (duplicate) {
            updates.duplicateFlag = true;
            updates.duplicateOf = duplicate.id;
            updates.status = "under_review";
            console.log(`⚠️ Duplicate detected for ${userData.name} (${userData.barangay})`);
          }
        }
        
        batch.update(doc.ref, updates);
        migratedCount++;
      }
    }
    
    if (migratedCount > 0) {
      await batch.commit();
      console.log(`✅ Migrated ${migratedCount} users successfully`);
    } else {
      console.log("ℹ️ No users needed migration");
    }

    // Mark migration as completed
    await db.collection("_system").doc("migration_status").set({
      completed: true,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      migratedCount,
      totalUsers: usersSnapshot.size
    });
    
    return res.status(200).json({
      success: true,
      migratedCount,
      total: usersSnapshot.size,
      message: `Successfully migrated ${migratedCount} users`
    });
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Request OTP - Enhanced with improved rate limiting and error handling
exports.requestOtp = onCall({
  region: "asia-southeast1", // Fixed: Explicit region setting
  cors: true,
  enforceAppCheck: false // Set to true in production for better security
}, async (request) => {
  const { email } = request.data;
  
  if (!email || typeof email !== "string") {
    throw new Error("Valid email address is required");
  }

  const normalizedEmail = email.trim().toLowerCase();
  
  try {
    validateEmail(normalizedEmail);
    await checkRateLimit(normalizedEmail, 'otp_request');
    
    const now = admin.firestore.Timestamp.now();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const sessionId = crypto.randomBytes(32).toString("hex");
    const codeHash = crypto.createHash("sha256").update(otp).digest("hex");
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    const otpDoc = {
      email: normalizedEmail,
      codeHash,
      sessionId,
      createdAt: now,
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      used: false,
      attempts: 0,
      verified: false,
      clientIP: request.rawRequest?.ip || 'unknown',
      userAgent: request.rawRequest?.headers?.['user-agent'] || 'unknown'
    };

    // Check if user exists (but don't reveal this information)
    let userExists = false;
    try {
      await admin.auth().getUserByEmail(normalizedEmail);
      userExists = true;
    } catch (error) {
      logger.info(`Password reset requested for non-existent email: ${normalizedEmail}`);
    }

    // Always create OTP document for security (timing attack prevention)
    await admin.firestore().collection("otp").add(otpDoc);

 if (userExists) {
  try {
    // FIXED: Use process.env instead of functions.config()
    const apiKey = process.env.RESEND_API_KEY;
    
    if (apiKey) {
      // Initialize Resend
      const resend = new Resend(apiKey);
      
      // DEVELOPMENT: Log OTP to console for testing
      logger.info("=".repeat(60));
      logger.info("PASSWORD RESET OTP - DEVELOPMENT MODE");
      logger.info("=".repeat(60));
      logger.info(`Email: ${normalizedEmail}`);
      logger.info(`OTP Code: ${otp}`);
      logger.info(`Expires in: ${OTP_EXPIRY_MINUTES} minutes`);
      logger.info(`Session ID: ${sessionId.substring(0, 12)}...`);
      logger.info(`Valid until: ${expiresAt.toLocaleString()}`);
      logger.info("Resend client initialized successfully");
      logger.info("=".repeat(60));
      
      
      // DEVELOPMENT: Save to Firestore for testing
      await admin.firestore().collection("dev_otp_logs").add({
        email: normalizedEmail,
        otp,
        sessionId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        environment: "development",
        used: false,
        resendReady: true
      });
      
      // PRODUCTION: Uncomment this block when ready for deployment
      /*
      await retryOperation(async () => {
        const emailHtml = `
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
                .otp-code { font-size: 32px; font-weight: bold; color: #007bff; text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px; margin: 20px 0; }
                .warning { color: #dc3545; font-size: 14px; margin-top: 20px; }
                .footer { margin-top: 30px; font-size: 12px; color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Password Reset Request - LipaAlertHub</h1>
                </div>
                <p>You have requested a password reset for your LipaAlertHub account.</p>
                <div class="otp-code">${otp}</div>
                <p>This code will expire in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>.</p>
                <div class="warning">
                  <strong>Security Notice:</strong> If you did not request this password reset, please ignore this email and ensure your account is secure.
                </div>
                <div class="footer">
                  <p>This is an automated message from LipaAlertHub. Please do not reply to this email.</p>
                </div>
              </div>
            </body>
          </html>
        `;
        
        await resend.emails.send({
          from: "LipaAlertHub <noreply@yourdomain.com>", // PRODUCTION: Update with your verified domain
          to: [normalizedEmail],
          subject: "Password Reset Code - LipaAlertHub",
          html: emailHtml,
        });
        
        logger.info("Email sent successfully via Resend");
      });
      */
      
       
    } else {
      // FALLBACK: No Resend API key configured
      logger.info(`DEV MODE - OTP for ${normalizedEmail}: ${otp}`);
    }
  } catch (emailError) {
    logger.error("Email integration error:", emailError);
    // Don't fail the entire request if email fails
  }
}
    return { 
      success: true, 
      sessionId, 
      message: "If an account with this email exists, a password reset code has been sent.",
      expiresIn: `${OTP_EXPIRY_MINUTES} minutes`
    };
    
  } catch (error) {
    logger.error("Error in requestOtp:", error);
    
    // Return user-friendly error messages
    if (error.message.includes("Rate limit")) {
      throw new Error(error.message);
    }
    if (error.message.includes("Invalid email")) {
      throw new Error(error.message);
    }
    
    throw new Error("Unable to process password reset request. Please try again later.");
  }
});
exports.onUserStatusChange = onDocumentUpdated({
  document: "users/{uid}",
  region: "asia-southeast1"
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const uid = event.params.uid;

  // Only process if status changed
  if (!before || !after || before.status === after.status) {
    return;
  }

  const email = after.email;
  const name = after.name || after.displayName || "User";
  
  if (!email) {
    logger.warn(`No email found for user ${uid} status change`);
    return;
  }

  try {
    logger.info(`User ${uid} status changed: ${before.status} -> ${after.status}`);
    
    let subject, html;

    if (after.status === "active") {
      subject = "✅ Your LipaAlertHub Account Has Been Approved";
      html = `
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #d73527; color: white; padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .header h1 { margin: 0; font-size: 28px; }
              .content { background: white; padding: 30px 20px; border: 1px solid #ddd; border-radius: 0 0 10px 10px; }
              .status-badge { background: #27ae60; color: white; padding: 12px 24px; border-radius: 25px; display: inline-block; margin: 20px 0; font-weight: bold; }
              .cta-button { background: #d73527; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; margin: 20px 0; font-weight: bold; }
              .footer { color: #666; font-size: 14px; margin-top: 30px; text-align: center; }
              .logo { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="logo">🚨 LipaAlertHub</div>
              <h1>Account Approved!</h1>
            </div>
            <div class="content">
              <p>Dear <strong>${name}</strong>,</p>
              
              <div class="status-badge">✅ APPROVED</div>
              
              <p>Great news! Your LipaAlertHub account has been <strong>approved</strong> by our admin team.</p>
              
              <p>You can now:</p>
              <ul>
                <li>📱 Access all app features</li>
                <li>🚨 Submit emergency reports</li>
                <li>📢 Receive disaster alerts</li>
                <li>💬 Participate in community forums</li>
                <li>📍 Find evacuation centers</li>
              </ul>
              
              <a href="#" class="cta-button">Open LipaAlertHub App</a>
              
              <p>Thank you for being part of our emergency preparedness community. Together, we make Lipa City safer!</p>
              
              <div class="footer">
                <p><strong>LipaAlertHub Team</strong><br/>
                City Disaster Risk Reduction and Management Office<br/>
                Lipa City, Batangas</p>
                <p><em>This is an automated message. Please do not reply to this email.</em></p>
              </div>
            </div>
          </body>
        </html>
      `;
    } else if (after.status === "declined") {
      const declineReason = after.declineReason || "No specific reason provided";
      subject = "⚠️ Your LipaAlertHub Account Application Update";
      html = `
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #e74c3c; color: white; padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .header h1 { margin: 0; font-size: 28px; }
              .content { background: white; padding: 30px 20px; border: 1px solid #ddd; border-radius: 0 0 10px 10px; }
              .status-badge { background: #e74c3c; color: white; padding: 12px 24px; border-radius: 25px; display: inline-block; margin: 20px 0; font-weight: bold; }
              .reason-box { background: #f8f9fa; border-left: 4px solid #e74c3c; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }
              .support-info { background: #e3f2fd; border: 1px solid #2196f3; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .footer { color: #666; font-size: 14px; margin-top: 30px; text-align: center; }
              .logo { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="logo">🚨 LipaAlertHub</div>
              <h1>Application Review Update</h1>
            </div>
            <div class="content">
              <p>Dear <strong>${name}</strong>,</p>
              
              <div class="status-badge">⏳ UNDER REVIEW</div>
              
              <p>Thank you for your interest in joining LipaAlertHub. After reviewing your application, we need additional information before we can approve your account.</p>
              
              <div class="reason-box">
                <h3>📋 Review Notes:</h3>
                <p>${declineReason}</p>
              </div>
              
              <div class="support-info">
                <h3>📞 Need Assistance?</h3>
                <p>If you believe this is a mistake or need help with your application, please contact our support team:</p>
                <p><strong>Email:</strong> cdrrmo@lipa.gov.ph<br/>
                <strong>Phone:</strong> (043) 756-5555<br/>
                <strong>Office:</strong> CDRRMO - Lipa City Hall</p>
              </div>
              
              <p>We appreciate your patience and understanding as we work to maintain the security of our emergency response system.</p>
              
              <div class="footer">
                <p><strong>LipaAlertHub Team</strong><br/>
                City Disaster Risk Reduction and Management Office<br/>
                Lipa City, Batangas</p>
                <p><em>This is an automated message. Please do not reply to this email.</em></p>
              </div>
            </div>
          </body>
        </html>
      `;
    } else if (after.status === "pending") {
      subject = "⏳ Your LipaAlertHub Account is Under Review";
      html = `
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #f39c12; color: white; padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .header h1 { margin: 0; font-size: 28px; }
              .content { background: white; padding: 30px 20px; border: 1px solid #ddd; border-radius: 0 0 10px 10px; }
              .status-badge { background: #f39c12; color: white; padding: 12px 24px; border-radius: 25px; display: inline-block; margin: 20px 0; font-weight: bold; }
              .timeline { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .footer { color: #666; font-size: 14px; margin-top: 30px; text-align: center; }
              .logo { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="logo">🚨 LipaAlertHub</div>
              <h1>Account Under Review</h1>
            </div>
            <div class="content">
              <p>Dear <strong>${name}</strong>,</p>
              
              <div class="status-badge">⏳ UNDER REVIEW</div>
              
              <p>Thank you for registering with LipaAlertHub! Your account is currently <strong>under review</strong> by our admin team.</p>
              
              <div class="timeline">
                <h3>📅 Review Process:</h3>
                <p>✅ <strong>Application Received</strong> - Your registration was submitted successfully<br/>
                ⏳ <strong>Document Verification</strong> - We're reviewing your submitted information<br/>
                ⌛ <strong>Admin Approval</strong> - Final review by our team<br/>
                📧 <strong>Email Notification</strong> - You'll receive an update once complete</p>
              </div>
              
              <p><strong>Expected Timeline:</strong> Most applications are processed within 1-2 business days.</p>
              
              <p>We appreciate your patience. Our verification process helps maintain the security and reliability of our emergency response system.</p>
              
              <div class="footer">
                <p><strong>LipaAlertHub Team</strong><br/>
                City Disaster Risk Reduction and Management Office<br/>
                Lipa City, Batangas</p>
                <p><em>This is an automated message. Please do not reply to this email.</em></p>
              </div>
            </div>
          </body>
        </html>
      `;
    } else {
      logger.warn(`Unknown status change: ${after.status}`);
      return;
    }

    // Send email notification
    await sendUserStatusEmail(email, subject, html, name, after.status);

    // Create in-app notification
    await createUserStatusNotification(uid, after.status, after.declineReason);

    logger.info(`Status change notification sent to ${email} for status: ${after.status}`);

  } catch (error) {
    logger.error("Error in onUserStatusChange:", error);
  }
});

// Helper function to send status change emails
async function sendUserStatusEmail(email, subject, html, name, status) {
  try {
    // Check if we have Resend configured
    const apiKey = process.env.RESEND_API_KEY;
    
    if (apiKey) {
      const resend = new Resend(apiKey);
      
      await retryOperation(async () => {
        await resend.emails.send({
          from: "LipaAlertHub <noreply@cdrrmo.lipa.gov.ph>", // Update with your verified domain
          to: [email],
          subject: subject,
          html: html,
        });
      });
      
      logger.info(`Status email sent successfully to ${email}`);
    } else {
      // Development mode - log to console
      logger.info("=".repeat(60));
      logger.info("USER STATUS EMAIL - DEVELOPMENT MODE");
      logger.info("=".repeat(60));
      logger.info(`To: ${email}`);
      logger.info(`Subject: ${subject}`);
      logger.info(`Status: ${status}`);
      logger.info(`Name: ${name}`);
      logger.info("=".repeat(60));
      
      // Save to development logs
      await admin.firestore().collection("dev_email_logs").add({
        type: "user_status_change",
        email,
        subject,
        status,
        name,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        environment: "development"
      });
    }
  } catch (error) {
    logger.error("Error sending status change email:", error);
    throw error;
  }
}

// Helper function to create in-app notifications
async function createUserStatusNotification(userId, status, declineReason = null) {
  try {
    const notificationData = {
      userId,
      type: "account_status",
      status: "unread",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      )
    };

    if (status === "active") {
      notificationData.title = "Account Approved! 🎉";
      notificationData.body = "Welcome to LipaAlertHub! Your account has been approved and you can now access all features.";
      notificationData.priority = "high";
    } else if (status === "declined") {
      notificationData.title = "Account Review Required ⏳";
      notificationData.body = "Your account needs additional verification. Please check your email for details.";
      notificationData.priority = "normal";
      notificationData.data = { declineReason };
    } else if (status === "pending") {
      notificationData.title = "Account Under Review 📋";
      notificationData.body = "Your account is being reviewed. You'll be notified once the process is complete.";
      notificationData.priority = "low";
    }

    await admin.firestore().collection("notifications").add(notificationData);
    logger.info(`In-app notification created for user ${userId}, status: ${status}`);

  } catch (error) {
    logger.error("Error creating status change notification:", error);
    throw error;
  }
}

// NEW: Admin callable function to update user status
exports.updateUserAccountStatus = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  // Verify admin authentication
  if (!request.auth) {
    throw new Error("Authentication required");
  }
  
  if (!request.auth.token.admin) {
    throw new Error("Admin privileges required");
  }

  const { uid, status, declineReason } = request.data;
  
  if (!uid || !status) {
    throw new Error("User ID and status are required");
  }

  const validStatuses = ["pending", "active", "declined", "suspended"];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status. Valid options: ${validStatuses.join(", ")}`);
  }

  if (status === "declined" && !declineReason) {
    throw new Error("Decline reason is required when declining an account");
  }

  try {
    // Get user document
    const userRef = admin.firestore().collection("users").doc(uid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      throw new Error("User not found");
    }

    const currentData = userDoc.data();
    const updateData = {
      status: status,
      statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      statusUpdatedBy: request.auth.uid,
      previousStatus: currentData.status
    };

    if (status === "declined" && declineReason) {
      updateData.declineReason = declineReason.trim();
    } else {
      // Remove decline reason if status is not declined
      updateData.declineReason = admin.firestore.FieldValue.delete();
    }

    // Add status history
    const statusHistory = currentData.statusHistory || [];
    statusHistory.push({
      status: status,
      updatedBy: request.auth.uid,
      updatedAt: new Date().toISOString(),
      declineReason: status === "declined" ? declineReason : null,
      previousStatus: currentData.status
    });
    updateData.statusHistory = statusHistory;

    // Update user document (this will trigger the onUserStatusChange function)
    await userRef.update(updateData);

    logger.info(`User ${uid} status updated by admin ${request.auth.uid}: ${currentData.status} -> ${status}`);

    return { 
      success: true, 
      message: `User account status updated to ${status}`,
      userId: uid,
      newStatus: status,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error("Error updating user account status:", error);
    throw new Error(error.message || "Failed to update user account status");
  }
});


async function migrateExistingUsers() {
  try {
    console.log('Starting migration of existing users...');
    
    // Get all users without a status field OR with status "pending" created before approval system
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .get();
    
    const batch = admin.firestore().batch();
    let migratedCount = 0;
    
    // Define cutoff date - when you implemented the approval system
    const approvalSystemDate = new Date('2025-09-27'); // Adjust this date
    
    usersSnapshot.docs.forEach(doc => {
      const userData = doc.data();
      const createdAt = userData.createdAt?.toDate() || new Date(0);
      
      // Check if user needs migration
      const needsMigration = (
        // User has no status field
        !userData.hasOwnProperty('status') ||
        // User has pending status but was created before approval system
        (userData.status === 'pending' && createdAt < approvalSystemDate) ||
        // User has undefined/null status
        userData.status == null
      );
      
      if (needsMigration) {
        console.log(`Migrating user: ${userData.email || userData.name || doc.id}`);
        
        batch.update(doc.ref, {
          status: 'active',
          statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          statusUpdatedBy: 'system_migration',
          migrated: true,
          migratedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        migratedCount++;
      }
    });
    
    if (migratedCount > 0) {
      await batch.commit();
      console.log(`✅ Successfully migrated ${migratedCount} existing users to active status`);
    } else {
      console.log('ℹ️ No users needed migration');
    }
    
    return {
      success: true,
      migratedCount,
      total: usersSnapshot.size
    };
    
  } catch (error) {
    console.error('❌ Error migrating existing users:', error);
    throw error;
  }
}
// NEW: Get user management stats for admin
exports.getUserManagementStats = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  try {
    const usersSnapshot = await admin.firestore().collection("users").get();
    const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const stats = {
      total: users.length,
      byStatus: {
        pending: users.filter(u => u.status === "pending").length,
        active: users.filter(u => u.status === "active").length,
        declined: users.filter(u => u.status === "declined").length,
        suspended: users.filter(u => u.status === "suspended").length,
      },
      byRole: {
        resident: users.filter(u => u.role === "resident" || !u.role).length,
        admin: users.filter(u => u.role === "admin").length,
        monitor: users.filter(u => u.role === "monitor").length,
        rescuer: users.filter(u => u.role === "rescuer").length,
      },
      recentRegistrations: {
        last24Hours: 0,
        lastWeek: 0,
        lastMonth: 0
      }
    };

    // Calculate time-based stats
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    users.forEach(user => {
      const createdAt = user.createdAt?.toDate() || new Date(0);
      if (createdAt > oneDayAgo) stats.recentRegistrations.last24Hours++;
      if (createdAt > oneWeekAgo) stats.recentRegistrations.lastWeek++;
      if (createdAt > oneMonthAgo) stats.recentRegistrations.lastMonth++;
    });

    return {
      success: true,
      stats,
      generatedAt: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error("Error getting user management stats:", error);
    throw new Error("Failed to generate user management statistics");
  }
});

// NEW: Get pending users for admin dashboard
exports.getPendingUsers = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  try {
    const { limit = 50, startAfter } = request.data || {};
    
    let query = admin.firestore()
      .collection("users")
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .limit(limit);
    
    if (startAfter) {
      const startAfterDoc = await admin.firestore().collection("users").doc(startAfter).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }

    const snapshot = await query.get();
    const pendingUsers = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        uid: doc.id,
        name: data.name,
        email: data.email,
        number: data.number,
        barangay: data.barangay,
        createdAt: data.createdAt,
        idFileUrl: data.idFileUrl,
        // Don't return sensitive information
      };
    });

    return {
      success: true,
      users: pendingUsers,
      hasMore: snapshot.docs.length === limit,
      lastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1].id : null
    };
    
  } catch (error) {
    logger.error("Error getting pending users:", error);
    throw new Error("Failed to retrieve pending users");
  }
});

// Verify OTP - Enhanced with better error handling
exports.verifyOtp = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  const { sessionId, code } = request.data;
  
  if (!sessionId || !code) {
    throw new Error("Session ID and verification code are required");
  }
  
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    throw new Error("Invalid verification code format. Code must be 6 digits.");
  }

  try {
    const otpQuery = await admin
      .firestore()
      .collection("otp")
      .where("sessionId", "==", sessionId)
      .limit(1)
      .get();

    if (otpQuery.empty) {
      throw new Error("Invalid or expired session. Please request a new code.");
    }

    const otpDoc = otpQuery.docs[0];
    const otpData = otpDoc.data();

    if (otpData.used) {
      throw new Error("This verification code has already been used.");
    }

    if (otpData.expiresAt.toDate() < new Date()) {
      throw new Error("Verification code has expired. Please request a new one.");
    }

    if (otpData.attempts >= MAX_VERIFY_ATTEMPTS) {
      throw new Error(`Maximum verification attempts exceeded. Please request a new code.`);
    }

    const inputHash = crypto.createHash("sha256").update(code).digest("hex");
    if (inputHash !== otpData.codeHash) {
      const newAttempts = otpData.attempts + 1;
      await otpDoc.ref.update({
        attempts: newAttempts,
        lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAttemptIP: request.rawRequest?.ip || 'unknown'
      });
      
      const remainingAttempts = MAX_VERIFY_ATTEMPTS - newAttempts;
      throw new Error(`Invalid verification code. ${remainingAttempts} attempts remaining.`);
    }

    await otpDoc.ref.update({
      used: true,
      verified: true,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      verifierIP: request.rawRequest?.ip || 'unknown',
    });

    return { 
      success: true, 
      message: "Verification code confirmed successfully.",
      passwordResetWindow: `${PASSWORD_RESET_WINDOW_MINUTES} minutes`
    };
    
  } catch (error) {
    logger.error("Error in verifyOtp:", error);
    throw new Error(error.message || "Failed to verify code. Please try again.");
  }
});

// Set new password - Enhanced with better validation
exports.setNewPassword = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  const { sessionId, newPassword } = request.data;
  
  if (!sessionId || !newPassword) {
    throw new Error("Session ID and new password are required");
  }
  
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }
  
  // Enhanced password validation
  const hasUpperCase = /[A-Z]/.test(newPassword);
  const hasLowerCase = /[a-z]/.test(newPassword);
  const hasNumbers = /\d/.test(newPassword);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);
  
  if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
    throw new Error("Password must contain at least one uppercase letter, one lowercase letter, and one number");
  }

  try {
    const otpQuery = await admin
      .firestore()
      .collection("otp")
      .where("sessionId", "==", sessionId)
      .where("verified", "==", true)
      .where("used", "==", true)
      .limit(1)
      .get();

    if (otpQuery.empty) {
      throw new Error("Invalid session or verification not completed");
    }

    const otpDoc = otpQuery.docs[0];
    const otpData = otpDoc.data();

    const verifiedAt = otpData.verifiedAt?.toDate();
    if (!verifiedAt) {
      throw new Error("Session verification incomplete");
    }

    const windowExpiry = new Date(verifiedAt.getTime() + PASSWORD_RESET_WINDOW_MINUTES * 60000);
    if (new Date() > windowExpiry) {
      throw new Error(`Password reset window expired. Please request a new verification code.`);
    }

    if (otpData.resetCompleted) {
      throw new Error("Password has already been reset using this code");
    }

    let user;
    try {
      user = await admin.auth().getUserByEmail(otpData.email);
    } catch (error) {
      throw new Error("User account not found");
    }

    await retryOperation(async () => {
      await admin.auth().updateUser(user.uid, { password: newPassword });
    });

    await otpDoc.ref.update({
      resetCompleted: true,
      resetCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
      resetIP: request.rawRequest?.ip || 'unknown'
    });

    // Send confirmation email
    if (process.env.NODE_ENV !== "development" || process.env.RESEND_API_KEY) {
      try {
        await retryOperation(async () => {
          const resend = getResendClient();
          await resend.emails.send({
            from: "LipaAlertHub <noreply@yourdomain.com>",
            to: [otpData.email],
            subject: "Password Reset Successful - LipaAlertHub",
            html: `
              <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h1>Password Reset Successful</h1>
                    <p>Your LipaAlertHub account password has been successfully updated.</p>
                    <p>If you did not perform this action, please contact support immediately.</p>
                    <p style="color: #666; font-size: 12px; margin-top: 30px;">
                      This is an automated message. Please do not reply.
                    </p>
                  </div>
                </body>
              </html>
            `,
          });
        });
      } catch (emailError) {
        logger.error("Failed to send confirmation email:", emailError);
        // Don't fail the password reset if email fails
      }
    }

    return { 
      success: true, 
      message: "Password updated successfully. You can now sign in with your new password." 
    };
    
  } catch (error) {
    logger.error("Error in setNewPassword:", error);
    throw new Error(error.message || "Failed to update password. Please try again.");
  }
});

exports.onAlertStatusUpdate = onDocumentUpdated({
  document: "alerts/{alertId}",
  region: "asia-southeast1"
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const alertId = event.params.alertId;

  // Only process if status changed from pending to approved
  if (!before || !after || before.status === after.status) {
    return;
  }

  if (after.status === 'approved' && before.status === 'pending') {
    try {
      logger.info(`Processing approved alert: ${alertId}`);

      // Create corresponding weather_alerts document for mobile app compatibility
      await admin.firestore().collection("weather_alerts").add({
        title: after.title,
        description: after.description,
        severity: after.severity || 'info',
        type: after.type,
        approved: true,
        isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: after.approvedBy || 'system',
        source: after.source,
        alertId: alertId // Reference to original alert
      });

      // Send push notifications to all users
      await sendAlertPushNotifications(after, alertId);

      logger.info(`Alert ${alertId} processed and notifications sent`);

    } catch (error) {
      logger.error(`Error processing alert ${alertId}:`, error);
    }
  }
});

// Automated weather data fetching (scheduled)
exports.fetchWeatherAlerts = onSchedule({
  schedule: "*/15 * * * *", // Every 15 minutes
  timeZone: "Asia/Manila",
  region: "asia-southeast1"
}, async (context) => {
  try {
    logger.info("Starting automated weather data fetch");

    const results = await Promise.allSettled([
      fetchOpenWeatherData(),
      fetchUSGSEarthquakeData()
    ]);

    const successfulFetches = results.filter(r => r.status === 'fulfilled').length;
    const failedFetches = results.filter(r => r.status === 'rejected').length;

    logger.info(`Automated fetch completed: ${successfulFetches} successful, ${failedFetches} failed`);

    // Log results
    await logSystemEvent("automated_weather_fetch", {
      successful: successfulFetches,
      failed: failedFetches,
      timestamp: new Date().toISOString()
    }, failedFetches === 0);

  } catch (error) {
    logger.error("Error in automated weather fetch:", error);
    await logSystemEvent("automated_weather_fetch", { error: error.message }, false);
  }
});

// Enhanced cleanup with better error handling
exports.cleanupExpiredOtps = onSchedule({
  schedule: "0 2 * * *",
  timeZone: "Asia/Manila",
  region: "asia-southeast1"
}, async (context) => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Clean up expired OTPs
    const expiredOtpQuery = await admin
      .firestore()
      .collection("otp")
      .where("createdAt", "<", admin.firestore.Timestamp.fromDate(oneDayAgo))
      .get();

    // Clean up old rate limit records
    const oldRateLimitQuery = await admin
      .firestore()
      .collection("rate_limits")
      .where("timestamp", "<", admin.firestore.Timestamp.fromDate(sevenDaysAgo))
      .get();

    let cleanedOtps = 0;
    let cleanedRateLimits = 0;

    if (!expiredOtpQuery.empty) {
      const batch1 = admin.firestore().batch();
      expiredOtpQuery.docs.forEach((doc) => batch1.delete(doc.ref));
      await batch1.commit();
      cleanedOtps = expiredOtpQuery.size;
    }

    if (!oldRateLimitQuery.empty) {
      const batch2 = admin.firestore().batch();
      oldRateLimitQuery.docs.forEach((doc) => batch2.delete(doc.ref));
      await batch2.commit();
      cleanedRateLimits = oldRateLimitQuery.size;
    }

    logger.info(`Cleanup completed: ${cleanedOtps} expired OTPs, ${cleanedRateLimits} old rate limit records`);
    
  } catch (error) {
    logger.error("Error in cleanup task:", error);
  }
});

/* ===================================================================
   WEATHER & DISASTER ALERTS - Enhanced with Better Error Handling
=================================================================== */
exports.onWeatherAlertCreated = onDocumentCreated({
  document: "weather_alerts/{alertId}",
  region: "asia-southeast1"
}, async (event) => {
  const alertData = event.data.data();
  const alertId = event.params.alertId;

  if (!alertData || !alertData.isActive || !alertData.approved) {
    logger.info("Alert not active/approved — skipping notifications");
    return;
  }

  try {
    logger.info(`Processing weather alert: ${alertId}`);

    const usersSnapshot = await admin.firestore().collection("users")
      .where("expoPushToken", "!=", null)
      .where("notificationsEnabled", "!=", false)
      .get();

    if (usersSnapshot.empty) {
      logger.info("No users with push tokens found");
      return;
    }

    const messages = [];
    const severityEmoji = {
      info: "🔵",
      watch: "🟡", 
      warning: "🟠",
      danger: "🔴",
    }[alertData.severity] || "⚠️";

    usersSnapshot.forEach((doc) => {
      const user = doc.data();
      const token = user.expoPushToken;
      
      if (token && token.trim() && typeof token === 'string') {
        messages.push({
          to: token,
          sound: "default",
          title: `${severityEmoji} ${String(alertData.severity || 'ALERT').toUpperCase()}`,
          body: `${alertData.title || 'Weather Alert'} - ${String(alertData.description || "Check the app for details").substring(0, 120)}${(alertData.description || "").length > 120 ? "..." : ""}`,
          data: {
            type: "weather_alert",
            alertId,
            severity: alertData.severity,
            alertType: alertData.type,
            timestamp: Date.now()
          },
          channelId: "weather_alerts",
          priority: alertData.severity === "danger" ? "high" : "default",
          ttl: 3600, // 1 hour TTL
        });
      }
    });

    logger.info(`Prepared ${messages.length} push messages`);

    // Send in batches with retry logic
    const results = await sendPushNotificationBatches(messages);
    
    // Log results
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    logger.info(`Push notification results: ${successful} successful, ${failed} failed`);
    
    // Update alert document with notification stats
    await admin.firestore().collection("weather_alerts").doc(alertId).update({
      notificationStats: {
        sent: successful,
        failed: failed,
        sentAt: admin.firestore.FieldValue.serverTimestamp()
      }
    });

  } catch (error) {
    logger.error("Error in onWeatherAlertCreated:", error);
  }
});

/* ===================================================================
   ENHANCED PUSH NOTIFICATION SYSTEM
=================================================================== */
async function sendPushNotificationBatches(messages) {
  const results = [];
  
  for (let i = 0; i < messages.length; i += PUSH_NOTIFICATION_BATCH_SIZE) {
    const batch = messages.slice(i, i + PUSH_NOTIFICATION_BATCH_SIZE);
    
    try {
      const batchResult = await retryOperation(async () => {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "Accept-Encoding": "gzip, deflate",
          },
          body: JSON.stringify(batch),
          timeout: 30000, // 30 second timeout
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Expo API error: ${response.status} - ${errorText}`);
        }

        return await response.json();
      });

      // Process individual results
      if (batchResult.data) {
        batchResult.data.forEach((result, index) => {
          results.push({
            success: result.status === 'ok',
            message: batch[index],
            error: result.status !== 'ok' ? result.message : null
          });
        });
      } else {
        // Fallback if no data array
        batch.forEach(() => results.push({ success: true }));
      }
      
      logger.info(`Batch ${Math.floor(i / PUSH_NOTIFICATION_BATCH_SIZE) + 1} sent successfully`);
      
    } catch (error) {
      logger.error(`Error sending batch ${Math.floor(i / PUSH_NOTIFICATION_BATCH_SIZE) + 1}:`, error);
      
      // Mark all messages in this batch as failed
      batch.forEach((message) => {
        results.push({
          success: false,
          message,
          error: error.message
        });
      });
    }
    
    // Add delay between batches to avoid rate limiting
    if (i + PUSH_NOTIFICATION_BATCH_SIZE < messages.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}

/* ===================================================================
   INCIDENT PHOTO PROCESSING - Enhanced with Better Error Handling
=================================================================== */
exports.processIncidentPhoto = onObjectFinalized({
  bucket: "lipaalerthub.firebasestorage.app",
  region: "asia-southeast1",
  cpu: 1,                    // Add this line
  memory: "512MiB",          // Add this line
  timeoutSeconds: 300        // Add this line
}, async (event) => {
  const filePath = event.data.name;
  
  if (!filePath || !filePath.includes("incident_photos/")) {
    logger.info("Not an incident photo — skip:", filePath);
    return;
  }

  const metadata = event.data.metadata || {};
  if (metadata.embedTimestamp !== "true" || metadata.processed === "true") {
    logger.info("No timestamp embedding required or already processed:", filePath);
    return;
  }

  const bucket = admin.storage().bucket();
  const file = bucket.file(filePath);

  try {
    logger.info("Processing incident image:", filePath);
    
    // Check if file exists and is accessible
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error("File no longer exists");
    }

    // Download with retry logic
    const buffer = await retryOperation(async () => {
      const [downloadBuffer] = await file.download();
      return downloadBuffer;
    });

    // Get image metadata
    const imageMetadata = await sharp(buffer).metadata();
    const { width = 800, height = 600, format } = imageMetadata;

    // Validate image
    if (!format || !['jpeg', 'jpg', 'png', 'webp'].includes(format)) {
      throw new Error(`Unsupported image format: ${format}`);
    }

    if (width > 4000 || height > 4000) {
      logger.warn("Large image detected, may require more processing time");
    }

    const timestampText = metadata.timestampText || 
      new Date().toLocaleString("en-US", { 
        timeZone: "Asia/Manila",
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
    const location = metadata.location || "";
    const lines = [timestampText, location].filter(Boolean);

    const fontSize = Math.max(14, Math.floor(Math.min(width, height) * 0.03));
    const padding = Math.floor(fontSize * 1.0);
    const lineHeight = Math.floor(fontSize * 1.3);

    const maxLineLength = Math.max(...lines.map(l => l.length));
    const bgWidth = Math.max(250, Math.floor(maxLineLength * fontSize * 0.6));
    const bgHeight = lines.length * lineHeight + padding * 3;

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="black" flood-opacity="0.8"/>
          </filter>
          <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:rgba(0,0,0,0.85);stop-opacity:1" />
            <stop offset="100%" style="stop-color:rgba(0,0,0,0.75);stop-opacity:1" />
          </linearGradient>
        </defs>

        <rect x="${width - bgWidth - padding * 2}" y="${height - bgHeight - padding * 2}" 
              width="${bgWidth + padding * 2}" height="${bgHeight + padding}" 
              rx="12" fill="url(#bgGradient)" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>

        ${lines.map((line, idx) => {
          const y = height - (lines.length - idx - 1) * lineHeight - padding * 2.5;
          const color = idx === 0 ? "#ffffff" : "#ffd700";
          const fSize = idx === 0 ? fontSize : Math.floor(fontSize * 0.85);
          const weight = idx === 0 ? "bold" : "normal";
          
          return `<text x="${width - bgWidth/2 - padding}" y="${y}" text-anchor="middle" 
                        fill="${color}" font-family="Arial, sans-serif" font-size="${fSize}" 
                        font-weight="${weight}" filter="url(#shadow)">
                    ${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
                  </text>`;
        }).join("")}

        <circle cx="${width - padding * 3 - 15}" cy="${height - bgHeight - padding + 15}" r="12" 
                fill="#27ae60" stroke="white" stroke-width="2" filter="url(#shadow)"/>
        <text x="${width - padding * 3 - 15}" y="${height - bgHeight - padding + 20}" 
              text-anchor="middle" fill="white" font-size="14" font-weight="bold">✓</text>
      </svg>
    `;

    // Process image with enhanced quality settings
    const compositeBuffer = await sharp(buffer)
      .composite([{ input: Buffer.from(svg), gravity: "southeast" }])
      .jpeg({ 
        quality: 92,
        progressive: true,
        mozjpeg: true
      })
      .toBuffer();

    // Save with enhanced metadata
    await retryOperation(async () => {
      await file.save(compositeBuffer, {
        metadata: {
          contentType: "image/jpeg",
          metadata: {
            ...metadata,
            processed: "true",
            processedAt: new Date().toISOString(),
            timestampEmbedded: "true",
            originalFormat: format,
            processedSize: compositeBuffer.length,
            processingVersion: "2.0"
          },
        },
      });
    });

    logger.info(`Incident image processed successfully: ${filePath}, size: ${compositeBuffer.length} bytes`);

  } catch (error) {
    logger.error("Error processing incident photo:", error);
    
    // Set detailed failure metadata
    try {
      await file.setMetadata({
        metadata: {
          ...metadata,
          processed: "failed",
          processedAt: new Date().toISOString(),
          error: String(error.message || error).substring(0, 500),
          errorType: error.name || 'Unknown',
          retryCount: (parseInt(metadata.retryCount) || 0) + 1
        },
      });
    } catch (metaError) {
      logger.error("Failed to set error metadata:", metaError);
    }
  }
});

/* ===================================================================
   INCIDENT REPORT STATUS HANDLING - Enhanced
=================================================================== */
exports.onReportStatusUpdate = onDocumentUpdated({
  document: "incident_reports/{reportId}",
  region: "asia-southeast1"
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const reportId = event.params.reportId;

  if (!before || !after || before.status === after.status) {
    return;
  }

  try {
    logger.info(`Report ${reportId} status changed: ${before.status} -> ${after.status}`);

    const location = after.location?.address || 
                    `${after.location?.latitude || "Unknown"}, ${after.location?.longitude || "location"}`;
    const emergencyType = after.emergencyType || "incident";

    // Create notification with enhanced error handling
    await retryOperation(async () => {
      await createStatusChangeNotification(
        after.reporterId,
        reportId,
        after.status,
        location,
        emergencyType
      );
    });

    // Send push notification with retry
    await retryOperation(async () => {
      await sendReportStatusPushNotification(
        after.reporterId,
        after.status,
        emergencyType,
        reportId,
        location
      );
    });

    // Update report with notification status
    await admin.firestore().collection("incident_reports").doc(reportId).update({
      lastNotificationSent: admin.firestore.FieldValue.serverTimestamp(),
      notificationStatus: "sent"
    });

  } catch (error) {
    logger.error(`Error handling status update for report ${reportId}:`, error);
    
    // Update report with error status
    try {
      await admin.firestore().collection("incident_reports").doc(reportId).update({
        notificationStatus: "failed",
        notificationError: error.message
      });
    } catch (updateError) {
      logger.error("Failed to update notification error status:", updateError);
    }
  }
});

/* ===================================================================
   ENHANCED ADMIN CALLABLES
=================================================================== */
exports.updateReportStatus = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth) {
    throw new Error("Authentication required");
  }
  
  if (!request.auth.token.admin) {
    throw new Error("Admin privileges required");
  }

  const { reportId, newStatus, adminNote, priority } = request.data;
  
  if (!reportId || !newStatus) {
    throw new Error("Report ID and new status are required");
  }

  const validStatuses = ["pending", "accepted", "verified", "approved", "rejected", "failed", "resolved"];
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid status. Valid options: ${validStatuses.join(", ")}`);
  }

  try {
    // Validate report exists
    const reportRef = admin.firestore().collection("incident_reports").doc(reportId);
    const reportDoc = await reportRef.get();
    
    if (!reportDoc.exists) {
      throw new Error("Report not found");
    }

    const currentData = reportDoc.data();
    const updateData = {
      status: newStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
      previousStatus: currentData.status
    };

    if (adminNote && adminNote.trim()) {
      updateData.adminNote = adminNote.trim();
    }
    
    if (priority) {
      updateData.priority = priority;
    }

    // Add status history
    const statusHistory = currentData.statusHistory || [];
    statusHistory.push({
      status: newStatus,
      updatedBy: request.auth.uid,
      updatedAt: new Date().toISOString(),
      adminNote: adminNote || null,
      previousStatus: currentData.status
    });
    updateData.statusHistory = statusHistory;

    await reportRef.update(updateData);

    logger.info(`Report ${reportId} status updated by admin ${request.auth.uid}: ${currentData.status} -> ${newStatus}`);

    return { 
      success: true, 
      message: `Report status updated to ${newStatus}`,
      reportId,
      newStatus,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error("Error updating report status:", error);
    throw new Error(error.message || "Failed to update report status");
  }
});

exports.setAdminClaim = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  const { uid, email } = request.data;
  
  if (!uid) {
    throw new Error("User ID is required");
  }

  try {
    // Check if requester is admin or if this is initial setup
    let isInitialSetup = false;
    
    if (request.auth && request.auth.token.admin !== true) {
      const existingAdmins = await admin.firestore().collection("admin_users").limit(1).get();
      if (!existingAdmins.empty) {
        throw new Error("Only existing administrators can grant admin privileges");
      }
      isInitialSetup = true;
    }

    // Validate target user exists
    let targetUser;
    try {
      targetUser = await admin.auth().getUser(uid);
    } catch (error) {
      throw new Error("Target user not found");
    }

    // Set admin claim
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    
    // Record in admin_users collection
    await admin.firestore().collection("admin_users").doc(uid).set({
      email: targetUser.email,
      displayName: targetUser.displayName || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: request.auth ? request.auth.uid : "system",
      isInitialSetup,
      lastActiveAt: admin.firestore.FieldValue.serverTimestamp()
    });

    logger.info(`Admin claim granted to user ${uid} by ${request.auth?.uid || 'system'}`);

    return { 
      success: true, 
      message: `Admin privileges granted successfully`,
      targetUserId: uid,
      targetUserEmail: targetUser.email
    };
    
  } catch (error) {
    logger.error("Error setting admin claim:", error);
    throw new Error(error.message || "Failed to grant admin privileges");
  }
});

exports.getReportStats = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  try {
    const { startDate, endDate, emergencyType } = request.data || {};
    
    let query = admin.firestore().collection("incident_reports");
    
    // Apply filters if provided
    if (startDate) {
      query = query.where("createdAt", ">=", admin.firestore.Timestamp.fromDate(new Date(startDate)));
    }
    if (endDate) {
      query = query.where("createdAt", "<=", admin.firestore.Timestamp.fromDate(new Date(endDate)));
    }
    if (emergencyType) {
      query = query.where("emergencyType", "==", emergencyType);
    }

    const snapshot = await query.get();
    const reports = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Calculate comprehensive stats
    const stats = {
      total: reports.length,
      byStatus: {
        pending: reports.filter(r => r.status === "pending").length,
        accepted: reports.filter(r => r.status === "accepted").length,
        verified: reports.filter(r => r.status === "verified").length,
        approved: reports.filter(r => r.status === "approved").length,
        rejected: reports.filter(r => r.status === "rejected").length,
        failed: reports.filter(r => r.status === "failed").length,
        resolved: reports.filter(r => r.status === "resolved").length,
      },
      byEmergencyType: {},
      byLocation: {},
      averageProcessingTime: 0,
      recentActivity: {
        last24Hours: 0,
        lastWeek: 0,
        lastMonth: 0
      }
    };

    // Calculate emergency type distribution
    reports.forEach(report => {
      const type = report.emergencyType || 'unknown';
      stats.byEmergencyType[type] = (stats.byEmergencyType[type] || 0) + 1;
    });

    // Calculate location distribution (simplified)
    reports.forEach(report => {
      const location = report.location?.address?.split(',')[0] || 'Unknown';
      stats.byLocation[location] = (stats.byLocation[location] || 0) + 1;
    });

    // Calculate time-based stats
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    reports.forEach(report => {
      const createdAt = report.createdAt?.toDate() || new Date(0);
      if (createdAt > oneDayAgo) stats.recentActivity.last24Hours++;
      if (createdAt > oneWeekAgo) stats.recentActivity.lastWeek++;
      if (createdAt > oneMonthAgo) stats.recentActivity.lastMonth++;
    });

    // Calculate average processing time for resolved reports
    const resolvedReports = reports.filter(r => r.status === 'resolved' && r.createdAt && r.updatedAt);
    if (resolvedReports.length > 0) {
      const totalProcessingTime = resolvedReports.reduce((sum, report) => {
        const created = report.createdAt.toDate();
        const resolved = report.updatedAt.toDate();
        return sum + (resolved.getTime() - created.getTime());
      }, 0);
      stats.averageProcessingTime = Math.round(totalProcessingTime / resolvedReports.length / (1000 * 60 * 60)); // in hours
    }

    return {
      success: true,
      stats,
      generatedAt: new Date().toISOString(),
      filters: { startDate, endDate, emergencyType }
    };
    
  } catch (error) {
    logger.error("Error getting report stats:", error);
    throw new Error("Failed to generate report statistics");
  }
});

/* ===================================================================
   ENHANCED SCHEDULED CLEANUP
=================================================================== */
exports.cleanupOldNotifications = onSchedule({
  schedule: "0 2 * * *",
  timeZone: "Asia/Manila",
  region: "asia-southeast1"
}, async (context) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Clean notifications
    const oldNotifications = await admin.firestore().collection("notifications")
      .where("createdAt", "<", admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .get();

    // Clean old forum interactions
    const oldLikes = await admin.firestore().collection("postLikes")
      .where("createdAt", "<", admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .get();

    let cleanupTasks = [];

    if (!oldNotifications.empty) {
      const notificationBatch = admin.firestore().batch();
      oldNotifications.docs.forEach(doc => notificationBatch.delete(doc.ref));
      cleanupTasks.push(notificationBatch.commit());
    }

    if (!oldLikes.empty) {
      const likesBatch = admin.firestore().batch();
      oldLikes.docs.forEach(doc => likesBatch.delete(doc.ref));
      cleanupTasks.push(likesBatch.commit());
    }

    await Promise.all(cleanupTasks);

    const stats = {
      notifications: oldNotifications.size,
      likes: oldLikes.size,
      total: oldNotifications.size + oldLikes.size
    };

    logger.info(`Cleanup completed: ${stats.total} documents deleted`, stats);

    // Record cleanup stats
    await admin.firestore().collection("system_logs").add({
      type: "cleanup",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      stats,
      success: true
    });

  } catch (error) {
    logger.error("Error in cleanup task:", error);
    
    // Record cleanup failure
    await admin.firestore().collection("system_logs").add({
      type: "cleanup",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      success: false,
      error: error.message
    });
  }
});

/* ===================================================================
   ENHANCED FORUM TRIGGERS
=================================================================== */
exports.onForumReplyCreated = onDocumentCreated({
  document: "forumReplies/{replyId}",
  region: "asia-southeast1"
}, async (event) => {
  const reply = event.data.data();
  const replyId = event.params.replyId;
  
  if (!reply || !reply.postId || !reply.userId) {
    logger.warn("Incomplete reply data received");
    return;
  }

  try {
    const postDoc = await admin.firestore().collection("forumPosts").doc(reply.postId).get();
    
    if (!postDoc.exists) {
      logger.error("Original post not found for reply", reply.postId);
      return;
    }

    const postData = postDoc.data();
    
    // Don't notify if user is replying to their own post
    if (postData.userId === reply.userId) {
      logger.info("User replied to own post — no notification");
      return;
    }

    // Create notification
    await createForumReplyNotification(
      postData.userId,
      reply.postId,
      postData.title,
      reply.userName || "Someone",
      reply.content || ""
    );

    // Send push notification
    await sendForumPushNotification(
      postData.userId,
      "forum_reply",
      `${reply.userName || "Someone"} replied to your post`,
      `"${postData.title}"`,
      {
        forumPostId: reply.postId,
        forumReplyId: replyId,
        type: "forum_reply"
      }
    );

    // Update post reply count
    await admin.firestore().collection("forumPosts").doc(reply.postId).update({
      replyCount: admin.firestore.FieldValue.increment(1),
      lastReplyAt: admin.firestore.FieldValue.serverTimestamp(),
      lastReplyBy: reply.userId
    });

    logger.info(`Forum reply notification processed: ${replyId}`);
    
  } catch (error) {
    logger.error("Error in onForumReplyCreated:", error);
  }
});

exports.onPostLikeCreated = onDocumentCreated({
  document: "postLikes/{likeId}",
  region: "asia-southeast1"
}, async (event) => {
  const like = event.data.data();
  const likeId = event.params.likeId;
  
  if (!like || !like.targetId || !like.userId || !like.type) {
    logger.warn("Incomplete like data received");
    return;
  }

  try {
    if (like.type === "post") {
      await handlePostLike(like, likeId);
    } else if (like.type === "reply") {
      await handleReplyLike(like, likeId);
    }
    
  } catch (error) {
    logger.error("Error in onPostLikeCreated:", error);
  }
});

async function handlePostLike(like, likeId) {
  const postDoc = await admin.firestore().collection("forumPosts").doc(like.targetId).get();
  
  if (!postDoc.exists) {
    logger.error("Post for like not found:", like.targetId);
    return;
  }

  const postData = postDoc.data();
  
  // Don't notify if user liked their own post
  if (postData.userId === like.userId) {
    return;
  }

  const likerDoc = await admin.firestore().collection("users").doc(like.userId).get();
  const likerName = likerDoc.exists ? (likerDoc.data().displayName || "Someone") : "Someone";

  await createForumPostLikeNotification(postData.userId, like.targetId, postData.title, likerName);
  
  await sendForumPushNotification(
    postData.userId,
    "forum_like_post",
    "Your post was liked",
    `${likerName} liked your post "${postData.title}"`,
    {
      forumPostId: like.targetId,
      type: "forum_like_post"
    }
  );

  // Update post like count
  await admin.firestore().collection("forumPosts").doc(like.targetId).update({
    likeCount: admin.firestore.FieldValue.increment(1)
  });
}

async function handleReplyLike(like, likeId) {
  const replyDoc = await admin.firestore().collection("forumReplies").doc(like.targetId).get();
  
  if (!replyDoc.exists) {
    logger.error("Reply for like not found:", like.targetId);
    return;
  }

  const replyData = replyDoc.data();
  
  // Don't notify if user liked their own reply
  if (replyData.userId === like.userId) {
    return;
  }

  const postDoc = await admin.firestore().collection("forumPosts").doc(replyData.postId).get();
  const postTitle = postDoc.exists ? postDoc.data().title : "a post";

  const likerDoc = await admin.firestore().collection("users").doc(like.userId).get();
  const likerName = likerDoc.exists ? (likerDoc.data().displayName || "Someone") : "Someone";

  await createForumReplyLikeNotification(
    replyData.userId,
    replyData.postId,
    like.targetId,
    postTitle,
    likerName
  );

  await sendForumPushNotification(
    replyData.userId,
    "forum_like_reply",
    "Your reply was liked",
    `${likerName} liked your reply on "${postTitle}"`,
    {
      forumPostId: replyData.postId,
      forumReplyId: like.targetId,
      type: "forum_like_reply"
    }
  );

  // Update reply like count
  await admin.firestore().collection("forumReplies").doc(like.targetId).update({
    likeCount: admin.firestore.FieldValue.increment(1)
  });
}

exports.getForumStats = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  try {
    const [posts, replies, likes, users] = await Promise.all([
      admin.firestore().collection("forumPosts").get(),
      admin.firestore().collection("forumReplies").get(),
      admin.firestore().collection("postLikes").get(),
      admin.firestore().collection("users").get()
    ]);

    const postsData = posts.docs.map(doc => doc.data());
    const repliesData = replies.docs.map(doc => doc.data());

    const stats = {
      overview: {
        totalPosts: posts.size,
        totalReplies: replies.size,
        totalLikes: likes.size,
        totalUsers: users.size,
        averageRepliesPerPost: posts.size > 0 ? Math.round((replies.size / posts.size) * 100) / 100 : 0
      },
      engagement: {
        postsWithReplies: postsData.filter(p => (p.replyCount || 0) > 0).length,
        postsWithLikes: postsData.filter(p => (p.likeCount || 0) > 0).length,
        averageLikesPerPost: posts.size > 0 ? Math.round((likes.size / posts.size) * 100) / 100 : 0
      },
      activity: {
        last24Hours: {
          posts: 0,
          replies: 0,
          likes: 0
        },
        lastWeek: {
          posts: 0,
          replies: 0,
          likes: 0
        }
      }
    };

    // Calculate time-based activity
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    postsData.forEach(post => {
      const createdAt = post.createdAt?.toDate() || new Date(0);
      if (createdAt > oneDayAgo) stats.activity.last24Hours.posts++;
      if (createdAt > oneWeekAgo) stats.activity.lastWeek.posts++;
    });

    repliesData.forEach(reply => {
      const createdAt = reply.createdAt?.toDate() || new Date(0);
      if (createdAt > oneDayAgo) stats.activity.last24Hours.replies++;
      if (createdAt > oneWeekAgo) stats.activity.lastWeek.replies++;
    });

    return {
      success: true,
      stats,
      generatedAt: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error("Error getting forum stats:", error);
    throw new Error("Failed to generate forum statistics");
  }
});

/* ===================================================================
   ENHANCED NOTIFICATION CREATION HELPERS
=================================================================== */
async function createStatusChangeNotification(userId, reportId, newStatus, location, emergencyType) {
  const statusMessages = {
    accepted: {
      title: "Report Accepted ✅",
      body: `Your ${emergencyType} report at ${location} has been accepted and assigned to responders.`,
      type: "report_accepted",
      priority: "high"
    },
    verified: {
      title: "Report Verified ✅",
      body: `Your ${emergencyType} report at ${location} has been verified by our team.`,
      type: "report_verified",
      priority: "normal"
    },
    approved: {
      title: "Report Approved 👍",
      body: `Your ${emergencyType} report at ${location} has been approved and is being processed.`,
      type: "report_approved",
      priority: "normal"
    },
    rejected: {
      title: "Report Under Review ⏳",
      body: `Your ${emergencyType} report at ${location} is under additional review.`,
      type: "report_rejected",
      priority: "low"
    },
    failed: {
      title: "Report Needs Attention ⚠️",
      body: `Your ${emergencyType} report at ${location} requires additional information.`,
      type: "report_failed",
      priority: "normal"
    },
    resolved: {
      title: "Report Resolved ✅",
      body: `Your ${emergencyType} report at ${location} has been successfully resolved.`,
      type: "report_resolved",
      priority: "normal"
    },
  };

  const config = statusMessages[newStatus];
  if (!config) {
    logger.warn(`No notification config for status: ${newStatus}`);
    return;
  }

  const notificationData = {
    userId,
    reportId,
    title: config.title,
    body: config.body,
    type: config.type,
    priority: config.priority,
    status: "unread",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    data: {
      reportStatus: newStatus,
      reportLocation: location,
      reportType: emergencyType,
      actionRequired: newStatus === "failed"
    },
    expiresAt: admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    )
  };

  try {
    await admin.firestore().collection("notifications").add(notificationData);
    logger.info(`Status change notification created for user ${userId}, status: ${newStatus}`);
  } catch (error) {
    logger.error("Error creating status change notification:", error);
    throw error;
  }
}

async function createForumReplyNotification(userId, postId, postTitle, replierName, replyContent) {
  const notificationData = {
    userId,
    forumPostId: postId,
    title: "New Reply on Your Post 💬",
    body: `${replierName} replied: "${replyContent.substring(0, 100)}${replyContent.length > 100 ? "..." : ""}"`,
    type: "forum_reply",
    priority: "low",
    status: "unread",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    data: {
      postTitle: postTitle.length > 50 ? postTitle.substring(0, 50) + "..." : postTitle,
      replierName,
      replyPreview: replyContent.substring(0, 200)
    },
    expiresAt: admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    )
  };

  try {
    await admin.firestore().collection("notifications").add(notificationData);
    logger.info("Forum reply notification created");
  } catch (error) {
    logger.error("Error creating forum reply notification:", error);
    throw error;
  }
}

async function createForumPostLikeNotification(userId, postId, postTitle, likerName) {
  const notificationData = {
    userId,
    forumPostId: postId,
    title: "Your Post Was Liked ❤️",
    body: `${likerName} liked your post "${postTitle.length > 50 ? postTitle.substring(0, 50) + "..." : postTitle}"`,
    type: "forum_like_post",
    priority: "low",
    status: "unread",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    data: {
      postTitle,
      likerName
    },
    expiresAt: admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days
    )
  };

  try {
    await admin.firestore().collection("notifications").add(notificationData);
    logger.info("Forum post-like notification created");
  } catch (error) {
    logger.error("Error creating post-like notification:", error);
    throw error;
  }
}

async function createForumReplyLikeNotification(userId, postId, replyId, postTitle, likerName) {
  const notificationData = {
    userId,
    forumPostId: postId,
    forumReplyId: replyId,
    title: "Your Reply Was Liked 👍",
    body: `${likerName} liked your reply on "${postTitle.length > 50 ? postTitle.substring(0, 50) + "..." : postTitle}"`,
    type: "forum_like_reply",
    priority: "low",
    status: "unread",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    data: {
      postTitle,
      likerName
    },
    expiresAt: admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days
    )
  };

  try {
    await admin.firestore().collection("notifications").add(notificationData);
    logger.info("Forum reply-like notification created");
  } catch (error) {
    logger.error("Error creating reply-like notification:", error);
    throw error;
  }
}

/* ===================================================================
   ENHANCED PUSH NOTIFICATION HELPERS
=================================================================== */
async function sendReportStatusPushNotification(userId, status, emergencyType, reportId, location) {
  try {
    const userDoc = await admin.firestore().collection("users").doc(userId).get();
    
    if (!userDoc.exists) {
      logger.info("User document not found for push notification:", userId);
      return;
    }

    const userData = userDoc.data();
    const token = userData.expoPushToken;
    
    if (!token || typeof token !== 'string' || !token.trim()) {
      logger.info("No valid Expo push token for user:", userId);
      return;
    }

    // Check if user has notifications enabled
    if (userData.notificationsEnabled === false) {
      logger.info("Notifications disabled for user:", userId);
      return;
    }

    const statusConfig = {
      accepted: { title: "Report Accepted ✅", priority: "high", sound: "default" },
      verified: { title: "Report Verified ✅", priority: "normal", sound: "default" },
      approved: { title: "Report Approved 👍", priority: "normal", sound: "default" },
      rejected: { title: "Report Under Review ⏳", priority: "low", sound: "default" },
      failed: { title: "Action Required ⚠️", priority: "high", sound: "default" },
      resolved: { title: "Report Resolved ✅", priority: "normal", sound: "default" },
    };

    const config = statusConfig[status] || { title: "Report Update", priority: "normal", sound: "default" };

    const message = {
      to: token,
      sound: config.sound,
      title: config.title,
      body: `Your ${emergencyType} report has been updated. Tap to view details.`,
      data: {
        reportId,
        reportStatus: status,
        emergencyType,
        location,
        type: "report_update",
        timestamp: Date.now()
      },
      priority: config.priority,
      ttl: 86400, // 24 hours
      channelId: "report_updates"
    };

    const result = await retryOperation(async () => {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
        timeout: 15000
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Push notification failed: ${response.status} - ${errorText}`);
      }

      return await response.json();
    });

    logger.info(`Push notification sent successfully for report ${reportId}:`, result);

  } catch (error) {
    logger.error("Error sending report status push notification:", error);
    
    // Record failed push notification
    try {
      await admin.firestore().collection("failed_notifications").add({
        userId,
        type: "report_status_push",
        reportId,
        status,
        error: error.message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        retryCount: 0
      });
    } catch (recordError) {
      logger.error("Failed to record notification failure:", recordError);
    }
  }
}

async function sendForumPushNotification(userId, notificationType, title, body, data = {}) {
  try {
    const userDoc = await admin.firestore().collection("users").doc(userId).get();
    
    if (!userDoc.exists) {
      logger.info("User not found for forum push notification:", userId);
      return;
    }

    const userData = userDoc.data();
    const token = userData.expoPushToken;
    
    if (!token || typeof token !== 'string' || !token.trim()) {
      logger.info("No valid Expo token for forum notification:", userId);
      return;
    }

    // Check forum notification preferences
    if (userData.forumNotificationsEnabled === false) {
      logger.info("Forum notifications disabled for user:", userId);
      return;
    }

    const forumIcons = {
      forum_reply: "💬",
      forum_like_post: "❤️",
      forum_like_reply: "👍",
    };

    const message = {
      to: token,
      sound: "default",
      title: `${forumIcons[notificationType] || "📢"} ${title}`,
      body,
      data: {
        ...data,
        timestamp: Date.now()
      },
      channelId: "forum",
      priority: "low",
      ttl: 604800 // 7 days
    };

    const result = await retryOperation(async () => {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
        timeout: 15000
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Forum push failed: ${response.status} - ${errorText}`);
      }

      return await response.json();
    });

    logger.info(`Forum push notification sent successfully:`, result);

  } catch (error) {
    logger.error("Error sending forum push notification:", error);
  }
}

/* ===================================================================
   SYSTEM HEALTH AND MONITORING
=================================================================== */
exports.getSystemHealth = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get recent system logs
    const recentLogs = await admin.firestore()
      .collection("system_logs")
      .where("timestamp", ">", admin.firestore.Timestamp.fromDate(oneHourAgo))
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();

    // Get failed notifications count
    const failedNotifications = await admin.firestore()
      .collection("failed_notifications")
      .where("timestamp", ">", admin.firestore.Timestamp.fromDate(oneDayAgo))
      .get();

    // Check recent function executions
    const recentActivity = {
      otpRequests: 0,
      photoProcessing: 0,
      pushNotifications: 0,
      errors: 0
    };

    recentLogs.docs.forEach(doc => {
      const data = doc.data();
      if (data.type === "otp_request") recentActivity.otpRequests++;
      if (data.type === "photo_processing") recentActivity.photoProcessing++;
      if (data.type === "push_notification") recentActivity.pushNotifications++;
      if (!data.success) recentActivity.errors++;
    });

    const health = {
      status: "healthy",
      timestamp: now.toISOString(),
      metrics: {
        recentActivity,
        failedNotifications: failedNotifications.size,
        systemErrors: recentActivity.errors,
        uptimeHours: Math.floor((now.getTime() - process.uptime() * 1000) / (1000 * 60 * 60))
      },
      alerts: []
    };

    // Determine overall health status
    if (recentActivity.errors > 10) {
      health.status = "degraded";
      health.alerts.push("High error rate detected");
    }

    if (failedNotifications.size > 50) {
      health.status = "degraded";
      health.alerts.push("Many failed notifications");
    }

    return health;

  } catch (error) {
    logger.error("Error getting system health:", error);
    return {
      status: "error",
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
});

/* ===================================================================
   UTILITY CALLABLES FOR ADMIN MANAGEMENT
=================================================================== */
exports.retryFailedNotifications = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  try {
    const { maxRetries = 3 } = request.data || {};
    
    // Get failed notifications that haven't exceeded retry limit
    const failedNotifications = await admin.firestore()
      .collection("failed_notifications")
      .where("retryCount", "<", maxRetries)
      .limit(100)
      .get();

    if (failedNotifications.empty) {
      return {
        success: true,
        message: "No failed notifications to retry",
        retried: 0
      };
    }

    let retried = 0;
    const batch = admin.firestore().batch();

    for (const doc of failedNotifications.docs) {
      const data = doc.data();
      
      try {
        // Retry the notification based on type
        if (data.type === "report_status_push") {
          await sendReportStatusPushNotification(
            data.userId,
            data.status,
            data.emergencyType || "incident",
            data.reportId,
            data.location || "Unknown location"
          );
          
          // Delete successful retry
          batch.delete(doc.ref);
          retried++;
          
        } else {
          // Update retry count for unsupported types
          batch.update(doc.ref, {
            retryCount: admin.firestore.FieldValue.increment(1),
            lastRetryAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        
      } catch (retryError) {
        // Update retry count and error
        batch.update(doc.ref, {
          retryCount: admin.firestore.FieldValue.increment(1),
          lastRetryAt: admin.firestore.FieldValue.serverTimestamp(),
          lastError: retryError.message
        });
      }
    }

    await batch.commit();

    return {
      success: true,
      message: `Retry operation completed`,
      retried,
      total: failedNotifications.size
    };

  } catch (error) {
    logger.error("Error retrying failed notifications:", error);
    throw new Error("Failed to retry notifications");
  }
});

/* ===================================================================
   PERFORMANCE OPTIMIZATION: BATCH OPERATIONS
=================================================================== */
exports.batchUpdateUserPreferences = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  const { updates } = request.data;
  
  if (!updates || !Array.isArray(updates)) {
    throw new Error("Updates array is required");
  }

  if (updates.length > 500) {
    throw new Error("Cannot update more than 500 users at once");
  }

  try {
    const batch = admin.firestore().batch();
    let processed = 0;

    for (const update of updates) {
      const { userId, preferences } = update;
      
      if (!userId || !preferences) {
        continue;
      }

      const userRef = admin.firestore().collection("users").doc(userId);
      batch.update(userRef, {
        ...preferences,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid
      });
      
      processed++;
    }

    await batch.commit();

    return {
      success: true,
      message: `Updated ${processed} user preferences`,
      processed
    };

  } catch (error) {
    logger.error("Error in batch update:", error);
    throw new Error("Failed to update user preferences");
  }
});

/* ===================================================================
   ERROR HANDLING AND LOGGING IMPROVEMENTS
=================================================================== */
function logSystemEvent(type, data, success = true) {
  admin.firestore().collection("system_logs").add({
    type,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    success,
    data,
    region: "asia-southeast1"
  }).catch(error => {
    logger.error("Failed to log system event:", error);
  });
}

/* ===================================================================
   REGION CONFIGURATION CHECK
=================================================================== */
exports.validateRegionConfiguration = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  try {
    const config = {
      functionRegion: "asia-southeast1",
      storageRegion: process.env.FIREBASE_STORAGE_BUCKET_REGION || "auto-detected",
      firestoreRegion: "auto-detected",
      timestamp: new Date().toISOString()
    };

    // Test storage access
    try {
      const bucket = admin.storage().bucket();
      const [metadata] = await bucket.getMetadata();
      config.storageRegion = metadata.location;
    } catch (error) {
      config.storageError = error.message;
    }

    // Test Firestore access
    try {
      const testDoc = await admin.firestore().collection("_test").limit(1).get();
      config.firestoreStatus = "accessible";
    } catch (error) {
      config.firestoreError = error.message;
    }

    return {
      success: true,
      configuration: config,
      regionMatched: config.functionRegion === config.storageRegion
    };

  } catch (error) {
    logger.error("Error validating region configuration:", error);
    throw new Error("Failed to validate configuration");
  }
});

exports.checkEmailExists = onCall({
  region: "asia-southeast1",
  cors: true,
  enforceAppCheck: false,
  cpu: 0.5,              // Add this line
  memory: "256MiB"     
}, async (request) => {
  const { email } = request.data;
  
  if (!email || typeof email !== "string") {
    throw new Error("Valid email address is required");
  }

  const normalizedEmail = email.trim().toLowerCase();
  
  try {
    validateEmail(normalizedEmail);
    
    logger.info(`Checking email existence for password reset: ${normalizedEmail}`);

    let userExists = false;

    // Method 1: Check Firebase Auth first
    try {
      const userRecord = await admin.auth().getUserByEmail(normalizedEmail);
      if (userRecord) {
        userExists = true;
        logger.info(`Email found in Firebase Auth: ${userRecord.uid}`);
      }
    } catch (authError) {
      logger.info(`Email not found in Firebase Auth: ${authError.code}`);
      
      // Method 2: If not found in Auth, check Firestore as fallback
      try {
        const usersQuery = await admin
          .firestore()
          .collection("users")
          .where("email", "==", normalizedEmail)
          .limit(1)
          .get();
        
        if (!usersQuery.empty) {
          userExists = true;
          logger.info("Email found in Firestore database");
        } else {
          logger.info("Email not found in Firestore");
        }
      } catch (firestoreError) {
        logger.error("Error checking Firestore:", firestoreError);
        // Continue without throwing - we'll return false
      }
    }

    // Add rate limiting for email checking to prevent abuse
    await checkRateLimit(normalizedEmail, 'email_check');

    return { 
      success: true,
      exists: userExists,
      message: userExists 
        ? "Email found in system" 
        : "Email not found in system"
    };
    
  } catch (error) {
    logger.error("Error in checkEmailExists:", error);
    
    // Return user-friendly error messages
    if (error.message.includes("Rate limit")) {
      throw new Error(error.message);
    }
    if (error.message.includes("Invalid email")) {
      throw new Error(error.message);
    }
    
    throw new Error("Unable to verify email. Please check your connection and try again.");
  }
});

// Fetch OpenWeather data
async function fetchOpenWeatherData() {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${LIPA_LAT}&lon=${LIPA_LON}&appid=${OPENWEATHER_API_KEY}&units=metric`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OpenWeather API error: ${response.status}`);
    }

    const data = await response.json();
    const alertData = processOpenWeatherData(data);
    
    if (alertData) {
      await createPendingAlert(alertData);
      logger.info("OpenWeather alert created");
    }
    
    return data;
  } catch (error) {
    logger.error("Error fetching OpenWeather data:", error);
    throw error;
  }
}

// Fetch USGS earthquake data
async function fetchUSGSEarthquakeData() {
  try {
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${LIPA_LAT}&longitude=${LIPA_LON}&maxradiuskm=${USGS_RADIUS}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`USGS API error: ${response.status}`);
    }

    const data = await response.json();
    let alertsCreated = 0;
    
    for (const earthquake of data.features) {
      const alertData = processUSGSEarthquake(earthquake);
      if (alertData) {
        await createPendingAlert(alertData);
        alertsCreated++;
      }
    }

    if (alertsCreated > 0) {
      logger.info(`Created ${alertsCreated} earthquake alerts`);
    }
    
    return data;
  } catch (error) {
    logger.error("Error fetching USGS data:", error);
    throw error;
  }
}

// Process OpenWeather data into alert format
function processOpenWeatherData(data) {
  const weather = data.weather[0];
  const main = data.main;
  const wind = data.wind;
  const rain = data.rain;

  let shouldAlert = false;
  let title = "";
  let description = "";
  let severity = "info";

  // Check for severe weather conditions
  if (weather.id < 300) { // Thunderstorm
    shouldAlert = true;
    title = "Thunderstorm Warning";
    description = `Thunderstorm conditions detected in Lipa area. ${weather.description}. Take appropriate precautions.`;
    severity = "warning";
  } else if (weather.id >= 500 && weather.id < 600 && rain) { // Rain
    if (rain["1h"] > 10 || rain["3h"] > 25) {
      shouldAlert = true;
      title = "Heavy Rain Advisory";
      description = `Heavy rainfall detected: ${rain["1h"] || 0}mm in the last hour. Risk of flooding in low-lying areas.`;
      severity = "warning";
    }
  } else if (wind.speed > 10) { // Strong winds
    shouldAlert = true;
    title = "Strong Wind Advisory";
    description = `Strong winds detected: ${wind.speed} m/s (${Math.round(wind.speed * 3.6)} km/h). Secure loose objects.`;
    severity = "info";
  } else if (main.temp > 35) { // Extreme heat
    shouldAlert = true;
    title = "Heat Advisory";
    description = `High temperature alert: ${Math.round(main.temp)}°C. Stay hydrated and avoid prolonged sun exposure.`;
    severity = "info";
  }

  if (!shouldAlert) {
    return null;
  }

  return {
    type: "weather",
    title,
    description,
    source: "OpenWeather",
    raw: data,
    severity,
    location: { lat: LIPA_LAT, lon: LIPA_LON }
  };
}

// Process USGS earthquake data
function processUSGSEarthquake(earthquake) {
  const props = earthquake.properties;
  const coords = earthquake.geometry.coordinates;
  const magnitude = props.mag;

  // Only create alerts for significant earthquakes
  if (magnitude < 3.0) {
    return null;
  }

  let severity = "info";
  if (magnitude >= 5.0) severity = "warning";
  if (magnitude >= 6.0) severity = "danger";

  return {
    type: "earthquake",
    title: `Magnitude ${magnitude} Earthquake`,
    description: `Earthquake detected: M${magnitude} at ${props.place}. Depth: ${Math.abs(coords[2])}km. Time: ${new Date(props.time).toLocaleString()}.`,
    source: "USGS",
    raw: earthquake,
    severity,
    location: { lat: coords[1], lon: coords[0] },
    magnitude
  };
}

// Create pending alert in Firestore
async function createPendingAlert(alertData) {
  try {
    // Check for recent duplicate alerts
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const duplicateQuery = await admin
      .firestore()
      .collection("alerts")
      .where("source", "==", alertData.source)
      .where("type", "==", alertData.type)
      .where("timestamp", ">", admin.firestore.Timestamp.fromDate(oneDayAgo))
      .limit(1)
      .get();

    if (!duplicateQuery.empty) {
      logger.info(`Duplicate ${alertData.type} alert from ${alertData.source} detected, skipping`);
      return;
    }

    const alertDoc = {
      ...alertData,
      status: "pending",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isActive: true,
      approved: false
    };

    await admin.firestore().collection("alerts").add(alertDoc);
    logger.info(`Created pending ${alertData.type} alert from ${alertData.source}`);

  } catch (error) {
    logger.error("Error creating pending alert:", error);
    throw error;
  }
}

// Send push notifications for alerts
async function sendAlertPushNotifications(alertData, alertId) {
  try {
    const usersSnapshot = await admin.firestore().collection("users")
      .where("expoPushToken", "!=", null)
      .where("notificationsEnabled", "!=", false)
      .get();

    if (usersSnapshot.empty) {
      logger.info("No users with push tokens found");
      return;
    }

    const severityEmoji = {
      info: "🔵",
      watch: "🟡", 
      warning: "🟠",
      danger: "🔴",
    }[alertData.severity] || "⚠️";

    const messages = [];

    usersSnapshot.forEach((doc) => {
      const user = doc.data();
      const token = user.expoPushToken;
      
      if (token && token.trim() && typeof token === 'string') {
        messages.push({
          to: token,
          sound: "default",
          title: `${severityEmoji} ${String(alertData.severity || 'ALERT').toUpperCase()}`,
          body: `${alertData.title || 'Weather Alert'} - ${String(alertData.description || "Check the app for details").substring(0, 120)}${(alertData.description || "").length > 120 ? "..." : ""}`,
          data: {
            type: "weather_alert",
            alertId,
            severity: alertData.severity,
            alertType: alertData.type,
            timestamp: Date.now()
          },
          channelId: "weather_alerts",
          priority: alertData.severity === "danger" ? "high" : "default",
          ttl: 3600,
        });
      }
    });

    logger.info(`Prepared ${messages.length} push messages`);

    const results = await sendPushNotificationBatches(messages);
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    logger.info(`Push notification results: ${successful} successful, ${failed} failed`);
    
    // Update alert document with notification stats
    await admin.firestore().collection("alerts").doc(alertId).update({
      notificationStats: {
        sent: successful,
        failed: failed,
        sentAt: admin.firestore.FieldValue.serverTimestamp()
      }
    });

  } catch (error) {
    logger.error("Error sending alert push notifications:", error);
  }
}
/* ===================================================================
   ENHANCED CLEANUP WITH PERFORMANCE OPTIMIZATION
=================================================================== */
exports.performMaintenanceTasks = onSchedule({
  schedule: "0 3 * * 0", // Weekly on Sunday at 3 AM
  timeZone: "Asia/Manila",
  region: "asia-southeast1"
}, async (context) => {
  try {
    logger.info("Starting weekly maintenance tasks");
    
    const tasks = [
      cleanupExpiredDocuments(),
      optimizeNotificationDelivery(),
      generateUsageStatistics(),
      validateSystemIntegrity()
    ];

    const results = await Promise.allSettled(tasks);
    
    const summary = {
      total: tasks.length,
      successful: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      timestamp: new Date().toISOString()
    };

    logger.info("Weekly maintenance completed:", summary);
    
    await logSystemEvent("weekly_maintenance", summary, summary.failed === 0);

  } catch (error) {
    logger.error("Error in weekly maintenance:", error);
    await logSystemEvent("weekly_maintenance", { error: error.message }, false);
  }
});

async function cleanupExpiredDocuments() {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Cleanup expired notifications
  const expiredNotifications = await admin.firestore()
    .collection("notifications")
    .where("expiresAt", "<", admin.firestore.Timestamp.fromDate(new Date()))
    .get();

  // Cleanup old system logs
  const oldLogs = await admin.firestore()
    .collection("system_logs")
    .where("timestamp", "<", admin.firestore.Timestamp.fromDate(oneMonthAgo))
    .get();

  const batch = admin.firestore().batch();
  let deleteCount = 0;

  expiredNotifications.docs.forEach(doc => {
    batch.delete(doc.ref);
    deleteCount++;
  });

  oldLogs.docs.forEach(doc => {
    batch.delete(doc.ref);
    deleteCount++;
  });

  if (deleteCount > 0) {
    await batch.commit();
  }

  logger.info(`Cleaned up ${deleteCount} expired documents`);
  return deleteCount;
}

async function optimizeNotificationDelivery() {
  // Remove invalid push tokens
  const users = await admin.firestore()
    .collection("users")
    .where("expoPushToken", "!=", null)
    .get();

  const batch = admin.firestore().batch();
  let optimized = 0;

  users.docs.forEach(doc => {
    const data = doc.data();
    const token = data.expoPushToken;
    
    // Remove obviously invalid tokens
    if (typeof token !== 'string' || token.length < 10 || !token.startsWith('ExponentPushToken')) {
      batch.update(doc.ref, {
        expoPushToken: admin.firestore.FieldValue.delete(),
        tokenInvalidatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      optimized++;
    }
  });

  if (optimized > 0) {
    await batch.commit();
  }

  logger.info(`Optimized ${optimized} invalid push tokens`);
  return optimized;
}

async function generateUsageStatistics() {
  const stats = {
    timestamp: new Date().toISOString(),
    collections: {},
    functions: {},
    errors: {}
  };

  // Get document counts for key collections
const collections = ['users', 'incident_reports', 'notifications', 'forumPosts', 'forumReplies', 'alerts', 'weather_alerts'];
  
  for (const collection of collections) {
    try {
      const snapshot = await admin.firestore().collection(collection).count().get();
      stats.collections[collection] = snapshot.data().count;
    } catch (error) {
      stats.errors[collection] = error.message;
    }
  }

  await admin.firestore().collection("usage_statistics").add({
    ...stats,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  logger.info("Generated usage statistics:", stats);
  return stats;
}

async function validateSystemIntegrity() {
  const issues = [];

  // Check for orphaned documents
  try {
    const replies = await admin.firestore().collection("forumReplies").get();
    const postIds = new Set();
    
    for (const reply of replies.docs) {
      const postId = reply.data().postId;
      if (!postIds.has(postId)) {
        const postExists = await admin.firestore().collection("forumPosts").doc(postId).get();
        if (!postExists.exists) {
          issues.push(`Orphaned reply: ${reply.id} references non-existent post: ${postId}`);
        }
      }
    }
  } catch (error) {
    issues.push(`Error checking forum integrity: ${error.message}`);
  }

  if (issues.length > 0) {
    await admin.firestore().collection("system_issues").add({
      issues,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      severity: "medium"
    });
  }

  logger.info(`System integrity check completed. Found ${issues.length} issues.`);
  return issues;
}


// Admin weather alert functions
exports.approveWeatherAlert = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  const { alertId } = request.data;
  
  if (!alertId) {
    throw new Error("Alert ID is required");
  }

  try {
    const alertRef = admin.firestore().collection("alerts").doc(alertId);
    const alertDoc = await alertRef.get();
    
    if (!alertDoc.exists) {
      throw new Error("Alert not found");
    }

    const alertData = alertDoc.data();
    
    if (alertData.status === 'approved') {
      return {
        success: true,
        message: "Alert is already approved"
      };
    }

    // Update alert status
    await alertRef.update({
      status: "approved",
      approved: true,
      isActive: true,
      approvedBy: request.auth.uid,
      approvedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    logger.info(`Weather alert ${alertId} approved by admin ${request.auth.uid}`);

    return {
      success: true,
      message: "Alert approved and activated successfully",
      alertId
    };

  } catch (error) {
    logger.error("Error approving weather alert:", error);
    throw new Error(error.message || "Failed to approve alert");
  }
});

exports.getWeatherAlertStats = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  try {
    const alertsSnapshot = await admin.firestore().collection("alerts").get();
    const alerts = alertsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const stats = {
      total: alerts.length,
      byStatus: {
        pending: alerts.filter(a => a.status === "pending").length,
        approved: alerts.filter(a => a.status === "approved").length,
      },
      byType: {
        weather: alerts.filter(a => a.type === "weather").length,
        earthquake: alerts.filter(a => a.type === "earthquake").length,
        volcano: alerts.filter(a => a.type === "volcano").length,
        flood: alerts.filter(a => a.type === "flood").length,
      },
      bySource: {
        OpenWeather: alerts.filter(a => a.source === "OpenWeather").length,
        USGS: alerts.filter(a => a.source === "USGS").length,
        PAGASA: alerts.filter(a => a.source === "PAGASA").length,
        PHIVOLCS: alerts.filter(a => a.source === "PHIVOLCS").length,
        Manual: alerts.filter(a => a.source === "Manual").length,
      }
    };

    return {
      success: true,
      stats,
      generatedAt: new Date().toISOString()
    };

  } catch (error) {
    logger.error("Error getting weather alert stats:", error);
    throw new Error("Failed to generate weather alert statistics");
  }
});

/* ===================================================================
   END OF ENHANCED FIREBASE FUNCTIONS
=================================================================== */