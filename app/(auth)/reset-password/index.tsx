// app/(auth)/reset-password/index.tsx - Enhanced responsive design with fixed logo and padding
import { checkEmailExists } from "@/services/auth";
import { isValidEmail, requestOtp } from "@/services/otp";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from "react-native";

const { width, height } = Dimensions.get('window');
const isSmallScreen = width < 380;
const isMediumScreen = width >= 380 && width < 414;
const isLargeScreen = width >= 414;

interface RateLimitInfo {
  type: 'rate_limit' | 'hourly_limit';
  title: string;
  message: string;
  suggestion: string;
  remainingTime?: string;
}

export default function ResetPasswordIndex() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);
  const router = useRouter();

  const validateInput = (): boolean => {
    setEmailError("");
    setRateLimitInfo(null);
    
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

  const handleRateLimitError = (errorMessage: string) => {
    if (errorMessage.includes("3 attempts per hour") || errorMessage.includes("Hourly limit")) {
      setRateLimitInfo({
        type: 'hourly_limit',
        title: "Rate Limit Reached",
        message: "You've reached the maximum of 3 password reset attempts per hour.",
        suggestion: "Please wait 1 hour before trying again, or contact support if you need immediate help.",
        remainingTime: "1 hour"
      });
    } else if (errorMessage.includes("wait 1 minute") || errorMessage.includes("Rate limit")) {
      setRateLimitInfo({
        type: 'rate_limit',
        title: "Too Many Attempts",
        message: "Please wait a moment before trying again.",
        suggestion: "This helps us prevent spam and keep your account secure.",
        remainingTime: "1 minute"
      });
    }
  };

  const handleSendOtp = async () => {
    if (!validateInput()) {
      return;
    }

    Keyboard.dismiss();
    
    try {
      setLoading(true);
      setRateLimitInfo(null);
      const normalizedEmail = email.trim().toLowerCase();
      
      console.log("Checking email existence:", normalizedEmail);
      const emailExists = await checkEmailExists(normalizedEmail);
      console.log("Email exists result:", emailExists);
      
      if (!emailExists) {
        setEmailError("No account found with this email address");
        return;
      }

      console.log("Requesting OTP for email:", normalizedEmail);
      const response = await requestOtp(normalizedEmail);
      
      if (response.success && response.sessionId) {
        Alert.alert(
          "OTP Sent",
          "A 6-digit pin OTP has been sent to your email to reset your password",
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
      
      const errorMessage = error.message || "Unable to send OTP. Please check your connection and try again.";
      
      if (errorMessage.includes("limit") || errorMessage.includes("wait")) {
        setEmailError(errorMessage);
        handleRateLimitError(errorMessage);
      } else {
        setEmailError(errorMessage);
        Alert.alert("Error", errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
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
                  We will send you a 6 digit pin OTP to{'\n'}reset your password
                </Text>
              </View>

              <View style={styles.form}>
                <Text style={styles.label}>EMAIL</Text>
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
                    if (emailError) {
                      setEmailError("");
                      setRateLimitInfo(null);
                    }
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  editable={!loading}
                  returnKeyType="done"
                  onSubmitEditing={handleSendOtp}
                />

                {emailError ? (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{emailError}</Text>
                  </View>
                ) : null}

                {rateLimitInfo && (
                  <View style={[
                    styles.rateLimitContainer,
                    rateLimitInfo.type === 'hourly_limit' ? styles.hourlyLimitContainer : styles.minuteLimitContainer
                  ]}>
                    <View style={styles.rateLimitHeader}>
                      <Text style={styles.rateLimitIcon}>
                        {rateLimitInfo.type === 'hourly_limit' ? '⏰' : '⏱️'}
                      </Text>
                      <Text style={styles.rateLimitTitle}>{rateLimitInfo.title}</Text>
                    </View>
                    <Text style={styles.rateLimitMessage}>{rateLimitInfo.message}</Text>
                    <Text style={styles.rateLimitSuggestion}>{rateLimitInfo.suggestion}</Text>
                    {rateLimitInfo.remainingTime && (
                      <View style={styles.waitTimeContainer}>
                        <Text style={styles.waitTimeText}>
                          Please wait: {rateLimitInfo.remainingTime}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    (loading || rateLimitInfo) ? styles.sendButtonDisabled : null,
                  ]}
                  onPress={handleSendOtp}
                  disabled={loading || !!rateLimitInfo}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.loadingText}>Sending...</Text>
                    </View>
                  ) : rateLimitInfo ? (
                    <Text style={styles.disabledButtonText}>
                      Please wait {rateLimitInfo.remainingTime}
                    </Text>
                  ) : (
                    <Text style={styles.sendButtonText}>Send</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
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
  scrollContainer: {
    flexGrow: 1,
    minHeight: height,
  },
  header: {
    backgroundColor: "#d73527",
    paddingTop: Platform.OS === 'ios' ? 20 : 40,
    paddingBottom: isSmallScreen ? height * 0.12 : height * 0.15, // Back to original header padding
    paddingHorizontal: width * 0.05,
    position: "relative",
    minHeight: isSmallScreen ? height * 0.45 : height * 0.48, // Back to original header height
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
    marginTop: Platform.OS === 'ios' ? 50 : 40, // FIXED: Even more margin for higher padding
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
    paddingTop: isSmallScreen ? height * 0.03 : height * 0.035,
    paddingBottom: height * 0.03,
    minHeight: isSmallScreen ? height * 0.55 : height * 0.52,
    marginTop: isSmallScreen ? -height * 0.12 : -height * 0.15, // FIXED: Move white card extremely high up
  },
  titleContainer: {
    alignItems: "center",
    marginBottom: isSmallScreen ? height * 0.04 : height * 0.05,
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
    lineHeight: isSmallScreen ? 20 : 22,
  },
  form: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 18 : 16,
    fontSize: isSmallScreen ? 14 : 16,
    color: "#333",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "transparent",
    minHeight: isSmallScreen ? 50 : 55,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  inputError: {
    borderColor: "#d73527",
    backgroundColor: "#fff5f5",
  },
  errorContainer: {
    marginBottom: 12,
  },
  errorText: {
    color: "#d73527",
    fontSize: isSmallScreen ? 12 : 14,
    marginLeft: 4,
    fontWeight: "500",
  },
  rateLimitContainer: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
  },
  hourlyLimitContainer: {
    backgroundColor: "#fff8f0",
    borderColor: "#f97316",
  },
  minuteLimitContainer: {
    backgroundColor: "#fef2f2",
    borderColor: "#ef4444",
  },
  rateLimitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  rateLimitIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  rateLimitTitle: {
    fontSize: isSmallScreen ? 14 : 16,
    fontWeight: "bold",
    color: "#333",
  },
  rateLimitMessage: {
    fontSize: isSmallScreen ? 12 : 14,
    color: "#555",
    marginBottom: 6,
    lineHeight: isSmallScreen ? 18 : 20,
  },
  rateLimitSuggestion: {
    fontSize: isSmallScreen ? 11 : 13,
    color: "#666",
    fontStyle: "italic",
    lineHeight: isSmallScreen ? 16 : 18,
  },
  waitTimeContainer: {
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
    padding: 8,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  waitTimeText: {
    fontSize: 11,
    color: "#374151",
    fontWeight: "600",
  },
  sendButton: {
    backgroundColor: "#d73527",
    borderRadius: 12,
    paddingVertical: Platform.OS === 'ios' ? 18 : 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: isSmallScreen ? height * 0.03 : height * 0.04,
    elevation: 3,
    shadowColor: "#d73527",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    minHeight: isSmallScreen ? 50 : 55,
  },
  sendButtonDisabled: {
    backgroundColor: "#ccc",
    elevation: 0,
    shadowOpacity: 0,
  },
  sendButtonText: {
    color: "#fff",
    fontSize: isSmallScreen ? 14 : 16,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  disabledButtonText: {
    color: "#fff",
    fontSize: isSmallScreen ? 12 : 14,
    fontWeight: "500",
    opacity: 0.8,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#fff",
    fontSize: isSmallScreen ? 14 : 16,
    fontWeight: "600",
    marginLeft: 8,
  },
});