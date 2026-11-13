/* ============================================================
   Vehicle Model — San Isidro College Reservation System
   Model Layer (js/models/vehicle-model.js)
   Handles all Firestore operations for 'vehicles'.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'VehicleModel';

  const DEFAULT_VEHICLES = [
    { name: 'Toyota Grandia Van', description: 'Air-conditioned passenger van. Great for small groups.', capacity: '15 seats', status: 'Active', order: 0 },
    { name: 'KIA Utility Van',     description: 'Utility van for small group trips and transport needs.', capacity: '15 seats', status: 'Active', order: 1 }
  ];

  const VehicleModel = {
    DEFAULT_VEHICLES,

    listenAll(onUpdate, onError) {
      return db.collection('vehicles')
        .orderBy('order', 'asc')
        .onSnapshot(async snapshot => {
          if (snapshot.empty) {
            Logger.info(LAYER, 'Seeding default vehicles...');
            try {
              const batch = db.batch();
              DEFAULT_VEHICLES.forEach(v => {
                const ref = db.collection('vehicles').doc();
                batch.set(ref, { ...v, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
              });
              await batch.commit();
              return;
            } catch (seedErr) {
              Logger.warn(LAYER, 'Could not seed default vehicles:', seedErr);
            }
          }

          const vehicles = [];
          snapshot.forEach(doc => {
            vehicles.push({ id: doc.id, ...doc.data() });
          });
          if (typeof onUpdate === 'function') onUpdate(vehicles, snapshot);
        }, err => {
          Logger.error(LAYER, 'Vehicles listener error:', err);
          if (typeof onError === 'function') onError(err);
        });
    },

    async getAll() {
      try {
        const snapshot = await db.collection('vehicles').orderBy('order', 'asc').get();
        const list = [];
        snapshot.forEach(doc => {
          list.push({ id: doc.id, ...doc.data() });
        });
        return list;
      } catch (err) {
        Logger.warn(LAYER, 'Could not fetch vehicles:', err);
        throw err;
      }
    },

    async getActive() {
      const all = await this.getAll();
      return all.filter(v => v.status === 'Active' && v.name);
    },

    async save(editingId, payload, nextOrder = 0) {
      try {
        const data = {
          name:        payload.name,
          description: payload.description,
          capacity:    payload.capacity,
          status:      payload.status,
          updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
        };

        if (editingId) {
          await db.collection('vehicles').doc(editingId).update(data);
          return editingId;
        } else {
          data.order = nextOrder;
          data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          const docRef = await db.collection('vehicles').add(data);
          return docRef.id;
        }
      } catch (err) {
        Logger.error(LAYER, 'Vehicle save error:', err);
        throw err;
      }
    },

    async remove(vehicleId) {
      try {
        await db.collection('vehicles').doc(vehicleId).delete();
      } catch (err) {
        Logger.error(LAYER, 'Vehicle delete error:', err);
        throw err;
      }
    }
  };

  window.VehicleModel = VehicleModel;
})();

