# Graph Report - bookingsystem  (2026-11-25)

## Corpus Check
- 44 files · ~65,822 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .css 7, (none) 1, .rules 1)

## Summary
- 542 nodes · 802 edges · 53 communities (37 shown, 16 thin omitted)
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 159 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f21159c5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Dashboard Page & Core Integrations
- Excel Reports Vue Application
- Notification Service & Dropdown
- Shared Utilities & Helpers
- Public Booking Form Controller
- PDF Generation Service
- Booking Firestore Data Model
- Public Landing Page HTML
- Admin Dashboard Controller Logic
- Booking Form Input View
- Data Management & Export Controller
- Reservation Business Rules & Workflow
- Philippine Address Geolocation Service
- System Settings Data Model
- User & Role Data Model
- Facilities Showcase Vue Application
- Reservation Booking Page
- Activity Log Controller Logic
- Admin Resource Catalog Views
- Dashboard Table & Pagination Views
- login-app.js
- Settings & Signatories Controller
- Activity Logs Management Section
- Session Idle Timeout Security
- User Session Management
- Calendar View Controller Logic
- Department & Office Data Model
- Facility Firestore Data Model
- email-service.js
- FullCalendar Event Rendering View
- Data Cleanup & Backup Modals
- Logging & Error Handling Core
- Activity Log Firestore Data Model
- Classroom Firestore Data Model
- Driver Roster Data Model
- Vehicle Fleet Data Model
- Special Booking & Notifications
- Facility Image & Amenity Controller
- Account Management & Modals
- Classroom & Facility Management
- Vehicle Fleet & Driver Management
- Staff Account Management Controller
- Reservation Management Table & Modals
- Department Management Section
- Excel Export Dependencies
- Web Interface Guidelines
- Branding Assets & Logo

## God Nodes (most connected - your core abstractions)
1. `Dashboard Management Portal Page` - 75 edges
2. `Reservation Booking Page` - 19 edges
3. `init()` - 15 edges
4. `Public Landing Page HTML` - 15 edges
5. `FIC Operational Manual & System Overview` - 13 edges
6. `buildStandardBookingPdf()` - 10 edges
7. `notify()` - 10 edges
8. `Sidebar Navigation Component` - 10 edges
9. `Staff Portal Login Page` - 10 edges
10. `buildBookingPdfDoc()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Zero Double-Bookings Automated Conflict Detection` --conceptually_related_to--> `hasScheduleConflict()`  [INFERRED]
  FACILITY_IN_CHARGE_MANUAL.md → js/models/booking-model.js
- `Reservation Booking Page` --references--> `San Isidro College Logo`  [EXTRACTED]
  booking.html → images/logo.jpg
- `Staff Portal Login Page` --references--> `San Isidro College Logo`  [EXTRACTED]
  admin.html → images/logo.jpg
- `Landing Hero Section (#hero)` --references--> `San Isidro College Campus Background Image`  [EXTRACTED]
  index.html → images/campus-bg.jpg
- `Public Landing Page HTML` --references--> `San Isidro College Logo`  [EXTRACTED]
  index.html → images/logo.jpg

## Import Cycles
- None detected.

## Communities (53 total, 16 thin omitted)

### Community 0 - "Dashboard Page & Core Integrations"
Cohesion: 0.05
Nodes (40): Dashboard Management Portal Page, activity-log-model.js Data Model, admin-crud-view.js View Module, auth-model.js Data Model, Reservations Search & Filter Controls, booking-model.js Data Model, classroom-model.js Data Model, admin.css Stylesheet (+32 more)

### Community 1 - "Excel Reports Vue Application"
Cohesion: 0.08
Nodes (12): buildAndDownloadExcelWorkbook(), exportToExcel(), filteredBookings(), formatEquipmentCell(), formatFacilityCell(), getBookingCategoryLabel(), getBookingFacilityColumnValue(), getBookingIsoDateStr() (+4 more)

### Community 2 - "Notification Service & Dropdown"
Cohesion: 0.19
Nodes (28): buildNotificationPayload(), clearHistory(), closeDropdown(), ensureAudioContext(), getBookingDateLabel(), getPermissionState(), getUnreadCount(), init() (+20 more)

### Community 3 - "Shared Utilities & Helpers"
Cohesion: 0.09
Nodes (10): formatFacilityVisibilityLabel(), formatFilingDate(), formatTime12(), formatTimeRange12(), formatVehicleList(), getBookingLocation(), getBookingVehicleArray(), getFilingDate() (+2 more)

### Community 4 - "Public Booking Form Controller"
Cohesion: 0.13
Nodes (13): applyDateRangeMinConstraints(), applyPrefillFacilityIfNeeded(), checkConflictAndRender(), handleExtLoiFileChange(), hasPdfMagicBytes(), isAllowedDate(), isPdfFile(), linkDateRange() (+5 more)

### Community 5 - "PDF Generation Service"
Cohesion: 0.13
Nodes (26): applySignatoriesData(), buildBookingPdfDoc(), buildBookingPdfDownloadUrl(), buildStandardBookingPdf(), drawSection2Row(), decodeBookingPdfLinkPayload(), downloadBookingPdf(), downloadLastExternalPDF() (+18 more)

