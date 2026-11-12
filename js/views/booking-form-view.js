/* ============================================================
   Booking Form View — San Isidro College Reservation System
   View Layer (js/views/booking-form-view.js)
   Handles DOM updates, field error highlighting, dynamic option
   rendering, and conditional field visibility on booking.html.
   Never calls Firestore directly.
   ============================================================ */

(function () {
  'use strict';

  const VEHICLE_OPTION = 'Vehicle';

  function appendVehicleOption(select) {
    if (!select) return;
    const existing = Array.from(select.options).find(o => o.value === VEHICLE_OPTION);
    if (existing) existing.remove();
    const option = document.createElement('option');
    option.value = VEHICLE_OPTION;
    option.textContent = 'Vehicle';
    select.appendChild(option);
  }

  function populateFacilitySelects(activeFacilities) {
    const intFacilitySelect = document.getElementById('intFacility');
    const extFacilitySelect = document.getElementById('extFacility');
    if (!activeFacilities || activeFacilities.length === 0) return;

    const prevIntChoice = intFacilitySelect ? intFacilitySelect.value : '';

    [intFacilitySelect, extFacilitySelect].forEach(select => {
      if (!select) return;
      while (select.options.length > 1) {
        select.remove(1);
      }
    });

    activeFacilities.forEach(f => {
      [intFacilitySelect, extFacilitySelect].forEach(select => {
        if (!select) return;
        const option = document.createElement('option');
        option.value = f.name;
        option.textContent = f.name;
        select.appendChild(option);
      });
    });

    appendVehicleOption(intFacilitySelect);
    if (intFacilitySelect && prevIntChoice &&
        Array.from(intFacilitySelect.options).some(o => o.value === prevIntChoice)) {
      intFacilitySelect.value = prevIntChoice;
    }
  }

  function populateVehicleCheckboxes(vehicleNames) {
    const vehicleOptions = document.getElementById('vehicleOptions');
    if (!vehicleOptions) return;

    vehicleOptions.innerHTML = '';
    vehicleNames.forEach(name => {
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
  }

  function findVisibleField(group) {
    if (!group) return null;
    return Array.from(group.querySelectorAll('input, select, textarea')).find(f =>
      f.type !== 'checkbox' && f.type !== 'hidden' && f.offsetParent !== null
    ) || null;
  }

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
    void target.offsetWidth;
    target.classList.add('field-shake');
    setTimeout(() => target.classList.remove('field-shake'), 500);
  }

  function renderConflictWarning(warningId, textId, hasConflict, facility, startDate, endDate, startTime, endTime) {
    const warningEl = document.getElementById(warningId);
    const textEl    = document.getElementById(textId);
    if (!warningEl || !textEl) return;

    const effectiveEnd = endDate || startDate;
    if (hasConflict) {
      textEl.textContent = `${facility} already has a booking that overlaps with ${Utils.formatDateRange(startDate, effectiveEnd)}, ${Utils.formatTimeRange12(startTime, endTime)}. Your request may be rejected.`;
      warningEl.classList.add('visible');
    } else {
      warningEl.classList.remove('visible');
    }
  }

  function updateExtAgencyOtherVisibility() {
    const extAgencyTypeEl = document.getElementById('extAgencyType');
    const extAgencyTypeOtherGroup = document.getElementById('extAgencyTypeOtherGroup');
    const extAgencyTypeOtherInput = document.getElementById('extAgencyTypeOther');
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

  function updateVehicleVisibility() {
    const intFacilityEl = document.getElementById('intFacility');
    const vehicleFields = document.querySelectorAll('#internalForm .vehicle-field');
    const isVehicle = !!intFacilityEl && intFacilityEl.value === VEHICLE_OPTION;

    vehicleFields.forEach(el => {
      const wasHidden = el.style.display === 'none';
      el.style.display = isVehicle ? '' : 'none';
      if (isVehicle && wasHidden) {
        el.classList.remove('revealed');
        void el.offsetWidth;
        el.classList.add('revealed');
      }
    });

    if (!isVehicle) {
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

  function updateIntDepartmentSchoolVisibility() {
    const intDepartmentEl = document.getElementById('intDepartment');
    const intCollegeSchoolGroup = document.getElementById('intCollegeSchoolGroup');
    const intCollegeSchoolEl = document.getElementById('intCollegeSchool');
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

  window.BookingFormView = {
    VEHICLE_OPTION,
    appendVehicleOption,
    populateFacilitySelects,
    populateVehicleCheckboxes,
    findVisibleField,
    showError,
    clearErrors,
    focusFirstError,
    renderConflictWarning,
    updateExtAgencyOtherVisibility,
    updateVehicleVisibility,
    updateIntDepartmentSchoolVisibility
  };
})();

