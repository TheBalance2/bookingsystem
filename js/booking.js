/* ============================================================
   Booking Module — San Isidro College Reservation System
   Form toggle, validation, conflict checking, Firestore write
   ============================================================ */

(function () {
  'use strict';

  // ---- DOM References ----
  const toggleBtns     = document.querySelectorAll('.toggle-btn');
  const internalForm   = document.getElementById('internalForm');
  const externalForm   = document.getElementById('externalForm');
  const intForm        = document.getElementById('internalBookingForm');
  const extForm        = document.getElementById('externalBookingForm');
  const successModal   = document.getElementById('successModal');
  const bookingRefId   = document.getElementById('bookingRefId');

  // External-specific modals & receipt upload
  const extSuccessModal    = document.getElementById('extSuccessModal');
  const extBookingRefId    = document.getElementById('extBookingRefId');
  const downloadPdfBtn     = document.getElementById('downloadPdfBtn');
  const receiptUploadSection = document.getElementById('receiptUploadSection');
  const receiptForm        = document.getElementById('receiptUploadForm');
  const receiptSuccessModal = document.getElementById('receiptSuccessModal');

  // Initialize EmailJS
  try {
    emailjs.init(EMAILJS_PUBLIC_KEY);
  } catch (e) {
    console.warn('EmailJS not loaded or not configured:', e);
  }

  // Store last generated PDF for download button
  let lastGeneratedPdf = null;

  // Value of the special "Vehicle" choice in the internal Facility dropdown
  const VEHICLE_OPTION = 'Vehicle';

  // Keep the "Vehicle" choice at the end of the internal Facility dropdown
  function appendVehicleOption(select) {
    if (!select) return;
    const existing = Array.from(select.options).find(o => o.value === VEHICLE_OPTION);
    if (existing) existing.remove();
    const option = document.createElement('option');
    option.value = VEHICLE_OPTION;
    option.textContent = 'Vehicle';
    select.appendChild(option);
  }

  // ============================================================
  // USER TYPE TOGGLE
  // ============================================================
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (btn.dataset.type === 'internal') {
        internalForm.style.display = 'block';
        externalForm.style.display = 'none';
        if (receiptUploadSection) receiptUploadSection.style.display = 'none';
      } else {
        internalForm.style.display = 'none';
        externalForm.style.display = 'block';
        if (receiptUploadSection) receiptUploadSection.style.display = 'block';
      }
    });
  });

  // ============================================================
  // LOAD FACILITIES FROM FIRESTORE
  // ============================================================
  function loadFacilities() {
    const intFacilitySelect = document.getElementById('intFacility');
    const extFacilitySelect = document.getElementById('extFacility');

    db.collection('facilities')
      .orderBy('order', 'asc')
      .get()
      .then(snapshot => {
        if (snapshot.empty) return; // Keep hardcoded defaults as fallback

        // Remember the current internal choice so a late load doesn't wipe it
        const prevIntChoice = intFacilitySelect ? intFacilitySelect.value : '';

        // Clear existing options (keep the placeholder)
        [intFacilitySelect, extFacilitySelect].forEach(select => {
          if (!select) return;
          // Remove all options except the first "Select Facility" placeholder
          while (select.options.length > 1) {
            select.remove(1);
          }
        });

        // Add facilities from Firestore (only Active ones)
        snapshot.forEach(doc => {
          const f = doc.data();
          if (f.status !== 'Active') return;

          [intFacilitySelect, extFacilitySelect].forEach(select => {
            if (!select) return;
            const option = document.createElement('option');
            option.value = f.name;
            option.textContent = f.name;
            select.appendChild(option);
          });
        });

        // Internal form: vehicles are chosen via the "Vehicle" option
        appendVehicleOption(intFacilitySelect);
        if (intFacilitySelect && prevIntChoice &&
            Array.from(intFacilitySelect.options).some(o => o.value === prevIntChoice)) {
          intFacilitySelect.value = prevIntChoice;
        }
      })
      .catch(err => {
        console.warn('Could not load facilities from Firestore, using hardcoded defaults:', err);
      });
  }

  // ============================================================
  // LOAD VEHICLES FROM FIRESTORE
  // ============================================================
  function loadVehicles() {
    const vehicleOptions = document.getElementById('vehicleOptions');
    if (!vehicleOptions) return;

    const fallbackVehicles = [
      'Toyota Grandia Van',
      'KIA Utility Van'
    ];

    db.collection('vehicles')
      .orderBy('order', 'asc')
      .get()
      .then(snapshot => {
        const vehicles = [];

        snapshot.forEach(doc => {
          const vehicle = doc.data();
          if (vehicle.status === 'Active' && vehicle.name) {
            vehicles.push(vehicle.name);
          }
        });

        const options = vehicles.length > 0 ? vehicles : fallbackVehicles;

        vehicleOptions.innerHTML = '';
        options.forEach(name => {
          const label = document.createElement('label');
          label.className = 'equipment-item';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.name = 'vehicle';
          cb.value = name;
          label.appendChild(cb);
          label.appendChild(document.createTextNode(' ' + name));
          vehicleOptions.appendChild(label);
        });
      })
      .catch(err => {
        console.warn('Could not load vehicles from Firestore, using fallback defaults:', err);
        vehicleOptions.innerHTML = '';
        fallbackVehicles.forEach(name => {
          const label = document.createElement('label');
          label.className = 'equipment-item';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.name = 'vehicle';
          cb.value = name;
          label.appendChild(cb);
          label.appendChild(document.createTextNode(' ' + name));
          vehicleOptions.appendChild(label);
        });
      });
  }

  // Load facilities on page init
  loadFacilities();
  loadVehicles();

  // ============================================================
  // PRE-FILL FROM URL QUERY PARAMS (?date=...&facility=...)
  // ============================================================
  (function prefillFromURL() {
    const params = new URLSearchParams(window.location.search);
    const prefillDate     = params.get('date');
    const prefillFacility = params.get('facility');

    if (!prefillDate && !prefillFacility) return;

    // Pre-fill date inputs immediately (same-day booking by default)
    if (prefillDate) {
      ['intStartDate', 'intEndDate', 'extStartDate', 'extEndDate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = prefillDate;
      });
    }

    // Pre-fill facility selects — need a small delay for dynamic options to load
    if (prefillFacility) {
      function setFacility() {
        const intFacility = document.getElementById('intFacility');
        const extFacility = document.getElementById('extFacility');

        [intFacility, extFacility].forEach(select => {
          if (!select) return;
          // Try to find the matching option
          for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value === prefillFacility) {
              select.value = prefillFacility;
              break;
            }
          }
        });
      }

      // Try immediately (for hardcoded options)
      setFacility();
      // Retry after dynamic load finishes
      setTimeout(setFacility, 800);
      setTimeout(setFacility, 1500);
    }

    // Scroll to form smoothly
    setTimeout(() => {
      const formCard = document.getElementById('internalForm');
      if (formCard) formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  })();

  // ============================================================
  // UTILITY HELPERS
  // ============================================================
  // Escape HTML to prevent XSS when inserting untrusted text into innerHTML
  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Convert "HH:MM" to minutes since midnight (number)
  function timeToMinutes(time) {
    if (!time || typeof time !== 'string') return NaN;
    const parts = time.split(':').map(Number);
    if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return NaN;
    return parts[0] * 60 + parts[1];
  }
  function generateRefId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = 'SIC-';
    for (let i = 0; i < 8; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    return id;
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // Ensure phone contains digits only (no spaces, letters, or symbols)
  function isDigitsOnly(str) {
    return /^\d+$/.test(String(str).trim());
  }

  // Combine name parts into "LastName, FirstName M.I." format (e.g. "Dela Cruz, Juan M.")
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

  // Strip non-digit characters from an input's value (used on input event)
  function stripNonDigitsInput(el) {
    if (!el) return;
    el.addEventListener('input', () => {
      const cleaned = el.value.replace(/\D+/g, '');
      if (el.value !== cleaned) el.value = cleaned;
    });
  }

  function isAllowedDate(dateStr) {
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 3);
    minDate.setHours(0, 0, 0, 0);
    return new Date(dateStr) >= minDate;
  }

  // Positive whole number (no +, -, e, decimals)
  function isValidPersonCount(value) {
    return /^\d+$/.test(String(value).trim()) && parseInt(value, 10) >= 1;
  }

  // Local "YYYY-MM-DD" (avoids the UTC shift of toISOString)
  function getLocalDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // "YYYY-MM-DD" + "HH:MM" -> epoch ms (local time)
  function toDateTimeMs(dateStr, timeStr) {
    if (!dateStr || !timeStr) return NaN;
    return new Date(`${dateStr}T${timeStr}`).getTime();
  }

  // Human-friendly date range: "Oct 18, 2026" / "Oct 18-20, 2026" / "Oct 30 - Nov 2, 2026"
  function formatDateRange(startDate, endDate) {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parse = s => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
      return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
    };
    const s = parse(startDate);
    if (!s) return startDate || '';
    const e = parse(endDate) || s;

    if (!endDate || startDate === endDate) return `${MONTHS[s.m]} ${s.d}, ${s.y}`;
    if (s.y === e.y && s.m === e.m) return `${MONTHS[s.m]} ${s.d}-${e.d}, ${s.y}`;
    if (s.y === e.y) return `${MONTHS[s.m]} ${s.d} - ${MONTHS[e.m]} ${e.d}, ${s.y}`;
    return `${MONTHS[s.m]} ${s.d}, ${s.y} - ${MONTHS[e.m]} ${e.d}, ${e.y}`;
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

  function formatTimeRange12(startTime, endTime, separator = ' – ', fallback = '—') {
    if (!startTime && !endTime) return fallback;
    if (startTime && !endTime) return formatTime12(startTime, fallback);
    if (!startTime && endTime) return formatTime12(endTime, fallback);
    return `${formatTime12(startTime, fallback)}${separator}${formatTime12(endTime, fallback)}`;
  }

  // First visible text/select/textarea inside a form group (skips checkboxes)
  function findVisibleField(group) {
    if (!group) return null;
    return Array.from(group.querySelectorAll('input, select, textarea')).find(f =>
      f.type !== 'checkbox' && f.type !== 'hidden' && f.offsetParent !== null
    ) || null;
  }

  // Show an error message (optionally overriding its text) and highlight its field
  function showError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.dataset.defaultText === undefined) el.dataset.defaultText = el.textContent;
    el.textContent = message || el.dataset.defaultText;
    el.classList.add('visible');

    const group = el.closest('.form-group');
    const field = findVisibleField(group);
    if (field) {
      field.classList.add('error');
    } else if (group) {
      const grid = group.querySelector('.equipment-grid');
      if (grid) grid.classList.add('error');
    }
  }

  function clearErrors(prefix) {
    document.querySelectorAll(`[id^="${prefix}"]`).forEach(el => {
      if (el.classList.contains('error-message')) el.classList.remove('visible');
    });
    const containerId = prefix === 'int' ? 'internalForm' : 'externalForm';
    document.querySelectorAll(`#${containerId} input, #${containerId} select, #${containerId} textarea, #${containerId} .equipment-grid`)
      .forEach(inp => inp.classList.remove('error'));
  }

  // Scroll to, focus and shake the first missing/invalid field of a form
  function focusFirstError(formEl) {
    if (!formEl) return;
    const firstMsg = formEl.querySelector('.error-message.visible');
    if (!firstMsg) return;

    const group = firstMsg.closest('.form-group') || firstMsg.parentElement;
    const field = findVisibleField(group);
    const target = field || group;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (field && !field.disabled) {
      try { field.focus({ preventScroll: true }); } catch (_) { field.focus(); }
    }

    target.classList.remove('field-shake');
    void target.offsetWidth; // restart animation
    target.classList.add('field-shake');
    setTimeout(() => target.classList.remove('field-shake'), 500);
  }

  // Shared date/time rules for requester forms (prefix = 'int' | 'ext')
  //  - Start date must respect the 3-day advance rule
  //  - End date must be on/after start date
  //  - Same-day bookings: end time must be after start time
  //  - Multi-day bookings: end time is on the end date, so any time is fine
  function validateSchedule(prefix, startDate, endDate, startTime, endTime) {
    let ok = true;
    if (!startDate || !isAllowedDate(startDate)) { showError(prefix + 'StartDateError'); ok = false; }

    if (!endDate) {
      showError(prefix + 'EndDateError', 'Please select an end date');
      ok = false;
    } else if (startDate && endDate < startDate) {
      showError(prefix + 'EndDateError', 'End date must be on or after the start date');
      ok = false;
    }

    if (!startTime) { showError(prefix + 'StartTimeError'); ok = false; }

    if (!endTime) {
      showError(prefix + 'EndTimeError', 'Please select an end time');
      ok = false;
    } else if (startTime && startDate && startDate === endDate && endTime <= startTime) {
      showError(prefix + 'EndTimeError', 'For same-day bookings, end time must be after start time');
      ok = false;
    }
    return ok;
  }

  function getCheckedEquipment(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(cb => cb.value);
  }

  function getEquipmentWithQuantities(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(cb => {
      const qtyInput = cb.parentElement.querySelector('.eq-qty');
      const qty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
      return { item: cb.value, qty: qty };
    });
  }

  // Equipment quantity toggle
  document.querySelectorAll('.eq-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const qtyInput = e.target.parentElement.querySelector('.eq-qty');
      if (qtyInput) {
        qtyInput.style.display = e.target.checked ? 'inline-block' : 'none';
      }
    });
  });

  // ============================================================
  // CONFLICT CHECKING
  // ============================================================
  // Checks overlap against Pending/Approved bookings of the same facility.
  // Bookings may span several days, so we compare full date-time ranges.
  async function checkConflict(facility, startDate, endDate, startTime, endTime, warningId, textId) {
    const warningEl = document.getElementById(warningId);
    const textEl    = document.getElementById(textId);

    const effectiveEnd = endDate || startDate;
    const newStart = toDateTimeMs(startDate, startTime);
    const newEnd   = toDateTimeMs(effectiveEnd, endTime);

    if (!facility || Number.isNaN(newStart) || Number.isNaN(newEnd) || newEnd <= newStart) {
      warningEl.classList.remove('visible');
      return false;
    }

    try {
      const snapshot = await db.collection('bookings')
        .where('facility', '==', facility)
        .where('status', 'in', ['Pending', 'Approved'])
        .get();

      let hasConflict = false;

      snapshot.forEach(doc => {
        const d = doc.data();
        const exStartDate = d.startDate || d.date;
        const exEndDate   = d.endDate || exStartDate;
        const existingStart = toDateTimeMs(exStartDate, d.startTime);
        const existingEnd   = toDateTimeMs(exEndDate, d.endTime);

        // If parsing failed for any value, skip that record
        if (Number.isNaN(existingStart) || Number.isNaN(existingEnd)) return;

        // Range overlap: newStart < existingEnd && newEnd > existingStart
        if (newStart < existingEnd && newEnd > existingStart) {
          hasConflict = true;
        }
      });

      if (hasConflict) {
        textEl.textContent = `${facility} already has a booking that overlaps with ${formatDateRange(startDate, effectiveEnd)}, ${formatTimeRange12(startTime, endTime)}. Your request may be rejected.`;
        warningEl.classList.add('visible');
      } else {
        warningEl.classList.remove('visible');
      }

      return hasConflict;
    } catch (err) {
      console.warn('Conflict check failed (Firebase may not be configured):', err);
      warningEl.classList.remove('visible');
      return false;
    }
  }

  // ============================================================
  // DATE RANGE SETUP — min date (today + 3 days) and Start/End linking
  // (registered before the conflict listeners so the end date is synced first)
  // ============================================================
  const minDateObj = new Date();
  minDateObj.setDate(minDateObj.getDate() + 3);
  const minDateStr = getLocalDateStr(minDateObj);

  function linkDateRange(startId, endId) {
    const startEl = document.getElementById(startId);
    const endEl   = document.getElementById(endId);
    if (!startEl || !endEl) return;

    startEl.setAttribute('min', minDateStr);
    endEl.setAttribute('min', minDateStr);

    startEl.addEventListener('change', () => {
      if (startEl.value) {
        endEl.min = startEl.value;
        // Default to a same-day booking; never allow end before start
        if (!endEl.value || endEl.value < startEl.value) endEl.value = startEl.value;
      } else {
        endEl.min = minDateStr;
      }
    });
  }
  linkDateRange('intStartDate', 'intEndDate');
  linkDateRange('extStartDate', 'extEndDate');

  // Attach conflict check listeners — Internal
  function runIntConflictCheck() {
    const choice = document.getElementById('intFacility').value;
    checkConflict(
      choice === VEHICLE_OPTION ? '' : choice,
      document.getElementById('intStartDate').value,
      document.getElementById('intEndDate').value,
      document.getElementById('intStartTime').value,
      document.getElementById('intEndTime').value,
      'intConflictWarning', 'intConflictText'
    );
  }
  ['intFacility', 'intStartDate', 'intEndDate', 'intStartTime', 'intEndTime'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', runIntConflictCheck);
  });

  // Attach conflict check listeners — External
  function runExtConflictCheck() {
    checkConflict(
      document.getElementById('extFacility').value,
      document.getElementById('extStartDate').value,
      document.getElementById('extEndDate').value,
      document.getElementById('extStartTime').value,
      document.getElementById('extEndTime').value,
      'extConflictWarning', 'extConflictText'
    );
  }
  ['extFacility', 'extStartDate', 'extEndDate', 'extStartTime', 'extEndTime'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', runExtConflictCheck);
  });

  // Ensure extContact input accepts only digits while typing
  const extContactEl = document.getElementById('extContact');
  if (extContactEl) stripNonDigitsInput(extContactEl);

  // Toggle "Other" input for Agency/Organization Type
  const extAgencyTypeEl = document.getElementById('extAgencyType');
  const extAgencyTypeOtherGroup = document.getElementById('extAgencyTypeOtherGroup');
  const extAgencyTypeOtherInput = document.getElementById('extAgencyTypeOther');

  function updateExtAgencyOtherVisibility() {
    if (!extAgencyTypeEl || !extAgencyTypeOtherGroup) return;
    const isOther = extAgencyTypeEl.value.startsWith('Other');
    extAgencyTypeOtherGroup.style.display = isOther ? '' : 'none';
    if (!isOther && extAgencyTypeOtherInput) {
      extAgencyTypeOtherInput.value = '';
      extAgencyTypeOtherInput.classList.remove('error');
      const otherErr = document.getElementById('extAgencyTypeOtherError');
      if (otherErr) otherErr.classList.remove('visible');
    }
  }

  if (extAgencyTypeEl) {
    extAgencyTypeEl.addEventListener('change', updateExtAgencyOtherVisibility);
  }

  if (extForm) {
    extForm.addEventListener('reset', () => {
      setTimeout(updateExtAgencyOtherVisibility, 0);
    });
  }

  // Number of Persons: digits only (blocks +, -, e, decimals and pasted symbols)
  ['intNumPersons', 'extNumPersons'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('keydown', (e) => {
      if (['+', '-', 'e', 'E', '.', ','].includes(e.key)) e.preventDefault();
    });
    stripNonDigitsInput(el);
  });

  // Automatically uppercase name inputs as the user types (keeps caret position)
  ['intFirstName', 'intLastName', 'intMiddleInitial', 'extFirstName', 'extLastName', 'extMiddleInitial'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const upper = el.value.toUpperCase();
      if (upper === el.value) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.value = upper;
      try { el.setSelectionRange(start, end); } catch (_) { /* not supported */ }
    });
  });

  // ============================================================
  // VEHICLE FIELDS — only shown when "Vehicle" is chosen (Internal form)
  // ============================================================
  const intFacilityEl = document.getElementById('intFacility');
  const vehicleFields = document.querySelectorAll('#internalForm .vehicle-field');

  function updateVehicleVisibility() {
    const isVehicle = !!intFacilityEl && intFacilityEl.value === VEHICLE_OPTION;

    vehicleFields.forEach(el => {
      const wasHidden = el.style.display === 'none';
      el.style.display = isVehicle ? '' : 'none';
      if (isVehicle && wasHidden) {
        el.classList.remove('revealed');
        void el.offsetWidth; // restart animation
        el.classList.add('revealed');
      }
    });

    if (!isVehicle) {
      // Switching to a facility: drop any vehicle selections / destination
      document.querySelectorAll('input[name="vehicle"]:checked').forEach(cb => { cb.checked = false; });
      const dest = document.getElementById('intDestination');
      if (dest) { dest.value = ''; dest.classList.remove('error'); }
      ['intFacilityVehicleError', 'intDestinationError'].forEach(id => {
        const err = document.getElementById(id);
        if (err) err.classList.remove('visible');
      });
      const grid = document.getElementById('vehicleOptions');
      if (grid) grid.classList.remove('error');
    }
  }

  if (intFacilityEl) intFacilityEl.addEventListener('change', updateVehicleVisibility);

  // Toggle conditional Course / School of College for Internal Department
  const intDepartmentEl = document.getElementById('intDepartment');
  const intCollegeSchoolGroup = document.getElementById('intCollegeSchoolGroup');
  const intCollegeSchoolEl = document.getElementById('intCollegeSchool');

  function updateIntDepartmentSchoolVisibility() {
    if (!intDepartmentEl || !intCollegeSchoolGroup) return;
    const isCollege = intDepartmentEl.value === 'College';
    const wasHidden = intCollegeSchoolGroup.style.display === 'none';
    intCollegeSchoolGroup.style.display = isCollege ? '' : 'none';

    if (isCollege) {
      if (intCollegeSchoolEl) intCollegeSchoolEl.required = true;
      if (wasHidden) {
        intCollegeSchoolGroup.classList.remove('revealed');
        void intCollegeSchoolGroup.offsetWidth;
        intCollegeSchoolGroup.classList.add('revealed');
      }
    } else {
      if (intCollegeSchoolEl) {
        intCollegeSchoolEl.required = false;
        intCollegeSchoolEl.value = '';
        intCollegeSchoolEl.classList.remove('error');
      }
      const schoolErr = document.getElementById('intCollegeSchoolError');
      if (schoolErr) schoolErr.classList.remove('visible');
    }
  }

  if (intDepartmentEl) {
    intDepartmentEl.addEventListener('change', updateIntDepartmentSchoolVisibility);
  }

  if (intForm) {
    intForm.addEventListener('reset', () => {
      setTimeout(() => {
        updateVehicleVisibility();
        updateIntDepartmentSchoolVisibility();
        clearErrors('int');
        document.getElementById('intConflictWarning').classList.remove('visible');
      }, 0);
    });
  }
  if (extForm) {
    extForm.addEventListener('reset', () => {
      setTimeout(() => {
        clearErrors('ext');
        document.getElementById('extConflictWarning').classList.remove('visible');
      }, 0);
    });
  }

  // ============================================================
  // PHILIPPINE ADDRESS SELECTOR (External form)
  // Region > Province > City/Municipality > Barangay via the public PSGC API.
  // Falls back to a free-text address field if the API can't be reached.
  // ============================================================
  const PSGC_API_BASE = 'https://psgc.gitlab.io/api';
  const INDEPENDENT_CITIES = '__independent__';
  const addr = {
    region:        document.getElementById('extRegion'),
    province:      document.getElementById('extProvince'),
    provinceGroup: document.getElementById('extProvinceGroup'),
    city:          document.getElementById('extCity'),
    barangay:      document.getElementById('extBarangay'),
    barangayText:  document.getElementById('extBarangayText'),
    street:        document.getElementById('extStreet'),
    grid:          document.querySelector('#extAddressBlock .address-grid'),
    manualGroup:   document.getElementById('extAddressManualGroup'),
    manual:        document.getElementById('extAddress')
  };
  let addressManualMode = false;
  let regionCities = []; // cities/municipalities of the selected region

  // Fetch JSON from PSGC with a timeout; responses are cached per browser session
  function psgcFetch(path) {
    const cacheKey = 'psgc:' + path;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) return Promise.resolve(JSON.parse(cached));
    } catch (_) { /* storage unavailable */ }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 10000) : null;

    return fetch(PSGC_API_BASE + path, controller ? { signal: controller.signal } : undefined)
      .then(res => {
        if (!res.ok) throw new Error('PSGC request failed: ' + res.status);
        return res.json();
      })
      .then(data => {
        try { sessionStorage.setItem(cacheKey, JSON.stringify(data)); } catch (_) { /* quota */ }
        return data;
      })
      .finally(() => { if (timer) clearTimeout(timer); });
  }

  function byLabel(a, b) { return a.label.localeCompare(b.label); }

  function fillSelect(select, items, placeholder) {
    select.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = placeholder;
    select.appendChild(ph);
    items.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.code;
      opt.textContent = item.label;
      opt.dataset.name = item.name !== undefined ? item.name : item.label;
      select.appendChild(opt);
    });
    select.disabled = items.length === 0;
  }

  function setSelectLoading(select) {
    select.innerHTML = '<option value="">Loading...</option>';
    select.disabled = true;
  }

  function selectedName(select) {
    if (!select || !select.value) return '';
    const opt = select.options[select.selectedIndex];
    return opt ? (opt.dataset.name || opt.textContent).trim() : '';
  }

  function toItems(list) {
    return list.map(x => ({ code: x.code, label: x.name })).sort(byLabel);
  }

  function showBarangayTextInput(show) {
    addr.barangay.style.display = show ? 'none' : '';
    addr.barangayText.style.display = show ? '' : 'none';
    if (!show) addr.barangayText.value = '';
  }

  function resetAddressBelow(level) {
    if (level === 'region') {
      regionCities = [];
      addr.provinceGroup.style.display = '';
      fillSelect(addr.province, [], 'Select Province');
    }
    if (level === 'region' || level === 'province') {
      fillSelect(addr.city, [], 'Select City / Municipality');
    }
    fillSelect(addr.barangay, [], 'Select Barangay');
    showBarangayTextInput(false);
  }

  function enableManualAddress(err) {
    console.warn('PH address list unavailable, switching to manual address entry:', err);
    addressManualMode = true;
    if (addr.grid) addr.grid.style.display = 'none';
    if (addr.manualGroup) addr.manualGroup.style.display = '';
  }

  function initAddressSelector() {
    if (!addr.region) return;

    psgcFetch('/regions/')
      .then(regions => {
        const items = regions
          .slice()
          .sort((a, b) => String(a.code).localeCompare(String(b.code)))
          .map(r => ({
            code:  r.code,
            name:  r.name,
            label: r.regionName && r.regionName !== r.name ? `${r.regionName} – ${r.name}` : r.name
          }));
        fillSelect(addr.region, items, 'Select Region');
      })
      .catch(enableManualAddress);

    addr.region.addEventListener('change', () => {
      const code = addr.region.value;
      resetAddressBelow('region');
      if (!code) return;
      setSelectLoading(addr.province);

      Promise.all([
        psgcFetch(`/regions/${code}/provinces/`),
        psgcFetch(`/regions/${code}/cities-municipalities/`)
      ]).then(([provinces, cities]) => {
        if (addr.region.value !== code) return; // region changed meanwhile
        regionCities = cities;

        if (provinces.length === 0) {
          // e.g. NCR has no provinces — go straight to cities
          addr.provinceGroup.style.display = 'none';
          fillSelect(addr.province, [], 'Select Province');
          fillSelect(addr.city, toItems(cities), 'Select City / Municipality');
          return;
        }

        const items = toItems(provinces);
        // Highly urbanized / independent cities are not under any province
        if (cities.some(c => !c.provinceCode)) {
          items.push({ code: INDEPENDENT_CITIES, label: 'Independent / Highly Urbanized Cities', name: '' });
        }
        fillSelect(addr.province, items, 'Select Province');
      }).catch(enableManualAddress);
    });

    addr.province.addEventListener('change', () => {
      const code = addr.province.value;
      resetAddressBelow('province');
      if (!code) return;
      const list = regionCities.filter(c =>
        code === INDEPENDENT_CITIES ? !c.provinceCode : c.provinceCode === code
      );
      fillSelect(addr.city, toItems(list), 'Select City / Municipality');
    });

    addr.city.addEventListener('change', () => {
      const code = addr.city.value;
      resetAddressBelow('city');
      if (!code) return;
      setSelectLoading(addr.barangay);

      psgcFetch(`/cities-municipalities/${code}/barangays/`)
        .then(barangays => {
          if (addr.city.value !== code) return;
          if (!barangays.length) {
            fillSelect(addr.barangay, [], 'Select Barangay');
            showBarangayTextInput(true);
            return;
          }
          fillSelect(addr.barangay, toItems(barangays), 'Select Barangay');
        })
        .catch(err => {
          console.warn('Could not load barangays, allowing manual entry:', err);
          if (addr.city.value !== code) return;
          fillSelect(addr.barangay, [], 'Select Barangay');
          showBarangayTextInput(true);
        });
    });

    if (extForm) {
      extForm.addEventListener('reset', () => {
        setTimeout(() => { if (!addressManualMode) resetAddressBelow('region'); }, 0);
      });
    }
  }

  // Validate the address fields and build the combined address string
  function collectExtAddress() {
    if (addressManualMode) {
      const value = addr.manual.value.trim();
      if (!value) { showError('extAddressError'); return { valid: false }; }
      return { valid: true, address: value, parts: null };
    }

    let valid = true;
    const needsProvince = addr.provinceGroup.style.display !== 'none';
    const barangayIsText = addr.barangayText.style.display !== 'none';

    if (!addr.region.value)                  { showError('extRegionError');   valid = false; }
    if (needsProvince && !addr.province.value) { showError('extProvinceError'); valid = false; }
    if (!addr.city.value)                    { showError('extCityError');     valid = false; }

    const barangay = barangayIsText ? addr.barangayText.value.trim() : selectedName(addr.barangay);
    if (!barangay) {
      showError('extBarangayError', barangayIsText ? 'Please type your barangay' : 'Please select a barangay');
      valid = false;
    }

    const street = addr.street.value.trim();
    if (!street) { showError('extStreetError'); valid = false; }

    if (!valid) return { valid: false };

    const parts = {
      region:   selectedName(addr.region),
      province: needsProvince && addr.province.value !== INDEPENDENT_CITIES ? selectedName(addr.province) : '',
      city:     selectedName(addr.city),
      barangay: barangay,
      street:   street
    };
    const barangayLabel = /^(brgy\.?|barangay)\s/i.test(barangay) ? barangay : `Brgy. ${barangay}`;
    const address = [parts.street, barangayLabel, parts.city, parts.province, parts.region]
      .filter(Boolean)
      .join(', ');

    return { valid: true, address, parts };
  }

  initAddressSelector();

  // ============================================================
  // INTERNAL FORM SUBMISSION
  // ============================================================
  if (intForm) {
    intForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Form submission time restriction (8 AM - 5 PM)
      const currentHour = new Date().getHours();
      if (currentHour < 8 || currentHour >= 17) {
        alert('Bookings can only be submitted during working hours (8:00 AM - 5:00 PM).');
        return;
      }

      clearErrors('int');

      // Gather values (names are stored in uppercase)
      const firstName     = document.getElementById('intFirstName').value.trim().toUpperCase();
      const lastName      = document.getElementById('intLastName').value.trim().toUpperCase();
      const middleInitial = document.getElementById('intMiddleInitial').value.trim().toUpperCase();
      const departmentRaw = document.getElementById('intDepartment').value;
      const collegeSchool = intCollegeSchoolEl ? intCollegeSchoolEl.value : '';
      let finalDepartment = departmentRaw;
      const employeeId    = document.getElementById('intEmployeeId').value.trim();
      const email         = document.getElementById('intEmail').value.trim();
      const facilityChoice= document.getElementById('intFacility').value;
      const isVehicle     = facilityChoice === VEHICLE_OPTION;
      // Vehicle bookings keep facility empty (same data shape as before)
      const facility      = isVehicle ? '' : facilityChoice;
      const startDate     = document.getElementById('intStartDate').value;
      const endDate       = document.getElementById('intEndDate').value;
      const startTime     = document.getElementById('intStartTime').value;
      const endTime       = document.getElementById('intEndTime').value;
      const numPersonsRaw = document.getElementById('intNumPersons').value.trim();
      const numPersons    = isValidPersonCount(numPersonsRaw) ? String(parseInt(numPersonsRaw, 10)) : numPersonsRaw;
      const vehicle       = isVehicle ? getCheckedEquipment('vehicle') : [];
      let   destination   = document.getElementById('intDestination').value.trim();
      const purpose       = document.getElementById('intPurpose').value.trim();
      const equipment     = getEquipmentWithQuantities('equipment');
      const considerations= document.getElementById('intConsiderations').value.trim();

      // Destination only applies to vehicle bookings
      if (!isVehicle) {
        destination = '';
        document.getElementById('intDestination').value = '';
      }

      // Validate
      let valid = true;
      if (!firstName)                    { showError('intFirstNameError');     valid = false; }
      if (!lastName)                     { showError('intLastNameError');      valid = false; }
      if (!middleInitial)                { showError('intMiddleInitialError'); valid = false; }
      if (!departmentRaw) {
        showError('intDepartmentError');
        valid = false;
      } else if (departmentRaw === 'College') {
        if (!collegeSchool) {
          showError('intCollegeSchoolError');
          valid = false;
        } else {
          finalDepartment = collegeSchool;
        }
      }
      if (!employeeId)                   { showError('intEmployeeIdError'); valid = false; }
      if (!email || !isValidEmail(email)) { showError('intEmailError');     valid = false; }
      if (!facilityChoice)               { showError('intFacilityError');   valid = false; }
      if (!validateSchedule('int', startDate, endDate, startTime, endTime)) valid = false;
      if (!isValidPersonCount(numPersonsRaw)) { showError('intNumPersonsError'); valid = false; }
      if (isVehicle && vehicle.length === 0)  { showError('intFacilityVehicleError'); valid = false; }
      if (isVehicle && !destination)          { showError('intDestinationError'); valid = false; }
      if (!purpose)                      { showError('intPurposeError');   valid = false; }

      if (!valid) {
        focusFirstError(intForm);
        return;
      }

      // Disable submit
      const btn = document.getElementById('intSubmitBtn');
      btn.innerHTML = '<span class="spinner"></span> Submitting...';
      btn.classList.add('loading');

      const refId = generateRefId();
      const combinedName = formatCombinedName(lastName, firstName, middleInitial);

      try {
        await db.collection('bookings').add({
          userType:         'Internal',
          firstName:        firstName,
          lastName:         lastName,
          middleInitial:    middleInitial,
          name:             combinedName,
          department:       finalDepartment,
          parentDepartment: departmentRaw,
          collegeSchool:    departmentRaw === 'College' ? collegeSchool : '',
          employeeId:       employeeId,
          email:            email,
          facility:         facility,
          date:             startDate,
          startDate:        startDate,
          endDate:          endDate,
          startTime:        startTime,
          endTime:          endTime,
          numPersons:       numPersons,
          purpose:          purpose,
          equipment:        equipment,
          vehicle:          vehicle,
          destination:      destination,
          considerations:   considerations,
          status:           'Pending',
          referenceId:      refId,
          createdAt:        firebase.firestore.FieldValue.serverTimestamp()
        });

        const bookingData = {
          referenceId:      refId,
          firstName:        firstName,
          lastName:         lastName,
          middleInitial:    middleInitial,
          name:             combinedName,
          department:       finalDepartment,
          parentDepartment: departmentRaw,
          collegeSchool:    departmentRaw === 'College' ? collegeSchool : '',
          employeeId:       employeeId,
          email:            email,
          facility:      facility,
          date:          formatDateRange(startDate, endDate),
          startDate:     startDate,
          endDate:       endDate,
          startTime:     startTime,
          endTime:       endTime,
          numPersons:    numPersons,
          purpose:       purpose,
          equipment:     equipment,
          vehicle:       vehicle,
          destination:   destination,
          considerations:considerations
        };
        generateInternalBookingPDF(bookingData);

        bookingRefId.textContent = refId;
        successModal.classList.add('visible');
        intForm.reset();
      } catch (err) {
        console.error('Submission error:', err);
        alert('Failed to submit reservation. Please make sure Firebase is configured correctly.');
      } finally {
        btn.innerHTML = 'Submit Reservation';
        btn.classList.remove('loading');
      }
    });
  }

  // ============================================================
  // EXTERNAL FORM SUBMISSION
  // ============================================================
  if (extForm) {
    extForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Form submission time restriction (8 AM - 5 PM)
      const currentHour = new Date().getHours();
      if (currentHour < 8 || currentHour >= 17) {
        alert('Bookings can only be submitted during working hours (8:00 AM - 5:00 PM).');
        return;
      }

      clearErrors('ext');

      const firstName       = document.getElementById('extFirstName').value.trim().toUpperCase();
      const lastName        = document.getElementById('extLastName').value.trim().toUpperCase();
      const middleInitial   = document.getElementById('extMiddleInitial').value.trim().toUpperCase();
      const agencyTypeRaw   = document.getElementById('extAgencyType').value;
      const agencyTypeOther = document.getElementById('extAgencyTypeOther').value.trim();
      const agencyType      = (agencyTypeRaw.startsWith('Other') && agencyTypeOther) ? agencyTypeOther : agencyTypeRaw;
      const agencyName      = document.getElementById('extAgencyName').value.trim();
      const officeName      = document.getElementById('extOfficeName').value.trim();
      const contact         = document.getElementById('extContact').value.trim();
      const email           = document.getElementById('extEmail').value.trim();
      const facility        = document.getElementById('extFacility').value;
      const startDate       = document.getElementById('extStartDate').value;
      const endDate         = document.getElementById('extEndDate').value;
      const startTime       = document.getElementById('extStartTime').value;
      const endTime         = document.getElementById('extEndTime').value;
      const numPersonsRaw   = document.getElementById('extNumPersons').value.trim();
      const numPersons      = isValidPersonCount(numPersonsRaw) ? String(parseInt(numPersonsRaw, 10)) : numPersonsRaw;
      const purpose         = document.getElementById('extPurpose').value.trim();
      const equipment       = getEquipmentWithQuantities('extEquipment');
      const otherEquipment  = document.getElementById('extOtherEquipment').value.trim();
      const considerations  = document.getElementById('extConsiderations').value.trim();

      let valid = true;
      if (!firstName)                    { showError('extFirstNameError');     valid = false; }
      if (!lastName)                     { showError('extLastNameError');      valid = false; }
      if (!middleInitial)                { showError('extMiddleInitialError'); valid = false; }
      if (!agencyTypeRaw)                { showError('extAgencyTypeError');    valid = false; }
      if (agencyTypeRaw.startsWith('Other') && !agencyTypeOther) { showError('extAgencyTypeOtherError'); valid = false; }
      if (!agencyName)                   { showError('extAgencyNameError');    valid = false; }
      if (!officeName)                   { showError('extOfficeNameError');    valid = false; }
      if (!contact)                      { showError('extContactError');   valid = false; }
      else if (!isDigitsOnly(contact))   { showError('extContactError', 'Contact must be numbers only.'); valid = false; }
      const addressInfo = collectExtAddress();
      if (!addressInfo.valid)            { valid = false; }
      if (!email || !isValidEmail(email)) { showError('extEmailError');    valid = false; }
      if (!facility)                     { showError('extFacilityError');  valid = false; }
      if (!validateSchedule('ext', startDate, endDate, startTime, endTime)) valid = false;
      if (!isValidPersonCount(numPersonsRaw)) { showError('extNumPersonsError'); valid = false; }
      if (!purpose)                      { showError('extPurposeError');  valid = false; }

      if (!valid) {
        focusFirstError(extForm);
        return;
      }

      const address = addressInfo.address;

      const btn = document.getElementById('extSubmitBtn');
      btn.innerHTML = '<span class="spinner"></span> Submitting...';
      btn.classList.add('loading');

      const refId = generateRefId();
      const combinedName = formatCombinedName(lastName, firstName, middleInitial);
      const combinedOrg = `${agencyName} - ${officeName}`;

      try {
        await db.collection('bookings').add({
          userType:      'External',
          firstName:     firstName,
          lastName:      lastName,
          middleInitial: middleInitial,
          contactPerson: combinedName,
          name:          combinedName,
          agencyType:    agencyType,
          agencyName:    agencyName,
          officeName:    officeName,
          organization:  combinedOrg,
          agency:        agencyName,
          contactNumber: contact,
          address:       address,
          addressDetails: addressInfo.parts,
          email:         email,
          facility:      facility,
          date:          startDate,
          startDate:     startDate,
          endDate:       endDate,
          startTime:     startTime,
          endTime:       endTime,
          numPersons:    numPersons,
          purpose:       purpose,
          equipment:     equipment,
          otherEquipment:otherEquipment,
          considerations:considerations,
          status:        'Pending Payment',
          referenceId:   refId,
          createdAt:     firebase.firestore.FieldValue.serverTimestamp()
        });

        // Generate PDF
        const bookingData = {
          referenceId:   refId,
          firstName:     firstName,
          lastName:      lastName,
          middleInitial: middleInitial,
          contactPerson: combinedName,
          name:          combinedName,
          agencyType,
          agencyName,
          officeName,
          agency:        agencyName,
          organization:  combinedOrg,
          contact, address, email,
          facility, startTime, endTime, numPersons,
          date: formatDateRange(startDate, endDate),
          startDate, endDate,
          purpose, equipment, otherEquipment, considerations
        };
        generateBookingPDF(bookingData);

        // Send confirmation email via consolidated template
        sendConfirmationEmail(bookingData);

        // Show external success modal
        if (extBookingRefId) extBookingRefId.textContent = refId;
        if (extSuccessModal) extSuccessModal.classList.add('visible');
        extForm.reset();
      } catch (err) {
        console.error('Submission error:', err);
        alert('Failed to submit reservation. Please make sure Firebase is configured correctly.');
      } finally {
        btn.innerHTML = 'Submit Reservation';
        btn.classList.remove('loading');
      }
    });
  }

  // ============================================================
  // PDF GENERATION (jsPDF)
  // ============================================================
  function generateBookingPDF(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    try {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.src = 'images/logo.jpg';

      logoImg.onload = function() {
        buildPdfContent(doc, data, logoImg);
      };
      logoImg.onerror = function() {
        buildPdfContent(doc, data, null);
      };
    } catch (e) {
      console.warn('Could not load logo for PDF:', e);
      buildPdfContent(doc, data, null);
    }
  }

  function buildPdfContent(doc, data, logoImg) {
    let startY = 15;
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('IF 513\nRevised: 2011', 15, startY);
    
    if (logoImg) doc.addImage(logoImg, 'JPEG', 65, startY - 3, 15, 15);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('SAN ISIDRO COLLEGE', 105, startY + 2, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('City of Malaybalay', 105, startY + 7, { align: 'center' });
    
    doc.text('RUF-EU Control No.: ' + data.referenceId, 140, startY);
    
    let y = startY + 25;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('REQUEST FOR THE USE OF FACILITIES', 105, y, { align: 'center' });
    doc.setFontSize(10);
    doc.text('[For External Users]', 105, y + 5, { align: 'center' });
    
    y += 15;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const dateFiled = new Date().toLocaleDateString();
    doc.text('Date Filed: ' + dateFiled, 140, y);
    
    y += 10;
    doc.text('[Please check the facilities to be requested.]', 15, y);
    
    y += 5;
    const facilitiesLeft = ['Gymnasium', 'SMDC Conference Room', 'Chapel', 'Guest House/College H.E.'];
    const facilitiesCenter = ['Student Center', 'Field/Oval', 'Classroom'];
    const facilitiesRight = ['Defense Room'];
    
    let leftY = y;
    facilitiesLeft.forEach(f => {
      doc.rect(15, leftY - 3, 3, 3);
      if (data.facility === f || (f === 'Chapel' && data.facility.includes('Chapel'))) doc.text('x', 15.5, leftY - 0.5);
      doc.text(f, 20, leftY);
      leftY += 6;
    });
    
    let centerY = y;
    facilitiesCenter.forEach(f => {
      doc.rect(70, centerY - 3, 3, 3);
      if (data.facility === f) doc.text('x', 70.5, centerY - 0.5);
      doc.text(f, 75, centerY);
      centerY += 6;
    });
    
    let rightY = y;
    facilitiesRight.forEach(f => {
      doc.rect(125, rightY - 3, 3, 3);
      if (data.facility === f) doc.text('x', 125.5, rightY - 0.5);
      doc.text(f, 130, rightY);
      rightY += 6;
    });
    
    y = Math.max(leftY, centerY, rightY) + 5;
    
    const rowHeight = 12;
    
    // Row 1
    doc.rect(15, y, 180, rowHeight);
    doc.line(65, y, 65, y + rowHeight);
    doc.text('Name of Contact\nPerson', 17, y + 5);
    const contactPersonText = (data.lastName || data.firstName)
      ? formatCombinedName(data.lastName, data.firstName, data.middleInitial)
      : (data.contactPerson || data.name || '');
    doc.text(doc.splitTextToSize(contactPersonText, 125), 67, y + 7);
    y += rowHeight;
    
    // Row 2: Agency / Organization & Office
    doc.rect(15, y, 180, rowHeight);
    doc.line(65, y, 65, y + rowHeight);
    doc.text('Name of\nAgency/Organization', 17, y + 5);
    const orgLine1 = data.agencyName || data.agency || '';
    const orgDetails = [
      data.officeName ? `Office: ${data.officeName}` : '',
      data.agencyType ? `(${data.agencyType})` : ''
    ].filter(Boolean).join(' • ');
    const fullOrgText = orgDetails ? `${orgLine1}\n${orgDetails}` : orgLine1;
    doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(fullOrgText, 125), 67, orgDetails ? y + 4.5 : y + 7);
    doc.setFontSize(10);
    y += rowHeight;
    
    // Row 3
    doc.rect(15, y, 180, rowHeight);
    doc.line(65, y, 65, y + rowHeight);
    doc.text('Address', 17, y + 7);
    doc.text(data.address || '', 67, y + 7);
    y += rowHeight;
    
    // Row 4
    doc.rect(15, y, 180, rowHeight);
    doc.line(65, y, 65, y + rowHeight);
    doc.text('Contact Number/s', 17, y + 7);
    doc.text(data.contact || '', 67, y + 7);
    y += rowHeight;
    
    // Row 5
    doc.rect(15, y, 180, rowHeight);
    doc.line(65, y, 65, y + rowHeight);
    doc.text('Purpose / Activity', 17, y + 7);
    doc.text(doc.splitTextToSize(data.purpose || '', 125), 67, y + 5);
    y += rowHeight;
    
    // Row 6
    doc.rect(15, y, 180, rowHeight);
    doc.line(65, y, 65, y + rowHeight);
    doc.line(110, y, 110, y + rowHeight);
    doc.line(140, y, 140, y + rowHeight);
    doc.text('Date of Use', 17, y + 7);
    doc.text(data.date || '', 67, y + 7);
    doc.text('Time of Use', 112, y + 7);
    const formattedTimeRange = (data.startTime && data.endTime)
      ? `${formatTime12(data.startTime)} - ${formatTime12(data.endTime)}`
      : (data.startTime || data.endTime || '—');
    doc.text(formattedTimeRange, 142, y + 7);
    y += rowHeight;
    
    // Row 7
    doc.rect(15, y, 180, rowHeight);
    doc.line(65, y, 65, y + rowHeight);
    doc.text('Number of Persons', 17, y + 7);
    doc.text(String(data.numPersons || ''), 67, y + 7);
    y += rowHeight;
    
    // Row 8
    const eqRowHeight = 20;
    doc.rect(15, y, 180, eqRowHeight);
    doc.line(65, y, 65, y + eqRowHeight);
    doc.text('Equipment/Resources\nNeeded', 17, y + 7);
    const equipStr = (data.equipment || []).map(e => typeof e === 'string' ? e : `${e.item}(x${e.qty})`).join(', ');
    const allEqStr = equipStr + (data.otherEquipment ? (equipStr ? ', ' : '') + data.otherEquipment : '');
    doc.text(doc.splitTextToSize(allEqStr || 'None', 125), 67, y + 7);
    y += eqRowHeight;
    
    // Row 9 (Other Considerations)
    const obsRowHeight = 25;
    doc.rect(15, y, 180, obsRowHeight);
    doc.line(65, y, 65, y + obsRowHeight);
    doc.text('Other Considerations', 17, y + 12);
    doc.text(doc.splitTextToSize(data.considerations || 'None', 125), 67, y + 7);
    y += obsRowHeight;
    
    y += 5;
    doc.setFontSize(8);
    doc.text('[Note: Users are accountable for whatever damages during the activity.]', 15, y);
    
    y += 25;
    doc.line(130, y, 195, y);
    doc.text('Name & Signature of Requesting Person', 162.5, y + 4, { align: 'center' });
    
    y += 20;
    doc.text('Noted:', 15, y - 5);
    doc.line(25, y, 75, y);
    doc.text('Facility In-Charge', 50, y + 4, { align: 'center' });
    
    doc.line(85, y, 135, y);
    doc.text('Finance Officer', 110, y + 4, { align: 'center' });
    
    doc.text('Approved:', 140, y - 5);
    doc.line(140, y, 195, y);
    doc.text('Vice President for', 167.5, y + 4, { align: 'center' });
    doc.text('Administration & Finance', 167.5, y + 8, { align: 'center' });
    
    y += 15;
    doc.setFontSize(7);
    doc.text('Note: Accomplish in 4 copies: Requesting Person, School Guard, Facility In-Charge, Finance Officer', 15, y);
    
    doc.addPage();
    doc.setDrawColor(230, 81, 0);
    doc.setFillColor(255, 243, 224);
    doc.roundedRect(15, 20, 180, 30, 3, 3, 'FD');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(230, 81, 0);
    doc.text('IMPORTANT INSTRUCTIONS:', 20, 28);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    const noteText = 'Please print the Booking Form on the previous page in 4 copies and present it to the Business Office of San Isidro College for payment assessment. The price will be determined by the Business Office. After payment, upload your receipt on the booking page to confirm your reservation.';
    const noteLines = doc.splitTextToSize(noteText, 170);
    doc.text(noteLines, 20, 34);
    
    lastGeneratedPdf = doc;
    doc.save('SIC_Booking_' + data.referenceId + '.pdf');
  }

  // Download PDF button handler
  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', () => {
      if (lastGeneratedPdf) {
        const refId = extBookingRefId ? extBookingRefId.textContent : 'booking';
        lastGeneratedPdf.save('SIC_Booking_' + refId + '.pdf');
      }
    });
  }

  const downloadInternalPdfBtn = document.getElementById('downloadInternalPdfBtn');
  if (downloadInternalPdfBtn) {
    downloadInternalPdfBtn.addEventListener('click', () => {
      if (lastGeneratedPdf) {
        const refId = bookingRefId ? bookingRefId.textContent : 'booking';
        lastGeneratedPdf.save('SIC_Internal_Booking_' + refId + '.pdf');
      }
    });
  }

  // ============================================================
  // INTERNAL PDF GENERATION (jsPDF)
  // ============================================================
  function generateInternalBookingPDF(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.src = 'images/logo.jpg';

      logoImg.onload = function() {
        buildInternalPdfContent(doc, data, logoImg);
      };
      logoImg.onerror = function() {
        buildInternalPdfContent(doc, data, null);
      };
    } catch (e) {
      console.warn('Could not load logo for PDF:', e);
      buildInternalPdfContent(doc, data, null);
    }
  }

  function buildInternalPdfContent(doc, data, logoImg) {
    drawInternalFormCopy(doc, data, logoImg, 10);
    
    doc.setDrawColor(150, 150, 150);
    doc.setLineDashPattern([3, 3], 0);
    doc.line(10, 148, 200, 148);
    doc.setLineDashPattern([], 0);
    
    drawInternalFormCopy(doc, data, logoImg, 155);
    
    lastGeneratedPdf = doc;
    doc.save('SIC_Internal_Booking_' + data.referenceId + '.pdf');
  }

  function drawInternalFormCopy(doc, data, logoImg, startY) {
    if (logoImg) doc.addImage(logoImg, 'JPEG', 70, startY, 12, 12);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('SAN ISIDRO COLLEGE', 105, startY + 5, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('City of Malaybalay', 105, startY + 9, { align: 'center' });
    
    doc.text('RFUFVE Control No. ' + data.referenceId, 150, startY + 7);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('REQUEST FOR THE USE OF FACILITIES, VEHICLE & EQUIPMENT', 105, startY + 16, { align: 'center' });
    
    doc.setFontSize(8);
    let y = startY + 22;
    
    doc.setFont('helvetica', 'bold');
    doc.text('FACILITY', 15, y);
    doc.text('VEHICLE', 155, y);
    doc.setFont('helvetica', 'normal');
    
    const facilitiesLeft = ['Gymnasium', 'SMDC Conference Room', 'OMPH&SSTJ Chapel', 'Guest House/College H.E.', 'Board Room', 'Others (please specify)'];
    const facilitiesRight = ['Student Center', 'Field/Oval', 'Sound System', 'Class room', 'Laboratory'];
    
    let leftY = y + 4;
    facilitiesLeft.forEach(f => {
      doc.rect(15, leftY - 3, 3, 3);
      if (data.facility === f || (f === 'Others (please specify)' && data.facility && !facilitiesLeft.includes(data.facility) && !facilitiesRight.includes(data.facility))) {
        doc.text('x', 15.5, leftY - 0.5);
      }
      doc.text(f === 'Others (please specify)' && data.facility && !facilitiesLeft.includes(data.facility) && !facilitiesRight.includes(data.facility) ? 'Others: ' + data.facility : f, 20, leftY);
      leftY += 4.5;
    });
    
    let rightY = y + 4;
    facilitiesRight.forEach(f => {
      doc.rect(60, rightY - 3, 3, 3);
      if (data.facility === f) doc.text('x', 60.5, rightY - 0.5);
      doc.text(f, 65, rightY);
      rightY += 4.5;
    });
    let vY = y + 4;
    const vehicleList = ['Toyota Grandia Van', 'KIA Utility Van'];
    vehicleList.forEach(v => {
      doc.rect(155, vY - 3, 3, 3);
      if (data.vehicle && data.vehicle.includes(v)) doc.text('x', 155.5, vY - 0.5);
      doc.text(v, 160, vY);
      vY += 4.5;
    });
    
    y = Math.max(leftY, rightY, vY) + 2;
    
    doc.rect(15, y, 180, 42);
    
    doc.line(65, y, 65, y + 42);
    doc.line(15, y + 7, 195, y + 7);
    doc.line(15, y + 14, 195, y + 14);
    doc.line(15, y + 21, 135, y + 21);
    doc.line(15, y + 28, 195, y + 28);
    doc.line(15, y + 35, 195, y + 35);
    
    doc.line(135, y, 135, y + 7);
    doc.line(135, y + 14, 135, y + 35);
    
    doc.text('Name of Requesting Person', 17, y + 5);
    const requestingPersonText = (data.lastName || data.firstName)
      ? formatCombinedName(data.lastName, data.firstName, data.middleInitial)
      : (data.name || '');
    doc.text(doc.splitTextToSize(requestingPersonText, 65), 67, y + 5);
    doc.text('Date:', 137, y + 5);
    
    doc.text('Purpose / Activity', 17, y + 12);
    doc.text(doc.splitTextToSize(data.purpose || '', 125), 67, y + 11);
    
    doc.text('Date & Time of Use', 17, y + 19);
    const internalTimeRange = (data.startTime && data.endTime)
      ? `${formatTime12(data.startTime)} - ${formatTime12(data.endTime)}`
      : (data.startTime || data.endTime || '—');
    doc.text(`${data.date || ''} | ${internalTimeRange}`, 67, y + 19);
    doc.text('Destination', 137, y + 19);
    doc.text('(For Vehicle Only)', 137, y + 23);
    
    doc.text('Number of Persons', 17, y + 26);
    doc.text(String(data.numPersons || ''), 67, y + 26);
    doc.text(doc.splitTextToSize(data.destination || '', 55), 137, y + 27);
    
    doc.text('Equipment/Resources Needed', 17, y + 33);
    const equipStr = (data.equipment || []).map(e => typeof e === 'string' ? e : `${e.item}(x${e.qty})`).join(', ');
    doc.text(doc.splitTextToSize(equipStr || '', 65), 67, y + 32);
    doc.text('Driver', 137, y + 33);
    
    doc.text('Other Considerations', 17, y + 40);
    doc.text(doc.splitTextToSize(data.considerations || 'None', 125), 67, y + 40);
    
    y += 50;
    doc.text('Noted:', 15, y);
    doc.line(25, y + 1, 75, y + 1);
    doc.text('Dean/Principal/Office Head', 50, y + 4, { align: 'center' });
    
    doc.line(125, y + 1, 190, y + 1);
    doc.text('Name & Signature of the Requesting Personnel', 157.5, y + 4, { align: 'center' });
    
    y += 10;
    doc.line(125, y + 1, 190, y + 1);
    doc.text('Facilities In-charge', 157.5, y + 4, { align: 'center' });
    
    y += 10;
    doc.text('Verified:', 15, y);
    doc.line(28, y + 1, 75, y + 1);
    doc.text('Comptroller', 51.5, y + 4, { align: 'center' });
    
    doc.text('Approved:', 90, y);
    doc.line(105, y + 1, 175, y + 1);
    doc.text('General Admin Services Coordinator', 140, y + 4, { align: 'center' });
    
    y += 8;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.text('Note: Accomplish in 2 copies: Requesting person, Facilities In-charge', 15, y);
  }

  // ============================================================
  // SEND CONFIRMATION EMAIL (Consolidated EmailJS Template)
  // ============================================================
  function sendConfirmationEmail(data) {
    if (!EMAILJS_SERVICE_ID || EMAILJS_SERVICE_ID.startsWith('YOUR_')) {
      console.log('EmailJS not configured — skipping confirmation email.');
      return;
    }

    try {
      // Use the approve template (consolidated as a generic notification template)
      emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_APPROVE, {
        to_email:     data.email,
        to_name:      data.contactPerson,
        facility:     data.facility,
        date:         data.date,
        start_time:   formatTime12(data.startTime),
        end_time:     formatTime12(data.endTime),
        purpose:      data.purpose,
        status:       'Booking Submitted',
        reference_id: data.referenceId,
        message:      'Your reservation request (Ref: ' + data.referenceId + ') has been submitted successfully. Please print the downloaded PDF booking summary and present it to the Business Office of San Isidro College for payment assessment. After paying, return to the booking page and upload your receipt to confirm your reservation.'
      }).then(() => {
        console.log('Confirmation email sent to', data.email);
      }).catch(err => {
        console.warn('EmailJS send failed:', err);
      });
    } catch (e) {
      console.warn('EmailJS error:', e);
    }
  }

  // ============================================================
  // RECEIPT UPLOAD LOGIC
  // ============================================================
  const receiptFileInput = document.getElementById('receiptFileInput');
  const receiptDropZone  = document.getElementById('receiptDropZone');
  const receiptFileName  = document.getElementById('receiptFileName');

  // File selection handler
  if (receiptFileInput) {
    receiptFileInput.addEventListener('change', () => {
      const file = receiptFileInput.files[0];
      if (file) {
        if (receiptFileName) {
          receiptFileName.textContent = '✓ ' + file.name;
          receiptFileName.style.display = 'block';
        }
        if (receiptDropZone) receiptDropZone.classList.add('has-file');
      }
    });
  }

  // Drag & drop
  if (receiptDropZone) {
    receiptDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      receiptDropZone.style.borderColor = 'var(--navy)';
    });
    receiptDropZone.addEventListener('dragleave', () => {
      receiptDropZone.style.borderColor = '';
    });
    receiptDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      receiptDropZone.style.borderColor = '';
      if (e.dataTransfer.files.length > 0) {
        receiptFileInput.files = e.dataTransfer.files;
        const event = new Event('change');
        receiptFileInput.dispatchEvent(event);
      }
    });
  }

  // Receipt form submission
  if (receiptForm) {
    receiptForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Clear previous errors
      ['receiptRefIdError', 'receiptEmailError', 'receiptFileError'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('visible');
      });

      const refId = document.getElementById('receiptRefId').value.trim();
      const email = document.getElementById('receiptEmail').value.trim();
      const file  = receiptFileInput ? receiptFileInput.files[0] : null;

      let valid = true;
      if (!refId) { showError('receiptRefIdError'); valid = false; }
      if (!email || !isValidEmail(email)) { showError('receiptEmailError'); valid = false; }
      if (!file) { showError('receiptFileError'); valid = false; }

      // Check file size (5MB max)
      if (file && file.size > 5 * 1024 * 1024) {
        const errEl = document.getElementById('receiptFileError');
        if (errEl) {
          errEl.textContent = 'File size must be under 5MB';
          showError('receiptFileError');
        }
        valid = false;
      }

      if (!valid) return;

      const btn = document.getElementById('receiptSubmitBtn');
      btn.innerHTML = '<span class="spinner"></span> Verifying...';
      btn.classList.add('loading');

      try {
        // Query Firestore for matching booking
        const snapshot = await db.collection('bookings')
          .where('referenceId', '==', refId)
          .where('email', '==', email)
          .get();

        if (snapshot.empty) {
          alert('No booking found with that Reference ID and Email. Please check your details and try again.');
          return;
        }

        const bookingDoc = snapshot.docs[0];
        const bookingData = bookingDoc.data();

        if (bookingData.status !== 'Pending Payment') {
          if (bookingData.status === 'Payment Under Review') {
            alert('A receipt has already been uploaded for this booking. Please wait for admin approval.');
          } else if (bookingData.status === 'Approved') {
            alert('This booking has already been approved.');
          } else {
            alert('This booking cannot accept a receipt upload at this time. Current status: ' + bookingData.status);
          }
          return;
        }

        // Compress image and convert to Base64 (to fit under Firestore 1MB document limit)
        btn.innerHTML = '<span class="spinner"></span> Processing...';
        
        const base64DataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const MAX_WIDTH = 800;
              const MAX_HEIGHT = 800;
              let width = img.width;
              let height = img.height;

              if (width > height) {
                if (width > MAX_WIDTH) {
                  height *= MAX_WIDTH / width;
                  width = MAX_WIDTH;
                }
              } else {
                if (height > MAX_HEIGHT) {
                  width *= MAX_HEIGHT / height;
                  height = MAX_HEIGHT;
                }
              }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              
              // Compress to 0.7 quality JPEG
              const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
              resolve(dataUrl);
            };
            img.onerror = reject;
            img.src = e.target.result;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Save receipt image to separate collection (avoids 1MB doc limit)
        await db.collection('receipts').doc(bookingDoc.id).set({
          imageData: base64DataUrl,
          uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update booking with just status fields (no large base64 in booking doc)
        await db.collection('bookings').doc(bookingDoc.id).update({
          hasReceipt: true,
          status: 'Payment Under Review',
          receiptUploadedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Show success modal
        if (receiptSuccessModal) receiptSuccessModal.classList.add('visible');
        receiptForm.reset();
        if (receiptFileName) { receiptFileName.style.display = 'none'; }
        if (receiptDropZone) receiptDropZone.classList.remove('has-file');

      } catch (err) {
        console.error('Receipt upload error:', err);
        alert('Failed to upload receipt. Please try again. Error: ' + err.message);
      } finally {
        btn.innerHTML = 'Submit Receipt';
        btn.classList.remove('loading');
      }
    });
  }

  // ---- Close modals on overlay click ----
  [successModal, extSuccessModal, receiptSuccessModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('visible');
      });
    }
  });
})();
