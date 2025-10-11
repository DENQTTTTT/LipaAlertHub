// app/(main)/profile/index.tsx - Complete with Violations & Real-time Updates
import { auth, db } from "@/services/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [violations, setViolations] = useState<ViolationData>({
    warnings: 0,
    strikes: 0
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        // Set up real-time listener instead of just fetching once
        setupProfileListener(u.uid);
      } else {
        router.replace("/(auth)/login");
      }
    });
    return unsubscribe;
  }, []);

  // Real-time profile listener
  const setupProfileListener = (uid: string) => {
    const unsubscribe = onSnapshot(
      doc(db, "users", uid),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setProfile(data);
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
        setLoading(false);
      }
    );
    return unsubscribe;
  };

  const handleSave = async () => {
    if (!user) return;
    
    // Validate fields
    if (!profile.name?.trim() || !profile.number?.trim() || !profile.barangay?.trim()) {
      Alert.alert("Error", "Please fill in all required fields.");
      return;
    }

    try {
      setSaving(true);
      await updateDoc(doc(db, "users", user.uid), {
        name: profile.name.trim(),
        number: profile.number.trim(),
        barangay: profile.barangay.trim(),
        updatedAt: new Date(),
      });
      Alert.alert("Success", "Profile updated successfully!");
    } catch (err) {
      console.error("Update error:", err);
      Alert.alert("Error", "Could not update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = () => {
    router.push("/(main)/profile/change-password");
  };

  const handleViewViolations = () => {
    router.push("/(main)/profile/strikes");
  };

  const handleLogout = async () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            try {
              await signOut(auth);
              router.replace("/(auth)/login");
            } catch (error) {
              console.error("Logout error:", error);
              Alert.alert("Error", "Failed to logout. Please try again.");
            }
          },
        },
      ]
    );
  };

  // Get status badge info
  const getStatusBadge = () => {
    const status = violations.status || profile?.status;
    
    if (status === "banned") {
      return { text: "🚫 Banned", color: "#dc3545", bgColor: "#f8d7da" };
    }
    
    if (violations.suspensionUntil) {
      const suspensionDate = violations.suspensionUntil.toDate 
        ? violations.suspensionUntil.toDate() 
        : new Date(violations.suspensionUntil);
      
      if (suspensionDate > new Date()) {
        return { text: "⏸ Suspended", color: "#ff9800", bgColor: "#fff3cd" };
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
  const hasViolations = violations.warnings > 0 || violations.strikes > 0;

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
      
      {/* Header */}
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

      {/* Main Content Container */}
      <ScrollView 
        style={styles.scrollContainer} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Profile Avatar Section */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={50} color="#666" />
            </View>
          </View>
          <Text style={styles.userName}>{profile?.name || "User"}</Text>
          
          {/* Status Badge */}
          <View style={[styles.statusBadge, { backgroundColor: statusBadge.bgColor }]}>
            <Text style={[styles.statusText, { color: statusBadge.color }]}>
              {statusBadge.text}
            </Text>
          </View>
        </View>

        {/* Violations Summary Card */}
        {hasViolations && (
          <TouchableOpacity 
            style={styles.violationsCard}
            onPress={handleViewViolations}
            activeOpacity={0.7}
          >
            <View style={styles.violationsHeader}>
              <Ionicons name="alert-circle" size={24} color="#e74c3c" />
              <Text style={styles.violationsTitle}>Account Violations</Text>
            </View>
            
            <View style={styles.violationsContent}>
              <View style={styles.violationItem}>
                <Text style={styles.violationIcon}>🔸</Text>
                <Text style={styles.violationLabel}>Warnings</Text>
                <Text style={styles.violationValue}>{violations.warnings}</Text>
              </View>
              
              <View style={styles.violationSeparator} />
              
              <View style={styles.violationItem}>
                <Text style={styles.violationIcon}>🔺</Text>
                <Text style={styles.violationLabel}>Strikes</Text>
                <Text style={styles.violationValue}>{violations.strikes}</Text>
              </View>
            </View>

            {violations.lastViolationReason && (
              <View style={styles.lastViolation}>
                <Text style={styles.lastViolationLabel}>Latest:</Text>
                <Text style={styles.lastViolationText} numberOfLines={1}>
                  {violations.lastViolationReason}
                </Text>
              </View>
            )}

            <View style={styles.violationsFooter}>
              <Text style={styles.violationsLink}>View Full History</Text>
              <Ionicons name="chevron-forward" size={18} color="#e74c3c" />
            </View>
          </TouchableOpacity>
        )}

        {/* Warning Message for High Violations */}
        {violations.strikes >= 2 && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning" size={20} color="#dc3545" />
            <Text style={styles.warningText}>
              {violations.strikes === 2 
                ? "Warning: One more strike will result in a permanent ban."
                : "Your account has been flagged. Please review community guidelines."}
            </Text>
          </View>
        )}

        {/* Form Fields Container */}
        <View style={styles.formContainer}>
          {/* Name Field */}
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

          {/* Email Field */}
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

          {/* Password Field */}
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

          {/* Number Field */}
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

          {/* Barangay Field */}
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

        {/* Action Buttons Container */}
        <View style={styles.buttonContainer}>
          {/* Save Changes Button */}
          <TouchableOpacity
            style={[styles.actionButton, styles.saveButton]}
            onPress={handleSave}
            disabled={saving}
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

          {/* Logout Button */}
          <TouchableOpacity
            style={[styles.actionButton, styles.logoutButton]}
            onPress={handleLogout}
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
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
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
    shadowRadius: 4,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 30,
    height: 30,
    marginRight: 10,
  },
  logoText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 140 : 120,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  avatarContainer: {
    marginBottom: 15,
  },
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
    shadowRadius: 4,
  },
  userName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
    textAlign: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 15,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
  },
  violationsCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderLeftWidth: 4,
    borderLeftColor: "#e74c3c",
  },
  violationsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  violationsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginLeft: 8,
  },
  violationsContent: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
  },
  violationItem: {
    alignItems: "center",
    flex: 1,
  },
  violationIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  violationLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  violationValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#e74c3c",
  },
  violationSeparator: {
    width: 1,
    backgroundColor: "#e0e0e0",
    marginHorizontal: 12,
  },
  lastViolation: {
    backgroundColor: "#fff3cd",
    borderRadius: 6,
    padding: 10,
    marginTop: 10,
    marginBottom: 8,
  },
  lastViolationLabel: {
    fontSize: 11,
    color: "#856404",
    fontWeight: "600",
    marginBottom: 3,
  },
  lastViolationText: {
    fontSize: 13,
    color: "#856404",
  },
  violationsFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  violationsLink: {
    fontSize: 14,
    color: "#e74c3c",
    fontWeight: "600",
    marginRight: 4,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8d7da",
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    borderLeftWidth: 3,
    borderLeftColor: "#dc3545",
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: "#721c24",
    marginLeft: 10,
    fontWeight: "500",
  },
  formContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  fieldContainer: {
    marginBottom: 18,
  },
  lastField: {
    marginBottom: 0,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  textInput: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 15,
    fontSize: 16,
    color: "#333",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  disabledInput: {
    backgroundColor: "#f0f0f0",
    color: "#999",
  },
  passwordContainer: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 80,
  },
  changePasswordLink: {
    position: "absolute",
    right: 15,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  changeLinkText: {
    color: "#3498db",
    fontSize: 14,
    fontWeight: "600",
  },
  buttonContainer: {
    marginTop: 25,
    gap: 15,
    marginBottom: 40,
  },
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
    shadowRadius: 2,
  },
  saveButton: {
    backgroundColor: "#e74c3c",
  },
  logoutButton: {
    backgroundColor: "#dc3545",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonIcon: {
    marginRight: 6,
  },
});