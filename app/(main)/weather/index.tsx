import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../../../services/firebase';

interface WeatherAlert {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'watch' | 'warning' | 'danger';
  type: 'weather' | 'disaster';
  approved: boolean;
  isActive: boolean;
  createdAt: Timestamp;
  createdBy: string;
  imageUrl?: string;
}

const WeatherAlertsScreen = () => {
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const fetchAlerts = () => {
      try {
        const alertsQuery = query(
          collection(db, 'weather_alerts'),
          where('approved', '==', true),
          where('isActive', '==', true),
          orderBy('createdAt', 'desc'),
          limit(10)
        );

        const unsubscribe = onSnapshot(alertsQuery, (snapshot) => {
          const alertsData: WeatherAlert[] = [];
          snapshot.forEach((doc) => {
            alertsData.push({
              id: doc.id,
              ...doc.data(),
            } as WeatherAlert);
          });
          setAlerts(alertsData);
          setLoading(false);
          setRefreshing(false);
        }, (error) => {
          console.error('Error fetching weather alerts:', error);
          setLoading(false);
          setRefreshing(false);
          Alert.alert('Error', 'Failed to fetch weather alerts');
        });

        return unsubscribe;
      } catch (error) {
        console.error('Error setting up alerts listener:', error);
        setLoading(false);
        setRefreshing(false);
      }
    };

    const unsubscribe = fetchAlerts();
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    // The onSnapshot listener will automatically update the data
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
    return type === 'weather' ? 'cloud' : 'warning';
  };

  const formatDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const truncateDescription = (description: string, maxLength: number = 100) => {
    if (description.length <= maxLength) return description;
    return description.substring(0, maxLength).trim() + '...';
  };

  const handleAlertPress = (alertId: string) => {
    router.push({
      pathname: '/(main)/weather/detailed',
      params: { alertId }
    });
  };

  const renderAlert = (alert: WeatherAlert) => (
    <TouchableOpacity
      key={alert.id}
      style={[styles.alertCard, { backgroundColor: getSeverityColor(alert.severity) }]}
      onPress={() => handleAlertPress(alert.id)}
      activeOpacity={0.8}
    >
      <View style={styles.alertContent}>
        <View style={styles.alertHeader}>
          <Text style={styles.alertSeverity}>
            {alert.severity === 'info' ? 'Blue Information' : 
             alert.severity === 'watch' ? 'Yellow Warning' :
             alert.severity === 'warning' ? 'Orange Warning' :
             'Red Warning'}
          </Text>
          <Ionicons name="chevron-forward" size={20} color="white" />
        </View>
        <Text style={styles.alertTitle}>{alert.title.toUpperCase()}</Text>
        <Text style={styles.alertDescription} numberOfLines={3}>
          {alert.description}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.logoContainer}>
              <Ionicons name="shield" size={24} color="#D32F2F" />
            </View>
            <Text style={styles.appName}>LipaAlertHub</Text>
          </View>
          <Text style={styles.headerTitle}>Weather & Disaster Alerts</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D32F2F" />
          <Text style={styles.loadingText}>Loading alerts...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoContainer}>
            <Ionicons name="shield" size={24} color="#D32F2F" />
          </View>
          <Text style={styles.appName}>LipaAlertHub</Text>
        </View>
        <Text style={styles.headerTitle}>Weather & Disaster Alerts</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#D32F2F']}
            tintColor="#D32F2F"
          />
        }
      >
        {alerts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle-outline" size={80} color="#95a5a6" />
            <Text style={styles.emptyTitle}>No Active Alerts</Text>
            <Text style={styles.emptySubtitle}>
              There are currently no active weather or disaster alerts for your area.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.infoContainer}>
              <Ionicons name="information-circle" size={20} color="#3498db" />
              <Text style={styles.infoText}>
                Stay informed with the latest weather and disaster alerts from CDRRMO.
              </Text>
            </View>
            
            <View style={styles.alertsList}>
              {alerts.slice(0, 3).map(renderAlert)}
              
              {alerts.length > 3 && (
                <View style={styles.moreAlertsContainer}>
                  <Text style={styles.moreAlertsText}>
                    Showing latest 3 alerts
                  </Text>
                  <Text style={styles.totalAlertsText}>
                    {alerts.length} total active alerts
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  loadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  logoContainer: {
    width: 32,
    height: 32,
    backgroundColor: 'rgba(211, 47, 47, 0.1)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  appName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#D32F2F',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    flex: 1,
  },
  backButton: {
    padding: 4,
  },
  headerRight: {
    width: 32,
    height: 32,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 40,
    lineHeight: 24,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: '#1976d2',
    lineHeight: 20,
  },
  alertsList: {
    gap: 12,
  },
  alertCard: {
    borderRadius: 12,
    marginHorizontal: 0,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  alertContent: {
    padding: 20,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  alertSeverity: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  alertDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 20,
  },
  moreAlertsContainer: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(211, 47, 47, 0.05)',
    borderRadius: 10,
    marginTop: 10,
  },
  moreAlertsText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  totalAlertsText: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
});

export default WeatherAlertsScreen;