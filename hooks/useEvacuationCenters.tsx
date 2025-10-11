// hooks/useEvacuationCenters.tsx
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../services/firebase';

export interface EvacuationCenter {
  id: string;
  name: string;
  barangay: string;
  latitude: number;
  longitude: number;
  photoUrl?: string;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export const useEvacuationCenters = () => {
  const [centers, setCenters] = useState<EvacuationCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const fetchCenters = async () => {
      try {
        setLoading(true);
        setError(null);

        const centersRef = collection(db, 'evacuation_centers');
        const q = query(centersRef, where('isActive', '==', true));

        unsubscribe = onSnapshot(q, 
          (snapshot) => {
            const evacuationCenters: EvacuationCenter[] = [];
            
            snapshot.forEach((doc) => {
              const data = doc.data();
              evacuationCenters.push({
                id: doc.id,
                name: data.name || 'Unnamed Shelter',
                barangay: data.barangay || 'Unknown Barangay',
                latitude: data.latitude || 0,
                longitude: data.longitude || 0,
                photoUrl: data.photoUrl,
                isActive: data.isActive || false,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt
              });
            });

            // Sort by name for consistent display
            evacuationCenters.sort((a, b) => a.name.localeCompare(b.name));
            
            setCenters(evacuationCenters);
            setLoading(false);
          },
          (err) => {
            console.error('Error fetching evacuation centers:', err);
            setError('Failed to load evacuation centers');
            setLoading(false);
          }
        );

      } catch (err) {
        console.error('Error setting up evacuation centers listener:', err);
        setError('Failed to initialize evacuation centers');
        setLoading(false);
      }
    };

    fetchCenters();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  return {
    centers,
    loading,
    error,
    refetch: () => {
      setLoading(true);
      setError(null);
    }
  };
};