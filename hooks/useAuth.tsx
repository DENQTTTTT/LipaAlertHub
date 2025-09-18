// hooks/useAuth.tsx - Enhanced Auth Hook for Chat System with Barangay Support
import { auth, db } from "@/services/firebase";
import { User, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import React, { createContext, useContext, useEffect, useState } from "react";

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  address?: string;
  photoURL?: string | null;
  role?: "resident" | "admin" | "monitor" | "rescuer";
  status?: "active" | "pending" | "suspended";
  verificationStatus?: "pending" | "verified" | "rejected";
  // Added barangay field for emergency contacts filtering
  barangay?: string;
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
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

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
      }
    });

    return unsubscribe;
  }, []);

  // Real-time profile updates
  useEffect(() => {
    if (!user) return;

    const userDocRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const profileData = docSnapshot.data() as Omit<UserProfile, "uid">;
          setUserProfile({
            uid: user.uid,
            ...profileData,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
          });
        } else {
          console.log("User profile document does not exist");
          setUserProfile({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            role: "resident",
            status: "pending",
            // Default barangay can be null until user sets it during registration
            barangay: undefined,
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
          barangay: undefined,
        });
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const fetchUserProfile = async (uid: string) => {
    try {
      setLoading(true);
      const userDocRef = doc(db, "users", uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const profileData = userDoc.data() as Omit<UserProfile, "uid">;
        setUserProfile({
          uid,
          ...profileData,
          email: user?.email || null,
          displayName: user?.displayName || null,
          photoURL: user?.photoURL || null,
        });
        
        // Log barangay for debugging emergency contacts
        if (profileData.barangay) {
          console.log("User barangay:", profileData.barangay);
        } else {
          console.log("User barangay not set");
        }
      } else {
        console.log("User profile document does not exist, creating basic profile");
        setUserProfile({
          uid,
          email: user?.email || null,
          displayName: user?.displayName || null,
          photoURL: user?.photoURL || null,
          role: "resident",
          status: "pending",
          barangay: undefined,
        });
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
        barangay: undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchUserProfile(user.uid);
    }
  };

  const isAuthenticated = !!user;
  const isAdmin = userProfile?.role === "admin" || false;
  const isStaff = ["admin", "monitor", "rescuer"].includes(userProfile?.role || "");

  const value = {
    user,
    userProfile,
    loading,
    isAuthenticated,
    isAdmin,
    isStaff,
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