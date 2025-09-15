import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="reset-password/index" />
      <Stack.Screen name="reset-password/otp" />
      <Stack.Screen name="reset-password/new-password" />
      <Stack.Screen name="id-verification" />
    </Stack>
  );
}
