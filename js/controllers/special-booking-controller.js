/* ============================================================
   Special Booking Controller — San Isidro College Reservation System
   Controller Layer (js/controllers/special-booking-controller.js)
   Handles the Admin Special Booking modal and submission (auto-approved,
   bypasses working hours & 3-day notice rules).
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'SpecialBookingController';

  const specialBookingBtn    = document.getElementById('specialBookingBtn');
  const specialBookingModal  = document.getElementById('specialBookingModal');
  const specialBookingForm   = document.getElementById('specialBookingForm');
  const sbFacilitySelect     = document.getElementById('sbFacility');
  const sbVehicleOptions     = document.getElementById('sbVehicleOptions');
  const sbVehicleGroup       = document.getElementById('sbVehicleGroup');
  const sbDestinationGroup   = document.getElementById('sbDestinationGroup');
  const sbDepartmentSelect   = document.getElementById('sbDepartment');
  const sbCollegeSchoolGroup = document.getElementById('sbCollegeSchoolGroup');
  const sbCollegeSchoolSelect = document.getElementById('sbCollegeSchool');
  const sbNameInput          = document.getElementById('sbName');
  const sbNumPersonsInput    = document.getElementById('sbNumPersons');
  const sbStartDateInput     = document.getElementById('sbStartDate');
  const sbEndDateInput       = document.getElementById('sbEndDate');

  // Equipment quantity toggle
  document.querySelectorAll('#specialBookingForm .eq-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const qtyInput = e.target.parentElement.querySelector('.eq-qty');
      if (qtyInput) {
        qtyInput.style.display = e.target.checked ? 'inline-block' : 'none';
      }
    });
  });

  function updateSbVehicleVisibility() {
    const isVehicle = sbFacilitySelect && sbFacilitySelect.value === 'Vehicle';
    if (sbVehicleGroup) sbVehicleGroup.style.display = isVehicle ? '' : 'none';
    if (sbDestinationGroup) sbDestinationGroup.style.display = isVehicle ? '' : 'none';
    if (!isVehicle) {
      document.querySelectorAll('input[name="sbVehicle"]:checked').forEach(cb => { cb.checked = false; });
      const dest = document.getElementById('sbDestination');
      if (dest) dest.value = '';
    }
  }

  function updateSbCollegeSchoolVisibility() {
    const isCollege = sbDepartmentSelect && sbDepartmentSelect.value === 'College';
    if (sbCollegeSchoolGroup) sbCollegeSchoolGroup.style.display = isCollege ? '' : 'none';
    if (!isCollege && sbCollegeSchoolSelect) {
      sbCollegeSchoolSelect.value = '';
    }
  }

  if (sbFacilitySelect) sbFacilitySelect.addEventListener('change', updateSbVehicleVisibility);
  if (sbDepartmentSelect) sbDepartmentSelect.addEventListener('change', updateSbCollegeSchoolVisibility);

  if (sbNameInput) {
    sbNameInput.addEventListener('input', () => {
      sbNameInput.value = sbNameInput.value.toUpperCase();
    });
  }

  if (sbNumPersonsInput) {
    sbNumPersonsInput.addEventListener('keydown', (e) => {
      if (['+', '-', 'e', 'E', '.', ','].includes(e.key)) e.preventDefault();
    });
    Utils.stripNonDigitsInput(sbNumPersonsInput);
  }

  if (sbStartDateInput && sbEndDateInput) {
    sbStartDateInput.addEventListener('change', () => {
      if (sbStartDateInput.value) {
        sbEndDateInput.min = sbStartDateInput.value;
        if (!sbEndDateInput.value || sbEndDateInput.value < sbStartDateInput.value) {
          sbEndDateInput.value = sbStartDateInput.value;
        }
      }
    });
  }

  if (specialBookingBtn && specialBookingModal) {
    specialBookingBtn.addEventListener('click', () => {
      if (sbFacilitySelect && window._allFacilities && sbFacilitySelect.options.length <= 2) {
        while (sbFacilitySelect.options.length > 2) {
          sbFacilitySelect.remove(2);
        }
        window._allFacilities.forEach(f => {
          if (f.status === 'Active' && f.name !== 'Vehicle') {
            const option = document.createElement('option');
            option.value = f.name;
            option.textContent = f.name;
            sbFacilitySelect.appendChild(option);
          }
        });
      }

      if (sbVehicleOptions && sbVehicleOptions.children.length === 0) {
        VehicleModel.getActive()
          .then(activeVehicles => {
            sbVehicleOptions.innerHTML = '';
            activeVehicles.forEach(v => {
              const label = document.createElement('label');
              label.className = 'equipment-item';
              const cb = document.createElement('input');
              cb.type = 'checkbox';
              cb.name = 'sbVehicle';
              cb.value = v.name;
              label.appendChild(cb);
              label.appendChild(document.createTextNode(' ' + v.name));
              sbVehicleOptions.appendChild(label);
            });
            if (activeVehicles.length === 0) {
              sbVehicleOptions.innerHTML = '<span style="font-size:0.9rem; color:var(--gray-400);">No active vehicles</span>';
            }
          })
          .catch(err => {
            Logger.warn(LAYER, 'Could not load vehicles for special booking:', err);
            sbVehicleOptions.innerHTML = '<span style="font-size:0.9rem; color:var(--gray-400);">Error loading vehicles</span>';
          });
      }

      updateSbVehicleVisibility();
      updateSbCollegeSchoolVisibility();
      specialBookingModal.classList.add('visible');
    });

    specialBookingModal.addEventListener('click', (e) => {
      if (e.target === specialBookingModal) {
        specialBookingModal.classList.remove('visible');
      }
    });
  }

  function getSbEquipmentWithQuantities(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(cb => {
      const qtyInput = cb.parentElement.querySelector('.eq-qty');
      const qty = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;
      return { item: cb.value, qty };
    });
  }

  if (specialBookingForm) {
    specialBookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name           = (document.getElementById('sbName').value || '').trim().toUpperCase();
      const departmentRaw  = document.getElementById('sbDepartment').value;
      const collegeSchool  = sbCollegeSchoolSelect ? sbCollegeSchoolSelect.value : '';
      let finalDepartment  = departmentRaw;
      const employeeId     = document.getElementById('sbEmployeeId').value.trim();
      const email          = document.getElementById('sbEmail').value.trim();
      const facilityChoice = document.getElementById('sbFacility').value;
      const isVehicle      = facilityChoice === 'Vehicle';
      const facility       = isVehicle ? '' : facilityChoice;
      const startDate      = document.getElementById('sbStartDate').value;
      const endDate        = document.getElementById('sbEndDate').value;
      const startTime      = document.getElementById('sbStartTime').value;
      const endTime        = document.getElementById('sbEndTime').value;
      const numPersonsRaw  = document.getElementById('sbNumPersons').value.trim();
      const numPersons     = parseInt(numPersonsRaw, 10);
      const destination    = document.getElementById('sbDestination').value.trim();
      const purpose        = document.getElementById('sbPurpose').value.trim();
      const considerations = document.getElementById('sbConsiderations').value.trim();

      const vehicle = isVehicle
        ? Array.from(document.querySelectorAll('input[name="sbVehicle"]:checked')).map(cb => cb.value)
        : [];
      const equipment = getSbEquipmentWithQuantities('sbEquipment');

      if (!name)           { alert('Please enter requester name.'); return; }
      if (!departmentRaw)  { alert('Please select department.'); return; }
      if (departmentRaw === 'College') {
        if (!collegeSchool) {
          alert('Please select course/school of College.');
          if (sbCollegeSchoolSelect) sbCollegeSchoolSelect.focus();
          return;
        }
        finalDepartment = collegeSchool;
      }
      if (!employeeId)     { alert('Please enter employee ID.'); return; }
      if (!email)          { alert('Please enter email address.'); return; }
      if (!facilityChoice) { alert('Please select a facility or Vehicle.'); return; }
      if (!startDate)      { alert('Please select start date.'); return; }
      if (!endDate)        { alert('Please select end date.'); return; }
      if (endDate < startDate) { alert('End date cannot be earlier than start date.'); return; }
      if (!startTime)      { alert('Please select start time.'); return; }
      if (!endTime)        { alert('Please select end time.'); return; }
      if (startDate === endDate && endTime <= startTime) {
        alert('For same-day reservations, end time must be after start time.');
        return;
      }
      if (!numPersons || numPersons < 1)     { alert('Please enter a valid number of persons.'); return; }
      if (isVehicle && vehicle.length === 0) { alert('Please select at least one vehicle.'); return; }
      if (isVehicle && !destination)         { alert('Please enter a destination.'); return; }
      if (!purpose)                          { alert('Please describe the purpose.'); return; }

      const btn = document.getElementById('sbSubmitBtn');
      btn.innerHTML = '<span class="spinner"></span> Submitting...';
      btn.classList.add('loading');
      btn.disabled = true;

      try {
        const refId = await BookingModel.create({
          userType:         'Internal',
          name,
          department:       finalDepartment,
          parentDepartment: departmentRaw,
          collegeSchool:    departmentRaw === 'College' ? collegeSchool : '',
          employeeId,
          email,
          facility,
          date:             startDate,
          startDate,
          endDate,
          startTime,
          endTime,
          numPersons:       String(numPersons),
          vehicle,
          destination:      isVehicle ? destination : '',
          equipment,
          purpose,
          considerations,
          status:           'Approved'
        });

        specialBookingModal.classList.remove('visible');
        UiView.showToast('success', 'Special Booking Created', `Reservation ${refId} has been created and automatically approved.`);
        specialBookingForm.reset();
        updateSbVehicleVisibility();
        updateSbCollegeSchoolVisibility();
        document.querySelectorAll('#specialBookingForm .eq-qty').forEach(q => q.style.display = 'none');
      } catch (err) {
        Logger.error(LAYER, 'Special booking error:', err);
        if (err && err.code === 'permission-denied') {
          UiView.showToast('error', 'Permission Denied', 'Please publish the updated firestore.rules (settings/bookingId) in Firebase Console.');
        } else {
          UiView.showToast('error', 'Error', 'Failed to create special booking.');
        }
      } finally {
        btn.innerHTML = 'Submit Special Booking';
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    });
  }
})();

