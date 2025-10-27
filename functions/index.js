const { setGlobalOptions } = require("firebase-functions/v2/options");
const { onCall, onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const functions = require('firebase-functions');
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { Resend } = require("resend");
const crypto = require("crypto");
const sharp = require("sharp");
const fetch = require("node-fetch");
const cheerio = require("cheerio"); 
const cors = require('cors')({ origin: true });

// Initialize Firebase Admin
admin.initializeApp();

// Set global options for cost control and region
setGlobalOptions({ 
  maxInstances: 1,
  region: "asia-southeast1",
  cpu: 0.25,
  memory: "256MiB"
});
// Initialize Resend client with error handling
// Initialize Resend client with environment variables only
const getResendClient = () => {
  // Direct API key - remove all environment/config complexity
  const apiKey = "re_iFcSfxFN_ffPoFTdCpEzWADUL8Mc3HYRr";
  
  if (!apiKey) {
    throw new Error("RESEND_API_KEY not configured");
  }
  
  logger.info("✅ Resend client initialized with direct API key");
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
const ALERT_EXPIRATION_HOURS_APPROVED = 24; // 24 hours for approved alerts
const ALERT_EXPIRATION_DAYS_PENDING = 7;    // 7 days for pending alerts


// Weather & Disaster Alert Constants
const OPENWEATHER_API_KEY = "0baa706a6ca53436f3aa0b5bd9f0d25b";
const LIPA_LAT = 13.9411;
const LIPA_LON = 121.1631;
const LIPA_RADIUS_KM = 50; // Reduced from 200km to focus on Lipa area
const LIPA_BOUNDING_BOX = {
  north: 14.1000,
  south: 13.8000, 
  east: 121.3000,
  west: 121.0000
};
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


// =================== CREATE STAFF ACCOUNT (WITH CORS & CORRECT REGION) ===================
// =================== CREATE STAFF ACCOUNT (WITH CORS & CORRECT REGION) ===================
exports.createStaffAccount = onCall({
  region: "asia-southeast1",
  cors: true,
  timeoutSeconds: 60,
  memory: "512MiB",
  cpu: 1
}, async (request) => {
  try {
    logger.info('=== CREATE STAFF ACCOUNT STARTED ===', {
      timestamp: new Date().toISOString(),
      caller: request.auth ? request.auth.uid : 'no-auth'
    });

    // ✅ VERIFY AUTHENTICATION
    if (!request.auth) {
      logger.error('❌ No authentication token provided');
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const callerUid = request.auth.uid;
    
    // ✅ CHECK ADMIN PERMISSIONS (Custom Claims + Firestore)
    const [callerDoc, callerAuth] = await Promise.all([
      admin.firestore().collection('users').doc(callerUid).get(),
      admin.auth().getUser(callerUid)
    ]);
    
    if (!callerDoc.exists) {
      throw new functions.https.HttpsError('permission-denied', 'User profile not found');
    }
    
    const callerData = callerDoc.data();
    const hasAdminClaim = callerAuth.customClaims?.admin === true;
    
    logger.info('📋 Caller verification:', { 
      uid: callerUid, 
      role: callerData.role,
      hasAdminClaim: hasAdminClaim
    });
    
    // Must have BOTH admin role AND custom claim
    if (callerData.role !== 'admin' || !hasAdminClaim) {
      logger.error('❌ Permission denied: Not an admin');
      throw new functions.https.HttpsError('permission-denied', 'Only admins can create accounts');
    }

    // ✅ VALIDATE INPUT
    const { email, password, name, phoneNumber, barangay, role, agencyName } = request.data;
    
    if (!email || !password || !name || !phoneNumber || !barangay || !role) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    const validRoles = ['rescuer', 'monitor', 'agency', 'admin'];
    if (!validRoles.includes(role)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid role');
    }

    if (role === 'agency' && !agencyName) {
      throw new functions.https.HttpsError('invalid-argument', 'Agency name required for agency role');
    }

    if (password.length < 6) {
      throw new functions.https.HttpsError('invalid-argument', 'Password must be at least 6 characters');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid email format');
    }

    logger.info('✅ Input validation passed');

    // =================== 🆕 STEP 4.2: DUPLICATE WARNING SYSTEM ===================
    logger.info('🔍 [DUPLICATE WARNING] Starting pre-creation duplicate check');

    let duplicateFound = false;
    let duplicateDetails = [];
    let suspendedUsersFound = false;

    // 1. CHECK FIREBASE AUTH FOR EXISTING EMAIL
    try {
      const existingAuthUser = await admin.auth().getUserByEmail(email);
      logger.warn('⚠️ [DUPLICATE WARNING] User already exists in Firebase Auth:', {
        uid: existingAuthUser.uid,
        email: existingAuthUser.email
      });
      
      duplicateFound = true;
      duplicateDetails.push({
        matchType: 'firebase_auth_email',
        existingUser: {
          id: existingAuthUser.uid,
          name: existingAuthUser.displayName || 'Unknown',
          email: existingAuthUser.email,
          barangay: 'Unknown',
          status: 'active',
          role: 'unknown'
        },
        isSuspended: false
      });
      
    } catch (authError) {
      // If error is "user not found", that's GOOD - continue
      if (authError.code !== 'auth/user-not-found') {
        // Re-throw if it's a different error
        throw authError;
      }
      logger.info('✅ [DUPLICATE WARNING] No duplicate in Firebase Auth');
    }

    // 2. CHECK FIRESTORE FOR DUPLICATES
    const duplicateChecks = [];
    
    // Check by email (case-insensitive)
    duplicateChecks.push(
      admin.firestore()
        .collection("users")
        .where("email", ">=", email.toLowerCase())
        .where("email", "<=", email.toLowerCase() + '\uf8ff')
        .limit(3)
        .get()
    );

    // Check by phone (normalized)
    if (phoneNumber) {
      const normalizedPhone = phoneNumber.replace(/\s/g, '');
      duplicateChecks.push(
        admin.firestore()
          .collection("users")
          .where("number", "==", normalizedPhone)
          .limit(3)
          .get()
      );
    }

    // Check by name + barangay
    if (name && barangay) {
      duplicateChecks.push(
        admin.firestore()
          .collection("users")
          .where("name", "==", name)
          .where("barangay", "==", barangay)
          .limit(3)
          .get()
      );
    }

    const results = await Promise.all(duplicateChecks);
    
    // Process email duplicates
    if (!results[0].empty) {
      duplicateFound = true;
      results[0].docs.forEach(doc => {
        const userData = doc.data();
        const isSuspended = ['suspended', 'suspended_3d', 'suspended_2w', 'banned'].includes(userData.status);
        
        duplicateDetails.push({
          matchType: 'email',
          existingUser: {
            id: doc.id,
            name: userData.name,
            email: userData.email,
            phone: userData.phone || userData.number,
            barangay: userData.barangay,
            status: userData.status || 'unknown',
            role: userData.role
          },
          isSuspended: isSuspended
        });
        
        if (isSuspended) {
          suspendedUsersFound = true;
        }
      });
    }

    // Process phone duplicates
    if (phoneNumber && !results[1].empty) {
      duplicateFound = true;
      results[1].docs.forEach(doc => {
        const userData = doc.data();
        const isSuspended = ['suspended', 'suspended_3d', 'suspended_2w', 'banned'].includes(userData.status);
        
        // Check if user already in duplicates
        const existingIndex = duplicateDetails.findIndex(d => d.existingUser.id === doc.id);
        if (existingIndex === -1) {
          duplicateDetails.push({
            matchType: 'phone',
            existingUser: {
              id: doc.id,
              name: userData.name,
              email: userData.email,
              phone: userData.phone || userData.number,
              barangay: userData.barangay,
              status: userData.status || 'unknown',
              role: userData.role
            },
            isSuspended: isSuspended
          });
        } else {
          duplicateDetails[existingIndex].matchType += '+phone';
        }
        
        if (isSuspended) {
          suspendedUsersFound = true;
        }
      });
    }

    // Process name + barangay duplicates
    if (name && barangay && !results[2].empty) {
      duplicateFound = true;
      results[2].docs.forEach(doc => {
        const userData = doc.data();
        const isSuspended = ['suspended', 'suspended_3d', 'suspended_2w', 'banned'].includes(userData.status);
        
        // Check if user already in duplicates
        const existingIndex = duplicateDetails.findIndex(d => d.existingUser.id === doc.id);
        if (existingIndex === -1) {
          duplicateDetails.push({
            matchType: 'name+barangay',
            existingUser: {
              id: doc.id,
              name: userData.name,
              email: userData.email,
              phone: userData.phone || userData.number,
              barangay: userData.barangay,
              status: userData.status || 'unknown',
              role: userData.role
            },
            isSuspended: isSuspended
          });
        } else {
          duplicateDetails[existingIndex].matchType += '+name_location';
        }
        
        if (isSuspended) {
          suspendedUsersFound = true;
        }
      });
    }

    // ⚠️ LOG WARNING BUT CONTINUE WITH ACCOUNT CREATION
    if (duplicateFound) {
      logger.warn('⚠️ [DUPLICATE WARNING] Potential duplicates found - proceeding with creation:', {
        totalDuplicates: duplicateDetails.length,
        suspendedUsers: suspendedUsersFound,
        details: duplicateDetails
      });
    } else {
      logger.info('✅ [DUPLICATE WARNING] No duplicates found - clean account creation');
    }
    // =================== END OF DUPLICATE WARNING SYSTEM ===================

    try {
      // ✅ STEP 1: CREATE FIREBASE AUTH ACCOUNT
      logger.info('👤 Creating Firebase Auth account...');
      const userRecord = await admin.auth().createUser({
        email: email,
        password: password,
        displayName: name,
        emailVerified: false
      });

      logger.info('✅ Firebase Auth account created:', userRecord.uid);

      // ✅ STEP 2: SET CUSTOM CLAIMS BASED ON ROLE
      const customClaims = {};
      
      if (role === 'admin') {
        customClaims.admin = true;
        logger.info('🔑 Setting ADMIN custom claim');
      } else if (role === 'monitor') {
        customClaims.monitor = true;
        logger.info('🔑 Setting MONITOR custom claim');
      } else if (role === 'rescuer') {
        customClaims.rescuer = true;
        logger.info('🔑 Setting RESCUER custom claim');
      } else if (role === 'agency') {
        customClaims.agency = true;
        logger.info('🔑 Setting AGENCY custom claim');
      }

      // ⭐ THIS IS THE KEY FIX - SET CUSTOM CLAIMS IMMEDIATELY
      await admin.auth().setCustomUserClaims(userRecord.uid, customClaims);
      logger.info('✅ Custom claims set successfully');

      // ✅ STEP 3: CREATE FIRESTORE DOCUMENT
      logger.info('📄 Creating Firestore document...');
      
      const userData = {
        // Identity
        uid: userRecord.uid,
        firebaseUID: userRecord.uid,
        email: email,
        name: name,
        
        // Phone
        phoneNumber: phoneNumber,
        number: phoneNumber,
        phone: phoneNumber,
        
        // Location
        barangay: barangay,
        
        // Role & Status
        role: role,
        status: 'active', // ⭐ CHANGED: Auto-approve admin/staff accounts
        
        // Custom Claims (for reference)
        customClaims: customClaims,
        
        // Admin tracking
        adminCreated: true,
        createdBy: callerUid,
        
        // Violation tracking
        warnings: 0,
        strikes: 0,
        lastViolationReason: null,
        lastViolationDate: null,
        suspensionUntil: null,
        
        // Timestamps
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        
        // Device
        deviceType: 'web'
      };

      // Add agencyName if role is agency
      if (role === 'agency' && agencyName) {
        userData.agencyName = agencyName;
        userData.agency = agencyName; // For compatibility
        logger.info('🏢 Added agency name:', agencyName);
      }

      await admin.firestore().collection('users').doc(userRecord.uid).set(userData);
      logger.info('✅ Firestore document created');

      // =================== 🆕 PART 1: ENHANCED WELCOME NOTIFICATION WITH DEFAULT PASSWORD SYSTEM ===================
      logger.info('🔔 Creating enhanced welcome notification...');
      
      let notificationBody = '';
      let notificationTitle = '';

      if (role === 'agency') {
        notificationTitle = '🎉 Welcome to LipaAlertHub!';
        notificationBody = `Welcome! Your ${customClaims.agencyName || 'agency'} account is now active.\n\n` +
                         `✅ You can now login and access all emergency coordination features.\n\n` +
                         `🔐 Security Tip:\n` +
                         `Your account was created with a default password. ` +
                         `You may change it anytime in Profile Settings → Change Password for better security.\n\n` +
                         `Note: Changing your password is optional but recommended.`;
      } else {
        notificationTitle = '🎉 Welcome to LipaAlertHub';
        notificationBody = `Your ${role} account has been created successfully. You can now login and access the system.`;
      }

      // Create the enhanced notification (one-time only)
      await admin.firestore().collection('notifications').add({
        userId: userRecord.uid,
        title: notificationTitle,
        body: notificationBody,
        type: 'account_created',
        status: 'unread',
        priority: 'normal',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        data: {
          role: role,
          customClaims: customClaims,
          createdBy: callerUid,
          defaultPasswordUsed: role === 'agency' ? true : false
        }
      });

      logger.info(`Welcome notification created for user ${userRecord.uid} (${role})`);

      // ✅ STEP 5: LOG ADMIN ACTION
      await admin.firestore().collection('admin_actions').add({
        action: 'create_staff_account',
        performedBy: callerUid,
        performedByName: callerData.name,
        targetUserId: userRecord.uid,
        targetUserEmail: email,
        targetUserRole: role,
        customClaimsSet: customClaims,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: {
          name: name,
          barangay: barangay,
          agencyName: agencyName || null,
          defaultPasswordUsed: role === 'agency' ? true : false
        }
      });

      logger.info('🎉 Account creation completed successfully');
      
      // 🆕 ENHANCED: RETURN WARNING INFORMATION IF DUPLICATES FOUND
      if (duplicateFound) {
        let successMessage = `Admin account created successfully for ${name}.`;
        
        return { 
          success: true, 
          uid: userRecord.uid,
          message: successMessage,
          role: role,
          customClaims: customClaims,
          status: 'active',
          // 🆕 NEW: Include warning information
          warnings: {
            hasDuplicates: true,
            hasSuspendedUsers: suspendedUsersFound,
            duplicateDetails: duplicateDetails,
            warningMessage: suspendedUsersFound ? 
              "⚠️ WARNING: Created account matches suspended/banned users. Please review." :
              "ℹ️ NOTE: Created account matches existing users. Please review."
          }
        };
      } else {
        let successMessage = '';
        if (role === 'admin') {
          successMessage = `Admin account created successfully for ${name}. Full system access granted.`;
        } else if (role === 'agency') {
          successMessage = `${agencyName} agency account created successfully with default password system.`;
        } else {
          successMessage = `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully for ${name}.`;
        }
        
        return { 
          success: true, 
          uid: userRecord.uid,
          message: successMessage,
          role: role,
          customClaims: customClaims,
          status: 'active'
        };
      }

    } catch (error) {
      logger.error('❌ Error in account creation:', error);
      
      // Handle specific Firebase Auth errors
      if (error.code === 'auth/email-already-exists') {
        throw new functions.https.HttpsError('already-exists', 'This email is already in use');
      } else if (error.code === 'auth/invalid-email') {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid email format');
      } else if (error.code === 'auth/invalid-password') {
        throw new functions.https.HttpsError('invalid-argument', 'Password is too weak');
      }
      
      throw new functions.https.HttpsError('internal', `Failed to create account: ${error.message}`);
    }

  } catch (error) {
    logger.error('💥 FATAL ERROR in createStaffAccount:', error);
    
    if (error.code && error.message) {
      throw error;
    } else {
      throw new functions.https.HttpsError('internal', `Unexpected error: ${error.message}`);
    }
  }
});

// =================== PASSWORD CHANGE TRACKING (Optional) ===================
exports.updateUserPassword = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  try {
    // Verify authentication
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { userId, newPassword } = request.data;
    
    if (!userId || !newPassword) {
      throw new functions.https.HttpsError('invalid-argument', 'User ID and new password are required');
    }

    // Check if user is updating their own password or has admin privileges
    const isOwnAccount = request.auth.uid === userId;
    const hasAdminPrivileges = request.auth.token.admin === true || request.auth.token.monitor === true;

    if (!isOwnAccount && !hasAdminPrivileges) {
      throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions to update password');
    }

    if (newPassword.length < 6) {
      throw new functions.https.HttpsError('invalid-argument', 'Password must be at least 6 characters long');
    }

    // Update password in Firebase Auth
    await admin.auth().updateUser(userId, {
      password: newPassword
    });

    logger.info(`✅ Password updated for user ${userId}`);

    // =================== PART 2: PASSWORD CHANGE TRACKING (Optional) ===================
    try {
      // Mark password as changed (for analytics/tracking only)
      await admin.firestore().collection("users").doc(userId).update({
        passwordChangedAt: admin.firestore.FieldValue.serverTimestamp(),
        passwordChangedBy: userId,
        lastPasswordUpdate: admin.firestore.FieldValue.serverTimestamp(),
        defaultPasswordChanged: true // Mark that default password has been changed
      });

      logger.info(`User ${userId} changed their password`);

      // Optional: Create a success notification
      await admin.firestore().collection('notifications').add({
        userId: userId,
        title: '✅ Password Changed Successfully',
        body: 'Your password has been updated successfully.',
        type: 'security_update',
        status: 'unread',
        priority: 'normal',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

    } catch (error) {
      logger.error(`Error updating password tracking for user ${userId}:`, error);
      // Don't throw - password was already changed successfully
    }

    return { 
      success: true, 
      message: "Password updated successfully",
      userId: userId,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error('❌ Error in updateUserPassword:', error);
    
    if (error.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError('not-found', 'User not found');
    } else if (error.code === 'auth/invalid-password') {
      throw new functions.https.HttpsError('invalid-argument', 'Password is too weak');
    }
    
    throw new functions.https.HttpsError('internal', `Failed to update password: ${error.message}`);
  }
});


// =================== PASSWORD CHANGE TRACKING (Optional) ===================
exports.updateUserPassword = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  try {
    // Verify authentication
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { userId, newPassword } = request.data;
    
    if (!userId || !newPassword) {
      throw new functions.https.HttpsError('invalid-argument', 'User ID and new password are required');
    }

    // Check if user is updating their own password or has admin privileges
    const isOwnAccount = request.auth.uid === userId;
    const hasAdminPrivileges = request.auth.token.admin === true || request.auth.token.monitor === true;

    if (!isOwnAccount && !hasAdminPrivileges) {
      throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions to update password');
    }

    if (newPassword.length < 6) {
      throw new functions.https.HttpsError('invalid-argument', 'Password must be at least 6 characters long');
    }

    // Update password in Firebase Auth
    await admin.auth().updateUser(userId, {
      password: newPassword
    });

    logger.info(`✅ Password updated for user ${userId}`);

    // =================== PART 2: PASSWORD CHANGE TRACKING (Optional) ===================
    try {
      // Mark password as changed (for analytics/tracking only)
      await admin.firestore().collection("users").doc(userId).update({
        passwordChangedAt: admin.firestore.FieldValue.serverTimestamp(),
        passwordChangedBy: userId,
        lastPasswordUpdate: admin.firestore.FieldValue.serverTimestamp(),
        defaultPasswordChanged: true // Mark that default password has been changed
      });

      logger.info(`User ${userId} changed their password`);

      // Optional: Create a success notification
      await admin.firestore().collection('notifications').add({
        userId: userId,
        title: '✅ Password Changed Successfully',
        body: 'Your password has been updated successfully.',
        type: 'security_update',
        status: 'unread',
        priority: 'normal',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

    } catch (error) {
      logger.error(`Error updating password tracking for user ${userId}:`, error);
      // Don't throw - password was already changed successfully
    }

    return { 
      success: true, 
      message: "Password updated successfully",
      userId: userId,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error('❌ Error in updateUserPassword:', error);
    
    if (error.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError('not-found', 'User not found');
    } else if (error.code === 'auth/invalid-password') {
      throw new functions.https.HttpsError('invalid-argument', 'Password is too weak');
    }
    
    throw new functions.https.HttpsError('internal', `Failed to update password: ${error.message}`);
  }
});

exports.submitIncidentReport = onDocumentCreated({
  document: 'incident_reports/{reportId}',
  region: "asia-southeast1"
}, async (event) => {
  try {
    const reportData = event.data.data();
    const { reportId } = event.params;

    console.log(`🔄 [CLOUD FUNCTION] Processing new report: ${reportId}`);
    console.log('📋 [CLOUD FUNCTION] Report data:', {
      userId: reportData.userId,
      emergencyType: reportData.emergencyType,
      subCategory: reportData.subCategory,
      barangay: reportData.barangay,
      establishment: reportData.establishment || 'none',
      imagesCount: reportData.images ? reportData.images.length : 0
    });

    // ✅ REMOVED: Server-side duplicate check and deletion logic
    // ✅ ALL REPORTS ARE NOW ACCEPTED REGARDLESS OF POTENTIAL DUPLICATES

    console.log(`✅ [CLOUD FUNCTION] Accepting report ${reportId} - No server-side duplicate checks`);

    // ✅ 1. INCREMENT USER'S REPORT COUNT (ALWAYS DO THIS)
    try {
      const userRef = admin.firestore().collection('users').doc(reportData.userId);
      await userRef.update({
        reportsCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('✅ [CLOUD FUNCTION] User report count incremented');
    } catch (userError) {
      console.error('❌ [CLOUD FUNCTION] Error updating user count:', userError);
      // Don't throw error - continue processing
    }

    // ✅ 2. SEND NOTIFICATIONS TO ADMINS/MONITORS
    try {
      const adminsSnapshot = await admin.firestore()
        .collection('users')
        .where('role', 'in', ['admin', 'monitor', 'moderator'])
        .where('status', '==', 'active')
        .get();

      const notificationPromises = [];
      
      adminsSnapshot.forEach((adminDoc) => {
        const adminData = adminDoc.data();
        
        // Only send to admins who have notifications enabled
        if (adminData.notificationsEnabled !== false) {
          const notificationData = {
            userId: adminDoc.id,
            reportId: reportId,
            title: '🆕 New Incident Report',
            body: `New ${reportData.emergencyType} - ${reportData.subCategory} in ${reportData.barangay}`,
            type: 'new_report',
            emergencyType: reportData.emergencyType,
            priority: 'high',
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            data: {
              reportId: reportId,
              emergencyType: reportData.emergencyType,
              subCategory: reportData.subCategory,
              barangay: reportData.barangay,
              establishment: reportData.establishment,
              timestamp: new Date().toISOString()
            }
          };
          
          notificationPromises.push(
            admin.firestore().collection('notifications').add(notificationData)
          );
        }
      });

      await Promise.all(notificationPromises);
      console.log(`✅ [CLOUD FUNCTION] Notifications sent to ${notificationPromises.length} admins/monitors`);
    } catch (notificationError) {
      console.error('❌ [CLOUD FUNCTION] Error sending admin notifications:', notificationError);
      // Don't throw error - continue processing
    }

    // ✅ 3. SEND SUCCESS NOTIFICATION TO USER
    try {
      await admin.firestore().collection('notifications').add({
        userId: reportData.userId,
        reportId: reportId,
        title: '✅ Report Submitted Successfully',
        body: `Your ${reportData.emergencyType} report in ${reportData.barangay} has been received and is under review.`,
        type: 'report_submitted',
        priority: 'normal',
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        data: {
          reportId: reportId,
          emergencyType: reportData.emergencyType,
          subCategory: reportData.subCategory,
          barangay: reportData.barangay,
          establishment: reportData.establishment,
          actionUrl: `/report/status?reportId=${reportId}`,
          timestamp: new Date().toISOString()
        }
      });
      console.log('✅ [CLOUD FUNCTION] Success notification sent to user');
    } catch (userNotificationError) {
      console.error('❌ [CLOUD FUNCTION] Error sending user notification:', userNotificationError);
      // Don't throw error - continue processing
    }

    // ✅ 4. UPDATE REPORT WITH PROCESSING TIMESTAMP
    try {
      await admin.firestore()
        .collection('incident_reports')
        .doc(reportId)
        .update({
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          cloudFunctionProcessed: true,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
      console.log('✅ [CLOUD FUNCTION] Report marked as processed');
    } catch (updateError) {
      console.error('❌ [CLOUD FUNCTION] Error updating report timestamp:', updateError);
    }

    console.log(`🎉 [CLOUD FUNCTION] Report ${reportId} processed successfully - NO DELETION`);

    return {
      success: true,
      message: 'Report processed successfully',
      reportId: reportId
    };

  } catch (error) {
    console.error('❌ [CLOUD FUNCTION] Error in submitIncidentReport:', error);
    
    // ✅ MARK REPORT AS FAILED PROCESSING (BUT DON'T DELETE)
    try {
      await admin.firestore()
        .collection('incident_reports')
        .doc(reportId)
        .update({
          processingError: error.message,
          cloudFunctionProcessed: false,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (updateError) {
      console.error('❌ [CLOUD FUNCTION] Error updating failed status:', updateError);
    }
    
    throw error;
  }
});

// ✅ OPTIONAL: Additional function for status updates
exports.onReportStatusUpdate = onDocumentCreated({
  document: 'incident_reports/{reportId}',
  region: "asia-southeast1"
}, async (event) => {
  // This function can be used for additional processing if needed
  // But the main submitIncidentReport function above is the critical one
  
  const reportData = event.data.data();
  const { reportId } = event.params;
  
  console.log(`📝 [CLOUD FUNCTION] Additional processing for report: ${reportId}`);
  
  return { success: true };
});

// ✅ HELPER FUNCTIONS (KEPT FOR REFERENCE BUT NOT USED FOR DELETION)

/**
 * ✅ KEPT FOR REFERENCE: Server-side duplicate check
 * BUT NO LONGER USED TO DELETE REPORTS
 */
async function checkForDuplicateReportServerSide(
  userId, 
  emergencyType, 
  subCategory, 
  location, 
  barangay, 
  establishment
) {
  // This function is kept for reference but no longer blocks submissions
  console.log(`🔍 [CLOUD FUNCTION] Info: Duplicate check available but not blocking`);
  
  return {
    isDuplicate: false,
    message: 'Duplicate checks are informational only - no blocking'
  };
}

/**
 * ✅ KEPT FOR REFERENCE: Send duplicate notification
 * BUT NO LONGER USED SINCE WE DON'T DELETE
 */
async function sendDuplicateNotification(
  userId, 
  duplicateReport, 
  emergencyType, 
  subCategory, 
  barangay, 
  timeSinceReport
) {
  // This function is kept for reference but no longer used
  console.log(`📱 [CLOUD FUNCTION] Info: Duplicate notification available but not used`);
}

// ✅ CLIENT-SIDE CALLABLE FUNCTION FOR DUPLICATE CHECK
exports.checkDuplicateReport = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  try {
    // Verify authentication
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { 
      emergencyType, 
      subCategory, 
      location, 
      barangay, 
      establishment 
    } = request.data;

    // Validate required fields
    if (!emergencyType || !subCategory || !location || !barangay) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    console.log('🔍 [CLIENT DUPLICATE CHECK] Starting check for user:', request.auth.uid);

    const duplicateCheck = await checkForDuplicateReportServerSide(
      request.auth.uid,
      emergencyType,
      subCategory,
      location,
      barangay,
      establishment
    );

    return {
      success: true,
      isDuplicate: duplicateCheck.isDuplicate,
      duplicateReportId: duplicateCheck.duplicateReportId,
      timeSinceReport: duplicateCheck.timeSinceReport,
      message: duplicateCheck.message
    };

  } catch (error) {
    console.error('❌ [CLIENT DUPLICATE CHECK] Error:', error);
    
    if (error.code === 'unauthenticated' || error.code === 'invalid-argument') {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 'Failed to check for duplicates');
  }
});
// =================== HELPER: VERIFY CUSTOM CLAIMS ===================
exports.verifyUserClaims = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  try {
    const userAuth = await admin.auth().getUser(request.auth.uid);
    const userDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
    
    const userData = userDoc.exists ? userDoc.data() : null;
    
    return {
      success: true,
      uid: request.auth.uid,
      email: userAuth.email,
      customClaims: userAuth.customClaims || {},
      firestoreRole: userData?.role || null,
      firestoreStatus: userData?.status || null,
      hasAdminClaim: userAuth.customClaims?.admin === true,
      hasMonitorClaim: userAuth.customClaims?.monitor === true,
      hasRescuerClaim: userAuth.customClaims?.rescuer === true,
      hasAgencyClaim: userAuth.customClaims?.agency === true
    };
    
  } catch (error) {
    logger.error('Error verifying claims:', error);
    throw new functions.https.HttpsError('internal', 'Failed to verify user claims');
  }
});

// =================== HELPER: REFRESH USER TOKEN (FOR CLAIMS) ===================
// ⚠️ IMPORTANT: Tell users to call this after account creation
exports.refreshUserToken = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  try {
    const userAuth = await admin.auth().getUser(request.auth.uid);
    
    logger.info('🔄 Token refresh requested:', {
      uid: request.auth.uid,
      customClaims: userAuth.customClaims
    });
    
    return {
      success: true,
      message: 'Please sign out and sign in again to refresh your permissions',
      customClaims: userAuth.customClaims || {},
      requiresReauth: true
    };
    
  } catch (error) {
    logger.error('Error refreshing token:', error);
    throw new functions.https.HttpsError('internal', 'Failed to refresh token');
  }
});
/* ===================================================================
   PASSWORD RESET OTP SYSTEM - Enhanced with Better Rate Limiting
=================================================================== */

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




exports.requestOtp = onCall({
  region: "asia-southeast1",
  cors: true,
  enforceAppCheck: false
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
      logger.info(`✅ User found: ${normalizedEmail}`);
    } catch (error) {
      logger.info(`Password reset requested for non-existent email: ${normalizedEmail}`);
    }

    // Always create OTP document for security (timing attack prevention)
    await admin.firestore().collection("otp").add(otpDoc);
    logger.info(`✅ OTP document created for: ${normalizedEmail}`);

    if (userExists) {
      try {
        // ✅ USE THE SIMPLIFIED getResendClient FUNCTION
        const resend = getResendClient();
        
        // PRODUCTION MODE - ACTUAL EMAIL SENDING
        logger.info("=".repeat(60));
        logger.info("PASSWORD RESET OTP - PRODUCTION MODE");
        logger.info("=".repeat(60));
        logger.info(`Sending email to: ${normalizedEmail}`);
        logger.info(`OTP Code: ${otp}`);
        logger.info(`Expires in: ${OTP_EXPIRY_MINUTES} minutes`);
        logger.info("=".repeat(60));

        const emailHtml = `
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { 
                  font-family: 'Arial', sans-serif; 
                  line-height: 1.6; 
                  color: #333; 
                  margin: 0; 
                  padding: 0; 
                  background-color: #f4f4f4;
                }
                .container { 
                  max-width: 600px; 
                  margin: 0 auto; 
                  padding: 20px; 
                  background: white;
                  border-radius: 10px;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .header { 
                  background: #d73527; 
                  color: white; 
                  padding: 30px 20px; 
                  text-align: center; 
                  border-radius: 10px 10px 0 0; 
                  margin: -20px -20px 20px -20px;
                }
                .header h1 { 
                  margin: 0; 
                  font-size: 28px; 
                }
                .otp-code { 
                  font-size: 42px; 
                  font-weight: bold; 
                  color: #d73527; 
                  text-align: center; 
                  padding: 25px; 
                  background: #f8f9fa; 
                  border-radius: 10px; 
                  margin: 25px 0; 
                  border: 2px dashed #d73527;
                  letter-spacing: 5px;
                }
                .warning { 
                  background: #fff3cd; 
                  border: 1px solid #ffeaa7; 
                  color: #856404; 
                  padding: 15px; 
                  border-radius: 8px; 
                  margin: 20px 0; 
                  font-size: 14px; 
                }
                .footer { 
                  margin-top: 30px; 
                  font-size: 12px; 
                  color: #666; 
                  text-align: center;
                  border-top: 1px solid #eee;
                  padding-top: 20px;
                }
                .logo { 
                  font-size: 24px; 
                  font-weight: bold; 
                  margin-bottom: 10px; 
                }
                .info-box {
                  background: #e3f2fd;
                  border-left: 4px solid #2196f3;
                  padding: 15px;
                  margin: 20px 0;
                  border-radius: 0 8px 8px 0;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <div class="logo">🚨 LipaAlertHub</div>
                  <h1>Password Reset Request</h1>
                </div>
                
                <p>Dear User,</p>
                
                <p>You have requested a password reset for your LipaAlertHub account associated with <strong>${normalizedEmail}</strong>.</p>
                
                <div class="otp-code">${otp}</div>
                
                <div class="info-box">
                  <p><strong>⏰ This code will expire in ${OTP_EXPIRY_MINUTES} minutes</strong></p>
                </div>
                
                <div class="warning">
                  <strong>🔒 Security Notice:</strong><br/>
                  • Do not share this code with anyone<br/>
                  • LipaAlertHub will never ask for your password<br/>
                  • If you didn't request this reset, please ignore this email<br/>
                  • Ensure your account security by using a strong password
                </div>
                
                <p>Enter this verification code in the app to reset your password.</p>
                
                <div class="footer">
                  <p><strong>LipaAlertHub Team</strong><br/>
                  City Disaster Risk Reduction and Management Office<br/>
                  Lipa City, Batangas, Philippines</p>
                  <p>📞 Emergency: (043) 756-5555 | 📧 Email: cdrrmo@lipa.gov.ph</p>
                  <p><em>This is an automated message. Please do not reply to this email.</em></p>
                </div>
              </div>
            </body>
          </html>
        `;
        
        const emailResult = await resend.emails.send({
          from: "LipaAlertHub <noreply@admin-lipaalerthub.com>", 
          to: [normalizedEmail],
          subject: "🔐 Password Reset Code - LipaAlertHub",
          html: emailHtml,
        });
        
        logger.info("✅ Email sent successfully via Resend:", {
          emailId: emailResult?.id,
          to: normalizedEmail,
          timestamp: new Date().toISOString()
        });
        
        // Log successful email sending
        await admin.firestore().collection("email_logs").add({
          type: "password_reset_otp",
          to: normalizedEmail,
          otp: otp,
          sessionId: sessionId,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          success: true,
          resendResponse: emailResult
        });
        
      } catch (emailError) {
        logger.error("❌ Email integration error:", emailError);
        
        // Log email failure
        await admin.firestore().collection("email_logs").add({
          type: "password_reset_otp",
          to: normalizedEmail,
          otp: otp,
          sessionId: sessionId,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          success: false,
          error: emailError.message
        });
        
        // Don't fail the entire request if email fails
        // Log OTP for manual recovery
        logger.info(`🔑 OTP for manual recovery: ${otp} for ${normalizedEmail}`);
      }
    } else {
      logger.info(`ℹ️ User not found, OTP not sent: ${normalizedEmail}`);
    }
    
    return { 
      success: true, 
      sessionId, 
      message: "If an account with this email exists, a password reset code has been sent.",
      expiresIn: `${OTP_EXPIRY_MINUTES} minutes`
    };
    
  } catch (error) {
    logger.error("❌ Error in requestOtp:", error);
    
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

// =================== SUSPEND USER WITH EMAIL NOTIFICATION ===================
exports.suspendUserWithEmail = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  const { userId, reason, durationDays, strikeType, isPermanentBan = false } = request.data;
  
  if (!userId || !reason) {
    throw new Error("User ID and reason are required");
  }

  try {
    const userRef = admin.firestore().collection("users").doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      throw new Error("User not found");
    }

    const userData = userDoc.data();
    const userEmail = userData.email;
    const userName = userData.name || "User";

    let updateData = {
      status: isPermanentBan ? "banned" : "suspended",
      suspensionReason: reason,
      suspendedBy: request.auth.uid,
      suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
      previousStatus: userData.status,
      lastViolationReason: reason,
      lastViolationDate: admin.firestore.FieldValue.serverTimestamp()
    };

    // Calculate suspension end date if not permanent ban
    if (!isPermanentBan && durationDays) {
      const suspensionUntil = new Date();
      suspensionUntil.setDate(suspensionUntil.getDate() + durationDays);
      updateData.suspensionUntil = admin.firestore.Timestamp.fromDate(suspensionUntil);
    }

    // Handle strikes and warnings
    if (strikeType === 'warning') {
      updateData.warnings = (userData.warnings || 0) + 1;
    } else if (strikeType === 'strike') {
      updateData.strikes = (userData.strikes || 0) + 1;
    }

    await userRef.update(updateData);

    // ✅ SEND EMAIL NOTIFICATION TO USER
    await sendSuspensionEmail(
      userEmail,
      userName,
      isPermanentBan ? 'ban' : 'suspension',
      reason,
      durationDays,
      strikeType,
      userData.warnings || 0,
      userData.strikes || 0
    );

    // Create in-app notification
    await admin.firestore().collection("notifications").add({
      userId: userId,
      title: isPermanentBan ? "🚫 Account Permanently Banned" : 
             strikeType === 'strike' ? "⚠️ Account Strike Issued" : "🚫 Account Suspended",
      body: `Reason: ${reason}. ${durationDays ? `Suspension ends: ${new Date(Date.now() + (durationDays * 24 * 60 * 60 * 1000)).toLocaleDateString()}` : ''}`,
      type: "account_moderation",
      priority: "high",
      status: "unread",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      data: {
        moderationType: isPermanentBan ? 'ban' : (strikeType || 'suspension'),
        reason: reason,
        durationDays: durationDays,
        actionBy: request.auth.uid
      }
    });

    logger.info(`User ${userId} ${isPermanentBan ? 'banned' : 'suspended'} by admin ${request.auth.uid}`);

    return {
      success: true,
      message: `User ${strikeType ? strikeType + ' issued and ' : ''}${isPermanentBan ? 'banned' : 'suspended'} successfully. Email sent to user.`,
      suspensionEnd: !isPermanentBan && durationDays ? new Date(Date.now() + (durationDays * 24 * 60 * 60 * 1000)).toISOString() : null
    };

  } catch (error) {
    logger.error("Error suspending user:", error);
    throw new Error(error.message || "Failed to suspend user");
  }
});

// =================== SEND SUSPENSION/BAN EMAILS ===================
async function sendSuspensionEmail(email, userName, actionType, reason, durationDays, strikeType, currentWarnings, currentStrikes) {
  try {
    const resend = getResendClient();
    
    logger.info(`📧 Attempting to send ${actionType} email to: ${email}`, {
      userName: userName,
      actionType: actionType,
      reason: reason,
      durationDays: durationDays,
      strikeType: strikeType,
      currentWarnings: currentWarnings,
      currentStrikes: currentStrikes
    });

    let subject, html;

    if (actionType === 'ban') {
      subject = "🚫 Account Permanently Banned - LipaAlertHub";
      html = `
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #dc3545; color: white; padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: white; padding: 30px 20px; border: 1px solid #ddd; border-radius: 0 0 10px 10px; }
              .reason-box { background: #f8f9fa; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; }
              .stats { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 8px; margin: 20px 0; }
              .footer { color: #666; font-size: 14px; margin-top: 30px; text-align: center; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Account Permanently Banned</h1>
            </div>
            <div class="content">
              <p>Dear <strong>${userName}</strong>,</p>
              
              <p>Your LipaAlertHub account has been <strong>permanently banned</strong> due to repeated violations of our terms of service.</p>
              
              <div class="reason-box">
                <h3>📋 Reason for Ban:</h3>
                <p>${reason}</p>
              </div>
              
              <div class="stats">
                <h3>📊 Account Status:</h3>
                <p><strong>Final Warnings:</strong> ${currentWarnings}</p>
                <p><strong>Final Strikes:</strong> ${currentStrikes}</p>
                <p><strong>Status:</strong> PERMANENTLY BANNED</p>
              </div>
              
              <p>This decision is final and your account will not be reinstated.</p>
              
              <p>You will no longer be able to access any LipaAlertHub services.</p>
              
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
    } else if (actionType === 'suspension') {
      subject = "🚫 Account Suspension Notice - LipaAlertHub";
      html = `
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #e74c3c; color: white; padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: white; padding: 30px 20px; border: 1px solid #ddd; border-radius: 0 0 10px 10px; }
              .reason-box { background: #f8f9fa; border-left: 4px solid #e74c3c; padding: 15px; margin: 20px 0; }
              .stats { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0; }
              .time-box { background: #e3f2fd; border: 1px solid #2196f3; padding: 15px; border-radius: 8px; margin: 20px 0; }
              .footer { color: #666; font-size: 14px; margin-top: 30px; text-align: center; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Account Suspension Notice</h1>
            </div>
            <div class="content">
              <p>Dear <strong>${userName}</strong>,</p>
              
              <p>Your LipaAlertHub account has been temporarily suspended due to a violation of our terms of service.</p>
              
              <div class="reason-box">
                <h3>📋 Reason for Suspension:</h3>
                <p>${reason}</p>
              </div>
              
              <div class="time-box">
                <h3>⏰ Suspension Duration:</h3>
                <p><strong>Duration:</strong> ${durationDays} days</p>
                <p><strong>Suspension End Date:</strong> ${new Date(Date.now() + (durationDays * 24 * 60 * 60 * 1000)).toLocaleDateString()}</p>
              </div>
              
              <div class="stats">
                <h3>📊 Account Status:</h3>
                <p><strong>Current Warnings:</strong> ${currentWarnings}</p>
                <p><strong>Current Strikes:</strong> ${currentStrikes}</p>
                ${strikeType ? `<p><strong>Action Taken:</strong> ${strikeType.toUpperCase()} issued</p>` : ''}
              </div>
              
              <p>During this suspension period, you will not be able to access your account features.</p>
              
              <p>If you believe this is a mistake or would like to appeal this decision, please contact our support team.</p>
              
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
      logger.warn(`Unknown action type: ${actionType}`);
      return;
    }

    // Send email with retry logic
    const emailResult = await retryOperation(async () => {
      return await resend.emails.send({
        from: "LipaAlertHub <noreply@admin-lipaalerthub.com>",
        to: [email],
        subject: subject,
        html: html,
      });
    });

    logger.info(`✅ ${actionType} email sent successfully to ${email}`, {
      emailId: emailResult?.id,
      actionType: actionType
    });

    // Log successful email
    await admin.firestore().collection("email_logs").add({
      type: "suspension_ban_notification",
      to: email,
      subject: subject,
      actionType: actionType,
      userName: userName,
      reason: reason,
      durationDays: durationDays,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      success: true,
      environment: "production"
    });

  } catch (error) {
    logger.error("❌ Error sending suspension/ban email:", {
      email: email,
      actionType: actionType,
      error: error.message,
      stack: error.stack
    });
    
    // Log email failure but don't throw (non-critical)
    await admin.firestore().collection("email_logs").add({
      type: "suspension_ban_notification",
      to: email,
      subject: subject || "Suspension/Ban Notification",
      actionType: actionType,
      userName: userName,
      reason: reason,
      durationDays: durationDays,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      success: false,
      error: error.message,
      environment: "production"
    });
    
    // ✅ Don't throw error - email failure shouldn't break the suspension process
  }
}

// Helper function to send status change emails
async function sendUserStatusEmail(email, subject, html, name, status) {
  try {
    const resend = getResendClient();
    
    // ✅ REMOVED: The apiKey check - getResendClient() already handles this
    // ✅ REMOVED: Development mode logging - always try to send real emails
    
    logger.info(`📧 Attempting to send status email to: ${email}`, {
      subject: subject,
      status: status,
      name: name
    });

    await retryOperation(async () => {
      const emailResult = await resend.emails.send({
        from: "LipaAlertHub <noreply@admin-lipaalerthub.com>",
        to: [email],
        subject: subject,
        html: html,
      });
      
      logger.info(`✅ Status email sent successfully to ${email}`, {
        emailId: emailResult?.id,
        status: status
      });
      
      return emailResult;
    });
    
    // Log successful email
    await admin.firestore().collection("email_logs").add({
      type: "user_status_change",
      to: email,
      subject: subject,
      status: status,
      name: name,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      success: true,
      environment: "production"
    });

  } catch (error) {
    logger.error("❌ Error sending status change email:", {
      email: email,
      error: error.message,
      stack: error.stack
    });
    
    // Log email failure but don't throw (non-critical)
    await admin.firestore().collection("email_logs").add({
      type: "user_status_change",
      to: email,
      subject: subject,
      status: status,
      name: name,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      success: false,
      error: error.message,
      environment: "production"
    });
    
    // ✅ CHANGED: Don't throw error - email failure shouldn't break the main function
    // Just log and continue
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

exports.verifyOtp = onCall({
  region: "asia-southeast1",
  cors: true,
  enforceAppCheck: false,
  memory: "256MiB",
  timeoutSeconds: 60
}, async (request) => {
  const { sessionId, code } = request.data;
  
  if (!sessionId || !code) {
    throw new functions.https.HttpsError('invalid-argument', "Session ID and verification code are required");
  }
  
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    throw new functions.https.HttpsError('invalid-argument', "Invalid verification code format. Code must be 6 digits.");
  }

  try {
    logger.info(`🔍 Verifying OTP for session: ${sessionId.substring(0, 10)}...`);

    // ✅ FIX 1: Query with proper error handling
    const otpQuery = await admin
      .firestore()
      .collection("otp")
      .where("sessionId", "==", sessionId)
      .limit(1)
      .get();

    if (otpQuery.empty) {
      logger.warn(`❌ No OTP found for session: ${sessionId}`);
      throw new functions.https.HttpsError('not-found', "Invalid or expired session. Please request a new code.");
    }

    const otpDoc = otpQuery.docs[0];
    const otpData = otpDoc.data();

    logger.info(`📋 OTP Data:`, {
      used: otpData.used,
      verified: otpData.verified,
      attempts: otpData.attempts,
      expiresAt: otpData.expiresAt?.toDate?.()?.toISOString()
    });

    // ✅ FIX 2: Check if already used
    if (otpData.used === true) {
      throw new functions.https.HttpsError('failed-precondition', "This verification code has already been used.");
    }

    // ✅ FIX 3: Check expiration with proper timestamp handling
    const expiresAt = otpData.expiresAt?.toDate ? otpData.expiresAt.toDate() : new Date(otpData.expiresAt);
    const now = new Date();
    
    if (expiresAt < now) {
      logger.warn(`❌ OTP expired: ${expiresAt.toISOString()} < ${now.toISOString()}`);
      throw new functions.https.HttpsError('deadline-exceeded', "Verification code has expired. Please request a new one.");
    }

    // ✅ FIX 4: Check max attempts
    if (otpData.attempts >= MAX_VERIFY_ATTEMPTS) {
      throw new functions.https.HttpsError('resource-exhausted', `Maximum verification attempts exceeded. Please request a new code.`);
    }

    // ✅ FIX 5: Verify the code hash
    const inputHash = crypto.createHash("sha256").update(code).digest("hex");
    
    if (inputHash !== otpData.codeHash) {
      const newAttempts = otpData.attempts + 1;
      
      // Update attempts count
      await otpDoc.ref.update({
        attempts: newAttempts,
        lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAttemptIP: request.rawRequest?.ip || 'unknown'
      });
      
      const remainingAttempts = MAX_VERIFY_ATTEMPTS - newAttempts;
      logger.warn(`❌ Invalid OTP code. Remaining attempts: ${remainingAttempts}`);
      throw new functions.https.HttpsError('invalid-argument', `Invalid verification code. ${remainingAttempts} attempts remaining.`);
    }

    // ✅ FIX 6: Update OTP as verified and used
    await otpDoc.ref.update({
      used: true,
      verified: true,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      verifierIP: request.rawRequest?.ip || 'unknown',
    });

    logger.info(`✅ OTP verified successfully for session: ${sessionId}`);

    return { 
      success: true, 
      message: "Verification code confirmed successfully.",
      sessionId: sessionId,  // ✅ Return sessionId for next step
      passwordResetWindow: `${PASSWORD_RESET_WINDOW_MINUTES} minutes`
    };
    
  } catch (error) {
    logger.error("❌ Error in verifyOtp:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    
    // ✅ FIX 7: Proper error handling
    if (error.code && error.code.startsWith('functions/')) {
      throw error; // Re-throw Firebase errors as-is
    }
    
    throw new functions.https.HttpsError('internal', error.message || "Failed to verify code. Please try again.");
  }
});

// Set new password - Enhanced with better validation
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

    // ✅ FIXED: Send confirmation email using the working Resend client
    try {
      const resend = getResendClient();
      
      const emailHtml = `
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { 
                font-family: 'Arial', sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0; 
                padding: 0; 
                background-color: #f4f4f4;
              }
              .container { 
                max-width: 600px; 
                margin: 0 auto; 
                padding: 20px; 
                background: white;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              .header { 
                background: #27ae60; 
                color: white; 
                padding: 30px 20px; 
                text-align: center; 
                border-radius: 10px 10px 0 0; 
                margin: -20px -20px 20px -20px;
              }
              .header h1 { 
                margin: 0; 
                font-size: 28px; 
              }
              .success-icon { 
                font-size: 48px; 
                text-align: center; 
                margin: 20px 0; 
              }
              .info-box {
                background: #e3f2fd;
                border-left: 4px solid #2196f3;
                padding: 15px;
                margin: 20px 0;
                border-radius: 0 8px 8px 0;
              }
              .security-notice { 
                background: #fff3cd; 
                border: 1px solid #ffeaa7; 
                color: #856404; 
                padding: 15px; 
                border-radius: 8px; 
                margin: 20px 0; 
                font-size: 14px; 
              }
              .footer { 
                margin-top: 30px; 
                font-size: 12px; 
                color: #666; 
                text-align: center;
                border-top: 1px solid #eee;
                padding-top: 20px;
              }
              .logo { 
                font-size: 24px; 
                font-weight: bold; 
                margin-bottom: 10px; 
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="logo">🚨 LipaAlertHub</div>
                <h1>Password Reset Successful</h1>
              </div>
              
              <div class="success-icon">✅</div>
              
              <p>Dear User,</p>
              
              <p>Your LipaAlertHub account password has been <strong>successfully updated</strong>.</p>
              
              <div class="info-box">
                <p><strong>Account:</strong> ${otpData.email}</p>
                <p><strong>Reset Completed:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })}</p>
              </div>
              
              <div class="security-notice">
                <strong>🔒 Security Notice:</strong><br/>
                • If you did not perform this password reset, please contact support immediately<br/>
                • Use a strong, unique password for your account<br/>
                • Never share your password with anyone<br/>
                • LipaAlertHub will never ask for your password
              </div>
              
              <p>You can now sign in to your account using your new password.</p>
              
              <div class="footer">
                <p><strong>LipaAlertHub Team</strong><br/>
                City Disaster Risk Reduction and Management Office<br/>
                Lipa City, Batangas, Philippines</p>
                <p>📞 Emergency: (043) 756-5555 | 📧 Email: cdrrmo@lipa.gov.ph</p>
                <p><em>This is an automated message. Please do not reply to this email.</em></p>
              </div>
            </div>
          </body>
        </html>
      `;
      
      await resend.emails.send({
        from: "LipaAlertHub <noreply@admin-lipaalerthub.com>", 
        to: [otpData.email],
        subject: "✅ Password Reset Successful - LipaAlertHub",
        html: emailHtml,
      });
      
      logger.info(`✅ Password reset confirmation email sent to: ${otpData.email}`);
      
      // Log successful email sending
      await admin.firestore().collection("email_logs").add({
        type: "password_reset_confirmation",
        to: otpData.email,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        success: true,
        resetCompleted: true
      });
      
    } catch (emailError) {
      logger.error("❌ Failed to send password reset confirmation email:", emailError);
      
      // Log email failure but don't fail the password reset
      await admin.firestore().collection("email_logs").add({
        type: "password_reset_confirmation",
        to: otpData.email,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        success: false,
        error: emailError.message
      });
    }

    return { 
      success: true, 
      message: "Password updated successfully. You can now sign in with your new password." 
    };
    
  } catch (error) {
    logger.error("❌ Error in setNewPassword:", error);
    
    // Return user-friendly error messages
    if (error.message.includes("Invalid session")) {
      throw new Error("Invalid or expired session. Please request a new password reset.");
    }
    if (error.message.includes("Password reset window expired")) {
      throw new Error("Password reset window has expired. Please request a new verification code.");
    }
    if (error.message.includes("User account not found")) {
      throw new Error("User account not found. Please contact support.");
    }
    
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
  schedule: "*/30 * * * *",
  timeZone: "Asia/Manila",
  region: "asia-southeast1",
  memory: "256MiB"
}, async (context) => {
  try {
    logger.info("Starting automated weather fetch for Lipa City");

    const results = await Promise.allSettled([
      fetchOpenWeatherData(),
      fetchUSGSEarthquakeData()
    ]);

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info(`Fetch completed: ${successful} successful, ${failed} failed`);

    await admin.firestore().collection("system_logs").add({
      type: "automated_weather_fetch",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      success: failed === 0,
      successful,
      failed
    });

  } catch (error) {
    logger.error("Error in scheduled fetch:", error);
  }
});

exports.scheduledWeatherFetch = onSchedule({
  schedule: "*/45 * * * *",
  timeZone: "Asia/Manila",
  region: "asia-southeast1",
  memory: "512MiB"
}, async (context) => {
  try {
    logger.info("=== SCHEDULED WEATHER FETCH START ===");

    const results = await Promise.allSettled([
      fetchOpenWeatherScheduled(),
      fetchUSGSScheduled()
    ]);

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info(`Scheduled fetch: ${successful} successful, ${failed} failed`);

  } catch (error) {
    logger.error("Scheduled fetch error:", error);
  }
});

async function fetchOpenWeatherScheduled() {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${LIPA_LAT}&lon=${LIPA_LON}&appid=${OPENWEATHER_API_KEY}&units=metric`;
  const response = await fetch(url, { timeout: 10000 });
  const data = await response.json();
  const alertData = processOpenWeatherData(data);
  if (alertData) await createPendingAlert(alertData);
}

async function fetchUSGSScheduled() {
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${LIPA_LAT}&longitude=${LIPA_LON}&maxradiuskm=${USGS_RADIUS}&minmagnitude=3.0&orderby=time&limit=5`;
  const response = await fetch(url, { timeout: 15000 });
  const data = await response.json();
  
  for (const eq of data.features) {
    const alertData = processUSGSEarthquake(eq);
    if (alertData) {
      alertData.eventId = eq.id;
      await createPendingAlert(alertData);
    }
  }
}

exports.manualFetchOpenWeather = onCall({
  region: "asia-southeast1",
  cors: true,
  memory: "512MiB",
  timeoutSeconds: 60
}, async (request) => {
  // CRITICAL: Wrap everything in try-catch
  try {
    // Verify admin access
    if (!request.auth) {
      logger.error("No authentication token provided");
      throw new Error("Authentication required");
    }

    if (!request.auth.token.admin) {
      logger.error("User is not admin:", request.auth.uid);
      throw new Error("Admin access required");
    }

    logger.info("=== OPENWEATHER MANUAL FETCH START ===");
    logger.info(`Requested by: ${request.auth.uid}`);

    // Validate API key exists
    if (!OPENWEATHER_API_KEY) {
      throw new Error("OpenWeather API key not configured");
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${LIPA_LAT}&lon=${LIPA_LON}&appid=${OPENWEATHER_API_KEY}&units=metric`;
    
    logger.info("Fetching OpenWeather data...");

    const response = await fetch(url, {
      method: 'GET',
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'LipaAlertHub/1.0'
      },
      timeout: 10000
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`OpenWeather API Error: ${response.status} - ${errorText}`);
      throw new Error(`OpenWeather API error: ${response.status}`);
    }

    const data = await response.json();
    
    logger.info(`Weather: ${data.weather[0].description}, Temp: ${data.main.temp}°C`);

    // Process and create alert
    const alertData = processOpenWeatherData(data);
    
    if (alertData) {
      await createPendingAlert(alertData);
      logger.info(`Alert created: ${alertData.title}`);
    } else {
      // Create status update with expiration
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + ALERT_EXPIRATION_DAYS_PENDING);
      
      await createPendingAlert({
        type: "weather",
        title: "Weather Status - Lipa City",
        description: `Current: ${data.weather[0].description}. Temp: ${Math.round(data.main.temp)}°C. No severe conditions.`,
        severity: "info",
        source: "OpenWeather",
        raw: data,
        location: { lat: LIPA_LAT, lon: LIPA_LON },
        expiresAt: expiresAt
      });
    }

    logger.info("=== OPENWEATHER FETCH SUCCESS ===");

    return {
      success: true,
      message: alertData ? `Alert created: ${alertData.title}` : "Weather status updated",
      data: {
        temperature: data.main.temp,
        conditions: data.weather[0].description
      }
    };

  } catch (error) {
    logger.error("=== OPENWEATHER FETCH FAILED ===");
    logger.error("Error type:", error.name);
    logger.error("Error message:", error.message);
    logger.error("Stack:", error.stack);
    
    // Return a proper error response instead of throwing
    throw new Error(`OpenWeather fetch failed: ${error.message}`);
  }
});

exports.manualFetchUSGS = onCall({
  region: "asia-southeast1",
  cors: true,
  memory: "512MiB",
  timeoutSeconds: 60
}, async (request) => {
  try {
    // Verify admin access
    if (!request.auth) {
      throw new Error("Authentication required");
    }

    if (!request.auth.token.admin) {
      throw new Error("Admin access required");
    }

    logger.info("=== USGS MANUAL FETCH START (LIPA FOCUS) ===");
    logger.info(`Requested by: ${request.auth.uid}`);

    // Use bounding box for Lipa area
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=${LIPA_BOUNDING_BOX.south}&maxlatitude=${LIPA_BOUNDING_BOX.north}&minlongitude=${LIPA_BOUNDING_BOX.west}&maxlongitude=${LIPA_BOUNDING_BOX.east}&minmagnitude=2.0&orderby=time&limit=15`;
    
    logger.info("Fetching USGS data for Lipa area...");

    const response = await fetch(url, {
      method: 'GET',
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'LipaAlertHub/1.0'
      },
      timeout: 15000
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`USGS API Error: ${response.status} - ${errorText}`);
      throw new Error(`USGS API error: ${response.status}`);
    }

    const data = await response.json();
    
    logger.info(`Found ${data.features.length} earthquakes in Lipa region`);

    if (data.features.length === 0) {
      // Create status alert with expiration
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + ALERT_EXPIRATION_DAYS_PENDING);
      
      await createPendingAlert({
        type: "earthquake",
        title: "🟢 No Seismic Activity - Lipa City",
        description: `No significant earthquakes detected within ${LIPA_RADIUS_KM}km of Lipa City. Seismic monitoring active.`,
        source: "USGS",
        severity: "info",
        location: { 
          lat: LIPA_LAT, 
          lon: LIPA_LON,
          city: "Lipa City",
          province: "Batangas"
        },
        expiresAt: expiresAt
      });

      return {
        success: true,
        message: "No earthquakes detected in Lipa area",
        count: 0,
        area: "Lipa City Focus"
      };
    }

    // Process earthquakes with Lipa filtering
    let created = 0;
    let outsideLipa = 0;
    
    for (const eq of data.features) {
      const coords = eq.geometry.coordinates;
      const distance = calculateDistance(LIPA_LAT, LIPA_LON, coords[1], coords[0]);
      
      // Skip if outside Lipa area
      if (distance > LIPA_RADIUS_KM) {
        outsideLipa++;
        continue;
      }
      
      const alertData = processUSGSEarthquake(eq);
      if (alertData) {
        alertData.eventId = eq.id;
        await createPendingAlert(alertData);
        created++;
      }
    }

    logger.info("=== USGS FETCH SUCCESS (LIPA FOCUS) ===");

    return {
      success: true,
      message: `Created ${created} Lipa-area earthquake alerts`,
      count: created,
      filteredOut: outsideLipa,
      area: `Lipa City (${LIPA_RADIUS_KM}km radius)`
    };

  } catch (error) {
    logger.error("=== USGS FETCH FAILED ===");
    logger.error("Error:", error.message);
    logger.error("Stack:", error.stack);
    
    throw new Error(`USGS fetch failed: ${error.message}`);
  }
});

exports.getLipaEarthquakes = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  try {
    const { hours = 24 } = request.data || {};
    
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=${LIPA_BOUNDING_BOX.south}&maxlatitude=${LIPA_BOUNDING_BOX.north}&minlongitude=${LIPA_BOUNDING_BOX.west}&maxlongitude=${LIPA_BOUNDING_BOX.east}&minmagnitude=2.0&starttime=${startTime.toISOString()}&orderby=time&limit=20`;
    
    const response = await fetch(url, { timeout: 10000 });
    const data = await response.json();
    
    // Filter for Lipa area only
    const lipaEarthquakes = data.features.filter(earthquake => {
      const coords = earthquake.geometry.coordinates;
      const distance = calculateDistance(LIPA_LAT, LIPA_LON, coords[1], coords[0]);
      return distance <= LIPA_RADIUS_KM;
    });
    
    return {
      success: true,
      earthquakes: lipaEarthquakes.map(eq => ({
        id: eq.id,
        magnitude: eq.properties.mag,
        place: eq.properties.place,
        time: eq.properties.time,
        distance: calculateDistance(LIPA_LAT, LIPA_LON, eq.geometry.coordinates[1], eq.geometry.coordinates[0]),
        coordinates: {
          lat: eq.geometry.coordinates[1],
          lon: eq.geometry.coordinates[0]
        }
      })),
      total: lipaEarthquakes.length,
      area: `Lipa City (${LIPA_RADIUS_KM}km radius)`,
      period: `${hours} hours`
    };
    
  } catch (error) {
    logger.error("Error getting Lipa earthquakes:", error);
    throw new Error("Failed to retrieve Lipa earthquake data");
  }
});

// Function to check if location is within Lipa City
function isInLipaCity(lat, lon) {
  const distance = calculateDistance(LIPA_LAT, LIPA_LON, lat, lon);
  return distance <= 20; // Within 20km considered Lipa City
}

// Enhanced cleanup with better error handling
exports.cleanupExpiredOtps = onSchedule({
  schedule: "0 2 * * *",
  timeZone: "Asia/Manila",
  region: "asia-southeast1"
}, async (context) => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const now = new Date();
    
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

    // Clean up expired alerts
    const expiredAlertsQuery = await admin
      .firestore()
      .collection("alerts")
      .where("expiresAt", "<", admin.firestore.Timestamp.fromDate(now))
      .get();

    let cleanedOtps = 0;
    let cleanedRateLimits = 0;
    let cleanedAlerts = 0;

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

    if (!expiredAlertsQuery.empty) {
      const batch3 = admin.firestore().batch();
      expiredAlertsQuery.docs.forEach((doc) => batch3.delete(doc.ref));
      await batch3.commit();
      cleanedAlerts = expiredAlertsQuery.size;
    }

    logger.info(`Cleanup completed: ${cleanedOtps} expired OTPs, ${cleanedRateLimits} old rate limit records, ${cleanedAlerts} expired alerts`);
    
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

  // Only process active and approved alerts
  if (!alertData || !alertData.isActive || !alertData.approved) {
    logger.info("⏭️ Alert not active/approved — skipping notifications");
    return;
  }

  try {
    logger.info(`📢 Processing new weather alert: ${alertId}`);
    logger.info(`Alert: ${alertData.title} (${alertData.severity})`);

    // ✅ STEP 1: CREATE IN-APP NOTIFICATIONS FOR ALL USERS
    const allUsersSnapshot = await admin.firestore().collection("users")
      .where("status", "==", "active")
      .get();

    const inAppNotificationBatch = admin.firestore().batch();
    let inAppCount = 0;

    allUsersSnapshot.forEach((userDoc) => {
      const notificationRef = admin.firestore().collection("notifications").doc();
      
      inAppNotificationBatch.set(notificationRef, {
        userId: userDoc.id,
        alertId: alertId,
        title: `⚠️ ${alertData.severity.toUpperCase()} ALERT`,
        body: alertData.title,
        type: "weather_alert",
        priority: alertData.severity === "danger" ? "high" : "normal",
        status: "unread",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        data: {
          alertId: alertId,
          severity: alertData.severity,
          alertType: alertData.type,
          description: alertData.description,
          actionUrl: `/weather/detailed?alertId=${alertId}`
        },
        expiresAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        )
      });
      
      inAppCount++;
    });

    await inAppNotificationBatch.commit();
    logger.info(`✅ Created ${inAppCount} in-app notifications`);

    // ✅ STEP 2: SEND PUSH NOTIFICATIONS
    const usersWithTokens = await admin.firestore().collection("users")
      .where("expoPushToken", "!=", null)
      .where("notificationsEnabled", "!=", false)
      .get();

    if (usersWithTokens.empty) {
      logger.info("ℹ️ No users with push tokens found");
      return;
    }

    const messages = [];
    const severityEmoji = {
      info: "🔵",
      watch: "🟡", 
      warning: "🟠",
      danger: "🔴",
    }[alertData.severity] || "⚠️";

    const severityText = {
      info: "INFORMATION",
      watch: "WATCH",
      warning: "WARNING",
      danger: "DANGER"
    }[alertData.severity] || "ALERT";

    usersWithTokens.forEach((doc) => {
      const user = doc.data();
      const token = user.expoPushToken;
      
      if (token && token.trim() && typeof token === 'string') {
        messages.push({
          to: token,
          sound: alertData.severity === 'danger' ? 'default' : 'default',
          title: `${severityEmoji} ${severityText}`,
          body: alertData.title.substring(0, 100),
          data: {
            type: "weather_alert",
            alertId: alertId,
            severity: alertData.severity,
            alertType: alertData.type,
            timestamp: Date.now(),
            screen: "WeatherAlerts"
          },
          channelId: "weather_alerts",
          priority: alertData.severity === "danger" ? "high" : "default",
          ttl: 3600,
          badge: 1
        });
      }
    });

    logger.info(`📨 Prepared ${messages.length} push notifications`);

    if (messages.length === 0) {
      logger.info("ℹ️ No valid push tokens to send to");
      return;
    }

    // Send in batches of 100
    const BATCH_SIZE = 100;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(batch),
          timeout: 30000
        });

        if (response.ok) {
          const result = await response.json();
          successCount += batch.length;
          logger.info(`✅ Batch ${Math.floor(i/BATCH_SIZE) + 1} sent successfully`);
        } else {
          failCount += batch.length;
          logger.error(`❌ Batch ${Math.floor(i/BATCH_SIZE) + 1} failed: ${response.status}`);
        }
      } catch (error) {
        failCount += batch.length;
        logger.error(`❌ Batch ${Math.floor(i/BATCH_SIZE) + 1} error:`, error);
      }

      // Small delay between batches
      if (i + BATCH_SIZE < messages.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info(`📊 Push notification results: ${successCount} successful, ${failCount} failed`);
    
    // ✅ STEP 3: UPDATE ALERT WITH NOTIFICATION STATS
    await admin.firestore().collection("weather_alerts").doc(alertId).update({
      notificationStats: {
        inAppCreated: inAppCount,
        pushSent: successCount,
        pushFailed: failCount,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        totalUsers: messages.length
      }
    });

    logger.info(`✅ Weather alert processing completed for: ${alertId}`);

  } catch (error) {
    logger.error("❌ Error in onWeatherAlertCreated:", error);
  }
});

// =================== ALERT SEVERITY INCREASE NOTIFICATION ===================
exports.onWeatherAlertUpdated = onDocumentUpdated({
  document: "weather_alerts/{alertId}",
  region: "asia-southeast1"
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const alertId = event.params.alertId;

  if (!before || !after) return;

  try {
    // Check if severity increased
    const severityOrder = { info: 1, watch: 2, warning: 3, danger: 4 };
    const beforeLevel = severityOrder[before.severity] || 0;
    const afterLevel = severityOrder[after.severity] || 0;

    if (afterLevel > beforeLevel && after.isActive && after.approved) {
      logger.info(`⚠️ Alert ${alertId} severity INCREASED: ${before.severity} → ${after.severity}`);
      
      // ✅ CREATE IN-APP NOTIFICATIONS
      const usersSnapshot = await admin.firestore().collection("users")
        .where("status", "==", "active")
        .get();

      const batch = admin.firestore().batch();

      usersSnapshot.forEach((userDoc) => {
        const notificationRef = admin.firestore().collection("notifications").doc();
        
        batch.set(notificationRef, {
          userId: userDoc.id,
          alertId: alertId,
          title: `⚠️ ALERT UPGRADED: ${after.severity.toUpperCase()}`,
          body: `${after.title} - Severity increased from ${before.severity.toUpperCase()} to ${after.severity.toUpperCase()}`,
          type: "weather_alert_updated",
          priority: "high",
          status: "unread",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          data: {
            alertId: alertId,
            severity: after.severity,
            previousSeverity: before.severity,
            actionUrl: `/weather/detailed?alertId=${alertId}`
          },
          expiresAt: admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          )
        });
      });

      await batch.commit();

      // ✅ SEND PUSH NOTIFICATIONS
      const usersWithTokens = await admin.firestore().collection("users")
        .where("expoPushToken", "!=", null)
        .where("notificationsEnabled", "!=", false)
        .limit(1000)
        .get();

      const messages = [];
      const severityEmoji = { info: "🔵", watch: "🟡", warning: "🟠", danger: "🔴" }[after.severity] || "⚠️";

      usersWithTokens.forEach((doc) => {
        const token = doc.data().expoPushToken;
        if (token && typeof token === 'string' && token.trim()) {
          messages.push({
            to: token,
            sound: 'default',
            title: `${severityEmoji} ALERT UPGRADED: ${after.severity.toUpperCase()}`,
            body: `${after.title}`,
            data: {
              type: "weather_alert_updated",
              alertId: alertId,
              severity: after.severity,
              previousSeverity: before.severity,
              timestamp: Date.now(),
              screen: "WeatherAlerts"
            },
            priority: 'high',
            ttl: 3600,
            badge: 1
          });
        }
      });

      if (messages.length > 0) {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(messages)
        });

        logger.info(`📢 Sent ${messages.length} severity update notifications`);
      }
    }

    // Check if alert was deactivated
    if (before.isActive && !after.isActive) {
      logger.info(`🔕 Alert ${alertId} was DEACTIVATED`);
      
      // Create deactivation notification
      const usersSnapshot = await admin.firestore().collection("users")
        .where("status", "==", "active")
        .limit(1000)
        .get();

      const batch = admin.firestore().batch();

      usersSnapshot.forEach((userDoc) => {
        const notificationRef = admin.firestore().collection("notifications").doc();
        
        batch.set(notificationRef, {
          userId: userDoc.id,
          alertId: alertId,
          title: "✅ Alert Cleared",
          body: `${after.title} - This alert has been cleared`,
          type: "weather_alert_cleared",
          priority: "low",
          status: "unread",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          data: {
            alertId: alertId,
            alertTitle: after.title
          },
          expiresAt: admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days
          )
        });
      });

      await batch.commit();
      logger.info(`✅ Created ${usersSnapshot.size} deactivation notifications`);
    }

  } catch (error) {
    logger.error("❌ Error in onWeatherAlertUpdated:", error);
  }
});

exports.testWeatherAlertNotification = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth) {
    throw new Error("Authentication required");
  }

  try {
    const userId = request.auth.uid;
    
    logger.info(`🧪 Testing notification for user: ${userId}`);

    // ✅ CREATE IN-APP NOTIFICATION
    await admin.firestore().collection("notifications").add({
      userId: userId,
      title: "🧪 Test Weather Alert",
      body: "This is a test notification. If you can see this, real-time notifications are working!",
      type: "weather_alert",
      priority: "high",
      status: "unread",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      data: {
        isTest: true,
        timestamp: new Date().toISOString()
      },
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 24 * 60 * 60 * 1000) // 1 day
      )
    });

    // ✅ SEND PUSH NOTIFICATION
    const userDoc = await admin.firestore().collection("users").doc(userId).get();
    const userData = userDoc.data();
    const token = userData?.expoPushToken;

    if (token && typeof token === 'string' && token.trim()) {
      const message = {
        to: token,
        sound: 'default',
        title: '🧪 Test Weather Alert',
        body: 'This is a test notification. If you received this, push notifications are working!',
        data: {
          type: "weather_alert",
          isTest: true,
          timestamp: Date.now(),
          screen: "Notifications"
        },
        priority: 'high',
        badge: 1
      };

      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message)
      });

      if (response.ok) {
        logger.info(`✅ Test push notification sent to user ${userId}`);
        return {
          success: true,
          message: "Test notification sent successfully (both in-app and push)",
          sentPush: true,
          timestamp: new Date().toISOString()
        };
      } else {
        logger.error(`❌ Push notification failed: ${response.status}`);
        return {
          success: true,
          message: "In-app notification sent, but push notification failed",
          sentPush: false,
          error: `HTTP ${response.status}`,
          timestamp: new Date().toISOString()
        };
      }
    } else {
      logger.info(`ℹ️ No push token for user ${userId}`);
      return {
        success: true,
        message: "In-app notification sent (no push token available)",
        sentPush: false,
        timestamp: new Date().toISOString()
      };
    }

  } catch (error) {
    logger.error("❌ Error testing notification:", error);
    throw new Error("Failed to send test notification");
  }
});

exports.getNotificationStats = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get notification counts
    const [
      totalNotifications,
      last24Hours,
      lastWeek,
      weatherAlerts,
      unreadNotifications
    ] = await Promise.all([
      admin.firestore().collection("notifications").count().get(),
      admin.firestore().collection("notifications")
        .where("createdAt", ">", admin.firestore.Timestamp.fromDate(oneDayAgo))
        .count().get(),
      admin.firestore().collection("notifications")
        .where("createdAt", ">", admin.firestore.Timestamp.fromDate(oneWeekAgo))
        .count().get(),
      admin.firestore().collection("notifications")
        .where("type", "==", "weather_alert")
        .count().get(),
      admin.firestore().collection("notifications")
        .where("status", "==", "unread")
        .count().get()
    ]);

    return {
      success: true,
      stats: {
        total: totalNotifications.data().count,
        last24Hours: last24Hours.data().count,
        lastWeek: lastWeek.data().count,
        weatherAlerts: weatherAlerts.data().count,
        unread: unreadNotifications.data().count
      },
      generatedAt: new Date().toISOString()
    };

  } catch (error) {
    logger.error("❌ Error getting notification stats:", error);
    throw new Error("Failed to get notification stats");
  }
});


exports.onWeatherAlertUpdated = onDocumentUpdated({
  document: "weather_alerts/{alertId}",
  region: "asia-southeast1"
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const alertId = event.params.alertId;

  if (!before || !after) return;

  try {
    // Check if alert was just approved (pending -> approved)
    if (!before.approved && after.approved && after.isActive) {
      logger.info(`✅ Alert ${alertId} was just APPROVED - triggering notifications`);
      
      // Trigger the same notification logic as creation
      // This is already handled by onWeatherAlertCreated
      return;
    }

    // Check if severity increased
    const severityOrder = { info: 1, watch: 2, warning: 3, danger: 4 };
    const beforeLevel = severityOrder[before.severity] || 0;
    const afterLevel = severityOrder[after.severity] || 0;

    if (afterLevel > beforeLevel && after.isActive && after.approved) {
      logger.info(`⚠️ Alert ${alertId} severity INCREASED: ${before.severity} → ${after.severity}`);
      
      // Send update notification
      const usersSnapshot = await admin.firestore().collection("users")
        .where("expoPushToken", "!=", null)
        .where("notificationsEnabled", "!=", false)
        .limit(1000)
        .get();

      const messages = [];
      const severityEmoji = { info: "🔵", watch: "🟡", warning: "🟠", danger: "🔴" }[after.severity] || "⚠️";

      usersSnapshot.forEach((doc) => {
        const token = doc.data().expoPushToken;
        if (token && typeof token === 'string' && token.trim()) {
          messages.push({
            to: token,
            sound: 'default',
            title: `${severityEmoji} ALERT UPDATED: ${after.severity.toUpperCase()}`,
            body: `${after.title} - Severity increased to ${after.severity.toUpperCase()}`,
            data: {
              type: "weather_alert_updated",
              alertId: alertId,
              severity: after.severity,
              previousSeverity: before.severity,
              timestamp: Date.now()
            },
            priority: 'high',
            ttl: 3600
          });
        }
      });

      if (messages.length > 0) {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(messages)
        });

        logger.info(`📢 Sent ${messages.length} severity update notifications`);
      }
    }

    // Check if alert was deactivated
    if (before.isActive && !after.isActive) {
      logger.info(`🔕 Alert ${alertId} was DEACTIVATED`);
      
      await admin.firestore().collection("weather_alerts").doc(alertId).update({
        deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
        notificationStats: {
          ...after.notificationStats,
          deactivatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      });
    }

  } catch (error) {
    logger.error("❌ Error in onWeatherAlertUpdated:", error);
  }
});

// =================== TEST REAL-TIME ALERT CREATION (For Admin Testing) ===================
exports.createTestWeatherAlert = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  try {
    logger.info("🧪 Creating test weather alert...");

    const testAlert = {
      title: "TEST ALERT - Real-time Update Test",
      description: `This is a test alert created at ${new Date().toLocaleString()}. If you can see this immediately, real-time updates are working!`,
      severity: "info",
      type: "weather",
      approved: true,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: request.auth.uid,
      source: "Manual Test",
      location: {
        lat: 13.9411,
        lon: 121.1631,
        city: "Lipa City",
        province: "Batangas"
      },
      isTest: true
    };

    const docRef = await admin.firestore().collection("weather_alerts").add(testAlert);
    
    logger.info(`✅ Test alert created: ${docRef.id}`);

    return {
      success: true,
      message: "Test alert created successfully",
      alertId: docRef.id,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    logger.error("❌ Error creating test alert:", error);
    throw new Error("Failed to create test alert");
  }
});

exports.deleteTestAlerts = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  try {
    logger.info("🧹 Deleting test alerts...");

    const testAlertsQuery = await admin.firestore()
      .collection("weather_alerts")
      .where("isTest", "==", true)
      .get();

    const batch = admin.firestore().batch();
    let deleteCount = 0;

    testAlertsQuery.docs.forEach(doc => {
      batch.delete(doc.ref);
      deleteCount++;
    });

    await batch.commit();

    logger.info(`✅ Deleted ${deleteCount} test alerts`);

    return {
      success: true,
      message: `Deleted ${deleteCount} test alerts`,
      deletedCount: deleteCount
    };

  } catch (error) {
    logger.error("❌ Error deleting test alerts:", error);
    throw new Error("Failed to delete test alerts");
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
  cpu: 1,
  memory: "512MiB",
  timeoutSeconds: 300
}, async (event) => {
  const filePath = event.data.name;
  
  // ✅ ENHANCED: Support for multiple photos (photo1, photo2, photo3)
  if (!filePath || !filePath.includes("incident_photos/")) {
    logger.info("Not an incident photo — skip:", filePath);
    return;
  }

  const metadata = event.data.metadata || {};
  
  // ✅ ENHANCED: Skip if already processed or no timestamp required
  if (metadata.embedTimestamp !== "true" || metadata.processed === "true") {
    logger.info("No timestamp embedding required or already processed:", filePath);
    return;
  }

  const bucket = admin.storage().bucket();
  const file = bucket.file(filePath);

  try {
    logger.info("🔄 Processing incident image:", filePath);
    logger.info("📸 Photo metadata:", {
      timestampText: metadata.timestampText,
      location: metadata.location,
      photoIndex: metadata.photoIndex || 'single',
      totalPhotos: metadata.totalPhotos || 1
    });
    
    // ✅ ENHANCED: Check if file exists and is accessible
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error("File no longer exists in storage");
    }

    // ✅ ENHANCED: Download with better retry logic
    const buffer = await retryOperation(async () => {
      try {
        const [downloadBuffer] = await file.download();
        logger.info(`✅ Downloaded photo: ${filePath} (${downloadBuffer.length} bytes)`);
        return downloadBuffer;
      } catch (downloadError) {
        logger.error("❌ Download failed:", downloadError);
        throw new Error(`Failed to download image: ${downloadError.message}`);
      }
    });

    // ✅ ENHANCED: Get image metadata with validation
    const imageMetadata = await sharp(buffer).metadata();
    const { width = 800, height = 600, format } = imageMetadata;

    logger.info("📊 Image metadata:", {
      width,
      height,
      format,
      size: buffer.length
    });

    // ✅ ENHANCED: Validate image format
    if (!format || !['jpeg', 'jpg', 'png', 'webp'].includes(format)) {
      throw new Error(`Unsupported image format: ${format}. Supported: jpeg, jpg, png, webp`);
    }

    // ✅ ENHANCED: Handle large images with warning
    if (width > 4000 || height > 4000) {
      logger.warn("⚠️ Large image detected, may require more processing time:", {
        width,
        height,
        filePath
      });
    }

    // ✅ ENHANCED: Timestamp and location text
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
      
    const location = metadata.location || "LipaAlertHub";
    const lines = [timestampText, location].filter(Boolean);

    // ✅ ENHANCED: Dynamic font sizing based on image dimensions
    const fontSize = Math.max(14, Math.floor(Math.min(width, height) * 0.03));
    const padding = Math.floor(fontSize * 1.0);
    const lineHeight = Math.floor(fontSize * 1.3);

    const maxLineLength = Math.max(...lines.map(l => l.length));
    const bgWidth = Math.max(250, Math.floor(maxLineLength * fontSize * 0.6));
    const bgHeight = lines.length * lineHeight + padding * 3;

    // ✅ ENHANCED: SVG overlay with better styling
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

        <!-- Background rectangle -->
        <rect x="${width - bgWidth - padding * 2}" y="${height - bgHeight - padding * 2}" 
              width="${bgWidth + padding * 2}" height="${bgHeight + padding}" 
              rx="12" fill="url(#bgGradient)" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>

        <!-- Timestamp and location text -->
        ${lines.map((line, idx) => {
          const y = height - (lines.length - idx - 1) * lineHeight - padding * 2.5;
          const color = idx === 0 ? "#ffffff" : "#ffd700"; // White for timestamp, gold for location
          const fSize = idx === 0 ? fontSize : Math.floor(fontSize * 0.85);
          const weight = idx === 0 ? "bold" : "normal";
          
          return `<text x="${width - bgWidth/2 - padding}" y="${y}" text-anchor="middle" 
                        fill="${color}" font-family="Arial, sans-serif" font-size="${fSize}" 
                        font-weight="${weight}" filter="url(#shadow)">
                    ${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
                  </text>`;
        }).join("")}

        <!-- Verification badge -->
        <circle cx="${width - padding * 3 - 15}" cy="${height - bgHeight - padding + 15}" r="12" 
                fill="#27ae60" stroke="white" stroke-width="2" filter="url(#shadow)"/>
        <text x="${width - padding * 3 - 15}" y="${height - bgHeight - padding + 20}" 
              text-anchor="middle" fill="white" font-size="14" font-weight="bold">✓</text>

        <!-- Photo counter (if multiple photos) -->
        ${metadata.photoIndex ? `
          <circle cx="${padding * 3 + 15}" cy="${height - padding * 3 - 15}" r="16" 
                  fill="#e74c3c" stroke="white" stroke-width="2" filter="url(#shadow)"/>
          <text x="${padding * 3 + 15}" y="${height - padding * 3 - 10}" 
                text-anchor="middle" fill="white" font-size="14" font-weight="bold">
            ${metadata.photoIndex}
          </text>
        ` : ''}
      </svg>
    `;

    // ✅ ENHANCED: Process image with better quality settings
    logger.info("🎨 Processing image with timestamp overlay...");
    
    const compositeBuffer = await sharp(buffer)
      .composite([{ input: Buffer.from(svg), gravity: "southeast" }])
      .jpeg({ 
        quality: 92,
        progressive: true,
        mozjpeg: true,
        chromaSubsampling: '4:4:4'
      })
      .toBuffer();

    logger.info(`✅ Image processed: ${compositeBuffer.length} bytes`);

    // ✅ ENHANCED: Save with comprehensive metadata
    await retryOperation(async () => {
      const enhancedMetadata = {
        ...metadata,
        processed: "true",
        processedAt: new Date().toISOString(),
        timestampEmbedded: "true",
        originalFormat: format,
        processedSize: compositeBuffer.length,
        processingVersion: "3.0", // Updated version for multiple photos
        dimensions: { width, height },
        timestamp: timestampText,
        location: location,
        // ✅ ADDED: Multiple photo tracking
        photoInfo: {
          index: metadata.photoIndex || 1,
          total: metadata.totalPhotos || 1,
          isMultiple: (metadata.totalPhotos && metadata.totalPhotos > 1) || false
        }
      };

      await file.save(compositeBuffer, {
        metadata: {
          contentType: "image/jpeg",
          metadata: enhancedMetadata,
          cacheControl: 'public, max-age=31536000' // Cache for 1 year
        },
      });

      logger.info("💾 Saved processed image with enhanced metadata");
    });

    logger.info(`🎉 Incident image processed successfully: ${filePath}`);
    
    // ✅ ENHANCED: Log success with details
    await admin.firestore().collection("photo_processing_logs").add({
      filePath: filePath,
      status: "success",
      originalSize: buffer.length,
      processedSize: compositeBuffer.length,
      dimensions: { width, height },
      format: format,
      timestamp: timestampText,
      location: location,
      photoIndex: metadata.photoIndex || 1,
      totalPhotos: metadata.totalPhotos || 1,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      processingTime: Date.now() - (metadata.uploadTime ? parseInt(metadata.uploadTime) : Date.now())
    });

  } catch (error) {
    logger.error("❌ Error processing incident photo:", {
      filePath: filePath,
      error: error.message,
      stack: error.stack,
      metadata: metadata
    });
    
    // ✅ ENHANCED: Set detailed failure metadata
    try {
      const failureMetadata = {
        ...metadata,
        processed: "failed",
        processedAt: new Date().toISOString(),
        error: String(error.message || error).substring(0, 500),
        errorType: error.name || 'Unknown',
        retryCount: (parseInt(metadata.retryCount) || 0) + 1,
        lastRetry: new Date().toISOString()
      };

      await file.setMetadata({
        metadata: failureMetadata
      });

      logger.info("📝 Set failure metadata on file");

      // ✅ ENHANCED: Log failure for debugging
      await admin.firestore().collection("photo_processing_logs").add({
        filePath: filePath,
        status: "failed",
        error: error.message,
        errorType: error.name,
        metadata: metadata,
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        retryCount: (parseInt(metadata.retryCount) || 0) + 1
      });

    } catch (metaError) {
      logger.error("💥 Failed to set error metadata:", metaError);
    }
    
    // ✅ ENHANCED: Notify admins of critical failures
    if (error.message.includes("corrupt") || error.message.includes("format")) {
      try {
        const admins = await admin.firestore()
          .collection("users")
          .where("role", "in", ["admin", "monitor"])
          .where("status", "==", "active")
          .get();

        for (const adminDoc of admins.docs) {
          await admin.firestore().collection("notifications").add({
            userId: adminDoc.id,
            title: "🖼️ Photo Processing Failed",
            body: `Failed to process ${filePath}: ${error.message}`,
            type: "photo_processing_error",
            priority: "normal",
            status: "unread",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            data: {
              filePath: filePath,
              error: error.message,
              timestamp: new Date().toISOString()
            }
          });
        }
      } catch (notifyError) {
        logger.error("Failed to notify admins:", notifyError);
      }
    }
  }
});
/* ===================================================================
   DUPLICATE REPORT DETECTION SYSTEM - WITH PUSH NOTIFICATIONS
=================================================================== */

// ✅ HELPER: Calculate distance between coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  return distance;
}

// ✅ ENHANCED: Send duplicate notification to user
async function sendDuplicateNotification(userId, duplicateReport, emergencyType, subCategory, barangay, timeSinceReport) {
  try {
    console.log(`📱 Sending duplicate notification to user: ${userId}`);
    
    // Get user data for notification
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    if (!userDoc.exists) {
      console.log('User not found for notification');
      return;
    }

    const userData = userDoc.data();
    const expoPushToken = userData?.expoPushToken;

    // Create in-app notification
    await admin.firestore().collection('notifications').add({
      userId: userId,
      title: '⚠️ Report Already Submitted',
      body: `You already submitted this ${emergencyType} report in ${barangay}. Tap to view status.`,
      type: 'report_duplicate',
      priority: 'high',
      status: 'unread',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      data: {
        reportId: duplicateReport.id,
        emergencyType: emergencyType,
        subCategory: subCategory,
        barangay: barangay,
        timeSinceReport: timeSinceReport,
        status: duplicateReport.status,
        actionUrl: `/report/status?reportId=${duplicateReport.id}`,
        timestamp: new Date().toISOString()
      },
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      )
    });

    console.log('✅ In-app duplicate notification created');

    // Send push notification if user has token
    if (expoPushToken && typeof expoPushToken === 'string' && expoPushToken.trim()) {
      const message = {
        to: expoPushToken,
        sound: 'default',
        title: '⚠️ Report Already Submitted',
        body: `You already reported this ${emergencyType.toLowerCase()} in ${barangay}. Tap to view status.`,
        data: {
          type: 'report_duplicate',
          reportId: duplicateReport.id,
          emergencyType: emergencyType,
          barangay: barangay,
          timeSinceReport: timeSinceReport,
          timestamp: Date.now()
        },
        channelId: 'reports',
        priority: 'high',
        ttl: 3600 // 1 hour
      };

      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });

      if (response.ok) {
        console.log('✅ Push notification sent for duplicate report');
      } else {
        console.error('❌ Push notification failed:', response.status);
      }
    }

  } catch (error) {
    console.error('❌ Error sending duplicate notification:', error);
    // Don't throw - notification failure shouldn't break the duplicate check
  }
}

// ✅ SERVER-SIDE DUPLICATE CHECK FUNCTION
// ✅ UPDATED DUPLICATE CHECK FUNCTION (Server-side)
// ✅ UPDATED DUPLICATE CHECK FUNCTION (Server-side)
async function checkForDuplicateReportServerSide(userId, emergencyType, subCategory, location, barangay, establishment) {
  try {
    console.log('🔍 [CLOUD FUNCTION - ENHANCED] Checking for duplicate report...');
    console.log('🔍 Duplicate Check Criteria:', {
      userId,
      emergencyType,
      subCategory,
      barangay,
      establishment: establishment || 'none',
      latitude: location.latitude,
      longitude: location.longitude
    });

    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    
    // ✅ FIXED: Extended time window to 2 hours for better duplicate detection
    const twoHoursAgo = new Date(now.toDate().getTime() - 2 * 60 * 60 * 1000);

    // ✅ FIXED: Query includes ALL required fields for proper duplicate detection
    const reportsRef = db.collection('incident_reports');
    const snapshot = await reportsRef
      .where('userId', '==', userId)
      .where('emergencyType', '==', emergencyType) // ✅ MUST match emergency type
      .where('subCategory', '==', subCategory)     // ✅ MUST match subcategory
      .where('barangay', '==', barangay)           // ✅ MUST match barangay
      .where('createdAt', '>', admin.firestore.Timestamp.fromDate(twoHoursAgo))
      .where('status', 'in', ['pending', 'accepted', 'verified', 'assigned'])
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    console.log(`📋 [CLOUD FUNCTION] Found ${snapshot.size} potential duplicate(s) to check`);

    if (snapshot.empty) {
      console.log('✅ [CLOUD FUNCTION] No potential duplicates found');
      return { isDuplicate: false };
    }

    // ✅ CHECK EACH REPORT FOR LOCATION MATCH WITH 50m RADIUS
    for (const doc of snapshot.docs) {
      const report = doc.data();
      
      console.log(`🔍 Checking report ${doc.id}:`, {
        emergency: report.emergencyType,
        subCategory: report.subCategory,
        barangay: report.barangay,
        establishment: report.establishment || 'none',
        status: report.status,
        createdAt: report.createdAt?.toDate().toISOString()
      });

      let isLocationMatch = false;

      // ✅ SMART LOCATION MATCHING - SAME LOGIC AS CLIENT
      if (establishment && report.establishment) {
        // Establishment exact match
        isLocationMatch = (
          establishment.toLowerCase().trim() === 
          report.establishment.toLowerCase().trim()
        );
        console.log(`📍 [CLOUD FUNCTION] Establishment match: ${isLocationMatch} (${establishment} vs ${report.establishment})`);
      } else {
        // 50-meter radius check
        const reportLat = report.location?.latitude || report.lat;
        const reportLng = report.location?.longitude || report.lng;

        if (reportLat && reportLng) {
          const distance = calculateDistance(
            location.latitude,
            location.longitude,
            reportLat,
            reportLng
          );

          console.log(`📏 [CLOUD FUNCTION] Distance: ${distance.toFixed(3)}km (${(distance * 1000).toFixed(0)}m)`);
          isLocationMatch = distance <= 0.05; // 50 meters
          console.log(`📍 [CLOUD FUNCTION] 50m radius check: ${isLocationMatch}`);
        } else {
          console.log('⚠️ [CLOUD FUNCTION] Report missing coordinates - cannot check distance');
        }
      }

      // ✅ ONLY BLOCK IF ALL CRITERIA MATCH: same user + same emergency type + same subcategory + same location
      if (isLocationMatch) {
        const reportTime = report.createdAt?.toDate() || new Date(0);
        const timeDiff = Math.floor((now.toDate().getTime() - reportTime.getTime()) / (1000 * 60));

        console.log('🚨 [CLOUD FUNCTION] DUPLICATE FOUND! Blocking submission.');
        console.log(`📋 Duplicate Details - Report ID: ${doc.id}, Time difference: ${timeDiff} minutes, Status: ${report.status}`);

        return {
          isDuplicate: true,
          duplicateReport: { id: doc.id, ...report },
          duplicateReportId: doc.id,
          timeSinceReport: timeDiff,
          message: `Duplicate report found: ${report.emergencyType} - ${report.subCategory} in ${report.barangay}`
        };
      }
    }

    console.log('✅ [CLOUD FUNCTION] No duplicates found after location check');
    return { isDuplicate: false };

  } catch (error) {
    console.error('❌ [CLOUD FUNCTION] Error in duplicate check:', error);
    // Don't block submission on error (fail open)
    return { 
      isDuplicate: false,
      message: 'Duplicate check failed, allowing submission'
    };
  }
}

// ✅ CLIENT-SIDE CALLABLE FUNCTION FOR DUPLICATE CHECK
exports.checkDuplicateReport = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  try {
    // Verify authentication
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { 
      emergencyType, 
      subCategory, 
      location, 
      barangay, 
      establishment 
    } = request.data;

    // Validate required fields
    if (!emergencyType || !subCategory || !location || !barangay) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    console.log('🔍 [CLIENT DUPLICATE CHECK] Starting check for user:', request.auth.uid);

    const duplicateCheck = await checkForDuplicateReportServerSide(
      request.auth.uid,
      emergencyType,
      subCategory,
      location,
      barangay,
      establishment
    );

    // ✅ SEND NOTIFICATION IMMEDIATELY IF DUPLICATE FOUND (Client-side check)
    if (duplicateCheck.isDuplicate && duplicateCheck.duplicateReport) {
      console.log('📱 Sending immediate duplicate notification to user');
      
      await sendDuplicateNotification(
        request.auth.uid,
        duplicateCheck.duplicateReport,
        emergencyType,
        subCategory,
        barangay,
        duplicateCheck.timeSinceReport
      );
    }

    return {
      success: true,
      isDuplicate: duplicateCheck.isDuplicate,
      duplicateReportId: duplicateCheck.duplicateReportId,
      timeSinceReport: duplicateCheck.timeSinceReport,
      message: duplicateCheck.message
    };

  } catch (error) {
    console.error('❌ [CLIENT DUPLICATE CHECK] Error:', error);
    
    if (error.code === 'unauthenticated' || error.code === 'invalid-argument') {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 'Failed to check for duplicates');
  }
});

