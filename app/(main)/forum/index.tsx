// app/(main)/forum/index.tsx - Fixed: No Anonymous Users
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { Timestamp } from "firebase/firestore";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { ForumPost, getForumPosts, getUserLikeStatuses, toggleLike } from "../../../services/forum";

const ForumIndex = () => {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [likeStatuses, setLikeStatuses] = useState<Record<string, boolean>>({});

  const loadPosts = async () => {
    try {
      setLoading(true);
      const approvedPosts = await getForumPosts();
      setPosts(approvedPosts);

      // Load like statuses for all posts
      if (approvedPosts.length > 0) {
        const postIds = approvedPosts.map(p => p.id!).filter(Boolean);
        if (postIds.length > 0) {
          const statuses = await getUserLikeStatuses(postIds, 'post');
          setLikeStatuses(statuses);
        }
      }
    } catch (error) {
      console.error('Error loading posts:', error);
      Alert.alert("Error", "Failed to load posts");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPosts();
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadPosts();
    }, [])
  );

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
        return diffInMinutes <= 1 ? 'Now' : `${diffInMinutes}m`;
      } else if (diffInHours < 24) {
        return `${Math.floor(diffInHours)}h`;
      } else {
        const diffInDays = Math.floor(diffInHours / 24);
        return `${diffInDays}d`;
      }
    } catch (error) {
      return 'Unknown';
    }
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .substring(0, 2);
  };

  const handlePostPress = (post: ForumPost) => {
    if (!post.id) {
      Alert.alert("Error", "Invalid post");
      return;
    }
    router.push({
      pathname: "/(main)/forum/post",
      params: { id: post.id }
    });
  };

  const handleLike = async (postId: string, event: any) => {
    event.stopPropagation();
    
    try {
      const newLikeState = await toggleLike(postId, 'post');
      
      setLikeStatuses(prev => ({
        ...prev,
        [postId]: newLikeState
      }));
      
      setPosts(prev => prev.map(post => {
        if (post.id === postId) {
          return {
            ...post,
            likesCount: newLikeState 
              ? (post.likesCount || 0) + 1 
              : Math.max(0, (post.likesCount || 0) - 1)
          };
        }
        return post;
      }));
    } catch (error) {
      console.error('Error toggling like:', error);
      Alert.alert("Error", "Failed to update like");
    }
  };

  const handleCreatePost = () => {
    router.push("/(main)/forum/create");
  };

  const renderPost = ({ item }: { item: ForumPost }) => (
    <TouchableOpacity 
      style={styles.postCard}
      onPress={() => handlePostPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.postHeader}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {getInitials(item.userName)}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{item.userName}</Text>
            <Text style={styles.postTime}>
              {formatDate(item.createdAt)}
            </Text>
          </View>
        </View>
      </View>
      
      <View style={styles.postContent}>
        <Text style={styles.postTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.postText} numberOfLines={3}>
          {item.content}
        </Text>
      </View>

      {item.imageUrl && (
        <View style={styles.imageContainer}>
          <Image 
            source={{ uri: item.imageUrl }} 
            style={styles.postImage}
            resizeMode="cover"
          />
        </View>
      )}

      <View style={styles.postFooter}>
        <View style={styles.postStats}>
          <TouchableOpacity 
            style={styles.statItem}
            onPress={(e) => item.id && handleLike(item.id, e)}
          >
            <Ionicons 
              name={likeStatuses[item.id!] ? "heart" : "heart-outline"} 
              size={18} 
              color={likeStatuses[item.id!] ? "#D32F2F" : "#999"} 
            />
            <Text style={[
              styles.statText,
              likeStatuses[item.id!] && styles.likedText
            ]}>
              {item.likesCount || 0}
            </Text>
          </TouchableOpacity>
          <View style={styles.statItem}>
            <Ionicons name="chatbubble-outline" size={18} color="#999" />
            <Text style={styles.statText}>{item.repliesCount || 0}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#999" />
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
      <Text style={styles.emptyTitle}>No Posts Yet</Text>
      <Text style={styles.emptyText}>
        Be the first to start a discussion in our community forum!
      </Text>
      <TouchableOpacity style={styles.createFirstPostButton} onPress={handleCreatePost}>
        <Text style={styles.createFirstPostText}>Create First Post</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Community Forum</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D32F2F" />
          <Text style={styles.loadingText}>Loading forum posts...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Community Forum</Text>
        <TouchableOpacity style={styles.createButton} onPress={handleCreatePost}>
          <Ionicons name="add" size={24} color="#D32F2F" />
        </TouchableOpacity>
      </View>

      {posts.length > 0 && (
        <View style={styles.postsCountContainer}>
          <Text style={styles.postsCountText}>
            {posts.length} approved post{posts.length !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item, index) => item.id || index.toString()}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContainer,
          posts.length === 0 && styles.emptyListContainer
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#D32F2F']}
            tintColor="#D32F2F"
          />
        }
        ListEmptyComponent={renderEmptyState}
      />

      <TouchableOpacity style={styles.fab} onPress={handleCreatePost} activeOpacity={0.8}>
        <Ionicons name="add" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
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
  createButton: { padding: 5 },
  placeholder: { width: 34 },
  postsCountContainer: { backgroundColor: '#f8f9fa', paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e9ecef' },
  postsCountText: { fontSize: 12, color: '#6c757d', fontWeight: '500' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  loadingText: { marginTop: 15, fontSize: 16, color: '#666', textAlign: 'center' },
  listContainer: { padding: 15, paddingBottom: 80 },
  emptyListContainer: { flexGrow: 1 },
  postCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 15, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, overflow: 'hidden' },
  postHeader: { paddingHorizontal: 15, paddingTop: 15, paddingBottom: 10 },
  avatarContainer: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#D32F2F', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 2 },
  postTime: { fontSize: 12, color: '#999' },
  postContent: { paddingHorizontal: 15, paddingBottom: 15 },
  postTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 8, lineHeight: 22 },
  postText: { fontSize: 14, color: '#666', lineHeight: 20 },
  imageContainer: { paddingHorizontal: 15, paddingBottom: 15 },
  postImage: { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#f0f0f0' },
  postFooter: { paddingHorizontal: 15, paddingBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 12 },
  postStats: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flexDirection: 'row', alignItems: 'center', marginRight: 20 },
  statText: { fontSize: 12, color: '#999', marginLeft: 4, fontWeight: '500' },
  likedText: { color: '#D32F2F' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 24, fontWeight: '700', color: '#333', marginTop: 20, marginBottom: 10, textAlign: 'center' },
  emptyText: { fontSize: 16, color: '#666', textAlign: 'center', lineHeight: 24, marginBottom: 30 },
  createFirstPostButton: { backgroundColor: '#D32F2F', paddingHorizontal: 30, paddingVertical: 15, borderRadius: 25 },
  createFirstPostText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  fab: { position: 'absolute', bottom: 90, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#D32F2F', justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 },
});

export default ForumIndex