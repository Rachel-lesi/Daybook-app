// Work task editor
import { hub } from "./registry.js";
import {
  $,
  ICON,
  S,
  STATUS,
  STATUS_LABEL,
  SVG,
  URG,
  del,
  dkey,
  esc,
  fmtDate,
  fmtTime,
  isWeekend,
  isoDay,
  newId,
  nowISO,
  put,
  strip,
  toast,
  todayKey,
} from "./core.js";
import { REPEAT, REPEAT_SHORT, fmtMins, taskMins } from "./today.js";

// ---------- task editor
let editing = null,
  confirmDel = false;
const newSubId = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function openTask(id) {
  const t = S.tasks.find((x) => x.id === id);
  if (!t) return;
  editing = {
    ...t,
    log: [...(t.log || [])],
    subtasks: (t.subtasks || []).map((s) => ({ ...s })),
    links: (t.links || []).map((l) => ({ ...l })),
  };
  confirmDel = false;
  drawTask();
  const d = $("#dlg");
  if (!d.open) {
    const touch = matchMedia("(hover: none)").matches;
    d.toggleAttribute("autofocus", touch);
    if (touch) d.tabIndex = -1;
    d.showModal();
    if (touch) d.focus({ preventScroll: true });
    d.scrollTop = 0;
  }
}
function autoProgress() {
  const s = editing.subtasks;
  if (!s.length) return;
  editing.progress = Math.round((s.filter((x) => x.done).length / s.length) * 100);
  if (editing.progress > 0 && editing.status === "todo") editing.status = "doing";
}
function drawTask() {
  const t = editing,
    subs = t.subtasks,
    mins = taskMins(t.id);
  $("#tf").innerHTML =
    `<div class="dlg-top"><h3>Work task</h3><button type="button" class="iconbtn dlg-x" data-dlg-x aria-label="Close without saving" title="Close">✕</button></div>
    <label class="f">Task<input id="t-title" value="${esc(t.title)}" required></label>
    <label class="f">Description<textarea id="t-desc" placeholder="What exactly was asked, expected output, where the data is">${esc(t.desc)}</textarea></label>
    <div class="f" style="display:grid;gap:6px"><span class="small muted" style="font-weight:600">Steps ${subs.length ? `<span class="muted">· ${subs.filter((s) => s.done).length}/${subs.length} done · progress updates automatically</span>` : ""}</span>
      ${subs.length ? `<ul class="subs">${subs.map((s, i) => `<li class="${s.done ? "done" : ""}"><input type="checkbox" data-subtog="${i}" ${s.done ? "checked" : ""} aria-label="Step done: ${esc(s.text)}"><input class="sub-in" data-subtext="${i}" value="${esc(s.text)}" aria-label="Step ${i + 1}"><button type="button" class="x" data-subdel="${i}" aria-label="Remove step">✕</button></li>`).join("")}</ul>` : ""}
      <div class="qrow"><input id="t-subnew" placeholder="Add a step, e.g. Get read access to the database" class="inp"><button class="btn sm" type="button" id="t-subadd">Add step</button></div></div>
    <div class="grid2">
      <label class="f">Category<select id="t-cat"><option value="">Uncategorised</option>${S.cats.map((c) => `<option value="${esc(c.tag)}" ${c.tag === t.category ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
      <label class="f">Due date<input type="date" id="t-due" value="${esc(t.due)}"></label>
      <label class="f">Assigned by<input id="t-by" value="${esc(t.assignedBy)}" placeholder="Supervisor's name"></label>
      <label class="f">Repeats<select id="t-repeat">${REPEAT.map(([v, l]) => `<option value="${v}" ${(t.repeat || "none") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="f">Progress: <span id="t-pv">${+t.progress || 0}%</span><input type="range" id="t-prog" min="0" max="100" step="${subs.length ? 1 : 5}" value="${+t.progress || 0}" ${subs.length ? "disabled" : ""} style="padding:0;border:0;background:none"></label>
      <div class="f" style="display:grid;gap:4px"><span class="small muted" style="font-weight:600">Time spent</span><span class="tspent">${SVG(ICON.timer)}${mins ? fmtMins(mins) : "None yet"}<span class="muted small"> · use ▶ on the task card or </span><button type="button" class="linkbtn small" data-logtime="task|${esc(editing.id)}|${esc(editing.title)}">log or edit time</button></span></div>
    </div>
    <div class="f" style="display:grid;gap:4px"><span class="small muted" style="font-weight:600">Urgency</span><div class="seg" id="t-urg">${URG.map((u) => `<button type="button" data-v="${u}" aria-pressed="${t.urgency === u}">${u[0].toUpperCase() + u.slice(1)}</button>`).join("")}</div></div>
    <div class="f" style="display:grid;gap:4px"><span class="small muted" style="font-weight:600">Status</span><div class="seg" id="t-st">${STATUS.map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${t.status === k}">${l}</button>`).join("")}</div></div>
    <label class="f">Bottleneck<textarea id="t-block" placeholder="What's slowing this down? Waiting for data, access, clarification…" style="min-height:52px">${esc(t.bottleneck)}</textarea></label>
    <label class="f">Result / impact <span class="muted" style="font-weight:400">· shows on your resume bullets</span><input id="t-impact" value="${esc(t.impact || "")}" placeholder="e.g. Cut report time from 2 hours to 20 minutes"></label>
    <label class="f">Notes <span class="muted" style="font-weight:400">· SQL queries, file paths, meeting notes</span><textarea id="t-notes" class="mono" placeholder="SELECT batch_id, COUNT(*) FROM production GROUP BY batch_id HAVING COUNT(*) > 1;">${esc(t.notes || "")}</textarea></label>
    <div class="f" style="display:grid;gap:6px"><span class="small muted" style="font-weight:600">Links</span>
      ${t.links.length ? `<ul class="links">${t.links.map((l, i) => `<li>${SVG(ICON.link)}<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)}</a><button type="button" class="x tl-ed" data-linkedit="${i}" aria-label="Edit link" title="Edit">${SVG(ICON.edit)}</button><button type="button" class="x" data-linkdel="${i}" aria-label="Remove link">✕</button></li>`).join("")}</ul>` : ""}
      <div class="qrow rwrap"><input id="t-linkurl" type="url" placeholder="Paste a link (shared drive, sheet, ticket)" class="inp"><input id="t-linklabel" placeholder="Name (optional)" class="inp" style="max-width:180px"><button class="btn sm" type="button" id="t-linkadd">Add link</button></div></div>
    <div style="display:grid;gap:6px"><span class="small muted" style="font-weight:600">Progress log</span>
      <div class="qrow"><input id="t-note" placeholder="Add an update, e.g. Finished joining the sales tables" class="inp"><button class="btn sm" type="button" id="t-addnote">Log</button></div>
      <ul class="log">${t.log
        .slice()
        .reverse()
        .map((l) => `<li><time>${esc(fmtDate(isoDay(l.at)))} ${fmtTime(l.at)}</time><span>${esc(l.note)}</span></li>`)
        .join("")}</ul></div>
    <div class="dlgfoot">
      <button class="btn ghost danger sm" type="button" id="t-del">${confirmDel ? "Tap again to delete" : "Delete"}</button>
      <div style="display:flex;gap:8px"><button class="btn" type="button" id="t-cancel">Cancel</button><button class="btn primary" type="button" id="t-save">Save</button></div>
    </div>`;
}
function readTaskForm() {
  const t = editing;
  document.querySelectorAll("#tf [data-subtext]").forEach((el) => {
    const s = (t.subtasks || [])[+el.dataset.subtext];
    if (s && el.value.trim()) s.text = el.value.trim();
  });
  t.title = $("#t-title").value.trim() || t.title;
  t.desc = $("#t-desc").value;
  t.category = $("#t-cat").value;
  t.due = $("#t-due").value;
  t.assignedBy = $("#t-by").value.trim();
  if (!(t.subtasks || []).length) t.progress = +$("#t-prog").value;
  t.bottleneck = $("#t-block").value.trim();
  t.repeat = $("#t-repeat").value;
  t.impact = $("#t-impact").value.trim();
  t.notes = $("#t-notes").value;
}
function redrawKeep(focusId) {
  const sc = $("#dlg").scrollTop;
  drawTask();
  $("#dlg").scrollTop = sc;
  if (focusId) $("#" + focusId)?.focus();
}
$("#tf").addEventListener("input", (e) => {
  if (e.target.id === "t-prog") $("#t-pv").textContent = e.target.value + "%";
});
$("#tf").addEventListener("change", (e) => {
  const i = e.target.dataset.subtog;
  if (i === undefined) return;
  readTaskForm();
  const s = editing.subtasks[+i];
  s.done = e.target.checked;
  s.doneAt = s.done ? nowISO() : "";
  autoProgress();
  redrawKeep();
});
$("#tf").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.parentElement.id === "t-urg") {
    readTaskForm();
    editing.urgency = b.dataset.v;
    redrawKeep();
  } else if (b.parentElement.id === "t-st") {
    readTaskForm();
    editing.status = b.dataset.v;
    if (b.dataset.v === "done") editing.progress = 100;
    redrawKeep(b.dataset.v === "done" ? "t-impact" : null);
  } else if (b.id === "t-addnote") {
    readTaskForm();
    const n = $("#t-note").value.trim();
    if (n) {
      editing.log.push({ at: nowISO(), note: n });
      redrawKeep("t-note");
    }
  } else if (b.id === "t-subadd") {
    readTaskForm();
    const n = $("#t-subnew").value.trim();
    if (n) {
      editing.subtasks.push({ id: newSubId(), text: n, done: false });
      autoProgress();
      redrawKeep("t-subnew");
    }
  } else if (b.dataset.subdel !== undefined) {
    readTaskForm();
    editing.subtasks.splice(+b.dataset.subdel, 1);
    autoProgress();
    redrawKeep();
  } else if (b.id === "t-linkadd") {
    readTaskForm();
    let u = $("#t-linkurl").value.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    editing.links.push({ url: u, label: $("#t-linklabel").value.trim() });
    redrawKeep("t-linkurl");
  } else if (b.dataset.linkedit !== undefined) {
    readTaskForm();
    const i = +b.dataset.linkedit,
      l = editing.links[i];
    if (l)
      hub.editDlg(
        "Edit link",
        [
          { k: "label", label: "Name", value: l.label || "" },
          { k: "url", label: "Link", type: "url", value: l.url },
        ],
        (v) => {
          if (!v.url) return;
          editing.links[i] = { ...l, label: v.label, url: /^https?:\/\//i.test(v.url) ? v.url : "https://" + v.url };
          redrawKeep();
        },
      );
  } else if (b.dataset.linkdel !== undefined) {
    readTaskForm();
    editing.links.splice(+b.dataset.linkdel, 1);
    redrawKeep();
  } else if (b.id === "t-cancel") {
    $("#dlg").close();
  } else if (b.id === "t-del") {
    if (!confirmDel) {
      readTaskForm();
      confirmDel = true;
      redrawKeep();
    } else {
      if (S.timer && S.timer.ref === editing.id) hub.stopTimer(false);
      del("tasks", editing.id);
      $("#dlg").close();
      toast("Task deleted");
    }
  } else if (b.id === "t-save") {
    readTaskForm();
    saveTask();
  }
});
$("#tf").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const map = { "t-note": "t-addnote", "t-subnew": "t-subadd", "t-linkurl": "t-linkadd", "t-linklabel": "t-linkadd" };
  if (map[e.target.id]) {
    e.preventDefault();
    $("#" + map[e.target.id]).click();
  }
});
function nextDue(from, rep) {
  const [y, m, d] = from.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (rep === "daily") dt.setDate(dt.getDate() + 1);
  else if (rep === "weekdays") {
    do {
      dt.setDate(dt.getDate() + 1);
    } while (isWeekend(dt.getDay()));
  } else if (rep === "weekly") dt.setDate(dt.getDate() + 7);
  else if (rep === "monthly") {
    const target = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0).getDate();
    target.setDate(Math.min(d, last));
    return dkey(target);
  }
  return dkey(dt);
}
function saveTask() {
  const t = editing,
    old = S.tasks.find((x) => x.id === t.id) || {};
  const pending = $("#t-note") && $("#t-note").value.trim();
  if (pending) t.log.push({ at: nowISO(), note: pending });
  const oldDone = new Set((old.subtasks || []).filter((s) => s.done).map((s) => s.id));
  t.subtasks
    .filter((s) => s.done && !oldDone.has(s.id))
    .forEach((s) => t.log.push({ at: nowISO(), note: `Step done: ${s.text}` }));
  if (old.status !== t.status)
    t.log.push({ at: nowISO(), note: `Status: ${STATUS_LABEL[old.status] || "—"} → ${STATUS_LABEL[t.status]}` });
  if ((+old.progress || 0) !== t.progress)
    t.log.push({ at: nowISO(), note: `Progress ${+old.progress || 0}% → ${t.progress}%` });
  if (t.bottleneck && t.bottleneck !== old.bottleneck)
    t.log.push({ at: nowISO(), note: `Bottleneck: ${t.bottleneck}` });
  if (t.impact && t.impact !== old.impact) t.log.push({ at: nowISO(), note: `Result: ${t.impact}` });
  const justDone = t.status === "done" && old.status !== "done";
  if (justDone) t.doneAt = nowISO();
  if (t.status !== "done") t.doneAt = "";
  t.updatedAt = nowISO();
  if (t.log.length > 200) t.log = t.log.slice(-200);
  if (justDone && S.timer && S.timer.ref === t.id) hub.stopTimer(false);
  put("tasks", t.id, strip(t));
  $("#dlg").close();
  if (justDone && t.repeat && t.repeat !== "none") {
    const due = nextDue(t.due || todayKey(), t.repeat),
      id = newId();
    put("tasks", id, {
      title: t.title,
      desc: t.desc || "",
      category: t.category || "",
      urgency: t.urgency,
      status: "todo",
      progress: 0,
      bottleneck: "",
      assignedBy: t.assignedBy || "",
      due,
      repeat: t.repeat,
      notes: t.notes || "",
      links: t.links || [],
      subtasks: (t.subtasks || []).map((s) => ({ id: newSubId(), text: s.text, done: false })),
      impact: "",
      createdAt: nowISO(),
      updatedAt: nowISO(),
      doneAt: "",
      log: [{ at: nowISO(), note: `Task added (repeats ${(REPEAT_SHORT[t.repeat] || "").toLowerCase()})` }],
    });
    toast("Done. Next one added for " + fmtDate(due));
  } else toast("Saved");
}

export { editing, newSubId, openTask, readTaskForm, redrawKeep };
