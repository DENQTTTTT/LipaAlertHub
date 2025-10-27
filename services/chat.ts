import { getAuth } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';

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
    size: number;
  }[];
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  fileUrl?: string;
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
  private storage = getStorage();

  // =================== CHAT ROOM MANAGEMENT ===================

  /**
   * Get or create the user's chat room
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

      // Create chat room with proper structure
      const chatRoomData: any = {
        userId: currentUser.uid,
        participants: [currentUser.uid],
        lastUpdated: serverTimestamp(),
        hasWelcomeMessage: false,
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
   * Add welcome message to chat room
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
        'unreadCount.user': 1,
      });
      console.log('✅ Chat room updated with welcome message info');
      
    } catch (error: any) {
      console.error('❌ Error adding welcome message:', error);
      // Don't throw - welcome message is not critical for functionality
    }
  }

  // =================== MESSAGE HANDLING ===================

  /**
   * Send a text message from the current user
   */
  async sendUserMessage(content: string): Promise<void> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error('You must be logged in to send messages');
    }

    if (!content.trim()) {
      throw new Error('Message cannot be empty');
    }

    try {
      console.log('📤 Sending text message...');
      const chatRoomId = await this.getOrCreateChatRoom();
      
      const messageData: Omit<ChatMessage, 'id'> = {
        senderId: currentUser.uid,
        senderRole: 'user',
        content: content.trim(),
        type: 'text',
        createdAt: serverTimestamp() as Timestamp,
      };

      console.log('💾 Adding message to Firestore...');
      const messagesRef = collection(this.db, 'chatRooms', chatRoomId, 'messages');
      await addDoc(messagesRef, messageData);
      console.log('✅ Text message sent successfully');
      
      // Update chat room with last message
      await this.updateChatRoomLastMessage(chatRoomId, messageData);
      await this.incrementUnreadCount(chatRoomId, 'admin');
      console.log('✅ Chat room metadata updated');

    } catch (error: any) {
      console.error('❌ Error sending message:', error);
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  /**
   * Upload file and send file message
   */
  async sendFileMessage(file: { uri: string; name: string; type: string; size: number }, content?: string): Promise<void> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error('You must be logged in to send files');
    }

    try {
      console.log('📤 Uploading file...', file);
      
      // Validate file size (15MB limit)
      const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File size exceeds 15MB limit. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
      }

      const chatRoomId = await this.getOrCreateChatRoom();
      
      // Upload file to Firebase Storage
      console.log('📁 Uploading file to storage...');
      const fileRef = ref(this.storage, `chat-files/${chatRoomId}/${Date.now()}_${file.name}`);
      
      // Convert file URI to blob
      const response = await fetch(file.uri);
      const blob = await response.blob();
      
      const uploadResult = await uploadBytes(fileRef, blob);
      const downloadURL = await getDownloadURL(uploadResult.ref);
      console.log('✅ File uploaded successfully:', downloadURL);

      // Create file message
      const messageData: Omit<ChatMessage, 'id'> = {
        senderId: currentUser.uid,
        senderRole: 'user',
        content: content || '',
        type: 'file',
        createdAt: serverTimestamp() as Timestamp,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileUrl: downloadURL,
      };

      console.log('💾 Adding file message to Firestore...');
      const messagesRef = collection(this.db, 'chatRooms', chatRoomId, 'messages');
      await addDoc(messagesRef, messageData);
      console.log('✅ File message sent successfully');
      
      // Update chat room with last message
      const lastMessageText = content ? `${file.name}: ${content}` : `Sent ${file.name}`;
      await this.updateChatRoomLastMessage(chatRoomId, { ...messageData, content: lastMessageText });
      await this.incrementUnreadCount(chatRoomId, 'admin');
      console.log('✅ Chat room metadata updated');

    } catch (error: any) {
      console.error('❌ Error sending file message:', error);
      throw new Error(`Failed to send file: ${error.message}`);
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
      
      let lastMessage = messageData.content;
      if (messageData.type === 'file') {
        lastMessage = messageData.fileName ? `📎 ${messageData.fileName}` : '📎 File';
        if (messageData.content) {
          lastMessage += `: ${messageData.content}`;
        }
      }
      
      await updateDoc(chatRoomRef, {
        lastMessage: lastMessage.substring(0, 50) + (lastMessage.length > 50 ? '...' : ''),
        lastMessageSender: messageData.senderRole,
        lastMessageTime: messageData.createdAt,
        lastUpdated: serverTimestamp(),
      });
      console.log('✅ Updated last message for chat room');
    } catch (error) {
      console.error('⚠️ Error updating last message:', error);
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
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get file icon based on file type
   */
  getFileIcon(fileType: string): string {
    if (fileType.startsWith('image/')) {
      return 'image';
    } else if (fileType.includes('pdf')) {
      return 'document';
    } else if (fileType.includes('word') || fileType.includes('document')) {
      return 'document-text';
    } else if (fileType.includes('excel') || fileType.includes('spreadsheet')) {
      return 'document';
    } else if (fileType.includes('zip') || fileType.includes('compressed')) {
      return 'archive';
    } else {
      return 'document';
    }
  }
}

export const chatService = new ChatService();