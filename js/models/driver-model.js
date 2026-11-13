/* ============================================================
   Driver Model — San Isidro College Reservation System
   Model Layer (js/models/driver-model.js)
   Handles all Firestore operations for 'drivers'.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'DriverModel';

  const DEFAULT_DRIVERS = [
    { name: 'Juan Dela Cruz', phone: '09171234567', status: 'Active', order: 0 },
    { name: 'Pedro Penduko',  phone: '09189876543', status: 'Active', order: 1 }
  ];

  const DriverModel = {
    DEFAULT_DRIVERS,

    listenAll(onUpdate, onError) {
      return db.collection('drivers')
        .orderBy('order', 'asc')
        .onSnapshot(async snapshot => {
          if (snapshot.empty) {
            Logger.info(LAYER, 'Seeding default drivers...');
            try {
              const batch = db.batch();
              DEFAULT_DRIVERS.forEach(d => {
                const ref = db.collection('drivers').doc();
                batch.set(ref, { ...d, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
              });
              await batch.commit();
              return;
            } catch (seedErr) {
              Logger.warn(LAYER, 'Could not seed default drivers:', seedErr);
            }
          }

          const drivers = [];
          snapshot.forEach(doc => {
            drivers.push({ id: doc.id, ...doc.data() });
          });
          if (typeof onUpdate === 'function') onUpdate(drivers, snapshot);
        }, err => {
          Logger.error(LAYER, 'Drivers listener error:', err);
          if (typeof onError === 'function') onError(err);
        });
    },

    async getAll() {
      try {
        const snapshot = await db.collection('drivers').orderBy('order', 'asc').get();
        const list = [];
        snapshot.forEach(doc => {
          list.push({ id: doc.id, ...doc.data() });
        });
        return list;
      } catch (err) {
        Logger.warn(LAYER, 'Could not fetch drivers:', err);
        throw err;
      }
    },

    async getActive() {
      const all = await this.getAll();
      return all.filter(d => d.status === 'Active' && d.name);
    },

    async save(editingId, payload, nextOrder = 0) {
      try {
        const data = {
          name:      payload.name,
          phone:     payload.phone,
          status:    payload.status || 'Active',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (editingId) {
          await db.collection('drivers').doc(editingId).update(data);
          return editingId;
        } else {
          data.order = nextOrder;
          data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          const docRef = await db.collection('drivers').add(data);
          return docRef.id;
        }
      } catch (err) {
        Logger.error(LAYER, 'Driver save error:', err);
        throw err;
      }
    },

    async remove(driverId) {
      try {
        await db.collection('drivers').doc(driverId).delete();
      } catch (err) {
        Logger.error(LAYER, 'Driver delete error:', err);
        throw err;
      }
    }
  };

  window.DriverModel = DriverModel;
})();

