// services/notifications.ts - Fixed deprecation warnings + Added "accepted" status support
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
import { Platform } from 'react-native';

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Comprehensive notification types - ADDED "report_accepted"
export type NotificationType =
  // Report/Incident notifications
  | 'report_submitted'
  | 'report_accepted'  // ✅ ADDED FOR ACCEPTED STATUS
  | 'report_verified'
  | 'report_approved'
  | 'report_rejected'
  | 'report_failed'
  | 'report_resolved'
  | 'report_assigned'
  | 'report_in_progress'
  | 'report_cancelled'
  // Forum notifications
  | 'forum_reply'
  | 'forum_like_post'
  | 'forum_like_reply'
  | 'forum_mention'
  | 'forum_post_submitted'
  | 'forum_post_approved'
  | 'forum_post_rejected'
  | 'forum_new_post'
  | 'forum_comment'
  // Chat notifications
  | 'chat_message'
  | 'chat_priority_change'
  | 'chat_assigned'
  | 'chat_room_created'
  | 'chat_user_joined'
  | 'chat_user_left'
  // Account notifications
  | 'account_verified'
  | 'account_password_changed'
  | 'account_login_alert'
  | 'account_suspended'
  | 'account_role_changed'
  | 'account_profile_updated'
  // System notifications
  | 'system_maintenance'
  | 'system_update'
  | 'system_announcement'
  | 'system_emergency_alert'
  // Weather/Alert notifications
  | 'weather_alert'
  | 'emergency_broadcast'
  | 'evacuation_notice'
  // Emergency contacts
  | 'emergency_contact_updated';

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
  // Related IDs for navigation
  reportId?: string;
  forumPostId?: string;
  forumReplyId?: string;
  chatRoomId?: string;
  announcementId?: string;
  // Additional data for context
  data?: {
    reportType?: string;
    postTitle?: string;
    senderName?: string;
    senderAvatar?: string;
    actionUrl?: string;
    imageUrl?: string;
    [key: string]: any;
  };
}

// FIXED: Proper subscription interface
interface NotificationSubscription {
  remove(): void;
}

export class NotificationService {
  private db = getFirestore();
  
  // FIXED: Store subscriptions properly for cleanup
  private notificationListener: NotificationSubscription | null = null;
  private responseListener: NotificationSubscription | null = null;

  // FIXED: Initialize push notifications with proper cleanup handling
  async initializePushNotifications(): Promise<string | null> {
    // Check device compatibility
    if (!Device.isDevice) {
      console.log('Must use physical device for Push Notifications');
      return null;
    }

    // Setup Android notification channels
    if (Platform.OS === 'android') {
      await this.setupNotificationChannels();
    }

    // Request permissions
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
      
      // Setup notification listeners with proper cleanup
      this.setupNotificationListeners();
      
      return token;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
  }

