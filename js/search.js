// Search
import { hub } from "./registry.js";
import { $, S, STATUS_LABEL, catName, esc, fmtDate, todayKey } from "./core.js";
import { openTask } from "./tasks.js";

// ---------- search
function openSearch() {
  const d = $("#sdlg");
  if (!d.open) d.showModal();
  $("#s-q").value = "";
  runSearch();
  setTimeout(() => $("#s-q").focus(), 30);
}
function hl(text, q) {
  const t = esc(text);
  if (!q) return t;
  const words = q
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return words.length
    ? t.replace(new RegExp("(" + words.map((w) => esc(w)).join("|") + ")", "gi"), "<mark>$1</mark>")
    : t;
}
function snippet(text, q) {
  const s = String(text || "").replace(/\s+/g, " ");
  const i = s.toLowerCase().indexOf(q.split(/\s+/)[0]);
  if (i < 0) return s.slice(0, 110);
  const a = Math.max(0, i - 40);
  return (a ? "…" : "") + s.slice(a, a + 120) + (a + 120 < s.length ? "…" : "");
}
function runSearch() {
  const q = $("#s-q").value.trim().toLowerCase(),
    out = $("#s-res");
  if (q.length < 2) {
    out.innerHTML = `<p class="small muted" style="padding:8px 4px;margin:0">Search tasks, notes, steps, to-dos, reflections, courses and routine. Type at least 2 letters.</p>`;
    return;
  }
  const words = q.split(/\s+/);
  const match = (s) => {
    const h = s.toLowerCase();
    return words.every((w) => h.includes(w));
  };
  const R = [];
  for (const t of S.tasks) {
    const hay = [
      t.title,
      t.desc,
      t.notes,
      t.bottleneck,
      t.impact,
      catName(t.category),
      ...(t.subtasks || []).map((s) => s.text),
      ...(t.links || []).map((l) => l.label + " " + l.url),
      t.bnHow,
      ...(t.log || []).map((l) => [l.note, l.memo].filter(Boolean).join(" ")),
    ].join(" \n ");
    if (match(hay))
      R.push({
        g: "Work tasks",
        title: t.title,
        sub: `${STATUS_LABEL[t.status]} · ${catName(t.category)}${t.due ? " · due " + fmtDate(t.due) : ""}`,
        snip: match(t.title) ? "" : snippet(hay.replace(t.title, ""), q),
        act: `data-sr-task="${esc(t.id)}"`,
      });
  }
  for (const t of S.todos)
    if (match(t.title))
      R.push({
        g: "To-dos",
        title: t.title,
        sub: (t.done ? "Done · " : "") + (t.date ? fmtDate(t.date) : ""),
        act: `data-sr-date="${esc(t.date || todayKey())}"`,
      });
  for (const r of Object.values(S.refl)) {
    const hay = [r.did, r.learned, r.mistakes, r.improve].join(" \n ");
    if (match(hay))
      R.push({
        g: "Reflections",
        title: fmtDate(r.date) + " " + r.date.slice(0, 4),
        sub: "",
        snip: snippet(hay, q),
        act: `data-sr-refl="${esc(r.date)}"`,
      });
  }
  for (const c of S.courses) {
    const hay = [c.name, ...(c.modules || []).map((m) => m.title)].join(" \n ");
    if (match(hay))
      R.push({
        g: "Courses",
        title: c.name,
        sub: `${(c.modules || []).filter((m) => m.done).length}/${(c.modules || []).length} modules`,
        snip: match(c.name) ? "" : snippet(hay, q),
        act: `data-sr-view="study-courses"`,
      });
  }
  for (const hd of Object.values(S.health))
    (hd.moods || []).forEach((m) => {
      const hay = [m.note, ...(m.feel || []), ...(m.why || [])].join(" ");
      if (m.note && match(hay))
        R.push({
          g: "Mood notes",
          title: fmtDate(hd.date) + " · " + hub.MOODS[m.m - 1][1],
          sub: (m.feel || []).join(", "),
          snip: snippet(m.note, q),
          act: `data-sr-view="health-mind"`,
        });
    });
  for (const c of S.conds) {
    const hay = [c.title, c.notes].join(" \n ");
    if (match(hay))
      R.push({
        g: "Health",
        title: c.title,
        sub: `${fmtDate(c.start)} · ${c.status === "resolved" ? "recovered" : "ongoing"}`,
        snip: match(c.title) ? "" : snippet(hay, q),
        act: `data-sr-view="health-log"`,
      });
  }
  for (const n of S.snotes) {
    const hay = [n.title, n.body, n.url, hub.folderLabel(hub.nKey(n))].join(" \n ");
    if (match(hay))
      R.push({
        g: n.course ? "Course notes" : "Study notes",
        title: n.title,
        sub: `${hub.folderLabel(hub.nKey(n))} · ${(hub.NOTE_TAGS.find((t) => t[0] === n.tag) || ["", "Note"])[1]}`,
        snip: match(n.title) ? "" : snippet(hay, q),
        act: `data-sr-view="${n.course ? "study-selfnotes" : "study-notes"}"`,
      });
  }
  for (const a of S.asg) {
    const hay = [
      a.title,
      a.notes,
      a.learned,
      (a.skills || []).join(" "),
      hub.subjLabel(a.subj),
      (hub.subj(a.subj) || {}).name,
    ].join(" \n ");
    if (match(hay))
      R.push({
        g: "Assignments",
        title: a.title,
        sub: `${hub.subjLabel(a.subj)} · ${hub.dueText(a)[0]}`,
        snip: match(a.title) ? "" : snippet(hay, q),
        act: `data-sr-view="study-assignments"`,
      });
  }
  for (const sj of S.subjects) {
    const hay = [sj.code, sj.name, sj.lecturer].join(" ");
    if (match(hay))
      R.push({
        g: "Subjects",
        title: (sj.code ? sj.code + " · " : "") + sj.name,
        sub: sj.lecturer || "",
        act: `data-sr-view="study"`,
      });
  }
  for (const x of S.exp) {
    const hay = [x.note, hub.expCat(x.cat)[1]].join(" ");
    if (match(hay))
      R.push({
        g: "Expenses",
        title: (x.note || hub.expCat(x.cat)[1]) + " · " + hub.money(x.amount),
        sub: fmtDate(x.date) + " · " + hub.expCat(x.cat)[1],
        act: `data-sr-view="money"`,
      });
  }
  for (const i of S.shop)
    if (match(i.name))
      R.push({
        g: "Shopping list",
        title: i.name + (i.qty ? " × " + i.qty : ""),
        sub: i.done ? "In the basket" : "To buy",
        act: `data-sr-view="money-shopping"`,
      });
  for (const r of S.routine)
    if (match(r.label))
      R.push({
        g: "Routine",
        title: r.label,
        sub: r.time + " · " + (hub.daysLabel(r.days) || "Custom days"),
        act: `data-sr-view="routine"`,
      });
  if (!R.length) {
    out.innerHTML = `<p class="small muted" style="padding:8px 4px;margin:0">Nothing found for “${esc(q)}”.</p>`;
    return;
  }
  const groups = [...new Set(R.map((r) => r.g))];
  out.innerHTML = groups
    .map(
      (g) =>
        `<div class="s-group">${esc(g)}</div>` +
        R.filter((r) => r.g === g)
          .slice(0, 20)
          .map(
            (r) =>
              `<button type="button" class="s-item" ${r.act}><span class="s-title">${hl(r.title, q)}</span>${r.sub ? `<span class="s-sub">${esc(r.sub)}</span>` : ""}${r.snip ? `<span class="s-snip">${hl(r.snip, q)}</span>` : ""}</button>`,
          )
          .join(""),
    )
    .join("");
}
$("#search-btn").addEventListener("click", openSearch);
$("#s-q").addEventListener("input", runSearch);
$("#s-close").addEventListener("click", () => $("#sdlg").close());
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) &&
    !document.querySelector("dialog[open]")
  ) {
    e.preventDefault();
    openSearch();
  }
});
$("#s-res").addEventListener("click", (e) => {
  const b = e.target.closest(".s-item");
  if (!b) return;
  $("#sdlg").close();
  if (b.dataset.srTask) openTask(b.dataset.srTask);
  else if (b.dataset.srDate) {
    S.calSel = b.dataset.srDate;
    const [y, m] = b.dataset.srDate.split("-").map(Number);
    S.calY = y;
    S.calM = m - 1;
    location.hash = "#calendar";
    hub.render();
  } else if (b.dataset.srRefl) {
    hub.rDate = b.dataset.srRefl;
    hub.rDirty = false;
    location.hash = "#reflect";
    hub.render();
  } else if (b.dataset.srView) location.hash = "#" + b.dataset.srView;
});
