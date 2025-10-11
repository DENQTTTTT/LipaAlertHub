// app/(auth)/login.tsx - Enhanced with Suspension/Ban Checking
import AuthCard from "@/components/AuthCard";
import PrimaryButton from "@/components/PrimaryButton";
import TextField from "@/components/TextField";
import { checkAccountAccess, login } from "@/services/auth";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError("");
      
      if (!email.trim() || !password.trim()) {
        setError("Please enter both email and password.");
        setLoading(false);
        return;
      }
      
      // Attempt login
      const { userCredential, userStatus } = await login(email.trim(), password);
      const uid = userCredential.user.uid;
      
      // Check account access (suspension/ban status)
      const accessCheck = await checkAccountAccess(uid);
      
      if (!accessCheck.canAccess) {
        // User is suspended or banned - redirect to suspension screen
        if (accessCheck.suspensionUntil) {
          // Temporary suspension
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
          // Permanent ban
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
          // Account pending approval
          router.replace("/(auth)/account-status");
        } else {
          setError(accessCheck.reason || "Account access restricted");
        }
        return;
      }
      
      // Check approval status
      if (userStatus.status === "active") {
        // User is approved and not suspended - redirect to main app
        router.replace("/(main)");
      } else if (userStatus.status === "pending" || userStatus.status === "under_review") {
        // User is pending or under review
        router.replace("/(auth)/account-status");
      } else if (userStatus.status === "declined") {
        // User is declined
        router.replace("/(auth)/account-status");
      } else {
        setError("Your account status is unknown. Please contact support.");
      }
      
    } catch (err: any) {
      console.error("Login error:", err);
      
      // Handle specific error messages
      if (err.message === "ACCOUNT_BANNED") {
        // Already handled by redirect in auth.ts, but just in case
        setError("Your account has been permanently banned.");
        return;
      } else if (err.message === "ACCOUNT_SUSPENDED") {
        // Already handled by redirect in auth.ts, but just in case
        setError("Your account is temporarily suspended.");
        return;
      } else if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        setError("Invalid email or password. Please try again.");
      } else if (err.code === "auth/user-not-found") {
        setError("No account found with this email.");
      } else if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else if (err.code === "auth/user-disabled") {
        setError("This account has been disabled. Please contact support.");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many login attempts. Please try again later.");
      } else if (err.code === "auth/network-request-failed") {
        setError("Network error. Please check your connection and try again.");
      } else {
        setError(err.message || "Login failed. Please check your credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="Login" subtitle="Sign in to continue">
      {/* Error message */}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* Form */}
      <TextField
        placeholder="Enter email"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          if (error) setError("");
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!loading}
      />
      <TextField
        placeholder="Enter password"
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          if (error) setError("");
        }}
        secureTextEntry
        editable={!loading}
      />

      {/* Login Button */}
      <PrimaryButton 
        title="Login" 
        onPress={handleLogin} 
        loading={loading} 
        style={styles.loginButton} 
      />

      {/* Forgot Password Link */}
      <Text 
        style={styles.forgotLink} 
        onPress={() => !loading && router.push("/(auth)/reset-password")}
      >
        Forgot Password?
      </Text>

      {/* Register Link */}
      <TouchableOpacity
        style={[styles.sosButton, styles.createAccountButton]}
        onPress={() => !loading && router.push("/(auth)/register")}
        disabled={loading}
      >
        <Text style={styles.sosText}>Register</Text>
      </TouchableOpacity>

      {/* SOS Button */}
      <TouchableOpacity
        style={[styles.sosButton, { marginTop: 10 }]}
        onPress={() => !loading && router.push("/(auth)/emergency/sos")}
        disabled={loading}
      >
        <Text style={styles.sosText}>SOS BUTTON</Text>
      </TouchableOpacity>
    </AuthCard>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: "#e74c3c",
    marginBottom: 10,
    textAlign: "center",
    fontSize: 14,
    paddingHorizontal: 10,
    backgroundColor: "#fee",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e74c3c",
  },
  forgotLink: {
    color: "#808080",
    fontSize: 12,
    textAlign: "center",
    marginTop: 10,
  },
  link: {
    marginTop: 12,
    color: "#B22222",
    fontWeight: "600",
    textAlign: "center",
    fontSize: 15,
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
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
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
});