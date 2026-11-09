// Global clicks, Firebase adapter, live data, backup, sign-in and start-up
import { hub } from "./registry.js";
import {
  $,
  DAY_BACK,
  DEFAULT_CATS,
  S,
  SEED,
  applyPalette,
  collection,
  dayDoc,
  del,
  deleteDoc,
  doc,
  fmtTime,
  getDoc,
  getDocs,
  limit,
  nowISO,
  onSnapshot,
  orderBy,
  put,
  query,
  saveCats,
  setDoc,
  strip,
  toast,
  todayKey,
  updateDoc,
  viewKey,
  where,
  writeBatch,
} from "./core.js";
import { updateHint } from "./quick-add.js";
import { route } from "./nav.js";
import { renderToday, renderWork, routineFor, saveDay, syncRoutineTime } from "./today.js";
import { openTask } from "./tasks.js";
import { spTicked } from "./courses.js";
import { refreshPush } from "./alarms.js";
import { syncFireFields } from "./routine.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  APP: {
    get: () => APP,
    set: (v) => {
      APP = v;
    },
    enumerable: true,
  },
  FS: {
    get: () => FS,
    set: (v) => {
      FS = v;
    },
    enumerable: true,
  },
  UID: {
    get: () => UID,
    set: (v) => {
      UID = v;
    },
    enumerable: true,
  },
});

// ---------- global clicks
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-task]");
  if (t) {
    openTask(t.dataset.task);
    return;
  }
  const st = e.target.closest("[data-st]");
  if (st) {
    S.stFilter = S.stFilter === st.dataset.st && st.classList.contains("stat") ? "open" : st.dataset.st;
    renderWork();
    return;
  }
  const c = e.target.closest("[data-cat]");
  if (c) {
    S.catFilter = c.dataset.cat === "" ? null : S.catFilter === c.dataset.cat ? null : c.dataset.cat;
    renderWork();
    return;
  }
  const dt = e.target.closest("[data-deltodo]");
  if (dt) {
    del("todos", dt.dataset.deltodo);
    return;
  }
  const off = e.target.closest("[data-dayoff]");
  if (off) {
    S.dayOff = Math.max(-DAY_BACK, Math.min(6, S.dayOff + +off.dataset.dayoff));
    S.rtEdit = null;
    hub.watchChecks();
    renderToday();
    return;
  }
  if (e.target.closest("[data-dayreset]")) {
    S.dayOff = 0;
    hub.watchChecks();
    renderToday();
    return;
  }
  const sk = e.target.closest("[data-skip]");
  if (sk) {
    const k = viewKey(),
      dd = dayDoc(k),
      s = { ...(dd.skip || {}) };
    if (s[sk.dataset.skip]) delete s[sk.dataset.skip];
    else s[sk.dataset.skip] = true;
    saveDay(k, { ...dd, skip: s });
    return;
  }
  const dx = e.target.closest("[data-delextra]");
  if (dx) {
    const k = viewKey(),
      dd = dayDoc(k),
      x0 = (dd.extra || []).find((x) => x.id === dx.dataset.delextra),
      skip = { ...(dd.skip || {}) };
    if (x0 && x0.from) {
      delete skip[x0.from];
    }
    saveDay(k, { ...dd, skip, extra: (dd.extra || []).filter((x) => x.id !== dx.dataset.delextra) });
    if (x0 && x0.from) toast("Back to your usual routine");
    return;
  }
  const ov = e.target.closest("[data-ovr]");
  if (ov) {
    S.ovRange = +ov.dataset.ovr;
    hub.renderOverview();
    return;
  }
  const ot = e.target.closest("[data-ovt]");
  if (ot) {
    S.ovOpen = S.ovOpen === ot.dataset.ovt ? null : ot.dataset.ovt;
    hub.renderOverview();
    if (S.ovOpen && matchMedia("(max-width:700px)").matches)
      $("#ov-detail").scrollIntoView({ block: "nearest", behavior: "smooth" });
    return;
  }
  const od = e.target.closest("[data-ovday]");
  if (od) {
    S.calSel = od.dataset.ovday;
    const [y, m] = od.dataset.ovday.split("-").map(Number);
    S.calY = y;
    S.calM = m - 1;
    location.hash = "#work-calendar";
    return;
  }
  const rf = e.target.closest("[data-rtf]");
  if (rf) {
    S.rtFilter = rf.dataset.rtf;
    hub.renderRoutine();
    return;
  }
  const ps = e.target.closest("[data-preset]");
  if (ps) {
    const r = S.routine.find((y) => y.id === ps.closest("[data-rid]").dataset.rid);
    const days = { all: [0, 1, 2, 3, 4, 5, 6], wd: [1, 2, 3, 4, 5], we: [0, 6] }[ps.dataset.preset];
    if (r) hub.saveRt({ ...r, days });
    return;
  }
  const rd = e.target.closest("[data-rdate]");
  if (rd) {
    hub.rDate = rd.dataset.rdate;
    hub.rDirty = false;
    hub.rDraft = null;
    if (S.arcArea) hub.rArea = S.arcArea;
    if (S.main === "journal" && S.sub !== "reflection") {
      location.hash = "#journal";
    } else {
      hub.renderReflect();
      window.scrollTo({ top: 0 });
    }
  }
});
document.addEventListener("change", (e) => {
  const ck = e.target.closest("[data-check]");
  if (ck) {
    const k = viewKey();
    const dd = dayDoc(k);
    const cur = { ...(dd.done || {}) };
    const r = routineFor(k).find((x) => x.id === ck.dataset.check);
    if (ck.checked) cur[ck.dataset.check] = k < todayKey() && r ? r.time : fmtTime(nowISO());
    else delete cur[ck.dataset.check];
    saveDay(k, { ...dd, done: cur });
  }
  const td = e.target.closest("[data-todo]");
  if (td) {
    const t = S.todos.find((x) => x.id === td.dataset.todo);
    if (t) {
      put("todos", t.id, { ...strip(t), done: td.checked, doneAt: td.checked ? nowISO() : "" });
      if (t.plan === "sp16") spTicked(t, td.checked);
    }
  }
});
setInterval(() => {
  if (S.view === "today" && !document.querySelector("dialog[open]")) renderToday();
}, 60000);

