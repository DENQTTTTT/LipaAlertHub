// app/(main)/profile/strikes.tsx
import { auth, db } from "@/services/firebase";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

interface ViolationData {
  warnings: number;
  strikes: number;
  lastViolationReason: string;
  lastViolationDate: any;
  suspensionUntil: any;
  status: string;
}

export default function StrikesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [violationData, setViolationData] = useState<ViolationData>({
    warnings: 0,
    strikes: 0,
    lastViolationReason: "",
    lastViolationDate: null,
    suspensionUntil: null,
    status: "active"
  });

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.replace("/(auth)/login");
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, "users", user.uid),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setViolationData({
            warnings: data.warnings || 0,
            strikes: data.strikes || 0,
            lastViolationReason: data.lastViolationReason || "",
            lastViolationDate: data.lastViolationDate || null,
            suspensionUntil: data.suspensionUntil || null,
            status: data.status || "active"
          });
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching violation data:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  };

  const getStatusInfo = () => {
    if (violationData.status === "banned") {
      return {
        text: "Permanently Banned",
        color: "#dc3545",
        icon: "close-circle" as const
      };
    }

    if (violationData.suspensionUntil) {
      const suspensionDate = violationData.suspensionUntil.toDate 
        ? violationData.suspensionUntil.toDate() 
        : new Date(violationData.suspensionUntil);
      
      if (suspensionDate > new Date()) {
        return {
          text: `Suspended until ${formatDate(violationData.suspensionUntil)}`,
          color: "#ff9800",
          icon: "time" as const
        };
      }
    }

    return {
      text: "Active",
      color: "#28a745",
      icon: "checkmark-circle" as const
    };
  };

  const statusInfo = getStatusInfo();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#e74c3c" />
        <Text style={styles.loadingText}>Loading violation history...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#f8f9fa" barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        
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
      >
        {/* Title Section */}
        <View style={styles.titleSection}>
          <View style={styles.titleRow}>
            <Ionicons name="alert-circle" size={28} color="#e74c3c" />
            <Text style={styles.title}>Account Violations</Text>
          </View>
          <Text style={styles.subtitle}>
            View your warning and strike history
          </Text>
        </View>

        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Ionicons name={statusInfo.icon} size={24} color={statusInfo.color} />
            <Text style={[styles.statusText, { color: statusInfo.color }]}>
              {statusInfo.text}
            </Text>
          </View>
        </View>

        {/* Violations Summary */}
        <View style={styles.summaryContainer}>
          {/* Warnings */}
          <View style={styles.summaryCard}>
            <View style={styles.iconCircle}>
              <Text style={styles.warningIcon}>🔸</Text>
            </View>
            <Text style={styles.summaryLabel}>Warnings</Text>
            <Text style={styles.summaryValue}>{violationData.warnings}</Text>
          </View>

          {/* Strikes */}
          <View style={styles.summaryCard}>
            <View style={styles.iconCircle}>
              <Text style={styles.strikeIcon}>🔺</Text>
            </View>
            <Text style={styles.summaryLabel}>Strikes</Text>
            <Text style={styles.summaryValue}>{violationData.strikes}</Text>
          </View>
        </View>

        {/* Last Violation Details */}
        {violationData.lastViolationReason && (
          <View style={styles.detailsCard}>
            <Text style={styles.detailsTitle}>Latest Violation</Text>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Reason:</Text>
              <Text style={styles.detailValue}>
                {violationData.lastViolationReason}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Date:</Text>
              <Text style={styles.detailValue}>
                {formatDate(violationData.lastViolationDate)}
              </Text>
            </View>
          </View>
        )}

        {/* Strike Policy Info */}
        <View style={styles.policyCard}>
          <Text style={styles.policyTitle}>Strike Policy</Text>
          
          <View style={styles.policyItem}>
            <View style={styles.policyBullet}>
              <Text style={styles.policyBulletText}>1</Text>
            </View>
            <Text style={styles.policyText}>
              1st Strike: Warning issued
            </Text>
          </View>

          <View style={styles.policyItem}>
            <View style={styles.policyBullet}>
              <Text style={styles.policyBulletText}>2</Text>
            </View>
            <Text style={styles.policyText}>
              2nd Strike: 3-day suspension
            </Text>
          </View>

          <View style={styles.policyItem}>
            <View style={styles.policyBullet}>
              <Text style={styles.policyBulletText}>3</Text>
            </View>
            <Text style={styles.policyText}>
              3rd Strike: Permanent ban
            </Text>
          </View>
        </View>

        {/* Info Message */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color="#3498db" />
          <Text style={styles.infoText}>
            Please follow community guidelines to avoid violations. Contact support if you believe a violation was issued in error.
          </Text>
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
    flexDirection: "row",
    alignItems: "center",
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  backButton: {
    marginRight: 15,
    padding: 5,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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
  titleSection: {
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
    marginLeft: 10,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginLeft: 38,
  },
  statusCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusText: {
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 10,
  },
  summaryContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 5,
    alignItems: "center",
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#f8f9fa",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  warningIcon: {
    fontSize: 24,
  },
  strikeIcon: {
    fontSize: 24,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 5,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#333",
  },
  detailsCard: {
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
  detailsTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 15,
  },
  detailRow: {
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  detailValue: {
    fontSize: 16,
    color: "#333",
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
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 15,
  },
  policyItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  policyBullet: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#e74c3c",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  policyBulletText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  policyText: {
    flex: 1,
    fontSize: 15,
    color: "#333",
  },
  infoCard: {
    backgroundColor: "#e3f2fd",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: "#1976d2",
    marginLeft: 10,
    lineHeight: 20,
  },
});