// Self-study courses, study plan calendar and 16-week plan
import { hub } from "./registry.js";
import {
  $,
  ICON,
  S,
  STUDY_PLAN,
  SVG,
  catIdx,
  catName,
  catTag,
  del,
  dkey,
  esc,
  fmtDate,
  isWeekend,
  isoDay,
  keyDow,
  newId,
  nowISO,
  pad,
  put,
  routineIcon,
  saveCats,
  strip,
  toast,
  todayKey,
} from "./core.js";
import { fmtMins } from "./today.js";
import { newSubId } from "./tasks.js";
import { startTimer } from "./timers.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  courseStats: { get: () => courseStats, enumerable: true },
  renderGrowth: { get: () => renderGrowth, enumerable: true },
});

// ---------- Growth: courses, habit streaks, skills
let courseDel = null;
S.modOpen = {};
S.cskEdit = null;
S.coMore = null;
document.addEventListener(
  "toggle",
  (e) => {
    const d = e.target;
    if (d.matches && d.matches("details[data-cmore]"))
      S.coMore = d.open ? d.dataset.cmore : S.coMore === d.dataset.cmore ? null : S.coMore;
  },
  true,
);
document.addEventListener(
  "toggle",
  (e) => {
    const d = e.target;
    if (d.matches && d.matches("details[data-cid]")) S.modOpen[d.dataset.cid] = d.open;
  },
  true,
);
function minsFor(pred) {
  return S.time.filter(pred).reduce((a, x) => a + (+x.mins || 0), 0);
}
function weekAgoKey() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return dkey(d);
}
function courseStats(c) {
  const mods = c.modules || [],
    done = mods.filter((m) => m.done).length;
  const mins = minsFor((x) => x.type === "course" && x.ref === c.id),
    week = minsFor((x) => x.type === "course" && x.ref === c.id && x.date >= weekAgoKey());
  const days = new Set([
    ...S.time.filter((x) => x.type === "course" && x.ref === c.id).map((x) => x.date),
    ...mods.filter((m) => m.done && m.doneAt).map((m) => isoDay(m.doneAt)),
  ]);
  let streak = 0;
  const d = new Date();
  if (!days.has(dkey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dkey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  let pace = "";
  if (c.target && mods.length && done < mods.length) {
    const daysLeft = Math.ceil((new Date(c.target + "T23:59") - new Date()) / 864e5),
      weeks = Math.max(daysLeft / 7, 1 / 7);
    const need = (mods.length - done) / weeks;
    const recent = mods.filter((m) => m.done && m.doneAt && isoDay(m.doneAt) >= weekAgoKey()).length;
    pace =
      daysLeft < 0
        ? `<span class="warn-t">Target date has passed</span>`
        : `Need about <b>${need < 1 ? need.toFixed(1) : Math.ceil(need)}</b> module${need === 1 ? "" : "s"}/week to finish by ${esc(fmtDate(c.target))} · ${recent >= need ? `<span class="ok-t">on track</span>` : `<span class="warn-t">${recent} done this week</span>`}`;
  } else if (mods.length && done === mods.length) pace = `<span class="ok-t">Completed. Well done!</span>`;
  return { mods, done, pct: mods.length ? Math.round((done / mods.length) * 100) : 0, mins, week, streak, pace };
}
// ---------- Study plan calendar (Study → Study plan): self-study sessions by day
S.plM = null;
S.plSel = null;
function renderPlanCal() {
  const box = $("#st-plan");
  if (!box) return;
  const items = S.todos.filter((t) => t.kind === "self" && t.date),
    tk = todayKey();
  if (!items.length) {
    box.innerHTML = `<p class="small muted" style="margin:0">No study sessions yet. Add the 16-week plan and every session appears here on its day.</p><div><button class="btn sm primary" type="button" data-sp="add" ${S.spBusy ? "disabled" : ""}>${S.spBusy ? "Adding…" : "Add study plan"}</button></div>`;
    return;
  }
  const dates = items.map((t) => t.date).sort(),
    lo = dates[0].slice(0, 7),
    hi = dates[dates.length - 1].slice(0, 7);
  if (!S.plM) S.plM = tk.slice(0, 7) < lo ? lo : tk.slice(0, 7) > hi ? hi : tk.slice(0, 7);
  if (!S.plSel)
    S.plSel = items.some((t) => t.date === tk)
      ? tk
      : items
          .filter((t) => t.date >= tk)
          .map((t) => t.date)
          .sort()[0] || dates[0];
  const [y, m] = S.plM.split("-").map(Number),
    first = new Date(y, m - 1, 1),
    n = new Date(y, m, 0).getDate(),
    lead = (first.getDay() + 6) % 7;
  const by = {};
  items.forEach((t) => (by[t.date] = by[t.date] || []).push(t));
  const short = (t) =>
    (t.title || "")
      .split(":")[0]
      .replace(/^Kaggle Learn – /, "Kaggle ")
      .replace(/^LeetCode SQL 50 – /, "SQL50 ");
  let g = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    .map((d) => `<span class="cal-dow">${d.slice(0, 1)}<span class="dow-rest">${d.slice(1)}</span></span>`)
    .join("");
  for (let i = 0; i < lead; i++) g += `<span></span>`;
  for (let d = 1; d <= n; d++) {
    const k = dkey(new Date(y, m - 1, d)),
      ts = (by[k] || []).sort((a, b) => a.id.localeCompare(b.id)),
      all = ts.length && ts.every((t) => t.done);
    const late = ts.some((t) => !t.done) && k < tk;
    g += `<button type="button" class="pl-day ${isWeekend(keyDow(k)) ? "is-we" : ""} ${k === tk ? "is-today" : ""} ${k === S.plSel ? "is-sel" : ""} ${late ? "is-late" : ""}" data-plday="${k}" aria-label="${esc(fmtDate(k))}"><span class="pl-n">${d}${all ? ' <span class="ok-t">✓</span>' : ""}</span>${ts.map((t) => `<span class="pl-ch cat-${catIdx(t.cat)} ${t.done ? "done" : ""}">${esc(short(t))}</span>`).join("")}</button>`;
  }
  const sel = (by[S.plSel] || []).sort((a, b) => a.id.localeCompare(b.id)),
    mins = sel.reduce((a, t) => a + (+t.mins || 0), 0);
  const prevOk = S.plM > lo,
    nextOk = S.plM < hi;
  box.innerHTML = `<div class="pl-head"><button class="btn sm" type="button" data-plm="-1" ${prevOk ? "" : "disabled"} aria-label="Previous month">‹</button><h2>${esc(first.toLocaleString("en-GB", { month: "long", year: "numeric" }))}</h2><button class="btn sm" type="button" data-plm="1" ${nextOk ? "" : "disabled"} aria-label="Next month">›</button><button class="btn sm ghost" type="button" data-pltoday>Today</button></div>
    <div class="pl-grid">${g}</div>
    <div class="pl-detail"><div class="sechead" style="margin:0"><h3>${esc(fmtDate(S.plSel))}${S.plSel === tk ? " · Today" : ""}</h3><span class="meta">${sel.length ? fmtMins(mins) + " planned" : "Nothing planned"}</span></div>
      ${sel.length ? `<ul class="rows">${sel.map((t) => `<li class="${t.done ? "done" : ""}"><input type="checkbox" data-todo="${esc(t.id)}" ${t.done ? "checked" : ""} aria-label="Done: ${esc(t.title)}"><span class="grow"><span>${t.cat ? catTag(t.cat) + " " : ""}${esc(t.title)}</span>${t.finMod ? `<div class="sub ok-t">Finishes this module</div>` : ""}</span><button class="x tl-ed" type="button" data-todoedit="${esc(t.id)}" aria-label="Edit">${SVG(ICON.edit)}</button></li>`).join("")}</ul>` : `<p class="small muted" style="margin:0">Rest day, or a holiday.</p>`}</div>`;
}
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("[data-plm],[data-pltoday],[data-plday]");
  if (!t) return;
  if (t.dataset.plm) {
    const [y, m] = S.plM.split("-").map(Number),
      d = new Date(y, m - 1 + +t.dataset.plm, 1);
    S.plM = dkey(d).slice(0, 7);
  } else if (t.dataset.pltoday !== undefined) {
    S.plM = null;
    S.plSel = null;
  } else S.plSel = t.dataset.plday;
  renderPlanCal();
});
// ---------- 16-week study plan: courses + one self-study to-do per session
const SP_CAT_NAMES = {
  python: "Python / Automation",
  sql: "SQL / Database",
  excel: "Excel / Reporting",
  cs: "CS fundamentals",
  data: "Data analysis",
  dsa: "DSA",
  ml: "Machine learning",
};
const spSlug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
S.spBusy = false;
S.spAsk = null;
const spTodos = () => S.todos.filter((t) => t.plan === "sp16");
const spTotal = () => STUDY_PLAN.days.reduce((a, d) => a + d[1].length, 0);
function spCourseId(c) {
  const ex = S.courses.find((x) => (x.name || "").trim().toLowerCase() === c.name.toLowerCase());
  return ex ? ex.id : "sp-" + c.id;
}
async function importStudyPlan() {
  if (!hub.db) {
    toast("Sign in first to add the study plan");
    return;
  }
  S.spBusy = true;
  renderStudyPlanBox();
  try {
    let catsChanged = false;
    for (const c of STUDY_PLAN.courses)
      if (!S.cats.find((k) => k.tag === c.skill)) {
        S.cats.push({ name: SP_CAT_NAMES[c.skill], tag: c.skill });
        catsChanged = true;
      }
    if (catsChanged) saveCats();
    const cOps = [],
      cid = {},
      mid = {};
    for (const c of STUDY_PLAN.courses) {
      const id = spCourseId(c),
        ex = S.courses.find((x) => x.id === id),
        mods = ((ex && ex.modules) || []).map((m) => ({ ...m }));
      cid[c.id] = id;
      mid[c.id] = {};
      c.modules.forEach((title) => {
        let m = mods.find((x) => (x.title || "").trim().toLowerCase() === title.toLowerCase());
        if (!m) {
          m = { id: "m-" + spSlug(title), title, done: false };
          mods.push(m);
        }
        mid[c.id][title] = m.id;
      });
      cOps.push([
        "set",
        id,
        {
          ...(ex ? strip(ex) : { createdAt: nowISO() }),
          name: ex ? ex.name : c.name,
          target: c.target,
          modules: mods,
          skills: [...new Set([...((ex && ex.skills) || []), c.skill])],
        },
      ]);
    }
    await hub.batchColl("courses", cOps);
    const V = STUDY_PLAN.v || 1,
      pre = V > 1 ? "s" + V + "-" : "sp";
    const stale = spTodos().filter((t) => (t.planV || 1) !== V),
      doneTitles = new Set(stale.filter((t) => t.done).map((t) => t.title));
    if (stale.length)
      await hub.batchColl(
        "todos",
        stale.filter((t) => !t.done).map((t) => ["delete", t.id]),
      );
    const have = new Set(
        spTodos()
          .filter((t) => (t.planV || 1) === V)
          .map((t) => t.id),
      ),
      tOps = [];
    STUDY_PLAN.days.forEach(([date, its]) =>
      its.forEach(([c, mod, task, mins, fin], i) => {
        const id = pre + date.replace(/-/g, "") + "x" + i;
        if (have.has(id)) return;
        if (doneTitles.has(`${mod}: ${task} (${fmtMins(mins)})`)) {
          doneTitles.delete(`${mod}: ${task} (${fmtMins(mins)})`);
          return;
        }
        const course = STUDY_PLAN.courses.find((x) => x.id === c);
        tOps.push([
          "set",
          id,
          {
            title: `${mod}: ${task} (${fmtMins(mins)})`,
            date,
            done: false,
            doneAt: "",
            createdAt: nowISO(),
            kind: "self",
            cat: course ? course.skill : "",
            course: c ? cid[c] : "",
            plan: "sp16",
            planV: V,
            mins,
            ...(c ? { mod: mid[c][mod], finMod: !!fin } : {}),
          },
        ]);
      }),
    );
    await hub.batchColl("todos", tOps);
    toast(
      stale.length
        ? `Study plan updated: ${tOps.length} new sessions`
        : `Study plan added: ${tOps.length} sessions across ${STUDY_PLAN.courses.length} courses`,
    );
  } catch (e) {
    console.error(e);
    toast("Couldn't add the plan. Check your connection and try again.");
  }
  S.spBusy = false;
  renderStudyPlanBox();
}
async function removeStudyPlan() {
  const left = spTodos().filter((t) => !t.done);
  S.spBusy = true;
  renderStudyPlanBox();
  try {
    await hub.batchColl(
      "todos",
      left.map((t) => ["delete", t.id]),
    );
    toast(`Removed ${left.length} unfinished sessions. Courses and finished sessions stay.`);
  } catch (e) {
    console.error(e);
    toast("Couldn't remove the plan. Check your connection and try again.");
  }
  S.spBusy = false;
  S.spAsk = null;
  renderStudyPlanBox();
}
// ticking a plan session logs its planned time to the course, and ticks the module when it is the session that finishes it
function spTicked(t, on) {
  const tid = "sp-" + t.id,
    has = S.time.some((x) => x.id === tid);
  if (on && t.mins && !has) {
    const end = new Date(),
      start = new Date(end.getTime() - t.mins * 60000);
    hub.saveTimeRec(tid, {
      start: start.toISOString(),
      end: end.toISOString(),
      mins: t.mins,
      date: todayKey(),
      type: t.course ? "course" : "self",
      ref: t.course || t.id,
      label: t.title,
      via: "manual",
      ...(t.mod ? { mod: t.mod } : {}),
    });
  } else if (!on && has) hub.delTimeRec(tid);
  if (on && t.finMod && t.course && t.mod) {
    const c = S.courses.find((x) => x.id === t.course),
      m = c && (c.modules || []).find((x) => x.id === t.mod);
    if (m && !m.done) {
      saveCourse({
        ...c,
        modules: c.modules.map((x) => (x.id === t.mod ? { ...x, done: true, doneAt: nowISO() } : x)),
      });
      toast("Module done: " + m.title);
    }
  }
}
function renderStudyPlanBox() {
  const box = $("#sp-box");
  if (!box) return;
  const all = spTodos(),
    dn = all.filter((t) => t.done),
    tk = todayKey(),
    behind = all.filter((t) => !t.done && t.date < tk).length,
    total = spTotal();
  if (!all.length) {
    box.innerHTML = `<div class="sp-txt"><b>16-week study plan</b><span class="small muted">Adds SQL, Excel, Python, pandas, DSA, ML and CS knowledge as courses, plus a self-study to-do for each day from 9 Nov to 26 Feb (${total} sessions). Each day's session shows on Today and in the calendar.</span></div><span class="sp-act"><button class="btn sm primary" type="button" data-sp="add" ${S.spBusy ? "disabled" : ""}>${S.spBusy ? "Adding…" : "Add study plan"}</button></span>`;
    return;
  }
  const outdated = all.some((t) => (t.planV || 1) !== (STUDY_PLAN.v || 1) && !t.done);
  const next = all.filter((t) => !t.done).sort((a, b) => a.date.localeCompare(b.date))[0];
  box.innerHTML = `<div class="sp-txt"><b>16-week study plan</b><span class="small muted">${dn.length} of ${all.length} sessions done · ${behind ? `<span class="warn-t">${behind} overdue</span>` : `<span class="ok-t">on track</span>`}${next ? ` · next: ${esc(fmtDate(next.date))}` : ""}</span><span class="bar"><i style="width:${Math.round((dn.length / all.length) * 100)}%"></i></span></div>
    <span class="sp-act"><a class="btn sm" href="#study-plan">Open calendar</a>${
      S.spAsk === "rm"
        ? `<span class="small">Remove ${all.length - dn.length} unfinished sessions?</span><button class="btn sm solid-danger" type="button" data-sp="rm-yes" ${S.spBusy ? "disabled" : ""}>Remove</button><button class="btn sm" type="button" data-sp="cancel">Cancel</button>`
        : `${outdated ? `<button class="btn sm primary" type="button" data-sp="add" ${S.spBusy ? "disabled" : ""}>${S.spBusy ? "Updating…" : "Update plan"}</button>` : all.filter((t) => (t.planV || 1) === (STUDY_PLAN.v || 1)).length < total && !all.some((t) => t.done) ? `<button class="btn sm" type="button" data-sp="add" ${S.spBusy ? "disabled" : ""}>Add missing sessions</button>` : ""}<button class="btn sm ghost danger" type="button" data-sp="rm">Remove plan</button>`
    }</span>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-sp]");
  if (!b) return;
  const a = b.dataset.sp;
  if (a === "add") importStudyPlan();
  else if (a === "rm") {
    S.spAsk = "rm";
    renderStudyPlanBox();
  } else if (a === "cancel") {
    S.spAsk = null;
    renderStudyPlanBox();
  } else if (a === "rm-yes") removeStudyPlan();
});
function renderCourses() {
  renderStudyPlanBox();
  const sums = S.courses.map(courseStats),
    tw = sums.reduce((a, x) => a + x.week, 0),
    md = sums.reduce((a, x) => a + x.done, 0),
    mt = sums.reduce((a, x) => a + x.mods.length, 0);
  $("#co-sum").innerHTML = S.courses.length
    ? `<span><b>${S.courses.length}</b> course${S.courses.length === 1 ? "" : "s"}</span><span><b>${md}/${mt}</b> modules done</span><span><b>${fmtMins(tw)}</b> this week</span><span><b>${fmtMins(sums.reduce((a, x) => a + x.mins, 0))}</b> total</span>`
    : "";
  const tk = todayKey(),
    order = (c) => {
      const x = courseStats(c);
      return (x.pct >= 100 ? "1" : "0") + (c.target || "9999");
    };
  $("#courses").innerHTML = S.courses.length
    ? S.courses
        .slice()
        .sort((a, b) => order(a).localeCompare(order(b)) || (a.createdAt || "").localeCompare(b.createdAt || ""))
        .map((c) => {
          const st = courseStats(c);
          const nx = st.mods.find((m) => !m.done),
            todayS = S.todos.filter((t) => t.kind === "self" && t.course === c.id && t.date === tk),
            nextS = todayS.length
              ? null
              : S.todos
                  .filter((t) => t.kind === "self" && t.course === c.id && !t.done && t.date > tk)
                  .sort((a, b) => a.date.localeCompare(b.date))[0];
          const noteN = S.snotes.filter((n) => n.course === c.id).length,
            late = c.target && st.pct < 100 && c.target < tk;
          return `<div class="panel course ${st.pct >= 100 ? "is-done" : ""}" data-course="${esc(c.id)}">
      <div class="co-head"><span class="co-ic">${SVG(ICON.book)}</span><div class="co-title"><b>${esc(c.name)}</b><span class="co-sub">${(c.skills || []).map((t) => catTag(t)).join("")}${c.target ? `<span class="small ${late ? "overdue" : "muted"}">${st.pct >= 100 ? "Finished" : "by " + esc(fmtDate(c.target))}</span>` : ""}</span></div>
        <span class="co-btns"><button class="iconbtn sm" type="button" data-cnotes title="Notes" aria-label="Notes">${SVG(ICON.note)}${noteN ? `<i class="co-badge">${noteN}</i>` : ""}</button><button class="iconbtn sm" type="button" data-logtime="course|${esc(c.id)}|${esc(c.name)}" title="Time log" aria-label="Time log">${SVG(ICON.timer)}</button><button class="btn sm primary" type="button" data-cfocus="${esc(c.id)}">${SVG(ICON.play)}25m</button></span></div>
      <div class="co-bar"><span class="bar"><i style="width:${st.pct}%"></i></span><span class="small mono-n">${st.done}/${st.mods.length} · ${st.pct}%</span></div>
      <div class="co-line small"><span><b>${fmtMins(st.week)}</b> this week</span><span><b>${fmtMins(st.mins)}</b> total</span><span class="co-fl">${SVG(ICON.flame)}<b>${st.streak}</b></span>${
        st.pace
          ? `<span class="co-pace muted">${st.pace
              .replace(/<[^>]+>/g, "")
              .replace(/^Need about /, "~")
              .replace(/ to finish by [^·]+/, "")}</span>`
          : ""
      }</div>
      ${
        todayS.length
          ? `<ul class="rows co-today">${todayS.map((t) => `<li class="${t.done ? "done" : ""}"><input type="checkbox" data-todo="${esc(t.id)}" ${t.done ? "checked" : ""} aria-label="Done: ${esc(t.title)}"><span class="grow"><span class="small muted">Today</span> ${esc(t.title.replace(/^[^:]+:\s*/, ""))}</span></li>`).join("")}</ul>`
          : nx
            ? `<div class="co-next"><span class="small muted">${nextS ? "Next session " + esc(fmtDate(nextS.date).replace(/^\w+, /, "")) : "Next up"}</span><b title="${esc(nx.title)}">${esc(nx.title)}</b><span class="co-next-b"><button type="button" class="iconbtn sm" data-logtime="course|${esc(c.id)}|${esc(c.name)}" data-logmod="${esc(nx.id)}" title="Log time" aria-label="Log time">${SVG(ICON.timer)}</button><button type="button" class="btn sm" data-cmod-done="${st.mods.indexOf(nx)}">✓ Done</button></span></div>`
            : ""
      }
      <div class="co-folds">
      <details class="co-mods" data-cid="${esc(c.id)}" ${S.modOpen[c.id] ? "open" : ""}><summary class="small">Modules <span class="muted">${st.done}/${st.mods.length}</span></summary>
        ${
          st.mods.length
            ? `<ul class="subs">${st.mods
                .map(
                  (m, i) =>
                    `<li class="${m.done ? "done" : ""}"><input type="checkbox" data-cmod="${i}" ${m.done ? "checked" : ""} aria-label="Module done: ${esc(m.title)}"><span class="grow">${esc(m.title)}${(() => {
                      const mm = S.time
                        .filter((x) => x.type === "course" && x.ref === c.id && x.mod === m.id)
                        .reduce((a, x) => a + (+x.mins || 0), 0);
                      return mm ? ` <span class="small muted">· ${fmtMins(mm)}</span>` : "";
                    })()}</span><button type="button" class="x tl-ed" data-logtime="course|${esc(c.id)}|${esc(c.name)}" data-logmod="${esc(m.id)}" aria-label="Log time for ${esc(m.title)}" title="Log time for this module">${SVG(ICON.timer)}</button><button type="button" class="x tl-ed" data-ge="mod:${esc(c.id)}:${i}" aria-label="Edit" title="Edit">${SVG(ICON.edit)}</button><button type="button" class="x" data-cmoddel="${i}" aria-label="Remove module">✕</button></li>`,
                )
                .join("")}</ul>`
            : `<p class="small muted">No modules yet. Add them under Edit.</p>`
        }
      </details>
      <details class="co-more" data-cmore="${esc(c.id)}" ${S.coMore === c.id || !st.mods.length ? "open" : ""}><summary class="small">Edit</summary>
        <div class="co-skills"><span class="small muted">Skills:</span>${
          S.cskEdit === c.id
            ? `${S.cats.map((k, i) => `<button type="button" class="qc ci-${i % 6}" data-csk="${esc(k.tag)}" aria-pressed="${(c.skills || []).includes(k.tag)}">${esc(k.name.split(/\s*\/\s*/)[0])}</button>`).join("")}<span class="qc-new"><input data-csknew placeholder="New skill" aria-label="New skill"><button type="button" class="qc" data-csknewadd>Add</button></span><button type="button" class="btn sm" data-cskdone>Done</button>`
            : `${(c.skills || []).map((t) => catTag(t)).join("")}<button type="button" class="linkbtn small" data-cskedit>${(c.skills || []).length ? "Change" : "+ Link skills"}</button>`
        }</div>
        <label class="f co-name">Course name<input class="inp" data-cname value="${esc(c.name)}"></label>
        <textarea class="inp" data-cmodnew rows="3" placeholder="Add modules: paste names, one per line"></textarea>
        <div class="co-foot"><button class="btn sm primary" type="button" data-cmodadd>Add modules</button><label class="small muted co-tgt">Target <input type="date" data-ctarget value="${esc(c.target || "")}"></label><button class="btn sm ghost danger" type="button" data-cdel>${courseDel === c.id ? "Tap again to delete" : "Delete course"}</button></div>
      </details></div></div>`;
        })
        .join("")
    : `<div class="panel empty">No courses yet. Add your Google certificate above to track modules, study hours and a streak.</div>`;
}
function saveCourse(c) {
  put("courses", c.id, strip(c));
}
$("#course-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const n = $("#course-name").value.trim();
  if (!n) return;
  const c = { name: n, target: $("#course-target").value || "", modules: [], createdAt: nowISO() };
  put("courses", newId(), c);
  $("#course-name").value = "";
  $("#course-target").value = "";
  toast("Course added. Paste its modules to track progress.");
});
document.addEventListener("click", (e) => {
  const card = e.target.closest("[data-course]");
  if (!card) return;
  const c = S.courses.find((x) => x.id === card.dataset.course);
  if (!c) return;
  const cdn = e.target.closest("[data-cmod-done]");
  if (cdn) {
    const mods = c.modules.map((m) => ({ ...m })),
      m = mods[+cdn.dataset.cmodDone];
    m.done = true;
    m.doneAt = nowISO();
    saveCourse({ ...c, modules: mods });
    toast("Module done");
    return;
  }
  if (e.target.closest("[data-cnotes]")) {
    S.noteSpace = "self";
    S.noteSubj = "c:" + c.id;
    S.noteEdit = null;
    location.hash = "#study-selfnotes";
    return;
  }
  if (e.target.closest("[data-cskedit]")) {
    S.cskEdit = c.id;
    renderCourses();
    return;
  }
  if (e.target.closest("[data-cskdone]")) {
    S.cskEdit = null;
    renderCourses();
    return;
  }
  const sk = e.target.closest("[data-csk]");
  if (sk) {
    const has = (c.skills || []).includes(sk.dataset.csk);
    saveCourse({
      ...c,
      skills: has ? c.skills.filter((t) => t !== sk.dataset.csk) : [...(c.skills || []), sk.dataset.csk],
    });
    return;
  }
  if (e.target.closest("[data-csknewadd]")) {
    const n = (card.querySelector("[data-csknew]").value || "").trim();
    if (!n) return;
    let tag =
      n
        .split(/[\s\/]+/)[0]
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "") || "skill";
    const ex = S.cats.find((k) => k.name.toLowerCase() === n.toLowerCase());
    if (ex) tag = ex.tag;
    else {
      while (S.cats.find((k) => k.tag === tag)) tag += "2";
      S.cats.push({ name: n, tag });
      saveCats();
    }
    saveCourse({ ...c, skills: [...new Set([...(c.skills || []), tag])] });
    toast("Skill linked");
    return;
  }
  if (e.target.closest("[data-cfocus]")) {
    startTimer({ type: "course", ref: c.id, label: c.name, mode: "focus", dur: 25 });
    return;
  }
  if (e.target.closest("[data-cmodadd]")) {
    const ta = card.querySelector("[data-cmodnew]");
    const lines = ta.value
      .split(/\n+/)
      .map((x) => x.replace(/^\s*[-*•\d.)]+\s*/, "").trim())
      .filter(Boolean);
    if (!lines.length) return;
    saveCourse({
      ...c,
      modules: [...(c.modules || []), ...lines.map((t) => ({ id: newSubId(), title: t, done: false }))],
    });
    S.coMore = null;
    toast(`${lines.length} module${lines.length > 1 ? "s" : ""} added`);
    return;
  }
  const md = e.target.closest("[data-cmoddel]");
  if (md) {
    const mods = [...c.modules];
    mods.splice(+md.dataset.cmoddel, 1);
    saveCourse({ ...c, modules: mods });
    return;
  }
  if (e.target.closest("[data-cdel]")) {
    if (courseDel !== c.id) {
      courseDel = c.id;
      renderCourses();
    } else {
      courseDel = null;
      del("courses", c.id);
      toast("Course deleted");
    }
  }
});
document.addEventListener("change", (e) => {
  const card = e.target.closest("[data-course]");
  if (!card) return;
  const c = S.courses.find((x) => x.id === card.dataset.course);
  if (!c) return;
  if (e.target.dataset.cmod !== undefined) {
    const mods = c.modules.map((m) => ({ ...m }));
    const m = mods[+e.target.dataset.cmod];
    m.done = e.target.checked;
    m.doneAt = m.done ? nowISO() : "";
    saveCourse({ ...c, modules: mods });
    if (m.done) toast("Module done");
  }
  if (e.target.matches("[data-ctarget]")) saveCourse({ ...c, target: e.target.value });
});
function habitStats() {
  const tk = todayKey(),
    st = hub.startKey(),
    nowHM = pad(new Date().getHours()) + ":" + pad(new Date().getMinutes());
  const monthStart = tk.slice(0, 8) + "01";
  return S.routine
    .filter((r) => !r.extra)
    .map((r) => {
      const days = r.days && r.days.length ? r.days : [0, 1, 2, 3, 4, 5, 6];
      let cur = 0,
        best = 0,
        run = 0,
        counting = true,
        mDone = 0,
        mSched = 0;
      const d = new Date();
      for (let i = 0; i < 120; i++) {
        const k = dkey(d);
        if (k < st) break;
        if (days.includes(d.getDay())) {
          const dd = S.day[k] || {},
            done = !!(dd.done || {})[r.id],
            skip = !!(dd.skip || {})[r.id];
          const pending = k === tk && !done && r.time > nowHM;
          if (!skip && !pending) {
            if (k >= monthStart) {
              mSched++;
              if (done) mDone++;
            }
            if (done) {
              run++;
              if (counting) cur = run;
              best = Math.max(best, run);
            } else {
              if (k !== tk) counting = false;
              run = 0;
            }
          }
        }
        d.setDate(d.getDate() - 1);
      }
      return { r, cur, best, mDone, mSched };
    })
    .filter((h) => h.mSched || h.cur)
    .sort((a, b) => b.cur - a.cur || b.mDone / (b.mSched || 1) - a.mDone / (a.mSched || 1));
}
function renderHabits() {
  const hs = habitStats();
  $("#habits").innerHTML = hs.length
    ? hs
        .map(
          (
            h,
          ) => `<div class="habit"><div class="hb-top">${routineIcon(h.r)}<span class="hb-name">${esc(h.r.label)}</span></div>
    <div class="hb-streak ${h.cur ? "on" : ""}">${SVG(ICON.flame)}<b>${h.cur}</b><span>day${h.cur === 1 ? "" : "s"}</span></div>
    <div class="hb-meta small muted">Best ${h.best} · This month ${h.mDone}/${h.mSched}</div></div>`,
        )
        .join("")
    : `<div class="panel empty" style="grid-column:1/-1">Tick routine items on the Today page and your streaks build up here.</div>`;
}
function skillData() {
  const selfT = S.todos.filter((t) => t.kind === "self");
  const cats = [
    ...new Set([
      ...S.cats.map((c) => c.tag),
      ...S.tasks.map((t) => t.category || ""),
      ...selfT.map((t) => t.cat || ""),
      ...S.courses.flatMap((c) => c.skills || []),
    ]),
  ];
  return cats
    .map((tag) => {
      const ts = S.tasks.filter((t) => (t.category || "") === tag),
        ss = selfT.filter((t) => (t.cat || "") === tag),
        cs = S.courses.filter((c) => (c.skills || []).includes(tag));
      if (!ts.length && !ss.length && !cs.length) return null;
      const done = ts.filter((t) => t.status === "done").sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
      const selfDone = ss.filter((t) => t.done).sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
      const workMins = minsFor((x) => x.type === "task" && ts.some((t) => t.id === x.ref)),
        studyMins = minsFor(
          (x) =>
            (x.type === "course" && cs.some((c) => c.id === x.ref)) ||
            (x.type === "self" && ss.some((t) => t.id === x.ref)),
        );
      return {
        tag,
        name: tag ? catName(tag) : "Uncategorised",
        done,
        open: ts.length - done.length,
        mins: workMins + studyMins,
        workMins,
        studyMins,
        selfDone,
        selfOpen: ss.length - selfDone.length,
        courses: cs,
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.done.length + b.selfDone.length + b.courses.length - (a.done.length + a.selfDone.length + a.courses.length) ||
        b.mins - a.mins,
    );
}
function resumeBullets() {
  const sd = skillData().filter((s) => s.done.length);
  const L = [];
  for (const s of sd) {
    const ex = s.done
      .slice(0, 3)
      .map((t) => t.title.replace(/^\(Example\)\s*/i, ""))
      .join("; ");
    L.push(
      `• ${s.name}: completed ${s.done.length} task${s.done.length > 1 ? "s" : ""}${s.workMins >= 60 ? ` (${Math.round(s.workMins / 60)}+ hours)` : ""}, including ${ex}.`,
    );
  }
  S.courses.forEach((c) => {
    const st = courseStats(c);
    if (st.done)
      L.push(
        `• ${c.name}: ${st.pct >= 100 ? "completed" : `${st.done} of ${st.mods.length} modules completed`}${st.mins >= 60 ? ` (${Math.round(st.mins / 60)}+ hours of study)` : ""}${(c.skills || []).length ? `, covering ${c.skills.map((t) => catName(t).split(/\s*\/\s*/)[0]).join(", ")}` : ""}.`,
      );
  });
  S.tasks
    .filter((t) => t.status === "done" && t.impact)
    .sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""))
    .forEach((t) => L.push(`• ${t.title}: ${t.impact}`));
  return L;
}
function renderSkills() {
  const sd = skillData();
  $("#skills").innerHTML = sd.length
    ? sd
        .map(
          (
            s,
          ) => `<div class="panel skill"><div class="sk-head">${catTag(s.tag)}<span class="muted small">${s.mins ? fmtMins(s.mins) + " total" : ""}</span></div>
      <div class="sk-src">${s.done.length || s.open ? `<span>${SVG(ICON.work)}Work: <b>${s.done.length}</b> done${s.open ? ` · ${s.open} open` : ""}${s.workMins ? ` · ${fmtMins(s.workMins)}` : ""}</span>` : ""}${
        s.courses.length
          ? `<span>${SVG(ICON.book)}Courses: ${s.courses
              .map((c) => {
                const st = courseStats(c);
                return `<a href="#study-courses">${esc(c.name)}</a> ${st.pct}%`;
              })
              .join(", ")}${s.studyMins ? ` · ${fmtMins(s.studyMins)}` : ""}</span>`
          : ""
      }${s.selfDone.length || s.selfOpen ? `<span>${SVG(ICON.class)}Self-study: <b>${s.selfDone.length}</b> done${s.selfOpen ? ` · ${s.selfOpen} to do` : ""}</span>` : ""}</div>
      ${
        s.done.length || s.selfDone.length || s.courses.some((c) => (c.modules || []).some((m) => m.done))
          ? `<ul class="sk-list">${[
              ...s.done.map((t) => ({
                at: t.doneAt,
                h: `<li data-task="${esc(t.id)}"><span>${esc(t.title)}</span>${t.impact ? `<span class="impact">${SVG(ICON.star)}${esc(t.impact)}</span>` : ""}</li>`,
              })),
              ...s.selfDone.map((t) => ({
                at: t.doneAt,
                h: `<li class="sk-self" data-todoedit="${esc(t.id)}" role="button" tabindex="0" title="Tap to edit"><span>${esc(t.title)}</span><span class="small muted">Self-study · ${esc(fmtDate(isoDay(t.doneAt)))}${minsFor((x) => x.type === "self" && x.ref === t.id) ? " · " + fmtMins(minsFor((x) => x.type === "self" && x.ref === t.id)) : ""}</span></li>`,
              })),
              ...s.courses.flatMap((c) =>
                (c.modules || [])
                  .filter((m) => m.done)
                  .map((m) => ({
                    at: m.doneAt || "",
                    h: `<li class="sk-self"><span>${esc(m.title)}</span><span class="small muted">Module · ${esc(c.name)}${m.doneAt ? " · " + esc(fmtDate(isoDay(m.doneAt))) : ""}</span></li>`,
                  })),
              ),
            ]
              .sort((a, b) => (b.at || "").localeCompare(a.at || ""))
              .slice(0, 6)
              .map((x) => x.h)
              .join("")}</ul>`
          : `<p class="small muted" style="margin:0">${s.courses.length ? "Linked to your course. Add self-study or finish work tasks with this skill to list them here." : "Finish a work task or self-study item with this skill to start your record."}</p>`
      }</div>`,
        )
        .join("")
    : `<div class="panel empty">Your skills build up here from work tasks, courses and self-study.</div>`;
  const b = resumeBullets();
  $("#bullets").textContent = b.length
    ? b.join("\n")
    : "Complete a few work tasks (and add a Result / impact when you mark them done) to generate resume bullet points here.";
  $("#bullets-copy").disabled = !b.length;
}
$("#bullets-copy").addEventListener("click", async () => {
  const txt = resumeBullets().join("\n");
  try {
    await navigator.clipboard.writeText(txt);
    toast("Bullet points copied");
  } catch {
    const r = document.createRange();
    r.selectNodeContents($("#bullets"));
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    toast("Select and copy the highlighted text");
  }
});
function renderGrowth() {
  renderCourses();
  renderHabits();
  renderSkills();
}

export { renderPlanCal, saveCourse, spTicked };
