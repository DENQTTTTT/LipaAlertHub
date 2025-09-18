// app/(main)/notifications/index.tsx - Updated Compact Design
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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

    const unsubscribe = notificationService.getUserNotifications(user.uid, (notificationsList) => {
      setNotifications(notificationsList);
      setLoading(false);
    });

    return () => unsubscribe && unsubscribe();
  }, [user?.uid]);

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleNotificationPress = async (notification: NotificationData) => {
    try {
      if (notification.status === 'unread' && notification.id) {
        await notificationService.markAsRead(notification.id);
      }

      // Navigate based on notification type
      if (notification.type.startsWith('report_')) {
        if (notification.reportId) {
          router.push({
            pathname: '/(main)/report/status',
            params: { reportId: notification.reportId }
          });
        }
      } else if (notification.type.startsWith('forum_')) {
        if (notification.forumPostId) {
          router.push({
            pathname: '/(main)/forum/post',
            params: { id: notification.forumPostId }
          });
        } else {
          router.push('/(main)/forum');
        }
      } else if (notification.type.startsWith('chat_')) {
        if (notification.chatRoomId) {
          router.push({
            pathname: '/(main)/chat',
            params: { roomId: notification.chatRoomId }
          });
        }
      } else {
        // For account updates or other types, show a simple alert
        Alert.alert("Notification", notification.body);
      }
    } catch (error) {
      console.error('Error handling notification press:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    if (type.startsWith('report_')) return '🚨';
    if (type.startsWith('forum_')) return '💬';
    if (type.startsWith('chat_')) return '📱';
    return '👤'; // account updates or default
  };

  const getIconColor = (type: string, status: string) => {
    const opacity = status === 'unread' ? 1 : 0.6;
    
    if (type.startsWith('report_')) {
      if (type.includes('approved') || type.includes('verified') || type.includes('resolved')) {
        return `rgba(34, 197, 94, ${opacity})`; // green
      }
      if (type.includes('rejected') || type.includes('failed')) {
        return `rgba(239, 68, 68, ${opacity})`; // red  
      }
      return `rgba(59, 130, 246, ${opacity})`; // blue
    }
    
    if (type.startsWith('forum_')) return `rgba(156, 39, 176, ${opacity})`; // purple
    if (type.startsWith('chat_')) return `rgba(52, 152, 219, ${opacity})`; // light blue
    return `rgba(107, 114, 128, ${opacity})`; // gray for account
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return 'Now';
    
    const now = new Date();
    const notificationTime = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - notificationTime.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Now';
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays}d`;
    
    return notificationTime.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

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

  const renderNotification = ({ item }: { item: NotificationData }) => (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        item.status === 'unread' && styles.unreadItem
      ]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
    >
      <View style={[
        styles.iconContainer, 
        { backgroundColor: getIconColor(item.type, item.status) }
      ]}>
        <Text style={styles.iconText}>
          {getNotificationIcon(item.type)}
        </Text>
      </View>
      
      <View style={styles.contentContainer}>
        <View style={styles.titleRow}>
          <Text style={[
            styles.title,
            item.status === 'unread' && styles.unreadTitle
          ]} numberOfLines={1}>
            {item.title}
          </Text>
          {item.status === 'unread' && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.message} numberOfLines={2}>
          {item.body}
        </Text>
      </View>
      
      <Text style={styles.timestamp}>
        {formatTime(item.createdAt)}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.loadingText}>Loading notifications...</Text>
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
      <FlatList
        data={notifications}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id || 'temp'}
        style={styles.listContainer}
        contentContainerStyle={[
          styles.listContent,
          notifications.length === 0 && styles.centered
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyTitle}>No Notifications</Text>
            <Text style={styles.emptyText}>
              You'll see updates about your reports, forum activity, and chat messages here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  logoImage: {
    width: 28,
    height: 28,
    borderRadius: 6,
    marginRight: 8,
    resizeMode: 'contain',
  },
  logoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
    flex: 1,
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#3b82f6",
  },
  markAllText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 100,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  unreadItem: {
    backgroundColor: '#f8faff',
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 16,
  },
  contentContainer: {
    flex: 1,
    marginRight: 8,
  // Removed duplicate titleRow style, merged into the previous definition.
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  unreadTitle: {
    color: '#1f2937',
    fontWeight: '700',
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3b82f6',
    marginLeft: 6,
  },
  message: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
  timestamp: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '500',
    minWidth: 40,
    textAlign: 'right',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});