// ✅ NEW: MANUAL DUPLICATE CHECK FOR TESTING
exports.manualDuplicateCheck = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  try {
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { 
      emergencyType = 'medical', 
      subCategory = 'heart_attack', 
      barangay = 'Lipa City',
      testMode = false 
    } = request.data;

    // For testing, create a mock location in Lipa
    const testLocation = {
      latitude: 13.9411,
      longitude: 121.1631
    };

    console.log('🧪 [MANUAL DUPLICATE CHECK] Testing for user:', request.auth.uid);

    const duplicateCheck = await checkForDuplicateReportServerSide(
      request.auth.uid,
      emergencyType,
      subCategory,
      testLocation,
      barangay,
      'Test Establishment'
    );

    let notificationSent = false;
    
    // If duplicate found and in test mode, send notification
    if (duplicateCheck.isDuplicate && duplicateCheck.duplicateReport && testMode) {
      await sendDuplicateNotification(
        request.auth.uid,
        duplicateCheck.duplicateReport,
        emergencyType,
        subCategory,
        barangay,
        duplicateCheck.timeSinceReport || 5
      );
      notificationSent = true;
    }

    return {
      success: true,
      isDuplicate: duplicateCheck.isDuplicate,
      duplicateReportId: duplicateCheck.duplicateReportId,
      timeSinceReport: duplicateCheck.timeSinceReport,
      notificationSent: notificationSent,
      message: duplicateCheck.message || 'Check completed'
    };

  } catch (error) {
    console.error('❌ [MANUAL DUPLICATE CHECK] Error:', error);
    throw new functions.https.HttpsError('internal', 'Manual check failed');
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

    // =================== PART 1: AUTO-SUGGEST AGENCY ===================
    // AUTO-SUGGEST AGENCY WHEN REPORT IS VERIFIED/ACCEPTED
    if ((after.status === 'verified' || after.status === 'accepted') && !before.suggestedAgency) {
        const suggestion = determineSuggestedAgency(after);
        await admin.firestore().collection("incident_reports").doc(reportId).update({
             assignedRescuer: rescuerId,  // ← This MUST be set
            suggestedAgency: suggestion.mainAgency,
            suggestedPartner: suggestion.partnerAgency,
            requiresPatientForm: suggestion.requiresPatientForm,
            suggestionReason: suggestion.suggestionReason,
            suggestedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        logger.info(`Agency suggested for report ${reportId}: ${suggestion.mainAgency}`);
    }

    // =================== PART 2: REAL-TIME AVAILABILITY TRACKING ===================
    // When rescuer is assigned - mark as busy
    if (!before.assignedRescuer && after.assignedRescuer) {
      await admin.firestore().collection('users').doc(after.assignedRescuer).update({
        currentAssignment: reportId,
        rescuerStatus: 'busy',
        lastAssignment: admin.firestore.FieldValue.serverTimestamp()
      });
      logger.info(`Rescuer ${after.assignedRescuer} marked as busy for report ${reportId}`);
    }

    // When report resolved - mark rescuer as available
    if (before.assignedRescuer && after.status === 'resolved') {
      await admin.firestore().collection('users').doc(before.assignedRescuer).update({
        currentAssignment: null,
        rescuerStatus: 'available', 
        lastAvailable: admin.firestore.FieldValue.serverTimestamp()
      });

      // Auto-create patient form placeholder
      await admin.firestore().collection('patient_forms').add({
        reportId: reportId,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: before.assignedRescuer,
        incidentType: after.incidentType || after.emergencyType,
        patientName: 'Pending Completion'
      });
      
      logger.info(`Rescuer ${before.assignedRescuer} marked as available and patient form created for report ${reportId}`);
    }

    // =================== PART 3: USER NOTIFICATIONS ===================
    const location = after.location?.address || 
                    `${after.location?.latitude || "Unknown"}, ${after.location?.longitude || "location"}`;
    const emergencyType = after.emergencyType || "incident";

    // ✅ IMMEDIATE NOTIFICATION TO USER
    let userTitle = '';
    let userBody = '';

    switch (after.status) {
      case 'verified':
        userTitle = '✅ SOS Verified';
        userBody = `Your ${emergencyType} report has been verified by CDRRMO and is being assigned to responders.`;
        break;
      case 'assigned':
        const agencyName = after.assignedAgencyName || after.assignedAgency;
        userTitle = '👷 Response Team Assigned';
        userBody = `CDRRMO has assigned ${agencyName} to respond to your ${emergencyType} emergency.`;
        break;
      case 'resolved':
        userTitle = '✅ Emergency Resolved';
        userBody = `Your ${emergencyType} emergency has been successfully resolved by the response team.`;
        break;
      default:
        userTitle = '📋 SOS Status Update';
        userBody = `Your emergency report status has been updated to: ${after.status}`;
    }

    await sendImmediateUserNotification(
      after.userId || after.reporterId,
      reportId,
      userTitle,
      userBody,
      {
        type: 'sos_status_update',
        reportId: reportId,
        newStatus: after.status,
        emergencyType: emergencyType,
        location: location,
        timestamp: new Date().toISOString()
      }
    );

    // Update report with notification status
    await admin.firestore().collection("incident_reports").doc(reportId).update({
      lastNotificationSent: admin.firestore.FieldValue.serverTimestamp(),
      notificationStatus: "sent",
      lastStatus: after.status
    });

    logger.info(`Notification sent for report ${reportId} status: ${after.status}`);

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

async function sendImmediateUserNotification(userId, reportId, title, body, data = {}) {
  try {
    const userDoc = await admin.firestore().collection("users").doc(userId).get();
    
    if (!userDoc.exists) {
      logger.info("User not found for notification:", userId);
      return;
    }

    const userData = userDoc.data();
    const token = userData.expoPushToken;
    
    if (!token || typeof token !== 'string' || !token.trim()) {
      logger.info("No valid Expo token for user:", userId);
      // Still create in-app notification even without push token
    }

    // ✅ CREATE IN-APP NOTIFICATION IMMEDIATELY
    const notificationData = {
      userId: userId,
      reportId: reportId,
      title: title,
      body: body,
      type: data.type || 'sos_update',
      priority: 'high',
      status: 'unread',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      data: {
        ...data,
        timestamp: new Date().toISOString()
      },
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      )
    };

    await admin.firestore().collection("notifications").add(notificationData);
    logger.info(`✅ In-app notification created for user ${userId}: ${title}`);

    // ✅ SEND PUSH NOTIFICATION IMMEDIATELY (if token exists)
    if (token && token.trim()) {
      const message = {
        to: token,
        sound: 'default',
        title: title,
        body: body,
        data: {
          ...data,
          timestamp: Date.now()
        },
        channelId: 'sos_updates',
        priority: 'high',
        ttl: 86400 // 24 hours
      };

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

      if (response.ok) {
        logger.info(`✅ Push notification sent to user ${userId}`);
      } else {
        logger.error(`❌ Push notification failed for user ${userId}`);
      }
    }

  } catch (error) {
    logger.error("Error sending immediate user notification:", error);
  }
}

function canCreatePatientForm(userRole, assignedAgency) {
  // ✅ ONLY CDRRMO team can create patient forms
  const isCDRRMOTeam = userRole === 'admin' || 
                       userRole === 'monitor' || 
                       (userRole === 'rescuer' && assignedAgency === 'CDRRMO');
  
  return isCDRRMOTeam;
}


exports.canCreatePatientForm = onCall({
    region: "asia-southeast1", 
    cors: true
}, async (request) => {
    if (!request.auth) throw new Error("Authentication required");
    
    const { reportId } = request.data;
    if (!reportId) throw new Error("Report ID required");

    const userDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    const reportDoc = await admin.firestore().collection("incident_reports").doc(reportId).get();
    const reportData = reportDoc.data();

    // ✅ CDRRMO TEAM ONLY (admin, monitor, rescuer)
    const canCreate = (userData.role === 'admin' || 
                      userData.role === 'monitor' || 
                      userData.role === 'rescuer');

    return { 
        canCreate: canCreate,
        userRole: userData.role,
        reportStatus: reportData.status,
        hasPatientForm: reportData.hasPatientForm || false
    };
});

exports.createPatientForm = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { reportId, patientData } = request.data;
  
  if (!reportId || !patientData) {
    throw new functions.https.HttpsError('invalid-argument', 'Report ID and patient data required');
  }

  // Check user role and permissions
  const userDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
  const userData = userDoc.data();
  const reportDoc = await admin.firestore().collection('incident_reports').doc(reportId).get();
  const reportData = reportDoc.data();

  // ✅ CDRRMO TEAM ONLY (admin, monitor, rescuer) - Agency CANNOT create
  const canCreate = ['admin', 'monitor', 'rescuer'].includes(userData.role);
  
  if (!canCreate) {
    throw new functions.https.HttpsError('permission-denied', 'Only CDRRMO team can create patient forms');
  }

  // Verify report is resolved
  if (reportData.status !== 'resolved') {
    throw new functions.https.HttpsError('failed-precondition', 'Can only create patient form for resolved incidents');
  }

  try {
    const patientForm = {
      reportId: reportId,
      patientData: patientData,
      status: 'completed',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: request.auth.uid,
      createdByName: userData.name,
      incidentType: reportData.incidentType || reportData.emergencyType,
      location: reportData.location,
      // Medical details
      vitalSigns: patientData.vitalSigns || {},
      injuries: patientData.injuries || [],
      treatment: patientData.treatment || [],
      disposition: patientData.disposition || {}
    };

    const patientFormRef = await admin.firestore().collection('patient_forms').add(patientForm);

    // Update report to mark patient form as completed
    await admin.firestore().collection('incident_reports').doc(reportId).update({
      hasPatientForm: true,
      patientFormId: patientFormRef.id,
      patientFormCompletedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      message: 'Patient form created successfully',
      patientFormId: patientFormRef.id
    };

  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

exports.getCDRRMORescuers = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  try {
    console.log("🔄 Starting getCDRRMORescuers function...");

    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const db = admin.firestore();
    
    // Get all active rescuers
    const rescuersQuery = db
      .collection("users")
      .where("role", "==", "rescuer")
      .where("status", "==", "active");

    const snapshot = await rescuersQuery.get();
    console.log(`📊 Found ${snapshot.size} rescuers total`);
    
    const rescuers = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      
      console.log(`✅ Rescuer found: ${data.name}`, {
        id: doc.id,
        currentAssignment: data.currentAssignment,
        rescuerStatus: data.rescuerStatus
      });

      rescuers.push({
        id: doc.id,
        name: data.name || 'Unknown Rescuer',
        status: data.rescuerStatus || 'available',
        phoneNumber: data.phoneNumber || data.phone || data.number || 'N/A',
        barangay: data.barangay || 'Unknown',
        currentAssignment: data.currentAssignment || null,
        isAvailable: !data.currentAssignment && (data.rescuerStatus !== 'busy'),
        agency: data.agency || 'CDRRMO',
        email: data.email || 'No email'
      });
    });

    console.log(`✅ Final rescuers: ${rescuers.length}`);

    return {
      success: true,
      rescuers: rescuers,
      count: rescuers.length,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error("❌ Error in getCDRRMORescuers:", error);
    throw new functions.https.HttpsError('internal', `Failed to fetch rescuers: ${error.message}`);
  }
});

exports.getSupportAgencies = onCall({
    region: "asia-southeast1",
    cors: true
}, async (request) => {
    try {
        console.log("🔄 Loading support agencies...");

        if (!request.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
        }

        const db = admin.firestore();
        
        // Get all agency users
        const agenciesQuery = db
            .collection("users")
            .where("role", "==", "agency")
            .where("status", "==", "active");

        const snapshot = await agenciesQuery.get();
        console.log(`📊 Found ${snapshot.size} agencies`);
        
        const agencies = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            
            agencies.push({
                id: doc.id,
                name: data.agencyName || data.name || 'Unknown Agency',
                email: data.email || 'No email',
                phoneNumber: data.phoneNumber || data.phone || data.number || 'N/A',
                barangay: data.barangay || 'Unknown'
            });
        });

        // Add default agencies kung walang nahanap
        if (agencies.length === 0) {
            console.log("ℹ️ No agencies found, adding defaults");
            agencies.push(
                {
                    id: 'default-bfp',
                    name: 'BFP Lipa Fire Station',
                    email: 'bfp_lipa@lipa.gov.ph',
                    phoneNumber: '(043) 756-1111',
                    barangay: 'Lipa City'
                },
                {
                    id: 'default-pnp',
                    name: 'PNP Lipa Police Station', 
                    email: 'pnp_lipa@lipa.gov.ph',
                    phoneNumber: '(043) 756-2222',
                    barangay: 'Lipa City'
                }
            );
        }

        console.log(`✅ Final agencies: ${agencies.length}`, agencies);

        return {
            success: true,
            agencies: agencies,
            count: agencies.length,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error("❌ Error loading agencies:", error);
        throw new functions.https.HttpsError('internal', `Failed to fetch agencies: ${error.message}`);
    }
});

