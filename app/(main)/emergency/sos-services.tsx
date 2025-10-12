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
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

const { width, height } = Dimensions.get('window');
const GOOGLE_API_KEY = "AIzaSyACw2laKXQGTW634IejVAdK8m0PKngvaRo";

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
  dataSource: 'google_places' | 'google_geocoding' | 'coordinate_fallback';
  nearbyPlaces?: string[];
  distance?: number;
}

const MIN_CALL_DURATION = 3000;
const CONFIRMATION_DELAY = 1000;

const lipaBarangays = [
  "Adya", "Anilao", "Anilao-Labac", "Antipolo del Norte", "Antipolo del Sur",
  "Bagong Pook", "Balintawak", "Banaybanay", "Barangay 12", "Bolbok",
  "Bugtong na Pulo", "Bulacnin", "Bulaklakan", "Calamias", "Cumba",
  "Dagatan", "Duhatan", "Halang", "Inosloban", "Kayumanggi",
  "Latag", "Lodlod", "Lumbang", "Mabini", "Malagonlong",
  "Malitlit", "Marauoy", "Mataas na Lupa", "Munting Pulo", "Pagolingin Bata",
  "Pagolingin East", "Pagolingin West", "Pangao", "Pinagkawitan", "Pinagtongulan",
  "Plaridel", "Poblacion Barangay 1", "Poblacion Barangay 2", "Poblacion Barangay 3",
  "Poblacion Barangay 4", "Poblacion Barangay 5", "Poblacion Barangay 6",
  "Poblacion Barangay 7", "Poblacion Barangay 8", "Poblacion Barangay 9",
  "Poblacion Barangay 9-A", "Poblacion Barangay 10", "Poblacion Barangay 11",
  "Pusil", "Quezon", "Rizal", "Sabang", "Sampaguita",
  "San Benito", "San Carlos", "San Celestino", "San Francisco", "San Guillermo",
  "San Jose", "San Lucas", "San Salvador", "San Sebastian (Balagbag)", "Santo Niño",
  "Santo Toribio", "Sapac", "Sico", "Talisay", "Tambo",
  "Tangob", "Tanguay", "Tibig", "Tipacan"
];

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const matchBarangayName = (detectedName: string): string | null => {
  if (!detectedName || detectedName.length < 2) return null;
  
  const cleanName = detectedName.trim();
  
  const exactMatch = lipaBarangays.find(b => 
    b.toLowerCase() === cleanName.toLowerCase()
  );
  if (exactMatch) return exactMatch;
  
  if (cleanName.toLowerCase().includes('poblacion')) {
    const numberMatch = cleanName.match(/(\d+[-A-Za-z]*)/);
    if (numberMatch) {
      const num = numberMatch[1];
      const poblacionMatch = lipaBarangays.find(b => 
        b.toLowerCase().includes('poblacion') && b.toLowerCase().includes(num.toLowerCase())
      );
      if (poblacionMatch) return poblacionMatch;
    }
  }
  
  const barangayNumberMatch = cleanName.match(/barangay\s*(\d+)/i);
  if (barangayNumberMatch) {
    const num = barangayNumberMatch[1];
    const numberedMatch = lipaBarangays.find(b => 
      b.toLowerCase() === `barangay ${num}` ||
      b.toLowerCase().includes(`poblacion barangay ${num}`)
    );
    if (numberedMatch) return numberedMatch;
  }
  
  const partialMatch = lipaBarangays.find(b => 
    b.toLowerCase().includes(cleanName.toLowerCase()) ||
    cleanName.toLowerCase().includes(b.toLowerCase())
  );
  if (partialMatch) return partialMatch;
  
  return null;
};

