import { icon, heroArt, logArt } from './icons.js';
import { localApi } from './local.js';

// Screens are plain functions that return HTML strings. render() picks one from the URL
// hash (#/, #/log/2026-11-17, #/results, #/setup) and swaps it into <main>. Clicks,
// submits and changes are handled once, at the top, through data-action attributes.

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

const METRICS = [
  { key: 'energy', label: 'Energy', low: 'Drained', high: 'Energized' },
  { key: 'calm', label: 'Calm', low: 'On edge', high: 'Relaxed' },
  { key: 'focus', label: 'Focus', low: 'Foggy', high: 'Sharp' },
  { key: 'mood', label: 'Mood', low: 'Low', high: 'Great' },
  { key: 'taste', label: 'Taste', low: 'Yuck', high: 'Loved it' },
];

// One color pair per drink letter: solid for bars and icons, soft for icon tiles.
const PALETTE = [
  { solid: '#4A1730', soft: '#F1E1E8' }, // wine
  { solid: '#8C1D4B', soft: '#F8DDE8' }, // maroon
  { solid: '#93AE3E', soft: '#EEF2DC' }, // sage (the reference's green)
  { solid: '#D58BD8', soft: '#F7E5F7' }, // orchid
  { solid: '#6D3F99', soft: '#ECE2F6' }, // plum
  { solid: '#B5476F', soft: '#F7E0E8' }, // rose
];
const colorFor = (code) => PALETTE[(code.charCodeAt(0) - 65) % PALETTE.length];
const cupFor = (code) => icon.cup[(code.charCodeAt(0) - 65) % icon.cup.length];

// ---------- dates (always local time, stored as YYYY-MM-DD) ----------

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d) => addDays(d, -((d.getDay() + 6) % 7)); // Monday
const fmt = (s, opts) => fromIso(s).toLocaleDateString('en-US', opts);
const shortDate = (s) => fmt(s, { weekday: 'short', month: 'short', day: 'numeric' });
const todayIso = () => iso(new Date());
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- state ----------

let state = null; // public view from /api/state (drink names hidden until reveal)
let admin = null; // full data from /api/admin/state, only after the PIN is accepted
let adminError = '';
let adminLoading = false;
let selected = todayIso();
let weekStart = iso(startOfWeek(new Date()));
let lastRoute = null; // null so the very first render counts as entering a screen
let daySwap = false; // set when she taps a day, so only the week circle and hero card animate
let justLogged = null; // date just saved, so its check mark pops on the home screen
let confettiShown = false;

// The admin PIN is kept in sessionStorage, not localStorage, so it is forgotten when the
// tab or home-screen app closes. Unlocking Setup on her phone doesn't leave it unlocked.
// Storage can throw (private mode, blocked storage), hence the try/catch.
const store = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* ignore */ } },
};