### Community 6 - "Booking Firestore Data Model"
Cohesion: 0.17
Nodes (12): bulkRemove(), computeLookupKey(), create(), fallbackSha256Hex(), findByReferenceAndEmail(), findForReceipt(), listenApprovedAndPending(), restoreMany() (+4 more)

### Community 7 - "Public Landing Page HTML"
Cohesion: 0.14
Nodes (14): Staff Portal Login Page, Staff Login Form (#loginForm), Vue 3 Login App Container (#loginApp), San Isidro College Campus Background Image, San Isidro College Logo, Availability Calendar Section (#calendar-section), Date Availability Modal (#dateAvailModal), Calendar Event Details Modal (#eventModal) (+6 more)

### Community 8 - "Admin Dashboard Controller Logic"
Cohesion: 0.18
Nodes (12): dataUrlToPdfBlobUrl(), downloadLetterOfIntentPdf(), getBookingDateBounds(), getCreatedAtMs(), getFilteredBookings(), getStatusFilteredBookings(), hasActiveSearchOrFilter(), listenBookings() (+4 more)

### Community 9 - "Booking Form Input View"
Cohesion: 0.17
Nodes (7): appendVehicleOption(), findVisibleField(), focusFirstError(), populateFacilitySelects(), setDepartmentsData(), showError(), updateIntDepartmentSchoolVisibility()

### Community 10 - "Data Management & Export Controller"
Cohesion: 0.29
Nodes (12): exportBookingsToExcel(), exportBookingsToJson(), formatEquipmentText(), getBackupTargetBookings(), getBookingReservationDate(), getMassDeleteExpectedPhraseStr(), getMassDeleteMatchingBookings(), populateYearOptions() (+4 more)

### Community 11 - "Reservation Business Rules & Workflow"
Cohesion: 0.17
Nodes (10): Schedule Conflict Warning Component, Internal User Reservation Form (#internalBookingForm), Internal Reservation Review Workflow, Audit Reports & Excel Export, Campus Resource Management, FIC Session Security & Idle Timeout Guard, FIC Operational Manual & System Overview, Booking ID Format & PDF Signatories Configuration (+2 more)

### Community 12 - "Philippine Address Geolocation Service"
Cohesion: 0.32
Nodes (12): byLabel(), collect(), enableManualAddress(), fillSelect(), init(), psgcFetch(), resetAddressBelow(), resolveDom() (+4 more)

### Community 14 - "User & Role Data Model"
Cohesion: 0.27
Nodes (6): createProfile(), getAll(), getProfile(), listenAll(), listenProfile(), normalizeProfile()

### Community 15 - "Facilities Showcase Vue Application"
Cohesion: 0.24
Nodes (4): closeFacilityDetailModal(), mounted(), openFacilityDetail(), renderCalendarLegend()

### Community 16 - "Reservation Booking Page"
Cohesion: 0.22
Nodes (10): Reservation Booking Page, External User Reservation Form (#externalBookingForm), External Reservation Success Modal (#extSuccessModal), Internal Reservation Success Modal (#successModal), Letter of Intent PDF Upload Section (#extLoiGroup), Philippine Cascading Address Dropdowns (#extAddressBlock), Receipt Upload Success Modal (#receiptSuccessModal), Payment Receipt Upload Form (#receiptUploadForm) (+2 more)

### Community 17 - "Activity Log Controller Logic"
Cohesion: 0.38
Nodes (8): filterByActor(), formatDetailsSummary(), formatLogTimestamp(), getFilteredLogs(), loadMonthLogs(), populateAccountFilterOptions(), renderStats(), renderTable()

### Community 18 - "Admin Resource Catalog Views"
Cohesion: 0.42
Nodes (7): canEditCatalog(), renderClassroomsTable(), renderDepartmentsTable(), renderDriversTable(), renderFacilitiesTable(), renderVehiclesTable(), viewOnlyLabelHtml()

### Community 19 - "Dashboard Table & Pagination Views"
Cohesion: 0.29
Nodes (6): buildPageNumbers(), getExternalOrgName(), isCollegeBooking(), isCollegeSchoolName(), populateFilterDropdowns(), renderBookingsTable()

### Community 20 - "login-app.js"
Cohesion: 0.60
Nodes (3): getReasonMessage(), login(), mounted()

### Community 21 - "Settings & Signatories Controller"
Cohesion: 0.39
Nodes (8): listenBookingIdConfig(), listenSignatoriesConfig(), renderPreviewSignatorySlot(), syncBookingIdFormFromState(), syncSignatoriesFormFromState(), updateActiveBookingIdBadges(), updateBookingIdDraftPreview(), updateSignatoriesPreview()

### Community 22 - "Activity Logs Management Section"
Cohesion: 0.29
Nodes (8): activity-log-controller.js Controller, Staff Activity Logs Section, Delete Monthly Logs Confirmation Modal, Booking ID Settings Section, Reset Booking ID Confirmation Modal, settings-controller.js Controller, Sidebar Navigation Component, PDF Signatories Section

### Community 23 - "Session Idle Timeout Security"
Cohesion: 0.61
Nodes (7): evaluateIdleState(), hideWarningModal(), init(), recordActivity(), showWarningModal(), triggerIdleLogout(), updateCountdownDisplay()

### Community 24 - "User Session Management"
Cohesion: 0.32
Nodes (4): isAdmin(), isFacilityInCharge(), requireAdmin(), requireFic()

### Community 27 - "Department & Office Data Model"
Cohesion: 0.38
Nodes (3): getActive(), getActiveByCategory(), getAll()

### Community 29 - "email-service.js"
Cohesion: 0.28
Nodes (12): canSendPublicSubmissionEmail(), getHostingerEmailEndpoint(), init(), isAllowedOrigin(), sendStatusNotification(), sendSubmissionConfirmation(), sendViaEmailJsFallback(), sendViaHostingerPhp() (+4 more)

### Community 31 - "Data Cleanup & Backup Modals"
Cohesion: 0.33
Nodes (6): data-management-controller.js Controller, Backup, Restore & Mass Cleanup Section, Danger Zone Monthly Data Cleanup, Administrator Password Re-authentication Modal, Confidential Public Schedule Sync, System Submission Mode Control

### Community 32 - "Logging & Error Handling Core"
Cohesion: 0.53
Nodes (4): error(), formatPrefix(), info(), warn()

### Community 33 - "Activity Log Firestore Data Model"
Cohesion: 0.53
Nodes (4): getCurrentMonthKey(), listByMonth(), log(), toMillis()

### Community 37 - "Special Booking & Notifications"
Cohesion: 0.40
Nodes (5): Notification Bell & Alert Dropdown, notification-service.js Service, special-booking-controller.js Controller, Special Booking Form Modal, Dashboard Topbar Component

### Community 39 - "Account Management & Modals"
Cohesion: 0.50
Nodes (4): account-controller.js Controller, Add/Edit Staff Account Modal, Manage Facility-In-Charge Accounts Section, Register Existing Firebase Login Modal

### Community 40 - "Classroom & Facility Management"
Cohesion: 0.50
Nodes (4): Add/Edit Classroom Modal, Manage Facilities & Classrooms Section, facility-controller.js Controller, Add/Edit Facility Modal

### Community 41 - "Vehicle Fleet & Driver Management"
Cohesion: 0.50
Nodes (4): Add/Edit Driver Modal, vehicle-controller.js Controller, Add/Edit Vehicle Modal, Manage Vehicles & Drivers Section

### Community 42 - "Staff Account Management Controller"
Cohesion: 0.83
Nodes (3): formatTimestamp(), renderAccountsTable(), startListening()

### Community 45 - "Reservation Management Table & Modals"
Cohesion: 0.67
Nodes (3): Reservation Details Modal, Reservations Table & Pagination, dashboard-controller.js Controller

### Community 46 - "Department Management Section"
Cohesion: 0.67
Nodes (3): department-controller.js Controller, Add/Edit Office/School Modal, Manage Departments & Offices Section

### Community 47 - "Excel Export Dependencies"
Cohesion: 0.67
Nodes (3): reports-app.js Vue 3 Application, Reports Generation Section (Vue 3), SheetJS XLSX Library 0.20.3

## Knowledge Gaps
- **62 isolated node(s):** `activity-log-model.js Data Model`, `admin-crud-view.js View Module`, `auth-model.js Data Model`, `Reservations Search & Filter Controls`, `booking-model.js Data Model` (+57 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 211 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Reservation Booking Page` connect `Reservation Booking Page` to `Public Booking Form Controller`, `PDF Generation Service`, `Booking Firestore Data Model`, `Public Landing Page HTML`, `Reservation Business Rules & Workflow`, `Philippine Address Geolocation Service`, `Facility Firestore Data Model`, `email-service.js`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **What connects `activity-log-model.js Data Model`, `admin-crud-view.js View Module`, `auth-model.js Data Model` to the rest of the system?**
  _62 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dashboard Page & Core Integrations` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._
- **Why does `MVC Architectural Rules` connect `Public Landing Page HTML` to `Excel Reports Vue Application`, `Public Booking Form Controller`, `Booking Firestore Data Model`, `Facilities Showcase Vue Application`, `Reservation Booking Page`, `login-app.js`, `email-service.js`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Should `Excel Reports Vue Application` be split into smaller, more focused modules?**
  _Cohesion score 0.0766488413547237 - nodes in this community are weakly interconnected._
- **Why does `Public Landing Page HTML` connect `Public Landing Page HTML` to `Booking Firestore Data Model`, `Reservation Business Rules & Workflow`, `Facilities Showcase Vue Application`, `Reservation Booking Page`, `Calendar View Controller Logic`, `Facility Firestore Data Model`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Should `Shared Utilities & Helpers` be split into smaller, more focused modules?**
  _Cohesion score 0.08831908831908832 - nodes in this community are weakly interconnected._