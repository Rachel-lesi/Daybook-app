// Daily reflection
import { hub } from "./registry.js";
import {
  $,
  DAYS,
  S,
  STATUS_LABEL,
  catName,
  dayDoc,
  esc,
  fmtDate,
  fmtTime,
  isoDay,
  keyDow,
  nowISO,
  toast,
  todayKey,
  write,
} from "./core.js";
import { fmtMins, routineFor } from "./today.js";
import { renderArchive } from "./archive.js";
import { ATT_LBL } from "./study.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  R_AREAS: { get: () => R_AREAS, enumerable: true },
  areaHas: { get: () => areaHas, enumerable: true },
  rArea: {
    get: () => rArea,
    set: (v) => {
      rArea = v;
    },
    enumerable: true,
  },
  rDate: {
    get: () => rDate,
    set: (v) => {
      rDate = v;
    },
    enumerable: true,
  },
  rDirty: {
    get: () => rDirty,
    set: (v) => {
      rDirty = v;
    },
    enumerable: true,
  },
  rDraft: {
    get: () => rDraft,
    set: (v) => {
      rDraft = v;
    },
    enumerable: true,
  },
  reflAreas: { get: () => reflAreas, enumerable: true },
  renderReflect: { get: () => renderReflect, enumerable: true },
});

// ---------- reflection
let rDate = todayKey(),
  rMood = 0,
  rDirty = false;
function workLogFor(day) {
  return S.tasks
    .map((t) => ({ t, entries: (t.log || []).filter((l) => isoDay(l.at) === day && l.note !== "Task added") }))
    .filter((x) => x.entries.length || isoDay(x.t.createdAt) === day);
}
// ---------- reflection split into Work, Study & courses, Daily life
const R_AREAS = [
    ["work", "Work"],
    ["study", "Study & courses"],
    ["life", "Daily life"],
  ],
  R_F = ["did", "learned", "mistakes", "improve"];
const R_PH = {
  work: {
    did: "Tasks you worked on and finished",
    learned: "New skill, SQL trick, how a process at the plant works…",
    mistakes: "What went wrong at work, honestly",
    improve: "One concrete change for work tomorrow",
  },
  study: {
    did: "Classes, assignments, revision, course modules",
    learned: "Concepts that clicked, exam tips, course takeaways",
    mistakes: "Procrastinated, misread the brief, rushed…",
    improve: "How you'll study better tomorrow",
  },
  life: {
    did: "Errands, exercise, cooking, people you saw, rest",
    learned: "About yourself, health, money, relationships",
    mistakes: "Habits that slipped",
    improve: "One small thing for tomorrow",
  },
};
let rArea = "work",
  rDraft = null;
