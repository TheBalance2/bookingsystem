/* ============================================================
   Booking Controller — San Isidro College Reservation System
   Controller Layer (js/controllers/booking-controller.js)
   Handles form toggling, schedule/input validation, conflict
   checking, booking submission, and payment receipt upload on
   booking.html.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'BookingController';
  let TESTING_MODE = Boolean(window.SIC_TESTING_MODE);
  const VEHICLE_OPTION = BookingFormView.VEHICLE_OPTION;

  // ---- DOM References ----
  const toggleBtns           = document.querySelectorAll('.toggle-btn');
  const internalForm         = document.getElementById('internalForm');
  const externalForm         = document.getElementById('externalForm');
  const intForm              = document.getElementById('internalBookingForm');
  const extForm              = document.getElementById('externalBookingForm');
  const successModal         = document.getElementById('successModal');
  const bookingRefId         = document.getElementById('bookingRefId');
  const extSuccessModal      = document.getElementById('extSuccessModal');
  const extBookingRefId      = document.getElementById('extBookingRefId');
  const downloadPdfBtn       = document.getElementById('downloadPdfBtn');
  const downloadInternalPdfBtn = document.getElementById('downloadInternalPdfBtn');
  const receiptUploadSection = document.getElementById('receiptUploadSection');
  const receiptForm          = document.getElementById('receiptUploadForm');
  const receiptSuccessModal  = document.getElementById('receiptSuccessModal');
  const navToggle            = document.getElementById('navToggle');
  const navLinks             = document.getElementById('navLinks');

  // Mobile nav toggle
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
  }

  // Initialize services
  EmailService.init();
  PdfService.initSignatoriesListener();
  AddressService.init(extForm);

  // ---- User Type Toggle ----
  function switchBookingTab(type) {
    toggleBtns.forEach(b => {
      const isMatch = b.dataset.type === type;
      b.classList.toggle('active', isMatch);
      b.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    });

    if (type === 'internal') {
      if (internalForm) internalForm.style.display = 'block';
      if (externalForm) externalForm.style.display = 'none';
      if (receiptUploadSection) receiptUploadSection.style.display = 'none';
    } else if (type === 'external') {
      if (internalForm) internalForm.style.display = 'none';
      if (externalForm) externalForm.style.display = 'block';
      if (receiptUploadSection) receiptUploadSection.style.display = 'none';
    } else if (type === 'receipt') {
      if (internalForm) internalForm.style.display = 'none';
      if (externalForm) externalForm.style.display = 'none';
      if (receiptUploadSection) receiptUploadSection.style.display = 'block';
    }
  }

  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchBookingTab(btn.dataset.type);
    });
  });

  const goToReceiptTabBtn = document.getElementById('goToReceiptTabBtn');
  if (goToReceiptTabBtn) {
    goToReceiptTabBtn.addEventListener('click', () => {
      const generatedRef = extBookingRefId ? extBookingRefId.textContent.trim() : '';
      if (extSuccessModal) extSuccessModal.classList.remove('visible');
      switchBookingTab('receipt');
      const receiptRefInput = document.getElementById('receiptRefId');
      if (receiptRefInput && generatedRef && generatedRef !== '—') {
        receiptRefInput.value = generatedRef;
      }
      if (receiptUploadSection) {
        receiptUploadSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  // ---- Load Dynamic Facilities, Classrooms & Vehicles via Models ----
  let loadedFacilities = [];

  function loadFacilities() {
    FacilityModel.getActive()
      .then(activeFacilities => {
        if (activeFacilities && activeFacilities.length > 0) {
          loadedFacilities = activeFacilities;
          BookingFormView.populateFacilitySelects(activeFacilities);
          applyPrefillFacilityIfNeeded();
        }
      })
      .catch(err => {
        Logger.warn(LAYER, 'Could not load facilities from Firestore, using hardcoded defaults:', err);
      });
  }

  function loadClassrooms() {
    if (!window.ClassroomModel) return;
    ClassroomModel.getActive()
      .then(activeClassrooms => {
        BookingFormView.populateClassroomSelects(activeClassrooms);
      })
      .catch(err => {
        Logger.warn(LAYER, 'Could not load classrooms from Firestore:', err);
      });
  }

  function loadVehicles() {
    const fallbackVehicles = ['Toyota Grandia Van', 'KIA Utility Van'];
    VehicleModel.getActive()
      .then(activeVehicles => {
        const names = activeVehicles.map(v => v.name).filter(Boolean);
        BookingFormView.populateVehicleCheckboxes(names.length > 0 ? names : fallbackVehicles);
      })
      .catch(err => {
        Logger.warn(LAYER, 'Could not load vehicles from Firestore, using fallback defaults:', err);
        BookingFormView.populateVehicleCheckboxes(fallbackVehicles);
      });
  }

  function loadDepartments() {
    if (!window.DepartmentModel) return;
    if (typeof DepartmentModel.listenAll === 'function') {
      DepartmentModel.listenAll(departments => {
        BookingFormView.setDepartmentsData(departments);
      });
    } else if (typeof DepartmentModel.getAll === 'function') {
      DepartmentModel.getAll()
        .then(departments => BookingFormView.setDepartmentsData(departments))
        .catch(() => {});
    }
  }

  function syncReceiptRefPlaceholder() {
    const receiptRefInput = document.getElementById('receiptRefId');
    if (!receiptRefInput) return;
    SettingsModel.getBookingIdConfig()
      .then(cfg => {
        if (!cfg) return;
        receiptRefInput.placeholder = `e.g. ${Utils.formatSequentialBookingId(cfg.prefix, cfg.year, 1)}`;
      })
      .catch(() => {});
  }

  loadFacilities();
  loadClassrooms();
  loadVehicles();
  loadDepartments();
  syncReceiptRefPlaceholder();

  if (window.SettingsModel && typeof SettingsModel.listenSystemConfig === 'function') {
    SettingsModel.listenSystemConfig(cfg => {
      TESTING_MODE = Boolean(cfg && cfg.testingMode);
      applyDateRangeMinConstraints('intStartDate', 'intEndDate');
      applyDateRangeMinConstraints('extStartDate', 'extEndDate');
    });
  }

  // ---- Pre-fill from URL Query Params (?date=...&facility=...&tab=...) ----
  const urlParams       = new URLSearchParams(window.location.search);
  const prefillDate     = urlParams.get('date');
  const prefillFacility = urlParams.get('facility');
  const prefillTab      = (urlParams.get('tab') || urlParams.get('type') || '').toLowerCase();

  if (prefillTab === 'receipt' || prefillTab === 'external' || prefillTab === 'internal') {
    switchBookingTab(prefillTab);
  }

  function applyPrefillFacilityIfNeeded() {
    if (!prefillFacility) return;
    const intFacility = document.getElementById('intFacility');
    const extFacility = document.getElementById('extFacility');

    const matchedFac = loadedFacilities.find(f => f.name === prefillFacility);
    const vis = matchedFac ? Utils.normalizeFacilityVisibility(matchedFac.visibility) : 'both';

    if (vis === 'external') {
      const extBtn = document.getElementById('toggleExternal');
      if (extBtn) extBtn.click();
    } else if (vis === 'internal') {
      const intBtn = document.getElementById('toggleInternal');
      if (intBtn) intBtn.click();
    }

    [intFacility, extFacility].forEach(select => {
      if (!select) return;
      for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value === prefillFacility) {
          select.value = prefillFacility;
          break;
        }
      }
    });

    BookingFormView.updateVehicleVisibility();
    BookingFormView.updateClassroomVisibility('int');
    BookingFormView.updateClassroomVisibility('ext');
  }

  (function prefillFromURL() {
    if (!prefillDate && !prefillFacility) return;

    if (prefillDate) {
      ['intStartDate', 'intEndDate', 'extStartDate', 'extEndDate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = prefillDate;
      });
    }

    if (prefillFacility) {
      applyPrefillFacilityIfNeeded();
      setTimeout(applyPrefillFacilityIfNeeded, 800);
      setTimeout(applyPrefillFacilityIfNeeded, 1500);
    }

    setTimeout(() => {
      const activeForm = (externalForm && externalForm.style.display !== 'none') ? externalForm : internalForm;
      if (activeForm) activeForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
  })();

  // ---- Schedule & Input Validation Helpers ----
  function isAllowedDate(dateStr) {
    if (!dateStr) return false;
    const parsed = new Date(dateStr + 'T00:00:00');
    if (Number.isNaN(parsed.getTime())) return false;
    if (TESTING_MODE) return true;

    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 3);
    minDate.setHours(0, 0, 0, 0);
    return parsed >= minDate;
  }

  function validateSchedule(prefix, startDate, endDate, startTime, endTime) {
    let ok = true;
    if (!startDate) {
      BookingFormView.showError(prefix + 'StartDateError', TESTING_MODE ? 'Please select a start date' : undefined);
      ok = false;
    } else if (!isAllowedDate(startDate)) {
      BookingFormView.showError(prefix + 'StartDateError');
      ok = false;
    }

    if (!endDate) {
      BookingFormView.showError(prefix + 'EndDateError', 'Please select an end date');
      ok = false;
    } else if (startDate && endDate < startDate) {
      BookingFormView.showError(prefix + 'EndDateError', 'End date must be on or after the start date');
      ok = false;
    }

    if (!startTime) {
      BookingFormView.showError(prefix + 'StartTimeError');
      ok = false;
    }

    if (!endTime) {
      BookingFormView.showError(prefix + 'EndTimeError', 'Please select an end time');
      ok = false;
    } else if (startTime && startDate && startDate === endDate && endTime <= startTime) {
      BookingFormView.showError(prefix + 'EndTimeError', 'For same-day bookings, end time must be after start time');
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
      const qty = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;
      return { item: cb.value, qty };
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

  // ---- Date Range Linking & Conflict Checking ----
  const minDateObj = new Date();
  minDateObj.setDate(minDateObj.getDate() + 3);
  const minDateStr = Utils.getLocalDateStr(minDateObj);

  function applyDateRangeMinConstraints(startId, endId) {
    const startEl = document.getElementById(startId);
    const endEl   = document.getElementById(endId);
    if (!startEl || !endEl) return;

    if (TESTING_MODE) {
      startEl.removeAttribute('min');
      if (startEl.value) {
        endEl.min = startEl.value;
      } else {
        endEl.removeAttribute('min');
      }
    } else {
      startEl.setAttribute('min', minDateStr);
      endEl.setAttribute('min', startEl.value && startEl.value > minDateStr ? startEl.value : minDateStr);
    }
  }

  function linkDateRange(startId, endId) {
    const startEl = document.getElementById(startId);
    const endEl   = document.getElementById(endId);
    if (!startEl || !endEl) return;

    applyDateRangeMinConstraints(startId, endId);

    startEl.addEventListener('change', () => {
      if (startEl.value) {
        endEl.min = startEl.value;
        if (!endEl.value || endEl.value < startEl.value) endEl.value = startEl.value;
      } else if (TESTING_MODE) {
        endEl.removeAttribute('min');
      } else {
        endEl.min = minDateStr;
      }
    });

    if (startEl.form) {
      startEl.form.addEventListener('reset', () => {
        setTimeout(() => {
          applyDateRangeMinConstraints(startId, endId);
        }, 0);
      });
    }
  }

  linkDateRange('intStartDate', 'intEndDate');
  linkDateRange('extStartDate', 'extEndDate');

  async function checkConflictAndRender(facility, startDate, endDate, startTime, endTime, warningId, textId, classroom = '') {
    const hasConflict = await BookingModel.hasScheduleConflict(facility, startDate, endDate, startTime, endTime, classroom);
    const displayLabel = (Utils.isClassroomFacilityName(facility) && classroom)
      ? `${facility} (${classroom})`
      : facility;
    BookingFormView.renderConflictWarning(warningId, textId, hasConflict, displayLabel, startDate, endDate, startTime, endTime);
    return hasConflict;
  }

  function runIntConflictCheck() {
    const choice = document.getElementById('intFacility').value;
    const classroom = document.getElementById('intClassroom') ? document.getElementById('intClassroom').value : '';
    checkConflictAndRender(
      choice === VEHICLE_OPTION ? '' : choice,
      document.getElementById('intStartDate').value,
      document.getElementById('intEndDate').value,
      document.getElementById('intStartTime').value,
      document.getElementById('intEndTime').value,
      'intConflictWarning', 'intConflictText',
      classroom
    );
  }
  ['intFacility', 'intClassroom', 'intStartDate', 'intEndDate', 'intStartTime', 'intEndTime'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', runIntConflictCheck);
  });

  function runExtConflictCheck() {
    const fac = document.getElementById('extFacility').value;
    const classroom = document.getElementById('extClassroom') ? document.getElementById('extClassroom').value : '';
    checkConflictAndRender(
      fac,
      document.getElementById('extStartDate').value,
      document.getElementById('extEndDate').value,
      document.getElementById('extStartTime').value,
      document.getElementById('extEndTime').value,
      'extConflictWarning', 'extConflictText',
      classroom
    );
  }
  ['extFacility', 'extClassroom', 'extStartDate', 'extEndDate', 'extStartTime', 'extEndTime'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', runExtConflictCheck);
  });

  // ---- Input Formatting & Conditional Fields ----
  const intContactEl       = document.getElementById('intContact');
  const extContactEl       = document.getElementById('extContact');
  const extAgencyTypeEl    = document.getElementById('extAgencyType');
  const intFacilityEl      = document.getElementById('intFacility');
  const extFacilityEl      = document.getElementById('extFacility');
  const intDepartmentEl    = document.getElementById('intDepartment');
  const intCollegeSchoolEl = document.getElementById('intCollegeSchool');

  if (intContactEl) Utils.stripNonDigitsInput(intContactEl);
  if (extContactEl) Utils.stripNonDigitsInput(extContactEl);
  if (extAgencyTypeEl) extAgencyTypeEl.addEventListener('change', BookingFormView.updateExtAgencyOtherVisibility);
  if (intFacilityEl) {
    intFacilityEl.addEventListener('change', () => {
      BookingFormView.updateVehicleVisibility();
      BookingFormView.updateClassroomVisibility('int');
    });
  }
  if (extFacilityEl) {
    extFacilityEl.addEventListener('change', () => {
      BookingFormView.updateClassroomVisibility('ext');
    });
  }
  if (intDepartmentEl) intDepartmentEl.addEventListener('change', BookingFormView.updateIntDepartmentSchoolVisibility);

  ['intNumPersons', 'extNumPersons'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('keydown', (e) => {
      if (['+', '-', 'e', 'E', '.', ','].includes(e.key)) e.preventDefault();
    });
    Utils.stripNonDigitsInput(el);
  });

  [
    'intFirstName',
    'intLastName',
    'intMiddleInitial',
    'intPosition',
    'extFirstName',
    'extLastName',
    'extMiddleInitial',
    'extAgencyName',
    'extOfficeName',
    'extPosition',
    'receiptRefId'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const upper = el.value.toUpperCase();
      if (upper === el.value) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.value = upper;
      try { el.setSelectionRange(start, end); } catch (_) {}
    });
  });

  // ---- Letter of Intent (PDF) Upload (External Form) ----
  const extLoiFileInput    = document.getElementById('extLoiFileInput');
  const extLoiDropZone     = document.getElementById('extLoiDropZone');
  const extLoiFileName     = document.getElementById('extLoiFileName');
  const extLoiFileSelected = document.getElementById('extLoiFileSelected');
  const extLoiRemoveBtn    = document.getElementById('extLoiRemoveBtn');
  const MAX_LOI_PDF_BYTES  = 700 * 1024; // 700 KB raw (~935 KB base64, safely under Firestore 1 MiB limit)

  function isPdfFile(file) {
    if (!file) return false;
    return file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  }

  // Inspects the first 5 bytes of the uploaded file to verify the '%PDF-' header signature
  function hasPdfMagicBytes(file) {
    if (!file || typeof file.slice !== 'function') return Promise.resolve(false);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const bytes = new Uint8Array(ev.target.result || new ArrayBuffer(0));
          // '%PDF-' in ASCII: 0x25, 0x50, 0x44, 0x46, 0x2D
          const isValid =
            bytes.length >= 5 &&
            bytes[0] === 0x25 &&
            bytes[1] === 0x50 &&
            bytes[2] === 0x44 &&
            bytes[3] === 0x46 &&
            bytes[4] === 0x2D;
          resolve(isValid);
        } catch (_) {
          resolve(false);
        }
      };
      reader.onerror = () => resolve(false);
      reader.readAsArrayBuffer(file.slice(0, 5));
    });
  }

  function resetExtLoiUploadUi() {
    if (extLoiFileInput) extLoiFileInput.value = '';
    if (extLoiFileName) extLoiFileName.textContent = '';
    if (extLoiFileSelected) extLoiFileSelected.style.display = 'none';
    if (extLoiDropZone) {
      extLoiDropZone.classList.remove('has-file', 'error');
    }
    const errEl = document.getElementById('extLoiFileError');
    if (errEl) errEl.classList.remove('visible');
  }

  async function handleExtLoiFileChange() {
    const file = extLoiFileInput && extLoiFileInput.files ? extLoiFileInput.files[0] : null;
    const errEl = document.getElementById('extLoiFileError');
    if (errEl) errEl.classList.remove('visible');
    if (extLoiDropZone) extLoiDropZone.classList.remove('error');

    if (!file) {
      if (extLoiFileName) extLoiFileName.textContent = '';
      if (extLoiFileSelected) extLoiFileSelected.style.display = 'none';
      if (extLoiDropZone) extLoiDropZone.classList.remove('has-file');
      return;
    }

    if (!isPdfFile(file)) {
      resetExtLoiUploadUi();
      BookingFormView.showError('extLoiFileError', 'Invalid file format. Please upload your Letter of Intent in PDF format (.pdf) only.');
      return;
    }

    if (file.size > MAX_LOI_PDF_BYTES) {
      resetExtLoiUploadUi();
      BookingFormView.showError('extLoiFileError', 'PDF file size must be 700 KB or smaller so it can be stored in the system.');
      return;
    }

    const isGenuinePdf = await hasPdfMagicBytes(file);
    if (!isGenuinePdf) {
      resetExtLoiUploadUi();
      BookingFormView.showError('extLoiFileError', 'The selected file is not a valid PDF document (invalid %PDF header). Please export or save your Letter of Intent as a genuine PDF.');
      return;
    }

    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    if (extLoiFileName) {
      extLoiFileName.textContent = `✓ ${file.name} (${sizeKb} KB)`;
    }
    if (extLoiFileSelected) {
      extLoiFileSelected.style.display = 'inline-flex';
    }
    if (extLoiDropZone) {
      extLoiDropZone.classList.add('has-file');
    }
  }

  if (extLoiFileInput) {
    extLoiFileInput.addEventListener('change', handleExtLoiFileChange);
  }

  if (extLoiRemoveBtn) {
    extLoiRemoveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetExtLoiUploadUi();
    });
  }

  if (extLoiDropZone && extLoiFileInput) {
    extLoiDropZone.addEventListener('click', (e) => {
      if (e.target === extLoiRemoveBtn || (extLoiRemoveBtn && extLoiRemoveBtn.contains(e.target))) return;
      extLoiFileInput.click();
    });
    extLoiDropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        extLoiFileInput.click();
      }
    });
    extLoiDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      extLoiDropZone.style.borderColor = 'var(--navy)';
    });
    extLoiDropZone.addEventListener('dragleave', () => {
      extLoiDropZone.style.borderColor = '';
    });
    extLoiDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      extLoiDropZone.style.borderColor = '';
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        extLoiFileInput.files = e.dataTransfer.files;
        handleExtLoiFileChange();
      }
    });
  }

  if (intForm) {
    intForm.addEventListener('reset', () => {
      setTimeout(() => {
        BookingFormView.updateVehicleVisibility();
        BookingFormView.updateClassroomVisibility('int');
        BookingFormView.updateIntDepartmentSchoolVisibility();
        BookingFormView.clearErrors('int');
        document.getElementById('intConflictWarning').classList.remove('visible');
      }, 0);
    });
  }
  if (extForm) {
    extForm.addEventListener('reset', () => {
      setTimeout(() => {
        BookingFormView.updateExtAgencyOtherVisibility();
        BookingFormView.updateClassroomVisibility('ext');
        resetExtLoiUploadUi();
        BookingFormView.clearErrors('ext');
        document.getElementById('extConflictWarning').classList.remove('visible');
      }, 0);
    });
  }

  // ---- Internal Form Submission ----
  if (intForm) {
    intForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const currentHour = new Date().getHours();
      if (!TESTING_MODE && (currentHour < 8 || currentHour >= 17)) {
        alert('Bookings can only be submitted during working hours (8:00 AM - 5:00 PM).');
        return;
      }

      BookingFormView.clearErrors('int');

      const firstName      = document.getElementById('intFirstName').value.trim().toUpperCase();
      const lastName       = document.getElementById('intLastName').value.trim().toUpperCase();
      const middleInitial  = document.getElementById('intMiddleInitial').value.trim().toUpperCase();
      const departmentRaw  = document.getElementById('intDepartment').value;
      const collegeSchool  = intCollegeSchoolEl ? intCollegeSchoolEl.value : '';
      const hasOffices     = intCollegeSchoolEl && intCollegeSchoolEl.dataset.hasOffices === '1';
      let officeHead       = '';
      if (intCollegeSchoolEl && intCollegeSchoolEl.selectedIndex >= 0) {
        const selOpt = intCollegeSchoolEl.options[intCollegeSchoolEl.selectedIndex];
        officeHead = selOpt && selOpt.dataset ? (selOpt.dataset.headName || '') : '';
      }
      const finalDepartment = collegeSchool ? collegeSchool : departmentRaw;
      const position       = (document.getElementById('intPosition') ? document.getElementById('intPosition').value : '').trim().toUpperCase();
      const contact        = (document.getElementById('intContact') ? document.getElementById('intContact').value : '').trim();
      const email          = document.getElementById('intEmail').value.trim();
      const address        = 'San Isidro College Impalambong';
      const facilityChoice = document.getElementById('intFacility').value;
      const isVehicle      = facilityChoice === VEHICLE_OPTION;
      const facility       = isVehicle ? '' : facilityChoice;
      const isClassroom    = Utils.isClassroomFacilityName(facility);
      const classroom      = isClassroom && document.getElementById('intClassroom')
        ? document.getElementById('intClassroom').value.trim()
        : '';
      const startDate      = document.getElementById('intStartDate').value;
      const endDate        = document.getElementById('intEndDate').value;
      const startTime      = document.getElementById('intStartTime').value;
      const endTime        = document.getElementById('intEndTime').value;
      const numPersonsRaw  = document.getElementById('intNumPersons').value.trim();
      const numPersons     = Utils.isValidPersonCount(numPersonsRaw) ? String(parseInt(numPersonsRaw, 10)) : numPersonsRaw;
      const vehicle        = isVehicle ? getCheckedEquipment('vehicle') : [];
      let destination      = document.getElementById('intDestination').value.trim();
      const purpose        = document.getElementById('intPurpose').value.trim();
      const equipment      = getEquipmentWithQuantities('equipment');
      const considerations = document.getElementById('intConsiderations').value.trim();

      if (!isVehicle) {
        destination = '';
        document.getElementById('intDestination').value = '';
      }

      let valid = true;
      if (!firstName)                     { BookingFormView.showError('intFirstNameError');     valid = false; }
      if (!lastName)                      { BookingFormView.showError('intLastNameError');      valid = false; }
      if (!middleInitial)                 { BookingFormView.showError('intMiddleInitialError'); valid = false; }
      if (!departmentRaw) {
        BookingFormView.showError('intDepartmentError');
        valid = false;
      } else if (hasOffices && !collegeSchool) {
        BookingFormView.showError('intCollegeSchoolError');
        valid = false;
      }
      if (!position)                      { BookingFormView.showError('intPositionError');      valid = false; }
      if (!contact)                       { BookingFormView.showError('intContactError');       valid = false; }
      else if (!Utils.isDigitsOnly(contact)) { BookingFormView.showError('intContactError', 'Contact must be numbers only.'); valid = false; }
      if (!email || !Utils.isValidEmail(email)) { BookingFormView.showError('intEmailError');     valid = false; }
      if (!facilityChoice)                    { BookingFormView.showError('intFacilityError');   valid = false; }
      if (isClassroom && !classroom)          { BookingFormView.showError('intClassroomError');  valid = false; }
      if (!validateSchedule('int', startDate, endDate, startTime, endTime)) valid = false;
      if (!Utils.isValidPersonCount(numPersonsRaw)) { BookingFormView.showError('intNumPersonsError'); valid = false; }
      if (isVehicle && vehicle.length === 0)  { BookingFormView.showError('intFacilityVehicleError'); valid = false; }
      if (isVehicle && !destination)          { BookingFormView.showError('intDestinationError'); valid = false; }
      if (!purpose)                           { BookingFormView.showError('intPurposeError');   valid = false; }

      if (!valid) {
        BookingFormView.focusFirstError(intForm);
        return;
      }

      const btn = document.getElementById('intSubmitBtn');
      btn.innerHTML = '<span class="spinner"></span> Submitting...';
      btn.classList.add('loading');

      const combinedName  = Utils.formatCombinedName(lastName, firstName, middleInitial);
      const filingDateStr = Utils.formatFilingDate(new Date());

      try {
        const refId = await BookingModel.create({
          userType:         'Internal',
          firstName,
          lastName,
          middleInitial,
          name:             combinedName,
          department:       finalDepartment,
          parentDepartment: departmentRaw,
          collegeSchool:    collegeSchool || '',
          officeHead:       officeHead || '',
          position,
          contactNumber:    contact,
          address,
          email,
          facility,
          classroom,
          date:             startDate,
          startDate,
          endDate,
          startTime,
          endTime,
          numPersons,
          purpose,
          equipment,
          vehicle,
          destination,
          considerations,
          dateSubmitted:    filingDateStr,
          status:           'Pending'
        });

        PdfService.generateInternalBookingPDF({
          referenceId:      refId,
          userType:         'Internal',
          firstName,
          lastName,
          middleInitial,
          name:             combinedName,
          department:       finalDepartment,
          parentDepartment: departmentRaw,
          collegeSchool:    collegeSchool || '',
          officeHead:       officeHead || '',
          position,
          contactNumber:    contact,
          contact,
          address,
          email,
          facility,
          classroom,
          date:             Utils.formatDateRange(startDate, endDate),
          startDate,
          endDate,
          startTime,
          endTime,
          numPersons,
          purpose,
          equipment,
          vehicle,
          destination,
          considerations,
          dateSubmitted:    filingDateStr
        });

        bookingRefId.textContent = refId;
        successModal.classList.add('visible');
        intForm.reset();
      } catch (err) {
        Logger.error(LAYER, 'Internal submission error:', err);
        if (err && err.code === 'permission-denied') {
          alert('Failed to submit reservation due to Firestore permissions. Please make sure the updated firestore.rules (settings/bookingId) has been published in Firebase Console.');
        } else {
          alert('Failed to submit reservation. Please make sure Firebase is configured correctly.');
        }
      } finally {
        btn.innerHTML = 'Submit Reservation';
        btn.classList.remove('loading');
      }
    });
  }

  // ---- External Form Submission ----
  if (extForm) {
    extForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const currentHour = new Date().getHours();
      if (!TESTING_MODE && (currentHour < 8 || currentHour >= 17)) {
        alert('Bookings can only be submitted during working hours (8:00 AM - 5:00 PM).');
        return;
      }

      BookingFormView.clearErrors('ext');

      const firstName       = document.getElementById('extFirstName').value.trim().toUpperCase();
      const lastName        = document.getElementById('extLastName').value.trim().toUpperCase();
      const middleInitial   = document.getElementById('extMiddleInitial').value.trim().toUpperCase();
      const agencyTypeRaw   = document.getElementById('extAgencyType').value;
      const agencyTypeOther = document.getElementById('extAgencyTypeOther').value.trim();
      const agencyType      = (agencyTypeRaw.startsWith('Other') && agencyTypeOther) ? agencyTypeOther : agencyTypeRaw;
      const agencyName      = document.getElementById('extAgencyName').value.trim().toUpperCase();
      const officeName      = document.getElementById('extOfficeName').value.trim().toUpperCase();
      const position        = (document.getElementById('extPosition') ? document.getElementById('extPosition').value : '').trim().toUpperCase();
      const contact         = document.getElementById('extContact').value.trim();
      const email           = document.getElementById('extEmail').value.trim();
      const facility        = document.getElementById('extFacility').value;
      const isClassroom     = Utils.isClassroomFacilityName(facility);
      const classroom       = isClassroom && document.getElementById('extClassroom')
        ? document.getElementById('extClassroom').value.trim()
        : '';
      const startDate       = document.getElementById('extStartDate').value;
      const endDate         = document.getElementById('extEndDate').value;
      const startTime       = document.getElementById('extStartTime').value;
      const endTime         = document.getElementById('extEndTime').value;
      const numPersonsRaw   = document.getElementById('extNumPersons').value.trim();
      const numPersons      = Utils.isValidPersonCount(numPersonsRaw) ? String(parseInt(numPersonsRaw, 10)) : numPersonsRaw;
      const purpose         = document.getElementById('extPurpose').value.trim();
      const equipment       = getEquipmentWithQuantities('extEquipment');
      const otherEquipment  = document.getElementById('extOtherEquipment').value.trim();
      const considerations  = document.getElementById('extConsiderations').value.trim();
      const loiFile         = extLoiFileInput && extLoiFileInput.files ? extLoiFileInput.files[0] : null;

      let valid = true;
      if (!firstName)                     { BookingFormView.showError('extFirstNameError');     valid = false; }
      if (!lastName)                      { BookingFormView.showError('extLastNameError');      valid = false; }
      if (!middleInitial)                 { BookingFormView.showError('extMiddleInitialError'); valid = false; }
      if (!agencyTypeRaw)                 { BookingFormView.showError('extAgencyTypeError');    valid = false; }
      if (agencyTypeRaw.startsWith('Other') && !agencyTypeOther) { BookingFormView.showError('extAgencyTypeOtherError'); valid = false; }
      if (!agencyName)                    { BookingFormView.showError('extAgencyNameError');    valid = false; }
      if (!officeName)                    { BookingFormView.showError('extOfficeNameError');    valid = false; }
      if (!position)                      { BookingFormView.showError('extPositionError');      valid = false; }
      if (!contact)                       { BookingFormView.showError('extContactError');       valid = false; }
      else if (!Utils.isDigitsOnly(contact)) { BookingFormView.showError('extContactError', 'Contact must be numbers only.'); valid = false; }
      const addressInfo = AddressService.collect(BookingFormView.showError);
      if (!addressInfo.valid)             { valid = false; }
      if (!email || !Utils.isValidEmail(email)) { BookingFormView.showError('extEmailError');    valid = false; }
      if (!facility)                      { BookingFormView.showError('extFacilityError');      valid = false; }
      if (isClassroom && !classroom)      { BookingFormView.showError('extClassroomError');     valid = false; }
      if (!validateSchedule('ext', startDate, endDate, startTime, endTime)) valid = false;
      if (!Utils.isValidPersonCount(numPersonsRaw)) { BookingFormView.showError('extNumPersonsError'); valid = false; }
      if (!purpose)                       { BookingFormView.showError('extPurposeError');       valid = false; }
      if (!loiFile) {
        BookingFormView.showError('extLoiFileError', 'Please upload your Letter of Intent in PDF format (.pdf).');
        valid = false;
      } else if (!isPdfFile(loiFile)) {
        BookingFormView.showError('extLoiFileError', 'Invalid file format. Please upload your Letter of Intent in PDF format (.pdf) only.');
        valid = false;
      } else if (loiFile.size > MAX_LOI_PDF_BYTES) {
        BookingFormView.showError('extLoiFileError', 'PDF file size must be 700 KB or smaller so it can be stored in the system.');
        valid = false;
      } else if (!(await hasPdfMagicBytes(loiFile))) {
        BookingFormView.showError('extLoiFileError', 'The selected file is not a valid PDF document (invalid %PDF header).');
        valid = false;
      }

      if (!valid) {
        BookingFormView.focusFirstError(extForm);
        return;
      }

      const address      = addressInfo.address;
      const shortAddress = addressInfo.shortAddress || addressInfo.address;
      const btn = document.getElementById('extSubmitBtn');
      btn.innerHTML = '<span class="spinner"></span> Submitting...';
      btn.classList.add('loading');

      const combinedName  = Utils.formatCombinedName(lastName, firstName, middleInitial);
      const combinedOrg   = `${agencyName} - ${officeName}`;
      const filingDateStr = Utils.formatFilingDate(new Date());

      try {
        const loiBase64DataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const rawResult = String(ev.target.result || '');
            // Normalize MIME prefix to data:application/pdf;base64,... in case browser used application/octet-stream
            const base64Part = rawResult.includes(',') ? rawResult.split(',')[1] : '';
            if (!base64Part) {
              reject(new Error('Could not read Letter of Intent PDF file.'));
              return;
            }
            resolve(`data:application/pdf;base64,${base64Part}`);
          };
          reader.onerror = () => reject(new Error('Failed to read Letter of Intent PDF file.'));
          reader.readAsDataURL(loiFile);
        });

        const refId = await BookingModel.create({
          userType:               'External',
          firstName,
          lastName,
          middleInitial,
          contactPerson:          combinedName,
          name:                   combinedName,
          agencyType,
          agencyName,
          officeName,
          organization:           combinedOrg,
          agency:                 agencyName,
          position,
          contactNumber:          contact,
          address,
          shortAddress,
          addressDetails:         addressInfo.parts,
          email,
          facility,
          classroom,
          date:                   startDate,
          startDate,
          endDate,
          startTime,
          endTime,
          numPersons,
          purpose,
          equipment,
          otherEquipment,
          considerations,
          hasLetterOfIntent:      true,
          letterOfIntentFileName: loiFile.name,
          dateSubmitted:          filingDateStr,
          status:                 'Pending Payment'
        }, {
          dataUrl:  loiBase64DataUrl,
          fileName: loiFile.name
        });

        const bookingData = {
          referenceId:   refId,
          userType:      'External',
          firstName,
          lastName,
          middleInitial,
          contactPerson: combinedName,
          name:          combinedName,
          agencyType,
          agencyName,
          officeName,
          agency:        agencyName,
          organization:  combinedOrg,
          position,
          contactNumber: contact,
          contact,
          address,
          shortAddress,
          addressDetails: addressInfo.parts,
          email,
          facility,
          classroom,
          startTime,
          endTime,
          numPersons,
          date:          Utils.formatDateRange(startDate, endDate),
          startDate,
          endDate,
          purpose,
          equipment,
          otherEquipment,
          considerations,
          dateSubmitted: filingDateStr
        };

        PdfService.generateExternalBookingPDF(bookingData);
        EmailService.sendSubmissionConfirmation(bookingData);

        if (extBookingRefId) extBookingRefId.textContent = refId;
        if (extSuccessModal) extSuccessModal.classList.add('visible');
        extForm.reset();
      } catch (err) {
        Logger.error(LAYER, 'External submission error:', err);
        if (err && err.code === 'permission-denied') {
          alert('Failed to submit reservation due to Firestore permissions. Please make sure the updated firestore.rules (settings/bookingId) has been published in Firebase Console.');
        } else {
          alert('Failed to submit reservation. Please make sure Firebase is configured correctly.');
        }
      } finally {
        btn.innerHTML = 'Submit Reservation';
        btn.classList.remove('loading');
      }
    });
  }

  // ---- PDF Re-Download Buttons ----
  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', () => {
      PdfService.downloadLastExternalPDF(extBookingRefId ? extBookingRefId.textContent : 'booking');
    });
  }

  if (downloadInternalPdfBtn) {
    downloadInternalPdfBtn.addEventListener('click', () => {
      PdfService.downloadLastInternalPDF(bookingRefId ? bookingRefId.textContent : 'booking');
    });
  }

  // ---- Receipt Upload ----
  const receiptFileInput = document.getElementById('receiptFileInput');
  const receiptDropZone  = document.getElementById('receiptDropZone');
  const receiptFileName  = document.getElementById('receiptFileName');

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
        receiptFileInput.dispatchEvent(new Event('change'));
      }
    });
  }

  if (receiptForm) {
    receiptForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      ['receiptRefIdError', 'receiptEmailError', 'receiptFileError'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('visible');
      });

      const refId = document.getElementById('receiptRefId').value.trim().toUpperCase();
      const email = document.getElementById('receiptEmail').value.trim();
      const file  = receiptFileInput ? receiptFileInput.files[0] : null;

      let valid = true;
      if (!refId) { BookingFormView.showError('receiptRefIdError'); valid = false; }
      if (!email || !Utils.isValidEmail(email)) { BookingFormView.showError('receiptEmailError'); valid = false; }
      if (!file) { BookingFormView.showError('receiptFileError'); valid = false; }

      if (file && !(/^image\/(jpeg|jpg|png|webp)$/i.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name || ''))) {
        BookingFormView.showError('receiptFileError', 'Receipt must be an image file (JPG or PNG)');
        valid = false;
      } else if (file && file.size > 5 * 1024 * 1024) {
        BookingFormView.showError('receiptFileError', 'File size must be under 5MB');
        valid = false;
      }

      if (!valid) return;

      const btn = document.getElementById('receiptSubmitBtn');
      btn.innerHTML = '<span class="spinner"></span> Verifying...';
      btn.classList.add('loading');

      try {
        const bookingData = typeof BookingModel.findForReceipt === 'function'
          ? await BookingModel.findForReceipt(refId, email)
          : await BookingModel.findByReferenceAndEmail(refId, email);
        if (!bookingData) {
          alert('No booking found with that Reference ID and Email. Please check your details and try again.');
          return;
        }

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

        btn.innerHTML = '<span class="spinner"></span> Processing...';

        const base64DataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const MAX_WIDTH  = 800;
              const MAX_HEIGHT = 800;
              let width  = img.width;
              let height = img.height;

              if (width > height) {
                if (width > MAX_WIDTH) {
                  height *= MAX_WIDTH / width;
                  width = MAX_WIDTH;
                }
              } else if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
              canvas.width  = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = reject;
            img.src = ev.target.result;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        await BookingModel.saveReceipt(bookingData.id, base64DataUrl);

        if (receiptSuccessModal) receiptSuccessModal.classList.add('visible');
        receiptForm.reset();
        if (receiptFileName) receiptFileName.style.display = 'none';
        if (receiptDropZone) receiptDropZone.classList.remove('has-file');
      } catch (err) {
        Logger.error(LAYER, 'Receipt upload error:', err);
        alert('Failed to upload receipt. Please try again. Error: ' + err.message);
      } finally {
        btn.innerHTML = 'Submit Receipt';
        btn.classList.remove('loading');
      }
    });
  }

  // ---- Close Modals on Overlay Click ----
  [successModal, extSuccessModal, receiptSuccessModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('visible');
      });
    }
  });
})();

