//functions/index.js - Enhanced with Timestamp Processing
const {setGlobalOptions} = require("firebase-functions");
const {onCall} = require("firebase-functions/v2/https");
const {onDocumentUpdated, onDocumentCreated} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onObjectFinalized} = require("firebase-functions/v2/storage");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const sharp = require('sharp');

// Initialize Firebase Admin
admin.initializeApp();

// Set global options for cost control
setGlobalOptions({ maxInstances: 10 });

// =================== NEW TIMESTAMP PROCESSING FUNCTION ===================

// Process incident photos with timestamp embedding
exports.processIncidentPhoto = onObjectFinalized({
  bucket: "lipaalerthub.firebasestorage.app"
}, async (event) => {
  const filePath = event.data.name;
  
  // Only process incident photos
  if (!filePath.includes('incident_photos/')) {
    logger.info('Skipping non-incident photo:', filePath);
    return;
  }
  
  const metadata = event.data.metadata || {};
  
  // Only process if embedTimestamp is true and not already processed
  if (metadata.embedTimestamp !== 'true' || metadata.processed === 'true') {
    logger.info('Photo does not need timestamp processing:', filePath);
    return;
  }
  
  logger.info('Processing photo with timestamp:', filePath);
  
  try {
    const bucket = admin.storage().bucket();
    const file = bucket.file(filePath);
    
    // Download original image
    const [imageBuffer] = await file.download();
    
    // Get image metadata
    const { width, height } = await sharp(imageBuffer).metadata();
    
    // Create timestamp text
    const timestampText = metadata.timestampText || 'No timestamp available';
    const lines = timestampText.split('\n');
    
    // Calculate positioning (bottom-right corner)
    const fontSize = Math.max(16, Math.min(width, height) * 0.025);
    const padding = fontSize * 0.8;
    const lineHeight = fontSize * 1.2;
    
    // Calculate background dimensions
    const maxLineLength = Math.max(...lines.map(line => line.length));
    const bgWidth = Math.max(200, maxLineLength * fontSize * 0.6);
    const bgHeight = lines.length * lineHeight + padding * 2;
    
    // Create SVG overlay with timestamp
    const svgOverlay = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="1" dy="1" stdDeviation="2" flood-color="black" flood-opacity="0.8"/>
          </filter>
        </defs>
        
        <!-- Background rectangle -->
        <rect x="${width - bgWidth - padding}" y="${height - bgHeight - padding}" 
              width="${bgWidth + padding}" height="${bgHeight}" 
              fill="rgba(0,0,0,0.85)" rx="8"/>
        
        <!-- Timestamp text lines -->
        ${lines.map((line, index) => {
          const yPos = height - (lines.length - index - 1) * lineHeight - padding * 1.5;
          const isDateLine = index === 0;
          const isTimeLine = index === 1;
          
          return `
            <text x="${width - bgWidth/2 - padding}" y="${yPos}" 
                  text-anchor="middle" 
                  fill="${isTimeLine ? '#e74c3c' : 'white'}" 
                  font-family="${isDateLine ? 'monospace' : 'Arial'}" 
                  font-size="${isDateLine ? fontSize : fontSize * 0.85}" 
                  font-weight="bold" 
                  filter="url(#shadow)">
              ${line}
            </text>
          `;
        }).join('')}
        
        <!-- Verification icon -->
        <circle cx="${width - padding - 15}" cy="${height - bgHeight - padding + 15}" r="8" 
                fill="#27ae60" stroke="white" stroke-width="1"/>
        <text x="${width - padding - 15}" y="${height - bgHeight - padding + 20}" 
              text-anchor="middle" fill="white" font-size="10" font-weight="bold">✓</text>
      </svg>
    `;
    
    // Composite the image with timestamp overlay
    const processedImage = await sharp(imageBuffer)
      .composite([{
        input: Buffer.from(svgOverlay),
        gravity: 'southeast'
      }])
      .jpeg({ quality: 90 })
      .toBuffer();
    
    // Save processed image back to storage
    await file.save(processedImage, {
      metadata: {
        contentType: 'image/jpeg',
        metadata: {
          ...metadata,
          processed: 'true',
          processedAt: new Date().toISOString(),
          originalSize: imageBuffer.length,
          processedSize: processedImage.length,
          timestampEmbedded: 'true'
        }
      }
    });
    
    logger.info('Successfully processed photo with timestamp:', filePath);
    
  } catch (error) {
    logger.error('Error processing photo with timestamp:', error);
    
    // Mark as failed processing
    try {
      const bucket = admin.storage().bucket();
      const file = bucket.file(filePath);
      await file.setMetadata({
        metadata: {
          ...metadata,
          processed: 'failed',
          processedAt: new Date().toISOString(),
          error: error.message
        }
      });
    } catch (metadataError) {
      logger.error('Error updating failed processing metadata:', metadataError);
    }
  }
});

// =================== EXISTING REPORT FUNCTIONS (UNCHANGED) ===================

// Trigger when a report status is updated
exports.onReportStatusUpdate = onDocumentUpdated("incident_reports/{reportId}", async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();
  const reportId = event.params.reportId;

  // Check if status changed
  if (beforeData.status !== afterData.status) {
    logger.info(`Report ${reportId} status changed from ${beforeData.status} to ${afterData.status}`);
    
    // Create notification
    await createStatusChangeNotification(
      afterData.reporterId,
      reportId,
      afterData.status,
      afterData.location.address || `${afterData.location.latitude}, ${afterData.location.longitude}`,
      afterData.emergencyType
    );

    // Send push notification
    await sendPushNotification(afterData.reporterId, afterData.status, afterData.emergencyType, reportId);
  }
});

// HTTP function to update report status (for admin web interface)
exports.updateReportStatus = onCall(async (request) => {
  // Check if user is authenticated and is admin
  if (!request.auth) {
    throw new Error('User must be authenticated');
  }

  if (!request.auth.token.admin) {
    throw new Error('User must be an admin');
  }

  const { reportId, newStatus, adminNote } = request.data;

  if (!reportId || !newStatus) {
    throw new Error('reportId and newStatus are required');
  }

  const validStatuses = ['pending', 'verified', 'rejected', 'failed', 'resolved'];
  if (!validStatuses.includes(newStatus)) {
    throw new Error('Invalid status provided');
  }

  try {
    const updateData = {
      status: newStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    };

    if (adminNote) {
      updateData.adminNote = adminNote;
    }

    await admin.firestore()
      .collection('incident_reports')
      .doc(reportId)
      .update(updateData);

    return { success: true, message: 'Report status updated successfully' };
  } catch (error) {
    logger.error('Error updating report status:', error);
    throw new Error('Failed to update report status');
  }
});

// Function to set admin custom claims
exports.setAdminClaim = onCall(async (request) => {
  // Only allow if user is already an admin or is setting up initial admin
  if (request.auth && request.auth.token.admin !== true) {
    // Check if this is initial setup (no admins exist yet)
    const adminQuery = await admin.firestore()
      .collection('admin_users')
      .limit(1)
      .get();
    
    if (!adminQuery.empty) {
      throw new Error('Only admins can set admin claims');
    }
  }

  const { uid } = request.data;
  
  if (!uid) {
    throw new Error('User ID is required');
  }

  try {
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    
    // Add to admin_users collection
    await admin.firestore().collection('admin_users').doc(uid).set({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: request.auth ? request.auth.uid : 'system',
    });

    return { success: true, message: 'Admin privileges granted' };
  } catch (error) {
    logger.error('Error setting admin claim:', error);
    throw new Error('Failed to set admin privileges');
  }
});

// Function to clean up old notifications (run daily at 2 AM Manila time)
exports.cleanupOldNotifications = onSchedule({
  schedule: '0 2 * * *',
  timeZone: 'Asia/Manila'
}, async (event) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  try {
    const oldNotifications = await admin.firestore()
      .collection('notifications')
      .where('createdAt', '<', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .get();

    const batch = admin.firestore().batch();
    oldNotifications.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    logger.info(`Cleaned up ${oldNotifications.size} old notifications`);
  } catch (error) {
    logger.error('Error cleaning up notifications:', error);
  }
});

// Function to get report statistics (for admin dashboard)
exports.getReportStats = onCall(async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error('Admin access required');
  }

  try {
    const reportsSnapshot = await admin.firestore().collection('incident_reports').get();
    const reports = reportsSnapshot.docs.map(doc => doc.data());

    const stats = {
      total: reports.length,
      pending: reports.filter(r => r.status === 'pending').length,
      verified: reports.filter(r => r.status === 'verified').length,
      rejected: reports.filter(r => r.status === 'rejected').length,
      failed: reports.filter(r => r.status === 'failed').length,
      resolved: reports.filter(r => r.status === 'resolved').length,
    };

    return stats;
  } catch (error) {
    logger.error('Error getting report stats:', error);
    throw new Error('Failed to get statistics');
  }
});

// =================== FORUM FUNCTIONS ===================

// Trigger when a forum reply is created
exports.onForumReplyCreated = onDocumentCreated("forumReplies/{replyId}", async (event) => {
  const replyData = event.data.data();
  const replyId = event.params.replyId;

  try {
    // Get the original post
    const postDoc = await admin.firestore().collection('forumPosts').doc(replyData.postId).get();
    
    if (!postDoc.exists) {
      logger.error('Post not found for reply notification');
      return;
    }

    const postData = postDoc.data();
    
    // Don't notify if replying to own post
    if (postData.userId === replyData.userId) {
      logger.info('User replied to own post, skipping notification');
      return;
    }

    // Create notification for post author
    await createForumReplyNotification(
      postData.userId,
      replyData.postId,
      postData.title,
      replyData.userName,
      replyData.content
    );

    // Send push notification
    await sendForumPushNotification(
      postData.userId,
      'forum_reply',
      `${replyData.userName} replied to your post`,
      `"${postData.title}"`,
      { forumPostId: replyData.postId, type: 'forum_reply' }
    );

    logger.info(`Forum reply notification sent for post ${replyData.postId}`);
  } catch (error) {
    logger.error('Error processing forum reply notification:', error);
  }
});

// Trigger when a post like is created
exports.onPostLikeCreated = onDocumentCreated("postLikes/{likeId}", async (event) => {
  const likeData = event.data.data();

  try {
    if (likeData.type === 'post') {
      // Get the post
      const postDoc = await admin.firestore().collection('forumPosts').doc(likeData.targetId).get();
      
      if (!postDoc.exists) {
        logger.error('Post not found for like notification');
        return;
      }

      const postData = postDoc.data();
      
      // Don't notify if liking own post
      if (postData.userId === likeData.userId) {
        return;
      }

      // Get liker's name
      const likerDoc = await admin.firestore().collection('users').doc(likeData.userId).get();
      const likerName = likerDoc.exists ? (likerDoc.data().displayName || 'Someone') : 'Someone';

      // Create notification
      await createForumPostLikeNotification(
        postData.userId,
        likeData.targetId,
        postData.title,
        likerName
      );

      // Send push notification
      await sendForumPushNotification(
        postData.userId,
        'forum_like_post',
        'Your post was liked',
        `${likerName} liked your post "${postData.title}"`,
        { forumPostId: likeData.targetId, type: 'forum_like_post' }
      );

    } else if (likeData.type === 'reply') {
      // Get the reply
      const replyDoc = await admin.firestore().collection('forumReplies').doc(likeData.targetId).get();
      
      if (!replyDoc.exists) {
        logger.error('Reply not found for like notification');
        return;
      }

      const replyData = replyDoc.data();
      
      // Don't notify if liking own reply
      if (replyData.userId === likeData.userId) {
        return;
      }

      // Get the post title
      const postDoc = await admin.firestore().collection('forumPosts').doc(replyData.postId).get();
      const postTitle = postDoc.exists ? postDoc.data().title : 'a post';

      // Get liker's name
      const likerDoc = await admin.firestore().collection('users').doc(likeData.userId).get();
      const likerName = likerDoc.exists ? (likerDoc.data().displayName || 'Someone') : 'Someone';

      // Create notification
      await createForumReplyLikeNotification(
        replyData.userId,
        replyData.postId,
        likeData.targetId,
        postTitle,
        likerName
      );

      // Send push notification
      await sendForumPushNotification(
        replyData.userId,
        'forum_like_reply',
        'Your reply was liked',
        `${likerName} liked your reply on "${postTitle}"`,
        { forumPostId: replyData.postId, forumReplyId: likeData.targetId, type: 'forum_like_reply' }
      );
    }

    logger.info(`Forum like notification sent for ${likeData.type} ${likeData.targetId}`);
  } catch (error) {
    logger.error('Error processing forum like notification:', error);
  }
});

// Function to get forum statistics (for admin dashboard)
exports.getForumStats = onCall(async (request) => {
  if (!request.auth || !request.auth.token.admin) {
    throw new Error('Admin access required');
  }

  try {
    const postsSnapshot = await admin.firestore().collection('forumPosts').get();
    const repliesSnapshot = await admin.firestore().collection('forumReplies').get();
    const likesSnapshot = await admin.firestore().collection('postLikes').get();

    const stats = {
      totalPosts: postsSnapshot.size,
      totalReplies: repliesSnapshot.size,
      totalLikes: likesSnapshot.size,
      averageRepliesPerPost: postsSnapshot.size > 0 ? Math.round(repliesSnapshot.size / postsSnapshot.size * 100) / 100 : 0,
    };

    return stats;
  } catch (error) {
    logger.error('Error getting forum stats:', error);
    throw new Error('Failed to get forum statistics');
  }
});

// =================== NOTIFICATION CREATION FUNCTIONS ===================

// Function to create notification document (existing)
async function createStatusChangeNotification(userId, reportId, newStatus, location, emergencyType) {
  const statusMessages = {
    verified: {
      title: 'Report Verified',
      body: `Your ${emergencyType} report at ${location} has been verified. Response teams have been notified.`,
      type: 'report_verified',
    },
    approved: {
      title: 'Report Approved', 
      body: `Your ${emergencyType} report at ${location} has been approved and is being processed.`,
      type: 'report_approved',
    },
    rejected: {
      title: 'Report Under Review',
      body: `Your ${emergencyType} report at ${location} is currently under verification. CDRRMO may contact you for further information.`,
      type: 'report_rejected',
    },
    failed: {
      title: 'Report Verification Failed',
      body: `Your ${emergencyType} report at ${location} verification failed due to insufficient information.`,
      type: 'report_failed',
    },
    resolved: {
      title: 'Report Resolved',
      body: `Your ${emergencyType} report at ${location} has been resolved.`,
      type: 'report_resolved',
    },
  };

  const messageData = statusMessages[newStatus];
  if (!messageData) return;

  const notificationData = {
    userId,
    reportId,
    title: messageData.title,
    body: messageData.body,
    type: messageData.type,
    status: 'unread',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    data: {
      reportStatus: newStatus,
      reportLocation: location,
      reportType: emergencyType,
    },
  };

  try {
    await admin.firestore().collection('notifications').add(notificationData);
    logger.info('Notification created successfully');
  } catch (error) {
    logger.error('Error creating notification:', error);
  }
}

// Function to create forum reply notification
async function createForumReplyNotification(userId, postId, postTitle, replierName, replyContent) {
  const notificationData = {
    userId,
    forumPostId: postId,
    title: 'New Reply on Your Post',
    body: `${replierName} replied to your post "${postTitle.length > 30 ? postTitle.substring(0, 30) + '...' : postTitle}"`,
    type: 'forum_reply',
    status: 'unread',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    data: {
      postTitle,
      replierName,
      replyContent: replyContent.length > 100 ? replyContent.substring(0, 100) + '...' : replyContent,
    },
  };

  try {
    await admin.firestore().collection('notifications').add(notificationData);
    logger.info('Forum reply notification created successfully');
  } catch (error) {
    logger.error('Error creating forum reply notification:', error);
  }
}

// Function to create forum post like notification
async function createForumPostLikeNotification(userId, postId, postTitle, likerName) {
  const notificationData = {
    userId,
    forumPostId: postId,
    title: 'Your Post Was Liked',
    body: `${likerName} liked your post "${postTitle.length > 40 ? postTitle.substring(0, 40) + '...' : postTitle}"`,
    type: 'forum_like_post',
    status: 'unread',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    data: {
      postTitle,
      likerName,
    },
  };

  try {
    await admin.firestore().collection('notifications').add(notificationData);
    logger.info('Forum post like notification created successfully');
  } catch (error) {
    logger.error('Error creating forum post like notification:', error);
  }
}

// Function to create forum reply like notification
async function createForumReplyLikeNotification(userId, postId, replyId, postTitle, likerName) {
  const notificationData = {
    userId,
    forumPostId: postId,
    forumReplyId: replyId,
    title: 'Your Reply Was Liked',
    body: `${likerName} liked your reply on "${postTitle.length > 40 ? postTitle.substring(0, 40) + '...' : postTitle}"`,
    type: 'forum_like_reply',
    status: 'unread',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    data: {
      postTitle,
      likerName,
    },
  };

  try {
    await admin.firestore().collection('notifications').add(notificationData);
    logger.info('Forum reply like notification created successfully');
  } catch (error) {
    logger.error('Error creating forum reply like notification:', error);
  }
}

// =================== PUSH NOTIFICATION FUNCTIONS ===================

// Function to send push notification using Expo (existing)
async function sendPushNotification(userId, status, emergencyType, reportId) {
  try {
    // Get user's Expo push token from their profile
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      logger.info('User document not found');
      return;
    }

    const userData = userDoc.data();
    const expoPushToken = userData.expoPushToken;

    if (!expoPushToken) {
      logger.info('No Expo push token found for user');
      return;
    }

    const statusTitles = {
      verified: 'Report Verified ✅',
      approved: 'Report Approved 👍',
      rejected: 'Report Under Review ⏳',
      failed: 'Verification Failed ❌',
      resolved: 'Report Resolved ✅',
    };

    const message = {
      to: expoPushToken,
      sound: 'default',
      title: statusTitles[status] || 'Report Update',
      body: `Your ${emergencyType} report status has been updated. Tap to view details.`,
      data: { 
        reportId: reportId,
        reportStatus: status,
        type: 'report_update'
      },
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    logger.info('Successfully sent push notification:', result);
  } catch (error) {
    logger.error('Error sending push notification:', error);
  }
}

// Function to send forum push notifications
async function sendForumPushNotification(userId, notificationType, title, body, data) {
  try {
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      logger.info('User document not found for forum notification');
      return;
    }

    const userData = userDoc.data();
    const expoPushToken = userData.expoPushToken;

    if (!expoPushToken) {
      logger.info('No Expo push token found for forum notification');
      return;
    }

    const forumIcons = {
      forum_reply: '💬',
      forum_like_post: '❤️',
      forum_like_reply: '👍',
    };

    const message = {
      to: expoPushToken,
      sound: 'default',
      title: `${forumIcons[notificationType] || '📢'} ${title}`,
      body: body,
      data: data,
      channelId: 'forum',
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    logger.info('Successfully sent forum push notification:', result);
  } catch (error) {
    logger.error('Error sending forum push notification:', error);
  }
}