// ---------- Firebase data adapter (same shape the rest of the app uses)
function mkdb(fs, uid) {
  const base = "users/" + uid + "/";
  const wrapDoc = (s) => ({ id: s.id, exists: s.exists(), data: () => s.data() });
  const wrapQ = (s) => ({
    docs: s.docs.map((d) => ({ id: d.id, exists: true, data: () => d.data() })),
    size: s.size,
    empty: s.empty,
  });
  const docRef = (r) => ({
    id: r.id,
    path: r.path,
    set: (d) => setDoc(r, d),
    update: (d) => updateDoc(r, d),
    delete: () => deleteDoc(r),
    get: async () => wrapDoc(await getDoc(r)),
    onSnapshot: (n, e) => onSnapshot(r, (s) => n(wrapDoc(s)), e),
  });
  const q = (c, cons = []) => ({
    orderBy: (f, d) => q(c, [...cons, orderBy(f, d || "asc")]),
    limit: (n) => q(c, [...cons, limit(n)]),
    where: (f, o, v) => q(c, [...cons, where(f, o, v)]),
    get: async () => wrapQ(await getDocs(query(c, ...cons))),
    onSnapshot: (n, e) => onSnapshot(query(c, ...cons), (s) => n(wrapQ(s)), e),
  });
  return {
    doc: (p) => docRef(doc(fs, base + p)),
    collection: (p) => {
      const c = collection(fs, base + p);
      return Object.assign(q(c), {
        path: c.path,
        doc: (id) => docRef(id ? doc(c, id) : doc(c)),
        add: async (d) => {
          const r = doc(c);
          await setDoc(r, d);
          return docRef(r);
        },
      });
    },
  };
}
let FS = null,
  UID = null,
  APP = null;
async function seedIfEmpty() {
  const s = await getDoc(doc(FS, "users/" + UID + "/settings/main"));
  if (s.exists()) return;
  const b = writeBatch(FS);
  b.set(doc(FS, "users/" + UID + "/settings/main"), SEED.settings);
  for (const [id, r] of Object.entries(SEED.routine)) b.set(doc(FS, "users/" + UID + "/routine/" + id), r);
  for (const [id, t] of Object.entries(SEED.tasks)) b.set(doc(FS, "users/" + UID + "/tasks/" + id), t);
  await b.commit();
}
function dataProblem(e) {
  console.error(e);
  if (e && e.code === "permission-denied") {
    $("#rules").hidden = false;
  }
}

