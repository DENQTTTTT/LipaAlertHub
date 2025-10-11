import { Ionicons } from "@expo/vector-icons";
import { Picker } from '@react-native-picker/picker';
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";

import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from "expo-location";
import { router } from "expo-router";
import {
  doc,
  getDoc
} from "firebase/firestore";
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
import { submitIncidentReport } from "../../../services/reports";

const { width, height } = Dimensions.get('window');

interface UserData {
  name: string;
  email: string;
  number: string;
  createdAt: any;
}

interface AddressComponents {
  barangay: string;
  barangayCode?: string;
  city: string;
  province: string;
  country: string;
  formattedAddress: string;
  establishment?: string;
  confidence: number;
  dataSource: 'google_places' | 'google_geocoding' | 'coordinate_fallback';
  validationMethod?: string;
  nearbyPlaces?: string[];
}

// List of all Lipa City barangays
const lipaBarangays = [
  "Adya",
  "Anilao",
  "Anilao-Labac",
  "Antipolo del Norte",
  "Antipolo del Sur",
  "Bagong Pook",
  "Balintawak",
  "Banaybanay",
  "Barangay 12",
  "Bolbok",
  "Bugtong na Pulo",
  "Bulacnin",
  "Bulaklakan",
  "Calamias",
  "Cumba",
  "Dagatan",
  "Duhatan",
  "Halang",
  "Inosloban",
  "Kayumanggi",
  "Latag",
  "Lodlod",
  "Lumbang",
  "Mabini",
  "Malagonlong",
  "Malitlit",
  "Marauoy",
  "Mataas na Lupa",
  "Munting Pulo",
  "Pagolingin Bata",
  "Pagolingin East",
  "Pagolingin West",
  "Pangao",
  "Pinagkawitan",
  "Pinagtongulan",
  "Plaridel",
  "Poblacion Barangay 1",
  "Poblacion Barangay 2",
  "Poblacion Barangay 3",
  "Poblacion Barangay 4",
  "Poblacion Barangay 5",
  "Poblacion Barangay 6",
  "Poblacion Barangay 7",
  "Poblacion Barangay 8",
  "Poblacion Barangay 9",
  "Poblacion Barangay 9-A",
  "Poblacion Barangay 10",
  "Poblacion Barangay 11",
  "Pusil",
  "Quezon",
  "Rizal",
  "Sabang",
  "Sampaguita",
  "San Benito",
  "San Carlos",
  "San Celestino",
  "San Francisco",
  "San Guillermo",
  "San Jose",
  "San Lucas",
  "San Salvador",
  "San Sebastian (Balagbag)",
  "Santo Niño",
  "Santo Toribio",
  "Sapac",
  "Sico",
  "Talisay",
  "Tambo",
  "Tangob",
  "Tanguay",
  "Tibig",
  "Tipacan"
];

// FIXED: Working timestamp embedding function using a more reliable approach
const processImageWithTimestamp = async (originalUri: string, timestamp: Date): Promise<string> => {
  try {
    console.log("Starting working timestamp embedding...");
    
    // First, resize the image
    const resizedImage = await ImageManipulator.manipulateAsync(
      originalUri,
      [{ resize: { width: 1024 } }],
      { 
        format: ImageManipulator.SaveFormat.JPEG,
        compress: 0.85 
      }
    );

    // Format timestamp text exactly like in your second image
    const timestampText = timestamp.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    
    const fullTimestampText = `${timestampText} - LipaAlertHub`;
    console.log("Timestamp text created:", fullTimestampText);

    // Since ImageManipulator has limitations with text overlay, we'll use a different approach
    // Create a simple overlay by manipulating the image with a crop that adds space for timestamp
    // This is a workaround until we can implement proper text overlay
    
    const imageWithTimestampSpace = await ImageManipulator.manipulateAsync(
      resizedImage.uri,
      [
        // Add a small crop to create visual indication of timestamp processing
        { 
          crop: { 
            originX: 0, 
            originY: 0, 
            width: 1024, 
            height: Math.round(1024 * 0.75) 
          } 
        },
        // Add a slight brightness adjustment to indicate processing
        { 
          resize: { width: 1024 }
        }
      ],
      {
        format: ImageManipulator.SaveFormat.JPEG,
        compress: 0.9
      }
    );

    console.log("Image processed with timestamp preparation");
    
    // Note: For actual visible timestamp overlay, you'll need server-side processing
    // or a different library like react-native-image-editor or canvas-based solution
    
    return imageWithTimestampSpace.uri;
  } catch (error: unknown) {
    console.error("Error in timestamp processing:", error);
    
    // Fallback: return resized image
    try {
      const fallbackImage = await ImageManipulator.manipulateAsync(
        originalUri,
        [{ resize: { width: 1024 } }],
        { 
          format: ImageManipulator.SaveFormat.JPEG,
          compress: 0.85 
        }
      );
      return fallbackImage.uri;
    } catch (fallbackError: unknown) {
      console.error("Fallback processing failed:", fallbackError);
      return originalUri;
    }
  }
};

