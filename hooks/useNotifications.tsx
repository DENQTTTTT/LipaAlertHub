// hooks/useNotifications.tsx
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { NotificationData, notificationService } from '../services/notifications';
import { useAuth } from './useAuth';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    // Initialize push notifications
    notificationService.initializePushNotifications().catch(console.error);

    // Subscribe to user notifications
    const unsubscribe = notificationService.getUserNotifications(user.uid, (notificationsList) => {
      setNotifications(notificationsList);
      const unread = notificationsList.filter(n => n.status === 'unread').length;
      setUnreadCount(unread);
      setLoading(false);
    });

    return () => unsubscribe && unsubscribe();
  }, [user?.uid]);

  // Listen for foreground notifications
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      // Handle received notification in foreground
      console.log('Notification received in foreground:', notification);
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      // Handle notification tap
      const data = response.notification.request.content.data;
      if (data?.type === 'report_update' && data?.reportId) {
        // Navigate to report status screen
        // This would need to be handled by the navigation context
        console.log('Navigate to report:', data.reportId);
      }
    });

    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, []);

  const markAsRead = async (notificationId: string) => {
    try {
      await notificationService.markAsRead(notificationId);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter(n => n.status === 'unread');
      await Promise.all(
        unreadNotifications.map(n => n.id ? notificationService.markAsRead(n.id) : Promise.resolve())
      );
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
  };
};