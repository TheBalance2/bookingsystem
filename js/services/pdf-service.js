/* ============================================================
   PDF Service — San Isidro College Reservation System
   Service Layer (js/services/pdf-service.js)
   Generates Internal (RFUFVE 2-copy) and External (RUF-EU)
   booking forms using jsPDF.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'PdfService';

  let lastExternalPdfDoc  = null;
  let lastExternalPdfData = null;
  let lastInternalPdfDoc  = null;
  let lastInternalPdfData = null;

  let internalSignatories = {
    facilitiesInCharge: '',
    comptroller: '',
    generalAdminCoordinator: ''
  };
  let signatoriesLoaded = false;

  function applySignatoriesData(raw) {
    const d = raw || {};
    internalSignatories = {
      facilitiesInCharge:      String(d.facilitiesInCharge || '').trim(),
      comptroller:             String(d.comptroller || '').trim(),
      generalAdminCoordinator: String(d.generalAdminCoordinator || '').trim()
    };
    signatoriesLoaded = true;

    if (lastInternalPdfData) {
      lastInternalPdfData = {
        ...lastInternalPdfData,
        signatories: { ...internalSignatories }
      };
      lastInternalPdfDoc = null;
    }
  }

  function initSignatoriesListener() {
    if (typeof SettingsModel !== 'undefined' && typeof SettingsModel.listenSignatories === 'function') {
      SettingsModel.listenSignatories(applySignatoriesData);
    }
  }

  function ensureInternalSignatoriesLoaded() {
    if (signatoriesLoaded) return Promise.resolve(internalSignatories);
    if (typeof SettingsModel !== 'undefined' && typeof SettingsModel.getSignatories === 'function') {
      return SettingsModel.getSignatories()
        .then(sigs => {
          applySignatoriesData(sigs);
          return internalSignatories;
        })
        .catch(() => internalSignatories);
    }
    return Promise.resolve(internalSignatories);
  }

  function extractBookingNumber(referenceId) {
    const cleaned = String(referenceId || '').trim();
    if (!cleaned || cleaned === '—' || cleaned.toLowerCase() === 'booking') {
      return '001';
    }
    const parts = cleaned.split('-').filter(Boolean);
    const idPart = parts.length > 0 ? parts[parts.length - 1] : cleaned;
    return idPart.replace(/[\\/:*?"<>|]+/g, '') || '001';
  }

  function getBookingPdfFilename(userType, referenceId) {
    const prefix = userType === 'Internal' ? 'Internal-SIC-' : 'External-SIC-';
    return `${prefix}${extractBookingNumber(referenceId)}.pdf`;
  }

  // ---- External Booking PDF ----
  function generateExternalBookingPDF(data) {
    lastExternalPdfDoc  = null;
    lastExternalPdfData = data;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    try {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.src = 'images/logo.jpg';

      logoImg.onload = function () {
        buildExternalPdfContent(doc, data, logoImg);
      };
      logoImg.onerror = function () {
        buildExternalPdfContent(doc, data, null);
      };
    } catch (err) {
      Logger.warn(LAYER, 'Could not load logo for External PDF:', err);
      buildExternalPdfContent(doc, data, null);
    }
  }

  function buildExternalPdfContent(doc, data, logoImg) {
    let startY = 15;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('IF 513\nRevised: 2011', 15, startY);

    if (logoImg) doc.addImage(logoImg, 'JPEG', 65, startY - 3, 15, 15);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('SAN ISIDRO COLLEGE', 105, startY + 2, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('City of Malaybalay', 105, startY + 7, { align: 'center' });

    doc.text('RUF-EU Control No.: ' + (data.referenceId || ''), 195, startY, { align: 'right' });

    let y = startY + 25;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('REQUEST FOR THE USE OF FACILITIES', 105, y, { align: 'center' });
    doc.setFontSize(10);
    doc.text('[For External Users]', 105, y + 5, { align: 'center' });

    y += 15;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const dateFiled = Utils.getFilingDate(data);
    doc.text('Date Filed: ' + dateFiled, 140, y);

    y += 10;
    doc.text('[Please check the facilities to be requested.]', 15, y);

    y += 5;
    const facilitiesLeft = ['Gymnasium', 'SMDC Conference Room', 'Chapel', 'Guest House/College H.E.'];
    const facilitiesCenter = ['Student Center', 'Field/Oval', 'Classroom'];
    const facilitiesRight = ['Defense Room'];

    let leftY = y;
    facilitiesLeft.forEach(f => {
      doc.rect(15, leftY - 3, 3, 3);
      if (data.facility === f || (f === 'Chapel' && data.facility.includes('Chapel'))) doc.text('x', 15.5, leftY - 0.5);
      doc.text(f, 20, leftY);
      leftY += 6;
    });

    let centerY = y;
    facilitiesCenter.forEach(f => {
      doc.rect(70, centerY - 3, 3, 3);
      if (data.facility === f) doc.text('x', 70.5, centerY - 0.5);
      doc.text(f, 75, centerY);
      centerY += 6;
    });

    let rightY = y;
    facilitiesRight.forEach(f => {
      doc.rect(125, rightY - 3, 3, 3);
      if (data.facility === f) doc.text('x', 125.5, rightY - 0.5);
      doc.text(f, 130, rightY);
      rightY += 6;
    });

    y = Math.max(leftY, centerY, rightY) + 5;

    const rowHeight = 12;

    // Row 1
    doc.rect(15, y, 180, rowHeight);
    doc.line(65, y, 65, y + rowHeight);
    doc.text('Name of Contact\nPerson', 17, y + 5);
    const contactPersonText = (data.lastName || data.firstName)
      ? Utils.formatCombinedName(data.lastName, data.firstName, data.middleInitial)
      : (data.contactPerson || data.name || '');
    doc.text(doc.splitTextToSize(contactPersonText, 125), 67, y + 7);
    y += rowHeight;

    // Row 2: Agency / Organization & Office
    doc.rect(15, y, 180, rowHeight);
    doc.line(65, y, 65, y + rowHeight);
    doc.text('Name of\nAgency/Organization', 17, y + 5);
    const orgLine1 = data.agencyName || data.agency || '';
    const orgDetails = [
      data.officeName ? `Office: ${data.officeName}` : '',
      data.agencyType ? `(${data.agencyType})` : ''
    ].filter(Boolean).join(' • ');
    const fullOrgText = orgDetails ? `${orgLine1}\n${orgDetails}` : orgLine1;
    doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(fullOrgText, 125), 67, orgDetails ? y + 4.5 : y + 7);
    doc.setFontSize(10);
    y += rowHeight;

    // Row 3
    doc.rect(15, y, 180, rowHeight);
    doc.line(65, y, 65, y + rowHeight);
    doc.text('Address', 17, y + 7);
    doc.text(data.address || '', 67, y + 7);
    y += rowHeight;

    // Row 4
    doc.rect(15, y, 180, rowHeight);
    doc.line(65, y, 65, y + rowHeight);
    doc.text('Contact Number/s', 17, y + 7);
    doc.text(data.contact || '', 67, y + 7);
    y += rowHeight;

    // Row 5
    doc.rect(15, y, 180, rowHeight);
    doc.line(65, y, 65, y + rowHeight);
    doc.text('Purpose / Activity', 17, y + 7);
    doc.text(doc.splitTextToSize(data.purpose || '', 125), 67, y + 5);
    y += rowHeight;

    // Row 6
    doc.rect(15, y, 180, rowHeight);
    doc.line(65, y, 65, y + rowHeight);
    doc.line(110, y, 110, y + rowHeight);
    doc.line(140, y, 140, y + rowHeight);
    doc.text('Date of Use', 17, y + 7);
    doc.text(data.date || '', 67, y + 7);
    doc.text('Time of Use', 112, y + 7);
    const formattedTimeRange = (data.startTime && data.endTime)
      ? `${Utils.formatTime12(data.startTime)} - ${Utils.formatTime12(data.endTime)}`
      : (data.startTime || data.endTime || '—');
    doc.text(formattedTimeRange, 142, y + 7);
    y += rowHeight;

    // Row 7
    doc.rect(15, y, 180, rowHeight);
    doc.line(65, y, 65, y + rowHeight);
    doc.text('Number of Persons', 17, y + 7);
    doc.text(String(data.numPersons || ''), 67, y + 7);
    y += rowHeight;

    // Row 8
    const eqRowHeight = 20;
    doc.rect(15, y, 180, eqRowHeight);
    doc.line(65, y, 65, y + eqRowHeight);
    doc.text('Equipment/Resources\nNeeded', 17, y + 7);
    const equipStr = (data.equipment || []).map(e => typeof e === 'string' ? e : `${e.item}(x${e.qty})`).join(', ');
    const allEqStr = equipStr + (data.otherEquipment ? (equipStr ? ', ' : '') + data.otherEquipment : '');
    doc.text(doc.splitTextToSize(allEqStr || 'None', 125), 67, y + 7);
    y += eqRowHeight;

    // Row 9 (Other Considerations)
    const obsRowHeight = 25;
    doc.rect(15, y, 180, obsRowHeight);
    doc.line(65, y, 65, y + obsRowHeight);
    doc.text('Other Considerations', 17, y + 12);
    doc.text(doc.splitTextToSize(data.considerations || 'None', 125), 67, y + 7);
    y += obsRowHeight;

    y += 5;
    doc.setFontSize(8);
    doc.text('[Note: Users are accountable for whatever damages during the activity.]', 15, y);

    y += 25;
    doc.line(130, y, 195, y);
    doc.text('Name & Signature of Requesting Person', 162.5, y + 4, { align: 'center' });

    y += 20;
    doc.text('Noted:', 15, y - 5);
    doc.line(25, y, 75, y);
    doc.text('Facility In-Charge', 50, y + 4, { align: 'center' });

    doc.line(85, y, 135, y);
    doc.text('Finance Officer', 110, y + 4, { align: 'center' });

    doc.text('Approved:', 140, y - 5);
    doc.line(140, y, 195, y);
    doc.text('Vice President for', 167.5, y + 4, { align: 'center' });
    doc.text('Administration & Finance', 167.5, y + 8, { align: 'center' });

    y += 15;
    doc.setFontSize(7);
    doc.text('Note: Accomplish in 4 copies: Requesting Person, School Guard, Facility In-Charge, Finance Officer', 15, y);

    doc.addPage();
    doc.setDrawColor(230, 81, 0);
    doc.setFillColor(255, 243, 224);
    doc.roundedRect(15, 20, 180, 30, 3, 3, 'FD');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(230, 81, 0);
    doc.text('IMPORTANT INSTRUCTIONS:', 20, 28);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    const noteText = 'Please print the Booking Form on the previous page in 4 copies and present it to the Business Office of San Isidro College for payment assessment. The price will be determined by the Business Office. After payment, upload your receipt on the booking page to confirm your reservation.';
    const noteLines = doc.splitTextToSize(noteText, 170);
    doc.text(noteLines, 20, 34);

    lastExternalPdfDoc = doc;
    doc.save(getBookingPdfFilename('External', data.referenceId));
  }

  function downloadLastExternalPDF(fallbackRefId = 'booking') {
    const refId = (lastExternalPdfData && lastExternalPdfData.referenceId) || fallbackRefId;
    if (lastExternalPdfDoc) {
      lastExternalPdfDoc.save(getBookingPdfFilename('External', refId));
    } else if (lastExternalPdfData) {
      generateExternalBookingPDF(lastExternalPdfData);
    }
  }

  // ---- Internal Booking PDF ----
  function startInternalPdfRender(pdfData) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    try {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.src = 'images/logo.jpg';

      logoImg.onload = function () {
        buildInternalPdfContent(doc, pdfData, logoImg);
      };
      logoImg.onerror = function () {
        buildInternalPdfContent(doc, pdfData, null);
      };
    } catch (err) {
      Logger.warn(LAYER, 'Could not load logo for Internal PDF:', err);
      buildInternalPdfContent(doc, pdfData, null);
    }
  }

  function generateInternalBookingPDF(data) {
    lastInternalPdfDoc = null;

    if (signatoriesLoaded || (data && data.signatories)) {
      const pdfData = { ...data, signatories: (data && data.signatories) ? data.signatories : { ...internalSignatories } };
      lastInternalPdfData = pdfData;
      startInternalPdfRender(pdfData);
      return;
    }

    lastInternalPdfData = data;
    ensureInternalSignatoriesLoaded().then((sigs) => {
      const pdfData = { ...data, signatories: { ...sigs } };
      lastInternalPdfData = pdfData;
      startInternalPdfRender(pdfData);
    });
  }

  function buildInternalPdfContent(doc, data, logoImg) {
    drawInternalFormCopy(doc, data, logoImg, 10);

    doc.setDrawColor(150, 150, 150);
    doc.setLineDashPattern([3, 3], 0);
    doc.line(10, 148, 200, 148);
    doc.setLineDashPattern([], 0);

    drawInternalFormCopy(doc, data, logoImg, 155);

    lastInternalPdfDoc = doc;
    doc.save(getBookingPdfFilename('Internal', data.referenceId));
  }

  function drawSignatoryNameAboveLine(doc, rawName, centerX, lineY, maxWidth) {
    const name = String(rawName || '').trim();
    if (!name) return;

    doc.setFont('helvetica', 'bold');
    let fontSize = 8;
    doc.setFontSize(fontSize);
    while (doc.getTextWidth(name) > maxWidth && fontSize > 6) {
      fontSize -= 0.5;
      doc.setFontSize(fontSize);
    }
    doc.text(name, centerX, lineY - 1.2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
  }

  function drawInternalFormCopy(doc, data, logoImg, startY) {
    if (logoImg) doc.addImage(logoImg, 'JPEG', 70, startY, 12, 12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('SAN ISIDRO COLLEGE', 105, startY + 5, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('City of Malaybalay', 105, startY + 9, { align: 'center' });

    doc.text('RFUFVE Control No.: ' + (data.referenceId || ''), 195, startY + 7, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('REQUEST FOR THE USE OF FACILITIES, VEHICLE & EQUIPMENT', 105, startY + 16, { align: 'center' });

    doc.setFontSize(8);
    let y = startY + 22;

    doc.setFont('helvetica', 'bold');
    doc.text('FACILITY', 15, y);
    doc.text('VEHICLE', 155, y);
    doc.setFont('helvetica', 'normal');

    const facilitiesLeft = ['Gymnasium', 'SMDC Conference Room', 'OMPH&SSTJ Chapel', 'Guest House/College H.E.', 'Board Room', 'Others (please specify)'];
    const facilitiesRight = ['Student Center', 'Field/Oval', 'Sound System', 'Class room', 'Laboratory'];

    let leftY = y + 4;
    facilitiesLeft.forEach(f => {
      doc.rect(15, leftY - 3, 3, 3);
      if (data.facility === f || (f === 'Others (please specify)' && data.facility && !facilitiesLeft.includes(data.facility) && !facilitiesRight.includes(data.facility))) {
        doc.text('x', 15.5, leftY - 0.5);
      }
      doc.text(f === 'Others (please specify)' && data.facility && !facilitiesLeft.includes(data.facility) && !facilitiesRight.includes(data.facility) ? 'Others: ' + data.facility : f, 20, leftY);
      leftY += 4.5;
    });

    let rightY = y + 4;
    facilitiesRight.forEach(f => {
      doc.rect(60, rightY - 3, 3, 3);
      if (data.facility === f) doc.text('x', 60.5, rightY - 0.5);
      doc.text(f, 65, rightY);
      rightY += 4.5;
    });

    let vY = y + 4;
    const vehicleList = ['Toyota Grandia Van', 'KIA Utility Van'];
    vehicleList.forEach(v => {
      doc.rect(155, vY - 3, 3, 3);
      if (data.vehicle && data.vehicle.includes(v)) doc.text('x', 155.5, vY - 0.5);
      doc.text(v, 160, vY);
      vY += 4.5;
    });

    y = Math.max(leftY, rightY, vY) + 2;

    doc.rect(15, y, 180, 42);

    doc.line(65, y, 65, y + 42);
    doc.line(15, y + 7, 195, y + 7);
    doc.line(15, y + 14, 195, y + 14);
    doc.line(15, y + 21, 135, y + 21);
    doc.line(15, y + 28, 195, y + 28);
    doc.line(15, y + 35, 195, y + 35);

    doc.line(135, y, 135, y + 7);
    doc.line(135, y + 14, 135, y + 35);

    doc.text('Name of Requesting Person', 17, y + 5);
    const requestingPersonText = (data.lastName || data.firstName)
      ? Utils.formatCombinedName(data.lastName, data.firstName, data.middleInitial)
      : (data.name || '');
    doc.text(doc.splitTextToSize(requestingPersonText, 65), 67, y + 5);
    const filingDate = Utils.getFilingDate(data);
    doc.text('Date: ' + filingDate, 137, y + 5);

    doc.text('Purpose / Activity', 17, y + 12);
    doc.text(doc.splitTextToSize(data.purpose || '', 125), 67, y + 11);

    doc.text('Date & Time of Use', 17, y + 19);
    const internalTimeRange = (data.startTime && data.endTime)
      ? `${Utils.formatTime12(data.startTime)} - ${Utils.formatTime12(data.endTime)}`
      : (data.startTime || data.endTime || '—');
    doc.text(`${data.date || ''} | ${internalTimeRange}`, 67, y + 19);
    doc.text('Destination', 137, y + 19);
    doc.text('(For Vehicle Only)', 137, y + 23);

    doc.text('Number of Persons', 17, y + 26);
    doc.text(String(data.numPersons || ''), 67, y + 26);
    doc.text(doc.splitTextToSize(data.destination || '', 55), 137, y + 27);

    doc.text('Equipment/Resources Needed', 17, y + 33);
    const equipStr = (data.equipment || []).map(e => typeof e === 'string' ? e : `${e.item}(x${e.qty})`).join(', ');
    doc.text(doc.splitTextToSize(equipStr || '', 65), 67, y + 32);
    doc.text('Driver', 137, y + 33);

    doc.text('Other Considerations', 17, y + 40);
    doc.text(doc.splitTextToSize(data.considerations || 'None', 125), 67, y + 40);

    const sigs = (data && data.signatories) ? data.signatories : internalSignatories;

    y += 50;
    doc.text('Noted:', 15, y);
    doc.line(25, y + 1, 75, y + 1);
    doc.text('Dean/Principal/Office Head', 50, y + 4, { align: 'center' });

    doc.line(125, y + 1, 190, y + 1);
    doc.text('Name & Signature of the Requesting Personnel', 157.5, y + 4, { align: 'center' });

    y += 10;
    drawSignatoryNameAboveLine(doc, sigs.facilitiesInCharge, 157.5, y + 1, 64);
    doc.line(125, y + 1, 190, y + 1);
    doc.text('Facilities In-charge', 157.5, y + 4, { align: 'center' });

    y += 10;
    doc.text('Verified:', 15, y);
    drawSignatoryNameAboveLine(doc, sigs.comptroller, 51.5, y + 1, 46);
    doc.line(28, y + 1, 75, y + 1);
    doc.text('Comptroller', 51.5, y + 4, { align: 'center' });

    doc.text('Approved:', 90, y);
    drawSignatoryNameAboveLine(doc, sigs.generalAdminCoordinator, 140, y + 1, 69);
    doc.line(105, y + 1, 175, y + 1);
    doc.text('General Admin Services Coordinator', 140, y + 4, { align: 'center' });

    y += 8;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.text('Note: Accomplish in 2 copies: Requesting person, Facilities In-charge', 15, y);
  }

  function downloadLastInternalPDF(fallbackRefId = 'booking') {
    const refId = (lastInternalPdfData && lastInternalPdfData.referenceId) || fallbackRefId;
    if (lastInternalPdfDoc) {
      lastInternalPdfDoc.save(getBookingPdfFilename('Internal', refId));
    } else if (lastInternalPdfData) {
      generateInternalBookingPDF(lastInternalPdfData);
    }
  }

  window.PdfService = {
    initSignatoriesListener,
    generateExternalBookingPDF,
    downloadLastExternalPDF,
    generateInternalBookingPDF,
    downloadLastInternalPDF
  };
})();