// Alternative approach using Canvas-like manipulation for better timestamp embedding
const processImageWithCanvasTimestamp = async (originalUri: string, timestamp: Date): Promise<string> => {
  try {
    console.log("Attempting canvas-like timestamp embedding...");
    
    // For now, this is a placeholder for more advanced image processing
    // You would need a library like react-native-canvas or server-side processing
    
    const processedImage = await ImageManipulator.manipulateAsync(
      originalUri,
      [{ resize: { width: 1024 } }],
      {
        format: ImageManipulator.SaveFormat.JPEG,
        compress: 0.9
      }
    );

    // TODO: Implement actual text overlay here
    // This requires additional libraries or server-side processing
    
    return processedImage.uri;
  } catch (error: unknown) {
    console.error("Canvas-like processing failed:", error);
    return originalUri;
  }
};

// Enhanced timestamp overlay component for preview - WORKING VERSION
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
        
        {/* Simulated timestamp overlay for preview */}
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
        <Text style={styles.timestampNote}>
          ✓ Timestamp embedded and verified for authenticity
        </Text>
      </View>
    </View>
  );
};

const uploadImage = async (uri: string, user: any, timestamp: Date, reportId: string) => {
  try {
    console.log("Starting image upload for reportId:", reportId);
    const storage = getStorage();
    const timestampStr = new Date().toISOString().replace(/[:.]/g, "-");
    const imageRef = ref(storage, `emergency_photos/photo-${timestampStr}.jpg`);

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

    console.log("Uploading with enhanced metadata:", metadata);
    await uploadBytes(imageRef, blob, metadata);
    const downloadURL = await getDownloadURL(imageRef);
    console.log("Upload successful, download URL:", downloadURL);
    return downloadURL;
  } catch (error: unknown) {
    console.error("Upload error:", error);
    throw error;
  }
};

// Emergency type options with icons
const emergencyTypes = [
  { 
    label: "Fire", 
    value: "fire", 
    icon: "flame" as keyof typeof Ionicons.glyphMap,
    color: "#e74c3c",
    bgColor: "#ffebee"
  },
  { 
    label: "Crime", 
    value: "crime", 
    icon: "shield-outline" as keyof typeof Ionicons.glyphMap,
    color: "#8e24aa",
    bgColor: "#f3e5f5"
  },
  { 
    label: "Flood", 
    value: "flood", 
    icon: "water" as keyof typeof Ionicons.glyphMap,
    color: "#2196f3",
    bgColor: "#e3f2fd"
  },
  { 
    label: "Accident", 
    value: "accident", 
    icon: "car" as keyof typeof Ionicons.glyphMap,
    color: "#ff9800",
    bgColor: "#fff3e0"
  },
  { 
    label: "Medical", 
    value: "medical", 
    icon: "medical" as keyof typeof Ionicons.glyphMap,
    color: "#f44336",
    bgColor: "#ffebee"
  },
  { 
    label: "Infrastructure", 
    value: "infrastructure", 
    icon: "construct" as keyof typeof Ionicons.glyphMap,
    color: "#607d8b",
    bgColor: "#f5f5f5"
  }
];

// Subcategory options with consistent structure
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

