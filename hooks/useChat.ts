// hooks/useChat.tsx - Fixed Chat Hook (No Infinite Loops)
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

    const setupListener = async () => {
      try {
        // Clean up previous listener
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }

        const unsubscribePromise = chatService.subscribeToMessages((newMessages) => {
          setMessages(newMessages);
          setUnreadCount(0); // Reset since user is viewing messages
        });

        if (unsubscribePromise instanceof Promise) {
          unsubscribeRef.current = await unsubscribePromise;
        } else if (typeof unsubscribePromise === 'function') {
          unsubscribeRef.current = unsubscribePromise;
        }
      } catch (error) {
        console.error('Error setting up messages listener:', error);
      }
    };

    setupListener();

    return () => {
      if (unsubscribeRef.current && typeof unsubscribeRef.current === 'function') {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [user?.uid, connected]);

  // Send message callback - stable reference
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

  // Mark messages as read - stable reference
  const markMessagesAsRead = useCallback(async () => {
    if (!chatRoom?.id || !user) return;

    try {
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }, [chatRoom?.id, user]);

  // Refresh chat info - stable reference
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

  // Get last message - stable reference
  const getLastMessage = useCallback(() => {
    if (messages.length === 0) return null;
    return messages[messages.length - 1];
  }, [messages]);

  // Format timestamp - stable reference
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