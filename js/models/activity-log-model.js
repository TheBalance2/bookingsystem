/* ============================================================
   Activity Log Model — San Isidro College Reservation System
   Model Layer (js/models/activity-log-model.js)
   Handles tamper-proof audit trail writes and monthly queries/deletes
   for Facility-In-Charge and Administrator actions.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'ActivityLogModel';
  const COLLECTION = 'activity_logs';

  function getCurrentMonthKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  function toMillis(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.seconds === 'number') return ts.seconds * 1000;
    const parsed = new Date(ts).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  const ActivityLogModel = {
    getCurrentMonthKey,

    // Appends an immutable activity log entry. Never throws to callers
    // so logging cannot break the primary business operation.
    async log(action, category, options = {}) {
      try {
        const profile = options.actorOverride || (window.Session && Session.profile) || null;
        const currentUser = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;

        const actorUid   = (profile && profile.uid) || (currentUser && currentUser.uid) || '';
        if (!actorUid) return null;

        const actorEmail = (profile && profile.email) || (currentUser && currentUser.email) || '';
        const actorName  = (profile && profile.fullName) || actorEmail || 'Staff';
        const actorRole  = (profile && profile.role) || 'facility_incharge';

        const payload = {
          actorUid,
          actorEmail,
          actorName,
          actorRole,
          action:      String(action || '').trim(),
          category:    String(category || 'General').trim(),
          targetId:    String(options.targetId || '').trim(),
          targetLabel: String(options.targetLabel || '').trim(),
          details:     options.details && typeof options.details === 'object' ? options.details : {},
          monthKey:    options.monthKey || getCurrentMonthKey(),
          createdAt:   firebase.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection(COLLECTION).add(payload);
        return docRef.id;
      } catch (err) {
        Logger.warn(LAYER, 'Could not write activity log:', err);
        return null;
      }
    },

    // Queries logs for a specific YYYY-MM monthKey and sorts newest-first in memory
    // (avoids requiring a composite Firestore index on monthKey + createdAt).
    async listByMonth(monthKey) {
      const targetMonth = String(monthKey || getCurrentMonthKey()).trim();
      try {
        const snapshot = await db.collection(COLLECTION)
          .where('monthKey', '==', targetMonth)
          .get();

        const logs = [];
        snapshot.forEach(doc => {
          const d = doc.data() || {};
          logs.push({
            id: doc.id,
            ...d,
            _createdMs: toMillis(d.createdAt)
          });
        });

        logs.sort((a, b) => b._createdMs - a._createdMs);
        return logs;
      } catch (err) {
        Logger.error(LAYER, 'Failed to load activity logs for month ' + targetMonth + ':', err);
        throw err;
      }
    },

    // Deletes all log documents for a given YYYY-MM monthKey in chunked batches of <= 450.
    async deleteByMonth(monthKey) {
      const targetMonth = String(monthKey || '').trim();
      if (!targetMonth) throw new Error('Month key is required.');

      try {
        const snapshot = await db.collection(COLLECTION)
          .where('monthKey', '==', targetMonth)
          .get();

        if (snapshot.empty) return 0;

        const docs = snapshot.docs;
        const CHUNK_SIZE = 450;
        let deleted = 0;

        for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
          const batch = db.batch();
          const slice = docs.slice(i, i + CHUNK_SIZE);
          slice.forEach(docSnap => {
            batch.delete(docSnap.ref);
          });
          await batch.commit();
          deleted += slice.length;
        }

        return deleted;
      } catch (err) {
        Logger.error(LAYER, 'Failed to delete activity logs for month ' + targetMonth + ':', err);
        throw err;
      }
    }
  };

  window.ActivityLogModel = ActivityLogModel;
})();

