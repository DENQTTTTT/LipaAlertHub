// app/(auth)/reset-password/otp.tsx
import AuthCard from "@/components/AuthCard";
import { verifyOtp } from "@/services/otp"; // Import your OTP verification function
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity } from "react-native";

export default function OtpScreen() {
  const { docId, email } = useLocalSearchParams<{ docId: string; email: string }>(); 
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onVerify = async () => {
    try {
      setLoading(true);
      // Verify the OTP by hashing the code and checking it with Firestore
      const isValid = await verifyOtp({ docId, code }); // Pass as an object per function signature
      if (isValid) {
        // If the OTP is valid, navigate to the new password screen
        router.push(`/reset-password/new-password?email=${email}`);
      } else {
        Alert.alert("Error", "Invalid OTP. Please try again.");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to verify OTP.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="Enter OTP" subtitle="Check your email for the 6 digit code">
      <TextInput
        placeholder="Enter OTP"
        keyboardType="number-pad"
        maxLength={6}
        value={code}
        onChangeText={setCode}
        style={styles.input}
      />
      <TouchableOpacity style={styles.button} onPress={onVerify} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Verifying..." : "Verify OTP"}</Text>
      </TouchableOpacity>
    </AuthCard>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: "#eee",
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
    textAlign: "center",
    letterSpacing: 4,
  },
  button: {
    backgroundColor: "#D32F2F",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
