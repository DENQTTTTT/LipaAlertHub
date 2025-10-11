// app/(auth)/reset-password/new-password.tsx - Updated to match consistent styling with larger logo and moved up white card
import { validatePasswordStrength } from "@/services/auth";
import { setNewPassword } from "@/services/otp";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
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
  View,
} from "react-native";

const { width, height } = Dimensions.get('window');

// Responsive design breakpoints
const isSmallScreen = width < 380;
const isMediumScreen = width >= 380 && width < 414;
const isLargeScreen = width >= 414;
const isTablet = width > 600;

// Dynamic sizing
const getResponsiveSize = (small: number, medium: number, large: number) => {
  if (isTablet) return large * 1.2;
  if (isLargeScreen) return large;
  if (isMediumScreen) return medium;
  return small;
};

export default function NewPasswordScreen() {
  const { sessionId, email } = useLocalSearchParams<{ sessionId: string; email: string }>();
  const [newPassword, setNewPasswordState] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Password strength indicator
  const [passwordStrength, setPasswordStrength] = useState({ strength: 0, label: "", color: "#e9ecef" });
  
  const router = useRouter();

  const handleNewPasswordChange = (text: string) => {
    setNewPasswordState(text);
    setPasswordError("");
    
    // Update password strength in real-time
    if (text.length > 0) {
      const strength = validatePasswordStrength(text);
      setPasswordStrength({
        strength: strength.score,
        label: strength.score <= 2 ? "Weak" : strength.score <= 4 ? "Good" : "Strong",
        color: strength.score <= 2 ? "#dc3545" : strength.score <= 4 ? "#ffc107" : "#28a745"
      });
    } else {
      setPasswordStrength({ strength: 0, label: "", color: "#e9ecef" });
    }
  };

  const validatePasswords = (): boolean => {
    setPasswordError("");
    setConfirmError("");

    if (!newPassword.trim()) {
      setPasswordError("Password is required");
      return false;
    }

    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      setPasswordError(passwordValidation.errors[0]);
      return false;
    }

    if (!confirmPassword.trim()) {
      setConfirmError("Please confirm your password");
      return false;
    }

    if (newPassword !== confirmPassword) {
      setConfirmError("Passwords do not match");
      return false;
    }

    return true;
  };

  const handleSetNewPassword = async () => {
    if (!validatePasswords()) {
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
      
      const result = await setNewPassword(sessionId, newPassword);

      if (result.success) {
        Alert.alert(
          "Password Reset Successful",
          "Your password has been updated successfully. You can now sign in with your new password.",
          [
            {
              text: "Sign In",
              onPress: () => router.replace("/(auth)/login"),
            },
          ]
        );
      } else {
        throw new Error(result.message || "Failed to reset password.");
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = () => {
    router.back();
  };

  const maskEmail = (email: string) => {
    if (!email || !email.includes('@')) return email;
    const [localPart, domain] = email.split('@');
    const maskedLocal = localPart.charAt(0) + '*'.repeat(localPart.length - 2) + localPart.charAt(localPart.length - 1);
    return maskedLocal + '@' + domain;
  };

  const renderPasswordStrengthIndicator = () => {
    if (newPassword.length === 0) return null;

    return (
      <View style={styles.strengthContainer}>
        <View style={styles.strengthBar}>
          <View 
            style={[
              styles.strengthFill, 
              { 
                width: `${(passwordStrength.strength / 5) * 100}%`,
                backgroundColor: passwordStrength.color 
              }
            ]} 
          />
        </View>
        <Text style={[styles.strengthLabel, { color: passwordStrength.color }]}>
          {passwordStrength.label}
        </Text>
      </View>
    );
  };

  const renderPasswordInput = (
    value: string,
    onChangeText: (text: string) => void,
    placeholder: string,
    label: string,
    error: string,
    showPassword: boolean,
    toggleShowPassword: () => void,
    autoComplete?: string
  ) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.passwordContainer, error ? styles.inputError : null]}>
        <TextInput
          style={styles.passwordInput}
          placeholder={placeholder}
          placeholderTextColor="#999"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete as any}
          textContentType={autoComplete as any}
          editable={!loading}
          returnKeyType="next"
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={toggleShowPassword}
          disabled={loading}
        >
          <Ionicons
            name={showPassword ? "eye" : "eye-off"}
            size={getResponsiveSize(20, 22, 24)}
            color="#666"
          />
        </TouchableOpacity>
      </View>
      
      {/* Show password strength for new password */}
      {label === "NEW PASSWORD" && renderPasswordStrengthIndicator()}
      
      {error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={16} color="#d73527" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity 
                style={styles.backButton} 
                onPress={handleGoBack}
                disabled={loading}
              >
                <Ionicons 
                  name="arrow-back" 
                  size={getResponsiveSize(22, 24, 26)} 
                  color="#fff" 
                />
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
                <Text style={styles.title}>Set New Password</Text>
                <Text style={styles.subtitle}>
                  Create a strong password for your account
                </Text>
              </View>

              {/* Account Info */}
              <View style={styles.emailInfo}>
                <Text style={styles.emailValue}>{maskEmail(email || "")}</Text>
              </View>

              <View style={styles.form}>
                {/* New Password */}
                {renderPasswordInput(
                  newPassword,
                  handleNewPasswordChange,
                  "Enter new password",
                  "NEW PASSWORD",
                  passwordError,
                  showNewPassword,
                  () => setShowNewPassword(!showNewPassword),
                  "new-password"
                )}

                {/* Confirm Password */}
                {renderPasswordInput(
                  confirmPassword,
                  (text) => {
                    setConfirmPassword(text);
                    setConfirmError("");
                  },
                  "Confirm new password",
                  "CONFIRM NEW PASSWORD",
                  confirmError,
                  showConfirmPassword,
                  () => setShowConfirmPassword(!showConfirmPassword),
                  "new-password"
                )}

                {/* Password Requirements */}
                <View style={styles.requirementsContainer}>
                  <Text style={styles.requirementsTitle}>Password Requirements:</Text>
                  <Text style={styles.requirementText}>• At least 8 characters long</Text>
                  <Text style={styles.requirementText}>• Contains uppercase and lowercase letters</Text>
                  <Text style={styles.requirementText}>• Contains at least one number</Text>
                  <Text style={styles.requirementText}>• Contains at least one special character</Text>
                </View>

                {/* Set Password Button */}
                <TouchableOpacity
                  style={[
                    styles.setPasswordButton,
                    loading ? styles.setPasswordButtonDisabled : null,
                  ]}
                  onPress={handleSetNewPassword}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.loadingText}>Updating Password...</Text>
                    </View>
                  ) : (
                    <View style={styles.buttonContent}>
                      <Ionicons name="lock-closed" size={20} color="#fff" />
                      <Text style={styles.setPasswordButtonText}>Set New Password</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Security Notice */}
                <View style={styles.securityNotice}>
                  <Ionicons name="shield-checkmark" size={16} color="#28a745" />
                  <Text style={styles.securityText}>
                    Your new password will be encrypted and secure.
                  </Text>
                </View>
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
    paddingBottom: isSmallScreen ? height * 0.12 : height * 0.15, // FIXED: Same as other screens
    paddingHorizontal: getResponsiveSize(width * 0.05, width * 0.06, width * 0.07),
    position: "relative",
    minHeight: isSmallScreen ? height * 0.45 : height * 0.48, // FIXED: Same as other screens
    justifyContent: 'center',
  },
  backButton: {
    position: "absolute",
    top: Platform.OS === 'ios' ? 50 : 50,
    left: getResponsiveSize(width * 0.05, width * 0.06, width * 0.07),
    zIndex: 10,
    padding: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: "center",
    marginTop: Platform.OS === 'ios' ? 40 : 30, // FIXED: Same as other screens
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
    marginBottom: 4,
  },
  screenTitle: {
    fontSize: getResponsiveSize(14, 16, 18),
    color: "rgba(255,255,255,0.9)",
    textAlign: 'center',
    fontWeight: "500",
  },
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: getResponsiveSize(width * 0.05, width * 0.06, width * 0.07),
    paddingTop: getResponsiveSize(height * 0.03, height * 0.035, height * 0.04),
    paddingBottom: height * 0.03,
    minHeight: isSmallScreen ? height * 0.55 : height * 0.52, // FIXED: Adjusted for moved card
    marginTop: isSmallScreen ? -height * 0.12 : -height * 0.15, // FIXED: Move white card up
  },
  titleContainer: {
    alignItems: "center",
    marginBottom: getResponsiveSize(height * 0.025, height * 0.03, height * 0.035),
  },
  title: {
    fontSize: getResponsiveSize(22, 24, 26),
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: getResponsiveSize(14, 15, 16),
    color: "#666",
    textAlign: "center",
    lineHeight: getResponsiveSize(20, 22, 24),
    paddingHorizontal: 10,
  },
  emailInfo: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: getResponsiveSize(12, 14, 16),
    marginBottom: getResponsiveSize(20, 22, 25),
    borderLeftWidth: 4,
    borderLeftColor: "#d73527",
  },
  emailValue: {
    fontSize: getResponsiveSize(13, 14, 15),
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: getResponsiveSize(20, 22, 25),
  },
  label: {
    fontSize: getResponsiveSize(11, 12, 13),
    fontWeight: "600",
    color: "#666",
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 18 : 16,
    fontSize: getResponsiveSize(14, 15, 16),
    color: "#333",
    minHeight: getResponsiveSize(50, 52, 55),
  },
  eyeButton: {
    padding: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  inputError: {
    borderColor: "#d73527",
    backgroundColor: "#fff5f5",
  },
  strengthContainer: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  strengthBar: {
    flex: 1,
    height: 4,
    backgroundColor: "#e9ecef",
    borderRadius: 2,
    marginRight: 10,
    overflow: "hidden",
  },
  strengthFill: {
    height: "100%",
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: getResponsiveSize(11, 12, 13),
    fontWeight: "600",
    minWidth: 50,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingHorizontal: 4,
  },
  errorText: {
    color: "#d73527",
    fontSize: getResponsiveSize(12, 13, 14),
    marginLeft: 6,
    fontWeight: "500",
    flex: 1,
  },
  requirementsContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: getResponsiveSize(12, 14, 16),
    marginBottom: getResponsiveSize(20, 22, 25),
    borderLeftWidth: 4,
    borderLeftColor: "#28a745",
  },
  requirementsTitle: {
    fontSize: getResponsiveSize(13, 14, 15),
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  requirementText: {
    fontSize: getResponsiveSize(11, 12, 13),
    color: "#666",
    lineHeight: getResponsiveSize(16, 18, 20),
    marginBottom: 2,
  },
  setPasswordButton: {
    backgroundColor: "#d73527",
    borderRadius: 12,
    paddingVertical: Platform.OS === 'ios' ? 18 : 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: getResponsiveSize(10, 15, 20),
    elevation: 3,
    shadowColor: "#d73527",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    minHeight: getResponsiveSize(50, 52, 55),
  },
  setPasswordButtonDisabled: {
    backgroundColor: "#ccc",
    elevation: 0,
    shadowOpacity: 0,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  setPasswordButtonText: {
    color: "#fff",
    fontSize: getResponsiveSize(14, 15, 16),
    fontWeight: "600",
    letterSpacing: 0.5,
    marginLeft: 8,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#fff",
    fontSize: getResponsiveSize(14, 15, 16),
    fontWeight: "600",
    marginLeft: 8,
  },
  securityNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: getResponsiveSize(15, 18, 20),
    paddingHorizontal: 4,
  },
  securityText: {
    fontSize: getResponsiveSize(11, 12, 13),
    color: "#666",
    lineHeight: getResponsiveSize(16, 18, 20),
    marginLeft: 8,
    flex: 1,
  },
});