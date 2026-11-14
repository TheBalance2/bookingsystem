/* ============================================================
   UI View Helpers — San Isidro College Reservation System
   View Layer (js/views/ui-view.js)
   Handles shared toast alerts, modal open/close, and receipt
   image viewer window. Never touches Firestore.
   ============================================================ */

(function () {
  'use strict';

  function showToast(type, title, message, onClick) {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}${typeof onClick === 'function' ? ' clickable' : ''}`;

    toast.innerHTML = `
      <div class="toast-body">
        <h4>${Utils.escapeHtml(title)}</h4>
        <p>${Utils.escapeHtml(message)}</p>
      </div>
      <button class="toast-close" onclick="event.stopPropagation(); this.parentElement.remove()">✕</button>
    `;

    if (typeof onClick === 'function') {
      toast.addEventListener('click', () => {
        onClick();
        toast.remove();
      });
    }

    toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.animation = 'fadeIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
      }
    }, 5000);
  }

  function openReceiptImage(url) {
    const safeUrl = Utils.sanitizeUrl(url);
    if (!safeUrl) return;
    if (safeUrl.startsWith('data:image/')) {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write('<!DOCTYPE html><html><head><title>Receipt</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;background:#000;height:100vh;"></body></html>');
        win.document.close();
        const img = win.document.createElement('img');
        img.src = safeUrl;
        img.alt = 'Payment Receipt';
        img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;';
        win.document.body.appendChild(img);
      } else {
        alert('Pop-up blocked. Please allow pop-ups for this site.');
      }
    } else {
      window.open(safeUrl, '_blank', 'noopener');
    }
  }

  // Prompts the currently signed-in True Admin to re-enter their password
  // before executing a destructive operation. Resolves true if verified, false if cancelled.
  function requirePassword(actionLabel = 'perform this sensitive action') {
    return new Promise((resolve) => {
      const modal       = document.getElementById('passwordReauthModal');
      const form        = document.getElementById('passwordReauthForm');
      const descEl      = document.getElementById('passwordReauthActionLabel');
      const inputEl     = document.getElementById('passwordReauthInput');
      const errEl       = document.getElementById('passwordReauthError');
      const cancelBtn   = document.getElementById('passwordReauthCancelBtn');
      const submitBtn   = document.getElementById('passwordReauthSubmitBtn');

      if (!modal || !form || !inputEl || !window.AuthModel || typeof AuthModel.reauthenticate !== 'function') {
        resolve(false);
        return;
      }

      if (descEl) descEl.textContent = actionLabel;
      inputEl.value = '';
      if (errEl) {
        errEl.textContent = '';
        errEl.style.display = 'none';
      }
      modal.classList.add('visible');
      setTimeout(() => inputEl.focus(), 50);

      let settled = false;
      const cleanup = (result) => {
        if (settled) return;
        settled = true;
        modal.classList.remove('visible');
        inputEl.value = '';
        form.removeEventListener('submit', onSubmit);
        if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onOverlayClick);
        resolve(result);
      };

      const onCancel = () => cleanup(false);
      const onOverlayClick = (e) => {
        if (e.target === modal) cleanup(false);
      };

      const onSubmit = async (e) => {
        e.preventDefault();
        const pwd = inputEl.value;
        if (!pwd) {
          if (errEl) {
            errEl.textContent = 'Please enter your current password.';
            errEl.style.display = 'block';
          }
          inputEl.focus();
          return;
        }

        if (submitBtn) {
          submitBtn.innerHTML = '<span class="spinner"></span> Verifying...';
          submitBtn.classList.add('loading');
          submitBtn.disabled = true;
        }
        if (errEl) errEl.style.display = 'none';

        try {
          await AuthModel.reauthenticate(pwd);
          cleanup(true);
        } catch (err) {
          if (errEl) {
            errEl.textContent =
              err && err.code === 'auth/too-many-requests'
                ? 'Too many failed attempts. Please wait before trying again.'
                : 'Incorrect password. Please try again.';
            errEl.style.display = 'block';
          }
          inputEl.select();
        } finally {
          if (submitBtn) {
            submitBtn.innerHTML = 'Verify & Continue';
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
          }
        }
      };

      form.addEventListener('submit', onSubmit);
      if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
      modal.addEventListener('click', onOverlayClick);
    });
  }

  window.showAdminToast = showToast;
  window.openReceiptImage = openReceiptImage;

  window.UiView = {
    showToast,
    openReceiptImage,
    requirePassword
  };
})();

