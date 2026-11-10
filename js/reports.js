// Weekly reports and saved report archive
import { hub } from "./registry.js";
import {
  $,
  ICON,
  KINDS,
  S,
  STATUS_LABEL,
  SVG,
  catName,
  dayDoc,
  dkey,
  esc,
  fmtDate,
  fmtTime,
  isoDay,
  nowISO,
  toast,
  todayKey,
  write,
} from "./core.js";
import { fmtMins, routineFor, sortTasks, taskMins } from "./today.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  autoSaveReports: { get: () => autoSaveReports, enumerable: true },
  renderReport: { get: () => renderReport, enumerable: true },
  weekKeys: { get: () => weekKeys, enumerable: true },
});

// ---------- weekly report / logbook
S.wkOff = 0;
function weekKeys(off) {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7);
  const out = [];
  for (let i = 0; i < 7; i++) {
    out.push(dkey(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
function weekData(off) {
  const keys = weekKeys(off),
    a = keys[0],
    b = keys[6],
    inW = (k) => k && k >= a && k <= b;
  const completed = S.tasks.filter((t) => t.status === "done" && inW(isoDay(t.doneAt)));
  const active = S.tasks.filter(
    (t) =>
      t.status !== "done" &&
      ((t.log || []).some((l) => inW(isoDay(l.at))) || inW(isoDay(t.createdAt)) || (t.due && t.due <= b)),
  );
  const updates = S.tasks.reduce(
    (n, t) => n + (t.log || []).filter((l) => inW(isoDay(l.at)) && !/^Task added/.test(l.note)).length,
    0,
  );
  const timeW = S.time.filter((x) => inW(x.date) && x.type === "task");
  const byCat = {};
  timeW.forEach((x) => {
    let k = "Other";
    if (x.type === "task") {
      const t = S.tasks.find((y) => y.id === x.ref);
      k = t ? catName(t.category) : "Work";
    } else if (x.type === "course") k = "Study: " + hub.timerTargetLabel("course", x.ref);
    else if (x.type === "self" || x.type === "study")
      k = (x.type === "self" ? "Self-study: " : "Study: ") + (x.label || "");
    else k = "Focus";
    byCat[k] = (byCat[k] || 0) + (+x.mins || 0);
  });
  const totalMins = timeW.reduce((s, x) => s + (+x.mins || 0), 0);
  const todosDone = S.todos.filter((t) => t.done && inW(isoDay(t.doneAt))).length;
  let rs = 0,
    rd = 0;
  keys
    .filter((k) => k <= todayKey() && S.day[k])
    .forEach((k) => {
      const dd = dayDoc(k);
      routineFor(k)
        .filter((r) => !(dd.skip || {})[r.id])
        .forEach((r) => {
          rs++;
          if ((dd.done || {})[r.id]) rd++;
        });
    });
  const wRefl = (k) => (S.refl[k] && hub.areaHas(hub.reflAreas(S.refl[k]).work) ? S.refl[k] : null);
  const days = keys
    .map((k) => ({
      k,
      refl: wRefl(k),
      upd: S.tasks
        .map((t) => ({
          t,
          e: (t.log || []).filter((l) => isoDay(l.at) === k && !/^(Task added|Progress \d|Status:)/.test(l.note)),
        }))
        .filter((x) => x.e.length),
    }))
    .filter((d) => d.refl || d.upd.length);
  const wr = (k) => (S.refl[k] ? { date: k, ...hub.reflAreas(S.refl[k]).work } : null);
  const learned = keys.map(wr).filter((r) => r && (r.learned || "").trim());
  const mistakes = keys.map(wr).filter((r) => r && ((r.mistakes || "").trim() || (r.improve || "").trim()));
  const nk = weekKeys(off + 1),
    next = sortTasks(S.tasks.filter((t) => t.status !== "done" && (!t.due || t.due <= nk[6])));
  return {
    keys,
    a,
    b,
    completed,
    active,
    updates,
    totalMins,
    byCat,
    todosDone,
    routinePct: rs ? Math.round((rd / rs) * 100) : null,
    days,
    learned,
    mistakes,
    next,
    reflN: keys.filter((k) => wRefl(k)).length,
  };
}
const shortDay = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
};
const longRange = (a, b) =>
  `${shortDay(a).replace(/^\w+ /, "")} – ${shortDay(b).replace(/^\w+ /, "")} ${b.slice(0, 4)}`;
function reportSections(W) {
  const cleanT = (t) => t.title.replace(/^\(Example\)\s*/i, "");
  return [
    [
      "Summary",
      [
        `${plural(W.completed.length, "task")} completed · ${plural(W.updates, "progress update")} · ${W.totalMins ? fmtMins(W.totalMins) + " of work time tracked" : "no work time tracked"} · ${plural(W.reflN, "work reflection")}`,
      ],
    ],
    [
      "Completed this week",
      W.completed.map(
        (t) =>
          `[${catName(t.category)}] ${cleanT(t)}${t.impact ? ` — ${t.impact}` : ""}${taskMins(t.id) ? ` (${fmtMins(taskMins(t.id))})` : ""}`,
      ),
    ],
    [
      "In progress",
      W.active.map(
        (t) =>
          `[${catName(t.category)}] ${cleanT(t)} — ${STATUS_LABEL[t.status]}, ${+t.progress || 0}%${t.due ? `, due ${fmtDate(t.due)}` : ""}${t.bottleneck ? `. Bottleneck: ${t.bottleneck}${t.bnSolved ? ` (solved${t.bnHow ? ": " + t.bnHow : ""})` : ""}` : ""}`,
      ),
    ],
    [
      "Daily log",
      W.days.map((d) => {
        const parts = [];
        {
          const wd = (hub.reflAreas(d.refl).work.did || "").trim();
          if (d.refl && wd) parts.push(wd);
        }
        d.upd.forEach((x) => parts.push(`${cleanT(x.t)}: ${x.e.map((e) => e.note).join("; ")}`));
        return `${shortDay(d.k)}: ${parts.join(" | ") || "—"}`;
      }),
    ],
    ["Key learnings", W.learned.map((r) => `${shortDay(r.date)}: ${r.learned.trim()}`)],
    [
      "Mistakes & improvements",
      W.mistakes.map(
        (r) =>
          `${shortDay(r.date)}: ${[(r.mistakes || "").trim().replace(/([^.!?])$/, "$1."), (r.improve || "").trim() ? "Next time: " + r.improve.trim() : ""].filter(Boolean).join(" ")}`,
      ),
    ],
    [
      "Time by area",
      Object.entries(W.byCat)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}: ${fmtMins(v)}`),
    ],
    [
      "Plan for next week",
      W.next.slice(0, 8).map((t) => `[${catName(t.category)}] ${cleanT(t)}${t.due ? ` — due ${fmtDate(t.due)}` : ""}`),
    ],
  ];
}
function reportTitle(W) {
  return `Work Weekly Report: ${longRange(W.a, W.b)}`;
}
// ---------- separate weekly reports: Work, Study & courses, Daily life
S.wkArea = "work";
const WK_AREAS = [
  [
    "work",
    "Work",
    "For your supervisor or internship logbook. Built from your work tasks, work time and work reflections.",
  ],
  [
    "study",
    "Study & courses",
    "Your week at university and in your courses: submissions, classes, study time and what you learned.",
  ],
  ["life", "Daily life", "Your week outside work and study: routine, health, sleep, meals and money."],
];
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
function areaRefl(keys, area) {
  return keys
    .map((k) => (S.refl[k] ? { date: k, ...hub.reflAreas(S.refl[k])[area] } : null))
    .filter((r) => r && hub.areaHas(r));
}
function reflSections(R) {
  return [
    ["Daily log", R.filter((r) => (r.did || "").trim()).map((r) => `${shortDay(r.date)}: ${r.did.trim()}`)],
    ["Key learnings", R.filter((r) => (r.learned || "").trim()).map((r) => `${shortDay(r.date)}: ${r.learned.trim()}`)],
    [
      "Mistakes & improvements",
      R.filter((r) => (r.mistakes || "").trim() || (r.improve || "").trim()).map(
        (r) =>
          `${shortDay(r.date)}: ${[(r.mistakes || "").trim().replace(/([^.!?])$/, "$1."), (r.improve || "").trim() ? "Next time: " + r.improve.trim() : ""].filter(Boolean).join(" ")}`,
      ),
    ],
  ];
}
function studyReport(off) {
  const keys = weekKeys(off),
    a = keys[0],
    b = keys[6],
    tk = todayKey(),
    inW = (k) => k && k >= a && k <= b;
  const subm = S.asg.filter((x) => ["submitted", "graded"].includes(x.status) && inW(isoDay(x.doneAt)));
  const sTodos = S.todos.filter((t) => t.kind === "study" && t.done && inW(isoDay(t.doneAt))),
    selfT = S.todos.filter((t) => t.kind === "self" && t.done && inW(isoDay(t.doneAt)));
  const att = {};
  keys
    .filter((k) => k <= tk)
    .forEach((k) =>
      hub.classesOn(k).forEach((c) => {
        const st = hub.attOf(c, k);
        if (st === "cancelled") return;
        const r = (att[c.subj] = att[c.subj] || { held: 0, went: 0, miss: [] });
        r.held++;
        if (st === "absent") r.miss.push(shortDay(k));
        else r.went++;
      }),
    );
  const held = Object.values(att).reduce((s, r) => s + r.held, 0),
    went = Object.values(att).reduce((s, r) => s + r.went, 0);
  const tW = S.time.filter((x) => inW(x.date) && ["course", "self", "study", "asg"].includes(x.type)),
    mins = tW.reduce((s, x) => s + (+x.mins || 0), 0);
  const courseRows = S.courses
    .map((c) => {
      const m = tW.filter((x) => x.type === "course" && x.ref === c.id).reduce((s, x) => s + (+x.mins || 0), 0),
        md = (c.modules || []).filter((x) => x.done && inW(isoDay(x.doneAt)));
      return m || md.length
        ? `${c.name}: ${[m ? fmtMins(m) : "", md.length ? `modules done: ${md.map((x) => x.title).join(", ")}` : ""].filter(Boolean).join(" · ")} (${hub.courseStats(c).pct}% overall)`
        : null;
    })
    .filter(Boolean);
  const R = areaRefl(keys, "study"),
    nk = weekKeys(off + 1);
  const learnedAsg = subm.filter((x) => (x.learned || "").trim()).map((x) => `${x.title}: ${x.learned.trim()}`);
  const coming = S.asg
    .filter((x) => !["submitted", "graded"].includes(x.status) && x.due && x.due > b && x.due <= nk[6])
    .sort((x, y) => x.due.localeCompare(y.due));
  const sec = [
    [
      "Summary",
      [
        `${plural(subm.length, "submission")} · ${plural(sTodos.length, "study to-do")} done · classes attended ${held ? `${went}/${held}` : "–"} · ${mins ? fmtMins(mins) + " on courses & self-study" : "no study time logged"} · ${plural(R.length, "reflection")}`,
      ],
    ],
    [
      "Submitted & graded",
      subm.map(
        (x) =>
          `[${hub.subjLabel(x.subj)}] ${x.title} — ${x.status === "graded" && x.mark !== "" && x.mark != null ? `graded ${x.mark}%` : "submitted"} ${shortDay(isoDay(x.doneAt))}`,
      ),
    ],
    [
      "Classes",
      Object.entries(att).map(
        ([sid, r]) =>
          `${hub.subjLabel(sid)}: attended ${r.went} of ${r.held}${r.miss.length ? ` (missed ${r.miss.join(", ")})` : ""}`,
      ),
    ],
    [
      "Courses & self-study",
      [
        ...courseRows,
        ...selfT.map((t) => `${t.cat ? "[" + catName(t.cat).split(/\s*\/\s*/)[0] + "] " : ""}${t.title}`),
      ],
    ],
    ["Study to-dos done", sTodos.map((t) => `${t.subj ? "[" + hub.subjLabel(t.subj) + "] " : ""}${t.title}`)],
    ...reflSections(R).map(([h, it]) => (h === "Key learnings" ? [h, [...it, ...learnedAsg]] : [h, it])),
    [
      "Coming up next week",
      coming.map(
        (x) => `[${hub.subjLabel(x.subj)}] ${x.title} — due ${fmtDate(x.due)}${x.time ? " " + hub.fmt12(x.time) : ""}`,
      ),
    ],
  ];
  return {
    title: `Study Weekly Report: ${longRange(a, b)}`,
    sections: sec,
    stats: { done: subm.length, updates: sTodos.length + selfT.length, mins },
    has: subm.length || sTodos.length || selfT.length || mins || R.length || went,
  };
}
function lifeReport(off) {
  const keys = weekKeys(off),
    a = keys[0],
    b = keys[6],
    tk = todayKey(),
    inW = (k) => k && k >= a && k <= b,
    past = keys.filter((k) => k <= tk);
  const perKind = {};
  let rs = 0,
    rd = 0;
  past.forEach((k) => {
    const dd = dayDoc(k);
    routineFor(k)
      .filter((r) => !(dd.skip || {})[r.id] && !["work", "study", "class"].includes(r.kind))
      .forEach((r) => {
        const kk = r.kind || "other",
          p = (perKind[kk] = perKind[kk] || { s: 0, d: 0 });
        p.s++;
        rs++;
        if ((dd.done || {})[r.id]) {
          p.d++;
          rd++;
        }
      });
  });
  const todos = S.todos.filter((t) => !t.kind && t.done && inW(isoDay(t.doneAt)));
  const sl = past.map((k) => hub.sleepMins(hub.hDoc(k).sleep)).filter((v) => v != null),
    mood = past.map(hub.dayMood).filter((v) => v != null),
    water = past.map((k) => hub.hDoc(k).water || 0).filter(Boolean);
  const avg = (A) => A.reduce((s, v) => s + v, 0) / A.length,
    mc = hub.mealSrcCounts(past),
    meals = mc.home + mc.out + mc.delivery;
  const ex = S.exp.filter((x) => inW(x.date)),
    spent = ex.reduce((s, x) => s + (+x.amount || 0), 0),
    byC = {};
  ex.forEach((x) => (byC[x.cat] = (byC[x.cat] || 0) + (+x.amount || 0)));
  const R = areaRefl(keys, "life"),
    nk = weekKeys(off + 1),
    next = S.todos.filter((t) => !t.kind && !t.done && t.date > b && t.date <= nk[6]);
  const sec = [
    [
      "Summary",
      [
        `routine kept ${rs ? Math.round((rd / rs) * 100) + "%" : "–"} · ${plural(todos.length, "to-do")} done${sl.length ? ` · sleep ${hub.fmtHM(Math.round(avg(sl)))} a night` : ""}${mood.length ? ` · mood ${avg(mood).toFixed(1)}/5` : ""}${water.length ? ` · ${avg(water).toFixed(1)} cups of water a day` : ""} · spent ${hub.money(spent)}`,
      ],
    ],
    [
      "Routine & habits",
      Object.entries(perKind)
        .sort((x, y) => y[1].s - x[1].s)
        .map(
          ([k, p]) =>
            `${(KINDS.find((x) => x[0] === k) || ["", "Other"])[1]}: ${p.d} of ${p.s} (${Math.round((p.d / p.s) * 100)}%)`,
        ),
    ],
    ["To-dos done", todos.map((t) => t.title)],
    [
      "Health",
      [
        sl.length
          ? `Sleep: average ${hub.fmtHM(Math.round(avg(sl)))}, ${sl.filter((v) => v < 420).length} of ${sl.length} nights under 7 hours`
          : "",
        mood.length ? `Mood: average ${avg(mood).toFixed(1)}/5 over ${plural(mood.length, "day")}` : "",
        water.length
          ? `Water: ${avg(water).toFixed(1)} cups a day, goal met on ${water.filter((v) => v >= (S.waterGoal || 8)).length} days`
          : "",
        meals ? `Meals: ${mc.home} cooked, ${mc.out} restaurant, ${mc.delivery} delivery` : "",
      ].filter(Boolean),
    ],
    [
      "Money",
      spent
        ? [
            `Spent ${hub.money(spent)} (${hub.money(spent / Math.max(1, past.length))} a day)`,
            ...Object.entries(byC)
              .sort((x, y) => y[1] - x[1])
              .slice(0, 5)
              .map(([c, v]) => `${hub.expCat(c)[1]}: ${hub.money(v)}`),
          ]
        : [],
    ],
    ...reflSections(R),
    ["Planned for next week", next.map((t) => `${t.title} — ${fmtDate(t.date)}`)],
  ];
  return {
    title: `Daily Life Weekly Report: ${longRange(a, b)}`,
    sections: sec,
    stats: { done: todos.length, updates: rd, mins: 0 },
    has: todos.length || rd || sl.length || mood.length || spent || R.length,
  };
}
function repFor(area, off) {
  if (area === "study") return studyReport(off);
  if (area === "life") return lifeReport(off);
  const W = weekData(off);
  return {
    title: reportTitle(W),
    sections: reportSections(W),
    stats: { done: W.completed.length, updates: W.updates, mins: W.totalMins },
    has: W.completed.length || W.updates || W.totalMins || W.reflN,
  };
}

function reportText() {
  const W = weekData(S.wkOff),
    L = [reportTitle(W)];
  if (S.name) L.push(S.name);
  if (S.org) L.push(S.org);
  for (const [h, items] of reportSections(W)) {
    L.push("", h.toUpperCase());
    L.push(...(items.length ? items.map((x) => "- " + x) : ["- None"]));
  }
  return L.join("\n");
}
function reportHTML(forFile) {
  const W = weekData(S.wkOff);
  const body = reportSections(W)
    .map(
      ([h, items]) =>
        `<h2>${esc(h)}</h2>${items.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="none">None</p>`}`,
    )
    .join("");
  const head = `<h1>${esc(reportTitle(W))}</h1>${S.name || S.org ? `<p class="who">${esc([S.name, S.org].filter(Boolean).join(" · "))}</p>` : ""}`;
  if (!forFile) return head + body;
  return `<html><head><meta charset="utf-8"><title>${esc(reportTitle(W))}</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4;color:#111}h1{font-size:18pt;margin:0 0 4pt}h2{font-size:12pt;margin:14pt 0 4pt;color:#243c2c;border-bottom:1px solid #ccd;padding-bottom:2pt}.who{color:#555;margin:0 0 8pt}ul{margin:0;padding-left:18pt}li{margin:2pt 0}.none{color:#888;margin:0}</style></head><body>${head}${body}</body></html>`;
}
// ---------- saved weekly reports: kept, organised by year, month and week
S.reports = {};
S.wkMode = "live";
S.repMonth = null;
S.repDel = null;
S.repAutoDone = false;
const wkMonday = (off) => weekKeys(off)[0];
const offOf = (mon) => Math.round((new Date(mon + "T00:00") - new Date(wkMonday(0) + "T00:00")) / (7 * 864e5));
const repKey = (area, m) => (area === "work" ? m : area + "-" + m);
const repArea = (r) => r.area || "work";
function repDoc(area, off, note) {
  const keys = weekKeys(off),
    R = repFor(area, off);
  return {
    area,
    week: keys[0],
    end: keys[6],
    title: R.title,
    sections: R.sections,
    name: S.name || "",
    org: area === "work" ? S.org || "" : "",
    note: note || "",
    savedAt: nowISO(),
    stats: R.stats,
  };
}
function saveReport(off, auto, area) {
  area = area || S.wkArea;
  const k = repKey(area, wkMonday(off)),
    prev = repGet(k),
    d = { ...repDoc(area, off, prev ? prev.note : ""), auto: !!auto };
  S.reports[k] = d;
  if (hub.db) write("reports/" + k, () => hub.db.doc("reports/" + k).set(d));
  return d;
}
function autoSaveReports() {
  if (!S.ready || !S.repLoaded || Date.now() - (S.repAutoAt || 0) < 20000) return;
  S.repAutoAt = Date.now();
  for (let off = -1; off >= -4; off--)
    for (const [area] of WK_AREAS) {
      const k = repKey(area, wkMonday(off));
      if (!S.reports[k] && repFor(area, off).has) saveReport(off, true, area);
    }
}
const repGet = (k) => (S.reports[k] && !S.reports[k].deleted ? S.reports[k] : null);
function repView() {
  const saved = repGet(repKey(S.wkArea, wkMonday(S.wkOff)));
  return S.wkMode === "saved" && saved ? saved : null;
}
function repLive() {
  const R = repFor(S.wkArea, S.wkOff);
  return { ...R, name: S.name || "", org: S.wkArea === "work" ? S.org || "" : "", note: "" };
}
function repHTMLFrom(R, forFile) {
  const body =
    R.sections
      .map(
        ([h, items]) =>
          `<h2>${esc(h)}</h2>${items.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="none">None</p>`}`,
      )
      .join("") + ((R.note || "").trim() ? `<h2>Notes</h2><p>${esc(R.note.trim()).replace(/\n/g, "<br>")}</p>` : "");
  const head = `<h1>${esc(R.title)}</h1>${R.name || R.org ? `<p class="who">${esc([R.name, R.org].filter(Boolean).join(" · "))}</p>` : ""}`;
  if (!forFile) return head + body;
  return `<html><head><meta charset="utf-8"><title>${esc(R.title)}</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4;color:#111}h1{font-size:18pt;margin:0 0 4pt}h2{font-size:12pt;margin:14pt 0 4pt;color:#243c2c;border-bottom:1px solid #ccd;padding-bottom:2pt}.who{color:#555;margin:0 0 8pt}ul{margin:0;padding-left:18pt}li{margin:2pt 0}.none{color:#888;margin:0}</style></head><body>${head}${body}</body></html>`;
}
function repTextFrom(R) {
  const L = [R.title];
  if (R.name) L.push(R.name);
  if (R.org) L.push(R.org);
  for (const [h, items] of R.sections) {
    L.push("", h.toUpperCase());
    L.push(...(items.length ? items.map((x) => "- " + x) : ["- None"]));
  }
  if ((R.note || "").trim()) L.push("", "NOTES", R.note.trim());
  return L.join("\n");
}
function renderSavedReports() {
  const box = $("#wk-saved");
  if (!box) return;
  const all = Object.values(S.reports)
    .filter((r) => !r.deleted && repArea(r) === S.wkArea)
    .sort((a, b) => b.week.localeCompare(a.week));
  if (!all.length) {
    box.innerHTML = `<p class="small muted" style="margin:0">Saved ${esc(WK_AREAS.find((x) => x[0] === S.wkArea)[1].toLowerCase())} reports are kept here, filed by year, month and week. Tap <b>Save report</b> above, or they're saved for you automatically after each week ends.</p>`;
    return;
  }
  const byM = {};
  all.forEach((r) => (byM[r.week.slice(0, 7)] = byM[r.week.slice(0, 7)] || []).push(r));
  if (S.repMonth && !byM[S.repMonth]) S.repMonth = null;
  if (!S.repMonth) {
    const years = [...new Set(Object.keys(byM).map((k) => k.slice(0, 4)))].sort().reverse();
    box.innerHTML =
      `<div class="arc-crumbs"><b>All ${esc(WK_AREAS.find((x) => x[0] === S.wkArea)[1].toLowerCase())} reports</b><span class="muted small">${all.length} saved</span></div>` +
      years
        .map(
          (y) =>
            `<div class="arc-year">${y}</div><div class="arc-folders">${Object.keys(byM)
              .filter((k) => k.startsWith(y))
              .sort()
              .reverse()
              .map(
                (k) =>
                  `<button type="button" class="folder" data-repm="${k}"><span class="fd-ic">${SVG(ICON.folder)}</span><span class="fd-name">${hub.MONTHS[+k.slice(5) - 1]}</span><span class="fd-meta">${byM[k].length} report${byM[k].length > 1 ? "s" : ""}</span></button>`,
              )
              .join("")}</div>`,
        )
        .join("");
    return;
  }
  const rs = byM[S.repMonth];
  box.innerHTML = `<div class="arc-crumbs"><button type="button" class="crumb" data-repm="">All ${esc(WK_AREAS.find((x) => x[0] === S.wkArea)[1].toLowerCase())} reports</button><span class="muted">›</span><b>${hub.MONTHS[+S.repMonth.slice(5) - 1]} ${S.repMonth.slice(0, 4)}</b></div>
    <ul class="rep-list">${rs
      .map(
        (
          r,
        ) => `<li><button type="button" class="rep-open" data-repopen="${esc(r.week)}"><span class="aw-ic">${SVG(ICON.note)}</span><span><b>${esc(longRange(r.week, r.end))}</b><span class="small muted">${r.stats ? (repArea(r) === "work" ? `${r.stats.done} done · ${r.stats.updates} updates` : repArea(r) === "study" ? `${r.stats.done} submitted · ${r.stats.updates} to-dos` : `${r.stats.done} to-dos · ${r.stats.updates} routine ticks`) + (r.stats.mins ? " · " + fmtMins(r.stats.mins) : "") : ""}${(r.note || "").trim() ? " · has notes" : ""} · saved ${esc(fmtDate(isoDay(r.savedAt)))}${r.auto ? " (auto)" : ""}</span></span></button>
      <button type="button" class="x" data-repdel="${esc(repKey(repArea(r), r.week))}" aria-label="Delete saved report">${S.repDel === repKey(repArea(r), r.week) ? "Delete?" : "✕"}</button></li>`,
      )
      .join("")}</ul>`;
}
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("[data-repm],[data-repopen],[data-repdel],#wk-save,[data-wkmode]");
  if (!t) return;
  const d = t.dataset;
  if (d.repm !== undefined) {
    S.repMonth = d.repm || null;
    renderSavedReports();
  } else if (d.repopen) {
    S.wkOff = offOf(d.repopen);
    S.wkMode = "saved";
    renderReport();
    $("#wk-doc").scrollIntoView({ block: "start", behavior: "smooth" });
  } else if (d.repdel) {
    if (S.repDel !== d.repdel) {
      S.repDel = d.repdel;
      renderSavedReports();
    } else {
      const k = d.repdel;
      S.reports[k] = {
        week: k.replace(/^(study|life)-/, ""),
        area: (k.match(/^(study|life)-/) || [, "work"])[1],
        deleted: true,
        savedAt: nowISO(),
      };
      if (hub.db) write("reports/" + k, () => hub.db.doc("reports/" + k).set(S.reports[k]));
      S.repDel = null;
      S.wkMode = "live";
      renderReport();
      toast("Saved report deleted");
    }
  } else if (t.id === "wk-save") {
    const r = saveReport(S.wkOff, false),
      k = repKey(S.wkArea, r.week);
    if ($("#wk-note") && !$("#wk-notewrap").hidden) r.note = $("#wk-note").value;
    if (hub.db) write("reports/" + k, () => hub.db.doc("reports/" + k).set(r));
    S.wkMode = "saved";
    S.repMonth = r.week.slice(0, 7);
    renderReport();
    toast("Weekly report saved");
  } else if (d.wkmode) {
    S.wkMode = d.wkmode;
    renderReport();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id !== "wk-note") return;
  const k = repKey(S.wkArea, wkMonday(S.wkOff)),
    r = repGet(k);
  if (!r) return;
  r.note = e.target.value;
  if (hub.db) write("reports/" + k, () => hub.db.doc("reports/" + k).set(r));
  toast("Notes saved");
});
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-wkarea]");
  if (!b) return;
  S.wkArea = b.dataset.wkarea;
  S.repMonth = null;
  S.repDel = null;
  S.wkMode = repGet(repKey(S.wkArea, wkMonday(S.wkOff))) && S.wkOff < 0 ? "saved" : "live";
  renderReport();
});