// Everything is stored on this phone. api() keeps the shape of the old HTTP calls, but
// local.js answers them from the phone's storage, so nothing waits on a network.
function api(method, path, body) {
  return localApi(method, path, body ?? {}, store.get('adminPin') ?? '');
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const drinkLabel = (entry) => entry.name ?? `Drink ${entry.code}`;

// What she sees for a day: its letter once the admin has assigned one, otherwise just
// "Today's drink" / "Monday's drink".
function dayLabel(date) {
  const sched = state.schedule[date];
  if (sched) return drinkLabel(sched);
  return date === todayIso() ? 'Today’s drink' : `${fmt(date, { weekday: 'long' })}’s drink`;
}
const NEUTRAL = { solid: '#3A1426', soft: '#F0DDF1' };
const dayColor = (date) => (state.schedule[date] ? colorFor(state.schedule[date].code) : NEUTRAL);
const dayCup = (date) => (state.schedule[date] ? cupFor(state.schedule[date].code) : icon.cup[0]);

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function route() {
  const [name = '', arg = ''] = location.hash.replace(/^#\/?/, '').split('/');
  return { name, arg };
}

function render({ enter = false } = {}) {
  if (!state) return;
  const r = route();
  if (r.name === 'log') app.innerHTML = logView(r.arg);
  else if (r.name === 'results') app.innerHTML = resultsView();
  else if (r.name === 'setup') app.innerHTML = setupView();
  else app.innerHTML = homeView();

  const changed = location.hash !== lastRoute;
  if (changed) {
    lastRoute = location.hash;
    window.scrollTo(0, 0);
  }
  if (changed || enter) playEnter(r.name);
  daySwap = false;
  justLogged = null;
}

// ---------- motion ----------
// Entrance animations only run when a screen is entered, not on every re-render (tapping
// a day re-renders the whole home screen). playEnter numbers the blocks (--i) and list
// rows (--j) for staggered delays, then sets .animate on <main> for long enough to play.

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let enterTimer;

function playEnter(name) {
  if (reducedMotion()) return;
  [...app.children].forEach((el, i) => el.style.setProperty('--i', Math.min(i, 8)));
  for (const sel of ['.timeline-row', '.card-list', 'form > .field, form > .toggle-row', '.bar-col', '.note-item']) {
    app.querySelectorAll(sel).forEach((el, j) => el.style.setProperty('--j', Math.min(j, 10)));
  }
  app.querySelectorAll('.card-list').forEach((list) =>
    [...list.children].forEach((row, j) => row.style.setProperty('--j', Math.min(j, 10))));
  app.classList.remove('animate');
  void app.offsetWidth; // restart the animations if .animate was still on
  app.classList.add('animate');
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => app.classList.remove('animate'), 1800);
  if (name === 'results' && state.revealed) confetti();
}

function confetti() {
  if (confettiShown) return;
  confettiShown = true;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('i');
    piece.style.cssText = [
      `left:${Math.random() * 100}%`,
      `background:${PALETTE[i % PALETTE.length].solid}`,
      `--dx:${Math.round((Math.random() - 0.5) * 140)}px`,
      `--r:${Math.round(Math.random() * 720 - 360)}deg`,
      `animation-delay:${Math.round(Math.random() * 400)}ms`,
      `animation-duration:${1500 + Math.round(Math.random() * 1000)}ms`,
      i % 3 === 0 ? 'border-radius:50%;height:8px' : '',
    ].join(';');
    layer.append(piece);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 3200);
}

// ---------- home ----------

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
}

function homeView() {
  const today = todayIso();
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(fromIso(weekStart), i)));
  const monthLabel = fmt(days[3], { month: 'long', year: 'numeric' });

  const week = days.map((d) => {
    const cls = ['week-day', d === selected && 'is-selected', d === today && 'is-today'].filter(Boolean).join(' ');
    const dot = state.logs[d] ? 'logged' : '';
    return `
      <button class="${cls}" data-action="select-day" data-date="${d}" aria-pressed="${d === selected}">
        <span class="week-label">${fmt(d, { weekday: 'short' })}</span>
        <span class="week-num ${d === selected && daySwap ? 'pop' : ''}">${fromIso(d).getDate()}</span>
        <span class="week-dot ${dot}"></span>
      </button>`;
  }).join('');

  const entries = [...new Set([today, ...Object.keys(state.logs), ...Object.keys(state.schedule)])]
    .filter((d) => d <= today)
    .sort()
    .reverse();
  const list = `<div class="timeline">${entries.map(logRow).join('')}</div>`;
  const fab = `<a class="fab" href="#/log/${today}" aria-label="Log today">${icon.plus}</a>`;

  return `
    <header class="header">
      <div>
        <h1 class="title" data-hold="setup">${greeting()}${state.name ? `, ${esc(state.name)}` : ''}</h1>
        <p class="subtitle">${fmt(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>
      <a class="circle-btn avatar-btn" href="#/results" aria-label="Results">${icon.chart}</a>
    </header>

    <div class="week-nav">
      <button data-action="week" data-step="-7" aria-label="Previous week">${icon.left}</button>
      <span>${monthLabel}</span>
      <button data-action="week" data-step="7" aria-label="Next week">${icon.right}</button>
    </div>
    <div class="week">${week}</div>

    ${heroCard(selected, today)}

    <div class="section-head">
      <h3>Your log</h3>
      <a href="#/results">Results</a>
    </div>
    ${list}

    ${fab}`;
}

