// Work task editor.
// A task is one big theme (name, goal, deadline, status). Work on it is kept as day pages:
// each work day has its own focus, details, steps, bottlenecks and links.
// Steps, bottlenecks and links stay in flat lists on the task (tagged with their day),
// so task cards, reports and search keep reading them as before.
import { hub } from "./registry.js";
import {
  $,
  ICON,
  S,
  STATUS,
  STATUS_LABEL,
  SVG,
  URG,
  catName,
  del,
  dkey,
  esc,
  fmtDate,
  fmtTime,
  isWeekend,
  isoDay,
  newId,
  nowISO,
  put,
  strip,
  toast,
  todayKey,
} from "./core.js";
import { REPEAT, REPEAT_SHORT, fmtMins, taskMins } from "./today.js";
import { clean, fromPlain, rteHTML, rteVal, toPlain } from "./rte.js";

let editing = null,
  isNew = false,
  confirmDel = false,
  logSt = "",
  logAt = "",
  daySel = "",
  pageDelAsk = false,
  aboutOpen = false;
const LOG_ST = [
  ["todo", "Not started"],
  ["doing", "In progress"],
  ["done", "Completed"],
];
const LOG_ST_LABEL = Object.fromEntries(LOG_ST);
const newSubId = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad2 = (n) => String(n).padStart(2, "0");
const dayLbl = (d) => (d === todayKey() ? "Today" : fmtDate(d));
const whenTxt = (iso) => (iso ? `${dayLbl(isoDay(iso))} ${fmtTime(iso)}` : "");
const rich = (t, k) => t[k + "Html"] || fromPlain(t[k] || "");
const dayDiff = (a, b) => Math.round((new Date(b + "T12:00") - new Date(a + "T12:00")) / 864e5);
// a moment on day d: now if d is today, otherwise that day at the current clock time
const dayAt = (d) => {
  if (!d || d === todayKey()) return nowISO();
  const n = new Date();
  return new Date(`${d}T${pad2(n.getHours())}:${pad2(n.getMinutes())}`).toISOString();
};

// ---------- older data shapes
// description records (update 76) and the single description before that
const recList = (t) =>
  t.records ||
  (t.descHtml || t.desc ? [{ id: newSubId(), day: isoDay(t.createdAt) || todayKey(), html: t.descHtml || fromPlain(t.desc) }] : []);
const pageList = (t) => (t.days ? t.days.map((p) => ({ ...p })) : recList(t).map((r) => ({ id: r.id, day: r.day, overviewHtml: "", html: r.html })));
const bnList = (t) =>
  t.bottlenecks || (t.bottleneck ? [{ id: newSubId(), issue: t.bottleneck, solved: !!t.bnSolved, how: t.bnHow || "", at: t.updatedAt || "" }] : []);
// every item belongs to a day page; older items go on the first page
function ensurePages() {
  const t = editing,
    first = (t.days[0] || {}).day || isoDay(t.createdAt) || todayKey();
  t.subtasks.forEach((s) => (s.day ||= first));
  t.bottlenecks.forEach((x) => (x.day ||= isoDay(x.at) || first));
  t.links.forEach((l) => (l.day ||= first));
  const need = new Set([first, ...t.subtasks.map((s) => s.day), ...t.bottlenecks.map((x) => x.day), ...t.links.map((l) => l.day)]);
  need.forEach((d) => {
    if (!t.days.some((p) => p.day === d)) t.days.push({ id: newSubId(), day: d, overviewHtml: "", html: "" });
  });
  t.days.sort((a, b) => a.day.localeCompare(b.day));
}
// start a day page; a new latest day takes over the steps still unticked from earlier days
function addPage(t, d) {
  if (t.days.some((p) => p.day === d)) return;
  const newest = t.days.every((p) => p.day < d);
  t.days.push({ id: newSubId(), day: d, overviewHtml: "", html: "" });
  t.days.sort((a, b) => a.day.localeCompare(b.day));
  if (!newest) return;
  const moved = t.subtasks.filter((s) => !s.done && s.day < d);
  moved.forEach((s) => {
    s.from ||= s.day; // remembers the day it was first planned
    s.day = d;
  });
  if (moved.length) toast(`Moved ${moved.length} unfinished step${moved.length === 1 ? "" : "s"} to ${d === todayKey() ? "today" : fmtDate(d)}`);
}
// plain fields that cards, reports and search read
function bnSummary(t) {
  const L = (t.bottlenecks || []).filter((x) => x.issue);
  const open = L.filter((x) => !x.solved);
  t.bottleneck = (open.length ? open : L).map((x) => x.issue).join("; ");
  t.bnSolved = L.length > 0 && !open.length;
  t.bnHow = L.filter((x) => x.solved && x.how).map((x) => x.how).join("; ");
}

// ---------- progress log
const logKind = (n) =>
  /^Progress \d/.test(n) ? ["prog", "Progress"]
  : /^Status:/.test(n) ? ["stat", "Status"]
  : /^Deadline/.test(n) ? ["due", "Deadline"]
  : /^Step done/.test(n) ? ["step", "Step"]
  : /^Bottleneck solved/.test(n) ? ["solved", "Solved"]
  : /^Bottleneck/.test(n) ? ["block", "Bottleneck"]
  : /^Result/.test(n) ? ["res", "Result"]
  : /^Logged \d|^Timer|^Focus/.test(n) ? ["time", "Time"]
  : /^Task added|^Follow-up/.test(n) ? ["new", "Added"]
  : ["upd", "Update"];
const stripKind = (n) => n.replace(/^(Bottleneck solved|Bottleneck|Result|Step done):\s*/, "");
// The timeline is grouped by type, like a GitHub activity list: each entry has a coloured
// round icon. A bottleneck and its "solved" entry show as one item. Newest first in each group.
const TL_IC = {
  upd: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  block: '<path d="M12 4 2.8 20h18.4L12 4z"/><path d="M12 10v4.5M12 17.4v.1"/>',
  solved: '<path d="M5 12.5 9.5 17 19 7.5"/>',
  step: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12.3 2.4 2.4 4.6-5.2"/>',
  res: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z"/>',
  due: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  other: '<circle cx="12" cy="12" r="3.2"/>',
  new: '<path d="M12 5v14M5 12h14"/>',
};
const TL_GROUPS = [
  ["upd", "Updates", ["upd", "new"]],
  ["block", "Bottlenecks", ["block", "solved"]],
  ["step", "Steps done", ["step"]],
  ["res", "Results", ["res"]],
  ["due", "Deadline changes", ["due"]],
  ["other", "Status, progress & time", ["prog", "stat", "time"]],
];
const TL_SHOW = 6;
let tlOpen = {};
// "day": only the selected day; "all": the whole task. "type": grouped by kind; "date": a diary by day.
const bnOpen = new Set(), // bottlenecks opened for editing
  stOpen = new Set(), // steps opened for editing
  vstOpen = new Set(); // steps showing their details on the summary
let tlScope = "day",
  tlView = "type";
