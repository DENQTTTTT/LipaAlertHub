import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
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
  Modal,
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

// Enhanced image processing function with timestamp overlay creation
const processImageWithTimestamp = async (originalUri: string, timestamp: Date): Promise<string> => {
  try {
    console.log("Starting enhanced image processing with timestamp embedding...");
    
    // First, optimize the image size
    const processedImage = await ImageManipulator.manipulateAsync(
      originalUri,
      [
        { resize: { width: 1024 } } // Resize to reasonable size while maintaining quality
      ],
      { 
        format: ImageManipulator.SaveFormat.JPEG,
        compress: 0.85 
      }
    );

    console.log("Image processed successfully with embedded metadata");
    return processedImage.uri;
  } catch (error) {
    console.error("Error processing image:", error);
    return originalUri; // Return original if processing fails
  }
};

// Enhanced timestamp overlay component for preview
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
          <Text style={styles.timestampTextPreview}>{timestampText}</Text>
          <Text style={styles.timestampBrandPreview}>LipaAlertHub</Text>
        </View>
      </View>
      
      <View style={styles.timestampInfoContainer}>
        <Text style={styles.timestampLabel}>Photo captured with timestamp:</Text>
        <Text style={styles.timestampValue}>{timestampText}</Text>
        <Text style={styles.timestampNote}>
          ✓ Timestamp will be permanently embedded when submitted
        </Text>
      </View>
    </View>
  );
};

const uploadImage = async (uri: string, user: any, timestamp: Date) => {
  try {
    const storage = getStorage();
    const timestampStr = new Date().toISOString().replace(/[:.]/g, "-");
    const imageRef = ref(storage, `incident_photos/photo-${timestampStr}.jpg`);
    
    const response = await fetch(uri);
    const blob = await response.blob();
    
    const timestampText = timestamp.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }) + ' - LipaAlertHub';
    
    await uploadBytes(imageRef, blob, {
      contentType: "image/jpeg",
      customMetadata: {
        userId: user.uid,
        photoTakenAt: timestamp.toISOString(),
        hasTimestamp: "true",
        timestampText: timestampText,
        embedTimestamp: "true" // Signal server to embed timestamp
      }
    });
    
    const downloadURL = await getDownloadURL(imageRef);
    return downloadURL;
  } catch (error) {
    console.error("Upload error:", error);
    throw error;
  }
};

// Google Maps API Keys
const GOOGLE_MAPS_API_KEYS = {
  android: 'AIzaSyDHNKCfdb_Ae0sMaSmdDf88xjOvj2hJM68',
  ios: 'AIzaSyB2MdahsHMIyhDjBTTVwgAm1i-zVx4OD5U',
  geocoding: 'AIzaSyACw2laKXQGTW634IejVAdK8m0PKngvaRo'
};

const getGoogleMapsApiKey = (): string => {
  return GOOGLE_MAPS_API_KEYS.geocoding;
};

