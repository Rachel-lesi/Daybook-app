// Study notes and resources, assignment links and portfolio
import { hub } from "./registry.js";
import {
  $,
  ICON,
  S,
  SVG,
  catName,
  del,
  esc,
  fmtDate,
  isoDay,
  newId,
  nowISO,
  pad,
  put,
  saveCats,
  strip,
  toast,
  todayKey,
} from "./core.js";
import { asgTime, fmtMins } from "./today.js";
import { EXPORT_CSS } from "./archive.js";
import { ASG_ST, ASG_TYPES, subjOptions } from "./study.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  NOTE_TAGS: { get: () => NOTE_TAGS, enumerable: true },
  asgGroups: { get: () => asgGroups, enumerable: true },
  asgItem: { get: () => asgItem, enumerable: true },
  asgTodoLi: { get: () => asgTodoLi, enumerable: true },
  asgTodos: { get: () => asgTodos, enumerable: true },
  curSubjects: { get: () => curSubjects, enumerable: true },
  dateHints: { get: () => dateHints, enumerable: true },
  folderLabel: { get: () => folderLabel, enumerable: true },
  isCur: { get: () => isCur, enumerable: true },
  nKey: { get: () => nKey, enumerable: true },
  renderNotes: { get: () => renderNotes, enumerable: true },
  renderPortfolio: { get: () => renderPortfolio, enumerable: true },
});

