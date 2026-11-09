// Quick add bar: text parser and tap chips
import { hub } from "./registry.js";
import {
  $,
  DAYS,
  ICON,
  S,
  SVG,
  URG,
  catByTag,
  catName,
  dkey,
  esc,
  fmtDate,
  keyDow,
  newId,
  nowISO,
  put,
  saveCats,
  toast,
  todayKey,
} from "./core.js";

// ---------- quick add parser
function parseDateToken(t) {
  const now = new Date();
  t = t.toLowerCase();
  if (t === "today" || t === "tdy") return todayKey();
  if (t === "tmr" || t === "tomorrow" || t === "tmrw") {
    now.setDate(now.getDate() + 1);
    return dkey(now);
  }
  const wd = DAYS.findIndex((d) => t.startsWith(d.toLowerCase()));
  if (wd >= 0) {
    const diff = (wd - now.getDay() + 7) % 7;
    now.setDate(now.getDate() + diff);
    return dkey(now);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[\/.](\d{1,2})$/);
  if (m) {
    let y = now.getFullYear();
    const d = new Date(y, +m[2] - 1, +m[1]);
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setFullYear(y + 1);
    return dkey(d);
  }
  return null;
}
function parseQuick(text) {
  const out = { title: "", cat: null, newCat: null, urg: null, due: null };
  const words = [];
  for (const w of text.trim().split(/\s+/)) {
    if (/^#\S+/.test(w)) {
      const c = catByTag(w.slice(1));
      if (c) out.cat = c.tag;
      else out.newCat = w.slice(1);
      continue;
    }
    if (/^!\S+/.test(w)) {
      const u = w.slice(1).toLowerCase();
      const f = URG.find(
        (x) =>
          x.startsWith(u) ||
          (u === "med" && x === "medium") ||
          (u === "crit" && x === "critical") ||
          (u === "urgent" && x === "critical"),
      );
      if (f) {
        out.urg = f;
        continue;
      }
    }
    if (/^@\S+/.test(w)) {
      const d = parseDateToken(w.slice(1));
      if (d) {
        out.due = d;
        continue;
      }
    }
    words.push(w);
  }
  out.title = words.join(" ");
  out.work = !!(out.cat || out.newCat || out.urg);
  return out;
}
// ---------- quick add with tap chips (typing shortcuts still work)
S.qa = { cat: "", urg: "medium", due: todayKey(), adding: false, subj: "", skind: "todo" };
function qaDefaults() {
  S.qa = {
    cat: "",
    urg: "medium",
    due: S.mode === "work" ? "" : todayKey(),
    adding: false,
    subj: (S.qa && S.qa.subj) || "",
    skind: "todo",
  };
}
const QA_SKIND = [
  ["todo", "To-do"],
  ["assignment", "Assignment"],
  ["quiz", "Quiz"],
  ["test", "Test"],
  ["project", "Project"],
  ["exam", "Exam"],
];
const QA_URG = [
  ["critical", "Critical"],
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
];
function qaEffective() {
  const p = parseQuick($("#q").value);
  const work = S.mode === "work";
  return {
    p,
    work,
    study: S.mode === "study",
    self: S.mode === "self",
    cat: p.cat || (p.newCat ? "__new" : S.qa.cat),
    urg: p.urg || S.qa.urg,
    due: p.due !== null && p.due !== undefined ? p.due : S.qa.due,
  };
}
function dueChoices() {
  const tk = todayKey(),
    out = [
      [tk, "Today"],
      [hub.addDays(tk, 1), "Tomorrow"],
    ];
  for (let i = 2; out.length < 5 && i < 8; i++) {
    const k = hub.addDays(tk, i);
    out.push([k, DAYS[keyDow(k)] + " " + +k.slice(8)]);
  }
  return out;
}
function renderQA() {
  const box = $("#qa");
  if (!box) return;
  const E = qaEffective(),
    ch = (attr, val, label, on, extra = "") =>
      `<button type="button" class="qc ${extra}" ${attr}="${esc(val)}" aria-pressed="${on}">${label}</button>`;
  const dues = dueChoices(),
    customDue = E.due && !dues.some((d) => d[0] === E.due);
  let h = `<div class="qa-row"><span class="qa-lbl">Type</span><div class="qa-chips">${ch("data-qa-type", "todo", "To-do", !E.work && !E.study)}${ch("data-qa-type", "work", "Work task", E.work)}${ch("data-qa-type", "study", "Study", E.study)}${ch("data-qa-type", "self", "Self-study / skills", E.self)}</div></div>`;
  if (E.self) {
    h += `<div class="qa-row"><span class="qa-lbl">Skill</span><div class="qa-chips">${S.cats.map((c, i) => ch("data-qa-cat", c.tag, esc(c.name.split(/\s*\/\s*/)[0]), E.cat === c.tag, "ci-" + (i % 6))).join("")}
      ${S.qa.adding ? `<span class="qc-new"><input id="qa-newcat" placeholder="New skill" aria-label="New skill name"><button type="button" class="qc" data-qa-newsave>Add</button></span>` : ch("data-qa-newcat", "1", "+ New", false, "ghost")}</div></div>`;
    if (S.courses.length)
      h += `<div class="qa-row"><span class="qa-lbl">Course</span><div class="qa-chips">${S.courses.map((c) => ch("data-qa-course", c.id, esc(c.name.length > 26 ? c.name.slice(0, 24) + "…" : c.name), S.qa.course === c.id)).join("")}</div></div>`;
  }
  if (E.study) {
    const subs = typeof hub.curSubjects === "function" ? hub.curSubjects() : [];
    h += `<div class="qa-row"><span class="qa-lbl">Subject</span><div class="qa-chips">${subs.length ? subs.map((s) => ch("data-qa-subj", s.id, esc(s.code || s.name), S.qa.subj === s.id, "ci-" + ((+s.color || 0) % 6))).join("") : `<a class="qc ghost" href="#study-timetable">Add subjects first</a>`}</div></div>`;
    if (S.qa.subj && S.qa.skind === "todo") {
      const al = S.asg.filter((a) => a.subj === S.qa.subj && !a.parent && !["submitted", "graded"].includes(a.status));
      if (al.length)
        h += `<div class="qa-row"><span class="qa-lbl">For</span><div class="qa-chips">${al.map((a) => ch("data-qa-asg", a.id, esc(a.title), S.qa.asg === a.id)).join("")}</div></div>`;
    }
    h += `<div class="qa-row"><span class="qa-lbl">Kind</span><div class="qa-chips">${QA_SKIND.map(([v, l]) => ch("data-qa-skind", v, l, S.qa.skind === v)).join("")}</div></div>`;
  }
  if (E.work) {
    h += `<div class="qa-row"><span class="qa-lbl">Category</span><div class="qa-chips">${S.cats.map((c, i) => ch("data-qa-cat", c.tag, esc(c.name.split(/\s*\/\s*/)[0]), E.cat === c.tag, "ci-" + (i % 6))).join("")}
      ${E.cat === "__new" ? `<span class="qc on">${esc(E.p.newCat)} (new)</span>` : ""}
      ${S.qa.adding ? `<span class="qc-new"><input id="qa-newcat" placeholder="New category" aria-label="New category name"><button type="button" class="qc" data-qa-newsave>Add</button></span>` : ch("data-qa-newcat", "1", "+ New", false, "ghost")}</div></div>`;
    h += `<div class="qa-row"><span class="qa-lbl">Urgency</span><div class="qa-chips">${QA_URG.map(([v, l]) => ch("data-qa-urg", v, l, E.urg === v, "u-" + v)).join("")}</div></div>`;
  }
  h += `<div class="qa-row"><span class="qa-lbl">${E.work || (E.study && S.qa.skind !== "todo") ? "Due" : "When"}</span><div class="qa-chips">${E.work || (E.study && S.qa.skind !== "todo") ? ch("data-qa-due", "", "No date", !E.due) : ""}${dues.map(([k, l]) => ch("data-qa-due", k, l, E.due === k)).join("")}
    <label class="qc pick ${customDue ? "on" : ""}" aria-pressed="${customDue}">${SVG(ICON.calendar)}${customDue ? esc(fmtDate(E.due)) : "Pick date"}<input type="date" id="qa-pick" data-native value="${esc(E.due || "")}" aria-label="Pick a date"></label></div></div>`;
  h += E.self
    ? `<p class="qa-tip">Self-study counts towards that skill on Work → Skills.</p>`
    : E.study
      ? `<p class="qa-tip">${S.qa.skind === "todo" ? "Study to-dos show in the Study list on Today." : "Saved to Study → Assignments, due at 11:59pm. Edit it there to change the time or weight."}</p>`
      : `<p class="qa-tip">Shortcut: you can also type <code>#excel</code> <code>!high</code> <code>@fri</code> in the box.</p>`;
  box.innerHTML = h;
}
// remove typed tokens for a field when its chip is tapped, so the chip choice wins
function stripTokens(re) {
  const q = $("#q");
  q.value = q.value
    .split(/\s+/)
    .filter((w) => !re.test(w))
    .join(" ")
    .replace(/\s+$/, q.value.endsWith(" ") ? " " : "");
}
function setMode(m, auto) {
  if (!auto) S.autoWork = false;
  const changed = S.mode !== m;
  S.mode = m;
  if (changed && !$("#q").value.trim()) qaDefaults();
  renderQA();
}
function updateHint() {
  const p = parseQuick($("#q").value);
  if (p.work && S.mode !== "work") {
    S.mode = "work";
    S.autoWork = true;
  } else if (!p.work && S.autoWork) {
    S.mode = "todo";
    S.autoWork = false;
  }
  renderQA();
}
$("#q").addEventListener("input", updateHint);
// keep the keyboard open and the focus in the box while tapping chips
$("#qa").addEventListener("pointerdown", (e) => {
  if (e.target.closest("button.qc")) e.preventDefault();
});
$("#qa").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.qaType) {
    if (b.dataset.qaType !== "work") stripTokens(/^[#!]\S+/);
    S.mode = b.dataset.qaType;
    S.autoWork = false;
    if (S.mode !== "work" && !S.qa.due) S.qa.due = todayKey();
    if (S.mode === "self" && !S.qa.cat) {
      const c = S.courses[0];
      if (c && (c.skills || [])[0]) S.qa.cat = c.skills[0];
    }
  } else if (b.dataset.qaCourse) {
    S.qa.course = S.qa.course === b.dataset.qaCourse ? "" : b.dataset.qaCourse;
    const c = S.courses.find((x) => x.id === S.qa.course);
    if (c && !S.qa.cat && (c.skills || [])[0]) S.qa.cat = c.skills[0];
  } else if (b.dataset.qaSubj) {
    S.qa.subj = S.qa.subj === b.dataset.qaSubj ? "" : b.dataset.qaSubj;
    S.qa.asg = "";
  } else if (b.dataset.qaAsg) {
    S.qa.asg = S.qa.asg === b.dataset.qaAsg ? "" : b.dataset.qaAsg;
  } else if (b.dataset.qaSkind) {
    const was = S.qa.skind;
    S.qa.skind = b.dataset.qaSkind;
    if (was === "todo" && S.qa.skind !== "todo" && S.qa.due === todayKey()) S.qa.due = hub.addDays(todayKey(), 7);
    if (S.qa.skind === "todo" && !S.qa.due) S.qa.due = todayKey();
  } else if (b.dataset.qaCat !== undefined) {
    stripTokens(/^#\S+/);
    S.qa.cat = S.qa.cat === b.dataset.qaCat ? "" : b.dataset.qaCat;
  } else if (b.dataset.qaUrg) {
    stripTokens(/^!\S+/);
    S.qa.urg = b.dataset.qaUrg;
  } else if (b.dataset.qaDue !== undefined) {
    stripTokens(/^@\S+/);
    S.qa.due = b.dataset.qaDue;
  } else if (b.dataset.qaNewcat) {
    S.qa.adding = true;
    renderQA();
    $("#qa-newcat").focus();
    return;
  } else if (b.dataset.qaNewsave !== undefined) {
    qaSaveNewCat();
    return;
  }
  renderQA();
  $("#q").focus({ preventScroll: true });
});
function qaSaveNewCat() {
  const n = ($("#qa-newcat").value || "").trim();
  S.qa.adding = false;
  if (n) {
    let tag =
      n
        .split(/[\s\/]+/)[0]
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "") || "cat";
    while (S.cats.find((c) => c.tag === tag)) tag += "2";
    S.cats.push({ name: n, tag });
    saveCats();
    S.qa.cat = tag;
    toast("Category added");
  }
  renderQA();
  $("#q").focus({ preventScroll: true });
}
$("#qa").addEventListener("keydown", (e) => {
  if (e.target.id === "qa-newcat" && e.key === "Enter") {
    e.preventDefault();
    qaSaveNewCat();
  }
  if (e.target.id === "qa-newcat" && e.key === "Escape") {
    S.qa.adding = false;
    renderQA();
  }
});
$("#qa").addEventListener("change", (e) => {
  if (e.target.id === "qa-pick" && e.target.value) {
    stripTokens(/^@\S+/);
    S.qa.due = e.target.value;
    renderQA();
  }
});
// show the chips while adding, hide them when you're done
const qaShow = (on) => {
  $("#qa").hidden = !on;
  $("#quick").classList.toggle("open", on);
};
$("#quick").addEventListener("focusin", (e) => {
  if ($("#qa").hidden && e.target.id === "q") renderQA();
  qaShow(true);
});
$("#quick").addEventListener("focusout", () =>
  setTimeout(() => {
    if (!$("#quick").contains(document.activeElement) && !$("#q").value.trim() && !S.qa.adding) qaShow(false);
  }, 150),
);
$("#q").addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("#q").value = "";
    updateHint();
    $("#q").blur();
    qaShow(false);
  }
});
$("#quick").addEventListener("submit", (e) => {
  e.preventDefault();
  const E = qaEffective(),
    p = E.p;
  if (!p.title) {
    toast("Type a name first");
    $("#q").focus();
    return;
  }
  if (E.work) {
    let cat = E.cat === "__new" ? "" : E.cat;
    if (p.newCat) {
      const tag = p.newCat.toLowerCase().replace(/[^a-z0-9-]/g, "");
      const name = p.newCat.charAt(0).toUpperCase() + p.newCat.slice(1);
      if (!S.cats.find((c) => c.tag === tag)) {
        S.cats.push({ name, tag });
        saveCats();
      }
      cat = tag;
    }
    put("tasks", newId(), {
      title: p.title,
      desc: "",
      category: cat || "",
      urgency: E.urg || "medium",
      status: "todo",
      progress: 0,
      bottleneck: "",
      assignedBy: "",
      due: E.due || "",
      createdAt: nowISO(),
      updatedAt: nowISO(),
      doneAt: "",
      log: [{ at: nowISO(), note: "Task added" }],
    });
    toast(
      `Work task added${cat ? " · " + catName(cat).split(/\s*\/\s*/)[0] : ""}${E.due ? " · due " + fmtDate(E.due) : ""}`,
    );
  } else if (E.self) {
    const cat = E.cat === "__new" ? "" : E.cat;
    put("todos", newId(), {
      title: p.title,
      date: E.due || todayKey(),
      done: false,
      doneAt: "",
      createdAt: nowISO(),
      kind: "self",
      cat: cat || "",
      course: S.qa.course || "",
    });
    toast(
      `Self-study added${cat ? " · " + catName(cat).split(/\s*\/\s*/)[0] : ""}${E.due && E.due !== todayKey() ? " for " + fmtDate(E.due) : ""}`,
    );
  } else if (E.study) {
    const sj = S.qa.subj,
      kind = S.qa.skind;
    if (kind === "todo") {
      put("todos", newId(), {
        title: p.title,
        date: E.due || todayKey(),
        done: false,
        doneAt: "",
        createdAt: nowISO(),
        kind: "study",
        subj: sj || "",
        asg: S.qa.asg || "",
      });
      S.qa.asg = "";
      toast(
        `Study to-do added${sj ? " · " + hub.subjLabel(sj) : ""}${E.due && E.due !== todayKey() ? " for " + fmtDate(E.due) : ""}`,
      );
    } else {
      if (!sj) {
        toast("Pick a subject first");
        return;
      }
      put("assignments", newId(), {
        subj: sj,
        title: p.title,
        type: kind,
        due: E.due || "",
        time: E.due ? "23:59" : "",
        weight: "",
        status: "todo",
        mark: "",
        notes: "",
        link: "",
        createdAt: nowISO(),
        doneAt: "",
      });
      toast(
        `${(QA_SKIND.find((x) => x[0] === kind) || ["", "Item"])[1]} added · ${hub.subjLabel(sj)}${E.due ? " · due " + fmtDate(E.due) : ""}`,
      );
    }
  } else {
    put("todos", newId(), { title: p.title, date: E.due || todayKey(), done: false, doneAt: "", createdAt: nowISO() });
    toast(`To-do added${E.due && E.due !== todayKey() ? " for " + fmtDate(E.due) : ""}`);
  }
  $("#q").value = "";
  S.autoWork = false;
  qaDefaults();
  renderQA();
  $("#q").focus({ preventScroll: true });
});

export { setMode, updateHint };
