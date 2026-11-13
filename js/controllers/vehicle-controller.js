/* ============================================================
   Vehicle Controller — San Isidro College Reservation System
   Controller Layer (js/controllers/vehicle-controller.js)
   Manages Vehicle CRUD and Driver CRUD on dashboard.html.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'VehicleController';

  let allVehicles       = [];
  let editingVehicleId  = null;
  let deletingVehicleId = null;
  let onVehiclesChange  = null;

  let allDrivers        = [];
  let editingDriverId   = null;
  let deletingDriverId  = null;

  const vehicleModal              = document.getElementById('vehicleModal');
  const vehicleForm               = document.getElementById('vehicleForm');
  const vehicleModalTitle         = document.getElementById('vehicleModalTitle');
  const addVehicleBtn             = document.getElementById('addVehicleBtn');
  const deleteVehicleConfirmModal = document.getElementById('deleteVehicleConfirmModal');
  const deleteVehicleName         = document.getElementById('deleteVehicleName');
  const confirmDeleteVehicleBtn   = document.getElementById('confirmDeleteVehicleBtn');

  const driverModal               = document.getElementById('driverModal');
  const driverForm                = document.getElementById('driverForm');
  const driverModalTitle          = document.getElementById('driverModalTitle');
  const addDriverBtn              = document.getElementById('addDriverBtn');
  const deleteDriverConfirmModal  = document.getElementById('deleteDriverConfirmModal');
  const deleteDriverName          = document.getElementById('deleteDriverName');
  const confirmDeleteDriverBtn    = document.getElementById('confirmDeleteDriverBtn');
  const drvPhoneInput             = document.getElementById('drvPhone');

  if (drvPhoneInput && window.Utils && typeof Utils.stripNonDigitsInput === 'function') {
    Utils.stripNonDigitsInput(drvPhoneInput);
  }

  function startListening(onChangeCallback) {
    if (typeof onChangeCallback === 'function') onVehiclesChange = onChangeCallback;
    VehicleModel.listenAll((vehicles) => {
      allVehicles = vehicles;
      window._allVehicles = allVehicles;
      if (typeof onVehiclesChange === 'function') onVehiclesChange(allVehicles);
      AdminCrudView.renderVehiclesTable(allVehicles);
    });

    if (window.DriverModel) {
      DriverModel.listenAll((drivers) => {
        allDrivers = drivers;
        window._allDrivers = allDrivers;
        AdminCrudView.renderDriversTable(allDrivers);
      });
    }
  }

  window.listenVehicles = startListening;

  // ---- Vehicle Add / Edit / Save / Delete ----
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
    document.getElementById('vehStatus').value      = vehicle.status || 'Active';

    if (vehicleModal) vehicleModal.classList.add('visible');
  };

  if (vehicleForm) {
    vehicleForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name        = document.getElementById('vehName').value.trim();
      const description = document.getElementById('vehDescription').value.trim();
      const capacity    = document.getElementById('vehCapacity').value.trim();
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
          { name, description, capacity, status },
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
        UiView.showToast('error', 'error', errorMessage);
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

  // ---- Driver Add / Edit / Save / Delete ----
  if (addDriverBtn) {
    addDriverBtn.addEventListener('click', () => {
      editingDriverId = null;
      if (driverModalTitle) driverModalTitle.textContent = 'Add Driver';
      if (driverForm) driverForm.reset();
      if (driverModal) driverModal.classList.add('visible');
    });
  }

  window.editDriver = function (docId) {
    const drv = allDrivers.find(d => d.id === docId);
    if (!drv) return;

    editingDriverId = docId;
    if (driverModalTitle) driverModalTitle.textContent = 'Edit Driver';

    document.getElementById('drvName').value   = drv.name || '';
    document.getElementById('drvPhone').value  = drv.phone || '';
    document.getElementById('drvStatus').value = drv.status || 'Active';

    if (driverModal) driverModal.classList.add('visible');
  };

  if (driverForm) {
    driverForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name   = document.getElementById('drvName').value.trim();
      const phone  = document.getElementById('drvPhone').value.trim();
      const status = document.getElementById('drvStatus').value;

      if (!name) {
        alert('Please enter the driver\'s full name.');
        return;
      }
      if (!phone) {
        alert('Please enter the driver\'s phone number.');
        return;
      }

      const submitBtn = document.getElementById('driverSubmitBtn');
      submitBtn.innerHTML = '<span class="spinner"></span> Saving...';
      submitBtn.classList.add('loading');

      try {
        const wasEditing = Boolean(editingDriverId);
        await DriverModel.save(
          editingDriverId,
          { name, phone, status },
          allDrivers.length
        );

        UiView.showToast(
          'success',
          wasEditing ? 'Driver Updated' : 'Driver Added',
          `"${name}" has been ${wasEditing ? 'updated' : 'added'} successfully.`
        );
        window.closeDriverModal();
      } catch (err) {
        Logger.error(LAYER, 'Driver save error:', err);
        UiView.showToast('error', 'Error', 'Failed to save driver. Please try again.');
      } finally {
        submitBtn.innerHTML = 'Save Driver';
        submitBtn.classList.remove('loading');
      }
    });
  }

  window.deleteDriver = function (docId) {
    const drv = allDrivers.find(d => d.id === docId);
    if (!drv) return;

    deletingDriverId = docId;
    if (deleteDriverName) deleteDriverName.textContent = `"${drv.name}"`;
    if (deleteDriverConfirmModal) deleteDriverConfirmModal.classList.add('visible');
  };

  if (confirmDeleteDriverBtn) {
    confirmDeleteDriverBtn.addEventListener('click', async () => {
      if (!deletingDriverId) return;

      try {
        const drv = allDrivers.find(d => d.id === deletingDriverId);
        await DriverModel.remove(deletingDriverId);
        UiView.showToast('warning', 'Driver Deleted', `"${drv?.name || 'Driver'}" has been removed.`);
        window.closeDeleteDriverModal();
      } catch (err) {
        Logger.error(LAYER, 'Delete driver error:', err);
        UiView.showToast('error', 'Error', 'Failed to delete driver.');
      }
    });
  }

  window.closeDriverModal = function () {
    if (driverModal) driverModal.classList.remove('visible');
    editingDriverId = null;
  };

  window.closeDeleteDriverModal = function () {
    if (deleteDriverConfirmModal) deleteDriverConfirmModal.classList.remove('visible');
    deletingDriverId = null;
  };

  [vehicleModal, deleteVehicleConfirmModal, driverModal, deleteDriverConfirmModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          if (modal === vehicleModal) window.closeVehicleModal();
          else if (modal === deleteVehicleConfirmModal) window.closeDeleteVehicleModal();
          else if (modal === driverModal) window.closeDriverModal();
          else if (modal === deleteDriverConfirmModal) window.closeDeleteDriverModal();
        }
      });
    }
  });

  window.VehicleController = {
    startListening,
    getAll: () => allVehicles,
    getAllDrivers: () => allDrivers
  };
})();
