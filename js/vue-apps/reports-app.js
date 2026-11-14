/* ============================================================
   Digital Reservation System — San Isidro College
   Vue.js 3 App: Reports & Multi-Sheet Excel Export (dashboard.html)
   ============================================================ */

(function () {
  'use strict';

  const { createApp } = Vue;
  const log = window.Logger ? window.Logger.create('ReportsApp') : console;

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const REPORT_PAGE_SIZE = 10;

  function formatEquipmentCell(eq, otherEq) {
    const parts = [];
    if (Array.isArray(eq) && eq.length > 0) {
      eq.forEach(item => {
        if (!item) return;
        if (typeof item === 'string') {
          parts.push(item.trim());
        } else if (typeof item === 'object' && item.item) {
          const qty = Number(item.qty);
          parts.push(Number.isFinite(qty) && qty > 0 ? `${item.item} (x${qty})` : String(item.item));
        }
      });
    } else if (typeof eq === 'string' && eq.trim()) {
      parts.push(eq.trim());
    }
    if (otherEq && String(otherEq).trim()) {
      parts.push(`Other: ${String(otherEq).trim()}`);
    }
    return parts.length > 0 ? parts.join(', ') : 'None';
  }

  function getBookingCategoryLabel(b) {
    if (Utils.isVehicleBooking(b)) return 'Transportation (Vehicle)';
    if (Utils.isClassroomFacilityName(b.facility) || b.classroom) return 'Academic Classroom';
    return 'Campus Facility';
  }

  function getBookingPrimaryFacilityLabel(b) {
    if (Utils.isVehicleBooking(b)) {
      const vList = Utils.formatVehicleList(b.vehicle);
      return vList ? `Vehicle — ${vList}` : 'Vehicle / Transportation';
    }
    if (b.facility && b.classroom) {
      return `${b.facility} (${b.classroom})`;
    }
    return b.facility || Utils.getBookingLocation(b, 'Unspecified Facility');
  }

  function getBookingFacilityColumnValue(b) {
    if (Utils.isVehicleBooking(b)) {
      const vList = Utils.formatVehicleList(b.vehicle);
      return vList ? `Vehicle (${vList})` : 'Vehicle';
    }
    return b.facility || '—';
  }

  function getBookingIsoDateStr(b) {
    const raw = String(b.startDate || b.date || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return raw;
  }

  function toIsoTimestampStr(ts) {
    if (!ts) return '';
    if (typeof ts.toDate === 'function') return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return String(ts);
  }

  // Shared multi-sheet Excel Workbook builder used by both Reports and Backup & Cleanup
  function buildAndDownloadExcelWorkbook(bookings, options = {}) {
    if (typeof XLSX === 'undefined') {
      log.error('SheetJS (XLSX) library not loaded.');
      if (window.UiView && typeof UiView.showToast === 'function') {
        UiView.showToast('error', 'Excel Error', 'Excel library (SheetJS) is not loaded. Please refresh the page.');
      }
      return null;
    }

    const reportTitle   = options.reportTitle || 'OFFICIAL RESERVATION REPORT';
    const periodLabel   = options.periodLabel || 'All Dates';
    const filterSummary = options.filterSummary || 'All Records';
    const filename      = options.filename || `SIC_Bookings_Report_${Date.now()}.xlsx`;
    const sheetTitleRaw = options.sheetName || 'Reservations';
    const staffEmail    = (window.Session && Session.profile && Session.profile.email) || 'System Administrator';

    let internalCount = 0;
    let externalCount = 0;
    let vehicleCount  = 0;
    let facilityCount = 0;

    const statusCounts = {
      'Approved': 0,
      'Pending': 0,
      'Pending Payment': 0,
      'Payment Under Review': 0,
      'Rejected': 0
    };

    const utilizationMap = new Map();

    const rows = bookings.map((b, idx) => {
      const uType = b.userType || 'Internal';
      if (uType === 'External') externalCount++;
      else internalCount++;

      const isVeh = Utils.isVehicleBooking(b);
      if (isVeh) vehicleCount++;
      else facilityCount++;

      const st = b.status || 'Pending';
      statusCounts[st] = (statusCounts[st] || 0) + 1;

      const primaryLocation = getBookingPrimaryFacilityLabel(b);
      const personsNum = parseInt(b.numPersons, 10);
      const validPersons = Number.isFinite(personsNum) && personsNum > 0 ? personsNum : 0;

      if (!utilizationMap.has(primaryLocation)) {
        utilizationMap.set(primaryLocation, {
          name: primaryLocation,
          category: getBookingCategoryLabel(b),
          total: 0,
          internal: 0,
          external: 0,
          approved: 0,
          participants: 0
        });
      }
      const statEntry = utilizationMap.get(primaryLocation);
      statEntry.total++;
      if (uType === 'External') statEntry.external++;
      else statEntry.internal++;
      if (st === 'Approved') statEntry.approved++;
      statEntry.participants += validPersons;

      const sDate = b.startDate || b.date || '—';
      const eDate = b.endDate || b.startDate || b.date || '—';
      const timeRange = Utils.formatTimeRange12(b.startTime, b.endTime, ' – ', '—');
      const vList = Utils.formatVehicleList(b.vehicle);

      const deptOrAgency = uType === 'External'
        ? (b.agencyName || b.agency || b.organization || 'External Organization')
        : (b.parentDepartment || b.department || 'Internal');

      const schoolOrOffice = uType === 'External'
        ? (b.officeName || b.agencyType || '—')
        : (b.collegeSchool || b.department || '—');

      const driverDisplay = b.assignedDriverName
        ? (b.assignedDriverPhone ? `${b.assignedDriverName} (${b.assignedDriverPhone})` : b.assignedDriverName)
        : (isVeh ? 'Unassigned' : 'N/A');

      return {
        'No.':                         idx + 1,
        'Reference ID':                b.referenceId || b.id || '—',
        'Status':                      st,
        'User Type':                   uType,
        'Booking Category':            getBookingCategoryLabel(b),
        'Facility / Vehicle Reserved': primaryLocation,
        'Facility / Venue':            getBookingFacilityColumnValue(b),
        'Classroom':                   b.classroom || 'N/A',
        'Vehicle(s) Requested':        vList || 'N/A',
        'Destination':                 isVeh ? (b.destination || 'Specified in Purpose') : 'On-Campus',
        'Assigned Driver':             driverDisplay,
        'Start Date':                  sDate,
        'End Date':                    eDate,
        'Time Schedule':               timeRange,
        'Start Time':                  Utils.formatTime12(b.startTime, '—'),
        'End Time':                    Utils.formatTime12(b.endTime, '—'),
        'Participants':                validPersons || b.numPersons || '—',
        'Requester Name':              Utils.getBookingRequesterName(b, '—'),
        'Position / Designation':      b.position || '—',
        'Department / Agency':         deptOrAgency,
        'School / Office / Division':  schoolOrOffice,
        'Dean / Office Head':          b.officeHead || 'N/A',
        'Agency Type':                 uType === 'External' ? (b.agencyType || 'External') : 'San Isidro College',
        'Contact Number':              b.contactNumber || b.contact || '—',
        'Email Address':               b.email || '—',
        'Address':                     b.address || '—',
        'Purpose of Activity':         b.purpose || '—',
        'Equipment Requested':         formatEquipmentCell(b.equipment, b.otherEquipment),
        'Special Considerations':      b.considerations || 'None',
        'Date Submitted':              b.dateSubmitted || toIsoTimestampStr(b.createdAt) || '—'
      };
    });

    const wb = XLSX.utils.book_new();

    // ---- Sheet 1: Reservation Records ----
    const bannerRows = [
      ['SAN ISIDRO COLLEGE — MALAYBALAY CITY, BUKIDNON'],
      ['DIGITAL FACILITIES & TRANSPORTATION RESERVATION SYSTEM'],
      [reportTitle.toUpperCase()],
      [`Reporting Period: ${periodLabel}   |   Filters: ${filterSummary}`],
      [`Total Records: ${bookings.length}   (Internal: ${internalCount}  •  External: ${externalCount}  •  Facilities/Rooms: ${facilityCount}  •  Vehicles: ${vehicleCount})`],
      [`Generated On: ${new Date().toLocaleString()}   |   Exported By: ${staffEmail}`],
      []
    ];

    const wsRecords = XLSX.utils.aoa_to_sheet(bannerRows);
    const tableHeaderRowNumber = bannerRows.length + 1; // Row 8 (1-indexed)
    XLSX.utils.sheet_add_json(wsRecords, rows, { origin: `A${tableHeaderRowNumber}` });

    const colKeys = Object.keys(rows[0] || {});
    const lastColIndex = Math.max(colKeys.length - 1, 7);

    // Merge title banner rows across the first 10 columns for a clean report header
    const mergeColSpan = Math.min(lastColIndex, 9);
    wsRecords['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: mergeColSpan } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: mergeColSpan } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: mergeColSpan } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: mergeColSpan } },
      { s: { r: 4, c: 0 }, e: { r: 4, c: mergeColSpan } },
      { s: { r: 5, c: 0 }, e: { r: 5, c: mergeColSpan } }
    ];

    // Enable Excel AutoFilter on the data table header row
    if (colKeys.length > 0 && rows.length > 0) {
      const endCellRef = XLSX.utils.encode_cell({
        r: bannerRows.length + rows.length,
        c: colKeys.length - 1
      });
      wsRecords['!autofilter'] = {
        ref: `A${tableHeaderRowNumber}:${endCellRef}`
      };
    }

    // Set comfortable row heights for banner, header, and data rows
    wsRecords['!rows'] = [
      { hpt: 22 },
      { hpt: 18 },
      { hpt: 20 },
      { hpt: 18 },
      { hpt: 18 },
      { hpt: 18 },
      { hpt: 10 },
      { hpt: 24 }
    ];

    // Auto-size columns based on header & cell content length
    wsRecords['!cols'] = colKeys.map(key => {
      if (key === 'No.') return { wch: 6 };
      let maxLen = key.length;
      rows.forEach(r => {
        const val = String(r[key] !== undefined && r[key] !== null ? r[key] : '');
        if (val.length > maxLen) maxLen = val.length;
      });
      return { wch: Math.min(Math.max(maxLen + 3, 12), 44) };
    });

    const cleanSheetName = String(sheetTitleRaw || 'Reservations')
      .replace(/[\\/?*[\]:]/g, ' ')
      .trim()
      .substring(0, 31) || 'Reservations';

    XLSX.utils.book_append_sheet(wb, wsRecords, cleanSheetName);

    // ---- Sheet 2: Executive Summary & Utilization Breakdown ----
    const utilizationRows = Array.from(utilizationMap.values())
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
      .map((u, i) => [
        i + 1,
        u.name,
        u.category,
        u.total,
        u.approved,
        u.internal,
        u.external,
        u.participants
      ]);

    const summaryAoa = [
      ['SAN ISIDRO COLLEGE — RESERVATION EXECUTIVE SUMMARY'],
      [`Reporting Period: ${periodLabel}   |   Filters: ${filterSummary}`],
      [`Generated On: ${new Date().toLocaleString()}`],
      [],
      ['1. RESERVATION BREAKDOWN BY STATUS'],
      ['Status', 'Count', 'Share (%)'],
      ...Object.entries(statusCounts).map(([stName, cnt]) => [
        stName,
        cnt,
        bookings.length > 0 ? `${((cnt / bookings.length) * 100).toFixed(1)}%` : '0.0%'
      ]),
      ['TOTAL RESERVATIONS', bookings.length, '100.0%'],
      [],
      ['2. RESERVATION BREAKDOWN BY USER TYPE & CATEGORY'],
      ['Metric', 'Count', 'Share (%)'],
      ['Internal Users (Students / Faculty / Staff)', internalCount, bookings.length > 0 ? `${((internalCount / bookings.length) * 100).toFixed(1)}%` : '0.0%'],
      ['External Users (Agencies / Guests)', externalCount, bookings.length > 0 ? `${((externalCount / bookings.length) * 100).toFixed(1)}%` : '0.0%'],
      ['Campus Facilities & Classrooms', facilityCount, bookings.length > 0 ? `${((facilityCount / bookings.length) * 100).toFixed(1)}%` : '0.0%'],
      ['Campus Vehicles (Transportation)', vehicleCount, bookings.length > 0 ? `${((vehicleCount / bookings.length) * 100).toFixed(1)}%` : '0.0%'],
      [],
      ['3. UTILIZATION BREAKDOWN BY FACILITY & VEHICLE'],
      ['No.', 'Facility / Vehicle Name', 'Category', 'Total Bookings', 'Approved', 'Internal Users', 'External Users', 'Total Participants'],
      ...utilizationRows
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
    wsSummary['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } }
    ];
    wsSummary['!cols'] = [
      { wch: 8 },
      { wch: 36 },
      { wch: 24 },
      { wch: 16 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 18 }
    ];

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');
    XLSX.writeFile(wb, filename);
    return filename;
  }

  window.ExcelReportBuilder = {
    buildAndDownloadExcelWorkbook,
    formatEquipmentCell,
    getBookingPrimaryFacilityLabel
  };

  const reportsApp = createApp({
    data() {
      const now = new Date();
      return {
        selectedStatus: 'Approved',
        selectedUserType: 'all',
        selectedFacility: 'all',
        selectedMonth: now.getMonth(),
        selectedYear: now.getFullYear(),
        currentPage: 1,
        pageSize: REPORT_PAGE_SIZE,
        facilities: [],
        vehicles: [],
        bookings: [],
        years: [now.getFullYear()],
        MONTHS
      };
    },

    watch: {
      selectedStatus()   { this.currentPage = 1; },
      selectedUserType() { this.currentPage = 1; },
      selectedFacility() { this.currentPage = 1; },
      selectedMonth()    { this.currentPage = 1; },
      selectedYear()     { this.currentPage = 1; }
    },

    computed: {
      filteredBookings() {
        const month    = Number(this.selectedMonth);
        const year     = Number(this.selectedYear);
        const facility = this.selectedFacility;
        const userType = this.selectedUserType;
        const status   = this.selectedStatus;

        return this.bookings
          .filter(b => {
            if (status !== 'all') {
              if (status === 'Pending') {
                if (b.status !== 'Pending' && b.status !== 'Pending Payment' && b.status !== 'Payment Under Review') {
                  return false;
                }
              } else if (b.status !== status) {
                return false;
              }
            }

            if (userType !== 'all' && (b.userType || 'Internal') !== userType) {
              return false;
            }

            if (facility !== 'all') {
              if (facility === 'Vehicle') {
                if (!Utils.isVehicleBooking(b)) return false;
              } else if (facility.startsWith('fac:')) {
                const targetFac = facility.slice(4);
                if ((b.facility || '').trim() !== targetFac) return false;
              } else if (facility.startsWith('veh:')) {
                const targetVeh = facility.slice(4);
                if (!Utils.getBookingVehicleArray(b).includes(targetVeh)) return false;
              } else if ((b.facility || '').trim() !== facility) {
                return false;
              }
            }

            const dateStr = getBookingIsoDateStr(b);
            if (!dateStr) return false;

            const parts = dateStr.split('-');
            if (parts.length < 2) return false;
            const bYear  = parseInt(parts[0], 10);
            const bMonth = parseInt(parts[1], 10) - 1;

            if (bYear !== year) return false;
            if (month >= 0 && bMonth !== month) return false;
            return true;
          })
          .sort((a, b) => {
            const da = getBookingIsoDateStr(a);
            const db = getBookingIsoDateStr(b);
            return da.localeCompare(db) || (a.startTime || '').localeCompare(b.startTime || '');
          });
      },

      totalPages() {
        return Math.max(1, Math.ceil(this.filteredBookings.length / this.pageSize));
      },

      paginatedBookings() {
        const start = (this.currentPage - 1) * this.pageSize;
        return this.filteredBookings.slice(start, start + this.pageSize);
      },

      pageStart() {
        if (this.filteredBookings.length === 0) return 0;
        return (this.currentPage - 1) * this.pageSize + 1;
      },

      pageEnd() {
        return Math.min(this.currentPage * this.pageSize, this.filteredBookings.length);
      },

      visiblePageNumbers() {
        const total = this.totalPages;
        const cur   = this.currentPage;
        if (total <= 7) {
          return Array.from({ length: total }, (_, i) => i + 1);
        }
        const pages = [1];
        const start = Math.max(2, cur - 1);
        const end   = Math.min(total - 1, cur + 1);
        if (start > 2) pages.push('...');
        for (let p = start; p <= end; p++) pages.push(p);
        if (end < total - 1) pages.push('...');
        pages.push(total);
        return pages;
      },

      facilityFilterDisplayLabel() {
        const f = this.selectedFacility;
        if (f === 'all') return 'All Facilities & Vehicles';
        if (f === 'Vehicle') return 'All Vehicles';
        if (f.startsWith('fac:') || f.startsWith('veh:')) return f.slice(4);
        return f;
      },

      periodDisplayLabel() {
        if (Number(this.selectedMonth) < 0) {
          return `Entire Year ${this.selectedYear}`;
        }
        return `${this.MONTHS[this.selectedMonth] || ''} ${this.selectedYear}`;
      },

      previewTitle() {
        const statusLabel = this.selectedStatus === 'all' ? 'All Statuses' : this.selectedStatus;
        const typeLabel   = this.selectedUserType === 'all' ? 'All Users' : `${this.selectedUserType} Users`;
        return `${statusLabel} • ${typeLabel} • ${this.facilityFilterDisplayLabel} — ${this.periodDisplayLabel}`;
      },

      recordCountText() {
        const count = this.filteredBookings.length;
        return `${count} record${count !== 1 ? 's' : ''}`;
      }
    },

    mounted() {
      this.syncData();
      window.initReportsView = () => this.syncData();
    },

    methods: {
      syncData() {
        this.facilities = Array.isArray(window._allFacilities) ? [...window._allFacilities] : [];
        this.vehicles   = Array.isArray(window._allVehicles) ? [...window._allVehicles] : [];
        this.bookings   = Array.isArray(window._allBookings) ? [...window._allBookings] : [];

        const currentYear = new Date().getFullYear();
        const yearSet = new Set([currentYear]);
        this.bookings.forEach(b => {
          const d = getBookingIsoDateStr(b);
          if (d) {
            const y = parseInt(d.substring(0, 4), 10);
            if (!Number.isNaN(y)) yearSet.add(y);
          }
        });

        this.years = Array.from(yearSet).sort((a, b) => b - a);
        if (!this.years.includes(Number(this.selectedYear))) {
          this.selectedYear = currentYear;
        }
        if (this.currentPage > this.totalPages) {
          this.currentPage = this.totalPages;
        }
      },

      goToPage(page) {
        const target = Math.min(Math.max(1, Number(page) || 1), this.totalPages);
        this.currentPage = target;
      },

      formatRequesterName(b) {
        return Utils.getBookingRequesterName(b, '—');
      },

      formatDeptOrg(b) {
        if ((b.userType || 'Internal') === 'Internal') {
          const parent = b.parentDepartment || b.department || '';
          const school = b.collegeSchool || '';
          if (parent && school && parent !== school) return `${parent} (${school})`;
          return parent || school || '—';
        }
        return [b.agencyName || b.organization || b.agency, b.officeName].filter(Boolean).join(' — ') || '—';
      },

      formatFacilityCell(b) {
        return getBookingPrimaryFacilityLabel(b);
      },

      formatDateCell(b) {
        const sDate = b.startDate || b.date || '—';
        const eDate = b.endDate || b.startDate || b.date || '—';
        return sDate === eDate ? sDate : `${sDate} to ${eDate}`;
      },

      formatTimeCell(b) {
        return Utils.formatTimeRange12(b.startTime, b.endTime);
      },

      formatStatusClass(status) {
        return String(status || 'Approved').toLowerCase().replace(/\s+/g, '-');
      },

      exportToExcel() {
        const filtered = this.filteredBookings;
        if (filtered.length === 0) {
          if (window.UiView && typeof UiView.showToast === 'function') {
            UiView.showToast('info', 'No Records to Export', 'No reservations match the selected report filters.');
          }
          return;
        }

        const statusLabel   = this.selectedStatus === 'all' ? 'All Statuses' : this.selectedStatus;
        const userTypeLabel = this.selectedUserType === 'all' ? 'All Users' : `${this.selectedUserType} Users`;
        const facilityLabel = this.facilityFilterDisplayLabel;
        const periodLabel   = this.periodDisplayLabel;

        const safeFacility = facilityLabel.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const safePeriod   = periodLabel.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const filename     = `SIC_Bookings_Report_${safeFacility}_${safePeriod}.xlsx`;

        const saved = buildAndDownloadExcelWorkbook(filtered, {
          reportTitle:   `RESERVATION REPORT — ${periodLabel.toUpperCase()}`,
          periodLabel:   periodLabel,
          filterSummary: `${statusLabel} • ${userTypeLabel} • ${facilityLabel}`,
          sheetName:     periodLabel,
          filename:      filename
        });

        if (saved && window.UiView && typeof UiView.showToast === 'function') {
          UiView.showToast('success', 'Excel Report Downloaded', `Saved ${saved} (${filtered.length} records).`);
        }
      }
    }
  });

  reportsApp.mount('#reportsSection');
})();
