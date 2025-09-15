// migrateExistingUsers.js
// Run this with Node.js to fix existing users without proper profiles

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const auth = admin.auth();
const db = admin.firestore();

async function migrateExistingUsers() {
  try {
    console.log('🔄 Starting migration of existing users...');
    
    // Get all authentication users
    const listUsersResult = await auth.listUsers();
    const users = listUsersResult.users;
    
    console.log(`Found ${users.length} users in Authentication`);
    
    for (const user of users) {
      try {
        // Check if user already has a profile
        const userDocRef = db.collection('users').doc(user.uid);
        const userDoc = await userDocRef.get();
        
        if (!userDoc.exists) {
          // User doesn't have a profile, create one
          const profileData = {
            name: user.displayName || user.email?.split('@')[0] || 'User',
            email: user.email || '',
            role: determineUserRole(user.email), // Helper function
            status: 'active',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            deviceType: 'mobile' // Assume mobile for non-admin users
          };
          
          await userDocRef.set(profileData);
          console.log(`✅ Created profile for: ${user.email} (${profileData.role})`);
        } else {
          // Check if profile needs role/status fields
          const existingData = userDoc.data();
          const updates = {};
          
          if (!existingData.role) {
            updates.role = determineUserRole(user.email);
          }
          if (!existingData.status) {
            updates.status = 'active';
          }
          if (!existingData.updatedAt) {
            updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
          }
          
          if (Object.keys(updates).length > 0) {
            await userDocRef.update(updates);
            console.log(`🔄 Updated profile for: ${user.email}`);
          } else {
            console.log(`✓ Profile OK for: ${user.email}`);
          }
        }
        
      } catch (error) {
        console.error(`❌ Error processing user ${user.email}:`, error.message);
      }
    }
    
    console.log('\n✅ Migration completed!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Helper function to determine user role based on email
function determineUserRole(email) {
  if (!email) return 'resident';
  
  // Admin emails
  if (email.includes('admin@lipa.com') || 
      email.includes('cdrrmo') || 
      email.includes('admin')) {
    return 'admin';
  }
  
  // Monitor emails
  if (email.includes('monitor') || 
      email.includes('staff')) {
    return 'monitor';
  }
  
  // Agency emails
  if (email.includes('hospital') || 
      email.includes('pnp') || 
      email.includes('bfp') ||
      email.includes('agency')) {
    return 'agency';
  }
  
  // Rescuer emails
  if (email.includes('rescuer') || 
      email.includes('rescue')) {
    return 'rescuer';
  }
  
  // Default to resident for regular users
  return 'resident';
}

// Run the migration
migrateExistingUsers();