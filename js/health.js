// Health: water, meals, bowel, body, health log, cycle, mood
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
  keyDow,
  newId,
  nowISO,
  pad,
  put,
  saveCats,
  strip,
  toast,
  todayKey,
  write,
} from "./core.js";
import { rangeKeys } from "./overview.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  MEAL_SRC: { get: () => MEAL_SRC, enumerable: true },
  MOODS: { get: () => MOODS, enumerable: true },
  bowelReal: { get: () => bowelReal, enumerable: true },
  dayMood: { get: () => dayMood, enumerable: true },
  hDoc: { get: () => hDoc, enumerable: true },
  mealSrcCounts: { get: () => mealSrcCounts, enumerable: true },
  renderHealth: { get: () => renderHealth, enumerable: true },
});

// ---------- Health: water, meals, bowel, body, conditions, cycle
S.health = {};
S.body = [];
S.conds = [];
S.hDay = null;
S.waterGoal = 8;
S.showCycle = true;
S.condForm = false;
S.condDel = null;
const hk = () => S.hDay || todayKey();
const hDoc = (k) => ({ date: k, water: 0, meals: [], bowel: [], flow: "", sym: [], moods: [], ...(S.health[k] || {}) });
function saveHealth(k, d) {
  S.health[k] = d;
  if (hub.db) write("health/" + k, () => hub.db.doc("health/" + k).set(d));
  renderHealth();
}
const hid = () => "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const nowHMs = () => pad(new Date().getHours()) + ":" + pad(new Date().getMinutes());
const MEAL_SRC = [
  ["home", "Cooked myself", "🍳"],
  ["out", "Restaurant", "🍽️"],
  ["delivery", "Food delivery", "🛵"],
];
const mealSrcCounts = (keys) => {
  const c = { home: 0, out: 0, delivery: 0 };
  keys.forEach((k) =>
    (hDoc(k).meals || []).forEach((m) => {
      if (c[m.src] != null) c[m.src]++;
    }),
  );
  return c;
};
const mealSrcLine = (c) => MEAL_SRC.map(([v, l, i]) => `${i} ${c[v]} ${l.toLowerCase()}`).join(" · ");
const MEALS = [
  ["breakfast", "Breakfast"],
  ["lunch", "Lunch"],
  ["dinner", "Dinner"],
  ["snack", "Snack"],
  ["drink", "Drink"],
];
const BOWEL = [
  ["hard", "Hard / constipated"],
  ["normal", "Normal"],
  ["soft", "Soft"],
  ["watery", "Watery / diarrhoea"],
  ["none", "None today"],
];
const bowelReal = (k) => (hDoc(k).bowel || []).filter((b) => b.type !== "none");
const FLOW = [
  ["", "None"],
  ["spotting", "Spotting"],
  ["light", "Light"],
  ["medium", "Medium"],
  ["heavy", "Heavy"],
];
const SYMS = [
  "Cramps",
  "Headache",
  "Bloating",
  "Back pain",
  "Tender breasts",
  "Acne",
  "Fatigue",
  "Mood swings",
  "Cravings",
  "Nausea",
];
const COND_KIND = [
  ["symptom", "Symptom"],
  ["illness", "Illness"],
  ["injury", "Injury"],
  ["medication", "Medication"],
  ["doctor", "Doctor visit"],
];
const SEV = [
  ["mild", "Mild"],
  ["moderate", "Moderate"],
  ["severe", "Severe"],
];
S.mealType = "breakfast";
S.mealSrc = "home";
S.bowelType = "normal";
S.condKind = "symptom";
S.condSev = "mild";
function guessMeal() {
  const h = new Date().getHours();
  return h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 17 ? "snack" : h < 22 ? "dinner" : "snack";
}
// --- cycle maths (from days marked with flow)
function cycleInfo() {
  const days = Object.values(S.health)
    .filter((d) => d.flow && d.flow !== "spotting")
    .map((d) => d.date)
    .sort();
  const set = new Set(days),
    starts = days.filter((k) => !set.has(hub.addDays(k, -1)));
  const runs = starts.map((s) => {
    let n = 0,
      k = s;
    while (set.has(k)) {
      n++;
      k = hub.addDays(k, 1);
    }
    return n;
  });
  const diff = (a, b) => Math.round((new Date(b + "T00:00") - new Date(a + "T00:00")) / 864e5);
  const lens = starts
    .slice(1)
    .map((s, i) => diff(starts[i], s))
    .filter((n) => n >= 15 && n <= 60)
    .slice(-6);
  const avg = lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : 28;
  const pavg = runs.length ? Math.round(runs.slice(-6).reduce((a, b) => a + b, 0) / Math.min(6, runs.length)) : 5;
  const tk = todayKey(),
    last = starts[starts.length - 1];
  if (!last) return { starts, avg, pavg, lens, none: true };
  let next = hub.addDays(last, avg);
  while (next < tk && diff(next, tk) > 7) next = hub.addDays(next, avg);
  const day = diff(last, tk) + 1,
    ov = hub.addDays(next, -14);
  return {
    starts,
    runs,
    avg,
    pavg,
    lens,
    last,
    next,
    day,
    until: diff(tk, next),
    fertA: hub.addDays(ov, -5),
    fertB: hub.addDays(ov, 1),
    ov,
    set,
  };
}
function sparkline(vals) {
  if (vals.length < 2) return "";
  const W = 260,
    H = 54,
    lo = Math.min(...vals),
    hi = Math.max(...vals),
    r = hi - lo || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * (W - 8) + 4, H - 6 - ((v - lo) / r) * (H - 14)]);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="M${pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join("L")}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><path d="M${pts[0][0]},${H}L${pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join("L")}L${pts[pts.length - 1][0]},${H}Z" fill="color-mix(in srgb,var(--accent) 12%,transparent)"/><circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="3.5" fill="var(--accent)"/></svg>`;
}
function bmiInfo(h, w) {
  if (!h || !w) return null;
  const b = w / Math.pow(h / 100, 2);
  return {
    b: b.toFixed(1),
    cat: b < 18.5 ? "Underweight" : b < 25 ? "Healthy range" : b < 30 ? "Overweight" : "Obese",
  };
}
function renderHealth() {
  if (!$("#v-health") || S.view !== "health") return;
  const k = hk(),
    tk = todayKey(),
    d = hDoc(k),
    isT = k === tk;
  // day pager
  $("#h-day").innerHTML =
    `<button class="btn sm" type="button" data-hday="-1" aria-label="Previous day">‹</button><span class="mid">${isT ? "Today" : esc(DAYS[keyDow(k)])}<small>${esc(fmtDate(k))}</small></span><button class="btn sm" type="button" data-hday="1" ${isT ? "disabled" : ""} aria-label="Next day">›</button>`;
  renderMood();
  hub.renderSleepCard();
  // water
  const goal = S.waterGoal || 8,
    cups = d.water || 0;
  const wk = rangeKeys(7).map((x) => hDoc(x).water || 0),
    avgW = (wk.reduce((a, b) => a + b, 0) / 7).toFixed(1);
  $("#h-water").innerHTML =
    `<div class="hw-top"><div><b class="hw-n">${cups}</b><span class="muted"> / ${goal} cups</span><div class="small muted">${Math.round(cups * 250)} ml · 7-day average ${avgW} cups</div></div>
      <div class="hw-btns"><button class="btn sm" type="button" data-water="-1" aria-label="Remove a cup" ${cups ? "" : "disabled"}>−</button><button class="btn sm primary" type="button" data-water="1">+ 1 cup</button></div></div>
    <div class="cups">${Array.from({ length: Math.max(goal, cups) }, (_, i) => `<button type="button" class="cup ${i < cups ? "on" : ""}" data-cup="${i + 1}" aria-label="${i + 1} cups">${SVG(ICON.water)}</button>`).join("")}</div>
    <label class="small muted hw-goal">Daily goal <select id="h-goal">${[6, 7, 8, 9, 10, 12].map((n) => `<option value="${n}" ${n === goal ? "selected" : ""}>${n} cups</option>`).join("")}</select></label>`;
  // meals
  const meals = (d.meals || []).slice().sort((a, b) => a.time.localeCompare(b.time));
  $("#h-meals").innerHTML =
    `${meals.length ? `<ul class="hlist">${meals.map((m) => `<li><span class="hl-t">${esc(m.time)}</span><span class="hl-tag m-${esc(m.type)}">${esc((MEALS.find((x) => x[0] === m.type) || ["", m.type])[1])}</span><span class="hl-b">${esc(m.text)}</span><span class="hl-act"><button type="button" class="m-src" data-msrc="${esc(m.id)}" title="${esc((MEAL_SRC.find((x) => x[0] === m.src) || ["", "Where from? Tap to set"])[1])}: tap to change">${(MEAL_SRC.find((x) => x[0] === m.src) || ["", "", "＋"])[2]}</button><button type="button" class="x tl-ed" data-ge="meal:${esc(m.id)}" aria-label="Edit" title="Edit">${SVG(ICON.edit)}</button><button type="button" class="x" data-hdel="meals:${esc(m.id)}" aria-label="Remove">✕</button></span></li>`).join("")}</ul>` : `<p class="small muted" style="margin:0">Nothing logged${isT ? " yet today" : ""}.</p>`}
    <div class="qa-chips cwrap">${MEALS.map(([v, l]) => `<button type="button" class="qc" data-meal="${v}" aria-pressed="${S.mealType === v}">${l}</button>`).join("")}</div>
    <div class="qa-chips cwrap m-srcs">${MEAL_SRC.map(([v, l, i]) => `<button type="button" class="qc" data-mealsrc="${v}" aria-pressed="${S.mealSrc === v}">${i} ${l}</button>`).join("")}</div>
    <form class="qrow" id="h-meal-form" autocomplete="off"><input id="h-meal" class="inp" placeholder="What did you eat? e.g. Nasi lemak, teh o"><input type="time" id="h-meal-t" class="inp" value="${isT ? nowHMs() : "12:00"}" style="max-width:110px"><button class="btn sm" type="submit">Add</button></form>
    <p class="small muted" style="margin:0">Last 7 days: ${mealSrcLine(mealSrcCounts(rangeKeys(7)))}</p>`;
  // bowel
  const bw = (d.bowel || []).slice().sort((a, b) => a.time.localeCompare(b.time));
  const wkB = rangeKeys(7).reduce((a, x) => a + bowelReal(x).length, 0),
    wkNone = rangeKeys(7).filter((x) => (hDoc(x).bowel || []).length && !bowelReal(x).length).length;
  $("#h-bowel").innerHTML =
    `${bw.length ? `<ul class="hlist">${bw.map((b) => `<li><span class="hl-t">${esc(b.time)}</span><span class="hl-tag b-${esc(b.type)}">${esc((BOWEL.find((x) => x[0] === b.type) || ["", b.type])[1])}</span><span class="hl-b">${esc(b.note || "")}</span><button type="button" class="x tl-ed" data-ge="bowel:${esc(b.id)}" aria-label="Edit" title="Edit">${SVG(ICON.edit)}</button><button type="button" class="x" data-hdel="bowel:${esc(b.id)}" aria-label="Remove">✕</button></li>`).join("")}</ul>` : `<p class="small muted" style="margin:0">No entries${isT ? " today" : ""}.</p>`}
    <div class="qa-chips cwrap">${BOWEL.map(([v, l]) => `<button type="button" class="qc" data-bowel="${v}" aria-pressed="${S.bowelType === v}">${l}</button>`).join("")}</div>
    <form class="qrow" id="h-bowel-form" autocomplete="off"><input id="h-bowel-note" class="inp" placeholder="Note (optional), e.g. stomach ache, after spicy food"><button class="btn sm primary" type="submit">Log</button></form>
    <p class="small muted" style="margin:0">Last 7 days: <b>${wkB}</b> time${wkB === 1 ? "" : "s"}${wkNone ? ` · <b>${wkNone}</b> day${wkNone === 1 ? "" : "s"} with none` : ""}</p>`;
  // body
  const recs = S.body.slice().sort((a, b) => a.date.localeCompare(b.date)),
    lastH = [...recs].reverse().find((r) => r.height),
    lastW = [...recs].reverse().find((r) => r.weight);
  const bi = bmiInfo(lastH && +lastH.height, lastW && +lastW.weight),
    ws = recs
      .filter((r) => r.weight)
      .slice(-20)
      .map((r) => +r.weight);
  const prevW = recs.filter((r) => r.weight).slice(-2)[0];
  $("#h-body").innerHTML = `<div class="hb-stats">
      <div><span class="small muted">Height</span><b>${lastH ? esc(lastH.height) + " cm" : "–"}</b></div>
      <div><span class="small muted">Weight</span><b>${lastW ? esc(lastW.weight) + " kg" : "–"}</b>${lastW && prevW && prevW !== lastW ? `<span class="small ${+lastW.weight > +prevW.weight ? "up" : "down"}">${+lastW.weight > +prevW.weight ? "▲" : "▼"} ${Math.abs(lastW.weight - prevW.weight).toFixed(1)}</span>` : ""}</div>
      <div><span class="small muted">BMI</span><b>${bi ? bi.b : "–"}</b>${bi ? `<span class="small muted">${bi.cat}</span>` : ""}</div></div>
    ${sparkline(ws)}
    <form class="hb-form" id="h-body-form" autocomplete="off"><label class="f">Date<input type="date" id="hb-date" value="${tk}"></label><label class="f">Height (cm)<input type="number" step="0.1" min="50" max="250" id="hb-h" placeholder="${lastH ? esc(lastH.height) : "160"}" inputmode="decimal"></label><label class="f">Weight (kg)<input type="number" step="0.1" min="20" max="300" id="hb-w" placeholder="${lastW ? esc(lastW.weight) : "55"}" inputmode="decimal"></label><button class="btn sm primary" type="submit">Save</button></form>
    ${
      recs.length
        ? `<details class="hb-hist"><summary class="small">All records (${recs.length})</summary><ul class="hlist">${recs
            .slice()
            .reverse()
            .map(
              (r) =>
                `<li><span class="hl-t">${esc(fmtDate(r.date))}</span><span class="hl-b">${r.height ? esc(r.height) + " cm" : ""}${r.height && r.weight ? " · " : ""}${r.weight ? esc(r.weight) + " kg" : ""}</span><button type="button" class="x tl-ed" data-ge="body:${esc(r.id)}" aria-label="Edit" title="Edit">${SVG(ICON.edit)}</button><button type="button" class="x" data-bdel="${esc(r.id)}" aria-label="Remove">✕</button></li>`,
            )
            .join("")}</ul></details>`
        : ""
    }
    <p class="small muted" style="margin:0">BMI is a rough guide only, not a diagnosis.</p>`;
  // conditions
  const ongoing = S.conds.filter((c) => c.status !== "resolved").sort((a, b) => b.start.localeCompare(a.start)),
    past = S.conds.filter((c) => c.status === "resolved").sort((a, b) => b.start.localeCompare(a.start));
  const condRow = (
    c,
  ) => `<li class="cond sev-${esc(c.severity)}"><div class="cd-top"><b>${esc(c.title)}</b><span class="hl-tag">${esc((COND_KIND.find((x) => x[0] === c.kind) || ["", c.kind])[1])}</span><span class="sev">${esc((SEV.find((x) => x[0] === c.severity) || ["", ""])[1])}</span></div>
      <div class="small muted">${esc(fmtDate(c.start))}${c.status === "resolved" && c.end ? ` → ${esc(fmtDate(c.end))}` : " · ongoing"}</div>${c.notes ? `<div class="small">${esc(c.notes)}</div>` : ""}
      <div class="cd-act">${c.status !== "resolved" ? `<button type="button" class="btn sm" data-cres="${esc(c.id)}">Mark recovered</button>` : ""}<button type="button" class="btn sm" data-ge="cond:${esc(c.id)}">${SVG(ICON.edit)}Edit</button><button type="button" class="btn sm ghost danger" data-cdelx="${esc(c.id)}">${S.condDel === c.id ? "Tap again to delete" : "Delete"}</button></div></li>`;
  $("#h-cond").innerHTML = `${
    S.condForm
      ? `<form class="cond-form" id="h-cond-form" autocomplete="off">
      <label class="f">What's wrong?<input id="hc-title" class="inp" placeholder="e.g. Sore throat, fever, gastric, took panadol" required></label>
      <div class="qa-chips cwrap">${COND_KIND.map(([v, l]) => `<button type="button" class="qc" data-ckind="${v}" aria-pressed="${S.condKind === v}">${l}</button>`).join("")}</div>
      <div class="qa-chips cwrap">${SEV.map(([v, l]) => `<button type="button" class="qc sv-${v}" data-csev="${v}" aria-pressed="${S.condSev === v}">${l}</button>`).join("")}</div>
      <div class="grid2"><label class="f">Started<input type="date" id="hc-start" value="${tk}"></label><label class="f">Notes<input id="hc-notes" class="inp" placeholder="Symptoms, medicine, clinic…"></label></div>
      <div class="row"><button class="btn sm primary" type="submit">Save</button><button class="btn sm" type="button" data-cform="0">Cancel</button></div></form>`
      : `<button class="btn sm primary" type="button" data-cform="1">+ Log how you're feeling</button>`
  }
    ${ongoing.length ? `<ul class="conds">${ongoing.map(condRow).join("")}</ul>` : `<p class="small muted" style="margin:0">Nothing ongoing. Hope you're feeling well.</p>`}
    ${past.length ? `<details><summary class="small">History (${past.length})</summary><ul class="conds">${past.map(condRow).join("")}</ul></details>` : ""}`;
  // cycle
  if (!S.showCycle)
    $("#h-cycle").innerHTML =
      `<p class="small muted" style="margin:0">Cycle tracking is turned off. Switch it on below to log periods and see predictions.</p>`;
  if (S.showCycle) {
    const C = cycleInfo(),
      strip = [];
    for (let i = -20; i <= 20; i++) {
      const x = hub.addDays(tk, i),
        dd = hDoc(x),
        per = dd.flow && dd.flow !== "spotting";
      const pred = !C.none && !per && x > tk && x >= C.next && x < hub.addDays(C.next, C.pavg),
        fert = !C.none && x > tk && x >= C.fertA && x <= C.fertB;
      strip.push(
        `<button type="button" class="cy-d ${per ? "per f-" + dd.flow : ""} ${dd.flow === "spotting" ? "spot" : ""} ${pred ? "pred" : ""} ${fert ? "fert" : ""} ${x === tk ? "today" : ""} ${x === k ? "sel" : ""}" data-hset="${x}" title="${esc(fmtDate(x))}${per ? " · period (" + dd.flow + ")" : pred ? " · predicted period" : fert ? " · fertile window (estimate)" : ""}"><span>${esc(DAYS[keyDow(x)].slice(0, 1))}</span><b>${+x.slice(8)}</b></button>`,
      );
    }
    const prevScroll = $("#cy-strip") ? $("#cy-strip").scrollLeft : null;
    $("#h-cycle").innerHTML = `<div class="cy-status">${
      C.none
        ? `<b>No period logged yet.</b><span class="small muted">Tap the day your last period started below, then choose the flow.</span>`
        : `<div class="cy-ring"><b>${C.day > 0 && C.day <= 60 ? C.day : "–"}</b><span>day</span></div><div><b>${C.until > 0 ? `Next period in about ${C.until} day${C.until === 1 ? "" : "s"}` : C.until === 0 ? "Period expected today" : `Period about ${-C.until} day${C.until === -1 ? "" : "s"} late`}</b><div class="small muted">Expected around ${esc(fmtDate(C.next))} · average cycle ${C.avg} days · period ${C.pavg} days${C.lens.length < 2 ? " (estimate improves as you log more)" : ""}</div></div>`
    }</div>
      <div class="cy-strip" id="cy-strip">${strip.join("")}</div>
      <div class="tl-legend"><span><i class="lgc per"></i>Period</span><span><i class="lgc pred"></i>Predicted</span><span><i class="lgc fert"></i>Fertile window (estimate)</span><span><i class="lgc spot"></i>Spotting</span></div>
      <div class="cy-log"><div class="small"><b>${isT ? "Today" : esc(fmtDate(k))}</b> · flow</div>
        <div class="qa-chips cwrap">${FLOW.map(([v, l]) => `<button type="button" class="qc fl-${v || "none"}" data-flow="${v}" aria-pressed="${(d.flow || "") === v}">${l}</button>`).join("")}</div>
        <div class="small" style="margin-top:4px"><b>Symptoms</b></div>
        <div class="qa-chips cwrap">${SYMS.map((s) => `<button type="button" class="qc" data-sym="${esc(s)}" aria-pressed="${(d.sym || []).includes(s)}">${esc(s)}</button>`).join("")}</div></div>
      <p class="small muted" style="margin:0">Predictions are estimates from your own history. Don't rely on them for contraception.</p>`;
    const st = $("#cy-strip");
    if (st && renderHealth._scrolled && prevScroll !== null) st.scrollLeft = prevScroll;
    else if (st)
      requestAnimationFrame(() => {
        const t = st.querySelector(".today");
        if (t && st.clientWidth) {
          st.scrollLeft = t.offsetLeft - st.offsetLeft - st.clientWidth / 2 + t.offsetWidth / 2;
          renderHealth._scrolled = true;
        }
      });
  }
  $("#h-cyc-toggle").checked = !!S.showCycle;
}
function addHealthItem(field, item) {
  const k = hk(),
    d = hDoc(k);
  d[field] = [...(d[field] || []), item];
  saveHealth(k, d);
}
document.addEventListener("click", (e) => {
  if (S.view !== "health") return;
  const t = e.target.closest("button,[data-hset]");
  if (!t || !t.closest("#v-health")) return;
  const k = hk(),
    d = hDoc(k);
  if (t.dataset.hday) {
    const n = hub.addDays(k, +t.dataset.hday);
    S.hDay = n > todayKey() ? todayKey() : n;
    renderHealth();
  } else if (t.dataset.water) {
    d.water = Math.max(0, (d.water || 0) + +t.dataset.water);
    saveHealth(k, d);
    if (+t.dataset.water > 0 && d.water === (S.waterGoal || 8)) toast("Water goal reached! 💧");
  } else if (t.dataset.cup) {
    const n = +t.dataset.cup;
    d.water = d.water === n ? n - 1 : n;
    saveHealth(k, d);
  } else if (t.dataset.meal) {
    S.mealType = t.dataset.meal;
    renderHealth();
    $("#h-meal").focus();
  } else if (t.dataset.mealsrc) {
    S.mealSrc = t.dataset.mealsrc;
    t.parentElement.querySelectorAll("[data-mealsrc]").forEach((b) => b.setAttribute("aria-pressed", b === t));
    $("#h-meal").focus();
  } else if (t.dataset.msrc) {
    const order = MEAL_SRC.map((x) => x[0]);
    d.meals = (d.meals || []).map((m) =>
      m.id === t.dataset.msrc ? { ...m, src: order[(order.indexOf(m.src) + 1) % order.length] } : m,
    );
    saveHealth(k, d);
    const m = d.meals.find((x) => x.id === t.dataset.msrc);
    toast((MEAL_SRC.find((x) => x[0] === m.src) || ["", ""])[1]);
  } else if (t.dataset.bowel) {
    S.bowelType = t.dataset.bowel;
    renderHealth();
  } else if (t.dataset.hdel) {
    const [f, id] = t.dataset.hdel.split(":");
    d[f] = (d[f] || []).filter((x) => x.id !== id);
    saveHealth(k, d);
  } else if (t.dataset.bdel) {
    del("body", t.dataset.bdel);
  } else if (t.dataset.cform !== undefined) {
    S.condForm = t.dataset.cform === "1";
    renderHealth();
    if (S.condForm) $("#hc-title").focus();
  } else if (t.dataset.ckind) {
    S.condKind = t.dataset.ckind;
    t.parentElement.querySelectorAll("[data-ckind]").forEach((b) => b.setAttribute("aria-pressed", b === t));
  } else if (t.dataset.csev) {
    S.condSev = t.dataset.csev;
    t.parentElement.querySelectorAll("[data-csev]").forEach((b) => b.setAttribute("aria-pressed", b === t));
  } else if (t.dataset.cres) {
    const c = S.conds.find((x) => x.id === t.dataset.cres);
    if (c) {
      put("conditions", c.id, { ...strip(c), status: "resolved", end: todayKey() });
      toast("Glad you're feeling better");
    }
  } else if (t.dataset.cdelx) {
    if (S.condDel !== t.dataset.cdelx) {
      S.condDel = t.dataset.cdelx;
      renderHealth();
    } else {
      del("conditions", t.dataset.cdelx);
      S.condDel = null;
    }
  } else if (t.dataset.hset) {
    S.hDay = t.dataset.hset > todayKey() ? todayKey() : t.dataset.hset;
    if (t.dataset.hset > todayKey()) toast("You can log flow up to today");
    renderHealth();
  } else if (t.dataset.flow !== undefined) {
    d.flow = t.dataset.flow;
    saveHealth(k, d);
  } else if (t.dataset.sym) {
    const s = t.dataset.sym,
      cur = d.sym || [];
    d.sym = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    saveHealth(k, d);
  }
});
document.addEventListener("submit", (e) => {
  const f = e.target;
  if (!f.closest || !f.closest("#v-health")) return;
  e.preventDefault();
  if (f.id === "h-meal-form") {
    const txt = $("#h-meal").value.trim();
    if (!txt) {
      $("#h-meal").focus();
      return;
    }
    addHealthItem("meals", {
      id: hid(),
      type: S.mealType,
      src: S.mealSrc,
      text: txt,
      time: $("#h-meal-t").value || nowHMs(),
    });
    setTimeout(() => $("#h-meal") && $("#h-meal").focus(), 30);
  } else if (f.id === "h-bowel-form") {
    if (S.bowelType === "none" && (hDoc(hk()).bowel || []).some((b) => b.type === "none")) {
      toast("Already marked as none");
      return;
    }
    addHealthItem("bowel", {
      id: hid(),
      type: S.bowelType,
      note: $("#h-bowel-note").value.trim(),
      time: hk() === todayKey() ? nowHMs() : "12:00",
    });
    if (S.bowelType === "none") S.bowelType = "normal";
    toast("Logged");
  } else if (f.id === "h-body-form") {
    const hh = parseFloat($("#hb-h").value),
      ww = parseFloat($("#hb-w").value),
      dt = $("#hb-date").value || todayKey();
    if (!hh && !ww) {
      toast("Enter your height, weight or both");
      return;
    }
    const ex = S.body.find((r) => r.date === dt);
    const rec = {
      date: dt,
      height: hh ? +hh.toFixed(1) : (ex && ex.height) || "",
      weight: ww ? +ww.toFixed(1) : (ex && ex.weight) || "",
      createdAt: nowISO(),
    };
    put("body", ex ? ex.id : newId(), rec);
    toast("Saved");
  } else if (f.id === "h-cond-form") {
    const ti = $("#hc-title").value.trim();
    if (!ti) return;
    put("conditions", newId(), {
      title: ti,
      kind: S.condKind,
      severity: S.condSev,
      start: $("#hc-start").value || todayKey(),
      end: "",
      status: "ongoing",
      notes: $("#hc-notes").value.trim(),
      createdAt: nowISO(),
    });
    S.condForm = false;
    toast("Logged. Take care of yourself.");
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "h-goal") {
    S.waterGoal = +e.target.value;
    saveCats();
    renderHealth();
  }
  if (e.target.id === "h-cyc-toggle") {
    S.showCycle = e.target.checked;
    saveCats();
    renderHealth();
  }
});

