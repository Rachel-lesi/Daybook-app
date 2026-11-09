// Reflection archive and export
import { hub } from "./registry.js";
import { $, ICON, S, SVG, catName, dkey, esc, fmtDate, isoDay, toast, todayKey } from "./core.js";
import { fmtMins } from "./today.js";
import { shortDay } from "./reports.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  MONTHS: { get: () => MONTHS, enumerable: true },
  addDays: { get: () => addDays, enumerable: true },
});

// ---------- reflection archive (month folders → weeks → days) and export
S.arcMonth = null;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const hasRefl = (r) => r && [r.did, r.learned, r.mistakes, r.improve].some((x) => (x || "").trim());
const mondayOf = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return dkey(dt);
};
const addDays = (k, n) => {
  const [y, m, d] = k.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dkey(dt);
};
S.arcArea = "";
S.xArea = "";
function reflList(area) {
  return Object.values(S.refl)
    .filter((r) => (area ? hub.areaHas(hub.reflAreas(r)[area]) : hasRefl(r)))
    .sort((a, b) => b.date.localeCompare(a.date));
}
const arcView = (r) => (S.arcArea ? hub.reflAreas(r)[S.arcArea] || {} : r);
function renderArchive() {
  const box = $("#arc");
  if (!box) return;
  const all = reflList(S.arcArea),
    counts = Object.fromEntries(hub.R_AREAS.map(([k]) => [k, reflList(k).length]));
  const tabs = `<div class="seg arc-areas">${[["", "All", reflList().length], ...hub.R_AREAS.map(([k, l]) => [k, l, counts[k]])].map(([k, l, n]) => `<button type="button" data-arcarea="${k}" aria-pressed="${S.arcArea === k}">${l} <span class="muted">${n}</span></button>`).join("")}</div>`;
  if (!all.length) {
    box.innerHTML =
      tabs +
      `<p class="empty" style="margin:0">${S.arcArea ? `No ${esc((hub.R_AREAS.find((x) => x[0] === S.arcArea) || ["", ""])[1].toLowerCase())} reflections yet.` : "Your reflections will be filed here by month and week once you save your first one."}</p>`;
    return;
  }
  if (!S.arcMonth) {
    const byMonth = {};
    all.forEach((r) => (byMonth[r.date.slice(0, 7)] = byMonth[r.date.slice(0, 7)] || []).push(r));
    const years = [...new Set(Object.keys(byMonth).map((k) => k.slice(0, 4)))].sort().reverse();
    box.innerHTML =
      tabs +
      `<div class="arc-crumbs"><b>${S.arcArea ? esc((hub.R_AREAS.find((x) => x[0] === S.arcArea) || ["", ""])[1]) : "All reflections"}</b><span class="muted small">${all.length} saved</span></div>` +
      years
        .map(
          (y) => `
      <div class="arc-year">${y}</div>
      <div class="arc-folders">${Object.keys(byMonth)
        .filter((k) => k.startsWith(y))
        .sort()
        .reverse()
        .map((k) => {
          const rs = byMonth[k],
            moods = rs.filter((r) => r.mood).map((r) => r.mood);
          return `<button type="button" class="folder" data-arcm="${k}"><span class="fd-ic">${SVG(ICON.folder)}</span><span class="fd-name">${MONTHS[+k.slice(5) - 1]}</span><span class="fd-meta">${rs.length} reflection${rs.length > 1 ? "s" : ""}${moods.length ? ` · energy ${(moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1)}` : ""}</span></button>`;
        })
        .join("")}</div>`,
        )
        .join("");
    return;
  }
  const mk = S.arcMonth,
    rs = all.filter((r) => r.date.startsWith(mk));
  const weeks = {};
  rs.forEach((r) => (weeks[mondayOf(r.date)] = weeks[mondayOf(r.date)] || []).push(r));
  const wkeys = Object.keys(weeks).sort().reverse();
  box.innerHTML =
    tabs +
    `<div class="arc-crumbs"><button type="button" class="crumb" data-arcm="">${S.arcArea ? esc((hub.R_AREAS.find((x) => x[0] === S.arcArea) || ["", ""])[1]) : "All reflections"}</button><span class="muted">›</span><b>${MONTHS[+mk.slice(5) - 1]} ${mk.slice(0, 4)}</b>
      <button type="button" class="btn sm" data-xopen="month:${mk}" style="margin-left:auto">${SVG(ICON.download)}Export month</button></div>
    ${
      !rs.length
        ? `<p class="empty" style="margin:0">No reflections this month.</p>`
        : wkeys
            .map(
              (w) => `<details class="arc-week" open>
      <summary><span class="aw-ic">${SVG(ICON.folder)}</span><span class="aw-name">Week of ${esc(shortDay(w).replace(/^\w+ /, ""))}</span><span class="muted small">${shortDay(w).replace(/^\w+ /, "")} – ${shortDay(addDays(w, 6)).replace(/^\w+ /, "")} · ${weeks[w].length} day${weeks[w].length > 1 ? "s" : ""}</span>
        <button type="button" class="btn sm ghost" data-xopen="week:${w}">${SVG(ICON.download)}Export</button></summary>
      <ul class="arc-days">${weeks[w]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(
          (
            r,
          ) => `<li><button type="button" class="arc-day ${r.date === hub.rDate ? "is-open" : ""}" data-rdate="${esc(r.date)}">
        <span class="ad-date"><b>${esc(shortDay(r.date).split(" ")[0])}</b><span>${+r.date.slice(8)}</span></span>
        <span class="ad-body"><span class="ad-snip">${(() => {
          const v = arcView(r);
          return esc((v.learned || v.did || v.mistakes || v.improve || "").slice(0, 120));
        })()}</span><span class="ad-tags">${arcView(r).did ? "<i>Did</i>" : ""}${arcView(r).learned ? "<i>Learned</i>" : ""}${arcView(r).mistakes ? "<i>Mistakes</i>" : ""}${arcView(r).improve ? "<i>Improve</i>" : ""}</span></span>
        ${r.mood ? `<span class="ad-mood" title="Energy">${r.mood}/5</span>` : ""}</button></li>`,
        )
        .join("")}</ul></details>`,
            )
            .join("")
    }`;
}
document.addEventListener("click", (e) => {
  const aa = e.target.closest("[data-arcarea]");
  if (aa) {
    S.arcArea = aa.dataset.arcarea;
    renderArchive();
    return;
  }
  const m = e.target.closest("[data-arcm]");
  if (m) {
    S.arcMonth = m.dataset.arcm || null;
    renderArchive();
    return;
  }
});

