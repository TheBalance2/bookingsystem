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
const db   = firebase.firestore();
const auth = firebase.auth();

// ============================================================
// EmailJS Configuration
// Sign up at https://www.emailjs.com/ and fill in these values
// ============================================================
const EMAILJS_SERVICE_ID  = 'service_pmf8j3d';
const EMAILJS_TEMPLATE_APPROVE = 'template_ic20gzn';
const EMAILJS_TEMPLATE_REJECT  = 'template_yvtx6w1';
const EMAILJS_PUBLIC_KEY  = 'F8JH_3_axvY590HuC';
