// Study: units, timetable, attendance, assignments and grades
import { hub } from "./registry.js";
import {
  $,
  DAYS,
  ICON,
  S,
  SVG,
  del,
  esc,
  fmtDate,
  isoDay,
  keyDow,
  newId,
  nowISO,
  pad,
  put,
  saveCats,
  strip,
  toast,
  todayKey,
} from "./core.js";
import { asgTime, fmtMins, toMin } from "./today.js";
import { renderPlanCal } from "./courses.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  CLS_TYPES: { get: () => CLS_TYPES, enumerable: true },
  asgTodoRow: { get: () => asgTodoRow, enumerable: true },
  attOf: { get: () => attOf, enumerable: true },
  classesOn: { get: () => classesOn, enumerable: true },
  dueText: { get: () => dueText, enumerable: true },
  fmt12: { get: () => fmt12, enumerable: true },
  renderStudy: { get: () => renderStudy, enumerable: true },
  studyTodayHtml: { get: () => studyTodayHtml, enumerable: true },
  studyWorkItems: { get: () => studyWorkItems, enumerable: true },
  subj: { get: () => subj, enumerable: true },
  subjCls: { get: () => subjCls, enumerable: true },
  subjLabel: { get: () => subjLabel, enumerable: true },
});

// ---------- Study: subjects, timetable, assignments, grades
S.subjects = [];
S.classes = [];
S.asg = [];
S.semStart = "";
S.semWeeks = 14;
S.semBreaks = [];
S.prevCgpa = "";
S.prevCredits = "";
S.stEdit = null;
S.asgFilter = "todo";
S.asgSubj = "";
S.asgOpen = null;
S.asgType = "assignment";
S.clsType = "lecture";
S.subjForm = false;
S.clsForm = false;
const CLS_TYPES = [
  ["lecture", "Lecture"],
  ["tutorial", "Tutorial"],
  ["lab", "Lab"],
  ["online", "Online"],
  ["other", "Other"],
];
const ASG_TYPES = [
  ["assignment", "Assignment"],
  ["quiz", "Quiz"],
  ["test", "Test"],
  ["project", "Project"],
  ["report", "Lab report"],
  ["presentation", "Presentation"],
  ["exam", "Exam"],
];
const ASG_ST = [
  ["todo", "Not started"],
  ["doing", "In progress"],
  ["submitted", "Submitted"],
  ["graded", "Graded"],
];
const GRADES = [
  ["A", 4],
  ["A-", 3.67],
  ["B+", 3.33],
  ["B", 3],
  ["B-", 2.67],
  ["C+", 2.33],
  ["C", 2],
  ["C-", 1.67],
  ["D+", 1.33],
  ["D", 1],
  ["F", 0],
];
const subj = (id) => S.subjects.find((s) => s.id === id);
const subjCls = (id) => {
  const s = subj(id);
  return "cat-" + (s ? (+s.color || 0) % 6 : 5);
};
const subjLabel = (id) => {
  const s = subj(id);
  return s ? s.code || s.name : "No subject";
};
const fmt12 = (t) => {
  if (!t) return "";
  let [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return h + (m ? ":" + pad(m) : "") + ap;
};
const BREAK_KINDS = [
  ["break", "Mid-semester break"],
  ["swotvac", "SWOT VAC"],
  ["exam", "Exam period"],
  ["other", "Other break"],
];
const breakName = (b) => b.label || (BREAK_KINDS.find((x) => x[0] === b.kind) || ["", "Break"])[1];
function breakOn(k) {
  return (S.semBreaks || []).find((b) => b.from && b.to && k >= b.from && k <= b.to) || null;
}
const wkMon = (k) => hub.addDays(k, -((keyDow(k) + 6) % 7));
const weekIsBreak = (m) => !!(breakOn(m) && breakOn(hub.addDays(m, 4)));
// Teaching week number: break weeks (mid-sem break, SWOT VAC, exams) aren't counted.
function semWeek(k) {
  if (!S.semStart) return null;
  const m0 = wkMon(S.semStart),
    mk = wkMon(k);
  if (mk < m0) return Math.floor((new Date(mk + "T00:00") - new Date(m0 + "T00:00")) / (7 * 864e5)) + 1;
  let n = 0;
  for (let w = m0; w <= mk; w = hub.addDays(w, 7)) if (!weekIsBreak(w)) n++;
  return n;
}
function semPeriod(k) {
  if (!S.semStart) return null;
  const b = breakOn(k);
  if (b) return { kind: b.kind, b, label: breakName(b) };
  if (k < S.semStart) return { kind: "before", label: "Before semester" };
  const w = semWeek(k);
  return w > S.semWeeks ? { kind: "after", label: "Teaching ended" } : { kind: "teach", week: w, label: `Week ${w}` };
}
function dueText(a) {
  const tk = todayKey();
  if (!a.due) return ["No due date", ""];
  const d = Math.round((new Date(a.due + "T00:00") - new Date(tk + "T00:00")) / 864e5);
  if (["submitted", "graded"].includes(a.status)) return [`Due ${fmtDate(a.due)}`, "done"];
  if (d < 0) return [`Overdue by ${-d} day${d === -1 ? "" : "s"}`, "over"];
  if (d === 0) return [`Due today${a.time ? " " + fmt12(a.time) : ""}`, "soon"];
  if (d === 1) return [`Due tomorrow${a.time ? " " + fmt12(a.time) : ""}`, "soon"];
  return [`Due ${fmtDate(a.due)}${a.time ? " " + fmt12(a.time) : ""} · in ${d} days`, d <= 7 ? "week" : ""];
}
function inSem(k) {
  const p = semPeriod(k);
  return !p || p.kind === "teach";
}
function classesOn(k) {
  if (!inSem(k)) return [];
  const wd = keyDow(k);
  const ok = new Set(
    S.subjects
      .filter((s) => (s.sem || "") === (S.curSem || "") && (!s.cFrom || k >= s.cFrom) && (!s.cTo || k <= s.cTo))
      .map((s) => s.id),
  );
  return S.classes.filter((c) => +c.day === wd && ok.has(c.subj)).sort((a, b) => a.start.localeCompare(b.start));
}
document.addEventListener(
  "toggle",
  (e) => {
    if (e.target.classList && e.target.classList.contains("st-sem")) S.semOpen = e.target.open;
  },
  true,
);
// attendance for one class on one date: "" = going/attended, "absent" = not attending, "cancelled"
const attOf = (c, k) => (c.att || {})[k] || "";
function setAtt(id, k, v) {
  const c = S.classes.find((x) => x.id === id);
  if (!c) return;
  const att = { ...(c.att || {}) };
  if (v) att[k] = v;
  else delete att[k];
  put("classes", id, { ...strip(c), att });
  toast(v === "absent" ? "Marked as not attending" : v === "cancelled" ? "Marked as cancelled" : "Marked as attending");
}
function attendance(subjId) {
  const tk = todayKey();
  let from = S.semStart || hub.addDays(tk, -120),
    held = 0,
    went = 0;
  for (let k = from; k <= tk; k = hub.addDays(k, 1))
    classesOn(k)
      .filter(
        (c) => c.subj === subjId && (k < tk || toMin(c.start) <= new Date().getHours() * 60 + new Date().getMinutes()),
      )
      .forEach((c) => {
        const a = attOf(c, k);
        if (a !== "cancelled") {
          held++;
          if (a !== "absent") went++;
        }
      });
  return { held, went };
}
const ATT_LBL = { absent: "Not attending", cancelled: "Cancelled" };
function attBtns(c, k) {
  const a = attOf(c, k),
    id = esc(c.id);
  return a
    ? `<span class="att-pill att-${a}">${ATT_LBL[a]}</span><button type="button" class="x small" data-att="${id}|${k}|">Undo</button>`
    : `<button type="button" class="x small" data-att="${id}|${k}|absent" title="Mark this class as not attending">Not going</button>`;
}
document.addEventListener(
  "click",
  (e) => {
    const b = e.target.closest && e.target.closest("[data-att]");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const [id, k, v] = b.dataset.att.split("|");
    setAtt(id, k, v);
    if (S.scPick) S.scPick = null;
  },
  true,
);
function nextClass() {
  const now = new Date(),
    tk = todayKey(),
    nowM = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < 8; i++) {
    const k = hub.addDays(tk, i);
    const cs = classesOn(k).filter((c) => (i > 0 || toMin(c.end) > nowM) && !attOf(c, k));
    if (cs.length) return { c: cs[0], k, i, live: i === 0 && toMin(cs[0].start) <= nowM };
  }
  return null;
}
function subjOptions(sel) {
  return (
    `<option value="">Choose subject</option>` +
    S.subjects
      .map(
        (s) =>
          `<option value="${esc(s.id)}" ${s.id === sel ? "selected" : ""}>${esc(s.code ? s.code + " · " : "")}${esc(s.name)}</option>`,
      )
      .join("")
  );
}
function renderStudy() {
  if (S.view !== "study") return;
  const tk = todayKey(),
    wk = semWeek(tk);
  // ----- timetable
  const N = nextClass();
  const curIds = new Set(hub.curSubjects().map((s) => s.id)),
    curClasses = S.classes.filter((c) => curIds.has(c.subj));
  const days = [1, 2, 3, 4, 5].concat([6, 0].filter((d) => curClasses.some((c) => +c.day === d)));
  const all = curClasses;
  let lo = 8 * 60,
    hi = 18 * 60;
  all.forEach((c) => {
    lo = Math.min(lo, Math.floor(toMin(c.start) / 60) * 60);
    hi = Math.max(hi, Math.ceil(toMin(c.end) / 60) * 60);
  });
  const ppm = 0.9,
    H = (hi - lo) * ppm,
    todayDow = new Date().getDay();
  const hours = [];
  for (let m = lo; m < hi; m += 60)
    hours.push(
      `<span style="top:${((m - lo) * ppm).toFixed(1)}px">${m === lo ? "" : fmt12(pad(Math.floor(m / 60)) + ":00")}</span>`,
    );
  $("#st-time").innerHTML = `
    <div class="st-top">
      <div class="st-week">${(() => {
        const p = semPeriod(tk);
        if (!p) return `<span class="small muted">Set your semester start to see the week number.</span>`;
        if (p.kind === "teach") return `<b>Week ${p.week}</b><span class="muted small"> of ${S.semWeeks}</span>`;
        if (p.kind === "before") return `<b>Semester starts ${esc(fmtDate(S.semStart))}</b>`;
        const nx = (S.semBreaks || []).filter((b) => b.from > tk).sort((a, b) => a.from.localeCompare(b.from))[0];
        return `<b>${esc(p.label)}</b><span class="muted small"> · no classes${p.b ? ` until ${esc(fmtDate(p.b.to))}` : ""}${nx ? ` · ${esc(breakName(nx))} starts ${esc(fmtDate(nx.from))}` : ""}</span>`;
      })()}
        <details class="st-sem" ${S.semOpen ? "open" : ""}><summary class="small">${S.curSem ? esc(S.curSem) + " · " : ""}Semester settings</summary><div class="st-semf"><label class="f" style="grid-column:1/-1">Semester name<input id="st-semname" value="${esc(S.curSem)}" placeholder="e.g. Year 2 Sem 1"></label><label class="f">Starts (week 1 Monday)<input type="date" id="st-semstart" value="${esc(S.semStart)}"></label><label class="f">Teaching weeks<input type="number" min="1" max="30" id="st-semweeks" value="${S.semWeeks}"></label>
          <div class="sb-wrap"><div class="small"><b>Breaks, SWOT VAC & exams</b> <span class="muted">· no classes on these dates</span></div>
          ${(S.semBreaks || [])
            .slice()
            .sort((a, b) => (a.from || "").localeCompare(b.from || ""))
            .map(
              (b) =>
                `<div class="sb-row" data-sbid="${esc(b.id)}"><select data-sbf="kind">${BREAK_KINDS.map(([v, l]) => `<option value="${v}" ${b.kind === v ? "selected" : ""}>${l}</option>`).join("")}</select><label class="f">From<input type="date" data-sbf="from" value="${esc(b.from || "")}"></label><label class="f">To<input type="date" data-sbf="to" value="${esc(b.to || "")}"></label><button type="button" class="x" data-sbdel="${esc(b.id)}" aria-label="Remove">✕</button></div>`,
            )
            .join("")}
          <div class="qa-chips cwrap">${BREAK_KINDS.slice(0, 3)
            .map(([v, l]) => `<button type="button" class="qc" data-sbadd="${v}">+ ${l}</button>`)
            .join("")}</div></div></div></details></div>
      <div class="st-next">${
        N
          ? `<span class="small muted">${N.live ? "Happening now" : N.i === 0 ? "Next class today" : N.i === 1 ? "Next class tomorrow" : "Next class " + DAYS[keyDow(N.k)]}</span>
        <b><span class="tag ${subjCls(N.c.subj)}">${esc(subjLabel(N.c.subj))}</span> ${esc((subj(N.c.subj) || {}).name || "")}</b>
        <span class="small">${esc((CLS_TYPES.find((x) => x[0] === N.c.type) || ["", ""])[1])} · ${fmt12(N.c.start)}–${fmt12(N.c.end)}${hub.clsLoc(N.c) ? " · " + esc(hub.clsLoc(N.c)) : ""}</span>`
          : `<span class="small muted">${
              S.classes.length
                ? (() => {
                    const p = semPeriod(tk);
                    return p && !["teach", "before"].includes(p.kind)
                      ? `No classes during ${esc(p.label)}. Good luck!`
                      : "No classes in the next 7 days.";
                  })()
                : "No classes this week yet. Add your subjects and classes below."
            }</span>`
      }</div>
    </div>
    ${
      all.length
        ? `<div class="tt-scroll"><div class="tt" style="--cols:${days.length}">
      <div class="tt-hd"></div>${days.map((d) => `<div class="tt-hd ${d === todayDow ? "today" : ""}">${DAYS[d]}</div>`).join("")}
      <div class="sch-times" style="height:${H}px">${hours.join("")}</div>
      ${days
        .map(
          (d) =>
            `<div class="sch-col tt-col ${d === todayDow ? "is-today" : ""}" style="height:${H}px;--hr:${60 * ppm}px">${classesOn(
              hub.addDays(tk, (d - todayDow + 7) % 7),
            )
              .map((c) => {
                const top = (toMin(c.start) - lo) * ppm,
                  h = Math.max((toMin(c.end) - toMin(c.start)) * ppm, 24),
                  s = subj(c.subj);
                return `<button type="button" class="ev tt-ev ${subjCls(c.subj)}" style="top:${top}px;height:${h}px;left:2px;width:calc(100% - 4px)" data-cls-edit="${esc(c.id)}" title="${esc(s ? s.name : "")} · ${fmt12(c.start)}–${fmt12(c.end)}"><span class="ev-t">${esc(subjLabel(c.subj))}</span>${h > 34 ? `<span class="ev-s">${esc((CLS_TYPES.find((x) => x[0] === c.type) || ["", ""])[1])}${hub.clsLoc(c) ? " · " + esc(hub.clsLoc(c)) : ""}</span>` : ""}${h > 50 ? `<span class="ev-s">${fmt12(c.start)}–${fmt12(c.end)}</span>` : ""}</button>`;
              })
              .join("")}</div>`,
        )
        .join("")}
    </div></div>`
        : ""
    }`;
  // subjects + class form
  const e = S.stEdit && S.classes.find((c) => c.id === S.stEdit);
  const past = S.subjects.filter((s) => !hub.isCur(s));
  $("#st-subj").innerHTML = `
    ${
      hub.curSubjects().length
        ? `<ul class="subj-list">${hub
            .curSubjects()
            .map((s) =>
              S.subjEdit === s.id
                ? `<li class="se-li"><form id="subj-edit-form" class="st-form" autocomplete="off"><div class="grid2"><label class="f">Code<input id="se-code" value="${esc(s.code || "")}"></label><label class="f">Name<input id="se-name" value="${esc(s.name)}" required></label><label class="f">Lecturer<input id="se-lect" value="${esc(s.lecturer || "")}"></label><label class="f">Usual location<input id="se-loc" value="${esc(s.location || "")}" placeholder="e.g. Block D, DK3"></label><label class="f">Classes start <span class="muted">(optional)</span><input type="date" id="se-from" value="${esc(s.cFrom || "")}"></label><label class="f">Classes end <span class="muted">(optional)</span><input type="date" id="se-to" value="${esc(s.cTo || "")}"></label></div><p class="small muted" style="margin:0">Only needed if this unit's classes don't run for the whole semester.</p><div class="row"><button class="btn sm primary" type="submit">Save</button><button class="btn sm" type="button" data-subj-cancel>Cancel</button></div></form></li>`
                : `<li><span class="tag ${subjCls(s.id)}">${esc(s.code || "—")}</span><span class="hl-b" data-subj-edit="${esc(s.id)}" role="button" tabindex="0" title="Edit subject"><b>${esc(s.name)}</b>${s.lecturer ? `<span class="small muted"> · ${esc(s.lecturer)}</span>` : ""}${s.location ? `<span class="small muted"> · ${esc(s.location)}</span>` : ""}<span class="small muted"> · ${S.classes.filter((c) => c.subj === s.id).length} class${S.classes.filter((c) => c.subj === s.id).length === 1 ? "" : "es"}/week</span>${(() => {
                    const a = attendance(s.id);
                    return a.held
                      ? `<span class="small ${a.went / a.held < 0.8 ? "att-low" : "muted"}"> · attended ${a.went}/${a.held}</span>`
                      : "";
                  })()}${s.cFrom || s.cTo ? `<span class="small muted"> · classes ${s.cFrom ? esc(fmtDate(s.cFrom)) : "start"}–${s.cTo ? esc(fmtDate(s.cTo)) : "end"}</span>` : ""}</span><button type="button" class="x" data-subj-edit="${esc(s.id)}" aria-label="Edit subject">${SVG(ICON.edit)}</button><button type="button" class="x" data-subj-del="${esc(s.id)}" aria-label="Delete subject">${S.subjDel === s.id ? "Delete?" : "✕"}</button></li>`,
            )
            .join("")}</ul>`
        : `<p class="small muted" style="margin:0">Start by adding your subjects for this semester.</p>`
    }
    ${
      S.subjForm
        ? `<form id="subj-form" class="st-form" autocomplete="off"><input id="sj-code" class="inp" placeholder="Code, e.g. BIT2023" style="max-width:150px"><input id="sj-name" class="inp" placeholder="Subject name, e.g. Data Mining" required><input id="sj-lect" class="inp" placeholder="Lecturer (optional)"><input id="sj-loc" class="inp" placeholder="Usual location, e.g. Block D, DK3 (optional)"><div class="row"><button class="btn sm primary" type="submit">Add subject</button><button class="btn sm" type="button" data-subj-form="0">Done</button></div></form>`
        : `<button type="button" class="btn sm" data-subj-form="1">+ Add subject</button>`
    }
    ${past.length ? `<details class="small"><summary>Past semesters (${past.length} subject${past.length === 1 ? "" : "s"})</summary><ul class="subj-list">${past.map((s) => `<li><span class="tag ${subjCls(s.id)}">${esc(s.code || "—")}</span><span class="hl-b">${esc(s.name)} <span class="muted">· ${esc(s.sem || "")}${s.grade ? " · " + esc(s.grade) : ""}</span></span><span></span></li>`).join("")}</ul></details>` : ""}
    ${
      S.subjects.length
        ? S.clsForm || e
          ? `<form id="cls-form" class="st-form" autocomplete="off"><div class="small"><b>${e ? "Edit class" : "Add a weekly class"}</b></div>
      <div class="grid2"><label class="f">Subject<select id="cl-subj">${subjOptions(e ? e.subj : (S.subjects[S.subjects.length - 1] || {}).id)}</select></label>
      <label class="f">Day<select id="cl-day">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<option value="${d}" ${e && +e.day === d ? "selected" : ""}>${DAYS[d]}</option>`).join("")}</select></label>
      <label class="f">Starts<input type="time" id="cl-start" value="${e ? e.start : "09:00"}"></label><label class="f">Ends<input type="time" id="cl-end" value="${e ? e.end : "11:00"}"></label></div>
      <div class="qa-chips cwrap">${CLS_TYPES.map(([v, l]) => `<button type="button" class="qc" data-cls-type="${v}" aria-pressed="${(e ? e.type : S.clsType) === v}">${l}</button>`).join("")}</div>
      <input id="cl-room" class="inp" placeholder="${(() => {
        const l = (subj(e ? e.subj : (S.subjects[S.subjects.length - 1] || {}).id) || {}).location;
        return l ? "Location (blank = " + esc(l) + ")" : "Location, e.g. DK3, Lab 2 or Zoom link";
      })()}" value="${esc(e ? e.room || "" : "")}">
      <div class="row"><button class="btn sm primary" type="submit">${e ? "Save" : "Add class"}</button><button class="btn sm" type="button" data-cls-form="0">Cancel</button>${e ? `<button class="btn sm ghost danger" type="button" data-cls-del="${esc(e.id)}">Delete class</button>` : ""}</div></form>`
          : `<button type="button" class="btn sm primary" data-cls-form="1">+ Add class to timetable</button>`
        : ""
    }`;
  // ----- assignments
  let list = S.asg.slice();
  if (S.asgSubj) list = list.filter((a) => a.subj === S.asgSubj);
  if (S.asgFilter === "todo") list = list.filter((a) => !["submitted", "graded"].includes(a.status));
  else if (S.asgFilter === "done") list = list.filter((a) => ["submitted", "graded"].includes(a.status));
  list.sort(
    (a, b) =>
      (S.asgFilter === "done" ? -1 : 1) *
      ((a.due || "9999") + (a.time || "")).localeCompare((b.due || "9999") + (b.time || "")),
  );
  const openN = S.asg.filter((a) => !["submitted", "graded"].includes(a.status)).length;
  $("#st-asg").innerHTML = `
    ${
      S.subjects.length
        ? `<form id="asg-form" class="st-form" autocomplete="off">
      <div class="asg-row1"><select id="as-subj" class="inp">${subjOptions(S.asgSubj || "")}</select><input id="as-title" class="inp" placeholder="Title, e.g. Assignment 2: Clustering report" required></div>
      <div class="qa-chips cwrap">${ASG_TYPES.map(([v, l]) => `<button type="button" class="qc" data-asg-type="${v}" aria-pressed="${S.asgType === v}">${l}</button>`).join("")}</div>
      <div class="asg-row2"><label class="f">Due date<input type="date" id="as-due" data-dhint value="${hub.addDays(tk, 7)}"><span class="dhint"></span></label><label class="f">Time<input type="time" id="as-time" value="23:59"></label><label class="f">Weight %<input type="number" id="as-weight" min="0" max="100" placeholder="e.g. 20"></label><button class="btn primary" type="submit">Add</button></div></form>`
        : `<p class="small muted" style="margin:0">Add your subjects in Timetable first, then track assignments here.</p>`
    }
    ${(() => {
      const st = S.todos
        .filter(
          (t) =>
            t.kind === "study" && !(t.asg && S.asg.some((a) => a.id === t.asg)) && (!t.done || isoDay(t.doneAt) === tk),
        )
        .filter((t) => !S.asgSubj || t.subj === S.asgSubj)
        .sort((a, b) => a.done - b.done || (a.date || "").localeCompare(b.date || ""));
      return st.length
        ? `<details class="st-todo-box" open><summary class="small"><b>Study to-dos</b> <span class="muted">(${st.filter((t) => !t.done).length})</span></summary><ul class="rows">${st.map((t) => `<li class="${t.done ? "done" : ""}"><input type="checkbox" data-todo="${esc(t.id)}" ${t.done ? "checked" : ""} aria-label="Done: ${esc(t.title)}"><span class="grow"><span>${t.subj ? `<span class="tag ${subjCls(t.subj)}">${esc(subjLabel(t.subj))}</span> ` : ""}${esc(t.title)}</span>${t.date ? `<div class="sub ${t.date < tk && !t.done ? "overdue" : ""}">${esc(fmtDate(t.date))}</div>` : ""}</span><button class="x tl-ed" type="button" data-todoedit="${esc(t.id)}" aria-label="Edit">${SVG(ICON.edit)}</button><button class="x" type="button" data-deltodo="${esc(t.id)}" aria-label="Delete">✕</button></li>`).join("")}</ul></details>`
        : "";
    })()}
    <div class="asg-filter"><div class="seg">${[
      ["todo", `To do (${openN})`],
      ["done", "Submitted & graded"],
      ["all", "All"],
    ]
      .map(([v, l]) => `<button type="button" data-asg-f="${v}" aria-pressed="${S.asgFilter === v}">${l}</button>`)
      .join("")}</div>
      ${S.subjects.length > 1 ? `<div class="qa-chips cwrap"><button type="button" class="qc" data-asg-s="" aria-pressed="${!S.asgSubj}">All subjects</button>${S.subjects.map((s) => `<button type="button" class="qc ci-${(+s.color || 0) % 6}" data-asg-s="${esc(s.id)}" aria-pressed="${S.asgSubj === s.id}">${esc(s.code || s.name)}</button>`).join("")}</div>` : ""}</div>
    ${
      list.length
        ? `<div class="asg-list">${hub
            .asgGroups(list)
            .map((g) => {
              const td = hub.asgTodos(g.a.id);
              return g.kids.length || td.length
                ? `<div class="asg-group">${hub.asgItem(g.a, g.kids)}<div class="asg-kids">${g.kids.map((k) => hub.asgItem(k)).join("")}${td.length ? `<ul class="rows asg-todos">${td.map(hub.asgTodoLi).join("")}</ul>` : ""}</div></div>`
                : hub.asgItem(g.a);
            })
            .join("")}</div>`
        : `<div class="empty">${S.asgFilter === "todo" ? "Nothing due. Nice!" : "No assignments here yet."}</div>`
    }`;
  hub.renderNotes();
  hub.renderPortfolio();
  hub.renderStudyCal();
  renderPlanCal();
  hub.dateHints();
  // ----- grades
  const rows = hub.curSubjects().map((s) => {
    const gr = GRADES.find((g) => g[0] === s.grade);
    const cr = +s.credits || 0;
    const ga = S.asg.filter(
      (a) => a.subj === s.id && a.status === "graded" && a.mark !== "" && a.mark != null && +a.weight,
    );
    const wSum = ga.reduce((x, a) => x + +a.weight, 0),
      score = wSum ? ga.reduce((x, a) => x + +a.mark * +a.weight, 0) / wSum : null;
    return { s, gr, cr, score, wSum };
  });
  const counted = rows.filter((r) => r.gr && r.cr),
    cr = counted.reduce((a, r) => a + r.cr, 0),
    pts = counted.reduce((a, r) => a + r.cr * r.gr[1], 0);
  const gpa = cr ? pts / cr : null,
    pc = parseFloat(S.prevCgpa),
    pcr = parseFloat(S.prevCredits);
  const pastG = S.subjects
    .filter((s) => !hub.isCur(s))
    .map((s) => [GRADES.find((g) => g[0] === s.grade), +s.credits || 0])
    .filter(([g, c]) => g && c);
  const pastCr = pastG.reduce((a, [, c]) => a + c, 0),
    pastPts = pastG.reduce((a, [g, c]) => a + g[1] * c, 0);
  const allCr = cr + pastCr + (pc >= 0 && pcr > 0 ? pcr : 0),
    allPts = pts + pastPts + (pc >= 0 && pcr > 0 ? pc * pcr : 0);
  const cgpa = allCr ? allPts / allCr : null;
  $("#st-grades").innerHTML = S.subjects.length
    ? `
    <div class="m-sum"><div><span class="small muted">This semester GPA</span><b>${gpa !== null ? gpa.toFixed(2) : "–"}</b><span class="small muted">${cr} credit${cr === 1 ? "" : "s"} graded</span></div>
      <div><span class="small muted">CGPA</span><b>${cgpa !== null ? cgpa.toFixed(2) : "–"}</b><span class="small muted">${allCr} credits in total${pastCr ? ` (incl. ${pastCr} from past semesters here)` : ""}</span></div></div>
    <div class="tbl-wrap"><table class="ovt gr-t"><tr><th>Subject</th><th>Credits</th><th>Grade</th><th>Coursework so far</th></tr>
      ${rows
        .map(
          (r) => `<tr><td><span class="tag ${subjCls(r.s.id)}">${esc(r.s.code || "—")}</span> ${esc(r.s.name)}</td>
        <td><input type="number" min="0" max="12" class="gr-in" data-sj-cr="${esc(r.s.id)}" value="${esc(r.s.credits ?? "")}" placeholder="3"></td>
        <td><select class="gr-in" data-sj-gr="${esc(r.s.id)}"><option value="">–</option>${GRADES.map(([g]) => `<option ${r.s.grade === g ? "selected" : ""}>${g}</option>`).join("")}</select></td>
        <td>${r.score !== null ? `<b>${r.score.toFixed(1)}%</b> <span class="small muted">of ${r.wSum}% graded</span>` : `<span class="small muted">–</span>`}</td></tr>`,
        )
        .join("")}</table></div>
    <p class="small muted" style="margin:0">Results from before you used Daybook:</p><div class="grid2"><label class="f">Previous CGPA<input type="number" step="0.01" min="0" max="4" id="st-pcgpa" value="${esc(S.prevCgpa)}" placeholder="e.g. 3.45"></label><label class="f">Previous credits completed<input type="number" min="0" id="st-pcr" value="${esc(S.prevCredits)}" placeholder="e.g. 60"></label></div>
    <p class="small muted" style="margin:0">Uses the common 4.00 scale (A 4.00, A- 3.67, B+ 3.33 … F 0). Check your university's scale if it differs. Coursework is worked out from graded assignments with a weight.</p>`
    : `<p class="small muted" style="margin:0">Add subjects in Timetable to work out your GPA.</p>`;
}
// Today card: classes today + assignments due soon
// assignments you're working on now (In progress, or due today/tomorrow) appear as study to-dos on Today
function studyWorkItems() {
  const tk = todayKey();
  return S.asg
    .filter(
      (a) =>
        !["submitted", "graded"].includes(a.status) && (a.status === "doing" || (a.due && a.due <= hub.addDays(tk, 1))),
    )
    .sort((a, b) => ((a.due || "9999") + (a.time || "")).localeCompare((b.due || "9999") + (b.time || "")));
}
const asgFullTitle = (a) => {
  const p = a.parent && S.asg.find((x) => x.id === a.parent);
  return (p ? `<span class="muted">${esc(p.title)} › </span>` : "") + esc(a.title);
};
function asgTodoRow(a) {
  const [dt, cls] = dueText(a);
  return `<li><input type="checkbox" data-asgdone="${esc(a.id)}" aria-label="Mark submitted: ${esc(a.title)}"><span class="grow"><span><span class="tag ${subjCls(a.subj)}">${esc(subjLabel(a.subj))}</span> ${asgFullTitle(a)}</span><div class="sub ${cls === "over" ? "overdue" : ""}">${esc(dt.replace(/ · in \d+ days/, ""))}${a.status === "doing" ? " · in progress" : ""}${asgTime(a) ? " · ⏱ " + fmtMins(asgTime(a)) : ""}</div></span><a class="x small" href="#study-assignments" data-asgopen="${esc(a.id)}">Open</a></li>`;
}
document.addEventListener("click", (e) => {
  const st = e.target.closest && e.target.closest("[data-asgstart]");
  if (st) {
    const a = S.asg.find((x) => x.id === st.dataset.asgstart);
    if (a) {
      put("assignments", a.id, { ...strip(a), status: "doing" });
      toast("Moved to your study to-dos");
    }
    return;
  }
  const op = e.target.closest && e.target.closest("[data-asgopen]");
  if (op) {
    S.asgOpen = op.dataset.asgopen;
    S.asgFilter = "all";
  }
});
document.addEventListener("change", (e) => {
  const c = e.target;
  if (!c.dataset || !c.dataset.asgdone) return;
  const a = S.asg.find((x) => x.id === c.dataset.asgdone);
  if (!a) return;
  put("assignments", a.id, { ...strip(a), status: "submitted", doneAt: nowISO() });
  toast("Submitted. Well done! Add what you learned in Study → Assignments.");
});
function studyTodayHtml() {
  if (!S.subjects.length && !S.asg.length) return "";
  const tk = todayKey(),
    nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const work = new Set(studyWorkItems().map((a) => a.id));
  const cs = classesOn(tk),
    due = S.asg
      .filter(
        (a) => !["submitted", "graded"].includes(a.status) && !work.has(a.id) && a.due && a.due <= hub.addDays(tk, 7),
      )
      .sort((a, b) => (a.due + (a.time || "")).localeCompare(b.due + (b.time || "")));
  const per = semPeriod(tk),
    brk =
      per && per.kind !== "teach" && per.kind !== "before"
        ? `<p class="small" style="margin:0"><b>${esc(per.label)}</b> <span class="muted">· no classes today</span></p>`
        : "";
  if (!cs.length && !due.length)
    return (
      brk ||
      (work.size
        ? ""
        : `<p class="small muted" style="margin:0">No classes today and nothing due in the next 7 days.</p>`)
    );
  return `${brk}${cs.length ? `<ul class="hlist">${cs.map((c) => `<li class="${toMin(c.end) < nowM ? "past" : ""} ${attOf(c, tk) ? "att-off" : ""}"><span class="hl-t">${fmt12(c.start)}</span><span class="tag ${subjCls(c.subj)}">${esc(subjLabel(c.subj))}</span><span class="hl-b">${esc((CLS_TYPES.find((x) => x[0] === c.type) || ["", ""])[1])}${hub.clsLoc(c) ? " · " + esc(hub.clsLoc(c)) : ""}</span><span class="hl-act">${attBtns(c, tk)}</span></li>`).join("")}</ul>` : ""}
    ${
      due.length
        ? `<div class="small muted" style="margin-top:4px">Due soon</div><ul class="hlist">${due
            .map((a) => {
              const [dt, cls] = dueText(a);
              return `<li><span class="tag ${subjCls(a.subj)}">${esc(subjLabel(a.subj))}</span><span class="hl-b">${asgFullTitle(a)}</span><span class="asg-due ${cls} small">${esc(dt.replace(/ · in \d+ days/, ""))}${asgTime(a) ? ` · ⏱ ${fmtMins(asgTime(a))}` : ""}</span><span class="hl-act"><button type="button" class="x small" data-asgstart="${esc(a.id)}" title="Start working on it: moves it to your study to-dos">Start</button></span></li>`;
            })
            .join("")}</ul>`
        : ""
    }`;
}
let studyNotesT = null;
document.addEventListener("click", (e) => {
  if (S.view !== "study") return;
  const t = e.target.closest("button,[data-asg-open]");
  if (!t || !t.closest("#v-study")) return;
  const d = t.dataset;
  if (d.subjForm !== undefined) {
    S.subjForm = d.subjForm === "1";
    renderStudy();
    if (S.subjForm) $("#sj-code").focus();
  } else if (d.subjDel) {
    if (S.subjDel !== d.subjDel) {
      S.subjDel = d.subjDel;
      renderStudy();
    } else {
      const id = d.subjDel;
      S.subjDel = null;
      hub.batchColl(
        "classes",
        S.classes.filter((c) => c.subj === id).map((c) => ["delete", c.id]),
      );
      del("subjects", id);
      toast("Subject deleted");
    }
  } else if (d.clsForm !== undefined) {
    S.clsForm = d.clsForm === "1";
    S.stEdit = null;
    renderStudy();
  } else if (d.clsType) {
    S.clsType = d.clsType;
    t.parentElement.querySelectorAll("[data-cls-type]").forEach((b) => b.setAttribute("aria-pressed", b === t));
  } else if (d.clsEdit) {
    S.stEdit = d.clsEdit;
    S.clsForm = true;
    const c = S.classes.find((x) => x.id === d.clsEdit);
    if (c) S.clsType = c.type;
    renderStudy();
    $("#cls-form") && $("#cls-form").scrollIntoView({ block: "nearest", behavior: "smooth" });
  } else if (d.clsDel) {
    del("classes", d.clsDel);
    S.stEdit = null;
    S.clsForm = false;
    toast("Class removed");
  } else if (d.asgType) {
    S.asgType = d.asgType;
    t.parentElement.querySelectorAll("[data-asg-type]").forEach((b) => b.setAttribute("aria-pressed", b === t));
  } else if (d.asgF) {
    S.asgFilter = d.asgF;
    renderStudy();
  } else if (d.asgS !== undefined) {
    S.asgSubj = d.asgS;
    renderStudy();
  } else if (d.asgOpen) {
    S.asgOpen = S.asgOpen === d.asgOpen ? null : d.asgOpen;
    renderStudy();
  } else if (d.asgSt) {
    const [id, st] = d.asgSt.split(":");
    const a = S.asg.find((x) => x.id === id);
    if (a) {
      put("assignments", id, {
        ...strip(a),
        status: st,
        doneAt: ["submitted", "graded"].includes(st) ? a.doneAt || nowISO() : "",
      });
      if (st === "submitted" || st === "graded") {
        S.asgOpen = id;
        toast(
          st === "submitted"
            ? "Submitted. Well done! Add what you learned for your portfolio."
            : "Graded. Add your mark and what you learned.",
        );
      }
    }
  } else if (d.asgDel) {
    if (S.asgDel !== d.asgDel) {
      S.asgDel = d.asgDel;
      renderStudy();
    } else {
      del("assignments", d.asgDel);
      S.asgDel = null;
      S.asgOpen = null;
    }
  }
});
document.addEventListener("keydown", (e) => {
  const m = e.target.closest && e.target.closest("[data-asg-open]");
  if (m && (e.key === "Enter" || e.key === " ") && e.target === m) {
    e.preventDefault();
    m.click();
  }
});
document.addEventListener("submit", (e) => {
  const f = e.target;
  if (!f.closest || !f.closest("#v-study")) return;
  e.preventDefault();
  if (f.id === "subj-form") {
    const n = $("#sj-name").value.trim();
    if (!n) return;
    put("subjects", newId(), {
      sem: S.curSem || "",
      code: $("#sj-code").value.trim().toUpperCase(),
      name: n,
      lecturer: $("#sj-lect").value.trim(),
      location: $("#sj-loc").value.trim(),
      color: S.subjects.length % 6,
      credits: "",
      grade: "",
      createdAt: nowISO(),
    });
    toast("Subject added");
    setTimeout(() => {
      if ($("#sj-code")) {
        $("#sj-code").value = "";
        $("#sj-name").value = "";
        $("#sj-lect").value = "";
        $("#sj-loc").value = "";
        $("#sj-code").focus();
      }
    }, 50);
  } else if (f.id === "cls-form") {
    const sj = $("#cl-subj").value;
    if (!sj) {
      toast("Choose a subject");
      return;
    }
    const st = $("#cl-start").value,
      en = $("#cl-end").value;
    if (!st || !en || en <= st) {
      toast("End time must be after start time");
      return;
    }
    const rec = {
      subj: sj,
      day: +$("#cl-day").value,
      start: st,
      end: en,
      type: S.clsType,
      room: $("#cl-room").value.trim(),
    };
    put("classes", S.stEdit || newId(), rec);
    toast(S.stEdit ? "Class updated" : "Class added");
    S.stEdit = null;
  } else if (f.id === "asg-form") {
    const ti = $("#as-title").value.trim(),
      sj = $("#as-subj").value;
    if (!ti) return;
    if (!sj) {
      toast("Choose a subject");
      return;
    }
    put("assignments", newId(), {
      subj: sj,
      title: ti,
      type: S.asgType,
      due: $("#as-due").value,
      time: $("#as-time").value,
      weight: $("#as-weight").value ? +$("#as-weight").value : "",
      status: "todo",
      mark: "",
      notes: "",
      link: "",
      createdAt: nowISO(),
      doneAt: "",
    });
    toast("Added");
  }
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (!t.closest || !t.closest("#v-study")) return;
  if (t.dataset && t.dataset.sbf) {
    const id = t.closest("[data-sbid]").dataset.sbid;
    S.semBreaks = (S.semBreaks || []).map((b) => (b.id === id ? { ...b, [t.dataset.sbf]: t.value } : b));
    const b = S.semBreaks.find((x) => x.id === id);
    if (b && b.from && b.to && b.to < b.from) {
      b.to = b.from;
    }
    saveCats();
    renderStudy();
    return;
  }
  if (t.id === "st-semstart") {
    S.semStart = t.value;
    saveCats();
    renderStudy();
  } else if (t.id === "st-semweeks") {
    S.semWeeks = Math.max(1, +t.value || 14);
    saveCats();
    renderStudy();
  } else if (t.id === "st-pcgpa") {
    S.prevCgpa = t.value;
    saveCats();
    renderStudy();
  } else if (t.id === "st-pcr") {
    S.prevCredits = t.value;
    saveCats();
    renderStudy();
  } else if (t.dataset.sjCr) {
    const s = subj(t.dataset.sjCr);
    if (s) put("subjects", s.id, { ...strip(s), credits: t.value === "" ? "" : +t.value });
  } else if (t.dataset.sjGr) {
    const s = subj(t.dataset.sjGr);
    if (s) put("subjects", s.id, { ...strip(s), grade: t.value });
  } else if (t.dataset.asgMark) {
    const a = S.asg.find((x) => x.id === t.dataset.asgMark);
    if (a) put("assignments", a.id, { ...strip(a), mark: t.value === "" ? "" : +t.value });
  } else if (t.dataset.asgNotes) {
    const a = S.asg.find((x) => x.id === t.dataset.asgNotes);
    if (a) put("assignments", a.id, { ...strip(a), notes: t.value });
  } else if (t.dataset.asgLink) {
    const a = S.asg.find((x) => x.id === t.dataset.asgLink);
    if (a) put("assignments", a.id, { ...strip(a), link: t.value.trim() });
  }
});

export { ASG_ST, ASG_TYPES, ATT_LBL, breakOn, semPeriod, subjOptions, wkMon };
