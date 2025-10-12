// services/reports.ts - COMPLETE WITH FULL NOTIFICATION INTEGRATION
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
import { notificationService } from "./notifications"; // ✅ FIXED IMPORT PATH

const GOOGLE_MAPS_API_KEY = Platform.OS === 'android' 
  ? 'AIzaSyDHNKCfdb_Ae0sMaSmdDf88xjOvj2hJM68'
  : 'AIzaSyB2MdahsHMIyhDjBTTVwgAm1i-zVx4OD5U';

export type ReportStatus = 
  | 'pending'
  | 'accepted'
  | 'verified'
  | 'rejected'
  | 'failed'
  | 'resolved';

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
  location?: { lat: number; lng: number };
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
  images?: string[];
  hasPatientForm?: boolean;
  assignedAgency?: string | null;
  assignedRescuers?: string[];
  lastUpdated?: any;
  
  // ADDITIONAL NOTES FIELD
  additionalNotes?: string;
}

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
    console.error('Error fetching user SOS calls:', error);
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
    
    console.log(`✅ SOS call ${sosId} linked to report ${reportId}`);
    return { success: true };
  } catch (error) {
    console.error('Error linking SOS to report:', error);
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
    
    console.log(`✅ SOS call ${sosId} marked as reviewed`);
    return { success: true };
  } catch (error) {
    console.error('Error marking SOS as reviewed:', error);
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
    
    console.log(`✅ SOS call ${sosId} assigned to ${agencyName}`);
    return { success: true };
  } catch (error) {
    console.error('Error assigning SOS to agency:', error);
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

// ENHANCED: Better Places API integration with larger radius
const tryPlacesNearbySearch = async (latitude: number, longitude: number): Promise<AddressComponents | null> => {
  try {
    const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=200&key=${GOOGLE_MAPS_API_KEY}`;
    
    const response = await fetch(placesUrl);
    const data = await response.json();
    
    console.log(`Places API status: ${data.status}`);
    
    if (data.status === 'OK' && data.results?.length > 0) {
      const nearbyPlaces = data.results.slice(0, 5).map((p: any) => p.name);
      
      for (const place of data.results.slice(0, 3)) {
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=address_components,formatted_address,name,types,geometry&key=${GOOGLE_MAPS_API_KEY}`;
        
        const detailsResponse = await fetch(detailsUrl);
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
              
              if (isEstablishment) {
                const components = extractAddressComponents(placeDetail.address_components);
                
                if (components.barangay && components.barangay !== 'Unknown Barangay') {
                  console.log(`✅ Places API found: ${placeDetail.name} at ${components.barangay}`);
                  
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
    console.log('Places API failed:', error);
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
            console.log(`✅ Geocoding found barangay from ${resultType}: ${components.barangay}`);
            
            return {
              ...components,
              formatted_address: result.formatted_address,
              confidence
            };
          }
        }
      }
    } catch (error) {
      console.log(`Geocoding failed for ${resultType}:`, error);
    }
  }

  return null;
};

