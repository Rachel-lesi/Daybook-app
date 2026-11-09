// Today: rendering, routine timeline and routine editing from Today
import { hub } from "./registry.js";
import {
  $,
  DAYS,
  DAY_BACK,
  ICON,
  KINDS,
  S,
  STATUS,
  STATUS_LABEL,
  SVG,
  URG_RANK,
  catName,
  catTag,
  dayDoc,
  esc,
  fmtDate,
  fmtTime,
  greeting,
  isWeekend,
  isoDay,
  keyDow,
  newId,
  pad,
  ring,
  routineIcon,
  toast,
  todayKey,
  viewKey,
  write,
} from "./core.js";
import { VIEWS, renderNav } from "./nav.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  render: { get: () => render, enumerable: true },
});

// ---------- render
function render() {
  $("#today-label").textContent = fmtDate(todayKey()) + " " + new Date().getFullYear();
  for (const v of VIEWS) {
    $("#v-" + v).hidden = v !== S.view;
  }
  renderNav();
  if (S.view === "today") renderToday();
  if (S.view === "work") renderWork();
  if (S.view === "calendar") hub.renderCalendar();
  if (S.view === "overview") hub.renderOverview();
  if (S.view === "growth") hub.renderGrowth();
  if (S.view === "health") hub.renderHealth();
  if (S.view === "money") hub.renderMoney();
  if (S.view === "study") hub.renderStudy();
  if (S.view === "reflect") hub.renderReport();
  else if (typeof hub.autoSaveReports === "function") hub.autoSaveReports();
  if (S.view === "today") hub.renderFocus();
  hub.tickTimer();
  if (S.view === "reflect") hub.renderReflect();
  if (S.view === "routine") hub.renderRoutine();
}
const sortTasks = (arr) =>
  arr
    .slice()
    .sort(
      (a, b) =>
        (a.status === "done") - (b.status === "done") ||
        (b.status === "blocked") - (a.status === "blocked") ||
        URG_RANK[a.urgency] - URG_RANK[b.urgency] ||
        (a.due || "9999").localeCompare(b.due || "9999"),
    );
