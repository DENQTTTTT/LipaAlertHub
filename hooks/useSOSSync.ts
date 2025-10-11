import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { auth, db } from '../services/firebase';

const SOS_LOGS_KEY = 'sos_logs';
const SYNC_INTERVAL = 3000;
const DEFAULT_BARANGAY = 'Poblacion Barangay 1';

export interface SOSLog {
  id: string;
  userId: string;
  userName: string;
  reporterPhone?: string;
  reporterBarangay?: string;
  reporterLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    timestamp?: number;
    address?: string;
  };
  selectedAgency: string;
  phoneNumber: string;
  calledAt: string;
  synced: boolean;
  fromOffline: boolean;
  emergencyType?: string;
  barangay: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    timestamp?: number;
    address: string;
  };
  // ✅ ADD THESE FOR GUEST SUPPORT
  guestId?: string | null;
  userType?: 'guest' | 'resident';
  deviceId?: string | null;
}

export interface SOSCall {
  id?: string;
  userId: string;
  userName: string;
  reporterPhone?: string;
  reporterBarangay?: string;
  reporterLocation?: any;
  selectedAgency: string;
  phoneNumber: string;
  agencyPhoneNumber?: string;
  calledAt: any;
  synced: boolean;
  fromOffline: boolean;
  emergencyType?: string;
  barangay: string;
  type: string;
  status: string;
  hasPatientForm: boolean;
  assignedAgency: string | null;
  assignedRescuer: string | null;
  assignedRescuers: string[];
  createdAt: any;
  lastUpdated: any;
  location?: any;
  fullAddress?: string;
  addressLine?: string;
}

// Ensure user document exists with proper role
const ensureUserDocument = async (uid: string, email: string | null, name: string) => {
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        email: email || '',
        name: name || 'Resident',
        role: 'resident',
        status: 'active',
        createdAt: serverTimestamp(),
        warnings: 0,
        strikes: 0
      });
      console.log('✅ User document created');
    } else if (!userSnap.data().role) {
      await updateDoc(userRef, { role: 'resident' });
      console.log('✅ User role updated');
    }
  } catch (error) {
    console.error('Error ensuring user document:', error);
    throw error;
  }
};

