// services/reports.ts - FIXED: ServerTimestamp in Array Issue
import { User } from "firebase/auth";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { Platform } from "react-native";

import {
  getMetadata,
  getStorage,
  ref,
  updateMetadata
} from "firebase/storage";
import { auth, db } from "./firebase";
import { notificationService } from "./notifications";

// Platform-specific Google Maps API keys
const GOOGLE_MAPS_API_KEY = Platform.OS === 'android' 
  ? 'AIzaSyDHNKCfdb_Ae0sMaSmdDf88xjOvj2hJM68'  // Android key
  : 'AIzaSyB2MdahsHMIyhDjBTTVwgAm1i-zVx4OD5U'; // iOS key

export type ReportStatus = 
  | 'pending'         // Initial status when user submits
  | 'accepted'        // Admin/Monitor has accepted the report
  | 'verified'        // Report has been verified
  | 'approved'        // Report has been approved
  | 'rejected'        // Report has been rejected
  | 'failed'          // Report failed validation
  | 'resolved';       // Incident has been resolved

export interface IncidentReport {
  id?: string;
  reporterId: string;
  reporterEmail?: string;

  // Core incident data
  type: string;
  emergencyType: string;
  description: string;
  photos: string[];
  timestamp: any;
  
  // Location data
  lat: number;
  lng: number;
  formatted_address: string;
  barangay: string;
  city?: string;
  province?: string;
  region?: string;
  country?: string;
  postal_code?: string;
  confidence: number;
  source: string;
  
  status: ReportStatus;
  createdAt: any;
  updatedAt: any;
  
  // Optional fields
  subCategory?: string;
  name?: string;
  assignedRescuer?: string | null;
  photoTakenAt?: string;
  adminNote?: string;
  
  // Legacy compatibility fields
  category?: string;
  location?: { lat: number; lng: number };
  photoUrl?: string | null;
  addressLine?: string;
  fullAddress?: string;
  establishment?: string;
  
  // Assignment details
  assignedRescuerName?: string;
  assignedRescuerEmail?: string;
  assignedAt?: any;
  assignedBy?: string;
  
  // Resolution details
  resolvedAt?: any;
  resolvedBy?: string;
  resolutionNote?: string;
  
  // FIXED: Audit trail without serverTimestamp in arrays
  auditTrail?: Array<{
    action: string;
    handledBy: string;
    handledAt: string; // Changed to string instead of serverTimestamp
    reason?: string;
    assignedTo?: string;
    previousStatus?: string;
    newStatus?: string;
  }>;
}

// Address components interface for geocoding results
interface AddressComponents {
  street?: string;
  barangay: string;
  city: string;
  province: string;
  region: string;
  country: string;
  postal_code?: string;
  formatted_address: string;
  confidence: number;
}

// Validate coordinates are within Lipa City bounds
const isWithinLipaCityBounds = (latitude: number, longitude: number): boolean => {
  return latitude >= 13.85 && latitude <= 14.05 && 
         longitude >= 121.10 && longitude <= 121.25;
};

// Enhanced geocoding with multiple strategies for better barangay detection
export const getAddressFromCoordinates = async (latitude: number, longitude: number): Promise<AddressComponents | null> => {
  try {
    console.log(`Getting address for coordinates: ${latitude}, ${longitude}`);
    
    // Strategy 1: Try Places API Nearby Search first for better local results
    let addressResult = await tryPlacesNearbySearch(latitude, longitude);
    if (addressResult) {
      console.log('✅ Places API successful:', addressResult);
      return addressResult;
    }

    // Strategy 2: Enhanced Geocoding API with multiple languages
    addressResult = await tryEnhancedGeocoding(latitude, longitude);
    if (addressResult) {
      console.log('✅ Enhanced Geocoding successful:', addressResult);
      return addressResult;
    }

    // Strategy 3: Fallback with coordinate-based barangay detection
    console.log('⚠️ All API methods failed, using coordinate fallback');
    return getCoordinateBasedAddress(latitude, longitude);

  } catch (error) {
    console.error('Complete geocoding failure:', error);
    return getCoordinateBasedAddress(latitude, longitude);
  }
};