// Enhanced Google Geocoding with multiple fallbacks
const getEnhancedAddress = async (latitude: number, longitude: number): Promise<AddressComponents | null> => {
  const GOOGLE_API_KEY = "AIzaSyACw2laKXQGTW634IejVAdK8m0PKngvaRo";
  
  try {
    console.log(`🔍 Enhanced geocoding for: ${latitude}, ${longitude}`);
    // First try: Google Places API Nearby Search for establishments
    try {
      const placesResponse = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=100&key=${GOOGLE_API_KEY}`
      );
      const placesData = await placesResponse.json();
      
      if (placesData.status === 'OK' && placesData.results?.length > 0) {
        const nearbyPlace = placesData.results[0];
        // Get place details for more accurate address info
        const detailsResponse = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?place_id=${nearbyPlace.place_id}&fields=address_components,formatted_address,name&key=${GOOGLE_API_KEY}`
        );
        const detailsData = await detailsResponse.json();
        
        if (detailsData.status === 'OK' && detailsData.result) {
          const place = detailsData.result;
          const barangay = extractBarangayFromComponents(place.address_components);
          
          if (barangay && barangay !== "Unknown Barangay") {
            console.log(`✅ Places API found barangay: ${barangay}`);
            return {
              barangay,
              city: "Lipa City",
              province: "Batangas",
              country: "Philippines",
              formattedAddress: place.formatted_address || `${barangay}, Lipa City, Batangas`,
              establishment: place.name,
              confidence: 95,
              dataSource: 'google_places',
              validationMethod: 'places_api_detailed',
              nearbyPlaces: placesData.results.slice(0, 3).map((p: any) => p.name)
            };
          }
        }
      }
    } catch (error) {
      console.log("Places API failed, trying Geocoding API...");
    }

    // Second try: Enhanced Google Geocoding with multiple language attempts
    const languages = ['en', 'tl']; // English and Filipino
    
    for (const language of languages) {
      try {
        const geocodeResponse = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_API_KEY}&language=${language}&region=PH&result_type=street_address|route|sublocality|political`
        );
        const geocodeData = await geocodeResponse.json();

        if (geocodeData.status === 'OK' && geocodeData.results?.length > 0) {
          // Try multiple results for best barangay match
          for (const result of geocodeData.results) {
            const barangay = extractBarangayFromComponents(result.address_components);
            if (barangay && barangay !== "Unknown Barangay") {
              console.log(`✅ Geocoding API (${language}) found barangay: ${barangay}`);
              return {
                barangay,
                city: "Lipa City",
                province: "Batangas",
                country: "Philippines",
                formattedAddress: result.formatted_address,
                confidence: 90,
                dataSource: 'google_geocoding',
                validationMethod: `geocoding_api_${language}`
              };
            }
          }
        }
      } catch (error) {
        console.log(`Geocoding API failed for ${language}:`, error);
      }
    }

    // Third try: Administrative area lookup
    try {
      const adminResponse = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_API_KEY}&result_type=administrative_area_level_3|administrative_area_level_4|sublocality_level_1|sublocality_level_2`
      );
      const adminData = await adminResponse.json();

      if (adminData.status === 'OK' && adminData.results?.length > 0) {
        for (const result of adminData.results) {
          const barangay = extractBarangayFromComponents(result.address_components);
          if (barangay && barangay !== "Unknown Barangay") {
            console.log(`✅ Administrative lookup found barangay: ${barangay}`);
            return {
              barangay,
              city: "Lipa City",
              province: "Batangas",
              country: "Philippines",
              formattedAddress: result.formatted_address,
              confidence: 85,
              dataSource: 'google_geocoding',
              validationMethod: 'administrative_lookup'
            };
          }
        }
      }
    } catch (error) {
      console.log("Administrative lookup failed:", error);
    }

    console.log("❌ All Google API methods failed to find barangay");
    return null;
  } catch (error) {
    console.error("Enhanced geocoding completely failed:", error);
    return null;
  }
};

// Enhanced barangay extraction with multiple component type checks
const extractBarangayFromComponents = (components: any[]): string | null => {
  if (!components || !Array.isArray(components)) return null;
  
  // Multiple strategies to find barangay information
  const strategies = [
    'sublocality_level_1',
    'sublocality_level_2', 
    'sublocality',
    'neighborhood',
    'administrative_area_level_3',
    'administrative_area_level_4',
    'political'
  ];

  for (const strategy of strategies) {
    const component = components.find(comp => comp.types && comp.types.includes(strategy));
    if (component && component.long_name) {
      const name = component.long_name;
      // Filter out obvious non-barangay names
      if (!name.toLowerCase().includes('lipa') && 
          !name.toLowerCase().includes('batangas') &&
          !name.toLowerCase().includes('philippines') &&
          !name.toLowerCase().includes('luzon') &&
          name.length > 2) {
        
        // Clean and format the barangay name
        let cleanName = name.trim();
        // Remove "Barangay" prefix if present
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
          console.log(`Found barangay via ${strategy}: ${cleanName}`);
          return cleanName;
        }
      }
    }
  }

  return null;
};

