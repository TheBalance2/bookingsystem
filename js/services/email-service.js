/* ============================================================
   Email Service — San Isidro College Reservation System
   Service Layer (js/services/email-service.js)
   Centralizes EmailJS initialization and email dispatch for
   submission confirmations, approvals, and rejections.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'EmailService';
  let initialized = false;

  function init() {
    if (initialized) return;
    if (typeof emailjs === 'undefined') return;
    try {
      emailjs.init(EMAILJS_PUBLIC_KEY);
      initialized = true;
    } catch (err) {
      Logger.warn(LAYER, 'EmailJS not loaded or not configured:', err);
    }
  }

  function isConfigured() {
    return Boolean(EMAILJS_SERVICE_ID && !EMAILJS_SERVICE_ID.startsWith('YOUR_') && typeof emailjs !== 'undefined');
  }

  function sendSubmissionConfirmation(data) {
    init();
    if (!isConfigured()) {
      Logger.info(LAYER, 'EmailJS not configured — skipping confirmation email.');
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

