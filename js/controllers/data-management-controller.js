/* ============================================================
   Data Management Controller — San Isidro College Reservation System
   Controller Layer (js/controllers/data-management-controller.js)
   Handles True Admin Backup (Month / Year -> Excel + JSON),
   Restore from JSON Backup, and Mass Monthly Booking Deletion.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'DataManagementController';

  const MONTH_NAMES = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
  ];

  // ---- Backup DOM ----
  const backupScopeType        = document.getElementById('backupScopeType');
  const backupMonthGroup       = document.getElementById('backupMonthGroup');
  const backupMonthInput       = document.getElementById('backupMonthInput');
  const backupYearGroup        = document.getElementById('backupYearGroup');
  const backupYearSelect       = document.getElementById('backupYearSelect');
  const backupPreviewText      = document.getElementById('backupPreviewText');
  const downloadBackupExcelBtn = document.getElementById('downloadBackupExcelBtn');
  const downloadBackupJsonBtn  = document.getElementById('downloadBackupJsonBtn');

  // ---- Restore DOM ----
  const restoreJsonFileInput   = document.getElementById('restoreJsonFileInput');
  const restoreJsonDropzone    = document.getElementById('restoreJsonDropzone');
  const restoreJsonFileNameLbl = document.getElementById('restoreJsonFileNameLabel');
  const restorePreviewBox      = document.getElementById('restorePreviewBox');
  const confirmRestoreJsonBtn  = document.getElementById('confirmRestoreJsonBtn');
  let parsedRestoreItems       = [];

  // ---- Mass Delete DOM ----
  const massDeleteMonthInput      = document.getElementById('massDeleteMonthInput');
  const massDeleteStatusFilter    = document.getElementById('massDeleteStatusFilter');
  const massDeleteCountBadge      = document.getElementById('massDeleteCountBadge');
  const massDeletePreviewBody     = document.getElementById('massDeletePreviewBody');
  const massDeleteBackupFirstBtn  = document.getElementById('massDeleteBackupFirstBtn');
  const massDeleteExpectedPhrase  = document.getElementById('massDeleteExpectedPhrase');
  const massDeleteConfirmInput    = document.getElementById('massDeleteConfirmInput');
  const executeMassDeleteBtn      = document.getElementById('executeMassDeleteBtn');
  const massDeleteProgressWrap    = document.getElementById('massDeleteProgressWrap');
  const massDeleteProgressBar     = document.getElementById('massDeleteProgressBar');
  const massDeleteProgressText    = document.getElementById('massDeleteProgressText');

  const defaultMonth = ActivityLogModel ? ActivityLogModel.getCurrentMonthKey() : new Date().toISOString().slice(0, 7);
  if (backupMonthInput && !backupMonthInput.value) backupMonthInput.value = defaultMonth;
  if (massDeleteMonthInput && !massDeleteMonthInput.value) massDeleteMonthInput.value = defaultMonth;

  function getBookingReservationDate(b) {
    return String(b.startDate || b.date || '').trim();
  }

  function toIsoStringSafe(ts) {
    if (!ts) return '';
    if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
    if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000).toISOString();
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }

  function populateYearOptions() {
    if (!backupYearSelect) return;
    const prev = backupYearSelect.value;
    const currentYear = String(new Date().getFullYear());
    const years = new Set([currentYear]);

    (window._allBookings || []).forEach(b => {
      const d = getBookingReservationDate(b);
      if (/^\d{4}/.test(d)) years.add(d.slice(0, 4));
    });

    const sortedYears = Array.from(years).sort((a, b) => b.localeCompare(a));
    backupYearSelect.innerHTML = sortedYears.map(y => `<option value="${y}">${y}</option>`).join('');
    if (prev && sortedYears.includes(prev)) {
      backupYearSelect.value = prev;
    }
  }

  function getBackupTargetBookings() {
    const all = window._allBookings || [];
    const scope = backupScopeType ? backupScopeType.value : 'month';
    if (scope === 'year') {
      const yr = backupYearSelect ? backupYearSelect.value : String(new Date().getFullYear());
      return {
        label: yr,
        scopeDescription: `Year ${yr}`,
        items: all.filter(b => getBookingReservationDate(b).startsWith(yr + '-'))
      };
    }
    const ym = backupMonthInput ? backupMonthInput.value : defaultMonth;
    return {
      label: ym,
      scopeDescription: `Month ${ym}`,
      items: all.filter(b => getBookingReservationDate(b).startsWith(ym + '-'))
    };
  }

  function updateBackupPreview() {
    if (!backupPreviewText) return;
    const { scopeDescription, items } = getBackupTargetBookings();
    const approved = items.filter(b => b.status === 'Approved').length;
    const pending  = items.filter(b => b.status === 'Pending' || b.status === 'Pending Payment' || b.status === 'Payment Under Review').length;
    const rejected = items.filter(b => b.status === 'Rejected').length;
    backupPreviewText.innerHTML = `
      <div class="dm-preview-headline">
        <strong>${items.length}</strong> reservation(s) scheduled in <strong>${Utils.escapeHtml(scopeDescription)}</strong>
      </div>
      <div class="dm-kpi-chips">
        <span class="dm-kpi-chip dm-kpi-approved">Approved: <strong>${approved}</strong></span>
        <span class="dm-kpi-chip dm-kpi-pending">Pending / Review: <strong>${pending}</strong></span>
        <span class="dm-kpi-chip dm-kpi-rejected">Rejected: <strong>${rejected}</strong></span>
      </div>
    `;
  }

  function formatEquipmentText(eq, otherEq) {
    if (window.ExcelReportBuilder && typeof window.ExcelReportBuilder.formatEquipmentCell === 'function') {
      return window.ExcelReportBuilder.formatEquipmentCell(eq, otherEq);
    }
    if (!Array.isArray(eq) || eq.length === 0) return otherEq ? `Other: ${otherEq}` : 'None';
    const base = eq.map(e => (typeof e === 'string' ? e : `${e.item} (x${e.qty})`)).join(', ');
    return otherEq ? `${base}, Other: ${otherEq}` : base;
  }

  function exportBookingsToExcel(items, periodLabel, scopeDescription = '') {
    const filename = `SIC_Bookings_Backup_${periodLabel}.xlsx`;
    if (window.ExcelReportBuilder && typeof window.ExcelReportBuilder.buildAndDownloadExcelWorkbook === 'function') {
      return window.ExcelReportBuilder.buildAndDownloadExcelWorkbook(items, {
        reportTitle:   `RESERVATION BACKUP ARCHIVE — ${(scopeDescription || periodLabel).toUpperCase()}`,
        periodLabel:   scopeDescription || periodLabel,
        filterSummary: 'Full Backup Export (All Statuses, Facilities & Vehicles)',
        sheetName:     `Backup_${periodLabel}`,
        filename:      filename
      });
    }

    if (typeof XLSX === 'undefined') {
      UiView.showToast('error', 'Error', 'Excel library (SheetJS) is not loaded.');
      return null;
    }

    const rows = items.map((b, idx) => {
      const isVeh = Utils.isVehicleBooking(b);
      const vList = Utils.formatVehicleList(b.vehicle);
      const primaryFacility = isVeh
        ? (vList ? `Vehicle — ${vList}` : 'Vehicle / Transportation')
        : (b.facility && b.classroom ? `${b.facility} (${b.classroom})` : (b.facility || '—'));

      return {
        'No.':                         idx + 1,
        'Reference ID':                b.referenceId || '',
        'Status':                      b.status || '',
        'User Type':                   b.userType || '',
        'Facility / Vehicle Reserved': primaryFacility,
        'Facility Requested':          isVeh ? (vList ? `Vehicle (${vList})` : 'Vehicle') : (b.facility || '—'),
        'Classroom':                   b.classroom || 'N/A',
        'Vehicle(s) Requested':        vList || 'N/A',
        'Destination':                 isVeh ? (b.destination || 'Specified in Purpose') : 'On-Campus',
        'Assigned Driver':             b.assignedDriverName || (isVeh ? 'Unassigned' : 'N/A'),
        'Driver Phone':                b.assignedDriverPhone || 'N/A',
        'Start Date':                  b.startDate || b.date || '',
        'End Date':                    b.endDate || b.startDate || b.date || '',
        'Start Time':                  b.startTime ? Utils.formatTime12(b.startTime) : '',
        'End Time':                    b.endTime ? Utils.formatTime12(b.endTime) : '',
        'Participants':                b.numPersons || '',
        'Requester Name':              Utils.getBookingRequesterName(b),
        'Department / Agency':         b.userType === 'External' ? (b.agencyName || b.agency || b.organization || '') : (b.parentDepartment || b.department || ''),
        'Office / School':             b.userType === 'External' ? (b.officeName || '') : (b.collegeSchool || b.department || ''),
        'Dean / Office Head':          b.officeHead || 'N/A',
        'Position / Designation':      b.position || '',
        'Contact Number':              b.contactNumber || '',
        'Email Address':               b.email || '',
        'Address':                     b.address || '',
        'Equipment Needed':            formatEquipmentText(b.equipment, b.otherEquipment),
        'Purpose of Activity':         b.purpose || '',
        'Other Considerations':        b.considerations || '',
        'Date Submitted':              b.dateSubmitted || toIsoStringSafe(b.createdAt)
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, `Backup_${periodLabel}`);
    XLSX.writeFile(wb, filename);
    return filename;
  }

  function exportBookingsToJson(items, periodLabel, scopeDescription) {
    const serialized = items.map(b => {
      const copy = { ...b };
      const docId = copy.id;
      delete copy.id;
      // Exclude any embedded base64 receipt data to keep JSON lightweight
      delete copy.gcashReceipt;
      delete copy.receiptUrl;
      copy._docId = docId;
      copy._createdAtIso = toIsoStringSafe(b.createdAt);
      if (b.receiptUploadedAt) {
        copy._receiptUploadedAtIso = toIsoStringSafe(b.receiptUploadedAt);
      }
      return copy;
    });

    const payload = {
      format:      'SIC_BOOKING_BACKUP_V1',
      scope:       scopeDescription,
      period:      periodLabel,
      exportedAt:  new Date().toISOString(),
      exportedBy:  (window.Session && Session.profile && Session.profile.email) || '',
      count:       serialized.length,
      bookings:    serialized
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const filename = `SIC_Bookings_Backup_${periodLabel}.json`;
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
  }

  if (backupScopeType) {
    backupScopeType.addEventListener('change', () => {
      const isYear = backupScopeType.value === 'year';
      if (backupMonthGroup) backupMonthGroup.style.display = isYear ? 'none' : '';
      if (backupYearGroup)  backupYearGroup.style.display  = isYear ? '' : 'none';
      updateBackupPreview();
    });
  }
  if (backupMonthInput) backupMonthInput.addEventListener('change', updateBackupPreview);
  if (backupYearSelect) backupYearSelect.addEventListener('change', updateBackupPreview);

  if (downloadBackupExcelBtn) {
    downloadBackupExcelBtn.addEventListener('click', async () => {
      if (!Session.requireAdmin('backup bookings')) return;
      const { label, scopeDescription, items } = getBackupTargetBookings();
      if (items.length === 0) {
        UiView.showToast('warning', 'No Bookings Found', `No bookings scheduled in ${scopeDescription}.`);
        return;
      }
      const filename = exportBookingsToExcel(items, label, scopeDescription);
      if (filename && window.ActivityLogModel) {
        await ActivityLogModel.log('BOOKING_BACKUP', 'Data', {
          targetId:    label,
          targetLabel: filename,
          details:     { scope: scopeDescription, format: 'Excel (.xlsx)', count: items.length }
        });
        UiView.showToast('success', 'Excel Backup Downloaded', `Saved ${filename} (${items.length} bookings).`);
      }
    });
  }

  if (downloadBackupJsonBtn) {
    downloadBackupJsonBtn.addEventListener('click', async () => {
      if (!Session.requireAdmin('backup bookings')) return;
      const { label, scopeDescription, items } = getBackupTargetBookings();
      if (items.length === 0) {
        UiView.showToast('warning', 'No Bookings Found', `No bookings scheduled in ${scopeDescription}.`);
        return;
      }
      const filename = exportBookingsToJson(items, label, scopeDescription);
      if (filename && window.ActivityLogModel) {
        await ActivityLogModel.log('BOOKING_BACKUP', 'Data', {
          targetId:    label,
          targetLabel: filename,
          details:     { scope: scopeDescription, format: 'JSON (.json)', count: items.length }
        });
        UiView.showToast('success', 'JSON Backup Downloaded', `Saved ${filename} (${items.length} bookings).`);
      }
    });
  }

  // ---- Restore from JSON Backup ----
  const MAX_BACKUP_JSON_BYTES = 10 * 1024 * 1024; // 10 MB limit

  if (restoreJsonFileInput) {
    restoreJsonFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      parsedRestoreItems = [];
      if (confirmRestoreJsonBtn) confirmRestoreJsonBtn.disabled = true;

      if (!file) {
        if (restoreJsonFileNameLbl) restoreJsonFileNameLbl.textContent = 'No backup file selected';
        if (restoreJsonDropzone) restoreJsonDropzone.classList.remove('has-file');
        if (restorePreviewBox) restorePreviewBox.style.display = 'none';
        return;
      }

      if (restoreJsonFileNameLbl) restoreJsonFileNameLbl.textContent = file.name;
      if (restoreJsonDropzone) restoreJsonDropzone.classList.add('has-file');

      if (file.size > MAX_BACKUP_JSON_BYTES) {
        if (restorePreviewBox) {
          restorePreviewBox.style.display = 'block';
          restorePreviewBox.innerHTML = `<span style="color:var(--danger); font-weight:600;">Backup file is too large (max 10 MB).</span>`;
        }
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || '{}'));
          const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.bookings) ? parsed.bookings : null);
          if (!items) {
            throw new Error('Invalid backup file format.');
          }

          parsedRestoreItems = items;
          const existing = window._allBookings || [];
          const existingIds  = new Set(existing.map(b => b.id));
          const existingRefs = new Set(existing.map(b => b.referenceId));

          let duplicateCount = 0;
          items.forEach(item => {
            const id  = item._docId || item.id;
            const ref = item.referenceId;
            if ((id && existingIds.has(id)) || (ref && existingRefs.has(ref))) {
              duplicateCount++;
            }
          });

          const newCount = items.length - duplicateCount;
          if (restorePreviewBox) {
            restorePreviewBox.style.display = 'block';
            restorePreviewBox.innerHTML = `
              <div class="dm-preview-headline"><strong>Archive Verified:</strong> ${Utils.escapeHtml(file.name)}</div>
              <div class="dm-kpi-chips">
                <span class="dm-kpi-chip">Total in File: <strong>${items.length}</strong></span>
                <span class="dm-kpi-chip dm-kpi-approved">Ready to Restore: <strong>${newCount}</strong></span>
                <span class="dm-kpi-chip dm-kpi-pending">Skipped (Existing): <strong>${duplicateCount}</strong></span>
              </div>
            `;
          }
          if (confirmRestoreJsonBtn) confirmRestoreJsonBtn.disabled = (newCount === 0);
        } catch (err) {
          Logger.warn(LAYER, 'Invalid backup JSON file:', err);
          if (restorePreviewBox) {
            restorePreviewBox.style.display = 'block';
            restorePreviewBox.innerHTML = `<span style="color:var(--danger); font-weight:600;">Invalid backup JSON file. Please select a valid SIC_Bookings_Backup_*.json file.</span>`;
          }
        }
      };
      reader.readAsText(file);
    });
  }

  if (confirmRestoreJsonBtn) {
    confirmRestoreJsonBtn.addEventListener('click', async () => {
      if (!Session.requireAdmin('restore bookings')) return;
      if (!parsedRestoreItems || parsedRestoreItems.length === 0) return;

      if (window.UiView && typeof UiView.requirePassword === 'function') {
        const verified = await UiView.requirePassword(`restore bookings from backup file (${parsedRestoreItems.length} record(s))`);
        if (!verified) return;
      } else if (!confirm(`Restore bookings from this backup file? Existing bookings will not be overwritten.`)) {
        return;
      }

      confirmRestoreJsonBtn.innerHTML = '<span class="spinner"></span> Restoring...';
      confirmRestoreJsonBtn.classList.add('loading');
      confirmRestoreJsonBtn.disabled = true;

      try {
        const { restoredCount, skippedCount } = await BookingModel.restoreMany(
          parsedRestoreItems,
          window._allBookings || []
        );

        if (window.ActivityLogModel) {
          await ActivityLogModel.log('BOOKING_RESTORE', 'Data', {
            targetId:    'restore',
            targetLabel: `Restored ${restoredCount} booking(s)`,
            details:     { restoredCount, skippedCount, totalInFile: parsedRestoreItems.length }
          });
        }

        UiView.showToast('success', 'Backup Restored', `Restored ${restoredCount} booking(s) (${skippedCount} existing skipped).`);
        if (restoreJsonFileInput) restoreJsonFileInput.value = '';
        if (restoreJsonFileNameLbl) restoreJsonFileNameLbl.textContent = 'No backup file selected';
        if (restoreJsonDropzone) restoreJsonDropzone.classList.remove('has-file');
        if (restorePreviewBox) restorePreviewBox.style.display = 'none';
        parsedRestoreItems = [];
      } catch (err) {
        Logger.error(LAYER, 'Restore backup error:', err);
        UiView.showToast('error', 'Restore Failed', err?.message || 'Failed to restore bookings from backup.');
      } finally {
        confirmRestoreJsonBtn.innerHTML = 'Restore Bookings';
        confirmRestoreJsonBtn.classList.remove('loading');
        confirmRestoreJsonBtn.disabled = parsedRestoreItems.length === 0;
      }
    });
  }

  // ---- Mass Delete Bookings by Month ----
  function getMassDeleteMatchingBookings() {
    const ym     = massDeleteMonthInput ? massDeleteMonthInput.value : defaultMonth;
    const status = massDeleteStatusFilter ? massDeleteStatusFilter.value : 'all';
    const all    = window._allBookings || [];

    return all.filter(b => {
      const rDate = getBookingReservationDate(b);
      if (!rDate.startsWith(ym + '-')) return false;
      if (status !== 'all' && b.status !== status) return false;
      return true;
    });
  }

  function getMassDeleteExpectedPhraseStr() {
    const ym = massDeleteMonthInput ? massDeleteMonthInput.value : defaultMonth;
    const [yr, mo] = ym.split('-');
    const mIdx = parseInt(mo, 10) - 1;
    const mName = MONTH_NAMES[mIdx] || ym;
    return `DELETE ${mName} ${yr}`;
  }

  function renderMassDeletePreview() {
    const matching = getMassDeleteMatchingBookings();
    const phrase   = getMassDeleteExpectedPhraseStr();

    if (massDeleteExpectedPhrase) massDeleteExpectedPhrase.textContent = phrase;
    if (massDeleteCountBadge) {
      massDeleteCountBadge.textContent = `${matching.length} matching booking(s)`;
    }

    if (!massDeletePreviewBody) return;
    if (matching.length === 0) {
      massDeletePreviewBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--gray-400); padding:16px;">No bookings match the selected month and status filter.</td></tr>`;
      return;
    }

    const previewSlice = matching.slice(0, 15);
    let html = previewSlice.map(b => {
      const ref  = Utils.escapeHtml(b.referenceId || b.id);
      const name = Utils.escapeHtml(Utils.getBookingRequesterName(b));
      const loc  = Utils.escapeHtml(Utils.getBookingLocation(b));
      const date = Utils.escapeHtml(getBookingReservationDate(b));
      const st   = Utils.escapeHtml(b.status || '—');
      return `
        <tr>
          <td><strong style="color:var(--navy);">${ref}</strong></td>
          <td>${name}</td>
          <td>${loc}</td>
          <td>${date}</td>
          <td>${st}</td>
        </tr>
      `;
    }).join('');

    if (matching.length > previewSlice.length) {
      html += `<tr><td colspan="5" style="text-align:center; color:var(--gray-400); font-style:italic;">…and ${matching.length - previewSlice.length} more booking(s) in this month.</td></tr>`;
    }
    massDeletePreviewBody.innerHTML = html;
  }

  if (massDeleteMonthInput)   massDeleteMonthInput.addEventListener('change', renderMassDeletePreview);
  if (massDeleteStatusFilter) massDeleteStatusFilter.addEventListener('change', renderMassDeletePreview);

  if (massDeleteBackupFirstBtn) {
    massDeleteBackupFirstBtn.addEventListener('click', async () => {
      if (!Session.requireAdmin('backup bookings')) return;
      const ym = massDeleteMonthInput ? massDeleteMonthInput.value : defaultMonth;
      const matching = getMassDeleteMatchingBookings();
      if (matching.length === 0) {
        UiView.showToast('warning', 'Nothing to Backup', 'No bookings match the selected month.');
        return;
      }
      exportBookingsToExcel(matching, ym, `Month ${ym}`);
      exportBookingsToJson(matching, ym, `Month ${ym}`);
      if (window.ActivityLogModel) {
        await ActivityLogModel.log('BOOKING_BACKUP', 'Data', {
          targetId:    ym,
          targetLabel: `Pre-delete Backup (${ym})`,
          details:     { scope: `Month ${ym}`, format: 'Excel + JSON', count: matching.length }
        });
      }
      UiView.showToast('success', 'Backup Downloaded', `Downloaded Excel and JSON backups for ${ym} (${matching.length} bookings).`);
    });
  }

  if (executeMassDeleteBtn) {
    executeMassDeleteBtn.addEventListener('click', async () => {
      if (!Session.requireAdmin('mass delete bookings')) return;

      const matching = getMassDeleteMatchingBookings();
      if (matching.length === 0) {
        UiView.showToast('warning', 'No Matching Bookings', 'There are no bookings to delete for the selected month/filter.');
        return;
      }

      const expected = getMassDeleteExpectedPhraseStr();
      const typed    = (massDeleteConfirmInput ? massDeleteConfirmInput.value : '').trim().toUpperCase();
      if (typed !== expected) {
        alert(`Please type "${expected}" in the confirmation box to proceed.`);
        if (massDeleteConfirmInput) massDeleteConfirmInput.focus();
        return;
      }

      const ym     = massDeleteMonthInput ? massDeleteMonthInput.value : defaultMonth;
      const status = massDeleteStatusFilter ? massDeleteStatusFilter.value : 'all';

      if (window.UiView && typeof UiView.requirePassword === 'function') {
        const verified = await UiView.requirePassword(`mass delete ${matching.length} booking(s) scheduled in ${ym}`);
        if (!verified) return;
      }

      executeMassDeleteBtn.innerHTML = '<span class="spinner"></span> Deleting...';
      executeMassDeleteBtn.classList.add('loading');
      executeMassDeleteBtn.disabled = true;
      if (massDeleteProgressWrap) massDeleteProgressWrap.style.display = 'block';

      try {
        const sampleRefs = matching.slice(0, 10).map(b => b.referenceId || b.id);
        const deletedCount = await BookingModel.bulkRemove(matching, (done, total) => {
          const pct = total > 0 ? Math.round((done / total) * 100) : 100;
          if (massDeleteProgressBar)  massDeleteProgressBar.style.width = `${pct}%`;
          if (massDeleteProgressText) massDeleteProgressText.textContent = `Deleted ${done} of ${total} booking(s)...`;
        });

        if (window.ActivityLogModel) {
          await ActivityLogModel.log('BOOKING_BULK_DELETE', 'Data', {
            targetId:    ym,
            targetLabel: `Month ${ym} (${deletedCount} deleted)`,
            details:     { month: ym, statusFilter: status, count: deletedCount, sampleRefs }
          });
        }

        if (massDeleteConfirmInput) massDeleteConfirmInput.value = '';
        UiView.showToast('warning', 'Mass Delete Complete', `Permanently deleted ${deletedCount} booking(s) from ${ym}.`);
        renderMassDeletePreview();
      } catch (err) {
        Logger.error(LAYER, 'Mass delete failed:', err);
        UiView.showToast('error', 'Mass Delete Failed', err?.message || 'Could not complete mass deletion.');
      } finally {
        executeMassDeleteBtn.innerHTML = 'Permanently Delete Matching Bookings';
        executeMassDeleteBtn.classList.remove('loading');
        executeMassDeleteBtn.disabled = false;
        setTimeout(() => {
          if (massDeleteProgressWrap) massDeleteProgressWrap.style.display = 'none';
        }, 1500);
      }
    });
  }

  // ---- System Security Controls: Testing Mode Switch & Public Schedule Sync ----
  const testingModeStatusBadge        = document.getElementById('testingModeStatusBadge');
  const testingModeDescText           = document.getElementById('testingModeDescText');
  const toggleTestingModeBtn          = document.getElementById('toggleTestingModeBtn');
  const syncPublicScheduleBtn         = document.getElementById('syncPublicScheduleBtn');
  const syncPublicScheduleCountText   = document.getElementById('syncPublicScheduleCountText');
  const syncPublicScheduleProgressWrap= document.getElementById('syncPublicScheduleProgressWrap');
  const syncPublicScheduleProgressBar = document.getElementById('syncPublicScheduleProgressBar');
  const syncPublicScheduleProgressText= document.getElementById('syncPublicScheduleProgressText');

  let currentTestingMode = Boolean(window.SIC_TESTING_MODE);

  function renderTestingModeUi(isTesting) {
    currentTestingMode = Boolean(isTesting);
    if (testingModeStatusBadge) {
      testingModeStatusBadge.className = 'status-badge ' + (currentTestingMode ? 'pending' : 'approved');
      testingModeStatusBadge.innerHTML = `<span class="status-dot"></span> ${currentTestingMode ? 'Testing Mode: ON (24/7 & Backdating Enabled)' : 'Production Mode: ON (8AM–5PM & 3-Day Notice Enforced)'}`;
    }
    if (testingModeDescText) {
      testingModeDescText.innerHTML = currentTestingMode
        ? 'Currently <strong>ON</strong>: Public users can submit bookings 24/7 and pick any date for capstone testing/seeding. Turn this <strong>OFF</strong> before live deployment.'
        : 'Currently <strong>OFF (Production Strict Mode)</strong>: Public bookings are restricted to working hours (8:00 AM – 5:00 PM PHT) and require 3-day advance notice.';
    }
    if (toggleTestingModeBtn) {
      toggleTestingModeBtn.textContent = currentTestingMode
        ? 'Switch to Production Strict Mode (Turn OFF Testing Mode)'
        : 'Enable Testing / Backdate Mode';
      toggleTestingModeBtn.className = currentTestingMode ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
    }
  }

  if (window.SettingsModel && typeof SettingsModel.listenSystemConfig === 'function') {
    SettingsModel.listenSystemConfig(cfg => {
      renderTestingModeUi(cfg && cfg.testingMode);
    });
  } else {
    renderTestingModeUi(currentTestingMode);
  }

  if (toggleTestingModeBtn) {
    toggleTestingModeBtn.addEventListener('click', async () => {
      if (!Session.requireAdmin('change system testing mode')) return;
      const nextState = !currentTestingMode;
      toggleTestingModeBtn.disabled = true;
      try {
        await SettingsModel.setTestingMode(nextState);
        renderTestingModeUi(nextState);
        if (window.ActivityLogModel) {
          await ActivityLogModel.log('SETTINGS_TESTING_MODE_TOGGLE', 'Settings', {
            targetId:    'system',
            targetLabel: nextState ? 'Testing Mode ON' : 'Production Mode ON (Testing OFF)',
            details:     { testingMode: nextState }
          });
        }
        UiView.showToast(
          nextState ? 'warning' : 'success',
          nextState ? 'Testing Mode Enabled' : 'Production Mode Enabled',
          nextState
            ? '24/7 submissions and past-date backdating are now enabled for testing.'
            : '8:00 AM – 5:00 PM working hours and 3-day advance notice are now strictly enforced.'
        );
      } catch (err) {
        Logger.error(LAYER, 'Toggle testing mode failed:', err);
        UiView.showToast('error', 'Update Failed', 'Could not update settings/system. Make sure updated firestore.rules is published.');
      } finally {
        toggleTestingModeBtn.disabled = false;
      }
    });
  }

  if (syncPublicScheduleBtn) {
    syncPublicScheduleBtn.addEventListener('click', async () => {
      if (!Session.requireAdmin('sync public schedule')) return;
      const all = window._allBookings || [];
      if (all.length === 0) {
        UiView.showToast('info', 'No Bookings to Sync', 'There are currently no bookings in the database.');
        return;
      }

      syncPublicScheduleBtn.innerHTML = '<span class="spinner"></span> Syncing...';
      syncPublicScheduleBtn.classList.add('loading');
      syncPublicScheduleBtn.disabled = true;
      if (syncPublicScheduleProgressWrap) syncPublicScheduleProgressWrap.style.display = 'block';

      try {
        const synced = await BookingModel.syncPublicSchedule(all, (done, total) => {
          const pct = total > 0 ? Math.round((done / total) * 100) : 100;
          if (syncPublicScheduleProgressBar)  syncPublicScheduleProgressBar.style.width = `${pct}%`;
          if (syncPublicScheduleProgressText) syncPublicScheduleProgressText.textContent = `Synced ${done} of ${total} booking(s)...`;
        });

        if (window.ActivityLogModel) {
          await ActivityLogModel.log('DATA_SYNC_PUBLIC_SCHEDULE', 'Data', {
            targetId:    'public_schedule',
            targetLabel: `Synced ${synced} booking(s)`,
            details:     { count: synced }
          });
        }
        UiView.showToast('success', 'Public Schedule Synced', `Synchronized ${synced} booking(s) to public_schedule and booking_lookup.`);
      } catch (err) {
        Logger.error(LAYER, 'Sync public schedule failed:', err);
        UiView.showToast('error', 'Sync Failed', 'Make sure the updated firestore.rules has been published in Firebase Console first.');
      } finally {
        syncPublicScheduleBtn.innerHTML = 'Sync Public Schedule & Lookup Index';
        syncPublicScheduleBtn.classList.remove('loading');
        syncPublicScheduleBtn.disabled = false;
        setTimeout(() => {
          if (syncPublicScheduleProgressWrap) syncPublicScheduleProgressWrap.style.display = 'none';
        }, 1500);
      }
    });
  }

  function refreshView() {
    populateYearOptions();
    updateBackupPreview();
    renderMassDeletePreview();
    if (syncPublicScheduleCountText) {
      const count = (window._allBookings || []).length;
      syncPublicScheduleCountText.textContent = `${count} total booking(s) in database ready to sync.`;
    }
  }

  window.DataManagementController = {
    refreshView
  };
})();

