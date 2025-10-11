// app/(main)/emergency/sos-status.tsx - Complete Component
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { db } from "../../../services/firebase";

interface SOSCall {
  id: string;
  userId: string;
  userName: string;
  selectedAgency: string;
  phoneNumber: string;
  calledAt: any;
  synced: boolean;
  emergencyType?: string;
  reviewed: boolean;
  reviewedBy: string | null;
  reviewedAt?: any;
  assignedAgency: string | null;
  assignedAgencyName?: string;
  linkedReportId: string | null;
  createdAt: any;
}

export default function SOSStatus() {
  const router = useRouter();
  const { sosId } = useLocalSearchParams<{ sosId: string }>();
  const [sosCall, setSOSCall] = useState<SOSCall | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sosId) {
      Alert.alert("Error", "SOS call ID not provided");
      router.back();
      return;
    }

    console.log('Listening to SOS call:', sosId);

    const unsubscribe = onSnapshot(
      doc(db, "sos_calls", sosId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = {
            id: docSnap.id,
            ...docSnap.data()
          } as SOSCall;
          console.log('SOS call data updated:', data);
          setSOSCall(data);
        } else {
          console.log('SOS call not found');
          setSOSCall(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to SOS call:", error);
        Alert.alert("Error", "Failed to load SOS call details. Please check your connection.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [sosId]);

  const formatTime = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      
      const timeString = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      if (isToday) {
        return `Today, ${timeString}`;
      } else {
        return `${date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: 'numeric'
        })}, ${timeString}`;
      }
    } catch (error) {
      console.error('Error formatting time:', error);
      return 'Unknown';
    }
  };

  const handleChatWithCDRRMO = () => {
    router.push('/(main)/chat');
  };

  const handleReturnToDashboard = () => {
    router.push('/(main)');
  };

  const renderStatusCard = () => {
    if (!sosCall) return null;

    if (!sosCall.reviewed) {
      return (
        <View style={styles.card}>
          <Ionicons name="time-outline" size={72} color="#3b82f6" />
          <Text style={styles.title}>SOS Call Pending Review</Text>
          <Text style={styles.message}>
            Your emergency call to {sosCall.selectedAgency} has been logged and is currently being reviewed by CDRRMO. 
            You will receive a notification once it has been processed.
          </Text>
          {renderSOSDetails("Pending Review")}
          <TouchableOpacity 
            style={styles.button} 
            onPress={handleReturnToDashboard}
          >
            <Text style={styles.buttonText}>Return to Dashboard</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.card}>
        <Ionicons name="checkmark-done-outline" size={72} color="#22c55e" />
        <Text style={styles.title}>SOS Call Reviewed</Text>
        <Text style={styles.message}>
          Your emergency call to {sosCall.selectedAgency} has been reviewed by CDRRMO. 
          {sosCall.linkedReportId && ' It has been linked to an incident report for tracking.'}
          {sosCall.assignedAgencyName && ` Response has been assigned to ${sosCall.assignedAgencyName}.`}
        </Text>
        {renderSOSDetails("Reviewed")}
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
  };

  const renderSOSDetails = (displayStatus: string) => (
    <View style={styles.details}>
      <Text style={styles.detailText}>
        <Text style={styles.detailLabel}>SOS Call ID: </Text>
        <Text>{sosCall?.id || 'Loading...'}</Text>
      </Text>
      <Text style={styles.detailText}>
        <Text style={styles.detailLabel}>Agency Called: </Text>
        <Text>{sosCall?.selectedAgency || 'Loading...'}</Text>
      </Text>
      <Text style={styles.detailText}>
        <Text style={styles.detailLabel}>Phone Number: </Text>
        <Text>{sosCall?.phoneNumber || 'Loading...'}</Text>
      </Text>
      <Text style={styles.detailText}>
        <Text style={styles.detailLabel}>Location: </Text>
        <Text>Lipa City</Text>
      </Text>
      <Text style={styles.detailText}>
        <Text style={styles.detailLabel}>Time Called: </Text>
        <Text>{sosCall ? formatTime(sosCall.calledAt) : 'Loading...'}</Text>
      </Text>
      <Text style={styles.detailText}>
        <Text style={styles.detailLabel}>Status: </Text>
        <Text>{displayStatus}</Text>
      </Text>
      {sosCall?.emergencyType && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Emergency Type: </Text>
          <Text>{sosCall.emergencyType}</Text>
        </Text>
      )}
      {sosCall?.reviewedAt && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Reviewed At: </Text>
          <Text>{formatTime(sosCall.reviewedAt)}</Text>
        </Text>
      )}
      {sosCall?.assignedAgencyName && (
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Assigned To: </Text>
          <Text>{sosCall.assignedAgencyName}</Text>
        </Text>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#D32F2F" />
        <Text style={styles.loadingText}>Loading SOS call details...</Text>
      </View>
    );
  }

  if (!sosCall) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="alert-circle" size={72} color="#ef4444" />
        <Text style={styles.errorTitle}>SOS Call Not Found</Text>
        <Text style={styles.errorMessage}>
          The SOS call you're looking for could not be found.
        </Text>
        <TouchableOpacity style={styles.button} onPress={handleReturnToDashboard}>
          <Text style={styles.buttonText}>Return to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#1f2937" />
      </TouchableOpacity>
      
      <Image 
        source={require('../../../assets/images/logo.png')} 
        style={styles.logo} 
      />
      <Text style={styles.header}>Track SOS Call Status</Text>
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
    color: "#1f2937",
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
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 10,
    marginBottom: 10,
    textAlign: "center",
    color: "#1f2937",
  },
  message: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 15,
    color: "#555",
    lineHeight: 20,
  },
  details: {
    alignSelf: "flex-start",
    marginBottom: 20,
    width: '100%',
  },
  detailText: {
    fontSize: 14,
    marginBottom: 8,
    color: "#374151",
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  detailLabel: {
    fontWeight: '600',
    color: "#1f2937",
  },
  button: {
    backgroundColor: "#D32F2F",
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
    fontSize: 15,
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: 'center',
    marginTop: 16,
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