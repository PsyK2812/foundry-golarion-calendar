/**
 * Golarion Calendar — Absalom Reckoning calendar for Foundry VTT (v13+).
 *
 * The date is derived from game.time.worldTime, so anything that advances
 * world time (rests, other modules, the GM's buttons) moves the calendar.
 */

const MODULE_ID = "golarion-calendar";
const SOCKET = `module.${MODULE_ID}`;
const DAY = 86400;

/* ================================================================== */
/*  Calendar data                                                      */
/* ================================================================== */

export const MONTHS = [
  { name: "Abadius",   deity: "Abadar",     days: 31, season: "Winter" },
  { name: "Calistril", deity: "Calistria",  days: 28, season: "Winter", leap: true },
  { name: "Pharast",   deity: "Pharasma",   days: 31, season: "Spring" },
  { name: "Gozran",    deity: "Gozreh",     days: 30, season: "Spring" },
  { name: "Desnus",    deity: "Desna",      days: 31, season: "Spring" },
  { name: "Sarenith",  deity: "Sarenrae",   days: 30, season: "Summer" },
  { name: "Erastus",   deity: "Erastil",    days: 31, season: "Summer" },
  { name: "Arodus",    deity: "Aroden",     days: 31, season: "Summer" },
  { name: "Rova",      deity: "Rovagug",    days: 30, season: "Autumn" },
  { name: "Lamashan",  deity: "Lamashtu",   days: 31, season: "Autumn" },
  { name: "Neth",      deity: "Nethys",     days: 30, season: "Autumn" },
  { name: "Kuthona",   deity: "Zon-Kuthon", days: 31, season: "Winter" }
];

export const WEEKDAYS = ["Moonday", "Toilday", "Wealday", "Oathday", "Fireday", "Starday", "Sunday"];

const MOON_PHASES = [
  { name: "New Moon",        icon: "🌑" },
  { name: "Waxing Crescent", icon: "🌒" },
  { name: "First Quarter",   icon: "🌓" },
  { name: "Waxing Gibbous",  icon: "🌔" },
  { name: "Full Moon",       icon: "🌕" },
  { name: "Waning Gibbous",  icon: "🌖" },
  { name: "Last Quarter",    icon: "🌗" },
  { name: "Waning Crescent", icon: "🌘" }
];

const TIME_ICONS = {
  Night: "fa-moon", Dawn: "fa-cloud-sun", Morning: "fa-sun", Midday: "fa-sun",
  Afternoon: "fa-sun", Dusk: "fa-cloud-moon", Evening: "fa-moon"
};

/* ================================================================== */
/*  Settings access                                                    */
/* ================================================================== */

/** Defaults are used when settings are not yet available (e.g. tests). */
const DEFAULTS = {
  leapInterval: 4, weekdayShift: 0, moonCycle: 29.530588853, moonOffset: 0,
  sunMode: "latitude", latitude: 48, solarNoon: "12:00",
  summerSunrise: "04:45", summerSunset: "20:15", winterSunrise: "08:00", winterSunset: "16:30",
  twilightMinutes: 60,
  darknessDay: 0, darknessNewMoon: 1, darknessFullMoon: 0.7, moonLight: true,
  lightCurve: "gradual", horizonLight: 0.4, dayCurve: 1, fullMoonNames: true, dayFormat: "padOrdinal"
};

function S(key) {
  try { return game.settings.get(MODULE_ID, key); }
  catch { return DEFAULTS[key]; }
}
const num = (key) => Number(S(key) ?? DEFAULTS[key]);

/* ================================================================== */
/*  Date math                                                          */
/* ================================================================== */

const mod = (a, n) => ((a % n) + n) % n;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = x => Math.max(0, Math.min(1, x));

const leapEvery = () => num("leapInterval") || 4;
export function isLeap(y) { return mod(y, leapEvery()) === 0; }
export function monthDays(y, m) { return MONTHS[m].days + (MONTHS[m].leap && isLeap(y) ? 1 : 0); }

/** Days from 1 Abadius 1 AR to 1 Abadius of year y. */
export function daysBeforeYear(y) {
  const k = y - 1;
  return k * 365 + Math.floor(k / leapEvery());
}

/** Absolute day number (0 = 1 Abadius 1 AR). Month 0-based, day 1-based. */
export function toAbsDay(y, m, d) {
  let t = daysBeforeYear(y);
  for (let i = 0; i < m; i++) t += monthDays(y, i);
  return t + (d - 1);
}

export function fromAbsDay(abs) {
  let y = Math.floor(abs / (365 + 1 / leapEvery())) + 1;
  while (daysBeforeYear(y) > abs) y--;
  while (daysBeforeYear(y + 1) <= abs) y++;
  let r = abs - daysBeforeYear(y);
  let m = 0;
  while (r >= monthDays(y, m)) { r -= monthDays(y, m); m++; }
  return { year: y, month: m, day: r + 1 };
}

export function dayOfYear(abs) {
  const d = fromAbsDay(abs);
  return abs - daysBeforeYear(d.year);
}

/** Weekday index. 1 Abadius 4724 AR = Moonday (AR = AD + 2700 alignment). */
export function weekday(abs) {
  return mod(abs - toAbsDay(4724, 0, 1) + num("weekdayShift"), 7);
}

/**
 * Moon phase. Golarion's moon follows Earth's cycle; reference new moon is
 * 6 Jan 2000 18:14 UTC → 6 Abadius 4700 AR. "moonOffset" shifts it in days.
 */
const moonCycle = () => num("moonCycle") || 29.530588853;
const moonRef = () => toAbsDay(4700, 0, 6) + 18.2333 / 24 + num("moonOffset");

export function moonPhase(absFloat) {
  const cycle = moonCycle();
  const age = mod(absFloat - moonRef(), cycle);
  const idx = Math.floor((age / cycle) * 8 + 0.5) % 8;
  const illum = (1 - Math.cos((2 * Math.PI * age) / cycle)) / 2;
  const moon = { age, idx, illum, ...MOON_PHASES[idx] };
  if (idx === 4) moon.fullName = fullMoonName(absFloat);
  moon.label = idx === 4 && moon.fullName && S("fullMoonNames") ? `${moon.fullName} (Full Moon)` : moon.name;
  return moon;
}

/**
 * Golarion's named full moons (PathfinderWiki, "Somal"). Each is tied to an
 * Absalom Reckoning month; the extra 4th full moon in a season is the Spirit Moon.
 * Seasons here: Kuthona–Calistril, Pharast–Desnus, Sarenith–Arodus, Rova–Neth.
 */
const FULL_MOON_NAMES = [
  "Long Moon", "Fated Moon", "Rebirth Moon", "Flood Moon", "Blossom Moon", "Sweet Moon",
  "Lover's Moon", "Swarm Moon", "Harvest Moon", "Hunter's Moon", "Black Moon", "Cold Moon"
];

function seasonStart(y, m) {
  if (m === 11) return toAbsDay(y, 11, 1);
  if (m < 2) return toAbsDay(y - 1, 11, 1);
  return toAbsDay(y, m - ((m - 2) % 3), 1);
}

