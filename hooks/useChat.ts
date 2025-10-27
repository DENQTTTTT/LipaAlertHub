// hooks/useChat.tsx - COMPLETE REVISED WITH FILE UPLOAD
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { ChatMessage, ChatRoom, chatService } from '../services/chat';
import { useAuth } from './useAuth';

export interface UseChatReturn {
  // State
  messages: ChatMessage[];
  chatRoom: ChatRoom | null;
  unreadCount: number;
  loading: boolean;
  connected: boolean;
  sending: boolean;
  sendingFile: boolean;
  
  // Actions
  sendMessage: (content: string) => Promise<boolean>;
  sendFileMessage: (file: { uri: string; name: string; type: string; size: number }, content?: string) => Promise<boolean>;
  markMessagesAsRead: () => Promise<void>;
  refreshChat: () => Promise<void>;
  
  // Utils
  hasUnreadMessages: boolean;
  isChatAvailable: boolean;
  getLastMessage: () => ChatMessage | null;
  formatLastMessageTime: (timestamp: any) => string;
  formatFileSize: (bytes: number) => string;
  getFileIcon: (fileType: string) => string;
  
  // Chat room info
  chatRoomId: string | null;
  hasMessages: boolean;
}

export const useChat = (): UseChatReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingFile, setSendingFile] = useState(false);
  
  const { user } = useAuth();
  
  // Use refs to prevent unnecessary re-initializations
  const initializingRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Reset chat state when user changes
  useEffect(() => {
    if (!user) {
      // Clean up
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      
      setMessages([]);
      setChatRoom(null);
      setUnreadCount(0);
      setConnected(false);
      setLoading(false);
      setSending(false);
      setSendingFile(false);
      hasInitializedRef.current = false;
      initializingRef.current = false;
      userIdRef.current = null;
      return;
    }

    // Only initialize if user changed
    if (userIdRef.current === user.uid && hasInitializedRef.current) {
      return;
    }

    // User changed, reset and reinitialize
    if (userIdRef.current !== user.uid) {
      userIdRef.current = user.uid;
      hasInitializedRef.current = false;
      initializingRef.current = false;
    }

    // Prevent multiple initializations
    if (hasInitializedRef.current || initializingRef.current) {
      return;
    }

    const doInitialize = async () => {
      initializingRef.current = true;
      setLoading(true);

      try {
        console.log('🚀 Initializing chat for user:', user.uid);
        
        // Get or create chat room
        const roomId = await chatService.getOrCreateChatRoom();
        const roomInfo = await chatService.getChatRoomInfo();
        
        setChatRoom(roomInfo);
        setConnected(true);
        hasInitializedRef.current = true;
        
        // Get initial unread count
        const count = await chatService.getUnreadMessageCount();
        setUnreadCount(count);
        
        console.log('✅ Chat initialized successfully:', roomId);
      } catch (error: any) {
        console.error('❌ Error initializing chat:', error);
        setConnected(false);
        Alert.alert('Chat Error', 'Failed to initialize chat. Please try again.');
      } finally {
        setLoading(false);
        initializingRef.current = false;
      }
    };

    doInitialize();
  }, [user?.uid]); // Only depend on user ID

  // Set up messages listener only after successful initialization
  useEffect(() => {
    if (!user || !connected || !hasInitializedRef.current) return;

    const setupListener = async () => {
      try {
        // Clean up previous listener
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }

        console.log('👂 Setting up real-time messages listener...');
        
        const unsubscribe = chatService.subscribeToMessages((newMessages) => {
          console.log(`📨 Received ${newMessages.length} messages`);
          setMessages(newMessages);
          
          // Update unread count when messages are received
          chatService.getUnreadMessageCount().then(count => {
            setUnreadCount(count);
          });
        });

        if (unsubscribe) {
          unsubscribeRef.current = unsubscribe;
        }
      } catch (error: any) {
        console.error('❌ Error setting up messages listener:', error);
        Alert.alert('Connection Error', 'Failed to connect to chat. Please try again.');
      }
    };

    setupListener();

    return () => {
      if (unsubscribeRef.current && typeof unsubscribeRef.current === 'function') {
        console.log('🔌 Cleaning up messages listener');
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [user?.uid, connected]);

  // Send text message callback
  const sendMessage = useCallback(async (content: string): Promise<boolean> => {
    if (!user || !content.trim() || sending || !connected) {
      console.log('❌ Cannot send message:', { user: !!user, content: !!content.trim(), sending, connected });
      return false;
    }

    try {
      setSending(true);
      console.log('📤 Sending text message...');
      
      await chatService.sendUserMessage(content.trim());
      
      console.log('✅ Text message sent successfully');
      return true;
    } catch (error: any) {
      console.error('❌ Error sending message:', error);
      Alert.alert('Send Failed', error.message || 'Failed to send message. Please try again.');
      throw error;
    } finally {
      setSending(false);
    }
  }, [user, sending, connected]);

  // Send file message callback
  const sendFileMessage = useCallback(async (
    file: { uri: string; name: string; type: string; size: number }, 
    content?: string
  ): Promise<boolean> => {
    if (!user || sendingFile || !connected) {
      console.log('❌ Cannot send file:', { user: !!user, sendingFile, connected });
      return false;
    }

    try {
      setSendingFile(true);
      console.log('📤 Uploading file message...', { 
        name: file.name, 
        type: file.type, 
        size: file.size 
      });
      
      await chatService.sendFileMessage(file, content);
      
      console.log('✅ File message sent successfully');
      return true;
    } catch (error: any) {
      console.error('❌ Error sending file message:', error);
      // Error is already handled in the service with user-friendly messages
      throw error;
    } finally {
      setSendingFile(false);
    }
  }, [user, sendingFile, connected]);

  // Mark messages as read callback
  const markMessagesAsRead = useCallback(async () => {
    if (!user) return;

    try {
      console.log('📖 Marking messages as read...');
      await chatService.getUnreadMessageCount(); // This internally marks as read
      setUnreadCount(0);
      console.log('✅ Messages marked as read');
    } catch (error: any) {
      console.error('❌ Error marking messages as read:', error);
    }
  }, [user]);

  // Refresh chat info callback
  const refreshChat = useCallback(async () => {
    if (!user || initializingRef.current) return;

    try {
      setLoading(true);
      console.log('🔄 Refreshing chat info...');
      
      const roomInfo = await chatService.getChatRoomInfo();
      setChatRoom(roomInfo);
      
      const count = await chatService.getUnreadMessageCount();
      setUnreadCount(count);
      
      console.log('✅ Chat info refreshed');
    } catch (error: any) {
      console.error('❌ Error refreshing chat:', error);
      Alert.alert('Refresh Failed', 'Failed to refresh chat. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Get last message callback
  const getLastMessage = useCallback((): ChatMessage | null => {
    if (messages.length === 0) return null;
    return messages[messages.length - 1];
  }, [messages]);

  // Format timestamp callback
  const formatLastMessageTime = useCallback((timestamp: any): string => {
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

  // Format file size callback
  const formatFileSize = useCallback((bytes: number): string => {
    return chatService.formatFileSize(bytes);
  }, []);

  // Get file icon callback
  const getFileIcon = useCallback((fileType: string): string => {
    return chatService.getFileIcon(fileType);
  }, []);

  // Derived state
  const hasUnreadMessages = unreadCount > 0;
  const isChatAvailable = connected && user !== null;
  const hasMessages = messages.length > 0;
  const chatRoomId = user?.uid || null;

  return {
    // State
    messages,
    chatRoom,
    unreadCount,
    loading,
    connected,
    sending,
    sendingFile,
    
    // Actions
    sendMessage,
    sendFileMessage,
    markMessagesAsRead,
    refreshChat,
    
    // Utils
    hasUnreadMessages,
    isChatAvailable,
    getLastMessage,
    formatLastMessageTime,
    formatFileSize,
    getFileIcon,
    
    // Chat room info
    chatRoomId,
    hasMessages,
  };
};

export default useChat;