/* ============================================================
   Dashboard Controller — San Isidro College Reservation System
   Controller Layer (js/controllers/dashboard-controller.js)
   Coordinates authentication guard, real-time bookings listener,
   search/filter/sort pipeline, approve/reject/delete actions,
   and sidebar view navigation on dashboard.html.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'DashboardController';

  EmailService.init();

  // ---- State ----
  let allBookings       = [];
  let activeFilter      = 'all';
  let currentModalDocId = null;
  let deletingBookingId = null;
  let currentView       = 'bookings';

  const filterState = {
    search:   '',
    facility: '',
    userType: '',
    deptOrg:  '',
    dateFrom: '',
    dateTo:   '',
    sort:     'submitted_desc'
  };

  // ---- DOM ----
  const filterTabs             = document.getElementById('filterTabs');
  const detailsModal           = document.getElementById('detailsModal');
  const logoutBtn              = document.getElementById('logoutBtn');
  const bookingSearchInput     = document.getElementById('bookingSearchInput');
  const bookingSearchClearBtn  = document.getElementById('bookingSearchClearBtn');
  const filterFacilityVehicle  = document.getElementById('filterFacilityVehicle');
  const filterUserType         = document.getElementById('filterUserType');
  const filterDeptOrg          = document.getElementById('filterDeptOrg');
  const filterDateFrom         = document.getElementById('filterDateFrom');
  const filterDateTo           = document.getElementById('filterDateTo');
  const filterSort             = document.getElementById('filterSort');
  const clearBookingFiltersBtn = document.getElementById('clearBookingFiltersBtn');
  const sidebarLinks           = document.querySelectorAll('.sidebar-link[data-filter]');

  // ---- Auth Guard & Live Role Profile Enforcement ----
  let unsubscribeSelfProfile = null;

  function applyRoleFormRestrictions() {
    const isAdmin = Boolean(window.Session && Session.isAdmin());
    ['bookingIdConfigForm', 'signatoriesForm'].forEach(formId => {
      const form = document.getElementById(formId);
      if (!form) return;
      form.querySelectorAll('input, select, textarea, button').forEach(el => {
        el.disabled = isAdmin;
      });
    });
  }

  AuthModel.onChange(async (user) => {
    if (unsubscribeSelfProfile) {
      unsubscribeSelfProfile();
      unsubscribeSelfProfile = null;
    }

    if (!user) {
      if (window.Session) Session.clear();
      window.location.href = 'admin.html';
      return;
    }

    let profile = null;
    try {
      profile = await UserModel.getProfile(user.uid);
    } catch (err) {
      Logger.error(LAYER, 'Could not fetch staff profile:', err);
    }

    if (!profile) {
      await AuthModel.logout();
      window.location.href = 'admin.html?reason=unregistered';
      return;
    }

    if (profile.status !== 'Active') {
      await AuthModel.logout();
      window.location.href = 'admin.html?reason=inactive';
      return;
    }

    Session.set(profile);
    DashboardView.renderAdminInfo(user, profile);
    applyRoleFormRestrictions();

    // Live listener: if the Admin deactivates or deletes this account mid-session,
    // immediately sign out and redirect to admin.html.
    unsubscribeSelfProfile = UserModel.listenProfile(user.uid, async (liveProfile) => {
      if (!liveProfile || liveProfile.status !== 'Active') {
        if (unsubscribeSelfProfile) {
          unsubscribeSelfProfile();
          unsubscribeSelfProfile = null;
        }
        Session.clear();
        await AuthModel.logout();
        window.location.href = 'admin.html?reason=revoked';
        return;
      }
      Session.set(liveProfile);
      DashboardView.renderAdminInfo(user, liveProfile);
      applyRoleFormRestrictions();
    });

    if (window.BookingNotifier && typeof window.BookingNotifier.init === 'function') {
      window.BookingNotifier.init();
    }

    listenBookings();
    FacilityController.startListening(() => refreshFilterDropdowns());
    VehicleController.startListening(() => refreshFilterDropdowns());
    if (window.DepartmentController && typeof window.DepartmentController.startListening === 'function') {
      DepartmentController.startListening(() => refreshFilterDropdowns());
    }
    if (Session.isAdmin() && window.AccountController && typeof AccountController.startListening === 'function') {
      AccountController.startListening(() => {
        if (window.ActivityLogController && typeof ActivityLogController.populateAccountFilterOptions === 'function') {
          ActivityLogController.populateAccountFilterOptions();
        }
      });
    }
    SettingsController.listenBookingIdConfig();
    SettingsController.listenSignatoriesConfig();
  });

  // ---- Logout ----
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (unsubscribeSelfProfile) {
        unsubscribeSelfProfile();
        unsubscribeSelfProfile = null;
      }
      if (window.ActivityLogModel && window.Session && Session.profile) {
        await ActivityLogModel.log('AUTH_LOGOUT', 'Auth', {
          targetId:    Session.profile.uid,
          targetLabel: Session.profile.email,
          details:     { role: Session.profile.role, fullName: Session.profile.fullName }
        });
      }
      if (window.Session) Session.clear();
      await AuthModel.logout();
      window.location.href = 'admin.html';
    });
  }

  // ---- Bookings Real-Time Listener ----
  function refreshFilterDropdowns() {
    DashboardView.populateFilterDropdowns(
      allBookings,
      window._allFacilities || [],
      window._allVehicles || [],
      filterState
    );
  }

  function listenBookings() {
    BookingModel.listenAll((bookings, snapshot) => {
      allBookings = bookings;
      window._allBookings = allBookings;
      if (window.BookingNotifier && typeof window.BookingNotifier.processSnapshot === 'function') {
        window.BookingNotifier.processSnapshot(snapshot);
      }
      refreshFilterDropdowns();
      DashboardView.renderStats(allBookings);
      renderTable();
      if (currentView === 'reports' && typeof window.initReportsView === 'function') {
        window.initReportsView();
      }
      if (currentView === 'dataManagement' && window.DataManagementController && typeof DataManagementController.refreshView === 'function') {
        DataManagementController.refreshView();
      }
    });
  }

  // ---- Filter & Sort Pipeline ----
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
      if (q) {
        const haystack = [
          b.referenceId,
          Utils.getBookingRequesterName(b),
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

      if (filterState.facility) {
        if (filterState.facility === '__any_vehicle__') {
          if (Utils.getBookingVehicleArray(b).length === 0) return false;
        } else if (filterState.facility.startsWith('fac:')) {
          const targetFac = filterState.facility.slice(4);
          if ((b.facility || '').trim() !== targetFac) return false;
        } else if (filterState.facility.startsWith('veh:')) {
          const targetVeh = filterState.facility.slice(4);
          if (!Utils.getBookingVehicleArray(b).includes(targetVeh)) return false;
        }
      }

      if (filterState.userType) {
        const bType = b.userType || 'Internal';
        if (bType !== filterState.userType) return false;
      }

      if (filterState.deptOrg) {
        const bType = b.userType || 'Internal';
        if (filterState.deptOrg.startsWith('int:')) {
          if (bType !== 'Internal') return false;
          const targetDept = filterState.deptOrg.slice(4);
          if (targetDept === 'College') {
            if (!DashboardView.isCollegeBooking(b)) return false;
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
          if (DashboardView.getExternalOrgName(b) !== targetOrg) return false;
        }
      }

      if (filterState.dateFrom || filterState.dateTo) {
        const bounds = getBookingDateBounds(b);
        if (!bounds) return false;
        if (filterState.dateFrom && bounds.end < filterState.dateFrom) return false;
        if (filterState.dateTo && bounds.start > filterState.dateTo) return false;
      }

      return true;
    });

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
      const todayIso = Utils.getLocalDateStr();
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

  const BOOKINGS_PAGE_SIZE = 10;
  let currentBookingsPage  = 1;

  function renderTable() {
    const { filtered, baseTotal } = getFilteredBookings();
    const totalPages = Math.max(1, Math.ceil(filtered.length / BOOKINGS_PAGE_SIZE));
    if (currentBookingsPage > totalPages) currentBookingsPage = totalPages;
    if (currentBookingsPage < 1) currentBookingsPage = 1;

    DashboardView.renderBookingsTable(filtered, baseTotal, hasActiveSearchOrFilter(), {
      currentPage: currentBookingsPage,
      pageSize:    BOOKINGS_PAGE_SIZE,
      onPageChange: (nextPage) => {
        currentBookingsPage = nextPage;
        renderTable();
        const tableCard = document.querySelector('.table-card');
        if (tableCard && typeof tableCard.scrollIntoView === 'function') {
          tableCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    });
  }

  // ---- Search & Filter Listeners ----
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
        currentBookingsPage = 1;
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
      currentBookingsPage = 1;
      renderTable();
      bookingSearchInput.focus();
    });
  }

  if (filterFacilityVehicle) {
    filterFacilityVehicle.addEventListener('change', () => {
      filterState.facility = filterFacilityVehicle.value;
      currentBookingsPage = 1;
      renderTable();
    });
  }

  if (filterUserType) {
    filterUserType.addEventListener('change', () => {
      filterState.userType = filterUserType.value;
      currentBookingsPage = 1;
      renderTable();
    });
  }

  if (filterDeptOrg) {
    filterDeptOrg.addEventListener('change', () => {
      filterState.deptOrg = filterDeptOrg.value;
      currentBookingsPage = 1;
      renderTable();
    });
  }

  if (filterDateFrom) {
    filterDateFrom.addEventListener('change', () => {
      filterState.dateFrom = filterDateFrom.value;
      currentBookingsPage = 1;
      renderTable();
    });
  }

  if (filterDateTo) {
    filterDateTo.addEventListener('change', () => {
      filterState.dateTo = filterDateTo.value;
      currentBookingsPage = 1;
      renderTable();
    });
  }

  if (filterSort) {
    filterSort.addEventListener('change', () => {
      filterState.sort = filterSort.value || 'submitted_desc';
      currentBookingsPage = 1;
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
      currentBookingsPage  = 1;

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

  if (filterTabs) {
    filterTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.filter-tab');
      if (!tab) return;

      filterTabs.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.filter;
      currentBookingsPage = 1;

      sidebarLinks.forEach(l => {
        l.classList.toggle('active', l.dataset.filter === activeFilter);
      });

      renderTable();
    });
  }

  sidebarLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (currentView !== 'bookings') {
        switchView('bookings');
      }
      const filter = link.dataset.filter;
      activeFilter = filter;
      currentBookingsPage = 1;

      sidebarLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      if (filterTabs) {
        filterTabs.querySelectorAll('.filter-tab').forEach(t => {
          t.classList.toggle('active', t.dataset.filter === filter);
        });
      }

      renderTable();
    });
  });

  // ---- Approve / Reject / View Details / Delete ----
  async function updateBookingStatus(docId, newStatus, extraFields = {}) {
    if (window.Session && !Session.requireFic(`${newStatus.toLowerCase()} reservations`)) return;
    try {
      const data = await BookingModel.updateStatus(docId, newStatus, extraFields);
      if (data) {
        if (window.ActivityLogModel) {
          ActivityLogModel.log(
            newStatus === 'Approved' ? 'BOOKING_APPROVE' : 'BOOKING_REJECT',
            'Booking',
            {
              targetId:    docId,
              targetLabel: data.referenceId || docId,
              details: {
                referenceId: data.referenceId || '',
                requester:   Utils.getBookingRequesterName(data),
                location:    Utils.getBookingLocation(data),
                driverName:  data.assignedDriverName || '',
                driverPhone: data.assignedDriverPhone || '',
                startDate:   data.startDate || data.date || '',
                endDate:     data.endDate || data.startDate || data.date || '',
                status:      newStatus
              }
            }
          );
        }
        EmailService.sendStatusNotification(data, newStatus);
        const driverNote = (newStatus === 'Approved' && data.assignedDriverName)
          ? ` (Driver: ${data.assignedDriverName})`
          : '';
        UiView.showToast(
          newStatus === 'Approved' ? 'success' : 'warning',
          `Reservation ${newStatus}`,
          `${data.name}'s booking for ${Utils.getBookingLocation(data)} has been ${newStatus.toLowerCase()}${driverNote}.`
        );
      }
    } catch (err) {
      Logger.error(LAYER, 'Status update failed:', err);
      UiView.showToast('error', 'Error', 'Failed to update reservation status.');
    }
  }

  window.approveBooking = async function (docId, driverPayload) {
    if (window.Session && !Session.requireFic('approve reservations')) return;
    const booking = allBookings.find(b => b.id === docId);
    if (booking && Utils.isVehicleBooking(booking) && !driverPayload && !booking.assignedDriverName) {
      await window.viewBookingDetails(docId);
      const driverSelect = document.getElementById('modalDriverSelect');
      if (driverSelect) {
        driverSelect.focus();
      }
      UiView.showToast('info', 'Assign Driver Required', 'Please select a driver for this vehicle booking before approving.');
      return;
    }

    if (!confirm('Approve this reservation?')) return;
    await updateBookingStatus(docId, 'Approved', driverPayload || {});
  };

  window.rejectBooking = async function (docId) {
    if (window.Session && !Session.requireFic('reject reservations')) return;
    if (!confirm('Reject this reservation?')) return;
    await updateBookingStatus(docId, 'Rejected');
  };

  window.closeDetailsModal = function () {
    if (detailsModal) detailsModal.classList.remove('visible');
    currentModalDocId = null;
  };

  if (detailsModal) {
    detailsModal.addEventListener('click', (e) => {
      if (e.target === detailsModal) window.closeDetailsModal();
    });
  }

  function dataUrlToPdfBlobUrl(dataUrl) {
    try {
      const safe = Utils.sanitizeUrl(dataUrl);
      if (!safe) return '';
      if (safe.startsWith('http://') || safe.startsWith('https://')) return safe;
      const parts = safe.split(',');
      if (parts.length < 2) return '';
      const binary = atob(parts[1]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      return URL.createObjectURL(blob);
    } catch (err) {
      Logger.warn(LAYER, 'Failed to create PDF Blob URL:', err);
      return '';
    }
  }

  function openLetterOfIntentPdf(dataUrl) {
    const blobUrl = dataUrlToPdfBlobUrl(dataUrl);
    if (!blobUrl) {
      UiView.showToast('error', 'PDF Error', 'Could not open the Letter of Intent PDF.');
      return;
    }
    window.open(blobUrl, '_blank', 'noopener');
    if (blobUrl.startsWith('blob:')) {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    }
  }

  function downloadLetterOfIntentPdf(dataUrl, fileName) {
    const blobUrl = dataUrlToPdfBlobUrl(dataUrl);
    if (!blobUrl) {
      UiView.showToast('error', 'PDF Error', 'Could not download the Letter of Intent PDF.');
      return;
    }
    const safeName = (fileName || 'Letter_of_Intent.pdf').endsWith('.pdf')
      ? (fileName || 'Letter_of_Intent.pdf')
      : `${fileName}.pdf`;
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = safeName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    if (blobUrl.startsWith('blob:')) {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    }
  }

  window.viewBookingDetails = async function (docId) {
    const booking = allBookings.find(b => b.id === docId);
    if (!booking) return;

    currentModalDocId = docId;
    if (window.BookingNotifier && typeof window.BookingNotifier.markBookingRead === 'function') {
      window.BookingNotifier.markBookingRead(docId);
    }

    let receiptUrl = '';
    let loiData    = null;
    if (booking.userType === 'External') {
      const [fetchedReceipt, fetchedLoi] = await Promise.all([
        booking.hasReceipt
          ? BookingModel.getReceipt(docId, booking.receiptUrl || booking.gcashReceipt)
          : Promise.resolve(Utils.sanitizeUrl(booking.receiptUrl || booking.gcashReceipt)),
        BookingModel.getLetterOfIntent(docId)
      ]);
      receiptUrl = fetchedReceipt;
      loiData    = fetchedLoi;
    }

    DashboardView.renderBookingDetailsModal(booking, receiptUrl, {
      onApprove:        window.approveBooking,
      onReject:         window.rejectBooking,
      onDelete:         window.deleteBooking,
      onClose:          window.closeDetailsModal,
      loiData:          loiData,
      onOpenLoiPdf:     openLetterOfIntentPdf,
      onDownloadLoiPdf: downloadLetterOfIntentPdf
    });
  };

  // Delete Booking
  const deleteBookingModal      = document.getElementById('deleteBookingModal');
  const deleteBookingRef        = document.getElementById('deleteBookingRef');
  const confirmDeleteBookingBtn = document.getElementById('confirmDeleteBookingBtn');

  window.deleteBooking = function (docId) {
    if (window.Session && !Session.requireAdmin('delete bookings')) return;
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
      if (window.Session && !Session.requireAdmin('delete bookings')) return;

      const booking = allBookings.find(b => b.id === deletingBookingId);
      const targetId = deletingBookingId;
      window.closeDeleteBookingModal();

      if (window.UiView && typeof UiView.requirePassword === 'function') {
        const verified = await UiView.requirePassword(`permanently delete booking "${booking?.referenceId || targetId}"`);
        if (!verified) return;
      }

      try {
        const hasReceipt = Boolean(booking && (booking.hasReceipt || booking.receiptUploadedAt));
        const hasLetterOfIntent = Boolean(booking && booking.hasLetterOfIntent);
        const lookupKey = (booking && booking.lookupKey) || '';
        await BookingModel.remove(targetId, hasReceipt, hasLetterOfIntent, lookupKey);
        if (window.ActivityLogModel) {
          ActivityLogModel.log('BOOKING_DELETE', 'Data', {
            targetId,
            targetLabel: booking?.referenceId || targetId,
            details: {
              referenceId: booking?.referenceId || '',
              requester:   booking ? Utils.getBookingRequesterName(booking) : '',
              location:    booking ? Utils.getBookingLocation(booking) : '',
              startDate:   booking?.startDate || booking?.date || '',
              status:      booking?.status || ''
            }
          });
        }
        UiView.showToast('warning', 'Booking Deleted', `Booking "${booking?.referenceId || ''}" has been permanently deleted.`);
      } catch (err) {
        Logger.error(LAYER, 'Delete booking error:', err);
        UiView.showToast('error', 'Error', 'Failed to delete booking.');
      }
    });
  }

  if (deleteBookingModal) {
    deleteBookingModal.addEventListener('click', (e) => {
      if (e.target === deleteBookingModal) window.closeDeleteBookingModal();
    });
  }

  // ---- View Switching (Sidebar Navigation) ----
  const facilitiesSection     = document.getElementById('facilitiesSection');
  const vehiclesSection       = document.getElementById('vehiclesSection');
  const departmentsSection    = document.getElementById('departmentsSection');
  const reportsSection        = document.getElementById('reportsSection');
  const idSettingsSection     = document.getElementById('idSettingsSection');
  const signatoriesSection    = document.getElementById('signatoriesSection');
  const accountsSection       = document.getElementById('accountsSection');
  const activityLogsSection   = document.getElementById('activityLogsSection');
  const dataManagementSection = document.getElementById('dataManagementSection');

  const sidebarFacilities     = document.getElementById('sidebarFacilities');
  const sidebarVehicles       = document.getElementById('sidebarVehicles');
  const sidebarDepartments    = document.getElementById('sidebarDepartments');
  const sidebarReports        = document.getElementById('sidebarReports');
  const sidebarIdSettings     = document.getElementById('sidebarIdSettings');
  const sidebarSignatories    = document.getElementById('sidebarSignatories');
  const sidebarAccounts       = document.getElementById('sidebarAccounts');
  const sidebarActivityLogs   = document.getElementById('sidebarActivityLogs');
  const sidebarDataManagement = document.getElementById('sidebarDataManagement');
  const openIdSettingsBtn     = document.getElementById('openIdSettingsBtn');

  const bookingsViewElements = [
    document.querySelector('.dashboard-topbar'),
    document.querySelector('.stats-grid'),
    document.getElementById('filterTabs'),
    document.getElementById('bookingFilters'),
    document.querySelector('.table-card')
  ].filter(Boolean);

  function switchView(view) {
    if ((view === 'accounts' || view === 'activityLogs' || view === 'dataManagement')
        && window.Session && !Session.requireAdmin('access Administration pages')) {
      return;
    }

    currentView = view;

    bookingsViewElements.forEach(el => el.style.display = 'none');
    if (facilitiesSection)     facilitiesSection.style.display     = 'none';
    if (vehiclesSection)       vehiclesSection.style.display       = 'none';
    if (departmentsSection)    departmentsSection.style.display    = 'none';
    if (reportsSection)        reportsSection.style.display        = 'none';
    if (idSettingsSection)     idSettingsSection.style.display     = 'none';
    if (signatoriesSection)    signatoriesSection.style.display    = 'none';
    if (accountsSection)       accountsSection.style.display       = 'none';
    if (activityLogsSection)   activityLogsSection.style.display   = 'none';
    if (dataManagementSection) dataManagementSection.style.display = 'none';

    sidebarLinks.forEach(l => l.classList.remove('active'));
    [
      sidebarFacilities, sidebarVehicles, sidebarDepartments, sidebarReports,
      sidebarIdSettings, sidebarSignatories, sidebarAccounts, sidebarActivityLogs, sidebarDataManagement
    ].forEach(el => { if (el) el.classList.remove('active'); });

    if (view === 'facilities') {
      if (facilitiesSection) facilitiesSection.style.display = 'block';
      if (sidebarFacilities) sidebarFacilities.classList.add('active');
    } else if (view === 'vehicles') {
      if (vehiclesSection) vehiclesSection.style.display = 'block';
      if (sidebarVehicles) sidebarVehicles.classList.add('active');
    } else if (view === 'departments') {
      if (departmentsSection) departmentsSection.style.display = 'block';
      if (sidebarDepartments) sidebarDepartments.classList.add('active');
    } else if (view === 'reports') {
      if (reportsSection) reportsSection.style.display = 'block';
      if (sidebarReports) sidebarReports.classList.add('active');
      if (typeof window.initReportsView === 'function') window.initReportsView();
    } else if (view === 'idSettings') {
      if (idSettingsSection) idSettingsSection.style.display = 'block';
      if (sidebarIdSettings) sidebarIdSettings.classList.add('active');
      SettingsController.syncBookingIdFormFromState(false);
    } else if (view === 'signatories') {
      if (signatoriesSection) signatoriesSection.style.display = 'block';
      if (sidebarSignatories) sidebarSignatories.classList.add('active');
      SettingsController.syncSignatoriesFormFromState(false);
    } else if (view === 'accounts') {
      if (accountsSection) accountsSection.style.display = 'block';
      if (sidebarAccounts) sidebarAccounts.classList.add('active');
    } else if (view === 'activityLogs') {
      if (activityLogsSection) activityLogsSection.style.display = 'block';
      if (sidebarActivityLogs) sidebarActivityLogs.classList.add('active');
      if (window.ActivityLogController && typeof ActivityLogController.loadMonthLogs === 'function') {
        ActivityLogController.loadMonthLogs();
      }
    } else if (view === 'dataManagement') {
      if (dataManagementSection) dataManagementSection.style.display = 'block';
      if (sidebarDataManagement) sidebarDataManagement.classList.add('active');
      if (window.DataManagementController && typeof DataManagementController.refreshView === 'function') {
        DataManagementController.refreshView();
      }
    } else {
      bookingsViewElements.forEach(el => {
        if (el.classList.contains('stats-grid')) {
          el.style.display = el.classList.contains('row') ? 'flex' : 'grid';
        } else if (el.classList.contains('filter-tabs')) {
          el.style.display = 'flex';
        } else {
          el.style.display = '';
        }
      });
    }
  }

  window.showSection = switchView;

  window.switchToBookingsView = function () {
    if (currentView !== 'bookings') {
      switchView('bookings');
      sidebarLinks.forEach(l => {
        l.classList.toggle('active', l.dataset.filter === activeFilter);
      });
    }
  };

  if (sidebarFacilities)     sidebarFacilities.addEventListener('click', (e) => { e.preventDefault(); switchView('facilities'); });
  if (sidebarVehicles)       sidebarVehicles.addEventListener('click', (e) => { e.preventDefault(); switchView('vehicles'); });
  if (sidebarDepartments)    sidebarDepartments.addEventListener('click', (e) => { e.preventDefault(); switchView('departments'); });
  if (sidebarReports)        sidebarReports.addEventListener('click', (e) => { e.preventDefault(); switchView('reports'); });
  if (sidebarIdSettings)     sidebarIdSettings.addEventListener('click', (e) => { e.preventDefault(); switchView('idSettings'); });
  if (sidebarSignatories)    sidebarSignatories.addEventListener('click', (e) => { e.preventDefault(); switchView('signatories'); });
  if (sidebarAccounts)       sidebarAccounts.addEventListener('click', (e) => { e.preventDefault(); switchView('accounts'); });
  if (sidebarActivityLogs)   sidebarActivityLogs.addEventListener('click', (e) => { e.preventDefault(); switchView('activityLogs'); });
  if (sidebarDataManagement) sidebarDataManagement.addEventListener('click', (e) => { e.preventDefault(); switchView('dataManagement'); });
  if (openIdSettingsBtn)     openIdSettingsBtn.addEventListener('click', () => switchView('idSettings'));

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
})();

