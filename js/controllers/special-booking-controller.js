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
  const sbClassroomGroup     = document.getElementById('sbClassroomGroup');
  const sbClassroomSelect    = document.getElementById('sbClassroom');
  const sbVehicleOptions     = document.getElementById('sbVehicleOptions');
  const sbVehicleGroup       = document.getElementById('sbVehicleGroup');
  const sbDestinationGroup   = document.getElementById('sbDestinationGroup');
  const sbDepartmentSelect    = document.getElementById('sbDepartment');
  const sbCollegeSchoolGroup  = document.getElementById('sbCollegeSchoolGroup');
  const sbCollegeSchoolSelect = document.getElementById('sbCollegeSchool');
  const sbFirstNameInput      = document.getElementById('sbFirstName');
  const sbLastNameInput       = document.getElementById('sbLastName');
  const sbMiddleInitialInput  = document.getElementById('sbMiddleInitial');
  const sbContactInput        = document.getElementById('sbContact');
  const sbNumPersonsInput     = document.getElementById('sbNumPersons');
  const sbStartDateInput      = document.getElementById('sbStartDate');
  const sbEndDateInput        = document.getElementById('sbEndDate');

  if (sbContactInput && window.Utils && typeof Utils.stripNonDigitsInput === 'function') {
    Utils.stripNonDigitsInput(sbContactInput);
  }

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
    const val = sbFacilitySelect ? sbFacilitySelect.value : '';
    const isVehicle = val === 'Vehicle';
    const isClassroom = Utils.isClassroomFacilityName(val);

    if (sbVehicleGroup) sbVehicleGroup.style.display = isVehicle ? '' : 'none';
    if (sbDestinationGroup) sbDestinationGroup.style.display = isVehicle ? '' : 'none';
    if (sbClassroomGroup) sbClassroomGroup.style.display = isClassroom ? '' : 'none';

    if (!isVehicle) {
      document.querySelectorAll('input[name="sbVehicle"]:checked').forEach(cb => { cb.checked = false; });
      const dest = document.getElementById('sbDestination');
      if (dest) dest.value = '';
    }
    if (!isClassroom && sbClassroomSelect) {
      sbClassroomSelect.value = '';
    }
  }

  function updateSbCollegeSchoolVisibility() {
    const selectedCategory = sbDepartmentSelect ? sbDepartmentSelect.value : '';
    const hasCategory = Boolean(selectedCategory);
    if (sbCollegeSchoolGroup) sbCollegeSchoolGroup.style.display = hasCategory ? '' : 'none';

    if (hasCategory && sbCollegeSchoolSelect) {
      const prevVal = sbCollegeSchoolSelect.value;
      const allDepts = Array.isArray(window._allDepartments)
        ? window._allDepartments
        : (window.DepartmentModel ? DepartmentModel.DEFAULT_DEPARTMENTS : []);
      const matching = allDepts.filter(
        d => d.status === 'Active' && d.category === selectedCategory && d.name
      );

      sbCollegeSchoolSelect.innerHTML = '';
      if (matching.length > 0) {
        sbCollegeSchoolSelect.dataset.hasOffices = '1';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select Office / School';
        sbCollegeSchoolSelect.appendChild(placeholder);

        matching.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.name;
          opt.textContent = d.name;
          opt.dataset.headName = d.headName || '';
          sbCollegeSchoolSelect.appendChild(opt);
        });

        if (prevVal && matching.some(d => d.name === prevVal)) {
          sbCollegeSchoolSelect.value = prevVal;
        }
      } else {
        sbCollegeSchoolSelect.dataset.hasOffices = '0';
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = `No offices configured for ${selectedCategory} yet`;
        sbCollegeSchoolSelect.appendChild(emptyOpt);
      }
    } else if (sbCollegeSchoolSelect) {
      sbCollegeSchoolSelect.dataset.hasOffices = '0';
      sbCollegeSchoolSelect.value = '';
    }
  }

  if (sbFacilitySelect) sbFacilitySelect.addEventListener('change', updateSbVehicleVisibility);
  if (sbDepartmentSelect) sbDepartmentSelect.addEventListener('change', updateSbCollegeSchoolVisibility);

  [sbFirstNameInput, sbLastNameInput, sbMiddleInitialInput].forEach(el => {
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
      if (sbFacilitySelect && window._allFacilities) {
        const prev = sbFacilitySelect.value;
        while (sbFacilitySelect.options.length > 1) {
          sbFacilitySelect.remove(1);
        }
        window._allFacilities.forEach(f => {
          const vis = Utils.normalizeFacilityVisibility(f.visibility);
          if (f.status === 'Active' && f.name !== 'Vehicle' && (vis === 'both' || vis === 'internal')) {
            const option = document.createElement('option');
            option.value = f.name;
            option.textContent = f.name;
            sbFacilitySelect.appendChild(option);
          }
        });
        const vehOpt = document.createElement('option');
        vehOpt.value = 'Vehicle';
        vehOpt.textContent = 'Vehicle';
        sbFacilitySelect.appendChild(vehOpt);
        if (prev && Array.from(sbFacilitySelect.options).some(o => o.value === prev)) {
          sbFacilitySelect.value = prev;
        }
      }

      if (sbClassroomSelect) {
        const activeClassrooms = (window._allClassrooms || []).filter(c => c.status === 'Active' && c.name);
        while (sbClassroomSelect.options.length > 1) {
          sbClassroomSelect.remove(1);
        }
        activeClassrooms.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.name;
          opt.textContent = c.capacity ? `${c.name} (${c.capacity})` : c.name;
          sbClassroomSelect.appendChild(opt);
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

      const firstName      = (sbFirstNameInput ? sbFirstNameInput.value : '').trim().toUpperCase();
      const lastName       = (sbLastNameInput ? sbLastNameInput.value : '').trim().toUpperCase();
      const middleInitial  = (sbMiddleInitialInput ? sbMiddleInitialInput.value : '').trim().toUpperCase();
      const departmentRaw  = document.getElementById('sbDepartment').value;
      const collegeSchool  = sbCollegeSchoolSelect ? sbCollegeSchoolSelect.value : '';
      const hasOffices     = sbCollegeSchoolSelect && sbCollegeSchoolSelect.dataset.hasOffices === '1';
      let officeHead       = '';
      if (sbCollegeSchoolSelect && sbCollegeSchoolSelect.selectedIndex >= 0) {
        const selOpt = sbCollegeSchoolSelect.options[sbCollegeSchoolSelect.selectedIndex];
        officeHead = selOpt && selOpt.dataset ? (selOpt.dataset.headName || '') : '';
      }
      const finalDepartment = collegeSchool ? collegeSchool : departmentRaw;
      const position       = (document.getElementById('sbPosition') ? document.getElementById('sbPosition').value : '').trim();
      const contact        = (document.getElementById('sbContact') ? document.getElementById('sbContact').value : '').trim();
      const email          = document.getElementById('sbEmail').value.trim();
      const address        = 'San Isidro College Impalambong';
      const facilityChoice = document.getElementById('sbFacility').value;
      const isVehicle      = facilityChoice === 'Vehicle';
      const facility       = isVehicle ? '' : facilityChoice;
      const isClassroom    = Utils.isClassroomFacilityName(facility);
      const classroom      = (isClassroom && sbClassroomSelect) ? sbClassroomSelect.value.trim() : '';
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

      if (!firstName) {
        alert("Please enter requesting personnel's first name.");
        if (sbFirstNameInput) sbFirstNameInput.focus();
        return;
      }
      if (!lastName) {
        alert("Please enter requesting personnel's last name.");
        if (sbLastNameInput) sbLastNameInput.focus();
        return;
      }
      if (!middleInitial) {
        alert('Please enter middle initial (or N/A).');
        if (sbMiddleInitialInput) sbMiddleInitialInput.focus();
        return;
      }
      if (!departmentRaw)  { alert('Please select department.'); return; }
      if (hasOffices && !collegeSchool) {
        alert('Please select your Office / School.');
        if (sbCollegeSchoolSelect) sbCollegeSchoolSelect.focus();
        return;
      }
      if (!position)       { alert('Please enter position or designation.'); return; }
      if (!contact)        { alert('Please enter contact number.'); return; }
      if (!Utils.isDigitsOnly(contact)) { alert('Contact number must be numbers only.'); return; }
      if (!email || !Utils.isValidEmail(email)) { alert('Please enter a valid email address.'); return; }
      if (!facilityChoice) { alert('Please select a facility or Vehicle.'); return; }
      if (isClassroom && !classroom) {
        alert('Please select a classroom.');
        if (sbClassroomSelect) sbClassroomSelect.focus();
        return;
      }
      if (!startDate)      { alert('Please select start date.'); return; }
      if (!endDate)        { alert('Please select end date.'); return; }
      if (endDate < startDate) { alert('End date cannot be earlier than start date.'); return; }
      if (!startTime)      { alert('Please select start time.'); return; }
      if (!endTime)        { alert('Please select end time.'); return; }
      if (startDate === endDate && endTime <= startTime) {
        alert('For same-day reservations, end time must be after start time.');
        return;
      }
      if (!numPersons || numPersons < 1)     { alert('Please enter a valid number of participants.'); return; }
      if (isVehicle && vehicle.length === 0) { alert('Please select at least one vehicle.'); return; }
      if (isVehicle && !destination)         { alert('Please enter a destination.'); return; }
      if (!purpose)                          { alert('Please describe the purpose of activity.'); return; }

      const combinedName  = Utils.formatCombinedName(lastName, firstName, middleInitial);
      const filingDateStr = Utils.formatFilingDate(new Date());

      const btn = document.getElementById('sbSubmitBtn');
      btn.innerHTML = '<span class="spinner"></span> Submitting...';
      btn.classList.add('loading');
      btn.disabled = true;

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
          numPersons:       String(numPersons),
          purpose,
          equipment,
          vehicle,
          destination:      isVehicle ? destination : '',
          considerations,
          dateSubmitted:    filingDateStr,
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