function fullMoonName(absFloat) {
  const cycle = moonCycle();
  const first = moonRef() + cycle / 2;
  const k = Math.round((absFloat - first) / cycle);
  const day = Math.floor(first + k * cycle);
  const d = fromAbsDay(day);
  const start = seasonStart(d.year, d.month);
  const after = fromAbsDay(start + 92);
  const end = seasonStart(after.year, after.month);
  const kFirst = Math.ceil((start - first) / cycle);
  const fulls = [];
  for (let j = kFirst; Math.floor(first + j * cycle) < end; j++) {
    if (Math.floor(first + j * cycle) >= start) fulls.push(j);
  }
  if (fulls.length >= 4 && fulls[2] === k) return "Spirit Moon";
  return FULL_MOON_NAMES[d.month];
}

/* ================================================================== */
/*  Sun: seasonal sunrise / sunset                                     */
/* ================================================================== */

function parseHM(str, fallback) {
  const m = /^\s*(\d{1,2})(?:[:.](\d{1,2}))?\s*$/.exec(String(str ?? ""));
  if (!m) return fallback;
  return Math.min(24, Number(m[1]) + Number(m[2] || 0) / 60);
}

/**
 * Sunrise / sunset (in hours) for an absolute day.
 * - "latitude": astronomical day length for the given latitude.
 * - "manual": interpolates between the summer and winter solstice times you set.
 * Summer solstice = 21 Sarenith, winter solstice = 21 Kuthona.
 */
export function sunTimes(abs) {
  const n = dayOfYear(abs);
  const twilight = Math.max(0, num("twilightMinutes")) / 60;
  let sunrise, sunset;

  if (S("sunMode") === "manual") {
    const f = (1 - Math.cos((2 * Math.PI * (n - 171)) / 365)) / 2; // 0 = summer solstice, 1 = winter
    sunrise = lerp(parseHM(S("summerSunrise"), 4.75), parseHM(S("winterSunrise"), 8), f);
    sunset = lerp(parseHM(S("summerSunset"), 20.25), parseHM(S("winterSunset"), 16.5), f);
  } else {
    const phi = (num("latitude") * Math.PI) / 180;
    const decl = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (n - 79)) / 365);
    const x = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(decl)));
    const len = (2 * (Math.acos(x) * 180) / Math.PI) / 15;
    const noon = parseHM(S("solarNoon"), 12);
    sunrise = noon - len / 2;
    sunset = noon + len / 2;
  }
  return { sunrise, sunset, twilight };
}

const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };

/**
 * Daylight factor: 0 = full night, 1 = full day.
 *
 * "gradual" (default): light builds up through the whole day.
 *   - Twilight before sunrise: night → "light at sunrise/sunset".
 *   - Sunrise → solar noon: keeps brightening up to full daylight.
 *   - Mirrored in the afternoon and evening.
 * "twilight": flat day and flat night, with only a short fade at dawn and dusk.
 */
export function daylight(hours, sun) {
  if (sun.sunset - sun.sunrise >= 24) return 1;
  if (sun.sunset - sun.sunrise <= 0) return 0;
  const T = Math.max(sun.twilight, 0.01);

  if (S("lightCurve") === "twilight") {
    const am = (hours - (sun.sunrise - T / 2)) / T;
    const pm = (sun.sunset + T / 2 - hours) / T;
    return smooth(Math.min(am, pm));
  }

  const horizon = clamp01(num("horizonLight"));
  if (hours <= sun.sunrise - T || hours >= sun.sunset + T) return 0;
  if (hours < sun.sunrise) return horizon * smooth((hours - (sun.sunrise - T)) / T);
  if (hours > sun.sunset) return horizon * smooth((sun.sunset + T - hours) / T);

  const noon = (sun.sunrise + sun.sunset) / 2;
  const x = clamp01(1 - Math.abs(hours - noon) / (noon - sun.sunrise)); // 0 at sunrise/sunset, 1 at noon
  const curve = Math.pow(Math.sin((Math.PI / 2) * x), Math.max(0.1, num("dayCurve")));
  return horizon + (1 - horizon) * curve;
}

export function timeOfDay(hours, sun) {
  const T = sun.twilight / 2;
  if (hours < sun.sunrise - T) return "Night";
  if (hours < sun.sunrise + T) return "Dawn";
  if (hours < 11) return "Morning";
  if (hours < 13 && hours < sun.sunset - T) return "Midday";
  if (hours < sun.sunset - T) return "Afternoon";
  if (hours < sun.sunset + T) return "Dusk";
  if (hours < 22) return "Evening";
  return "Night";
}

/** Target scene darkness (0..1) at an absolute time in seconds. */
export function targetDarkness(seconds) {
  const abs = Math.floor(seconds / DAY);
  const hours = (seconds - abs * DAY) / 3600;
  const light = daylight(hours, sunTimes(abs));
  const newMoon = num("darknessNewMoon");
  const night = S("moonLight") ? lerp(newMoon, num("darknessFullMoon"), moonPhase(seconds / DAY).illum) : newMoon;
  return clamp01(lerp(night, num("darknessDay"), light));
}

/* ================================================================== */
/*  World-time bridge                                                  */
/* ================================================================== */

function epochSeconds() {
  const e = S("epoch") ?? { year: 4710, month: 0, day: 1, offset: 0 };
  return toAbsDay(e.year, e.month, e.day) * DAY + (Number(e.offset) || 0);
}
function nowSeconds() { return epochSeconds() + game.time.worldTime; }

function dateFromSeconds(s) {
  const abs = Math.floor(s / DAY);
  const sec = s - abs * DAY;
  return { ...fromAbsDay(abs), abs, hours: sec / 3600, hour: Math.floor(sec / 3600), minute: Math.floor((sec % 3600) / 60) };
}
function currentDate() { return dateFromSeconds(nowSeconds()); }