function renderReport() {
  autoSaveReports();
  const W = { a: wkMonday(S.wkOff), b: weekKeys(S.wkOff)[6] },
    saved = repGet(repKey(S.wkArea, W.a)),
    R = repView();
  $("#wk-areas").innerHTML = WK_AREAS.map(
    ([k, l]) => `<button type="button" data-wkarea="${k}" aria-pressed="${S.wkArea === k}">${l}</button>`,
  ).join("");
  $("#wk-desc").textContent = WK_AREAS.find((x) => x[0] === S.wkArea)[2];
  $("#wk-h").textContent = WK_AREAS.find((x) => x[0] === S.wkArea)[1] + " weekly report";
  $("#wk-label").textContent =
    (S.wkOff === 0 ? "This week · " : S.wkOff === -1 ? "Last week · " : "") + longRange(W.a, W.b);
  $("#wk-next").disabled = S.wkOff >= 0;
  $("#wk-state").innerHTML = saved
    ? `<span class="wk-badge">${SVG(ICON.star)}Saved ${esc(fmtDate(isoDay(saved.savedAt)))} ${fmtTime(saved.savedAt)}${saved.auto ? " (auto)" : ""}</span><div class="seg"><button type="button" data-wkmode="saved" aria-pressed="${!!R}">Saved copy</button><button type="button" data-wkmode="live" aria-pressed="${!R}">Live</button></div>`
    : `<span class="small muted">Not saved yet</span>`;
  $("#wk-save").textContent = saved ? (R ? "Update with latest" : "Save over saved copy") : "Save report";
  $("#wk-notewrap").hidden = !saved;
  if (saved && document.activeElement !== $("#wk-note")) $("#wk-note").value = saved.note || "";
  $("#wk-doc").innerHTML = repHTMLFrom(R || repLive(), false);
  renderSavedReports();
}
document.addEventListener("click", async (e) => {
  const w = e.target.closest("[data-wk]");
  if (w) {
    S.wkOff += +w.dataset.wk;
    S.wkMode = repGet(repKey(S.wkArea, wkMonday(S.wkOff))) && S.wkOff < 0 ? "saved" : "live";
    renderReport();
    return;
  }
  if (e.target.closest("#wk-copy")) {
    const t = repTextFrom(repView() || repLive());
    try {
      await navigator.clipboard.writeText(t);
      toast("Weekly report copied");
    } catch {
      toast("Couldn't copy. Use Download instead.");
    }
    return;
  }
  if (e.target.closest("#wk-word")) {
    const W = weekData(S.wkOff);
    const blob = new Blob(["﻿", repHTMLFrom(repView() || repLive(), true)], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${{ work: "Work", study: "Study", life: "Daily-life" }[S.wkArea]}-weekly-report-${W.a}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast("Word file downloaded");
    return;
  }
  if (e.target.closest("#wk-print")) {
    document.body.classList.add("printing-report");
    setTimeout(() => {
      window.print();
      setTimeout(() => document.body.classList.remove("printing-report"), 500);
    }, 50);
  }
});

export { longRange, plural, shortDay };
