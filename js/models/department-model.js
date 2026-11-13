/* ============================================================
   Department Model — San Isidro College Reservation System
   Model Layer (js/models/department-model.js)
   Handles all Firestore operations for 'departments' (Internal
   Schools & Offices under College, IBED, Non-teaching Personnel,
   and Administration, including their Dean / Principal / Office Head).
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'DepartmentModel';
  const SEED_KEY = 'sic_departments_seeded_v1';

  const CATEGORIES = [
    'College',
    'IBED',
    'Non-teaching Personnel',
    'Administration'
  ];

  // Pre-seed only the 9 College schools; IBED, Non-teaching Personnel,
  // and Administration are added manually by the admin in Manage Departments.
  const DEFAULT_DEPARTMENTS = [
    { category: 'College', name: 'School of Education',               headName: '', status: 'Active', order: 0 },
    { category: 'College', name: 'School of Business Administration', headName: '', status: 'Active', order: 1 },
    { category: 'College', name: 'School of Office Administration',   headName: '', status: 'Active', order: 2 },
    { category: 'College', name: 'School of Information Technology',  headName: '', status: 'Active', order: 3 },
    { category: 'College', name: 'School of Accountancy',             headName: '', status: 'Active', order: 4 },
    { category: 'College', name: 'School of Nursing',                 headName: '', status: 'Active', order: 5 },
    { category: 'College', name: 'School of Midwifery',               headName: '', status: 'Active', order: 6 },
    { category: 'College', name: 'School of Arts & Sciences',         headName: '', status: 'Active', order: 7 },
    { category: 'College', name: 'School of Engineering',             headName: '', status: 'Active', order: 8 }
  ];

  const DepartmentModel = {
    CATEGORIES,
    DEFAULT_DEPARTMENTS,

    listenAll(onUpdate, onError) {
      return db.collection('departments')
        .orderBy('order', 'asc')
        .onSnapshot(async snapshot => {
          let alreadySeeded = false;
          try {
            alreadySeeded = localStorage.getItem(SEED_KEY) === '1';
          } catch (_) {}

          if (snapshot.empty && !alreadySeeded) {
            Logger.info(LAYER, 'Seeding default College schools in departments...');
            try {
              const batch = db.batch();
              DEFAULT_DEPARTMENTS.forEach(d => {
                const ref = db.collection('departments').doc();
                batch.set(ref, { ...d, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
              });
              await batch.commit();
              try { localStorage.setItem(SEED_KEY, '1'); } catch (_) {}
              return;
            } catch (seedErr) {
              Logger.warn(LAYER, 'Could not seed default departments:', seedErr);
            }
          } else if (!snapshot.empty && !alreadySeeded) {
            try { localStorage.setItem(SEED_KEY, '1'); } catch (_) {}
          }

          const departments = [];
          snapshot.forEach(doc => {
            departments.push({ id: doc.id, ...doc.data() });
          });
          if (typeof onUpdate === 'function') onUpdate(departments, snapshot);
        }, err => {
          Logger.error(LAYER, 'Departments listener error:', err);
          if (typeof onError === 'function') onError(err);
        });
    },

    async getAll() {
      try {
        const snapshot = await db.collection('departments').orderBy('order', 'asc').get();
        const list = [];
        snapshot.forEach(doc => {
          list.push({ id: doc.id, ...doc.data() });
        });
        if (list.length === 0) {
          let alreadySeeded = false;
          try { alreadySeeded = localStorage.getItem(SEED_KEY) === '1'; } catch (_) {}
          if (!alreadySeeded) {
            return DEFAULT_DEPARTMENTS.map((d, idx) => ({ id: `default_dept_${idx}`, ...d }));
          }
        }
        return list;
      } catch (err) {
        Logger.warn(LAYER, 'Could not fetch departments:', err);
        return DEFAULT_DEPARTMENTS.map((d, idx) => ({ id: `default_dept_${idx}`, ...d }));
      }
    },

    async getActive() {
      const all = await this.getAll();
      return all.filter(d => d.status === 'Active' && d.name);
    },

    async getActiveByCategory(category) {
      const active = await this.getActive();
      if (!category) return active;
      return active.filter(d => d.category === category);
    },

    async save(editingId, payload, nextOrder = 0) {
      try {
        const data = {
          category:  payload.category || 'College',
          name:      String(payload.name || '').trim(),
          headName:  String(payload.headName || '').trim(),
          status:    payload.status || 'Active',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (editingId) {
          await db.collection('departments').doc(editingId).update(data);
          return editingId;
        } else {
          data.order = nextOrder;
          data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          const docRef = await db.collection('departments').add(data);
          try { localStorage.setItem(SEED_KEY, '1'); } catch (_) {}
          return docRef.id;
        }
      } catch (err) {
        Logger.error(LAYER, 'Department save error:', err);
        throw err;
      }
    },

    async remove(deptId) {
      try {
        await db.collection('departments').doc(deptId).delete();
      } catch (err) {
        Logger.error(LAYER, 'Department delete error:', err);
        throw err;
      }
    }
  };

  window.DepartmentModel = DepartmentModel;
})();
