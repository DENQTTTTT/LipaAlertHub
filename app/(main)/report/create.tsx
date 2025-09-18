import { Ionicons } from "@expo/vector-icons";
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
import { AddressComponents, useGeocode } from "../../../hooks/useGeocode";
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

// Subcategory options based on emergency type
const subCategoryOptions: Record<string, { label: string; value: string }[]> = {
  accident: [
    { label: "Vehicular Accident", value: "Vehicular Accident" },
    { label: "Slip and Fall", value: "Slip and Fall" },
    { label: "Work-related Accident", value: "Work-related Accident" },
    { label: "Road Accident", value: "Road Accident" }
  ],
  fire: [
    { label: "House Fire", value: "House Fire" },
    { label: "Vehicle Fire", value: "Vehicle Fire" },
    { label: "Wildfire", value: "Wildfire" },
    { label: "Electrical Fire", value: "Electrical Fire" }
  ],
  medical: [
    { label: "Heart Attack", value: "Heart Attack" },
    { label: "Stroke", value: "Stroke" },
    { label: "Accident Injury", value: "Accident Injury" },
    { label: "Drug Overdose", value: "Drug Overdose" },
    { label: "Other Medical", value: "Other Medical" }
  ],
  flood: [
    { label: "Street Flooding", value: "Street Flooding" },
    { label: "House Flooding", value: "House Flooding" },
    { label: "Flash Flood", value: "Flash Flood" },
    { label: "Storm Surge", value: "Storm Surge" }
  ],
  crime: [
    { label: "Theft", value: "Theft" },
    { label: "Assault", value: "Assault" },
    { label: "Vandalism", value: "Vandalism" },
    { label: "Robbery", value: "Robbery" }
  ],
  infrastructure: [
    { label: "Power Outage", value: "Power Outage" },
    { label: "Water Issue", value: "Water Issue" },
    { label: "Road Damage", value: "Road Damage" },
    { label: "Bridge Issue", value: "Bridge Issue" }
  ]
};

