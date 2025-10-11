import {
  collection,
  DocumentData,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  QuerySnapshot,
  where
} from 'firebase/firestore';
import { db } from './firebase';

export interface EmergencyTip {
  id: string;
  title: string;
  description: string;
  order: number;
  isActive: boolean;
  createdAt: any;
  updatedAt: any;
  createdBy?: string;
}

/**
 * Get all active emergency tips ordered by their order field
 */
export const getEmergencyTips = async (): Promise<EmergencyTip[]> => {
  try {
    const tipsQuery = query(
      collection(db, 'emergency_tips'),
      where('isActive', '==', true),
      orderBy('order', 'asc')
    );
    
    const snapshot = await getDocs(tipsQuery);
    const tips: EmergencyTip[] = [];
    
    snapshot.forEach((doc) => {
      tips.push({
        id: doc.id,
        ...doc.data()
      } as EmergencyTip);
    });
    
    return tips;
  } catch (error) {
    console.error('Error fetching emergency tips:', error);
    // Return fallback tips if Firebase fails
    return getFallbackTips();
  }
};

/**
 * Subscribe to real-time emergency tips updates
 */
export const subscribeToEmergencyTips = (
  callback: (tips: EmergencyTip[]) => void
): (() => void) => {
  try {
    const tipsQuery = query(
      collection(db, 'emergency_tips'),
      where('isActive', '==', true),
      orderBy('order', 'asc')
    );
    
    const unsubscribe = onSnapshot(
      tipsQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const tips: EmergencyTip[] = [];
        snapshot.forEach((doc) => {
          tips.push({
            id: doc.id,
            ...doc.data()
          } as EmergencyTip);
        });
        callback(tips);
      },
      (error) => {
        console.error('Error in emergency tips subscription:', error);
        // Provide fallback tips on error
        callback(getFallbackTips());
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up emergency tips subscription:', error);
    // Return fallback tips immediately
    callback(getFallbackTips());
    // Return empty unsubscribe function
    return () => {};
  }
};

/**
 * Fallback tips in case Firebase is unavailable
 */
const getFallbackTips = (): EmergencyTip[] => {
  return [
    {
      id: 'fallback_1',
      title: 'Stay Calm and Breathe',
      description: 'Panic makes it harder to think clearly. Take a deep breath, focus on what\'s happening, and make decisions step-by-step.',
      order: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'fallback_2', 
      title: 'Prioritize Safety First',
      description: 'Whether it\'s a fire, accident, or natural disaster, your life and safety come first. Leave dangerous areas immediately and seek a safe spot.',
      order: 2,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'fallback_3',
      title: 'Call for Help Quickly',
      description: 'In any emergency, don\'t hesitate to use the LipaAlertHub! Especially hit the SOS Button right away to quickly call for help and report the situation. Your fast action could save lives!',
      order: 3,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];
};