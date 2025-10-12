import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useAnnouncementById } from "../../../hooks/useAnnouncements";
import { announcementService } from "../../../services/announcements";

const { width } = Dimensions.get('window');

export default function AnnouncementDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { announcement, loading, error } = useAnnouncementById(id || null);

  const handleBackPress = () => {
    router.back();
  };

  const handleSharePress = () => {
    // TODO: Implement share functionality
    console.log("Share announcement:", announcement?.title);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
            <Ionicons name="arrow-back" size={24} color="#D32F2F" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Announcement</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D32F2F" />
          <Text style={styles.loadingText}>Loading announcement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !announcement) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
            <Ionicons name="arrow-back" size={24} color="#D32F2F" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Announcement</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#D32F2F" />
          <Text style={styles.errorTitle}>Announcement Not Found</Text>
          <Text style={styles.errorText}>
            The announcement you're looking for could not be found or has been removed.
          </Text>
          <TouchableOpacity style={styles.backToListButton} onPress={() => router.replace("/(main)/announcements/index")}>
            <Text style={styles.backToListButtonText}>Back to Announcements</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
          <Ionicons name="arrow-back" size={24} color="#D32F2F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Announcement</Text>
      </View>

      {/* Content */}
      <ScrollView style={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {/* Announcement Header */}
        <View style={styles.announcementHeader}>
          <View style={styles.titleContainer}>
            <Ionicons name="megaphone" size={28} color="#FFA500" style={styles.titleIcon} />
            <Text style={styles.announcementTitle}>{announcement.title}</Text>
          </View>
          <Text style={styles.announcementDate}>
            {announcementService.formatDate(announcement.createdAt)}
          </Text>
        </View>

        {/* Image (if available) */}
        {announcement.imageUrl && (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: announcement.imageUrl }}
              style={styles.announcementImage}
              resizeMode="cover"
            />
          </View>
        )}

        {/* Content */}
        <View style={styles.contentSection}>
          <Text style={styles.announcementBody}>{announcement.body}</Text>
        </View>

        {/* Footer Info */}
        <View style={styles.footerInfo}>
          <View style={styles.infoCard}>
            <Ionicons name="time-outline" size={20} color="#666" />
            <Text style={styles.infoText}>
              Published {announcementService.formatDate(announcement.createdAt)}
            </Text>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#666" />
            <Text style={styles.infoText}>Official CDRRMO Announcement</Text>
          </View>
        </View>

        {/* Bottom Spacer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E7",
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  shareButton: {
    padding: 8,
    marginRight: -8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
    flex: 1,
    textAlign: "center",
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "600",
    color: "#D32F2F",
    marginTop: 20,
    marginBottom: 10,
  },
  errorText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 30,
  },
  backToListButton: {
    backgroundColor: "#D32F2F",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backToListButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  contentContainer: {
    flex: 1,
  },
  announcementHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  titleIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  announcementTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
    lineHeight: 32,
    flex: 1,
  },
  announcementDate: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
    marginLeft: 40,
  },
  imageContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  announcementImage: {
    width: width - 40,
    height: 200,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
  },
  contentSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  announcementBody: {
    fontSize: 16,
    color: "#333",
    lineHeight: 24,
    textAlign: "justify",
  },
  footerInfo: {
    paddingHorizontal: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E5E7",
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  infoText: {
    fontSize: 14,
    color: "#666",
    marginLeft: 12,
  },
  bottomSpacer: {
    height: 40,
  },
});