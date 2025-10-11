// app/(auth)/register.tsx - Enhanced with Duplicate Detection & Violation System
import AuthCard from "@/components/AuthCard";
import PrimaryButton from "@/components/PrimaryButton";
import TextField from "@/components/TextField";
import { checkDuplicateAccount, register } from "@/services/auth";
import { auth, db, storage } from "@/services/firebase";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { fetchSignInMethodsForEmail } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [number, setNumber] = useState("");
  const [password, setPassword] = useState("");
  const [barangay, setBarangay] = useState("");
  const [idFile, setIdFile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  // Pick file (jpg, png, pdf)
  const handleFilePick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf"],
    });
    if (res.assets && res.assets.length > 0) {
      setIdFile(res.assets[0]);
    }
  };

  const handleRegister = async () => {
    if (!name || !email || !password || !number || !barangay) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }

    try {
      setLoading(true);
      const normalizedEmail = email.trim().toLowerCase();

      // ✅ Check if email already used
      const signInMethods = await fetchSignInMethodsForEmail(
        auth,
        normalizedEmail
      );
      if (signInMethods.length > 0) {
        Alert.alert("Error", "Email is already in use.");
        setLoading(false);
        return;
      }

      // ✅ Check for duplicate name + barangay
      setCheckingDuplicate(true);
      const isDuplicate = await checkDuplicateAccount(name.trim(), barangay.trim());
      setCheckingDuplicate(false);

      if (isDuplicate) {
        Alert.alert(
          "Duplicate Account Detected",
          "An account with this name already exists in your barangay. Your registration will be submitted for manual review by our admin team.",
          [{ text: "OK, Continue" }]
        );
      }

      // ✅ Upload ID file if provided
      let idFileUrl = null;
      if (idFile?.uri) {
        // Create user first to get UID for storage path
        const { userCredential } = await register(
          normalizedEmail,
          password,
          name.trim(),
          number,
          barangay.trim()
        );
        const user = userCredential.user;

        // Upload ID file
        const response = await fetch(idFile.uri);
        const blob = await response.blob();

        // Fix contentType
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
        idFileUrl = await getDownloadURL(fileRef);

        // Update user document with ID file URL
        const { doc: firestoreDoc, updateDoc } = await import("firebase/firestore");
        await updateDoc(firestoreDoc(db, "users", user.uid), {
          idFileUrl: idFileUrl,
        });
      } else {
        // Register without ID file
        await register(
          normalizedEmail,
          password,
          name.trim(),
          number,
          barangay.trim()
        );
      }

      // ✅ Show appropriate success message
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
      Alert.alert("Registration Error", err.message || "Failed to create account. Please try again.");
    } finally {
      setLoading(false);
      setCheckingDuplicate(false);
    }
  };

  return (
    <AuthCard title="Create New Account" subtitle="Sign up to get started">
      <TextField 
        placeholder="Enter full name" 
        value={name} 
        onChangeText={setName} 
      />
      <TextField
        placeholder="Enter email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextField
        placeholder="Enter number"
        value={number}
        onChangeText={setNumber}
        keyboardType="phone-pad"
      />
      <TextField
        placeholder="Enter password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TextField
        placeholder="Enter barangay"
        value={barangay}
        onChangeText={setBarangay}
      />

      {/* Upload ID */}
      <TouchableOpacity 
        style={styles.uploadBox} 
        onPress={handleFilePick}
        disabled={loading}
      >
        <Text style={{ color: "#555" }}>
          {idFile ? idFile.name : "Upload ID (jpg, png, or pdf) - Optional"}
        </Text>
      </TouchableOpacity>

      {/* Duplicate Check Indicator */}
      {checkingDuplicate && (
        <View style={styles.checkingBox}>
          <Text style={styles.checkingText}>Checking for duplicate accounts...</Text>
        </View>
      )}

      {/* Sign Up Button */}
      <PrimaryButton 
        title={loading ? "Creating Account..." : "Sign Up"} 
        onPress={handleRegister} 
        loading={loading || checkingDuplicate}
      />

      <Text style={styles.subText}>
        Already registered?{" "}
        <Text
          style={{ color: "#B22222" }}
          onPress={() => router.push("/(auth)/login")}
        >
          Log in here.
        </Text>
      </Text>

      {/* Info Text */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Note: Your account will be reviewed by our admin team before approval. 
          Duplicate accounts in the same barangay will undergo additional verification.
        </Text>
      </View>
    </AuthCard>
  );
}

const styles = StyleSheet.create({
  uploadBox: {
    backgroundColor: "#eee",
    borderRadius: 10,
    padding: 14,
    marginTop: 10,
    alignItems: "center",
  },
  checkingBox: {
    backgroundColor: "#fff3cd",
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    alignItems: "center",
  },
  checkingText: {
    color: "#856404",
    fontSize: 13,
    fontWeight: "500",
  },
  subText: {
    textAlign: "center",
    fontSize: 13,
    marginTop: 15,
    color: "#555",
  },
  infoBox: {
    backgroundColor: "#e3f2fd",
    borderRadius: 8,
    padding: 12,
    marginTop: 15,
  },
  infoText: {
    fontSize: 12,
    color: "#1976d2",
    textAlign: "center",
    lineHeight: 18,
  },
});