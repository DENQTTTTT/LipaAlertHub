import PrimaryButton from "@/components/PrimaryButton";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Dimensions,
  Platform // Add Platform to the imports
  ,

  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

const { width } = Dimensions.get('window');

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
        "Privacy Policy Accepted",
        "Thank you for accepting our Privacy Policy.",
        [
          {
            text: "OK",
            onPress: () => router.back()
          }
        ]
      );
    } else {
      Alert.alert("Required", "Please read and accept the Privacy Policy to continue.");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.card}>
          <View style={styles.titleContainer}>
            <Ionicons name="lock-closed" size={32} color="#B22222" />
            <Text style={styles.title}>LipaAlertHub Privacy Policy</Text>
          </View>
          
          <Text style={styles.effectiveDate}>Effective Date: {new Date().toLocaleDateString('en-PH', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}</Text>

          <View style={styles.section}>
            <Text style={styles.sectionText}>
              This Privacy Policy describes how LipaAlertHub collects, uses, and protects 
              your personal information in compliance with the Republic Act 10173 or the 
              Data Privacy Act of 2012.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Information We Collect</Text>
            <Text style={styles.sectionText}>
              • Personal Identification Information: Full name, email address, phone number, barangay{'\n'}
              • Location Data: For emergency response and incident reporting{'\n'}
              • Device Information: Device type, operating system, and app usage data{'\n'}
              • Incident Reports: Details of emergencies and safety concerns you report
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How We Use Your Information</Text>
            <Text style={styles.sectionText}>
              • To provide emergency alerts and safety notifications{'\n'}
              • To facilitate communication with emergency responders{'\n'}
              • To verify your identity as a Lipa City resident{'\n'}
              • To improve our services and user experience{'\n'}
              • To comply with legal obligations and public safety requirements
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data Security</Text>
            <Text style={styles.sectionText}>
              We implement appropriate security measures to protect your personal 
              information against unauthorized access, alteration, disclosure, or 
              destruction. All data is encrypted and stored securely using Firebase 
              services with industry-standard protection.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data Sharing and Disclosure</Text>
            <Text style={styles.sectionText}>
              We do not sell or trade your personal information. Your data may be 
              shared only with:{'\n'}
              • Authorized CDRRMO personnel and emergency responders{'\n'}
              • Government agencies as required by law{'\n'}
              • Service providers who assist in platform operations (under strict confidentiality)
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Rights Under Data Privacy Act</Text>
            <Text style={styles.sectionText}>
              You have the right to:{'\n'}
              • Access your personal data{'\n'}
              • Correct inaccurate or incomplete data{'\n'}
              • Request deletion of your data{'\n'}
              • Object to processing of your data{'\n'}
              • Data portability{'\n'}
              • Withdraw consent
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data Retention</Text>
            <Text style={styles.sectionText}>
              We retain your personal information only for as long as necessary 
              to fulfill the purposes outlined in this policy, unless a longer 
              retention period is required or permitted by law.
            </Text>
          </View>

          <View style={styles.contactSection}>
            <Text style={styles.contactTitle}>Data Protection Officer</Text>
            <Text style={styles.contactText}>
              For data privacy concerns and requests, please contact:
            </Text>
            <Text style={styles.contactDetail}>
              City Disaster Risk Reduction and Management Office (CDRRMO){'\n'}
              Lipa City Hall, Lipa City, Batangas{'\n'}
              Email: cdrrmo.lipacity@lipa.gov.ph{'\n'}
              Telephone: (043) 702-2222
            </Text>
          </View>

          <TouchableOpacity 
            style={styles.termsContainer}
            onPress={() => setAccepted(!accepted)}
          >
            <View style={[styles.termsCheckbox, accepted && styles.termsCheckboxChecked]}>
              {accepted && <Ionicons name="checkmark" size={16} color="#fff" />}
            </View>
            <View style={styles.termsTextContainer}>
              <Text style={styles.termsText}>
                I have read, understood, and agree to the Privacy Policy of LipaAlertHub.
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.buttonContainer}>
            <PrimaryButton 
              title="Accept Privacy Policy" 
              onPress={handleAccept} 
              disabled={!accepted}
            />
            
            <TouchableOpacity 
              style={styles.backButtonContainer}
              onPress={() => router.back()}
            >
              <Text style={styles.backButtonText}>Back to Registration</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#d73527",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: getResponsiveSize(16, 18, 20),
    paddingTop: getResponsiveSize(50, 55, 60),
    paddingBottom: getResponsiveSize(16, 18, 20),
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: getResponsiveSize(18, 20, 22),
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: getResponsiveSize(16, 18, 20),
    paddingBottom: getResponsiveSize(30, 35, 40),
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: getResponsiveSize(20, 24, 28),
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  titleContainer: {
    alignItems: "center",
    marginBottom: getResponsiveSize(16, 18, 20),
  },
  title: {
    fontSize: getResponsiveSize(20, 22, 24),
    fontWeight: "700",
    color: "#B22222",
    textAlign: "center",
    marginTop: getResponsiveSize(12, 14, 16),
    lineHeight: getResponsiveSize(26, 28, 30),
  },
  effectiveDate: {
    fontSize: getResponsiveSize(12, 13, 14),
    color: "#666",
    textAlign: "center",
    marginBottom: getResponsiveSize(20, 24, 28),
    fontStyle: "italic",
  },
  section: {
    marginBottom: getResponsiveSize(20, 22, 24),
  },
  sectionTitle: {
    fontSize: getResponsiveSize(16, 17, 18),
    fontWeight: "700",
    color: "#B22222",
    marginBottom: getResponsiveSize(8, 10, 12),
    lineHeight: getResponsiveSize(22, 24, 26),
  },
  sectionText: {
    fontSize: getResponsiveSize(14, 15, 16),
    color: "#333",
    lineHeight: getResponsiveSize(20, 22, 24),
    textAlign: "justify",
  },
  contactSection: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: getResponsiveSize(16, 18, 20),
    marginTop: getResponsiveSize(16, 18, 20),
    marginBottom: getResponsiveSize(20, 24, 28),
    borderLeftWidth: 4,
    borderLeftColor: "#B22222",
  },
  contactTitle: {
    fontSize: getResponsiveSize(16, 17, 18),
    fontWeight: "700",
    color: "#B22222",
    marginBottom: getResponsiveSize(8, 10, 12),
  },
  contactText: {
    fontSize: getResponsiveSize(14, 15, 16),
    color: "#333",
    lineHeight: getResponsiveSize(20, 22, 24),
    marginBottom: getResponsiveSize(8, 10, 12),
  },
  contactDetail: {
    fontSize: getResponsiveSize(13, 14, 15),
    color: "#666",
    lineHeight: getResponsiveSize(18, 20, 22),
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: getResponsiveSize(20, 24, 28),
    padding: getResponsiveSize(16, 18, 20),
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  termsCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#B22222",
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginTop: 2,
  },
  termsCheckboxChecked: {
    backgroundColor: "#B22222",
    borderColor: "#B22222",
  },
  termsTextContainer: {
    flex: 1,
  },
  termsText: {
    fontSize: getResponsiveSize(14, 15, 16),
    color: "#333",
    lineHeight: getResponsiveSize(20, 22, 24),
    fontWeight: "500",
  },
  buttonContainer: {
    gap: getResponsiveSize(12, 14, 16),
  },
  backButtonContainer: {
    paddingVertical: getResponsiveSize(14, 16, 18),
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: getResponsiveSize(14, 15, 16),
    color: "#B22222",
    fontWeight: "600",
  },
});