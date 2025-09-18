// services/firebase.ts - Simplified version to avoid Firestore internal errors
import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import {
  collection,
  disableNetwork,
  enableNetwork,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  where
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyACw2laKXQGTW634IejVAdK8m0PKngvaRo",
  authDomain: "lipaalerthub.firebaseapp.com",
  projectId: "lipaalerthub",
  storageBucket: "lipaalerthub.firebasestorage.app",
  messagingSenderId: "991310233066",
  appId: "1:991310233066:web:7e836a60e5c4a302de0693",
  measurementId: "G-PCEYY3PFWW"
};

// Initialize Firebase app (singleton pattern)
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Initialize Firebase services
const auth: Auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Emergency Contact Interface
export interface EmergencyContact {
  id: string;
  name: string;
  icon: string;
  phoneNumber: string;
  category: "city" | "barangay";
  barangay?: string;
  displayOrder?: number;
  isActive?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

// Default fallback emergency contacts
export const DEFAULT_EMERGENCY_CONTACTS: EmergencyContact[] = [
  {
    id: "police_department",
    name: "Police Department",
    icon: "👮",
    phoneNumber: "043-702-3832",
    category: "city",
    displayOrder: 1,
    isActive: true
  },
  {
    id: "fire_department",
    name: "Fire Department", 
    icon: "🔥",
    phoneNumber: "043-757-4618",
    category: "city",
    displayOrder: 2,
    isActive: true
  },
  {
    id: "medical_services",
    name: "Medical Services",
    icon: "🏥",
    phoneNumber: "043-756-2342",
    category: "city",
    displayOrder: 3,
    isActive: true
  },
  {
    id: "disaster_department",
    name: "Disaster Department",
    icon: "🚨",
    phoneNumber: "043-757-5164",
    category: "city",
    displayOrder: 4,
    isActive: true
  }
];

// Simplified fetch function to avoid internal assertion errors
export const fetchEmergencyContacts = async (userBarangay?: string): Promise<EmergencyContact[]> => {
  try {
    console.log("Fetching emergency contacts for barangay:", userBarangay);
    
    // Check network connectivity first
    const isOnline = await checkNetworkConnectivity();
    if (!isOnline) {
      console.log("Device is offline, using default contacts");
      return getFilteredDefaultContacts(userBarangay);
    }
    
    const emergencyContactsRef = collection(db, "emergency_contacts");
    
    // Use simple query to avoid composite filter issues
    const q = query(
      emergencyContactsRef,
      where("isActive", "==", true)
    );

    const querySnapshot = await getDocs(q);
    const allContacts: EmergencyContact[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      allContacts.push({
        id: doc.id,
        name: data.name,
        icon: data.icon,
        phoneNumber: data.phoneNumber,
        category: data.category,
        barangay: data.barangay,
        displayOrder: data.displayOrder || 999,
        isActive: data.isActive,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      });
    });

    // Filter in JavaScript based on user's barangay
    const filteredContacts = allContacts.filter(contact => {
      if (contact.category === "city") {
        return true; // Include all city-wide contacts
      }
      
      if (contact.category === "barangay" && userBarangay && contact.barangay === userBarangay) {
        return true; // Include matching barangay-specific contacts
      }
      
      return false;
    });

    // Sort by display order
    filteredContacts.sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999));
    
    console.log(`Successfully fetched and filtered ${filteredContacts.length} emergency contacts`);
    return filteredContacts.length > 0 ? filteredContacts : getFilteredDefaultContacts(userBarangay);
    
  } catch (error) {
    console.error("Error fetching emergency contacts:", error);
    
    // Return filtered default contacts as fallback
    return getFilteredDefaultContacts(userBarangay);
  }
};

// Helper function to get filtered default contacts
const getFilteredDefaultContacts = (userBarangay?: string): EmergencyContact[] => {
  const fallbackContacts = userBarangay 
    ? DEFAULT_EMERGENCY_CONTACTS.filter(contact => 
        contact.category === "city" || contact.barangay === userBarangay
      )
    : DEFAULT_EMERGENCY_CONTACTS.filter(contact => contact.category === "city");
  
  console.log("Using fallback emergency contacts:", fallbackContacts.length);
  return fallbackContacts;
};

// Check network connectivity
const checkNetworkConnectivity = async (): Promise<boolean> => {
  try {
    // Simple connectivity test
    const testCollection = collection(db, "emergency_contacts");
    const testQuery = query(testCollection, where("isActive", "==", true));
    await getDocs(testQuery);
    return true;
  } catch (error) {
    console.warn("Network connectivity check failed:", error);
    return false;
  }
};

// Safer Firestore connectivity check
export const checkFirestoreConnectivity = async (): Promise<boolean> => {
  try {
    // Don't use enableNetwork as it can cause state issues
    const testQuery = query(
      collection(db, "emergency_contacts"), 
      where("isActive", "==", true)
    );
    await getDocs(testQuery);
    return true;
  } catch (error) {
    console.warn("Firestore connectivity check failed:", error);
    return false;
  }
};

// Safe network management functions
export const enableFirestoreNetwork = async (): Promise<void> => {
  try {
    await enableNetwork(db);
    console.log("Firestore network enabled");
  } catch (error) {
    console.error("Failed to enable Firestore network:", error);
  }
};

export const disableFirestoreNetwork = async (): Promise<void> => {
  try {
    await disableNetwork(db);
    console.log("Firestore network disabled");
  } catch (error) {
    console.error("Failed to disable Firestore network:", error);
  }
};

// Format emergency contact for display
export const formatEmergencyContactForDisplay = (contact: EmergencyContact) => {
  const nameParts = contact.name.toUpperCase().split(' ');
  return {
    id: contact.id,
    title: nameParts[0] || contact.name.toUpperCase(),
    subtitle: nameParts.slice(1).join(' ') || "SERVICES",
    icon: contact.icon,
    phoneNumber: contact.phoneNumber,
    backgroundColor: "#ffffff"
  };
};

export { app, auth, db, serverTimestamp, storage };
