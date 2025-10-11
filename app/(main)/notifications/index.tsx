// app/(main)/notifications/index.tsx - Complete with Violation Notifications
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
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
    return '👤';
  };

  const getIconColor = (type: string, status: string) => {
    const opacity = status === 'unread' ? 1 : 0.6;
    
    if (type.startsWith('violation')) {
      return `rgba(231, 76, 60, ${opacity})`;
    }
    
    if (type.startsWith('report_')) {
      if (type.includes('approved') || type.includes('verified') || type.includes('resolved')) {
        return `rgba(34, 197, 94, ${opacity})`;
      }
      if (type.includes('rejected') || type.includes('failed')) {
        return `rgba(239, 68, 68, ${opacity})`;
      }
      return `rgba(59, 130, 246, ${opacity})`;
    }
    
    if (type.startsWith('forum_')) return `rgba(156, 39, 176, ${opacity})`;
    if (type.startsWith('chat_')) return `rgba(52, 152, 219, ${opacity})`;
    return `rgba(107, 114, 128, ${opacity})`;
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

  const renderNotification = ({ item }: { item: NotificationData }) => {
    const isViolation = item.type.startsWith('violation');
    
    return (
      <TouchableOpacity
        style={[
          styles.notificationItem,
          item.status === 'unread' && styles.unreadItem,
          isViolation && styles.violationItem
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
              item.status === 'unread' && styles.unreadTitle,
              isViolation && styles.violationTitle
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
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#f8f9fa" barStyle="dark-content" />
      
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
          <Text style={styles.pageTitle}>Notifications</Text>
          {notifications.length > 0 && (
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
        keyExtractor={(item) => item.id || `temp-${Math.random()}`}
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
  header: {
    backgroundColor: "#fff",
    paddingTop: Platform.OS === 'ios' ? 50 : 25,
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  logoImage: {
    width: 28,
    height: 28,
    marginRight: 8,
  },
  logoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  headerBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
    flex: 1,
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#e74c3c",
  },
  markAllText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 100,
  },
  emptyList: {
    flexGrow: 1,
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
  violationItem: {
    backgroundColor: '#fff5f5',
    borderLeftWidth: 3,
    borderLeftColor: '#e74c3c',
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
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
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
  violationTitle: {
    color: '#e74c3c',
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
    paddingTop: 100,
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