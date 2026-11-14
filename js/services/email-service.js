/* ============================================================
   Email Service — San Isidro College Reservation System
   Service Layer (js/services/email-service.js)
   Centralizes EmailJS initialization and email dispatch for
   submission confirmations, approvals, and rejections.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'EmailService';
  const ALLOWED_HOSTS = new Set([
    'thebalance2.github.io',
    'localhost',
    '127.0.0.1',
    'sic-booking-system.web.app',
    'sic-booking-system.firebaseapp.com'
  ]);
  const SUBMISSION_COOLDOWN_MS = 30 * 1000; // 30s cooldown between public confirmation emails
  const MAX_SESSION_SUBMISSION_EMAILS = 5;
  const SESSION_COUNT_KEY = 'sic_emailjs_sub_count';
  const SESSION_LAST_TS_KEY = 'sic_emailjs_last_ts';

  let initialized = false;

  function isAllowedOrigin() {
    if (typeof window === 'undefined' || !window.location) return false;
    const host = String(window.location.hostname || '').toLowerCase();
    return ALLOWED_HOSTS.has(host) || host.endsWith('.github.io') || host.endsWith('.web.app') || host.endsWith('.firebaseapp.com');
  }

  function canSendPublicSubmissionEmail() {
    try {
      const now = Date.now();
      const lastTs = Number(sessionStorage.getItem(SESSION_LAST_TS_KEY) || 0);
      const count  = Number(sessionStorage.getItem(SESSION_COUNT_KEY) || 0);
      if (now - lastTs < SUBMISSION_COOLDOWN_MS) return false;
      if (count >= MAX_SESSION_SUBMISSION_EMAILS) return false;
      sessionStorage.setItem(SESSION_LAST_TS_KEY, String(now));
      sessionStorage.setItem(SESSION_COUNT_KEY, String(count + 1));
      return true;
    } catch (_) {
      return true;
    }
  }

  function init() {
    if (initialized) return;
    if (typeof emailjs === 'undefined' || !isAllowedOrigin()) return;
    try {
      emailjs.init(EMAILJS_PUBLIC_KEY);
      initialized = true;
    } catch (err) {
      Logger.warn(LAYER, 'EmailJS not loaded or not configured:', err);
    }
  }

  function isConfigured() {
    return Boolean(
      isAllowedOrigin() &&
      EMAILJS_SERVICE_ID &&
      !EMAILJS_SERVICE_ID.startsWith('YOUR_') &&
      typeof emailjs !== 'undefined'
    );
  }

  function sendSubmissionConfirmation(data) {
    init();
    if (!isConfigured()) {
      Logger.info(LAYER, 'EmailJS not configured or unauthorized origin — skipping confirmation email.');
      return;
    }
    if (!canSendPublicSubmissionEmail()) {
      Logger.warn(LAYER, 'EmailJS rate limit reached for this session — skipping duplicate confirmation email.');
      return;
    }

    try {
      emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_APPROVE, {
        to_email:     data.email,
        to_name:      data.contactPerson,
        facility:     Utils.getBookingLocation(data, data.facility || '—'),
        date:         data.date,
        start_time:   Utils.formatTime12(data.startTime),
        end_time:     Utils.formatTime12(data.endTime),
        purpose:      data.purpose,
        status:       'Booking Submitted',
        reference_id: data.referenceId,
        message:      'Your reservation request (Ref: ' + data.referenceId + ') has been submitted successfully. Please print the downloaded PDF booking summary and present it to the Business Office of San Isidro College for payment assessment. After paying, return to the booking page and upload your receipt to confirm your reservation.'
      }).then(() => {
        Logger.info(LAYER, 'Confirmation email sent to', data.email);
      }).catch(err => {
        Logger.warn(LAYER, 'EmailJS confirmation send failed:', err);
      });
    } catch (err) {
      Logger.warn(LAYER, 'EmailJS confirmation error:', err);
    }
  }

  function sendStatusNotification(bookingData, status) {
    init();
    if (!isConfigured()) {
      Logger.info(LAYER, 'EmailJS not configured — skipping status email.');
      return;
    }

    const templateId = status === 'Approved' ? EMAILJS_TEMPLATE_APPROVE : EMAILJS_TEMPLATE_REJECT;
    const driverInfoText = (status === 'Approved' && bookingData.assignedDriverName)
      ? ` Assigned Driver: ${bookingData.assignedDriverName}${bookingData.assignedDriverPhone ? ' (Contact: ' + bookingData.assignedDriverPhone + ')' : ''}.`
      : '';
    const messageText = status === 'Approved'
      ? 'Your reservation request (Ref: ' + (bookingData.referenceId || '—') + ') has been APPROVED by the administrator.' + driverInfoText
      : 'Your reservation request (Ref: ' + (bookingData.referenceId || '—') + ') has been REJECTED by the administrator.';

    try {
      emailjs.send(EMAILJS_SERVICE_ID, templateId, {
        to_email:     bookingData.email,
        to_name:      bookingData.name,
        facility:     Utils.getBookingLocation(bookingData),
        vehicle:      Utils.formatVehicleList(bookingData.vehicle),
        driver_name:  bookingData.assignedDriverName || '—',
        driver_phone: bookingData.assignedDriverPhone || '—',
        date:         bookingData.date,
        start_time:   Utils.formatTime12(bookingData.startTime),
        end_time:     Utils.formatTime12(bookingData.endTime),
        purpose:      bookingData.purpose,
        reference_id: bookingData.referenceId || '—',
        status:       status,
        message:      messageText
      }).then(() => {
        Logger.info(LAYER, 'Status email sent successfully to', bookingData.email);
      }).catch(err => {
        Logger.warn(LAYER, 'EmailJS status send failed:', err);
      });
    } catch (err) {
      Logger.warn(LAYER, 'EmailJS status error:', err);
    }
  }

  window.EmailService = {
    init,
    sendSubmissionConfirmation,
    sendStatusNotification
  };
})();

