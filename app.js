import { store, isLocal, isConnectionError } from './store.js';
import { LANGS, lang, setLang, t } from './i18n.js';
import { privacyHTML } from './privacy.js';
import { deviceTz, timeZoneOptions, tzName, utcToZoned, zonedToUtc } from './tz.js';

// --- Utilità ----------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = n => String(n).padStart(2, '0');
const hhmm = min => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = s => new Date(`${s}T12:00:00`);
const slotKey = (date, min) => `${date}T${hhmm(min)}`;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// Formattatori di date nella lingua corrente (ricreati a ogni cambio lingua).
let F;
function buildFormatters() {
  const f = opts => new Intl.DateTimeFormat(lang, opts);
  F = {
    weekday: f({ weekday: 'short' }),
    narrow: f({ weekday: 'narrow' }),
    dayMonth: f({ day: 'numeric', month: 'short' }),
    long: f({ weekday: 'long', day: 'numeric', month: 'long' }),
    month: f({ month: 'short' }),
    dayLongMonth: f({ day: 'numeric', month: 'long' }),
  };
}

// Intervallo di date con il mese per esteso: "19–25 ottobre", "26 ottobre – 1 novembre".
function fmtSpan(a, b) {
  let text;
  try { text = F.dayLongMonth.formatRange(a, b); }
  catch { text = `${F.dayLongMonth.format(a)} – ${F.dayLongMonth.format(b)}`; }
  // Alcuni browser scrivono "08" invece di "8" negli intervalli.
  return text.replace(/(^|[^\d])0(\d)(?!\d)/g, '$1$2');
}

function fmtDuration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

function fmtDateRange(dates) {
  if (dates.length === 1) return cap(F.long.format(parseDate(dates[0])));
  return `${fmtSpan(parseDate(dates[0]), parseDate(dates.at(-1)))} · ${t('nDays', dates.length)}`;
}

// --- Contatti dell'organizzatore ----------------------------------------------
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const phoneDigits = phone => String(phone ?? '').replace(/(?!^\+)[^\d]/g, '');

function normalizeUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

const icon = path => `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const CHEVRON_LEFT = icon('<path d="m15 18-6-6 6-6"/>').replace('width="15" height="15"', 'width="20" height="20"');
const CHEVRON_RIGHT = icon('<path d="m9 18 6-6-6-6"/>').replace('width="15" height="15"', 'width="20" height="20"');
const ICONS = {
  lock: icon('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  arrowLeft: icon('<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>'),
  arrowUp: icon('<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>'),
  plus: icon('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  people: icon('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>'),
  chevronDown: icon('<path d="m6 9 6 6 6-6"/>'),
  check: icon('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  arrowDown: icon('<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>'),
  email: icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  phone: icon('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
  whatsapp: icon('<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 10c.5 2 2 3.5 4 4l1.2-1.2 2 .9c-.3 1.1-1.2 1.8-2.3 1.8C10.8 15.5 8.5 13.2 8.5 10.1c0-1.1.7-2 1.8-2.3l.9 2z"/>'),
  link: icon('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
};

// Link cliccabili; i valori vengono ricontrollati qui perché arrivano dal database.
function contactLinks(contact) {
  if (!contact || typeof contact !== 'object') return '';
  const items = [];
  if (EMAIL_RE.test(contact.email ?? '')) {
    items.push(`<a class="contact" href="mailto:${esc(contact.email)}">${ICONS.email}${esc(contact.email)}</a>`);
  }
  const digits = phoneDigits(contact.phone);
  if (digits.replace('+', '').length >= 6) {
    items.push(`<a class="contact" href="tel:${esc(digits)}">${ICONS.phone}${esc(contact.phone)}</a>`);
    if (digits.startsWith('+')) {
      items.push(`<a class="contact" href="https://wa.me/${digits.slice(1)}" target="_blank" rel="noopener">${ICONS.whatsapp}WhatsApp</a>`);
    }
  }
  const url = normalizeUrl(contact.url);
  if (url) {
    const shown = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    items.push(`<a class="contact" href="${esc(url)}" target="_blank" rel="noopener">${ICONS.link}${esc(shown)}</a>`);
  }
  return items.length ? `<div class="contacts"><span>${t('contactOrganizer')}</span>${items.join('')}</div>` : '';
}

// --- Errori dei moduli ---------------------------------------------------------
// Ogni elemento da sistemare tiene il suo messaggio; il campo che lo contiene
// mostra l'asterisco rosso e sotto il modulo c'è una pill per ogni messaggio.
const errorBox = form => form.parentElement.querySelector('.errors');

function showErrors(box, messages) {
  box.innerHTML = messages.map(m => `<p class="error">${esc(m)}</p>`).join('');
}

function renderErrors(form) {
  showErrors(errorBox(form), [...form.querySelectorAll('.is-invalid')].map(el => el.dataset.err));
}

function markInvalid(el, message) {
  el.classList.add('is-invalid');
  el.dataset.err = message;
  el.closest('.field').classList.add('invalid');
}

function resetInvalid(form) {
  form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
  form.querySelectorAll('.field.invalid').forEach(el => el.classList.remove('invalid'));
  showErrors(errorBox(form), []);
}

// Quando l'utente corregge un campo, toglie il suo asterisco e la sua pill.
function clearInvalid(el) {
  if (!el?.classList?.contains('is-invalid')) return;
  el.classList.remove('is-invalid');
  const field = el.closest('.field');
  if (!field.querySelector('.is-invalid')) field.classList.remove('invalid');
  renderErrors(el.closest('form'));
}

const prefs = {
  get(key, fallback) { try { return localStorage.getItem(`quando:${key}`) || fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`quando:${key}`, value); } catch {} },
};

// Le versioni precedenti salvavano qui un elenco degli eventi aperti: lo cancelliamo.
try { localStorage.removeItem('quando:recent'); } catch {}

// Chi sta rispondendo a un evento su questo dispositivo (nome + password facoltativa).
const session = {
  get(eventId) {
    try { return JSON.parse(localStorage.getItem(`quando:me:${eventId}`)) ?? { name: '', password: '' }; }
    catch { return { name: '', password: '' }; }
  },
  set(eventId, value) {
    try {
      value ? localStorage.setItem(`quando:me:${eventId}`, JSON.stringify(value)) : localStorage.removeItem(`quando:me:${eventId}`);
    } catch {}
  },
};

// Selezione a rettangolo con trascinamento (mouse e touch), come When2meet.
// Le celle selezionabili hanno data-k (chiave), data-c (colonna), data-r (riga).
// Con il mouse: trascinamento a rettangolo. Al tocco (telefono): il dito scorre la
// pagina; un tocco seleziona una casella; tenere premuto e poi trascinare seleziona
// un rettangolo, come con il mouse.
function rectSelect(root, { getSet, setSet, onEnd }) {
  let start = null, mode = false, snapshot = null;
  let touch = null, longPress = null;
  const LONG_PRESS_MS = 400, MOVE_TOLERANCE = 10;

  const cellAt = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-k]');
    return el && root.contains(el) && !el.hasAttribute('data-off') ? el : null;
  };
  const apply = cur => {
    const [c0, c1] = [+start.dataset.c, +cur.dataset.c].sort((a, b) => a - b);
    const [r0, r1] = [+start.dataset.r, +cur.dataset.r].sort((a, b) => a - b);
    const next = new Set(snapshot);
    root.querySelectorAll('[data-k]:not([data-off])').forEach(el => {
      const c = +el.dataset.c, r = +el.dataset.r;
      if (c >= c0 && c <= c1 && r >= r0 && r <= r1) {
        mode ? next.add(el.dataset.k) : next.delete(el.dataset.k);
      }
    });
    setSet(next);
  };
  const begin = el => {
    snapshot = new Set(getSet());
    mode = !snapshot.has(el.dataset.k);
    start = el;
    root.classList.add('selecting');
    apply(el);
  };
  const stop = () => {
    clearTimeout(longPress);
    longPress = null;
    const wasTap = touch && !touch.moved && !start;
    const tapped = touch?.el;
    touch = null;
    if (wasTap) { begin(tapped); }
    if (!start) return;
    start = null;
    root.classList.remove('selecting');
    onEnd?.();
  };

  root.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const el = e.target.closest('[data-k]');
    if (!el || el.hasAttribute('data-off')) return;
    if (e.pointerType === 'touch') {
      // Non blocca lo scorrimento: aspetta di capire se è un tocco, un trascinamento
      // della pagina o una pressione prolungata.
      touch = { el, x: e.clientX, y: e.clientY, moved: false };
      clearTimeout(longPress);
      longPress = setTimeout(() => {
        if (!touch || touch.moved) return;
        navigator.vibrate?.(10);
        begin(touch.el);
      }, LONG_PRESS_MS);
      return;
    }
    e.preventDefault();
    root.setPointerCapture(e.pointerId);
    begin(el);
  });
  root.addEventListener('pointermove', e => {
    if (touch && !start) {
      if (Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > MOVE_TOLERANCE) {
        touch.moved = true;
        clearTimeout(longPress);
      }
      return;
    }
    if (!start) return;
    const el = cellAt(e.clientX, e.clientY);
    if (el) apply(el);
  });
  // Durante la selezione dopo la pressione prolungata, il dito non deve scorrere la pagina.
  root.addEventListener('touchmove', e => { if (start) e.preventDefault(); }, { passive: false });
  root.addEventListener('contextmenu', e => { if (touch || start) e.preventDefault(); });
  root.addEventListener('pointerup', stop);
  root.addEventListener('pointercancel', () => {
    clearTimeout(longPress);
    if (touch) touch.moved = true;
    stop();
  });
}

// Navigazione da tastiera nelle griglie (calendario e disponibilità):
// le frecce spostano il focus tra le caselle, Spazio/Invio seleziona.
// Una sola casella alla volta è raggiungibile con Tab ("roving tabindex").
function setRoving(root, cell) {
  root.querySelectorAll('[data-k][tabindex="0"]').forEach(el => { el.tabIndex = -1; });
  cell.tabIndex = 0;
}

function initRoving(root, preferKey) {
  const cells = [...root.querySelectorAll('[data-k]:not([data-off])')];
  const target = cells.find(el => el.dataset.k === preferKey) ?? cells.find(el => el.getAttribute('aria-checked') === 'true') ?? cells[0];
  if (target) target.tabIndex = 0;
}

function keyboardCells(root, { onToggle, onFocus } = {}) {
  const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  root.addEventListener('keydown', e => {
    const cell = e.target.closest?.('[data-k]');
    if (!cell || !root.contains(cell)) return;
    if (moves[e.key]) {
      e.preventDefault();
      const [dc, dr] = moves[e.key];
      const cells = [...root.querySelectorAll('[data-k]')];
      const maxC = Math.max(...cells.map(el => +el.dataset.c)), maxR = Math.max(...cells.map(el => +el.dataset.r));
      let c = +cell.dataset.c, r = +cell.dataset.r;
      while (true) {
        c += dc; r += dr;
        if (c < 0 || r < 0 || c > maxC || r > maxR) return;
        const next = root.querySelector(`[data-k][data-c="${c}"][data-r="${r}"]:not([data-off])`);
        if (next) { setRoving(root, next); next.focus(); return; }
      }
    }
    if ((e.key === ' ' || e.key === 'Enter') && onToggle && !cell.hasAttribute('data-off')) {
      e.preventDefault();
      onToggle(cell);
    }
  });
  root.addEventListener('focusin', e => {
    const cell = e.target.closest?.('[data-k]');
    if (!cell) return;
    setRoving(root, cell);
    onFocus?.(cell);
  });
}

// --- Stato della connessione -------------------------------------------------
// "offline": il dispositivo non ha rete. "down": la rete c'è ma il database non
// risponde (es. progetto Supabase in pausa o temporaneamente irraggiungibile).
let netState = 'ok';
function setNet(state) {
  netState = state;
  const banner = $('#net-banner');
  if (state === 'ok') { banner.hidden = true; banner.innerHTML = ''; return; }
  banner.hidden = false;
  banner.innerHTML = `<span>${state === 'offline' ? t('offline') : t('serviceDown')}</span>
    <button type="button" class="btn small" id="net-retry">${t('retry')}</button>`;
  $('#net-retry').addEventListener('click', () => route());
}
const noteConnection = err => {
  if (isConnectionError(err)) setNet(navigator.onLine === false ? 'offline' : 'down');
};
addEventListener('offline', () => setNet('offline'));
addEventListener('online', () => {
  if (netState !== 'ok') { setNet('ok'); dispatchEvent(new Event('whenly:reconnected')); }
});

// --- Organizzatore e calendario ---------------------------------------------
const adminKeys = {
  get(eventId) { try { return localStorage.getItem(`quando:admin:${eventId}`) || ''; } catch { return ''; } },
  set(eventId, key) {
    try { key ? localStorage.setItem(`quando:admin:${eventId}`, key) : localStorage.removeItem(`quando:admin:${eventId}`); } catch {}
  },
};

const eventLink = id => `${location.origin}${location.pathname}#/e/${id}`;
const adminLink = (id, key) => `${location.origin}${location.pathname}#/e/${id}/admin/${key}`;

