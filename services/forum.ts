// services/forum.ts - Merged with proper Firebase integration
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { notificationService } from 'services/notifications';
import { auth, db } from './firebase';

// Updated interfa  ces with approval system
export interface ForumPost {
  id?: string;
  userId: string;
  userName: string;
  title: string;
  content: string;
  imageUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  likesCount: number;
  repliesCount: number;
  reviewedBy?: string;
  reviewedAt?: Timestamp;
}

export interface ForumReply {
  id?: string;
  postId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: Timestamp | Date;
  likesCount: number;
}

export interface PostLike {
  id?: string;
  postId: string;
  userId: string;
  type: 'post' | 'reply';
  targetId: string;
  createdAt: Timestamp;
}

// Upload image for forum post
export const uploadForumImage = async (uri: string): Promise<string> => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const storage = getStorage();
    const timestamp = Date.now();
    const imageRef = ref(storage, `forum_images/${user.uid}_${timestamp}.jpg`);
    
    const response = await fetch(uri);
    const blob = await response.blob();
    
    await uploadBytes(imageRef, blob, {
      contentType: "image/jpeg",
      customMetadata: {
        userId: user.uid
      }
    });
    
    const downloadURL = await getDownloadURL(imageRef);
    return downloadURL;
  } catch (error) {
    console.error("Upload error:", error);
    throw error;
  }
};

// Create a new forum post (pending approval)
export const createForumPost = async (postData: {
  title: string;
  content: string;
  imageUri?: string;
}): Promise<ForumPost> => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    let imageUrl;
    if (postData.imageUri) {
      imageUrl = await uploadForumImage(postData.imageUri);
    }

    // Create post object without undefined values
    const post: Omit<ForumPost, 'id'> = {
      userId: user.uid,
      userName: user.displayName || user.email?.split('@')[0] || 'Anonymous User',
      title: postData.title,
      content: postData.content,
      status: 'pending',
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
      likesCount: 0,
      repliesCount: 0,
    };

    // Only add imageUrl if it exists
    if (imageUrl) {
      (post as any).imageUrl = imageUrl;
    }

    const docRef = await addDoc(collection(db, 'forumPosts'), post);
    
    // Create notification for post submission (only if notificationService exists)
    try {
      if (notificationService && notificationService.createForumPostSubmittedNotification) {
        await notificationService.createForumPostSubmittedNotification(
          user.uid,
          docRef.id,
          postData.title
        );
      }
    } catch (notifError) {
      console.warn('Notification service not available:', notifError);
    }
    
    return { ...post, id: docRef.id, imageUrl };
  } catch (error) {
    console.error('Error creating forum post:', error);
    throw error;
  }
};

// Get approved forum posts only
export const getForumPosts = async (): Promise<ForumPost[]> => {
  try {
    const postsQuery = query(
      collection(db, 'forumPosts'),
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(postsQuery);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        // Convert Firestore timestamps to Date objects
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      };
    }) as ForumPost[];
  } catch (error) {
    console.error('Error getting forum posts:', error);
    throw error;
  }
};

// Get all forum posts for admin
export const getAllForumPostsForAdmin = async (): Promise<ForumPost[]> => {
  try {
    const postsQuery = query(
      collection(db, 'forumPosts'),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(postsQuery);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      };
    }) as ForumPost[];
  } catch (error) {
    console.error('Error getting all forum posts:', error);
    throw error;
  }
};

// Get pending posts for admin review
export const getPendingForumPosts = async (): Promise<ForumPost[]> => {
  try {
    const postsQuery = query(
      collection(db, 'forumPosts'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(postsQuery);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      };
    }) as ForumPost[];
  } catch (error) {
    console.error('Error getting pending forum posts:', error);
    throw error;
  }
};

// Admin function to approve a post
export const approveForumPost = async (postId: string): Promise<void> => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // Get the post first to get user info
    const post = await getForumPost(postId);
    if (!post) throw new Error('Post not found');

    await updateDoc(doc(db, 'forumPosts', postId), {
      status: 'approved',
      reviewedBy: user.uid,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Create notification for post approval (only if notificationService exists)
    try {
      if (notificationService && notificationService.createForumPostApprovedNotification) {
        await notificationService.createForumPostApprovedNotification(
          post.userId,
          postId,
          post.title
        );
      }
    } catch (notifError) {
      console.warn('Notification service not available:', notifError);
    }
  } catch (error) {
    console.error('Error approving forum post:', error);
    throw error;
  }
};

