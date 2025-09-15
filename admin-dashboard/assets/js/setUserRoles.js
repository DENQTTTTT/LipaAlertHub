// ============================================================================
// ROLE MANAGEMENT SCRIPT FOR ADMINS
// File: firebase-admin-script/setUserRoles.js  
// Run this with Node.js to set user roles
// ============================================================================

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// Make sure your serviceAccountKey.json is in the same directory
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

// User roles
const USER_ROLES = {
    ADMIN: 'admin',
    MONITOR: 'monitor', 
    RESCUER: 'rescuer',
    AGENCY: 'agency',
    RESIDENT: 'resident'
};

// Function to set user role in Firestore
async function setUserRole(email, role, additionalData = {}) {
    try {
        // Get user by email
        const userRecord = await auth.getUserByEmail(email);
        const uid = userRecord.uid;
        
        console.log(`Found user: ${email} (${uid})`);

        // Prepare user data
        const userData = {
            name: additionalData.name || userRecord.displayName || email.split('@')[0],
            email: email,
            role: role,
            status: 'active', // Set as active when assigning role
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            ...additionalData
        };

        // If this is a new user document, add creation timestamp
        const userDocRef = db.collection('users').doc(uid);
        const userDoc = await userDocRef.get();
        
        if (!userDoc.exists) {
            userData.createdAt = admin.firestore.FieldValue.serverTimestamp();
        }

        // Set user data in Firestore
        await userDocRef.set(userData, { merge: true });
        
        console.log(`✅ Successfully set role '${role}' for user: ${email}`);
        
        // Optional: Set custom claims for backward compatibility with your existing admin system
        if (role === USER_ROLES.ADMIN) {
            await auth.setCustomUserClaims(uid, { admin: true });
            console.log(`✅ Set admin custom claim for: ${email}`);
        }

        return { success: true, uid, userData };
    } catch (error) {
        console.error(`❌ Error setting role for ${email}:`, error.message);
        return { success: false, error: error.message };
    }
}

// Function to create multiple users with roles
async function createUsersWithRoles(users) {
    console.log('🚀 Starting bulk user role assignment...\n');
    
    const results = [];
    
    for (const user of users) {
        const result = await setUserRole(user.email, user.role, user.additionalData || {});
        results.push({ ...user, result });
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n📊 Summary:');
    const successful = results.filter(r => r.result.success);
    const failed = results.filter(r => !r.result.success);
    
    console.log(`✅ Successful: ${successful.length}`);
    console.log(`❌ Failed: ${failed.length}`);
    
    if (failed.length > 0) {
        console.log('\n❌ Failed users:');
        failed.forEach(user => {
            console.log(`  - ${user.email}: ${user.result.error}`);
        });
    }
    
    return results;
}

// Function to get user role
async function getUserRole(email) {
    try {
        const userRecord = await auth.getUserByEmail(email);
        const userDoc = await db.collection('users').doc(userRecord.uid).get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            console.log(`User: ${email}`);
            console.log(`Role: ${userData.role}`);
            console.log(`Status: ${userData.status}`);
            console.log(`Created: ${userData.createdAt?.toDate()}`);
            return userData;
        } else {
            console.log(`No Firestore document found for: ${email}`);
            return null;
        }
    } catch (error) {
        console.error(`Error getting user role for ${email}:`, error.message);
        return null;
    }
}

// Function to list all users with roles
async function listAllUsersWithRoles() {
    try {
        console.log('📋 Listing all users with roles:\n');
        
        const usersSnapshot = await db.collection('users').get();
        const users = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            users.push({
                uid: doc.id,
                ...userData
            });
        });
        
        // Sort by role and then by email
        users.sort((a, b) => {
            if (a.role !== b.role) {
                return a.role.localeCompare(b.role);
            }
            return a.email.localeCompare(b.email);
        });
        
        console.table(users.map(user => ({
            Email: user.email,
            Name: user.name,
            Role: user.role,
            Status: user.status,
            Created: user.createdAt?.toDate()?.toLocaleDateString() || 'Unknown'
        })));
        
        return users;
    } catch (error) {
        console.error('Error listing users:', error.message);
        return [];
    }
}

