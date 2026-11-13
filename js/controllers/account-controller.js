/* ============================================================
   Account Controller — San Isidro College Reservation System
   Controller Layer (js/controllers/account-controller.js)
   Handles True Admin CRUD for Facility-In-Charge accounts:
   creating new Auth+Firestore accounts via secondary Firebase app,
   registering existing Firebase Auth logins, editing details,
   activating/deactivating, sending password reset emails,
   viewing user activity logs, and soft-deleting profiles.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'AccountController';

  let allUsers         = [];
  let unsubscribeUsers = null;
  let editingUid       = null;
  let deletingUid      = null;

  const accountsTableBody         = document.getElementById('accountsTableBody');
  const accountsEmptyState        = document.getElementById('accountsEmptyState');
  const addAccountBtn             = document.getElementById('addAccountBtn');
  const registerExistingLoginBtn  = document.getElementById('registerExistingLoginBtn');

  // Create / Edit Modal
  const accountModal              = document.getElementById('accountModal');
  const accountModalTitle         = document.getElementById('accountModalTitle');
  const accountForm               = document.getElementById('accountForm');
  const accFullNameInput          = document.getElementById('accFullName');
  const accEmailInput             = document.getElementById('accEmail');
  const accContactInput           = document.getElementById('accContact');
  const accPositionInput          = document.getElementById('accPosition');
  const accStatusSelect           = document.getElementById('accStatus');
  const accPasswordGroup          = document.getElementById('accPasswordGroup');
  const accPasswordInput          = document.getElementById('accPassword');
  const accPasswordConfirmInput   = document.getElementById('accPasswordConfirm');
  const toggleAccPasswordBtn      = document.getElementById('toggleAccPasswordBtn');
  const accountSubmitBtn          = document.getElementById('accountSubmitBtn');

  // Register Existing Login Modal
  const registerExistingModal     = document.getElementById('registerExistingModal');
  const registerExistingForm      = document.getElementById('registerExistingForm');
  const regUidInput               = document.getElementById('regUid');
  const regEmailInput             = document.getElementById('regEmail');
  const regFullNameInput          = document.getElementById('regFullName');
  const regContactInput           = document.getElementById('regContact');
  const regPositionInput          = document.getElementById('regPosition');
  const regRoleSelect             = document.getElementById('regRole');
  const regStatusSelect           = document.getElementById('regStatus');
  const registerExistingSubmitBtn = document.getElementById('registerExistingSubmitBtn');

  // Delete Account Modal
  const deleteAccountConfirmModal = document.getElementById('deleteAccountConfirmModal');
  const deleteAccountNameEl       = document.getElementById('deleteAccountName');
  const confirmDeleteAccountBtn   = document.getElementById('confirmDeleteAccountBtn');

  if (accContactInput && window.Utils && typeof Utils.stripNonDigitsInput === 'function') {
    Utils.stripNonDigitsInput(accContactInput);
  }
  if (regContactInput && window.Utils && typeof Utils.stripNonDigitsInput === 'function') {
    Utils.stripNonDigitsInput(regContactInput);
  }

  if (toggleAccPasswordBtn && accPasswordInput) {
    toggleAccPasswordBtn.addEventListener('click', () => {
      const isPwd = accPasswordInput.type === 'password';
      accPasswordInput.type = isPwd ? 'text' : 'password';
      if (accPasswordConfirmInput) accPasswordConfirmInput.type = isPwd ? 'text' : 'password';
      toggleAccPasswordBtn.textContent = isPwd ? 'Hide' : 'Show';
    });
  }

  function formatTimestamp(ts) {
    if (!ts) return 'Never';
    let ms = 0;
    if (typeof ts.toMillis === 'function') ms = ts.toMillis();
    else if (typeof ts.seconds === 'number') ms = ts.seconds * 1000;
    else ms = new Date(ts).getTime();
    if (!ms || Number.isNaN(ms)) return 'Never';
    return new Date(ms).toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

  function renderAccountsTable() {
    if (!accountsTableBody) return;

    if (!allUsers || allUsers.length === 0) {
      accountsTableBody.innerHTML = '';
      if (accountsEmptyState) accountsEmptyState.style.display = 'block';
      return;
    }

    if (accountsEmptyState) accountsEmptyState.style.display = 'none';
    const currentUid = (window.Session && Session.profile && Session.profile.uid) || '';

    accountsTableBody.innerHTML = allUsers.map(u => {
      const isSelf      = u.uid === currentUid;
      const isAdmin     = u.role === 'admin';
      const statusClass = u.status === 'Active' ? 'approved' : 'rejected';
      const roleBadge   = isAdmin
        ? '<span class="role-badge role-badge-admin">Administrator</span>'
        : '<span class="role-badge role-badge-fic">Facility-In-Charge</span>';
      const fullName    = Utils.escapeHtml(u.fullName || '—');
      const email       = Utils.escapeHtml(u.email || '—');
      const contact     = Utils.escapeHtml(u.contactNumber || '—');
      const position    = Utils.escapeHtml(u.position || '—');
      const statusText  = Utils.escapeHtml(u.status || 'Active');
      const lastLogin   = Utils.escapeHtml(formatTimestamp(u.lastLoginAt));
      const safeUid     = Utils.escapeHtml(u.uid);
      const toggleLabel = u.status === 'Active' ? 'Deactivate' : 'Activate';

      return `
        <tr>
          <td>
            <strong style="color:var(--navy);">${fullName}</strong>
            ${isSelf ? '<span class="user-badge internal" style="margin-left:6px; font-size:0.7rem;">You</span>' : ''}
            <br><small style="color:var(--gray-300); font-family:monospace;">UID: ${safeUid.slice(0, 10)}…</small>
          </td>
          <td>${email}</td>
          <td>${position}<br><small style="color:var(--gray-400);">${contact}</small></td>
          <td>${roleBadge}</td>
          <td><span class="status-badge ${statusClass}"><span class="status-dot"></span> ${statusText}</span></td>
          <td><small style="color:var(--gray-400);">${lastLogin}</small></td>
          <td>
            <div class="table-actions" style="flex-wrap:wrap; gap:6px;">
              <button class="action-btn facility-edit" onclick="editAccount('${safeUid}')" title="Edit Profile">Edit</button>
              <button class="action-btn facility-edit" onclick="sendAccountPasswordReset('${safeUid}')" title="Send Password Reset Email">Reset Pwd</button>
              <button class="action-btn facility-edit" onclick="viewAccountActivity('${safeUid}')" title="View Activity Logs">Logs</button>
              ${!isSelf ? `
                <button class="action-btn ${u.status === 'Active' ? 'reject' : 'approve'}" onclick="toggleAccountStatus('${safeUid}')">${toggleLabel}</button>
                <button class="action-btn reject" onclick="deleteAccount('${safeUid}')" title="Remove Account Access">Delete</button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function startListening(onChanged) {
    if (unsubscribeUsers) {
      unsubscribeUsers();
      unsubscribeUsers = null;
    }
    if (!window.Session || !Session.isAdmin()) return;

    unsubscribeUsers = UserModel.listenAll(users => {
      allUsers = users;
      window._allUsers = allUsers;
      renderAccountsTable();
      if (typeof onChanged === 'function') onChanged(allUsers);
    });
  }

  // ---- Open Create Modal ----
  if (addAccountBtn) {
    addAccountBtn.addEventListener('click', () => {
      if (!Session.requireAdmin('create Facility-In-Charge accounts')) return;
      editingUid = null;
      if (accountModalTitle) accountModalTitle.textContent = 'Add Facility-In-Charge Account';
      if (accountForm) accountForm.reset();
      if (accEmailInput) accEmailInput.disabled = false;
      if (accPasswordGroup) accPasswordGroup.style.display = 'block';
      if (accPasswordInput) accPasswordInput.type = 'password';
      if (accPasswordConfirmInput) accPasswordConfirmInput.type = 'password';
      if (toggleAccPasswordBtn) toggleAccPasswordBtn.textContent = 'Show';
      if (accountSubmitBtn) accountSubmitBtn.textContent = 'Create Account';
      if (accountModal) accountModal.classList.add('visible');
    });
  }

  // ---- Open Edit Modal ----
  window.editAccount = function (uid) {
    if (!Session.requireAdmin('edit accounts')) return;
    const user = allUsers.find(u => u.uid === uid);
    if (!user) return;

    editingUid = uid;
    if (accountModalTitle) accountModalTitle.textContent = 'Edit Account Details';
    if (accFullNameInput) accFullNameInput.value = user.fullName || '';
    if (accEmailInput) {
      accEmailInput.value = user.email || '';
      accEmailInput.disabled = true;
    }
    if (accContactInput)  accContactInput.value  = user.contactNumber || '';
    if (accPositionInput) accPositionInput.value = user.position || '';
    if (accStatusSelect) {
      accStatusSelect.value = user.status || 'Active';
      const currentUid = (Session.profile && Session.profile.uid) || '';
      accStatusSelect.disabled = (uid === currentUid);
    }
    if (accPasswordGroup) accPasswordGroup.style.display = 'none';
    if (accountSubmitBtn) accountSubmitBtn.textContent = 'Save Changes';
    if (accountModal) accountModal.classList.add('visible');
  };

  window.closeAccountModal = function () {
    if (accountModal) accountModal.classList.remove('visible');
    editingUid = null;
  };

  if (accountForm) {
    accountForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!Session.requireAdmin('manage accounts')) return;

      const fullName      = (accFullNameInput ? accFullNameInput.value : '').trim();
      const email         = (accEmailInput ? accEmailInput.value : '').trim().toLowerCase();
      const contactNumber = (accContactInput ? accContactInput.value : '').trim();
      const position      = (accPositionInput ? accPositionInput.value : '').trim();
      const status        = accStatusSelect ? accStatusSelect.value : 'Active';

      if (!fullName) { alert('Please enter the full name.'); return; }
      if (!email || !Utils.isValidEmail(email)) { alert('Please enter a valid email address.'); return; }
      if (!contactNumber) { alert('Please enter a contact number.'); return; }
      if (!position) { alert('Please enter the position or title.'); return; }

      if (!editingUid) {
        const pwd        = accPasswordInput ? accPasswordInput.value : '';
        const pwdConfirm = accPasswordConfirmInput ? accPasswordConfirmInput.value : '';
        if (!pwd || pwd.length < 6) {
          alert('Initial password must be at least 6 characters.');
          return;
        }
        if (pwd !== pwdConfirm) {
          alert('Passwords do not match.');
          return;
        }

        if (accountSubmitBtn) {
          accountSubmitBtn.innerHTML = '<span class="spinner"></span> Creating...';
          accountSubmitBtn.classList.add('loading');
          accountSubmitBtn.disabled = true;
        }

        try {
          const newUid = await AuthModel.createLoginWithSecondaryApp(email, pwd);
          await UserModel.createProfile(newUid, {
            email,
            fullName,
            contactNumber,
            position,
            role: 'facility_incharge',
            status
          });

          if (window.ActivityLogModel) {
            ActivityLogModel.log('ACCOUNT_CREATE', 'Account', {
              targetId:    newUid,
              targetLabel: `${fullName} (${email})`,
              details:     { email, fullName, contactNumber, position, role: 'facility_incharge', status }
            });
          }

          UiView.showToast('success', 'Account Created', `Facility-In-Charge account for "${fullName}" is ready to use.`);
          window.closeAccountModal();
        } catch (err) {
          Logger.error(LAYER, 'Create account error:', err);
          if (err && err.code === 'auth/email-already-in-use') {
            UiView.showToast(
              'warning',
              'Email Already Exists in Firebase Auth',
              'Use "Register Existing Login" and paste this user\'s UID from Firebase Console -> Authentication.'
            );
          } else {
            UiView.showToast('error', 'Failed to Create Account', err?.message || 'Could not create account.');
          }
        } finally {
          if (accountSubmitBtn) {
            accountSubmitBtn.innerHTML = 'Create Account';
            accountSubmitBtn.classList.remove('loading');
            accountSubmitBtn.disabled = false;
          }
        }
      } else {
        if (accountSubmitBtn) {
          accountSubmitBtn.innerHTML = '<span class="spinner"></span> Saving...';
          accountSubmitBtn.classList.add('loading');
          accountSubmitBtn.disabled = true;
        }

        try {
          await UserModel.update(editingUid, { fullName, contactNumber, position, status });
          if (window.ActivityLogModel) {
            ActivityLogModel.log('ACCOUNT_UPDATE', 'Account', {
              targetId:    editingUid,
              targetLabel: `${fullName} (${email})`,
              details:     { fullName, contactNumber, position, status }
            });
          }
          UiView.showToast('success', 'Account Updated', `Changes saved for "${fullName}".`);
          window.closeAccountModal();
        } catch (err) {
          Logger.error(LAYER, 'Update account error:', err);
          UiView.showToast('error', 'Error', 'Failed to update account details.');
        } finally {
          if (accountSubmitBtn) {
            accountSubmitBtn.innerHTML = 'Save Changes';
            accountSubmitBtn.classList.remove('loading');
            accountSubmitBtn.disabled = false;
          }
        }
      }
    });
  }

  // ---- Register Existing Firebase Auth Login ----
  if (registerExistingLoginBtn) {
    registerExistingLoginBtn.addEventListener('click', () => {
      if (!Session.requireAdmin('register existing logins')) return;
      if (registerExistingForm) registerExistingForm.reset();
      if (registerExistingModal) registerExistingModal.classList.add('visible');
    });
  }

  window.closeRegisterExistingModal = function () {
    if (registerExistingModal) registerExistingModal.classList.remove('visible');
  };

  if (registerExistingForm) {
    registerExistingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!Session.requireAdmin('register existing logins')) return;

      const uid           = (regUidInput ? regUidInput.value : '').trim();
      const email         = (regEmailInput ? regEmailInput.value : '').trim().toLowerCase();
      const fullName      = (regFullNameInput ? regFullNameInput.value : '').trim();
      const contactNumber = (regContactInput ? regContactInput.value : '').trim();
      const position      = (regPositionInput ? regPositionInput.value : '').trim();
      const role          = regRoleSelect ? regRoleSelect.value : 'facility_incharge';
      const status        = regStatusSelect ? regStatusSelect.value : 'Active';

      if (!uid)      { alert('Please paste the User UID from Firebase Console -> Authentication.'); return; }
      if (!email || !Utils.isValidEmail(email)) { alert('Please enter a valid email address.'); return; }
      if (!fullName) { alert('Please enter the full name.'); return; }
      if (!contactNumber) { alert('Please enter a contact number.'); return; }
      if (!position) { alert('Please enter the position or title.'); return; }

      if (registerExistingSubmitBtn) {
        registerExistingSubmitBtn.innerHTML = '<span class="spinner"></span> Registering...';
        registerExistingSubmitBtn.classList.add('loading');
        registerExistingSubmitBtn.disabled = true;
      }

      try {
        await UserModel.createProfile(uid, { email, fullName, contactNumber, position, role, status });
        if (window.ActivityLogModel) {
          ActivityLogModel.log('ACCOUNT_REGISTER_EXISTING', 'Account', {
            targetId:    uid,
            targetLabel: `${fullName} (${email})`,
            details:     { uid, email, fullName, contactNumber, position, role, status }
          });
        }
        UiView.showToast('success', 'Login Registered', `"${fullName}" now has ${role === 'admin' ? 'Administrator' : 'Facility-In-Charge'} access.`);
        window.closeRegisterExistingModal();
      } catch (err) {
        Logger.error(LAYER, 'Register existing login error:', err);
        UiView.showToast('error', 'Error', 'Failed to register existing login.');
      } finally {
        if (registerExistingSubmitBtn) {
          registerExistingSubmitBtn.innerHTML = 'Register Profile';
          registerExistingSubmitBtn.classList.remove('loading');
          registerExistingSubmitBtn.disabled = false;
        }
      }
    });
  }

  // ---- Activate / Deactivate ----
  window.toggleAccountStatus = async function (uid) {
    if (!Session.requireAdmin('change account status')) return;
    const currentUid = (Session.profile && Session.profile.uid) || '';
    if (uid === currentUid) {
      UiView.showToast('warning', 'Action Blocked', 'You cannot deactivate your own Administrator account.');
      return;
    }

    const user = allUsers.find(u => u.uid === uid);
    if (!user) return;

    const nextStatus = user.status === 'Active' ? 'Inactive' : 'Active';
    if (!confirm(`${nextStatus === 'Inactive' ? 'Deactivate' : 'Activate'} account for "${user.fullName || user.email}"?`)) {
      return;
    }

    try {
      await UserModel.setStatus(uid, nextStatus);
      if (window.ActivityLogModel) {
        ActivityLogModel.log(nextStatus === 'Active' ? 'ACCOUNT_ACTIVATE' : 'ACCOUNT_DEACTIVATE', 'Account', {
          targetId:    uid,
          targetLabel: `${user.fullName} (${user.email})`,
          details:     { previousStatus: user.status, newStatus: nextStatus }
        });
      }
      UiView.showToast(
        nextStatus === 'Active' ? 'success' : 'warning',
        `Account ${nextStatus}`,
        `"${user.fullName || user.email}" is now ${nextStatus.toLowerCase()}.`
      );
    } catch (err) {
      Logger.error(LAYER, 'Toggle status error:', err);
      UiView.showToast('error', 'Error', 'Failed to update account status.');
    }
  };

  // ---- Send Password Reset Email ----
  window.sendAccountPasswordReset = async function (uid) {
    if (!Session.requireAdmin('send password reset emails')) return;
    const user = allUsers.find(u => u.uid === uid);
    if (!user || !user.email) return;

    if (!confirm(`Send a password reset email to ${user.email}?`)) return;

    try {
      await AuthModel.sendPasswordReset(user.email);
      if (window.ActivityLogModel) {
        ActivityLogModel.log('ACCOUNT_PASSWORD_RESET', 'Account', {
          targetId:    uid,
          targetLabel: `${user.fullName} (${user.email})`,
          details:     { email: user.email }
        });
      }
      UiView.showToast('success', 'Reset Email Sent', `Password reset link sent to ${user.email}.`);
    } catch (err) {
      Logger.error(LAYER, 'Password reset email error:', err);
      UiView.showToast('error', 'Error', err?.message || 'Failed to send password reset email.');
    }
  };

  // ---- View Activity Logs for Specific User ----
  window.viewAccountActivity = function (uid) {
    if (!Session.requireAdmin('view activity logs')) return;
    if (typeof window.showSection === 'function') {
      window.showSection('activityLogs');
    }
    if (window.ActivityLogController && typeof ActivityLogController.filterByActor === 'function') {
      ActivityLogController.filterByActor(uid);
    }
  };

  // ---- Soft-Delete Account Profile ----
  window.deleteAccount = function (uid) {
    if (!Session.requireAdmin('delete accounts')) return;
    const currentUid = (Session.profile && Session.profile.uid) || '';
    if (uid === currentUid) {
      UiView.showToast('warning', 'Action Blocked', 'You cannot delete your own Administrator account.');
      return;
    }

    const user = allUsers.find(u => u.uid === uid);
    if (!user) return;

    deletingUid = uid;
    if (deleteAccountNameEl) deleteAccountNameEl.textContent = `"${user.fullName || user.email}" (${user.email})`;
    if (deleteAccountConfirmModal) deleteAccountConfirmModal.classList.add('visible');
  };

  window.closeDeleteAccountModal = function () {
    if (deleteAccountConfirmModal) deleteAccountConfirmModal.classList.remove('visible');
    deletingUid = null;
  };

  if (confirmDeleteAccountBtn) {
    confirmDeleteAccountBtn.addEventListener('click', async () => {
      if (!deletingUid || !Session.requireAdmin('delete accounts')) return;
      const user = allUsers.find(u => u.uid === deletingUid);
      const targetUid = deletingUid;

      try {
        await UserModel.remove(targetUid);
        if (window.ActivityLogModel) {
          ActivityLogModel.log('ACCOUNT_DELETE', 'Account', {
            targetId:    targetUid,
            targetLabel: user ? `${user.fullName} (${user.email})` : targetUid,
            details:     { email: user?.email || '', fullName: user?.fullName || '', role: user?.role || '' }
          });
        }
        UiView.showToast('warning', 'Account Access Removed', `"${user?.fullName || user?.email || 'Account'}" has been removed and can no longer sign in.`);
        window.closeDeleteAccountModal();
      } catch (err) {
        Logger.error(LAYER, 'Delete account error:', err);
        UiView.showToast('error', 'Error', 'Failed to delete account profile.');
      }
    });
  }

  [accountModal, registerExistingModal, deleteAccountConfirmModal].forEach(modal => {
    if (!modal) return;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        if (modal === accountModal) window.closeAccountModal();
        else if (modal === registerExistingModal) window.closeRegisterExistingModal();
        else if (modal === deleteAccountConfirmModal) window.closeDeleteAccountModal();
      }
    });
  });

  window.AccountController = {
    startListening,
    getAll: () => allUsers
  };
})();

