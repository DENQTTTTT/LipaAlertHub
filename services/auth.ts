// services/auth.ts - Enhanced with Suspension & Ban Checking
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  updatePassword as firebaseUpdatePassword,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "./firebase";

/**
 * Register new mobile user with duplicate detection
 */
export const register = async (
  email: string,
  password: string,
  name: string,
  number: string,
  barangay: string
) => {
  // Check for duplicate name in same barangay
  const duplicateCheck = await checkDuplicateAccount(name, barangay);
  
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  // Determine initial status based on duplicate check
  const initialStatus = duplicateCheck ? "under_review" : "pending";

  // Save user profile in Firestore with violation fields
  await setDoc(doc(db, "users", user.uid), {
    name,
    email,
    number,
    barangay,
    role: "resident",
    status: initialStatus,
    duplicateFlag: duplicateCheck,
    // Violation tracking
    warnings: 0,
    strikes: 0,
    lastViolationReason: null,
    lastViolationDate: null,
    suspensionUntil: null,
    // Timestamps
    createdAt: new Date(),
    updatedAt: new Date(),
    deviceType: "mobile"
  });

  return { userCredential, isDuplicate: duplicateCheck };
};

/**
 * Check for duplicate accounts (same name + barangay)
 */
export const checkDuplicateAccount = async (
  name: string,
  barangay: string
): Promise<boolean> => {
  try {
    const usersRef = collection(db, "users");
    const q = query(
      usersRef,
      where("name", "==", name),
      where("barangay", "==", barangay)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error("Error checking duplicate:", error);
    return false;
  }
};

/**
 * Login with suspension/ban check
 */
export const login = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Check user status immediately after login
    const userStatus = await getUserStatus(user.uid);
    
    if (!userStatus) {
      throw new Error("Unable to retrieve account status");
    }

    // Check if banned
    if (userStatus.status === "banned") {
      await signOut(auth); // Log them out immediately
      throw new Error("ACCOUNT_BANNED");
    }

    // Check if suspended
    if (userStatus.suspensionUntil) {
      const suspensionDate = userStatus.suspensionUntil.toDate 
        ? userStatus.suspensionUntil.toDate() 
        : new Date(userStatus.suspensionUntil);
      
      if (suspensionDate > new Date()) {
        await signOut(auth); // Log them out immediately
        throw new Error("ACCOUNT_SUSPENDED");
      }
    }

    return { userCredential, userStatus };
  } catch (error: any) {
    console.error("Login error:", error);
    throw error;
  }
};

/**
 * Get user status with violation data
 */
export const getUserStatus = async (uid: string) => {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return {
        status: userData.status || "pending",
        name: userData.name || null,
        email: userData.email || null,
        role: userData.role || "resident",
        declineReason: userData.declineReason || null,
        duplicateFlag: userData.duplicateFlag || false,
        // Violation data
        warnings: userData.warnings || 0,
        strikes: userData.strikes || 0,
        lastViolationReason: userData.lastViolationReason || null,
        lastViolationDate: userData.lastViolationDate || null,
        suspensionUntil: userData.suspensionUntil || null,
        createdAt: userData.createdAt || null,
      };
    }
    return null;
  } catch (error) {
    console.error("Error getting user status:", error);
    throw new Error("Failed to retrieve user status");
  }
};

/**
 * Check if user can access app (not suspended or banned)
 */
export const checkAccountAccess = async (uid: string): Promise<{
  canAccess: boolean;
  reason?: string;
  suspensionUntil?: Date;
  strikes?: number;
  warnings?: number;
}> => {
  try {
    const status = await getUserStatus(uid);
    
    if (!status) {
      return { canAccess: false, reason: "Account not found" };
    }

    // Check ban
    if (status.status === "banned") {
      return {
        canAccess: false,
        reason: status.lastViolationReason || "Account permanently banned",
        strikes: status.strikes,
        warnings: status.warnings
      };
    }

    // Check suspension
    if (status.suspensionUntil) {
      const suspensionDate = status.suspensionUntil.toDate 
        ? status.suspensionUntil.toDate() 
        : new Date(status.suspensionUntil);
      
      if (suspensionDate > new Date()) {
        return {
          canAccess: false,
          reason: status.lastViolationReason || "Account suspended",
          suspensionUntil: suspensionDate,
          strikes: status.strikes,
          warnings: status.warnings
        };
      }
    }

    // Check pending status
    if (status.status === "pending" || status.status === "under_review") {
      return {
        canAccess: false,
        reason: status.duplicateFlag 
          ? "Account under review due to duplicate name"
          : "Account pending approval"
      };
    }

    return { canAccess: true };
  } catch (error) {
    console.error("Error checking account access:", error);
    return { canAccess: false, reason: "Unable to verify account status" };
  }
};

