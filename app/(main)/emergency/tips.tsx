import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useEmergencyTips } from "../../../hooks/useEmergencyTips";

const { width } = Dimensions.get('window');

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
        activeOpacity={0.8}
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
            <Text style={styles.arrowText}>→</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView 
      style={styles.container} 
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
      {/* Header - Matching Dashboard Style */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image 
            source={require('../../../assets/images/logo.png')} 
            style={styles.logoImage}
          />
          <Text style={styles.logoTitle}>LipaAlertHub</Text>
        </View>
        <Text style={styles.pageTitle}>Emergency Tips</Text>
      </View>

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
          <Text style={styles.errorText}>⚠️ Unable to load categories</Text>
          <Text style={styles.errorSubText}>
            Pull down to refresh or check your connection
          </Text>
        </View>
      )}

      {/* Categories Grid */}
      {!loading && !error && categories.length > 0 && (
        <View style={styles.categoriesContainer}>
          <Text style={styles.sectionTitle}>Safety Categories</Text>
          <View style={styles.categoriesGrid}>
            {categories.map((category, index) => renderCategoryCard(category, index))}
          </View>
        </View>
      )}

      {/* Empty State */}
      {!loading && !error && categories.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>📋 No emergency tips available</Text>
          <Text style={styles.emptySubText}>
            Categories will appear here when tips are added by administrators
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom:15 ,
    backgroundColor: "#ffffff",
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  logoImage: {
    width: 40,
    height: 40,
    resizeMode: "contain",
    marginRight: 10,
  },
  logoTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#D32F2F",
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  pageSubtitle: {
    fontSize: 16,
    color: "#666",
    fontWeight: "400",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
    marginBottom: 15,
  },
  categoriesContainer: {
    paddingHorizontal: 20,
    paddingTop: 25,
    paddingBottom: 100,
  },
  categoriesGrid: {
    flexDirection: 'column',
    gap: 15,
  },
  categoryCardContainer: {
    width: '100%',
    marginBottom: 4,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  categoryIconContainer: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  categoryIcon: {
    fontSize: 24,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  categoryCount: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '600',
  },
  categoryArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  // Loading States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
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
    paddingVertical: 40,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 18,
    color: '#D32F2F',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Empty State
  emptyContainer: {
    paddingHorizontal: 20,
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
});