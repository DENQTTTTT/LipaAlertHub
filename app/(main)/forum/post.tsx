// app/(main)/forum/post.tsx - With Facebook-style inline reply
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Timestamp } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import {
  createForumReply,
  ForumPost,
  ForumReply,
  getForumPost,
  getPostReplies,
  getUserLikeStatuses,
  hasUserLiked,
  subscribeToPostReplies,
  toggleLike
} from "../../../services/forum";

const PostDetail = () => {
  const params = useLocalSearchParams();
  const postId = typeof params.id === 'string' ? params.id : params.id?.[0];
  
  const [post, setPost] = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [postLiked, setPostLiked] = useState(false);
  const [replyLikeStatuses, setReplyLikeStatuses] = useState<Record<string, boolean>>({});
  const [replyingTo, setReplyingTo] = useState<ForumReply | null>(null);
  const replyInputRef = useRef<TextInput>(null);

  const loadPostData = async () => {
    try {
      setLoading(true);
      
      if (!postId) {
        router.back();
        return;
      }

      const postData = await getForumPost(postId);
      if (!postData) {
        router.back();
        return;
      }

      if (postData.status !== 'approved') {
        router.back();
        return;
      }

      setPost(postData);

      const repliesData = await getPostReplies(postId);
      setReplies(repliesData);

      const postLikeStatus = await hasUserLiked(postId, 'post');
      setPostLiked(postLikeStatus);

      if (repliesData.length > 0) {
        const replyIds = repliesData.map(r => r.id!).filter(Boolean);
        const replyLikes = await getUserLikeStatuses(replyIds, 'reply');
        setReplyLikeStatuses(replyLikes);
      }
    } catch (error) {
      console.error('Error loading post:', error);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!postId) {
      router.back();
      return;
    }

    const unsubscribe = subscribeToPostReplies(postId, async (updatedReplies) => {
      setReplies(updatedReplies);
      
      if (updatedReplies.length > 0) {
        const replyIds = updatedReplies.map(r => r.id!).filter(Boolean);
        const replyLikes = await getUserLikeStatuses(replyIds, 'reply');
        setReplyLikeStatuses(replyLikes);
      }
    });

    return () => unsubscribe();
  }, [postId]);

  useEffect(() => {
    loadPostData();
  }, [postId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPostData();
    setRefreshing(false);
  };

  const formatDate = (dateInput: Date | Timestamp | string | number | any) => {
    let dateObj: Date;
    
    try {
      if (dateInput && typeof dateInput.toDate === 'function') {
        dateObj = dateInput.toDate();
      } else if (dateInput instanceof Date) {
        dateObj = dateInput;
      } else if (dateInput) {
        dateObj = new Date(dateInput);
      } else {
        dateObj = new Date();
      }
      
      const now = new Date();
      const diffInHours = (now.getTime() - dateObj.getTime()) / (1000 * 60 * 60);
      
      if (diffInHours < 1) {
        const diffInMinutes = Math.floor(diffInHours * 60);
        return diffInMinutes <= 1 ? 'Now' : `${diffInMinutes}m ago`;
      } else if (diffInHours < 24) {
        return `${Math.floor(diffInHours)}h ago`;
      } else {
        const diffInDays = Math.floor(diffInHours / 24);
        return `${diffInDays}d ago`;
      }
    } catch (error) {
      return 'Unknown';
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'AN';
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .substring(0, 2);
  };

  const handlePostLike = async () => {
    try {
      if (!post?.id) return;
      
      const newLikeState = await toggleLike(post.id, 'post');
      setPostLiked(newLikeState);
      
      setPost(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          likesCount: newLikeState ? (prev.likesCount || 0) + 1 : Math.max(0, (prev.likesCount || 0) - 1)
        };
      });
    } catch (error) {
      console.error('Error toggling post like:', error);
    }
  };

  const handleReplyLike = async (replyId: string) => {
    try {
      const newLikeState = await toggleLike(replyId, 'reply');
      
      setReplyLikeStatuses(prev => ({
        ...prev,
        [replyId]: newLikeState
      }));
      
      setReplies(prev => prev.map(reply => {
        if (reply.id === replyId) {
          return {
            ...reply,
            likesCount: newLikeState 
              ? (reply.likesCount || 0) + 1 
              : Math.max(0, (reply.likesCount || 0) - 1)
          };
        }
        return reply;
      }));
    } catch (error) {
      console.error('Error toggling reply like:', error);
    }
  };

  const handleReplyToComment = (reply: ForumReply) => {
    setReplyingTo(reply);
    setReplyText(`@${reply.userName} `);
    setTimeout(() => {
      replyInputRef.current?.focus();
    }, 100);
  };

  const handleReplyToPost = () => {
    setReplyingTo(null);
    setReplyText("");
    setTimeout(() => {
      replyInputRef.current?.focus();
    }, 100);
  };

  const cancelReply = () => {
    setReplyingTo(null);
    setReplyText("");
    Keyboard.dismiss();
  };

  const handleSubmitReply = async () => {
    if (!replyText.trim()) {
      return;
    }

    if (!postId) {
      return;
    }

    try {
      setSubmitting(true);
      
      await createForumReply({
        postId: postId,
        content: replyText.trim()
      });
      
      setReplyText("");
      setReplyingTo(null);
      Keyboard.dismiss();
      
    } catch (error: any) {
      console.error('Error submitting reply:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const renderReply = ({ item }: { item: ForumReply }) => (
    <View style={styles.replyCard}>
      <View style={styles.replyHeader}>
        <View style={styles.replyAvatar}>
          <Text style={styles.replyAvatarText}>
            {getInitials(item.userName)}
          </Text>
        </View>
        <View style={styles.replyInfo}>
          <Text style={styles.replyUserName}>{item.userName}</Text>
          <Text style={styles.replyTime}>{formatDate(item.createdAt)}</Text>
        </View>
      </View>
      <Text style={styles.replyContent}>{item.content}</Text>
      <View style={styles.replyFooter}>
        <TouchableOpacity 
          style={styles.replyLikeButton}
          onPress={() => item.id && handleReplyLike(item.id)}
        >
          <Ionicons 
            name={replyLikeStatuses[item.id!] ? "heart" : "heart-outline"} 
            size={18} 
            color={replyLikeStatuses[item.id!] ? "#D32F2F" : "#999"} 
          />
          <Text style={[
            styles.replyLikeText,
            replyLikeStatuses[item.id!] && styles.replyLikedText
          ]}>
            {item.likesCount || 0}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.replyActionButton}
          onPress={() => handleReplyToComment(item)}
        >
          <Ionicons name="chatbubble-outline" size={16} color="#999" />
          <Text style={styles.replyActionText}>Reply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post Details</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D32F2F" />
          <Text style={styles.loadingText}>Loading post...</Text>
        </View>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post Details</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Post not found</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post Details</Text>
        <View style={styles.placeholder} />
      </View>

      <FlatList
        data={replies}
        renderItem={renderReply}
        keyExtractor={(item, index) => item.id || index.toString()}
        ListHeaderComponent={
          <View style={styles.postSection}>
            <View style={styles.postHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {getInitials(post.userName)}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{post.userName}</Text>
                <Text style={styles.postTime}>{formatDate(post.createdAt)}</Text>
              </View>
            </View>

            <Text style={styles.postTitle}>{post.title}</Text>
            <Text style={styles.postContent}>{post.content}</Text>

            {post.imageUrl && (
              <Image 
                source={{ uri: post.imageUrl }} 
                style={styles.postImage}
                resizeMode="cover"
              />
            )}

            <View style={styles.postActions}>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={handlePostLike}
              >
                <Ionicons 
                  name={postLiked ? "heart" : "heart-outline"} 
                  size={24} 
                  color={postLiked ? "#D32F2F" : "#666"} 
                />
                <Text style={[styles.actionText, postLiked && styles.likedText]}>
                  {post.likesCount || 0}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={handleReplyToPost}
              >
                <Ionicons name="chatbubble-outline" size={24} color="#666" />
                <Text style={styles.actionText}>{replies.length} Reply</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.repliesHeader}>
              <Text style={styles.repliesTitle}>
                Comments ({replies.length})
              </Text>
            </View>
          </View>
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#D32F2F']}
            tintColor="#D32F2F"
          />
        }
        ListEmptyComponent={
          <View style={styles.noReplies}>
            <Ionicons name="chatbubbles-outline" size={48} color="#ccc" />
            <Text style={styles.noRepliesText}>No comments yet</Text>
            <Text style={styles.noRepliesSubtext}>Be the first to comment!</Text>
          </View>
        }
      />

      {/* FIXED: ALWAYS VISIBLE COMMENT INPUT BOX */}
      <View style={styles.commentBoxContainer}>
        {replyingTo && (
          <View style={styles.replyingToBar}>
            <View style={styles.replyingToContent}>
              <Ionicons name="arrow-undo" size={14} color="#666" />
              <Text style={styles.replyingToText}>
                Replying to {replyingTo.userName}
              </Text>
            </View>
            <TouchableOpacity onPress={cancelReply} style={styles.closeButton}>
              <Ionicons name="close" size={20} color="#666" />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.commentInputRow}>
          <View style={styles.commentAvatar}>
            <Text style={styles.commentAvatarText}>
              {post?.userName ? getInitials(post.userName) : 'U'}
            </Text>
          </View>
          <View style={styles.commentInputWrapper}>
            <TextInput
              ref={replyInputRef}
              style={styles.commentInput}
              placeholder={replyingTo ? `Reply to ${replyingTo.userName}...` : "Write a comment..."}
              placeholderTextColor="#999"
              value={replyText}
              onChangeText={setReplyText}
              multiline
              maxLength={500}
            />
          </View>
          <TouchableOpacity 
            style={[
              styles.commentSendButton,
              (!replyText.trim() || submitting) && styles.commentSendButtonDisabled
            ]}
            onPress={handleSubmitReply}
            disabled={!replyText.trim() || submitting}
            activeOpacity={0.7}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: 20,
    paddingBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  backButton: { padding: 5 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#333', flex: 1, textAlign: 'center', marginHorizontal: 10 },
  placeholder: { width: 34 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 15, fontSize: 16, color: '#666' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, color: '#999' },
  scrollContent: { paddingBottom: 20 },
  postSection: { backgroundColor: '#fff', padding: 20, marginBottom: 10 },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#D32F2F', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 2 },
  postTime: { fontSize: 13, color: '#999' },
  postTitle: { fontSize: 22, fontWeight: '700', color: '#333', marginBottom: 12, lineHeight: 30 },
  postContent: { fontSize: 16, color: '#666', lineHeight: 24, marginBottom: 15 },
  postImage: { width: '100%', height: 250, borderRadius: 12, backgroundColor: '#f0f0f0', marginBottom: 15 },
  postActions: { flexDirection: 'row', alignItems: 'center', paddingTop: 15, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  actionButton: { flexDirection: 'row', alignItems: 'center', marginRight: 25 },
  actionText: { fontSize: 14, color: '#666', marginLeft: 6, fontWeight: '500' },
  likedText: { color: '#D32F2F' },
  repliesHeader: { marginTop: 20, marginBottom: 10 },
  repliesTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  replyCard: { backgroundColor: '#fff', padding: 15, marginHorizontal: 15, marginBottom: 10, borderRadius: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  replyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  replyAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2196F3', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  replyAvatarText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  replyInfo: { flex: 1 },
  replyUserName: { fontSize: 14, fontWeight: '600', color: '#333' },
  replyTime: { fontSize: 12, color: '#999', marginTop: 2 },
  replyContent: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 10 },
  replyFooter: { flexDirection: 'row', alignItems: 'center' },
  replyLikeButton: { flexDirection: 'row', alignItems: 'center', marginRight: 15 },
  replyLikeText: { fontSize: 13, color: '#999', marginLeft: 4, fontWeight: '500' },
  replyLikedText: { color: '#D32F2F' },
  replyActionButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  replyActionText: { fontSize: 13, color: '#999', marginLeft: 4, fontWeight: '500' },
  noReplies: { padding: 40, alignItems: 'center' },
  noRepliesText: { fontSize: 16, color: '#999', marginTop: 15, fontWeight: '600' },
  noRepliesSubtext: { fontSize: 14, color: '#ccc', marginTop: 5 },
  
  // FIXED COMMENT BOX STYLES
  commentBoxContainer: { 
    backgroundColor: '#fff', 
    borderTopWidth: 1, 
    borderTopColor: '#e0e0e0',
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  replyingToBar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 15, 
    paddingVertical: 10, 
    backgroundColor: '#f8f9fa', 
    borderBottomWidth: 1, 
    borderBottomColor: '#e9ecef' 
  },
  replyingToContent: { flexDirection: 'row', alignItems: 'center' },
  replyingToText: { fontSize: 13, color: '#666', marginLeft: 6, fontWeight: '500' },
  closeButton: { padding: 5 },
  commentInputRow: { 
    flexDirection: 'row', 
    alignItems: 'flex-end', 
    paddingHorizontal: 15, 
    paddingTop: 10,
    paddingBottom: 5,
  },
  commentAvatar: { 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    backgroundColor: '#D32F2F', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginRight: 10,
    marginBottom: 8,
  },
  commentAvatarText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  commentInputWrapper: { 
    flex: 1, 
    backgroundColor: '#f5f5f5', 
    borderRadius: 20,
    minHeight: 40,
    justifyContent: 'center',
    marginRight: 10,
  },
  commentInput: { 
    paddingHorizontal: 15, 
    paddingVertical: 10,
    fontSize: 15, 
    color: '#333', 
    maxHeight: 100,
    minHeight: 40,
  },
  commentSendButton: { 
    backgroundColor: '#D32F2F', 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    justifyContent: 'center', 
    alignItems: 'center',
    marginBottom: 8,
  },
  commentSendButtonDisabled: { backgroundColor: '#ccc' },
});

export default PostDetail;