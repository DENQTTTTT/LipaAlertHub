import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function WeatherDetailed() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Get the detailed content based on alert type
  const getDetailedContent = (alertType: string) => {
    switch(alertType) {
      case "Yellow Warning":
        return {
          fullDescription: `Heavy rainfall is expected in your area within the next 24 hours. The Philippine Atmospheric, Geophysical and Astronomical Services Administration (PAGASA) has issued this yellow warning to alert residents of potentially hazardous weather conditions.

Expected rainfall amounts range from 50-100mm within a 24-hour period. This may cause:
• Flash floods in low-lying and flood-prone areas
• Traffic congestion and road closures
• Possible landslides in mountainous regions
• Disruption to outdoor activities

SAFETY RECOMMENDATIONS:
• Stay indoors when possible
• Avoid unnecessary travel, especially in flood-prone areas
• Monitor local news and weather updates regularly
• Prepare emergency supplies (flashlight, battery-powered radio, first aid kit)
• Keep important documents in waterproof containers
• Ensure proper drainage around your home

If you must go outside:
• Wear appropriate rain gear
• Avoid walking or driving through flooded areas
• Stay away from electrical installations that may be affected by water
• Be extra cautious when driving - reduce speed and maintain safe distance

This warning will remain in effect until conditions improve. Continue monitoring official weather bulletins for updates.`,
          backgroundColor: "#fbbf24",
          textColor: "#92400e"
        };
      case "Earthquake Alert":
        return {
          fullDescription: `EARTHQUAKE INFORMATION:
Magnitude: 6.2
Location: 45km southeast of Batangas City
Depth: 15km
Time: Today, 3:42 PM PHT

A significant earthquake with a magnitude of 6.2 has been recorded in the Batangas region. The Philippine Institute of Volcanology and Seismology (PHIVOLCS) is closely monitoring the situation for potential aftershocks.

AFFECTED AREAS:
• Batangas City and surrounding municipalities
• Parts of Laguna province
• Southern Metro Manila areas
• Cavite coastal areas

INTENSITY SCALE (PHIVOLCS):
• Intensity VI (Strong) - Batangas City
• Intensity V (Moderately Strong) - Lipa City
• Intensity IV (Moderately Strong) - Calamba, Laguna
• Intensity III (Weak) - Southern Metro Manila

AFTERSHOCK ADVISORY:
Minor to moderate aftershocks are expected in the coming hours to days. The strongest aftershocks typically occur within the first 24 hours following the main earthquake.

SAFETY REMINDERS:
• Check for injuries and provide first aid if necessary
• Inspect your home for structural damage before re-entering
• Be prepared for aftershocks - Drop, Cover, and Hold On
• Stay away from damaged buildings and power lines
• Listen to battery-powered radio for emergency information
• Do not use elevators
• If you smell gas, turn off the main gas valve and leave immediately

TSUNAMI ADVISORY:
No tsunami threat has been detected at this time. Coastal monitoring continues.

Emergency hotlines remain active. Report significant damage to local authorities immediately.`,
          backgroundColor: "#dc2626",
          textColor: "#ffffff"
        };
      case "Red Warning":
        return {
          fullDescription: `SEVERE WEATHER WARNING - RED ALERT

The Philippine Atmospheric, Geophysical and Astronomical Services Administration (PAGASA) has issued a RED WARNING for severe flooding in the following areas:

SEVERELY AFFECTED AREAS:
• Lipa City - All barangays
• Batangas City - Coastal and low-lying areas
• Tanauan City - Riverside communities
• Santo Tomas - Agricultural areas
• Malvar - Industrial zones

CURRENT SITUATION:
Continuous heavy rainfall over the past 12 hours has caused river levels to rise dangerously. The Pansipit River and its tributaries have exceeded critical levels. Several roads are now impassable due to flooding.

FLOOD LEVELS:
• 0.5 to 1.5 meters in residential areas
• Up to 2 meters in low-lying commercial districts
• Knee to waist-deep water on major roads

IMMEDIATE ACTIONS REQUIRED:

FOR RESIDENTS IN EVACUATION AREAS:
• Evacuate immediately when advised by local authorities
• Proceed to designated evacuation centers
• Bring essential items: medications, important documents, change of clothes
• Follow evacuation routes provided by barangay officials

GENERAL SAFETY MEASURES:
• Do not attempt to cross flooded streets on foot or by vehicle
• Stay away from manholes, canals, and drainage areas
• Avoid electrical appliances if flooding reaches your home
• If trapped in a building, move to higher floors
• Signal for help using bright colored cloth or flashlight

EVACUATION CENTERS:
• Lipa City Sports Complex
• Batangas State University Gymnasium
• Covered Courts in affected barangays

EMERGENCY CONTACTS:
• CDRRMO: 043-XXX-XXXX
• Philippine Red Cross: 143
• Emergency Services: 911

This red warning will remain in effect until water levels recede to safe levels. Continue monitoring official announcements for updates.`,
          backgroundColor: "#dc2626",
          textColor: "#ffffff"
        };
      default:
        return {
          fullDescription: params.alertDescription || "No detailed information available.",
          backgroundColor: "#6b7280",
          textColor: "#ffffff"
        };
    }
  };

  const content = getDetailedContent(Array.isArray(params.alertType) ? params.alertType[0] : params.alertType || "");

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.logoContainer}>
          <Image 
           source={require('../../../assets/images/logo.png')} 
            style={styles.logoImage}
          />
          <Text style={styles.logoTitle}>LipoAlertHub</Text>
        </View>
      </View>

      {/* Alert Title */}
      <View style={[styles.alertHeader, { backgroundColor: content.backgroundColor }]}>
        <Text style={[styles.alertTitle, { color: content.textColor }]}>
          {(Array.isArray(params.alertTitle) ? params.alertTitle[0] : params.alertTitle) || 
           (Array.isArray(params.alertType) ? params.alertType[0] : params.alertType)}
        </Text>
      </View>

      {/* Detailed Content */}
      <ScrollView 
        style={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentWrapper}
      >
        <Text style={styles.detailedText}>
          {content.fullDescription}
        </Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: "#ffffff",
  },
  backButton: {
    marginRight: 15,
    padding: 5,
  },
  backArrow: {
    fontSize: 24,
    color: "#1f2937",
    fontWeight: "bold",
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
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
  alertHeader: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: 'center',
  },
  contentContainer: {
    flex: 1,
  },
  contentWrapper: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
  },
  detailedText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#374151",
    textAlign: 'justify',
  },
});