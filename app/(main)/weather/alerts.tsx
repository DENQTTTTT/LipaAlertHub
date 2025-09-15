import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function WeatherSummary() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Weather Summary</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  text: { fontSize: 20, fontWeight: "bold" },
});