/* ===================================================================
   COMPLETE INCIDENT FLOW FUNCTIONS - UPDATED FOR SOS & REPORT
=================================================================== */

// ✅ DAGDAG: VERIFY INCIDENT (Admin/Monitor only)
exports.verifyIncident = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { reportId } = request.data;
  
  if (!reportId) {
    throw new functions.https.HttpsError('invalid-argument', 'Report ID required');
  }

  // Check if user has admin/monitor role
  const userDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
  const userData = userDoc.data();
  
  if (!['admin', 'monitor'].includes(userData.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Admin/Monitor role required');
  }

  try {
    await admin.firestore().collection('incident_reports').doc(reportId).update({
      status: 'verified',
      verifiedBy: request.auth.uid,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdatedBy: request.auth.uid
    });

    return {
      success: true,
      message: 'Incident verified successfully'
    };

  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});
exports.assignToAgency = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { reportId, mainAgency, partnerAgencyId, partnerAgencyName } = request.data;
  
  if (!reportId || !mainAgency) {
    throw new functions.https.HttpsError('invalid-argument', 'Report ID and main agency required');
  }

  try {
    // ✅ VERIFY USER PERMISSIONS
    const userDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    
    if (!['admin', 'monitor'].includes(userData.role)) {
      throw new functions.https.HttpsError('permission-denied', 'Admin/Monitor role required');
    }

    // ✅ VERIFY REPORT EXISTS
    const reportDoc = await admin.firestore().collection('incident_reports').doc(reportId).get();
    if (!reportDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Report not found');
    }

    const updateData = {
      status: 'assigned',
      mainCoordinator: mainAgency,
      mainCoordinatorName: mainAgency,
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      assignedBy: request.auth.uid,
      lastUpdatedBy: request.auth.uid,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };

    // ✅ IF PARTNER AGENCY ASSIGNED
    if (partnerAgencyId && partnerAgencyId !== 'none') {
      const agencyDoc = await admin.firestore().collection('users').doc(partnerAgencyId).get();
      
      if (!agencyDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Partner agency not found');
      }

      const agencyData = agencyDoc.data();
      
      if (agencyData.role !== 'agency') {
        throw new functions.https.HttpsError('invalid-argument', 'Selected user is not an agency');
      }

      // ✅ CHECK IF AGENCY IS AVAILABLE
      if (agencyData.currentAssignment && agencyData.agencyStatus === 'busy') {
        throw new functions.https.HttpsError('failed-precondition', 
          `Agency is busy with incident: ${agencyData.currentAssignment}`);
      }

      updateData.partnerAgency = partnerAgencyName || agencyData.agencyName || agencyData.name;
      updateData.partnerAgencyId = partnerAgencyId;
      updateData.partnerAgencyStatus = 'assigned';
      updateData.partnerAssignedAt = admin.firestore.FieldValue.serverTimestamp();
      
      // ✅ MARK AGENCY AS BUSY
      await admin.firestore().collection('users').doc(partnerAgencyId).update({
        currentAssignment: reportId,
        agencyStatus: 'busy',
        isAvailable: false,
        lastAssignment: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // ✅ SEND NOTIFICATION TO AGENCY
      await sendAgencyAssignmentNotification(partnerAgencyId, reportId, agencyData);
      
      console.log(`✅ Partner agency ${partnerAgencyName} assigned and marked as busy`);
    }

    await admin.firestore().collection('incident_reports').doc(reportId).update(updateData);

    return {
      success: true,
      message: `Incident assigned to ${mainAgency}${partnerAgencyId ? ' with partner agency' : ''}`,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error in assignToAgency:', error);
    throw error;
  }
});

exports.migrateAvailabilityFields = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  try {
    console.log("🔄 Starting availability migration...");
    
    const db = admin.firestore();
    const batch = db.batch();
    let rescuerCount = 0;
    let agencyCount = 0;

    // =================== MIGRATE RESCUERS ===================
    const rescuersSnapshot = await db.collection("users")
      .where("role", "==", "rescuer")
      .get();

    console.log(`📋 Found ${rescuersSnapshot.size} rescuers`);

    rescuersSnapshot.forEach(doc => {
      const data = doc.data();
      
      // Calculate availability based on existing data
      const hasAssignment = data.currentAssignment != null;
      const statusIsBusy = data.rescuerStatus === 'busy';
      const shouldBeAvailable = !hasAssignment && !statusIsBusy;
      
      const updates = {
        isAvailable: shouldBeAvailable,
        rescuerStatus: hasAssignment ? 'busy' : (data.rescuerStatus || 'available')
      };
      
      // If busy but no assignment, clear it
      if (!hasAssignment && statusIsBusy) {
        updates.rescuerStatus = 'available';
        updates.isAvailable = true;
        updates.currentAssignment = null;
      }
      
      batch.update(doc.ref, updates);
      rescuerCount++;
      
      console.log(`✅ Rescuer: ${data.name} - isAvailable: ${shouldBeAvailable}`);
    });

    // =================== MIGRATE AGENCIES ===================
    const agenciesSnapshot = await db.collection("users")
      .where("role", "==", "agency")
      .get();

    console.log(`📋 Found ${agenciesSnapshot.size} agencies`);

    agenciesSnapshot.forEach(doc => {
      const data = doc.data();
      
      const updates = {
        isAvailable: true, // All agencies available by default
        agencyStatus: data.agencyStatus || 'available',
        currentAssignment: data.currentAssignment || null
      };
      
      batch.update(doc.ref, updates);
      agencyCount++;
      
      console.log(`✅ Agency: ${data.agencyName || data.name} - Available`);
    });

    // Commit all updates
    await batch.commit();

    console.log(`✅ Migration complete: ${rescuerCount} rescuers, ${agencyCount} agencies`);

    return {
      success: true,
      message: `Migration complete`,
      rescuers: rescuerCount,
      agencies: agencyCount
    };

  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw new functions.https.HttpsError('internal', `Migration failed: ${error.message}`);
  }
});


