// app/(auth)/reset-password/otp.tsx - Enhanced responsive design with fixed layout
import { isValidOtpCode, requestOtp, verifyOtp } from "@/services/otp";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
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

const { width, height } = Dimensions.get('window');
const isSmallScreen = width < 380;
const isMediumScreen = width >= 380 && width < 414;
const isLargeScreen = width >= 414;

export default function OtpScreen() {
  const { sessionId, email } = useLocalSearchParams<{
    sessionId: string;
    email: string;
  }>();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60); // Reduced to 1 minute for resend
  const [codeError, setCodeError] = useState("");
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    // Auto-focus when component mounts
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 300); // Reduced delay for faster keyboard appearance
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Re-focus when coming back from background or other screens
    const focusListener = () => {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    };
    
    // Focus when screen becomes active
    focusListener();
    
    return () => {};
  }, []);

  useEffect(() => {
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
          "Code Verified Successfully",
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
        setCodeError("Invalid verification code. Please try again.");
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
        router.setParams({ sessionId: response.sessionId });
        setTimeLeft(60); // Reset to 1 minute
        setCode("");
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
    const numericText = text.replace(/[^0-9]/g, "").slice(0, 6);
    setCode(numericText);
    
    if (codeError) {
      setCodeError("");
    }

    // Keep input focused while typing
    if (inputRef.current && !inputRef.current.isFocused()) {
      inputRef.current.focus();
    }

    if (numericText.length === 6) {
      setTimeout(handleVerifyOtp, 100);
    }
  };

  const handleBoxPress = () => {
    // Always focus the hidden input when any box is pressed
    inputRef.current?.focus();
  };

  const canResend = timeLeft === 0 && !resending;
  const canVerify = code.length === 6 && !loading;

  const renderOtpBoxes = () => {
    const boxes = [];
    for (let i = 0; i < 6; i++) {
      const isActive = i === code.length;
      const isFilled = i < code.length;
      
      boxes.push(
        <View 
          key={i} 
          style={[
            styles.otpBox, 
            isActive && styles.otpBoxActive,
            isFilled && styles.otpBoxFilled,
            codeError && styles.otpBoxError
          ]}
        >
          <Text style={[styles.otpText, isFilled && styles.otpTextFilled]}>
            {code[i] || ""}
          </Text>
        </View>
      );
    }
    return boxes;
  };

  const maskEmail = (email: string) => {
    if (!email || !email.includes('@')) return email;
    const [localPart, domain] = email.split('@');
    const maskedLocal = localPart.charAt(0) + '*'.repeat(localPart.length - 2) + localPart.charAt(localPart.length - 1);
    return maskedLocal + '@' + domain;
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.content}>
            {/* Header with Logo */}
            <View style={styles.header}>
              <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
                <Text style={styles.backIcon}>←</Text>
              </TouchableOpacity>
              
              <View style={styles.logoContainer}>
                <View style={styles.logoCircle}>
                  <Image
                    source={require("@/assets/images/logo.png")}
                    style={styles.logo}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.appName}>LipaAlertHub</Text>
              </View>
            </View>

            {/* Main Content Card */}
            <View style={styles.card}>
              <View style={styles.titleContainer}>
                <Text style={styles.title}>Reset your password</Text>
                <Text style={styles.subtitle}>
                  A 5 digit OTP was sent to
                </Text>
                <Text style={styles.emailText}>{maskEmail(email || "")}</Text>
              </View>

              <View style={styles.form}>
                <Text style={styles.label}>VERIFY YOUR OTP</Text>
                
                {/* Hidden TextInput for actual input */}
                <TextInput
                  ref={inputRef}
                  style={styles.hiddenInput}
                  value={code}
                  onChangeText={handleCodeChange}
                  keyboardType="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  editable={!loading}
                  autoFocus={true}
                  selectTextOnFocus={true}
                  onBlur={() => {
                    // Re-focus if input loses focus accidentally
                    if (!loading) {
                      setTimeout(() => {
                        inputRef.current?.focus();
                      }, 50);
                    }
                  }}
                />

                {/* Visual OTP Boxes */}
                <TouchableOpacity 
                  style={styles.otpContainer} 
                  onPress={handleBoxPress}
                  activeOpacity={0.7}
                >
                  {renderOtpBoxes()}
                </TouchableOpacity>

                {codeError ? (
                  <Text style={styles.errorText}>{codeError}</Text>
                ) : null}

                <TouchableOpacity
                  style={[
                    styles.verifyButton,
                    !canVerify ? styles.verifyButtonDisabled : null,
                  ]}
                  onPress={handleVerifyOtp}
                  disabled={!canVerify}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.loadingText}>Verifying...</Text>
                    </View>
                  ) : (
                    <Text style={styles.verifyButtonText}>VERIFY</Text>
                  )}
                </TouchableOpacity>

                {/* Resend Section */}
                <View style={styles.resendContainer}>
                  <Text style={styles.resendPrompt}>
                    {timeLeft > 0 ? `Resend code in ${formatTime(timeLeft)}` : "Didn't receive the code?"}
                  </Text>
                  {timeLeft === 0 && (
                    <TouchableOpacity
                      style={styles.resendButton}
                      onPress={handleResendCode}
                      disabled={resending}
                      activeOpacity={0.8}
                    >
                      {resending ? (
                        <View style={styles.resendLoadingContainer}>
                          <ActivityIndicator size="small" color="#d73527" />
                          <Text style={styles.resendLoadingText}>Sending...</Text>
                        </View>
                      ) : (
                        <Text style={styles.resendText}>Resend Code</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#d73527",
  },
  keyboardContainer: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  header: {
    backgroundColor: "#d73527",
    paddingTop: Platform.OS === 'ios' ? 20 : 40,
    paddingBottom: isSmallScreen ? height * 0.12 : height * 0.15, // FIXED: Same as reset-password
    paddingHorizontal: width * 0.05,
    position: "relative",
    minHeight: isSmallScreen ? height * 0.45 : height * 0.48, // FIXED: Same as reset-password
    justifyContent: 'center',
  },
  backButton: {
    position: "absolute",
    top: Platform.OS === 'ios' ? 50 : 50,
    left: width * 0.05,
    zIndex: 10,
    padding: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 24,
    color: "#fff",
    fontWeight: "bold",
  },
  logoContainer: {
    alignItems: "center",
    marginTop: Platform.OS === 'ios' ? 40 : 30, // FIXED: Same as reset-password
  },
  logoCircle: {
    width: isSmallScreen ? 100 : isMediumScreen ? 110 : 120, // FIXED: Larger logo
    height: isSmallScreen ? 100 : isMediumScreen ? 110 : 120,
    borderRadius: isSmallScreen ? 50 : isMediumScreen ? 55 : 60,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: isSmallScreen ? 16 : 20, // FIXED: Increased spacing
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  logo: {
    width: "65%", // FIXED: Larger logo content
    height: "65%",
  },
  appName: {
    fontSize: isSmallScreen ? 22 : isMediumScreen ? 24 : 26, // FIXED: Larger text
    fontWeight: "bold",
    color: "#fff",
    textAlign: 'center',
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: width * 0.06,
    paddingTop: isSmallScreen ? height * 0.03 : height * 0.035, // FIXED: Same as final reset-password
    paddingBottom: height * 0.03,
    minHeight: isSmallScreen ? height * 0.55 : height * 0.52,
    marginTop: isSmallScreen ? -height * 0.12 : -height * 0.15, // FIXED: Move white card up same amount
  },
  titleContainer: {
    alignItems: "center",
    marginBottom: isSmallScreen ? height * 0.04 : height * 0.06,
  },
  title: {
    fontSize: isSmallScreen ? 24 : isMediumScreen ? 26 : 28,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: isSmallScreen ? 14 : 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 4,
  },
  emailText: {
    fontSize: isSmallScreen ? 14 : 16,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  form: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    letterSpacing: 1,
    marginBottom: isSmallScreen ? 16 : 20,
    textAlign: "center",
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    height: 1,
    width: 1,
  },
  otpContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: isSmallScreen ? 16 : 20,
    paddingHorizontal: isSmallScreen ? 10 : 15,
  },
  otpBox: {
    width: isSmallScreen ? 42 : isMediumScreen ? 48 : 52,
    height: isSmallScreen ? 50 : isMediumScreen ? 56 : 60,
    borderRadius: 12,
    backgroundColor: "#f8f9fa",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#e9ecef",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  otpBoxActive: {
    borderColor: "#d73527",
    backgroundColor: "#fff",
    elevation: 4,
    shadowOpacity: 0.2,
  },
  otpBoxFilled: {
    backgroundColor: "#fff5f5",
    borderColor: "#d73527",
  },
  otpBoxError: {
    borderColor: "#dc3545",
    backgroundColor: "#fff5f5",
  },
  otpText: {
    fontSize: isSmallScreen ? 20 : isMediumScreen ? 24 : 26,
    fontWeight: "bold",
    color: "#dee2e6",
  },
  otpTextFilled: {
    color: "#1a1a1a",
  },
  errorText: {
    color: "#d73527",
    fontSize: isSmallScreen ? 12 : 14,
    textAlign: "center",
    marginBottom: isSmallScreen ? 16 : 20,
    fontWeight: "500",
  },
  verifyButton: {
    backgroundColor: "#d73527",
    borderRadius: 12,
    paddingVertical: Platform.OS === 'ios' ? 18 : 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: isSmallScreen ? height * 0.03 : height * 0.04,
    elevation: 4,
    shadowColor: "#d73527",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    minHeight: isSmallScreen ? 50 : 55,
  },
  verifyButtonDisabled: {
    backgroundColor: "#ccc",
    elevation: 0,
    shadowOpacity: 0,
  },
  verifyButtonText: {
    color: "#fff",
    fontSize: isSmallScreen ? 14 : 16,
    fontWeight: "700",
    letterSpacing: 1,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: "#fff",
    fontSize: isSmallScreen ? 14 : 16,
    fontWeight: "600",
  },
  resendContainer: {
    alignItems: "center",
    paddingTop: isSmallScreen ? 16 : 20,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  resendPrompt: {
    fontSize: isSmallScreen ? 12 : 14,
    color: "#666",
    marginBottom: 8,
    textAlign: "center",
  },
  resendButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  resendLoadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resendLoadingText: {
    color: "#d73527",
    fontSize: isSmallScreen ? 12 : 14,
    fontWeight: "500",
  },
  resendText: {
    color: "#d73527",
    fontSize: isSmallScreen ? 12 : 14,
    fontWeight: "600",
  },
});