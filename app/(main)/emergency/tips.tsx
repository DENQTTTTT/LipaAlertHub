import React from "react";
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useEmergencyTips } from "../../../hooks/useEmergencyTips";

export default function EmergencyTips() {
  const { tips, loading, error, refetch } = useEmergencyTips();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    refetch();
    setTimeout(() => setRefreshing(false), 1000);
  }, [refetch]);

  return (
    <ScrollView 
      style={styles.container} 
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#dc2626']}
          tintColor={'#dc2626'}
        />
      }
    >
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
      </View>

      {/* Loading State */}
      {loading && !refreshing && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#dc2626" />
          <Text style={styles.loadingText}>Loading emergency tips...</Text>
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
          {tips.map((tip) => (
            <View key={tip.id} style={styles.tipCard}>
              <Text style={styles.tipTitle}>{tip.title}</Text>
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
          <Text style={styles.emptyText}>📋 No emergency tips available</Text>
          <Text style={styles.emptySubText}>
            Tips will appear here when added by administrators
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
    paddingTop: 60,
    paddingBottom: 30,
    backgroundColor: "#ffffff",
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  logoImage: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginRight: 10,
    resizeMode: 'contain',
  },
  logoTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1f2937",
    marginTop: 10,
  },
  tipsContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
  },
  tipCard: {
    backgroundColor: "#dc2626",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tipTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 12,
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
    color: '#6b7280',
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
    color: '#dc2626',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubText: {
    fontSize: 14,
    color: '#6b7280',
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
    color: '#6b7280',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 20,
  },
});