/**
 * Logout user
 */
export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout error:", error);
    throw error;
  }
};

/**
 * Reauthenticate user with current password
 */
export const reauthenticateUser = async (currentPassword: string): Promise<void> => {
  const user = auth.currentUser;
  
  if (!user || !user.email) {
    throw new Error("No authenticated user found");
  }

  if (!currentPassword || typeof currentPassword !== "string" || currentPassword.trim().length === 0) {
    throw new Error("Current password is required");
  }

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
  } catch (error: any) {
    if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
      throw new Error("The current password you entered is incorrect");
    } else if (error.code === "auth/too-many-requests") {
      throw new Error("Too many failed attempts. Please wait a moment before trying again");
    } else if (error.code === "auth/network-request-failed") {
      throw new Error("Network error. Please check your connection and try again");
    } else if (error.code === "auth/user-disabled") {
      throw new Error("This account has been disabled. Please contact support");
    } else if (error.code === "auth/user-not-found") {
      throw new Error("User account not found. Please log in again");
    } else if (error.code === "auth/requires-recent-login") {
      throw new Error("For security reasons, please log out and log back in before changing your password");
    }
    throw new Error(error.message || "Authentication failed. Please try again");
  }
};

/**
 * Update password for authenticated users
 */
export const updatePasswordSecure = async (newPassword: string): Promise<void> => {
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error("No authenticated user found. Please log in again");
  }

  if (!newPassword || typeof newPassword !== "string") {
    throw new Error("New password is required");
  }

  const passwordValidation = validatePasswordStrength(newPassword);
  if (!passwordValidation.isValid) {
    throw new Error(`Password requirements not met: ${passwordValidation.errors.join(", ")}`);
  }

  try {
    await firebaseUpdatePassword(user, newPassword);
    
    await setDoc(doc(db, "users", user.uid), {
      updatedAt: new Date(),
      passwordLastChanged: new Date(),
      lastPasswordChangeIP: "mobile-app",
      lastPasswordChangeDevice: "mobile"
    }, { merge: true });
    
  } catch (error: any) {
    if (error.code === "auth/requires-recent-login") {
      throw new Error("For security reasons, please log out and log back in before changing your password");
    } else if (error.code === "auth/weak-password") {
      throw new Error("The password is too weak. Please choose a stronger password");
    } else if (error.code === "auth/network-request-failed") {
      throw new Error("Network error. Please check your connection and try again");
    } else if (error.code === "auth/user-disabled") {
      throw new Error("This account has been disabled. Please contact support");
    } else if (error.code === "auth/user-not-found") {
      throw new Error("User account not found. Please log in again");
    } else if (error.code === "auth/too-many-requests") {
      throw new Error("Too many requests. Please wait a moment before trying again");
    }
    throw new Error(error.message || "Failed to update password. Please try again");
  }
};

/**
 * Check if email exists using Cloud Function
 */
export const checkEmailExists = async (email: string): Promise<boolean> => {
  try {
    const checkEmailFunction = httpsCallable(functions, 'checkEmailExists');
    const result = await checkEmailFunction({ email: email.toLowerCase().trim() });
    
    const response = result.data as { success: boolean; exists: boolean; message: string };
    
    if (!response.success) {
      throw new Error("Failed to verify email");
    }
    
    return response.exists;
  } catch (error: any) {
    if (error.message && typeof error.message === 'string') {
      if (error.message.includes("Rate limit exceeded")) {
        throw new Error("Too many attempts. Please wait 1 minute before trying again.");
      }
      if (error.message.includes("Hourly limit exceeded") || error.message.includes("limit exceeded")) {
        throw new Error("You've reached the limit of 3 attempts per hour. Please wait before trying again.");
      }
      if (error.message.includes("Invalid email")) {
        throw new Error("Please enter a valid email address.");
      }
      if (error.message.includes("wait") && error.message.includes("minutes")) {
        throw new Error(error.message);
      }
    }
    throw new Error("Unable to verify email. Please check your connection and try again.");
  }
};

/**
 * Reset password using OTP flow
 */
