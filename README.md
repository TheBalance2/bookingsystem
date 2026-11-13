# San Isidro College — Digital Reservation System

A web-based digital reservation system for booking campus facilities, equipment, and vehicles at **San Isidro College (Malaybalay City, Bukidnon)**, featuring real-time availability calendars, automated conflict detection, official PDF reservation forms, payment receipt verification, and an administrative management portal.

---

## Technology Stack & Frameworks

| Layer | Technology / Framework | Purpose |
| :--- | :--- | :--- |
| **Architectural Pattern** | **MVC (Model–View–Controller)** | Separates database access (**Models**), UI rendering (**Views**), and business/event logic (**Controllers**) into dedicated modules |
| **Reactive Frontend Framework** | **Vue.js 3** (`3.5.13` CDN build) | Provides reactive two-way data binding (`v-model`), declarative list rendering (`v-for`), and computed state for the Admin Login, Landing Page Facilities Showcase & Gallery Modal, and Admin Reports & Excel Export |
| **CSS Layout Framework** | **Bootstrap 5** (`5.3.3` Grid & Utilities) + **Custom CSS Design System** | Responsive 12-column grid (`row`, `col-*`, `g-*`) and flex/spacing utilities paired with custom Navy & Gold brand variables (`css/core.css`) |
| **Backend-as-a-Service (BaaS)** | **Google Firebase** (Cloud Firestore + Firebase Authentication) | Real-time NoSQL cloud database (`bookings`, `facilities`, `facility_images`, `vehicles`, `counters`) and administrator authentication |
| **Supporting Libraries** | **FullCalendar 6**, **jsPDF 2.5**, **SheetJS (XLSX)**, **EmailJS 4**, **PSGC GitLab API** | Interactive availability calendar, downloadable Internal/External PDF forms, Excel report generation, automated email notifications, and Philippine address cascading dropdowns |

---

## System Architecture (MVC + Vue.js 3)

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                        HTML Pages + Bootstrap 5 Grid                       │
│         (index.html, booking.html, admin.html, dashboard.html)             │
└───────────────┬────────────────────────────────────────────┬───────────────┘
                │                                            │
                ▼                                            ▼
