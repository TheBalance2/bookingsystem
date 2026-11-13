/* ============================================================
   Digital Reservation System — San Isidro College
   Vue.js 3 App: Admin Login (admin.html)
   ============================================================ */

(function () {
  const { createApp } = Vue;
  const log = window.Logger ? window.Logger.create('LoginApp') : console;

  const loginApp = createApp({
    data() {
      return {
        email: '',
        password: '',
        showPassword: false,
        loading: false,
        errorMessage: ''
      };
    },

    mounted() {
      // Redirect if already authenticated
      AuthModel.onChange(user => {
        if (user) {
          window.location.href = 'dashboard.html';
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
        this.errorMessage = '';

        try {
          await AuthModel.login(trimmedEmail, this.password);
          window.location.href = 'dashboard.html';
        } catch (err) {
          log.warn('Admin login failed:', err && err.code ? err.code : err);
          let msg = 'Invalid email or password. Please try again.';
          if (err.code === 'auth/user-not-found') msg = 'No admin account found with this email.';
          if (err.code === 'auth/wrong-password') msg = 'Incorrect password. Please try again.';
          if (err.code === 'auth/too-many-requests') msg = 'Too many failed attempts. Try again later.';
          this.errorMessage = msg;
          this.loading = false;
        }
      }
    }
  });

  loginApp.mount('#loginApp');
})();

