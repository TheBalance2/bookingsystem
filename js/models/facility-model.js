/* ============================================================
   Facility Model — San Isidro College Reservation System
   Model Layer (js/models/facility-model.js)
   Handles all Firestore operations for 'facilities' and 'facility_images'.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'FacilityModel';

  const DEFAULT_FACILITIES = [
    { name: 'Gymnasium',               description: 'Full-size indoor court for sports events, P.E. classes, and large gatherings. Seats up to 500.', capacity: '500 seats', status: 'Active', visibility: 'both', order: 0 },
    { name: 'Chapel',                  description: 'Air-conditioned chapel with professional sound system. Seats 100.',                              capacity: '100 seats', status: 'Active', visibility: 'both', order: 1 },
    { name: 'Guest House/College H.E', description: 'Versatile space ideal for seminars, workshops, and medium-sized events. Capacity: 30.',           capacity: '30',        status: 'Active', visibility: 'both', order: 2 },
    { name: 'Field/Oval',              description: 'Outdoor open field for sports, training, and institutional events.',                               capacity: '—',         status: 'Active', visibility: 'both', order: 3 },
    { name: 'Conference Room',         description: 'Professional meeting room with video conferencing equipment. Seats up to 40.',                    capacity: '40 seats',  status: 'Active', visibility: 'both', order: 4 },
    { name: 'Classroom',               description: 'Standard academic classrooms available for classes, review sessions, and group activities.',       capacity: '40 seats',  status: 'Active', visibility: 'both', order: 5 }
  ];

  const CLASSROOM_SEED_KEY = 'sic_classroom_facility_seeded_v1';

  const FacilityModel = {
    DEFAULT_FACILITIES,

    listenAll(onUpdate, onError) {
      return db.collection('facilities')
        .orderBy('order', 'asc')
        .onSnapshot(async snapshot => {
          if (snapshot.empty) {
            Logger.info(LAYER, 'Seeding default facilities...');
            try {
              const batch = db.batch();
              DEFAULT_FACILITIES.forEach(f => {
                const ref = db.collection('facilities').doc();
                batch.set(ref, { ...f, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
              });
              await batch.commit();
              try { localStorage.setItem(CLASSROOM_SEED_KEY, '1'); } catch (_) {}
              return;
            } catch (seedErr) {
              Logger.warn(LAYER, 'Could not seed default facilities:', seedErr);
            }
          }

          const facilities = [];
          snapshot.forEach(doc => {
            facilities.push({ id: doc.id, ...doc.data() });
          });

          const hasClassroom = facilities.some(f => Utils.isClassroomFacilityName(f.name));
          let alreadySeeded = false;
          try { alreadySeeded = Boolean(localStorage.getItem(CLASSROOM_SEED_KEY)); } catch (_) {}

          if (!hasClassroom && !alreadySeeded) {
            try {
              localStorage.setItem(CLASSROOM_SEED_KEY, '1');
              await db.collection('facilities').add({
                name:        'Classroom',
                description: 'Standard academic classrooms available for classes, review sessions, and group activities.',
                capacity:    '40 seats',
                status:      'Active',
                visibility:  'both',
                amenities:   [],
                order:       facilities.length,
                createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
              });
              return;
            } catch (seedClassroomErr) {
              Logger.warn(LAYER, 'Could not auto-seed Classroom facility:', seedClassroomErr);
            }
          }

          if (typeof onUpdate === 'function') onUpdate(facilities, snapshot);
        }, err => {
          Logger.error(LAYER, 'Facilities listener error:', err);
          if (typeof onError === 'function') onError(err);
        });
    },

    async getAll() {
      try {
        const snapshot = await db.collection('facilities').orderBy('order', 'asc').get();
        const list = [];
        snapshot.forEach(doc => {
          list.push({ id: doc.id, ...doc.data() });
        });
        const hasClassroom = list.some(f => Utils.isClassroomFacilityName(f.name));
        let alreadySeeded = false;
        try { alreadySeeded = Boolean(localStorage.getItem(CLASSROOM_SEED_KEY)); } catch (_) {}
        if (!hasClassroom && !alreadySeeded) {
          list.push({
            id:          'classroom_default',
            name:        'Classroom',
            description: 'Standard academic classrooms available for classes, review sessions, and group activities.',
            capacity:    '40 seats',
            status:      'Active',
            visibility:  'both',
            amenities:   [],
            order:       list.length
          });
        }
        return list;
      } catch (err) {
        Logger.warn(LAYER, 'Could not fetch facilities:', err);
        throw err;
      }
    },

    async getActive() {
      const all = await this.getAll();
      return all.filter(f => f.status === 'Active');
    },

    async getImages(facilityId, fallbackImages = []) {
      try {
        const imgDoc = await db.collection('facility_images').doc(facilityId).get();
        if (imgDoc.exists) {
          return [...(imgDoc.data().images || [])];
        }
        return [...(fallbackImages || [])];
      } catch (err) {
        Logger.warn(LAYER, 'Could not load facility images:', err);
        return [...(fallbackImages || [])];
      }
    },

    async save(editingId, payload, images = [], nextOrder = 0) {
      try {
        const data = {
          name:        payload.name,
          description: payload.description,
          capacity:    payload.capacity,
          status:      payload.status,
          visibility:  Utils.normalizeFacilityVisibility(payload.visibility),
          amenities:   [...(payload.amenities || [])],
          thumbnail:   images.length > 0 ? images[0] : null,
          updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
        };

        if (editingId) {
          await db.collection('facilities').doc(editingId).update(data);
          await db.collection('facility_images').doc(editingId).set({
            images: [...images]
          });
          return editingId;
        } else {
          data.order = nextOrder;
          data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          const docRef = await db.collection('facilities').add(data);
          await db.collection('facility_images').doc(docRef.id).set({
            images: [...images]
          });
          return docRef.id;
        }
      } catch (err) {
        Logger.error(LAYER, 'Facility save error:', err);
        throw err;
      }
    },

    async remove(facilityId) {
      try {
        await db.collection('facilities').doc(facilityId).delete();
      } catch (err) {
        Logger.error(LAYER, 'Facility delete error:', err);
        throw err;
      }
    }
  };

  window.FacilityModel = FacilityModel;
})();

