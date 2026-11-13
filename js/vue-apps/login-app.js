/* ============================================================
   Digital Reservation System — San Isidro College
   Vue.js 3 App: Admin & Facility-In-Charge Login (admin.html)
   ============================================================ */

(function () {
  const { createApp } = Vue;
  const log = window.Logger ? window.Logger.create('LoginApp') : console;

  function getReasonMessage(reason) {
    if (reason === 'unregistered') {
      return 'This account is not registered in the system. Please contact the Administrator.';
    }
    if (reason === 'inactive') {
      return 'Your account has been deactivated. Please contact the Administrator.';
    }
    if (reason === 'revoked') {
      return 'Your account access was revoked or deactivated by the Administrator.';
    }
    return '';
  }

  const loginApp = createApp({
    data() {
      return {
        email: '',
        password: '',
        showPassword: false,
        loading: false,
        signingIn: false,
        errorMessage: ''
      };
    },

    mounted() {
      const params = new URLSearchParams(window.location.search);
      const reasonMsg = getReasonMessage(params.get('reason'));
      if (reasonMsg) {
        this.errorMessage = reasonMsg;
      }

      // If already authenticated, verify role profile before redirecting
      AuthModel.onChange(async (user) => {
        if (!user || this.signingIn) return;
        try {
          const profile = await UserModel.getProfile(user.uid);
          if (!profile) {
            await AuthModel.logout();
            this.errorMessage = getReasonMessage('unregistered');
            return;
          }
          if (profile.status !== 'Active') {
            await AuthModel.logout();
            this.errorMessage = getReasonMessage('inactive');
            return;
          }
          window.location.href = 'dashboard.html';
        } catch (err) {
          log.warn('Session profile check failed:', err);
        }
      });
    },

    methods: {
      async login() {
        const trimmedEmail = this.email.trim();
        if (!trimmedEmail || !this.password) {
          this.errorMessage = 'Please fill in all fields.';
          return;
        }

        this.loading = true;
        this.signingIn = true;
        this.errorMessage = '';

        try {
          const cred = await AuthModel.login(trimmedEmail, this.password);
          const uid = cred && cred.user ? cred.user.uid : (auth && auth.currentUser ? auth.currentUser.uid : '');

          const profile = await UserModel.getProfile(uid);
          if (!profile) {
            await AuthModel.logout();
            this.errorMessage = getReasonMessage('unregistered');
            this.loading = false;
            this.signingIn = false;
            return;
          }

          if (profile.status !== 'Active') {
            await AuthModel.logout();
            this.errorMessage = getReasonMessage('inactive');
            this.loading = false;
            this.signingIn = false;
            return;
          }

          if (window.Session) Session.set(profile);
          await UserModel.touchLastLogin(uid);

          if (window.ActivityLogModel) {
            await ActivityLogModel.log('AUTH_LOGIN', 'Auth', {
              actorOverride: profile,
              targetId:      uid,
              targetLabel:   profile.email,
              details:       { role: profile.role, fullName: profile.fullName }
            });
          }

          window.location.href = 'dashboard.html';
        } catch (err) {
          log.warn('Admin login failed:', err && err.code ? err.code : err);
          let msg = 'Invalid email or password. Please try again.';
          if (err.code === 'auth/user-not-found') msg = 'No account found with this email.';
          if (err.code === 'auth/wrong-password') msg = 'Incorrect password. Please try again.';
          if (err.code === 'auth/too-many-requests') msg = 'Too many failed attempts. Try again later.';
          if (err.code === 'permission-denied') {
            msg = 'Database rules blocked profile lookup. Please publish the updated firestore.rules.';
          }
          this.errorMessage = msg;
          this.loading = false;
          this.signingIn = false;
        }
      }
    }
  });

  loginApp.mount('#loginApp');
})();
