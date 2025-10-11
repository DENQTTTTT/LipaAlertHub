import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Platform,
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
}

const DetailedAlertScreen = () => {
  const { alertId } = useLocalSearchParams();
  const [alert, setAlert] = useState<WeatherAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchAlertDetails = async () => {
      try {
        setError(null);
        
        if (!alertId) {
          setError('Alert ID not found');
          setLoading(false);
          return;
        }

        const alertDoc = await getDoc(doc(db, 'alerts', alertId as string));
        
        if (!alertDoc.exists()) {
          setError('Alert not found');
          setLoading(false);
          return;
        }

        const data = alertDoc.data();
        
        if (data.approved && data.isActive) {
          setAlert({
            id: alertDoc.id,
            title: data.title || 'Alert',
            description: data.description || 'No description available',
            severity: data.severity || 'info',
            type: data.type || 'weather',
            approved: data.approved || false,
            isActive: data.isActive || false,
            createdAt: data.createdAt || Timestamp.now(),
            createdBy: data.createdBy || 'system',
            source: data.source || 'CDRRMO Lipa',
          } as WeatherAlert);
        } else {
          setError('This alert is no longer active');
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching alert details:', error);
        setError('Unable to load alert details. Please check your connection.');
        setLoading(false);
      }
    };

    fetchAlertDetails();
  }, [alertId]);

  const handleEmergencyCall = (phoneNumber: string) => {
    Linking.openURL(`tel:${phoneNumber}`);
  };

  const formatDate = (timestamp: Timestamp) => {
    return timestamp.toDate().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
          <Text style={styles.pageTitle}>Alert Details</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e74c3c" />
          <Text style={styles.loadingText}>Loading alert details...</Text>
        </View>
      </View>
    );
  }

  if (error || !alert) {
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
          <Text style={styles.pageTitle}>Alert Details</Text>
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#e74c3c" />
          <Text style={styles.errorTitle}>
            {error || 'Alert not found'}
          </Text>
          <Text style={styles.errorText}>
            {error === 'Alert not found' 
              ? 'The requested alert could not be found.' 
              : 'Please check your connection and try again.'}
          </Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
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
        <Text style={styles.pageTitle}>Alert Details</Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Main Alert Content */}
        <View style={styles.alertContainer}>
          {/* Title */}
          <Text style={styles.alertTitle}>{alert.title}</Text>
          
          {/* Description */}
          <View style={styles.descriptionContainer}>
            <Text style={styles.descriptionText}>
              {alert.description}
            </Text>
          </View>
          
          {/* Time and Source */}
          <View style={styles.infoContainer}>
            <View style={styles.infoItem}>
              <Ionicons name="time-outline" size={16} color="#666" />
              <Text style={styles.infoLabel}>Issued</Text>
              <Text style={styles.infoValue}>
                {formatDate(alert.createdAt)}
              </Text>
            </View>
            
            <View style={styles.infoItem}>
              <Ionicons name="business-outline" size={16} color="#666" />
              <Text style={styles.infoLabel}>Source</Text>
              <Text style={styles.infoValue}>
                {alert.source}
              </Text>
            </View>
          </View>
        </View>

        {/* Emergency Contacts */}
        <View style={styles.contactsSection}>
          <Text style={styles.sectionTitle}>Emergency Contacts</Text>
          
          <View style={styles.contactsContainer}>
            <TouchableOpacity 
              style={styles.contactItem}
              onPress={() => handleEmergencyCall('(043) 756-0127')}
            >
              <View style={styles.contactIcon}>
                <Ionicons name="medkit" size={20} color="#e74c3c" />
              </View>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>CDRRMO Medical</Text>
                <Text style={styles.contactNumber}>(043) 756-0127</Text>
              </View>
              <Ionicons name="call" size={16} color="#e74c3c" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.contactItem}
              onPress={() => handleEmergencyCall('(043) 757-4618')}
            >
              <View style={styles.contactIcon}>
                <Ionicons name="flame" size={20} color="#f39c12" />
              </View>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>LIPA BFP Fire</Text>
                <Text style={styles.contactNumber}>(043) 757-4618</Text>
              </View>
              <Ionicons name="call" size={16} color="#f39c12" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.contactItem}
              onPress={() => handleEmergencyCall('(043) 702-3832')}
            >
              <View style={styles.contactIcon}>
                <Ionicons name="shield-checkmark" size={20} color="#3498db" />
              </View>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>LIPA PNP Police</Text>
                <Text style={styles.contactNumber}>(043) 702-3832</Text>
              </View>
              <Ionicons name="call" size={16} color="#3498db" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer Note */}
        <View style={styles.footerNote}>
          <Ionicons name="information-circle-outline" size={14} color="#666" />
          <Text style={styles.footerText}>
            For emergencies, tap on any contact to call immediately
          </Text>
        </View>
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
    padding: 20,
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
  alertContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    marginBottom: 20,
  },
  alertTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'center',
  },
  descriptionContainer: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  descriptionText: {
    fontSize: 16,
    color: '#444',
    lineHeight: 24,
    textAlign: 'left',
  },
  infoContainer: {
    gap: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 12,
    marginRight: 'auto',
    width: 60,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a1a',
    flex: 1,
    textAlign: 'right',
  },
  contactsSection: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  contactsContainer: {
    gap: 12,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    gap: 12,
  },
  contactIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  contactNumber: {
    fontSize: 12,
    color: '#666',
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  footerText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
});

export default DetailedAlertScreen;