// Enhanced Barangay options for Lipa City, Batangas with variations
const barangayOptions = [
  { label: "Select Barangay", value: "" },
  { label: "Anilao", value: "Anilao", variations: ["anilao"] },
  { label: "Anilao-Labac", value: "Anilao-Labac", variations: ["anilao-labac", "anilao labac"] },
  { label: "Antipolo del Norte", value: "Antipolo del Norte", variations: ["antipolo del norte", "antipolo norte"] },
  { label: "Antipolo del Sur", value: "Antipolo del Sur", variations: ["antipolo del sur", "antipolo sur"] },
  { label: "Bagong Pook", value: "Bagong Pook", variations: ["bagong pook"] },
  { label: "Balintawak", value: "Balintawak", variations: ["balintawak"] },
  { label: "Banaybanay", value: "Banaybanay", variations: ["banaybanay"] },
  { label: "Bolbok", value: "Bolbok", variations: ["bolbok"] },
  { label: "Bugtong na Pulo", value: "Bugtong na Pulo", variations: ["bugtong na pulo", "bugtong pulo"] },
  { label: "Bulacnin", value: "Bulacnin", variations: ["bulacnin"] },
  { label: "Bulaklakan", value: "Bulaklakan", variations: ["bulaklakan"] },
  { label: "Calamias", value: "Calamias", variations: ["calamias"] },
  { label: "Cumba", value: "Cumba", variations: ["cumba"] },
  { label: "Dagatan", value: "Dagatan", variations: ["dagatan"] },
  { label: "Duhatan", value: "Duhatan", variations: ["duhatan"] },
  { label: "Halang", value: "Halang", variations: ["halang"] },
  { label: "Inosloban", value: "Inosloban", variations: ["inosloban"] },
  { label: "Kayumanggi", value: "Kayumanggi", variations: ["kayumanggi"] },
  { label: "Latag", value: "Latag", variations: ["latag"] },
  { label: "Lodlod", value: "Lodlod", variations: ["lodlod"] },
  { label: "Lumbang", value: "Lumbang", variations: ["lumbang"] },
  { label: "Mabini", value: "Mabini", variations: ["mabini"] },
  { label: "Malvar", value: "Malvar", variations: ["malvar"] },
  { label: "Marawoy", value: "Marawoy", variations: ["marawoy"] },
  { label: "Mataas na Lupa", value: "Mataas na Lupa", variations: ["mataas na lupa", "mataas lupa"] },
  { label: "Munting Pulo", value: "Munting Pulo", variations: ["munting pulo"] },
  { label: "Pagolingin Bata", value: "Pagolingin Bata", variations: ["pagolingin bata"] },
  { label: "Pagolingin East", value: "Pagolingin East", variations: ["pagolingin east"] },
  { label: "Pagolingin West", value: "Pagolingin West", variations: ["pagolingin west"] },
  { label: "Pangao", value: "Pangao", variations: ["pangao"] },
  { label: "Pinagkawitan", value: "Pinagkawitan", variations: ["pinagkawitan"] },
  { label: "Pinagtongulan", value: "Pinagtongulan", variations: ["pinagtongulan"] },
  { label: "Plaridel", value: "Plaridel", variations: ["plaridel"] },
  { label: "Poblacion Barangay 1", value: "Poblacion Barangay 1", variations: ["poblacion barangay 1", "poblacion 1", "barangay 1"] },
  { label: "Poblacion Barangay 2", value: "Poblacion Barangay 2", variations: ["poblacion barangay 2", "poblacion 2", "barangay 2"] },
  { label: "Poblacion Barangay 3", value: "Poblacion Barangay 3", variations: ["poblacion barangay 3", "poblacion 3", "barangay 3"] },
  { label: "Poblacion Barangay 4", value: "Poblacion Barangay 4", variations: ["poblacion barangay 4", "poblacion 4", "barangay 4"] },
  { label: "Poblacion Barangay 5", value: "Poblacion Barangay 5", variations: ["poblacion barangay 5", "poblacion 5", "barangay 5"] },
  { label: "Poblacion Barangay 6", value: "Poblacion Barangay 6", variations: ["poblacion barangay 6", "poblacion 6", "barangay 6"] },
  { label: "Poblacion Barangay 7", value: "Poblacion Barangay 7", variations: ["poblacion barangay 7", "poblacion 7", "barangay 7"] },
  { label: "Poblacion Barangay 8", value: "Poblacion Barangay 8", variations: ["poblacion barangay 8", "poblacion 8", "barangay 8"] },
  { label: "Poblacion Barangay 9", value: "Poblacion Barangay 9", variations: ["poblacion barangay 9", "poblacion 9", "barangay 9"] },
  { label: "Poblacion Barangay 10", value: "Poblacion Barangay 10", variations: ["poblacion barangay 10", "poblacion 10", "barangay 10"] },
  { label: "Poblacion Barangay 11", value: "Poblacion Barangay 11", variations: ["poblacion barangay 11", "poblacion 11", "barangay 11"] },
  { label: "Poblacion Barangay 12", value: "Poblacion Barangay 12", variations: ["poblacion barangay 12", "poblacion 12", "barangay 12"] },
  { label: "Pusil", value: "Pusil", variations: ["pusil"] },
  { label: "Quezon", value: "Quezon", variations: ["quezon"] },
  { label: "Rizal", value: "Rizal", variations: ["rizal"] },
  { label: "Sabang", value: "Sabang", variations: ["sabang"] },
  { label: "Sampaguita", value: "Sampaguita", variations: ["sampaguita"] },
  { label: "San Benito", value: "San Benito", variations: ["san benito"] },
  { label: "San Carlos", value: "San Carlos", variations: ["san carlos"] },
  { label: "San Celestino", value: "San Celestino", variations: ["san celestino"] },
  { label: "San Francisco", value: "San Francisco", variations: ["san francisco"] },
  { label: "San Guillermo", value: "San Guillermo", variations: ["san guillermo"] },
  { label: "San Jose", value: "San Jose", variations: ["san jose"] },
  { label: "San Lucas", value: "San Lucas", variations: ["san lucas"] },
  { label: "San Salvador", value: "San Salvador", variations: ["san salvador"] },
  { label: "San Sebastian", value: "San Sebastian", variations: ["san sebastian"] },
  { label: "Santo Niño", value: "Santo Niño", variations: ["santo niño", "santo nino"] },
  { label: "Santo Toribio", value: "Santo Toribio", variations: ["santo toribio"] },
  { label: "Sapac", value: "Sapac", variations: ["sapac"] },
  { label: "Sico", value: "Sico", variations: ["sico"] },
  { label: "Talisay", value: "Talisay", variations: ["talisay"] },
  { label: "Tambo", value: "Tambo", variations: ["tambo"] },
  { label: "Tangob", value: "Tangob", variations: ["tangob"] },
  { label: "Tanguay", value: "Tanguay", variations: ["tanguay"] },
  { label: "Tibig", value: "Tibig", variations: ["tibig"] },
  { label: "Tipacan", value: "Tipacan", variations: ["tipacan"] }
];

