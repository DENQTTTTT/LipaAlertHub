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

export const register = async (
  email: string,
  password: string,
  name: string,
  number: string,
  barangay: string
) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Check for duplicate accounts BEFORE creating Firestore document
    const duplicateCheck = await checkDuplicateAccountAuthenticated(name, barangay, user.uid);
    const initialStatus = duplicateCheck ? "under_review" : "pending";

    // Create user profile in Firestore
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      firebaseUID: user.uid,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phoneNumber: number.trim(),
      number: number.trim(),
      barangay: barangay.trim(),
      role: "resident",
      status: initialStatus,
      duplicateFlag: duplicateCheck,
      warnings: 0,
      strikes: 0,
      lastViolationReason: null,
      lastViolationDate: null,
      suspensionUntil: null,
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deviceType: "mobile"
    });

    return { userCredential, isDuplicate: duplicateCheck };
  } catch (error) {
    console.error("Registration error:", error);
    
    // Clean up auth user if Firestore fails
    if (auth.currentUser?.uid) {
      try {
        await auth.currentUser.delete();
      } catch (deleteError) {
        console.error("Error deleting auth account:", deleteError);
      }
    }
    
    throw error;
  }
};

export const checkDuplicateAccountAuthenticated = async (
  name: string,
  barangay: string,
  currentUid: string
): Promise<boolean> => {
  try {
    const usersRef = collection(db, "users");
    const q = query(
      usersRef,
      where("name", "==", name.trim()),
      where("barangay", "==", barangay.trim())
    );
    
    const snapshot = await getDocs(q);
    
    // Check for duplicates excluding current user
    const duplicates = snapshot.docs.filter(doc => 
      doc.id !== currentUid && 
      doc.data().status !== "declined" && // Exclude declined accounts
      doc.data().status !== "banned"      // Exclude banned accounts
    );
    
    return duplicates.length > 0;
  } catch (error) {
    console.error("Error checking duplicate:", error);
    return false;
  }
};

export const login = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    const userStatus = await getUserStatus(user.uid);
    
    if (!userStatus) {
      await signOut(auth);
      throw new Error("Account not found. Please register first.");
    }

    // Check if user is resident
    if (userStatus.role !== 'resident') {
      await signOut(auth);
      throw new Error("This mobile app is for residents only. Staff accounts should use the web admin portal.");
    }

    // Check suspension
    if (userStatus.suspensionUntil) {
      const suspensionDate = userStatus.suspensionUntil.toDate 
        ? userStatus.suspensionUntil.toDate() 
        : new Date(userStatus.suspensionUntil);
      
      if (suspensionDate > new Date()) {
        await signOut(auth);
        throw new Error("ACCOUNT_SUSPENDED");
      }
    }

    // Check ban status
    if (userStatus.status === "banned") {
      await signOut(auth);
      throw new Error("ACCOUNT_BANNED");
    }

    return { userCredential, userStatus };
  } catch (error: any) {
    console.error("Login error:", error);
    
    // Re-throw the error with proper handling
    if (error.message === "ACCOUNT_BANNED" || error.message === "ACCOUNT_SUSPENDED") {
      throw error;
    }
    
    // Handle Firebase auth errors
    if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
      throw new Error("Invalid email or password");
    } else if (error.code === "auth/user-not-found") {
      throw new Error("No account found with this email");
    } else if (error.code === "auth/too-many-requests") {
      throw new Error("Too many attempts. Please try again later.");
    }
    
    throw error;
  }
};

export const getUserStatus = async (uid: string) => {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return {
        status: userData.status || "pending",
        name: userData.name || null,
        email: userData.email || null,
        phoneNumber: userData.phoneNumber || userData.number || null,
        role: userData.role || "resident",
        declineReason: userData.declineReason || null,
        duplicateFlag: userData.duplicateFlag || false,
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

    // Check ban status
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
          reason: status.lastViolationReason || "Account temporarily suspended",
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
          ? "Account under review due to duplicate name in barangay"
          : "Account pending admin approval"
      };
    }

    // Check declined status
    if (status.status === "declined") {
      return {
        canAccess: false,
        reason: status.declineReason || "Account registration declined"
      };
    }

    // Active account
    if (status.status === "active") {
      return { canAccess: true };
    }

    return { canAccess: false, reason: "Account status unknown" };
  } catch (error) {
    console.error("Error checking account access:", error);
    return { canAccess: false, reason: "Unable to verify account status" };
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout error:", error);
    throw error;
  }
};

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
    throw new Error("Authentication failed. Please try again");
  }
};

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
    throw new Error("Failed to update password. Please try again");
  }
};

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

export const updatePasswordViaReset = async (sessionId: string, newPasswordValue: string) => {
  const { setNewPassword } = await import("./otp");
  return await setNewPassword(sessionId, newPasswordValue);
};

export const getUserProfile = async (uid: string): Promise<any> => {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return {
        ...data,
        phoneNumber: data.phoneNumber || data.number || null
      };
    }
    return null;
  } catch (error) {
    console.error("Error getting user profile:", error);
    return null;
  }
};

export const hasRole = async (requiredRoles: string[]) => {
  const user = auth.currentUser;
  if (!user) return false;
  
  const profile = await getUserProfile(user.uid);
  if (!profile) return false;
  
  return requiredRoles.includes(profile.role);
};

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

export const getPasswordStrength = (password: string): { strength: number; label: string; color: string } => {
  if (!password) return { strength: 0, label: "", color: "#e9ecef" };

  const validation = validatePasswordStrength(password);
  const score = validation.score;

  if (score <= 2) return { strength: score, label: "Weak", color: "#dc3545" };
  if (score <= 4) return { strength: score, label: "Good", color: "#ffc107" };
  return { strength: score, label: "Strong", color: "#28a745" };
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email) && email.length <= 254;
};

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
};