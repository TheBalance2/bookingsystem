/* ============================================================
   User Model — San Isidro College Reservation System
   Model Layer (js/models/user-model.js)
   Handles all Firestore operations for 'users/{uid}' role profiles
   (True Admin and Facility-In-Charge accounts).
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'UserModel';
  const COLLECTION = 'users';

  function normalizeProfile(id, data) {
    if (!data) return null;
    return {
      uid:           id,
      email:         String(data.email || '').trim(),
      fullName:      String(data.fullName || '').trim(),
      contactNumber: String(data.contactNumber || '').trim(),
      position:      String(data.position || '').trim(),
      role:          data.role === 'admin' ? 'admin' : 'facility_incharge',
      status:        data.status === 'Inactive' ? 'Inactive' : 'Active',
      createdAt:     data.createdAt || null,
      createdBy:     data.createdBy || '',
      updatedAt:     data.updatedAt || null,
      lastLoginAt:   data.lastLoginAt || null
    };
  }

  const UserModel = {
    async getProfile(uid) {
      if (!uid) return null;
      try {
        const docSnap = await db.collection(COLLECTION).doc(uid).get();
        if (!docSnap.exists) return null;
        return normalizeProfile(docSnap.id, docSnap.data());
      } catch (err) {
        Logger.error(LAYER, 'Failed to get user profile:', err);
        throw err;
      }
    },

    listenProfile(uid, onUpdate, onError) {
      if (!uid) return () => {};
      return db.collection(COLLECTION).doc(uid).onSnapshot(docSnap => {
        if (!docSnap.exists) {
          if (typeof onUpdate === 'function') onUpdate(null);
          return;
        }
        if (typeof onUpdate === 'function') {
          onUpdate(normalizeProfile(docSnap.id, docSnap.data()));
        }
      }, err => {
        Logger.warn(LAYER, 'Profile listener error:', err);
        if (typeof onError === 'function') onError(err);
      });
    },

    listenAll(onUpdate, onError) {
      return db.collection(COLLECTION).onSnapshot(snapshot => {
        const users = [];
        snapshot.forEach(doc => {
          const normalized = normalizeProfile(doc.id, doc.data());
          if (normalized) users.push(normalized);
        });
        users.sort((a, b) => {
          if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
          return (a.fullName || a.email).localeCompare(b.fullName || b.email);
        });
        if (typeof onUpdate === 'function') onUpdate(users);
      }, err => {
        Logger.error(LAYER, 'Users list listener error:', err);
        if (typeof onError === 'function') onError(err);
      });
    },

    async getAll() {
      try {
        const snapshot = await db.collection(COLLECTION).get();
        const users = [];
        snapshot.forEach(doc => {
          const normalized = normalizeProfile(doc.id, doc.data());
          if (normalized) users.push(normalized);
        });
        users.sort((a, b) => {
          if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
          return (a.fullName || a.email).localeCompare(b.fullName || b.email);
        });
        return users;
      } catch (err) {
        Logger.error(LAYER, 'Failed to fetch all users:', err);
        throw err;
      }
    },

    async createProfile(uid, payload) {
      if (!uid) throw new Error('User UID is required.');
      const cleanUid = String(uid).trim();
      const actorUid = (window.Session && Session.profile && Session.profile.uid)
        ? Session.profile.uid
        : (auth && auth.currentUser ? auth.currentUser.uid : '');

      const docData = {
        uid:           cleanUid,
        email:         String(payload.email || '').trim().toLowerCase(),
        fullName:      String(payload.fullName || '').trim(),
        contactNumber: String(payload.contactNumber || '').trim(),
        position:      String(payload.position || '').trim(),
        role:          payload.role === 'admin' ? 'admin' : 'facility_incharge',
        status:        payload.status === 'Inactive' ? 'Inactive' : 'Active',
        createdBy:     actorUid,
        createdAt:     firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt:     firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        await db.collection(COLLECTION).doc(cleanUid).set(docData);
        return normalizeProfile(cleanUid, docData);
      } catch (err) {
        Logger.error(LAYER, 'Create user profile failed:', err);
        throw err;
      }
    },

    async update(uid, payload) {
      if (!uid) throw new Error('User UID is required.');
      const updateData = {
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (payload.fullName !== undefined)      updateData.fullName      = String(payload.fullName).trim();
      if (payload.contactNumber !== undefined) updateData.contactNumber = String(payload.contactNumber).trim();
      if (payload.position !== undefined)      updateData.position      = String(payload.position).trim();
      if (payload.email !== undefined)         updateData.email         = String(payload.email).trim().toLowerCase();
      if (payload.status !== undefined)        updateData.status        = payload.status === 'Inactive' ? 'Inactive' : 'Active';

      try {
        await db.collection(COLLECTION).doc(uid).update(updateData);
      } catch (err) {
        Logger.error(LAYER, 'Update user profile failed:', err);
        throw err;
      }
    },

    async setStatus(uid, status) {
      const cleanStatus = status === 'Inactive' ? 'Inactive' : 'Active';
      try {
        await db.collection(COLLECTION).doc(uid).update({
          status: cleanStatus,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (err) {
        Logger.error(LAYER, 'Set user status failed:', err);
        throw err;
      }
    },

    async remove(uid) {
      if (!uid) throw new Error('User UID is required.');
      try {
        await db.collection(COLLECTION).doc(uid).delete();
      } catch (err) {
        Logger.error(LAYER, 'Delete user profile failed:', err);
        throw err;
      }
    },

    async touchLastLogin(uid) {
      if (!uid) return;
      try {
        await db.collection(COLLECTION).doc(uid).update({
          lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (err) {
        Logger.warn(LAYER, 'Could not update lastLoginAt:', err);
      }
    }
  };

  window.UserModel = UserModel;
})();