export const initiatePasswordReset = async (email: string) => {
  try {
    const emailExists = await checkEmailExists(email);
    
    if (!emailExists) {
      throw new Error("No account found with this email address");
    }
    
    return {
      success: true,
      message: "Email validated. Ready to send OTP.",
      nextSteps: [
        "1. Call requestOtp(email) to send verification code",
        "2. Call verifyOtp(sessionId, code) to verify the code",
        "3. Call setNewPassword(sessionId, newPassword) to update password"
      ]
    };
  } catch (error: any) {
    throw error;
  }
};

/**
 * Update password for logged-in users
 */
export const updatePassword = async (newPassword: string) => {
  const user = auth.currentUser;
  if (user) {
    try {
      await firebaseUpdatePassword(user, newPassword);
      
      await setDoc(doc(db, "users", user.uid), {
        updatedAt: new Date(),
        passwordLastChanged: new Date()
      }, { merge: true });
      
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
 * Update password via reset flow
 */
export const updatePasswordViaReset = async (sessionId: string, newPasswordValue: string) => {
  const { setNewPassword } = await import("./otp");
  return await setNewPassword(sessionId, newPasswordValue);
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
      
      if (!profile) {
        const basicProfile = {
          name: user.displayName || "User",
          email: user.email,
          role: "resident",
          status: "active",
          warnings: 0,
          strikes: 0,
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

/**
 * Password strength validation
 */
export const validatePasswordStrength = (password: string): { isValid: boolean; errors: string[]; score: number } => {
  const errors: string[] = [];
  let score = 0;

  if (!password || typeof password !== "string") {
    return { isValid: false, errors: ["Password is required"], score: 0 };
  }

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  } else {
    score += 1;
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  } else {
    score += 1;
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  } else {
    score += 1;
  }

  if (!/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  } else {
    score += 1;
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("Password must contain at least one special character (!@#$%^&*(),.?\":{}|<>)");
  } else {
    score += 1;
  }

  if (password.length >= 12) {
    score += 1;
  }

  const weakPatterns = [
    /^(.)\1+$/,
    /^(012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i,
    /^(qwerty|asdfgh|zxcvbn|password|admin|login)/i,
  ];

  const hasWeakPattern = weakPatterns.some(pattern => pattern.test(password));
  if (hasWeakPattern) {
    errors.push("Password contains a common weak pattern");
    score = Math.max(0, score - 2);
  }

  if (password.length > 128) {
    errors.push("Password must not exceed 128 characters");
  }

  return {
    isValid: errors.length === 0,
    errors,
    score: Math.min(Math.max(score, 0), 5)
  };
};

/**
 * Get password strength label
 */
export const getPasswordStrength = (password: string): { strength: number; label: string; color: string } => {
  if (!password) return { strength: 0, label: "", color: "#e9ecef" };

  const validation = validatePasswordStrength(password);
  const score = validation.score;

  if (score <= 2) return { strength: score, label: "Weak", color: "#dc3545" };
  if (score <= 4) return { strength: score, label: "Good", color: "#ffc107" };
  return { strength: score, label: "Strong", color: "#28a745" };
};

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email) && email.length <= 254;
};

/**
 * Security check for password change
 */
export const performSecurityCheck = async (): Promise<{ canChangePassword: boolean; reason?: string }> => {
  const user = auth.currentUser;
  
  if (!user) {
    return {
      canChangePassword: false,
      reason: "User not authenticated"
    };
  }

  try {
    const profile = await getUserProfile(user.uid);
    
    if (profile?.status === "suspended") {
      return {
        canChangePassword: false,
        reason: "Account is suspended. Contact support for assistance"
      };
    }

    if (profile?.status === "banned") {
      return {
        canChangePassword: false,
        reason: "Account is banned. Contact support for assistance"
      };
    }

    if (profile?.status === "pending") {
      return {
        canChangePassword: false,
        reason: "Account verification pending. Please verify your account first"
      };
    }

    const lastPasswordChange = profile?.passwordLastChanged;
    if (lastPasswordChange) {
      const timeSinceLastChange = Date.now() - new Date(lastPasswordChange).getTime();
      const minCooldown = 5 * 60 * 1000;
      
      if (timeSinceLastChange < minCooldown) {
        const remainingTime = Math.ceil((minCooldown - timeSinceLastChange) / 1000 / 60);
        return {
          canChangePassword: false,
          reason: `Please wait ${remainingTime} minutes before changing your password again`
        };
      }
    }

    return {
      canChangePassword: true
    };
    
  } catch (error) {
    console.error("Security check failed:", error);
    return {
      canChangePassword: true
    };
  }
}