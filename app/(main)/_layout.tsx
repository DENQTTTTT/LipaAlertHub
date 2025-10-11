import { useAuth } from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { notificationService } from '../../services/notifications';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Notification badge component - FIXED
const NotificationBadge = ({ count }: { count: number }) => {
  if (!count || count === 0) return null;
  
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>
        {count > 99 ? '99+' : count.toString()}
      </Text>
    </View>
  );
};

// Custom tab bar icon with notification badge - FIXED
const TabBarIcon = ({ 
  name, 
  color, 
  focused, 
  showBadge, 
  badgeCount 
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  focused: boolean;
  showBadge?: boolean;
  badgeCount?: number;
}) => (
  <View style={styles.iconContainer}>
    <Ionicons 
      name={name} 
      size={28} 
      color={color} 
    />
    {showBadge && badgeCount !== undefined && badgeCount > 0 && (
      <NotificationBadge count={badgeCount} />
    )}
  </View>
);

export default function MainLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  // FIX: Proper type checking for segments
  useEffect(() => {
    if (loading) return;

    // Convert segments to string for safe checking
    const path = Array.isArray(segments) ? segments.join('/') : '';
    const isSOSRoute = path.includes('emergency') && 
                      (path.includes('sos') || path.includes('sos-services'));
    
    if (!user && !isSOSRoute) {
      router.replace("/(auth)/login");
    }
  }, [user, loading, segments]);

  useEffect(() => {
    if (!user?.uid) {
      setUnreadCount(0);
      return;
    }

    const initNotifications = async () => {
      try {
        await notificationService.initializePushNotifications();
      } catch (error) {
        console.error('Failed to initialize notifications:', error);
      }
    };

    initNotifications();

    const unsubscribe = notificationService.getUserNotifications(user.uid, (notifications) => {
      if (Array.isArray(notifications)) {
        const unread = notifications.filter(n => n && n.status === 'unread').length;
        setUnreadCount(unread || 0);
      } else {
        setUnreadCount(0);
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
      
      const data = notification.request.content.data;
      if (data?.type === 'weather_alert' && data?.alertId) {
        setUnreadCount(prev => prev + 1);
      }
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
      
      const data = response.notification.request.content.data;
      
      if (data?.type === 'weather_alert' && data?.alertId && typeof data.alertId === 'string') {
        router.push({
          pathname: '/(main)/weather/detailed',
          params: { alertId: data.alertId }
        });
        return;
      }

      if (data?.type === 'report_update' && data?.reportId && typeof data.reportId === 'string') {
        router.push({
          pathname: '/(main)/report/status',
          params: { reportId: data.reportId }
        });
        return;
      }

      if (data?.type === 'forum_reply' && data?.forumPostId && typeof data.forumPostId === 'string') {
        router.push({
          pathname: '/(main)/forum/post',
          params: { postId: data.forumPostId }
        });
        return;
      }

      if (data?.type === 'forum_like_post' && data?.forumPostId && typeof data.forumPostId === 'string') {
        router.push({
          pathname: '/(main)/forum/post',
          params: { postId: data.forumPostId }
        });
        return;
      }

      if (data?.type === 'forum_like_reply' && data?.forumPostId && typeof data.forumPostId === 'string') {
        router.push({
          pathname: '/(main)/forum/post',
          params: { postId: data.forumPostId }
        });
        return;
      }

      router.push('/(main)/notifications/index');
    });

    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
      
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [user?.uid, router]);

  useEffect(() => {
    const getInitialNotification = async () => {
      try {
        const response = await Notifications.getLastNotificationResponseAsync();
        if (response?.notification.request.content.data) {
          const data = response.notification.request.content.data;
          
          if (data.type === 'weather_alert' && data.alertId && typeof data.alertId === 'string') {
            setTimeout(() => {
              router.push({
                pathname: '/(main)/weather/detailed',
                params: { alertId: data.alertId as string }
              });
            }, 1000);
            return;
          }

          if (data.type === 'report_update' && data.reportId && typeof data.reportId === 'string') {
            setTimeout(() => {
              router.push({
                pathname: '/(main)/report/status',
                params: { reportId: data.reportId as string }
              });
            }, 1000);
            return;
          }

          if (data.type === 'forum_reply' && data.forumPostId && typeof data.forumPostId === 'string') {
            setTimeout(() => {
              router.push({
                pathname: '/(main)/forum/post',
                params: { postId: data.forumPostId as string }
              });
            }, 1000);
            return;
          }
        }
      } catch (error) {
        console.error('Error getting initial notification:', error);
      }
    };

    if (user?.uid && !loading) {
      getInitialNotification();
    }
  }, [user?.uid, loading, router]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D32F2F" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#D32F2F',
        tabBarInactiveTintColor: '#D32F2F',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 0.5,
          borderTopColor: '#E5E5E7',
          height: 90,
          paddingBottom: 25,
          paddingTop: 10,
          position: 'absolute',
          bottom: 0,
        },
        tabBarLabelStyle: {
          display: 'none',
        },
      }}
    >
      {/* TAB 1: Home */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon name="home" color={color} focused={focused} />
          ),
        }}
      />

      {/* TAB 2: Notifications */}
      <Tabs.Screen
        name="notifications/index"
        options={{
          title: 'Notifications',
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon 
              name="notifications" 
              color={color} 
              focused={focused} 
              showBadge={true}
              badgeCount={unreadCount}
            />
          ),
        }}
      />

      {/* TAB 3: Maps */}
      <Tabs.Screen
        name="maps/index"
        options={{
          title: 'Maps',
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon name="location" color={color} focused={focused} />
          ),
        }}
      />

      {/* TAB 4: Weather */}
      <Tabs.Screen
        name="weather/index"
        options={{
          title: 'Weather',
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon name="partly-sunny" color={color} focused={focused} />
          ),
        }}
      />

      {/* TAB 5: Profile */}
      <Tabs.Screen
        name="profile/index"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon name="person" color={color} focused={focused} />
          ),
        }}
      />

      {/* HIDDEN ROUTES */}
      <Tabs.Screen name="emergency/index" options={{ href: null, title: '' }} />
      <Tabs.Screen name="report/create" options={{ href: null, title: '' }} />
      <Tabs.Screen name="report/status" options={{ href: null, title: '' }} />
      <Tabs.Screen name="forum/index" options={{ href: null, title: '' }} />
      <Tabs.Screen name="forum/post" options={{ href: null, title: '' }} />
      <Tabs.Screen name="forum/create" options={{ href: null, title: '' }} />
      <Tabs.Screen name="chat/[id]" options={{ href: null, title: '' }} />
      <Tabs.Screen name="chat/index" options={{ href: null, title: '' }} />
      <Tabs.Screen name="maps/evacuation" options={{ href: null, title: '' }} />
      <Tabs.Screen name="weather/detailed" options={{ href: null, title: '' }} />
      <Tabs.Screen name="emergency/sos" options={{ href: null, title: '' }} />
      <Tabs.Screen name="emergency/tips" options={{ href: null, title: '' }} />
      <Tabs.Screen name="emergency/tips-category" options={{ href: null, title: '' }} />
      <Tabs.Screen name="emergency/sos-services" options={{ href: null, title: '' }} />
      <Tabs.Screen name="emergency/sos-status" options={{ href: null, title: '' }} />
      <Tabs.Screen name="profile/change-password/index" options={{ href: null, title: '' }} />
      <Tabs.Screen name="profile/strikes" options={{ href: null, title: '' }} />
      <Tabs.Screen name="announcements/index" options={{ href: null, title: '' }} />
      <Tabs.Screen name="announcements/details" options={{ href: null, title: '' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -12,
    backgroundColor: '#D32F2F',
    borderRadius: 12,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
});