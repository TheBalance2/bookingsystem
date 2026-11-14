/* ============================================================
   Booking Model — San Isidro College Reservation System
   Model Layer (js/models/booking-model.js)
   Handles all Firestore operations for 'bookings' and 'receipts',
   including atomic sequential ID allocation, conflict queries,
   admin mass delete, and JSON backup restore.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'BookingModel';
  const SETTINGS_COLLECTION        = 'settings';
  const BOOKING_ID_DOC             = 'bookingId';
  const PUBLIC_SCHEDULE_COLLECTION = 'public_schedule';
  const BOOKING_LOOKUP_COLLECTION  = 'booking_lookup';
  const LOI_COLLECTION             = 'letters_of_intent';

  const PUBLIC_FIELDS = [
    'facility', 'classroom', 'vehicle', 'userType', 'status',
    'date', 'startDate', 'endDate', 'startTime', 'endTime'
  ];

  const ALLOWED_RESTORE_FIELDS = new Set([
    'referenceId', 'userType', 'firstName', 'lastName', 'middleInitial',
    'name', 'contactPerson', 'department', 'parentDepartment', 'collegeSchool',
    'officeHead', 'position', 'contactNumber', 'employeeId', 'address',
    'shortAddress', 'addressDetails', 'agencyType', 'agencyName', 'officeName',
    'organization', 'agency', 'email', 'facility', 'classroom', 'vehicle',
    'destination', 'assignedDriverId', 'assignedDriverName', 'assignedDriverPhone',
    'date', 'startDate', 'endDate', 'startTime', 'endTime', 'numPersons',
    'purpose', 'equipment', 'otherEquipment', 'considerations', 'dateSubmitted',
    'status', 'hasReceipt', 'receiptUploadedAt', 'hasLetterOfIntent',
    'letterOfIntentFileName', 'isSpecialBooking', 'createdByAdmin', 'lookupKey',
    'createdAt'
  ]);

  function toPublicSchedule(b) {
    if (!b || typeof b !== 'object') return {};
    return {
      facility:  String(b.facility || ''),
      classroom: String(b.classroom || ''),
      vehicle:   Array.isArray(b.vehicle) ? b.vehicle.slice(0, 10).map(String) : (b.vehicle ? [String(b.vehicle)] : []),
      userType:  String(b.userType || 'Internal'),
      status:    String(b.status || 'Pending'),
      date:      String(b.date || b.startDate || ''),
      startDate: String(b.startDate || b.date || ''),
      endDate:   String(b.endDate || b.startDate || b.date || ''),
      startTime: String(b.startTime || ''),
      endTime:   String(b.endTime || '')
    };
  }

  // Deterministic fallback hash if Web Crypto API is unavailable (e.g. plain HTTP LAN IP)
  function fallbackSha256Hex(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    let result = '';
    const words = [];
    const asciiBitLength = ascii.length * 8;
    let hash = [];
    const k = [];
    let primeCounter = 0;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while ((ascii.length % 64) - 56) ascii += '\x00';
    for (let i = 0; i < ascii.length; i++) {
      const j = ascii.charCodeAt(i);
      if (j >> 8) return '';
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (asciiBitLength / maxWord) | 0;
    words[words.length] = asciiBitLength;
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, (j += 16));
      const oldHash = hash;
      hash = hash.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const temp1 =
          hash[7] +
          (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
          ((e & hash[5]) ^ (~e & hash[6])) +
          k[i] +
          (w[i] =
            i < 16
              ? w[i]
              : (w[i - 16] +
                  (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                  w[i - 7] +
                  (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
                0);
        const temp2 =
          (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
          ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (let i = 0; i < 8; i++) {
      for (let j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? 0 : '') + b.toString(16);
      }
    }
    return result;
  }

  async function computeLookupKey(refId, email) {
    const cleanRef   = String(refId || '').trim().toUpperCase();
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanRef || !cleanEmail) return '';
    const raw = `${cleanRef}|${cleanEmail}`;
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
        return Array.from(new Uint8Array(buf))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      }
    } catch (_) { /* fallback below */ }
    return fallbackSha256Hex(unescape(encodeURIComponent(raw)));
  }

  function reviveTimestamp(val) {
    if (!val) return firebase.firestore.FieldValue.serverTimestamp();
    if (typeof val.toMillis === 'function') return val;
    if (typeof val === 'object' && typeof val.seconds === 'number') {
      return new firebase.firestore.Timestamp(val.seconds, val.nanoseconds || 0);
    }
    if (typeof val === 'string' || typeof val === 'number') {
      const d = new Date(val);
      if (!Number.isNaN(d.getTime())) {
        return firebase.firestore.Timestamp.fromDate(d);
      }
    }
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  const BookingModel = {
    PUBLIC_FIELDS,
    toPublicSchedule,
    computeLookupKey,

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
      let fallbackUnsub = null;
      let usingFallback = false;

      const startLegacyFallback = () => {
        if (usingFallback) return;
        usingFallback = true;
        fallbackUnsub = db.collection('bookings')
          .where('status', 'in', ['Approved', 'Pending'])
          .onSnapshot(snapshot => {
            const bookings = [];
            snapshot.forEach(doc => {
              bookings.push({ id: doc.id, ...toPublicSchedule(doc.data()) });
            });
            if (typeof onUpdate === 'function') onUpdate(bookings, snapshot);
          }, err => {
            Logger.warn(LAYER, 'Calendar bookings fallback listener error:', err);
            if (typeof onError === 'function') onError(err);
          });
      };

      const pubUnsub = db.collection(PUBLIC_SCHEDULE_COLLECTION)
        .where('status', 'in', ['Approved', 'Pending'])
        .onSnapshot(snapshot => {
          const bookings = [];
          snapshot.forEach(doc => {
            bookings.push({ id: doc.id, ...toPublicSchedule(doc.data()) });
          });
          if (typeof onUpdate === 'function') onUpdate(bookings, snapshot);
        }, err => {
          Logger.info(LAYER, 'public_schedule listener unavailable, trying legacy fallback:', err?.code || err);
          startLegacyFallback();
        });

      return () => {
        if (typeof pubUnsub === 'function') pubUnsub();
        if (typeof fallbackUnsub === 'function') fallbackUnsub();
      };
    },

    // Atomically allocate the next sequential ID (e.g. SIC-2026-001) and create the booking doc
    // plus its sanitized public_schedule mirror, hashed booking_lookup, and Letter of Intent PDF.
    async create(bookingPayload, letterOfIntentData = null) {
      const configRef = db.collection(SETTINGS_COLLECTION).doc(BOOKING_ID_DOC);
      const newBookingRef = db.collection('bookings').doc();
      const publicScheduleRef = db.collection(PUBLIC_SCHEDULE_COLLECTION).doc(newBookingRef.id);

      const runCreateTransaction = async (useNewCollections) => {
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
          const lookupKey = await computeLookupKey(refId, bookingPayload.email);

          const fullBookingDoc = {
            ...bookingPayload,
            referenceId: refId,
            lookupKey:   lookupKey || '',
            createdAt:   bookingPayload.createdAt || firebase.firestore.FieldValue.serverTimestamp()
          };
          transaction.set(newBookingRef, fullBookingDoc);

          if (useNewCollections) {
            transaction.set(publicScheduleRef, toPublicSchedule(fullBookingDoc));

            if (lookupKey) {
              const lookupRef = db.collection(BOOKING_LOOKUP_COLLECTION).doc(lookupKey);
              transaction.set(lookupRef, {
                bookingId:   newBookingRef.id,
                referenceId: refId,
                userType:    String(bookingPayload.userType || 'Internal'),
                createdAt:   firebase.firestore.FieldValue.serverTimestamp()
              });
            }

            if (letterOfIntentData && letterOfIntentData.dataUrl) {
              const loiRef = db.collection(LOI_COLLECTION).doc(newBookingRef.id);
              transaction.set(loiRef, {
                imageData:  letterOfIntentData.dataUrl,
                fileName:   letterOfIntentData.fileName || 'Letter_of_Intent.pdf',
                mimeType:   'application/pdf',
                type:       'letter_of_intent',
                uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
              });
            }
          } else if (letterOfIntentData && letterOfIntentData.dataUrl) {
            const legacyLoiRef = db.collection('receipts').doc('loi_' + newBookingRef.id);
            transaction.set(legacyLoiRef, {
              imageData:  letterOfIntentData.dataUrl,
              fileName:   letterOfIntentData.fileName || 'Letter_of_Intent.pdf',
              mimeType:   'application/pdf',
              type:       'letter_of_intent',
              uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
          }

          return refId;
        });
      };

      try {
        return await runCreateTransaction(true);
      } catch (err) {
        if (err && err.code === 'permission-denied') {
          Logger.warn(LAYER, 'New security collections not yet published in firestore.rules; retrying with legacy collections.');
          return await runCreateTransaction(false);
        }
        Logger.error(LAYER, 'Create booking transaction failed:', err);
        throw err;
      }
    },

    // Check if facility (and specific classroom if Classroom is chosen) has overlapping Pending or Approved bookings
    async hasScheduleConflict(facility, startDate, endDate, startTime, endTime, classroom = '') {
      const effectiveEnd = endDate || startDate;
      const newStart = Utils.toDateTimeMs(startDate, startTime);
      const newEnd   = Utils.toDateTimeMs(effectiveEnd, endTime);

      if (!facility || Number.isNaN(newStart) || Number.isNaN(newEnd) || newEnd <= newStart) {
        return false;
      }

      const isClassroom = Utils.isClassroomFacilityName(facility);
      if (isClassroom && !classroom) {
        return false;
      }

      const evaluateSnapshot = (snapshot) => {
        let conflict = false;
        snapshot.forEach(doc => {
          const d = doc.data();
          if (isClassroom && classroom && d.classroom !== classroom) {
            return;
          }
          const exStartDate = d.startDate || d.date;
          const exEndDate   = d.endDate || exStartDate;
          const existingStart = Utils.toDateTimeMs(exStartDate, d.startTime);
          const existingEnd   = Utils.toDateTimeMs(exEndDate, d.endTime);

          if (Number.isNaN(existingStart) || Number.isNaN(existingEnd)) return;
          if (newStart < existingEnd && newEnd > existingStart) {
            conflict = true;
          }
        });
        return conflict;
      };

      try {
        const pubSnap = await db.collection(PUBLIC_SCHEDULE_COLLECTION)
          .where('facility', '==', facility)
          .where('status', 'in', ['Pending', 'Approved'])
          .get();

        return evaluateSnapshot(pubSnap);
      } catch (_) { /* fall through to legacy bookings check if not yet migrated */ }

      try {
        const snapshot = await db.collection('bookings')
          .where('facility', '==', facility)
          .where('status', 'in', ['Pending', 'Approved'])
          .get();
        return evaluateSnapshot(snapshot);
      } catch (err) {
        Logger.warn(LAYER, 'Conflict check completed via public_schedule only:', err?.code || err);
        return false;
      }
    },

    async updateStatus(docId, newStatus, extraFields = {}) {
      try {
        const docRef = db.collection('bookings').doc(docId);
        await docRef.update({ status: newStatus, ...extraFields });
        const doc = await docRef.get();
        const updated = doc.exists ? { id: doc.id, ...doc.data() } : null;

        if (updated) {
          try {
            await db.collection(PUBLIC_SCHEDULE_COLLECTION).doc(docId).set(
              toPublicSchedule(updated),
              { merge: true }
            );
          } catch (mirrorErr) {
            Logger.warn(LAYER, 'Could not update public_schedule mirror:', mirrorErr?.code || mirrorErr);
          }
        }
        return updated;
      } catch (err) {
        Logger.error(LAYER, 'Status update failed:', err);
        throw err;
      }
    },

    async remove(docId, hasReceipt = false, hasLetterOfIntent = false, lookupKey = '') {
      try {
        const batch = db.batch();
        batch.delete(db.collection('bookings').doc(docId));
        if (hasReceipt) {
          batch.delete(db.collection('receipts').doc(docId));
        }
        if (hasLetterOfIntent) {
          batch.delete(db.collection('receipts').doc('loi_' + docId));
        }
        await batch.commit();

        // Clean up security mirror documents (best-effort if rules not yet published)
        try {
          const mirrorBatch = db.batch();
          mirrorBatch.delete(db.collection(PUBLIC_SCHEDULE_COLLECTION).doc(docId));
          if (hasLetterOfIntent) {
            mirrorBatch.delete(db.collection(LOI_COLLECTION).doc(docId));
          }
          if (lookupKey) {
            mirrorBatch.delete(db.collection(BOOKING_LOOKUP_COLLECTION).doc(lookupKey));
          }
          await mirrorBatch.commit();
        } catch (mirrorErr) {
          Logger.warn(LAYER, 'Mirror cleanup skipped:', mirrorErr?.code || mirrorErr);
        }
      } catch (err) {
        Logger.error(LAYER, 'Delete booking failed:', err);
        throw err;
      }
    },

    // Mass deletes an array of booking objects and their corresponding receipts/mirrors
    // in chunked batches of <= 450 Firestore operations.
    async bulkRemove(bookings, onProgress) {
      if (!Array.isArray(bookings) || bookings.length === 0) return 0;

      const ops = [];
      const mirrorRefs = [];
      for (const b of bookings) {
        if (!b || !b.id) continue;
        ops.push({ ref: db.collection('bookings').doc(b.id), isBooking: true });
        if (b.hasReceipt || b.receiptUploadedAt) {
          ops.push({ ref: db.collection('receipts').doc(b.id), isBooking: false });
        }
        if (b.hasLetterOfIntent) {
          ops.push({ ref: db.collection('receipts').doc('loi_' + b.id), isBooking: false });
          mirrorRefs.push(db.collection(LOI_COLLECTION).doc(b.id));
        }
        mirrorRefs.push(db.collection(PUBLIC_SCHEDULE_COLLECTION).doc(b.id));
        const key = b.lookupKey || (b.referenceId && b.email ? await computeLookupKey(b.referenceId, b.email) : '');
        if (key) {
          mirrorRefs.push(db.collection(BOOKING_LOOKUP_COLLECTION).doc(key));
        }
      }

      const MAX_OPS_PER_BATCH = 450;
      let deletedBookings = 0;

      try {
        for (let i = 0; i < ops.length; i += MAX_OPS_PER_BATCH) {
          const batch = db.batch();
          const slice = ops.slice(i, i + MAX_OPS_PER_BATCH);
          let batchBookingsCount = 0;

          slice.forEach(op => {
            batch.delete(op.ref);
            if (op.isBooking) batchBookingsCount++;
          });

          await batch.commit();
          deletedBookings += batchBookingsCount;
          if (typeof onProgress === 'function') {
            onProgress(deletedBookings, bookings.length);
          }
        }

        // Best-effort cleanup of mirror collections
        try {
          for (let i = 0; i < mirrorRefs.length; i += MAX_OPS_PER_BATCH) {
            const mBatch = db.batch();
            mirrorRefs.slice(i, i + MAX_OPS_PER_BATCH).forEach(ref => mBatch.delete(ref));
            await mBatch.commit();
          }
        } catch (mirrorErr) {
          Logger.warn(LAYER, 'Bulk mirror cleanup skipped:', mirrorErr?.code || mirrorErr);
        }

        return deletedBookings;
      } catch (err) {
        Logger.error(LAYER, 'Bulk delete bookings failed:', err);
        throw err;
      }
    },

    // Restores bookings from a JSON backup without altering settings/bookingId counter.
    // Strictly whitelists booking fields and skips bookings whose ID or referenceId already exists.
    async restoreMany(backupItems, existingBookings = [], onProgress) {
      if (!Array.isArray(backupItems) || backupItems.length === 0) {
        return { restoredCount: 0, skippedCount: 0 };
      }

      const existingIds  = new Set(existingBookings.map(b => b.id).filter(Boolean));
      const existingRefs = new Set(existingBookings.map(b => b.referenceId).filter(Boolean));

      const toRestore = [];
      let skippedCount = 0;

      for (const raw of backupItems) {
        if (!raw || typeof raw !== 'object') continue;
        const docId = String(raw._docId || raw.id || '').trim();
        const refId = String(raw.referenceId || '').trim();

        if ((docId && existingIds.has(docId)) || (refId && existingRefs.has(refId))) {
          skippedCount++;
          continue;
        }

        // Strict field whitelist to prevent arbitrary field injection from tampered backup files
        const clean = {};
        Object.keys(raw).forEach(k => {
          if (ALLOWED_RESTORE_FIELDS.has(k)) {
            clean[k] = raw[k];
          }
        });

        clean.createdAt = reviveTimestamp(raw._createdAtIso || raw.createdAt);
        if (raw._receiptUploadedAtIso || raw.receiptUploadedAt) {
          clean.receiptUploadedAt = reviveTimestamp(raw._receiptUploadedAtIso || raw.receiptUploadedAt);
        }
        if (refId && clean.email && !clean.lookupKey) {
          clean.lookupKey = await computeLookupKey(refId, clean.email);
        }

        const targetDocRef = docId
          ? db.collection('bookings').doc(docId)
          : db.collection('bookings').doc();

        if (docId) existingIds.add(docId);
        if (refId) existingRefs.add(refId);

        toRestore.push({ ref: targetDocRef, data: clean });
      }

      const MAX_OPS_PER_BATCH = 450;
      let restoredCount = 0;

      try {
        for (let i = 0; i < toRestore.length; i += MAX_OPS_PER_BATCH) {
          const batch = db.batch();
          const slice = toRestore.slice(i, i + MAX_OPS_PER_BATCH);
          slice.forEach(item => {
            batch.set(item.ref, item.data);
          });
          await batch.commit();
          restoredCount += slice.length;
          if (typeof onProgress === 'function') {
            onProgress(restoredCount, toRestore.length);
          }
        }

        // Best-effort sync to public_schedule and booking_lookup
        try {
          const mirrorOps = [];
          toRestore.forEach(item => {
            mirrorOps.push({
              ref:  db.collection(PUBLIC_SCHEDULE_COLLECTION).doc(item.ref.id),
              data: toPublicSchedule(item.data)
            });
            if (item.data.lookupKey) {
              mirrorOps.push({
                ref:  db.collection(BOOKING_LOOKUP_COLLECTION).doc(item.data.lookupKey),
                data: {
                  bookingId:   item.ref.id,
                  referenceId: String(item.data.referenceId || ''),
                  userType:    String(item.data.userType || 'Internal'),
                  createdAt:   firebase.firestore.FieldValue.serverTimestamp()
                }
              });
            }
          });
          for (let i = 0; i < mirrorOps.length; i += MAX_OPS_PER_BATCH) {
            const mBatch = db.batch();
            mirrorOps.slice(i, i + MAX_OPS_PER_BATCH).forEach(op => mBatch.set(op.ref, op.data, { merge: true }));
            await mBatch.commit();
          }
        } catch (mirrorErr) {
          Logger.warn(LAYER, 'Restore mirror sync skipped:', mirrorErr?.code || mirrorErr);
        }

        return { restoredCount, skippedCount };
      } catch (err) {
        Logger.error(LAYER, 'Restore bookings failed:', err);
        throw err;
      }
    },

    // One-click True Admin migration that populates public_schedule/{id} and booking_lookup/{hash}
    // for all existing bookings so public read access on 'bookings' can be safely revoked.
    async syncPublicSchedule(bookings, onProgress) {
      if (!Array.isArray(bookings) || bookings.length === 0) return 0;

      const ops = [];
      for (const b of bookings) {
        if (!b || !b.id) continue;
        ops.push({
          ref:  db.collection(PUBLIC_SCHEDULE_COLLECTION).doc(b.id),
          data: toPublicSchedule(b),
          isPrimary: true
        });

        const lookupKey = b.lookupKey || (b.referenceId && b.email ? await computeLookupKey(b.referenceId, b.email) : '');
        if (lookupKey) {
          ops.push({
            ref:  db.collection(BOOKING_LOOKUP_COLLECTION).doc(lookupKey),
            data: {
              bookingId:   b.id,
              referenceId: String(b.referenceId || ''),
              userType:    String(b.userType || 'Internal'),
              createdAt:   firebase.firestore.FieldValue.serverTimestamp()
            },
            isPrimary: false
          });
          if (!b.lookupKey) {
            ops.push({
              ref:  db.collection('bookings').doc(b.id),
              data: { lookupKey },
              isPrimary: false,
              merge: true
            });
          }
        }
      }

      const MAX_OPS_PER_BATCH = 400;
      let syncedBookings = 0;

      for (let i = 0; i < ops.length; i += MAX_OPS_PER_BATCH) {
        const batch = db.batch();
        const slice = ops.slice(i, i + MAX_OPS_PER_BATCH);
        let batchPrimary = 0;

        slice.forEach(op => {
          if (op.merge) {
            batch.set(op.ref, op.data, { merge: true });
          } else {
            batch.set(op.ref, op.data);
          }
          if (op.isPrimary) batchPrimary++;
        });

        await batch.commit();
        syncedBookings += batchPrimary;
        if (typeof onProgress === 'function') {
          onProgress(syncedBookings, bookings.length);
        }
      }

      return syncedBookings;
    },

    // Privacy-preserving lookup for External Receipt Upload:
    // Uses SHA-256(ReferenceID|email) in booking_lookup + public_schedule status
    // so unauthenticated users never need read access to the 'bookings' collection.
    async findForReceipt(refId, email) {
      const lookupKey = await computeLookupKey(refId, email);
      if (lookupKey) {
        try {
          const lookupSnap = await db.collection(BOOKING_LOOKUP_COLLECTION).doc(lookupKey).get();
          if (lookupSnap.exists) {
            const lookupData = lookupSnap.data() || {};
            const bookingId = lookupData.bookingId;
            if (bookingId) {
              const schedSnap = await db.collection(PUBLIC_SCHEDULE_COLLECTION).doc(bookingId).get();
              const status = schedSnap.exists ? (schedSnap.data()?.status || 'Pending Payment') : 'Pending Payment';
              return {
                id:          bookingId,
                referenceId: lookupData.referenceId || refId,
                status:      status,
                lookupKey:   lookupKey
              };
            }
          }
          return null;
        } catch (err) {
          Logger.info(LAYER, 'booking_lookup unavailable, falling back to legacy query:', err?.code || err);
        }
      }
      return this.findByReferenceAndEmail(refId, email);
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

    async getLetterOfIntent(docId) {
      if (!docId) return null;
      try {
        const loiDoc = await db.collection(LOI_COLLECTION).doc(docId).get();
        if (loiDoc.exists) {
          const data = loiDoc.data() || {};
          const dataUrl = Utils.sanitizeUrl(data.imageData);
          if (dataUrl) {
            return {
              dataUrl,
              fileName: data.fileName || 'Letter_of_Intent.pdf',
              uploadedAt: data.uploadedAt || null
            };
          }
        }
      } catch (_) { /* fall back to legacy receipts/loi_<docId> */ }

      try {
        const legacyDoc = await db.collection('receipts').doc('loi_' + docId).get();
        if (legacyDoc.exists) {
          const data = legacyDoc.data() || {};
          const dataUrl = Utils.sanitizeUrl(data.imageData);
          if (dataUrl) {
            return {
              dataUrl,
              fileName: data.fileName || 'Letter_of_Intent.pdf',
              uploadedAt: data.uploadedAt || null
            };
          }
        }
      } catch (err) {
        Logger.warn(LAYER, 'Could not load Letter of Intent PDF:', err);
      }
      return null;
    },

    async saveReceipt(bookingId, base64DataUrl) {
      const receiptPayload = {
        imageData:  base64DataUrl,
        mimeType:   'image/jpeg',
        uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      const bookingUpdate = {
        hasReceipt:        true,
        status:            'Payment Under Review',
        receiptUploadedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        const batch = db.batch();
        batch.set(db.collection('receipts').doc(bookingId), receiptPayload);
        batch.update(db.collection('bookings').doc(bookingId), bookingUpdate);
        batch.update(db.collection(PUBLIC_SCHEDULE_COLLECTION).doc(bookingId), {
          status: 'Payment Under Review'
        });
        await batch.commit();
      } catch (err) {
        // Fallback if public_schedule doc does not exist yet or rules not published yet
        Logger.info(LAYER, 'Atomic receipt+public_schedule batch failed, using legacy receipt save:', err?.code || err);
        try {
          const legacyBatch = db.batch();
          legacyBatch.set(db.collection('receipts').doc(bookingId), receiptPayload);
          legacyBatch.update(db.collection('bookings').doc(bookingId), bookingUpdate);
          await legacyBatch.commit();
        } catch (legacyErr) {
          Logger.error(LAYER, 'Save receipt failed:', legacyErr);
          throw legacyErr;
        }
      }
    }
  };

  window.BookingModel = BookingModel;
})();
