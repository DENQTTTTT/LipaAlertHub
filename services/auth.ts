// services/auth.ts
import {
  createUserWithEmailAndPassword,
  updatePassword as firebaseUpdatePassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export const register = async (
  email: string,
  password: string,
  name: string,
  number: string
) => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  // Save user profile in Firestore with RBAC fields
  await setDoc(doc(db, "users", user.uid), {
    name,
    email,
    number,
    role: "resident", // Default role for mobile users
    status: "active", // Active by default for residents
    createdAt: new Date(),
    updatedAt: new Date(),
    // Optional: Add device type to distinguish mobile users
    deviceType: "mobile"
  });

  return userCredential;
};

export const login = (email: string, password: string) => {
  return signInWithEmailAndPassword(auth, email, password);
};

export const logout = () => {
  return signOut(auth);
};

export const resetPassword = (email: string) => {
  return sendPasswordResetEmail(auth, email);
};

// Update password
export const updatePassword = async (newPassword: string) => {
  const user = auth.currentUser;
  if (user) {
    try {
      await firebaseUpdatePassword(user, newPassword);
      return { success: true };
    } catch (error) {
      console.error("Error updating password:", error);
      throw new Error("Failed to update password");
    }
  } else {
    throw new Error("No user is currently signed in. Please log in first.");
  }
};

// Function to get user role and profile data
export const getUserProfile = async (uid: string) => {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      return userDoc.data();
    }
    return null;
  } catch (error) {
    console.error("Error getting user profile:", error);
    return null;
  }
};

// Function to check if user has required role for a feature
export const hasRole = async (requiredRoles: string[]) => {
  const user = auth.currentUser;
  if (!user) return false;
  
  const profile = await getUserProfile(user.uid);
  if (!profile) return false;
  
  return requiredRoles.includes(profile.role);
};

// Simple auth check for mobile features
export const requireMobileAuth = (): Promise<{ user: any, profile: any }> => {
  return new Promise(async (resolve, reject) => {
    const user = auth.currentUser;
    if (!user) {
      reject(new Error('User not authenticated'));
      return;
    }
    
    try {
      // Get user profile
      const profile = await getUserProfile(user.uid);
      
      // If no profile exists, create a basic one for existing users
      if (!profile) {
        const basicProfile = {
          name: user.displayName || 'User',
          email: user.email,
          role: 'resident',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          deviceType: 'mobile'
        };
        
        await setDoc(doc(db, "users", user.uid), basicProfile);
        resolve({ user, profile: basicProfile });
      } else {
        resolve({ user, profile });
      }
    } catch (error) {
      console.error('Error in mobile auth check:', error);
      reject(error);
    }
  });
};