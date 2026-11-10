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
import { fromPlain, rteHTML, rteVal, toPlain } from "./rte.js";

// ---------- task editor
let editing = null,
  confirmDel = false,
  logSt = "";
const LOG_ST = [
  ["todo", "Not started"],
  ["doing", "In progress"],
  ["done", "Completed"],
];
const LOG_ST_LABEL = Object.fromEntries(LOG_ST);
const rich = (t, k) => t[k + "Html"] || fromPlain(t[k] || "");
// a log entry's kind, from what it says
const logKind = (n) =>
  /^Progress \d/.test(n) ? ["prog", "Progress"]
  : /^Status:/.test(n) ? ["stat", "Status"]
  : /^Step done/.test(n) ? ["step", "Step"]
  : /^Bottleneck solved/.test(n) ? ["solved", "Solved"]
  : /^Bottleneck/.test(n) ? ["block", "Bottleneck"]
  : /^Result/.test(n) ? ["res", "Result"]
  : /^Logged \d|^Timer|^Focus/.test(n) ? ["time", "Time"]
  : /^Task added/.test(n) ? ["new", "Added"]
  : ["upd", "Update"];
const stripKind = (n) => n.replace(/^(Bottleneck solved|Bottleneck|Result|Step done):\s*/, "");
function drawLog(t) {
  const L = t.log.map((l, i) => ({ l, i })).sort((a, b) => (b.l.at || "").localeCompare(a.l.at || ""));
  if (!L.length) return '<p class="small muted plg-empty">No updates yet. Log what you did, what you\'re waiting on, or a decision you made.</p>';
  let day = "",
    h = "";
  L.forEach(({ l, i }) => {
    const d = isoDay(l.at);
    if (d !== day) {
      if (day) h += "</ol>";
      h += `<div class="plg-day">${esc(d === todayKey() ? "Today" : fmtDate(d))}</div><ol class="plog">`;
      day = d;
    }
    const [k, kl] = logKind(l.note || "");
    h += `<li class="plg-${k}"><span class="plg-dot" aria-hidden="true"></span><div class="plg-body">
      <div class="plg-head"><time>${fmtTime(l.at)}</time><span class="plg-kind">${kl}</span>${l.status ? `<span class="plg-st st-${esc(l.status)}">${esc(LOG_ST_LABEL[l.status] || l.status)}</span>` : ""}<button type="button" class="x tl-ed" data-logedit="${i}" aria-label="Edit this update" title="Edit time or text">${SVG(ICON.edit)}</button></div>
      <div class="plg-note">${k === "upd" || k === "new" || k === "time" || k === "prog" || k === "stat" ? esc(l.note) : esc(stripKind(l.note))}</div>
      ${l.memo ? `<div class="plg-memo">${esc(l.memo)}</div>` : ""}</div></li>`;
  });
  return h + "</ol>";
}
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
  logSt = "";
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
    <div class="f"><span class="flab">Description</span>${rteHTML("t-desc", rich(t, "desc"), "What exactly was asked, expected output, where the data is")}</div>
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
    <fieldset class="bn-box ${t.bnSolved ? "solved" : ""}"><legend>Bottleneck</legend>
      <label class="f">What's in the way<textarea id="t-block" placeholder="Waiting for data, access, clarification…" rows="2" style="min-height:52px">${esc(t.bottleneck)}</textarea></label>
      <div class="f bn-q"><span class="flab">Have I solved it?</span><div class="seg" id="t-bnsolved"><button type="button" data-v="0" aria-pressed="${!t.bnSolved}">Not yet</button><button type="button" data-v="1" aria-pressed="${!!t.bnSolved}">Solved</button></div></div>
      ${t.bnSolved ? `<label class="f">How I solved it<textarea id="t-bnhow" rows="2" style="min-height:52px" placeholder="e.g. Asked IT for read access, used the backup sheet meanwhile">${esc(t.bnHow || "")}</textarea></label>` : ""}
    </fieldset>
    <div class="f"><span class="flab">Result / impact <span class="muted" style="font-weight:400">· shows on your resume bullets</span></span>${rteHTML("t-impact", rich(t, "impact"), "e.g. Cut report time from 2 hours to 20 minutes", "short")}</div>
    <div class="f"><span class="flab">Notes <span class="muted" style="font-weight:400">· SQL queries, file paths, meeting notes</span></span>${rteHTML("t-notes", rich(t, "notes"), "SELECT batch_id, COUNT(*) FROM production GROUP BY batch_id HAVING COUNT(*) > 1;", "mono")}</div>
    <div class="f" style="display:grid;gap:6px"><span class="small muted" style="font-weight:600">Links</span>
      ${t.links.length ? `<ul class="links">${t.links.map((l, i) => `<li>${SVG(ICON.link)}<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)}</a><button type="button" class="x tl-ed" data-linkedit="${i}" aria-label="Edit link" title="Edit">${SVG(ICON.edit)}</button><button type="button" class="x" data-linkdel="${i}" aria-label="Remove link">✕</button></li>`).join("")}</ul>` : ""}
      <div class="qrow rwrap"><input id="t-linkurl" type="url" placeholder="Paste a link (shared drive, sheet, ticket)" class="inp"><input id="t-linklabel" placeholder="Name (optional)" class="inp" style="max-width:180px"><button class="btn sm" type="button" id="t-linkadd">Add link</button></div></div>
    <section class="plg-wrap"><div class="plg-top"><span class="flab">Progress log</span><span class="small muted">${t.log.length} entr${t.log.length === 1 ? "y" : "ies"}</span></div>
      <div class="plg-add">
        <input id="t-note" placeholder="Add an update, e.g. Finished joining the sales tables" class="inp" aria-label="Update">
        <textarea id="t-memo" rows="2" class="inp" placeholder="Memo or notes (optional)" aria-label="Memo"></textarea>
        <div class="plg-add-row"><div class="seg sm" id="t-logst" aria-label="Status of this update">${LOG_ST.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${logSt === v}">${l}</button>`).join("")}</div><button class="btn sm primary" type="button" id="t-addnote">Log update</button></div>
      </div>
      ${drawLog(t)}</section>
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
  t.descHtml = rteVal("t-desc");
  t.desc = toPlain(t.descHtml);
  t.category = $("#t-cat").value;
  t.due = $("#t-due").value;
  t.assignedBy = $("#t-by").value.trim();
  if (!(t.subtasks || []).length) t.progress = +$("#t-prog").value;
  t.bottleneck = $("#t-block").value.trim();
  if ($("#t-bnhow")) t.bnHow = $("#t-bnhow").value.trim();
  t.repeat = $("#t-repeat").value;
  t.impactHtml = rteVal("t-impact");
  t.impact = toPlain(t.impactHtml)
    .split("\n")
    .map((x) => x.replace(/^(• |\d+\. )/, "").trim())
    .filter(Boolean)
    .join("; ");
  t.notesHtml = rteVal("t-notes");
  t.notes = toPlain(t.notesHtml);
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
  } else if (b.parentElement.id === "t-bnsolved") {
    readTaskForm();
    editing.bnSolved = b.dataset.v === "1";
    if (editing.bnSolved && editing.status === "blocked") editing.status = "doing";
    redrawKeep(editing.bnSolved ? "t-bnhow" : null);
  } else if (b.parentElement.id === "t-logst") {
    logSt = logSt === b.dataset.v ? "" : b.dataset.v;
    b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === logSt));
  } else if (b.id === "t-addnote") {
    readTaskForm();
    const e = pendingLog();
    if (e) {
      editing.log.push(e);
      logSt = "";
      redrawKeep("t-note");
    }
  } else if (b.dataset.logedit !== undefined) {
    readTaskForm();
    const i = +b.dataset.logedit,
      l = editing.log[i];
    if (!l) return;
    const dt = new Date(l.at);
    hub.editDlg(
      "Edit update",
      [
        { k: "date", label: "Date", type: "date", value: isoDay(l.at) },
        { k: "time", label: "Time", type: "time", value: fmtTime(l.at) },
        { k: "note", label: "Update", type: "textarea", value: l.note || "" },
        { k: "status", label: "Status", type: "select", value: l.status || "", options: [["", "—"], ...LOG_ST] },
        { k: "memo", label: "Memo / notes", type: "textarea", value: l.memo || "" },
      ],
      (v) => {
        const at = v.date ? new Date(`${v.date}T${v.time || pad2(dt.getHours()) + ":" + pad2(dt.getMinutes())}`) : dt;
        const e = { ...l, at: isNaN(at) ? l.at : at.toISOString(), note: v.note || l.note };
        if (v.status) e.status = v.status;
        else delete e.status;
        if (v.memo) e.memo = v.memo;
        else delete e.memo;
        editing.log[i] = e;
        editing.log.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
        redrawKeep();
      },
      () => {
        editing.log.splice(i, 1);
        redrawKeep();
      },
    );
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
const pad2 = (n) => String(n).padStart(2, "0");
function pendingLog() {
  const n = ($("#t-note")?.value || "").trim(),
    m = ($("#t-memo")?.value || "").trim();
  if (!n && !m) return null;
  const e = { at: nowISO(), note: n || m.split("\n")[0].slice(0, 80) };
  if (m && n) e.memo = m;
  if (logSt) e.status = logSt;
  return e;
}
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
  const pending = pendingLog();
  if (pending) t.log.push(pending);
  logSt = "";
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
  if (t.bottleneck && t.bnSolved && !old.bnSolved)
    t.log.push({ at: nowISO(), note: `Bottleneck solved: ${t.bottleneck}`, ...(t.bnHow ? { memo: "How: " + t.bnHow } : {}) });
  if (!t.bottleneck) {
    t.bnSolved = false;
    t.bnHow = "";
  }
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
      descHtml: t.descHtml || "",
      category: t.category || "",
      urgency: t.urgency,
      status: "todo",
      progress: 0,
      bottleneck: "",
      assignedBy: t.assignedBy || "",
      due,
      repeat: t.repeat,
      notes: t.notes || "",
      notesHtml: t.notesHtml || "",
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