// Orario confermato → istanti UTC di inizio e fine.
function finalRange(ev) {
  const [date, time] = ev.final.start.split('T');
  const [h, m] = time.split(':').map(Number);
  const start = zonedToUtc(date, h * 60 + m, ev.timezone);
  return { start, end: start + ev.final.minutes * 60000 };
}

const icsStamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = s => String(s).replace(/\\/g, '\\\\').replace(/[;,]/g, m => `\\${m}`).replace(/\r?\n/g, '\\n');

function calendarLinks(ev) {
  const { start, end } = finalRange(ev);
  const details = [ev.description, eventLink(ev.id)].filter(Boolean).join('\n\n');
  const enc = encodeURIComponent;
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${enc(ev.title)}&dates=${icsStamp(start)}/${icsStamp(end)}&details=${enc(details)}`;
  const outlook = `https://outlook.office.com/calendar/action/compose?subject=${enc(ev.title)}&startdt=${enc(new Date(start).toISOString())}&enddt=${enc(new Date(end).toISOString())}&body=${enc(details)}`;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Whenly//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${ev.id}-${icsStamp(start)}@whenly`,
    `DTSTAMP:${icsStamp(Date.now())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsText(ev.title)}`,
    `DESCRIPTION:${icsText(details)}`,
    `URL:${eventLink(ev.id)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return { google, outlook, ics };
}

function downloadIcs(ev) {
  const blob = new Blob([calendarLinks(ev).ics], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${ev.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'whenly'}.ics`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// --- Router e intestazione -------------------------------------------------
const app = $('#app');
let cleanup = () => {};

function renderChrome() {
  document.documentElement.lang = lang;
  $('#lang-label').textContent = t('language');
  $('#lang').innerHTML = Object.entries(LANGS)
    .map(([code, label]) => `<option value="${code}"${code === lang ? ' selected' : ''}>${label}</option>`).join('');
  $('#footer-note').innerHTML = isLocal ? t('localMode') : '';
  $('#privacy-link').textContent = t('privacy');
  const theme = prefs.get('theme', 'auto');
  const labels = { auto: t('themeAuto'), light: t('themeLight'), dark: t('themeDark') };
  $('#theme-switch').setAttribute('aria-label', t('theme'));
  $('#theme-switch').querySelectorAll('[data-theme-set]').forEach(btn => {
    btn.textContent = labels[btn.dataset.themeSet];
    btn.setAttribute('aria-pressed', String(btn.dataset.themeSet === theme));
  });
}

$('#theme-switch').addEventListener('click', e => {
  const btn = e.target.closest('[data-theme-set]');
  if (!btn) return;
  const theme = btn.dataset.themeSet;
  prefs.set('theme', theme);
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  renderChrome();
});

async function route() {
  cleanup();
  cleanup = () => {};
  buildFormatters();
  renderChrome();
  // Il link di gestione (#/e/ID/admin/CHIAVE) salva la chiave su questo dispositivo
  // e poi viene sostituito dal link normale, così non si condivide per sbaglio.
  const m = location.hash.match(/^#\/e\/([A-Za-z0-9]+)(?:\/admin\/([A-Za-z0-9]+))?/);
  if (m?.[2]) {
    adminKeys.set(m[1], m[2]);
    history.replaceState(null, '', `#/e/${m[1]}`);
  }
  document.title = 'Whenly';
  $('#topbar-actions').innerHTML = '';
  try {
    if (m) await renderEvent(m[1]);
    else if (location.hash.startsWith('#/privacy')) renderPrivacy();
    else renderCreate();
  } catch (err) {
    console.error(err);
    noteConnection(err);
    const title = isConnectionError(err) ? t('connectionTitle') : t('errorTitle');
    const text = isConnectionError(err) ? (navigator.onLine === false ? t('offline') : t('serviceDown')) : esc(err.message ?? err);
    app.innerHTML = `<div class="card"><h2>${title}</h2><p class="muted">${text}</p><a class="btn" href="#/">${t('backHome')}</a></div>`;
  }
}

function renderPrivacy() {
  document.title = `${t('privacy')} · Whenly`;
  app.innerHTML = `<article class="card prose">${privacyHTML(lang)}<p><a class="btn" href="#/">${t('backHome')}</a></p></article>`;
}

$('#lang').addEventListener('change', e => {
  setLang(e.target.value);
  route();
});
addEventListener('hashchange', () => { scrollTo(0, 0); route(); });
route();

// --- Crea evento --------------------------------------------------------------
function renderCreate() {
  const selected = new Set();
  const today = new Date();
  const todayIso = isoDate(today);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  let weekOffset = 0;
  const WEEKS = 5;

  const hourOptions = (sel, from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
    .map(h => `<option value="${h * 60}"${h === sel ? ' selected' : ''}>${pad(h)}:00</option>`).join('');

  app.innerHTML = `
    <div class="create-page">
    <section class="hero">
      <h1>${t('heroTitle')}</h1>
      <p>${t('heroText')}</p>
    </section>
    <div class="create-layout">
      <form class="card stack create-form" id="create" novalidate>
        <label class="field f-title">
          <span>${t('eventName')}</span>
          <input type="text" name="title" placeholder="${esc(t('eventNamePh'))}" maxlength="120" autocomplete="off">
        </label>
        <div class="field f-cal">
          <div class="row-between">
            <span class="label">${t('days')}</span>
            <div class="cal-nav">
              <button type="button" class="btn" data-nav="-1" aria-label="${esc(t('prevWeeks'))}">${CHEVRON_LEFT}</button>
              <span id="cal-range"></span>
              <button type="button" class="btn" data-nav="1" aria-label="${esc(t('nextWeeks'))}">${CHEVRON_RIGHT}</button>
            </div>
          </div>
          <p class="hint" id="cal-hint"><span class="hint-mouse">${t('daysHint')}</span><span class="hint-touch">${t('daysHintTouch')}</span> <span class="sr-only">${t('keyboardHint')}</span></p>
          <div class="cal" id="cal" role="group" aria-label="${esc(t('days'))}" aria-describedby="cal-hint"></div>
          <p class="hint" id="cal-count" aria-live="polite"></p>
          <p class="hint">${t('autoDelete')}</p>
        </div>
        <div class="field-row f-times">
          <label class="field"><span>${t('from')}</span><select name="start">${hourOptions(9, 0, 23)}</select></label>
          <label class="field"><span>${t('to')}</span><select name="end">${hourOptions(18, 1, 24)}</select></label>
          <label class="field"><span>${t('interval')}</span>
            <select name="slot">
              ${[10, 15, 20, 30, 45, 60, 90, 120].map(m => `<option value="${m}"${m === 30 ? ' selected' : ''}>${fmtDuration(m)}</option>`).join('')}
            </select>
          </label>
        </div>
        <label class="field f-tz">
          <span>${t('timezone')}</span>
          <select name="tz">${timeZoneOptions(deviceTz)}</select>
        </label>
        <details class="f-extra">
          <summary>${t('moreDetails')}</summary>
          <div class="extra-fields">
            <label class="field">
              <span>${t('description')}</span>
              <textarea name="description" rows="3" maxlength="500" placeholder="${esc(t('descriptionPh'))}"></textarea>
            </label>
            <div class="field">
              <span class="label">${t('contacts')}</span>
              <p class="hint">${t('contactsHint')}</p>
              <div class="contact-fields">
                <input type="email" name="email" placeholder="${esc(t('email'))}" autocomplete="email" maxlength="120">
                <input type="tel" name="phone" placeholder="${esc(t('phonePh'))}" autocomplete="tel" maxlength="30">
                <input type="text" name="url" placeholder="${esc(t('linkPh'))}" autocomplete="url" maxlength="200">
              </div>
            </div>
          </div>
        </details>
        <div class="f-submit">
          <button class="btn primary" type="submit">${t('create')}</button>
          <div class="errors" id="err" role="alert"></div>
        </div>
      </form>
    </div>
    </div>`;

  const cal = $('#cal');
  const form = $('#create');
  // 1–7 gennaio 2024 = lunedì–domenica, per avere le iniziali dei giorni nella lingua corrente.
  const dow = Array.from({ length: 7 }, (_, i) => F.narrow.format(new Date(2024, 0, 1 + i)));

  function drawCal() {
    const start = new Date(monday);
    start.setDate(monday.getDate() + weekOffset * 7);
    let html = dow.map(d => `<div class="cal-dow">${d}</div>`).join('');
    for (let r = 0; r < WEEKS; r++) {
      for (let c = 0; c < 7; c++) {
        const d = new Date(start);
        d.setDate(start.getDate() + r * 7 + c);
        const k = isoDate(d);
        const past = k < todayIso;
        const showMonth = d.getDate() === 1 || (r === 0 && c === 0);
        // Mesi alterni con sfondo diverso, per vedere subito dove cambia il mese.
        const cls = ['cal-day'];
        if (d.getMonth() % 2) cls.push('m-alt');
        if (d.getDate() === 1) cls.push('month-start');
        if (selected.has(k)) cls.push('on');
        if (k === todayIso) cls.push('today');
        html += `<div class="${cls.join(' ')}" role="checkbox" tabindex="-1"
          aria-checked="${selected.has(k)}" aria-label="${esc(cap(F.long.format(d)))}"${past ? ' aria-disabled="true"' : ''}
          data-k="${k}" data-c="${c}" data-r="${r}"${past ? ' data-off' : ''}>
          ${showMonth ? `<small aria-hidden="true">${F.month.format(d)}</small>` : ''}${d.getDate()}</div>`;
      }
    }
    cal.innerHTML = html;
    initRoving(cal, todayIso);
    const end = new Date(start);
    end.setDate(start.getDate() + WEEKS * 7 - 1);
    $('#cal-range').textContent = fmtSpan(start, end);
    $('[data-nav="-1"]').disabled = weekOffset <= 0;
    updateCount();
  }
  function updateCount() {
    $('#cal-count').textContent = t('daysSelected', selected.size);
  }

  function setSelected(next) {
    selected.clear();
    next.forEach(k => selected.add(k));
    cal.querySelectorAll('[data-k]').forEach(el => {
      el.classList.toggle('on', selected.has(el.dataset.k));
      el.setAttribute('aria-checked', String(selected.has(el.dataset.k)));
    });
    updateCount();
    if (selected.size) clearInvalid(cal);
  }
  rectSelect(cal, { getSet: () => selected, setSet: setSelected });
  keyboardCells(cal, {
    onToggle: cell => {
      const next = new Set(selected);
      next.has(cell.dataset.k) ? next.delete(cell.dataset.k) : next.add(cell.dataset.k);
      setSelected(next);
    },
  });
  form.addEventListener('input', e => clearInvalid(e.target));
  form.addEventListener('change', e => clearInvalid(e.target));
  form.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => {
    weekOffset = Math.max(0, weekOffset + +btn.dataset.nav * 4);
    drawCal();
  }));
  drawCal();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#err');
    const title = form.title.value.trim();
    const start = +form.start.value, end = +form.end.value;
    const description = form.description.value.trim();
    const contact = {};
    const email = form.email.value.trim(), phone = form.phone.value.trim(), url = normalizeUrl(form.url.value);

    // Controlla tutto insieme: ogni campo da sistemare riceve l'asterisco rosso,
    // il messaggio descrive il primo.
    const problems = [];
    if (!title) problems.push([form.title, t('errTitle')]);
    if (!selected.size) problems.push([cal, t('errDays')]);
    if (end <= start) problems.push([form.end, t('errTime')]);
    else if (end - start < +form.slot.value) problems.push([form.slot, t('errInterval')]);
    if (email && !EMAIL_RE.test(email)) problems.push([form.email, t('errEmail')]);
    if (phone && phoneDigits(phone).replace('+', '').length < 6) problems.push([form.phone, t('errPhone')]);
    if (url === null) problems.push([form.url, t('errUrl')]);
    resetInvalid(form);
    if (problems.length) {
      problems.forEach(([el, message]) => markInvalid(el, message));
      if (problems.some(([el]) => el.closest('.f-extra'))) form.querySelector('.f-extra').open = true;
      renderErrors(form);
      if (problems[0][0] !== cal) problems[0][0].focus({ preventScroll: true });
      err.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (email) contact.email = email;
    if (phone) contact.phone = phone;
    if (url) contact.url = url;
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.textContent = t('creating');
    try {
      const { id, adminKey } = await store.createEvent({
        title,
        dates: [...selected].sort(),
        start_minute: start,
        end_minute: end,
        slot_minutes: +form.slot.value,
        timezone: form.tz.value,
        // Inviati solo se compilati, così il sito funziona anche su database senza queste colonne.
        ...(description && { description }),
        ...(Object.keys(contact).length && { contact }),
      });
      if (adminKey) {
        adminKeys.set(id, adminKey);
        try { sessionStorage.setItem(`quando:created:${id}`, '1'); } catch {}
      }
      location.hash = `#/e/${id}`;
    } catch (ex) {
      noteConnection(ex);
      showErrors(err, [isConnectionError(ex) ? t('serviceDown') : `${t('errCreate')} ${ex.message ?? ex}`]);
      btn.disabled = false;
      btn.textContent = t('create');
    }
  });
}

