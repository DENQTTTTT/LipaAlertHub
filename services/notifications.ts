// services/notifications.ts - Complete with All Forum and Chat Notifications
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { Platform } from 'react-native';

// Configure notification handling - FIXED
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,  // Required in newer Expo versions
    shouldShowList: true,    // Required in newer Expo versions
  }),
});

// Extended notification types for forum and chat - UPDATED
export type NotificationType = 
  | 'report_submitted' 
  | 'report_verified' 
  | 'report_approved' 
  | 'report_rejected' 
  | 'report_failed' 
  | 'report_resolved'
  | 'forum_reply'           // Someone replied to your post
  | 'forum_like_post'       // Someone liked your post
  | 'forum_like_reply'      // Someone liked your reply
  | 'forum_mention'         // Someone mentioned you (future feature)
  | 'forum_post_submitted'  // Post submitted for approval
  | 'forum_post_approved'   // Post approved
  | 'forum_post_rejected'   // Post rejected
  | 'chat_message'          // New chat message from CDRRMO
  | 'chat_priority_change'  // Chat priority changed
  | 'chat_assigned';        // Chat assigned to specific CDRRMO staff

export interface NotificationData {
  id?: string;
  userId: string;
  reportId?: string;  // Optional for forum/chat notifications
  forumPostId?: string;  // New for forum
  forumReplyId?: string; // New for forum
  chatRoomId?: string;   // New for chat
  title: string;
  body: string;
  type: NotificationType;
  status: 'unread' | 'read';
  createdAt: Timestamp;
  data?: {
    reportStatus?: string;
    reportLocation?: string;
    reportType?: string;
    rejectionReason?: string;
    // Forum specific data
    postTitle?: string;
    replierName?: string;
    likerName?: string;
    replyContent?: string;
    // Chat specific data
    senderName?: string;
    messagePreview?: string;
    chatPriority?: string;
    assignedTo?: string;
  };
}

export class NotificationService {
  private db = getFirestore();

