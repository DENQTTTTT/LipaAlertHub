// app/root.tsx
import React from "react";
import { Button, Text, View } from "react-native";
import { useAuth } from "../hooks/useAuth";

export default function Root() {
  const { user, loading } = useAuth();

  if (loading) {
    return <Text>Loading...</Text>;
  }

  if (user) {
    return (
      <View>
        <Text>Welcome back, {user.displayName ?? user.email}</Text>
        {/* Add navigation to the main dashboard here */}
        <Button title="Go to Dashboard" onPress={() => {/* navigate to dashboard */}} />
      </View>
    );
  }

  return (
    <View>
      <Text>Please log in</Text>
      {/* Add navigation to login screen */}
    </View>
  );
}
