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
    if (!host) return false;
    let configuredHost = '';
    try {
      if (window.APP_PUBLIC_BASE_URL) {
        configuredHost = new URL(window.APP_PUBLIC_BASE_URL).hostname.toLowerCase();
      }
    } catch (_) {}
    return (
      ALLOWED_HOSTS.has(host) ||
      (configuredHost && host === configuredHost) ||
      host.endsWith('.github.io') ||
      host.endsWith('.web.app') ||
      host.endsWith('.firebaseapp.com') ||
      host.endsWith('.hostingersite.com')
    );
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

    const isInternal = data && data.userType === 'Internal';
    const recipientName = (data && (data.contactPerson || data.name)) || Utils.getBookingRequesterName(data);
    const submissionMessage = isInternal
      ? 'Your reservation request (Ref: ' + data.referenceId + ') has been submitted successfully. Please print TWO (2) copies of the downloaded PDF booking form and route it to the respective offices for signatures. You will receive an email notification once your reservation is approved.'
      : 'Your reservation request (Ref: ' + data.referenceId + ') has been submitted successfully. Please print the downloaded PDF booking summary and present it to the Business Office of San Isidro College for payment assessment. After paying, return to the booking page and upload your receipt to confirm your reservation.';

    const cleanFacility = Utils.getBookingLocation(data, data.facility || '—').replace(/\s*\/\s*/g, ' - ');
    try {
      emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_APPROVE, {
        to_email:          data.email,
        to_name:           recipientName,
        facility:          cleanFacility,
        vehicle:           Utils.formatVehicleList(data.vehicle) || '—',
        driver_name:       '—',
        driver_phone:      '—',
        date:              data.date,
        start_time:        Utils.formatTime12(data.startTime),
        end_time:          Utils.formatTime12(data.endTime),
        purpose:           data.purpose,
        status:            'Booking Submitted',
        reference_id:      data.referenceId,
        message:           submissionMessage,
        booking_form:      '',
        booking_form_name: ''
      }).then(() => {
        Logger.info(LAYER, 'Confirmation email sent to', data.email);
      }).catch(err => {
        Logger.warn(LAYER, 'EmailJS confirmation send failed:', err);
      });
    } catch (err) {
      Logger.warn(LAYER, 'EmailJS confirmation error:', err);
    }
  }

  function sendStatusNotification(bookingData, status, pdfAttachment = null) {
    init();
    if (!isConfigured()) {
      Logger.info(LAYER, 'EmailJS not configured — skipping status email.');
      return;
    }

    const templateId = status === 'Approved' ? EMAILJS_TEMPLATE_APPROVE : EMAILJS_TEMPLATE_REJECT;
    const isInternal = bookingData && bookingData.userType === 'Internal';
    const driverInfoText = (status === 'Approved' && bookingData.assignedDriverName)
      ? ` Assigned Driver: ${bookingData.assignedDriverName}${bookingData.assignedDriverPhone ? ' (Contact: ' + bookingData.assignedDriverPhone + ')' : ''}.`
      : '';

    const pdfDownloadUrl = (status === 'Approved' && window.PdfService && typeof PdfService.buildBookingPdfDownloadUrl === 'function')
      ? PdfService.buildBookingPdfDownloadUrl(bookingData)
      : '';
    const pdfLinkLine = pdfDownloadUrl
      ? `\n\nClick the link below to open and download your Official Request Form (PDF):\n${pdfDownloadUrl}`
      : '';

    const copiesInstruction = isInternal
      ? ' Please download, print, and accomplish TWO (2) copies of your official Request for the Use of Facilities Form (Requesting Person, Facility In-Charge) and secure the required signatures before your scheduled use.'
      : ' Please download, print, and accomplish FOUR (4) copies of your official Request for the Use of Facilities Form (Requesting Person, School Guard, Facility In-Charge, Comptroller) and attach the original copy of your Letter of Intent.';
    const messageText = status === 'Approved'
      ? 'Your reservation request (Ref: ' + (bookingData.referenceId || '—') + ') has been APPROVED by the Facility-In-Charge.' + driverInfoText + copiesInstruction + pdfLinkLine
      : 'Your reservation request (Ref: ' + (bookingData.referenceId || '—') + ') has been REJECTED by the Facility-In-Charge.';

    const formattedDate = (bookingData.startDate && bookingData.endDate && typeof Utils !== 'undefined' && typeof Utils.formatDateRange === 'function')
      ? Utils.formatDateRange(bookingData.startDate, bookingData.endDate)
      : bookingData.date;

    const cleanFacility = Utils.getBookingLocation(bookingData).replace(/\s*\/\s*/g, ' - ');
    const baseParams = {
      to_email:         bookingData.email,
      to_name:          bookingData.name || bookingData.contactPerson || Utils.getBookingRequesterName(bookingData),
      facility:         cleanFacility,
      vehicle:          Utils.formatVehicleList(bookingData.vehicle),
      driver_name:      bookingData.assignedDriverName || '—',
      driver_phone:     bookingData.assignedDriverPhone || '—',
      date:             formattedDate,
      start_time:       Utils.formatTime12(bookingData.startTime),
      end_time:         Utils.formatTime12(bookingData.endTime),
      purpose:          bookingData.purpose,
      reference_id:     bookingData.referenceId || '—',
      status:           status,
      message:          messageText,
      pdf_download_url: pdfDownloadUrl,
      download_link:    pdfDownloadUrl,
      pdf_url:          pdfDownloadUrl
    };

    try {
      emailjs.send(EMAILJS_SERVICE_ID, templateId, baseParams).then(() => {
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