// Admin function to reject a post
export const rejectForumPost = async (postId: string, reason: string): Promise<void> => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // Get the post first to get user info
    const post = await getForumPost(postId);
    if (!post) throw new Error('Post not found');

    await updateDoc(doc(db, 'forumPosts', postId), {
      status: 'rejected',
      rejectionReason: reason,
      reviewedBy: user.uid,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Create notification for post rejection (only if notificationService exists)
    try {
      if (notificationService && notificationService.createForumPostRejectedNotification) {
        await notificationService.createForumPostRejectedNotification(
          post.userId,
          postId,
          post.title,
          reason
        );
      }
    } catch (notifError) {
      console.warn('Notification service not available:', notifError);
    }
  } catch (error) {
    console.error('Error rejecting forum post:', error);
    throw error;
  }
};

// Get a single forum post
export const getForumPost = async (postId: string): Promise<ForumPost | null> => {
  try {
    const docRef = doc(db, 'forumPosts', postId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return { 
        id: docSnap.id, 
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      } as ForumPost;
    }
    return null;
  } catch (error) {
    console.error('Error getting forum post:', error);
    throw error;
  }
};

// Subscribe to approved forum posts with real-time updates
export const subscribeToForumPosts = (
  callback: (posts: ForumPost[]) => void
) => {
  const postsQuery = query(
    collection(db, 'forumPosts'),
    where('status', '==', 'approved'),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(postsQuery, (snapshot) => {
    const posts = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      };
    }) as ForumPost[];
    callback(posts);
  });
};

// Subscribe to pending posts for admin
export const subscribeToPendingPosts = (
  callback: (posts: ForumPost[]) => void
) => {
  const postsQuery = query(
    collection(db, 'forumPosts'),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(postsQuery, (snapshot) => {
    const posts = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      };
    }) as ForumPost[];
    callback(posts);
  });
};

// Create a reply to a forum post
export const createForumReply = async (replyData: {
  postId: string;
  content: string;
}): Promise<ForumReply> => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // Check if the post exists and is approved
    const post = await getForumPost(replyData.postId);
    if (!post) throw new Error('Post not found');
    if (post.status !== 'approved') throw new Error('Cannot reply to unapproved post');

    const batch = writeBatch(db);

    // Create the reply
    const replyRef = doc(collection(db, 'forumReplies'));
    const reply: Omit<ForumReply, 'id'> = {
      postId: replyData.postId,
      userId: user.uid,
      userName: user.displayName || user.email?.split('@')[0] || 'Anonymous User',
      content: replyData.content,
      createdAt: serverTimestamp() as Timestamp,
      likesCount: 0,
    };
    batch.set(replyRef, reply);

    // Increment replies count on the post
    const postRef = doc(db, 'forumPosts', replyData.postId);
    batch.update(postRef, {
      repliesCount: increment(1),
      updatedAt: serverTimestamp()
    });

    await batch.commit();

    // Create notification for the post author (only if notificationService exists)
    try {
      if (post.userId !== user.uid && notificationService && notificationService.createForumReplyNotification) {
        await notificationService.createForumReplyNotification(
          post.userId,
          replyData.postId,
          post.title,
          user.displayName || 'Anonymous User',
          replyData.content
        );
      }
    } catch (notifError) {
      console.warn('Notification service not available:', notifError);
    }

    return { ...reply, id: replyRef.id };
  } catch (error) {
    console.error('Error creating forum reply:', error);
    throw error;
  }
};

// Get replies for a post
export const getPostReplies = async (postId: string): Promise<ForumReply[]> => {
  try {
    const repliesQuery = query(
      collection(db, 'forumReplies'),
      where('postId', '==', postId),
      orderBy('createdAt', 'asc')
    );
    
    const snapshot = await getDocs(repliesQuery);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
      };
    }) as ForumReply[];
  } catch (error) {
    console.error('Error getting post replies:', error);
    throw error;
  }
};

// Subscribe to replies for a post
export const subscribeToPostReplies = (
  postId: string,
  callback: (replies: ForumReply[]) => void
) => {
  const repliesQuery = query(
    collection(db, 'forumReplies'),
    where('postId', '==', postId),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(repliesQuery, (snapshot) => {
    const replies = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
      };
    }) as ForumReply[];
    callback(replies);
  });
};

