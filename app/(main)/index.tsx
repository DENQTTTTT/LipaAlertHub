// DASHBOARD
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { FloatingChatButton } from "../../components/FloatingChatButton";
import { useAnnouncements } from "../../hooks/useAnnouncements";
import { useAuth } from "../../hooks/useAuth"; // Adjust path as needed
import { announcementService } from "../../services/announcements";
import { db } from "../../services/firebase"; // Adjust path as needed
import { ChatModal } from "./chat";

const { width, height } = Dimensions.get('window');

interface UserData {
  name: string;
  email: string;
  number: string;
  createdAt: any;
}

export default function HomeScreen() {
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [userName, setUserName] = useState<string>("User"); // Default fallback
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  
  // Use the announcements hook for dashboard (limited to 2)
  const { announcements, loading: announcementsLoading } = useAnnouncements(true);

  // Fetch user data from Firestore
  useEffect(() => {
    const fetchUserData = async () => {
      if (user?.uid) {
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data() as UserData;
            setUserName(userData.name || "User");
          } else {
            console.log("No user document found");
            // Fallback to display name from Firebase Auth if available
            setUserName(user.displayName || "User");
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          // Fallback to display name from Firebase Auth if available
          setUserName(user.displayName || "User");
        }
      }
      setLoading(false);
    };

    fetchUserData();
  }, [user]);

  const handleIncidentReporting = () => {
    router.push("/(main)/report/create");
  };

  const handleEmergencyTips = () => {
    router.push("/(main)/emergency/tips");
  };

  const handleSOS = () => {
    router.push("/(main)/emergency/sos");
  };

  const handleChatCDRRMO = () => {
    // Open chat modal instead of navigating
    setIsChatModalOpen(true);
  };

  const handleForums = () => {
    router.push("/(main)/forum/");
  };

  const handleAnnouncementClick = (announcementId: string) => {
    router.push(`/(main)/announcements/details?id=${announcementId}`);
  };

  const handleViewAllAnnouncements = () => {
    router.push("/(main)/announcements/index");
  };

  // Show loading state if still fetching user data
  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image source={require("../../assets/images/logo.png")} style={styles.logo} />
          <Text style={styles.appName}>LipaAlertHub</Text>
        </View>
        <Text style={styles.welcomeText}>Welcome, {userName}</Text>
      </View>

      {/* Action Buttons Grid */}
      <View style={styles.buttonGrid}>
        {/* First Row - 2 Large Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.largeButton} onPress={handleIncidentReporting}>
            <View style={styles.iconContainer}>
              <Ionicons name="alert-circle" size={24} color="#D32F2F" />
            </View>
            <Text style={styles.largeButtonText}>Incident{'\n'}Reporting</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.largeButton} onPress={handleEmergencyTips}>
            <View style={styles.iconContainer}>
              <Ionicons name="water" size={24} color="#D32F2F" />
            </View>
            <Text style={styles.largeButtonText}>Emergency{'\n'}Tips</Text>
          </TouchableOpacity>
        </View>

        {/* Second Row - 3 Small Buttons */}
        <View style={styles.smallButtonRow}>
          <TouchableOpacity style={styles.smallButton} onPress={handleSOS}>
            <View style={styles.smallIconContainer}>
              <Ionicons name="alert" size={20} color="#D32F2F" />
            </View>
            <Text style={styles.smallButtonText}>SOS</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.smallButton} onPress={handleChatCDRRMO}>
            <View style={styles.smallIconContainer}>
              <Ionicons name="chatbubble-ellipses" size={20} color="#D32F2F" />
            </View>
            <Text style={styles.smallButtonText}>Chat with{'\n'}CDRRMO</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.smallButton} onPress={handleForums}>
            <View style={styles.smallIconContainer}>
              <Ionicons name="chatbubbles" size={20} color="#D32F2F" />
            </View>
            <Text style={styles.smallButtonText}>Forums</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Announcements Section */}
      <View style={styles.announcementsSection}>
        <View style={styles.announcementHeader}>
          <Text style={styles.announcementsTitle}>Announcements</Text>
          {announcements.length > 0 && (
            <TouchableOpacity onPress={handleViewAllAnnouncements}>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {announcementsLoading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading announcements...</Text>
          </View>
        ) : announcements.length > 0 ? (
          announcements.map((announcement) => (
            <TouchableOpacity 
              key={announcement.id}
              style={styles.announcementCard} 
              onPress={() => handleAnnouncementClick(announcement.id)}
            >
              <View style={styles.announcementIcon}>
                <Ionicons name="megaphone" size={24} color="#FFA500" />
              </View>
              <View style={styles.announcementContent}>
                <Text style={styles.announcementTitle}>{announcement.title}</Text>
                <Text style={styles.announcementText}>
                  {announcement.excerpt}
                </Text>
                <Text style={styles.announcementDate}>
                  {announcementService.formatDate(announcement.createdAt)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.noAnnouncementsContainer}>
            <Ionicons name="megaphone-outline" size={48} color="#ccc" />
            <Text style={styles.noAnnouncementsText}>No announcements at this time</Text>
          </View>
        )}
      </View>

      {/* Floating Chat Button */}
      <FloatingChatButton />

      {/* Chat Modal */}
      <ChatModal
        isVisible={isChatModalOpen}
        onClose={() => setIsChatModalOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 50,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "#fff",
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  logo: {
    width: 40,
    height: 40,
    resizeMode: "contain",
    marginRight: 10,
  },
  appName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#D32F2F",
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
  },
  buttonGrid: {
    paddingHorizontal: 20,
    paddingTop: 25,
    paddingBottom: 30,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  smallButtonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  largeButton: {
    backgroundColor: "#D32F2F",
    borderRadius: 12,
    width: (width - 55) / 2,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  smallButton: {
    backgroundColor: "#D32F2F",
    borderRadius: 12,
    width: (width - 70) / 3,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  iconContainer: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  smallIconContainer: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  largeButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 15,
  },
  smallButtonText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 12,
  },
  announcementsSection: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  announcementHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  announcementsTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
  },
  viewAllText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#D32F2F",
  },
  announcementCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: "#FFA500",
  },
  announcementIcon: {
    marginRight: 12,
  },
  announcementContent: {
    flex: 1,
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  announcementText: {
    fontSize: 14,
    color: "#666",
    lineHeight: 18,
    marginBottom: 6,
  },
  announcementDate: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
  },
  noAnnouncementsContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  noAnnouncementsText: {
    fontSize: 16,
    color: "#ccc",
    marginTop: 10,
    textAlign: "center",
  },
});