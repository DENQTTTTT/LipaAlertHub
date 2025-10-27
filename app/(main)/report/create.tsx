//code from the app create report form 
import { Ionicons } from "@expo/vector-icons";
import { Picker } from '@react-native-picker/picker';
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from "expo-location";
import { router } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { useAuth } from "../../../hooks/useAuth";
import { auth, db } from "../../../services/firebase";
import { checkDuplicateReport, submitIncidentReport } from "../../../services/reports";

const { width } = Dimensions.get('window');

interface UserData {
  name: string;
  email: string;
  number: string;
  createdAt: any;
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
  "Bagong Pook", "Balintawak", "Banaybanay", "Bolbok", "Bugtong na Pulo",
  "Bulacnin", "Bulaklakan", "Calamias", "Cumba", "Dagatan",
  "Duhatan", "Fernando Air Base", "Halang", "Inosluban", "Kayumanggi",
  "Latag", "Lodlod", "Lumbang", "Mabini", "Malagonlong",
  "Malitlit", "Marawoy", "Mataas na Lupa", "Munting Pulo", "Pagolingin Bata",
  "Pagolingin East", "Pagolingin West", "Pangao", "Pinagkawitan", "Pinagtongulan",
  "Plaridel", "Poblacion Barangay 1", "Poblacion Barangay 2", "Poblacion Barangay 3",
  "Poblacion Barangay 4", "Poblacion Barangay 5", "Poblacion Barangay 6",
  "Poblacion Barangay 7", "Poblacion Barangay 8", "Poblacion Barangay 9",
  "Poblacion Barangay 9-A", "Poblacion Barangay 10", "Poblacion Barangay 11",
  "Pusil", "Quezon", "Rizal", "Sabang", "Sampaguita",
  "San Benito", "San Carlos", "San Celestino", "San Francisco", "San Guillermo",
  "San Isidro", "San Jose", "San Lucas", "San Salvador", "San Sebastian", 
  "Santo Niño", "Santo Toribio", "Sapac", "Sico", "Talisay",
  "Tambo", "Tangob", "Tangway", "Tibig", "Tipacan"
];

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

const matchBarangayName = (detectedName: string): string | null => {
  if (!detectedName || detectedName.length < 2) return null;
  
  const cleanName = detectedName.trim();
  
  const exactMatch = lipaBarangays.find(b => 
    b.toLowerCase() === cleanName.toLowerCase()
  );
  if (exactMatch) {
    console.log(`✅ Exact match: ${exactMatch}`);
    return exactMatch;
  }
  
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

const getEnhancedAddress = async (latitude: number, longitude: number): Promise<AddressComponents | null> => {
  const GOOGLE_API_KEY = "AIzaSyACw2laKXQGTW634IejVAdK8m0PKngvaRo";
  
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
    
    console.log("❌ Could not determine barangay");
    return null;
  } catch (error) {
    console.error("Geocoding failed:", error);
    return null;
  }
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

const processImageWithTimestamp = async (originalUri: string, timestamp: Date): Promise<string> => {
  try {
    console.log("Processing image with embedded timestamp...");
    
    const resizedImage = await ImageManipulator.manipulateAsync(
      originalUri,
      [{ resize: { width: 1024 } }],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.85 }
    );

    const imageWithSpace = await ImageManipulator.manipulateAsync(
      resizedImage.uri,
      [
        { 
          crop: { 
            originX: 0, 
            originY: 0, 
            width: 1024, 
            height: Math.round(1024 * 0.75) 
          } 
        },
        { resize: { width: 1024 } }
      ],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 0.9 }
    );

    console.log("Image processed with embedded timestamp space");
    return imageWithSpace.uri;
  } catch (error) {
    console.error("Error processing image:", error);
    try {
      const fallbackImage = await ImageManipulator.manipulateAsync(
        originalUri,
        [{ resize: { width: 1024 } }],
        { format: ImageManipulator.SaveFormat.JPEG, compress: 0.85 }
      );
      return fallbackImage.uri;
    } catch (fallbackError) {
      console.error("Fallback processing failed:", fallbackError);
      return originalUri;
    }
  }
};

const TimestampOverlayPreview = ({ photoUri, timestamp }: { photoUri: string; timestamp: Date }) => {
  if (!photoUri || !timestamp) return null;
  
  const timestampText = timestamp.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  return (
    <View style={styles.imagePreviewContainer}>
      <View style={styles.imageWithOverlay}>
        <Image source={{ uri: photoUri }} style={styles.imagePreview} />
        <View style={styles.timestampOverlayPreview}>
          <View style={styles.timestampHeader}>
            <Text style={styles.timestampTextPreview}>{timestampText}</Text>
            <View style={styles.verificationDot} />
          </View>
          <Text style={styles.timestampBrandPreview}>LipaAlertHub</Text>
        </View>
      </View>
      <View style={styles.timestampInfoContainer}>
        <Text style={styles.timestampLabel}>Photo captured with timestamp:</Text>
        <Text style={styles.timestampValue}>{timestampText}</Text>
        <Text style={styles.timestampNote}>✓ Timestamp embedded and verified for authenticity</Text>
      </View>
    </View>
  );
};

