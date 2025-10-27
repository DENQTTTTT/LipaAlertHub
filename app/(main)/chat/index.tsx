// app/(main)/chat/index.tsx
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../hooks/useAuth';
import { useChat } from '../../../hooks/useChat';
import { ChatMessage } from '../../../services/chat';

const { width } = Dimensions.get('window');

interface ChatModalProps {
  isVisible: boolean;
  onClose?: () => void;
}

export const ChatModal: React.FC<ChatModalProps> = ({ isVisible, onClose }) => {
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const hasMarkedAsReadRef = useRef(false);
  const isMountedRef = useRef(true);
  
  const { user } = useAuth();
  const {
    messages,
    loading,
    connected,
    sending,
    sendMessage,
    markMessagesAsRead,
  } = useChat();

  // Safe onClose handler with proper navigation fallback
  const handleCloseChat = useCallback(() => {
    // Clear input immediately
    setInputText('');
    hasMarkedAsReadRef.current = false;
    
    // First try the provided onClose function
    if (typeof onClose === 'function') {
      onClose();
    } else {
      // Fallback navigation
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(main)');
      }
    }
  }, [onClose]);

  // Safe close with confirmation
  const handleCloseWithConfirmation = useCallback(() => {
    Alert.alert(
      'Close Chat',
      'Are you sure you want to close this chat?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close',
          style: 'destructive',
          onPress: handleCloseChat,
        },
      ]
    );
  }, [handleCloseChat]);

  // Safe modal request close handler
  const handleRequestClose = useCallback(() => {
    if (inputText.trim().length > 0) {
      handleCloseWithConfirmation();
    } else {
      handleCloseChat();
    }
  }, [inputText, handleCloseWithConfirmation, handleCloseChat]);

  // Track component mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Mark messages as read when modal opens (only once per open)
  useEffect(() => {
    if (isVisible && connected && !hasMarkedAsReadRef.current) {
      markMessagesAsRead();
      hasMarkedAsReadRef.current = true;
    }
    
    // Reset flag when modal closes
    if (!isVisible) {
      hasMarkedAsReadRef.current = false;
    }
  }, [isVisible, connected, markMessagesAsRead]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0 && isVisible && isMountedRef.current) {
      setTimeout(() => {
        if (isMountedRef.current) {
          flatListRef.current?.scrollToEnd({ animated: true });
        }
      }, 100);
    }
  }, [messages.length, isVisible]);

  const handleSendMessage = useCallback(async () => {
    if (!inputText.trim() || sending || !connected) return;

    const messageToSend = inputText.trim();
    setInputText('');

    try {
      await sendMessage(messageToSend);
      
      // Auto-scroll to bottom after sending
      setTimeout(() => {
        if (isMountedRef.current) {
          flatListRef.current?.scrollToEnd({ animated: true });
        }
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Only show alert if component is still mounted
      if (isMountedRef.current) {
        Alert.alert(
          'Message Failed', 
          'Failed to send message. Please try again.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Retry', 
              onPress: () => {
                if (isMountedRef.current) {
                  setInputText(messageToSend);
                }
              }
            },
          ]
        );
      }
    }
  }, [inputText, sending, connected, sendMessage]);

  const formatTime = useCallback((timestamp: any) => {
    if (!timestamp) return '';
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / (1000 * 60));
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));

      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 7) return `${days}d ago`;
      
      return date.toLocaleDateString();
    } catch (error) {
      console.error('Error formatting time:', error);
      return '';
    }
  }, []);

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isUserMessage = item.senderRole === 'user';
    const isSystemMessage = item.senderId === 'system';

    return (
      <View style={[
        styles.messageContainer,
        isUserMessage ? styles.userMessageContainer : styles.cdrrmoMessageContainer
      ]}>
        {!isUserMessage && !isSystemMessage && (
          <View style={styles.senderInfo}>
            <View style={styles.cdrrmoAvatar}>
              <Ionicons name="shield-checkmark" size={14} color="#fff" />
            </View>
            <Text style={styles.senderName}>CDRRMO</Text>
          </View>
        )}
        
        <View style={[
          styles.messageBubble,
          isUserMessage ? styles.userBubble : styles.cdrrmoBubble,
          isSystemMessage && styles.systemBubble
        ]}>
          <Text style={[
            styles.messageText,
            isUserMessage ? styles.userMessageText : styles.cdrrmoMessageText,
            isSystemMessage && styles.systemMessageText
          ]}>
            {item.content}
          </Text>
          
          <Text style={[
            styles.messageTime,
            isUserMessage ? styles.userMessageTime : styles.cdrrmoMessageTime
          ]}>
            {formatTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  }, [formatTime]);

  const renderEmptyState = useCallback(() => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name="chatbubbles-outline" size={60} color="#ccc" />
      </View>
      <Text style={styles.emptyTitle}>Start the conversation</Text>
      <Text style={styles.emptySubtitle}>
        Send a message to begin chatting with our support team
      </Text>
    </View>
  ), []);

  const renderContent = () => {
    if (loading && messages.length === 0) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e74c3c" />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      );
    }

    return (
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id || Math.random().toString()}
        renderItem={renderMessage}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContent}
        ListEmptyComponent={renderEmptyState}
        onContentSizeChange={() => {
          if (isMountedRef.current) {
            flatListRef.current?.scrollToEnd({ animated: true });
          }
        }}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleRequestClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCloseChat} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
          
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>CDRRMO Support</Text>
            <View style={styles.headerSubtitle}>
              {connected ? (
                <>
                  <View style={styles.onlineIndicator} />
                  <Text style={styles.headerSubtitleText}>Available for support</Text>
                </>
              ) : (
                <Text style={styles.headerSubtitleText}>Connecting...</Text>
              )}
            </View>
          </View>
          
          <TouchableOpacity style={styles.infoButton}>
            <Ionicons name="information-circle-outline" size={24} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <KeyboardAvoidingView 
          style={styles.chatContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {renderContent()}

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
              
              <TouchableOpacity
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
              </TouchableOpacity>
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

        {/* Chat Info Footer */}
        <View style={styles.footer}>
          <Ionicons name="shield-checkmark" size={16} color="#e74c3c" />
          <Text style={styles.footerText}>
            Secured chat with CDRRMO • Response time: Usually within 30 minutes
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

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
  closeButton: {
    padding: 8,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  headerSubtitle: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSubtitleText: {
    fontSize: 13,
    color: '#666',
  },
  onlineIndicator: {
    width: 8,
    height: 8,
    backgroundColor: '#4CAF50',
    borderRadius: 4,
    marginRight: 6,
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
    paddingHorizontal: 16,
  },
  userMessageContainer: {
    alignItems: 'flex-end',
  },
  cdrrmoMessageContainer: {
    alignItems: 'flex-start',
  },
  senderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  cdrrmoAvatar: {
    width: 24,
    height: 24,
    backgroundColor: '#e74c3c',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#e74c3c',
  },
  messageBubble: {
    maxWidth: width * 0.75,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  userBubble: {
    backgroundColor: '#e74c3c',
  },
  cdrrmoBubble: {
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
  cdrrmoMessageText: {
    color: '#333',
  },
  systemMessageText: {
    color: '#2c5282',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
  },
  userMessageTime: {
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'right',
  },
  cdrrmoMessageTime: {
    color: '#999',
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
    color: '#333',
    maxHeight: 80,
    paddingVertical: 4,
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: '#e74c3c',
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
    marginLeft: 6,
  },
});

export default ChatModal;