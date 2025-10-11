import { useAuth } from "@/hooks/useAuth";
import { useSOSSync } from "@/hooks/useSOSSync";
import { fetchEmergencyContacts } from "@/services/firebase";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Dimensions,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

const { width, height } = Dimensions.get('window');

interface EmergencyService {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  phoneNumber: string;
  backgroundColor: string;
  emergencyType: string;
}

interface AddressComponents {
  barangay: string;
  city: string;
  province: string;
  country: string;
  formattedAddress: string;
  establishment?: string;
  confidence: number;
}

const MIN_CALL_DURATION = 3000;
const CONFIRMATION_DELAY = 1000;

export default function UserSOSServices() {
  const { userProfile, user } = useAuth();
  const { saveSOSLog, isOnline, unsyncedCount, attachUserToGuestLogs, recentSOSCalls } = useSOSSync();
  
  const [emergencyServices, setEmergencyServices] = useState<EmergencyService[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingCallData, setPendingCallData] = useState<{
    service: EmergencyService;
    callInitiatedAt: number;
    location?: any;
  } | null>(null);
  const [guestLogsAttached, setGuestLogsAttached] = useState(false);
  
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const confirmationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownConfirmationRef = useRef(false);

  // Check for guest logs to attach when component mounts
  useEffect(() => {
    if (user) {
      loadEmergencyContacts();
      checkAndAttachGuestLogs();
    }
  }, [user]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
      if (confirmationTimerRef.current) {
        clearTimeout(confirmationTimerRef.current);
      }
    };
  }, [pendingCallData]);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    const wasInBackground = appStateRef.current.match(/inactive|background/);
    const isNowActive = nextAppState === 'active';

    if (wasInBackground && isNowActive && pendingCallData && !hasShownConfirmationRef.current) {
      const timeSinceCallInitiated = Date.now() - pendingCallData.callInitiatedAt;
      
      if (timeSinceCallInitiated >= MIN_CALL_DURATION) {
        if (confirmationTimerRef.current) {
          clearTimeout(confirmationTimerRef.current);
        }
        
        confirmationTimerRef.current = setTimeout(() => {
          if (!hasShownConfirmationRef.current) {
            hasShownConfirmationRef.current = true;
            showCallConfirmation();
          }
        }, CONFIRMATION_DELAY);
      } else {
        setPendingCallData(null);
      }
    }
    
    appStateRef.current = nextAppState;
  };

  const showCallConfirmation = () => {
    if (!pendingCallData) return;

    const { service } = pendingCallData;
    const serviceTitle = `${service.title} ${service.subtitle}`.trim();

    Alert.alert(
      "Emergency Call Confirmation",
      `Did you complete the emergency call to ${serviceTitle}?`,
      [
        {
          text: "No, I cancelled",
          style: "cancel",
          onPress: handleCallCancelled
        },
        {
          text: "Yes, I called",
          onPress: () => confirmSOSCall(service, pendingCallData.location)
        }
      ],
      { cancelable: false, onDismiss: handleCallCancelled }
    );
  };

  const confirmSOSCall = async (service: EmergencyService, location?: any) => {
    if (!user) {
      Alert.alert("Authentication Required", "Please sign in to log emergency calls.");
      return;
    }

    const serviceTitle = `${service.title} ${service.subtitle}`.trim();

    try {
      let userBarangay = userProfile?.barangay;
      let addressInfo = null;
      
      // Use enhanced address detection from location
      if (location) {
        addressInfo = await getEnhancedAddress(location.latitude, location.longitude);
        if (addressInfo) {
          userBarangay = addressInfo.barangay;
          console.log(`✅ Enhanced address detected: ${addressInfo.formattedAddress}`);
        }
      }
      
      // Final barangay determination
      const barangay = userBarangay || "Lipa City";
      const reporterPhone = userProfile?.phoneNumber || undefined;

      // Prepare location data for SOS log
      const reporterLocation = location ? {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        timestamp: location.timestamp,
        address: addressInfo?.formattedAddress || location.address || `${barangay}, Lipa City`
      } : undefined;

      // ✅ AUTHENTICATED USER SOS LOG DATA
      const sosLogData = {
        userId: user.uid, // Authenticated user ID
        userName: userProfile?.name || user.displayName || "User", // Real user name
        reporterPhone: reporterPhone,
        reporterBarangay: barangay,
        reporterLocation: reporterLocation,
        selectedAgency: serviceTitle,
        phoneNumber: service.phoneNumber,
        calledAt: new Date().toISOString(),
        fromOffline: false, // FALSE for authenticated users
        emergencyType: service.emergencyType,
        barangay: barangay,
        location: reporterLocation
      };

      console.log('Saving AUTHENTICATED SOS log:', {
        userId: user.uid,
        userName: sosLogData.userName,
        reporterBarangay: barangay,
        agency: serviceTitle,
        emergencyType: service.emergencyType
      });

      const result = await saveSOSLog(sosLogData);
      
      if (result.success) {
        const locationText = addressInfo?.establishment 
          ? `${addressInfo.establishment}, ${barangay}`
          : barangay;
          
        Alert.alert(
          "Call Logged Successfully",
          isOnline 
            ? `Your ${service.emergencyType} emergency call has been recorded and sent to ${serviceTitle}.\n\nLocation: ${locationText}\nYou'll receive a notification once reviewed.`
            : `Your ${service.emergencyType} emergency call has been saved and will sync when online.\n\nLocation: ${locationText}`,
          [{ text: "OK" }]
        );
      } else {
        Alert.alert(
          "Logging Issue",
          "There was an issue logging your call, but your emergency call still went through.",
          [{ text: "OK" }]
        );
      }
    } catch (error) {
      console.error("Error confirming SOS call:", error);
      Alert.alert("Error", "Could not log your emergency call.", [{ text: "OK" }]);
    } finally {
      resetCallState();
    }
  };

  const handleCallCancelled = () => {
    Alert.alert(
      "Call Cancelled",
      "No emergency call was logged. If you need help, please try calling again.",
      [{ text: "OK" }]
    );
    resetCallState();
  };

  const resetCallState = () => {
    setPendingCallData(null);
    hasShownConfirmationRef.current = false;
    if (confirmationTimerRef.current) {
      clearTimeout(confirmationTimerRef.current);
      confirmationTimerRef.current = null;
    }
  };

  const checkAndAttachGuestLogs = async () => {
    if (!user) return;
    
    try {
      const attachedCount = await attachUserToGuestLogs(user.uid);
      if (attachedCount > 0) {
        setGuestLogsAttached(true);
        Alert.alert(
          "Guest Calls Imported",
          `✅ ${attachedCount} emergency call${attachedCount > 1 ? 's' : ''} from your guest sessions have been imported to your account.`,
          [{ text: "OK" }]
        );
      }
    } catch (error) {
      console.error("Error attaching guest logs:", error);
    }
  };

  const loadEmergencyContacts = async () => {
    try {
      setLoading(true);
      const contacts = await fetchEmergencyContacts();
      
      const mappedServices: EmergencyService[] = contacts.map(contact => {
        // ✅ CDRRMO = MEDICAL (AUTOMATIC)
        let emergencyType = "other";
        let backgroundColor = "#9b59b6";
        
        if (contact.name.toLowerCase().includes('cdrrmo')) {
          emergencyType = "medical";
          backgroundColor = "#27ae60"; // GREEN for medical
        } else if (contact.name.toLowerCase().includes('police') || contact.name.toLowerCase().includes('pnp')) {
          emergencyType = "police";
          backgroundColor = "#2c3e50";
        } else if (contact.name.toLowerCase().includes('fire') || contact.name.toLowerCase().includes('bfp')) {
          emergencyType = "fire";
          backgroundColor = "#e74c3c";
        } else if (contact.name.toLowerCase().includes('disaster')) {
          emergencyType = "disaster";
          backgroundColor = "#f39c12";
        }

        return {
          id: contact.id,
          title: contact.name.split(' ')[0] || contact.name,
          subtitle: contact.name.split(' ').slice(1).join(' ') || "Emergency",
          icon: contact.icon,
          phoneNumber: contact.phoneNumber,
          backgroundColor: backgroundColor,
          emergencyType: emergencyType
        };
      });

      setEmergencyServices(mappedServices);
    } catch (error) {
      console.error("Error loading emergency contacts:", error);
      const fallbackServices: EmergencyService[] = [
        {
          id: 'cdrrmo',
          title: 'CDRRMO',
          subtitle: 'Medical Emergency',
          icon: '🏥',
          phoneNumber: '(043) 756-0127',
          backgroundColor: '#27ae60', // GREEN for medical
          emergencyType: 'medical'
        },
        {
          id: 'fire',
          title: 'BFP LIPA',
          subtitle: 'Fire Station',
          icon: '🔥',
          phoneNumber: '(043) 757-4618',
          backgroundColor: '#e74c3c',
          emergencyType: 'fire'
        },
        {
          id: 'police',
          title: 'LIPA PNP',
          subtitle: 'Police Station',
          icon: '🚔',
          phoneNumber: '(043) 702-3832',
          backgroundColor: '#2c3e50',
          emergencyType: 'police'
        },
        {
          id: 'disaster',
          title: 'CDRRMO',
          subtitle: 'Disaster Response',
          icon: '🌪️',
          phoneNumber: '(043) 756-0127',
          backgroundColor: '#f39c12',
          emergencyType: 'disaster'
        }
      ];
      setEmergencyServices(fallbackServices);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEmergencyContacts();
    setRefreshing(false);
  };

  const handleEmergencyCall = (service: EmergencyService) => {
    if (!user) {
      Alert.alert(
        "Authentication Required",
        "Please sign in to use SOS emergency services.",
        [
          {
            text: "Sign In",
            onPress: () => router.push('/auth')
          },
          {
            text: "Cancel",
            style: "cancel"
          }
        ]
      );
      return;
    }
    
    getCurrentLocationForSOS(service);
  };

  const getCurrentLocationForSOS = async (service: EmergencyService) => {
    if (!user) return;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      let locationData = null;
      
      if (status === 'granted') {
        try {
          console.log('Getting current location for SOS...');
          const loc = await Location.getCurrentPositionAsync({ 
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 0
          });
          
          const [address] = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude
          });

          locationData = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy,
            timestamp: loc.timestamp,
            address: address ? 
              `${address.street || ''} ${address.name || ''}, ${address.city || ''}, ${address.region || ''}`.trim() 
              : 'Location captured'
          };
          
          console.log('✅ SOS Location captured:', locationData);
        } catch (locError) {
          console.error('Error getting location:', locError);
        }
      } else {
        console.log('Location permission denied for SOS');
      }

      // Make the phone call
      await makeEmergencyCall(service, locationData);
      
    } catch (error) {
      console.error("Error getting location for SOS:", error);
      await makeEmergencyCall(service, null);
    }
  };

  const makeEmergencyCall = async (service: EmergencyService, location?: any) => {
    if (!user) return;

    try {
      const phoneUrl = `tel:${service.phoneNumber}`;
      const canCall = await Linking.canOpenURL(phoneUrl);
      
      if (!canCall) {
        Alert.alert("Error", "Phone calls are not supported on this device");
        return;
      }

      resetCallState();

      console.log('Initiating AUTHENTICATED emergency call to:', service.title);
      setPendingCallData({ 
        service, 
        callInitiatedAt: Date.now(),
        location: location
      });

      await Linking.openURL(phoneUrl);
      
    } catch (error) {
      console.error("Error making call:", error);
      Alert.alert("Error", "Unable to make phone call.", [{ text: "OK" }]);
      resetCallState();
    }
  };

  const getEnhancedAddress = async (latitude: number, longitude: number): Promise<AddressComponents | null> => {
    try {
      // Simple address detection for user mode
      const barangay = userProfile?.barangay || "Lipa City";
      
      return {
        barangay: barangay,
        city: "Lipa City",
        province: "Batangas",
        country: "Philippines",
        formattedAddress: `${barangay}, Lipa City, Batangas`,
        confidence: 80
      };
    } catch (error) {
      console.error("Geocoding failed:", error);
      return {
        barangay: userProfile?.barangay || "Lipa City",
        city: "Lipa City",
        province: "Batangas",
        country: "Philippines",
        formattedAddress: `${userProfile?.barangay || "Lipa City"}, Lipa City, Batangas`,
        confidence: 70
      };
    }
  };

  const renderConnectionStatus = () => {
    if (!isOnline) {
      return (
        <View style={styles.offlineIndicator}>
          <Text style={styles.offlineText}>Offline Mode - Calls will sync when online</Text>
        </View>
      );
    } else if (unsyncedCount > 0) {
      return (
        <View style={[styles.offlineIndicator, { backgroundColor: "rgba(255,165,0,0.3)" }]}>
          <Text style={styles.offlineText}>Syncing {unsyncedCount} call{unsyncedCount > 1 ? 's' : ''}...</Text>
        </View>
      );
    }
    return null;
  };

  const renderUserInfo = () => {
    return (
      <View style={styles.userInfoContainer}>
        <Text style={styles.userInfoText}>
          👋 Welcome, {userProfile?.name || user?.displayName || 'User'}!
        </Text>
        <Text style={styles.userInfoSubtext}>
          Your emergency calls are automatically tracked and synced
        </Text>
        {guestLogsAttached && (
          <Text style={styles.guestImportText}>
            ✅ Guest calls imported to your account
          </Text>
        )}
      </View>
    );
  };

  const renderEmergencyServices = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Loading emergency services...</Text>
        </View>
      );
    }

    if (emergencyServices.length === 0) {
      return (
        <View style={styles.noServicesContainer}>
          <Text style={styles.noServicesText}>No emergency services available</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadEmergencyContacts}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.servicesGrid}>
        {emergencyServices.map((service) => (
          <TouchableOpacity
            key={service.id}
            style={[styles.serviceCard, { backgroundColor: service.backgroundColor }]}
            onPress={() => handleEmergencyCall(service)}
            activeOpacity={0.8}
          >
            <Text style={styles.serviceIcon}>{service.icon}</Text>
            <Text style={styles.serviceTitle}>{service.title}</Text>
            <Text style={styles.serviceSubtitle}>{service.subtitle}</Text>
            <Text style={styles.serviceType}>{service.emergencyType.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#ffffff"
            colors={["#ffffff"]}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Image 
              source={require('@/assets/images/logo.png')} 
              style={styles.logoImage}
            />
            <Text style={styles.logoTitle}>LipaAlertHub</Text>
          </View>

          <View style={styles.sosHeader}>
            <Text style={styles.sosTitle}>SOS</Text>
            <Text style={styles.userBadge}>User Account</Text>
          </View>
        </View>

        {renderConnectionStatus()}
        {renderUserInfo()}

        <View style={styles.mainContent}>
          <View style={styles.questionSection}>
            <Text style={styles.sosQuestion}>EMERGENCY SERVICES</Text>
            <Text style={styles.sosQuestion}>DIRECT CALL</Text>
            <Text style={styles.locationText}>Lipa City Emergency Contacts</Text>
          </View>

          {renderEmergencyServices()}

          <View style={styles.infoSection}>
            <Text style={styles.infoTitle}>Automatic Agency Assignment:</Text>
            <Text style={styles.infoText}>• CDRRMO → Medical Emergencies</Text>
            <Text style={styles.infoText}>• Police → LIPA PNP Station</Text>
            <Text style={styles.infoText}>• Fire → BFP Lipa Fire Station</Text>
            <Text style={styles.infoText}>• Disaster → CDRRMO Response</Text>
            <Text style={styles.infoNote}>
              {user 
                ? "✅ Your location and barangay will be automatically detected and logged"
                : "Sign in to enable automatic location detection and call tracking"
              }
            </Text>
          </View>

          {recentSOSCalls.length > 0 && (
            <View style={styles.recentCallsSection}>
              <Text style={styles.recentCallsTitle}>Recent Emergency Calls</Text>
              {recentSOSCalls.slice(0, 3).map((call, index) => (
                <View key={call.id || index} style={styles.recentCallItem}>
                  <Text style={styles.recentCallAgency}>{call.selectedAgency}</Text>
                  <Text style={styles.recentCallTime}>
                    {call.calledAt?.toDate?.().toLocaleDateString() || 'Recent'}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#d73527",
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 100, // Extra padding for navbar
  },
  header: {
    paddingHorizontal: width * 0.06,
    paddingTop: 50,
    paddingBottom: height * 0.025,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: height * 0.035,
  },
  logoImage: {
    width: width * 0.1,
    height: width * 0.1,
    borderRadius: 10,
    marginRight: width * 0.03,
    resizeMode: 'contain',
  },
  logoTitle: {
    fontSize: width * 0.055,
    fontWeight: "700",
    color: "#ffffff",
  },
  sosHeader: {
    alignItems: 'center',
  },
  sosTitle: {
    fontSize: Math.min(width * 0.2, height * 0.1),
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: width * 0.035,
  },
  userBadge: {
    fontSize: width * 0.035,
    color: "#ffffff",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
    fontWeight: "600",
  },
  offlineIndicator: {
    backgroundColor: "rgba(0,0,0,0.3)",
    marginHorizontal: width * 0.06,
    paddingVertical: height * 0.01,
    paddingHorizontal: width * 0.04,
    borderRadius: 8,
    marginBottom: height * 0.02,
    alignItems: 'center',
  },
  offlineText: {
    color: "#ffffff",
    fontSize: width * 0.032,
    textAlign: "center",
    fontWeight: "500",
  },
  userInfoContainer: {
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: width * 0.06,
    padding: 16,
    borderRadius: 12,
    marginBottom: height * 0.02,
    alignItems: 'center',
  },
  userInfoText: {
    color: "#ffffff",
    fontSize: width * 0.035,
    fontWeight: "600",
    textAlign: 'center',
    marginBottom: 4,
  },
  userInfoSubtext: {
    color: "rgba(255,255,255,0.8)",
    fontSize: width * 0.03,
    textAlign: 'center',
    marginBottom: 4,
  },
  guestImportText: {
    color: "#27ae60",
    fontSize: width * 0.028,
    fontWeight: "600",
    textAlign: 'center',
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: width * 0.06,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  questionSection: {
    alignItems: 'center',
    marginBottom: height * 0.05,
  },
  sosQuestion: {
    fontSize: width * 0.045,
    color: "#ffffff",
    textAlign: 'center',
    fontWeight: "500",
    lineHeight: width * 0.055,
  },
  locationText: {
    fontSize: width * 0.035,
    color: "#ffffff",
    textAlign: 'center',
    fontWeight: "400",
    marginTop: height * 0.01,
    opacity: 0.9,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: height * 0.3,
  },
  loadingText: {
    color: "#ffffff",
    fontSize: width * 0.04,
    fontWeight: "500",
    marginTop: height * 0.02,
  },
  noServicesContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: height * 0.3,
  },
  noServicesText: {
    color: "#ffffff",
    fontSize: width * 0.04,
    fontWeight: "500",
    marginBottom: height * 0.02,
  },
  retryButton: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingVertical: height * 0.015,
    paddingHorizontal: width * 0.08,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ffffff",
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: width * 0.035,
    fontWeight: "600",
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: Math.min(width * 0.9, 400),
  },
  serviceCard: {
    width: '47%',
    aspectRatio: 1.05,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: height * 0.015,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    padding: 10,
  },
  serviceIcon: {
    fontSize: Math.min(width * 0.12, height * 0.06),
    marginBottom: height * 0.015,
  },
  serviceTitle: {
    fontSize: width * 0.037,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: 'center',
    letterSpacing: 0.8,
  },
  serviceSubtitle: {
    fontSize: width * 0.032,
    color: "#ffffff",
    textAlign: 'center',
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: height * 0.002,
  },
  serviceType: {
    fontSize: width * 0.025,
    color: "rgba(255,255,255,0.8)",
    textAlign: 'center',
    fontWeight: "600",
    marginTop: height * 0.005,
    backgroundColor: "rgba(0,0,0,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  infoSection: {
    marginTop: height * 0.04,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    width: '100%',
  },
  infoTitle: {
    color: "#ffffff",
    fontSize: width * 0.035,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: 'center',
  },
  infoText: {
    color: "#ffffff",
    fontSize: width * 0.03,
    fontWeight: "500",
    marginBottom: 4,
  },
  infoNote: {
    color: "rgba(255,255,255,0.8)",
    fontSize: width * 0.025,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  recentCallsSection: {
    marginTop: height * 0.03,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    width: '100%',
  },
  recentCallsTitle: {
    color: "#ffffff",
    fontSize: width * 0.035,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: 'center',
  },
  recentCallItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  recentCallAgency: {
    color: "#ffffff",
    fontSize: width * 0.03,
    fontWeight: "500",
  },
  recentCallTime: {
    color: "rgba(255,255,255,0.7)",
    fontSize: width * 0.025,
  },
});