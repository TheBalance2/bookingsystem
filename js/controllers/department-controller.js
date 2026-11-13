/* ============================================================
   Department Controller — San Isidro College Reservation System
   Controller Layer (js/controllers/department-controller.js)
   Manages Internal Department & Office/School CRUD (with Dean /
   Principal / Office Head names) on dashboard.html.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'DepartmentController';

  let allDepartments       = [];
  let editingDepartmentId  = null;
  let deletingDepartmentId = null;
  let selectedCategory     = 'all';
  let onDepartmentsChange  = null;

  const departmentModal              = document.getElementById('departmentModal');
  const departmentForm               = document.getElementById('departmentForm');
  const departmentModalTitle         = document.getElementById('departmentModalTitle');
  const addDepartmentBtn             = document.getElementById('addDepartmentBtn');
  const deptCategoryFilter           = document.getElementById('deptCategoryFilter');
  const deleteDepartmentConfirmModal = document.getElementById('deleteDepartmentConfirmModal');
  const deleteDepartmentName         = document.getElementById('deleteDepartmentName');
  const confirmDeleteDepartmentBtn   = document.getElementById('confirmDeleteDepartmentBtn');

  function startListening(onChangeCallback) {
    if (typeof onChangeCallback === 'function') onDepartmentsChange = onChangeCallback;
    if (!window.DepartmentModel) return;

    DepartmentModel.listenAll((departments) => {
      allDepartments = departments;
      window._allDepartments = allDepartments;
      if (typeof onDepartmentsChange === 'function') onDepartmentsChange(allDepartments);
      AdminCrudView.renderDepartmentsTable(allDepartments, selectedCategory);
    });
  }

  window.listenDepartments = startListening;

  if (deptCategoryFilter) {
    deptCategoryFilter.addEventListener('change', () => {
      selectedCategory = deptCategoryFilter.value || 'all';
      AdminCrudView.renderDepartmentsTable(allDepartments, selectedCategory);
    });
  }

  if (addDepartmentBtn) {
    addDepartmentBtn.addEventListener('click', () => {
      editingDepartmentId = null;
      if (departmentModalTitle) departmentModalTitle.textContent = 'Add Office / School';
      if (departmentForm) departmentForm.reset();

      const catSelect = document.getElementById('deptCategory');
      if (catSelect && selectedCategory && selectedCategory !== 'all') {
        catSelect.value = selectedCategory;
      }

      if (departmentModal) departmentModal.classList.add('visible');
    });
  }

  window.editDepartment = function (docId) {
    const dept = allDepartments.find(d => d.id === docId);
    if (!dept) return;

    editingDepartmentId = docId;
    if (departmentModalTitle) departmentModalTitle.textContent = 'Edit Office / School';

    const catEl    = document.getElementById('deptCategory');
    const nameEl   = document.getElementById('deptName');
    const headEl   = document.getElementById('deptHeadName');
    const statusEl = document.getElementById('deptStatus');

    if (catEl)    catEl.value    = dept.category || 'College';
    if (nameEl)   nameEl.value   = dept.name || '';
    if (headEl)   headEl.value   = dept.headName || '';
    if (statusEl) statusEl.value = dept.status || 'Active';

    if (departmentModal) departmentModal.classList.add('visible');
  };

  if (departmentForm) {
    departmentForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const category = document.getElementById('deptCategory').value || 'College';
      const name     = document.getElementById('deptName').value.trim();
      const headName = document.getElementById('deptHeadName').value.trim();
      const status   = document.getElementById('deptStatus').value || 'Active';

      if (!name) {
        alert('Please enter the Office or School name.');
        return;
      }

      const submitBtn = document.getElementById('departmentSubmitBtn');
      submitBtn.innerHTML = '<span class="spinner"></span> Saving...';
      submitBtn.classList.add('loading');

      try {
        const wasEditing = Boolean(editingDepartmentId);
        await DepartmentModel.save(
          editingDepartmentId,
          { category, name, headName, status },
          allDepartments.length
        );

        UiView.showToast(
          'success',
          wasEditing ? 'Office / School Updated' : 'Office / School Added',
          `"${name}" (${category}) has been ${wasEditing ? 'updated' : 'added'} successfully.`
        );
        window.closeDepartmentModal();
      } catch (err) {
        Logger.error(LAYER, 'Department save error:', err);
        UiView.showToast('error', 'Error', 'Failed to save office / school. Please try again.');
      } finally {
        submitBtn.innerHTML = 'Save Office / School';
        submitBtn.classList.remove('loading');
      }
    });
  }

  window.deleteDepartment = function (docId) {
    const dept = allDepartments.find(d => d.id === docId);
    if (!dept) return;

    deletingDepartmentId = docId;
    if (deleteDepartmentName) deleteDepartmentName.textContent = `"${dept.name}" (${dept.category})`;
    if (deleteDepartmentConfirmModal) deleteDepartmentConfirmModal.classList.add('visible');
  };

  if (confirmDeleteDepartmentBtn) {
    confirmDeleteDepartmentBtn.addEventListener('click', async () => {
      if (!deletingDepartmentId) return;

      try {
        const dept = allDepartments.find(d => d.id === deletingDepartmentId);
        await DepartmentModel.remove(deletingDepartmentId);
        UiView.showToast('warning', 'Office / School Deleted', `"${dept?.name || 'Office / School'}" has been removed.`);
        window.closeDeleteDepartmentModal();
      } catch (err) {
        Logger.error(LAYER, 'Delete department error:', err);
        UiView.showToast('error', 'Error', 'Failed to delete office / school.');
      }
    });
  }

  window.closeDepartmentModal = function () {
    if (departmentModal) departmentModal.classList.remove('visible');
    editingDepartmentId = null;
  };

  window.closeDeleteDepartmentModal = function () {
    if (deleteDepartmentConfirmModal) deleteDepartmentConfirmModal.classList.remove('visible');
    deletingDepartmentId = null;
  };

  [departmentModal, deleteDepartmentConfirmModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          if (modal === departmentModal) window.closeDepartmentModal();
          else if (modal === deleteDepartmentConfirmModal) window.closeDeleteDepartmentModal();
        }
      });
    }
  });

  window.DepartmentController = {
    startListening,
    getAll: () => allDepartments
  };
})();
