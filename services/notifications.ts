// services/notifications.ts - COMPLETE DEPLOYMENT READY VERSION
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { Alert, Platform } from 'react-native';

// Proper NotificationHandler configuration
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Comprehensive notification types
export type NotificationType =
  | 'report_submitted'
  | 'report_accepted'
  | 'report_verified'
  | 'report_rejected'
  | 'report_failed'
  | 'report_resolved'
  | 'report_assigned'
  | 'report_in_progress'
  | 'report_cancelled'
  | 'report_duplicate'
  | 'forum_reply'
  | 'forum_like_post'
  | 'forum_like_reply'
  | 'forum_mention'
  | 'forum_post_submitted'
  | 'forum_post_approved'
  | 'forum_post_rejected'
  | 'forum_new_post'
  | 'forum_comment'
  | 'chat_message'
  | 'chat_priority_change'
  | 'chat_assigned'
  | 'chat_room_created'
  | 'chat_user_joined'
  | 'chat_user_left'
  | 'account_verified'
  | 'account_password_changed'
  | 'account_login_alert'
  | 'account_suspended'
  | 'account_role_changed'
  | 'account_profile_updated'
  | 'violation'
  | 'violation_warning'
  | 'violation_strike'
  | 'violation_suspension'
  | 'violation_ban'
  | 'system_maintenance'
  | 'system_update'
  | 'system_announcement'
  | 'system_emergency_alert'
  | 'weather_alert'
  | 'emergency_broadcast'
  | 'evacuation_notice'
  | 'emergency_contact_updated'
  | 'sos_call_pending'
  | 'sos_call_confirm'
  | 'sos_call_reviewed'
  | 'sos_call_assigned'
  | 'sos_confirmation';

export interface NotificationData {
  id?: string;
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  status: 'unread' | 'read' | 'archived';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: Timestamp;
  readAt?: Timestamp;
  reportId?: string;
  forumPostId?: string;
  forumReplyId?: string;
  chatRoomId?: string;
  announcementId?: string;
  sosCallId?: string;
  data?: {
    reportType?: string;
    postTitle?: string;
    senderName?: string;
    senderAvatar?: string;
    actionUrl?: string;
    imageUrl?: string;
    violationType?: 'warning' | 'strike' | 'suspension' | 'ban';
    reason?: string;
    strikes?: number;
    warnings?: number;
    suspensionDays?: number;
    suspensionUntil?: string;
    sosId?: string;
    agencyName?: string;
    phoneNumber?: string;
    barangay?: string;
    emergencyType?: string;
    requiresConfirmation?: boolean;
    timeSinceReport?: number;
    subCategory?: string;
    [key: string]: any;
  };
}

interface NotificationSubscription {
  remove(): void;
}

export class NotificationService {
  private db = getFirestore();
  private notificationListener: NotificationSubscription | null = null;
  private responseListener: NotificationSubscription | null = null;

  async initializePushNotifications(): Promise<string | null> {
    if (!Device.isDevice) {
      console.log('Must use physical device for Push Notifications');
      return null;
    }

    if (Platform.OS === 'android') {
      await this.setupNotificationChannels();
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Push notification permissions not granted');
      return null;
    }

    try {
      const token = (await Notifications.getExpoPushTokenAsync({
        projectId: '0fb2ea21-efe5-4080-852e-51613e8be20d',
      })).data;

      await AsyncStorage.setItem('expoPushToken', token);
      this.setupNotificationListeners();
      return token;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
  }

  private setupNotificationListeners() {
    this.cleanupListeners();

    this.notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('📱 Notification received:', notification);
    });

