// app/(auth)/reset-password/otp.tsx
import { isValidOtpCode, requestOtp, verifyOtp } from "@/services/otp";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
  View,
} from "react-native";

export default function OtpScreen() {
  const { sessionId, email } = useLocalSearchParams<{
    sessionId: string;
    email: string;
  }>();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [codeError, setCodeError] = useState("");
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    // Auto-focus input when screen loads
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Start countdown timer
    if (timeLeft > 0) {
      const timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const validateCode = (): boolean => {
    setCodeError("");

    if (!code.trim()) {
      setCodeError("Please enter the verification code");
      return false;
    }

    if (!isValidOtpCode(code.trim())) {
      setCodeError("Please enter a valid 6-digit code");
      return false;
    }

    return true;
  };

  const handleVerifyOtp = async () => {
    if (!validateCode()) {
      return;
    }

    if (!sessionId) {
      Alert.alert("Error", "Invalid session. Please start over.");
      router.replace("/(auth)/reset-password");
      return;
    }

    Keyboard.dismiss();

    try {
      setLoading(true);
      
      console.log("Verifying OTP with sessionId:", sessionId);
      const response = await verifyOtp(sessionId, code.trim());

      if (response.success) {
        Alert.alert(
          "Code Verified",
          "Your verification code is correct. You can now set a new password.",
          [
            {
              text: "Continue",
              onPress: () => {
                router.push({
                  pathname: "/(auth)/reset-password/new-password",
                  params: {
                    sessionId: sessionId,
                    email: email,
                  },
                });
              },
            },
          ]
        );
      } else {
        Alert.alert("Error", "Failed to verify code. Please try again.");
      }
    } catch (error: any) {
      console.error("Error verifying OTP:", error);
      setCodeError(error.message || "Invalid verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) {
      Alert.alert("Error", "Email not found. Please start over.");
      router.replace("/(auth)/reset-password");
      return;
    }

    try {
      setResending(true);
      
      console.log("Resending OTP to email:", email);
      const response = await requestOtp(email);

      if (response.success && response.sessionId) {
        // Update sessionId and reset timer
        router.setParams({ sessionId: response.sessionId });
        setTimeLeft(300); // Reset to 5 minutes
        setCode(""); // Clear current code
        setCodeError("");

        Alert.alert(
          "Code Resent",
          "A new verification code has been sent to your email address."
        );
      } else {
        Alert.alert("Error", "Failed to resend code. Please try again.");
      }
    } catch (error: any) {
      console.error("Error resending OTP:", error);
      Alert.alert(
        "Error",
        error.message || "Failed to resend code. Please try again."
      );
    } finally {
      setResending(false);
    }
  };

  const handleGoBack = () => {
    router.back();
  };

  const handleCodeChange = (text: string) => {
    // Only allow numeric input and limit to 6 characters
    const numericText = text.replace(/[^0-9]/g, "").slice(0, 6);
    setCode(numericText);
    
    if (codeError) {
      setCodeError("");
    }
  };

  const canResend = timeLeft === 0 && !resending;
  const canVerify = code.length === 6 && !loading;

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
              <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
                <Text style={styles.backButtonText}>←</Text>
              </TouchableOpacity>
              <Text style={styles.title}>Enter Verification Code</Text>
              <Text style={styles.subtitle}>
                We've sent a 6-digit code to{"\n"}
                <Text style={styles.emailText}>{email}</Text>
              </Text>
            </View>

            {/* Code Input */}
            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <TextInput
                  ref={inputRef}
                  style={[
                    styles.codeInput,
                    codeError ? styles.inputError : null,
                  ]}
                  placeholder="000000"
                  placeholderTextColor="#ccc"
                  value={code}
                  onChangeText={handleCodeChange}
                  keyboardType="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  editable={!loading}
                  selectTextOnFocus={true}
                />
                {codeError ? (
                  <Text style={styles.errorText}>{codeError}</Text>
                ) : null}
              </View>

              {/* Timer */}
              <View style={styles.timerContainer}>
                {timeLeft > 0 ? (
                  <Text style={styles.timerText}>
                    Code expires in {formatTime(timeLeft)}
                  </Text>
                ) : (
                  <Text style={styles.expiredText}>Code has expired</Text>
                )}
              </View>

              {/* Verify Button */}
              <TouchableOpacity
                style={[
                  styles.verifyButton,
                  !canVerify ? styles.buttonDisabled : null,
                ]}
                onPress={handleVerifyOtp}
                disabled={!canVerify}
                activeOpacity={0.8}
              >
                {loading ? (
                  <View style={styles.buttonContent}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.buttonText}>Verifying...</Text>
                  </View>
                ) : (
                  <Text style={styles.buttonText}>Verify Code</Text>
                )}
              </TouchableOpacity>

              {/* Resend Button */}
              <TouchableOpacity
                style={[
                  styles.resendButton,
                  !canResend ? styles.resendDisabled : null,
                ]}
                onPress={handleResendCode}
                disabled={!canResend}
                activeOpacity={0.8}
              >
                {resending ? (
                  <View style={styles.buttonContent}>
                    <ActivityIndicator size="small" color="#D32F2F" />
                    <Text style={styles.resendText}>Sending...</Text>
                  </View>
                ) : (
                  <Text style={[
                    styles.resendText,
                    !canResend ? styles.resendTextDisabled : null,
                  ]}>
                    {timeLeft > 0 ? `Resend code in ${formatTime(timeLeft)}` : "Resend Code"}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Help Text */}
              <View style={styles.helpContainer}>
                <Text style={styles.helpText}>
                  Didn't receive the code? Check your spam folder or try resending.
                </Text>
              </View>
            </View>
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
    paddingTop: 20,
    paddingBottom: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
    position: "relative",
  },
  backButton: {
    position: "absolute",
    left: -24,
    top: 10,
    padding: 12,
    zIndex: 1,
  },
  backButtonText: {
    fontSize: 24,
    color: "#D32F2F",
    fontWeight: "bold",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginTop: 20,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
  emailText: {
    fontWeight: "600",
    color: "#D32F2F",
  },
  form: {
    flex: 1,
  },
  inputContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  codeInput: {
    fontSize: 32,
    fontWeight: "bold",
    textAlign: "center",
    letterSpacing: 8,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 20,
    width: "100%",
    borderWidth: 2,
    borderColor: "#e9ecef",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  inputError: {
    borderColor: "#dc3545",
    backgroundColor: "#fff5f5",
  },
  errorText: {
    color: "#dc3545",
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
  },
  timerContainer: {
    alignItems: "center",
    marginBottom: 30,
  },
  timerText: {
    fontSize: 16,
    color: "#28a745",
    fontWeight: "500",
  },
  expiredText: {
    fontSize: 16,
    color: "#dc3545",
    fontWeight: "500",
  },
  verifyButton: {
    backgroundColor: "#D32F2F",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
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
  resendButton: {
    padding: 16,
    alignItems: "center",
    marginBottom: 24,
  },
  resendDisabled: {
    opacity: 0.5,
  },
  resendText: {
    color: "#D32F2F",
    fontSize: 16,
    fontWeight: "500",
  },
  resendTextDisabled: {
    color: "#999",
  },
  helpContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    marginTop: "auto",
  },
  helpText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
});