// ============================================================================
// FINAL AUTH-GUARD.JS - ALIGNED WITH FIRESTORE SECURITY RULES
// File: assets/js/auth-guard.js
// ============================================================================

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";

// User roles (matching your RBAC system and Firestore rules)
export const USER_ROLES = {
    ADMIN: 'admin',
    MONITOR: 'monitor', 
    RESCUER: 'rescuer',
    AGENCY: 'agency',
    RESIDENT: 'resident'
};

// User status types (matching your Firestore rules)
export const USER_STATUS = {
    ACTIVE: 'active',
    PENDING: 'pending',
    SUSPENDED: 'suspended',
    INACTIVE: 'inactive'
};

// Role permissions (aligned with your Firestore security rules)
export const ROLE_PERMISSIONS = {
    [USER_ROLES.ADMIN]: {
        // Dashboard & Analytics
        canViewDashboard: true,
        canViewAnalytics: true,
        canExportData: true,
        
        // Report Management
        canViewAllReports: true,
        canApproveReports: true,
        canRejectReports: true,
        canDeleteReports: true,
        canAssignRescuers: true,
        canCreateReports: true,
        canEditReports: true,
        
        // User Management
        canManageUsers: true,
        canApproveAccounts: true,
        canSuspendUsers: true,
        canViewUserDetails: true,
        canCreateStaffAccounts: true,
        
        // Communication & Content
        canCreateAnnouncements: true,
        canSendAlerts: true,
        canModerateForums: true,
        canChatWithAll: true,
        canDeleteMessages: true,
        
        // System Management
        canManageHazardMaps: true,
        canManageEvacuationCenters: true,
        canConfigureSystem: true,
        canViewSystemLogs: true,
        canViewAuditLogs: true,
        canManageCategories: true,
        canManageContacts: true,
        canManageTips: true
    },
    
    [USER_ROLES.MONITOR]: {
        // Dashboard (limited analytics)
        canViewDashboard: true,
        canViewAnalytics: false,
        canExportData: false,
        
        // Report Management
        canViewAllReports: true,
        canApproveReports: true,
        canRejectReports: true,
        canDeleteReports: false,
        canAssignRescuers: true,
        canCreateReports: true,
        canEditReports: true,
        
        // User Management (limited)
        canManageUsers: false,
        canApproveAccounts: false,
        canSuspendUsers: false,
        canViewUserDetails: false,
        canCreateStaffAccounts: false,
        
        // Communication
        canCreateAnnouncements: false,
        canSendAlerts: true,
        canModerateForums: true,
        canChatWithAll: true,
        canDeleteMessages: true,
        
        // System Management (limited)
        canManageHazardMaps: false,
        canManageEvacuationCenters: true,
        canConfigureSystem: false,
        canViewSystemLogs: false,
        canManageContacts: true,
        canManageTips: true
    },
    
    [USER_ROLES.RESCUER]: {
        // Dashboard (very limited)
        canViewDashboard: false,
        canViewAnalytics: false,
        canExportData: false,
        
        // Report Management (assigned only)
        canViewAllReports: false,
        canViewAssignedReports: true,
        canUpdateReportStatus: true,
        canUploadProof: true,
        canApproveReports: false,
        canRejectReports: false,
        canDeleteReports: false,
        canAssignRescuers: false,
        canCreateReports: false,
        canEditReports: false,
        
        // Communication
        canChatWithStaff: true,
        canCreateAnnouncements: false,
        canSendAlerts: false,
        canModerateForums: false,
        
        // System Access
        canViewMap: true,
        canViewContacts: true,
        canViewEvacuationCenters: true,
        canViewTips: true
    },
    
    [USER_ROLES.AGENCY]: {
        // Dashboard (agency-specific)
        canViewAgencyDashboard: true,
        canViewOwnReports: true,
        
        // Report Management
        canCreateReports: true,
        canViewAllReports: false,
        canEditOwnReports: true,
        canDeleteOwnReports: false,
        
        // Communication
        canChatWithStaff: true,
        canUseForums: true,
        
        // System Access
        canViewAuditTrail: false,
        canViewContacts: true,
        canViewTips: true,
        canViewEvacuationCenters: true
    },
    
    [USER_ROLES.RESIDENT]: {
        // Report Management
        canCreateReports: true,
        canViewOwnReports: true,
        canEditOwnReports: false,
        canDeleteOwnReports: false,
        
        // Communication
        canUseForums: true,
        canChatWithStaff: true,
        
        // Information Access
        canViewHazardMaps: true,
        canViewEvacuationCenters: true,
        canViewAlerts: true,
        canViewAnnouncements: true,
        canViewEmergencyTips: true,
        canUseSOS: true,
        canViewContacts: true
    }
};

