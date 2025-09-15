// hooks/useChat.ts - Chat Hook for Managing Chat State
import { useCallback, useEffect, useState } from 'react';
import { ChatMessage, ChatRoom, chatService } from '../services/chat';
import { useAuth } from './useAuth';

export const useChat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const { user } = useAuth();

  // Initialize chat when user is authenticated
  useEffect(() => {
    if (user) {
      initializeChat();
      setupUnreadCountListener();
    } else {
      resetChatState();
    }
  }, [user]);

  const resetChatState = useCallback(() => {
    setMessages([]);
    setChatRoom(null);
    setUnreadCount(0);
    setConnected(false);
    setLoading(false);
  }, []);

  const initializeChat = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // Get or create chat room
      const roomId = await chatService.getOrCreateChatRoom();
      const roomInfo = await chatService.getChatRoomInfo();
      
      setChatRoom(roomInfo);
      setConnected(true);
    } catch (error) {
      console.error('Error initializing chat:', error);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const setupUnreadCountListener = useCallback(() => {
    if (!user) return;

    // Check unread count periodically
    const checkUnreadCount = async () => {
      try {
        const count = await chatService.getUnreadMessageCount();
        setUnreadCount(count);
      } catch (error) {
        console.error('Error checking unread count:', error);
      }
    };

    // Initial check
    checkUnreadCount();

    // Set up periodic checks
    const interval = setInterval(checkUnreadCount, 10000); // Every 10 seconds
    
    return () => clearInterval(interval);
  }, [user]);

  const sendMessage = useCallback(async (message: string) => {
    if (!user || !message.trim()) return;

    try {
      await chatService.sendMessage(message.trim());
      
      // Update unread count might change after sending
      const count = await chatService.getUnreadMessageCount();
      setUnreadCount(count);
      
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }, [user]);

  const markMessagesAsRead = useCallback(async () => {
    if (!chatRoom?.id) return;

    try {
      // The chat service automatically marks messages as read when viewed
      // This is just to update the local unread count
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }, [chatRoom]);

  const setChatPriority = useCallback(async (priority: 'low' | 'normal' | 'high' | 'urgent') => {
    try {
      await chatService.setChatPriority(priority);
      
      // Update local chat room info
      if (chatRoom) {
        setChatRoom({
          ...chatRoom,
          priority,
        });
      }
    } catch (error) {
      console.error('Error setting chat priority:', error);
      throw error;
    }
  }, [chatRoom]);

  const closeChat = useCallback(async () => {
    try {
      await chatService.closeChatRoom();
      
      // Update local chat room status
      if (chatRoom) {
        setChatRoom({
          ...chatRoom,
          status: 'closed',
        });
      }
    } catch (error) {
      console.error('Error closing chat:', error);
      throw error;
    }
  }, [chatRoom]);

  const setupMessagesListener = useCallback((callback: (messages: ChatMessage[]) => void) => {
    if (!user) {
      callback([]);
      return () => {};
    }

    return chatService.getChatMessages((newMessages) => {
      setMessages(newMessages);
      callback(newMessages);
      
      // Update unread count when messages change
      if (newMessages.length > 0) {
        const count = newMessages.filter(msg => 
          msg.senderType === 'cdrrmo' && 
          msg.status !== 'read'
        ).length;
        setUnreadCount(count);
      }
    });
  }, [user]);

  return {
    // State
    messages,
    chatRoom,
    unreadCount,
    loading,
    connected,
    
    // Actions
    sendMessage,
    markMessagesAsRead,
    setChatPriority,
    closeChat,
    setupMessagesListener,
    initializeChat,
    
    // Utils
    hasUnreadMessages: unreadCount > 0,
    isActive: chatRoom?.status === 'active',
    isChatAvailable: connected && user !== null,
  };
};

export default useChat;