const REPEAT = [
  ["none", "Doesn't repeat"],
  ["daily", "Every day"],
  ["weekdays", "Every weekday"],
  ["weekly", "Every week"],
  ["monthly", "Every month"],
];
const REPEAT_SHORT = { daily: "Daily", weekdays: "Weekdays", weekly: "Weekly", monthly: "Monthly" };
function fmtMins(m) {
  m = Math.round(m || 0);
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60),
    r = m % 60;
  return h + "h" + (r ? " " + r + "m" : "");
}
function clock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600),
    m = Math.floor((sec % 3600) / 60),
    s = sec % 60;
  return (h ? h + ":" + pad(m) : m) + ":" + pad(s);
}
const timerElapsed = () => (S.timer ? (Date.now() - new Date(S.timer.start).getTime()) / 1000 : 0);
function taskMins(id) {
  return S.time.filter((x) => x.ref === id).reduce((a, x) => a + (+x.mins || 0), 0);
}
function taskCard(t) {
  const over = t.due && t.status !== "done" && t.due < todayKey();
  const subs = t.subtasks || [],
    sd = subs.filter((s) => s.done).length;
  const running = S.timer && S.timer.type === "task" && S.timer.ref === t.id;
  const mins = taskMins(t.id);
  return `<div class="task ${t.status === "done" ? "isdone" : ""}" data-u="${esc(t.urgency)}" data-task="${esc(t.id)}" role="button" tabindex="0">
    <span class="sw-act" aria-hidden="true">${SVG(ICON.trash)}<span>Delete</span></span><span class="stripe"></span><span class="body">
      <span class="ttl-row"><span class="ttl">${esc(t.title)}</span>${t.status !== "done" ? `<button type="button" class="tbtn ${running ? "on" : ""}" data-timer="${esc(t.id)}" aria-label="${running ? "Stop timer" : "Start timer"} for ${esc(t.title)}">${SVG(running ? ICON.stop : ICON.play)}<span ${running ? "data-live" : ""}>${running ? clock(timerElapsed()) : mins ? fmtMins(mins) : ""}</span></button>` : mins ? `<span class="tdone-time">${SVG(ICON.timer)}${fmtMins(mins)}</span>` : ""}</span>
      <span class="line"><span class="urg ${esc(t.urgency)}">${esc(t.urgency)}</span>${catTag(t.category)}
        <span class="st ${esc(t.status)}">${esc(STATUS_LABEL[t.status] || t.status)}</span>
        ${t.due ? `<span class="${over ? "overdue" : ""}">${over ? "Overdue · " : "Due "}${esc(fmtDate(t.due))}</span>` : ""}
        ${t.repeat && t.repeat !== "none" ? `<span class="meta-ic">${SVG(ICON.repeat)}${REPEAT_SHORT[t.repeat] || ""}</span>` : ""}
        ${subs.length ? `<span class="meta-ic">${SVG(ICON.steps)}${sd}/${subs.length} steps</span>` : ""}
        ${(t.links || []).length ? `<span class="meta-ic">${SVG(ICON.link)}${t.links.length}</span>` : ""}
        ${(t.notes || "").trim() ? `<span class="meta-ic" title="Has notes">${SVG(ICON.note)}</span>` : ""}
        ${t.assignedBy ? `<span>from ${esc(t.assignedBy)}</span>` : ""}</span>
      <span class="line" style="gap:10px"><span class="bar" style="flex:1"><i style="width:${Math.max(0, Math.min(100, +t.progress || 0))}%"></i></span><span style="font-family:var(--f-mono)">${+t.progress || 0}%</span></span>
      ${t.bottleneck && t.status !== "done" ? `<span class="block"><b>Bottleneck:</b> ${esc(t.bottleneck)}</span>` : ""}
      ${t.status === "done" && t.impact ? `<span class="impact">${SVG(ICON.star)}${esc(t.impact)}</span>` : ""}
    </span></div>`;
}
function routineFor(k) {
  const wd = keyDow(k);
  const dd = dayDoc(k);
  const moved = new Set((dd.extra || []).filter((x) => x.from && (dd.skip || {})[x.from]).map((x) => x.from));
  return [
    ...S.routine.filter((r) => (!r.days || r.days.includes(wd)) && !moved.has(r.id)),
    ...(dd.extra || []).map((x) => ({ ...x, extra: true })),
  ].sort((a, b) => a.time.localeCompare(b.time));
}
function saveDay(k, dd) {
  S.day[k] = dd;
  if (hub.db)
    write("checks/" + k, () =>
      hub.db.doc("checks/" + k).set({ date: k, done: dd.done || {}, skip: dd.skip || {}, extra: dd.extra || [] }),
    );
  renderToday();
  syncRoutineTime(k);
}
// a ticked routine item that's linked to a task, assignment, to-do or course logs its block of time there
const timeFor = (type, ref) =>
  S.time.filter((x) => x.type === type && x.ref === ref).reduce((a, x) => a + (+x.mins || 0), 0);
