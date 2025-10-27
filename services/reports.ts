// services/reports.ts - COMPLETE UPDATED VERSION READY FOR DEPLOYMENT
import { User } from "firebase/auth";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where
} from "firebase/firestore";
import {
  getMetadata,
  getStorage,
  ref,
  updateMetadata
} from "firebase/storage";
import { Platform } from "react-native";
import { auth, db } from "./firebase";
import { notificationService } from "./notifications";

const GOOGLE_MAPS_API_KEY = Platform.OS === 'android' 
  ? 'AIzaSyDHNKCfdb_Ae0sMaSmdDf88xjOvj2hJM68'
  : 'AIzaSyB2MdahsHMIyhDjBTTVwgAm1i-zVx4OD5U';

export type ReportStatus = 
  | "pending" 
  | "accepted" 
  | "verified" 
  | "rejected" 
  | "failed" 
  | "resolved" 
  | "in_progress" 
  | "assigned" 
  | "cancelled";

export interface IncidentReport {
  id?: string;
  reporterId: string;
  reporterEmail?: string;
  type: string;
  emergencyType: string;
  description: string;
  photos: string[];
  timestamp: any;
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
  subCategory?: string;
  name?: string;
  assignedRescuer?: string | null;
  photoTakenAt?: string;
  adminNote?: string;
  category?: string;
  location?: { latitude: number; longitude: number } | { lat: number; lng: number };
  photoUrl?: string | null;
  addressLine?: string;
  fullAddress?: string;
  establishment?: string;
  assignedRescuerName?: string;
  assignedRescuerEmail?: string;
  assignedAt?: any;
  assignedBy?: string;
  resolvedAt?: any;
  resolvedBy?: string;
  resolutionNote?: string;
  auditTrail?: Array<{
    action: string;
    handledBy: string;
    handledAt: string;
    reason?: string;
    assignedTo?: string;
    previousStatus?: string;
    newStatus?: string;
  }>;
  
  // UNIFIED SCHEMA FIELDS
  userId?: string;
  reporterName?: string;
  address?: string;
  images: string[];
  hasPatientForm?: boolean;
  assignedAgency?: string | null;
  assignedRescuers?: string[];
  lastUpdated?: any;
  
  // ADDITIONAL NOTES FIELD
  additionalNotes?: string;
}

// ============ DUPLICATE DETECTION FUNCTIONS ============

