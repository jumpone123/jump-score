import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDczG4H5M0owrhJr3cr_xa_SDiQIBVQgfo",
  authDomain: "jump-score-94507.firebaseapp.com",
  projectId: "jump-score-94507",
  storageBucket: "jump-score-94507.firebasestorage.app",
  messagingSenderId: "1075066204311",
  appId: "1:1075066204311:web:e85a21cba52c4c6a35b9d2"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);