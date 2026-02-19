import PrimaryButton from "@/components/PrimaryButton";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

const { width } = Dimensions.get("window");

const getResponsiveSize = (small: number, medium: number, large: number) => {
  if (width > 600) return large * 1.2;
  if (width >= 414) return large;
  if (width >= 380) return medium;
  return small;
};

export default function PrivacyScreen() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);

  const handleAccept = () => {
    if (accepted) {
      Alert.alert(
        "Agreement Accepted",
        "Thank you for accepting our Privacy and User Agreement.",
        [
          {
            text: "OK",
            onPress: () => router.back()
          }
        ]
      );
    } else {
      Alert.alert("Required", "Please read and accept the Privacy and User Agreement to continue.");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy & User Agreement</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.card}>
          <View style={styles.titleContainer}>
            <Ionicons name="document-text" size={32} color="#B22222" />
            <Text style={styles.title}>LipaAlertHub Privacy and User Agreement</Text>
          </View>

          <Text style={styles.effectiveDate}>
            Effective Date:{" "}
            {new Date().toLocaleDateString("en-PH", {
              year: "numeric",
              month: "long",
              day: "numeric"
            })}
          </Text>

          {/* --- MAIN CONTENT --- */}
          <View style={styles.section}>
            <Text style={styles.sectionText}>
              LipaAlertHub is committed to protecting the privacy and security of its users.
              To ensure responsible use of the platform, the following privacy and user agreement
              guidelines are implemented.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data Collection and Usage</Text>
            <Text style={styles.sectionText}>
              The platform collects personal information such as names, email addresses, contact
              numbers, and location data strictly for the purpose of enhancing public safety and
              emergency response. All collected data is stored securely using Firebase’s cloud
              services and is used solely to facilitate incident reporting, communication, and
              disaster management.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>User Consent</Text>
            <Text style={styles.sectionText}>
              By registering and using LipaAlertHub, residents agree to the collection, storage, and
              use of their personal data in accordance with this agreement. Users must verify their
              email addresses to confirm their consent and validate their identity within the
              system.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data Security</Text>
            <Text style={styles.sectionText}>
              LipaAlertHub employs industry-standard security measures, including encrypted data
              transmission and secure authentication via Firebase Authentication, to safeguard user
              information from unauthorized access or breaches.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>User Responsibilities</Text>
            <Text style={styles.sectionText}>
              Users are responsible for providing accurate information during registration and for
              using the platform responsibly. Misuse of the system, including submitting false
              reports or prank SOS alerts, may result in penalties including temporary suspension or
              permanent banning from the platform as outlined in the striking system policy.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Confidentiality and Sharing</Text>
            <Text style={styles.sectionText}>
              Personal and incident data shared through the platform is accessible only to
              authorized CDRRMO personnel and emergency responders. Data will not be shared with
              third parties except as required by law or for legitimate public safety purposes.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>User Rights</Text>
            <Text style={styles.sectionText}>
              Users have the right to access their personal data stored on the platform and request
              corrections.
            </Text>
          </View>

          {/* --- APPENDIX E --- */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Appendix E: Terms and Conditions</Text>
            <Text style={styles.sectionText}>
              Welcome to LipaAlertHub, a mobile-based safety and emergency response platform designed
              to facilitate real-time incident reporting, SOS activation, and public awareness
              dissemination for the residents of Lipa City. By accessing and using the system, users
              agree to comply with and be bound by the following Terms and Conditions.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionSubtitle}>1. User Responsibilities</Text>
            <Text style={styles.sectionText}>
              A striking system is implemented to prevent misuse, including prank calls and false
              reports.{"\n"}• First Strike: 3-day suspension{"\n"}• Second Strike: 2-week
              suspension{"\n"}• Third Strike: Permanent ban from the platform.{"\n\n"}
              This system ensures accountability and promotes responsible use of LipaAlertHub.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionSubtitle}>2. Data Privacy and Security</Text>
            <Text style={styles.sectionText}>
              The system collects only necessary data such as user credentials, incident details,
              and geolocation data to ensure proper emergency response. Data is stored securely and
              accessible only to authorized CDRRMO and verified agencies in compliance with the Data
              Privacy Act of 2012 (RA 10173).
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionSubtitle}>3. Use of Services</Text>
            <Text style={styles.sectionText}>
              The app provides SOS activation, incident reporting, alerts, forums, and safety
              information. Developers and agencies are not liable for damages arising from user
              negligence, misinformation, or technical issues beyond control.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionSubtitle}>4. Limitations of Liability</Text>
            <Text style={styles.sectionText}>
              LipaAlertHub enhances emergency communication but does not replace direct emergency
              hotlines. Developers are not liable for response delays, downtime, or technical
              failures caused by external factors.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionSubtitle}>5. Intellectual Property Rights</Text>
            <Text style={styles.sectionText}>
              All system components, including design elements, database structures, and code, are
              the intellectual property of the LipaAlertHub development team. Copying or modifying
              without written consent is prohibited.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionSubtitle}>6. Amendments and Updates</Text>
            <Text style={styles.sectionText}>
              The proponents reserve the right to modify or update these Terms and Conditions to
              ensure compliance with legal and operational standards. Continued use after updates
              constitutes acceptance.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionSubtitle}>7. Acknowledgment</Text>
            <Text style={styles.sectionText}>
              By registering and using LipaAlertHub, users acknowledge that they have read,
              understood, and agreed to abide by these Terms and Conditions.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionSubtitle}>8. Notification of Changes</Text>
            <Text style={styles.sectionText}>
              Any changes to the privacy policy or user agreement will be communicated to users
              through app notifications and announcements, ensuring transparency and up-to-date
              consent.
            </Text>
          </View>

          {/* --- ACCEPTANCE --- */}
          <TouchableOpacity
            style={styles.termsContainer}
            onPress={() => setAccepted(!accepted)}
          >
            <View style={[styles.termsCheckbox, accepted && styles.termsCheckboxChecked]}>
              {accepted && <Ionicons name="checkmark" size={16} color="#fff" />}
            </View>
            <Text style={styles.termsText}>
              I have read, understood, and agree to the Privacy and User Agreement of LipaAlertHub.
            </Text>
          </TouchableOpacity>

          <View style={styles.buttonContainer}>
            <PrimaryButton title="Accept Agreement" onPress={handleAccept} disabled={!accepted} />
            <TouchableOpacity style={styles.backButtonContainer} onPress={() => router.back()}>
              <Text style={styles.backButtonText}>Back to Registration</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#d73527" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: getResponsiveSize(16, 18, 20),
    paddingTop: getResponsiveSize(50, 55, 60),
    paddingBottom: getResponsiveSize(16, 18, 20)
  },
  backButton: { padding: 8 },
  headerTitle: {
    fontSize: getResponsiveSize(18, 20, 22),
    fontWeight: "700",
    color: "#fff",
    textAlign: "center"
  },
  placeholder: { width: 40 },
  scrollView: { flex: 1 },
  contentContainer: {
    padding: getResponsiveSize(16, 18, 20),
    paddingBottom: getResponsiveSize(30, 35, 40)
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: getResponsiveSize(20, 24, 28),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5
  },
  titleContainer: { alignItems: "center", marginBottom: getResponsiveSize(16, 18, 20) },
  title: {
    fontSize: getResponsiveSize(20, 22, 24),
    fontWeight: "700",
    color: "#B22222",
    textAlign: "center",
    marginTop: getResponsiveSize(12, 14, 16),
    lineHeight: getResponsiveSize(26, 28, 30)
  },
  effectiveDate: {
    fontSize: getResponsiveSize(12, 13, 14),
    color: "#666",
    textAlign: "center",
    marginBottom: getResponsiveSize(20, 24, 28),
    fontStyle: "italic"
  },
  section: { marginBottom: getResponsiveSize(20, 22, 24) },
  sectionTitle: {
    fontSize: getResponsiveSize(16, 17, 18),
    fontWeight: "700",
    color: "#B22222",
    marginBottom: getResponsiveSize(8, 10, 12)
  },
  sectionSubtitle: {
    fontSize: getResponsiveSize(15, 16, 17),
    fontWeight: "700",
    color: "#444",
    marginBottom: getResponsiveSize(6, 8, 10)
  },
  sectionText: {
    fontSize: getResponsiveSize(14, 15, 16),
    color: "#333",
    lineHeight: getResponsiveSize(20, 22, 24),
    textAlign: "justify"
  },
  termsContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: getResponsiveSize(20, 24, 28),
    padding: getResponsiveSize(16, 18, 20),
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e9ecef"
  },
  termsCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#B22222",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    marginTop: 2
  },
  termsCheckboxChecked: { backgroundColor: "#B22222", borderColor: "#B22222" },
  termsText: {
    fontSize: getResponsiveSize(14, 15, 16),
    color: "#333",
    lineHeight: getResponsiveSize(20, 22, 24),
    fontWeight: "500",
    flex: 1
  },
  buttonContainer: { gap: getResponsiveSize(12, 14, 16) },
  backButtonContainer: { paddingVertical: getResponsiveSize(14, 16, 18), alignItems: "center" },
  backButtonText: { fontSize: getResponsiveSize(14, 15, 16), color: "#B22222", fontWeight: "600" }
});
