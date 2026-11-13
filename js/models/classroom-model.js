/* ============================================================
   Classroom Model — San Isidro College Reservation System
   Model Layer (js/models/classroom-model.js)
   Handles all Firestore operations for 'classrooms'.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'ClassroomModel';

  const DEFAULT_CLASSROOMS = [
    { name: 'Room 101', capacity: '40 seats', status: 'Active', order: 0 },
    { name: 'Room 102', capacity: '40 seats', status: 'Active', order: 1 },
    { name: 'Room 201', capacity: '50 seats', status: 'Active', order: 2 }
  ];

  const ClassroomModel = {
    DEFAULT_CLASSROOMS,

    listenAll(onUpdate, onError) {
      return db.collection('classrooms')
        .orderBy('order', 'asc')
        .onSnapshot(async snapshot => {
          if (snapshot.empty) {
            Logger.info(LAYER, 'Seeding default classrooms...');
            try {
              const batch = db.batch();
              DEFAULT_CLASSROOMS.forEach(c => {
                const ref = db.collection('classrooms').doc();
                batch.set(ref, { ...c, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
              });
              await batch.commit();
              return;
            } catch (seedErr) {
              Logger.warn(LAYER, 'Could not seed default classrooms:', seedErr);
            }
          }

          const classrooms = [];
          snapshot.forEach(doc => {
            classrooms.push({ id: doc.id, ...doc.data() });
          });
          if (typeof onUpdate === 'function') onUpdate(classrooms, snapshot);
        }, err => {
          Logger.error(LAYER, 'Classrooms listener error:', err);
          if (typeof onError === 'function') onError(err);
        });
    },

    async getAll() {
      try {
        const snapshot = await db.collection('classrooms').orderBy('order', 'asc').get();
        const list = [];
        snapshot.forEach(doc => {
          list.push({ id: doc.id, ...doc.data() });
        });
        if (list.length === 0) {
          return DEFAULT_CLASSROOMS.map((c, idx) => ({ id: `default_${idx}`, ...c }));
        }
        return list;
      } catch (err) {
        Logger.warn(LAYER, 'Could not fetch classrooms:', err);
        return DEFAULT_CLASSROOMS.map((c, idx) => ({ id: `default_${idx}`, ...c }));
      }
    },

    async getActive() {
      const all = await this.getAll();
      return all.filter(c => c.status === 'Active' && c.name);
    },

    async save(editingId, payload, nextOrder = 0) {
      try {
        const data = {
          name:      payload.name,
          capacity:  payload.capacity || '',
          status:    payload.status || 'Active',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (editingId) {
          await db.collection('classrooms').doc(editingId).update(data);
          return editingId;
        } else {
          data.order = nextOrder;
          data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          const docRef = await db.collection('classrooms').add(data);
          return docRef.id;
        }
      } catch (err) {
        Logger.error(LAYER, 'Classroom save error:', err);
        throw err;
      }
    },

    async remove(classroomId) {
      try {
        await db.collection('classrooms').doc(classroomId).delete();
      } catch (err) {
        Logger.error(LAYER, 'Classroom delete error:', err);
        throw err;
      }
    }
  };

  window.ClassroomModel = ClassroomModel;
})();

