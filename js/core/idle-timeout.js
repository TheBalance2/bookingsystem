/* ============================================================
   Idle Session Timeout Guard — San Isidro College Reservation System
   Core Layer (js/core/idle-timeout.js)
   Automatically signs out Admin / Facility-In-Charge portal sessions
   after 30 minutes of inactivity, showing a 2-minute warning modal
   and synchronizing activity across open browser tabs.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'IdleTimeout';
  const STORAGE_KEY        = 'sic_portal_last_activity_ms';
  const IDLE_LIMIT_MS      = 30 * 60 * 1000; // 30 minutes
  const WARNING_BEFORE_MS  =  2 * 60 * 1000; // Warn at 28 minutes (2 minutes remaining)
  const CHECK_INTERVAL_MS  = 5000;           // Check every 5 seconds
  const THROTTLE_WRITE_MS  = 4000;

  let lastActivityMs  = Date.now();
  let lastWriteMs     = 0;
  let checkTimer      = null;
  let countdownTimer  = null;
  let warningVisible  = false;
  let loggingOut      = false;

  function recordActivity() {
    if (loggingOut || warningVisible) return;
    const now = Date.now();
    lastActivityMs = now;
    if (now - lastWriteMs >= THROTTLE_WRITE_MS) {
      lastWriteMs = now;
      try {
        localStorage.setItem(STORAGE_KEY, String(now));
      } catch (_) { /* storage unavailable */ }
    }
  }

  function hideWarningModal() {
    warningVisible = false;
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    const modal = document.getElementById('idleWarningModal');
    if (modal) modal.classList.remove('visible');
  }

  function updateCountdownDisplay() {
    const countdownEl = document.getElementById('idleCountdownText');
    if (!countdownEl) return;
    const remainingMs = Math.max(0, IDLE_LIMIT_MS - (Date.now() - lastActivityMs));
    const totalSec = Math.ceil(remainingMs / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = String(totalSec % 60).padStart(2, '0');
    countdownEl.textContent = `${mins}:${secs}`;
  }

  function showWarningModal() {
    if (warningVisible || loggingOut) return;
    const modal = document.getElementById('idleWarningModal');
    if (!modal) return;

    warningVisible = true;
    updateCountdownDisplay();
    modal.classList.add('visible');

    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      updateCountdownDisplay();
      if (Date.now() - lastActivityMs >= IDLE_LIMIT_MS) {
        triggerIdleLogout();
      }
    }, 1000);
  }

  async function triggerIdleLogout() {
    if (loggingOut) return;
    loggingOut = true;
    hideWarningModal();
    if (checkTimer) {
      clearInterval(checkTimer);
      checkTimer = null;
    }

    try {
      if (window.ActivityLogModel && window.Session && Session.profile) {
        await ActivityLogModel.log('AUTH_LOGOUT', 'Auth', {
          targetId:    Session.profile.uid,
          targetLabel: Session.profile.email,
          details:     { role: Session.profile.role, fullName: Session.profile.fullName, reason: 'idle_timeout' }
        });
      }
      if (window.Session) Session.clear();
      if (window.AuthModel) await AuthModel.logout();
    } catch (err) {
      Logger.warn(LAYER, 'Idle logout cleanup error:', err);
    } finally {
      window.location.href = 'admin.html?reason=idle';
    }
  }

  function evaluateIdleState() {
    if (loggingOut) return;
    if (typeof auth === 'undefined' || !auth || !auth.currentUser) return;

    try {
      const sharedMs = Number(localStorage.getItem(STORAGE_KEY) || 0);
      if (sharedMs > lastActivityMs) {
        lastActivityMs = sharedMs;
        if (warningVisible && Date.now() - lastActivityMs < IDLE_LIMIT_MS - WARNING_BEFORE_MS) {
          hideWarningModal();
        }
      }
    } catch (_) { /* ignore */ }

    const elapsed = Date.now() - lastActivityMs;
    if (elapsed >= IDLE_LIMIT_MS) {
      triggerIdleLogout();
    } else if (elapsed >= IDLE_LIMIT_MS - WARNING_BEFORE_MS) {
      showWarningModal();
    }
  }

  function init() {
    lastActivityMs = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, String(lastActivityMs));
    } catch (_) {}

    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(evt => {
      window.addEventListener(evt, recordActivity, { passive: true });
    });

    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const ts = Number(e.newValue);
        if (Number.isFinite(ts) && ts > lastActivityMs) {
          lastActivityMs = ts;
          if (warningVisible && Date.now() - lastActivityMs < IDLE_LIMIT_MS - WARNING_BEFORE_MS) {
            hideWarningModal();
          }
        }
      }
    });

    const stayBtn   = document.getElementById('idleStaySignedInBtn');
    const logoutBtn = document.getElementById('idleLogoutNowBtn');

    if (stayBtn) {
      stayBtn.addEventListener('click', () => {
        hideWarningModal();
        lastActivityMs = Date.now();
        try {
          localStorage.setItem(STORAGE_KEY, String(lastActivityMs));
        } catch (_) {}
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        triggerIdleLogout();
      });
    }

    if (checkTimer) clearInterval(checkTimer);
    checkTimer = setInterval(evaluateIdleState, CHECK_INTERVAL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.IdleTimeout = {
    reset: () => {
      hideWarningModal();
      recordActivity();
    }
  };
})();

