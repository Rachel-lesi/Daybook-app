// Shared state, helpers, date input, swipe, dialogs, data ops, categories, icons and theme
import { hub } from "./registry.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  db: {
    get: () => db,
    set: (v) => {
      db = v;
    },
    enumerable: true,
  },
  watchChecks: {
    get: () => watchChecks,
    set: (v) => {
      watchChecks = v;
    },
    enumerable: true,
  },
});

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getMessaging,
  getToken,
  isSupported as messagingSupported,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import * as CFG from "../firebase-config.js";
const firebaseConfig = CFG.firebaseConfig;
import { SEED } from "../seed.js";
import { STUDY_PLAN } from "../study-plan.js";
import { sceneSVG } from "./scenes.js";

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const pad = (n) => String(n).padStart(2, "0");
const dkey = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const todayKey = () => dkey(new Date());
const nowISO = () => new Date().toISOString();
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const URG = ["critical", "high", "medium", "low"];
const URG_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS = [
  ["todo", "Not started"],
  ["doing", "In progress"],
  ["blocked", "Blocked"],
  ["done", "Done"],
];
const STATUS_LABEL = Object.fromEntries(STATUS);
const KINDS = [
  ["meal", "Meal"],
  ["supplement", "Supplement"],
  ["break", "Break"],
  ["work", "Work"],
  ["study", "Study"],
  ["class", "Class"],
  ["health", "Health"],
  ["other", "Other"],
];
const fmtDate = (k) => {
  if (!k) return "";
  const [y, m, d] = k.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return DAYS[dt.getDay()] + ", " + d + " " + dt.toLocaleString("en-GB", { month: "short" });
};
const fmtTime = (iso) => {
  const d = new Date(iso);
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
};
const isoDay = (iso) => (iso ? dkey(new Date(iso)) : "");

const S = {
  tasks: [],
  todos: [],
  routine: [],
  day: {},
  refl: {},
  cats: [],
  view: "today",
  catFilter: null,
  stFilter: "open",
  mode: "todo",
  ready: false,
  dayOff: 0,
  rtFilter: "all",
};
const DAY_BACK = 90;
const viewKey = () => {
  const d = new Date();
  d.setDate(d.getDate() + S.dayOff);
  return dkey(d);
};
const keyDow = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
};
const isWeekend = (dow) => dow === 0 || dow === 6;
const dayDoc = (k) => S.day[k] || { done: {}, skip: {}, extra: [] };
let watchChecks = () => {};
let db = null;
const queues = {};
function write(path, fn) {
  // one write at a time per document
  queues[path] = (queues[path] || Promise.resolve()).then(fn).catch((e) => {
    console.error(e);
    toast(
      e && e.code === "quota_exceeded"
        ? "Storage is full. Delete old items to add more."
        : "Couldn't save. Check your connection and try again.",
    );
  });
  return queues[path];
}
function toast(msg, undo) {
  const t = $("#toast");
  t.textContent = msg;
  if (undo) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "t-undo";
    b.textContent = "Undo";
    b.onclick = () => {
      t.hidden = true;
      undo();
    };
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), undo ? 5000 : 2200);
}

