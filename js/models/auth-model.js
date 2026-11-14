/* ============================================================
   Authentication Model — San Isidro College Reservation System
   Model Layer (js/models/auth-model.js)
   Handles all Firebase Authentication interactions, including
   secondary-app account creation so the Admin stays logged in.
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
    },

    // Creates a new Firebase Auth login using an isolated secondary Firebase app
    // instance with Persistence.NONE so the currently logged-in Admin session is not disturbed.
    async createLoginWithSecondaryApp(email, password) {
      if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') {
        throw new Error('Firebase SDK is not available.');
      }
      const appName = 'AccountCreator_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const secondaryApp = firebase.initializeApp(firebaseConfig, appName);
      try {
        const secondaryAuth = secondaryApp.auth();
        if (firebase.auth && firebase.auth.Auth && firebase.auth.Auth.Persistence) {
          await secondaryAuth.setPersistence(firebase.auth.Auth.Persistence.NONE);
        }
        const userCred = await secondaryAuth.createUserWithEmailAndPassword(
          String(email || '').trim(),
          String(password || '')
        );
        const uid = userCred && userCred.user ? userCred.user.uid : '';
        await secondaryAuth.signOut().catch(() => {});
        return uid;
      } catch (err) {
        Logger.error(LAYER, 'Secondary app user creation failed:', err);
        throw err;
      } finally {
        await secondaryApp.delete().catch(() => {});
      }
    },

    async sendPasswordReset(email) {
      if (!auth) throw new Error('Firebase Auth is not available.');
      try {
        await auth.sendPasswordResetEmail(String(email || '').trim());
      } catch (err) {
        Logger.error(LAYER, 'Password reset email failed:', err);
        throw err;
      }
    },

    // Re-authenticates the currently signed-in user with their password before
    // destructive administrative actions (mass delete, account delete, restore, log purge).
    async reauthenticate(password) {
      if (!auth || !auth.currentUser) {
        throw new Error('No authenticated user session found.');
      }
      const user = auth.currentUser;
      const email = user.email || (window.Session && Session.profile && Session.profile.email) || '';
      if (!email) {
        throw new Error('Current user email is unavailable for re-authentication.');
      }
      if (!password) {
        throw new Error('Password is required.');
      }
      const credential = firebase.auth.EmailAuthProvider.credential(email, String(password));
      await user.reauthenticateWithCredential(credential);
      return true;
    }
  };

  window.AuthModel = AuthModel;
})();