// ---------- live data
function startData() {
  const fail = dataProblem;
  let loaded = 0;
  const mark = () => {
    if (++loaded >= 5) {
      S.ready = true;
      hub.leaveSplash();
    }
    hub.render();
  };
  const sub = (coll, key) => {
    let first = true;
    hub.db.collection(coll).onSnapshot((s) => {
      S[key] = s.docs.map((d) => ({ ...d.data(), id: d.id }));
      if (first) {
        first = false;
        mark();
      } else hub.render();
    }, fail);
  };
  sub("tasks", "tasks");
  sub("todos", "todos");
  {
    let first = true;
    hub.db.collection("routine").onSnapshot((s) => {
      S.routine = s.docs.map((d) => ({ ...d.data(), id: d.id }));
      if (first) {
        first = false;
        mark();
        refreshPush(true);
      } else {
        hub.render();
        syncRoutineTime(viewKey());
      }
      clearTimeout(syncFireFields._t);
      syncFireFields._t = setTimeout(syncFireFields, 1500);
    }, fail);
  }
  hub.db
    .collection("health")
    .orderBy("date", "desc")
    .limit(400)
    .onSnapshot((s) => {
      const o = {};
      s.docs.forEach((d) => (o[d.id] = d.data()));
      S.health = o;
      hub.render();
    }, fail);
  hub.db.collection("subjects").onSnapshot((s) => {
    S.subjects = s.docs
      .map((d) => ({ ...d.data(), id: d.id }))
      .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    hub.render();
  }, fail);
  hub.db.collection("classes").onSnapshot((s) => {
    S.classes = s.docs.map((d) => ({ ...d.data(), id: d.id }));
    hub.render();
  }, fail);
  hub.db.collection("reports").onSnapshot((s) => {
    const o = {};
    s.docs.forEach((d) => (o[d.id] = d.data()));
    S.reports = o;
    S.repLoaded = true;
    hub.render();
  }, fail);
  hub.db.collection("snotes").onSnapshot((s) => {
    S.snotes = s.docs.map((d) => ({ ...d.data(), id: d.id }));
    hub.render();
  }, fail);
  hub.db.collection("assignments").onSnapshot((s) => {
    S.asg = s.docs.map((d) => ({ ...d.data(), id: d.id }));
    hub.render();
  }, fail);
  hub.db.collection("shop").onSnapshot((s) => {
    S.shop = s.docs
      .map((d) => ({ ...d.data(), id: d.id }))
      .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    hub.render();
  }, fail);
  hub.db
    .collection("expenses")
    .orderBy("date", "desc")
    .limit(3000)
    .onSnapshot((s) => {
      S.exp = s.docs.map((d) => ({ ...d.data(), id: d.id }));
      hub.render();
    }, fail);
  hub.db.collection("body").onSnapshot((s) => {
    S.body = s.docs.map((d) => ({ ...d.data(), id: d.id }));
    hub.render();
  }, fail);
  hub.db.collection("conditions").onSnapshot((s) => {
    S.conds = s.docs.map((d) => ({ ...d.data(), id: d.id }));
    hub.render();
  }, fail);
  hub.db.collection("courses").onSnapshot((s) => {
    S.courses = s.docs.map((d) => ({ ...d.data(), id: d.id }));
    hub.render();
  }, fail);
  hub.db
    .collection("time")
    .orderBy("start", "desc")
    .limit(1500)
    .onSnapshot((s) => {
      S.time = s.docs.map((d) => ({ ...d.data(), id: d.id }));
      hub.render();
    }, fail);
  hub.db.doc("settings/timer").onSnapshot((s) => {
    const t = s.exists ? s.data() : null;
    const changed = JSON.stringify(t) !== JSON.stringify(S.timer);
    S.timer = t && t.start ? t : null;
    if (changed) hub.render();
  }, fail);
  let f1 = true;
  hub.db.doc("settings/main").onSnapshot((s) => {
    const c = s.exists && s.data().categories;
    S.cats = c && c.length ? c.map((x) => ({ ...x })) : DEFAULT_CATS.slice();
    S.org = (s.exists && s.data().org) || "";
    S.name = (s.exists && s.data().name) || "";
    S.calSync = (s.exists && s.data().calSync) || null;
    if (s.exists && s.data().waterGoal) S.waterGoal = s.data().waterGoal;
    if (s.exists && s.data().showCycle === false) S.showCycle = false;
    if (s.exists) {
      const sd = s.data();
      if (sd.cur) S.cur = sd.cur;
      if (sd.budget) S.budget = sd.budget;
      if (Array.isArray(sd.shopHist)) S.shopHist = sd.shopHist;
      if (sd.semStart !== undefined) S.semStart = sd.semStart || "";
      if (sd.semWeeks) S.semWeeks = sd.semWeeks;
      if (sd.prevCgpa !== undefined) S.prevCgpa = sd.prevCgpa;
      if (sd.prevCredits !== undefined) S.prevCredits = sd.prevCredits;
      if (sd.curSem !== undefined) S.curSem = sd.curSem || "";
      if (Array.isArray(sd.semBreaks)) S.semBreaks = sd.semBreaks;
      if (sd.palette && sd.palette !== S.palette) applyPalette(sd.palette);
    }
    if (document.activeElement !== $("#org")) $("#org").value = S.org;
    if (document.activeElement !== $("#uname")) $("#uname").value = S.name;
    if (f1) {
      f1 = false;
      mark();
    } else hub.render();
  }, fail);
  let f2 = true;
  hub.db
    .collection("reflections")
    .orderBy("date", "desc")
    .limit(1000)
    .onSnapshot((s) => {
      const o = {};
      s.docs.forEach((d) => (o[d.id] = d.data()));
      S.refl = o;
      if (f2) {
        f2 = false;
        mark();
      } else hub.render();
    }, fail);
  let watchedDay = null,
    unsubCheck = null;
  hub.watchChecks = () => {
    const k = viewKey();
    if (k === watchedDay) return;
    watchedDay = k;
    if (unsubCheck) unsubCheck();
    unsubCheck = hub.db.doc("checks/" + k).onSnapshot((s) => {
      const d = s.exists ? s.data() : {};
      S.day[k] = { done: d.done || {}, skip: d.skip || {}, extra: d.extra || [] };
      hub.render();
    }, fail);
  };
  hub.watchChecks();
  setInterval(hub.watchChecks, 60000);
  hub.db
    .collection("checks")
    .orderBy("date", "desc")
    .limit(70)
    .onSnapshot((s) => {
      s.docs.forEach((d) => {
        const x = d.data();
        S.day[d.id] = { done: x.done || {}, skip: x.skip || {}, extra: x.extra || [] };
      });
      hub.render();
    }, fail);
}

