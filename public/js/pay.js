/* The Billion — checkout page (DEMO). Any card details are accepted.
 * Card number / expiry / CVV / name never leave the browser: the request only says which booking was paid
 * and the card brand. Replace submit() with the real gateway (e.g. Paymob) when it is connected. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const root = $('[data-pay]');
  if (!root) return;
  let T = {};
  try { T = JSON.parse($('#pay-i18n').textContent); } catch { /* defaults below */ }

  // language switch
  $('[data-pay-lang]')?.addEventListener('change', e => {
    const href = e.target.selectedOptions[0]?.dataset.href;
    if (href) location.href = href;
  });

  const f = $('[data-pay-form]');
  if (!f) return; // already paid
  const btn = $('[data-pay-btn]'), err = $('[data-pay-error]');
  const digits = v => v.replace(/\D/g, '');
  const brandOf = n => /^4/.test(n) ? 'visa' : /^(5[1-5]|2[2-7])/.test(n) ? 'mastercard' : /^3[47]/.test(n) ? 'amex' : 'card';

  f.number.addEventListener('input', () => {
    const n = digits(f.number.value).slice(0, 19);
    const amex = /^3[47]/.test(n);
    f.number.value = amex ? n.replace(/^(\d{0,4})(\d{0,6})(\d{0,5}).*/, (_, a, b, c) => [a, b, c].filter(Boolean).join(' '))
      : n.replace(/(\d{4})(?=\d)/g, '$1 ');
    const b = brandOf(n);
    root.querySelectorAll('[data-brand]').forEach(el => el.classList.toggle('is-dim', n.length > 0 && b !== 'card' && el.dataset.brand !== b));
  });
  f.exp.addEventListener('input', e => {
    let v = digits(f.exp.value).slice(0, 4);
    if (v.length === 1 && +v > 1) v = '0' + v;
    f.exp.value = v.length > 2 || (v.length === 2 && e.inputType !== 'deleteContentBackward') ? v.slice(0, 2) + '/' + v.slice(2) : v;
  });
  f.cvv.addEventListener('input', () => { f.cvv.value = digits(f.cvv.value).slice(0, 4); });

  const filled = () => ['number', 'exp', 'cvv', 'holder'].every(k => f[k].value.trim());
  f.addEventListener('input', () => { btn.disabled = !filled(); err.hidden = true; });

  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (!filled()) { err.textContent = T.fill || 'Please complete the card details.'; err.hidden = false; return; }
    btn.disabled = true; btn.classList.add('is-busy');
    try {
      const res = await fetch('/api/pay/' + encodeURIComponent(root.dataset.ref), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: brandOf(digits(f.number.value)) })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      f.reset();
      f.hidden = true;
      $('[data-pay-done]').hidden = false;
    } catch {
      err.textContent = T.error || 'The payment could not be completed.'; err.hidden = false;
      btn.disabled = false;
    } finally { btn.classList.remove('is-busy'); }
  });
})();
