import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { db } from '../../../services/firebase';

const { width } = Dimensions.get('window');
const isSmallDevice = width < 375;

interface WeatherAlert {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'watch' | 'warning' | 'danger';
  type: 'weather' | 'earthquake' | 'volcano' | 'flood' | 'disaster';
  approved: boolean;
  isActive: boolean;
  createdAt: Timestamp;
  createdBy: string;
  source?: string;
  imageUrl?: string;
  expiresAt?: Timestamp;
}

const WeatherAlertsScreen = () => {
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchAlerts = () => {
      try {
        setError(null);
        
        const alertsQuery = query(
          collection(db, 'alerts'),
          where('approved', '==', true),
          where('isActive', '==', true),
          orderBy('createdAt', 'desc'),
          limit(20)
        );

        const unsubscribe = onSnapshot(
          alertsQuery, 
          (snapshot) => {
            const alertsData: WeatherAlert[] = [];
            const now = new Date();
            
            if (snapshot.empty) {
              setAlerts([]);
              setLoading(false);
              setRefreshing(false);
              return;
            }

            snapshot.forEach((doc) => {
              const data = doc.data();
              
              // Check if alert is expired
              const expiresAt = data.expiresAt?.toDate?.() || data.expiresAt;
              const isExpired = expiresAt && expiresAt < now;
              
              if (doc.exists() && data.approved && data.isActive && !isExpired) {
                alertsData.push({
                  id: doc.id,
                  title: data.title || 'Alert',
                  description: data.description || 'No description available',
                  severity: data.severity || 'info',
                  type: data.type || 'weather',
                  approved: data.approved || false,
                  isActive: data.isActive || false,
                  createdAt: data.createdAt || Timestamp.now(),
                  createdBy: data.createdBy || 'system',
                  source: data.source || 'Unknown',
                  expiresAt: data.expiresAt,
                } as WeatherAlert);
              }
            });
            
            setAlerts(alertsData);
            setLoading(false);
            setRefreshing(false);
          }, 
          (error) => {
            console.error('Error fetching weather alerts:', error);
            setError('Unable to load alerts. Please check your connection.');
            setLoading(false);
            setRefreshing(false);
          }
        );

        return unsubscribe;
      } catch (error) {
        console.error('Error setting up alerts listener:', error);
        setError('Failed to load alerts');
        setLoading(false);
        setRefreshing(false);
        return () => {};
      }
    };

    const unsubscribe = fetchAlerts();
    return () => unsubscribe();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setError(null);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'info': return '#3498db';
      case 'watch': return '#f39c12';
      case 'warning': return '#e67e22';
      case 'danger': return '#e74c3c';
      default: return '#95a5a6';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'info': return 'information-circle';
      case 'watch': return 'eye';
      case 'warning': return 'warning';
      case 'danger': return 'alert-circle';
      default: return 'help-circle';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'weather': return 'cloud';
      case 'earthquake': return 'pulse';
      case 'volcano': return 'flame';
      case 'flood': return 'water';
      default: return 'warning';
    }
  };

  const handleAlertPress = (alert: WeatherAlert) => {
    router.push({
      pathname: '/(main)/weather/detailed',
      params: { 
        alertId: alert.id
      }
    });
  };

  const renderAlertCard = (alert: WeatherAlert) => {
    const severityColor = getSeverityColor(alert.severity);
    
    return (
      <TouchableOpacity
        key={alert.id}
        style={[styles.alertCard, { borderLeftColor: severityColor }]}
        onPress={() => handleAlertPress(alert)}
        activeOpacity={0.7}
      >
        <View style={styles.alertHeader}>
          <View style={styles.alertTypeContainer}>
            <View style={[styles.severityBadge, { backgroundColor: severityColor }]}>
              <Ionicons 
                name={getSeverityIcon(alert.severity) as any} 
                size={14} 
                color="white" 
              />
              <Text style={styles.severityText}>
                {alert.severity.toUpperCase()}
              </Text>
            </View>
            <View style={styles.typeContainer}>
              <Ionicons 
                name={getTypeIcon(alert.type) as any} 
                size={12} 
                color="#666" 
              />
              <Text style={styles.typeText}>
                {alert.type.toUpperCase()}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#999" />
        </View>
        
        <Text style={styles.alertTitle}>{alert.title}</Text>
        <Text style={styles.alertDescription} numberOfLines={2}>
          {alert.description}
        </Text>
        
        <View style={styles.alertFooter}>
          <Text style={styles.sourceText}>
            Source: {alert.source || 'CDRRMO Lipa'}
          </Text>
          <Text style={styles.timeText}>
            {alert.createdAt.toDate().toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar backgroundColor="#ffffff" barStyle="dark-content" />
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Image 
              source={require('../../../assets/images/logo.png')} 
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.logoTitle}>LipaAlertHub</Text>
          </View>
          <Text style={styles.pageTitle}>Weather Alerts</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e74c3c" />
          <Text style={styles.loadingText}>Loading alerts...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#ffffff" barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image 
            source={require('../../../assets/images/logo.png')} 
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.logoTitle}>LipaAlertHub</Text>
        </View>
        <Text style={styles.pageTitle}>Weather Alerts</Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#e74c3c']}
            tintColor="#e74c3c"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Error State */}
        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="cloud-offline" size={48} color="#e74c3c" />
            <Text style={styles.errorTitle}>Connection Error</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity 
              style={styles.retryButton}
              onPress={onRefresh}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Empty State */}
        {!error && alerts.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle" size={64} color="#27ae60" />
            <Text style={styles.emptyTitle}>No Active Alerts</Text>
            <Text style={styles.emptyText}>
              There are currently no active weather alerts for Lipa City.
            </Text>
          </View>
        )}

        {/* Alerts List */}
        {!error && alerts.length > 0 && (
          <View style={styles.alertsContainer}>
            <View style={styles.statsRow}>
              <Text style={styles.alertsCount}>
                {alerts.length} Active Alert{alerts.length !== 1 ? 's' : ''}
              </Text>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Live Updates</Text>
              </View>
            </View>

            <View style={styles.alertsList}>
              {alerts.map(renderAlertCard)}
            </View>

            <View style={styles.footerNote}>
              <Ionicons name="information-circle-outline" size={14} color="#666" />
              <Text style={styles.footerText}>
                Tap on any alert for detailed information
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    backgroundColor: "#ffffff",
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  logoImage: {
    width: 32,
    height: 32,
    borderRadius: 8,
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
    color: "#1a1a1a",
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
    fontWeight: "500",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e74c3c',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  alertsContainer: {
    padding: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  alertsCount: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
    marginRight: 6,
  },
  liveText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22c55e',
  },
  alertsList: {
    gap: 16,
  },
  alertCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  alertTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  severityText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },
  typeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  typeText: {
    color: '#666',
    fontSize: 10,
    fontWeight: '600',
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    lineHeight: 20,
  },
  alertDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  alertFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourceText: {
    fontSize: 12,
    color: '#888',
  },
  timeText: {
    fontSize: 12,
    color: '#888',
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
    marginTop: 20,
  },
  footerText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
});

export default WeatherAlertsScreen;