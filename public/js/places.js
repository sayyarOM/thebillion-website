/* The Billion — address search + "choose on map" picker.
 * All keys stay on the server (see /api/maps/* in server.js):
 *   - search + addresses: Google (Places Autocomplete/Details + Geocoding) via /api/maps/search|place|geocode
 *     → free fallback when Google is not configured or fails: Photon search, Nominatim addresses
 *   - map: Leaflet with Mapbox tiles via /api/maps/tiles → fallback: OpenStreetMap tiles
 * Every address input (input[list="places"]) gets:
 *   - a suggestions dropdown: current location, choose on map, popular places, search results (Oman)
 *   - a map button that opens the picker dialog (move the map under a fixed pin, address is looked up)
 *   - hidden <name>Lat / <name>Lng inputs with the chosen point (sent with the booking, carried through GET forms) */
(() => {
  'use strict';
  const cfgEl = document.getElementById('maps-config');
  if (!cfgEl) return;
  const BASE = (document.documentElement.dataset.base || '').replace(/\/+$/, ''); // site mounted under a sub-path (BASE_PATH)
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const json = el => { try { return JSON.parse(el.textContent); } catch { return {}; } };
  const CFG = json(cfgEl);
  const T = json($('#i18n'));
  const CAT = json($('#catalog'));
  const M = T.maps || {};
  const lang = T.lang || 'en';
  const CENTER = CFG.center || { lat: 23.588, lng: 58.3829 };
  const REGIONS = (CFG.regions && CFG.regions.length ? CFG.regions : ['om']).slice(0, 15);
  const OMAN_BBOX = '51.8,16.6,59.9,26.6'; // minLon,minLat,maxLon,maxLat — fallback search area
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = body => `<svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const IC = {
    pin: svg('<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>'),
    map: svg('<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>'),
    locate: svg('<line x1="2" x2="5" y1="12" y2="12"/><line x1="19" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="5"/><line x1="12" x2="12" y1="19" y2="22"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>'),
    star: svg('<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>')
  };
  const getJSON = async (url, ms = 8000) => {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined });
    if (!r.ok) throw new Error(url.split('?')[0] + ' ' + r.status);
    return r.json();
  };

  /* =====================================================================
     search + addresses: Google through our server, free fallback
     ===================================================================== */
  let googleOn = !!CFG.google;          // switched off for the session if our server says Google failed
  const useGoogle = () => googleOn;
  const googleDown = e => { console.warn('[places] Google unavailable, using OpenStreetMap', e); googleOn = false; };
  let session = '';                     // Google autocomplete billing session: suggestions … one place details
  const newSession = () => (session = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)));

  const api = (path, params) => getJSON(`${BASE}/api/maps/${path}?` + new URLSearchParams({ lang, ...params }));

  // Nominatim allows 1 request per second → queue calls
  let nomLast = 0;
  const nominatim = async (path, params) => {
    const wait = nomLast + 1100 - Date.now();
    nomLast = Math.max(Date.now(), nomLast + 1100);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    return getJSON(`https://nominatim.openstreetmap.org/${path}?` + new URLSearchParams({ format: 'jsonv2', 'accept-language': lang, ...params }));
  };
  const shortAddress = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 4).join(', ');

  const googleSearch = async q => {
    if (!session) newSession();
    const d = await api('search', { q, session });
    return d.items.map(x => ({ kind: 'google', group: M.results, main: x.main, sub: x.sub, id: x.id }));
  };
  const osmSearch = async q => {
    const d = await getJSON('https://photon.komoot.io/api/?' + new URLSearchParams({
      q, limit: 8, lat: CENTER.lat, lon: CENTER.lng, bbox: OMAN_BBOX, ...(lang === 'en' ? { lang: 'en' } : {})
    }));
    const seen = new Set();
    return (d.features || []).map(f => {
      const p = f.properties || {};
      const main = p.name || [p.street, p.housenumber].filter(Boolean).join(' ');
      const sub = [...new Set([p.district, p.city, p.county, p.state].filter(x => x && x !== main))].slice(0, 3).join(', ');
      const [lng, lat] = f.geometry?.coordinates || [];
      return { kind: 'osm', group: M.results, main, sub, loc: { lat, lng } };
    }).filter(x => x.main && Number.isFinite(x.loc.lat) && !seen.has(x.main + x.sub) && seen.add(x.main + x.sub)).slice(0, 5);
  };
  const searchPlaces = async q => {
    if (useGoogle()) { try { return await googleSearch(q); } catch (e) { googleDown(e); } }
    return osmSearch(q);
  };
  const placeLocation = async id => {
    const d = await api('place/' + encodeURIComponent(id), { session });
    session = '';
    return { lat: d.lat, lng: d.lng };
  };
  // best human address for a point
  const reverse = async p => {
    if (useGoogle()) {
      try { const d = await api('geocode', { lat: p.lat, lng: p.lng }); if (d.found) return d.address; }
      catch (e) { googleDown(e); }
    }
    return shortAddress((await nominatim('reverse', { lat: p.lat, lon: p.lng, zoom: 18 })).display_name);
  };
  const forward = async address => {
    if (useGoogle()) {
      try { const d = await api('geocode', { q: address }); if (d.found) return { lat: d.lat, lng: d.lng }; }
      catch (e) { googleDown(e); }
    }
    const d = await nominatim('search', { q: address, countrycodes: REGIONS.join(','), limit: 1 });
    return d[0] ? { lat: +d[0].lat, lng: +d[0].lon } : null;
  };
  const myLocation = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), reject,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });

  /* =====================================================================
     hidden lat/lng next to each address input
     ===================================================================== */
  const hidden = (inp, suffix) => {
    const name = inp.name + suffix;
    let h = inp.form?.elements[name];
    if (!h) { h = document.createElement('input'); h.type = 'hidden'; h.name = name; inp.after(h); }
    return h;
  };
  const setGeo = (inp, p) => {
    if (!inp.name) return;
    hidden(inp, 'Lat').value = p ? (+p.lat).toFixed(6) : '';
    hidden(inp, 'Lng').value = p ? (+p.lng).toFixed(6) : '';
    inp.dataset.geoText = p ? inp.value : '';
  };
  const getGeo = inp => {
    const a = inp.form?.elements[inp.name + 'Lat']?.value, b = inp.form?.elements[inp.name + 'Lng']?.value;
    return a && b ? { lat: +a, lng: +b } : null;
  };
  const fill = (inp, text, p) => {
    inp.value = text;
    setGeo(inp, p);
    inp.closest('.field')?.classList.remove('is-invalid');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  };

  /* =====================================================================
     suggestions dropdown (one shared element)
     ===================================================================== */
  const pac = document.createElement('div');
  pac.className = 'pac'; pac.id = 'pac-list'; pac.setAttribute('role', 'listbox'); pac.hidden = true;
  let cur = null, items = [], active = -1, seq = 0, timer = 0;

  const place = () => {
    if (!cur) return;
    const box = (cur.closest('.field__box') || cur).getBoundingClientRect();
    const room = innerHeight - box.bottom - 12;
    pac.style.left = Math.max(8, box.left) + 'px';
    pac.style.width = Math.min(box.width, innerWidth - 16) + 'px';
    if (room < 220 && box.top > room) { pac.style.top = ''; pac.style.bottom = (innerHeight - box.top + 6) + 'px'; pac.style.maxHeight = Math.min(360, box.top - 12) + 'px'; }
    else { pac.style.bottom = ''; pac.style.top = (box.bottom + 6) + 'px'; pac.style.maxHeight = Math.min(360, room) + 'px'; }
  };
  const close = () => {
    pac.hidden = true; active = -1; items = [];
    if (cur) { cur.setAttribute('aria-expanded', 'false'); cur.removeAttribute('aria-activedescendant'); }
  };
  const render = (list, note) => {
    items = list;
    active = -1;
    let html = '', group = null;
    list.forEach((it, i) => {
      if (it.group && it.group !== group) { group = it.group; html += `<div class="pac__head">${esc(group)}</div>`; }
      html += `<div class="pac__item${it.kind === 'action' ? ' pac__item--action' : ''}" role="option" id="pac-${i}" data-i="${i}" aria-selected="false">
        <span class="pac__ic">${it.icon || IC.pin}</span><span class="pac__txt"><span class="pac__main">${esc(it.main)}</span>${it.sub ? `<span class="pac__sub">${esc(it.sub)}</span>` : ''}</span></div>`;
    });
    if (note) html += `<div class="pac__note">${esc(note)}</div>`;
    if (list.some(it => it.kind === 'google')) html += '<div class="pac__by" lang="en">Powered by Google</div>';
    else if (list.some(it => it.kind === 'osm')) html += '<div class="pac__by" lang="en">© OpenStreetMap contributors</div>';
    pac.innerHTML = html;
    if (!list.length && !note) return close();
    (cur.closest('dialog') || document.body).appendChild(pac);
    pac.hidden = false;
    cur.setAttribute('aria-expanded', 'true');
    place();
  };
  const highlight = i => {
    active = i;
    $$('.pac__item', pac).forEach((el, j) => { el.classList.toggle('is-active', j === i); el.setAttribute('aria-selected', j === i); });
    if (i >= 0) { cur.setAttribute('aria-activedescendant', 'pac-' + i); $('#pac-' + i, pac)?.scrollIntoView({ block: 'nearest' }); }
  };

  const actions = inp => inp.dataset.pacSearchOnly ? [] : [
    { kind: 'action', icon: IC.locate, main: M.current, run: () => useMyLocation(inp) },
    { kind: 'action', icon: IC.map, main: M.onMap, run: () => openPicker(inp) }
  ];
  const popular = q => {
    const n = q.trim().toLowerCase();
    return (CAT.places || []).filter(p => !n || p.toLowerCase().includes(n)).slice(0, n ? 4 : 6)
      .map(p => ({ kind: 'popular', group: M.popular, icon: IC.star, main: p }));
  };

  // "23.59, 58.38" (also Arabic digits / reversed lng,lat / a Google Maps link with @lat,lng) → exact point
  const parsePoint = raw => {
    const s = String(raw || '').trim()
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[،؛]/g, ',').replace(/٫/g, '.');
    const m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) || s.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)
      || s.match(/^\(?\s*(-?\d+(?:\.\d+)?)\s*(?:,|\s)\s*(-?\d+(?:\.\d+)?)\s*\)?$/);
    if (!m) return null;
    let a = m[1], b = m[2];
    if (+a >= 50 && +a <= 62 && +b >= 14 && +b <= 28) [a, b] = [b, a]; // typed lng, lat (Oman)
    const lat = Number(a), lng = Number(b);
    if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng, label: `${a}, ${b}` };
  };

  const search = async inp => {
    const q = inp.value.trim(), my = ++seq;
    if (!q) return render([...actions(inp), ...popular('')]);
    const pt = parsePoint(q);
    if (pt) return render([{ kind: 'point', icon: IC.locate, main: pt.label, sub: M.exactPoint, loc: { lat: pt.lat, lng: pt.lng } }, ...actions(inp)]);
    render([...actions(inp), ...popular(q)]); // instant local results while the search answers
    if (q.length < 2) return;
    let found = [];
    try { found = await searchPlaces(q); } catch (e) { console.warn('[places]', e); }
    if (my !== seq || cur !== inp) return;
    const local = popular(q).filter(p => !found.some(x => x.main.toLowerCase() === p.main.toLowerCase()));
    render([...actions(inp), ...found, ...local], found.length || local.length ? '' : M.noResults);
  };

  const choose = async (inp, it) => {
    close();
    if (it.run) return it.run();
    const done = (loc, text) => (inp._onPick ? inp._onPick(loc, text) : fill(inp, text, loc));
    const text = [it.main, it.sub].filter(Boolean).join(', ');
    if (it.kind === 'osm') return done(it.loc, text);
    if (it.kind === 'point') { // exact point: show the street address once known
      if (inp._onPick) return inp._onPick(it.loc, it.main, true);
      fill(inp, it.main, it.loc);
      reverse(it.loc).then(a => { if (a && inp.value === it.main) fill(inp, a, it.loc); }).catch(() => {});
      return;
    }
    if (it.kind === 'google') {
      if (!inp._onPick) fill(inp, text, null);
      try { done(await placeLocation(it.id), text); } catch (e) { console.warn('[places]', e); }
      return;
    }
    // popular place: fill the text now, find its point in the background
    if (!inp._onPick) fill(inp, it.main, null);
    try {
      const loc = await forward(it.main);
      if (!loc) return;
      if (inp._onPick) inp._onPick(loc, it.main);
      else if (inp.value === it.main) setGeo(inp, loc);
    } catch { /* text only */ }
  };

  pac.addEventListener('pointerdown', e => e.preventDefault()); // keep focus in the input
  pac.addEventListener('click', e => {
    const el = e.target.closest('.pac__item');
    if (el && cur) choose(cur, items[+el.dataset.i]);
  });
  addEventListener('resize', () => !pac.hidden && place());
  addEventListener('scroll', () => !pac.hidden && place(), { passive: true, capture: true });

  const attach = (inp, opts = {}) => {
    if (inp._pac) return;
    inp._pac = true;
    if (opts.onPick) inp._onPick = opts.onPick;
    if (opts.searchOnly) inp.dataset.pacSearchOnly = '1';
    inp.removeAttribute('list');
    inp.setAttribute('role', 'combobox');
    inp.setAttribute('aria-autocomplete', 'list');
    inp.setAttribute('aria-controls', 'pac-list');
    inp.setAttribute('aria-expanded', 'false');
    inp.addEventListener('focus', () => { cur = inp; search(inp); });
    inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== inp && cur === inp) close(); }, 120));
    inp.addEventListener('input', e => {
      if (!e.isTrusted) return; // our own fill() events
      cur = inp;
      if (!inp._onPick && inp.dataset.geoText !== inp.value) setGeo(inp, null); // typed text no longer matches the picked point
      clearTimeout(timer); timer = setTimeout(() => search(inp), 250);
    });
    inp.addEventListener('keydown', e => {
      if (pac.hidden || cur !== inp) { if (e.key === 'ArrowDown') { cur = inp; search(inp); e.preventDefault(); } return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); highlight(Math.min(items.length - 1, active + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(Math.max(-1, active - 1)); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(inp, items[active]); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') close();
    });
  };

  const useMyLocation = async inp => {
    const box = inp.closest('.field__box');
    box?.classList.add('is-busy');
    try {
      const p = await myLocation();
      const text = await reverse(p).catch(() => '');
      fill(inp, text || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`, p);
    } catch { openPicker(inp, M.geoError); }
    finally { box?.classList.remove('is-busy'); }
  };

  /* =====================================================================
     map picker dialog — Leaflet; Mapbox tiles via our server, OpenStreetMap fallback
     ===================================================================== */
  let lLoading = null;
  const loadLeaflet = () => lLoading || (lLoading = new Promise((resolve, reject) => {
    if (window.L?.map) return resolve(window.L);
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = BASE + '/vendor/leaflet/leaflet.min.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = BASE + '/vendor/leaflet/leaflet.min.js';
    s.onload = () => resolve(window.L);
    s.onerror = () => { lLoading = null; reject(new Error('leaflet load failed')); };
    document.head.appendChild(s);
  }));
  const BASEMAPS = [
    ...(CFG.mapbox ? [{ url: BASE + '/api/maps/tiles/{z}/{x}/{y}', tileSize: 512, zoomOffset: -1, maxZoom: 20,
      attribution: '&copy; <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }] : []),
    { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }
  ];

  const dlg = $('[data-mappick]');
  const mapEl = dlg && $('[data-mappick-map]', dlg);
  const centerPin = dlg && $('[data-mappick-center]', dlg), pinShadow = dlg && $('[data-mappick-shadow]', dlg);
  const addrEl = dlg && $('[data-mappick-address]', dlg), okBtn = dlg && $('[data-mappick-confirm]', dlg), errEl = dlg && $('[data-mappick-error]', dlg);
  let map = null, target = null, revSeq = 0, revTimer = 0, here = null, locked = null;
  const showErr = msg => { errEl.textContent = msg || ''; errEl.hidden = !msg; };
  const showAddr = (text, ready = true) => { addrEl.textContent = text || '—'; okBtn.disabled = !ready; };

  const createMap = async (start, zoom) => {
    const L = await loadLeaflet();
    const m = L.map(mapEl, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], zoom);
    // basemaps in order; one that keeps failing (no token / blocked / down) is replaced by the next
    const use = i => {
      const b = BASEMAPS[i];
      const layer = L.tileLayer(b.url, { maxZoom: b.maxZoom, tileSize: b.tileSize || 256, zoomOffset: b.zoomOffset || 0, attribution: b.attribution }).addTo(m);
      let errors = 0, loaded = 0;
      layer.on('tileload', () => loaded++);
      layer.on('tileerror', () => {
        if (++errors >= 3 && errors > loaded && i < BASEMAPS.length - 1) { m.removeLayer(layer); use(i + 1); }
      });
    };
    use(0);
    m.attributionControl.setPrefix(false);
    // as in the Sayyar apps: dragging the map → back to centre-pin mode; the address follows the centre
    m.on('dragstart', () => { unlock(); dlg.classList.add('is-moving'); });
    m.on('moveend', () => { dlg.classList.remove('is-moving'); if (!locked) fromCenter(); });
    return m;
  };

  // centre-pin mode: the point under the pin, its address looked up after the map stops
  const fromCenter = () => {
    if (!map) return;
    const c = map.getCenter(); here = { lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) };
    const my = ++revSeq;
    showAddr(M.locating, false);
    clearTimeout(revTimer);
    revTimer = setTimeout(async () => {
      let text = '';
      try { text = await reverse(here); } catch { /* fall back to coordinates */ }
      if (my !== revSeq || locked) return;
      showAddr(text || `${here.lat.toFixed(5)}, ${here.lng.toFixed(5)}`);
    }, useGoogle() ? 400 : 700);
  };
  // exact point (search result / my location / typed point / the field's saved point): a real marker that zooming never moves
  const lockTo = (p, text, zoom = 17, lookupAddress = false) => {
    if (!map) return;
    unlock();
    locked = window.L.marker([p.lat, p.lng], {
      icon: window.L.divIcon({ className: '', html: '<span class="pin-marker"></span>', iconSize: [30, 30], iconAnchor: [15, 30] }),
      keyboard: false, interactive: false
    }).addTo(map);
    centerPin.hidden = true; pinShadow.hidden = true;
    here = { lat: p.lat, lng: p.lng };
    const my = ++revSeq;
    map.setView([p.lat, p.lng], Math.max(map.getZoom(), zoom), { animate: true });
    showAddr(text || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`, true);
    if (lookupAddress) reverse(p).then(a => { if (a && my === revSeq && locked) showAddr(a); }).catch(() => {});
  };
  function unlock() {
    if (!locked) return;
    map.removeLayer(locked); locked = null;
    centerPin.hidden = false; pinShadow.hidden = false;
  }

  const openPicker = async (inp, notice) => {
    if (!dlg) return;
    target = inp;
    close();
    $('[data-mappick-title]', dlg).textContent = inp.closest('.field')?.querySelector('.field__label')?.textContent.trim() || M.onMap;
    $('[data-mappick-search]', dlg).value = '';
    showAddr(M.locating, false);
    dlg.classList.remove('is-failed');
    showErr('');
    dlg.showModal();
    const saved = getGeo(inp);
    let start = saved, zoom = 16;
    if (!start && inp.value.trim()) start = await forward(inp.value.trim()).catch(() => null);
    if (!start) { start = CENTER; zoom = 12; }
    try {
      if (!map) map = await createMap(start, zoom);
      else { unlock(); map.setView([start.lat, start.lng], zoom); }
      requestAnimationFrame(() => map.invalidateSize());
      if (saved) lockTo(saved, inp.value.trim(), 16);
      else fromCenter();
      showErr(notice);
    } catch {
      dlg.classList.add('is-failed'); showErr(M.loadError); showAddr('', false);
    }
  };

  if (dlg) {
    const closeDlg = () => { close(); dlg.close(); };
    $('[data-mappick-close]', dlg).addEventListener('click', closeDlg);
    $('[data-mappick-cancel]', dlg).addEventListener('click', closeDlg);
    dlg.addEventListener('click', e => { if (e.target === dlg) closeDlg(); });
    dlg.addEventListener('close', close);
    attach($('[data-mappick-search]', dlg), {
      searchOnly: true,
      onPick: (loc, text, exact) => lockTo(loc, text, 17, !!exact)
    });
    $('[data-mappick-locate]', dlg).addEventListener('click', async e => {
      const b = e.currentTarget; b.classList.add('is-busy'); b.disabled = true; showErr('');
      try { const p = await myLocation(); lockTo({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }, '', 17, true); }
      catch { showErr(M.geoError); }
      finally { b.classList.remove('is-busy'); b.disabled = false; }
    });
    okBtn.addEventListener('click', () => {
      if (!target || !here || !map) return;
      const text = addrEl.textContent.trim();
      fill(target, text && text !== '—' && text !== M.locating ? text : `${here.lat.toFixed(5)}, ${here.lng.toFixed(5)}`, here);
      closeDlg();
    });
  }

  /* =====================================================================
     wire every address field
     ===================================================================== */
  const params = new URLSearchParams(location.search);
  $$('input[list="places"]').forEach(inp => {
    attach(inp);
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'field__map'; btn.innerHTML = IC.map;
    btn.title = M.onMap; btn.setAttribute('aria-label', M.onMap);
    btn.addEventListener('click', e => { e.preventDefault(); if (!inp.disabled) openPicker(inp); });
    inp.after(btn);
    // a point carried from the home page search (?pickupLat=…), rental reads ?deliveryLat=…
    const from = [inp.name, inp.name === 'pickup' && !params.has('pickupLat') ? 'delivery' : null].filter(Boolean)
      .find(n => params.get(n + 'Lat') && params.get(n + 'Lng'));
    if (from && inp.value) setGeo(inp, { lat: +params.get(from + 'Lat'), lng: +params.get(from + 'Lng') });
  });
  // GET forms (home hero): don't put empty lat/lng in the URL
  $$('form[method="get"]').forEach(f => f.addEventListener('submit', () => {
    $$('input[type="hidden"][name$="Lat"], input[type="hidden"][name$="Lng"]', f).forEach(h => { if (!h.value) h.disabled = true; });
  }));
})();
