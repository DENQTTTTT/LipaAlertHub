import { useEffect, useState } from 'react';
import { Announcement, announcementService } from '../services/announcements';

export const useAnnouncements = (isDashboard: boolean = false) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Choose the appropriate service method based on context
    const fetchMethod = isDashboard 
      ? announcementService.getDashboardAnnouncements 
      : announcementService.getAllAnnouncements;

    const unsubscribe = fetchMethod((fetchedAnnouncements) => {
      setAnnouncements(fetchedAnnouncements);
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [isDashboard]);

  return {
    announcements,
    loading,
    error,
    refetch: () => {
      setLoading(true);
      // The real-time listener will automatically update
    }
  };
};

export const useAnnouncementById = (id: string | null) => {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const fetchAnnouncement = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await announcementService.getAnnouncementById(id);
        setAnnouncement(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch announcement');
        setAnnouncement(null);
      } finally {
        setLoading(false);
      }
    };

    fetchAnnouncement();
  }, [id]);

  return {
    announcement,
    loading,
    error
  };
};