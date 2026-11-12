/* ============================================================
   Booking Model — San Isidro College Reservation System
   Model Layer (js/models/booking-model.js)
   Handles all Firestore operations for 'bookings' and 'receipts',
   including atomic sequential ID allocation and conflict queries.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'BookingModel';
  const SETTINGS_COLLECTION = 'settings';
  const BOOKING_ID_DOC      = 'bookingId';

  const BookingModel = {
    listenAll(onUpdate, onError) {
      return db.collection('bookings')
        .orderBy('createdAt', 'desc')
        .onSnapshot(snapshot => {
          const bookings = [];
          snapshot.forEach(doc => {
            bookings.push({ id: doc.id, ...doc.data() });
          });
          if (typeof onUpdate === 'function') onUpdate(bookings, snapshot);
        }, err => {
          Logger.error(LAYER, 'Bookings listener error:', err);
          if (typeof onError === 'function') onError(err);
        });
    },

    listenApprovedAndPending(onUpdate, onError) {
      return db.collection('bookings')
        .where('status', 'in', ['Approved', 'Pending'])
        .onSnapshot(snapshot => {
          const bookings = [];
          snapshot.forEach(doc => {
            bookings.push({ id: doc.id, ...doc.data() });
          });
          if (typeof onUpdate === 'function') onUpdate(bookings, snapshot);
        }, err => {
          Logger.warn(LAYER, 'Calendar bookings listener error:', err);
          if (typeof onError === 'function') onError(err);
        });
    },

    // Atomically allocate the next sequential ID (e.g. SIC-2026-001) and create the booking doc
    async create(bookingPayload) {
      const configRef = db.collection(SETTINGS_COLLECTION).doc(BOOKING_ID_DOC);
      const newBookingRef = db.collection('bookings').doc();

      try {
        return await db.runTransaction(async (transaction) => {
          const configSnap = await transaction.get(configRef);
          let prefix = Utils.DEFAULT_BOOKING_ID_PREFIX;
          let year   = String(new Date().getFullYear() || Utils.DEFAULT_BOOKING_ID_YEAR);
          let seq    = 1;

          if (configSnap.exists) {
            const cfg = configSnap.data() || {};
            prefix = String(cfg.prefix || Utils.DEFAULT_BOOKING_ID_PREFIX).trim().toUpperCase() || Utils.DEFAULT_BOOKING_ID_PREFIX;
            year   = String(cfg.year || year).trim() || year;
            const parsedSeq = Number(cfg.nextSequence);
            seq = (Number.isFinite(parsedSeq) && parsedSeq >= 1) ? Math.floor(parsedSeq) : 1;

            transaction.update(configRef, {
              nextSequence: seq + 1,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
          } else {
            transaction.set(configRef, {
              prefix: prefix,
              year: year,
              nextSequence: 2,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
          }

          const refId = Utils.formatSequentialBookingId(prefix, year, seq);
          transaction.set(newBookingRef, {
            ...bookingPayload,
            referenceId: refId,
            createdAt: bookingPayload.createdAt || firebase.firestore.FieldValue.serverTimestamp()
          });

          return refId;
        });
      } catch (err) {
        Logger.error(LAYER, 'Create booking transaction failed:', err);
        throw err;
      }
    },

    // Check if facility has overlapping Pending or Approved bookings
    async hasScheduleConflict(facility, startDate, endDate, startTime, endTime) {
      const effectiveEnd = endDate || startDate;
      const newStart = Utils.toDateTimeMs(startDate, startTime);
      const newEnd   = Utils.toDateTimeMs(effectiveEnd, endTime);

      if (!facility || Number.isNaN(newStart) || Number.isNaN(newEnd) || newEnd <= newStart) {
        return false;
      }

      try {
        const snapshot = await db.collection('bookings')
          .where('facility', '==', facility)
          .where('status', 'in', ['Pending', 'Approved'])
          .get();

        let hasConflict = false;
        snapshot.forEach(doc => {
          const d = doc.data();
          const exStartDate = d.startDate || d.date;
          const exEndDate   = d.endDate || exStartDate;
          const existingStart = Utils.toDateTimeMs(exStartDate, d.startTime);
          const existingEnd   = Utils.toDateTimeMs(exEndDate, d.endTime);

          if (Number.isNaN(existingStart) || Number.isNaN(existingEnd)) return;
          if (newStart < existingEnd && newEnd > existingStart) {
            hasConflict = true;
          }
        });

        return hasConflict;
      } catch (err) {
        Logger.warn(LAYER, 'Conflict check failed:', err);
        return false;
      }
    },

    async updateStatus(docId, newStatus) {
      try {
        const docRef = db.collection('bookings').doc(docId);
        await docRef.update({ status: newStatus });
        const doc = await docRef.get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
      } catch (err) {
        Logger.error(LAYER, 'Status update failed:', err);
        throw err;
      }
    },

    async remove(docId) {
      try {
        await db.collection('bookings').doc(docId).delete();
      } catch (err) {
        Logger.error(LAYER, 'Delete booking failed:', err);
        throw err;
      }
    },

    async findByReferenceAndEmail(refId, email) {
      try {
        const snapshot = await db.collection('bookings')
          .where('referenceId', '==', refId)
          .where('email', '==', email)
          .get();

        if (snapshot.empty) return null;

        const getDocCreatedMs = (docSnap) => {
          const ts = docSnap.data()?.createdAt;
          if (!ts) return 0;
          if (typeof ts.toMillis === 'function') return ts.toMillis();
          if (typeof ts.seconds === 'number') return ts.seconds * 1000;
          const parsed = new Date(ts).getTime();
          return Number.isNaN(parsed) ? 0 : parsed;
        };

        const sortedDocs = snapshot.docs.slice().sort((a, b) => {
          const aPending = a.data()?.status === 'Pending Payment' ? 1 : 0;
          const bPending = b.data()?.status === 'Pending Payment' ? 1 : 0;
          if (aPending !== bPending) return bPending - aPending;
          return getDocCreatedMs(b) - getDocCreatedMs(a);
        });

        const top = sortedDocs[0];
        return { id: top.id, ...top.data() };
      } catch (err) {
        Logger.error(LAYER, 'Query by referenceId and email failed:', err);
        throw err;
      }
    },

    async getReceipt(docId, fallbackUrl = '') {
      try {
        const receiptDoc = await db.collection('receipts').doc(docId).get();
        if (receiptDoc.exists) {
          return Utils.sanitizeUrl(receiptDoc.data().imageData);
        }
      } catch (err) {
        Logger.warn(LAYER, 'Could not load receipt from receipts collection:', err);
      }
      return Utils.sanitizeUrl(fallbackUrl);
    },

    async saveReceipt(bookingId, base64DataUrl) {
      try {
        await db.collection('receipts').doc(bookingId).set({
          imageData: base64DataUrl,
          uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await db.collection('bookings').doc(bookingId).update({
          hasReceipt: true,
          status: 'Payment Under Review',
          receiptUploadedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (err) {
        Logger.error(LAYER, 'Save receipt failed:', err);
        throw err;
      }
    }
  };

  window.BookingModel = BookingModel;
})();

