// app/(main)/notifications/index.tsx - Updated with Forum Notifications
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../../../hooks/useAuth";
import { NotificationData, notificationService } from "../../../services/notifications";

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user?.uid) return;

    // Subscribe to notifications
    const unsubscribe = notificationService.getUserNotifications(user.uid, (notificationsList) => {
      setNotifications(notificationsList);
      setLoading(false);
    });

    return () => unsubscribe && unsubscribe();
  }, [user?.uid]);

  const onRefresh = async () => {
    setRefreshing(true);
    // The real-time listener will automatically update the data
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleNotificationPress = async (notification: NotificationData) => {
    try {
      // Mark as read
      if (notification.status === 'unread' && notification.id) {
        await notificationService.markAsRead(notification.id);
      }

      // Navigate based on notification type
      if (notification.type.startsWith('report_')) {
        // Navigate to report status screen
        router.push({
          pathname: '/(main)/report/status',
          params: { reportId: notification.reportId }
        });
      } else if (notification.type.startsWith('forum_')) {
        // Navigate to specific forum post
        if (notification.forumPostId) {
          router.push({
            pathname: '/(main)/forum/post',
            params: { id: notification.forumPostId }
          });
        } else {
          router.push('/(main)/forum');
        }
      }
    } catch (error) {
      console.error('Error handling notification press:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      // Report notifications
      case 'report_submitted':
        return '📝';
      case 'report_verified':
        return '✅';
      case 'report_approved':
        return '👍';
      case 'report_rejected':
      case 'report_failed':
        return '❌';
      case 'report_resolved':
        return '✅';
      // Forum notifications  
      case 'forum_reply':
        return '💬';
      case 'forum_like_post':
        return '❤️';
      case 'forum_like_reply':
        return '👍';
      case 'forum_mention':
        return '@';
      default:
        return '🔔';
    }
  };

  const getNotificationIconBg = (type: string, status: string) => {
    if (status === 'unread') {
      switch (type) {
        case 'report_verified':
        case 'report_approved':
        case 'report_resolved':
          return '#22c55e';
        case 'report_rejected':
        case 'report_failed':
          return '#ef4444';
        case 'report_submitted':
          return '#3b82f6';
        // Forum notification colors
        case 'forum_reply':
          return '#9c27b0';
        case 'forum_like_post':
        case 'forum_like_reply':
          return '#e91e63';
        case 'forum_mention':
          return '#ff9800';
        default:
          return '#6b7280';
      }
    }
    return '#9ca3af';
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return 'Now';
    
    const now = new Date();
    const notificationTime = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - notificationTime.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) {
      return diffInMinutes <= 1 ? 'Just now' : `${diffInMinutes} minutes ago`;
    }
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    }
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications
        .filter(n => n.status === 'unread')
        .map(n => n.id!)
        .filter(Boolean);

      if (unreadNotifications.length > 0) {
        await notificationService.markMultipleAsRead(unreadNotifications);
      }
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text>Loading notifications...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image 
           source={require('../../../assets/images/logo.png')} 
            style={styles.logoImage}
          />
          <Text style={styles.logoTitle}>LipaAlertHub</Text>
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.pageTitle}>Notifications</Text>
          {notifications.length > 0 && (
            <TouchableOpacity
              style={styles.markAllButton}
              onPress={markAllAsRead}
            >
              <Text style={styles.markAllText}>Mark All Read</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Notifications List */}
      <ScrollView 
        style={styles.notificationsContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.notificationsContent,
          notifications.length === 0 && styles.centered
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No Notifications</Text>
            <Text style={styles.emptyText}>
              You'll see updates about your incident reports and forum activity here.
            </Text>
          </View>
        ) : (
          notifications.map((notification) => (
            <TouchableOpacity
              key={notification.id}
              style={[
                styles.notificationCard,
                notification.status === 'unread' && styles.unreadCard
              ]}
              onPress={() => handleNotificationPress(notification)}
              activeOpacity={0.7}
            >
              <View style={styles.notificationHeader}>
                <View style={[
                  styles.iconContainer, 
                  { backgroundColor: getNotificationIconBg(notification.type, notification.status) }
                ]}>
                  <Text style={styles.iconText}>
                    {getNotificationIcon(notification.type)}
                  </Text>
                </View>
                <View style={styles.notificationContent}>
                  <View style={styles.titleRow}>
                    <Text style={styles.notificationTitle}>{notification.title}</Text>
                    {notification.status === 'unread' && <View style={styles.unreadDot} />}
                  </View>
                  <Text style={styles.notificationTime}>
                    {formatTime(notification.createdAt)}
                  </Text>
                </View>
              </View>
              <Text style={styles.notificationMessage}>
                {notification.body}
              </Text>
              
              {/* Show location for report notifications */}
              {notification.data?.reportLocation && (
                <Text style={styles.locationText}>
                  📍 {notification.data.reportLocation}
                </Text>
              )}
              
              {/* Show post title for forum notifications */}
              {notification.data?.postTitle && notification.type.startsWith('forum_') && (
                <Text style={styles.postTitleText}>
                  📝 "{notification.data.postTitle}"
                </Text>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 30,
    backgroundColor: "#ffffff",
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  logoImage: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginRight: 10,
    resizeMode: 'contain',
  },
  logoTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1f2937",
    flex: 1,
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#3b82f6",
  },
  markAllText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  notificationsContainer: {
    flex: 1,
  },
  notificationsContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
  },
  notificationCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  unreadCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#3b82f6",
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  iconText: {
    fontSize: 20,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#3b82f6",
    marginLeft: 8,
  },
  notificationTime: {
    fontSize: 12,
    color: "#6b7280",
  },
  notificationMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: "#4b5563",
    marginLeft: 52,
    marginBottom: 8,
  },
  locationText: {
    fontSize: 12,
    color: "#6b7280",
    marginLeft: 52,
    fontStyle: 'italic',
  },
  postTitleText: {
    fontSize: 12,
    color: "#6b7280",
    marginLeft: 52,
    fontStyle: 'italic',
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});