import AuthCard from "@/components/AuthCard";
import PrimaryButton from "@/components/PrimaryButton";
import TextField from "@/components/TextField";
import { register, validatePasswordStrength } from "@/services/auth";
import { auth, db, storage } from "@/services/firebase";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { fetchSignInMethodsForEmail } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useState } from "react";
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

const { width } = Dimensions.get('window');

const getResponsiveSize = (small: number, medium: number, large: number) => {
  if (width > 600) return large * 1.2;
  if (width >= 414) return large;
  if (width >= 380) return medium;
  return small;
};

const validatePhoneNumberFormat = (phone: string): boolean => {
  const cleaned = phone.replace(/[\s-]/g, '');
  
  const patterns = [
    /^\+63\d{10}$/,
    /^09\d{9}$/,
    /^639\d{9}$/,
  ];
  
  return patterns.some(pattern => pattern.test(cleaned));
};

export default function RegisterScreen() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [number, setNumber] = useState("");
  const [password, setPassword] = useState("");
  const [barangay, setBarangay] = useState("");
  const [idFile, setIdFile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordStrength, setPasswordStrength] = useState({ 
    strength: 0, 
    label: "", 
    color: "#e9ecef" 
  });

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [phoneError, setPhoneError] = useState("");

  const handleFilePick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf"],
    });
    if (res.assets && res.assets.length > 0) {
      setIdFile(res.assets[0]);
    }
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    setPasswordError("");
    
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

  const handlePhoneChange = (text: string) => {
    const cleaned = text.replace(/[^\d+]/g, '');
    
    if (cleaned.length > 0 && !cleaned.startsWith('+')) {
      if (cleaned.startsWith('63')) {
        setNumber('+' + cleaned);
      } else if (cleaned.startsWith('09') || cleaned.startsWith('9')) {
        const digits = cleaned.startsWith('09') ? cleaned.substring(1) : cleaned;
        setNumber('+63' + digits);
      } else {
        setNumber('+63' + cleaned);
      }
    } else {
      setNumber(cleaned);
    }
    
    // Validate phone number format without setting error state immediately
    if (cleaned.length > 0 && !validatePhoneNumberFormat(cleaned)) {
      setPhoneError("Please enter a valid Philippine mobile number");
    } else {
      setPhoneError("");
    }
  };

  const validateForm = (): boolean => {
    if (!name || !email || !password || !number || !barangay) {
      Alert.alert("Error", "Please fill in all required fields.");
      return false;
    }

    if (!validatePhoneNumberFormat(number)) {
      Alert.alert(
        "Invalid Phone Number", 
        "Please enter your phone number in the correct format:\n+639XXXXXXXXX\n\nExample: +639123456789"
      );
      return false;
    }

    if (!idFile || !idFile.uri) {
      Alert.alert("ID Required", "Please upload a valid ID with Lipa City address to continue.");
      return false;
    }

    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      setPasswordError(passwordValidation.errors[0]);
      Alert.alert("Weak Password", passwordValidation.errors.join("\n"));
      return false;
    }

    if (!acceptedTerms) {
      Alert.alert("Terms & Conditions", "You must accept the Terms & Conditions to continue.");
      return false;
    }

    return true;
  };

  const handleRegister = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      const normalizedEmail = email.trim().toLowerCase();

      const signInMethods = await fetchSignInMethodsForEmail(
        auth,
        normalizedEmail
      );
      if (signInMethods.length > 0) {
        Alert.alert("Error", "This email address is already registered. Please use a different email or try logging in.");
        setLoading(false);
        return;
      }

      const { userCredential, isDuplicate } = await register(
        normalizedEmail,
        password,
        name.trim(),
        number.trim(),
        barangay.trim()
      );
      
      const user = userCredential.user;

      const response = await fetch(idFile.uri);
      const blob = await response.blob();

      let contentType = blob.type;
      if (!contentType || contentType === "application/octet-stream") {
        if (idFile.name?.endsWith(".pdf")) {
          contentType = "application/pdf";
        } else if (idFile.name?.match(/\.(jpg|jpeg)$/i)) {
          contentType = "image/jpeg";
        } else if (idFile.name?.endsWith(".png")) {
          contentType = "image/png";
        } else {
          contentType = "application/octet-stream";
        }
      }

      const fileRef = ref(storage, `id_files/${user.uid}/${idFile.name}`);
      await uploadBytes(fileRef, blob, { contentType });
      const idFileUrl = await getDownloadURL(fileRef);

      const { doc: firestoreDoc, updateDoc } = await import("firebase/firestore");
      await updateDoc(firestoreDoc(db, "users", user.uid), {
        idFileUrl: idFileUrl,
        phoneNumber: number.trim(),
        termsAccepted: true,
        termsAcceptedAt: new Date(),
      });

      if (isDuplicate) {
        Alert.alert(
          "Registration Submitted",
          "Your account has been created and is under manual review due to a potential duplicate name in your barangay. You will receive a notification once reviewed.",
          [
            {
              text: "OK",
              onPress: () => router.replace("/(auth)/login"),
            },
          ]
        );
      } else {
        Alert.alert(
          "Success",
          "Account created! Your profile is under review by our admin team. You will receive a notification once approved.",
          [
            {
              text: "OK",
              onPress: () => router.replace("/(auth)/login"),
            },
          ]
        );
      }
    } catch (err: any) {
      console.error("Registration error:", err);
      
      if (err.code === "auth/email-already-in-use") {
        Alert.alert("Email Already Registered", "This email address is already in use. Please use a different email or try logging in.");
      } else if (err.code === "auth/invalid-email") {
        Alert.alert("Invalid Email", "Please enter a valid email address (e.g., name@example.com).");
      } else if (err.code === "auth/weak-password") {
        Alert.alert("Weak Password", "Please choose a stronger password with at least 6 characters.");
      } else if (err.code === "auth/network-request-failed") {
        Alert.alert("Network Error", "Please check your internet connection and try again.");
      } else if (err.code === "auth/operation-not-allowed") {
        Alert.alert("Registration Disabled", "Account registration is currently disabled. Please try again later.");
      } else {
        Alert.alert("Registration Error", err.message || "Failed to create account. Please check your information and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const renderPasswordStrengthIndicator = () => {
    if (password.length === 0) return null;

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

  const isPhoneValid = number.length > 0 && validatePhoneNumberFormat(number);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <AuthCard title="Create New Account" subtitle="Register as a Lipa City resident">
          <TextField 
            placeholder="Enter full name" 
            value={name} 
            onChangeText={setName}
            editable={!loading}
            leftIcon="person-outline"
          />
          
          <TextField
            placeholder="Enter email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
            leftIcon="mail-outline"
          />
          
          <View style={styles.inputGroup}>
            <View style={[styles.phoneContainer, phoneError ? styles.inputError : null]}>
              <TextInput
                style={styles.phoneInput}
                placeholder="Phone Number"
                placeholderTextColor="#999"
                value={number}
                onChangeText={handlePhoneChange}
                keyboardType="phone-pad"
                maxLength={13}
                editable={!loading}
              />
              {isPhoneValid && (
                <Ionicons name="checkmark-circle" size={20} color="#28a745" style={styles.phoneCheckIcon} />
              )}
            </View>
            
            {phoneError ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={14} color="#d73527" />
                <Text style={styles.errorText}>{phoneError}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.phoneNoticeBox}>
            <Ionicons name="warning" size={18} color="#d73527" />
            <View style={styles.phoneNoticeContent}>
              <Text style={styles.phoneNoticeTitle}>Important: Emergency Contact</Text>
              <Text style={styles.phoneNoticeText}>
                Please provide your correct Philippine mobile number. This will be used for emergency SOS alerts.
              </Text>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={[styles.passwordContainer, passwordError ? styles.inputError : null]}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Create password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={handlePasswordChange}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                <Ionicons
                  name={showPassword ? "eye" : "eye-off"}
                  size={getResponsiveSize(20, 22, 24)}
                  color="#666"
                />
              </TouchableOpacity>
            </View>
            
            {renderPasswordStrengthIndicator()}
            
            {passwordError ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={14} color="#d73527" />
                <Text style={styles.errorText}>{passwordError}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.requirementsContainer}>
            <Text style={styles.requirementsTitle}>Password must contain:</Text>
            <Text style={styles.requirementText}>• At least 8 characters</Text>
            <Text style={styles.requirementText}>• Uppercase and lowercase letters</Text>
            <Text style={styles.requirementText}>• At least one number</Text>
            <Text style={styles.requirementText}>• At least one special character</Text>
          </View>
          
          <TextField
            placeholder="Select your barangay"
            value={barangay}
            onChangeText={setBarangay}
            editable={!loading}
            leftIcon="location-outline"
          />

          <TouchableOpacity 
            style={[
              styles.uploadBox,
              idFile ? styles.uploadBoxFilled : styles.uploadBoxEmpty
            ]} 
            onPress={handleFilePick}
            disabled={loading}
          >
            <Ionicons 
              name={idFile ? "document-text" : "cloud-upload"} 
              size={getResponsiveSize(20, 22, 24)} 
              color={idFile ? "#28a745" : "#666"} 
              style={styles.uploadIcon}
            />
            <View style={styles.uploadTextContainer}>
              <Text style={[styles.uploadText, idFile && styles.uploadTextSuccess]}>
                {idFile ? idFile.name : "Upload Valid ID (Required)"}
              </Text>
              {!idFile && (
                <Text style={styles.uploadSubtext}>* This field is required</Text>
              )}
            </View>
            {idFile && (
              <Ionicons name="checkmark-circle" size={24} color="#28a745" />
            )}
          </TouchableOpacity>

          <View style={styles.idNoticeBox}>
            <Ionicons name="information-circle" size={16} color="#1976d2" />
            <Text style={styles.idNoticeText}>
              Valid ID with Lipa City address only (jpg, png, or pdf). This document will be reviewed by admin for verification.
            </Text>
          </View>

          <TouchableOpacity 
            style={styles.termsContainer}
            onPress={() => setAcceptedTerms(!acceptedTerms)}
            disabled={loading}
          >
            <View style={[styles.termsCheckbox, acceptedTerms && styles.termsCheckboxChecked]}>
              {acceptedTerms && <Ionicons name="checkmark" size={16} color="#fff" />}
            </View>
            <View style={styles.termsTextContainer}>
              <Text style={styles.termsText}>
                I agree to the{" "}
                <Text 
                  style={styles.termsLink}
                  onPress={() => !loading && router.push("/(auth)/terms")}
                >
                  Terms & Conditions
                </Text>{" "}
                and{" "}
                <Text 
                  style={styles.termsLink}
                  onPress={() => !loading && router.push("/(auth)/privacy")}
                >
                  Privacy Policy
                </Text>
              </Text>
            </View>
          </TouchableOpacity>

          <PrimaryButton 
            title={loading ? "Creating Account..." : "Create Account"} 
            onPress={handleRegister} 
            loading={loading}
            disabled={!acceptedTerms}
          />

          <Text style={styles.subText}>
            Already registered?{" "}
            <Text
              style={styles.linkText}
              onPress={() => !loading && router.push("/(auth)/login")}
            >
              Log in here.
            </Text>
          </Text>

          <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark" size={16} color="#1976d2" />
            <Text style={styles.infoText}>
              Your account will be reviewed by our admin team before approval. 
              Duplicate accounts in the same barangay will undergo additional verification.
            </Text>
          </View>
        </AuthCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#d73527",
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: getResponsiveSize(20, 25, 30),
  },
  inputGroup: {
    marginBottom: getResponsiveSize(12, 14, 16),
  },
  phoneContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: 8,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: getResponsiveSize(14, 16, 18),
    paddingVertical: Platform.OS === 'ios' ? getResponsiveSize(16, 18, 20) : getResponsiveSize(14, 16, 18),
    fontSize: getResponsiveSize(14, 15, 16),
    color: "#333",
    minHeight: getResponsiveSize(48, 50, 52),
  },
  phoneCheckIcon: {
    marginRight: getResponsiveSize(12, 14, 16),
  },
  phoneNoticeBox: {
    backgroundColor: "#fff3cd",
    borderLeftWidth: 4,
    borderLeftColor: "#d73527",
    borderRadius: 8,
    padding: getResponsiveSize(10, 12, 14),
    marginBottom: getResponsiveSize(14, 16, 18),
    flexDirection: "row",
    alignItems: "flex-start",
  },
  phoneNoticeContent: {
    flex: 1,
    marginLeft: 10,
  },
  phoneNoticeTitle: {
    fontSize: getResponsiveSize(12, 13, 14),
    fontWeight: "700",
    color: "#d73527",
    marginBottom: 4,
  },
  phoneNoticeText: {
    fontSize: getResponsiveSize(11, 12, 13),
    color: "#856404",
    lineHeight: getResponsiveSize(16, 17, 18),
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: 8,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: getResponsiveSize(14, 16, 18),
    paddingVertical: Platform.OS === 'ios' ? getResponsiveSize(16, 18, 20) : getResponsiveSize(14, 16, 18),
    fontSize: getResponsiveSize(14, 15, 16),
    color: "#333",
    minHeight: getResponsiveSize(48, 50, 52),
  },
  eyeButton: {
    padding: getResponsiveSize(14, 16, 18),
    justifyContent: "center",
    alignItems: "center",
  },
  inputError: {
    borderColor: "#d73527",
    backgroundColor: "#fff5f5",
  },
  strengthContainer: {
    marginTop: 4,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 2,
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
    fontSize: getResponsiveSize(10, 11, 12),
    fontWeight: "600",
    minWidth: 45,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    paddingHorizontal: 4,
  },
  errorText: {
    color: "#d73527",
    fontSize: getResponsiveSize(11, 12, 13),
    marginLeft: 6,
    flex: 1,
  },
  requirementsContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 10,
    padding: getResponsiveSize(10, 12, 14),
    marginBottom: getResponsiveSize(12, 14, 16),
    borderLeftWidth: 3,
    borderLeftColor: "#28a745",
  },
  requirementsTitle: {
    fontSize: getResponsiveSize(11, 12, 13),
    fontWeight: "600",
    color: "#333",
    marginBottom: 6,
  },
  requirementText: {
    fontSize: getResponsiveSize(10, 11, 12),
    color: "#666",
    lineHeight: getResponsiveSize(16, 17, 18),
    marginBottom: 2,
  },
  uploadBox: {
    borderRadius: 12,
    padding: getResponsiveSize(14, 16, 18),
    marginTop: getResponsiveSize(8, 10, 12),
    marginBottom: 8,
    alignItems: "center",
    flexDirection: "row",
    borderWidth: 2,
    borderStyle: "dashed",
  },
  uploadBoxEmpty: {
    backgroundColor: "#fff3cd",
    borderColor: "#ffc107",
  },
  uploadBoxFilled: {
    backgroundColor: "#d4edda",
    borderColor: "#28a745",
    borderStyle: "solid",
  },
  uploadIcon: {
    marginRight: 10,
  },
  uploadTextContainer: {
    flex: 1,
  },
  uploadText: {
    color: "#666",
    fontSize: getResponsiveSize(13, 14, 15),
    fontWeight: "500",
  },
  uploadTextSuccess: {
    color: "#155724",
    fontWeight: "600",
  },
  uploadSubtext: {
    color: "#856404",
    fontSize: getResponsiveSize(11, 12, 13),
    marginTop: 2,
    fontWeight: "500",
  },
  idNoticeBox: {
    backgroundColor: "#e3f2fd",
    borderRadius: 8,
    padding: getResponsiveSize(8, 10, 12),
    marginBottom: getResponsiveSize(12, 14, 16),
    flexDirection: "row",
    alignItems: "flex-start",
  },
  idNoticeText: {
    fontSize: getResponsiveSize(11, 12, 13),
    color: "#1976d2",
    marginLeft: 8,
    flex: 1,
    lineHeight: getResponsiveSize(16, 17, 18),
  },
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: getResponsiveSize(16, 18, 20),
    padding: getResponsiveSize(12, 14, 16),
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  termsCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#B22222",
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginTop: 2,
  },
  termsCheckboxChecked: {
    backgroundColor: "#B22222",
    borderColor: "#B22222",
  },
  termsTextContainer: {
    flex: 1,
  },
  termsText: {
    fontSize: getResponsiveSize(12, 13, 14),
    color: "#333",
    lineHeight: getResponsiveSize(18, 20, 22),
  },
  termsLink: {
    color: "#B22222",
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  subText: {
    textAlign: "center",
    fontSize: getResponsiveSize(12, 13, 14),
    marginTop: getResponsiveSize(12, 14, 16),
    color: "#555",
  },
  linkText: {
    color: "#B22222",
    fontWeight: "600",
  },
  infoBox: {
    backgroundColor: "#e3f2fd",
    borderRadius: 10,
    padding: getResponsiveSize(10, 12, 14),
    marginTop: getResponsiveSize(12, 14, 16),
    flexDirection: "row",
    alignItems: "flex-start",
  },
  infoText: {
    fontSize: getResponsiveSize(11, 12, 13),
    color: "#1976d2",
    marginLeft: 8,
    flex: 1,
    lineHeight: getResponsiveSize(16, 18, 20),
  },
});