import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { formatLocation, formatReportTime, getStatusDisplayText, IncidentReport, listenToReport } from "../../../services/reports";

export default function ReportStatus() {
  const router = useRouter();
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const [report, setReport] = useState<IncidentReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reportId) {
      Alert.alert("Error", "Report ID not provided");
      router.back();
      return;
    }

    // Subscribe to report changes for real-time updates
    const unsubscribe = listenToReport(reportId, (reportData) => {
      setReport(reportData);
      setLoading(false);
    });

    return () => unsubscribe && unsubscribe();
  }, [reportId]);

  const handleChatWithCDRRMO = () => {
    // Navigate to chat screen - adjust path as needed
    router.push('/(main)/chat');
  };

  const handleReturnToDashboard = () => {
    router.push('/(main)');
  };

  const renderStatusCard = () => {
    if (!report) return null;

    switch (report.status) {
      case "pending":
        return (
          <View style={styles.card}>
            <Ionicons name="time-outline" size={72} color="#3b82f6" />
            <Text style={styles.title}>Report Pending Review</Text>
            <Text style={styles.message}>
              Your report has been submitted and is currently being reviewed by CDRRMO. 
              You will receive a notification once it has been processed.
            </Text>
            {renderReportDetails(getStatusDisplayText(report.status))}
            <TouchableOpacity 
              style={styles.button} 
              onPress={() => router.replace('/(main)')}
            >
              <Text style={styles.buttonText}>Return to Dashboard</Text>
            </TouchableOpacity>
          </View>
        );

      case "accepted":
        return (
          <View style={styles.card}>
            <Ionicons name="checkmark-done-outline" size={72} color="#22c55e" />
            <Text style={styles.title}>Report Accepted</Text>
            <Text style={styles.message}>
              Your report has been accepted by CDRRMO and assigned to responders. 
              You will be notified with further updates on the response progress.
            </Text>
            {renderReportDetails(getStatusDisplayText(report.status))}
            <TouchableOpacity style={styles.button} onPress={handleChatWithCDRRMO}>
              <Text style={styles.buttonText}>Chat with CDRRMO</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.secondaryButton]} 
              onPress={handleReturnToDashboard}
            >
              <Text style={styles.buttonText}>Return to Dashboard</Text>
            </TouchableOpacity>
          </View>
        );

      case "verified":
        return (
          <View style={styles.card}>
            <Ionicons name="checkmark-circle" size={72} color="green" />
            <Text style={styles.title}>Report Successfully Verified</Text>
            <Text style={styles.message}>
              A response team has been notified and appropriate action is being taken. 
              You may track the response progress or chat with CDRRMO for updates.
            </Text>
            {renderReportDetails(getStatusDisplayText(report.status))}
            <TouchableOpacity style={styles.button} onPress={handleChatWithCDRRMO}>
              <Text style={styles.buttonText}>Chat with CDRRMO</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.secondaryButton]} 
              onPress={handleReturnToDashboard}
            >
              <Text style={styles.buttonText}>Return to Dashboard</Text>
            </TouchableOpacity>
          </View>
        );

      case "rejected":
        return (
          <View style={styles.card}>
            <Ionicons name="time-outline" size={72} color="#FF9800" />
            <Text style={styles.title}>Waiting for Approval</Text>
            <Text style={styles.message}>
              Your report is currently under verification. 
              The CDRRMO may contact you for further information if needed.
            </Text>
            {renderReportDetails("Pending Review")}
            <TouchableOpacity style={styles.button} onPress={handleChatWithCDRRMO}>
              <Text style={styles.buttonText}>Chat with CDRRMO</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.secondaryButton]} 
              onPress={handleReturnToDashboard}
            >
              <Text style={styles.buttonText}>Return to Dashboard</Text>
            </TouchableOpacity>
          </View>
        );

      case "failed":
        return (
          <View style={styles.card}>
            <Ionicons name="close-circle" size={72} color="red" />
            <Text style={styles.title}>Report Verification Failed</Text>
            <Text style={styles.message}>
              The information submitted was insufficient to verify the incident. 
              Please provide more details or contact CDRRMO directly.
            </Text>
            {renderReportDetails(getStatusDisplayText(report.status))}
            <TouchableOpacity style={styles.button} onPress={handleChatWithCDRRMO}>
              <Text style={styles.buttonText}>Chat with CDRRMO</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.secondaryButton]} 
              onPress={handleReturnToDashboard}
            >
              <Text style={styles.buttonText}>Return to Dashboard</Text>
            </TouchableOpacity>
          </View>
        );

      case "resolved":
        return (
          <View style={styles.card}>
            <Ionicons name="checkmark-done-circle" size={72} color="green" />
            <Text style={styles.title}>Report Already Resolved</Text>
            <Text style={styles.message}>
              Our records indicate that the concern you submitted has already been addressed. 
              If you believe further action is required, you may still contact CDRRMO.
            </Text>
            {renderReportDetails(getStatusDisplayText(report.status))}
            <TouchableOpacity style={styles.button} onPress={handleChatWithCDRRMO}>
              <Text style={styles.buttonText}>Chat with CDRRMO</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.secondaryButton]} 
              onPress={handleReturnToDashboard}
            >
              <Text style={styles.buttonText}>Return to Dashboard</Text>
            </TouchableOpacity>
          </View>
        );

      default:
        return (
          <View style={styles.card}>
            <Ionicons name="help-circle" size={72} color="#6b7280" />
            <Text style={styles.title}>Unknown Status</Text>
            <Text style={styles.message}>
              There seems to be an issue with your report status. Please contact CDRRMO for assistance.
            </Text>
            {renderReportDetails("Unknown")}
            <TouchableOpacity style={styles.button} onPress={handleChatWithCDRRMO}>
              <Text style={styles.buttonText}>Chat with CDRRMO</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.secondaryButton]} 
              onPress={handleReturnToDashboard}
            >
              <Text style={styles.buttonText}>Return to Dashboard</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  const renderReportDetails = (displayStatus: string) => (
    <View style={styles.details}>
      <Text style={styles.detailText}>
        <Text style={styles.detailLabel}>Report ID: </Text>
        <Text>{report?.id || 'Loading...'}</Text>
      </Text>
      <Text style={styles.detailText}>
        <Text style={styles.detailLabel}>Location: </Text>
        <Text>{report ? formatLocation(report) : 'Loading...'}</Text>
      </Text>
      <Text style={styles.detailText}>
        <Text style={styles.detailLabel}>Time Submitted: </Text>
        <Text>{report ? formatReportTime(report.timestamp) : 'Loading...'}</Text>
      </Text>
      <Text style={styles.detailText}>
        <Text style={styles.detailLabel}>Status: </Text>
        <Text>{displayStatus}</Text>
      </Text>
      <Text style={styles.detailText}>
        <Text style={styles.detailLabel}>Emergency Type: </Text>
        <Text>{report?.emergencyType || 'Loading...'}</Text>
      </Text>
      {report?.subCategory && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Category: </Text>
          <Text>{report.subCategory}</Text>
        </Text>
      )}
      {report?.adminNote && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Admin Note: </Text>
          <Text>{report.adminNote}</Text>
        </Text>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.loadingText}>Loading report details...</Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="alert-circle" size={72} color="#ef4444" />
        <Text style={styles.errorTitle}>Report Not Found</Text>
        <Text style={styles.errorMessage}>
          The report you're looking for could not be found.
        </Text>
        <TouchableOpacity style={styles.button} onPress={handleReturnToDashboard}>
          <Text style={styles.buttonText}>Return to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header with back button */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#1f2937" />
      </TouchableOpacity>
      
      <Image   source={require('../../../assets/images/logo.png')}  style={styles.logo} />
      <Text style={styles.header}>Track Report Status</Text>
      {renderStatusCard()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 1,
    padding: 8,
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: "contain",
    marginBottom: 10,
    marginTop: 40,
  },
  header: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: 'center',
  },
  card: {
    width: "100%",
    backgroundColor: "#F9F9F9",
    padding: 20,
    borderRadius: 15,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 10,
    marginBottom: 10,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 15,
    color: "#555",
  },
  details: {
    alignSelf: "flex-start",
    marginBottom: 20,
    width: '100%',
  },
  detailText: {
    fontSize: 14,
    marginBottom: 4,
    color: "#374151",
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  detailLabel: {
    fontWeight: '600',
    color: "#1f2937",
  },
  button: {
    backgroundColor: "#E53935",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 8,
    width: "100%",
    alignItems: "center",
  },
  secondaryButton: {
    backgroundColor: "#9E9E9E",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
    color: "#374151",
  },
  errorMessage: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    color: "#6b7280",
    paddingHorizontal: 20,
  },
});