document.addEventListener("click", (e) => {
  const x = e.target.closest && e.target.closest("[data-dlg-x]");
  if (x) {
    e.preventDefault();
    x.closest("dialog").close();
  }
});
// ---------- dates typed and shown as dd/mm/yyyy everywhere (browsers set to US English show mm/dd)
(() => {
  const VD = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  const show = (v) => {
    const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(v || "");
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
  };
  const parse = (t) => {
    t = (t || "").trim();
    let m = /^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2}|\d{4})$/.exec(t) || /^(\d{2})(\d{2})(\d{2}|\d{4})$/.exec(t);
    if (!m) return null;
    const d = +m[1],
      mo = +m[2],
      y = m[3].length === 2 ? 2000 + +m[3] : +m[3],
      dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
      ? `${y}-${pad(mo)}-${pad(d)}`
      : null;
  };
  function enhance(inp) {
    if (inp.__dd || inp.hasAttribute("data-native")) return;
    inp.__dd = true;
    const wrap = document.createElement("span");
    wrap.className = "dd-wrap";
    ["maxWidth", "width", "flex"].forEach((p) => {
      if (inp.style[p]) wrap.style[p] = inp.style[p];
    });
    const txt = document.createElement("input");
    txt.type = "text";
    txt.inputMode = "numeric";
    txt.autocomplete = "off";
    txt.placeholder = "dd/mm/yyyy";
    txt.className = (inp.className || "") + " dd-text";
    if (inp.getAttribute("style")) txt.setAttribute("style", inp.getAttribute("style"));
    txt.style.width = "100%";
    txt.style.maxWidth = "none";
    txt.setAttribute("aria-label", inp.getAttribute("aria-label") || "Date (day/month/year)");
    if (inp.disabled) txt.disabled = true;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dd-pick";
    btn.tabIndex = -1;
    btn.setAttribute("aria-label", "Open calendar");
    btn.innerHTML = SVG(ICON.calendar);
    inp.parentNode.insertBefore(wrap, inp);
    wrap.append(txt, btn, inp);
    inp.classList.add("dd-native");
    inp.tabIndex = -1;
    const sync = () => {
      if (document.activeElement !== txt || !txt.value) txt.value = show(VD.get.call(inp));
    };
    Object.defineProperty(inp, "value", {
      configurable: true,
      get() {
        return VD.get.call(this);
      },
      set(v) {
        VD.set.call(this, v);
        sync();
      },
    });
    sync();
    const commit = (v) => {
      if (VD.get.call(inp) === v) return;
      VD.set.call(inp, v);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    };
    txt.addEventListener("input", (e) => {
      if (/\/\//.test(txt.value)) txt.value = txt.value.replace(/\/{2,}/g, "/");
      else if (e.inputType === "insertText" && /\d$/.test(e.data || "") && /^\d{2}$|^\d{1,2}\/\d{2}$/.test(txt.value))
        txt.value += "/";
      const full = /\d{4}$/.test(txt.value.trim()),
        v = full ? parse(txt.value) : null;
      txt.classList.toggle("dd-bad", full && !v);
      if (v) commit(v);
    });
    txt.addEventListener("blur", () => {
      const t = txt.value.trim();
      if (!t) {
        if (!inp.required) commit("");
        else txt.value = show(VD.get.call(inp));
      } else {
        const v = parse(t);
        if (v) {
          commit(v);
          txt.value = show(v);
        } else {
          toast("Type the date as dd/mm/yyyy, e.g. 03/11/2026");
          txt.value = show(VD.get.call(inp));
        }
      }
      txt.classList.remove("dd-bad");
    });
    txt.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const v = parse(txt.value);
        if (v) commit(v);
      }
    });
    inp.addEventListener("change", () => {
      if (document.activeElement !== txt) txt.value = show(VD.get.call(inp));
    });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        inp.showPicker();
      } catch {
        inp.focus();
        inp.click();
      }
    });
  }
  const scan = (root) => (root.querySelectorAll ? root.querySelectorAll('input[type="date"]') : []).forEach(enhance);
  new MutationObserver((ms) =>
    ms.forEach((m) =>
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.matches && n.matches('input[type="date"]')) enhance(n);
        else scan(n);
      }),
    ),
  ).observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => scan(document));
})();

