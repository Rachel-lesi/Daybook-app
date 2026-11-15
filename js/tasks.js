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
import { fromPlain, rteHTML, rteVal, toPlain } from "./rte.js";

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
function drawLog(t) {
  const L = t.log.map((l, i) => ({ l, i })).sort((a, b) => (a.l.at || "").localeCompare(b.l.at || "")); // oldest first
  if (!L.length) return '<p class="small muted plg-empty">No updates yet. Log what you did, what you\'re waiting on, or a decision you made.</p>';
  let day = "",
    h = "";
  L.forEach(({ l, i }) => {
    const d = isoDay(l.at);
    if (d !== day) {
      if (day) h += "</ol>";
      h += `<div class="plg-day ${d === daySel ? "sel" : ""}" data-logday="${d}">${esc(dayLbl(d))}</div><ol class="plog ${d === daySel ? "sel" : ""}">`;
      day = d;
    }
    const [k, kl] = logKind(l.note || "");
    h += `<li class="plg-${k}"><span class="plg-dot" aria-hidden="true"></span><div class="plg-body">
      <div class="plg-head"><time>${fmtTime(l.at)}</time><span class="plg-kind">${kl}</span>${l.status ? `<span class="plg-st st-${esc(l.status)}">${esc(LOG_ST_LABEL[l.status] || l.status)}</span>` : ""}<button type="button" class="x tl-ed" data-logedit="${i}" aria-label="Edit this update" title="Edit time or text">${SVG(ICON.edit)}</button></div>
      <div class="plg-note">${["upd", "new", "time", "prog", "stat", "due"].includes(k) ? esc(l.note) : esc(stripKind(l.note))}</div>
      ${l.memo ? `<div class="plg-memo">${esc(l.memo)}</div>` : ""}</div></li>`;
  });
  return h + "</ol>";
}
// show the selected day's part of the log
const logToDay = () => {
  const l = $("#tf .plg-list");
  if (!l) return;
  const d = l.querySelector(`[data-logday="${daySel}"]`);
  l.scrollTop = d ? d.offsetTop - l.offsetTop - 4 : l.scrollHeight;
};

// ---------- open
function openTask(id) {
  const t = typeof id === "object" ? id : S.tasks.find((x) => x.id === id);
  if (!t) return;
  isNew = typeof id === "object";
  editing = {
    ...t,
    log: [...(t.log || [])],
    subtasks: (t.subtasks || []).map((s) => ({ ...s })),
    links: (t.links || []).map((l) => ({ ...l })),
    bottlenecks: bnList(t).map((x) => ({ ...x })),
    days: pageList(t),
  };
  ensurePages();
  daySel = editing.days.some((p) => p.day === todayKey()) ? todayKey() : editing.days.at(-1).day;
  confirmDel = pageDelAsk = false;
  logSt = logAt = "";
  drawTask();
  const d = $("#dlg");
  if (!d.open) {
    const touch = matchMedia("(hover: none)").matches;
    d.toggleAttribute("autofocus", touch);
    if (touch) d.tabIndex = -1;
    d.showModal();
    if (touch) d.focus({ preventScroll: true });
  }
  d.scrollTop = 0;
  growAll();
  logToDay();
  if (isNew) $("#t-title").focus();
}
function autoProgress() {
  const s = editing.subtasks;
  if (!s.length) return;
  editing.progress = Math.round((s.filter((x) => x.done).length / s.length) * 100);
  if (editing.progress > 0 && editing.status === "todo") editing.status = "doing";
}

// ---------- drawing
const sec = (cls, icon, title, hint, body) =>
  `<section class="dsec ${cls}"><div class="dsec-h"><span class="dsec-ic">${SVG(ICON[icon])}</span><span class="dsec-t">${title}</span>${hint ? `<span class="dsec-hint">${hint}</span>` : ""}</div>${body}</section>`;
