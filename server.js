/**
 * The Billion — website server (Node.js + Express + EJS)
 * Run:  npm install && npm start   →  http://localhost:3000   (Arabic: /ar)
 */
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

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'"],
      styleSrcAttr: ["'unsafe-inline'"], // only CSS custom properties like style="--d:1" for animation stagger
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
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
      pickup: clean(b.pickup), dropoff: clean(b.dropoff), date: clean(b.date, 10), time: clean(b.time, 5),
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
  res.json({ ok: true, items: readStore(req.params.what + '.jsonl').reverse() });
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
