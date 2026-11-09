// Schedule grid under the calendar
import { hub } from "./registry.js";
import {
  $,
  DAYS,
  ICON,
  S,
  SVG,
  catIdx,
  dayDoc,
  dkey,
  esc,
  fmtDate,
  isWeekend,
  isoDay,
  keyDow,
  pad,
  routineIcon,
  todayKey,
} from "./core.js";
import { STATE_TXT, fmtMins, itemState, routineFor, timerElapsed, toMin } from "./today.js";
import { longRange } from "./reports.js";

// ---------- schedule grid (bottom of Calendar): what you did, by time
try {
  S.schMode = localStorage.getItem("daybook-sch") || (innerWidth < 700 ? "day" : "week");
} catch {
  S.schMode = "week";
}
const minsOfISO = (iso) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};
function schKeys() {
  if (S.schMode === "day") return [S.calSel];
  const [y, m, d] = S.calSel.split("-").map(Number),
    dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  const out = [];
  for (let i = 0; i < 7; i++) {
    out.push(dkey(dt));
    dt.setDate(dt.getDate() + 1);
  }
  return out;
}
function dayEvents(k) {
  const ev = [],
    tk = todayKey();
  routineFor(k).forEach((r) =>
    ev.push({ kind: "rt", st: itemState(r, k), start: toMin(r.time), dur: 20, title: r.label, r }),
  );
  S.time
    .filter((x) => x.date === k)
    .forEach((x) => {
      const task = x.type === "task" ? S.tasks.find((y) => y.id === x.ref) : null;
      ev.push({
        kind: "time",
        start: minsOfISO(x.start),
        dur: Math.max(+x.mins || 1, 1),
        title: x.label || (x.type === "course" ? "Study" : "Focus"),
        mins: +x.mins || 0,
        cls:
          x.type === "task"
            ? "cat-" + catIdx(task ? task.category : "")
            : x.type === "course"
              ? "ev-course"
              : "ev-focus",
        ref: task ? task.id : null,
        via: x.via,
        type: x.type,
      });
    });
  if (S.timer && isoDay(S.timer.start) === k && k === tk) {
    const T = S.timer,
      task = T.type === "task" ? S.tasks.find((y) => y.id === T.ref) : null;
    ev.push({
      kind: "time",
      live: true,
      start: minsOfISO(T.start),
      dur: Math.max(1, timerElapsed() / 60),
      title: T.label,
      mins: Math.round(timerElapsed() / 60),
      cls:
        T.type === "task" ? "cat-" + catIdx(task ? task.category : "") : T.type === "course" ? "ev-course" : "ev-focus",
      ref: task ? task.id : null,
      via: T.mode,
    });
  }
  S.tasks
    .filter((t) => t.status === "done" && isoDay(t.doneAt) === k)
    .forEach((t) =>
      ev.push({
        kind: "tdone",
        start: minsOfISO(t.doneAt),
        dur: 20,
        title: t.title,
        cls: "cat-" + catIdx(t.category),
        ref: t.id,
      }),
    );
  S.todos
    .filter((t) => t.done && isoDay(t.doneAt) === k)
    .forEach((t) => ev.push({ kind: "odone", start: minsOfISO(t.doneAt), dur: 20, title: t.title }));
  const rf = S.refl[k];
  if (rf && rf.updatedAt && isoDay(rf.updatedAt) === k)
    ev.push({ kind: "refl", start: minsOfISO(rf.updatedAt), dur: 20, title: "Reflection", date: k });
  return ev;
}
function layoutEvents(ev, lo, ppm) {
  const items = ev
    .map((e) => {
      const top = (e.start - lo) * ppm,
        h = Math.max(e.dur * ppm, 22);
      return { ...e, top, h, bot: top + h };
    })
    .sort((a, b) => a.top - b.top || b.h - a.h);
  let cluster = [],
    clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    cluster.forEach((it) => {
      let i = lanes.findIndex((end) => end <= it.top + 0.5);
      if (i < 0) {
        i = lanes.length;
        lanes.push(0);
      }
      lanes[i] = it.bot;
      it.lane = i;
    });
    cluster.forEach((it) => (it.lanes = lanes.length));
    cluster = [];
  };
  for (const it of items) {
    if (cluster.length && it.top >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.bot);
  }
  if (cluster.length) flush();
  return items;
}
const hm = (m) => pad(Math.floor(m / 60) % 24) + ":" + pad(Math.round(m % 60));
function evHtml(e, k) {
  const style = `top:${e.top.toFixed(1)}px;height:${e.h.toFixed(1)}px;left:calc(${((e.lane / e.lanes) * 100).toFixed(2)}% + 2px);width:calc(${(100 / e.lanes).toFixed(2)}% - 4px)`;
  const tall = e.h >= 40;
  if (e.kind === "rt")
    return `<button type="button" class="ev ev-rt s-${e.st}" style="${style}" data-cdate="${esc(k)}" title="${esc(e.r.time)} ${esc(e.title)} · ${STATE_TXT[e.st]}">${routineIcon(e.r)}<span class="ev-t">${esc(e.title)}</span></button>`;
  if (e.kind === "time")
    return `<div class="ev ev-time ${e.cls} ${e.live ? "live" : ""}" style="${style}" ${e.ref ? `data-task="${esc(e.ref)}"` : ""} title="${esc(e.title)} · ${fmtMins(e.mins)} (${hm(e.start)}–${hm(e.start + e.dur)})"><span class="ev-t">${SVG(ICON.timer)}${esc(e.title)}</span>${tall ? `<span class="ev-s">${e.live ? "Running · " : ""}${fmtMins(e.mins)} · ${hm(e.start)}–${hm(e.start + e.dur)}${e.via === "focus" ? " · focus" : ""}</span>` : ""}</div>`;
  if (e.kind === "class")
    return `<div class="ev ev-class ${hub.subjCls(e.c.subj)}" style="${style}" title="${esc((hub.subj(e.c.subj) || {}).name || e.title)} · ${hub.fmt12(e.c.start)}–${hub.fmt12(e.c.end)}${hub.clsLoc(e.c) ? " · " + esc(hub.clsLoc(e.c)) : ""}"><span class="ev-t">${SVG(ICON.class)}${esc(e.title)}</span>${tall ? `<span class="ev-s">${esc((hub.CLS_TYPES.find((x) => x[0] === e.c.type) || ["", ""])[1])}${hub.clsLoc(e.c) ? " · " + esc(hub.clsLoc(e.c)) : ""}</span>` : ""}</div>`;
  if (e.kind === "tdone")
    return `<div class="ev ev-done ${e.cls}" style="${style}" data-task="${esc(e.ref)}" title="Finished at ${hm(e.start)}: ${esc(e.title)}"><span class="ev-t">${SVG(ICON.star)}${esc(e.title)}</span></div>`;
  if (e.kind === "odone")
    return `<div class="ev ev-todo" style="${style}" title="To-do done at ${hm(e.start)}: ${esc(e.title)}"><span class="ev-t">✓ ${esc(e.title)}</span></div>`;
  if (e.kind === "refl")
    return `<button type="button" class="ev ev-refl" style="${style}" data-calrefl="${esc(e.date)}" title="Reflection written at ${hm(e.start)}"><span class="ev-t">${SVG(ICON.note)}Reflection</span></button>`;
  return "";
}
function renderSchedule() {
  const box = $("#sched");
  if (!box) return;
  const keys = schKeys(),
    tk = todayKey(),
    day = S.schMode === "day";
  const evs = keys.map((k) => dayEvents(k));
  const flat = evs.flat();
  let lo = Math.min(6 * 60, ...flat.map((e) => e.start)),
    hi = Math.max(23 * 60, ...flat.map((e) => e.start + e.dur));
  lo = Math.floor(lo / 60) * 60;
  hi = Math.min(24 * 60, Math.ceil(hi / 60) * 60);
  const ppm = day ? 1.1 : 0.85,
    H = (hi - lo) * ppm;
  const label = day
    ? `${DAYS[keyDow(keys[0])]}, ${fmtDate(keys[0]).split(", ")[1]} ${keys[0].slice(0, 4)}`
    : longRange(keys[0], keys[6]);
  const hours = [];
  for (let m = lo; m < hi; m += 60)
    hours.push(
      `<span style="top:${((m - lo) * ppm).toFixed(1)}px">${m === lo ? "" : pad(Math.floor(m / 60)) + ":00"}</span>`,
    );
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const dues = (k) => S.tasks.filter((t) => t.due === k && t.status !== "done");
  const adues = (k) => [];
  const anyDue = keys.some((k) => dues(k).length || adues(k).length);
  const totals = (k) => {
    const m = S.time.filter((x) => x.date === k).reduce((a, x) => a + (+x.mins || 0), 0);
    const its = routineFor(k).filter((r) => !(dayDoc(k).skip || {})[r.id]);
    const dn = its.filter((r) => (dayDoc(k).done || {})[r.id]).length;
    return { m, dn, n: its.length };
  };
  box.innerHTML = `
  <div class="sch-head">
    <div class="sch-title"><h2>Schedule</h2><span class="muted small">${esc(label)}</span></div>
    <div class="sch-ctrl"><button class="btn sm" type="button" data-schnav="-1" aria-label="Previous">‹</button><button class="btn sm ghost" type="button" data-schtoday>Today</button><button class="btn sm" type="button" data-schnav="1" aria-label="Next">›</button>
      <div class="seg"><button type="button" data-sch="day" aria-pressed="${day}">Day</button><button type="button" data-sch="week" aria-pressed="${!day}">Week</button></div></div>
  </div>
  <div class="sch-scroll" id="sch-scroll">
    <div class="sch-grid" style="--cols:${keys.length}">
      <div class="sch-hd sch-corner"></div>
      ${keys
        .map((k) => {
          const t = totals(k);
          return `<button type="button" class="sch-hd ${k === tk ? "is-today" : ""} ${k === S.calSel && !day ? "is-sel" : ""}" data-cdate="${esc(k)}"><span class="sch-dow">${DAYS[keyDow(k)]}</span><span class="sch-num">${+k.slice(8)}</span><span class="sch-sum">${k <= tk && k >= hub.startKey() ? `${t.dn}/${t.n}${t.m ? " · " + fmtMins(t.m) : ""}` : "&nbsp;"}</span></button>`;
        })
        .join("")}
      ${
        anyDue
          ? `<div class="sch-ad-lbl">Due</div>${keys
              .map(
                (k) =>
                  `<div class="sch-ad">${dues(k)
                    .map(
                      (t) =>
                        `<div class="ev-due cat-${catIdx(t.category)}" data-task="${esc(t.id)}" title="Due: ${esc(t.title)}">${esc(t.title)}</div>`,
                    )
                    .join("")}${adues(k)
                    .map(
                      (a) =>
                        `<a class="ev-due ${hub.subjCls(a.subj)}" href="#study-assignments" title="Due${a.time ? " " + hub.fmt12(a.time) : ""}: ${esc(hub.subjLabel(a.subj))} ${esc(a.title)}">${esc(hub.subjLabel(a.subj))}: ${esc(a.title)}</a>`,
                    )
                    .join("")}</div>`,
              )
              .join("")}`
          : ""
      }
      <div class="sch-times" style="height:${H}px">${hours.join("")}</div>
      ${keys
        .map(
          (
            k,
            i,
          ) => `<div class="sch-col ${k === tk ? "is-today" : ""} ${isWeekend(keyDow(k)) ? "is-we" : ""}" style="height:${H}px;--hr:${60 * ppm}px">
        ${layoutEvents(evs[i], lo, ppm)
          .map((e) => evHtml(e, k))
          .join("")}
        ${k === tk && nowM >= lo && nowM <= hi ? `<b class="sch-now" style="top:${((nowM - lo) * ppm).toFixed(1)}px"></b>` : ""}</div>`,
        )
        .join("")}
    </div>
  </div>
  <div class="tl-legend sch-legend"><span><i class="lg lg-rt s-done"></i>Routine done</span><span><i class="lg lg-rt s-late"></i>Not ticked / missed</span><span><i class="lg lg-rt s-todo"></i>Upcoming</span><span><i class="lg lg-time"></i>Time worked</span><span><i class="lg lg-done"></i>Task finished</span><span><i class="lg lg-refl"></i>Reflection</span></div>`;
  if (!renderSchedule._scrolled) {
    renderSchedule._scrolled = true;
    const sc = $("#sch-scroll");
    const target = keys.includes(tk) ? Math.max(0, (nowM - lo) * ppm - 160) : (7 * 60 - lo) * ppm;
    sc.scrollTop = target;
  }
}
document.addEventListener("click", (e) => {
  const m = e.target.closest("[data-sch]");
  if (m) {
    S.schMode = m.dataset.sch;
    try {
      localStorage.setItem("daybook-sch", S.schMode);
    } catch {}
    renderSchedule._scrolled = false;
    renderSchedule();
    return;
  }
  const n = e.target.closest("[data-schnav]");
  if (n) {
    const [y, mo, d] = S.calSel.split("-").map(Number);
    const dt = new Date(y, mo - 1, d);
    dt.setDate(dt.getDate() + +n.dataset.schnav * (S.schMode === "day" ? 1 : 7));
    S.calSel = dkey(dt);
    S.calY = dt.getFullYear();
    S.calM = dt.getMonth();
    hub.renderCalendar();
    return;
  }
  if (e.target.closest("[data-schtoday]")) {
    const d = new Date();
    S.calSel = todayKey();
    S.calY = d.getFullYear();
    S.calM = d.getMonth();
    renderSchedule._scrolled = false;
    hub.renderCalendar();
    return;
  }
});

export { hm, minsOfISO, renderSchedule };