function reflAreas(r) {
  if (!r) return { work: {}, study: {}, life: {} };
  if (r.areas) return { work: {}, study: {}, life: {}, ...r.areas };
  return {
    work: { did: r.did || "", learned: r.learned || "", mistakes: r.mistakes || "", improve: r.improve || "" },
    study: {},
    life: {},
  };
}
const areaHas = (a) => R_F.some((f) => ((a || {})[f] || "").trim());
function combineAreas(areas, f) {
  const parts = R_AREAS.map(([k, l]) => [l, ((areas[k] || {})[f] || "").trim()]).filter((x) => x[1]);
  return parts.length === 1 && parts[0][0] === "Work" ? parts[0][1] : parts.map(([l, v]) => `${l}: ${v}`).join("\n");
}
function rFill() {
  const a = rDraft[rArea] || {};
  R_F.forEach((f) => {
    const el = $("#r-" + f);
    el.value = a[f] || "";
    el.placeholder = R_PH[rArea][f];
  });
  rFillTabs();
}
function rSync() {
  if (!rDraft) return;
  rDraft[rArea] = { ...(rDraft[rArea] || {}) };
  R_F.forEach((f) => (rDraft[rArea][f] = $("#r-" + f).value));
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-rarea]");
  if (!b) return;
  rSync();
  rArea = b.dataset.rarea;
  rFill();
  rAuto();
});
function rAuto() {
  const k = rDate,
    head = (t) => `<b>${t} on ${esc(fmtDate(k))}</b>`;
  if (rArea === "work") {
    const wl = workLogFor(k);
    $("#r-auto").innerHTML =
      head("Pulled from your work tasks") +
      (wl.length
        ? `<ul>${wl.map((x) => `<li><b>${esc(x.t.title)}</b> <span class="muted">(${esc(catName(x.t.category))}, ${esc(STATUS_LABEL[x.t.status])} ${+x.t.progress || 0}%)</span>${x.entries.length ? ": " + x.entries.map((e) => esc(e.note)).join("; ") : " — added"}</li>`).join("")}</ul>`
        : `<div class="muted small">No work task updates logged on this day.</div>`);
    return;
  }
  if (rArea === "study") {
    const L = [];
    S.asg
      .filter((a) => ["submitted", "graded"].includes(a.status) && isoDay(a.doneAt) === k)
      .forEach((a) =>
        L.push(`<li><b>${esc(a.title)}</b> <span class="muted">(${esc(hub.subjLabel(a.subj))}, submitted)</span></li>`),
      );
    S.todos
      .filter((t) => (t.kind === "study" || t.kind === "self") && t.done && isoDay(t.doneAt) === k)
      .forEach((t) =>
        L.push(
          `<li>${esc(t.title)} <span class="muted">(${t.kind === "self" ? "self-study" : esc(hub.subjLabel(t.subj))})</span></li>`,
        ),
      );
    S.courses.forEach((c) => {
      const m = S.time
          .filter((x) => x.type === "course" && x.ref === c.id && x.date === k)
          .reduce((a, x) => a + (+x.mins || 0), 0),
        md = (c.modules || []).filter((x) => x.done && isoDay(x.doneAt) === k);
      if (m || md.length)
        L.push(
          `<li><b>${esc(c.name)}</b> <span class="muted">${[m ? fmtMins(m) + " studied" : "", md.length ? md.length + " module" + (md.length > 1 ? "s" : "") + " done" : ""].filter(Boolean).join(", ")}</span></li>`,
        );
    });
    const cs = hub.classesOn(k);
    if (cs.length)
      L.push(
        `<li>Classes: ${cs.map((c) => `${esc(hub.subjLabel(c.subj))}${hub.attOf(c, k) ? ` <span class="muted">(${ATT_LBL[hub.attOf(c, k)].toLowerCase()})</span>` : ""}`).join(", ")}</li>`,
      );
    $("#r-auto").innerHTML =
      head("Pulled from your study") +
      (L.length ? `<ul>${L.join("")}</ul>` : `<div class="muted small">Nothing logged for study on this day.</div>`);
    return;
  }
  const dd = dayDoc(k),
    its = routineFor(k).filter((r) => !(dd.skip || {})[r.id]),
    dn = its.filter((r) => (dd.done || {})[r.id]).length,
    h = hub.hDoc(k),
    mood = hub.dayMood(k),
    sl = hub.sleepMins(h.sleep);
  const todos = S.todos.filter((t) => !t.kind && t.done && isoDay(t.doneAt) === k),
    spent = S.exp.filter((x) => x.date === k).reduce((a, x) => a + (+x.amount || 0), 0);
  $("#r-auto").innerHTML =
    head("Your day") +
    `<ul>${its.length ? `<li>Routine: ${dn} of ${its.length} ticked</li>` : ""}${todos.length ? `<li>To-dos done: ${todos.map((t) => esc(t.title)).join(", ")}</li>` : ""}${sl ? `<li>Slept ${hub.fmtHM(sl)}</li>` : ""}${mood != null ? `<li>Mood ${(+mood).toFixed(1)}/5</li>` : ""}${h.water ? `<li>Water: ${h.water} cups</li>` : ""}${(h.meals || []).length ? `<li>Meals: ${h.meals.map((m) => esc(m.text)).join(", ")}</li>` : ""}${spent ? `<li>Spent ${hub.money(spent)}</li>` : ""}</ul>`;
}
function renderRWeek() {
  const box = $("#r-week");
  if (!box) return;
  const tk = todayKey(),
    m = hub.addDays(rDate, -((keyDow(rDate) + 6) % 7)),
    keys = [0, 1, 2, 3, 4, 5, 6].map((i) => hub.addDays(m, i));
  box.innerHTML = `<span class="small muted" style="font-weight:600">This week</span><div class="rw-days">${keys
    .map((k) => {
      const A = reflAreas(S.refl[k]);
      return `<button type="button" class="rw-day ${k === rDate ? "is-sel" : ""} ${k > tk ? "is-fut" : ""}" ${k > tk ? "disabled" : `data-rwday="${k}"`}><span>${DAYS[keyDow(k)].slice(0, 2)}</span><b>${+k.slice(8)}</b><span class="rw-dots">${R_AREAS.map(([a]) => (S.refl[k] && areaHas(A[a]) ? `<i class="d-${a}"></i>` : "")).join("")}</span></button>`;
    })
    .join("")}</div>
    <div class="rw-leg"><span><i style="background:var(--c0)"></i>Work</span><span><i style="background:var(--c2)"></i>Study</span><span><i style="background:var(--c3)"></i>Daily life</span></div>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-rwday]");
  if (!b) return;
  if (rDirty) saveRefl(true);
  rDate = b.dataset.rwday;
  rDirty = false;
  rDraft = null;
  S.arcMonth = rDate.slice(0, 7);
  renderReflect();
});
function renderReflect() {
  $("#r-date").value = rDate;
  const r = S.refl[rDate] || {};
  if (!rDirty || !rDraft) {
    rDraft = JSON.parse(JSON.stringify(reflAreas(S.refl[rDate])));
    rMood = r.mood || 0;
  }
  rFill();
  $("#r-mood").innerHTML = [1, 2, 3, 4, 5]
    .map((n) => `<button type="button" data-mood="${n}" aria-pressed="${rMood === n}">${n}</button>`)
    .join("");
  $("#r-saved").textContent = r.updatedAt ? `Saved ${fmtTime(r.updatedAt)}` : "Not saved yet";
  $("#r-del").hidden = !S.refl[rDate];
  if (!rDelAsk) {
    $("#r-del").textContent = "Delete";
    $("#r-del").classList.remove("armed");
  }
  rAuto();
  renderRWeek();
  $("#r-day").textContent =
    rDate === todayKey() ? "Today" : DAYS[keyDow(rDate)] + ", " + fmtDate(rDate).replace(/^\w+, /, "");
  renderArchive();
}
function _oldAuto() {
  const wl = workLogFor(rDate),
    doneTodos = [];
  $("#r-auto").innerHTML =
    `<b>Pulled from your tasks for ${esc(fmtDate(rDate))}</b>` +
    (wl.length || doneTodos.length
      ? `<ul>${wl.map((x) => `<li><b>${esc(x.t.title)}</b> <span class="muted">(${esc(catName(x.t.category))}, ${esc(STATUS_LABEL[x.t.status])} ${+x.t.progress || 0}%)</span>${x.entries.length ? ": " + x.entries.map((e) => esc(e.note)).join("; ") : " — added"}</li>`).join("")}${doneTodos.map((t) => `<li>${esc(t.title)} <span class="muted">(to-do done)</span></li>`).join("")}</ul>`
      : `<div class="muted small">No task updates logged on this day. Updates you log on work tasks appear here automatically.</div>`);
  renderArchive();
}
["#r-did", "#r-learned", "#r-mistakes", "#r-improve"].forEach((s) =>
  $(s).addEventListener("input", () => {
    rDirty = true;
    rSync();
    rDots();
    $("#r-saved").textContent = "Unsaved changes";
  }),
);
["#r-did", "#r-learned", "#r-mistakes", "#r-improve"].forEach((s) =>
  $(s).addEventListener("blur", (e) => {
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest("#r-areas,#v-reflect .refl textarea"))
      return;
    if (rDirty) saveRefl(true);
  }),
);
$("#r-date").addEventListener("change", (e) => {
  rDelAsk = false;
  S.arcMonth = (e.target.value || todayKey()).slice(0, 7);
  if (rDirty) saveRefl(true);
  rDate = e.target.value || todayKey();
  rDirty = false;
  rDraft = null;
  renderReflect();
});
$("#r-mood").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mood]");
  if (!b) return;
  rMood = +b.dataset.mood;
  rDirty = true;
  saveRefl(true);
});
$("#r-save").onclick = () => saveRefl(false);
let rDelAsk = false;
function deleteRefl(k) {
  const old = S.refl[k];
  if (!old) return;
  delete S.refl[k];
  if (k === rDate) {
    rDirty = false;
    rDelAsk = false;
  }
  if (hub.db) write("reflections/" + k, () => hub.db.doc("reflections/" + k).delete());
  hub.render();
  toast("Reflection deleted", () => {
    S.refl[k] = old;
    if (hub.db) write("reflections/" + k, () => hub.db.doc("reflections/" + k).set(old));
    hub.render();
    toast("Reflection restored");
  });
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("#r-del");
  if (!b) return;
  if (!rDelAsk) {
    rDelAsk = true;
    b.textContent = "Tap again to delete";
    b.classList.add("armed");
    setTimeout(() => {
      rDelAsk = false;
      if ($("#r-del")) {
        $("#r-del").textContent = "Delete";
        $("#r-del").classList.remove("armed");
      }
    }, 3000);
    return;
  }
  deleteRefl(rDate);
});
function rDots() {
  if (!rDraft) return;
  document.querySelectorAll("#r-areas [data-rarea]").forEach((b) => {
    const on = areaHas(rDraft[b.dataset.rarea]),
      d = b.querySelector(".r-dot");
    if (on && !d) b.insertAdjacentHTML("beforeend", ' <i class="r-dot"></i>');
    else if (!on && d) d.remove();
  });
}
function rFillTabs() {
  const h = R_AREAS.map(
    ([k, l]) =>
      `<button type="button" data-rarea="${k}" aria-pressed="${rArea === k}">${l}${areaHas(rDraft[k]) ? ' <i class="r-dot"></i>' : ""}</button>`,
  ).join("");
  $("#r-areas").innerHTML = h;
}
function saveRefl(quiet) {
  rSync();
  const areas = JSON.parse(JSON.stringify(rDraft || reflAreas(null)));
  const data = {
    date: rDate,
    areas,
    did: combineAreas(areas, "did"),
    learned: combineAreas(areas, "learned"),
    mistakes: combineAreas(areas, "mistakes"),
    improve: combineAreas(areas, "improve"),
    mood: rMood,
    updatedAt: nowISO(),
  };
  S.refl[rDate] = data;
  rDirty = false;
  if (hub.db) write("reflections/" + rDate, () => hub.db.doc("reflections/" + rDate).set(data));
  if (!quiet) {
    toast("Reflection saved");
    renderReflect();
  } else {
    $("#r-saved").textContent = `Saved ${fmtTime(data.updatedAt)}`;
    $("#r-del").hidden = false;
    rDots();
    renderRWeek();
    renderArchive();
  }
}
$("#r-copy").onclick = async () => {
  const wl = workLogFor(rDate);
  const lines = [
    `Daily Report — ${fmtDate(rDate)} ${rDate.slice(0, 4)}`,
    ...(S.org ? [S.org] : []),
    ``,
    `Work progress:`,
  ];
  wl.forEach((x) =>
    lines.push(
      `- [${catName(x.t.category)}] ${x.t.title} — ${STATUS_LABEL[x.t.status]}, ${+x.t.progress || 0}%${x.entries.length ? " (" + x.entries.map((e) => e.note).join("; ") + ")" : ""}${x.t.bottleneck && !x.t.bnSolved && x.t.status !== "done" ? " | Bottleneck: " + x.t.bottleneck : ""}`,
    ),
  );
  if (!wl.length) lines.push("- (no task updates logged)");
  const add = (h, v) => {
    if (v.trim()) {
      lines.push("", h + ":", v.trim());
    }
  };
  rSync();
  const W = (rDraft || {}).work || {};
  add("What I did", W.did || "");
  add("What I learned", W.learned || "");
  add("Mistakes", W.mistakes || "");
  add("How I'll improve", W.improve || "");
  const text = lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    toast("Report copied");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.minHeight = "200px";
    $("#r-auto").after(ta);
    ta.select();
    toast("Select all and copy the text below");
  }
};
