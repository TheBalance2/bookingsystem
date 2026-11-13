/* ============================================================
   Dashboard View — San Isidro College Reservation System
   View Layer (js/views/dashboard-view.js)
   Renders stats cards, filter dropdowns, bookings table, and
   booking details modal on dashboard.html. Never calls Firestore.
   ============================================================ */

(function () {
  'use strict';

  const BASE_INTERNAL_DEPTS = [
    'Administration',
    'College',
    'IBED',
    'Non-teaching Personnel'
  ];

  const KNOWN_COLLEGE_SCHOOLS = [
    'School of Education',
    'School of Business Administration',
    'School of Office Administration',
    'School of Information Technology',
    'School of Accountancy',
    'School of Nursing',
    'School of Midwifery',
    'School of Arts & Sciences',
    'School of Engineering'
  ];

  function isCollegeSchoolName(name) {
    if (!name) return false;
    const s = String(name).trim();
    if (!s) return false;
    if (KNOWN_COLLEGE_SCHOOLS.some(k => k.toLowerCase() === s.toLowerCase())) return true;
    return /^(School|College)\s+of\b/i.test(s);
  }

  function isCollegeBooking(b) {
    if (!b) return false;
    const pDept = String(b.parentDepartment || '').trim();
    const dept  = String(b.department || '').trim();
    const cSch  = String(b.collegeSchool || '').trim();
    if (pDept.toLowerCase() === 'college' || dept.toLowerCase() === 'college') return true;
    if (cSch) return true;
    return isCollegeSchoolName(dept) || isCollegeSchoolName(pDept);
  }

  function getExternalOrgName(b) {
    if (!b) return '';
    return String(b.agencyName || b.agency || b.organization || '').trim();
  }

  function renderAdminInfo(user, profile) {
    const adminEmail     = document.getElementById('adminEmail');
    const adminAvatar    = document.getElementById('adminAvatar');
    const adminRoleBadge = document.getElementById('adminRoleBadge');
    const effectiveProfile = profile || (window.Session && Session.profile) || null;
    const displayName    = (effectiveProfile && effectiveProfile.fullName)
      ? effectiveProfile.fullName
      : (user && user.email ? user.email : 'Staff');

    if (adminEmail) adminEmail.textContent = displayName;
    if (adminAvatar) adminAvatar.textContent = (displayName || 'A')[0].toUpperCase();
    if (adminRoleBadge) {
      const role = effectiveProfile ? effectiveProfile.role : '';
      adminRoleBadge.textContent = role === 'admin' ? 'Administrator' : 'Facility-In-Charge';
      adminRoleBadge.className = 'role-badge ' + (role === 'admin' ? 'role-badge-admin' : 'role-badge-fic');
      adminRoleBadge.style.display = 'inline-block';
    }
  }

  function renderStats(allBookings) {
    const pending  = allBookings.filter(b => b.status === 'Pending' || b.status === 'Pending Payment').length;
    const review   = allBookings.filter(b => b.status === 'Payment Under Review').length;
    const approved = allBookings.filter(b => b.status === 'Approved').length;
    const rejected = allBookings.filter(b => b.status === 'Rejected').length;
    const total    = allBookings.length;

    if (document.getElementById('statPending'))  document.getElementById('statPending').textContent  = pending + review;
    if (document.getElementById('statApproved')) document.getElementById('statApproved').textContent = approved;
    if (document.getElementById('statRejected')) document.getElementById('statRejected').textContent = rejected;
    if (document.getElementById('statTotal'))    document.getElementById('statTotal').textContent    = total;

    if (document.getElementById('countAll'))      document.getElementById('countAll').textContent      = total;
    if (document.getElementById('countPending'))  document.getElementById('countPending').textContent  = pending;
    if (document.getElementById('countReview'))   document.getElementById('countReview').textContent   = review;
    if (document.getElementById('countApproved')) document.getElementById('countApproved').textContent = approved;
    if (document.getElementById('countRejected')) document.getElementById('countRejected').textContent = rejected;
  }

  function populateFilterDropdowns(allBookings, allFacilities, allVehicles, filterState) {
    const filterFacilityVehicle = document.getElementById('filterFacilityVehicle');
    const filterDeptOrg         = document.getElementById('filterDeptOrg');

    if (filterFacilityVehicle) {
      const prevFacVal = filterState.facility;
      const facilitySet = new Set();
      const vehicleSet  = new Set();

      (allFacilities || []).forEach(f => {
        if (f && f.name) facilitySet.add(String(f.name).trim());
      });
      (allVehicles || []).forEach(v => {
        if (v && v.name) vehicleSet.add(String(v.name).trim());
      });

      allBookings.forEach(b => {
        if (b.facility) facilitySet.add(String(b.facility).trim());
        Utils.getBookingVehicleArray(b).forEach(vName => vehicleSet.add(vName));
      });

      filterFacilityVehicle.innerHTML = '<option value="">All Facilities &amp; Vehicles</option>';

      if (facilitySet.size > 0) {
        const facGroup = document.createElement('optgroup');
        facGroup.label = 'Facilities';
        Array.from(facilitySet).filter(Boolean).forEach(name => {
          const opt = document.createElement('option');
          opt.value = `fac:${name}`;
          opt.textContent = name;
          facGroup.appendChild(opt);
        });
        filterFacilityVehicle.appendChild(facGroup);
      }

      if (vehicleSet.size > 0) {
        const vehGroup = document.createElement('optgroup');
        vehGroup.label = 'Vehicles';

        const anyVehOpt = document.createElement('option');
        anyVehOpt.value = '__any_vehicle__';
        anyVehOpt.textContent = 'All Vehicles (Any)';
        vehGroup.appendChild(anyVehOpt);

        Array.from(vehicleSet).filter(Boolean).forEach(name => {
          const opt = document.createElement('option');
          opt.value = `veh:${name}`;
          opt.textContent = name;
          vehGroup.appendChild(opt);
        });
        filterFacilityVehicle.appendChild(vehGroup);
      }

      const validFacValues = Array.from(filterFacilityVehicle.options).map(o => o.value);
      if (prevFacVal && validFacValues.includes(prevFacVal)) {
        filterFacilityVehicle.value = prevFacVal;
      } else {
        filterState.facility = '';
        filterFacilityVehicle.value = '';
      }
    }

    if (filterDeptOrg) {
      const prevDeptVal      = filterState.deptOrg;
      const parentDeptSet    = new Set(BASE_INTERNAL_DEPTS);
      const officesByCategory = {
        'College': new Set(KNOWN_COLLEGE_SCHOOLS),
        'IBED': new Set(),
        'Non-teaching Personnel': new Set(),
        'Administration': new Set()
      };
      const otherIntDeptSet  = new Set();
      const externalOrgSet   = new Set();

      (window._allDepartments || []).forEach(d => {
        if (d && d.name && officesByCategory[d.category]) {
          officesByCategory[d.category].add(d.name);
        }
      });

      allBookings.forEach(b => {
        const uType = b.userType || 'Internal';
        if (uType === 'External') {
          const org = getExternalOrgName(b);
          if (org) externalOrgSet.add(org);
        } else {
          const pDept = String(b.parentDepartment || '').trim();
          const dept  = String(b.department || '').trim();
          const cSch  = String(b.collegeSchool || '').trim();

          if (pDept && officesByCategory[pDept] && cSch) {
            officesByCategory[pDept].add(cSch);
          } else if (cSch) {
            officesByCategory['College'].add(cSch);
          }

          [pDept, dept].forEach(val => {
            if (!val) return;
            if (BASE_INTERNAL_DEPTS.includes(val)) {
              parentDeptSet.add(val);
            } else if (isCollegeSchoolName(val)) {
              officesByCategory['College'].add(val);
            } else if (pDept && officesByCategory[pDept]) {
              officesByCategory[pDept].add(val);
            } else {
              otherIntDeptSet.add(val);
            }
          });
        }
      });

      filterDeptOrg.innerHTML = '<option value="">All Departments / Orgs</option>';

      const intGroup = document.createElement('optgroup');
      intGroup.label = 'Internal Departments';

      Array.from(parentDeptSet).forEach(dept => {
        const subOffices = Array.from(officesByCategory[dept] || [])
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

        const opt = document.createElement('option');
        opt.value = `int:${dept}`;
        opt.textContent = subOffices.length > 0 ? `${dept} (All Offices/Schools)` : dept;
        intGroup.appendChild(opt);

        subOffices.forEach(office => {
          const schoolOpt = document.createElement('option');
          schoolOpt.value = `int:${office}`;
          schoolOpt.textContent = `\u00A0\u00A0— ${office}`;
          intGroup.appendChild(schoolOpt);
        });
      });

      Array.from(otherIntDeptSet)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        .forEach(dept => {
          const opt = document.createElement('option');
          opt.value = `int:${dept}`;
          opt.textContent = dept;
          intGroup.appendChild(opt);
        });

      filterDeptOrg.appendChild(intGroup);

      if (externalOrgSet.size > 0) {
        const extGroup = document.createElement('optgroup');
        extGroup.label = 'External Organizations';
        Array.from(externalOrgSet)
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
          .forEach(org => {
            const opt = document.createElement('option');
            opt.value = `ext:${org}`;
            opt.textContent = org;
            extGroup.appendChild(opt);
          });
        filterDeptOrg.appendChild(extGroup);
      }

      const validDeptValues = Array.from(filterDeptOrg.options).map(o => o.value);
      if (prevDeptVal && validDeptValues.includes(prevDeptVal)) {
        filterDeptOrg.value = prevDeptVal;
      } else {
        filterState.deptOrg = '';
        filterDeptOrg.value = '';
      }
    }
  }

  function renderBookingsTable(filtered, baseTotal, filtersActive) {
    const tableBody             = document.getElementById('bookingsTableBody');
    const emptyState            = document.getElementById('emptyState');
    const emptyStateTitle       = document.getElementById('emptyStateTitle');
    const emptyStateText        = document.getElementById('emptyStateText');
    const clearBookingFiltersBtn = document.getElementById('clearBookingFiltersBtn');
    const bookingResultsSummary = document.getElementById('bookingResultsSummary');

    if (clearBookingFiltersBtn) {
      clearBookingFiltersBtn.disabled = !filtersActive;
    }

    if (bookingResultsSummary) {
      const countWord = baseTotal === 1 ? 'reservation' : 'reservations';
      bookingResultsSummary.textContent = `Showing ${filtered.length} of ${baseTotal} ${countWord}`;
    }

    if (!tableBody || !emptyState) return;

    if (filtered.length === 0) {
      tableBody.innerHTML = '';
      emptyState.style.display = 'block';
      if (emptyStateTitle && emptyStateText) {
        if (filtersActive) {
          emptyStateTitle.textContent = 'No reservations match your search/filters';
          emptyStateText.textContent  = 'Try adjusting your search keywords or click "Clear" to reset filters.';
        } else {
          emptyStateTitle.textContent = 'No reservations found';
          emptyStateText.textContent  = 'There are no reservations matching the current filter.';
        }
      }
      return;
    }

    emptyState.style.display = 'none';

    tableBody.innerHTML = filtered.map(b => {
      const statusClass = (b.status || '').toLowerCase().replace(/\s+/g, '-');
      const typeClass = (b.userType || 'Internal').toLowerCase();
      const showActions = b.status === 'Pending' || b.status === 'Payment Under Review';
      const locationBase = Utils.escapeHtml(Utils.getBookingLocation(b));
      const driverSub = b.assignedDriverName
        ? `<br><small style="color:var(--gray-400);">Driver: ${Utils.escapeHtml(b.assignedDriverName)}</small>`
        : '';
      const locationText = locationBase + driverSub;
      const isNewUnread = Boolean(
        window.BookingNotifier &&
        typeof window.BookingNotifier.isUnreadBooking === 'function' &&
        window.BookingNotifier.isUnreadBooking(b.id)
      );

      const dateRangeText = (b.startDate && b.endDate && b.startDate !== b.endDate)
        ? `${b.startDate} to ${b.endDate}`
        : (b.date || '—');
      const dateText = Utils.escapeHtml(dateRangeText);
      const timeFormatted = (b.startTime && b.endTime)
        ? `${Utils.formatTime12(b.startTime)} – ${Utils.formatTime12(b.endTime)}`
        : (b.startTime || b.endTime || '—');
      const timeText = Utils.escapeHtml(timeFormatted);
      const dateTime = `${dateText}<br><small style="color:var(--gray-300)">${timeText}</small>`;

      const ref = Utils.escapeHtml(b.referenceId || '—');
      const name = Utils.escapeHtml(Utils.getBookingRequesterName(b));
      const userType = Utils.escapeHtml(b.userType || '—');
      const purpose = Utils.escapeHtml(b.purpose || '—');
      const statusText = Utils.escapeHtml(b.status || '—');
      const safeId = Utils.escapeHtml(b.id);
      const isAdminRole = Boolean(window.Session && Session.isAdmin());
      const isFicRole   = Boolean(window.Session && Session.isFacilityInCharge());

      let actionsHtml = '';
      if (isAdminRole) {
        actionsHtml = `
          <div class="table-actions">
            <button class="action-btn facility-edit" onclick="viewBookingDetails('${safeId}')">View</button>
            <button class="action-btn reject" onclick="deleteBooking('${safeId}')" title="Delete booking">Delete</button>
          </div>
        `;
      } else if (isFicRole && showActions) {
        actionsHtml = `
          <div class="table-actions">
            <button class="action-btn approve" onclick="approveBooking('${safeId}')">Approve</button>
            <button class="action-btn reject" onclick="rejectBooking('${safeId}')">Reject</button>
          </div>
        `;
      } else {
        actionsHtml = `
          <div class="table-actions">
            <button class="action-btn facility-edit" onclick="viewBookingDetails('${safeId}')">View</button>
          </div>
        `;
      }

      return `
        <tr data-booking-id="${safeId}" class="${isNewUnread ? 'booking-row-new' : ''}">
          <td><strong style="color:var(--navy); cursor:pointer;" onclick="viewBookingDetails('${safeId}')">${ref}</strong></td>
          <td>${name}</td>
          <td><span class="user-badge ${typeClass}">${userType}</span></td>
          <td>${locationText}</td>
          <td>${dateTime}</td>
          <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${purpose}">${purpose}</td>
          <td><span class="status-badge ${statusClass}"><span class="status-dot"></span> ${statusText}</span></td>
          <td>${actionsHtml}</td>
        </tr>
      `;
    }).join('');
  }

  function renderBookingDetailsModal(booking, receiptUrl, { onApprove, onReject, onDelete, onClose }) {
    const detailsModal   = document.getElementById('detailsModal');
    const detailsContent = document.getElementById('detailsContent');
    if (!detailsModal || !detailsContent || !booking) return;

    const rows = [
      ['Reference',    booking.referenceId || '—'],
      ['Requester',    Utils.getBookingRequesterName(booking)],
      ['Type',         booking.userType || '—']
    ];

    if (booking.userType === 'Internal') {
      const deptDisplay = (booking.parentDepartment && booking.collegeSchool)
        ? `${booking.parentDepartment} — ${booking.collegeSchool}`
        : (booking.department || '—');
      rows.push(['Department / Office', deptDisplay]);
      if (booking.officeHead) {
        rows.push(['Dean / Office Head', booking.officeHead]);
      }
      if (booking.position) {
        rows.push(['Position / Designation', booking.position]);
      }
      if (booking.contactNumber) {
        rows.push(['Contact', booking.contactNumber]);
      }
      if (booking.employeeId) {
        rows.push(['Employee ID', booking.employeeId]);
      }
      rows.push(['Address', booking.address || 'San Isidro College Impalambong']);
    }

    if (booking.userType === 'External') {
      if (booking.agencyType) {
        rows.push(['Agency Type', booking.agencyType]);
      }
      rows.push(['Agency / Organization', booking.agencyName || booking.agency || booking.organization || '—']);
      if (booking.officeName) {
        rows.push(['Office / Department', booking.officeName]);
      }
      if (booking.position) {
        rows.push(['Position / Designation', booking.position]);
      }
      rows.push(['Contact', booking.contactNumber || '—']);
      rows.push(['Address', booking.address || '—']);
    }

    rows.push(
      ['Email',        booking.email || '—'],
      ['Facility',     booking.facility || '—']
    );

    if (booking.classroom) {
      rows.push(['Classroom', booking.classroom]);
    }

    rows.push(
      ['Vehicle',      Utils.formatVehicleList(booking.vehicle) || '—']
    );

    if (booking.destination) rows.push(['Destination', booking.destination]);
    if (booking.assignedDriverName) {
      const driverDisplay = booking.assignedDriverPhone
        ? `${booking.assignedDriverName} (${booking.assignedDriverPhone})`
        : booking.assignedDriverName;
      rows.push(['Assigned Driver', driverDisplay]);
    }

    const dateDisplay = (booking.startDate && booking.endDate && booking.startDate !== booking.endDate)
      ? `${booking.startDate} to ${booking.endDate}`
      : (booking.date || '—');

    rows.push(
      ['Date',         dateDisplay],
      ['Time',         (booking.startTime && booking.endTime) ? `${Utils.formatTime12(booking.startTime)} – ${Utils.formatTime12(booking.endTime)}` : (booking.startTime || booking.endTime || '—')],
      ['Num. of Persons', booking.numPersons || '—'],
      ['Purpose',      booking.purpose || '—'],
      ['Equipment',    (booking.equipment && booking.equipment.length) ? booking.equipment.map(e => typeof e === 'string' ? e : `${e.item} (x${e.qty})`).join(', ') : 'None']
    );

    if (booking.otherEquipment) rows.push(['Other Equip.', booking.otherEquipment]);
    if (booking.considerations) rows.push(['Considerations', booking.considerations]);

    rows.push(['Status', booking.status || '—']);

    let html = rows.map(([label, value]) =>
      `<div class="detail-row"><span class="detail-label">${Utils.escapeHtml(label)}</span><span class="detail-value">${Utils.escapeHtml(value)}</span></div>`
    ).join('');

    if (booking.userType === 'External') {
      if (receiptUrl) {
        html += `
          <div class="gcash-receipt-section">
            <div class="gcash-receipt-header">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#007DFE"/><path d="M7 12l3 3 7-7" stroke="white" stroke-width="2" fill="none"/></svg>
              <span>Business Office Payment Receipt</span>
            </div>
            <div class="gcash-receipt-img-wrapper">
              <img src="${receiptUrl}" alt="Payment Receipt" class="gcash-receipt-img" onclick="openReceiptImage(this.src)">
            </div>
            <button onclick="openReceiptImage(this.previousElementSibling.querySelector('img').src)" class="gcash-view-full-btn" style="border:none; cursor:pointer; width:100%; display:block; font-family:inherit;">View Full Receipt</button>
          </div>`;
      } else {
        html += `
          <div class="gcash-receipt-section no-receipt">
            <div class="gcash-receipt-header">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#007DFE"/><path d="M7 12l3 3 7-7" stroke="white" stroke-width="2" fill="none"/></svg>
              <span>Business Office Payment Receipt</span>
            </div>
            <p class="gcash-no-receipt-text">No receipt was uploaded for this booking.</p>
          </div>`;
      }
    }

    const isAdminRole = Boolean(window.Session && Session.isAdmin());
    const isFicRole   = Boolean(window.Session && Session.isFacilityInCharge());
    const isPendingActionable = isFicRole && (booking.status === 'Pending' || booking.status === 'Payment Under Review');
    const isVehBooking = Utils.isVehicleBooking(booking);

    if (isVehBooking && isPendingActionable) {
      const activeDrivers = (window._allDrivers || []).filter(d => d.status === 'Active' && d.name);
      const bStart = Utils.toDateTimeMs(booking.startDate || booking.date, booking.startTime);
      const bEnd   = Utils.toDateTimeMs(booking.endDate || booking.startDate || booking.date, booking.endTime);

      const busyDriverIds = new Set();
      const busyDriverNames = new Set();
      (window._allBookings || []).forEach(other => {
        if (other.id === booking.id || other.status !== 'Approved') return;
        if (!other.assignedDriverId && !other.assignedDriverName) return;
        const oStart = Utils.toDateTimeMs(other.startDate || other.date, other.startTime);
        const oEnd   = Utils.toDateTimeMs(other.endDate || other.startDate || other.date, other.endTime);
        if (!Number.isNaN(bStart) && !Number.isNaN(bEnd) && !Number.isNaN(oStart) && !Number.isNaN(oEnd)) {
          if (bStart < oEnd && bEnd > oStart) {
            if (other.assignedDriverId) busyDriverIds.add(other.assignedDriverId);
            if (other.assignedDriverName) busyDriverNames.add(other.assignedDriverName);
          }
        }
      });

      const driverOptionsHtml = activeDrivers.map(d => {
        const isBusy = busyDriverIds.has(d.id) || busyDriverNames.has(d.name);
        const selected = (booking.assignedDriverId === d.id || booking.assignedDriverName === d.name) ? 'selected' : '';
        const phoneText = d.phone ? ` — ${d.phone}` : '';
        const busyTag = isBusy ? ' (Already assigned on this date/time)' : '';
        return `<option value="${Utils.escapeHtml(d.id)}" data-name="${Utils.escapeHtml(d.name)}" data-phone="${Utils.escapeHtml(d.phone || '')}" ${selected}>${Utils.escapeHtml(d.name + phoneText + busyTag)}</option>`;
      }).join('');

      html += `
        <div class="gcash-receipt-section" id="driverAssignSection" style="margin-top:var(--space-md); border-color:rgba(212,168,67,0.45); background:rgba(212,168,67,0.06);">
          <div class="gcash-receipt-header" style="color:var(--navy);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17h14M5 17a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v1M5 17l-1 4h16l-1-4"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/></svg>
            <span>Assign Driver (Required Before Approval)</span>
          </div>
          <div style="padding:var(--space-sm) 0;">
            <select id="modalDriverSelect" style="width:100%; padding:10px 12px; border:1px solid var(--gray-200); border-radius:var(--radius-sm); background:var(--white); font-size:0.9rem; color:var(--navy);">
              <option value="">-- Select an Available Driver --</option>
              ${driverOptionsHtml}
            </select>
            ${activeDrivers.length === 0 ? `<p style="font-size:0.8rem; color:var(--warning); margin-top:6px;">No active drivers found. Add drivers in <strong>Manage Vehicles &rarr; Manage Drivers</strong>.</p>` : ''}
            <p id="modalDriverError" style="display:none; color:var(--danger); font-size:0.82rem; margin-top:6px; font-weight:600;">Please select a driver before approving this vehicle booking.</p>
          </div>
        </div>
      `;
    }

    detailsContent.innerHTML = html;

    const approveBtn = document.getElementById('modalApproveBtn');
    const rejectBtn  = document.getElementById('modalRejectBtn');
    const deleteBtn  = document.getElementById('modalDeleteBookingBtn');

    if (isPendingActionable) {
      approveBtn.style.display = 'inline-flex';
      rejectBtn.style.display  = 'inline-flex';
      approveBtn.onclick = () => {
        if (isVehBooking) {
          const driverSelect = document.getElementById('modalDriverSelect');
          const driverErr    = document.getElementById('modalDriverError');
          if (!driverSelect || !driverSelect.value) {
            if (driverErr) driverErr.style.display = 'block';
            if (driverSelect) {
              driverSelect.style.borderColor = 'var(--danger)';
              driverSelect.focus();
            }
            return;
          }
          const selOpt = driverSelect.options[driverSelect.selectedIndex];
          const driverPayload = {
            assignedDriverId:    driverSelect.value,
            assignedDriverName:  selOpt ? (selOpt.dataset.name || '') : '',
            assignedDriverPhone: selOpt ? (selOpt.dataset.phone || '') : ''
          };
          if (onClose) onClose();
          if (onApprove) onApprove(booking.id, driverPayload);
          return;
        }
        if (onClose) onClose();
        if (onApprove) onApprove(booking.id);
      };
      rejectBtn.onclick = () => { if (onClose) onClose(); if (onReject) onReject(booking.id); };
    } else {
      approveBtn.style.display = 'none';
      rejectBtn.style.display  = 'none';
    }

    if (deleteBtn) {
      if (isAdminRole) {
        deleteBtn.style.display = 'inline-flex';
        deleteBtn.onclick = () => { if (onClose) onClose(); if (onDelete) onDelete(booking.id); };
      } else {
        deleteBtn.style.display = 'none';
        deleteBtn.onclick = null;
      }
    }

    detailsModal.classList.add('visible');
  }

  window.DashboardView = {
    BASE_INTERNAL_DEPTS,
    KNOWN_COLLEGE_SCHOOLS,
    isCollegeSchoolName,
    isCollegeBooking,
    getExternalOrgName,
    renderAdminInfo,
    renderStats,
    populateFilterDropdowns,
    renderBookingsTable,
    renderBookingDetailsModal
  };
})();

