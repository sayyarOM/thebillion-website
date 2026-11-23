const catalog = require('../config/catalog');
const site = require('../config/site');

const r3 = n => Math.round(n * 1000) / 1000;
const withVat = subtotal => {
  const vat = r3(subtotal * site.vatRate);
  return { subtotal: r3(subtotal), vat, total: r3(subtotal + vat) };
};
const int = (v, min, max) => {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return null;
  return Math.min(Math.max(n, min), max);
};

function quoteTransfer({ classId, mode = 'oneway', hours, extras = [], passengers }) {
  const c = catalog.transferClasses.find(x => x.id === classId);
  if (!c) throw new Error('Unknown class');
  const lines = [];
  let h;
  if (mode === 'hourly') {
    h = int(hours, catalog.minHours, 24) || catalog.minHours;
    lines.push({ key: 'hourly', label: c.name, qty: h, unit: c.hourly, amount: r3(c.hourly * h) });
  } else {
    lines.push({ key: 'oneway', label: c.name, qty: 1, unit: c.oneWay, amount: c.oneWay });
  }
  // Optional airport services added to a transfer (priced per person)
  const pax = int(passengers, 1, c.seats) || 1;
  [...new Set(Array.isArray(extras) ? extras : [extras])]
    .map(id => catalog.airportServices.find(s => s.id === id)).filter(Boolean)
    .forEach(s => lines.push({ key: s.id, label: s.name, qty: pax, unit: s.price, amount: r3(s.price * pax) }));
  return { lines, ...withVat(lines.reduce((t, l) => t + l.amount, 0)), hours: h, passengers: pax };
}

function daysBetween(from, to) {
  const a = new Date(from), b = new Date(to);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.max(1, Math.round((b - a) / 86400000));
}

function quoteRental({ carId, from, to }) {
  const car = catalog.rentalCars.find(x => x.id === carId);
  if (!car) throw new Error('Unknown car');
  const days = daysBetween(from, to);
  if (!days || days > 90) throw new Error('Invalid dates');
  return { lines: [{ key: 'rental', label: car.name, qty: days, unit: car.perDay, amount: r3(car.perDay * days) }], ...withVat(car.perDay * days), days };
}

function quoteAirport({ services = [], passengers }) {
  const pax = int(passengers, 1, 20) || 1;
  const ids = [...new Set(Array.isArray(services) ? services : [services])];
  const lines = ids.map(id => catalog.airportServices.find(s => s.id === id)).filter(Boolean)
    .map(s => ({ key: s.id, label: s.name, qty: pax, unit: s.price, amount: r3(s.price * pax) }));
  if (!lines.length) throw new Error('Choose at least one service');
  return { lines, ...withVat(lines.reduce((t, l) => t + l.amount, 0)), passengers: pax };
}

module.exports = { quoteTransfer, quoteRental, quoteAirport, daysBetween };