async function sendAgencyAssignmentNotification(agencyUserId, reportId, agencyData) {
  try {
    console.log(`📧 Sending notification to agency user: ${agencyUserId}`);

    // Get report details
    const reportDoc = await admin.firestore().collection('incident_reports').doc(reportId).get();
    const reportData = reportDoc.data();

    // ✅ CREATE IN-APP NOTIFICATION
    await admin.firestore().collection('notifications').add({
      userId: agencyUserId,
      reportId: reportId,
      title: '🚨 New Emergency Assignment',
      body: `You've been assigned as support for ${reportData.emergencyType || 'incident'} in ${reportData.barangay || 'Lipa City'}. CDRRMO is the main coordinator.`,
      type: 'agency_assignment',
      priority: 'high',
      status: 'unread',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      data: {
        reportId: reportId,
        emergencyType: reportData.emergencyType,
        barangay: reportData.barangay,
        mainCoordinator: reportData.mainCoordinator,
        actionRequired: true
      },
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      )
    });

    console.log(`✅ In-app notification created for agency ${agencyUserId}`);

    // ✅ SEND PUSH NOTIFICATION
    const expoPushToken = agencyData.expoPushToken;
    
    if (expoPushToken && typeof expoPushToken === 'string' && expoPushToken.trim()) {
      const message = {
        to: expoPushToken,
        sound: 'default',
        title: '🚨 Emergency Assignment',
        body: `${reportData.emergencyType || 'Emergency'} in ${reportData.barangay || 'Lipa City'}. CDRRMO needs your support.`,
        data: {
          type: 'agency_assignment',
          reportId: reportId,
          emergencyType: reportData.emergencyType,
          timestamp: Date.now()
        },
        channelId: 'agency_assignments',
        priority: 'high',
        ttl: 3600
      };

      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });

      if (response.ok) {
        console.log(`✅ Push notification sent to agency ${agencyUserId}`);
      } else {
        console.error(`❌ Push notification failed: ${response.status}`);
      }
    } else {
      console.log(`⚠️ No push token for agency ${agencyUserId}`);
    }

  } catch (error) {
    console.error('❌ Error sending agency notification:', error);
    // Don't throw - notification failure shouldn't break assignment
  }
}
exports.updatePartnerAgencyStatus = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  
  const { reportId, status } = request.data;
  
  if (!reportId || !status) {
    throw new functions.https.HttpsError('invalid-argument', 'Report ID and status required');
  }

  try {
    console.log('🔍 Agency status update request:', {
      reportId,
      status,
      userId: request.auth.uid
    });

    // ✅ GET USER DATA
    const userDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    
    if (!userData) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    console.log('👤 User data:', {
      uid: request.auth.uid,
      role: userData.role,
      agencyName: userData.agencyName
    });

    // ✅ VERIFY USER IS AN AGENCY
    if (userData.role !== 'agency') {
      throw new functions.https.HttpsError('permission-denied', 'Only agencies can update agency status');
    }

    // ✅ GET REPORT DATA
    const reportDoc = await admin.firestore().collection("incident_reports").doc(reportId).get();
    
    if (!reportDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Report not found');
    }

    const reportData = reportDoc.data();

    console.log('📋 Report data:', {
      reportId,
      partnerAgency: reportData.partnerAgency,
      partnerAgencyId: reportData.partnerAgencyId,
      mainCoordinator: reportData.mainCoordinator
    });

    // ✅ FLEXIBLE PERMISSION CHECK - Check BOTH ID and NAME
    const isAssignedById = reportData.partnerAgencyId === request.auth.uid;
    const isAssignedByName = reportData.partnerAgency === userData.agencyName;
    
    if (!isAssignedById && !isAssignedByName) {
      console.log('❌ Permission denied:', {
        reportPartnerAgencyId: reportData.partnerAgencyId,
        reportPartnerAgency: reportData.partnerAgency,
        requestingUserId: request.auth.uid,
        requestingAgencyName: userData.agencyName,
        matchById: isAssignedById,
        matchByName: isAssignedByName
      });
      throw new functions.https.HttpsError('permission-denied', 
        `You are not assigned to this report. Assigned agency: ${reportData.partnerAgency || 'None'}`);
    }

    console.log('✅ Permission granted:', isAssignedById ? 'by ID' : 'by name');

    // ✅ VALIDATE STATUS
    const validStatuses = ['dispatched', 'on_scene', 'completed'];
    if (!validStatuses.includes(status)) {
      throw new functions.https.HttpsError('invalid-argument', 
        `Invalid status. Must be: ${validStatuses.join(', ')}`);
    }

    // ✅ UPDATE REPORT
    const updateData = {
      partnerAgencyStatus: status,
      partnerStatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdatedBy: request.auth.uid
    };

    // ✅ IF COMPLETED - MARK AGENCY AS AVAILABLE
    if (status === 'completed') {
      await admin.firestore().collection('users').doc(request.auth.uid).update({
        currentAssignment: null,
        agencyStatus: 'available',
        isAvailable: true,
        lastAvailable: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('✅ Agency marked as available');
    }

    await admin.firestore().collection("incident_reports").doc(reportId).update(updateData);

    // ✅ NOTIFY ADMINS
    await notifyAdminsAboutAgencyStatusChange(reportId, reportData, status, userData);

    console.log('✅ Agency status updated successfully:', {
      reportId,
      agencyId: request.auth.uid,
      agencyName: userData.agencyName,
      newStatus: status
    });

    return { 
      success: true, 
      message: `Status updated to ${status}`,
      canCreatePatientForm: false
    };

  } catch (error) {
    console.error('❌ Error in updatePartnerAgencyStatus:', error);
    
    if (error.code === 'permission-denied' || 
        error.code === 'not-found' || 
        error.code === 'invalid-argument' ||
        error.code === 'unauthenticated') {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', `Failed to update agency status: ${error.message}`);
  }
});

// =================== 4. NOTIFY ADMINS ABOUT AGENCY STATUS CHANGES ===================
async function notifyAdminsAboutAgencyStatusChange(reportId, reportData, newStatus, agencyData) {
  try {
    const adminsSnapshot = await admin.firestore()
      .collection("users")
      .where("role", "in", ["admin", "monitor"])
      .where("status", "==", "active")
      .get();

    const statusEmojis = {
      'dispatched': '🚗',
      'on_scene': '📍',
      'completed': '✅'
    };

    const emoji = statusEmojis[newStatus] || '📋';

    for (const adminDoc of adminsSnapshot.docs) {
      // In-app notification
      await admin.firestore().collection("notifications").add({
        userId: adminDoc.id,
        reportId: reportId,
        title: `${emoji} Agency Status Update`,
        body: `${agencyData.agencyName || 'Partner Agency'} is now ${newStatus.replace('_', ' ')} for ${reportData.emergencyType || 'incident'} in ${reportData.barangay || 'Lipa City'}`,
        type: "agency_status_update",
        priority: "normal",
        status: "unread",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        data: {
          reportId: reportId,
          agencyName: agencyData.agencyName,
          agencyStatus: newStatus,
          emergencyType: reportData.emergencyType
        }
      });
    }

    console.log(`✅ Notified ${adminsSnapshot.size} admins about agency status change`);

  } catch (error) {
    console.error('❌ Error notifying admins:', error);
    // Don't throw - notification failure shouldn't break status update
  }
}
exports.getAvailableAgencies = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  try {
    console.log("🔄 Loading agencies...");

    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    // ✅ CHECK USER ROLE PERMISSION
    const userDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    
    // ✅ ONLY ADMIN/MONITOR CAN SEE ALL AGENCIES
    if (userData.role !== 'admin' && userData.role !== 'monitor') {
      throw new functions.https.HttpsError('permission-denied', 'Only admin/monitor can view all agencies');
    }

    const db = admin.firestore();
    
    // Get all active agency users
    const agenciesQuery = db
      .collection("users")
      .where("role", "==", "agency")
      .where("status", "==", "active");

    const snapshot = await agenciesQuery.get();
    console.log(`📊 Found ${snapshot.size} agency users`);
    
    const agencies = [];
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      // ✅ CALCULATE REAL AVAILABILITY
      const hasAssignment = data.currentAssignment != null && data.currentAssignment !== '';
      const statusIsBusy = data.agencyStatus === 'busy';
      const isAvailable = !hasAssignment && !statusIsBusy;
      
      console.log(`🏢 ${data.agencyName || data.name}:`, {
        currentAssignment: data.currentAssignment || 'none',
        agencyStatus: data.agencyStatus || 'available',
        calculated: isAvailable ? 'AVAILABLE' : 'BUSY'
      });

      agencies.push({
        id: doc.id,
        name: data.agencyName || data.name || 'Unknown Agency',
        email: data.email || 'No email',
        phoneNumber: data.phoneNumber || data.phone || data.number || 'N/A',
        barangay: data.barangay || 'Unknown',
        status: data.agencyStatus || 'available',
        currentAssignment: data.currentAssignment || null,
        isAvailable: isAvailable // ✅ REAL AVAILABILITY
      });
    }

    // Sort: Available first
    agencies.sort((a, b) => {
      if (a.isAvailable && !b.isAvailable) return -1;
      if (!a.isAvailable && b.isAvailable) return 1;
      return 0;
    });

    const availableCount = agencies.filter(a => a.isAvailable).length;
    console.log(`✅ ${availableCount}/${agencies.length} agencies available`);

    return {
      success: true,
      agencies: agencies,
      count: agencies.length,
      availableCount: availableCount,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error("❌ Error loading agencies:", error);
    throw new functions.https.HttpsError('internal', `Failed to fetch agencies: ${error.message}`);
  }
}); 
exports.updateRescuerStatus = onCall({
  region: "asia-southeast1", 
  cors: true
}, async (request) => {
  if (!request.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  
  const { reportId, status, notes } = request.data;
  if (!reportId || !status) throw new functions.https.HttpsError('invalid-argument', 'Report ID and status required');

  try {
    const userDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    const reportDoc = await admin.firestore().collection("incident_reports").doc(reportId).get();
    
    if (!reportDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Report not found');
    }
    
    const reportData = reportDoc.data();
    
    // ✅ PERMISSION CHECK: Assigned rescuer OR admin/monitor
    const isAssignedRescuer = reportData.assignedRescuer === request.auth.uid;
    const isAdminMonitor = ['admin', 'monitor'].includes(userData.role);
    
    if (!isAssignedRescuer && !isAdminMonitor) {
      throw new functions.https.HttpsError('permission-denied', 'Only assigned rescuer or admin can update');
    }

    // ✅ VALIDATE STATUS
    const validStatuses = ['on_the_way', 'on_scene', 'resolved'];
    if (!validStatuses.includes(status)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid status. Must be: on_the_way, on_scene, or resolved');
    }

    const updateData = {
      rescuerStatus: status,
      rescuerStatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdatedBy: request.auth.uid
    };

    if (notes) {
      updateData.rescuerNotes = notes;
    }

    // ✅ IF RESOLVED - MARK AS AVAILABLE AND UPDATE REPORT STATUS
    if (status === 'resolved') {
      updateData.status = 'resolved';
      updateData.resolvedAt = admin.firestore.FieldValue.serverTimestamp();
      updateData.resolvedBy = request.auth.uid;
      
      // ✅ MARK RESCUER AS AVAILABLE
      await admin.firestore().collection('users').doc(request.auth.uid).update({
        currentAssignment: null,
        rescuerStatus: 'available',
        isAvailable: true,
        lastAvailable: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`✅ Rescuer ${request.auth.uid} marked AVAILABLE after resolving ${reportId}`);
    }

    await admin.firestore().collection("incident_reports").doc(reportId).update(updateData);

    return { 
      success: true, 
      message: `Status updated to ${status}`,
      requiresPatientForm: status === 'resolved'
    };

  } catch (error) {
    console.error('❌ Error updating status:', error);
    throw error;
  }
});

async function sendRescuerNotification(rescuerId, reportId, reportData, destination) {
  try {
    const rescuerDoc = await admin.firestore().collection('users').doc(rescuerId).get();
    const rescuerData = rescuerDoc.data();
    const token = rescuerData.expoPushToken;

    // In-app notification
    await admin.firestore().collection('notifications').add({
      userId: rescuerId,
      reportId: reportId,
      title: '🚨 New Emergency Assignment',
      body: `${reportData.emergencyType} in ${destination.barangay}. Tap for directions.`,
      type: 'rescuer_assignment',
      priority: 'high',
      status: 'unread',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      data: {
        reportId: reportId,
        destination: destination,
        hasRouting: true
      }
    });

    // Push notification
    if (token) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: token,
          title: '🚨 Emergency Assignment',
          body: `${reportData.emergencyType} in ${destination.barangay}`,
          data: {
            type: 'rescuer_assignment',
            reportId: reportId,
            destination: destination
          },
          priority: 'high'
        })
      });
    }

    console.log(`✅ Notification sent to rescuer ${rescuerId}`);
  } catch (error) {
    console.error('❌ Notification error:', error);
  }
}

