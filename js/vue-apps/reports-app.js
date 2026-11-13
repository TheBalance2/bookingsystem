/* ============================================================
   Digital Reservation System — San Isidro College
   Vue.js 3 App: Reports & Excel Export (dashboard.html)
   ============================================================ */

(function () {
  const { createApp } = Vue;
  const log = window.Logger ? window.Logger.create('ReportsApp') : console;

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const reportsApp = createApp({
    data() {
      const now = new Date();
      return {
        selectedUserType: 'all',
        selectedFacility: 'all',
        selectedMonth: now.getMonth(),
        selectedYear: now.getFullYear(),
        facilities: [],
        bookings: [],
        years: [now.getFullYear()],
        MONTHS
      };
    },

    computed: {
      filteredBookings() {
        const month = Number(this.selectedMonth);
        const year = Number(this.selectedYear);
        const facility = this.selectedFacility;
        const userType = this.selectedUserType;

        return this.bookings
          .filter(b => {
            if (b.status !== 'Approved') return false;

            if (userType !== 'all' && b.userType !== userType) {
              return false;
            }

            if (facility !== 'all') {
              if (facility === 'Vehicle') {
                if (b.facility !== 'Vehicle' && !b.vehicle) return false;
              } else if (b.facility !== facility) {
                return false;
              }
            }

            const dateStr = b.startDate || b.date || '';
            if (!dateStr) return false;

            const parts = dateStr.split('-');
            if (parts.length < 2) return false;
            const bYear = parseInt(parts[0], 10);
            const bMonth = parseInt(parts[1], 10) - 1;

            return bYear === year && bMonth === month;
          })
          .sort((a, b) => {
            const da = a.startDate || a.date || '';
            const db = b.startDate || b.date || '';
            return da.localeCompare(db) || (a.startTime || '').localeCompare(b.startTime || '');
          });
      },

      previewTitle() {
        const typeLabel = this.selectedUserType === 'all' ? 'All Users' : `${this.selectedUserType} Users`;
        const facilityLabel = this.selectedFacility === 'all' ? 'All Facilities' : this.selectedFacility;
        const monthLabel = this.MONTHS[this.selectedMonth] || '';
        return `${typeLabel} • ${facilityLabel} — ${monthLabel} ${this.selectedYear}`;
      },

      recordCountText() {
        const count = this.filteredBookings.length;
        return `${count} record${count !== 1 ? 's' : ''}`;
      }
    },

    mounted() {
      this.syncData();
      // Expose global refresh hook for DashboardController
      window.initReportsView = () => this.syncData();
    },

    methods: {
      syncData() {
        this.facilities = Array.isArray(window._allFacilities) ? [...window._allFacilities] : [];
        this.bookings = Array.isArray(window._allBookings) ? [...window._allBookings] : [];

        const currentYear = new Date().getFullYear();
        const yearSet = new Set([currentYear]);
        this.bookings.forEach(b => {
          const d = b.startDate || b.date || '';
          if (d) {
            const y = parseInt(d.substring(0, 4), 10);
            if (!isNaN(y)) yearSet.add(y);
          }
        });

        this.years = Array.from(yearSet).sort((a, b) => b - a);
        if (!this.years.includes(Number(this.selectedYear))) {
          this.selectedYear = currentYear;
        }
      },

      formatDeptOrg(b) {
        if (b.userType === 'Internal') {
          return (b.department || '') + (b.collegeSchool ? ` (${b.collegeSchool})` : '') || '—';
        }
        return [b.organization, b.agencyType, b.officeName].filter(Boolean).join(' — ') || '—';
      },

      formatFacilityCell(b) {
        if (b.facility === 'Vehicle' && b.vehicle) {
          return `Vehicle (${Utils.formatVehicleList(b.vehicle)})`;
        }
        return Utils.getBookingLocation(b, b.facility || '—');
      },

      formatDateCell(b) {
        const sDate = b.startDate || b.date || '—';
        const eDate = b.endDate || b.startDate || b.date || '—';
        return sDate === eDate ? sDate : `${sDate} to ${eDate}`;
      },

      formatTimeCell(b) {
        return Utils.formatTimeRange12(b.startTime, b.endTime);
      },

      exportToExcel() {
        const filtered = this.filteredBookings;
        if (filtered.length === 0) {
          if (typeof window.showAdminToast === 'function') {
            window.showAdminToast('No approved bookings found for the selected filters.', 'info');
          }
          return;
        }

        if (typeof XLSX === 'undefined') {
          log.error('SheetJS (XLSX) library not loaded.');
          if (typeof window.showAdminToast === 'function') {
            window.showAdminToast('Excel library not loaded. Please refresh the page.', 'error');
          }
          return;
        }

        const userTypeLabel = this.selectedUserType === 'all' ? 'All Users' : `${this.selectedUserType} Users`;
        const facilityLabel = this.selectedFacility === 'all' ? 'All Facilities' : this.selectedFacility;
        const monthName = this.MONTHS[this.selectedMonth];
        const year = this.selectedYear;

        const rows = filtered.map(b => {
          const sDate = b.startDate || b.date || '';
          const eDate = b.endDate || b.startDate || b.date || '';
          const equipment = Array.isArray(b.equipment) && b.equipment.length > 0
            ? b.equipment.join(', ')
            : 'None';

          return {
            'Reference ID': b.referenceId || b.id,
            'Start Date': sDate,
            'End Date': eDate,
            'Start Time': Utils.formatTime12(b.startTime),
            'End Time': Utils.formatTime12(b.endTime),
            'Facility': b.facility || '',
            'Classroom': b.classroom || '',
            'Requester Name': b.fullName || b.name || '',
            'Position / Designation': b.position || '',
            'Email': b.email || '',
            'Contact Number': b.contactNumber || '',
            'User Type': b.userType || '',
            'Department / Organization': b.userType === 'Internal' ? (b.department || '') : (b.organization || ''),
            'School / Office': b.collegeSchool || b.officeName || '',
            'Dean / Office Head': b.officeHead || '',
            'Agency Type': b.agencyType || '',
            'Address': b.address || '',
            'Purpose': b.purpose || '',
            'No. of Persons': b.numPersons || '',
            'Vehicle': Utils.formatVehicleList(b.vehicle, ''),
            'Destination': b.destination || '',
            'Assigned Driver': b.assignedDriverName
              ? (b.assignedDriverPhone ? `${b.assignedDriverName} (${b.assignedDriverPhone})` : b.assignedDriverName)
              : '',
            'Equipment': equipment,
            'Other Equipment': b.otherEquipment || '',
            'Considerations': b.considerations || '',
            'Status': b.status || ''
          };
        });

        const wb = XLSX.utils.book_new();
        const headerRows = [
          ['San Isidro College — Digital Reservation System'],
          [`Approved Bookings Report: ${userTypeLabel} — ${facilityLabel}`],
          [`Period: ${monthName} ${year}`],
          [`Total Records: ${filtered.length}`],
          [`Generated: ${new Date().toLocaleString()}`],
          []
        ];

        const ws = XLSX.utils.aoa_to_sheet(headerRows);
        XLSX.utils.sheet_add_json(ws, rows, { origin: `A${headerRows.length + 1}` });

        const colKeys = Object.keys(rows[0] || {});
        ws['!cols'] = colKeys.map(key => {
          let maxLen = key.length;
          rows.forEach(r => {
            const val = String(r[key] || '');
            if (val.length > maxLen) maxLen = val.length;
          });
          return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
        });

        const sheetName = `${monthName.substring(0, 3)} ${year}`.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        const safeFacility = facilityLabel.replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `SIC_Bookings_${safeFacility}_${monthName}_${year}.xlsx`;

        XLSX.writeFile(wb, filename);

        if (typeof window.showAdminToast === 'function') {
          window.showAdminToast(`Report downloaded: ${filename}`, 'success');
        }
      }
    }
  });

  reportsApp.mount('#reportsSection');
})();