// ---------- Study notes & resources, links on assignments, portfolio
S.snotes = [];
S.curSem = "";
S.noteSubj = "";
S.noteKind = "note";
S.noteTag = "lecture";
S.noteEdit = null;
S.noteOpen = null;
S.noteDel = null;
S.pfSubj = "";
S.pfSkill = "";
S.pfOpen = null;
const NOTE_TAGS = [
  ["lecture", "Lecture notes"],
  ["summary", "Summary"],
  ["formula", "Formulas"],
  ["tutorial", "Tutorial"],
  ["pastpaper", "Past paper"],
  ["slides", "Slides"],
  ["reading", "Reading"],
  ["tips", "Tips"],
  ["other", "Other"],
];
const isCur = (s) => (s.sem || "") === (S.curSem || "");
const curSubjects = () => S.subjects.filter(isCur);
const linkUrl = (u) => (/^https?:\/\//i.test(u) ? u : "https://" + u);
const hostOf = (u) => {
  try {
    return new URL(linkUrl(u)).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};
function asgLinks(a) {
  const L = (a.links || []).slice();
  if (a.link && !L.some((l) => l.url === a.link)) L.unshift({ url: a.link, label: "" });
  return L;
}
function linksEditor(kind, id, links) {
  return `<div class="f lk"><span class="small muted" style="font-weight:600">Files & links <span style="font-weight:400">· Google Drive, OneDrive, slides, briefs, submissions</span></span>
    ${links.length ? `<ul class="links">${links.map((l, i) => `<li>${SVG(ICON.link)}<a href="${esc(linkUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label || hostOf(l.url))}</a><button type="button" class="x" data-link-del="${kind}:${esc(id)}:${i}" aria-label="Remove link">✕</button></li>`).join("")}</ul>` : ""}
    <div class="qrow rwrap"><input class="inp" data-link-url="${kind}:${esc(id)}" placeholder="Paste a link" inputmode="url"><input class="inp" data-link-label="${kind}:${esc(id)}" placeholder="Name (optional)" style="max-width:170px"><button class="btn sm" type="button" data-link-add="${kind}:${esc(id)}">Add link</button></div></div>`;
}
function asgDetail(a) {
  const done = ["submitted", "graded"].includes(a.status);
  return `${
    done
      ? `<div class="pf-prompt"><label class="f">What did you learn? <span class="muted" style="font-weight:400">· saved to your Portfolio</span><textarea data-asg-learned="${esc(a.id)}" rows="3" placeholder="Key takeaways, what was hard, what you'd do differently, what you're proud of">${esc(a.learned || "")}</textarea></label>
      <label class="f">Skills used <span class="muted" style="font-weight:400">· separate with commas</span><input data-asg-skills="${esc(a.id)}" value="${esc((a.skills || []).join(", "))}" placeholder="e.g. SQL, k-means clustering, report writing, teamwork"></label></div>`
      : ""
  }
    <label class="f">Notes<textarea data-asg-notes="${esc(a.id)}" rows="4" placeholder="Requirements, rubric, group members, approach, feedback from lecturer…">${esc(a.notes || "")}</textarea></label>
    ${linksEditor("asg", a.id, asgLinks(a))}
    ${a.parent ? `<p class="small muted" style="margin:0">Part of <b>${esc((S.asg.find((x) => x.id === a.parent) || {}).title || "")}</b></p>` : `<div class="f"><span class="small muted" style="font-weight:600">Parts <span style="font-weight:400">· split it into pieces, e.g. Coding, Report, Video</span></span><div class="qrow part-row"><input class="inp" data-part-title="${esc(a.id)}" placeholder="Add a part, e.g. Coding"><input type="date" class="inp" data-part-due="${esc(a.id)}" value="${esc(a.due || "")}" aria-label="Part due date"><button class="btn sm" type="button" data-part-add="${esc(a.id)}">Add part</button></div></div>`}
    <div class="row"><button type="button" class="btn sm" data-asg-edit="${esc(a.id)}">${SVG(ICON.edit)}Edit details</button><button type="button" class="btn sm ghost danger" data-asg-del="${esc(a.id)}">${S.asgDel === a.id ? "Tap again to delete" : "Delete"}</button></div>`;
}
// ----- one assignment card, and parts grouped under their main assignment
function asgItem(a, kids) {
  const [dt, cls] = hub.dueText(a),
    open = S.asgOpen === a.id;
  if (S.asgEdit === a.id) return asgEditForm(a);
  const tds = asgTodos(a.id);
  kids = [...(kids || []), ...tds.map((t) => ({ status: t.done ? "submitted" : "todo" }))];
  const kd = kids.filter((k) => ["submitted", "graded"].includes(k.status)).length;
  return `<div class="asg ${cls} st-${esc(a.status)} ${a.parent ? "is-part" : ""}"><div class="asg-main" data-asg-open="${esc(a.id)}" role="button" tabindex="0">
        <span class="asg-stripe ${hub.subjCls(a.subj)}"></span>
        <div class="asg-body"><div class="asg-t"><b>${esc(a.title)}</b>${a.weight ? `<span class="asg-w">${esc(a.weight)}%</span>` : ""}</div>
          <div class="line"><span class="tag ${hub.subjCls(a.subj)}">${esc(hub.subjLabel(a.subj))}</span><span class="small">${esc((ASG_TYPES.find((x) => x[0] === a.type) || ["", ""])[1])}</span><span class="asg-due ${cls}">${esc(dt)}</span>${asgTime(a) ? `<span class="asg-time" title="Time spent, including parts and linked to-dos">⏱ ${fmtMins(asgTime(a))}</span>` : ""}${kids.length ? `<span class="asg-parts">${kd}/${kids.length} done</span>` : ""}${a.status === "graded" && a.mark !== "" && a.mark != null ? `<span class="asg-mark">${esc(a.mark)}%</span>` : ""}</div></div></div>
        <div class="seg asg-st">${ASG_ST.map(([v, l]) => `<button type="button" data-asg-st="${esc(a.id)}:${v}" aria-pressed="${a.status === v}">${l}</button>`).join("")}</div>
        ${
          open || a.status === "graded"
            ? `<div class="asg-more">
          ${a.status === "graded" ? `<label class="f">Mark (%)<input type="number" min="0" max="100" step="0.1" data-asg-mark="${esc(a.id)}" value="${esc(a.mark ?? "")}" placeholder="e.g. 85"></label>` : ""}
          ${open ? asgDetail(a) : `<button type="button" class="btn sm ghost" data-asg-open="${esc(a.id)}">Notes, files & what you learned</button>`}</div>`
            : ""
        }</div>`;
}
const asgTodos = (id) =>
  S.todos
    .filter((t) => t.kind === "study" && t.asg === id)
    .sort((a, b) => a.done - b.done || (a.date || "").localeCompare(b.date || ""));
function asgTodoLi(t) {
  const tk = todayKey();
  return `<li class="${t.done ? "done" : ""}"><input type="checkbox" data-todo="${esc(t.id)}" ${t.done ? "checked" : ""} aria-label="Done: ${esc(t.title)}"><span class="grow"><span>${esc(t.title)}</span><div class="sub ${t.date && t.date < tk && !t.done ? "overdue" : ""}">To-do${t.date ? " · " + esc(fmtDate(t.date)) : ""}</div></span><button class="x tl-ed" type="button" data-todoedit="${esc(t.id)}" aria-label="Edit">${SVG(ICON.edit)}</button><button class="x" type="button" data-deltodo="${esc(t.id)}" aria-label="Delete">✕</button></li>`;
}
function asgGroups(list) {
  const ids = new Set(S.asg.map((a) => a.id)),
    top = [],
    seen = new Set();
  list.forEach((a) => {
    const pid = a.parent && ids.has(a.parent) ? a.parent : null;
    const root = pid ? S.asg.find((x) => x.id === pid) : a;
    if (seen.has(root.id)) return;
    seen.add(root.id);
    const kids = S.asg
      .filter((k) => k.parent === root.id && (list.includes(k) || list.includes(root)))
      .sort((x, y) => ((x.due || "9999") + (x.time || "")).localeCompare((y.due || "9999") + (y.time || "")));
    top.push({ a: root, kids });
  });
  return top;
}
// ----- edit an assignment
S.asgEdit = null;
S.asgEType = "assignment";
function asgEditForm(a) {
  return `<form class="asg asg-editing st-form" id="asg-edit-form" data-id="${esc(a.id)}" autocomplete="off">
    <div class="small"><b>Edit</b></div>
    <div class="asg-row1"><select id="ae-subj" class="inp">${subjOptions(a.subj)}</select><input id="ae-title" class="inp" value="${esc(a.title)}" required></div>
    <div class="qa-chips cwrap">${ASG_TYPES.map(([v, l]) => `<button type="button" class="qc" data-asge-type="${v}" aria-pressed="${S.asgEType === v}">${l}</button>`).join("")}</div>
    <div class="asg-row2"><label class="f">Due date<input type="date" id="ae-due" data-dhint value="${esc(a.due || "")}"><span class="dhint"></span></label><label class="f">Time<input type="time" id="ae-time" value="${esc(a.time || "")}"></label><label class="f">Weight %<input type="number" id="ae-weight" min="0" max="100" value="${esc(a.weight ?? "")}"></label></div>
    ${(() => {
      const kidsOf = S.asg.filter((x) => x.parent === a.id).length,
        opts = S.asg
          .filter((x) => x.id !== a.id && !x.parent)
          .sort((x, y) => (x.subj === a.subj ? 0 : 1) - (y.subj === a.subj ? 0 : 1) || x.title.localeCompare(y.title));
      return kidsOf
        ? `<p class="small muted" style="margin:0">This is a main assignment with ${kidsOf} part${kidsOf === 1 ? "" : "s"}.</p>`
        : `<label class="f">Part of <span class="muted">(optional)</span><select id="ae-parent" class="inp"><option value="">Not part of another assignment</option>${opts.map((x) => `<option value="${esc(x.id)}" ${a.parent === x.id ? "selected" : ""}>${esc(hub.subjLabel(x.subj))} · ${esc(x.title)}</option>`).join("")}</select></label>`;
    })()}
    <div class="row"><button class="btn sm primary" type="submit">Save</button><button class="btn sm" type="button" data-asg-edit-x>Cancel</button></div></form>`;
}
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("[data-asg-edit],[data-asg-edit-x],[data-asge-type],[data-dswap]");
  if (!t || !t.closest("#v-study")) return;
  const d = t.dataset;
  if (d.asgEdit) {
    const a = S.asg.find((x) => x.id === d.asgEdit);
    if (!a) return;
    S.asgEdit = a.id;
    S.asgEType = a.type || "assignment";
    hub.renderStudy();
    dateHints();
    $("#ae-title") && $("#ae-title").focus();
  } else if (d.asgEditX !== undefined) {
    S.asgEdit = null;
    hub.renderStudy();
    dateHints();
  } else if (d.asgeType) {
    S.asgEType = d.asgeType;
    t.parentElement.querySelectorAll("[data-asge-type]").forEach((b) => b.setAttribute("aria-pressed", b === t));
  } else if (d.dswap) {
    const inp = t.closest("label").querySelector("input[type=date]");
    inp.value = d.dswap;
    dateHint(inp);
  }
});
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-part-add]");
  if (!b) return;
  const p = S.asg.find((x) => x.id === b.dataset.partAdd),
    inp = document.querySelector(`[data-part-title="${b.dataset.partAdd}"]`),
    ti = ((inp && inp.value) || "").trim();
  if (!p || !ti) {
    inp && inp.focus();
    return;
  }
  const pd = document.querySelector(`input[data-part-due="${b.dataset.partAdd}"]`);
  put("assignments", newId(), {
    subj: p.subj,
    title: ti,
    type: p.type || "assignment",
    due: (pd && pd.value) || p.due || "",
    time: p.time || "",
    weight: "",
    status: "todo",
    mark: "",
    notes: "",
    link: "",
    parent: p.id,
    createdAt: nowISO(),
    doneAt: "",
  });
  toast("Part added");
  setTimeout(() => {
    const n = document.querySelector(`[data-part-title="${p.id}"]`);
    if (n) n.focus();
  }, 60);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.dataset && e.target.dataset.partTitle) {
    e.preventDefault();
    document.querySelector(`[data-part-add="${e.target.dataset.partTitle}"]`).click();
  }
});
document.addEventListener(
  "submit",
  (e) => {
    if (e.target.id !== "asg-edit-form") return;
    e.preventDefault();
    const a = S.asg.find((x) => x.id === e.target.dataset.id),
      ti = $("#ae-title").value.trim();
    if (!a || !ti) return;
    put("assignments", a.id, {
      ...strip(a),
      subj: $("#ae-subj").value || a.subj,
      title: ti,
      type: S.asgEType,
      due: $("#ae-due").value,
      time: $("#ae-time").value,
      weight: $("#ae-weight").value ? +$("#ae-weight").value : "",
      parent: $("#ae-parent") ? $("#ae-parent").value : a.parent || "",
    });
    S.asgEdit = null;
    toast("Assignment updated");
  },
  true,
);
// ----- readable due date under date boxes, and a fix when day and month were typed the other way round
function dateHint(inp) {
  const h = (inp.closest("label") || inp.parentElement).querySelector(".dhint");
  if (!h) return;
  const v = inp.value,
    tk = todayKey();
  if (!v) {
    h.innerHTML = "";
    return;
  }
  const [y, m, dd] = v.split("-").map(Number),
    sw = m !== dd && dd <= 12 ? `${y}-${pad(dd)}-${pad(m)}` : null;
  const past = v < tk,
    swapOk = sw && sw >= tk && (!past || true);
  h.innerHTML = `<span class="${past ? "dh-past" : ""}">${esc(fmtDate(v))} ${y}${past ? " · in the past" : ""}</span>${past && swapOk ? ` <button type="button" class="linkbtn" data-dswap="${sw}">Did you mean ${esc(fmtDate(sw))}?</button>` : ""}`;
}
function dateHints() {
  document.querySelectorAll("#v-study input[data-dhint]").forEach(dateHint);
}
document.addEventListener("input", (e) => {
  if (e.target.matches && e.target.matches("input[data-dhint]")) dateHint(e.target);
});
document.addEventListener("change", (e) => {
  if (e.target.matches && e.target.matches("input[data-dhint]")) dateHint(e.target);
});
// ----- notes subtab
// ----- notes: a folder for each university unit and each self-study course
S.noteSpace = "uni";
S.noteTagF = "";
const nKey = (n) => (n.course ? "c:" + n.course : "s:" + (n.subj || ""));
const folderLabel = (k) =>
  k.startsWith("c:") ? (S.courses.find((c) => "c:" + c.id === k) || {}).name || "Course" : hub.subjLabel(k.slice(2));
