import {
    collection,
    doc,
    DocumentData,
    getDoc,
    limit,
    onSnapshot,
    orderBy,
    query,
    QuerySnapshot,
    Timestamp
} from 'firebase/firestore';
import { db } from './firebase';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  excerpt?: string;
  imageUrl?: string;
  createdAt: Timestamp;
  createdBy: string;
}

export interface AnnouncementData {
  title: string;
  body: string;
  excerpt?: string;
  imageUrl?: string;
  createdAt: Timestamp;
  createdBy: string;
}

export const announcementService = {
  // Get all announcements with real-time updates
  getAllAnnouncements: (callback: (announcements: Announcement[]) => void) => {
    const q = query(
      collection(db, 'announcements'),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const announcements: Announcement[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as AnnouncementData;
          announcements.push({
            id: doc.id,
            ...data,
            // Generate excerpt if not provided
            excerpt: data.excerpt || data.body.substring(0, 100) + (data.body.length > 100 ? '...' : '')
          });
        });
        callback(announcements);
      },
      (error) => {
        console.error('Error fetching announcements:', error);
        callback([]);
      }
    );
  },

  // Get limited announcements for dashboard (2 latest)
  getDashboardAnnouncements: (callback: (announcements: Announcement[]) => void) => {
    const q = query(
      collection(db, 'announcements'),
      orderBy('createdAt', 'desc'),
      limit(2)
    );

    return onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const announcements: Announcement[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as AnnouncementData;
          announcements.push({
            id: doc.id,
            ...data,
            // Generate excerpt if not provided
            excerpt: data.excerpt || data.body.substring(0, 100) + (data.body.length > 100 ? '...' : '')
          });
        });
        callback(announcements);
      },
      (error) => {
        console.error('Error fetching dashboard announcements:', error);
        callback([]);
      }
    );
  },

  // Get single announcement by ID
  getAnnouncementById: async (id: string): Promise<Announcement | null> => {
    try {
      const docRef = doc(db, 'announcements', id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as AnnouncementData;
        return {
          id: docSnap.id,
          ...data,
          excerpt: data.excerpt || data.body.substring(0, 100) + (data.body.length > 100 ? '...' : '')
        };
      } else {
        return null;
      }
    } catch (error) {
      console.error('Error fetching announcement:', error);
      return null;
    }
  },

  // Format timestamp for display
  formatDate: (timestamp: Timestamp): string => {
    const date = timestamp.toDate();
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      if (diffInHours < 1) {
        const minutes = Math.floor(diffInHours * 60);
        return `${minutes} min${minutes !== 1 ? 's' : ''} ago`;
      }
      const hours = Math.floor(diffInHours);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else if (diffInHours < 24 * 7) {
      const days = Math.floor(diffInHours / 24);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  }
};