    this.responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('📱 Notification response received:', response);
      this.handleNotificationResponse(response);
    });
  }

  private cleanupListeners() {
    if (this.notificationListener) {
      this.notificationListener.remove();
      this.notificationListener = null;
    }

    if (this.responseListener) {
      this.responseListener.remove();
      this.responseListener = null;
    }
  }

  cleanup() {
    this.cleanupListeners();
  }

  private handleNotificationResponse(response: Notifications.NotificationResponse) {
    const data = response.notification.request.content.data;
    
    if (data?.type === 'sos_confirmation') {
      this.handleSOSConfirmationNotification(data);
    } else if (data?.type === 'report_duplicate') {
      this.handleDuplicateReportNotification(data);
    } else if (data?.type && data?.notificationId) {
      console.log(`📱 Handling notification tap for type: ${data.type}`);
    }
  }

  private handleSOSConfirmationNotification(notification: any) {
    const { serviceTitle, emergencyType, reporterBarangay } = notification;
    
    Alert.alert(
      "Emergency Call Confirmation",
      `Did you complete your emergency call to ${serviceTitle}?`,
      [
        {
          text: "No, I cancelled",
          style: "cancel",
          onPress: () => {
            console.log('User cancelled the emergency call');
          }
        },
        {
          text: "Yes, I called",
          onPress: () => {
            console.log('User confirmed the emergency call');
          }
        }
      ]
    );
  }

  private handleDuplicateReportNotification(notification: any) {
    const { reportId, emergencyType, barangay, timeSinceReport, status } = notification;
    
    Alert.alert(
      "⚠️ Report Already Submitted",
      `You already submitted this ${emergencyType} report in ${barangay} ${timeSinceReport} minutes ago.\n\nCurrent Status: ${this.getStatusDisplayText(status)}`,
      [
        {
          text: "View Report",
          onPress: () => {
            console.log('Navigate to report:', reportId);
          }
        },
        {
          text: "OK",
          style: "cancel"
        }
      ]
    );
  }

  private async setupNotificationChannels() {
    if (Platform.OS !== 'android') return;

    try {
      await Notifications.setNotificationChannelAsync('reports', {
        name: 'Incident Reports',
        description: 'Updates about your incident reports',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#ef4444',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('forum', {
        name: 'Forum Activity',
        description: 'Forum posts, replies, and interactions',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 150, 150, 150],
        lightColor: '#9c27b0',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('chat', {
        name: 'Chat Messages',
        description: 'Direct messages and chat notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: '#3498db',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('account', {
        name: 'Account Security',
        description: 'Account security and profile updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 100, 100, 100],
        lightColor: '#6b7280',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('violations', {
        name: 'Account Violations',
        description: 'Warnings, strikes, and suspension notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 300, 200, 300, 200, 300],
        lightColor: '#e74c3c',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('emergency', {
        name: 'Emergency Alerts',
        description: 'Weather alerts and emergency broadcasts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 200, 500],
        lightColor: '#ff0000',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('sos_calls', {
        name: 'SOS Calls',
        description: 'Emergency SOS call confirmations and updates',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 200, 400],
        lightColor: '#d73527',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('sos_confirmation', {
        name: 'SOS Confirmations',
        description: 'SOS call confirmation reminders',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 200, 400],
        lightColor: '#d73527',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('system', {
        name: 'System Updates',
        description: 'App updates and maintenance notifications',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 100],
        lightColor: '#4ade80',
        sound: 'default',
      });
    } catch (error) {
      console.error('Error setting up notification channels:', error);
    }
  }

  async storePushToken(userId: string) {
    try {
      const token = await AsyncStorage.getItem('expoPushToken');
      if (token && userId) {
        await updateDoc(doc(this.db, 'users', userId), {
          expoPushToken: token,
          tokenUpdatedAt: Timestamp.now(),
        });
        console.log('✅ Push token stored for user:', userId);
      }
    } catch (error) {
      console.error('Error storing push token:', error);
    }
  }

  // =================== UNIVERSAL NOTIFICATION CREATOR ===================

  async createNotification(notificationData: Omit<NotificationData, 'id' | 'createdAt'>) {
    const completeNotification: Omit<NotificationData, 'id'> = {
      ...notificationData,
      createdAt: Timestamp.now(),
      priority: notificationData.priority || 'normal',
      status: notificationData.status || 'unread',
    };

    try {
      console.log('📱 Creating notification:', {
        userId: notificationData.userId,
        type: notificationData.type,
        title: notificationData.title
      });

      const docRef = await addDoc(collection(this.db, 'notifications'), completeNotification);

      // Send local notification
      await this.sendLocalNotification(
        completeNotification.title,
        completeNotification.body,
        {
          notificationId: docRef.id,
          type: completeNotification.type,
          reportId: completeNotification.reportId,
          ...completeNotification.data,
        },
        this.getChannelForType(completeNotification.type)
      );

      console.log('✅ Notification created with ID:', docRef.id);
      return docRef.id;
    } catch (error) {
      console.error('❌ Error creating notification:', error);
      throw error;
    }
  }

  // DUPLICATE REPORT NOTIFICATION METHOD
  async createDuplicateReportNotification(
    userId: string,
    duplicateReportId: string,
    emergencyType: string,
    subCategory: string,
    barangay: string,
    timeSinceReport: number,
    currentStatus: string
  ) {
    const statusText = this.getStatusDisplayText(currentStatus);
    
    return this.createNotification({
      userId,
      title: '⚠️ Report Already Submitted',
      body: `You already submitted this ${emergencyType} report in ${barangay} ${timeSinceReport} minutes ago. Current status: ${statusText}`,
      type: 'report_duplicate',
      priority: 'high',
      status: 'unread',
      reportId: duplicateReportId,
      data: {
        reportId: duplicateReportId,
        emergencyType,
        subCategory,
        barangay,
        timeSinceReport,
        status: currentStatus,
        requiresAction: true
      },
    });
  }

  // HELPER - Get status display text
  private getStatusDisplayText(status: string): string {
    const statusMap: { [key: string]: string } = {
      'pending': 'Under Review',
      'accepted': 'Accepted',
      'verified': 'Verified',
      'assigned': 'Assigned to Responder',
      'in_progress': 'In Progress',
      'resolved': 'Resolved',
      'rejected': 'Not Approved',
      'cancelled': 'Cancelled',
      'failed': 'Verification Failed'
    };
    return statusMap[status] || status;
  }

  // =================== CHAT NOTIFICATIONS ===================

  async createChatNotification(
    userId: string,
    chatRoomId: string,
    senderName: string,
    messageContent: string,
    senderId: string
  ) {
    const truncatedMessage = messageContent.length > 50 
      ? messageContent.substring(0, 47) + '...' 
      : messageContent;

    return this.createNotification({
      userId,
      title: `💬 Message from ${senderName}`,
      body: truncatedMessage,
      type: 'chat_message',
      priority: 'high',
      status: 'unread',
      chatRoomId,
      data: {
        chatRoomId,
        senderId,
        senderName,
        messagePreview: truncatedMessage,
      },
    });
  }

  // =================== WEATHER & EMERGENCY NOTIFICATIONS ===================

  async createWeatherAlertNotification(
    userId: string,
    alertId: string,
    title: string,
    description: string,
    severity: string
  ) {
    return this.createNotification({
      userId,
      title: `🌦️ ${title}`,
      body: description,
      type: 'weather_alert',
      priority: severity === 'danger' ? 'high' : 'normal',
      status: 'unread',
      data: {
        alertId,
        severity,
      },
    });
  }

  async createEmergencyTipNotification(
    userId: string,
    tipId: string,
    title: string,
    description: string,
    category: string
  ) {
    return this.createNotification({
      userId,
      title: `💡 ${title}`,
      body: description,
      type: 'emergency_broadcast',
      priority: 'normal',
      status: 'unread',
      data: {
        tipId,
        category,
      },
    });
  }

  async createAnnouncementNotification(
    userId: string,
    announcementId: string,
    title: string,
    body: string
  ) {
    return this.createNotification({
      userId,
      title: `📢 ${title}`,
      body: body,
      type: 'system_announcement',
      priority: 'normal',
      status: 'unread',
      announcementId,
      data: {
        announcementId,
      },
    });
  }

  // =================== FORUM NOTIFICATIONS ===================

  async createForumActivityNotification(
    userId: string,
    activityType: 'like' | 'reply' | 'mention',
    actorName: string,
    postTitle: string,
    postId: string
  ) {
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

    return this.createNotification({
      userId,
      title,
      body,
      type: 'forum_reply',
      priority: 'normal',
      status: 'unread',
      forumPostId: postId,
      data: {
        activityType,
        actorName,
        postTitle,
        postId,
      },
    });
  }

  async createForumPostSubmittedNotification(
    userId: string,
    postId: string,
    postTitle: string
  ) {
    return this.createNotification({
      userId,
      forumPostId: postId,
      title: 'Forum Post Submitted',
      body: `Your post "${postTitle}" has been submitted for review.`,
      type: 'forum_post_submitted',
      priority: 'normal',
      status: 'unread',
      data: { postTitle },
    });
  }

  async createForumPostApprovedNotification(
    userId: string,
    postId: string,
    postTitle: string
  ) {
    return this.createNotification({
      userId,
      forumPostId: postId,
      title: 'Forum Post Approved',
      body: `Your post "${postTitle}" has been approved and is now visible to the community.`,
      type: 'forum_post_approved',
      priority: 'high',
      status: 'unread',
      data: { postTitle },
    });
  }

  async createForumPostRejectedNotification(
    userId: string,
    postId: string,
    postTitle: string,
    reason: string
  ) {
    return this.createNotification({
      userId,
      forumPostId: postId,
      title: 'Forum Post Not Approved',
      body: `Your post "${postTitle}" was not approved. Reason: ${reason}`,
      type: 'forum_post_rejected',
      priority: 'normal',
      status: 'unread',
      data: { postTitle, reason },
    });
  }

  async createForumReplyNotification(
    userId: string,
    postId: string,
    postTitle: string,
    replierName: string,
    replyContent: string
  ) {
    const truncatedContent = replyContent.length > 100 
      ? replyContent.substring(0, 97) + '...'
      : replyContent;

    return this.createNotification({
      userId,
      forumPostId: postId,
      title: 'New Reply to Your Post',
      body: `${replierName} replied to "${postTitle}": ${truncatedContent}`,
      type: 'forum_reply',
      priority: 'high',
      status: 'unread',
      data: {
        postTitle,
        senderName: replierName,
        replyContent: truncatedContent,
      },
    });
  }

  // =================== ACCOUNT VIOLATION NOTIFICATIONS ===================

  async createAccountViolationNotification(
    userId: string,
    status: 'suspended' | 'banned' | 'under_review',
    reason: string,
    suspensionUntil?: any,
    strikes?: number,
    warnings?: number
  ) {
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

    return this.createNotification({
      userId,
      title,
      body,
      type: 'violation',
      priority: 'high',
      status: 'unread',
      data: {
        violationType: status === 'suspended' ? 'suspension' : 
                     status === 'banned' ? 'ban' : 'warning',
        reason,
        suspensionUntil,
        strikes: strikes || 0,
        warnings: warnings || 0,
      },
    });
  }

  async createWarningNotification(
    userId: string,
    reason: string,
    currentWarnings: number,
    currentStrikes: number
  ) {
    return this.createNotification({
      userId,
      title: 'Account Warning',
      body: `You have received a warning for: ${reason}. Current warnings: ${currentWarnings}`,
      type: 'violation_warning',
      priority: 'high',
      status: 'unread',
      data: {
        violationType: 'warning',
        reason,
        warnings: currentWarnings,
        strikes: currentStrikes,
      },
    });
  }

  async createStrikeNotification(
    userId: string,
    reason: string,
    currentStrikes: number,
    currentWarnings: number,
    suspensionDays?: number
  ) {
    let body = `You have received a strike for: ${reason}. Total strikes: ${currentStrikes}`;
    
    if (suspensionDays) {
      body += ` Your account is suspended for ${suspensionDays} days.`;
    } else if (currentStrikes >= 3) {
      body += ` Your account may be permanently banned.`;
    }

    return this.createNotification({
      userId,
      title: 'Account Strike',
      body,
      type: 'violation_strike',
      priority: 'urgent',
      status: 'unread',
      data: {
        violationType: 'strike',
        reason,
        strikes: currentStrikes,
        warnings: currentWarnings,
        suspensionDays,
      },
    });
  }

  // =================== SOS CALL NOTIFICATIONS ===================

  async createSOSCallPendingNotification(
    userId: string,
    sosCallId: string,
    agencyName: string,
    city: string
  ) {
    return this.createNotification({
      userId,
      sosCallId,
      title: 'SOS Call Logged',
      body: `Your emergency call to ${agencyName} in ${city} has been recorded and is pending review by CDRRMO.`,
      type: 'sos_call_pending',
      priority: 'high',
      status: 'unread',
      data: {
        sosCallId,
        agencyName,
        city,
      },
    });
  }

  async createSOSReviewedNotification(
    userId: string,
    sosId: string,
    agencyName: string,
    city: string
  ) {
    return this.createNotification({
      userId,
      sosCallId: sosId,
      title: 'SOS Call Reviewed',
      body: `Your emergency call to ${agencyName} in ${city} has been reviewed by CDRRMO.`,
      type: 'sos_call_reviewed',
      priority: 'high',
      status: 'unread',
      data: {
        sosId,
        agencyName,
        city,
      },
    });
  }

  async createSOSAssignedNotification(
    userId: string,
    sosCallId: string,
    assignedAgency: string,
    city: string
  ) {
    return this.createNotification({
      userId,
      sosCallId,
      title: 'SOS Response Assigned',
      body: `Your emergency call has been assigned to ${assignedAgency} for response in ${city}.`,
      type: 'sos_call_assigned',
      priority: 'high',
      status: 'unread',
      data: {
        sosCallId,
        assignedAgency,
        city,
      },
    });
  }

  // =================== REPORT NOTIFICATIONS ===================

  async createReportNotification(
    userId: string,
    reportId: string,
    type: NotificationType,
    reportType: string,
    customTitle?: string,
    customBody?: string,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal',
    additionalData?: any
  ) {
    const titles = {
      'report_submitted': 'Report Submitted',
      'report_accepted': 'Report Accepted',
      'report_verified': 'Report Verified',
      'report_rejected': 'Report Not Approved',
      'report_failed': 'Report Processing Failed',
      'report_resolved': 'Report Resolved',
      'report_assigned': 'Report Assigned',
      'report_in_progress': 'Report In Progress',
      'report_cancelled': 'Report Cancelled',
      'report_duplicate': 'Report Already Submitted',
    };

    const bodies = {
      'report_submitted': `Your ${reportType} report has been submitted for review.`,
      'report_accepted': `Your ${reportType} report has been accepted and assigned to responders.`,
      'report_verified': `Your ${reportType} report has been verified by our team.`,
      'report_rejected': `Your ${reportType} report was not approved. Please review guidelines.`,
      'report_failed': `There was an issue processing your ${reportType} report. Please try again.`,
      'report_resolved': `Your ${reportType} report has been resolved. Thank you for reporting.`,
      'report_assigned': `Your ${reportType} report has been assigned to a responder.`,
      'report_in_progress': `Work has begun on your ${reportType} report.`,
      'report_cancelled': `Your ${reportType} report has been cancelled.`,
      'report_duplicate': `You already submitted this ${reportType} report.`,
    };

    return this.createNotification({
      userId,
      reportId,
      title: customTitle || titles[type as keyof typeof titles] || 'Report Update',
      body: customBody || bodies[type as keyof typeof bodies] || 'Your report has been updated.',
      type,
      priority,
      status: 'unread',
      data: {
        reportType,
        ...additionalData,
      },
    });
  }

  async createReportSubmittedNotification(
    userId: string,
    reportId: string,
    location: string,
    reportType: string
  ) {
    return this.createReportNotification(
      userId,
      reportId,
      'report_submitted',
      reportType,
      'Report Submitted Successfully',
      `Your ${reportType} report at ${location} has been submitted and is under review.`,
      'normal',
      { location }
    );
  }

  async createReportAcceptedNotification(
    userId: string,
    reportId: string,
    location: string,
    reportType: string
  ) {
    return this.createReportNotification(
      userId,
      reportId,
      'report_accepted',
      reportType,
      'Report Accepted',
      `Your ${reportType} report at ${location} has been accepted by CDRRMO and assigned to responders.`,
      'high',
      { location }
    );
  }

  async createReportVerifiedNotification(
    userId: string,
    reportId: string,
    location: string,
    reportType: string
  ) {
    return this.createReportNotification(
      userId,
      reportId,
      'report_verified',
      reportType,
      'Report Verified',
      `Your ${reportType} report at ${location} has been verified and is being processed.`,
      'high',
      { location }
    );
  }

  async createReportRejectedNotification(
    userId: string,
    reportId: string,
    location: string,
    reportType: string,
    reason?: string
  ) {
    const body = reason 
      ? `Your ${reportType} report at ${location} was not approved. Reason: ${reason}`
      : `Your ${reportType} report at ${location} was not approved. Please review our guidelines.`;
    
    return this.createReportNotification(
      userId,
      reportId,
      'report_rejected',
      reportType,
      'Report Under Review',
      body,
      'normal',
      { location, reason }
    );
  }

  async createReportResolvedNotification(
    userId: string,
    reportId: string,
    location: string,
    reportType: string
  ) {
    return this.createReportNotification(
      userId,
      reportId,
      'report_resolved',
      reportType,
      'Report Resolved',
      `Your ${reportType} report at ${location} has been resolved. Thank you for helping keep our community safe.`,
      'normal',
      { location }
    );
  }

  // =================== NOTIFICATION MANAGEMENT ===================

  getUserNotifications(
    userId: string,
    callback: (notifications: NotificationData[]) => void,
    limitCount = 50
  ): () => void {
    const q = query(
      collection(this.db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const notifications: NotificationData[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as NotificationData),
        }));
        callback(notifications);
      },
      (error) => {
        console.error('Error fetching notifications:', error);
        callback([]);
      }
    );

    return unsubscribe;
  }

  async markAsRead(notificationId: string) {
    try {
      await updateDoc(doc(this.db, 'notifications', notificationId), {
        status: 'read',
        readAt: Timestamp.now(),
      });
      console.log('✅ Notification marked as read:', notificationId);
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
      throw error;
    }
  }

  async markMultipleAsRead(notificationIds: string[]) {
    try {
      if (notificationIds.length === 0) return;

      const batch = writeBatch(this.db);
      notificationIds.forEach((id) => {
        if (id) {
          batch.update(doc(this.db, 'notifications', id), {
            status: 'read',
            readAt: Timestamp.now(),
          });
        }
      });
      await batch.commit();
      console.log(`✅ ${notificationIds.length} notifications marked as read`);
    } catch (error) {
      console.error('❌ Error marking multiple notifications as read:', error);
      throw error;
    }
  }

  async deleteNotification(notificationId: string) {
    try {
      await deleteDoc(doc(this.db, 'notifications', notificationId));
      console.log('✅ Notification deleted:', notificationId);
    } catch (error) {
      console.error('❌ Error deleting notification:', error);
      throw error;
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    try {
      const q = query(
        collection(this.db, 'notifications'),
        where('userId', '==', userId),
        where('status', '==', 'unread')
      );
      const snapshot = await getDocs(q);
      return snapshot.size;
    } catch (error) {
      console.error('❌ Error getting unread count:', error);
      return 0;
    }
  }

  async clearAllNotifications(userId: string) {
    try {
      const q = query(
        collection(this.db, 'notifications'),
        where('userId', '==', userId)
      );
      const snapshot = await getDocs(q);
      
      const batch = writeBatch(this.db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      console.log(`✅ All notifications cleared for user: ${userId}`);
    } catch (error) {
      console.error('❌ Error clearing all notifications:', error);
      throw error;
    }
  }

  // =================== UTILITY METHODS ===================
  
  private getChannelForType(type: NotificationType): string {
    if (type.startsWith('report_')) return 'reports';
    if (type.startsWith('forum_')) return 'forum';
    if (type.startsWith('chat_')) return 'chat';
    if (type.startsWith('account_')) return 'account';
    if (type.startsWith('violation')) return 'violations';
    if (type === 'violation') return 'violations';
    if (type.startsWith('sos_')) return 'sos_calls';
    if (type === 'sos_confirmation') return 'sos_confirmation';
    if (type.includes('emergency') || type.includes('weather') || type.includes('evacuation')) return 'emergency';
    return 'system';
  }

  private async sendLocalNotification(
    title: string,
    body: string,
    data?: any,
    androidChannelId: string = 'system'
  ) {
    try {
      const notificationRequest: Notifications.NotificationRequestInput = {
        content: {
          title,
          body,
          data,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null,
      };

      if (Platform.OS === 'android') {
        await Notifications.scheduleNotificationAsync({
          ...notificationRequest,
          identifier: `${androidChannelId}-${Date.now()}`,
        });
      } else {
        await Notifications.scheduleNotificationAsync(notificationRequest);
      }
      
      console.log('📱 Local notification sent:', title);
    } catch (error) {
      console.error('❌ Error sending local notification:', error);
    }
  }

  formatNotificationTime(timestamp: Timestamp): string {
    const now = new Date();
    const notificationTime = timestamp.toDate();
    const diffInMinutes = Math.floor((now.getTime() - notificationTime.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays}d ago`;

    return notificationTime.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  getNotificationIcon(type: NotificationType): string {
    const iconMap: Record<string, string> = {
      'report_submitted': '📝',
      'report_accepted': '✅',
      'report_verified': '✅',
      'report_rejected': '❌',
      'report_failed': '⚠️',
      'report_resolved': '✅',
      'report_assigned': '👷',
      'report_in_progress': '🔄',
      'report_cancelled': '❌',
      'report_duplicate': '⚠️',
      'forum_reply': '💬',
      'forum_like_post': '❤️',
      'forum_like_reply': '❤️',
      'forum_mention': '🔔',
      'forum_post_submitted': '📝',
      'forum_post_approved': '✅',
      'forum_post_rejected': '❌',
      'forum_new_post': '💬',
      'forum_comment': '💬',
      'chat_message': '💬',
      'chat_priority_change': '⚡',
      'chat_assigned': '👷',
      'chat_room_created': '💬',
      'chat_user_joined': '👥',
      'chat_user_left': '👥',
      'account_verified': '✅',
      'account_password_changed': '🔐',
      'account_login_alert': '🔐',
      'account_suspended': '⏸️',
      'account_role_changed': '👤',
      'account_profile_updated': '👤',
      'weather_alert': '🌦️',
      'emergency_broadcast': '🚨',
      'evacuation_notice': '🚨',
      'emergency_contact_updated': '📞',
      'violation': '⚠️',
      'violation_warning': '⚠️',
      'violation_strike': '🔺',
      'violation_suspension': '⏸️',
      'violation_ban': '🚫',
      'sos_call_pending': '🚨',
      'sos_call_confirm': '📞',
      'sos_call_reviewed': '✅',
      'sos_call_assigned': '👷',
      'sos_confirmation': '📞',
      'system_maintenance': '🔧',
      'system_update': '🔄',
      'system_announcement': '📢',
      'system_emergency_alert': '🚨'
    };
    return iconMap[type] || '🔔';
  }

  getPriorityColor(priority: 'low' | 'normal' | 'high' | 'urgent'): string {
    const colorMap = {
      'low': '#6b7280',
      'normal': '#3b82f6',
      'high': '#f59e0b',
      'urgent': '#ef4444',
    };
    return colorMap[priority] || colorMap.normal;
  }

  // Batch notification operations
  async batchUpdateNotifications(notificationIds: string[], updates: Partial<NotificationData>) {
    try {
      const batch = writeBatch(this.db);
      notificationIds.forEach((id) => {
        if (id) {
          const notificationRef = doc(this.db, 'notifications', id);
          batch.update(notificationRef, updates);
        }
      });
      await batch.commit();
      console.log(`✅ ${notificationIds.length} notifications updated`);
    } catch (error) {
      console.error('❌ Error batch updating notifications:', error);
      throw error;
    }
  }

  // Get notifications by type
  async getNotificationsByType(userId: string, type: NotificationType): Promise<NotificationData[]> {
    try {
      const q = query(
        collection(this.db, 'notifications'),
        where('userId', '==', userId),
        where('type', '==', type),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as NotificationData),
      }));
    } catch (error) {
      console.error('❌ Error getting notifications by type:', error);
      return [];
    }
  }

  // Get recent notifications (last 7 days)
  async getRecentNotifications(userId: string, days: number = 7): Promise<NotificationData[]> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - days);
      
      const q = query(
        collection(this.db, 'notifications'),
        where('userId', '==', userId),
        where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo)),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as NotificationData),
      }));
    } catch (error) {
      console.error('❌ Error getting recent notifications:', error);
      return [];
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();