// ✅ HELPER FUNCTION: Calculate distance between two coordinates
function calculateDistance(
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number {
  const R = 6371; // Earth radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in kilometers
  
  return distance;
}

// ✅ HELPER: Extract coordinates from any location format
const extractCoordinates = (location: { latitude: number; longitude: number } | { lat: number; lng: number }) => {
  if ('latitude' in location) {
    return { latitude: location.latitude, longitude: location.longitude };
  } else {
    return { latitude: location.lat, longitude: location.lng };
  }
};

// ✅ HELPER: Extract coordinates from report
const extractReportCoordinates = (report: IncidentReport) => {
  if (report.location) {
    if ('latitude' in report.location) {
      return { latitude: report.location.latitude, longitude: report.location.longitude };
    } else {
      return { latitude: report.location.lat, longitude: report.location.lng };
    }
  } else {
    return { latitude: report.lat, longitude: report.lng };
  }
};

// ✅ FIXED: Updated duplicate check to allow different emergency types and categories
export const checkDuplicateReport = async (
  userId: string,
  emergencyType: string,
  subCategory: string,
  location: { latitude: number; longitude: number } | { lat: number; lng: number },
  barangay: string,
  establishment?: string
): Promise<{
  isDuplicate: boolean;
  duplicateReport?: IncidentReport;
  timeSinceReport?: number; // minutes
  message?: string;
}> => {
  try {
    console.log("🔍 [CLIENT] Starting duplicate check...");
    
    // ✅ FIX: Extract coordinates safely
    const { latitude, longitude } = extractCoordinates(location);
    
    console.log("🔍 [CLIENT] Duplicate Check Criteria:", {
      userId,
      emergencyType,
      subCategory,
      barangay,
      establishment: establishment || "none",
      latitude: latitude.toFixed(6),
      longitude: longitude.toFixed(6)
    });

    // ✅ TIME WINDOW: 30 minutes to 2 hours ago
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);

    // ✅ FIXED: Only check reports from the same user within time window
    // ✅ REMOVED: emergencyType, subCategory, and barangay filters
    const duplicateQuery = query(
      collection(db, "incident_reports"),
      where("userId", "==", userId),
      where("createdAt", ">", Timestamp.fromDate(thirtyMinAgo)), // ✅ Within 30min-2hrs
      where("status", "in", ["pending", "accepted", "verified"]), // ✅ Active reports only
      orderBy("createdAt", "desc"),
      limit(10) // ✅ Increased limit to check more reports
    );

    const snapshot = await getDocs(duplicateQuery);

    if (snapshot.empty) {
      console.log("✅ [CLIENT] No potential duplicates found");
      return { isDuplicate: false };
    }

    console.log(`📋 [CLIENT] Found ${snapshot.size} potential duplicate(s) to check`);

    // ✅ CHECK EACH RESULT FOR EXACT MATCH
    for (const doc of snapshot.docs) {
      const report = { id: doc.id, ...doc.data() } as IncidentReport;
      
      console.log(`🔍 [CLIENT] Checking report ${doc.id}:`, {
        emergency: report.emergencyType,
        subCategory: report.subCategory,
        barangay: report.barangay,
        establishment: report.establishment || "none",
        status: report.status,
        createdAt: report.createdAt?.toDate().toISOString()
      });

      // ✅ SMART LOCATION MATCHING
      let isLocationMatch = false;

      if (establishment && report.establishment) {
        // ✅ OPTION 1: If both have establishment, must match exactly
        isLocationMatch = (
          establishment.toLowerCase().trim() === 
          report.establishment.toLowerCase().trim()
        );
        console.log(`📍 [CLIENT] Establishment match check: ${isLocationMatch} (${establishment} vs ${report.establishment})`);
        
      } else {
        // ✅ OPTION 2: No establishment - check 50-meter radius
        const reportCoords = extractReportCoordinates(report);
        const reportLat = reportCoords.latitude;
        const reportLng = reportCoords.longitude;

        if (!reportLat || !reportLng) {
          console.log("⚠️ [CLIENT] Report missing coordinates - cannot check distance");
          continue;
        }

        const distance = calculateDistance(
          latitude,
          longitude,
          reportLat,
          reportLng
        );

        console.log(`📏 [CLIENT] Distance: ${distance.toFixed(3)}km (${(distance * 1000).toFixed(0)}m)`);

        // ✅ 50-METER RADIUS CHECK (0.05 km)
        isLocationMatch = distance <= 0.05;
        console.log(`📍 [CLIENT] 50m radius check: ${isLocationMatch}`);
      }

      // ✅ FIXED: Only consider it a duplicate if it's the SAME emergency type AND subcategory
      const isSameEmergencyType = report.emergencyType === emergencyType;
      const isSameSubCategory = report.subCategory === subCategory;
      
      if (isLocationMatch && isSameEmergencyType && isSameSubCategory) {
        // ✅ DUPLICATE FOUND! (Same location + same emergency type + same subcategory)
        const reportTime = report.createdAt?.toDate() || new Date(0);
        const timeDiff = Math.floor((now.getTime() - reportTime.getTime()) / (1000 * 60));

        console.log("🚨 [CLIENT] DUPLICATE FOUND!");
        console.log(`📋 [CLIENT] Duplicate Details - Report ID: ${doc.id}, Time difference: ${timeDiff} minutes, Status: ${report.status}`);

        return {
          isDuplicate: true,
          duplicateReport: report,
          timeSinceReport: timeDiff,
          message: `Duplicate found: ${report.emergencyType} - ${report.subCategory} in ${report.barangay}`
        };
      } else if (isLocationMatch) {
        // ✅ NOT A DUPLICATE - Different emergency type or subcategory
        console.log("✅ [CLIENT] Different emergency type/subcategory - NOT a duplicate");
        console.log(`📋 [CLIENT] Current: ${emergencyType} - ${subCategory}, Existing: ${report.emergencyType} - ${report.subCategory}`);
      }
    }

    console.log("✅ [CLIENT] No exact duplicates found after location check");
    return { isDuplicate: false };

  } catch (error) {
    console.error("❌ [CLIENT] Error checking duplicate:", error);
    // ✅ Don't block submission on error, just log it
    return { 
      isDuplicate: false,
      message: "Duplicate check failed, allowing submission"
    };
  }
};

