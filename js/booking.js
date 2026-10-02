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

  function isAllowedDate(dateStr) {
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 3);
    minDate.setHours(0, 0, 0, 0);
    return new Date(dateStr) >= minDate;
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
  // SET MIN DATE (today + 3 days) on date inputs
  // ============================================================
  const minDateObj = new Date();
  minDateObj.setDate(minDateObj.getDate() + 3);
  const minDateStr = minDateObj.toISOString().split('T')[0];
  ['intDate', 'extDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('min', minDateStr);
  });

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
      let   destination= document.getElementById('intDestination').value.trim();
      const purpose    = document.getElementById('intPurpose').value.trim();
      const equipment  = getEquipmentWithQuantities('equipment');
      const considerations = document.getElementById('intConsiderations').value.trim();

      // Clear destination if no vehicle is selected (destination is only for vehicles)
      if (vehicle.length === 0) {
        destination = '';
        document.getElementById('intDestination').value = '';
      }

      // Validate
      let valid = true;
      if (!name)                         { showError('intNameError');       valid = false; }
      if (!department)                   { showError('intDepartmentError'); valid = false; }
      if (!employeeId)                   { showError('intEmployeeIdError'); valid = false; }
      if (!email || !isValidEmail(email)) { showError('intEmailError');     valid = false; }
      if (!facility && vehicle.length === 0) { showError('intFacilityError');   valid = false; }
      if (facility && vehicle.length > 0)    { showError('intFacilityVehicleError'); valid = false; }
      if (!date || !isAllowedDate(date))  { showError('intDateError');      valid = false; }
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

        const bookingData = {
          referenceId: refId,
          name: name, department: department, employeeId: employeeId, email: email,
          facility: facility, date: date, startTime: startTime, endTime: endTime,
          numPersons: numPersons, purpose: purpose, equipment: equipment, vehicle: vehicle,
          destination: destination, considerations: considerations
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
      const equipment  = getEquipmentWithQuantities('extEquipment');
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
      if (!date || !isAllowedDate(date))  { showError('extDateError');     valid = false; }
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
          status:        'Pending Payment',
          referenceId:   refId,
          createdAt:     firebase.firestore.FieldValue.serverTimestamp()
        });

        // Generate PDF
        const bookingData = {
          referenceId: refId,
          contactPerson, agency, contact, address, email,
          facility, date, startTime, endTime, numPersons,
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
    doc.text(data.contactPerson || '', 67, y + 7);
    y += rowHeight;
    
    // Row 2
    doc.rect(15, y, 180, rowHeight);
    doc.line(65, y, 65, y + rowHeight);
    doc.text('Name of\nAgency/Organization', 17, y + 5);
    doc.text(data.agency || '', 67, y + 7);
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
    doc.text(`${data.startTime || ''} - ${data.endTime || ''}`, 142, y + 7);
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
    doc.text(data.name || '', 67, y + 5);
    doc.text('Date:', 137, y + 5);
    
    doc.text('Purpose / Activity', 17, y + 12);
    doc.text(doc.splitTextToSize(data.purpose || '', 125), 67, y + 11);
    
    doc.text('Date & Time of Use', 17, y + 19);
    doc.text(`${data.date || ''} | ${data.startTime || ''}-${data.endTime || ''}`, 67, y + 19);
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
        start_time:   data.startTime,
        end_time:     data.endTime,
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
