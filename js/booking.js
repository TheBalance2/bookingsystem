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
    const doc = new jsPDF();

    // Try to load logo
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.src = 'images/logo.jpg';

      // We'll build the PDF with or without the logo
      buildPdfContent(doc, data, logoImg);
    } catch (e) {
      console.warn('Could not load logo for PDF:', e);
      buildPdfContent(doc, data, null);
    }
  }

  function buildPdfContent(doc, data, logoImg) {
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    // Try to add logo
    try {
      if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
        doc.addImage(logoImg, 'JPEG', 15, y, 25, 25);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('San Isidro College', 45, y + 10);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text('Facility Reservation — Booking Summary', 45, y + 18);
        y += 35;
      } else {
        addHeaderWithoutLogo(doc, y);
        y += 25;
      }
    } catch (e) {
      addHeaderWithoutLogo(doc, y);
      y += 25;
    }

    // Divider line
    doc.setDrawColor(10, 36, 99);
    doc.setLineWidth(0.8);
    doc.line(15, y, pageWidth - 15, y);
    y += 10;

    // Reference ID (prominent)
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(10, 36, 99);
    doc.text('Reference ID: ' + data.referenceId, 15, y);
    y += 10;

    // Booking details
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    const details = [
      ['Contact Person', data.contactPerson],
      ['Organization', data.agency],
      ['Contact Number', data.contact],
      ['Address', data.address],
      ['Email', data.email],
      ['Facility', data.facility],
      ['Date', data.date],
      ['Time', data.startTime + ' – ' + data.endTime],
      ['Number of Persons', data.numPersons],
      ['Purpose', data.purpose],
      ['Equipment', data.equipment && data.equipment.length > 0 ? data.equipment.join(', ') : 'None'],
      ['Other Equipment', data.otherEquipment || 'None'],
      ['Considerations', data.considerations || 'None'],
    ];

    details.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label + ':', 15, y);
      doc.setFont('helvetica', 'normal');

      // Wrap long text
      const maxWidth = pageWidth - 80;
      const splitText = doc.splitTextToSize(String(value || '—'), maxWidth);
      doc.text(splitText, 65, y);
      y += splitText.length * 5 + 3;

      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });

    y += 5;

    // Footer note box
    doc.setDrawColor(230, 81, 0);
    doc.setFillColor(255, 243, 224);
    doc.roundedRect(15, y, pageWidth - 30, 30, 3, 3, 'FD');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(230, 81, 0);
    doc.text('IMPORTANT:', 20, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    const noteText = 'Please print this document and present it to the Business Office of San Isidro College for payment assessment. The price will be determined by the Business Office. After payment, upload your receipt on the booking page to confirm your reservation.';
    const noteLines = doc.splitTextToSize(noteText, pageWidth - 40);
    doc.text(noteLines, 20, y + 14);

    // Store the doc for download button
    lastGeneratedPdf = doc;

    // Auto-download
    doc.save('SIC_Booking_' + data.referenceId + '.pdf');
  }

  function addHeaderWithoutLogo(doc, y) {
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('San Isidro College', 15, y + 5);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Facility Reservation — Booking Summary', 15, y + 13);
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

        // Update Firestore document directly with the Base64 string
        await db.collection('bookings').doc(bookingDoc.id).update({
          receiptUrl: base64DataUrl,
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