// --- Griglia nel fuso di chi guarda -------------------------------------------
// Le risposte sono salvate con chiavi nel fuso dell'evento ("2026-10-09T10:00").
// Qui ogni slot viene riposizionato nel fuso scelto da chi guarda.
function buildLayout(ev, viewTz) {
  const slots = [];
  for (const d of ev.dates) {
    // Solo slot interi dentro la fascia oraria (es. 2 h tra 9 e 18 → l'ultimo finisce alle 17).
    for (let m = ev.start_minute; m + ev.slot_minutes <= ev.end_minute; m += ev.slot_minutes) {
      const key = slotKey(d, m);
      const pos = viewTz === ev.timezone ? { date: d, min: m } : utcToZoned(zonedToUtc(d, m, ev.timezone), viewTz);
      slots.push({ key, ...pos });
    }
  }
  const dates = [...new Set(slots.map(s => s.date))].sort();
  const times = [...new Set(slots.map(s => s.min))].sort((a, b) => a - b);
  const byPos = new Map(slots.map(s => [`${s.date}|${s.min}`, s.key]));
  const byKey = new Map(slots.map(s => [s.key, s]));
  return {
    dates, times,
    keys: slots.map(s => s.key),
    at: (d, m) => byPos.get(`${d}|${m}`) ?? null,
    pos: key => byKey.get(key),
  };
}

