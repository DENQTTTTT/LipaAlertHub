// hooks/useAuth.tsx
import { auth, db } from "@/services/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useState } from "react";

type UserProfile = {
  name: string;
  email: string;
  role: string;
  status: string;
  number?: string;
  createdAt?: Date;
  updatedAt?: Date;
  deviceType?: string;
};

type AuthContextType = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  hasRole: (roles: string[]) => boolean;
  isActive: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      
      if (u) {
        try {
          // Get user profile from Firestore
          const userDoc = await getDoc(doc(db, "users", u.uid));
          
          if (userDoc.exists()) {
            setProfile(userDoc.data() as UserProfile);
          } else {
            // Create basic profile for existing users without one
            const basicProfile: UserProfile = {
              name: u.displayName || 'User',
              email: u.email || '',
              role: 'resident',
              status: 'active',
              createdAt: new Date(),
              updatedAt: new Date(),
              deviceType: 'mobile'
            };
            
            await setDoc(doc(db, "users", u.uid), basicProfile);
            setProfile(basicProfile);
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
          // Set basic profile even if Firestore fails
          setProfile({
            name: u.displayName || 'User',
            email: u.email || '',
            role: 'resident',
            status: 'active'
          });
        }
      } else {
        setProfile(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const hasRole = (roles: string[]): boolean => {
    if (!profile) return false;
    return roles.includes(profile.role);
  };

  const isActive = profile?.status === 'active';

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        profile, 
        loading, 
        hasRole, 
        isActive 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}