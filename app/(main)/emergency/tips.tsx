import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useEmergencyTips } from "../../../hooks/useEmergencyTips";

const { width } = Dimensions.get('window');
const isSmallDevice = width < 375;

export default function EmergencyTips() {
  const { categories, loading, error, refetch } = useEmergencyTips();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    refetch();
    setTimeout(() => setRefreshing(false), 1000);
  }, [refetch]);

  const navigateToCategory = (categoryName: string) => {
    router.push(`/(main)/emergency/tips-category?category=${encodeURIComponent(categoryName)}`);
  };

  const renderCategoryCard = (category: any, index: number) => {
    return (
      <TouchableOpacity
        key={category.name}
        style={styles.categoryCardContainer}
        onPress={() => navigateToCategory(category.name)}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={category.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.categoryCard}
        >
          {/* Category Icon */}
          <View style={styles.categoryIconContainer}>
            <Text style={styles.categoryIcon}>{category.icon}</Text>
          </View>

          {/* Category Info */}
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryName}>{category.name}</Text>
            <Text style={styles.categoryCount}>
              {category.count} tip{category.count !== 1 ? 's' : ''}
            </Text>
          </View>

          {/* Arrow Icon */}
          <View style={styles.categoryArrow}>
            <Text style={styles.arrowText}>›</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image 
            source={require('../../../assets/images/logo.png')} 
            style={styles.logoImage}
          />
          <Text style={styles.logoTitle}>LipaAlertHub</Text>
        </View>
        <Text style={styles.pageTitle}>Emergency Tips</Text>
        <Text style={styles.pageSubtitle}>
          Essential safety guides for emergencies
        </Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#D32F2F']}
            tintColor={'#D32F2F'}
          />
        }
      >
        {/* Loading State */}
        {loading && !refreshing && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#D32F2F" />
            <Text style={styles.loadingText}>Loading categories...</Text>
          </View>
        )}

        {/* Error State */}
        {error && !loading && (
          <View style={styles.errorContainer}>
            <View style={styles.errorIcon}>
              <Text style={styles.errorEmoji}>⚠️</Text>
            </View>
            <Text style={styles.errorText}>Unable to load categories</Text>
            <Text style={styles.errorSubText}>
              Pull down to refresh or check your connection
            </Text>
          </View>
        )}

        {/* Categories Grid */}
        {!loading && !error && categories.length > 0 && (
          <View style={styles.categoriesContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Safety Categories</Text>
              <View style={styles.categoryCountBadge}>
                <Text style={styles.categoryCountBadgeText}>{categories.length}</Text>
              </View>
            </View>
            
            <View style={styles.categoriesGrid}>
              {categories.map((category, index) => renderCategoryCard(category, index))}
            </View>
          </View>
        )}

        {/* Empty State */}
        {!loading && !error && categories.length === 0 && (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyEmoji}>📋</Text>
            </View>
            <Text style={styles.emptyText}>No emergency tips available</Text>
            <Text style={styles.emptySubText}>
              Categories will appear here when tips are added by administrators
            </Text>
          </View>
        )}

        {/* Bottom Spacing for Navbar */}
        <View style={styles.bottomSpacing} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 20,
    backgroundColor: "#ffffff",
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  logoImage: {
    width: 32,
    height: 32,
    borderRadius: 8,
    resizeMode: "contain",
    marginRight: 10,
  },
  logoTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  pageTitle: {
    fontSize: isSmallDevice ? 24 : 28,
    fontWeight: "700",
    color: "#D32F2F",
    marginBottom: 6,
  },
  pageSubtitle: {
    fontSize: isSmallDevice ? 13 : 14,
    color: "#666",
    fontWeight: "400",
    lineHeight: 20,
  },
  
  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: isSmallDevice ? 18 : 20,
    fontWeight: "700",
    color: "#333",
  },
  categoryCountBadge: {
    backgroundColor: '#D32F2F',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 32,
    alignItems: 'center',
  },
  categoryCountBadgeText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  
  // Categories
  categoriesContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  categoriesGrid: {
    flexDirection: 'column',
    gap: 12,
  },
  categoryCardContainer: {
    width: '100%',
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: isSmallDevice ? 18 : 22,
    paddingHorizontal: isSmallDevice ? 16 : 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  categoryIconContainer: {
    width: isSmallDevice ? 50 : 56,
    height: isSmallDevice ? 50 : 56,
    borderRadius: isSmallDevice ? 25 : 28,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  categoryIcon: {
    fontSize: isSmallDevice ? 26 : 30,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: isSmallDevice ? 16 : 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  categoryCount: {
    fontSize: isSmallDevice ? 13 : 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  categoryArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: '600',
  },
  
  // Loading States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  
  // Error States
  errorContainer: {
    paddingHorizontal: 20,
    paddingVertical: 60,
    alignItems: 'center',
  },
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  errorEmoji: {
    fontSize: 40,
  },
  errorText: {
    fontSize: 18,
    color: '#D32F2F',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  
  // Empty State
  emptyContainer: {
    paddingHorizontal: 20,
    paddingVertical: 80,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyText: {
    fontSize: 18,
    color: '#333',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  
  // Bottom Spacing
  bottomSpacing: {
    height: Platform.OS === 'ios' ? 100 : 80,
  },
});