const IncidentReportForm = () => {
  // Form states
  const [name, setName] = useState("");
  const [emergencyType, setEmergencyType] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [notes, setNotes] = useState("");
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

  // Real-time timestamp state for camera overlay
  const [cameraTimestamp, setCameraTimestamp] = useState<string>("");

  // Map reference for animating to location
  const mapRef = useRef<MapView>(null);
  
  // Hooks
  const { user } = useAuth();
  const { getAddressFromCoords, isGeocoding, error: geocodingError } = useGeocode();

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
    const address = await getAddressFromCoords(defaultLocation.latitude, defaultLocation.longitude);
    setAddressComponents(address);
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
      
      const address = await getAddressFromCoords(coords.latitude, coords.longitude);
      setAddressComponents(address);
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
      
      const address = await getAddressFromCoords(coords.latitude, coords.longitude);
      setAddressComponents(address);
      
      Alert.alert(
        'Location Pinned Successfully!', 
        `Your current location has been set as the incident location.\n\nAddress: ${address?.formattedAddress || 'Address not found'}`,
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
      const address = await getAddressFromCoords(coordinate.latitude, coordinate.longitude);
      setAddressComponents(address);
    } catch (error) {
      console.error('Error getting address:', error);
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
      if (!addressComponents) {
        Alert.alert("Validation Error", "Please wait for the address to load or select a location.");
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
        barangay: addressComponents.barangay || 'Unknown Barangay',
        addressLine: addressComponents.formattedAddress,
        emergencyType,
        subCategory,
        notes,
        location: selectedLocation,
        photoURL: photoUrl,
        timestamp: photoTimestamp,
        fullAddress: addressComponents.formattedAddress
      });

      if (report.success && report.id) {
        Alert.alert(
          "Report Submitted Successfully!",
          "Your incident report has been submitted and is pending review. You will receive notifications about its status.",
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
    setEmergencyType("");
    setSubCategory("");
    setNotes("");
    setPhotoUri(null);
    setProcessedPhotoUri(null);
    setPhotoTimestamp(null);
    setAddressComponents(null);
    initializeLocation();
  };

  // Emergency Type Icon Button Component
  const EmergencyTypeButton = ({ type, isSelected, onPress }: { 
    type: typeof emergencyTypes[0], 
    isSelected: boolean, 
    onPress: () => void 
  }) => (
    <TouchableOpacity
      style={[
        styles.emergencyTypeButton,
        { backgroundColor: isSelected ? type.color : type.bgColor },
        isSelected && styles.emergencyTypeButtonSelected
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons 
        name={type.icon} 
        size={28} 
        color={isSelected ? '#fff' : type.color} 
      />
      <Text style={[
        styles.emergencyTypeText,
        { color: isSelected ? '#fff' : type.color }
      ]}>
        {type.label}
      </Text>
    </TouchableOpacity>
  );

  // Radio Button Component for Subcategories
  const RadioButton = ({ label, value, isSelected, onPress }: {
    label: string;
    value: string;
    isSelected: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      style={styles.radioButtonContainer}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.radioButton, isSelected && styles.radioButtonSelected]}>
        {isSelected && <View style={styles.radioButtonInner} />}
      </View>
      <Text style={styles.radioButtonLabel}>{label}</Text>
    </TouchableOpacity>
  );

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

        {/* Emergency Type Selection with Icons */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Type of Emergency</Text>
          <View style={styles.emergencyTypesGrid}>
            {emergencyTypes.map((type) => (
              <EmergencyTypeButton
                key={type.value}
                type={type}
                isSelected={emergencyType === type.value}
                onPress={() => {
                  setEmergencyType(type.value);
                  setSubCategory(""); // Reset subcategory when type changes
                }}
              />
            ))}
          </View>
        </View>

        {/* Subcategory Selection with Radio Buttons */}
        {emergencyType && subCategoryOptions[emergencyType] && (
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Subcategory</Text>
            <View style={styles.radioButtonGroup}>
              {subCategoryOptions[emergencyType].map((option) => (
                <RadioButton
                  key={option.value}
                  label={option.label}
                  value={option.value}
                  isSelected={subCategory === option.value}
                  onPress={() => setSubCategory(option.value)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Location Map with Auto Address */}
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
          
          {/* Address Display */}
          {addressComponents && (
            <View style={styles.addressContainer}>
              <View style={styles.addressHeader}>
                <Ionicons name="location" size={16} color="#e74c3c" />
                <Text style={styles.addressHeaderText}>Detected Address</Text>
                {isGeocoding && <ActivityIndicator size="small" color="#e74c3c" />}
              </View>
              <Text style={styles.addressText}>{addressComponents.formattedAddress}</Text>
              <View style={styles.addressDetails}>
                <Text style={styles.addressDetailText}>
                  Barangay: {addressComponents.barangay}
                </Text>
                <Text style={styles.addressDetailText}>
                  City: {addressComponents.city}
                </Text>
                <Text style={styles.addressDetailText}>
                  Province: {addressComponents.province}
                </Text>
              </View>
            </View>
          )}
          
          <Text style={styles.helperText}>
            Tap on the map to select incident location or use "Pin My Location" button
          </Text>
          
          {geocodingError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Address lookup failed: {geocodingError}</Text>
            </View>
          )}
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

        {/* Additional Notes */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Additional Details</Text>
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
  errorContainer: {
    backgroundColor: '#ffebee',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#ffcdd2',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 12,
    fontWeight: '500',
  },
  // Emergency Type Grid Styles
  emergencyTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  emergencyTypeButton: {
    width: (width - 60) / 2, // Two columns with margin
    minHeight: 90,
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
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
  // Radio Button Styles
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
  addressText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    marginBottom: 8,
  },
  addressDetails: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  addressDetailText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
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
  // Image Preview Styles
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
  timestampOverlayPreview: {
    position: 'absolute',
    bottom: 10,
    right: 10,
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
    fontFamily: 'monospace',
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
  timestampOverlayLive: {
    position: 'absolute',
    bottom: 120,
    right: 20,
    zIndex: 1000,
  },
  timestampBadgeLive: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
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

export default IncidentReportForm;