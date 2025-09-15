import { useAuth } from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { notificationService } from '../../services/notifications';

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

  // Subscribe to notifications for badge count
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

    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [user?.uid]);

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
      <Tabs.Screen name="emergency/sos-services" options={{ href: null }} />

      <Tabs.Screen name="profile/edit" options={{ href: null }} />
      <Tabs.Screen name="profile/change-password/index" options={{ href: null }} />
      <Tabs.Screen name="profile/change-password/step2" options={{ href: null }} />
      <Tabs.Screen name="profile/change-password/success" options={{ href: null }} />
      <Tabs.Screen name="profile/strikes" options={{ href: null }} />
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