// ============ SOS HELPER FUNCTIONS ============

export const getUserSOSCalls = async (userId: string, limitCount: number = 2) => {
  try {
    const sosCallsRef = collection(db, 'sos_calls');
    const q = query(
      sosCallsRef,
      where('userId', '==', userId),
      orderBy('calledAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    const calls: any[] = [];
    
    snapshot.forEach((doc) => {
      calls.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return calls;
  } catch (error) {
    console.error('❌ [CLIENT] Error fetching user SOS calls:', error);
    return [];
  }
};

export const listenToUserSOSCalls = (
  userId: string, 
  callback: (calls: any[]) => void,
  limitCount: number = 2
) => {
  const sosCallsRef = collection(db, 'sos_calls');
  const q = query(
    sosCallsRef,
    where('userId', '==', userId),
    orderBy('calledAt', 'desc'),
    limit(limitCount)
  );

  return onSnapshot(q, (snapshot) => {
    const calls: any[] = [];
    snapshot.forEach((doc) => {
      calls.push({
        id: doc.id,
        ...doc.data()
      });
    });
    callback(calls);
  });
};

export const linkSOSToReport = async (sosId: string, reportId: string) => {
  try {
    const sosRef = doc(db, 'sos_calls', sosId);
    await updateDoc(sosRef, {
      linkedReportId: reportId,
      updatedAt: serverTimestamp()
    });
    
    console.log(`✅ [CLIENT] SOS call ${sosId} linked to report ${reportId}`);
    return { success: true };
  } catch (error) {
    console.error('❌ [CLIENT] Error linking SOS to report:', error);
    return { success: false, error };
  }
};

export const markSOSAsReviewed = async (sosId: string, reviewerId: string) => {
  try {
    const sosRef = doc(db, 'sos_calls', sosId);
    await updateDoc(sosRef, {
      reviewed: true,
      reviewedBy: reviewerId,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    console.log(`✅ [CLIENT] SOS call ${sosId} marked as reviewed`);
    return { success: true };
  } catch (error) {
    console.error('❌ [CLIENT] Error marking SOS as reviewed:', error);
    return { success: false, error };
  }
};

export const assignSOSToAgency = async (sosId: string, agencyId: string, agencyName: string) => {
  try {
    const sosRef = doc(db, 'sos_calls', sosId);
    await updateDoc(sosRef, {
      assignedAgency: agencyId,
      assignedAgencyName: agencyName,
      assignedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    console.log(`✅ [CLIENT] SOS call ${sosId} assigned to ${agencyName}`);
    return { success: true };
  } catch (error) {
    console.error('❌ [CLIENT] Error assigning SOS to agency:', error);
    return { success: false, error };
  }
};

// ============ ADDRESS & LOCATION FUNCTIONS ============

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
  establishment?: string;
  nearbyPlaces?: string[];
  distance?: number;
}

const isWithinLipaCityBounds = (latitude: number, longitude: number): boolean => {
  return latitude >= 13.85 && latitude <= 14.05 && 
         longitude >= 121.10 && longitude <= 121.25;
};

const calculateDistanceForAddress = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// ENHANCED: Better Places API integration with larger radius
const tryPlacesNearbySearch = async (latitude: number, longitude: number): Promise<AddressComponents | null> => {
  try {
    const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=200&key=${GOOGLE_MAPS_API_KEY}`;
    
    const response = await fetch(placesUrl);
    const data = await response.json();
    
    console.log(`📍 [CLIENT] Places API status: ${data.status}`);
    
    if (data.status === 'OK' && data.results?.length > 0) {
      const nearbyPlaces = data.results.slice(0, 5).map((p: any) => p.name);
      console.log(`📍 [CLIENT] Found ${data.results.length} nearby places`);
      
      for (const place of data.results.slice(0, 3)) {
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=address_components,formatted_address,name,types,geometry&key=${GOOGLE_MAPS_API_KEY}`;
        
        const detailsResponse = await fetch(detailsUrl);
        const detailsData = await detailsResponse.json();
        
        if (detailsData.status === 'OK' && detailsData.result) {
          const placeDetail = detailsData.result;
          const placeLocation = placeDetail.geometry?.location;
          
          if (placeLocation) {
            const distance = calculateDistanceForAddress(latitude, longitude, placeLocation.lat, placeLocation.lng);
            console.log(`📍 [CLIENT] Place: ${placeDetail.name}, Distance: ${Math.round(distance)}m`);
            
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
              
              if (isEstablishment) {
                const components = extractAddressComponents(placeDetail.address_components);
                
                if (components.barangay && components.barangay !== 'Unknown Barangay') {
                  console.log(`✅ [CLIENT] Places API found: ${placeDetail.name} at ${components.barangay}`);
                  
                  return {
                    ...components,
                    formatted_address: `${placeDetail.name}, ${placeDetail.formatted_address}`,
                    establishment: placeDetail.name,
                    confidence: 95,
                    nearbyPlaces,
                    distance: Math.round(distance)
                  };
                }
              }
            }
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.log('❌ [CLIENT] Places API failed:', error);
    return null;
  }
};

const tryEnhancedGeocoding = async (latitude: number, longitude: number): Promise<AddressComponents | null> => {
  const resultTypes = ['premise', 'street_address', 'route', 'neighborhood', 'sublocality_level_1', 'sublocality'];

  for (const resultType of resultTypes) {
    try {
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&result_type=${resultType}&key=${GOOGLE_MAPS_API_KEY}&language=en&region=PH`;
      
      const response = await fetch(geocodeUrl);
      const data = await response.json();
      
      if (data.status === 'OK' && data.results?.length > 0) {
        for (const result of data.results) {
          const components = extractAddressComponents(result.address_components);
          
          if (components.barangay && components.barangay !== 'Unknown Barangay') {
            const confidence = resultType === 'premise' ? 95 : resultType === 'street_address' ? 90 : 85;
            console.log(`✅ [CLIENT] Geocoding found barangay from ${resultType}: ${components.barangay}`);
            
            return {
              ...components,
              formatted_address: result.formatted_address,
              confidence
            };
          }
        }
      }
    } catch (error) {
      console.log(`❌ [CLIENT] Geocoding failed for ${resultType}:`, error);
    }
  }

  return null;
};

export const getAddressFromCoordinates = async (latitude: number, longitude: number): Promise<AddressComponents | null> => {
  try {
    console.log(`📍 [CLIENT] Getting address for coordinates: ${latitude}, ${longitude}`);
    
    // PRIORITY 1: Try Places API for establishment detection
    let addressResult = await tryPlacesNearbySearch(latitude, longitude);
    if (addressResult) {
      console.log('✅ [CLIENT] Places API successful:', addressResult);
      return addressResult;
    }

    // PRIORITY 2: Try Enhanced Geocoding
    addressResult = await tryEnhancedGeocoding(latitude, longitude);
    if (addressResult) {
      console.log('✅ [CLIENT] Enhanced Geocoding successful:', addressResult);
      return addressResult;
    }

    console.log('⚠️ [CLIENT] All API methods failed, using coordinate fallback');
    return getCoordinateBasedAddress(latitude, longitude);

  } catch (error) {
    console.error('❌ [CLIENT] Complete geocoding failure:', error);
    return getCoordinateBasedAddress(latitude, longitude);
  }
};

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

  const barangayStrategies = [
    'neighborhood',
    'sublocality_level_1',
    'sublocality_level_2', 
    'sublocality',
    'administrative_area_level_3',
    'administrative_area_level_4',
    'locality'
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

  for (const strategy of barangayStrategies) {
    const component = components.find(comp => 
      comp.types && comp.types.includes(strategy)
    );
    
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
          barangay = cleanName;
          break;
        }
      }
    }
  }

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

const determineFallbackBarangay = (lat: number, lng: number): string => {
  console.log(`📍 [CLIENT] Determining fallback barangay for: ${lat}, ${lng}`);
  
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
  
  if (lng <= 121.155) {
    if (lat >= 13.930 && lat <= 13.960) {
      return "Mabini";
    }
    if (lat >= 13.910 && lat <= 13.940) {
      return "Mabini";
    }
    if (lat >= 13.890 && lat <= 13.920) {
      return "San Carlos";
    }
  }
  
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
  
  if (lat >= 13.920 && lat <= 13.950 && lng >= 121.155 && lng <= 121.175) {
    return "Marauoy";
  }
  
  return "Poblacion Barangay 1";
};

// ============ UNIFIED SUBMIT INCIDENT REPORT ============
export const submitIncidentReport = async ({
  userId,
  reporterName,
  address,
  category,
  description,
  images,
  location,
  subCategory,
  additionalNotes
}: {
  userId: string;
  reporterName: string;
  address: string;
  category: string;
  description: string;
  images: string[];
  location: {
    latitude: number;
    longitude: number;
  };
  subCategory?: string;
  additionalNotes?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> => {
  try {
    const user: User | null = auth.currentUser;
    if (!user) throw new Error("You must be logged in to submit a report.");

    console.log('🚀 [CLIENT] Starting report submission for user:', user.uid);
    console.log('📋 [CLIENT] Submission data:', {
      userId: user.uid,
      reporterName,
      category,
      subCategory,
      imagesCount: images.length,
      location,
      address
    });

    const latitude = location.latitude;
    const longitude = location.longitude;
    
    if (!latitude || !longitude) {
      throw new Error("Location coordinates are required");
    }

    if (!category || !address || !images || images.length === 0) {
      throw new Error("All required fields must be filled and at least one image must be attached.");
    }

    if (!isWithinLipaCityBounds(latitude, longitude)) {
      throw new Error("Reports can only be submitted within Lipa City limits");
    }

    const addressData = await getAddressFromCoordinates(latitude, longitude);
    
    if (!addressData) {
      throw new Error("Could not determine address from location. Please try again.");
    }

    // ✅ FIXED: Enhanced logging for debugging
    console.log('📍 [CLIENT] Address data resolved:', {
      barangay: addressData.barangay,
      formattedAddress: addressData.formatted_address,
      establishment: addressData.establishment,
      confidence: addressData.confidence
    });

    // Ensure user document exists
    try {
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        console.log("👤 [CLIENT] Creating user document for report submission...");
        await setDoc(userDocRef, {
          email: user.email,
          displayName: user.displayName || reporterName || "Resident",
          name: reporterName || user.displayName || "Resident",
          role: 'resident',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          notificationsEnabled: true,
          status: 'active'
        });
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (userError) {
      console.error("❌ [CLIENT] Error ensuring user document:", userError);
      throw new Error("Failed to validate user account. Please try again.");
    }

    const currentTime = new Date().toISOString();
    
    // ✅ FIXED: Proper field names and structure
    const reportData = {
      // ✅ CORRECT: Use "emergencyType" not "category"
      userId: user.uid,
      reporterName,
      emergencyType: category, // ✅ CORRECT FIELD NAME
      address: addressData.formatted_address,
      description,
      images,
      location: {
        latitude,
        longitude
      },
      type: 'report',
      status: "pending" as const,
      subCategory: subCategory || '',
      additionalNotes: additionalNotes || '',
      barangay: addressData.barangay,
      city: addressData.city || 'Lipa City',
      province: addressData.province || 'Batangas',
      
      // ✅ FIXED: Include all required fields for duplicate checking
      reporterId: user.uid,
      photos: images,
      timestamp: serverTimestamp(),
      lat: latitude,
      lng: longitude,
      formatted_address: addressData.formatted_address,
      region: addressData.region || 'Calabarzon',
      country: addressData.country || 'Philippines',
      postal_code: addressData.postal_code || '',
      confidence: addressData.confidence,
      source: 'Enhanced Google Places & Geocoding API',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
      
      // Optional fields
      ...(addressData.establishment && { establishment: addressData.establishment }),
      reporterEmail: user.email,
      
      // Initialize assignment fields
      assignedRescuer: null,
      assignedAgency: null,
      assignedRescuers: [],
      hasPatientForm: false,

      // Audit trail
      auditTrail: [{
        action: 'submitted',
        handledBy: user.email || user.uid,
        handledAt: currentTime,
        newStatus: 'pending'
      }]
    };

    console.log('💾 [CLIENT] Final report data to submit:', reportData);

    let docRef;
    try {
      console.log('📤 [CLIENT] Saving to Firestore...');
      docRef = await addDoc(collection(db, "incident_reports"), reportData);
      console.log('✅ [CLIENT] Report created successfully in Firestore. ID:', docRef.id);
      
      // ✅ FIXED: Verify the document was actually saved
      const savedDoc = await getDoc(docRef);
      if (savedDoc.exists()) {
        console.log('✅ [CLIENT] Document verified in Firestore:', savedDoc.id);
      } else {
        console.error('❌ [CLIENT] Document not found after creation!');
        throw new Error("Report was not saved to database");
      }
      
    } catch (firestoreError: any) {
      console.error("❌ [CLIENT] Firestore creation failed:", firestoreError);
      
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

    // Create notification for report submission
    try {
      console.log('🔔 [CLIENT] Creating report submission notification...');
      const locationString = addressData.establishment 
        ? `${addressData.establishment}, ${addressData.barangay}, ${addressData.city}`
        : `${addressData.barangay}, ${addressData.city}`;
        
      await notificationService.createReportSubmittedNotification(
        user.uid,
        docRef.id,
        locationString,
        category // ✅ Use correct field name
      );
      console.log('✅ [CLIENT] Report submission notification created');
    } catch (notificationError) {
      console.warn("⚠️ [CLIENT] Failed to create report notification:", notificationError);
    }

    console.log('🎉 [CLIENT] Report submitted successfully:', {
      reportId: docRef.id,
      barangay: addressData.barangay,
      establishment: addressData.establishment,
      emergencyType: category,
      subCategory: subCategory,
      imagesCount: images.length
    });

    return { 
      success: true, 
      id: docRef.id // ✅ Return the actual document ID
    };
  } catch (error) {
    console.error("❌ [CLIENT] Error submitting incident report:", error);
    
    if (error && typeof error === 'object' && 'code' in error) {
      console.error("❌ [CLIENT] Firebase error code:", (error as any).code);
      console.error("❌ [CLIENT] Firebase error message:", (error as any).message);
    }
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

// ============ REPORT STATUS UPDATE FUNCTIONS ============

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
      lastUpdated: serverTimestamp(),
      auditTrail: arrayUnion({
        action: newStatus,
        handledBy: user.email || user.uid,
        handledAt: currentTime,
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
      updateData.assignedRescuers = [assignedRescuer];
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

    // 🔥 DAGDAG: CREATE NOTIFICATION FOR REPORT STATUS UPDATE
    try {
      const reporterId = currentReport.userId || currentReport.reporterId;
      const locationString = currentReport.establishment 
        ? `${currentReport.establishment}, ${currentReport.barangay}`
        : currentReport.barangay;

      console.log(`🔔 [CLIENT] Creating ${newStatus} notification for report ${reportId}`);

      if (newStatus === 'accepted') {
        await notificationService.createReportAcceptedNotification(
          reporterId,
          reportId,
          locationString,
          currentReport.category || currentReport.emergencyType
        );
      } else if (newStatus === 'verified') {
        await notificationService.createReportVerifiedNotification(
          reporterId,
          reportId,
          locationString,
          currentReport.category || currentReport.emergencyType
        );
      } else if (newStatus === 'resolved') {
        await notificationService.createReportResolvedNotification(
          reporterId,
          reportId,
          locationString,
          currentReport.category || currentReport.emergencyType
        );
      } else if (newStatus === 'rejected') {
        await notificationService.createReportRejectedNotification(
          reporterId,
          reportId,
          locationString,
          currentReport.category || currentReport.emergencyType,
          adminNote
        );
      } else if (newStatus === 'in_progress') {
        await notificationService.createReportNotification(
          reporterId,
          reportId,
          'report_in_progress',
          currentReport.category || currentReport.emergencyType,
          'Report In Progress',
          `Work has begun on your ${currentReport.category || currentReport.emergencyType} report.`,
          'high'
        );
      } else if (newStatus === 'assigned') {
        await notificationService.createReportNotification(
          reporterId,
          reportId,
          'report_assigned',
          currentReport.category || currentReport.emergencyType,
          'Report Assigned to Responder',
          `Your ${currentReport.category || currentReport.emergencyType} report has been assigned to a responder.`,
          'high'
        );
      }
      
      console.log(`✅ [CLIENT] ${newStatus} notification created for report ${reportId}`);
    } catch (notifError) {
      console.warn('⚠️ [CLIENT] Failed to create status update notification:', notifError);
    }

    return { success: true };
  } catch (error) {
    console.error("❌ [CLIENT] Error updating report status:", error);
    return { success: false, error };
  }
};

export const updateReportStatusWithNotification = async (
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
      lastUpdated: serverTimestamp(),
      auditTrail: arrayUnion({
        action: newStatus,
        handledBy: user.email || user.uid,
        handledAt: currentTime,
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
      updateData.assignedRescuers = [assignedRescuer];
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

    // 🔥 DAGDAG: CREATE NOTIFICATION FOR REPORT STATUS UPDATE
    try {
      const reporterId = currentReport.userId || currentReport.reporterId;
      const locationString = currentReport.establishment 
        ? `${currentReport.establishment}, ${currentReport.barangay}`
        : currentReport.barangay;

      console.log(`🔔 [CLIENT] Creating ${newStatus} notification for report ${reportId}`);

      if (newStatus === 'accepted') {
        await notificationService.createReportAcceptedNotification(
          reporterId,
          reportId,
          locationString,
          currentReport.category || currentReport.emergencyType
        );
      } else if (newStatus === 'verified') {
        await notificationService.createReportVerifiedNotification(
          reporterId,
          reportId,
          locationString,
          currentReport.category || currentReport.emergencyType
        );
      } else if (newStatus === 'resolved') {
        await notificationService.createReportResolvedNotification(
          reporterId,
          reportId,
          locationString,
          currentReport.category || currentReport.emergencyType
        );
      } else if (newStatus === 'rejected') {
        await notificationService.createReportRejectedNotification(
          reporterId,
          reportId,
          locationString,
          currentReport.category || currentReport.emergencyType,
          adminNote
        );
      } else if (newStatus === 'in_progress') {
        await notificationService.createReportNotification(
          reporterId,
          reportId,
          'report_in_progress',
          currentReport.category || currentReport.emergencyType,
          'Report In Progress',
          `Work has begun on your ${currentReport.category || currentReport.emergencyType} report.`,
          'high'
        );
      } else if (newStatus === 'assigned') {
        await notificationService.createReportNotification(
          reporterId,
          reportId,
          'report_assigned',
          currentReport.category || currentReport.emergencyType,
          'Report Assigned to Responder',
          `Your ${currentReport.category || currentReport.emergencyType} report has been assigned to a responder.`,
          'high'
        );
      }
      
      console.log(`✅ [CLIENT] ${newStatus} notification created for report ${reportId}`);
    } catch (notifError) {
      console.warn('⚠️ [CLIENT] Failed to create status update notification:', notifError);
    }

    return { success: true };
  } catch (error) {
    console.error("❌ [CLIENT] Error updating report status:", error);
    return { success: false, error };
  }
};

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
    console.error("❌ [CLIENT] Error getting report:", error);
    return null;
  }
};

export const getUserReports = (userId: string, callback: (reports: IncidentReport[]) => void) => {
  const q = query(
    collection(db, "incident_reports"),
    where("userId", "==", userId),
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

// ============ GET ALL REPORTS (ADMIN/MODERATOR) ============
export const getAllReports = (callback: (reports: IncidentReport[]) => void) => {
  const q = query(
    collection(db, "incident_reports"),
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

// ============ GET REPORTS BY STATUS ============
export const getReportsByStatus = (status: ReportStatus, callback: (reports: IncidentReport[]) => void) => {
  const q = query(
    collection(db, "incident_reports"),
    where("status", "==", status),
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

// ============ ASSIGN RESCUERS TO REPORT ============
export const assignRescuersToReport = async (
  reportId: string,
  rescuerIds: string[]
): Promise<{ success: boolean; error?: any }> => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("Must be authenticated");
    }

    await updateDoc(doc(db, "incident_reports", reportId), {
      assignedRescuers: rescuerIds,
      assignedRescuer: rescuerIds[0] || null,
      lastUpdated: serverTimestamp()
    });

    return { success: true };
  } catch (error) {
    console.error("❌ [CLIENT] Error assigning rescuers:", error);
    return { success: false, error };
  }
};

// ============ ASSIGN AGENCY TO REPORT ============
export const assignAgencyToReport = async (
  reportId: string,
  agencyId: string,
  agencyName: string
): Promise<{ success: boolean; error?: any }> => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("Must be authenticated");
    }

    await updateDoc(doc(db, "incident_reports", reportId), {
      assignedAgency: agencyId,
      assignedAgencyName: agencyName,
      assignedAt: serverTimestamp(),
      lastUpdated: serverTimestamp()
    });

    return { success: true };
  } catch (error) {
    console.error("❌ [CLIENT] Error assigning agency:", error);
    return { success: false, error };
  }
};

// ============ FORMAT HELPERS ============
export const formatLocation = (report: IncidentReport) => {
  if (report.establishment) {
    return `${report.establishment}, ${report.barangay || 'Unknown area'}`;
  }
  
  if (report.formatted_address) {
    return report.formatted_address;
  }
  
  if (report.address) {
    return report.address;
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

// ✅ UPDATED: Complete status display text with all status types
export const getStatusDisplayText = (status: ReportStatus): string => {
  const statusMap: Record<ReportStatus, string> = {
    'pending': 'Under Review',
    'accepted': 'Accepted',
    'verified': 'Verified',
    'rejected': 'Not Approved',
    'failed': 'Verification Failed',
    'resolved': 'Resolved',
    'in_progress': 'In Progress',
    'assigned': 'Assigned to Responder',
    'cancelled': 'Cancelled'
  };
  return statusMap[status] || status;
};

// ✅ UPDATED: Complete status color mapping with all status types
export const getStatusColor = (status: ReportStatus) => {
  switch (status) {
    case 'pending':
      return '#f59e0b'; // amber
    case 'accepted':
      return '#10b981'; // emerald
    case 'verified':
      return '#059669'; // green
    case 'rejected':
      return '#f97316'; // orange
    case 'failed':
      return '#dc2626'; // red
    case 'resolved':
      return '#22c55e'; // green
    case 'in_progress':
      return '#3b82f6'; // blue
    case 'assigned':
      return '#8b5cf6'; // violet
    case 'cancelled':
      return '#6b7280'; // gray
    default:
      return '#6b7280'; // gray
  }
};

// ============ PHOTO TIMESTAMP HELPERS ============
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
    console.error('❌ [CLIENT] Error checking photo timestamp:', error);
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
    console.error('❌ [CLIENT] Error marking photo as processed:', error);
    return false;
  }
};

// ✅ NEW: DUPLICATE REPORT NOTIFICATION HELPER
export const createDuplicateReportNotification = async (
  userId: string,
  duplicateReportId: string,
  emergencyType: string,
  subCategory: string,
  barangay: string,
  timeSinceReport: number,
  currentStatus: string
): Promise<void> => {
  try {
    await notificationService.createDuplicateReportNotification(
      userId,
      duplicateReportId,
      emergencyType,
      subCategory,
      barangay,
      timeSinceReport,
      currentStatus
    );
    console.log(`✅ [CLIENT] Duplicate report notification created for user ${userId}`);
  } catch (error) {
    console.error('❌ [CLIENT] Failed to create duplicate report notification:', error);
  }
};