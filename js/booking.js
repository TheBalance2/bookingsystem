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
      } else {
        internalForm.style.display = 'none';
        externalForm.style.display = 'block';
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

    // Pre-fill date inputs immediately
    if (prefillDate) {
      const intDate = document.getElementById('intDate');
      const extDate = document.getElementById('extDate');
      if (intDate) intDate.value = prefillDate;
      if (extDate) extDate.value = prefillDate;
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

  // Strip non-digit characters from an input's value (used on input event)
  function stripNonDigitsInput(el) {
    if (!el) return;
    el.addEventListener('input', () => {
      const cleaned = el.value.replace(/\D+/g, '');
      if (el.value !== cleaned) el.value = cleaned;
    });
  }

  function isFutureDate(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(dateStr) >= today;
  }

  function showError(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('visible');
    // Also highlight the input
    const input = el ? el.previousElementSibling : null;
    if (input && (input.tagName === 'INPUT' || input.tagName === 'SELECT' || input.tagName === 'TEXTAREA')) {
      input.classList.add('error');
    }
  }

  function clearErrors(prefix) {
    document.querySelectorAll(`[id^="${prefix}"]`).forEach(el => {
      if (el.classList.contains('error-message')) el.classList.remove('visible');
    });
    document.querySelectorAll(`#${prefix === 'int' ? 'internalForm' : 'externalForm'} input, #${prefix === 'int' ? 'internalForm' : 'externalForm'} select, #${prefix === 'int' ? 'internalForm' : 'externalForm'} textarea`)
      .forEach(inp => inp.classList.remove('error'));
  }

  function getCheckedEquipment(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(cb => cb.value);
  }

  // ============================================================
  // CONFLICT CHECKING
  // ============================================================
  async function checkConflict(facility, date, startTime, endTime, warningId, textId) {
    const warningEl = document.getElementById(warningId);
    const textEl    = document.getElementById(textId);

    if (!facility || !date || !startTime || !endTime) {
      warningEl.classList.remove('visible');
      return false;
    }

    try {
      const snapshot = await db.collection('bookings')
        .where('facility', '==', facility)
        .where('date', '==', date)
        .where('status', 'in', ['Pending', 'Approved'])
        .get();

      let hasConflict = false;

      const newStart = timeToMinutes(startTime);
      const newEnd = timeToMinutes(endTime);

      snapshot.forEach(doc => {
        const d = doc.data();
        const existingStart = timeToMinutes(d.startTime);
        const existingEnd = timeToMinutes(d.endTime);

        // If parsing failed for any time, skip that record
        if (Number.isNaN(existingStart) || Number.isNaN(existingEnd)) return;

        // Time overlap: newStart < existingEnd && newEnd > existingStart
        if (newStart < existingEnd && newEnd > existingStart) {
          hasConflict = true;
        }
      });

      if (hasConflict) {
        textEl.textContent = `${escapeHtml(facility)} already has a booking on ${escapeHtml(date)} that overlaps with ${escapeHtml(startTime)}–${escapeHtml(endTime)}. Your request may be rejected.`;
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

  // Attach conflict check listeners — Internal
  ['intFacility', 'intDate', 'intStartTime', 'intEndTime'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        const facility  = document.getElementById('intFacility').value;
        const date      = document.getElementById('intDate').value;
        const startTime = document.getElementById('intStartTime').value;
        const endTime   = document.getElementById('intEndTime').value;
        checkConflict(facility, date, startTime, endTime, 'intConflictWarning', 'intConflictText');
      });
    }
  });

  // Attach conflict check listeners — External
  ['extFacility', 'extDate', 'extStartTime', 'extEndTime'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        const facility  = document.getElementById('extFacility').value;
        const date      = document.getElementById('extDate').value;
        const startTime = document.getElementById('extStartTime').value;
        const endTime   = document.getElementById('extEndTime').value;
        checkConflict(facility, date, startTime, endTime, 'extConflictWarning', 'extConflictText');
      });
    }
  });

  // Ensure extContact input accepts only digits while typing
  const extContactEl = document.getElementById('extContact');
  if (extContactEl) stripNonDigitsInput(extContactEl);

  // ============================================================
  // SET MIN DATE (today) on date inputs
  // ============================================================
  const today = new Date().toISOString().split('T')[0];
  ['intDate', 'extDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('min', today);
  });

  // ============================================================
  // INTERNAL FORM SUBMISSION
  // ============================================================
  if (intForm) {
    intForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors('int');

      // Gather values
      const name       = document.getElementById('intName').value.trim();
      const department = document.getElementById('intDepartment').value;
      const employeeId = document.getElementById('intEmployeeId').value.trim();
      const email      = document.getElementById('intEmail').value.trim();
      const facility   = document.getElementById('intFacility').value;
      const date       = document.getElementById('intDate').value;
      const startTime  = document.getElementById('intStartTime').value;
      const endTime    = document.getElementById('intEndTime').value;
      const numPersons = document.getElementById('intNumPersons').value;
      const vehicle    = getCheckedEquipment('vehicle');
      const destination= document.getElementById('intDestination').value.trim();
      const purpose    = document.getElementById('intPurpose').value.trim();
      const equipment  = getCheckedEquipment('equipment');
      const considerations = document.getElementById('intConsiderations').value.trim();

      // Validate
      let valid = true;
      if (!name)                         { showError('intNameError');       valid = false; }
      if (!department)                   { showError('intDepartmentError'); valid = false; }
      if (!employeeId)                   { showError('intEmployeeIdError'); valid = false; }
      if (!email || !isValidEmail(email)) { showError('intEmailError');     valid = false; }
      if (!facility && vehicle.length === 0) { showError('intFacilityError');   valid = false; }
      if (!date || !isFutureDate(date))  { showError('intDateError');      valid = false; }
      if (!startTime)                    { showError('intStartTimeError'); valid = false; }
      if (!endTime || endTime <= startTime) { showError('intEndTimeError'); valid = false; }
      if (!numPersons || numPersons < 1) { showError('intNumPersonsError'); valid = false; }
      if (vehicle.length > 0 && !destination) { showError('intDestinationError'); valid = false; }
      if (!purpose)                      { showError('intPurposeError');   valid = false; }

      if (!valid) return;

      // Disable submit
      const btn = document.getElementById('intSubmitBtn');
      btn.innerHTML = '<span class="spinner"></span> Submitting...';
      btn.classList.add('loading');

      const refId = generateRefId();

      try {
        await db.collection('bookings').add({
          userType:    'Internal',
          name:        name,
          department:  department,
          employeeId:  employeeId,
          email:       email,
          facility:    facility,
          date:        date,
          startTime:   startTime,
          endTime:     endTime,
          numPersons:  numPersons,
          purpose:     purpose,
          equipment:   equipment,
          vehicle:     vehicle,
          destination: destination,
          considerations: considerations,
          status:      'Pending',
          referenceId: refId,
          createdAt:   firebase.firestore.FieldValue.serverTimestamp()
        });

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
      clearErrors('ext');

      const contactPerson = document.getElementById('extContactPerson').value.trim();
      const agency     = document.getElementById('extAgency').value.trim();
      const contact    = document.getElementById('extContact').value.trim();
      const address    = document.getElementById('extAddress').value.trim();
      const email      = document.getElementById('extEmail').value.trim();
      const facility   = document.getElementById('extFacility').value;
      const date       = document.getElementById('extDate').value;
      const startTime  = document.getElementById('extStartTime').value;
      const endTime    = document.getElementById('extEndTime').value;
      const numPersons = document.getElementById('extNumPersons').value;
      const purpose    = document.getElementById('extPurpose').value.trim();
      const equipment  = getCheckedEquipment('extEquipment');
      const otherEquipment = document.getElementById('extOtherEquipment').value.trim();
      const considerations = document.getElementById('extConsiderations').value.trim();

      let valid = true;
      if (!contactPerson)                { showError('extContactPersonError'); valid = false; }
      if (!agency)                       { showError('extAgencyError');    valid = false; }
      if (!contact)                      { showError('extContactError');   valid = false; }
      else if (!isDigitsOnly(contact))   { document.getElementById('extContactError').textContent = 'Contact must be numbers only.'; showError('extContactError'); valid = false; }
      if (!address)                      { showError('extAddressError');   valid = false; }
      if (!email || !isValidEmail(email)) { showError('extEmailError');    valid = false; }
      if (!facility)                     { showError('extFacilityError');  valid = false; }
      if (!date || !isFutureDate(date))  { showError('extDateError');     valid = false; }
      if (!startTime)                    { showError('extStartTimeError'); valid = false; }
      if (!endTime || endTime <= startTime) { showError('extEndTimeError'); valid = false; }
      if (!numPersons || numPersons < 1) { showError('extNumPersonsError'); valid = false; }
      if (!purpose)                      { showError('extPurposeError');  valid = false; }

      if (!valid) return;

      const btn = document.getElementById('extSubmitBtn');
      btn.innerHTML = '<span class="spinner"></span> Submitting...';
      btn.classList.add('loading');

      const refId = generateRefId();

      try {
        await db.collection('bookings').add({
          userType:      'External',
          contactPerson: contactPerson,
          name:          contactPerson,
          organization:  agency,
          agency:        agency,
          contactNumber: contact,
          address:       address,
          email:         email,
          facility:      facility,
          date:          date,
          startTime:     startTime,
          endTime:       endTime,
          numPersons:    numPersons,
          purpose:       purpose,
          equipment:     equipment,
          otherEquipment:otherEquipment,
          considerations:considerations,
          status:        'Pending',
          referenceId:   refId,
          createdAt:     firebase.firestore.FieldValue.serverTimestamp()
        });

        bookingRefId.textContent = refId;
        successModal.classList.add('visible');
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

  // ---- Close modal on overlay click ----
  if (successModal) {
    successModal.addEventListener('click', (e) => {
      if (e.target === successModal) successModal.classList.remove('visible');
    });
  }
})();
