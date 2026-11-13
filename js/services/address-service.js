/* ============================================================
   Address Service — San Isidro College Reservation System
   Service Layer (js/services/address-service.js)
   Handles Philippine Standard Geographic Code (PSGC) cascading
   address dropdowns (Region > Province > City > Barangay) with
   automatic fallback to manual text input when offline.
   ============================================================ */

(function () {
  'use strict';

  const LAYER = 'AddressService';
  const PSGC_API_BASE = 'https://psgc.gitlab.io/api';
  const INDEPENDENT_CITIES = '__independent__';

  let addr = null;
  let addressManualMode = false;
  let regionCities = [];

  function resolveDom() {
    addr = {
      region:        document.getElementById('extRegion'),
      province:      document.getElementById('extProvince'),
      provinceGroup: document.getElementById('extProvinceGroup'),
      city:          document.getElementById('extCity'),
      barangay:      document.getElementById('extBarangay'),
      barangayText:  document.getElementById('extBarangayText'),
      street:        document.getElementById('extStreet'),
      grid:          document.querySelector('#extAddressBlock .address-grid'),
      manualGroup:   document.getElementById('extAddressManualGroup'),
      manual:        document.getElementById('extAddress')
    };
  }

  function psgcFetch(path) {
    const cacheKey = 'psgc:' + path;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) return Promise.resolve(JSON.parse(cached));
    } catch (_) { /* storage unavailable */ }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 10000) : null;

    return fetch(PSGC_API_BASE + path, controller ? { signal: controller.signal } : undefined)
      .then(res => {
        if (!res.ok) throw new Error('PSGC request failed: ' + res.status);
        return res.json();
      })
      .then(data => {
        try { sessionStorage.setItem(cacheKey, JSON.stringify(data)); } catch (_) { /* quota */ }
        return data;
      })
      .finally(() => { if (timer) clearTimeout(timer); });
  }

  function byLabel(a, b) {
    return a.label.localeCompare(b.label);
  }

  function fillSelect(select, items, placeholder) {
    if (!select) return;
    select.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = placeholder;
    select.appendChild(ph);
    items.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.code;
      opt.textContent = item.label;
      opt.dataset.name = item.name !== undefined ? item.name : item.label;
      select.appendChild(opt);
    });
    select.disabled = items.length === 0;
  }

  function setSelectLoading(select) {
    if (!select) return;
    select.innerHTML = '<option value="">Loading...</option>';
    select.disabled = true;
  }

  function selectedName(select) {
    if (!select || !select.value) return '';
    const opt = select.options[select.selectedIndex];
    return opt ? (opt.dataset.name || opt.textContent).trim() : '';
  }

  function toItems(list) {
    return list.map(x => ({ code: x.code, label: x.name })).sort(byLabel);
  }

  function showBarangayTextInput(show) {
    if (!addr || !addr.barangay || !addr.barangayText) return;
    addr.barangay.style.display = show ? 'none' : '';
    addr.barangayText.style.display = show ? '' : 'none';
    if (!show) addr.barangayText.value = '';
  }

  function resetAddressBelow(level) {
    if (!addr) return;
    if (level === 'region') {
      regionCities = [];
      if (addr.provinceGroup) addr.provinceGroup.style.display = '';
      fillSelect(addr.province, [], 'Select Province');
    }
    if (level === 'region' || level === 'province') {
      fillSelect(addr.city, [], 'Select City / Municipality');
    }
    fillSelect(addr.barangay, [], 'Select Barangay');
    showBarangayTextInput(false);
  }

  function enableManualAddress(err) {
    Logger.warn(LAYER, 'PH address list unavailable, switching to manual address entry:', err);
    addressManualMode = true;
    if (addr && addr.grid) addr.grid.style.display = 'none';
    if (addr && addr.manualGroup) addr.manualGroup.style.display = '';
  }

  function init(extFormEl) {
    resolveDom();
    if (!addr || !addr.region) return;

    psgcFetch('/regions/')
      .then(regions => {
        const items = regions
          .slice()
          .sort((a, b) => String(a.code).localeCompare(String(b.code)))
          .map(r => ({
            code:  r.code,
            name:  r.name,
            label: r.regionName && r.regionName !== r.name ? `${r.regionName} – ${r.name}` : r.name
          }));
        fillSelect(addr.region, items, 'Select Region');
      })
      .catch(enableManualAddress);

    addr.region.addEventListener('change', () => {
      const code = addr.region.value;
      resetAddressBelow('region');
      if (!code) return;
      setSelectLoading(addr.province);

      Promise.all([
        psgcFetch(`/regions/${code}/provinces/`),
        psgcFetch(`/regions/${code}/cities-municipalities/`)
      ]).then(([provinces, cities]) => {
        if (addr.region.value !== code) return;
        regionCities = cities;

        if (provinces.length === 0) {
          addr.provinceGroup.style.display = 'none';
          fillSelect(addr.province, [], 'Select Province');
          fillSelect(addr.city, toItems(cities), 'Select City / Municipality');
          return;
        }

        const items = toItems(provinces);
        if (cities.some(c => !c.provinceCode)) {
          items.push({ code: INDEPENDENT_CITIES, label: 'Independent / Highly Urbanized Cities', name: '' });
        }
        fillSelect(addr.province, items, 'Select Province');
      }).catch(enableManualAddress);
    });

    addr.province.addEventListener('change', () => {
      const code = addr.province.value;
      resetAddressBelow('province');
      if (!code) return;
      const list = regionCities.filter(c =>
        code === INDEPENDENT_CITIES ? !c.provinceCode : c.provinceCode === code
      );
      fillSelect(addr.city, toItems(list), 'Select City / Municipality');
    });

    addr.city.addEventListener('change', () => {
      const code = addr.city.value;
      resetAddressBelow('city');
      if (!code) return;
      setSelectLoading(addr.barangay);

      psgcFetch(`/cities-municipalities/${code}/barangays/`)
        .then(barangays => {
          if (addr.city.value !== code) return;
          if (!barangays.length) {
            fillSelect(addr.barangay, [], 'Select Barangay');
            showBarangayTextInput(true);
            return;
          }
          fillSelect(addr.barangay, toItems(barangays), 'Select Barangay');
        })
        .catch(err => {
          Logger.warn(LAYER, 'Could not load barangays, allowing manual entry:', err);
          if (addr.city.value !== code) return;
          fillSelect(addr.barangay, [], 'Select Barangay');
          showBarangayTextInput(true);
        });
    });

    if (extFormEl) {
      extFormEl.addEventListener('reset', () => {
        setTimeout(() => { if (!addressManualMode) resetAddressBelow('region'); }, 0);
      });
    }
  }

  function collect(showErrorFn) {
    if (!addr) resolveDom();
    const showError = typeof showErrorFn === 'function' ? showErrorFn : () => {};

    if (addressManualMode) {
      const value = addr.manual.value.trim();
      if (!value) { showError('extAddressError'); return { valid: false }; }
      return { valid: true, address: value, shortAddress: value, parts: null };
    }

    let valid = true;
    const needsProvince = addr.provinceGroup.style.display !== 'none';
    const barangayIsText = addr.barangayText.style.display !== 'none';

    if (!addr.region.value)                    { showError('extRegionError');   valid = false; }
    if (needsProvince && !addr.province.value) { showError('extProvinceError'); valid = false; }
    if (!addr.city.value)                      { showError('extCityError');     valid = false; }

    const barangay = barangayIsText ? addr.barangayText.value.trim() : selectedName(addr.barangay);
    if (!barangay) {
      showError('extBarangayError', barangayIsText ? 'Please type your barangay' : 'Please select a barangay');
      valid = false;
    }

    const street = addr.street.value.trim();
    if (!street) { showError('extStreetError'); valid = false; }

    if (!valid) return { valid: false };

    const parts = {
      region:   selectedName(addr.region),
      province: needsProvince && addr.province.value !== INDEPENDENT_CITIES ? selectedName(addr.province) : '',
      city:     selectedName(addr.city),
      barangay: barangay,
      street:   street
    };
    const barangayLabel = /^(brgy\.?|barangay)\s/i.test(barangay) ? barangay : `Brgy. ${barangay}`;
    const shortAddress = [parts.street, barangayLabel, parts.city]
      .filter(Boolean)
      .join(', ');
    const address = [parts.street, barangayLabel, parts.city, parts.province, parts.region]
      .filter(Boolean)
      .join(', ');

    return { valid: true, address, shortAddress, parts };
  }

  window.AddressService = {
    init,
    collect
  };
})();