// Cache for user data to reduce Firestore calls
let userDataCache = {};
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Enhanced error handling
export class AuthError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'AuthError';
    }
}

// Your original requireAdmin function (backward compatibility)
export function requireAdmin() {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                location.href = "index.html";
                reject(new AuthError('no-auth', 'User not authenticated'));
                return;
            }
            
            try {
                // First check if user has admin custom claim (legacy method)
                const token = await user.getIdTokenResult(true);
                if (token.claims?.admin === true) {
                    resolve(user);
                    return;
                }

                // Check Firestore role (new RBAC method)
                const userData = await getUserData(user.uid);
                
                if (userData && userData.role === USER_ROLES.ADMIN && userData.status === USER_STATUS.ACTIVE) {
                    resolve(user);
                    return;
                }

                alert("This area is for admins only.");
                await signOut(auth);
                location.href = "index.html?error=not-admin";
                reject(new AuthError('insufficient-permissions', 'Admin access required'));
                
            } catch (error) {
                console.error('Error checking admin status:', error);
                alert("Error verifying admin access. Please try again.");
                await signOut(auth);
                location.href = "index.html?error=auth-error";
                reject(error);
            }
        });
    });
}

// Enhanced user data fetching with caching
async function getUserData(uid, forceRefresh = false) {
    const now = Date.now();
    
    // Check cache first (unless force refresh)
    if (!forceRefresh && userDataCache[uid] && (now - cacheTimestamp < CACHE_DURATION)) {
        return userDataCache[uid];
    }
    
    try {
        const userDocRef = doc(db, 'users', uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            // Update cache
            userDataCache[uid] = userData;
            cacheTimestamp = now;
            return userData;
        }
        
        return null;
    } catch (error) {
        console.error('Error fetching user data:', error);
        throw new AuthError('fetch-error', 'Failed to fetch user data', { error });
    }
}

// Enhanced RBAC role checking with detailed logging
export function requireRole(allowedRoles, redirectTo = "index.html") {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                console.log('No user authenticated, redirecting...');
                location.href = redirectTo;
                reject(new AuthError('no-auth', 'User not authenticated'));
                return;
            }

            try {
                const userData = await getUserData(user.uid);
                
                if (!userData) {
                    console.error('User document not found');
                    alert("User profile not found. Please contact administrator.");
                    await signOut(auth);
                    location.href = `${redirectTo}?error=no-profile`;
                    reject(new AuthError('no-profile', 'User profile not found'));
                    return;
                }

                const userRole = userData.role;
                const userStatus = userData.status || USER_STATUS.ACTIVE;

                console.log('User auth check:', {
                    uid: user.uid,
                    email: user.email,
                    role: userRole,
                    status: userStatus,
                    allowedRoles: Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]
                });

                // Check account status
                if (userStatus === USER_STATUS.PENDING) {
                    alert("Your account is pending approval. Please contact administrator.");
                    await signOut(auth);
                    location.href = `${redirectTo}?error=pending-approval`;
                    reject(new AuthError('pending-approval', 'Account pending approval'));
                    return;
                }

                if (userStatus === USER_STATUS.SUSPENDED || userStatus === USER_STATUS.INACTIVE) {
                    alert("Your account has been suspended or deactivated. Please contact administrator.");
                    await signOut(auth);
                    location.href = `${redirectTo}?error=account-suspended`;
                    reject(new AuthError('account-suspended', 'Account suspended'));
                    return;
                }

                // Check role permissions
                const allowedRolesList = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
                
                if (allowedRolesList.includes(userRole)) {
                    console.log(`✅ Access granted for role: ${userRole}`);
                    resolve({ 
                        user, 
                        role: userRole, 
                        status: userStatus,
                        userData: userData,
                        permissions: ROLE_PERMISSIONS[userRole] || {}
                    });
                } else {
                    console.warn(`❌ Access denied. Required: ${allowedRolesList.join(', ')}, User has: ${userRole}`);
                    alert(`Access denied. This page requires: ${allowedRolesList.join(' or ')}.\nYour role: ${userRole}`);
                    await signOut(auth);
                    location.href = `${redirectTo}?error=insufficient-permissions&required=${allowedRolesList.join(',')}&user=${userRole}`;
                    reject(new AuthError('insufficient-permissions', 'Insufficient permissions', {
                        required: allowedRolesList,
                        userRole: userRole
                    }));
                }
                
            } catch (error) {
                console.error('Error checking user role:', error);
                if (error instanceof AuthError) {
                    reject(error);
                    return;
                }
                
                alert("Error verifying permissions. Please try again.");
                await signOut(auth);
                location.href = `${redirectTo}?error=auth-error`;
                reject(new AuthError('auth-error', 'Authentication error', { error }));
            }
        });
    });
}

