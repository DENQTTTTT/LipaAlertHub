import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Share,
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

const WeatherAlertDetailScreen = () => {
  const [alert, setAlert] = useState<WeatherAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { alertId } = useLocalSearchParams<{ alertId: string }>();

  useEffect(() => {
    const fetchAlert = async () => {
      if (!alertId) {
        Alert.alert('Error', 'No alert ID provided');
        router.back();
        return;
      }

      try {
        const alertDoc = await getDoc(doc(db, 'weather_alerts', alertId));
        
        if (alertDoc.exists()) {
          const alertData = {
            id: alertDoc.id,
            ...alertDoc.data(),
          } as WeatherAlert;
          
          // Check if alert is approved and active
          if (!alertData.approved || !alertData.isActive) {
            Alert.alert('Alert Not Available', 'This alert is no longer active.');
            router.back();
            return;
          }
          
          setAlert(alertData);
        } else {
          Alert.alert('Alert Not Found', 'The requested alert could not be found.');
          router.back();
        }
      } catch (error) {
        console.error('Error fetching alert:', error);
        Alert.alert('Error', 'Failed to fetch alert details');
        router.back();
      } finally {
        setLoading(false);
      }
    };

    fetchAlert();
  }, [alertId]);

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
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }
  };

  const getSeverityTextColor = (severity: string) => {
    switch (severity) {
      case 'danger': return '#ffffff';
      case 'warning': return '#ffffff';
      default: return '#ffffff';
    }
  };

  const handleShare = async () => {
    if (!alert) return;
    
    try {
      const message = `🚨 ${alert.severity.toUpperCase()} ALERT\n\n${alert.title}\n\n${alert.description}\n\nIssued: ${formatDate(alert.createdAt)}\n\nStay safe! - LipaAlertHub`;
      
      await Share.share({
        message,
        title: `${alert.severity.toUpperCase()} Alert: ${alert.title}`,
      });
    } catch (error) {
      console.error('Error sharing alert:', error);
    }
  };

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
          <Text style={styles.headerTitle}>Alert Details</Text>
          <View style={styles.shareButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D32F2F" />
          <Text style={styles.loadingText}>Loading alert details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!alert) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.logoContainer}>
              <Ionicons name="shield" size={24} color="#D32F2F" />
            </View>
            <Text style={styles.appName}>LipaAlertHub</Text>
          </View>
          <Text style={styles.headerTitle}>Alert Details</Text>
          <View style={styles.shareButton} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={80} color="#e74c3c" />
          <Text style={styles.errorTitle}>Alert Not Found</Text>
          <Text style={styles.errorSubtitle}>
            The requested alert could not be loaded.
          </Text>
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
        <Text style={styles.headerTitle}>Alert Details</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
          <Ionicons name="share-outline" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Alert Header */}
        <View style={[styles.alertHeaderSection, { backgroundColor: getSeverityColor(alert.severity) }]}>
          <View style={styles.alertHeaderContent}>
            <View style={styles.severityContainer}>
              <Text style={styles.severityLabel}>
                {alert.severity === 'info' ? 'Blue Information' : 
                 alert.severity === 'watch' ? 'Yellow Warning' :
                 alert.severity === 'warning' ? 'Orange Warning' :
                 'Red Warning'}
              </Text>
            </View>
            <Text style={styles.alertMainTitle}>{alert.title.toUpperCase()}</Text>
          </View>
        </View>

        {/* Alert Image */}
        {alert.imageUrl && (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: alert.imageUrl }}
              style={styles.alertImage}
              resizeMode="cover"
            />
          </View>
        )}

        {/* Alert Content */}
        <View style={styles.alertContent}>
          <View style={styles.descriptionContainer}>
            <Text style={styles.alertDescription}>{alert.description}</Text>
          </View>

          <View style={styles.metaContainer}>
            <Text style={styles.metaText}>
              Issued: {formatDate(alert.createdAt)}
            </Text>
            <Text style={styles.metaText}>
              Type: {alert.type.charAt(0).toUpperCase() + alert.type.slice(1)} Alert
            </Text>
          </View>

          {/* Safety Instructions */}
          <View style={styles.safetyContainer}>
            <View style={styles.safetyHeader}>
              <Ionicons name="shield-checkmark" size={20} color="#27ae60" />
              <Text style={styles.safetyTitle}>Safety Guidelines</Text>
            </View>
            <View style={styles.safetyTips}>
              <Text style={styles.safetyTip}>
                • Stay informed through official channels
              </Text>
              <Text style={styles.safetyTip}>
                • Follow instructions from local authorities
              </Text>
              <Text style={styles.safetyTip}>
                • Keep emergency contacts readily available
              </Text>
              <Text style={styles.safetyTip}>
                • Prepare emergency supplies if necessary
              </Text>
            </View>
          </View>

          {/* Emergency Contact */}
          <View style={styles.contactContainer}>
            <View style={styles.contactHeader}>
              <Ionicons name="call" size={20} color="#e74c3c" />
              <Text style={styles.contactTitle}>Emergency Contact</Text>
            </View>
            <TouchableOpacity style={styles.emergencyButton}>
              <Ionicons name="call" size={18} color="white" />
              <Text style={styles.emergencyButtonText}>CDRRMO Hotline</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  errorHeader: {
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
  shareButton: {
    padding: 4,
  },
  content: {
    flex: 1,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 24,
  },
  alertHeaderSection: {
    paddingHorizontal: 20,
    paddingVertical: 25,
  },
  alertHeaderContent: {
    alignItems: 'flex-start',
  },
  severityContainer: {
    marginBottom: 10,
  },
  severityLabel: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontWeight: '600',
  },
  alertMainTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    letterSpacing: 0.5,
    lineHeight: 26,
  },
  imageContainer: {
    backgroundColor: 'white',
  },
  alertImage: {
    width: '100%',
    height: 200,
  },
  alertContent: {
    backgroundColor: 'white',
    padding: 20,
  },
  descriptionContainer: {
    marginBottom: 20,
  },
  alertDescription: {
    fontSize: 16,
    color: '#444',
    lineHeight: 24,
  },
  metaContainer: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  metaText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
    fontWeight: '500',
  },
  safetyContainer: {
    backgroundColor: '#f8fff9',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#d5f4e6',
  },
  safetyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  safetyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#27ae60',
    marginLeft: 8,
  },
  safetyTips: {
    gap: 8,
  },
  safetyTip: {
    fontSize: 14,
    color: '#2d5016',
    lineHeight: 20,
  },
  contactContainer: {
    backgroundColor: '#fdf2f2',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#f5c6cb',
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#e74c3c',
    marginLeft: 8,
  },
  emergencyButton: {
    backgroundColor: '#e74c3c',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  emergencyButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default WeatherAlertDetailScreen;