// Function to update user status
async function updateUserStatus(email, status) {
    try {
        const userRecord = await auth.getUserByEmail(email);
        const uid = userRecord.uid;
        
        await db.collection('users').doc(uid).update({
            status: status,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`✅ Updated status for ${email} to: ${status}`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Error updating status for ${email}:`, error.message);
        return { success: false, error: error.message };
    }
}

// Example usage and setup
async function setupInitialUsers() {
    console.log('🔧 Setting up initial users for LipaAlertHub RBAC system...\n');
    
    // Define your initial users here
    const initialUsers = [
        {
            email: 'admin@lipaaleryhub.com', // Replace with your admin email
            role: USER_ROLES.ADMIN,
            additionalData: {
                name: 'CDRRMO Admin',
                department: 'CDRRMO',
                position: 'Chief'
            }
        },
        {
            email: 'monitor1@lipaaleryhub.com', // Replace with monitor email
            role: USER_ROLES.MONITOR,
            additionalData: {
                name: 'Monitor 1',
                department: 'CDRRMO',
                position: 'Monitor'
            }
        },
        {
            email: 'rescuer1@lipaaleryhub.com', // Replace with rescuer email
            role: USER_ROLES.RESCUER,
            additionalData: {
                name: 'Field Rescuer 1',
                department: 'CDRRMO',
                position: 'Rescuer',
                teamId: 'rescue-team-1'
            }
        },
        {
            email: 'hospital@lipaaleryhub.com', // Replace with agency email
            role: USER_ROLES.AGENCY,
            additionalData: {
                name: 'Lipa Medical Center',
                agencyType: 'hospital',
                agencyName: 'Lipa Medical Center'
            }
        }
        // Add more users as needed
    ];
    
    return await createUsersWithRoles(initialUsers);
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    try {
        switch (command) {
            case 'setup':
                await setupInitialUsers();
                break;
                
            case 'set-role':
                if (args.length < 3) {
                    console.log('Usage: node setUserRoles.js set-role <email> <role> [name]');
                    console.log('Roles:', Object.values(USER_ROLES).join(', '));
                    return;
                }
                const email = args[1];
                const role = args[2];
                const name = args[3];
                
                if (!Object.values(USER_ROLES).includes(role)) {
                    console.log('❌ Invalid role. Valid roles:', Object.values(USER_ROLES).join(', '));
                    return;
                }
                
                await setUserRole(email, role, name ? { name } : {});
                break;
                
            case 'get-role':
                if (args.length < 2) {
                    console.log('Usage: node setUserRoles.js get-role <email>');
                    return;
                }
                await getUserRole(args[1]);
                break;
                
            case 'list-users':
                await listAllUsersWithRoles();
                break;
                
            case 'update-status':
                if (args.length < 3) {
                    console.log('Usage: node setUserRoles.js update-status <email> <status>');
                    console.log('Status: active, pending, suspended');
                    return;
                }
                await updateUserStatus(args[1], args[2]);
                break;
                
            case 'help':
            default:
                console.log('🔧 LipaAlertHub Role Management Tool\n');
                console.log('Available commands:');
                console.log('  setup              - Set up initial admin and test users');
                console.log('  set-role <email> <role> [name] - Set role for user');
                console.log('  get-role <email>   - Get role for user');
                console.log('  list-users         - List all users with roles');
                console.log('  update-status <email> <status> - Update user status');
                console.log('  help               - Show this help message\n');
                console.log('Available roles:', Object.values(USER_ROLES).join(', '));
                console.log('Available statuses: active, pending, suspended');
        }
    } catch (error) {
        console.error('❌ Command execution failed:', error.message);
    } finally {
        process.exit(0);
    }
}

// Export functions for use in other scripts
module.exports = {
    setUserRole,
    getUserRole,
    createUsersWithRoles,
    listAllUsersWithRoles,
    updateUserStatus,
    USER_ROLES
};

// Run if called directly
if (require.main === module) {
    main();
}