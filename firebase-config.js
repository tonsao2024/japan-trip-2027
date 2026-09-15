// Browser-native ES modules: no bundler required on GitHub Pages.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-analytics.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
export const firebaseConfig = {
  apiKey: 'AIzaSyBFWOPV_nY8wIrepq32kqvmGl8fmZ-fBWE',
  authDomain: 'japantrip2027-5bf9f.firebaseapp.com',
  projectId: 'japantrip2027-5bf9f',
  storageBucket: 'japantrip2027-5bf9f.firebasestorage.app',
  messagingSenderId: '596940204593',
  appId: '1:596940204593:web:b1adc0317eb8859b4f4310',
  measurementId: 'G-HHWQEWRPZM'
};
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
// Analytics is optional; failure or lack of consent must never block the app.
export let analytics = null;
if (localStorage.getItem('fuji:analytics-consent') === 'yes') {
  isSupported().then(supported => { if (supported) analytics = getAnalytics(app); }).catch(() => {});
}
