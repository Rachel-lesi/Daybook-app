// Routine editor and starter routine
import { hub } from "./registry.js";
import {
  $,
  DAYS,
  ICON,
  KINDS,
  S,
  SEED,
  SVG,
  dayDoc,
  del,
  doc,
  esc,
  fmtDate,
  newId,
  pad,
  put,
  saveCats,
  strip,
  toast,
  viewKey,
  writeBatch,
} from "./core.js";
import { saveDay } from "./today.js";
import { routineCat } from "./time.js";
import { refreshPush, renderAlarmPanel } from "./alarms.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  daysLabel: { get: () => daysLabel, enumerable: true },
  renderRoutine: { get: () => renderRoutine, enumerable: true },
  saveRt: { get: () => saveRt, enumerable: true },
});

// ---------- routine editor
const daysLabel = (d) => {
  const s = (d || [0, 1, 2, 3, 4, 5, 6]).slice().sort().join("");
  return s === "0123456" ? "Every day" : s === "12345" ? "Weekdays" : s === "06" ? "Weekend" : null;
};
function renderRoutine() {
  renderAlarmPanel();
  if (!renderRoutine._p) {
    renderRoutine._p = true;
    refreshPush();
  }
  const all = S.routine.slice().sort((a, b) => a.time.localeCompare(b.time));
  const has = (r, set) => (r.days || [0, 1, 2, 3, 4, 5, 6]).some((d) => set.includes(d));
  const rows =
    S.rtFilter === "wd"
      ? all.filter((r) => has(r, [1, 2, 3, 4, 5]))
      : S.rtFilter === "we"
        ? all.filter((r) => has(r, [0, 6]))
        : all;
  $("#rt-filter").innerHTML = [
    ["all", "All items"],
    ["wd", "Weekday view"],
    ["we", "Weekend view"],
  ]
    .map(
      ([k, l]) =>
        `<button type="button" data-rtf="${k}" aria-pressed="${S.rtFilter === k}">${l} <span class="muted">${k === "all" ? all.length : k === "wd" ? all.filter((r) => has(r, [1, 2, 3, 4, 5])).length : all.filter((r) => has(r, [0, 6])).length}</span></button>`,
    )
    .join("");
  $("#rt-edit").innerHTML = rows.length
    ? rows
        .map(
          (r) => `<div class="rt" data-rid="${esc(r.id)}">
    <input type="time" value="${esc(r.time)}" data-f="time" aria-label="Time" id="rt-t-${esc(r.id)}">
    <input value="${esc(r.label)}" data-f="label" aria-label="Label" id="rt-l-${esc(r.id)}">
    <select data-f="kind" aria-label="Type" id="rt-k-${esc(r.id)}">${KINDS.map(([k, l]) => `<option value="${k}" ${k === r.kind ? "selected" : ""}>${l}</option>`).join("")}</select>
    <button class="x" type="button" data-delrt="${esc(r.id)}" aria-label="Delete">✕</button>
    <div class="days">${DAYS.map((d, i) => `<button type="button" data-day="${i}" aria-pressed="${!r.days || r.days.includes(i)}">${d.slice(0, 2)}</button>`).join("")}</div>
    <div class="rt-alarm"><button type="button" class="bell" data-alarm="${esc(r.id)}" aria-pressed="${!!r.alarm}" aria-label="Alarm for ${esc(r.label)}">${SVG(ICON.bell)}<span>${r.alarm ? "Alarm on" : "Alarm off"}</span></button>
      <select data-f="before" aria-label="When to alert" id="rt-b-${esc(r.id)}" ${r.alarm ? "" : "disabled"}>${[
        [0, "At the time"],
        [5, "5 min before"],
        [10, "10 min before"],
        [15, "15 min before"],
        [30, "30 min before"],
        [60, "1 hour before"],
      ]
        .map(([v, l]) => `<option value="${v}" ${(+r.before || 0) === v ? "selected" : ""}>${l}</option>`)
        .join("")}</select></div>
    <div class="presets"><span class="small muted" style="padding:2px 4px">${esc(daysLabel(r.days) || "Custom days")} ·</span>${[
      ["all", "Every day"],
      ["wd", "Weekdays"],
      ["we", "Weekend"],
    ]
      .filter(([, l]) => l !== daysLabel(r.days))
      .map(([k, l]) => `<button type="button" data-preset="${k}">${l}</button>`)
      .join("")}</div>
  </div>`,
        )
        .join("")
    : `<div class="empty">${S.ready ? "No routine items here yet." : "Loading…"}</div>`;
  $("#cat-edit").innerHTML = S.cats
    .map(
      (c) =>
        `<span class="chip">${esc(c.name)} <span class="muted" style="font-family:var(--f-mono)">#${esc(c.tag)}</span> <button class="x" type="button" data-ge="cat:${esc(c.tag)}" aria-label="Rename ${esc(c.name)}" title="Rename">${SVG(ICON.edit)}</button><button class="x" type="button" data-delcat="${esc(c.tag)}" aria-label="Remove ${esc(c.name)}">✕</button></span>`,
    )
    .join("");
}
// When an alarm should fire, in UTC, so the server can find due alarms with one small query.
function fireFields(r) {
  const off = -new Date().getTimezoneOffset();
  const [h, m] = String(r.time || "00:00")
    .split(":")
    .map(Number);
  let t = h * 60 + m - (+r.before || 0) - off;
  const shift = Math.floor(t / 1440);
  t = ((t % 1440) + 1440) % 1440;
  const days = r.days && r.days.length ? r.days : [0, 1, 2, 3, 4, 5, 6];
  return {
    fireUtc: pad(Math.floor(t / 60)) + ":" + pad(t % 60),
    fireDaysUtc: [...new Set(days.map((d) => (((d + shift) % 7) + 7) % 7))].sort(),
    tzOffset: off,
  };
}
function saveRt(r) {
  put("routine", r.id, { ...strip(r), ...fireFields(r) });
}
// Keep stored alarm times right if they were saved before this feature or the device timezone changed.
function syncFireFields() {
  for (const r of S.routine) {
    if (!r.alarm) continue;
    const f = fireFields(r);
    if (
      r.fireUtc !== f.fireUtc ||
      r.tzOffset !== f.tzOffset ||
      JSON.stringify(r.fireDaysUtc || []) !== JSON.stringify(f.fireDaysUtc)
    )
      saveRt(r);
  }
}
$("#rt-edit").addEventListener("change", (e) => {
  const row = e.target.closest("[data-rid]");
  if (!row || !e.target.dataset.f) return;
  const r = S.routine.find((x) => x.id === row.dataset.rid);
  if (!r) return;
  const f = e.target.dataset.f;
  const c = { ...r, [f]: f === "before" ? +e.target.value : e.target.value };
  saveRt(c);
});
$("#rt-edit").addEventListener("click", (e) => {
  const bl = e.target.closest("[data-alarm]");
  if (bl) {
    const r = S.routine.find((y) => y.id === bl.dataset.alarm);
    if (r) saveRt({ ...r, alarm: !r.alarm, before: r.before ?? 5 });
    return;
  }
  const d = e.target.closest("[data-day]");
  const x = e.target.closest("[data-delrt]");
  if (d) {
    const row = d.closest("[data-rid]");
    const r = S.routine.find((y) => y.id === row.dataset.rid);
    let days = r.days ? [...r.days] : [0, 1, 2, 3, 4, 5, 6];
    const i = +d.dataset.day;
    days = days.includes(i) ? days.filter((v) => v !== i) : [...days, i].sort();
    saveRt({ ...r, days });
  }
  if (x) {
    del("routine", x.dataset.delrt);
  }
});
// ---------- clear all / restore starter routine (only this account's routine)
async function batchRoutine(ops) {
  // ops: [["delete", id] | ["set", id, data]]
  if (!hub.db || !hub.FS) {
    ops.forEach(([op, id, d]) => (op === "delete" ? del("routine", id) : put("routine", id, d)));
    return;
  }
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(hub.FS);
    ops.slice(i, i + 400).forEach(([op, id, d]) => {
      const ref = doc(hub.FS, "users/" + hub.UID + "/routine/" + id);
      op === "delete" ? b.delete(ref) : b.set(ref, d);
    });
    await b.commit();
  }
}
function showRtConfirm(kind) {
  const box = $("#rt-confirm"),
    n = S.routine.length,
    alarms = S.routine.filter((r) => r.alarm).length;
  if (!kind) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML =
    kind === "clear"
      ? `<p><b>Delete all ${n} routine item${n === 1 ? "" : "s"}?</b> This clears your daily routine${alarms ? `, including ${alarms} alarm${alarms === 1 ? "" : "s"}` : ""}, so you can build your own from scratch. Your tasks, to-dos, reflections and courses stay. This can't be undone.</p>
       <p class="small muted">Tip: tap <b>Download backup</b> in Account &amp; backup first if you might want it back.</p>
       <div class="row"><button class="btn sm solid-danger" type="button" data-rtc="clear">Yes, clear all</button><button class="btn sm" type="button" data-rtc="cancel">Cancel</button></div>`
      : `<p><b>Add the starter routine?</b> This adds ${Object.keys(SEED.routine).length} general weekday and weekend items (wake up, meals, breaks, reflection, sleep) that you can edit.${n ? ` Your current ${n} item${n === 1 ? "" : "s"} stay${n === 1 ? "s" : ""} too.` : ""}</p>
       <div class="row"><button class="btn sm primary" type="button" data-rtc="restore">Add starter routine</button><button class="btn sm" type="button" data-rtc="cancel">Cancel</button></div>`;
  box.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
$("#rt-clear").onclick = () => {
  if (!S.routine.length) {
    toast("Your routine is already empty");
    return;
  }
  showRtConfirm("clear");
};
$("#rt-restore").onclick = () => showRtConfirm("restore");
$("#rt-confirm").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-rtc]");
  if (!b) return;
  const act = b.dataset.rtc;
  if (act === "cancel") {
    showRtConfirm(null);
    return;
  }
  b.disabled = true;
  try {
    if (act === "clear") {
      const n = S.routine.length;
      await batchRoutine(S.routine.map((r) => ["delete", r.id]));
      toast(`Cleared ${n} routine item${n === 1 ? "" : "s"}. Add your own with "Add routine item".`);
    } else {
      const items = Object.values(SEED.routine).map((r) => [
        "set",
        newId(),
        { ...r, ...(r.alarm ? fireFields(r) : {}) },
      ]);
      await batchRoutine(items);
      toast("Starter routine added");
    }
    showRtConfirm(null);
  } catch (err) {
    console.error(err);
    toast("Couldn't update your routine. Check your connection and try again.");
    b.disabled = false;
  }
});
$("#rt-add").onclick = () => {
  put("routine", newId(), {
    time: "12:00",
    label: "New item",
    kind: "other",
    days: S.rtFilter === "wd" ? [1, 2, 3, 4, 5] : S.rtFilter === "we" ? [0, 6] : [0, 1, 2, 3, 4, 5, 6],
  });
  toast("Item added. Edit its time and name below.");
};
// guess the type from the name, e.g. "Brunch" → Meal, "Interns related work" → Work
function guessKind(l) {
  const c = routineCat({ label: l, kind: "other" });
  return (
    {
      Meals: "meal",
      Work: "work",
      "Study & courses": "study",
      "Exercise & health": "health",
      "Breaks & rest": "break",
      "Getting ready": "other",
    }[c] || "other"
  );
}
let aoKindTouched = false;
function aoFillOpts() {
  const k = $("#ao-k"),
    ln = $("#ao-link");
  if (k && k.options.length < 2) k.innerHTML = KINDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  if (ln) {
    const cur = ln.value;
    ln.innerHTML = `<option value="">Not linked</option>` + hub.targetOptions(cur, viewKey());
  }
}
$("#ao-l").addEventListener("focus", aoFillOpts);
$("#ao-l").addEventListener("input", () => {
  if (!aoKindTouched) {
    aoFillOpts();
    $("#ao-k").value = guessKind($("#ao-l").value);
  }
});
$("#ao-k").addEventListener("change", () => {
  aoKindTouched = true;
});
$("#addonce").addEventListener("submit", (e) => {
  e.preventDefault();
  aoFillOpts();
  const l = $("#ao-l").value.trim(),
    t = $("#ao-t").value || "12:00";
  if (!l) {
    toast("Type what's happening first");
    return;
  }
  const kind = $("#ao-k").value || guessKind(l),
    link = $("#ao-link").value || "";
  const k = viewKey(),
    dd = dayDoc(k);
  saveDay(k, {
    ...dd,
    extra: [...(dd.extra || []), { id: newId(), time: t, label: l, kind, ...(link ? { link } : {}) }],
  });
  $("#ao-l").value = "";
  $("#ao-link").value = "";
  aoKindTouched = false;
  $("#ao-k").value = "other";
  toast("Added for " + fmtDate(k));
});
$("#cat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const n = $("#cat-new").value.trim();
  if (!n) return;
  let tag =
    n
      .split(/[\s\/]+/)[0]
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") || "cat";
  while (S.cats.find((c) => c.tag === tag)) tag += "2";
  S.cats.push({ name: n, tag });
  saveCats();
  $("#cat-new").value = "";
  renderRoutine();
});
$("#cat-edit").addEventListener("click", (e) => {
  const b = e.target.closest("[data-delcat]");
  if (!b) return;
  S.cats = S.cats.filter((c) => c.tag !== b.dataset.delcat);
  saveCats();
  renderRoutine();
});

export { syncFireFields };
