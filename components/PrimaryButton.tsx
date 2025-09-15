import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps
} from "react-native";

interface PrimaryButtonProps extends TouchableOpacityProps {
  title: string;
  loading?: boolean;
}

export default function PrimaryButton({
  title,
  loading,
  style,
  disabled,
  ...props
}: PrimaryButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.button, style, disabled && styles.disabled]}
      disabled={disabled || loading}
      {...props}
    >
      <Text style={styles.text}>
        {loading ? <ActivityIndicator color="#fff" /> : title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#B22222", // Same as SOS button
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
  },
  disabled: {
    opacity: 0.7,
  },
  text: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
