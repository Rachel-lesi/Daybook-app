// Log time by hand and edit to-dos
import { hub } from "./registry.js";
import { $, ICON, S, SVG, del, esc, fmtDate, nowISO, put, strip, toast, todayKey, write } from "./core.js";
import { fmtMins } from "./today.js";
import { editing, readTaskForm, redrawKeep } from "./tasks.js";
import { saveCourse } from "./courses.js";
import { hm, minsOfISO } from "./schedule.js";
import { nowHMs } from "./health.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  delTimeRec: { get: () => delTimeRec, enumerable: true },
  saveTimeRec: { get: () => saveTimeRec, enumerable: true },
});

// ---------- log time by hand (forgot the timer, or studied longer)
S.logT = null;
S.logMins = 30;
function openLog(type, ref, label, mod) {
  S.logT = { type, ref, label };
  S.logMins = S.logMins || 30;
  S.logMod = mod || "";
  S.logModDone = false;
  const d = $("#logdlg"),
    tk = todayKey();
  $("#lg-title").textContent = label || "Log time";
  $("#lg-chips").innerHTML = [15, 30, 45, 60, 90, 120]
    .map(
      (m) =>
        `<button type="button" class="qc" data-lgm="${m}" aria-pressed="${S.logMins === m}">${fmtMins(m)}</button>`,
    )
    .join("");
  $("#lg-custom").value = [15, 30, 45, 60, 90, 120].includes(S.logMins) ? "" : S.logMins;
  $("#lg-date").value = tk;
  $("#lg-end").value = nowHMs();
  S.logEdit = null;
  $("#lg-save").textContent = "Log";
  $("#lg-head").textContent = "Log time for";
  renderLogMods();
  S.lgUndo = null;
  renderLogList();
  if (!d.open) d.showModal();
}
function renderLogMods() {
  const box = $("#lg-mods");
  if (!box) return;
  const c = S.logT && S.logT.type === "course" ? S.courses.find((x) => x.id === S.logT.ref) : null,
    mods = c ? c.modules || [] : [];
  box.hidden = !mods.length;
  if (!mods.length) {
    box.innerHTML = "";
    return;
  }
  const cur = mods.find((m) => m.id === S.logMod);
  box.innerHTML = `<span class="small muted" style="font-weight:600">Module <span style="font-weight:400">(optional)</span></span><div class="qa-chips cwrap">${mods.map((m) => `<button type="button" class="qc ${m.done ? "is-done" : ""}" data-lgmod="${esc(m.id)}" aria-pressed="${S.logMod === m.id}">${m.done ? "✓ " : ""}${esc(m.title)}</button>`).join("")}</div>
    ${cur && !cur.done ? `<label class="small lg-mdone"><input type="checkbox" id="lg-mdone" ${S.logModDone ? "checked" : ""}> I finished this module</label>` : ""}`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-lgmod]");
  if (!b) return;
  S.logMod = S.logMod === b.dataset.lgmod ? "" : b.dataset.lgmod;
  renderLogMods();
});
document.addEventListener("change", (e) => {
  if (e.target.id === "lg-mdone") S.logModDone = e.target.checked;
});
const logRef = (x) => S.logT && x.type === S.logT.type && x.ref === S.logT.ref;
function renderLogList() {
  const box = $("#lg-list");
  if (!box || !S.logT) return;
  const L = S.time.filter(logRef).sort((a, b) => (b.start || "").localeCompare(a.start || "")),
    tot = L.reduce((a, x) => a + (+x.mins || 0), 0);
  box.innerHTML =
    (S.lgUndo
      ? `<div class="lg-undo small">Removed ${fmtMins(+S.lgUndo.rec.mins || 0)} on ${esc(fmtDate(S.lgUndo.rec.date))} <button type="button" class="linkbtn" data-lgundo>Undo</button></div>`
      : "") +
    (L.length
      ? `<div class="small muted" style="font-weight:600">Logged so far · ${fmtMins(tot)}</div><ul class="lg-list">${L.slice(
          0,
          30,
        )
          .map(
            (x) =>
              `<li class="${S.logEdit === x.id ? "is-edit" : ""}"><span class="od-d">${esc(fmtDate(x.date))}</span><span><b>${fmtMins(+x.mins || 0)}</b>${
                x.mod
                  ? (() => {
                      const c = S.courses.find((y) => y.id === x.ref),
                        m = c && (c.modules || []).find((y) => y.id === x.mod);
                      return m ? ` <span class="small">· ${esc(m.title)}</span>` : "";
                    })()
                  : ""
              } <span class="small muted">${x.via === "routine" ? "from routine" : x.via === "manual" ? "logged by hand" : x.via === "focus" ? "focus timer" : "timer"}${x.end ? " · ended " + esc(hub.fmt12(hm(minsOfISO(x.end)))) : ""}</span></span><span class="lg-acts"><button type="button" class="x tl-ed" data-lgedit="${esc(x.id)}" aria-label="Edit">${SVG(ICON.edit)}</button><button type="button" class="x" data-lgdel="${esc(x.id)}" aria-label="Delete">✕</button></span></li>`,
          )
          .join("")}</ul>${L.length > 30 ? `<p class="small muted" style="margin:0">Showing the latest 30.</p>` : ""}`
      : "");
}
function saveTimeRec(id, rec) {
  const i = S.time.findIndex((x) => x.id === id);
  if (i >= 0) S.time[i] = { ...rec, id };
  else S.time.unshift({ ...rec, id });
  if (hub.db) write("time/" + id, () => hub.db.doc("time/" + id).set(rec));
  hub.render();
}
function delTimeRec(id) {
  S.time = S.time.filter((x) => x.id !== id);
  if (hub.db) write("time/" + id, () => hub.db.doc("time/" + id).delete());
  hub.render();
}
document.addEventListener("click", (e) => {
  const ed = e.target.closest && e.target.closest("[data-lgedit]"),
    dl = e.target.closest && e.target.closest("[data-lgdel]");
  if (ed) {
    const x = S.time.find((y) => y.id === ed.dataset.lgedit);
    if (!x) return;
    S.logEdit = x.id;
    S.logMins = +x.mins || 0;
    S.logMod = x.mod || "";
    S.logModDone = false;
    renderLogMods();
    $("#lg-chips")
      .querySelectorAll("[data-lgm]")
      .forEach((b) => b.setAttribute("aria-pressed", +b.dataset.lgm === S.logMins));
    $("#lg-custom").value = [15, 30, 45, 60, 90, 120].includes(S.logMins) ? "" : S.logMins;
    $("#lg-date").value = x.date;
    $("#lg-end").value = x.end ? hm(minsOfISO(x.end)) : "20:00";
    $("#lg-save").textContent = "Save changes";
    $("#lg-head").textContent = "Editing a session of";
    renderLogList();
    return;
  }
  if (dl) {
    const x = S.time.find((y) => y.id === dl.dataset.lgdel);
    if (!x) return;
    const { id, ...rec } = x;
    delTimeRec(id);
    if (S.logEdit === id) {
      S.logEdit = null;
      $("#lg-save").textContent = "Log";
    }
    S.lgUndo = { id, rec };
    renderLogList();
  }
  const un = e.target.closest && e.target.closest("[data-lgundo]");
  if (un && S.lgUndo) {
    saveTimeRec(S.lgUndo.id, S.lgUndo.rec);
    S.lgUndo = null;
    renderLogList();
  }
});
function logTime({ type, ref, label }, mins, date, end) {
  mins = Math.round(+mins);
  if (!(mins > 0)) return false;
  const endD = new Date(`${date}T${end || "20:00"}:00`),
    startD = new Date(endD.getTime() - mins * 60000);
  const id = "m" + Date.now().toString(36),
    rec = {
      start: startD.toISOString(),
      end: endD.toISOString(),
      mins,
      date,
      type,
      ref: ref || "",
      label: label || "",
      via: "manual",
      ...(S.logMod && type === "course" ? { mod: S.logMod } : {}),
    };
  if (S.logMod && S.logModDone && type === "course") {
    const c = S.courses.find((x) => x.id === ref);
    if (c) {
      const mods = (c.modules || []).map((m) =>
        m.id === S.logMod ? { ...m, done: true, doneAt: endD.toISOString() } : m,
      );
      saveCourse({ ...c, modules: mods });
    }
  }
  if (!S.time.some((x) => x.id === id)) S.time.unshift({ ...rec, id });
  if (hub.db) write("time/" + id, () => hub.db.doc("time/" + id).set(rec));
  if (type === "task") {
    const t = S.tasks.find((x) => x.id === ref);
    if (t)
      put("tasks", t.id, {
        ...strip(t),
        log: [...(t.log || []), { at: nowISO(), note: `Logged ${fmtMins(mins)} by hand` }].slice(-200),
        updatedAt: nowISO(),
      });
  }
  hub.render();
  if (type === "task" && $("#dlg").open && editing && editing.id === ref) {
    readTaskForm();
    editing.log = [...(editing.log || []), { at: nowISO(), note: `Logged ${fmtMins(mins)} by hand` }];
    redrawKeep();
  }
  return true;
}
document.addEventListener(
  "click",
  (e) => {
    const o = e.target.closest && e.target.closest("[data-logtime]");
    if (o) {
      e.preventDefault();
      e.stopPropagation();
      const [type, ref, ...l] = o.dataset.logtime.split("|");
      openLog(type, ref, l.join("|"), o.dataset.logmod || "");
      return;
    }
    const m = e.target.closest && e.target.closest("[data-lgm]");
    if (m) {
      S.logMins = +m.dataset.lgm;
      $("#lg-custom").value = "";
      m.parentElement.querySelectorAll("[data-lgm]").forEach((b) => b.setAttribute("aria-pressed", b === m));
    }
  },
  true,
);
document.addEventListener("input", (e) => {
  if (e.target.id === "lg-custom") {
    const v = +e.target.value;
    if (v > 0) {
      S.logMins = v;
      $("#lg-chips")
        .querySelectorAll("[data-lgm]")
        .forEach((b) => b.setAttribute("aria-pressed", "false"));
    }
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "lg-form") return;
  e.preventDefault();
  const mins = +$("#lg-custom").value || S.logMins,
    date = $("#lg-date").value || todayKey();
  if (!(mins > 0) || mins > 24 * 60) {
    toast("Enter the minutes you spent");
    return;
  }
  if (S.logEdit) {
    const x = S.time.find((y) => y.id === S.logEdit);
    if (x) {
      const endD = new Date(`${date}T${$("#lg-end").value || "20:00"}:00`),
        startD = new Date(endD.getTime() - mins * 60000);
      const { id, ...rec } = x;
      const nr = { ...rec, mins: Math.round(mins), date, start: startD.toISOString(), end: endD.toISOString() };
      if (rec.type === "course") {
        if (S.logMod) nr.mod = S.logMod;
        else delete nr.mod;
      }
      saveTimeRec(id, nr);
    }
    S.logEdit = null;
    S.logMins = 30;
    $("#lg-custom").value = "";
    $("#lg-chips")
      .querySelectorAll("[data-lgm]")
      .forEach((b) => b.setAttribute("aria-pressed", b.dataset.lgm === "30"));
    $("#lg-date").value = todayKey();
    $("#lg-end").value = nowHMs();
    $("#lg-save").textContent = "Log";
    $("#lg-head").textContent = "Log time for";
    renderLogList();
    toast("Session updated");
    return;
  }
  if (logTime(S.logT, mins, date, $("#lg-end").value)) {
    $("#logdlg").close();
    toast(`Logged ${fmtMins(mins)}${date !== todayKey() ? " on " + fmtDate(date) : ""}`);
  }
});
// ---------- edit a to-do (personal, study or self-study)
function tdAsgOpts(subj, sel) {
  const L = S.asg
    .filter(
      (a) => !a.parent && (!subj || a.subj === subj) && (!["submitted", "graded"].includes(a.status) || a.id === sel),
    )
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  return (
    `<option value="">Not linked to an assignment</option>` +
    L.map(
      (a) =>
        `<option value="${esc(a.id)}" ${a.id === sel ? "selected" : ""}>${esc(hub.subjLabel(a.subj))} · ${esc(a.title)}${a.due ? " · due " + esc(fmtDate(a.due)) : ""}</option>`,
    ).join("")
  );
}
S.tdEdit = null;
function openTodoEdit(id) {
  const t = S.todos.find((x) => x.id === id);
  if (!t) return;
  S.tdEdit = id;
  const kind = t.kind || "todo",
    f = $("#td-form");
  f.innerHTML = `<div class="dlg-top"><h3>Edit</h3><button type="button" class="iconbtn dlg-x" data-dlg-x aria-label="Close">✕</button></div>
    <label class="f">Title<input id="td-title" value="${esc(t.title)}" required></label>
    <div class="f"><span class="small muted" style="font-weight:600">Type</span><div class="qa-chips cwrap">${[
      ["todo", "To-do"],
      ["study", "Study"],
      ["self", "Self-study / skills"],
    ]
      .map(([v, l]) => `<button type="button" class="qc" data-tdkind="${v}" aria-pressed="${kind === v}">${l}</button>`)
      .join("")}</div></div>
    <div class="td-study" ${kind === "study" ? "" : "hidden"}><span class="small muted" style="font-weight:600">Subject</span><div class="qa-chips cwrap td-subjs">${
      S.subjects
        .filter(hub.isCur)
        .map(
          (s) =>
            `<button type="button" class="qc ci-${(+s.color || 0) % 6}" data-tdsubj="${esc(s.id)}" aria-pressed="${t.subj === s.id}">${esc(s.code || s.name)}</button>`,
        )
        .join("") || `<span class="small muted">No subjects yet</span>`
    }</div>
      <label class="f">Part of assignment <span class="muted">(optional)</span><select id="td-asg" class="inp">${tdAsgOpts(t.subj, t.asg)}</select></label></div>
    <div class="td-self" ${kind === "self" ? "" : "hidden"}><span class="small muted" style="font-weight:600">Skill</span><div class="qa-chips cwrap">${S.cats.map((c, i) => `<button type="button" class="qc ci-${i % 6}" data-tdcat="${esc(c.tag)}" aria-pressed="${t.cat === c.tag}">${esc(c.name.split(/\s*\/\s*/)[0])}</button>`).join("")}</div>
      ${S.courses.length ? `<span class="small muted" style="font-weight:600">Course</span><div class="qa-chips cwrap">${S.courses.map((c) => `<button type="button" class="qc" data-tdcourse="${esc(c.id)}" aria-pressed="${t.course === c.id}">${esc(c.name)}</button>`).join("")}</div>` : ""}</div>
    <label class="f">Date<input type="date" id="td-date" value="${esc(t.date || "")}"></label>
    <div class="dlgfoot"><span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm ghost danger" type="button" data-tddel>Delete</button><button class="btn sm" type="button" data-tdlog>${SVG(ICON.timer)}Log time</button></span><span style="display:flex;gap:8px"><button class="btn" type="button" data-dlg-x>Cancel</button><button class="btn primary" type="submit">Save</button></span></div>`;
  f.dataset.kind = kind;
  f.dataset.subj = t.subj || "";
  f.dataset.cat = t.cat || "";
  f.dataset.course = t.course || "";
  if (!$("#tddlg").open) $("#tddlg").showModal();
}
document.addEventListener("click", (e) => {
  const ed = e.target.closest && e.target.closest("[data-todoedit]");
  if (ed) {
    e.preventDefault();
    openTodoEdit(ed.dataset.todoedit);
    return;
  }
  const f = e.target.closest && e.target.closest("#td-form");
  if (!f) return;
  const b = e.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  const pick = (attr, key) => {
    f.dataset[key] = f.dataset[key] === d[attr] ? "" : d[attr];
    f.querySelectorAll(`[data-${attr.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}]`).forEach((x) =>
      x.setAttribute("aria-pressed", x.dataset[attr] === f.dataset[key]),
    );
  };
  if (d.tdkind) {
    f.dataset.kind = d.tdkind;
    f.querySelectorAll("[data-tdkind]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    f.querySelector(".td-study").hidden = d.tdkind !== "study";
    f.querySelector(".td-self").hidden = d.tdkind !== "self";
  } else if (d.tdsubj) {
    pick("tdsubj", "subj");
    const sa = $("#td-asg");
    if (sa) {
      const cur = sa.value,
        a = S.asg.find((x) => x.id === cur);
      sa.innerHTML = tdAsgOpts(f.dataset.subj, a && (!f.dataset.subj || a.subj === f.dataset.subj) ? cur : "");
    }
  } else if (d.tdcat) pick("tdcat", "cat");
  else if (d.tdcourse) {
    pick("tdcourse", "course");
    const c = S.courses.find((x) => x.id === f.dataset.course);
    if (c && !f.dataset.cat && (c.skills || [])[0]) {
      f.dataset.cat = c.skills[0];
      f.querySelectorAll("[data-tdcat]").forEach((x) =>
        x.setAttribute("aria-pressed", x.dataset.tdcat === f.dataset.cat),
      );
    }
  } else if (d.tddel !== undefined) {
    const t = S.todos.find((x) => x.id === S.tdEdit);
    $("#tddlg").close();
    if (t) {
      del("todos", t.id);
      toast("Deleted", () => put("todos", t.id, strip(t)));
    }
  } else if (d.tdlog !== undefined) {
    const t = S.todos.find((x) => x.id === S.tdEdit);
    if (!t) return;
    const k = f.dataset.kind;
    if (k === "self" && f.dataset.course)
      openLog("course", f.dataset.course, (S.courses.find((c) => c.id === f.dataset.course) || {}).name || t.title);
    else openLog(k === "self" ? "self" : k === "study" ? "study" : "focus", t.id, t.title);
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "td-form") return;
  e.preventDefault();
  const f = e.target,
    t = S.todos.find((x) => x.id === S.tdEdit),
    title = $("#td-title").value.trim();
  if (!t || !title) return;
  const kind = f.dataset.kind,
    rec = { ...strip(t), title, date: $("#td-date").value || t.date || todayKey() };
  delete rec.kind;
  delete rec.subj;
  delete rec.cat;
  delete rec.course;
  delete rec.asg;
  if (kind === "study") {
    const av = $("#td-asg") ? $("#td-asg").value : "";
    const a = S.asg.find((x) => x.id === av);
    Object.assign(rec, { kind, subj: f.dataset.subj || (a ? a.subj : ""), asg: av || "" });
  }
  if (kind === "self") Object.assign(rec, { kind, cat: f.dataset.cat || "", course: f.dataset.course || "" });
  put("todos", t.id, rec);
  $("#tddlg").close();
  toast("Saved");
});