// ---------- swipe left on a task card to delete (phone)
const SW = { card: null, x0: 0, y0: 0, base: 0, dx: 0, mode: "", open: null, swiped: 0 };
const swSet = (c, x, anim) => {
  c.classList.toggle("sw-anim", !!anim);
  c.style.setProperty("--sx", x + "px");
  c.classList.toggle("sw-on", x < 0);
};
function swClose() {
  if (SW.open) {
    swSet(SW.open, 0, true);
    SW.open = null;
  }
}
function swipeDelete(id) {
  const t = S.tasks.find((x) => x.id === id);
  if (!t) return;
  const copy = strip(t);
  if (S.timer && S.timer.ref === id) hub.stopTimer(false);
  del("tasks", id);
  SW.open = null;
  toast("Task deleted", () => {
    put("tasks", id, copy);
    toast("Task restored");
  });
}
document.addEventListener(
  "touchstart",
  (e) => {
    const c = e.target.closest && e.target.closest("div.task[data-task]");
    if (SW.open && SW.open !== c) {
      swClose();
      SW.swiped = Date.now();
    }
    if (!c || e.touches.length > 1) {
      SW.card = null;
      return;
    }
    SW.card = c;
    SW.x0 = e.touches[0].clientX;
    SW.y0 = e.touches[0].clientY;
    SW.base = SW.open === c ? -88 : 0;
    SW.dx = 0;
    SW.mode = "";
  },
  { passive: true },
);
document.addEventListener(
  "touchmove",
  (e) => {
    const c = SW.card;
    if (!c) return;
    const dx = e.touches[0].clientX - SW.x0,
      dy = e.touches[0].clientY - SW.y0;
    if (!SW.mode) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) SW.mode = "x";
      else if (Math.abs(dy) > 8) {
        SW.mode = "y";
        SW.card = null;
        return;
      } else return;
    }
    if (e.cancelable) e.preventDefault();
    SW.dx = dx;
    const w = c.offsetWidth,
      x = Math.min(0, Math.max(-w, SW.base + dx));
    swSet(c, x, false);
    c.classList.toggle("sw-far", x < -w * 0.55);
  },
  { passive: false },
);
document.addEventListener("touchend", () => {
  const c = SW.card;
  SW.card = null;
  if (!c || SW.mode !== "x") return;
  SW.swiped = Date.now();
  const w = c.offsetWidth,
    x = Math.min(0, SW.base + SW.dx);
  c.classList.remove("sw-far");
  if (x < -w * 0.55) {
    swSet(c, -w, true);
    setTimeout(() => swipeDelete(c.dataset.task), 180);
  } else if (x < -44) {
    swSet(c, -88, true);
    SW.open = c;
  } else {
    swSet(c, 0, true);
    if (SW.open === c) SW.open = null;
  }
});
document.addEventListener("touchcancel", () => {
  const c = SW.card;
  SW.card = null;
  if (c && SW.mode === "x") swSet(c, SW.open === c ? -88 : 0, true);
});
document.addEventListener(
  "click",
  (e) => {
    const a = e.target.closest && e.target.closest(".sw-act");
    if (a) {
      e.preventDefault();
      e.stopPropagation();
      swipeDelete(a.closest("[data-task]").dataset.task);
      return;
    }
    const c = e.target.closest && e.target.closest("div.task[data-task]");
    if (Date.now() - SW.swiped < 400 || (SW.open && (c === SW.open || !c))) {
      if (c || SW.open) {
        e.preventDefault();
        e.stopPropagation();
      }
      swClose();
      SW.swiped = 0;
    }
  },
  true,
);

// ---------- keep the page behind a pop-up window still (stops the window drifting on iPhone)
(() => {
  let y = 0,
    n = 0;
  const lock = () => {
    if (n++) return;
    y = window.scrollY;
    const b = document.body.style;
    b.position = "fixed";
    b.top = -y + "px";
    b.left = "0";
    b.right = "0";
    b.width = "100%";
  };
  const unlock = () => {
    if (!n || --n) return;
    const b = document.body.style;
    b.position = b.top = b.left = b.right = b.width = "";
    window.scrollTo(0, y);
  };
  const show = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function () {
    const was = this.open;
    show.call(this);
    if (!was && !this.__lk) {
      this.__lk = 1;
      lock();
      this.addEventListener(
        "close",
        () => {
          this.__lk = 0;
          unlock();
        },
        { once: true },
      );
    }
  };
})();

// ---------- data ops (db or in-memory fallback)
function newId() {
  return db ? db.collection("tasks").doc().id : Math.random().toString(36).slice(2, 12);
}
function put(coll, id, data) {
  const list =
    coll === "tasks"
      ? S.tasks
      : coll === "todos"
        ? S.todos
        : coll === "routine"
          ? S.routine
          : coll === "body"
            ? S.body
            : coll === "conditions"
              ? S.conds
              : coll === "courses"
                ? S.courses
                : coll === "shop"
                  ? S.shop
                  : coll === "expenses"
                    ? S.exp
                    : coll === "subjects"
                      ? S.subjects
                      : coll === "classes"
                        ? S.classes
                        : coll === "assignments"
                          ? S.asg
                          : coll === "snotes"
                            ? S.snotes
                            : null;
  if (!db && list) {
    const i = list.findIndex((x) => x.id === id);
    const row = { ...data, id };
    i >= 0 ? list.splice(i, 1, row) : list.push(row);
    hub.render();
    return;
  }
  if (!db) {
    hub.render();
    return;
  }
  return write(coll + "/" + id, () => db.doc(coll + "/" + id).set(data));
}
function del(coll, id) {
  const list = coll === "tasks" ? S.tasks : coll === "todos" ? S.todos : S.routine;
  if (!db) {
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) list.splice(i, 1);
    hub.render();
    return;
  }
  return write(coll + "/" + id, () => db.doc(coll + "/" + id).delete());
}
const strip = (o) => {
  const c = { ...o };
  delete c.id;
  return c;
};

