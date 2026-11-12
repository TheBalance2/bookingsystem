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
    if (url && url.startsWith('data:image/')) {
      const win = window.open();
      if (win) {
        win.document.write('<html><head><title>Receipt</title></head><body style="margin:0;display:flex;justify-content:center;align-items:center;background:#000;height:100vh;"><img src="' + url + '" style="max-width:100%;max-height:100%;object-fit:contain;"></body></html>');
        win.document.close();
      } else {
        alert('Pop-up blocked. Please allow pop-ups for this site.');
      }
    } else if (url) {
      window.open(url, '_blank');
    }
  }

  window.showAdminToast = showToast;
  window.openReceiptImage = openReceiptImage;

  window.UiView = {
    showToast,
    openReceiptImage
  };
})();

