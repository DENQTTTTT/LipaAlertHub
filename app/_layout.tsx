import { Stack } from "expo-router";
import React from "react";
import { AuthProvider } from "../hooks/useAuth";

// The root layout component that provides the AuthContext for your app
export default function AppLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}