// Work calendar
import { hub } from "./registry.js";
import {
  $,
  DAYS,
  DAY_BACK,
  S,
  STATUS_LABEL,
  catTag,
  dayDoc,
  dkey,
  esc,
  fmtDate,
  fmtTime,
  isWeekend,
  isoDay,
  keyDow,
  pad,
  routineIcon,
  todayKey,
} from "./core.js";
import { routineFor } from "./today.js";
import { renderSchedule } from "./schedule.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  renderCalendar: { get: () => renderCalendar, enumerable: true },
});

// ---------- calendar
S.calY = new Date().getFullYear();
S.calM = new Date().getMonth();
S.calSel = todayKey();
const loadedMonths = new Set();
function loadMonth(y, m) {
  const key = y + "-" + m;
  if (!hub.db || loadedMonths.has(key)) return;
  loadedMonths.add(key);
  const a = dkey(new Date(y, m, 1)),
    b = dkey(new Date(y, m + 1, 0));
  hub.db
    .collection("checks")
    .where("date", ">=", a)
    .where("date", "<=", b)
    .get()
    .then((s) => {
      s.docs.forEach((d) => {
        if (!S.day[d.id]) {
          const x = d.data();
          S.day[d.id] = { done: x.done || {}, skip: x.skip || {}, extra: x.extra || [] };
        }
      });
      if (S.view === "calendar") renderCalendar();
    })
    .catch((e) => {
      loadedMonths.delete(key);
      console.error(e);
    });
  hub.db
    .collection("reflections")
    .where("date", ">=", a)
    .where("date", "<=", b)
    .get()
    .then((s) => {
      s.docs.forEach((d) => {
        if (!S.refl[d.id]) S.refl[d.id] = d.data();
      });
      if (S.view === "calendar") renderCalendar();
    })
    .catch((e) => {
      loadedMonths.delete(key);
      console.error(e);
    });
}
function dayInfo(k) {
  const tk = todayKey(),
    dd = dayDoc(k),
    skip = dd.skip || {},
    done = dd.done || {};
  const items = routineFor(k).filter((r) => !skip[r.id]);
  const hasRec = !!S.day[k];
  const rDone = items.filter((r) => done[r.id]).length;
  const pct = k <= tk && hasRec && items.length ? Math.round((rDone / items.length) * 100) : null;
  const todos = S.todos.filter((t) => t.date === k || (t.done && isoDay(t.doneAt) === k));
  const todosDone = S.todos.filter((t) => t.done && isoDay(t.doneAt) === k);
  const due = S.tasks.filter((t) => t.due === k);
  const updates = S.tasks
    .map((t) => ({ t, e: (t.log || []).filter((l) => isoDay(l.at) === k && l.note !== "Task added") }))
    .filter((x) => x.e.length);
  const added = S.tasks.filter((t) => isoDay(t.createdAt) === k);
  const finished = S.tasks.filter((t) => t.status === "done" && isoDay(t.doneAt) === k);
  return { k, dd, items, rDone, pct, todos, todosDone, due, updates, added, finished, refl: S.refl[k] };
}
function renderCalendar() {
  const y = S.calY,
    m = S.calM,
    tk = todayKey();
  loadMonth(y, m);
  $("#cal-title").textContent = new Date(y, m, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
  const first = new Date(y, m, 1),
    lead = (first.getDay() + 6) % 7,
    nDays = new Date(y, m + 1, 0).getDate();
  let h = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    .map((d) => `<span class="cal-dow">${d.slice(0, 1)}<span class="dow-rest">${d.slice(1)}</span></span>`)
    .join("");
  for (let i = 0; i < lead; i++) h += `<span class="cal-blank"></span>`;
  for (let d = 1; d <= nDays; d++) {
    const k = dkey(new Date(y, m, d)),
      I = dayInfo(k),
      we = isWeekend(keyDow(k));
    const doneN = I.todosDone.length + I.finished.length;
    const dueOpen = I.due.filter((t) => t.status !== "done").length;
    const pc = I.pct;
    const bar =
      pc === null
        ? ""
        : `<span class="cal-bar"><i style="width:${pc}%;background:${pc >= 80 ? "var(--ok)" : pc >= 50 ? "var(--med)" : "var(--crit)"}"></i></span>`;
    const marks =
      (I.refl ? `<i class="mk mk-refl" title="Reflection written"></i>` : "") +
      (I.updates.length || I.finished.length || I.added.length
        ? `<i class="mk mk-work" title="Work activity"></i>`
        : "") +
      (dueOpen ? `<i class="mk mk-due" title="Task due"></i>` : "");
    h += `<button type="button" class="cal-day ${k === tk ? "is-today" : ""} ${k === S.calSel ? "is-sel" : ""} ${we ? "is-we" : ""} ${k > tk ? "is-future" : ""}" data-cdate="${k}" aria-label="${esc(fmtDate(k))}" aria-pressed="${k === S.calSel}">
      <span class="cal-n">${d}</span>${doneN ? `<span class="cal-c">✓${doneN}</span>` : ""}<span class="cal-marks">${marks}</span>${bar}</button>`;
  }
  $("#cal-grid").innerHTML = h;
  renderCalDay();
  renderSchedule();
}
function renderCalDay() {
  const k = S.calSel,
    I = dayInfo(k),
    tk = todayKey(),
    off = Math.round((new Date(k + "T00:00") - new Date(tk + "T00:00")) / 864e5);
  const done = I.dd.done || {},
    skip = I.dd.skip || {};
  const sec = (title, body, meta = "") =>
    `<div class="cd-sec"><div class="sechead"><h3>${title}</h3><span class="meta">${meta}</span></div>${body}</div>`;
  const none = (t) => `<p class="muted small" style="margin:0">${t}</p>`;
  const all = routineFor(k);
  const routineHtml = all.length
    ? `<ul class="cd-list">${all
        .map((r) => {
          const st = skip[r.id]
            ? "skip"
            : done[r.id]
              ? "done"
              : k < tk || (k === tk && r.time < pad(new Date().getHours()) + ":" + pad(new Date().getMinutes()))
                ? "miss"
                : "todo";
          return `<li class="cd-${st}"><span class="tm">${esc(r.time)}</span><span class="cd-lbl">${routineIcon(r)}${esc(r.label)}</span><span class="cd-st">${st === "done" ? "✓ " + esc(done[r.id]) : st === "skip" ? "Skipped" : st === "miss" ? "Not ticked" : ""}</span></li>`;
        })
        .join("")}</ul>`
    : none("No routine items.");
  const todoHtml = I.todos.length
    ? `<ul class="cd-list">${I.todos.map((t) => `<li class="${t.done ? "cd-done" : ""}"><span>${t.done ? "✓" : "○"}</span><span>${esc(t.title)}</span><span class="cd-st">${t.done ? "Done " + fmtTime(t.doneAt) : t.date < tk ? "Not done" : ""}</span></li>`).join("")}</ul>`
    : none("No to-dos for this day.");
  const workBits = [];
  I.finished.forEach((t) =>
    workBits.push(
      `<li data-task="${esc(t.id)}"><span class="st done">Finished</span><span>${esc(t.title)}</span></li>`,
    ),
  );
  I.due
    .filter((t) => t.status !== "done")
    .forEach((t) =>
      workBits.push(
        `<li data-task="${esc(t.id)}"><span class="urg ${esc(t.urgency)}">Due</span><span>${esc(t.title)} <span class="muted small">· ${esc(STATUS_LABEL[t.status])} ${+t.progress || 0}%</span></span></li>`,
      ),
    );
  I.updates
    .filter((x) => !I.finished.includes(x.t))
    .forEach((x) =>
      workBits.push(
        `<li data-task="${esc(x.t.id)}">${catTag(x.t.category)}<span><b>${esc(x.t.title)}</b>: ${x.e.map((e) => esc(e.note)).join("; ")}</span></li>`,
      ),
    );
  I.added
    .filter((t) => !I.updates.some((x) => x.t === t) && !I.finished.includes(t) && !I.due.includes(t))
    .forEach((t) =>
      workBits.push(`<li data-task="${esc(t.id)}"><span class="tag">New</span><span>${esc(t.title)}</span></li>`),
    );
  const workHtml = workBits.length
    ? `<ul class="cd-list cd-work">${workBits.join("")}</ul>`
    : none("No work activity or deadlines.");
  const r = I.refl;
  const reflHtml =
    r && (r.did || r.learned || r.mistakes || r.improve)
      ? `<dl class="cd-refl">${[
          ["Did", r.did],
          ["Learned", r.learned],
          ["Mistakes", r.mistakes],
          ["Improve", r.improve],
        ]
          .filter((x) => (x[1] || "").trim())
          .map(([a, b]) => `<dt>${a}</dt><dd>${esc(b)}</dd>`)
          .join("")}${r.mood ? `<dt>Energy</dt><dd>${r.mood}/5</dd>` : ""}</dl>`
      : none(k <= tk ? "No reflection written for this day." : "Reflection opens on the day.");
  $("#cal-day").innerHTML = `<div class="panel cd">
    <div class="sechead" style="align-items:center"><h2>${esc(DAYS[keyDow(k)])}, ${esc(fmtDate(k).split(", ")[1])} ${k.slice(0, 4)}</h2>
      <span style="display:flex;gap:6px;flex-wrap:wrap">${off >= -DAY_BACK && off <= 6 ? `<button class="btn sm" type="button" data-calopen="${off}">${off < 0 ? "Edit routine" : "Open in Today"}</button>` : ""}${k <= tk ? `<button class="btn sm" type="button" data-calrefl="${k}">${r ? "Edit reflection" : "Write reflection"}</button>` : ""}</span></div>
    ${sec("Work", workHtml)}
    ${sec("Reflection", reflHtml)}
    ${sec("To-dos", todoHtml)}
    ${sec((isWeekend(keyDow(k)) ? "Weekend" : "Weekday") + " routine", routineHtml, I.pct !== null ? `${I.rDone} of ${I.items.length} done` : "")}
  </div>`;
}
document.addEventListener("click", (e) => {
  const c = e.target.closest("[data-cdate]");
  if (c) {
    S.calSel = c.dataset.cdate;
    renderCalendar();
    return;
  }
  const m = e.target.closest("[data-calm]");
  if (m) {
    const d = new Date(S.calY, S.calM + +m.dataset.calm, 1);
    S.calY = d.getFullYear();
    S.calM = d.getMonth();
    renderCalendar();
    return;
  }
  if (e.target.closest("[data-caltoday]")) {
    const d = new Date();
    S.calY = d.getFullYear();
    S.calM = d.getMonth();
    S.calSel = todayKey();
    renderCalendar();
    return;
  }
  const o = e.target.closest("[data-calopen]");
  if (o) {
    S.dayOff = +o.dataset.calopen;
    hub.watchChecks();
    location.hash = "#today";
    return;
  }
  const rf = e.target.closest("[data-calrefl]");
  if (rf) {
    hub.rDate = rf.dataset.calrefl;
    hub.rDirty = false;
    location.hash = "#reflect";
    return;
  }
});