const uploadImage = async (uri: string, user: any, timestamp: Date, reportId: string) => {
  try {
    console.log("Starting image upload for reportId:", reportId);
    const storage = getStorage();
    const timestampStr = new Date().toISOString().replace(/[:.]/g, "-");
    const imageRef = ref(storage, `incident_photos/photo-${timestampStr}.jpg`);

    const response = await fetch(uri);
    const blob = await response.blob();

    const timestampText = `${timestamp.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })} - LipaAlertHub`;

    const metadata = {
      contentType: "image/jpeg",
      customMetadata: {
        userId: user.uid,
        reportId: reportId,
        photoTakenAt: timestamp.toISOString(),
        hasTimestamp: "true",
        timestampText: timestampText,
        embedTimestamp: "true",
        uploadedAt: new Date().toISOString(),
        processedWithOverlay: "true",
        verificationStatus: "embedded"
      }
    };

    await uploadBytes(imageRef, blob, metadata);
    const downloadURL = await getDownloadURL(imageRef);
    console.log("Upload successful:", downloadURL);
    return downloadURL;
  } catch (error) {
    console.error("Upload error:", error);
    throw error;
  }
};

const emergencyTypes = [
  { label: "Fire", value: "fire", icon: "flame" as keyof typeof Ionicons.glyphMap, color: "#e74c3c", bgColor: "#ffebee" },
  { label: "Crime", value: "crime", icon: "shield-outline" as keyof typeof Ionicons.glyphMap, color: "#8e24aa", bgColor: "#f3e5f5" },
  { label: "Flood", value: "flood", icon: "water" as keyof typeof Ionicons.glyphMap, color: "#2196f3", bgColor: "#e3f2fd" },
  { label: "Accident", value: "accident", icon: "car" as keyof typeof Ionicons.glyphMap, color: "#ff9800", bgColor: "#fff3e0" },
  { label: "Medical", value: "medical", icon: "medical" as keyof typeof Ionicons.glyphMap, color: "#f44336", bgColor: "#ffebee" },
  { label: "Infrastructure", value: "infrastructure", icon: "construct" as keyof typeof Ionicons.glyphMap, color: "#607d8b", bgColor: "#f5f5f5" }
];

const subCategoryOptions: Record<string, { label: string; value: string }[]> = {
  fire: [
    { label: "House Fire", value: "House Fire" },
    { label: "Vehicle Fire", value: "Vehicle Fire" },
    { label: "Wildfire/Grass Fire", value: "Wildfire" },
    { label: "Electrical Fire", value: "Electrical Fire" },
    { label: "Commercial Building Fire", value: "Commercial Fire" },
    { label: "Other Fire", value: "Other Fire" }
  ],
  crime: [
    { label: "Theft/Robbery", value: "Theft" },
    { label: "Physical Assault", value: "Assault" },
    { label: "Vandalism", value: "Vandalism" },
    { label: "Domestic Violence", value: "Domestic Violence" },
    { label: "Drug Activity", value: "Drug Activity" },
    { label: "Other Crime", value: "Other Crime" }
  ],
  flood: [
    { label: "Street Flooding", value: "Street Flooding" },
    { label: "House Flooding", value: "House Flooding" },
    { label: "Flash Flood", value: "Flash Flood" },
    { label: "Storm Surge", value: "Storm Surge" },
    { label: "Drainage Issue", value: "Drainage Issue" },
    { label: "Other Flooding", value: "Other Flooding" }
  ],
  accident: [
    { label: "Vehicle Collision", value: "Vehicular Accident" },
    { label: "Motorcycle Accident", value: "Motorcycle Accident" },
    { label: "Slip and Fall", value: "Slip and Fall" },
    { label: "Work Accident", value: "Work-related Accident" },
    { label: "Pedestrian Accident", value: "Pedestrian Accident" },
    { label: "Other Accident", value: "Other Accident" }
  ],
  medical: [
    { label: "Heart Attack", value: "Heart Attack" },
    { label: "Stroke", value: "Stroke" },
    { label: "Difficulty Breathing", value: "Difficulty Breathing" },
    { label: "Severe Injury", value: "Accident Injury" },
    { label: "Unconscious Person", value: "Unconscious Person" },
    { label: "Drug Overdose", value: "Drug Overdose" },
    { label: "Other Medical Emergency", value: "Other Medical" }
  ],
  infrastructure: [
    { label: "Power Outage", value: "Power Outage" },
    { label: "Water Main Break", value: "Water Issue" },
    { label: "Road Damage/Sinkhole", value: "Road Damage" },
    { label: "Bridge Issue", value: "Bridge Issue" },
    { label: "Fallen Trees/Debris", value: "Fallen Trees" },
    { label: "Gas Leak", value: "Gas Leak" },
    { label: "Other Infrastructure", value: "Other Infrastructure" }
  ]
};

