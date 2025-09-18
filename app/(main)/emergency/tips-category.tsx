import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from 'expo-router';
import React from "react";
import {
    ActivityIndicator,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { useEmergencyTips } from "../../../hooks/useEmergencyTips";

export default function TipsCategory() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const categoryName = Array.isArray(category) ? category[0] : category || 'General';
  
  const { tips, loading, error, refetch } = useEmergencyTips(categoryName);
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    refetch();
    setTimeout(() => setRefreshing(false), 1000);
  }, [refetch]);

  // Category icon mapping
  const getCategoryIcon = (categoryName: string) => {
    const icons: Record<string, string> = {
      'Typhoon': '🌪️',
      'Flood': '🌊',
      'Fire': '🔥',
      'Earthquake': '🏚️',
      'Health': '🦠',
      'General': '⚠️',
    };
    return icons[categoryName] || '📋';
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
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color="#D32F2F" />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          
          <View style={styles.logoContainer}>
            <Image 
              source={require('../../../assets/images/logo.png')} 
              style={styles.logoImage}
            />
            <Text style={styles.logoTitle}>LipaAlertHub</Text>
          </View>
        </View>
        
        <View style={styles.categoryHeader}>
          <Text style={styles.categoryIcon}>{getCategoryIcon(categoryName)}</Text>
          <View style={styles.categoryTitleContainer}>
            <Text style={styles.pageTitle}>{categoryName} Safety</Text>
            <Text style={styles.pageSubtitle}>
              {tips.length} tip{tips.length !== 1 ? 's' : ''} available
            </Text>
          </View>
        </View>
      </View>

      {/* Loading State */}
      {loading && !refreshing && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D32F2F" />
          <Text style={styles.loadingText}>Loading {categoryName.toLowerCase()} tips...</Text>
        </View>
      )}

      {/* Error State */}
      {error && !loading && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ Unable to load tips</Text>
          <Text style={styles.errorSubText}>
            Pull down to refresh or check your connection
          </Text>
        </View>
      )}

      {/* Tips Cards */}
      {!loading && !error && tips.length > 0 && (
        <View style={styles.tipsContainer}>
          {tips.map((tip, index) => (
            <View key={tip.id} style={styles.tipCard}>
              <View style={styles.tipHeader}>
                <Text style={styles.tipNumber}>#{index + 1}</Text>
                <Text style={styles.tipTitle}>{tip.title}</Text>
              </View>
              <Text style={styles.tipDescription}>
                {tip.description}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Empty State */}
      {!loading && !error && tips.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>{getCategoryIcon(categoryName)}</Text>
          <Text style={styles.emptyText}>No {categoryName.toLowerCase()} tips available</Text>
          <Text style={styles.emptySubText}>
            Tips for this category will appear here when added by administrators
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
    paddingBottom: 30,
    backgroundColor: "#ffffff",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  backButtonText: {
    fontSize: 16,
    color: "#D32F2F",
    fontWeight: "600",
    marginLeft: 4,
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoImage: {
    width: 32,
    height: 32,
    resizeMode: "contain",
    marginRight: 8,
  },
  logoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#D32F2F",
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  categoryIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  categoryTitleContainer: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 16,
    color: "#666",
    fontWeight: "400",
  },
  tipsContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
  },
  tipCard: {
    backgroundColor: "#D32F2F",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  tipHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  tipNumber: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.8)",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 12,
    minWidth: 32,
    textAlign: "center",
  },
  tipTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
    flex: 1,
    lineHeight: 24,
  },
  tipDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: "#ffffff",
    opacity: 0.95,
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
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
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
    maxWidth: 280,
  },
});