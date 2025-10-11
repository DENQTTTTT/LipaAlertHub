// hooks/useAuth.tsx - Enhanced with Violation & Suspension Monitoring
import { auth, db } from "@/services/firebase";
import { useRouter } from "expo-router";
import { User, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  name?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  number?: string;
  address?: string;
  photoURL?: string | null;
  role?: "resident" | "admin" | "monitor" | "rescuer";
  status?: "active" | "pending" | "declined" | "suspended" | "banned" | "under_review";
  verificationStatus?: "pending" | "verified" | "rejected";
  declineReason?: string;
  barangay?: string;
  // Violation fields
  warnings?: number;
  strikes?: number;
  lastViolationReason?: string;
  lastViolationDate?: any;
  suspensionUntil?: any;
  duplicateFlag?: boolean;
  // Timestamps
  createdAt?: any;
  updatedAt?: any;
  expoPushToken?: string;
  tokenUpdatedAt?: any;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isApproved: boolean;
  isSuspended: boolean;
  isBanned: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const hasRedirectedRef = useRef(false); // Prevent double redirects
  const lastStatusRef = useRef<string | undefined>(undefined); // Track status changes

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Auth state changed:", firebaseUser ? "User signed in" : "User signed out");
      setUser(firebaseUser);

      if (firebaseUser) {
        await fetchUserProfile(firebaseUser.uid);
      } else {
        setUserProfile(null);
        setLoading(false);
        hasRedirectedRef.current = false;
        lastStatusRef.current = undefined;
      }
    });

    return unsubscribe;
  }, []);

  // Real-time profile updates with suspension monitoring
  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const profileData = docSnapshot.data() as Omit<UserProfile, "uid">;
          const updatedProfile: UserProfile = {
            uid: user.uid,
            ...profileData,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
          };
          
          setUserProfile(updatedProfile);
          
          // Check if status changed significantly
          const statusChanged = lastStatusRef.current !== profileData.status;
          lastStatusRef.current = profileData.status;

          // Only redirect if status actually changed
          if (statusChanged && profileData.status) {
            console.log(`User status changed to: ${profileData.status}`);
            hasRedirectedRef.current = false; // Allow new redirect for status change
            checkAccountStatus(updatedProfile);
          } else if (!hasRedirectedRef.current) {
            // Initial check
            checkAccountStatus(updatedProfile);
          }
        } else {
          console.log("User profile document does not exist");
          setUserProfile({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            role: "resident",
            status: "pending",
            warnings: 0,
            strikes: 0,
          });
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to user profile:", error);
        setUserProfile({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: "resident",
          status: "pending",
          warnings: 0,
          strikes: 0,
        });
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  // Check account status and handle suspension/ban
  const checkAccountStatus = (profile: UserProfile) => {
    // Prevent multiple redirects
    if (hasRedirectedRef.current) {
      console.log("Already redirected, skipping status check");
      return;
    }

    // Check if banned
    if (profile.status === "banned") {
      console.log("Account is banned - redirecting to suspension screen");
      hasRedirectedRef.current = true;
      router.replace({
        pathname: "/(auth)/suspended",
        params: {
          isPermanent: "true",
          reason: profile.lastViolationReason || "Multiple violations",
          strikes: profile.strikes?.toString() || "3",
          warnings: profile.warnings?.toString() || "0"
        }
      });
      return;
    }

    // Check if suspended
    if (profile.suspensionUntil) {
      const suspensionDate = profile.suspensionUntil.toDate 
        ? profile.suspensionUntil.toDate() 
        : new Date(profile.suspensionUntil);
      
      if (suspensionDate > new Date()) {
        console.log("Account is suspended - redirecting to suspension screen");
        hasRedirectedRef.current = true;
        router.replace({
          pathname: "/(auth)/suspended",
          params: {
            isPermanent: "false",
            suspensionUntil: suspensionDate.toISOString(),
            reason: profile.lastViolationReason || "Violation of terms",
            strikes: profile.strikes?.toString() || "2",
            warnings: profile.warnings?.toString() || "0"
          }
        });
        return;
      }
    }

    // Check if pending or under review (don't redirect for this, just log)
    if (profile.status === "pending" || profile.status === "under_review") {
      console.log("Account pending approval");
      // Don't redirect - let account-status screen handle this
      return;
    }
  };

  const fetchUserProfile = async (uid: string) => {
    try {
      setLoading(true);
      const userDocRef = doc(db, "users", uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const profileData = userDoc.data() as Omit<UserProfile, "uid">;
        const profile: UserProfile = {
          uid,
          ...profileData,
          email: user?.email || null,
          displayName: user?.displayName || null,
          photoURL: user?.photoURL || null,
        };
        
        setUserProfile(profile);
        lastStatusRef.current = profile.status;
        
        // Log user info for debugging
        console.log("User profile loaded:", {
          uid: profile.uid,
          email: profile.email,
          status: profile.status,
          role: profile.role,
          warnings: profile.warnings,
          strikes: profile.strikes,
          suspended: !!profile.suspensionUntil
        });

        // Check status on initial load
        checkAccountStatus(profile);
      } else {
        console.log("User profile document does not exist, creating basic profile");
        const basicProfile: UserProfile = {
          uid,
          email: user?.email || null,
          displayName: user?.displayName || null,
          photoURL: user?.photoURL || null,
          role: "resident",
          status: "pending",
          warnings: 0,
          strikes: 0,
        };
        setUserProfile(basicProfile);
        lastStatusRef.current = "pending";
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
      setUserProfile({
        uid,
        email: user?.email || null,
        displayName: user?.displayName || null,
        photoURL: user?.photoURL || null,
        role: "resident",
        status: "pending",
        warnings: 0,
        strikes: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      hasRedirectedRef.current = false; // Reset redirect flag on manual refresh
      await fetchUserProfile(user.uid);
    }
  };

  const isAuthenticated = !!user;
  const isAdmin = userProfile?.role === "admin" || false;
  const isStaff = ["admin", "monitor", "rescuer"].includes(userProfile?.role || "");
  const isApproved = userProfile?.status === "active" || false;
  
  // New status checks
  const isSuspended = (() => {
    if (!userProfile?.suspensionUntil) return false;
    const suspensionDate = userProfile.suspensionUntil.toDate 
      ? userProfile.suspensionUntil.toDate() 
      : new Date(userProfile.suspensionUntil);
    return suspensionDate > new Date();
  })();
  
  const isBanned = userProfile?.status === "banned" || false;

  const value = {
    user,
    userProfile,
    loading,
    isAuthenticated,
    isAdmin,
    isStaff,
    isApproved,
    isSuspended,
    isBanned,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}