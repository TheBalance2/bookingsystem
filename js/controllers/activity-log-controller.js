/* ============================================================
   Activity Log Controller — San Isidro College Reservation System
   Controller Layer (js/controllers/activity-log-controller.js)
   Handles the True Admin Activity Logs audit viewer, filtering by
   month/account/category/search, Excel export, and monthly log purge.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'ActivityLogController';

  let monthLogs        = [];
  let currentMonthKey  = ActivityLogModel.getCurrentMonthKey();
  let filterActorUid   = 'all';
  let filterCategory   = 'all';
  let filterSearch     = '';

  const logMonthFilter          = document.getElementById('logMonthFilter');
  const logAccountFilter        = document.getElementById('logAccountFilter');
  const logCategoryFilter       = document.getElementById('logCategoryFilter');
  const logSearchInput          = document.getElementById('logSearchInput');
  const refreshLogsBtn          = document.getElementById('refreshLogsBtn');
  const exportLogsExcelBtn      = document.getElementById('exportLogsExcelBtn');
  const openDeleteLogsModalBtn  = document.getElementById('openDeleteLogsModalBtn');
  const activityLogsTableBody   = document.getElementById('activityLogsTableBody');
  const activityLogsEmptyState  = document.getElementById('activityLogsEmptyState');

  // Summary Stats
  const logStatTotal            = document.getElementById('logStatTotal');
  const logStatApprovals        = document.getElementById('logStatApprovals');
  const logStatRejections       = document.getElementById('logStatRejections');
  const logStatTopActor         = document.getElementById('logStatTopActor');

  // Delete Month Logs Modal
  const deleteLogsMonthModal    = document.getElementById('deleteLogsMonthModal');
  const deleteLogsMonthLabel    = document.getElementById('deleteLogsMonthLabel');
  const deleteLogsExpectedText  = document.getElementById('deleteLogsExpectedText');
  const deleteLogsConfirmInput  = document.getElementById('deleteLogsConfirmInput');
  const confirmDeleteLogsBtn    = document.getElementById('confirmDeleteLogsBtn');

  if (logMonthFilter) {
    logMonthFilter.value = currentMonthKey;
  }

  const ACTION_META = {
    AUTH_LOGIN:                 { label: 'Signed In',                 badge: 'approved' },
    AUTH_LOGOUT:                { label: 'Signed Out',                badge: 'pending' },
    BOOKING_APPROVE:            { label: 'Approved Booking',          badge: 'approved' },
    BOOKING_REJECT:             { label: 'Rejected Booking',          badge: 'rejected' },
    BOOKING_SPECIAL_CREATE:     { label: 'Created Special Booking',   badge: 'approved' },
    BOOKING_DELETE:             { label: 'Deleted Booking',           badge: 'rejected' },
    BOOKING_BULK_DELETE:        { label: 'Mass Deleted Bookings',     badge: 'rejected' },
    BOOKING_BACKUP:             { label: 'Downloaded Backup',         badge: 'approved' },
    BOOKING_RESTORE:            { label: 'Restored Backup',           badge: 'approved' },
    FACILITY_CREATE:            { label: 'Added Facility',            badge: 'approved' },
    FACILITY_UPDATE:            { label: 'Updated Facility',          badge: 'pending' },
    FACILITY_DELETE:            { label: 'Deleted Facility',          badge: 'rejected' },
    CLASSROOM_CREATE:           { label: 'Added Classroom',           badge: 'approved' },
    CLASSROOM_UPDATE:           { label: 'Updated Classroom',         badge: 'pending' },
    CLASSROOM_DELETE:           { label: 'Deleted Classroom',         badge: 'rejected' },
    VEHICLE_CREATE:             { label: 'Added Vehicle',             badge: 'approved' },
    VEHICLE_UPDATE:             { label: 'Updated Vehicle',           badge: 'pending' },
    VEHICLE_DELETE:             { label: 'Deleted Vehicle',           badge: 'rejected' },
    DRIVER_CREATE:              { label: 'Added Driver',              badge: 'approved' },
    DRIVER_UPDATE:              { label: 'Updated Driver',            badge: 'pending' },
    DRIVER_DELETE:              { label: 'Deleted Driver',            badge: 'rejected' },
    DEPARTMENT_CREATE:          { label: 'Added Office / School',     badge: 'approved' },
    DEPARTMENT_UPDATE:          { label: 'Updated Office / School',   badge: 'pending' },
    DEPARTMENT_DELETE:          { label: 'Deleted Office / School',   badge: 'rejected' },
    SETTINGS_BOOKING_ID_UPDATE: { label: 'Updated Booking ID Config', badge: 'pending' },
    SETTINGS_BOOKING_ID_RESET:  { label: 'Reset Booking ID Counter',  badge: 'rejected' },
    SETTINGS_SIGNATORIES_UPDATE:{ label: 'Updated PDF Signatories',   badge: 'pending' },
    ACCOUNT_CREATE:             { label: 'Created Account',           badge: 'approved' },
    ACCOUNT_REGISTER_EXISTING:  { label: 'Registered Existing Login', badge: 'approved' },
    ACCOUNT_UPDATE:             { label: 'Updated Account',           badge: 'pending' },
    ACCOUNT_ACTIVATE:           { label: 'Activated Account',         badge: 'approved' },
    ACCOUNT_DEACTIVATE:         { label: 'Deactivated Account',       badge: 'rejected' },
    ACCOUNT_DELETE:             { label: 'Deleted Account Profile',   badge: 'rejected' },
    ACCOUNT_PASSWORD_RESET:     { label: 'Sent Password Reset Email', badge: 'pending' },
    LOGS_EXPORT:                { label: 'Exported Activity Logs',    badge: 'approved' },
    LOGS_DELETE_MONTH:          { label: 'Purged Monthly Logs',       badge: 'rejected' }
  };

  function formatLogTimestamp(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit'
    });
  }

  function formatDetailsSummary(logItem) {
    const d = logItem.details || {};
    const parts = [];
    if (d.requester)      parts.push(`Requester: ${d.requester}`);
    if (d.location)       parts.push(`Facility/Vehicle: ${d.location}`);
    if (d.driverName)     parts.push(`Driver: ${d.driverName}${d.driverPhone ? ' (' + d.driverPhone + ')' : ''}`);
    if (d.department)     parts.push(`Dept: ${d.department}`);
    if (d.startDate)      parts.push(`Schedule: ${d.startDate}${d.endDate && d.endDate !== d.startDate ? ' to ' + d.endDate : ''}`);
    if (d.capacity)       parts.push(`Capacity: ${d.capacity}`);
    if (d.visibility)     parts.push(`Visibility: ${d.visibility}`);
    if (d.headName)       parts.push(`Head/Dean: ${d.headName}`);
    if (d.status)         parts.push(`Status: ${d.status}`);
    if (d.newStatus)      parts.push(`New Status: ${d.newStatus}`);
    if (d.count !== undefined) parts.push(`Count: ${d.count}`);
    if (d.restoredCount !== undefined) parts.push(`Restored: ${d.restoredCount} (Skipped: ${d.skippedCount || 0})`);
    if (d.scope)          parts.push(`Scope: ${d.scope}`);
    if (d.format)         parts.push(`Format: ${d.format}`);
    if (d.sampleRefs && d.sampleRefs.length) parts.push(`Refs: ${d.sampleRefs.join(', ')}`);

    if (parts.length === 0) {
      const keys = Object.keys(d);
      keys.forEach(k => {
        if (d[k] !== undefined && d[k] !== '') {
          parts.push(`${k}: ${ typeof d[k] === 'object' ? JSON.stringify(d[k]) : d[k] }`);
        }
      });
    }
    return parts.join(' • ') || '—';
  }

  function populateAccountFilterOptions() {
    if (!logAccountFilter) return;
    const prev = filterActorUid;
    const actorMap = new Map();

    (window._allUsers || []).forEach(u => {
      if (u && u.uid) {
        actorMap.set(u.uid, `${u.fullName || u.email} (${u.role === 'admin' ? 'Admin' : 'FIC'})`);
      }
    });

    monthLogs.forEach(l => {
      if (l.actorUid && !actorMap.has(l.actorUid)) {
        actorMap.set(l.actorUid, `${l.actorName || l.actorEmail || l.actorUid}`);
      }
    });

    logAccountFilter.innerHTML = '<option value="all">All Accounts</option>';
    actorMap.forEach((label, uid) => {
      const opt = document.createElement('option');
      opt.value = uid;
      opt.textContent = label;
      logAccountFilter.appendChild(opt);
    });

    if (prev && (prev === 'all' || actorMap.has(prev))) {
      logAccountFilter.value = prev;
    } else {
      filterActorUid = 'all';
      logAccountFilter.value = 'all';
    }
  }

  function getFilteredLogs() {
    const q = filterSearch.toLowerCase();
    return monthLogs.filter(item => {
      if (filterActorUid !== 'all' && item.actorUid !== filterActorUid) return false;
      if (filterCategory !== 'all' && item.category !== filterCategory) return false;
      if (q) {
        const meta = ACTION_META[item.action] || { label: item.action };
        const summary = formatDetailsSummary(item);
        const hay = `${item.actorName || ''} ${item.actorEmail || ''} ${item.action || ''} ${meta.label || ''} ${item.category || ''} ${item.targetLabel || ''} ${item.targetId || ''} ${summary}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderStats() {
    const total     = monthLogs.length;
    const approvals = monthLogs.filter(l => l.action === 'BOOKING_APPROVE').length;
    const rejects   = monthLogs.filter(l => l.action === 'BOOKING_REJECT').length;

    const countsByActor = {};
    monthLogs.forEach(l => {
      const key = l.actorName || l.actorEmail || 'Unknown';
      countsByActor[key] = (countsByActor[key] || 0) + 1;
    });
    let topActor = '—';
    let topCount = 0;
    Object.entries(countsByActor).forEach(([actor, c]) => {
      if (c > topCount) {
        topCount = c;
        topActor = `${actor} (${c})`;
      }
    });

    if (logStatTotal)     logStatTotal.textContent     = String(total);
    if (logStatApprovals) logStatApprovals.textContent = String(approvals);
    if (logStatRejections)logStatRejections.textContent= String(rejects);
    if (logStatTopActor)  logStatTopActor.textContent  = topActor;
  }

  function renderTable() {
    if (!activityLogsTableBody) return;
    renderStats();
    const filtered = getFilteredLogs();

    if (filtered.length === 0) {
      activityLogsTableBody.innerHTML = '';
      if (activityLogsEmptyState) activityLogsEmptyState.style.display = 'block';
      return;
    }

    if (activityLogsEmptyState) activityLogsEmptyState.style.display = 'none';

    activityLogsTableBody.innerHTML = filtered.map(item => {
      const meta        = ACTION_META[item.action] || { label: item.action || 'Action', badge: 'pending' };
      const timeStr     = Utils.escapeHtml(formatLogTimestamp(item._createdMs));
      const actorName   = Utils.escapeHtml(item.actorName || 'Staff');
      const actorEmail  = Utils.escapeHtml(item.actorEmail || '');
      const roleBadge   = item.actorRole === 'admin'
        ? '<span class="role-badge role-badge-admin" style="font-size:0.68rem; padding:1px 6px;">Admin</span>'
        : '<span class="role-badge role-badge-fic" style="font-size:0.68rem; padding:1px 6px;">FIC</span>';
      const category    = Utils.escapeHtml(item.category || 'General');
      const actionLabel = Utils.escapeHtml(meta.label);
      const target      = Utils.escapeHtml(item.targetLabel || item.targetId || '—');
      const detailsText = Utils.escapeHtml(formatDetailsSummary(item));

      return `
        <tr>
          <td style="white-space:nowrap;"><small>${timeStr}</small></td>
          <td>
            <strong style="color:var(--navy);">${actorName}</strong> ${roleBadge}
            <br><small style="color:var(--gray-400);">${actorEmail}</small>
          </td>
          <td><span class="user-badge internal">${category}</span></td>
          <td><span class="status-badge ${meta.badge}"><span class="status-dot"></span> ${actionLabel}</span></td>
          <td><strong style="color:var(--navy);">${target}</strong></td>
          <td style="max-width:320px; font-size:0.84rem; color:var(--gray-500);">${detailsText}</td>
        </tr>
      `;
    }).join('');
  }

  async function loadMonthLogs(monthKey) {
    if (!window.Session || !Session.isAdmin()) return;
    currentMonthKey = monthKey || (logMonthFilter ? logMonthFilter.value : ActivityLogModel.getCurrentMonthKey());
    if (logMonthFilter && logMonthFilter.value !== currentMonthKey) {
      logMonthFilter.value = currentMonthKey;
    }

    try {
      monthLogs = await ActivityLogModel.listByMonth(currentMonthKey);
      populateAccountFilterOptions();
      renderTable();
    } catch (err) {
      Logger.error(LAYER, 'Error loading monthly activity logs:', err);
      UiView.showToast('error', 'Error', 'Could not load activity logs for ' + currentMonthKey);
    }
  }

  if (logMonthFilter) {
    logMonthFilter.addEventListener('change', () => {
      if (logMonthFilter.value) loadMonthLogs(logMonthFilter.value);
    });
  }
  if (logAccountFilter) {
    logAccountFilter.addEventListener('change', () => {
      filterActorUid = logAccountFilter.value || 'all';
      renderTable();
    });
  }
  if (logCategoryFilter) {
    logCategoryFilter.addEventListener('change', () => {
      filterCategory = logCategoryFilter.value || 'all';
      renderTable();
    });
  }
  if (logSearchInput) {
    logSearchInput.addEventListener('input', () => {
      filterSearch = (logSearchInput.value || '').trim();
      renderTable();
    });
  }
  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener('click', () => loadMonthLogs(currentMonthKey));
  }

  // ---- Export Activity Logs to Excel ----
  if (exportLogsExcelBtn) {
    exportLogsExcelBtn.addEventListener('click', async () => {
      if (!Session.requireAdmin('export activity logs')) return;
      const filtered = getFilteredLogs();
      if (filtered.length === 0) {
        UiView.showToast('warning', 'No Logs to Export', 'There are no activity logs matching the current filter.');
        return;
      }
      if (typeof XLSX === 'undefined') {
        UiView.showToast('error', 'Error', 'Excel library (SheetJS) is not loaded.');
        return;
      }

      const rows = filtered.map(item => {
        const meta = ACTION_META[item.action] || { label: item.action };
        return {
          'Date & Time': formatLogTimestamp(item._createdMs),
          'Staff Name':  item.actorName || '',
          'Email':       item.actorEmail || '',
          'Role':        item.actorRole === 'admin' ? 'Administrator' : 'Facility-In-Charge',
          'Category':    item.category || '',
          'Action':      meta.label || item.action || '',
          'Target':      item.targetLabel || item.targetId || '',
          'Details':     formatDetailsSummary(item)
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, `Logs_${currentMonthKey}`);
      const filename = `SIC_ActivityLogs_${currentMonthKey}.xlsx`;
      XLSX.writeFile(wb, filename);

      await ActivityLogModel.log('LOGS_EXPORT', 'Data', {
        targetId:    currentMonthKey,
        targetLabel: filename,
        details:     { monthKey: currentMonthKey, count: rows.length }
      });
      UiView.showToast('success', 'Logs Exported', `Downloaded ${filename} (${rows.length} entries).`);
      loadMonthLogs(currentMonthKey);
    });
  }

  // ---- Delete Month's Logs ----
  function getExpectedDeleteLogsPhrase() {
    return `DELETE LOGS ${currentMonthKey}`;
  }

  if (openDeleteLogsModalBtn) {
    openDeleteLogsModalBtn.addEventListener('click', () => {
      if (!Session.requireAdmin('delete activity logs')) return;
      if (monthLogs.length === 0) {
        UiView.showToast('info', 'No Logs', `There are no logs stored in ${currentMonthKey}.`);
        return;
      }
      if (deleteLogsMonthLabel) deleteLogsMonthLabel.textContent = `${currentMonthKey} (${monthLogs.length} log entries)`;
      if (deleteLogsExpectedText) deleteLogsExpectedText.textContent = getExpectedDeleteLogsPhrase();
      if (deleteLogsConfirmInput) deleteLogsConfirmInput.value = '';
      if (deleteLogsMonthModal) deleteLogsMonthModal.classList.add('visible');
    });
  }

  window.closeDeleteLogsMonthModal = function () {
    if (deleteLogsMonthModal) deleteLogsMonthModal.classList.remove('visible');
  };

  if (deleteLogsMonthModal) {
    deleteLogsMonthModal.addEventListener('click', (e) => {
      if (e.target === deleteLogsMonthModal) window.closeDeleteLogsMonthModal();
    });
  }

  if (confirmDeleteLogsBtn) {
    confirmDeleteLogsBtn.addEventListener('click', async () => {
      if (!Session.requireAdmin('delete activity logs')) return;
      const expected = getExpectedDeleteLogsPhrase();
      const typed = (deleteLogsConfirmInput ? deleteLogsConfirmInput.value : '').trim().toUpperCase();
      if (typed !== expected) {
        alert(`Please type "${expected}" to confirm deleting this month's logs.`);
        return;
      }

      confirmDeleteLogsBtn.innerHTML = '<span class="spinner"></span> Deleting...';
      confirmDeleteLogsBtn.classList.add('loading');
      confirmDeleteLogsBtn.disabled = true;

      try {
        const deletedCount = await ActivityLogModel.deleteByMonth(currentMonthKey);
        // Record the purge itself in activity_logs so the audit trail remains tamper-evident
        await ActivityLogModel.log('LOGS_DELETE_MONTH', 'Data', {
          targetId:    currentMonthKey,
          targetLabel: `Month ${currentMonthKey}`,
          details:     { purgedMonth: currentMonthKey, deletedCount }
        });

        window.closeDeleteLogsMonthModal();
        UiView.showToast('warning', 'Monthly Logs Deleted', `Deleted ${deletedCount} log entries from ${currentMonthKey}.`);
        await loadMonthLogs(currentMonthKey);
      } catch (err) {
        Logger.error(LAYER, 'Delete monthly logs failed:', err);
        UiView.showToast('error', 'Error', 'Failed to delete monthly logs.');
      } finally {
        confirmDeleteLogsBtn.innerHTML = 'Delete Month Logs';
        confirmDeleteLogsBtn.classList.remove('loading');
        confirmDeleteLogsBtn.disabled = false;
      }
    });
  }

  function filterByActor(uid) {
    filterActorUid = uid || 'all';
    if (logAccountFilter) logAccountFilter.value = filterActorUid;
    loadMonthLogs(currentMonthKey);
  }

  window.ActivityLogController = {
    loadMonthLogs,
    populateAccountFilterOptions,
    filterByActor
  };
})();