export function useSOSSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [recentSOSCalls, setRecentSOSCalls] = useState<SOSCall[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const lastSyncAttempt = useRef<number>(0);

  const updateUnsyncedCount = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(SOS_LOGS_KEY);
      const logs: SOSLog[] = saved ? JSON.parse(saved) : [];
      const unsynced = logs.filter(l => !l.synced);
      if (isMountedRef.current) {
        setUnsyncedCount(unsynced.length);
      }
      return unsynced.length;
    } catch (error) {
      console.error('Error updating unsynced count:', error);
      return 0;
    }
  }, []);

  const syncSOSLogs = useCallback(async (force: boolean = false) => {
    const now = Date.now();
    if (!force && (isSyncing || now - lastSyncAttempt.current < 2000)) {
      return false;
    }

    lastSyncAttempt.current = now;

    try {
      if (isMountedRef.current) setIsSyncing(true);
      
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        console.log('No internet connection');
        return false;
      }

      const saved = await AsyncStorage.getItem(SOS_LOGS_KEY);
      const logs: SOSLog[] = saved ? JSON.parse(saved) : [];
      
      // ✅ SYNC BOTH AUTHENTICATED USER LOGS AND ATTACHED GUEST LOGS
      const unsynced = logs.filter(l => !l.synced);
      
      if (unsynced.length === 0) return false;

      console.log(`Syncing ${unsynced.length} SOS logs...`);
      let syncedAny = false;

      for (const log of unsynced) {
        try {
          // ✅ Define isGuest variable
          const isGuest = !auth.currentUser || log.fromOffline;

          // Ensure user document exists for authenticated users
          if (auth.currentUser && log.userId === auth.currentUser.uid) {
            await ensureUserDocument(
              auth.currentUser.uid,
              auth.currentUser.email,
              auth.currentUser.displayName || 'Resident'
            );
          }

          const calledAtTimestamp = Timestamp.fromDate(new Date(log.calledAt));
          const finalUserId = log.userId;
          const finalUserName = log.userName;

          // Get user profile for additional info (only for authenticated users)
          let userProfile = null;
          try {
            const userDoc = await getDoc(doc(db, 'users', finalUserId));
            if (userDoc.exists()) {
              userProfile = userDoc.data();
            }
          } catch (error) {
            console.log('Could not fetch user profile:', error);
          }

          const reporterPhone = log.reporterPhone || 
                               userProfile?.phoneNumber || 
                               userProfile?.number || 
                               userProfile?.phone || 
                               null;

          let reporterBarangay = log.reporterBarangay || 
                                userProfile?.barangay || 
                                log.barangay;

          reporterBarangay = reporterBarangay || DEFAULT_BARANGAY;
          const reporterLocation = log.reporterLocation || log.location || null;

          console.log('📱 Reporter Details:', {
            userId: finalUserId,
            userName: finalUserName,
            phone: reporterPhone,
            barangay: reporterBarangay,
            location: reporterLocation,
            originallyGuest: log.fromOffline,
            isGuest: isGuest
          });

          const incidentReportData: any = {
            // Required base fields
            userId: finalUserId,
            type: "sos",
            status: "pending",
            createdAt: serverTimestamp(),
            
            // ✅ ADD GUEST FIELDS FOR SECURITY RULES
            userType: isGuest ? 'guest' : 'resident',
            guestId: isGuest ? finalUserId : null,
            deviceId: isGuest ? `device_${Date.now()}` : null,

            // User info
            reporterId: finalUserId,
            userName: finalUserName,
            email: auth.currentUser?.email || null,
            reporterPhone: reporterPhone,
            reporterBarangay: reporterBarangay,
            
            // SOS-specific fields
            selectedAgency: log.selectedAgency,
            agencyPhoneNumber: log.phoneNumber,
            emergencyType: log.emergencyType || 'General Emergency',
            
            // Location data
            barangay: reporterBarangay,
            fullAddress: reporterLocation?.address || log.location?.address || `${reporterBarangay}, Lipa City`,
            addressLine: reporterLocation?.address || log.location?.address || `${reporterBarangay}, Lipa City`,
            
            // Timestamps
            calledAt: calledAtTimestamp,
            lastUpdated: serverTimestamp(),
            
            // Required security fields
            hasPatientForm: false,
            assignedAgency: null,
            assignedRescuer: null,
            assignedRescuers: [],
            reviewed: false,
            synced: false,
            
            // Source tracking
            fromOffline: log.fromOffline,
            originallyGuest: log.fromOffline,
          };

          // Add location data if available
          if (reporterLocation) {
            incidentReportData.location = {
              latitude: reporterLocation.latitude,
              longitude: reporterLocation.longitude,
              ...(reporterLocation.accuracy && { accuracy: reporterLocation.accuracy }),
              ...(reporterLocation.timestamp && { timestamp: reporterLocation.timestamp })
            };
            incidentReportData.reporterLocation = reporterLocation;
          } else if (log.location) {
            incidentReportData.location = {
              latitude: log.location.latitude,
              longitude: log.location.longitude,
              ...(log.location.accuracy && { accuracy: log.location.accuracy }),
              ...(log.location.timestamp && { timestamp: log.location.timestamp })
            };
          }

          console.log('Creating SOS report:', {
            reporter: finalUserName,
            reporterPhone: reporterPhone,
            reporterBarangay: reporterBarangay,
            agency: log.selectedAgency,
            location: incidentReportData.location,
            originallyGuest: log.fromOffline,
            userType: isGuest ? 'guest' : 'resident'
          });

          const docRef = await addDoc(collection(db, 'incident_reports'), incidentReportData);
          
          // Update synced status
          await updateDoc(doc(db, 'incident_reports', docRef.id), {
            synced: true
          });
          
          log.synced = true;
          syncedAny = true;

          console.log(`✅ Synced SOS: ${log.id} -> ${docRef.id} (${log.fromOffline ? 'Originally Guest' : 'Direct User'})`);
        } catch (error: any) {
          console.error('❌ Error syncing SOS log:', error);
          console.error('Code:', error.code);
          console.error('Message:', error.message);
          
          if (error.code === 'permission-denied') {
            console.error('PERMISSION DENIED - Check security rules');
            break;
          }
        }
      }

      if (syncedAny) {
        await AsyncStorage.setItem(SOS_LOGS_KEY, JSON.stringify(logs));
        await updateUnsyncedCount();
        console.log('✅ SOS logs synced successfully');
      }
      
      return syncedAny;
    } catch (error) {
      console.error('Error in syncSOSLogs:', error);
      return false;
    } finally {
      if (isMountedRef.current) setIsSyncing(false);
    }
  }, [isSyncing, updateUnsyncedCount]);

  // ✅ GUEST FUNCTION: Attach guest logs to authenticated user
  const attachUserToGuestLogs = useCallback(async (userId: string) => {
    try {
      const saved = await AsyncStorage.getItem(SOS_LOGS_KEY);
      const logs: SOSLog[] = saved ? JSON.parse(saved) : [];
      
      // Find guest logs (logs with guest_ prefix)
      const guestLogs = logs.filter(log => 
        log.userId.startsWith('guest_') && !log.synced
      );
      
      if (guestLogs.length === 0) {
        console.log('No guest logs to attach');
        return 0;
      }

      let attachedCount = 0;
      
      for (const log of guestLogs) {
        // Update the log with the new authenticated user ID
        log.userId = userId;
        log.userName = auth.currentUser?.displayName || 'User';
        log.fromOffline = true; // Mark as originally from guest
        attachedCount++;
      }

      // Save updated logs back to AsyncStorage
      await AsyncStorage.setItem(SOS_LOGS_KEY, JSON.stringify(logs));
      
      console.log(`✅ Attached ${attachedCount} guest SOS logs to user ${userId}`);
      
      // Sync the newly attached logs
      if (attachedCount > 0) {
        await syncSOSLogs(true);
      }
      
      return attachedCount;
      
    } catch (error) {
      console.error('Error attaching guest logs:', error);
      return 0;
    }
  }, [syncSOSLogs]);

  // Auto-sync interval
  useEffect(() => {
    if (unsyncedCount > 0 && isOnline) {
      syncIntervalRef.current = setInterval(() => syncSOSLogs(), SYNC_INTERVAL);
    }
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [unsyncedCount, isOnline, syncSOSLogs]);

  // Network listener
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const wasOffline = !isOnline;
      const isNowOnline = state.isConnected || false;
      setIsOnline(isNowOnline);
      if (wasOffline && isNowOnline) {
        setTimeout(() => syncSOSLogs(true), 500);
      }
    });
    return () => unsubscribe();
  }, [isOnline, syncSOSLogs]);

  // AppState listener
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && isOnline) {
        syncSOSLogs(true);
      }
    });
    return () => subscription.remove();
  }, [isOnline, syncSOSLogs]);

  // Initial sync
  useEffect(() => {
    const initSync = async () => {
      await updateUnsyncedCount();
      await syncSOSLogs(true);
    };
    initSync();
  }, []);

  // Listen to recent SOS calls for authenticated users
  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'incident_reports'),
      where('userId', '==', auth.currentUser.uid),
      where('type', '==', 'sos'),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const calls: SOSCall[] = [];
      snapshot.forEach((doc) => {
        calls.push({ id: doc.id, ...doc.data() } as SOSCall);
      });
      if (isMountedRef.current) setRecentSOSCalls(calls);
    }, (error) => console.error('Error listening to SOS calls:', error));

    return () => unsubscribe();
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, []);

  const saveSOSLog = useCallback(async (sosLog: Omit<SOSLog, 'id' | 'synced'>) => {
    try {
      const barangay = sosLog.barangay || 
                      sosLog.reporterBarangay ||
                      sosLog.location?.address?.split(',').pop()?.trim() || 
                      DEFAULT_BARANGAY;

      // ✅ GUEST SUPPORT: Generate guest ID if no user
      const isGuest = !auth.currentUser;
      const userId = isGuest ? `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : auth.currentUser!.uid;
      const userName = isGuest ? 'Guest User' : (sosLog.userName || auth.currentUser?.displayName || 'User');

      const newLog: SOSLog = {
        ...sosLog,
        userId: userId,
        userName: userName,
        barangay,
        reporterBarangay: sosLog.reporterBarangay || barangay,
        fromOffline: isGuest, // TRUE for guests
        id: `sos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        synced: false,
        // ✅ ADD GUEST FIELDS
        guestId: isGuest ? userId : null,
        userType: isGuest ? 'guest' : 'resident',
        deviceId: isGuest ? `device_${Date.now()}` : null
      };

      const saved = await AsyncStorage.getItem(SOS_LOGS_KEY);
      const logs: SOSLog[] = saved ? JSON.parse(saved) : [];
      logs.push(newLog);

      await AsyncStorage.setItem(SOS_LOGS_KEY, JSON.stringify(logs));
      
      console.log('SOS log saved:', { 
        id: newLog.id, 
        userId: newLog.userId, 
        isGuest: isGuest,
        userName: newLog.userName,
        userType: newLog.userType
      });
      
      await updateUnsyncedCount();

      // Auto-sync if online and authenticated (not guest)
      const netInfo = await NetInfo.fetch();
      if (netInfo.isConnected && auth.currentUser && !isGuest) {
        setTimeout(() => syncSOSLogs(true), 300);
      }

      return { 
        success: true, 
        log: newLog
      };
    } catch (error) {
      console.error('Error saving SOS log:', error);
      return { success: false, error };
    }
  }, [updateUnsyncedCount, syncSOSLogs]);

  const getRecentSOSLogs = useCallback(async (count: number = 5): Promise<SOSLog[]> => {
    try {
      const saved = await AsyncStorage.getItem(SOS_LOGS_KEY);
      const logs: SOSLog[] = saved ? JSON.parse(saved) : [];
      
      // For authenticated users, return their logs + guest logs
      // For guests, return only guest logs
      let userLogs = logs;
      if (auth.currentUser) {
        userLogs = logs.filter(log => 
          log.userId === auth.currentUser?.uid || log.userId.startsWith('guest_')
        );
      } else {
        userLogs = logs.filter(log => log.userId.startsWith('guest_'));
      }
      
      return userLogs
        .sort((a, b) => new Date(b.calledAt).getTime() - new Date(a.calledAt).getTime())
        .slice(0, count);
    } catch (error) {
      console.error('Error getting recent SOS logs:', error);
      return [];
    }
  }, []);

  const clearSyncedLogs = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(SOS_LOGS_KEY);
      const logs: SOSLog[] = saved ? JSON.parse(saved) : [];
      
      // Keep only unsynced logs
      const unsyncedLogs = logs.filter(l => !l.synced);
      
      await AsyncStorage.setItem(SOS_LOGS_KEY, JSON.stringify(unsyncedLogs));
      console.log('Cleared synced logs');
    } catch (error) {
      console.error('Error clearing synced logs:', error);
    }
  }, []);

  // ✅ NEW: Get guest logs count
  const getGuestLogsCount = useCallback(async (): Promise<number> => {
    try {
      const saved = await AsyncStorage.getItem(SOS_LOGS_KEY);
      const logs: SOSLog[] = saved ? JSON.parse(saved) : [];
      const guestLogs = logs.filter(log => 
        log.userId.startsWith('guest_') && !log.synced
      );
      return guestLogs.length;
    } catch (error) {
      console.error('Error getting guest logs count:', error);
      return 0;
    }
  }, []);

  return {
    saveSOSLog,
    syncSOSLogs,
    getRecentSOSLogs,
    clearSyncedLogs,
    attachUserToGuestLogs,
    getGuestLogsCount,
    isSyncing,
    unsyncedCount,
    recentSOSCalls,
    isOnline,
  };
}