/* ============================================================
   Calendar Module — San Isidro College Reservation System
   Renders FullCalendar with Firestore real-time bookings
  + Clickable dates open the availability popup
   ============================================================ */

(function () {
  'use strict';

  // Color map for facilities (default, extended dynamically)
  const FACILITY_COLORS_DEFAULT = {
    'Gymnasium':               '#3498db',
    'Chapel':                  '#9b59b6',
    'Guest House/College H.E': '#27ae60',
    'Field/Oval':              '#e67e22',
    'Conference Room':         '#e74c3c',
  };

  const PALETTE = ['#3498db', '#9b59b6', '#27ae60', '#e67e22', '#e74c3c', '#1abc9c', '#f39c12', '#2c3e50', '#e91e63', '#00bcd4'];

  // Will be populated from Firestore
  let facilityColors = { ...FACILITY_COLORS_DEFAULT };
  let activeFacilities = []; // { name, description, capacity }

  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) return;

  // ---- Load active facilities from Firestore ----
  function loadFacilities() {
    return db.collection('facilities')
      .orderBy('order', 'asc')
      .get()
      .then(snapshot => {
        if (snapshot.empty) {
          // Fall back to hardcoded defaults
          activeFacilities = Object.keys(FACILITY_COLORS_DEFAULT).map(name => ({
            name,
            description: '',
            capacity: ''
          }));
          return;
        }

        activeFacilities = [];
        let idx = 0;
        snapshot.forEach(doc => {
          const f = doc.data();
          if (f.status !== 'Active') return;
          activeFacilities.push({
            name: f.name,
            description: f.description || '',
            capacity: f.capacity || ''
          });
          // Assign color if not in default map
          if (!facilityColors[f.name]) {
            facilityColors[f.name] = PALETTE[idx % PALETTE.length];
          }
          idx++;
        });
      })
      .catch(err => {
        console.warn('Could not load facilities for calendar:', err);
        activeFacilities = Object.keys(FACILITY_COLORS_DEFAULT).map(name => ({
          name,
          description: '',
          capacity: ''
        }));
      });
  }

  // ---- Build FullCalendar ----
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    headerToolbar: {
      left:   'prev,next today',
      center: 'title',
      right:  'dayGridMonth,timeGridWeek'
    },
    height: 'auto',
    nowIndicator: true,
    selectable: false,
    editable: false,
    eventTimeFormat: {
      hour:   '2-digit',
      minute: '2-digit',
      hour12: true
    },
    // Clicking an event shows event details
    eventClick: function (info) {
      showEventDetails(info.event);
    },
    // Clicking a date cell shows the availability popup
    dateClick: function (info) {
      lastDateClickTime = Date.now();
      showDateAvailability(info.dateStr);
    },
    events: [] // populated via Firestore listener
  });

  calendar.render();

  // ---------- Sanitizer helper (prevent XSS when inserting text) ----------
  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Add cursor pointer to day cells + fallback click handler for browsers
  // where FullCalendar's interaction plugin may not work (e.g. Brave)
  const style = document.createElement('style');
  style.textContent = `
    .fc .fc-daygrid-day { cursor: pointer; }
    .fc .fc-daygrid-day:hover { background: rgba(212,168,67,0.08) !important; }
  `;
  document.head.appendChild(style);

  // Fallback: attach a native click listener via event delegation
  // This fires even if the FullCalendar interaction plugin isn't loaded
  let lastDateClickTime = 0; // debounce guard to prevent double-fire

  calendarEl.addEventListener('click', function (e) {
    // Skip if FullCalendar's dateClick already handled this
    if (Date.now() - lastDateClickTime < 300) return;

    // Find the closest day cell
    const dayCell = e.target.closest('.fc-daygrid-day[data-date]');
    if (!dayCell) return;

    // Don't fire if user clicked on an event (let eventClick handle it)
    if (e.target.closest('.fc-event')) return;

    const dateStr = dayCell.getAttribute('data-date');
    if (dateStr) {
      showDateAvailability(dateStr);
    }
  });

  // ---- Firestore real-time listener for approved bookings ----
  let allApprovedBookings = []; // cache for availability checks

  try {
    db.collection('bookings')
      .where('status', 'in', ['Approved', 'Pending'])
      .onSnapshot(snapshot => {
        // Remove existing events
        calendar.getEvents().forEach(e => e.remove());
        allApprovedBookings = [];

        snapshot.forEach(doc => {
          const d = doc.data();
          allApprovedBookings.push(d);

          // Only show Approved bookings on the calendar
          if (d.status !== 'Approved') return;

          const color = facilityColors[d.facility] || '#3498db';

          calendar.addEvent({
            id:    doc.id,
            title: d.facility + ' — ' + d.name,
            start: d.date + 'T' + d.startTime,
            end:   d.date + 'T' + d.endTime,
            color: color,
            extendedProps: {
              facility:  d.facility,
              name:      d.name,
              email:     d.email,
              purpose:   d.purpose,
              userType:  d.userType,
              equipment: d.equipment || [],
              referenceId: d.referenceId || '—'
            }
          });
        });
      }, err => {
        console.warn('Calendar listener error:', err);
      });
  } catch (e) {
    console.warn('Firestore not configured yet. Calendar will run in demo mode.', e);

    // --- Demo events so the calendar is not empty before Firebase is set up ---
    const today = new Date();
    const yyyy  = today.getFullYear();
    const mm    = String(today.getMonth() + 1).padStart(2, '0');
    const dd    = String(today.getDate()).padStart(2, '0');
    const base  = `${yyyy}-${mm}`;

    const demoEvents = [
      { title: 'Gymnasium — Faculty Sports Fest', start: `${base}-${dd}T08:00`, end: `${base}-${dd}T12:00`, color: FACILITY_COLORS_DEFAULT['Gymnasium'] },
      { title: 'Chapel — College Assembly',   start: `${base}-${String(Math.min(28, today.getDate()+2)).padStart(2,'0')}T13:00`, end: `${base}-${String(Math.min(28, today.getDate()+2)).padStart(2,'0')}T16:00`, color: FACILITY_COLORS_DEFAULT['Chapel'] },
      { title: 'Guest House/College H.E — Workshop',      start: `${base}-${String(Math.min(28, today.getDate()+4)).padStart(2,'0')}T09:00`, end: `${base}-${String(Math.min(28, today.getDate()+4)).padStart(2,'0')}T11:30`, color: FACILITY_COLORS_DEFAULT['Guest House/College H.E'] },
      { title: 'Conference Room — Board Meeting',  start: `${base}-${String(Math.min(28, today.getDate()+1)).padStart(2,'0')}T14:00`, end: `${base}-${String(Math.min(28, today.getDate()+1)).padStart(2,'0')}T15:30`, color: FACILITY_COLORS_DEFAULT['Conference Room'] },
      { title: 'Field/Oval — Seminar',        start: `${base}-${String(Math.min(28, today.getDate()+5)).padStart(2,'0')}T10:00`, end: `${base}-${String(Math.min(28, today.getDate()+5)).padStart(2,'0')}T12:00`, color: FACILITY_COLORS_DEFAULT['Field/Oval'] },
    ];

    demoEvents.forEach(evt => calendar.addEvent(evt));
  }

  // Load facilities on init
  loadFacilities();

  // ============================================================
  // DATE CLICK SHOWS AVAILABILITY POPUP
  // ============================================================
  function showDateAvailability(dateStr) {
    const modal   = document.getElementById('dateAvailModal');
    const title   = document.getElementById('dateAvailTitle');
    const content = document.getElementById('dateAvailContent');
    if (!modal || !title || !content) return;

    // Format the date nicely
    const dateObj = new Date(dateStr + 'T00:00:00');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = dateObj.toLocaleDateString('en-US', options);
    title.textContent = formattedDate;

    // Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isPast = dateObj < today;

    // Find bookings on this date
    const dayBookings = allApprovedBookings.filter(b => b.date === dateStr);

    // Build facility cards
    if (activeFacilities.length === 0) {
      content.innerHTML = '<p style="text-align:center; color:var(--gray-400); padding:var(--space-xl);">No facilities available. Please check back later.</p>';
      modal.classList.add('visible');
      return;
    }

    let html = '<div class="avail-grid">';

    activeFacilities.forEach((facility, idx) => {
    const facilityBookings = dayBookings.filter(b => b.facility === facility.name);
    const bookingCount = facilityBookings.length;
    const color = facilityColors[facility.name] || PALETTE[idx % PALETTE.length];

      // Determine status
      let statusLabel, statusClass, isClickable;
      if (isPast) {
        statusLabel = 'Past Date';
        statusClass = 'avail-past';
        isClickable = false;
      } else if (bookingCount === 0) {
        statusLabel = 'Available All Day';
        statusClass = 'avail-free';
        isClickable = true;
      } else {
        statusLabel = `${bookingCount} booking${bookingCount > 1 ? 's' : ''} — Partially Available`;
        statusClass = 'avail-partial';
        isClickable = true;
      }

      // Build time slots list for booked times
      let slotsHtml = '';
      if (facilityBookings.length > 0) {
        slotsHtml = '<div class="avail-slots">';
        facilityBookings.forEach(b => {
          slotsHtml += `<span class="avail-slot-chip">${escapeHtml(formatTime12(b.startTime))} – ${escapeHtml(formatTime12(b.endTime))}</span>`;
        });
        slotsHtml += '</div>';
      }

      const clickAttr = isClickable
        ? `onclick="goToBooking('${dateStr}', '${encodeURIComponent(facility.name)}')" role="button" tabindex="0"`
        : '';

      html += `
        <div class="avail-card ${statusClass} ${isClickable ? 'clickable' : ''}" ${clickAttr}>
          <div class="avail-card-accent" style="background:${color};"></div>
          <div class="avail-card-body">
            <div class="avail-card-header">
              <div>
                <h4 class="avail-card-name">${escapeHtml(facility.name)}</h4>
                ${facility.capacity ? `<span class="avail-card-capacity">Capacity: ${escapeHtml(facility.capacity)}</span>` : ''}
              </div>
            </div>
            <div class="avail-card-status ${statusClass}">
              <span class="avail-status-dot"></span>
              ${escapeHtml(statusLabel)}
            </div>
            ${slotsHtml}
            ${isClickable ? '<div class="avail-card-action">Click to book</div>' : ''}
          </div>
        </div>
      `;
    });

    html += '</div>';

    if (isPast) {
      html += '<p class="avail-past-notice">This date is in the past. You cannot make reservations for past dates.</p>';
    }

    content.innerHTML = html;
    modal.classList.add('visible');
  }

  // Helper: convert 24h time "14:00" to "2:00 PM"
  function formatTime12(time) {
    if (!time) return '—';
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  // Navigate to booking page with pre-filled params
  window.goToBooking = function (date, facilityEncoded) {
    const facility = decodeURIComponent(facilityEncoded);
    window.location.href = `booking.html?date=${date}&facility=${encodeURIComponent(facility)}`;
  };

  // ---- Event details popup ----
  function showEventDetails(event) {
    const modal   = document.getElementById('eventModal');
    const title   = document.getElementById('modalTitle');
    const details = document.getElementById('modalDetails');

    const p = event.extendedProps || {};
    const startStr = event.start ? event.start.toLocaleString() : '—';
    const endStr   = event.end   ? event.end.toLocaleString()   : '—';

    title.textContent = p.facility || event.title;

    details.innerHTML = `
      <div class="detail-row"><span class="detail-label">Requester</span><span class="detail-value">${escapeHtml(p.name || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">${escapeHtml(p.userType || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Start</span><span class="detail-value">${escapeHtml(startStr)}</span></div>
      <div class="detail-row"><span class="detail-label">End</span><span class="detail-value">${escapeHtml(endStr)}</span></div>
      <div class="detail-row"><span class="detail-label">Purpose</span><span class="detail-value">${escapeHtml(p.purpose || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Equipment</span><span class="detail-value">${escapeHtml((p.equipment && p.equipment.length) ? p.equipment.join(', ') : 'None')}</span></div>
      <div class="detail-row"><span class="detail-label">Reference</span><span class="detail-value">${escapeHtml(p.referenceId || '—')}</span></div>
    `;

    modal.classList.add('visible');
  }
})();
