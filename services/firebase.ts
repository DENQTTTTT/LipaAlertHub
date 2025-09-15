import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import { getFirestore, serverTimestamp } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyACw2laKXQGTW634IejVAdK8m0PKngvaRo",
  authDomain: "lipaalerthub.firebaseapp.com",
  projectId: "lipaalerthub",
  storageBucket: "lipaalerthub.firebasestorage.app",
  messagingSenderId: "991310233066",
  appId: "1:991310233066:web:7e836a60e5c4a302de0693",
  measurementId: "G-PCEYY3PFWW"
};


// Initialize Firebase app (singleton pattern)
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Initialize Firebase services
const auth: Auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, serverTimestamp, storage };

