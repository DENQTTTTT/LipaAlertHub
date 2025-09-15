import React, { useState } from "react";
import { Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MapView, { PROVIDER_GOOGLE, Region } from 'react-native-maps';

const { width, height } = Dimensions.get('window');

export default function MapsScreen() {
  const [selectedTab, setSelectedTab] = useState<'Maps' | 'Shelters'>('Maps');

  // Default region - Lipa City coordinates
  const [region, setRegion] = useState<Region>({
    latitude: 13.9411, // Lipa City latitude
    longitude: 121.1624, // Lipa City longitude
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });

  const onRegionChange = (newRegion: Region) => {
    setRegion(newRegion);
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
        <Text style={styles.pageTitle}>Hazard Maps and Shelters</Text>
      </View>

      {/* Map Container */}
      <View style={styles.mapContainer}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          region={region}
          onRegionChange={onRegionChange}
          showsUserLocation={true}
          showsMyLocationButton={true}
          showsCompass={true}
          showsScale={true}
          showsBuildings={true}
          showsTraffic={false}
          showsIndoors={true}
          mapType="standard"
        />
        
        {/* Zoom Controls */}
        <View style={styles.zoomControls}>
          <TouchableOpacity 
            style={styles.zoomButton}
            onPress={() => {
              setRegion(prev => ({
                ...prev,
                latitudeDelta: prev.latitudeDelta / 2,
                longitudeDelta: prev.longitudeDelta / 2,
              }));
            }}
          >
            <Text style={styles.zoomText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.zoomButton}
            onPress={() => {
              setRegion(prev => ({
                ...prev,
                latitudeDelta: prev.latitudeDelta * 2,
                longitudeDelta: prev.longitudeDelta * 2,
              }));
            }}
          >
            <Text style={styles.zoomText}>−</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            selectedTab === 'Maps' && styles.activeTab
          ]}
          onPress={() => setSelectedTab('Maps')}
        >
          <Text style={[
            styles.tabText,
            selectedTab === 'Maps' && styles.activeTabText
          ]}>
            Maps
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabButton,
            selectedTab === 'Shelters' && styles.activeTab
          ]}
          onPress={() => setSelectedTab('Shelters')}
        >
          <Text style={[
            styles.tabText,
            selectedTab === 'Shelters' && styles.activeTabText
          ]}>
            Shelters
          </Text>
        </TouchableOpacity>
      </View>
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
    paddingBottom: 20,
    backgroundColor: "#ffffff",
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
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
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  zoomControls: {
    position: 'absolute',
    right: 20,
    top: 20,
    flexDirection: 'column',
  },
  zoomButton: {
    backgroundColor: '#ffffff',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  zoomText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#374151',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 100,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    marginHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#9ca3af',
  },
  activeTab: {
    backgroundColor: '#dc2626',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  activeTabText: {
    color: '#ffffff',
  },
});