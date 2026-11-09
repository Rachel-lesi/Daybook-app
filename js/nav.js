// Routing and tab navigation
import { hub } from "./registry.js";
import { $, ICON, S, SVG } from "./core.js";
import { setMode } from "./quick-add.js";

// ---------- routing
const VIEWS = ["today", "work", "calendar", "overview", "growth", "study", "health", "money", "reflect", "routine"];
// Main tabs → subtabs. Each subtab shows one page (view) and, where a page has several parts, only that part.
const NAV = {
  today: { label: "Today", icon: "sun", subs: [["today", "Today", "today"]] },
  work: {
    label: "Work",
    icon: "work",
    subs: [
      ["tasks", "Tasks", "work"],
      ["calendar", "Calendar", "calendar"],
      ["skills", "Skills", "growth"],
    ],
  },
  study: {
    label: "Study",
    icon: "class",
    groups: [
      ["school", "School", "class"],
      ["self", "Self-study", "book"],
    ],
    subs: [
      ["timetable", "Timetable", "study", "school"],
      ["calendar", "Calendar", "study", "school"],
      ["assignments", "Assignments", "study", "school"],
      ["notes", "Notes", "study", "school"],
      ["grades", "Grades", "study", "school"],
      ["portfolio", "Portfolio", "study", "school"],
      ["plan", "Study plan", "study", "self"],
      ["courses", "Courses", "growth", "self"],
      ["selfnotes", "Notes", "study", "self"],
    ],
  },
  health: {
    label: "Health",
    icon: "health",
    subs: [
      ["body", "Body", "health"],
      ["mind", "Mind", "health"],
      ["cycle", "Cycle", "health"],
      ["log", "Health log", "health"],
    ],
  },
  money: {
    label: "Money",
    icon: "wallet",
    subs: [
      ["expenses", "Expenses", "money"],
      ["shopping", "Shopping", "money"],
    ],
  },
  journal: {
    label: "Journal",
    icon: "book",
    subs: [
      ["reflection", "Reflection", "reflect"],
      ["archive", "Archive", "reflect"],
      ["weekly", "Weekly report", "reflect"],
    ],
  },
  insights: {
    label: "Insights",
    icon: "chart",
    subs: [
      ["overview", "Overview", "overview"],
      ["streaks", "Streaks", "growth"],
    ],
  },
  settings: {
    label: "Settings",
    icon: "gear",
    subs: [
      ["routine", "Routine & alarms", "routine"],
      ["categories", "Categories", "routine"],
      ["account", "Account", "routine"],
    ],
  },
};
const MAIN_TABS = ["today", "work", "study", "health", "money", "journal", "insights"];
const ALIAS = {
  calendar: "work-calendar",
  overview: "insights",
  growth: "study-courses",
  reflect: "journal",
  routine: "settings",
};
function parseRoute() {
  let h = location.hash.slice(1) || "today";
  h = ALIAS[h] || h;
  let [m, sub] = h.split("-");
  if (!NAV[m]) m = "today";
  const s = NAV[m].subs.find((x) => x[0] === sub) || NAV[m].subs[0];
  return { main: m, sub: s[0], view: s[2] };
}
const subHref = (m, i, sub) => "#" + (i === 0 ? m : m + "-" + sub);
function buildNav() {
  const tab = (m, cls) =>
    `<a href="#${m}" data-m="${m}" class="${cls}">${SVG(ICON[NAV[m].icon])}<span>${NAV[m].label}</span>${m === "work" ? `<span class="count" data-cwork>0</span>` : ""}</a>`;
  $("#tabs").innerHTML = MAIN_TABS.map((m) => tab(m, "")).join("");
  $("#bottomnav").innerHTML = MAIN_TABS.map((m) => tab(m, "bn")).join("");
  $("#settings-btn").innerHTML = SVG(ICON.gear);
}
function renderNav() {
  document.querySelectorAll("[data-m]").forEach((a) => {
    if (a.dataset.m === S.main) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  $("#settings-btn").classList.toggle("on", S.main === "settings");
  const N = NAV[S.main],
    subs = N.subs,
    cur = subs.find((x) => x[0] === S.sub) || subs[0],
    grp = cur[3];
  $("#subtabs").hidden = subs.length < 2;
  const groups = N.groups
    ? `<span class="subgroups" role="group" aria-label="Study area">${N.groups
        .map(([g, l, ic]) => {
          const first = subs.findIndex((x) => x[3] === g);
          return `<a href="${subHref(S.main, first, subs[first][0])}" class="sg ${g === grp ? "on" : ""}" ${g === grp ? 'aria-current="true"' : ""}>${SVG(ICON[ic])}${l}</a>`;
        })
        .join("")}</span><span class="sg-sep" aria-hidden="true"></span>`
    : "";
  $("#subtabs").innerHTML =
    (S.main === "settings" ? `<span class="st-title">Settings</span>` : "") +
    groups +
    (subs.length < 2
      ? ""
      : subs
          .map(([k, l, , g], i) =>
            !grp || g === grp
              ? `<a href="${subHref(S.main, i, k)}" ${k === S.sub ? 'aria-current="page"' : ""}>${l}</a>`
              : "",
          )
          .join(""));
  const open = S.tasks.filter((t) => t.status !== "done").length;
  document.querySelectorAll("[data-cwork]").forEach((c) => {
    c.textContent = open;
    c.hidden = !open;
  });
}
function applyParts() {
  document.querySelectorAll("section.view").forEach((sec) => {
    const parts = sec.querySelectorAll("[data-part]");
    sec.classList.toggle("sub", parts.length > 0);
    parts.forEach((el) => {
      el.hidden = !el.dataset.part.split(" ").includes(S.sub);
    });
  });
}
function route() {
  const R = parseRoute(),
    changed = R.main !== S.main || R.sub !== S.sub;
  S.main = R.main;
  S.sub = R.sub;
  S.view = R.view;
  if (R.main === "study" && (R.sub === "notes" || R.sub === "selfnotes")) {
    const want = R.sub === "selfnotes" ? "self" : "uni";
    if (S.noteSpace !== want) {
      S.noteSpace = want;
      if (S.noteSubj && (S.noteSubj.startsWith("c:") ? "self" : "uni") !== want) S.noteSubj = "";
    }
  }
  if (S.view === "work") setMode("work");
  else if (S.view === "study") setMode("study");
  else if (S.view === "growth") setMode("self");
  else if (S.view === "today") setMode("todo");
  renderNav();
  applyParts();
  hub.render();
  if (changed) window.scrollTo(0, 0);
}
buildNav();
$("#settings-btn").addEventListener("click", () => {
  location.hash = S.main === "settings" ? "#today" : "#settings";
});
window.addEventListener("hashchange", route);

export { VIEWS, renderNav, route };
