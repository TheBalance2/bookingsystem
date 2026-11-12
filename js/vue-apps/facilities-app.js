/* ============================================================
   Digital Reservation System — San Isidro College
   Vue.js 3 App: Facilities Showcase & Detail Modal (index.html)
   ============================================================ */

(function () {
  const { createApp } = Vue;
  const log = window.Logger ? window.Logger.create('FacilitiesApp') : console;

  const LEGEND_COLORS = [
    '#3498db', '#9b59b6', '#27ae60', '#e67e22',
    '#e74c3c', '#1abc9c', '#f39c12', '#2c3e50'
  ];

  // --- Navbar scroll & mobile toggle setup for index.html ---
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 50);
    });
  }

  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
  }

  const facilitiesApp = createApp({
    data() {
      return {
        facilities: [],
        selectedFacility: null,
        modalVisible: false,
        galleryImages: [],
        galleryIndex: 0
      };
    },

    computed: {
      currentImage() {
        return this.galleryImages[this.galleryIndex] || '';
      },
      counterText() {
        if (!this.galleryImages.length) return '';
        return `Photo ${this.galleryIndex + 1} of ${this.galleryImages.length}`;
      },
      bookUrl() {
        if (!this.selectedFacility) return 'booking.html';
        return `booking.html?facility=${encodeURIComponent(this.selectedFacility.name)}`;
      }
    },

    async mounted() {
      // Expose modal helpers globally for any external callers
      window.openFacilityDetail = (facOrId) => this.openFacilityDetail(facOrId);
      window.closeFacilityDetailModal = () => this.closeFacilityDetailModal();

      try {
        const activeFacilities = await FacilityModel.getActive();
        this.facilities = activeFacilities;
        this.renderCalendarLegend(activeFacilities);
      } catch (err) {
        log.warn('Could not load facilities for landing page:', err);
      }
    },

    methods: {
      getFirstImage(fac) {
        if (!fac) return '';
        if (fac.thumbnail) {
          return Utils.sanitizeUrl(fac.thumbnail);
        }
        if (Array.isArray(fac.images) && fac.images.length > 0) {
          return Utils.sanitizeUrl(fac.images[0]);
        }
        return '';
      },

      renderCalendarLegend(facilities) {
        const calendarLegend = document.querySelector('.calendar-legend');
        if (!calendarLegend || !facilities || facilities.length === 0) return;

        calendarLegend.innerHTML = facilities.map((f, index) => {
          const color = LEGEND_COLORS[index % LEGEND_COLORS.length];
          return `
            <div class="legend-item">
              <span class="legend-dot" style="background:${color}"></span>
              ${Utils.escapeHtml(f.name)}
            </div>
          `;
        }).join('');
      },

      async openFacilityDetail(facOrId) {
        const fac = typeof facOrId === 'string'
          ? this.facilities.find(f => f.id === facOrId)
          : facOrId;
        if (!fac) return;

        this.selectedFacility = fac;
        this.galleryIndex = 0;
        this.galleryImages = [];
        this.modalVisible = true;

        try {
          const rawImages = await FacilityModel.getImages(fac.id, fac.images || []);
          this.galleryImages = (rawImages || [])
            .map(url => Utils.sanitizeUrl(url))
            .filter(Boolean);
        } catch (err) {
          log.warn('Could not load facility images:', err);
          this.galleryImages = (fac.images || [])
            .map(url => Utils.sanitizeUrl(url))
            .filter(Boolean);
        }
      },

      switchGalleryImage(index) {
        if (index < 0 || index >= this.galleryImages.length) return;
        this.galleryIndex = index;
      },

      closeFacilityDetailModal() {
        this.modalVisible = false;
      }
    }
  });

  facilitiesApp.mount('#facilitiesApp');
})();

