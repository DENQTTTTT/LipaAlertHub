// components/TextField.tsx
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Dimensions,
  StyleSheet,
  TextInput,
  TextInputProps,
  View
} from "react-native";

const { width } = Dimensions.get('window');

const getResponsiveSize = (size: number) => {
  const scale = width / 375;
  return Math.round(size * scale);
};

interface TextFieldProps extends TextInputProps {
  leftIcon?: string;
  error?: boolean;
}

export default function TextField({ leftIcon, error, style, ...props }: TextFieldProps) {
  return (
    <View style={[styles.container, error && styles.error]}>
      {leftIcon && (
        <Ionicons 
          name={leftIcon as any} 
          size={getResponsiveSize(20)} 
          color="#666" 
          style={styles.icon} 
        />
      )}
      <TextInput
        {...props}
        style={[styles.input, style]}
        placeholderTextColor="#aaa"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "#f8f8f8",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: getResponsiveSize(12),
  },
  input: {
    flex: 1,
    paddingVertical: getResponsiveSize(12),
    paddingHorizontal: getResponsiveSize(14),
    fontSize: getResponsiveSize(15),
    color: "#333",
  },
  icon: {
    marginLeft: getResponsiveSize(14),
    marginRight: getResponsiveSize(8),
  },
  error: {
    borderColor: "#d73527",
    backgroundColor: "#fff5f5",
  },
});