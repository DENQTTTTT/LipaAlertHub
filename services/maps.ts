// services/maps.ts - Fixed version
import * as polyline from '@mapbox/polyline';
import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

const GOOGLE_MAPS_API_KEY_ANDROID = 'AIzaSyDHNKCfdb_Ae0sMaSmdDf88xjOvj2hJM68';
const GOOGLE_MAPS_API_KEY_IOS = 'AIzaSyB2MdahsHMIyhDjBTTVwgAm1i-zVx4OD5U';
const GOOGLE_MAPS_API_KEY_BROWSER = 'AIzaSyACw2laKXQGTW634IejVAdK8m0PKngvaRo';

export interface LocationCoords {
  latitude: number;
  longitude: number;
}

export interface RouteInfo {
  coordinates: LocationCoords[];
  distance: string;
  duration: string;
  bounds: {
    northeast: LocationCoords;
    southwest: LocationCoords;
  };
}

// Get appropriate API key based on platform
function getGoogleMapsApiKey(): string {
  if (Platform.OS === 'ios') {
    return GOOGLE_MAPS_API_KEY_IOS;
  } else if (Platform.OS === 'android') {
    return GOOGLE_MAPS_API_KEY_ANDROID;
  } else {
    return GOOGLE_MAPS_API_KEY_BROWSER;
  }
}

// Check if location services are enabled
export const checkLocationServicesEnabled = async (): Promise<boolean> => {
  try {
    const enabled = await Location.hasServicesEnabledAsync();
    return enabled;
  } catch (error) {
    console.error('Error checking location services:', error);
    return false;
  }
};

// Request location permissions and get current location
export const getCurrentLocation = async (): Promise<LocationCoords | null> => {
  try {
    // First check if location services are enabled
    const servicesEnabled = await checkLocationServicesEnabled();
    if (!servicesEnabled) {
      throw new Error('Location services are disabled');
    }

    // Request permissions
    const { status } = await Location.requestForegroundPermissionsAsync();
    
    if (status !== 'granted') {
      throw new Error('Location permission denied');
    }

    // Get current location
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (error) {
    console.error('Error getting current location:', error);
    return null;
  }
};

// Get directions from origin to destination
export const getDirections = async (
  origin: LocationCoords,
  destination: LocationCoords
): Promise<RouteInfo | null> => {
  try {
    const apiKey = getGoogleMapsApiKey();
    
    const originStr = `${origin.latitude},${origin.longitude}`;
    const destinationStr = `${destination.latitude},${destination.longitude}`;
    
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destinationStr}&key=${apiKey}&mode=driving&alternatives=false`;

    console.log('Fetching directions from Google Maps API...');
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      throw new Error(`Directions API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
    }

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No routes found');
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    // Decode polyline to get route coordinates
    const points = polyline.decode(route.overview_polyline.points);
    const coordinates: LocationCoords[] = points.map((point: [number, number]) => ({
      latitude: point[0],
      longitude: point[1],
    }));

    return {
      coordinates,
      distance: leg.distance.text,
      duration: leg.duration.text,
      bounds: {
        northeast: {
          latitude: route.bounds.northeast.lat,
          longitude: route.bounds.northeast.lng,
        },
        southwest: {
          latitude: route.bounds.southwest.lat,
          longitude: route.bounds.southwest.lng,
        },
      },
    };
  } catch (error) {
    console.error('Error getting directions:', error);
    return null;
  }
};

// Calculate region from bounds with padding
export const getRegionFromBounds = (bounds: RouteInfo['bounds']) => {
  const latitudeDelta = Math.abs(bounds.northeast.latitude - bounds.southwest.latitude) * 1.4; // Add 40% padding
  const longitudeDelta = Math.abs(bounds.northeast.longitude - bounds.southwest.longitude) * 1.4;
  
  const centerLatitude = (bounds.northeast.latitude + bounds.southwest.latitude) / 2;
  const centerLongitude = (bounds.northeast.longitude + bounds.southwest.longitude) / 2;
  
  return {
    latitude: centerLatitude,
    longitude: centerLongitude,
    latitudeDelta: Math.max(latitudeDelta, 0.01), // Minimum delta to avoid too much zoom
    longitudeDelta: Math.max(longitudeDelta, 0.01),
  };
};

// Open external maps app for navigation
export const openExternalMaps = async (destination: LocationCoords, destinationName?: string) => {
  const destinationStr = `${destination.latitude},${destination.longitude}`;
  const label = destinationName ? encodeURIComponent(destinationName) : 'Evacuation Center';
  
  let url: string;
  
  if (Platform.OS === 'ios') {
    // Try Apple Maps first, fallback to Google Maps
    url = `http://maps.apple.com/?daddr=${destinationStr}&dirflg=d&t=m`;
    
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      // Fallback to Google Maps
      url = `comgooglemaps://?daddr=${destinationStr}&directionsmode=driving`;
      
      const canOpenGoogle = await Linking.canOpenURL(url);
      if (!canOpenGoogle) {
        // Final fallback to Google Maps web
        url = `https://www.google.com/maps/dir/?api=1&destination=${destinationStr}&travelmode=driving`;
      }
    }
  } else {
    // Android - Try Google Maps app first
    url = `google.navigation:q=${destinationStr}&mode=d`;
    
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      // Fallback to Google Maps web
      url = `https://www.google.com/maps/dir/?api=1&destination=${destinationStr}&travelmode=driving`;
    }
  }
  
  try {
    await Linking.openURL(url);
    return true;
  } catch (error) {
    console.error('Error opening external maps:', error);
    return false;
  }
};

// Get location permission status
export const getLocationPermissionStatus = async (): Promise<Location.PermissionStatus> => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status;
  } catch (error) {
    console.error('Error getting location permission status:', error);
    return Location.PermissionStatus.UNDETERMINED;
  }
};

// Format distance for display
export const formatDistance = (distance: string): string => {
  if (distance.includes('km') || distance.includes('m')) {
    return distance;
  }
  
  const distanceNum = parseFloat(distance);
  if (isNaN(distanceNum)) {
    return distance;
  }
  
  if (distanceNum >= 1000) {
    return `${(distanceNum / 1000).toFixed(1)} km`;
  } else {
    return `${Math.round(distanceNum)} m`;
  }
};

// Format duration for display
export const formatDuration = (duration: string): string => {
  if (duration.includes('min') || duration.includes('hour')) {
    return duration;
  }
  
  const durationNum = parseFloat(duration);
  if (isNaN(durationNum)) {
    return duration;
  }
  
  const minutes = Math.round(durationNum / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours > 0) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
  } else {
    return `${minutes} min`;
  }
};

export default {
  getCurrentLocation,
  getDirections,
  getRegionFromBounds,
  openExternalMaps,
  formatDistance,
  formatDuration,
  checkLocationServicesEnabled,
  getLocationPermissionStatus,
};