// app/(main)/notifications/index.tsx - IMPROVED DESIGN VERSION
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useAuth } from "../../../hooks/useAuth";
import { NotificationData, notificationService } from "../../../services/notifications";

const { width } = Dimensions.get('window');
const isSmallDevice = width < 375;

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const unsubscribe = notificationService.getUserNotifications(user.uid, (notificationsList) => {
      setNotifications(notificationsList);
      setLoading(false);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
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
      if (notification.type === 'violation' || 
          notification.type === 'violation_warning' || 
          notification.type === 'violation_strike' ||
          notification.type === 'violation_suspension' ||
          notification.type === 'violation_ban') {
        router.push('/(main)/profile/strikes');
      } else if (notification.type.startsWith('report_')) {
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
        Alert.alert("Notification", notification.body);
      }
    } catch (error) {
      console.error('Error handling notification press:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    if (type.startsWith('violation')) return '⚠️';
    if (type.startsWith('report_')) return '🚨';
    if (type.startsWith('forum_')) return '💬';
    if (type.startsWith('chat_')) return '📱';
    if (type.startsWith('announcement')) return '📢';
    if (type.startsWith('alert')) return '🔔';
    return '📋';
  };

  const getIconColor = (type: string, status: string) => {
    const isUnread = status === 'unread';
    
    if (type.startsWith('violation')) {
      return isUnread ? '#e74c3c' : '#fadbd8';
    }
    
    if (type.startsWith('report_')) {
      if (type.includes('approved') || type.includes('verified') || type.includes('resolved')) {
        return isUnread ? '#22c55e' : '#d1fae5';
      }
      if (type.includes('rejected') || type.includes('failed')) {
        return isUnread ? '#ef4444' : '#fee2e2';
      }
      return isUnread ? '#3b82f6' : '#dbeafe';
    }
    
    if (type.startsWith('forum_')) return isUnread ? '#9c27b0' : '#f3e5f5';
    if (type.startsWith('chat_')) return isUnread ? '#3498db' : '#dbeafe';
    if (type.startsWith('announcement')) return isUnread ? '#ff9800' : '#fff3e0';
    if (type.startsWith('alert')) return isUnread ? '#f44336' : '#ffebee';
    return isUnread ? '#6b7280' : '#f3f4f6';
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

      if (unreadNotifications.length === 0) {
        Alert.alert("Info", "All notifications are already read");
        return;
      }

      await notificationService.markMultipleAsRead(unreadNotifications);
    } catch (error) {
      console.error('Error marking all as read:', error);
      Alert.alert("Error", "Failed to mark notifications as read");
    }
  };

  const unreadCount = notifications.filter(n => n.status === 'unread').length;

  const renderNotification = ({ item }: { item: NotificationData }) => {
    const isViolation = item.type.startsWith('violation');
    const isUnread = item.status === 'unread';
    
    return (
      <TouchableOpacity
        style={[
          styles.notificationItem,
          isUnread && styles.unreadItem
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
              isUnread && styles.unreadTitle,
              isViolation && styles.violationTitle
            ]} numberOfLines={1}>
              {item.title}
            </Text>
            {isUnread && <View style={styles.unreadDot} />}
          </View>
          <Text style={[
            styles.message,
            isUnread && styles.unreadMessage
          ]} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={styles.timestamp}>
            {formatTime(item.createdAt)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#e74c3c" />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#ffffff" barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image 
            source={require('../../../assets/images/logo.png')} 
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.logoTitle}>LipaAlertHub</Text>
        </View>
        
        <View style={styles.headerBottom}>
          <View style={styles.titleContainer}>
            <Text style={styles.pageTitle}>Notifications</Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
          
          {notifications.length > 0 && unreadCount > 0 && (
            <TouchableOpacity
              style={styles.markAllButton}
              onPress={markAllAsRead}
              activeOpacity={0.7}
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
        keyExtractor={(item, index) => item.id || `temp-${index}`}
        style={styles.listContainer}
        contentContainerStyle={[
          styles.listContent,
          notifications.length === 0 && styles.emptyList
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={["#e74c3c"]}
            tintColor="#e74c3c"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyEmoji}>🔔</Text>
            </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
  header: {
    backgroundColor: "#fff",
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  logoImage: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginRight: 10,
  },
  logoTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  headerBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  pageTitle: {
    fontSize: isSmallDevice ? 22 : 24,
    fontWeight: "700",
    color: "#1f2937",
  },
  unreadBadge: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
    minWidth: 24,
    alignItems: 'center',
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  markAllButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#e74c3c",
  },
  markAllText: {
    color: "#fff",
    fontSize: isSmallDevice ? 11 : 12,
    fontWeight: "600",
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingBottom: Platform.OS === 'ios' ? 100 : 80,
  },
  emptyList: {
    flexGrow: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  unreadItem: {
    backgroundColor: '#f8faff',
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
    shadowOpacity: 0.1,
    elevation: 2,
  },
  iconContainer: {
    width: isSmallDevice ? 44 : 48,
    height: isSmallDevice ? 44 : 48,
    borderRadius: isSmallDevice ? 22 : 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: isSmallDevice ? 20 : 22,
  },
  contentContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: isSmallDevice ? 14 : 15,
    fontWeight: '600',
    color: '#4b5563',
    flex: 1,
    lineHeight: 20,
  },
  unreadTitle: {
    color: '#1f2937',
    fontWeight: '700',
  },
  violationTitle: {
    color: '#e74c3c',
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
    marginLeft: 6,
  },
  message: {
    fontSize: isSmallDevice ? 12 : 13,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 6,
  },
  unreadMessage: {
    color: '#4b5563',
    fontWeight: '500',
  },
  timestamp: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 100,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
});