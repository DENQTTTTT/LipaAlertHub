// app/(main)/profile/index.tsx - FIXED VERSION
import { auth, db } from "@/services/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

interface ViolationData {
  warnings: number;
  strikes: number;
  lastViolationReason?: string;
  lastViolationDate?: any;
  suspensionUntil?: any;
  status?: string;
}

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [originalProfile, setOriginalProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [violations, setViolations] = useState<ViolationData>({
    warnings: 0,
    strikes: 0
  });

  // Track listeners and component mount state
  const profileUnsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);
  const isLoggingOutRef = useRef(false);

  // Track component mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      // Clean up previous profile listener when auth state changes
      if (profileUnsubscribeRef.current) {
        profileUnsubscribeRef.current();
        profileUnsubscribeRef.current = null;
      }

      if (u && !isLoggingOutRef.current) {
        if (isMountedRef.current) {
          setUser(u);
          setupProfileListener(u.uid);
        }
      } else {
        // User logged out - clean up state
        if (isMountedRef.current && !isLoggingOutRef.current) {
          setUser(null);
          setProfile(null);
          setOriginalProfile(null);
          setLoading(false);
          router.replace("/(auth)/login");
        }
      }
    });

    return () => {
      // Clean up auth listener
      unsubscribe();
      // Clean up profile listener
      if (profileUnsubscribeRef.current) {
        profileUnsubscribeRef.current();
        profileUnsubscribeRef.current = null;
      }
    };
  }, []);

  const setupProfileListener = (uid: string) => {
    // Clean up any existing listener first
    if (profileUnsubscribeRef.current) {
      profileUnsubscribeRef.current();
      profileUnsubscribeRef.current = null;
    }

    const unsubscribe = onSnapshot(
      doc(db, "users", uid),
      (docSnap) => {
        // Only update state if component is still mounted and not logging out
        if (!isMountedRef.current || isLoggingOutRef.current) {
          return;
        }

        if (docSnap.exists()) {
          const data = docSnap.data();
          setProfile(data);
          setOriginalProfile(data);
          setViolations({
            warnings: data.warnings || 0,
            strikes: data.strikes || 0,
            lastViolationReason: data.lastViolationReason,
            lastViolationDate: data.lastViolationDate,
            suspensionUntil: data.suspensionUntil,
            status: data.status
          });
        }
        setLoading(false);
      },
      (error) => {
        console.error("Profile listener error:", error);
        // Only show error if not logging out
        if (isMountedRef.current && !isLoggingOutRef.current) {
          setLoading(false);
        }
      }
    );

    // Store the unsubscribe function
    profileUnsubscribeRef.current = unsubscribe;
    return unsubscribe;
  };

  const handleSave = async () => {
    if (!user || isLoggingOutRef.current) return;
    
    if (!profile.name?.trim() || !profile.number?.trim() || !profile.barangay?.trim()) {
      Alert.alert("Error", "Please fill in all required fields.");
      return;
    }

    try {
      setSaving(true);
      
      await updateDoc(doc(db, "users", user.uid), {
        name: profile.name.trim(),
        number: profile.number.trim(),
        phoneNumber: profile.number.trim(),
        barangay: profile.barangay.trim(),
        updatedAt: new Date()
      });
      
      if (isMountedRef.current && !isLoggingOutRef.current) {
        Alert.alert("Success", "Profile updated successfully!");
        
        setOriginalProfile({
          ...originalProfile,
          name: profile.name.trim(),
          number: profile.number.trim(),
          phoneNumber: profile.number.trim(),
          barangay: profile.barangay.trim()
        });
      }
      
    } catch (err: any) {
      console.error("Update error:", err);
      
      if (isMountedRef.current && !isLoggingOutRef.current) {
        let errorMessage = "Could not update profile. Please try again.";
        if (err.code === 'permission-denied') {
          errorMessage = "You don't have permission to update this information.";
        }
        
        Alert.alert("Error", errorMessage);
      }
    } finally {
      if (isMountedRef.current && !isLoggingOutRef.current) {
        setSaving(false);
      }
    }
  };

  const handleChangePassword = () => {
    if (!isLoggingOutRef.current) {
      router.push("/(main)/profile/change-password");
    }
  };

  const handleViewAccountStatus = () => {
    if (!isLoggingOutRef.current) {
      router.push("/(main)/profile/strikes");
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            try {
              // Set logging out flag BEFORE starting logout
              isLoggingOutRef.current = true;
              
              // Clean up profile listener immediately
              if (profileUnsubscribeRef.current) {
                profileUnsubscribeRef.current();
                profileUnsubscribeRef.current = null;
              }
              
              // Clear state immediately
              setProfile(null);
              setOriginalProfile(null);
              setViolations({ warnings: 0, strikes: 0 });
              
              // Sign out from Firebase
              await signOut(auth);
              
              // Navigate to login
              if (isMountedRef.current) {
                router.replace("/(auth)/login");
              }
            } catch (error) {
              console.error("Logout error:", error);
              
              // Reset logging out flag on error
              isLoggingOutRef.current = false;
              
              if (isMountedRef.current) {
                Alert.alert("Error", "Failed to logout. Please try again.");
              }
            }
          }
        }
      ]
    );
  };

  const getStatusBadge = () => {
    const status = violations.status || profile?.status;
    
    if (status === "banned") {
      return { text: "🚫 Banned", color: "#dc3545", bgColor: "#f8d7da" };
    }
    
    if (violations.suspensionUntil) {
      try {
        const suspensionDate = violations.suspensionUntil.toDate 
          ? violations.suspensionUntil.toDate() 
          : new Date(violations.suspensionUntil);
        
        if (suspensionDate > new Date()) {
          return { text: "⏸ Suspended", color: "#ff9800", bgColor: "#fff3cd" };
        }
      } catch (error) {
        console.error("Error parsing suspension date:", error);
      }
    }
    
    if (status === "active") {
      return { text: "✓ Active", color: "#28a745", bgColor: "#d4edda" };
    }
    
    if (status === "pending" || status === "under_review") {
      return { text: "⏳ Pending", color: "#856404", bgColor: "#fff3cd" };
    }
    
    return { text: "✓ Active", color: "#28a745", bgColor: "#d4edda" };
  };

  const statusBadge = getStatusBadge();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#e74c3c" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#f8f9fa" barStyle="dark-content" />
      
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image 
            source={require('../../../assets/images/logo.png')} 
            style={styles.logoImage} 
            resizeMode="contain"
          />
          <Text style={styles.logoText}>LipaAlertHub</Text>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollContainer} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.avatarSection}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={50} color="#666" />
            </View>
          </View>
          <Text style={styles.userName}>{profile?.name || "User"}</Text>
          
          <View style={[styles.statusBadge, { backgroundColor: statusBadge.bgColor }]}>
            <Text style={[styles.statusText, { color: statusBadge.color }]}>
              {statusBadge.text}
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.accountStatusButton}
          onPress={handleViewAccountStatus}
          activeOpacity={0.7}
        >
          <View style={styles.statusButtonLeft}>
            <View style={styles.statusIconCircle}>
              <Ionicons name="shield-checkmark" size={24} color="#3498db" />
            </View>
            <View style={styles.statusButtonText}>
              <Text style={styles.statusButtonTitle}>Account Status</Text>
              <Text style={styles.statusButtonSubtitle}>
                {violations.warnings + violations.strikes > 0 
                  ? `${violations.warnings} warnings, ${violations.strikes} strikes`
                  : "No violations"}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#999" />
        </TouchableOpacity>

        <View style={styles.formContainer}>
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>NAME</Text>
            <TextInput
              style={styles.textInput}
              value={profile?.name || ""}
              onChangeText={(text) => setProfile({ ...profile, name: text })}
              placeholder="Enter your name"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>EMAIL</Text>
            <TextInput
              style={[styles.textInput, styles.disabledInput]}
              value={profile?.email || user?.email || ""}
              editable={false}
              placeholder="Email address"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>PASSWORD</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.textInput, styles.disabledInput, styles.passwordInput]}
                value="••••••••"
                editable={false}
                secureTextEntry
              />
              <TouchableOpacity 
                style={styles.changePasswordLink}
                onPress={handleChangePassword}
              >
                <Text style={styles.changeLinkText}>Change</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>NUMBER</Text>
            <TextInput
              style={styles.textInput}
              value={profile?.number || ""}
              onChangeText={(text) => setProfile({ ...profile, number: text })}
              placeholder="Enter phone number"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
            />
          </View>

          <View style={[styles.fieldContainer, styles.lastField]}>
            <Text style={styles.fieldLabel}>BARANGAY</Text>
            <TextInput
              style={styles.textInput}
              value={profile?.barangay || ""}
              onChangeText={(text) => setProfile({ ...profile, barangay: text })}
              placeholder="Enter barangay"
              placeholderTextColor="#999"
            />
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.actionButton, styles.saveButton]}
            onPress={handleSave}
            disabled={saving || isLoggingOutRef.current}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color="#fff" style={styles.buttonIcon} />
                <Text style={styles.buttonText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.logoutButton]}
            onPress={handleLogout}
            disabled={isLoggingOutRef.current}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color="#fff" style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8f9fa" },
  loadingText: { marginTop: 10, fontSize: 16, color: "#666", fontWeight: "500" },
  header: {
    backgroundColor: "#fff",
    paddingTop: Platform.OS === 'ios' ? 50 : 25,
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  logoContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  logoImage: { width: 30, height: 30, marginRight: 10 },
  logoText: { fontSize: 18, fontWeight: "700", color: "#333" },
  scrollContainer: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 140 : 120 },
  avatarSection: { alignItems: 'center', paddingVertical: 20 },
  avatarContainer: { marginBottom: 15 },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#fff",
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: "#e0e0e0",
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  userName: { fontSize: 24, fontWeight: "700", color: "#333", textAlign: 'center', marginBottom: 8 },
  statusBadge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 15 },
  statusText: { fontSize: 13, fontWeight: "600" },
  accountStatusButton: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginTop: 15,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderLeftWidth: 4,
    borderLeftColor: "#3498db"
  },
  statusButtonLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  statusIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e3f2fd",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12
  },
  statusButtonText: { flex: 1 },
  statusButtonTitle: { fontSize: 16, fontWeight: "600", color: "#333", marginBottom: 4 },
  statusButtonSubtitle: { fontSize: 13, color: "#666" },
  formContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  fieldContainer: { marginBottom: 18 },
  lastField: { marginBottom: 0 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  textInput: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 15,
    fontSize: 16,
    color: "#333",
    borderWidth: 1,
    borderColor: "#e0e0e0"
  },
  disabledInput: { backgroundColor: "#f0f0f0", color: "#999" },
  passwordContainer: { position: "relative" },
  passwordInput: { paddingRight: 80 },
  changePasswordLink: {
    position: "absolute",
    right: 15,
    top: 0,
    bottom: 0,
    justifyContent: "center"
  },
  changeLinkText: { color: "#3498db", fontSize: 14, fontWeight: "600" },
  buttonContainer: { marginTop: 25, gap: 15, marginBottom: 40 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2
  },
  saveButton: { backgroundColor: "#e74c3c" },
  logoutButton: { backgroundColor: "#dc3545" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  buttonIcon: { marginRight: 6 }
});