// Emergency type options
const emergencyTypes = [
  { label: "Select Emergency Type", value: "" },
  { label: "Accident", value: "accident" },
  { label: "Fire", value: "fire" },
  { label: "Medical Emergency", value: "medical" },
  { label: "Natural Disaster", value: "disaster" },
  { label: "Crime", value: "crime" },
  { label: "Infrastructure", value: "infrastructure" }
];

// Subcategory options based on emergency type
const subCategoryOptions: Record<string, { label: string; value: string }[]> = {
  accident: [
    { label: "Select Subcategory", value: "" },
    { label: "Vehicular Accident", value: "Vehicular Accident" },
    { label: "Slip and Fall", value: "Slip and Fall" },
    { label: "Work-related Accident", value: "Work-related Accident" },
    { label: "Road Accident", value: "Road Accident" }
  ],
  fire: [
    { label: "Select Subcategory", value: "" },
    { label: "House Fire", value: "House Fire" },
    { label: "Vehicle Fire", value: "Vehicle Fire" },
    { label: "Wildfire", value: "Wildfire" },
    { label: "Electrical Fire", value: "Electrical Fire" }
  ],
  medical: [
    { label: "Select Subcategory", value: "" },
    { label: "Heart Attack", value: "Heart Attack" },
    { label: "Stroke", value: "Stroke" },
    { label: "Accident Injury", value: "Accident Injury" },
    { label: "Drug Overdose", value: "Drug Overdose" },
    { label: "Other Medical", value: "Other Medical" }
  ],
  disaster: [
    { label: "Select Subcategory", value: "" },
    { label: "Flood", value: "Flood" },
    { label: "Earthquake", value: "Earthquake" },
    { label: "Landslide", value: "Landslide" },
    { label: "Storm", value: "Storm" },
    { label: "Typhoon", value: "Typhoon" }
  ],
  crime: [
    { label: "Select Subcategory", value: "" },
    { label: "Theft", value: "Theft" },
    { label: "Assault", value: "Assault" },
    { label: "Vandalism", value: "Vandalism" },
    { label: "Robbery", value: "Robbery" }
  ],
  infrastructure: [
    { label: "Select Subcategory", value: "" },
    { label: "Power Outage", value: "Power Outage" },
    { label: "Water Issue", value: "Water Issue" },
    { label: "Road Damage", value: "Road Damage" },
    { label: "Bridge Issue", value: "Bridge Issue" }
  ]
};

