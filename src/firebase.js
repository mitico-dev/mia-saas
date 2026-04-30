import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCw4lhiCCrZuMhv6ytMbfL-hJ_RDXsXPbc",
  authDomain: "mia-saas-6f07c.firebaseapp.com",
  projectId: "mia-saas-6f07c",
  storageBucket: "mia-saas-6f07c.firebasestorage.app",
  messagingSenderId: "567251089323",
  appId: "1:567251089323:web:bc5fe9e3324a9eeeff44ee"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
