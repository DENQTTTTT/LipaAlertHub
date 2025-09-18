// hooks/useChat.tsx - Fixed Chat Hook (No More Infinite Loop)
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatMessage, ChatRoom, chatService } from '../services/chat';
import { useAuth } from './useAuth';

export const useChat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  
  // Use refs to prevent unnecessary re-initializations
  const initializingRef = useRef(false);
  const hasInitializedRef = useRef(false);

  // Reset chat state when user changes
  const resetChatState = useCallback(() => {
    setMessages([]);
    setChatRoom(null);
    setUnreadCount(0);
    setConnected(false);
    setLoading(false);
    setSending(false);
    hasInitializedRef.current = false;
    initializingRef.current = false;
  }, []);

  // Initialize chat ONLY when user changes and hasn't been initialized
  useEffect(() => {
    if (!user) {
      resetChatState();
      return;
    }

    // Prevent multiple initializations
    if (hasInitializedRef.current || initializingRef.current) {
      return;
    }

    const doInitialize = async () => {
      initializingRef.current = true;
      setLoading(true);

      try {
        // Get or create chat room
        const roomId = await chatService.getOrCreateChatRoom();
        const roomInfo = await chatService.getChatRoomInfo();
        
        setChatRoom(roomInfo);
        setConnected(true);
        hasInitializedRef.current = true;
        
        console.log('Chat initialized successfully:', roomId);
      } catch (error) {
        console.error('Error initializing chat:', error);
        setConnected(false);
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

    let unsubscribe: (() => void) | null = null;

    const setupListener = async () => {
      try {
        const unsubscribePromise = chatService.subscribeToMessages((newMessages) => {
          setMessages(newMessages);
          setUnreadCount(0); // Reset since user is viewing messages
        });

        if (unsubscribePromise instanceof Promise) {
          unsubscribe = await unsubscribePromise;
        } else if (typeof unsubscribePromise === 'function') {
          unsubscribe = unsubscribePromise;
        }
      } catch (error) {
        console.error('Error setting up messages listener:', error);
      }
    };

    setupListener();

    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [user?.uid, connected]);

  // Manual initialize function for components that need it
  const initializeChat = useCallback(async () => {
    if (!user || hasInitializedRef.current || initializingRef.current) {
      return;
    }

    initializingRef.current = true;
    setLoading(true);

    try {
      const roomId = await chatService.getOrCreateChatRoom();
      const roomInfo = await chatService.getChatRoomInfo();
      
      setChatRoom(roomInfo);
      setConnected(true);
      hasInitializedRef.current = true;
      
      console.log('Chat manually initialized:', roomId);
    } catch (error) {
      console.error('Error manually initializing chat:', error);
      setConnected(false);
    } finally {
      setLoading(false);
      initializingRef.current = false;
    }
  }, [user?.uid]);

  const sendMessage = useCallback(async (content: string, attachments?: any[]) => {
    if (!user || !content.trim() || sending || !connected) return false;

    try {
      setSending(true);
      await chatService.sendUserMessage(content.trim(), attachments);
      
      console.log('Message sent successfully');
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    } finally {
      setSending(false);
    }
  }, [user, sending, connected]);

  const markMessagesAsRead = useCallback(async () => {
    if (!chatRoom?.id || !user) return;

    try {
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }, [chatRoom, user]);

  const refreshChat = useCallback(async () => {
    if (!user || initializingRef.current) return;

    try {
      setLoading(true);
      const roomInfo = await chatService.getChatRoomInfo();
      setChatRoom(roomInfo);
      
      const count = await chatService.getUnreadMessageCount();
      setUnreadCount(count);
    } catch (error) {
      console.error('Error refreshing chat:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const getLastMessage = useCallback(() => {
    if (messages.length === 0) return null;
    return messages[messages.length - 1];
  }, [messages]);

  const formatLastMessageTime = useCallback((timestamp: any) => {
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
  }, []);

  return {
    // State
    messages,
    chatRoom,
    unreadCount,
    loading,
    connected,
    sending,
    
    // Actions
    sendMessage,
    markMessagesAsRead,
    initializeChat, // Only call this manually if needed
    refreshChat,
    
    // Utils
    hasUnreadMessages: unreadCount > 0,
    isChatAvailable: connected && user !== null,
    getLastMessage,
    formatLastMessageTime,
    
    // Chat room info
    chatRoomId: user?.uid || null,
    hasMessages: messages.length > 0,
  };
};

export default useChat;