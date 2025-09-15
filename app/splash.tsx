import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <Image 
        source={require("../assets/images/logo.png")} 
        style={styles.logo} 
      />
      <Text style={styles.appName}>LipaAlertHub</Text>
      <Text style={styles.subtitle}>Emergency Response System</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center",
    backgroundColor: "#D32F2F"
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: "contain",
    marginBottom: 20,
  },
  appName: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: "#fff",
    opacity: 0.9,
  },
});