// ---------- Mind & mood check-ins (stored in the day's health record)
const MOODS = [
  [1, "Awful"],
  [2, "Low"],
  [3, "Okay"],
  [4, "Good"],
  [5, "Great"],
];
const FEELS = [
  "Happy",
  "Calm",
  "Grateful",
  "Proud",
  "Motivated",
  "Excited",
  "Tired",
  "Stressed",
  "Anxious",
  "Overwhelmed",
  "Sad",
  "Lonely",
  "Frustrated",
  "Angry",
  "Bored",
  "Unmotivated",
];
const WHYS = [
  "Work",
  "Study",
  "Family",
  "Friends",
  "Relationship",
  "Health",
  "Sleep",
  "Money",
  "Food",
  "Exercise",
  "Weather",
  "Social media",
  "Me-time",
];
S.moodDraft = { m: 0, feel: [], why: [], stress: 0 };
const moodColor = (m) =>
  ["", "var(--crit)", "var(--warm)", "var(--med)", "var(--c1)", "var(--ok)"][Math.round(m)] || "var(--line)";
function moodFace(m) {
  // simple drawn faces, no emoji
  const mouth = {
    1: "M8 16.5c2.2-2.4 5.8-2.4 8 0",
    2: "M8.5 16c2-1.3 5-1.3 7 0",
    3: "M8.5 15.5h7",
    4: "M8.5 14.5c2 1.6 5 1.6 7 0",
    5: "M8 14c2.2 2.8 5.8 2.8 8 0",
  }[m];
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><circle cx="9" cy="10" r=".9" fill="currentColor"/><circle cx="15" cy="10" r=".9" fill="currentColor"/><path d="${mouth}"/></svg>`;
}
function dayMood(k) {
  const ms = hDoc(k).moods || [];
  return ms.length ? ms.reduce((a, x) => a + x.m, 0) / ms.length : null;
}
function needsSupport() {
  const tk = todayKey();
  let low = 0;
  for (let i = 0; i < 7; i++) {
    const v = dayMood(hub.addDays(tk, -i));
    if (v !== null && v <= 2) low++;
  }
  const today = hDoc(tk).moods || [],
    last = today[today.length - 1];
  let hidden = false;
  try {
    hidden = (localStorage.getItem("daybook-support-hide") || "") >= tk;
  } catch {}
  return !hidden && (low >= 3 || (last && last.m === 1));
}
function renderMood() {
  const box = $("#h-mood");
  if (!box) return;
  const k = hk(),
    d = hDoc(k),
    isT = k === todayKey(),
    D = S.moodDraft;
  const entries = (d.moods || []).slice().sort((a, b) => a.time.localeCompare(b.time));
  const days = rangeKeys(14),
    vals = days.map(dayMood);
  const feelCount = {};
  rangeKeys(30).forEach((x) =>
    (hDoc(x).moods || []).forEach((e) => (e.feel || []).forEach((f) => (feelCount[f] = (feelCount[f] || 0) + 1))),
  );
  const topFeel = Object.entries(feelCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const avg14 = vals.filter((v) => v !== null);
  const a14 = avg14.length ? avg14.reduce((a, b) => a + b, 0) / avg14.length : null;
  box.innerHTML = `
    ${
      needsSupport()
        ? `<div class="support"><b>Things seem heavy lately.</b> You don't have to carry it alone. Talking to someone you trust, or a trained listener, can really help.
      <div class="sup-lines"><span><b>Befrienders KL</b> 03-7627 2929 · 24 hours</span><span><b>Talian HEAL</b> 15555 · 8am to midnight</span><span>In an emergency, call <b>999</b></span></div>
      <button type="button" class="btn sm ghost" data-suphide>Hide for 3 days</button></div>`
        : ""
    }
    <div class="small"><b>How are you feeling${isT ? " right now" : ""}?</b></div>
    <div class="moods">${MOODS.map(([v, l]) => `<button type="button" class="mood-b ${D.m === v ? "on" : ""}" data-mood-m="${v}" style="--mc:${moodColor(v)}" aria-pressed="${D.m === v}">${moodFace(v)}<span>${l}</span></button>`).join("")}</div>
    ${
      D.m
        ? `<div class="small muted">Feelings <span>(pick any)</span></div>
      <div class="qa-chips cwrap">${FEELS.map((f) => `<button type="button" class="qc" data-mood-f="${esc(f)}" aria-pressed="${D.feel.includes(f)}">${esc(f)}</button>`).join("")}</div>
      <div class="small muted">What's affecting you?</div>
      <div class="qa-chips cwrap">${WHYS.map((f) => `<button type="button" class="qc ghost" data-mood-w="${esc(f)}" aria-pressed="${D.why.includes(f)}">${esc(f)}</button>`).join("")}</div>
      <div class="small muted">Stress level</div>
      <div class="seg stress">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-mood-s="${n}" aria-pressed="${D.stress === n}">${n}</button>`).join("")}<span class="small muted">1 relaxed · 5 very stressed</span></div>
      <textarea id="mood-note" class="inp" rows="2" placeholder="What's on your mind? (optional, only you can see this in the app)">${esc(D.note || "")}</textarea>
      <div class="row"><button class="btn sm primary" type="button" data-mood-save>${S.moodEdit ? "Save changes" : "Save check-in"}</button><button class="btn sm" type="button" data-mood-cancel>Cancel</button></div>`
        : ""
    }
    ${
      entries.length
        ? `<ul class="mood-list">${entries
            .map(
              (
                e,
              ) => `<li><span class="mood-dot" style="--mc:${moodColor(e.m)}">${moodFace(e.m)}</span><div><div><b>${esc(MOODS[e.m - 1][1])}</b> <span class="small muted">${esc(e.time)}${e.stress ? ` · stress ${e.stress}/5` : ""}</span></div>
        ${(e.feel || []).length ? `<div class="small">${e.feel.map(esc).join(", ")}</div>` : ""}${(e.why || []).length ? `<div class="small muted">Because of: ${e.why.map(esc).join(", ")}</div>` : ""}${e.note ? `<div class="small mood-note">${esc(e.note)}</div>` : ""}</div>
        <span class="mood-acts"><button type="button" class="x tl-ed" data-mood-edit="${esc(e.id)}" aria-label="Edit check-in" title="Edit">${SVG(ICON.edit)}</button><button type="button" class="x" data-mood-del="${esc(e.id)}" aria-label="Delete check-in">✕</button></span></li>`,
            )
            .join("")}</ul>`
        : ""
    }
    <div class="mood-trend"><div class="small muted">Last 14 days${a14 !== null ? ` · average <b style="color:${moodColor(a14)}">${MOODS[Math.round(a14) - 1][1].toLowerCase()}</b>` : ""}</div>
      <div class="mt-row">${days
        .map((x, i) => {
          const v = vals[i];
          return `<span class="mt-d ${x === k ? "sel" : ""}" title="${esc(fmtDate(x))}${v !== null ? " · " + MOODS[Math.round(v) - 1][1] : " · no check-in"}"><i style="height:${v === null ? 4 : 8 + v * 8}px;background:${v === null ? "var(--line)" : moodColor(v)}"></i><em>${esc(DAYS[keyDow(x)].slice(0, 1))}</em></span>`;
        })
        .join("")}</div></div>
    ${topFeel.length ? `<div class="small muted">Most felt this month: ${topFeel.map(([f, n]) => `<span class="feel-pill">${esc(f)} <b>${n}</b></span>`).join(" ")}</div>` : ""}`;
}
document.addEventListener("click", (e) => {
  if (S.view !== "health") return;
  const t = e.target.closest("button");
  if (!t || !t.closest("#h-mood")) return;
  const D = S.moodDraft;
  if ($("#mood-note")) D.note = $("#mood-note").value;
  if (t.dataset.moodM) {
    D.m = +t.dataset.moodM;
    renderMood();
  } else if (t.dataset.moodF) {
    const f = t.dataset.moodF;
    D.feel = D.feel.includes(f) ? D.feel.filter((x) => x !== f) : [...D.feel, f];
    renderMood();
  } else if (t.dataset.moodW) {
    const f = t.dataset.moodW;
    D.why = D.why.includes(f) ? D.why.filter((x) => x !== f) : [...D.why, f];
    renderMood();
  } else if (t.dataset.moodS) {
    D.stress = D.stress === +t.dataset.moodS ? 0 : +t.dataset.moodS;
    renderMood();
  } else if (t.dataset.moodCancel !== undefined) {
    S.moodDraft = { m: 0, feel: [], why: [], stress: 0 };
    S.moodEdit = null;
    renderMood();
  } else if (t.dataset.moodEdit) {
    const e0 = (hDoc(hk()).moods || []).find((x) => x.id === t.dataset.moodEdit);
    if (e0) {
      S.moodEdit = e0.id;
      S.moodDraft = {
        m: e0.m,
        feel: [...(e0.feel || [])],
        why: [...(e0.why || [])],
        stress: e0.stress || 0,
        note: e0.note || "",
      };
      renderMood();
      $("#h-mood").scrollIntoView({ block: "start", behavior: "smooth" });
    }
  } else if (t.dataset.moodSave !== undefined) {
    const k = hk(),
      d = hDoc(k);
    const ed = S.moodEdit && (d.moods || []).find((x) => x.id === S.moodEdit);
    if (ed)
      d.moods = d.moods.map((x) =>
        x.id === ed.id ? { ...x, m: D.m, feel: D.feel, why: D.why, stress: D.stress, note: (D.note || "").trim() } : x,
      );
    else
      d.moods = [
        ...(d.moods || []),
        {
          id: hid(),
          time: k === todayKey() ? nowHMs() : "20:00",
          m: D.m,
          feel: D.feel,
          why: D.why,
          stress: D.stress,
          note: (D.note || "").trim(),
        },
      ];
    S.moodEdit = null;
    S.moodDraft = { m: 0, feel: [], why: [], stress: 0 };
    saveHealth(k, d);
    toast(
      D.m >= 4
        ? "Check-in saved. Glad you're doing well."
        : D.m === 3
          ? "Check-in saved."
          : "Check-in saved. Be gentle with yourself today.",
    );
  } else if (t.dataset.moodDel) {
    const k = hk(),
      d = hDoc(k);
    d.moods = (d.moods || []).filter((x) => x.id !== t.dataset.moodDel);
    saveHealth(k, d);
  } else if (t.dataset.suphide !== undefined) {
    try {
      localStorage.setItem("daybook-support-hide", hub.addDays(todayKey(), 2));
    } catch {}
    renderMood();
  }
});

export { BOWEL, COND_KIND, MEALS, SEV, hk, nowHMs, saveHealth };
