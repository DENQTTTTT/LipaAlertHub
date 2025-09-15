// ============================================================================
// FIREBASE INITIALIZATION - ALIGNED WITH YOUR EXISTING CONFIG
// File: assets/js/firebase-init.js
// ============================================================================

// Import Firebase SDK modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

// Your Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyACw2laKXQGTW634IejVAdK8m0PKngvaRo",
    authDomain: "lipaalerthub.firebaseapp.com",
    projectId: "lipaalerthub",
    storageBucket: "lipaalerthub.firebasestorage.app",
    messagingSenderId: "991310233066",
    appId: "1:991310233066:web:7e836a60e5c4a302de0693",
    measurementId: "G-PCEYY3PFWW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Export for use in other modules
export { app, auth, db, storage };

// Optional: Initialize analytics if needed
// import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js";
// const analytics = getAnalytics(app);
// export { analytics };

console.log('🔥 Firebase initialized successfully for LipaAlertHub');