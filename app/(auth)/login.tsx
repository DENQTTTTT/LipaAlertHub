// app/(auth)/login.tsx
import AuthCard from "@/components/AuthCard"; // Import the shared AuthCard component
import PrimaryButton from "@/components/PrimaryButton";
import TextField from "@/components/TextField";
import { login } from "@/services/auth";
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
     await login(email, password);
     router.replace("/(main)"); // Fixed: Go to main tab layout, which will show index.tsx
   } catch (err: any) {
     setError(err.message || "Login failed");
   } finally {
     setLoading(false);
   }
 };

 return (
   <AuthCard title="Login" subtitle="Sign in to continue">
     {/* Error message */}
     {error && <Text style={styles.errorText}>{error}</Text>}

     {/* Form */}
     <TextField
       placeholder="Enter email"
       value={email}
       onChangeText={setEmail}
       keyboardType="email-address"
       autoCapitalize="none"
     />
     <TextField
       placeholder="Enter password"
       value={password}
       onChangeText={setPassword}
       secureTextEntry
     />

     {/* Login Button */}
     <PrimaryButton title="Login" onPress={handleLogin} loading={loading} style={styles.loginButton} />

     {/* Forgot Password Link */}
     <Text style={styles.forgotLink} onPress={() => router.push("/(auth)/reset-password")}>
       Forgot Password?
     </Text>

     {/* Register Link */}
     <TouchableOpacity
       style={[styles.sosButton, styles.createAccountButton]}
       onPress={() => router.push("/(auth)/register")}
     >
       <Text style={styles.sosText}>Register</Text>
     </TouchableOpacity>

     {/* SOS Button */}
     <TouchableOpacity
       style={[styles.sosButton, { marginTop: 10 }]}
      onPress={() => router.push("/(auth)/emergency/sos")}
     >
       <Text style={styles.sosText}>SOS BUTTON</Text>
     </TouchableOpacity>
   </AuthCard>
 );
}

const styles = StyleSheet.create({
 errorText: {
   color: "red",
   marginBottom: 10,
 },
 forgotLink: {
   color: "#808080", // Gray color for forgot password
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
   backgroundColor: "#B22222", // Same as SOS button
   borderRadius: 14,
   paddingVertical: 14,
   alignItems: "center",
   marginTop: 10,
 },
 createAccountButton: {
   backgroundColor: "#B22222", // Same as SOS button
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
   backgroundColor: "#B22222", // Same as SOS button
   borderRadius: 14,
   paddingVertical: 14,
   alignItems: "center",
   marginTop: 10,
 },
}); 