function heroCard(date, today) {
  const sched = state.schedule[date];
  const log = state.logs[date];
  const isToday = date === today;
  let title;
  let body;
  let action = '';

  const what = sched ? esc(drinkLabel(sched)) : isToday ? 'today’s drink' : 'that day’s drink';

  if (date > today) {
    title = 'Coming up';
    body = `Check in on ${fmt(date, { weekday: 'long' })} evening.`;
  } else if (log) {
    title = 'Logged';
    body = `Overall ${log.overall} out of 5. You can still change it.`;
    action = `<a class="pill" href="#/log/${date}">Edit</a>`;
  } else {
    title = isToday ? 'Tonight’s check-in' : 'Missed check-in';
    body = `How did ${what} make you feel?`;
    action = `<a class="pill" href="#/log/${date}">Log it</a>`;
  }

  return `
    <section class="hero ${daySwap ? 'swap' : ''}">
      <div>
        <h2>${title}</h2>
        <p>${body}</p>
        ${action}
      </div>
      ${heroArt}
    </section>`;
}

function logRow(date) {
  const log = state.logs[date];
  const c = dayColor(date);
  return `
    <div class="timeline-row">
      <span class="check ${log ? 'done' : ''} ${date === justLogged ? 'fresh' : ''}">${log ? icon.check : ''}</span>
      <a class="item" href="#/log/${date}">
        <span class="tile" style="background:${c.soft};color:${c.solid}">${dayCup(date)}</span>
        <span class="item-main">
          <div class="item-title">${esc(dayLabel(date))}</div>
          <div class="item-sub">${shortDate(date)}</div>
        </span>
        <span class="item-meta ${log ? '' : 'muted'}">
          ${log ? icon.smile : icon.pending}
          <span>${log ? `${log.overall}/5` : 'Log'}</span>
        </span>
      </a>
    </div>`;
}

// ---------- log form ----------

function ratingField(key, title, low, high, value, hint = '') {
  const circles = [1, 2, 3, 4, 5].map((n) => `
    <label>
      <input type="radio" name="${key}" value="${n}" ${value === n ? 'checked' : ''} aria-label="${title} ${n}">
      <span>${n}</span>
    </label>`).join('');
  return `
    <div class="field" role="radiogroup" aria-label="${title}">
      <div class="field-head"><span>${title}</span>${hint ? `<small>${hint}</small>` : ''}</div>
      <div class="rating">${circles}</div>
      <div class="scale-ends"><span>${low}</span><span>${high}</span></div>
    </div>`;
}

function closeHeader(title) {
  return `
    <header class="header">
      <h1 class="title">${title}</h1>
      <a class="circle-btn" href="#/" aria-label="Close">${icon.close}</a>
    </header>`;
}

function logView(date) {
  if (!DATE_RE.test(date)) return `${closeHeader('Log')}<div class="empty" style="margin-top:28px">Unknown day.</div>`;
  if (date > todayIso()) return `${closeHeader('Log')}<div class="empty" style="margin-top:28px">Come back that evening to log it.</div>`;

  const log = state.logs[date] ?? {};
  const hasSide = Boolean(log.sideEffects);

  return `
    ${closeHeader('How did it feel?')}
    ${logArt}
    <div class="chip"><span><b>${esc(dayLabel(date))}</b> ${fmt(date, { weekday: 'long', month: 'short', day: 'numeric' })}</span></div>

    <form id="log-form" data-date="${date}" novalidate>
      ${ratingField('overall', 'Overall', 'Rough day', 'Great day', log.overall, 'Required')}
      ${METRICS.map((m) => ratingField(m.key, m.label, m.low, m.high, log[m.key])).join('')}

      <div class="field">
        <div class="field-head">Time you drank it</div>
        <input class="input" type="time" name="time" value="${esc(log.time ?? '')}">
      </div>

      <label class="toggle-row">
        <span>Any side effects?</span>
        <span class="switch"><input type="checkbox" name="hasSide" ${hasSide ? 'checked' : ''}><span></span></span>
      </label>
      <div class="field reveal-when" data-when="hasSide" ${hasSide ? '' : 'hidden'}>
        <textarea class="input" name="sideEffects" placeholder="Headache, jitters, sleepy...">${esc(log.sideEffects ?? '')}</textarea>
      </div>

      <div class="field">
        <div class="field-head">Notes</div>
        <textarea class="input" name="notes" placeholder="Anything worth remembering">${esc(log.notes ?? '')}</textarea>
      </div>

      <p class="error" id="form-error" hidden></p>
      <button class="primary" type="submit">Save</button>
      ${log.overall ? '<button class="ghost" type="button" data-action="delete-log">Delete entry</button>' : ''}
    </form>`;
}

