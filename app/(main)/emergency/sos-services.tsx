// app/emergency/sos-services.tsx - Emergency Services with Firestore Integration
import { useAuth } from "@/hooks/useAuth";
import {
  checkFirestoreConnectivity,
  fetchEmergencyContacts,
  formatEmergencyContactForDisplay
} from "@/services/firebase";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
}

export default function SOSServices() {
  const { userProfile } = useAuth();
  const [emergencyServices, setEmergencyServices] = useState<EmergencyService[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Load emergency contacts on component mount
  useEffect(() => {
    loadEmergencyContacts();
  }, [userProfile?.barangay]);

  const loadEmergencyContacts = async () => {
    try {
      setLoading(true);
      
      // Check connectivity
      const connectivity = await checkFirestoreConnectivity();
      setIsOnline(connectivity);
      
      // Fetch contacts based on user's barangay
      const contacts = await fetchEmergencyContacts(userProfile?.barangay);
      
      // Format contacts for display
      const formattedServices = contacts.map(contact => 
        formatEmergencyContactForDisplay(contact)
      );
      
      setEmergencyServices(formattedServices);
      console.log(`Loaded ${formattedServices.length} emergency services for barangay: ${userProfile?.barangay || 'city-wide'}`);
      
    } catch (error) {
      console.error("Error loading emergency contacts:", error);
      // Error handling is already done in fetchEmergencyContacts with fallback
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
    const serviceTitle = `${service.title} ${service.subtitle}`.trim();
    const connectivityStatus = isOnline ? "" : "\n\n⚠️ Offline Mode - Using cached data";
    
    Alert.alert(
      `Call ${serviceTitle}?`,
      `This will dial ${service.phoneNumber}${connectivityStatus}`,
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Call Now",
          style: "destructive",
          onPress: () => {
            const phoneUrl = `tel:${service.phoneNumber}`;
            Linking.canOpenURL(phoneUrl)
              .then((supported) => {
                if (!supported) {
                  Alert.alert("Error", "Phone calls are not supported on this device");
                } else {
                  return Linking.openURL(phoneUrl);
                }
              })
              .catch((err) => {
                console.error("Error making phone call:", err);
                Alert.alert("Error", "Unable to make phone call");
              });
          }
        }
      ]
    );
  };

  const handleNationalEmergency = () => {
    const connectivityStatus = isOnline ? "" : "\n\n⚠️ Offline Mode";
    
    Alert.alert(
      "Call National Emergency?",
      `This will dial 911 - National Emergency Hotline${connectivityStatus}`,
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Call 911",
          style: "destructive",
          onPress: () => {
            const phoneUrl = "tel:911";
            Linking.canOpenURL(phoneUrl)
              .then((supported) => {
                if (!supported) {
                  Alert.alert("Error", "Phone calls are not supported on this device");
                } else {
                  return Linking.openURL(phoneUrl);
                }
              })
              .catch((err) => {
                console.error("Error making phone call:", err);
                Alert.alert("Error", "Unable to make phone call");
              });
          }
        }
      ]
    );
  };

  const renderConnectionStatus = () => {
    if (!isOnline) {
      return (
        <View style={styles.offlineIndicator}>
          <Text style={styles.offlineText}>⚠️ Offline Mode - Using cached contacts</Text>
        </View>
      );
    }
    return null;
  };

  const renderEmergencyServices = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Loading emergency contacts...</Text>
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
        {/* Header with Logo - Positioned at top left */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Image 
              source={require('../../../assets/images/logo.png')} 
              style={styles.logoImage}
            />
            <Text style={styles.logoTitle}>LipaAlertHub</Text>
          </View>

          {/* SOS Title - Positioned below logo */}
          <View style={styles.sosHeader}>
            <Text style={styles.sosTitle}>SOS</Text>
          </View>
        </View>

        {/* Connection Status */}
        {renderConnectionStatus()}

        {/* Main Content */}
        <View style={styles.mainContent}>
          {/* Question Text */}
          <View style={styles.questionSection}>
            <Text style={styles.sosQuestion}>WHAT KIND OF SERVICE</Text>
            <Text style={styles.sosQuestion}>DO YOU NEED?</Text>
            {userProfile?.barangay && (
              <Text style={styles.barangayText}>Barangay {userProfile.barangay}</Text>
            )}
          </View>

          {/* Emergency Services Grid */}
          {renderEmergencyServices()}
        </View>

        {/* National Emergency Button */}
        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={styles.nationalEmergencyButton}
            onPress={handleNationalEmergency}
            activeOpacity={0.8}
          >
            <Text style={styles.phoneIcon}>📞</Text>
            <View style={styles.buttonTextContainer}>
              <Text style={styles.nationalEmergencyText}>CALL 911 - NATIONAL</Text>
              <Text style={styles.nationalEmergencyText}>EMERGENCY</Text>
            </View>
          </TouchableOpacity>
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
  },
  header: {
    paddingHorizontal: width * 0.06, // 6% of screen width
    paddingBottom: height * 0.025, // 2.5% of screen height
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: height * 0.035, // 3.5% of screen height
  },
  logoImage: {
    width: width * 0.1, // 10% of screen width
    height: width * 0.1, // Keep square
    borderRadius: 10,
    marginRight: width * 0.03, // 3% spacing
    resizeMode: 'contain',
  },
  logoTitle: {
    fontSize: width * 0.055, // Responsive font size
    fontWeight: "700",
    color: "#ffffff",
  },
  sosHeader: {
    alignItems: 'center',
  },
  sosTitle: {
    fontSize: Math.min(width * 0.2, height * 0.1), // Responsive, smaller than main SOS screen
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: width * 0.035,
  },
  offlineIndicator: {
    backgroundColor: "rgba(0,0,0,0.3)",
    marginHorizontal: width * 0.06,
    paddingVertical: height * 0.01,
    paddingHorizontal: width * 0.04,
    borderRadius: 8,
    marginBottom: height * 0.02,
  },
  offlineText: {
    color: "#ffffff",
    fontSize: width * 0.032,
    textAlign: "center",
    fontWeight: "500",
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: width * 0.06, // 6% padding
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  questionSection: {
    alignItems: 'center',
    marginBottom: height * 0.05, // 5% of screen height
  },
  sosQuestion: {
    fontSize: width * 0.045, // Responsive font size
    color: "#ffffff",
    textAlign: 'center',
    fontWeight: "500",
    lineHeight: width * 0.055, // Responsive line height
  },
  barangayText: {
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
    maxWidth: Math.min(width * 0.9, 400), // Max width with responsive design
  },
  serviceCard: {
    width: '47%', // Slightly less than 50% to allow for spacing
    aspectRatio: 1.05,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: height * 0.015, // 1.5% of screen height
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  serviceIcon: {
    fontSize: Math.min(width * 0.12, height * 0.06), // Responsive emoji size
    marginBottom: height * 0.015, // 1.5% spacing
  },
  serviceTitle: {
    fontSize: width * 0.037, // Responsive font size
    fontWeight: "800",
    color: "#d73527",
    textAlign: 'center',
    letterSpacing: 0.8,
  },
  serviceSubtitle: {
    fontSize: width * 0.032, // Responsive font size
    color: "#d73527",
    textAlign: 'center',
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: height * 0.002, // Small spacing
  },
  bottomSection: {
    paddingHorizontal: width * 0.06, // 6% padding
    paddingTop: height * 0.025, // 2.5% padding
    paddingBottom: height * 0.02, // Bottom padding
  },
  nationalEmergencyButton: {
    backgroundColor: "transparent",
    borderRadius: 16,
    paddingVertical: height * 0.025, // 2.5% of screen height
    paddingHorizontal: width * 0.05, // 5% of screen width
    alignItems: 'center',
    borderWidth: 3,
    borderColor: "#ffffff",
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: height * 0.08, // Minimum height for button
  },
  phoneIcon: {
    fontSize: width * 0.06, // Responsive icon size
    marginRight: width * 0.03, // 3% spacing
  },
  buttonTextContainer: {
    alignItems: 'center',
  },
  nationalEmergencyText: {
    color: "#ffffff",
    fontSize: width * 0.04, // Responsive text size
    fontWeight: "800",
    textAlign: 'center',
    letterSpacing: 1.2,
    lineHeight: width * 0.045, // Responsive line height
  },
});