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
  const filterTabs     = document.getElementById('filterTabs');
  const detailsModal   = document.getElementById('detailsModal');
  const detailsContent = document.getElementById('detailsContent');
  const adminEmail     = document.getElementById('adminEmail');
  const adminAvatar    = document.getElementById('adminAvatar');
  const logoutBtn      = document.getElementById('logoutBtn');
  const toastContainer = document.getElementById('toastContainer');

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

    // Start listening to bookings
    listenBookings();

    // Start listening to facilities
    listenFacilities();

    // Start listening to vehicles
    if (typeof listenVehicles === 'function') listenVehicles();
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
    const pending  = allBookings.filter(b => b.status === 'Pending').length;
    const approved = allBookings.filter(b => b.status === 'Approved').length;
    const rejected = allBookings.filter(b => b.status === 'Rejected').length;
    const total    = allBookings.length;

    document.getElementById('statPending').textContent  = pending;
    document.getElementById('statApproved').textContent = approved;
    document.getElementById('statRejected').textContent = rejected;
    document.getElementById('statTotal').textContent    = total;

    document.getElementById('countAll').textContent     = total;
    document.getElementById('countPending').textContent  = pending;
    document.getElementById('countApproved').textContent = approved;
    document.getElementById('countRejected').textContent = rejected;
  }

  function formatVehicleList(vehicleValue) {
    if (!vehicleValue) return '';
    if (Array.isArray(vehicleValue)) return vehicleValue.filter(Boolean).join(', ');
    return String(vehicleValue);
  }

  function getBookingLocation(booking) {
    if (booking.facility) return booking.facility;
    return formatVehicleList(booking.vehicle) || '—';
  }

  // ============================================================
  // RENDER TABLE
  // ============================================================
  function renderTable() {
    const filtered = activeFilter === 'all'
      ? allBookings
      : allBookings.filter(b => b.status === activeFilter);

    if (filtered.length === 0) {
      tableBody.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    tableBody.innerHTML = filtered.map(b => {
      const statusClass = (b.status || '').toLowerCase();
      const typeClass = (b.userType || 'Internal').toLowerCase();
      const showActions = b.status === 'Pending';
      const locationText = escapeHtml(getBookingLocation(b));

      const dateText = escapeHtml(b.date || '—');
      const timeText = `${escapeHtml(b.startTime || '')} – ${escapeHtml(b.endTime || '')}`;
      const dateTime = `${dateText}<br><small style="color:var(--gray-300)">${timeText}</small>`;

      const ref = escapeHtml(b.referenceId || '—');
      const name = escapeHtml(b.name || '—');
      const userType = escapeHtml(b.userType || '—');
      const purpose = escapeHtml(b.purpose || '—');
      const statusText = escapeHtml(b.status || '—');

      return `
        <tr>
          <td><strong style="color:var(--navy); cursor:pointer;" onclick="viewBookingDetails('${b.id}')">${ref}</strong></td>
          <td>${name}</td>
          <td><span class="user-badge ${typeClass}">${userType}</span></td>
          <td>${locationText}</td>
          <td>${dateTime}</td>
          <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${purpose}">${purpose}</td>
          <td><span class="status-badge ${statusClass}"><span class="status-dot"></span> ${statusText}</span></td>
          <td>
            ${showActions ? `
              <div class="table-actions">
                <button class="action-btn approve" onclick="approveBooking('${b.id}')">Approve</button>
                <button class="action-btn reject" onclick="rejectBooking('${b.id}')">Reject</button>
              </div>
            ` : `<div class="table-actions">
                <button class="action-btn reject" onclick="deleteBooking('${b.id}')" title="Delete booking">Delete</button>
              </div>`}
          </td>
        </tr>
      `;
    }).join('');
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
    const templateId = status === 'Approved'
      ? EMAILJS_TEMPLATE_APPROVE
      : EMAILJS_TEMPLATE_REJECT;

    // Only send if EmailJS is configured
    if (!EMAILJS_SERVICE_ID || EMAILJS_SERVICE_ID.startsWith('YOUR_')) {
      console.log('EmailJS not configured — skipping email send. Booking data:', bookingData);
      return;
    }

    try {
      emailjs.send(EMAILJS_SERVICE_ID, templateId, {
        to_email:     bookingData.email,
        to_name:      bookingData.name,
        facility:     getBookingLocation(bookingData),
        vehicle:      formatVehicleList(bookingData.vehicle),
        date:         bookingData.date,
        start_time:   bookingData.startTime,
        end_time:     bookingData.endTime,
        purpose:      bookingData.purpose,
        status:       status,
        reference_id: bookingData.referenceId || '—',
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
  window.viewBookingDetails = function (docId) {
    const booking = allBookings.find(b => b.id === docId);
    if (!booking) return;

    currentModalDocId = docId;

    const rows = [
      ['Reference',    booking.referenceId || '—'],
      ['Requester',    booking.name || '—'],
      ['Type',         booking.userType || '—'],
      ['Email',        booking.email || '—'],
      ['Facility',     booking.facility || '—'],
      ['Vehicle',      formatVehicleList(booking.vehicle) || '—'],
      ['Date',         booking.date || '—'],
      ['Time',         `${booking.startTime || '—'} – ${booking.endTime || '—'}`],
      ['Purpose',      booking.purpose || '—'],
      ['Equipment',    (booking.equipment && booking.equipment.length) ? booking.equipment.join(', ') : 'None'],
      ['Status',       booking.status || '—'],
    ];

    // Internal-specific fields
    if (booking.userType === 'Internal') {
      rows.splice(3, 0, ['Department', booking.department || '—']);
      rows.splice(4, 0, ['Employee ID', booking.employeeId || '—']);
    }

    // External-specific fields
    if (booking.userType === 'External') {
      rows.splice(3, 0, ['Contact', booking.contactNumber || '—']);
      rows.splice(4, 0, ['Address', booking.address || '—']);
    }

    let html = rows.map(([label, value]) =>
      `<div class="detail-row"><span class="detail-label">${escapeHtml(label)}</span><span class="detail-value">${escapeHtml(value)}</span></div>`
    ).join('');

    // Show GCash receipt for external bookings
    if (booking.userType === 'External') {
      const receiptUrl = sanitizeUrl(booking.gcashReceipt);
      if (receiptUrl) {
        html += `
          <div class="gcash-receipt-section">
            <div class="gcash-receipt-header">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#007DFE"/><text x="12" y="16" text-anchor="middle" font-size="9" font-weight="bold" fill="white">G</text></svg>
              <span>GCash Payment Receipt</span>
            </div>
            <div class="gcash-receipt-img-wrapper">
              <img src="${receiptUrl}" alt="GCash Receipt" class="gcash-receipt-img" onclick="window.open(this.src, '_blank')">
            </div>
            <a href="${receiptUrl}" target="_blank" class="gcash-view-full-btn">View Full Receipt</a>
          </div>`;
      } else {
        html += `
          <div class="gcash-receipt-section no-receipt">
            <div class="gcash-receipt-header">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#007DFE"/><text x="12" y="16" text-anchor="middle" font-size="9" font-weight="bold" fill="white">G</text></svg>
              <span>GCash Payment Receipt</span>
            </div>
            <p class="gcash-no-receipt-text">No receipt was uploaded for this booking.</p>
          </div>`;
      }
    }

    detailsContent.innerHTML = html;

    // Toggle action buttons
    const approveBtn = document.getElementById('modalApproveBtn');
    const rejectBtn  = document.getElementById('modalRejectBtn');

    if (booking.status === 'Pending') {
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

  // Close on overlay click
  if (detailsModal) {
    detailsModal.addEventListener('click', (e) => {
      if (e.target === detailsModal) closeDetailsModal();
    });
  }

  // ============================================================
  // TOAST NOTIFICATION
  // ============================================================
  function showToast(type, title, message) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    toast.innerHTML = `
      <div class="toast-body">
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(message)}</p>
      </div>
      <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

    toastContainer.appendChild(toast);

    // Auto-remove after 5s
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.animation = 'fadeIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
      }
    }, 5000);
  }

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
  // VIEW SWITCHING (Dashboard vs Facilities)
  // ============================================================
  const bookingsView     = document.querySelector('.dashboard-topbar')?.parentElement ? null : null;
  const facilitiesSection = document.getElementById('facilitiesSection');
  const vehiclesSection   = document.getElementById('vehiclesSection');
  const sidebarFacilities = document.getElementById('sidebarFacilities');
  const sidebarVehicles   = document.getElementById('sidebarVehicles');
  let currentView = 'bookings'; // 'bookings', 'facilities', or 'vehicles'

  // Elements that belong to bookings view
  const bookingsViewElements = [
    document.querySelector('.dashboard-topbar'),
    document.querySelector('.stats-grid'),
    document.getElementById('filterTabs'),
    document.querySelector('.table-card')
  ].filter(Boolean);

  function switchView(view) {
    currentView = view;

    // Hide all sections first
    bookingsViewElements.forEach(el => el.style.display = 'none');
    if (facilitiesSection) facilitiesSection.style.display = 'none';
    if (vehiclesSection) vehiclesSection.style.display = 'none';
    
    // Remove active state from sidebar links
    sidebarLinks.forEach(l => l.classList.remove('active'));
    if (sidebarFacilities) sidebarFacilities.classList.remove('active');
    if (sidebarVehicles) sidebarVehicles.classList.remove('active');

    if (view === 'facilities') {
      if (facilitiesSection) facilitiesSection.style.display = 'block';
      if (sidebarFacilities) sidebarFacilities.classList.add('active');
    } else if (view === 'vehicles') {
      if (vehiclesSection) vehiclesSection.style.display = 'block';
      if (sidebarVehicles) sidebarVehicles.classList.add('active');
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

  // When booking filter sidebar links are clicked, switch back to bookings view
  sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (currentView === 'facilities' || currentView === 'vehicles') {
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
      btn.textContent = 'Remove';
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
  window.editFacility = function (docId) {
    const facility = allFacilities.find(f => f.id === docId);
    if (!facility) return;

    editingFacilityId = docId;
    if (facilityModalTitle) facilityModalTitle.textContent = 'Edit Facility';

    document.getElementById('facName').value        = facility.name || '';
    document.getElementById('facDescription').value = facility.description || '';
    document.getElementById('facCapacity').value    = facility.capacity || '';
    document.getElementById('facStatus').value      = facility.status || 'Active';

    // Populate amenities and images
    currentAmenities = [...(facility.amenities || [])];
    currentImages    = [...(facility.images || [])];
    renderAmenityTags();
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
          images: [...currentImages],
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (editingFacilityId) {
          // Update existing
          await db.collection('facilities').doc(editingFacilityId).update(data);
          showToast('success', 'Facility Updated', `"${name}" has been updated successfully.`);
        } else {
          // Add new — set order to last
          data.order = allFacilities.length;
          data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          await db.collection('facilities').add(data);
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

})();
