/* ============================================================
   Admin Dashboard Module — San Isidro College Reservation System
   Auth guard, real-time bookings table, approve/reject, EmailJS
   ============================================================ */

(function () {
  'use strict';

  // ---- Initialize EmailJS ----
  try {
    emailjs.init(EMAILJS_PUBLIC_KEY);
  } catch (e) {
    console.warn('EmailJS not loaded or not configured:', e);
  }

  // ---- State ----
  let allBookings  = [];
  let activeFilter = 'all';
  let currentModalDocId = null;
  let deletingBookingId = null;

  // ---- DOM ----
  const tableBody      = document.getElementById('bookingsTableBody');
  const emptyState     = document.getElementById('emptyState');
  const emptyStateTitle = document.getElementById('emptyStateTitle');
  const emptyStateText  = document.getElementById('emptyStateText');
  const filterTabs     = document.getElementById('filterTabs');
  const detailsModal   = document.getElementById('detailsModal');
  const detailsContent = document.getElementById('detailsContent');
  const adminEmail     = document.getElementById('adminEmail');
  const adminAvatar    = document.getElementById('adminAvatar');
  const logoutBtn      = document.getElementById('logoutBtn');
  const toastContainer = document.getElementById('toastContainer');

  // Search & Filter DOM
  const bookingSearchInput     = document.getElementById('bookingSearchInput');
  const bookingSearchClearBtn  = document.getElementById('bookingSearchClearBtn');
  const filterFacilityVehicle  = document.getElementById('filterFacilityVehicle');
  const filterUserType         = document.getElementById('filterUserType');
  const filterDeptOrg          = document.getElementById('filterDeptOrg');
  const filterDateFrom         = document.getElementById('filterDateFrom');
  const filterDateTo           = document.getElementById('filterDateTo');
  const filterSort             = document.getElementById('filterSort');
  const clearBookingFiltersBtn = document.getElementById('clearBookingFiltersBtn');
  const bookingResultsSummary  = document.getElementById('bookingResultsSummary');

  const filterState = {
    search:   '',
    facility: '',
    userType: '',
    deptOrg:  '',
    dateFrom: '',
    dateTo:   '',
    sort:     'submitted_desc'
  };

  // Sidebar links
  const sidebarLinks = document.querySelectorAll('.sidebar-link[data-filter]');

  // ---------- Sanitizers ----------
  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
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

  function formatTimeRange12(startTime, endTime, separator = ' – ', fallback = '—') {
    if (!startTime && !endTime) return fallback;
    if (startTime && !endTime) return formatTime12(startTime, fallback);
    if (!startTime && endTime) return formatTime12(endTime, fallback);
    return `${formatTime12(startTime, fallback)}${separator}${formatTime12(endTime, fallback)}`;
  }

  // ============================================================
  // AUTH GUARD
  // ============================================================
  auth.onAuthStateChanged(user => {
    if (!user) {
      window.location.href = 'admin.html';
      return;
    }
    // Populate admin info
    if (adminEmail) adminEmail.textContent = user.email;
    if (adminAvatar) adminAvatar.textContent = (user.email || 'A')[0].toUpperCase();

    // Initialize real-time notifications UI & listeners
    if (window.BookingNotifier && typeof window.BookingNotifier.init === 'function') {
      window.BookingNotifier.init();
    }

    // Start listening to bookings
    listenBookings();

    // Start listening to facilities
    listenFacilities();

    // Start listening to vehicles
    if (typeof listenVehicles === 'function') listenVehicles();

    // Start listening to sequential Booking ID settings
    if (typeof listenBookingIdConfig === 'function') listenBookingIdConfig();

    // Start listening to Internal PDF Signatories settings
    if (typeof listenSignatoriesConfig === 'function') listenSignatoriesConfig();
  });

  // ============================================================
  // LOGOUT
  // ============================================================
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await auth.signOut();
      window.location.href = 'admin.html';
    });
  }

  // ============================================================
  // FIRESTORE REAL-TIME LISTENER
  // ============================================================
  function listenBookings() {
    db.collection('bookings')
      .orderBy('createdAt', 'desc')
      .onSnapshot(snapshot => {
        allBookings = [];
        snapshot.forEach(doc => {
          allBookings.push({ id: doc.id, ...doc.data() });
        });
        window._allBookings = allBookings; // Expose for reports module
        if (window.BookingNotifier && typeof window.BookingNotifier.processSnapshot === 'function') {
          window.BookingNotifier.processSnapshot(snapshot);
        }
        populateFilterOptions();
        updateStats();
        renderTable();
      }, err => {
        console.error('Firestore listener error:', err);
      });
  }

  // ============================================================
  // STATS
  // ============================================================
  function updateStats() {
    const pending  = allBookings.filter(b => b.status === 'Pending' || b.status === 'Pending Payment').length;
    const review   = allBookings.filter(b => b.status === 'Payment Under Review').length;
    const approved = allBookings.filter(b => b.status === 'Approved').length;
    const rejected = allBookings.filter(b => b.status === 'Rejected').length;
    const total    = allBookings.length;

    if (document.getElementById('statPending')) document.getElementById('statPending').textContent  = pending + review;
    if (document.getElementById('statApproved')) document.getElementById('statApproved').textContent = approved;
    if (document.getElementById('statRejected')) document.getElementById('statRejected').textContent = rejected;
    if (document.getElementById('statTotal')) document.getElementById('statTotal').textContent    = total;

    if (document.getElementById('countAll')) document.getElementById('countAll').textContent     = total;
    if (document.getElementById('countPending')) document.getElementById('countPending').textContent  = pending;
    if (document.getElementById('countReview')) document.getElementById('countReview').textContent  = review;
    if (document.getElementById('countApproved')) document.getElementById('countApproved').textContent = approved;
    if (document.getElementById('countRejected')) document.getElementById('countRejected').textContent = rejected;
  }

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

  function getBookingLocation(booking) {
    if (booking.facility) return booking.facility;
    return formatVehicleList(booking.vehicle) || '—';
  }

  function getBookingRequesterName(b) {
    if (!b) return '—';
    if (b.name) return b.name;
    if (b.lastName || b.firstName) {
      const mi = b.middleInitial ? (b.middleInitial.endsWith('.') ? b.middleInitial : b.middleInitial + '.') : '';
      const firstMi = [b.firstName, mi].filter(Boolean).join(' ');
      return b.lastName ? `${b.lastName}, ${firstMi}` : firstMi;
    }
    return b.contactPerson || '—';
  }

  function getExternalOrgName(b) {
    if (!b) return '';
    return String(b.agencyName || b.agency || b.organization || '').trim();
  }

  function normalizeIsoDate(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    return '';
  }

  function getBookingDateBounds(b) {
    if (!b) return null;
    let rawStart = b.startDate || '';
    let rawEnd   = b.endDate || '';

    if (!rawStart && b.date) {
      const dateStr = String(b.date);
      if (dateStr.includes(' to ')) {
        const parts = dateStr.split(' to ');
        rawStart = parts[0];
        rawEnd   = parts[1] || parts[0];
      } else {
        rawStart = dateStr;
      }
    }

    const start = normalizeIsoDate(rawStart);
    if (!start) return null;
    const endParsed = normalizeIsoDate(rawEnd);
    const end = (endParsed && endParsed >= start) ? endParsed : start;
    return { start, end };
  }

  function getCreatedAtMs(b) {
    if (!b || !b.createdAt) return 0;
    if (typeof b.createdAt.toMillis === 'function') return b.createdAt.toMillis();
    if (typeof b.createdAt.seconds === 'number') return b.createdAt.seconds * 1000;
    const t = new Date(b.createdAt).getTime();
    return isNaN(t) ? 0 : t;
  }

  function getLocalTodayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function hasActiveSearchOrFilter() {
    return Boolean(
      filterState.search ||
      filterState.facility ||
      filterState.userType ||
      filterState.deptOrg ||
      filterState.dateFrom ||
      filterState.dateTo ||
      filterState.sort !== 'submitted_desc'
    );
  }

  // ============================================================
  // POPULATE DYNAMIC FILTER DROPDOWNS
  // ============================================================
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

  function populateFilterOptions() {
    // 1. Facility / Vehicle dropdown
    if (filterFacilityVehicle) {
      const prevFacVal = filterState.facility;
      const facilitySet = new Set();
      const vehicleSet  = new Set();

      (window._allFacilities || []).forEach(f => {
        if (f && f.name) facilitySet.add(String(f.name).trim());
      });
      (window._allVehicles || []).forEach(v => {
        if (v && v.name) vehicleSet.add(String(v.name).trim());
      });

      allBookings.forEach(b => {
        if (b.facility) facilitySet.add(String(b.facility).trim());
        getBookingVehicleArray(b).forEach(vName => vehicleSet.add(vName));
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

    // 2. Department / Organization grouped dropdown
    if (filterDeptOrg) {
      const prevDeptVal = filterState.deptOrg;
      const parentDeptSet    = new Set(BASE_INTERNAL_DEPTS);
      const collegeSchoolSet = new Set(KNOWN_COLLEGE_SCHOOLS);
      const otherIntDeptSet  = new Set();
      const externalOrgSet   = new Set();

      allBookings.forEach(b => {
        const uType = b.userType || 'Internal';
        if (uType === 'External') {
          const org = getExternalOrgName(b);
          if (org) externalOrgSet.add(org);
        } else {
          const pDept = String(b.parentDepartment || '').trim();
          const dept  = String(b.department || '').trim();
          const cSch  = String(b.collegeSchool || '').trim();

          [pDept, dept].forEach(val => {
            if (!val) return;
            if (BASE_INTERNAL_DEPTS.includes(val)) {
              parentDeptSet.add(val);
            } else if (isCollegeSchoolName(val)) {
              collegeSchoolSet.add(val);
            } else {
              otherIntDeptSet.add(val);
            }
          });

          if (cSch) {
            collegeSchoolSet.add(cSch);
          }
        }
      });

      filterDeptOrg.innerHTML = '<option value="">All Departments / Orgs</option>';

      const intGroup = document.createElement('optgroup');
      intGroup.label = 'Internal Departments';

      const sortedSchools = Array.from(collegeSchoolSet)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

      Array.from(parentDeptSet).forEach(dept => {
        const opt = document.createElement('option');
        opt.value = `int:${dept}`;
        opt.textContent = dept === 'College' ? 'College (All Schools)' : dept;
        intGroup.appendChild(opt);

        // Nest indented College schools directly underneath "College (All Schools)"
        if (dept === 'College') {
          sortedSchools.forEach(school => {
            const schoolOpt = document.createElement('option');
            schoolOpt.value = `int:${school}`;
            schoolOpt.textContent = `\u00A0\u00A0— ${school}`;
            intGroup.appendChild(schoolOpt);
          });
        }
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

  // ============================================================
  // FILTER + SORT PIPELINE
  // ============================================================
  function getStatusFilteredBookings() {
    if (activeFilter === 'all') return allBookings;
    if (activeFilter === 'Pending') {
      return allBookings.filter(b => b.status === 'Pending' || b.status === 'Pending Payment');
    }
    return allBookings.filter(b => b.status === activeFilter);
  }

  function getFilteredBookings() {
    const statusBase = getStatusFilteredBookings();
    const q = filterState.search.trim().toLowerCase();

    const matched = statusBase.filter(b => {
      // 1. Text search: referenceId, requester name variants, email, purpose
      if (q) {
        const haystack = [
          b.referenceId,
          getBookingRequesterName(b),
          b.name,
          b.contactPerson,
          b.firstName,
          b.lastName,
          b.email,
          b.purpose
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      // 2. Facility / Vehicle filter
      if (filterState.facility) {
        if (filterState.facility === '__any_vehicle__') {
          if (getBookingVehicleArray(b).length === 0) return false;
        } else if (filterState.facility.startsWith('fac:')) {
          const targetFac = filterState.facility.slice(4);
          if ((b.facility || '').trim() !== targetFac) return false;
        } else if (filterState.facility.startsWith('veh:')) {
          const targetVeh = filterState.facility.slice(4);
          if (!getBookingVehicleArray(b).includes(targetVeh)) return false;
        }
      }

      // 3. User Type filter
      if (filterState.userType) {
        const bType = b.userType || 'Internal';
        if (bType !== filterState.userType) return false;
      }

      // 4. Department / Organization filter
      if (filterState.deptOrg) {
        const bType = b.userType || 'Internal';
        if (filterState.deptOrg.startsWith('int:')) {
          if (bType !== 'Internal') return false;
          const targetDept = filterState.deptOrg.slice(4);
          if (targetDept === 'College') {
            if (!isCollegeBooking(b)) return false;
          } else {
            const targetLower = targetDept.toLowerCase();
            const matchesDept =
              String(b.parentDepartment || '').trim().toLowerCase() === targetLower ||
              String(b.department || '').trim().toLowerCase() === targetLower ||
              String(b.collegeSchool || '').trim().toLowerCase() === targetLower;
            if (!matchesDept) return false;
          }
        } else if (filterState.deptOrg.startsWith('ext:')) {
          if (bType !== 'External') return false;
          const targetOrg = filterState.deptOrg.slice(4);
          if (getExternalOrgName(b) !== targetOrg) return false;
        }
      }

      // 5. Event Date Range overlap filter
      if (filterState.dateFrom || filterState.dateTo) {
        const bounds = getBookingDateBounds(b);
        if (!bounds) return false;
        if (filterState.dateFrom && bounds.end < filterState.dateFrom) return false;
        if (filterState.dateTo && bounds.start > filterState.dateTo) return false;
      }

      return true;
    });

    // 6. Sort
    const sorted = matched.slice();
    const sortMode = filterState.sort || 'submitted_desc';

    if (sortMode === 'submitted_asc') {
      sorted.sort((a, b) => getCreatedAtMs(a) - getCreatedAtMs(b));
    } else if (sortMode === 'submitted_desc') {
      sorted.sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));
    } else if (sortMode === 'event_desc') {
      sorted.sort((a, b) => {
        const ba = getBookingDateBounds(a);
        const bb = getBookingDateBounds(b);
        if (!ba && !bb) return getCreatedAtMs(b) - getCreatedAtMs(a);
        if (!ba) return 1;
        if (!bb) return -1;
        const ka = `${ba.start} ${a.startTime || '00:00'}`;
        const kb = `${bb.start} ${b.startTime || '00:00'}`;
        if (kb !== ka) return kb.localeCompare(ka);
        return getCreatedAtMs(b) - getCreatedAtMs(a);
      });
    } else if (sortMode === 'event_asc') {
      const todayIso = getLocalTodayIso();
      const hasRangeFilter = Boolean(filterState.dateFrom || filterState.dateTo);

      sorted.sort((a, b) => {
        const ba = getBookingDateBounds(a);
        const bb = getBookingDateBounds(b);
        if (!ba && !bb) return getCreatedAtMs(b) - getCreatedAtMs(a);
        if (!ba) return 1;
        if (!bb) return -1;

        if (!hasRangeFilter) {
          const aUpcoming = ba.end >= todayIso;
          const bUpcoming = bb.end >= todayIso;
          if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
          if (!aUpcoming && !bUpcoming) {
            // Both in the past: show most recent past first
            const kaPast = `${ba.start} ${a.startTime || '00:00'}`;
            const kbPast = `${bb.start} ${b.startTime || '00:00'}`;
            return kbPast.localeCompare(kaPast);
          }
        }

        const ka = `${ba.start} ${a.startTime || '00:00'}`;
        const kb = `${bb.start} ${b.startTime || '00:00'}`;
        if (ka !== kb) return ka.localeCompare(kb);
        return getCreatedAtMs(b) - getCreatedAtMs(a);
      });
    } else if (sortMode === 'ref_asc' || sortMode === 'ref_desc') {
      sorted.sort((a, b) => {
        const ra = String(a.referenceId || '').trim();
        const rb = String(b.referenceId || '').trim();
        if (!ra && !rb) return getCreatedAtMs(b) - getCreatedAtMs(a);
        if (!ra) return 1;
        if (!rb) return -1;
        const cmp = ra.localeCompare(rb, undefined, { numeric: true, sensitivity: 'base' });
        if (cmp !== 0) return sortMode === 'ref_asc' ? cmp : -cmp;
        return getCreatedAtMs(b) - getCreatedAtMs(a);
      });
    }

    return { filtered: sorted, baseTotal: statusBase.length };
  }

  // ============================================================
  // RENDER TABLE
  // ============================================================
  function renderTable() {
    const { filtered, baseTotal } = getFilteredBookings();
    const filtersActive = hasActiveSearchOrFilter();

    if (clearBookingFiltersBtn) {
      clearBookingFiltersBtn.disabled = !filtersActive;
    }

    if (bookingResultsSummary) {
      const countWord = baseTotal === 1 ? 'reservation' : 'reservations';
      bookingResultsSummary.textContent = `Showing ${filtered.length} of ${baseTotal} ${countWord}`;
    }

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
      const locationText = escapeHtml(getBookingLocation(b));
      const isNewUnread = Boolean(
        window.BookingNotifier &&
        typeof window.BookingNotifier.isUnreadBooking === 'function' &&
        window.BookingNotifier.isUnreadBooking(b.id)
      );

      const dateRangeText = (b.startDate && b.endDate && b.startDate !== b.endDate)
        ? `${b.startDate} to ${b.endDate}`
        : (b.date || '—');
      const dateText = escapeHtml(dateRangeText);
      const timeFormatted = (b.startTime && b.endTime)
        ? `${formatTime12(b.startTime)} – ${formatTime12(b.endTime)}`
        : (b.startTime || b.endTime || '—');
      const timeText = escapeHtml(timeFormatted);
      const dateTime = `${dateText}<br><small style="color:var(--gray-300)">${timeText}</small>`;

      const ref = escapeHtml(b.referenceId || '—');
      const name = escapeHtml(getBookingRequesterName(b));
      const userType = escapeHtml(b.userType || '—');
      const purpose = escapeHtml(b.purpose || '—');
      const statusText = escapeHtml(b.status || '—');
      const safeId = escapeHtml(b.id);

      return `
        <tr data-booking-id="${safeId}" class="${isNewUnread ? 'booking-row-new' : ''}">
          <td><strong style="color:var(--navy); cursor:pointer;" onclick="viewBookingDetails('${safeId}')">${ref}</strong></td>
          <td>${name}</td>
          <td><span class="user-badge ${typeClass}">${userType}</span></td>
          <td>${locationText}</td>
          <td>${dateTime}</td>
          <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${purpose}">${purpose}</td>
          <td><span class="status-badge ${statusClass}"><span class="status-dot"></span> ${statusText}</span></td>
          <td>
            ${showActions ? `
              <div class="table-actions">
                <button class="action-btn approve" onclick="approveBooking('${safeId}')">Approve</button>
                <button class="action-btn reject" onclick="rejectBooking('${safeId}')">Reject</button>
              </div>
            ` : `<div class="table-actions">
                <button class="action-btn reject" onclick="deleteBooking('${safeId}')" title="Delete booking">Delete</button>
              </div>`}
          </td>
        </tr>
      `;
    }).join('');
  }

  // ============================================================
  // SEARCH & FILTER EVENT LISTENERS
  // ============================================================
  let searchDebounceTimer = null;

  if (bookingSearchInput) {
    bookingSearchInput.addEventListener('input', () => {
      const val = bookingSearchInput.value;
      if (bookingSearchClearBtn) {
        bookingSearchClearBtn.style.display = val ? 'inline-flex' : 'none';
      }
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        filterState.search = val;
        renderTable();
      }, 200);
    });
  }

  if (bookingSearchClearBtn && bookingSearchInput) {
    bookingSearchClearBtn.addEventListener('click', () => {
      clearTimeout(searchDebounceTimer);
      bookingSearchInput.value = '';
      bookingSearchClearBtn.style.display = 'none';
      filterState.search = '';
      renderTable();
      bookingSearchInput.focus();
    });
  }

  if (filterFacilityVehicle) {
    filterFacilityVehicle.addEventListener('change', () => {
      filterState.facility = filterFacilityVehicle.value;
      renderTable();
    });
  }

  if (filterUserType) {
    filterUserType.addEventListener('change', () => {
      filterState.userType = filterUserType.value;
      renderTable();
    });
  }

  if (filterDeptOrg) {
    filterDeptOrg.addEventListener('change', () => {
      filterState.deptOrg = filterDeptOrg.value;
      renderTable();
    });
  }

  if (filterDateFrom) {
    filterDateFrom.addEventListener('change', () => {
      filterState.dateFrom = filterDateFrom.value;
      renderTable();
    });
  }

  if (filterDateTo) {
    filterDateTo.addEventListener('change', () => {
      filterState.dateTo = filterDateTo.value;
      renderTable();
    });
  }

  if (filterSort) {
    filterSort.addEventListener('change', () => {
      filterState.sort = filterSort.value || 'submitted_desc';
      renderTable();
    });
  }

  if (clearBookingFiltersBtn) {
    clearBookingFiltersBtn.addEventListener('click', () => {
      clearTimeout(searchDebounceTimer);
      filterState.search   = '';
      filterState.facility = '';
      filterState.userType = '';
      filterState.deptOrg  = '';
      filterState.dateFrom = '';
      filterState.dateTo   = '';
      filterState.sort     = 'submitted_desc';

      if (bookingSearchInput) bookingSearchInput.value = '';
      if (bookingSearchClearBtn) bookingSearchClearBtn.style.display = 'none';
      if (filterFacilityVehicle) filterFacilityVehicle.value = '';
      if (filterUserType) filterUserType.value = '';
      if (filterDeptOrg) filterDeptOrg.value = '';
      if (filterDateFrom) filterDateFrom.value = '';
      if (filterDateTo) filterDateTo.value = '';
      if (filterSort) filterSort.value = 'submitted_desc';

      renderTable();
    });
  }

  // ============================================================
  // FILTER TABS
  // ============================================================
  if (filterTabs) {
    filterTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.filter-tab');
      if (!tab) return;

      filterTabs.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.filter;

      // Sync sidebar
      sidebarLinks.forEach(l => {
        l.classList.toggle('active', l.dataset.filter === activeFilter);
      });

      renderTable();
    });
  }

  // Sidebar filter clicks
  sidebarLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const filter = link.dataset.filter;
      activeFilter = filter;

      sidebarLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      // Sync filter tabs
      filterTabs.querySelectorAll('.filter-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.filter === filter);
      });

      renderTable();
    });
  });

  // ============================================================
  // APPROVE / REJECT
  // ============================================================
  window.approveBooking = async function (docId) {
    if (!confirm('Approve this reservation?')) return;
    await updateBookingStatus(docId, 'Approved');
  };

  window.rejectBooking = async function (docId) {
    if (!confirm('Reject this reservation?')) return;
    await updateBookingStatus(docId, 'Rejected');
  };

  async function updateBookingStatus(docId, newStatus) {
    try {
      const docRef = db.collection('bookings').doc(docId);
      
      await docRef.update({ status: newStatus });

      // Fetch updated doc for email
      const doc = await docRef.get();
      const data = doc.data();

      // Send email notification
      sendStatusEmail(data, newStatus);

      showToast(
        newStatus === 'Approved' ? 'success' : 'warning',
        `Reservation ${newStatus}`,
        `${data.name}'s booking for ${getBookingLocation(data)} has been ${newStatus.toLowerCase()}.`
      );
    } catch (err) {
      console.error('Status update failed:', err);
      showToast('error', 'Error', 'Failed to update reservation status.');
    }
  }

  // ============================================================
  // EMAIL NOTIFICATION (EmailJS)
  // ============================================================
  function sendStatusEmail(bookingData, status) {
    // Choose correct template based on status
    const templateId = status === 'Approved' ? EMAILJS_TEMPLATE_APPROVE : EMAILJS_TEMPLATE_REJECT;

    // Only send if EmailJS is configured
    if (!EMAILJS_SERVICE_ID || EMAILJS_SERVICE_ID.startsWith('YOUR_')) {
      console.log('EmailJS not configured — skipping email send. Booking data:', bookingData);
      return;
    }

    const messageText = status === 'Approved' 
      ? 'Your reservation request (Ref: ' + (bookingData.referenceId || '—') + ') has been APPROVED by the administrator.'
      : 'Your reservation request (Ref: ' + (bookingData.referenceId || '—') + ') has been REJECTED by the administrator.';

    try {
      emailjs.send(EMAILJS_SERVICE_ID, templateId, {
        to_email:         bookingData.email,
        to_name:          bookingData.name,
        facility:         getBookingLocation(bookingData),
        vehicle:          formatVehicleList(bookingData.vehicle),
        date:             bookingData.date,
        start_time:       formatTime12(bookingData.startTime),
        end_time:         formatTime12(bookingData.endTime),
        purpose:          bookingData.purpose,
        reference_id:     bookingData.referenceId || '—',
        status:           status,
        message:          messageText
      }).then(() => {
        console.log('Email sent successfully to', bookingData.email);
      }).catch(err => {
        console.warn('EmailJS send failed:', err);
      });
    } catch (e) {
      console.warn('EmailJS error:', e);
    }
  }

  // ============================================================
  // VIEW BOOKING DETAILS
  // ============================================================
  window.viewBookingDetails = async function (docId) {
    const booking = allBookings.find(b => b.id === docId);
    if (!booking) return;

    currentModalDocId = docId;
    if (window.BookingNotifier && typeof window.BookingNotifier.markBookingRead === 'function') {
      window.BookingNotifier.markBookingRead(docId);
    }

    let rows = [
      ['Reference',    booking.referenceId || '—'],
      ['Requester',    getBookingRequesterName(booking)],
      ['Type',         booking.userType || '—']
    ];

    // Internal-specific fields
    if (booking.userType === 'Internal') {
      rows.push(['Department', booking.department || '—']);
      rows.push(['Employee ID', booking.employeeId || '—']);
    }

    // External-specific fields
    if (booking.userType === 'External') {
      if (booking.agencyType) {
        rows.push(['Agency Type', booking.agencyType]);
      }
      rows.push(['Agency / Organization', booking.agencyName || booking.agency || booking.organization || '—']);
      if (booking.officeName) {
        rows.push(['Office / Department', booking.officeName]);
      }
      rows.push(['Contact', booking.contactNumber || '—']);
      rows.push(['Address', booking.address || '—']);
    }

    rows.push(
      ['Email',        booking.email || '—'],
      ['Facility',     booking.facility || '—'],
      ['Vehicle',      formatVehicleList(booking.vehicle) || '—']
    );

    if (booking.destination) rows.push(['Destination', booking.destination]);

    const dateDisplay = (booking.startDate && booking.endDate && booking.startDate !== booking.endDate)
      ? `${booking.startDate} to ${booking.endDate}`
      : (booking.date || '—');

    rows.push(
      ['Date',         dateDisplay],
      ['Time',         (booking.startTime && booking.endTime) ? `${formatTime12(booking.startTime)} – ${formatTime12(booking.endTime)}` : (booking.startTime || booking.endTime || '—')],
      ['Num. of Persons', booking.numPersons || '—'],
      ['Purpose',      booking.purpose || '—'],
      ['Equipment',    (booking.equipment && booking.equipment.length) ? booking.equipment.map(e => typeof e === 'string' ? e : `${e.item} (x${e.qty})`).join(', ') : 'None']
    );

    if (booking.otherEquipment) rows.push(['Other Equip.', booking.otherEquipment]);
    if (booking.considerations) rows.push(['Considerations', booking.considerations]);

    rows.push(['Status', booking.status || '—']);

    let html = rows.map(([label, value]) =>
      `<div class="detail-row"><span class="detail-label">${escapeHtml(label)}</span><span class="detail-value">${escapeHtml(value)}</span></div>`
    ).join('');

    // Show uploaded receipt for external bookings (if they have one)
    if (booking.userType === 'External') {
      // Fetch receipt from separate receipts collection
      let receiptUrl = '';
      if (booking.hasReceipt) {
        try {
          const receiptDoc = await db.collection('receipts').doc(docId).get();
          if (receiptDoc.exists) {
            receiptUrl = sanitizeUrl(receiptDoc.data().imageData);
          }
        } catch (e) {
          console.warn('Could not load receipt from receipts collection:', e);
        }
      }
      // Fallback to legacy inline receipt (for bookings created before migration)
      if (!receiptUrl) {
        receiptUrl = sanitizeUrl(booking.receiptUrl || booking.gcashReceipt);
      }

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

    detailsContent.innerHTML = html;

    // Toggle action buttons
    const approveBtn = document.getElementById('modalApproveBtn');
    const rejectBtn  = document.getElementById('modalRejectBtn');

    if (booking.status === 'Pending' || booking.status === 'Payment Under Review') {
      approveBtn.style.display = 'inline-flex';
      rejectBtn.style.display  = 'inline-flex';
      approveBtn.onclick = () => { closeDetailsModal(); approveBooking(docId); };
      rejectBtn.onclick  = () => { closeDetailsModal(); rejectBooking(docId); };
    } else {
      approveBtn.style.display = 'none';
      rejectBtn.style.display  = 'none';
    }

    detailsModal.classList.add('visible');

    // Wire up delete button in modal
    const deleteBtn = document.getElementById('modalDeleteBookingBtn');
    if (deleteBtn) {
      deleteBtn.onclick = () => { closeDetailsModal(); deleteBooking(docId); };
    }
  };

  window.closeDetailsModal = function () {
    detailsModal.classList.remove('visible');
    currentModalDocId = null;
  };

  window.openReceiptImage = function(url) {
    if (url && url.startsWith('data:image/')) {
      const win = window.open();
      if (win) {
        win.document.write('<html><head><title>Receipt</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;background:#000;height:100vh;"><img src="' + url + '" style="max-width:100%;max-height:100%;object-fit:contain;"></body></html>');
        win.document.close();
      } else {
        alert("Pop-up blocked. Please allow pop-ups for this site.");
      }
    } else {
      window.open(url, '_blank');
    }
  };

  // Close on overlay click
  if (detailsModal) {
    detailsModal.addEventListener('click', (e) => {
      if (e.target === detailsModal) closeDetailsModal();
    });
  }

  // ============================================================
  // TOAST NOTIFICATION
  // ============================================================
  function showToast(type, title, message, onClick) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}${typeof onClick === 'function' ? ' clickable' : ''}`;

    toast.innerHTML = `
      <div class="toast-body">
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(message)}</p>
      </div>
      <button class="toast-close" onclick="event.stopPropagation(); this.parentElement.remove()">✕</button>
    `;

    if (typeof onClick === 'function') {
      toast.addEventListener('click', () => {
        onClick();
        toast.remove();
      });
    }

    toastContainer.appendChild(toast);

    // Auto-remove after 5s
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.animation = 'fadeIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
      }
    }, 5000);
  }
  window.showAdminToast = showToast;

  // ============================================================
  // DELETE BOOKING
  // ============================================================
  const deleteBookingModal    = document.getElementById('deleteBookingModal');
  const deleteBookingRef      = document.getElementById('deleteBookingRef');
  const confirmDeleteBookingBtn = document.getElementById('confirmDeleteBookingBtn');

  window.deleteBooking = function (docId) {
    const booking = allBookings.find(b => b.id === docId);
    if (!booking) return;

    deletingBookingId = docId;
    if (deleteBookingRef) deleteBookingRef.textContent = `"${booking.referenceId || docId}"`;
    if (deleteBookingModal) deleteBookingModal.classList.add('visible');
  };

  window.closeDeleteBookingModal = function () {
    if (deleteBookingModal) deleteBookingModal.classList.remove('visible');
    deletingBookingId = null;
  };

  if (confirmDeleteBookingBtn) {
    confirmDeleteBookingBtn.addEventListener('click', async () => {
      if (!deletingBookingId) return;

      try {
        const booking = allBookings.find(b => b.id === deletingBookingId);
        await db.collection('bookings').doc(deletingBookingId).delete();
        showToast('warning', 'Booking Deleted', `Booking "${booking?.referenceId || ''}" has been permanently deleted.`);
        closeDeleteBookingModal();
      } catch (err) {
        console.error('Delete booking error:', err);
        showToast('error', 'Error', 'Failed to delete booking.');
      }
    });
  }

  // Close delete booking modal on overlay click
  if (deleteBookingModal) {
    deleteBookingModal.addEventListener('click', (e) => {
      if (e.target === deleteBookingModal) closeDeleteBookingModal();
    });
  }

  // ============================================================
  // MOBILE SIDEBAR TOGGLE (optional enhancement)
  // ============================================================
  // Could add a hamburger button for mobile — the sidebar is hidden by default on < 1024px
  // For now, clicking a sidebar link on mobile will just filter.

  // ============================================================
  // VIEW SWITCHING (Dashboard vs Facilities / Vehicles / Reports / ID Settings)
  // ============================================================
  const bookingsView      = document.querySelector('.dashboard-topbar')?.parentElement ? null : null;
  const facilitiesSection = document.getElementById('facilitiesSection');
  const vehiclesSection   = document.getElementById('vehiclesSection');
  const reportsSection     = document.getElementById('reportsSection');
  const idSettingsSection  = document.getElementById('idSettingsSection');
  const signatoriesSection = document.getElementById('signatoriesSection');
  const sidebarFacilities  = document.getElementById('sidebarFacilities');
  const sidebarVehicles    = document.getElementById('sidebarVehicles');
  const sidebarReports     = document.getElementById('sidebarReports');
  const sidebarIdSettings  = document.getElementById('sidebarIdSettings');
  const sidebarSignatories = document.getElementById('sidebarSignatories');
  const openIdSettingsBtn  = document.getElementById('openIdSettingsBtn');
  let currentView = 'bookings'; // 'bookings', 'facilities', 'vehicles', 'reports', 'idSettings', or 'signatories'

  // Elements that belong to bookings view
  const bookingsViewElements = [
    document.querySelector('.dashboard-topbar'),
    document.querySelector('.stats-grid'),
    document.getElementById('filterTabs'),
    document.getElementById('bookingFilters'),
    document.querySelector('.table-card')
  ].filter(Boolean);

  window.switchToBookingsView = function () {
    if (currentView !== 'bookings') {
      switchView('bookings');
      sidebarLinks.forEach(l => {
        l.classList.toggle('active', l.dataset.filter === activeFilter);
      });
    }
  };

  function switchView(view) {
    currentView = view;

    // Hide all sections first
    bookingsViewElements.forEach(el => el.style.display = 'none');
    if (facilitiesSection) facilitiesSection.style.display = 'none';
    if (vehiclesSection) vehiclesSection.style.display = 'none';
    if (reportsSection) reportsSection.style.display = 'none';
    if (idSettingsSection) idSettingsSection.style.display = 'none';
    if (signatoriesSection) signatoriesSection.style.display = 'none';
    
    // Remove active state from sidebar links
    sidebarLinks.forEach(l => l.classList.remove('active'));
    if (sidebarFacilities) sidebarFacilities.classList.remove('active');
    if (sidebarVehicles) sidebarVehicles.classList.remove('active');
    if (sidebarReports) sidebarReports.classList.remove('active');
    if (sidebarIdSettings) sidebarIdSettings.classList.remove('active');
    if (sidebarSignatories) sidebarSignatories.classList.remove('active');

    if (view === 'facilities') {
      if (facilitiesSection) facilitiesSection.style.display = 'block';
      if (sidebarFacilities) sidebarFacilities.classList.add('active');
    } else if (view === 'vehicles') {
      if (vehiclesSection) vehiclesSection.style.display = 'block';
      if (sidebarVehicles) sidebarVehicles.classList.add('active');
    } else if (view === 'reports') {
      if (reportsSection) reportsSection.style.display = 'block';
      if (sidebarReports) sidebarReports.classList.add('active');
      // Initialize reports module if available
      if (typeof window.initReportsView === 'function') window.initReportsView();
    } else if (view === 'idSettings') {
      if (idSettingsSection) idSettingsSection.style.display = 'block';
      if (sidebarIdSettings) sidebarIdSettings.classList.add('active');
      if (typeof syncBookingIdFormFromState === 'function') syncBookingIdFormFromState(false);
    } else if (view === 'signatories') {
      if (signatoriesSection) signatoriesSection.style.display = 'block';
      if (sidebarSignatories) sidebarSignatories.classList.add('active');
      if (typeof syncSignatoriesFormFromState === 'function') syncSignatoriesFormFromState(false);
    } else {
      // Show booking elements
      bookingsViewElements.forEach(el => {
        if (el.classList.contains('stats-grid')) el.style.display = 'grid';
        else if (el.classList.contains('filter-tabs')) el.style.display = 'flex';
        else el.style.display = '';
      });
      // Filter links handle their own active state in their click handlers
    }
  }

  // Sidebar "Manage Facilities" click
  if (sidebarFacilities) {
    sidebarFacilities.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('facilities');
    });
  }

  // Sidebar "Manage Vehicles" click
  if (sidebarVehicles) {
    sidebarVehicles.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('vehicles');
    });
  }

  // Sidebar "Reports" click
  if (sidebarReports) {
    sidebarReports.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('reports');
    });
  }

  // Sidebar "Booking ID Settings" click
  if (sidebarIdSettings) {
    sidebarIdSettings.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('idSettings');
    });
  }

  // Sidebar "PDF Signatories" click
  if (sidebarSignatories) {
    sidebarSignatories.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('signatories');
    });
  }

  // Topbar quick "Next ID" button click
  if (openIdSettingsBtn) {
    openIdSettingsBtn.addEventListener('click', () => {
      switchView('idSettings');
    });
  }

  // When booking filter sidebar links are clicked, switch back to bookings view
  sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (currentView !== 'bookings') {
        switchView('bookings');
      }
    });
  });

  // ============================================================
  // FACILITY MANAGEMENT — CRUD
  // ============================================================
  let allFacilities       = [];
  let editingFacilityId   = null;
  let deletingFacilityId  = null;
  let currentAmenities    = []; // tag list for add/edit modal
  let currentImages       = []; // base64 data URL list for add/edit modal

  // DOM
  const facilitiesTableBody  = document.getElementById('facilitiesTableBody');
  const facilitiesEmptyState = document.getElementById('facilitiesEmptyState');
  const facilityModal        = document.getElementById('facilityModal');
  const facilityForm         = document.getElementById('facilityForm');
  const facilityModalTitle   = document.getElementById('facilityModalTitle');
  const addFacilityBtn       = document.getElementById('addFacilityBtn');
  const deleteConfirmModal   = document.getElementById('deleteConfirmModal');
  const deleteFacilityName   = document.getElementById('deleteFacilityName');
  const confirmDeleteBtn     = document.getElementById('confirmDeleteBtn');
  const amenityInput         = document.getElementById('amenityInput');
  const amenitiesWrapper     = document.getElementById('amenitiesWrapper');
  const facImageFileInput    = document.getElementById('facImageFileInput');
  const facImagesPreview     = document.getElementById('facImagesPreview');
  const facImagesUpload      = document.getElementById('facImagesUpload');

  // Default facilities to seed if collection is empty
  const DEFAULT_FACILITIES = [
    { name: 'Gymnasium',               description: 'Full-size indoor court for sports events, P.E. classes, and large gatherings. Seats up to 500.', capacity: '500 seats', status: 'Active', order: 0 },
    { name: 'Chapel',                  description: 'Air-conditioned chapel with professional sound system. Seats 100.',                              capacity: '100 seats', status: 'Active', order: 1 },
    { name: 'Guest House/College H.E', description: 'Versatile space ideal for seminars, workshops, and medium-sized events. Capacity: 30.',           capacity: '30',        status: 'Active', order: 2 },
    { name: 'Field/Oval',              description: 'Outdoor open field for sports, training, and institutional events.',                               capacity: '—',         status: 'Active', order: 3 },
    { name: 'Conference Room',         description: 'Professional meeting room with video conferencing equipment. Seats up to 40.',                    capacity: '40 seats',  status: 'Active', order: 4 },
  ];

  // ---- Listen to facilities collection ----
  function listenFacilities() {
    db.collection('facilities')
      .orderBy('order', 'asc')
      .onSnapshot(async snapshot => {
        // Seed defaults if collection is empty
        if (snapshot.empty) {
          console.log('Seeding default facilities...');
          const batch = db.batch();
          DEFAULT_FACILITIES.forEach(f => {
            const ref = db.collection('facilities').doc();
            batch.set(ref, { ...f, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
          });
          await batch.commit();
          return; // The listener will fire again with the seeded data
        }

        allFacilities = [];
        snapshot.forEach(doc => {
          allFacilities.push({ id: doc.id, ...doc.data() });
        });
        window._allFacilities = allFacilities; // Expose for reports module
        populateFilterOptions();
        renderFacilitiesTable();
      }, err => {
        console.error('Facilities listener error:', err);
      });
  }

  // ---- Render facilities table ----
  function renderFacilitiesTable() {
    if (!facilitiesTableBody) return;

    if (allFacilities.length === 0) {
      facilitiesTableBody.innerHTML = '';
      if (facilitiesEmptyState) facilitiesEmptyState.style.display = 'block';
      return;
    }

    if (facilitiesEmptyState) facilitiesEmptyState.style.display = 'none';

    facilitiesTableBody.innerHTML = allFacilities.map(f => {
      const statusClass = f.status === 'Active' ? 'approved' :
                          f.status === 'Inactive' ? 'rejected' : 'pending';
      const name = escapeHtml(f.name || '—');
      const desc = escapeHtml(f.description || '—');
      const cap = escapeHtml(f.capacity || '—');
      const status = escapeHtml(f.status || 'Active');

      return `
        <tr>
          <td><strong style="color:var(--navy);">${name}</strong></td>
          <td style="max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${desc}">${desc}</td>
          <td>${cap}</td>
          <td><span class="status-badge ${statusClass}"><span class="status-dot"></span> ${status}</span></td>
          <td>
            <div class="table-actions">
              <button class="action-btn facility-edit" onclick="editFacility('${f.id}')" title="Edit">Edit</button>
              <button class="action-btn reject" onclick="deleteFacility('${f.id}')" title="Delete">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ============================================================
  // AMENITIES TAG INPUT
  // ============================================================
  function renderAmenityTags() {
    // Remove existing tags (keep the input)
    if (!amenitiesWrapper) return;
    amenitiesWrapper.querySelectorAll('.amenity-tag').forEach(t => t.remove());
    currentAmenities.forEach((a, i) => {
      const tag = document.createElement('span');
      tag.className = 'amenity-tag';
      tag.appendChild(document.createTextNode(a + ' '));
      const rm = document.createElement('span');
      rm.className = 'remove-amenity';
      rm.dataset.index = String(i);
      rm.textContent = 'Remove';
      tag.appendChild(rm);
      amenitiesWrapper.insertBefore(tag, amenityInput);
    });
  }

  if (amenityInput) {
    amenityInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = amenityInput.value;
        if (val) {
          val.split(',').forEach(v => {
            const trimmed = v.trim();
            if (trimmed && !currentAmenities.includes(trimmed)) {
              currentAmenities.push(trimmed);
            }
          });
          renderAmenityTags();
        }
        amenityInput.value = '';
      }
      // Backspace on empty input removes last tag
      if (e.key === 'Backspace' && amenityInput.value === '' && currentAmenities.length > 0) {
        currentAmenities.pop();
        renderAmenityTags();
      }
    });
  }

  if (amenitiesWrapper) {
    amenitiesWrapper.addEventListener('click', (e) => {
      const rm = e.target.closest('.remove-amenity');
      if (rm) {
        const idx = parseInt(rm.dataset.index, 10);
        currentAmenities.splice(idx, 1);
        renderAmenityTags();
      }
      // Focus input when clicking wrapper
      if (amenityInput) amenityInput.focus();
    });
  }

  // ============================================================
  // IMAGE UPLOAD
  // ============================================================
  function renderImagePreviews() {
    if (!facImagesPreview) return;
    facImagesPreview.innerHTML = '';
    currentImages.forEach((src, i) => {
      const safeSrc = sanitizeUrl(src);
      const item = document.createElement('div');
      item.className = 'fac-img-preview-item';
      const img = document.createElement('img');
      img.src = safeSrc;
      img.alt = `Photo ${i + 1}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'remove-img';
      btn.dataset.index = String(i);
      btn.innerHTML = '&times;'; // X icon instead of 'Remove'
      
      item.appendChild(img);
      item.appendChild(btn);
      facImagesPreview.appendChild(item);
    });
  }

  function compressAndAddImage(file) {
    if (currentImages.length >= 5) {
      alert('Maximum 5 images allowed per facility.');
      return;
    }
    // Increased input limit to 10MB since we compress it anyway
    if (file.size > 10 * 1024 * 1024) {
      alert(`"${file.name}" is too large. Please select an image under 10MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxW = 800;
          const scale = Math.min(1, maxW / img.width);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          // Compress to JPEG to save space in Firestore
          const compressed = canvas.toDataURL('image/jpeg', 0.7);
          
          // Check if the compressed string is too large for Firestore (~1MB doc limit)
          // A 800px jpeg at 70% is usually 50-100kb, which is perfectly safe.
          currentImages.push(compressed);
          renderImagePreviews();
        } catch (err) {
          console.error("Canvas compression failed:", err);
          alert("Failed to process image. Please try a different photo.");
        }
      };
      img.onerror = () => {
        alert(`Failed to load "${file.name}". Please ensure it is a valid image file.`);
      };
      img.src = e.target.result;
    };
    reader.onerror = () => {
      alert("Failed to read the file.");
    };
    reader.readAsDataURL(file);
  }

  if (facImageFileInput) {
    facImageFileInput.addEventListener('change', (e) => {
      Array.from(e.target.files).forEach(compressAndAddImage);
      facImageFileInput.value = ''; // Reset so same file can be re-added
    });
  }

  if (facImagesPreview) {
    facImagesPreview.addEventListener('click', (e) => {
      const rm = e.target.closest('.remove-img');
      if (rm) {
        const idx = parseInt(rm.dataset.index, 10);
        currentImages.splice(idx, 1);
        renderImagePreviews();
      }
    });
  }

  // Drag and drop
  if (facImagesUpload) {
    ['dragenter', 'dragover'].forEach(evt => {
      facImagesUpload.addEventListener(evt, (e) => {
        e.preventDefault();
        facImagesUpload.style.borderColor = 'var(--gold)';
      });
    });
    ['dragleave', 'drop'].forEach(evt => {
      facImagesUpload.addEventListener(evt, (e) => {
        e.preventDefault();
        facImagesUpload.style.borderColor = '';
      });
    });
    facImagesUpload.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      Array.from(files).forEach(f => {
        if (f.type.startsWith('image/')) compressAndAddImage(f);
      });
    });
  }

  // ---- Open add modal ----
  if (addFacilityBtn) {
    addFacilityBtn.addEventListener('click', () => {
      editingFacilityId = null;
      currentAmenities = [];
      currentImages = [];
      if (facilityModalTitle) facilityModalTitle.textContent = 'Add Facility';
      if (facilityForm) facilityForm.reset();
      renderAmenityTags();
      renderImagePreviews();
      if (facilityModal) facilityModal.classList.add('visible');
    });
  }

  // ---- Edit facility ----
  window.editFacility = async function (docId) {
    const facility = allFacilities.find(f => f.id === docId);
    if (!facility) return;

    editingFacilityId = docId;
    if (facilityModalTitle) facilityModalTitle.textContent = 'Edit Facility';

    document.getElementById('facName').value        = facility.name || '';
    document.getElementById('facDescription').value = facility.description || '';
    document.getElementById('facCapacity').value    = facility.capacity || '';
    document.getElementById('facStatus').value      = facility.status || 'Active';

    // Populate amenities
    currentAmenities = [...(facility.amenities || [])];
    renderAmenityTags();

    // Load images from separate facility_images collection
    currentImages = [];
    try {
      const imgDoc = await db.collection('facility_images').doc(docId).get();
      if (imgDoc.exists) {
        currentImages = [...(imgDoc.data().images || [])];
      } else {
        // Fallback to inline images (for facilities created before migration)
        currentImages = [...(facility.images || [])];
      }
    } catch (e) {
      console.warn('Could not load facility images:', e);
      currentImages = [...(facility.images || [])];
    }
    renderImagePreviews();

    if (facilityModal) facilityModal.classList.add('visible');
  };

  // ---- Save facility (add or update) ----
  if (facilityForm) {
    facilityForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name        = document.getElementById('facName').value.trim();
      const description = document.getElementById('facDescription').value.trim();
      const capacity    = document.getElementById('facCapacity').value.trim();
      const status      = document.getElementById('facStatus').value;

      if (!name) {
        alert('Please enter a facility name.');
        return;
      }

      // Flush any leftover text in the amenity input as a tag
      const amenityInput = document.getElementById('amenityInput');
      if (amenityInput) {
        const leftoverVal = amenityInput.value;
        if (leftoverVal) {
          leftoverVal.split(',').forEach(v => {
            const trimmed = v.trim();
            if (trimmed && !currentAmenities.includes(trimmed)) {
              currentAmenities.push(trimmed);
            }
          });
        }
        amenityInput.value = '';
        renderAmenityTags();
      }

      const submitBtn = document.getElementById('facilitySubmitBtn');
      submitBtn.innerHTML = '<span class="spinner"></span> Saving...';
      submitBtn.classList.add('loading');

      try {
        const data = {
          name,
          description,
          capacity,
          status,
          amenities: [...currentAmenities],
          thumbnail: currentImages.length > 0 ? currentImages[0] : null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (editingFacilityId) {
          // Update existing facility doc (no large images in this doc)
          await db.collection('facilities').doc(editingFacilityId).update(data);
          // Save images to separate collection
          await db.collection('facility_images').doc(editingFacilityId).set({
            images: [...currentImages]
          });
          showToast('success', 'Facility Updated', `"${name}" has been updated successfully.`);
        } else {
          // Add new — set order to last
          data.order = allFacilities.length;
          data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          const docRef = await db.collection('facilities').add(data);
          // Save images to separate collection
          await db.collection('facility_images').doc(docRef.id).set({
            images: [...currentImages]
          });
          showToast('success', 'Facility Added', `"${name}" has been added successfully.`);
        }

        closeFacilityModal();
      } catch (err) {
        console.error('Facility save error:', err);
        showToast('error', 'Error', 'Failed to save facility. Please try again.');
      } finally {
        submitBtn.innerHTML = 'Save Facility';
        submitBtn.classList.remove('loading');
      }
    });
  }

  // ---- Delete facility ----
  window.deleteFacility = function (docId) {
    const facility = allFacilities.find(f => f.id === docId);
    if (!facility) return;

    deletingFacilityId = docId;
    if (deleteFacilityName) deleteFacilityName.textContent = `"${facility.name}"`;
    if (deleteConfirmModal) deleteConfirmModal.classList.add('visible');
  };

  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async () => {
      if (!deletingFacilityId) return;

      try {
        const facility = allFacilities.find(f => f.id === deletingFacilityId);
        await db.collection('facilities').doc(deletingFacilityId).delete();
        showToast('warning', 'Facility Deleted', `"${facility?.name || 'Facility'}" has been removed.`);
        closeDeleteModal();
      } catch (err) {
        console.error('Delete error:', err);
        showToast('error', 'Error', 'Failed to delete facility.');
      }
    });
  }

  // ---- Modal close helpers ----
  window.closeFacilityModal = function () {
    if (facilityModal) facilityModal.classList.remove('visible');
    editingFacilityId = null;
    currentAmenities = [];
    currentImages = [];
    renderAmenityTags();
    renderImagePreviews();
  };

  window.closeDeleteModal = function () {
    if (deleteConfirmModal) deleteConfirmModal.classList.remove('visible');
    deletingFacilityId = null;
  };

  // Close modals on overlay click
  [facilityModal, deleteConfirmModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          if (modal === facilityModal) closeFacilityModal();
          else closeDeleteModal();
        }
      });
    }
  });

  // ============================================================
  // VEHICLE MANAGEMENT — CRUD
  // ============================================================
  let allVehicles       = [];
  let editingVehicleId  = null;
  let deletingVehicleId = null;

  // DOM
  const vehiclesTableBody         = document.getElementById('vehiclesTableBody');
  const vehiclesEmptyState        = document.getElementById('vehiclesEmptyState');
  const vehicleModal              = document.getElementById('vehicleModal');
  const vehicleForm               = document.getElementById('vehicleForm');
  const vehicleModalTitle         = document.getElementById('vehicleModalTitle');
  const addVehicleBtn             = document.getElementById('addVehicleBtn');
  const deleteVehicleConfirmModal = document.getElementById('deleteVehicleConfirmModal');
  const deleteVehicleName         = document.getElementById('deleteVehicleName');
  const confirmDeleteVehicleBtn   = document.getElementById('confirmDeleteVehicleBtn');

  // Default vehicles
  const DEFAULT_VEHICLES = [
    { name: 'Toyota Grandia Van', description: 'Air-conditioned passenger van. Great for small groups.', capacity: '15 seats', driver: 'Juan Dela Cruz', status: 'Active', order: 0 },
    { name: 'KIA Utility Van',     description: 'Utility van for small group trips and transport needs.', capacity: '15 seats', driver: 'Pedro Penduko', status: 'Active', order: 1 }
  ];

  // ---- Listen to vehicles collection ----
  window.listenVehicles = function() {
    db.collection('vehicles')
      .orderBy('order', 'asc')
      .onSnapshot(async snapshot => {
        if (snapshot.empty) {
          console.log('Seeding default vehicles...');
          const batch = db.batch();
          DEFAULT_VEHICLES.forEach(v => {
            const ref = db.collection('vehicles').doc();
            batch.set(ref, { ...v, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
          });
          await batch.commit();
          return;
        }

        allVehicles = [];
        snapshot.forEach(doc => {
          allVehicles.push({ id: doc.id, ...doc.data() });
        });
        window._allVehicles = allVehicles;
        populateFilterOptions();
        renderVehiclesTable();
      }, err => {
        console.error('Vehicles listener error:', err);
      });
  };

  // ---- Render vehicles table ----
  function renderVehiclesTable() {
    if (!vehiclesTableBody) return;

    if (allVehicles.length === 0) {
      vehiclesTableBody.innerHTML = '';
      if (vehiclesEmptyState) vehiclesEmptyState.style.display = 'block';
      return;
    }

    if (vehiclesEmptyState) vehiclesEmptyState.style.display = 'none';

    vehiclesTableBody.innerHTML = allVehicles.map(v => {
      const statusClass = v.status === 'Active' ? 'approved' :
                          v.status === 'Inactive' ? 'rejected' : 'pending';
      const name = escapeHtml(v.name || '—');
      const desc = escapeHtml(v.description || '—');
      const cap = escapeHtml(v.capacity || '—');
      const driver = escapeHtml(v.driver || '—');
      const status = escapeHtml(v.status || 'Active');

      return `
        <tr>
          <td><strong style="color:var(--navy);">${name}</strong></td>
          <td style="max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${desc}">${desc}</td>
          <td>${cap}</td>
          <td>${driver}</td>
          <td><span class="status-badge ${statusClass}"><span class="status-dot"></span> ${status}</span></td>
          <td>
            <div class="table-actions">
              <button class="action-btn facility-edit" onclick="editVehicle('${v.id}')" title="Edit">Edit</button>
              <button class="action-btn reject" onclick="deleteVehicle('${v.id}')" title="Delete">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ---- Open add modal ----
  if (addVehicleBtn) {
    addVehicleBtn.addEventListener('click', () => {
      editingVehicleId = null;
      if (vehicleModalTitle) vehicleModalTitle.textContent = 'Add Vehicle';
      if (vehicleForm) vehicleForm.reset();
      if (vehicleModal) vehicleModal.classList.add('visible');
    });
  }

  // ---- Edit vehicle ----
  window.editVehicle = function (docId) {
    const vehicle = allVehicles.find(v => v.id === docId);
    if (!vehicle) return;

    editingVehicleId = docId;
    if (vehicleModalTitle) vehicleModalTitle.textContent = 'Edit Vehicle';

    document.getElementById('vehName').value        = vehicle.name || '';
    document.getElementById('vehDescription').value = vehicle.description || '';
    document.getElementById('vehCapacity').value    = vehicle.capacity || '';
    document.getElementById('vehDriver').value      = vehicle.driver || '';
    document.getElementById('vehStatus').value      = vehicle.status || 'Active';

    if (vehicleModal) vehicleModal.classList.add('visible');
  };

  // ---- Save vehicle (add or update) ----
  if (vehicleForm) {
    vehicleForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name        = document.getElementById('vehName').value.trim();
      const description = document.getElementById('vehDescription').value.trim();
      const capacity    = document.getElementById('vehCapacity').value.trim();
      const driver      = document.getElementById('vehDriver').value.trim();
      const status      = document.getElementById('vehStatus').value;

      if (!name) {
        alert('Please enter a vehicle name.');
        return;
      }

      const submitBtn = document.getElementById('vehicleSubmitBtn');
      submitBtn.innerHTML = '<span class="spinner"></span> Saving...';
      submitBtn.classList.add('loading');

      try {
        const data = {
          name,
          description,
          capacity,
          driver,
          status,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (editingVehicleId) {
          // Update existing
          await db.collection('vehicles').doc(editingVehicleId).update(data);
          showToast('success', 'Vehicle Updated', `"${name}" has been updated successfully.`);
        } else {
          // Add new — set order to last
          data.order = allVehicles.length;
          data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          await db.collection('vehicles').add(data);
          showToast('success', 'Vehicle Added', `"${name}" has been added successfully.`);
        }

        closeVehicleModal();
      } catch (err) {
        console.error('Vehicle save error:', err);
        const errorMessage = err?.message
          ? `Failed to save vehicle: ${err.message}`
          : 'Failed to save vehicle. Please try again.';
        showToast('error', 'Error', errorMessage);
      } finally {
        submitBtn.innerHTML = 'Save Vehicle';
        submitBtn.classList.remove('loading');
      }
    });
  }

  // ---- Delete vehicle ----
  window.deleteVehicle = function (docId) {
    const vehicle = allVehicles.find(v => v.id === docId);
    if (!vehicle) return;

    deletingVehicleId = docId;
    if (deleteVehicleName) deleteVehicleName.textContent = `"${vehicle.name}"`;
    if (deleteVehicleConfirmModal) deleteVehicleConfirmModal.classList.add('visible');
  };

  if (confirmDeleteVehicleBtn) {
    confirmDeleteVehicleBtn.addEventListener('click', async () => {
      if (!deletingVehicleId) return;

      try {
        const vehicle = allVehicles.find(v => v.id === deletingVehicleId);
        await db.collection('vehicles').doc(deletingVehicleId).delete();
        showToast('warning', 'Vehicle Deleted', `"${vehicle?.name || 'Vehicle'}" has been removed.`);
        closeDeleteVehicleModal();
      } catch (err) {
        console.error('Delete error:', err);
        showToast('error', 'Error', 'Failed to delete vehicle.');
      }
    });
  }

  // ---- Modal close helpers ----
  window.closeVehicleModal = function () {
    if (vehicleModal) vehicleModal.classList.remove('visible');
    editingVehicleId = null;
  };

  window.closeDeleteVehicleModal = function () {
    if (deleteVehicleConfirmModal) deleteVehicleConfirmModal.classList.remove('visible');
    deletingVehicleId = null;
  };

  // Close modals on overlay click
  [vehicleModal, deleteVehicleConfirmModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          if (modal === vehicleModal) closeVehicleModal();
          else closeDeleteVehicleModal();
        }
      });
    }
  });

  // ============================================================
  // SPECIAL BOOKING (ADMIN)
  // ============================================================
  const specialBookingBtn = document.getElementById('specialBookingBtn');
  const specialBookingModal = document.getElementById('specialBookingModal');
  const specialBookingForm = document.getElementById('specialBookingForm');
  const sbFacilitySelect = document.getElementById('sbFacility');
  const sbVehicleOptions = document.getElementById('sbVehicleOptions');

  // Equipment quantity toggle for Special Booking
  document.querySelectorAll('#specialBookingForm .eq-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const qtyInput = e.target.parentElement.querySelector('.eq-qty');
      if (qtyInput) {
        qtyInput.style.display = e.target.checked ? 'inline-block' : 'none';
      }
    });
  });

  // Vehicle fields toggle for Special Booking
  const sbVehicleGroup = document.getElementById('sbVehicleGroup');
  const sbDestinationGroup = document.getElementById('sbDestinationGroup');

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

  if (sbFacilitySelect) {
    sbFacilitySelect.addEventListener('change', updateSbVehicleVisibility);
  }

  // Department / College School toggle for Special Booking
  const sbDepartmentSelect = document.getElementById('sbDepartment');
  const sbCollegeSchoolGroup = document.getElementById('sbCollegeSchoolGroup');
  const sbCollegeSchoolSelect = document.getElementById('sbCollegeSchool');

  function updateSbCollegeSchoolVisibility() {
    const isCollege = sbDepartmentSelect && sbDepartmentSelect.value === 'College';
    if (sbCollegeSchoolGroup) sbCollegeSchoolGroup.style.display = isCollege ? '' : 'none';
    if (!isCollege && sbCollegeSchoolSelect) {
      sbCollegeSchoolSelect.value = '';
    }
  }

  if (sbDepartmentSelect) {
    sbDepartmentSelect.addEventListener('change', updateSbCollegeSchoolVisibility);
  }

  // Name uppercase listener for special booking
  const sbNameInput = document.getElementById('sbName');
  if (sbNameInput) {
    sbNameInput.addEventListener('input', () => {
      sbNameInput.value = sbNameInput.value.toUpperCase();
    });
  }

  // Digits-only for sbNumPersons
  const sbNumPersonsInput = document.getElementById('sbNumPersons');
  if (sbNumPersonsInput) {
    sbNumPersonsInput.addEventListener('keydown', (e) => {
      if (['+', '-', 'e', 'E', '.', ','].includes(e.key)) e.preventDefault();
    });
    sbNumPersonsInput.addEventListener('input', () => {
      sbNumPersonsInput.value = sbNumPersonsInput.value.replace(/\D+/g, '');
    });
  }

  // Start Date / End Date linking for Special Booking
  const sbStartDateInput = document.getElementById('sbStartDate');
  const sbEndDateInput = document.getElementById('sbEndDate');
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
      // Populate facilities if not already populated
      if (sbFacilitySelect && window._allFacilities && sbFacilitySelect.options.length <= 2) {
        // Clear non-defaults
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

      // Populate vehicles if not already populated
      if (sbVehicleOptions && sbVehicleOptions.children.length === 0) {
        db.collection('vehicles').orderBy('order', 'asc').get().then(snapshot => {
          sbVehicleOptions.innerHTML = '';
          snapshot.forEach(doc => {
            const v = doc.data();
            if (v.status === 'Active' && v.name) {
              const label = document.createElement('label');
              label.className = 'equipment-item';
              const cb = document.createElement('input');
              cb.type = 'checkbox';
              cb.name = 'sbVehicle';
              cb.value = v.name;
              label.appendChild(cb);
              label.appendChild(document.createTextNode(' ' + v.name));
              sbVehicleOptions.appendChild(label);
            }
          });
          if(snapshot.empty) sbVehicleOptions.innerHTML = '<span style="font-size:0.9rem; color:var(--gray-400);">No active vehicles</span>';
        }).catch(err => {
          console.warn('Could not load vehicles', err);
          sbVehicleOptions.innerHTML = '<span style="font-size:0.9rem; color:var(--gray-400);">Error loading vehicles</span>';
        });
      }

      updateSbVehicleVisibility();
      updateSbCollegeSchoolVisibility();
      specialBookingModal.classList.add('visible');
    });
    
    // Close on overlay click
    specialBookingModal.addEventListener('click', (e) => {
      if (e.target === specialBookingModal) {
        specialBookingModal.classList.remove('visible');
      }
    });
  }

  function getSbEquipmentWithQuantities(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(cb => {
      const qtyInput = cb.parentElement.querySelector('.eq-qty');
      const qty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
      return { item: cb.value, qty: qty };
    });
  }

  if (specialBookingForm) {
    specialBookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = (document.getElementById('sbName').value || '').trim().toUpperCase();
      const departmentRaw = document.getElementById('sbDepartment').value;
      const collegeSchool = sbCollegeSchoolSelect ? sbCollegeSchoolSelect.value : '';
      let finalDepartment = departmentRaw;
      const employeeId = document.getElementById('sbEmployeeId').value.trim();
      const email = document.getElementById('sbEmail').value.trim();
      const facilityChoice = document.getElementById('sbFacility').value;
      const isVehicle = facilityChoice === 'Vehicle';
      const facility = isVehicle ? '' : facilityChoice;
      const startDate = document.getElementById('sbStartDate').value;
      const endDate = document.getElementById('sbEndDate').value;
      const startTime = document.getElementById('sbStartTime').value;
      const endTime = document.getElementById('sbEndTime').value;
      const numPersonsRaw = document.getElementById('sbNumPersons').value.trim();
      const numPersons = parseInt(numPersonsRaw, 10);
      const destination = document.getElementById('sbDestination').value.trim();
      const purpose = document.getElementById('sbPurpose').value.trim();
      const considerations = document.getElementById('sbConsiderations').value.trim();

      const vehicle = isVehicle
        ? Array.from(document.querySelectorAll('input[name="sbVehicle"]:checked')).map(cb => cb.value)
        : [];
      const equipment = getSbEquipmentWithQuantities('sbEquipment');

      if (!name) { alert('Please enter requester name.'); return; }
      if (!departmentRaw) { alert('Please select department.'); return; }
      if (departmentRaw === 'College') {
        if (!collegeSchool) {
          alert('Please select course/school of College.');
          if (sbCollegeSchoolSelect) sbCollegeSchoolSelect.focus();
          return;
        }
        finalDepartment = collegeSchool;
      }
      if (!employeeId) { alert('Please enter employee ID.'); return; }
      if (!email) { alert('Please enter email address.'); return; }
      if (!facilityChoice) { alert('Please select a facility or Vehicle.'); return; }
      if (!startDate) { alert('Please select start date.'); return; }
      if (!endDate) { alert('Please select end date.'); return; }
      if (endDate < startDate) { alert('End date cannot be earlier than start date.'); return; }
      if (!startTime) { alert('Please select start time.'); return; }
      if (!endTime) { alert('Please select end time.'); return; }
      if (startDate === endDate && endTime <= startTime) {
        alert('For same-day reservations, end time must be after start time.');
        return;
      }
      if (!numPersons || numPersons < 1) { alert('Please enter a valid number of persons.'); return; }
      if (isVehicle && vehicle.length === 0) { alert('Please select at least one vehicle.'); return; }
      if (isVehicle && !destination) { alert('Please enter a destination.'); return; }
      if (!purpose) { alert('Please describe the purpose.'); return; }

      const btn = document.getElementById('sbSubmitBtn');
      btn.innerHTML = '<span class="spinner"></span> Submitting...';
      btn.classList.add('loading');
      btn.disabled = true;

      try {
        const refId = await createAdminBookingWithSequentialId({
          userType: 'Internal', 
          name: name,
          department: finalDepartment,
          parentDepartment: departmentRaw,
          collegeSchool: departmentRaw === 'College' ? collegeSchool : '',
          employeeId: employeeId,
          email: email,
          facility: facility,
          date: startDate,
          startDate: startDate,
          endDate: endDate,
          startTime: startTime,
          endTime: endTime,
          numPersons: String(numPersons),
          vehicle: vehicle,
          destination: isVehicle ? destination : '',
          equipment: equipment,
          purpose: purpose,
          considerations: considerations,
          status: 'Approved',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        specialBookingModal.classList.remove('visible');
        showToast('success', 'Special Booking Created', `Reservation ${refId} has been created and automatically approved.`);
        specialBookingForm.reset();
        updateSbVehicleVisibility();
        updateSbCollegeSchoolVisibility();
        
        // Hide all quantity inputs again
        document.querySelectorAll('#specialBookingForm .eq-qty').forEach(q => q.style.display = 'none');
      } catch (err) {
        console.error('Special booking error:', err);
        if (err && err.code === 'permission-denied') {
          showToast('error', 'Permission Denied', 'Please publish the updated firestore.rules (settings/bookingId) in Firebase Console.');
        } else {
          showToast('error', 'Error', 'Failed to create special booking.');
        }
      } finally {
        btn.innerHTML = 'Submit Special Booking';
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    });
  }

  // ============================================================
  // SEQUENTIAL BOOKING ID SETTINGS & COUNTER MANAGEMENT
  // ============================================================
  const BOOKING_ID_SETTINGS_COLLECTION = 'settings';
  const BOOKING_ID_SETTINGS_DOC        = 'bookingId';
  const DEFAULT_BOOKING_ID_PREFIX      = 'SIC';
  const DEFAULT_BOOKING_ID_YEAR        = '2026';

  let bookingIdConfigState = {
    prefix: DEFAULT_BOOKING_ID_PREFIX,
    year: DEFAULT_BOOKING_ID_YEAR,
    nextSequence: 1
  };
  let idConfigFormDirty = false;
  let pendingResetTarget = null;

  // DOM References for Booking ID Settings
  const topbarNextBookingId         = document.getElementById('topbarNextBookingId');
  const activeNextBookingIdDisplay  = document.getElementById('activeNextBookingIdDisplay');
  const idSequencePreviewPills      = document.getElementById('idSequencePreviewPills');
  const resetCardTargetPreview      = document.getElementById('resetCardTargetPreview');
  const bookingIdConfigForm         = document.getElementById('bookingIdConfigForm');
  const idConfigPrefixInput         = document.getElementById('idConfigPrefix');
  const idConfigYearInput           = document.getElementById('idConfigYear');
  const idConfigNextSeqInput        = document.getElementById('idConfigNextSeq');
  const useCurrentYearBtn           = document.getElementById('useCurrentYearBtn');
  const revertIdConfigBtn           = document.getElementById('revertIdConfigBtn');
  const saveIdConfigBtn             = document.getElementById('saveIdConfigBtn');
  const resetCounterToOneBtn        = document.getElementById('resetCounterToOneBtn');
  const resetBookingIdModal         = document.getElementById('resetBookingIdModal');
  const resetPreviewIdText          = document.getElementById('resetPreviewIdText');
  const resetExistingSeriesWarning  = document.getElementById('resetExistingSeriesWarning');
  const confirmResetBookingIdBtn    = document.getElementById('confirmResetBookingIdBtn');

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

  // Atomically allocate the next sequential Booking ID and create the booking document
  async function createAdminBookingWithSequentialId(bookingPayload) {
    const configRef = db.collection(BOOKING_ID_SETTINGS_COLLECTION).doc(BOOKING_ID_SETTINGS_DOC);
    const newBookingRef = db.collection('bookings').doc();

    return db.runTransaction(async (transaction) => {
      const configSnap = await transaction.get(configRef);
      let prefix = DEFAULT_BOOKING_ID_PREFIX;
      let year   = String(new Date().getFullYear() || DEFAULT_BOOKING_ID_YEAR);
      let seq    = 1;

      if (configSnap.exists) {
        const cfg = configSnap.data() || {};
        prefix = String(cfg.prefix || DEFAULT_BOOKING_ID_PREFIX).trim().toUpperCase() || DEFAULT_BOOKING_ID_PREFIX;
        year   = String(cfg.year || year).trim() || year;
        const parsedSeq = Number(cfg.nextSequence);
        seq = (Number.isFinite(parsedSeq) && parsedSeq >= 1) ? Math.floor(parsedSeq) : 1;

        transaction.update(configRef, {
          nextSequence: seq + 1,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } else {
        transaction.set(configRef, {
          prefix: prefix,
          year: year,
          nextSequence: 2,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }

      const refId = formatSequentialBookingId(prefix, year, seq);
      transaction.set(newBookingRef, {
        ...bookingPayload,
        referenceId: refId
      });

      return refId;
    });
  }

  function updateActiveBookingIdBadges() {
    const activeNextId = formatSequentialBookingId(
      bookingIdConfigState.prefix,
      bookingIdConfigState.year,
      bookingIdConfigState.nextSequence
    );
    if (topbarNextBookingId) topbarNextBookingId.textContent = activeNextId;
    if (activeNextBookingIdDisplay) activeNextBookingIdDisplay.textContent = activeNextId;
  }

  function updateBookingIdDraftPreview() {
    const draftPrefix = sanitizeIdSegment(idConfigPrefixInput ? idConfigPrefixInput.value : '') || bookingIdConfigState.prefix;
    const draftYear   = sanitizeIdSegment(idConfigYearInput ? idConfigYearInput.value : '') || bookingIdConfigState.year;
    const rawSeq      = idConfigNextSeqInput ? parseInt(idConfigNextSeqInput.value, 10) : bookingIdConfigState.nextSequence;
    const draftSeq    = (Number.isFinite(rawSeq) && rawSeq >= 1) ? rawSeq : 1;

    if (idSequencePreviewPills) {
      const id1 = escapeHtml(formatSequentialBookingId(draftPrefix, draftYear, draftSeq));
      const id2 = escapeHtml(formatSequentialBookingId(draftPrefix, draftYear, draftSeq + 1));
      const id3 = escapeHtml(formatSequentialBookingId(draftPrefix, draftYear, draftSeq + 2));
      idSequencePreviewPills.innerHTML = `
        <span class="id-seq-pill primary">${id1}</span>
        <span class="id-seq-arrow">&rarr;</span>
        <span class="id-seq-pill">${id2}</span>
        <span class="id-seq-arrow">&rarr;</span>
        <span class="id-seq-pill">${id3}</span>
      `;
    }

    if (resetCardTargetPreview) {
      resetCardTargetPreview.textContent = formatSequentialBookingId(draftPrefix, draftYear, 1);
    }
  }

  function syncBookingIdFormFromState(forceOverwrite = false) {
    if (idConfigFormDirty && !forceOverwrite) {
      updateBookingIdDraftPreview();
      return;
    }
    if (idConfigPrefixInput) idConfigPrefixInput.value = bookingIdConfigState.prefix;
    if (idConfigYearInput)   idConfigYearInput.value   = bookingIdConfigState.year;
    if (idConfigNextSeqInput) idConfigNextSeqInput.value = String(bookingIdConfigState.nextSequence);
    idConfigFormDirty = false;
    updateBookingIdDraftPreview();
  }

  function listenBookingIdConfig() {
    const configRef = db.collection(BOOKING_ID_SETTINGS_COLLECTION).doc(BOOKING_ID_SETTINGS_DOC);

    configRef.onSnapshot(async (docSnap) => {
      if (!docSnap.exists) {
        const seedYear = String(new Date().getFullYear() || DEFAULT_BOOKING_ID_YEAR);
        try {
          await configRef.set({
            prefix: DEFAULT_BOOKING_ID_PREFIX,
            year: seedYear,
            nextSequence: 1,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          return;
        } catch (seedErr) {
          console.warn('Could not seed settings/bookingId yet (check firestore.rules):', seedErr);
        }
      } else {
        const data = docSnap.data() || {};
        const parsedSeq = Number(data.nextSequence);
        bookingIdConfigState = {
          prefix: sanitizeIdSegment(data.prefix) || DEFAULT_BOOKING_ID_PREFIX,
          year: sanitizeIdSegment(data.year) || DEFAULT_BOOKING_ID_YEAR,
          nextSequence: (Number.isFinite(parsedSeq) && parsedSeq >= 1) ? Math.floor(parsedSeq) : 1
        };
      }

      updateActiveBookingIdBadges();
      syncBookingIdFormFromState(false);
    }, (err) => {
      console.warn('Booking ID config listener error (publish updated firestore.rules if permission-denied):', err);
      updateActiveBookingIdBadges();
      syncBookingIdFormFromState(false);
    });
  }

  // Input listeners for live preview & uppercase formatting
  if (idConfigPrefixInput) {
    idConfigPrefixInput.addEventListener('input', () => {
      const cleaned = idConfigPrefixInput.value.toUpperCase().replace(/[^A-Z0-9-]+/g, '');
      if (idConfigPrefixInput.value !== cleaned) idConfigPrefixInput.value = cleaned;
      idConfigFormDirty = true;
      updateBookingIdDraftPreview();
    });
  }

  if (idConfigYearInput) {
    idConfigYearInput.addEventListener('input', () => {
      const cleaned = idConfigYearInput.value.toUpperCase().replace(/[^A-Z0-9-]+/g, '');
      if (idConfigYearInput.value !== cleaned) idConfigYearInput.value = cleaned;
      idConfigFormDirty = true;
      updateBookingIdDraftPreview();
    });
  }

  if (idConfigNextSeqInput) {
    idConfigNextSeqInput.addEventListener('keydown', (e) => {
      if (['+', '-', 'e', 'E', '.', ','].includes(e.key)) e.preventDefault();
    });
    idConfigNextSeqInput.addEventListener('input', () => {
      idConfigFormDirty = true;
      updateBookingIdDraftPreview();
    });
  }

  if (useCurrentYearBtn && idConfigYearInput) {
    useCurrentYearBtn.addEventListener('click', () => {
      idConfigYearInput.value = String(new Date().getFullYear());
      idConfigFormDirty = true;
      updateBookingIdDraftPreview();
    });
  }

  if (revertIdConfigBtn) {
    revertIdConfigBtn.addEventListener('click', () => {
      syncBookingIdFormFromState(true);
      showToast('info', 'Edits Reverted', 'Form restored to the active Booking ID settings.');
    });
  }

  // Save customized Booking ID settings
  if (bookingIdConfigForm) {
    bookingIdConfigForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const prefix = sanitizeIdSegment(idConfigPrefixInput ? idConfigPrefixInput.value : '');
      const year   = sanitizeIdSegment(idConfigYearInput ? idConfigYearInput.value : '');
      const rawSeq = idConfigNextSeqInput ? parseInt(idConfigNextSeqInput.value, 10) : NaN;

      if (!prefix) {
        alert('Please enter a valid ID Prefix (e.g. SIC).');
        if (idConfigPrefixInput) idConfigPrefixInput.focus();
        return;
      }
      if (!year) {
        alert('Please enter a valid Year / Segment (e.g. 2026 or 2027).');
        if (idConfigYearInput) idConfigYearInput.focus();
        return;
      }
      if (!Number.isFinite(rawSeq) || rawSeq < 1) {
        alert('Next Sequence Number must be a whole number starting from 1 (001) or higher.');
        if (idConfigNextSeqInput) idConfigNextSeqInput.focus();
        return;
      }

      const nextSequence = Math.floor(rawSeq);
      if (saveIdConfigBtn) {
        saveIdConfigBtn.innerHTML = '<span class="spinner"></span> Saving...';
        saveIdConfigBtn.classList.add('loading');
        saveIdConfigBtn.disabled = true;
      }

      try {
        await db.collection(BOOKING_ID_SETTINGS_COLLECTION).doc(BOOKING_ID_SETTINGS_DOC).set({
          prefix: prefix,
          year: year,
          nextSequence: nextSequence,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        bookingIdConfigState = { prefix, year, nextSequence };
        idConfigFormDirty = false;
        updateActiveBookingIdBadges();
        syncBookingIdFormFromState(true);

        const nextFormatted = formatSequentialBookingId(prefix, year, nextSequence);
        showToast('success', 'Booking ID Settings Saved', `Upcoming reservations will start at ${nextFormatted}.`);
      } catch (err) {
        console.error('Failed to save Booking ID settings:', err);
        if (err && err.code === 'permission-denied') {
          showToast('error', 'Firestore Rules Needed', 'Publish the updated firestore.rules (settings/bookingId) in Firebase Console, then try again.');
        } else {
          showToast('error', 'Error', 'Failed to save Booking ID settings.');
        }
      } finally {
        if (saveIdConfigBtn) {
          saveIdConfigBtn.innerHTML = 'Save ID Settings';
          saveIdConfigBtn.classList.remove('loading');
          saveIdConfigBtn.disabled = false;
        }
      }
    });
  }

  // Open Reset-to-001 Confirmation Modal
  if (resetCounterToOneBtn) {
    resetCounterToOneBtn.addEventListener('click', () => {
      const targetPrefix = sanitizeIdSegment(idConfigPrefixInput ? idConfigPrefixInput.value : '') || bookingIdConfigState.prefix;
      const targetYear   = sanitizeIdSegment(idConfigYearInput ? idConfigYearInput.value : '') || bookingIdConfigState.year;
      const previewFirst = formatSequentialBookingId(targetPrefix, targetYear, 1);
      const seriesPrefix = `${targetPrefix}-${targetYear}-`;

      pendingResetTarget = { prefix: targetPrefix, year: targetYear };
      if (resetPreviewIdText) resetPreviewIdText.textContent = previewFirst;

      if (resetExistingSeriesWarning) {
        const matchingCount = allBookings.filter(b =>
          String(b.referenceId || '').toUpperCase().startsWith(seriesPrefix)
        ).length;

        if (matchingCount > 0) {
          resetExistingSeriesWarning.textContent = `Note: ${matchingCount} existing reservation${matchingCount === 1 ? '' : 's'} already use "${seriesPrefix}...". Their issued IDs will remain unchanged.`;
          resetExistingSeriesWarning.style.display = 'block';
        } else {
          resetExistingSeriesWarning.style.display = 'none';
        }
      }

      if (resetBookingIdModal) resetBookingIdModal.classList.add('visible');
    });
  }

  window.closeResetBookingIdModal = function () {
    if (resetBookingIdModal) resetBookingIdModal.classList.remove('visible');
    pendingResetTarget = null;
  };

  if (resetBookingIdModal) {
    resetBookingIdModal.addEventListener('click', (e) => {
      if (e.target === resetBookingIdModal) window.closeResetBookingIdModal();
    });
  }

  if (confirmResetBookingIdBtn) {
    confirmResetBookingIdBtn.addEventListener('click', async () => {
      const targetPrefix = (pendingResetTarget && pendingResetTarget.prefix) || bookingIdConfigState.prefix;
      const targetYear   = (pendingResetTarget && pendingResetTarget.year) || bookingIdConfigState.year;

      confirmResetBookingIdBtn.innerHTML = '<span class="spinner"></span> Resetting...';
      confirmResetBookingIdBtn.classList.add('loading');
      confirmResetBookingIdBtn.disabled = true;

      try {
        await db.collection(BOOKING_ID_SETTINGS_COLLECTION).doc(BOOKING_ID_SETTINGS_DOC).set({
          prefix: targetPrefix,
          year: targetYear,
          nextSequence: 1,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        bookingIdConfigState = {
          prefix: targetPrefix,
          year: targetYear,
          nextSequence: 1
        };
        idConfigFormDirty = false;
        updateActiveBookingIdBadges();
        syncBookingIdFormFromState(true);

        const resetId = formatSequentialBookingId(targetPrefix, targetYear, 1);
        window.closeResetBookingIdModal();
        showToast('success', 'Counter Reset to 001', `The next reservation submitted will be assigned ${resetId}.`);
      } catch (err) {
        console.error('Failed to reset Booking ID counter:', err);
        if (err && err.code === 'permission-denied') {
          showToast('error', 'Firestore Rules Needed', 'Publish the updated firestore.rules (settings/bookingId) in Firebase Console, then try again.');
        } else {
          showToast('error', 'Error', 'Failed to reset Booking ID counter.');
        }
      } finally {
        confirmResetBookingIdBtn.innerHTML = 'Reset to 001';
        confirmResetBookingIdBtn.classList.remove('loading');
        confirmResetBookingIdBtn.disabled = false;
      }
    });
  }

  // ============================================================
  // INTERNAL PDF SIGNATORIES MANAGEMENT
  // ============================================================
  const SIGNATORIES_SETTINGS_DOC = 'signatories';

  let signatoriesState = {
    facilitiesInCharge: '',
    comptroller: '',
    generalAdminCoordinator: ''
  };
  let signatoriesFormDirty = false;

  const signatoriesForm             = document.getElementById('signatoriesForm');
  const sigFacilitiesInChargeInput  = document.getElementById('sigFacilitiesInCharge');
  const sigComptrollerInput         = document.getElementById('sigComptroller');
  const sigGeneralAdminInput        = document.getElementById('sigGeneralAdmin');
  const saveSignatoriesBtn          = document.getElementById('saveSignatoriesBtn');
  const revertSignatoriesBtn        = document.getElementById('revertSignatoriesBtn');
  const clearSignatoriesBtn         = document.getElementById('clearSignatoriesBtn');
  const previewSigFacilitiesEl      = document.getElementById('previewSigFacilitiesInCharge');
  const previewSigComptrollerEl     = document.getElementById('previewSigComptroller');
  const previewSigGeneralAdminEl    = document.getElementById('previewSigGeneralAdmin');

  function renderPreviewSignatorySlot(el, value) {
    if (!el) return;
    const trimmed = String(value || '').trim();
    if (trimmed) {
      el.textContent = trimmed;
      el.classList.remove('is-placeholder');
    } else {
      el.textContent = '(Blank line)';
      el.classList.add('is-placeholder');
    }
  }

  function updateSignatoriesPreview() {
    const facVal  = sigFacilitiesInChargeInput ? sigFacilitiesInChargeInput.value : signatoriesState.facilitiesInCharge;
    const compVal = sigComptrollerInput ? sigComptrollerInput.value : signatoriesState.comptroller;
    const genVal  = sigGeneralAdminInput ? sigGeneralAdminInput.value : signatoriesState.generalAdminCoordinator;

    renderPreviewSignatorySlot(previewSigFacilitiesEl, facVal);
    renderPreviewSignatorySlot(previewSigComptrollerEl, compVal);
    renderPreviewSignatorySlot(previewSigGeneralAdminEl, genVal);
  }

  function syncSignatoriesFormFromState(forceOverwrite = false) {
    if (signatoriesFormDirty && !forceOverwrite) {
      updateSignatoriesPreview();
      return;
    }
    if (sigFacilitiesInChargeInput) sigFacilitiesInChargeInput.value = signatoriesState.facilitiesInCharge;
    if (sigComptrollerInput)        sigComptrollerInput.value        = signatoriesState.comptroller;
    if (sigGeneralAdminInput)       sigGeneralAdminInput.value       = signatoriesState.generalAdminCoordinator;
    signatoriesFormDirty = false;
    updateSignatoriesPreview();
  }

  function listenSignatoriesConfig() {
    const sigRef = db.collection(BOOKING_ID_SETTINGS_COLLECTION).doc(SIGNATORIES_SETTINGS_DOC);

    sigRef.onSnapshot((docSnap) => {
      if (docSnap.exists) {
        const data = docSnap.data() || {};
        signatoriesState = {
          facilitiesInCharge:      String(data.facilitiesInCharge || '').trim(),
          comptroller:             String(data.comptroller || '').trim(),
          generalAdminCoordinator: String(data.generalAdminCoordinator || '').trim()
        };
      } else {
        signatoriesState = {
          facilitiesInCharge: '',
          comptroller: '',
          generalAdminCoordinator: ''
        };
      }
      syncSignatoriesFormFromState(false);
    }, (err) => {
      console.warn('Signatories config listener error (publish updated firestore.rules if permission-denied):', err);
      syncSignatoriesFormFromState(false);
    });
  }

  [sigFacilitiesInChargeInput, sigComptrollerInput, sigGeneralAdminInput].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('input', () => {
      signatoriesFormDirty = true;
      updateSignatoriesPreview();
    });
  });

  if (revertSignatoriesBtn) {
    revertSignatoriesBtn.addEventListener('click', () => {
      syncSignatoriesFormFromState(true);
      showToast('info', 'Edits Reverted', 'Form restored to the saved PDF signatory names.');
    });
  }

  if (clearSignatoriesBtn) {
    clearSignatoriesBtn.addEventListener('click', () => {
      if (sigFacilitiesInChargeInput) sigFacilitiesInChargeInput.value = '';
      if (sigComptrollerInput)        sigComptrollerInput.value        = '';
      if (sigGeneralAdminInput)       sigGeneralAdminInput.value       = '';
      signatoriesFormDirty = true;
      updateSignatoriesPreview();
      showToast('info', 'Fields Cleared', 'Click "Save Signatories" to apply blank lines to future PDFs.');
    });
  }

  if (signatoriesForm) {
    signatoriesForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const facilitiesInCharge      = String(sigFacilitiesInChargeInput ? sigFacilitiesInChargeInput.value : '').trim();
      const comptroller             = String(sigComptrollerInput ? sigComptrollerInput.value : '').trim();
      const generalAdminCoordinator = String(sigGeneralAdminInput ? sigGeneralAdminInput.value : '').trim();

      if (saveSignatoriesBtn) {
        saveSignatoriesBtn.innerHTML = '<span class="spinner"></span> Saving...';
        saveSignatoriesBtn.classList.add('loading');
        saveSignatoriesBtn.disabled = true;
      }

      try {
        await db.collection(BOOKING_ID_SETTINGS_COLLECTION).doc(SIGNATORIES_SETTINGS_DOC).set({
          facilitiesInCharge,
          comptroller,
          generalAdminCoordinator,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        signatoriesState = { facilitiesInCharge, comptroller, generalAdminCoordinator };
        signatoriesFormDirty = false;
        syncSignatoriesFormFromState(true);
        showToast('success', 'Signatories Saved', 'Internal Booking PDFs will now print the updated signatory names.');
      } catch (err) {
        console.error('Failed to save PDF signatories:', err);
        if (err && err.code === 'permission-denied') {
          showToast('error', 'Firestore Rules Needed', 'Publish the updated firestore.rules (settings/signatories) in Firebase Console, then try again.');
        } else {
          showToast('error', 'Error', 'Failed to save PDF signatories. Please try again.');
        }
      } finally {
        if (saveSignatoriesBtn) {
          saveSignatoriesBtn.innerHTML = 'Save Signatories';
          saveSignatoriesBtn.classList.remove('loading');
          saveSignatoriesBtn.disabled = false;
        }
      }
    });
  }

})();


// Mobile sidebar toggle
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileSidebar = document.getElementById('sidebar');
if (mobileMenuBtn && mobileSidebar) {
  mobileMenuBtn.addEventListener('click', () => {
    mobileSidebar.classList.toggle('open');
  });
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 992) {
        mobileSidebar.classList.remove('open');
      }
    });
  });
}
