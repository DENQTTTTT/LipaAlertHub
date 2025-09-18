// app/(auth)/reset-password/index.tsx
import { isValidEmail, requestOtp } from "@/services/otp";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from "react-native";

export default function ResetPasswordIndex() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const router = useRouter();

  const validateInput = (): boolean => {
    setEmailError("");
    
    if (!email.trim()) {
      setEmailError("Email is required");
      return false;
    }

    if (!isValidEmail(email.trim())) {
      setEmailError("Please enter a valid email address");
      return false;
    }

    return true;
  };

  const handleSendOtp = async () => {
    if (!validateInput()) {
      return;
    }

    Keyboard.dismiss();
    
    try {
      setLoading(true);
      const normalizedEmail = email.trim().toLowerCase();
      
      console.log("Requesting OTP for email:", normalizedEmail);
      const response = await requestOtp(normalizedEmail);
      
      if (response.success && response.sessionId) {
        // Show success message (generic to protect user privacy)
        Alert.alert(
          "OTP Sent",
          "If an account exists with this email address, you'll receive a 6-digit code shortly. The code will expire in 5 minutes.",
          [
            {
              text: "OK",
              onPress: () => {
                router.push({
                  pathname: "/(auth)/reset-password/otp",
                  params: { 
                    sessionId: response.sessionId,
                    email: normalizedEmail 
                  },
                });
              }
            }
          ]
        );
      } else {
        Alert.alert("Error", "Failed to send OTP. Please try again.");
      }
    } catch (error: any) {
      console.error("Error requesting OTP:", error);
      Alert.alert(
        "Error",
        error.message || "Unable to send OTP. Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    router.replace("/(auth)/login");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Reset Password</Text>
              <Text style={styles.subtitle}>
                Enter your email address to receive a 6-digit verification code
              </Text>
            </View>

            {/* Form */}
            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Email Address</Text>
                <TextInput
                  style={[
                    styles.input,
                    emailError ? styles.inputError : null,
                  ]}
                  placeholder="Enter your email"
                  placeholderTextColor="#999"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (emailError) setEmailError("");
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  editable={!loading}
                />
                {emailError ? (
                  <Text style={styles.errorText}>{emailError}</Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={[
                  styles.button,
                  loading ? styles.buttonDisabled : null,
                ]}
                onPress={handleSendOtp}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <View style={styles.buttonContent}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.buttonText}>Sending...</Text>
                  </View>
                ) : (
                  <Text style={styles.buttonText}>Send Verification Code</Text>
                )}
              </TouchableOpacity>

              {/* Security Notice */}
              <View style={styles.securityNotice}>
                <Text style={styles.securityTitle}>Security Notice</Text>
                <Text style={styles.securityText}>
                  • We'll send a 6-digit code to your email{'\n'}
                  • The code expires in 5 minutes{'\n'}
                  • For privacy, we won't confirm if the email exists
                </Text>
              </View>
            </View>

            {/* Back to Login */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBackToLogin}
              disabled={loading}
            >
              <Text style={styles.backButtonText}>
                ← Back to Login
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#D32F2F",
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    backgroundColor: "#fff",
    marginTop: 60,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
  form: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  inputError: {
    borderColor: "#dc3545",
    backgroundColor: "#fff5f5",
  },
  errorText: {
    color: "#dc3545",
    fontSize: 14,
    marginTop: 8,
    marginLeft: 4,
  },
  button: {
    backgroundColor: "#D32F2F",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#D32F2F",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonDisabled: {
    backgroundColor: "#ccc",
    shadowColor: "transparent",
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  securityNotice: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#28a745",
  },
  securityTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  securityText: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  backButton: {
    alignItems: "center",
    paddingVertical: 16,
    marginTop: 'auto',
  },
  backButtonText: {
    fontSize: 16,
    color: "#D32F2F",
    fontWeight: "500",
  },
});