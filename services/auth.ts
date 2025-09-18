// services/auth.ts
import {
  createUserWithEmailAndPassword,
  updatePassword as firebaseUpdatePassword,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

/**
 * Register new mobile user (default role: resident)
 */
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
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    deviceType: "mobile" // Tag as mobile
  });

  return userCredential;
};

/**
 * Login user
 */
export const login = (email: string, password: string) => {
  return signInWithEmailAndPassword(auth, email, password);
};

/**
 * Logout user
 */
export const logout = () => {
  return signOut(auth);
};

/**
 * 🚨 Phase 2 update:
 * Remove sendPasswordResetEmail
 * → Use OTP flow in services/otp.ts instead
 *
 * Example:
 *   import { requestOtp, verifyOtp, setNewPassword } from "./otp";
 *   await requestOtp(email);
 *   await verifyOtp(sessionId, otpCode);
 *   await setNewPassword(sessionId, newPassword);
 */
// No resetPassword here anymore ✅

/**
 * Update password for logged-in users (not reset)
 */
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

/**
 * Get user profile by UID
 */
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

/**
 * Role-based access check
 */
export const hasRole = async (requiredRoles: string[]) => {
  const user = auth.currentUser;
  if (!user) return false;
  
  const profile = await getUserProfile(user.uid);
  if (!profile) return false;
  
  return requiredRoles.includes(profile.role);
};

/**
 * Mobile-only authentication guard
 */
export const requireMobileAuth = (): Promise<{ user: any, profile: any }> => {
  return new Promise(async (resolve, reject) => {
    const user = auth.currentUser;
    if (!user) {
      reject(new Error("User not authenticated"));
      return;
    }
    
    try {
      const profile = await getUserProfile(user.uid);
      
      // If no profile exists, create a basic one
      if (!profile) {
        const basicProfile = {
          name: user.displayName || "User",
          email: user.email,
          role: "resident",
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
          deviceType: "mobile"
        };
        
        await setDoc(doc(db, "users", user.uid), basicProfile);
        resolve({ user, profile: basicProfile });
      } else {
        resolve({ user, profile });
      }
    } catch (error) {
      console.error("Error in mobile auth check:", error);
      reject(error);
    }
  });
};
