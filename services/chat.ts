// services/chat.ts - Complete Fixed Chat Service
import { getAuth } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { notificationService } from './notifications';

export interface ChatMessage {
  id?: string;
  chatRoomId: string;
  senderId: string;
  senderName: string;
  senderType: 'user' | 'cdrrmo';
  message: string;
  timestamp: Timestamp;
  status: 'sent' | 'delivered' | 'read';
  attachments?: {
    type: 'image' | 'file';
    url: string;
    name: string;
  }[];
}

export interface ChatRoom {
  id?: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: 'active' | 'closed';
  createdAt: Timestamp;
  lastMessage?: {
    message: string;
    timestamp: Timestamp;
    senderId: string;
    senderName: string;
  };
  unreadCount: {
    user: number;
    cdrrmo: number;
  };
  priority: 'low' | 'normal' | 'high' | 'urgent';
  tags?: string[];
  cdrrmoAssignedTo?: string;
}

export class ChatService {
  private db = getFirestore();
  private auth = getAuth();

  // =================== CHAT ROOM MANAGEMENT ===================

  async getOrCreateChatRoom(): Promise<string> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error('User must be authenticated to access chat');
    }

    try {
      // Check if user already has a chat room
      const existingRoomQuery = query(
        collection(this.db, 'chatRooms'),
        where('userId', '==', currentUser.uid),
        limit(1)
      );
      
      const existingRooms = await getDocs(existingRoomQuery);
      
      if (!existingRooms.empty) {
        console.log('Found existing chat room');
        return existingRooms.docs[0].id;
      }

      // Get user profile for room creation
      const userDoc = await getDoc(doc(this.db, 'users', currentUser.uid));
      const userData = userDoc.data();

      if (!userData) {
        throw new Error('User profile not found. Please complete your profile first.');
      }

      // Create new chat room with all required fields
      const chatRoomData: Omit<ChatRoom, 'id'> = {
        userId: currentUser.uid,
        userName: userData?.displayName || 
                 (userData?.firstName && userData?.lastName ? `${userData.firstName} ${userData.lastName}` : 'Anonymous User'),
        userEmail: currentUser.email || '',
        status: 'active',
        createdAt: serverTimestamp() as Timestamp,
        unreadCount: {
          user: 0,
          cdrrmo: 0,
        },
        priority: 'normal',
        tags: [],
      };

      console.log('Creating new chat room with data:', {
        userId: chatRoomData.userId,
        userName: chatRoomData.userName,
        userEmail: chatRoomData.userEmail,
        status: chatRoomData.status,
        priority: chatRoomData.priority
      });

      const docRef = await addDoc(collection(this.db, 'chatRooms'), chatRoomData);
      console.log('Chat room created successfully with ID:', docRef.id);
      
      // Send welcome message from CDRRMO
      await this.sendWelcomeMessage(docRef.id);
      
      return docRef.id;
    } catch (error) {
      console.error('Detailed error creating chat room:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to create chat room: ${error.message}`);
      }
      throw new Error('Failed to create chat room due to unknown error');
    }
  }

  // Send welcome message - FIXED to not include undefined attachments
  private async sendWelcomeMessage(chatRoomId: string) {
    try {
      const welcomeMessage: Omit<ChatMessage, 'id'> = {
        chatRoomId,
        senderId: 'cdrrmo_system',
        senderName: 'CDRRMO',
        senderType: 'cdrrmo',
        message: 'Hello! Welcome to LipaAlertHub support. How can we assist you today? Please feel free to ask any questions about emergency reporting, safety measures, or any concerns you may have.',
        timestamp: serverTimestamp() as Timestamp,
        status: 'sent',
      };

      await addDoc(collection(this.db, 'chatMessages'), welcomeMessage);
      
      // Update chat room with last message
      await this.updateChatRoomLastMessage(chatRoomId, welcomeMessage);
      console.log('Welcome message sent successfully');
    } catch (error) {
      console.error('Error sending welcome message:', error);
    }
  }

  // =================== MESSAGE HANDLING ===================

  // Send a message - FIXED to handle undefined attachments
  async sendMessage(message: string, attachments?: any[]): Promise<void> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error('You must be logged in to send messages');
    }

    if (!message.trim()) {
      throw new Error('Message cannot be empty');
    }

    try {
      const chatRoomId = await this.getOrCreateChatRoom();
      
      // Get user profile for sender name
      const userDoc = await getDoc(doc(this.db, 'users', currentUser.uid));
      const userData = userDoc.data();
      const senderName = userData?.displayName || 
                        (userData?.firstName && userData?.lastName ? `${userData.firstName} ${userData.lastName}` : 'User');

      // FIXED: Only include attachments if they exist and have content
      const messageData: Omit<ChatMessage, 'id'> = {
        chatRoomId,
        senderId: currentUser.uid,
        senderName,
        senderType: 'user',
        message: message.trim(),
        timestamp: serverTimestamp() as Timestamp,
        status: 'sent',
        ...(attachments && attachments.length > 0 && { attachments }),
      };

      console.log('Sending message with data:', {
        chatRoomId,
        senderId: messageData.senderId,
        senderName: messageData.senderName,
        senderType: messageData.senderType,
        messageLength: messageData.message.length,
        hasAttachments: !!(attachments && attachments.length > 0)
      });

      await addDoc(collection(this.db, 'chatMessages'), messageData);
      
      // Update chat room with last message and increment CDRRMO unread count
      await this.updateChatRoomLastMessage(chatRoomId, messageData);
      await this.incrementUnreadCount(chatRoomId, 'cdrrmo');

      // Create notification for CDRRMO
      try {
        await notificationService.createChatMessageNotification(
          'cdrrmo_system',
          chatRoomId,
          senderName,
          message,
          'user_message'
        );
      } catch (notificationError) {
        console.error('Error creating chat notification:', notificationError);
      }

      console.log('Message sent successfully');
    } catch (error) {
      console.error('Detailed error sending message:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to send message: ${error.message}`);
      }
      throw new Error('Failed to send message due to unknown error');
    }
  }

  // Get messages with real-time updates
  getChatMessages(callback: (messages: ChatMessage[]) => void): () => void {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      console.error('No authenticated user for chat messages');
      callback([]);
      return () => {};
    }

    this.getOrCreateChatRoom().then(chatRoomId => {
      const messagesQuery = query(
        collection(this.db, 'chatMessages'),
        where('chatRoomId', '==', chatRoomId),
        orderBy('timestamp', 'asc')
      );

      const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
        const messages: ChatMessage[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as ChatMessage[];
        
        console.log(`Received ${messages.length} messages from chat room ${chatRoomId}`);
        callback(messages);
        
        // Mark messages as read when user views them
        this.markMessagesAsRead(chatRoomId);
      }, (error) => {
        console.error('Error in messages listener:', error);
        if (error.code === 'permission-denied') {
          console.error('Permission denied - check Firestore security rules');
        }
        callback([]);
      });

      return unsubscribe;
    }).catch(error => {
      console.error('Error setting up messages listener:', error);
      callback([]);
    });

    return () => {};
  }

  // =================== HELPER METHODS ===================

  private async updateChatRoomLastMessage(chatRoomId: string, messageData: Omit<ChatMessage, 'id'>) {
    try {
      await updateDoc(doc(this.db, 'chatRooms', chatRoomId), {
        lastMessage: {
          message: messageData.message,
          timestamp: messageData.timestamp,
          senderId: messageData.senderId,
          senderName: messageData.senderName,
        },
      });
      console.log('Updated last message for chat room:', chatRoomId);
    } catch (error) {
      console.error('Error updating last message:', error);
    }
  }

  private async incrementUnreadCount(chatRoomId: string, userType: 'user' | 'cdrrmo') {
    try {
      const chatRoomRef = doc(this.db, 'chatRooms', chatRoomId);
      const chatRoomDoc = await getDoc(chatRoomRef);
      
      if (chatRoomDoc.exists()) {
        const currentUnreadCount = chatRoomDoc.data().unreadCount || { user: 0, cdrrmo: 0 };
        
        await updateDoc(chatRoomRef, {
          [`unreadCount.${userType}`]: currentUnreadCount[userType] + 1,
        });
        console.log(`Incremented unread count for ${userType} in chat room ${chatRoomId}`);
      }
    } catch (error) {
      console.error('Error incrementing unread count:', error);
    }
  }

  private async markMessagesAsRead(chatRoomId: string) {
    try {
      const currentUser = this.auth.currentUser;
      if (!currentUser) return;

      await updateDoc(doc(this.db, 'chatRooms', chatRoomId), {
        'unreadCount.user': 0,
      });
      console.log('Marked messages as read for chat room:', chatRoomId);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }

  async getChatRoomInfo(): Promise<ChatRoom | null> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      console.error('No authenticated user for chat room info');
      return null;
    }

    try {
      const chatRoomQuery = query(
        collection(this.db, 'chatRooms'),
        where('userId', '==', currentUser.uid),
        limit(1)
      );
      
      const chatRooms = await getDocs(chatRoomQuery);
      
      if (chatRooms.empty) {
        console.log('No chat room found for user');
        return null;
      }
      
      const chatRoom = {
        id: chatRooms.docs[0].id,
        ...chatRooms.docs[0].data(),
      } as ChatRoom;
      
      console.log('Retrieved chat room info:', chatRoom.id);
      return chatRoom;
    } catch (error) {
      console.error('Error getting chat room info:', error);
      return null;
    }
  }

  async getUnreadMessageCount(): Promise<number> {
    try {
      const chatRoom = await this.getChatRoomInfo();
      const count = chatRoom?.unreadCount?.user || 0;
      console.log('Unread message count:', count);
      return count;
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  async closeChatRoom(): Promise<void> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error('You must be logged in to close chat');
    }

    try {
      const chatRoomId = await this.getOrCreateChatRoom();
      
      await updateDoc(doc(this.db, 'chatRooms', chatRoomId), {
        status: 'closed',
      });

      // Send closing message - FIXED: No undefined attachments
      const closingMessage: Omit<ChatMessage, 'id'> = {
        chatRoomId,
        senderId: currentUser.uid,
        senderName: 'You',
        senderType: 'user',
        message: 'Chat has been closed. Thank you for contacting CDRRMO.',
        timestamp: serverTimestamp() as Timestamp,
        status: 'sent',
      };

      await addDoc(collection(this.db, 'chatMessages'), closingMessage);
      await this.updateChatRoomLastMessage(chatRoomId, closingMessage);
      
      console.log('Chat room closed successfully');
    } catch (error) {
      console.error('Error closing chat room:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to close chat: ${error.message}`);
      }
      throw new Error('Failed to close chat due to unknown error');
    }
  }

  async setChatPriority(priority: 'low' | 'normal' | 'high' | 'urgent'): Promise<void> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error('You must be logged in to set chat priority');
    }

    try {
      const chatRoomId = await this.getOrCreateChatRoom();
      
      await updateDoc(doc(this.db, 'chatRooms', chatRoomId), {
        priority,
      });
      
      console.log('Chat priority set to:', priority);
    } catch (error) {
      console.error('Error setting chat priority:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to set chat priority: ${error.message}`);
      }
      throw new Error('Failed to set chat priority due to unknown error');
    }
  }
}

export const chatService = new ChatService();