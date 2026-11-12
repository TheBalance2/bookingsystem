/* ============================================================
   Admin CRUD View — San Isidro College Reservation System
   View Layer (js/views/admin-crud-view.js)
   Renders Facilities and Vehicles tables, amenity tag chips, and
   facility image upload previews on dashboard.html.
   Never calls Firestore.
   ============================================================ */

(function () {
  'use strict';

  function renderFacilitiesTable(allFacilities) {
    const facilitiesTableBody  = document.getElementById('facilitiesTableBody');
    const facilitiesEmptyState = document.getElementById('facilitiesEmptyState');
    if (!facilitiesTableBody) return;

    if (!allFacilities || allFacilities.length === 0) {
      facilitiesTableBody.innerHTML = '';
      if (facilitiesEmptyState) facilitiesEmptyState.style.display = 'block';
      return;
    }

    if (facilitiesEmptyState) facilitiesEmptyState.style.display = 'none';

    facilitiesTableBody.innerHTML = allFacilities.map(f => {
      const statusClass = f.status === 'Active' ? 'approved' :
                          f.status === 'Inactive' ? 'rejected' : 'pending';
      const name   = Utils.escapeHtml(f.name || '—');
      const desc   = Utils.escapeHtml(f.description || '—');
      const cap    = Utils.escapeHtml(f.capacity || '—');
      const status = Utils.escapeHtml(f.status || 'Active');

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

  function renderAmenityTags(amenitiesWrapper, amenityInput, currentAmenities) {
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

  function renderImagePreviews(facImagesPreview, currentImages) {
    if (!facImagesPreview) return;
    facImagesPreview.innerHTML = '';
    currentImages.forEach((src, i) => {
      const safeSrc = Utils.sanitizeUrl(src);
      const item = document.createElement('div');
      item.className = 'fac-img-preview-item';
      const img = document.createElement('img');
      img.src = safeSrc;
      img.alt = `Photo ${i + 1}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'remove-img';
      btn.dataset.index = String(i);
      btn.innerHTML = '&times;';

      item.appendChild(img);
      item.appendChild(btn);
      facImagesPreview.appendChild(item);
    });
  }

  function renderVehiclesTable(allVehicles) {
    const vehiclesTableBody  = document.getElementById('vehiclesTableBody');
    const vehiclesEmptyState = document.getElementById('vehiclesEmptyState');
    if (!vehiclesTableBody) return;

    if (!allVehicles || allVehicles.length === 0) {
      vehiclesTableBody.innerHTML = '';
      if (vehiclesEmptyState) vehiclesEmptyState.style.display = 'block';
      return;
    }

    if (vehiclesEmptyState) vehiclesEmptyState.style.display = 'none';

    vehiclesTableBody.innerHTML = allVehicles.map(v => {
      const statusClass = v.status === 'Active' ? 'approved' :
                          v.status === 'Inactive' ? 'rejected' : 'pending';
      const name   = Utils.escapeHtml(v.name || '—');
      const desc   = Utils.escapeHtml(v.description || '—');
      const cap    = Utils.escapeHtml(v.capacity || '—');
      const driver = Utils.escapeHtml(v.driver || '—');
      const status = Utils.escapeHtml(v.status || 'Active');

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

  window.AdminCrudView = {
    renderFacilitiesTable,
    renderAmenityTags,
    renderImagePreviews,
    renderVehiclesTable
  };
})();

