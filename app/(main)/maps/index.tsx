// app/(main)/maps/index.tsx - Complete Evacuation Centers
import React from "react";
import {
  Image,
  StatusBar,
  StyleSheet,
  Text,
  View
} from "react-native";
import EvacuationCentersScreen from './evacuation';

export default function MapsScreen() {
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
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
          <Text style={styles.pageTitle}>Evacuation Centers</Text>
          <Text style={styles.pageSubtitle}>Find nearby safe shelters and get directions</Text>
        </View>

        {/* Evacuation Centers Content */}
        <EvacuationCentersScreen />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: "#ffffff",
    shadowColor: '#000',
    shadowOffset: { 
      width: 0, 
      height: 2 
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
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
    fontSize: 26,
    fontWeight: "bold",
    color: "#d73527",
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "400",
  },
});