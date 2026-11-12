/* ============================================================
   Authentication Model — San Isidro College Reservation System
   Model Layer (js/models/auth-model.js)
   Handles all Firebase Authentication interactions.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'AuthModel';

  const AuthModel = {
    onChange(callback) {
      if (!auth) {
        Logger.warn(LAYER, 'Firebase Auth is not loaded on this page.');
        return () => {};
      }
      return auth.onAuthStateChanged(callback);
    },

    async login(email, password) {
      if (!auth) throw new Error('Firebase Auth is not available.');
      try {
        return await auth.signInWithEmailAndPassword(email, password);
      } catch (err) {
        Logger.error(LAYER, 'Login failed:', err);
        throw err;
      }
    },

    async logout() {
      if (!auth) return;
      try {
        await auth.signOut();
      } catch (err) {
        Logger.error(LAYER, 'Logout failed:', err);
        throw err;
      }
    }
  };

  window.AuthModel = AuthModel;
})();

