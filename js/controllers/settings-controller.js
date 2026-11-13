/* ============================================================
   Settings Controller — San Isidro College Reservation System
   Controller Layer (js/controllers/settings-controller.js)
   Manages Sequential Booking ID settings, counter reset modal,
   and Internal PDF Signatories settings on dashboard.html.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'SettingsController';

  // ---- Booking ID Settings State & DOM ----
  let bookingIdConfigState = {
    prefix: Utils.DEFAULT_BOOKING_ID_PREFIX,
    year: Utils.DEFAULT_BOOKING_ID_YEAR,
    nextSequence: 1
  };
  let idConfigFormDirty  = false;
  let pendingResetTarget = null;

  const topbarNextBookingId        = document.getElementById('topbarNextBookingId');
  const activeNextBookingIdDisplay = document.getElementById('activeNextBookingIdDisplay');
  const idSequencePreviewPills     = document.getElementById('idSequencePreviewPills');
  const resetCardTargetPreview     = document.getElementById('resetCardTargetPreview');
  const bookingIdConfigForm        = document.getElementById('bookingIdConfigForm');
  const idConfigPrefixInput        = document.getElementById('idConfigPrefix');
  const idConfigYearInput          = document.getElementById('idConfigYear');
  const idConfigNextSeqInput       = document.getElementById('idConfigNextSeq');
  const useCurrentYearBtn          = document.getElementById('useCurrentYearBtn');
  const revertIdConfigBtn          = document.getElementById('revertIdConfigBtn');
  const saveIdConfigBtn            = document.getElementById('saveIdConfigBtn');
  const resetCounterToOneBtn       = document.getElementById('resetCounterToOneBtn');
  const resetBookingIdModal        = document.getElementById('resetBookingIdModal');
  const resetPreviewIdText         = document.getElementById('resetPreviewIdText');
  const resetExistingSeriesWarning = document.getElementById('resetExistingSeriesWarning');
  const confirmResetBookingIdBtn   = document.getElementById('confirmResetBookingIdBtn');

  function updateActiveBookingIdBadges() {
    const activeNextId = Utils.formatSequentialBookingId(
      bookingIdConfigState.prefix,
      bookingIdConfigState.year,
      bookingIdConfigState.nextSequence
    );
    if (topbarNextBookingId) topbarNextBookingId.textContent = activeNextId;
    if (activeNextBookingIdDisplay) activeNextBookingIdDisplay.textContent = activeNextId;
  }

  function updateBookingIdDraftPreview() {
    const draftPrefix = Utils.sanitizeIdSegment(idConfigPrefixInput ? idConfigPrefixInput.value : '') || bookingIdConfigState.prefix;
    const draftYear   = Utils.sanitizeIdSegment(idConfigYearInput ? idConfigYearInput.value : '') || bookingIdConfigState.year;
    const rawSeq      = idConfigNextSeqInput ? parseInt(idConfigNextSeqInput.value, 10) : bookingIdConfigState.nextSequence;
    const draftSeq    = (Number.isFinite(rawSeq) && rawSeq >= 1) ? rawSeq : 1;

    if (idSequencePreviewPills) {
      const id1 = Utils.escapeHtml(Utils.formatSequentialBookingId(draftPrefix, draftYear, draftSeq));
      const id2 = Utils.escapeHtml(Utils.formatSequentialBookingId(draftPrefix, draftYear, draftSeq + 1));
      const id3 = Utils.escapeHtml(Utils.formatSequentialBookingId(draftPrefix, draftYear, draftSeq + 2));
      idSequencePreviewPills.innerHTML = `
        <span class="id-seq-pill primary">${id1}</span>
        <span class="id-seq-arrow">&rarr;</span>
        <span class="id-seq-pill">${id2}</span>
        <span class="id-seq-arrow">&rarr;</span>
        <span class="id-seq-pill">${id3}</span>
      `;
    }

    if (resetCardTargetPreview) {
      resetCardTargetPreview.textContent = Utils.formatSequentialBookingId(draftPrefix, draftYear, 1);
    }
  }

  function syncBookingIdFormFromState(forceOverwrite = false) {
    if (idConfigFormDirty && !forceOverwrite) {
      updateBookingIdDraftPreview();
      return;
    }
    if (idConfigPrefixInput)  idConfigPrefixInput.value  = bookingIdConfigState.prefix;
    if (idConfigYearInput)    idConfigYearInput.value    = bookingIdConfigState.year;
    if (idConfigNextSeqInput) idConfigNextSeqInput.value = String(bookingIdConfigState.nextSequence);
    idConfigFormDirty = false;
    updateBookingIdDraftPreview();
  }

  function listenBookingIdConfig() {
    SettingsModel.listenBookingIdConfig(
      (state) => {
        bookingIdConfigState = state;
        updateActiveBookingIdBadges();
        syncBookingIdFormFromState(false);
      },
      () => {
        updateActiveBookingIdBadges();
        syncBookingIdFormFromState(false);
      }
    );
  }

  if (idConfigPrefixInput) {
    idConfigPrefixInput.addEventListener('input', () => {
      const cleaned = idConfigPrefixInput.value.toUpperCase().replace(/[^A-Z0-9-]+/g, '');
      if (idConfigPrefixInput.value !== cleaned) idConfigPrefixInput.value = cleaned;
      idConfigFormDirty = true;
      updateBookingIdDraftPreview();
    });
  }

  if (idConfigYearInput) {
    idConfigYearInput.addEventListener('input', () => {
      const cleaned = idConfigYearInput.value.toUpperCase().replace(/[^A-Z0-9-]+/g, '');
      if (idConfigYearInput.value !== cleaned) idConfigYearInput.value = cleaned;
      idConfigFormDirty = true;
      updateBookingIdDraftPreview();
    });
  }

  if (idConfigNextSeqInput) {
    idConfigNextSeqInput.addEventListener('keydown', (e) => {
      if (['+', '-', 'e', 'E', '.', ','].includes(e.key)) e.preventDefault();
    });
    idConfigNextSeqInput.addEventListener('input', () => {
      idConfigFormDirty = true;
      updateBookingIdDraftPreview();
    });
  }

  if (useCurrentYearBtn && idConfigYearInput) {
    useCurrentYearBtn.addEventListener('click', () => {
      idConfigYearInput.value = String(new Date().getFullYear());
      idConfigFormDirty = true;
      updateBookingIdDraftPreview();
    });
  }

  if (revertIdConfigBtn) {
    revertIdConfigBtn.addEventListener('click', () => {
      syncBookingIdFormFromState(true);
      UiView.showToast('info', 'Edits Reverted', 'Form restored to the active Booking ID settings.');
    });
  }

  if (bookingIdConfigForm) {
    bookingIdConfigForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const prefix = Utils.sanitizeIdSegment(idConfigPrefixInput ? idConfigPrefixInput.value : '');
      const year   = Utils.sanitizeIdSegment(idConfigYearInput ? idConfigYearInput.value : '');
      const rawSeq = idConfigNextSeqInput ? parseInt(idConfigNextSeqInput.value, 10) : NaN;

      if (!prefix) {
        alert('Please enter a valid ID Prefix (e.g. SIC).');
        if (idConfigPrefixInput) idConfigPrefixInput.focus();
        return;
      }
      if (!year) {
        alert('Please enter a valid Year / Segment (e.g. 2026 or 2027).');
        if (idConfigYearInput) idConfigYearInput.focus();
        return;
      }
      if (!Number.isFinite(rawSeq) || rawSeq < 1) {
        alert('Next Sequence Number must be a whole number starting from 1 (001) or higher.');
        if (idConfigNextSeqInput) idConfigNextSeqInput.focus();
        return;
      }

      const nextSequence = Math.floor(rawSeq);
      if (saveIdConfigBtn) {
        saveIdConfigBtn.innerHTML = '<span class="spinner"></span> Saving...';
        saveIdConfigBtn.classList.add('loading');
        saveIdConfigBtn.disabled = true;
      }

      try {
        await SettingsModel.saveBookingIdConfig({ prefix, year, nextSequence });

        bookingIdConfigState = { prefix, year, nextSequence };
        idConfigFormDirty = false;
        updateActiveBookingIdBadges();
        syncBookingIdFormFromState(true);

        const nextFormatted = Utils.formatSequentialBookingId(prefix, year, nextSequence);
        UiView.showToast('success', 'Booking ID Settings Saved', `Upcoming reservations will start at ${nextFormatted}.`);
      } catch (err) {
        Logger.error(LAYER, 'Failed to save Booking ID settings:', err);
        if (err && err.code === 'permission-denied') {
          UiView.showToast('error', 'Firestore Rules Needed', 'Publish the updated firestore.rules (settings/bookingId) in Firebase Console, then try again.');
        } else {
          UiView.showToast('error', 'Error', 'Failed to save Booking ID settings.');
        }
      } finally {
        if (saveIdConfigBtn) {
          saveIdConfigBtn.innerHTML = 'Save ID Settings';
          saveIdConfigBtn.classList.remove('loading');
          saveIdConfigBtn.disabled = false;
        }
      }
    });
  }

  if (resetCounterToOneBtn) {
    resetCounterToOneBtn.addEventListener('click', () => {
      const targetPrefix = Utils.sanitizeIdSegment(idConfigPrefixInput ? idConfigPrefixInput.value : '') || bookingIdConfigState.prefix;
      const targetYear   = Utils.sanitizeIdSegment(idConfigYearInput ? idConfigYearInput.value : '') || bookingIdConfigState.year;
      const previewFirst = Utils.formatSequentialBookingId(targetPrefix, targetYear, 1);
      const seriesPrefix = `${targetPrefix}-${targetYear}-`;

      pendingResetTarget = { prefix: targetPrefix, year: targetYear };
      if (resetPreviewIdText) resetPreviewIdText.textContent = previewFirst;

      if (resetExistingSeriesWarning) {
        const allBookings = window._allBookings || [];
        const matchingCount = allBookings.filter(b =>
          String(b.referenceId || '').toUpperCase().startsWith(seriesPrefix)
        ).length;

        if (matchingCount > 0) {
          resetExistingSeriesWarning.textContent = `Note: ${matchingCount} existing reservation${matchingCount === 1 ? '' : 's'} already use "${seriesPrefix}...". Their issued IDs will remain unchanged.`;
          resetExistingSeriesWarning.style.display = 'block';
        } else {
          resetExistingSeriesWarning.style.display = 'none';
        }
      }

      if (resetBookingIdModal) resetBookingIdModal.classList.add('visible');
    });
  }

  window.closeResetBookingIdModal = function () {
    if (resetBookingIdModal) resetBookingIdModal.classList.remove('visible');
    pendingResetTarget = null;
  };

  if (resetBookingIdModal) {
    resetBookingIdModal.addEventListener('click', (e) => {
      if (e.target === resetBookingIdModal) window.closeResetBookingIdModal();
    });
  }

  if (confirmResetBookingIdBtn) {
    confirmResetBookingIdBtn.addEventListener('click', async () => {
      const targetPrefix = (pendingResetTarget && pendingResetTarget.prefix) || bookingIdConfigState.prefix;
      const targetYear   = (pendingResetTarget && pendingResetTarget.year) || bookingIdConfigState.year;

      confirmResetBookingIdBtn.innerHTML = '<span class="spinner"></span> Resetting...';
      confirmResetBookingIdBtn.classList.add('loading');
      confirmResetBookingIdBtn.disabled = true;

      try {
        await SettingsModel.resetBookingIdCounter(targetPrefix, targetYear);

        bookingIdConfigState = {
          prefix: targetPrefix,
          year: targetYear,
          nextSequence: 1
        };
        idConfigFormDirty = false;
        updateActiveBookingIdBadges();
        syncBookingIdFormFromState(true);

        const resetId = Utils.formatSequentialBookingId(targetPrefix, targetYear, 1);
        window.closeResetBookingIdModal();
        UiView.showToast('success', 'Counter Reset to 001', `The next reservation submitted will be assigned ${resetId}.`);
      } catch (err) {
        Logger.error(LAYER, 'Failed to reset Booking ID counter:', err);
        if (err && err.code === 'permission-denied') {
          UiView.showToast('error', 'Firestore Rules Needed', 'Publish the updated firestore.rules (settings/bookingId) in Firebase Console, then try again.');
        } else {
          UiView.showToast('error', 'Error', 'Failed to reset Booking ID counter.');
        }
      } finally {
        confirmResetBookingIdBtn.innerHTML = 'Reset to 001';
        confirmResetBookingIdBtn.classList.remove('loading');
        confirmResetBookingIdBtn.disabled = false;
      }
    });
  }

  // ---- PDF Signatories Settings State & DOM ----
  let signatoriesState = {
    facilitiesInCharge: '',
    comptroller: '',
    generalAdminCoordinator: '',
    vpAdminFinance: ''
  };
  let signatoriesFormDirty = false;

  const signatoriesForm            = document.getElementById('signatoriesForm');
  const sigFacilitiesInChargeInput = document.getElementById('sigFacilitiesInCharge');
  const sigComptrollerInput        = document.getElementById('sigComptroller');
  const sigGeneralAdminInput       = document.getElementById('sigGeneralAdmin');
  const sigVpAdminFinanceInput     = document.getElementById('sigVpAdminFinance');
  const saveSignatoriesBtn         = document.getElementById('saveSignatoriesBtn');
  const revertSignatoriesBtn       = document.getElementById('revertSignatoriesBtn');
  const clearSignatoriesBtn        = document.getElementById('clearSignatoriesBtn');
  const previewSigFacilitiesEl     = document.getElementById('previewSigFacilitiesInCharge');
  const previewSigComptrollerEl    = document.getElementById('previewSigComptroller');
  const previewSigGeneralAdminEl   = document.getElementById('previewSigGeneralAdmin');
  const previewSigVpAdminFinanceEl = document.getElementById('previewSigVpAdminFinance');

  function renderPreviewSignatorySlot(el, value) {
    if (!el) return;
    const trimmed = String(value || '').trim();
    if (trimmed) {
      el.textContent = trimmed;
      el.classList.remove('is-placeholder');
    } else {
      el.textContent = '(Blank line)';
      el.classList.add('is-placeholder');
    }
  }

  function updateSignatoriesPreview() {
    const facVal  = sigFacilitiesInChargeInput ? sigFacilitiesInChargeInput.value : signatoriesState.facilitiesInCharge;
    const compVal = sigComptrollerInput ? sigComptrollerInput.value : signatoriesState.comptroller;
    const genVal  = sigGeneralAdminInput ? sigGeneralAdminInput.value : signatoriesState.generalAdminCoordinator;
    const vpVal   = sigVpAdminFinanceInput ? sigVpAdminFinanceInput.value : signatoriesState.vpAdminFinance;

    renderPreviewSignatorySlot(previewSigFacilitiesEl, facVal);
    renderPreviewSignatorySlot(previewSigComptrollerEl, compVal);
    renderPreviewSignatorySlot(previewSigGeneralAdminEl, genVal);
    renderPreviewSignatorySlot(previewSigVpAdminFinanceEl, vpVal);
  }

  function syncSignatoriesFormFromState(forceOverwrite = false) {
    if (signatoriesFormDirty && !forceOverwrite) {
      updateSignatoriesPreview();
      return;
    }
    if (sigFacilitiesInChargeInput) sigFacilitiesInChargeInput.value = signatoriesState.facilitiesInCharge;
    if (sigComptrollerInput)        sigComptrollerInput.value        = signatoriesState.comptroller;
    if (sigGeneralAdminInput)       sigGeneralAdminInput.value       = signatoriesState.generalAdminCoordinator;
    if (sigVpAdminFinanceInput)     sigVpAdminFinanceInput.value     = signatoriesState.vpAdminFinance;
    signatoriesFormDirty = false;
    updateSignatoriesPreview();
  }

  function listenSignatoriesConfig() {
    SettingsModel.listenSignatories(
      (state) => {
        signatoriesState = state;
        syncSignatoriesFormFromState(false);
      },
      () => {
        syncSignatoriesFormFromState(false);
      }
    );
  }

  [sigFacilitiesInChargeInput, sigComptrollerInput, sigGeneralAdminInput, sigVpAdminFinanceInput].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('input', () => {
      signatoriesFormDirty = true;
      updateSignatoriesPreview();
    });
  });

  if (revertSignatoriesBtn) {
    revertSignatoriesBtn.addEventListener('click', () => {
      syncSignatoriesFormFromState(true);
      UiView.showToast('info', 'Edits Reverted', 'Form restored to the saved PDF signatory names.');
    });
  }

  if (clearSignatoriesBtn) {
    clearSignatoriesBtn.addEventListener('click', () => {
      if (sigFacilitiesInChargeInput) sigFacilitiesInChargeInput.value = '';
      if (sigComptrollerInput)        sigComptrollerInput.value        = '';
      if (sigGeneralAdminInput)       sigGeneralAdminInput.value       = '';
      if (sigVpAdminFinanceInput)     sigVpAdminFinanceInput.value     = '';
      signatoriesFormDirty = true;
      updateSignatoriesPreview();
      UiView.showToast('info', 'Fields Cleared', 'Click "Save Signatories" to apply blank lines to future PDFs.');
    });
  }

  if (signatoriesForm) {
    signatoriesForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const facilitiesInCharge      = String(sigFacilitiesInChargeInput ? sigFacilitiesInChargeInput.value : '').trim();
      const comptroller             = String(sigComptrollerInput ? sigComptrollerInput.value : '').trim();
      const generalAdminCoordinator = String(sigGeneralAdminInput ? sigGeneralAdminInput.value : '').trim();
      const vpAdminFinance          = String(sigVpAdminFinanceInput ? sigVpAdminFinanceInput.value : '').trim();

      if (saveSignatoriesBtn) {
        saveSignatoriesBtn.innerHTML = '<span class="spinner"></span> Saving...';
        saveSignatoriesBtn.classList.add('loading');
        saveSignatoriesBtn.disabled = true;
      }

      try {
        await SettingsModel.saveSignatories({
          facilitiesInCharge,
          comptroller,
          generalAdminCoordinator,
          vpAdminFinance
        });

        signatoriesState = { facilitiesInCharge, comptroller, generalAdminCoordinator, vpAdminFinance };
        signatoriesFormDirty = false;
        syncSignatoriesFormFromState(true);
        UiView.showToast('success', 'Signatories Saved', 'Booking PDFs will now print the updated signatory names.');
      } catch (err) {
        Logger.error(LAYER, 'Failed to save PDF signatories:', err);
        if (err && err.code === 'permission-denied') {
          UiView.showToast('error', 'Firestore Rules Needed', 'Publish the updated firestore.rules (settings/signatories) in Firebase Console, then try again.');
        } else {
          UiView.showToast('error', 'Error', 'Failed to save PDF signatories. Please try again.');
        }
      } finally {
        if (saveSignatoriesBtn) {
          saveSignatoriesBtn.innerHTML = 'Save Signatories';
          saveSignatoriesBtn.classList.remove('loading');
          saveSignatoriesBtn.disabled = false;
        }
      }
    });
  }

  window.listenBookingIdConfig   = listenBookingIdConfig;
  window.listenSignatoriesConfig = listenSignatoriesConfig;

  window.SettingsController = {
    listenBookingIdConfig,
    listenSignatoriesConfig,
    syncBookingIdFormFromState,
    syncSignatoriesFormFromState
  };
})();

