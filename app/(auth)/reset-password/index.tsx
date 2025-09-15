import { auth } from "@/services/firebase";
import { useRouter } from "expo-router";
import { sendPasswordResetEmail } from "firebase/auth";
import React, { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { requestOtpForEmail } from "../../../services/otp";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSend = async () => {
    if (!email) {
      Alert.alert("Error", "Please enter your email.");
      return;
    }

    try {
      setLoading(true);
      const normalizedEmail = email.trim().toLowerCase();

      // Method 1: Try to send a password reset email first to check if email exists
      try {
        await sendPasswordResetEmail(auth, normalizedEmail);
        // If successful, the email exists in Firebase Auth
        console.log("Email exists in Firebase Auth");
        
        // Proceed to OTP
        const { docId, sessionId, code } = await requestOtpForEmail(normalizedEmail);
        Alert.alert("OTP Generated", `Code: ${code}`);
        router.push({
          pathname: "/(auth)/reset-password/otp",
          params: { docId, email: normalizedEmail },
        });
      } catch (firebaseError: any) {
        console.log("Firebase error:", firebaseError.code);
        
        if (firebaseError.code === "auth/user-not-found") {
          Alert.alert(
            "Error",
            "The email you entered is not registered with us. Please check for typos or try registering."
          );
          return;
        } else if (firebaseError.code === "auth/invalid-email") {
          Alert.alert("Error", "Please enter a valid email address.");
          return;
        } else {
          // For other Firebase errors, still try the OTP method
          console.log("Firebase auth error, trying OTP method anyway:", firebaseError.message);
          
          try {
            const { docId, sessionId, code } = await requestOtpForEmail(normalizedEmail);
            Alert.alert("OTP Generated", `Code: ${code}`);
            router.push({
              pathname: "/(auth)/reset-password/otp",
              params: { docId, email: normalizedEmail },
            });
          } catch (otpError: any) {
            Alert.alert("Error", "Unable to verify email or generate OTP. Please try again.");
            console.error("OTP error:", otpError);
          }
        }
      }
    } catch (err: any) {
      console.error("General error:", err);
      Alert.alert("Error", err.message || "Failed to process request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset your password</Text>
      <Text style={styles.subtitle}>We will send you a 6-digit OTP to reset your password</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter your email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity style={styles.button} onPress={handleSend} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Sending..." : "Send OTP"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 8, textAlign: "center" },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 20, textAlign: "center" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, marginBottom: 16 },
  button: { backgroundColor: "#D32F2F", padding: 14, borderRadius: 8 },
  buttonText: { color: "#fff", textAlign: "center", fontWeight: "bold" },
});