const tlExp = new Set(); // rows opened to show their details
// short "how long" tag for a bottleneck
function spanTag(from, to) {
  const a = new Date(from),
    b = to ? new Date(to) : new Date();
  const m = Math.round((b - a) / 6e4);
  if (to && m < 0) return ["warn", "Check dates"];
  const days = dayDiff(isoDay(from), to ? isoDay(to) : todayKey());
  const txt =
    m < 60 ? `${Math.max(1, m)} min`
    : days === 0 ? `${m < 600 ? Math.round(m / 6) / 10 : Math.round(m / 60)} h`
    : days === 1 ? (to ? "next day" : "1 day")
    : `${days} days`;
  return to ? ["ok", m < 60 || days === 0 ? `Solved in ${txt}` : days === 1 ? "Solved next day" : `Solved in ${txt}`] : ["bad", `Open ${txt}`];
}
// every log entry becomes one row; a bottleneck and its "solved" entry share a row
function tlRows(t, editable) {
  const all = t.log.map((l, i) => ({ l, i, k: logKind(l.note || "")[0] }));
  const rows = [],
    solved = all.filter((x) => x.k === "solved"),
    usedS = new Set();
  const ed = (i, lbl) => (editable ? `<button type="button" class="tl-edb" data-logedit="${i}">${SVG(ICON.edit)}${lbl}</button>` : "");
  const full = (iso) => `${esc(fullDay(isoDay(iso)))} · ${fmtTime(iso)}`;
  all.forEach((x) => {
    if (x.k === "solved") return;
    if (x.k === "block") {
      const issue = stripKind(x.l.note),
        s = solved.find((y) => !usedS.has(y.i) && stripKind(y.l.note) === issue);
      if (s) usedS.add(s.i);
      const [tc, tt] = spanTag(x.l.at, s && s.l.at);
      rows.push({
        key: "b" + x.i,
        g: "block",
        k: s ? "solved" : "block",
        at: x.l.at,
        days: [isoDay(x.l.at), s && isoDay(s.l.at)].filter(Boolean),
        title: issue,
        tags: `<span class="tl-tag ${tc}">${tt}</span>`,
        memo: s && s.l.memo ? s.l.memo.replace(/^How:\s*/, "") : x.l.memo || "",
        memoLbl: s ? "How" : "",
        detail: `<div>Ran into it: ${full(x.l.at)}</div>${s ? `<div>Solved: ${full(s.l.at)}</div>` : ""}`,
        edit: ed(x.i, "Change when it started") + (s ? ed(s.i, "Change when solved") : ""),
      });
      return;
    }
    const g = TL_GROUPS.find(([, , ks]) => ks.includes(x.k))[0];
    rows.push({
      key: "e" + x.i,
      g,
      k: x.k === "new" ? "new" : g,
      at: x.l.at,
      days: [isoDay(x.l.at)],
      title: ["step", "res"].includes(g) ? stripKind(x.l.note) : x.l.note,
      tags: x.l.status ? `<span class="plg-st st-${esc(x.l.status)}">${esc(LOG_ST_LABEL[x.l.status] || x.l.status)}</span>` : "",
      memo: x.l.memo || "",
      memoLbl: "",
      detail: `<div>${full(x.l.at)}</div>`,
      edit: ed(x.i, "Edit"),
    });
  });
  solved
    .filter((y) => !usedS.has(y.i))
    .forEach((y) =>
      rows.push({ key: "e" + y.i, g: "block", k: "solved", at: y.l.at, days: [isoDay(y.l.at)], title: stripKind(y.l.note), tags: '<span class="tl-tag ok">Solved</span>', memo: (y.l.memo || "").replace(/^How:\s*/, ""), memoLbl: "How", detail: `<div>Solved: ${full(y.l.at)}</div>`, edit: ed(y.i, "Edit") }),
    );
  return rows.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
}
const tlRow = (r) => {
  const open = tlExp.has(r.key);
  return `<li class="tl-i k-${r.k} ${open ? "open" : ""}"><time class="tl-t">${fmtTime(r.at)}</time><span class="tl-ic">${SVG(TL_IC[r.k] || TL_IC.other)}</span><div class="tl-b">
    <button type="button" class="tl-sum" data-tlx="${r.key}" aria-expanded="${open}"><span class="tlr-title">${esc(r.title)}</span>${r.tags}</button>
    ${open ? `<div class="tl-more">${r.memo ? `<div class="tl-memo">${r.memoLbl ? `<b>${r.memoLbl}</b> ` : ""}${esc(r.memo)}</div>` : ""}<div class="tl-when">${r.detail}</div>${r.edit ? `<div class="tl-eds">${r.edit}</div>` : ""}</div>` : r.memo ? `<div class="tl-peek">${r.memoLbl ? `<b>${r.memoLbl}</b> ` : ""}${esc(r.memo)}</div>` : ""}
  </div></li>`;
};
// rows with a small date heading whenever the day changes (not needed when only one day is shown)
const tlList = (rows, withDates) => {
  let d = "",
    h = "";
  rows.forEach((r) => {
    const rd = isoDay(r.at);
    if (withDates && rd !== d) {
      d = rd;
      h += `<li class="tl-date">${esc(dayLbl(rd))}</li>`;
    }
    h += tlRow(r);
  });
  return `<ol class="tl">${h}</ol>`;
};
function drawLog(t, editable) {
  const rowsAll = tlRows(t, editable),
    onDay = tlScope === "day" ? daySel : "",
    rows = onDay ? rowsAll.filter((r) => r.days.includes(onDay)) : rowsAll;
  const head = `<div class="tl-ctl"><div class="tl-scope" role="group" aria-label="Timeline for"><button type="button" data-tlscope="day" aria-pressed="${tlScope === "day"}">${esc(dayLbl(daySel))}</button><button type="button" data-tlscope="all" aria-pressed="${tlScope === "all"}">Whole task</button></div><div class="tl-scope sm" role="group" aria-label="Arrange"><button type="button" data-tlview="type" aria-pressed="${tlView === "type"}">By type</button><button type="button" data-tlview="date" aria-pressed="${tlView === "date"}">By date</button></div></div>`;
  if (!rows.length) return head + `<p class="small muted plg-empty">${t.log.length ? `Nothing logged on ${esc(dayLbl(onDay))} yet.` : "No updates yet. Log what you did, what you're waiting on, or a decision you made."}</p>`;
  if (tlView === "date") return head + tlList(rows, !onDay);
  return (
    head +
    TL_GROUPS.map(([g, label]) => {
      const R = rows.filter((r) => r.g === g);
      if (!R.length) return "";
      const isOpen = tlOpen[g] ?? g !== "other",
        showAll = tlOpen[g + "+"],
        cut = showAll ? R : R.slice(0, TL_SHOW),
        opn = g === "block" ? R.filter((r) => r.k === "block").length : 0;
      return `<details class="tl-g g-${g}" data-tlg="${g}" ${isOpen ? "open" : ""}><summary><span class="tl-gi">${SVG(TL_IC[g])}</span><span>${label}</span>${opn ? `<em class="tl-open">${opn} open</em>` : ""}<small>${R.length}</small></summary>${tlList(cut, !onDay)}${R.length > TL_SHOW && !showAll ? `<button type="button" class="tl-all" data-tlall="${g}">Show all ${R.length}</button>` : ""}</details>`;
    }).join("")
  );
}
// show the selected day's part of the log
const logToDay = () => {
  const l = $("#tf .plg-list");
  if (!l) return;
  l.scrollTop = 0;
};

// ---------- open
// A task opens as a clean summary. Editing happens on a separate page with three tabs:
// the day page, the task info, and progress updates. Saving goes back to the summary.
let mode = "view",
  etab = "day",
  pendingNew = null;
// Each task has its own page at #task/<id>. openTask just goes there.
function openTask(id) {
  if (typeof id === "object") {
    pendingNew = id;
    if (location.hash === "#task/new") loadTask(id);
    else location.hash = "#task/new";
    return;
  }
  if (location.hash === "#task/" + id) return loadTask(id);
  location.hash = "#task/" + id;
}
const leave = () => {
  location.hash = "#work";
};
// called from render() whenever the task page is showing
let shownHash = "";
function renderTaskPage() {
  const id = S.taskId,
    fresh = location.hash !== shownHash;
  shownHash = location.hash;
  if (id === "new") {
    if (pendingNew) loadTask(pendingNew);
    else if (!(editing && isNew)) leave();
    return;
  }
  if (!fresh && editing && editing.id === id && (mode === "edit" || isNew)) return; // keep what's being typed
  const t = S.tasks.find((x) => x.id === id);
  if (!t) {
    $("#tf").innerHTML = `<div class="tp-bar"><button type="button" class="tp-back" id="t-close">← Tasks</button></div><p class="muted" style="padding:20px 0">${S.tasks.length ? "This task isn't here any more." : "Loading…"}</p>`;
    return;
  }
  const same = !fresh && editing && editing.id === id;
  loadTask(id, same ? { day: daySel, keepScroll: true } : {});
}
function loadTask(id, opts = {}) {
  const t = typeof id === "object" ? id : S.tasks.find((x) => x.id === id);
  if (!t) return;
  isNew = typeof id === "object";
  editing = {
    ...t,
    log: [...(t.log || [])],
    subtasks: (t.subtasks || []).map((s) => ({ ...s })),
    links: (t.links || []).map((l) => ({ ...l })),
    impactDocs: (t.impactDocs || []).map((l) => ({ ...l })),
    notesDocs: (t.notesDocs || []).map((l) => ({ ...l })),
    bottlenecks: bnList(t).map((x) => ({ ...x })),
    days: pageList(t),
  };
  ensurePages();
  daySel = opts.day && editing.days.some((p) => p.day === opts.day) ? opts.day : editing.days.some((p) => p.day === todayKey()) ? todayKey() : editing.days.at(-1).day;
  confirmDel = pageDelAsk = false;
  bnOpen.clear();
  stOpen.clear();
  logSt = logAt = "";
  mode = isNew ? "edit" : opts.mode || "view";
  etab = isNew ? "task" : opts.tab || "day";
  if (typeof id === "object") pendingNew = null;
  drawTask();
  if (!opts.keepScroll) window.scrollTo(0, 0);
  afterDraw();
  if (isNew) $("#t-title")?.focus();
}
function afterDraw() {
  growAll();
  logToDay();
  clampMore();
}
// long text shows 2–3 lines with a "more" link
function clampMore() {
  document.querySelectorAll("#tf .clamp:not(.open)").forEach((el) => {
    const has = el.nextElementSibling && el.nextElementSibling.classList.contains("more");
    if (!has && el.offsetParent && el.scrollHeight > el.clientHeight + 2) el.insertAdjacentHTML("afterend", '<button type="button" class="more">more</button>');
  });
}
$("#tf").addEventListener("toggle", clampMore, true);
$("#tf").addEventListener(
  "toggle",
  (e) => {
    const g = e.target.dataset && e.target.dataset.tlg;
    if (g) tlOpen[g] = e.target.open;
  },
  true,
);
// ---------- drag steps to reorder (mouse and touch)
let drag = null;
function reorderSteps(ids) {
  const t = editing,
    pos = t.subtasks.map((s, i) => (ids.includes(s.id) ? i : -1)).filter((i) => i >= 0),
    sorted = ids.map((id) => t.subtasks.find((s) => s.id === id));
  pos.forEach((p, k) => (t.subtasks[p] = sorted[k]));
}
$("#tf").addEventListener("pointerdown", (e) => {
  const g = e.target.closest(".st-grip");
  if (!g) return;
  const li = g.closest("li[data-sid]"),
    list = li && li.closest("[data-steplist]");
  if (!list) return;
  e.preventDefault();
  if (mode === "edit") readTaskForm();
  g.setPointerCapture(e.pointerId);
  drag = { li, list, moved: false };
  li.classList.add("dragging");
  list.classList.add("sorting");
});
$("#tf").addEventListener("pointermove", (e) => {
  if (!drag) return;
  drag.moved = true;
  const others = [...drag.list.querySelectorAll(":scope > li[data-sid]")].filter((x) => x !== drag.li);
  const after = others.find((x) => {
    const r = x.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2;
  });
  if (after) drag.list.insertBefore(drag.li, after);
  else drag.list.appendChild(drag.li);
  if (e.clientY < 90) window.scrollBy(0, -12);
  else if (e.clientY > innerHeight - 130) window.scrollBy(0, 12);
});
const endDrag = () => {
  if (!drag) return;
  const { li, list, moved } = drag;
  drag = null;
  li.classList.remove("dragging");
  list.classList.remove("sorting");
  if (!moved) return;
  reorderSteps([...list.querySelectorAll(":scope > li[data-sid]")].map((x) => x.dataset.sid));
  if (mode === "edit") redrawKeep();
  else {
    saveTask("stay");
    drawTask();
    afterDraw();
  }
};
$("#tf").addEventListener("pointerup", endDrag);
$("#tf").addEventListener("pointercancel", endDrag);
// the task form now lives on its own page instead of a pop-up
{
  const f = $("#tf");
  f.className = "tpage";
  f.removeAttribute("method");
  f.addEventListener("submit", (e) => e.preventDefault());
  $("#v-task").appendChild(f);
}
Object.defineProperties(hub, {
  renderTaskPage: { get: () => renderTaskPage, enumerable: true },
});
function autoProgress() {
  const s = editing.subtasks;
  if (!s.length) return;
  editing.progress = Math.round((s.filter((x) => x.done).length / s.length) * 100);
  if (editing.progress > 0 && editing.status === "todo") editing.status = "doing";
}

