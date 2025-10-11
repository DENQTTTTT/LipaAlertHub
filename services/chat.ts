
// services/chat.ts - COMPLETELY FIXED Chat Service with Notifications
import { getAuth } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where
} from 'firebase/firestore';

import { notificationService } from './notifications';

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
  participants: string[];
  lastMessage?: string;
  lastMessageSender?: string;
  lastMessageTime?: Timestamp;
  lastUpdated: Timestamp;
  hasWelcomeMessage?: boolean;
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
   * Get or create the user's chat room - FIXED VERSION
   * Each resident has their own room: chatRooms/{userId}
   */
  async getOrCreateChatRoom(): Promise<string> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error('User must be authenticated to access chat');
    }

    try {
      const chatRoomId = currentUser.uid;
      const chatRoomRef = doc(this.db, 'chatRooms', chatRoomId);
      
      console.log('🔍 Checking chat room:', chatRoomId);
      const chatRoomDoc = await getDoc(chatRoomRef);

      if (chatRoomDoc.exists()) {
        console.log('✅ Found existing chat room');
        const roomData = chatRoomDoc.data();
        
        // Check if welcome message exists
        if (!roomData.hasWelcomeMessage) {
          console.log('⚠️ Welcome message missing, adding it...');
          await this.addWelcomeMessage(chatRoomId);
        }
        
        return chatRoomId;
      }

      // Get user profile
      console.log('📝 Creating new chat room...');
      const userDoc = await getDoc(doc(this.db, 'users', currentUser.uid));
      const userData = userDoc.data();

      if (!userData) {
        throw new Error('User profile not found. Please complete your profile first.');
      }

      // ✅ FIXED: Create chat room with proper structure for Firestore rules
      const chatRoomData: any = {
        userId: currentUser.uid,
        participants: [currentUser.uid],
        lastUpdated: serverTimestamp(),
        hasWelcomeMessage: false, // Will be set to true after welcome message
        unreadCount: {
          user: 0,
          admin: 0,
        },
      };

      console.log('💾 Saving chat room document...');
      await setDoc(chatRoomRef, chatRoomData);
      console.log('✅ Chat room created successfully');

      // Add welcome message AFTER room is created
      console.log('💬 Adding welcome message...');
      await this.addWelcomeMessage(chatRoomId);
      
      return chatRoomId;
      
    } catch (error: any) {
      console.error('❌ Error in getOrCreateChatRoom:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      throw new Error(`Failed to create chat room: ${error.message}`);
    }
  }

  /**
   * Add welcome message to chat room - SEPARATE FUNCTION
   */
  private async addWelcomeMessage(chatRoomId: string): Promise<void> {
    try {
      const welcomeMessageRef = doc(this.db, 'chatRooms', chatRoomId, 'messages', 'welcome');
      
      // Check if it already exists
      const existingWelcome = await getDoc(welcomeMessageRef);
      if (existingWelcome.exists()) {
        console.log('✅ Welcome message already exists');
        return;
      }

      // Create welcome message
      const welcomeMessage: Omit<ChatMessage, 'id'> = {
        senderId: 'system',
        senderRole: 'admin',
        content: 'Hello! Welcome to LipaAlertHub support. How can we assist you today? Please feel free to ask any questions about emergency reporting, safety measures, or any concerns you may have.',
        type: 'text',
        createdAt: serverTimestamp() as Timestamp,
      };

      console.log('💾 Creating welcome message...');
      await setDoc(welcomeMessageRef, welcomeMessage);
      console.log('✅ Welcome message created');

      // Update chat room
      const chatRoomRef = doc(this.db, 'chatRooms', chatRoomId);
      await updateDoc(chatRoomRef, {
        hasWelcomeMessage: true,
        lastMessage: 'Hello! Welcome to LipaAlertHub support. How can we assist you today?',
        lastMessageSender: 'admin',
        lastMessageTime: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        'unreadCount.user': 1, // Mark welcome message as unread for user
      });
      console.log('✅ Chat room updated with welcome message info');
      
    } catch (error: any) {
      console.error('❌ Error adding welcome message:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      // Don't throw - welcome message is not critical for functionality
    }
  }

  // =================== MESSAGE HANDLING ===================

  /**
   * Send a message from the current user - UPDATED WITH NOTIFICATIONS
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
      console.log('📤 Sending message...');
      const chatRoomId = await this.getOrCreateChatRoom();
      
      const messageData: Omit<ChatMessage, 'id'> = {
        senderId: currentUser.uid,
        senderRole: 'user',
        content: content.trim(),
        type: 'text',
        createdAt: serverTimestamp() as Timestamp,
        ...(attachments && attachments.length > 0 && { attachments }),
      };

      console.log('💾 Adding message to Firestore...');
      const messagesRef = collection(this.db, 'chatRooms', chatRoomId, 'messages');
      await addDoc(messagesRef, messageData);
      console.log('✅ Message sent successfully');
      
      // UPDATE CHAT ROOM METADATA
      console.log('🔄 Updating chat room metadata...');
      await this.updateChatRoomLastMessage(chatRoomId, messageData);
      await this.incrementUnreadCount(chatRoomId, 'admin');
      console.log('✅ Chat room metadata updated');

      // 🔥 DAGDAG: CREATE NOTIFICATION FOR ADMIN
      try {
        console.log('🔔 Creating admin notification for new message...');
        
        // Kunin ang user profile para sa pangalan
        const userDoc = await getDoc(doc(this.db, 'users', currentUser.uid));
        const userData = userDoc.data();
        const userName = userData?.name || userData?.displayName || userData?.email?.split('@')[0] || 'A resident';
        
        // Gumawa ng notification para sa admin users
        await this.notifyAllAdmins(chatRoomId, userName, content.trim(), currentUser.uid);
        
        console.log('✅ Admin notification created');
      } catch (notifError) {
        console.warn('⚠️ Failed to create admin notification:', notifError);
        // Don't throw - notification is not critical for chat functionality
      }

    } catch (error: any) {
      console.error('❌ Error sending message:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  /**
   * Notify all admin users about new chat message
   */
  private async notifyAllAdmins(
    chatRoomId: string, 
    userName: string, 
    messageContent: string, 
    senderId: string
  ): Promise<void> {
    try {
      console.log('🔔 Setting up admin notifications...');
      
      // Kunin lahat ng admin users mula sa users collection
      const usersQuery = query(
        collection(this.db, 'users'),
        where('role', 'in', ['admin', 'moderator', 'super_admin'])
      );
      
      const usersSnapshot = await getDocs(usersQuery);
      const adminUsers: string[] = [];

      usersSnapshot.forEach((doc) => {
        const userData = doc.data();
        if (userData.role && ['admin', 'moderator', 'super_admin'].includes(userData.role)) {
          adminUsers.push(doc.id);
        }
      });

      console.log(`🔔 Notifying ${adminUsers.length} admin users`);

      // Create notification for each admin
      for (const adminId of adminUsers) {
        if (adminId !== senderId) { // Don't notify if admin is the sender
          await notificationService.createChatNotification(
            adminId,
            chatRoomId,
            userName,
            messageContent,
            senderId
          );
        }
      }

      // Fallback: If no admins found, notify default admin
      if (adminUsers.length === 0) {
        console.log('⚠️ No admin users found, using fallback notification');
        await notificationService.createChatNotification(
          'cdrrmo_admin', // Default admin ID
          chatRoomId,
          userName,
          messageContent,
          senderId
        );
      }

    } catch (error) {
      console.error('❌ Error notifying admins:', error);
      // Fallback: Create notification for a default admin
      try {
        await notificationService.createChatNotification(
          'cdrrmo_admin', // Default admin ID
          chatRoomId,
          userName,
          messageContent,
          senderId
        );
      } catch (fallbackError) {
        console.warn('⚠️ Fallback admin notification also failed:', fallbackError);
      }
    }
  }

  /**
   * Subscribe to messages with real-time updates
   */
  subscribeToMessages(callback: (messages: ChatMessage[]) => void): (() => void) | null {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      console.error('❌ No authenticated user for chat messages');
      callback([]);
      return null;
    }

    let unsubscribe: (() => void) | null = null;
    
    // First, ensure chat room exists
    this.getOrCreateChatRoom()
      .then(chatRoomId => {
        console.log('👂 Setting up message listener for room:', chatRoomId);
        
        const messagesRef = collection(this.db, 'chatRooms', chatRoomId, 'messages');
        const messagesQuery = query(messagesRef, orderBy('createdAt', 'asc'));

        unsubscribe = onSnapshot(
          messagesQuery,
          (snapshot) => {
            const messages: ChatMessage[] = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
            })) as ChatMessage[];
            
            console.log(`📨 Received ${messages.length} messages`);
            callback(messages);
            
            // Mark messages as read when user views them
            if (messages.length > 0) {
              this.markUserMessagesAsRead(chatRoomId);
            }
          },
          (error) => {
            console.error('❌ Error in messages listener:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            callback([]);
          }
        );
      })
      .catch(error => {
        console.error('❌ Error setting up messages listener:', error);
        callback([]);
      });

    // Return cleanup function
    return () => {
      if (unsubscribe) {
        console.log('🔌 Unsubscribing from messages listener');
        unsubscribe();
      }
    };
  }

  // =================== HELPER METHODS ===================

  /**
   * Update chat room with last message info
   */
  private async updateChatRoomLastMessage(
    chatRoomId: string,
    messageData: Omit<ChatMessage, 'id'>
  ): Promise<void> {
    try {
      const chatRoomRef = doc(this.db, 'chatRooms', chatRoomId);
      await updateDoc(chatRoomRef, {
        lastMessage: messageData.content.substring(0, 50) + (messageData.content.length > 50 ? '...' : ''),
        lastMessageSender: messageData.senderRole,
        lastMessageTime: messageData.createdAt,
        lastUpdated: serverTimestamp(),
      });
      console.log('✅ Updated last message for chat room');
    } catch (error) {
      console.error('⚠️ Error updating last message:', error);
      // Don't throw - this is not critical
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
        console.log(`✅ Incremented unread count for ${role}`);
      }
    } catch (error) {
      console.error('⚠️ Error incrementing unread count:', error);
      // Don't throw - this is not critical
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
      console.log('✅ Marked messages as read for user');
    } catch (error) {
      console.error('⚠️ Error marking messages as read:', error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Get chat room info
   */
  async getChatRoomInfo(): Promise<ChatRoom | null> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      console.error('❌ No authenticated user for chat room info');
      return null;
    }

    try {
      const chatRoomRef = doc(this.db, 'chatRooms', currentUser.uid);
      const chatRoomDoc = await getDoc(chatRoomRef);
      
      if (!chatRoomDoc.exists()) {
        console.log('⚠️ No chat room found for user');
        return null;
      }
      
      const chatRoom = {
        id: chatRoomDoc.id,
        ...chatRoomDoc.data(),
      } as ChatRoom;
      
      console.log('✅ Retrieved chat room info');
      return chatRoom;
    } catch (error) {
      console.error('❌ Error getting chat room info:', error);
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
      console.log('📬 Unread message count:', count);
      return count;
    } catch (error) {
      console.error('❌ Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Check if chat room exists
   */
  async chatRoomExists(): Promise<boolean> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) return false;

    try {
      const chatRoomRef = doc(this.db, 'chatRooms', currentUser.uid);
      const chatRoomDoc = await getDoc(chatRoomRef);
      return chatRoomDoc.exists();
    } catch (error) {
      console.error('❌ Error checking chat room existence:', error);
      return false;
    }
  }

  /**
   * Cleanup method for component unmounting
   */
  cleanup(): void {
    // Add any cleanup logic here if needed
    console.log('🧹 Chat service cleanup completed');
  }
}

export const chatService = new ChatService();