// Strategy 1: Places API Nearby Search
const tryPlacesNearbySearch = async (latitude: number, longitude: number): Promise<AddressComponents | null> => {
  try {
    const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=100&key=${GOOGLE_MAPS_API_KEY}`;
    
    const response = await fetch(placesUrl);
    const data = await response.json();
    
    if (data.status === 'OK' && data.results?.length > 0) {
      const nearbyPlace = data.results[0];
      
      // Get place details for more accurate address
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${nearbyPlace.place_id}&fields=address_components,formatted_address,name&key=${GOOGLE_MAPS_API_KEY}`;
      
      const detailsResponse = await fetch(detailsUrl);
      const detailsData = await detailsResponse.json();
      
      if (detailsData.status === 'OK' && detailsData.result) {
        const place = detailsData.result;
        const components = extractAddressComponents(place.address_components);
        
        if (components.barangay && components.barangay !== 'Unknown Barangay') {
          return {
            ...components,
            formatted_address: place.formatted_address || `${components.barangay}, Lipa City, Batangas`,
            confidence: 95
          };
        }
      }
    }
    
    return null;
  } catch (error) {
    console.log('Places API failed:', error);
    return null;
  }
};

// Strategy 2: Enhanced Geocoding with multiple languages
const tryEnhancedGeocoding = async (latitude: number, longitude: number): Promise<AddressComponents | null> => {
  const languages = ['en', 'tl']; // English and Filipino
  const resultTypes = [
    'street_address|route|sublocality|political',
    'administrative_area_level_3|administrative_area_level_4|sublocality_level_1|sublocality_level_2'
  ];

  for (const language of languages) {
    for (const resultType of resultTypes) {
      try {
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}&language=${language}&region=PH&result_type=${resultType}`;
        
        const response = await fetch(geocodeUrl);
        const data = await response.json();
        
        if (data.status === 'OK' && data.results?.length > 0) {
          for (const result of data.results) {
            const components = extractAddressComponents(result.address_components);
            
            if (components.barangay && components.barangay !== 'Unknown Barangay') {
              return {
                ...components,
                formatted_address: result.formatted_address,
                confidence: 90
              };
            }
          }
        }
      } catch (error) {
        console.log(`Geocoding failed for ${language} with ${resultType}:`, error);
      }
    }
  }

  return null;
};

// Enhanced address component extraction
const extractAddressComponents = (components: any[]) => {
  if (!components || !Array.isArray(components)) {
    return {
      street: '',
      barangay: 'Unknown Barangay',
      city: 'Lipa City',
      province: 'Batangas',
      region: 'Calabarzon',
      country: 'Philippines',
      postal_code: ''
    };
  }

  let street = '';
  let streetNumber = '';
  let route = '';
  let barangay = '';
  let city = '';
  let province = '';
  let region = '';
  let country = '';
  let postal_code = '';

  // Multiple strategies to find barangay
  const barangayStrategies = [
    'sublocality_level_1',
    'sublocality_level_2', 
    'sublocality',
    'neighborhood',
    'administrative_area_level_3',
    'administrative_area_level_4',
    'political'
  ];

  components.forEach((component: any) => {
    const types = component.types;
    const longName = component.long_name;
    
    if (types.includes('street_number')) {
      streetNumber = longName;
    } else if (types.includes('route')) {
      route = longName;
    } else if (types.includes('locality')) {
      city = longName;
    } else if (types.includes('administrative_area_level_2') && !city) {
      city = longName;
    } else if (types.includes('administrative_area_level_1')) {
      if (longName.toLowerCase().includes('batangas')) {
        province = longName;
      } else {
        region = longName;
      }
    } else if (types.includes('country')) {
      country = longName;
    } else if (types.includes('postal_code')) {
      postal_code = longName;
    }
  });

  // Find barangay using multiple strategies
  for (const strategy of barangayStrategies) {
    const component = components.find(comp => 
      comp.types && comp.types.includes(strategy)
    );
    
    if (component && component.long_name) {
      const name = component.long_name;
      
      // Filter out obvious non-barangay names
      if (!name.toLowerCase().includes('lipa') && 
          !name.toLowerCase().includes('batangas') &&
          !name.toLowerCase().includes('philippines') &&
          !name.toLowerCase().includes('luzon') &&
          name.length > 2) {
        
        // Clean the barangay name
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
          barangay = cleanName;
          break;
        }
      }
    }
  }

  // Combine street components
  if (streetNumber && route) {
    street = `${streetNumber} ${route}`;
  } else if (route) {
    street = route;
  }

  return {
    street: street || undefined,
    barangay: barangay || 'Unknown Barangay',
    city: city || 'Lipa City',
    province: province || 'Batangas',
    region: region || 'Calabarzon',
    country: country || 'Philippines',
    postal_code: postal_code || undefined
  };
};

// Strategy 3: Coordinate-based fallback with improved barangay mapping
const getCoordinateBasedAddress = (latitude: number, longitude: number): AddressComponents => {
  const barangay = determineFallbackBarangay(latitude, longitude);
  
  return {
    barangay,
    city: 'Lipa City',
    province: 'Batangas',
    region: 'Calabarzon',
    country: 'Philippines',
    formatted_address: `${barangay}, Lipa City, Batangas, Philippines`,
    confidence: 70
  };
};

// Enhanced fallback barangay determination with more precise boundaries
const determineFallbackBarangay = (lat: number, lng: number): string => {
  console.log(`Determining fallback barangay for: ${lat}, ${lng}`);
  
  // Major commercial and residential areas (more precise boundaries)
  
  // Pinagkawitan area (major commercial district)
  if (lat >= 13.925 && lat <= 13.945 && lng >= 121.165 && lng <= 121.185) {
    return "Pinagkawitan";
  }
  
  // City Center Poblacion areas
  if (lat >= 13.940 && lat <= 13.943 && lng >= 121.160 && lng <= 121.165) {
    return "Barangay 1";
  }
  if (lat >= 13.938 && lat <= 13.942 && lng >= 121.158 && lng <= 121.163) {
    return "Barangay 2";
  }
  if (lat >= 13.935 && lat <= 13.940 && lng >= 121.158 && lng <= 121.168) {
    return "Barangay 3";
  }
  if (lat >= 13.933 && lat <= 13.938 && lng >= 121.156 && lng <= 121.166) {
    return "Barangay 4";
  }
  
  // Northern barangays
  if (lat >= 13.950 && lat <= 13.975 && lng >= 121.150 && lng <= 121.170) {
    return "Antipolo del Norte";
  }
  if (lat >= 13.920 && lat <= 13.950 && lng >= 121.145 && lng <= 121.165) {
    return "Antipolo del Sur";
  }
  
  // Eastern areas
  if (lng >= 121.185) {
    if (lat >= 13.905 && lat <= 13.925) {
      return "Sico";
    }
    if (lat >= 13.925 && lat <= 13.940) {
      return "Sabang";
    }
    if (lat >= 13.940 && lat <= 13.955) {
      return "Bagong Pook";
    }
    return "Sabang";
  }
  
  // Western areas
  if (lng <= 121.155) {
    if (lat >= 13.930 && lat <= 13.960) {
      return "Malvar";
    }
    if (lat >= 13.910 && lat <= 13.940) {
      return "Mabini";
    }
    if (lat >= 13.890 && lat <= 13.920) {
      return "San Carlos";
    }
  }
  
  // Southern areas
  if (lat <= 13.920) {
    if (lng >= 121.150 && lng <= 121.175) {
      return "Tambo";
    }
    if (lng >= 121.155 && lng <= 121.180) {
      return "Tibig";
    }
    if (lng >= 121.140 && lng <= 121.160) {
      return "San Carlos";
    }
    return "San Carlos";
  }
  
  // Central areas not covered above
  if (lat >= 13.920 && lat <= 13.950 && lng >= 121.155 && lng <= 121.175) {
    return "Marawoy";
  }
  
  // Default fallback to city center
  return "Barangay 1";
};

// FIXED: Main submit function with proper audit trail handling
export const submitIncidentReport = async ({
  emergencyType,
  category,
  description,
  location,
  photoUrl = null,
  // Optional fields
  name,
  subCategory,
  notes
}: {
  emergencyType: string;
  category?: string;
  description?: string;
  location: { lat: number; lng: number };
  photoUrl?: string | null;
  name?: string;
  subCategory?: string;
  notes?: string;
}) => {
  try {
    const user: User | null = auth.currentUser;
    if (!user) throw new Error("You must be logged in to submit a report.");

    console.log('Submitting report for user:', user.uid);

    const latitude = location.lat;
    const longitude = location.lng;
    
    if (!latitude || !longitude) {
      throw new Error("Location coordinates are required");
    }

    // Validate coordinates are within Lipa City bounds
    if (!isWithinLipaCityBounds(latitude, longitude)) {
      throw new Error("Reports can only be submitted within Lipa City limits");
    }

    // Get address from coordinates using enhanced geocoding
    const addressData = await getAddressFromCoordinates(latitude, longitude);
    
    if (!addressData) {
      throw new Error("Could not determine address from location. Please try again.");
    }

    // Validate required fields
    const finalEmergencyType = emergencyType || category;
    const finalDescription = description || notes || '';
    
    if (!finalEmergencyType) {
      throw new Error("Emergency type is required");
    }
    if (!finalDescription.trim()) {
      throw new Error("Description cannot be empty");
    }

    // Ensure user document exists
    try {
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        console.log("Creating user document for report submission...");
        await setDoc(userDocRef, {
          email: user.email,
          displayName: user.displayName || name || "User",
          name: name || user.displayName || "User",
          role: 'resident',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          notificationsEnabled: true,
          status: 'active'
        });
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (userError) {
      console.error("Error ensuring user document:", userError);
      throw new Error("Failed to validate user account. Please try again.");
    }

    // FIXED: Create report data with proper audit trail (no serverTimestamp in arrays)
    const currentTime = new Date().toISOString();
    
    const reportData = {
      // Required fields matching the specified format
      reporterId: user.uid,
      type: finalEmergencyType,
      emergencyType: finalEmergencyType,
      description: finalDescription,
      photos: photoUrl ? [photoUrl] : [],
      timestamp: serverTimestamp(),
      lat: latitude,
      lng: longitude,
      formatted_address: addressData.formatted_address,
      barangay: addressData.barangay,
      city: addressData.city || 'Lipa',
      province: addressData.province || 'Batangas',
      region: addressData.region || 'Calabarzon',
      country: addressData.country || 'Philippines',
      postal_code: addressData.postal_code || '',
      confidence: addressData.confidence,
      source: 'Enhanced Google Geocoding API',
      status: "pending" as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      
      // Optional fields
      reporterEmail: user.email,
      assignedRescuer: null,
      ...(name && { name }),
      ...(subCategory && { subCategory }),
      
      // Legacy compatibility fields
      category: finalEmergencyType,
      location: { lat: latitude, lng: longitude },
      photoUrl,
      
      // FIXED: Enhanced audit trail using ISO strings instead of serverTimestamp
      auditTrail: [{
        action: 'submitted',
        handledBy: user.email || user.uid,
        handledAt: currentTime, // Using ISO string instead of serverTimestamp()
        newStatus: 'pending'
      }]
    };

    console.log('Report data to submit:', reportData);

    // Submit to Firestore
    let docRef;
    try {
      docRef = await addDoc(collection(db, "incident_reports"), reportData);
      console.log('Report created successfully:', docRef.id);
    } catch (firestoreError: any) {
      console.error("Firestore creation failed:", firestoreError);
      
      if (firestoreError.code === 'permission-denied') {
        throw new Error("Permission denied. Please ensure you're logged in properly and try again.");
      } else if (firestoreError.code === 'failed-precondition') {
        throw new Error("Data validation failed. Please check all required fields and try again.");
      } else if (firestoreError.code === 'invalid-argument') {
        throw new Error("Invalid data provided. Please check your location and other details.");
      } else {
        throw new Error(`Database error: ${firestoreError.message}`);
      }
    }

    // Create notification
    try {
      const locationString = `${addressData.barangay}, ${addressData.city}`;
        
      if (notificationService.createReportSubmittedNotification) {
        await notificationService.createReportSubmittedNotification(
          user.uid,
          docRef.id,
          locationString,
          finalEmergencyType
        );
      }
    } catch (notificationError) {
      console.warn("Failed to create notification:", notificationError);
    }

    console.log('Report submitted successfully:', {
      reportId: docRef.id,
      barangay: addressData.barangay,
      confidence: addressData.confidence
    });

    return { 
      success: true, 
      id: docRef.id,
      locationData: {
        barangay: addressData.barangay,
        confidence: addressData.confidence,
        method: 'enhanced_google_geocoding_api'
      }
    };
  } catch (error) {
    console.error("Error submitting incident report:", error);
    
    if (error && typeof error === 'object' && 'code' in error) {
      console.error("Firebase error code:", (error as any).code);
      console.error("Firebase error message:", (error as any).message);
    }
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

// FIXED: Update report status function with proper audit trail handling
export const updateReportStatus = async (
  reportId: string, 
  newStatus: ReportStatus,
  adminNote?: string,
  assignedRescuer?: string,
  assignedRescuerName?: string
): Promise<{ success: boolean; error?: any }> => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("Must be authenticated");
    }

    const reportDoc = await getDoc(doc(db, "incident_reports", reportId));
    if (!reportDoc.exists()) {
      throw new Error("Report not found");
    }

    const currentReport = reportDoc.data() as IncidentReport;
    const previousStatus = currentReport.status;
    const currentTime = new Date().toISOString();

    const updateData: any = {
      status: newStatus,
      updatedAt: serverTimestamp(),
      // FIXED: Use arrayUnion with ISO string instead of serverTimestamp
      auditTrail: arrayUnion({
        action: newStatus,
        handledBy: user.email || user.uid,
        handledAt: currentTime, // Using ISO string instead of serverTimestamp()
        previousStatus: previousStatus,
        newStatus: newStatus,
        ...(adminNote && { reason: adminNote }),
        ...(assignedRescuer && { assignedTo: assignedRescuerName || assignedRescuer })
      })
    };

    if (adminNote) {
      updateData.adminNote = adminNote;
    }

    if (assignedRescuer) {
      updateData.assignedRescuer = assignedRescuer;
      updateData.assignedRescuerName = assignedRescuerName || assignedRescuer;
      updateData.assignedAt = serverTimestamp();
      updateData.assignedBy = user.uid;
    }

    if (newStatus === 'resolved') {
      updateData.resolvedAt = serverTimestamp();
      updateData.resolvedBy = user.uid;
      if (adminNote) {
        updateData.resolutionNote = adminNote;
      }
    }

    await updateDoc(doc(db, "incident_reports", reportId), updateData);

    return { success: true };
  } catch (error) {
    console.error("Error updating report status:", error);
    return { success: false, error };
  }
};

// Rest of the functions remain the same...
export const getReportById = async (reportId: string): Promise<IncidentReport | null> => {
  try {
    const docSnap = await getDoc(doc(db, "incident_reports", reportId));
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data
      } as IncidentReport;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error getting report:", error);
    return null;
  }
};

export const getUserReports = (userId: string, callback: (reports: IncidentReport[]) => void) => {
  const q = query(
    collection(db, "incident_reports"),
    where("reporterId", "==", userId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const reports: IncidentReport[] = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data
      };
    }) as IncidentReport[];
    
    callback(reports);
  });
};

export const listenToReport = (reportId: string, callback: (report: IncidentReport | null) => void) => {
  return onSnapshot(doc(db, "incident_reports", reportId), (doc) => {
    if (doc.exists()) {
      const data = doc.data();
      callback({
        id: doc.id,
        ...data
      } as IncidentReport);
    } else {
      callback(null);
    }
  });
};

export const formatLocation = (report: IncidentReport) => {
  if (report.formatted_address) {
    return report.formatted_address;
  }
  
  const barangayDisplay = report.barangay || 'Unknown area';
  
  return `${barangayDisplay}, ${report.lat.toFixed(4)}°N, ${report.lng.toFixed(4)}°E`;
};

export const formatReportTime = (timestamp: any) => {
  if (!timestamp) return 'Unknown';
  
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  const timeString = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  if (isToday) {
    return `Today, ${timeString}`;
  } else {
    return `${date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    })}, ${timeString}`;
  }
};

export const getStatusDisplayText = (status: ReportStatus) => {
  switch (status) {
    case 'pending':
      return 'Pending Review';
    case 'accepted':
      return 'Accepted';
    case 'verified':
      return 'Verified';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'failed':
      return 'Failed';
    case 'resolved':
      return 'Resolved';
    default:
      return `Unknown Status (${status})`;
  }
};

export const getStatusColor = (status: ReportStatus) => {
  switch (status) {
    case 'pending':
      return '#f59e0b';
    case 'accepted':
      return '#10b981';
    case 'verified':
      return '#059669';
    case 'approved':
      return '#047857';
    case 'rejected':
      return '#f97316';
    case 'failed':
      return '#dc2626';
    case 'resolved':
      return '#22c55e';
    default:
      return '#6b7280';
  }
};

export const checkPhotoTimestamp = async (photoURL: string): Promise<{
  hasTimestamp: boolean;
  timestampText?: string;
  needsProcessing: boolean;
  photoTakenAt?: string;
}> => {
  try {
    const storage = getStorage();
    let photoPath = photoURL;
    if (photoURL.includes('firebasestorage.googleapis.com')) {
      const urlParts = photoURL.split('/');
      const encodedPath = urlParts[urlParts.length - 1].split('?')[0];
      photoPath = decodeURIComponent(encodedPath);
    }
    
    const photoRef = ref(storage, photoPath);
    const metadata = await getMetadata(photoRef);
    
    return {
      hasTimestamp: metadata.customMetadata?.hasTimestamp === 'true',
      timestampText: metadata.customMetadata?.timestampText,
      needsProcessing: metadata.customMetadata?.embedTimestamp === 'true' && 
                      metadata.customMetadata?.processed !== 'true',
      photoTakenAt: metadata.customMetadata?.photoTakenAt
    };
  } catch (error) {
    console.error('Error checking photo timestamp:', error);
    return { hasTimestamp: false, needsProcessing: false };
  }
};

export const markPhotoAsProcessed = async (photoURL: string): Promise<boolean> => {
  try {
    const storage = getStorage();
    let photoPath = photoURL;
    if (photoURL.includes('firebasestorage.googleapis.com')) {
      const urlParts = photoURL.split('/');
      const encodedPath = urlParts[urlParts.length - 1].split('?')[0];
      photoPath = decodeURIComponent(encodedPath);
    }
    
    const photoRef = ref(storage, photoPath);
    const currentMetadata = await getMetadata(photoRef);
    
    await updateMetadata(photoRef, {
      customMetadata: {
        ...currentMetadata.customMetadata,
        processed: 'true',
        processedAt: new Date().toISOString()
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error marking photo as processed:', error);
    return false;
  }
};