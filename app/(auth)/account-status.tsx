import PrimaryButton from "@/components/PrimaryButton";
import { useAuth } from "@/hooks/useAuth";
import { logout } from "@/services/auth";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

const { width, height } = Dimensions.get('window');

const getResponsiveSize = (small: number, medium: number, large: number) => {
  if (width > 600) return large * 1.2;
  if (width >= 414) return large;
  if (width >= 380) return medium;
  return small;
};

export default function AccountStatusScreen() {
  const { userProfile, user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Redirect to main if user becomes active
  useEffect(() => {
    if (userProfile?.status === "active") {
      router.replace("/(main)");
    }
  }, [userProfile?.status, router]);

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
              setLoading(true);
              await logout();
              router.replace("/(auth)/login");
            } catch (error) {
              console.error("Logout error:", error);
              Alert.alert("Error", "Failed to logout. Please try again.");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // Determine the content based on status
  const getStatusContent = () => {
    const status = userProfile?.status;
    const declineReason = userProfile?.declineReason;
    const duplicateFlag = userProfile?.duplicateFlag;

    switch (status) {
      case "pending":
        return {
          title: "Profile Under Review",
          message: duplicateFlag 
            ? "Your account is under additional review due to a potential duplicate name in your barangay. This process may take longer than usual."
            : "Your profile is currently under review by our admin team. Please wait for approval. You will receive an email notification once reviewed.",
          icon: "⏳",
          bgColor: "#f39c12",
        };
      case "under_review":
        return {
          title: "Additional Review Required",
          message: "Your account requires additional verification due to potential duplicate information. Our team is reviewing your details carefully.",
          icon: "🔍",
          bgColor: "#f39c12",
        };
      case "declined":
        return {
          title: "Profile Declined",
          message: `Your profile registration has been declined.${declineReason ? ` Reason: ${declineReason}` : ""} Please contact support if you believe this is a mistake.`,
          icon: "❌",
          bgColor: "#e74c3c",
        };
      default:
        return {
          title: "Account Status Unknown",
          message: "Unable to determine your account status. Please contact support for assistance.",
          icon: "❓",
          bgColor: "#95a5a6",
        };
    }
  };

  const statusContent = getStatusContent();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#d73527" barStyle="light-content" />
      
      {/* Header with logo and app name */}
      <View style={styles.header}>
        <Image
          source={require("../../assets/images/logo.png")} 
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.appName}>LipaAlertHub</Text>
      </View>

      <ScrollView 
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Status Card */}
        <View style={styles.cardContainer}>
          <View style={[styles.card, { borderTopColor: statusContent.bgColor }]}>
            {/* Status Icon and Title */}
            <View style={styles.statusHeader}>
              <Text style={styles.statusIcon}>{statusContent.icon}</Text>
              <Text style={styles.statusTitle}>{statusContent.title}</Text>
            </View>

            {/* Status Message */}
            <Text style={styles.statusMessage}>{statusContent.message}</Text>

            {/* User Info */}
            <View style={styles.userInfo}>
              <Text style={styles.userInfoLabel}>Account Email:</Text>
              <Text style={styles.userInfoValue}>{userProfile?.email || user?.email}</Text>
              
              <Text style={styles.userInfoLabel}>Full Name:</Text>
              <Text style={styles.userInfoValue}>{userProfile?.name || user?.displayName || "Not provided"}</Text>
              
              <Text style={styles.userInfoLabel}>Barangay:</Text>
              <Text style={styles.userInfoValue}>{userProfile?.barangay || "Not specified"}</Text>
              
              <Text style={styles.userInfoLabel}>Registration Date:</Text>
              <Text style={styles.userInfoValue}>
                {userProfile?.createdAt?.toDate?.()?.toLocaleDateString() || 
                 userProfile?.createdAt?.toLocaleDateString?.() || 
                 "N/A"}
              </Text>

              <Text style={styles.userInfoLabel}>Current Status:</Text>
              <Text style={[styles.userInfoValue, { color: statusContent.bgColor, fontWeight: '700' }]}>
                {userProfile?.status?.toUpperCase() || "UNKNOWN"}
              </Text>
            </View>

            {/* Support Contact */}
            <View style={styles.supportInfo}>
              <Text style={styles.supportText}>
                Need help? Contact our support team:
              </Text>
              <Text style={styles.supportContact}>support@lipaalerthub.com</Text>
              <Text style={styles.supportPhone}>(+63) 123-456-7890</Text>
            </View>

            {/* Logout Button */}
            <PrimaryButton
              title={loading ? "Logging Out..." : "Logout"}
              onPress={handleLogout}
              loading={loading}
              style={styles.logoutButton}
            />
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Thank you for your patience while we review your account.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#d73527",
  },
  header: {
    alignItems: "center",
    paddingTop: getResponsiveSize(15, 20, 25),
    paddingBottom: getResponsiveSize(20, 25, 30),
    paddingHorizontal: 20,
  },
  logo: {
    width: getResponsiveSize(60, 70, 80),
    height: getResponsiveSize(60, 70, 80),
    marginBottom: getResponsiveSize(8, 10, 12),
  },
  appName: {
    fontSize: getResponsiveSize(20, 22, 24),
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: getResponsiveSize(20, 25, 30),
  },
  cardContainer: {
    paddingHorizontal: getResponsiveSize(15, 18, 20),
    paddingTop: getResponsiveSize(10, 15, 20),
  },
  card: {
    backgroundColor: "white",
    borderRadius: getResponsiveSize(12, 14, 15),
    padding: getResponsiveSize(20, 23, 25),
    borderTopWidth: 5,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    marginBottom: getResponsiveSize(15, 20, 25),
  },
  statusHeader: {
    alignItems: "center",
    marginBottom: getResponsiveSize(15, 18, 20),
  },
  statusIcon: {
    fontSize: getResponsiveSize(40, 45, 48),
    marginBottom: getResponsiveSize(8, 10, 12),
  },
  statusTitle: {
    fontSize: getResponsiveSize(18, 20, 22),
    fontWeight: "bold",
    color: "#2c3e50",
    textAlign: "center",
    lineHeight: getResponsiveSize(24, 26, 28),
  },
  statusMessage: {
    fontSize: getResponsiveSize(14, 15, 16),
    color: "#34495e",
    lineHeight: getResponsiveSize(20, 22, 24),
    textAlign: "center",
    marginBottom: getResponsiveSize(20, 23, 25),
  },
  userInfo: {
    backgroundColor: "#f8f9fa",
    padding: getResponsiveSize(12, 14, 15),
    borderRadius: getResponsiveSize(8, 9, 10),
    marginBottom: getResponsiveSize(15, 18, 20),
  },
  userInfoLabel: {
    fontSize: getResponsiveSize(11, 12, 13),
    color: "#7f8c8d",
    marginTop: getResponsiveSize(6, 7, 8),
    fontWeight: "600",
  },
  userInfoValue: {
    fontSize: getResponsiveSize(13, 14, 15),
    color: "#2c3e50",
    marginBottom: getResponsiveSize(4, 5, 6),
    lineHeight: getResponsiveSize(18, 20, 22),
  },
  supportInfo: {
    borderTopWidth: 1,
    borderTopColor: "#ecf0f1",
    paddingTop: getResponsiveSize(15, 18, 20),
    marginBottom: getResponsiveSize(20, 23, 25),
    alignItems: "center",
  },
  supportText: {
    fontSize: getResponsiveSize(12, 13, 14),
    color: "#7f8c8d",
    marginBottom: getResponsiveSize(6, 8, 10),
    textAlign: 'center',
  },
  supportContact: {
    fontSize: getResponsiveSize(14, 15, 16),
    color: "#3498db",
    fontWeight: "600",
    marginBottom: getResponsiveSize(4, 5, 6),
  },
  supportPhone: {
    fontSize: getResponsiveSize(12, 13, 14),
    color: "#3498db",
    fontWeight: "500",
  },
  logoutButton: {
    backgroundColor: "#e74c3c",
    marginTop: getResponsiveSize(8, 10, 12),
    paddingVertical: getResponsiveSize(12, 14, 16),
  },
  footer: {
    padding: getResponsiveSize(15, 18, 20),
    alignItems: "center",
    marginTop: 'auto',
  },
  footerText: {
    color: "white",
    fontSize: getResponsiveSize(12, 13, 14),
    textAlign: "center",
    opacity: 0.9,
    lineHeight: getResponsiveSize(16, 18, 20),
  },
});