import AuthCard from "@/components/AuthCard";
import PrimaryButton from "@/components/PrimaryButton";
import TextField from "@/components/TextField";
import { useAuth } from "@/hooks/useAuth";
import { useSOSSync } from "@/hooks/useSOSSync";
import { checkAccountAccess, login } from "@/services/auth";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const REMEMBER_ME_KEY = '@lipaalerthub:rememberMe';
const SAVED_EMAIL_KEY = '@lipaalerthub:savedEmail';

export default function LoginScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { attachUserToGuestLogs } = useSOSSync();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadSavedCredentials();
  }, []);

  const loadSavedCredentials = async () => {
    try {
      const savedRememberMe = await AsyncStorage.getItem(REMEMBER_ME_KEY);
      const savedEmail = await AsyncStorage.getItem(SAVED_EMAIL_KEY);
      
      if (savedRememberMe === 'true' && savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    } catch (error) {
      console.error('Error loading saved credentials:', error);
    }
  };

  const saveCredentials = async (shouldSave: boolean, emailToSave: string) => {
    try {
      if (shouldSave) {
        await AsyncStorage.setItem(REMEMBER_ME_KEY, 'true');
        await AsyncStorage.setItem(SAVED_EMAIL_KEY, emailToSave);
      } else {
        await AsyncStorage.removeItem(REMEMBER_ME_KEY);
        await AsyncStorage.removeItem(SAVED_EMAIL_KEY);
      }
    } catch (error) {
      console.error('Error saving credentials:', error);
    }
  };

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError("");
      
      if (!email.trim() || !password.trim()) {
        setError("Please enter both email and password.");
        setLoading(false);
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setError("Please enter a valid email address.");
        setLoading(false);
        return;
      }

      if (password.length < 6) {
        setError("Password must be at least 6 characters long.");
        setLoading(false);
        return;
      }
      
      await saveCredentials(rememberMe, email.trim());
      
      const { userCredential, userStatus } = await login(email.trim(), password);
      const uid = userCredential.user.uid;
      
      // ✅ ATTACH GUEST SOS LOGS TO USER ACCOUNT
      try {
        const attachedCount = await attachUserToGuestLogs(uid);
        if (attachedCount > 0) {
          console.log(`✅ Attached ${attachedCount} guest SOS logs to user account`);
        }
      } catch (syncError) {
        console.error('Error attaching guest logs:', syncError);
        // Continue with login even if guest log attachment fails
      }
      
      if (userStatus.role !== 'resident') {
        Alert.alert(
          "Access Restricted",
          "This mobile app is for residents only. Staff accounts should use the web admin portal.",
          [{ 
            text: "OK", 
            onPress: async () => {
              try {
                const { signOut } = await import("firebase/auth");
                const { auth } = await import("@/services/firebase");
                await signOut(auth);
              } catch (error) {
                console.error("Logout error:", error);
              }
            }
          }]
        );
        setLoading(false);
        return;
      }

      const accessCheck = await checkAccountAccess(uid);
      
      if (!accessCheck.canAccess) {
        if (accessCheck.suspensionUntil) {
          router.replace({
            pathname: "/(auth)/suspended",
            params: {
              isPermanent: "false",
              suspensionUntil: accessCheck.suspensionUntil.toISOString(),
              reason: accessCheck.reason || "Violation of terms",
              strikes: accessCheck.strikes?.toString() || "0",
              warnings: accessCheck.warnings?.toString() || "0"
            }
          });
        } else if (userStatus.status === "banned") {
          router.replace({
            pathname: "/(auth)/suspended",
            params: {
              isPermanent: "true",
              reason: accessCheck.reason || "Multiple violations",
              strikes: accessCheck.strikes?.toString() || "3",
              warnings: accessCheck.warnings?.toString() || "0"
            }
          });
        } else if (userStatus.status === "pending" || userStatus.status === "under_review") {
          router.replace("/(auth)/account-status");
        } else {
          setError(accessCheck.reason || "Account access restricted");
        }
        setLoading(false);
        return;
      }
      
      if (userStatus.status === "active") {
        router.replace("/(main)");
      } else if (userStatus.status === "pending" || userStatus.status === "under_review") {
        router.replace("/(auth)/account-status");
      } else if (userStatus.status === "declined") {
        router.replace("/(auth)/account-status");
      } else {
        setError("Your account status is unknown. Please contact support.");
      }
      
    } catch (err: any) {
      console.error("Login error:", err);
      
      if (err.message === "ACCOUNT_BANNED") {
        setError("Your account has been permanently banned. Please contact support for assistance.");
      } else if (err.message === "ACCOUNT_SUSPENDED") {
        setError("Your account is temporarily suspended. Please check your email for details.");
      } else if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        setError("The email or password you entered is incorrect. Please try again.");
      } else if (err.code === "auth/user-not-found") {
        setError("No account found with this email address. Please check your email or register.");
      } else if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address (e.g., name@example.com).");
      } else if (err.code === "auth/user-disabled") {
        setError("This account has been disabled. Please contact our support team.");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many login attempts. Please wait a few minutes and try again.");
      } else if (err.code === "auth/network-request-failed") {
        setError("Network connection error. Please check your internet connection and try again.");
      } else if (err.message && err.message.includes("non-resident")) {
        setError(err.message);
      } else {
        setError("Login failed. Please check your credentials and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="Login" subtitle="Sign in to your resident account">
      {error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={20} color="#dc3545" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <TextField
        placeholder="Enter your email"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          if (error) setError("");
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!loading}
        leftIcon="mail-outline"
      />
      
      <TextField
        placeholder="Enter your password"
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          if (error) setError("");
        }}
        secureTextEntry
        editable={!loading}
        leftIcon="lock-closed-outline"
      />

      <TouchableOpacity 
        style={styles.rememberMeContainer}
        onPress={() => setRememberMe(!rememberMe)}
        disabled={loading}
      >
        <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
          {rememberMe && <Ionicons name="checkmark" size={16} color="#fff" />}
        </View>
        <Text style={styles.rememberMeText}>Remember my email</Text>
      </TouchableOpacity>

      <PrimaryButton 
        title={loading ? "Signing In..." : "Sign In"} 
        onPress={handleLogin} 
        loading={loading} 
        style={styles.loginButton} 
      />

      <Text 
        style={styles.forgotLink} 
        onPress={() => !loading && router.push("/(auth)/reset-password")}
      >
        Forgot Password?
      </Text>

      <TouchableOpacity
        style={[styles.sosButton, styles.createAccountButton]}
        onPress={() => !loading && router.push("/(auth)/register")}
        disabled={loading}
      >
        <Text style={styles.sosText}>Create New Account</Text>
      </TouchableOpacity>

       <TouchableOpacity
       style={[styles.sosButton, { marginTop: 10 }]}
      onPress={() => router.push("/(auth)/emergency/sos")}
     >
       <Text style={styles.sosText}>SOS BUTTON</Text>
     </TouchableOpacity>


      <View style={styles.termsNotice}>
        <Text style={styles.termsText}>
          By signing in, you agree to our{" "}
          <Text 
            style={styles.termsLink}
            onPress={() => !loading && router.push("/(auth)/terms")}
          >
            Terms & Conditions
          </Text>
        </Text>
      </View>
    </AuthCard>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "#fee",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e74c3c",
    marginBottom: 10,
  },
  errorText: {
    color: "#e74c3c",
    marginLeft: 8,
    flex: 1,
    fontSize: 14,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#B22222",
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: "#B22222",
    borderColor: "#B22222",
  },
  rememberMeText: {
    fontSize: 14,
    color: "#333",
  },
  forgotLink: {
    color: "#808080",
    fontSize: 12,
    textAlign: "center",
    marginTop: 10,
  },
  sosButton: {
    backgroundColor: "#B22222",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
  },
  createAccountButton: {
    backgroundColor: "#B22222",
  },
  sosText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  loginButton: {
    backgroundColor: "#B22222",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
  },
  termsNotice: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  termsText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  termsLink: {
    color: '#B22222',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});