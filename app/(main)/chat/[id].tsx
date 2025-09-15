import React, { useState } from "react";
import {
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

export default function CDRRMOChat() {
  const [message, setMessage] = useState("");

  const messages = [
    {
      id: 1,
      text: "Please provide the details.",
      sender: "cdrrmo",
      timestamp: "10:30 AM"
    },
    {
      id: 2,
      text: "Barangay Sabang Lipa City",
      sender: "user",
      timestamp: "10:32 AM"
    },
    {
      id: 3,
      text: "Please wait for the next steps",
      sender: "cdrrmo",
      timestamp: "10:35 AM"
    },
    {
      id: 4,
      text: "Okay Thank you so much po",
      sender: "user",
      timestamp: "10:36 AM"
    }
  ];

  const handleSend = () => {
    if (message.trim()) {
      // Handle send logic here
      console.log("Sending message:", message);
      setMessage("");
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image 
      source={require('../../../assets/images/logo.png')} 
            style={styles.logoImage}
          />
          <Text style={styles.logoTitle}>LipoAlertHub</Text>
        </View>
        <Text style={styles.chatTitle}>CDRRMO</Text>
      </View>

      {/* Messages */}
      <ScrollView 
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((msg) => (
          <View
            key={msg.id}
            style={[
              styles.messageWrapper,
              msg.sender === 'user' ? styles.userMessageWrapper : styles.cdrrmoMessageWrapper
            ]}
          >
            <View
              style={[
                styles.messageBubble,
                msg.sender === 'user' ? styles.userMessage : styles.cdrrmoMessage
              ]}
            >
              <Text style={[
                styles.messageText,
                msg.sender === 'user' ? styles.userMessageText : styles.cdrrmoMessageText
              ]}>
                {msg.text}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Input Area */}
      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.textInput}
            placeholder="Write a message..."
            placeholderTextColor="#9ca3af"
            value={message}
            onChangeText={setMessage}
            multiline
          />
          <TouchableOpacity 
            style={styles.sendButton}
            onPress={handleSend}
          >
            <Text style={styles.sendIcon}>📎</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#e5e5e5",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  logoImage: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginRight: 10,
    resizeMode: 'contain',
  },
  logoTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
  },
  chatTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1f2937",
  },
  messagesContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  messagesContent: {
    paddingTop: 20,
    paddingBottom: 20,
  },
  messageWrapper: {
    marginBottom: 15,
    maxWidth: '80%',
  },
  userMessageWrapper: {
    alignSelf: 'flex-end',
  },
  cdrrmoMessageWrapper: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    maxWidth: '100%',
  },
  userMessage: {
    backgroundColor: "#d1d5db",
    borderBottomRightRadius: 4,
  },
  cdrrmoMessage: {
    backgroundColor: "#d1d5db",
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  userMessageText: {
    color: "#1f2937",
  },
  cdrrmoMessageText: {
    color: "#1f2937",
  },
  inputContainer: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e5e5",
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: "#d1d5db",
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 10,
    minHeight: 50,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: "#1f2937",
    maxHeight: 100,
    paddingVertical: 0,
  },
  sendButton: {
    marginLeft: 10,
    padding: 5,
  },
  sendIcon: {
    fontSize: 20,
  },
});