async function saveLog(form) {
  const data = new FormData(form);
  const errorEl = form.querySelector('#form-error');
  if (!data.get('overall')) {
    errorEl.textContent = 'Pick an overall rating.';
    errorEl.hidden = false;
    form.querySelector('[name="overall"]').closest('.field').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const body = { time: data.get('time'), notes: data.get('notes') };
  body.sideEffects = data.get('hasSide') ? data.get('sideEffects') : '';
  for (const key of ['overall', ...METRICS.map((m) => m.key)]) body[key] = data.get(key);

  const date = form.dataset.date;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    state = await api('PUT', `/api/logs/${date}`, body);
    selected = date;
    justLogged = date;
    weekStart = iso(startOfWeek(fromIso(date)));
    location.hash = '#/';
    toast('Saved');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
    button.disabled = false;
    button.textContent = 'Save';
  }
}

// ---------- results ----------

function computeStats() {
  const byCode = new Map(state.drinks.map((d) => [d.code, { ...d, label: drinkLabel(d), logs: [] }]));
  for (const [date, log] of Object.entries(state.logs)) {
    const sched = state.schedule[date];
    if (sched && byCode.has(sched.code)) byCode.get(sched.code).logs.push({ ...log, date });
  }
  const mean = (logs, key) => {
    const vals = logs.map((l) => l[key]).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  return [...byCode.values()].map((d) => ({
    ...d,
    avg: Object.fromEntries(['overall', ...METRICS.map((m) => m.key)].map((k) => [k, mean(d.logs, k)])),
  }));
}

const one = (v) => (v == null ? '–' : v.toFixed(1));
const meanOf = (vals) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);

// Rank by average overall score. Ties go to the higher average across the other feelings.
// Drinks she never logged sort last.
function rankDrinks(drinks) {
  const others = (d) => meanOf(METRICS.map((m) => d.avg[m.key]).filter((v) => v != null)) ?? 0;
  return [...drinks].sort((a, b) =>
    (b.avg.overall ?? -1) - (a.avg.overall ?? -1) || others(b) - others(a) || a.code.localeCompare(b.code));
}

function barsHtml(drinks) {
  return drinks.map((d) => {
    const c = colorFor(d.code);
    const v = d.avg.overall;
    const fill = v == null
      ? '<div class="bar-fill none"></div>'
      : `<div class="bar-fill" style="height:${(v / 5) * 100}%;background:${c.solid}"><span>${one(v)}</span></div>`;
    return `
      <div class="bar-col">
        <div class="bar-track" aria-label="${esc(d.label)}: ${v == null ? 'no logs' : `${one(v)} out of 5`}">${fill}</div>
        <div class="bar-label">${esc(d.label)}</div>
      </div>`;
  }).join('');
}

