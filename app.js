// Calendar with holidays and red weekends. Events are saved in this browser (localStorage).
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

/* ---------- Holidays ---------- */
// India: built in (no free key-less API covers it). Fixed-date holidays work for any year;
// festival dates are listed for 2026-2027 (central government list). Moon-based dates can shift by a day.
const IN_FIXED = { "01-26": "Republic Day", "08-15": "Independence Day", "10-02": "Gandhi Jayanti", "12-25": "Christmas" };
const IN_MOVING = {
  2026: { "03-04": "Holi", "03-21": "Id-ul-Fitr (tentative)", "03-26": "Ram Navami", "03-31": "Mahavir Jayanti", "04-03": "Good Friday",
    "05-01": "Buddha Purnima", "05-27": "Bakrid (tentative)", "06-26": "Muharram (tentative)", "08-26": "Milad-un-Nabi (tentative)",
    "09-04": "Janmashtami", "10-20": "Dussehra", "11-08": "Diwali", "11-24": "Guru Nanak Jayanti" },
  2027: { "03-10": "Id-ul-Fitr (tentative)", "03-23": "Holi", "03-26": "Good Friday", "05-17": "Bakrid (tentative)",
    "06-16": "Muharram (tentative)", "10-09": "Dussehra", "10-29": "Diwali", "11-14": "Guru Nanak Jayanti" }
};
const indiaHolidays = (y) => Object.fromEntries(Object.entries({ ...IN_FIXED, ...(IN_MOVING[y] || {}) }).map(([md, n]) => [`${y}-${md}`, n]));

let country = read("cal:country", "IN");
const hol = {}; // "IN-2026" -> { "2026-01-26": "Republic Day" }

