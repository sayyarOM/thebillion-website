# The Billion — Website

Luxury chauffeur, car rental and airport services in Muscat, Oman.
موقع The Billion — توصيل فاخر بسائق خاص، واستئجار سيارات، وخدمات المطار في مسقط.

**Stack:** Node.js 18+ · Express · EJS (HTML templates) · plain CSS · vanilla JavaScript — no build step.
English and Arabic (full RTL).

---

## Quick start · التشغيل

```bash
npm install
npm start
```

- English: http://localhost:3000
- العربية: http://localhost:3000/ar

`npm run dev` restarts automatically when you edit files.

---

## Project structure · هيكل المشروع

```
.
├── server.js               # Express server: routes, API, security headers
├── package.json
├── .env.example            # Environment variables (copy to .env)
│
├── config/
│   ├── site.js             # Phone, WhatsApp, email, address, app links   ← edit before launch
│   └── catalog.js          # Classes, cars, airport services and PRICES (OMR)
│
├── locales/
│   ├── en.js               # All English text
│   └── ar.js               # All Arabic text
│
├── lib/
│   ├── pricing.js          # Price + VAT 5% calculation (server is the source of truth)
│   └── icons.js            # Lucide icons
│
├── views/                  # HTML pages (EJS templates)
│   ├── partials/           # head, nav, footer, booking dialog, cards
│   └── pages/              # home, chauffeur, rental, airport, fleet, contact, legal, 404
│
├── public/                 # Static files served as-is
│   ├── css/                # main.css (design tokens at the top), fonts.css
│   ├── js/main.js          # Navbar, animations, booking flows, forms
│   ├── img/                # Photos (WebP; "-sm" = 900px version)
│   ├── brand/              # Logo SVGs
│   └── fonts/              # IBM Plex Sans / Arabic / Mono (self-hosted)
│
└── data/                   # Bookings & messages saved as JSON lines (ignored by git)
```

## Pages · الصفحات

| English | العربية | |
|---|---|---|
| `/` | `/ar` | Home |
| `/chauffeur` | `/ar/chauffeur` | Chauffeur booking (one way / by the hour) |
| `/rental` | `/ar/rental` | Car rental |
| `/airport` | `/ar/airport` | Airport services |
| `/fleet` | `/ar/fleet` | Fleet |
| `/contact` | `/ar/contact` | Contact |
| `/terms` `/privacy` `/cancellation` `/careers` | `/ar/...` | Legal & careers |

## API

| Method | Path | |
|---|---|---|
| POST | `/api/quote/:type` | `transfer` \| `rental` \| `airport` → lines, VAT, total |
| POST | `/api/bookings` | Saves a booking, returns `{ ref: "TB-XXXXXX" }` |
| POST | `/api/contact` | Saves a concierge request |
| GET | `/api/admin/bookings` · `/api/admin/messages` | For the control dashboard. Header: `Authorization: Bearer <ADMIN_TOKEN>` |

## Deploy · النشر

The site needs a Node.js host (it has a server and an API), for example Render, Railway, Fly.io, a VPS, or any host that runs Node.js.
GitHub Pages cannot run it because it only serves static files.

1. Set environment variables from `.env.example` (`NODE_ENV=production`, `SITE_URL`, `ADMIN_TOKEN`).
2. Build command: `npm install` · Start command: `npm start`.

## Before launch · قبل الإطلاق

- [ ] Real contact details in `config/site.js` (replace the `[PLACEHOLDERS]`).
- [ ] Confirm hourly prices and minimum hours in `config/catalog.js` (marked PLACEHOLDER).
- [ ] Real fleet photos in `public/img/` (keep the same file names).
- [ ] Connect Google Maps / Mapbox for addresses, online payment, and SMS confirmation.
- [ ] Replace the bookings file storage (`store()` in `server.js`) with a database or the dashboard API.
- [ ] Write the legal pages (text in `locales/en.js` and `locales/ar.js` → `legal`).

---

© The Billion. All rights reserved.
