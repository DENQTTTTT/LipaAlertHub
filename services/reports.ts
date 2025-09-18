import { User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import {
  getMetadata,
  getStorage,
  ref,
  updateMetadata
} from "firebase/storage";
import { auth, db } from "./firebase";
import { notificationService } from "./notifications";

export interface IncidentReport {
  id?: string;
  reporterId: string;
  name: string;
  barangay: string;
  addressLine: string;
  emergencyType: string;
  subCategory: string;
  notes: string;
  location: { latitude: number; longitude: number };
  fullAddress: string;
  photoURL: string | null;
  photoTakenAt: string;
  timestamp: any; // Firestore timestamp
  createdAt: any; // Firestore timestamp
  status: 'pending' | 'verified' | 'accepted' | 'approved' | 'rejected' | 'failed' | 'resolved';
  updatedAt?: any;
  updatedBy?: string;
  adminNote?: string;
  // New timestamp-related fields
  timestampInfo?: {
    hasTimestamp: boolean;
    timestampText?: string;
    needsProcessing: boolean;
  };
}

// New timestamp handling functions
export const checkPhotoTimestamp = async (photoURL: string): Promise<{
  hasTimestamp: boolean;
  timestampText?: string;
  needsProcessing: boolean;
  photoTakenAt?: string;
}> => {
  try {
    const storage = getStorage();
    // Extract path from URL or use direct path
    let photoPath = photoURL;
    if (photoURL.includes('firebasestorage.googleapis.com')) {
      const urlParts = photoURL.split('/');
      const encodedPath = urlParts[urlParts.length - 1].split('?')[0];
      photoPath = decodeURIComponent(encodedPath);
    }
    
    const photoRef = ref(storage, photoPath);
    const metadata = await getMetadata(photoRef);
    
    return {
      hasTimestamp: metadata.customMetadata?.hasTimestamp === 'true',
      timestampText: metadata.customMetadata?.timestampText,
      needsProcessing: metadata.customMetadata?.embedTimestamp === 'true' && 
                      metadata.customMetadata?.processed !== 'true',
      photoTakenAt: metadata.customMetadata?.photoTakenAt
    };
  } catch (error) {
    console.error('Error checking photo timestamp:', error);
    return { hasTimestamp: false, needsProcessing: false };
  }
};

// Function to get enhanced report data with timestamp info
export const getReportWithTimestampInfo = async (reportId: string): Promise<IncidentReport & {
  timestampInfo?: {
    hasTimestamp: boolean;
    timestampText?: string;
    needsProcessing: boolean;
  }
} | null> => {
  try {
    const report = await getReportById(reportId);
    if (!report) return null;
    
    let timestampInfo = undefined;
    if (report.photoURL) {
      timestampInfo = await checkPhotoTimestamp(report.photoURL);
    }
    
    return {
      ...report,
      timestampInfo
    };
  } catch (error) {
    console.error('Error getting report with timestamp info:', error);
    return null;
  }
};

// Function to mark photo as processed (for server-side timestamp embedding)
export const markPhotoAsProcessed = async (photoURL: string): Promise<boolean> => {
  try {
    const storage = getStorage();
    let photoPath = photoURL;
    if (photoURL.includes('firebasestorage.googleapis.com')) {
      const urlParts = photoURL.split('/');
      const encodedPath = urlParts[urlParts.length - 1].split('?')[0];
      photoPath = decodeURIComponent(encodedPath);
    }
    
    const photoRef = ref(storage, photoPath);
    const currentMetadata = await getMetadata(photoRef);
    
    await updateMetadata(photoRef, {
      customMetadata: {
        ...currentMetadata.customMetadata,
        processed: 'true',
        processedAt: new Date().toISOString()
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error marking photo as processed:', error);
    return false;
  }
};

export const submitIncidentReport = async ({
  name,
  barangay,
  addressLine,
  emergencyType,
  subCategory,
  notes,
  location,
  photoURL,
  timestamp,
  fullAddress,
}: {
  name: string;
  barangay: string;
  addressLine: string;
  emergencyType: string;
  subCategory: string;
  notes: string;
  location: { latitude: number; longitude: number };
  photoURL: string | null;
  timestamp: Date;
  fullAddress: string;
}) => {
  try {
    const user: User | null = auth.currentUser;
    if (!user) throw new Error("You must be logged in to submit a report.");

   const docRef = await addDoc(collection(db, "incident_reports"), {
  reporterId: user.uid,
  email: user.email, // Add this line ✅
  name,
  barangay,
  addressLine,
  emergencyType,
  subCategory,
  notes,
  location,
  fullAddress,
  photoURL: photoURL ?? null,
  photoTakenAt: timestamp.toISOString(),
  timestamp: serverTimestamp(),
  createdAt: serverTimestamp(),
  status: "pending",
});

    // Create notification for successful submission
    try {
      await notificationService.createReportSubmittedNotification(
        user.uid,
        docRef.id,
        fullAddress || `${location.latitude}, ${location.longitude}`,
        emergencyType
      );
    } catch (notificationError) {
      console.warn("Failed to create notification:", notificationError);
      // Don't fail the entire submission if notification fails
    }

    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("❌ Error submitting incident report:", error);
    return { success: false, error };
  }
};

// Get single report by ID
export const getReportById = async (reportId: string): Promise<IncidentReport | null> => {
  try {
    const docSnap = await getDoc(doc(db, "incident_reports", reportId));
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as IncidentReport;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error getting report:", error);
    return null;
  }
};

// Get user's reports with real-time updates
export const getUserReports = (userId: string, callback: (reports: IncidentReport[]) => void) => {
  const q = query(
    collection(db, "incident_reports"),
    where("reporterId", "==", userId),
    orderBy("timestamp", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const reports: IncidentReport[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as IncidentReport[];
    
    callback(reports);
  });
};

// Listen to single report changes (for real-time status updates)
export const listenToReport = (reportId: string, callback: (report: IncidentReport | null) => void) => {
  return onSnapshot(doc(db, "incident_reports", reportId), (doc) => {
    if (doc.exists()) {
      callback({
        id: doc.id,
        ...doc.data(),
      } as IncidentReport);
    } else {
      callback(null);
    }
  });
};

// Admin function to update report status with automatic notifications
export const updateReportStatus = async (
  reportId: string, 
  newStatus: IncidentReport['status'],
  adminNote?: string
): Promise<{ success: boolean; error?: any }> => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("Must be authenticated");
    }

    // Get current report data first
    const reportDoc = await getDoc(doc(db, "incident_reports", reportId));
    if (!reportDoc.exists()) {
      throw new Error("Report not found");
    }

    const currentReport = reportDoc.data() as IncidentReport;
    const previousStatus = currentReport.status;

    // Update the report
    const updateData: any = {
      status: newStatus,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    };

    if (adminNote) {
      updateData.adminNote = adminNote;
    }

    await updateDoc(doc(db, "incident_reports", reportId), updateData);

    // Send notification only if status actually changed
    if (previousStatus !== newStatus) {
      try {
        const location = currentReport.fullAddress || `${currentReport.location.latitude}, ${currentReport.location.longitude}`;
        const reportType = currentReport.emergencyType;
        const userId = currentReport.reporterId;

        // Send appropriate notification based on new status
        switch (newStatus) {
          case 'accepted':
            await notificationService.createReportAcceptedNotification(
              userId, reportId, location, reportType
            );
            break;
          case 'verified':
            await notificationService.createReportVerifiedNotification(
              userId, reportId, location, reportType
            );
            break;
          case 'approved':
            await notificationService.createReportApprovedNotification(
              userId, reportId, location, reportType
            );
            break;
          case 'rejected':
            await notificationService.createReportRejectedNotification(
              userId, reportId, location, reportType, adminNote
            );
            break;
          case 'resolved':
            await notificationService.createReportResolvedNotification(
              userId, reportId, location, reportType
            );
            break;
          // No notification for 'failed' status - handled by cloud function
        }
      } catch (notificationError) {
        console.warn("Failed to create status change notification:", notificationError);
        // Don't fail the status update if notification fails
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating report status:", error);
    return { success: false, error };
  }
};

// Get report statistics (for admin dashboard)
export const getReportStats = async () => {
  try {
    // This would typically be done server-side for better performance
    // For now, we'll return a placeholder
    return {
      total: 0,
      pending: 0,
      accepted: 0,
      verified: 0,
      rejected: 0,
      failed: 0,
      resolved: 0,
    };
  } catch (error) {
    console.error("Error getting report stats:", error);
    throw error;
  }
};

// Format location for display
export const formatLocation = (report: IncidentReport) => {
  if (report.fullAddress) {
    return report.fullAddress;
  }
  return `${report.location.latitude.toFixed(4)}° N, ${report.location.longitude.toFixed(4)}° E`;
};

// Format timestamp for display
export const formatReportTime = (timestamp: any) => {
  if (!timestamp) return 'Unknown';
  
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  const timeString = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  if (isToday) {
    return `Today, ${timeString}`;
  } else {
    return `${date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    })}, ${timeString}`;
  }
};

// Get status display text
export const getStatusDisplayText = (status: string) => {
  switch (status) {
    case 'pending':
      return 'Pending Review';
    case 'accepted':
      return 'Report Accepted';
    case 'verified':
      return 'Verified & In Progress';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Under Review';
    case 'failed':
      return 'Verification Failed';
    case 'resolved':
      return 'Resolved';
    default:
      return 'Unknown Status';
  }
};

// Get status color for UI
export const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending':
      return '#3b82f6'; // blue
    case 'accepted':
      return '#22c55e'; // green
    case 'verified':
      return '#22c55e'; // 
    case 'approved':
      return '#22c55e'; // green
    case 'rejected':
      return '#f59e0b'; // amber
    case 'failed':
      return '#ef4444'; // red
    case 'resolved':
      return '#22c55e'; // green
    default:
      return '#6b7280'; // gray
  }
};