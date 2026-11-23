/* The Billion — front-end behaviour (no dependencies) */
(() => {
  'use strict';
  const BASE = (document.documentElement.dataset.base || '').replace(/\/+$/, ''); // site mounted under a sub-path (BASE_PATH)
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const json = id => { try { return JSON.parse($('#' + id).textContent); } catch { return {}; } };
  const T = json('i18n');
  const CAT = json('catalog');
  const lang = T.lang || 'en';
  const L = o => (o && typeof o === 'object' ? (o[lang] ?? o.en) : o);
  const omr = n => 'OMR ' + Number(n).toFixed(3);
  // map point chosen by places.js (hidden <name>Lat / <name>Lng inputs) → { lat, lng } or null
  const geoOf = inp => { const f = inp.form, a = f?.elements[inp.name + 'Lat']?.value, b = f?.elements[inp.name + 'Lng']?.value; return a && b ? { lat: +a, lng: +b } : null; };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad = n => String(n).padStart(2, '0');
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDate = (v, withWeekday = true) => {
    if (!v) return '';
    const d = new Date(v + 'T00:00:00');
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM' : 'en-GB', { weekday: withWeekday ? 'short' : undefined, day: 'numeric', month: 'short' }).format(d);
  };

  /* ---------- navbar: transparent → floating glass pill; hide on scroll down ---------- */
  const nav = $('[data-nav]');
  const bar = $('.progress span');
  let lastY = 0;
  const onScroll = () => {
    const y = scrollY;
    nav.classList.toggle('is-scrolled', y > 30);
    nav.classList.toggle('is-hidden', y > 700 && y > lastY + 4);
    if (y < lastY - 4 || y < 700) nav.classList.remove('is-hidden');
    lastY = y;
    const h = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.setProperty('--p', h > 0 ? (y / h).toFixed(4) : 0);
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- mobile menu ---------- */
  const menu = $('[data-menu]');
  const toggle = $('[data-menu-toggle]');
  const setMenu = open => {
    toggle.setAttribute('aria-expanded', open);
    nav.classList.toggle('menu-open', open);
    document.body.classList.toggle('no-scroll', open);
    if (open) { menu.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open'))); }
    else { menu.classList.remove('is-open'); setTimeout(() => { if (!menu.classList.contains('is-open')) menu.hidden = true; }, 700); }
  };
  toggle?.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  addEventListener('keydown', e => { if (e.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') setMenu(false); });
  $$('a', menu).forEach(a => a.addEventListener('click', () => setMenu(false)));

  $('[data-top]')?.addEventListener('click', e => { e.preventDefault(); scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); });

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
  }), { rootMargin: '0px 0px -8% 0px', threshold: .08 });
  $$('.reveal, .clipreveal, .appcta').forEach(el => io.observe(el));

  /* ---------- counters ---------- */
  const cio = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    const el = en.target, end = +el.dataset.count, t0 = performance.now(), dur = reduced ? 1 : 1400;
    const tick = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(end * e);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    cio.unobserve(el);
  }), { threshold: .6 });
  $$('[data-count]').forEach(el => cio.observe(el));

  /* ---------- parallax (uses `translate`, so it never fights CSS transform animations) ---------- */
  const px = $$('[data-parallax]');
  if (px.length && !reduced) {
    let ticking = false;
    const run = () => {
      px.forEach(img => {
        const box = img.parentElement.getBoundingClientRect();
        if (box.bottom < 0 || box.top > innerHeight) return;
        const speed = +img.dataset.parallax;
        const offset = (box.top + box.height / 2 - innerHeight / 2) * -speed;
        img.style.translate = `0 ${offset.toFixed(1) - box.height * 0.07}px`;
      });
      ticking = false;
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(run); } }, { passive: true });
    run();
  }

  /* ---------- segmented controls ---------- */
  const initSeg = (seg, onChange) => {
    const btns = $$('button', seg);
    seg.style.setProperty('--n', btns.length);
    const set = i => {
      btns.forEach((b, j) => { b.classList.toggle('is-on', i === j); b.setAttribute('aria-selected', i === j); });
      seg.style.setProperty('--i', i);
      onChange?.(btns[i], i);
    };
    btns.forEach((b, i) => b.addEventListener('click', () => set(i)));
    return set;
  };

  /* ---------- default dates ---------- */
  const today = new Date();
  $$('input[type="date"]').forEach(inp => {
    inp.min = isoDate(today);
    if (!inp.value && inp.dataset.defaultDate) {
      const d = new Date(today); d.setDate(d.getDate() + +inp.dataset.defaultDate); inp.value = isoDate(d);
    }
  });

  /* ---------- steppers ---------- */
  $$('[data-stepper]').forEach(st => {
    const inp = $('input', st);
    $$('button', st).forEach(b => b.addEventListener('click', () => {
      const v = Math.min(+inp.max || 99, Math.max(+inp.min || 1, (+inp.value || 1) + +b.dataset.step));
      inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true }));
    }));
  });

  /* ---------- hero booker (home) ---------- */
  const hb = $('[data-hero-booker]');
  if (hb) {
    initSeg($('.seg', hb), btn => {
      const tab = btn.dataset.tab;
      $$('[data-panel]', hb).forEach(p => {
        const on = p.dataset.panel === tab;
        p.hidden = !on;
        $$('input', p).forEach(i => (i.disabled = !on));
      });
      $$('[data-cta]', hb).forEach(c => (c.hidden = c.dataset.cta !== tab));
      hb.action = tab === 'rental' ? hb.dataset.actionRental : hb.dataset.actionChauffeur;
    });
  }

  /* ---------- validation helper ---------- */
  const validate = fields => {
    let first = null;
    fields.forEach(inp => {
      const f = inp.closest('.field');
      const ok = inp.value.trim() !== '';
      f?.classList.toggle('is-invalid', !ok);
      if (!ok && !first) first = inp;
    });
    if (first) { first.focus({ preventScroll: true }); first.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); }
    return !first;
  };
  document.addEventListener('input', e => e.target.closest?.('.field')?.classList.remove('is-invalid'));

  /* ---------- confirm dialog ---------- */
  const dlg = $('[data-confirm]');
  let pending = null;
  const openConfirm = (payload, title, total) => {
    pending = payload;
    $('[data-step="form"]', dlg).hidden = false;
    $('[data-step="done"]', dlg).hidden = true;
    $('[data-confirm-summary]', dlg).textContent = title;
    $('[data-confirm-total]', dlg).textContent = omr(total);
    $('[data-error]', dlg).hidden = true;
    dlg.showModal();
    setTimeout(() => $('input[name="name"]', dlg).focus(), 50);
  };
  $$('[data-close]', dlg).forEach(b => b.addEventListener('click', () => dlg.close()));
  dlg?.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  $('[data-confirm-form]')?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, err = $('[data-error]', f), btn = $('[data-submit]', f);
    const name = f.name.value.trim(), mobile = f.mobile.value.trim(), email = f.email.value.trim();
    if (!validate([f.name, f.mobile])) return;
    if (!/^\+?[0-9 ]{8,16}$/.test(mobile)) { err.textContent = T.errors.mobile; err.hidden = false; return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = T.errors.email; err.hidden = false; return; }
    btn.disabled = true;
    try {
      const res = await fetch(BASE + '/api/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pending, lang, customer: { name, mobile, email, notes: f.notes.value } })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      $('[data-done-text]', f).textContent = T.confirm.successText.replace('{ref}', data.ref);
      const pay = $('[data-pay-link]', f);
      if (pay) pay.href = pay.dataset.payBase.replace(/\/?$/, '/') + data.ref;
      $('[data-step="form"]', f).hidden = true;
      $('[data-step="done"]', f).hidden = false;
      f.reset();
    } catch (ex) {
      err.textContent = T.confirm.error; err.hidden = false;
    } finally { btn.disabled = false; }
  });

  /* ---------- shared summary rendering ---------- */
  const renderLines = (box, lines, subtotal) => {
    const vat = Math.round(subtotal * 0.05 * 1000) / 1000;
    box.innerHTML = lines.map(l => `<div><dt>${l.label}</dt><dd>${l.amount.toFixed(3)}</dd></div>`).join('')
      + (lines.length ? `<div><dt>${T.common.vat}</dt><dd>${vat.toFixed(3)}</dd></div>` : '');
    return subtotal + vat;
  };
  const setTotal = (total) => $$('[data-total]').forEach(el => {
    const txt = total ? omr(total) : '—';
    if (el.textContent !== txt) { el.textContent = txt; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  });
  const mobileBar = () => {
    const mb = $('[data-mbar]'), sum = $('[data-summary]');
    if (!mb || !sum) return;
    new IntersectionObserver(([en]) => mb.classList.toggle('is-on', !en.isIntersecting && en.boundingClientRect.top > 0)).observe(sum);
  };

  /* ---------- chauffeur booking ---------- */
  const tb = $('[data-booking="transfer"]');
  if (tb) {
    const f = $('[data-form]', tb);
    let mode = 'oneway';
    const modeLabel = () => $$('.seg button', f)[mode === 'hourly' ? 1 : 0].textContent.trim();
    const update = () => {
      const cls = CAT.transferClasses.find(c => c.id === f.classId.value) || CAT.transferClasses[0];
      const hours = +f.hours.value;
      const pax = Math.min(cls.seats, Math.max(1, +f.passengers.value || 1));
      const extras = $$('input[name="extras"]:checked', f).map(i => CAT.airportServices.find(s => s.id === i.value));
      const lines = [mode === 'hourly'
        ? { label: `${L(cls.name)} · ${hours} ${T.common.hours}`, amount: cls.hourly * hours }
        : { label: L(cls.name), amount: cls.oneWay }];
      extras.forEach(s => lines.push({ label: `${L(s.name)} × ${pax}`, amount: s.price * pax }));
      const total = renderLines($('[data-lines]', tb), lines, lines.reduce((t, l) => t + l.amount, 0));
      setTotal(total);
      $('[data-s-mode]', tb).textContent = modeLabel();
      $('[data-s-class]', tb).textContent = L(cls.name);
      $('[data-s-pickup]', tb).textContent = f.pickup.value || '—';
      $('[data-s-dropoff]', tb).textContent = f.dropoff.value || '—';
      $('[data-s-when]', tb).textContent = [fmtDate(f.date.value), f.time.value].filter(Boolean).join(', ') + (mode === 'hourly' ? ` · ${hours} ${T.common.hours}` : '');
      $('[data-s-flight-wrap]', tb).hidden = !f.flight.value.trim();
      $('[data-s-flight]', tb).textContent = f.flight.value.trim().toUpperCase();
      $$('.opt__price', f).forEach(p => {
        p.textContent = mode === 'hourly' ? `${omr(p.dataset.priceHourly)} / ${T.common.hour}` : omr(p.dataset.priceOneway);
      });
      return { cls, total, extras, pax, hours };
    };
    initSeg($('.seg', f), btn => {
      mode = btn.dataset.mode;
      $$('[data-oneway-only]', tb).forEach(el => (el.hidden = mode !== 'oneway'));
      $$('[data-hourly-only]', tb).forEach(el => (el.hidden = mode !== 'hourly'));
      update();
    });
    const addBtn = $('[data-toggle-addons]', tb), addons = $('[data-addons]', tb);
    addBtn.addEventListener('click', () => {
      addons.hidden = !addons.hidden;
      addBtn.textContent = addons.hidden ? T.chauffeur.addServices : T.chauffeur.hideServices;
      if (!addons.hidden) addons.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    });
    f.addEventListener('input', update);
    f.addEventListener('change', update);
    $$('[data-continue]').forEach(b => b.addEventListener('click', () => {
      const req = [f.pickup, f.date, f.time].concat(mode === 'oneway' ? [f.dropoff] : []);
      if (!validate(req)) return;
      const s = update();
      openConfirm({
        type: 'transfer', mode, classId: s.cls.id, hours: s.hours, extras: s.extras.map(x => x.id), passengers: s.pax,
        pickup: f.pickup.value, pickupGeo: geoOf(f.pickup), dropoff: mode === 'oneway' ? f.dropoff.value : '', dropoffGeo: mode === 'oneway' ? geoOf(f.dropoff) : null, date: f.date.value, time: f.time.value, flight: f.flight.value
      }, `${L(s.cls.name)} · ${fmtDate(f.date.value)}, ${f.time.value}`, s.total);
    }));
    update();
    mobileBar();
  }

  /* ---------- car rental ---------- */
  const rb = $('[data-booking="rental"]');
  if (rb) {
    const f = $('[data-form]', rb);
    const bar = $('[data-reservebar]');
    const daysLabel = $('[data-days-label]');
    const days = () => {
      const a = new Date(f.from.value), b = new Date(f.to.value);
      if (isNaN(a) || isNaN(b) || b <= a) return 0;
      return Math.round((b - a) / 86400000);
    };
    const update = () => {
      const n = days();
      $('[data-date-error]').hidden = n > 0;
      daysLabel.textContent = daysLabel.dataset.template.replace('{n}', n || '—');
      const sel = $('input[name="carId"]:checked', rb);
      const car = sel && CAT.rentalCars.find(c => c.id === sel.value);
      const btn = $('[data-continue]', bar);
      bar.classList.toggle('is-on', !!car);
      if (!car || !n) { btn.disabled = true; $('[data-rb-label]', bar).textContent = T.rental.reserve; return null; }
      const sub = car.perDay * n, total = Math.round(sub * 1.05 * 1000) / 1000;
      btn.disabled = false;
      $('[data-rb-car]', bar).textContent = car.name;
      $('[data-rb-lines]', bar).textContent = `${n} × ${omr(car.perDay)} · ${fmtDate(f.from.value, false)} → ${fmtDate(f.to.value, false)} · ${T.common.vat}`;
      $('[data-rb-label]', bar).textContent = `${T.rental.reserve} · ${omr(total)}`;
      return { car, n, total };
    };
    f.addEventListener('input', update);
    f.addEventListener('submit', e => { e.preventDefault(); update(); $('.cars').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); });
    $$('input[name="carId"]', rb).forEach(r => r.addEventListener('change', update));
    $('[data-continue]', bar).addEventListener('click', () => {
      if (!validate([f.pickup, f.from, f.to])) return;
      const s = update(); if (!s) return;
      openConfirm({ type: 'rental', carId: s.car.id, pickup: f.pickup.value, pickupGeo: geoOf(f.pickup), from: f.from.value, to: f.to.value },
        `${s.car.name} · ${s.n} ${T.common.days}`, s.total);
    });
    update();
  }

  /* ---------- airport services ---------- */
  const ab = $('[data-booking="airport"]');
  if (ab) {
    const f = $('[data-form]', ab);
    const update = () => {
      const pax = Math.max(1, +f.passengers.value || 1);
      const picked = $$('input[name="services"]:checked', f).map(i => CAT.airportServices.find(s => s.id === i.value));
      const lines = picked.map(s => ({ label: `${L(s.name)} × ${pax}`, amount: s.price * pax }));
      const total = renderLines($('[data-lines]', ab), lines, lines.reduce((t, l) => t + l.amount, 0));
      $('[data-empty]', ab).hidden = picked.length > 0;
      setTotal(picked.length ? total : 0);
      return { picked, pax, total };
    };
    f.addEventListener('input', update);
    f.addEventListener('change', update);
    $$('[data-continue]').forEach(b => b.addEventListener('click', () => {
      const s = update();
      if (!s.picked.length) { $('.svc').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); return; }
      if (!validate([f.flight, f.date])) return;
      openConfirm({ type: 'airport', services: s.picked.map(x => x.id), passengers: s.pax, flight: f.flight.value, date: f.date.value },
        `${s.picked.map(x => L(x.name)).join(' · ')} · ${f.flight.value.toUpperCase()}`, s.total);
    }));
    update();
    mobileBar();
  }

  /* ---------- contact form ---------- */
  const cf = $('[data-contact]');
  cf?.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('[data-error]', cf), ok = $('[data-ok]', cf), btn = $('button[type="submit"]', cf);
    err.hidden = true;
    if (!validate([cf.name, cf.mobile, cf.message])) return;
    if (!/^\+?[0-9 ]{8,16}$/.test(cf.mobile.value.trim())) { err.textContent = T.errors.mobile; err.hidden = false; return; }
    btn.disabled = true;
    try {
      const res = await fetch(BASE + '/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cf.name.value, mobile: cf.mobile.value, email: cf.email.value, message: cf.message.value, interests: $$('input[name="interests"]:checked', cf).map(i => i.value) })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      cf.reset(); ok.hidden = false; btn.hidden = true;
    } catch { err.textContent = T.confirm.error; err.hidden = false; }
    finally { btn.disabled = false; }
  });
})();
