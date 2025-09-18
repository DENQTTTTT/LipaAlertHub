import { useAuth } from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { notificationService } from '../../services/notifications';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async (notification: Notifications.Notification) => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Notification badge component
const NotificationBadge = ({ count }: { count: number }) => {
  if (count === 0) return null;
  
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>
        {count > 99 ? '99+' : count.toString()}
      </Text>
    </View>
  );
};

// Custom tab bar icon with notification badge
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
    {showBadge && badgeCount && badgeCount > 0 && <NotificationBadge count={badgeCount} />}
  </View>
);

export default function MainLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (loading) return; // Wait for auth to load

    // Check if user is accessing SOS routes
    const isSOSRoute = segments.includes('emergency') && 
                      (segments.includes('sos') || segments.includes('sos-services'));
    
    // If not authenticated and not accessing SOS, redirect to login
    if (!user && !isSOSRoute) {
      router.replace("/(auth)/login");
    }
  }, [user, loading, segments]);

  // Subscribe to notifications for badge count and push notification handling
  useEffect(() => {
    if (!user?.uid) {
      setUnreadCount(0);
      return;
    }

    // Initialize push notifications
    const initNotifications = async () => {
      try {
        await notificationService.initializePushNotifications();
      } catch (error) {
        console.error('Failed to initialize notifications:', error);
      }
    };

    initNotifications();

    // Subscribe to notifications for badge count
    const unsubscribe = notificationService.getUserNotifications(user.uid, (notifications) => {
      if (Array.isArray(notifications)) {
        const unread = notifications.filter(n => n && n.status === 'unread').length;
        setUnreadCount(unread || 0);
      } else {
        setUnreadCount(0);
      }
    });

    // Handle incoming notifications while app is running
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
      
      // Handle weather alert notifications
      const data = notification.request.content.data;
      if (data?.type === 'weather_alert' && data?.alertId) {
        // Update badge count immediately for weather alerts
        setUnreadCount(prev => prev + 1);
      }
    });

    // Handle notification responses (when user taps notification)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
      
      const data = response.notification.request.content.data;
      
      // Handle weather alert navigation
      if (data?.type === 'weather_alert' && data?.alertId && typeof data.alertId === 'string') {
        router.push({
          pathname: '/(main)/weather/detailed',
          params: { alertId: data.alertId }
        });
        return;
      }

      // Handle report update notifications
      if (data?.type === 'report_update' && data?.reportId && typeof data.reportId === 'string') {
        router.push({
          pathname: '/(main)/report/status',
          params: { reportId: data.reportId }
        });
        return;
      }

      // Handle forum notifications
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

      // Default to notifications screen for other types
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

  // Handle deep linking for notifications that launched the app
  useEffect(() => {
    const getInitialNotification = async () => {
      try {
        const response = await Notifications.getLastNotificationResponseAsync();
        if (response?.notification.request.content.data) {
          const data = response.notification.request.content.data;
          
          // Handle weather alert deep link
          if (data.type === 'weather_alert' && data.alertId && typeof data.alertId === 'string') {
            setTimeout(() => {
              router.push({
                pathname: '/(main)/weather/detailed',
                params: { alertId: data.alertId as string }
              });
            }, 1000);
            return;
          }

          // Handle other notification types
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

  // Show loading screen with proper component
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
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          // Define the icon for each tab depending on the route
          switch (route.name) {
            case 'index':
              iconName = 'home';
              return <TabBarIcon name={iconName} color={color} focused={focused} />;
            case 'notifications/index':
              iconName = 'notifications';
              return (
                <TabBarIcon 
                  name={iconName} 
                  color={color} 
                  focused={focused} 
                  showBadge={true}
                  badgeCount={unreadCount}
                />
              );
            case 'maps/index':
              iconName = 'location';
              return <TabBarIcon name={iconName} color={color} focused={focused} />;
            case 'weather/index':
              iconName = 'partly-sunny';
              return <TabBarIcon name={iconName} color={color} focused={focused} />;
            case 'profile/index':
              iconName = 'person';
              return <TabBarIcon name={iconName} color={color} focused={focused} />;
            default:
              iconName = 'ellipse';
              return <TabBarIcon name={iconName} color={color} focused={focused} />;
          }
        },
        tabBarActiveTintColor: '#D32F2F', // Active tab color (Red)
        tabBarInactiveTintColor: '#D32F2F', // Inactive tab color (Same red)
        headerShown: false, // Hide header for each screen
        tabBarStyle: {
          backgroundColor: '#fff', // Tab bar background color (white)
          borderTopWidth: 0.5,
          borderTopColor: '#E5E5E7', // Border color at the top
          height: 90, // Height of the tab bar (increased to avoid overlap)
          paddingBottom: 25, // More padding to avoid phone controls
          paddingTop: 10,
          position: 'absolute',
          bottom: 0,
        },
        tabBarLabelStyle: {
          display: 'none', // Hide labels
        },
      })}
    >
      {/* TAB 1: Home */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />

      {/* TAB 2: Notifications */}
      <Tabs.Screen
        name="notifications/index"
        options={{
          title: 'Notifications',
        }}
      />

      {/* TAB 3: Maps */}
      <Tabs.Screen
        name="maps/index"
        options={{
          title: 'Maps',
        }}
      />

      {/* TAB 4: Weather */}
      <Tabs.Screen
        name="weather/index"
        options={{
          title: 'Weather',
        }}
      />

      {/* TAB 5: Profile */}
      <Tabs.Screen
        name="profile/index"
        options={{
          title: 'Profile',
        }}
      />

      {/* HIDDEN ROUTES - Not shown in tab bar */}
      <Tabs.Screen name="emergency/index" options={{ href: null }} />
      <Tabs.Screen name="report/create" options={{ href: null }} />
      <Tabs.Screen name="report/confirm" options={{ href: null }} />
      <Tabs.Screen name="report/status" options={{ href: null }} />

      <Tabs.Screen name="forum/index" options={{ href: null }} />
      <Tabs.Screen name="forum/post" options={{ href: null }} />
      <Tabs.Screen name="forum/create" options={{ href: null }} />

      <Tabs.Screen name="chat/[id]" options={{ href: null }} />
      <Tabs.Screen name="chat/index" options={{ href: null }} />

      <Tabs.Screen name="maps/hazard" options={{ href: null }} />
      <Tabs.Screen name="maps/evacuation" options={{ href: null }} />

      <Tabs.Screen name="weather/alerts" options={{ href: null }} />
      <Tabs.Screen name="weather/detailed" options={{ href: null }} />

      <Tabs.Screen name="emergency/sos" options={{ href: null }} />
      <Tabs.Screen name="emergency/tips" options={{ href: null }} />
      <Tabs.Screen name="emergency/tips-category" options={{ href: null }} />
      <Tabs.Screen name="emergency/sos-services" options={{ href: null }} />

      <Tabs.Screen name="profile/edit" options={{ href: null }} />
      <Tabs.Screen name="profile/change-password/index" options={{ href: null }} />
      <Tabs.Screen name="profile/change-password/step2" options={{ href: null }} />
      <Tabs.Screen name="profile/change-password/success" options={{ href: null }} />
      <Tabs.Screen name="profile/strikes" options={{ href: null }} />

      {/* ANNOUNCEMENTS ROUTES - HIDDEN FROM TAB BAR */}
      <Tabs.Screen name="announcements/index" options={{ href: null }} />
      <Tabs.Screen name="announcements/details" options={{ href: null }} />
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