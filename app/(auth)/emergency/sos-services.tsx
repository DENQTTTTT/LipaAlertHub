import { useAuth } from "@/hooks/useAuth";
import { useSOSSync } from "@/hooks/useSOSSync";
import { fetchEmergencyContacts } from "@/services/firebase";
import * as Location from "expo-location";
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

const MIN_CALL_DURATION = 3000;
const CONFIRMATION_DELAY = 1000;

const isWithinLipaCityBounds = (latitude: number, longitude: number): boolean => {
  const LIPA_BOUNDS = {
    north: 14.0500,
    south: 13.8500,
    east: 121.2500,
    west: 121.0500
  };
  return (
    latitude >= LIPA_BOUNDS.south &&
    latitude <= LIPA_BOUNDS.north &&
    longitude >= LIPA_BOUNDS.west &&
    longitude <= LIPA_BOUNDS.east
  );
};

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

// ENHANCED: Better barangay matching
const matchBarangayName = (detectedName: string): string | null => {
  if (!detectedName || detectedName.length < 2) return null;
  
  const cleanName = detectedName.trim();
  
  // Direct exact match (case-insensitive)
  const exactMatch = lipaBarangays.find(b => 
    b.toLowerCase() === cleanName.toLowerCase()
  );
  if (exactMatch) {
    console.log(`✅ Exact match: ${exactMatch}`);
    return exactMatch;
  }
  
  // Handle Poblacion barangays specifically
  if (cleanName.toLowerCase().includes('poblacion')) {
    const numberMatch = cleanName.match(/(\d+[-A-Za-z]*)/);
    if (numberMatch) {
      const num = numberMatch[1];
      const poblacionMatch = lipaBarangays.find(b => 
        b.toLowerCase().includes('poblacion') && b.toLowerCase().includes(num.toLowerCase())
      );
      if (poblacionMatch) {
        console.log(`✅ Poblacion match: ${poblacionMatch}`);
        return poblacionMatch;
      }
    }
  }
  
  // Handle numbered barangays
  const barangayNumberMatch = cleanName.match(/barangay\s*(\d+)/i);
  if (barangayNumberMatch) {
    const num = barangayNumberMatch[1];
    const numberedMatch = lipaBarangays.find(b => 
      b.toLowerCase() === `barangay ${num}` ||
      b.toLowerCase().includes(`poblacion barangay ${num}`)
    );
    if (numberedMatch) {
      console.log(`✅ Numbered barangay match: ${numberedMatch}`);
      return numberedMatch;
    }
  }
  
  // Partial match
  const partialMatch = lipaBarangays.find(b => 
    b.toLowerCase().includes(cleanName.toLowerCase()) ||
    cleanName.toLowerCase().includes(b.toLowerCase())
  );
  if (partialMatch) {
    console.log(`✅ Partial match: ${partialMatch}`);
    return partialMatch;
  }
  
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

// ENHANCED: Better establishment detection with larger radius
const getEnhancedAddress = async (latitude: number, longitude: number): Promise<AddressComponents | null> => {
  try {
    console.log(`🔍 Getting address for: ${latitude}, ${longitude}`);
    
    let establishmentData = null;
    let nearbyPlaces: string[] = [];
    let bestBarangay = null;
    let bestConfidence = 0;
    
    // STEP 1: Try Places API with LARGER radius for establishments
    try {
      const placesResponse = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=200&key=${GOOGLE_API_KEY}`
      );
      const placesData = await placesResponse.json();
      
      console.log(`Places API status: ${placesData.status}`);
      
      if (placesData.status === 'OK' && placesData.results?.length > 0) {
        nearbyPlaces = placesData.results.slice(0, 5).map((p: any) => p.name);
        console.log(`Found ${placesData.results.length} nearby places`);
        
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
              console.log(`Place: ${placeDetail.name}, Distance: ${Math.round(distance)}m`);
              
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
                  console.log(`📍 Found establishment: ${placeDetail.name} (${Math.round(distance)}m)`);
                  
                  const barangay = extractBarangayFromComponents(placeDetail.address_components);
                  if (barangay && barangay !== "Unknown Barangay") {
                    const matched = matchBarangayName(barangay);
                    if (matched) {
                      bestBarangay = matched;
                      bestConfidence = 95;
                      console.log(`✅ Barangay from establishment: ${matched}`);
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
    
    // STEP 2: If no barangay from establishment, try geocoding
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
                    console.log(`✅ Barangay from ${resultType}: ${matched}`);
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
    
    // STEP 3: Build formatted address
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
    
    console.log("❌ Could not determine barangay, using coordinate fallback");
    return getCoordinateBasedAddress(latitude, longitude);
  } catch (error) {
    console.error("Geocoding failed:", error);
    return getCoordinateBasedAddress(latitude, longitude);
  }
};

const getCoordinateBasedAddress = (latitude: number, longitude: number): AddressComponents => {
  const barangay = determineFallbackBarangay(latitude, longitude);
  
  return {
    barangay,
    city: 'Lipa City',
    province: 'Batangas',
    country: 'Philippines',
    formattedAddress: `${barangay}, Lipa City, Batangas`,
    confidence: 70,
    dataSource: 'coordinate_fallback'
  };
};

const determineFallbackBarangay = (lat: number, lng: number): string => {
  console.log(`Determining fallback barangay for: ${lat}, ${lng}`);
  
  if (lat >= 13.925 && lat <= 13.945 && lng >= 121.165 && lng <= 121.185) {
    return "Pinagkawitan";
  }
  
  if (lat >= 13.940 && lat <= 13.943 && lng >= 121.160 && lng <= 121.165) {
    return "Poblacion Barangay 1";
  }
  if (lat >= 13.938 && lat <= 13.942 && lng >= 121.158 && lng <= 121.163) {
    return "Poblacion Barangay 2";
  }
  if (lat >= 13.935 && lat <= 13.940 && lng >= 121.158 && lng <= 121.168) {
    return "Poblacion Barangay 3";
  }
  if (lat >= 13.933 && lat <= 13.938 && lng >= 121.156 && lng <= 121.166) {
    return "Poblacion Barangay 4";
  }
  
  if (lat >= 13.950 && lat <= 13.975 && lng >= 121.150 && lng <= 121.170) {
    return "Antipolo del Norte";
  }
  if (lat >= 13.920 && lat <= 13.950 && lng >= 121.145 && lng <= 121.165) {
    return "Antipolo del Sur";
  }
  
  if (lng >= 121.185) {
    if (lat >= 13.905 && lat <= 13.925) return "Sico";
    if (lat >= 13.925 && lat <= 13.940) return "Sabang";
    if (lat >= 13.940 && lat <= 13.955) return "Bagong Pook";
    return "Sabang";
  }
  
  if (lng <= 121.155) {
    if (lat >= 13.930 && lat <= 13.960) return "Mabini";
    if (lat >= 13.910 && lat <= 13.940) return "Mabini";
    if (lat >= 13.890 && lat <= 13.920) return "San Carlos";
  }
  
  if (lat <= 13.920) {
    if (lng >= 121.150 && lng <= 121.175) return "Tambo";
    if (lng >= 121.155 && lng <= 121.180) return "Tibig";
    if (lng >= 121.140 && lng <= 121.160) return "San Carlos";
    return "San Carlos";
  }
  
  if (lat >= 13.920 && lat <= 13.950 && lng >= 121.155 && lng <= 121.175) {
    return "Marauoy";
  }
  
  return "Poblacion Barangay 1";
};

export default function SOSServices() {
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
  
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const confirmationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownConfirmationRef = useRef(false);

  useEffect(() => {
    loadEmergencyContacts();
  }, []);

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
    const serviceTitle = `${service.title} ${service.subtitle}`.trim();

    try {
      let userBarangay = userProfile?.barangay;
      let addressInfo = null;
      
      // If we have location from the call, use enhanced address detection
      if (location) {
        addressInfo = await getEnhancedAddress(location.latitude, location.longitude);
        if (addressInfo) {
          userBarangay = addressInfo.barangay;
          console.log(`✅ Enhanced address detected: ${addressInfo.formattedAddress}`);
        }
      }
      
      // Fallback to profile barangay or default
      const barangay = userBarangay || "Poblacion Barangay 1";
      const reporterPhone = userProfile?.phoneNumber || undefined;

      const sosLog = {
        userId: user?.uid || 'guest',
        userName: user ? (userProfile?.name || user.displayName || "User") : "Guest",
        reporterPhone: reporterPhone,
        reporterBarangay: barangay,
        barangay: barangay,
        selectedAgency: serviceTitle,
        phoneNumber: service.phoneNumber,
        calledAt: new Date().toISOString(),
        fromOffline: !user,
        emergencyType: service.emergencyType,
        reporterLocation: location,
        location: location,
        // Add enhanced address info if available
        ...(addressInfo && {
          establishment: addressInfo.establishment,
          formattedAddress: addressInfo.formattedAddress,
          confidence: addressInfo.confidence,
          dataSource: addressInfo.dataSource,
          nearbyPlaces: addressInfo.nearbyPlaces
        })
      };

      console.log('Saving SOS log with enhanced location:', {
        reporterBarangay: barangay,
        establishment: addressInfo?.establishment,
        location: location,
        emergencyType: service.emergencyType
      });

      const result = await saveSOSLog(sosLog);
      
      if (result.success) {
        const locationText = addressInfo?.establishment 
          ? `${addressInfo.establishment}, ${barangay}`
          : barangay;
          
        if (user) {
          Alert.alert(
            "Call Logged Successfully",
            isOnline 
              ? `Your ${service.emergencyType} emergency call has been recorded and sent to ${serviceTitle}.\n\nLocation: ${locationText}\nYou'll receive a notification once reviewed.`
              : `Your ${service.emergencyType} emergency call has been saved and will sync when online.\n\nLocation: ${locationText}`,
            [{ text: "OK" }]
          );
        } else {
          Alert.alert(
            "Emergency Call Made",
            `Your ${service.emergencyType} call to ${serviceTitle} has been saved.\n\nLocation: ${locationText}\nSign in to track this call and receive updates.`,
            [{ text: "OK" }]
          );
        }
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
          id: 'police',
          title: 'LIPA PNP',
          subtitle: 'Police Station',
          icon: '🚔',
          phoneNumber: '09777449692',
          backgroundColor: '#2c3e50',
          emergencyType: 'police'
        },
        {
          id: 'fire',
          title: 'BFP LIPA',
          subtitle: 'Fire Station',
          icon: '🔥',
          phoneNumber: '09275758065',
          backgroundColor: '#e74c3c',
          emergencyType: 'fire'
        },
        {
          id: 'cdrrmo',
          title: 'CDRRMO',
          subtitle: 'Disaster Response',
          icon: '🌪️',
          phoneNumber: '09154635005',
          backgroundColor: '#f39c12',
          emergencyType: 'disaster'
        },
        {
          id: 'medical',
          title: 'Ospital ng Lipa',
          subtitle: 'Hospital & Ambulance',
          icon: '🏥',
          phoneNumber: '09171499387',
          backgroundColor: '#27ae60',
          emergencyType: 'medical'
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
    getCurrentLocationForSOS(service);
  };

  const getCurrentLocationForSOS = async (service: EmergencyService) => {
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
    try {
      const phoneUrl = `tel:${service.phoneNumber}`;
      const canCall = await Linking.canOpenURL(phoneUrl);
      
      if (!canCall) {
        Alert.alert("Error", "Phone calls are not supported on this device");
        return;
      }

      resetCallState();

      console.log('Initiating emergency call to:', service.title);
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
    if (!user) {
      return (
        <View style={[styles.offlineIndicator, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
          <Text style={styles.offlineText}>Guest Mode - Sign in to track your calls</Text>
        </View>
      );
    } else if (!isOnline) {
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
              source={require('../../../assets/images/logo.png')} 
              style={styles.logoImage}
            />
            <Text style={styles.logoTitle}>LipaAlertHub</Text>
          </View>

          <View style={styles.sosHeader}>
            <Text style={styles.sosTitle}>SOS</Text>
          </View>
        </View>

        {renderConnectionStatus()}

        <View style={styles.mainContent}>
          <View style={styles.questionSection}>
            <Text style={styles.sosQuestion}>EMERGENCY SERVICES</Text>
            <Text style={styles.sosQuestion}>DIRECT CALL</Text>
            <Text style={styles.locationText}>Lipa City Emergency Contacts</Text>
          </View>

          {renderEmergencyServices()}

          <View style={styles.infoSection}>
            <Text style={styles.infoTitle}>Automatic Agency Assignment:</Text>
            <Text style={styles.infoText}>• Police → LIPA PNP Station</Text>
            <Text style={styles.infoText}>• Fire → BFP Lipa Fire Station</Text>
            <Text style={styles.infoText}>• Disaster → CDRRMO Lipa</Text>
            <Text style={styles.infoText}>• Medical → Lipa Medical Center</Text>
            <Text style={styles.infoNote}>Your location and barangay will be automatically detected</Text>
          </View>
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
    paddingBottom: 30,
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
});