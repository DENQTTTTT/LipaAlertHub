// Fixed app/(main)/forum/post.tsx with better image handling and like status updates
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import {
  ForumPost,
  ForumReply,
  createForumReply,
  getForumPost,
  getUserLikeStatuses,
  subscribeToPostReplies,
  toggleLike
} from "../../../services/forum";

const PostDetail = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<ForumPost | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [likeStatuses, setLikeStatuses] = useState<Record<string, boolean>>({});
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!id) return;

    loadPost();
    
    // Subscribe to replies
    const unsubscribe = subscribeToPostReplies(id, (updatedReplies) => {
      setReplies(updatedReplies);
      // Fix: Only update like statuses if we have valid IDs
      const replyIds = updatedReplies.map(r => r.id!).filter(Boolean);
      if (replyIds.length > 0) {
        updateLikeStatuses([id, ...replyIds]);
      } else {
        updateLikeStatuses([id]);
      }
    });

    return unsubscribe;
  }, [id]);

  const loadPost = async () => {
    try {
      const postData = await getForumPost(id!);
      setPost(postData);
      
      // Initialize like status for the post
      if (postData) {
        updateLikeStatuses([id!]);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading post:', error);
      Alert.alert('Error', 'Failed to load post');
      setLoading(false);
    }
  };

  const updateLikeStatuses = async (targetIds: string[]) => {
    try {
      // Fix: Separate post and reply IDs properly
      const postId = targetIds[0];
      const replyIds = targetIds.slice(1);
      
      let combinedStatuses: Record<string, boolean> = {};
      
      // Get post like status
      if (postId) {
        const postStatuses = await getUserLikeStatuses([postId], 'post');
        combinedStatuses = { ...combinedStatuses, ...postStatuses };
      }
      
      // Get reply like statuses
      if (replyIds.length > 0) {
        const replyStatuses = await getUserLikeStatuses(replyIds, 'reply');
        combinedStatuses = { ...combinedStatuses, ...replyStatuses };
      }
      
      setLikeStatuses(combinedStatuses);
    } catch (error) {
      console.error('Error updating like statuses:', error);
    }
  };

  const handleLike = async (targetId: string, type: 'post' | 'reply') => {
    try {
      const isLiked = await toggleLike(targetId, type);
      
      // Update local state immediately for better UX
      setLikeStatuses(prev => ({
        ...prev,
        [targetId]: isLiked
      }));

      // Update counts locally
      if (type === 'post' && post) {
        setPost(prev => prev ? {
          ...prev,
          likesCount: isLiked ? prev.likesCount + 1 : prev.likesCount - 1
        } : null);
      } else {
        setReplies(prev => prev.map(reply => 
          reply.id === targetId 
            ? { ...reply, likesCount: isLiked ? reply.likesCount + 1 : reply.likesCount - 1 }
            : reply
        ));
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handleSubmitReply = async () => {
    if (!replyText.trim()) {
      Alert.alert('Empty Reply', 'Please enter your reply.');
      return;
    }

    if (!id) return;

    setIsSubmittingReply(true);
    
    try {
      await createForumReply({
        postId: id,
        content: replyText.trim(),
      });

      setReplyText("");
      
      // Scroll to bottom to show new reply
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      
    } catch (error) {
      console.error('Error creating reply:', error);
      Alert.alert('Error', 'Failed to post reply. Please try again.');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Now';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(diffInHours * 60);
      return diffInMinutes <= 1 ? 'Now' : `${diffInMinutes}m`;
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays}d`;
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .substring(0, 2);
  };

  const renderReply = ({ item }: { item: ForumReply }) => (
    <View style={styles.replyCard}>
      <View style={styles.replyHeader}>
        <View style={styles.avatarContainer}>
          <View style={styles.replyAvatar}>
            <Text style={styles.avatarText}>
              {getInitials(item.userName)}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.replyUserName}>{item.userName}</Text>
            <Text style={styles.replyTime}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>
      </View>
      
      <View style={styles.replyContent}>
        <Text style={styles.replyText}>{item.content}</Text>
      </View>

      <View style={styles.replyFooter}>
        <TouchableOpacity
          style={styles.likeButton}
          onPress={() => handleLike(item.id!, 'reply')}
        >
          <Ionicons 
            name={likeStatuses[item.id!] ? "heart" : "heart-outline"} 
            size={16} 
            color={likeStatuses[item.id!] ? "#e74c3c" : "#999"} 
          />
          <Text style={[
            styles.likeText,
            likeStatuses[item.id!] && { color: "#e74c3c" }
          ]}>
            {item.likesCount || 0}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading || !post) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e74c3c" />
          <Text style={styles.loadingText}>Loading post...</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post</Text>
        <View style={styles.placeholder} />
      </View>

      <FlatList
        ref={flatListRef}
        data={replies}
        renderItem={renderReply}
        keyExtractor={(item) => item.id!}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Main Post */}
            <View style={styles.mainPostCard}>
              <View style={styles.postHeader}>
                <View style={styles.avatarContainer}>
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
              </View>

              <View style={styles.postContent}>
                <Text style={styles.postTitle}>{post.title}</Text>
                <Text style={styles.postText}>{post.content}</Text>
                
                {/* Fixed image rendering with error handling */}
                {post.imageUrl && (
                  <Image 
                    source={{ uri: post.imageUrl }} 
                    style={styles.postImage}
                    resizeMode="cover"
                    onError={(error) => {
                      console.log('Image load error:', error);
                      console.log('Image URL:', post.imageUrl);
                    }}
                    onLoad={() => {
                      console.log('Image loaded successfully:', post.imageUrl);
                    }}
                  />
                )}
              </View>

              <View style={styles.postFooter}>
                <View style={styles.postStats}>
                  <TouchableOpacity
                    style={styles.likeButton}
                    onPress={() => handleLike(post.id!, 'post')}
                  >
                    <Ionicons 
                      name={likeStatuses[post.id!] ? "heart" : "heart-outline"} 
                      size={20} 
                      color={likeStatuses[post.id!] ? "#e74c3c" : "#999"} 
                    />
                    <Text style={[
                      styles.statText,
                      likeStatuses[post.id!] && { color: "#e74c3c" }
                    ]}>
                      {post.likesCount || 0}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.statItem}>
                    <Ionicons name="chatbubble-outline" size={18} color="#999" />
                    <Text style={styles.statText}>{replies.length} Replies</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Replies Header */}
            <View style={styles.repliesHeader}>
              <Text style={styles.repliesTitle}>Replies ({replies.length})</Text>
            </View>
          </>
        }
        contentContainerStyle={styles.listContainer}
      />

      {/* Reply Input */}
      <View style={styles.replyInputContainer}>
        <TextInput
          style={styles.replyInput}
          placeholder="Write your reply"
          value={replyText}
          onChangeText={setReplyText}
          placeholderTextColor="#999"
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendButton, isSubmittingReply && styles.sendButtonDisabled]}
          onPress={handleSubmitReply}
          disabled={isSubmittingReply || !replyText.trim()}
        >
          {isSubmittingReply ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
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
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  placeholder: {
    width: 34,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  listContainer: {
    paddingBottom: 20,
  },
  mainPostCard: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginTop: 15,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  postHeader: {
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 10,
  },
  avatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: '#e74c3c',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  postTime: {
    fontSize: 12,
    color: '#999',
  },
  postContent: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  postTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 10,
    lineHeight: 24,
  },
  postText: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
    marginBottom: 15,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginTop: 10,
    backgroundColor: '#f0f0f0', // Add placeholder background
  },
  postFooter: {
    paddingHorizontal: 15,
    paddingBottom: 15,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 15,
  },
  postStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
    paddingVertical: 5,
    paddingHorizontal: 5,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  statText: {
    fontSize: 14,
    color: '#999',
    marginLeft: 4,
    fontWeight: '500',
  },
  likeText: {
    fontSize: 14,
    color: '#999',
    marginLeft: 4,
    fontWeight: '500',
  },
  repliesHeader: {
    paddingHorizontal: 15,
    paddingVertical: 15,
    backgroundColor: '#f5f5f5',
  },
  repliesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  replyCard: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginBottom: 10,
    borderRadius: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  replyHeader: {
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 8,
  },
  replyAvatar: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    backgroundColor: '#e74c3c',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  replyUserName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  replyTime: {
    fontSize: 11,
    color: '#999',
  },
  replyContent: {
    paddingHorizontal: 15,
    paddingBottom: 10,
  },
  replyText: {
    fontSize: 15,
    color: '#666',
    lineHeight: 20,
  },
  replyFooter: {
    paddingHorizontal: 15,
    paddingBottom: 12,
  },
  replyInputContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 30 : 15,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  replyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 16,
    color: '#333',
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#e74c3c',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});

export default PostDetail;