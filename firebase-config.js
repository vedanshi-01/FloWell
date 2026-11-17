/**
 * FloWell - Firebase Initialization Module (Phase 1 & Phase 2)
 * ============================================================================
 * Architecture:
 * - Uses the official Firebase Web SDK (v10 Modular)
 * - Browser-compatible native ES Module imports directly from Google's gstatic CDN
 * - Zero build tools (No React, Vite, Webpack, or npm dependencies required)
 * - Provides Firebase Authentication & Cloud Firestore instances
 * ============================================================================
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * Official Firebase Web Configuration Object
 * Project: flowell-87d68
 */
export const firebaseConfig = {
  apiKey: "AIzaSyBGrFIS01jxJjdTTtnbT3Ryb0iw1Bz2t7A",
  authDomain: "flowell-87d68.firebaseapp.com",
  projectId: "flowell-87d68",
  storageBucket: "flowell-87d68.firebasestorage.app",
  messagingSenderId: "1016023274425",
  appId: "1:1016023274425:web:b1bafa2877966019cf5c68"
};

// Exported service instances
export let app = null;
export let auth = null;
export let db = null;

try {
  // Initialize Firebase app and core services
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  // Expose to window namespace for non-module interoperability and diagnostics
  if (typeof window !== "undefined") {
    window.FloWellFirebase = {
      app,
      auth,
      db,
      firebaseConfig,
      createUserWithEmailAndPassword,
      signInWithEmailAndPassword,
      signOut,
      onAuthStateChanged,
      doc,
      setDoc,
      getDoc,
      updateDoc,
      collection,
      addDoc,
      getDocs,
      query,
      orderBy,
      limit,
      deleteDoc,
      serverTimestamp
    };

    // Dispatch custom event to notify scripts that Firebase is initialized
    window.dispatchEvent(
      new CustomEvent("flowell-firebase-ready", { detail: window.FloWellFirebase })
    );
  }

  console.log("🌸 FloWell: Firebase initialized successfully!", {
    projectId: firebaseConfig.projectId,
    authReady: !!auth,
    firestoreReady: !!db
  });
} catch (error) {
  console.error("❌ FloWell: Firebase initialization error:", error);
}

// Re-export core methods for direct modular consumption
export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  deleteDoc,
  serverTimestamp
};