// ---------- categories
const DEFAULT_CATS = [
  { name: "SQL / Database", tag: "sql" },
  { name: "Excel / Reporting", tag: "excel" },
  { name: "Python / Automation", tag: "python" },
  { name: "Admin / Documentation", tag: "admin" },
];
function saveCats() {
  if (!db) {
    hub.render();
    return;
  }
  write("settings/main", () =>
    db
      .doc("settings/main")
      .set({
        categories: S.cats,
        org: S.org || "",
        name: S.name || "",
        calSync: S.calSync || null,
        waterGoal: S.waterGoal || 8,
        showCycle: S.showCycle !== false,
        cur: S.cur || "RM",
        budget: S.budget || 0,
        shopHist: S.shopHist || [],
        semStart: S.semStart || "",
        semWeeks: S.semWeeks || 14,
        prevCgpa: S.prevCgpa || "",
        prevCredits: S.prevCredits || "",
        curSem: S.curSem || "",
        semBreaks: S.semBreaks || [],
        palette: S.palette || "nature",
      }),
  );
}

// ---------- look & feel helpers
const SVG = (p) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
  meal: '<path d="M4 3v7a2 2 0 0 0 2 2h1v9"/><path d="M8 3v6"/><path d="M6 3v6"/><path d="M18 21V3c-2 1-3 3.5-3 7v4h3"/>',
  supplement:
    '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-40 12 12)"/><path d="m9.2 9.6 5.2 4.6"/>',
  break:
    '<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 2.5v2.5M12 2.5v2.5"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  study: '<path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  class: '<path d="m22 9-10-5L2 9l10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>',
  health: '<path d="M19.5 13.5 12 21l-7.5-7.5A5 5 0 0 1 12 6a5 5 0 0 1 7.5 7.5z"/>',
  other: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>',
  swim: '<path d="M2 16c2 0 2-1.5 4-1.5S8 16 10 16s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><path d="M2 20c2 0 2-1.5 4-1.5S8 20 10 20s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><circle cx="16" cy="6" r="2"/><path d="m6 12 4-5 4 3"/>',
  sleep: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  wake: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  chores: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>',
  plan: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="m9 15 2 2 4-4"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2.5"/>',
  repeat:
    '<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  steps:
    '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.5 1.5L7.5 5"/><path d="m3.5 12 1.5 1.5 2.5-2.5"/><circle cx="5" cy="18" r="1.5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  note: '<path d="M4 4h16v11l-5 5H4z"/><path d="M15 20v-5h5"/><path d="M8 9h8M8 13h4"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  flame:
    '<path d="M12 22c4 0 7-2.7 7-6.8 0-3.6-2.3-5.6-3.6-7.6-.4 1.7-1.3 2.9-2.4 3.4.3-3.1-1-6.6-3.9-9-.3 3.6-2.5 5.6-4 7.7C3.9 11.6 5 13.2 5 15.2 5 19.3 8 22 12 22z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h12v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13.5h2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
};
function iconKey(r) {
  const l = (r.label || "").toLowerCase();
  if (/swim/.test(l)) return "swim";
  if (/sleep|bed\b/.test(l)) return "sleep";
  if (/wake/.test(l)) return "wake";
  if (/water/.test(l) && !/wake/.test(l)) return "water";
  if (/chore|laundry|grocer|errand|clean/.test(l)) return "chores";
  if (/plan|review/.test(l) && r.kind !== "work") return "plan";
  if (/reflect/.test(l)) return "study";
  return ICON[r.kind] ? r.kind : "other";
}
const routineIcon = (r) => `<span class="ri ri-${esc(r.kind || "other")}">${SVG(ICON[iconKey(r)])}</span>`;
const CAT_N = 6;
function catIdx(tag) {
  const i = S.cats.findIndex((c) => c.tag === tag);
  if (i >= 0) return i % CAT_N;
  let h = 0;
  for (const ch of String(tag || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % CAT_N;
}
const catTag = (tag) =>
  tag ? `<span class="tag cat-${catIdx(tag)}">${esc(catName(tag))}</span>` : `<span class="tag">Uncategorised</span>`;
function greeting() {
  const h = new Date().getHours();
  return h < 5
    ? "Good night"
    : h < 12
      ? "Good morning"
      : h < 17
        ? "Good afternoon"
        : h < 22
          ? "Good evening"
          : "Good night";
}
function ring(pct, size = 86) {
  const r = 36,
    c = 2 * Math.PI * r,
    p = Math.max(0, Math.min(100, pct || 0));
  return `<svg class="ring" viewBox="0 0 90 90" width="${size}" height="${size}" role="img" aria-label="${p}% of today's routine done"><circle cx="45" cy="45" r="${r}" class="ring-bg"/><circle cx="45" cy="45" r="${r}" class="ring-fg" stroke-dasharray="${((c * p) / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 45 45)"/><text x="45" y="50" text-anchor="middle">${p}%</text></svg>`;
}

// ---------- theme switch
const THEMES = ["auto", "light", "dark"];
function applyTheme(t) {
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const b = $("#theme");
  if (b) {
    b.innerHTML = SVG(ICON[t === "auto" ? "auto" : t === "light" ? "sun" : "moon"]);
    b.setAttribute("aria-label", "Theme: " + (t === "auto" ? "match device" : t));
    b.title = "Theme: " + (t === "auto" ? "match device" : t);
  }
}
let THEME = "auto";
try {
  THEME = localStorage.getItem("daybook-theme") || "auto";
} catch {}
const PALETTES = [
  ["nature", "Nature", ["#59789f", "#a9b6c4", "#ece69d", "#7a9445", "#243c2c"], "#edf0ef", "#243c2c"],
  ["lotus", "Lotus pond", ["#0a3323", "#839958", "#f7f4d5", "#d3968c", "#105666"], "#f3f0d3", "#0a3323"],
  ["autumn", "Autumn", ["#6b2717", "#cc9e4c", "#e0d0b6", "#8b9ea5", "#442c1b"], "#f6efe4", "#221811"],
  ["breeze", "Summer breeze", ["#e8f957", "#bbe11a", "#c1e5fb", "#86d0fd", "#4891e7", "#042c8f"], "#e3f3fd", "#04277e"],
  ["garden", "Rose garden", ["#414c39", "#9ea98d", "#eee8da", "#c7a19b", "#896d59"], "#f7f5ee", "#2b3226"],
  ["koi", "Golden koi", ["#11284d", "#264b6f", "#101a2c", "#f4efdf", "#d5b370"], "#faf8f1", "#112240"],
  ["linen", "Fresh linen", ["#f2f6f7", "#80ecf2", "#59b5f6", "#5d94e6", "#3467b5", "#db89dd"], "#eaf6fb", "#183055"],
  ["lime", "Lime soda", ["#0b2558", "#1c618b", "#2d90a7", "#3fbfc0", "#53f2b8", "#d0feff"], "#eaffff", "#0b2558"],
  ["shoal", "Golden shoal", ["#161f33", "#4b5972", "#32476a", "#1b2b49", "#d5b050"], "#f2f4f8", "#18253e"],
  ["coast", "Bougainvillea", ["#933b5b", "#b5728a", "#aabaae", "#e3d6bf", "#9f9679"], "#f2ede2", "#4f2031"],
  ["osaka", "Osaka street", ["#70191d", "#970a12", "#d1601f", "#fecd6d", "#5686bb"], "#fef5e4", "#5e1518"],
  ["lotustea", "Lotus tea", ["#e6fff8", "#f390a3", "#91c51a", "#3b7200", "#011901"], "#f4fffc", "#1c3c00"],
  ["sakura", "Sakura", ["#afc867", "#5e504b", "#dd839b", "#eeb1cb", "#f1cfd3"], "#f9e9eb", "#372e2c"],
  ["tokyo", "Tokyo night", ["#f1444e", "#ffae81", "#c9947a", "#4b536b", "#212934"], "#fbf3ee", "#212934"],
  ["winter", "Winter lake", ["#f0ecdd", "#8ba3c5", "#495b7d", "#23354d", "#02122f"], "#f8f6f0", "#162741"],
  ["dusk", "Winter dusk", ["#525871", "#857c91", "#cd9fa0", "#f2c1a3", "#f8ccaa"], "#fcf2ea", "#2c303d"],
  ["town", "Colour town", ["#fba31e", "#8d9625", "#406113", "#4ea2c0", "#e3a5aa"], "#faf2ea", "#23350a"],
];
const PAL = Object.fromEntries(PALETTES.map((p) => [p[0], p]));
function renderPalettes() {
  const row = $("#pal-row");
  if (!row) return;
  row.innerHTML = PALETTES.map(
    ([id, name, sw]) =>
      `<button type="button" class="pal" data-pal="${id}" aria-pressed="${S.palette === id}"><span class="pal-sw">${sw.map((c) => `<i style="background:${c}"></i>`).join("")}</span>${esc(name)}</button>`,
  ).join("");
}
// the header banner scene follows the theme; Nature uses the foggy mountains already in index.html
const NATURE_SCENE = document.querySelector("#hbanner .scene")?.outerHTML || "";
function applyScene(p) {
  const old = document.querySelector("#hbanner .scene");
  if (!old || old.classList.contains("scene-" + p) || (p === "nature" && !old.className.baseVal.includes("scene-"))) return;
  const html = sceneSVG(p, PAL[p][2]) || NATURE_SCENE;
  old.insertAdjacentHTML("beforebegin", html);
  old.remove();
}
function applyPalette(p) {
  p = PAL[p] ? p : "nature";
  S.palette = p;
  applyScene(p);
  if (p === "nature") delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = p;
  try {
    localStorage.setItem("daybook-palette", p);
  } catch {}
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m, i) => m.setAttribute("content", i ? PAL[p][4] : PAL[p][3]));
  document.querySelectorAll("[data-pal]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.pal === p));
}
try {
  applyPalette(localStorage.getItem("daybook-palette") || "nature");
} catch {
  applyPalette("nature");
}
renderPalettes();
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-pal]");
  if (!b) return;
  applyPalette(b.dataset.pal);
  saveCats();
  toast("Theme: " + PAL[S.palette][1]);
});
applyTheme(THEME);
$("#theme").addEventListener("click", () => {
  THEME = THEMES[(THEMES.indexOf(THEME) + 1) % 3];
  try {
    localStorage.setItem("daybook-theme", THEME);
  } catch {}
  applyTheme(THEME);
  toast(THEME === "auto" ? "Theme: matches your device" : THEME === "light" ? "Theme: light" : "Theme: dark");
});
function catByTag(t) {
  t = t.toLowerCase();
  return (
    S.cats.find((c) => c.tag === t) ||
    S.cats.find((c) => c.tag.startsWith(t)) ||
    S.cats.find((c) => c.name.toLowerCase().includes(t))
  );
}
const catName = (tag) => (S.cats.find((c) => c.tag === tag) || { name: tag || "Uncategorised" }).name;

