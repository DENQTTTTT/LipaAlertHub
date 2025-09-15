import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function ChangePasswordSuccess() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Password Changed Successfully 🎉</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  text: { fontSize: 20, fontWeight: "bold" },
});