async function sendStatusUpdateToUser(userId, reportId, status, reportData) {
  const statusMessages = {
    'on_the_way': {
      title: '🚗 Rescuer On The Way',
      body: `Your rescuer is heading to ${reportData.barangay}. Help is coming!`
    },
    'on_scene': {
      title: '📍 Rescuer Arrived',
      body: `The rescuer has arrived at your location in ${reportData.barangay}.`
    },
    'resolved': {
      title: '✅ Emergency Resolved',
      body: `Your emergency has been successfully resolved by the response team.`
    }
  };

  const config = statusMessages[status];
  if (!config) return;

  // In-app notification
  await admin.firestore().collection('notifications').add({
    userId: userId,
    reportId: reportId,
    title: config.title,
    body: config.body,
    type: 'rescuer_status_update',
    priority: 'high',
    status: 'unread',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    data: {
      reportId: reportId,
      rescuerStatus: status,
      emergencyType: reportData.emergencyType
    }
  });

  // Push notification
  const userDoc = await admin.firestore().collection('users').doc(userId).get();
  const userData = userDoc.data();
  const token = userData.expoPushToken;

  if (token && typeof token === 'string' && token.trim()) {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        title: config.title,
        body: config.body,
        data: {
          type: 'rescuer_status_update',
          reportId: reportId,
          rescuerStatus: status
        },
        priority: 'high'
      }),
    });
  }
}
exports.getCDRRMORescuers = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  try {
    console.log("🔄 Starting getCDRRMORescuers function...");

    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    // ✅ CHECK USER ROLE PERMISSION
    const userDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    
    // ✅ ONLY ADMIN/MONITOR CAN SEE ALL RESCUERS
    if (userData.role !== 'admin' && userData.role !== 'monitor') {
      throw new functions.https.HttpsError('permission-denied', 'Only admin/monitor can view all rescuers');
    }

    const db = admin.firestore();
    
    // Get all active rescuers
    const rescuersQuery = db
      .collection("users")
      .where("role", "==", "rescuer")
      .where("status", "==", "active");

    const snapshot = await rescuersQuery.get();
    console.log(`📊 Found ${snapshot.size} rescuers total`);
    
    const rescuers = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      
      console.log(`✅ Rescuer found: ${data.name}`, {
        id: doc.id,
        currentAssignment: data.currentAssignment,
        rescuerStatus: data.rescuerStatus
      });

      // ✅ CALCULATE REAL AVAILABILITY
      const hasAssignment = data.currentAssignment != null && data.currentAssignment !== '';
      const statusIsBusy = data.rescuerStatus === 'busy';
      const isAvailable = !hasAssignment && !statusIsBusy;

      rescuers.push({
        id: doc.id,
        name: data.name || 'Unknown Rescuer',
        status: data.rescuerStatus || 'available',
        phoneNumber: data.phoneNumber || data.phone || data.number || 'N/A',
        barangay: data.barangay || 'Unknown',
        currentAssignment: data.currentAssignment || null,
        isAvailable: isAvailable, // ✅ REAL AVAILABILITY
        agency: data.agency || 'CDRRMO',
        email: data.email || 'No email'
      });
    });

    console.log(`✅ Final rescuers: ${rescuers.length}`);

    return {
      success: true,
      rescuers: rescuers,
      count: rescuers.length,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error("❌ Error in getCDRRMORescuers:", error);
    throw new functions.https.HttpsError('internal', `Failed to fetch rescuers: ${error.message}`);
  }
});