┌───────────────────────────────────┐        ┌───────────────────────────────┐
│        Vue.js 3 Apps              │        │      MVC Views (js/views/)    │
│      (js/vue-apps/*.js)           │        │  DOM rendering & UI templates │
│  • login-app.js (admin.html)      │        └───────────────▲───────────────┘
│  • facilities-app.js (index.html) │                        │
│  • reports-app.js (dashboard.html)│        ┌───────────────┴───────────────┐
└───────────────┬───────────────────┘        │  MVC Controllers              │
                │                            │  (js/controllers/*.js)        │
                │                            │  Event handlers & validation  │
                │                            └───────┬───────────────┬───────┘
                │                                    │               │
                │                            ┌───────▼───────┐       │
                │                            │ MVC Services  │       │
                │                            │ (js/services/)│       │
                │                            │ Email, PDF,   │       │
                │                            │ PSGC, Notifs  │       │
                │                            └───────────────┘       │
                └──────────────────────┬─────────────────────────────┘
                                       ▼
                     ┌───────────────────────────────────┐
                     │       MVC Models (js/models/)     │
                     │  Single source of truth for all   │
                     │  Firestore (db) & Auth (auth) I/O │
                     └─────────────────┬─────────────────┘
                                       ▼
                     ┌───────────────────────────────────┐
                     │   Core Layer (js/core/)           │
                     │  firebase-config, logger, utils   │
                     └───────────────────────────────────┘
```

### Architectural Rules
1. **Models (`js/models/`)** are the **only** files allowed to call `db.collection(...)` or `auth.*`.
2. **Views (`js/views/`)** and **Vue Apps (`js/vue-apps/`)** handle UI rendering and never write directly to Firestore.
3. **Controllers (`js/controllers/`)** coordinate user actions, validation, Services, Models, and Views.
4. **Core Utilities (`js/core/utils.js`)** hold shared helpers (`escapeHtml`, `formatTime12`, `formatSequentialBookingId`, `compressImage`, etc.) in a single place (`window.Utils`).

---

## Project Folder Structure

```text
bookingsystem/
├── index.html                              # Public landing page (Vue 3 Facilities + FullCalendar)
├── booking.html                            # Internal & External reservation forms + Receipt upload
├── admin.html                              # Admin login portal (Vue 3 reactive form)
├── dashboard.html                          # Admin dashboard (Bookings, Facilities, Vehicles, Vue 3 Reports, Settings)
├── firestore.rules                         # Cloud Firestore security rules
├── css/
│   ├── core.css                            # Brand variables (--navy, --gold), typography, buttons
│   ├── layout.css                          # Navbar and footer layout
│   ├── components.css                      # Cards, forms, modals, badges, tables, toasts
│   ├── landing.css                         # Hero section, facility cards, FullCalendar overrides
│   ├── booking.css                         # Booking forms, receipt upload steps
│   ├── admin.css                           # Sidebar, topbar, stats cards, notifications, settings
│   └── responsive.css                      # Tablet and mobile media queries
└── js/
    ├── core/
    │   ├── firebase-config.js              # Firebase SDK initialization (db, auth)
    │   ├── logger.js                       # Scoped console logger ([Module] tags)
    │   └── utils.js                        # Shared formatting, sanitization, and image helpers
    ├── models/
    │   ├── auth-model.js                   # Firebase Auth login, logout, session observer
    │   ├── booking-model.js                # Bookings CRUD, conflict queries, sequential ID transactions
    │   ├── classroom-model.js              # Classrooms Firestore CRUD (Room No., Capacity, Status)
    │   ├── driver-model.js                 # Drivers Firestore CRUD (Driver Name, Phone Number, Status)
    │   ├── facility-model.js               # Facilities & facility_images Firestore operations + Form Visibility
    │   ├── vehicle-model.js                # Vehicles Firestore CRUD
    │   └── settings-model.js               # Counter config & Internal PDF signatories
    ├── services/
    │   ├── address-service.js              # PSGC Philippine address API cascading dropdowns
    │   ├── email-service.js                # EmailJS confirmation, approval, and rejection emails
    │   ├── notification-service.js         # Real-time admin audio chime, desktop alerts, bell dropdown
    │   └── pdf-service.js                  # jsPDF Internal (2-copy RFUFVE) & External PDF generators
    ├── views/
    │   ├── ui-view.js                      # Admin toast notifications & full-size receipt image viewer
    │   ├── booking-form-view.js            # Booking form dropdowns, field errors, conflict banners, modals
    │   ├── calendar-view.js                # FullCalendar event & date-availability modal renderers
    │   ├── dashboard-view.js               # Admin stats counters, filter dropdowns, bookings table & detail modal
    │   └── admin-crud-view.js              # Admin Facilities/Vehicles tables, amenity tags, ID/Signatory previews
    ├── controllers/
    │   ├── calendar-controller.js          # Landing page FullCalendar initialization & modal events
    │   ├── booking-controller.js           # Public Internal/External booking & receipt upload workflows
    │   ├── dashboard-controller.js         # Admin auth guard, real-time listeners, filters, approve/reject/delete
    │   ├── facility-controller.js          # Admin facility add/edit/delete & photo upload workflows
    │   ├── vehicle-controller.js           # Admin vehicle add/edit/delete workflows
    │   ├── special-booking-controller.js   # Admin Special Booking modal workflow
    │   └── settings-controller.js          # Admin Booking ID format/reset & PDF Signatories workflows
    └── vue-apps/
        ├── login-app.js                    # Vue 3 app for admin.html (#loginApp)
        ├── facilities-app.js               # Vue 3 app for index.html (#facilitiesApp)
        └── reports-app.js                  # Vue 3 app for dashboard.html (#reportsSection)
```

---

## Debugging Guide (Symptom → File)

Every module logs to the browser console with a scoped prefix (e.g. `[BookingModel]`, `[BookingController]`, `[EmailService]`) via `js/core/logger.js`. When debugging an issue, use the table below to jump directly to the responsible file:

| Symptom / Bug | MVC Layer | Exact File to Inspect |
| :--- | :--- | :--- |
| Booking not saving, conflict check wrong, or sequential ID (`SIC-2026-001`) not incrementing | **Model** | `js/models/booking-model.js` |
| Facilities, form visibility (`Internal` / `External` / `Both`), or gallery photos not saving | **Model** | `js/models/facility-model.js` |
| Classrooms not loading or saving in Manage Classrooms / Booking dropdown | **Model / Controller** | `js/models/classroom-model.js`, `js/controllers/facility-controller.js` |
| Vehicles or Drivers not loading/saving in Manage Vehicles & Drivers | **Model / Controller** | `js/models/vehicle-model.js`, `js/models/driver-model.js`, `js/controllers/vehicle-controller.js` |
| Booking ID settings or PDF Signatory names not persisting | **Model** | `js/models/settings-model.js` |
| Admin login credentials or session state failing | **Model / Vue App** | `js/models/auth-model.js`, `js/vue-apps/login-app.js` |
| Form validation error or submit button behavior on `booking.html` | **Controller / View** | `js/controllers/booking-controller.js`, `js/views/booking-form-view.js` |
| Downloaded Internal or External PDF layout/text alignment issue | **Service** | `js/services/pdf-service.js` |
| Confirmation, approval, or rejection email not sending | **Service** | `js/services/email-service.js` |
| Region / Province / City / Barangay dropdown not loading on `booking.html` | **Service** | `js/services/address-service.js` |
| Admin notification bell, chime sound, or desktop alert issue | **Service** | `js/services/notification-service.js` |
| Landing page facility cards or facility detail gallery modal issue | **Vue App** | `js/vue-apps/facilities-app.js` |
| Landing page FullCalendar events or date click availability modal issue | **Controller / View** | `js/controllers/calendar-controller.js`, `js/views/calendar-view.js` |
| Admin bookings table, status badges, search/filter bar, or Approve/Reject modal | **Controller / View** | `js/controllers/dashboard-controller.js`, `js/views/dashboard-view.js` |
| Admin Reports preview table or Excel (`.xlsx`) download issue | **Vue App** | `js/vue-apps/reports-app.js` |
| Time formatting (`formatTime12`), HTML escaping, or image compression | **Core Utility** | `js/core/utils.js` |
