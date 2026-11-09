// Insights overview tiles and details
import { hub } from "./registry.js";
import {
  $,
  DAYS,
  KINDS,
  S,
  catTag,
  dayDoc,
  dkey,
  esc,
  fmtDate,
  isWeekend,
  isoDay,
  keyDow,
  pad,
  todayKey,
} from "./core.js";
import { routineFor, sortTasks } from "./today.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  renderOverview: { get: () => renderOverview, enumerable: true },
  startKey: { get: () => startKey, enumerable: true },
});

// ---------- overview
S.ovRange = 7;
S.ovOpen = null;
document.addEventListener("keydown", (e) => {
  const li = e.target.closest && e.target.closest(".od-list li[role=button]");
  if (li && e.target === li && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    li.click();
  }
});
function rangeKeys(n) {
  const out = [];
  const d = new Date();
  d.setDate(d.getDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    out.push(dkey(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
function startKey() {
  const c = [
    ...S.tasks.map((t) => isoDay(t.createdAt)),
    ...S.todos.map((t) => isoDay(t.createdAt)),
    ...Object.keys(S.refl),
    ...Object.keys(S.day).filter((k) => k <= todayKey()),
    ...Object.keys(S.health || {}).filter((k) => k <= todayKey()),
    ...(S.exp || []).map((e) => e.date),
  ]
    .filter(Boolean)
    .sort();
  return c[0] || todayKey();
}
function barChart(vals, labels, max, fmt, color) {
  const W = 600,
    H = 190,
    L = 50,
    B = 30,
    T = 10,
    R = 6,
    n = vals.length,
    cw = (W - L - R) / n,
    bw = Math.max(3, Math.min(36, cw * 0.62)),
    y = (v) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, max / 2, max];
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  ticks.forEach((t) => {
    s += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${y(t) + 3}" text-anchor="end">${fmt(t)}</text>`;
  });
  vals.forEach((v, i) => {
    const x = L + cw * i + (cw - bw) / 2;
    if (v === null) {
      s += `<rect x="${x}" y="${y(0) - 2}" width="${bw}" height="2" fill="var(--line)"/>`;
    } else {
      const h = Math.max(v > 0 ? 2 : 0, y(0) - y(v));
      s += `<rect x="${x}" y="${y(0) - h}" width="${bw}" height="${h}" rx="2" fill="${color}"><title>${esc(labels[i].full)}: ${fmt(v)}</title></rect>`;
    }
    if (labels[i].show) s += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(labels[i].short)}</text>`;
  });
  return s + `</svg>`;
}
function renderOverview() {
  const n = S.ovRange,
    tk = todayKey(),
    st = startKey();
  const keys = rangeKeys(n),
    active = keys.filter((k) => k >= st);
  $("#ov-range").innerHTML = [
    [7, "Last 7 days"],
    [30, "Last 30 days"],
  ]
    .map(([v, l]) => `<button type="button" data-ovr="${v}" aria-pressed="${n === v}">${l}</button>`)
    .join("");
  $("#ov-since").textContent =
    `Tracking since ${fmtDate(st)}` +
    (active.length < n ? ` · ${active.length} day${active.length > 1 ? "s" : ""} of data so far` : "");
  const inR = (k) => k && k >= keys[0] && k <= tk;
  // routine per day
  const perKind = {};
  let schedTot = 0,
    doneTot = 0;
  const rPct = keys.map((k) => {
    if (k < st) return null;
    const dd = dayDoc(k),
      items = routineFor(k).filter((r) => !(dd.skip || {})[r.id]);
    const isT = k === tk,
      nowHM = pad(new Date().getHours()) + ":" + pad(new Date().getMinutes());
    const due = isT ? items.filter((r) => r.time <= nowHM || (dd.done || {})[r.id]) : items;
    let d = 0;
    due.forEach((r) => {
      const ok = !!(dd.done || {})[r.id];
      if (ok) d++;
      const kk = r.kind || "other";
      perKind[kk] = perKind[kk] || { s: 0, d: 0 };
      perKind[kk].s++;
      if (ok) perKind[kk].d++;
    });
    schedTot += due.length;
    doneTot += d;
    return due.length ? Math.round((d / due.length) * 100) : null;
  });
  // work activity per day
  const isUpd = (l) => !/^Task added/.test(l.note || "");
  const wAct = keys.map((k) =>
    k < st ? null : S.tasks.reduce((a, t) => a + (t.log || []).filter((l) => isoDay(l.at) === k && isUpd(l)).length, 0),
  );
  const tasksDone = S.tasks.filter((t) => t.status === "done" && inR(isoDay(t.doneAt)));
  const updates = wAct.reduce((a, b) => a + (b || 0), 0);
  const todosDone = S.todos.filter((t) => t.done && inR(isoDay(t.doneAt))).length;
  const weekdays = active.filter((k) => !isWeekend(keyDow(k))).length;
  const refls = Object.values(S.refl).filter((r) => inR(r.date));
  const moods = refls.filter((r) => r.mood).map((r) => r.mood);
  const open = S.tasks.filter((t) => t.status !== "done");
  const tile = (v, l, s, id) =>
    `<button type="button" class="tile ${S.ovOpen === id ? "is-open" : ""}" data-ovt="${id}" aria-expanded="${S.ovOpen === id}"><span>${l}</span><b>${v}</b>${s ? `<small>${s}</small>` : ""}<i class="tile-more" aria-hidden="true">${S.ovOpen === id ? "Hide" : "Details"} ›</i></button>`;
  $("#ov-tiles").innerHTML = [
    tile(tasksDone.length, "Work tasks done", `${open.length} still open`, "tasks"),
    tile(updates, "Task updates logged", "", "updates"),
    tile(todosDone, "To-dos done", "", "todos"),
    tile(
      schedTot ? Math.round((doneTot / schedTot) * 100) + "%" : "–",
      "Routine kept",
      `${doneTot} of ${schedTot} items`,
      "routine",
    ),
    tile(
      `${refls.length}<span style="font-size:.9rem;text-transform:none;letter-spacing:0">/${weekdays || 0}</span>`,
      "Reflections",
      "written vs workdays",
      "refl",
    ),
    tile(
      moods.length ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : "–",
      "Avg energy",
      moods.length ? "out of 5" : "rate it in Reflection",
      "mood",
    ),
  ].join("");
  // details for the tapped tile
  const day = (k) => `<span class="od-d">${esc(fmtDate(k).replace(/^\w+, /, ""))}</span>`;
  const list = (rows, empty) =>
    rows.length ? `<ul class="od-list">${rows.join("")}</ul>` : `<p class="small muted" style="margin:0">${empty}</p>`;
  const D = {
    tasks: () => [
      "Work tasks done",
      list(
        tasksDone
          .slice()
          .sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""))
          .map(
            (t) =>
              `<li data-task="${esc(t.id)}" role="button" tabindex="0">${day(isoDay(t.doneAt))}<span class="od-b"><b>${esc(t.title)}</b>${t.impact ? `<span class="od-s">${esc(t.impact)}</span>` : ""}</span>${catTag(t.category)}</li>`,
          ),
        "No work tasks finished in this period.",
      ),
    ],
    updates: () => {
      const L = [];
      S.tasks.forEach((t) =>
        (t.log || []).forEach((l) => {
          if (inR(isoDay(l.at)) && isUpd(l)) L.push({ t, l });
        }),
      );
      L.sort((a, b) => (b.l.at || "").localeCompare(a.l.at || ""));
      const G = new Map();
      L.forEach((x) => {
        if (!G.has(x.t.id)) G.set(x.t.id, { t: x.t, last: x.l.at, notes: [] });
        G.get(x.t.id).notes.push(x.l.note || "");
      });
      return [
        "Task updates logged",
        list(
          [...G.values()].map(
            (g) =>
              `<li data-task="${esc(g.t.id)}" role="button" tabindex="0">${day(isoDay(g.last))}<span class="od-b"><b>${esc(g.t.title)}</b><span class="od-s">${g.notes.slice(0, 3).map(esc).join(" · ")}${g.notes.length > 3 ? ` · +${g.notes.length - 3} more` : ""}</span></span><span class="od-n">${g.notes.length} update${g.notes.length === 1 ? "" : "s"}</span></li>`,
          ),
          "No updates logged in this period.",
        ),
      ];
    },
    todos: () => [
      "To-dos done",
      list(
        S.todos
          .filter((t) => t.done && inR(isoDay(t.doneAt)))
          .sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""))
          .map((t) => `<li>${day(isoDay(t.doneAt))}<span class="od-b">${esc(t.title)}</span></li>`),
        "No to-dos ticked off in this period.",
      ),
    ],
    routine: () => [
      "Routine kept, day by day",
      list(
        keys
          .map((k, i) => [k, rPct[i]])
          .filter(([, p]) => p !== null)
          .reverse()
          .map(([k, p]) => {
            const dd = dayDoc(k),
              its = routineFor(k).filter((r) => !(dd.skip || {})[r.id]),
              miss = its.filter(
                (r) =>
                  !(dd.done || {})[r.id] &&
                  (k < tk || r.time <= pad(new Date().getHours()) + ":" + pad(new Date().getMinutes())),
              );
            return `<li data-ovday="${k}" role="button" tabindex="0">${day(k)}<span class="od-b"><span class="bar od-bar"><i style="width:${p}%;background:${p >= 80 ? "var(--ok)" : p >= 50 ? "var(--med)" : "var(--crit)"}"></i></span>${
              miss.length
                ? `<span class="od-s">Missed: ${miss
                    .slice(0, 4)
                    .map((r) => esc(r.label))
                    .join(", ")}${miss.length > 4 ? ` +${miss.length - 4}` : ""}</span>`
                : `<span class="od-s">All done</span>`
            }</span><span class="od-n">${p}%</span></li>`;
          }),
        "No routine data yet.",
      ),
    ],
    refl: () => [
      "Reflections",
      list(
        refls
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .map(
            (r) =>
              `<li data-calrefl="${esc(r.date)}" role="button" tabindex="0">${day(r.date)}<span class="od-b">${esc((r.did || r.learned || r.improve || "").trim().split("\n")[0].slice(0, 140)) || '<span class="muted">(empty)</span>'}</span>${r.mood ? `<span class="od-n">${r.mood}/5</span>` : ""}</li>`,
          ),
        "No reflections written in this period.",
      ),
    ],
    mood: () => [
      "Energy by day",
      list(
        refls
          .filter((r) => r.mood)
          .sort((a, b) => b.date.localeCompare(a.date))
          .map(
            (r) =>
              `<li data-calrefl="${esc(r.date)}" role="button" tabindex="0">${day(r.date)}<span class="od-b"><span class="od-dots">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= r.mood ? "on" : ""}"></i>`).join("")}</span></span><span class="od-n">${r.mood}/5</span></li>`,
          ),
        "Rate your energy in Reflection to see it here.",
      ),
    ],
  };
  const det = S.ovOpen && D[S.ovOpen] ? D[S.ovOpen]() : null;
  $("#ov-detail").hidden = !det;
  $("#ov-detail").innerHTML = det
    ? `<div class="sechead"><h2>${det[0]}</h2><span class="meta">${n === 7 ? "Last 7 days" : "Last 30 days"} · <button type="button" class="linkbtn" data-ovt="${S.ovOpen}">Close</button></span></div>${det[1]}`
    : "";
  const labels = keys.map((k, i) => ({
    full: fmtDate(k),
    short: n <= 7 ? DAYS[keyDow(k)].slice(0, 2) : k.slice(8),
    show: n <= 7 || i % 5 === 0 || i === n - 1,
  }));
  $("#ov-rchart").innerHTML = barChart(rPct, labels, 100, (v) => Math.round(v) + "%", "var(--accent)");
  const wmax = Math.max(4, ...wAct.map((v) => v || 0));
  const wm = Math.ceil(wmax / 2) * 2;
  $("#ov-wchart").innerHTML = barChart(wAct, labels, wm, (v) => Math.round(v), "var(--high)");
  // categories
  const cats = [...new Set([...S.cats.map((c) => c.tag), ...S.tasks.map((t) => t.category || "")])].filter((c) =>
    S.tasks.some((t) => (t.category || "") === c),
  );
  $("#ov-cats").innerHTML = cats.length
    ? `<tr><th>Category</th><th>Open</th><th>Blocked</th><th>Done</th><th>Avg progress</th></tr>` +
      cats
        .map((c) => {
          const ts = S.tasks.filter((t) => (t.category || "") === c),
            op = ts.filter((t) => t.status !== "done");
          const avg = op.length ? Math.round(op.reduce((a, t) => a + (+t.progress || 0), 0) / op.length) : null;
          return `<tr><td>${catTag(c)}</td><td>${op.length}</td><td>${ts.filter((t) => t.status === "blocked").length || "–"}</td><td>${ts.filter((t) => t.status === "done" && inR(isoDay(t.doneAt))).length}</td><td>${avg === null ? "–" : `<span style="display:inline-flex;gap:6px;align-items:center"><span class="bar" style="width:60px"><i style="width:${avg}%"></i></span>${avg}%</span>`}</td></tr>`;
        })
        .join("")
    : `<tr><td class="empty">No work tasks yet.</td></tr>`;
  // habits
  const order = ["meal", "supplement", "break", "study", "class", "work", "health", "other"];
  const ks = order.filter((k) => perKind[k]);
  $("#ov-habits").innerHTML = ks.length
    ? ks
        .map((k) => {
          const p = perKind[k],
            pc = Math.round((p.d / p.s) * 100);
          return `<div class="hab"><span>${esc((KINDS.find((x) => x[0] === k) || ["", "Other"])[1])}</span><span class="bar"><i style="width:${pc}%;background:${pc >= 80 ? "var(--ok)" : pc >= 50 ? "var(--med)" : "var(--crit)"}"></i></span><span class="n">${p.d}/${p.s}</span></div>`;
        })
        .join("")
    : `<div class="empty">Tick items in Today's routine and your habits show up here.</div>`;
  // attention
  const att = sortTasks(
    open.filter((t) => t.status === "blocked" || (t.due && t.due < tk) || t.urgency === "critical"),
  );
  $("#ov-attn").innerHTML = att.length
    ? att
        .map(
          (t) =>
            `<li data-task="${esc(t.id)}" style="cursor:pointer"><span class="urg ${esc(t.urgency)}">${esc(t.urgency)}</span><span class="grow"><span>${esc(t.title)}</span><div class="sub">${t.status === "blocked" ? `<b style="color:var(--crit)">Blocked</b>${t.bottleneck ? ": " + esc(t.bottleneck) : ""}` : t.due && t.due < tk ? `<span class="overdue">Overdue since ${esc(fmtDate(t.due))}</span>` : "Critical"}</div></span></li>`,
        )
        .join("")
    : `<li class="empty">Nothing blocked, overdue or critical.</li>`;
  const ln = Object.values(S.refl)
    .filter((r) => (r.learned || "").trim())
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);
  // wellbeing
  const inR2 = (k) => k >= keys[0] && k <= tk;
  const moodVals = keys.map((k) => (k < st ? null : hub.dayMood(k))),
    mv = moodVals.filter((v) => v !== null);
  const waterVals = keys.map((k) => (k < st || k > tk ? null : hub.hDoc(k).water || 0)),
    wv = waterVals.filter((v) => v !== null);
  const goalDays = wv.filter((v) => v >= (S.waterGoal || 8)).length;
  const bowelN = keys.reduce((a, k) => a + hub.bowelReal(k).length, 0);
  const wrec = S.body.filter((r) => r.weight).sort((a, b) => a.date.localeCompare(b.date)),
    wIn = wrec.filter((r) => inR2(r.date)),
    wBefore = wrec.filter((r) => r.date < keys[0]).pop();
  const wNow = wrec[wrec.length - 1],
    wStart = wBefore || wIn[0];
  const ongoing = S.conds.filter((c) => c.status !== "resolved").length;
  const stressV = keys.flatMap((k) => (hub.hDoc(k).moods || []).map((m) => m.stress).filter(Boolean));
  const mini = (v, l, s) => `<div class="mini"><span>${l}</span><b>${v}</b>${s ? `<small>${s}</small>` : ""}</div>`;
  $("#ov-well").innerHTML = `<div class="minis">
      ${mini(mv.length ? hub.MOODS[Math.round(mv.reduce((a, b) => a + b, 0) / mv.length) - 1][1] : "–", "Average mood", mv.length ? `${mv.length} day${mv.length > 1 ? "s" : ""} checked in` : "check in on the Health tab")}
      ${mini(stressV.length ? (stressV.reduce((a, b) => a + b, 0) / stressV.length).toFixed(1) + "/5" : "–", "Average stress", "")}
      ${mini(wv.length ? (wv.reduce((a, b) => a + b, 0) / wv.length).toFixed(1) : "–", "Cups of water/day", wv.length ? `goal met ${goalDays}/${wv.length} days` : "")}
      ${mini(bowelN, "Bowel movements", `${(bowelN / Math.max(1, keys.filter((k) => k >= st && k <= tk).length)).toFixed(1)}/day`)}
      ${mini(wNow ? wNow.weight + " kg" : "–", "Weight", wNow && wStart && wStart !== wNow ? `${+wNow.weight >= +wStart.weight ? "+" : ""}${(wNow.weight - wStart.weight).toFixed(1)} kg in this period` : "")}
      ${mini(ongoing, "Ongoing health issues", ongoing ? "see Health log" : "none")}</div>
    ${(() => {
      const c = hub.mealSrcCounts(keys.filter((k) => k <= tk)),
        n = c.home + c.out + c.delivery;
      return n
        ? `<div class="m-src-bar" title="Where your meals came from"><span class="small muted">Meals (${n})</span><span class="bar msb">${hub.MEAL_SRC.map(([v], i) => `<i style="width:${(c[v] / n) * 100}%;background:${["var(--c1)", "var(--c3)", "var(--c4)"][i]}"></i>`).join("")}</span><span class="small">${hub.MEAL_SRC.map(([v, l, ic]) => `${ic} ${Math.round((c[v] / n) * 100)}%`).join(" · ")}</span></div>`
        : "";
    })()}
    ${mv.length ? `<div class="sechead" style="margin:6px 0 0"><h3 class="small">Mood by day</h3><span class="meta">1 awful · 5 great</span></div>${barChart(moodVals, labels, 5, (v) => Math.round(v), "var(--c1)")}` : ""}`;
  $("#ov-sleep").innerHTML = hub.sleepInsights(keys, labels, mini);
  $("#ov-time").innerHTML = hub.timeInsights();
  // spending
  const exR = S.exp.filter((e) => inR2(e.date)),
    exTot = exR.reduce((a, e) => a + (+e.amount || 0), 0);
  const exDaily = keys.map((k) =>
    k < st || k > tk ? null : S.exp.filter((e) => e.date === k).reduce((a, e) => a + (+e.amount || 0), 0),
  );
  const exCat = {};
  exR.forEach((e) => (exCat[e.cat] = (exCat[e.cat] || 0) + (+e.amount || 0)));
  const topC = Object.entries(exCat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const exMax = Math.max(10, ...exDaily.map((v) => v || 0));
  $("#ov-spend").innerHTML = `<div class="minis">
      ${mini(hub.money(exTot), "Spent", `${exR.length} entr${exR.length === 1 ? "y" : "ies"}`)}
      ${mini(hub.money(exTot / Math.max(1, keys.filter((k) => k >= st && k <= tk).length)), "Average per day", "")}
      ${mini(S.shop.filter((i) => !i.done).length, "On shopping list", "items to buy")}</div>
    ${
      exTot
        ? `${barChart(exDaily, labels, Math.ceil(exMax / 10) * 10, (v) => (v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v)), "var(--accent)")}
      <div class="m-cats">${topC
        .map(([c, v]) => {
          const C = hub.expCat(c);
          return `<div class="m-cat"><span class="hl-tag cat-${C[2]}">${esc(C[1])}</span><span class="bar"><i style="width:${((v / topC[0][1]) * 100).toFixed(1)}%;background:var(--c${C[2]})"></i></span><b>${hub.money(v)}</b><span class="small muted">${Math.round((v / exTot) * 100)}%</span></div>`;
        })
        .join("")}</div>`
        : `<p class="small muted" style="margin:0">No spending logged in this period. Add expenses on the Money tab.</p>`
    }`;
  $("#ov-learn").innerHTML = ln.length
    ? ln
        .map(
          (r) =>
            `<li><span class="grow"><span>${esc(r.learned.slice(0, 160))}</span><div class="sub">${esc(fmtDate(r.date))}</div></span></li>`,
        )
        .join("")
    : `<li class="empty">What you write under "What I learned" collects here.</li>`;
}

export { barChart, rangeKeys };
