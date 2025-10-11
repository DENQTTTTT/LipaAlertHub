// app/(main)/maps/evacuation.tsx
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { EvacuationCenter, useEvacuationCenters } from '../../../hooks/useEvacuationCenters';
import { getCurrentLocation, getDirections, getRegionFromBounds, LocationCoords, RouteInfo } from '../../../services/maps';

const { width, height } = Dimensions.get('window');
const PRIMARY_RED = '#d73527';

interface SelectedCenter {
  center: EvacuationCenter;
  route?: RouteInfo;
  userLocation?: LocationCoords;
}

const EvacuationCentersScreen = () => {
  const { centers, loading, error } = useEvacuationCenters();
  const mapRef = useRef<MapView>(null);
  
  const [region, setRegion] = useState<Region>({
    latitude: 13.9411,
    longitude: 121.1624,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  
  const [selectedCenter, setSelectedCenter] = useState<SelectedCenter | null>(null);
  const [userLocation, setUserLocation] = useState<LocationCoords | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const getUserLocation = useCallback(async () => {
    setLoadingLocation(true);
    try {
      const location = await getCurrentLocation();
      if (location) {
        setUserLocation(location);
        const newRegion = {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        setRegion(newRegion);
        if (mapRef.current) {
          mapRef.current.animateToRegion(newRegion, 1000);
        }
      }
    } catch (err) {
      console.error('Error getting user location:', err);
    } finally {
      setLoadingLocation(false);
    }
  }, []);

  useEffect(() => {
    getUserLocation();
  }, [getUserLocation]);

  const handleMarkerPress = useCallback(async (center: EvacuationCenter) => {
    setSelectedCenter({ center });
    
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: center.latitude,
        longitude: center.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  }, []);

  const handleGetDirections = useCallback(async () => {
    if (!selectedCenter || !userLocation) {
      Alert.alert('Location Required', 'Please enable location services to get directions.');
      return;
    }

    setLoadingRoute(true);
    try {
      const route = await getDirections(userLocation, {
        latitude: selectedCenter.center.latitude,
        longitude: selectedCenter.center.longitude,
      });

      if (route) {
        setSelectedCenter({
          ...selectedCenter,
          route,
          userLocation,
        });

        if (mapRef.current) {
          const mapRegion = getRegionFromBounds(route.bounds);
          mapRef.current.animateToRegion(mapRegion, 1000);
        }
      } else {
        Alert.alert('Route Error', 'Unable to get directions. Please try again.');
      }
    } catch (err) {
      console.error('Error getting directions:', err);
      Alert.alert('Navigation Error', 'Failed to get directions. Please check your connection.');
    } finally {
      setLoadingRoute(false);
    }
  }, [selectedCenter, userLocation]);

  const handleChatWithCDRRMO = useCallback(() => {
    router.push({
      pathname: '/chat/evacuation-help',
      params: {
        centerName: selectedCenter?.center.name || 'Evacuation Center',
        centerBarangay: selectedCenter?.center.barangay || '',
      }
    });
    setSelectedCenter(null);
  }, [selectedCenter]);

  const handleCenterFromList = useCallback((center: EvacuationCenter) => {
    handleMarkerPress(center);
  }, [handleMarkerPress]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await getUserLocation();
    setRefreshing(false);
  }, [getUserLocation]);

  const renderCenterCard = useCallback((center: EvacuationCenter) => (
    <TouchableOpacity
      key={center.id}
      style={styles.centerCard}
      onPress={() => handleCenterFromList(center)}
      activeOpacity={0.7}
    >
      <View style={styles.cardContent}>
        <View style={styles.photoContainer}>
          {center.photoUrl ? (
            <Image source={{ uri: center.photoUrl }} style={styles.centerPhoto} />
          ) : (
            <View style={styles.placeholderPhoto}>
              <Text style={styles.placeholderText}>🏠</Text>
            </View>
          )}
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.centerName} numberOfLines={2}>
            {center.name}
          </Text>
          <Text style={styles.centerBarangay} numberOfLines={1}>
            📍 {center.barangay}
          </Text>
          <Text style={styles.tapHint}>Tap to view on map</Text>
        </View>

        <View style={styles.cardArrow}>
          <Text style={styles.arrowText}>›</Text>
        </View>
      </View>
    </TouchableOpacity>
  ), [handleCenterFromList]);

  const renderModal = () => {
    if (!selectedCenter) return null;

    const { center, route } = selectedCenter;

    return (
      <Modal
        visible={!!selectedCenter}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedCenter(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSelectedCenter(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalPhotoContainer}>
              {center.photoUrl ? (
                <Image source={{ uri: center.photoUrl }} style={styles.modalPhoto} />
              ) : (
                <View style={styles.modalPlaceholder}>
                  <Text style={styles.modalPlaceholderText}>🏠</Text>
                </View>
              )}
            </View>

            <View style={styles.modalInfo}>
              <Text style={styles.modalTitle}>{center.name}</Text>
              <Text style={styles.modalBarangay}>📍 {center.barangay}</Text>
              
              {route && (
                <View style={styles.routeInfo}>
                  <Text style={styles.routeDistance}>🚗 {route.distance} • {route.duration}</Text>
                </View>
              )}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.directionsButton]}
                onPress={handleGetDirections}
                disabled={loadingRoute}
                activeOpacity={0.8}
              >
                {loadingRoute ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.actionButtonText}>📍 Get Directions</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.chatButton]}
                onPress={handleChatWithCDRRMO}
                activeOpacity={0.8}
              >
                <Text style={styles.actionButtonText}>💬 Chat with CDRRMO</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={PRIMARY_RED} />
        <Text style={styles.loadingText}>Loading evacuation centers...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>⚠️ {error}</Text>
        <TouchableOpacity 
          style={styles.retryButton} 
          onPress={onRefresh}
          activeOpacity={0.8}
        >
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={region}
          showsUserLocation={true}
          showsMyLocationButton={false}
          showsCompass={true}
          showsScale={false}
          showsBuildings={false}
          showsTraffic={false}
          mapType="standard"
          zoomEnabled={true}
          scrollEnabled={true}
          rotateEnabled={true}
          pitchEnabled={false}
        >
          {centers.map((center) => (
            <Marker
              key={center.id}
              coordinate={{
                latitude: center.latitude,
                longitude: center.longitude,
              }}
              title={center.name}
              description={`📍 ${center.barangay}`}
              onPress={() => handleMarkerPress(center)}
            >
              <View style={styles.customMarker}>
                <Text style={styles.markerText}>🏠</Text>
              </View>
            </Marker>
          ))}

          {selectedCenter?.route && (
            <Polyline
              coordinates={selectedCenter.route.coordinates}
              strokeColor={PRIMARY_RED}
              strokeWidth={4}
              lineDashPattern={[5, 5]}
            />
          )}
        </MapView>

        <TouchableOpacity
          style={styles.locationButton}
          onPress={getUserLocation}
          disabled={loadingLocation}
          activeOpacity={0.7}
        >
          {loadingLocation ? (
            <ActivityIndicator color={PRIMARY_RED} size="small" />
          ) : (
            <Text style={styles.locationButtonText}>📍</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Floating White Box - Bottom Right */}
      <View style={styles.floatingBox}>
        <View style={styles.floatingBoxHeader}>
          <Text style={styles.floatingBoxTitle}>Evacuation Centers</Text>
          <Text style={styles.floatingBoxCount}>({centers.length})</Text>
        </View>
        
        <ScrollView
          style={styles.floatingBoxList}
          showsVerticalScrollIndicator={true}
          nestedScrollEnabled={true}
        >
          {centers.length === 0 ? (
            <Text style={styles.floatingBoxEmptyText}>No active centers</Text>
          ) : (
            centers.map((center) => (
              <TouchableOpacity
                key={center.id}
                style={styles.floatingBoxItem}
                onPress={() => handleCenterFromList(center)}
                activeOpacity={0.7}
              >
                <Text style={styles.floatingBoxItemName} numberOfLines={1}>
                  {center.name}
                </Text>
                <Text style={styles.floatingBoxItemLocation} numberOfLines={1}>
                  {center.barangay}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>

      <View style={styles.listContainer}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Active Evacuation Centers ({centers.length})</Text>
        </View>
        
        <ScrollView
          style={styles.centersList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[PRIMARY_RED]}
            />
          }
        >
          {centers.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No active evacuation centers available
              </Text>
            </View>
          ) : (
            centers.map(renderCenterCard)
          )}
          
          <View style={styles.listBottomSpacing} />
        </ScrollView>
      </View>

      {renderModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  
  // Loading & Error States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#d73527',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: PRIMARY_RED,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Map
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  customMarker: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 2,
    borderColor: PRIMARY_RED,
  },
  markerText: {
    fontSize: 18,
  },
  locationButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: '#ffffff',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  locationButtonText: {
    fontSize: 18,
  },

  // List
  listContainer: {
    backgroundColor: '#ffffff',
    maxHeight: height * 0.4,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  listHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  listTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  centersList: {
    flex: 1,
  },
  
  // Cards
  centerCard: {
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: PRIMARY_RED,
  },
  cardContent: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
  },
  photoContainer: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
    overflow: 'hidden',
  },
  centerPhoto: {
    width: '100%',
    height: '100%',
  },
  placeholderPhoto: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 24,
  },
  cardInfo: {
    flex: 1,
  },
  centerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: PRIMARY_RED,
    marginBottom: 4,
  },
  centerBarangay: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  tapHint: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  cardArrow: {
    paddingLeft: 8,
  },
  arrowText: {
    fontSize: 24,
    color: '#d1d5db',
    fontWeight: '300',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: height * 0.7,
    minHeight: 300,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    paddingBottom: 0,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#6b7280',
    fontWeight: '300',
  },
  modalPhotoContainer: {
    height: 180,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  modalPhoto: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  modalPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalPlaceholderText: {
    fontSize: 48,
  },
  modalInfo: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: PRIMARY_RED,
    marginBottom: 8,
  },
  modalBarangay: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 12,
  },
  routeInfo: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
  },
  routeDistance: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  modalActions: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  directionsButton: {
    backgroundColor: PRIMARY_RED,
  },
  chatButton: {
    backgroundColor: '#374151',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Empty State
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  listBottomSpacing: {
    height: 20,
  },

  // Floating White Box - Bottom Right
  floatingBox: {
    position: 'absolute',
    bottom: 20,
    right: 15,
    width: 280,
    maxHeight: 300,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  floatingBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  floatingBoxTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333333',
  },
  floatingBoxCount: {
    fontSize: 14,
    fontWeight: '600',
    color: PRIMARY_RED,
  },
  floatingBoxList: {
    maxHeight: 240,
  },
  floatingBoxItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  floatingBoxItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 4,
  },
  floatingBoxItemLocation: {
    fontSize: 12,
    color: '#666666',
  },
  floatingBoxEmptyText: {
    textAlign: 'center',
    padding: 20,
    fontSize: 14,
    color: '#666666',
    fontStyle: 'italic',
  },
});

export default EvacuationCentersScreen;