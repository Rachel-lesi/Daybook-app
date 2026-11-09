// Task stopwatch and focus sessions
import { hub } from "./registry.js";
import { $, ICON, S, SVG, catName, esc, fmtDate, isoDay, nowISO, put, strip, toast, todayKey, write } from "./core.js";
import { clock, fmtMins, sortTasks, timerElapsed } from "./today.js";
import { openTask } from "./tasks.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  renderFocus: { get: () => renderFocus, enumerable: true },
  stopTimer: { get: () => stopTimer, enumerable: true },
  targetOptions: { get: () => targetOptions, enumerable: true },
  tickTimer: { get: () => tickTimer, enumerable: true },
  timerTargetLabel: { get: () => timerTargetLabel, enumerable: true },
});

// ---------- timers (task stopwatch + focus sessions)
S.time = [];
S.timer = null;
S.courses = [];
let audioCtx = null;
function chime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.22, 0.44].forEach((t, i) => {
      const o = audioCtx.createOscillator(),
        g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = [660, 880, 990][i];
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t + 0.35);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + t);
      o.stop(audioCtx.currentTime + t + 0.4);
    });
  } catch {}
}
function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}
function timerTargetLabel(type, ref) {
  if (type === "task") {
    const t = S.tasks.find((x) => x.id === ref);
    return t ? t.title : "Task";
  }
  if (type === "course") {
    const c = S.courses.find((x) => x.id === ref);
    return c ? c.name : "Study";
  }
  if (type === "asg") {
    const a = S.asg.find((x) => x.id === ref);
    return a ? `${hub.subjLabel(a.subj)} ${a.title}` : "Assignment";
  }
  if (type === "study" || type === "self" || type === "todo") {
    const t = S.todos.find((x) => x.id === ref);
    return t ? (t.kind === "study" && t.subj ? hub.subjLabel(t.subj) + " " : "") + t.title : "To-do";
  }
  return ref || "Focus";
}
function startTimer({ type, ref, label, mode = "stopwatch", dur = 0, mod = "" }) {
  unlockAudio();
  if (S.timer) stopTimer(false);
  S.timer = {
    type,
    ref: ref || "",
    label: label || timerTargetLabel(type, ref),
    mode,
    dur,
    start: nowISO(),
    ...(mod ? { mod } : {}),
  };
  if (hub.db) write("settings/timer", () => hub.db.doc("settings/timer").set(S.timer));
  hub.render();
  tickTimer();
}
function stopTimer(finishedFocus) {
  const T = S.timer;
  if (!T) return;
  const startMs = new Date(T.start).getTime();
  let mins = (Date.now() - startMs) / 60000;
  if (T.mode === "focus") mins = Math.min(mins, T.dur);
  S.timer = null;
  if (hub.db) write("settings/timer", () => hub.db.doc("settings/timer").delete());
  if (mins >= 1) {
    const id = "t" + startMs.toString(36); // same id on every device, so a session is never logged twice
    const rec = {
      start: T.start,
      end: nowISO(),
      mins: Math.round(mins),
      date: isoDay(T.start),
      type: T.type,
      ref: T.ref || "",
      label: T.label || "",
      via: T.mode,
      ...(T.mod ? { mod: T.mod } : {}),
    };
    if (!S.time.some((x) => x.id === id)) S.time.unshift({ ...rec, id });
    if (hub.db) write("time/" + id, () => hub.db.doc("time/" + id).set(rec));
    if (T.type === "task") {
      const t = S.tasks.find((x) => x.id === T.ref);
      if (t)
        put("tasks", t.id, {
          ...strip(t),
          log: [
            ...(t.log || []),
            { at: nowISO(), note: `Worked ${fmtMins(rec.mins)}${T.mode === "focus" ? " (focus session)" : ""}` },
          ].slice(-200),
          updatedAt: nowISO(),
        });
    }
  }
  if (finishedFocus) {
    chime();
    toast("Focus session done. Take a 5-minute break.");
    try {
      if ("Notification" in window && Notification.permission === "granted")
        new Notification("Focus session done", {
          body: (T.label || "Nice work") + " · take a short break",
          icon: "icon-192.png",
          tag: "daybook-focus",
        });
    } catch {}
  } else if (mins >= 1) toast(`Logged ${fmtMins(Math.round(mins))}`);
  else toast("Timer stopped (under a minute, not logged)");
  hub.render();
}
function tickTimer() {
  const T = S.timer,
    pill = $("#timerpill");
  if (!T) {
    pill.hidden = true;
    return;
  }
  const el = timerElapsed();
  if (T.mode === "focus" && el >= T.dur * 60) {
    stopTimer(true);
    return;
  }
  const shown = T.mode === "focus" ? clock(T.dur * 60 - el) : clock(el);
  pill.hidden = false;
  $("#tp-label").textContent = T.label || "Timer";
  $("#tp-time").textContent = shown;
  pill.classList.toggle("focus", T.mode === "focus");
  document.querySelectorAll("[data-live]").forEach((n) => (n.textContent = shown));
  const fr = $("#focus-ring");
  if (fr && T.mode === "focus") fr.style.setProperty("--p", Math.min(100, (el / (T.dur * 60)) * 100));
}
setInterval(tickTimer, 1000);
$("#tp-stop").addEventListener("click", () => stopTimer(false));
$("#tp-label").addEventListener("click", () => {
  if (S.timer && S.timer.type === "task") openTask(S.timer.ref);
  else if (S.timer && S.timer.type === "course") location.hash = "#growth";
});
// task card timer buttons (captured first so the card itself doesn't open)
document.addEventListener(
  "click",
  (e) => {
    const b = e.target.closest("[data-timer]");
    if (!b) return;
    e.stopPropagation();
    e.preventDefault();
    const id = b.dataset.timer;
    if (S.timer && S.timer.type === "task" && S.timer.ref === id) stopTimer(false);
    else {
      const t = S.tasks.find((x) => x.id === id);
      startTimer({ type: "task", ref: id, label: t ? t.title : "Task" });
      if (t && t.status === "todo")
        put("tasks", t.id, {
          ...strip(t),
          status: "doing",
          log: [...(t.log || []), { at: nowISO(), note: "Status: Not started → In progress" }],
          updatedAt: nowISO(),
        });
    }
  },
  true,
);
document.addEventListener("keydown", (e) => {
  const c = e.target.closest && e.target.closest("div.task[data-task]");
  if (c && (e.key === "Enter" || e.key === " ") && e.target === c) {
    e.preventDefault();
    openTask(c.dataset.task);
  }
});
// focus panel on Today
function targetOptions(sel, day) {
  const open = sortTasks(S.tasks.filter((t) => t.status !== "done"));
  // keep the list short: to-dos around this day only (study plan sessions would otherwise add hundreds)
  const tk0 = day || todayKey(),
    lo = hub.addDays(tk0, -3),
    hi = hub.addDays(tk0, 1),
    selId = (sel || "").split(/:(.*)/s)[1] || "";
  const td = (kind) =>
    S.todos
      .filter(
        (t) => (t.kind || "") === kind && (t.id === selId || (!t.done && (!t.date || (t.date >= lo && t.date <= hi)))),
      )
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .slice(0, 12);
  const asgOpen = S.asg
    .filter((a) => !["submitted", "graded"].includes(a.status))
    .sort((a, b) => ((a.due || "9999") + (a.time || "")).localeCompare((b.due || "9999") + (b.time || "")));
  const grp = (label, list) => (list.length ? [`<optgroup label="${label}">${list.join("")}</optgroup>`] : []);
  const opts = []
    .concat(
      grp(
        "Work tasks",
        open.map((t) => `<option value="task:${esc(t.id)}">${esc(t.title)}</option>`),
      ),
    )
    .concat(
      grp(
        "Assignments & tests",
        asgOpen.map((a) => {
          const p = a.parent && S.asg.find((x) => x.id === a.parent);
          return `<option value="asg:${esc(a.id)}">${esc(hub.subjLabel(a.subj))} · ${p ? esc(p.title) + " › " : ""}${esc(a.title)}${a.due ? " (due " + esc(fmtDate(a.due).replace(/^\w+, /, "")) + ")" : ""}</option>`;
        }),
      ),
    )
    .concat(
      grp(
        "Study to-dos",
        td("study").map(
          (t) =>
            `<option value="study:${esc(t.id)}">${t.subj ? esc(hub.subjLabel(t.subj)) + " · " : ""}${esc(t.title)}</option>`,
        ),
      ),
    )
    .concat(
      grp(
        "Self-study",
        td("self").map(
          (t) =>
            `<option value="self:${esc(t.id)}">${t.date && t.date !== tk0 ? esc(fmtDate(t.date).replace(/^\w+, /, "")) + " · " : ""}${t.cat ? esc(catName(t.cat).split(/\s*\/\s*/)[0]) + " · " : ""}${esc(t.title.length > 70 ? t.title.slice(0, 68) + "…" : t.title)}</option>`,
        ),
      ),
    )
    .concat(
      grp(
        "Courses",
        S.courses.flatMap((c) => [
          `<option value="course:${esc(c.id)}">${esc(c.name)}</option>`,
          ...(c.modules || []).filter((m) => "course:" + c.id + "|" + m.id === sel).map((m) => modOpt(c, m)),
        ]),
      ),
    )
    .concat(
      grp(
        "To-dos",
        td("")
          .filter((t) => !t.date || t.date <= hub.addDays(tk0, 1))
          .map((t) => `<option value="todo:${esc(t.id)}">${esc(t.title)}</option>`),
      ),
    );
  let h = opts.join("");
  if (sel) h = h.replace(`value="${esc(sel)}"`, `value="${esc(sel)}" selected`);
  return h;
}
// courses list only names; the module is picked in a small second select beside the link list
const modOpt = (c, m) =>
  `<option value="course:${esc(c.id)}|${esc(m.id)}">${esc(c.name)} › ${esc(m.title.length > 50 ? m.title.slice(0, 48) + "…" : m.title)}</option>`;
