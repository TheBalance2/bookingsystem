/* ============================================================
   Calendar Controller — San Isidro College Reservation System
   Controller Layer (js/controllers/calendar-controller.js)
   Coordinates FacilityModel, BookingModel, and CalendarView on
   index.html, plus navbar and modal event listeners.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'CalendarController';
  const TESTING_MODE = Boolean(window.SIC_TESTING_MODE);

  const FACILITY_COLORS_DEFAULT = {
    'Gymnasium':               '#3498db',
    'Chapel':                  '#9b59b6',
    'Guest House/College H.E': '#27ae60',
    'Field/Oval':              '#e67e22',
    'Conference Room':         '#e74c3c'
  };

  const PALETTE = ['#3498db', '#9b59b6', '#27ae60', '#e67e22', '#e74c3c', '#1abc9c', '#f39c12', '#2c3e50', '#e91e63', '#00bcd4'];

  let facilityColors      = { ...FACILITY_COLORS_DEFAULT };
  let activeFacilities    = [];
  let allApprovedBookings = [];
  let lastDateClickTime   = 0;

  // Navbar scroll & mobile toggle
  const navbar    = document.getElementById('navbar');
  const navToggle = document.getElementById('navToggle');
  const navLinks  = document.getElementById('navLinks');

  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 50);
    });
  }

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
  }

  // Event & Date availability modal close helpers
  function closeEventModal() {
    const el = document.getElementById('eventModal');
    if (el) el.classList.remove('visible');
  }

  function closeDateAvailModal() {
    const el = document.getElementById('dateAvailModal');
    if (el) el.classList.remove('visible');
  }

  window.closeEventModal = closeEventModal;
  window.closeDateAvailModal = closeDateAvailModal;

  const eventModalEl     = document.getElementById('eventModal');
  const dateAvailModalEl = document.getElementById('dateAvailModal');
  if (eventModalEl) {
    eventModalEl.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeEventModal();
    });
  }
  if (dateAvailModalEl) {
    dateAvailModalEl.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeDateAvailModal();
    });
  }

  window.goToBooking = function (date, facilityEncoded) {
    const facility = decodeURIComponent(facilityEncoded);
    window.location.href = `booking.html?date=${date}&facility=${encodeURIComponent(facility)}`;
  };

  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) return;

  function loadFacilities() {
    return FacilityModel.getActive()
      .then(facilities => {
        if (!facilities || facilities.length === 0) {
          activeFacilities = Object.keys(FACILITY_COLORS_DEFAULT).map(name => ({
            name,
            description: '',
            capacity: ''
          }));
          return;
        }

        activeFacilities = [];
        facilities.forEach((f, idx) => {
          activeFacilities.push({
            name: f.name,
            description: f.description || '',
            capacity: f.capacity || ''
          });
          if (!facilityColors[f.name]) {
            facilityColors[f.name] = PALETTE[idx % PALETTE.length];
          }
        });
      })
      .catch(err => {
        Logger.warn(LAYER, 'Could not load facilities for calendar:', err);
        activeFacilities = Object.keys(FACILITY_COLORS_DEFAULT).map(name => ({
          name,
          description: '',
          capacity: ''
        }));
      });
  }

  function openDateAvailability(dateStr) {
    CalendarView.renderDateAvailabilityModal(
      dateStr,
      allApprovedBookings,
      activeFacilities,
      facilityColors,
      PALETTE,
      TESTING_MODE
    );
  }

  const calendar = CalendarView.createCalendar(calendarEl, {
    onEventClick(event) {
      CalendarView.renderEventDetailsModal(event);
    },
    onDateClick(dateStr) {
      lastDateClickTime = Date.now();
      openDateAvailability(dateStr);
    }
  });

  // Fallback native click listener for day cells
  calendarEl.addEventListener('click', (e) => {
    if (Date.now() - lastDateClickTime < 300) return;
    const dayCell = e.target.closest('.fc-daygrid-day[data-date]');
    if (!dayCell) return;
    if (e.target.closest('.fc-event')) return;
    const dateStr = dayCell.getAttribute('data-date');
    if (dateStr) openDateAvailability(dateStr);
  });

  // Listen to bookings via BookingModel
  try {
    BookingModel.listenApprovedAndPending(
      (bookings) => {
        allApprovedBookings = bookings;
        CalendarView.renderApprovedEvents(calendar, bookings, facilityColors);
      },
      (err) => {
        Logger.warn(LAYER, 'Calendar listener error:', err);
      }
    );
  } catch (err) {
    Logger.warn(LAYER, 'Firestore not configured yet. Calendar will run in demo mode.', err);
    CalendarView.renderDemoEvents(calendar, FACILITY_COLORS_DEFAULT);
  }

  loadFacilities();
})();

