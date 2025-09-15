import { useRouter } from "expo-router";
import React from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Alert {
  id: number;
  type: string;
  title: string;
  description: string;
  backgroundColor: string;
  textColor: string;
}

export default function WeatherScreen() {
  const router = useRouter();

  const alerts: Alert[] = [
    {
      id: 1,
      type: "Yellow Warning",
      title: "Yellow Warning",
      description: "Heavy rainfall is expected in your area within the next 24 hours. Please stay indoors and avoid unnecessary travel.",
      backgroundColor: "#fbbf24",
      textColor: "#92400e"
    },
    {
      id: 2,
      type: "Earthquake Alert",
      title: "EARTHQUAKE ALERT",
      description: "A magnitude 6.2 earthquake occurred 45km southeast of Batangas City. Minor aftershocks are expected.",
      backgroundColor: "#dc2626",
      textColor: "#ffffff"
    },
    {
      id: 3,
      type: "Red Warning",
      title: "Red Warning",
      description: "Severe flooding expected in low-lying areas. Evacuate immediately if you receive evacuation orders from local authorities.",
      backgroundColor: "#dc2626",
      textColor: "#ffffff"
    }
  ];

  const handleAlertPress = (alert: Alert) => {
    // Navigate to detailed view with alert data
    router.push({
      pathname: '/weather/detailed',
      params: { 
        alertId: alert.id,
        alertType: alert.type,
        alertTitle: alert.title,
        alertDescription: alert.description
      }
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image 
           source={require('../../../assets/images/logo.png')} 
            style={styles.logoImage}
          />
          <Text style={styles.logoTitle}>LipaAlertHub</Text>
        </View>
        <Text style={styles.pageTitle}>Weather and Disaster Alert</Text>
      </View>

      {/* Alerts List */}
      <ScrollView 
        style={styles.alertsContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.alertsContent}
      >
        {alerts.map((alert) => (
          <TouchableOpacity
            key={alert.id}
            style={[styles.alertCard, { backgroundColor: alert.backgroundColor }]}
            onPress={() => handleAlertPress(alert)}
            activeOpacity={0.8}
          >
            <View style={styles.alertContent}>
              <View style={styles.alertTextContainer}>
                <Text style={[styles.alertTitle, { color: alert.textColor }]}>
                  {alert.title}
                </Text>
                <Text style={[styles.alertDescription, { color: alert.textColor }]}>
                  {alert.description}
                </Text>
              </View>
              <View style={styles.arrowContainer}>
                <Text style={[styles.arrow, { color: alert.textColor }]}>›</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 30,
    backgroundColor: "#ffffff",
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  logoImage: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginRight: 10,
    resizeMode: 'contain',
  },
  logoTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
    lineHeight: 28,
  },
  alertsContainer: {
    flex: 1,
  },
  alertsContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
  },
  alertCard: {
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  alertContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  alertTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  alertDescription: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.95,
  },
  arrowContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 24,
    height: 24,
  },
  arrow: {
    fontSize: 20,
    fontWeight: "bold",
  },
});