const TGT_SEL = "#fx-what, #tle-link, #ao-link";
function modSync(sel) {
  if (!sel || !sel.isConnected) return;
  let ms =
    sel.nextElementSibling && sel.nextElementSibling.classList.contains("tgt-mod") ? sel.nextElementSibling : null;
  const [type, ref0] = (sel.value || "").split(/:(.*)/s),
    [cid, mid] = (ref0 || "").split("|"),
    c = type === "course" && S.courses.find((x) => x.id === cid);
  if (!c || !(c.modules || []).length) {
    if (ms) ms.hidden = true;
    return;
  }
  if (!ms) {
    ms = document.createElement("select");
    ms.className = "tgt-mod";
    ms.setAttribute("aria-label", "Module");
    sel.after(ms);
  }
  const mods = c.modules.filter((m) => !m.done || m.id === mid);
  ms.innerHTML =
    `<option value="">Whole course</option>` +
    mods.map((m) => `<option value="${esc(m.id)}">${esc(m.title)}</option>`).join("");
  ms.value = mods.some((m) => m.id === mid) ? mid : "";
  ms.dataset.cid = c.id;
  ms.hidden = false;
}
document.addEventListener(
  "change",
  (e) => {
    const t = e.target;
    if (t.matches && t.matches(TGT_SEL)) {
      modSync(t);
      return;
    }
    if (t.classList && t.classList.contains("tgt-mod")) {
      const sel = t.previousElementSibling,
        c = S.courses.find((x) => x.id === t.dataset.cid);
      if (!sel || !c) return;
      [...sel.querySelectorAll('option[value^="course:"]')].forEach((o) => {
        if (o.value.includes("|")) o.remove();
      });
      if (!t.value) {
        sel.value = "course:" + c.id;
        return;
      }
      const m = c.modules.find((x) => x.id === t.value),
        base = sel.querySelector(`option[value="course:${CSS.escape(c.id)}"]`);
      if (!m || !base) return;
      base.insertAdjacentHTML("afterend", modOpt(c, m));
      sel.value = "course:" + c.id + "|" + m.id;
    }
  },
  true,
);
new MutationObserver(() =>
  document.querySelectorAll(TGT_SEL).forEach((sel) => {
    const ms = sel.nextElementSibling,
      has = ms && ms.classList.contains("tgt-mod");
    const want = (sel.value || "").startsWith("course:");
    if (want && (!has || ms.hidden || ms.dataset.cid !== sel.value.slice(7).split("|")[0])) modSync(sel);
    else if (!want && has && !ms.hidden) ms.hidden = true;
  }),
).observe(document.documentElement, { childList: true, subtree: true });
S.focusMins = 25;
function renderFocus() {
  const box = $("#focusbox");
  if (!box) return;
  const prevSel = $("#fx-what") ? $("#fx-what").value : null;
  const T = S.timer;
  if (T && T.mode === "focus") {
    box.innerHTML = `<div class="fx-run"><div class="fx-ring" id="focus-ring" style="--p:${Math.min(100, (timerElapsed() / (T.dur * 60)) * 100)}"><span data-live>${clock(T.dur * 60 - timerElapsed())}</span></div>
      <div class="fx-txt"><b>Focusing</b><span class="muted small">${esc(T.label)}</span><div style="display:flex;gap:6px;margin-top:6px"><button class="btn sm" type="button" id="fx-stop">Stop & log</button></div></div></div>`;
    return;
  }
  const open = sortTasks(S.tasks.filter((t) => t.status !== "done"));
  const opts = [
    `<option value="other:">Just focus (no task)</option>`,
    targetOptions(prevSel && prevSel !== "other:" ? prevSel : ""),
  ];
  const today = S.time.filter((x) => x.date === todayKey()).reduce((a, x) => a + (+x.mins || 0), 0);
  box.innerHTML = `<div class="fx-set">
    <label class="f" style="flex:1;min-width:0">Focus on<select id="fx-what">${opts.join("")}</select></label>
    <div class="seg" id="fx-len">${[15, 25, 50].map((m) => `<button type="button" data-m="${m}" aria-pressed="${S.focusMins === m}">${m}m</button>`).join("")}</div>
    <button class="btn primary" type="button" id="fx-start">${SVG(ICON.play)}Start</button></div>
    <p class="small muted" style="margin:0">${today ? `Tracked today: <b>${fmtMins(today)}</b>` : "A bell rings when the session ends. Time is logged to the task or course."}</p>`;
  if (prevSel && [...$("#fx-what").options].some((o) => o.value === prevSel)) $("#fx-what").value = prevSel;
}
document.addEventListener("click", (e) => {
  const m = e.target.closest("#fx-len [data-m]");
  if (m) {
    S.focusMins = +m.dataset.m;
    renderFocus();
    return;
  }
  if (e.target.closest("#fx-start")) {
    const [type, ref0] = $("#fx-what").value.split(/:(.*)/s),
      [ref, mod] = (ref0 || "").split("|");
    startTimer({
      type,
      ref,
      label:
        type === "other"
          ? "Focus session"
          : mod
            ? `${timerTargetLabel(type, ref)} › ${((S.courses.find((c) => c.id === ref) || {}).modules || []).find((m) => m.id === mod)?.title || ""}`
            : timerTargetLabel(type, ref),
      mod,
      mode: "focus",
      dur: S.focusMins,
    });
    return;
  }
  if (e.target.closest("#fx-stop")) {
    stopTimer(false);
    return;
  }
});

export { startTimer };