const extractBarangayFromComponents = (components: any[]): string | null => {
  if (!components || !Array.isArray(components)) return null;
  
  const strategies = [
    'neighborhood',
    'sublocality_level_1',
    'sublocality_level_2',
    'sublocality',
    'administrative_area_level_3',
    'administrative_area_level_4',
    'locality'
  ];

  for (const strategy of strategies) {
    const component = components.find(comp => comp.types && comp.types.includes(strategy));
    if (component && component.long_name) {
      const name = component.long_name;
      
      if (!name.toLowerCase().includes('lipa city') && 
          !name.toLowerCase().includes('batangas') &&
          !name.toLowerCase().includes('philippines') &&
          !name.toLowerCase().includes('luzon') &&
          !name.toLowerCase().includes('calabarzon') &&
          name.length > 2) {
        
        let cleanName = name.trim();
        
        if (cleanName.toLowerCase().startsWith('barangay ')) {
          cleanName = cleanName.substring(9);
        }
        if (cleanName.toLowerCase().startsWith('brgy ')) {
          cleanName = cleanName.substring(5);
        }
        if (cleanName.toLowerCase().startsWith('brgy. ')) {
          cleanName = cleanName.substring(6);
        }
        
        if (cleanName.length > 0) {
          return cleanName;
        }
      }
    }
  }
  return null;
};