function resultsView() {
  const drinks = computeStats();
  if (state.revealed) return reportView(drinks);
  const header = closeHeader('Your results<br>so far');
  if (!drinks.length) return `${header}<div class="empty" style="margin-top:28px">No drinks yet.</div>`;
  const bars = barsHtml(drinks);

  const top = drinks.filter((d) => d.avg.overall != null).sort((a, b) => b.avg.overall - a.avg.overall)[0];

  const rows = drinks.map((d) => `
    <tr>
      <td><span class="swatch" style="background:${colorFor(d.code).solid}"></span>${d.code}</td>
      ${METRICS.map((m) => `<td>${one(d.avg[m.key])}</td>`).join('')}
    </tr>`).join('');

  return `
    ${header}
    <div class="bars">${bars}</div>

    <section class="sheet">
      <div class="sheet-head">
        <div>
          <h3>Top pick</h3>
          <p>Best overall so far</p>
        </div>
        <div class="big-stat">${top ? `<b>${one(top.avg.overall)}</b> ${esc(top.label)}` : '–'}</div>
      </div>

      <div class="stats">
        <div><small>Days logged</small><strong>${Object.keys(state.logs).length}</strong></div>
        <div><small>Avg overall</small><strong>${one(meanOf(Object.values(state.logs).map((l) => l.overall)))}</strong></div>
        <div><small>Drinks tried</small><strong>${drinks.filter((d) => d.logs.length).length}</strong></div>
      </div>

      <table class="breakdown">
        <thead><tr><th>Code</th>${METRICS.map((m) => `<th>${m.label}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <p class="note">Names stay hidden until the test is over.</p>
    </section>`;
}

// Shown once the admin presses "Generate report": ranking, best drink per feeling, and
// her notes grouped by drink.
function reportView(drinks) {
  const header = closeHeader('Final report');
  const ranked = rankDrinks(drinks);
  const tried = ranked.filter((d) => d.logs.length);
  if (!tried.length) return `${header}<div class="empty" style="margin-top:28px">Nothing was logged.</div>`;
  const winner = tried[0];

  const rankRows = ranked.map((d, i) => {
    const c = colorFor(d.code);
    const days = d.logs.length;
    const sub = [d.brand, days ? `${days} ${days === 1 ? 'day' : 'days'}` : 'Not tried'].filter(Boolean).join(' · ');
    return `
      <div class="card-row">
        <span class="tile rank" style="background:${c.soft};color:${c.solid}">${days ? i + 1 : '–'}</span>
        <div class="item-main">
          <div class="item-title">${esc(d.label)}</div>
          <div class="item-sub">${esc(sub)}</div>
        </div>
        <span class="score">${one(d.avg.overall)}</span>
      </div>`;
  }).join('');

  const bestRows = METRICS.map((m) => {
    const best = [...tried].filter((d) => d.avg[m.key] != null).sort((a, b) => b.avg[m.key] - a.avg[m.key])[0];
    if (!best) return '';
    const c = colorFor(best.code);
    return `
      <div class="card-row">
        <span class="tile" style="background:${c.soft};color:${c.solid}">${cupFor(best.code)}</span>
        <div class="item-main">
          <div class="item-sub">${m.label}</div>
          <div class="item-title">${esc(best.label)}</div>
        </div>
        <span class="score">${one(best.avg[m.key])}</span>
      </div>`;
  }).join('');

  const noteGroups = ranked.map((d) => {
    const items = d.logs
      .filter((l) => l.notes || l.sideEffects)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((l) => `
        <div class="note-item">
          <div class="item-sub">${shortDate(l.date)} · ${l.overall}/5</div>
          ${l.notes ? `<p>${esc(l.notes)}</p>` : ''}
          ${l.sideEffects ? `<p class="side">Side effects: ${esc(l.sideEffects)}</p>` : ''}
        </div>`).join('');
    return items ? `<div class="note-group"><h4>${esc(d.label)}</h4>${items}</div>` : '';
  }).join('');

  const logged = tried.flatMap((d) => d.logs);

  return `
    ${header}
    <div class="bars">${barsHtml(ranked)}</div>

    <section class="sheet">
      <div class="sheet-head">
        <div>
          <h3>Winner</h3>
          <p>Best overall feeling</p>
        </div>
        <div class="big-stat"><b>${one(winner.avg.overall)}</b> ${esc(winner.label)}</div>
      </div>

      <div class="stats">
        <div><small>Days logged</small><strong>${logged.length}</strong></div>
        <div><small>Avg overall</small><strong>${one(meanOf(logged.map((l) => l.overall)))}</strong></div>
        <div><small>Drinks tried</small><strong>${tried.length}</strong></div>
      </div>

      <div class="section-head"><h3>Ranking</h3></div>
      <div class="card-list">${rankRows}</div>

      <div class="section-head"><h3>Best for</h3></div>
      <div class="card-list">${bestRows}</div>

      ${noteGroups ? `<div class="section-head"><h3>Notes</h3></div>${noteGroups}` : ''}
      <div style="height:24px"></div>
    </section>`;
}

// ---------- setup (admin) ----------

// iOS keeps Safari's storage and the home-screen app's storage apart. Setting up in a
// Safari tab would put the drinks somewhere the home-screen app can't see.
function homeScreenHint() {
  if (navigator.standalone !== false) return ''; // already the home-screen app, or not iOS
  return `<div class="empty" style="margin-top:24px;text-align:left">Add this page to the Home Screen first (Share → Add to Home Screen), then open it from there to set up. Safari and the home-screen app keep separate data.</div>`;
}

function setupView() {
  const pin = store.get('adminPin');
  if (!admin) {
    if (pin && !adminError) {
      if (!adminLoading) loadAdmin();
      return `${closeHeader('Setup')}<div class="empty" style="margin-top:28px">Loading…</div>`;
    }
    return `
      ${closeHeader('Setup')}
      ${homeScreenHint()}
      <form id="pin-form" class="field" style="margin-top:36px">
        <div class="field-head">${state.pinSet ? 'This part is for whoever runs the test.' : 'Choose a 4–8 digit PIN. It hides the drink names, so don’t forget it.'}</div>
        <input class="input" type="password" name="pin" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="PIN" required>
        ${adminError ? `<p class="error">${esc(adminError)}</p>` : ''}
        <button class="primary" type="submit">${state.pinSet ? 'Unlock' : 'Set PIN'}</button>
      </form>`;
  }

  const byId = new Map(admin.drinks.map((d) => [d.id, d]));
  const drinkRows = admin.drinks.map((d) => {
    const c = colorFor(d.code);
    return `
      <div class="card-row">
        <span class="tile" style="background:${c.soft};color:${c.solid}">${d.code}</span>
        <div class="item-main">
          <div class="item-title">${esc(d.name)}</div>
          ${d.brand ? `<div class="item-sub">${esc(d.brand)}</div>` : ''}
        </div>
        <button class="icon-btn" data-action="delete-drink" data-id="${d.id}" aria-label="Delete ${esc(d.name)}">${icon.trash}</button>
      </div>`;
  }).join('');

  // One row per day that is logged or has a drink planned, newest first. The picker on
  // each row assigns (or clears) the drink, so days she logged blind can be filled in later.
  const dates = [...new Set([...Object.keys(admin.logs), ...Object.keys(admin.days)])].sort().reverse();
  const dayRows = dates.map((date) => {
    const d = byId.get(admin.days[date]?.drinkId);
    const c = d ? colorFor(d.code) : NEUTRAL;
    const log = admin.logs[date];
    const opts = admin.drinks.map((x) =>
      `<option value="${x.id}" ${x.id === d?.id ? 'selected' : ''}>${x.code} · ${esc(x.name)}</option>`).join('');
    return `
      <div class="card-row">
        <span class="tile" style="background:${c.soft};color:${c.solid}">${d ? d.code : '?'}</span>
        <div class="item-main">
          <div class="item-title">${shortDate(date)}</div>
          <div class="item-sub">${log ? `Logged ${log.overall}/5` : date > todayIso() ? 'Planned' : 'Not logged'}</div>
        </div>
        <select class="input mini" data-action="assign-day" data-date="${date}" aria-label="Drink for ${shortDate(date)}">
          <option value="">No drink</option>${opts}
        </select>
      </div>`;
  }).join('');

  const options = admin.drinks.map((d) => `<option value="${d.id}">${d.code} · ${esc(d.name)}</option>`).join('');
  const loggedDates = Object.keys(admin.logs);
  const unassigned = loggedDates.filter((date) => !admin.days[date]).length;

  const report = admin.settings.revealed
    ? `<p class="hint" style="margin:0 0 4px">The report is live on her phone.</p>
       <div class="actions">
         <a class="secondary" href="#/results">View report</a>
         <button class="secondary light" data-action="hide-report">Hide report</button>
       </div>`
    : `<p class="hint" style="margin:0">${loggedDates.length - unassigned} of ${loggedDates.length} logged days have a drink assigned.</p>
       <button class="primary" data-action="generate" style="margin-top:16px">Generate report</button>`;

  return `
    ${closeHeader('Setup')}

    <div class="field">
      <div class="field-head">Her name</div>
      <input class="input" name="name" data-action="save-name" value="${esc(admin.settings.name)}" placeholder="Shown in the greeting" autocomplete="off">
    </div>

    <div class="section-head"><h3>Drinks</h3></div>
    ${drinkRows ? `<div class="card-list">${drinkRows}</div>` : ''}
    <form id="drink-form" style="margin-top:12px">
      <div class="row-2">
        <input class="input" name="name" placeholder="Drink name" required autocomplete="off">
        <input class="input" name="brand" placeholder="Brand" autocomplete="off">
      </div>
      <div class="actions"><button class="secondary" type="submit">${icon.plus} Add drink</button></div>
    </form>

    <div class="section-head"><h3>Days</h3></div>
    ${dayRows ? `<div class="card-list">${dayRows}</div>` : '<div class="empty">Days she logs show up here.</div>'}

    ${admin.drinks.length ? `
      <div class="section-head"><h3>Plan ahead</h3></div>
      <form id="day-form">
        <div class="row-2">
          <input class="input" type="date" name="date" value="${nextOpenDate()}" required>
          <select class="input" name="drinkId">${options}</select>
        </div>
        <div class="actions">
          <button class="secondary" type="submit">Assign</button>
          <button class="secondary light" type="button" data-action="shuffle">${icon.shuffle} Shuffle all from this date</button>
        </div>
      </form>` : ''}

    <div class="section-head"><h3>Report</h3></div>
    ${report}

    <div class="actions" style="margin-top:36px">
      <button class="secondary light" data-action="backup">${icon.download} Back up</button>
      <button class="secondary light" data-action="restore">Restore</button>
      <button class="secondary light" data-action="export">${icon.download} Export CSV</button>
      <button class="secondary light" data-action="lock">${icon.lock} Lock</button>
    </div>
    <input type="file" id="restore-file" accept="application/json,.json" hidden>
    <p class="hint" style="margin-top:12px">Everything lives on this phone. Back up now and then.</p>`;
}

function nextOpenDate() {
  let d = new Date();
  while (admin.days[iso(d)]) d = addDays(d, 1);
  return iso(d);
}

async function loadAdmin() {
  adminLoading = true;
  try {
    admin = await api('GET', '/api/admin/state');
    state = await api('GET', '/api/state'); // pinSet flips to true after the first PIN
    adminError = '';
  } catch (err) {
    adminError = err.message;
    if (err.status === 401) store.set('adminPin', null);
  }
  adminLoading = false;
  render({ enter: true });
}

// Every admin change returns the full admin data. The public view is refetched too so
// the home screen and results reflect the change right away.
async function adminChange(method, path, body) {
  admin = await api(method, path, body);
  state = await api('GET', '/api/state');
  render();
}

// ---------- events ----------

app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action } = el.dataset;
  try {
    if (action === 'select-day') {
      selected = el.dataset.date;
      daySwap = true;
      render();
    } else if (action === 'week') {
      weekStart = iso(addDays(fromIso(weekStart), Number(el.dataset.step)));
      render();
    } else if (action === 'delete-log') {
      const date = document.getElementById('log-form').dataset.date;
      if (!confirm('Delete this entry?')) return;
      state = await api('DELETE', `/api/logs/${date}`);
      location.hash = '#/';
      toast('Deleted');
    } else if (action === 'delete-drink') {
      if (!confirm('Delete this drink?')) return;
      await adminChange('DELETE', `/api/admin/drinks/${el.dataset.id}`);
    } else if (action === 'generate') {
      const missing = Object.keys(admin.logs).filter((d) => !admin.days[d]).length;
      const ask = missing
        ? `${missing} logged ${missing === 1 ? 'day has' : 'days have'} no drink assigned and won’t count. Generate the report anyway?`
        : 'Generate the final report? She will see the drink names.';
      if (!confirm(ask)) return;
      await adminChange('PATCH', '/api/admin/settings', { revealed: true });
      location.hash = '#/results';
    } else if (action === 'hide-report') {
      await adminChange('PATCH', '/api/admin/settings', { revealed: false });
      toast('Report hidden');
    } else if (action === 'shuffle') {
      await shuffleSchedule();
    } else if (action === 'export') {
      download(`adaptogen-log-${todayIso()}.csv`, await api('GET', '/api/admin/export.csv'), 'text/csv');
    } else if (action === 'backup') {
      download(`sips-backup-${todayIso()}.json`, await api('GET', '/api/admin/backup'), 'application/json');
    } else if (action === 'restore') {
      app.querySelector('#restore-file').click();
    } else if (action === 'lock') {
      store.set('adminPin', null);
      admin = null;
      location.hash = '#/';
    }
  } catch (err) {
    toast(err.message);
  }
});

app.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'restore-file' && t.files?.[0]) {
    if (!confirm('Replace everything on this phone with this backup?')) return;
    try {
      await api('POST', '/api/admin/restore', { json: await t.files[0].text() });
      store.set('adminPin', null);
      admin = null;
      state = await api('GET', '/api/state');
      location.hash = '#/';
      render();
      toast('Restored');
    } catch (err) {
      toast(err.message);
    }
    return;
  }
  if (t.name === 'hasSide') {
    app.querySelector('[data-when="hasSide"]').hidden = !t.checked;
    return;
  }
  try {
    if (t.dataset.action === 'assign-day') {
      await adminChange('PUT', `/api/admin/days/${t.dataset.date}`, { drinkId: t.value || null });
      toast(t.value ? `${shortDate(t.dataset.date)} assigned` : `${shortDate(t.dataset.date)} cleared`);
    } else if (t.dataset.action === 'save-name') {
      await adminChange('PATCH', '/api/admin/settings', { name: t.value });
      toast('Saved');
    }
  } catch (err) {
    toast(err.message);
  }
});

app.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  try {
    if (form.id === 'log-form') {
      await saveLog(form);
    } else if (form.id === 'pin-form') {
      store.set('adminPin', data.pin);
      adminError = '';
      await loadAdmin();
    } else if (form.id === 'drink-form') {
      await adminChange('POST', '/api/admin/drinks', data);
      app.querySelector('#drink-form [name="name"]')?.focus();
    } else if (form.id === 'day-form') {
      await adminChange('PUT', `/api/admin/days/${data.date}`, { drinkId: data.drinkId });
      toast(`Assigned ${shortDate(data.date)}`);
    }
  } catch (err) {
    toast(err.message);
  }
});

// Puts every drink on consecutive days from the chosen date, in random order.
async function shuffleSchedule() {
  const start = app.querySelector('#day-form [name="date"]').value;
  if (!start) return;
  const order = [...admin.drinks];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const dates = order.map((_, i) => iso(addDays(fromIso(start), i)));
  const taken = dates.filter((d) => admin.days[d]).length;
  if (taken && !confirm(`${taken} of these ${dates.length} days already have a drink. Replace them?`)) return;
  for (const [i, d] of dates.entries()) {
    admin = await api('PUT', `/api/admin/days/${d}`, { drinkId: order[i].id });
  }
  state = await api('GET', '/api/state');
  render();
  toast(`Scheduled ${dates.length} days`);
}

window.addEventListener('hashchange', render);

// Hidden way into Setup: press and hold the greeting for about a second. A home-screen
// app has no address bar, so typing #/setup isn't possible there.
let holdTimer;
app.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('[data-hold="setup"]')) return;
  holdTimer = setTimeout(() => { location.hash = '#/setup'; }, 900);
});
for (const type of ['pointerup', 'pointerleave', 'pointercancel', 'scroll']) {
  app.addEventListener(type, () => clearTimeout(holdTimer), true);
}

// Coming back to the app (maybe the next day): redraw so "today" is right, unless she's
// partway through a form.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || ['log', 'setup'].includes(route().name)) return;
  state = await api('GET', '/api/state');
  render();
});

(async function start() {
  state = await api('GET', '/api/state');
  render();
  // Ask the browser not to clear this site's storage under storage pressure.
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
