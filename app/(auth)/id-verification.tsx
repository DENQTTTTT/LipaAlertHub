// app/(auth)/id-verification.tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function IdVerificationScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ID Verification</Text>
      <Text style={styles.subtitle}>This screen is under construction.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700" },
  subtitle: { fontSize: 16, color: "gray", marginTop: 8 },
});
