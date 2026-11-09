// Sleep and where time went
import { hub } from "./registry.js";
import { $, DAYS, S, dayDoc, esc, fmtDate, isWeekend, keyDow, pad, toast, todayKey } from "./core.js";
import { routineFor, toMin } from "./today.js";
import { barChart, rangeKeys } from "./overview.js";
import { longRange, plural } from "./reports.js";
import { hm, minsOfISO } from "./schedule.js";
import { hk, saveHealth } from "./health.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  fmtHM: { get: () => fmtHM, enumerable: true },
  renderSleepCard: { get: () => renderSleepCard, enumerable: true },
  sleepInsights: { get: () => sleepInsights, enumerable: true },
  sleepMins: { get: () => sleepMins, enumerable: true },
  timeInsights: { get: () => timeInsights, enumerable: true },
});

// ---------- sleep (stored on the morning you woke up)
const SLEEP_Q = [
  [1, "Awful"],
  [2, "Poor"],
  [3, "OK"],
  [4, "Good"],
  [5, "Great"],
];
const sleepMins = (s) => (s && s.bed && s.wake ? (toMin(s.wake) - toMin(s.bed) + 1440) % 1440 || 1440 : null);
const fmtHM = (m) => {
  if (m == null) return "–";
  m = Math.round(m);
  const h = Math.floor(m / 60),
    r = m % 60;
  return h ? `${h}h${r ? " " + r + "m" : ""}` : `${r}m`;
};
const clockOf = (m) => {
  m = ((Math.round(m) % 1440) + 1440) % 1440;
  return hub.fmt12(pad(Math.floor(m / 60)) + ":" + pad(m % 60));
};
const nightMin = (t) => {
  const m = toMin(t);
  return m < 12 * 60 ? m + 1440 : m;
}; // bedtimes after midnight count as late, not early
function sleepGuess(k) {
  const tick = (day, re) => {
    const dd = dayDoc(day);
    const r = routineFor(day).find((x) => re.test(x.label) || (re.source.includes("sleep") && x.kind === "sleep"));
    const v = r && (dd.done || {})[r.id];
    return /^\d\d:\d\d$/.test(v || "") ? v : r ? r.time : null;
  };
  return { bed: tick(hub.addDays(k, -1), /sleep|bed/i) || "23:30", wake: tick(k, /wake/i) || "07:00" };
}
function renderSleepCard() {
  const box = $("#h-sleep");
  if (!box) return;
  const k = hk(),
    d = hub.hDoc(k),
    s = d.sleep,
    g = s || sleepGuess(k),
    isT = k === todayKey();
  const wk = rangeKeys(7)
      .map((x) => sleepMins(hub.hDoc(x).sleep))
      .filter((v) => v != null),
    avg = wk.length ? wk.reduce((a, b) => a + b, 0) / wk.length : null;
  box.innerHTML = `${s ? `<div class="sl-top"><b class="hw-n">${fmtHM(sleepMins(s))}</b><span class="muted small">${clockOf(toMin(s.bed))} → ${clockOf(toMin(s.wake))}${s.q ? " · " + SLEEP_Q[s.q - 1][1] : ""}</span></div>` : `<p class="small muted" style="margin:0">How did you sleep ${isT ? "last night" : "the night before " + esc(fmtDate(k))}?</p>`}
    <form id="h-sleep-form" class="sl-form" autocomplete="off">
      <label class="f">Went to sleep<input type="time" id="sl-bed" value="${esc(g.bed)}"></label>
      <label class="f">Woke up<input type="time" id="sl-wake" value="${esc(g.wake)}"></label>
      <div class="qa-chips cwrap sl-q">${SLEEP_Q.map(([v, l]) => `<button type="button" class="qc" data-slq="${v}" aria-pressed="${(s ? s.q : S.slQ) === v}">${l}</button>`).join("")}</div>
      <div class="row"><button class="btn sm primary" type="submit">${s ? "Update" : "Save sleep"}</button>${s ? `<button class="btn sm ghost danger" type="button" data-sldel>Remove</button>` : ""}</div>
    </form>
    <p class="small muted" style="margin:0">7-day average: <b>${fmtHM(avg && Math.round(avg))}</b>${wk.length ? ` over ${wk.length} night${wk.length === 1 ? "" : "s"}` : ""} · adults usually need 7–9 hours</p>`;
}
S.slQ = 0;
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("[data-slq],[data-sldel]");
  if (!t || !t.closest("#h-sleep")) return;
  const k = hk(),
    d = { ...hub.hDoc(k) };
  if (t.dataset.slq) {
    S.slQ = +t.dataset.slq;
    t.parentElement.querySelectorAll("[data-slq]").forEach((b) => b.setAttribute("aria-pressed", b === t));
    if (d.sleep) {
      d.sleep = { ...d.sleep, q: S.slQ };
      saveHealth(k, d);
    }
  } else {
    delete d.sleep;
    saveHealth(k, d);
    toast("Sleep entry removed");
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "h-sleep-form") return;
  e.preventDefault();
  const bed = $("#sl-bed").value,
    wake = $("#sl-wake").value;
  if (!bed || !wake) return;
  const k = hk(),
    d = { ...hub.hDoc(k) };
  d.sleep = { bed, wake, q: (d.sleep && d.sleep.q) || S.slQ || 0 };
  S.slQ = 0;
  saveHealth(k, d);
  toast(`Saved: ${fmtHM(sleepMins(d.sleep))} of sleep`);
});
// ---------- Insights: sleep analysis and where time went
function sleepInsights(keys, labels, mini) {
  const tk = todayKey();
  const vals = keys.map((k) => (k > tk ? null : sleepMins(hub.hDoc(k).sleep))),
    got = keys.map((k, i) => ({ k, m: vals[i], s: hub.hDoc(k).sleep })).filter((x) => x.m != null);
  if (!got.length)
    return `<p class="small muted" style="margin:0">No sleep logged in this period. Log it each morning on <a href="#health-body">Health → Body</a> and it's analysed here.</p>`;
  const avg = got.reduce((a, x) => a + x.m, 0) / got.length;
  const beds = got.map((x) => nightMin(x.s.bed)),
    wakes = got.map((x) => toMin(x.s.wake));
  const mean = (a) => a.reduce((p, q) => p + q, 0) / a.length,
    sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2)));
  const short = got.filter((x) => x.m < 7 * 60).length,
    qs = got.filter((x) => x.s.q).map((x) => x.s.q);
  const best = got.reduce((a, x) => (x.m > a.m ? x : a)),
    worst = got.reduce((a, x) => (x.m < a.m ? x : a));
  const wdA = got.filter((x) => !isWeekend(keyDow(x.k))),
    weA = got.filter((x) => isWeekend(keyDow(x.k)));
  const notes = [];
  const sdB = beds.length > 2 ? sd(beds) : null;
  if (sdB != null)
    notes.push(
      sdB <= 45
        ? `Your bedtime is fairly regular (varies by about ${Math.round(sdB)} min).`
        : `Your bedtime varies by about ${fmtHM(Math.round(sdB))} night to night. A steadier bedtime usually makes waking up easier.`,
    );
  if (short) notes.push(`${short} of ${got.length} night${got.length === 1 ? "" : "s"} were under 7 hours.`);
  if (wdA.length >= 2 && weA.length >= 1) {
    const diff = mean(weA.map((x) => x.m)) - mean(wdA.map((x) => x.m));
    if (Math.abs(diff) >= 45)
      notes.push(
        diff > 0
          ? `You sleep ${fmtHM(Math.round(diff))} more on weekends, which can mean you're catching up on sleep lost during the week.`
          : `You sleep ${fmtHM(Math.round(-diff))} less on weekends.`,
      );
  }
  const withMood = got.map((x) => ({ ...x, mood: hub.dayMood(x.k) })).filter((x) => x.mood != null),
    good = withMood.filter((x) => x.m >= 7 * 60),
    bad = withMood.filter((x) => x.m < 7 * 60);
  if (good.length >= 2 && bad.length >= 2) {
    const dm = mean(good.map((x) => x.mood)) - mean(bad.map((x) => x.mood));
    notes.push(
      Math.abs(dm) >= 0.3
        ? `Your mood averages ${mean(good.map((x) => x.mood)).toFixed(1)}/5 after 7+ hours vs ${mean(bad.map((x) => x.mood)).toFixed(1)}/5 after shorter nights.`
        : `So far your mood looks about the same after short and long nights.`,
    );
  } else notes.push(`Check in your mood on more days to see how sleep affects it.`);
  return `<div class="minis">
      ${mini(fmtHM(Math.round(avg)), "Average sleep", `${got.length} night${got.length === 1 ? "" : "s"} logged`)}
      ${mini(clockOf(mean(beds)), "Usual bedtime", sdB != null ? `± ${Math.round(sdB)} min` : "")}
      ${mini(clockOf(mean(wakes)), "Usual wake-up", "")}
      ${mini(qs.length ? mean(qs).toFixed(1) + "/5" : "–", "Sleep quality", qs.length ? SLEEP_Q[Math.round(mean(qs)) - 1][1] : "rate it when you log")}
      ${mini(fmtHM(best.m), "Longest", esc(fmtDate(best.k)))}
      ${mini(fmtHM(worst.m), "Shortest", esc(fmtDate(worst.k)))}</div>
    <div class="sechead" style="margin:6px 0 0"><h3 class="small">Hours slept</h3><span class="meta">dashed line = 7 h</span></div>
    <div class="sl-chart">${barChart(
      vals.map((v) => (v == null ? null : +(v / 60).toFixed(1))),
      labels,
      10,
      (v) => v.toFixed(1).replace(/\.0$/, "") + "h",
      "var(--c0)",
    )}<i class="sl-7" style="--y:${((10 + (190 - 10 - 30) * (1 - 7 / 10)) / 190) * 100}%"></i></div>
    <ul class="sl-notes">${notes.map((n) => `<li>${n}</li>`).join("")}</ul>`;
}
const TIME_COLORS = [
  "var(--c0)",
  "var(--c1)",
  "var(--c2)",
  "var(--c3)",
  "var(--c4)",
  "var(--c5)",
  "var(--high)",
  "var(--med)",
];
S.tvMode = "day";
S.tvDay = null;
S.tvWk = 0;
// ---------- what each minute of a day was spent on: sleep log, timed sessions, classes, then ticked routine items
function routineCat(r) {
  const l = (r.label || "").toLowerCase(),
    k = r.kind || "other";
  if (/\bsleep|\bbed\b|nap\b/.test(l)) return null;
  if (k === "meal" || /breakfast|brunch|lunch|dinner|supper|\bmeal|\beat\b|snack/.test(l)) return "Meals";
  if (/scroll|social|tiktok|instagram|youtube|netflix|\bgame|red ?note|xiaohongshu|movie|drama|series/.test(l))
    return "Leisure & screen time";
  if (k === "work" || /\bwork|email|e-mail|intern|meeting|report|office|shift/.test(l)) return "Work";
  if (
    k === "class" ||
    k === "study" ||
    /study|practi[cs]e|revis|lecture|tutorial|assignment|course|homework|excel|sql|python|coding|read|exam|reflect/.test(
      l,
    )
  )
    return "Study & courses";
  if (k === "health" || /gym|swim|run\b|running|exercise|walk|workout|yoga|sport|badminton|basketball|football/.test(l))
    return "Exercise & health";
  if (
    /commut|travel|drive|driving|\bbus\b|train|\bmrt|\blrt|grab|moving to|go to|going to|arrive|home\b|back to/.test(l)
  )
    return "Travel";
  if (/shop|grocer|errand|chore|laundry|clean|cook|wash|tidy|pay /.test(l)) return "Chores & errands";
  if (k === "break" || /break|rest|relax|chill/.test(l)) return "Breaks & rest";
  if (/wake|shower|bath|get ready|getting ready|dress|skincare|brush/.test(l)) return "Getting ready";
  if (k === "supplement" || /supplement|vitamin|medicine|pill/.test(l)) return "Getting ready";
  const t = (r.label || "Other").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function timeCat(x) {
  if (x.type === "task") {
    const t = S.tasks.find((y) => y.id === x.ref);
    return "Work";
  }
  if (["course", "self", "study", "asg"].includes(x.type)) return "Study & courses";
  if (x.type === "todo") return "Personal to-dos";
  return "Focus sessions";
}
function dayTimeline(k) {
  const T = new Array(1440).fill(null),
    L = new Array(1440).fill(""),
    fill = (a, b, c, force, lb) => {
      a = Math.max(0, Math.round(a));
      b = Math.min(1440, Math.round(b));
      for (let i = a; i < b; i++)
        if (force || !T[i]) {
          T[i] = c;
          L[i] = lb || c;
        }
    };
  // sleep: the night that ended this morning, and the night that started this evening
  const s0 = hub.hDoc(k).sleep;
  if (s0 && s0.bed && s0.wake) {
    const b = toMin(s0.bed),
      w = toMin(s0.wake);
    const lb = `Sleep ${hub.fmt12(s0.bed)}–${hub.fmt12(s0.wake)}`;
    if (b > w) fill(0, w, "Sleep", true, lb);
    else fill(b, w, "Sleep", true, lb);
  }
  const s1 = hub.hDoc(hub.addDays(k, 1)).sleep;
  if (s1 && s1.bed && s1.wake && toMin(s1.bed) > toMin(s1.wake))
    fill(toMin(s1.bed), 1440, "Sleep", true, `Sleep ${hub.fmt12(s1.bed)}–${hub.fmt12(s1.wake)}`);
  // timed and logged sessions
  S.time
    .filter((x) => x.date === k && x.start)
    .forEach((x) => {
      const a = minsOfISO(x.start),
        m = +x.mins || 0;
      fill(
        a,
        Math.min(1440, a + m),
        timeCat(x),
        false,
        (x.label || (x.type === "task" ? "Work task" : "Study")) +
          (x.via === "manual" ? " (logged)" : x.via === "routine" ? " (routine)" : " (timer)"),
      );
    });
  // classes you attended
  hub
    .classesOn(k)
    .filter((c) => !hub.attOf(c, k))
    .forEach((c) =>
      fill(
        toMin(c.start),
        toMin(c.end),
        "Classes",
        false,
        `${hub.subjLabel(c.subj)} ${(hub.CLS_TYPES.find((x) => x[0] === c.type) || ["", "class"])[1].toLowerCase()}`,
      ),
    );
  // routine items you ticked: each runs until the next item starts (at most 4 hours)
  const dd = dayDoc(k),
    done = dd.done || {},
    skip = dd.skip || {},
    items = routineFor(k)
      .filter((r) => !skip[r.id])
      .sort((a, b) => a.time.localeCompare(b.time));
  items.forEach((r, i) => {
    if (!done[r.id]) return;
    const cat = routineCat(r);
    if (!cat) return;
    const a = toMin(r.time),
      nx = items[i + 1] ? toMin(items[i + 1].time) : a + 60;
    fill(a, Math.min(nx, a + ({ Meals: 60, "Getting ready": 45 }[cat] || 240)), cat, false, r.label);
  });
  T.labels = L;
  return T;
}
// the events behind each category, e.g. Chores & errands → Shopping 6pm–9pm
function dayEventsByCat(k) {
  const T = dayTimeline(k),
    L = T.labels,
    out = {};
  let i = 0;
  while (i < 1440) {
    if (!T[i]) {
      i++;
      continue;
    }
    const c = T[i],
      l = L[i];
    let j = i;
    while (j < 1440 && T[j] === c && L[j] === l) j++;
    (out[c] = out[c] || []).push({ label: l, a: i, b: j, k });
    i = j;
  }
  return out;
}
function evListHtml(cat, evs, week) {
  if (!evs || !evs.length) return "";
  if (week) {
    const by = {};
    evs.forEach((e) => {
      const n = e.label.replace(/ \((logged|timer)\)$/, "");
      const r = (by[n] = by[n] || { m: 0, days: new Set() });
      r.m += e.b - e.a;
      r.days.add(e.k);
    });
    return `<b>${esc(cat)}</b><ul>${Object.entries(by)
      .sort((x, y) => y[1].m - x[1].m)
      .slice(0, 12)
      .map(
        ([n, r]) =>
          `<li><span>${esc(n)}</span><span class="muted">${fmtHM(r.m)}${r.days.size > 1 ? ` · ${r.days.size} days` : ""}</span></li>`,
      )
      .join("")}</ul>`;
  }
  return `<b>${esc(cat)}</b><ul>${evs.map((e) => `<li><span>${esc(e.label)}</span><span class="muted">${hub.fmt12(hm(e.a))}–${hub.fmt12(hm(e.b % 1440))} · ${fmtHM(e.b - e.a)}</span></li>`).join("")}</ul>`;
}
function timeOfDay(k) {
  const seg = {};
  dayTimeline(k).forEach((c) => {
    if (c) seg[c] = (seg[c] || 0) + 1;
  });
  return seg;
}
const TV_FIXED = {
  Sleep: "var(--c0)",
  Work: "var(--c1)",
  "Study & courses": "var(--c2)",
  Classes: "#3f8789",
  Meals: "#d08a3e",
  "Exercise & health": "#c0646f",
  Travel: "#8a8f5a",
  "Chores & errands": "#a07a5a",
  "Leisure & screen time": "#e0a1b0",
  "Breaks & rest": "#9bb3a0",
  "Getting ready": "#b7a8d6",
  "Focus sessions": "#c9b84a",
  "Personal to-dos": "#7c9cbf",
  "Not tracked": "var(--line)",
};
const TV_EXTRA = ["#6f8fb8", "#b88b6f", "#7a9e7e", "#a678a0", "#c7a35b", "#5f9ea0"];
function tvColor(n) {
  if (TV_FIXED[n]) return TV_FIXED[n];
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TV_EXTRA[h % TV_EXTRA.length];
}
function pieSvg(items, center, sub, workNames) {
  const sum = items.reduce((a, x) => a + x[1], 0) || 1,
    R = 70,
    C = 2 * Math.PI * R;
  let off = 0;
  const arcs = items.map(([n, m]) => {
    const len = (m / sum) * C,
      col = tvColor(n, workNames),
      ev = (S.tvEv && S.tvEv[n]) || [];
    const a = `<circle data-tvcat="${esc(n)}" r="${R}" cx="90" cy="90" fill="none" stroke="${col}" stroke-width="34" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"><title>${esc(n)}: ${fmtHM(Math.round(m))}${ev.length ? "\n" + [...new Set(ev.map((e) => e.label))].slice(0, 8).join("\n") : ""}</title></circle>`;
    off += len;
    return a;
  });
  return `<svg viewBox="0 0 180 180" class="pie" role="img" aria-label="Where your time went"><g transform="rotate(-90 90 90)">${arcs.join("")}</g><text x="90" y="86" text-anchor="middle" class="pie-n">${center}</text><text x="90" y="104" text-anchor="middle" class="pie-s">${sub}</text></svg>`;
}
function timeInsights() {
  const tk = todayKey(),
    st = hub.startKey(),
    day = S.tvMode === "day";
  const head = `<div class="tv-head"><div class="seg"><button type="button" data-tvmode="day" aria-pressed="${day}">Day</button><button type="button" data-tvmode="week" aria-pressed="${!day}">Weekly average</button></div>`;
  if (day) {
    const k = S.tvDay && S.tvDay <= tk ? S.tvDay : tk,
      seg = timeOfDay(k),
      workNames = Object.keys(seg).filter((n) => n.startsWith("Work"));
    S.tvEv = dayEventsByCat(k);
    S.tvWeek = false;
    let items = Object.entries(seg).sort((a, b) => b[1] - a[1]);
    const tracked = items.reduce((a, x) => a + x[1], 0);
    if (S.ovUntracked && tracked < 1440) items = [...items, ["Not tracked", 1440 - tracked]];
    const nav = `<div class="tv-nav"><button class="btn sm" type="button" data-tvday="-1" aria-label="Previous day">‹</button><span class="small"><b>${k === tk ? "Today" : k === hub.addDays(tk, -1) ? "Yesterday" : esc(DAYS[keyDow(k)])}</b> ${esc(fmtDate(k).replace(/^\w+, /, ""))}</span><button class="btn sm" type="button" data-tvday="1" ${k >= tk ? "disabled" : ""} aria-label="Next day">›</button></div></div>`;
    if (!tracked)
      return (
        head +
        nav +
        `<p class="small muted" style="margin:0">Nothing tracked on this day. Time comes from your sleep log, class timetable, and timers or time logs on tasks and courses.</p>`
      );
    const TL = dayTimeline(k),
      LB = TL.labels,
      runs = [];
    TL.forEach((c, i) => {
      const last = runs[runs.length - 1];
      if (last && last.c === c && last.l === LB[i]) last.n++;
      else runs.push({ c, l: LB[i], a: i, n: 1 });
    });
    const strip = `<div class="tv-strip">${runs.map((r) => `<i ${r.c ? `data-tvcat="${esc(r.c)}"` : ""} style="flex:${r.n};background:${r.c ? tvColor(r.c) : "transparent"}" title="${r.c ? esc(r.l) : "Not tracked"} · ${hub.fmt12(hm(r.a))}–${hub.fmt12(hm((r.a + r.n) % 1440))}"></i>`).join("")}</div><div class="tv-ticks">${[0, 6, 12, 18, 24].map((h) => `<span>${h === 24 ? "" : hub.fmt12(pad(h % 24) + ":00").replace(":00", "")}</span>`).join("")}</div>`;
    return (
      head +
      nav +
      strip +
      `<div class="pie-wrap">${pieSvg(items, fmtHM(tracked), "tracked", workNames)}
      <ul class="pie-leg">${items.map(([n, m]) => `<li data-tvcat="${esc(n)}" tabindex="0" class="${S.tvSel === n ? "is-sel" : ""}"><i style="background:${tvColor(n, workNames)}"></i><span>${esc(n)}</span><b>${fmtHM(Math.round(m))}</b><span class="muted small">${Math.round((m / (S.ovUntracked ? 1440 : tracked)) * 100)}%</span></li>`).join("")}</ul></div>
      <div class="tv-ev" id="tv-ev">${S.tvSel && S.tvEv[S.tvSel] ? evListHtml(S.tvSel, S.tvEv[S.tvSel]) : `<span class="small muted">Hover or tap a colour to see the exact events.</span>`}</div>
      <label class="small muted pie-tog"><input type="checkbox" data-ovuntracked ${S.ovUntracked ? "checked" : ""}> Show the rest of the 24 hours (${fmtHM(Math.max(0, 1440 - tracked))} not tracked)</label>`
    );
  }
  const keys = hub.weekKeys(S.tvWk),
    days = keys.filter((k) => k >= st && k <= tk),
    segs = days.map(timeOfDay),
    tot = {};
  S.tvEv = {};
  days.forEach((k) => Object.entries(dayEventsByCat(k)).forEach(([c, L]) => (S.tvEv[c] = S.tvEv[c] || []).push(...L)));
  S.tvWeek = true;
  segs.forEach((sg) => Object.entries(sg).forEach(([n, m]) => (tot[n] = (tot[n] || 0) + m)));
  const nights = segs.filter((sg) => sg.Sleep).length,
    workNames = Object.keys(tot).filter((n) => n.startsWith("Work"));
  const avgOf = (n) => (n === "Sleep" ? (nights ? tot[n] / nights : 0) : tot[n] / Math.max(1, days.length));
  let items = Object.keys(tot)
    .map((n) => [n, avgOf(n)])
    .sort((a, b) => b[1] - a[1]);
  const tracked = items.reduce((a, x) => a + x[1], 0);
  if (S.ovUntracked && tracked < 1440) items = [...items, ["Not tracked", 1440 - tracked]];
  const nav = `<div class="tv-nav"><button class="btn sm" type="button" data-tvwk="-1" aria-label="Previous week">‹</button><span class="small"><b>${S.tvWk === 0 ? "This week" : S.tvWk === -1 ? "Last week" : ""}</b> ${esc(longRange(keys[0], keys[6]))}</span><button class="btn sm" type="button" data-tvwk="1" ${S.tvWk >= 0 ? "disabled" : ""} aria-label="Next week">›</button></div></div>`;
  if (!tracked) return head + nav + `<p class="small muted" style="margin:0">Nothing tracked this week yet.</p>`;
  const names = items.map((x) => x[0]).filter((n) => n !== "Not tracked"),
    maxD = Math.max(60, ...segs.map((sg) => Object.values(sg).reduce((a, b) => a + b, 0)));
  const bars = `<div class="tv-bars">${keys
    .map((k) => {
      const i = days.indexOf(k),
        sg = i >= 0 ? segs[i] : {},
        t = Object.values(sg).reduce((a, b) => a + b, 0);
      return `<button type="button" class="tv-bar ${k > tk ? "is-fut" : ""}" ${k > tk ? "disabled" : `data-tvgo="${k}"`} title="${esc(fmtDate(k))}: ${fmtHM(Math.round(t))} tracked"><span class="tv-stack" style="height:${((t / maxD) * 100).toFixed(1)}%">${names
        .filter((n) => sg[n])
        .map((n) => `<i style="flex:${sg[n]};background:${tvColor(n, workNames)}"></i>`)
        .join(
          "",
        )}</span><span class="tv-lbl">${DAYS[keyDow(k)].slice(0, 2)}</span><span class="tv-h">${t ? Math.round(t / 6) / 10 + "h" : ""}</span></button>`;
    })
    .join("")}</div>`;
  return (
    head +
    nav +
    `<div class="pie-wrap">${pieSvg(items, fmtHM(Math.round(tracked)), "average / day", workNames)}
      <ul class="pie-leg">${items.map(([n, m]) => `<li data-tvcat="${esc(n)}" tabindex="0" class="${S.tvSel === n ? "is-sel" : ""}"><i style="background:${tvColor(n, workNames)}"></i><span>${esc(n)}</span><b>${fmtHM(Math.round(m))}</b><span class="muted small">${n === "Not tracked" ? "a day" : n === "Sleep" ? `a night · ${nights} logged` : `a day · ${fmtHM(Math.round(tot[n]))} total`}</span></li>`).join("")}</ul></div>
    <div class="tv-ev" id="tv-ev">${S.tvSel && S.tvEv[S.tvSel] ? evListHtml(S.tvSel, S.tvEv[S.tvSel], true) : `<span class="small muted">Hover or tap a colour to see what it was made of this week.</span>`}</div>
    <div class="small muted" style="font-weight:600">Each day <span style="font-weight:400">· tap a day to see it</span></div>${bars}
    <label class="small muted pie-tog"><input type="checkbox" data-ovuntracked ${S.ovUntracked ? "checked" : ""}> Show the rest of the 24 hours</label>
    <p class="small muted" style="margin:0">Averages use the ${plural(days.length, "day")} so far this week${nights && nights < days.length ? `; sleep uses the ${plural(nights, "night")} you logged` : ""}.</p>`
  );
}
S.tvSel = null;
function tvShow(cat) {
  const box = $("#tv-ev");
  if (!box) return;
  S.tvSel = cat;
  box.innerHTML =
    S.tvEv && S.tvEv[cat]
      ? evListHtml(cat, S.tvEv[cat], S.tvWeek)
      : `<b>${esc(cat)}</b> <span class="small muted">${cat === "Not tracked" ? "Time with nothing logged, timed or ticked." : ""}</span>`;
  document.querySelectorAll("#ov-time [data-tvcat]").forEach((x) => {
    const on = x.dataset.tvcat === cat;
    if (x.tagName === "LI") x.classList.toggle("is-sel", on);
    else x.classList.toggle("is-sel", on);
  });
}
document.addEventListener("mouseover", (e) => {
  const t = e.target.closest && e.target.closest("#ov-time [data-tvcat]");
  if (t && S.tvSel !== t.dataset.tvcat) tvShow(t.dataset.tvcat);
});
document.addEventListener("focusin", (e) => {
  const t = e.target.closest && e.target.closest("#ov-time [data-tvcat]");
  if (t) tvShow(t.dataset.tvcat);
});
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("#ov-time [data-tvcat]");
  if (t) tvShow(t.dataset.tvcat);
});
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("[data-tvmode],[data-tvday],[data-tvwk],[data-tvgo]");
  if (!t) return;
  const d = t.dataset,
    tk = todayKey();
  if (d.tvmode) S.tvMode = d.tvmode;
  else if (d.tvday)
    S.tvDay =
      hub.addDays(S.tvDay && S.tvDay <= tk ? S.tvDay : tk, +d.tvday) > tk
        ? tk
        : hub.addDays(S.tvDay && S.tvDay <= tk ? S.tvDay : tk, +d.tvday);
  else if (d.tvwk) S.tvWk = Math.min(0, S.tvWk + +d.tvwk);
  else if (d.tvgo) {
    S.tvDay = d.tvgo;
    S.tvMode = "day";
  }
  $("#ov-time").innerHTML = timeInsights();
});
S.ovUntracked = false;
document.addEventListener("change", (e) => {
  if (e.target.dataset && e.target.dataset.ovuntracked !== undefined) {
    S.ovUntracked = e.target.checked;
    hub.renderOverview();
  }
});

export { routineCat };
