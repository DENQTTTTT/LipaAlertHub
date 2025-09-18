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
  const { user, userProfile } = useAuth();
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Use refs to store unsubscribe functions and prevent duplicate initialization
  const notificationUnsubscribe = useRef<(() => void) | null>(null);
  const foregroundSubscription = useRef<Notifications.Subscription | null>(null);
  const responseSubscription = useRef<Notifications.Subscription | null>(null);
  const isInitialized = useRef(false);

  // Initialize notifications when user is available
  useEffect(() => {
    if (user?.uid && !isInitialized.current) {
      initializeNotifications();
      isInitialized.current = true;
    } else if (!user?.uid) {
      setLoading(false);
    }

    return () => {
      cleanup();
    };
  }, [user?.uid, userProfile]);

  // Setup foreground notification listeners
  useEffect(() => {
    // Listen for foreground notifications
    foregroundSubscription.current = Notifications.addNotificationReceivedListener(notification => {
      // Handle received notification in foreground
      console.log('Notification received in foreground:', notification);
    });

    responseSubscription.current = Notifications.addNotificationResponseReceivedListener(response => {
      // Handle notification tap
      const data = response.notification.request.content.data;
      if (data?.type === 'report_update' && data?.reportId) {
        // Navigate to report status screen
        // This would need to be handled by the navigation context
        console.log('Navigate to report:', data.reportId);
      }
    });

    return () => {
      if (foregroundSubscription.current) {
        foregroundSubscription.current.remove();
      }
      if (responseSubscription.current) {
        responseSubscription.current.remove();
      }
    };
  }, []);

  // Initialize push notifications and listeners
  const initializeNotifications = async () => {
    try {
      setLoading(true);
      setError(null);

      // Initialize push notifications
      const pushToken = await notificationService.initializePushNotifications();
      if (pushToken && user) {
        await notificationService.storePushToken(user.uid);
      }

      // Subscribe to user notifications
      if (user) {
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

  // Subscribe to real-time notifications
  const subscribeToNotifications = (userId: string) => {
    // Clean up existing subscription
    if (notificationUnsubscribe.current) {
      notificationUnsubscribe.current();
    }

    // Create new subscription
    notificationUnsubscribe.current = notificationService.getUserNotifications(
      userId,
      (newNotifications) => {
        setNotifications(newNotifications);
        const unread = newNotifications.filter(n => n.status === 'unread').length;
        setUnreadCount(unread);
      },
      limit
    );
  };

  // Update unread count
  const updateUnreadCount = async (userId: string) => {
    try {
      const count = await notificationService.getUnreadCount(userId);
      setUnreadCount(count);
    } catch (err) {
      console.error('Error updating unread count:', err);
    }
  };

  // Mark single notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      await notificationService.markAsRead(notificationId);
      // Update local state immediately for better UX
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId 
            ? { ...n, status: 'read' as const, readAt: new Date() as any }
            : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
      setError('Failed to mark notification as read');
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    if (!user) return;

    try {
      const unreadIds = notifications
        .filter(n => n.status === 'unread')
        .map(n => n.id!)
        .filter(Boolean);

      if (unreadIds.length > 0) {
        // Use batch operation if available, otherwise fall back to individual operations
        if (notificationService.markMultipleAsRead) {
          await notificationService.markMultipleAsRead(unreadIds);
        } else {
          await Promise.all(unreadIds.map(id => notificationService.markAsRead(id)));
        }
        
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

  // Delete notification
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

  // Refresh notifications
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

  // Cleanup function
  const cleanup = () => {
    if (notificationUnsubscribe.current) {
      notificationUnsubscribe.current();
      notificationUnsubscribe.current = null;
    }
    
    // Clean up notification service listeners
    if (notificationService.cleanup) {
      notificationService.cleanup();
    }
    isInitialized.current = false;
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

// Additional hook for managing notification permissions
export const useNotificationPermissions = () => {
  const [permissionStatus, setPermissionStatus] = useState<string>('undetermined');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setPermissionStatus(status);
    } catch (error) {
      console.error('Error checking notification permissions:', error);
    }
  };

  const requestPermissions = async () => {
    try {
      setLoading(true);
      const { status } = await Notifications.requestPermissionsAsync();
      setPermissionStatus(status);
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    permissionStatus,
    loading,
    isGranted: permissionStatus === 'granted',
    requestPermissions,
    checkPermissions,
  };
};