// Convenience functions for specific role combinations
export function requireAdminOrMonitor(redirectTo = "index.html") {
    return requireRole([USER_ROLES.ADMIN, USER_ROLES.MONITOR], redirectTo);
}

export function requireStaffAccess(redirectTo = "index.html") {
    return requireRole([USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.RESCUER], redirectTo);
}

export function requireRescuerAccess(redirectTo = "index.html") {
    return requireRole([USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.RESCUER], redirectTo);
}

export function requireAgencyAccess(redirectTo = "index.html") {
    return requireRole([USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.AGENCY], redirectTo);
}

export function requireResidentAccess(redirectTo = "index.html") {
    return requireRole([USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.RESIDENT], redirectTo);
}

// Get current user role without redirecting
export async function getCurrentUserRole() {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                resolve(null);
                return;
            }

            try {
                const userData = await getUserData(user.uid);
                
                if (userData) {
                    resolve({
                        user,
                        role: userData.role,
                        status: userData.status || USER_STATUS.ACTIVE,
                        userData,
                        permissions: ROLE_PERMISSIONS[userData.role] || {}
                    });
                } else {
                    resolve(null);
                }
            } catch (error) {
                console.error('Error getting user role:', error);
                reject(error);
            }
        });
    });
}

// Permission checking functions
export async function hasPermission(permission) {
    try {
        const userInfo = await getCurrentUserRole();
        if (!userInfo || userInfo.status !== USER_STATUS.ACTIVE) {
            return false;
        }

        const userPermissions = ROLE_PERMISSIONS[userInfo.role] || {};
        return userPermissions[permission] === true;
        
    } catch (error) {
        console.error('Error checking permission:', error);
        return false;
    }
}

export async function hasAnyPermission(permissions) {
    if (!Array.isArray(permissions)) {
        return await hasPermission(permissions);
    }
    
    for (const permission of permissions) {
        if (await hasPermission(permission)) {
            return true;
        }
    }
    return false;
}

export async function hasAllPermissions(permissions) {
    if (!Array.isArray(permissions)) {
        return await hasPermission(permissions);
    }
    
    for (const permission of permissions) {
        if (!(await hasPermission(permission))) {
            return false;
        }
    }
    return true;
}

// Role-based dashboard redirect
export async function redirectToDashboard() {
    try {
        const userInfo = await getCurrentUserRole();
        if (!userInfo) {
            location.href = "index.html";
            return;
        }

        // Check status first
        if (userInfo.status !== USER_STATUS.ACTIVE) {
            location.href = "index.html?error=account-inactive";
            return;
        }

        // Redirect based on role
        switch (userInfo.role) {
            case USER_ROLES.ADMIN:
            case USER_ROLES.MONITOR:
                location.href = "Dashboard.html";
                break;
            case USER_ROLES.RESCUER:
                location.href = "IncidentReportList.html";
                break;
            case USER_ROLES.AGENCY:
                location.href = "ReportForm.html"; // Agencies start with creating reports
                break;
            case USER_ROLES.RESIDENT:
            default:
                location.href = "Contacts.html"; // Safe fallback for residents
        }
    } catch (error) {
        console.error('Error redirecting to dashboard:', error);
        location.href = "index.html?error=redirect-failed";
    }
}

