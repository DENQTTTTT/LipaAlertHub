// hooks/useNotifications.tsx - Combined hook with proper cleanup and permissions
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { NotificationData, notificationService } from '../services/notifications';
import { useAuth } from './useAuth';

export interface UseNotificationsReturn {
  notifications: NotificationData[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

export const useNotifications = (limit: number = 50): UseNotificationsReturn => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (user?.uid) {
      initializeNotifications();
    } else {
      setLoading(false);
      setNotifications([]);
      setUnreadCount(0);
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [user?.uid]);

  const initializeNotifications = async () => {
    try {
      setLoading(true);
      setError(null);

      // Initialize push notifications
      await notificationService.initializePushNotifications();

      // Subscribe to user notifications
      if (user?.uid) {
        subscribeToNotifications(user.uid);
        await updateUnreadCount(user.uid);
      }
    } catch (err) {
      console.error('Error initializing notifications:', err);
      setError('Failed to initialize notifications');
    } finally {
      setLoading(false);
    }
  };

  const subscribeToNotifications = (userId: string) => {
    // Clean up existing subscription
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    // Create new subscription with proper typing
    unsubscribeRef.current = notificationService.getUserNotifications(
      userId,
      (newNotifications: NotificationData[]) => {
        setNotifications(newNotifications);
        const unread = newNotifications.filter(n => n.status === 'unread').length;
        setUnreadCount(unread);
      },
      limit
    );
  };

  const updateUnreadCount = async (userId: string) => {
    try {
      const count = await notificationService.getUnreadCount(userId);
      setUnreadCount(count);
    } catch (err) {
      console.error('Error updating unread count:', err);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await notificationService.markAsRead(notificationId);
      // Update local state immediately for better UX
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId 
            ? { ...n, status: 'read' as const }
            : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
      setError('Failed to mark notification as read');
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    try {
      const unreadIds = notifications
        .filter(n => n.status === 'unread')
        .map(n => n.id!)
        .filter(Boolean);

      if (unreadIds.length > 0) {
        await notificationService.markMultipleAsRead(unreadIds);
        
        // Update local state immediately
        setNotifications(prev => 
          prev.map(n => ({ ...n, status: 'read' as const }))
        );
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
      setError('Failed to mark all notifications as read');
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      await notificationService.deleteNotification(notificationId);
      
      // Update local state immediately
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      
      // Update unread count if it was an unread notification
      const notification = notifications.find(n => n.id === notificationId);
      if (notification?.status === 'unread') {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Error deleting notification:', err);
      setError('Failed to delete notification');
    }
  };

  const refreshNotifications = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);
      await updateUnreadCount(user.uid);
    } catch (err) {
      console.error('Error refreshing notifications:', err);
      setError('Failed to refresh notifications');
    } finally {
      setLoading(false);
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refreshNotifications,
  };
};

// Enhanced hook for managing notification permissions with better error handling
export const useNotificationPermissions = () => {
  const [permissionStatus, setPermissionStatus] = useState<Notifications.PermissionStatus>(
    Notifications.PermissionStatus.UNDETERMINED
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setPermissionStatus(status);
      setError(null);
    } catch (err) {
      console.error('Error checking notification permissions:', err);
      setError('Failed to check notification permissions');
    }
  };

  const requestPermissions = async (): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      
      const { status } = await Notifications.requestPermissionsAsync();
      setPermissionStatus(status);
      
      return status === Notifications.PermissionStatus.GRANTED;
    } catch (err) {
      console.error('Error requesting notification permissions:', err);
      setError('Failed to request notification permissions');
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    permissionStatus,
    loading,
    error,
    isGranted: permissionStatus === Notifications.PermissionStatus.GRANTED,
    requestPermissions,
    checkPermissions,
  };
};
// Hook for handling notification responses and navigation
export const useNotificationHandler = () => {
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // Setup notification response handler
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      handleNotificationTap(data);
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  const handleNotificationTap = (data: any) => {
    const type = data?.type;
    console.log('Notification tapped:', type, data);

    // Handle different notification types
    switch (type) {
      case 'report_submitted':
      case 'report_accepted':
      case 'report_verified':
      case 'report_resolved':
        if (data?.reportId) {
          // Navigate to report details
          console.log('Navigate to report:', data.reportId);
          // You would integrate with your navigation here
          // navigation.navigate('ReportDetails', { reportId: data.reportId });
        }
        break;

      case 'forum_reply':
      case 'forum_like_post':
      case 'forum_activity':
        if (data?.postId) {
          // Navigate to forum post
          console.log('Navigate to forum post:', data.postId);
          // navigation.navigate('ForumPost', { postId: data.postId });
        }
        break;

      case 'chat_message':
        if (data?.chatRoomId) {
          // Navigate to chat
          console.log('Navigate to chat:', data.chatRoomId);
          // navigation.navigate('Chat', { chatRoomId: data.chatRoomId });
        }
        break;

      case 'sos_call_pending':
      case 'sos_call_reviewed':
      case 'sos_call_assigned':
        if (data?.sosCallId) {
          // Navigate to SOS status
          console.log('Navigate to SOS status:', data.sosCallId);
          // navigation.navigate('SOSStatus', { sosId: data.sosCallId });
        }
        break;

      case 'violation':
      case 'violation_warning':
      case 'violation_strike':
      case 'violation_suspension':
      case 'violation_ban':
        // Navigate to account status or strikes page
        console.log('Navigate to account violations');
        // navigation.navigate('AccountStatus');
        break;

      case 'weather_alert':
      case 'emergency_broadcast':
        if (data?.alertId) {
          // Navigate to alerts page
          console.log('Navigate to alerts:', data.alertId);
          // navigation.navigate('Alerts');
        }
        break;

      default:
        console.log('No specific handler for notification type:', type);
    }
  };

  return {
    handleNotificationTap
  };
};

// Hook for managing push token registration
export const usePushToken = () => {
  const { user } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerPushToken = async (): Promise<string | null> => {
    if (!user) {
      setError('User not authenticated');
      return null;
    }

    try {
      setLoading(true);
      setError(null);
      
      const pushToken = await notificationService.initializePushNotifications();
      
      if (pushToken) {
        await notificationService.storePushToken(user.uid);
        setToken(pushToken);
        return pushToken;
      }
      
      return null;
    } catch (err) {
      console.error('Error registering push token:', err);
      setError('Failed to register push token');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const refreshPushToken = async (): Promise<string | null> => {
    return registerPushToken();
  };

  return {
    token,
    loading,
    error,
    registerPushToken,
    refreshPushToken,
  };
};