export {
  $,
  CFG,
  DAYS,
  DAY_BACK,
  DEFAULT_CATS,
  ICON,
  KINDS,
  S,
  SEED,
  STATUS,
  STATUS_LABEL,
  STUDY_PLAN,
  SVG,
  URG,
  URG_RANK,
  applyPalette,
  catByTag,
  catIdx,
  catName,
  catTag,
  collection,
  createUserWithEmailAndPassword,
  dayDoc,
  del,
  deleteDoc,
  dkey,
  doc,
  esc,
  firebaseConfig,
  fmtDate,
  fmtTime,
  getAuth,
  getDoc,
  getDocs,
  getFirestore,
  getFunctions,
  getMessaging,
  getToken,
  greeting,
  httpsCallable,
  initializeApp,
  initializeFirestore,
  isWeekend,
  isoDay,
  keyDow,
  limit,
  messagingSupported,
  newId,
  nowISO,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  pad,
  persistentLocalCache,
  persistentMultipleTabManager,
  put,
  query,
  ring,
  routineIcon,
  saveCats,
  sendPasswordResetEmail,
  setDoc,
  signInWithEmailAndPassword,
  signOut,
  strip,
  toast,
  todayKey,
  updateDoc,
  viewKey,
  where,
  write,
  writeBatch,
};
