// ============================================================================
// UPDATED AUTH-GUARD.JS WITH RBAC SUPPORT
// File: assets/js/auth-guard.js
// ============================================================================

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { auth, db } from "./firebase-init.js";

// User roles (matching your RBAC system)
export const USER_ROLES = {
    ADMIN: 'admin',
    MONITOR: 'monitor', 
    RESCUER: 'rescuer',
    AGENCY: 'agency',
    RESIDENT: 'resident'
};

// Your original requireAdmin function (backward compatibility)
export function requireAdmin() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                location.href = "index.html";
                return;
            }
            
            try {
                // First check if user has admin custom claim (your existing method)
                const token = await user.getIdTokenResult(true);
                if (token.claims?.admin === true) {
                    resolve(user);
                    return;
                }

                // Fallback: check Firestore role (new RBAC method)
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userDocRef);
                
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    if (userData.role === 'admin' && userData.status === 'active') {
                        resolve(user);
                        return;
                    }
                }

                alert("This area is for admins only.");
                await signOut(auth);
                location.href = "index.html?error=not-admin";
                
            } catch (error) {
                console.error('Error checking admin status:', error);
                alert("Error verifying admin access. Please try again.");
                await signOut(auth);
                location.href = "index.html?error=auth-error";
            }
        });
    });
}

// New RBAC-based role checking function
export function requireRole(allowedRoles, redirectTo = "index.html") {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                console.log('No user authenticated, redirecting...');
                location.href = redirectTo;
                reject(new Error('User not authenticated'));
                return;
            }

            try {
                // Get user role from Firestore
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userDocRef);
                
                if (!userDoc.exists()) {
                    console.error('User document not found');
                    alert("User profile not found. Please contact administrator.");
                    await signOut(auth);
                    location.href = `${redirectTo}?error=no-profile`;
                    reject(new Error('User profile not found'));
                    return;
                }

                const userData = userDoc.data();
                const userRole = userData.role;
                const userStatus = userData.status || 'active';

                console.log('User auth check:', {
                    uid: user.uid,
                    role: userRole,
                    status: userStatus,
                    allowedRoles
                });

                // Check if account is active
                if (userStatus === 'pending') {
                    alert("Your account is pending approval. Please contact administrator.");
                    await signOut(auth);
                    location.href = `${redirectTo}?error=pending-approval`;
                    reject(new Error('Account pending approval'));
                    return;
                }

                if (userStatus === 'suspended' || userStatus === 'inactive') {
                    alert("Your account has been suspended. Please contact administrator.");
                    await signOut(auth);
                    location.href = `${redirectTo}?error=account-suspended`;
                    reject(new Error('Account suspended'));
                    return;
                }

                // Check role permissions
                const allowedRolesList = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
                
                if (allowedRolesList.includes(userRole)) {
                    console.log(`Access granted for role: ${userRole}`);
                    resolve({ 
                        user, 
                        role: userRole, 
                        status: userStatus,
                        userData: userData 
                    });
                } else {
                    console.warn(`Access denied. Required: ${allowedRolesList.join(', ')}, User has: ${userRole}`);
                    alert(`Access denied. This page requires: ${allowedRolesList.join(' or ')}. Your role: ${userRole}`);
                    await signOut(auth);
                    location.href = `${redirectTo}?error=insufficient-permissions`;
                    reject(new Error('Insufficient permissions'));
                }
                
            } catch (error) {
                console.error('Error checking user role:', error);
                alert("Error verifying permissions. Please try again.");
                await signOut(auth);
                location.href = `${redirectTo}?error=auth-error`;
                reject(error);
            }
        });
    });
}

// Convenience functions for specific roles
export function requireAdminOrMonitor(redirectTo = "index.html") {
    return requireRole([USER_ROLES.ADMIN, USER_ROLES.MONITOR], redirectTo);
}

export function requireRescuerAccess(redirectTo = "index.html") {
    return requireRole([USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.RESCUER], redirectTo);
}