// ---------- workplace line on reports
$("#org").addEventListener("change", () => {
  S.org = $("#org").value.trim();
  saveCats();
  toast(S.org ? "Saved. Reports will show this line." : "Removed from reports");
});

$("#uname").addEventListener("change", () => {
  S.name = $("#uname").value.trim();
  saveCats();
  hub.render();
  toast("Saved");
});

// ---------- backup
$("#bk-export").onclick = () => {
  const data = {
    app: "daybook",
    exportedAt: nowISO(),
    settings: { categories: S.cats },
    tasks: S.tasks,
    todos: S.todos,
    routine: S.routine,
    refl: S.refl,
    day: S.day,
    courses: S.courses,
    time: S.time,
    health: S.health,
    body: S.body,
    conditions: S.conds,
    shop: S.shop,
    expenses: S.exp,
    subjects: S.subjects,
    classes: S.classes,
    assignments: S.asg,
    snotes: S.snotes,
    reports: S.reports,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "daybook-backup-" + todayKey() + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast("Backup downloaded");
};
$("#bk-import").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f || !FS) return;
  try {
    const d = JSON.parse(await f.text());
    if (d.app !== "daybook") throw new Error("not a Daybook backup");
    const ops = [];
    if (d.settings) ops.push(["settings/main", d.settings]);
    (d.tasks || []).forEach((t) => ops.push(["tasks/" + t.id, strip(t)]));
    (d.todos || []).forEach((t) => ops.push(["todos/" + t.id, strip(t)]));
    (d.routine || []).forEach((t) => ops.push(["routine/" + t.id, strip(t)]));
    Object.entries(d.refl || {}).forEach(([k, v]) => ops.push(["reflections/" + k, v]));
    (d.courses || []).forEach((t) => ops.push(["courses/" + t.id, strip(t)]));
    (d.time || []).forEach((t) => ops.push(["time/" + t.id, strip(t)]));
    (d.body || []).forEach((t) => ops.push(["body/" + t.id, strip(t)]));
    (d.snotes || []).forEach((t) => ops.push(["snotes/" + t.id, strip(t)]));
    Object.entries(d.reports || {}).forEach(([k, v]) => ops.push(["reports/" + k, v]));
    (d.subjects || []).forEach((t) => ops.push(["subjects/" + t.id, strip(t)]));
    (d.classes || []).forEach((t) => ops.push(["classes/" + t.id, strip(t)]));
    (d.assignments || []).forEach((t) => ops.push(["assignments/" + t.id, strip(t)]));
    (d.shop || []).forEach((t) => ops.push(["shop/" + t.id, strip(t)]));
    (d.expenses || []).forEach((t) => ops.push(["expenses/" + t.id, strip(t)]));
    (d.conditions || []).forEach((t) => ops.push(["conditions/" + t.id, strip(t)]));
    Object.entries(d.health || {}).forEach(([k, v]) => ops.push(["health/" + k, v]));
    Object.entries(d.day || {}).forEach(([k, v]) =>
      ops.push(["checks/" + k, { date: k, done: v.done || {}, skip: v.skip || {}, extra: v.extra || [] }]),
    );
    for (let i = 0; i < ops.length; i += 400) {
      const b = writeBatch(FS);
      ops.slice(i, i + 400).forEach(([p, v]) => b.set(doc(FS, "users/" + UID + "/" + p), v));
      await b.commit();
    }
    toast("Backup restored: " + ops.length + " items");
  } catch (err) {
    console.error(err);
    toast("That file couldn't be restored. Choose a Daybook backup .json file.");
  }
};

