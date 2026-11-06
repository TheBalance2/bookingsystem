/* ============================================================
   Firebase Configuration — San Isidro College Reservation System
   ============================================================
*/

// Firebase configuration object
const firebaseConfig = {
  apiKey: "AIzaSyCKsaLU-MtVney1zPtrSGUvo0xHdJRkjJY",
  authDomain: "sic-booking-system.firebaseapp.com",
  projectId: "sic-booking-system",
  storageBucket: "sic-booking-system.firebasestorage.app",
  messagingSenderId: "976182903298",
  appId: "1:976182903298:web:482d992308c0a7669ddd1b"
};


// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export references
const db      = firebase.firestore();
const auth    = typeof firebase.auth === 'function' ? firebase.auth() : null;

/* ============================================================
   EmailJS Configuration
   ============================================================
*/
const EMAILJS_SERVICE_ID  = 'service_pmf8j3d';
const EMAILJS_TEMPLATE_APPROVE = 'template_ic20gzn';
const EMAILJS_TEMPLATE_REJECT  = 'template_yvtx6w1';
const EMAILJS_PUBLIC_KEY  = 'F8JH_3_axvY590HuC';

/* ============================================================
   Testing / Backdate Mode Flag
   Set window.SIC_TESTING_MODE = false when capstone testing /
   seeding is finished to restore:
     - 3-day advance notice & past-date lock on booking forms
     - Past-date & 3-day notice lock on homepage calendar popup
     - 8:00 AM – 5:00 PM submission hours on booking forms
   (Also change isTestingMode() to return false in firestore.rules)
   ============================================================
*/
window.SIC_TESTING_MODE = true;
