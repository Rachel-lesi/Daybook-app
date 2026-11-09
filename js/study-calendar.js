// Study calendar
import { hub } from "./registry.js";
import {
  $,
  DAYS,
  ICON,
  S,
  SVG,
  dkey,
  esc,
  fmtDate,
  isWeekend,
  keyDow,
  newId,
  pad,
  put,
  saveCats,
  strip,
  toast,
  todayKey,
} from "./core.js";
import { toMin } from "./today.js";
import { longRange } from "./reports.js";
import { ASG_TYPES, breakOn, semPeriod, wkMon } from "./study.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  clsLoc: { get: () => clsLoc, enumerable: true },
  renderStudyCal: { get: () => renderStudyCal, enumerable: true },
});

// ---------- study calendar (classes, tests and deadlines; kept apart from the work calendar)
S.scMode = "week";
S.scSel = todayKey();
S.subjEdit = null;
S.scPick = null;
const clsLoc = (c) => (c && (c.room || (hub.subj(c.subj) || {}).location)) || "";
const monKey = (k) => hub.addDays(k, -((keyDow(k) + 6) % 7));
const asgOpenOn = (k) =>
  S.asg
    .filter((a) => a.due === k && !["submitted", "graded"].includes(a.status))
    .sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
const asgAllOn = (k) => S.asg.filter((a) => a.due === k).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
const BIG = ["test", "exam", "midterm", "final", "quiz"];
function scDue(a, short) {
  const ty = (ASG_TYPES.find((x) => x[0] === a.type) || ["", ""])[1],
    done = ["submitted", "graded"].includes(a.status);
  const tag = short ? "span" : "button";
  return `<${tag} ${short ? "" : `type="button" data-sc-asg="${esc(a.id)}"`} class="sc-due ${hub.subjCls(a.subj)} ${BIG.includes(a.type) ? "big" : ""} ${done ? "done" : ""}" title="${esc(hub.subjLabel(a.subj))} · ${esc(ty)}: ${esc(a.title)}${a.time ? " · " + hub.fmt12(a.time) : ""}${done ? " · done" : ""}">${done ? "✓ " : BIG.includes(a.type) ? "! " : ""}${esc(hub.subjLabel(a.subj))}${short ? "" : `<span class="sd-t"> · ${esc(a.title)}</span>`}</${tag}>`;
}
function renderStudyCal() {
  const box = $("#st-cal");
  if (!box) return;
  const tk = todayKey(),
    sel = S.scSel || tk,
    week = S.scMode === "week";
  const sp = semPeriod(hub.addDays(monKey(sel), 2)),
    semTxt = sp ? sp.label : "";
  let label, body;
  if (week) {
    const m0 = monKey(sel),
      keys = [0, 1, 2, 3, 4, 5, 6].map((i) => hub.addDays(m0, i));
    const cls = keys.map((k) => hub.classesOn(k)),
      dues = keys.map(asgAllOn);
    const showWe = cls[5].length || cls[6].length || dues[5].length || dues[6].length;
    const cols = showWe ? keys.map((k, i) => i) : [0, 1, 2, 3, 4];
    let lo = 8 * 60,
      hi = 18 * 60;
    cls.flat().forEach((c) => {
      lo = Math.min(lo, Math.floor(toMin(c.start) / 60) * 60);
      hi = Math.max(hi, Math.ceil(toMin(c.end) / 60) * 60);
    });
    const ppm = 0.9,
      H = (hi - lo) * ppm,
      nowM = new Date().getHours() * 60 + new Date().getMinutes();
    const hours = [];
    for (let m = lo; m < hi; m += 60)
      hours.push(
        `<span style="top:${((m - lo) * ppm).toFixed(1)}px">${m === lo ? "" : hub.fmt12(pad(Math.floor(m / 60)) + ":00")}</span>`,
      );
    label = `${semTxt ? semTxt + " · " : ""}${longRange(keys[0], keys[6])}`;
    const anyDue = cols.some((i) => dues[i].length);
    body = `<div class="tt-scroll"><div class="tt sc-week" style="--cols:${cols.length}">
      <div class="tt-hd"></div>${cols.map((i) => `<button type="button" class="tt-hd sc-hd ${keys[i] === tk ? "today" : ""}" data-sc-day="${keys[i]}"><span>${DAYS[keyDow(keys[i])]}</span><b>${+keys[i].slice(8)}</b></button>`).join("")}
      ${anyDue ? `<div class="sc-lbl">Due</div>${cols.map((i) => `<div class="sc-dues">${dues[i].map((a) => scDue(a)).join("")}</div>`).join("")}` : ""}
      <div class="sch-times" style="height:${H}px">${hours.join("")}</div>
      ${cols
        .map(
          (
            i,
          ) => `<div class="sch-col tt-col ${keys[i] === tk ? "is-today" : ""}" style="height:${H}px;--hr:${60 * ppm}px">${cls[
            i
          ]
            .map((c) => {
              const top = (toMin(c.start) - lo) * ppm,
                h = Math.max((toMin(c.end) - toMin(c.start)) * ppm, 24),
                s = hub.subj(c.subj),
                loc = clsLoc(c);
              return `<button type="button" class="ev tt-ev sc-ev ${hub.subjCls(c.subj)} ${hub.attOf(c, keys[i]) ? "att-" + hub.attOf(c, keys[i]) : ""} ${S.scPick === c.id + "|" + keys[i] ? "is-pick" : ""}" style="top:${top}px;height:${h}px;left:2px;width:calc(100% - 4px)" data-sc-cls="${esc(c.id)}|${keys[i]}" title="${esc(s ? s.name : "")} · ${esc((hub.CLS_TYPES.find((x) => x[0] === c.type) || ["", ""])[1])} · ${hub.fmt12(c.start)}–${hub.fmt12(c.end)}${loc ? " · " + esc(loc) : ""}"><span class="ev-t">${esc(hub.subjLabel(c.subj))}</span>${h > 30 && loc ? `<span class="ev-s ev-loc">${SVG(ICON.pin)}${esc(loc)}</span>` : ""}${h > 46 ? `<span class="ev-s">${esc((hub.CLS_TYPES.find((x) => x[0] === c.type) || ["", ""])[1])}</span>` : ""}${h > 62 ? `<span class="ev-s">${hub.fmt12(c.start)}–${hub.fmt12(c.end)}</span>` : ""}</button>`;
            })
            .join("")}
        ${keys[i] === tk && nowM >= lo && nowM <= hi ? `<b class="sch-now" style="top:${((nowM - lo) * ppm).toFixed(1)}px"></b>` : ""}</div>`,
        )
        .join("")}
    </div></div>
    ${(() => {
      if (!S.scPick) return "";
      const [pid, pk] = S.scPick.split("|"),
        c = S.classes.find((x) => x.id === pid);
      if (!c) return "";
      const s = hub.subj(c.subj),
        a = hub.attOf(c, pk);
      return `<div class="sc-pick"><div><b>${esc(hub.subjLabel(c.subj))}</b> ${esc(s ? s.name : "")}<div class="small muted">${esc((hub.CLS_TYPES.find((x) => x[0] === c.type) || ["", ""])[1])} · ${esc(fmtDate(pk))} · ${hub.fmt12(c.start)}–${hub.fmt12(c.end)}${clsLoc(c) ? " · " + esc(clsLoc(c)) : ""}</div></div>
        <div class="seg"><button type="button" data-att="${esc(c.id)}|${pk}|" aria-pressed="${!a}">${pk <= todayKey() ? "Attended" : "Going"}</button><button type="button" data-att="${esc(c.id)}|${pk}|absent" aria-pressed="${a === "absent"}">Not attending</button><button type="button" data-att="${esc(c.id)}|${pk}|cancelled" aria-pressed="${a === "cancelled"}">Cancelled</button></div>
        <div class="row"><button type="button" class="btn sm" data-sc-edit="${esc(c.id)}">Edit class</button><button type="button" class="btn sm ghost" data-sc-pickx>Close</button></div></div>`;
    })()}
    ${cls.flat().length ? "" : `<p class="small muted" style="margin:0">${sp && sp.kind !== "teach" && sp.kind !== "before" ? `<b>${esc(sp.label)}</b>: no classes this week.` : S.classes.length ? "No classes this week." : "Add your classes in Timetable and they'll appear here every week."}</p>`}`;
  } else {
    const [y, mo] = sel.split("-").map(Number),
      first = dkey(new Date(y, mo - 1, 1)),
      nDays = new Date(y, mo, 0).getDate();
    label = new Date(y, mo - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
    let h = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      .map((d) => `<span class="cal-dow">${d.slice(0, 1)}<span class="dow-rest">${d.slice(1)}</span></span>`)
      .join("");
    for (let i = 0; i < (keyDow(first) + 6) % 7; i++) h += `<span class="cal-blank"></span>`;
    for (let d = 1; d <= nDays; d++) {
      const k = dkey(new Date(y, mo - 1, d)),
        cs = hub.classesOn(k),
        ds = asgAllOn(k),
        p = keyDow(k) === 1 ? semPeriod(hub.addDays(k, 2)) : null,
        bk = breakOn(k);
      h += `<div class="sc-day ${k === tk ? "is-today" : ""} ${isWeekend(keyDow(k)) ? "is-we" : ""} ${bk ? "is-brk brk-" + bk.kind : ""}" data-sc-day="${k}" role="button" tabindex="0" aria-label="${esc(fmtDate(k))}">
        <span class="sc-n">${d}${p ? `<small>${p.kind === "teach" ? "W" + p.week : p.kind === "swotvac" ? "SWOT" : p.kind === "exam" ? "Exams" : p.kind === "break" ? "Break" : ""}</small>` : ""}</span>
        ${cs.length ? `<span class="sc-dots">${cs.map((c) => `<i class="${hub.subjCls(c.subj)} ${hub.attOf(c, k) ? "off" : ""}"></i>`).join("")}</span>` : ""}
        ${ds
          .slice(0, 3)
          .map((a) => scDue(a, true))
          .join("")}${ds.length > 3 ? `<span class="small muted">+${ds.length - 3}</span>` : ""}</div>`;
    }
    body = `<div class="sc-month">${h}</div><div class="tl-legend"><span><i class="lg sc-lg-dot"></i>Class</span><span><b>!</b> or red: test, quiz or exam</span><span>Faded: submitted</span><span class="muted">Tap a day to see its week</span></div>`;
  }
  const up = S.asg
    .filter((a) => a.due && a.due >= tk && !["submitted", "graded"].includes(a.status))
    .sort((a, b) => (a.due + (a.time || "")).localeCompare(b.due + (b.time || "")))
    .slice(0, 6);
  box.innerHTML = `<div class="sch-head">
      <div class="sch-title"><span class="muted small">${esc(label)}</span></div>
      <div class="sch-ctrl"><button class="btn sm" type="button" data-sc-nav="-1" aria-label="Previous">‹</button><button class="btn sm ghost" type="button" data-sc-today>Today</button><button class="btn sm" type="button" data-sc-nav="1" aria-label="Next">›</button>
        <div class="seg"><button type="button" data-sc-mode="week" aria-pressed="${week}">Week</button><button type="button" data-sc-mode="month" aria-pressed="${!week}">Month</button></div></div></div>
    ${body}
    ${
      up.length
        ? `<div class="sc-up"><div class="small muted" style="font-weight:600">Coming up</div><ul class="hlist">${up
            .map((a) => {
              const n = Math.round((new Date(a.due + "T00:00") - new Date(tk + "T00:00")) / 864e5);
              return `<li><span class="hl-t">${n === 0 ? "Today" : n === 1 ? "Tmrw" : n + " days"}</span><span class="tag ${hub.subjCls(a.subj)}">${esc(hub.subjLabel(a.subj))}</span><span class="hl-b">${BIG.includes(a.type) ? "<b>" : ""}${esc(a.title)}${BIG.includes(a.type) ? "</b>" : ""} <span class="muted small">· ${esc(fmtDate(a.due))}${a.time ? " " + hub.fmt12(a.time) : ""}</span></span><span></span></li>`;
            })
            .join("")}</ul></div>`
        : ""
    }`;
}
document.addEventListener("click", (e) => {
  if (S.view !== "study") return;
  const t = e.target.closest(
    "[data-sc-nav],[data-sc-today],[data-sc-mode],[data-sc-day],[data-sc-cls],[data-sc-asg],[data-subj-edit],[data-subj-cancel],[data-sc-edit],[data-sc-pickx],[data-sbadd],[data-sbdel]",
  );
  if (!t || !t.closest("#v-study")) return;
  const d = t.dataset;
  if (d.scNav) {
    const [y, m, dd] = S.scSel.split("-").map(Number);
    S.scSel = S.scMode === "week" ? hub.addDays(S.scSel, 7 * +d.scNav) : dkey(new Date(y, m - 1 + +d.scNav, 1));
    renderStudyCal();
  } else if (d.scToday !== undefined) {
    S.scSel = todayKey();
    renderStudyCal();
  } else if (d.scMode) {
    S.scMode = d.scMode;
    renderStudyCal();
  } else if (d.scAsg) {
    e.stopPropagation();
    S.asgOpen = d.scAsg;
    S.asgFilter = "all";
    location.hash = "#study-assignments";
  } else if (d.scCls) {
    S.scPick = S.scPick === d.scCls ? null : d.scCls;
    renderStudyCal();
  } else if (d.scPickx !== undefined) {
    S.scPick = null;
    renderStudyCal();
  } else if (d.sbadd) {
    const br = (S.semBreaks || []).slice(),
      last = br
        .map((b) => b.to)
        .sort()
        .pop();
    let from =
      d.sbadd === "break"
        ? wkMon(hub.addDays(todayKey(), 7))
        : last && last >= (S.semStart || "")
          ? wkMon(hub.addDays(last, 7))
          : S.semStart
            ? hub.addDays(wkMon(S.semStart), 7 * (S.semWeeks + br.filter((b) => b.kind === "break").length))
            : wkMon(hub.addDays(todayKey(), 7));
    const len = d.sbadd === "exam" ? 13 : 6;
    br.push({ id: newId(), kind: d.sbadd, from, to: hub.addDays(from, len) });
    S.semBreaks = br;
    saveCats();
    hub.renderStudy();
    toast("Added. Check the dates match your university calendar.");
  } else if (d.sbdel) {
    S.semBreaks = (S.semBreaks || []).filter((b) => b.id !== d.sbdel);
    saveCats();
    hub.renderStudy();
  } else if (d.scEdit) {
    S.scPick = null;
    S.stEdit = d.scEdit;
    S.clsForm = true;
    const c = S.classes.find((x) => x.id === d.scEdit);
    if (c) S.clsType = c.type;
    location.hash = "#study-timetable";
    setTimeout(() => $("#cls-form") && $("#cls-form").scrollIntoView({ block: "center" }), 120);
  } else if (d.scDay) {
    if (S.scMode === "month") {
      S.scSel = d.scDay;
      S.scMode = "week";
      renderStudyCal();
    }
  } else if (d.subjEdit) {
    S.subjEdit = d.subjEdit;
    S.subjForm = false;
    hub.renderStudy();
    $("#se-name") && $("#se-name").focus();
  } else if (d.subjCancel !== undefined) {
    S.subjEdit = null;
    hub.renderStudy();
  }
});
document.addEventListener("keydown", (e) => {
  const m = e.target.closest && e.target.closest(".sc-day[data-sc-day]");
  if (m && e.target === m && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    m.click();
  }
});
document.addEventListener(
  "submit",
  (e) => {
    if (e.target.id !== "subj-edit-form") return;
    e.preventDefault();
    const s = hub.subj(S.subjEdit),
      n = $("#se-name").value.trim();
    if (!s || !n) return;
    put("subjects", s.id, {
      ...strip(s),
      code: $("#se-code").value.trim().toUpperCase(),
      name: n,
      lecturer: $("#se-lect").value.trim(),
      location: $("#se-loc").value.trim(),
      cFrom: $("#se-from").value,
      cTo: $("#se-to").value,
    });
    S.subjEdit = null;
    toast("Subject updated");
  },
  true,
);
document.addEventListener("change", (e) => {
  if (e.target.id === "cl-subj" && $("#cl-room")) {
    const l = (hub.subj(e.target.value) || {}).location;
    $("#cl-room").placeholder = l ? `Location (blank = ${l})` : "Location, e.g. DK3, Lab 2 or Zoom link";
  }
});
