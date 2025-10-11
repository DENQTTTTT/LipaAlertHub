// app/(main)/chat/[id].tsx - Fixed Chat Conversation Screen
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../hooks/useAuth';
import { useChat } from '../../../hooks/useChat';
import { ChatMessage } from '../../../services/chat';

const { width } = Dimensions.get('window');

export default function ChatConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const {
    messages,
    loading,
    connected,
    sending,
    sendMessage,
    markMessagesAsRead,
  } = useChat();

  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const hasMarkedAsReadRef = useRef(false);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]); // Only depend on message count

  // Mark messages as read when screen loads (only once)
  useEffect(() => {
    if (connected && !hasMarkedAsReadRef.current) {
      markMessagesAsRead();
      hasMarkedAsReadRef.current = true;
    }
  }, [connected]); // Only when connected changes

  const handleSendMessage = useCallback(async () => {
    const messageText = inputText.trim();
    if (!messageText || sending) return;

    setInputText('');

    try {
      await sendMessage(messageText);
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert(
        'Send Failed',
        'Failed to send your message. Please try again.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Retry', 
            onPress: () => setInputText(messageText) 
          },
        ]
      );
    }
  }, [inputText, sending, sendMessage]);

  const formatMessageTime = useCallback((timestamp: any) => {
    if (!timestamp) return '';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } else {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (date.toDateString() === yesterday.toDateString()) {
        return `Yesterday ${date.toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        })}`;
      } else {
        return date.toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
      }
    }
  }, []);

  const renderMessage = useCallback(({ item, index }: { item: ChatMessage; index: number }) => {
    const isUserMessage = item.senderRole === 'user';
    const isSystemMessage = item.senderId === 'system';
    const showTime = index === 0 || 
      (messages[index - 1] && 
       Math.abs((item.createdAt?.toDate?.() || new Date()).getTime() - 
                (messages[index - 1].createdAt?.toDate?.() || new Date()).getTime()) > 300000); // 5 minutes

    return (
      <View style={styles.messageContainer}>
        {showTime && (
          <View style={styles.timeContainer}>
            <Text style={styles.timeText}>
              {formatMessageTime(item.createdAt)}
            </Text>
          </View>
        )}

        <View style={[
          styles.messageWrapper,
          isUserMessage ? styles.userMessageWrapper : styles.adminMessageWrapper
        ]}>
          {!isUserMessage && !isSystemMessage && (
            <View style={styles.senderInfo}>
              <View style={styles.adminAvatar}>
                <Ionicons name="shield-checkmark" size={12} color="#fff" />
              </View>
              <Text style={styles.senderName}>CDRRMO</Text>
            </View>
          )}

          <View style={[
            styles.messageBubble,
            isUserMessage ? styles.userBubble : styles.adminBubble,
            isSystemMessage && styles.systemBubble
          ]}>
            <Text style={[
              styles.messageText,
              isUserMessage ? styles.userMessageText : styles.adminMessageText,
              isSystemMessage && styles.systemMessageText
            ]}>
              {item.content}
            </Text>
          </View>
        </View>
      </View>
    );
  }, [messages, formatMessageTime]);

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name="chatbubbles-outline" size={60} color="#ccc" />
      </View>
      <Text style={styles.emptyTitle}>Start the conversation</Text>
      <Text style={styles.emptySubtitle}>
        Send a message to begin chatting with our support team
      </Text>
    </View>
  );

  const renderLoadingState = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#d73527" />
      <Text style={styles.loadingText}>Loading messages...</Text>
    </View>
  );

  if (!user || (id && id !== user.uid)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1a202c" />
          </Pressable>
          <Text style={styles.headerTitle}>Chat</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorState}>
          <Ionicons name="alert-circle-outline" size={60} color="#ccc" />
          <Text style={styles.errorTitle}>Access Denied</Text>
          <Text style={styles.errorSubtitle}>
            You don't have permission to view this conversation
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1a202c" />
        </Pressable>
        
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>CDRRMO Support</Text>
          <Text style={styles.headerSubtitle}>
            {connected ? 'Available for support' : 'Connecting...'}
          </Text>
        </View>

        <Pressable style={styles.infoButton}>
          <Ionicons name="information-circle-outline" size={24} color="#666" />
        </Pressable>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView 
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {loading ? (
          renderLoadingState()
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id || Math.random().toString()}
            renderItem={renderMessage}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContent}
            ListEmptyComponent={renderEmptyState}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Message Input */}
        <View style={styles.inputContainer}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              placeholder="Type your message..."
              placeholderTextColor="#999"
              value={inputText}
              onChangeText={setInputText}
              multiline={true}
              maxLength={1000}
              editable={!sending && connected}
            />
            
            <Pressable
              style={[
                styles.sendButton,
                (!inputText.trim() || sending || !connected) && styles.sendButtonDisabled
              ]}
              onPress={handleSendMessage}
              disabled={!inputText.trim() || sending || !connected}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons 
                  name="send" 
                  size={18} 
                  color={inputText.trim() && connected ? "#fff" : "#999"} 
                />
              )}
            </Pressable>
          </View>
          
          <View style={styles.inputFooter}>
            <Text style={styles.charCount}>
              {inputText.length}/1000
            </Text>
            <Text style={styles.connectionStatus}>
              {connected ? 'Connected' : 'Connecting...'}
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={styles.footer}>
        <Ionicons name="shield-checkmark" size={14} color="#d73527" />
        <Text style={styles.footerText}>
          Secured chat with CDRRMO • Response time: Usually within 30 minutes
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a202c',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 1,
  },
  headerRight: {
    width: 40,
  },
  infoButton: {
    padding: 8,
  },
  chatContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a202c',
    marginTop: 16,
  },
  errorSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: 16,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a202c',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  messageContainer: {
    marginBottom: 16,
  },
  timeContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  timeText: {
    fontSize: 11,
    color: '#999',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  messageWrapper: {
    paddingHorizontal: 16,
    maxWidth: width * 0.8,
  },
  userMessageWrapper: {
    alignSelf: 'flex-end',
  },
  adminMessageWrapper: {
    alignSelf: 'flex-start',
  },
  senderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  adminAvatar: {
    width: 20,
    height: 20,
    backgroundColor: '#d73527',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#d73527',
  },
  messageBubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: '#d73527',
  },
  adminBubble: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e1e8ed',
  },
  systemBubble: {
    backgroundColor: '#f0f8ff',
    borderColor: '#3498db',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#fff',
  },
  adminMessageText: {
    color: '#1a202c',
  },
  systemMessageText: {
    color: '#2c5282',
  },
  inputContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e1e8ed',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#f8f9fa',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e1e8ed',
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#1a202c',
    maxHeight: 80,
    paddingVertical: 4,
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: '#d73527',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ddd',
  },
  inputFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  charCount: {
    fontSize: 11,
    color: '#999',
  },
  connectionStatus: {
    fontSize: 11,
    color: '#999',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  footerText: {
    fontSize: 11,
    color: '#666',
    marginLeft: 4,
  },
});