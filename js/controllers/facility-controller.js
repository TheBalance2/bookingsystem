/* ============================================================
   Facility Controller — San Isidro College Reservation System
   Controller Layer (js/controllers/facility-controller.js)
   Manages Facility CRUD, amenity tag input, and facility photo
   uploads on dashboard.html.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'FacilityController';

  let allFacilities      = [];
  let editingFacilityId  = null;
  let deletingFacilityId = null;
  let currentAmenities   = [];
  let currentImages      = [];
  let onFacilitiesChange = null;

  const facilityModal      = document.getElementById('facilityModal');
  const facilityForm       = document.getElementById('facilityForm');
  const facilityModalTitle = document.getElementById('facilityModalTitle');
  const addFacilityBtn     = document.getElementById('addFacilityBtn');
  const deleteConfirmModal = document.getElementById('deleteConfirmModal');
  const deleteFacilityName = document.getElementById('deleteFacilityName');
  const confirmDeleteBtn   = document.getElementById('confirmDeleteBtn');
  const amenityInput       = document.getElementById('amenityInput');
  const amenitiesWrapper   = document.getElementById('amenitiesWrapper');
  const facImageFileInput  = document.getElementById('facImageFileInput');
  const facImagesPreview   = document.getElementById('facImagesPreview');
  const facImagesUpload    = document.getElementById('facImagesUpload');

  function refreshAmenityTags() {
    AdminCrudView.renderAmenityTags(amenitiesWrapper, amenityInput, currentAmenities);
  }

  function refreshImagePreviews() {
    AdminCrudView.renderImagePreviews(facImagesPreview, currentImages);
  }

  function startListening(onChangeCallback) {
    onFacilitiesChange = onChangeCallback;
    FacilityModel.listenAll((facilities) => {
      allFacilities = facilities;
      window._allFacilities = allFacilities;
      if (typeof onFacilitiesChange === 'function') onFacilitiesChange(allFacilities);
      AdminCrudView.renderFacilitiesTable(allFacilities);
    });
  }

  // ---- Amenities Tag Input ----
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
          refreshAmenityTags();
        }
        amenityInput.value = '';
      }
      if (e.key === 'Backspace' && amenityInput.value === '' && currentAmenities.length > 0) {
        currentAmenities.pop();
        refreshAmenityTags();
      }
    });
  }

  if (amenitiesWrapper) {
    amenitiesWrapper.addEventListener('click', (e) => {
      const rm = e.target.closest('.remove-amenity');
      if (rm) {
        const idx = parseInt(rm.dataset.index, 10);
        currentAmenities.splice(idx, 1);
        refreshAmenityTags();
      }
      if (amenityInput) amenityInput.focus();
    });
  }

  // ---- Image Upload & Compression ----
  function compressAndAddImage(file) {
    if (currentImages.length >= 5) {
      alert('Maximum 5 images allowed per facility.');
      return;
    }
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
          canvas.width  = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const compressed = canvas.toDataURL('image/jpeg', 0.7);
          currentImages.push(compressed);
          refreshImagePreviews();
        } catch (err) {
          Logger.error(LAYER, 'Canvas compression failed:', err);
          alert('Failed to process image. Please try a different photo.');
        }
      };
      img.onerror = () => {
        alert(`Failed to load "${file.name}". Please ensure it is a valid image file.`);
      };
      img.src = e.target.result;
    };
    reader.onerror = () => {
      alert('Failed to read the file.');
    };
    reader.readAsDataURL(file);
  }

  if (facImageFileInput) {
    facImageFileInput.addEventListener('change', (e) => {
      Array.from(e.target.files).forEach(compressAndAddImage);
      facImageFileInput.value = '';
    });
  }

  if (facImagesPreview) {
    facImagesPreview.addEventListener('click', (e) => {
      const rm = e.target.closest('.remove-img');
      if (rm) {
        const idx = parseInt(rm.dataset.index, 10);
        currentImages.splice(idx, 1);
        refreshImagePreviews();
      }
    });
  }

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

  // ---- Add / Edit / Save / Delete ----
  if (addFacilityBtn) {
    addFacilityBtn.addEventListener('click', () => {
      editingFacilityId = null;
      currentAmenities  = [];
      currentImages     = [];
      if (facilityModalTitle) facilityModalTitle.textContent = 'Add Facility';
      if (facilityForm) facilityForm.reset();
      refreshAmenityTags();
      refreshImagePreviews();
      if (facilityModal) facilityModal.classList.add('visible');
    });
  }

  window.editFacility = async function (docId) {
    const facility = allFacilities.find(f => f.id === docId);
    if (!facility) return;

    editingFacilityId = docId;
    if (facilityModalTitle) facilityModalTitle.textContent = 'Edit Facility';

    document.getElementById('facName').value        = facility.name || '';
    document.getElementById('facDescription').value = facility.description || '';
    document.getElementById('facCapacity').value    = facility.capacity || '';
    document.getElementById('facStatus').value      = facility.status || 'Active';

    currentAmenities = [...(facility.amenities || [])];
    refreshAmenityTags();

    currentImages = await FacilityModel.getImages(docId, facility.images || []);
    refreshImagePreviews();

    if (facilityModal) facilityModal.classList.add('visible');
  };

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
        refreshAmenityTags();
      }

      const submitBtn = document.getElementById('facilitySubmitBtn');
      submitBtn.innerHTML = '<span class="spinner"></span> Saving...';
      submitBtn.classList.add('loading');

      try {
        const wasEditing = Boolean(editingFacilityId);
        await FacilityModel.save(
          editingFacilityId,
          { name, description, capacity, status, amenities: [...currentAmenities] },
          [...currentImages],
          allFacilities.length
        );

        UiView.showToast(
          'success',
          wasEditing ? 'Facility Updated' : 'Facility Added',
          `"${name}" has been ${wasEditing ? 'updated' : 'added'} successfully.`
        );
        window.closeFacilityModal();
      } catch (err) {
        Logger.error(LAYER, 'Facility save error:', err);
        UiView.showToast('error', 'Error', 'Failed to save facility. Please try again.');
      } finally {
        submitBtn.innerHTML = 'Save Facility';
        submitBtn.classList.remove('loading');
      }
    });
  }

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
        await FacilityModel.remove(deletingFacilityId);
        UiView.showToast('warning', 'Facility Deleted', `"${facility?.name || 'Facility'}" has been removed.`);
        window.closeDeleteModal();
      } catch (err) {
        Logger.error(LAYER, 'Delete facility error:', err);
        UiView.showToast('error', 'Error', 'Failed to delete facility.');
      }
    });
  }

  window.closeFacilityModal = function () {
    if (facilityModal) facilityModal.classList.remove('visible');
    editingFacilityId = null;
    currentAmenities  = [];
    currentImages     = [];
    refreshAmenityTags();
    refreshImagePreviews();
  };

  window.closeDeleteModal = function () {
    if (deleteConfirmModal) deleteConfirmModal.classList.remove('visible');
    deletingFacilityId = null;
  };

  [facilityModal, deleteConfirmModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          if (modal === facilityModal) window.closeFacilityModal();
          else window.closeDeleteModal();
        }
      });
    }
  });

  window.FacilityController = {
    startListening,
    getAll: () => allFacilities
  };
})();