// Enhanced page access control matching your file structure
export function initializePageAccess() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    console.log(`🔒 Initializing page access control for: ${currentPage}`);
    
    // Page access rules aligned with your Firestore rules
    const pageAccessRules = {
        // Admin & Monitor Dashboard
        'Dashboard.html': [USER_ROLES.ADMIN, USER_ROLES.MONITOR],
        
        // Admin Only Pages
        'Analytics.html': [USER_ROLES.ADMIN],
        'Announcements.html': [USER_ROLES.ADMIN],
        'Maps.html': [USER_ROLES.ADMIN],
        'AccountVerification.html': [USER_ROLES.ADMIN],
        
        // Staff Pages (Admin, Monitor, Rescuer)
        'IncidentReportList.html': [USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.RESCUER],
        'ReportSummary.html': [USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.RESCUER],
        
        // Multi-Role Pages
        'ReportForm.html': [USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.AGENCY, USER_ROLES.RESIDENT],
        'Forums.html': [USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.RESIDENT, USER_ROLES.AGENCY],
        'Chats.html': [USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.RESIDENT, USER_ROLES.RESCUER, USER_ROLES.AGENCY],
        'Contacts.html': [USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.RESCUER, USER_ROLES.AGENCY, USER_ROLES.RESIDENT],
        
        // Public/Login Pages (no restrictions)
        'index.html': null,
        'login.html': null,
        'register.html': null,
        'forgot-password.html': null
    };

    const requiredRoles = pageAccessRules[currentPage];
    
    if (requiredRoles === null) {
        // Public page, no restrictions
        console.log(`📖 Public page access: ${currentPage}`);
        return Promise.resolve({ public: true });
    }
    
    if (requiredRoles) {
        console.log(`🔐 Protected page: ${currentPage}, required roles: ${requiredRoles.join(', ')}`);
        return requireRole(requiredRoles);
    }
    
    // Default: require authentication for unknown pages
    console.log(`❓ Unknown page: ${currentPage}, requiring authentication`);
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                resolve({ user });
            } else {
                location.href = "index.html";
                reject(new AuthError('no-auth', 'Authentication required'));
            }
        });
    });
}

// UI restriction application
export async function applyUIRestrictions() {
    try {
        const userInfo = await getCurrentUserRole();
        if (!userInfo) return;

        const permissions = userInfo.permissions || {};

        // Apply permission-based restrictions
        const permissionElements = document.querySelectorAll('[data-permission]');
        permissionElements.forEach((item) => {
            const requiredPermission = item.getAttribute('data-permission');
            const hasAccess = permissions[requiredPermission] === true;
            
            if (!hasAccess) {
                item.style.display = 'none';
                item.classList.add('permission-denied');
            }
        });

        // Apply role-based restrictions
        const roleElements = document.querySelectorAll('[data-role]');
        roleElements.forEach((item) => {
            const allowedRoles = item.getAttribute('data-role').split(',').map(r => r.trim());
            if (!allowedRoles.includes(userInfo.role)) {
                item.style.display = 'none';
                item.classList.add('role-restricted');
            }
        });

        console.log(`🎨 UI restrictions applied for role: ${userInfo.role}`);
    } catch (error) {
        console.error('Error applying UI restrictions:', error);
    }
}

// Enhanced error handling
export function handleAuthError(error, defaultRedirect = 'index.html') {
    console.error('Authentication error:', error);
    
    const errorMessages = {
        'no-auth': 'Please log in to continue.',
        'no-profile': 'User profile not found. Please contact administrator.',
        'pending-approval': 'Your account is pending approval.',
        'account-suspended': 'Your account has been suspended or deactivated.',
        'insufficient-permissions': 'You do not have permission to access this page.',
        'auth-error': 'Authentication error occurred. Please try again.',
        'fetch-error': 'Failed to load user data. Please check your connection.'
    };
    
    const message = errorMessages[error.code] || 'An unexpected error occurred.';
    
    // Show user-friendly message
    if (typeof showNotification === 'function') {
        showNotification(message, 'error');
    } else {
        alert(message);
    }
    
    // Redirect after delay
    setTimeout(() => {
        window.location.href = `${defaultRedirect}?error=${error.code}`;
    }, 2000);
}

// Cache management
export function refreshUserCache() {
    userDataCache = {};
    cacheTimestamp = 0;
    console.log('🔄 User data cache refreshed');
}

// Access logging for security audit
export function logAccessAttempt(page, success, userInfo = null, error = null) {
    const logData = {
        page,
        success,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        ...userInfo && { 
            uid: userInfo.user?.uid,
            email: userInfo.user?.email,
            role: userInfo.role,
            status: userInfo.status
        },
        ...error && { error: error.message, code: error.code }
    };
    
    console.log('🔍 Access attempt:', logData);
    
    // You can extend this to send logs to Firestore if needed
    // This would require the audit_logs collection from your rules
}