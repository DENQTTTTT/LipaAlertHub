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
  establishment?: string;
  formattedAddress?: string;
  confidence?: number;
  dataSource?: 'google_places' | 'google_geocoding' | 'coordinate_fallback';
  nearbyPlaces?: string[];
  distance?: number;
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
  establishment?: string;
  locationConfidence?: number;
  locationDataSource?: string;
  nearbyPlaces?: string[];
}

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
    
    const unsynced = logs.filter(l => !l.synced);
    
    if (unsynced.length === 0) return false;

    console.log(`Syncing ${unsynced.length} SOS logs...`);
    let syncedAny = false;

    for (const log of unsynced) {
      try {
        const isGuest = !auth.currentUser || log.fromOffline;
        
        // ✅ CRITICAL FIX: Determine user type and IDs correctly
        const userType = isGuest ? 'guest' : 'resident';
        const userId = isGuest ? null : (auth.currentUser?.uid || log.userId);
        const guestId = isGuest ? (log.guestId || log.userId || `guest_${Date.now()}`) : null;
        const deviceId = isGuest ? (log.deviceId || `device_${Date.now()}`) : null;

        console.log('🔍 User Type Analysis:', {
          hasAuth: !!auth.currentUser,
          fromOffline: log.fromOffline,
          userType,
          userId,
          guestId,
          deviceId,
          isGuest
        });

        // Ensure user document exists for authenticated users
        if (auth.currentUser && !isGuest) {
          await ensureUserDocument(
            auth.currentUser.uid,
            auth.currentUser.email,
            auth.currentUser.displayName || 'Resident'
          );
        }

        const calledAtTimestamp = Timestamp.fromDate(new Date(log.calledAt));
        const finalUserId = userId;
        const finalUserName = log.userName || (isGuest ? 'Guest User' : (auth.currentUser?.displayName || 'User'));

        // Get user profile for additional info (only for residents)
        let userProfile = null;
        if (!isGuest && auth.currentUser) {
          try {
            const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
            if (userDoc.exists()) {
              userProfile = userDoc.data();
            }
          } catch (error) {
            console.log('Could not fetch user profile:', error);
          }
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

        console.log('📱 SOS Report Details:', {
          userType,
          userId: finalUserId,
          guestId,
          deviceId,
          userName: finalUserName,
          isGuest
        });

        // ✅ FIXED: Build incident report data that matches security rules EXACTLY
        const incidentReportData: any = {
          // ✅ SECURITY RULES - These MUST match exactly for guest calls
          userType: userType, // MUST be 'guest' or 'resident'
          type: 'sos', // MUST be exactly 'sos'
          status: 'pending', // MUST be exactly 'pending'
          hasPatientForm: false, // MUST be boolean false
          fromOffline: isGuest, // MUST be boolean true for guests
          
          // ✅ CRITICAL: For guest calls, userId MUST be null and guestId MUST not be null
          userId: isGuest ? null : finalUserId,
          guestId: isGuest ? guestId : null,
          deviceId: isGuest ? deviceId : null,
          
          // Required Firestore fields
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),

          // User info
          reporterId: finalUserId, // Always include reporterId for tracking
          userName: finalUserName,
          email: isGuest ? null : (auth.currentUser?.email || null),
          reporterPhone: reporterPhone,
          reporterBarangay: reporterBarangay,
          
          // SOS-specific fields
          selectedAgency: log.selectedAgency,
          agencyPhoneNumber: log.phoneNumber,
          emergencyType: log.emergencyType || 'General Emergency',
          
          // Location data
          barangay: reporterBarangay,
          fullAddress: log.formattedAddress || reporterLocation?.address || log.location?.address || `${reporterBarangay}, Lipa City`,
          addressLine: log.formattedAddress || reporterLocation?.address || log.location?.address || `${reporterBarangay}, Lipa City`,
          
          // Required for incident tracking
          calledAt: calledAtTimestamp,
          assignedAgency: null,
          assignedRescuer: null,
          assignedRescuers: [],
          reviewed: false,
          originallyGuest: isGuest,
        };

        // Add location coordinates if available
        if (reporterLocation && typeof reporterLocation === 'object') {
          incidentReportData.location = {
            latitude: reporterLocation.latitude,
            longitude: reporterLocation.longitude,
          };
          if (reporterLocation.accuracy) {
            incidentReportData.location.accuracy = reporterLocation.accuracy;
          }
          if (reporterLocation.timestamp) {
            incidentReportData.location.timestamp = reporterLocation.timestamp;
          }
          incidentReportData.reporterLocation = reporterLocation;
        } else if (log.location && typeof log.location === 'object') {
          incidentReportData.location = {
            latitude: log.location.latitude,
            longitude: log.location.longitude,
          };
          if (log.location.accuracy) {
            incidentReportData.location.accuracy = log.location.accuracy;
          }
          if (log.location.timestamp) {
            incidentReportData.location.timestamp = log.location.timestamp;
          }
        }

        // Add enhanced location data (optional fields)
        if (log.establishment) {
          incidentReportData.establishment = log.establishment;
        }
        if (log.confidence) {
          incidentReportData.locationConfidence = log.confidence;
        }
        if (log.dataSource) {
          incidentReportData.locationDataSource = log.dataSource;
        }
        if (log.nearbyPlaces && Array.isArray(log.nearbyPlaces) && log.nearbyPlaces.length > 0) {
          incidentReportData.nearbyPlaces = log.nearbyPlaces;
        }
        if (log.distance && typeof log.distance === 'number') {
          incidentReportData.establishmentDistance = log.distance;
        }

        // ✅ CRITICAL: Validate data matches security rules before sending
        const securityCheck = {
          userType: incidentReportData.userType,
          type: incidentReportData.type,
          userId: incidentReportData.userId,
          guestId: incidentReportData.guestId,
          deviceId: incidentReportData.deviceId,
          status: incidentReportData.status,
          hasPatientForm: incidentReportData.hasPatientForm,
          fromOffline: incidentReportData.fromOffline
        };

        console.log('🔍 SECURITY RULES VALIDATION:', securityCheck);
        
        // ✅ ADDITIONAL VALIDATION: Check if this would pass security rules
        const wouldPassRules = 
          incidentReportData.userType === 'guest' ? 
            (incidentReportData.userId === null && 
             incidentReportData.guestId !== null && 
             incidentReportData.deviceId !== null &&
             incidentReportData.status === 'pending' &&
             incidentReportData.hasPatientForm === false &&
             incidentReportData.fromOffline === true) :
            (incidentReportData.userId !== null && 
             incidentReportData.status === 'pending' &&
             incidentReportData.hasPatientForm === false);

        if (!wouldPassRules) {
          console.error('❌ SECURITY RULES VALIDATION FAILED - Skipping document');
          console.error('Guest requirements:', {
            userId: incidentReportData.userId,
            guestId: incidentReportData.guestId,
            deviceId: incidentReportData.deviceId,
            status: incidentReportData.status,
            hasPatientForm: incidentReportData.hasPatientForm,
            fromOffline: incidentReportData.fromOffline
          });
          continue;
        }

        console.log('✍️ Creating SOS incident report for:', finalUserName);

        let docRef;
        try {
          docRef = await addDoc(collection(db, 'incident_reports'), incidentReportData);
          console.log('✅ Document created successfully:', docRef.id);
          
          // Mark as synced immediately
          log.synced = true;
          syncedAny = true;

          console.log(`✅ Synced SOS: ${log.id} -> ${docRef.id} (${userType})`);
          
        } catch (addError: any) {
          console.error('❌ Firestore Error:', {
            code: addError.code,
            message: addError.message,
            securityCheck: securityCheck
          });
          
          if (addError.code === 'permission-denied') {
            console.error('🔒 SECURITY RULES FAILURE - Check these fields:');
            console.error('- userType should be "guest" for guest calls:', incidentReportData.userType);
            console.error('- type should be "sos":', incidentReportData.type);
            console.error('- userId should be null for guests:', incidentReportData.userId);
            console.error('- guestId should not be null for guests:', incidentReportData.guestId);
            console.error('- deviceId should not be null for guests:', incidentReportData.deviceId);
            console.error('- status should be "pending":', incidentReportData.status);
            console.error('- hasPatientForm should be false:', incidentReportData.hasPatientForm);
            console.error('- fromOffline should be true for guests:', incidentReportData.fromOffline);
            
            // Don't mark as synced if permission denied
            continue;
          }
          throw addError;
        }
        
      } catch (error: any) {
        console.error('❌ Error syncing SOS log:', error);
        console.error('Code:', error.code);
        console.error('Message:', error.message);
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

  const attachUserToGuestLogs = useCallback(async (userId: string) => {
    try {
      const saved = await AsyncStorage.getItem(SOS_LOGS_KEY);
      const logs: SOSLog[] = saved ? JSON.parse(saved) : [];
      
      const guestLogs = logs.filter(log => 
        log.userId.startsWith('guest_') && !log.synced
      );
      
      if (guestLogs.length === 0) {
        console.log('No guest logs to attach');
        return 0;
      }

      let attachedCount = 0;
      
      for (const log of guestLogs) {
        log.userId = userId;
        log.userName = auth.currentUser?.displayName || 'User';
        log.fromOffline = true;
        log.userType = 'resident';
        log.guestId = null;
        attachedCount++;
      }

      await AsyncStorage.setItem(SOS_LOGS_KEY, JSON.stringify(logs));
      
      console.log(`✅ Attached ${attachedCount} guest SOS logs to user ${userId}`);
      
      if (attachedCount > 0) {
        await syncSOSLogs(true);
      }
      
      return attachedCount;
      
    } catch (error) {
      console.error('Error attaching guest logs:', error);
      return 0;
    }
  }, [syncSOSLogs]);

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

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && isOnline) {
        syncSOSLogs(true);
      }
    });
    return () => subscription.remove();
  }, [isOnline, syncSOSLogs]);

  useEffect(() => {
    const initSync = async () => {
      await updateUnsyncedCount();
      await syncSOSLogs(true);
    };
    initSync();
  }, []);

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

      const isGuest = !auth.currentUser;
      const userId = isGuest ? `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : auth.currentUser!.uid;
      const userName = sosLog.userName || (isGuest ? 'Guest User' : (auth.currentUser?.displayName || 'User'));

      const newLog: SOSLog = {
        ...sosLog,
        userId: userId,
        userName: userName,
        barangay,
        reporterBarangay: sosLog.reporterBarangay || barangay,
        fromOffline: isGuest,
        id: `sos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        synced: false,
        guestId: isGuest ? userId : null,
        userType: isGuest ? 'guest' : 'resident',
        deviceId: isGuest ? `device_${Date.now()}` : null
      };

      const saved = await AsyncStorage.getItem(SOS_LOGS_KEY);
      const logs: SOSLog[] = saved ? JSON.parse(saved) : [];
      logs.push(newLog);

      await AsyncStorage.setItem(SOS_LOGS_KEY, JSON.stringify(logs));
      
      console.log('💾 SOS log saved:', { 
        id: newLog.id, 
        userId: newLog.userId, 
        userName: newLog.userName,
        isGuest: isGuest,
        userType: newLog.userType,
        barangay: newLog.barangay,
        establishment: newLog.establishment,
        confidence: newLog.confidence
      });
      
      await updateUnsyncedCount();

      const netInfo = await NetInfo.fetch();
      if (netInfo.isConnected) {
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
      
      const unsyncedLogs = logs.filter(l => !l.synced);
      
      await AsyncStorage.setItem(SOS_LOGS_KEY, JSON.stringify(unsyncedLogs));
      console.log('🧹 Cleared synced logs');
    } catch (error) {
      console.error('Error clearing synced logs:', error);
    }
  }, []);

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