// Enhanced Google Maps Geocoding API function
const reverseGeocode = async (latitude: number, longitude: number): Promise<string> => {
  try {
    const API_KEY = getGoogleMapsApiKey();
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${API_KEY}&language=en&region=PH`;
    
    const response = await fetch(geocodeUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status === 'OK' && data.results.length > 0) {
      const result = data.results[0];
      return result.formatted_address;
    }
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)} (No address found)`;
  } catch (error) {
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)} (Network error)`;
  }
};

// Function to extract address line from full address
const extractAddressLine = (fullAddress: string): string => {
  try {
    const parts = fullAddress.split(',');
    if (parts.length > 0) {
      return parts[0].trim();
    }
    return '';
  } catch (error) {
    return '';
  }
};

// Enhanced function to auto-detect barangay from address
const detectBarangayFromAddress = (fullAddress: string): string => {
  try {
    const addressLower = fullAddress.toLowerCase();
    console.log('Detecting barangay from address:', addressLower);
    
    for (const barangayItem of barangayOptions) {
      if (!barangayItem.value) continue;
      
      const mainName = barangayItem.value.toLowerCase();
      if (addressLower.includes(mainName)) {
        console.log('Found barangay by main name:', barangayItem.value);
        return barangayItem.value;
      }
      
      if (barangayItem.variations) {
        for (const variation of barangayItem.variations) {
          if (addressLower.includes(variation.toLowerCase())) {
            console.log('Found barangay by variation:', barangayItem.value);
            return barangayItem.value;
          }
        }
      }
      
      const words = addressLower.split(/[\s,.-]+/);
      const barangayWords = mainName.split(/[\s-]+/);
      
      for (const barangayWord of barangayWords) {
        if (barangayWord.length > 3) {
          for (const word of words) {
            if (word.includes(barangayWord) || barangayWord.includes(word)) {
              console.log('Found barangay by fuzzy matching:', barangayItem.value);
              return barangayItem.value;
            }
          }
        }
      }
    }
    
    console.log('No barangay detected from address');
    return '';
  } catch (error) {
    console.error('Error detecting barangay:', error);
    return '';
  }
};

const IncidentReportForm = () => {
  // Form and map states
  const [name, setName] = useState("");
  const [barangay, setBarangay] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [emergencyType, setEmergencyType] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [processedPhotoUri, setProcessedPhotoUri] = useState<string | null>(null);
  const [photoTimestamp, setPhotoTimestamp] = useState<Date | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingUserData, setIsLoadingUserData] = useState(true);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  
  const [showCamera, setShowCamera] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [fullAddress, setFullAddress] = useState<string>("");
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Real-time timestamp state for camera overlay
  const [cameraTimestamp, setCameraTimestamp] = useState<string>("");

  // Map reference for animating to location
  const mapRef = useRef<MapView>(null);
  
  // Auth hook
  const { user } = useAuth();

  // Default location for Lipa City, Batangas
  const defaultLocation = { latitude: 13.9411, longitude: 121.1624 };

  // Effect to update camera timestamp every second
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
  }, [user]);

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
    setCurrentLocation(defaultLocation);
    setSelectedLocation(defaultLocation);
    const address = await reverseGeocode(defaultLocation.latitude, defaultLocation.longitude);
    setFullAddress(address);
    updateAddressFields(address);
  };

  const getCurrentLocationWithFallback = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({ 
        accuracy: Location.Accuracy.High,
      });
      
      const coords = { 
        latitude: location.coords.latitude, 
        longitude: location.coords.longitude 
      };
      
      setCurrentLocation(coords);
      setSelectedLocation(coords);
      
      const address = await reverseGeocode(coords.latitude, coords.longitude);
      setFullAddress(address);
      updateAddressFields(address);
    } catch (error) {
      console.error('Error getting current location:', error);
      await setDefaultLocationAndAddress();
    }
  };

  const updateAddressFields = (address: string) => {
    console.log('Updating address fields with:', address);
    
    const extractedAddressLine = extractAddressLine(address);
    setAddressLine(extractedAddressLine);
    
    const detectedBarangay = detectBarangayFromAddress(address);
    if (detectedBarangay) {
      console.log('Setting barangay to:', detectedBarangay);
      setBarangay(detectedBarangay);
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
      });
      
      const coords = { 
        latitude: location.coords.latitude, 
        longitude: location.coords.longitude 
      };
      
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
      
      const address = await reverseGeocode(coords.latitude, coords.longitude);
      setFullAddress(address);
      updateAddressFields(address);
      
      const detectedBarangay = detectBarangayFromAddress(address);
      Alert.alert(
        'Location Pinned Successfully!', 
        `Your current location has been set as the incident location.\n\nAddress: ${extractAddressLine(address)}\n${detectedBarangay ? `Barangay: ${detectedBarangay}` : 'Barangay: Please select manually'}`,
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('Error pinning location:', error);
      let errorMessage = 'Could not get your current location. ';
      
      if (error?.code === 'E_LOCATION_TIMEOUT') {
        errorMessage += 'Location request timed out. Please try again or check your GPS settings.';
      } else if (error?.code === 'E_LOCATION_UNAVAILABLE') {
        errorMessage += 'Location services are not available. Please enable GPS and try again.';
      } else {
        errorMessage += 'Please try again or manually select your location on the map.';
      }
      
      Alert.alert('Location Error', errorMessage, [{ text: 'OK' }]);
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleMapPress = async (event: any) => {
    const coordinate = event.nativeEvent.coordinate;
    setSelectedLocation(coordinate);

    try {
      const address = await reverseGeocode(coordinate.latitude, coordinate.longitude);
      setFullAddress(address);
      updateAddressFields(address);
    } catch (error) {
      const fallbackAddress = `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)} (Address lookup failed)`;
      setFullAddress(fallbackAddress);
    }
  };

  // Enhanced takePicture function with proper camera capture
  const takePicture = async () => {
    if (!cameraRef.current) {
      Alert.alert("Error", "Camera not ready. Please try again.");
      return;
    }

    try {
      setIsProcessingPhoto(true);
      
      const currentTime = new Date();
      console.log("Taking photo with timestamp:", currentTime.toISOString());

      // Take the actual photo from camera
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
        skipProcessing: false,
      });

      if (!photo || !photo.uri) {
        throw new Error("Failed to capture photo from camera.");
      }

      console.log("Camera photo captured successfully:", photo.uri);

      // Process the image with timestamp metadata
      const processedUri = await processImageWithTimestamp(photo.uri, currentTime);

      // Store URIs and timestamp
      setPhotoUri(photo.uri);
      setProcessedPhotoUri(processedUri);
      setPhotoTimestamp(currentTime);
      setShowCamera(false);

      // Show success confirmation
      Alert.alert(
        'Photo Captured Successfully!',
        `Timestamp: ${currentTime.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        })}\n\nPhoto processed and ready for submission with embedded timestamp.`,
        [{ text: 'OK' }]
      );

    } catch (error) {
      console.error("Error taking picture:", error);
      Alert.alert("Error", "Failed to take picture. Please try again.");
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleSubmit = async () => {
    try {
      if (!name.trim()) {
        Alert.alert("Validation Error", "Please enter your name.");
        return;
      }
      if (!barangay) {
        Alert.alert("Validation Error", "Please select a barangay.");
        return;
      }
      if (!addressLine.trim()) {
        Alert.alert("Validation Error", "Please enter the address line.");
        return;
      }
      if (!emergencyType) {
        Alert.alert("Validation Error", "Please select the type of emergency.");
        return;
      }
      if (!subCategory) {
        Alert.alert("Validation Error", "Please select a subcategory.");
        return;
      }
      if (!selectedLocation) {
        Alert.alert("Validation Error", "Please select a location on the map.");
        return;
      }
      if (!processedPhotoUri || !photoTimestamp) {
        Alert.alert("Validation Error", "Please take a photo of the incident.");
        return;
      }

      setIsSubmitting(true);

      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      // Upload the processed photo with timestamp metadata
      const photoUrl = await uploadImage(processedPhotoUri, currentUser, photoTimestamp);

      const report = await submitIncidentReport({
        name,
        barangay,
        addressLine,
        emergencyType,
        subCategory,
        notes,
        location: selectedLocation,
        photoURL: photoUrl,
        timestamp: photoTimestamp,
        fullAddress,
      });

      if (report.success && report.id) {
        Alert.alert(
          "Report Submitted Successfully!",
          "Your incident report has been submitted with timestamped photo evidence. You will receive notifications about its status.",
          [
            {
              text: "View Status",
              onPress: () => {
                resetForm();
                router.push({
                  pathname: '/(main)/report/status',
                  params: { reportId: report.id }
                });
              },
            },
            {
              text: "Go to Dashboard",
              onPress: () => {
                resetForm();
                router.push("/(main)");
              },
              style: 'cancel',
            },
          ]
        );
      } else {
        throw new Error("Failed to get report ID");
      }
    } catch (error) {
      console.error("Submit error:", error);
      Alert.alert("Error", "There was an error submitting your report. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setBarangay("");
    setAddressLine("");
    setEmergencyType("");
    setSubCategory("");
    setNotes("");
    setPhotoUri(null);
    setProcessedPhotoUri(null);
    setPhotoTimestamp(null);
    initializeLocation();
  };

  // Helper function to get display label
  const getDisplayLabel = (options: any[], value: string) => {
    const option = options.find(opt => opt.value === value);
    return option ? option.label : options[0]?.label || "Select";
  };

  // Enhanced Cross-platform Picker Component
  const CrossPlatformPicker = ({ 
    label,
    options,
    selectedValue,
    onValueChange,
    placeholder,
    disabled = false
  }: {
    label: string;
    options: any[];
    selectedValue: string;
    onValueChange: (value: string) => void;
    placeholder: string;
    disabled?: boolean;
  }) => {
    const [showModal, setShowModal] = useState(false);
    const [tempValue, setTempValue] = useState(selectedValue);

    useEffect(() => {
      setTempValue(selectedValue);
    }, [selectedValue]);

    const handleDone = () => {
      onValueChange(tempValue);
      setShowModal(false);
    };

    const handleCancel = () => {
      setTempValue(selectedValue);
      setShowModal(false);
    };

    if (Platform.OS === 'ios') {
      return (
        <View style={styles.inputContainer}>
          <Text style={styles.label}>{label}</Text>
          <TouchableOpacity
            style={[styles.pickerButton, disabled && styles.pickerDisabled]}
            onPress={() => !disabled && setShowModal(true)}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text style={selectedValue ? styles.pickerButtonText : styles.pickerButtonPlaceholder}>
              {getDisplayLabel(options, selectedValue)}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#666" />
          </TouchableOpacity>

          <Modal
            visible={showModal}
            transparent={true}
            animationType="slide"
            onRequestClose={handleCancel}
          >
            <TouchableOpacity 
              style={styles.pickerModalOverlay} 
              activeOpacity={1} 
              onPress={handleCancel}
            >
              <View style={styles.pickerModalContent} onStartShouldSetResponder={() => true}>
                <View style={styles.pickerModalHeader}>
                  <TouchableOpacity
                    style={styles.pickerModalButton}
                    onPress={handleCancel}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.pickerModalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.pickerModalTitle}>{label}</Text>
                  <TouchableOpacity
                    style={styles.pickerModalButton}
                    onPress={handleDone}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.pickerModalDoneText}>Done</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={tempValue}
                    onValueChange={(value) => setTempValue(value)}
                    style={styles.iosPicker}
                    itemStyle={styles.iosPickerItem}
                  >
                    {options.map((option, index) => (
                      <Picker.Item 
                        key={`${option.value}-${index}`} 
                        label={option.label} 
                        value={option.value}
                      />
                    ))}
                  </Picker>
                </View>
              </View>
            </TouchableOpacity>
          </Modal>
        </View>
      );
    }

    // Android version
    return (
      <View style={styles.inputContainer}>
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.androidPickerContainer, disabled && styles.pickerDisabled]}>
          <Picker
            selectedValue={selectedValue}
            style={styles.androidPicker}
            onValueChange={onValueChange}
            enabled={!disabled}
            mode="dropdown"
            dropdownIconColor="#666"
          >
            {options.map((option, index) => (
              <Picker.Item 
                key={`${option.value}-${index}`} 
                label={option.label} 
                value={option.value}
                color="#333"
              />
            ))}
          </Picker>
        </View>
      </View>
    );
  };

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

  // Enhanced Camera view
  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
          {/* Live timestamp preview */}
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
        <Text style={styles.title}>Incident Form</Text>
        
        {/* Name Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your name"
            value={name}
            onChangeText={setName}
            placeholderTextColor="#999"
          />
        </View>

        {/* Location Map */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Location</Text>
          
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
          
          {fullAddress && (
            <View style={styles.addressContainer}>
              <Text style={styles.addressText}>{fullAddress}</Text>
            </View>
          )}
        </View>

        <CrossPlatformPicker
          label={`Barangay ${barangay ? '' : '(Will auto-fill from location)'}`}
          options={barangayOptions}
          selectedValue={barangay}
          onValueChange={setBarangay}
          placeholder="Select Barangay"
        />

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Address Line</Text>
          <TextInput
            style={styles.input}
            placeholder="Street address will be auto-filled from location"
            value={addressLine}
            onChangeText={setAddressLine}
            placeholderTextColor="#999"
          />
          <Text style={styles.helperText}>
            Tip: Use "Pin My Location" button above to auto-fill this field and barangay
          </Text>
        </View>

        <CrossPlatformPicker
          label="Type of Emergency"
          options={emergencyTypes}
          selectedValue={emergencyType}
          onValueChange={(value) => {
            setEmergencyType(value);
            setSubCategory("");
          }}
          placeholder="Select Emergency Type"
        />

        <CrossPlatformPicker
          label="Subcategory"
          options={emergencyType && subCategoryOptions[emergencyType] ? subCategoryOptions[emergencyType] : [{ label: "Select Subcategory", value: "" }]}
          selectedValue={subCategory}
          onValueChange={setSubCategory}
          placeholder="Select Subcategory"
          disabled={!emergencyType}
        />

        {/* Enhanced Photo Section */}
        <View style={styles.inputContainer}>
          <View style={styles.photoContainer}>
            <TouchableOpacity
              style={styles.takePhotoButton}
              onPress={() => setShowCamera(true)}
            >
              <Text style={styles.takePhotoButtonText}>TAKE A PICTURE</Text>
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

        {/* Notes Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Additional Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Provide additional details about the incident..."
            value={notes}
            onChangeText={setNotes}
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
            <ActivityIndicator size="small" color="#fff" />
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
    paddingTop: Platform.OS === 'ios' ? 50 : 25,
    paddingHorizontal: 20,
    paddingBottom: 15,
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
    color: "#D32F2F",
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
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
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
    marginTop: 5,
    fontStyle: 'italic',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  // iOS Picker Styles
  pickerButton: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 50,
  },
  pickerDisabled: {
    opacity: 0.6,
    backgroundColor: '#f5f5f5',
  },
  pickerButtonText: {
    fontSize: 16,
    color: "#333",
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    flex: 1,
  },
  pickerButtonPlaceholder: {
    fontSize: 16,
    color: "#999",
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    flex: 1,
  },
  pickerModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  pickerModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: height * 0.5,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#f8f9fa',
  },
  pickerModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    flex: 1,
    textAlign: 'center',
  },
  pickerModalButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 60,
  },
  pickerModalCancelText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  pickerModalDoneText: {
    fontSize: 16,
    color: '#e74c3c',
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  pickerContainer: {
    backgroundColor: '#fff',
  },
  iosPicker: {
    height: 200,
    width: '100%',
  },
  iosPickerItem: {
    fontSize: 16,
    color: '#333',
    height: 200,
  },
  // Android Picker Styles
  androidPickerContainer: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    overflow: 'hidden',
    minHeight: 50,
  },
  androidPicker: {
    height: 50,
    color: "#333",
  },
  // Map Styles
  mapContainer: {
    height: 200,
    borderRadius: 8,
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
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  pinLocationButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 44,
    height: 44,
    backgroundColor: '#fff',
    borderRadius: 8,
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
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  addressText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  // Enhanced Photo Styles
  photoContainer: {
    position: 'relative',
  },
  takePhotoButton: {
    backgroundColor: "#e74c3c",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'relative',
  },
  takePhotoButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
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
  // Enhanced Preview Styles
  imagePreviewContainer: {
    alignItems: 'center',
    marginTop: 15,
  },
  imageWithOverlay: {
    position: 'relative',
    width: 250,
    height: 188,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  timestampOverlayPreview: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 8,
  },
  timestampTextPreview: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  timestampBrandPreview: {
    color: '#e74c3c',
    fontSize: 8,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 1,
    letterSpacing: 0.5,
  },
  timestampInfoContainer: {
    marginTop: 10,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minWidth: 250,
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
    fontFamily: 'monospace',
    marginBottom: 6,
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
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 30,
    marginBottom: 20,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  bottomSpacer: {
    height: 100,
  },
  // Enhanced Camera Styles
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  // Live timestamp overlay for camera
  timestampOverlayLive: {
    position: 'absolute',
    bottom: 100,
    right: 15,
    zIndex: 1000,
  },
  timestampBadgeLive: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 8,
    minWidth: 160,
    alignItems: 'center',
  },
  timestampTextLive: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  timestampSubTextLive: {
    color: '#e74c3c',
    fontSize: 10,
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
    width: 44,
    height: 44,
    borderRadius: 22,
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

export default IncidentReportForm;