export const getAddressFromCoordinates = async (latitude: number, longitude: number): Promise<AddressComponents | null> => {
  try {
    console.log(`Getting address for coordinates: ${latitude}, ${longitude}`);
    
    // PRIORITY 1: Try Places API for establishment detection
    let addressResult = await tryPlacesNearbySearch(latitude, longitude);
    if (addressResult) {
      console.log('✅ Places API successful:', addressResult);
      return addressResult;
    }

    // PRIORITY 2: Try Enhanced Geocoding
    addressResult = await tryEnhancedGeocoding(latitude, longitude);
    if (addressResult) {
      console.log('✅ Enhanced Geocoding successful:', addressResult);
      return addressResult;
    }

    console.log('⚠️ All API methods failed, using coordinate fallback');
    return getCoordinateBasedAddress(latitude, longitude);

  } catch (error) {
    console.error('Complete geocoding failure:', error);
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

    console.log('Submitting unified incident report for user:', user.uid);

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

    // Ensure user document exists
    try {
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        console.log("Creating user document for report submission...");
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
      console.error("Error ensuring user document:", userError);
      throw new Error("Failed to validate user account. Please try again.");
    }

    const currentTime = new Date().toISOString();
    
    // Build unified report data structure matching your schema
    const reportData = {
      // UNIFIED SCHEMA FIELDS
      userId: user.uid,
      reporterName,
      address: addressData.formatted_address,
      category,
      description,
      images,
      location: {
        latitude,
        longitude
      },
      type: 'report',
      status: "pending" as const,
      hasPatientForm: false,
      assignedAgency: null,
      assignedRescuers: [],
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
      
      // ADDITIONAL FIELDS FOR ADMIN
      subCategory: subCategory || '',
      additionalNotes: additionalNotes || '',
      
      // LEGACY/COMPATIBILITY FIELDS
      reporterId: user.uid,
      emergencyType: category,
      photos: images,
      timestamp: serverTimestamp(),
      lat: latitude,
      lng: longitude,
      formatted_address: addressData.formatted_address,
      barangay: addressData.barangay,
      city: addressData.city || 'Lipa City',
      province: addressData.province || 'Batangas',
      region: addressData.region || 'Calabarzon',
      country: addressData.country || 'Philippines',
      postal_code: addressData.postal_code || '',
      confidence: addressData.confidence,
      source: 'Enhanced Google Places & Geocoding API',
      updatedAt: serverTimestamp(),
      reporterEmail: user.email,
      assignedRescuer: null,
      ...(addressData.establishment && { establishment: addressData.establishment }),
      photoUrl: images[0] || null,
      auditTrail: [{
        action: 'submitted',
        handledBy: user.email || user.uid,
        handledAt: currentTime,
        newStatus: 'pending'
      }]
    };

    console.log('Unified report data to submit:', reportData);

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

    // 🔥 DAGDAG: CREATE NOTIFICATION FOR REPORT SUBMISSION
    try {
      console.log('🔔 Creating report submission notification...');
      const locationString = addressData.establishment 
        ? `${addressData.establishment}, ${addressData.barangay}, ${addressData.city}`
        : `${addressData.barangay}, ${addressData.city}`;
        
      await notificationService.createReportSubmittedNotification(
        user.uid,
        docRef.id,
        locationString,
        category
      );
      console.log('✅ Report submission notification created');
    } catch (notificationError) {
      console.warn("⚠️ Failed to create report notification:", notificationError);
    }

    console.log('Report submitted successfully:', {
      reportId: docRef.id,
      barangay: addressData.barangay,
      establishment: addressData.establishment,
      confidence: addressData.confidence,
      subCategory: subCategory,
      additionalNotes: additionalNotes
    });

    return { 
      success: true, 
      id: docRef.id
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

// 🔥 DAGDAG: NEW FUNCTION FOR REPORT STATUS UPDATES WITH NOTIFICATIONS
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

      console.log(`🔔 Creating ${newStatus} notification for report ${reportId}`);

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
      }
      
      console.log(`✅ ${newStatus} notification created for report ${reportId}`);
    } catch (notifError) {
      console.warn('⚠️ Failed to create status update notification:', notifError);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating report status:", error);
    return { success: false, error };
  }
};

// UPDATE EXISTING updateReportStatus FUNCTION - DAGDAGAN LANG:
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

    // 🔥 DAGDAG: ADD NOTIFICATIONS TO EXISTING FUNCTION TOO
    try {
      const reporterId = currentReport.userId || currentReport.reporterId;
      const locationString = currentReport.establishment 
        ? `${currentReport.establishment}, ${currentReport.barangay}`
        : currentReport.barangay;

      console.log(`🔔 Creating ${newStatus} notification for report ${reportId}`);

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
      }
      
      console.log(`✅ ${newStatus} notification created for report ${reportId}`);
    } catch (notifError) {
      console.warn('⚠️ Failed to create status update notification:', notifError);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating report status:", error);
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
    console.error("Error getting report:", error);
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
    console.error("Error assigning rescuers:", error);
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
    console.error("Error assigning agency:", error);
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

export const getStatusDisplayText = (status: ReportStatus) => {
  switch (status) {
    case 'pending':
      return 'Pending Review';
    case 'accepted':
      return 'Accepted';
    case 'verified':
      return 'Verified';
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