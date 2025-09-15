import React from "react";
import { StyleSheet, TextInput, TextInputProps, View } from "react-native";

export default function TextField(props: TextInputProps) {
  return (
    <View style={styles.container}>
      <TextInput
        {...props}
        style={[styles.input, props.style]}
        placeholderTextColor="#aaa"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#f8f8f8",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#333",
  },
});