const CreateEmergencyReport: React.FC = () => {
  const [name, setName] = useState("");
  const [emergencyType, setEmergencyType] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [description, setDescription] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  
  // ✅ UPDATED: Multi-photo state
  const [photos, setPhotos] = useState<Array<{
    uri: string;
    processedUri: string;
    timestamp: Date;
  }>>([]);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingUserData, setIsLoadingUserData] = useState(true);
  
  const [showCamera, setShowCamera] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [addressComponents, setAddressComponents] = useState<AddressComponents | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);
  
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [cameraTimestamp, setCameraTimestamp] = useState<string>("");
  const mapRef = useRef<MapView>(null);
  const { user } = useAuth();
  const defaultLocation = { latitude: 13.9411, longitude: 121.1624 };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (showCamera) {
      interval = setInterval(() => {
        const now = new Date();
        setCameraTimestamp(now.toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        }));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showCamera]);

  useEffect(() => {
    initializeUserDataAndLocation();
  }, []);

  useEffect(() => {
    if (addressComponents && addressComponents.barangay) {
      const matched = matchBarangayName(addressComponents.barangay);
      if (matched) {
        setSelectedBarangay(matched);
        console.log(`Auto-selected barangay: ${matched}`);
      } else {
        setSelectedBarangay(lipaBarangays[0]);
      }
    }
  }, [addressComponents]);

  const initializeUserDataAndLocation = async () => {
    setIsLoadingUserData(true);
    setIsLoadingLocation(true);
    try {
      await Promise.all([
        fetchUserData(),
        initializeLocation()
      ]);
    } catch (error) {
      console.error('Error initializing form:', error);
    } finally {
      setIsLoadingUserData(false);
      setIsLoadingLocation(false);
    }
  };

  const fetchUserData = async () => {
    if (user?.uid) {
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data() as UserData;
          setName(userData.name || "");
        } else {
          setName(user.displayName || "");
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        setName(user.displayName || "");
      }
    }
  };

  const initializeLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        await setDefaultLocationAndAddress();
        return;
      }
      await getCurrentLocationWithFallback();
    } catch (error) {
      console.error('Error initializing location:', error);
      await setDefaultLocationAndAddress();
    }
  };

  const setDefaultLocationAndAddress = async () => {
    console.log('Setting default location (Lipa City Hall)');
    setCurrentLocation(defaultLocation);
    setSelectedLocation(defaultLocation);
    
    try {
      const address = await getEnhancedAddress(defaultLocation.latitude, defaultLocation.longitude);
      if (address) {
        setAddressComponents(address);
      } else {
        const fallbackAddress: AddressComponents = {
          barangay: "Poblacion Barangay 1",
          city: "Lipa City",
          province: "Batangas",
          country: "Philippines",
          formattedAddress: "Poblacion Barangay 1, Lipa City",
          confidence: 80,
          dataSource: "coordinate_fallback"
        };
        setAddressComponents(fallbackAddress);
      }
    } catch (error) {
      console.error('Error getting default address:', error);
    }
  };

  const getCurrentLocationWithFallback = async () => {
    try {
      console.log('Getting current location...');
      const location = await Location.getCurrentPositionAsync({ 
        accuracy: Location.Accuracy.High,
        timeInterval: 10000,
        distanceInterval: 1,
      });
      const coords = { 
        latitude: location.coords.latitude, 
        longitude: location.coords.longitude 
      };
      console.log(`Got coordinates: ${coords.latitude}, ${coords.longitude}`);
      
      if (!isWithinLipaCityBounds(coords.latitude, coords.longitude)) {
        console.log('Coordinates outside Lipa City bounds');
        Alert.alert(
          'Outside Lipa City',
          'Your current location is outside Lipa City limits. Please ensure you are within Lipa City to submit emergency reports.',
          [{ text: 'OK' }]
        );
        await setDefaultLocationAndAddress();
        return;
      }
      
      setCurrentLocation(coords);
      setSelectedLocation(coords);
      
      try {
        setIsGeocodingAddress(true);
        const address = await getEnhancedAddress(coords.latitude, coords.longitude);
        if (address) {
          console.log('Enhanced geocoding successful:', address);
          setAddressComponents(address);
        } else {
          console.log('Enhanced geocoding failed');
          await setDefaultLocationAndAddress();
        }
      } catch (geocodingError) {
        console.error('Enhanced geocoding failed:', geocodingError);
        await setDefaultLocationAndAddress();
      } finally {
        setIsGeocodingAddress(false);
      }
    } catch (error) {
      console.error('Error getting current location:', error);
      await setDefaultLocationAndAddress();
    }
  };

  const pinMyLocation = async () => {
    setIsGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission Required',
          'Location permission is required to pin your current location.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Settings', 
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Alert.alert(
                    'Enable Location Access',
                    'Go to Settings > Privacy & Security > Location Services',
                    [{ text: 'OK' }]
                  );
                } else {
                  Linking.openSettings();
                }
              }
            }
          ]
        );
        setIsGettingLocation(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({ 
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 1,
      });
      const coords = { 
        latitude: location.coords.latitude, 
        longitude: location.coords.longitude 
      };
      
      if (!isWithinLipaCityBounds(coords.latitude, coords.longitude)) {
        Alert.alert(
          'Location Outside Lipa City',
          'Your current location is outside Lipa City limits. Emergency reports can only be submitted within Lipa City.',
          [{ text: 'OK' }]
        );
        setIsGettingLocation(false);
        return;
      }
      
      setCurrentLocation(coords);
      setSelectedLocation(coords);
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: coords.latitude,
          longitude: coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 1000);
      }
      
      try {
        setIsGeocodingAddress(true);
        const address = await getEnhancedAddress(coords.latitude, coords.longitude);
        
        if (address) {
          setAddressComponents(address);
          Alert.alert(
            'Location Pinned Successfully!',
            `Address: ${address.formattedAddress}`,
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert(
            'Location Pinned',
            'Location pinned but barangay could not be determined. Please verify before submitting.',
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        console.error('Geocoding failed:', error);
      } finally {
        setIsGeocodingAddress(false);
      }
    } catch (error) {
      console.error('Error pinning location:', error);
      Alert.alert('Location Error', 'Could not get your current location. Please try again.', [{ text: 'OK' }]);
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleMapPress = async (event: any) => {
    const coordinate = event.nativeEvent.coordinate;
    
    if (!isWithinLipaCityBounds(coordinate.latitude, coordinate.longitude)) {
      Alert.alert(
        'Location Outside Lipa City',
        'Please select a location within Lipa City limits for your emergency report.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    setSelectedLocation(coordinate);
    console.log(`Map location selected: ${coordinate.latitude}, ${coordinate.longitude}`);
    
    try {
      setIsGeocodingAddress(true);
      const address = await getEnhancedAddress(coordinate.latitude, coordinate.longitude);
      
      if (address) {
        console.log('Address found:', address);
        setAddressComponents(address);
      } else {
        console.log('Could not determine address');
        setAddressComponents({
          barangay: "Poblacion Barangay 1",
          city: "Lipa City", 
          province: "Batangas",
          country: "Philippines",
          formattedAddress: `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)} - Lipa City`,
          confidence: 50,
          dataSource: "coordinate_fallback"
        });
      }
    } catch (error) {
      console.error('Error getting address:', error);
    } finally {
      setIsGeocodingAddress(false);
    }
  };

  // ✅ UPDATED: Multi-photo takePicture function
  const takePicture = async () => {
    if (!cameraRef.current) {
      Alert.alert("Error", "Camera not ready. Please try again.");
      return;
    }

    // ✅ CHECK: Maximum 3 photos
    if (photos.length >= 3) {
      Alert.alert(
        "Photo Limit Reached", 
        "You have already taken 3 photos. You can remove a photo to take a new one.",
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      setIsProcessingPhoto(true);
      const currentTime = new Date();
      console.log("📸 Taking photo with timestamp:", currentTime.toISOString());

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
        skipProcessing: false,
      });

      if (!photo || !photo.uri) {
        throw new Error("Failed to capture photo.");
      }

      console.log("✅ Photo captured successfully:", photo.uri);
      
      // Process with timestamp
      const processedUri = await processImageWithTimestamp(photo.uri, currentTime);

      // ✅ ADD to photos array
      setPhotos(prev => [...prev, {
        uri: photo.uri,
        processedUri: processedUri,
        timestamp: currentTime
      }]);

      setShowCamera(false);

      Alert.alert(
        `Photo ${photos.length + 1} Captured Successfully! 📸`,
        `Timestamp: ${currentTime.toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        })} - LipaAlertHub\n\n` +
        `Photos: ${photos.length + 1}/3\n` +
        (photos.length < 2 ? "You can take up to 2 more photos." : 
         photos.length === 2 ? "You can take 1 more photo." : 
         "Maximum photos reached."),
        [{ text: 'OK' }]
      );

    } catch (error) {
      console.error("❌ Error taking picture:", error);
      Alert.alert("Error", "Failed to take picture. Please try again.");
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  // ✅ UPDATED: Enhanced handleSubmit with duplicate check
  const handleSubmit = async () => {
    try {
      console.log('🚀 [UI] Submit button pressed - Starting validation...');
      
      // ✅ BASIC VALIDATION
      if (!name.trim()) {
        Alert.alert("Missing Information", "Please enter your name.");
        return;
      }

      if (!emergencyType) {
        Alert.alert("Missing Information", "Please select an emergency type.");
        return;
      }

      if (!subCategory) {
        Alert.alert("Missing Information", "Please select a subcategory.");
        return;
      }

      if (!selectedBarangay) {
        Alert.alert("Missing Information", "Please select your barangay.");
        return;
      }

      if (!selectedLocation) {
        Alert.alert("Missing Information", "Please select a location on the map.");
        return;
      }

      // ✅ PHOTO VALIDATION (minimum 1 photo required)
      if (photos.length === 0) {
        Alert.alert(
          "Photo Required", 
          "Please take at least 1 photo of the incident. Photos with timestamps are mandatory for all emergency reports.",
          [{ text: 'OK' }]
        );
        return;
      }

      console.log('✅ [UI] All validations passed');
      console.log('📋 [UI] Form data:', {
        name,
        emergencyType,
        subCategory,
        selectedBarangay,
        photosCount: photos.length,
        location: selectedLocation,
        establishment: addressComponents?.establishment
      });

      setIsSubmitting(true);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Not authenticated");
      }

      // ✅ CHECK FOR DUPLICATES **BEFORE ANY UPLOAD OR SUBMISSION**
      console.log("🔍 [UI] Checking for duplicate reports...");
      
      const duplicateCheck = await checkDuplicateReport(
        currentUser.uid,
        emergencyType,
        subCategory,
        selectedLocation,
        selectedBarangay,
        addressComponents?.establishment
      );

      console.log('🔍 [UI] Duplicate check result:', duplicateCheck);

      if (duplicateCheck.isDuplicate && duplicateCheck.duplicateReport) {
        const duplicate = duplicateCheck.duplicateReport;
        const timeAgo = duplicateCheck.timeSinceReport || 0;
        
        setIsSubmitting(false);
        
        // ✅ SHOW BLOCKING ALERT - NO SUBMISSION TO ADMIN
        Alert.alert(
          "⚠️ Report Already Submitted",
          `You have already submitted this report:\n\n` +
          `Emergency: ${emergencyTypes.find(t => t.value === emergencyType)?.label || emergencyType} - ${subCategoryOptions[emergencyType]?.find(o => o.value === subCategory)?.label || subCategory}\n` +
          `Location: ${selectedBarangay}\n` +
          `Time: ${timeAgo} minute${timeAgo !== 1 ? 's' : ''} ago\n` +
          `Status: ${duplicate.status}\n\n` +
          `Your report is currently being processed. Please wait for updates.`,
          [
            {
              text: "View My Report",
              onPress: () => {
                resetForm();
                router.push({
                  pathname: "/(main)/report/status",
                  params: { reportId: duplicate.id },
                });
              },
            },
            {
              text: "Cancel",
              style: "cancel",
            },
          ]
        );
        return; // ❌ BLOCK SUBMISSION COMPLETELY - NO UPLOAD, NO FIREBASE
      }

      // ✅ NO DUPLICATE - PROCEED WITH PHOTO UPLOAD AND SUBMISSION
      console.log("✅ [UI] No duplicate found - proceeding with submission");

      console.log(`📸 [UI] Starting upload of ${photos.length} photo(s)...`);

      // ✅ UPLOAD ALL PHOTOS (only if no duplicate)
      let photoUrls = [];
      try {
        const tempId = `temp_${Date.now()}`;
        
        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          console.log(`📤 [UI] Uploading photo ${i + 1}/${photos.length}...`);
          
          const url = await uploadImage(
            photo.processedUri, 
            currentUser, 
            photo.timestamp, 
            `${tempId}_photo${i + 1}`
          );
          
          photoUrls.push(url);
          console.log(`✅ [UI] Photo ${i + 1} uploaded successfully: ${url.substring(0, 50)}...`);
        }
        
        console.log(`✅ [UI] All ${photoUrls.length} photos uploaded successfully`);
        
      } catch (uploadError) {
        console.error("❌ [UI] Photo upload failed:", uploadError);
        Alert.alert("Upload Error", "Failed to upload photos. Please try again.");
        setIsSubmitting(false);
        return;
      }

      const subCategoryLabel = subCategoryOptions[emergencyType]?.find(
        option => option.value === subCategory
      )?.label || subCategory;

      const emergencyTypeLabel = emergencyTypes.find(
        type => type.value === emergencyType
      )?.label || emergencyType;

      // ✅ SUBMIT TO FIREBASE (only if no duplicate)
      console.log('📤 [UI] Submitting report to Firebase...');
      const result = await submitIncidentReport({
        userId: currentUser.uid,
        reporterName: name.trim(),
        address: addressComponents?.formattedAddress || `${selectedBarangay}, Lipa City`,
        category: emergencyType,
        description: description.trim() || `${emergencyTypeLabel} - ${subCategoryLabel}`,
        images: photoUrls, // ✅ Multiple photos
        location: {
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude
        },
        subCategory: subCategory,
        additionalNotes: additionalNotes.trim()
      });

      console.log('📨 [UI] Submit result:', result);

      if (result.success && result.id) {
        console.log("✅ [UI] Report submitted successfully:", result);
        
        Alert.alert(
          "Emergency Report Submitted Successfully! 🎉", 
          `Report ID: ${result.id}\n` +
          `Type: ${emergencyTypeLabel}\n` +
          `Subcategory: ${subCategoryLabel}\n` +
          `${addressComponents?.establishment ? `Location: ${addressComponents.establishment}\n` : ''}` +
          `Barangay: ${selectedBarangay}\n` +
          `Photos: ${photoUrls.length} photo${photoUrls.length > 1 ? 's' : ''} uploaded\n\n` +
          `Your report has been submitted and is being reviewed by CDRRMO.`,
          [
            {
              text: "View Status",
              onPress: () => {
                console.log('📱 [UI] Navigating to status page with reportId:', result.id);
                resetForm();
                router.push({
                  pathname: "/(main)/report/status",
                  params: { reportId: result.id }, // ✅ Pass correct reportId
                });
              },
            },
            {
              text: "Dashboard",
              onPress: () => {
                resetForm();
                router.push("/(main)");
              },
              style: "cancel",
            },
          ]
        );
      } else {
        console.error('❌ [UI] Submit failed:', result.error);
        throw new Error(result.error || "Failed to submit");
      }

    } catch (error) {
      console.error("❌ [UI] Submit error:", error);
      Alert.alert("Error", `Failed to submit: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ✅ UPDATED: Reset form to clear photos array
  const resetForm = () => {
    setEmergencyType("");
    setSubCategory("");
    setDescription("");
    setAdditionalNotes("");
    
    // ✅ CLEAR PHOTOS ARRAY
    setPhotos([]);
    
    setAddressComponents(null);
    setSelectedBarangay("");
    setCurrentLocation(null);
    setSelectedLocation(null);
    initializeLocation();
  };

  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#e74c3c" />
        <Text style={styles.loadingText}>Loading camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={64} color="#e74c3c" />
        <Text style={styles.permissionText}>
          We need your permission to use the camera for taking incident photos.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
          <View style={styles.timestampOverlayLive}>
            <View style={styles.timestampBadgeLive}>
              <Text style={styles.timestampTextLive}>{cameraTimestamp}</Text>
              <Text style={styles.timestampSubTextLive}>LipaAlertHub</Text>
            </View>
          </View>
          
          <View style={styles.cameraHeader}>
            <TouchableOpacity
              style={styles.cameraHeaderButton}
              onPress={() => setShowCamera(false)}
              disabled={isProcessingPhoto}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.cameraTitle}>Take Incident Photo</Text>
            <TouchableOpacity
              style={styles.cameraHeaderButton}
              onPress={() => setFacing((current) => (current === "back" ? "front" : "back"))}
              disabled={isProcessingPhoto}
            >
              <Ionicons name="camera-reverse" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.cameraControls}>
            <View style={styles.captureContainer}>
              <TouchableOpacity 
                style={[styles.captureButton, isProcessingPhoto && styles.captureButtonDisabled]} 
                onPress={takePicture}
                disabled={isProcessingPhoto}
              >
                {isProcessingPhoto ? (
                  <ActivityIndicator size="large" color="#e74c3c" />
                ) : (
                  <View style={styles.captureInner} />
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.cameraInstructions}>
              {isProcessingPhoto ? "Processing photo with timestamp..." : "Tap to capture with embedded timestamp"}
            </Text>
            <Text style={styles.timestampNote}>
              The timestamp will be permanently embedded in the photo for verification.
            </Text>
          </View>
        </CameraView>
      </View>
    );
  }

  if (isLoadingUserData || isLoadingLocation) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#e74c3c" />
        <Text style={styles.loadingText}>
          {isLoadingUserData ? "Loading user data..." : "Loading location..."}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image 
            source={require("../../../assets/images/logo.png")} 
            style={styles.logo} 
            resizeMode="contain"
          />
          <Text style={styles.logoText}>LipaAlertHub</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Report Incident</Text>
        
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Reporter Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            value={name}
            onChangeText={setName}
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Type of Emergency *</Text>
          <Text style={styles.helperText}>
            Select the main type of emergency. Specific options will appear after selection.
          </Text>
          <View style={styles.emergencyTypesGrid}>
            {emergencyTypes.map((type) => (
              <TouchableOpacity
                key={type.value}
                style={[
                  styles.emergencyTypeButton,
                  { backgroundColor: emergencyType === type.value ? type.color : type.bgColor },
                  emergencyType === type.value && styles.emergencyTypeButtonSelected
                ]}
                onPress={() => {
                  setEmergencyType(type.value);
                  setSubCategory("");
                }}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name={type.icon} 
                  size={28} 
                  color={emergencyType === type.value ? '#fff' : type.color} 
                />
                <Text style={[
                  styles.emergencyTypeText,
                  { color: emergencyType === type.value ? '#fff' : type.color }
                ]}>
                  {type.label}
                </Text>
                {subCategoryOptions[type.value] && subCategoryOptions[type.value].length > 0 && (
                  <View style={styles.subcategoryIndicator}>
                    <Ionicons 
                      name="chevron-down" 
                      size={12} 
                      color={emergencyType === type.value ? '#fff' : type.color} 
                    />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {emergencyType && subCategoryOptions[emergencyType] && (
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Subcategory *</Text>
            <Text style={styles.helperText}>
              Select the specific type of {emergencyTypes.find(t => t.value === emergencyType)?.label.toLowerCase()} emergency.
            </Text>
            <View style={styles.radioButtonGroup}>
              {subCategoryOptions[emergencyType].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.radioButtonContainer,
                    subCategory === option.value && styles.radioButtonContainerSelected
                  ]}
                  onPress={() => setSubCategory(option.value)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.radioButton, subCategory === option.value && styles.radioButtonSelected]}>
                    {subCategory === option.value && <View style={styles.radioButtonInner} />}
                  </View>
                  <Text style={[
                    styles.radioButtonLabel,
                    subCategory === option.value && styles.radioButtonLabelSelected
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Incident Location *</Text>
          {selectedLocation ? (
            <View style={styles.mapContainer}>
              <MapView
                ref={mapRef}
                style={styles.map}
                provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                region={{
                  latitude: selectedLocation.latitude,
                  longitude: selectedLocation.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
                onPress={handleMapPress}
                mapType="standard"
                showsUserLocation={true}
                showsMyLocationButton={false}
                rotateEnabled={true}
                scrollEnabled={true}
                zoomEnabled={true}
              >
                <Marker
                  coordinate={selectedLocation}
                  title="Incident Location"
                  description="Tap anywhere on the map to change location"
                  pinColor="#e74c3c"
                />
              </MapView>
              
              <TouchableOpacity
                style={styles.pinLocationButton}
                onPress={pinMyLocation}
                disabled={isGettingLocation}
                activeOpacity={0.7}
              >
                {isGettingLocation ? (
                  <ActivityIndicator size="small" color="#333" />
                ) : (
                  <Ionicons name="locate" size={22} color="#333" />
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.loadingMapContainer}>
              <ActivityIndicator size="large" color="#e74c3c" />
              <Text style={styles.loadingText}>Loading map...</Text>
            </View>
          )}
          
          {addressComponents && (
            <View style={styles.addressContainer}>
              <View style={styles.addressHeader}>
                <Ionicons name="location" size={16} color="#e74c3c" />
                <Text style={styles.addressHeaderText}>Detected Address</Text>
                {isGeocodingAddress && <ActivityIndicator size="small" color="#e74c3c" />}
              </View>
              
              {addressComponents.establishment && (
                <View style={styles.establishmentContainer}>
                  <Ionicons name="business" size={14} color="#2196f3" />
                  <Text style={styles.establishmentText}>{addressComponents.establishment}</Text>
                </View>
              )}
              
              <Text style={styles.addressText}>{addressComponents.formattedAddress}</Text>
              
              {addressComponents.nearbyPlaces && addressComponents.nearbyPlaces.length > 0 && (
                <View style={styles.nearbyPlacesContainer}>
                  <Text style={styles.nearbyPlacesLabel}>Nearby:</Text>
                  <Text style={styles.nearbyPlacesText}>
                    {addressComponents.nearbyPlaces.slice(0, 2).join(', ')}
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.barangayContainer}>
            <Text style={styles.barangayLabel}>Barangay *</Text>
            <View style={styles.barangayDropdownContainer}>
              <Picker
                selectedValue={selectedBarangay}
                onValueChange={(itemValue) => setSelectedBarangay(itemValue)}
                style={styles.barangayPicker}
                itemStyle={styles.barangayPickerItem}
                dropdownIconColor="#e74c3c"
              >
                <Picker.Item label="Select Barangay..." value="" />
                {lipaBarangays.map((barangay) => (
                  <Picker.Item 
                    key={barangay} 
                    label={barangay} 
                    value={barangay} 
                  />
                ))}
              </Picker>
            </View>
            <Text style={styles.barangayNote}>
              Please verify and select the correct barangay. The system auto-selects based on GPS but you can change it if needed.
            </Text>
          </View>
          
          <Text style={styles.helperText}>
            Tap on the map to select incident location or use "Pin My Location" button
          </Text>
        </View>

        {/* ✅ UPDATED: Multi-photo UI */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Evidence Photo * (Required)</Text>
          <Text style={styles.helperText}>
            Take 1-3 timestamped photos. Minimum 1 photo required.
          </Text>
          
          {/* Take Photo Button */}
          <View style={styles.photoContainer}>
            <TouchableOpacity
              style={[
                styles.takePhotoButton,
                photos.length >= 3 && styles.takePhotoButtonDisabled
              ]}
              onPress={() => setShowCamera(true)}
              disabled={photos.length >= 3}
            >
              <Ionicons name="camera" size={20} color="#fff" />
              <Text style={styles.takePhotoButtonText}>
                {photos.length === 0 ? 'TAKE PHOTO (Required)' : 
                 photos.length < 3 ? `TAKE ANOTHER PHOTO (${photos.length}/3)` : 
                 'MAXIMUM PHOTOS REACHED (3/3)'}
              </Text>
              {photos.length > 0 && (
                <View style={styles.photoCountBadge}>
                  <Text style={styles.photoCountText}>{photos.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Photos Preview Grid */}
          {photos.length > 0 && (
            <View style={styles.photosPreviewContainer}>
              <Text style={styles.photosPreviewLabel}>
                Captured Photos ({photos.length}/3):
              </Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.photosScrollView}
              >
                {photos.map((photo, index) => (
                  <View key={index} style={styles.photoPreviewItem}>
                    <View style={styles.imageWithOverlay}>
                      <Image 
                        source={{ uri: photo.processedUri }} 
                        style={styles.photoThumbnail} 
                      />
                      
                      {/* Timestamp Overlay Preview */}
                      <View style={styles.thumbnailTimestampOverlay}>
                        <Text style={styles.thumbnailTimestampText}>
                          {photo.timestamp.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: true
                          })}
                        </Text>
                      </View>
                    </View>
                    
                    <Text style={styles.photoLabel}>Photo {index + 1}</Text>
                    <Text style={styles.photoTimestamp}>
                      {photo.timestamp.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </Text>
                    
                    {/* Remove Photo Button */}
                    <TouchableOpacity 
                      style={styles.removePhotoBtn}
                      onPress={() => {
                        Alert.alert(
                          'Remove Photo?',
                          `Remove Photo ${index + 1}?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Remove',
                              style: 'destructive',
                              onPress: () => setPhotos(prev => prev.filter((_, i) => i !== index))
                            }
                          ]
                        );
                      }}
                    >
                      <Ionicons name="close-circle" size={28} color="#e74c3c" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
              
              <Text style={styles.photoHint}>
                {photos.length < 3 ? 
                  `💡 You can add ${3 - photos.length} more photo${3 - photos.length > 1 ? 's' : ''}.` :
                  '✅ Maximum photos reached. Remove a photo to add a new one.'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Additional Details (Optional)</Text>
          <Text style={styles.helperText}>
            You can provide additional information about the incident if needed.
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Provide additional details... (optional)"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            placeholderTextColor="#999"
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <View style={styles.submitButtonContent}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.submitButtonText}>Submitting...</Text>
            </View>
          ) : (
            <Text style={styles.submitButtonText}>Submit Report</Text>
          )}
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    backgroundColor: "#fff",
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 30,
    height: 30,
    marginRight: 10,
  },
  logoText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#e74c3c",
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: "#f8f9fa",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    backgroundColor: "#f8f9fa",
  },
  permissionText: {
    fontSize: 16,
    color: "#333",
    textAlign: 'center',
    marginVertical: 20,
    lineHeight: 24,
    fontWeight: "500",
  },
  permissionButton: {
    backgroundColor: "#e74c3c",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  scrollContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: 25,
    marginBottom: 25,
    color: "#333",
    textAlign: 'left',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  inputContainer: {
    marginBottom: 25,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    color: "#333",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  helperText: {
    fontSize: 12,
    color: "#666",
    marginTop: 8,
    fontStyle: 'italic',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  emergencyTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  emergencyTypeButton: {
    width: (width - 60) / 2,
    minHeight: 90,
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  emergencyTypeButtonSelected: {
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  emergencyTypeText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  subcategoryIndicator: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonGroup: {
    marginTop: 8,
  },
  radioButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  radioButtonContainerSelected: {
    borderColor: '#e74c3c',
    backgroundColor: '#ffebee',
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioButtonSelected: {
    borderColor: '#e74c3c',
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e74c3c',
  },
  radioButtonLabel: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  radioButtonLabelSelected: {
    color: '#e74c3c',
    fontWeight: '600',
  },
  mapContainer: {
    height: 250,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 0,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  loadingMapContainer: {
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  pinLocationButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    width: 48,
    height: 48,
    backgroundColor: '#fff',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  addressContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  addressHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 6,
    flex: 1,
  },
  establishmentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#e3f2fd',
    borderRadius: 6,
  },
  establishmentText: {
    fontSize: 13,
    color: '#1976d2',
    fontWeight: '600',
    marginLeft: 6,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  addressText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  nearbyPlacesContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  nearbyPlacesLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    marginBottom: 4,
  },
  nearbyPlacesText: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
    lineHeight: 16,
  },
  barangayContainer: {
    marginTop: 15,
  },
  barangayLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  barangayDropdownContainer: {
    backgroundColor: '#ffebee',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e74c3c',
    overflow: 'hidden',
    marginBottom: 8,
  },
  barangayPicker: {
    height: 50,
    color: '#e74c3c',
    backgroundColor: '#ffebee',
  },
  barangayPickerItem: {
    fontSize: 16,
    color: '#e74c3c',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  barangayNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    lineHeight: 16,
    backgroundColor: '#fff3cd',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffeaa7',
  },
  photoContainer: {
    position: 'relative',
  },
  takePhotoButton: {
    backgroundColor: "#e74c3c",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'relative',
  },
  takePhotoButtonDisabled: {
    backgroundColor: "#999",
    opacity: 0.6,
  },
  takePhotoButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  photoCountBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#27ae60',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  photosPreviewContainer: {
    marginTop: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  photosPreviewLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  photosScrollView: {
    marginBottom: 10,
  },
  photoPreviewItem: {
    marginRight: 15,
    alignItems: 'center',
    width: 160,
  },
  imageWithOverlay: {
    position: 'relative',
    width: 160,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#e74c3c',
  },
  photoThumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbnailTimestampOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  thumbnailTimestampText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  photoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginTop: 8,
  },
  photoTimestamp: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#fff',
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  photoHint: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 10,
  },
  imagePreviewContainer: {
    alignItems: 'center',
    marginTop: 15,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  timestampOverlayPreview: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.9,
    shadowRadius: 5,
    elevation: 10,
    minWidth: 160,
  },
  timestampHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  timestampTextPreview: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    letterSpacing: 0.3,
    flex: 1,
  },
  verificationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#27ae60',
    marginLeft: 8,
  },
  timestampBrandPreview: {
    color: '#e74c3c',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  timestampInfoContainer: {
    marginTop: 12,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minWidth: 280,
  },
  timestampLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    marginBottom: 4,
  },
  timestampValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginBottom: 8,
    textAlign: 'center',
  },
  timestampNote: {
    fontSize: 12,
    color: '#27ae60',
    fontWeight: '500',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: "#e74c3c",
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 30,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    marginLeft: 8,
  },
  bottomSpacer: {
    height: 100,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  timestampOverlayLive: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 80,
    left: 20,
    zIndex: 1000,
  },
  timestampBadgeLive: {
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.9,
    shadowRadius: 5,
    elevation: 10,
    minWidth: 180,
    alignItems: 'center',
  },
  timestampTextLive: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  timestampSubTextLive: {
    color: '#e74c3c',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    textAlign: 'center',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 30,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cameraHeaderButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  cameraTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  cameraControls: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 20,
    left: 0,
    right: 0,
    paddingBottom: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
  },
  captureContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  captureButtonDisabled: {
    opacity: 0.7,
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e74c3c',
  },
  cameraInstructions: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
    opacity: 0.9,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    marginBottom: 6,
    fontWeight: '500',
  },
});

export default CreateEmergencyReport;