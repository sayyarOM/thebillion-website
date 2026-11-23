/**
 * Site-wide settings. Replace the [PLACEHOLDERS] with real details before launch.
 * Anything left as a placeholder (starts with "[") is hidden automatically where possible.
 */
module.exports = {
  name: 'The Billion',
  domain: process.env.SITE_URL || 'https://thebillion.om',
  phone: '[PHONE NUMBER]',          // e.g. '+968 9000 0000'
  whatsapp: '',                     // digits only, e.g. '96890000000' — leave empty to hide the WhatsApp button
  email: '[EMAIL ADDRESS]',         // e.g. 'concierge@thebillion.om'
  address: { en: '[OFFICE ADDRESS], Muscat', ar: '[عنوان المكتب]، مسقط' },
  airportDesk: { en: 'Desk at Muscat International Airport, Arrivals', ar: 'مكتبنا في مطار مسقط الدولي، صالة القادمين' },
  appStoreUrl: '#',                 // add the real links once the apps are published
  googlePlayUrl: '#',
  social: { instagram: '', linkedin: '', x: '' },
  // Maps (keys stay on the server — see /api/maps/* in server.js; set them in .env):
  //   GOOGLE_MAPS_KEY → place search + addresses (Places API + Geocoding API), MAPBOX_TOKEN → map tiles.
  //   Missing → free fallback (Photon search, Nominatim addresses, OpenStreetMap tiles).
  get mapsGoogle() { return !!process.env.GOOGLE_MAPS_KEY; },
  get mapsMapbox() { return !!process.env.MAPBOX_TOKEN; },
  mapCenter: { lat: 23.5880, lng: 58.3829 },  // Muscat
  mapRegions: ['om'],                          // countries the address search covers (ISO codes)
  // Merchant shown on the checkout page (/pay/:ref)
  payMerchant: {
    name: 'sayyar',
    logo: '/brand/sayyar-icon.png',
    address: { en: 'muscat - Al Khuwair - Al Wazarat St, ryiada', ar: 'مسقط - الخوير - شارع الوزارات، ريادة' },
    phone: '+968 96706667'
  },
  vatRate: 0.05,
  currency: 'OMR'
};
