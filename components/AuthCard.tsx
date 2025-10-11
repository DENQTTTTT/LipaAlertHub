// components/AuthCard.tsx
import { useRouter } from "expo-router";
import React from "react";
import { Dimensions, Image, StyleSheet, Text, View } from "react-native";

const { width } = Dimensions.get('window');

const getResponsiveSize = (size: number) => {
  const scale = width / 375;
  return Math.round(size * scale);
};

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  style?: any; // Add style prop
}

export default function AuthCard({ title, subtitle, children, style }: AuthCardProps) {
  const router = useRouter();

  return (
    <View style={[styles.container, style]}>
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
  container: { 
    flex: 1, 
    backgroundColor: "#B22222" 
  },
  header: { 
    alignItems: "center", 
    paddingTop: getResponsiveSize(50), 
    paddingBottom: getResponsiveSize(20) 
  },
  logo: { 
    width: getResponsiveSize(120), 
    height: getResponsiveSize(120), 
    resizeMode: "contain" 
  },
  appName: { 
    fontSize: getResponsiveSize(26), 
    color: "#fff", 
    fontWeight: "bold" 
  },
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: getResponsiveSize(20),
  },
  title: { 
    fontSize: getResponsiveSize(26), 
    fontWeight: "bold", 
    textAlign: "center", 
    marginTop: getResponsiveSize(10) 
  },
  subtitle: { 
    textAlign: "center", 
    fontSize: getResponsiveSize(14), 
    marginVertical: getResponsiveSize(10), 
    color: "#555" 
  },
});