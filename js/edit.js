// Edit dialog for list items
import { hub } from "./registry.js";
import { $, S, del, esc, put, saveCats, strip, toast } from "./core.js";
import { saveCourse } from "./courses.js";
import { BOWEL, COND_KIND, MEALS, SEV, hk, saveHealth } from "./health.js";
import { EXP_CATS, PAY, SHOP_CATS } from "./money.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  editDlg: { get: () => editDlg, enumerable: true },
});

// ---------- edit anything that was added: one small dialog for list items
function editDlg(title, fields, onSave, onDelete) {
  let d = $("#gedlg");
  if (!d) {
    d = document.createElement("dialog");
    d.id = "gedlg";
    d.className = "xdlg";
    d.innerHTML = '<form class="dlg" id="ge-form" autocomplete="off"></form>';
    document.body.appendChild(d);
  }
  const f = d.querySelector("form");
  const fld = (x, i) => {
    const v = x.value ?? "",
      nm = `name="g${i}"`;
    if (x.type === "select")
      return `<label class="f">${esc(x.label)}<select ${nm}>${x.options.map(([o, l]) => `<option value="${esc(o)}" ${String(o) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
    if (x.type === "textarea")
      return `<label class="f">${esc(x.label)}<textarea ${nm} rows="3">${esc(v)}</textarea></label>`;
    return `<label class="f">${esc(x.label)}<input ${nm} type="${x.type || "text"}" value="${esc(v)}" ${x.type === "number" ? 'step="any" inputmode="decimal"' : ""} ${x.req ? "required" : ""}></label>`;
  };
  f.innerHTML = `<div class="dlg-top"><h3>${esc(title)}</h3><button type="button" class="iconbtn dlg-x" data-dlg-x aria-label="Close">✕</button></div>
    <div class="ge-fields">${fields.map(fld).join("")}</div>
    <div class="dlgfoot"><span>${onDelete ? '<button class="btn sm ghost danger" type="button" data-ge-del>Delete</button>' : ""}</span><span style="display:flex;gap:8px"><button class="btn" type="button" data-dlg-x>Cancel</button><button class="btn primary" type="submit">Save</button></span></div>`;
  f.onsubmit = (e) => {
    e.preventDefault();
    const out = {};
    fields.forEach((x, i) => {
      const el = f.querySelector(`[name="g${i}"]`);
      out[x.k] = typeof el.value === "string" ? el.value.trim() : el.value;
    });
    d.close();
    onSave(out);
  };
  const dx = f.querySelector("[data-ge-del]");
  if (dx)
    dx.onclick = () => {
      d.close();
      onDelete();
    };
  if (!d.open) d.showModal();
  if (!matchMedia("(hover: none)").matches)
    setTimeout(() => {
      const el = f.querySelector(".ge-fields input,.ge-fields textarea");
      if (el) el.focus();
    }, 30);
}
const opts = (L) => L.map((x) => [x[0], x[1]]);
document.addEventListener(
  "click",
  (e) => {
    const b = e.target.closest("[data-ge]");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const [kind, id, extra] = b.dataset.ge.split(":");
    if (kind === "meal" || kind === "bowel") {
      const k = hk(),
        d = hub.hDoc(k),
        f = kind === "meal" ? "meals" : "bowel",
        it = (d[f] || []).find((x) => x.id === id);
      if (!it) return;
      const F =
        kind === "meal"
          ? [
              { k: "text", label: "What you ate", value: it.text, req: 1 },
              { k: "type", label: "Meal", type: "select", options: opts(MEALS), value: it.type },
              {
                k: "src",
                label: "Where from",
                type: "select",
                options: [["", "Not set"], ...opts(hub.MEAL_SRC)],
                value: it.src || "",
              },
              { k: "time", label: "Time", type: "time", value: it.time },
            ]
          : [
              { k: "type", label: "Type", type: "select", options: opts(BOWEL), value: it.type },
              { k: "note", label: "Note", value: it.note || "" },
              { k: "time", label: "Time", type: "time", value: it.time },
            ];
      editDlg(
        kind === "meal" ? "Edit meal" : "Edit entry",
        F,
        (v) => {
          const d2 = hub.hDoc(k);
          d2[f] = (d2[f] || []).map((x) => (x.id === id ? { ...x, ...v } : x));
          saveHealth(k, d2);
          toast("Saved");
        },
        () => {
          const d2 = hub.hDoc(k);
          d2[f] = (d2[f] || []).filter((x) => x.id !== id);
          saveHealth(k, d2);
        },
      );
    } else if (kind === "body") {
      const r = S.body.find((x) => x.id === id);
      if (!r) return;
      editDlg(
        "Edit record",
        [
          { k: "date", label: "Date", type: "date", value: r.date },
          { k: "height", label: "Height (cm)", type: "number", value: r.height || "" },
          { k: "weight", label: "Weight (kg)", type: "number", value: r.weight || "" },
        ],
        (v) => {
          put("body", id, { ...strip(r), date: v.date || r.date, height: v.height, weight: v.weight });
          toast("Saved");
        },
        () => del("body", id),
      );
    } else if (kind === "cond") {
      const c = S.conds.find((x) => x.id === id);
      if (!c) return;
      const F = [
        { k: "title", label: "What's wrong?", value: c.title, req: 1 },
        { k: "kind", label: "Type", type: "select", options: opts(COND_KIND), value: c.kind },
        { k: "severity", label: "How bad", type: "select", options: opts(SEV), value: c.severity },
        { k: "start", label: "Started", type: "date", value: c.start },
      ];
      if (c.status === "resolved") F.push({ k: "end", label: "Recovered", type: "date", value: c.end || "" });
      F.push({ k: "notes", label: "Notes", type: "textarea", value: c.notes || "" });
      editDlg(
        "Edit health log",
        F,
        (v) => {
          put("conditions", id, { ...strip(c), ...v });
          toast("Saved");
        },
        () => del("conditions", id),
      );
    } else if (kind === "exp") {
      const x0 = S.exp.find((x) => x.id === id);
      if (!x0) return;
      editDlg(
        "Edit expense",
        [
          { k: "amount", label: `Amount (${S.cur})`, type: "number", value: x0.amount, req: 1 },
          { k: "note", label: "What was it", value: x0.note || "" },
          { k: "cat", label: "Category", type: "select", options: opts(EXP_CATS), value: x0.cat },
          { k: "pay", label: "Paid by", type: "select", options: opts(PAY), value: x0.pay },
          { k: "date", label: "Date", type: "date", value: x0.date },
        ],
        (v) => {
          const amt = parseFloat(String(v.amount).replace(/[^\d.]/g, ""));
          if (!(amt > 0)) {
            toast("Enter an amount");
            return;
          }
          put("expenses", id, { ...strip(x0), ...v, amount: Math.round(amt * 100) / 100, date: v.date || x0.date });
          toast("Saved");
        },
        () => del("expenses", id),
      );
    } else if (kind === "shop") {
      const i0 = S.shop.find((x) => x.id === id);
      if (!i0) return;
      editDlg(
        "Edit item",
        [
          { k: "name", label: "Item", value: i0.name, req: 1 },
          { k: "qty", label: "Quantity", value: i0.qty || "" },
          { k: "cat", label: "Aisle", type: "select", options: SHOP_CATS, value: i0.cat || "other" },
        ],
        (v) => {
          if (!v.name) return;
          put("shop", id, { ...strip(i0), ...v });
          toast("Saved");
        },
        () => del("shop", id),
      );
    } else if (kind === "mod") {
      const c = S.courses.find((x) => x.id === id),
        i = +extra,
        m = c && (c.modules || [])[i];
      if (!m) return;
      editDlg(
        "Edit module",
        [{ k: "title", label: "Module", value: m.title, req: 1 }],
        (v) => {
          if (!v.title) return;
          const mods = c.modules.map((x, j) => (j === i ? { ...x, title: v.title } : x));
          saveCourse({ ...c, modules: mods });
          toast("Saved");
        },
        () => {
          const mods = [...c.modules];
          mods.splice(i, 1);
          saveCourse({ ...c, modules: mods });
        },
      );
    } else if (kind === "cat") {
      const c = S.cats.find((x) => x.tag === id);
      if (!c) return;
      editDlg("Rename category", [{ k: "name", label: "Name", value: c.name, req: 1 }], (v) => {
        if (!v.name) return;
        S.cats = S.cats.map((x) => (x.tag === id ? { ...x, name: v.name } : x));
        saveCats();
        hub.renderRoutine && hub.renderRoutine();
        toast("Renamed");
      });
    }
  },
  true,
);
document.addEventListener("change", (e) => {
  const t = e.target;
  if (!t.matches || !t.matches("[data-cname]")) return;
  const card = t.closest("[data-course]"),
    c = card && S.courses.find((x) => x.id === card.dataset.course);
  const n = t.value.trim();
  if (c && n && n !== c.name) {
    saveCourse({ ...c, name: n });
    toast("Renamed");
  }
});
