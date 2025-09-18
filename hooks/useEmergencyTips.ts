import {
  collection,
  DocumentData,
  onSnapshot,
  query,
  QuerySnapshot,
  where
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../services/firebase';

export interface EmergencyTip {
  id: string;
  title: string;
  description: string;
  category?: string; 
  order?: number;       // optional now
  isActive?: boolean;   // optional now
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
}

export interface TipCategory {
  name: string;
  count: number;
  icon: string;
  gradient: string[];
}

export const useEmergencyTips = (category?: string) => {
  const [tips, setTips] = useState<EmergencyTip[]>([]);
  const [categories, setCategories] = useState<TipCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Category configurations with icons & gradients
  const categoryConfigs: Record<string, { icon: string; gradient: string[] }> = {
    'Typhoon': { icon: '🌪️', gradient: ['#3b82f6', '#1e40af'] },
    'Flood': { icon: '🌊', gradient: ['#06b6d4', '#0891b2'] },
    'Fire': { icon: '🔥', gradient: ['#f97316', '#ea580c'] },
    'Earthquake': { icon: '🏚️', gradient: ['#6b7280', '#4b5563'] },
    'Health': { icon: '🦠', gradient: ['#10b981', '#059669'] },
    'General': { icon: '⚠️', gradient: ['#8b5cf6', '#7c3aed'] },
  };

  // Fallback tips if Firestore fails
  const getFallbackTips = (): EmergencyTip[] => [
    {
      id: 'fallback_1',
      title: 'Stay Calm and Breathe',
      description: 'Panic makes it harder to think clearly. Take a deep breath, focus, and decide step by step.',
      category: 'General',
      order: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'fallback_2',
      title: 'Prioritize Safety First',
      description: 'Your life and safety come first. Leave dangerous areas immediately and seek a safe spot.',
      category: 'General',
      order: 2,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'fallback_3',
      title: 'Call for Help Quickly',
      description: 'Use LipaAlertHub! Hit the SOS button right away to call for help and report the situation.',
      category: 'General',
      order: 3,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const setupSubscription = () => {
      try {
        const tipsRef = collection(db, 'emergency_tips');
        let tipsQuery;

        if (category) {
          // Filter by category only (no isActive/order required)
          tipsQuery = query(
            tipsRef,
            where('category', '==', category)
          );
        } else {
          // Load all tips
          tipsQuery = query(tipsRef);
        }

        unsubscribe = onSnapshot(
          tipsQuery,
          (snapshot: QuerySnapshot<DocumentData>) => {
            const fetchedTips: EmergencyTip[] = [];

            snapshot.forEach((doc) => {
              const data = doc.data();
              fetchedTips.push({
                id: doc.id,
                ...data,
                category: data.category || 'General'
              } as EmergencyTip);
            });

            // Sort locally by `order` if exists, otherwise by `createdAt`
            fetchedTips.sort((a, b) => {
              if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order;
              }
              if (a.createdAt && b.createdAt) {
                return new Date(a.createdAt.toDate?.() || a.createdAt).getTime() -
                       new Date(b.createdAt.toDate?.() || b.createdAt).getTime();
              }
              return 0;
            });

            setTips(fetchedTips);

            // Build categories if no specific category
            if (!category) {
              const categoryMap = new Map<string, number>();
              fetchedTips.forEach(tip => {
                const cat = tip.category || 'General';
                categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
              });

              const categoriesWithCounts: TipCategory[] = Array.from(categoryMap.entries()).map(([name, count]) => ({
                name,
                count,
                icon: categoryConfigs[name]?.icon || '📋',
                gradient: categoryConfigs[name]?.gradient || ['#6b7280', '#4b5563']
              }));

              setCategories(categoriesWithCounts.sort((a, b) => b.count - a.count));
            }

            setLoading(false);
            setError(null);
          },
          (err) => {
            console.error('Error in emergency tips subscription:', err);
            setError('Failed to load emergency tips');

            // Fallback data
            const fallbackTips = getFallbackTips();
            setTips(category ? fallbackTips.filter(t => t.category === category) : fallbackTips);
            if (!category) {
              setCategories([{
                name: 'General',
                count: fallbackTips.length,
                icon: '⚠️',
                gradient: ['#8b5cf6', '#7c3aed']
              }]);
            }
            setLoading(false);
          }
        );
      } catch (err) {
        console.error('Error setting up subscription:', err);
        setError('Failed to load emergency tips');
        setTips(getFallbackTips());
        setLoading(false);
      }
    };

    setupSubscription();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [category]);

  const refetch = () => {
    setLoading(true);
    // Subscription will push updates automatically
  };

  return {
    tips,
    categories,
    loading,
    error,
    refetch
  };
};
