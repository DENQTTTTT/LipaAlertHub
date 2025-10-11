// app/(auth)/suspended.tsx - Account Suspension/Ban Screen
import { auth } from "@/services/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import React, { useEffect, useState } from "react";
import {
    Image,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";

export default function SuspendedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const isPermanent = params.isPermanent === "true";
  const suspensionUntil = params.suspensionUntil ? new Date(params.suspensionUntil as string) : null;
  const reason = params.reason as string || "Violation of community guidelines";
  const strikes = parseInt(params.strikes as string) || 0;
  const warnings = parseInt(params.warnings as string) || 0;

  const [timeRemaining, setTimeRemaining] = useState("");

  useEffect(() => {
    if (!isPermanent && suspensionUntil) {
      const interval = setInterval(() => {
        const now = new Date();
        const diff = suspensionUntil.getTime() - now.getTime();
        
        if (diff <= 0) {
          setTimeRemaining("Suspension ended");
          clearInterval(interval);
          // Redirect to login to refresh status
          handleLogout();
        } else {
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          
          if (days > 0) {
            setTimeRemaining(`${days} day${days > 1 ? 's' : ''}, ${hours} hour${hours > 1 ? 's' : ''}`);
          } else if (hours > 0) {
            setTimeRemaining(`${hours} hour${hours > 1 ? 's' : ''}, ${minutes} minute${minutes > 1 ? 's' : ''}`);
          } else {
            setTimeRemaining(`${minutes} minute${minutes > 1 ? 's' : ''}`);
          }
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isPermanent, suspensionUntil]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/(auth)/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#f8f9fa" barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image 
            source={require('../../assets/images/logo.png')} 
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
      >
        {/* Main Icon */}
        <View style={styles.iconContainer}>
          <View style={[styles.iconCircle, isPermanent && styles.banIconCircle]}>
            <Ionicons 
              name={isPermanent ? "close-circle" : "time"} 
              size={80} 
              color={isPermanent ? "#dc3545" : "#ff9800"} 
            />
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>
          {isPermanent ? "Account Permanently Banned" : "Account Temporarily Suspended"}
        </Text>

        {/* Time Remaining (for temporary suspension) */}
        {!isPermanent && suspensionUntil && (
          <View style={styles.timeCard}>
            <Text style={styles.timeLabel}>Suspension ends in</Text>
            <Text style={styles.timeValue}>{timeRemaining}</Text>
            <Text style={styles.timeDate}>
              {suspensionUntil.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              })}
            </Text>
          </View>
        )}

        {/* Violation Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Violation Summary</Text>
          
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryIcon}>🔸</Text>
              <Text style={styles.summaryLabel}>Warnings</Text>
              <Text style={styles.summaryValue}>{warnings}</Text>
            </View>
            
            <View style={styles.summarySeparator} />
            
            <View style={styles.summaryItem}>
              <Text style={styles.summaryIcon}>🔺</Text>
              <Text style={styles.summaryLabel}>Strikes</Text>
              <Text style={styles.summaryValue}>{strikes}</Text>
            </View>
          </View>
        </View>

        {/* Reason Card */}
        <View style={styles.reasonCard}>
          <View style={styles.reasonHeader}>
            <Ionicons name="information-circle" size={24} color="#e74c3c" />
            <Text style={styles.reasonTitle}>Reason for {isPermanent ? "Ban" : "Suspension"}</Text>
          </View>
          <Text style={styles.reasonText}>{reason}</Text>
        </View>

        {/* Policy Info */}
        <View style={styles.policyCard}>
          <Text style={styles.policyTitle}>Community Guidelines</Text>
          <Text style={styles.policyText}>
            {isPermanent 
              ? "Your account has been permanently banned due to multiple violations of our community guidelines. This decision is final."
              : "Your account has been temporarily suspended. During this time, you will not be able to access the app. Please review our community guidelines to avoid future violations."
            }
          </Text>
        </View>

        {/* Contact Support */}
        <View style={styles.supportCard}>
          <Ionicons name="mail" size={20} color="#3498db" />
          <Text style={styles.supportText}>
            If you believe this action was taken in error, please contact our support team for review.
          </Text>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={20} color="#fff" style={styles.buttonIcon} />
          <Text style={styles.buttonText}>Return to Login</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
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
    padding: 20,
    paddingBottom: 40,
  },
  iconContainer: {
    alignItems: 'center',
    marginVertical: 30,
  },
  iconCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "#fff3cd",
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  banIconCircle: {
    backgroundColor: "#f8d7da",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  timeCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  timeLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  timeValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#ff9800",
    marginBottom: 8,
  },
  timeDate: {
    fontSize: 14,
    color: "#666",
  },
  summaryCard: {
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
  summaryTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 15,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
  },
  summarySeparator: {
    width: 1,
    backgroundColor: "#e0e0e0",
    marginHorizontal: 20,
  },
  reasonCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderLeftWidth: 4,
    borderLeftColor: "#e74c3c",
  },
  reasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reasonTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginLeft: 8,
  },
  reasonText: {
    fontSize: 15,
    color: "#555",
    lineHeight: 22,
  },
  policyCard: {
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
  policyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
  },
  policyText: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  supportCard: {
    backgroundColor: "#e3f2fd",
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  supportText: {
    flex: 1,
    fontSize: 14,
    color: "#1976d2",
    marginLeft: 10,
    lineHeight: 20,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: "#dc3545",
    paddingVertical: 14,
    borderRadius: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  buttonIcon: {
    marginRight: 6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});