  // FIXED: Setup notification listeners with proper subscription management
  private setupNotificationListeners() {
    // Clean up existing listeners first
    this.cleanupListeners();

    // FIXED: Use the new subscription pattern
    this.notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
      // Handle received notification
    });

    this.responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response received:', response);
      // Handle notification tap/interaction
      this.handleNotificationResponse(response);
    });
  }

  // FIXED: Proper cleanup method using subscription.remove()
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

  // FIXED: Public cleanup method for component unmounting
  cleanup() {
    this.cleanupListeners();
  }

  // Handle notification response (when user taps notification)
  private handleNotificationResponse(response: Notifications.NotificationResponse) {
    const data = response.notification.request.content.data;
    
    // Navigate based on notification type
    if (data?.type && data?.notificationId) {
      console.log(`Handling notification tap for type: ${data.type}`);
      // Add your navigation logic here
      // e.g., navigate to specific screens based on notification type
    }
  }

  private async setupNotificationChannels() {
    // Create detailed notification channels for Android
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

    await Notifications.setNotificationChannelAsync('emergency', {
      name: 'Emergency Alerts',
      description: 'Weather alerts and emergency broadcasts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500],
      lightColor: '#ff0000',
      sound: 'default',
      bypassDnd: true,
    });

    await Notifications.setNotificationChannelAsync('system', {
      name: 'System Updates',
      description: 'App updates and maintenance notifications',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 100],
      lightColor: '#4ade80',
      sound: 'default',
    });
  }

  // Store push token in user profile
  async storePushToken(userId: string) {
    try {
      const token = await AsyncStorage.getItem('expoPushToken');
      if (token && userId) {
        await updateDoc(doc(this.db, 'users', userId), {
          expoPushToken: token,
          tokenUpdatedAt: Timestamp.now(),
        });
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
      const docRef = await addDoc(collection(this.db, 'notifications'), completeNotification);

      // Send local push notification
      await this.sendLocalNotification(
        completeNotification.title,
        completeNotification.body,
        {
          notificationId: docRef.id,
          type: completeNotification.type,
          ...completeNotification.data,
        },
        this.getChannelForType(completeNotification.type)
      );

      return docRef.id;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  // =================== REPORT NOTIFICATIONS - UPDATED WITH "ACCEPTED" ===================

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
      'report_accepted': 'Report Accepted',  // ✅ ADDED
      'report_verified': 'Report Verified',
      'report_approved': 'Report Approved',
      'report_rejected': 'Report Not Approved',
      'report_failed': 'Report Processing Failed',
      'report_resolved': 'Report Resolved',
      'report_assigned': 'Report Assigned',
      'report_in_progress': 'Report In Progress',
      'report_cancelled': 'Report Cancelled',
    };

    const bodies = {
      'report_submitted': `Your ${reportType} report has been submitted for review.`,
      'report_accepted': `Your ${reportType} report has been accepted and assigned to responders.`,  // ✅ ADDED
      'report_verified': `Your ${reportType} report has been verified by our team.`,
      'report_approved': `Your ${reportType} report has been approved and is now visible.`,
      'report_rejected': `Your ${reportType} report was not approved. Please review guidelines.`,
      'report_failed': `There was an issue processing your ${reportType} report. Please try again.`,
      'report_resolved': `Your ${reportType} report has been resolved. Thank you for reporting.`,
      'report_assigned': `Your ${reportType} report has been assigned to a responder.`,
      'report_in_progress': `Work has begun on your ${reportType} report.`,
      'report_cancelled': `Your ${reportType} report has been cancelled.`,
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

  // =================== SPECIFIC REPORT NOTIFICATION METHODS ===================

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

  // ✅ NEW: Added missing createReportAcceptedNotification method
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
      `Your ${reportType} report at ${location} has been accepted by CDRRMO and assigned to responders. You will be notified with further updates.`,
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

  async createReportApprovedNotification(
    userId: string,
    reportId: string,
    location: string,
    reportType: string
  ) {
    return this.createReportNotification(
      userId,
      reportId,
      'report_approved',
      reportType,
      'Report Approved',
      `Your ${reportType} report at ${location} has been approved and is now visible to authorities.`,
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
      : `Your ${reportType} report at ${location} was not approved. Please review our guidelines and try again.`;
    
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

  // =================== FORUM NOTIFICATION METHODS ===================

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
      data: {
        postTitle,
      },
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
      data: {
        postTitle,
      },
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
      data: {
        postTitle,
        reason,
      },
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

  async createForumPostLikeNotification(
    userId: string,
    postId: string,
    postTitle: string,
    likerName: string
  ) {
    return this.createNotification({
      userId,
      forumPostId: postId,
      title: 'Your Post Was Liked',
      body: `${likerName} liked your post "${postTitle}"`,
      type: 'forum_like_post',
      priority: 'normal',
      status: 'unread',
      data: {
        postTitle,
        senderName: likerName,
      },
    });
  }

  async createForumReplyLikeNotification(
    userId: string,
    postId: string,
    replyId: string,
    postTitle: string,
    likerName: string
  ) {
    return this.createNotification({
      userId,
      forumPostId: postId,
      forumReplyId: replyId,
      title: 'Your Reply Was Liked',
      body: `${likerName} liked your reply on "${postTitle}"`,
      type: 'forum_like_reply',
      priority: 'normal',
      status: 'unread',
      data: {
        postTitle,
        senderName: likerName,
      },
    });
  }

  // =================== NOTIFICATION MANAGEMENT ===================

  // Subscribe to user notifications in real time with proper cleanup
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

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifications: NotificationData[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as NotificationData),
      }));
      callback(notifications);
    });

    // Return unsubscribe function
    return unsubscribe;
  }

  // Mark single notification as read
  async markAsRead(notificationId: string) {
    try {
      await updateDoc(doc(this.db, 'notifications', notificationId), {
        status: 'read',
        readAt: Timestamp.now(),
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  // Mark multiple notifications as read
  async markMultipleAsRead(notificationIds: string[]) {
    try {
      const batch = writeBatch(this.db);
      notificationIds.forEach((id) => {
        batch.update(doc(this.db, 'notifications', id), {
          status: 'read',
          readAt: Timestamp.now(),
        });
      });
      await batch.commit();
    } catch (error) {
      console.error('Error marking multiple notifications as read:', error);
    }
  }

  // Delete a notification
  async deleteNotification(notificationId: string) {
    try {
      await deleteDoc(doc(this.db, 'notifications', notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  }

  // Get unread notification count
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
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  // =================== UTILITY METHODS - UPDATED WITH "ACCEPTED" ===================
  
  private getChannelForType(type: NotificationType): string {
    if (type.startsWith('report_')) return 'reports';
    if (type.startsWith('forum_')) return 'forum';
    if (type.startsWith('chat_')) return 'chat';
    if (type.startsWith('account_')) return 'account';
    if (type.includes('emergency') || type.includes('weather') || type.includes('evacuation')) return 'emergency';
    return 'system';
  }

  private async sendLocalNotification(
    title: string,
    body: string,
    data?: any,
    androidChannelId: string = 'system'
  ) {
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

    try {
      if (Platform.OS === 'android') {
        await Notifications.scheduleNotificationAsync({
          ...notificationRequest,
          identifier: `${androidChannelId}-${Date.now()}`,
        });
      } else {
        await Notifications.scheduleNotificationAsync(notificationRequest);
      }
    } catch (error) {
      console.error('Error sending local notification:', error);
    }
  }

  // Utility methods for formatting and display
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

  // ✅ UPDATED: Added "report_accepted" to icon mapping
  getNotificationIcon(type: NotificationType): string {
    const iconMap: Record<string, string> = {
      'report_submitted': '📝',
      'report_accepted': '✅',  // ✅ ADDED
      'report_verified': '✅',
      'report_approved': '✅',
      'report_rejected': '❌',
      'report_failed': '⚠️',
      'report_resolved': '✅',
      'report_assigned': '👷',
      'report_in_progress': '🔄',
      'report_cancelled': '❌',
      'forum_reply': '💬',
      'forum_like_post': '❤️',
      'forum_like_reply': '❤️',
      'forum_mention': '🔔',
      'chat_message': '💬',
      'chat_priority_change': '⚡',
      'chat_assigned': '👷',
      'account_verified': '✅',
      'account_password_changed': '🔐',
      'account_login_alert': '🔐',
      'weather_alert': '🌦️',
      'emergency_broadcast': '🚨',
      'evacuation_notice': '🚨',
      'emergency_contact_updated': '📞',
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
}

// FIXED: Export singleton instance with proper initialization
export const notificationService = new NotificationService();