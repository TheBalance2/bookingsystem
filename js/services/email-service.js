/* ============================================================
   Email Service — San Isidro College Reservation System
   Service Layer (js/services/email-service.js)
   Dispatches reservation emails primarily through Hostinger's
   native PHP Mail/SMTP endpoint (api/send-email.php) with rich
   HTML + direct PDF attachments, falling back to EmailJS only
   if PHP mail is unreachable.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'EmailService';
  const ALLOWED_HOSTS = new Set([
    'sicreservations.com',
    'www.sicreservations.com',
    'thebalance2.github.io',
    'localhost',
    '127.0.0.1',
    'sic-booking-system.web.app',
    'sic-booking-system.firebaseapp.com'
  ]);
  const SUBMISSION_COOLDOWN_MS = 15 * 1000; // 15s cooldown between duplicate clicks
  const MAX_SESSION_SUBMISSION_EMAILS = 25;
  const SESSION_COUNT_KEY = 'sic_email_sub_count';
  const SESSION_LAST_TS_KEY = 'sic_email_last_ts';

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
    if (!isAllowedOrigin()) return;
    try {
      if (typeof emailjs !== 'undefined' && typeof EMAILJS_PUBLIC_KEY !== 'undefined') {
        emailjs.init(EMAILJS_PUBLIC_KEY);
      }
      initialized = true;
    } catch (err) {
      Logger.warn(LAYER, 'EmailJS fallback init warning:', err);
    }
  }

  function getHostingerEmailEndpoint() {
    if (typeof window !== 'undefined' && window.location) {
      const host = (window.location.hostname || '').toLowerCase();
      // When running on Hostinger domain directly, use relative endpoint
      if (host === 'sicreservations.com' || host === 'www.sicreservations.com' || host.endsWith('.hostingersite.com')) {
        return 'api/send-email.php';
      }
    }
    const base = (typeof window !== 'undefined' && window.APP_PUBLIC_BASE_URL) || 'https://sicreservations.com/';
    return (base.endsWith('/') ? base : base + '/') + 'api/send-email.php';
  }

  async function sendViaHostingerPhp(payload) {
    if (typeof fetch !== 'function') return false;
    const endpoint = getHostingerEmailEndpoint();
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        Logger.warn(LAYER, 'Hostinger email endpoint returned HTTP ' + response.status + ':', errData.error || '');
        return false;
      }
      const res = await response.json();
      if (res && res.ok) {
        Logger.info(LAYER, 'Email sent via Hostinger (' + (res.provider || 'php') + ') to', payload.to_email);
        return true;
      }
      return false;
    } catch (err) {
      Logger.warn(LAYER, 'Hostinger PHP email endpoint unreachable, checking fallback:', err);
      return false;
    }
  }

  function sendViaEmailJsFallback(templateId, params) {
    init();
    if (
      typeof emailjs === 'undefined' ||
      typeof EMAILJS_SERVICE_ID === 'undefined' ||
      !EMAILJS_SERVICE_ID ||
      EMAILJS_SERVICE_ID.startsWith('YOUR_')
    ) {
      return;
    }
    try {
      const cleanParams = { ...params };
      delete cleanParams.pdf_base64;
      delete cleanParams.pdf_filename;
      emailjs.send(EMAILJS_SERVICE_ID, templateId, cleanParams).then(() => {
        Logger.info(LAYER, 'Email sent via EmailJS fallback to', params.to_email);
      }).catch(err => {
        Logger.warn(LAYER, 'EmailJS fallback send failed:', err);
      });
    } catch (err) {
      Logger.warn(LAYER, 'EmailJS fallback error:', err);
    }
  }

  async function sendSubmissionConfirmation(data) {
    if (!isAllowedOrigin() || !data || !data.email) return;
    if (!canSendPublicSubmissionEmail()) {
      Logger.warn(LAYER, 'Rate limit reached for this session — skipping duplicate confirmation email.');
      return;
    }

    const isInternal = data.userType === 'Internal';
    const recipientName = (data.contactPerson || data.name) || Utils.getBookingRequesterName(data);
    const submissionMessage = isInternal
      ? 'Your reservation request (Ref: ' + data.referenceId + ') has been submitted successfully. Please print TWO (2) copies of the downloaded PDF booking form and route it to the respective offices for signatures. You will receive an email notification once your reservation is approved.'
      : 'Your reservation request (Ref: ' + data.referenceId + ') has been submitted successfully. Please print the downloaded PDF booking summary and present it to the Business Office of San Isidro College for payment assessment. After paying, return to the booking page and upload your receipt to confirm your reservation.';

    const cleanFacility = Utils.getBookingLocation(data, data.facility || '—').replace(/\s*\/\s*/g, ' - ');
    const payload = {
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
    };

    const sent = await sendViaHostingerPhp(payload);
    if (!sent && typeof EMAILJS_TEMPLATE_APPROVE !== 'undefined') {
      sendViaEmailJsFallback(EMAILJS_TEMPLATE_APPROVE, payload);
    }
  }

  async function sendStatusNotification(bookingData, status, pdfAttachment = null) {
    if (!isAllowedOrigin() || !bookingData || !bookingData.email) return;

    const isInternal = bookingData.userType === 'Internal';
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

    // Generate compact PDF (~14 KB) to attach directly to Hostinger email on Approval
    let pdfBase64 = pdfAttachment || '';
    let pdfFilename = '';
    if (status === 'Approved' && window.PdfService) {
      if (!pdfBase64 && typeof PdfService.getBookingPdfDataUri === 'function') {
        try {
          pdfBase64 = await PdfService.getBookingPdfDataUri(bookingData);
        } catch (err) {
          Logger.warn(LAYER, 'Could not build PDF attachment for email:', err);
        }
      }
      if (typeof PdfService.getBookingPdfFilename === 'function') {
        pdfFilename = PdfService.getBookingPdfFilename(bookingData.userType, bookingData.referenceId);
      }
    }

    const cleanFacility = Utils.getBookingLocation(bookingData).replace(/\s*\/\s*/g, ' - ');
    const payload = {
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
      pdf_url:          pdfDownloadUrl,
      pdf_base64:       pdfBase64,
      pdf_filename:     pdfFilename || 'SIC-Request-Form.pdf'
    };

    const sent = await sendViaHostingerPhp(payload);
    if (!sent && typeof EMAILJS_TEMPLATE_APPROVE !== 'undefined') {
      const templateId = status === 'Approved' ? EMAILJS_TEMPLATE_APPROVE : EMAILJS_TEMPLATE_REJECT;
      sendViaEmailJsFallback(templateId, payload);
    }
  }

  window.EmailService = {
    init,
    sendSubmissionConfirmation,
    sendStatusNotification
  };
})();
