/* ============================================================
   Calendar View — San Isidro College Reservation System
   View Layer (js/views/calendar-view.js)
   Renders FullCalendar widget, date availability popup, and
   event details modal on index.html. Never touches Firestore.
   ============================================================ */

(function () {
  'use strict';

  function injectDayCellStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .fc .fc-daygrid-day { cursor: pointer; }
      .fc .fc-daygrid-day:hover { background: rgba(212,168,67,0.08) !important; }
    `;
    document.head.appendChild(style);
  }

  function createCalendar(calendarEl, { onEventClick, onDateClick }) {
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
      eventClick(info) {
        if (typeof onEventClick === 'function') onEventClick(info.event);
      },
      dateClick(info) {
        if (typeof onDateClick === 'function') onDateClick(info.dateStr);
      },
      events: []
    });

    calendar.render();
    injectDayCellStyles();
    return calendar;
  }

  function renderApprovedEvents(calendar, bookings, facilityColors) {
    calendar.getEvents().forEach(e => e.remove());

    bookings.forEach(d => {
      if (d.status !== 'Approved') return;
      const color = facilityColors[d.facility] || '#3498db';
      const sDate = d.startDate || d.date;
      const eDate = d.endDate || sDate;

      calendar.addEvent({
        id:    d.id,
        title: Utils.getBookingLocation(d, 'Vehicle') + ' — ' + d.name,
        start: sDate + 'T' + d.startTime,
        end:   eDate + 'T' + d.endTime,
        color: color,
        extendedProps: {
          facility:    Utils.getBookingLocation(d, 'Vehicle'),
          name:        d.name,
          email:       d.email,
          purpose:     d.purpose,
          userType:    d.userType,
          equipment:   d.equipment || [],
          referenceId: d.referenceId || '—'
        }
      });
    });
  }

  function renderDemoEvents(calendar, defaultColors) {
    const today = new Date();
    const yyyy  = today.getFullYear();
    const mm    = String(today.getMonth() + 1).padStart(2, '0');
    const dd    = String(today.getDate()).padStart(2, '0');
    const base  = `${yyyy}-${mm}`;

    const demoEvents = [
      { title: 'Gymnasium — Faculty Sports Fest',        start: `${base}-${dd}T08:00`, end: `${base}-${dd}T12:00`, color: defaultColors['Gymnasium'] },
      { title: 'Chapel — College Assembly',              start: `${base}-${String(Math.min(28, today.getDate() + 2)).padStart(2, '0')}T13:00`, end: `${base}-${String(Math.min(28, today.getDate() + 2)).padStart(2, '0')}T16:00`, color: defaultColors['Chapel'] },
      { title: 'Guest House/College H.E — Workshop',     start: `${base}-${String(Math.min(28, today.getDate() + 4)).padStart(2, '0')}T09:00`, end: `${base}-${String(Math.min(28, today.getDate() + 4)).padStart(2, '0')}T11:30`, color: defaultColors['Guest House/College H.E'] },
      { title: 'Conference Room — Board Meeting',        start: `${base}-${String(Math.min(28, today.getDate() + 1)).padStart(2, '0')}T14:00`, end: `${base}-${String(Math.min(28, today.getDate() + 1)).padStart(2, '0')}T15:30`, color: defaultColors['Conference Room'] },
      { title: 'Field/Oval — Seminar',                   start: `${base}-${String(Math.min(28, today.getDate() + 5)).padStart(2, '0')}T10:00`, end: `${base}-${String(Math.min(28, today.getDate() + 5)).padStart(2, '0')}T12:00`, color: defaultColors['Field/Oval'] }
    ];

    demoEvents.forEach(evt => calendar.addEvent(evt));
  }

  function renderDateAvailabilityModal(dateStr, allApprovedBookings, activeFacilities, facilityColors, palette, testingMode) {
    const modal   = document.getElementById('dateAvailModal');
    const title   = document.getElementById('dateAvailTitle');
    const content = document.getElementById('dateAvailContent');
    if (!modal || !title || !content) return;

    const dateObj = new Date(dateStr + 'T00:00:00');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    title.textContent = dateObj.toLocaleDateString('en-US', options);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isPast = !testingMode && (dateObj < today);

    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 3);
    minDate.setHours(0, 0, 0, 0);
    const isTooClose = !testingMode && (dateObj >= today && dateObj < minDate);

    const dayBookings = allApprovedBookings.filter(b => {
      const s = b.startDate || b.date;
      const e = b.endDate || s;
      return dateStr >= s && dateStr <= e;
    });

    if (activeFacilities.length === 0) {
      content.innerHTML = '<p style="text-align:center; color:var(--gray-400); padding:var(--space-xl);">No facilities available. Please check back later.</p>';
      modal.classList.add('visible');
      return;
    }

    let html = '<div class="avail-grid">';

    activeFacilities.forEach((facility, idx) => {
      const facilityBookings = dayBookings.filter(b => b.facility === facility.name);
      const bookingCount = facilityBookings.length;
      const color = facilityColors[facility.name] || palette[idx % palette.length];

      let statusLabel, statusClass, isClickable;
      if (isPast) {
        statusLabel = 'Past Date';
        statusClass = 'avail-past';
        isClickable = false;
      } else if (isTooClose) {
        statusLabel = 'Unavailable (3-day notice required)';
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

      let slotsHtml = '';
      if (facilityBookings.length > 0) {
        slotsHtml = '<div class="avail-slots">';
        facilityBookings.forEach(b => {
          slotsHtml += `<span class="avail-slot-chip">${Utils.escapeHtml(Utils.formatTime12(b.startTime))} – ${Utils.escapeHtml(Utils.formatTime12(b.endTime))}</span>`;
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
                <h4 class="avail-card-name">${Utils.escapeHtml(facility.name)}</h4>
                ${facility.capacity ? `<span class="avail-card-capacity">Capacity: ${Utils.escapeHtml(facility.capacity)}</span>` : ''}
              </div>
            </div>
            <div class="avail-card-status ${statusClass}">
              <span class="avail-status-dot"></span>
              ${Utils.escapeHtml(statusLabel)}
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
    } else if (isTooClose) {
      html += '<p class="avail-past-notice">You must book at least 3 days in advance.</p>';
    }

    content.innerHTML = html;
    modal.classList.add('visible');
  }

  function renderEventDetailsModal(event) {
    const modal   = document.getElementById('eventModal');
    const title   = document.getElementById('modalTitle');
    const details = document.getElementById('modalDetails');
    if (!modal || !title || !details) return;

    const p = event.extendedProps || {};
    const formatDateTime12 = d => {
      if (!d) return '—';
      const datePart = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      const timePart = Utils.formatTime12(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
      return `${datePart}, ${timePart}`;
    };
    const startStr = formatDateTime12(event.start);
    const endStr   = formatDateTime12(event.end);

    title.textContent = p.facility || event.title;

    const eqText = (p.equipment && p.equipment.length)
      ? p.equipment.map(e => typeof e === 'string' ? e : `${e.item} (x${e.qty})`).join(', ')
      : 'None';

    details.innerHTML = `
      <div class="detail-row"><span class="detail-label">Requester</span><span class="detail-value">${Utils.escapeHtml(p.name || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">${Utils.escapeHtml(p.userType || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Start</span><span class="detail-value">${Utils.escapeHtml(startStr)}</span></div>
      <div class="detail-row"><span class="detail-label">End</span><span class="detail-value">${Utils.escapeHtml(endStr)}</span></div>
      <div class="detail-row"><span class="detail-label">Purpose</span><span class="detail-value">${Utils.escapeHtml(p.purpose || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Equipment</span><span class="detail-value">${Utils.escapeHtml(eqText)}</span></div>
      <div class="detail-row"><span class="detail-label">Reference</span><span class="detail-value">${Utils.escapeHtml(p.referenceId || '—')}</span></div>
    `;

    modal.classList.add('visible');
  }

  window.CalendarView = {
    createCalendar,
    renderApprovedEvents,
    renderDemoEvents,
    renderDateAvailabilityModal,
    renderEventDetailsModal
  };
})();

