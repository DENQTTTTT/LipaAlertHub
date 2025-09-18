// services/chat.ts - Clean User-to-Admin Chat Service (No Duplicates)
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
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

export interface ChatMessage {
  id?: string;
  senderId: string;
  senderRole: 'user' | 'admin' | 'moderator' | 'rescuer' | 'agency';
  content: string;
  type: 'text' | 'image' | 'file';
  createdAt: Timestamp;
  attachments?: {
    type: 'image' | 'file';
    url: string;
    name: string;
  }[];
}

export interface ChatRoom {
  id?: string;
  userId: string;
  participants: string[]; // ['user', 'admin']
  lastMessage?: string;
  lastMessageSender?: string;
  lastMessageTime?: Timestamp;
  lastUpdated: Timestamp;
  hasWelcomeMessage?: boolean; // Track if welcome message was sent
  unreadCount?: {
    user: number;
    admin: number;
  };
}

export class ChatService {
  private db = getFirestore();
  private auth = getAuth();

  // =================== CHAT ROOM MANAGEMENT ===================

  /**
   * Get or create the user's chat room
   * Each user has only one chat room: chatRooms/{userId}
   */
  async getOrCreateChatRoom(): Promise<string> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error('User must be authenticated to access chat');
    }

    try {
      const chatRoomId = currentUser.uid;
      const chatRoomRef = doc(this.db, 'chatRooms', chatRoomId);
      const chatRoomDoc = await getDoc(chatRoomRef);

      if (chatRoomDoc.exists()) {
        const roomData = chatRoomDoc.data();
        console.log('Found existing chat room:', chatRoomId);
        
        // Check if welcome message exists and send it if it doesn't
        if (!roomData.hasWelcomeMessage) {
          await this.ensureWelcomeMessage(chatRoomId);
        }
        
        return chatRoomId;
      }

      // Get user profile for room creation
      const userDoc = await getDoc(doc(this.db, 'users', currentUser.uid));
      const userData = userDoc.data();

      if (!userData) {
        throw new Error('User profile not found. Please complete your profile first.');
      }

      // Create new chat room
      const chatRoomData: Omit<ChatRoom, 'id'> = {
        userId: currentUser.uid,
        participants: ['user', 'admin'],
        lastUpdated: serverTimestamp() as Timestamp,
        hasWelcomeMessage: false, // Initially false
        unreadCount: {
          user: 0,
          admin: 0,
        },
      };

      console.log('Creating new chat room:', chatRoomId);
      await setDoc(chatRoomRef, chatRoomData);
      
      // Send welcome message for new chat room
      await this.sendWelcomeMessage(chatRoomId);
      
      return chatRoomId;
    } catch (error) {
      console.error('Error creating chat room:', error);
      throw new Error(`Failed to create chat room: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Ensure welcome message exists (for existing rooms that might not have it)
   */
  private async ensureWelcomeMessage(chatRoomId: string): Promise<void> {
    try {
      // Check if any system messages exist
      const messagesRef = collection(this.db, 'chatRooms', chatRoomId, 'messages');
      const systemMessagesQuery = query(
        messagesRef, 
        where('senderId', '==', 'system'),
        limit(1)
      );
      
      const systemMessages = await getDocs(systemMessagesQuery);
      
      if (systemMessages.empty) {
        console.log('No welcome message found, sending one...');
        await this.sendWelcomeMessage(chatRoomId);
      } else {
        // Mark that welcome message exists
        const chatRoomRef = doc(this.db, 'chatRooms', chatRoomId);
        await updateDoc(chatRoomRef, {
          hasWelcomeMessage: true,
        });
        console.log('Welcome message already exists');
      }
    } catch (error) {
      console.error('Error ensuring welcome message:', error);
    }
  }

  /**
   * Send welcome message from admin (only once)
   */
  private async sendWelcomeMessage(chatRoomId: string): Promise<void> {
    try {
      // Use a fixed document ID to prevent duplicates
      const welcomeMessageRef = doc(this.db, 'chatRooms', chatRoomId, 'messages', 'welcome');
      
      const welcomeMessage: Omit<ChatMessage, 'id'> = {
        senderId: 'system',
        senderRole: 'admin',
        content: 'Hello! Welcome to LipaAlertHub support. How can we assist you today? Please feel free to ask any questions about emergency reporting, safety measures, or any concerns you may have.',
        type: 'text',
        createdAt: serverTimestamp() as Timestamp,
      };

      // Use setDoc instead of addDoc to prevent duplicates
      await setDoc(welcomeMessageRef, welcomeMessage);
      
      // Update chat room with last message and mark welcome message as sent
      await this.updateChatRoomLastMessage(chatRoomId, welcomeMessage);
      
      const chatRoomRef = doc(this.db, 'chatRooms', chatRoomId);
      await updateDoc(chatRoomRef, {
        hasWelcomeMessage: true,
      });
      
      console.log('Welcome message sent successfully');
    } catch (error) {
      console.error('Error sending welcome message:', error);
    }
  }

  // =================== MESSAGE HANDLING ===================

  /**
   * Send a message from the current user
   */
  async sendUserMessage(content: string, attachments?: any[]): Promise<void> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error('You must be logged in to send messages');
    }

    if (!content.trim()) {
      throw new Error('Message cannot be empty');
    }

    try {
      const chatRoomId = await this.getOrCreateChatRoom();
      
      const messageData: Omit<ChatMessage, 'id'> = {
        senderId: currentUser.uid,
        senderRole: 'user',
        content: content.trim(),
        type: 'text',
        createdAt: serverTimestamp() as Timestamp,
        ...(attachments && attachments.length > 0 && { attachments }),
      };

      console.log('Sending user message:', {
        chatRoomId,
        contentLength: content.length,
        hasAttachments: !!(attachments && attachments.length > 0)
      });

      // Add message to subcollection
      const messagesRef = collection(this.db, 'chatRooms', chatRoomId, 'messages');
      await addDoc(messagesRef, messageData);
      
      // Update chat room with last message and increment admin unread count
      await this.updateChatRoomLastMessage(chatRoomId, messageData);
      await this.incrementUnreadCount(chatRoomId, 'admin');

      console.log('User message sent successfully');
    } catch (error) {
      console.error('Error sending user message:', error);
      throw new Error(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get messages with real-time updates
   */
  subscribeToMessages(callback: (messages: ChatMessage[]) => void): (() => void) | null {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      console.error('No authenticated user for chat messages');
      callback([]);
      return null;
    }

    let unsubscribe: (() => void) | null = null;
    
    this.getOrCreateChatRoom().then(chatRoomId => {
      const messagesRef = collection(this.db, 'chatRooms', chatRoomId, 'messages');
      const messagesQuery = query(messagesRef, orderBy('createdAt', 'asc'));

      unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
        const messages: ChatMessage[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as ChatMessage[];
        
        console.log(`Received ${messages.length} messages from chat room ${chatRoomId}`);
        callback(messages);
        
        // Mark messages as read when user views them
        this.markUserMessagesAsRead(chatRoomId);
      }, (error) => {
        console.error('Error in messages listener:', error);
        callback([]);
      });
    }).catch(error => {
      console.error('Error setting up messages listener:', error);
      callback([]);
    });

    // Return a function that will unsubscribe once the listener is set up
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }

  // =================== HELPER METHODS ===================

  /**
   * Update chat room with last message info
   */
  private async updateChatRoomLastMessage(chatRoomId: string, messageData: Omit<ChatMessage, 'id'>): Promise<void> {
    try {
      const chatRoomRef = doc(this.db, 'chatRooms', chatRoomId);
      await updateDoc(chatRoomRef, {
        lastMessage: messageData.content,
        lastMessageSender: messageData.senderRole,
        lastMessageTime: messageData.createdAt,
        lastUpdated: serverTimestamp(),
      });
      console.log('Updated last message for chat room:', chatRoomId);
    } catch (error) {
      console.error('Error updating last message:', error);
    }
  }

  /**
   * Increment unread count for specified role
   */
  private async incrementUnreadCount(chatRoomId: string, role: 'user' | 'admin'): Promise<void> {
    try {
      const chatRoomRef = doc(this.db, 'chatRooms', chatRoomId);
      const chatRoomDoc = await getDoc(chatRoomRef);
      
      if (chatRoomDoc.exists()) {
        const currentUnreadCount = chatRoomDoc.data().unreadCount || { user: 0, admin: 0 };
        
        await updateDoc(chatRoomRef, {
          [`unreadCount.${role}`]: currentUnreadCount[role] + 1,
        });
        console.log(`Incremented unread count for ${role} in chat room ${chatRoomId}`);
      }
    } catch (error) {
      console.error('Error incrementing unread count:', error);
    }
  }

  /**
   * Mark messages as read for current user
   */
  private async markUserMessagesAsRead(chatRoomId: string): Promise<void> {
    try {
      const chatRoomRef = doc(this.db, 'chatRooms', chatRoomId);
      await updateDoc(chatRoomRef, {
        'unreadCount.user': 0,
      });
      console.log('Marked messages as read for user in chat room:', chatRoomId);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }

  /**
   * Get chat room info
   */
  async getChatRoomInfo(): Promise<ChatRoom | null> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      console.error('No authenticated user for chat room info');
      return null;
    }

    try {
      const chatRoomRef = doc(this.db, 'chatRooms', currentUser.uid);
      const chatRoomDoc = await getDoc(chatRoomRef);
      
      if (!chatRoomDoc.exists()) {
        console.log('No chat room found for user');
        return null;
      }
      
      const chatRoom = {
        id: chatRoomDoc.id,
        ...chatRoomDoc.data(),
      } as ChatRoom;
      
      console.log('Retrieved chat room info:', chatRoom.id);
      return chatRoom;
    } catch (error) {
      console.error('Error getting chat room info:', error);
      return null;
    }
  }

  /**
   * Get unread message count for current user
   */
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
}

export const chatService = new ChatService();