const pad = n => String(n).padStart(2, "0");
const fmtHM = h => { const t = Math.round(mod(h, 24) * 60); return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`; };
/** Day number as set in "Day number format": 09th, 9th, 09 or 9. */
export function fmtDay(d) {
  const style = S("dayFormat") ?? "padOrdinal";
  const n = style.startsWith("pad") ? pad(d) : String(d);
  if (!style.endsWith("rdinal")) return n;
  const t = d % 100;
  const suffix = t >= 11 && t <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[d % 10] ?? "th");
  return n + suffix;
}
function fmtDate(c, weekdayName = true) {
  const wd = weekdayName ? `${WEEKDAYS[weekday(toAbsDay(c.year, c.month, c.day))]}, ` : "";
  return `${wd}${fmtDay(c.day)} ${MONTHS[c.month].name} ${c.year} AR`;
}

async function advanceTime(seconds) {
  if (!game.user.isGM) return ui.notifications.warn("Only the GM can change the time.");
  if (seconds) await game.time.advance(seconds);
}

/** Advance to the next occurrence of a time of day (in hours, or "sunrise"/"sunset"). */
async function jumpTo(target) {
  const now = nowSeconds();
  const today = Math.floor(now / DAY);
  for (let d = today; d <= today + 2; d++) {
    const sun = sunTimes(d);
    const h = target === "sunrise" ? sun.sunrise : target === "sunset" ? sun.sunset : Number(target);
    const t = d * DAY + Math.round(h * 3600);
    if (t > now + 30) return advanceTime(t - now);
  }
}

/** Set the date. moveWorldTime = true really advances time; false only relabels the calendar. */
async function setCurrentDateTime({ year, month, day, hour = 0, minute = 0 }, moveWorldTime = false) {
  if (!game.user.isGM) return;
  const target = toAbsDay(year, month, day) * DAY + hour * 3600 + minute * 60;
  if (moveWorldTime) return game.time.advance(target - nowSeconds());
  const newEpoch = target - game.time.worldTime;
  const abs = Math.floor(newEpoch / DAY);
  await game.settings.set(MODULE_ID, "epoch", { ...fromAbsDay(abs), offset: newEpoch - abs * DAY });
}

/* ================================================================== */
/*  Time buttons                                                       */
/* ================================================================== */

const UNITS = { m: 60, min: 60, h: 3600, d: DAY, w: 7 * DAY };

/** Parses "-1h, -10m, +10m, +1h, +8h, +1d, sunrise, noon, sunset, midnight". */
function parseButtons(str) {
  return String(str ?? "").split(",").map(s => s.trim()).filter(Boolean).map(tok => {
    const lower = tok.toLowerCase();
    const jumps = { sunrise: ["sunrise", "fa-sun", "Next sunrise"], sunset: ["sunset", "fa-moon", "Next sunset"],
      noon: ["12", "fa-circle-half-stroke", "Next noon"], midnight: ["0", "fa-star", "Next midnight"],
      dawn: ["sunrise", "fa-sun", "Next sunrise"], dusk: ["sunset", "fa-moon", "Next sunset"] };
    if (jumps[lower]) {
      const [target, icon, tip] = jumps[lower];
      return { jump: target, html: `<i class="fa-solid ${icon}"></i>`, tip };
    }
    const m = /^([+-]?)\s*(\d+(?:\.\d+)?)\s*(min|m|h|d|w)$/i.exec(tok);
    if (!m) return null;
    const unit = m[3].toLowerCase();
    const sign = m[1] === "-" ? -1 : 1;
    const label = `${sign < 0 ? "−" : "+"}${m[2]}${unit === "min" ? "m" : unit}`;
    return { seconds: sign * Number(m[2]) * UNITS[unit], html: label, tip: label };
  }).filter(Boolean);
}

function buttonsHTML(setting) {
  return parseButtons(S(setting)).map(b => b.jump
    ? `<button type="button" data-gc="jump" data-target="${b.jump}" aria-label="${b.tip}">${b.html}</button>`
    : `<button type="button" data-gc="adv" data-seconds="${b.seconds}" aria-label="${b.tip}">${b.html}</button>`
  ).join("");
}

/* ================================================================== */
/*  Notes (GM + players, player writes are relayed to the GM)          */
/* ================================================================== */

const getNotes = () => S("notes") ?? [];

function canSee(n, user = game.user) {
  if (user.isGM) return true;
  if (n.visibility === "all") return true;
  return n.visibility === "private" && n.author === user.id;
}
function canAdd(user = game.user) { return user.isGM || S("playerNotes") !== "none"; }
function canEdit(n, user = game.user) {
  if (user.isGM) return true;
  const mode = S("playerNotes");
  return mode === "all" || (mode === "own" && n.author === user.id);
}

function notesFor(y, m, d, user = game.user) {
  return getNotes().filter(n => {
    if (!canSee(n, user)) return false;
    if (n.repeat === "yearly") return n.month === m && n.day === d;
    if (n.repeat === "monthly") return n.day === d;
    return n.year === y && n.month === m && n.day === d;
  });
}

async function handleNoteOp(op, payload, userId) {
  const user = game.users.get(userId);
  if (!user) return;
  const notes = foundry.utils.deepClone(getNotes());
  const i = notes.findIndex(n => n.id === payload.id);

  if (op === "save") {
    if (!canAdd(user)) return;
    const note = { ...payload };
    if (!user.isGM && note.visibility === "gm") note.visibility = "private";
    if (i >= 0) {
      if (!canEdit(notes[i], user)) return;
      notes[i] = { ...note, author: notes[i].author };
    } else {
      notes.push({ ...note, id: note.id || foundry.utils.randomID(), author: userId });
    }
  } else if (op === "delete") {
    if (i < 0 || !canEdit(notes[i], user)) return;
    notes.splice(i, 1);
  } else return;

  await game.settings.set(MODULE_ID, "notes", notes);
}

function requestNoteOp(op, payload) {
  if (game.user.isGM) return handleNoteOp(op, payload, game.user.id);
  if (!game.users.activeGM) return ui.notifications.warn("A GM must be online to save calendar notes.");
  game.socket.emit(SOCKET, { op, payload, userId: game.user.id });
  ui.notifications.info("Note sent to the GM's calendar.");
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

function monthOptions(selected) {
  return MONTHS.map((m, i) => `<option value="${i}" ${i === selected ? "selected" : ""}>${m.name}</option>`).join("");
}

async function editNoteDialog(note) {
  const { DialogV2 } = foundry.applications.api;
  const isGM = game.user.isGM;
  const opt = (v, label, cur) => `<option value="${v}" ${cur === v ? "selected" : ""}>${label}</option>`;
  const visOptions = isGM
    ? opt("all", "Everyone", note.visibility) + opt("gm", "GM only", note.visibility)
    : opt("all", "Everyone", note.visibility) + opt("private", "Only me (and the GM)", note.visibility);
  const content = `
  <div class="gc-form">
    <label>Title <input name="title" type="text" value="${esc(note.title)}" autofocus></label>
    <label>Description <textarea name="body" rows="4">${esc(note.body)}</textarea></label>
    <div class="gc-form-row">
      <label>Day <input name="day" type="number" min="1" max="31" value="${note.day}"></label>
      <label>Month <select name="month">${monthOptions(note.month)}</select></label>
      <label>Year <input name="year" type="number" value="${note.year}"></label>
    </div>
    <div class="gc-form-row">
      <label>Repeats <select name="repeat">
        ${opt("none", "Never", note.repeat)}${opt("yearly", "Every year", note.repeat)}${opt("monthly", "Every month", note.repeat)}
      </select></label>
      <label>Visible to <select name="visibility">${visOptions}</select></label>
      <label>Color <input name="color" type="color" value="${esc(note.color || "#c9a227")}"></label>
    </div>
  </div>`;

  const data = await DialogV2.wait({
    window: { title: note.id ? "Edit Note" : "New Note", icon: "fa-solid fa-feather" },
    classes: ["golarion-calendar-dialog"],
    content,
    rejectClose: false,
    buttons: [
      {
        action: "save", label: "Save", icon: "fa-solid fa-check", default: true,
        callback: (event, button) => {
          const f = button.form.elements;
          return {
            title: f.title.value.trim() || "Untitled", body: f.body.value,
            day: Number(f.day.value) || 1, month: Number(f.month.value), year: Number(f.year.value),
            repeat: f.repeat.value, visibility: f.visibility.value, color: f.color.value
          };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ]
  });
  if (!data || typeof data !== "object") return;
  const max = data.repeat === "monthly" ? 31
    : data.repeat === "yearly" ? MONTHS[data.month].days + (MONTHS[data.month].leap ? 1 : 0)
    : monthDays(data.year, data.month);
  if (data.day < 1 || data.day > max) return ui.notifications.error(`${MONTHS[data.month].name} has only ${max} days.`);
  await requestNoteOp("save", { ...note, ...data, id: note.id || foundry.utils.randomID() });
}

async function setDateDialog(prefill) {
  const { DialogV2 } = foundry.applications.api;
  const c = prefill ?? currentDate();
  const content = `
  <div class="gc-form">
    <div class="gc-form-row">
      <label>Day <input name="day" type="number" min="1" max="31" value="${c.day}"></label>
      <label>Month <select name="month">${monthOptions(c.month)}</select></label>
      <label>Year (AR) <input name="year" type="number" value="${c.year}"></label>
    </div>
    <div class="gc-form-row">
      <label>Hour <input name="hour" type="number" min="0" max="23" value="${c.hour}"></label>
      <label>Minute <input name="minute" type="number" min="0" max="59" value="${c.minute}"></label>
    </div>
    <label class="gc-check"><input name="move" type="checkbox">
      <span>Advance world time instead of relabelling<br>
      <small>Leave off to just correct the date. Turn on if time really passes (spell and effect durations will tick).</small></span>
    </label>
  </div>`;
  const data = await DialogV2.wait({
    window: { title: "Set Date & Time", icon: "fa-solid fa-calendar-days" },
    classes: ["golarion-calendar-dialog"],
    content,
    rejectClose: false,
    buttons: [
      {
        action: "ok", label: "Set", icon: "fa-solid fa-check", default: true,
        callback: (event, button) => {
          const f = button.form.elements;
          return {
            day: Number(f.day.value), month: Number(f.month.value), year: Number(f.year.value),
            hour: Number(f.hour.value) || 0, minute: Number(f.minute.value) || 0, move: f.move.checked
          };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ]
  });
  if (!data || typeof data !== "object") return;
  const max = monthDays(data.year, data.month);
  if (data.day < 1 || data.day > max) return ui.notifications.error(`${MONTHS[data.month].name} ${data.year} has only ${max} days.`);
  await setCurrentDateTime(data, data.move);
}

/* ================================================================== */
/*  Widget colours                                                     */
/* ================================================================== */

const THEMES = {
  gold:      { label: "Gold (default)", accent: "#e0b94a", background: "#16120c", text: "#ece6d8" },
  silver:    { label: "Silver",         accent: "#c9d1dc", background: "#14171c", text: "#e8ecf1" },
  crimson:   { label: "Crimson",        accent: "#e0604f", background: "#1c0e0e", text: "#f0e2de" },
  emerald:   { label: "Emerald",        accent: "#5fc98a", background: "#0e1a14", text: "#e2efe6" },
  arcane:    { label: "Arcane purple",  accent: "#b18cf0", background: "#150f22", text: "#ebe4f7" },
  ocean:     { label: "Ocean blue",     accent: "#5ab4e0", background: "#0c161d", text: "#e0edf3" },
  parchment: { label: "Parchment (light)", accent: "#7a4b12", background: "#efe2c4", text: "#2b2116" },
  custom:    { label: "Custom (colours below)" }
};

function hexToRgb(hex, fallback = [0, 0, 0]) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (rgb, a) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;

function applyTheme(el = Widget.el) {
  if (!el) return;
  const key = S("theme") ?? "gold";
  const t = key === "custom"
    ? { accent: String(S("colorAccent")), background: String(S("colorBackground")), text: String(S("colorText")) }
    : THEMES[key] ?? THEMES.gold;
  const accent = hexToRgb(t.accent, [224, 185, 74]);
  const bg = hexToRgb(t.background, [22, 18, 12]);
  const text = hexToRgb(t.text, [236, 230, 216]);
  const opacity = Math.max(0.2, Math.min(1, num("bgOpacity") || 0.9));
  const vars = {
    "--gc-gold": rgba(accent, 1),
    "--gc-gold-dim": rgba(accent, 0.28),
    "--gc-border": rgba(accent, 0.55),
    "--gc-text": rgba(text, 1),
    "--gc-muted": rgba(text, 0.65),
    "--gc-line": rgba(text, 0.16),
    "--gc-tint": rgba(text, 0.07),
    "--gc-bg": rgba(bg, opacity)
  };
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
}

/* ================================================================== */
/*  Widget                                                             */
/* ================================================================== */

const Widget = {
  el: null,
  view: null,
  selected: null,

  get visible() {
    if (!S("showWidget")) return false;
    return game.user.isGM || S("showToPlayers");
  },

  get expanded() { return !!S("expanded"); },
  async setExpanded(v) {
    if (v) this.resetView();
    await game.settings.set(MODULE_ID, "expanded", !!v);
  },

  resetView() {
    const c = currentDate();
    this.view = { year: c.year, month: c.month };
    this.selected = c.abs;
  },

  timeText(c, sun) {
    const label = timeOfDay(c.hours, sun);
    if (game.user.isGM || S("playerTime") === "exact") return `${pad(c.hour)}:${pad(c.minute)} · ${label}`;
    return label;
  },

  render() {
    if (!this.visible) { this.el?.remove(); this.el = null; return; }
    if (!this.el) this.create();
    if (!this.view) this.resetView();

    const isGM = game.user.isGM;
    const c = currentDate();
    const sun = sunTimes(c.abs);
    const moon = moonPhase(nowSeconds() / DAY);
    const label = timeOfDay(c.hours, sun);
    const todays = notesFor(c.year, c.month, c.day);
    const expanded = this.expanded;

    this.el.classList.toggle("gc-expanded", expanded);
    this.el.classList.toggle("gc-is-gm", isGM);

    const eventBadge = todays.length
      ? `<span class="gc-w-event" data-tooltip="${esc(todays.map(n => n.title).join(", "))}"><i class="fa-solid fa-star"></i>${todays.length}</span>` : "";

    const showMoon = S("showMoonInWidget");
    const wdName = WEEKDAYS[weekday(c.abs)];
    let html = `
      <div class="gc-w-top">
        <i class="fa-solid ${TIME_ICONS[label]} gc-w-tod gc-tod-${label.toLowerCase()}"></i>
        <span class="gc-w-weekday">${S("showWeekday") ? wdName : MONTHS[c.month].season}</span>
        ${showMoon ? `<span class="gc-w-moon" data-tooltip="${esc(moon.label)} (${Math.round(moon.illum * 100)}%)">${moon.icon}</span>` : ""}
        <a class="gc-w-expand" data-gc="toggle"><i class="fa-solid fa-chevron-${expanded ? "up" : "down"}"></i></a>
      </div>
      <div class="gc-w-date">${fmtDay(c.day)} ${MONTHS[c.month].name}</div>
      <div class="gc-w-year">${c.year} AR</div>
      <div class="gc-w-time">${this.timeText(c, sun)}${eventBadge}</div>`;

    if (isGM) html += `<div class="gc-w-buttons">${buttonsHTML("buttons")}</div>`;
    if (expanded) html += this.calendarHTML(c);

    this.el.innerHTML = html;
    this.clampToScreen();
  },

  calendarHTML(now) {
    const isGM = game.user.isGM;
    const { year, month } = this.view;
    const M = MONTHS[month];
    const firstAbs = toAbsDay(year, month, 1);
    const startWd = weekday(firstAbs);
    const dim = monthDays(year, month);
    const moonMode = S("calendarMoons");

    let cells = "";
    for (let i = 0; i < startWd; i++) cells += `<div class="gc-cell gc-empty"></div>`;
    for (let d = 1; d <= dim; d++) {
      const abs = firstAbs + d - 1;
      const notes = notesFor(year, month, d);
      const moon = moonPhase(abs + 0.5);
      const cls = ["gc-cell", "gc-day"];
      if (abs === now.abs) cls.push("gc-today");
      if (abs === this.selected) cls.push("gc-selected");
      const showMoon = moonMode === "all" || (moonMode === "major" && moon.idx % 2 === 0);
      const moonIcon = showMoon ? `<span class="gc-moon">${moon.icon}</span>` : "";
      const dots = notes.slice(0, 4).map(n => `<i class="gc-dot" style="background:${esc(n.color || "#c9a227")}"></i>`).join("");
      const tip = [moon.label, ...notes.map(n => n.title)].map(esc).join(" · ");
      cells += `<div class="${cls.join(" ")}" data-gc="select" data-abs="${abs}" data-tooltip="${tip}">
        <span class="gc-num">${d}</span>${moonIcon}<div class="gc-dots">${dots}</div></div>`;
    }
    const trailing = (7 - ((startWd + dim) % 7)) % 7;
    for (let i = 0; i < trailing; i++) cells += `<div class="gc-cell gc-empty"></div>`;

    // Selected day
    const sel = fromAbsDay(this.selected);
    const selMoon = moonPhase(this.selected + 0.5);
    const selSun = sunTimes(this.selected);
    const selNotes = notesFor(sel.year, sel.month, sel.day);
    const authorName = id => game.users.get(id)?.name ?? "";
    const notesHTML = selNotes.length ? selNotes.map(n => `
      <li class="gc-note" style="--note-color:${esc(n.color || "#c9a227")}">
        <div class="gc-note-head">
          <strong>${esc(n.title)}</strong>
          ${n.visibility === "gm" ? `<i class="fa-solid fa-eye-slash" data-tooltip="GM only"></i>` : ""}
          ${n.visibility === "private" ? `<i class="fa-solid fa-lock" data-tooltip="Private"></i>` : ""}
          ${n.repeat !== "none" ? `<i class="fa-solid fa-repeat" data-tooltip="Repeats ${n.repeat === "yearly" ? "every year" : "every month"}"></i>` : ""}
          ${canEdit(n) ? `<span class="gc-note-controls">
            <a data-gc="editNote" data-id="${n.id}" data-tooltip="Edit"><i class="fa-solid fa-pen"></i></a>
            <a data-gc="deleteNote" data-id="${n.id}" data-tooltip="Delete"><i class="fa-solid fa-trash"></i></a>
          </span>` : ""}
        </div>
        ${n.body ? `<div class="gc-note-body">${esc(n.body).replace(/\n/g, "<br>")}</div>` : ""}
        ${S("showAuthor") && authorName(n.author) ? `<div class="gc-note-author">— ${esc(authorName(n.author))}</div>` : ""}
      </li>`).join("") : `<li class="gc-none">No notes.</li>`;

    const sunLine = S("showSunTimes")
      ? `<span><i class="fa-solid fa-sun"></i> ${fmtHM(selSun.sunrise)} – <i class="fa-solid fa-moon"></i> ${fmtHM(selSun.sunset)}</span>` : "";

    return `
    <div class="gc-cal">
      <header class="gc-header">
        <a data-gc="prevYear" data-tooltip="Previous year"><i class="fa-solid fa-angles-left"></i></a>
        <a data-gc="prevMonth" data-tooltip="Previous month"><i class="fa-solid fa-angle-left"></i></a>
        <div class="gc-title">
          <div class="gc-month">${M.name} ${year} AR</div>
          <div class="gc-sub">${M.deity} · ${M.season}${M.leap && isLeap(year) ? " · Leap year" : ""}</div>
        </div>
        <a data-gc="nextMonth" data-tooltip="Next month"><i class="fa-solid fa-angle-right"></i></a>
        <a data-gc="nextYear" data-tooltip="Next year"><i class="fa-solid fa-angles-right"></i></a>
      </header>
      <div class="gc-grid">
        ${WEEKDAYS.map(w => `<div class="gc-wd" data-tooltip="${w}">${w.slice(0, 2)}</div>`).join("")}
        ${cells}
      </div>
      <div class="gc-panel">
        <div class="gc-panel-head">
          <strong>${fmtDate(sel)}</strong>
          ${sel.year !== now.year || sel.month !== now.month || sel.day !== now.day ? `<a data-gc="today" data-tooltip="Back to today"><i class="fa-solid fa-location-crosshairs"></i></a>` : ""}
        </div>
        <div class="gc-panel-info">
          <span>${selMoon.icon} ${esc(selMoon.label)} (${Math.round(selMoon.illum * 100)}%)</span>${sunLine}
        </div>
        <ul class="gc-notes">${notesHTML}</ul>
        <div class="gc-panel-buttons">
          ${canAdd() ? `<button type="button" data-gc="addNote"><i class="fa-solid fa-plus"></i> Add note</button>` : ""}
          ${isGM && this.selected !== now.abs ? `<button type="button" data-gc="makeToday"><i class="fa-solid fa-calendar-check"></i> Make today</button>` : ""}
          ${isGM ? `<button type="button" data-gc="setDate"><i class="fa-solid fa-clock"></i> Set…</button>` : ""}
        </div>
      </div>
    </div>`;
  },

  create() {
    const el = document.createElement("div");
    el.id = "golarion-calendar-widget";
    document.body.append(el);
    this.el = el;
    const pos = S("widgetPos") ?? {};
    el.style.left = `${pos.left ?? Math.max(8, window.innerWidth / 2 - 140)}px`;
    el.style.top = `${pos.top ?? 8}px`;
    el.style.setProperty("--gc-scale", String(num("widgetScale") || 1));
    applyTheme(el);

    el.addEventListener("click", ev => this.onClick(ev));
    el.addEventListener("pointerdown", ev => this.onDragStart(ev));
  },

  shiftMonth(delta) {
    let { year: y, month: m } = this.view;
    m += delta;
    while (m < 0) { m += 12; y--; }
    while (m > 11) { m -= 12; y++; }
    this.view = { year: y, month: m };
    this.render();
  },

  async onClick(ev) {
    const t = ev.target.closest("[data-gc]");
    if (!t) return;
    const invert = ev.shiftKey && S("shiftInverts") ? -1 : 1;
    switch (t.dataset.gc) {
      case "toggle": return this.setExpanded(!this.expanded);
      case "adv": return advanceTime(Number(t.dataset.seconds) * invert);
      case "jump": return jumpTo(t.dataset.target);
      case "prevMonth": return this.shiftMonth(-1);
      case "nextMonth": return this.shiftMonth(1);
      case "prevYear": this.view.year--; return this.render();
      case "nextYear": this.view.year++; return this.render();
      case "today": this.resetView(); return this.render();
      case "select": this.selected = Number(t.dataset.abs); return this.render();
      case "addNote":
        return editNoteDialog({ title: "", body: "", ...fromAbsDay(this.selected), repeat: "none",
          visibility: game.user.isGM ? S("gmNoteDefault") : S("playerNoteDefault"), color: "#c9a227" });
      case "editNote": {
        const note = getNotes().find(n => n.id === t.dataset.id);
        return note && editNoteDialog(foundry.utils.deepClone(note));
      }
      case "deleteNote": {
        const note = getNotes().find(n => n.id === t.dataset.id);
        if (!note) return;
        const ok = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Delete Note" }, content: `<p>Delete <strong>${esc(note.title)}</strong>?</p>`
        });
        return ok && requestNoteOp("delete", { id: note.id });
      }
      case "makeToday": {
        const c = currentDate();
        return setDateDialog({ ...fromAbsDay(this.selected), hour: c.hour, minute: c.minute });
      }
      case "setDate": return setDateDialog();
    }
  },

  /** Drag from anywhere. A drag only starts after the pointer moves a few pixels, so clicks still work. */
  onDragStart(ev) {
    if (ev.button !== 0) return;
    if (ev.target.closest("input, textarea, select, .gc-notes")) return;
    const el = this.el;
    const startX = ev.clientX;
    const startY = ev.clientY;
    const dx = startX - el.offsetLeft;
    const dy = startY - el.offsetTop;
    let dragging = false;

    const move = e => {
      if (!dragging) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 5) return;
        dragging = true;
        el.classList.add("gc-dragging");
      }
      el.style.left = `${e.clientX - dx}px`;
      el.style.top = `${e.clientY - dy}px`;
      this.clampToScreen();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!dragging) return;
      el.classList.remove("gc-dragging");
      // Swallow the click that follows a drag so it doesn't press a button.
      const block = e => { e.stopPropagation(); e.preventDefault(); };
      el.addEventListener("click", block, { capture: true, once: true });
      setTimeout(() => el.removeEventListener("click", block, { capture: true }), 0);
      game.settings.set(MODULE_ID, "widgetPos", { left: el.offsetLeft, top: el.offsetTop });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  },

  clampToScreen() {
    const el = this.el;
    if (!el) return;
    const maxL = Math.max(0, window.innerWidth - el.offsetWidth);
    const maxT = Math.max(0, window.innerHeight - el.offsetHeight);
    el.style.left = `${Math.min(Math.max(0, el.offsetLeft), maxL)}px`;
    el.style.top = `${Math.min(Math.max(0, el.offsetTop), maxT)}px`;
  }
};