  // Initialize push notifications - FIXED
  async initializePushNotifications() {
    if (Platform.OS === 'android') {
      // Create multiple channels for different types
      await Notifications.setNotificationChannelAsync('reports', {
        name: 'Report Updates',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });

      await Notifications.setNotificationChannelAsync('forum', {
        name: 'Forum Activity',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 150, 150, 150],
        lightColor: '#e74c3c',
      });

      await Notifications.setNotificationChannelAsync('chat', {
        name: 'CDRRMO Chat',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: '#3498db',
        sound: 'default',
      });
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
      return token;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
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

  // =================== EXISTING REPORT NOTIFICATIONS ===================

  async createReportSubmittedNotification(
    userId: string, 
    reportId: string, 
    reportLocation: string, 
    reportType: string
  ) {
    const notificationData: Omit<NotificationData, 'id'> = {
      userId,
      reportId,
      title: 'Report Submitted Successfully',
      body: `Your ${reportType} report at ${reportLocation} has been submitted and is pending review.`,
      type: 'report_submitted',
      status: 'unread',
      createdAt: Timestamp.now(),
      data: {
        reportStatus: 'pending',
        reportLocation,
        reportType,
      },
    };

    try {
      const docRef = await addDoc(collection(this.db, 'notifications'), notificationData);
      
      await this.sendLocalNotification(
        notificationData.title, 
        notificationData.body, 
        { reportId, type: 'report_submitted' },
        'reports'
      );
      
      return docRef.id;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  async createReportVerifiedNotification(
    userId: string, 
    reportId: string, 
    reportLocation: string, 
    reportType: string
  ) {
    const notificationData: Omit<NotificationData, 'id'> = {
      userId,
      reportId,
      title: 'Report Verified',
      body: `Your ${reportType} report at ${reportLocation} has been verified by our team.`,
      type: 'report_verified',
      status: 'unread',
      createdAt: Timestamp.now(),
      data: {
        reportStatus: 'verified',
        reportLocation,
        reportType,
      },
    };

    try {
      const docRef = await addDoc(collection(this.db, 'notifications'), notificationData);
      
      await this.sendLocalNotification(
        notificationData.title, 
        notificationData.body, 
        { reportId, type: 'report_verified' },
        'reports'
      );
      
      return docRef.id;
    } catch (error) {
      console.error('Error creating verified notification:', error);
      throw error;
    }
  }

  async createReportApprovedNotification(
    userId: string, 
    reportId: string, 
    reportLocation: string, 
    reportType: string
  ) {
    const notificationData: Omit<NotificationData, 'id'> = {
      userId,
      reportId,
      title: 'Report Approved',
      body: `Your ${reportType} report at ${reportLocation} has been approved and is now visible to the community.`,
      type: 'report_approved',
      status: 'unread',
      createdAt: Timestamp.now(),
      data: {
        reportStatus: 'approved',
        reportLocation,
        reportType,
      },
    };

    try {
      const docRef = await addDoc(collection(this.db, 'notifications'), notificationData);
      
      await this.sendLocalNotification(
        notificationData.title, 
        notificationData.body, 
        { reportId, type: 'report_approved' },
        'reports'
      );
      
      return docRef.id;
    } catch (error) {
      console.error('Error creating approved notification:', error);
      throw error;
    }
  }

  async createReportRejectedNotification(
    userId: string, 
    reportId: string, 
    reportLocation: string, 
    reportType: string,
    reason?: string
  ) {
    const notificationData: Omit<NotificationData, 'id'> = {
      userId,
      reportId,
      title: 'Report Not Approved',
      body: `Your ${reportType} report at ${reportLocation} was not approved. ${reason ? `Reason: ${reason}` : 'Please check the details and try again.'}`,
      type: 'report_rejected',
      status: 'unread',
      createdAt: Timestamp.now(),
      data: {
        reportStatus: 'rejected',
        reportLocation,
        reportType,
        rejectionReason: reason,
      },
    };

    try {
      const docRef = await addDoc(collection(this.db, 'notifications'), notificationData);
      
      await this.sendLocalNotification(
        notificationData.title, 
        notificationData.body, 
        { reportId, type: 'report_rejected' },
        'reports'
      );
      
      return docRef.id;
    } catch (error) {
      console.error('Error creating rejected notification:', error);
      throw error;
    }
  }

  async createReportResolvedNotification(
    userId: string, 
    reportId: string, 
    reportLocation: string, 
    reportType: string
  ) {
    const notificationData: Omit<NotificationData, 'id'> = {
      userId,
      reportId,
      title: 'Report Resolved',
      body: `The ${reportType} incident at ${reportLocation} has been resolved by authorities.`,
      type: 'report_resolved',
      status: 'unread',
      createdAt: Timestamp.now(),
      data: {
        reportStatus: 'resolved',
        reportLocation,
        reportType,
      },
    };

    try {
      const docRef = await addDoc(collection(this.db, 'notifications'), notificationData);
      
      await this.sendLocalNotification(
        notificationData.title, 
        notificationData.body, 
        { reportId, type: 'report_resolved' },
        'reports'
      );
      
      return docRef.id;
    } catch (error) {
      console.error('Error creating resolved notification:', error);
      throw error;
    }
  }

  // =================== FORUM POST APPROVAL NOTIFICATIONS ===================

  // Notify user when their post is submitted for review
  async createForumPostSubmittedNotification(
    userId: string,
    postId: string,
    postTitle: string
  ) {
    const notificationData: Omit<NotificationData, 'id'> = {
      userId,
      forumPostId: postId,
      title: 'Post Submitted for Review',
      body: `Your post "${postTitle.length > 40 ? postTitle.substring(0, 40) + '...' : postTitle}" has been submitted and is waiting for admin approval.`,
      type: 'forum_post_submitted',
      status: 'unread',
      createdAt: Timestamp.now(),
      data: {
        postTitle,
      },
    };

    try {
      const docRef = await addDoc(collection(this.db, 'notifications'), notificationData);
      
      await this.sendLocalNotification(
        notificationData.title,
        notificationData.body,
        { forumPostId: postId, type: 'forum_post_submitted' },
        'forum'
      );
      
      return docRef.id;
    } catch (error) {
      console.error('Error creating forum post submitted notification:', error);
      throw error;
    }
  }

  // Notify user when their post is approved
  async createForumPostApprovedNotification(
    userId: string,
    postId: string,
    postTitle: string
  ) {
    const notificationData: Omit<NotificationData, 'id'> = {
      userId,
      forumPostId: postId,
      title: 'Post Approved!',
      body: `Your post "${postTitle.length > 40 ? postTitle.substring(0, 40) + '...' : postTitle}" has been approved and is now live in the forum.`,
      type: 'forum_post_approved',
      status: 'unread',
      createdAt: Timestamp.now(),
      data: {
        postTitle,
      },
    };

    try {
      const docRef = await addDoc(collection(this.db, 'notifications'), notificationData);
      
      await this.sendLocalNotification(
        notificationData.title,
        notificationData.body,
        { forumPostId: postId, type: 'forum_post_approved' },
        'forum'
      );
      
      return docRef.id;
    } catch (error) {
      console.error('Error creating forum post approved notification:', error);
      throw error;
    }
  }

  // Notify user when their post is rejected
  async createForumPostRejectedNotification(
    userId: string,
    postId: string,
    postTitle: string,
    rejectionReason: string
  ) {
    const notificationData: Omit<NotificationData, 'id'> = {
      userId,
      forumPostId: postId,
      title: 'Post Not Approved',
      body: `Your post "${postTitle.length > 30 ? postTitle.substring(0, 30) + '...' : postTitle}" was not approved. Reason: ${rejectionReason}`,
      type: 'forum_post_rejected',
      status: 'unread',
      createdAt: Timestamp.now(),
      data: {
        postTitle,
        rejectionReason,
      },
    };

    try {
      const docRef = await addDoc(collection(this.db, 'notifications'), notificationData);
      
      await this.sendLocalNotification(
        notificationData.title,
        notificationData.body,
        { forumPostId: postId, type: 'forum_post_rejected' },
        'forum'
      );
      
      return docRef.id;
    } catch (error) {
      console.error('Error creating forum post rejected notification:', error);
      throw error;
    }
  }

  // =================== FORUM INTERACTION NOTIFICATIONS ===================

  // Notify user when someone replies to their post
  async createForumReplyNotification(
    postAuthorUserId: string,
    postId: string,
    postTitle: string,
    replierName: string,
    replyContent: string
  ) {
    const notificationData: Omit<NotificationData, 'id'> = {
      userId: postAuthorUserId,
      forumPostId: postId,
      title: 'New Reply on Your Post',
      body: `${replierName} replied to your post "${postTitle.length > 30 ? postTitle.substring(0, 30) + '...' : postTitle}"`,
      type: 'forum_reply',
      status: 'unread',
      createdAt: Timestamp.now(),
      data: {
        postTitle,
        replierName,
        replyContent: replyContent.length > 100 ? replyContent.substring(0, 100) + '...' : replyContent,
      },
    };

    try {
      const docRef = await addDoc(collection(this.db, 'notifications'), notificationData);
      
      await this.sendLocalNotification(
        notificationData.title,
        notificationData.body,
        { forumPostId: postId, type: 'forum_reply' },
        'forum'
      );
      
      return docRef.id;
    } catch (error) {
      console.error('Error creating forum reply notification:', error);
      throw error;
    }
  }

  // Notify user when someone likes their post
  async createForumPostLikeNotification(
    postAuthorUserId: string,
    postId: string,
    postTitle: string,
    likerName: string
  ) {
    const notificationData: Omit<NotificationData, 'id'> = {
      userId: postAuthorUserId,
      forumPostId: postId,
      title: 'Your Post Was Liked',
      body: `${likerName} liked your post "${postTitle.length > 40 ? postTitle.substring(0, 40) + '...' : postTitle}"`,
      type: 'forum_like_post',
      status: 'unread',
      createdAt: Timestamp.now(),
      data: {
        postTitle,
        likerName,
      },
    };

    try {
      const docRef = await addDoc(collection(this.db, 'notifications'), notificationData);
      
      await this.sendLocalNotification(
        notificationData.title,
        notificationData.body,
        { forumPostId: postId, type: 'forum_like_post' },
        'forum'
      );
      
      return docRef.id;
    } catch (error) {
      console.error('Error creating forum post like notification:', error);
      throw error;
    }
  }

  // Notify user when someone likes their reply
  async createForumReplyLikeNotification(
    replyAuthorUserId: string,
    postId: string,
    replyId: string,
    postTitle: string,
    likerName: string
  ) {
    const notificationData: Omit<NotificationData, 'id'> = {
      userId: replyAuthorUserId,
      forumPostId: postId,
      forumReplyId: replyId,
      title: 'Your Reply Was Liked',
      body: `${likerName} liked your reply on "${postTitle.length > 40 ? postTitle.substring(0, 40) + '...' : postTitle}"`,
      type: 'forum_like_reply',
      status: 'unread',
      createdAt: Timestamp.now(),
      data: {
        postTitle,
        likerName,
      },
    };

    try {
      const docRef = await addDoc(collection(this.db, 'notifications'), notificationData);
      
      await this.sendLocalNotification(
        notificationData.title,
        notificationData.body,
        { forumPostId: postId, forumReplyId: replyId, type: 'forum_like_reply' },
        'forum'
      );
      
      return docRef.id;
    } catch (error) {
      console.error('Error creating forum reply like notification:', error);
      throw error;
    }
  }

  // =================== CHAT NOTIFICATIONS ===================

  // Notify user when CDRRMO sends a message
  async createChatMessageNotification(
    userId: string,
    chatRoomId: string,
    senderName: string,
    messagePreview: string,
    messageType: 'user_message' | 'cdrrmo_message' = 'cdrrmo_message'
  ) {
    const notificationData: Omit<NotificationData, 'id'> = {
      userId,
      chatRoomId,
      title: messageType === 'cdrrmo_message' ? 'New Message from CDRRMO' : 'New Message in Chat',
      body: `${senderName}: ${messagePreview.length > 60 ? messagePreview.substring(0, 60) + '...' : messagePreview}`,
      type: 'chat_message',
      status: 'unread',
      createdAt: Timestamp.now(),
      data: {
        senderName,
        messagePreview: messagePreview.length > 100 ? messagePreview.substring(0, 100) + '...' : messagePreview,
      },
    };

    try {
      const docRef = await addDoc(collection(this.db, 'notifications'), notificationData);
      
      // Only send push notification for CDRRMO messages to avoid spam
      if (messageType === 'cdrrmo_message') {
        await this.sendLocalNotification(
          notificationData.title,
          notificationData.body,
          { chatRoomId, type: 'chat_message' },
          'chat'
        );
      }
      
      return docRef.id;
    } catch (error) {
      console.error('Error creating chat message notification:', error);
      throw error;
    }
  }

  // Notify user when chat priority changes
  async createChatPriorityChangeNotification(
    userId: string,
    chatRoomId: string,
    newPriority: string
  ) {
    const priorityMessages = {
      low: 'Your chat priority has been set to Low',
      normal: 'Your chat priority has been set to Normal',
      high: 'Your chat priority has been set to High - CDRRMO will respond soon',
      urgent: 'Your chat priority has been set to URGENT - CDRRMO will respond immediately'
    };

    const notificationData: Omit<NotificationData, 'id'> = {
      userId,
      chatRoomId,
      title: 'Chat Priority Updated',
      body: priorityMessages[newPriority as keyof typeof priorityMessages] || 'Your chat priority has been updated',
      type: 'chat_priority_change',
      status: 'unread',
      createdAt: Timestamp.now(),
      data: {
        chatPriority: newPriority,
      },
    };

    try {
      const docRef = await addDoc(collection(this.db, 'notifications'), notificationData);
      
      // Send push notification for priority changes
      if (newPriority === 'urgent' || newPriority === 'high') {
        await this.sendLocalNotification(
          notificationData.title,
          notificationData.body,
          { chatRoomId, type: 'chat_priority_change' },
          'chat'
        );
      }
      
      return docRef.id;
    } catch (error) {
      console.error('Error creating chat priority notification:', error);
      throw error;
    }
  }

  // Notify user when chat is assigned to specific CDRRMO staff
  async createChatAssignedNotification(
    userId: string,
    chatRoomId: string,
    assignedStaffName: string
  ) {
    const notificationData: Omit<NotificationData, 'id'> = {
      userId,
      chatRoomId,
      title: 'Chat Assigned',
      body: `Your chat has been assigned to ${assignedStaffName} from CDRRMO`,
      type: 'chat_assigned',
      status: 'unread',
      createdAt: Timestamp.now(),
      data: {
        assignedTo: assignedStaffName,
      },
    };

    try {
      const docRef = await addDoc(collection(this.db, 'notifications'), notificationData);
      
      await this.sendLocalNotification(
        notificationData.title,
        notificationData.body,
        { chatRoomId, type: 'chat_assigned' },
        'chat'
      );
      
      return docRef.id;
    } catch (error) {
      console.error('Error creating chat assigned notification:', error);
      throw error;
    }
  }

  // =================== HELPER METHODS ===================

  // Send local notification - FIXED: Removed channelId from content object
  private async sendLocalNotification(
    title: string, 
    body: string, 
    data?: any, 
    androidChannelId: string = 'reports'
  ) {
    // For Android, we need to handle channel selection differently
    const notificationRequest: Notifications.NotificationRequestInput = {
      content: {
        title,
        body,
        data,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // Send immediately
    };

    // On Android, specify the channel in the request identifier
    if (Platform.OS === 'android') {
      await Notifications.scheduleNotificationAsync({
        ...notificationRequest,
        identifier: `${androidChannelId}-${Date.now()}`,
      });
      
      // Alternatively, you can set the channel in the content for newer Expo versions:
      // notificationRequest.content.channelId = androidChannelId;
    } else {
      await Notifications.scheduleNotificationAsync(notificationRequest);
    }
  }

  // Get user notifications with real-time updates - IMPROVED error handling
  getUserNotifications(userId: string, callback: (notifications: NotificationData[]) => void) {
    const q = query(
      collection(this.db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const notifications: NotificationData[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as NotificationData[];
      
      callback(notifications);
    }, (error) => {
      console.error('Error in notifications listener:', error);
      if (error.code === 'failed-precondition') {
        console.error('📋 Firestore Composite Index Required:');
        console.error('Collection: notifications');
        console.error('Fields: userId (Ascending), createdAt (Descending)');
        console.error('Create this index in Firebase Console > Firestore Database > Indexes');
      }
      // Call callback with empty array to prevent crashes
      callback([]);
    });
  }

  // Mark notification as read
  async markAsRead(notificationId: string) {
    try {
      await updateDoc(doc(this.db, 'notifications', notificationId), {
        status: 'read',
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
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

  // Batch mark multiple notifications as read
  async markMultipleAsRead(notificationIds: string[]) {
    try {
      const promises = notificationIds.map(id => 
        updateDoc(doc(this.db, 'notifications', id), { status: 'read' })
      );
      await Promise.all(promises);
    } catch (error) {
      console.error('Error marking multiple notifications as read:', error);
      throw error;
    }
  }
}

export const notificationService = new NotificationService();