// ---------- sign-in screen
const AUTH_MSG = {
  "auth/invalid-credential": "Email or password is wrong.",
  "auth/wrong-password": "Email or password is wrong.",
  "auth/user-not-found": "No account with that email. Tap Create account.",
  "auth/email-already-in-use": "That email already has an account. Tap Sign in.",
  "auth/weak-password": "Use a password with at least 6 characters.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/operation-not-allowed": "New accounts are switched off for this Daybook. Ask the owner to add you.",
  "auth/network-request-failed": "No internet connection. Connect and try again.",
  "auth/too-many-requests": "Too many tries. Wait a minute and try again.",
  "auth/unauthorized-domain":
    "This web address isn't allowed yet. Add it under Firebase Authentication → Settings → Authorized domains (setup step 6).",
  "auth/admin-restricted-operation": "New accounts are switched off for this Daybook. Ask the owner to add you.",
  "auth/configuration-not-found": "Email/Password sign-in isn't switched on in Firebase yet (setup step 2).",
};
function showAuth(mode) {
  $("#auth").hidden = false;
  document.body.classList.add("locked");
  $("#auth-loading").hidden = mode !== "loading";
  $("#auth-setup").hidden = mode !== "setup";
  $("#auth-form").hidden = mode !== "signin";
}
function hideAuth() {
  $("#auth").hidden = true;
  document.body.classList.remove("locked");
}
const authErr = (e) => {
  $("#auth-err").textContent = AUTH_MSG[e && e.code] || "Something went wrong: " + (e && (e.code || e.message));
};

// ---------- boot
route();
updateHint();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
const setOnline = () => {
  $("#offline").hidden = navigator.onLine;
};
addEventListener("online", setOnline);
addEventListener("offline", setOnline);
setOnline();

// keep sticky side panels below the header
const setHdr = () => {
  const h = document.querySelector("header.top");
  if (h) document.documentElement.style.setProperty("--hdr", h.offsetHeight + "px");
};
addEventListener("resize", setHdr);
setHdr();
setTimeout(setHdr, 500);
// glass behind the dock once the misty banner has scrolled away
const stuckHdr = () => {
  const b = $("#hbanner"),
    h = document.querySelector("header.top");
  if (b && h) h.classList.toggle("stuck", b.getBoundingClientRect().bottom <= 2);
};
addEventListener("scroll", stuckHdr, { passive: true });
stuckHdr();

export { authErr, dataProblem, hideAuth, mkdb, seedIfEmpty, showAuth, startData };