exports.assignCDRRMORescuer = onCall({
    region: "asia-southeast1",
    cors: true
}, async (request) => {
    if (!request.auth) throw new Error("Authentication required");
    
    const { reportId, rescuerId } = request.data;
    if (!reportId || !rescuerId) throw new Error("Report ID and rescuer ID required");

    const userDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    
    // Only Admin/Monitor can assign
    if (userData.role !== 'admin' && userData.role !== 'monitor') {
        throw new Error("Only admins and monitors can assign rescuers");
    }

    // Verify rescuer exists and is CDRRMO
    const rescuerDoc = await admin.firestore().collection('users').doc(rescuerId).get();
    const rescuerData = rescuerDoc.data();
    
    if (!rescuerDoc.exists || rescuerData.role !== 'rescuer' || rescuerData.agency !== 'CDRRMO') {
        throw new Error("Invalid CDRRMO rescuer");
    }

   const updateData = {
      assignedRescuer: rescuerId,
      assignedRescuerName: rescuerData.name,
      rescuerStatus: 'assigned',
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdatedBy: request.auth.uid,
      destination: destinationInfo
    };

    // Only add phone if it exists
    const rescuerPhone = rescuerData.phoneNumber || rescuerData.phone || rescuerData.number;
    if (rescuerPhone) {
      updateData.assignedRescuerPhone = rescuerPhone;
    }

    await admin.firestore().collection("incident_reports").doc(reportId).update(updateData);

    return { 
        success: true, 
        message: `CDRRMO rescuer ${rescuerData.name} assigned to incident`,
        rescuerName: rescuerData.name
    };
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


// ✅ STEP 4.1: SMART DUPLICATE DETECTION FOR ADMIN (Handles Inconsistent Data)
exports.checkDuplicateAccount = onCall({
  region: "asia-southeast1",
  cors: true,
  memory: "256MiB",
  cpu: 0.5
}, async (request) => {
  try {
    const { email, phone, name, barangay } = request.data;
    
    if (!email) {
      throw new Error("Email is required for duplicate check");
    }

    logger.info('🔍 [SMART DUPLICATE CHECK] Starting:', { 
      email: email ? `${email.substring(0, 3)}...` : 'none',
      name: name ? `${name.substring(0, 10)}...` : 'none',
      barangay: barangay || 'none'
    });

    const duplicates = {
      email: false,
      phone: false,
      nameBarangay: false,
      existingUsers: [],
      suspendedUsers: []  // Track suspended/banned users
    };

    // =================== 1. ENHANCED EMAIL CHECK ===================
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      
      const emailQuery = await admin.firestore()
        .collection("users")
        .where("email", ">=", normalizedEmail)
        .where("email", "<=", normalizedEmail + '\uf8ff')
        .limit(5)
        .get();

      if (!emailQuery.empty) {
        duplicates.email = true;
        emailQuery.docs.forEach(doc => {
          const userData = doc.data();
          const userInfo = {
            id: doc.id,
            name: userData.name || 'Unknown',
            email: userData.email,
            barangay: userData.barangay || 'Unknown',
            status: userData.status || 'unknown',
            role: userData.role || 'resident',
            phone: userData.phone || userData.number || userData.phoneNumber || 'N/A',
            matchType: 'email',
            isSuspended: ['suspended', 'suspended_3d', 'suspended_2w', 'banned'].includes(userData.status),
            suspensionReason: userData.suspensionReason || userData.lastViolationReason,
            strikes: userData.strikes || 0,
            warnings: userData.warnings || 0
          };
          
          duplicates.existingUsers.push(userInfo);
          
          if (userInfo.isSuspended) {
            duplicates.suspendedUsers.push(userInfo);
          }
        });
        logger.info('📧 Email duplicates found:', emailQuery.size);
      }
    }

    // =================== 2. ENHANCED PHONE CHECK ===================
    if (phone) {
      // Normalize phone (remove all non-digit characters)
      const normalizedPhone = phone.replace(/\D/g, '');
      
      // Check ALL possible phone fields in Firestore
      const allUsersSnapshot = await admin.firestore()
        .collection("users")
        .limit(100) // Reasonable limit for performance
        .get();

      if (!allUsersSnapshot.empty) {
        allUsersSnapshot.docs.forEach(doc => {
          const userData = doc.data();
          
          // Check all possible phone fields
          const userPhones = [
            userData.number,
            userData.phone, 
            userData.phoneNumber
          ].filter(Boolean); // Remove empty values

          // Normalize each phone and check for match
          const hasPhoneMatch = userPhones.some(userPhone => {
            if (!userPhone) return false;
            const normalizedUserPhone = userPhone.replace(/\D/g, '');
            return normalizedUserPhone === normalizedPhone;
          });

          if (hasPhoneMatch) {
            duplicates.phone = true;
            const existingIndex = duplicates.existingUsers.findIndex(u => u.id === doc.id);
            
            if (existingIndex === -1) {
              const userInfo = {
                id: doc.id,
                name: userData.name || 'Unknown',
                email: userData.email,
                barangay: userData.barangay || 'Unknown',
                status: userData.status || 'unknown',
                role: userData.role || 'resident',
                phone: userData.phone || userData.number || userData.phoneNumber || 'N/A',
                matchType: 'phone',
                isSuspended: ['suspended', 'suspended_3d', 'suspended_2w', 'banned'].includes(userData.status),
                suspensionReason: userData.suspensionReason || userData.lastViolationReason,
                strikes: userData.strikes || 0,
                warnings: userData.warnings || 0
              };
              
              duplicates.existingUsers.push(userInfo);
              
              if (userInfo.isSuspended) {
                duplicates.suspendedUsers.push(userInfo);
              }
            } else {
              duplicates.existingUsers[existingIndex].matchType += '+phone';
            }
          }
        });
        
        if (duplicates.phone) {
          logger.info('📞 Phone duplicates found');
        }
      }
    }

    // =================== 3. ENHANCED NAME + BARANGAY CHECK ===================
    if (name && barangay) {
      // Get users from the same barangay
      const barangayUsersQuery = await admin.firestore()
        .collection("users")
        .where("barangay", "==", barangay)
        .limit(50) // Reasonable limit
        .get();

      if (!barangayUsersQuery.empty) {
        const normalizedName = name.toLowerCase().trim().replace(/\s+/g, ' ');
        
        barangayUsersQuery.docs.forEach(doc => {
          const userData = doc.data();
          const existingName = (userData.name || '').toLowerCase().trim().replace(/\s+/g, ' ');
          
          // SIMPLE BUT EFFECTIVE NAME MATCHING
          if (existingName === normalizedName) {
            duplicates.nameBarangay = true;
            
            const existingIndex = duplicates.existingUsers.findIndex(u => u.id === doc.id);
            if (existingIndex === -1) {
              const userInfo = {
                id: doc.id,
                name: userData.name || 'Unknown',
                email: userData.email,
                barangay: userData.barangay || 'Unknown',
                status: userData.status || 'unknown',
                role: userData.role || 'resident',
                phone: userData.phone || userData.number || userData.phoneNumber || 'N/A',
                matchType: 'name+barangay',
                isSuspended: ['suspended', 'suspended_3d', 'suspended_2w', 'banned'].includes(userData.status),
                suspensionReason: userData.suspensionReason || userData.lastViolationReason,
                strikes: userData.strikes || 0,
                warnings: userData.warnings || 0
              };
              
              duplicates.existingUsers.push(userInfo);
              
              if (userInfo.isSuspended) {
                duplicates.suspendedUsers.push(userInfo);
              }
            } else {
              duplicates.existingUsers[existingIndex].matchType += '+name_location';
            }
          }
        });
        
        if (duplicates.nameBarangay) {
          logger.info('👤 Name+Barangay duplicates found');
        }
      }
    }

    const hasDuplicates = duplicates.email || duplicates.phone || duplicates.nameBarangay;
    const hasSuspendedDuplicates = duplicates.suspendedUsers.length > 0;

    logger.info('📊 [SMART DUPLICATE CHECK] Final results:', {
      hasDuplicates,
      hasSuspendedDuplicates,
      emailDuplicate: duplicates.email,
      phoneDuplicate: duplicates.phone,
      nameBarangayDuplicate: duplicates.nameBarangay,
      totalUsers: duplicates.existingUsers.length,
      suspendedUsers: duplicates.suspendedUsers.length
    });

    return {
      success: true,
      hasDuplicates,
      hasSuspendedDuplicates,
      duplicates: duplicates,
      message: hasDuplicates ? 
        (hasSuspendedDuplicates ? 
          "Suspended/banned users found - registration blocked" : 
          "Potential duplicate accounts found") : 
        "No duplicates found",
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    logger.error('❌ [SMART DUPLICATE CHECK] Error:', error);
    throw new functions.https.HttpsError('internal', `Duplicate check failed: ${error.message}`);
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
    
    logger.info("=== OPENWEATHER FETCH START ===");
    logger.info("Fetching from:", url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      timeout: 15000
    });

    logger.info("Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("OpenWeather API Error:", errorText);
      throw new Error(`OpenWeather API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Log received data
    logger.info("OpenWeather data received:");
    logger.info(`- Weather: ${data.weather[0].main} - ${data.weather[0].description}`);
    logger.info(`- Temp: ${data.main.temp}°C (Feels like: ${data.main.feels_like}°C)`);
    logger.info(`- Humidity: ${data.main.humidity}%`);
    logger.info(`- Wind: ${data.wind.speed} m/s (${(data.wind.speed * 3.6).toFixed(1)} km/h)`);
    logger.info(`- Clouds: ${data.clouds?.all || 0}%`);
    logger.info(`- Rain (1h): ${data.rain?.["1h"] || 0} mm`);

    const alertData = processOpenWeatherData(data);
    
    if (alertData) {
      logger.info("Alert created:", alertData.title);
      await createPendingAlert(alertData);
    } else {
      logger.info("No severe conditions detected, creating status update");
      // ALWAYS CREATE AN ALERT (even for good weather) so admin sees activity
      await createPendingAlert({
        type: "weather",
        title: "Weather Update - Lipa City",
        description: `Current conditions: ${data.weather[0].description}. Temperature: ${Math.round(data.main.temp)}°C. Humidity: ${data.main.humidity}%. Wind: ${(data.wind.speed * 3.6).toFixed(1)} km/h. No severe weather detected.`,
        severity: "info",
        source: "OpenWeather",
        raw: data,
        location: {
          lat: LIPA_LAT,
          lon: LIPA_LON,
          city: "Lipa City",
          province: "Batangas"
        },
        metadata: {
          temperature: data.main.temp,
          feelsLike: data.main.feels_like,
          humidity: data.main.humidity,
          windSpeed: data.wind.speed * 3.6,
          cloudCover: data.clouds?.all || 0,
          pressure: data.main.pressure,
          weatherId: data.weather[0].id,
          weatherMain: data.weather[0].main,
          weatherDescription: data.weather[0].description
        }
      });
    }
    
    logger.info("=== OPENWEATHER FETCH COMPLETE ===");
    return data;
    
  } catch (error) {
    logger.error("=== OPENWEATHER FETCH FAILED ===");
    logger.error("Error message:", error.message);
    logger.error("Error stack:", error.stack);
    throw error;
  }
}

// Fetch USGS earthquake data

async function fetchUSGSEarthquakeData() {
  try {
    // Use bounding box query for better Lipa focus
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=${LIPA_BOUNDING_BOX.south}&maxlatitude=${LIPA_BOUNDING_BOX.north}&minlongitude=${LIPA_BOUNDING_BOX.west}&maxlongitude=${LIPA_BOUNDING_BOX.east}&minmagnitude=2.0&orderby=time&limit=15`;
    
    logger.info("=== USGS FETCH START (LIPA FOCUS) ===");
    logger.info("Fetching from:", url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      timeout: 15000
    });

    logger.info("USGS Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("USGS API Error:", errorText);
      throw new Error(`USGS API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    logger.info(`USGS Results: ${data.features.length} earthquakes found in Lipa region`);
    
    if (data.features.length === 0) {
      logger.info("No earthquakes detected in Lipa area - creating status update");
      await createPendingAlert({
        type: "earthquake",
        title: "🟢 Seismic Activity - Lipa City Normal",
        description: `No significant earthquakes detected within ${LIPA_RADIUS_KM}km of Lipa City. Seismic monitoring is active and no threats detected.`,
        source: "USGS",
        severity: "info",
        location: { 
          lat: LIPA_LAT, 
          lon: LIPA_LON,
          city: "Lipa City",
          province: "Batangas"
        }
      });
      return data;
    }
    
    let alertsCreated = 0;
    let duplicatesSkipped = 0;
    let outsideLipaSkipped = 0;
    
    // Process each earthquake with Lipa filtering
    for (const earthquake of data.features) {
      const eventId = earthquake.id;
      const coords = earthquake.geometry.coordinates;
      const distance = calculateDistance(LIPA_LAT, LIPA_LON, coords[1], coords[0]);
      
      // Skip if outside Lipa area
      if (distance > LIPA_RADIUS_KM) {
        outsideLipaSkipped++;
        continue;
      }
      
      // Check for duplicates (same event ID)
      const existingAlert = await admin.firestore()
        .collection("alerts")
        .where("eventId", "==", eventId)
        .limit(1)
        .get();
      
      if (!existingAlert.empty) {
        duplicatesSkipped++;
        logger.info(`Skipping duplicate: ${eventId}`);
        continue;
      }
      
      const alertData = processUSGSEarthquake(earthquake);
      if (alertData) {
        alertData.eventId = eventId;
        await createPendingAlert(alertData);
        alertsCreated++;
        
        const props = earthquake.properties;
        logger.info(`Created Lipa alert: M${props.mag.toFixed(1)} - ${props.place} (${distance.toFixed(1)}km)`);
      }
    }

    logger.info(`Lipa alerts: ${alertsCreated} created, ${duplicatesSkipped} duplicates, ${outsideLipaSkipped} outside area`);
    logger.info("=== USGS FETCH COMPLETE (LIPA FOCUS) ===");
    
    return data;
    
  } catch (error) {
    logger.error("=== USGS FETCH FAILED ===");
    logger.error("Error message:", error.message);
    logger.error("Stack:", error.stack);
    throw error;
  }
}


// Enhanced earthquake processing for Lipa area only
function processUSGSEarthquake(earthquake) {
  const props = earthquake.properties;
  const coords = earthquake.geometry.coordinates;
  const magnitude = props.mag;
  const depth = Math.abs(coords[2]);
  const place = props.place;

  // Calculate distance from Lipa City
  const distance = calculateDistance(LIPA_LAT, LIPA_LON, coords[1], coords[0]);
  
  // ONLY PROCESS EARTHQUAKES WITHIN LIPA AREA (50km radius)
  if (distance > LIPA_RADIUS_KM) {
    logger.info(`Skipping earthquake ${earthquake.id} - outside Lipa area: ${distance.toFixed(1)}km`);
    return null;
  }

  // Check if within Lipa bounding box for more precise filtering
  if (!isWithinLipaArea(coords[1], coords[0])) {
    logger.info(`Skipping earthquake ${earthquake.id} - outside Lipa bounding box`);
    return null;
  }

  if (magnitude < 2.5) return null;

  let severity, title, description;

  // Enhanced titles with Lipa-specific context
  if (magnitude >= 6.0) {
    severity = "danger";
    title = `🔴 MAJOR EARTHQUAKE - M${magnitude.toFixed(1)} - LIPA CITY`;
    description = `MAJOR earthquake detected! M${magnitude.toFixed(1)} at ${place}. Distance: ${distance.toFixed(0)}km from Lipa City Center. Check for damage, expect aftershocks.`;
  } else if (magnitude >= 5.0) {
    severity = "warning";
    title = `🟠 Strong Earthquake - M${magnitude.toFixed(1)} - Near Lipa`;
    description = `Strong earthquake. M${magnitude.toFixed(1)} at ${place}. Distance: ${distance.toFixed(0)}km from Lipa City. Take cover, be alert for aftershocks.`;
  } else if (magnitude >= 4.0) {
    severity = "info";
    title = `🟡 Moderate Earthquake - M${magnitude.toFixed(1)} - Lipa Area`;
    description = `Moderate earthquake. M${magnitude.toFixed(1)} at ${place}. Distance: ${distance.toFixed(0)}km from Lipa City. Felt by residents.`;
  } else {
    severity = "info";
    title = `🔵 Minor Earthquake - M${magnitude.toFixed(1)} - Lipa Vicinity`;
    description = `Minor earthquake. M${magnitude.toFixed(1)} at ${place}. Distance: ${distance.toFixed(0)}km from Lipa. No significant damage expected.`;
  }

  return {
    type: "earthquake",
    title,
    description,
    source: "USGS",
    raw: earthquake,
    severity,
    location: {
      lat: coords[1],
      lon: coords[0],
      place: place,
      city: "Lipa City Area",
      distanceFromLipa: distance
    },
    magnitude,
    depth,
    time: props.time,
    distanceFromLipa: distance
  };
}


function processOpenWeatherData(data) {
  const weather = data.weather[0];
  const main = data.main;
  const wind = data.wind;
  const rain = data.rain || {};
  
  let alerts = [];

  // Lipa-specific weather thresholds
  const HOURLY_RAIN_HEAVY = 10; // mm/hr for Lipa flood risk
  const HOURLY_RAIN_MODERATE = 5; // mm/hr for Lipa
  const EXTREME_HEAT = 36; // °C for Lipa
  const STRONG_WIND = 45; // km/h for Lipa

  // 1. Thunderstorms - Lipa specific
  if (weather.id >= 200 && weather.id < 300) {
    alerts.push({
      type: "weather",
      title: "⚡ Thunderstorm - Lipa City",
      description: `Thunderstorm over Lipa City: ${weather.description}. Stay indoors, avoid open areas. Possible lightning and localized flooding in low-lying barangays.`,
      severity: "warning"
    });
  }

  // 2. Heavy Rain - Lipa flood risk areas
  const hourlyRain = rain["1h"] || 0;
  if (hourlyRain > HOURLY_RAIN_HEAVY) {
    alerts.push({
      type: "weather",
      title: "🌧️ Heavy Rain - Lipa Flood Alert",
      description: `Heavy rainfall in Lipa: ${hourlyRain.toFixed(1)}mm/hr. Flood risk in Antipolo, Tambo, and other low-lying areas. Avoid unnecessary travel.`,
      severity: hourlyRain > 20 ? "danger" : "warning"
    });
  } else if (hourlyRain > HOURLY_RAIN_MODERATE) {
    alerts.push({
      type: "weather",
      title: "🌦️ Moderate Rain - Lipa City",
      description: `Moderate rain in Lipa: ${hourlyRain.toFixed(1)}mm/hr. Roads may be slippery. Drive carefully.`,
      severity: "info"
    });
  }

  // 3. Extreme Heat - Lipa specific
  if (main.temp > EXTREME_HEAT) {
    alerts.push({
      type: "weather",
      title: "🌡️ Extreme Heat - Lipa City",
      description: `Dangerous heat in Lipa: ${Math.round(main.temp)}°C. Stay hydrated, avoid sun exposure 11AM-3PM. Check on elderly neighbors.`,
      severity: "warning"
    });
  }

  // 4. Strong Winds - Lipa specific
  const windSpeedKmh = wind.speed * 3.6;
  if (windSpeedKmh > STRONG_WIND) {
    alerts.push({
      type: "weather",
      title: "💨 Strong Winds - Lipa City",
      description: `Strong winds in Lipa: ${windSpeedKmh.toFixed(0)} km/h. Secure loose objects, be cautious near tall structures.`,
      severity: "warning"
    });
  }

  // Return most severe alert
  if (alerts.length === 0) return null;
  
  alerts.sort((a, b) => {
    const order = { danger: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
  
  const mainAlert = alerts[0];
  
  return {
    ...mainAlert,
    source: "OpenWeather",
    raw: data,
    location: {
      lat: LIPA_LAT,
      lon: LIPA_LON,
      city: "Lipa City",
      province: "Batangas",
      specificArea: "Lipa City Proper"
    },
    metadata: {
      temperature: main.temp,
      humidity: main.humidity,
      windSpeed: windSpeedKmh,
      rainfall: hourlyRain,
      conditions: weather.description,
      lipaSpecific: true
    }
  };
}

// Helper function to check if coordinates are within Lipa area
function isWithinLipaArea(lat, lon) {
  return (
    lat >= LIPA_BOUNDING_BOX.south &&
    lat <= LIPA_BOUNDING_BOX.north &&
    lon >= LIPA_BOUNDING_BOX.west &&
    lon <= LIPA_BOUNDING_BOX.east
  );
}


async function createPendingAlert(alertData) {
  try {
    // Check for duplicates in last 6 hours
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    
    const duplicateQuery = await admin
      .firestore()
      .collection("alerts")
      .where("source", "==", alertData.source)
      .where("type", "==", alertData.type)
      .where("status", "==", "pending")
      .where("timestamp", ">", admin.firestore.Timestamp.fromDate(sixHoursAgo))
      .limit(1)
      .get();

    if (!duplicateQuery.empty) {
      logger.info("Duplicate pending alert detected, skipping");
      return;
    }

    // Set expiration date for pending alerts
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ALERT_EXPIRATION_DAYS_PENDING);

    const alertDoc = {
      ...alertData,
      status: "pending", // MUST BE APPROVED BY ADMIN
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isActive: false, // Not active until approved
      approved: false,
      targetArea: "Lipa City, Batangas",
      expiresAt: expiresAt // Add expiration field
    };

    await admin.firestore().collection("alerts").add(alertDoc);
    logger.info(`PENDING alert created: ${alertData.title}`);

  } catch (error) {
    logger.error("Error creating pending alert:", error);
    throw error;
  }
}

exports.approveAlert = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  try {
    if (!request.auth || !request.auth.token.admin) {
      throw new Error("Admin access required");
    }

    const { alertId } = request.data;
    
    if (!alertId) {
      throw new Error("Alert ID is required");
    }

    const alertRef = admin.firestore().collection("alerts").doc(alertId);
    const alertDoc = await alertRef.get();
    
    if (!alertDoc.exists) {
      throw new Error("Alert not found");
    }

    const alertData = alertDoc.data();
    
    // Set expiration to 24 hours from approval
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ALERT_EXPIRATION_HOURS_APPROVED);
    
    // Update alert status with expiration
    await alertRef.update({
      status: "approved",
      approved: true,
      isActive: true,
      approvedBy: request.auth.uid,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: expiresAt
    });

    // Create in weather_alerts for mobile app with expiration
    await admin.firestore().collection("weather_alerts").add({
      title: alertData.title,
      description: alertData.description,
      severity: alertData.severity,
      type: alertData.type,
      approved: true,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: request.auth.uid,
      source: alertData.source,
      alertId: alertId,
      expiresAt: expiresAt
    });

    logger.info(`Alert ${alertId} approved and published with 24-hour expiration`);

    return {
      success: true,
      message: "Alert approved and published to users",
      alertId,
      expiresAt: expiresAt.toISOString()
    };

  } catch (error) {
    logger.error("Error approving alert:", error);
    throw new Error(error.message || "Failed to approve alert");
  }
});

exports.deleteExpiredAlerts = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  try {
    if (!request.auth || !request.auth.token.admin) {
      throw new Error("Admin access required");
    }

    const now = new Date();
    const alertsQuery = admin.firestore().collection("alerts");
    const snapshot = await alertsQuery.get();
    
    let expiredCount = 0;
    let deletedCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const expiresAt = data.expiresAt?.toDate?.() || data.expiresAt;
      
      if (expiresAt && expiresAt < now) {
        expiredCount++;
        try {
          await admin.firestore().collection("alerts").doc(doc.id).delete();
          deletedCount++;
          logger.info(`Deleted expired alert: ${doc.id}`);
        } catch (error) {
          logger.error(`Failed to delete expired alert ${doc.id}:`, error);
        }
      }
    }

    logger.info(`Expired alerts cleanup: ${deletedCount} deleted (${expiredCount} found)`);

    return {
      success: true,
      message: `Deleted ${deletedCount} expired alerts (${expiredCount} found)`,
      deletedCount,
      expiredCount
    };
    
  } catch (error) {
    logger.error('Error deleting expired alerts:', error);
    throw new Error(`Failed to delete expired alerts: ${error.message}`);
  }
});


exports.onAlertApproval = onDocumentUpdated({
  document: "alerts/{alertId}",
  region: "asia-southeast1"
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const alertId = event.params.alertId;

  // Only process when status changes from pending to approved
  if (before.status === "pending" && after.status === "approved") {
    try {
      logger.info(`Alert approved: ${alertId}`);

      // Create in weather_alerts collection for mobile app
      await admin.firestore().collection("weather_alerts").add({
        title: after.title,
        description: after.description,
        severity: after.severity,
        type: after.type,
        approved: true,
        isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: after.approvedBy,
        source: after.source,
        alertId: alertId
      });

      // Send push notifications to all users
      await sendAlertNotifications(after, alertId);

      logger.info(`Alert ${alertId} published to users`);

    } catch (error) {
      logger.error(`Error processing approval:`, error);
    }
  }
});


async function sendAlertNotifications(alertData, alertId) {
  try {
    const usersSnapshot = await admin.firestore()
      .collection("users")
      .where("expoPushToken", "!=", null)
      .where("notificationsEnabled", "!=", false)
      .get();

    if (usersSnapshot.empty) {
      logger.info("No users to notify");
      return;
    }

    const messages = [];
    const severityEmoji = {
      info: "",
      warning: "",
      danger: ""
    }[alertData.severity] || "";

    usersSnapshot.forEach((doc) => {
      const user = doc.data();
      const token = user.expoPushToken;
      
      if (token && typeof token === 'string') {
        messages.push({
          to: token,
          sound: "default",
          title: `${severityEmoji} ${alertData.title}`,
          body: alertData.description.substring(0, 200),
          data: {
            type: "weather_alert",
            alertId,
            severity: alertData.severity,
            alertType: alertData.type
          },
          priority: alertData.severity === "danger" ? "high" : "default"
        });
      }
    });

    logger.info(`Sending ${messages.length} notifications`);

    // Send in batches
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(batch)
      });
    }

    logger.info("Notifications sent successfully");

  } catch (error) {
    logger.error("Error sending notifications:", error);
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Create pending alert in Firestore
async function createPendingAlert(alertData) {
  try {
    const alertDoc = {
      ...alertData,
      status: "pending",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isActive: false,
      approved: false,
      targetArea: "Lipa City, Batangas"
    };

    await admin.firestore().collection("alerts").add(alertDoc);
    logger.info(`PENDING alert created: ${alertData.title}`);

  } catch (error) {
    logger.error("Error creating alert:", error);
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
  try {
    if (!request.auth || !request.auth.token.admin) {
      throw new Error("Admin access required");
    }

    const { alertId } = request.data;
    
    if (!alertId) {
      throw new Error("Alert ID is required");
    }

    const alertRef = admin.firestore().collection("alerts").doc(alertId);
    const alertDoc = await alertRef.get();
    
    if (!alertDoc.exists) {
      throw new Error("Alert not found");
    }

    const alertData = alertDoc.data();
    
    // Update alert status
    await alertRef.update({
      status: "approved",
      approved: true,
      isActive: true,
      approvedBy: request.auth.uid,
      approvedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Create in weather_alerts for mobile app
    await admin.firestore().collection("weather_alerts").add({
      title: alertData.title,
      description: alertData.description,
      severity: alertData.severity,
      type: alertData.type,
      approved: true,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: request.auth.uid,
      source: alertData.source,
      alertId: alertId
    });

    logger.info(`Alert ${alertId} approved and published`);

    return {
      success: true,
      message: "Alert approved and published to users",
      alertId
    };

  } catch (error) {
    logger.error("Error approving alert:", error);
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
   SOS EMERGENCY CALL MANAGEMENT SYSTEM
=================================================================== */

// Get SOS emergency call details
exports.getSOSEmergencyDetails = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth) {
    throw new Error("Authentication required");
  }

  const { sosId } = request.data;
  
  if (!sosId) {
    throw new Error("SOS ID is required");
  }

  try {
    const sosDoc = await admin.firestore().collection("sos_calls").doc(sosId).get();
    
    if (!sosDoc.exists) {
      throw new Error("SOS emergency call not found");
    }

    const sosData = sosDoc.data();
    
    // Kunin ang user details para hindi anonymous
    let userData = {};
    if (sosData.userId) {
      try {
        const userDoc = await admin.firestore().collection("users").doc(sosData.userId).get();
        if (userDoc.exists) {
          userData = userDoc.data();
        }
      } catch (userError) {
        logger.warn("Could not fetch user details:", userError);
      }
    }

    const enhancedData = {
      id: sosDoc.id,
      ...sosData,
      formattedCalledAt: sosData.calledAt ? sosData.calledAt.toDate().toISOString() : null,
      contactInfo: {
        phone: sosData.phoneNumber || userData.phoneNumber || userData.phone || 'Not available',
        email: sosData.email || userData.email || 'Not available',
        name: sosData.userName || userData.name || 'User' // Hindi na anonymous
      },
      isSOS: true,
      emergencyLevel: sosData.emergencyLevel || 'high'
    };

    return {
      success: true,
      sosData: enhancedData,
      type: 'sos_emergency'
    };

  } catch (error) {
    logger.error("Error getting SOS emergency details:", error);
    throw new Error("Failed to retrieve SOS emergency details");
  }
});

exports.onSOSCallCreated = onDocumentCreated({
    document: "sos_calls/{sosId}",
    region: "asia-southeast1"
}, async (event) => {
    const sosData = event.data.data();
    const sosId = event.params.sosId;

    if (!sosData || !sosData.userId) {
        logger.warn("Incomplete SOS call data");
        return;
    }

    try {
        logger.info(`Processing new SOS call: ${sosId}`);

        // Determine agency suggestion
        const suggestion = determineSuggestedAgency(sosData);
        
        // Update SOS with suggestion
        await admin.firestore().collection("sos_calls").doc(sosId).update({
            suggestedAgency: suggestion.mainAgency,
            suggestedPartner: suggestion.partnerAgency,
            suggestionReason: suggestion.suggestionReason,
            requiresPatientForm: suggestion.requiresPatientForm,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });

        // Extract location information
        const location = sosData.location;
        const locationText = location 
            ? `${location.barangay}, ${location.city}` 
            : "Lipa City";

        // Send notifications
        await sendSOSPushNotification(
            sosData.userId,
            'sos_call_pending',
            '🚨 SOS Emergency Reported',
            `Your ${sosData.emergencyType} emergency in ${locationText} has been logged. CDRRMO is coordinating response.`,
            {
                sosCallId: sosId,
                suggestedAgency: suggestion.mainAgency,
                location: locationText,
                ...(location && {
                    coordinates: {
                        latitude: location.latitude,
                        longitude: location.longitude
                    }
                }),
                type: 'sos_call_pending'
            }
        );

        // Create in-app notification
        await admin.firestore().collection("notifications").add({
            userId: sosData.userId,
            sosCallId: sosId,
            title: '🚨 SOS Emergency Reported',
            body: `CDRRMO is coordinating response to your ${sosData.emergencyType} emergency in ${locationText}.`,
            type: 'sos_call_pending',
            priority: 'high',
            status: 'unread',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            data: {
                sosCallId: sosId,
                suggestedAgency: suggestion.mainAgency,
                location: locationText,
                actionUrl: `/emergency/sos-status?sosId=${sosId}`,
            },
            expiresAt: admin.firestore.Timestamp.fromDate(
                new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            )
        });

        // Notify CDRRMO admins
        await notifyCDRRMOAdmins(sosId, sosData, suggestion);

        logger.info(`SOS call processed with CDRRMO coordination: ${sosId}`);

    } catch (error) {
        logger.error(`Error processing SOS call ${sosId}:`, error);
    }
});

exports.onSOSCallUpdated = onDocumentUpdated({
  document: "sos_calls/{sosId}",
  region: "asia-southeast1"
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const sosId = event.params.sosId;

  if (!before || !after) {
    return;
  }

  try {
    const location = after.location;
    const locationText = location 
      ? `${location.barangay}, ${location.city}` 
      : "Lipa City";

    // Check if SOS was just reviewed
    if (!before.reviewed && after.reviewed) {
      logger.info(`SOS call ${sosId} was reviewed by admin at ${locationText}`);

      // Create in-app notification
      await admin.firestore().collection("notifications").add({
        userId: after.userId,
        sosCallId: sosId,
        title: '✅ SOS Call Reviewed',
        body: `Your emergency call to ${after.selectedAgency} in ${locationText} has been reviewed by CDRRMO.`,
        type: 'sos_call_reviewed',
        priority: 'high',
        status: 'unread',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        data: {
          sosCallId: sosId,
          agencyName: after.selectedAgency,
          location: locationText,
          reviewedBy: after.reviewedBy,
          actionUrl: `/emergency/sos-status?sosId=${sosId}`,
          ...(location && {
            coordinates: {
              latitude: location.latitude,
              longitude: location.longitude
            }
          })
        },
        expiresAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        )
      });

      // Send push notification
      await sendSOSPushNotification(
        after.userId,
        'sos_call_reviewed',
        '✅ SOS Call Reviewed',
        `Your emergency call to ${after.selectedAgency} in ${locationText} has been reviewed by CDRRMO.`,
        {
          sosCallId: sosId,
          agencyName: after.selectedAgency,
          location: locationText,
          ...(location && {
            coordinates: {
              latitude: location.latitude,
              longitude: location.longitude
            }
          }),
          type: 'sos_call_reviewed'
        }
      );
    }

    // Check if SOS was assigned to an agency
    if (!before.assignedAgency && after.assignedAgency) {
      logger.info(`SOS call ${sosId} assigned to ${after.assignedAgencyName} at ${locationText}`);

      // Create in-app notification
      await admin.firestore().collection("notifications").add({
        userId: after.userId,
        sosCallId: sosId,
        title: '👷 SOS Response Assigned',
        body: `Your emergency call has been assigned to ${after.assignedAgencyName} for response in ${locationText}.`,
        type: 'sos_call_assigned',
        priority: 'high',
        status: 'unread',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        data: {
          sosCallId: sosId,
          assignedAgency: after.assignedAgencyName,
          location: locationText,
          actionUrl: `/emergency/sos-status?sosId=${sosId}`,
          ...(location && {
            coordinates: {
              latitude: location.latitude,
              longitude: location.longitude
            }
          })
        },
        expiresAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        )
      });

      // Send push notification
      await sendSOSPushNotification(
        after.userId,
        'sos_call_assigned',
        '👷 Response Team Assigned',
        `${after.assignedAgencyName} has been assigned to respond to your emergency call in ${locationText}.`,
        {
          sosCallId: sosId,
          assignedAgency: after.assignedAgencyName,
          location: locationText,
          ...(location && {
            coordinates: {
              latitude: location.latitude,
              longitude: location.longitude
            }
          }),
          type: 'sos_call_assigned'
        }
      );
    }

  } catch (error) {
    logger.error(`Error handling SOS call update ${sosId}:`, error);
  }
});

async function notifyCDRRMOAdmins(sosId, sosData, suggestion) {
    const adminsSnapshot = await admin.firestore().collection("users")
        .where("role", "in", ["admin", "monitor"])
        .where("status", "==", "active")
        .get();

    for (const adminDoc of adminsSnapshot.docs) {
        const adminData = adminDoc.data();
        
        // In-app notification
        await admin.firestore().collection("notifications").add({
            userId: adminDoc.id,
            title: "🆘 New SOS - Agency Assignment Needed",
            body: `${sosData.emergencyType} in ${sosData.location?.barangay || 'Lipa City'}. Suggested: ${suggestion.mainAgency}${suggestion.partnerAgency ? ' + ' + suggestion.partnerAgency : ''}`,
            type: "sos_assignment",
            priority: "high",
            data: {
                sosId: sosId,
                suggestedAgency: suggestion.mainAgency,
                suggestedPartner: suggestion.partnerAgency,
                emergencyType: sosData.emergencyType,
                barangay: sosData.location?.barangay,
                location: sosData.location,
                requiresPatientForm: suggestion.requiresPatientForm,
                timestamp: new Date().toISOString()
            },
            status: "unread",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Push notification
        const token = adminData.expoPushToken;
        if (token && typeof token === 'string' && token.trim()) {
            const message = {
                to: token,
                sound: 'default',
                title: '🆘 New SOS Emergency',
                body: `${sosData.emergencyType} in ${sosData.location?.barangay || 'Lipa City'}. Tap to assign agencies.`,
                data: {
                    type: 'new_sos_admin',
                    sosId: sosId,
                    emergencyType: sosData.emergencyType,
                    barangay: sosData.location?.barangay,
                    timestamp: Date.now()
                },
                channelId: 'admin_alerts',
                priority: 'high',
                ttl: 3600
            };

            try {
                await fetch("https://exp.host/--/api/v2/push/send", {
                    method: "POST",
                    headers: {
                        Accept: "application/json",
                        "Accept-encoding": "gzip, deflate",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(message),
                });
            } catch (error) {
                logger.error(`Admin push notification failed: ${error.message}`);
            }
        }
    }
}


exports.updateUserPassword = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  try {
    // Verify admin/monitor authentication for user password reset
    if (!request.auth) {
      throw new Error("Authentication required");
    }
    
    // For resetting other users' passwords, require admin/monitor role
    if (request.data.userId && request.data.userId !== request.auth.uid) {
      if (!request.auth.token.admin && !request.auth.token.monitor) {
        throw new Error("Admin or Monitor privileges required to reset other users' passwords");
      }
    }

    const { userId, newPassword, forcePasswordChange = true, notifyUser = true } = request.data;
    
    if (!userId || !newPassword) {
      throw new Error("User ID and new password are required");
    }

    if (newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters long");
    }

    // Update user password using Firebase Admin SDK
    await admin.auth().updateUser(userId, {
      password: newPassword
    });

    // Update Firestore with password reset information
    const updateData = {
      passwordResetAt: admin.firestore.FieldValue.serverTimestamp(),
      passwordResetBy: request.auth.uid,
      lastPasswordUpdate: new Date().toISOString()
    };

    // Only add tempPassword and forcePasswordChange if it's a reset by admin/monitor
    if (userId !== request.auth.uid) {
      updateData.tempPassword = newPassword;
      updateData.forcePasswordChange = forcePasswordChange;
    }

    await admin.firestore().collection("users").doc(userId).update(updateData);

    logger.info(`Password updated for user ${userId} by ${request.auth.uid}`);

    return { 
      success: true, 
      message: "Password updated successfully",
      userId: userId,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error("Error updating user password:", error);
    
    if (error.code === 'auth/user-not-found') {
      throw new Error("User not found");
    } else if (error.code === 'auth/invalid-password') {
      throw new Error("Password is too weak");
    }
    
    throw new Error(error.message || "Failed to update password");
  }
});


// Helper function to send SOS-specific push notifications
async function sendSOSPushNotification(userId, notificationType, title, body, data = {}) {
  try {
    const userDoc = await admin.firestore().collection("users").doc(userId).get();
    
    if (!userDoc.exists) {
      logger.info("User not found for SOS push notification:", userId);
      return;
    }

    const userData = userDoc.data();
    const token = userData.expoPushToken;
    
    if (!token || typeof token !== 'string' || !token.trim()) {
      logger.info("No valid Expo token for SOS notification:", userId);
      return;
    }

    // Check if user has notifications enabled
    if (userData.notificationsEnabled === false) {
      logger.info("Notifications disabled for user:", userId);
      return;
    }

    const sosIcons = {
      sos_call_pending: "🚨",
      sos_call_reviewed: "✅",
      sos_call_assigned: "👷",
      sos_call_confirm: "📞",
    };

    const message = {
      to: token,
      sound: "default",
      title: `${sosIcons[notificationType] || "🚨"} ${title}`,
      body,
      data: {
        ...data,
        timestamp: Date.now()
      },
      channelId: "sos_calls",
      priority: "high",
      ttl: 86400 // 24 hours
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
        throw new Error(`SOS push failed: ${response.status} - ${errorText}`);
      }

      return await response.json();
    });

    logger.info(`SOS push notification sent successfully:`, result);

  } catch (error) {
    logger.error("Error sending SOS push notification:", error);
  }
}

// Admin callable to mark SOS as reviewed
exports.reviewSOSCall = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  const { sosId, assignedAgency, assignedAgencyName, linkedReportId } = request.data;
  
  if (!sosId) {
    throw new Error("SOS call ID is required");
  }

  try {
    const sosRef = admin.firestore().collection("sos_calls").doc(sosId);
    const sosDoc = await sosRef.get();
    
    if (!sosDoc.exists) {
      throw new Error("SOS call not found");
    }

    const updateData = {
      reviewed: true,
      reviewedBy: request.auth.uid,
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (assignedAgency) {
      updateData.assignedAgency = assignedAgency;
      updateData.assignedAgencyName = assignedAgencyName || assignedAgency;
      updateData.assignedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    if (linkedReportId) {
      updateData.linkedReportId = linkedReportId;
    }

    await sosRef.update(updateData);

    logger.info(`SOS call ${sosId} reviewed by admin ${request.auth.uid}`);

    return {
      success: true,
      message: "SOS call marked as reviewed",
      sosId,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    logger.error("Error reviewing SOS call:", error);
    throw new Error(error.message || "Failed to review SOS call");
  }
});

// Get SOS call statistics for admin
exports.getSOSCallStats = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  try {
    const sosSnapshot = await admin.firestore().collection("sos_calls").get();
    const calls = sosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const stats = {
      total: calls.length,
      reviewed: calls.filter(c => c.reviewed).length,
      pending: calls.filter(c => !c.reviewed).length,
      assigned: calls.filter(c => c.assignedAgency).length,
      withLocation: calls.filter(c => c.location && c.location.barangay).length,
      withoutLocation: calls.filter(c => !c.location || !c.location.barangay).length,
      byAgency: {},
      byBarangay: {},
      byEmergencyType: {},
      recentCalls: {
        last24Hours: 0,
        lastWeek: 0,
        lastMonth: 0
      }
    };

    // Calculate distributions
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    calls.forEach(call => {
      // By agency
      const agency = call.selectedAgency || 'Unknown';
      stats.byAgency[agency] = (stats.byAgency[agency] || 0) + 1;

      // By barangay (from GPS location)
      const barangay = call.location?.barangay || 'Unknown/Not Captured';
      stats.byBarangay[barangay] = (stats.byBarangay[barangay] || 0) + 1;

      // By emergency type
      if (call.emergencyType) {
        stats.byEmergencyType[call.emergencyType] = (stats.byEmergencyType[call.emergencyType] || 0) + 1;
      }

      // Recent calls
      const calledAt = call.calledAt ? new Date(call.calledAt) : null;
      if (calledAt) {
        if (calledAt > oneDayAgo) stats.recentCalls.last24Hours++;
        if (calledAt > oneWeekAgo) stats.recentCalls.lastWeek++;
        if (calledAt > oneMonthAgo) stats.recentCalls.lastMonth++;
      }
    });

    return {
      success: true,
      stats,
      generatedAt: new Date().toISOString()
    };

  } catch (error) {
    logger.error("Error getting SOS call stats:", error);
    throw new Error("Failed to generate SOS call statistics");
  }
});


// Add this to your functions/index.js

exports.cleanupDevData = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  try {
    const batch = admin.firestore().batch();
    let totalDeleted = 0;

    // 1. Delete dev_otp_logs (development data)
    const devOtpLogs = await admin.firestore().collection("dev_otp_logs").get();
    devOtpLogs.docs.forEach(doc => {
      batch.delete(doc.ref);
      totalDeleted++;
    });

    // 2. Delete dev_email_logs (development data)
    const devEmailLogs = await admin.firestore().collection("dev_email_logs").get();
    devEmailLogs.docs.forEach(doc => {
      batch.delete(doc.ref);
      totalDeleted++;
    });

    // 3. Delete expired OTPs
    const expiredOtps = await admin.firestore().collection("otp")
      .where("createdAt", "<", admin.firestore.Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000)))
      .get();
    expiredOtps.docs.forEach(doc => {
      batch.delete(doc.ref);
      totalDeleted++;
    });

    // 4. Delete old rate_limits
    const oldRateLimits = await admin.firestore().collection("rate_limits")
      .where("timestamp", "<", admin.firestore.Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))
      .get();
    oldRateLimits.docs.forEach(doc => {
      batch.delete(doc.ref);
      totalDeleted++;
    });

    // 5. Delete old system_logs
    const oldLogs = await admin.firestore().collection("system_logs")
      .where("timestamp", "<", admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
      .get();
    oldLogs.docs.forEach(doc => {
      batch.delete(doc.ref);
      totalDeleted++;
    });

    await batch.commit();

    logger.info(`Cleanup completed: ${totalDeleted} documents deleted`);

    return {
      success: true,
      deleted: totalDeleted,
      message: `Cleaned up ${totalDeleted} documents`
    };

  } catch (error) {
    logger.error("Cleanup error:", error);
    throw new Error("Cleanup failed");
  }
});


exports.getSOSCallsByLocation = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  try {
    const { startDate, endDate, barangay } = request.data || {};
    
    let query = admin.firestore().collection("sos_calls");
    
    // Apply date filters
    if (startDate) {
      query = query.where("calledAt", ">=", admin.firestore.Timestamp.fromDate(new Date(startDate)));
    }
    if (endDate) {
      query = query.where("calledAt", "<=", admin.firestore.Timestamp.fromDate(new Date(endDate)));
    }

    const snapshot = await query.get();
    let calls = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        userName: data.userName,
        selectedAgency: data.selectedAgency,
        emergencyType: data.emergencyType,
        calledAt: data.calledAt,
        reviewed: data.reviewed,
        location: data.location,
        assignedAgency: data.assignedAgency,
        assignedAgencyName: data.assignedAgencyName
      };
    });

    // Filter by barangay if specified
    if (barangay && barangay !== 'all') {
      calls = calls.filter(call => call.location?.barangay === barangay);
    }

    // Only return calls with valid location data
    const callsWithLocation = calls.filter(call => 
      call.location && 
      call.location.latitude && 
      call.location.longitude
    );

    return {
      success: true,
      calls: callsWithLocation,
      total: callsWithLocation.length,
      filters: { startDate, endDate, barangay }
    };

  } catch (error) {
    logger.error("Error getting SOS calls by location:", error);
    throw new Error("Failed to retrieve SOS calls by location");
  }
});
// =================== SCHEDULE SOS CONFIRMATION NOTIFICATION ===================
exports.scheduleSOSConfirmation = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  try {
    const { userId, serviceTitle, emergencyType, reporterBarangay, sosLogId } = request.data;

    if (!userId || !serviceTitle) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    console.log(`📅 Scheduling SOS confirmation for user ${userId}, service: ${serviceTitle}`);

    // Schedule notification after 3 minutes
    setTimeout(async () => {
      try {
        // Get user's Expo push token
        const userDoc = await admin.firestore().collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
          console.log('User not found, skipping notification');
          return;
        }

        const userData = userDoc.data();
        const expoPushToken = userData.expoPushToken;

        if (!expoPushToken) {
          console.log('No Expo push token for user, skipping notification');
          return;
        }

        // Send push notification
        const message = {
          to: expoPushToken,
          sound: 'default',
          title: '📞 Emergency Call Confirmation',
          body: `Did you complete your call to ${serviceTitle}? Tap to confirm.`,
          data: {
            type: 'sos_confirmation',
            sosLogId: sosLogId,
            serviceTitle: serviceTitle,
            emergencyType: emergencyType,
            reporterBarangay: reporterBarangay,
            timestamp: new Date().toISOString()
          },
          channelId: 'sos_confirmation',
          priority: 'high'
        };

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        });

        if (!response.ok) {
          throw new Error(`Expo API error: ${response.status}`);
        }

        const result = await response.json();
        console.log('✅ SOS confirmation notification sent:', result);

        // Log the notification
        await admin.firestore().collection('notification_logs').add({
          userId: userId,
          type: 'sos_confirmation',
          title: message.title,
          body: message.body,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          success: true,
          data: message.data
        });

      } catch (error) {
        console.error('❌ Error sending SOS confirmation notification:', error);
        
        // Log the error
        await admin.firestore().collection('notification_logs').add({
          userId: userId,
          type: 'sos_confirmation',
          error: error.message,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          success: false
        });
      }
    }, 3 * 60 * 1000); // 3 minutes

    return { 
      success: true, 
      message: 'SOS confirmation notification scheduled',
      scheduledFor: '3 minutes from now'
    };

  } catch (error) {
    console.error('Error in scheduleSOSConfirmation:', error);
    throw new functions.https.HttpsError('internal', 'Failed to schedule confirmation notification');
  }
});

// =================== SUGGEST AGENCY FOR SOS ===================
exports.onSOSIncidentCreated = onDocumentCreated({
  document: "incident_reports/{reportId}",
  region: "asia-southeast1"
}, async (event) => {
  try {
    const reportData = event.data.data();
    const reportId = event.params.reportId;

    if (!reportData || reportData.type !== "sos" || reportData.status !== "pending") {
      return;
    }

    logger.info(`🆘 New SOS needs assignment: ${reportId}`);

    // SMART SUGGESTION LOGIC - CDRRMO focused
    const suggestedAgency = determineSuggestedAgency(reportData);
    
    // Update report with suggestion
    await admin.firestore().collection("incident_reports").doc(reportId).update({
      suggestedAgency: suggestedAgency,
      suggestedAt: admin.firestore.FieldValue.serverTimestamp(),
      needsAssignment: true,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });

    logger.info(`💡 Suggested ${suggestedAgency} for SOS ${reportId}`);

    // ✅ IMMEDIATE NOTIFICATION TO USER
    await sendImmediateUserNotification(
      reportData.userId,
      reportId,
      '🚨 SOS Report Received',
      `Your ${reportData.emergencyType} emergency report has been received and is being reviewed by CDRRMO.`,
      {
        type: 'sos_received',
        reportId: reportId,
        emergencyType: reportData.emergencyType,
        location: reportData.barangay || 'Lipa City'
      }
    );

    // ✅ IMMEDIATE NOTIFICATION TO CDRRMO ADMINS
    await sendAdminNotification(reportId, suggestedAgency, reportData);

  } catch (error) {
    logger.error("Error in SOS suggestion:", error);
  }
});


function determineSuggestedAgency(reportData) {
    const emergencyType = (reportData.emergencyType || '').toLowerCase();
    
    // MEDICAL = CDRRMO ONLY
    if (emergencyType.includes('medical') || emergencyType.includes('health') || emergencyType.includes('hospital')) {
        return {
            mainAgency: 'CDRRMO',
            partnerAgency: null,
            requiresPatientForm: true,
            suggestionReason: 'Medical emergencies require CDRRMO for patient care and medical response'
        };
    }
    
    // FIRE = CDRRMO + BFP
    if (emergencyType.includes('fire')) {
        return {
            mainAgency: 'CDRRMO', 
            partnerAgency: 'BFP Lipa Fire Station',
            requiresPatientForm: true,
            suggestionReason: 'Fire incidents require BFP firefighting expertise with CDRRMO coordination'
        };
    }
    
    // CRIME = CDRRMO + PNP
    if (emergencyType.includes('crime') || emergencyType.includes('police') || emergencyType.includes('theft') || emergencyType.includes('assault')) {
        return {
            mainAgency: 'CDRRMO',
            partnerAgency: 'PNP Lipa Police Station',
            requiresPatientForm: true,
            suggestionReason: 'Crime incidents require PNP law enforcement with CDRRMO support'
        };
    }
    
    // TRAFFIC ACCIDENT = CDRRMO + PNP
    if (emergencyType.includes('traffic') || emergencyType.includes('accident') || emergencyType.includes('vehicular')) {
        return {
            mainAgency: 'CDRRMO',
            partnerAgency: 'PNP Lipa Police Station',
            requiresPatientForm: true,
            suggestionReason: 'Traffic accidents require medical response and traffic management'
        };
    }
    
    // OTHERS = CDRRMO ONLY
    return {
        mainAgency: 'CDRRMO',
        partnerAgency: null,
        requiresPatientForm: true,
        suggestionReason: 'CDRRMO can handle with optional partner support'
    };
}
exports.assignRescuerToReport = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const { reportId, rescuerId } = request.data;
  
  if (!reportId || !rescuerId) {
    throw new functions.https.HttpsError('invalid-argument', 'Report ID and rescuer ID required');
  }

  try {
    const userDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    
    if (!['admin', 'monitor'].includes(userData.role)) {
      throw new functions.https.HttpsError('permission-denied', 'Only admins and monitors can assign rescuers');
    }

    const rescuerDoc = await admin.firestore().collection('users').doc(rescuerId).get();
    
    if (!rescuerDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Rescuer not found');
    }

    const rescuerData = rescuerDoc.data();
    
    if (rescuerData.role !== 'rescuer') {
      throw new functions.https.HttpsError('invalid-argument', 'User is not a rescuer');
    }

    if (rescuerData.currentAssignment && rescuerData.currentAssignment !== reportId) {
      throw new functions.https.HttpsError('failed-precondition', 
        `Rescuer is already assigned to incident: ${rescuerData.currentAssignment}`);
    }

    if (rescuerData.rescuerStatus === 'busy' && rescuerData.currentAssignment !== reportId) {
      throw new functions.https.HttpsError('failed-precondition', 
        'Rescuer is currently busy with another assignment');
    }

    const reportDoc = await admin.firestore().collection("incident_reports").doc(reportId).get();
    
    if (!reportDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Report not found');
    }

    const reportData = reportDoc.data();

    // ✅ PROPERLY EXTRACT ADDRESS
    let extractedAddress = 'Address not available';
    
    if (reportData.formatted_address) {
      extractedAddress = reportData.formatted_address;
    } else if (reportData.address) {
      extractedAddress = reportData.address;
    } else if (reportData.fullAddress) {
      extractedAddress = reportData.fullAddress;
    } else if (reportData.location && reportData.location.address) {
      extractedAddress = reportData.location.address;
    } else if (reportData.barangay && reportData.barangay !== 'Unknown Barangay') {
      extractedAddress = `${reportData.barangay}, Lipa City, Batangas, Philippines`;
    }

    const destinationInfo = {
      latitude: reportData.location?.latitude || reportData.lat || 0,
      longitude: reportData.location?.longitude || reportData.lng || 0,
      address: extractedAddress,
      barangay: reportData.barangay || reportData.location?.barangay || 'Lipa City',
      city: 'Lipa City',
      province: 'Batangas'
    };

    console.log('📍 Destination info created:', destinationInfo);

    const reportUpdateData = {
      assignedRescuer: rescuerId,
      assignedRescuerName: rescuerData.name || 'CDRRMO Rescuer',
      rescuerStatus: 'assigned',
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdatedBy: request.auth.uid,
      destination: destinationInfo
    };

    const rescuerPhone = rescuerData.phoneNumber || rescuerData.phone || rescuerData.number;
    if (rescuerPhone && 
        rescuerPhone !== 'N/A' && 
        rescuerPhone !== 'Not available' && 
        rescuerPhone !== 'undefined' &&
        rescuerPhone.trim() !== '') {
      reportUpdateData.assignedRescuerPhone = rescuerPhone;
    }

    await admin.firestore().collection("incident_reports").doc(reportId).update(reportUpdateData);

    const rescuerUpdateData = {
      currentAssignment: reportId,
      currentAssignmentDetails: {
        reportId: reportId,
        emergencyType: reportData.emergencyType || 'Emergency',
        destination: destinationInfo,
        assignedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'assigned'
      },
      rescuerStatus: 'busy',
      isAvailable: false,
      lastAssignment: admin.firestore.FieldValue.serverTimestamp(),
      lastAssignedBy: request.auth.uid
    };

    await admin.firestore().collection('users').doc(rescuerId).update(rescuerUpdateData);

    console.log(`✅ Rescuer ${rescuerData.name} assigned to report ${reportId}`);

    await sendRescuerAssignmentNotification(rescuerId, reportId, reportData, destinationInfo);

    return { 
      success: true, 
      message: `Rescuer ${rescuerData.name} assigned successfully`,
      rescuerName: rescuerData.name,
      rescuerPhone: rescuerPhone || 'Not available',
      destination: destinationInfo,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error in assignRescuerToReport:', error);
    
    await admin.firestore().collection('error_logs').add({
      type: 'rescuer_assignment_error',
      reportId: reportId,
      rescuerId: rescuerId,
      error: error.message,
      stack: error.stack,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    if (error.code === 'permission-denied' || 
        error.code === 'not-found' || 
        error.code === 'invalid-argument' ||
        error.code === 'failed-precondition' ||
        error.code === 'unauthenticated') {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', `Failed to assign rescuer: ${error.message}`);
  }
});

async function sendRescuerAssignmentNotification(rescuerId, reportId, reportData, destinationInfo) {
  try {
    const rescuerDoc = await admin.firestore().collection('users').doc(rescuerId).get();
    const rescuerData = rescuerDoc.data();
    const expoPushToken = rescuerData.expoPushToken;

    // ✅ CREATE IN-APP NOTIFICATION WITH DESTINATION
    await admin.firestore().collection('notifications').add({
      userId: rescuerId,
      reportId: reportId,
      title: '🚨 New Emergency Assignment',
      body: `${reportData.emergencyType} in ${destinationInfo.barangay}. Tap for directions.`,
      type: 'rescuer_assignment',
      priority: 'high',
      status: 'unread',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      data: {
        reportId: reportId,
        emergencyType: reportData.emergencyType,
        destination: destinationInfo,
        hasRouting: true,
        actionRequired: true
      },
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      )
    });

    // ✅ SEND PUSH NOTIFICATION WITH ROUTING DATA
    if (expoPushToken && typeof expoPushToken === 'string' && expoPushToken.trim()) {
      const message = {
        to: expoPushToken,
        sound: 'default',
        title: '🚨 Emergency Assignment',
        body: `${reportData.emergencyType} in ${destinationInfo.barangay}. Tap for navigation.`,
        data: {
          type: 'rescuer_assignment',
          reportId: reportId,
          emergencyType: reportData.emergencyType,
          // ✅ ROUTING INFO FOR MOBILE APP
          destination: {
            latitude: destinationInfo.latitude,
            longitude: destinationInfo.longitude,
            address: destinationInfo.address,
            barangay: destinationInfo.barangay
          },
          hasNavigation: true,
          timestamp: Date.now()
        },
        channelId: 'rescuer_assignments',
        priority: 'high',
        ttl: 3600
      };

      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });

      if (response.ok) {
        console.log(`✅ Push notification with routing sent to rescuer ${rescuerId}`);
      } else {
        console.error(`❌ Push notification failed: ${response.status}`);
      }
    }

  } catch (error) {
    console.error('❌ Error sending rescuer notification:', error);
  }
}


async function sendAdminNotification(reportId, suggestedAgency, reportData) {
  // Get all admin users
  const adminsSnapshot = await admin.firestore().collection("users")
    .where("role", "in", ["admin", "monitor"])
    .where("status", "==", "active")
    .get();

  for (const adminDoc of adminsSnapshot.docs) {
    // ✅ IMMEDIATE IN-APP NOTIFICATION FOR ADMINS
    await admin.firestore().collection("notifications").add({
      userId: adminDoc.id,
      title: "🆘 New SOS Needs Assignment",
      body: `SOS ${reportData.emergencyType} in ${reportData.barangay}. Suggested: ${suggestedAgency}`,
      type: "sos_assignment",
      priority: "high",
      data: {
        reportId: reportId,
        suggestedAgency: suggestedAgency,
        emergencyType: reportData.emergencyType,
        barangay: reportData.barangay,
        location: reportData.location,
        timestamp: new Date().toISOString()
      },
      status: "unread",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // ✅ PUSH NOTIFICATION FOR ADMINS
    const adminData = adminDoc.data();
    const token = adminData.expoPushToken;
    
    if (token && typeof token === 'string' && token.trim()) {
      const message = {
        to: token,
        sound: 'default',
        title: '🆘 New SOS Emergency',
        body: `${reportData.emergencyType} in ${reportData.barangay}. Tap to assign.`,
        data: {
          type: 'new_sos_admin',
          reportId: reportId,
          emergencyType: reportData.emergencyType,
          barangay: reportData.barangay,
          timestamp: Date.now()
        },
        channelId: 'admin_alerts',
        priority: 'high',
        ttl: 3600 // 1 hour
      };

      try {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        });
        logger.info(`✅ Admin notification sent to ${adminDoc.id}`);
      } catch (error) {
        logger.error(`❌ Admin push notification failed: ${error.message}`);
      }
    }
  }
}

exports.assignPartnerAgency = onCall({
    region: "asia-southeast1",
    cors: true
}, async (request) => {
    if (!request.auth) throw new Error("Authentication required");
    
    const { reportId, partnerAgency } = request.data;
    if (!reportId || !partnerAgency) throw new Error("Report ID and agency required");

    const userDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
    const userData = userDoc.data();
    
    // Only Admin/Monitor can assign
    if (userData.role !== 'admin' && userData.role !== 'monitor') {
        throw new Error("Only admins and monitors can assign agencies");
    }

    await admin.firestore().collection("incident_reports").doc(reportId).update({
        partnerAgency: partnerAgency,
        partnerAgencyStatus: 'assigned',
        partnerAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
        partnerAssignedBy: request.auth.uid
    });

    return { success: true, message: `Partner agency ${partnerAgency} assigned` };
});

// =================== SCHEDULE SOS CONFIRMATION NOTIFICATION ===================
exports.scheduleSOSConfirmation = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  try {
    const { userId, serviceTitle, emergencyType, reporterBarangay, sosLogId } = request.data;

    if (!userId || !serviceTitle) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    console.log(`📅 Scheduling SOS confirmation for user ${userId}, service: ${serviceTitle}`);

    // For now, let's create an immediate notification instead of scheduling
    // This fixes the "not-found" error
    try {
      // Get user's Expo push token
      const userDoc = await admin.firestore().collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        console.log('User not found, skipping notification');
        return { success: true, message: 'User not found' };
      }

      const userData = userDoc.data();
      const expoPushToken = userData.expoPushToken;

      if (!expoPushToken) {
        console.log('No Expo push token for user, skipping notification');
        return { success: true, message: 'No push token' };
      }

      // Send immediate push notification (instead of scheduled)
      const message = {
        to: expoPushToken,
        sound: 'default',
        title: '📞 Emergency Call Made',
        body: `Your call to ${serviceTitle} has been logged. Status: Pending Review`,
        data: {
          type: 'sos_call_pending',
          sosLogId: sosLogId || `temp_${Date.now()}`,
          serviceTitle: serviceTitle,
          emergencyType: emergencyType || 'general',
          reporterBarangay: reporterBarangay || 'Lipa City',
          timestamp: new Date().toISOString()
        },
        channelId: 'sos_calls',
        priority: 'high'
      };

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        console.error('Expo API error:', response.status);
        // Don't throw error, just log it
      } else {
        const result = await response.json();
        console.log('✅ SOS notification sent:', result);
      }

    } catch (notificationError) {
      console.error('Notification error (non-critical):', notificationError);
      // Don't fail the entire function if notification fails
    }

    return { 
      success: true, 
      message: 'SOS call processed successfully',
      immediateNotification: true
    };

  } catch (error) {
    console.error('Error in scheduleSOSConfirmation:', error);
    // Return a success response instead of throwing to prevent app errors
    return { 
      success: true, 
      message: 'SOS call processed (notification skipped)',
      error: error.message 
    };
  }
});

exports.onChatMessageCreated = onDocumentCreated({
  document: "chatRooms/{chatRoomId}/messages/{messageId}",
  region: "asia-southeast1"
}, async (event) => {
  const messageData = event.data.data();
  const chatRoomId = event.params.chatRoomId;
  const messageId = event.params.messageId;

  if (!messageData || messageData.senderId === 'system') return;

  try {
    // Get chat room details
    const chatRoomDoc = await admin.firestore().collection("chatRooms").doc(chatRoomId).get();
    const chatRoomData = chatRoomDoc.data();
    
    if (!chatRoomData) return;

    // Notify all participants except sender
    const participants = chatRoomData.participants || [];
    const otherParticipants = participants.filter(pid => pid !== messageData.senderId);

    for (const participantId of otherParticipants) {
      await createChatNotification(
        participantId,
        chatRoomId,
        messageData.senderName || 'Someone',
        messageData.content,
        messageData.senderId
      );
    }

    logger.info(`Chat notification created for message ${messageId}`);
  } catch (error) {
    logger.error("Error in onChatMessageCreated:", error);
  }
});

// ✅ WEATHER & DISASTER ALERTS NOTIFICATION
exports.onDisasterAlertCreated = onDocumentCreated({
  document: "disaster_alerts/{alertId}",
  region: "asia-southeast1"
}, async (event) => {
  const alertData = event.data.data();
  const alertId = event.params.alertId;

  if (!alertData || !alertData.isActive) return;

  try {
    await sendBroadcastNotification(
      'weather_alert',
      `🌦️ ${alertData.title}`,
      alertData.description,
      {
        alertId: alertId,
        type: 'weather_alert',
        severity: alertData.severity,
        alertType: alertData.type
      }
    );

    logger.info(`Weather alert notification sent: ${alertId}`);
  } catch (error) {
    logger.error("Error in onDisasterAlertCreated:", error);
  }
});

// ✅ EMERGENCY TIPS NOTIFICATION
exports.onEmergencyTipCreated = onDocumentCreated({
  document: "emergency_tips/{tipId}",
  region: "asia-southeast1"
}, async (event) => {
  const tipData = event.data.data();
  const tipId = event.params.tipId;

  if (!tipData || !tipData.isActive) return;

  try {
    await sendBroadcastNotification(
      'emergency_tip',
      `💡 ${tipData.title}`,
      tipData.description,
      {
        tipId: tipId,
        type: 'emergency_tip',
        category: tipData.category
      }
    );

    logger.info(`Emergency tip notification sent: ${tipId}`);
  } catch (error) {
    logger.error("Error in onEmergencyTipCreated:", error);
  }
});

// ✅ ANNOUNCEMENTS NOTIFICATION
exports.onAnnouncementCreated = onDocumentCreated({
  document: "announcements/{announcementId}",
  region: "asia-southeast1"
}, async (event) => {
  const announcementData = event.data.data();
  const announcementId = event.params.announcementId;

  if (!announcementData) return;

  try {
    await sendBroadcastNotification(
      'announcement',
      `📢 ${announcementData.title}`,
      announcementData.body,
      {
        announcementId: announcementId,
        type: 'announcement'
      }
    );

    logger.info(`Announcement notification sent: ${announcementId}`);
  } catch (error) {
    logger.error("Error in onAnnouncementCreated:", error);
  }
});

// ✅ FORUM ACTIVITY NOTIFICATIONS
exports.onForumActivity = onDocumentCreated({
  document: "forum_activities/{activityId}",
  region: "asia-southeast1"
}, async (event) => {
  const activityData = event.data.data();
  const activityId = event.params.activityId;

  if (!activityData) return;

  try {
    const { type, targetUserId, actorName, postTitle, postId } = activityData;

    if (targetUserId && targetUserId !== activityData.actorId) {
      await createForumNotification(
        targetUserId,
        type,
        actorName,
        postTitle,
        postId,
        activityData
      );
    }

    logger.info(`Forum activity notification sent: ${activityId}`);
  } catch (error) {
    logger.error("Error in onForumActivity:", error);
  }
});

// ✅ ACCOUNT VIOLATION & SUSPENSION NOTIFICATIONS
exports.onAccountStatusChange = onDocumentUpdated({
  document: "users/{userId}",
  region: "asia-southeast1"
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const userId = event.params.userId;

  if (!before || !after) return;

  try {
    // Check for suspension/violation status changes
    if (before.status !== after.status && 
        ['suspended', 'banned', 'under_review'].includes(after.status)) {
      
      await createAccountViolationNotification(
        userId,
        after.status,
        after.suspensionReason || after.lastViolationReason,
        after.suspensionUntil,
        after.strikes,
        after.warnings
      );
    }

    // Check for strike/warning changes
    if ((before.strikes !== after.strikes || before.warnings !== after.warnings) && 
        (after.strikes > 0 || after.warnings > 0)) {
      
      await createViolationUpdateNotification(
        userId,
        after.strikes,
        after.warnings,
        after.lastViolationReason
      );
    }

  } catch (error) {
    logger.error("Error in onAccountStatusChange:", error);
  }
});
async function sendBroadcastNotification(type, title, body, data = {}) {
  try {
    const activeUsers = await admin.firestore()
      .collection("users")
      .where("status", "==", "active")
      .where("notificationsEnabled", "!=", false)
      .get();

    const batch = admin.firestore().batch();
    let notificationCount = 0;

    // Create in-app notifications
    activeUsers.forEach(userDoc => {
      const notificationRef = admin.firestore().collection("notifications").doc();
      
      batch.set(notificationRef, {
        userId: userDoc.id,
        title: title,
        body: body,
        type: type,
        priority: data.severity === 'danger' ? 'high' : 'normal',
        status: 'unread',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        data: data,
        expiresAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        )
      });
      
      notificationCount++;
    });

    await batch.commit();
    logger.info(`✅ Created ${notificationCount} in-app notifications for ${type}`);

    // Send push notifications to users with tokens
    await sendBroadcastPushNotifications(title, body, data, activeUsers);

  } catch (error) {
    logger.error(`Error in sendBroadcastNotification:`, error);
  }
}
async function sendBroadcastPushNotifications(title, body, data, usersSnapshot) {
  try {
    const messages = [];

    usersSnapshot.forEach(userDoc => {
      const userData = userDoc.data();
      const token = userData.expoPushToken;
      
      if (token && typeof token === 'string' && token.trim()) {
        messages.push({
          to: token,
          sound: 'default',
          title: title,
          body: body.substring(0, 100),
          data: {
            ...data,
            timestamp: Date.now()
          },
          channelId: getNotificationChannel(data.type),
          priority: data.priority || 'default',
          ttl: 3600
        });
      }
    });

    if (messages.length > 0) {
      // Send in batches
      const BATCH_SIZE = 100;
      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE);
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(batch)
        });
        
        logger.info(`📨 Sent push batch ${Math.floor(i/BATCH_SIZE) + 1}`);
        
        // Delay between batches
        if (i + BATCH_SIZE < messages.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      logger.info(`✅ Sent ${messages.length} push notifications`);
    }

  } catch (error) {
    logger.error("Error in sendBroadcastPushNotifications:", error);
  }
}

/* ===================================================================
   END OF ENHANCED FIREBASE FUNCTIONS
=================================================================== */

// DITO MO ILAGAY ANG BUONG CODE NA BINIGAY KO...

/* ===================================================================
   ENHANCED NOTIFICATION HELPER FUNCTIONS
=================================================================== */

// 🔄 BROADCAST NOTIFICATION TO ALL USERS
async function sendBroadcastNotification(type, title, body, data = {}) {
  try {
    const activeUsers = await admin.firestore()
      .collection("users")
      .where("status", "==", "active")
      .where("notificationsEnabled", "!=", false)
      .get();

    const batch = admin.firestore().batch();
    let notificationCount = 0;

    // Create in-app notifications
    activeUsers.forEach(userDoc => {
      const notificationRef = admin.firestore().collection("notifications").doc();
      
      batch.set(notificationRef, {
        userId: userDoc.id,
        title: title,
        body: body,
        type: type,
        priority: data.severity === 'danger' ? 'high' : 'normal',
        status: 'unread',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        data: data,
        expiresAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        )
      });
      
      notificationCount++;
    });

    await batch.commit();
    logger.info(`✅ Created ${notificationCount} in-app notifications for ${type}`);

    // Send push notifications to users with tokens
    await sendBroadcastPushNotifications(title, body, data, activeUsers);

  } catch (error) {
    logger.error(`Error in sendBroadcastNotification:`, error);
  }
}

// 🔄 BROADCAST PUSH NOTIFICATIONS
async function sendBroadcastPushNotifications(title, body, data, usersSnapshot) {
  try {
    const messages = [];

    usersSnapshot.forEach(userDoc => {
      const userData = userDoc.data();
      const token = userData.expoPushToken;
      
      if (token && typeof token === 'string' && token.trim()) {
        messages.push({
          to: token,
          sound: 'default',
          title: title,
          body: body.substring(0, 100),
          data: {
            ...data,
            timestamp: Date.now()
          },
          channelId: getNotificationChannel(data.type),
          priority: data.priority || 'default',
          ttl: 3600
        });
      }
    });

    if (messages.length > 0) {
      // Send in batches
      const BATCH_SIZE = 100;
      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE);
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(batch)
        });
        
        logger.info(`📨 Sent push batch ${Math.floor(i/BATCH_SIZE) + 1}`);
        
        // Delay between batches
        if (i + BATCH_SIZE < messages.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      logger.info(`✅ Sent ${messages.length} push notifications`);
    }

  } catch (error) {
    logger.error("Error in sendBroadcastPushNotifications:", error);
  }
}

// 💬 CHAT NOTIFICATION HELPER
async function createChatNotification(userId, chatRoomId, senderName, messageContent, senderId) {
  try {
    const truncatedMessage = messageContent.length > 50 
      ? messageContent.substring(0, 47) + '...' 
      : messageContent;

    // In-app notification
    await admin.firestore().collection("notifications").add({
      userId: userId,
      title: `💬 Message from ${senderName}`,
      body: truncatedMessage,
      type: 'chat_message',
      priority: 'high',
      status: 'unread',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      data: {
        chatRoomId: chatRoomId,
        senderId: senderId,
        senderName: senderName,
        messagePreview: truncatedMessage,
        timestamp: new Date().toISOString()
      },
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      )
    });

    // Push notification
    const userDoc = await admin.firestore().collection("users").doc(userId).get();
    const userData = userDoc.data();
    const token = userData?.expoPushToken;

    if (token && typeof token === 'string' && token.trim()) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: token,
          sound: 'default',
          title: `💬 ${senderName}`,
          body: truncatedMessage,
          data: {
            type: 'chat_message',
            chatRoomId: chatRoomId,
            senderId: senderId,
            timestamp: Date.now()
          },
          channelId: 'chat_messages',
          priority: 'high'
        })
      });
    }

    logger.info(`✅ Chat notification sent to user ${userId}`);
  } catch (error) {
    logger.error("Error in createChatNotification:", error);
  }
}

// ⚠️ ACCOUNT VIOLATION NOTIFICATION HELPER
async function createAccountViolationNotification(userId, status, reason, suspensionUntil, strikes, warnings) {
  try {
    let title, body;

    switch (status) {
      case 'suspended':
        title = '🚫 Account Suspended';
        body = `Your account has been suspended. Reason: ${reason}`;
        if (suspensionUntil) {
          const untilDate = suspensionUntil.toDate ? suspensionUntil.toDate() : new Date(suspensionUntil);
          body += ` Suspension ends: ${untilDate.toLocaleDateString()}`;
        }
        break;
      case 'banned':
        title = '🚫 Account Permanently Banned';
        body = `Your account has been permanently banned. Reason: ${reason}`;
        break;
      case 'under_review':
        title = '⚠️ Account Under Review';
        body = `Your account is under review. Reason: ${reason}`;
        break;
      default:
        return;
    }

    // In-app notification
    await admin.firestore().collection("notifications").add({
      userId: userId,
      title: title,
      body: body,
      type: 'account_violation',
      priority: 'high',
      status: 'unread',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      data: {
        violationType: status,
        reason: reason,
        suspensionUntil: suspensionUntil,
        strikes: strikes || 0,
        warnings: warnings || 0,
        timestamp: new Date().toISOString()
      },
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      )
    });

    // Push notification
    const userDoc = await admin.firestore().collection("users").doc(userId).get();
    const userData = userDoc.data();
    const token = userData?.expoPushToken;

    if (token && typeof token === 'string' && token.trim()) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: token,
          sound: 'default',
          title: title,
          body: body,
          data: {
            type: 'account_violation',
            violationType: status,
            timestamp: Date.now()
          },
          channelId: 'account_alerts',
          priority: 'high'
        })
      });
    }

    logger.info(`✅ Account violation notification sent to user ${userId}`);
  } catch (error) {
    logger.error("Error in createAccountViolationNotification:", error);
  }
}

// 🔔 FORUM NOTIFICATION HELPER
async function createForumNotification(userId, activityType, actorName, postTitle, postId, activityData) {
  try {
    let title, body;

    switch (activityType) {
      case 'like':
        title = '❤️ Your post was liked';
        body = `${actorName} liked your post "${postTitle}"`;
        break;
      case 'reply':
        title = '💬 New reply to your post';
        body = `${actorName} replied to your post "${postTitle}"`;
        break;
      case 'mention':
        title = '👤 You were mentioned';
        body = `${actorName} mentioned you in a post`;
        break;
      default:
        return;
    }

    // In-app notification
    await admin.firestore().collection("notifications").add({
      userId: userId,
      title: title,
      body: body,
      type: 'forum_activity',
      priority: 'normal',
      status: 'unread',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      data: {
        activityType: activityType,
        actorName: actorName,
        postTitle: postTitle,
        postId: postId,
        ...activityData
      },
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      )
    });

    // Push notification
    const userDoc = await admin.firestore().collection("users").doc(userId).get();
    const userData = userDoc.data();
    const token = userData?.expoPushToken;

    if (token && typeof token === 'string' && token.trim()) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: token,
          sound: 'default',
          title: title,
          body: body,
          data: {
            type: 'forum_activity',
            activityType: activityType,
            postId: postId,
            timestamp: Date.now()
          },
          channelId: 'forum_activity',
          priority: 'normal'
        })
      });
    }

    logger.info(`✅ Forum notification sent to user ${userId}`);
  } catch (error) {
    logger.error("Error in createForumNotification:", error);
  }
}

// 🎯 NOTIFICATION CHANNEL MAPPER
function getNotificationChannel(type) {
  const channelMap = {
    'weather_alert': 'weather_alerts',
    'emergency_tip': 'emergency_alerts',
    'announcement': 'announcements',
    'chat_message': 'chat_messages',
    'forum_activity': 'forum_activity',
    'account_violation': 'account_alerts',
    'sos_call': 'sos_calls',
    'incident_report': 'report_updates'
  };
  
  return channelMap[type] || 'default';
}

/* ===================================================================
   NOTIFICATION MANAGEMENT & ADMIN FUNCTIONS
=================================================================== */

// 📊 GET NOTIFICATION STATISTICS
exports.getEnhancedNotificationStats = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get counts by type
    const [
      totalNotifications,
      weatherAlerts,
      chatMessages,
      forumActivities,
      announcements,
      emergencyTips,
      accountViolations,
      unreadNotifications
    ] = await Promise.all([
      admin.firestore().collection("notifications").count().get(),
      admin.firestore().collection("notifications")
        .where("type", "==", "weather_alert").count().get(),
      admin.firestore().collection("notifications")
        .where("type", "==", "chat_message").count().get(),
      admin.firestore().collection("notifications")
        .where("type", "==", "forum_activity").count().get(),
      admin.firestore().collection("notifications")
        .where("type", "==", "announcement").count().get(),
      admin.firestore().collection("notifications")
        .where("type", "==", "emergency_tip").count().get(),
      admin.firestore().collection("notifications")
        .where("type", "==", "account_violation").count().get(),
      admin.firestore().collection("notifications")
        .where("status", "==", "unread").count().get()
    ]);

    return {
      success: true,
      stats: {
        total: totalNotifications.data().count,
        byType: {
          weatherAlerts: weatherAlerts.data().count,
          chatMessages: chatMessages.data().count,
          forumActivities: forumActivities.data().count,
          announcements: announcements.data().count,
          emergencyTips: emergencyTips.data().count,
          accountViolations: accountViolations.data().count,
        },
        unread: unreadNotifications.data().count,
        deliveryRates: await calculateDeliveryRates()
      },
      generatedAt: new Date().toISOString()
    };

  } catch (error) {
    logger.error("Error getting enhanced notification stats:", error);
    throw new Error("Failed to generate notification statistics");
  }
});

// 📈 CALCULATE NOTIFICATION DELIVERY RATES
async function calculateDeliveryRates() {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const recentNotifications = await admin.firestore()
      .collection("notifications")
      .where("createdAt", ">", admin.firestore.Timestamp.fromDate(oneDayAgo))
      .get();

    const usersWithTokens = await admin.firestore()
      .collection("users")
      .where("expoPushToken", "!=", null)
      .where("notificationsEnabled", "!=", false)
      .get();

    const totalUsers = usersWithTokens.size;
    const totalNotifications = recentNotifications.size;

    return {
      pushCoverage: totalUsers,
      estimatedDeliveryRate: totalUsers > 0 ? Math.min(95, (totalUsers / 1000) * 100) : 0, // Estimated rate
      activeSubscribers: totalUsers
    };
  } catch (error) {
    logger.error("Error calculating delivery rates:", error);
    return { pushCoverage: 0, estimatedDeliveryRate: 0, activeSubscribers: 0 };
  }
}

// 🔧 TEST NOTIFICATION FOR SPECIFIC TYPE
exports.testNotificationType = onCall({
  region: "asia-southeast1",
  cors: true
}, async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error("Admin access required");
  }

  const { type, userId } = request.data;

  if (!type) {
    throw new Error("Notification type is required");
  }

  try {
    const testUserId = userId || request.auth.uid;
    
    const testData = {
      'chat_message': {
        title: '💬 Test Chat Message',
        body: 'This is a test chat notification',
        data: { chatRoomId: 'test', senderId: 'system' }
      },
      'weather_alert': {
        title: '🌦️ Test Weather Alert',
        body: 'This is a test weather alert notification',
        data: { alertId: 'test', severity: 'info' }
      },
      'forum_activity': {
        title: '❤️ Test Forum Activity',
        body: 'This is a test forum activity notification',
        data: { postId: 'test', activityType: 'like' }
      },
      'announcement': {
        title: '📢 Test Announcement',
        body: 'This is a test announcement notification',
        data: { announcementId: 'test' }
      },
      'account_violation': {
        title: '⚠️ Test Account Violation',
        body: 'This is a test account violation notification',
        data: { violationType: 'warning', reason: 'Test reason' }
      }
    };

    const config = testData[type] || {
      title: '🔔 Test Notification',
      body: `This is a test ${type} notification`,
      data: { type: type }
    };

    // Create test notification
    await admin.firestore().collection("notifications").add({
      userId: testUserId,
      title: config.title,
      body: config.body,
      type: type,
      priority: 'high',
      status: 'unread',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      data: {
        ...config.data,
        isTest: true,
        timestamp: new Date().toISOString()
      },
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      )
    });

    logger.info(`✅ Test ${type} notification created for user ${testUserId}`);

    return {
      success: true,
      message: `Test ${type} notification sent successfully`,
      type: type,
      userId: testUserId,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    logger.error(`Error testing ${type} notification:`, error);
    throw new Error(`Failed to send test notification: ${error.message}`);
  }
});

/* ===================================================================
   END OF ENHANCED FIREBASE FUNCTIONS
=================================================================== */