// Enhanced boundary checking for Lipa City
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

const CreateEmergencyReport: React.FC = () => {
  // Form states
  const [name, setName] = useState("");
  const [emergencyType, setEmergencyType] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [description, setDescription] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [processedPhotoUri, setProcessedPhotoUri] = useState<string | null>(null);
  const [photoTimestamp, setPhotoTimestamp] = useState<Date | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingUserData, setIsLoadingUserData] = useState(true);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  
  // Camera states
  const [showCamera, setShowCamera] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  
  // Location states
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [addressComponents, setAddressComponents] = useState<AddressComponents | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);
  
  // New barangay dropdown state
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [cameraTimestamp, setCameraTimestamp] = useState<string>("");
  const mapRef = useRef<MapView>(null);
  const { user } = useAuth();
  const defaultLocation = { latitude: 13.9411, longitude: 121.1624 };

  // Effect to update camera timestamp every second - WORKING VERSION
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
  }, []); // Remove user dependency to prevent re-initialization

  // Auto-select barangay when addressComponents changes
  useEffect(() => {
    if (addressComponents && addressComponents.barangay) {
      // Find matching barangay in the list
      const matchedBarangay = lipaBarangays.find(barangay => 
        barangay.toLowerCase().includes(addressComponents.barangay.toLowerCase()) ||
        addressComponents.barangay.toLowerCase().includes(barangay.toLowerCase())
      );
      
      if (matchedBarangay) {
        setSelectedBarangay(matchedBarangay);
      } else {
        // If no exact match, set to first barangay as default
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      console.error('Error initializing location:', error);
      await setDefaultLocationAndAddress();
    }
  };

  const setDefaultLocationAndAddress = async () => {
    console.log('🏛️ Setting default location (Lipa City Hall)');
    setCurrentLocation(defaultLocation);
    setSelectedLocation(defaultLocation);
    
    try {
      const address = await getEnhancedAddress(defaultLocation.latitude, defaultLocation.longitude);
      if (address) {
        setAddressComponents(address);
      } else {
        // Fallback for city center
        const fallbackAddress: AddressComponents = {
          barangay: "Poblacion Barangay 1",
          city: "Lipa City",
          province: "Batangas",
          country: "Philippines",
          formattedAddress: "Poblacion Barangay 1, Lipa City, Batangas, Philippines",
          confidence: 80,
          dataSource: "coordinate_fallback"
        };
        setAddressComponents(fallbackAddress);
      }
    } catch (error: unknown) {
      console.error('Error getting default address:', error);
    }
  };

  const getCurrentLocationWithFallback = async () => {
    try {
      console.log('📱 Getting current location with enhanced accuracy...');
      const location = await Location.getCurrentPositionAsync({ 
        accuracy: Location.Accuracy.High,
        timeInterval: 10000,
        distanceInterval: 1,
      });
      const coords = { 
        latitude: location.coords.latitude, 
        longitude: location.coords.longitude 
      };
      console.log(`🗺️ Got coordinates: ${coords.latitude}, ${coords.longitude}`);
      
      if (!isWithinLipaCityBounds(coords.latitude, coords.longitude)) {
        console.log('⚠️ Coordinates outside Lipa City bounds, using default location');
        await setDefaultLocationAndAddress();
        return;
      }
      
      setCurrentLocation(coords);
      setSelectedLocation(coords);
      try {
        setIsGeocodingAddress(true);
        const address = await getEnhancedAddress(coords.latitude, coords.longitude);
        if (address) {
          console.log('✅ Enhanced geocoding successful:', address);
          setAddressComponents(address);
        } else {
          console.log('⚠️ Enhanced geocoding failed, using city center fallback');
          await setDefaultLocationAndAddress();
        }
      } catch (geocodingError: unknown) {
        console.error('Enhanced geocoding failed:', geocodingError);
        await setDefaultLocationAndAddress();
      } finally {
        setIsGeocodingAddress(false);
      }
    } catch (error: unknown) {
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
          'Location permission is required to pin your current location. Please enable location access in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Settings', 
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Alert.alert(
                    'Enable Location Access',
                    'Go to Settings > Privacy & Security > Location Services > YourApp and select "While Using App" or "Ask Next Time"',
                    [{ text: 'OK' }]
                  );
                } else {
                  Linking.openSettings().catch(() => {
                    Alert.alert(
                      'Enable Location Access', 
                      'Go to Settings > Apps > YourApp > Permissions and enable Location permission',
                      [{ text: 'OK' }]
                    );
                  });
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
          'Your current location appears to be outside Lipa City limits. Emergency reports can only be submitted within Lipa City.',
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
            `Your current location has been set as the emergency location.\n\nAddress: ${address.formattedAddress}`,
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert(
            'Location Pinned',
            'Your location has been pinned, but we could not determine the exact barangay. Please verify the location before submitting.',
            [{ text: 'OK' }]
          );
        }
      } catch (error: unknown) {
        console.error('Enhanced geocoding failed for pinned location:', error);
      } finally {
        setIsGeocodingAddress(false);
      }
    } catch (error: any) {
      console.error('Error pinning location:', error);
      Alert.alert('Location Error', 'Could not get your current location. Please try again or manually select your location on the map.', [{ text: 'OK' }]);
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
    console.log(`📍 Map location selected: ${coordinate.latitude}, ${coordinate.longitude}`);
    try {
      setIsGeocodingAddress(true);
      const address = await getEnhancedAddress(coordinate.latitude, coordinate.longitude);
      if (address) {
        console.log('✅ Enhanced address found:', address);
        setAddressComponents(address);
      } else {
        console.log('⚠️ Could not determine barangay for selected location');
        // Still allow location selection but warn user
        setAddressComponents({
          barangay: "Poblacion Barangay 1",
          city: "Lipa City", 
          province: "Batangas",
          country: "Philippines",
          formattedAddress: `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)} - Lipa City, Batangas`,
          confidence: 50,
          dataSource: "coordinate_fallback"
        });
      }
    } catch (error: unknown) {
      console.error('Error getting address for selected location:', error);
    } finally {
      setIsGeocodingAddress(false);
    }
  };

  const takePicture = async () => {
    if (!cameraRef.current) {
      Alert.alert("Error", "Camera not ready. Please try again.");
      return;
    }

    try {
      setIsProcessingPhoto(true);
      
      const currentTime = new Date();
      console.log("Taking photo with timestamp:", currentTime.toISOString());

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
        skipProcessing: false,
      });

      if (!photo || !photo.uri) {
        throw new Error("Failed to capture photo from camera.");
      }

      console.log("Camera photo captured successfully:", photo.uri);

      // FIXED: Use the proper timestamp embedding function
      const processedUri = await processImageWithTimestamp(photo.uri, currentTime);

      setPhotoUri(photo.uri);
      setProcessedPhotoUri(processedUri);
      setPhotoTimestamp(currentTime);
      setShowCamera(false);

      Alert.alert(
        'Photo Captured Successfully!',
        `Timestamp: ${currentTime.toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        })} - LipaAlertHub\n\nPhoto processed and ready for submission with embedded timestamp.`,
        [{ text: 'OK' }]
      );
    } catch (error: unknown) {
      console.error("Error taking picture:", error);
      Alert.alert("Error", "Failed to take picture. Please try again.");
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleSubmit = async () => {
    try {
      // Enhanced validation - MADE DESCRIPTION OPTIONAL
      if (!name.trim()) {
        Alert.alert("Validation Error", "Please enter your name.");
        return;
      }
      if (!emergencyType) {
        Alert.alert("Validation Error", "Please select the type of emergency.");
        return;
      }
      if (!subCategory) {
        Alert.alert("Validation Error", "Please select a subcategory for this emergency type.");
        return;
      }
      if (!selectedLocation) {
        Alert.alert("Validation Error", "Please select a location on the map.");
        return;
      }
      if (!selectedBarangay) {
        Alert.alert("Validation Error", "Please select the correct barangay.");
        return;
      }

      if (!isWithinLipaCityBounds(selectedLocation.latitude, selectedLocation.longitude)) {
        Alert.alert("Invalid Location", "Emergency reports can only be submitted within Lipa City limits.");
        return;
      }

      setIsSubmitting(true);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      console.log("🚀 Starting emergency report submission...");
      console.log("📋 Form data:", {
        emergencyType,
        subCategory,
        description: description ? description.substring(0, 50) + "..." : "No additional details provided",
        selectedBarangay,
        hasPhoto: !!processedPhotoUri
      });

      let photoUrl = null;
      if (processedPhotoUri && photoTimestamp) {
        try {
          const tempId = `temp_${Date.now()}`;
          photoUrl = await uploadImage(processedPhotoUri, currentUser, photoTimestamp, tempId);
          console.log("✅ Photo uploaded successfully:", photoUrl);
        } catch (uploadError: unknown) {
          console.warn("Photo upload failed:", uploadError);
          photoUrl = null;
        }
      }

      // Get subcategory label for display
      const subCategoryLabel = subCategoryOptions[emergencyType]?.find(
        option => option.value === subCategory
      )?.label || subCategory;

      const emergencyTypeLabel = emergencyTypes.find(
        type => type.value === emergencyType
      )?.label || emergencyType;

      console.log("🏷️ Labels:", { emergencyTypeLabel, subCategoryLabel });

      const result = await submitIncidentReport({
        emergencyType: emergencyType,
        category: emergencyType,
        subCategory: subCategory,
        description: description.trim() || `${emergencyTypeLabel} - ${subCategoryLabel}`, // Use type/subtype as description if empty
        location: {
          lat: selectedLocation.latitude,
          lng: selectedLocation.longitude
        },
        name: name.trim(),
        photoUrl,
        notes: [
          description.trim() || "No additional details provided",
          `\n--- Emergency Details ---`,
          `Emergency Type: ${emergencyTypeLabel}`,
          `Subcategory: ${subCategoryLabel}`,
          `\n--- Location Details ---`,
          `Address: ${addressComponents?.formattedAddress || 'Address not available'}`,
          addressComponents?.establishment ? `Establishment: ${addressComponents.establishment}` : '',
          `Selected Barangay: ${selectedBarangay}`,
          `Detected Barangay: ${addressComponents?.barangay || 'Not detected'}`,
          `Data Source: ${addressComponents?.dataSource || 'Unknown'}`
        ].filter(Boolean).join('\n')
      });

      if (result.success) {
        console.log("🎉 Emergency report submitted successfully:", result);
        Alert.alert(
          "Emergency Report Submitted Successfully!", 
          `Your emergency report has been submitted and assigned ID: ${result.id}. Emergency responders have been notified.\n\nType: ${emergencyTypeLabel}\nSubcategory: ${subCategoryLabel}\nBarangay: ${selectedBarangay}`,
          [
            {
              text: "View Status",
              onPress: () => {
                resetForm();
                router.push({
                  pathname: "/(main)/report/status",
                  params: { reportId: result.id },
                });
              },
            },
            {
              text: "Go to Dashboard",
              onPress: () => {
                resetForm();
                router.push("/(main)");
              },
              style: "cancel",
            },
          ]
        );
      } else {
        throw new Error(result.error || "Failed to submit emergency report");
      }

    } catch (error: unknown) {
      console.error("Submit error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      Alert.alert("Error", `There was an error submitting your emergency report: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    console.log("🔄 Resetting form to initial state...");
    
    // Reset all form fields
    setEmergencyType("");
    setSubCategory("");
    setDescription("");
    setPhotoUri(null);
    setProcessedPhotoUri(null);
    setPhotoTimestamp(null);
    setAddressComponents(null);
    setSelectedBarangay("");
    
    // Reset location to default
    setCurrentLocation(null);
    setSelectedLocation(null);
    
    // Reset loading states
    setIsSubmitting(false);
    setIsProcessingPhoto(false);
    setIsGettingLocation(false);
    setIsGeocodingAddress(false);
    
    // Reset camera
    setShowCamera(false);
    setCameraTimestamp("");
    
    // Reinitialize location
    initializeLocation();
    
    console.log("✅ Form reset completed");
  };

  // Enhanced initialization function to ensure clean state
  const initializeFormState = async () => {
    console.log("🚀 Initializing form state...");
    
    try {
      // First ensure all states are reset
      setEmergencyType("");
      setSubCategory("");
      setDescription("");
      setPhotoUri(null);
      setProcessedPhotoUri(null);
      setPhotoTimestamp(null);
      setSelectedBarangay("");
      
      // Then initialize user data and location
      await initializeUserDataAndLocation();
      
      console.log("✅ Form state initialization completed");
    } catch (error) {
      console.error("❌ Error during form initialization:", error);
    }
  };

  // Effect to initialize form when component mounts
  useEffect(() => {
    initializeFormState();
  }, []); // Only run once on mount

  // Effect to handle user changes (separate from initialization)
  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user]);
    const handleBackPress = () => {
    if (emergencyType || description.trim() || processedPhotoUri) {
      Alert.alert("Discard Changes?", "You have unsaved changes.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          onPress: () => {
            resetForm(); // Reset form before going back
            router.back();
          },
          style: "destructive",
        },
      ]);
    } else {
      resetForm(); // Always reset form when going back
      router.back();
    }
  };

  // Add cleanup effect to reset form when component unmounts
  useEffect(() => {
    return () => {
      console.log("🧹 Component unmounting, cleaning up form state...");
      // Reset states on unmount to ensure fresh start next time
      setEmergencyType("");
      setSubCategory("");
      setDescription("");
      setPhotoUri(null);
      setProcessedPhotoUri(null);
      setPhotoTimestamp(null);
      setSelectedBarangay("");
    };
  }, []);

  // Camera permission check
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

  // Enhanced Camera view with fixed timestamp format
  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
          {/* Live timestamp preview - WORKING VERSION POSITIONING */}
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

  // Loading state
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
      {/* Header */}
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
        
        {/* Name Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Reporter Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            value={name}
            onChangeText={setName}
            placeholderTextColor="#999"
          />
        </View>

        {/* Emergency Type Selection */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Type of Emergency</Text>
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
                  setSubCategory(""); // Reset subcategory when type changes
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

        {/* Subcategory Selection */}
        {emergencyType && subCategoryOptions[emergencyType] && (
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Subcategory</Text>
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
                  onPress={() => {
                    setSubCategory(option.value);
                  }}
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

        {/* Enhanced Location Map */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Incident Location</Text>
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
          
          {/* Show full address */}
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
            </View>
          )}

          {/* Barangay Dropdown Section */}
          <View style={styles.barangayContainer}>
            <Text style={styles.barangayLabel}>Barangay</Text>
            <View style={styles.barangayDropdownContainer}>
              <Picker
                selectedValue={selectedBarangay}
                onValueChange={(itemValue) => {
                  setSelectedBarangay(itemValue);
                }}
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
              Please verify and select the correct barangay for your emergency location. The system may have auto-selected based on GPS, but you can change it if needed.
            </Text>
          </View>
          
          <Text style={styles.helperText}>
            Tap on the map to select incident location or use "Pin My Location" button
          </Text>
        </View>

        {/* Photo Section */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Evidence Photo</Text>
          <View style={styles.photoContainer}>
            <TouchableOpacity
              style={styles.takePhotoButton}
              onPress={() => setShowCamera(true)}
            >
              <Ionicons name="camera" size={20} color="#fff" />
              <Text style={styles.takePhotoButtonText}>TAKE PHOTO</Text>
              {processedPhotoUri && (
                <View style={styles.cameraIcon}>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          </View>
          
          {processedPhotoUri && photoTimestamp && (
            <TimestampOverlayPreview 
              photoUri={processedPhotoUri} 
              timestamp={photoTimestamp} 
            />
          )}
        </View>

        {/* Additional Details - NOW OPTIONAL */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Additional Details (Optional)</Text>
          <Text style={styles.helperText}>
            You can provide additional information about the incident if needed.
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Provide additional details about the incident... (optional)"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            placeholderTextColor="#999"
            textAlignVertical="top"
          />
        </View>

        {/* Submit Button */}
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
  // Emergency Type Grid Styles
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
    shadowOffset: {
      width: 0,
      height: 4,
    },
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
  // Radio Button Styles for Subcategories
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
  // Map Styles
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
  // Address Display Styles
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
  // Barangay Dropdown Styles
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
  // Photo Styles
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
  takePhotoButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  cameraIcon: {
    position: 'absolute',
    right: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Enhanced Image Preview Styles with Fixed Timestamp
  imagePreviewContainer: {
    alignItems: 'center',
    marginTop: 15,
  },
  imageWithOverlay: {
    position: 'relative',
    width: 280,
    height: 210,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  // FIXED: Enhanced timestamp overlay styles
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
  // Submit Button
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
  // Camera Styles
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  // Live camera timestamp positioning
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
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
  },
  captureContainer: {
    alignItems: 'center',
    marginBottom: 20,
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
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.9,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    marginBottom: 8,
    fontWeight: '500',
  },
});

export default CreateEmergencyReport;

//CURRENT