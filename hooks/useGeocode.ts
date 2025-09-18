import { useState } from 'react';

// Google Maps API Key for geocoding
const GOOGLE_MAPS_GEOCODING_API_KEY = 'AIzaSyACw2laKXQGTW634IejVAdK8m0PKngvaRo';

export interface AddressComponents {
  buildingNumber?: string;
  street?: string;
  barangay?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  formattedAddress: string;
}

export const useGeocode = () => {
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAddressFromCoords = async (latitude: number, longitude: number): Promise<AddressComponents | null> => {
    setIsGeocoding(true);
    setError(null);

    try {
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_GEOCODING_API_KEY}&language=en&region=PH`;
      
      const response = await fetch(geocodeUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'OK' && data.results.length > 0) {
        const result = data.results[0];
        const addressComponents = result.address_components;
        
        // Parse address components with enhanced Philippine address handling
        let buildingNumber = '';
        let street = '';
        let barangay = '';
        let city = '';
        let province = '';
        let postalCode = '';
        let country = '';

        // First pass: standard Google Maps types
        addressComponents.forEach((component: any) => {
          const types = component.types;
          
          if (types.includes('street_number')) {
            buildingNumber = component.long_name;
          } else if (types.includes('route')) {
            street = component.long_name;
          } else if (types.includes('sublocality_level_1') || types.includes('sublocality_level_2') || types.includes('sublocality')) {
            if (!barangay) barangay = component.long_name;
          } else if (types.includes('locality') || types.includes('administrative_area_level_2')) {
            city = component.long_name;
          } else if (types.includes('administrative_area_level_1')) {
            province = component.long_name;
          } else if (types.includes('postal_code')) {
            postalCode = component.long_name;
          } else if (types.includes('country')) {
            country = component.long_name;
          }
        });

        // Second pass: Enhanced barangay detection for Philippine addresses
        if (!barangay || barangay === city || barangay === province) {
          addressComponents.forEach((component: any) => {
            const types = component.types;
            const name = component.long_name.toLowerCase();
            
            // Look for political subdivisions that might be barangays
            if (types.includes('political') && 
                !types.includes('country') && 
                !types.includes('administrative_area_level_1') &&
                !types.includes('administrative_area_level_2') &&
                component.long_name !== city && 
                component.long_name !== province &&
                component.long_name !== country) {
              
              // Check if it looks like a barangay name
              if (name.includes('barangay') || name.includes('brgy') || 
                  types.includes('neighborhood') || types.includes('establishment')) {
                if (!barangay || barangay === 'Unknown Barangay') {
                  barangay = component.long_name;
                }
              }
            }
            
            // Also check for compound localities that might contain barangay info
            if (types.includes('compound') || types.includes('establishment')) {
              if (!barangay || barangay === 'Unknown Barangay') {
                barangay = component.long_name;
              }
            }
          });
        }

        // Third pass: Parse from formatted address if still no barangay
        if (!barangay || barangay === 'Unknown Barangay') {
          const formattedAddress = result.formatted_address;
          const addressParts = formattedAddress.split(',');
          
          for (let i = 0; i < addressParts.length; i++) {
            const part = addressParts[i].trim();
            const lowerPart = part.toLowerCase();
            
            // Look for explicit barangay mentions
            if (lowerPart.includes('barangay') || lowerPart.includes('brgy')) {
              barangay = part.replace(/barangay\s*/gi, '').replace(/brgy\.?\s*/gi, '').trim();
              break;
            }
            
            // Look for parts that might be barangays (not city, province, or country)
            if (part !== city && part !== province && part !== country && 
                !lowerPart.includes('philippines') && !lowerPart.includes('luzon') &&
                !part.match(/^\d+$/) && // Not just numbers (postal codes)
                part.length > 2) { // Not abbreviations
              
              // If it's the first specific part and not a street name, it might be a barangay
              if (i === 0 || (i === 1 && addressParts[0].match(/^\d+/))) {
                barangay = part;
                break;
              }
            }
          }
        }

        // Fourth pass: Try to find barangay in "plus_code" or other specific Philippine data
        if ((!barangay || barangay === 'Unknown Barangay') && result.plus_code) {
          // Sometimes barangay info is in compound_code
          if (result.plus_code.compound_code) {
            const compoundParts = result.plus_code.compound_code.split(' ');
            for (const part of compoundParts) {
              if (part !== city && part !== province && part.length > 2 && !part.includes('+')) {
                barangay = part;
                break;
              }
            }
          }
        }

        // Clean up barangay name
        if (barangay) {
          barangay = barangay
            .replace(/^barangay\s*/gi, '')
            .replace(/^brgy\.?\s*/gi, '')
            .trim();
          
          // If it's still empty after cleanup, mark as unknown
          if (!barangay) {
            barangay = 'Unknown Barangay';
          }
        }

        // Ensure we have reasonable defaults for Lipa City
        if (!city || city === 'Unknown') {
          // Check if the coordinates are within Lipa City bounds
          if (latitude >= 13.85 && latitude <= 14.05 && longitude >= 121.10 && longitude <= 121.25) {
            city = 'Lipa City';
          }
        }

        if (!province) {
          if (city === 'Lipa City' || (latitude >= 13.85 && latitude <= 14.05 && longitude >= 121.10 && longitude <= 121.25)) {
            province = 'Batangas';
          }
        }

        // Final validation and cleanup
        const finalResult = {
          buildingNumber,
          street,
          barangay: barangay || 'Unknown Barangay',
          city: city || 'Lipa City',
          province: province || 'Batangas',
          postalCode,
          country: country || 'Philippines',
          formattedAddress: result.formatted_address
        };

        console.log('Geocoding result:', {
          coordinates: { latitude, longitude },
          parsed: finalResult,
          originalComponents: addressComponents.map((c: any) => ({
            name: c.long_name,
            types: c.types
          }))
        });

        return finalResult;
      }
      
      // If no results found, return null
      if (data.status === 'ZERO_RESULTS') {
        console.log('No geocoding results found for coordinates:', { latitude, longitude });
        return null;
      }
      
      throw new Error(`Geocoding failed: ${data.status} - ${data.error_message || 'Unknown error'}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get address';
      setError(errorMessage);
      console.error('Geocoding error:', err);
      return null;
    } finally {
      setIsGeocoding(false);
    }
  };

  const clearError = () => setError(null);

  return {
    getAddressFromCoords,
    isGeocoding,
    error,
    clearError
  };
};