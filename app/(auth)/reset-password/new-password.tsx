// app/(auth)/reset-password/new-password.tsx
import { setNewPassword } from "@/services/otp"; // <-- Phase 2 service (make sure this exists)
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function NewPasswordScreen() {
  const { email, docId } = useLocalSearchParams<{ email: string; docId: string }>();
  const [newPassword, setNewPasswordState] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onSubmit = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }
    if (!docId) {
      Alert.alert("Error", "Missing session ID.");
      return;
    }

    try {
      setLoading(true);

      // ✅ Phase 2: Call your backend Cloud Function
      const result = await setNewPassword(docId, newPassword);

      if (result.success) {
        Alert.alert(
          "Password Updated",
          "Your password has been reset successfully.",
          [{ text: "OK", onPress: () => router.replace("/(auth)/login") }]
        );
      } else {
        throw new Error(result.message || "Failed to reset password.");
      }
    } catch (error: any) {
      console.error("Password reset error:", error);
      Alert.alert("Error", error.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={{ color: "#fff", fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <Image source={require("@/assets/images/logo.png")} style={styles.logo} />
        <Text style={styles.appName}>LipaAlertHub</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.successBadge}>
          <Text style={styles.successText}>✓ OTP Verified</Text>
        </View>

        <Text style={styles.title}>Set New Password</Text>
        <Text style={styles.subtitle}>
          Your OTP was verified successfully. Enter your new password below.
        </Text>

        <View style={styles.emailInfo}>
          <Text style={styles.emailLabel}>Account:</Text>
          <Text style={styles.emailValue}>{email}</Text>
        </View>

        <TextInput
          placeholder="New password (min 6 characters)"
          secureTextEntry
          style={styles.input}
          value={newPassword}
          onChangeText={setNewPasswordState}
        />
        <TextInput
          placeholder="Confirm new password"
          secureTextEntry
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />

        <TouchableOpacity
          style={styles.button}
          onPress={onSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Processing..." : "Set New Password"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#D32F2F" },
  header: { alignItems: "center", paddingTop: 60, paddingBottom: 20 },
  backBtn: { position: "absolute", top: 65, left: 20 },
  logo: { width: 100, height: 100, resizeMode: "contain" },
  appName: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
  },
  successBadge: {
    backgroundColor: "#d4edda",
    borderColor: "#c3e6cb",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
    marginVertical: 10,
  },
  successText: {
    color: "#155724",
    fontWeight: "bold",
    fontSize: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 10,
  },
  subtitle: {
    textAlign: "center",
    fontSize: 13,
    marginVertical: 10,
    color: "#555",
  },
  emailInfo: {
    backgroundColor: "#f8f9fa",
    padding: 15,
    borderRadius: 10,
    marginVertical: 15,
    borderLeftWidth: 4,
    borderLeftColor: "#28a745",
  },
  emailLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 5,
  },
  emailValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  input: {
    backgroundColor: "#f8f9fa",
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  button: {
    backgroundColor: "#D32F2F",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
