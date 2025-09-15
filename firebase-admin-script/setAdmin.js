// setAdmin.js
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // ✅ matches your renamed file

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Change this to your email
const email = "admin@lipa.com";

async function setAdminByEmail(email) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`✅ ${email} is now an ADMIN`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error setting admin:", error);
    process.exit(1);
  }
}

setAdminByEmail(email);
