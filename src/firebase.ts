import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

// Vite exposes env via `import.meta.env`.
// Keep a single source of truth: .env (and DO NOT commit it).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY as string,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FB_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET as string,
  messagingSenderId:
    (import.meta.env.VITE_FB_MESSAGING_SENDER_ID as string) ||
    (import.meta.env.VITE_FB_SENDER_ID as string),
  appId: import.meta.env.VITE_FB_APP_ID as string,
};

function assertEnv(name: string, value: unknown) {
  if (!value || typeof value !== "string") {
    throw new Error(
      `[firebase] Missing env ${name}. Create a .env file (see .env.example).`
    );
  }
}

assertEnv("VITE_FB_API_KEY", firebaseConfig.apiKey);
assertEnv("VITE_FB_AUTH_DOMAIN", firebaseConfig.authDomain);
assertEnv("VITE_FB_PROJECT_ID", firebaseConfig.projectId);
assertEnv("VITE_FB_STORAGE_BUCKET", firebaseConfig.storageBucket);
assertEnv(
  "VITE_FB_MESSAGING_SENDER_ID (or VITE_FB_SENDER_ID)",
  firebaseConfig.messagingSenderId
);
assertEnv("VITE_FB_APP_ID", firebaseConfig.appId);

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable offline persistence (cache local)
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('[fb] Persistence failed: Multiple tabs open');
  } else if (err.code === 'unimplemented') {
    console.warn('[fb] Persistence not available in this browser');
  } else {
    console.warn('[fb] Persistence error:', err);
  }
});

console.log("[fb] projectId =", import.meta.env.VITE_FB_PROJECT_ID);
console.log("[fb] authDomain =", import.meta.env.VITE_FB_AUTH_DOMAIN);