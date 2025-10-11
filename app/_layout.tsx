import { Stack } from "expo-router";
import React, { useEffect } from "react";
import { AuthProvider } from "../hooks/useAuth";
import { notificationService } from "../services/notifications";

// The root layout component that provides the AuthContext for your app
export default function AppLayout() {
  useEffect(() => {
    // Initialize push notifications
    notificationService.initializePushNotifications();
    
    // Setup notification listeners
    return () => {
      notificationService.cleanup();
    };
  }, []);

  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}