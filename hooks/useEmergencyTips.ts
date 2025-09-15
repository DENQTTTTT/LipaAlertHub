import { useEffect, useState } from 'react';
import { EmergencyTip, subscribeToEmergencyTips } from '../services/emergencyTips';

export const useEmergencyTips = () => {
  const [tips, setTips] = useState<EmergencyTip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    try {
      // Subscribe to real-time updates
      unsubscribe = subscribeToEmergencyTips((updatedTips) => {
        setTips(updatedTips);
        setLoading(false);
        setError(null);
      });
    } catch (err) {
      console.error('Error setting up emergency tips subscription:', err);
      setError('Failed to load emergency tips');
      setLoading(false);
    }

    // Cleanup subscription on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  return {
    tips,
    loading,
    error,
    refetch: () => {
      setLoading(true);
      // The subscription will automatically update the tips
    }
  };
};