// ----- export dialog
function exportRange(kind, val) {
  const tk = todayKey();
  if (kind === "day") return [val || hub.rDate, val || hub.rDate];
  if (kind === "week") {
    const a = mondayOf(val || hub.rDate);
    return [a, addDays(a, 6)];
  }
  if (kind === "month") {
    const mk = (val || tk).slice(0, 7);
    const [y, m] = mk.split("-").map(Number);
    return [mk + "-01", dkey(new Date(y, m, 0))];
  }
  if (kind === "all") {
    const ks = reflList()
      .map((r) => r.date)
      .sort();
    return [ks[0] || tk, ks[ks.length - 1] || tk];
  }
  return [val || tk, val || tk];
}
function openExport(preset) {
  const [kind, val] = (preset || "week:").split(":");
  const [a, b] = exportRange(kind, val);
  $("#x-kind").value = kind;
  $("#x-from").value = a;
  $("#x-to").value = b;
  S.xArea = S.arcArea || "";
  xAreaRender();
  if (!$("#xdlg").open) $("#xdlg").showModal();
  updateExportCount();
}
function xAreaRender() {
  $("#x-area").innerHTML = [["", "All"], ...hub.R_AREAS]
    .map(([k, l]) => `<button type="button" data-xarea="${k}" aria-pressed="${S.xArea === k}">${l}</button>`)
    .join("");
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest("[data-xarea]");
  if (!b) return;
  S.xArea = b.dataset.xarea;
  xAreaRender();
  updateExportCount();
});
function updateExportCount() {
  const a = $("#x-from").value,
    b = $("#x-to").value;
  const n = reflList(S.xArea).filter((r) => r.date >= a && r.date <= b).length;
  $("#x-count").textContent =
    a && b
      ? `${n} reflection${n === 1 ? "" : "s"} between ${fmtDate(a)} and ${fmtDate(b)}${$("#x-layout").value === "logbook" ? " · plus work activity for each day" : ""}`
      : "";
}
function exportDays(a, b, layout) {
  const days = [];
  for (let k = a; k <= b; k = addDays(k, 1)) days.push(k);
  return days
    .map((k) => {
      const r = S.refl[k];
      const upd = S.tasks
        .map((t) => ({ t, e: (t.log || []).filter((l) => isoDay(l.at) === k && !/^Task added/.test(l.note)) }))
        .filter((x) => x.e.length);
      const fin = S.tasks.filter((t) => t.status === "done" && isoDay(t.doneAt) === k);
      const mins = S.time.filter((x) => x.date === k).reduce((s, x) => s + (+x.mins || 0), 0);
      const has = S.xArea ? !!(r && hub.areaHas(hub.reflAreas(r)[S.xArea])) : hasRefl(r);
      const ok = layout === "logbook" ? has || upd.length || fin.length || mins : has;
      return ok ? { k, r, upd, fin, mins } : null;
    })
    .filter(Boolean);
}
function exportHTML(a, b, layout) {
  const D = exportDays(a, b, layout);
  const title = layout === "logbook" ? "Internship Logbook" : "Reflection Journal";
  const range =
    a === b ? shortDay(a) + " " + a.slice(0, 4) : `${shortDay(a)} ${a.slice(0, 4)} – ${shortDay(b)} ${b.slice(0, 4)}`;
  const block = (lbl, txt) =>
    (txt || "").trim() ? `<p class="xf"><b>${lbl}:</b> ${esc(txt.trim()).replace(/\n/g, "<br>")}</p>` : "";
  const totalMins = D.reduce((s, d) => s + d.mins, 0);
  const head = `<h1>${title}</h1><p class="who">${esc([S.name, S.org].filter(Boolean).join(" · "))}${S.name || S.org ? "<br>" : ""}${esc(range)} · ${D.length} day${D.length === 1 ? "" : "s"}${layout === "logbook" && totalMins ? ` · ${fmtMins(totalMins)} tracked` : ""}</p>`;
  let body = "",
    lastWeek = "";
  for (const d of D) {
    const w = mondayOf(d.k);
    if (w !== lastWeek && D.length > 3) {
      body += `<h2 class="xw">Week of ${esc(shortDay(w).replace(/^\w+ /, ""))}</h2>`;
      lastWeek = w;
    }
    body += `<div class="xd"><h3>${esc(new Date(d.k + "T00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}${d.r && d.r.mood ? ` <span class="xm">Energy ${d.r.mood}/5</span>` : ""}</h3>`;
    if (layout === "logbook") {
      if (d.upd.length || d.fin.length)
        body += `<p class="xf"><b>Work:</b></p><ul>${[...d.fin.map((t) => `<li>Completed: [${esc(catName(t.category))}] ${esc(t.title)}${t.impact ? ` — ${esc(t.impact)}` : ""}</li>`), ...d.upd.filter((x) => !d.fin.includes(x.t)).map((x) => `<li>[${esc(catName(x.t.category))}] ${esc(x.t.title)}: ${esc(x.e.map((e) => e.note).join("; "))}</li>`)].join("")}</ul>`;
      if (d.mins) body += `<p class="xf"><b>Time tracked:</b> ${fmtMins(d.mins)}</p>`;
    }
    if (d.r) {
      const A = hub.reflAreas(d.r),
        used = hub.R_AREAS.filter(([k]) => hub.areaHas(A[k]) && (!S.xArea || S.xArea === k));
      used.forEach(([k, l]) => {
        if (used.length > 1 || k !== "work") body += `<p class="xf xa"><b>${esc(l)}</b></p>`;
        body +=
          block("What I did", A[k].did || "") +
          block("What I learned", A[k].learned || "") +
          block("Mistakes", A[k].mistakes || "") +
          block("How I'll improve", A[k].improve || "");
      });
    }
    body += `</div>`;
  }
  if (!D.length) body = `<p class="none">Nothing recorded in this range.</p>`;
  return { title: `${title} ${a}${a === b ? "" : " to " + b}`, html: head + body };
}
const EXPORT_CSS = `body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45;color:#1b2a20}h1{font-size:20pt;margin:0 0 2pt;color:#243c2c}.who{color:#555;margin:0 0 10pt}h2.xw{font-size:12pt;color:#243c2c;border-bottom:1.5px solid #7a9445;padding-bottom:2pt;margin:16pt 0 6pt}h3{font-size:11.5pt;margin:10pt 0 3pt}.xm{font-weight:normal;color:#59789f;font-size:9.5pt}.xf{margin:2pt 0}ul{margin:2pt 0 4pt;padding-left:16pt}li{margin:1pt 0}.none{color:#888}.xd{page-break-inside:avoid}`;
$("#x-kind").addEventListener("change", () => {
  const k = $("#x-kind").value;
  if (k !== "custom") {
    const [a, b] = exportRange(k, $("#x-from").value || hub.rDate);
    $("#x-from").value = a;
    $("#x-to").value = b;
  }
  updateExportCount();
});
["#x-from", "#x-to", "#x-layout"].forEach((s) =>
  $(s).addEventListener("change", () => {
    if (s !== "#x-layout") $("#x-kind").value = "custom";
    updateExportCount();
  }),
);
$("#x-cancel").addEventListener("click", () => $("#xdlg").close());
$("#x-word").addEventListener("click", () => {
  let a = $("#x-from").value,
    b = $("#x-to").value;
  if (!a || !b) return;
  if (a > b) [a, b] = [b, a];
  const X = exportHTML(a, b, $("#x-layout").value);
  const doc = `<html><head><meta charset="utf-8"><title>${esc(X.title)}</title><style>${EXPORT_CSS}</style></head><body>${X.html}</body></html>`;
  const url = URL.createObjectURL(new Blob(["﻿", doc], { type: "application/msword" }));
  const el = document.createElement("a");
  el.href = url;
  el.download = X.title.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-") + ".doc";
  document.body.appendChild(el);
  el.click();
  el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  $("#xdlg").close();
  toast("Word file downloaded");
});
$("#x-pdf").addEventListener("click", () => {
  let a = $("#x-from").value,
    b = $("#x-to").value;
  if (!a || !b) return;
  if (a > b) [a, b] = [b, a];
  const X = exportHTML(a, b, $("#x-layout").value);
  $("#print-area").innerHTML = `<style>${EXPORT_CSS.replace(/body\{/, "#print-area{")}</style>${X.html}`;
  $("#xdlg").close();
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
});
document.addEventListener(
  "click",
  (e) => {
    const x = e.target.closest("[data-xopen]");
    if (x) {
      e.preventDefault();
      e.stopPropagation();
      openExport(x.dataset.xopen);
    }
  },
  true,
);

export { EXPORT_CSS, renderArchive };
