/* ============================================================
   Session State & Role Helpers — San Isidro College Reservation System
   Core Layer (js/core/session.js)
   Holds the currently authenticated staff user's Firestore profile
   (role: 'admin' | 'facility_incharge') and provides role guards.
   ============================================================ */

(function () {
  'use strict';

  const Session = {
    profile: null,

    set(profile) {
      this.profile = profile ? { ...profile } : null;
      if (typeof document !== 'undefined' && document.body) {
        const isAdmin = Boolean(this.profile && this.profile.role === 'admin');
        const isFic   = Boolean(this.profile && this.profile.role === 'facility_incharge');
        document.body.classList.toggle('role-admin', isAdmin);
        document.body.classList.toggle('role-fic', isFic);
      }
    },

    clear() {
      this.profile = null;
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('role-admin', 'role-fic');
      }
    },

    isAdmin() {
      return Boolean(this.profile && this.profile.role === 'admin' && this.profile.status === 'Active');
    },

    isFacilityInCharge() {
      return Boolean(this.profile && this.profile.role === 'facility_incharge' && this.profile.status === 'Active');
    },

    getRoleLabel(role) {
      const r = role || (this.profile ? this.profile.role : '');
      if (r === 'admin') return 'Administrator';
      if (r === 'facility_incharge') return 'Facility-In-Charge';
      return 'Staff';
    },

    requireFic(actionLabel = 'perform this action') {
      if (!this.isFacilityInCharge()) {
        if (window.UiView && typeof UiView.showToast === 'function') {
          UiView.showToast('error', 'Permission Denied', `Only the Facility-In-Charge can ${actionLabel}.`);
        } else {
          alert(`Only the Facility-In-Charge can ${actionLabel}.`);
        }
        return false;
      }
      return true;
    },

    requireAdmin(actionLabel = 'perform this action') {
      if (!this.isAdmin()) {
        if (window.UiView && typeof UiView.showToast === 'function') {
          UiView.showToast('error', 'Permission Denied', `Only the True Administrator can ${actionLabel}.`);
        } else {
          alert(`Only the True Administrator can ${actionLabel}.`);
        }
        return false;
      }
      return true;
    }
  };

  window.Session = Session;
})();

