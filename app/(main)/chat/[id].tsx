import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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

export default function ChatConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const {
    messages,
    loading,
    connected,
    sending,
    sendingFile,
    sendMessage,
    sendFileMessage,
    markMessagesAsRead,
    formatFileSize,
    getFileIcon,
  } = useChat();

  const [inputText, setInputText] = useState('');
  const [showFileOptions, setShowFileOptions] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string; type: string; size: number } | null>(null);
  const [fileCaption, setFileCaption] = useState('');
  const [showFileModal, setShowFileModal] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);
  const hasMarkedAsReadRef = useRef(false);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Mark messages as read when screen loads
  useEffect(() => {
    if (connected && !hasMarkedAsReadRef.current) {
      markMessagesAsRead();
      hasMarkedAsReadRef.current = true;
    }
  }, [connected, markMessagesAsRead]);

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

  const handlePickImage = useCallback(async () => {
    try {
      setShowFileOptions(false);
      
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photos to upload images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedFile({
          uri: asset.uri,
          name: `image_${Date.now()}.jpg`,
          type: asset.mimeType || 'image/jpeg',
          size: asset.fileSize || 0,
        });
        setShowFileModal(true);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  }, []);

  const handlePickDocument = useCallback(async () => {
    try {
      setShowFileOptions(false);
      
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled === false && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedFile({
          uri: asset.uri,
          name: asset.name || `document_${Date.now()}`,
          type: asset.mimeType || 'application/octet-stream',
          size: asset.size || 0,
        });
        setShowFileModal(true);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document. Please try again.');
    }
  }, []);

  const handleSendFile = useCallback(async () => {
    if (!selectedFile || sendingFile) return;

    try {
      await sendFileMessage(selectedFile, fileCaption);
      setShowFileModal(false);
      setSelectedFile(null);
      setFileCaption('');
    } catch (error) {
      console.error('Error sending file:', error);
      // Error is handled in the hook
    }
  }, [selectedFile, fileCaption, sendingFile, sendFileMessage]);

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

  const renderFileMessage = useCallback((message: ChatMessage) => {
    const isUserMessage = message.senderRole === 'user';
    
    return (
      <View style={[
        styles.fileMessageContainer,
        isUserMessage ? styles.userFileMessage : styles.adminFileMessage
      ]}>
        <View style={styles.fileIconContainer}>
          <Ionicons 
            name={getFileIcon(message.fileType || '') as any} 
            size={24} 
            color={isUserMessage ? '#fff' : '#d73527'} 
          />
        </View>
        
        <View style={styles.fileInfo}>
          <Text style={[
            styles.fileName,
            isUserMessage ? styles.userFileName : styles.adminFileName
          ]}>
            {message.fileName}
          </Text>
          
          <Text style={[
            styles.fileSize,
            isUserMessage ? styles.userFileSize : styles.adminFileSize
          ]}>
            {formatFileSize(message.fileSize || 0)}
          </Text>
          
          {message.content ? (
            <Text style={[
              styles.fileCaption,
              isUserMessage ? styles.userFileCaption : styles.adminFileCaption
            ]}>
              {message.content}
            </Text>
          ) : null}
        </View>
        
        <TouchableOpacity 
          style={styles.downloadButton}
          onPress={() => {
            if (message.fileUrl) {
              // In a real app, you might want to use Linking.openURL or download the file
              Alert.alert('Download', `Would download: ${message.fileName}`);
            }
          }}
        >
          <Ionicons 
            name="download" 
            size={20} 
            color={isUserMessage ? '#fff' : '#d73527'} 
          />
        </TouchableOpacity>
      </View>
    );
  }, [getFileIcon, formatFileSize]);

  const renderMessage = useCallback(({ item, index }: { item: ChatMessage; index: number }) => {
    const isUserMessage = item.senderRole === 'user';
    const isSystemMessage = item.senderId === 'system';
    const showTime = index === 0 || 
      (messages[index - 1] && 
       Math.abs((item.createdAt?.toDate?.() || new Date()).getTime() - 
                (messages[index - 1].createdAt?.toDate?.() || new Date()).getTime()) > 300000);

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

          {item.type === 'file' ? (
            renderFileMessage(item)
          ) : (
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
          )}
        </View>
      </View>
    );
  }, [messages, formatMessageTime, renderFileMessage]);

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name="chatbubbles-outline" size={60} color="#ccc" />
      </View>
      <Text style={styles.emptyTitle}>Start the conversation</Text>
      <Text style={styles.emptySubtitle}>
        Send a message or attach files to begin chatting with our support team
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
            <TouchableOpacity 
              style={styles.attachButton}
              onPress={() => setShowFileOptions(true)}
            >
              <Ionicons name="attach" size={20} color="#666" />
            </TouchableOpacity>
            
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

      {/* File Options Modal */}
      <Modal
        visible={showFileOptions}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFileOptions(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setShowFileOptions(false)}
        >
          <View style={styles.fileOptionsContainer}>
            <Text style={styles.fileOptionsTitle}>Attach File</Text>
            
            <TouchableOpacity 
              style={styles.fileOption}
              onPress={handlePickImage}
            >
              <Ionicons name="image" size={24} color="#d73527" />
              <Text style={styles.fileOptionText}>Photo from Library</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.fileOption}
              onPress={handlePickDocument}
            >
              <Ionicons name="document" size={24} color="#d73527" />
              <Text style={styles.fileOptionText}>Document</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={() => setShowFileOptions(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* File Preview Modal */}
      <Modal
        visible={showFileModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFileModal(false)}
      >
        <SafeAreaView style={styles.fileModalContainer}>
          <View style={styles.fileModalHeader}>
            <Text style={styles.fileModalTitle}>Send File</Text>
            <TouchableOpacity 
              onPress={() => {
                setShowFileModal(false);
                setSelectedFile(null);
                setFileCaption('');
              }}
            >
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.filePreview}>
            {selectedFile?.type.startsWith('image/') ? (
              <View style={styles.imagePreview}>
                <Ionicons name="image" size={60} color="#d73527" />
                <Text style={styles.filePreviewName}>{selectedFile.name}</Text>
                <Text style={styles.filePreviewSize}>
                  {formatFileSize(selectedFile.size)}
                </Text>
              </View>
            ) : (
              <View style={styles.documentPreview}>
                <Ionicons name="document" size={60} color="#d73527" />
                <Text style={styles.filePreviewName}>{selectedFile?.name}</Text>
                <Text style={styles.filePreviewSize}>
                  {selectedFile && formatFileSize(selectedFile.size)}
                </Text>
              </View>
            )}
          </View>
          
          <View style={styles.captionContainer}>
            <Text style={styles.captionLabel}>Add a caption (optional)</Text>
            <TextInput
              style={styles.captionInput}
              placeholder="Describe this file..."
              value={fileCaption}
              onChangeText={setFileCaption}
              multiline={true}
              maxLength={500}
            />
            <Text style={styles.captionCharCount}>
              {fileCaption.length}/500
            </Text>
          </View>
          
          <View style={styles.fileModalActions}>
            <TouchableOpacity 
              style={[
                styles.sendFileButton,
                sendingFile && styles.sendFileButtonDisabled
              ]}
              onPress={handleSendFile}
              disabled={sendingFile}
            >
              {sendingFile ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={styles.sendFileButtonText}>Send File</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

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
    maxWidth: width * 0.85,
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
  // File message styles
  fileMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    maxWidth: '100%',
  },
  userFileMessage: {
    backgroundColor: '#d73527',
  },
  adminFileMessage: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e1e8ed',
  },
  fileIconContainer: {
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  userFileName: {
    color: '#fff',
  },
  adminFileName: {
    color: '#1a202c',
  },
  fileSize: {
    fontSize: 12,
    marginBottom: 4,
  },
  userFileSize: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  adminFileSize: {
    color: '#666',
  },
  fileCaption: {
    fontSize: 14,
    lineHeight: 18,
  },
  userFileCaption: {
    color: '#fff',
  },
  adminFileCaption: {
    color: '#1a202c',
  },
  downloadButton: {
    padding: 8,
  },
  // Input styles
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
  attachButton: {
    padding: 8,
    marginRight: 4,
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  fileOptionsContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 34,
  },
  fileOptionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
    color: '#1a202c',
  },
  fileOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  fileOptionText: {
    fontSize: 16,
    marginLeft: 12,
    color: '#1a202c',
  },
  cancelButton: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#d73527',
  },
  // File modal styles
  fileModalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  fileModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  fileModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a202c',
  },
  filePreview: {
    alignItems: 'center',
    padding: 40,
  },
  imagePreview: {
    alignItems: 'center',
  },
  documentPreview: {
    alignItems: 'center',
  },
  filePreviewName: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
    color: '#1a202c',
  },
  filePreviewSize: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  captionContainer: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  captionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1a202c',
  },
  captionInput: {
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  captionCharCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 4,
  },
  fileModalActions: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  sendFileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d73527',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  sendFileButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendFileButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});