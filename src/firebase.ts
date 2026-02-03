import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCijlfg3t-OOyS_entklU6iZWfeIhur9tw",
  authDomain: "tho-ren-huyen-thoai-3aa5f.firebaseapp.com",
  projectId: "tho-ren-huyen-thoai-3aa5f",
  storageBucket: "tho-ren-huyen-thoai-3aa5f.appspot.com",
  messagingSenderId: "154252716046",
  appId: "1:154252716046:web:82e6ff29a85d1ae31d345f",
};
console.log("[FB] projectId:", firebaseConfig.projectId);
console.log("[FB] authDomain:", firebaseConfig.authDomain);
console.log("[FB] apiKey:", firebaseConfig.apiKey);


export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
console.log("API KEY", import.meta.env.VITE_FB_API_KEY);