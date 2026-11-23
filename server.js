/**
 * The Billion — website server (Node.js + Express + EJS)
 * Run:  npm install && npm start   →  http://localhost:3000   (Arabic: /ar)
 */
// .env next to this file (Node 20.12+ built-in; no dotenv needed). Real environment variables win.
try { process.loadEnvFile(require('path').join(__dirname, '.env')); } catch { /* no .env — use the environment */ }
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');

const site = require('./config/site');
const catalog = require('./config/catalog');
const pricing = require('./lib/pricing');
const { icon } = require('./lib/icons');
const locales = { en: require('./locales/en'), ar: require('./locales/ar') };

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const isProd = process.env.NODE_ENV === 'production';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Maps: Google search and Mapbox tiles both go through this server (/api/maps/*), so no keys reach the browser.
// Fallback when they are not configured: OpenStreetMap tiles, Photon search, Nominatim addresses. Leaflet is self-hosted.
const G = { img: ['https://tile.openstreetmap.org'], connect: ['https://photon.komoot.io', 'https://nominatim.openstreetmap.org'] };
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'"],
      styleSrcAttr: ["'unsafe-inline'"], // only CSS custom properties like style="--d:1" for animation stagger
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', ...G.img],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", ...G.connect],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  // send our origin to map/search providers (OpenStreetMap blocks tile requests that carry no Referer)
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use(compression());
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '7d' : 0 }));

/* ---------- i18n + view helpers ---------- */
function lookup(obj, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function viewHelpers(lang, pagePath) {
  const dict = locales[lang];
  const t = (key, vars = {}) => {
    let v = lookup(dict, key);
    if (v === undefined) v = lookup(locales.en, key);
    if (v === undefined) return key;
    if (typeof v === 'string') v = v.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
    return v;
  };
  const prefix = lang === 'ar' ? '/ar' : '';
  return {
    lang, dir: lang === 'ar' ? 'rtl' : 'ltr', t, icon, site, catalog,
    url: p => (prefix + (p === '/' ? '' : p)) || '/',
    altUrl: lang === 'ar' ? (pagePath || '/') : '/ar' + (pagePath === '/' ? '' : pagePath),
    L: o => (o && typeof o === 'object' ? (o[lang] ?? o.en) : o),
    omr: n => Number(n).toFixed(3),
    isSet: v => v && !String(v).startsWith('['),
    pagePath, year: new Date().getFullYear()
  };
}

/* ---------- pages ---------- */
const pages = [
  { path: '/', view: 'home', nav: null },
  { path: '/chauffeur', view: 'chauffeur', nav: 'chauffeur' },
  { path: '/rental', view: 'rental', nav: 'rental' },
  { path: '/airport', view: 'airport', nav: 'airport' },
  { path: '/fleet', view: 'fleet', nav: 'fleet' },
  { path: '/contact', view: 'contact', nav: 'contact' },
  ...['terms', 'privacy', 'cancellation', 'careers'].map(slug => ({ path: '/' + slug, view: 'legal', nav: null, slug }))
];

for (const page of pages) {
  for (const lang of ['en', 'ar']) {
    const route = lang === 'ar' ? '/ar' + (page.path === '/' ? '' : page.path) : page.path;
    app.get(route, (req, res) => {
      const h = viewHelpers(lang, page.path);
      const titleKey = page.slug ? `legal.${page.slug}.title` : page.nav ? `nav.${page.nav}` : null;
      res.render(`pages/${page.view}`, {
        ...h, page, query: req.query,
        title: titleKey ? `${h.t(titleKey)} — The Billion` : h.t('meta.title')
      });
    });
  }
}

/* ---------- simple in-memory rate limit for form posts ---------- */
const hits = new Map();
function rateLimit(max = 10, windowMs = 10 * 60 * 1000) {
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip + req.path;
    const list = (hits.get(key) || []).filter(ts => now - ts < windowMs);
    if (list.length >= max) return res.status(429).json({ ok: false, error: 'Too many requests, please try again later.' });
    list.push(now); hits.set(key, list); next();
  };
}

/* ---------- storage (JSON lines; swap for your database / dashboard API later) ---------- */
function store(file, record) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(path.join(DATA_DIR, file), JSON.stringify(record) + '\n');
}
function readStore(file) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
}
const clean = (v, max = 200) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);
const validMobile = v => /^\+?[0-9 ]{8,16}$/.test(String(v || '').trim());
const validEmail = v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
// Map point picked on the website ({ lat, lng }) → stored with a Google Maps link for the dispatcher; anything else → null
const geo = g => {
  const lat = Number(g?.lat), lng = Number(g?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  const p = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  return { ...p, url: `https://www.google.com/maps?q=${p.lat},${p.lng}` };
};
const reference = () => 'TB-' + crypto.randomBytes(3).toString('hex').toUpperCase();

function quote(type, b) {
  if (type === 'transfer') return pricing.quoteTransfer({ classId: b.classId, mode: b.mode, hours: b.hours, extras: b.extras, passengers: b.passengers });
  if (type === 'rental') return pricing.quoteRental({ carId: b.carId, from: b.from, to: b.to });
  if (type === 'airport') return pricing.quoteAirport({ services: b.services, passengers: b.passengers });
  throw new Error('Unknown booking type');
}

/* ---------- API ---------- */
app.post('/api/quote/:type', (req, res) => {
  try { res.json({ ok: true, quote: quote(req.params.type, req.body || {}) }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

app.post('/api/bookings', rateLimit(), (req, res) => {
  const b = req.body || {};
  const c = b.customer || {};
  if (!clean(c.name) || !validMobile(c.mobile) || !validEmail(c.email)) {
    return res.status(400).json({ ok: false, error: 'Please check your name, mobile and email.' });
  }
  let q;
  try { q = quote(b.type, b); } catch (e) { return res.status(400).json({ ok: false, error: e.message }); }
  const booking = {
    ref: reference(), type: b.type, status: 'new', createdAt: new Date().toISOString(), lang: b.lang === 'ar' ? 'ar' : 'en',
    trip: {
      mode: clean(b.mode, 10), classId: clean(b.classId, 30), carId: clean(b.carId, 30),
      pickup: clean(b.pickup), pickupGeo: geo(b.pickupGeo), dropoff: clean(b.dropoff), dropoffGeo: geo(b.dropoffGeo), date: clean(b.date, 10), time: clean(b.time, 5),
      from: clean(b.from, 10), to: clean(b.to, 10), flight: clean(b.flight, 12), passengers: q.passengers
    },
    customer: { name: clean(c.name, 80), mobile: clean(c.mobile, 20), email: clean(c.email, 120), notes: clean(c.notes, 500) },
    price: { currency: site.currency, lines: q.lines, subtotal: q.subtotal, vat: q.vat, total: q.total }
  };
  store('bookings.jsonl', booking);
  console.log(`[booking] ${booking.ref} ${booking.type} OMR ${booking.price.total.toFixed(3)}`);
  res.json({ ok: true, ref: booking.ref, total: booking.price.total });
});

app.post('/api/contact', rateLimit(), (req, res) => {
  const b = req.body || {};
  if (!clean(b.name) || !validMobile(b.mobile) || !validEmail(b.email) || !clean(b.message)) {
    return res.status(400).json({ ok: false, error: 'Please fill in all required fields.' });
  }
  const msg = {
    id: reference(), createdAt: new Date().toISOString(),
    name: clean(b.name, 80), mobile: clean(b.mobile, 20), email: clean(b.email, 120),
    interests: (Array.isArray(b.interests) ? b.interests : []).map(i => clean(i, 30)).slice(0, 6),
    message: clean(b.message, 2000)
  };
  store('messages.jsonl', msg);
  console.log(`[contact] ${msg.id} from ${msg.name}`);
  res.json({ ok: true });
});

// Read-only feed for the control dashboard: GET /api/admin/bookings with header "Authorization: Bearer <ADMIN_TOKEN>"
app.get('/api/admin/:what(bookings|messages)', (req, res) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token || req.get('authorization') !== `Bearer ${token}`) return res.status(401).json({ ok: false });
  let items = readStore(req.params.what + '.jsonl').reverse();
  if (req.params.what === 'bookings') {
    const paid = new Map(readStore('payments.jsonl').map(p => [p.ref, p]));
    items = items.map(b => ({ ...b, payment: paid.get(b.ref) || null }));
  }
  res.json({ ok: true, items });
});

/* ---------- maps: Google search + Mapbox tiles through this server ----------
 * GOOGLE_MAPS_KEY  — server key with Places API + Geocoding API (same endpoints as the Sayyar website's /gmaps proxy)
 * MAPBOX_TOKEN     — Mapbox token for the map tiles (MAPBOX_STYLE optional, default mapbox/streets-v12) */
const GKEY = () => process.env.GOOGLE_MAPS_KEY || '';
const MBOX = () => process.env.MAPBOX_TOKEN || '';
const mapsLang = v => (v === 'ar' ? 'ar' : 'en');
const PLUS_CODE = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b[\s,،]*/i;
const tidyAddress = s => String(s || '').replace(PLUS_CODE, '').replace(/[\s,،]*(Oman|عمان|سلطنة عمان)$/i, '').trim();
async function google(api, params) {
  const r = await fetch(`https://maps.googleapis.com/maps/api/${api}/json?` + new URLSearchParams({ ...params, key: GKEY() }), { signal: AbortSignal.timeout(7000) });
  const d = await r.json();
  if (d.status === 'ZERO_RESULTS') return d;
  if (d.status !== 'OK') { const e = new Error(`google ${api}: ${d.status}`); e.status = d.status; throw e; }
  return d;
}
const mapsFail = (res, e) => { console.warn('[maps]', e.message); res.status(502).json({ ok: false, error: 'maps provider failed' }); };
const center = `${site.mapCenter.lat},${site.mapCenter.lng}`;
const country = site.mapRegions.map(c => 'country:' + c).join('|');

app.get('/api/maps/search', rateLimit(300, 10 * 60 * 1000), async (req, res) => {
  if (!GKEY()) return res.status(503).json({ ok: false, error: 'not configured' });
  const q = clean(req.query.q, 120), session = clean(req.query.session, 64);
  if (q.length < 2) return res.json({ ok: true, items: [] });
  try {
    const d = await google('place/autocomplete', { input: q, components: country, language: mapsLang(req.query.lang), location: center, radius: 50000, ...(session && { sessiontoken: session }) });
    res.json({ ok: true, items: (d.predictions || []).slice(0, 5).map(p => ({
      id: p.place_id, main: p.structured_formatting?.main_text || p.description, sub: tidyAddress(p.structured_formatting?.secondary_text || '')
    })) });
  } catch (e) { mapsFail(res, e); }
});

app.get('/api/maps/place/:id', rateLimit(300, 10 * 60 * 1000), async (req, res) => {
  if (!GKEY()) return res.status(503).json({ ok: false, error: 'not configured' });
  const session = clean(req.query.session, 64);
  try {
    const d = await google('place/details', { place_id: clean(req.params.id, 300), fields: 'geometry,name,formatted_address', language: mapsLang(req.query.lang), ...(session && { sessiontoken: session }) });
    const l = d.result?.geometry?.location;
    if (!l) return res.status(404).json({ ok: false });
    res.json({ ok: true, lat: l.lat, lng: l.lng, name: d.result.name, address: tidyAddress(d.result.formatted_address) });
  } catch (e) { mapsFail(res, e); }
});

app.get('/api/maps/geocode', rateLimit(300, 10 * 60 * 1000), async (req, res) => {
  if (!GKEY()) return res.status(503).json({ ok: false, error: 'not configured' });
  const lat = Number(req.query.lat), lng = Number(req.query.lng), q = clean(req.query.q, 160);
  const params = Number.isFinite(lat) && Number.isFinite(lng) ? { latlng: `${lat},${lng}` } : q ? { address: q, components: country } : null;
  if (!params) return res.status(400).json({ ok: false });
  try {
    const d = await google('geocode', { ...params, language: mapsLang(req.query.lang) });
    const results = d.results || [];
    // first real street / road / place; skip bare plus codes
    const r = results.find(x => !x.types.includes('plus_code')) || results[0];
    if (!r) return res.json({ ok: true, found: false });
    res.json({ ok: true, found: true, lat: r.geometry.location.lat, lng: r.geometry.location.lng, address: tidyAddress(r.formatted_address) });
  } catch (e) { mapsFail(res, e); }
});

// Mapbox raster tiles (512px; Leaflet uses zoomOffset -1). Cached by the browser for a week.
app.get('/api/maps/tiles/:z/:x/:y', async (req, res) => {
  const [z, x, y] = [req.params.z, req.params.x, req.params.y].map(Number);
  if (!MBOX()) return res.sendStatus(404);
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 22 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return res.sendStatus(400);
  const style = (process.env.MAPBOX_STYLE || 'mapbox/streets-v12').replace(/[^\w/.-]/g, '');
  try {
    const r = await fetch(`https://api.mapbox.com/styles/v1/${style}/tiles/512/${z}/${x}/${y}@2x?access_token=${encodeURIComponent(MBOX())}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return res.sendStatus(r.status === 404 ? 404 : 502);
    res.set({ 'Content-Type': r.headers.get('content-type') || 'image/png', 'Cache-Control': 'public, max-age=604800' });
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { console.warn('[maps] tile', e.message); res.sendStatus(502); }
});

/* ---------- checkout page (DEMO payment) ----------
 * /pay/TB-XXXXXX shows the booking total and a card form. Until a real gateway is connected, ANY card details are
 * accepted: the browser sends nothing about the card (no number, no CVV) — the server only records "paid (demo)". */
const REF_RE = /^TB-[0-9A-F]{6}$/;
const findBooking = ref => readStore('bookings.jsonl').find(b => b.ref === ref) || null;
const findPayment = ref => readStore('payments.jsonl').find(p => p.ref === ref) || null;

for (const lang of ['en', 'ar']) {
  app.get((lang === 'ar' ? '/ar' : '') + '/pay/:ref', (req, res, next) => {
    const ref = String(req.params.ref).toUpperCase();
    const booking = REF_RE.test(ref) && findBooking(ref);
    if (!booking) return next(); // → 404 page
    const h = viewHelpers(lang, '/pay/' + ref);
    res.set('Cache-Control', 'no-store');
    res.render('pages/pay', { ...h, page: { nav: null, view: 'pay' }, query: {}, booking, payment: findPayment(ref), title: `${h.t('pay.title')} — The Billion` });
  });
}

app.post('/api/pay/:ref', rateLimit(), (req, res) => {
  const ref = String(req.params.ref).toUpperCase();
  const booking = REF_RE.test(ref) && findBooking(ref);
  if (!booking) return res.status(404).json({ ok: false, error: 'Booking not found.' });
  const existing = findPayment(ref);
  if (existing) return res.json({ ok: true, ref, paidAt: existing.paidAt, already: true });
  const brand = ['visa', 'mastercard', 'amex', 'card'].includes(req.body?.brand) ? req.body.brand : 'card';
  const payment = { ref, paidAt: new Date().toISOString(), amount: booking.price.total, currency: booking.price.currency, method: brand, mode: 'demo' };
  store('payments.jsonl', payment);
  console.log(`[payment] ${ref} OMR ${Number(payment.amount).toFixed(3)} (demo)`);
  res.json({ ok: true, ref, paidAt: payment.paidAt });
});

/* ---------- SEO ---------- */
app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${site.domain}/sitemap.xml\n`));
app.get('/sitemap.xml', (req, res) => {
  const urls = pages.flatMap(p => [p.path, '/ar' + (p.path === '/' ? '' : p.path)]);
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${site.domain}${u}</loc></url>`).join('')}</urlset>`);
});

/* ---------- 404 ---------- */
app.use((req, res) => {
  const lang = req.path.startsWith('/ar') ? 'ar' : 'en';
  const h = viewHelpers(lang, '/');
  res.status(404).render('pages/404', { ...h, page: { nav: null }, query: {}, title: h.t('notFound.title') + ' — The Billion' });
});

app.listen(PORT, () => console.log(`The Billion website running on http://localhost:${PORT}`));