/* ================================================================== */
/*  Scene lighting                                                     */
/* ================================================================== */

function sceneUsesAutoLight(scene) {
  if (!scene) return false;
  const flag = scene.getFlag(MODULE_ID, "autoLight");
  return S("lightingScope") === "all" ? flag !== false : flag === true;
}

/**
 * Updates are debounced so several quick button clicks become one update.
 * Small steps (the normal case as time ticks along) are applied instantly,
 * because Foundry shows a "Transitioning…" notification for every animated
 * darkness change. Only jumps at least as big as the "animate" threshold
 * get the animated transition.
 */
let lightingTimer = null;
let lightingRunning = false;
let lightingPending = null;

function applyLighting({ animate = true } = {}) {
  clearTimeout(lightingTimer);
  lightingTimer = setTimeout(() => runLighting({ animate }), animate ? 300 : 0);
}

async function runLighting({ animate }) {
  if (!S("autoLighting")) return;
  if (!game.users.activeGM?.isSelf) return;
  if (lightingRunning) { lightingPending = { animate }; return; }
  lightingRunning = true;
  try {
    const target = Math.round(targetDarkness(nowSeconds()) * 1000) / 1000;
    const scenes = new Set([game.scenes.active, canvas?.scene].filter(Boolean));
    for (const scene of scenes) {
      if (!sceneUsesAutoLight(scene)) continue;
      if (scene.environment?.darknessLock) continue;
      const path = foundry.utils.hasProperty(scene, "environment.darknessLevel") ? "environment.darknessLevel" : "darkness";
      const current = Number(foundry.utils.getProperty(scene, path)) || 0;
      const delta = Math.abs(current - target);
      if (delta < 0.005) continue;
      const ms = animate && num("transitionMs") > 0 && delta >= num("animateThreshold") ? num("transitionMs") : 0;
      await scene.update({ [path]: target }, { animateDarkness: ms });
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Could not update scene darkness`, err);
  } finally {
    lightingRunning = false;
    if (lightingPending) {
      const next = lightingPending;
      lightingPending = null;
      runLighting(next);
    }
  }
}

/* ================================================================== */
/*  Refresh                                                            */
/* ================================================================== */

function refreshAll() {
  if (!game.ready) return;
  Widget.render();
  applyLighting();
}

/* ================================================================== */
/*  Settings registration                                              */
/* ================================================================== */

function registerSettings() {
  const reg = (key, data) => game.settings.register(MODULE_ID, key, { config: true, ...data });
  const world = (key, data) => reg(key, { scope: "world", onChange: refreshAll, ...data });
  const client = (key, data) => reg(key, { scope: "client", onChange: () => Widget.render(), ...data });
  const hidden = (key, data) => game.settings.register(MODULE_ID, key, { config: false, ...data });

  // --- Calendar -----------------------------------------------------
  world("leapInterval", {
    name: "Calendar: Leap year rule",
    hint: "How often Calistril gets a 29th day. Pathfinder 2e / Lost Omens: every 4 years. Pathfinder 1e: every 8 years.",
    type: Number, default: 4, choices: { 4: "Every 4 years (PF2e / Lost Omens)", 8: "Every 8 years (PF1e)" }
  });
  world("dayFormat", {
    name: "Calendar: Day number format",
    hint: "How the day of the month is written in the widget, day panel and chat.",
    type: String, default: "padOrdinal",
    choices: { padOrdinal: "09th Gozran", ordinal: "9th Gozran", pad: "09 Gozran", plain: "9 Gozran" }
  });
  world("weekdayShift", {
    name: "Calendar: Weekday correction",
    hint: "Shift every weekday by this many days if your source names a different weekday for a date. 0 = 1 Abadius 4724 AR is a Moonday.",
    type: Number, default: 0, range: { min: 0, max: 6, step: 1 }
  });
  world("announceDay", {
    name: "Calendar: Announce new days in chat",
    hint: "When the date changes, post the new date, moon phase, sunrise/sunset and that day's notes to chat. GM-only notes are whispered to the GM.",
    type: Boolean, default: true
  });

  // --- Widget -------------------------------------------------------
  client("showWidget", { name: "Widget: Show widget", hint: "Show the date & time widget on your screen.", type: Boolean, default: true });
  world("showToPlayers", { name: "Widget: Show to players", hint: "If off, only the GM sees the widget.", type: Boolean, default: true });
  world("playerTime", {
    name: "Widget: Time shown to players",
    hint: "Players can see the exact clock time, or only the part of day (Dawn, Morning, Dusk…).",
    type: String, default: "exact", choices: { exact: "Exact time", label: "Part of day only" }
  });
  world("buttons", {
    name: "Widget: Time buttons (GM)",
    hint: "Comma-separated list. Amounts: -1h, +10m, +8h, +1d, +1w (m = minutes, h = hours, d = days, w = weeks; minus goes back). Jumps: sunrise, noon, sunset, midnight.",
    type: String, default: "-1h, -10m, +10m, +1h, +8h, +1d, sunrise, sunset"
  });
  world("shiftInverts", {
    name: "Widget: Shift-click reverses a button",
    hint: "Holding Shift while clicking a time button moves time the other way.",
    type: Boolean, default: true
  });
  client("showWeekday", { name: "Widget: Show weekday", type: Boolean, default: true });
  client("showMoonInWidget", { name: "Widget: Show moon phase", type: Boolean, default: true });
  client("widgetScale", {
    name: "Widget: Size", hint: "Scale of the widget on your screen.",
    type: Number, default: 1, range: { min: 0.7, max: 1.5, step: 0.05 },
    onChange: v => { Widget.el?.style.setProperty("--gc-scale", String(v)); Widget.render(); }
  });
  const themeChange = () => { applyTheme(); Widget.render(); };
  client("theme", {
    name: "Widget: Colour theme",
    hint: "Colour scheme of the widget on your screen. Pick Custom to use the three colours below.",
    type: String, default: "gold",
    choices: Object.fromEntries(Object.entries(THEMES).map(([k, v]) => [k, v.label])),
    onChange: themeChange
  });
  client("colorAccent", { name: "Widget: Custom accent colour", hint: "Date, border and highlights (Custom theme).",
    type: (foundry.data?.fields?.ColorField ? new foundry.data.fields.ColorField() : String), default: "#e0b94a", onChange: themeChange });
  client("colorBackground", { name: "Widget: Custom background colour", hint: "Custom theme.",
    type: (foundry.data?.fields?.ColorField ? new foundry.data.fields.ColorField() : String), default: "#16120c", onChange: themeChange });
  client("colorText", { name: "Widget: Custom text colour", hint: "Custom theme.",
    type: (foundry.data?.fields?.ColorField ? new foundry.data.fields.ColorField() : String), default: "#ece6d8", onChange: themeChange });
  client("bgOpacity", { name: "Widget: Background opacity", hint: "Lower = more see-through. Applies to every theme.",
    type: Number, default: 0.9, range: { min: 0.2, max: 1, step: 0.05 }, onChange: themeChange });
  client("calendarMoons", {
    name: "Widget: Moon icons in month view",
    type: String, default: "major",
    choices: { none: "None", major: "New, quarter and full moons", all: "Every day" }
  });
  client("showSunTimes", { name: "Widget: Show sunrise/sunset for the selected day", type: Boolean, default: true });

  // --- Notes --------------------------------------------------------
  world("playerNotes", {
    name: "Notes: Player permissions",
    hint: "What players may do with calendar notes. A GM must be online for player notes to be saved.",
    type: String, default: "own",
    choices: { none: "Players can't add notes", own: "Add notes, edit/delete their own", all: "Add, edit and delete any visible note" }
  });
  world("playerNoteDefault", {
    name: "Notes: Default visibility of player notes",
    type: String, default: "all", choices: { all: "Everyone", private: "Only the author (and the GM)" }
  });
  world("gmNoteDefault", {
    name: "Notes: Default visibility of GM notes",
    type: String, default: "all", choices: { all: "Everyone", gm: "GM only" }
  });
  world("showAuthor", { name: "Notes: Show author", hint: "Show who wrote each note.", type: Boolean, default: true });

  // --- Moon ---------------------------------------------------------
  world("moonCycle", {
    name: "Moon: Cycle length (days)",
    hint: "Days from new moon to new moon. Golarion's moon follows Earth's: 29.53.",
    type: Number, default: 29.530588853, range: { min: 5, max: 60, step: 0.01 }
  });
  world("fullMoonNames", {
    name: "Moon: Golarion full moon names",
    hint: "Call full moons by their Golarion names (Long Moon, Fated Moon, … Harvest Moon, Hunter's Moon; Spirit Moon for the extra one in a season).",
    type: Boolean, default: true
  });
  world("moonOffset", {
    name: "Moon: Phase offset (days)",
    hint: "Shift all moon phases forward/back if your source puts a full moon on a different date.",
    type: Number, default: 0, range: { min: -15, max: 15, step: 0.5 }
  });

  // --- Sun ----------------------------------------------------------
  world("sunMode", {
    name: "Sun: Sunrise/sunset mode",
    hint: "Latitude: realistic day length from the latitude below. Manual: your own solstice times, smoothly blended through the year. Solstices: 21 Sarenith and 21 Kuthona.",
    type: String, default: "latitude", choices: { latitude: "From latitude", manual: "Manual solstice times" }
  });
  world("latitude", {
    name: "Sun: Latitude (°N)",
    hint: "Used in Latitude mode. Higher = longer summer days and shorter winter days. 48 ≈ Central Europe.",
    type: Number, default: 48, range: { min: 0, max: 66, step: 1 }
  });
  world("solarNoon", {
    name: "Sun: Solar noon (HH:MM)", hint: "Used in Latitude mode. The time the sun is highest.",
    type: String, default: "12:00"
  });
  world("summerSunrise", { name: "Sun: Summer solstice sunrise (HH:MM)", hint: "Manual mode.", type: String, default: "04:45" });
  world("summerSunset", { name: "Sun: Summer solstice sunset (HH:MM)", hint: "Manual mode.", type: String, default: "20:15" });
  world("winterSunrise", { name: "Sun: Winter solstice sunrise (HH:MM)", hint: "Manual mode.", type: String, default: "08:00" });
  world("winterSunset", { name: "Sun: Winter solstice sunset (HH:MM)", hint: "Manual mode.", type: String, default: "16:30" });
  world("twilightMinutes", {
    name: "Sun: Twilight length (minutes)",
    hint: "How long dawn and dusk last. Light fades smoothly over this time, centred on sunrise/sunset.",
    type: Number, default: 60, range: { min: 0, max: 180, step: 5 }
  });

  // --- Lighting -----------------------------------------------------
  world("autoLighting", {
    name: "Lighting: Automatic scene darkness",
    hint: "Adjusts the darkness of the active and viewed scene to the time of day.",
    type: Boolean, default: true
  });
  world("lightingScope", {
    name: "Lighting: Which scenes",
    hint: "All scenes, except ones you switch off — or only scenes you switch on. Use the sun/moon toggle in the Lighting controls to switch a scene on or off. Scenes with locked darkness are never changed.",
    type: String, default: "all", choices: { all: "All scenes (opt-out)", optin: "Only scenes I enable (opt-in)" }
  });
  world("darknessDay", {
    name: "Lighting: Daytime darkness", hint: "0 = fully lit.",
    type: Number, default: 0, range: { min: 0, max: 1, step: 0.05 }
  });
  world("darknessNewMoon", {
    name: "Lighting: Night darkness (new moon)", hint: "Darkness on a moonless night. 1 = pitch black.",
    type: Number, default: 1, range: { min: 0, max: 1, step: 0.05 }
  });
  world("darknessFullMoon", {
    name: "Lighting: Night darkness (full moon)", hint: "Darkness under a full moon. Other phases blend between this and the new-moon value.",
    type: Number, default: 0.7, range: { min: 0, max: 1, step: 0.05 }
  });
  world("moonLight", {
    name: "Lighting: Moon affects night darkness",
    hint: "If off, every night uses the new-moon darkness.",
    type: Boolean, default: true
  });
  world("lightCurve", {
    name: "Lighting: Darkness curve",
    hint: "Gradual: the scene keeps brightening from dawn until noon and darkens again until dusk ends. Twilight only: flat day and night with a short fade at sunrise and sunset.",
    type: String, default: "gradual", choices: { gradual: "Gradual through the day", twilight: "Twilight only" }
  });
  world("horizonLight", {
    name: "Lighting: Light at sunrise/sunset",
    hint: "Gradual curve only. How bright it is at the moment of sunrise and sunset (0 = as dark as night, 1 = full daylight). Lower = longer, dimmer mornings and evenings.",
    type: Number, default: 0.4, range: { min: 0, max: 1, step: 0.05 }
  });
  world("dayCurve", {
    name: "Lighting: Midday sharpness",
    hint: "Gradual curve only. 1 = natural. Lower values reach full daylight early in the morning; higher values keep it dimmer and save full brightness for midday.",
    type: Number, default: 1, range: { min: 0.3, max: 3, step: 0.1 }
  });
  world("transitionMs", {
    name: "Lighting: Animation duration for big jumps (ms)",
    hint: "When the darkness jumps a lot at once (e.g. skipping several hours), the change animates over this time. 0 = never animate.",
    type: Number, default: 2000, range: { min: 0, max: 10000, step: 250 }
  });
  world("animateThreshold", {
    name: "Lighting: Animate changes larger than",
    hint: "Darkness changes smaller than this are applied instantly (no 'Transitioning…' banner). 1 = never animate.",
    type: Number, default: 0.25, range: { min: 0, max: 1, step: 0.05 }
  });

  // --- Hidden -------------------------------------------------------
  hidden("epoch", { scope: "world", type: Object, default: { year: 4710, month: 0, day: 1, offset: 0 }, onChange: refreshAll });
  hidden("notes", { scope: "world", type: Array, default: [], onChange: () => Widget.render() });
  hidden("widgetPos", { scope: "client", type: Object, default: {} });
  hidden("expanded", { scope: "client", type: Boolean, default: false, onChange: () => Widget.render() });
}

/* ================================================================== */
/*  Hooks                                                              */
/* ================================================================== */

Hooks.once("init", () => {
  registerSettings();
  game.keybindings.register(MODULE_ID, "toggle", {
    name: "Expand / collapse the Golarion Calendar",
    editable: [],
    onDown: () => { Widget.setExpanded(!Widget.expanded); return true; }
  });
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET, data => {
    if (!game.users.activeGM?.isSelf) return;
    if (data?.op) handleNoteOp(data.op, data.payload ?? {}, data.userId);
  });

  Widget.render();
  applyLighting({ animate: false });
  window.addEventListener("resize", () => Widget.clampToScreen());

  game.modules.get(MODULE_ID).api = {
    now: currentDate,
    format: () => { const c = currentDate(); return `${fmtDate(c)} ${pad(c.hour)}:${pad(c.minute)}`; },
    advance: advanceTime,
    jumpTo,
    setDate: setCurrentDateTime,
    sunTimes, moonPhase, targetDarkness, toAbsDay, fromAbsDay,
    applyLighting,
    expand: v => Widget.setExpanded(v ?? true),
    MONTHS, WEEKDAYS
  };
});

Hooks.on("canvasReady", () => applyLighting({ animate: false }));

Hooks.on("updateWorldTime", (worldTime, delta) => {
  refreshAll();
  if (!game.users.activeGM?.isSelf || !S("announceDay")) return;

  const e = epochSeconds();
  const before = Math.floor((e + worldTime - delta) / DAY);
  const after = Math.floor((e + worldTime) / DAY);
  if (before === after) return;

  const c = currentDate();
  const moon = moonPhase(after + 0.5);
  const sun = sunTimes(after);
  const all = notesFor(c.year, c.month, c.day, { isGM: true, id: game.user.id });
  const pub = all.filter(n => n.visibility === "all");
  const gm = all.filter(n => n.visibility === "gm");
  const list = ns => `<ul>${ns.map(n => `<li><strong>${esc(n.title)}</strong>${n.body ? ` — ${esc(n.body)}` : ""}</li>`).join("")}</ul>`;

  ChatMessage.create({
    speaker: { alias: "Golarion Calendar" },
    content: `<div class="gc-chat"><h3><i class="fa-solid fa-calendar-days"></i> ${fmtDate(c)}</h3>
      <p>${MONTHS[c.month].season} · ${moon.icon} ${esc(moon.label)} · <i class="fa-solid fa-sun"></i> ${fmtHM(sun.sunrise)} – <i class="fa-solid fa-moon"></i> ${fmtHM(sun.sunset)}</p>
      ${pub.length ? list(pub) : ""}</div>`
  });
  if (gm.length) {
    ChatMessage.create({
      speaker: { alias: "Golarion Calendar" },
      whisper: game.users.filter(u => u.isGM).map(u => u.id),
      content: `<div class="gc-chat"><h3><i class="fa-solid fa-eye-slash"></i> GM notes today</h3>${list(gm)}</div>`
    });
  }
});

Hooks.on("getSceneControlButtons", controls => {
  try {
    const tokens = controls.tokens ?? controls.token;
    if (tokens?.tools) {
      tokens.tools.golarionCalendar = {
        name: "golarionCalendar",
        title: "Golarion Calendar",
        icon: "fa-solid fa-calendar-days",
        order: Object.keys(tokens.tools).length,
        button: true,
        visible: true,
        onChange: () => {
          if (!S("showWidget")) game.settings.set(MODULE_ID, "showWidget", true);
          Widget.setExpanded(!Widget.expanded);
        }
      };
    }

    const lighting = controls.lighting;
    if (lighting?.tools && game.user.isGM && S("autoLighting")) {
      lighting.tools.golarionAutoLight = {
        name: "golarionAutoLight",
        title: "Golarion Calendar: automatic darkness for this scene",
        icon: "fa-solid fa-circle-half-stroke",
        order: Object.keys(lighting.tools).length,
        toggle: true,
        visible: true,
        active: sceneUsesAutoLight(canvas?.scene),
        onChange: async (event, active) => {
          const scene = canvas?.scene;
          if (!scene) return;
          await scene.setFlag(MODULE_ID, "autoLight", !!active);
          if (active) applyLighting();
          ui.notifications.info(`Automatic darkness ${active ? "enabled" : "disabled"} for ${scene.name}.`);
        }
      };
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not add scene control buttons`, err);
  }
});
