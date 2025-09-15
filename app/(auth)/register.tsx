import AuthCard from "@/components/AuthCard";
import PrimaryButton from "@/components/PrimaryButton";
import TextField from "@/components/TextField";
import { auth, db, storage } from "@/services/firebase";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity } from "react-native";

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [number, setNumber] = useState("");
  const [password, setPassword] = useState("");
  const [barangay, setBarangay] = useState("");
  const [idFile, setIdFile] = useState<any>(null);
  const [loading, setLoading] = useState(false);

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

      // ✅ check if email already used
      const signInMethods = await fetchSignInMethodsForEmail(
        auth,
        normalizedEmail
      );
      if (signInMethods.length > 0) {
        Alert.alert("Error", "Email is already in use.");
        return;
      }

      // ✅ create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );
      const user = userCredential.user;

      // ✅ upload ID file if provided
      let idFileUrl = null;
      if (idFile?.uri) {
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
            contentType = "application/octet-stream"; // fallback
          }
        }

        const fileRef = ref(storage, `id_files/${user.uid}/${idFile.name}`);
        await uploadBytes(fileRef, blob, { contentType }); // ✅ enforce correct type
        idFileUrl = await getDownloadURL(fileRef);
      }

      // ✅ create Firestore user profile
      await setDoc(doc(db, "users", user.uid), {
        name,
        email: normalizedEmail,
        number,
        barangay,
        idFileUrl,
        createdAt: serverTimestamp(),
      });

      Alert.alert("Success", "Account created!");
      router.replace("/(auth)/login");
    } catch (err: any) {
      console.error("❌ Registration error:", err);
      Alert.alert("Registration Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="Create New Account" subtitle="Sign up to get started">
      <TextField placeholder="Enter full name" value={name} onChangeText={setName} />
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
      <TouchableOpacity style={styles.uploadBox} onPress={handleFilePick}>
        <Text style={{ color: "#555" }}>
          {idFile ? idFile.name : "Upload ID (jpg, png, or pdf)"}
        </Text>
      </TouchableOpacity>

      {/* Sign Up Button */}
      <PrimaryButton title="Sign Up" onPress={handleRegister} loading={loading} />

      <Text style={styles.subText}>
        Already registered?{" "}
        <Text
          style={{ color: "#B22222" }}
          onPress={() => router.push("/(auth)/login")}
        >
          Log in here.
        </Text>
      </Text>
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
  subText: {
    textAlign: "center",
    fontSize: 13,
    marginTop: 15,
    color: "#555",
  },
});
