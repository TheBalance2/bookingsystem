/* ============================================================
   PDF Service — San Isidro College Reservation System
   Service Layer (js/services/pdf-service.js)
   Generates the exact standard school form from the adviser's
   official .docx template ("REQUEST FOR THE USE OF FACILITIES,
   VEHICLES & EQUIPMENT" — SIC-AFM-F-6.2) on Long Bond Paper
   (8.5" x 13" / 215.9mm x 330.2mm) with official header,
   colors (#002060, #0C165A, #D9D9D9), and footer.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'PdfService';

  // Long Bond Paper (8.5 x 13 inches in millimeters)
  const PAGE_WIDTH_MM  = 215.9;
  const PAGE_HEIGHT_MM = 330.2;

  // Exact colors extracted from REQUEST_FOR_THE_USE_OF_FACILITIES.docx XML
  const COLOR_SECTION_NAVY = [0, 32, 96];     // #002060
  const COLOR_HEADER_BLUE  = [12, 22, 90];    // #0C165A
  const COLOR_LABEL_GRAY   = [217, 217, 217]; // #D9D9D9
  const COLOR_BLACK        = [0, 0, 0];       // #000000
  const COLOR_WHITE        = [255, 255, 255]; // #FFFFFF

  let lastExternalPdfDoc  = null;
  let lastExternalPdfData = null;
  let lastInternalPdfDoc  = null;
  let lastInternalPdfData = null;

  let pdfSignatories = {
    facilitiesInCharge: '',
    comptroller: '',
    generalAdminCoordinator: '',
    vpAdminFinance: ''
  };
  let signatoriesLoaded = false;

  function applySignatoriesData(raw) {
    const d = raw || {};
    pdfSignatories = {
      facilitiesInCharge:      String(d.facilitiesInCharge || '').trim(),
      comptroller:             String(d.comptroller || '').trim(),
      generalAdminCoordinator: String(d.generalAdminCoordinator || '').trim(),
      vpAdminFinance:          String(d.vpAdminFinance || '').trim()
    };
    signatoriesLoaded = true;

    if (lastInternalPdfData) {
      lastInternalPdfData = {
        ...lastInternalPdfData,
        signatories: { ...pdfSignatories }
      };
      lastInternalPdfDoc = null;
    }
    if (lastExternalPdfData) {
      lastExternalPdfData = {
        ...lastExternalPdfData,
        signatories: { ...pdfSignatories }
      };
      lastExternalPdfDoc = null;
    }
  }

  function initSignatoriesListener() {
    if (typeof SettingsModel !== 'undefined' && typeof SettingsModel.listenSignatories === 'function') {
      SettingsModel.listenSignatories(applySignatoriesData);
    }
  }

  function ensureSignatoriesLoaded() {
    if (signatoriesLoaded) return Promise.resolve(pdfSignatories);
    if (typeof SettingsModel !== 'undefined' && typeof SettingsModel.getSignatories === 'function') {
      return SettingsModel.getSignatories()
        .then(sigs => {
          applySignatoriesData(sigs);
          return pdfSignatories;
        })
        .catch(() => pdfSignatories);
    }
    return Promise.resolve(pdfSignatories);
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

  function drawCheckbox(doc, x, y, checked) {
    const size = 2.9;
    doc.setLineWidth(0.22);
    doc.setDrawColor(...COLOR_BLACK);
    doc.setFillColor(...COLOR_WHITE);
    doc.rect(x, y - size + 0.35, size, size, 'FD');
    if (checked) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(...COLOR_BLACK);
      doc.text('X', x + 0.48, y - 0.1);
      doc.setFont('helvetica', 'normal');
    }
  }

  function formatEquipmentSummary(data) {
    const items = [];
    if (Array.isArray(data.equipment) && data.equipment.length > 0) {
      data.equipment.forEach(eq => {
        if (typeof eq === 'string') {
          items.push(eq);
        } else if (eq && eq.item) {
          items.push(`${eq.item} (${eq.qty || 1})`);
        }
      });
    }
    if (data.otherEquipment) {
      items.push(String(data.otherEquipment).trim());
    }
    return items.length > 0 ? items.join(', ') : '';
  }

  function resolveExternalShortAddress(data) {
    if (data.shortAddress && String(data.shortAddress).trim()) {
      return String(data.shortAddress).trim();
    }
    if (data.addressDetails && typeof data.addressDetails === 'object') {
      const p = data.addressDetails;
      const brgy = p.barangay
        ? (/^(brgy\.?|barangay)\s/i.test(p.barangay) ? p.barangay : `Brgy. ${p.barangay}`)
        : '';
      const short = [p.street, brgy, p.city].filter(Boolean).join(', ');
      if (short) return short;
    }
    if (data.address) {
      const parts = String(data.address).split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 3) {
        return parts.slice(0, 3).join(', ');
      }
      return String(data.address).trim();
    }
    return '';
  }

  function fitSingleLineText(doc, text, maxWidth) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    const lines = doc.splitTextToSize(raw, maxWidth);
    return lines[0] || '';
  }

  function buildStandardBookingPdf(doc, data, logoImg, logoFormat, userType) {
    const isInternal = userType === 'Internal';
    const leftX  = 9.2;
    const rightX = 206.7;
    const tableW = rightX - leftX; // 197.5mm
    const midX   = PAGE_WIDTH_MM / 2;

    const col1W = 65.0; // Left gray label column
    const col2W = 45.0; // Middle gray sub-label column
    const col3W = tableW - col1W - col2W; // 87.5mm right value column
    const rightSpanW = col2W + col3W; // 132.5mm

    // ============================================================
    // DOCUMENT HEADER (Matches word/header1.xml & screenshot)
    // ============================================================
    if (logoImg) {
      try {
        doc.addImage(logoImg, logoFormat || 'PNG', 11.2, 6.8, 20.5, 20.5);
      } catch (_) {}
    }

    const hdrTextX = 34.5;
    doc.setTextColor(...COLOR_HEADER_BLUE);

    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.text('SAN ISIDRO COLLEGE', hdrTextX, 11.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('City of Malaybalay', hdrTextX, 14.8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.text('OFFICE OF FACILITY IN-CHARGE', hdrTextX, 19.0);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('Contact Number:', hdrTextX, 22.8);
    doc.text('Email:', 96.0, 22.8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('REQUEST FOR THE USE OF FACILITIES, VEHICLES & EQUIPMENT', hdrTextX, 27.6);

    // Thick dark-blue horizontal rule under header
    doc.setDrawColor(...COLOR_HEADER_BLUE);
    doc.setLineWidth(0.8);
    doc.line(leftX + 1.0, 29.7, rightX - 1.0, 29.7);

    // Control No. line on top-right
    doc.setTextColor(...COLOR_SECTION_NAVY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Control No.', 149.8, 37.8);

    doc.setDrawColor(...COLOR_BLACK);
    doc.setLineWidth(0.22);
    doc.line(166.2, 38.3, 204.2, 38.3);

    if (data.referenceId) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(String(data.referenceId), 168.0, 37.6);
    }

    // ============================================================
    // MAIN FORM TABLE
    // ============================================================
    let y = 41.5;
    doc.setDrawColor(...COLOR_BLACK);
    doc.setLineWidth(0.22);

    function drawNavySectionBar(titleText) {
      const h = 5.6;
      doc.setFillColor(...COLOR_SECTION_NAVY);
      doc.setDrawColor(...COLOR_BLACK);
      doc.rect(leftX, y, tableW, h, 'FD');
      doc.setTextColor(...COLOR_WHITE);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text(titleText, midX, y + 4.0, { align: 'center' });
      doc.setTextColor(...COLOR_BLACK);
      y += h;
    }

    // ---- I – TYPE OF REQUESTING PERSONNEL ----
    drawNavySectionBar('I – TYPE OF REQUESTING PERSONNEL');

    const sec1H = 10.6;
    doc.setFillColor(...COLOR_LABEL_GRAY);
    doc.rect(leftX, y, col1W, sec1H, 'FD');
    doc.setFillColor(...COLOR_WHITE);
    doc.rect(leftX + col1W, y, rightSpanW, sec1H, 'FD');

    doc.setTextColor(...COLOR_BLACK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Please check the appropriate', leftX + col1W / 2, y + 4.3, { align: 'center' });
    doc.text('classification', leftX + col1W / 2, y + 8.5, { align: 'center' });

    const cbX1 = leftX + col1W + 2.6;
    // Option 1: Internal User
    drawCheckbox(doc, cbX1, y + 4.2, isInternal);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    const intBoldLbl = 'Internal User ';
    doc.text(intBoldLbl, cbX1 + 3.8, y + 4.2);
    const intBoldW = doc.getTextWidth(intBoldLbl);
    doc.setFont('helvetica', 'normal');
    doc.text('– SIC Faculty / Employee / Office / Department', cbX1 + 3.8 + intBoldW, y + 4.2);

    // Option 2: External User
    drawCheckbox(doc, cbX1, y + 8.6, !isInternal);
    doc.setFont('helvetica', 'bold');
    const extBoldLbl = 'External User ';
    doc.text(extBoldLbl, cbX1 + 3.8, y + 8.6);
    const extBoldW = doc.getTextWidth(extBoldLbl);
    doc.setFont('helvetica', 'normal');
    doc.text('– Individual / Organization / Institution', cbX1 + 3.8 + extBoldW, y + 8.6);

    y += sec1H;

    // ---- II – REQUESTING PERSONNEL INFORMATION ----
    drawNavySectionBar('II – REQUESTING PERSONNEL INFORMATION');

    const requesterName = data.name || data.contactPerson || Utils.formatCombinedName(data.lastName, data.firstName, data.middleInitial) || '';
    const deptOrOrg = isInternal
      ? ((data.parentDepartment && data.collegeSchool)
          ? `${data.parentDepartment} – ${data.collegeSchool}`
          : (data.collegeSchool || data.department || ''))
      : (data.organization || [data.agencyName || data.agency, data.officeName].filter(Boolean).join(' – ') || '');

    const positionStr = data.position || '';
    const contactStr  = data.contactNumber || data.contact || '';
    const emailStr    = data.email || '';
    const addressStr  = isInternal
      ? 'San Isidro College Impalambong'
      : resolveExternalShortAddress(data);

    function drawSection2Row(label, value) {
      const h = 6.4;
      doc.setFillColor(...COLOR_LABEL_GRAY);
      doc.rect(leftX, y, col1W, h, 'FD');
      doc.setFillColor(...COLOR_WHITE);
      doc.rect(leftX + col1W, y, rightSpanW, h, 'FD');

      doc.setTextColor(...COLOR_BLACK);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(label, leftX + 2.2, y + 4.4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(fitSingleLineText(doc, value, rightSpanW - 5), leftX + col1W + 2.5, y + 4.4);
      y += h;
    }

    drawSection2Row('Name of Requesting Personnel', requesterName);
    drawSection2Row('Department / Office / Organization', deptOrOrg);
    drawSection2Row('Position / Designation', positionStr);
    drawSection2Row('Contact Number', contactStr);
    drawSection2Row('Email Address', emailStr);
    drawSection2Row('Office / Organization Address', addressStr);

    // ---- III – DETAILS REQUEST ----
    drawNavySectionBar('III – DETAILS REQUEST (Please check the facility to be requested)');

    // A. Facility Requested
    const facBlockH = 24.5;
    doc.setFillColor(...COLOR_LABEL_GRAY);
    doc.rect(leftX, y, col1W, facBlockH, 'FD');
    doc.setFillColor(...COLOR_WHITE);
    doc.rect(leftX + col1W, y, rightSpanW, facBlockH, 'FD');

    doc.setTextColor(...COLOR_BLACK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.text('A.   Facility Requested', leftX + 2.2, y + 13.5);

    const rawFacility = String(data.facility || '').trim();
    const normFac = rawFacility.toLowerCase();
    const isClassroomFac = Utils.isClassroomFacilityName(rawFacility);

    const isGym       = normFac === 'gymnasium';
    const isStudCtr   = normFac === 'student center';
    const isSmdc      = normFac === 'smdc conference room';
    const isField     = normFac === 'field / oval' || normFac === 'field/oval';
    const isChapel    = normFac === 'chapel';
    const isBoardRoom = normFac === 'board room' || normFac === 'defense room';
    const isLab       = normFac === 'laboratory';
    const isStandardKnown = isGym || isStudCtr || isSmdc || isField || isChapel || isClassroomFac || isBoardRoom || isLab;
    const isOtherFac  = Boolean(rawFacility && rawFacility !== 'Vehicle' && !isStandardKnown);

    const classroomLabel = (isClassroomFac && data.classroom)
      ? `Classroom (${data.classroom})`
      : 'Classroom';
    const otherFacLabel = isOtherFac
      ? `Other: ${rawFacility}`
      : 'Other:';

    const facColLeftX  = leftX + col1W + 2.6;
    const facColRightX = leftX + col1W + 66.2;

    const facLeftItems = [
      { label: 'Gymnasium', checked: isGym },
      { label: 'SMDC Conference Room', checked: isSmdc },
      { label: 'Chapel', checked: isChapel },
      { label: 'Board Room', checked: isBoardRoom },
      { label: otherFacLabel, checked: isOtherFac }
    ];
    const facRightItems = [
      { label: 'Student Center', checked: isStudCtr },
      { label: 'Field / Oval', checked: isField },
      { label: classroomLabel, checked: isClassroomFac },
      { label: 'Laboratory', checked: isLab }
    ];

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    facLeftItems.forEach((item, idx) => {
      const rowY = y + 4.3 + idx * 4.5;
      drawCheckbox(doc, facColLeftX, rowY, item.checked);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(fitSingleLineText(doc, item.label, 58), facColLeftX + 3.8, rowY);
    });

    facRightItems.forEach((item, idx) => {
      const rowY = y + 4.3 + idx * 4.5;
      drawCheckbox(doc, facColRightX, rowY, item.checked);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(fitSingleLineText(doc, item.label, 58), facColRightX + 3.8, rowY);
    });

    y += facBlockH;

    // B. Vehicle Requested
    const vehCheckRowH = 5.7;
    const vehSubRowH   = 7.5;
    const vehTopLeftH  = vehCheckRowH + vehSubRowH; // 13.2mm
    const vehBotLeftH  = vehSubRowH * 2;            // 15.0mm

    // Top-left cell ("B. Vehicle Requested")
    doc.setFillColor(...COLOR_LABEL_GRAY);
    doc.rect(leftX, y, col1W, vehTopLeftH, 'FD');
    doc.setTextColor(...COLOR_BLACK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.text('B.   Vehicle Requested', leftX + 2.2, y + 7.6);

    // Bottom-left cell ("(To be accomplished by the Facility In-charge)")
    doc.setFillColor(...COLOR_LABEL_GRAY);
    doc.rect(leftX, y + vehTopLeftH, col1W, vehBotLeftH, 'FD');
    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(7.5);
    doc.text('(To be accomplished by the Facility In-charge)', leftX + col1W / 2, y + vehTopLeftH + 8.3, { align: 'center' });

    // Vehicle Row 1: Checkboxes
    doc.setFillColor(...COLOR_WHITE);
    doc.rect(leftX + col1W, y, rightSpanW, vehCheckRowH, 'FD');

    const selectedVehicles = Array.isArray(data.vehicle)
      ? data.vehicle
      : (data.vehicle && data.vehicle !== 'None' ? [String(data.vehicle)] : []);
    const hasGrandia = selectedVehicles.some(v => /grandia/i.test(v));
    const hasKia     = selectedVehicles.some(v => /kia/i.test(v));
    const otherVehicles = selectedVehicles.filter(v => !/grandia/i.test(v) && !/kia/i.test(v));

    drawCheckbox(doc, facColLeftX, y + 4.1, hasGrandia);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Toyota Grandia Van', facColLeftX + 3.8, y + 4.1);

    const kiaCheckX = leftX + col1W + 53.8;
    drawCheckbox(doc, kiaCheckX, y + 4.1, hasKia || otherVehicles.length > 0);
    const secondVehLabel = otherVehicles.length > 0
      ? (hasKia ? `KIA Utility Van / ${otherVehicles.join(', ')}` : `KIA Utility Van (${otherVehicles.join(', ')})`)
      : 'KIA Utility Van';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(fitSingleLineText(doc, secondVehLabel, 70), kiaCheckX + 3.8, y + 4.1);

    y += vehCheckRowH;

    function drawSubLabelValueRow(subLabel, value, rowH = 7.5) {
      doc.setFillColor(...COLOR_LABEL_GRAY);
      doc.rect(leftX + col1W, y, col2W, rowH, 'FD');
      doc.setFillColor(...COLOR_WHITE);
      doc.rect(leftX + col1W + col2W, y, col3W, rowH, 'FD');

      doc.setTextColor(...COLOR_BLACK);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(subLabel, leftX + col1W + 2.2, y + 4.9);

      doc.text(fitSingleLineText(doc, value, col3W - 5), leftX + col1W + col2W + 2.5, y + 4.9);
      y += rowH;
    }

    drawSubLabelValueRow('Destination', data.destination || '', vehSubRowH);
    drawSubLabelValueRow('Driver Name', data.assignedDriverName || '', vehSubRowH);
    drawSubLabelValueRow('Driver Contact Number', data.assignedDriverPhone || '', vehSubRowH);

    // C. Purpose and Schedule (3 rows of 7.5mm = 22.5mm)
    const purpBlockH = vehSubRowH * 3;
    doc.setFillColor(...COLOR_LABEL_GRAY);
    doc.rect(leftX, y, col1W, purpBlockH, 'FD');
    doc.setTextColor(...COLOR_BLACK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.text('C.   Purpose and Schedule', leftX + 2.2, y + 12.2);

    const dateRangeStr = data.date || Utils.formatDateRange(data.startDate, data.endDate) || '';
    const timeRangeStr = (data.startTime && data.endTime)
      ? Utils.formatTimeRange12(data.startTime, data.endTime)
      : (data.startTime || data.endTime || '');
    const dateTimeCombined = [dateRangeStr, timeRangeStr].filter(Boolean).join('  |  ');

    drawSubLabelValueRow('Purpose of Activity', data.purpose || '', vehSubRowH);
    drawSubLabelValueRow('Date & Time of Use', dateTimeCombined, vehSubRowH);
    drawSubLabelValueRow('Number of Participants', String(data.numPersons || ''), vehSubRowH);

    // D. Equipment Needed (2 rows of 7.5mm = 15.0mm)
    const eqBlockH = vehSubRowH * 2;
    doc.setFillColor(...COLOR_LABEL_GRAY);
    doc.rect(leftX, y, col1W, eqBlockH, 'FD');
    doc.setTextColor(...COLOR_BLACK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.text('D.   Equipment Needed', leftX + 2.2, y + 8.5);

    drawSubLabelValueRow('Equipment & Quantity', formatEquipmentSummary(data), vehSubRowH);
    drawSubLabelValueRow('Other Considerations', data.considerations || '', vehSubRowH);

    // Donation for Maintenance (For External Users)
    const donH = 8.4;
    const donLeftW = col1W + col2W; // 110.0mm
    doc.setFillColor(...COLOR_LABEL_GRAY);
    doc.rect(leftX, y, donLeftW, donH, 'FD');
    doc.setFillColor(...COLOR_WHITE);
    doc.rect(leftX + donLeftW, y, col3W, donH, 'FD');

    doc.setTextColor(...COLOR_BLACK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    doc.text('Donation for Maintenance', leftX + 2.2, y + 4.3);
    doc.setFontSize(6.2);
    doc.text('(For External Users)', leftX + 2.2, y + 7.2);
    y += donH;

    // ---- IV – DECLARATION OF RESPONSIBILITY ----
    drawNavySectionBar('IV – DECLARATION OF RESPONSIBILITY');

    const declH = 22.0;
    doc.setFillColor(...COLOR_WHITE);
    doc.rect(leftX, y, tableW, declH, 'FD');
    doc.setTextColor(...COLOR_BLACK);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);

    const declP1 = 'I hereby certify that the information provided in this request is true and correct. I understand that the use of the requested facilities, vehicles, and equipment is subject to the approval of the authorized personnel of San Isidro College.';
    const declP2 = 'I further acknowledge that I shall be responsible for any loss, damage, or misuse of the facilities, vehicles, and equipment arising from the approved activity, subject to the applicable institutional policies.';

    doc.text(doc.splitTextToSize(declP1, tableW - 4.4), leftX + 2.2, y + 4.2);
    doc.text(doc.splitTextToSize(declP2, tableW - 4.4), leftX + 2.2, y + 14.2);
    y += declH;

    // ---- SIGNATORIES BLOCK (Single outer bordered container, 6 signature lines) ----
    const sigBoxH = 59.0;
    doc.setFillColor(...COLOR_WHITE);
    doc.rect(leftX, y, tableW, sigBoxH, 'FD');

    const sigs = (data && data.signatories) || pdfSignatories || {};
    const autoRequesterName = requesterName;
    const autoOfficeHead    = isInternal ? String(data.officeHead || '').trim() : '';

    // Column X bounds for the 3 signature lines
    const c1Start = leftX + 2.0;
    const c1End   = leftX + 62.3;
    const c1Mid   = (c1Start + c1End) / 2;

    const c2Start = leftX + 69.8;
    const c2End   = leftX + 129.8;
    const c2Mid   = (c2Start + c2End) / 2;

    const c3Start = leftX + 138.8;
    const c3End   = rightX - 2.0;
    const c3Mid   = (c3Start + c3End) / 2;

    // Row 1 Prefix ("Noted by")
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text('Noted by', c3Start, y + 8.5);

    const lineY1 = y + 20.5;
    doc.setLineWidth(0.22);
    doc.line(c1Start, lineY1, c1End, lineY1);
    doc.line(c2Start, lineY1, c2End, lineY1);
    doc.line(c3Start, lineY1, c3End, lineY1);

    // Row 1 Printed Names (Auto Requester, Auto Office Head for Internal, Facility In-charge)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.3);
    if (autoRequesterName) {
      doc.text(fitSingleLineText(doc, autoRequesterName, c1End - c1Start - 2), c1Mid, lineY1 - 1.4, { align: 'center' });
    }
    if (autoOfficeHead) {
      doc.text(fitSingleLineText(doc, autoOfficeHead, c2End - c2Start - 2), c2Mid, lineY1 - 1.4, { align: 'center' });
    }
    if (sigs.facilitiesInCharge) {
      doc.text(fitSingleLineText(doc, sigs.facilitiesInCharge, c3End - c3Start - 2), c3Mid, lineY1 - 1.4, { align: 'center' });
    }

    // Row 1 Role Titles
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.text('Signature over Printed Name of Requesting', c1Mid, lineY1 + 3.5, { align: 'center' });
    doc.text('Personnel', c1Mid, lineY1 + 7.0, { align: 'center' });
    doc.text('Dean / Principal / Office Head', c2Mid, lineY1 + 3.5, { align: 'center' });
    doc.text('Facility In-charge', c3Mid, lineY1 + 3.5, { align: 'center' });

    // Row 2 Prefixes ("Verified by", "Approved by")
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text('Verified by', c1Start, y + 36.0);
    doc.text('Approved by', c3Start, y + 36.0);

    const lineY2 = y + 49.0;
    doc.line(c1Start, lineY2, c1End, lineY2);
    doc.line(c2Start, lineY2, c2End, lineY2);
    doc.line(c3Start, lineY2, c3End, lineY2);

    // Row 2 Printed Names (Comptroller, General Admin Service Coordinator, VP Admin & Finance)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.3);
    if (sigs.comptroller) {
      doc.text(fitSingleLineText(doc, sigs.comptroller, c1End - c1Start - 2), c1Mid, lineY2 - 1.4, { align: 'center' });
    }
    if (sigs.generalAdminCoordinator) {
      doc.text(fitSingleLineText(doc, sigs.generalAdminCoordinator, c2End - c2Start - 2), c2Mid, lineY2 - 1.4, { align: 'center' });
    }
    if (sigs.vpAdminFinance) {
      doc.text(fitSingleLineText(doc, sigs.vpAdminFinance, c3End - c3Start - 2), c3Mid, lineY2 - 1.4, { align: 'center' });
    }

    // Row 2 Role Titles
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.text('Comptroller', c1Mid, lineY2 + 3.5, { align: 'center' });
    doc.text('General Admin Service Coordinator', c2Mid, lineY2 + 3.5, { align: 'center' });
    doc.text('Vice President for Administration &', c3Mid, lineY2 + 3.5, { align: 'center' });
    doc.text('Finance', c3Mid, lineY2 + 7.0, { align: 'center' });

    y += sigBoxH;

    // ---- BOTTOM INSTRUCTIONS ROW ----
    const instrH = 13.0;
    doc.setFillColor(...COLOR_WHITE);
    doc.rect(leftX, y, tableW, instrH, 'FD');

    function drawRichInstructionLine(lineY, prefixBoldUnderline, part1, boldMid, part2) {
      let curX = leftX + 2.0;
      doc.setFontSize(6.5);

      doc.setFont('helvetica', 'bold');
      doc.text(prefixBoldUnderline, curX, lineY);
      const pw = doc.getTextWidth(prefixBoldUnderline);
      doc.setLineWidth(0.18);
      doc.line(curX, lineY + 0.45, curX + pw, lineY + 0.45);
      curX += pw;

      doc.setFont('helvetica', 'normal');
      doc.text(part1, curX, lineY);
      curX += doc.getTextWidth(part1);

      if (boldMid) {
        doc.setFont('helvetica', 'bold');
        doc.text(boldMid, curX, lineY);
        curX += doc.getTextWidth(boldMid);
      }

      if (part2) {
        doc.setFont('helvetica', 'normal');
        doc.text(part2, curX, lineY);
      }
    }

    drawRichInstructionLine(
      y + 2.9,
      'FOR EXTERNAL USERS:',
      ' Please print and accomplish ',
      'FOUR (4) COPIES',
      ' of this form. The copies shall be distributed as follows: (Requesting Person, School Guard, Facility In-Charge, Comptroller)'
    );
    drawRichInstructionLine(
      y + 5.9,
      'REQUIREMENT:',
      ' Attach the ',
      'ORIGINAL COPY of the Letter of Intent',
      ' addressed to San Isidro College, stating the purpose and details of the requested use of the SIC facility.'
    );
    drawRichInstructionLine(
      y + 8.9,
      'FOR INTERNAL USERS:',
      ' Please print and accomplish ',
      'TWO (2) COPIES',
      ' of this form. The copies shall be distributed as follows: (Requesting Person, Facility In-Charge)'
    );
    drawRichInstructionLine(
      y + 11.9,
      'REMINDER:',
      ' Ensure all required information is completed, and the necessary approvals are secured before the scheduled use of the requested facilities, vehicles, or equipment.',
      '',
      ''
    );

    y += instrH;

    // ============================================================
    // DOCUMENT FOOTER (Matches word/footer1.xml & screenshot)
    // ============================================================
    const ftrTopY = 309.0;
    const ftrLeftX = 16.2;
    const ftrTableW = 183.5;
    const ftrColW = ftrTableW / 4;
    const ftrRowH = 4.0;

    doc.setDrawColor(...COLOR_HEADER_BLUE);
    doc.setTextColor(...COLOR_HEADER_BLUE);
    doc.setLineWidth(0.28);

    const ftrHeaders = ['Document No.', 'Effectivity Date', 'Revision No.', 'Page No'];
    const ftrValues  = ['SIC-AFM-F-6.2', 'August 3, 2026', '00', '1 of 1'];

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    for (let i = 0; i < 4; i++) {
      const cx = ftrLeftX + i * ftrColW;
      doc.rect(cx, ftrTopY, ftrColW, ftrRowH);
      doc.text(ftrHeaders[i], cx + ftrColW / 2, ftrTopY + 2.8, { align: 'center' });

      doc.rect(cx, ftrTopY + ftrRowH, ftrColW, ftrRowH);
      doc.text(ftrValues[i], cx + ftrColW / 2, ftrTopY + ftrRowH + 2.8, { align: 'center' });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Member: PAASCU, CEAP, BUACS', midX, ftrTopY + ftrRowH * 2 + 3.6, { align: 'center' });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.text(
      'Forming Competent Men and Women of Prayer and Service for Others',
      midX,
      ftrTopY + ftrRowH * 2 + 7.2,
      { align: 'center' }
    );
  }

  function renderAndSavePdf(data, userType) {
    ensureSignatoriesLoaded().then(sigs => {
      const enrichedData = {
        ...data,
        userType,
        signatories: { ...sigs, ...(data && data.signatories ? data.signatories : {}) }
      };

      if (userType === 'Internal') {
        lastInternalPdfDoc  = null;
        lastInternalPdfData = enrichedData;
      } else {
        lastExternalPdfDoc  = null;
        lastExternalPdfData = enrichedData;
      }

      const { jsPDF } = window.jspdf;
      // Create Long Bond Paper (8.5" x 13" / 215.9mm x 330.2mm) portrait document
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: [PAGE_WIDTH_MM, PAGE_HEIGHT_MM]
      });

      const finalize = (logoImg, logoFormat) => {
        buildStandardBookingPdf(doc, enrichedData, logoImg, logoFormat, userType);
        if (userType === 'Internal') {
          lastInternalPdfDoc = doc;
        } else {
          lastExternalPdfDoc = doc;
        }
        doc.save(getBookingPdfFilename(userType, enrichedData.referenceId));
      };

      try {
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        logoImg.onload  = () => finalize(logoImg, 'PNG');
        logoImg.onerror = () => {
          const fallbackImg = new Image();
          fallbackImg.crossOrigin = 'anonymous';
          fallbackImg.onload  = () => finalize(fallbackImg, 'JPEG');
          fallbackImg.onerror = () => finalize(null, null);
          fallbackImg.src = 'images/logo.jpg';
        };
        logoImg.src = 'images/sic-header-logo.png';
      } catch (err) {
        Logger.warn(LAYER, 'Could not load logo for PDF:', err);
        finalize(null, null);
      }
    });
  }

  function generateExternalBookingPDF(data) {
    renderAndSavePdf(data, 'External');
  }

  function generateInternalBookingPDF(data) {
    renderAndSavePdf(data, 'Internal');
  }

  function downloadLastExternalPDF(fallbackRefId) {
    if (lastExternalPdfDoc && lastExternalPdfData) {
      lastExternalPdfDoc.save(getBookingPdfFilename('External', lastExternalPdfData.referenceId || fallbackRefId));
    } else if (lastExternalPdfData) {
      generateExternalBookingPDF(lastExternalPdfData);
    }
  }

  function downloadLastInternalPDF(fallbackRefId) {
    if (lastInternalPdfDoc && lastInternalPdfData) {
      lastInternalPdfDoc.save(getBookingPdfFilename('Internal', lastInternalPdfData.referenceId || fallbackRefId));
    } else if (lastInternalPdfData) {
      generateInternalBookingPDF(lastInternalPdfData);
    }
  }

  window.generateExternalBookingPDF = generateExternalBookingPDF;
  window.generateInternalBookingPDF = generateInternalBookingPDF;

  window.PdfService = {
    initSignatoriesListener,
    generateExternalBookingPDF,
    generateInternalBookingPDF,
    downloadLastExternalPDF,
    downloadLastInternalPDF,
    getBookingPdfFilename
  };
})();
