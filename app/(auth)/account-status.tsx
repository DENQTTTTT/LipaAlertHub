import PrimaryButton from "@/components/PrimaryButton";
import { useAuth } from "@/hooks/useAuth";
import { logout } from "@/services/auth";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    Alert,
    Image,
    SafeAreaView,
    StyleSheet,
    Text,
    View,
} from "react-native";

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

    switch (status) {
      case "pending":
        return {
          title: "Profile Under Review",
          message: "Your profile is still under review by the Admin. Please wait for approval. You will receive an email notification once reviewed.",
          icon: "⏳",
          bgColor: "#f39c12",
        };
      case "declined":
        return {
          title: "Profile Declined",
          message: `Your profile has been declined.${declineReason ? ` Reason: ${declineReason}.` : ""} Please contact support if you believe this is a mistake.`,
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
      {/* Header with logo and app name */}
      <View style={styles.header}>
        <Image
        source={require("../../assets/images/logo.png")} 
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.appName}>LipaAlertHub</Text>
      </View>

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
            <Text style={styles.userInfoLabel}>Account:</Text>
            <Text style={styles.userInfoValue}>{userProfile?.email}</Text>
            <Text style={styles.userInfoLabel}>Name:</Text>
            <Text style={styles.userInfoValue}>{userProfile?.name || user?.displayName}</Text>
            <Text style={styles.userInfoLabel}>Registration Date:</Text>
            <Text style={styles.userInfoValue}>
              {userProfile?.createdAt?.toDate?.()?.toLocaleDateString() || "N/A"}
            </Text>
          </View>

          {/* Support Contact */}
          <View style={styles.supportInfo}>
            <Text style={styles.supportText}>
              Need help? Contact our support team:
            </Text>
            <Text style={styles.supportContact}>support@lipaalerthub.com</Text>
          </View>

          {/* Logout Button */}
          <PrimaryButton
            title="Logout"
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#d73527", // Red background like dashboard
  },
  header: {
    alignItems: "center",
    paddingTop: 20,
    paddingBottom: 30,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 10,
  },
  appName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
  },
  cardContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 15,
    padding: 25,
    borderTopWidth: 5,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statusHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  statusIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#2c3e50",
    textAlign: "center",
  },
  statusMessage: {
    fontSize: 16,
    color: "#34495e",
    lineHeight: 24,
    textAlign: "center",
    marginBottom: 25,
  },
  userInfo: {
    backgroundColor: "#f8f9fa",
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  userInfoLabel: {
    fontSize: 12,
    color: "#7f8c8d",
    marginTop: 8,
    fontWeight: "600",
  },
  userInfoValue: {
    fontSize: 14,
    color: "#2c3e50",
    marginBottom: 5,
  },
  supportInfo: {
    borderTopWidth: 1,
    borderTopColor: "#ecf0f1",
    paddingTop: 20,
    marginBottom: 25,
    alignItems: "center",
  },
  supportText: {
    fontSize: 14,
    color: "#7f8c8d",
    marginBottom: 5,
  },
  supportContact: {
    fontSize: 16,
    color: "#3498db",
    fontWeight: "600",
  },
  logoutButton: {
    backgroundColor: "#e74c3c",
    marginTop: 10,
  },
  footer: {
    padding: 20,
    alignItems: "center",
  },
  footerText: {
    color: "white",
    fontSize: 14,
    textAlign: "center",
    opacity: 0.9,
  },
});