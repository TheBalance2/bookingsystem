/* ============================================================
   Reports Module — San Isidro College Reservation System
   Filter approved bookings, preview, and export to Excel (.xlsx)
   ============================================================ */

(function () {
  'use strict';

  // ---- DOM References ----
  const facilitySelect   = document.getElementById('reportFacility');
  const monthSelect      = document.getElementById('reportMonth');
  const yearSelect       = document.getElementById('reportYear');
  const generateBtn      = document.getElementById('generateReportBtn');
  const previewCard      = document.getElementById('reportPreviewCard');
  const previewBody      = document.getElementById('reportPreviewBody');
  const previewTitle     = document.getElementById('reportPreviewTitle');
  const recordCount      = document.getElementById('reportRecordCount');
  const emptyState       = document.getElementById('reportEmptyState');
  const previewTable     = document.getElementById('reportPreviewTable');

  // If we're not on the dashboard page, bail
  if (!facilitySelect || !generateBtn) return;

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  let lastFilteredData = [];

  // ============================================================
  // INITIALIZATION
  // ============================================================
  window.initReportsView = function () {
    populateFacilityDropdown();
    populateYearDropdown();
    setDefaultMonthYear();
    renderPreview(); // auto-preview on view open
  };

  // ---- Populate facility dropdown from Firestore data ----
  function populateFacilityDropdown() {
    const facilities = window._allFacilities || [];

    // Keep first option ("All Facilities"), remove the rest
    while (facilitySelect.options.length > 1) {
      facilitySelect.remove(1);
    }

    facilities.forEach(f => {
      if (f.status !== 'Active') return;
      const opt = document.createElement('option');
      opt.value = f.name;
      opt.textContent = f.name;
      facilitySelect.appendChild(opt);
    });
  }

  // ---- Populate year dropdown (last 3 years + next year) ----
  function populateYearDropdown() {
    yearSelect.innerHTML = '';
    const currentYear = new Date().getFullYear();
    for (let y = currentYear + 1; y >= currentYear - 3; y--) {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      yearSelect.appendChild(opt);
    }
  }

  // ---- Default to current month and year ----
  function setDefaultMonthYear() {
    const now = new Date();
    monthSelect.value = String(now.getMonth());
    yearSelect.value  = String(now.getFullYear());
  }

  // ============================================================
  // FILTER LOGIC — Approved only
  // ============================================================
  function getFilteredBookings() {
    const allBookings    = window._allBookings || [];
    const selectedFac    = facilitySelect.value;
    const selectedMonth  = parseInt(monthSelect.value, 10);
    const selectedYear   = parseInt(yearSelect.value, 10);

    return allBookings.filter(b => {
      // Only approved
      if (b.status !== 'Approved') return false;

      // Parse booking date (expected format: "YYYY-MM-DD" or similar)
      const bookingDate = parseBookingDate(b.date);
      if (!bookingDate) return false;

      // Month and year filter
      if (bookingDate.getMonth() !== selectedMonth) return false;
      if (bookingDate.getFullYear() !== selectedYear) return false;

      // Facility filter
      if (selectedFac !== 'all') {
        const bookingFacility = b.facility || '';
        if (bookingFacility !== selectedFac) return false;
      }

      return true;
    });
  }

  // ---- Parse date string robustly ----
  function parseBookingDate(dateStr) {
    if (!dateStr) return null;
    // Handle "YYYY-MM-DD", "MM/DD/YYYY", "Month DD, YYYY" etc.
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  // ============================================================
  // PREVIEW TABLE
  // ============================================================
  function renderPreview() {
    lastFilteredData = getFilteredBookings();

    const selectedMonth = parseInt(monthSelect.value, 10);
    const selectedYear  = yearSelect.value;
    const facilityLabel = facilitySelect.value === 'all'
      ? 'All Facilities'
      : facilitySelect.value;

    previewTitle.textContent = `${MONTHS[selectedMonth]} ${selectedYear} — ${facilityLabel}`;
    recordCount.textContent  = `${lastFilteredData.length} record${lastFilteredData.length !== 1 ? 's' : ''}`;

    previewCard.style.display = 'block';

    if (lastFilteredData.length === 0) {
      previewBody.innerHTML = '';
      if (previewTable) previewTable.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    if (previewTable) previewTable.style.display = '';
    emptyState.style.display = 'none';

    previewBody.innerHTML = lastFilteredData.map(b => {
      const deptOrg = b.userType === 'External'
        ? (b.organization || b.agency || '—')
        : (b.department || '—');

      return `
        <tr>
          <td>${esc(b.referenceId || '—')}</td>
          <td>${esc(b.date || '—')}</td>
          <td>${esc(b.facility || formatVehicleList(b.vehicle) || '—')}</td>
          <td>${esc(b.name || '—')}</td>
          <td><span class="user-badge ${(b.userType || 'Internal').toLowerCase()}">${esc(b.userType || '—')}</span></td>
          <td>${esc(deptOrg)}</td>
          <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(b.purpose || '')}">${esc(b.purpose || '—')}</td>
          <td>${esc(b.numPersons || '—')}</td>
          <td>${esc(b.startTime || '')} – ${esc(b.endTime || '')}</td>
        </tr>
      `;
    }).join('');
  }

  // ---- Helpers ----
  function esc(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatVehicleList(vehicleValue) {
    if (!vehicleValue) return '';
    if (Array.isArray(vehicleValue)) return vehicleValue.filter(Boolean).join(', ');
    return String(vehicleValue);
  }

  // ============================================================
  // EXCEL EXPORT (SheetJS)
  // ============================================================
  function exportToExcel() {
    // Check that SheetJS loaded
    if (typeof XLSX === 'undefined') {
      alert('Excel library (SheetJS) failed to load. Please check your internet connection and refresh the page.');
      return;
    }

    // Re-filter to get freshest data
    const data = getFilteredBookings();

    if (data.length === 0) {
      alert('No approved bookings found for the selected filters. Nothing to export.');
      return;
    }

    const selectedMonth = parseInt(monthSelect.value, 10);
    const selectedYear  = yearSelect.value;
    const facilityLabel = facilitySelect.value === 'all'
      ? 'All Facilities'
      : facilitySelect.value;

    // Get admin email
    const adminEmail = document.getElementById('adminEmail')?.textContent || 'Admin';

    // ---- Build worksheet data ----
    const wsData = [];

    // Header rows
    wsData.push(['San Isidro College — Facility Reservation Report']);
    wsData.push([`Report Period: ${MONTHS[selectedMonth]} ${selectedYear}`]);
    wsData.push([`Facility: ${facilityLabel}`]);
    wsData.push([`Facility In-Charge: ${adminEmail}`]);
    wsData.push([`Generated: ${new Date().toLocaleString()}`]);
    wsData.push([`Total Approved Bookings: ${data.length}`]);
    wsData.push([]); // blank row

    // Column headers
    const headers = [
      'Reference ID',
      'Date',
      'Facility / Vehicle',
      'Requester Name',
      'Type',
      'Department / Organization',
      'Email',
      'Purpose',
      'No. of Persons',
      'Start Time',
      'End Time',
      'Status',
      'Submitted On'
    ];
    wsData.push(headers);

    // Data rows
    data.forEach(b => {
      const deptOrg = b.userType === 'External'
        ? (b.organization || b.agency || '')
        : (b.department || '');

      const facility = b.facility || formatVehicleList(b.vehicle) || '';

      let submittedOn = '';
      if (b.createdAt) {
        // Firestore timestamp object
        if (b.createdAt.toDate) {
          submittedOn = b.createdAt.toDate().toLocaleString();
        } else {
          submittedOn = new Date(b.createdAt).toLocaleString();
        }
      }

      wsData.push([
        b.referenceId || '',
        b.date || '',
        facility,
        b.name || '',
        b.userType || '',
        deptOrg,
        b.email || '',
        b.purpose || '',
        b.numPersons || '',
        b.startTime || '',
        b.endTime || '',
        b.status || '',
        submittedOn
      ]);
    });

    // ---- Create workbook ----
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths for readability
    ws['!cols'] = [
      { wch: 16 },  // Reference ID
      { wch: 14 },  // Date
      { wch: 22 },  // Facility / Vehicle
      { wch: 22 },  // Requester Name
      { wch: 10 },  // Type
      { wch: 22 },  // Dept / Org
      { wch: 26 },  // Email
      { wch: 30 },  // Purpose
      { wch: 12 },  // No. of Persons
      { wch: 12 },  // Start Time
      { wch: 12 },  // End Time
      { wch: 12 },  // Status
      { wch: 20 }   // Submitted On
    ];

    // Merge header cells across columns
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, // Title
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }, // Period
      { s: { r: 2, c: 0 }, e: { r: 2, c: 5 } }, // Facility
      { s: { r: 3, c: 0 }, e: { r: 3, c: 5 } }, // In-Charge
      { s: { r: 4, c: 0 }, e: { r: 4, c: 5 } }, // Generated
      { s: { r: 5, c: 0 }, e: { r: 5, c: 5 } }  // Total
    ];

    const sheetName = `${MONTHS[selectedMonth].substring(0, 3)} ${selectedYear}`;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // ---- Download using manual Blob + anchor approach ----
    const fileName = `SIC_Bookings_Report_${facilityLabel.replace(/\s+/g, '_')}_${MONTHS[selectedMonth]}_${selectedYear}.xlsx`;
    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ============================================================
  // EVENT LISTENERS
  // ============================================================

  // Auto-preview when filters change
  [facilitySelect, monthSelect, yearSelect].forEach(el => {
    el.addEventListener('change', renderPreview);
  });

  // Generate button
  generateBtn.addEventListener('click', () => {
    renderPreview();
    exportToExcel();
  });

})();
