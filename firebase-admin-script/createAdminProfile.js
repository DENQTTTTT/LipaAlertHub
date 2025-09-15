const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function createAdminProfile() {
  try {
    const uid = "7S2cIx3zU70xuHJLZCRD"; // Use the actual UID
    
    await db.collection('users').doc(uid).set({
      email: "admin@lipa.com",
      name: "CDRRMO Admin",
      role: "admin",
      status: "active",
      department: "CDRRMO",
      position: "Chief",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Admin profile created for UID: ${uid}`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating admin profile:", error);
    process.exit(1);
  }
}

createAdminProfile();