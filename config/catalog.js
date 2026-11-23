/**
 * Services, fleet and prices (OMR, before VAT).
 * Prices marked "PLACEHOLDER" were not in the design files — confirm them before launch.
 * The server always recalculates totals from this file; prices sent by the browser are ignored.
 */
module.exports = {
  transferClasses: [
    {
      id: 'business', name: { en: 'Business', ar: 'بيزنس' },
      model: { en: 'E-Class or similar', ar: 'الفئة E أو ما يماثلها' },
      seats: 3, bags: 2, oneWay: 18.5, hourly: 12, // hourly: PLACEHOLDER
      img: 'mercedes-detail'
    },
    {
      id: 'first', name: { en: 'First', ar: 'فيرست' },
      model: { en: 'S-Class or similar', ar: 'الفئة S أو ما يماثلها' },
      seats: 3, bags: 2, oneWay: 32, hourly: 20, // hourly: PLACEHOLDER
      img: 'sclass-dark'
    },
    {
      id: 'van', name: { en: 'Van / SUV', ar: 'فان / SUV' },
      model: { en: 'V-Class or similar', ar: 'الفئة V أو ما يماثلها' },
      seats: 6, bags: 6, oneWay: 26, hourly: 16, // hourly: PLACEHOLDER
      img: 'vclass'
    }
  ],
  minHours: 3, // PLACEHOLDER — minimum booking for "by the hour"

  rentalCars: [
    { id: 's580', name: 'Mercedes-Benz S 580', type: { en: 'Sedan', ar: 'سيدان' }, year: 2025, seats: 4, bags: 3, perDay: 85, img: 'sclass-street' },
    { id: 'rr-autobiography', name: 'Range Rover Autobiography', type: { en: 'SUV', ar: 'SUV' }, year: 2025, seats: 5, bags: 4, perDay: 95, img: 'range-rover' },
    { id: 'maybach-gls', name: 'Mercedes-Maybach GLS', type: { en: 'SUV', ar: 'SUV' }, year: 2024, seats: 4, bags: 4, perDay: 140, img: 'mercedes-detail' },
    { id: 'bentley-gt', name: 'Bentley Continental GT', type: { en: 'Coupé', ar: 'كوبيه' }, year: 2024, seats: 2, bags: 2, perDay: 160, img: 'bentley' }
  ],

  airportServices: [
    { id: 'home-checkin', icon: 'house', price: 25, name: { en: 'Home check-in', ar: 'إنهاء الإجراءات من المنزل' }, desc: { en: 'We collect your bags and check you in before you leave home.', ar: 'نستلم حقائبك وننهي إجراءات سفرك قبل خروجك من المنزل.' } },
    { id: 'fast-track', icon: 'chevrons-right', price: 15, name: { en: 'Fast track', ar: 'المسار السريع' }, desc: { en: 'Priority lanes through security and passport control.', ar: 'مسارات ذات أولوية عبر التفتيش والجوازات.' } },
    { id: 'lounges', icon: 'sofa', price: 25, img: 'lounge', name: { en: 'Lounges', ar: 'القاعات' }, desc: { en: 'Lounge access before departure, whichever airline you fly.', ar: 'دخول القاعة قبل المغادرة أياً كانت شركة الطيران.' } },
    { id: 'assistance', icon: 'hand-helping', price: 20, img: 'assistance', name: { en: 'Airport assistance', ar: 'المساعدة في المطار' }, desc: { en: 'A host who accompanies you from kerb to gate, or gate to car.', ar: 'مرافق يصحبك من الرصيف إلى البوابة، أو من البوابة إلى السيارة.' } },
    { id: 'land-leave', icon: 'plane-landing', price: 60, img: 'land-leave', name: { en: 'Land & Leave', ar: 'Land & Leave' }, desc: { en: 'Met at the aircraft, fast-tracked through arrivals and straight to the car.', ar: 'نستقبلك عند الطائرة، ونسرّع خروجك من القدوم مباشرة إلى السيارة.' } }
  ],

  // Suggestions for the pickup / drop-off fields (until Google Maps / Mapbox is connected)
  places: [
    'Muscat International Airport, Arrivals', 'Muscat International Airport, Departures',
    'The Chedi Muscat', 'Al Bustan Palace, a Ritz-Carlton Hotel', 'Shangri-La Barr Al Jissah',
    'Grand Hyatt Muscat', 'W Muscat', 'Kempinski Hotel Muscat', 'Royal Opera House Muscat',
    'Muscat Grand Mall', 'Mall of Oman', 'Sultan Qaboos Grand Mosque', 'Mutrah Corniche', 'Nizwa', 'Sur', 'Duqm'
  ]
};
