/* ============================================================
   Shared Utilities — San Isidro College Reservation System
   Core Layer (js/core/utils.js)
   Single source of truth for sanitizers, date/time formatters,
   sequential ID formatting, and input validators.
   ============================================================ */

(function () {
  'use strict';

  const DEFAULT_BOOKING_ID_PREFIX = 'SIC';
  const DEFAULT_BOOKING_ID_YEAR   = '2026';
  const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Escape HTML to prevent XSS when inserting untrusted text into innerHTML
  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Allow only safe URL schemes for src/href (http(s) and data:image)
  function sanitizeUrl(url) {
    if (!url) return '';
    const s = String(url).trim();
    if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:image/')) return s;
    return '';
  }

  // Convert 24h time "08:00" to 12h format "8:00 AM"
  function formatTime12(time, fallback = '—') {
    if (!time) return fallback;
    if (/am|pm/i.test(time)) return time;
    const parts = String(time).split(':');
    if (parts.length < 2) return time;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return time;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  // Format a time range in 12h format: "8:00 AM – 12:00 PM"
  function formatTimeRange12(startTime, endTime, separator = ' – ', fallback = '—') {
    if (!startTime && !endTime) return fallback;
    if (startTime && !endTime) return formatTime12(startTime, fallback);
    if (!startTime && endTime) return formatTime12(endTime, fallback);
    return `${formatTime12(startTime, fallback)}${separator}${formatTime12(endTime, fallback)}`;
  }

  // Convert "HH:MM" to minutes since midnight (number)
  function timeToMinutes(time) {
    if (!time || typeof time !== 'string') return NaN;
    const parts = time.split(':').map(Number);
    if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return NaN;
    return parts[0] * 60 + parts[1];
  }

  // Local "YYYY-MM-DD" (avoids the UTC shift of toISOString)
  function getLocalDateStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // "YYYY-MM-DD" + "HH:MM" -> epoch ms (local time)
  function toDateTimeMs(dateStr, timeStr) {
    if (!dateStr || !timeStr) return NaN;
    return new Date(`${dateStr}T${timeStr}`).getTime();
  }

  // Human-friendly date range: "Oct 18, 2026" / "Oct 18-20, 2026" / "Oct 30 - Nov 2, 2026"
  function formatDateRange(startDate, endDate) {
    const parse = s => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
      return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
    };
    const s = parse(startDate);
    if (!s) return startDate || '';
    const e = parse(endDate) || s;

    if (!endDate || startDate === endDate) return `${SHORT_MONTHS[s.m]} ${s.d}, ${s.y}`;
    if (s.y === e.y && s.m === e.m) return `${SHORT_MONTHS[s.m]} ${s.d}-${e.d}, ${s.y}`;
    if (s.y === e.y) return `${SHORT_MONTHS[s.m]} ${s.d} - ${SHORT_MONTHS[e.m]} ${e.d}, ${s.y}`;
    return `${SHORT_MONTHS[s.m]} ${s.d}, ${s.y} - ${SHORT_MONTHS[e.m]} ${e.d}, ${e.y}`;
  }

  // Format a date object, Firestore timestamp, or date string to "Oct 28, 2026"
  function formatFilingDate(inputDate) {
    if (!inputDate) inputDate = new Date();
    let d;
    if (inputDate instanceof Date) {
      d = inputDate;
    } else if (inputDate && typeof inputDate.toDate === 'function') {
      d = inputDate.toDate();
    } else if (typeof inputDate === 'string' || typeof inputDate === 'number') {
      d = new Date(inputDate);
    }
    if (!d || isNaN(d.getTime())) return String(inputDate);
    return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  function getFilingDate(data) {
    if (!data) return formatFilingDate(new Date());
    if (data.filingDate) return data.filingDate;
    if (data.dateSubmitted) return formatFilingDate(data.dateSubmitted);
    if (data.createdAt) return formatFilingDate(data.createdAt);
    return formatFilingDate(new Date());
  }

  // Format vehicle array or comma-separated string into display text
  function formatVehicleList(vehicleValue) {
    if (!vehicleValue) return '';
    if (Array.isArray(vehicleValue)) return vehicleValue.filter(Boolean).join(', ');
    return String(vehicleValue);
  }

  function getBookingVehicleArray(booking) {
    const raw = booking && booking.vehicle;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(v => String(v || '').trim()).filter(Boolean);
    return String(raw).split(',').map(v => v.trim()).filter(Boolean);
  }

  function getBookingLocation(booking, fallback = '—') {
    if (!booking) return fallback;
    if (booking.facility) return booking.facility;
    return formatVehicleList(booking.vehicle) || fallback;
  }

  // Combine name parts into "LastName, FirstName M.I." format
  function formatCombinedName(lastName, firstName, middleInitial) {
    const last = (lastName || '').trim();
    const first = (firstName || '').trim();
    let mi = (middleInitial || '').trim();

    if (/^(n\/?a|none|-|\.)$/i.test(mi)) {
      mi = '';
    } else if (mi) {
      mi = mi.toUpperCase();
      if (!mi.endsWith('.')) {
        mi += '.';
      }
    }

    const firstAndMi = [first, mi].filter(Boolean).join(' ');
    if (last && firstAndMi) {
      return `${last}, ${firstAndMi}`;
    }
    return last || firstAndMi || '';
  }

  function getBookingRequesterName(b, fallback = '—') {
    if (!b) return fallback;
    if (b.name) return b.name;
    if (b.lastName || b.firstName) {
      const mi = b.middleInitial ? (b.middleInitial.endsWith('.') ? b.middleInitial : b.middleInitial + '.') : '';
      const firstMi = [b.firstName, mi].filter(Boolean).join(' ');
      return b.lastName ? `${b.lastName}, ${firstMi}` : firstMi;
    }
    return b.contactPerson || fallback;
  }

  // Format sequential booking ID (e.g. SIC-2026-001)
  function formatSequentialBookingId(prefix, year, seq) {
    const cleanPrefix = String(prefix || DEFAULT_BOOKING_ID_PREFIX).trim().toUpperCase() || DEFAULT_BOOKING_ID_PREFIX;
    const cleanYear   = String(year || DEFAULT_BOOKING_ID_YEAR).trim() || DEFAULT_BOOKING_ID_YEAR;
    const parsedSeq   = Number(seq);
    const cleanSeq    = (Number.isFinite(parsedSeq) && parsedSeq >= 1) ? Math.floor(parsedSeq) : 1;
    return `${cleanPrefix}-${cleanYear}-${String(cleanSeq).padStart(3, '0')}`;
  }

  function sanitizeIdSegment(raw) {
    return String(raw || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]+/g, '')
      .replace(/^-+|-+$/g, '');
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isDigitsOnly(str) {
    return /^\d+$/.test(String(str).trim());
  }

  function isValidPersonCount(value) {
    return /^\d+$/.test(String(value).trim()) && parseInt(value, 10) >= 1;
  }

  function stripNonDigitsInput(el) {
    if (!el) return;
    el.addEventListener('input', () => {
      const cleaned = el.value.replace(/\D+/g, '');
      if (el.value !== cleaned) el.value = cleaned;
    });
  }

  function formatRelativeTime(ts) {
    if (!ts) return '';
    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 45) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  window.Utils = {
    DEFAULT_BOOKING_ID_PREFIX,
    DEFAULT_BOOKING_ID_YEAR,
    escapeHtml,
    sanitizeUrl,
    formatTime12,
    formatTimeRange12,
    timeToMinutes,
    getLocalDateStr,
    toDateTimeMs,
    formatDateRange,
    formatFilingDate,
    getFilingDate,
    formatVehicleList,
    getBookingVehicleArray,
    getBookingLocation,
    formatCombinedName,
    getBookingRequesterName,
    formatSequentialBookingId,
    sanitizeIdSegment,
    isValidEmail,
    isDigitsOnly,
    isValidPersonCount,
    stripNonDigitsInput,
    formatRelativeTime
  };
})();

