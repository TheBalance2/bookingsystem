/* ============================================================
   Booking Notifications Service — San Isidro College Reservation System
   Service Layer (js/services/notification-service.js)
   Real-time desktop (OS) notifications, Web Audio chime, tab-title
   unread counter, and topbar notification center.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'NotificationService';
  const STORAGE_MUTE_KEY    = 'sic_notif_muted';
  const STORAGE_HISTORY_KEY = 'sic_notif_history_v1';
  const MAX_HISTORY_ITEMS   = 10;

  // ---- Internal State ----
  let initialized       = false;
  let isInitialSnapshot = true;
  const knownStatuses    = new Map(); // docId -> last seen status
  const notifiedEvents   = new Set(); // `${docId}:${status}` deduplication
  const unreadBookingIds = new Set(); // docIds highlighted in table until viewed

  let historyItems     = [];
  let hiddenAlertCount = 0;
  let isMuted          = false;
  let audioCtx         = null;
  let baseTitle        = document.title || 'Admin Dashboard — San Isidro College';

  // ---- DOM References (resolved on init) ----
  let wrapperEl    = null;
  let bellBtn      = null;
  let badgeEl      = null;
  let statusDotEl  = null;
  let dropdownEl   = null;
  let permBannerEl = null;
  let muteBtn      = null;
  let clearBtn     = null;
  let listEl       = null;

  function isNotificationSupported() {
    return typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext !== false;
  }

  function getPermissionState() {
    if (!('Notification' in window)) return 'unsupported';
    if (window.isSecureContext === false) return 'insecure';
    return Notification.permission;
  }

  function getBookingDateLabel(b) {
    if (!b) return '';
    if (b.startDate && b.endDate && b.startDate !== b.endDate) {
      return `${b.startDate} to ${b.endDate}`;
    }
    return b.startDate || b.date || '';
  }

  // ---------- Persistence ----------
  function loadPreferences() {
    try {
      isMuted = localStorage.getItem(STORAGE_MUTE_KEY) === 'true';
    } catch (_) {
      isMuted = false;
    }

    try {
      const raw = sessionStorage.getItem(STORAGE_HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          historyItems = parsed.slice(0, MAX_HISTORY_ITEMS);
          historyItems.forEach(item => {
            if (item && item.unread && item.bookingId) {
              unreadBookingIds.add(item.bookingId);
            }
          });
        }
      }
    } catch (_) {
      historyItems = [];
    }
  }

  function saveHistory() {
    try {
      sessionStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(historyItems.slice(0, MAX_HISTORY_ITEMS)));
    } catch (_) {}
  }

  function setMuted(muted) {
    isMuted = Boolean(muted);
    try {
      localStorage.setItem(STORAGE_MUTE_KEY, isMuted ? 'true' : 'false');
    } catch (_) {}
    renderMuteState();
  }

  // ---------- Web Audio Chime ----------
  function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      audioCtx = new AudioCtx();
    } catch (_) {
      audioCtx = null;
    }
    return audioCtx;
  }

  function unlockAudioOnGesture() {
    const unlock = () => {
      const ctx = ensureAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('click', unlock, { passive: true });
    document.addEventListener('keydown', unlock, { passive: true });
  }

  function playChime() {
    if (isMuted) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const triggerNotes = () => {
      try {
        const now = ctx.currentTime;
        const notes = [
          { freq: 587.33, start: 0,    duration: 0.14 }, // D5
          { freq: 880.00, start: 0.11, duration: 0.24 }  // A5
        ];

        notes.forEach(n => {
          const osc  = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(n.freq, now + n.start);

          gain.gain.setValueAtTime(0.0001, now + n.start);
          gain.gain.exponentialRampToValueAtTime(0.16, now + n.start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.duration);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + n.start);
          osc.stop(now + n.start + n.duration + 0.02);
        });
      } catch (_) {}
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(triggerNotes).catch(() => {});
    } else {
      triggerNotes();
    }
  }

  // ---------- Tab Title Counter ----------
  function updateTitleCounter() {
    if (hiddenAlertCount > 0) {
      document.title = `(${hiddenAlertCount}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
  }

  function resetTitleCounter() {
    if (hiddenAlertCount !== 0) {
      hiddenAlertCount = 0;
      updateTitleCounter();
    }
  }

  // ---------- Permission Request ----------
  async function requestDesktopPermission() {
    const state = getPermissionState();
    if (state !== 'default') {
      renderPermissionState();
      return state;
    }
    try {
      const result = await Notification.requestPermission();
      renderPermissionState();
      if (result === 'granted' && typeof window.showAdminToast === 'function') {
        window.showAdminToast('success', 'Desktop Alerts Enabled', 'You will receive pop-up notifications when new bookings arrive in the background.');
      }
      return result;
    } catch (err) {
      Logger.warn(LAYER, 'Notification permission request failed:', err);
      renderPermissionState();
      return getPermissionState();
    }
  }

  // ---------- UI Rendering ----------
  function getUnreadCount() {
    return historyItems.filter(item => item.unread).length;
  }

  function renderBadge() {
    if (!badgeEl) return;
    const unread = getUnreadCount();
    if (unread > 0) {
      badgeEl.textContent = unread > 99 ? '99+' : String(unread);
      badgeEl.style.display = 'inline-flex';
    } else {
      badgeEl.style.display = 'none';
    }
  }

  function renderMuteState() {
    if (!muteBtn) return;
    muteBtn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
    muteBtn.title = isMuted ? 'Sound muted — click to unmute' : 'Sound on — click to mute';
    muteBtn.innerHTML = isMuted
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg><span>Muted</span>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg><span>Sound On</span>`;
    muteBtn.classList.toggle('muted', isMuted);
  }

  function renderPermissionState() {
    if (!bellBtn) return;
    const perm = getPermissionState();

    bellBtn.classList.remove('perm-default', 'perm-granted', 'perm-denied');
    if (statusDotEl) {
      statusDotEl.className = 'notif-status-dot';
    }

    if (perm === 'granted') {
      bellBtn.classList.add('perm-granted');
      bellBtn.title = 'Booking notifications active';
      if (statusDotEl) statusDotEl.classList.add('active');
      if (permBannerEl) permBannerEl.style.display = 'none';
    } else if (perm === 'default') {
      bellBtn.classList.add('perm-default');
      bellBtn.title = 'Click to enable desktop booking notifications';
      if (statusDotEl) statusDotEl.classList.add('prompt');
      if (permBannerEl) {
        permBannerEl.style.display = 'flex';
        permBannerEl.className = 'notif-perm-banner prompt';
        permBannerEl.innerHTML = `
          <div class="notif-perm-text">
            <strong>Enable desktop pop-ups</strong>
            <span>Get alerted even when this tab is minimized or in the background.</span>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="notifEnablePermBtn">Allow</button>
        `;
        const enableBtn = document.getElementById('notifEnablePermBtn');
        if (enableBtn) {
          enableBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            requestDesktopPermission();
          });
        }
      }
    } else if (perm === 'denied') {
      bellBtn.classList.add('perm-denied');
      bellBtn.title = 'Desktop notifications blocked — allow Notifications in your browser site settings';
      if (statusDotEl) statusDotEl.classList.add('blocked');
      if (permBannerEl) {
        permBannerEl.style.display = 'flex';
        permBannerEl.className = 'notif-perm-banner blocked';
        permBannerEl.innerHTML = `
          <div class="notif-perm-text">
            <strong>Desktop pop-ups are blocked</strong>
            <span>Click the lock / site-settings icon in your browser's address bar and set <em>Notifications</em> to <strong>Allow</strong>.</span>
          </div>
        `;
      }
    } else {
      bellBtn.classList.add('perm-denied');
      const reason = perm === 'insecure'
        ? 'Desktop pop-ups require HTTPS or localhost.'
        : 'Desktop pop-ups are not supported in this browser.';
      bellBtn.title = reason;
      if (statusDotEl) statusDotEl.classList.add('blocked');
      if (permBannerEl) {
        permBannerEl.style.display = 'flex';
        permBannerEl.className = 'notif-perm-banner blocked';
        permBannerEl.innerHTML = `
          <div class="notif-perm-text">
            <strong>Desktop pop-ups unavailable</strong>
            <span>${Utils.escapeHtml(reason)} In-page alerts and sound still work.</span>
          </div>
        `;
      }
    }
  }

  function renderHistoryList() {
    if (!listEl) return;
    if (clearBtn) {
      clearBtn.style.display = historyItems.length > 0 ? 'inline-flex' : 'none';
    }

    if (historyItems.length === 0) {
      listEl.innerHTML = `
        <div class="notif-empty">
          <p>No recent booking alerts</p>
          <span>New bookings and receipt uploads will appear here in real time.</span>
        </div>
      `;
      return;
    }

    listEl.innerHTML = historyItems.map(item => {
      const unreadClass = item.unread ? 'unread' : '';
      const kindBadgeClass = item.kind === 'receipt_uploaded'
        ? 'receipt'
        : item.kind === 'new_external'
          ? 'external'
          : 'internal';

      return `
        <button type="button" class="notif-item ${unreadClass}" data-notif-id="${Utils.escapeHtml(item.id)}" data-booking-id="${Utils.escapeHtml(item.bookingId)}">
          <span class="notif-item-indicator ${kindBadgeClass}"></span>
          <div class="notif-item-content">
            <div class="notif-item-top">
              <span class="notif-item-title">${Utils.escapeHtml(item.title)}</span>
              <span class="notif-item-time">${Utils.escapeHtml(Utils.formatRelativeTime(item.createdAt))}</span>
            </div>
            <p class="notif-item-body">${Utils.escapeHtml(item.body)}</p>
          </div>
        </button>
      `;
    }).join('');
  }

  function openBookingFromAlert(bookingId) {
    if (!bookingId) return;
    markBookingRead(bookingId);
    closeDropdown();

    if (typeof window.switchToBookingsView === 'function') {
      window.switchToBookingsView();
    }
    if (typeof window.viewBookingDetails === 'function') {
      window.viewBookingDetails(bookingId);
    }
  }

  function markBookingRead(bookingId) {
    if (!bookingId) return;
    unreadBookingIds.delete(bookingId);

    let changed = false;
    historyItems.forEach(item => {
      if (item.bookingId === bookingId && item.unread) {
        item.unread = false;
        changed = true;
      }
    });

    if (changed) {
      saveHistory();
      renderBadge();
      renderHistoryList();
    }

    const row = document.querySelector(`tr[data-booking-id="${CSS && CSS.escape ? CSS.escape(bookingId) : bookingId}"]`);
    if (row) row.classList.remove('booking-row-new');
  }

  function markAllRead() {
    unreadBookingIds.clear();
    let changed = false;
    historyItems.forEach(item => {
      if (item.unread) {
        item.unread = false;
        changed = true;
      }
    });
    if (changed) {
      saveHistory();
      renderBadge();
      renderHistoryList();
    }
    document.querySelectorAll('tr.booking-row-new').forEach(r => r.classList.remove('booking-row-new'));
  }

  function clearHistory() {
    historyItems = [];
    unreadBookingIds.clear();
    saveHistory();
    renderBadge();
    renderHistoryList();
    document.querySelectorAll('tr.booking-row-new').forEach(r => r.classList.remove('booking-row-new'));
  }

  function closeDropdown() {
    if (!dropdownEl || !bellBtn) return;
    dropdownEl.classList.remove('open');
    bellBtn.setAttribute('aria-expanded', 'false');
  }

  function toggleDropdown() {
    if (!dropdownEl || !bellBtn) return;
    const willOpen = !dropdownEl.classList.contains('open');
    if (willOpen) {
      renderPermissionState();
      renderHistoryList();
      dropdownEl.classList.add('open');
      bellBtn.setAttribute('aria-expanded', 'true');
    } else {
      closeDropdown();
    }
  }

  // ---------- Notification Dispatch ----------
  function buildNotificationPayload(booking, kind) {
    const requester = Utils.getBookingRequesterName(booking, 'Someone');
    const location  = Utils.getBookingLocation(booking, 'a facility');
    const dateLabel = getBookingDateLabel(booking);
    const ref       = booking.referenceId ? `${booking.referenceId}` : '';
    const datePart  = dateLabel ? ` for ${dateLabel}` : '';

    if (kind === 'receipt_uploaded') {
      return {
        title: ref ? `Receipt Uploaded • ${ref}` : 'Payment Receipt Uploaded',
        body: `${requester} uploaded a payment receipt for ${location}${datePart}. Ready for review.`,
        toastType: 'warning'
      };
    }

    if (kind === 'new_external') {
      return {
        title: ref ? `New External Booking • ${ref}` : 'New External Booking',
        body: `${requester} requested ${location}${datePart} (Pending Payment).`,
        toastType: 'info'
      };
    }

    return {
      title: ref ? `New Internal Booking • ${ref}` : 'New Internal Booking',
      body: `${requester} booked ${location}${datePart} (Pending Approval).`,
      toastType: 'info'
    };
  }

  function showDesktopNotification(booking, title, body) {
    if (!isNotificationSupported() || Notification.permission !== 'granted') {
      return false;
    }

    try {
      const notif = new Notification(title, {
        body: body,
        icon: 'images/logo.jpg',
        badge: 'images/logo.jpg',
        tag: booking.id || `sic-booking-${Date.now()}`,
        renotify: true
      });

      notif.onclick = function (e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        try { window.focus(); } catch (_) {}
        try { notif.close(); } catch (_) {}
        openBookingFromAlert(booking.id);
      };

      return true;
    } catch (err) {
      Logger.warn(LAYER, 'Could not display desktop notification:', err);
      return false;
    }
  }

  function notify(booking, kind) {
    if (!booking || !booking.id) return;

    const payload = buildNotificationPayload(booking, kind);

    unreadBookingIds.add(booking.id);
    historyItems.unshift({
      id: `${booking.id}-${Date.now()}`,
      bookingId: booking.id,
      refId: booking.referenceId || '',
      kind: kind,
      title: payload.title,
      body: payload.body,
      createdAt: Date.now(),
      unread: true
    });
    if (historyItems.length > MAX_HISTORY_ITEMS) {
      historyItems = historyItems.slice(0, MAX_HISTORY_ITEMS);
    }
    saveHistory();
    renderBadge();
    if (dropdownEl && dropdownEl.classList.contains('open')) {
      renderHistoryList();
    }

    playChime();

    const isHidden     = Boolean(document.hidden);
    const isUnfocused  = typeof document.hasFocus === 'function' ? !document.hasFocus() : isHidden;
    const inBackground = isHidden || isUnfocused;

    if (inBackground) {
      hiddenAlertCount += 1;
      updateTitleCounter();

      const shownDesktop = showDesktopNotification(booking, payload.title, payload.body);

      if (!isHidden || !shownDesktop) {
        if (typeof window.showAdminToast === 'function') {
          window.showAdminToast(payload.toastType, payload.title, payload.body, () => {
            openBookingFromAlert(booking.id);
          });
        }
      }
    } else {
      if (typeof window.showAdminToast === 'function') {
        window.showAdminToast(payload.toastType, payload.title, payload.body, () => {
          openBookingFromAlert(booking.id);
        });
      }
    }
  }

  // ---------- Firestore Snapshot Diffing ----------
  function processSnapshot(snapshot) {
    if (!snapshot) return;

    if (isInitialSnapshot) {
      snapshot.docs.forEach(doc => {
        const data = doc.data() || {};
        const status = data.status || '';
        knownStatuses.set(doc.id, status);
        if (status) {
          notifiedEvents.add(`${doc.id}:${status}`);
        }
      });
      isInitialSnapshot = false;
      return;
    }

    const changes = typeof snapshot.docChanges === 'function' ? snapshot.docChanges() : [];

    changes.forEach(change => {
      const docId = change.doc.id;
      const data  = change.doc.data() || {};
      const newStatus = data.status || '';

      if (change.type === 'removed') {
        knownStatuses.delete(docId);
        return;
      }

      const prevStatus = knownStatuses.get(docId);
      knownStatuses.set(docId, newStatus);

      let triggerKind = null;

      if (change.type === 'added' && prevStatus === undefined) {
        if (newStatus === 'Pending') {
          triggerKind = 'new_internal';
        } else if (newStatus === 'Pending Payment') {
          triggerKind = 'new_external';
        } else if (newStatus === 'Payment Under Review') {
          triggerKind = 'receipt_uploaded';
        }
      } else if (change.type === 'modified' || prevStatus !== undefined) {
        if (prevStatus !== 'Payment Under Review' && newStatus === 'Payment Under Review') {
          triggerKind = 'receipt_uploaded';
        }
      }

      if (triggerKind) {
        const eventKey = `${docId}:${newStatus}`;
        if (!notifiedEvents.has(eventKey)) {
          notifiedEvents.add(eventKey);
          notify({ id: docId, ...data }, triggerKind);
        }
      }
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;

    baseTitle = document.title || baseTitle;
    loadPreferences();
    unlockAudioOnGesture();

    wrapperEl    = document.getElementById('notifWrapper');
    bellBtn      = document.getElementById('notifBellBtn');
    badgeEl      = document.getElementById('notifBadge');
    statusDotEl  = document.getElementById('notifStatusDot');
    dropdownEl   = document.getElementById('notifDropdown');
    permBannerEl = document.getElementById('notifPermBanner');
    muteBtn      = document.getElementById('notifMuteBtn');
    clearBtn     = document.getElementById('notifClearBtn');
    listEl       = document.getElementById('notifList');

    renderPermissionState();
    renderMuteState();
    renderBadge();
    renderHistoryList();

    if (bellBtn) {
      bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (getPermissionState() === 'default') {
          requestDesktopPermission();
        }
        toggleDropdown();
      });
    }

    if (muteBtn) {
      muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setMuted(!isMuted);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearHistory();
      });
    }

    if (listEl) {
      listEl.addEventListener('click', (e) => {
        const itemBtn = e.target.closest('.notif-item');
        if (!itemBtn) return;
        const bookingId = itemBtn.getAttribute('data-booking-id');
        if (bookingId) {
          openBookingFromAlert(bookingId);
        }
      });
    }

    document.addEventListener('click', (e) => {
      if (wrapperEl && !wrapperEl.contains(e.target)) {
        closeDropdown();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDropdown();
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        resetTitleCounter();
        renderPermissionState();
      }
    });

    window.addEventListener('focus', () => {
      resetTitleCounter();
    });
  }

  window.BookingNotifier = {
    init,
    processSnapshot,
    notify,
    isUnreadBooking: (docId) => unreadBookingIds.has(docId),
    markBookingRead,
    markAllRead
  };
})();

