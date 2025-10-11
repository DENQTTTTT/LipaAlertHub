import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { formatLocation, formatReportTime, getStatusDisplayText, IncidentReport, listenToReport } from "../../../services/reports";

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
            <View style={styles.buttonContainer}>
              <TouchableOpacity 
                style={styles.button} 
                onPress={() => router.replace('/(main)')}
              >
                <Text style={styles.buttonText}>Return to Dashboard</Text>
              </TouchableOpacity>
            </View>
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
            <View style={styles.buttonContainer}>
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
            <View style={styles.buttonContainer}>
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
          </View>
        );

      case "rejected":
        return (
          <View style={styles.card}>
            <Ionicons name="close-circle" size={72} color="#f97316" />
            <Text style={styles.title}>Report Rejected</Text>
            <Text style={styles.message}>
              Your report could not be processed. Please check the admin note for details.
            </Text>
            {renderReportDetails(getStatusDisplayText(report.status))}
            <View style={styles.buttonContainer}>
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
            <View style={styles.buttonContainer}>
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
          </View>
        );

      case "resolved":
        return (
          <View style={styles.card}>
            <Ionicons name="checkmark-done-circle" size={72} color="green" />
            <Text style={styles.title}>Report Resolved</Text>
            <Text style={styles.message}>
              The incident has been successfully resolved. Thank you for your report.
            </Text>
            {renderReportDetails(getStatusDisplayText(report.status))}
            <View style={styles.buttonContainer}>
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
            <View style={styles.buttonContainer}>
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
        <Text>{report ? formatReportTime(report.createdAt) : 'Loading...'}</Text>
      </Text>
      <Text style={styles.detailText}>
        <Text style={styles.detailLabel}>Status: </Text>
        <Text>{displayStatus}</Text>
      </Text>
      <Text style={styles.detailText}>
        <Text style={styles.detailLabel}>Emergency Type: </Text>
        <Text>{report?.emergencyType || report?.category || 'Loading...'}</Text>
      </Text>
      
      {/* ADDED: SubCategory Display */}
      {report?.subCategory && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Sub Category: </Text>
          <Text>{report.subCategory}</Text>
        </Text>
      )}
      
      {/* ADDED: Additional Notes Display */}
      {report?.additionalNotes && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Additional Notes: </Text>
          <Text>{report.additionalNotes}</Text>
        </Text>
      )}
      
      {/* ADDED: Description Display */}
      {report?.description && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Description: </Text>
          <Text>{report.description}</Text>
        </Text>
      )}
      
      {/* ADDED: Establishment Display */}
      {report?.establishment && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Establishment: </Text>
          <Text>{report.establishment}</Text>
        </Text>
      )}
      
      {/* ADDED: Barangay Display */}
      {report?.barangay && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Barangay: </Text>
          <Text>{report.barangay}</Text>
        </Text>
      )}
      
      {/* ADDED: Assigned Rescuer Display */}
      {report?.assignedRescuerName && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Assigned Rescuer: </Text>
          <Text>{report.assignedRescuerName}</Text>
        </Text>
      )}
      
      {/* ADDED: Assigned Agency Display */}
      {report?.assignedAgency && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Assigned Agency: </Text>
          <Text>{report.assignedAgency}</Text>
        </Text>
      )}
      
      {/* ADDED: Admin Note Display */}
      {report?.adminNote && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Admin Note: </Text>
          <Text>{report.adminNote}</Text>
        </Text>
      )}
      
      {/* ADDED: Resolution Note Display */}
      {report?.resolutionNote && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Resolution Note: </Text>
          <Text>{report.resolutionNote}</Text>
        </Text>
      )}
      
      {/* ADDED: Last Updated Display */}
      {report?.lastUpdated && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Last Updated: </Text>
          <Text>{formatReportTime(report.lastUpdated)}</Text>
        </Text>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading report details...</Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.errorContainer}>
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
    <View style={styles.mainContainer}>
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={true}
        bounces={true}
      >
        {/* Header with back button */}
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        
        <Image source={require('../../../assets/images/logo.png')} style={styles.logo} />
        <Text style={styles.header}>Track Report Status</Text>
        {renderStatusCard()}
        
        {/* Add some bottom padding to ensure content is not hidden */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
    alignItems: "center",
    minHeight: SCREEN_HEIGHT,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: "#fff",
    padding: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: "#fff",
    padding: 20,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: 8,
    marginBottom: 10,
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: "contain",
    marginBottom: 10,
  },
  header: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: 'center',
  },
  card: {
    width: "100%",
    maxWidth: 400,
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
    lineHeight: 20,
  },
  details: {
    width: '100%',
    marginBottom: 20,
  },
  detailText: {
    fontSize: 14,
    marginBottom: 8,
    color: "#374151",
    flexDirection: 'row',
    flexWrap: 'wrap',
    lineHeight: 20,
  },
  detailLabel: {
    fontWeight: '600',
    color: "#1f2937",
  },
  buttonContainer: {
    width: '100%',
    gap: 10,
  },
  button: {
    backgroundColor: "#E53935",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    minHeight: 50,
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: "#9E9E9E",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
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
  bottomSpacer: {
    height: 30,
  },
});