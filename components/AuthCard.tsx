import { useRouter } from "expo-router";
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export default function AuthCard({ title, subtitle, children }: AuthCardProps) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {/* No back button for login screen */}
        <Image
          source={require("../assets/images/logo.png")}
          style={styles.logo}
        />
        <Text style={styles.appName}>LipaAlertHub</Text>
      </View>

      {/* Card */}
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#B22222" }, // Adjusted red background
  header: { alignItems: "center", paddingTop: 50, paddingBottom: 20 },
  logo: { width: 120, height: 120, resizeMode: "contain" },
  appName: { fontSize: 26, color: "#fff", fontWeight: "bold" },
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
  },
  title: { fontSize: 26, fontWeight: "bold", textAlign: "center", marginTop: 10 },
  subtitle: { textAlign: "center", fontSize: 14, marginVertical: 10, color: "#555" },
});