function dueInfo(t) {
  if (!t.due) return { main: "No deadline", sub: "tap to set", cls: "none" };
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
const stepLi = (s, i, carry) =>
  `<li class="${s.done ? "done" : ""}"><input type="checkbox" data-subtog="${i}" ${s.done ? "checked" : ""} aria-label="Step done: ${esc(s.text)}"><span class="sub-main"><textarea class="sub-in grow1" rows="1" data-subtext="${i}" aria-label="Step">${esc(s.text)}</textarea>${carry ? `<span class="carry-from">from ${esc(dayLbl(s.day))}</span>` : ""}${s.done ? `<button type="button" class="when-chip" data-subwhen="${i}" title="Change when you did this">${SVG(ICON.edit)}Done ${esc(whenTxt(s.doneAt) || "· set time")}</button>` : ""}</span>${carry ? "" : `<button type="button" class="x" data-subdel="${i}" aria-label="Remove step">✕</button>`}</li>`;
function drawTask() {
  const t = editing;
  let pg = t.days.find((p) => p.day === daySel);
  if (!pg) {
    pg = t.days.at(-1);
    daySel = pg.day;
  }
  const pi = t.days.indexOf(pg),
    isLast = pi === t.days.length - 1,
    subs = t.subtasks,
    sd = subs.filter((s) => s.done).length,
    mins = taskMins(t.id),
    prog = Math.max(0, Math.min(100, +t.progress || 0)),
    due = dueInfo(t),
    parent = t.parentId && S.tasks.find((x) => x.id === t.parentId),
    kids = isNew ? [] : S.tasks.filter((x) => x.parentId === t.id);
  const daySteps = subs.map((s, i) => [s, i]).filter(([s]) => s.day === pg.day),
    dayBn = t.bottlenecks.map((x, i) => [x, i]).filter(([x]) => x.day === pg.day),
    dayLinks = t.links.map((l, i) => [l, i]).filter(([l]) => l.day === pg.day);
  // on the newest page, things still open from earlier days come along
  const carrySteps = isLast ? subs.map((s, i) => [s, i]).filter(([s]) => !s.done && s.day < pg.day) : [],
    carryBn = isLast ? t.bottlenecks.map((x, i) => [x, i]).filter(([x]) => x.issue && !x.solved && x.day < pg.day) : [];
  const dstrip = t.days
    .map((p) => {
      const d = new Date(p.day + "T12:00"),
        openBn = t.bottlenecks.some((x) => x.day === p.day && x.issue && !x.solved),
        st = subs.filter((s) => s.day === p.day),
        allDone = st.length && st.every((s) => s.done);
      return `<button type="button" data-day="${p.day}" aria-pressed="${p.day === pg.day}" class="${p.day === todayKey() ? "is-today" : ""}" aria-label="${esc(fmtDate(p.day))}"><small>${d.toLocaleDateString("en-GB", { weekday: "short" })}</small><b>${d.getDate()}</b><small>${d.toLocaleDateString("en-GB", { month: "short" })}</small><span class="ddots">${openBn ? '<i class="d-bn"></i>' : ""}${allDone ? '<i class="d-ok"></i>' : st.length ? '<i class="d-st"></i>' : ""}</span></button>`;
    })
    .join("");
  const hasToday = t.days.some((p) => p.day === todayKey());
  const bnCard = (x, i, carry) => `<div class="bn-box ${x.solved ? "solved" : ""}">
        <div class="bn-top">${carry ? `<button type="button" class="carry-from linkish" data-day="${x.day}">from ${esc(dayLbl(x.day))} ›</button>` : ""}<button type="button" class="when-chip" data-bnat="${i}" title="Change when you ran into this">${SVG(ICON.edit)}Ran into it ${esc(whenTxt(x.at) || "· set time")}</button>${carry ? "" : `<button type="button" class="x" data-bndel="${i}" aria-label="Remove bottleneck" title="Remove">✕</button>`}</div>
        <textarea class="grow1 bn-issue" data-bnissue="${i}" rows="1" aria-label="What's in the way" placeholder="What's in the way? Waiting for data, access, clarification…">${esc(x.issue)}</textarea>
        <div class="bn-q"><span>Solved?</span><div class="seg sm" data-bnsolved="${i}"><button type="button" data-v="0" aria-pressed="${!x.solved}">Not yet</button><button type="button" data-v="1" aria-pressed="${!!x.solved}">Solved</button></div></div>
        ${x.solved ? `<textarea class="grow1 bn-how" data-bnhow="${i}" rows="1" aria-label="How I solved it" placeholder="How I solved it, e.g. asked IT for read access">${esc(x.how || "")}</textarea><button type="button" class="when-chip" data-bnwhen="${i}" title="Change when you solved it">${SVG(ICON.edit)}Solved ${esc(whenTxt(x.solvedAt) || "· set time")}</button>` : ""}
      </div>`;
  const others = S.tasks.filter((x) => x.id !== t.id && x.parentId !== t.id).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

  $("#tf").innerHTML =
    `<div class="dlg-top"><h3>Work task</h3><button type="button" class="iconbtn dlg-x" data-dlg-x aria-label="Close without saving" title="Close">✕</button></div>
    <div class="tk-grid">
    <div class="tk-hero" data-u="${esc(t.urgency || "medium")}">
      ${parent ? `<button type="button" class="tk-crumb" data-openrel="${esc(parent.id)}">↰ Continues from <b>${esc(parent.title)}</b></button>` : ""}
      <textarea id="t-title" class="tk-title grow1" rows="1" aria-label="Task name" placeholder="Task name, e.g. Part number naming convention check">${esc(t.title || "")}</textarea>
      <div class="tk-meta">
        <button type="button" class="tk-due ${due.cls}" id="t-duebtn" title="Set or move the deadline">${SVG(ICON.calendar)}<span><small>Deadline</small><b>${esc(due.main)}</b><small>${esc(due.sub)}</small></span></button>
        <div class="tk-prog"><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" class="rg-bg"/><circle cx="18" cy="18" r="15.9" class="rg-fg" stroke-dasharray="${prog} 100"/></svg><span><small>Progress</small><b id="t-pv">${prog}%</b>${subs.length ? `<small>${sd}/${subs.length} steps</small>` : `<input type="range" id="t-prog" min="0" max="100" step="5" value="${prog}" aria-label="Progress">`}</span></div>
        <label class="tk-sel st-${esc(t.status)}"><small>Status</small><select id="t-st">${STATUS.map(([k, l]) => `<option value="${k}" ${t.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="tk-sel u-${esc(t.urgency)}"><small>Urgency</small><select id="t-urg">${URG.map((u) => `<option value="${u}" ${t.urgency === u ? "selected" : ""}>${u[0].toUpperCase() + u.slice(1)}</option>`).join("")}</select></label>
      </div>
      <div class="tk-goal"><span class="flab">Goal of the whole task <span class="muted">· the big picture that stays the same</span></span>${rteHTML("t-overview", rich(t, "overview"), "e.g. Standardise part numbers across all plants so inventory reports match", "short")}</div>
    </div>
    <div class="tk-main">
      <div class="dnav"><div class="dnav-h"><span class="flab">Work days <span class="muted">· ${t.days.length} day${t.days.length === 1 ? "" : "s"} on this task</span></span></div>
        <div class="dstrip" role="tablist">${dstrip}<button type="button" class="dstrip-add" id="t-dayadd">${hasToday ? "+ Day" : "+ Today"}</button></div></div>
      <article class="dpage">
        <header class="dpage-h"><div><span class="dpage-n">Day ${pi + 1} of ${t.days.length}</span><h4>${esc(new Date(pg.day + "T12:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }))}${pg.day === todayKey() ? ' <span class="today-pill">Today</span>' : ""}</h4></div>
          <span class="dpage-act"><button type="button" class="when-chip" data-pagedate title="Move this page to another date">${SVG(ICON.edit)}Change date</button>${t.days.length > 1 ? `<button type="button" class="linkbtn small danger" data-pagedel>${pageDelAsk ? "Tap again: removes its steps and links too" : "Remove day"}</button>` : ""}</span></header>
        ${
          carrySteps.length || carryBn.length ?
            `<section class="carry"><div class="carry-h">${SVG(ICON.repeat)}Still open from earlier days</div>
          ${carrySteps.length ? `<ul class="subs">${carrySteps.map(([s, i]) => stepLi(s, i, true)).join("")}</ul>` : ""}
          ${carryBn.map(([x, i]) => bnCard(x, i, true)).join("")}</section>`
          : ""
        }
        ${sec("s-focus", "plan", "Focus of the day", "what today is about", rteHTML("t-dover", pg.overviewHtml || "", "e.g. Finish the family-level pattern checks for pipes", "short"))}
        ${sec("s-det", "note", "Details &amp; findings", pi ? "what's new since last time" : "what was asked, the data, the approach", rteHTML("t-desc", pg.html || "", pi ? "Findings, decisions, what changed today" : "What exactly was asked, expected output, where the data is"))}
        ${sec(
          "s-steps",
          "steps",
          "Steps",
          daySteps.length ? `${daySteps.filter(([s]) => s.done).length}/${daySteps.length} done today` : "",
          `${daySteps.length ? `<ul class="subs">${daySteps.map(([s, i]) => stepLi(s, i)).join("")}</ul>` : ""}
          <div class="qrow"><textarea id="t-subnew" rows="1" placeholder="Add a step for this day" class="inp grow1"></textarea><button class="btn sm" type="button" id="t-subadd">Add</button></div>`,
        )}
        ${sec(
          "s-bn",
          "flame",
          "Bottlenecks",
          dayBn.length ? `${dayBn.filter(([x]) => x.issue && !x.solved).length} open · ${dayBn.filter(([x]) => x.issue && x.solved).length} solved` : "",
          `${dayBn.map(([x, i]) => bnCard(x, i)).join("")}<button type="button" class="btn sm ghost bn-add" id="t-bnadd">+ Add a bottleneck</button>`,
        )}
        ${sec(
          "s-links",
          "link",
          "Links",
          "",
          `${dayLinks.length ? `<ul class="links">${dayLinks.map(([l, i]) => `<li>${SVG(ICON.link)}<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)}</a><button type="button" class="x tl-ed" data-linkedit="${i}" aria-label="Edit link" title="Edit">${SVG(ICON.edit)}</button><button type="button" class="x" data-linkdel="${i}" aria-label="Remove link">✕</button></li>`).join("")}</ul>` : ""}
          <div class="qrow rwrap"><input id="t-linkurl" type="url" placeholder="Paste a link (drive, sheet, ticket)" class="inp"><input id="t-linklabel" placeholder="Name (optional)" class="inp" style="max-width:170px"><button class="btn sm" type="button" id="t-linkadd">Add</button></div>`,
        )}
      </article>
      <details class="tk-about" ${aboutOpen ? "open" : ""}><summary><span class="flab">About this task</span><span class="small muted">category, assigned by, repeats, time, result, notes</span></summary>
        <div class="grid2">
          <label class="f">Category<select id="t-cat"><option value="">Uncategorised</option>${S.cats.map((c) => `<option value="${esc(c.tag)}" ${c.tag === t.category ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
          <label class="f">Assigned by<input id="t-by" value="${esc(t.assignedBy || "")}" placeholder="Supervisor's name"></label>
          <label class="f">Repeats<select id="t-repeat">${REPEAT.map(([v, l]) => `<option value="${v}" ${(t.repeat || "none") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <label class="f">Continues from<select id="t-parent"><option value="">Nothing, it's a new piece of work</option>${others.map((x) => `<option value="${esc(x.id)}" ${x.id === t.parentId ? "selected" : ""}>${esc(x.title)}</option>`).join("")}</select></label>
          <div class="f" style="display:grid;gap:4px"><span class="flab">Time spent</span><span class="tspent">${SVG(ICON.timer)}${mins ? fmtMins(mins) : "None yet"}<span class="muted small"> · ▶ on the card or </span><button type="button" class="linkbtn small" data-logtime="task|${esc(t.id)}|${esc(t.title || "")}">log time</button></span></div>
        </div>
        <div class="f"><span class="flab">Result / impact <span class="muted">· shows on your resume bullets</span></span>${rteHTML("t-impact", rich(t, "impact"), "e.g. Cut report time from 2 hours to 20 minutes", "short")}</div>
        <div class="f"><span class="flab">Notes for the whole task <span class="muted">· SQL, file paths, things to remember</span></span>${rteHTML("t-notes", rich(t, "notes"), "SELECT batch_id, COUNT(*) FROM production GROUP BY batch_id HAVING COUNT(*) > 1;", "mono")}</div>
      </details>
    </div>
    <aside class="tk-side">
      <section class="tk-rel ${!parent && !kids.length ? "empty" : ""}"><div class="flab">Connected tasks</div>
        ${parent ? `<button type="button" class="rel-row up" data-openrel="${esc(parent.id)}"><small>Continues from</small><b>${esc(parent.title)}</b><span class="st ${esc(parent.status)}">${esc(STATUS_LABEL[parent.status] || "")}</span></button>` : ""}
        ${kids.map((k) => `<button type="button" class="rel-row down" data-openrel="${esc(k.id)}"><small>Follow-up</small><b>${esc(k.title)}</b><span class="st ${esc(k.status)}">${esc(STATUS_LABEL[k.status] || "")}</span></button>`).join("")}
        ${isNew ? "" : '<button type="button" class="btn sm ghost rel-add" id="t-follow" title="When this task leads to a new one, start a follow-up so they stay linked">+ Start a follow-up task</button>'}
      </section>
      <section class="plg-wrap"><div class="plg-top"><span class="flab">Progress log</span><span class="small muted">${t.log.length} entr${t.log.length === 1 ? "y" : "ies"} · oldest first</span></div>
      <div class="plg-list">${drawLog(t)}</div>
      <div class="plg-add">
        <textarea id="t-note" rows="1" placeholder="Add an update, e.g. Finished joining the sales tables" class="inp grow1" aria-label="Update"></textarea>
        <textarea id="t-memo" rows="1" class="inp grow1" placeholder="Memo or notes (optional)" aria-label="Memo"></textarea>
        <div class="plg-add-row"><div class="seg sm" id="t-logst" aria-label="Status of this update">${LOG_ST.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${logSt === v}">${l}</button>`).join("")}</div><button type="button" class="when-chip" id="t-logwhen" title="When did this happen?">${SVG(ICON.edit)}${logAt ? esc(whenTxt(logAt)) : daySel === todayKey() ? "Now" : esc(fmtDate(daySel))}</button><button class="btn sm primary" type="button" id="t-addnote">Log update</button></div>
      </div></section>
    </aside>
    </div>
    <div class="dlgfoot">
      ${isNew ? "<span></span>" : `<button class="btn ghost danger sm" type="button" id="t-del">${confirmDel ? "Tap again to delete" : "Delete"}</button>`}
      <div style="display:flex;gap:8px"><button class="btn" type="button" id="t-cancel">Cancel</button><button class="btn primary" type="button" id="t-save">Save</button></div>
    </div>`;
  $("#tf .tk-about").addEventListener("toggle", (e) => (aboutOpen = e.target.open));
}

// ---------- reading the form
function readTaskForm() {
  const t = editing;
  document.querySelectorAll("#tf [data-subtext]").forEach((el) => {
    const s = t.subtasks[+el.dataset.subtext];
    if (s && el.value.trim()) s.text = el.value.replace(/\s*\n\s*/g, " ").trim();
  });
  t.title = $("#t-title").value.replace(/\s*\n\s*/g, " ").trim();
  t.overviewHtml = rteVal("t-overview");
  t.overview = toPlain(t.overviewHtml);
  const pg = t.days.find((p) => p.day === daySel);
  if (pg) {
    pg.overviewHtml = rteVal("t-dover");
    pg.html = rteVal("t-desc");
  }
  t.status = $("#t-st").value;
  t.urgency = $("#t-urg").value;
  if (!t.subtasks.length && $("#t-prog")) t.progress = +$("#t-prog").value;
  document.querySelectorAll("#tf [data-bnissue]").forEach((el) => {
    const x = t.bottlenecks[+el.dataset.bnissue];
    if (x) x.issue = el.value.trim();
  });
  document.querySelectorAll("#tf [data-bnhow]").forEach((el) => {
    const x = t.bottlenecks[+el.dataset.bnhow];
    if (x) x.how = el.value.trim();
  });
  t.category = $("#t-cat").value;
  t.assignedBy = $("#t-by").value.trim();
  t.repeat = $("#t-repeat").value;
  t.parentId = $("#t-parent").value;
  t.impactHtml = rteVal("t-impact");
  t.impact = toPlain(t.impactHtml)
    .split("\n")
    .map((x) => x.replace(/^(• |\d+\. )/, "").trim())
    .filter(Boolean)
    .join("; ");
  t.notesHtml = rteVal("t-notes");
  t.notes = toPlain(t.notesHtml);
}
function redrawKeep(focusId) {
  pageDelAsk = false;
  const sc = $("#dlg").scrollTop,
    lsc = $("#tf .plg-list")?.scrollTop,
    keep = ["t-note", "t-memo", "t-subnew", "t-linkurl", "t-linklabel"].map((id) => [id, $("#" + id)?.value || ""]);
  drawTask();
  // half-typed text in the add boxes survives a redraw
  keep.forEach(([id, v]) => {
    if (v && id !== focusId && $("#" + id)) $("#" + id).value = v;
  });
  growAll();
  $("#dlg").scrollTop = sc;
  if (focusId === "t-note") $("#tf .plg-list").scrollTop = 1e6;
  else if (lsc !== undefined) $("#tf .plg-list").scrollTop = lsc;
  if (focusId) $("#" + focusId)?.focus();
}
// switch day page: redraw and bring the page into view
function goDay(d) {
  readTaskForm();
  daySel = d;
  pageDelAsk = false;
  drawTask();
  growAll();
  logToDay();
  const p = $("#tf .dnav");
  if (p && p.getBoundingClientRect().top < 0) p.scrollIntoView({ block: "start" });
}
const growTA = (el) => {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + 2 + "px";
};
const growAll = () => document.querySelectorAll("#tf textarea.grow1").forEach(growTA);

// pick a date and time for something already done (steps and bottlenecks noted late)
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
  const n = ($("#t-note")?.value || "").trim(),
    m = ($("#t-memo")?.value || "").trim();
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
  const id = e.target.id;
  if (id === "t-st" || id === "t-urg") {
    readTaskForm();
    if (id === "t-st" && editing.status === "done") {
      editing.progress = 100;
      aboutOpen = true;
      redrawKeep("t-impact");
    } else redrawKeep();
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
  if (b.dataset.day) goDay(b.dataset.day);
  else if (b.id === "t-dayadd") {
    readTaskForm();
    const add = (d) => {
      if (!t.days.some((p) => p.day === d)) t.days.push({ id: newSubId(), day: d, overviewHtml: "", html: "" });
      t.days.sort((a, b) => a.day.localeCompare(b.day));
      goDay(d);
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
  } else if (b.id === "t-duebtn") {
    readTaskForm();
    hub.editDlg(
      t.due ? "Move the deadline" : "Set a deadline",
      [
        { k: "due", label: "Deadline", type: "date", value: t.due || "" },
        ...(t.due ? [{ k: "why", label: "Why it moved (optional)", value: "" }] : []),
      ],
      (v) => {
        const to = v.due || "";
        if (to === (t.due || "")) return;
        if (t.due) t.dueHistory = [...(t.dueHistory || []), { from: t.due, to, at: nowISO(), why: v.why || "" }];
        if (!isNew) {
          t.log.push({ at: nowISO(), note: `Deadline: ${t.due ? fmtDate(t.due) : "none"} → ${to ? fmtDate(to) : "none"}`, ...(v.why ? { memo: v.why } : {}) });
        }
        t.due = to;
        redrawKeep();
      },
    );
  } else if (b.dataset.openrel) {
    readTaskForm();
    if (!saveTask(true)) return;
    openTask(b.dataset.openrel);
  } else if (b.id === "t-follow") {
    readTaskForm();
    if (!saveTask(true)) return;
    const today = todayKey();
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
      days: [{ id: newSubId(), day: today, overviewHtml: "", html: "" }],
    });
    toast("Saved. Now name the follow-up task");
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
    t.bottlenecks.push({ id: newSubId(), issue: "", solved: false, how: "", at: dayAt(daySel), day: daySel });
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
    const n = $("#t-subnew").value.replace(/\s*\n\s*/g, " ").trim();
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
    let u = $("#t-linkurl").value.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    t.links.push({ url: u, label: $("#t-linklabel").value.trim(), day: daySel });
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
  } else if (b.id === "t-cancel") {
    $("#dlg").close();
  } else if (b.id === "t-del") {
    if (!confirmDel) {
      readTaskForm();
      confirmDel = true;
      redrawKeep();
    } else {
      if (S.timer && S.timer.ref === t.id) hub.stopTimer(false);
      del("tasks", t.id);
      $("#dlg").close();
      toast("Task deleted");
    }
  } else if (b.id === "t-save") {
    readTaskForm();
    saveTask();
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
  if (map[e.target.id]) {
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
// keepOpen: save and stay in the window (used before jumping to a connected task)
function saveTask(keepOpen) {
  const t = editing,
    old = isNew ? {} : S.tasks.find((x) => x.id === t.id) || {};
  if (!t.title) {
    toast("Give the task a name first");
    $("#t-title").focus();
    return false;
  }
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
  t.days = t.days.filter((p) => p.html || p.overviewHtml || used(p.day));
  const many = t.days.length > 1;
  t.desc = t.days
    .filter((p) => p.html || p.overviewHtml)
    .map((p) => (many ? fmtDate(p.day) + ": " : "") + [toPlain(p.overviewHtml), toPlain(p.html)].filter(Boolean).join("\n"))
    .join("\n");
  t.descHtml = ([...t.days].reverse().find((p) => p.html) || {}).html || "";
  delete t.records;
  if (!t.parentId) delete t.parentId;
  t.log.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
  if (t.impact && t.impact !== old.impact) t.log.push({ at: nowISO(), note: `Result: ${t.impact}` });
  const justDone = t.status === "done" && old.status !== "done";
  if (justDone) t.doneAt = nowISO();
  if (t.status !== "done") t.doneAt = "";
  t.updatedAt = nowISO();
  if (t.log.length > 200) t.log = t.log.slice(-200);
  if (justDone && S.timer && S.timer.ref === t.id) hub.stopTimer(false);
  put("tasks", t.id, strip(t));
  // keep the local list current so connected tasks show straight away
  const ix = S.tasks.findIndex((x) => x.id === t.id);
  if (ix < 0) S.tasks.push({ ...t });
  isNew = false;
  if (keepOpen) return true;
  $("#dlg").close();
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
  } else toast("Saved");
  return true;
}

export { editing, newSubId, openTask, readTaskForm, redrawKeep };