// Toggle like on approved post or reply
export const toggleLike = async (targetId: string, type: 'post' | 'reply'): Promise<boolean> => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // For posts, check if it's approved
    if (type === 'post') {
      const post = await getForumPost(targetId);
      if (!post || post.status !== 'approved') {
        throw new Error('Cannot like unapproved post');
      }
    }

    const likesQuery = query(
      collection(db, 'postLikes'),
      where('targetId', '==', targetId),
      where('userId', '==', user.uid),
      where('type', '==', type)
    );

    const snapshot = await getDocs(likesQuery);
    const batch = writeBatch(db);

    if (snapshot.empty) {
      // Add like
      const likeRef = doc(collection(db, 'postLikes'));
      const like: Omit<PostLike, 'id'> = {
        postId: type === 'post' ? targetId : '',
        userId: user.uid,
        type,
        targetId,
        createdAt: serverTimestamp() as Timestamp,
      };

      // For replies, get the postId
      if (type === 'reply') {
        const replyDoc = await getDoc(doc(db, 'forumReplies', targetId));
        if (replyDoc.exists()) {
          like.postId = replyDoc.data().postId;
        }
      }

      batch.set(likeRef, like);

      // Increment like count
      const targetRef = doc(db, type === 'post' ? 'forumPosts' : 'forumReplies', targetId);
      batch.update(targetRef, {
        likesCount: increment(1)
      });

      await batch.commit();

      // Create notifications for likes (only if notificationService exists)
      try {
        if (notificationService) {
          if (type === 'post') {
            const post = await getForumPost(targetId);
            if (post && post.userId !== user.uid && notificationService.createForumPostLikeNotification) {
              await notificationService.createForumPostLikeNotification(
                post.userId,
                targetId,
                post.title,
                user.displayName || 'Anonymous User'
              );
            }
          } else {
            const replyDoc = await getDoc(doc(db, 'forumReplies', targetId));
            if (replyDoc.exists()) {
              const replyData = replyDoc.data();
              if (replyData.userId !== user.uid) {
                const post = await getForumPost(replyData.postId);
                if (post && notificationService.createForumReplyLikeNotification) {
                  await notificationService.createForumReplyLikeNotification(
                    replyData.userId,
                    replyData.postId,
                    targetId,
                    post.title,
                    user.displayName || 'Anonymous User'
                  );
                }
              }
            }
          }
        }
      } catch (notifError) {
        console.warn('Notification service not available:', notifError);
      }

      return true; // Liked
    } else {
      // Remove like
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      // Decrement like count
      const targetRef = doc(db, type === 'post' ? 'forumPosts' : 'forumReplies', targetId);
      batch.update(targetRef, {
        likesCount: increment(-1)
      });

      await batch.commit();
      return false; // Unliked
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    throw error;
  }
};

// Check if user has liked a post/reply
export const hasUserLiked = async (targetId: string, type: 'post' | 'reply'): Promise<boolean> => {
  try {
    const user = auth.currentUser;
    if (!user) return false;

    const likesQuery = query(
      collection(db, 'postLikes'),
      where('targetId', '==', targetId),
      where('userId', '==', user.uid),
      where('type', '==', type)
    );

    const snapshot = await getDocs(likesQuery);
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking like status:', error);
    return false;
  }
};

// Get user's like status for multiple items
// Fixed getUserLikeStatuses function in services/forum.ts
export const getUserLikeStatuses = async (
  targetIds: string[],
  type: 'post' | 'reply'
): Promise<Record<string, boolean>> => {
  try {
    const user = auth.currentUser;
    if (!user) return {};

    // Fix: Return empty object if no targetIds provided
    if (!targetIds || targetIds.length === 0) {
      return {};
    }

    // Filter out any undefined/null values and ensure we have valid IDs
    const validTargetIds = targetIds.filter(id => id && id.trim() !== '');
    if (validTargetIds.length === 0) {
      return {};
    }

    const likesQuery = query(
      collection(db, 'postLikes'),
      where('targetId', 'in', validTargetIds),
      where('userId', '==', user.uid),
      where('type', '==', type)
    );

    const snapshot = await getDocs(likesQuery);
    const likeStatuses: Record<string, boolean> = {};
    
    // Initialize all as false
    validTargetIds.forEach(id => {
      likeStatuses[id] = false;
    });
    
    // Set liked ones to true
    snapshot.docs.forEach(doc => {
      const data = doc.data() as PostLike;
      likeStatuses[data.targetId] = true;
    });

    return likeStatuses;
  } catch (error) {
    console.error('Error getting like statuses:', error);
    return {};
  }
};

// Get user's own posts (all statuses)
export const getUserForumPosts = async (userId: string): Promise<ForumPost[]> => {
  try {
    const postsQuery = query(
      collection(db, 'forumPosts'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(postsQuery);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      };
    }) as ForumPost[];
  } catch (error) {
    console.error('Error getting user forum posts:', error);
    throw error;
  }
};

// Get user's replies
export const getUserForumReplies = async (userId: string): Promise<ForumReply[]> => {
  try {
    const repliesQuery = query(
      collection(db, 'forumReplies'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(repliesQuery);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
      };
    }) as ForumReply[];
  } catch (error) {
    console.error('Error getting user forum replies:', error);
    throw error;
  }
};