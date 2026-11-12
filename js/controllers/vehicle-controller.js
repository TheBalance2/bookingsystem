/* ============================================================
   Vehicle Controller — San Isidro College Reservation System
   Controller Layer (js/controllers/vehicle-controller.js)
   Manages Vehicle & Driver CRUD on dashboard.html.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'VehicleController';

  let allVehicles       = [];
  let editingVehicleId  = null;
  let deletingVehicleId = null;
  let onVehiclesChange  = null;

  const vehicleModal              = document.getElementById('vehicleModal');
  const vehicleForm               = document.getElementById('vehicleForm');
  const vehicleModalTitle         = document.getElementById('vehicleModalTitle');
  const addVehicleBtn             = document.getElementById('addVehicleBtn');
  const deleteVehicleConfirmModal = document.getElementById('deleteVehicleConfirmModal');
  const deleteVehicleName         = document.getElementById('deleteVehicleName');
  const confirmDeleteVehicleBtn   = document.getElementById('confirmDeleteVehicleBtn');

  function startListening(onChangeCallback) {
    if (typeof onChangeCallback === 'function') onVehiclesChange = onChangeCallback;
    VehicleModel.listenAll((vehicles) => {
      allVehicles = vehicles;
      window._allVehicles = allVehicles;
      if (typeof onVehiclesChange === 'function') onVehiclesChange(allVehicles);
      AdminCrudView.renderVehiclesTable(allVehicles);
    });
  }

  window.listenVehicles = startListening;

  if (addVehicleBtn) {
    addVehicleBtn.addEventListener('click', () => {
      editingVehicleId = null;
      if (vehicleModalTitle) vehicleModalTitle.textContent = 'Add Vehicle';
      if (vehicleForm) vehicleForm.reset();
      if (vehicleModal) vehicleModal.classList.add('visible');
    });
  }

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
        const wasEditing = Boolean(editingVehicleId);
        await VehicleModel.save(
          editingVehicleId,
          { name, description, capacity, driver, status },
          allVehicles.length
        );

        UiView.showToast(
          'success',
          wasEditing ? 'Vehicle Updated' : 'Vehicle Added',
          `"${name}" has been ${wasEditing ? 'updated' : 'added'} successfully.`
        );
        window.closeVehicleModal();
      } catch (err) {
        Logger.error(LAYER, 'Vehicle save error:', err);
        const errorMessage = err?.message
          ? `Failed to save vehicle: ${err.message}`
          : 'Failed to save vehicle. Please try again.';
        UiView.showToast('error', 'Error', errorMessage);
      } finally {
        submitBtn.innerHTML = 'Save Vehicle';
        submitBtn.classList.remove('loading');
      }
    });
  }

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
        await VehicleModel.remove(deletingVehicleId);
        UiView.showToast('warning', 'Vehicle Deleted', `"${vehicle?.name || 'Vehicle'}" has been removed.`);
        window.closeDeleteVehicleModal();
      } catch (err) {
        Logger.error(LAYER, 'Delete vehicle error:', err);
        UiView.showToast('error', 'Error', 'Failed to delete vehicle.');
      }
    });
  }

  window.closeVehicleModal = function () {
    if (vehicleModal) vehicleModal.classList.remove('visible');
    editingVehicleId = null;
  };

  window.closeDeleteVehicleModal = function () {
    if (deleteVehicleConfirmModal) deleteVehicleConfirmModal.classList.remove('visible');
    deletingVehicleId = null;
  };

  [vehicleModal, deleteVehicleConfirmModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          if (modal === vehicleModal) window.closeVehicleModal();
          else window.closeDeleteVehicleModal();
        }
      });
    }
  });

  window.VehicleController = {
    startListening,
    getAll: () => allVehicles
  };
})();

