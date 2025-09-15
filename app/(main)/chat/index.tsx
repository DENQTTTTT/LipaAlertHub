// app/(main)/chat/index.tsx - Chat Modal Component
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
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
import { ChatMessage, chatService } from '../../../services/chat';

const { width, height } = Dimensions.get('window');

interface ChatModalProps {
  isVisible: boolean;
  onClose: () => void;
}

export const ChatModal: React.FC<ChatModalProps> = ({ isVisible, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (isVisible && user) {
      setLoading(true);
      
      // Set up real-time message listener
      const unsubscribe = chatService.getChatMessages((newMessages) => {
        setMessages(newMessages);
        setLoading(false);
        setIsConnected(true);
        
        // Auto-scroll to bottom when new messages arrive
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      });

      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    } else {
      setMessages([]);
      setIsConnected(false);
    }
  }, [isVisible, user]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || sending) return;

    setSending(true);
    const messageToSend = inputText.trim();
    setInputText('');

    try {
      await chatService.sendMessage(messageToSend);
      
      // Auto-scroll to bottom after sending
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert(
        'Message Failed', 
        'Failed to send message. Please try again.',
        [{ text: 'OK' }]
      );
      setInputText(messageToSend); // Restore the message
    } finally {
      setSending(false);
    }
  };

  const handleCloseChat = () => {
    Alert.alert(
      'Close Chat',
      'Are you sure you want to close this chat?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close',
          style: 'destructive',
          onPress: () => {
            onClose();
            setInputText('');
          },
        },
      ]
    );
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    
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
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUserMessage = item.senderType === 'user';
    const isSystemMessage = item.senderId === 'cdrrmo_system';

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
            <Text style={styles.senderName}>{item.senderName}</Text>
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
            {item.message}
          </Text>
          
          <Text style={[
            styles.messageTime,
            isUserMessage ? styles.userMessageTime : styles.cdrrmoMessageTime
          ]}>
            {formatTime(item.timestamp)}
            {isUserMessage && (
              <Text style={styles.messageStatus}>
                {item.status === 'read' ? ' ✓✓' : ' ✓'}
              </Text>
            )}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCloseChat}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCloseChat} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
          
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>CDRRMO Support</Text>
            <Text style={styles.headerSubtitle}>
              {isConnected ? (
                <>
                  <View style={styles.onlineIndicator} />
                  Available for support
                </>
              ) : (
                'Connecting...'
              )}
            </Text>
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
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#e74c3c" />
              <Text style={styles.loadingText}>Loading messages...</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id || Math.random().toString()}
              renderItem={renderMessage}
              style={styles.messagesList}
              contentContainerStyle={styles.messagesContent}
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
                maxLength={500}
                editable={!sending}
              />
              
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!inputText.trim() || sending) && styles.sendButtonDisabled
                ]}
                onPress={handleSendMessage}
                disabled={!inputText.trim() || sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons 
                    name="send" 
                    size={18} 
                    color={inputText.trim() ? "#fff" : "#999"} 
                  />
                )}
              </TouchableOpacity>
            </View>
            
            <Text style={styles.charCount}>
              {inputText.length}/500
            </Text>
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
    fontSize: 13,
    color: '#666',
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
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
  messageStatus: {
    fontSize: 10,
  },
  inputContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e1e8ed',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  charCount: {
    fontSize: 11,
    color: '#999',
    textAlign: 'right',
    marginTop: 4,
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