// app/(main)/profile/change-password/index.tsx - Complete Change Password Feature
import { useAuth } from "@/hooks/useAuth";
import { reauthenticateUser, updatePasswordSecure, validatePasswordStrength } from "@/services/auth";
import { Ionicons } from "@expo/vector-icons";
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

export default function ChangePasswordScreen() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  
  // Input error states
  const [currentPasswordError, setCurrentPasswordError] = useState("");
  const [newPasswordError, setNewPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  
  // Password visibility states
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Password strength indicator
  const [passwordStrength, setPasswordStrength] = useState({ strength: 0, label: "", color: "#e9ecef" });

  const { user } = useAuth();
  const router = useRouter();

  const clearErrors = () => {
    setCurrentPasswordError("");
    setNewPasswordError("");
    setConfirmPasswordError("");
  };

  const handleCurrentPasswordChange = (text: string) => {
    setCurrentPassword(text);
    setCurrentPasswordError("");
    setFailedAttempts(0); // Reset failed attempts when user starts typing
  };

  const handleNewPasswordChange = (text: string) => {
    setNewPassword(text);
    setNewPasswordError("");
    
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
    clearErrors();
    let isValid = true;

    // Validate current password
    if (!currentPassword.trim()) {
      setCurrentPasswordError("Current password is required");
      isValid = false;
    }

    // Validate new password
    if (!newPassword.trim()) {
      setNewPasswordError("New password is required");
      isValid = false;
    } else {
      const passwordValidation = validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        setNewPasswordError(passwordValidation.errors[0]);
        isValid = false;
      }
    }

    // Validate confirm password
    if (!confirmPassword.trim()) {
      setConfirmPasswordError("Please confirm your new password");
      isValid = false;
    } else if (newPassword !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match");
      isValid = false;
    }

    // Check if new password is different from current
    if (currentPassword === newPassword && currentPassword.trim()) {
      setNewPasswordError("New password must be different from current password");
      isValid = false;
    }

    return isValid;
  };

  const handleUpdatePassword = async () => {
    if (!validatePasswords()) {
      return;
    }

    if (!user?.email) {
      Alert.alert("Error", "User email not found. Please log in again.");
      return;
    }

    Keyboard.dismiss();
    setLoading(true);

    try {
      // Step 1: Reauthenticate with current password
      await reauthenticateUser(currentPassword);

      // Reset failed attempts on successful reauth
      setFailedAttempts(0);

      // Step 2: Update password
      await updatePasswordSecure(newPassword);

      // Success feedback
      Alert.alert(
        "Success",
        "Your password has been changed successfully.",
        [
          {
            text: "OK",
            onPress: () => {
              // Clear form
              setCurrentPassword("");
              setNewPassword("");
              setConfirmPassword("");
              setPasswordStrength({ strength: 0, label: "", color: "#e9ecef" });
              // Navigate back to profile
              router.back();
            }
          }
        ]
      );

    } catch (error: any) {
      // Handle reauthentication failure - focus on wrong password errors
      if (error.code === "auth/wrong-password" || 
          error.code === "auth/invalid-credential" ||
          error.message?.includes("wrong-password") || 
          error.message?.includes("incorrect")) {
        
        const newFailedAttempts = failedAttempts + 1;
        setFailedAttempts(newFailedAttempts);
        setCurrentPasswordError("Incorrect current password");

        if (newFailedAttempts < 3) {
          const remainingAttempts = 3 - newFailedAttempts;
          Alert.alert(
            "Incorrect Password", 
            `Incorrect current password. You have ${remainingAttempts} ${remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining.`,
            [{ text: "OK" }]
          );
        } else {
          // After exactly 3 failed attempts, offer password reset
          Alert.alert(
            "Too Many Failed Attempts",
            "You've entered the wrong password 3 times. Would you like to reset your password instead?",
            [
              { 
                text: "Cancel", 
                style: "cancel",
                onPress: () => {
                  // Clear form and reset attempts
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setFailedAttempts(0);
                  clearErrors();
                  setPasswordStrength({ strength: 0, label: "", color: "#e9ecef" });
                }
              },
              { 
                text: "Reset Password", 
                onPress: () => {
                  // Navigate to reset password screen
                  router.push("/(auth)/reset-password/index");
                }
              }
            ]
          );
        }
      } else if (error.code === "auth/requires-recent-login") {
        Alert.alert(
          "Authentication Required",
          "For security reasons, please log out and log back in before changing your password.",
          [{ text: "OK" }]
        );
      } else {
        // Other errors - generic message without exposing internal details
        Alert.alert(
          "Error", 
          "Failed to update password. Please try again.",
          [{ text: "OK" }]
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = () => {
    router.back();
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
                <Text style={styles.screenTitle}>Change Password</Text>
              </View>
            </View>

            {/* Main Content Card */}
            <View style={styles.card}>
              <View style={styles.titleContainer}>
                <Text style={styles.title}>Update Your Password</Text>
                <Text style={styles.subtitle}>
                  Enter your current password and choose a new secure password
                </Text>
              </View>

              <View style={styles.form}>
                {/* Current Password */}
                {renderPasswordInput(
                  currentPassword,
                  handleCurrentPasswordChange,
                  "Enter current password",
                  "CURRENT PASSWORD",
                  currentPasswordError,
                  showCurrentPassword,
                  () => setShowCurrentPassword(!showCurrentPassword),
                  "current-password"
                )}

                {/* New Password */}
                {renderPasswordInput(
                  newPassword,
                  handleNewPasswordChange,
                  "Enter new password",
                  "NEW PASSWORD",
                  newPasswordError,
                  showNewPassword,
                  () => setShowNewPassword(!showNewPassword),
                  "new-password"
                )}

                {/* Confirm Password */}
                {renderPasswordInput(
                  confirmPassword,
                  setConfirmPassword,
                  "Confirm new password",
                  "CONFIRM NEW PASSWORD",
                  confirmPasswordError,
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
                  <Text style={styles.requirementText}>• Different from your current password</Text>
                </View>

                {/* Update Button */}
                <TouchableOpacity
                  style={[
                    styles.updateButton,
                    loading ? styles.updateButtonDisabled : null,
                  ]}
                  onPress={handleUpdatePassword}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.loadingText}>Updating...</Text>
                    </View>
                  ) : (
                    <View style={styles.buttonContent}>
                      <Ionicons name="lock-closed" size={20} color="#fff" />
                      <Text style={styles.updateButtonText}>Update Password</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Security Notice */}
                <View style={styles.securityNotice}>
                  <Ionicons name="shield-checkmark" size={16} color="#28a745" />
                  <Text style={styles.securityText}>
                    Your password is encrypted and secure. You'll remain logged in after changing it.
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
    paddingBottom: getResponsiveSize(height * 0.04, height * 0.05, height * 0.06),
    paddingHorizontal: getResponsiveSize(width * 0.05, width * 0.06, width * 0.07),
    position: "relative",
    minHeight: getResponsiveSize(height * 0.25, height * 0.28, height * 0.30),
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
    marginTop: Platform.OS === 'ios' ? 30 : 20,
  },
  logoCircle: {
    width: getResponsiveSize(60, 70, 80),
    height: getResponsiveSize(60, 70, 80),
    borderRadius: getResponsiveSize(30, 35, 40),
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: getResponsiveSize(10, 12, 15),
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
    width: "60%",
    height: "60%",
  },
  appName: {
    fontSize: getResponsiveSize(18, 20, 22),
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
    minHeight: getResponsiveSize(height * 0.75, height * 0.72, height * 0.70),
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
  updateButton: {
    backgroundColor: "#d73527",
    borderRadius: 12,
    paddingVertical: Platform.OS === 'ios' ? 18 : 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: getResponsiveSize(8, 13, 18),
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
  updateButtonDisabled: {
    backgroundColor: "#ccc",
    elevation: 0,
    shadowOpacity: 0,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  updateButtonText: {
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