import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { formatLocation, formatReportTime, getStatusDisplayText, IncidentReport, listenToReport } from "../../../services/reports";

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ReportStatus() {
  const router = useRouter();
  const { reportId, isDuplicate } = useLocalSearchParams<{ reportId: string; isDuplicate?: string }>();
  const [report, setReport] = useState<IncidentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [waitingForFirebase, setWaitingForFirebase] = useState(true);
  const [showNotFound, setShowNotFound] = useState(false);

  useEffect(() => {
    if (!reportId) {
      console.error('❌ [STATUS] No reportId provided');
      Alert.alert("Error", "Report ID not provided");
      router.back();
      return;
    }

    console.log('🔍 [STATUS] Loading report:', reportId);

    // Set timeout to show "not found" after 8 seconds
    const notFoundTimer = setTimeout(() => {
      if (waitingForFirebase) {
        console.log('⏰ [STATUS] Firebase timeout - showing not found');
        setShowNotFound(true);
        setLoading(false);
      }
    }, 8000);

    // Subscribe to report changes for real-time updates
    const unsubscribe = listenToReport(reportId, (reportData) => {
      console.log('📡 [STATUS] Firebase listener received data:', reportData ? 'Report found' : 'Report null');
      
      clearTimeout(notFoundTimer);
      setWaitingForFirebase(false);
      
      if (reportData) {
        console.log('✅ [STATUS] Report loaded successfully:', {
          id: reportData.id,
          status: reportData.status,
          emergencyType: reportData.emergencyType
        });
        setReport(reportData);
        setLoading(false);
      } else {
        console.log('❌ [STATUS] Report not found in Firebase');
        setShowNotFound(true);
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(notFoundTimer);
      unsubscribe && unsubscribe();
    };
  }, [reportId, waitingForFirebase]);

  const handleChatWithCDRRMO = () => {
    router.push('/(main)/chat');
  };

  const handleReturnToDashboard = () => {
    router.push('/(main)');
  };

  const handleViewAllReports = () => {
    router.push('/(main)/reports');
  };

  const renderStatusCard = () => {
    if (!report) return null;

    // Special case for duplicate reports
    if (isDuplicate === 'true') {
      return (
        <View style={[styles.card, styles.duplicateCard]}>
          <Ionicons name="warning-outline" size={72} color="#f39c12" />
          <Text style={styles.title}>Report Already Submitted</Text>
          <Text style={styles.message}>
            This {report.emergencyType} report appears to be similar to a previous submission 
            in {report.barangay}. Please check the status of your original report below.
          </Text>
          {renderReportDetails("Duplicate Detection")}
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.button} onPress={handleChatWithCDRRMO}>
              <Text style={styles.buttonText}>Chat with CDRRMO</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.secondaryButton]} 
              onPress={handleViewAllReports}
            >
              <Text style={styles.buttonText}>View All Reports</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.tertiaryButton]} 
              onPress={handleReturnToDashboard}
            >
              <Text style={styles.buttonText}>Return to Dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // Use type assertion to handle extended status types
    const reportStatus = report.status as string;

    switch (reportStatus) {
      case "pending":
        return (
          <View style={styles.card}>
            <Ionicons name="time-outline" size={72} color="#3b82f6" />
            <Text style={styles.title}>Report Pending Review</Text>
            <Text style={styles.message}>
              Your {report.emergencyType} report has been submitted and is currently being reviewed by CDRRMO. 
              You will receive a notification once it has been processed.
            </Text>
            {renderReportDetails(getStatusDisplayText(report.status))}
            <View style={styles.buttonContainer}>
              <TouchableOpacity 
                style={styles.button} 
                onPress={handleReturnToDashboard}
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
              Your {report.emergencyType} report has been accepted by CDRRMO and assigned to responders. 
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
              Your {report.emergencyType} report has been verified. A response team has been notified 
              and appropriate action is being taken. You may track the response progress or chat with CDRRMO for updates.
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
            <Text style={styles.title}>Report Not Approved</Text>
            <Text style={styles.message}>
              Your {report.emergencyType} report could not be processed. {
                report.adminNote ? `Reason: ${report.adminNote}` : 'Please review our reporting guidelines.'
              }
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
              The information submitted for your {report.emergencyType} report was insufficient to verify the incident. 
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
              The {report.emergencyType} incident has been successfully resolved. Thank you for your report.
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

      case "in_progress":
        return (
          <View style={styles.card}>
            <Ionicons name="build-outline" size={72} color="#3b82f6" />
            <Text style={styles.title}>Report In Progress</Text>
            <Text style={styles.message}>
              Responders are currently working on your {report.emergencyType} report. 
              You will be notified when there are updates.
            </Text>
            {renderReportDetails("In Progress")}
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

      case "assigned":
        return (
          <View style={styles.card}>
            <Ionicons name="person-outline" size={72} color="#8b5cf6" />
            <Text style={styles.title}>Report Assigned to Responder</Text>
            <Text style={styles.message}>
              Your {report.emergencyType} report has been assigned to {
                report.assignedRescuerName || report.assignedAgency || 'a responder'
              }. They will contact you if needed.
            </Text>
            {renderReportDetails("Assigned")}
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
        <Text style={styles.detailLabel}>Emergency Type: </Text>
        <Text>{report?.emergencyType || report?.category || 'Loading...'}</Text>
      </Text>
      
      {report?.subCategory && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Sub Category: </Text>
          <Text>{report.subCategory}</Text>
        </Text>
      )}
      
      <Text style={styles.detailText}>
        <Text style={styles.detailLabel}>Location: </Text>
        <Text>{report ? formatLocation(report) : 'Loading...'}</Text>
      </Text>
      
      {report?.barangay && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Barangay: </Text>
          <Text>{report.barangay}</Text>
        </Text>
      )}
      
      {report?.establishment && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Establishment: </Text>
          <Text>{report.establishment}</Text>
        </Text>
      )}
      
      <Text style={styles.detailText}>
        <Text style={styles.detailLabel}>Time Submitted: </Text>
        <Text>{report ? formatReportTime(report.createdAt) : 'Loading...'}</Text>
      </Text>
      
      <Text style={styles.detailText}>
        <Text style={styles.detailLabel}>Status: </Text>
        <Text>{displayStatus}</Text>
      </Text>
      
      {report?.description && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Description: </Text>
          <Text>{report.description}</Text>
        </Text>
      )}
      
      {report?.additionalNotes && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Additional Notes: </Text>
          <Text>{report.additionalNotes}</Text>
        </Text>
      )}
      
      {report?.assignedRescuerName && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Assigned Rescuer: </Text>
          <Text>{report.assignedRescuerName}</Text>
        </Text>
      )}
      
      {report?.assignedAgency && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Assigned Agency: </Text>
          <Text>{report.assignedAgency}</Text>
        </Text>
      )}
      
      {report?.adminNote && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Admin Note: </Text>
          <Text>{report.adminNote}</Text>
        </Text>
      )}
      
      {report?.resolutionNote && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Resolution Note: </Text>
          <Text>{report.resolutionNote}</Text>
        </Text>
      )}
      
      {report?.lastUpdated && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Last Updated: </Text>
          <Text>{formatReportTime(report.lastUpdated)}</Text>
        </Text>
      )}
      
      {report?.images && report.images.length > 0 && (
        <View style={styles.photosSection}>
          <Text style={styles.detailLabel}>
            Evidence Photos ({report.images.length}):
          </Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.photosScrollView}
          >
            {report.images.map((imageUrl, index) => (
              <TouchableOpacity 
                key={index}
                style={styles.photoContainer}
                onPress={() => {
                  Alert.alert(
                    `Photo ${index + 1} of ${report.images!.length}`,
                    'View full image',
                    [
                      { text: 'Close', style: 'cancel' },
                    ]
                  );
                }}
              >
                <Image 
                  source={{ uri: imageUrl }} 
                  style={styles.evidencePhoto}
                />
                <View style={styles.photoOverlay}>
                  <Text style={styles.photoNumber}>
                    Photo {index + 1}/{report.images!.length}
                  </Text>
                  <Ionicons name="expand" size={16} color="#fff" />
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  // Show loading state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="hourglass-outline" size={48} color="#e74c3c" />
        <Text style={styles.loadingText}>
          {waitingForFirebase ? "Loading report details..." : "Finalizing..."}
        </Text>
        <ActivityIndicator size="large" color="#e74c3c" />
        {waitingForFirebase && (
          <Text style={styles.loadingSubtext}>
            Please wait while we retrieve your report from the server...
          </Text>
        )}
      </View>
    );
  }

  // Show not found state
  if (showNotFound || !report) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={72} color="#ef4444" />
        <Text style={styles.errorTitle}>Report Not Found</Text>
        <Text style={styles.errorMessage}>
          {`The report "${reportId}" could not be found. This may happen if:\n\n`}
          • The report was recently submitted and is still processing\n
          • The report ID is incorrect\n
          • The report was deleted or removed\n\n
          Please check your reports list or try submitting again.
        </Text>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button} onPress={() => router.push('/(main)/reports')}>
            <Text style={styles.buttonText}>View My Reports</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton]} 
            onPress={() => router.push('/(main)')}
          >
            <Text style={styles.buttonText}>Return to Dashboard</Text>
          </TouchableOpacity>
        </View>
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
    color: '#1f2937',
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
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  duplicateCard: {
    borderLeftWidth: 6,
    borderLeftColor: '#f39c12',
    backgroundColor: '#fffaf0',
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 10,
    marginBottom: 10,
    textAlign: "center",
    color: '#1f2937',
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
  photosSection: {
    marginTop: 15,
    marginBottom: 10,
  },
  photosScrollView: {
    marginTop: 10,
  },
  photoContainer: {
    position: 'relative',
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#e74c3c',
  },
  evidencePhoto: {
    width: 220,
    height: 220,
    resizeMode: 'cover',
  },
  photoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  photoNumber: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
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
    backgroundColor: "#6b7280",
  },
  tertiaryButton: {
    backgroundColor: "#9ca3af",
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
    marginTop: 12,
  },
  loadingSubtext: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    lineHeight: 20,
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
    lineHeight: 20,
  },
  bottomSpacer: {
    height: 30,
  },
});