async function ensureYear(y) {
  const k = `${country}-${y}`;
  if (country === "NONE" || hol[k]) return;
  if (country === "IN") { hol[k] = indiaHolidays(y); return; }
  try { // other countries: Nager.Date (free, no key)
    const j = await (await fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/${country}`)).json();
    if (!Array.isArray(j)) throw 0;
    const o = {}; j.forEach((h) => (o[h.date] = o[h.date] ? o[h.date] + " / " + h.name : h.name));
    hol[k] = o;
  } catch {}
}
async function loadHols() {
  const y = view.getFullYear(), m = view.getMonth(), ys = new Set([y, +selected.slice(0, 4)]);
  if (m === 0) ys.add(y - 1); if (m === 11) ys.add(y + 1);
  await Promise.all([...ys].map(ensureYear));
}
const holidayOf = (k) => (hol[`${country}-${k.slice(0, 4)}`] || {})[k];

/* ---------- State ---------- */
let events = {};
try { events = JSON.parse(read("cal:events", "{}")) || {}; } catch {}
const save = () => write("cal:events", JSON.stringify(events));
const now = new Date();
let view = new Date(now.getFullYear(), now.getMonth(), 1);
let selected = keyOf(now);

/* ---------- Render ---------- */
function renderGrid() {
  $("title").textContent = view.toLocaleDateString([], { month: "long", year: "numeric" });
  const y = view.getFullYear(), m = view.getMonth(), todayKey = keyOf(new Date());
  const start = new Date(y, m, 1 - new Date(y, m, 1).getDay());
  let html = [...Array(7)].map((_, i) => `<div class="dow${i === 0 || i === 6 ? " wk" : ""}">${new Date(2023, 0, 1 + i).toLocaleDateString([], { weekday: "narrow" })}</div>`).join("");
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), k = keyOf(d);
    if (i >= 35 && d.getMonth() !== m) break;
    const h = holidayOf(k), n = (events[k] || []).length, wk = d.getDay() === 0 || d.getDay() === 6;
    const dots = (h ? '<i class="h"></i>' : "") + "<i></i>".repeat(Math.min(n, h ? 2 : 3));
    html += `<button class="cell${d.getMonth() !== m ? " out" : ""}${k === selected ? " sel" : ""}${k === todayKey ? " today" : ""}${wk ? " wk" : ""}${h ? " hol" : ""}" data-k="${k}"
      aria-label="${d.toDateString()}${h ? ", " + esc(h) : ""}${n ? ", has events" : ""}">${d.getDate()}<span class="dots">${dots}</span></button>`;
  }
  $("grid").innerHTML = html;
}

function renderMonthHols() {
  const y = view.getFullYear(), m = view.getMonth(), days = new Date(y, m + 1, 0).getDate(), items = [];
  for (let d = 1; d <= days; d++) {
    const k = `${y}-${pad(m + 1)}-${pad(d)}`, h = holidayOf(k);
    if (h) items.push(`<li><button data-k="${k}"><span class="d">${new Date(y, m, d).toLocaleDateString([], { weekday: "short", day: "numeric" })}</span><span class="n">${esc(h)}</span></button></li>`);
  }
  $("hols").hidden = country === "NONE";
  $("hol-list").innerHTML = items.join("") || `<li class="note">No holidays listed this month.</li>`;
  $("hol-note").textContent = country === "IN" && !IN_MOVING[y] ? "Festival dates for this year aren't added yet. Only fixed-date holidays are shown." : "";
}

// Days off = Saturdays + Sundays + holidays that fall on weekdays (a weekend holiday is counted once)
function renderOff() {
  const y = view.getFullYear(), m = view.getMonth(), days = new Date(y, m + 1, 0).getDate();
  let sat = 0, sun = 0, hd = 0, hw = 0;
  for (let d = 1; d <= days; d++) {
    const dow = new Date(y, m, d).getDay(), h = holidayOf(`${y}-${pad(m + 1)}-${pad(d)}`);
    if (dow === 6) sat++; else if (dow === 0) sun++; else if (h) hd++;
    if (h && (dow === 0 || dow === 6)) hw++;
  }
  const notes = [];
  if (hw) notes.push(`${hw} holiday${hw > 1 ? "s fall" : " falls"} on a weekend and ${hw > 1 ? "are" : "is"} counted once.`);
  if (country === "IN" && !IN_MOVING[y]) notes.push("Festival dates for this year aren't added, so the holiday count may be low.");
  $("off").innerHTML = `<div class="off-main"><b>${sat + sun + hd}</b><span>days off in ${view.toLocaleDateString([], { month: "long" })}</span></div>
    <div class="off-parts"><div><b>${sat}</b><span>Saturdays</span></div><div><b>${sun}</b><span>Sundays</span></div><div><b>${hd}</b><span>Weekday holidays</span></div></div>`
    + notes.map((n) => `<p class="note">${n}</p>`).join("");
}

function renderDay() {
  const [y, mo, da] = selected.split("-").map(Number);
  $("day-title").textContent = new Date(y, mo - 1, da).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const h = holidayOf(selected);
  $("day-hol").hidden = !h; $("day-hol").textContent = h ? "🎉 " + h : "";
  const list = (events[selected] || []).slice().sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  $("list").innerHTML = list.length ? list.map((e) =>
    `<li><span class="t">${e.time || "All day"}</span><span class="n"></span><button data-id="${e.id}" aria-label="Delete event">✕</button></li>`).join("")
    : `<li class="empty">No events</li>`;
  $("list").querySelectorAll(".n").forEach((el, i) => (el.textContent = list[i].title));
}

const render = () => { renderGrid(); renderOff(); renderMonthHols(); renderDay(); };
const refresh = () => { render(); loadHols().then(render); };

/* ---------- Events ---------- */
function pick(k) {
  selected = k;
  const [y, m] = k.split("-").map(Number);
  if (m - 1 !== view.getMonth() || y !== view.getFullYear()) view = new Date(y, m - 1, 1);
  refresh();
}
$("grid").addEventListener("click", (e) => { const c = e.target.closest(".cell"); if (c) pick(c.dataset.k); });
$("hol-list").addEventListener("click", (e) => { const b = e.target.closest("button[data-k]"); if (b) pick(b.dataset.k); });
$("prev").onclick = () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); refresh(); };
$("next").onclick = () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); refresh(); };
$("today").onclick = () => pick(keyOf(new Date()));
$("country").value = country;
$("country").onchange = (e) => { country = e.target.value; write("cal:country", country); refresh(); };

$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = $("ev-title").value.trim(); if (!title) return;
  (events[selected] ||= []).push({ id: Date.now(), title, time: $("ev-time").value });
  save(); e.target.reset(); render();
});
$("list").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]"); if (!b) return;
  events[selected] = events[selected].filter((x) => String(x.id) !== b.dataset.id);
  if (!events[selected].length) delete events[selected];
  save(); render();
});

/* ---------- Light / dark / auto ---------- */
const MODES = ["auto", "light", "dark"], ICON = { auto: "🌓", light: "☀️", dark: "🌙" };
const sys = matchMedia("(prefers-color-scheme: dark)");
let mode = read("cal:mode", "auto");
function applyMode() {
  document.documentElement.classList.toggle("dark", mode === "dark" || (mode === "auto" && sys.matches));
  $("theme").textContent = ICON[mode]; $("theme").title = "Theme: " + mode;
}
$("theme").onclick = () => { mode = MODES[(MODES.indexOf(mode) + 1) % 3]; write("cal:mode", mode); applyMode(); };
sys.addEventListener("change", applyMode);

applyMode(); refresh();
