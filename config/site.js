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
  vatRate: 0.05,
  currency: 'OMR'
};