const todoTime = (t) => timeFor(t.kind === "study" ? "study" : t.kind === "self" ? "self" : "todo", t.id);
function asgTime(a) {
  return (
    timeFor("asg", a.id) +
    S.todos.filter((t) => t.kind === "study" && t.asg === a.id).reduce((s, t) => s + todoTime(t), 0) +
    S.asg.filter((x) => x.parent === a.id).reduce((s, x) => s + asgTime(x), 0)
  );
}
function routineBlocks(k) {
  const dd = dayDoc(k),
    done = dd.done || {},
    skip = dd.skip || {},
    items = routineFor(k)
      .filter((r) => !skip[r.id])
      .sort((a, b) => a.time.localeCompare(b.time));
  return items.map((r, i) => {
    const a = toMin(r.time),
      nx = items[i + 1] ? toMin(items[i + 1].time) : a + 60;
    return { r, a, b: Math.min(nx, a + 240, 1440), done: !!done[r.id] };
  });
}
function syncRoutineTime(k) {
  if (!S.ready || !k) return;
  const want = {};
  routineBlocks(k).forEach((x) => {
    if (!x.done || !x.r.link || x.b <= x.a) return;
    const [type, rest] = x.r.link.split(/:(.*)/s),
      [ref, mod] = (rest || "").split("|");
    if (!type || type === "other") return;
    const st = new Date(`${k}T${x.r.time}:00`),
      en = new Date(st.getTime() + (x.b - x.a) * 60000),
      id = "r" + k.replace(/-/g, "") + x.r.id;
    const modT = mod
      ? (((S.courses.find((c) => c.id === ref) || {}).modules || []).find((m) => m.id === mod) || {}).title
      : "";
    want[id] = {
      start: st.toISOString(),
      end: en.toISOString(),
      mins: x.b - x.a,
      date: k,
      type,
      ref: ref || "",
      label: hub.timerTargetLabel(type, ref) + (modT ? " › " + modT : ""),
      via: "routine",
      rid: x.r.id,
      ...(mod ? { mod } : {}),
    };
  });
  S.time.filter((x) => x.via === "routine" && x.date === k && !want[x.id]).forEach((x) => hub.delTimeRec(x.id));
  Object.entries(want).forEach(([id, rec]) => {
    const ex = S.time.find((x) => x.id === id);
    if (
      !ex ||
      ex.mins !== rec.mins ||
      ex.ref !== rec.ref ||
      ex.type !== rec.type ||
      ex.start !== rec.start ||
      (ex.mod || "") !== (rec.mod || "")
    )
      hub.saveTimeRec(id, rec);
  });
}
const DAYLBL = { "-1": "Yesterday", 0: "Today", 1: "Tomorrow" };
// ---------- routine timeline in the summary card (day / week)
try {
  S.tlMode = localStorage.getItem("daybook-tl") || "day";
} catch {
  S.tlMode = "day";
}
const toMin = (t) => {
  const [h, m] = String(t || "0:0")
    .split(":")
    .map(Number);
  return h * 60 + m;
};
function itemState(r, k) {
  const dd = dayDoc(k),
    tk = todayKey();
  if ((dd.skip || {})[r.id]) return "skip";
  if ((dd.done || {})[r.id]) return "done";
  if (k < hub.startKey()) return "none";
  if (k < tk) return "miss";
  if (k === tk && toMin(r.time) < new Date().getHours() * 60 + new Date().getMinutes()) return "late";
  return "todo";
}
const STATE_TXT = {
  done: "Done",
  miss: "Missed",
  late: "Not ticked yet",
  todo: "Upcoming",
  skip: "Skipped",
  none: "Before tracking",
};
function timelineHtml() {
  const tk = todayKey(),
    week = hub.weekKeys(0),
    mode = S.tlMode;
  const keys = mode === "week" ? week : [tk];
  const all = keys.flatMap((k) => routineFor(k));
  if (!all.length) return "";
  let lo = Math.floor(Math.min(...all.map((r) => toMin(r.time))) / 60) * 60,
    hi = Math.ceil((Math.max(...all.map((r) => toMin(r.time))) + 1) / 60) * 60;
  if (hi - lo < 120) hi = lo + 120;
  const pos = (m) => (((m - lo) / (hi - lo)) * 100).toFixed(2);
  const nowM = new Date().getHours() * 60 + new Date().getMinutes(),
    nowIn = nowM >= lo && nowM <= hi;
  const dots = (k) =>
    routineFor(k)
      .map((r) => {
        const st = itemState(r, k);
        return `<i class="tl-dot s-${st}" style="left:${pos(toMin(r.time))}%" title="${esc(r.time)} ${esc(r.label)} · ${STATE_TXT[st]}"></i>`;
      })
      .join("");
  const span = (hi - lo) / 60,
    step = span <= 8 ? 2 : span <= 14 ? 3 : 4;
  const ticks = [];
  for (let m = lo; m <= hi; m += step * 60)
    ticks.push(`<span style="left:${pos(m)}%">${pad(Math.floor(m / 60) % 24)}:00</span>`);
  const nowMark = (k) => (k === tk && nowIn ? `<b class="tl-now" style="left:${pos(nowM)}%"></b>` : "");
  const fill = (k) =>
    k === tk
      ? `<span class="tl-fill" style="width:${nowIn ? pos(nowM) : nowM > hi ? 100 : 0}%"></span>`
      : k < tk
        ? `<span class="tl-fill past" style="width:100%"></span>`
        : "";
  const count = (k) => {
    const its = routineFor(k).filter((r) => !(dayDoc(k).skip || {})[r.id]);
    return `${its.filter((r) => (dayDoc(k).done || {})[r.id]).length}/${its.length}`;
  };
  const body =
    mode === "week"
      ? `<div class="tl-week">${week.map((k) => `<div class="tl-row ${k === tk ? "is-today" : ""} ${k > tk ? "is-future" : ""}"><span class="tl-day">${esc(DAYS[keyDow(k)])}</span><div class="tl-track">${fill(k)}${dots(k)}${nowMark(k)}</div><span class="tl-count">${k > tk || k < hub.startKey() ? "" : count(k)}</span></div>`).join("")}
       <div class="tl-row tl-axisrow"><span></span><div class="tl-axis">${ticks.join("")}</div><span></span></div></div>`
      : `<div class="tl-track big">${fill(tk)}${dots(tk)}${nowMark(tk)}${nowIn ? `<em class="tl-nowlbl" style="left:${pos(nowM)}%">now</em>` : ""}</div><div class="tl-axis">${ticks.join("")}</div>`;
  return `<div class="tl">
    <div class="tl-head"><span class="tl-title">${mode === "week" ? "This week's routine" : "Today's routine"}</span>
      <div class="seg tl-seg"><button type="button" data-tl="day" aria-pressed="${mode === "day"}">Day</button><button type="button" data-tl="week" aria-pressed="${mode === "week"}">Week</button></div></div>
    ${body}
    <div class="tl-legend"><span><i class="tl-dot s-done"></i>Done</span><span><i class="tl-dot s-todo"></i>Upcoming</span><span><i class="tl-dot s-late"></i>Not ticked</span><span><i class="tl-dot s-skip"></i>Skipped</span></div>
  </div>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-tl]");
  if (!b) return;
  S.tlMode = b.dataset.tl;
  try {
    localStorage.setItem("daybook-tl", S.tlMode);
  } catch {}
  renderToday();
});
function heroHtml(active, done, next, missed) {
  const tk = todayKey(),
    dn = active.filter((r) => done[r.id]).length,
    pct = active.length ? Math.round((dn / active.length) * 100) : 0;
  const todoLeft = S.todos.filter((t) => !t.done && (!t.date || t.date <= tk)).length,
    open = S.tasks.filter((t) => t.status !== "done").length;
  return `<div class="hero">${ring(pct)}<div class="hero-txt">
    <div class="greet">${esc(greeting())}${S.name ? ", " + esc(S.name) : ""}</div>
    <div class="hero-sub">${esc(new Date().toLocaleDateString("en-GB", { weekday: "long" }))} · ${isWeekend(new Date().getDay()) ? "Weekend" : "Weekday"} routine</div>
    ${next ? `<div class="hero-next">${routineIcon(next)}<span><b>${esc(next.time)}</b> ${esc(next.label)}</span></div>` : `<div class="hero-next"><span>${!active.length ? "No routine yet. Add items in the Routine tab." : dn === active.length ? "Routine complete for today. Nice work." : "Nothing else scheduled today. Tick off anything you did."}</span></div>`}
    <div class="hero-stats"><span><b>${dn}/${active.length}</b> routine</span><span><b>${todoLeft}</b> to-do${todoLeft === 1 ? "" : "s"} left</span><span><b>${open}</b> task${open === 1 ? "" : "s"} open</span>${missed ? `<span class="warn"><b>${missed}</b> not ticked</span>` : ""}</div>
  </div></div>`;
}
document.addEventListener("change", (e) => {
  if (e.target.id !== "day-jump" || !e.target.value) return;
  const n = Math.round((new Date(e.target.value + "T00:00") - new Date(todayKey() + "T00:00")) / 864e5);
  S.dayOff = Math.max(-DAY_BACK, Math.min(6, n));
  S.rtEdit = null;
  hub.watchChecks();
  renderToday();
});
document.addEventListener("click", (e) => {
  const l = e.target.closest && e.target.closest(".day-pick");
  if (!l || e.target.id === "day-jump") return;
  e.preventDefault();
  const i = $("#day-jump");
  try {
    i.showPicker();
  } catch {
    i.focus();
    i.click();
  }
});
// ---------- edit a routine item straight from Today
S.rtEdit = null;
S.rtScope = "always";
function rtEditRow(r0, k, draft) {
  const r = draft ? { ...r0, ...draft } : r0;
  const we = isWeekend(keyDow(k)),
    usual = hub.daysLabel(r.days) || "its usual days";
  return `<li class="tl-edit"><form id="tl-edit-form" data-rid="${esc(r.id)}" autocomplete="off">
    <div class="tle-row"><input type="time" id="tle-t" value="${esc(r.time)}" aria-label="Time" required><input id="tle-l" value="${esc(r.label)}" aria-label="Name" required></div>
    <select id="tle-k" aria-label="Type">${KINDS.map(([v, l]) => `<option value="${v}" ${v === (r.kind || "other") ? "selected" : ""}>${l}</option>`).join("")}</select>
    <label class="f tle-link">Linked to <span class="muted" style="font-weight:400">· when ticked, this block's time is logged to it</span><select id="tle-link" aria-label="Linked to"><option value="">Not linked</option>${hub.targetOptions(r.link || "", k)}</select></label>
    ${r.extra ? `<p class="small muted" style="margin:0">${r.from ? `Changed for ${esc(fmtDate(k))} only. Tap ✕ on it to go back to the usual one.` : `This item is for ${esc(fmtDate(k))} only.`}</p>` : `<div class="seg tle-scope"><button type="button" data-rtscope="always" aria-pressed="${S.rtScope === "always"}">Change routine (${esc(usual)})</button><button type="button" data-rtscope="day" aria-pressed="${S.rtScope === "day"}">Just ${esc(fmtDate(k))}</button></div>`}
    <div class="row"><button class="btn sm primary" type="submit">Save</button><button class="btn sm" type="button" data-rtedit-x>Cancel</button>${r.extra ? "" : `<a class="small" href="#settings-routine">More options (days, alarm) ›</a>`}</div>
  </form></li>`;
}
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("[data-rtedit],[data-rtedit-x],[data-rtscope]");
  if (!t || !t.closest("#timeline")) return;
  if (t.dataset.rtedit) {
    S.rtEdit = t.dataset.rtedit;
    S.rtScope = S.dayOff < 0 ? "day" : "always";
    renderToday();
    const l = $("#tle-l");
    if (l) {
      l.focus();
      l.select();
    }
  } else if (t.dataset.rteditX !== undefined) {
    S.rtEdit = null;
    renderToday();
  } else if (t.dataset.rtscope) {
    S.rtScope = t.dataset.rtscope;
    t.parentElement.querySelectorAll("[data-rtscope]").forEach((b) => b.setAttribute("aria-pressed", b === t));
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && S.rtEdit && e.target.closest && e.target.closest("#tl-edit-form")) {
    S.rtEdit = null;
    renderToday();
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "tl-edit-form") return;
  e.preventDefault();
  const k = viewKey(),
    dd = dayDoc(k),
    id = e.target.dataset.rid;
  const time = $("#tle-t").value,
    label = $("#tle-l").value.trim(),
    kind = $("#tle-k").value,
    link = $("#tle-link") ? $("#tle-link").value : "";
  if (!time || !label) return;
  const ex = (dd.extra || []).find((x) => x.id === id);
  if (ex) {
    saveDay(k, { ...dd, extra: dd.extra.map((x) => (x.id === id ? { ...x, time, label, kind, link } : x)) });
    toast("Updated for " + fmtDate(k));
  } else {
    const r = S.routine.find((x) => x.id === id);
    if (!r) return;
    if (S.rtScope === "day") {
      const nid = newId(),
        done = { ...(dd.done || {}) };
      if (done[id]) {
        done[nid] = done[id];
        delete done[id];
      }
      saveDay(k, {
        ...dd,
        done,
        skip: { ...(dd.skip || {}), [id]: true },
        extra: [...(dd.extra || []), { id: nid, time, label, kind, link, from: id }],
      });
      toast("Changed for " + fmtDate(k) + " only");
    } else {
      hub.saveRt({ ...r, time, label, kind, link });
      toast("Routine updated");
    }
  }
  S.rtEdit = null;
  renderToday();
});
function renderToday() {
  const tk = todayKey(),
    k = viewKey(),
    isToday = S.dayOff === 0,
    dd = dayDoc(k),
    done = dd.done || {},
    skip = dd.skip || {};
  const items = routineFor(k),
    active = items.filter((r) => !skip[r.id]);
  const nowHM = isToday
    ? pad(new Date().getHours()) + ":" + pad(new Date().getMinutes())
    : S.dayOff < 0
      ? "99:99"
      : "00:00";
  const next = isToday ? active.find((r) => r.time >= nowHM && !done[r.id]) || null : null;
  const missed = isToday ? active.filter((r) => r.time < nowHM && !done[r.id]).length : 0;
  const we = isWeekend(keyDow(k));
  $("#rt-title").textContent = (we ? "Weekend" : "Weekday") + " routine";
  $("#daypager").innerHTML =
    `<button class="btn sm" type="button" data-dayoff="-1" ${S.dayOff <= -DAY_BACK ? "disabled" : ""} aria-label="Previous day">‹</button>
    <label class="mid day-pick" title="Pick a day">${esc(DAYLBL[S.dayOff] || DAYS[keyDow(k)])}<small>${esc(fmtDate(k))}${S.dayOff < -1 || S.dayOff > 1 ? " " + k.slice(0, 4) : ""} ▾</small><input type="date" id="day-jump" data-native value="${k}" min="${hub.addDays(tk, -DAY_BACK)}" max="${hub.addDays(tk, 6)}" aria-label="Pick a day"></label>
    <button class="btn sm" type="button" data-dayoff="1" ${S.dayOff >= 6 ? "disabled" : ""} aria-label="Next day">›</button>`;
  $("#now").innerHTML = !S.ready
    ? `<span class="s">Loading your day…</span>`
    : !isToday
      ? `<div class="hero-plan"><span><span class="greet" style="font-size:1.15rem">${S.dayOff < 0 ? "Editing" : "Planning"} ${esc(fmtDate(k))}</span><br><span class="hero-sub">${S.dayOff < 0 ? "Tick what you did, untick mistakes, or tap ✎ to fix an item's time or name for that day." : "Skip or add items for this day only. Your usual routine stays the same."}</span></span><button class="btn sm" type="button" data-dayreset>Back to today</button></div>`
      : heroHtml(active, done, next, missed);
  $("#rt-meta").textContent = active.length
    ? `${active.filter((r) => done[r.id]).length} of ${active.length} done`
    : "";
  const f0 = $("#tl-edit-form"),
    draft =
      f0 && f0.dataset.rid === S.rtEdit
        ? {
            time: $("#tle-t").value,
            label: $("#tle-l").value,
            kind: $("#tle-k").value,
            link: $("#tle-link") ? $("#tle-link").value : "",
          }
        : null;
  $("#timeline").innerHTML = items.length
    ? items
        .map((r) => {
          const sk = !!skip[r.id];
          if (S.rtEdit === r.id) return rtEditRow(r, k, draft);
          return `<li class="${done[r.id] ? "done" : ""} ${sk ? "skipped" : ""} ${r.time < nowHM ? "past" : ""} ${next && next.id === r.id ? "next" : ""}">
    <span class="tm">${esc(r.time)}</span><input type="checkbox" data-check="${esc(r.id)}" ${done[r.id] ? "checked" : ""} ${sk ? "disabled" : ""} aria-label="Done: ${esc(r.label)}">
    <span class="lbl">${routineIcon(r)}<span>${esc(r.label)}${r.alarm && !r.extra ? `<span class="tl-bell" title="Alarm ${+r.before ? +r.before + " min before" : "at the time"}">${SVG(ICON.bell)}</span>` : ""}${sk ? '<span class="pill">Skipped</span>' : ""}${r.extra ? `<span class="pill">${r.from ? "Changed today" : "This day only"}</span>` : ""}${r.link && !r.link.startsWith("other") ? `<span class="pill pill-link" title="Time is logged to this when ticked">⏱ ${esc(hub.timerTargetLabel(r.link.split(/:(.*)/s)[0], (r.link.split(/:(.*)/s)[1] || "").split("|")[0]))}</span>` : ""}</span></span>
    <span class="kind">${esc((KINDS.find((x) => x[0] === r.kind) || ["", "Other"])[1])}</span>
    <span class="tl-acts"><button class="x tl-ed" type="button" data-rtedit="${esc(r.id)}" aria-label="Edit ${esc(r.label)}" title="Edit">${SVG(ICON.edit)}</button>${
      r.extra
        ? `<button class="x" type="button" data-delextra="${esc(r.id)}" aria-label="Remove ${esc(r.label)}">✕</button>`
        : `<button class="x small" type="button" data-skip="${esc(r.id)}">${sk ? "Undo" : "Skip"}</button>`
    }</span></li>`;
        })
        .join("")
    : `<li class="empty" style="display:block">${S.ready ? "Nothing scheduled for this day." : "Loading…"}</li>`;
  const mine = S.todos.filter((t) => !t.kind);
  const open = mine
    .filter((t) => !t.done && (!t.date || t.date <= tk))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const later = mine.filter((t) => !t.done && t.date > tk).sort((a, b) => a.date.localeCompare(b.date));
  $("#todo-meta").textContent = later.length ? `${later.length} scheduled later` : "";
  const row = (
    t,
  ) => `<li class="${t.done ? "done" : ""}"><input type="checkbox" data-todo="${esc(t.id)}" ${t.done ? "checked" : ""} aria-label="Done: ${esc(t.title)}">
    <span class="grow"><span>${t.kind === "study" && t.subj ? `<span class="tag ${hub.subjCls(t.subj)}">${esc(hub.subjLabel(t.subj))}</span> ` : ""}${t.kind === "study" && t.asg && S.asg.find((a) => a.id === t.asg) ? `<span class="muted">${esc(S.asg.find((a) => a.id === t.asg).title)} › </span>` : ""}${t.kind === "self" && t.cat ? catTag(t.cat) + " " : ""}${esc(t.title)}</span>${(t.date && t.date !== tk) || todoTime(t) ? `<div class="sub ${t.date && t.date < tk && !t.done ? "overdue" : ""}">${t.date && t.date !== tk ? (t.date < tk ? "From " : "") + esc(fmtDate(t.date)) : ""}${todoTime(t) ? `${t.date && t.date !== tk ? " · " : ""}⏱ ${fmtMins(todoTime(t))}` : ""}</div>` : ""}</span>
    <button class="x tl-ed" type="button" data-todoedit="${esc(t.id)}" aria-label="Edit ${esc(t.title)}" title="Edit">${SVG(ICON.edit)}</button><button class="x" type="button" data-deltodo="${esc(t.id)}" aria-label="Delete">✕</button></li>`;
  $("#todos").innerHTML =
    open.length || later.length
      ? open.map(row).join("") +
        (later.length ? `<li class="sub" style="background:var(--sunk)">Later</li>` + later.map(row).join("") : "")
      : `<li class="empty">${S.ready ? "Nothing to do. Add one in the box above." : "Loading…"}</li>`;
  {
    const sh = hub.studyTodayHtml(),
      wk = hub.studyWorkItems(),
      st = S.todos
        .filter((t) => t.kind === "study" && !t.done)
        .sort((a, b) => (a.date || "").localeCompare(b.date || "")),
      now = st.filter((t) => !t.date || t.date <= hub.addDays(tk, 1)),
      lat = st.length - now.length;
    $("#today-study-wrap").hidden = !sh && !st.length && !wk.length && !S.subjects.length;
    $("#today-study").innerHTML =
      (sh || "") +
      (now.length || wk.length
        ? `<div class="small muted" style="margin-top:6px">Study to-dos</div><ul class="rows st-todos">${wk.map(hub.asgTodoRow).join("")}${now.map(row).join("")}</ul>`
        : "") +
      (lat
        ? `<p class="small muted" style="margin:4px 0 0">${lat} more study to-do${lat === 1 ? "" : "s"} later this week or after · <a href="#study-assignments">see all</a></p>`
        : "") +
      (!sh && !st.length && !wk.length
        ? `<p class="small muted" style="margin:0">Nothing for study today. Add one with the box above: choose <b>Study</b>.</p>`
        : "");
  }
  {
    const st = S.todos
        .filter((t) => t.kind === "self" && !t.done)
        .sort((a, b) => (a.date || "").localeCompare(b.date || "")),
      now = st.filter((t) => !t.date || t.date <= hub.addDays(tk, 1)),
      lat = st.length - now.length,
      cs = S.courses.filter((c) => hub.courseStats(c).pct < 100);
    $("#today-self-wrap").hidden = !st.length && !S.courses.length;
    $("#today-self").innerHTML =
      (now.length
        ? `<ul class="rows st-todos">${now.map(row).join("")}</ul>`
        : `<p class="small muted" style="margin:0">${st.length ? "" : "Nothing planned. Add one with the box above: choose <b>Self-study / skills</b>."}</p>`) +
      (lat ? `<p class="small muted" style="margin:4px 0 0">${lat} more planned later</p>` : "") +
      (cs.length
        ? `<ul class="co-mini">${cs
            .slice(0, 3)
            .map((c) => {
              const s2 = hub.courseStats(c);
              return `<li data-course="${esc(c.id)}"><span class="grow"><b>${esc(c.name)}</b><span class="bar"><i style="width:${s2.pct}%"></i></span></span><span class="small muted">${s2.pct}%</span><span class="co-btns"><button class="btn sm" type="button" data-logtime="course|${esc(c.id)}|${esc(c.name)}" title="Log time you already spent">+ Log</button><button class="btn sm" type="button" data-cfocus="${esc(c.id)}">${SVG(ICON.play)}25m</button></span></li>`;
            })
            .join("")}</ul>`
        : "");
  }
  const focus = sortTasks(S.tasks.filter((t) => t.status !== "done")).slice(0, 3);
  $("#focus").innerHTML = focus.length
    ? focus.map(taskCard).join("")
    : `<div class="panel empty">${S.ready ? "No open work tasks. Switch the box above to Work to add one." : "Loading…"}</div>`;
  const doneT = S.todos
    .filter((t) => t.done && isoDay(t.doneAt) === tk)
    .map((t) => ({
      l: t.title,
      s:
        t.kind === "study"
          ? "Study" + (t.subj ? " · " + hub.subjLabel(t.subj) : "")
          : t.kind === "self"
            ? "Self-study" + (t.cat ? " · " + catName(t.cat).split(/\s*\/\s*/)[0] : "")
            : "To-do",
      at: t.doneAt,
    }));
  const doneW = S.tasks
    .filter((t) => t.status === "done" && isoDay(t.doneAt) === tk)
    .map((t) => ({ l: t.title, s: catName(t.category), at: t.doneAt }));
  const doneA = S.asg
    .filter((a) => ["submitted", "graded"].includes(a.status) && isoDay(a.doneAt) === tk)
    .map((a) => ({ l: a.title, s: "Submitted · " + hub.subjLabel(a.subj), at: a.doneAt }));
  const all = [...doneW, ...doneT, ...doneA].sort((a, b) => b.at.localeCompare(a.at));
  $("#done-meta").textContent = all.length ? `${all.length} completed` : "";
  $("#donetoday").innerHTML = all.length
    ? all
        .map(
          (x) =>
            `<li><span class="grow"><span>${esc(x.l)}</span><div class="sub">${esc(x.s)} · ${fmtTime(x.at)}</div></span></li>`,
        )
        .join("")
    : `<li class="empty">Completed to-dos and work tasks show up here.</li>`;
}
function renderWork() {
  const counts = { todo: 0, doing: 0, blocked: 0, done: 0 };
  S.tasks.forEach((t) => (counts[t.status] = (counts[t.status] || 0) + 1));
  $("#stats").innerHTML = STATUS.map(
    ([k, l]) =>
      `<button type="button" class="stat" data-st="${k}" aria-pressed="${S.stFilter === k}"><b>${counts[k] || 0}</b><span>${l}</span></button>`,
  ).join("");
  const used = [...new Set(S.tasks.map((t) => t.category || ""))];
  const cats = [
    ...S.cats.map((c) => c.tag).filter((t) => used.includes(t)),
    ...used.filter((u) => !S.cats.find((c) => c.tag === u)),
  ];
  $("#catchips").innerHTML =
    `<button type="button" class="chip" data-cat="" aria-pressed="${!S.catFilter}">All categories</button>` +
    cats
      .map(
        (c) =>
          `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${S.catFilter === c}">${esc(catName(c))} <span class="muted">${S.tasks.filter((t) => (t.category || "") === c && t.status !== "done").length}</span></button>`,
      )
      .join("") +
    `<button type="button" class="chip" data-st="${S.stFilter === "all" ? "open" : "all"}" aria-pressed="${S.stFilter === "all"}">${S.stFilter === "all" ? "Showing all" : "Show done too"}</button>`;
  let list = S.tasks.filter((t) => S.catFilter === null || (t.category || "") === S.catFilter);
  if (S.stFilter === "open") list = list.filter((t) => t.status !== "done");
  else if (S.stFilter !== "all") list = list.filter((t) => t.status === S.stFilter);
  $("#tasklist").innerHTML = list.length
    ? sortTasks(list).map(taskCard).join("")
    : `<div class="panel empty">${S.ready ? "No tasks here. Type one in the box above, e.g. <b>Update monthly scrap report #excel !high @fri</b>" : "Loading…"}</div>`;
}

export {
  REPEAT,
  REPEAT_SHORT,
  STATE_TXT,
  asgTime,
  clock,
  fmtMins,
  itemState,
  renderToday,
  renderWork,
  routineFor,
  saveDay,
  sortTasks,
  syncRoutineTime,
  taskMins,
  timerElapsed,
  toMin,
};