const getEnhancedAddress = async (latitude: number, longitude: number): Promise<AddressComponents | null> => {
  try {
    console.log(`🔍 Getting address for: ${latitude}, ${longitude}`);
    
    let establishmentData = null;
    let nearbyPlaces: string[] = [];
    let bestBarangay = null;
    let bestConfidence = 0;
    
    try {
      const placesResponse = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=200&key=${GOOGLE_API_KEY}`
      );
      const placesData = await placesResponse.json();
      
      if (placesData.status === 'OK' && placesData.results?.length > 0) {
        nearbyPlaces = placesData.results.slice(0, 5).map((p: any) => p.name);
        
        for (const place of placesData.results.slice(0, 3)) {
          const detailsResponse = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=address_components,formatted_address,name,types,geometry&key=${GOOGLE_API_KEY}`
          );
          const detailsData = await detailsResponse.json();
          
          if (detailsData.status === 'OK' && detailsData.result) {
            const placeDetail = detailsData.result;
            const placeLocation = placeDetail.geometry?.location;
            
            if (placeLocation) {
              const distance = calculateDistance(latitude, longitude, placeLocation.lat, placeLocation.lng);
              
              if (distance <= 200) {
                const isEstablishment = placeDetail.types && (
                  placeDetail.types.includes('establishment') ||
                  placeDetail.types.includes('shopping_mall') ||
                  placeDetail.types.includes('point_of_interest') ||
                  placeDetail.types.includes('school') ||
                  placeDetail.types.includes('university') ||
                  placeDetail.types.includes('store') ||
                  placeDetail.types.includes('hospital') ||
                  placeDetail.types.includes('restaurant') ||
                  placeDetail.types.includes('cafe') ||
                  placeDetail.types.includes('bank') ||
                  placeDetail.types.includes('pharmacy') ||
                  placeDetail.types.includes('church') ||
                  placeDetail.types.includes('government')
                );
                
                if (isEstablishment && !establishmentData) {
                  establishmentData = {
                    name: placeDetail.name,
                    addressComponents: placeDetail.address_components,
                    distance: Math.round(distance)
                  };
                  
                  const barangay = extractBarangayFromComponents(placeDetail.address_components);
                  if (barangay && barangay !== "Unknown Barangay") {
                    const matched = matchBarangayName(barangay);
                    if (matched) {
                      bestBarangay = matched;
                      bestConfidence = 95;
                      break;
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.log("Places API failed:", error);
    }
    
    if (!bestBarangay) {
      const resultTypes = ['premise', 'street_address', 'route', 'neighborhood', 'sublocality_level_1', 'sublocality'];
      
      for (const resultType of resultTypes) {
        try {
          const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&result_type=${resultType}&key=${GOOGLE_API_KEY}&language=en&region=PH`;
          const response = await fetch(geocodeUrl);
          const data = await response.json();
          
          if (data.status === 'OK' && data.results?.length > 0) {
            for (const result of data.results) {
              const barangay = extractBarangayFromComponents(result.address_components);
              if (barangay && barangay !== "Unknown Barangay") {
                const matched = matchBarangayName(barangay);
                if (matched) {
                  const confidence = resultType === 'premise' ? 95 : resultType === 'street_address' ? 90 : 85;
                  if (confidence > bestConfidence) {
                    bestBarangay = matched;
                    bestConfidence = confidence;
                    break;
                  }
                }
              }
            }
            if (bestBarangay) break;
          }
        } catch (error) {
          console.log(`Geocoding failed for ${resultType}`);
        }
      }
    }
    
    if (bestBarangay) {
      let formattedAddress = "";
      
      if (establishmentData) {
        formattedAddress = `${establishmentData.name}, ${bestBarangay}, Lipa City`;
      } else {
        formattedAddress = `${bestBarangay}, Lipa City`;
      }
      
      return {
        barangay: bestBarangay,
        city: "Lipa City",
        province: "Batangas",
        country: "Philippines",
        formattedAddress: formattedAddress,
        establishment: establishmentData?.name,
        confidence: bestConfidence,
        dataSource: establishmentData ? 'google_places' : 'google_geocoding',
        nearbyPlaces: nearbyPlaces.length > 0 ? nearbyPlaces : undefined,
        distance: establishmentData?.distance
      };
    }
    
    return null;
  } catch (error) {
    console.error("Geocoding failed:", error);
    return null;
  }
};

export default function UserSOSServices() {
  const { userProfile, user } = useAuth();
  const { saveSOSLog, isOnline, unsyncedCount } = useSOSSync();
  
  const [emergencyServices, setEmergencyServices] = useState<EmergencyService[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingCallData, setPendingCallData] = useState<{
    service: EmergencyService;
    callInitiatedAt: number;
    location?: any;
  } | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [callerName, setCallerName] = useState("");
  const [detectedLocation, setDetectedLocation] = useState<AddressComponents | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const confirmationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownConfirmationRef = useRef(false);

  useEffect(() => {
    if (user) {
      loadEmergencyContacts();
      setCallerName(userProfile?.name || user.displayName || "");
    }
  }, [user, userProfile]);

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
            setShowConfirmationModal(true);
          }
        }, CONFIRMATION_DELAY);
      } else {
        setPendingCallData(null);
      }
    }
    
    appStateRef.current = nextAppState;
  };

  const handleConfirmCall = async () => {
    if (!pendingCallData || !user) return;

    setShowConfirmationModal(false);

    const { service, location } = pendingCallData;
    const serviceTitle = `${service.title} ${service.subtitle}`.trim();

    try {
      let userBarangay = detectedLocation?.barangay || userProfile?.barangay;
      const barangay = userBarangay || "Lipa City";
      const reporterPhone = userProfile?.phoneNumber || undefined;
      const userName = userProfile?.name || user.displayName || "User";

      const reporterLocation = location ? {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        timestamp: location.timestamp,
        address: detectedLocation?.formattedAddress || location.address || `${barangay}, Lipa City`
      } : undefined;

      const sosLogData = {
        userId: user.uid,
        userName: userName,
        reporterPhone: reporterPhone,
        reporterBarangay: barangay,
        reporterLocation: reporterLocation,
        selectedAgency: serviceTitle,
        phoneNumber: service.phoneNumber,
        calledAt: new Date().toISOString(),
        fromOffline: false,
        emergencyType: service.emergencyType,
        barangay: barangay,
        location: reporterLocation,
        ...(detectedLocation && {
          establishment: detectedLocation.establishment,
          formattedAddress: detectedLocation.formattedAddress,
          confidence: detectedLocation.confidence,
          dataSource: detectedLocation.dataSource,
          nearbyPlaces: detectedLocation.nearbyPlaces
        })
      };

      console.log('Saving AUTHENTICATED SOS log:', sosLogData);

      const result = await saveSOSLog(sosLogData);
      
      if (result.success) {
        const locationText = detectedLocation?.establishment 
          ? `${detectedLocation.establishment}, ${barangay}`
          : barangay;
          
        Alert.alert(
          "Call Logged Successfully",
          isOnline 
            ? `Your ${service.emergencyType} emergency call has been recorded and sent to ${serviceTitle}.\n\nCaller: ${userName}\nLocation: ${locationText}\n\nYou'll receive a notification once reviewed.`
            : `Your ${service.emergencyType} emergency call has been saved and will sync when online.\n\nCaller: ${userName}\nLocation: ${locationText}`,
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

  const handleCancelCall = () => {
    setShowConfirmationModal(false);
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
    setDetectedLocation(null);
    setIsDetectingLocation(false);
    if (confirmationTimerRef.current) {
      clearTimeout(confirmationTimerRef.current);
      confirmationTimerRef.current = null;
    }
  };

  const loadEmergencyContacts = async () => {
    try {
      setLoading(true);
      const contacts = await fetchEmergencyContacts();
      
      const mappedServices: EmergencyService[] = contacts.map(contact => {
        let emergencyType = "other";
        let backgroundColor = "#9b59b6";
        
        if (contact.name.toLowerCase().includes('police') || contact.name.toLowerCase().includes('pnp')) {
          emergencyType = "police";
          backgroundColor = "#2c3e50";
        } else if (contact.name.toLowerCase().includes('fire') || contact.name.toLowerCase().includes('bfp')) {
          emergencyType = "fire";
          backgroundColor = "#e74c3c";
        } else if (contact.name.toLowerCase().includes('medical') || contact.name.toLowerCase().includes('hospital')) {
          emergencyType = "medical";
          backgroundColor = "#27ae60";
        } else if (contact.name.toLowerCase().includes('disaster') || contact.name.toLowerCase().includes('cdrrmo')) {
          emergencyType = "medical";
          backgroundColor = "#27ae60";
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
      setIsDetectingLocation(true);
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
          
          const enhancedAddress = await getEnhancedAddress(loc.coords.latitude, loc.coords.longitude);
          if (enhancedAddress) {
            setDetectedLocation(enhancedAddress);
            console.log('✅ Enhanced location detected:', enhancedAddress.formattedAddress);
          }
          
          console.log('✅ SOS Location captured:', locationData);
        } catch (locError) {
          console.error('Error getting location:', locError);
        }
      } else {
        console.log('Location permission denied for SOS');
      }

      setIsDetectingLocation(false);
      await makeEmergencyCall(service, locationData);
      
    } catch (error) {
      console.error("Error getting location for SOS:", error);
      setIsDetectingLocation(false);
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

  const renderConfirmationModal = () => {
    if (!pendingCallData) return null;

    const { service } = pendingCallData;
    const serviceTitle = `${service.title} ${service.subtitle}`.trim();

    return (
      <Modal
        visible={showConfirmationModal}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCancelCall}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Emergency Call Confirmation</Text>
            
            <View style={styles.callInfoSection}>
              <Text style={styles.callInfoLabel}>Service Called:</Text>
              <Text style={styles.callInfoValue}>{serviceTitle}</Text>
              
              <Text style={styles.callInfoLabel}>Emergency Type:</Text>
              <Text style={styles.callInfoValue}>{service.emergencyType.toUpperCase()}</Text>
            </View>

            <View style={styles.locationSection}>
              <Text style={styles.locationTitle}>📍 Detected Location</Text>
              {isDetectingLocation ? (
                <View style={styles.locationDetecting}>
                  <ActivityIndicator size="small" color="#d73527" />
                  <Text style={styles.locationDetectingText}>Detecting your location...</Text>
                </View>
              ) : detectedLocation ? (
                <View style={styles.locationDetected}>
                  <Text style={styles.locationText}>{detectedLocation.formattedAddress}</Text>
                  <Text style={styles.locationConfidence}>
                    Confidence: {detectedLocation.confidence}%
                  </Text>
                </View>
              ) : (
                <Text style={styles.locationText}>
                  {userProfile?.barangay || "Lipa City"}, Batangas
                </Text>
              )}
              <Text style={styles.locationNote}>
                ℹ️ Your location is automatically detected and will be sent to the emergency responders
              </Text>
            </View>

            <View style={styles.callerInfoSection}>
              <Text style={styles.callerInfoLabel}>Caller:</Text>
              <Text style={styles.callerInfoValue}>
                {userProfile?.name || user?.displayName || "User"}
              </Text>
            </View>

            <Text style={styles.confirmQuestion}>
              Did you complete the emergency call?
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleCancelCall}
              >
                <Text style={styles.cancelButtonText}>No, I cancelled</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleConfirmCall}
              >
                <Text style={styles.confirmButtonText}>Yes, I called</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

        <View style={styles.mainContent}>
          <View style={styles.questionSection}>
            <Text style={styles.sosQuestion}>EMERGENCY SERVICES</Text>
            <Text style={styles.sosQuestion}>DIRECT CALL</Text>
            <Text style={styles.locationHeaderText}>Lipa City Emergency Contacts</Text>
            <Text style={styles.locationHeaderNote}>
              ℹ️ Location automatically detected during emergency calls
            </Text>
          </View>

          {renderEmergencyServices()}

          <View style={styles.infoSection}>
            <Text style={styles.infoTitle}>How It Works:</Text>
            <Text style={styles.infoText}>1. Tap emergency service to call</Text>
            <Text style={styles.infoText}>2. Location is automatically detected</Text>
            <Text style={styles.infoText}>3. Return to app after call</Text>
            <Text style={styles.infoText}>4. Confirm call with your name</Text>
            <Text style={styles.infoText}>5. Emergency logged and tracked</Text>
            <Text style={styles.infoNote}>
              ✅ Your exact location, name, and emergency details will be sent to responders
            </Text>
          </View>
        </View>
      </ScrollView>

      {renderConfirmationModal()}
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
    paddingBottom: 100,
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
  },
  offlineText: {
    color: "#ffffff",
    fontSize: width * 0.032,
    textAlign: "center",
    fontWeight: "500",
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
  locationHeaderText: {
    fontSize: width * 0.035,
    color: "#ffffff",
    textAlign: 'center',
    fontWeight: "400",
    marginTop: height * 0.01,
    opacity: 0.9,
  },
  locationHeaderNote: {
    fontSize: width * 0.028,
    color: "rgba(255,255,255,0.8)",
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: height * 0.008,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  modalTitle: {
    fontSize: width * 0.05,
    fontWeight: "800",
    color: "#d73527",
    textAlign: 'center',
    marginBottom: 20,
  },
  callInfoSection: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  callInfoLabel: {
    fontSize: width * 0.032,
    color: "#666",
    fontWeight: "600",
    marginTop: 8,
  },
  callInfoValue: {
    fontSize: width * 0.038,
    color: "#2c3e50",
    fontWeight: "700",
    marginTop: 4,
  },
  locationSection: {
    backgroundColor: "#e8f5e9",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  locationTitle: {
    fontSize: width * 0.038,
    fontWeight: "700",
    color: "#27ae60",
    marginBottom: 8,
  },
  locationDetecting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  locationDetectingText: {
    fontSize: width * 0.032,
    color: "#666",
    marginLeft: 8,
  },
  locationDetected: {
    paddingVertical: 4,
  },
  locationText: {
    fontSize: width * 0.034,
    color: "#2c3e50",
    fontWeight: "600",
    marginBottom: 4,
  },
  locationConfidence: {
    fontSize: width * 0.028,
    color: "#27ae60",
    fontWeight: "500",
  },
  locationNote: {
    fontSize: width * 0.026,
    color: "#666",
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 16,
  },
  callerInfoSection: {
    backgroundColor: "#e3f2fd",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  callerInfoLabel: {
    fontSize: width * 0.032,
    color: "#666",
    fontWeight: "600",
    marginBottom: 4,
  },
  callerInfoValue: {
    fontSize: width * 0.042,
    color: "#1976d2",
    fontWeight: "800",
  },
  confirmQuestion: {
    fontSize: width * 0.038,
    fontWeight: "600",
    color: "#2c3e50",
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: "#e0e0e0",
  },
  cancelButtonText: {
    fontSize: width * 0.036,
    fontWeight: "700",
    color: "#666",
  },
  confirmButton: {
    backgroundColor: "#d73527",
  },
  confirmButtonText: {
    fontSize: width * 0.036,
    fontWeight: "700",
    color: "#ffffff",
  },
});