// ---------- shared bits
function dueInfo(t) {
  if (!t.due) return { main: "No deadline", sub: "", cls: "none" };
  const n = dayDiff(todayKey(), t.due),
    moved = (t.dueHistory || []).length;
  const sub =
    t.status === "done" ? "task done"
    : n < 0 ? `${-n} day${n === -1 ? "" : "s"} overdue`
    : n === 0 ? "due today"
    : n === 1 ? "due tomorrow"
    : `${n} days left`;
  return { main: fmtDate(t.due), sub: sub + (moved ? ` · moved ${moved}×` : ""), cls: t.status === "done" ? "ok" : n < 0 ? "over" : n <= 2 ? "near" : "" };
}
const ring = (p) =>
  `<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" class="rg-bg"/><circle cx="18" cy="18" r="15.9" class="rg-fg" stroke-dasharray="${p} 100"/></svg>`;
const fullDay = (d) => new Date(d + "T12:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
function dayStrip(t, addBtn) {
  const subs = t.subtasks;
  return `<div class="dstrip" role="tablist">${t.days
    .map((p) => {
      const d = new Date(p.day + "T12:00"),
        openBn = t.bottlenecks.some((x) => x.day === p.day && x.issue && !x.solved),
        st = subs.filter((s) => s.day === p.day),
        allDone = st.length && st.every((s) => s.done);
      return `<button type="button" data-day="${p.day}" aria-pressed="${p.day === daySel}" class="${p.day === todayKey() ? "is-today" : ""}" aria-label="${esc(fmtDate(p.day))}"><small>${d.toLocaleDateString("en-GB", { weekday: "short" })}</small><b>${d.getDate()}</b><small>${d.toLocaleDateString("en-GB", { month: "short" })}</small><span class="ddots">${openBn ? '<i class="d-bn"></i>' : ""}${allDone ? '<i class="d-ok"></i>' : st.length ? '<i class="d-st"></i>' : ""}</span></button>`;
    })
    .join("")}${addBtn ? `<button type="button" class="dstrip-add" id="t-dayadd">${t.days.some((p) => p.day === todayKey()) ? "+ Day" : "+ Today"}</button>` : ""}</div>`;
}
const curPage = () => {
  const t = editing;
  let pg = t.days.find((p) => p.day === daySel);
  if (!pg) {
    pg = t.days.at(-1);
    daySel = pg.day;
  }
  return pg;
};
const sec = (cls, icon, title, hint, body, editTab) =>
  `<section class="dsec ${cls}"><div class="dsec-h"><span class="dsec-ic">${SVG(ICON[icon])}</span><span class="dsec-t">${title}</span>${hint ? `<span class="dsec-hint">${hint}</span>` : ""}${editTab ? `<button type="button" class="sec-ed" data-goedit="${editTab}" aria-label="Edit ${title}">${SVG(ICON.edit)}</button>` : ""}</div>${body}</section>`;
const html = (h) => `<div class="rt-view">${clean(h)}</div>`;

// ---------- smart chips: links to Google Docs, Word, PDF and the like
const DOC_KIND = [
  [/docs\.google\.com\/document/, "gdoc", "Google Doc"],
  [/docs\.google\.com\/spreadsheets/, "gsheet", "Google Sheet"],
  [/docs\.google\.com\/presentation/, "gslides", "Google Slides"],
  [/docs\.google\.com\/forms/, "gform", "Google Form"],
  [/\.pdf(\?|#|$)|\/:b:\//i, "pdf", "PDF"],
  [/\.docx?(\?|#|$)|\/:w:\/|word/i, "word", "Word"],
  [/\.xlsx?(\?|#|$)|\.csv(\?|#|$)|\/:x:\//i, "excel", "Excel"],
  [/\.pptx?(\?|#|$)|\/:p:\//i, "ppt", "PowerPoint"],
  [/drive\.google\.com|sharepoint\.com|onedrive|1drv\.ms/i, "drive", "File"],
];
const docKind = (url) => DOC_KIND.find(([re]) => re.test(url || "")) || [null, "web", "Link"];
const DOC_IC = {
  gdoc: "Doc", gsheet: "Sheet", gslides: "Slides", gform: "Form", pdf: "PDF", word: "W", excel: "X", ppt: "P", drive: "File", web: "Link",
};
function docName(l) {
  if (l.label) return l.label;
  try {
    const u = new URL(l.url),
      last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
    if (/\.[a-z0-9]{2,5}$/i.test(last)) return last;
    return docKind(l.url)[2] + " · " + u.hostname.replace(/^www\./, "");
  } catch {
    return l.url;
  }
}
const chip = (l, edit) => {
  const [, k, kl] = docKind(l.url);
  return `<span class="schip k-${k}"><a href="${esc(l.url)}" target="_blank" rel="noopener" title="${esc(l.url)}"><span class="schip-ic">${DOC_IC[k]}</span><span class="schip-t">${esc(docName(l))}</span><span class="schip-k">${kl}</span></a>${edit || ""}</span>`;
};
const docAdder = (key) =>
  `<div class="qrow rwrap doc-add"><input id="t-doc-${key}-url" type="url" placeholder="Paste a Google Docs, Word or PDF link" class="inp"><input id="t-doc-${key}-name" placeholder="Name (optional)" class="inp" style="max-width:170px"><button class="btn sm" type="button" data-docadd="${key}">Add</button></div>`;
const docList = (t, key, editable) => {
  const L = t[key + "Docs"] || [];
  return L.length ? `<div class="schips">${L.map((l, i) => chip(l, editable ? `<button type="button" class="schip-x" data-docdel="${key}:${i}" aria-label="Remove">✕</button>` : "")).join("")}</div>` : "";
};

function drawTask() {
  const d = $("#tf");
  d.classList.toggle("tk-editing", mode === "edit");
  d.classList.toggle("tk-viewing", mode === "view");
  $("#tf").innerHTML = mode === "view" ? drawView() : drawEdit();
  const ab = $("#tf .tk-about");
  if (ab) ab.addEventListener("toggle", (e) => (aboutOpen = e.target.open));
}

// ---------- summary view
function drawView() {
  const t = editing,
    pg = curPage(),
    pi = t.days.indexOf(pg),
    isLast = pi === t.days.length - 1,
    subs = t.subtasks,
    sd = subs.filter((s) => s.done).length,
    prog = Math.max(0, Math.min(100, +t.progress || 0)),
    due = dueInfo(t),
    mins = taskMins(t.id),
    parent = t.parentId && S.tasks.find((x) => x.id === t.parentId),
    kids = S.tasks.filter((x) => x.parentId === t.id);
  const daySteps = subs.map((s, i) => [s, i]).filter(([s]) => s.day === pg.day),
    dayBn = t.bottlenecks.map((x, i) => [x, i]).filter(([x]) => x.day === pg.day && x.issue),
    dayLinks = t.links.filter((l) => l.day === pg.day),
    carrySteps = isLast ? subs.map((s, i) => [s, i]).filter(([s]) => !s.done && s.day < pg.day) : [],
    carryBn = isLast ? t.bottlenecks.filter((x) => x.issue && !x.solved && x.day < pg.day) : [];
  const vstep = ([s, i], carry) => {
    const op = vstOpen.has(s.id),
      meta = s.done && s.doneAt ? `Done ${shortWhen(s.doneAt)}` : carry ? `from ${dayLbl(s.day)}` : s.from && s.from !== s.day ? `from ${fmtDate(s.from)}` : "";
    const grip = !s.done && !carry ? `<span class="st-grip" title="Drag to reorder" aria-hidden="true"><svg viewBox="0 0 10 16"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg></span>` : "";
    return `<li class="vst ${s.done ? "done" : ""} ${op ? "open" : ""} ${grip ? "dragable" : ""}" data-sid="${esc(s.id)}">${grip}<input type="checkbox" data-vtog="${i}" ${s.done ? "checked" : ""} aria-label="Step done: ${esc(s.text)}"><div class="vst-b">${
      s.note ?
        `<button type="button" class="vst-sum" data-vstx="${esc(s.id)}" aria-expanded="${op}"><span class="vst-t">${esc(s.text)}</span>${meta ? `<small>${esc(meta)}</small>` : ""}<span class="bn-chev">›</span></button>${op ? `<div class="vst-n">${esc(s.note)}</div>` : ""}`
      : `<div class="vst-line"><span class="vst-t">${esc(s.text)}</span>${meta ? `<small>${esc(meta)}</small>` : ""}</div>`
    }</div></li>`;
  };
  // open steps first; done ones fold away
  const stepList = (L, carry) => {
    const open = L.filter(([s]) => !s.done),
      done = L.filter(([s]) => s.done);
    return `${open.length ? `<ol class="vsteps" ${carry ? "" : "data-steplist"}>${open.map((x) => vstep(x, carry)).join("")}</ol>` : '<p class="small muted" style="margin:0">All steps for this day are done.</p>'}${done.length ? `<details class="vst-done"><summary>Done · ${done.length}</summary><ol class="vsteps">${done.map((x) => vstep(x, carry)).join("")}</ol></details>` : ""}`;
  };
  const vbn = (x, carry) => `<div class="vbn ${x.solved ? "solved" : ""}">
      <div class="vbn-top"><div class="vbn-ti"><b class="clamp c2">${esc(x.issue)}</b></div><span class="pill ${x.solved ? "ok" : "bad"}">${x.solved ? "Solved" : "Open"}</span></div>
      ${x.solved && x.how ? `<div class="vbn-how clamp c2"><span>How</span>${esc(x.how)}</div>` : ""}
      <div class="vbn-meta">${carry ? `<button type="button" class="linkish" data-day="${x.day}">${esc(dayLbl(x.day))} ›</button> · ` : ""}${esc(whenTxt(x.at) || "—")}${x.solved ? ` → solved ${esc(whenTxt(x.solvedAt) || "—")}` : ""}</div></div>`;
  const filled = pg.overviewHtml || pg.html || daySteps.length || dayBn.length || dayLinks.length;
  const about = [
    ["Category", t.category ? catName(t.category) : ""],
    ["Assigned by", t.assignedBy],
    ["Repeats", t.repeat && t.repeat !== "none" ? REPEAT_SHORT[t.repeat] : ""],
    ["Time spent", mins ? fmtMins(mins) : ""],
  ].filter((x) => x[1]);
  // things that are easy to forget, with a jump straight to each field
  // the day's sections that are still empty; steps, bottlenecks and links can be marked "none today"
  const miss = [],
    none = pg.none || [],
    dl = pg.day === todayKey() ? "today" : fmtDate(pg.day);
  if (t.status !== "done" && !t.days.some((p) => p.day === todayKey())) miss.push(["today:", "Today's page", ""]);
  if (!pg.overviewHtml) miss.push(["day:t-dover", "Focus of the day", ""]);
  if (!pg.html && !(pg.detDocs || []).length) miss.push(["day:t-desc", "Details & findings", ""]);
  if (!daySteps.length && !none.includes("steps")) miss.push(["day:t-subnew", "Steps", "steps"]);
  if (!dayBn.length && !none.includes("bn")) miss.push(["daybn:", "Bottlenecks", "bn"]);
  if (!dayLinks.length && !none.includes("links")) miss.push(["day:t-linkurl", "Links", "links"]);
  t.bottlenecks.forEach((x, i) => {
    if (x.issue && x.solved && !x.how && x.day === pg.day) miss.push(["bn:" + i, `How you solved “${x.issue.length > 34 ? x.issue.slice(0, 32) + "…" : x.issue}”`, ""]);
  });
  if ((t.status === "done" || prog >= 100) && !t.impact && !t.impactHtml && !(t.impactDocs || []).length) miss.push(["task:t-impact-line", "Result / impact", ""]);
  const fillBlock = miss.length
    ? `<section class="tp-box tk-fill"><div class="tp-box-h"><span class="flab">Still to fill in · ${esc(dl)}</span><span class="fill-n">${miss.length}</span></div><ul class="fill-l">${miss.map(([a, l, nk]) => `<li><button type="button" class="fill-go-b" data-fill="${esc(a)}"><span class="fill-dot"></span>${esc(l)}</button>${nk ? `<button type="button" class="fill-none" data-fillnone="${nk}" title="Nothing for this day">none</button>` : '<span class="fill-go">›</span>'}</li>`).join("")}</ul></section>`
    : `<section class="tp-box tk-fill done"><div class="tp-box-h"><span class="flab">${esc(dl[0].toUpperCase() + dl.slice(1))} is all filled in</span><span class="fill-ok">✓</span></div></section>`;
  const aboutBlock = `<section class="tp-box tk-about2"><div class="tp-box-h"><span class="flab">About this task</span><button type="button" class="linkbtn small" data-goedit="task">Edit</button></div>
      ${about.length ? `<dl class="kv">${about.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : '<p class="small muted" style="margin:0">Nothing added yet.</p>'}
      ${
        t.impact || t.impactHtml || (t.impactDocs || []).length ?
          `<div class="kv-b"><span class="kv-l">Result / impact</span>${t.impactLine || (!t.impactHtml && t.impact) ? `<div class="kv-line">${esc(t.impactLine || t.impact)}</div>` : ""}${docList(t, "impact")}${t.impactHtml ? `<details class="kv-d"><summary>Written result</summary>${html(t.impactHtml)}</details>` : ""}</div>`
        : ""
      }
      ${
        t.notesHtml || t.notes || (t.notesDocs || []).length ?
          `<div class="kv-b"><span class="kv-l">Notes</span>${docList(t, "notes")}${t.notesHtml || t.notes ? `<details class="kv-d"><summary>Written notes</summary><div class="rt-view mono">${clean(rich(t, "notes"))}</div></details>` : ""}</div>`
        : ""
      }
    </section>`;
  const relBlock = `<section class="tp-box tk-rel2"><div class="tp-box-h"><span class="flab">Connected tasks</span></div>
      ${parent ? `<button type="button" class="rel-row up" data-openrel="${esc(parent.id)}"><small>Continues from</small><b>${esc(parent.title)}</b><span class="st ${esc(parent.status)}">${esc(STATUS_LABEL[parent.status] || "")}</span></button>` : ""}
      ${kids.map((k) => `<button type="button" class="rel-row down" data-openrel="${esc(k.id)}"><small>Follow-up</small><b>${esc(k.title)}</b><span class="st ${esc(k.status)}">${esc(STATUS_LABEL[k.status] || "")}</span></button>`).join("")}
      <button type="button" class="btn sm ghost rel-add" id="t-follow" title="When this task leads to a new one, start a follow-up so they stay linked">+ Follow-up task</button></section>`;
  return `<div class="tp-bar"><button type="button" class="tp-back" id="t-close">← Tasks</button><div class="tp-act"><button class="btn" type="button" data-goedit="log">Log update</button><button class="btn primary" type="button" data-goedit="task">${SVG(ICON.edit)}Edit task</button></div></div>
  <div class="tp-grid">
    <div class="tk-hero v" data-u="${esc(t.urgency || "medium")}">
      ${parent ? `<button type="button" class="tk-crumb" data-openrel="${esc(parent.id)}">↰ Continues from <b>${esc(parent.title)}</b></button>` : ""}
      <h2 class="tk-h">${esc(t.title)}</h2>
      <div class="tk-meta">
        <div class="tk-due ${due.cls}">${SVG(ICON.calendar)}<span><small>Deadline</small><b>${esc(due.main)}</b>${due.sub ? `<small>${esc(due.sub)}</small>` : ""}</span></div>
        <div class="tk-prog">${ring(prog)}<span><small>Progress</small><b>${prog}%</b>${subs.length ? `<small>${sd}/${subs.length} steps</small>` : ""}</span></div>
        <div class="tk-sel st-${esc(t.status)}"><small>Status</small><b>${esc(STATUS_LABEL[t.status] || "")}</b></div>
        <div class="tk-sel u-${esc(t.urgency)}"><small>Urgency</small><b>${esc((t.urgency || "")[0]?.toUpperCase() + (t.urgency || "").slice(1))}</b></div>
      </div>
      ${t.overviewHtml || t.overview ? `<div class="tk-goal-v"><span class="flab">Goal</span>${html(rich(t, "overview"))}</div>` : ""}
    </div>
    <div class="tp-left">
      <div class="dnav"><span class="flab">Work days <span class="muted">· ${t.days.length}</span></span>${dayStrip(t, true)}</div>
      ${fillBlock}
      ${aboutBlock}
      ${relBlock}
    </div>
    <div class="tp-main">
      <article class="dpage v">
        <header class="dpage-h"><div><span class="dpage-n">Day ${pi + 1} of ${t.days.length}</span><h4>${esc(fullDay(pg.day))}${pg.day === todayKey() ? ' <span class="today-pill">Today</span>' : ""}</h4></div>
          <button type="button" class="btn sm" data-goedit="day">${SVG(ICON.edit)}Edit this day</button></header>
        ${
          carrySteps.length || carryBn.length ?
            `<section class="carry"><div class="carry-h">${SVG(ICON.repeat)}Still open from earlier days</div>${carrySteps.length ? `<ol class="vsteps">${carrySteps.map((x) => vstep(x, true)).join("")}</ol>` : ""}${carryBn.map((x) => vbn(x, true)).join("")}</section>`
          : ""
        }
        ${pg.overviewHtml ? sec("s-focus", "plan", "Focus of the day", "", html(pg.overviewHtml)) : ""}
        ${pg.html || (pg.detDocs || []).length ? sec("s-det", "note", "Details &amp; findings", "", (pg.html ? html(pg.html) : "") + docList(pg, "det")) : ""}
        ${daySteps.length ? sec("s-steps", "steps", "Steps", `<span class="mini-bar"><i style="width:${Math.round((daySteps.filter(([s]) => s.done).length / daySteps.length) * 100)}%"></i></span>${daySteps.filter(([s]) => s.done).length}/${daySteps.length}`, stepList(daySteps)) : ""}
        ${dayBn.length ? sec("s-bn", "flame", "Bottlenecks", `${dayBn.filter(([x]) => !x.solved).length} open · ${dayBn.filter(([x]) => x.solved).length} solved`, dayBn.map(([x]) => vbn(x)).join("")) : ""}
        ${dayLinks.length ? sec("s-links", "link", "Links & files", "", `<div class="schips">${dayLinks.map((l) => chip(l)).join("")}</div>`) : ""}
        ${filled ? "" : `<div class="dpage-empty"><p>Nothing written for this day yet.</p><button type="button" class="btn primary sm" data-goedit="day">Write this day</button></div>`}
      </article>
    </div>
    <aside class="tp-right">
      <section class="plg-wrap"><div class="plg-top"><span class="flab">Timeline</span><span class="small muted">newest first · tap a row for details</span></div>
        <div class="plg-list">${drawLog(t, false)}</div></section>
    </aside>
  </div>`;
}

// ---------- edit page
function drawEdit() {
  const t = editing,
    pg = curPage(),
    tabs = [
      ["day", `Day · ${dayLbl(pg.day)}`],
      ["task", "Task info"],
      ["log", "Updates"],
    ];
  let body = "";
  if (etab === "day") body = editDay(t, pg);
  else if (etab === "task") body = editInfo(t);
  else body = editLog(t);
  return `<div class="tp-bar"><button type="button" class="tp-back" id="t-back">← ${isNew ? "Cancel" : "Back to summary"}</button><h3 class="tp-title">${isNew ? "New work task" : "Edit · " + esc(t.title)}</h3></div>
  ${isNew ? "" : `<div class="etabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-etab="${k}" aria-pressed="${etab === k}">${esc(l)}</button>`).join("")}</div>`}
  <div class="ebody">${body}</div>
  <div class="dlgfoot tp-foot">
    ${!isNew && etab === "task" ? `<button class="btn ghost danger sm" type="button" id="t-del">${confirmDel ? "Tap again to delete" : "Delete task"}</button>` : "<span></span>"}
    <div style="display:flex;gap:8px"><button class="btn" type="button" id="t-back">${isNew ? "Cancel" : "Discard changes"}</button><button class="btn primary" type="button" id="t-save">Save</button></div>
  </div>`;
}
const shortWhen = (iso) => (iso ? `${isoDay(iso) === todayKey() ? "Today" : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${fmtTime(iso)}` : "set time");
// a step folds to its title with the tick; tap the title to edit it and its details
const stepLi = (s, i) => {
  const open = stOpen.has(s.id);
  return `<li class="st-row ${s.done ? "done" : ""} ${open ? "open" : ""}" data-sid="${esc(s.id)}"><div class="st-head"><span class="st-grip" title="Drag to reorder" aria-hidden="true"><svg viewBox="0 0 10 16"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg></span><input type="checkbox" data-subtog="${i}" ${s.done ? "checked" : ""} aria-label="Step done: ${esc(s.text)}"><button type="button" class="st-sum" data-stx="${esc(s.id)}" aria-expanded="${open}"><span class="st-t">${open ? '<span class="muted">Close</span>' : esc(s.text)}</span>${!open && s.note ? '<span class="st-has">details</span>' : ""}${!open && s.done ? `<span class="st-when">${esc(shortWhen(s.doneAt))}</span>` : ""}<span class="bn-chev">›</span></button></div>
    ${
      open ?
        `<div class="st-body"><label class="bn-part"><span class="bn-lbl st">Step</span><textarea class="grow1 line sub-in st-in" rows="1" data-subtext="${i}">${esc(s.text)}</textarea></label>
      <label class="bn-part"><span class="bn-lbl">Details</span><textarea class="grow1 line sub-note" rows="1" data-subnote="${i}" placeholder="How, where, what to check (optional)">${esc(s.note || "")}</textarea></label>
      <div class="bn-foot st-foot">${s.done ? `<span class="small muted">Done</span><button type="button" class="when-chip" data-subwhen="${i}" title="Change when you did this">${SVG(ICON.edit)}${esc(shortWhen(s.doneAt))}</button>` : ""}<button type="button" class="linkbtn small danger bn-del" data-subdel="${i}">Remove</button></div></div>`
      : ""
    }</li>`;
};
function editDay(t, pg) {
  const pi = t.days.indexOf(pg),
    daySteps = t.subtasks.map((s, i) => [s, i]).filter(([s]) => s.day === pg.day),
    dayBn = t.bottlenecks.map((x, i) => [x, i]).filter(([x]) => x.day === pg.day),
    dayLinks = t.links.map((l, i) => [l, i]).filter(([l]) => l.day === pg.day);
  // a saved bottleneck folds to one line; tap to open its form
  const bnCard = (x, i) => {
    const odd = x.solved && x.solvedAt && x.at && x.solvedAt < x.at,
      open = bnOpen.has(x.id),
      [tc, tt] = odd ? ["warn", "Check dates"] : x.solved ? spanTag(x.at, x.solvedAt) : x.issue && x.at ? spanTag(x.at) : ["bad", "New"];
    const head = `<button type="button" class="bn-sum" data-bnx="${esc(x.id)}" aria-expanded="${open}"><span class="bn-ic">${SVG(TL_IC[x.solved ? "solved" : "block"])}</span><span class="bn-t">${open ? '<span class="muted">Close</span>' : esc(x.issue || "New bottleneck")}</span><span class="tl-tag ${tc}">${tt}</span><span class="bn-chev">›</span></button>`;
    if (!open) return `<div class="bn-row ${x.solved ? "solved" : ""}">${head}</div>`;
    return `<div class="bn-row open ${x.solved ? "solved" : ""}">${head}
      <div class="bn-pf">
        <label class="bn-part"><span class="bn-lbl bad">Problem</span><textarea class="grow1 line bn-issue" data-bnissue="${i}" rows="1" placeholder="What's in the way? Waiting for data, access, clarification…">${esc(x.issue)}</textarea></label>
        ${x.solved ? `<label class="bn-part"><span class="bn-lbl ok">Fix</span><textarea class="grow1 line bn-how" data-bnhow="${i}" rows="1" placeholder="How you solved it, e.g. asked IT for read access">${esc(x.how || "")}</textarea></label>` : ""}
      </div>
      <div class="bn-foot">
        <label class="bn-chk"><input type="checkbox" data-bnchk="${i}" ${x.solved ? "checked" : ""}>Solved</label>
        <span class="bn-dates"><button type="button" class="when-chip" data-bnat="${i}" title="When you ran into it">${SVG(ICON.edit)}${esc(shortWhen(x.at))}</button>${x.solved ? `<span class="bn-arrow">→</span><button type="button" class="when-chip ${odd ? "warn" : ""}" data-bnwhen="${i}" title="When you solved it">${SVG(ICON.edit)}${esc(shortWhen(x.solvedAt))}</button>` : ""}</span>
        ${odd ? `<button type="button" class="btn sm bn-fix" data-bnfix="${i}" title="Ran into it after it was solved? Set when it started">Fix date</button>` : ""}
        <button type="button" class="linkbtn small danger bn-del" data-bndel="${i}">Remove</button>
      </div></div>`;
  };
  return `<div class="dnav">${dayStrip(t, true)}</div>
    <div class="epage-h"><div><span class="dpage-n">Day ${pi + 1} of ${t.days.length}</span><h4>${esc(fullDay(pg.day))}</h4></div><span class="dpage-act"><button type="button" class="when-chip" data-pagedate title="Move this page to another date">${SVG(ICON.edit)}Change date</button>${t.days.length > 1 ? `<button type="button" class="linkbtn small danger" data-pagedel>${pageDelAsk ? "Tap again: removes its steps and links too" : "Remove day"}</button>` : ""}</span></div>
    <div class="ef s-focus"><span class="ef-l">${SVG(ICON.plan)}Focus of the day</span>${rteHTML("t-dover", pg.overviewHtml || "", "What is today about? e.g. Finish the family-level checks for pipes", "short")}</div>
    <div class="ef s-det"><span class="ef-l">${SVG(ICON.note)}Details &amp; findings</span>${rteHTML("t-desc", pg.html || "", pi ? "Findings, decisions, what changed since last time" : "What exactly was asked, expected output, where the data is")}
      ${docList(pg, "det", true)}${docAdder("det")}</div>
    <div class="ef s-steps"><span class="ef-l">${SVG(ICON.steps)}Steps</span>
      ${daySteps.length ? `<ul class="st-list" data-steplist>${daySteps.map(([s, i]) => stepLi(s, i)).join("")}</ul>` : ""}
      <div class="qrow"><textarea id="t-subnew" rows="1" placeholder="Add a step, then press Enter" class="inp grow1"></textarea><button class="btn sm" type="button" id="t-subadd">Add</button></div></div>
    <div class="ef s-bn"><span class="ef-l">${SVG(ICON.flame)}Bottlenecks</span>
      ${dayBn.map(([x, i]) => bnCard(x, i)).join("")}<button type="button" class="btn sm ghost bn-add" id="t-bnadd">+ Add a bottleneck</button></div>
    <div class="ef s-links"><span class="ef-l">${SVG(ICON.link)}Links &amp; files</span>
      ${dayLinks.length ? `<div class="schips">${dayLinks.map(([l, i]) => chip(l, `<button type="button" class="schip-x" data-linkedit="${i}" aria-label="Edit link" title="Rename">${SVG(ICON.edit)}</button><button type="button" class="schip-x" data-linkdel="${i}" aria-label="Remove link">✕</button>`)).join("")}</div>` : ""}
      <div class="qrow rwrap"><input id="t-linkurl" type="url" placeholder="Paste a link (drive, sheet, ticket)" class="inp"><input id="t-linklabel" placeholder="Name (optional)" class="inp" style="max-width:170px"><button class="btn sm" type="button" id="t-linkadd">Add</button></div></div>`;
}
function editInfo(t) {
  const subs = t.subtasks,
    others = S.tasks.filter((x) => x.id !== t.id && x.parentId !== t.id).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")),
    mins = taskMins(t.id);
  return `<label class="f">Task name<textarea id="t-title" class="grow1 tk-title-in" rows="1" placeholder="e.g. Part number naming convention check">${esc(t.title || "")}</textarea></label>
    <div class="f"><span class="flab">Goal of the whole task <span class="muted">· the big picture that stays the same</span></span>${rteHTML("t-overview", rich(t, "overview"), "e.g. Standardise part numbers across all plants so inventory reports match", "short")}</div>
    <div class="grid2">
      <label class="f">Deadline<input type="date" id="t-due" value="${esc(t._dueNew ?? (t.due || ""))}"></label>
      <label class="f">${t.due ? "If you move it, why?" : "Assigned by"}${t.due ? `<input id="t-duewhy" value="${esc(t._dueWhy || "")}" placeholder="e.g. Supervisor added more columns">` : `<input id="t-by" value="${esc(t.assignedBy || "")}" placeholder="Supervisor's name">`}</label>
    </div>
    <div class="f"><span class="flab">Status</span><div class="seg" id="t-st">${STATUS.map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${t.status === k}">${l}</button>`).join("")}</div></div>
    <div class="f"><span class="flab">Urgency</span><div class="seg" id="t-urg">${URG.map((u) => `<button type="button" data-v="${u}" aria-pressed="${t.urgency === u}">${u[0].toUpperCase() + u.slice(1)}</button>`).join("")}</div></div>
    ${subs.length ? "" : `<label class="f">Progress: <span id="t-pv">${+t.progress || 0}%</span><input type="range" id="t-prog" min="0" max="100" step="5" value="${+t.progress || 0}" style="padding:0;border:0;background:none;accent-color:var(--ok)"></label>`}
    <div class="grid2">
      <label class="f">Category<select id="t-cat"><option value="">Uncategorised</option>${S.cats.map((c) => `<option value="${esc(c.tag)}" ${c.tag === t.category ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
      ${t.due ? `<label class="f">Assigned by<input id="t-by" value="${esc(t.assignedBy || "")}" placeholder="Supervisor's name"></label>` : ""}
      <label class="f">Repeats<select id="t-repeat">${REPEAT.map(([v, l]) => `<option value="${v}" ${(t.repeat || "none") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="f">Continues from<select id="t-parent"><option value="">Nothing, it's a new piece of work</option>${others.map((x) => `<option value="${esc(x.id)}" ${x.id === t.parentId ? "selected" : ""}>${esc(x.title)}</option>`).join("")}</select></label>
    </div>
    <div class="f doc-sec"><span class="flab">Result / impact</span>
      <input id="t-impact-line" class="inp" value="${esc(t.impactLine ?? (t.impactHtml ? "" : t.impact || ""))}" placeholder="In one line, for your resume, e.g. Found 120 wrong part codes before they reached the ERP">
      ${docList(t, "impact", true)}${docAdder("impact")}
      <details class="write-in" ${t.impactHtml ? "open" : ""}><summary>Write it out here instead</summary>${rteHTML("t-impact", t.impactHtml || "", "Why it matters, key findings…", "short")}</details></div>
    <div class="f doc-sec"><span class="flab">Notes for the whole task</span>
      ${docList(t, "notes", true)}${docAdder("notes")}
      <details class="write-in" ${t.notesHtml || t.notes ? "open" : ""}><summary>Write notes here instead</summary>${rteHTML("t-notes", rich(t, "notes"), "SQL, file paths, things to remember", "mono")}</details></div>
    ${isNew ? "" : `<p class="small muted tk-time">${SVG(ICON.timer)} Time spent: ${mins ? fmtMins(mins) : "none yet"} · <button type="button" class="linkbtn small" data-logtime="task|${esc(t.id)}|${esc(t.title || "")}">log or edit time</button></p>`}`;
}
function editLog(t) {
  return `<div class="plg-add">
      <textarea id="t-note" rows="1" placeholder="What happened? e.g. Finished joining the sales tables" class="inp grow1" aria-label="Update"></textarea>
      <textarea id="t-memo" rows="1" class="inp grow1" placeholder="Memo or notes (optional)" aria-label="Memo"></textarea>
      <div class="plg-add-row"><div class="seg sm" id="t-logst" aria-label="Status of this update">${LOG_ST.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${logSt === v}">${l}</button>`).join("")}</div><button type="button" class="when-chip" id="t-logwhen" title="When did this happen?">${SVG(ICON.edit)}${logAt ? esc(whenTxt(logAt)) : daySel === todayKey() ? "Now" : esc(fmtDate(daySel))}</button><button class="btn sm primary" type="button" id="t-addnote">Add to log</button></div>
    </div>
    <div class="plg-wrap e"><div class="plg-top"><span class="flab">Progress log</span><span class="small muted">tap a row to change its time or text</span></div><div class="plg-list">${drawLog(t, true)}</div></div>`;
}

// ---------- reading the form (only the fields on the current edit tab exist)
const val = (id) => {
  const el = document.getElementById(id);
  return el ? el.value : null;
};
function readTaskForm() {
  const t = editing;
  if (mode !== "edit") return;
  document.querySelectorAll("#tf [data-subtext]").forEach((el) => {
    const s = t.subtasks[+el.dataset.subtext];
    if (s && el.value.trim()) s.text = el.value.replace(/\s*\n\s*/g, " ").trim();
  });
  document.querySelectorAll("#tf [data-subnote]").forEach((el) => {
    const s = t.subtasks[+el.dataset.subnote];
    if (s) s.note = el.value.trim();
  });
  document.querySelectorAll("#tf [data-bnissue]").forEach((el) => {
    const x = t.bottlenecks[+el.dataset.bnissue];
    if (x) x.issue = el.value.trim();
  });
  document.querySelectorAll("#tf [data-bnhow]").forEach((el) => {
    const x = t.bottlenecks[+el.dataset.bnhow];
    if (x) x.how = el.value.trim();
  });
  const pg = t.days.find((p) => p.day === daySel);
  if (pg && $("#t-desc")) {
    pg.overviewHtml = rteVal("t-dover");
    pg.html = rteVal("t-desc");
  }
  if ($("#t-title")) {
    t.title = val("t-title").replace(/\s*\n\s*/g, " ").trim();
    t.overviewHtml = rteVal("t-overview");
    t.overview = toPlain(t.overviewHtml);
    t._dueNew = val("t-due");
    if (val("t-duewhy") !== null) t._dueWhy = val("t-duewhy").trim();
    t.category = val("t-cat");
    t.assignedBy = (val("t-by") || "").trim();
    t.repeat = val("t-repeat");
    t.parentId = val("t-parent");
    if (!t.subtasks.length && $("#t-prog")) t.progress = +val("t-prog");
    t.impactHtml = rteVal("t-impact");
    t.impactLine = (val("t-impact-line") || "").trim();
    // the one-liner is what resume bullets use; otherwise fall back to the written result
    t.impact =
      t.impactLine ||
      toPlain(t.impactHtml)
        .split("\n")
        .map((x) => x.replace(/^(• |\d+\. )/, "").trim())
        .filter(Boolean)
        .join("; ");
    t.notesHtml = rteVal("t-notes");
    t.notes = toPlain(t.notesHtml);
  }
}
// the deadline field: moving it keeps a history and a log line
function applyDue(t) {
  if (t._dueNew === undefined || t._dueNew === null) return;
  const to = t._dueNew || "",
    from = t.due || "";
  if (to !== from) {
    if (from) t.dueHistory = [...(t.dueHistory || []), { from, to, at: nowISO(), why: t._dueWhy || "" }];
    if (!isNew) t.log.push({ at: nowISO(), note: `Deadline: ${from ? fmtDate(from) : "none"} → ${to ? fmtDate(to) : "none"}`, ...(t._dueWhy ? { memo: t._dueWhy } : {}) });
    t.due = to;
  }
  delete t._dueNew;
  delete t._dueWhy;
}
function redrawKeep(focusId) {
  pageDelAsk = false;
  const sc = window.scrollY,
    lsc = $("#tf .plg-list")?.scrollTop,
    keep = ["t-note", "t-memo", "t-subnew", "t-linkurl", "t-linklabel", "t-doc-impact-url", "t-doc-impact-name", "t-doc-notes-url", "t-doc-notes-name", "t-doc-det-url", "t-doc-det-name"].map((id) => [id, $("#" + id)?.value || ""]);
  drawTask();
  keep.forEach(([id, v]) => {
    if (v && id !== focusId && $("#" + id)) $("#" + id).value = v;
  });
  growAll();
  window.scrollTo(0, sc);
  if (focusId === "t-note" && $("#tf .plg-list")) $("#tf .plg-list").scrollTop = 0;
  else if (lsc !== undefined && $("#tf .plg-list")) $("#tf .plg-list").scrollTop = lsc;
  clampMore();
  if (focusId) $("#" + focusId)?.focus();
}
function goDay(d) {
  readTaskForm();
  daySel = d;
  pageDelAsk = false;
  drawTask();
  afterDraw();
}
function goMode(m, tab) {
  readTaskForm();
  mode = m;
  if (tab) etab = tab;
  confirmDel = false;
  drawTask();
  window.scrollTo(0, 0);
  afterDraw();
  if (m === "edit" && etab === "log") $("#t-note")?.focus();
}
const growTA = (el) => {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + 2 + "px";
};
const growAll = () => document.querySelectorAll("#tf textarea.grow1").forEach(growTA);

function editWhen(title, iso, set) {
  const d = iso ? new Date(iso) : new Date();
  hub.editDlg(
    title,
    [
      { k: "date", label: "Date", type: "date", value: dkey(d) },
      { k: "time", label: "Time", type: "time", value: pad2(d.getHours()) + ":" + pad2(d.getMinutes()) },
    ],
    (v) => {
      const at = new Date(`${v.date || dkey(d)}T${v.time || "12:00"}`);
      if (!isNaN(at)) set(at.toISOString());
      redrawKeep();
    },
  );
}
function pendingLog() {
  const n = (val("t-note") || "").trim(),
    m = (val("t-memo") || "").trim();
  if (!n && !m) return null;
  const e = { at: logAt || dayAt(daySel), note: n || m.split("\n")[0].slice(0, 80) };
  if (m && n) e.memo = m;
  if (logSt) e.status = logSt;
  return e;
}

// ---------- events
$("#tf").addEventListener("input", (e) => {
  if (e.target.id === "t-prog") $("#t-pv").textContent = e.target.value + "%";
  if (e.target.classList.contains("grow1")) growTA(e.target);
});
$("#tf").addEventListener("change", (e) => {
  // ticking a step on the summary saves straight away
  const v = e.target.dataset.vtog;
  if (v !== undefined) {
    const s = editing.subtasks[+v];
    s.done = e.target.checked;
    s.doneAt = s.done ? dayAt(daySel) : "";
    autoProgress();
    saveTask("stay");
    drawTask();
    afterDraw();
    return;
  }
  if (e.target.dataset.bnchk !== undefined) {
    readTaskForm();
    const t = editing,
      x = t.bottlenecks[+e.target.dataset.bnchk],
      v = e.target.checked;
    if (x.solved !== v) x.solvedAt = v ? dayAt(daySel) : "";
    x.solved = v;
    if (v && t.status === "blocked" && t.bottlenecks.every((y) => y.solved || !y.issue)) t.status = "doing";
    redrawKeep();
    if (v) document.querySelector(`#tf [data-bnhow="${e.target.dataset.bnchk}"]`)?.focus();
    return;
  }
  const i = e.target.dataset.subtog;
  if (i === undefined) return;
  readTaskForm();
  const s = editing.subtasks[+i];
  s.done = e.target.checked;
  s.doneAt = s.done ? dayAt(daySel) : "";
  autoProgress();
  redrawKeep();
});
$("#tf").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || !$("#tf").contains(b)) return;
  const t = editing;
  if (b.classList.contains("more")) {
    b.previousElementSibling.classList.add("open");
    b.remove();
  } else if (b.dataset.docadd) {
    readTaskForm();
    const k = b.dataset.docadd;
    let u = (val(`t-doc-${k}-url`) || "").trim();
    if (!u) return $(`#t-doc-${k}-url`).focus();
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    const o = k === "det" ? curPage() : t; // "det": the day's details & findings
    o[k + "Docs"] = [...(o[k + "Docs"] || []), { url: u, label: (val(`t-doc-${k}-name`) || "").trim() }];
    $(`#t-doc-${k}-name`).value = "";
    redrawKeep(`t-doc-${k}-url`);
  } else if (b.dataset.docdel) {
    readTaskForm();
    const [k, i] = b.dataset.docdel.split(":");
    (k === "det" ? curPage() : t)[k + "Docs"].splice(+i, 1);
    redrawKeep();
  } else if (b.dataset.fillnone) {
    const pg = curPage();
    pg.none = [...new Set([...(pg.none || []), b.dataset.fillnone])];
    saveTask("stay");
    drawTask();
    afterDraw();
  } else if (b.dataset.tlx) {
    const k = b.dataset.tlx;
    tlExp.has(k) ? tlExp.delete(k) : tlExp.add(k);
    const l = $("#tf .plg-list"),
      sc = l.scrollTop;
    l.innerHTML = drawLog(t, mode === "edit");
    l.scrollTop = sc;
  } else if (b.dataset.tlview) {
    tlView = b.dataset.tlview;
    $("#tf .plg-list").innerHTML = drawLog(t, mode === "edit");
  } else if (b.dataset.tlscope) {
    tlScope = b.dataset.tlscope;
    $("#tf .plg-list").innerHTML = drawLog(t, mode === "edit");
    clampMore();
  } else if (b.dataset.fill) {
    // jump from the "still to fill in" list to the right field
    const [kind, arg] = b.dataset.fill.split(":");
    if (kind === "today") {
      addPage(t, todayKey());
      daySel = todayKey();
      goMode("edit", "day");
      $("#t-dover")?.focus();
    } else if (kind === "daybn") {
      goMode("edit", "day");
      $("#t-bnadd")?.click();
    } else if (kind === "bn") {
      const x = t.bottlenecks[+arg];
      bnOpen.add(x.id);
      daySel = x.day;
      goMode("edit", "day");
      const el = document.querySelector(`#tf [data-bnhow="${arg}"]`);
      el?.scrollIntoView({ block: "center" });
      el?.focus();
    } else {
      goMode("edit", kind);
      // wait a tick so date boxes are set up before focusing
      setTimeout(() => {
        const el = document.getElementById(arg);
        if (!el) return;
        const tgt = el.classList.contains("dd-native") ? el.parentElement.querySelector(".dd-text") || el : el;
        tgt.scrollIntoView({ block: "center" });
        tgt.focus();
      }, 30);
    }
  } else if (b.dataset.tlall) {
    tlOpen[b.dataset.tlall + "+"] = true;
    const l = $("#tf .plg-list");
    l.innerHTML = drawLog(t, mode === "edit");
    clampMore();
  } else if (b.dataset.subnoteadd !== undefined) {
    readTaskForm();
    t.subtasks[+b.dataset.subnoteadd].note = "";
    redrawKeep();
    document.querySelector(`#tf [data-subnote="${b.dataset.subnoteadd}"]`)?.focus();
  } else if (b.dataset.day) goDay(b.dataset.day);
  else if (b.dataset.goedit) goMode("edit", b.dataset.goedit);
  else if (b.dataset.etab) goMode("edit", b.dataset.etab);
  else if (b.id === "t-close") leave();
  else if (b.id === "t-back") {
    if (isNew) {
      editing = null;
      isNew = false;
      return t.parentId ? openTask(t.parentId) : leave();
    }
    loadTask(t.id, { day: daySel });
  } else if (b.id === "t-dayadd") {
    readTaskForm();
    const add = (d) => {
      addPage(t, d);
      daySel = d;
      goMode("edit", "day");
    };
    if (!t.days.some((p) => p.day === todayKey())) add(todayKey());
    else hub.editDlg("Add a work day", [{ k: "day", label: "Date", type: "date", value: todayKey() }], (v) => v.day && add(v.day));
  } else if (b.dataset.pagedate !== undefined) {
    readTaskForm();
    const pg = t.days.find((p) => p.day === daySel);
    hub.editDlg("Move this day page", [{ k: "day", label: "Date", type: "date", value: pg.day }], (v) => {
      if (!v.day || v.day === pg.day) return;
      if (t.days.some((p) => p.day === v.day)) return toast("There's already a page for " + fmtDate(v.day));
      [...t.subtasks, ...t.bottlenecks, ...t.links].forEach((x) => x.day === pg.day && (x.day = v.day));
      pg.day = v.day;
      t.days.sort((a, b) => a.day.localeCompare(b.day));
      goDay(v.day);
    });
  } else if (b.dataset.pagedel !== undefined) {
    readTaskForm();
    const d = daySel,
      has = (x) => x.day === d;
    const pg = t.days.find((p) => p.day === d);
    const filled = pg.html || pg.overviewHtml || t.subtasks.some(has) || t.bottlenecks.some(has) || t.links.some(has);
    if (filled && !pageDelAsk) {
      pageDelAsk = true;
      b.textContent = "Tap again: removes its steps and links too";
      return;
    }
    t.subtasks = t.subtasks.filter((x) => !has(x));
    t.bottlenecks = t.bottlenecks.filter((x) => !has(x));
    t.links = t.links.filter((x) => !has(x));
    t.days = t.days.filter((p) => p !== pg);
    autoProgress();
    goDay(t.days.at(-1).day);
  } else if (b.dataset.openrel) {
    if (mode === "edit") {
      readTaskForm();
      if (!saveTask("stay")) return;
    }
    openTask(b.dataset.openrel);
  } else if (b.id === "t-follow") {
    openTask({
      id: newId(),
      title: "",
      parentId: t.id,
      category: t.category || "",
      assignedBy: t.assignedBy || "",
      urgency: t.urgency || "medium",
      status: "todo",
      progress: 0,
      due: "",
      repeat: "none",
      createdAt: nowISO(),
      log: [{ at: nowISO(), note: `Follow-up of ${t.title}` }],
      days: [{ id: newSubId(), day: todayKey(), overviewHtml: "", html: "" }],
    });
  } else if (b.parentElement.id === "t-st") {
    readTaskForm();
    t.status = b.dataset.v;
    if (b.dataset.v === "done") t.progress = 100;
    redrawKeep(b.dataset.v === "done" ? "t-impact" : null);
  } else if (b.parentElement.id === "t-urg") {
    readTaskForm();
    t.urgency = b.dataset.v;
    redrawKeep();
  } else if (b.dataset.stx) {
    readTaskForm();
    const id = b.dataset.stx;
    stOpen.has(id) ? stOpen.delete(id) : stOpen.add(id);
    redrawKeep();
    if (stOpen.has(id)) b.closest("li")?.querySelector("textarea.sub-note");
  } else if (b.dataset.vstx) {
    const id = b.dataset.vstx;
    vstOpen.has(id) ? vstOpen.delete(id) : vstOpen.add(id);
    drawTask();
    afterDraw();
  } else if (b.dataset.bnx) {
    readTaskForm();
    const id = b.dataset.bnx;
    bnOpen.has(id) ? bnOpen.delete(id) : bnOpen.add(id);
    redrawKeep();
  } else if (b.dataset.bnfix !== undefined) {
    readTaskForm();
    const x = t.bottlenecks[+b.dataset.bnfix],
      sv = new Date(x.solvedAt);
    // start from the solved day, an hour before it was solved
    editWhen("When did you run into this?", new Date(sv - 36e5).toISOString(), (iso) => (x.at = iso));
  } else if (b.parentElement.dataset.bnsolved !== undefined) {
    readTaskForm();
    const x = t.bottlenecks[+b.parentElement.dataset.bnsolved],
      v = b.dataset.v === "1";
    if (x.solved !== v) x.solvedAt = v ? dayAt(daySel) : "";
    x.solved = v;
    if (v && t.status === "blocked" && t.bottlenecks.every((y) => y.solved || !y.issue)) t.status = "doing";
    redrawKeep();
    if (v) document.querySelector(`#tf [data-bnhow="${b.parentElement.dataset.bnsolved}"]`)?.focus();
  } else if (b.id === "t-bnadd") {
    readTaskForm();
    const nb = { id: newSubId(), issue: "", solved: false, how: "", at: dayAt(daySel), day: daySel };
    t.bottlenecks.push(nb);
    bnOpen.add(nb.id);
    redrawKeep();
    document.querySelector(`#tf [data-bnissue="${t.bottlenecks.length - 1}"]`)?.focus();
  } else if (b.dataset.bndel !== undefined) {
    readTaskForm();
    t.bottlenecks.splice(+b.dataset.bndel, 1);
    redrawKeep();
  } else if (b.dataset.bnat !== undefined) {
    readTaskForm();
    const x = t.bottlenecks[+b.dataset.bnat];
    editWhen("When did you run into this?", x.at, (iso) => (x.at = iso));
  } else if (b.dataset.bnwhen !== undefined) {
    readTaskForm();
    const x = t.bottlenecks[+b.dataset.bnwhen];
    editWhen("When did you solve it?", x.solvedAt, (iso) => (x.solvedAt = iso));
  } else if (b.dataset.subwhen !== undefined) {
    readTaskForm();
    const x = t.subtasks[+b.dataset.subwhen];
    editWhen("When did you do this step?", x.doneAt, (iso) => (x.doneAt = iso));
  } else if (b.id === "t-logwhen") {
    readTaskForm();
    editWhen("When did this happen?", logAt || dayAt(daySel), (iso) => (logAt = iso));
  } else if (b.parentElement.id === "t-logst") {
    logSt = logSt === b.dataset.v ? "" : b.dataset.v;
    b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === logSt));
  } else if (b.id === "t-addnote") {
    readTaskForm();
    const e = pendingLog();
    if (e) {
      t.log.push(e);
      logSt = logAt = "";
      $("#t-memo").value = "";
      redrawKeep("t-note");
    }
  } else if (b.dataset.logedit !== undefined) {
    readTaskForm();
    const i = +b.dataset.logedit,
      l = t.log[i];
    if (!l) return;
    const dt = new Date(l.at);
    hub.editDlg(
      "Edit update",
      [
        { k: "date", label: "Date", type: "date", value: isoDay(l.at) },
        { k: "time", label: "Time", type: "time", value: fmtTime(l.at) },
        { k: "note", label: "Update", type: "textarea", value: l.note || "" },
        { k: "status", label: "Status", type: "select", value: l.status || "", options: [["", "—"], ...LOG_ST] },
        { k: "memo", label: "Memo / notes", type: "textarea", value: l.memo || "" },
      ],
      (v) => {
        const at = v.date ? new Date(`${v.date}T${v.time || pad2(dt.getHours()) + ":" + pad2(dt.getMinutes())}`) : dt;
        const n = { ...l, at: isNaN(at) ? l.at : at.toISOString(), note: v.note || l.note };
        if (v.status) n.status = v.status;
        else delete n.status;
        if (v.memo) n.memo = v.memo;
        else delete n.memo;
        t.log[i] = n;
        t.log.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
        redrawKeep();
      },
      () => {
        t.log.splice(i, 1);
        redrawKeep();
      },
    );
  } else if (b.id === "t-subadd") {
    readTaskForm();
    const n = (val("t-subnew") || "").replace(/\s*\n\s*/g, " ").trim();
    if (n) {
      t.subtasks.push({ id: newSubId(), text: n, done: false, day: daySel });
      autoProgress();
      redrawKeep("t-subnew");
    }
  } else if (b.dataset.subdel !== undefined) {
    readTaskForm();
    t.subtasks.splice(+b.dataset.subdel, 1);
    autoProgress();
    redrawKeep();
  } else if (b.id === "t-linkadd") {
    readTaskForm();
    let u = (val("t-linkurl") || "").trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    t.links.push({ url: u, label: (val("t-linklabel") || "").trim(), day: daySel });
    $("#t-linklabel").value = "";
    redrawKeep("t-linkurl");
  } else if (b.dataset.linkedit !== undefined) {
    readTaskForm();
    const i = +b.dataset.linkedit,
      l = t.links[i];
    if (l)
      hub.editDlg(
        "Edit link",
        [
          { k: "label", label: "Name", value: l.label || "" },
          { k: "url", label: "Link", type: "url", value: l.url },
        ],
        (v) => {
          if (!v.url) return;
          t.links[i] = { ...l, label: v.label, url: /^https?:\/\//i.test(v.url) ? v.url : "https://" + v.url };
          redrawKeep();
        },
      );
  } else if (b.dataset.linkdel !== undefined) {
    readTaskForm();
    t.links.splice(+b.dataset.linkdel, 1);
    redrawKeep();
  } else if (b.id === "t-del") {
    if (!confirmDel) {
      readTaskForm();
      confirmDel = true;
      redrawKeep();
    } else {
      if (S.timer && S.timer.ref === t.id) hub.stopTimer(false);
      del("tasks", t.id);
      editing = null;
      leave();
      toast("Task deleted");
    }
  } else if (b.id === "t-save") {
    readTaskForm();
    if (saveTask("view")) {
      mode = "view";
      if (S.taskId !== t.id) {
        S.taskId = t.id;
        history.replaceState(null, "", "#task/" + t.id);
        shownHash = location.hash;
      }
      drawTask();
      window.scrollTo(0, 0);
      afterDraw();
    }
  }
});
$("#tf").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.matches && e.target.matches("textarea.grow1") && !e.shiftKey) {
    if (e.target.id === "t-memo") return;
    if (e.target.id !== "t-note" && e.target.id !== "t-subnew") {
      e.preventDefault();
      return;
    }
  }
  const map = { "t-note": "t-addnote", "t-subnew": "t-subadd", "t-linkurl": "t-linkadd", "t-linklabel": "t-linkadd" };
  const dm = (e.target.id || "").match(/^t-doc-(\w+)-(url|name)$/);
  if (dm) {
    e.preventDefault();
    document.querySelector(`#tf [data-docadd="${dm[1]}"]`).click();
  } else if (map[e.target.id]) {
    e.preventDefault();
    $("#" + map[e.target.id]).click();
  }
});

// ---------- saving
function nextDue(from, rep) {
  const [y, m, d] = from.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (rep === "daily") dt.setDate(dt.getDate() + 1);
  else if (rep === "weekdays") {
    do {
      dt.setDate(dt.getDate() + 1);
    } while (isWeekend(dt.getDay()));
  } else if (rep === "weekly") dt.setDate(dt.getDate() + 7);
  else if (rep === "monthly") {
    const target = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0).getDate();
    target.setDate(Math.min(d, last));
    return dkey(target);
  }
  return dkey(dt);
}
// after: "close" shuts the window, "view" goes back to the summary, "stay" saves quietly
function saveTask(after = "close") {
  const t = editing,
    old = isNew ? {} : S.tasks.find((x) => x.id === t.id) || {};
  if (!t.title) {
    toast("Give the task a name first");
    if (mode === "edit" && etab !== "task") goMode("edit", "task");
    $("#t-title")?.focus();
    return false;
  }
  applyDue(t);
  const pending = pendingLog();
  if (pending) t.log.push(pending);
  logSt = logAt = "";
  const oldDone = new Set((old.subtasks || []).filter((s) => s.done).map((s) => s.id));
  t.subtasks
    .filter((s) => s.done && !oldDone.has(s.id))
    .forEach((s) => t.log.push({ at: s.doneAt || nowISO(), note: `Step done: ${s.text}` }));
  // a step's done time changed later: move its log entry too
  (old.subtasks || []).forEach((o) => {
    const s = t.subtasks.find((x) => x.id === o.id);
    if (!s || !s.done || !o.done || !s.doneAt || s.doneAt === o.doneAt) return;
    const e = t.log.findLast((l) => l.note === `Step done: ${o.text}`);
    if (e) e.at = s.doneAt;
  });
  if (!isNew && old.status !== t.status)
    t.log.push({ at: nowISO(), note: `Status: ${STATUS_LABEL[old.status] || "—"} → ${STATUS_LABEL[t.status]}` });
  if (!isNew && (+old.progress || 0) !== (+t.progress || 0))
    t.log.push({ at: nowISO(), note: `Progress ${+old.progress || 0}% → ${+t.progress || 0}%` });
  t.bottlenecks = t.bottlenecks.filter((x) => x.issue);
  const oldL = bnList(old),
    oldBn = new Map(oldL.map((x) => [x.id, x])),
    oldIssues = new Set(oldL.map((x) => x.issue));
  t.bottlenecks.forEach((x) => {
    const o = oldBn.get(x.id) || oldL.find((y) => y.issue === x.issue);
    if (!o ? !oldIssues.has(x.issue) : o.issue !== x.issue) t.log.push({ at: x.at || nowISO(), note: `Bottleneck: ${x.issue}` });
    if (x.solved && !(o && o.solved))
      t.log.push({ at: x.solvedAt || nowISO(), note: `Bottleneck solved: ${x.issue}`, ...(x.how ? { memo: "How: " + x.how } : {}) });
    if (o && o.issue === x.issue && x.at && o.at && x.at !== o.at) {
      const e = t.log.findLast((l) => l.note === `Bottleneck: ${o.issue}`);
      if (e) e.at = x.at;
    }
    if (x.solved && o && o.solved && x.solvedAt && x.solvedAt !== o.solvedAt) {
      const e = t.log.findLast((l) => l.note === `Bottleneck solved: ${o.issue}`);
      if (e) e.at = x.solvedAt;
    }
  });
  bnSummary(t);
  // day pages: drop empty ones, keep plain text for cards, reports and search
  const used = (d) => [...t.subtasks, ...t.bottlenecks, ...t.links].some((x) => x.day === d);
  t.days.forEach((p) => {
    if (!p.none) return;
    const has = { steps: t.subtasks, bn: t.bottlenecks, links: t.links };
    p.none = p.none.filter((k) => !has[k].some((x) => x.day === p.day));
    if (!p.none.length) delete p.none;
  });
  t.days = t.days.filter((p) => p.html || p.overviewHtml || p.none || (p.detDocs || []).length || used(p.day));
  const many = t.days.length > 1;
  t.desc = t.days
    .filter((p) => p.html || p.overviewHtml)
    .map((p) => (many ? fmtDate(p.day) + ": " : "") + [toPlain(p.overviewHtml), toPlain(p.html)].filter(Boolean).join("\n"))
    .join("\n");
  t.descHtml = ([...t.days].reverse().find((p) => p.html) || {}).html || "";
  delete t.records;
  if (!t.parentId) delete t.parentId;
  t.log.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
  if (t.impact && t.impact !== old.impact) {
    const first = toPlain(t.impactHtml || "").split("\n").find((x) => x.trim()) || t.impact;
    t.log.push({ at: nowISO(), note: `Result: ${first.length > 90 ? first.slice(0, 88) + "…" : first}`, ...(old.impact ? { memo: "Result / impact updated" } : {}) });
  }
  const justDone = t.status === "done" && old.status !== "done";
  if (justDone) t.doneAt = nowISO();
  if (t.status !== "done") t.doneAt = "";
  t.updatedAt = nowISO();
  if (t.log.length > 200) t.log = t.log.slice(-200);
  if (justDone && S.timer && S.timer.ref === t.id) hub.stopTimer(false);
  put("tasks", t.id, strip(t));
  // the window always needs a page to show, even when nothing is written yet
  if (!t.days.length) t.days.push({ id: newSubId(), day: daySel || todayKey(), overviewHtml: "", html: "" });
  // keep the local list current so connected tasks show straight away
  const ix = S.tasks.findIndex((x) => x.id === t.id),
    snap = JSON.parse(JSON.stringify(t));
  if (ix < 0) S.tasks.push(snap);
  else S.tasks[ix] = snap;
  isNew = false;
  if (after === "close") leave();
  if (justDone && t.repeat && t.repeat !== "none") {
    const due = nextDue(t.due || todayKey(), t.repeat),
      id = newId();
    put("tasks", id, {
      title: t.title,
      overview: t.overview || "",
      overviewHtml: t.overviewHtml || "",
      desc: "",
      descHtml: "",
      days: [],
      category: t.category || "",
      urgency: t.urgency,
      status: "todo",
      progress: 0,
      bottleneck: "",
      bottlenecks: [],
      assignedBy: t.assignedBy || "",
      due,
      repeat: t.repeat,
      notes: t.notes || "",
      notesHtml: t.notesHtml || "",
      links: (t.links || []).map((l) => ({ url: l.url, label: l.label })),
      subtasks: (t.subtasks || []).map((s) => ({ id: newSubId(), text: s.text, done: false })),
      impact: "",
      createdAt: nowISO(),
      updatedAt: nowISO(),
      doneAt: "",
      log: [{ at: nowISO(), note: `Task added (repeats ${(REPEAT_SHORT[t.repeat] || "").toLowerCase()})` }],
    });
    toast("Done. Next one added for " + fmtDate(due));
  } else if (after !== "stay") toast("Saved");
  return true;
}

const taskEditing = (id) => mode === "edit" && editing && editing.id === id;
export { editing, newSubId, openTask, readTaskForm, redrawKeep, taskEditing };
