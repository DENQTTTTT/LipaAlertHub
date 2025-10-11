import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import { collection, disableNetwork, enableNetwork, getDocs, getFirestore, onSnapshot, query, setLogLevel, where } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

// Suppress Firestore offline warnings
setLogLevel('error');

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
const functions = getFunctions(app, 'asia-southeast1');

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

// UPDATED: Default fallback emergency contacts with CORRECT PHONE NUMBERS
export const DEFAULT_EMERGENCY_CONTACTS: EmergencyContact[] = [
  {
    id: "cdrrmo_medical",
    name: "CDRRMO Medical",
    icon: "🏥",
    phoneNumber: "(043) 756-0127",
    category: "city",
    displayOrder: 1,
    isActive: true
  },
  {
    id: "lipa_bfp", 
    name: "LIPA BFP Fire",
    icon: "🔥",
    phoneNumber: "(043) 757-4618",
    category: "city",
    displayOrder: 2,
    isActive: true
  },
  {
    id: "lipa_pnp",
    name: "LIPA PNP Police",
    icon: "🚔",
    phoneNumber: "(043) 702-3832",
    category: "city",
    displayOrder: 3,
    isActive: true
  },
  {
    id: "cdrrmo_disaster",
    name: "CDRRMO Disaster",
    icon: "🌪️",
    phoneNumber: "(043) 756-0127",
    category: "city",
    displayOrder: 4,
    isActive: true
  }
];

/**
 * Fetch emergency contacts from Firestore - Admin can maintain these
 * NOW WITH REAL-TIME UPDATES
 */
export const fetchEmergencyContacts = async (): Promise<EmergencyContact[]> => {
  try {
    console.log('Fetching emergency contacts from Firestore...');
    const isOnline = await checkNetworkConnectivity();
    if (!isOnline) {
      console.log('Offline: Using default contacts');
      return DEFAULT_EMERGENCY_CONTACTS;
    }

    const emergencyContactsRef = collection(db, "emergency_contacts");
    // Fetch active city-level contacts that admin maintains
    const q = query(
      emergencyContactsRef,
      where("isActive", "==", true),
      where("category", "==", "city")
    );

    const querySnapshot = await getDocs(q);
    const contacts: EmergencyContact[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      contacts.push({
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

    // Sort by display order
    contacts.sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999));
    
    console.log(`Fetched ${contacts.length} emergency contacts from Firestore`);
    
    // Return Firestore contacts if available, otherwise use defaults
    return contacts.length > 0 ? contacts : DEFAULT_EMERGENCY_CONTACTS;
  } catch (error) {
    console.error('Error fetching emergency contacts from Firestore:', error);
    return DEFAULT_EMERGENCY_CONTACTS;
  }
};

/**
 * NEW: Real-time listener for emergency contacts updates
 * This ensures phone numbers are always up-to-date
 */
export const subscribeToEmergencyContacts = (
  callback: (contacts: EmergencyContact[]) => void
): (() => void) => {
  try {
    const emergencyContactsRef = collection(db, "emergency_contacts");
    const q = query(
      emergencyContactsRef,
      where("isActive", "==", true),
      where("category", "==", "city")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const contacts: EmergencyContact[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        contacts.push({
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

      // Sort by display order
      contacts.sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999));
      
      console.log(`Real-time update: ${contacts.length} emergency contacts`);
      callback(contacts.length > 0 ? contacts : DEFAULT_EMERGENCY_CONTACTS);
    }, (error) => {
      console.error('Error in real-time contacts listener:', error);
      callback(DEFAULT_EMERGENCY_CONTACTS);
    });

    return unsubscribe;
  } catch (error) {
    console.error('Error setting up real-time contacts listener:', error);
    callback(DEFAULT_EMERGENCY_CONTACTS);
    return () => {}; // Return empty unsubscribe function
  }
};

// Check network connectivity
const checkNetworkConnectivity = async (): Promise<boolean> => {
  try {
    const testCollection = collection(db, "emergency_contacts");
    const testQuery = query(testCollection, where("isActive", "==", true));
    await getDocs(testQuery);
    return true;
  } catch (error) {
    return false;
  }
};

// Safer Firestore connectivity check
export const checkFirestoreConnectivity = async (): Promise<boolean> => {
  try {
    const testQuery = query(
      collection(db, "emergency_contacts"),
      where("isActive", "==", true)
    );
    await getDocs(testQuery);
    return true;
  } catch (error) {
    return false;
  }
};

// Safe network management functions
export const enableFirestoreNetwork = async (): Promise<void> => {
  try {
    await enableNetwork(db);
  } catch (error) {
    console.error('Error enabling network:', error);
  }
};

export const disableFirestoreNetwork = async (): Promise<void> => {
  try {
    await disableNetwork(db);
  } catch (error) {
    console.error('Error disabling network:', error);
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

export { app, auth, db, functions, storage };