// --- Pagina evento ------------------------------------------------------------
async function renderEvent(id) {
  app.innerHTML = `<p class="muted">${t('loading')}</p>`;
  let ev = await store.getEvent(id);
  if (netState === 'down') setNet('ok');
  if (!ev) {
    app.innerHTML = `<div class="card"><h2>${t('notFound')}</h2><p class="muted">${t('notFoundText')}</p><a class="btn" href="#/">${t('createNew')}</a></div>`;
    return;
  }

  const viewTz = prefs.get('tz', deviceTz);
  const L = buildLayout(ev, viewTz);
  const { dates, times } = L;
  const slot = ev.slot_minutes;

  document.title = `${ev.title} · Whenly`;
  let responses = await store.listResponses(id);

  // Organizzatore: la chiave salvata su questo dispositivo viene verificata dal database.
  const adminKey = adminKeys.get(id);
  let isAdmin = false;
  if (adminKey) {
    try {
      isAdmin = await store.checkAdmin(id, adminKey);
      if (!isAdmin) adminKeys.set(id, '');
    } catch (err) { noteConnection(err); }
  }
  let justCreated = false;
  try {
    justCreated = sessionStorage.getItem(`quando:created:${id}`) === '1';
    sessionStorage.removeItem(`quando:created:${id}`);
  } catch {}

  // Il link smette di funzionare il giorno dopo l'ultima data (pulizia automatica).
  const expiry = parseDate(ev.dates.at(-1));
  expiry.setDate(expiry.getDate() + 1);
  let { name: me, password: myPassword } = session.get(id);
  let mySlots = new Set(responses.find(r => r.name === me)?.slots ?? []);
  const excluded = new Set();
  // Durate minime proposte: multipli dell'intervallo che entrano nella fascia oraria.
  const durOptions = [...new Set([1, 2, 3, 4, 6, 8].map(k => k * slot))]
    .filter(d => d <= ev.end_minute - ev.start_minute);
  // 0 = tutte le durate: mostra subito i momenti con più persone, anche se brevi.
  let minDuration = 0;

  app.innerHTML = `
    <div class="event-page">
    <div class="event-top">
    <header class="event-head">
      <div class="head-main">
        <h1>${esc(ev.title)}</h1>
        ${ev.description ? `<p class="event-desc">${esc(ev.description)}</p>` : ''}
        ${contactLinks(ev.contact)}
        <p class="meta">${esc(fmtDateRange(dates))} · ${hhmm(times[0])}–${hhmm(times.at(-1) + slot)}
          · <span class="expiry" title="${esc(t('autoDelete'))}">${esc(t('expiresOn', F.dayLongMonth.format(expiry)))}</span></p>
      </div>
      <div class="head-side">
        <label class="tz-pick"${viewTz !== ev.timezone ? ` title="${esc(t('createdIn', tzName(ev.timezone)))}"` : ''}>
          <span>${t('showTimesIn')}</span>
          <select id="view-tz">${timeZoneOptions(viewTz)}</select>
        </label>
      </div>
      <div class="head-extras" id="head-extras" hidden></div>
    </header>
    <div class="event-cols">
      <section class="card" id="mine"></section>
      <section class="card" id="group">
        <div class="group-sticky" id="group-sticky">
        <div class="row-between">
          <div class="title-group"><h2>${t('groupTitle')}</h2><span class="week-of" id="week-of"></span></div>
          <div class="responders" id="responders">
            <button type="button" class="responders-btn" id="group-count" aria-haspopup="true" aria-expanded="false" aria-controls="people-pop"></button>
            <div class="responders-pop" id="people-pop">
              <p class="responders-title">${t('respondedTitle')}</p>
              <p class="hint">${t('toggleTitle')}</p>
              <ul id="people"></ul>
            </div>
          </div>
        </div>
        <div class="legend" id="legend"></div>
        <div class="day-pager" data-pager></div>
        </div>
        <div class="grid-wrap">
          <div class="grid readonly" id="group-grid" role="group" aria-label="${esc(t('groupTitle'))}"></div>
          <div class="lock-overlay" id="lock-overlay" hidden>
            <button type="button" class="lock-pill" id="lock-pill" aria-label="${esc(t('loginToSeeShort'))}">
              <span class="lock-icon" aria-hidden="true">${ICONS.lock}</span>
              <span class="lock-msg">
                <span class="lock-arrow lock-arrow-left" aria-hidden="true">${ICONS.arrowLeft}</span>
                <span class="lock-arrow lock-arrow-up" aria-hidden="true">${ICONS.arrowUp}</span>
                <span>${t('loginToSeeShort')}</span>
              </span>
            </button>
          </div>
        </div>
        <div class="hover-info" id="hover-info" aria-live="polite"></div>
      </section>
    </div>
    </div>
    <section class="card best" id="best">
      <div class="row-between">
        <h2>${t('bestTitle')}</h2>
        <label class="cal-nav">${t('minDuration')}
          <select id="min-dur" style="width:auto"><option value="0" selected>${t('allDurations')}</option>${durOptions.map(d => `<option value="${d}"${d === minDuration ? ' selected' : ''}>${fmtDuration(d)}</option>`).join('')}</select>
        </label>
      </div>
      <ol id="best-list"></ol>
    </section>
    <button type="button" class="scroll-hint" id="scroll-hint" hidden>${ICONS.arrowDown}${t('bestTitle')}</button>
    </div>`;

  $('#view-tz').addEventListener('change', e => {
    prefs.set('tz', e.target.value);
    route();
  });

  // Le griglie si sfogliano per settimane (lunedì–domenica) tra i giorni dell'evento.
  const weekStart = d => {
    const dt = parseDate(d);
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    return isoDate(dt);
  };
  const weeks = [];
  for (const d of dates) {
    const key = weekStart(d);
    if (!weeks.length || weeks.at(-1).key !== key) weeks.push({ key, dates: [] });
    weeks.at(-1).dates.push(d);
  }
  let weekIndex = 0;
  const visibleDates = () => weeks[weekIndex].dates;
  // Minimo di sicurezza (~12 px per ora): sugli schermi normali tutte le ore stanno nel riquadro.
  const rowMin = Math.max(3, Math.round(12 * slot / 60));
  const gridCols = () => `grid-template-columns: var(--gutter) repeat(${visibleDates().length}, minmax(0, 1fr)); --rows: ${times.length}; --row-min: ${rowMin}px`;

  function renderPagers() {
    const shown = visibleDates();
    const many = weeks.length > 1;
    const html = many
      ? `<button type="button" class="btn" data-page="-1" aria-label="${esc(t('prevDays'))}"${weekIndex === 0 ? ' disabled' : ''}>${CHEVRON_LEFT}<span class="pager-text">${t('prevShort')}</span></button>
         <span class="pager-label">${fmtSpan(parseDate(shown[0]), parseDate(shown.at(-1)))}</span>
         <button type="button" class="btn" data-page="1" aria-label="${esc(t('nextDays'))}"${weekIndex === weeks.length - 1 ? ' disabled' : ''}><span class="pager-text">${t('nextShort')}</span>${CHEVRON_RIGHT}</button>`
      : '';
    app.querySelectorAll('[data-pager]').forEach(el => { el.innerHTML = html; el.hidden = !html; });
    $('#week-of').textContent = many ? t('weekOf', weekIndex + 1, weeks.length) : '';
    updateStickyOffset();
  }

  // Su telefono la testata del gruppo resta fissa in alto: la riga dei giorni
  // si ferma subito sotto, quindi serve sapere quanto è alta.
  function updateStickyOffset() {
    const head = $('#group-sticky');
    if (head) $('#group').style.setProperty('--sticky-h', `${head.offsetHeight}px`);
  }

  function redrawGrids() {
    if (me) renderMine();
    drawGroupGrid();
    renderGroup();
    renderPagers();
    thinAllLabels();
  }
  function onPage(e) {
    const step = e.target.closest('[data-page]');
    const go = e.target.closest('[data-goto-week]');
    if (step) weekIndex = Math.max(0, Math.min(weeks.length - 1, weekIndex + +step.dataset.page));
    else if (go) weekIndex = +go.dataset.gotoWeek;
    else return;
    redrawGrids();
  }
  app.addEventListener('click', onPage);
  function onResize() { thinAllLabels(); updateStickyOffset(); }
  addEventListener('resize', onResize);

  // kind: 'mine' (caselle selezionabili) oppure 'group' (sola lettura con dettaglio).
  function gridHTML(kind) {
    const dates = visibleDates();
    let labelIndex = 0;
    let h = `<div class="g-corner"></div>`;
    dates.forEach(d => {
      const dt = parseDate(d);
      h += `<div class="g-head"><span>${F.weekday.format(dt)}</span><b class="g-day-full">${F.dayMonth.format(dt)}</b><b class="g-day-short">${dt.getDate()}</b></div>`;
    });
    times.forEach((m, r) => {
      // Stacco visivo quando le righe non sono consecutive (es. dopo mezzanotte in un altro fuso).
      const afterGap = r > 0 && m - times[r - 1] !== slot;
      const beforeGap = r < times.length - 1 && times[r + 1] - m !== slot;
      // Con intervalli che non dividono l'ora (45 min, 1 h 30, 2 h) ogni riga ha la sua etichetta.
      const onHour = afterGap || 60 % slot !== 0 || (m - times[0]) % 60 === 0;
      const gap = afterGap ? ' gap' : '';
      h += `<div class="g-time${gap}"${onHour ? ` data-i="${labelIndex++}"` : ''}>${onHour ? hhmm(m) : ''}</div>`;
      dates.forEach((d, c) => {
        const key = L.at(d, m);
        if (!key) { h += `<div class="g-empty${gap}"></div>`; return; }
        const cls = ['g-cell'];
        if (afterGap) cls.push('gap');
        if (onHour) cls.push('hour');
        if (r === 0 || afterGap || !L.at(d, times[r - 1])) cls.push('first');
        if (r === times.length - 1 || beforeGap || !L.at(d, times[r + 1])) cls.push('last');
        const label = esc(`${cap(F.long.format(parseDate(d)))}, ${hhmm(m)}–${hhmm(m + slot)}`);
        const aria = kind === 'mine' ? `role="checkbox" aria-checked="false"` : `role="button"`;
        h += `<div class="${cls.join(' ')}" data-k="${key}" data-c="${c}" data-r="${r}" tabindex="-1" ${aria} aria-label="${label}" data-label="${label}"></div>`;
      });
    });
    return h;
  }

  // Le risposte di tutti, con le mie sostituite dallo stato locale (più aggiornato).
  function people() {
    const map = new Map(responses.map(r => [r.name, new Set(r.slots)]));
    if (me && (mySlots.size || map.has(me))) map.set(me, mySlots);
    return [...map.entries()]
      .map(([name, slots]) => ({ name, slots }))
      .sort((a, b) => a.name.localeCompare(b.name, lang));
  }

  // --- La mia disponibilità
  const mine = $('#mine');
  let saveTimer = null;

  function renderMine() {
    if (!me) {
      mine.innerHTML = `
        <h2>${t('yourAvailability')}</h2>
        <p class="hint">${t('joinHint')}</p>
        <form class="join-form" id="join">
          <label class="field"><span>${t('name')}</span>
            <input type="text" name="name" maxlength="40" autocomplete="username" required>
          </label>
          <label class="field"><span>${t('password')} <span class="muted">${t('optional')}</span></span>
            <input type="password" name="password" maxlength="72" autocomplete="current-password">
          </label>
          <button class="btn primary" disabled>${t('continue')}</button>
        </form>
        <p class="hint">${t('passwordHint')}</p>
        <div class="errors" id="join-err" role="alert"></div>`;
      // "Continua" si attiva solo quando c'è un nome.
      $('#join').addEventListener('input', e => {
        clearInvalid(e.target);
        const form = e.currentTarget;
        form.querySelector('button').disabled = !form.name.value.trim();
      });
      $('#join').addEventListener('submit', async e => {
        e.preventDefault();
        const form = e.target;
        const name = form.name.value.trim();
        const password = form.password.value;
        resetInvalid(form);
        if (!name) { markInvalid(form.name, t('errName')); renderErrors(form); form.name.focus(); return; }
        const btn = form.querySelector('button');
        btn.disabled = true;
        try {
          if (!(await store.checkPassword(id, name, password))) {
            markInvalid(form.password, password ? t('errWrongPw') : t('errProtected'));
            renderErrors(form);
            form.password.focus();
            return;
          }
          me = name;
          myPassword = password;
          session.set(id, { name, password });
          mySlots = new Set(responses.find(r => r.name === me)?.slots ?? []);
          renderMine();
          renderGroup();
        } catch (ex) {
          showErrors($('#join-err'), [`${t('error')} ${ex.message ?? ex}`]);
        } finally {
          btn.disabled = !form.name.value.trim();
        }
      });
      return;
    }
    mine.innerHTML = `
      <div class="row-between">
        <h2>${t('yourAvailability')}</h2>
        <span class="muted">${myPassword ? `<span title="${esc(t('protected'))}">🔒</span> ` : ''}${esc(me)} · <button class="link-btn" id="change-name">${t('logout')}</button></span>
      </div>
      <p class="hint" id="paint-hint"><span class="hint-mouse">${t('paintHint')}</span><span class="hint-touch">${t('paintHintTouch')}</span> <span class="sr-only">${t('keyboardHint')}</span></p>
      <div class="day-pager" data-pager></div>
      <div class="grid-wrap"><div class="grid paint" id="my-grid" role="group" aria-label="${esc(t('yourAvailability'))}" aria-describedby="paint-hint" style="${gridCols()}">${gridHTML('mine')}</div></div>
      <p class="status" id="save-status" role="status"></p>`;
    const grid = $('#my-grid');
    const paint = () => grid.querySelectorAll('[data-k]').forEach(el => {
      el.classList.toggle('on', mySlots.has(el.dataset.k));
      el.setAttribute('aria-checked', String(mySlots.has(el.dataset.k)));
    });
    paint();
    initRoving(grid);
    thinLabels(grid);
    rectSelect(grid, {
      getSet: () => mySlots,
      setSet: next => { mySlots = next; paint(); renderGroup(); },
      onEnd: scheduleSave,
    });
    keyboardCells(grid, {
      onToggle: cell => {
        const next = new Set(mySlots);
        next.has(cell.dataset.k) ? next.delete(cell.dataset.k) : next.add(cell.dataset.k);
        mySlots = next;
        paint();
        renderGroup();
        scheduleSave();
      },
    });
    $('#change-name').addEventListener('click', () => {
      me = '';
      myPassword = '';
      session.set(id, null);
      renderMine();
      renderGroup();
    });
  }

  let pendingSave = false;
  const onReconnected = () => { if (pendingSave && me) scheduleSave(); };
  addEventListener('whenly:reconnected', onReconnected);

  function scheduleSave() {
    const status = $('#save-status');
    if (!status) return;
    status.classList.remove('error');
    status.textContent = t('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const name = me, slots = [...mySlots].sort();
      try {
        await store.saveResponse(id, name, myPassword, slots);
        const existing = responses.find(r => r.name === name);
        if (existing) existing.slots = slots;
        else responses.push({ name, slots });
        pendingSave = false;
        if (netState === 'down') setNet('ok');
        if ($('#save-status')) $('#save-status').textContent = t('saved');
      } catch (ex) {
        noteConnection(ex);
        pendingSave = isConnectionError(ex);
        const el = $('#save-status');
        if (el) {
          el.classList.add('error');
          el.textContent = pendingSave ? t('saveRetry') : `${t('saveError')} ${ex.message ?? ex}`;
        }
      }
    }, 500);
  }

  // --- Vista di gruppo
  // Con poco spazio verticale (es. 24 ore) mostra un'etichetta ogni 2, 3 o 4 ore,
  // così gli orari non si sovrappongono; le linee delle ore restano tutte.
  function thinLabels(grid) {
    const cell = grid?.querySelector('.g-cell');
    if (!cell) return;
    const labelled = [...grid.querySelectorAll('.g-time[data-i]')];
    const rowsPerLabel = 60 % slot === 0 ? 60 / slot : 1;
    const gapPx = cell.getBoundingClientRect().height * rowsPerLabel;
    const step = gapPx > 0 ? Math.max(1, Math.ceil(20 / gapPx)) : 1;
    labelled.forEach(el => el.classList.toggle('thin', +el.dataset.i % step !== 0));
  }
  function thinAllLabels() {
    thinLabels($('#my-grid'));
    thinLabels($('#group-grid'));
  }

  const groupGrid = $('#group-grid');
  function drawGroupGrid() {
    groupGrid.setAttribute('style', gridCols());
    groupGrid.innerHTML = gridHTML('group');
    initRoving(groupGrid);
    thinLabels(groupGrid);
  }
  const hoverInfo = $('#hover-info');
  let hoverKey = null;

  function availability() {
    const all = people();
    const included = all.filter(p => !excluded.has(p.name));
    const byKey = new Map(L.keys.map(k => [k, included.filter(p => p.slots.has(k)).map(p => p.name)]));
    return { all, included, byKey };
  }

  function renderGroup() {
    const { all, included, byKey } = availability();
    const total = included.length;
    // Prima di entrare con il proprio nome, la vista di gruppo resta disabilitata.
    // La heatmap resta visibile (sbiadita); dettagli, nomi e filtri restano bloccati.
    $('#group').classList.toggle('locked', !me);
    $('#lock-overlay').hidden = !!me;
    [groupGrid, $('#responders'), $('#legend'), ...$('#group').querySelectorAll('[data-pager]')]
      .forEach(el => el.toggleAttribute('inert', !me));

    // "N risposte" apre l'elenco di chi ha risposto (al passaggio del mouse o al tocco).
    const countBtn = $('#group-count');
    countBtn.innerHTML = `${ICONS.people}<span>${t('responses', all.length)}</span>${all.length ? ICONS.chevronDown : ''}`;
    countBtn.disabled = !all.length;
    if (!all.length) $('#responders').classList.remove('open');
    $('#people').innerHTML = all
      .map(p => {
        const on = !excluded.has(p.name);
        return `<li><button type="button" class="person${on ? '' : ' off'}" data-name="${esc(p.name)}" aria-pressed="${on}">
          <span class="person-check" aria-hidden="true">${on ? ICONS.check : ''}</span>
          <span>${esc(p.name)}${p.name === me ? ` <span class="muted">${t('you')}</span>` : ''}</span></button></li>`;
      })
      .join('');
    $('#legend').innerHTML = total
      ? `<span>0/${total}</span><span class="legend-bar">${Array.from({ length: Math.min(total, 8) + 1 }, (_, i) => `<i style="background:${heat(i / Math.min(total, 8))}"></i>`).join('')}</span><span>${total}/${total} ${t('legendAvailable')}</span>`
      : '';

    groupGrid.querySelectorAll('[data-k]').forEach(el => {
      const n = byKey.get(el.dataset.k).length;
      el.style.background = total ? heat(n / total) : '';
      el.setAttribute('aria-label', total ? `${el.dataset.label}: ${n}/${total} ${t('legendAvailable')}` : el.dataset.label);
    });
    showHover(hoverKey, byKey, included);
    renderBest(byKey, included);
    updateStickyOffset();
  }

  function heat(ratio) {
    if (ratio <= 0) return 'var(--cell)';
    return `color-mix(in srgb, var(--heat) ${Math.round(15 + ratio * 85)}%, var(--cell))`;
  }

  function showHover(key, byKey, included) {
    groupGrid.querySelectorAll('.hover').forEach(el => el.classList.remove('hover'));
    if (!me) { hoverInfo.innerHTML = ''; return; }
    if (!key || !included.length) { hoverInfo.innerHTML = `<span class="hi-line">${included.length ? t('hoverDefault') : t('noResponses')}</span>`; return; }
    groupGrid.querySelector(`[data-k="${key}"]`)?.classList.add('hover');
    const { date, min } = L.pos(key);
    const yes = byKey.get(key);
    const no = included.map(p => p.name).filter(n => !yes.includes(n));
    // Sempre tre righe di altezza fissa: la griglia non si sposta al passaggio del mouse.
    const yesText = yes.length ? `${t('available')}: ${yes.join(', ')}` : t('nobody');
    const noText = no.length ? `${t('unavailable')}: ${no.join(', ')}` : '';
    hoverInfo.innerHTML = `
      <span class="hi-line"><b>${esc(cap(F.long.format(parseDate(date))))}, ${hhmm(min)}–${hhmm(min + slot)}</b> · ${yes.length}/${included.length}</span>
      <span class="hi-line" title="${esc(yesText)}">${yes.length ? `${t('available')}: <b>${yes.map(esc).join(', ')}</b>` : t('nobody')}</span>
      <span class="hi-line" title="${esc(noText)}">${esc(noText)}</span>`;
  }

  const onHover = e => {
    const el = e.target.closest('[data-k]');
    if (!el) return;
    hoverKey = el.dataset.k;
    const { byKey, included } = availability();
    showHover(hoverKey, byKey, included);
  };
  groupGrid.addEventListener('pointerover', onHover);
  groupGrid.addEventListener('pointerdown', onHover);
  keyboardCells(groupGrid, { onFocus: cell => onHover({ target: cell }) });

  // Al tocco (telefono) il pulsante apre/chiude l'elenco; un tocco altrove lo chiude.
  const responders = $('#responders');
  // L'elenco si apre verso il lato in cui c'è spazio (a destra o a sinistra del pulsante).
  const placePop = () => requestAnimationFrame(() => {
    const pop = $('#people-pop');
    pop.style.left = ''; pop.style.right = '';
    const r = pop.getBoundingClientRect();
    if (r.left < 8) { pop.style.left = '0'; pop.style.right = 'auto'; }
  });
  responders.addEventListener('pointerenter', placePop);
  responders.addEventListener('focusin', placePop);
  $('#group-count').addEventListener('click', () => {
    const open = responders.classList.toggle('open');
    $('#group-count').setAttribute('aria-expanded', String(open));
    placePop();
  });
  const closeResponders = e => {
    if (!responders.contains(e.target)) {
      responders.classList.remove('open');
      $('#group-count').setAttribute('aria-expanded', 'false');
    }
  };
  document.addEventListener('pointerdown', closeResponders);

  // La pillola sopra la griglia bloccata porta al campo "Nome".
  // Icona del lucchetto: il messaggio si apre al passaggio del mouse; sui touch
  // il primo tocco lo apre, il secondo porta al campo "Nome".
  const lockPill = $('#lock-pill');
  lockPill.addEventListener('click', () => {
    if (matchMedia('(hover: none)').matches && !lockPill.classList.contains('open')) {
      lockPill.classList.add('open');
      return;
    }
    lockPill.classList.remove('open');
    const name = $('#join')?.name;
    if (!name) return;
    name.scrollIntoView({ behavior: 'smooth', block: 'center' });
    name.focus({ preventScroll: true });
  });

  $('#people').addEventListener('click', e => {
    const chip = e.target.closest('[data-name]');
    if (!chip) return;
    const name = chip.dataset.name;
    excluded.has(name) ? excluded.delete(name) : excluded.add(name);
    renderGroup();
  });

  // Sequenze di slot consecutivi per ogni giorno, nel fuso di chi guarda.
  function runsOfDay(d) {
    const runs = [];
    let run = [];
    times.forEach((m, r) => {
      const key = L.at(d, m);
      const contiguous = run.length && m - run.at(-1).min === slot;
      if (!key || (run.length && !contiguous)) { if (run.length) runs.push(run); run = []; }
      if (key) run.push({ key, min: m });
    });
    if (run.length) runs.push(run);
    return runs;
  }

  // --- Orari migliori: blocchi consecutivi in cui lo stesso gruppo è libero.
  function renderBest(byKey, included) {
    const list = $('#best-list');
    if (!included.length) {
      list.innerHTML = `<p class="empty">${t('bestEmpty')}</p>`;
      return;
    }
    const minSlots = Math.max(1, Math.ceil(minDuration / slot));
    const blocks = [];
    for (const d of dates) {
      for (const run of runsOfDay(d)) {
        const sets = run.map(s => new Set(byKey.get(s.key)));
        for (let i = 0; i + minSlots <= run.length; i++) {
          let group = new Set(sets[i]);
          for (let j = i + 1; j < i + minSlots; j++) group = new Set([...group].filter(n => sets[j].has(n)));
          if (!group.size) continue;
          // Scarta i blocchi che iniziano dentro un blocco precedente con lo stesso gruppo.
          if (i > 0 && [...group].every(n => sets[i - 1].has(n))) continue;
          let end = i + minSlots;
          while (end < run.length && [...group].every(n => sets[end].has(n))) end++;
          blocks.push({ date: d, slots: run.slice(i, end), group });
        }
      }
    }
    blocks.sort((a, b) => b.group.size - a.group.size || b.slots.length - a.slots.length
      || a.date.localeCompare(b.date) || a.slots[0].min - b.slots[0].min);
    const top = blocks.slice(0, 6);
    if (!top.length) {
      list.innerHTML = `<p class="empty">${minDuration ? t('bestNone', fmtDuration(minDuration)) : t('noAvailShort')}</p>`;
      return;
    }
    list.innerHTML = top.map((b, i) => {
      const start = b.slots[0].min, end = b.slots.at(-1).min + slot;
      const missing = included.map(p => p.name).filter(n => !b.group.has(n));
      const full = !missing.length;
      return `<li data-block="${i}">
        <span class="rank">${i + 1}</span>
        <div class="when">
          <b>${esc(cap(F.long.format(parseDate(b.date))))} · ${hhmm(start)}–${hhmm(end)}</b>
          <span>${fmtDuration(end - start)} · ${full ? t('everyone') : esc(t('missing', missing.join(', ')))}</span>
        </div>
        <span class="score${full ? ' full' : ''}">${b.group.size}/${included.length}</span>
        ${isAdmin ? `<button type="button" class="btn small" data-confirm="${i}">${t('confirm')}</button>` : ''}
      </li>`;
    }).join('');

    list.querySelectorAll('[data-confirm]').forEach(btn => btn.addEventListener('click', () => {
      openConfirmEditor(btn.closest('li'), top[+btn.dataset.confirm]);
    }));

    list.querySelectorAll('[data-block]').forEach(li => {
      const keys = top[+li.dataset.block].slots.map(s => s.key);
      li.addEventListener('pointerenter', () => keys.forEach((k, idx) => {
        const el = groupGrid.querySelector(`[data-k="${k}"]`);
        el?.classList.add('hl');
        if (idx === 0) el?.classList.add('hl-top');
        if (idx === keys.length - 1) el?.classList.add('hl-bottom');
      }));
      li.addEventListener('pointerleave', () => groupGrid.querySelectorAll('.hl').forEach(el => el.classList.remove('hl', 'hl-top', 'hl-bottom')));
    });
  }

  // Conferma con orario preciso: dentro la fascia libera l'organizzatore sceglie
  // l'ora di inizio e la durata della call.
  function openConfirmEditor(li, b) {
    const list = $('#best-list');
    list.querySelectorAll('.confirm-editor').forEach(el => el.remove());
    list.querySelectorAll('li.editing').forEach(el => el.classList.remove('editing'));
    li.classList.add('editing');

    const [date, time] = b.slots[0].key.split('T');
    const [hh, mm] = time.split(':').map(Number);
    const blockStart = hh * 60 + mm;            // minuti nel fuso dell'evento
    const blockLen = b.slots.length * slot;
    const step = slot % 15 === 0 ? 15 : slot;
    const fTime = new Intl.DateTimeFormat(lang, { timeZone: viewTz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const at = offset => zonedToUtc(date, blockStart + offset, ev.timezone);

    const starts = [];
    for (let o = 0; o + step <= blockLen; o += step) starts.push(o);
    const editor = document.createElement('div');
    editor.className = 'confirm-editor';
    editor.innerHTML = `
      <label class="field"><span>${t('startAt')}</span>
        <select name="start">${starts.map(o => `<option value="${o}">${fTime.format(at(o))}</option>`).join('')}</select>
      </label>
      <label class="field"><span>${t('duration')}</span><select name="dur"></select></label>
      <div class="confirm-actions">
        <button type="button" class="btn primary" data-save>${t('confirmTime')}</button>
        <button type="button" class="btn ghost" data-cancel>${t('cancel')}</button>
      </div>`;
    li.append(editor);

    const startSel = editor.querySelector('[name="start"]');
    const durSel = editor.querySelector('[name="dur"]');
    const fillDurations = () => {
      const room = blockLen - +startSel.value;
      const options = [];
      for (let d = step; d <= room; d += step) options.push(d);
      const preferred = options.includes(60) ? 60 : options.at(-1);
      durSel.innerHTML = options.map(d => `<option value="${d}"${d === preferred ? ' selected' : ''}>${fmtDuration(d)}</option>`).join('');
    };
    fillDurations();
    startSel.addEventListener('change', fillDurations);
    startSel.focus();

    editor.querySelector('[data-cancel]').addEventListener('click', () => {
      editor.remove();
      li.classList.remove('editing');
    });
    editor.querySelector('[data-save]').addEventListener('click', async e => {
      const pos = utcToZoned(at(+startSel.value), ev.timezone);
      e.currentTarget.disabled = true;
      await saveFinal({ start: `${pos.date}T${hhmm(pos.min)}`, minutes: +durSel.value }, e.currentTarget);
    });
  }

  $('#min-dur').addEventListener('change', e => { minDuration = +e.target.value; renderGroup(); });

  // Azioni dell'evento nella barra in alto, accanto alla lingua.
  $('#topbar-actions').innerHTML = `
    <button type="button" class="btn primary" id="copy" title="${esc(t('copyLink'))}" aria-label="${esc(t('copyLink'))}">${ICONS.link}<span>${t('copyLinkShort')}</span></button>
    <a href="#/" class="btn ghost" title="${esc(t('newEventBtn'))}" aria-label="${esc(t('newEventBtn'))}">${ICONS.plus}<span>${t('newEventBtn')}</span></a>`;
  $('#copy').addEventListener('click', async e => {
    const btn = e.currentTarget;
    const original = btn.innerHTML;
    try {
      await navigator.clipboard.writeText(eventLink(id));
      // Conferma visibile anche su telefono, dove resta solo l'icona: diventa una spunta.
      btn.innerHTML = `${ICONS.check}<span>${t('linkCopiedShort')}</span>`;
    } catch {
      try { prompt(t('copyPrompt'), eventLink(id)); } catch {}
    }
    setTimeout(() => { btn.innerHTML = original; }, 2000);
  });

  // --- Orario confermato e barra dell'organizzatore
  async function saveFinal(final, btn) {
    try {
      await store.setFinal(id, adminKey, final);
      ev = { ...ev, final };
      renderHeadExtras();
      renderGroup();
    } catch (ex) {
      noteConnection(ex);
      if (btn) { btn.disabled = false; btn.textContent = t('error').replace(/:$/, ''); }
    }
  }

  function renderHeadExtras() {
    const box = $('#head-extras');
    let html = '';
    if (ev.final) {
      const { start, end } = finalRange(ev);
      const fDate = new Intl.DateTimeFormat(lang, { timeZone: viewTz, weekday: 'long', day: 'numeric', month: 'long' });
      const fTime = new Intl.DateTimeFormat(lang, { timeZone: viewTz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const links = calendarLinks(ev);
      html += `<div class="final-banner">
        <div class="final-when">
          <span class="final-label">✓ ${t('confirmed')}</span>
          <b>${esc(cap(fDate.format(start)))} · ${fTime.format(start)}–${fTime.format(end)}</b>
        </div>
        <div class="final-actions">
          <span>${t('addToCalendar')}</span>
          <a class="btn small" href="${esc(links.google)}" target="_blank" rel="noopener">Google</a>
          <a class="btn small" href="${esc(links.outlook)}" target="_blank" rel="noopener">Outlook</a>
          <button type="button" class="btn small" id="ics">Apple / .ics</button>
          ${isAdmin ? `<button type="button" class="link-btn" id="undo-final">${t('undoConfirm')}</button>` : ''}
        </div>
      </div>`;
    }
    if (isAdmin) {
      html += `<div class="organizer-bar${justCreated ? ' highlight' : ''}">
        <span><b>${t('organizer')}</b>${justCreated ? ` · ${t('justCreated')}` : ''}</span>
        <button type="button" class="btn small" id="copy-admin">${t('copyAdminLink')}</button>
        <span class="hint">${t('adminHint')}</span>
      </div>`;
    }
    box.innerHTML = html;
    box.hidden = !html;
    $('#ics')?.addEventListener('click', () => downloadIcs(ev));
    $('#undo-final')?.addEventListener('click', e => saveFinal(null, e.currentTarget));
    $('#copy-admin')?.addEventListener('click', async e => {
      const btn = e.currentTarget;
      try {
        await navigator.clipboard.writeText(adminLink(id, adminKey));
        btn.textContent = t('adminLinkCopied');
      } catch {
        try { prompt(t('copyPrompt'), adminLink(id, adminKey)); } catch {}
      }
      setTimeout(() => { btn.textContent = t('copyAdminLink'); }, 2000);
    });
  }

  // Pulsante "↓ Orari migliori": visibile finché la sezione è fuori dallo schermo.
  const scrollHint = $('#scroll-hint');
  const updateHint = () => {
    const best = $('#best');
    if (!best) return;
    const limit = Math.min(innerHeight, app.getBoundingClientRect().bottom);
    scrollHint.hidden = best.getBoundingClientRect().top < limit - 40;
  };
  scrollHint.addEventListener('click', () => {
    const best = $('#best');
    // Su desktop scorre l'area centrale, su telefono la pagina.
    if (app.scrollHeight > app.clientHeight) {
      app.scrollTo({ top: app.scrollTop + best.getBoundingClientRect().top - app.getBoundingClientRect().top, behavior: 'smooth' });
    } else {
      best.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  app.addEventListener('scroll', updateHint, { passive: true });
  addEventListener('scroll', updateHint, { passive: true });
  addEventListener('resize', updateHint);
  const hintObserver = { disconnect() {
    app.removeEventListener('scroll', updateHint);
    removeEventListener('scroll', updateHint);
    removeEventListener('resize', updateHint);
  } };

  renderHeadExtras();
  renderMine();
  drawGroupGrid();
  renderGroup();
  renderPagers();
  thinAllLabels();
  requestAnimationFrame(updateHint);

  // Aggiornamento in tempo reale quando qualcun altro risponde.
  const unsubscribe = store.subscribe(id, {
    onResponses: async () => {
      responses = await store.listResponses(id);
      renderGroup();
    },
    onEvent: async () => {
      const fresh = await store.getEvent(id);
      if (fresh) { ev = fresh; renderHeadExtras(); }
    },
  });
  cleanup = () => {
    unsubscribe();
    document.removeEventListener('pointerdown', closeResponders);
    hintObserver.disconnect();
    removeEventListener('whenly:reconnected', onReconnected);
    removeEventListener('resize', onResize);
    app.removeEventListener('click', onPage);
  };
}