function noteFolders(space) {
  if (space === "uni")
    return [...curSubjects(), ...S.subjects.filter((s) => !isCur(s))].map((s) => ({
      k: "s:" + s.id,
      code: s.code || s.name,
      name: s.code ? s.name : "",
      past: !isCur(s),
      sem: s.sem || "",
      cls: hub.subjCls(s.id),
    }));
  return S.courses.map((c, i) => ({
    k: "c:" + c.id,
    code: c.name,
    name: (c.skills || []).map((t) => catName(t).split(/\s*\/\s*/)[0]).join(", "),
    past: false,
    cls: "ci-" + (i % 6),
  }));
}
function noteCard(n, showFolder) {
  const open = S.noteOpen === n.id,
    long = (n.body || "").length > 220;
  return `<article class="note ${n.kind === "link" ? "is-link" : ""}"><div class="nt-top">${showFolder ? `<span class="tag ${n.course ? "" : hub.subjCls(n.subj)}">${esc(folderLabel(nKey(n)))}</span>` : ""}<span class="hl-tag">${esc((NOTE_TAGS.find((t) => t[0] === n.tag) || ["", "Note"])[1])}</span><span class="small muted">${esc(fmtDate(isoDay(n.updatedAt || n.createdAt)))}</span></div>
    <h4>${n.kind === "link" ? `${SVG(ICON.link)}<a href="${esc(linkUrl(n.url || ""))}" target="_blank" rel="noopener">${esc(n.title)}</a> <span class="small muted">${esc(hostOf(n.url || ""))}</span>` : esc(n.title)}</h4>
    ${n.body ? `<div class="nt-body ${open || !long ? "" : "clip"}">${esc(n.body)}</div>${long ? `<button type="button" class="btn sm ghost" data-note-open="${esc(n.id)}">${open ? "Show less" : "Read more"}</button>` : ""}` : ""}
    <div class="nt-act"><button type="button" class="btn sm ghost" data-note-edit="${esc(n.id)}">Edit</button><button type="button" class="btn sm ghost danger" data-note-del="${esc(n.id)}">${S.noteDel === n.id ? "Tap again to delete" : "Delete"}</button></div></article>`;
}
function renderNotes() {
  const box = $("#st-notes");
  if (!box) return;
  const uni = S.noteSpace === "uni",
    folders = noteFolders(S.noteSpace),
    byK = (k) => S.snotes.filter((n) => nKey(n) === k);
  if (
    S.noteSubj &&
    !noteFolders("uni")
      .concat(noteFolders("self"))
      .some((f) => f.k === S.noteSubj)
  )
    S.noteSubj = "";
  if (S.noteSubj) S.noteSpace = S.noteSubj.startsWith("c:") ? "self" : "uni";
  $("#notes-h").textContent = S.noteSpace === "self" ? "Course notes" : "Unit notes";
  $("#notes-meta").textContent =
    S.noteSpace === "self" ? "A folder for each self-study course" : "A folder for each university unit";
  const space = "";
  if (!S.noteSubj) {
    const card = (f) => {
      const ns = byK(f.k),
        last = ns
          .map((n) => n.updatedAt || n.createdAt || "")
          .sort()
          .pop();
      return `<button type="button" class="nfolder" data-note-subj="${esc(f.k)}"><span class="nf-ic ${f.cls}">${SVG(ICON.folder)}</span><span class="nf-t"><b>${esc(f.code)}</b>${f.name ? `<span class="small muted">${esc(f.name)}</span>` : ""}</span><span class="small muted nf-n">${ns.filter((n) => n.kind !== "link").length} notes · ${ns.filter((n) => n.kind === "link").length} links${last ? `<br>Updated ${esc(fmtDate(isoDay(last)))}` : ""}</span></button>`;
    };
    const cur = folders.filter((f) => !f.past),
      past = folders.filter((f) => f.past);
    const recent = S.snotes
      .filter((n) => (uni ? !n.course : n.course))
      .sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""))
      .slice(0, 4);
    box.innerHTML =
      space +
      (!folders.length
        ? `<p class="small muted" style="margin:0">${uni ? "Add your subjects in Timetable to get a folder for each unit." : "Add a course in Study → Courses to get a notes folder for it."}</p>`
        : `<div class="nfolders">${cur.map(card).join("")}</div>${past.length ? `<div class="small muted" style="font-weight:600">Past semesters</div><div class="nfolders">${past.map(card).join("")}</div>` : ""}
        ${recent.length ? `<div class="small muted" style="font-weight:600;margin-top:4px">Recently updated</div><div class="notes">${recent.map((n) => noteCard(n, true)).join("")}</div>` : ""}`);
    return;
  }
  const k = S.noteSubj,
    all = byK(k).sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""));
  const tags = NOTE_TAGS.filter(([v]) => all.some((n) => (n.tag || "other") === v));
  if (S.noteTagF && !tags.some((t) => t[0] === S.noteTagF)) S.noteTagF = "";
  const list = S.noteTagF ? all.filter((n) => (n.tag || "other") === S.noteTagF) : all;
  const ed = S.noteEdit && S.snotes.find((n) => n.id === S.noteEdit);
  const kind = ed ? ed.kind : S.noteKind,
    tag = ed ? ed.tag : S.noteTag;
  const asgFor = k.startsWith("s:")
    ? S.asg.filter((a) => a.subj === k.slice(2) && (a.notes || asgLinks(a).length))
    : [];
  const groups = S.noteTagF
    ? [[S.noteTagF, list]]
    : tags.map(([v]) => [v, list.filter((n) => (n.tag || "other") === v)]);
  const allF = [...noteFolders("uni"), ...noteFolders("self")];
  box.innerHTML =
    space +
    `
    <div class="arc-crumbs"><button type="button" class="crumb" data-note-subj="">${uni ? "All units" : "All courses"}</button><span class="muted">›</span><b>${esc(folderLabel(k))}</b><span class="muted small">${all.length} item${all.length === 1 ? "" : "s"}</span></div>
    ${tags.length > 1 ? `<div class="qa-chips cwrap"><button type="button" class="qc" data-note-tagf="" aria-pressed="${!S.noteTagF}">All</button>${tags.map(([v, l]) => `<button type="button" class="qc" data-note-tagf="${v}" aria-pressed="${S.noteTagF === v}">${l} <span class="muted">${all.filter((n) => (n.tag || "other") === v).length}</span></button>`).join("")}</div>` : ""}
    <form id="note-form" class="st-form" autocomplete="off">
      <div class="row"><div class="seg">${[
        ["note", "Note"],
        ["link", "Link / file"],
      ]
        .map(([v, l]) => `<button type="button" data-note-kind="${v}" aria-pressed="${kind === v}">${l}</button>`)
        .join("")}</div>
        ${
          ed
            ? `<select id="nt-folder" class="inp" style="max-width:260px" aria-label="Folder"><optgroup label="University units">${noteFolders(
                "uni",
              )
                .map((f) => `<option value="${esc(f.k)}" ${nKey(ed) === f.k ? "selected" : ""}>${esc(f.code)}</option>`)
                .join("")}</optgroup><optgroup label="Self-study courses">${noteFolders("self")
                .map((f) => `<option value="${esc(f.k)}" ${nKey(ed) === f.k ? "selected" : ""}>${esc(f.code)}</option>`)
                .join("")}</optgroup></select>`
            : `<span class="small muted">Saving to <b>${esc(folderLabel(k))}</b></span>`
        }</div>
      <input id="nt-title" class="inp" placeholder="${kind === "link" ? "Name, e.g. Week 5 slides, Lab sheet 3" : "Title, e.g. Week 5: Decision trees"}" value="${esc(ed ? ed.title : "")}" required>
      ${kind === "link" ? `<input id="nt-url" class="inp" inputmode="url" placeholder="Paste the link (Google Drive, OneDrive, Canva, YouTube, LMS…)" value="${esc(ed ? ed.url || "" : "")}">` : ""}
      <textarea id="nt-body" class="inp" rows="${kind === "link" ? 2 : 6}" placeholder="${kind === "link" ? "What's in it? (optional)" : "Your notes: key points, definitions, examples, questions to ask…"}">${esc(ed ? ed.body || "" : "")}</textarea>
      <div class="qa-chips cwrap">${NOTE_TAGS.map(([v, l]) => `<button type="button" class="qc" data-note-tag="${v}" aria-pressed="${tag === v}">${l}</button>`).join("")}</div>
      <div class="row"><button class="btn sm primary" type="submit">${ed ? "Save changes" : kind === "link" ? "Save link" : "Save note"}</button>${ed ? `<button class="btn sm" type="button" data-note-cancel>Cancel</button>` : ""}</div>
    </form>
    ${
      list.length
        ? groups
            .filter((g) => g[1].length)
            .map(
              ([v, ns]) =>
                `<div class="ng-h small"><b>${esc((NOTE_TAGS.find((t) => t[0] === v) || ["", "Other"])[1])}</b> <span class="muted">${ns.length}</span></div><div class="notes">${ns.map((n) => noteCard(n, false)).join("")}</div>`,
            )
            .join("")
        : `<p class="empty" style="margin:0">Nothing in this folder yet. Add your first note or link above.</p>`
    }
    ${
      asgFor.length
        ? `<div class="ng-h small"><b>From this unit's assignments</b></div><div class="notes">${asgFor
            .map(
              (a) =>
                `<article class="note"><div class="nt-top"><span class="hl-tag">${esc((ASG_TYPES.find((x) => x[0] === a.type) || ["", ""])[1])}</span><b>${esc(a.title)}</b></div>${a.notes ? `<div class="nt-body clip">${esc(a.notes)}</div>` : ""}${
                  asgLinks(a).length
                    ? `<ul class="links">${asgLinks(a)
                        .map(
                          (l) =>
                            `<li>${SVG(ICON.link)}<a href="${esc(linkUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label || hostOf(l.url))}</a><span></span></li>`,
                        )
                        .join("")}</ul>`
                    : ""
                }</article>`,
            )
            .join("")}</div>`
        : ""
    }`;
}
// ----- portfolio subtab
function pfItems() {
  return S.asg
    .filter((a) => ["submitted", "graded"].includes(a.status))
    .sort((a, b) => (b.doneAt || b.due || "").localeCompare(a.doneAt || a.due || ""));
}
function renderPortfolio() {
  const box = $("#st-pf");
  if (!box) return;
  let items = pfItems();
  const skills = {};
  items.forEach((a) =>
    (a.skills || []).forEach((s) => {
      const k = s.trim();
      if (k) skills[k] = (skills[k] || 0) + 1;
    }),
  );
  if (S.pfSubj) items = items.filter((a) => a.subj === S.pfSubj);
  if (S.pfSkill)
    items = items.filter((a) => (a.skills || []).some((s) => s.trim().toLowerCase() === S.pfSkill.toLowerCase()));
  const marks = pfItems()
    .filter((a) => a.status === "graded" && a.mark !== "" && a.mark != null)
    .map((a) => +a.mark);
  const withLearn = pfItems().filter((a) => (a.learned || "").trim()).length;
  const bySem = {};
  items.forEach((a) => {
    const s = hub.subj(a.subj);
    const k = (s && s.sem) || "Earlier work";
    (bySem[k] = bySem[k] || []).push(a);
  });
  const semKeys = Object.keys(bySem).sort((a, b) => (b === S.curSem) - (a === S.curSem) || b.localeCompare(a));
  box.innerHTML = !pfItems().length
    ? `<p class="small muted" style="margin:0">When you mark an assignment <b>Submitted</b> or <b>Graded</b>, it's saved here with what you learned and the skills you used, so you can look back before exams and interviews.</p>`
    : `
    <div class="minis"><div class="mini"><span>Completed</span><b>${pfItems().length}</b><small>assignments, tests & projects</small></div>
      <div class="mini"><span>Average mark</span><b>${marks.length ? (marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(1) + "%" : "–"}</b><small>${marks.length} graded</small></div>
      <div class="mini"><span>Reflections</span><b>${withLearn}/${pfItems().length}</b><small>${withLearn < pfItems().length ? "add what you learned" : "all written"}</small></div></div>
    ${
      Object.keys(skills).length
        ? `<div class="pf-skills"><span class="small muted">Skills:</span><button type="button" class="qc" data-pf-skill="" aria-pressed="${!S.pfSkill}">All</button>${Object.entries(
            skills,
          )
            .sort((a, b) => b[1] - a[1])
            .map(
              ([s, n]) =>
                `<button type="button" class="qc" data-pf-skill="${esc(s)}" aria-pressed="${S.pfSkill.toLowerCase() === s.toLowerCase()}">${esc(s)} <span class="muted">${n}</span></button>`,
            )
            .join("")}</div>`
        : ""
    }
    <div class="qa-chips cwrap"><button type="button" class="qc" data-pf-subj="" aria-pressed="${!S.pfSubj}">All subjects</button>${S.subjects
      .filter((s) => pfItems().some((a) => a.subj === s.id))
      .map(
        (s) =>
          `<button type="button" class="qc ci-${(+s.color || 0) % 6}" data-pf-subj="${esc(s.id)}" aria-pressed="${S.pfSubj === s.id}">${esc(s.code || s.name)}</button>`,
      )
      .join("")}</div>
    <div class="row"><button class="btn sm" type="button" data-pf-export="word">${SVG(ICON.download)}Download Word</button><button class="btn sm" type="button" data-pf-export="pdf">Save as PDF</button><span class="small muted">Exports what's shown with the current filters.</span></div>
    ${semKeys
      .map(
        (
          sk,
        ) => `<section class="pf-sem"><h3>${esc(sk)}${sk === S.curSem ? ` <span class="small muted">· current semester</span>` : ""}</h3>
      ${bySem[sk]
        .map((a) => {
          const open = S.pfOpen === a.id,
            L = asgLinks(a);
          return `<article class="pf-item ${hub.subjCls(a.subj)}"><div class="pf-top" data-pf-open="${esc(a.id)}" role="button" tabindex="0">
          <div><b>${esc(a.title)}</b><div class="line small"><span class="tag ${hub.subjCls(a.subj)}">${esc(hub.subjLabel(a.subj))}</span><span>${esc((ASG_TYPES.find((x) => x[0] === a.type) || ["", ""])[1])}</span><span class="muted">${esc(fmtDate(isoDay(a.doneAt) || a.due || ""))}</span>${a.weight ? `<span class="muted">${esc(a.weight)}%</span>` : ""}</div></div>
          ${a.status === "graded" && a.mark !== "" && a.mark != null ? `<span class="asg-mark">${esc(a.mark)}%</span>` : `<span class="small muted">Submitted</span>`}</div>
          ${(a.learned || "").trim() ? `<div class="pf-learn ${open ? "" : "clip"}"><span class="small muted">What I learned</span>${esc(a.learned)}</div>` : `<button type="button" class="btn sm ghost" data-pf-write="${esc(a.id)}">+ Add what you learned</button>`}
          ${(a.skills || []).length ? `<div class="pf-tags">${a.skills.map((s) => `<span class="feel-pill">${esc(s)}</span>`).join("")}</div>` : ""}
          ${open ? `${a.notes ? `<div class="pf-notes"><span class="small muted">Notes</span>${esc(a.notes)}</div>` : ""}${L.length ? `<ul class="links">${L.map((l) => `<li>${SVG(ICON.link)}<a href="${esc(linkUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label || hostOf(l.url))}</a><span></span></li>`).join("")}</ul>` : ""}` : a.notes || L.length ? `<button type="button" class="btn sm ghost" data-pf-open="${esc(a.id)}">Show notes & files</button>` : ""}
        </article>`;
        })
        .join("")}</section>`,
      )
      .join("")}`;
}
function portfolioHTML() {
  let items = pfItems();
  if (S.pfSubj) items = items.filter((a) => a.subj === S.pfSubj);
  if (S.pfSkill)
    items = items.filter((a) => (a.skills || []).some((s) => s.trim().toLowerCase() === S.pfSkill.toLowerCase()));
  const bySem = {};
  items.forEach((a) => {
    const s = hub.subj(a.subj);
    const k = (s && s.sem) || "Earlier work";
    (bySem[k] = bySem[k] || []).push(a);
  });
  const head = `<h1>Academic Portfolio</h1><p class="who">${esc([S.name, S.org].filter(Boolean).join(" · "))}${S.name || S.org ? "<br>" : ""}${items.length} piece${items.length === 1 ? "" : "s"} of work${S.pfSkill ? " · skill: " + esc(S.pfSkill) : ""}</p>`;
  const body = Object.keys(bySem)
    .sort()
    .reverse()
    .map(
      (k) =>
        `<h2 class="xw">${esc(k)}</h2>` +
        bySem[k]
          .map((a) => {
            const s = hub.subj(a.subj);
            return `<div class="xd"><h3>${esc(a.title)}${a.status === "graded" && a.mark !== "" && a.mark != null ? ` <span class="xm">${esc(a.mark)}%</span>` : ""}</h3>
      <p class="xf">${esc([s ? (s.code ? s.code + " " : "") + s.name : "", (ASG_TYPES.find((x) => x[0] === a.type) || ["", ""])[1], a.weight ? a.weight + "% weight" : "", fmtDate(isoDay(a.doneAt) || a.due || "")].filter(Boolean).join(" · "))}</p>
      ${(a.learned || "").trim() ? `<p class="xf"><b>What I learned:</b> ${esc(a.learned.trim()).replace(/\n/g, "<br>")}</p>` : ""}
      ${(a.skills || []).length ? `<p class="xf"><b>Skills:</b> ${a.skills.map(esc).join(", ")}</p>` : ""}
      ${a.notes ? `<p class="xf"><b>Notes:</b> ${esc(a.notes).replace(/\n/g, "<br>")}</p>` : ""}
      ${
        asgLinks(a).length
          ? `<p class="xf"><b>Files:</b> ${asgLinks(a)
              .map((l) => `<a href="${esc(linkUrl(l.url))}">${esc(l.label || hostOf(l.url))}</a>`)
              .join(" · ")}</p>`
          : ""
      }</div>`;
          })
          .join(""),
    )
    .join("");
  return { title: "Academic Portfolio", html: head + (body || `<p class="none">Nothing to export.</p>`) };
}
function linkTarget(spec) {
  const [kind, id] = spec.split(":");
  return kind === "asg" ? S.asg.find((x) => x.id === id) : null;
}
document.addEventListener("click", (e) => {
  if (S.view !== "study") return;
  const t = e.target.closest("button,[data-pf-open]");
  if (!t || !t.closest("#v-study")) return;
  const d = t.dataset;
  if (d.linkAdd) {
    const a = linkTarget(d.linkAdd);
    if (!a) return;
    const u = (document.querySelector(`[data-link-url="${d.linkAdd}"]`).value || "").trim();
    if (!u) return;
    const L = asgLinks(a);
    L.push({ url: u, label: (document.querySelector(`[data-link-label="${d.linkAdd}"]`).value || "").trim() });
    put("assignments", a.id, { ...strip(a), links: L, link: "" });
    toast("Link added");
  } else if (d.linkDel) {
    const [k, id, i] = d.linkDel.split(":");
    const a = linkTarget(k + ":" + id);
    if (!a) return;
    const L = asgLinks(a);
    L.splice(+i, 1);
    put("assignments", a.id, { ...strip(a), links: L, link: "" });
  } else if (d.noteSubj !== undefined) {
    S.noteSubj = d.noteSubj;
    S.noteTagF = "";
    S.noteEdit = null;
    renderNotes();
  } else if (d.noteSpace) {
    S.noteSpace = d.noteSpace;
    S.noteSubj = "";
    S.noteEdit = null;
    renderNotes();
  } else if (d.noteTagf !== undefined) {
    S.noteTagF = d.noteTagf;
    renderNotes();
  } else if (d.noteKind) {
    if (S.noteEdit) return;
    S.noteKind = d.noteKind;
    renderNotes();
    $("#nt-title").focus();
  } else if (d.noteTag) {
    if (S.noteEdit) {
      const n = S.snotes.find((x) => x.id === S.noteEdit);
      if (n) n.tag = d.noteTag;
    }
    S.noteTag = d.noteTag;
    t.parentElement.querySelectorAll("[data-note-tag]").forEach((b) => b.setAttribute("aria-pressed", b === t));
  } else if (d.noteOpen) {
    S.noteOpen = S.noteOpen === d.noteOpen ? null : d.noteOpen;
    renderNotes();
  } else if (d.noteEdit) {
    S.noteEdit = d.noteEdit;
    const n = S.snotes.find((x) => x.id === d.noteEdit);
    if (n) S.noteSubj = nKey(n);
    renderNotes();
    $("#note-form").scrollIntoView({ block: "nearest", behavior: "smooth" });
    $("#nt-title").focus();
  } else if (d.noteCancel !== undefined) {
    S.noteEdit = null;
    renderNotes();
  } else if (d.noteDel) {
    if (S.noteDel !== d.noteDel) {
      S.noteDel = d.noteDel;
      renderNotes();
    } else {
      del("snotes", d.noteDel);
      S.noteDel = null;
      toast("Deleted");
    }
  } else if (d.pfOpen) {
    S.pfOpen = S.pfOpen === d.pfOpen ? null : d.pfOpen;
    renderPortfolio();
  } else if (d.pfSubj !== undefined) {
    S.pfSubj = d.pfSubj;
    renderPortfolio();
  } else if (d.pfSkill !== undefined) {
    S.pfSkill = d.pfSkill;
    renderPortfolio();
  } else if (d.pfWrite) {
    S.asgOpen = d.pfWrite;
    S.asgFilter = "done";
    location.hash = "#study-assignments";
    setTimeout(() => {
      const el = document.querySelector(`[data-asg-learned="${d.pfWrite}"]`);
      if (el) {
        el.scrollIntoView({ block: "center" });
        el.focus();
      }
    }, 120);
  } else if (d.pfExport) {
    const X = portfolioHTML();
    if (d.pfExport === "word") {
      const doc = `<html><head><meta charset="utf-8"><title>${esc(X.title)}</title><style>${EXPORT_CSS}</style></head><body>${X.html}</body></html>`;
      const url = URL.createObjectURL(new Blob(["﻿", doc], { type: "application/msword" }));
      const el = document.createElement("a");
      el.href = url;
      el.download = "Academic-Portfolio.doc";
      document.body.appendChild(el);
      el.click();
      el.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast("Word file downloaded");
    } else {
      $("#print-area").innerHTML = `<style>${EXPORT_CSS.replace(/body\{/, "#print-area{")}</style>${X.html}`;
      document.body.classList.add("printing-export");
      const t0 = document.title;
      document.title = X.title;
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          document.body.classList.remove("printing-export");
          document.title = t0;
        }, 600);
      }, 80);
    }
  }
});
document.addEventListener("keydown", (e) => {
  const m = e.target.closest && e.target.closest("[data-pf-open]");
  if (m && m.getAttribute("role") === "button" && (e.key === "Enter" || e.key === " ") && e.target === m) {
    e.preventDefault();
    m.click();
  }
  if (e.target.dataset && e.target.dataset.linkUrl && e.key === "Enter") {
    e.preventDefault();
    document.querySelector(`[data-link-add="${e.target.dataset.linkUrl}"]`).click();
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "note-form") return;
  e.preventDefault();
  const ti = $("#nt-title").value.trim(),
    fk = $("#nt-folder") ? $("#nt-folder").value : S.noteSubj;
  if (!ti) {
    $("#nt-title").focus();
    return;
  }
  if (!fk) {
    toast("Open a folder first");
    return;
  }
  const ed = S.noteEdit && S.snotes.find((n) => n.id === S.noteEdit),
    kind = ed ? ed.kind : S.noteKind;
  const url = $("#nt-url") ? $("#nt-url").value.trim() : "";
  if (kind === "link" && !url) {
    toast("Paste the link first");
    $("#nt-url").focus();
    return;
  }
  const rec = {
    ...(fk.startsWith("c:") ? { course: fk.slice(2), subj: "" } : { subj: fk.slice(2), course: "" }),
    kind,
    title: ti,
    body: $("#nt-body").value,
    url,
    tag: ed ? ed.tag || S.noteTag : S.noteTag,
    createdAt: ed ? ed.createdAt : nowISO(),
    updatedAt: nowISO(),
  };
  put("snotes", ed ? ed.id : newId(), rec);
  S.noteEdit = null;
  S.noteSubj = fk;
  toast(ed ? "Saved" : kind === "link" ? "Link saved" : "Note saved");
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (!t.dataset) return;
  if (t.dataset.asgLearned) {
    const a = S.asg.find((x) => x.id === t.dataset.asgLearned);
    if (a) {
      put("assignments", a.id, { ...strip(a), learned: t.value });
      toast("Saved to your portfolio");
    }
  } else if (t.dataset.asgSkills) {
    const a = S.asg.find((x) => x.id === t.dataset.asgSkills);
    if (a)
      put("assignments", a.id, {
        ...strip(a),
        skills: t.value
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      });
  } else if (t.id === "st-semname") {
    const old = S.curSem;
    S.curSem = t.value.trim();
    saveCats();
    if (!old && S.curSem)
      hub.batchColl(
        "subjects",
        S.subjects.filter((s) => !s.sem).map((s) => ["set", s.id, { ...strip(s), sem: S.curSem }]),
      );
    hub.renderStudy();
    toast(S.curSem ? `Current semester: ${S.curSem}` : "Semester name cleared");
  }
});
