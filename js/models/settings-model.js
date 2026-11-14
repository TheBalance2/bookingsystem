/* ============================================================
   Settings Model — San Isidro College Reservation System
   Model Layer (js/models/settings-model.js)
   Handles Firestore operations for 'settings/bookingId' and
   'settings/signatories'.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'SettingsModel';
  const SETTINGS_COLLECTION = 'settings';
  const BOOKING_ID_DOC      = 'bookingId';
  const SIGNATORIES_DOC     = 'signatories';
  const SYSTEM_DOC          = 'system';

  const SettingsModel = {
    SETTINGS_COLLECTION,
    BOOKING_ID_DOC,
    SIGNATORIES_DOC,
    SYSTEM_DOC,

    async getSystemConfig() {
      try {
        const docSnap = await db.collection(SETTINGS_COLLECTION).doc(SYSTEM_DOC).get();
        if (docSnap.exists) {
          const d = docSnap.data() || {};
          const testingMode = d.testingMode !== undefined ? Boolean(d.testingMode) : true;
          window.SIC_TESTING_MODE = testingMode;
          return { testingMode, updatedAt: d.updatedAt || null };
        }
      } catch (err) {
        Logger.warn(LAYER, 'Could not fetch settings/system config:', err?.code || err);
      }
      return { testingMode: Boolean(window.SIC_TESTING_MODE) };
    },

    listenSystemConfig(onUpdate, onError) {
      try {
        const sysRef = db.collection(SETTINGS_COLLECTION).doc(SYSTEM_DOC);
        return sysRef.onSnapshot((docSnap) => {
          const d = docSnap.exists ? (docSnap.data() || {}) : {};
          const testingMode = d.testingMode !== undefined ? Boolean(d.testingMode) : true;
          window.SIC_TESTING_MODE = testingMode;
          if (typeof onUpdate === 'function') {
            onUpdate({ testingMode, updatedAt: d.updatedAt || null, exists: docSnap.exists });
          }
        }, (err) => {
          Logger.warn(LAYER, 'System config listener error:', err?.code || err);
          if (typeof onError === 'function') onError(err);
        });
      } catch (err) {
        return () => {};
      }
    },

    async setTestingMode(testingMode) {
      const cleanFlag = Boolean(testingMode);
      try {
        await db.collection(SETTINGS_COLLECTION).doc(SYSTEM_DOC).set({
          testingMode: cleanFlag,
          updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy:   (window.Session && Session.profile && Session.profile.uid) || ''
        }, { merge: true });
        window.SIC_TESTING_MODE = cleanFlag;
        return cleanFlag;
      } catch (err) {
        Logger.error(LAYER, 'Failed to update testingMode in settings/system:', err);
        throw err;
      }
    },

    async getBookingIdConfig() {
      try {
        const docSnap = await db.collection(SETTINGS_COLLECTION).doc(BOOKING_ID_DOC).get();
        return docSnap.exists ? (docSnap.data() || {}) : null;
      } catch (err) {
        Logger.warn(LAYER, 'Could not fetch bookingId config:', err);
        return null;
      }
    },

    listenBookingIdConfig(onUpdate, onError) {
      const configRef = db.collection(SETTINGS_COLLECTION).doc(BOOKING_ID_DOC);

      return configRef.onSnapshot(async (docSnap) => {
        if (!docSnap.exists) {
          const seedYear = String(new Date().getFullYear() || Utils.DEFAULT_BOOKING_ID_YEAR);
          try {
            await configRef.set({
              prefix: Utils.DEFAULT_BOOKING_ID_PREFIX,
              year: seedYear,
              nextSequence: 1,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return;
          } catch (seedErr) {
            Logger.warn(LAYER, 'Could not seed settings/bookingId yet (check firestore.rules):', seedErr);
          }
        }

        const data = docSnap.exists ? (docSnap.data() || {}) : {};
        const parsedSeq = Number(data.nextSequence);
        const state = {
          prefix: Utils.sanitizeIdSegment(data.prefix) || Utils.DEFAULT_BOOKING_ID_PREFIX,
          year: Utils.sanitizeIdSegment(data.year) || Utils.DEFAULT_BOOKING_ID_YEAR,
          nextSequence: (Number.isFinite(parsedSeq) && parsedSeq >= 1) ? Math.floor(parsedSeq) : 1
        };

        if (typeof onUpdate === 'function') onUpdate(state);
      }, (err) => {
        Logger.warn(LAYER, 'Booking ID config listener error:', err);
        if (typeof onError === 'function') onError(err);
      });
    },

    async saveBookingIdConfig({ prefix, year, nextSequence }) {
      try {
        await db.collection(SETTINGS_COLLECTION).doc(BOOKING_ID_DOC).set({
          prefix,
          year,
          nextSequence,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (err) {
        Logger.error(LAYER, 'Failed to save Booking ID settings:', err);
        throw err;
      }
    },

    async resetBookingIdCounter(prefix, year) {
      return this.saveBookingIdConfig({ prefix, year, nextSequence: 1 });
    },

    async getSignatories() {
      try {
        const docSnap = await db.collection(SETTINGS_COLLECTION).doc(SIGNATORIES_DOC).get();
        const d = docSnap.exists ? (docSnap.data() || {}) : {};
        return {
          facilitiesInCharge:      String(d.facilitiesInCharge || '').trim(),
          comptroller:             String(d.comptroller || '').trim(),
          generalAdminCoordinator: String(d.generalAdminCoordinator || '').trim(),
          vpAdminFinance:          String(d.vpAdminFinance || '').trim()
        };
      } catch (err) {
        Logger.warn(LAYER, 'Could not fetch signatories:', err);
        return {
          facilitiesInCharge: '',
          comptroller: '',
          generalAdminCoordinator: '',
          vpAdminFinance: ''
        };
      }
    },

    listenSignatories(onUpdate, onError) {
      try {
        const sigRef = db.collection(SETTINGS_COLLECTION).doc(SIGNATORIES_DOC);
        return sigRef.onSnapshot((docSnap) => {
          const d = docSnap.exists ? (docSnap.data() || {}) : {};
          const state = {
            facilitiesInCharge:      String(d.facilitiesInCharge || '').trim(),
            comptroller:             String(d.comptroller || '').trim(),
            generalAdminCoordinator: String(d.generalAdminCoordinator || '').trim(),
            vpAdminFinance:          String(d.vpAdminFinance || '').trim()
          };
          if (typeof onUpdate === 'function') onUpdate(state);
        }, (err) => {
          Logger.warn(LAYER, 'Signatories config listener error:', err);
          if (typeof onError === 'function') onError(err);
        });
      } catch (err) {
        Logger.warn(LAYER, 'Could not attach signatories listener:', err);
        return () => {};
      }
    },

    async saveSignatories({ facilitiesInCharge, comptroller, generalAdminCoordinator, vpAdminFinance }) {
      try {
        await db.collection(SETTINGS_COLLECTION).doc(SIGNATORIES_DOC).set({
          facilitiesInCharge,
          comptroller,
          generalAdminCoordinator,
          vpAdminFinance: vpAdminFinance || '',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (err) {
        Logger.error(LAYER, 'Failed to save PDF signatories:', err);
        throw err;
      }
    }
  };

  window.SettingsModel = SettingsModel;
})();

