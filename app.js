// Simple calendar. Events are saved in this browser (localStorage), no account or server needed.
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

let events = {};
try { events = JSON.parse(localStorage.getItem("cal:events")) || {}; } catch {}
const save = () => { try { localStorage.setItem("cal:events", JSON.stringify(events)); } catch {} };

const now = new Date();
let view = new Date(now.getFullYear(), now.getMonth(), 1);
let selected = keyOf(now);

function renderGrid() {
  $("title").textContent = view.toLocaleDateString([], { month: "long", year: "numeric" });
  const y = view.getFullYear(), m = view.getMonth(), todayKey = keyOf(new Date());
  const start = new Date(y, m, 1 - new Date(y, m, 1).getDay()); // Sunday on or before the 1st
  let html = [...Array(7)].map((_, i) => `<div class="dow">${new Date(2023, 0, 1 + i).toLocaleDateString([], { weekday: "narrow" })}</div>`).join("");
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), k = keyOf(d);
    if (i >= 35 && d.getMonth() !== m) break; // skip a fully empty 6th row
    const n = Math.min((events[k] || []).length, 3);
    html += `<button class="cell${d.getMonth() !== m ? " out" : ""}${k === selected ? " sel" : ""}${k === todayKey ? " today" : ""}" data-k="${k}"
      aria-label="${d.toDateString()}${n ? ", has events" : ""}">${d.getDate()}<span class="dots">${"<i></i>".repeat(n)}</span></button>`;
  }
  $("grid").innerHTML = html;
}

function renderDay() {
  const [y, mo, da] = selected.split("-").map(Number);
  $("day-title").textContent = new Date(y, mo - 1, da).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const list = (events[selected] || []).slice().sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  $("list").innerHTML = list.length ? list.map((e) =>
    `<li><span class="t">${e.time || "All day"}</span><span class="n"></span><button data-id="${e.id}" aria-label="Delete event">✕</button></li>`).join("")
    : `<li class="empty">No events</li>`;
  $("list").querySelectorAll(".n").forEach((el, i) => (el.textContent = list[i].title)); // textContent avoids HTML injection
}

const render = () => { renderGrid(); renderDay(); };

$("grid").addEventListener("click", (e) => {
  const c = e.target.closest(".cell"); if (!c) return;
  selected = c.dataset.k;
  const [y, m] = selected.split("-").map(Number);
  if (m - 1 !== view.getMonth()) view = new Date(y, m - 1, 1);
  render();
});
$("prev").onclick = () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); };
$("next").onclick = () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); };
$("today").onclick = () => { const t = new Date(); view = new Date(t.getFullYear(), t.getMonth(), 1); selected = keyOf(t); render(); };

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

// Light / dark / auto
const MODES = ["auto", "light", "dark"], ICON = { auto: "🌓", light: "☀️", dark: "🌙" };
const sys = matchMedia("(prefers-color-scheme: dark)");
let mode = "auto";
try { mode = localStorage.getItem("cal:mode") || "auto"; } catch {}
function applyMode() {
  document.documentElement.classList.toggle("dark", mode === "dark" || (mode === "auto" && sys.matches));
  $("theme").textContent = ICON[mode]; $("theme").title = "Theme: " + mode;
}
$("theme").onclick = () => { mode = MODES[(MODES.indexOf(mode) + 1) % 3]; try { localStorage.setItem("cal:mode", mode); } catch {} applyMode(); };
sys.addEventListener("change", applyMode);

applyMode(); render();