export function requireAgencyAccess(redirectTo = "index.html") {
    return requireRole([USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.AGENCY], redirectTo);
}

export function requireResidentAccess(redirectTo = "index.html") {
    return requireRole([USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.RESIDENT, USER_ROLES.AGENCY], redirectTo);
}

// Function to check user role without redirecting (for UI updates)
export async function getCurrentUserRole() {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                resolve(null);
                return;
            }

            try {
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userDocRef);
                
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    resolve({
                        user,
                        role: userData.role,
                        status: userData.status || 'active',
                        userData
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

// Function to check if current user has specific permission
export async function hasPermission(permission) {
    try {
        const userInfo = await getCurrentUserRole();
        if (!userInfo) return false;

        // Define permissions for each role (simplified version)
        const rolePermissions = {
            [USER_ROLES.ADMIN]: {
                canApproveReports: true,
                canRejectReports: true,
                canAssignRescuers: true,
                canCreateAnnouncements: true,
                canManageUsers: true,
                canViewAnalytics: true,
                canDeleteReports: true
            },
            [USER_ROLES.MONITOR]: {
                canApproveReports: true,
                canRejectReports: true,
                canAssignRescuers: true,
                canViewAllReports: true
            },
            [USER_ROLES.RESCUER]: {
                canUpdateReportStatus: true,
                canViewAssignedReports: true
            },
            [USER_ROLES.AGENCY]: {
                canCreateReports: true,
                canViewOwnReports: true
            },
            [USER_ROLES.RESIDENT]: {
                canCreateReports: true,
                canViewOwnReports: true
            }
        };

        const userPermissions = rolePermissions[userInfo.role] || {};
        return userPermissions[permission] === true;
        
    } catch (error) {
        console.error('Error checking permission:', error);
        return false;
    }
}

// Utility function to redirect based on user role
export async function redirectToDashboard() {
    try {
        const userInfo = await getCurrentUserRole();
        if (!userInfo) {
            location.href = "index.html";
            return;
        }

        switch (userInfo.role) {
            case USER_ROLES.ADMIN:
            case USER_ROLES.MONITOR:
                location.href = "Dashboard.html";
                break;
            case USER_ROLES.RESCUER:
                location.href = "IncidentReportList.html";
                break;
            case USER_ROLES.AGENCY:
                location.href = "ReportForm.html";
                break;
            case USER_ROLES.RESIDENT:
            default:
                location.href = "index.html";
        }
    } catch (error) {
        console.error('Error redirecting to dashboard:', error);
        location.href = "index.html";
    }
}

// Initialize page access control
export function initializePageAccess() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    const pageAccessRules = {
        'Dashboard.html': [USER_ROLES.ADMIN, USER_ROLES.MONITOR],
        'Analytics.html': [USER_ROLES.ADMIN],
        'Announcements.html': [USER_ROLES.ADMIN],
        'Maps.html': [USER_ROLES.ADMIN],
        'AccountVerification.html': [USER_ROLES.ADMIN],
        'IncidentReportList.html': [USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.RESCUER],
        'ReportSummary.html': [USER_ROLES.ADMIN, USER_ROLES.MONITOR],
        'ReportForm.html': [USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.AGENCY, USER_ROLES.RESIDENT],
        'Chats.html': [USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.RESIDENT, USER_ROLES.AGENCY],
        'Forums.html': [USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.RESIDENT],
        'Contacts.html': [USER_ROLES.ADMIN, USER_ROLES.MONITOR, USER_ROLES.RESCUER, USER_ROLES.AGENCY, USER_ROLES.RESIDENT]
    };

    const requiredRoles = pageAccessRules[currentPage];
    if (requiredRoles) {
        return requireRole(requiredRoles);
    }
    
    // If no specific rules, allow authenticated users
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                resolve({ user });
            } else {
                location.href = "index.html";
                reject(new Error('Authentication required'));
            }
        });
    });
}