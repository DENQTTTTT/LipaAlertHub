// app/(auth)/reset-password/new-password.tsx
import { auth } from "@/services/firebase";
import { useLocalSearchParams, useRouter } from "expo-router";
import { sendPasswordResetEmail } from "firebase/auth";
import React, { useState } from "react";
import { Alert, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function NewPasswordScreen() {
  const { email, docId } = useLocalSearchParams<{ email: string; docId: string }>();
  const [newPassword, setNewPassword] = useState("");
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
    if (!email) {
      Alert.alert("Error", "Email not found.");
      return;
    }

    try {
      setLoading(true);
      
      // Phase 1 Solution: Use Firebase's password reset email
      // Since OTP is verified, we can safely send the reset email
      await sendPasswordResetEmail(auth, email);
      
      // TODO: For Phase 2, replace this with your custom backend API call
      // Example: await updatePasswordWithOTP(email, newPassword, docId);
      
      Alert.alert(
        "Password Reset Started",
        `Step 1 Complete: Since your OTP was verified, we've sent a secure password reset link to ${email}.\n\nStep 2: Check your email and click the reset link to complete the password change.\n\nNote: In Phase 2, this will be automatic!`,
        [
          {
            text: "Got it",
            onPress: () => router.replace("/(auth)/login")
          }
        ]
      );
      
    } catch (error: any) {
      console.error("Password reset error:", error);
      let errorMessage = "Failed to initiate password reset.";
      
      if (error.code === "auth/user-not-found") {
        errorMessage = "No account found with this email.";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Invalid email address.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert("Error", errorMessage);
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
          onChangeText={setNewPassword}
        />
        <TextInput
          placeholder="Confirm new password"
          secureTextEntry
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />

        <View style={styles.phaseNote}>
          <Text style={styles.phaseText}>
            📝 Phase 1 Demo: After clicking "Set Password", you'll receive an email to complete the reset. In Phase 2, this will be automatic!
          </Text>
        </View>

        <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={loading}>
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
    padding: 20 
  },
  successBadge: {
    backgroundColor: "#d4edda",
    borderColor: "#c3e6cb",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
    marginVertical: 10
  },
  successText: {
    color: "#155724",
    fontWeight: "bold",
    fontSize: 14
  },
  title: { 
    fontSize: 22, 
    fontWeight: "bold", 
    textAlign: "center", 
    marginTop: 10 
  },
  subtitle: { 
    textAlign: "center", 
    fontSize: 13, 
    marginVertical: 10, 
    color: "#555" 
  },
  emailInfo: {
    backgroundColor: "#f8f9fa",
    padding: 15,
    borderRadius: 10,
    marginVertical: 15,
    borderLeftWidth: 4,
    borderLeftColor: "#28a745"
  },
  emailLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 5
  },
  emailValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333"
  },
  input: { 
    backgroundColor: "#f8f9fa", 
    borderRadius: 10, 
    padding: 12, 
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#e9ecef"
  },
  phaseNote: {
    backgroundColor: "#fff3cd",
    borderColor: "#ffeaa7",
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    marginVertical: 15
  },
  phaseText: {
    fontSize: 12,
    color: "#856404",
    textAlign: "center"
  },
  button: { 
    backgroundColor: "#D32F2F", 
    borderRadius: 12, 
    paddingVertical: 14, 
    alignItems: "center", 
    marginTop: 20 
  },
  buttonText: { 
    color: "#fff", 
    fontSize: 16, 
    fontWeight: "600" 
  }
});