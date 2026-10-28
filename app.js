// Daybook app logic. Data lives in your own Firebase project.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, onSnapshot, query, orderBy, limit, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getMessaging, getToken, isSupported as messagingSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import * as CFG from "./firebase-config.js";
const firebaseConfig = CFG.firebaseConfig;
import { SEED } from "./seed.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad = n => String(n).padStart(2,"0");
const dkey = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const todayKey = () => dkey(new Date());
const nowISO = () => new Date().toISOString();
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const URG = ["critical","high","medium","low"];
const URG_RANK = {critical:0,high:1,medium:2,low:3};
const STATUS = [["todo","Not started"],["doing","In progress"],["blocked","Blocked"],["done","Done"]];
const STATUS_LABEL = Object.fromEntries(STATUS);
const KINDS = [["meal","Meal"],["supplement","Supplement"],["break","Break"],["work","Work"],["study","Study"],["class","Class"],["health","Health"],["other","Other"]];
const fmtDate = k => { if(!k) return ""; const [y,m,d]=k.split("-").map(Number); const dt=new Date(y,m-1,d); return DAYS[dt.getDay()]+", "+d+" "+dt.toLocaleString("en-GB",{month:"short"}); };
const fmtTime = iso => { const d=new Date(iso); return pad(d.getHours())+":"+pad(d.getMinutes()); };
const isoDay = iso => iso ? dkey(new Date(iso)) : "";

const S = { tasks:[], todos:[], routine:[], day:{}, refl:{}, cats:[], view:"today", catFilter:null, stFilter:"open", mode:"todo", ready:false, dayOff:0, rtFilter:"all" };
const viewKey = () => { const d=new Date(); d.setDate(d.getDate()+S.dayOff); return dkey(d); };
const keyDow = k => { const [y,m,d]=k.split("-").map(Number); return new Date(y,m-1,d).getDay(); };
const isWeekend = dow => dow===0 || dow===6;
const dayDoc = k => S.day[k] || {done:{},skip:{},extra:[]};
let watchChecks = () => {};
let db = null;
const queues = {};
function write(path, fn){ // one write at a time per document
  queues[path] = (queues[path]||Promise.resolve()).then(fn).catch(e => { console.error(e); toast(e && e.code==="quota_exceeded" ? "Storage is full. Delete old items to add more." : "Couldn't save. Check your connection and try again."); });
  return queues[path];
}
function toast(msg, undo){ const t=$("#toast"); t.textContent=msg; if(undo){ const b=document.createElement("button"); b.type="button"; b.className="t-undo"; b.textContent="Undo"; b.onclick=()=>{ t.hidden=true; undo(); }; t.append(b); } t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,undo?5000:2200); }

document.addEventListener("click", e => { const x = e.target.closest && e.target.closest("[data-dlg-x]"); if (x) { e.preventDefault(); x.closest("dialog").close(); } });
// ---------- dates typed and shown as dd/mm/yyyy everywhere (browsers set to US English show mm/dd)
(() => {
  const VD = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  const show = v => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(v || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
  const parse = t => { t = (t || "").trim(); let m = /^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2}|\d{4})$/.exec(t) || /^(\d{2})(\d{2})(\d{2}|\d{4})$/.exec(t); if (!m) return null;
    const d = +m[1], mo = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3], dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : null; };
  function enhance(inp){
    if (inp.__dd || inp.hasAttribute("data-native")) return; inp.__dd = true;
    const wrap = document.createElement("span"); wrap.className = "dd-wrap"; ["maxWidth", "width", "flex"].forEach(p => { if (inp.style[p]) wrap.style[p] = inp.style[p]; });
    const txt = document.createElement("input"); txt.type = "text"; txt.inputMode = "numeric"; txt.autocomplete = "off"; txt.placeholder = "dd/mm/yyyy"; txt.className = (inp.className || "") + " dd-text"; if (inp.getAttribute("style")) txt.setAttribute("style", inp.getAttribute("style")); txt.style.width = "100%"; txt.style.maxWidth = "none";
    txt.setAttribute("aria-label", inp.getAttribute("aria-label") || "Date (day/month/year)"); if (inp.disabled) txt.disabled = true;
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "dd-pick"; btn.tabIndex = -1; btn.setAttribute("aria-label", "Open calendar"); btn.innerHTML = SVG(ICON.calendar);
    inp.parentNode.insertBefore(wrap, inp); wrap.append(txt, btn, inp); inp.classList.add("dd-native"); inp.tabIndex = -1;
    const sync = () => { if (document.activeElement !== txt || !txt.value) txt.value = show(VD.get.call(inp)); };
    Object.defineProperty(inp, "value", { configurable: true, get(){ return VD.get.call(this); }, set(v){ VD.set.call(this, v); sync(); } });
    sync();
    const commit = v => { if (VD.get.call(inp) === v) return; VD.set.call(inp, v); inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); };
    txt.addEventListener("input", e => {
      if (e.inputType === "insertText" && /^\d{2}$|^\d{1,2}\/\d{2}$/.test(txt.value)) txt.value += "/";
      const full = /\d{4}$/.test(txt.value.trim()), v = full ? parse(txt.value) : null; txt.classList.toggle("dd-bad", full && !v); if (v) commit(v);
    });
    txt.addEventListener("blur", () => { const t = txt.value.trim(); if (!t) { if (!inp.required) commit(""); else txt.value = show(VD.get.call(inp)); } else { const v = parse(t); if (v) { commit(v); txt.value = show(v); } else { toast("Type the date as dd/mm/yyyy, e.g. 03/11/2026"); txt.value = show(VD.get.call(inp)); } } txt.classList.remove("dd-bad"); });
    txt.addEventListener("keydown", e => { if (e.key === "Enter") { const v = parse(txt.value); if (v) commit(v); } });
    inp.addEventListener("change", () => { if (document.activeElement !== txt) txt.value = show(VD.get.call(inp)); });
    btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); try { inp.showPicker(); } catch { inp.focus(); inp.click(); } });
  }
  const scan = root => (root.querySelectorAll ? root.querySelectorAll('input[type="date"]') : []).forEach(enhance);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.matches && n.matches('input[type="date"]')) enhance(n); else scan(n); }))).observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => scan(document));
})();

// ---------- swipe left on a task card to delete (phone)
const SW = { card: null, x0: 0, y0: 0, base: 0, dx: 0, mode: "", open: null, swiped: 0 };
const swSet = (c, x, anim) => { c.classList.toggle("sw-anim", !!anim); c.style.setProperty("--sx", x + "px"); c.classList.toggle("sw-on", x < 0); };
function swClose(){ if (SW.open) { swSet(SW.open, 0, true); SW.open = null; } }
function swipeDelete(id){
  const t = S.tasks.find(x => x.id === id); if (!t) return; const copy = strip(t);
  if (S.timer && S.timer.ref === id) stopTimer(false);
  del("tasks", id); SW.open = null;
  toast("Task deleted", () => { put("tasks", id, copy); toast("Task restored"); });
}
document.addEventListener("touchstart", e => {
  const c = e.target.closest && e.target.closest("div.task[data-task]");
  if (SW.open && SW.open !== c) { swClose(); SW.swiped = Date.now(); }
  if (!c || e.touches.length > 1) { SW.card = null; return; }
  SW.card = c; SW.x0 = e.touches[0].clientX; SW.y0 = e.touches[0].clientY; SW.base = SW.open === c ? -88 : 0; SW.dx = 0; SW.mode = "";
}, { passive: true });
document.addEventListener("touchmove", e => {
  const c = SW.card; if (!c) return;
  const dx = e.touches[0].clientX - SW.x0, dy = e.touches[0].clientY - SW.y0;
  if (!SW.mode) { if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) SW.mode = "x"; else if (Math.abs(dy) > 8) { SW.mode = "y"; SW.card = null; return; } else return; }
  if (e.cancelable) e.preventDefault();
  SW.dx = dx; const w = c.offsetWidth, x = Math.min(0, Math.max(-w, SW.base + dx));
  swSet(c, x, false); c.classList.toggle("sw-far", x < -w * 0.55);
}, { passive: false });
document.addEventListener("touchend", () => {
  const c = SW.card; SW.card = null; if (!c || SW.mode !== "x") return;
  SW.swiped = Date.now(); const w = c.offsetWidth, x = Math.min(0, SW.base + SW.dx); c.classList.remove("sw-far");
  if (x < -w * 0.55) { swSet(c, -w, true); setTimeout(() => swipeDelete(c.dataset.task), 180); }
  else if (x < -44) { swSet(c, -88, true); SW.open = c; }
  else { swSet(c, 0, true); if (SW.open === c) SW.open = null; }
});
document.addEventListener("touchcancel", () => { const c = SW.card; SW.card = null; if (c && SW.mode === "x") swSet(c, SW.open === c ? -88 : 0, true); });
document.addEventListener("click", e => {
  const a = e.target.closest && e.target.closest(".sw-act");
  if (a) { e.preventDefault(); e.stopPropagation(); swipeDelete(a.closest("[data-task]").dataset.task); return; }
  const c = e.target.closest && e.target.closest("div.task[data-task]");
  if (Date.now() - SW.swiped < 400 || (SW.open && (c === SW.open || !c))) { if (c || SW.open) { e.preventDefault(); e.stopPropagation(); } swClose(); SW.swiped = 0; }
}, true);

// ---------- keep the page behind a pop-up window still (stops the window drifting on iPhone)
(() => { let y = 0, n = 0;
  const lock = () => { if (n++) return; y = window.scrollY; const b = document.body.style; b.position = "fixed"; b.top = -y + "px"; b.left = "0"; b.right = "0"; b.width = "100%"; };
  const unlock = () => { if (!n || --n) return; const b = document.body.style; b.position = b.top = b.left = b.right = b.width = ""; window.scrollTo(0, y); };
  const show = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function () { const was = this.open; show.call(this); if (!was && !this.__lk) { this.__lk = 1; lock(); this.addEventListener("close", () => { this.__lk = 0; unlock(); }, { once: true }); } };
})();

// ---------- data ops (db or in-memory fallback)
function newId(){ return db ? db.collection("tasks").doc().id : Math.random().toString(36).slice(2,12); }
function put(coll, id, data){
  const list = coll==="tasks"?S.tasks:coll==="todos"?S.todos:coll==="routine"?S.routine:coll==="body"?S.body:coll==="conditions"?S.conds:coll==="courses"?S.courses:coll==="shop"?S.shop:coll==="expenses"?S.exp:coll==="subjects"?S.subjects:coll==="classes"?S.classes:coll==="assignments"?S.asg:coll==="snotes"?S.snotes:null;
  if(!db && list){ const i=list.findIndex(x=>x.id===id); const row={...data,id}; i>=0?list.splice(i,1,row):list.push(row); render(); return; }
  if(!db){ render(); return; }
  return write(coll+"/"+id, () => db.doc(coll+"/"+id).set(data));
}
function del(coll, id){
  const list = coll==="tasks"?S.tasks:coll==="todos"?S.todos:S.routine;
  if(!db){ const i=list.findIndex(x=>x.id===id); if(i>=0) list.splice(i,1); render(); return; }
  return write(coll+"/"+id, () => db.doc(coll+"/"+id).delete());
}
const strip = o => { const c={...o}; delete c.id; return c; };

// ---------- categories
const DEFAULT_CATS = [{name:"SQL / Database",tag:"sql"},{name:"Excel / Reporting",tag:"excel"},{name:"Python / Automation",tag:"python"},{name:"Admin / Documentation",tag:"admin"}];
function saveCats(){ if(!db){ render(); return; } write("settings/main", () => db.doc("settings/main").set({categories:S.cats, org:S.org||"", name:S.name||"", calSync:S.calSync||null, waterGoal:S.waterGoal||8, showCycle:S.showCycle!==false, cur:S.cur||"RM", budget:S.budget||0, shopHist:S.shopHist||[], semStart:S.semStart||"", semWeeks:S.semWeeks||14, prevCgpa:S.prevCgpa||"", prevCredits:S.prevCredits||"", curSem:S.curSem||"", semBreaks:S.semBreaks||[]})); }

// ---------- look & feel helpers
const SVG = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
  meal: '<path d="M4 3v7a2 2 0 0 0 2 2h1v9"/><path d="M8 3v6"/><path d="M6 3v6"/><path d="M18 21V3c-2 1-3 3.5-3 7v4h3"/>',
  supplement: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-40 12 12)"/><path d="m9.2 9.6 5.2 4.6"/>',
  break: '<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 2.5v2.5M12 2.5v2.5"/>',
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
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  steps: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.5 1.5L7.5 5"/><path d="m3.5 12 1.5 1.5 2.5-2.5"/><circle cx="5" cy="18" r="1.5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  note: '<path d="M4 4h16v11l-5 5H4z"/><path d="M15 20v-5h5"/><path d="M8 9h8M8 13h4"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  flame: '<path d="M12 22c4 0 7-2.7 7-6.8 0-3.6-2.3-5.6-3.6-7.6-.4 1.7-1.3 2.9-2.4 3.4.3-3.1-1-6.6-3.9-9-.3 3.6-2.5 5.6-4 7.7C3.9 11.6 5 13.2 5 15.2 5 19.3 8 22 12 22z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h12v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13.5h2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>'
};
function iconKey(r){
  const l = (r.label||"").toLowerCase();
  if (/swim/.test(l)) return "swim";
  if (/sleep|bed\b/.test(l)) return "sleep";
  if (/wake/.test(l)) return "wake";
  if (/water/.test(l) && !/wake/.test(l)) return "water";
  if (/chore|laundry|grocer|errand|clean/.test(l)) return "chores";
  if (/plan|review/.test(l) && r.kind!=="work") return "plan";
  if (/reflect/.test(l)) return "study";
  return ICON[r.kind] ? r.kind : "other";
}
const routineIcon = r => `<span class="ri ri-${esc(r.kind||"other")}">${SVG(ICON[iconKey(r)])}</span>`;
const CAT_N = 6;
function catIdx(tag){ const i=S.cats.findIndex(c=>c.tag===tag); if(i>=0) return i%CAT_N; let h=0; for(const ch of String(tag||"")) h=(h*31+ch.charCodeAt(0))>>>0; return h%CAT_N; }
const catTag = tag => tag ? `<span class="tag cat-${catIdx(tag)}">${esc(catName(tag))}</span>` : `<span class="tag">Uncategorised</span>`;
function greeting(){ const h=new Date().getHours(); return h<5?"Good night":h<12?"Good morning":h<17?"Good afternoon":h<22?"Good evening":"Good night"; }
function ring(pct, size=86){ const r=36, c=2*Math.PI*r, p=Math.max(0,Math.min(100,pct||0));
  return `<svg class="ring" viewBox="0 0 90 90" width="${size}" height="${size}" role="img" aria-label="${p}% of today's routine done"><circle cx="45" cy="45" r="${r}" class="ring-bg"/><circle cx="45" cy="45" r="${r}" class="ring-fg" stroke-dasharray="${(c*p/100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 45 45)"/><text x="45" y="50" text-anchor="middle">${p}%</text></svg>`; }

// ---------- theme switch
const THEMES = ["auto","light","dark"];
function applyTheme(t){ if(t==="auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme=t;
  const b=$("#theme"); if(b){ b.innerHTML=SVG(ICON[t==="auto"?"auto":t==="light"?"sun":"moon"]); b.setAttribute("aria-label","Theme: "+(t==="auto"?"match device":t)); b.title="Theme: "+(t==="auto"?"match device":t); } }
let THEME="auto"; try{ THEME=localStorage.getItem("daybook-theme")||"auto"; }catch{}
applyTheme(THEME);
$("#theme").addEventListener("click", ()=>{ THEME=THEMES[(THEMES.indexOf(THEME)+1)%3]; try{ localStorage.setItem("daybook-theme",THEME); }catch{} applyTheme(THEME); toast(THEME==="auto"?"Theme: matches your device":THEME==="light"?"Theme: light":"Theme: dark"); });
function catByTag(t){ t=t.toLowerCase(); return S.cats.find(c=>c.tag===t) || S.cats.find(c=>c.tag.startsWith(t)) || S.cats.find(c=>c.name.toLowerCase().includes(t)); }
const catName = tag => (S.cats.find(c=>c.tag===tag)||{name:tag||"Uncategorised"}).name;

// ---------- quick add parser
function parseDateToken(t){
  const now=new Date(); t=t.toLowerCase();
  if(t==="today"||t==="tdy") return todayKey();
  if(t==="tmr"||t==="tomorrow"||t==="tmrw"){ now.setDate(now.getDate()+1); return dkey(now); }
  const wd=DAYS.findIndex(d=>t.startsWith(d.toLowerCase()));
  if(wd>=0){ const diff=(wd-now.getDay()+7)%7; now.setDate(now.getDate()+diff); return dkey(now); }
  if(/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m=t.match(/^(\d{1,2})[\/.](\d{1,2})$/); if(m){ let y=now.getFullYear(); const d=new Date(y,+m[2]-1,+m[1]); if(d<new Date(now.getFullYear(),now.getMonth(),now.getDate())) d.setFullYear(y+1); return dkey(d); }
  return null;
}
function parseQuick(text){
  const out={title:"",cat:null,newCat:null,urg:null,due:null};
  const words=[];
  for(const w of text.trim().split(/\s+/)){
    if(/^#\S+/.test(w)){ const c=catByTag(w.slice(1)); if(c) out.cat=c.tag; else out.newCat=w.slice(1); continue; }
    if(/^!\S+/.test(w)){ const u=w.slice(1).toLowerCase(); const f=URG.find(x=>x.startsWith(u)||(u==="med"&&x==="medium")||(u==="crit"&&x==="critical")||(u==="urgent"&&x==="critical")); if(f){ out.urg=f; continue; } }
    if(/^@\S+/.test(w)){ const d=parseDateToken(w.slice(1)); if(d){ out.due=d; continue; } }
    words.push(w);
  }
  out.title=words.join(" ");
  out.work = !!(out.cat||out.newCat||out.urg);
  return out;
}
// ---------- quick add with tap chips (typing shortcuts still work)
S.qa = { cat: "", urg: "medium", due: todayKey(), adding: false };
function qaDefaults(){ S.qa = { cat: "", urg: "medium", due: S.mode === "work" ? "" : todayKey(), adding: false }; }
const QA_URG = [["critical","Critical"],["high","High"],["medium","Medium"],["low","Low"]];
function qaEffective(){
  const p = parseQuick($("#q").value);
  const work = S.mode === "work";
  return { p, work, cat: p.cat || (p.newCat ? "__new" : S.qa.cat), urg: p.urg || S.qa.urg, due: p.due !== null && p.due !== undefined ? p.due : S.qa.due };
}
function dueChoices(){
  const tk = todayKey(), out = [[tk, "Today"], [addDays(tk, 1), "Tomorrow"]];
  for (let i = 2; out.length < 5 && i < 8; i++) { const k = addDays(tk, i); out.push([k, DAYS[keyDow(k)] + " " + (+k.slice(8))]); }
  return out;
}
function renderQA(){
  const box = $("#qa"); if (!box) return;
  const E = qaEffective(), ch = (attr, val, label, on, extra = "") => `<button type="button" class="qc ${extra}" ${attr}="${esc(val)}" aria-pressed="${on}">${label}</button>`;
  const dues = dueChoices(), customDue = E.due && !dues.some(d => d[0] === E.due);
  let h = `<div class="qa-row"><span class="qa-lbl">Type</span><div class="qa-chips">${ch("data-qa-type", "todo", "To-do", !E.work)}${ch("data-qa-type", "work", "Work task", E.work)}</div></div>`;
  if (E.work) {
    h += `<div class="qa-row"><span class="qa-lbl">Category</span><div class="qa-chips">${S.cats.map((c, i) => ch("data-qa-cat", c.tag, esc(c.name.split(/\s*\/\s*/)[0]), E.cat === c.tag, "ci-" + (i % 6))).join("")}
      ${E.cat === "__new" ? `<span class="qc on">${esc(E.p.newCat)} (new)</span>` : ""}
      ${S.qa.adding ? `<span class="qc-new"><input id="qa-newcat" placeholder="New category" aria-label="New category name"><button type="button" class="qc" data-qa-newsave>Add</button></span>` : ch("data-qa-newcat", "1", "+ New", false, "ghost")}</div></div>`;
    h += `<div class="qa-row"><span class="qa-lbl">Urgency</span><div class="qa-chips">${QA_URG.map(([v, l]) => ch("data-qa-urg", v, l, E.urg === v, "u-" + v)).join("")}</div></div>`;
  }
  h += `<div class="qa-row"><span class="qa-lbl">${E.work ? "Due" : "When"}</span><div class="qa-chips">${E.work ? ch("data-qa-due", "", "No date", !E.due) : ""}${dues.map(([k, l]) => ch("data-qa-due", k, l, E.due === k)).join("")}
    <label class="qc pick ${customDue ? "on" : ""}" aria-pressed="${customDue}">${SVG(ICON.calendar)}${customDue ? esc(fmtDate(E.due)) : "Pick date"}<input type="date" id="qa-pick" data-native value="${esc(E.due || "")}" aria-label="Pick a date"></label></div></div>`;
  h += `<p class="qa-tip">Shortcut: you can also type <code>#excel</code> <code>!high</code> <code>@fri</code> in the box.</p>`;
  box.innerHTML = h;
}
// remove typed tokens for a field when its chip is tapped, so the chip choice wins
function stripTokens(re){ const q = $("#q"); q.value = q.value.split(/\s+/).filter(w => !re.test(w)).join(" ").replace(/\s+$/, q.value.endsWith(" ") ? " " : ""); }
function setMode(m, auto){ if (!auto) S.autoWork = false; const changed = S.mode !== m; S.mode = m; if (changed && !$("#q").value.trim()) qaDefaults(); renderQA(); }
function updateHint(){ const p = parseQuick($("#q").value); if (p.work && S.mode !== "work") { S.mode = "work"; S.autoWork = true; } else if (!p.work && S.autoWork) { S.mode = "todo"; S.autoWork = false; } renderQA(); }
$("#q").addEventListener("input", updateHint);
// keep the keyboard open and the focus in the box while tapping chips
$("#qa").addEventListener("pointerdown", e => { if (e.target.closest("button.qc")) e.preventDefault(); });
$("#qa").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.qaType) { if (b.dataset.qaType === "todo") stripTokens(/^[#!]\S+/); S.mode = b.dataset.qaType; S.autoWork = false; if (S.mode === "todo" && !S.qa.due) S.qa.due = todayKey(); }
  else if (b.dataset.qaCat !== undefined) { stripTokens(/^#\S+/); S.qa.cat = S.qa.cat === b.dataset.qaCat ? "" : b.dataset.qaCat; }
  else if (b.dataset.qaUrg) { stripTokens(/^!\S+/); S.qa.urg = b.dataset.qaUrg; }
  else if (b.dataset.qaDue !== undefined) { stripTokens(/^@\S+/); S.qa.due = b.dataset.qaDue; }
  else if (b.dataset.qaNewcat) { S.qa.adding = true; renderQA(); $("#qa-newcat").focus(); return; }
  else if (b.dataset.qaNewsave !== undefined) { qaSaveNewCat(); return; }
  renderQA(); $("#q").focus({ preventScroll: true });
});
function qaSaveNewCat(){
  const n = ($("#qa-newcat").value || "").trim(); S.qa.adding = false;
  if (n) { let tag = n.split(/[\s\/]+/)[0].toLowerCase().replace(/[^a-z0-9-]/g, "") || "cat"; while (S.cats.find(c => c.tag === tag)) tag += "2"; S.cats.push({ name: n, tag }); saveCats(); S.qa.cat = tag; toast("Category added"); }
  renderQA(); $("#q").focus({ preventScroll: true });
}
$("#qa").addEventListener("keydown", e => { if (e.target.id === "qa-newcat" && e.key === "Enter") { e.preventDefault(); qaSaveNewCat(); } if (e.target.id === "qa-newcat" && e.key === "Escape") { S.qa.adding = false; renderQA(); } });
$("#qa").addEventListener("change", e => { if (e.target.id === "qa-pick" && e.target.value) { stripTokens(/^@\S+/); S.qa.due = e.target.value; renderQA(); } });
// show the chips while adding, hide them when you're done
const qaShow = on => { $("#qa").hidden = !on; $("#quick").classList.toggle("open", on); };
$("#quick").addEventListener("focusin", () => qaShow(true));
$("#quick").addEventListener("focusout", () => setTimeout(() => { if (!$("#quick").contains(document.activeElement) && !$("#q").value.trim() && !S.qa.adding) qaShow(false); }, 150));
$("#q").addEventListener("keydown", e => { if (e.key === "Escape") { $("#q").value = ""; updateHint(); $("#q").blur(); qaShow(false); } });
$("#quick").addEventListener("submit", e => {
  e.preventDefault();
  const E = qaEffective(), p = E.p;
  if (!p.title) { toast("Type a name first"); $("#q").focus(); return; }
  if (E.work) {
    let cat = E.cat === "__new" ? "" : E.cat;
    if (p.newCat) { const tag = p.newCat.toLowerCase().replace(/[^a-z0-9-]/g, ""); const name = p.newCat.charAt(0).toUpperCase() + p.newCat.slice(1); if (!S.cats.find(c => c.tag === tag)) { S.cats.push({ name, tag }); saveCats(); } cat = tag; }
    put("tasks", newId(), { title: p.title, desc: "", category: cat || "", urgency: E.urg || "medium", status: "todo", progress: 0, bottleneck: "", assignedBy: "", due: E.due || "", createdAt: nowISO(), updatedAt: nowISO(), doneAt: "", log: [{ at: nowISO(), note: "Task added" }] });
    toast(`Work task added${cat ? " · " + catName(cat).split(/\s*\/\s*/)[0] : ""}${E.due ? " · due " + fmtDate(E.due) : ""}`);
  } else {
    put("todos", newId(), { title: p.title, date: E.due || todayKey(), done: false, doneAt: "", createdAt: nowISO() });
    toast(`To-do added${E.due && E.due !== todayKey() ? " for " + fmtDate(E.due) : ""}`);
  }
  $("#q").value = ""; S.autoWork = false; qaDefaults(); renderQA(); $("#q").focus({ preventScroll: true });
});

// ---------- routing
const VIEWS=["today","work","calendar","overview","growth","study","health","money","reflect","routine"];
// Main tabs → subtabs. Each subtab shows one page (view) and, where a page has several parts, only that part.
const NAV = {
  today:    { label: "Today", icon: "sun", subs: [["today", "Today", "today"]] },
  work:     { label: "Work", icon: "work", subs: [["tasks", "Tasks", "work"], ["calendar", "Calendar", "calendar"], ["skills", "Skills", "growth"]] },
  study:    { label: "Study", icon: "class", subs: [["timetable", "Timetable", "study"], ["calendar", "Calendar", "study"], ["assignments", "Assignments", "study"], ["notes", "Notes", "study"], ["portfolio", "Portfolio", "study"], ["grades", "Grades", "study"], ["courses", "Courses", "growth"]] },
  health:   { label: "Health", icon: "health", subs: [["body", "Body", "health"], ["mind", "Mind", "health"], ["cycle", "Cycle", "health"], ["log", "Health log", "health"]] },
  money:    { label: "Money", icon: "wallet", subs: [["expenses", "Expenses", "money"], ["shopping", "Shopping", "money"]] },
  journal:  { label: "Journal", icon: "book", subs: [["reflection", "Reflection", "reflect"], ["archive", "Archive", "reflect"], ["weekly", "Weekly report", "reflect"]] },
  insights: { label: "Insights", icon: "chart", subs: [["overview", "Overview", "overview"], ["streaks", "Streaks", "growth"]] },
  settings: { label: "Settings", icon: "gear", subs: [["routine", "Routine & alarms", "routine"], ["categories", "Categories", "routine"], ["account", "Account", "routine"]] }
};
const MAIN_TABS = ["today", "work", "study", "health", "money", "journal", "insights"];
const ALIAS = { calendar: "work-calendar", overview: "insights", growth: "study-courses", reflect: "journal", routine: "settings" };
function parseRoute(){
  let h = location.hash.slice(1) || "today"; h = ALIAS[h] || h;
  let [m, sub] = h.split("-"); if (!NAV[m]) m = "today";
  const s = NAV[m].subs.find(x => x[0] === sub) || NAV[m].subs[0];
  return { main: m, sub: s[0], view: s[2] };
}
const subHref = (m, i, sub) => "#" + (i === 0 ? m : m + "-" + sub);
function buildNav(){
  const tab = (m, cls) => `<a href="#${m}" data-m="${m}" class="${cls}">${cls === "bn" ? SVG(ICON[NAV[m].icon]) : ""}<span>${NAV[m].label}</span>${m === "work" ? `<span class="count" data-cwork>0</span>` : ""}</a>`;
  $("#tabs").innerHTML = MAIN_TABS.map(m => tab(m, "")).join("");
  $("#bottomnav").innerHTML = MAIN_TABS.map(m => tab(m, "bn")).join("");
  $("#settings-btn").innerHTML = SVG(ICON.gear);
}
function renderNav(){
  document.querySelectorAll("[data-m]").forEach(a => { if (a.dataset.m === S.main) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  $("#settings-btn").classList.toggle("on", S.main === "settings");
  const subs = NAV[S.main].subs;
  $("#subtabs").hidden = subs.length < 2;
  $("#subtabs").innerHTML = (S.main === "settings" ? `<span class="st-title">Settings</span>` : "") + (subs.length < 2 ? "" : subs.map(([k, l], i) => `<a href="${subHref(S.main, i, k)}" ${k === S.sub ? 'aria-current="page"' : ""}>${l}</a>`).join(""));
  const open = S.tasks.filter(t => t.status !== "done").length;
  document.querySelectorAll("[data-cwork]").forEach(c => { c.textContent = open; c.hidden = !open; });
}
function applyParts(){
  document.querySelectorAll("section.view").forEach(sec => {
    const parts = sec.querySelectorAll("[data-part]");
    sec.classList.toggle("sub", parts.length > 0);
    parts.forEach(el => { el.hidden = !el.dataset.part.split(" ").includes(S.sub); });
  });
}
function route(){
  const R = parseRoute(), changed = R.main !== S.main || R.sub !== S.sub;
  S.main = R.main; S.sub = R.sub; S.view = R.view;
  if (S.view === "work") setMode("work"); else if (S.view === "today") setMode("todo");
  renderNav(); applyParts(); render();
  if (changed) window.scrollTo(0, 0);
}
buildNav();
$("#settings-btn").addEventListener("click", () => { location.hash = S.main === "settings" ? "#today" : "#settings"; });
window.addEventListener("hashchange", route);

// ---------- render
function render(){
  $("#today-label").textContent = fmtDate(todayKey())+" "+new Date().getFullYear();
  for(const v of VIEWS){ $("#v-"+v).hidden = v!==S.view; }
  renderNav();
  if(S.view==="today") renderToday();
  if(S.view==="work") renderWork();
  if(S.view==="calendar") renderCalendar();
  if(S.view==="overview") renderOverview();
  if(S.view==="growth") renderGrowth();
  if(S.view==="health") renderHealth();
  if(S.view==="money") renderMoney();
  if(S.view==="study") renderStudy();
  if(S.view==="reflect") renderReport();
  if(S.view==="today") renderFocus();
  tickTimer();
  if(S.view==="reflect") renderReflect();
  if(S.view==="routine") renderRoutine();
}
const sortTasks = arr => arr.slice().sort((a,b)=> (a.status==="done")-(b.status==="done") || (b.status==="blocked")-(a.status==="blocked") || URG_RANK[a.urgency]-URG_RANK[b.urgency] || (a.due||"9999").localeCompare(b.due||"9999"));
const REPEAT = [["none","Doesn't repeat"],["daily","Every day"],["weekdays","Every weekday"],["weekly","Every week"],["monthly","Every month"]];
const REPEAT_SHORT = {daily:"Daily",weekdays:"Weekdays",weekly:"Weekly",monthly:"Monthly"};
function fmtMins(m){ m=Math.round(m||0); if(m<60) return m+"m"; const h=Math.floor(m/60), r=m%60; return h+"h"+(r?" "+r+"m":""); }
function clock(sec){ sec=Math.max(0,Math.round(sec)); const h=Math.floor(sec/3600), m=Math.floor(sec%3600/60), s=sec%60; return (h?h+":"+pad(m):m)+":"+pad(s); }
const timerElapsed = () => S.timer ? (Date.now() - new Date(S.timer.start).getTime())/1000 : 0;
function taskMins(id){ return S.time.filter(x=>x.ref===id).reduce((a,x)=>a+(+x.mins||0),0); }
function taskCard(t){
  const over = t.due && t.status!=="done" && t.due < todayKey();
  const subs=t.subtasks||[], sd=subs.filter(s=>s.done).length;
  const running = S.timer && S.timer.type==="task" && S.timer.ref===t.id;
  const mins = taskMins(t.id);
  return `<div class="task ${t.status==="done"?"isdone":""}" data-u="${esc(t.urgency)}" data-task="${esc(t.id)}" role="button" tabindex="0">
    <span class="sw-act" aria-hidden="true">${SVG(ICON.trash)}<span>Delete</span></span><span class="stripe"></span><span class="body">
      <span class="ttl-row"><span class="ttl">${esc(t.title)}</span>${t.status!=="done"?`<button type="button" class="tbtn ${running?"on":""}" data-timer="${esc(t.id)}" aria-label="${running?"Stop timer":"Start timer"} for ${esc(t.title)}">${SVG(running?ICON.stop:ICON.play)}<span ${running?"data-live":""}>${running?clock(timerElapsed()):(mins?fmtMins(mins):"")}</span></button>`:(mins?`<span class="tdone-time">${SVG(ICON.timer)}${fmtMins(mins)}</span>`:"")}</span>
      <span class="line"><span class="urg ${esc(t.urgency)}">${esc(t.urgency)}</span>${catTag(t.category)}
        <span class="st ${esc(t.status)}">${esc(STATUS_LABEL[t.status]||t.status)}</span>
        ${t.due?`<span class="${over?"overdue":""}">${over?"Overdue · ":"Due "}${esc(fmtDate(t.due))}</span>`:""}
        ${t.repeat&&t.repeat!=="none"?`<span class="meta-ic">${SVG(ICON.repeat)}${REPEAT_SHORT[t.repeat]||""}</span>`:""}
        ${subs.length?`<span class="meta-ic">${SVG(ICON.steps)}${sd}/${subs.length} steps</span>`:""}
        ${(t.links||[]).length?`<span class="meta-ic">${SVG(ICON.link)}${t.links.length}</span>`:""}
        ${(t.notes||"").trim()?`<span class="meta-ic" title="Has notes">${SVG(ICON.note)}</span>`:""}
        ${t.assignedBy?`<span>from ${esc(t.assignedBy)}</span>`:""}</span>
      <span class="line" style="gap:10px"><span class="bar" style="flex:1"><i style="width:${Math.max(0,Math.min(100,+t.progress||0))}%"></i></span><span style="font-family:var(--f-mono)">${+t.progress||0}%</span></span>
      ${t.bottleneck && t.status!=="done"?`<span class="block"><b>Bottleneck:</b> ${esc(t.bottleneck)}</span>`:""}
      ${t.status==="done"&&t.impact?`<span class="impact">${SVG(ICON.star)}${esc(t.impact)}</span>`:""}
    </span></div>`;
}
function routineFor(k){ const wd=keyDow(k); const dd=dayDoc(k);
  const moved=new Set((dd.extra||[]).filter(x=>x.from&&(dd.skip||{})[x.from]).map(x=>x.from));
  return [...S.routine.filter(r=>(!r.days||r.days.includes(wd))&&!moved.has(r.id)), ...(dd.extra||[]).map(x=>({...x,extra:true}))].sort((a,b)=>a.time.localeCompare(b.time)); }
function saveDay(k, dd){ S.day[k]=dd; if(db) write("checks/"+k, ()=>db.doc("checks/"+k).set({date:k,done:dd.done||{},skip:dd.skip||{},extra:dd.extra||[]})); renderToday(); }
const DAYLBL = {"-1":"Yesterday","0":"Today","1":"Tomorrow"};
// ---------- routine timeline in the summary card (day / week)
try { S.tlMode = localStorage.getItem("daybook-tl") || "day"; } catch { S.tlMode = "day"; }
const toMin = t => { const [h, m] = String(t || "0:0").split(":").map(Number); return h * 60 + m; };
function itemState(r, k){
  const dd = dayDoc(k), tk = todayKey();
  if ((dd.skip || {})[r.id]) return "skip";
  if ((dd.done || {})[r.id]) return "done";
  if (k < startKey()) return "none";
  if (k < tk) return "miss";
  if (k === tk && toMin(r.time) < new Date().getHours() * 60 + new Date().getMinutes()) return "late";
  return "todo";
}
const STATE_TXT = { done: "Done", miss: "Missed", late: "Not ticked yet", todo: "Upcoming", skip: "Skipped", none: "Before tracking" };
function timelineHtml(){
  const tk = todayKey(), week = weekKeys(0), mode = S.tlMode;
  const keys = mode === "week" ? week : [tk];
  const all = keys.flatMap(k => routineFor(k));
  if (!all.length) return "";
  let lo = Math.floor(Math.min(...all.map(r => toMin(r.time))) / 60) * 60, hi = Math.ceil((Math.max(...all.map(r => toMin(r.time))) + 1) / 60) * 60;
  if (hi - lo < 120) hi = lo + 120;
  const pos = m => ((m - lo) / (hi - lo) * 100).toFixed(2);
  const nowM = new Date().getHours() * 60 + new Date().getMinutes(), nowIn = nowM >= lo && nowM <= hi;
  const dots = k => routineFor(k).map(r => { const st = itemState(r, k); return `<i class="tl-dot s-${st}" style="left:${pos(toMin(r.time))}%" title="${esc(r.time)} ${esc(r.label)} · ${STATE_TXT[st]}"></i>`; }).join("");
  const span = (hi - lo) / 60, step = span <= 8 ? 2 : span <= 14 ? 3 : 4;
  const ticks = []; for (let m = lo; m <= hi; m += step * 60) ticks.push(`<span style="left:${pos(m)}%">${pad(Math.floor(m / 60) % 24)}:00</span>`);
  const nowMark = (k) => k === tk && nowIn ? `<b class="tl-now" style="left:${pos(nowM)}%"></b>` : "";
  const fill = (k) => k === tk ? `<span class="tl-fill" style="width:${nowIn ? pos(nowM) : (nowM > hi ? 100 : 0)}%"></span>` : k < tk ? `<span class="tl-fill past" style="width:100%"></span>` : "";
  const count = k => { const its = routineFor(k).filter(r => !(dayDoc(k).skip || {})[r.id]); return `${its.filter(r => (dayDoc(k).done || {})[r.id]).length}/${its.length}`; };
  const body = mode === "week"
    ? `<div class="tl-week">${week.map(k => `<div class="tl-row ${k === tk ? "is-today" : ""} ${k > tk ? "is-future" : ""}"><span class="tl-day">${esc(DAYS[keyDow(k)])}</span><div class="tl-track">${fill(k)}${dots(k)}${nowMark(k)}</div><span class="tl-count">${k > tk || k < startKey() ? "" : count(k)}</span></div>`).join("")}
       <div class="tl-row tl-axisrow"><span></span><div class="tl-axis">${ticks.join("")}</div><span></span></div></div>`
    : `<div class="tl-track big">${fill(tk)}${dots(tk)}${nowMark(tk)}${nowIn ? `<em class="tl-nowlbl" style="left:${pos(nowM)}%">now</em>` : ""}</div><div class="tl-axis">${ticks.join("")}</div>`;
  return `<div class="tl">
    <div class="tl-head"><span class="tl-title">${mode === "week" ? "This week's routine" : "Today's routine"}</span>
      <div class="seg tl-seg"><button type="button" data-tl="day" aria-pressed="${mode === "day"}">Day</button><button type="button" data-tl="week" aria-pressed="${mode === "week"}">Week</button></div></div>
    ${body}
    <div class="tl-legend"><span><i class="tl-dot s-done"></i>Done</span><span><i class="tl-dot s-todo"></i>Upcoming</span><span><i class="tl-dot s-late"></i>Not ticked</span><span><i class="tl-dot s-skip"></i>Skipped</span></div>
  </div>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-tl]"); if (!b) return; S.tlMode = b.dataset.tl; try { localStorage.setItem("daybook-tl", S.tlMode); } catch {} renderToday(); });
function heroHtml(active, done, next, missed){
  const tk=todayKey(), dn=active.filter(r=>done[r.id]).length, pct=active.length?Math.round(dn/active.length*100):0;
  const todoLeft=S.todos.filter(t=>!t.done&&(!t.date||t.date<=tk)).length, open=S.tasks.filter(t=>t.status!=="done").length;
  return `<div class="hero">${ring(pct)}<div class="hero-txt">
    <div class="greet">${esc(greeting())}${S.name?", "+esc(S.name):""}</div>
    <div class="hero-sub">${esc(new Date().toLocaleDateString("en-GB",{weekday:"long"}))} · ${isWeekend(new Date().getDay())?"Weekend":"Weekday"} routine</div>
    ${next?`<div class="hero-next">${routineIcon(next)}<span><b>${esc(next.time)}</b> ${esc(next.label)}</span></div>`:`<div class="hero-next"><span>${!active.length?"No routine yet. Add items in the Routine tab.":dn===active.length?"Routine complete for today. Nice work.":"Nothing else scheduled today. Tick off anything you did."}</span></div>`}
    <div class="hero-stats"><span><b>${dn}/${active.length}</b> routine</span><span><b>${todoLeft}</b> to-do${todoLeft===1?"":"s"} left</span><span><b>${open}</b> task${open===1?"":"s"} open</span>${missed?`<span class="warn"><b>${missed}</b> not ticked</span>`:""}</div>
  </div></div>`;
}
// ---------- edit a routine item straight from Today
S.rtEdit = null; S.rtScope = "always";
function rtEditRow(r0, k, draft){
  const r = draft ? { ...r0, ...draft } : r0;
  const we = isWeekend(keyDow(k)), usual = daysLabel(r.days) || "its usual days";
  return `<li class="tl-edit"><form id="tl-edit-form" data-rid="${esc(r.id)}" autocomplete="off">
    <div class="tle-row"><input type="time" id="tle-t" value="${esc(r.time)}" aria-label="Time" required><input id="tle-l" value="${esc(r.label)}" aria-label="Name" required></div>
    <select id="tle-k" aria-label="Type">${KINDS.map(([v,l])=>`<option value="${v}" ${v===(r.kind||"other")?"selected":""}>${l}</option>`).join("")}</select>
    ${r.extra ? `<p class="small muted" style="margin:0">${r.from ? `Changed for ${esc(fmtDate(k))} only. Tap ✕ on it to go back to the usual one.` : `This item is for ${esc(fmtDate(k))} only.`}</p>` : `<div class="seg tle-scope"><button type="button" data-rtscope="always" aria-pressed="${S.rtScope==="always"}">Change routine (${esc(usual)})</button><button type="button" data-rtscope="day" aria-pressed="${S.rtScope==="day"}">Just ${esc(fmtDate(k))}</button></div>`}
    <div class="row"><button class="btn sm primary" type="submit">Save</button><button class="btn sm" type="button" data-rtedit-x>Cancel</button>${r.extra?"":`<a class="small" href="#settings-routine">More options (days, alarm) ›</a>`}</div>
  </form></li>`;
}
document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("[data-rtedit],[data-rtedit-x],[data-rtscope]"); if (!t || !t.closest("#timeline")) return;
  if (t.dataset.rtedit) { S.rtEdit = t.dataset.rtedit; S.rtScope = "always"; renderToday(); const l = $("#tle-l"); if (l) { l.focus(); l.select(); } }
  else if (t.dataset.rteditX !== undefined) { S.rtEdit = null; renderToday(); }
  else if (t.dataset.rtscope) { S.rtScope = t.dataset.rtscope; t.parentElement.querySelectorAll("[data-rtscope]").forEach(b => b.setAttribute("aria-pressed", b === t)); }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && S.rtEdit && e.target.closest && e.target.closest("#tl-edit-form")) { S.rtEdit = null; renderToday(); } });
document.addEventListener("submit", e => {
  if (e.target.id !== "tl-edit-form") return; e.preventDefault();
  const k = viewKey(), dd = dayDoc(k), id = e.target.dataset.rid;
  const time = $("#tle-t").value, label = $("#tle-l").value.trim(), kind = $("#tle-k").value; if (!time || !label) return;
  const ex = (dd.extra || []).find(x => x.id === id);
  if (ex) { saveDay(k, { ...dd, extra: dd.extra.map(x => x.id === id ? { ...x, time, label, kind } : x) }); toast("Updated for " + fmtDate(k)); }
  else { const r = S.routine.find(x => x.id === id); if (!r) return;
    if (S.rtScope === "day") { const nid = newId(), done = { ...(dd.done || {}) }; if (done[id]) { done[nid] = done[id]; delete done[id]; }
      saveDay(k, { ...dd, done, skip: { ...(dd.skip || {}), [id]: true }, extra: [...(dd.extra || []), { id: nid, time, label, kind, from: id }] }); toast("Changed for " + fmtDate(k) + " only"); }
    else { saveRt({ ...r, time, label, kind }); toast("Routine updated"); } }
  S.rtEdit = null; renderToday();
});
function renderToday(){
  const tk=todayKey(), k=viewKey(), isToday=S.dayOff===0, dd=dayDoc(k), done=dd.done||{}, skip=dd.skip||{};
  const items=routineFor(k), active=items.filter(r=>!skip[r.id]);
  const nowHM = isToday ? pad(new Date().getHours())+":"+pad(new Date().getMinutes()) : (S.dayOff<0 ? "99:99" : "00:00");
  const next = isToday ? active.find(r=>r.time>=nowHM && !done[r.id]) || null : null;
  const missed = isToday ? active.filter(r=>r.time<nowHM && !done[r.id]).length : 0;
  const we=isWeekend(keyDow(k));
  $("#rt-title").textContent = (we?"Weekend":"Weekday")+" routine";
  $("#daypager").innerHTML = `<button class="btn sm" type="button" data-dayoff="-1" ${S.dayOff<=-1?"disabled":""} aria-label="Previous day">‹</button>
    <span class="mid">${esc(DAYLBL[S.dayOff]||DAYS[keyDow(k)])}<small>${esc(fmtDate(k))}</small></span>
    <button class="btn sm" type="button" data-dayoff="1" ${S.dayOff>=6?"disabled":""} aria-label="Next day">›</button>`;
  $("#now").innerHTML = !S.ready ? `<span class="s">Loading your day…</span>`
    : !isToday ? `<div class="hero-plan"><span><span class="greet" style="font-size:1.15rem">Planning ${esc(fmtDate(k))}</span><br><span class="hero-sub">Skip or add items for this day only. Your usual routine stays the same.</span></span><button class="btn sm" type="button" data-dayreset>Back to today</button></div>`
    : heroHtml(active, done, next, missed);
  $("#rt-meta").textContent = active.length ? `${active.filter(r=>done[r.id]).length} of ${active.length} done` : "";
  const f0=$("#tl-edit-form"), draft = f0 && f0.dataset.rid===S.rtEdit ? { time:$("#tle-t").value, label:$("#tle-l").value, kind:$("#tle-k").value } : null;
  $("#timeline").innerHTML = items.length ? items.map(r=>{ const sk=!!skip[r.id];
    if (S.rtEdit===r.id) return rtEditRow(r, k, draft);
    return `<li class="${done[r.id]?"done":""} ${sk?"skipped":""} ${r.time<nowHM?"past":""} ${next&&next.id===r.id?"next":""}">
    <span class="tm">${esc(r.time)}</span><input type="checkbox" data-check="${esc(r.id)}" ${done[r.id]?"checked":""} ${sk?"disabled":""} aria-label="Done: ${esc(r.label)}">
    <span class="lbl">${routineIcon(r)}<span>${esc(r.label)}${r.alarm&&!r.extra?`<span class="tl-bell" title="Alarm ${+r.before?(+r.before)+" min before":"at the time"}">${SVG(ICON.bell)}</span>`:""}${sk?'<span class="pill">Skipped</span>':""}${r.extra?`<span class="pill">${r.from?"Changed today":"This day only"}</span>`:""}</span></span>
    <span class="kind">${esc((KINDS.find(x=>x[0]===r.kind)||["","Other"])[1])}</span>
    <span class="tl-acts"><button class="x tl-ed" type="button" data-rtedit="${esc(r.id)}" aria-label="Edit ${esc(r.label)}" title="Edit">${SVG(ICON.edit)}</button>${r.extra ? `<button class="x" type="button" data-delextra="${esc(r.id)}" aria-label="Remove ${esc(r.label)}">✕</button>`
      : `<button class="x small" type="button" data-skip="${esc(r.id)}">${sk?"Undo":"Skip"}</button>`}</span></li>`; }).join("")
    : `<li class="empty" style="display:block">${S.ready?"Nothing scheduled for this day.":"Loading…"}</li>`;
  const open=S.todos.filter(t=>!t.done && (!t.date||t.date<=tk)).sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  const later=S.todos.filter(t=>!t.done && t.date>tk).sort((a,b)=>a.date.localeCompare(b.date));
  $("#todo-meta").textContent = later.length?`${later.length} scheduled later`:"";
  const row = t => `<li class="${t.done?"done":""}"><input type="checkbox" data-todo="${esc(t.id)}" ${t.done?"checked":""} aria-label="Done: ${esc(t.title)}">
    <span class="grow"><span>${esc(t.title)}</span>${t.date&&t.date!==tk?`<div class="sub ${t.date<tk&&!t.done?"overdue":""}">${t.date<tk?"From ":""}${esc(fmtDate(t.date))}</div>`:""}</span>
    <button class="x" type="button" data-deltodo="${esc(t.id)}" aria-label="Delete">✕</button></li>`;
  $("#todos").innerHTML = (open.length||later.length) ? open.map(row).join("") + (later.length?`<li class="sub" style="background:var(--sunk)">Later</li>`+later.map(row).join(""):"")
    : `<li class="empty">${S.ready?"Nothing to do. Add one in the box above.":"Loading…"}</li>`;
  { const sh = studyTodayHtml(); $("#today-study-wrap").hidden = !sh; $("#today-study").innerHTML = sh; }
  const focus=sortTasks(S.tasks.filter(t=>t.status!=="done")).slice(0,3);
  $("#focus").innerHTML = focus.length?focus.map(taskCard).join(""):`<div class="panel empty">${S.ready?"No open work tasks. Switch the box above to Work to add one.":"Loading…"}</div>`;
  const doneT=S.todos.filter(t=>t.done&&isoDay(t.doneAt)===tk).map(t=>({l:t.title,s:"To-do",at:t.doneAt}));
  const doneW=S.tasks.filter(t=>t.status==="done"&&isoDay(t.doneAt)===tk).map(t=>({l:t.title,s:catName(t.category),at:t.doneAt}));
  const all=[...doneW,...doneT].sort((a,b)=>b.at.localeCompare(a.at));
  $("#done-meta").textContent = all.length?`${all.length} completed`:"";
  $("#donetoday").innerHTML = all.length?all.map(x=>`<li><span class="grow"><span>${esc(x.l)}</span><div class="sub">${esc(x.s)} · ${fmtTime(x.at)}</div></span></li>`).join(""):`<li class="empty">Completed to-dos and work tasks show up here.</li>`;
}
function renderWork(){
  const counts={todo:0,doing:0,blocked:0,done:0}; S.tasks.forEach(t=>counts[t.status]=(counts[t.status]||0)+1);
  $("#stats").innerHTML = STATUS.map(([k,l])=>`<button type="button" class="stat" data-st="${k}" aria-pressed="${S.stFilter===k}"><b>${counts[k]||0}</b><span>${l}</span></button>`).join("");
  const used=[...new Set(S.tasks.map(t=>t.category||""))];
  const cats=[...S.cats.map(c=>c.tag).filter(t=>used.includes(t)), ...used.filter(u=>!S.cats.find(c=>c.tag===u))];
  $("#catchips").innerHTML = `<button type="button" class="chip" data-cat="" aria-pressed="${!S.catFilter}">All categories</button>` + cats.map(c=>`<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${S.catFilter===c}">${esc(catName(c))} <span class="muted">${S.tasks.filter(t=>(t.category||"")===c&&t.status!=="done").length}</span></button>`).join("")
    + `<button type="button" class="chip" data-st="${S.stFilter==="all"?"open":"all"}" aria-pressed="${S.stFilter==="all"}">${S.stFilter==="all"?"Showing all":"Show done too"}</button>`;
  let list=S.tasks.filter(t=> S.catFilter===null || (t.category||"")===S.catFilter);
  if(S.stFilter==="open") list=list.filter(t=>t.status!=="done"); else if(S.stFilter!=="all") list=list.filter(t=>t.status===S.stFilter);
  $("#tasklist").innerHTML = list.length?sortTasks(list).map(taskCard).join(""):`<div class="panel empty">${S.ready?"No tasks here. Type one in the box above, e.g. <b>Update monthly scrap report #excel !high @fri</b>":"Loading…"}</div>`;
}

// ---------- task editor
let editing=null, confirmDel=false;
const newSubId = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
function openTask(id){
  const t=S.tasks.find(x=>x.id===id); if(!t) return;
  editing={...t,log:[...(t.log||[])],subtasks:(t.subtasks||[]).map(s=>({...s})),links:(t.links||[]).map(l=>({...l}))};
  confirmDel=false; drawTask(); const d=$("#dlg");
  if(!d.open){ const touch=matchMedia("(hover: none)").matches; d.toggleAttribute("autofocus", touch); if(touch) d.tabIndex=-1; d.showModal(); if(touch) d.focus({preventScroll:true}); d.scrollTop=0; }
}
function autoProgress(){
  const s=editing.subtasks; if(!s.length) return;
  editing.progress=Math.round(s.filter(x=>x.done).length/s.length*100);
  if(editing.progress>0 && editing.status==="todo") editing.status="doing";
}
function drawTask(){
  const t=editing, subs=t.subtasks, mins=taskMins(t.id);
  $("#tf").innerHTML = `<div class="dlg-top"><h3>Work task</h3><button type="button" class="iconbtn dlg-x" data-dlg-x aria-label="Close without saving" title="Close">✕</button></div>
    <label class="f">Task<input id="t-title" value="${esc(t.title)}" required></label>
    <label class="f">Description<textarea id="t-desc" placeholder="What exactly was asked, expected output, where the data is">${esc(t.desc)}</textarea></label>
    <div class="f" style="display:grid;gap:6px"><span class="small muted" style="font-weight:600">Steps ${subs.length?`<span class="muted">· ${subs.filter(s=>s.done).length}/${subs.length} done · progress updates automatically</span>`:""}</span>
      ${subs.length?`<ul class="subs">${subs.map((s,i)=>`<li class="${s.done?"done":""}"><input type="checkbox" data-subtog="${i}" ${s.done?"checked":""} aria-label="Step done: ${esc(s.text)}"><span>${esc(s.text)}</span><button type="button" class="x" data-subdel="${i}" aria-label="Remove step">✕</button></li>`).join("")}</ul>`:""}
      <div class="qrow"><input id="t-subnew" placeholder="Add a step, e.g. Get read access to the database" class="inp"><button class="btn sm" type="button" id="t-subadd">Add step</button></div></div>
    <div class="grid2">
      <label class="f">Category<select id="t-cat"><option value="">Uncategorised</option>${S.cats.map(c=>`<option value="${esc(c.tag)}" ${c.tag===t.category?"selected":""}>${esc(c.name)}</option>`).join("")}</select></label>
      <label class="f">Due date<input type="date" id="t-due" value="${esc(t.due)}"></label>
      <label class="f">Assigned by<input id="t-by" value="${esc(t.assignedBy)}" placeholder="Supervisor's name"></label>
      <label class="f">Repeats<select id="t-repeat">${REPEAT.map(([v,l])=>`<option value="${v}" ${(t.repeat||"none")===v?"selected":""}>${l}</option>`).join("")}</select></label>
      <label class="f">Progress: <span id="t-pv">${+t.progress||0}%</span><input type="range" id="t-prog" min="0" max="100" step="${subs.length?1:5}" value="${+t.progress||0}" ${subs.length?"disabled":""} style="padding:0;border:0;background:none"></label>
      <div class="f" style="display:grid;gap:4px"><span class="small muted" style="font-weight:600">Time spent</span><span class="tspent">${SVG(ICON.timer)}${mins?fmtMins(mins):"None yet"}<span class="muted small"> · use ▶ on the task card</span></span></div>
    </div>
    <div class="f" style="display:grid;gap:4px"><span class="small muted" style="font-weight:600">Urgency</span><div class="seg" id="t-urg">${URG.map(u=>`<button type="button" data-v="${u}" aria-pressed="${t.urgency===u}">${u[0].toUpperCase()+u.slice(1)}</button>`).join("")}</div></div>
    <div class="f" style="display:grid;gap:4px"><span class="small muted" style="font-weight:600">Status</span><div class="seg" id="t-st">${STATUS.map(([k,l])=>`<button type="button" data-v="${k}" aria-pressed="${t.status===k}">${l}</button>`).join("")}</div></div>
    <label class="f">Bottleneck<textarea id="t-block" placeholder="What's slowing this down? Waiting for data, access, clarification…" style="min-height:52px">${esc(t.bottleneck)}</textarea></label>
    <label class="f">Result / impact <span class="muted" style="font-weight:400">· shows on your resume bullets</span><input id="t-impact" value="${esc(t.impact||"")}" placeholder="e.g. Cut report time from 2 hours to 20 minutes"></label>
    <label class="f">Notes <span class="muted" style="font-weight:400">· SQL queries, file paths, meeting notes</span><textarea id="t-notes" class="mono" placeholder="SELECT batch_id, COUNT(*) FROM production GROUP BY batch_id HAVING COUNT(*) > 1;">${esc(t.notes||"")}</textarea></label>
    <div class="f" style="display:grid;gap:6px"><span class="small muted" style="font-weight:600">Links</span>
      ${t.links.length?`<ul class="links">${t.links.map((l,i)=>`<li>${SVG(ICON.link)}<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label||l.url)}</a><button type="button" class="x" data-linkdel="${i}" aria-label="Remove link">✕</button></li>`).join("")}</ul>`:""}
      <div class="qrow rwrap"><input id="t-linkurl" type="url" placeholder="Paste a link (shared drive, sheet, ticket)" class="inp"><input id="t-linklabel" placeholder="Name (optional)" class="inp" style="max-width:180px"><button class="btn sm" type="button" id="t-linkadd">Add link</button></div></div>
    <div style="display:grid;gap:6px"><span class="small muted" style="font-weight:600">Progress log</span>
      <div class="qrow"><input id="t-note" placeholder="Add an update, e.g. Finished joining the sales tables" class="inp"><button class="btn sm" type="button" id="t-addnote">Log</button></div>
      <ul class="log">${t.log.slice().reverse().map(l=>`<li><time>${esc(fmtDate(isoDay(l.at)))} ${fmtTime(l.at)}</time><span>${esc(l.note)}</span></li>`).join("")}</ul></div>
    <div class="dlgfoot">
      <button class="btn ghost danger sm" type="button" id="t-del">${confirmDel?"Tap again to delete":"Delete"}</button>
      <div style="display:flex;gap:8px"><button class="btn" type="button" id="t-cancel">Cancel</button><button class="btn primary" type="button" id="t-save">Save</button></div>
    </div>`;
}
function readTaskForm(){ const t=editing; t.title=$("#t-title").value.trim()||t.title; t.desc=$("#t-desc").value; t.category=$("#t-cat").value; t.due=$("#t-due").value; t.assignedBy=$("#t-by").value.trim(); if(!(t.subtasks||[]).length) t.progress=+$("#t-prog").value; t.bottleneck=$("#t-block").value.trim(); t.repeat=$("#t-repeat").value; t.impact=$("#t-impact").value.trim(); t.notes=$("#t-notes").value; }
function redrawKeep(focusId){ const sc=$("#dlg").scrollTop; drawTask(); $("#dlg").scrollTop=sc; if(focusId) $("#"+focusId)?.focus(); }
$("#tf").addEventListener("input", e=>{ if(e.target.id==="t-prog") $("#t-pv").textContent=e.target.value+"%"; });
$("#tf").addEventListener("change", e=>{ const i=e.target.dataset.subtog; if(i===undefined) return; readTaskForm(); const s=editing.subtasks[+i]; s.done=e.target.checked; s.doneAt=s.done?nowISO():""; autoProgress(); redrawKeep(); });
$("#tf").addEventListener("click", e=>{
  const b=e.target.closest("button"); if(!b) return;
  if(b.parentElement.id==="t-urg"){ readTaskForm(); editing.urgency=b.dataset.v; redrawKeep(); }
  else if(b.parentElement.id==="t-st"){ readTaskForm(); editing.status=b.dataset.v; if(b.dataset.v==="done") editing.progress=100; redrawKeep(b.dataset.v==="done"?"t-impact":null); }
  else if(b.id==="t-addnote"){ readTaskForm(); const n=$("#t-note").value.trim(); if(n){ editing.log.push({at:nowISO(),note:n}); redrawKeep("t-note"); } }
  else if(b.id==="t-subadd"){ readTaskForm(); const n=$("#t-subnew").value.trim(); if(n){ editing.subtasks.push({id:newSubId(),text:n,done:false}); autoProgress(); redrawKeep("t-subnew"); } }
  else if(b.dataset.subdel!==undefined){ readTaskForm(); editing.subtasks.splice(+b.dataset.subdel,1); autoProgress(); redrawKeep(); }
  else if(b.id==="t-linkadd"){ readTaskForm(); let u=$("#t-linkurl").value.trim(); if(!u) return; if(!/^https?:\/\//i.test(u)) u="https://"+u; editing.links.push({url:u,label:$("#t-linklabel").value.trim()}); redrawKeep("t-linkurl"); }
  else if(b.dataset.linkdel!==undefined){ readTaskForm(); editing.links.splice(+b.dataset.linkdel,1); redrawKeep(); }
  else if(b.id==="t-cancel"){ $("#dlg").close(); }
  else if(b.id==="t-del"){ if(!confirmDel){ readTaskForm(); confirmDel=true; redrawKeep(); } else { if(S.timer&&S.timer.ref===editing.id) stopTimer(false); del("tasks",editing.id); $("#dlg").close(); toast("Task deleted"); } }
  else if(b.id==="t-save"){ readTaskForm(); saveTask(); }
});
$("#tf").addEventListener("keydown", e=>{
  if(e.key!=="Enter") return;
  const map={"t-note":"t-addnote","t-subnew":"t-subadd","t-linkurl":"t-linkadd","t-linklabel":"t-linkadd"};
  if(map[e.target.id]){ e.preventDefault(); $("#"+map[e.target.id]).click(); }
});
function nextDue(from, rep){
  const [y,m,d]=from.split("-").map(Number); const dt=new Date(y,m-1,d);
  if(rep==="daily") dt.setDate(dt.getDate()+1);
  else if(rep==="weekdays"){ do { dt.setDate(dt.getDate()+1); } while(isWeekend(dt.getDay())); }
  else if(rep==="weekly") dt.setDate(dt.getDate()+7);
  else if(rep==="monthly"){ const target=new Date(y,m,1); const last=new Date(y,m+1,0).getDate(); target.setDate(Math.min(d,last)); return dkey(target); }
  return dkey(dt);
}
function saveTask(){
  const t=editing, old=S.tasks.find(x=>x.id===t.id)||{};
  const pending=$("#t-note")&&$("#t-note").value.trim(); if(pending) t.log.push({at:nowISO(),note:pending});
  const oldDone=new Set((old.subtasks||[]).filter(s=>s.done).map(s=>s.id));
  t.subtasks.filter(s=>s.done&&!oldDone.has(s.id)).forEach(s=>t.log.push({at:nowISO(),note:`Step done: ${s.text}`}));
  if(old.status!==t.status) t.log.push({at:nowISO(),note:`Status: ${STATUS_LABEL[old.status]||"—"} → ${STATUS_LABEL[t.status]}`});
  if((+old.progress||0)!==t.progress) t.log.push({at:nowISO(),note:`Progress ${+old.progress||0}% → ${t.progress}%`});
  if(t.bottleneck && t.bottleneck!==old.bottleneck) t.log.push({at:nowISO(),note:`Bottleneck: ${t.bottleneck}`});
  if(t.impact && t.impact!==old.impact) t.log.push({at:nowISO(),note:`Result: ${t.impact}`});
  const justDone = t.status==="done" && old.status!=="done";
  if(justDone) t.doneAt=nowISO();
  if(t.status!=="done") t.doneAt="";
  t.updatedAt=nowISO(); if(t.log.length>200) t.log=t.log.slice(-200);
  if(justDone && S.timer && S.timer.ref===t.id) stopTimer(false);
  put("tasks", t.id, strip(t)); $("#dlg").close();
  if(justDone && t.repeat && t.repeat!=="none"){
    const due=nextDue(t.due||todayKey(), t.repeat), id=newId();
    put("tasks", id, {title:t.title,desc:t.desc||"",category:t.category||"",urgency:t.urgency,status:"todo",progress:0,bottleneck:"",assignedBy:t.assignedBy||"",due,
      repeat:t.repeat,notes:t.notes||"",links:t.links||[],subtasks:(t.subtasks||[]).map(s=>({id:newSubId(),text:s.text,done:false})),impact:"",
      createdAt:nowISO(),updatedAt:nowISO(),doneAt:"",log:[{at:nowISO(),note:`Task added (repeats ${(REPEAT_SHORT[t.repeat]||"").toLowerCase()})`}]});
    toast("Done. Next one added for "+fmtDate(due));
  } else toast("Saved");
}

// ---------- overview
S.ovRange=7; S.ovOpen=null;
document.addEventListener("keydown", e=>{ const li=e.target.closest&&e.target.closest(".od-list li[role=button]"); if(li&&e.target===li&&(e.key==="Enter"||e.key===" ")){ e.preventDefault(); li.click(); } });
function rangeKeys(n){ const out=[]; const d=new Date(); d.setDate(d.getDate()-(n-1)); for(let i=0;i<n;i++){ out.push(dkey(d)); d.setDate(d.getDate()+1); } return out; }
function startKey(){
  const c=[...S.tasks.map(t=>isoDay(t.createdAt)), ...S.todos.map(t=>isoDay(t.createdAt)), ...Object.keys(S.refl), ...Object.keys(S.day).filter(k=>k<=todayKey()), ...Object.keys(S.health||{}).filter(k=>k<=todayKey()), ...(S.exp||[]).map(e=>e.date)].filter(Boolean).sort();
  return c[0] || todayKey();
}
function barChart(vals, labels, max, fmt, color){
  const W=600,H=190,L=50,B=30,T=10,R=6, n=vals.length, cw=(W-L-R)/n, bw=Math.max(3,Math.min(36,cw*0.62)), y=v=>T+(H-T-B)*(1-v/max);
  const ticks=[0,max/2,max];
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img">`;
  ticks.forEach(t=>{ s+=`<line x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${L-6}" y="${y(t)+3}" text-anchor="end">${fmt(t)}</text>`; });
  vals.forEach((v,i)=>{ const x=L+cw*i+(cw-bw)/2; if(v===null){ s+=`<rect x="${x}" y="${y(0)-2}" width="${bw}" height="2" fill="var(--line)"/>`; } else { const h=Math.max(v>0?2:0,y(0)-y(v)); s+=`<rect x="${x}" y="${y(0)-h}" width="${bw}" height="${h}" rx="2" fill="${color}"><title>${esc(labels[i].full)}: ${fmt(v)}</title></rect>`; }
    if(labels[i].show) s+=`<text x="${x+bw/2}" y="${H-6}" text-anchor="middle">${esc(labels[i].short)}</text>`; });
  return s+`</svg>`;
}
function renderOverview(){
  const n=S.ovRange, tk=todayKey(), st=startKey();
  const keys=rangeKeys(n), active=keys.filter(k=>k>=st);
  $("#ov-range").innerHTML=[[7,"Last 7 days"],[30,"Last 30 days"]].map(([v,l])=>`<button type="button" data-ovr="${v}" aria-pressed="${n===v}">${l}</button>`).join("");
  $("#ov-since").textContent = `Tracking since ${fmtDate(st)}`+(active.length<n?` · ${active.length} day${active.length>1?"s":""} of data so far`:"");
  const inR = k => k && k>=keys[0] && k<=tk;
  // routine per day
  const perKind={}; let schedTot=0, doneTot=0;
  const rPct = keys.map(k=>{ if(k<st) return null; const dd=dayDoc(k), items=routineFor(k).filter(r=>!(dd.skip||{})[r.id]);
    const isT=k===tk, nowHM=pad(new Date().getHours())+":"+pad(new Date().getMinutes());
    const due = isT ? items.filter(r=>r.time<=nowHM || (dd.done||{})[r.id]) : items;
    let d=0; due.forEach(r=>{ const ok=!!(dd.done||{})[r.id]; if(ok) d++; const kk=r.kind||"other"; perKind[kk]=perKind[kk]||{s:0,d:0}; perKind[kk].s++; if(ok) perKind[kk].d++; });
    schedTot+=due.length; doneTot+=d; return due.length? Math.round(d/due.length*100) : null; });
  // work activity per day
  const isUpd = l => !/^Task added/.test(l.note||"");
  const wAct = keys.map(k=> k<st?null: S.tasks.reduce((a,t)=>a+(t.log||[]).filter(l=>isoDay(l.at)===k&&isUpd(l)).length,0));
  const tasksDone=S.tasks.filter(t=>t.status==="done"&&inR(isoDay(t.doneAt)));
  const updates=wAct.reduce((a,b)=>a+(b||0),0);
  const todosDone=S.todos.filter(t=>t.done&&inR(isoDay(t.doneAt))).length;
  const weekdays=active.filter(k=>!isWeekend(keyDow(k))).length;
  const refls=Object.values(S.refl).filter(r=>inR(r.date));
  const moods=refls.filter(r=>r.mood).map(r=>r.mood);
  const open=S.tasks.filter(t=>t.status!=="done");
  const tile=(v,l,s,id)=>`<button type="button" class="tile ${S.ovOpen===id?"is-open":""}" data-ovt="${id}" aria-expanded="${S.ovOpen===id}"><span>${l}</span><b>${v}</b>${s?`<small>${s}</small>`:""}<i class="tile-more" aria-hidden="true">${S.ovOpen===id?"Hide":"Details"} ›</i></button>`;
  $("#ov-tiles").innerHTML = [
    tile(tasksDone.length,"Work tasks done",`${open.length} still open`,"tasks"),
    tile(updates,"Task updates logged","","updates"),
    tile(todosDone,"To-dos done","","todos"),
    tile(schedTot?Math.round(doneTot/schedTot*100)+"%":"–","Routine kept",`${doneTot} of ${schedTot} items`,"routine"),
    tile(`${refls.length}<span style="font-size:.9rem;text-transform:none;letter-spacing:0">/${weekdays||0}</span>`,"Reflections","written vs workdays","refl"),
    tile(moods.length?(moods.reduce((a,b)=>a+b,0)/moods.length).toFixed(1):"–","Avg energy",moods.length?"out of 5":"rate it in Reflection","mood")
  ].join("");
  // details for the tapped tile
  const day = k => `<span class="od-d">${esc(fmtDate(k).replace(/^\w+, /, ""))}</span>`;
  const list = (rows, empty) => rows.length ? `<ul class="od-list">${rows.join("")}</ul>` : `<p class="small muted" style="margin:0">${empty}</p>`;
  const D = {
    tasks: () => ["Work tasks done", list(tasksDone.slice().sort((a,b)=>(b.doneAt||"").localeCompare(a.doneAt||"")).map(t=>`<li data-task="${esc(t.id)}" role="button" tabindex="0">${day(isoDay(t.doneAt))}<span class="od-b"><b>${esc(t.title)}</b>${t.impact?`<span class="od-s">${esc(t.impact)}</span>`:""}</span>${catTag(t.category)}</li>`), "No work tasks finished in this period.")],
    updates: () => { const L=[]; S.tasks.forEach(t=>(t.log||[]).forEach(l=>{ if(inR(isoDay(l.at))&&isUpd(l)) L.push({t,l}); })); L.sort((a,b)=>(b.l.at||"").localeCompare(a.l.at||""));
      const G=new Map(); L.forEach(x=>{ if(!G.has(x.t.id)) G.set(x.t.id,{t:x.t,last:x.l.at,notes:[]}); G.get(x.t.id).notes.push(x.l.note||""); });
      return ["Task updates logged", list([...G.values()].map(g=>`<li data-task="${esc(g.t.id)}" role="button" tabindex="0">${day(isoDay(g.last))}<span class="od-b"><b>${esc(g.t.title)}</b><span class="od-s">${g.notes.slice(0,3).map(esc).join(" · ")}${g.notes.length>3?` · +${g.notes.length-3} more`:""}</span></span><span class="od-n">${g.notes.length} update${g.notes.length===1?"":"s"}</span></li>`), "No updates logged in this period.")]; },
    todos: () => ["To-dos done", list(S.todos.filter(t=>t.done&&inR(isoDay(t.doneAt))).sort((a,b)=>(b.doneAt||"").localeCompare(a.doneAt||"")).map(t=>`<li>${day(isoDay(t.doneAt))}<span class="od-b">${esc(t.title)}</span></li>`), "No to-dos ticked off in this period.")],
    routine: () => ["Routine kept, day by day", list(keys.map((k,i)=>[k,rPct[i]]).filter(([,p])=>p!==null).reverse().map(([k,p])=>{ const dd=dayDoc(k), its=routineFor(k).filter(r=>!(dd.skip||{})[r.id]), miss=its.filter(r=>!(dd.done||{})[r.id]&&(k<tk||r.time<=pad(new Date().getHours())+":"+pad(new Date().getMinutes())));
      return `<li data-ovday="${k}" role="button" tabindex="0">${day(k)}<span class="od-b"><span class="bar od-bar"><i style="width:${p}%;background:${p>=80?"var(--ok)":p>=50?"var(--med)":"var(--crit)"}"></i></span>${miss.length?`<span class="od-s">Missed: ${miss.slice(0,4).map(r=>esc(r.label)).join(", ")}${miss.length>4?` +${miss.length-4}`:""}</span>`:`<span class="od-s">All done</span>`}</span><span class="od-n">${p}%</span></li>`; }), "No routine data yet.")],
    refl: () => ["Reflections", list(refls.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(r=>`<li data-calrefl="${esc(r.date)}" role="button" tabindex="0">${day(r.date)}<span class="od-b">${esc(((r.did||r.learned||r.improve||"").trim().split("\n")[0]).slice(0,140))||'<span class="muted">(empty)</span>'}</span>${r.mood?`<span class="od-n">${r.mood}/5</span>`:""}</li>`), "No reflections written in this period.")],
    mood: () => ["Energy by day", list(refls.filter(r=>r.mood).sort((a,b)=>b.date.localeCompare(a.date)).map(r=>`<li data-calrefl="${esc(r.date)}" role="button" tabindex="0">${day(r.date)}<span class="od-b"><span class="od-dots">${[1,2,3,4,5].map(i=>`<i class="${i<=r.mood?"on":""}"></i>`).join("")}</span></span><span class="od-n">${r.mood}/5</span></li>`), "Rate your energy in Reflection to see it here.")]
  };
  const det = S.ovOpen && D[S.ovOpen] ? D[S.ovOpen]() : null;
  $("#ov-detail").hidden = !det;
  $("#ov-detail").innerHTML = det ? `<div class="sechead"><h2>${det[0]}</h2><span class="meta">${n===7?"Last 7 days":"Last 30 days"} · <button type="button" class="linkbtn" data-ovt="${S.ovOpen}">Close</button></span></div>${det[1]}` : "";
  const labels=keys.map((k,i)=>({full:fmtDate(k), short:n<=7?DAYS[keyDow(k)].slice(0,2):k.slice(8), show: n<=7 || i%5===0 || i===n-1}));
  $("#ov-rchart").innerHTML = barChart(rPct, labels, 100, v=>Math.round(v)+"%", "var(--accent)");
  const wmax=Math.max(4, ...wAct.map(v=>v||0)); const wm=Math.ceil(wmax/2)*2;
  $("#ov-wchart").innerHTML = barChart(wAct, labels, wm, v=>Math.round(v), "var(--high)");
  // categories
  const cats=[...new Set([...S.cats.map(c=>c.tag), ...S.tasks.map(t=>t.category||"")])].filter(c=>S.tasks.some(t=>(t.category||"")===c));
  $("#ov-cats").innerHTML = cats.length ? `<tr><th>Category</th><th>Open</th><th>Blocked</th><th>Done</th><th>Avg progress</th></tr>` + cats.map(c=>{ const ts=S.tasks.filter(t=>(t.category||"")===c), op=ts.filter(t=>t.status!=="done");
    const avg=op.length?Math.round(op.reduce((a,t)=>a+(+t.progress||0),0)/op.length):null;
    return `<tr><td>${catTag(c)}</td><td>${op.length}</td><td>${ts.filter(t=>t.status==="blocked").length||"–"}</td><td>${ts.filter(t=>t.status==="done"&&inR(isoDay(t.doneAt))).length}</td><td>${avg===null?"–":`<span style="display:inline-flex;gap:6px;align-items:center"><span class="bar" style="width:60px"><i style="width:${avg}%"></i></span>${avg}%</span>`}</td></tr>`; }).join("")
    : `<tr><td class="empty">No work tasks yet.</td></tr>`;
  // habits
  const order=["meal","supplement","break","study","class","work","health","other"];
  const ks=order.filter(k=>perKind[k]);
  $("#ov-habits").innerHTML = ks.length ? ks.map(k=>{ const p=perKind[k], pc=Math.round(p.d/p.s*100);
    return `<div class="hab"><span>${esc((KINDS.find(x=>x[0]===k)||["","Other"])[1])}</span><span class="bar"><i style="width:${pc}%;background:${pc>=80?"var(--ok)":pc>=50?"var(--med)":"var(--crit)"}"></i></span><span class="n">${p.d}/${p.s}</span></div>`; }).join("")
    : `<div class="empty">Tick items in Today's routine and your habits show up here.</div>`;
  // attention
  const att=sortTasks(open.filter(t=>t.status==="blocked" || (t.due&&t.due<tk) || (t.urgency==="critical")));
  $("#ov-attn").innerHTML = att.length ? att.map(t=>`<li data-task="${esc(t.id)}" style="cursor:pointer"><span class="urg ${esc(t.urgency)}">${esc(t.urgency)}</span><span class="grow"><span>${esc(t.title)}</span><div class="sub">${t.status==="blocked"?`<b style="color:var(--crit)">Blocked</b>${t.bottleneck?": "+esc(t.bottleneck):""}`:t.due&&t.due<tk?`<span class="overdue">Overdue since ${esc(fmtDate(t.due))}</span>`:"Critical"}</div></span></li>`).join("")
    : `<li class="empty">Nothing blocked, overdue or critical.</li>`;
  const ln=Object.values(S.refl).filter(r=>(r.learned||"").trim()).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);
  // wellbeing
  const inR2 = k => k >= keys[0] && k <= tk;
  const moodVals = keys.map(k => k < st ? null : dayMood(k)), mv = moodVals.filter(v => v !== null);
  const waterVals = keys.map(k => k < st || k > tk ? null : (hDoc(k).water || 0)), wv = waterVals.filter(v => v !== null);
  const goalDays = wv.filter(v => v >= (S.waterGoal || 8)).length;
  const bowelN = keys.reduce((a, k) => a + (hDoc(k).bowel || []).length, 0);
  const wrec = S.body.filter(r => r.weight).sort((a, b) => a.date.localeCompare(b.date)), wIn = wrec.filter(r => inR2(r.date)), wBefore = wrec.filter(r => r.date < keys[0]).pop();
  const wNow = wrec[wrec.length - 1], wStart = wBefore || wIn[0];
  const ongoing = S.conds.filter(c => c.status !== "resolved").length;
  const stressV = keys.flatMap(k => (hDoc(k).moods || []).map(m => m.stress).filter(Boolean));
  const mini = (v, l, s) => `<div class="mini"><span>${l}</span><b>${v}</b>${s ? `<small>${s}</small>` : ""}</div>`;
  $("#ov-well").innerHTML = `<div class="minis">
      ${mini(mv.length ? MOODS[Math.round(mv.reduce((a, b) => a + b, 0) / mv.length) - 1][1] : "–", "Average mood", mv.length ? `${mv.length} day${mv.length > 1 ? "s" : ""} checked in` : "check in on the Health tab")}
      ${mini(stressV.length ? (stressV.reduce((a, b) => a + b, 0) / stressV.length).toFixed(1) + "/5" : "–", "Average stress", "")}
      ${mini(wv.length ? (wv.reduce((a, b) => a + b, 0) / wv.length).toFixed(1) : "–", "Cups of water/day", wv.length ? `goal met ${goalDays}/${wv.length} days` : "")}
      ${mini(bowelN, "Bowel movements", `${(bowelN / Math.max(1, keys.filter(k => k >= st && k <= tk).length)).toFixed(1)}/day`)}
      ${mini(wNow ? wNow.weight + " kg" : "–", "Weight", wNow && wStart && wStart !== wNow ? `${+wNow.weight >= +wStart.weight ? "+" : ""}${(wNow.weight - wStart.weight).toFixed(1)} kg in this period` : "")}
      ${mini(ongoing, "Ongoing health issues", ongoing ? "see Health log" : "none")}</div>
    ${(() => { const c = mealSrcCounts(keys.filter(k => k <= tk)), n = c.home + c.out + c.delivery; return n ? `<div class="m-src-bar" title="Where your meals came from"><span class="small muted">Meals (${n})</span><span class="bar msb">${MEAL_SRC.map(([v], i) => `<i style="width:${c[v] / n * 100}%;background:${["var(--c1)","var(--c3)","var(--c4)"][i]}"></i>`).join("")}</span><span class="small">${MEAL_SRC.map(([v, l, ic]) => `${ic} ${Math.round(c[v] / n * 100)}%`).join(" · ")}</span></div>` : ""; })()}
    ${mv.length ? `<div class="sechead" style="margin:6px 0 0"><h3 class="small">Mood by day</h3><span class="meta">1 awful · 5 great</span></div>${barChart(moodVals, labels, 5, v => Math.round(v), "var(--c1)")}` : ""}`;
  $("#ov-sleep").innerHTML = sleepInsights(keys, labels, mini);
  $("#ov-time").innerHTML = timeInsights(keys);
  // spending
  const exR = S.exp.filter(e => inR2(e.date)), exTot = exR.reduce((a, e) => a + (+e.amount || 0), 0);
  const exDaily = keys.map(k => k < st || k > tk ? null : S.exp.filter(e => e.date === k).reduce((a, e) => a + (+e.amount || 0), 0));
  const exCat = {}; exR.forEach(e => exCat[e.cat] = (exCat[e.cat] || 0) + (+e.amount || 0));
  const topC = Object.entries(exCat).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const exMax = Math.max(10, ...exDaily.map(v => v || 0));
  $("#ov-spend").innerHTML = `<div class="minis">
      ${mini(money(exTot), "Spent", `${exR.length} entr${exR.length === 1 ? "y" : "ies"}`)}
      ${mini(money(exTot / Math.max(1, keys.filter(k => k >= st && k <= tk).length)), "Average per day", "")}
      ${mini(S.shop.filter(i => !i.done).length, "On shopping list", "items to buy")}</div>
    ${exTot ? `${barChart(exDaily, labels, Math.ceil(exMax / 10) * 10, v => v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v), "var(--accent)")}
      <div class="m-cats">${topC.map(([c, v]) => { const C = expCat(c); return `<div class="m-cat"><span class="hl-tag cat-${C[2]}">${esc(C[1])}</span><span class="bar"><i style="width:${(v / topC[0][1] * 100).toFixed(1)}%;background:var(--c${C[2]})"></i></span><b>${money(v)}</b><span class="small muted">${Math.round(v / exTot * 100)}%</span></div>`; }).join("")}</div>` : `<p class="small muted" style="margin:0">No spending logged in this period. Add expenses on the Money tab.</p>`}`;
  $("#ov-learn").innerHTML = ln.length ? ln.map(r=>`<li><span class="grow"><span>${esc(r.learned.slice(0,160))}</span><div class="sub">${esc(fmtDate(r.date))}</div></span></li>`).join("")
    : `<li class="empty">What you write under "What I learned" collects here.</li>`;
}

// ---------- timers (task stopwatch + focus sessions)
S.time = []; S.timer = null; S.courses = [];
let audioCtx = null;
function chime(){
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, .22, .44].forEach((t, i) => { const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = "sine"; o.frequency.value = [660, 880, 990][i];
      g.gain.setValueAtTime(.0001, audioCtx.currentTime + t); g.gain.exponentialRampToValueAtTime(.25, audioCtx.currentTime + t + .02); g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + t + .35);
      o.connect(g).connect(audioCtx.destination); o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + .4); });
  } catch {}
}
function unlockAudio(){ try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); } catch {} }
function timerTargetLabel(type, ref){
  if (type === "task") { const t = S.tasks.find(x => x.id === ref); return t ? t.title : "Task"; }
  if (type === "course") { const c = S.courses.find(x => x.id === ref); return c ? c.name : "Study"; }
  return ref || "Focus";
}
function startTimer({ type, ref, label, mode = "stopwatch", dur = 0 }){
  unlockAudio();
  if (S.timer) stopTimer(false);
  S.timer = { type, ref: ref || "", label: label || timerTargetLabel(type, ref), mode, dur, start: nowISO() };
  if (db) write("settings/timer", () => db.doc("settings/timer").set(S.timer));
  render(); tickTimer();
}
function stopTimer(finishedFocus){
  const T = S.timer; if (!T) return;
  const startMs = new Date(T.start).getTime();
  let mins = (Date.now() - startMs) / 60000;
  if (T.mode === "focus") mins = Math.min(mins, T.dur);
  S.timer = null;
  if (db) write("settings/timer", () => db.doc("settings/timer").delete());
  if (mins >= 1) {
    const id = "t" + startMs.toString(36);   // same id on every device, so a session is never logged twice
    const rec = { start: T.start, end: nowISO(), mins: Math.round(mins), date: isoDay(T.start), type: T.type, ref: T.ref || "", label: T.label || "", via: T.mode };
    if (!S.time.some(x => x.id === id)) S.time.unshift({ ...rec, id });
    if (db) write("time/" + id, () => db.doc("time/" + id).set(rec));
    if (T.type === "task") { const t = S.tasks.find(x => x.id === T.ref); if (t) put("tasks", t.id, { ...strip(t), log: [...(t.log || []), { at: nowISO(), note: `Worked ${fmtMins(rec.mins)}${T.mode === "focus" ? " (focus session)" : ""}` }].slice(-200), updatedAt: nowISO() }); }
  }
  if (finishedFocus) {
    chime();
    toast("Focus session done. Take a 5-minute break.");
    try { if ("Notification" in window && Notification.permission === "granted") new Notification("Focus session done", { body: (T.label || "Nice work") + " · take a short break", icon: "icon-192.png", tag: "daybook-focus" }); } catch {}
  } else if (mins >= 1) toast(`Logged ${fmtMins(Math.round(mins))}`);
  else toast("Timer stopped (under a minute, not logged)");
  render();
}
function tickTimer(){
  const T = S.timer, pill = $("#timerpill");
  if (!T) { pill.hidden = true; return; }
  const el = timerElapsed();
  if (T.mode === "focus" && el >= T.dur * 60) { stopTimer(true); return; }
  const shown = T.mode === "focus" ? clock(T.dur * 60 - el) : clock(el);
  pill.hidden = false;
  $("#tp-label").textContent = T.label || "Timer";
  $("#tp-time").textContent = shown;
  pill.classList.toggle("focus", T.mode === "focus");
  document.querySelectorAll("[data-live]").forEach(n => n.textContent = shown);
  const fr = $("#focus-ring"); if (fr && T.mode === "focus") fr.style.setProperty("--p", Math.min(100, el / (T.dur * 60) * 100));
}
setInterval(tickTimer, 1000);
$("#tp-stop").addEventListener("click", () => stopTimer(false));
$("#tp-label").addEventListener("click", () => { if (S.timer && S.timer.type === "task") openTask(S.timer.ref); else if (S.timer && S.timer.type === "course") location.hash = "#growth"; });
// task card timer buttons (captured first so the card itself doesn't open)
document.addEventListener("click", e => {
  const b = e.target.closest("[data-timer]"); if (!b) return;
  e.stopPropagation(); e.preventDefault();
  const id = b.dataset.timer;
  if (S.timer && S.timer.type === "task" && S.timer.ref === id) stopTimer(false);
  else { const t = S.tasks.find(x => x.id === id); startTimer({ type: "task", ref: id, label: t ? t.title : "Task" });
    if (t && t.status === "todo") put("tasks", t.id, { ...strip(t), status: "doing", log: [...(t.log || []), { at: nowISO(), note: "Status: Not started → In progress" }], updatedAt: nowISO() }); }
}, true);
document.addEventListener("keydown", e => {
  const c = e.target.closest && e.target.closest("div.task[data-task]");
  if (c && (e.key === "Enter" || e.key === " ") && e.target === c) { e.preventDefault(); openTask(c.dataset.task); }
});
// focus panel on Today
S.focusMins = 25;
function renderFocus(){
  const box = $("#focusbox"); if (!box) return;
  const prevSel = $("#fx-what") ? $("#fx-what").value : null;
  const T = S.timer;
  if (T && T.mode === "focus") {
    box.innerHTML = `<div class="fx-run"><div class="fx-ring" id="focus-ring" style="--p:${Math.min(100, timerElapsed() / (T.dur * 60) * 100)}"><span data-live>${clock(T.dur * 60 - timerElapsed())}</span></div>
      <div class="fx-txt"><b>Focusing</b><span class="muted small">${esc(T.label)}</span><div style="display:flex;gap:6px;margin-top:6px"><button class="btn sm" type="button" id="fx-stop">Stop & log</button></div></div></div>`;
    return;
  }
  const open = sortTasks(S.tasks.filter(t => t.status !== "done"));
  const opts = [`<option value="other:">Just focus (no task)</option>`]
    .concat(open.length ? [`<optgroup label="Work tasks">${open.map(t => `<option value="task:${esc(t.id)}">${esc(t.title)}</option>`).join("")}</optgroup>`] : [])
    .concat(S.courses.length ? [`<optgroup label="Courses">${S.courses.map(c => `<option value="course:${esc(c.id)}">${esc(c.name)}</option>`).join("")}</optgroup>`] : []);
  const today = S.time.filter(x => x.date === todayKey()).reduce((a, x) => a + (+x.mins || 0), 0);
  box.innerHTML = `<div class="fx-set">
    <label class="f" style="flex:1;min-width:0">Focus on<select id="fx-what">${opts.join("")}</select></label>
    <div class="seg" id="fx-len">${[15, 25, 50].map(m => `<button type="button" data-m="${m}" aria-pressed="${S.focusMins === m}">${m}m</button>`).join("")}</div>
    <button class="btn primary" type="button" id="fx-start">${SVG(ICON.play)}Start</button></div>
    <p class="small muted" style="margin:0">${today ? `Tracked today: <b>${fmtMins(today)}</b>` : "A bell rings when the session ends. Time is logged to the task or course."}</p>`;
  if (prevSel && [...$("#fx-what").options].some(o => o.value === prevSel)) $("#fx-what").value = prevSel;
}
document.addEventListener("click", e => {
  const m = e.target.closest("#fx-len [data-m]"); if (m) { S.focusMins = +m.dataset.m; renderFocus(); return; }
  if (e.target.closest("#fx-start")) { const [type, ref] = $("#fx-what").value.split(/:(.*)/s); startTimer({ type, ref, label: type === "other" ? "Focus session" : timerTargetLabel(type, ref), mode: "focus", dur: S.focusMins }); return; }
  if (e.target.closest("#fx-stop")) { stopTimer(false); return; }
});

// ---------- Growth: courses, habit streaks, skills
let courseDel = null; S.modOpen = {};
document.addEventListener("toggle", e => { const d = e.target; if (d.matches && d.matches("details[data-cid]")) S.modOpen[d.dataset.cid] = d.open; }, true);
function minsFor(pred){ return S.time.filter(pred).reduce((a, x) => a + (+x.mins || 0), 0); }
function weekAgoKey(){ const d = new Date(); d.setDate(d.getDate() - 6); return dkey(d); }
function courseStats(c){
  const mods = c.modules || [], done = mods.filter(m => m.done).length;
  const mins = minsFor(x => x.type === "course" && x.ref === c.id), week = minsFor(x => x.type === "course" && x.ref === c.id && x.date >= weekAgoKey());
  const days = new Set([...S.time.filter(x => x.type === "course" && x.ref === c.id).map(x => x.date), ...mods.filter(m => m.done && m.doneAt).map(m => isoDay(m.doneAt))]);
  let streak = 0; const d = new Date(); if (!days.has(dkey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dkey(d))) { streak++; d.setDate(d.getDate() - 1); }
  let pace = "";
  if (c.target && mods.length && done < mods.length) {
    const daysLeft = Math.ceil((new Date(c.target + "T23:59") - new Date()) / 864e5), weeks = Math.max(daysLeft / 7, 1 / 7);
    const need = (mods.length - done) / weeks;
    const recent = mods.filter(m => m.done && m.doneAt && isoDay(m.doneAt) >= weekAgoKey()).length;
    pace = daysLeft < 0 ? `<span class="warn-t">Target date has passed</span>` : `Need about <b>${need < 1 ? need.toFixed(1) : Math.ceil(need)}</b> module${need === 1 ? "" : "s"}/week to finish by ${esc(fmtDate(c.target))} · ${recent >= need ? `<span class="ok-t">on track</span>` : `<span class="warn-t">${recent} done this week</span>`}`;
  } else if (mods.length && done === mods.length) pace = `<span class="ok-t">Completed. Well done!</span>`;
  return { mods, done, pct: mods.length ? Math.round(done / mods.length * 100) : 0, mins, week, streak, pace };
}
function renderCourses(){
  $("#courses").innerHTML = S.courses.length ? S.courses.slice().sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")).map(c => { const st = courseStats(c);
    return `<div class="panel course" data-course="${esc(c.id)}">
      <div class="co-head"><span class="co-ic">${SVG(ICON.book)}</span><div class="co-title"><b>${esc(c.name)}</b><span class="muted small">${st.done}/${st.mods.length} modules${c.target ? ` · target ${esc(fmtDate(c.target))}` : ""}</span></div>
        <button class="btn sm" type="button" data-cfocus="${esc(c.id)}">${SVG(ICON.play)}Study 25m</button></div>
      <div class="co-bar"><span class="bar"><i style="width:${st.pct}%"></i></span><b class="mono-n">${st.pct}%</b></div>
      <div class="co-stats"><span><b>${fmtMins(st.week)}</b> this week</span><span><b>${fmtMins(st.mins)}</b> total</span><span>${SVG(ICON.flame)}<b>${st.streak}</b> day streak</span></div>
      ${st.pace ? `<p class="small" style="margin:0">${st.pace}</p>` : ""}
      <details class="co-mods" data-cid="${esc(c.id)}" ${(S.modOpen[c.id] ?? st.mods.length <= 12) ? "open" : ""}><summary class="small">Modules</summary>
        ${st.mods.length ? `<ul class="subs">${st.mods.map((m, i) => `<li class="${m.done ? "done" : ""}"><input type="checkbox" data-cmod="${i}" ${m.done ? "checked" : ""} aria-label="Module done: ${esc(m.title)}"><span>${esc(m.title)}</span><button type="button" class="x" data-cmoddel="${i}" aria-label="Remove module">✕</button></li>`).join("")}</ul>` : `<p class="small muted">No modules yet. Paste them below, one per line.</p>`}
        <textarea class="inp" data-cmodnew rows="2" placeholder="Paste module names, one per line"></textarea>
        <div class="co-foot"><button class="btn sm" type="button" data-cmodadd>Add modules</button><label class="small muted">Target date <input type="date" data-ctarget value="${esc(c.target || "")}"></label><button class="btn sm ghost danger" type="button" data-cdel>${courseDel === c.id ? "Tap again to delete" : "Delete course"}</button></div>
      </details></div>`; }).join("")
    : `<div class="panel empty">No courses yet. Add your Google certificate above to track modules, study hours and a streak.</div>`;
}
function saveCourse(c){ put("courses", c.id, strip(c)); }
$("#course-form").addEventListener("submit", e => { e.preventDefault(); const n = $("#course-name").value.trim(); if (!n) return;
  const c = { name: n, target: $("#course-target").value || "", modules: [], createdAt: nowISO() }; put("courses", newId(), c); $("#course-name").value = ""; $("#course-target").value = ""; toast("Course added. Paste its modules to track progress."); });
document.addEventListener("click", e => {
  const card = e.target.closest("[data-course]"); if (!card) return;
  const c = S.courses.find(x => x.id === card.dataset.course); if (!c) return;
  if (e.target.closest("[data-cfocus]")) { startTimer({ type: "course", ref: c.id, label: c.name, mode: "focus", dur: 25 }); return; }
  if (e.target.closest("[data-cmodadd]")) { const ta = card.querySelector("[data-cmodnew]"); const lines = ta.value.split(/\n+/).map(x => x.replace(/^\s*[-*•\d.)]+\s*/, "").trim()).filter(Boolean);
    if (!lines.length) return; saveCourse({ ...c, modules: [...(c.modules || []), ...lines.map(t => ({ id: newSubId(), title: t, done: false }))] }); toast(`${lines.length} module${lines.length > 1 ? "s" : ""} added`); return; }
  const md = e.target.closest("[data-cmoddel]"); if (md) { const mods = [...c.modules]; mods.splice(+md.dataset.cmoddel, 1); saveCourse({ ...c, modules: mods }); return; }
  if (e.target.closest("[data-cdel]")) { if (courseDel !== c.id) { courseDel = c.id; renderCourses(); } else { courseDel = null; del("courses", c.id); toast("Course deleted"); } }
});
document.addEventListener("change", e => {
  const card = e.target.closest("[data-course]"); if (!card) return;
  const c = S.courses.find(x => x.id === card.dataset.course); if (!c) return;
  if (e.target.dataset.cmod !== undefined) { const mods = c.modules.map(m => ({ ...m })); const m = mods[+e.target.dataset.cmod]; m.done = e.target.checked; m.doneAt = m.done ? nowISO() : ""; saveCourse({ ...c, modules: mods }); if (m.done) toast("Module done"); }
  if (e.target.matches("[data-ctarget]")) saveCourse({ ...c, target: e.target.value });
});
function habitStats(){
  const tk = todayKey(), st = startKey(), nowHM = pad(new Date().getHours()) + ":" + pad(new Date().getMinutes());
  const monthStart = tk.slice(0, 8) + "01";
  return S.routine.filter(r => !r.extra).map(r => {
    const days = r.days && r.days.length ? r.days : [0,1,2,3,4,5,6];
    let cur = 0, best = 0, run = 0, counting = true, mDone = 0, mSched = 0;
    const d = new Date();
    for (let i = 0; i < 120; i++) {
      const k = dkey(d); if (k < st) break;
      if (days.includes(d.getDay())) {
        const dd = S.day[k] || {}, done = !!(dd.done || {})[r.id], skip = !!(dd.skip || {})[r.id];
        const pending = k === tk && !done && r.time > nowHM;
        if (!skip && !pending) {
          if (k >= monthStart) { mSched++; if (done) mDone++; }
          if (done) { run++; if (counting) cur = run; best = Math.max(best, run); }
          else { if (k !== tk) counting = false; run = 0; }
        }
      }
      d.setDate(d.getDate() - 1);
    }
    return { r, cur, best, mDone, mSched };
  }).filter(h => h.mSched || h.cur).sort((a, b) => b.cur - a.cur || b.mDone / (b.mSched || 1) - a.mDone / (a.mSched || 1));
}
function renderHabits(){
  const hs = habitStats();
  $("#habits").innerHTML = hs.length ? hs.map(h => `<div class="habit"><div class="hb-top">${routineIcon(h.r)}<span class="hb-name">${esc(h.r.label)}</span></div>
    <div class="hb-streak ${h.cur ? "on" : ""}">${SVG(ICON.flame)}<b>${h.cur}</b><span>day${h.cur === 1 ? "" : "s"}</span></div>
    <div class="hb-meta small muted">Best ${h.best} · This month ${h.mDone}/${h.mSched}</div></div>`).join("")
    : `<div class="panel empty" style="grid-column:1/-1">Tick routine items on the Today page and your streaks build up here.</div>`;
}
function skillData(){
  const cats = [...new Set([...S.cats.map(c => c.tag), ...S.tasks.map(t => t.category || "")])];
  return cats.map(tag => {
    const ts = S.tasks.filter(t => (t.category || "") === tag); if (!ts.length) return null;
    const done = ts.filter(t => t.status === "done").sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
    const mins = minsFor(x => x.type === "task" && ts.some(t => t.id === x.ref));
    return { tag, name: tag ? catName(tag) : "Uncategorised", done, open: ts.length - done.length, mins };
  }).filter(Boolean).sort((a, b) => b.done.length - a.done.length || b.mins - a.mins);
}
function resumeBullets(){
  const sd = skillData().filter(s => s.done.length);
  const L = [];
  for (const s of sd) {
    const ex = s.done.slice(0, 3).map(t => t.title.replace(/^\(Example\)\s*/i, "")).join("; ");
    L.push(`• ${s.name}: completed ${s.done.length} task${s.done.length > 1 ? "s" : ""}${s.mins >= 60 ? ` (${Math.round(s.mins / 60)}+ hours)` : ""}, including ${ex}.`);
  }
  S.tasks.filter(t => t.status === "done" && t.impact).sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || "")).forEach(t => L.push(`• ${t.title}: ${t.impact}`));
  return L;
}
function renderSkills(){
  const sd = skillData();
  $("#skills").innerHTML = sd.length ? sd.map(s => `<div class="panel skill"><div class="sk-head">${catTag(s.tag)}<span class="muted small">${s.done.length} done · ${s.open} open${s.mins ? " · " + fmtMins(s.mins) : ""}</span></div>
      ${s.done.length ? `<ul class="sk-list">${s.done.slice(0, 5).map(t => `<li data-task="${esc(t.id)}"><span>${esc(t.title)}</span>${t.impact ? `<span class="impact">${SVG(ICON.star)}${esc(t.impact)}</span>` : ""}</li>`).join("")}</ul>` : `<p class="small muted" style="margin:0">Finish a task in this category to start building your record.</p>`}</div>`).join("")
    : `<div class="panel empty">Your skills build up here as you complete work tasks.</div>`;
  const b = resumeBullets();
  $("#bullets").textContent = b.length ? b.join("\n") : "Complete a few work tasks (and add a Result / impact when you mark them done) to generate resume bullet points here.";
  $("#bullets-copy").disabled = !b.length;
}
$("#bullets-copy").addEventListener("click", async () => { const txt = resumeBullets().join("\n"); try { await navigator.clipboard.writeText(txt); toast("Bullet points copied"); } catch { const r = document.createRange(); r.selectNodeContents($("#bullets")); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast("Select and copy the highlighted text"); } });
function renderGrowth(){ renderCourses(); renderHabits(); renderSkills(); }

// ---------- weekly report / logbook
S.wkOff = 0;
function weekKeys(off){ const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7); const out = []; for (let i = 0; i < 7; i++) { out.push(dkey(d)); d.setDate(d.getDate() + 1); } return out; }
function weekData(off){
  const keys = weekKeys(off), a = keys[0], b = keys[6], inW = k => k && k >= a && k <= b;
  const completed = S.tasks.filter(t => t.status === "done" && inW(isoDay(t.doneAt)));
  const active = S.tasks.filter(t => t.status !== "done" && ((t.log || []).some(l => inW(isoDay(l.at))) || inW(isoDay(t.createdAt)) || (t.due && t.due <= b)));
  const updates = S.tasks.reduce((n, t) => n + (t.log || []).filter(l => inW(isoDay(l.at)) && !/^Task added/.test(l.note)).length, 0);
  const timeW = S.time.filter(x => inW(x.date));
  const byCat = {}; timeW.forEach(x => { let k = "Other"; if (x.type === "task") { const t = S.tasks.find(y => y.id === x.ref); k = t ? catName(t.category) : "Work"; } else if (x.type === "course") k = "Study: " + timerTargetLabel("course", x.ref); else k = "Focus"; byCat[k] = (byCat[k] || 0) + (+x.mins || 0); });
  const totalMins = timeW.reduce((s, x) => s + (+x.mins || 0), 0);
  const todosDone = S.todos.filter(t => t.done && inW(isoDay(t.doneAt))).length;
  let rs = 0, rd = 0; keys.filter(k => k <= todayKey() && S.day[k]).forEach(k => { const dd = dayDoc(k); routineFor(k).filter(r => !(dd.skip || {})[r.id]).forEach(r => { rs++; if ((dd.done || {})[r.id]) rd++; }); });
  const days = keys.map(k => ({ k, refl: S.refl[k], upd: S.tasks.map(t => ({ t, e: (t.log || []).filter(l => isoDay(l.at) === k && !/^(Task added|Progress \d|Status:)/.test(l.note)) })).filter(x => x.e.length) })).filter(d => d.refl || d.upd.length);
  const learned = keys.map(k => S.refl[k]).filter(r => r && (r.learned || "").trim());
  const mistakes = keys.map(k => S.refl[k]).filter(r => r && ((r.mistakes || "").trim() || (r.improve || "").trim()));
  const nk = weekKeys(off + 1), next = sortTasks(S.tasks.filter(t => t.status !== "done" && (!t.due || t.due <= nk[6])));
  return { keys, a, b, completed, active, updates, totalMins, byCat, todosDone, routinePct: rs ? Math.round(rd / rs * 100) : null, days, learned, mistakes, next, reflN: keys.filter(k => S.refl[k]).length };
}
const shortDay = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); };
const longRange = (a, b) => `${shortDay(a).replace(/^\w+ /, "")} – ${shortDay(b).replace(/^\w+ /, "")} ${b.slice(0, 4)}`;
function reportSections(W){
  const cleanT = t => t.title.replace(/^\(Example\)\s*/i, "");
  return [
    ["Summary", [`${W.completed.length} task${W.completed.length === 1 ? "" : "s"} completed · ${W.updates} progress update${W.updates === 1 ? "" : "s"} · ${W.totalMins ? fmtMins(W.totalMins) + " tracked" : "no time tracked"} · ${W.todosDone} to-do${W.todosDone === 1 ? "" : "s"} done${W.routinePct !== null ? ` · routine kept ${W.routinePct}%` : ""} · ${W.reflN} reflection${W.reflN === 1 ? "" : "s"}`]],
    ["Completed this week", W.completed.map(t => `[${catName(t.category)}] ${cleanT(t)}${t.impact ? ` — ${t.impact}` : ""}${taskMins(t.id) ? ` (${fmtMins(taskMins(t.id))})` : ""}`)],
    ["In progress", W.active.map(t => `[${catName(t.category)}] ${cleanT(t)} — ${STATUS_LABEL[t.status]}, ${+t.progress || 0}%${t.due ? `, due ${fmtDate(t.due)}` : ""}${t.bottleneck ? `. Bottleneck: ${t.bottleneck}` : ""}`)],
    ["Daily log", W.days.map(d => { const parts = []; if (d.refl && (d.refl.did || "").trim()) parts.push(d.refl.did.trim()); d.upd.forEach(x => parts.push(`${cleanT(x.t)}: ${x.e.map(e => e.note).join("; ")}`)); return `${shortDay(d.k)}: ${parts.join(" | ") || "—"}`; })],
    ["Key learnings", W.learned.map(r => `${shortDay(r.date)}: ${r.learned.trim()}`)],
    ["Mistakes & improvements", W.mistakes.map(r => `${shortDay(r.date)}: ${[(r.mistakes || "").trim().replace(/([^.!?])$/, "$1."), (r.improve || "").trim() ? "Next time: " + r.improve.trim() : ""].filter(Boolean).join(" ")}`)],
    ["Time by area", Object.entries(W.byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${fmtMins(v)}`)],
    ["Plan for next week", W.next.slice(0, 8).map(t => `[${catName(t.category)}] ${cleanT(t)}${t.due ? ` — due ${fmtDate(t.due)}` : ""}`)]
  ];
}
function reportTitle(W){ return `Weekly Report: ${longRange(W.a, W.b)}`; }
function reportText(){
  const W = weekData(S.wkOff), L = [reportTitle(W)];
  if (S.name) L.push(S.name); if (S.org) L.push(S.org);
  for (const [h, items] of reportSections(W)) { L.push("", h.toUpperCase()); L.push(...(items.length ? items.map(x => "- " + x) : ["- None"])); }
  return L.join("\n");
}
function reportHTML(forFile){
  const W = weekData(S.wkOff);
  const body = reportSections(W).map(([h, items]) => `<h2>${esc(h)}</h2>${items.length ? `<ul>${items.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="none">None</p>`}`).join("");
  const head = `<h1>${esc(reportTitle(W))}</h1>${S.name || S.org ? `<p class="who">${esc([S.name, S.org].filter(Boolean).join(" · "))}</p>` : ""}`;
  if (!forFile) return head + body;
  return `<html><head><meta charset="utf-8"><title>${esc(reportTitle(W))}</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4;color:#111}h1{font-size:18pt;margin:0 0 4pt}h2{font-size:12pt;margin:14pt 0 4pt;color:#465c47;border-bottom:1px solid #ccd;padding-bottom:2pt}.who{color:#555;margin:0 0 8pt}ul{margin:0;padding-left:18pt}li{margin:2pt 0}.none{color:#888;margin:0}</style></head><body>${head}${body}</body></html>`;
}
function renderReport(){
  const W = weekData(S.wkOff);
  $("#wk-label").textContent = (S.wkOff === 0 ? "This week · " : S.wkOff === -1 ? "Last week · " : "") + longRange(W.a, W.b);
  $("#wk-next").disabled = S.wkOff >= 0;
  $("#wk-doc").innerHTML = reportHTML(false);
}
document.addEventListener("click", async e => {
  const w = e.target.closest("[data-wk]"); if (w) { S.wkOff += +w.dataset.wk; renderReport(); return; }
  if (e.target.closest("#wk-copy")) { const t = reportText(); try { await navigator.clipboard.writeText(t); toast("Weekly report copied"); } catch { toast("Couldn't copy. Use Download instead."); } return; }
  if (e.target.closest("#wk-word")) { const W = weekData(S.wkOff); const blob = new Blob(["﻿", reportHTML(true)], { type: "application/msword" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `Weekly-report-${W.a}.doc`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast("Word file downloaded"); return; }
  if (e.target.closest("#wk-print")) { document.body.classList.add("printing-report"); setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove("printing-report"), 500); }, 50); }
});

// ---------- search
function openSearch(){ const d = $("#sdlg"); if (!d.open) d.showModal(); $("#s-q").value = ""; runSearch(); setTimeout(() => $("#s-q").focus(), 30); }
function hl(text, q){ const t = esc(text); if (!q) return t; const words = q.split(/\s+/).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); return words.length ? t.replace(new RegExp("(" + words.map(w => esc(w)).join("|") + ")", "gi"), "<mark>$1</mark>") : t; }
function snippet(text, q){ const s = String(text || "").replace(/\s+/g, " "); const i = s.toLowerCase().indexOf(q.split(/\s+/)[0]); if (i < 0) return s.slice(0, 110); const a = Math.max(0, i - 40); return (a ? "…" : "") + s.slice(a, a + 120) + (a + 120 < s.length ? "…" : ""); }
function runSearch(){
  const q = $("#s-q").value.trim().toLowerCase(), out = $("#s-res");
  if (q.length < 2) { out.innerHTML = `<p class="small muted" style="padding:8px 4px;margin:0">Search tasks, notes, steps, to-dos, reflections, courses and routine. Type at least 2 letters.</p>`; return; }
  const words = q.split(/\s+/); const match = s => { const h = s.toLowerCase(); return words.every(w => h.includes(w)); };
  const R = [];
  for (const t of S.tasks) { const hay = [t.title, t.desc, t.notes, t.bottleneck, t.impact, catName(t.category), ...(t.subtasks || []).map(s => s.text), ...(t.links || []).map(l => l.label + " " + l.url), ...(t.log || []).map(l => l.note)].join(" \n "); if (match(hay)) R.push({ g: "Work tasks", title: t.title, sub: `${STATUS_LABEL[t.status]} · ${catName(t.category)}${t.due ? " · due " + fmtDate(t.due) : ""}`, snip: match(t.title) ? "" : snippet(hay.replace(t.title, ""), q), act: `data-sr-task="${esc(t.id)}"` }); }
  for (const t of S.todos) if (match(t.title)) R.push({ g: "To-dos", title: t.title, sub: (t.done ? "Done · " : "") + (t.date ? fmtDate(t.date) : ""), act: `data-sr-date="${esc(t.date || todayKey())}"` });
  for (const r of Object.values(S.refl)) { const hay = [r.did, r.learned, r.mistakes, r.improve].join(" \n "); if (match(hay)) R.push({ g: "Reflections", title: fmtDate(r.date) + " " + r.date.slice(0, 4), sub: "", snip: snippet(hay, q), act: `data-sr-refl="${esc(r.date)}"` }); }
  for (const c of S.courses) { const hay = [c.name, ...(c.modules || []).map(m => m.title)].join(" \n "); if (match(hay)) R.push({ g: "Courses", title: c.name, sub: `${(c.modules || []).filter(m => m.done).length}/${(c.modules || []).length} modules`, snip: match(c.name) ? "" : snippet(hay, q), act: `data-sr-view="study-courses"` }); }
  for (const hd of Object.values(S.health)) (hd.moods || []).forEach(m => { const hay = [m.note, ...(m.feel || []), ...(m.why || [])].join(" "); if (m.note && match(hay)) R.push({ g: "Mood notes", title: fmtDate(hd.date) + " · " + MOODS[m.m - 1][1], sub: (m.feel || []).join(", "), snip: snippet(m.note, q), act: `data-sr-view="health-mind"` }); });
  for (const c of S.conds) { const hay = [c.title, c.notes].join(" \n "); if (match(hay)) R.push({ g: "Health", title: c.title, sub: `${fmtDate(c.start)} · ${c.status === "resolved" ? "recovered" : "ongoing"}`, snip: match(c.title) ? "" : snippet(hay, q), act: `data-sr-view="health-log"` }); }
  for (const n of S.snotes) { const hay = [n.title, n.body, n.url, subjLabel(n.subj)].join(" \n "); if (match(hay)) R.push({ g: "Study notes", title: n.title, sub: `${subjLabel(n.subj)} · ${(NOTE_TAGS.find(t => t[0] === n.tag) || ["", "Note"])[1]}`, snip: match(n.title) ? "" : snippet(hay, q), act: `data-sr-view="study-notes"` }); }
  for (const a of S.asg) { const hay = [a.title, a.notes, a.learned, (a.skills || []).join(" "), subjLabel(a.subj), (subj(a.subj) || {}).name].join(" \n "); if (match(hay)) R.push({ g: "Assignments", title: a.title, sub: `${subjLabel(a.subj)} · ${dueText(a)[0]}`, snip: match(a.title) ? "" : snippet(hay, q), act: `data-sr-view="study-assignments"` }); }
  for (const sj of S.subjects) { const hay = [sj.code, sj.name, sj.lecturer].join(" "); if (match(hay)) R.push({ g: "Subjects", title: (sj.code ? sj.code + " · " : "") + sj.name, sub: sj.lecturer || "", act: `data-sr-view="study"` }); }
  for (const x of S.exp) { const hay = [x.note, expCat(x.cat)[1]].join(" "); if (match(hay)) R.push({ g: "Expenses", title: (x.note || expCat(x.cat)[1]) + " · " + money(x.amount), sub: fmtDate(x.date) + " · " + expCat(x.cat)[1], act: `data-sr-view="money"` }); }
  for (const i of S.shop) if (match(i.name)) R.push({ g: "Shopping list", title: i.name + (i.qty ? " × " + i.qty : ""), sub: i.done ? "In the basket" : "To buy", act: `data-sr-view="money-shopping"` });
  for (const r of S.routine) if (match(r.label)) R.push({ g: "Routine", title: r.label, sub: r.time + " · " + (daysLabel(r.days) || "Custom days"), act: `data-sr-view="routine"` });
  if (!R.length) { out.innerHTML = `<p class="small muted" style="padding:8px 4px;margin:0">Nothing found for “${esc(q)}”.</p>`; return; }
  const groups = [...new Set(R.map(r => r.g))];
  out.innerHTML = groups.map(g => `<div class="s-group">${esc(g)}</div>` + R.filter(r => r.g === g).slice(0, 20).map(r => `<button type="button" class="s-item" ${r.act}><span class="s-title">${hl(r.title, q)}</span>${r.sub ? `<span class="s-sub">${esc(r.sub)}</span>` : ""}${r.snip ? `<span class="s-snip">${hl(r.snip, q)}</span>` : ""}</button>`).join("")).join("");
}
$("#search-btn").addEventListener("click", openSearch);
$("#s-q").addEventListener("input", runSearch);
$("#s-close").addEventListener("click", () => $("#sdlg").close());
document.addEventListener("keydown", e => { if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.querySelector("dialog[open]")) { e.preventDefault(); openSearch(); } });
$("#s-res").addEventListener("click", e => {
  const b = e.target.closest(".s-item"); if (!b) return; $("#sdlg").close();
  if (b.dataset.srTask) openTask(b.dataset.srTask);
  else if (b.dataset.srDate) { S.calSel = b.dataset.srDate; const [y, m] = b.dataset.srDate.split("-").map(Number); S.calY = y; S.calM = m - 1; location.hash = "#calendar"; render(); }
  else if (b.dataset.srRefl) { rDate = b.dataset.srRefl; rDirty = false; location.hash = "#reflect"; render(); }
  else if (b.dataset.srView) location.hash = "#" + b.dataset.srView;
});

// ---------- schedule grid (bottom of Calendar): what you did, by time
try { S.schMode = localStorage.getItem("daybook-sch") || (innerWidth < 700 ? "day" : "week"); } catch { S.schMode = "week"; }
const minsOfISO = iso => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
function schKeys(){
  if (S.schMode === "day") return [S.calSel];
  const [y, m, d] = S.calSel.split("-").map(Number), dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  const out = []; for (let i = 0; i < 7; i++) { out.push(dkey(dt)); dt.setDate(dt.getDate() + 1); } return out;
}
function dayEvents(k){
  const ev = [], tk = todayKey();
  routineFor(k).forEach(r => ev.push({ kind: "rt", st: itemState(r, k), start: toMin(r.time), dur: 20, title: r.label, r }));
  S.time.filter(x => x.date === k).forEach(x => {
    const task = x.type === "task" ? S.tasks.find(y => y.id === x.ref) : null;
    ev.push({ kind: "time", start: minsOfISO(x.start), dur: Math.max(+x.mins || 1, 1), title: x.label || (x.type === "course" ? "Study" : "Focus"), mins: +x.mins || 0,
      cls: x.type === "task" ? "cat-" + catIdx(task ? task.category : "") : x.type === "course" ? "ev-course" : "ev-focus", ref: task ? task.id : null, via: x.via, type: x.type });
  });
  if (S.timer && isoDay(S.timer.start) === k && k === tk) {
    const T = S.timer, task = T.type === "task" ? S.tasks.find(y => y.id === T.ref) : null;
    ev.push({ kind: "time", live: true, start: minsOfISO(T.start), dur: Math.max(1, timerElapsed() / 60), title: T.label, mins: Math.round(timerElapsed() / 60), cls: T.type === "task" ? "cat-" + catIdx(task ? task.category : "") : T.type === "course" ? "ev-course" : "ev-focus", ref: task ? task.id : null, via: T.mode });
  }
  S.tasks.filter(t => t.status === "done" && isoDay(t.doneAt) === k).forEach(t => ev.push({ kind: "tdone", start: minsOfISO(t.doneAt), dur: 20, title: t.title, cls: "cat-" + catIdx(t.category), ref: t.id }));
  S.todos.filter(t => t.done && isoDay(t.doneAt) === k).forEach(t => ev.push({ kind: "odone", start: minsOfISO(t.doneAt), dur: 20, title: t.title }));
  const rf = S.refl[k]; if (rf && rf.updatedAt && isoDay(rf.updatedAt) === k) ev.push({ kind: "refl", start: minsOfISO(rf.updatedAt), dur: 20, title: "Reflection", date: k });
  return ev;
}
function layoutEvents(ev, lo, ppm){
  const items = ev.map(e => { const top = (e.start - lo) * ppm, h = Math.max(e.dur * ppm, 22); return { ...e, top, h, bot: top + h }; }).sort((a, b) => a.top - b.top || b.h - a.h);
  let cluster = [], clusterEnd = -1;
  const flush = () => { const lanes = []; cluster.forEach(it => { let i = lanes.findIndex(end => end <= it.top + 0.5); if (i < 0) { i = lanes.length; lanes.push(0); } lanes[i] = it.bot; it.lane = i; }); cluster.forEach(it => it.lanes = lanes.length); cluster = []; };
  for (const it of items) { if (cluster.length && it.top >= clusterEnd) { flush(); clusterEnd = -1; } cluster.push(it); clusterEnd = Math.max(clusterEnd, it.bot); }
  if (cluster.length) flush();
  return items;
}
const hm = m => pad(Math.floor(m / 60) % 24) + ":" + pad(Math.round(m % 60));
function evHtml(e, k){
  const style = `top:${e.top.toFixed(1)}px;height:${e.h.toFixed(1)}px;left:calc(${(e.lane / e.lanes * 100).toFixed(2)}% + 2px);width:calc(${(100 / e.lanes).toFixed(2)}% - 4px)`;
  const tall = e.h >= 40;
  if (e.kind === "rt") return `<button type="button" class="ev ev-rt s-${e.st}" style="${style}" data-cdate="${esc(k)}" title="${esc(e.r.time)} ${esc(e.title)} · ${STATE_TXT[e.st]}">${routineIcon(e.r)}<span class="ev-t">${esc(e.title)}</span></button>`;
  if (e.kind === "time") return `<div class="ev ev-time ${e.cls} ${e.live ? "live" : ""}" style="${style}" ${e.ref ? `data-task="${esc(e.ref)}"` : ""} title="${esc(e.title)} · ${fmtMins(e.mins)} (${hm(e.start)}–${hm(e.start + e.dur)})"><span class="ev-t">${SVG(ICON.timer)}${esc(e.title)}</span>${tall ? `<span class="ev-s">${e.live ? "Running · " : ""}${fmtMins(e.mins)} · ${hm(e.start)}–${hm(e.start + e.dur)}${e.via === "focus" ? " · focus" : ""}</span>` : ""}</div>`;
  if (e.kind === "class") return `<div class="ev ev-class ${subjCls(e.c.subj)}" style="${style}" title="${esc((subj(e.c.subj) || {}).name || e.title)} · ${fmt12(e.c.start)}–${fmt12(e.c.end)}${clsLoc(e.c) ? " · " + esc(clsLoc(e.c)) : ""}"><span class="ev-t">${SVG(ICON.class)}${esc(e.title)}</span>${tall ? `<span class="ev-s">${esc((CLS_TYPES.find(x => x[0] === e.c.type) || ["", ""])[1])}${clsLoc(e.c) ? " · " + esc(clsLoc(e.c)) : ""}</span>` : ""}</div>`;
  if (e.kind === "tdone") return `<div class="ev ev-done ${e.cls}" style="${style}" data-task="${esc(e.ref)}" title="Finished at ${hm(e.start)}: ${esc(e.title)}"><span class="ev-t">${SVG(ICON.star)}${esc(e.title)}</span></div>`;
  if (e.kind === "odone") return `<div class="ev ev-todo" style="${style}" title="To-do done at ${hm(e.start)}: ${esc(e.title)}"><span class="ev-t">✓ ${esc(e.title)}</span></div>`;
  if (e.kind === "refl") return `<button type="button" class="ev ev-refl" style="${style}" data-calrefl="${esc(e.date)}" title="Reflection written at ${hm(e.start)}"><span class="ev-t">${SVG(ICON.note)}Reflection</span></button>`;
  return "";
}
function renderSchedule(){
  const box = $("#sched"); if (!box) return;
  const keys = schKeys(), tk = todayKey(), day = S.schMode === "day";
  const evs = keys.map(k => dayEvents(k));
  const flat = evs.flat();
  let lo = Math.min(6 * 60, ...flat.map(e => e.start)), hi = Math.max(23 * 60, ...flat.map(e => e.start + e.dur));
  lo = Math.floor(lo / 60) * 60; hi = Math.min(24 * 60, Math.ceil(hi / 60) * 60);
  const ppm = day ? 1.1 : 0.85, H = (hi - lo) * ppm;
  const label = day ? `${DAYS[keyDow(keys[0])]}, ${fmtDate(keys[0]).split(", ")[1]} ${keys[0].slice(0, 4)}` : longRange(keys[0], keys[6]);
  const hours = []; for (let m = lo; m < hi; m += 60) hours.push(`<span style="top:${((m - lo) * ppm).toFixed(1)}px">${m === lo ? "" : pad(Math.floor(m / 60)) + ":00"}</span>`);
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const dues = k => S.tasks.filter(t => t.due === k && t.status !== "done");
  const adues = k => [];
  const anyDue = keys.some(k => dues(k).length || adues(k).length);
  const totals = k => { const m = S.time.filter(x => x.date === k).reduce((a, x) => a + (+x.mins || 0), 0); const its = routineFor(k).filter(r => !(dayDoc(k).skip || {})[r.id]); const dn = its.filter(r => (dayDoc(k).done || {})[r.id]).length; return { m, dn, n: its.length }; };
  box.innerHTML = `
  <div class="sch-head">
    <div class="sch-title"><h2>Schedule</h2><span class="muted small">${esc(label)}</span></div>
    <div class="sch-ctrl"><button class="btn sm" type="button" data-schnav="-1" aria-label="Previous">‹</button><button class="btn sm ghost" type="button" data-schtoday>Today</button><button class="btn sm" type="button" data-schnav="1" aria-label="Next">›</button>
      <div class="seg"><button type="button" data-sch="day" aria-pressed="${day}">Day</button><button type="button" data-sch="week" aria-pressed="${!day}">Week</button></div></div>
  </div>
  <div class="sch-scroll" id="sch-scroll">
    <div class="sch-grid" style="--cols:${keys.length}">
      <div class="sch-hd sch-corner"></div>
      ${keys.map(k => { const t = totals(k); return `<button type="button" class="sch-hd ${k === tk ? "is-today" : ""} ${k === S.calSel && !day ? "is-sel" : ""}" data-cdate="${esc(k)}"><span class="sch-dow">${DAYS[keyDow(k)]}</span><span class="sch-num">${+k.slice(8)}</span><span class="sch-sum">${k <= tk && k >= startKey() ? `${t.dn}/${t.n}${t.m ? " · " + fmtMins(t.m) : ""}` : "&nbsp;"}</span></button>`; }).join("")}
      ${anyDue ? `<div class="sch-ad-lbl">Due</div>${keys.map(k => `<div class="sch-ad">${dues(k).map(t => `<div class="ev-due cat-${catIdx(t.category)}" data-task="${esc(t.id)}" title="Due: ${esc(t.title)}">${esc(t.title)}</div>`).join("")}${adues(k).map(a => `<a class="ev-due ${subjCls(a.subj)}" href="#study-assignments" title="Due${a.time ? " " + fmt12(a.time) : ""}: ${esc(subjLabel(a.subj))} ${esc(a.title)}">${esc(subjLabel(a.subj))}: ${esc(a.title)}</a>`).join("")}</div>`).join("")}` : ""}
      <div class="sch-times" style="height:${H}px">${hours.join("")}</div>
      ${keys.map((k, i) => `<div class="sch-col ${k === tk ? "is-today" : ""} ${isWeekend(keyDow(k)) ? "is-we" : ""}" style="height:${H}px;--hr:${60 * ppm}px">
        ${layoutEvents(evs[i], lo, ppm).map(e => evHtml(e, k)).join("")}
        ${k === tk && nowM >= lo && nowM <= hi ? `<b class="sch-now" style="top:${((nowM - lo) * ppm).toFixed(1)}px"></b>` : ""}</div>`).join("")}
    </div>
  </div>
  <div class="tl-legend sch-legend"><span><i class="lg lg-rt s-done"></i>Routine done</span><span><i class="lg lg-rt s-late"></i>Not ticked / missed</span><span><i class="lg lg-rt s-todo"></i>Upcoming</span><span><i class="lg lg-time"></i>Time worked</span><span><i class="lg lg-done"></i>Task finished</span><span><i class="lg lg-refl"></i>Reflection</span></div>`;
  if (!renderSchedule._scrolled) { renderSchedule._scrolled = true; const sc = $("#sch-scroll"); const target = keys.includes(tk) ? Math.max(0, (nowM - lo) * ppm - 160) : (7 * 60 - lo) * ppm; sc.scrollTop = target; }
}
document.addEventListener("click", e => {
  const m = e.target.closest("[data-sch]"); if (m) { S.schMode = m.dataset.sch; try { localStorage.setItem("daybook-sch", S.schMode); } catch {} renderSchedule._scrolled = false; renderSchedule(); return; }
  const n = e.target.closest("[data-schnav]"); if (n) { const [y, mo, d] = S.calSel.split("-").map(Number); const dt = new Date(y, mo - 1, d); dt.setDate(dt.getDate() + (+n.dataset.schnav) * (S.schMode === "day" ? 1 : 7)); S.calSel = dkey(dt); S.calY = dt.getFullYear(); S.calM = dt.getMonth(); renderCalendar(); return; }
  if (e.target.closest("[data-schtoday]")) { const d = new Date(); S.calSel = todayKey(); S.calY = d.getFullYear(); S.calM = d.getMonth(); renderSchedule._scrolled = false; renderCalendar(); return; }
});

// ---------- reflection archive (month folders → weeks → days) and export
S.arcMonth = null;
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const hasRefl = r => r && [r.did, r.learned, r.mistakes, r.improve].some(x => (x || "").trim());
const mondayOf = k => { const [y, m, d] = k.split("-").map(Number); const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); return dkey(dt); };
const addDays = (k, n) => { const [y, m, d] = k.split("-").map(Number); const dt = new Date(y, m - 1, d + n); return dkey(dt); };
function reflList(){ return Object.values(S.refl).filter(hasRefl).sort((a, b) => b.date.localeCompare(a.date)); }
function renderArchive(){
  const box = $("#arc"); if (!box) return;
  const all = reflList();
  if (!all.length) { box.innerHTML = `<p class="empty" style="margin:0">Your reflections will be filed here by month and week once you save your first one.</p>`; return; }
  if (!S.arcMonth) {
    const byMonth = {};
    all.forEach(r => (byMonth[r.date.slice(0, 7)] = byMonth[r.date.slice(0, 7)] || []).push(r));
    const years = [...new Set(Object.keys(byMonth).map(k => k.slice(0, 4)))].sort().reverse();
    box.innerHTML = `<div class="arc-crumbs"><b>All reflections</b><span class="muted small">${all.length} saved</span></div>` + years.map(y => `
      <div class="arc-year">${y}</div>
      <div class="arc-folders">${Object.keys(byMonth).filter(k => k.startsWith(y)).sort().reverse().map(k => { const rs = byMonth[k], moods = rs.filter(r => r.mood).map(r => r.mood);
        return `<button type="button" class="folder" data-arcm="${k}"><span class="fd-ic">${SVG(ICON.folder)}</span><span class="fd-name">${MONTHS[+k.slice(5) - 1]}</span><span class="fd-meta">${rs.length} reflection${rs.length > 1 ? "s" : ""}${moods.length ? ` · energy ${(moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1)}` : ""}</span></button>`; }).join("")}</div>`).join("");
    return;
  }
  const mk = S.arcMonth, rs = all.filter(r => r.date.startsWith(mk));
  const weeks = {}; rs.forEach(r => (weeks[mondayOf(r.date)] = weeks[mondayOf(r.date)] || []).push(r));
  const wkeys = Object.keys(weeks).sort().reverse();
  box.innerHTML = `<div class="arc-crumbs"><button type="button" class="crumb" data-arcm="">All reflections</button><span class="muted">›</span><b>${MONTHS[+mk.slice(5) - 1]} ${mk.slice(0, 4)}</b>
      <button type="button" class="btn sm" data-xopen="month:${mk}" style="margin-left:auto">${SVG(ICON.download)}Export month</button></div>
    ${!rs.length ? `<p class="empty" style="margin:0">No reflections this month.</p>` : wkeys.map(w => `<details class="arc-week" open>
      <summary><span class="aw-ic">${SVG(ICON.folder)}</span><span class="aw-name">Week of ${esc(shortDay(w).replace(/^\w+ /, ""))}</span><span class="muted small">${shortDay(w).replace(/^\w+ /, "")} – ${shortDay(addDays(w, 6)).replace(/^\w+ /, "")} · ${weeks[w].length} day${weeks[w].length > 1 ? "s" : ""}</span>
        <button type="button" class="btn sm ghost" data-xopen="week:${w}">${SVG(ICON.download)}Export</button></summary>
      <ul class="arc-days">${weeks[w].sort((a, b) => a.date.localeCompare(b.date)).map(r => `<li><button type="button" class="arc-day ${r.date === rDate ? "is-open" : ""}" data-rdate="${esc(r.date)}">
        <span class="ad-date"><b>${esc(shortDay(r.date).split(" ")[0])}</b><span>${+r.date.slice(8)}</span></span>
        <span class="ad-body"><span class="ad-snip">${esc((r.learned || r.did || r.mistakes || "").slice(0, 120))}</span><span class="ad-tags">${r.did ? "<i>Did</i>" : ""}${r.learned ? "<i>Learned</i>" : ""}${r.mistakes ? "<i>Mistakes</i>" : ""}${r.improve ? "<i>Improve</i>" : ""}</span></span>
        ${r.mood ? `<span class="ad-mood" title="Energy">${r.mood}/5</span>` : ""}</button></li>`).join("")}</ul></details>`).join("")}`;
}
document.addEventListener("click", e => {
  const m = e.target.closest("[data-arcm]"); if (m) { S.arcMonth = m.dataset.arcm || null; renderArchive(); return; }
});

// ----- export dialog
function exportRange(kind, val){
  const tk = todayKey();
  if (kind === "day") return [val || rDate, val || rDate];
  if (kind === "week") { const a = mondayOf(val || rDate); return [a, addDays(a, 6)]; }
  if (kind === "month") { const mk = (val || tk).slice(0, 7); const [y, m] = mk.split("-").map(Number); return [mk + "-01", dkey(new Date(y, m, 0))]; }
  if (kind === "all") { const ks = reflList().map(r => r.date).sort(); return [ks[0] || tk, ks[ks.length - 1] || tk]; }
  return [val || tk, val || tk];
}
function openExport(preset){
  const [kind, val] = (preset || "week:").split(":");
  const [a, b] = exportRange(kind, val);
  $("#x-kind").value = kind; $("#x-from").value = a; $("#x-to").value = b;
  if (!$("#xdlg").open) $("#xdlg").showModal(); updateExportCount();
}
function updateExportCount(){
  const a = $("#x-from").value, b = $("#x-to").value;
  const n = reflList().filter(r => r.date >= a && r.date <= b).length;
  $("#x-count").textContent = a && b ? `${n} reflection${n === 1 ? "" : "s"} between ${fmtDate(a)} and ${fmtDate(b)}${$("#x-layout").value === "logbook" ? " · plus work activity for each day" : ""}` : "";
}
function exportDays(a, b, layout){
  const days = []; for (let k = a; k <= b; k = addDays(k, 1)) days.push(k);
  return days.map(k => {
    const r = S.refl[k];
    const upd = S.tasks.map(t => ({ t, e: (t.log || []).filter(l => isoDay(l.at) === k && !/^Task added/.test(l.note)) })).filter(x => x.e.length);
    const fin = S.tasks.filter(t => t.status === "done" && isoDay(t.doneAt) === k);
    const mins = S.time.filter(x => x.date === k).reduce((s, x) => s + (+x.mins || 0), 0);
    const ok = layout === "logbook" ? (hasRefl(r) || upd.length || fin.length || mins) : hasRefl(r);
    return ok ? { k, r, upd, fin, mins } : null;
  }).filter(Boolean);
}
function exportHTML(a, b, layout){
  const D = exportDays(a, b, layout);
  const title = layout === "logbook" ? "Internship Logbook" : "Reflection Journal";
  const range = a === b ? shortDay(a) + " " + a.slice(0, 4) : `${shortDay(a)} ${a.slice(0, 4)} – ${shortDay(b)} ${b.slice(0, 4)}`;
  const block = (lbl, txt) => (txt || "").trim() ? `<p class="xf"><b>${lbl}:</b> ${esc(txt.trim()).replace(/\n/g, "<br>")}</p>` : "";
  const totalMins = D.reduce((s, d) => s + d.mins, 0);
  const head = `<h1>${title}</h1><p class="who">${esc([S.name, S.org].filter(Boolean).join(" · "))}${S.name || S.org ? "<br>" : ""}${esc(range)} · ${D.length} day${D.length === 1 ? "" : "s"}${layout === "logbook" && totalMins ? ` · ${fmtMins(totalMins)} tracked` : ""}</p>`;
  let body = "", lastWeek = "";
  for (const d of D) {
    const w = mondayOf(d.k);
    if (w !== lastWeek && D.length > 3) { body += `<h2 class="xw">Week of ${esc(shortDay(w).replace(/^\w+ /, ""))}</h2>`; lastWeek = w; }
    body += `<div class="xd"><h3>${esc(new Date(d.k + "T00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}${d.r && d.r.mood ? ` <span class="xm">Energy ${d.r.mood}/5</span>` : ""}</h3>`;
    if (layout === "logbook") {
      if (d.upd.length || d.fin.length) body += `<p class="xf"><b>Work:</b></p><ul>${[...d.fin.map(t => `<li>Completed: [${esc(catName(t.category))}] ${esc(t.title)}${t.impact ? ` — ${esc(t.impact)}` : ""}</li>`), ...d.upd.filter(x => !d.fin.includes(x.t)).map(x => `<li>[${esc(catName(x.t.category))}] ${esc(x.t.title)}: ${esc(x.e.map(e => e.note).join("; "))}</li>`)].join("")}</ul>`;
      if (d.mins) body += `<p class="xf"><b>Time tracked:</b> ${fmtMins(d.mins)}</p>`;
    }
    if (d.r) body += block("What I did", d.r.did) + block("What I learned", d.r.learned) + block("Mistakes", d.r.mistakes) + block("How I'll improve", d.r.improve);
    body += `</div>`;
  }
  if (!D.length) body = `<p class="none">Nothing recorded in this range.</p>`;
  return { title: `${title} ${a}${a === b ? "" : " to " + b}`, html: head + body };
}
const EXPORT_CSS = `body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45;color:#1e2a1f}h1{font-size:20pt;margin:0 0 2pt;color:#465c47}.who{color:#555;margin:0 0 10pt}h2.xw{font-size:12pt;color:#465c47;border-bottom:1.5px solid #facbc6;padding-bottom:2pt;margin:16pt 0 6pt}h3{font-size:11.5pt;margin:10pt 0 3pt}.xm{font-weight:normal;color:#8c4a43;font-size:9.5pt}.xf{margin:2pt 0}ul{margin:2pt 0 4pt;padding-left:16pt}li{margin:1pt 0}.none{color:#888}.xd{page-break-inside:avoid}`;
$("#x-kind").addEventListener("change", () => { const k = $("#x-kind").value; if (k !== "custom") { const [a, b] = exportRange(k, $("#x-from").value || rDate); $("#x-from").value = a; $("#x-to").value = b; } updateExportCount(); });
["#x-from", "#x-to", "#x-layout"].forEach(s => $(s).addEventListener("change", () => { if (s !== "#x-layout") $("#x-kind").value = "custom"; updateExportCount(); }));
$("#x-cancel").addEventListener("click", () => $("#xdlg").close());
$("#x-word").addEventListener("click", () => {
  let a = $("#x-from").value, b = $("#x-to").value; if (!a || !b) return; if (a > b) [a, b] = [b, a];
  const X = exportHTML(a, b, $("#x-layout").value);
  const doc = `<html><head><meta charset="utf-8"><title>${esc(X.title)}</title><style>${EXPORT_CSS}</style></head><body>${X.html}</body></html>`;
  const url = URL.createObjectURL(new Blob(["﻿", doc], { type: "application/msword" }));
  const el = document.createElement("a"); el.href = url; el.download = X.title.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-") + ".doc"; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  $("#xdlg").close(); toast("Word file downloaded");
});
$("#x-pdf").addEventListener("click", () => {
  let a = $("#x-from").value, b = $("#x-to").value; if (!a || !b) return; if (a > b) [a, b] = [b, a];
  const X = exportHTML(a, b, $("#x-layout").value);
  $("#print-area").innerHTML = `<style>${EXPORT_CSS.replace(/body\{/, "#print-area{")}</style>${X.html}`;
  $("#xdlg").close();
  document.body.classList.add("printing-export"); const t0 = document.title; document.title = X.title;
  setTimeout(() => { window.print(); setTimeout(() => { document.body.classList.remove("printing-export"); document.title = t0; }, 600); }, 80);
});
document.addEventListener("click", e => { const x = e.target.closest("[data-xopen]"); if (x) { e.preventDefault(); e.stopPropagation(); openExport(x.dataset.xopen); } }, true);

// ---------- Health: water, meals, bowel, body, conditions, cycle
S.health = {}; S.body = []; S.conds = []; S.hDay = null; S.waterGoal = 8; S.showCycle = true; S.condForm = false; S.condDel = null;
const hk = () => S.hDay || todayKey();
const hDoc = k => ({ date: k, water: 0, meals: [], bowel: [], flow: "", sym: [], moods: [], ...(S.health[k] || {}) });
function saveHealth(k, d){ S.health[k] = d; if (db) write("health/" + k, () => db.doc("health/" + k).set(d)); renderHealth(); }
const hid = () => "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const nowHMs = () => pad(new Date().getHours()) + ":" + pad(new Date().getMinutes());
const MEAL_SRC = [["home","Cooked myself","🍳"],["out","Restaurant","🍽️"],["delivery","Food delivery","🛵"]];
const mealSrcCounts = keys => { const c = { home: 0, out: 0, delivery: 0 }; keys.forEach(k => (hDoc(k).meals || []).forEach(m => { if (c[m.src] != null) c[m.src]++; })); return c; };
const mealSrcLine = c => MEAL_SRC.map(([v, l, i]) => `${i} ${c[v]} ${l.toLowerCase()}`).join(" · ");
const MEALS = [["breakfast","Breakfast"],["lunch","Lunch"],["dinner","Dinner"],["snack","Snack"],["drink","Drink"]];
const BOWEL = [["hard","Hard / constipated"],["normal","Normal"],["soft","Soft"],["watery","Watery / diarrhoea"]];
const FLOW = [["","None"],["spotting","Spotting"],["light","Light"],["medium","Medium"],["heavy","Heavy"]];
const SYMS = ["Cramps","Headache","Bloating","Back pain","Tender breasts","Acne","Fatigue","Mood swings","Cravings","Nausea"];
const COND_KIND = [["symptom","Symptom"],["illness","Illness"],["injury","Injury"],["medication","Medication"],["doctor","Doctor visit"]];
const SEV = [["mild","Mild"],["moderate","Moderate"],["severe","Severe"]];
S.mealType = "breakfast"; S.mealSrc = "home"; S.bowelType = "normal"; S.condKind = "symptom"; S.condSev = "mild";
function guessMeal(){ const h = new Date().getHours(); return h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 17 ? "snack" : h < 22 ? "dinner" : "snack"; }
// --- cycle maths (from days marked with flow)
function cycleInfo(){
  const days = Object.values(S.health).filter(d => d.flow && d.flow !== "spotting").map(d => d.date).sort();
  const set = new Set(days), starts = days.filter(k => !set.has(addDays(k, -1)));
  const runs = starts.map(s => { let n = 0, k = s; while (set.has(k)) { n++; k = addDays(k, 1); } return n; });
  const diff = (a, b) => Math.round((new Date(b + "T00:00") - new Date(a + "T00:00")) / 864e5);
  const lens = starts.slice(1).map((s, i) => diff(starts[i], s)).filter(n => n >= 15 && n <= 60).slice(-6);
  const avg = lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : 28;
  const pavg = runs.length ? Math.round(runs.slice(-6).reduce((a, b) => a + b, 0) / Math.min(6, runs.length)) : 5;
  const tk = todayKey(), last = starts[starts.length - 1];
  if (!last) return { starts, avg, pavg, lens, none: true };
  let next = addDays(last, avg); while (next < tk && diff(next, tk) > 7) next = addDays(next, avg);
  const day = diff(last, tk) + 1, ov = addDays(next, -14);
  return { starts, runs, avg, pavg, lens, last, next, day, until: diff(tk, next), fertA: addDays(ov, -5), fertB: addDays(ov, 1), ov, set };
}
function sparkline(vals){
  if (vals.length < 2) return "";
  const W = 260, H = 54, lo = Math.min(...vals), hi = Math.max(...vals), r = hi - lo || 1;
  const pts = vals.map((v, i) => [i / (vals.length - 1) * (W - 8) + 4, H - 6 - (v - lo) / r * (H - 14)]);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="M${pts.map(p => p.map(n => n.toFixed(1)).join(",")).join("L")}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><path d="M${pts[0][0]},${H}L${pts.map(p => p.map(n => n.toFixed(1)).join(",")).join("L")}L${pts[pts.length - 1][0]},${H}Z" fill="color-mix(in srgb,var(--accent) 12%,transparent)"/><circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="3.5" fill="var(--accent)"/></svg>`;
}
function bmiInfo(h, w){ if (!h || !w) return null; const b = w / Math.pow(h / 100, 2); return { b: b.toFixed(1), cat: b < 18.5 ? "Underweight" : b < 25 ? "Healthy range" : b < 30 ? "Overweight" : "Obese" }; }
function renderHealth(){
  if (!$("#v-health") || S.view !== "health") return;
  const k = hk(), tk = todayKey(), d = hDoc(k), isT = k === tk;
  // day pager
  $("#h-day").innerHTML = `<button class="btn sm" type="button" data-hday="-1" aria-label="Previous day">‹</button><span class="mid">${isT ? "Today" : esc(DAYS[keyDow(k)])}<small>${esc(fmtDate(k))}</small></span><button class="btn sm" type="button" data-hday="1" ${isT ? "disabled" : ""} aria-label="Next day">›</button>`;
  renderMood(); renderSleepCard();
  // water
  const goal = S.waterGoal || 8, cups = d.water || 0;
  const wk = rangeKeys(7).map(x => hDoc(x).water || 0), avgW = (wk.reduce((a, b) => a + b, 0) / 7).toFixed(1);
  $("#h-water").innerHTML = `<div class="hw-top"><div><b class="hw-n">${cups}</b><span class="muted"> / ${goal} cups</span><div class="small muted">${Math.round(cups * 250)} ml · 7-day average ${avgW} cups</div></div>
      <div class="hw-btns"><button class="btn sm" type="button" data-water="-1" aria-label="Remove a cup" ${cups ? "" : "disabled"}>−</button><button class="btn sm primary" type="button" data-water="1">+ 1 cup</button></div></div>
    <div class="cups">${Array.from({ length: Math.max(goal, cups) }, (_, i) => `<button type="button" class="cup ${i < cups ? "on" : ""}" data-cup="${i + 1}" aria-label="${i + 1} cups">${SVG(ICON.water)}</button>`).join("")}</div>
    <label class="small muted hw-goal">Daily goal <select id="h-goal">${[6,7,8,9,10,12].map(n => `<option value="${n}" ${n === goal ? "selected" : ""}>${n} cups</option>`).join("")}</select></label>`;
  // meals
  const meals = (d.meals || []).slice().sort((a, b) => a.time.localeCompare(b.time));
  $("#h-meals").innerHTML = `${meals.length ? `<ul class="hlist">${meals.map(m => `<li><span class="hl-t">${esc(m.time)}</span><span class="hl-tag m-${esc(m.type)}">${esc((MEALS.find(x => x[0] === m.type) || ["", m.type])[1])}</span><span class="hl-b">${esc(m.text)}</span><span class="hl-act"><button type="button" class="m-src" data-msrc="${esc(m.id)}" title="${esc((MEAL_SRC.find(x => x[0] === m.src) || ["", "Where from? Tap to set"])[1])}: tap to change">${(MEAL_SRC.find(x => x[0] === m.src) || ["", "", "＋"])[2]}</button><button type="button" class="x" data-hdel="meals:${esc(m.id)}" aria-label="Remove">✕</button></span></li>`).join("")}</ul>` : `<p class="small muted" style="margin:0">Nothing logged${isT ? " yet today" : ""}.</p>`}
    <div class="qa-chips cwrap">${MEALS.map(([v, l]) => `<button type="button" class="qc" data-meal="${v}" aria-pressed="${S.mealType === v}">${l}</button>`).join("")}</div>
    <div class="qa-chips cwrap m-srcs">${MEAL_SRC.map(([v, l, i]) => `<button type="button" class="qc" data-mealsrc="${v}" aria-pressed="${S.mealSrc === v}">${i} ${l}</button>`).join("")}</div>
    <form class="qrow" id="h-meal-form" autocomplete="off"><input id="h-meal" class="inp" placeholder="What did you eat? e.g. Nasi lemak, teh o"><input type="time" id="h-meal-t" class="inp" value="${isT ? nowHMs() : "12:00"}" style="max-width:110px"><button class="btn sm" type="submit">Add</button></form>
    <p class="small muted" style="margin:0">Last 7 days: ${mealSrcLine(mealSrcCounts(rangeKeys(7)))}</p>`;
  // bowel
  const bw = (d.bowel || []).slice().sort((a, b) => a.time.localeCompare(b.time));
  const wkB = rangeKeys(7).reduce((a, x) => a + (hDoc(x).bowel || []).length, 0);
  $("#h-bowel").innerHTML = `${bw.length ? `<ul class="hlist">${bw.map(b => `<li><span class="hl-t">${esc(b.time)}</span><span class="hl-tag b-${esc(b.type)}">${esc((BOWEL.find(x => x[0] === b.type) || ["", b.type])[1])}</span><span class="hl-b">${esc(b.note || "")}</span><button type="button" class="x" data-hdel="bowel:${esc(b.id)}" aria-label="Remove">✕</button></li>`).join("")}</ul>` : `<p class="small muted" style="margin:0">No entries${isT ? " today" : ""}.</p>`}
    <div class="qa-chips cwrap">${BOWEL.map(([v, l]) => `<button type="button" class="qc" data-bowel="${v}" aria-pressed="${S.bowelType === v}">${l}</button>`).join("")}</div>
    <form class="qrow" id="h-bowel-form" autocomplete="off"><input id="h-bowel-note" class="inp" placeholder="Note (optional), e.g. stomach ache, after spicy food"><button class="btn sm primary" type="submit">Log</button></form>
    <p class="small muted" style="margin:0">Last 7 days: <b>${wkB}</b> time${wkB === 1 ? "" : "s"}</p>`;
  // body
  const recs = S.body.slice().sort((a, b) => a.date.localeCompare(b.date)), lastH = [...recs].reverse().find(r => r.height), lastW = [...recs].reverse().find(r => r.weight);
  const bi = bmiInfo(lastH && +lastH.height, lastW && +lastW.weight), ws = recs.filter(r => r.weight).slice(-20).map(r => +r.weight);
  const prevW = recs.filter(r => r.weight).slice(-2)[0];
  $("#h-body").innerHTML = `<div class="hb-stats">
      <div><span class="small muted">Height</span><b>${lastH ? esc(lastH.height) + " cm" : "–"}</b></div>
      <div><span class="small muted">Weight</span><b>${lastW ? esc(lastW.weight) + " kg" : "–"}</b>${lastW && prevW && prevW !== lastW ? `<span class="small ${+lastW.weight > +prevW.weight ? "up" : "down"}">${+lastW.weight > +prevW.weight ? "▲" : "▼"} ${Math.abs(lastW.weight - prevW.weight).toFixed(1)}</span>` : ""}</div>
      <div><span class="small muted">BMI</span><b>${bi ? bi.b : "–"}</b>${bi ? `<span class="small muted">${bi.cat}</span>` : ""}</div></div>
    ${sparkline(ws)}
    <form class="hb-form" id="h-body-form" autocomplete="off"><label class="f">Date<input type="date" id="hb-date" value="${tk}"></label><label class="f">Height (cm)<input type="number" step="0.1" min="50" max="250" id="hb-h" placeholder="${lastH ? esc(lastH.height) : "160"}" inputmode="decimal"></label><label class="f">Weight (kg)<input type="number" step="0.1" min="20" max="300" id="hb-w" placeholder="${lastW ? esc(lastW.weight) : "55"}" inputmode="decimal"></label><button class="btn sm primary" type="submit">Save</button></form>
    ${recs.length ? `<details class="hb-hist"><summary class="small">All records (${recs.length})</summary><ul class="hlist">${recs.slice().reverse().map(r => `<li><span class="hl-t">${esc(fmtDate(r.date))}</span><span class="hl-b">${r.height ? esc(r.height) + " cm" : ""}${r.height && r.weight ? " · " : ""}${r.weight ? esc(r.weight) + " kg" : ""}</span><button type="button" class="x" data-bdel="${esc(r.id)}" aria-label="Remove">✕</button></li>`).join("")}</ul></details>` : ""}
    <p class="small muted" style="margin:0">BMI is a rough guide only, not a diagnosis.</p>`;
  // conditions
  const ongoing = S.conds.filter(c => c.status !== "resolved").sort((a, b) => b.start.localeCompare(a.start)), past = S.conds.filter(c => c.status === "resolved").sort((a, b) => b.start.localeCompare(a.start));
  const condRow = c => `<li class="cond sev-${esc(c.severity)}"><div class="cd-top"><b>${esc(c.title)}</b><span class="hl-tag">${esc((COND_KIND.find(x => x[0] === c.kind) || ["", c.kind])[1])}</span><span class="sev">${esc((SEV.find(x => x[0] === c.severity) || ["", ""])[1])}</span></div>
      <div class="small muted">${esc(fmtDate(c.start))}${c.status === "resolved" && c.end ? ` → ${esc(fmtDate(c.end))}` : " · ongoing"}</div>${c.notes ? `<div class="small">${esc(c.notes)}</div>` : ""}
      <div class="cd-act">${c.status !== "resolved" ? `<button type="button" class="btn sm" data-cres="${esc(c.id)}">Mark recovered</button>` : ""}<button type="button" class="btn sm ghost danger" data-cdelx="${esc(c.id)}">${S.condDel === c.id ? "Tap again to delete" : "Delete"}</button></div></li>`;
  $("#h-cond").innerHTML = `${S.condForm ? `<form class="cond-form" id="h-cond-form" autocomplete="off">
      <label class="f">What's wrong?<input id="hc-title" class="inp" placeholder="e.g. Sore throat, fever, gastric, took panadol" required></label>
      <div class="qa-chips cwrap">${COND_KIND.map(([v, l]) => `<button type="button" class="qc" data-ckind="${v}" aria-pressed="${S.condKind === v}">${l}</button>`).join("")}</div>
      <div class="qa-chips cwrap">${SEV.map(([v, l]) => `<button type="button" class="qc sv-${v}" data-csev="${v}" aria-pressed="${S.condSev === v}">${l}</button>`).join("")}</div>
      <div class="grid2"><label class="f">Started<input type="date" id="hc-start" value="${tk}"></label><label class="f">Notes<input id="hc-notes" class="inp" placeholder="Symptoms, medicine, clinic…"></label></div>
      <div class="row"><button class="btn sm primary" type="submit">Save</button><button class="btn sm" type="button" data-cform="0">Cancel</button></div></form>`
      : `<button class="btn sm primary" type="button" data-cform="1">+ Log how you're feeling</button>`}
    ${ongoing.length ? `<ul class="conds">${ongoing.map(condRow).join("")}</ul>` : `<p class="small muted" style="margin:0">Nothing ongoing. Hope you're feeling well.</p>`}
    ${past.length ? `<details><summary class="small">History (${past.length})</summary><ul class="conds">${past.map(condRow).join("")}</ul></details>` : ""}`;
  // cycle
  if (!S.showCycle) $("#h-cycle").innerHTML = `<p class="small muted" style="margin:0">Cycle tracking is turned off. Switch it on below to log periods and see predictions.</p>`;
  if (S.showCycle) {
    const C = cycleInfo(), strip = [];
    for (let i = -20; i <= 20; i++) { const x = addDays(tk, i), dd = hDoc(x), per = dd.flow && dd.flow !== "spotting";
      const pred = !C.none && !per && x > tk && x >= C.next && x < addDays(C.next, C.pavg), fert = !C.none && x > tk && x >= C.fertA && x <= C.fertB;
      strip.push(`<button type="button" class="cy-d ${per ? "per f-" + dd.flow : ""} ${dd.flow === "spotting" ? "spot" : ""} ${pred ? "pred" : ""} ${fert ? "fert" : ""} ${x === tk ? "today" : ""} ${x === k ? "sel" : ""}" data-hset="${x}" title="${esc(fmtDate(x))}${per ? " · period (" + dd.flow + ")" : pred ? " · predicted period" : fert ? " · fertile window (estimate)" : ""}"><span>${esc(DAYS[keyDow(x)].slice(0, 1))}</span><b>${+x.slice(8)}</b></button>`); }
    const prevScroll = $("#cy-strip") ? $("#cy-strip").scrollLeft : null;
    $("#h-cycle").innerHTML = `<div class="cy-status">${C.none ? `<b>No period logged yet.</b><span class="small muted">Tap the day your last period started below, then choose the flow.</span>`
        : `<div class="cy-ring"><b>${C.day > 0 && C.day <= 60 ? C.day : "–"}</b><span>day</span></div><div><b>${C.until > 0 ? `Next period in about ${C.until} day${C.until === 1 ? "" : "s"}` : C.until === 0 ? "Period expected today" : `Period about ${-C.until} day${C.until === -1 ? "" : "s"} late`}</b><div class="small muted">Expected around ${esc(fmtDate(C.next))} · average cycle ${C.avg} days · period ${C.pavg} days${C.lens.length < 2 ? " (estimate improves as you log more)" : ""}</div></div>`}</div>
      <div class="cy-strip" id="cy-strip">${strip.join("")}</div>
      <div class="tl-legend"><span><i class="lgc per"></i>Period</span><span><i class="lgc pred"></i>Predicted</span><span><i class="lgc fert"></i>Fertile window (estimate)</span><span><i class="lgc spot"></i>Spotting</span></div>
      <div class="cy-log"><div class="small"><b>${isT ? "Today" : esc(fmtDate(k))}</b> · flow</div>
        <div class="qa-chips cwrap">${FLOW.map(([v, l]) => `<button type="button" class="qc fl-${v || "none"}" data-flow="${v}" aria-pressed="${(d.flow || "") === v}">${l}</button>`).join("")}</div>
        <div class="small" style="margin-top:4px"><b>Symptoms</b></div>
        <div class="qa-chips cwrap">${SYMS.map(s => `<button type="button" class="qc" data-sym="${esc(s)}" aria-pressed="${(d.sym || []).includes(s)}">${esc(s)}</button>`).join("")}</div></div>
      <p class="small muted" style="margin:0">Predictions are estimates from your own history. Don't rely on them for contraception.</p>`;
    const st = $("#cy-strip");
    if (st && renderHealth._scrolled && prevScroll !== null) st.scrollLeft = prevScroll;
    else if (st) requestAnimationFrame(() => { const t = st.querySelector(".today"); if (t && st.clientWidth) { st.scrollLeft = t.offsetLeft - st.offsetLeft - st.clientWidth / 2 + t.offsetWidth / 2; renderHealth._scrolled = true; } });
  }
  $("#h-cyc-toggle").checked = !!S.showCycle;
}
function addHealthItem(field, item){ const k = hk(), d = hDoc(k); d[field] = [...(d[field] || []), item]; saveHealth(k, d); }
document.addEventListener("click", e => {
  if (S.view !== "health") return;
  const t = e.target.closest("button,[data-hset]"); if (!t || !t.closest("#v-health")) return;
  const k = hk(), d = hDoc(k);
  if (t.dataset.hday) { const n = addDays(k, +t.dataset.hday); S.hDay = n > todayKey() ? todayKey() : n; renderHealth(); }
  else if (t.dataset.water) { d.water = Math.max(0, (d.water || 0) + +t.dataset.water); saveHealth(k, d); if (+t.dataset.water > 0 && d.water === (S.waterGoal || 8)) toast("Water goal reached! 💧"); }
  else if (t.dataset.cup) { const n = +t.dataset.cup; d.water = d.water === n ? n - 1 : n; saveHealth(k, d); }
  else if (t.dataset.meal) { S.mealType = t.dataset.meal; renderHealth(); $("#h-meal").focus(); }
  else if (t.dataset.mealsrc) { S.mealSrc = t.dataset.mealsrc; t.parentElement.querySelectorAll("[data-mealsrc]").forEach(b => b.setAttribute("aria-pressed", b === t)); $("#h-meal").focus(); }
  else if (t.dataset.msrc) { const order = MEAL_SRC.map(x => x[0]); d.meals = (d.meals || []).map(m => m.id === t.dataset.msrc ? { ...m, src: order[(order.indexOf(m.src) + 1) % order.length] } : m); saveHealth(k, d); const m = d.meals.find(x => x.id === t.dataset.msrc); toast((MEAL_SRC.find(x => x[0] === m.src) || ["", ""])[1]); }
  else if (t.dataset.bowel) { S.bowelType = t.dataset.bowel; renderHealth(); }
  else if (t.dataset.hdel) { const [f, id] = t.dataset.hdel.split(":"); d[f] = (d[f] || []).filter(x => x.id !== id); saveHealth(k, d); }
  else if (t.dataset.bdel) { del("body", t.dataset.bdel); }
  else if (t.dataset.cform !== undefined) { S.condForm = t.dataset.cform === "1"; renderHealth(); if (S.condForm) $("#hc-title").focus(); }
  else if (t.dataset.ckind) { S.condKind = t.dataset.ckind; t.parentElement.querySelectorAll("[data-ckind]").forEach(b => b.setAttribute("aria-pressed", b === t)); }
  else if (t.dataset.csev) { S.condSev = t.dataset.csev; t.parentElement.querySelectorAll("[data-csev]").forEach(b => b.setAttribute("aria-pressed", b === t)); }
  else if (t.dataset.cres) { const c = S.conds.find(x => x.id === t.dataset.cres); if (c) { put("conditions", c.id, { ...strip(c), status: "resolved", end: todayKey() }); toast("Glad you're feeling better"); } }
  else if (t.dataset.cdelx) { if (S.condDel !== t.dataset.cdelx) { S.condDel = t.dataset.cdelx; renderHealth(); } else { del("conditions", t.dataset.cdelx); S.condDel = null; } }
  else if (t.dataset.hset) { S.hDay = t.dataset.hset > todayKey() ? todayKey() : t.dataset.hset; if (t.dataset.hset > todayKey()) toast("You can log flow up to today"); renderHealth(); }
  else if (t.dataset.flow !== undefined) { d.flow = t.dataset.flow; saveHealth(k, d); }
  else if (t.dataset.sym) { const s = t.dataset.sym, cur = d.sym || []; d.sym = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s]; saveHealth(k, d); }
});
document.addEventListener("submit", e => {
  const f = e.target; if (!f.closest || !f.closest("#v-health")) return;
  e.preventDefault();
  if (f.id === "h-meal-form") { const txt = $("#h-meal").value.trim(); if (!txt) { $("#h-meal").focus(); return; } addHealthItem("meals", { id: hid(), type: S.mealType, src: S.mealSrc, text: txt, time: $("#h-meal-t").value || nowHMs() }); setTimeout(() => $("#h-meal") && $("#h-meal").focus(), 30); }
  else if (f.id === "h-bowel-form") { addHealthItem("bowel", { id: hid(), type: S.bowelType, note: $("#h-bowel-note").value.trim(), time: hk() === todayKey() ? nowHMs() : "12:00" }); toast("Logged"); }
  else if (f.id === "h-body-form") { const hh = parseFloat($("#hb-h").value), ww = parseFloat($("#hb-w").value), dt = $("#hb-date").value || todayKey();
    if (!hh && !ww) { toast("Enter your height, weight or both"); return; }
    const ex = S.body.find(r => r.date === dt); const rec = { date: dt, height: hh ? +hh.toFixed(1) : (ex && ex.height) || "", weight: ww ? +ww.toFixed(1) : (ex && ex.weight) || "", createdAt: nowISO() };
    put("body", ex ? ex.id : newId(), rec); toast("Saved"); }
  else if (f.id === "h-cond-form") { const ti = $("#hc-title").value.trim(); if (!ti) return;
    put("conditions", newId(), { title: ti, kind: S.condKind, severity: S.condSev, start: $("#hc-start").value || todayKey(), end: "", status: "ongoing", notes: $("#hc-notes").value.trim(), createdAt: nowISO() });
    S.condForm = false; toast("Logged. Take care of yourself."); }
});
document.addEventListener("change", e => {
  if (e.target.id === "h-goal") { S.waterGoal = +e.target.value; saveCats(); renderHealth(); }
  if (e.target.id === "h-cyc-toggle") { S.showCycle = e.target.checked; saveCats(); renderHealth(); }
});

// ---------- Mind & mood check-ins (stored in the day's health record)
const MOODS = [[1,"Awful"],[2,"Low"],[3,"Okay"],[4,"Good"],[5,"Great"]];
const FEELS = ["Happy","Calm","Grateful","Proud","Motivated","Excited","Tired","Stressed","Anxious","Overwhelmed","Sad","Lonely","Frustrated","Angry","Bored","Unmotivated"];
const WHYS = ["Work","Study","Family","Friends","Relationship","Health","Sleep","Money","Food","Exercise","Weather","Social media","Me-time"];
S.moodDraft = { m: 0, feel: [], why: [], stress: 0 };
const moodColor = m => ["", "var(--crit)", "#e0857b", "var(--med)", "var(--c1)", "var(--ok)"][Math.round(m)] || "var(--line)";
function moodFace(m){ // simple drawn faces, no emoji
  const mouth = { 1: "M8 16.5c2.2-2.4 5.8-2.4 8 0", 2: "M8.5 16c2-1.3 5-1.3 7 0", 3: "M8.5 15.5h7", 4: "M8.5 14.5c2 1.6 5 1.6 7 0", 5: "M8 14c2.2 2.8 5.8 2.8 8 0" }[m];
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><circle cx="9" cy="10" r=".9" fill="currentColor"/><circle cx="15" cy="10" r=".9" fill="currentColor"/><path d="${mouth}"/></svg>`;
}
function dayMood(k){ const ms = (hDoc(k).moods || []); return ms.length ? ms.reduce((a, x) => a + x.m, 0) / ms.length : null; }
function needsSupport(){
  const tk = todayKey(); let low = 0;
  for (let i = 0; i < 7; i++) { const v = dayMood(addDays(tk, -i)); if (v !== null && v <= 2) low++; }
  const today = hDoc(tk).moods || [], last = today[today.length - 1];
  let hidden = false; try { hidden = (localStorage.getItem("daybook-support-hide") || "") >= tk; } catch {}
  return !hidden && (low >= 3 || (last && last.m === 1));
}
function renderMood(){
  const box = $("#h-mood"); if (!box) return;
  const k = hk(), d = hDoc(k), isT = k === todayKey(), D = S.moodDraft;
  const entries = (d.moods || []).slice().sort((a, b) => a.time.localeCompare(b.time));
  const days = rangeKeys(14), vals = days.map(dayMood);
  const feelCount = {}; rangeKeys(30).forEach(x => (hDoc(x).moods || []).forEach(e => (e.feel || []).forEach(f => feelCount[f] = (feelCount[f] || 0) + 1)));
  const topFeel = Object.entries(feelCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const avg14 = vals.filter(v => v !== null); const a14 = avg14.length ? avg14.reduce((a, b) => a + b, 0) / avg14.length : null;
  box.innerHTML = `
    ${needsSupport() ? `<div class="support"><b>Things seem heavy lately.</b> You don't have to carry it alone. Talking to someone you trust, or a trained listener, can really help.
      <div class="sup-lines"><span><b>Befrienders KL</b> 03-7627 2929 · 24 hours</span><span><b>Talian HEAL</b> 15555 · 8am to midnight</span><span>In an emergency, call <b>999</b></span></div>
      <button type="button" class="btn sm ghost" data-suphide>Hide for 3 days</button></div>` : ""}
    <div class="small"><b>How are you feeling${isT ? " right now" : ""}?</b></div>
    <div class="moods">${MOODS.map(([v, l]) => `<button type="button" class="mood-b ${D.m === v ? "on" : ""}" data-mood-m="${v}" style="--mc:${moodColor(v)}" aria-pressed="${D.m === v}">${moodFace(v)}<span>${l}</span></button>`).join("")}</div>
    ${D.m ? `<div class="small muted">Feelings <span>(pick any)</span></div>
      <div class="qa-chips cwrap">${FEELS.map(f => `<button type="button" class="qc" data-mood-f="${esc(f)}" aria-pressed="${D.feel.includes(f)}">${esc(f)}</button>`).join("")}</div>
      <div class="small muted">What's affecting you?</div>
      <div class="qa-chips cwrap">${WHYS.map(f => `<button type="button" class="qc ghost" data-mood-w="${esc(f)}" aria-pressed="${D.why.includes(f)}">${esc(f)}</button>`).join("")}</div>
      <div class="small muted">Stress level</div>
      <div class="seg stress">${[1,2,3,4,5].map(n => `<button type="button" data-mood-s="${n}" aria-pressed="${D.stress === n}">${n}</button>`).join("")}<span class="small muted">1 relaxed · 5 very stressed</span></div>
      <textarea id="mood-note" class="inp" rows="2" placeholder="What's on your mind? (optional, only you can see this in the app)">${esc(D.note || "")}</textarea>
      <div class="row"><button class="btn sm primary" type="button" data-mood-save>Save check-in</button><button class="btn sm" type="button" data-mood-cancel>Cancel</button></div>` : ""}
    ${entries.length ? `<ul class="mood-list">${entries.map(e => `<li><span class="mood-dot" style="--mc:${moodColor(e.m)}">${moodFace(e.m)}</span><div><div><b>${esc(MOODS[e.m - 1][1])}</b> <span class="small muted">${esc(e.time)}${e.stress ? ` · stress ${e.stress}/5` : ""}</span></div>
        ${(e.feel || []).length ? `<div class="small">${e.feel.map(esc).join(", ")}</div>` : ""}${(e.why || []).length ? `<div class="small muted">Because of: ${e.why.map(esc).join(", ")}</div>` : ""}${e.note ? `<div class="small mood-note">${esc(e.note)}</div>` : ""}</div>
        <button type="button" class="x" data-mood-del="${esc(e.id)}" aria-label="Delete check-in">✕</button></li>`).join("")}</ul>` : ""}
    <div class="mood-trend"><div class="small muted">Last 14 days${a14 !== null ? ` · average <b style="color:${moodColor(a14)}">${MOODS[Math.round(a14) - 1][1].toLowerCase()}</b>` : ""}</div>
      <div class="mt-row">${days.map((x, i) => { const v = vals[i]; return `<span class="mt-d ${x === k ? "sel" : ""}" title="${esc(fmtDate(x))}${v !== null ? " · " + MOODS[Math.round(v) - 1][1] : " · no check-in"}"><i style="height:${v === null ? 4 : 8 + v * 8}px;background:${v === null ? "var(--line)" : moodColor(v)}"></i><em>${esc(DAYS[keyDow(x)].slice(0, 1))}</em></span>`; }).join("")}</div></div>
    ${topFeel.length ? `<div class="small muted">Most felt this month: ${topFeel.map(([f, n]) => `<span class="feel-pill">${esc(f)} <b>${n}</b></span>`).join(" ")}</div>` : ""}`;
}
document.addEventListener("click", e => {
  if (S.view !== "health") return;
  const t = e.target.closest("button"); if (!t || !t.closest("#h-mood")) return;
  const D = S.moodDraft; if ($("#mood-note")) D.note = $("#mood-note").value;
  if (t.dataset.moodM) { D.m = +t.dataset.moodM; renderMood(); }
  else if (t.dataset.moodF) { const f = t.dataset.moodF; D.feel = D.feel.includes(f) ? D.feel.filter(x => x !== f) : [...D.feel, f]; renderMood(); }
  else if (t.dataset.moodW) { const f = t.dataset.moodW; D.why = D.why.includes(f) ? D.why.filter(x => x !== f) : [...D.why, f]; renderMood(); }
  else if (t.dataset.moodS) { D.stress = D.stress === +t.dataset.moodS ? 0 : +t.dataset.moodS; renderMood(); }
  else if (t.dataset.moodCancel !== undefined) { S.moodDraft = { m: 0, feel: [], why: [], stress: 0 }; renderMood(); }
  else if (t.dataset.moodSave !== undefined) {
    const k = hk(), d = hDoc(k);
    d.moods = [...(d.moods || []), { id: hid(), time: k === todayKey() ? nowHMs() : "20:00", m: D.m, feel: D.feel, why: D.why, stress: D.stress, note: (D.note || "").trim() }];
    S.moodDraft = { m: 0, feel: [], why: [], stress: 0 }; saveHealth(k, d);
    toast(D.m >= 4 ? "Check-in saved. Glad you're doing well." : D.m === 3 ? "Check-in saved." : "Check-in saved. Be gentle with yourself today.");
  }
  else if (t.dataset.moodDel) { const k = hk(), d = hDoc(k); d.moods = (d.moods || []).filter(x => x.id !== t.dataset.moodDel); saveHealth(k, d); }
  else if (t.dataset.suphide !== undefined) { try { localStorage.setItem("daybook-support-hide", addDays(todayKey(), 2)); } catch {} renderMood(); }
});

// ---------- Money: shopping list + expenses
S.shop = []; S.exp = []; S.cur = "RM"; S.budget = 0; S.shopHist = []; S.eDay = null; S.eMonth = null;
S.shopCat = "other"; S.shopPicked = false; S.expCat = "food"; S.expPay = "cash"; S.groceryLog = false;
const SHOP_CATS = [["produce","Fruit & veg"],["meat","Meat & fish"],["dairy","Dairy & eggs"],["bakery","Bread"],["pantry","Pantry"],["frozen","Frozen"],["snacks","Snacks & drinks"],["household","Household"],["personal","Toiletries"],["other","Other"]];
const EXP_CATS = [["food","Food & drinks",0],["groceries","Groceries",1],["transport","Transport",5],["shopping","Shopping",2],["bills","Bills",3],["health","Health",4],["fun","Entertainment",2],["education","Education",0],["other","Other",5]];
const PAY = [["cash","Cash"],["card","Card"],["ewallet","E-wallet"],["transfer","Transfer"]];
const money = n => S.cur + " " + (+n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const expCat = c => EXP_CATS.find(x => x[0] === c) || ["other", "Other", 5];
const ek = () => S.eDay || todayKey(), em = () => S.eMonth || todayKey().slice(0, 7);
function renderMoney(){
  if (S.view !== "money") return;
  const k = ek(), tk = todayKey(), isT = k === tk;
  // ---- expenses for the day
  const dayExp = S.exp.filter(e => e.date === k).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const dayTot = dayExp.reduce((s, e) => s + (+e.amount || 0), 0);
  $("#m-day").innerHTML = `<div class="pager" style="margin:0"><button class="btn sm" type="button" data-eday="-1" aria-label="Previous day">‹</button><span class="mid">${isT ? "Today" : esc(DAYS[keyDow(k)])}<small>${esc(fmtDate(k))}</small></span><button class="btn sm" type="button" data-eday="1" ${isT ? "disabled" : ""} aria-label="Next day">›</button></div>
    <div class="m-total"><span class="small muted">Spent ${isT ? "today" : "this day"}</span><b>${money(dayTot)}</b></div>
    <form id="m-exp-form" class="m-form" autocomplete="off">
      <div class="m-amt"><span>${esc(S.cur)}</span><input id="m-amt" inputmode="decimal" placeholder="0.00" aria-label="Amount"></div>
      <input id="m-note" class="inp" placeholder="What was it? e.g. Lunch at mamak, Grab to office" aria-label="What was it">
      <button class="btn primary" type="submit">Add</button>
    </form>
    <div class="qa-chips cwrap">${EXP_CATS.map(([v, l, ci]) => `<button type="button" class="qc ci-${ci}" data-ecat="${v}" aria-pressed="${S.expCat === v}">${l}</button>`).join("")}</div>
    <div class="qa-chips cwrap">${PAY.map(([v, l]) => `<button type="button" class="qc" data-epay="${v}" aria-pressed="${S.expPay === v}">${l}</button>`).join("")}</div>
    ${dayExp.length ? `<ul class="hlist m-list">${dayExp.map(e => { const c = expCat(e.cat); return `<li><span class="hl-tag cat-${c[2]}">${esc(c[1])}</span><span class="hl-b">${esc(e.note || c[1])}<span class="small muted"> · ${esc((PAY.find(p => p[0] === e.pay) || ["", ""])[1])}</span></span><b class="m-amtv">${money(e.amount)}</b><button type="button" class="x" data-edel="${esc(e.id)}" aria-label="Delete">✕</button></li>`; }).join("")}</ul>` : `<p class="small muted" style="margin:0">No spending logged${isT ? " today" : ""}.</p>`}`;
  // ---- month summary
  const mk = em(), [y, m] = mk.split("-").map(Number), nDays = new Date(y, m, 0).getDate();
  const mExp = S.exp.filter(e => (e.date || "").startsWith(mk)), mTot = mExp.reduce((s, e) => s + (+e.amount || 0), 0);
  const prevMk = dkey(new Date(y, m - 2, 1)).slice(0, 7), prevTot = S.exp.filter(e => (e.date || "").startsWith(prevMk)).reduce((s, e) => s + (+e.amount || 0), 0);
  const byCat = {}; mExp.forEach(e => byCat[e.cat] = (byCat[e.cat] || 0) + (+e.amount || 0));
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const daily = Array.from({ length: nDays }, (_, i) => { const d = mk + "-" + pad(i + 1); return d > tk ? null : mExp.filter(e => e.date === d).reduce((s, e) => s + (+e.amount || 0), 0); });
  const isCur = mk === tk.slice(0, 7), daysLeft = isCur ? nDays - (+tk.slice(8)) + 1 : 0, left = S.budget ? S.budget - mTot : 0;
  const maxD = Math.max(10, ...daily.map(v => v || 0)), niceMax = Math.ceil(maxD / 10) * 10;
  const labels = daily.map((_, i) => ({ full: fmtDate(mk + "-" + pad(i + 1)), short: String(i + 1), show: i === 0 || i === nDays - 1 || ((i + 1) % 5 === 0 && i + 1 <= nDays - 3) }));
  $("#m-month").innerHTML = `<div class="pager" style="margin:0"><button class="btn sm" type="button" data-emon="-1" aria-label="Previous month">‹</button><span class="mid">${MONTHS[m - 1]} ${y}</span><button class="btn sm" type="button" data-emon="1" ${isCur ? "disabled" : ""} aria-label="Next month">›</button></div>
    <div class="m-sum"><div><span class="small muted">Spent this month</span><b>${money(mTot)}</b>${prevTot ? `<span class="small ${mTot > prevTot ? "up" : "down"}">${mTot > prevTot ? "▲" : "▼"} ${money(Math.abs(mTot - prevTot))} vs ${MONTHS[(m + 10) % 12].slice(0, 3)}</span>` : ""}</div>
      <div><span class="small muted">Daily average</span><b>${money(mTot / (isCur ? +tk.slice(8) : nDays))}</b><span class="small muted">${mExp.length} entr${mExp.length === 1 ? "y" : "ies"}</span></div></div>
    ${S.budget ? `<div class="m-budget"><div class="m-bud-top"><span class="small"><b>Budget ${money(S.budget)}</b></span><span class="small ${left < 0 ? "over" : "muted"}">${left >= 0 ? `${money(left)} left${isCur && daysLeft ? ` · about ${money(left / daysLeft)}/day for ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : ""}` : `${money(-left)} over budget`}</span></div>
      <span class="bar m-bar"><i style="width:${Math.min(100, mTot / S.budget * 100)}%;background:${mTot / S.budget > 1 ? "var(--crit)" : mTot / S.budget > .85 ? "var(--high)" : "var(--accent)"}"></i></span></div>` : ""}
    <label class="small muted m-setbud">Monthly budget <span class="m-amt sm"><span>${esc(S.cur)}</span><input id="m-budget" inputmode="decimal" value="${S.budget || ""}" placeholder="None"></span></label>
    ${mTot ? `<div class="chartbox m-chart">${barChart(daily, labels, niceMax, v => (v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v)), "var(--accent)")}</div>` : ""}
    ${cats.length ? `<div class="m-cats">${cats.map(([c, v]) => { const C = expCat(c); return `<div class="m-cat"><span class="hl-tag cat-${C[2]}">${esc(C[1])}</span><span class="bar"><i style="width:${(v / cats[0][1] * 100).toFixed(1)}%;background:var(--c${C[2]})"></i></span><b>${money(v)}</b><span class="small muted">${Math.round(v / mTot * 100)}%</span></div>`; }).join("")}</div>` : `<p class="small muted" style="margin:0">No spending this month yet.</p>`}
    ${mExp.length ? `<details><summary class="small">Biggest spends</summary><ul class="hlist m-list">${mExp.slice().sort((a, b) => b.amount - a.amount).slice(0, 5).map(e => `<li><span class="hl-t">${esc(fmtDate(e.date).split(", ")[1])}</span><span class="hl-b">${esc(e.note || expCat(e.cat)[1])}</span><b class="m-amtv">${money(e.amount)}</b></li>`).join("")}</ul></details>` : ""}
    <label class="small muted m-setbud">Currency <select id="m-cur">${["RM","S$","$","¥","£","€","₱","Rp","฿"].map(c => `<option ${c === S.cur ? "selected" : ""}>${c}</option>`).join("")}</select></label>`;
  // ---- shopping list
  const open = S.shop.filter(i => !i.done), got = S.shop.filter(i => i.done);
  const groups = SHOP_CATS.map(([v, l]) => [v, l, open.filter(i => (i.cat || "other") === v)]).filter(g => g[2].length);
  const onList = new Set(open.map(i => i.name.toLowerCase()));
  const sugg = S.shopHist.filter(n => !onList.has(n.toLowerCase())).slice(0, 12);
  $("#m-shop").innerHTML = `<form id="m-shop-form" class="m-form" autocomplete="off"><input id="m-item" class="inp" placeholder="Add item, e.g. Eggs" aria-label="Item"><input id="m-qty" class="inp" placeholder="Qty" aria-label="Quantity" style="max-width:80px"><button class="btn primary" type="submit">Add</button></form>
    <div class="qa-chips cwrap">${SHOP_CATS.map(([v, l]) => `<button type="button" class="qc" data-scat="${v}" aria-pressed="${S.shopCat === v}">${l}</button>`).join("")}</div>
    ${sugg.length ? `<div class="m-sugg"><span class="small muted">Buy again:</span>${sugg.map(n => `<button type="button" class="qc ghost" data-sagain="${esc(n)}">+ ${esc(n)}</button>`).join("")}</div>` : ""}
    ${groups.length ? groups.map(([v, l, items]) => `<div class="m-grp"><div class="m-grp-h">${esc(l)} <span class="muted">${items.length}</span></div><ul class="m-items">${items.map(i => `<li><input type="checkbox" data-sdone="${esc(i.id)}" aria-label="Bought ${esc(i.name)}"><span class="m-iname">${esc(i.name)}</span>${i.qty ? `<span class="m-qty">${esc(i.qty)}</span>` : ""}<button type="button" class="x" data-sdel="${esc(i.id)}" aria-label="Remove">✕</button></li>`).join("")}</ul></div>`).join("") : `<p class="small muted" style="margin:0">Your list is empty. Add what you need above.</p>`}
    ${got.length ? `<div class="m-grp got"><div class="m-grp-h">In the basket <span class="muted">${got.length}</span><button type="button" class="btn sm ghost" data-sclear>Clear bought</button></div><ul class="m-items">${got.map(i => `<li class="done"><input type="checkbox" checked data-sdone="${esc(i.id)}" aria-label="Not bought ${esc(i.name)}"><span class="m-iname">${esc(i.name)}</span>${i.qty ? `<span class="m-qty">${esc(i.qty)}</span>` : ""}</li>`).join("")}</ul>
      ${S.groceryLog ? `<form id="m-groc-form" class="m-form" autocomplete="off"><div class="m-amt"><span>${esc(S.cur)}</span><input id="m-groc" inputmode="decimal" placeholder="Total paid"></div><button class="btn sm primary" type="submit">Save expense</button><button class="btn sm" type="button" data-sgroc="0">Cancel</button></form>`
        : `<button type="button" class="btn sm" data-sgroc="1">Log grocery bill as an expense</button>`}</div>` : ""}`;
}
async function batchColl(coll, ops){
  if (!db || !FS) { ops.forEach(([op, id, d]) => op === "delete" ? del(coll, id) : put(coll, id, d)); return; }
  for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(FS); ops.slice(i, i + 400).forEach(([op, id, d]) => { const r = doc(FS, `users/${UID}/${coll}/${id}`); op === "delete" ? b.delete(r) : b.set(r, d); }); await b.commit(); }
}
function rememberItem(name){ const n = name.trim(); if (!n) return; S.shopHist = [n, ...S.shopHist.filter(x => x.toLowerCase() !== n.toLowerCase())].slice(0, 40); saveCats(); }
function guessShopCat(name){ const n = name.toLowerCase();
  const R = [["produce",/\b(apple|banana|orange|veg|sayur|tomato|onion|garlic|potato|carrot|lettuce|cabbage|fruit|lemon|lime|chili|cili|ginger|spinach|kangkung|cucumber|grape|mango|papaya)/],["meat",/\b(chicken|ayam|beef|pork|fish|ikan|prawn|udang|meat|sausage|ham|bacon|squid)/],["dairy",/\b(milk|susu|egg|telur|cheese|yogurt|yoghurt|butter|cream)/],["bakery",/\b(bread|roti|bun|cake|croissant)/],["pantry",/\b(rice|beras|flour|sugar|salt|oil|minyak|sauce|kicap|pasta|noodle|mee|bihun|cereal|oat|spice|coffee|tea|kopi|teh|honey|jam)/],["frozen",/\b(frozen|ice cream|nugget|dumpling)/],["snacks",/\b(snack|chips|biscuit|chocolate|candy|juice|soda|coke|drink|water|milo)/],["household",/\b(soap|detergent|tissue|toilet paper|dish|bin bag|sponge|bleach|cleaner|light bulb|battery)/],["personal",/\b(shampoo|toothpaste|toothbrush|lotion|pad|tampon|deodorant|razor|sunscreen|floss|medicine|vitamin)/]];
  const hit = R.find(([, re]) => re.test(n)); return hit ? hit[0] : null; }
document.addEventListener("click", async e => {
  if (S.view !== "money") return;
  const t = e.target.closest("button"); if (!t || !t.closest("#v-money")) return;
  if (t.dataset.eday) { const n = addDays(ek(), +t.dataset.eday); S.eDay = n > todayKey() ? todayKey() : n; renderMoney(); }
  else if (t.dataset.emon) { const [y, m] = em().split("-").map(Number); const d = new Date(y, m - 1 + +t.dataset.emon, 1); const mk = dkey(d).slice(0, 7); S.eMonth = mk > todayKey().slice(0, 7) ? null : mk; renderMoney(); }
  else if (t.dataset.ecat) { S.expCat = t.dataset.ecat; t.parentElement.querySelectorAll("[data-ecat]").forEach(b => b.setAttribute("aria-pressed", b === t)); }
  else if (t.dataset.epay) { S.expPay = t.dataset.epay; t.parentElement.querySelectorAll("[data-epay]").forEach(b => b.setAttribute("aria-pressed", b === t)); }
  else if (t.dataset.edel) { del("expenses", t.dataset.edel); toast("Expense deleted"); }
  else if (t.dataset.scat) { S.shopCat = t.dataset.scat; S.shopPicked = true; t.parentElement.querySelectorAll("[data-scat]").forEach(b => b.setAttribute("aria-pressed", b === t)); $("#m-item").focus(); }
  else if (t.dataset.sagain) { const n = t.dataset.sagain; put("shop", newId(), { name: n, qty: "", cat: guessShopCat(n) || "other", done: false, doneAt: "", createdAt: nowISO() }); }
  else if (t.dataset.sdel) { del("shop", t.dataset.sdel); }
  else if (t.dataset.sclear !== undefined) { const got = S.shop.filter(i => i.done); await batchColl("shop", got.map(i => ["delete", i.id])); S.groceryLog = false; toast(`Cleared ${got.length} item${got.length === 1 ? "" : "s"}`); }
  else if (t.dataset.sgroc) { S.groceryLog = t.dataset.sgroc === "1"; renderMoney(); if (S.groceryLog) $("#m-groc").focus(); }
});
document.addEventListener("change", e => {
  const c = e.target.closest && e.target.closest("[data-sdone]");
  if (c) { const i = S.shop.find(x => x.id === c.dataset.sdone); if (i) { put("shop", i.id, { ...strip(i), done: c.checked, doneAt: c.checked ? nowISO() : "" }); if (c.checked) rememberItem(i.name); } return; }
  if (e.target.id === "m-budget") { S.budget = Math.max(0, parseFloat(e.target.value) || 0); saveCats(); renderMoney(); toast(S.budget ? "Budget saved" : "Budget removed"); }
  if (e.target.id === "m-cur") { S.cur = e.target.value; saveCats(); renderMoney(); }
});
document.addEventListener("submit", e => {
  const f = e.target; if (!f.closest || !f.closest("#v-money")) return; e.preventDefault();
  if (f.id === "m-exp-form") {
    const amt = parseFloat(($("#m-amt").value || "").replace(/[^\d.]/g, ""));
    if (!amt || amt <= 0) { toast("Enter an amount first"); $("#m-amt").focus(); return; }
    put("expenses", newId(), { date: ek(), amount: Math.round(amt * 100) / 100, cat: S.expCat, pay: S.expPay, note: $("#m-note").value.trim(), createdAt: nowISO() });
    toast(`${money(amt)} · ${expCat(S.expCat)[1]}`); $("#m-amt").value = ""; $("#m-note").value = ""; $("#m-amt").focus();
  } else if (f.id === "m-shop-form") {
    const n = $("#m-item").value.trim(); if (!n) { $("#m-item").focus(); return; }
    // a category you tapped wins; otherwise guess from the name (eggs → Dairy & eggs)
    const cat = S.shopPicked ? S.shopCat : (guessShopCat(n) || S.shopCat || "other");
    put("shop", newId(), { name: n, qty: $("#m-qty").value.trim(), cat, done: false, doneAt: "", createdAt: nowISO() });
    S.shopPicked = false;
    $("#m-item").value = ""; $("#m-qty").value = ""; $("#m-item").focus();
  } else if (f.id === "m-groc-form") {
    const amt = parseFloat(($("#m-groc").value || "").replace(/[^\d.]/g, "")); if (!amt) { $("#m-groc").focus(); return; }
    const n = S.shop.filter(i => i.done).length;
    put("expenses", newId(), { date: todayKey(), amount: Math.round(amt * 100) / 100, cat: "groceries", pay: S.expPay, note: `Groceries (${n} item${n === 1 ? "" : "s"})`, createdAt: nowISO() });
    S.groceryLog = false; toast("Grocery bill saved to expenses"); renderMoney();
  }
});
// Enter in the amount box jumps to the description
document.addEventListener("keydown", e => { if (e.target.id === "m-amt" && e.key === "Enter" && !$("#m-note").value.trim()) { e.preventDefault(); $("#m-note").focus(); } });

// ---------- Study: subjects, timetable, assignments, grades
S.subjects = []; S.classes = []; S.asg = []; S.semStart = ""; S.semWeeks = 14; S.semBreaks = []; S.prevCgpa = ""; S.prevCredits = "";
S.stEdit = null; S.asgFilter = "todo"; S.asgSubj = ""; S.asgOpen = null; S.asgType = "assignment"; S.clsType = "lecture"; S.subjForm = false; S.clsForm = false;
const CLS_TYPES = [["lecture","Lecture"],["tutorial","Tutorial"],["lab","Lab"],["online","Online"],["other","Other"]];
const ASG_TYPES = [["assignment","Assignment"],["quiz","Quiz"],["test","Test"],["project","Project"],["report","Lab report"],["presentation","Presentation"],["exam","Exam"]];
const ASG_ST = [["todo","Not started"],["doing","In progress"],["submitted","Submitted"],["graded","Graded"]];
const GRADES = [["A",4],["A-",3.67],["B+",3.33],["B",3],["B-",2.67],["C+",2.33],["C",2],["C-",1.67],["D+",1.33],["D",1],["F",0]];
const subj = id => S.subjects.find(s => s.id === id);
const subjCls = id => { const s = subj(id); return "cat-" + (s ? (+s.color || 0) % 6 : 5); };
const subjLabel = id => { const s = subj(id); return s ? (s.code || s.name) : "No subject"; };
const fmt12 = t => { if (!t) return ""; let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12; return h + (m ? ":" + pad(m) : "") + ap; };
const BREAK_KINDS = [["break","Mid-semester break"],["swotvac","SWOT VAC"],["exam","Exam period"],["other","Other break"]];
const breakName = b => b.label || (BREAK_KINDS.find(x => x[0] === b.kind) || ["", "Break"])[1];
function breakOn(k){ return (S.semBreaks || []).find(b => b.from && b.to && k >= b.from && k <= b.to) || null; }
const wkMon = k => addDays(k, -((keyDow(k) + 6) % 7));
const weekIsBreak = m => !!(breakOn(m) && breakOn(addDays(m, 4)));
// Teaching week number: break weeks (mid-sem break, SWOT VAC, exams) aren't counted.
function semWeek(k){ if (!S.semStart) return null; const m0 = wkMon(S.semStart), mk = wkMon(k);
  if (mk < m0) return Math.floor((new Date(mk + "T00:00") - new Date(m0 + "T00:00")) / (7 * 864e5)) + 1;
  let n = 0; for (let w = m0; w <= mk; w = addDays(w, 7)) if (!weekIsBreak(w)) n++; return n; }
function semPeriod(k){ if (!S.semStart) return null; const b = breakOn(k); if (b) return { kind: b.kind, b, label: breakName(b) };
  if (k < S.semStart) return { kind: "before", label: "Before semester" };
  const w = semWeek(k); return w > S.semWeeks ? { kind: "after", label: "Teaching ended" } : { kind: "teach", week: w, label: `Week ${w}` }; }
function dueText(a){
  const tk = todayKey(); if (!a.due) return ["No due date", ""];
  const d = Math.round((new Date(a.due + "T00:00") - new Date(tk + "T00:00")) / 864e5);
  if (["submitted", "graded"].includes(a.status)) return [`Due ${fmtDate(a.due)}`, "done"];
  if (d < 0) return [`Overdue by ${-d} day${d === -1 ? "" : "s"}`, "over"];
  if (d === 0) return [`Due today${a.time ? " " + fmt12(a.time) : ""}`, "soon"];
  if (d === 1) return [`Due tomorrow${a.time ? " " + fmt12(a.time) : ""}`, "soon"];
  return [`Due ${fmtDate(a.due)}${a.time ? " " + fmt12(a.time) : ""} · in ${d} days`, d <= 7 ? "week" : ""];
}
function inSem(k){ const p = semPeriod(k); return !p || p.kind === "teach"; }
function classesOn(k){ if (!inSem(k)) return []; const wd = keyDow(k);
  const ok = new Set(S.subjects.filter(s => (s.sem || "") === (S.curSem || "") && (!s.cFrom || k >= s.cFrom) && (!s.cTo || k <= s.cTo)).map(s => s.id));
  return S.classes.filter(c => +c.day === wd && ok.has(c.subj)).sort((a, b) => a.start.localeCompare(b.start)); }
document.addEventListener("toggle", e => { if (e.target.classList && e.target.classList.contains("st-sem")) S.semOpen = e.target.open; }, true);
// attendance for one class on one date: "" = going/attended, "absent" = not attending, "cancelled"
const attOf = (c, k) => ((c.att || {})[k]) || "";
function setAtt(id, k, v){ const c = S.classes.find(x => x.id === id); if (!c) return; const att = { ...(c.att || {}) }; if (v) att[k] = v; else delete att[k]; put("classes", id, { ...strip(c), att }); toast(v === "absent" ? "Marked as not attending" : v === "cancelled" ? "Marked as cancelled" : "Marked as attending"); }
function attendance(subjId){ const tk = todayKey(); let from = S.semStart || addDays(tk, -120), held = 0, went = 0;
  for (let k = from; k <= tk; k = addDays(k, 1)) classesOn(k).filter(c => c.subj === subjId && (k < tk || toMin(c.start) <= new Date().getHours() * 60 + new Date().getMinutes())).forEach(c => { const a = attOf(c, k); if (a !== "cancelled") { held++; if (a !== "absent") went++; } });
  return { held, went }; }
const ATT_LBL = { absent: "Not attending", cancelled: "Cancelled" };
function attBtns(c, k){ const a = attOf(c, k), id = esc(c.id);
  return a ? `<span class="att-pill att-${a}">${ATT_LBL[a]}</span><button type="button" class="x small" data-att="${id}|${k}|">Undo</button>` : `<button type="button" class="x small" data-att="${id}|${k}|absent" title="Mark this class as not attending">Not going</button>`; }
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-att]"); if (!b) return; e.preventDefault(); e.stopPropagation(); const [id, k, v] = b.dataset.att.split("|"); setAtt(id, k, v); if (S.scPick) S.scPick = null; }, true);
function nextClass(){
  const now = new Date(), tk = todayKey(), nowM = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < 8; i++) { const k = addDays(tk, i); const cs = classesOn(k).filter(c => (i > 0 || toMin(c.end) > nowM) && !attOf(c, k)); if (cs.length) return { c: cs[0], k, i, live: i === 0 && toMin(cs[0].start) <= nowM }; }
  return null;
}
function subjOptions(sel){ return `<option value="">Choose subject</option>` + S.subjects.map(s => `<option value="${esc(s.id)}" ${s.id === sel ? "selected" : ""}>${esc(s.code ? s.code + " · " : "")}${esc(s.name)}</option>`).join(""); }
function renderStudy(){
  if (S.view !== "study") return;
  const tk = todayKey(), wk = semWeek(tk);
  // ----- timetable
  const N = nextClass();
  const curIds = new Set(curSubjects().map(s => s.id)), curClasses = S.classes.filter(c => curIds.has(c.subj));
  const days = [1,2,3,4,5].concat([6,0].filter(d => curClasses.some(c => +c.day === d)));
  const all = curClasses; let lo = 8 * 60, hi = 18 * 60;
  all.forEach(c => { lo = Math.min(lo, Math.floor(toMin(c.start) / 60) * 60); hi = Math.max(hi, Math.ceil(toMin(c.end) / 60) * 60); });
  const ppm = 0.9, H = (hi - lo) * ppm, todayDow = new Date().getDay();
  const hours = []; for (let m = lo; m < hi; m += 60) hours.push(`<span style="top:${((m - lo) * ppm).toFixed(1)}px">${m === lo ? "" : fmt12(pad(Math.floor(m / 60)) + ":00")}</span>`);
  $("#st-time").innerHTML = `
    <div class="st-top">
      <div class="st-week">${(() => { const p = semPeriod(tk); if (!p) return `<span class="small muted">Set your semester start to see the week number.</span>`;
        if (p.kind === "teach") return `<b>Week ${p.week}</b><span class="muted small"> of ${S.semWeeks}</span>`;
        if (p.kind === "before") return `<b>Semester starts ${esc(fmtDate(S.semStart))}</b>`;
        const nx = (S.semBreaks || []).filter(b => b.from > tk).sort((a, b) => a.from.localeCompare(b.from))[0];
        return `<b>${esc(p.label)}</b><span class="muted small"> · no classes${p.b ? ` until ${esc(fmtDate(p.b.to))}` : ""}${nx ? ` · ${esc(breakName(nx))} starts ${esc(fmtDate(nx.from))}` : ""}</span>`; })()}
        <details class="st-sem" ${S.semOpen ? "open" : ""}><summary class="small">${S.curSem ? esc(S.curSem) + " · " : ""}Semester settings</summary><div class="st-semf"><label class="f" style="grid-column:1/-1">Semester name<input id="st-semname" value="${esc(S.curSem)}" placeholder="e.g. Year 2 Sem 1"></label><label class="f">Starts (week 1 Monday)<input type="date" id="st-semstart" value="${esc(S.semStart)}"></label><label class="f">Teaching weeks<input type="number" min="1" max="30" id="st-semweeks" value="${S.semWeeks}"></label>
          <div class="sb-wrap"><div class="small"><b>Breaks, SWOT VAC & exams</b> <span class="muted">· no classes on these dates</span></div>
          ${(S.semBreaks || []).slice().sort((a, b) => (a.from || "").localeCompare(b.from || "")).map(b => `<div class="sb-row" data-sbid="${esc(b.id)}"><select data-sbf="kind">${BREAK_KINDS.map(([v, l]) => `<option value="${v}" ${b.kind === v ? "selected" : ""}>${l}</option>`).join("")}</select><label class="f">From<input type="date" data-sbf="from" value="${esc(b.from || "")}"></label><label class="f">To<input type="date" data-sbf="to" value="${esc(b.to || "")}"></label><button type="button" class="x" data-sbdel="${esc(b.id)}" aria-label="Remove">✕</button></div>`).join("")}
          <div class="qa-chips cwrap">${BREAK_KINDS.slice(0, 3).map(([v, l]) => `<button type="button" class="qc" data-sbadd="${v}">+ ${l}</button>`).join("")}</div></div></div></details></div>
      <div class="st-next">${N ? `<span class="small muted">${N.live ? "Happening now" : N.i === 0 ? "Next class today" : N.i === 1 ? "Next class tomorrow" : "Next class " + DAYS[keyDow(N.k)]}</span>
        <b><span class="tag ${subjCls(N.c.subj)}">${esc(subjLabel(N.c.subj))}</span> ${esc((subj(N.c.subj) || {}).name || "")}</b>
        <span class="small">${esc((CLS_TYPES.find(x => x[0] === N.c.type) || ["", ""])[1])} · ${fmt12(N.c.start)}–${fmt12(N.c.end)}${clsLoc(N.c) ? " · " + esc(clsLoc(N.c)) : ""}</span>` : `<span class="small muted">${S.classes.length ? (() => { const p = semPeriod(tk); return p && !["teach", "before"].includes(p.kind) ? `No classes during ${esc(p.label)}. Good luck!` : "No classes in the next 7 days."; })() : "No classes this week yet. Add your subjects and classes below."}</span>`}</div>
    </div>
    ${all.length ? `<div class="tt-scroll"><div class="tt" style="--cols:${days.length}">
      <div class="tt-hd"></div>${days.map(d => `<div class="tt-hd ${d === todayDow ? "today" : ""}">${DAYS[d]}</div>`).join("")}
      <div class="sch-times" style="height:${H}px">${hours.join("")}</div>
      ${days.map(d => `<div class="sch-col tt-col ${d === todayDow ? "is-today" : ""}" style="height:${H}px;--hr:${60 * ppm}px">${classesOn(addDays(tk, (d - todayDow + 7) % 7)).map(c => { const top = (toMin(c.start) - lo) * ppm, h = Math.max((toMin(c.end) - toMin(c.start)) * ppm, 24), s = subj(c.subj);
          return `<button type="button" class="ev tt-ev ${subjCls(c.subj)}" style="top:${top}px;height:${h}px;left:2px;width:calc(100% - 4px)" data-cls-edit="${esc(c.id)}" title="${esc(s ? s.name : "")} · ${fmt12(c.start)}–${fmt12(c.end)}"><span class="ev-t">${esc(subjLabel(c.subj))}</span>${h > 34 ? `<span class="ev-s">${esc((CLS_TYPES.find(x => x[0] === c.type) || ["", ""])[1])}${clsLoc(c) ? " · " + esc(clsLoc(c)) : ""}</span>` : ""}${h > 50 ? `<span class="ev-s">${fmt12(c.start)}–${fmt12(c.end)}</span>` : ""}</button>`; }).join("")}</div>`).join("")}
    </div></div>` : ""}`;
  // subjects + class form
  const e = S.stEdit && S.classes.find(c => c.id === S.stEdit);
  const past = S.subjects.filter(s => !isCur(s));
  $("#st-subj").innerHTML = `
    ${curSubjects().length ? `<ul class="subj-list">${curSubjects().map(s => S.subjEdit === s.id ? `<li class="se-li"><form id="subj-edit-form" class="st-form" autocomplete="off"><div class="grid2"><label class="f">Code<input id="se-code" value="${esc(s.code || "")}"></label><label class="f">Name<input id="se-name" value="${esc(s.name)}" required></label><label class="f">Lecturer<input id="se-lect" value="${esc(s.lecturer || "")}"></label><label class="f">Usual location<input id="se-loc" value="${esc(s.location || "")}" placeholder="e.g. Block D, DK3"></label><label class="f">Classes start <span class="muted">(optional)</span><input type="date" id="se-from" value="${esc(s.cFrom || "")}"></label><label class="f">Classes end <span class="muted">(optional)</span><input type="date" id="se-to" value="${esc(s.cTo || "")}"></label></div><p class="small muted" style="margin:0">Only needed if this unit's classes don't run for the whole semester.</p><div class="row"><button class="btn sm primary" type="submit">Save</button><button class="btn sm" type="button" data-subj-cancel>Cancel</button></div></form></li>` : `<li><span class="tag ${subjCls(s.id)}">${esc(s.code || "—")}</span><span class="hl-b" data-subj-edit="${esc(s.id)}" role="button" tabindex="0" title="Edit subject"><b>${esc(s.name)}</b>${s.lecturer ? `<span class="small muted"> · ${esc(s.lecturer)}</span>` : ""}${s.location ? `<span class="small muted"> · ${esc(s.location)}</span>` : ""}<span class="small muted"> · ${S.classes.filter(c => c.subj === s.id).length} class${S.classes.filter(c => c.subj === s.id).length === 1 ? "" : "es"}/week</span>${(() => { const a = attendance(s.id); return a.held ? `<span class="small ${a.went / a.held < 0.8 ? "att-low" : "muted"}"> · attended ${a.went}/${a.held}</span>` : ""; })()}${s.cFrom || s.cTo ? `<span class="small muted"> · classes ${s.cFrom ? esc(fmtDate(s.cFrom)) : "start"}–${s.cTo ? esc(fmtDate(s.cTo)) : "end"}</span>` : ""}</span><button type="button" class="x" data-subj-edit="${esc(s.id)}" aria-label="Edit subject">${SVG(ICON.edit)}</button><button type="button" class="x" data-subj-del="${esc(s.id)}" aria-label="Delete subject">${S.subjDel === s.id ? "Delete?" : "✕"}</button></li>`).join("")}</ul>` : `<p class="small muted" style="margin:0">Start by adding your subjects for this semester.</p>`}
    ${S.subjForm ? `<form id="subj-form" class="st-form" autocomplete="off"><input id="sj-code" class="inp" placeholder="Code, e.g. BIT2023" style="max-width:150px"><input id="sj-name" class="inp" placeholder="Subject name, e.g. Data Mining" required><input id="sj-lect" class="inp" placeholder="Lecturer (optional)"><input id="sj-loc" class="inp" placeholder="Usual location, e.g. Block D, DK3 (optional)"><div class="row"><button class="btn sm primary" type="submit">Add subject</button><button class="btn sm" type="button" data-subj-form="0">Done</button></div></form>`
      : `<button type="button" class="btn sm" data-subj-form="1">+ Add subject</button>`}
    ${past.length ? `<details class="small"><summary>Past semesters (${past.length} subject${past.length === 1 ? "" : "s"})</summary><ul class="subj-list">${past.map(s => `<li><span class="tag ${subjCls(s.id)}">${esc(s.code || "—")}</span><span class="hl-b">${esc(s.name)} <span class="muted">· ${esc(s.sem || "")}${s.grade ? " · " + esc(s.grade) : ""}</span></span><span></span></li>`).join("")}</ul></details>` : ""}
    ${S.subjects.length ? (S.clsForm || e ? `<form id="cls-form" class="st-form" autocomplete="off"><div class="small"><b>${e ? "Edit class" : "Add a weekly class"}</b></div>
      <div class="grid2"><label class="f">Subject<select id="cl-subj">${subjOptions(e ? e.subj : (S.subjects[S.subjects.length - 1] || {}).id)}</select></label>
      <label class="f">Day<select id="cl-day">${[1,2,3,4,5,6,0].map(d => `<option value="${d}" ${e && +e.day === d ? "selected" : ""}>${DAYS[d]}</option>`).join("")}</select></label>
      <label class="f">Starts<input type="time" id="cl-start" value="${e ? e.start : "09:00"}"></label><label class="f">Ends<input type="time" id="cl-end" value="${e ? e.end : "11:00"}"></label></div>
      <div class="qa-chips cwrap">${CLS_TYPES.map(([v, l]) => `<button type="button" class="qc" data-cls-type="${v}" aria-pressed="${(e ? e.type : S.clsType) === v}">${l}</button>`).join("")}</div>
      <input id="cl-room" class="inp" placeholder="${(() => { const l = (subj(e ? e.subj : (S.subjects[S.subjects.length - 1] || {}).id) || {}).location; return l ? "Location (blank = " + esc(l) + ")" : "Location, e.g. DK3, Lab 2 or Zoom link"; })()}" value="${esc(e ? e.room || "" : "")}">
      <div class="row"><button class="btn sm primary" type="submit">${e ? "Save" : "Add class"}</button><button class="btn sm" type="button" data-cls-form="0">Cancel</button>${e ? `<button class="btn sm ghost danger" type="button" data-cls-del="${esc(e.id)}">Delete class</button>` : ""}</div></form>`
      : `<button type="button" class="btn sm primary" data-cls-form="1">+ Add class to timetable</button>`) : ""}`;
  // ----- assignments
  let list = S.asg.slice();
  if (S.asgSubj) list = list.filter(a => a.subj === S.asgSubj);
  if (S.asgFilter === "todo") list = list.filter(a => !["submitted", "graded"].includes(a.status));
  else if (S.asgFilter === "done") list = list.filter(a => ["submitted", "graded"].includes(a.status));
  list.sort((a, b) => (S.asgFilter === "done" ? -1 : 1) * ((a.due || "9999") + (a.time || "")).localeCompare((b.due || "9999") + (b.time || "")));
  const openN = S.asg.filter(a => !["submitted", "graded"].includes(a.status)).length;
  $("#st-asg").innerHTML = `
    ${S.subjects.length ? `<form id="asg-form" class="st-form" autocomplete="off">
      <div class="asg-row1"><select id="as-subj" class="inp">${subjOptions(S.asgSubj || "")}</select><input id="as-title" class="inp" placeholder="Title, e.g. Assignment 2: Clustering report" required></div>
      <div class="qa-chips cwrap">${ASG_TYPES.map(([v, l]) => `<button type="button" class="qc" data-asg-type="${v}" aria-pressed="${S.asgType === v}">${l}</button>`).join("")}</div>
      <div class="asg-row2"><label class="f">Due date<input type="date" id="as-due" data-dhint value="${addDays(tk, 7)}"><span class="dhint"></span></label><label class="f">Time<input type="time" id="as-time" value="23:59"></label><label class="f">Weight %<input type="number" id="as-weight" min="0" max="100" placeholder="e.g. 20"></label><button class="btn primary" type="submit">Add</button></div></form>`
      : `<p class="small muted" style="margin:0">Add your subjects in Timetable first, then track assignments here.</p>`}
    <div class="asg-filter"><div class="seg">${[["todo", `To do (${openN})`], ["done", "Submitted & graded"], ["all", "All"]].map(([v, l]) => `<button type="button" data-asg-f="${v}" aria-pressed="${S.asgFilter === v}">${l}</button>`).join("")}</div>
      ${S.subjects.length > 1 ? `<div class="qa-chips cwrap"><button type="button" class="qc" data-asg-s="" aria-pressed="${!S.asgSubj}">All subjects</button>${S.subjects.map(s => `<button type="button" class="qc ci-${(+s.color || 0) % 6}" data-asg-s="${esc(s.id)}" aria-pressed="${S.asgSubj === s.id}">${esc(s.code || s.name)}</button>`).join("")}</div>` : ""}</div>
    ${list.length ? `<div class="asg-list">${list.map(a => { const [dt, cls] = dueText(a), open = S.asgOpen === a.id;
      if (S.asgEdit === a.id) return asgEditForm(a);
      return `<div class="asg ${cls} st-${esc(a.status)}"><div class="asg-main" data-asg-open="${esc(a.id)}" role="button" tabindex="0">
        <span class="asg-stripe ${subjCls(a.subj)}"></span>
        <div class="asg-body"><div class="asg-t"><b>${esc(a.title)}</b>${a.weight ? `<span class="asg-w">${esc(a.weight)}%</span>` : ""}</div>
          <div class="line"><span class="tag ${subjCls(a.subj)}">${esc(subjLabel(a.subj))}</span><span class="small">${esc((ASG_TYPES.find(x => x[0] === a.type) || ["", ""])[1])}</span><span class="asg-due ${cls}">${esc(dt)}</span>${a.status === "graded" && a.mark !== "" && a.mark != null ? `<span class="asg-mark">${esc(a.mark)}%</span>` : ""}</div></div></div>
        <div class="seg asg-st">${ASG_ST.map(([v, l]) => `<button type="button" data-asg-st="${esc(a.id)}:${v}" aria-pressed="${a.status === v}">${l}</button>`).join("")}</div>
        ${open || a.status === "graded" ? `<div class="asg-more">
          ${a.status === "graded" ? `<label class="f">Mark (%)<input type="number" min="0" max="100" step="0.1" data-asg-mark="${esc(a.id)}" value="${esc(a.mark ?? "")}" placeholder="e.g. 85"></label>` : ""}
          ${open ? asgDetail(a) : `<button type="button" class="btn sm ghost" data-asg-open="${esc(a.id)}">Notes, files & what you learned</button>`}</div>` : ""}</div>`; }).join("")}</div>`
      : `<div class="empty">${S.asgFilter === "todo" ? "Nothing due. Nice!" : "No assignments here yet."}</div>`}`;
  renderNotes(); renderPortfolio(); renderStudyCal(); dateHints();
  // ----- grades
  const rows = curSubjects().map(s => { const gr = GRADES.find(g => g[0] === s.grade); const cr = +s.credits || 0;
    const ga = S.asg.filter(a => a.subj === s.id && a.status === "graded" && a.mark !== "" && a.mark != null && +a.weight);
    const wSum = ga.reduce((x, a) => x + +a.weight, 0), score = wSum ? ga.reduce((x, a) => x + (+a.mark) * (+a.weight), 0) / wSum : null;
    return { s, gr, cr, score, wSum }; });
  const counted = rows.filter(r => r.gr && r.cr), cr = counted.reduce((a, r) => a + r.cr, 0), pts = counted.reduce((a, r) => a + r.cr * r.gr[1], 0);
  const gpa = cr ? pts / cr : null, pc = parseFloat(S.prevCgpa), pcr = parseFloat(S.prevCredits);
  const pastG = S.subjects.filter(s => !isCur(s)).map(s => [GRADES.find(g => g[0] === s.grade), +s.credits || 0]).filter(([g, c]) => g && c);
  const pastCr = pastG.reduce((a, [, c]) => a + c, 0), pastPts = pastG.reduce((a, [g, c]) => a + g[1] * c, 0);
  const allCr = cr + pastCr + (pc >= 0 && pcr > 0 ? pcr : 0), allPts = pts + pastPts + (pc >= 0 && pcr > 0 ? pc * pcr : 0);
  const cgpa = allCr ? allPts / allCr : null;
  $("#st-grades").innerHTML = S.subjects.length ? `
    <div class="m-sum"><div><span class="small muted">This semester GPA</span><b>${gpa !== null ? gpa.toFixed(2) : "–"}</b><span class="small muted">${cr} credit${cr === 1 ? "" : "s"} graded</span></div>
      <div><span class="small muted">CGPA</span><b>${cgpa !== null ? cgpa.toFixed(2) : "–"}</b><span class="small muted">${allCr} credits in total${pastCr ? ` (incl. ${pastCr} from past semesters here)` : ""}</span></div></div>
    <div class="tbl-wrap"><table class="ovt gr-t"><tr><th>Subject</th><th>Credits</th><th>Grade</th><th>Coursework so far</th></tr>
      ${rows.map(r => `<tr><td><span class="tag ${subjCls(r.s.id)}">${esc(r.s.code || "—")}</span> ${esc(r.s.name)}</td>
        <td><input type="number" min="0" max="12" class="gr-in" data-sj-cr="${esc(r.s.id)}" value="${esc(r.s.credits ?? "")}" placeholder="3"></td>
        <td><select class="gr-in" data-sj-gr="${esc(r.s.id)}"><option value="">–</option>${GRADES.map(([g]) => `<option ${r.s.grade === g ? "selected" : ""}>${g}</option>`).join("")}</select></td>
        <td>${r.score !== null ? `<b>${r.score.toFixed(1)}%</b> <span class="small muted">of ${r.wSum}% graded</span>` : `<span class="small muted">–</span>`}</td></tr>`).join("")}</table></div>
    <p class="small muted" style="margin:0">Results from before you used Daybook:</p><div class="grid2"><label class="f">Previous CGPA<input type="number" step="0.01" min="0" max="4" id="st-pcgpa" value="${esc(S.prevCgpa)}" placeholder="e.g. 3.45"></label><label class="f">Previous credits completed<input type="number" min="0" id="st-pcr" value="${esc(S.prevCredits)}" placeholder="e.g. 60"></label></div>
    <p class="small muted" style="margin:0">Uses the common 4.00 scale (A 4.00, A- 3.67, B+ 3.33 … F 0). Check your university's scale if it differs. Coursework is worked out from graded assignments with a weight.</p>`
    : `<p class="small muted" style="margin:0">Add subjects in Timetable to work out your GPA.</p>`;
}
// Today card: classes today + assignments due soon
function studyTodayHtml(){
  if (!S.subjects.length && !S.asg.length) return "";
  const tk = todayKey(), nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const cs = classesOn(tk), due = S.asg.filter(a => !["submitted", "graded"].includes(a.status) && a.due && a.due <= addDays(tk, 3)).sort((a, b) => (a.due + (a.time || "")).localeCompare(b.due + (b.time || "")));
  const per = semPeriod(tk), brk = per && per.kind !== "teach" && per.kind !== "before" ? `<p class="small" style="margin:0"><b>${esc(per.label)}</b> <span class="muted">· no classes today</span></p>` : "";
  if (!cs.length && !due.length) return brk || `<p class="small muted" style="margin:0">No classes today and nothing due in the next 3 days.</p>`;
  return `${brk}${cs.length ? `<ul class="hlist">${cs.map(c => `<li class="${toMin(c.end) < nowM ? "past" : ""} ${attOf(c, tk) ? "att-off" : ""}"><span class="hl-t">${fmt12(c.start)}</span><span class="tag ${subjCls(c.subj)}">${esc(subjLabel(c.subj))}</span><span class="hl-b">${esc((CLS_TYPES.find(x => x[0] === c.type) || ["", ""])[1])}${clsLoc(c) ? " · " + esc(clsLoc(c)) : ""}</span><span class="hl-act">${attBtns(c, tk)}</span></li>`).join("")}</ul>` : ""}
    ${due.length ? `<div class="small muted" style="margin-top:4px">Due soon</div><ul class="hlist">${due.map(a => { const [dt, cls] = dueText(a); return `<li><span class="tag ${subjCls(a.subj)}">${esc(subjLabel(a.subj))}</span><span class="hl-b">${esc(a.title)}</span><span class="asg-due ${cls} small">${esc(dt.replace(/ · in \d+ days/, ""))}</span><span></span></li>`; }).join("")}</ul>` : ""}`;
}
let studyNotesT = null;
document.addEventListener("click", e => {
  if (S.view !== "study") return;
  const t = e.target.closest("button,[data-asg-open]"); if (!t || !t.closest("#v-study")) return;
  const d = t.dataset;
  if (d.subjForm !== undefined) { S.subjForm = d.subjForm === "1"; renderStudy(); if (S.subjForm) $("#sj-code").focus(); }
  else if (d.subjDel) { if (S.subjDel !== d.subjDel) { S.subjDel = d.subjDel; renderStudy(); } else { const id = d.subjDel; S.subjDel = null; batchColl("classes", S.classes.filter(c => c.subj === id).map(c => ["delete", c.id])); del("subjects", id); toast("Subject deleted"); } }
  else if (d.clsForm !== undefined) { S.clsForm = d.clsForm === "1"; S.stEdit = null; renderStudy(); }
  else if (d.clsType) { S.clsType = d.clsType; t.parentElement.querySelectorAll("[data-cls-type]").forEach(b => b.setAttribute("aria-pressed", b === t)); }
  else if (d.clsEdit) { S.stEdit = d.clsEdit; S.clsForm = true; const c = S.classes.find(x => x.id === d.clsEdit); if (c) S.clsType = c.type; renderStudy(); $("#cls-form") && $("#cls-form").scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  else if (d.clsDel) { del("classes", d.clsDel); S.stEdit = null; S.clsForm = false; toast("Class removed"); }
  else if (d.asgType) { S.asgType = d.asgType; t.parentElement.querySelectorAll("[data-asg-type]").forEach(b => b.setAttribute("aria-pressed", b === t)); }
  else if (d.asgF) { S.asgFilter = d.asgF; renderStudy(); }
  else if (d.asgS !== undefined) { S.asgSubj = d.asgS; renderStudy(); }
  else if (d.asgOpen) { S.asgOpen = S.asgOpen === d.asgOpen ? null : d.asgOpen; renderStudy(); }
  else if (d.asgSt) { const [id, st] = d.asgSt.split(":"); const a = S.asg.find(x => x.id === id); if (a) { put("assignments", id, { ...strip(a), status: st, doneAt: ["submitted", "graded"].includes(st) ? (a.doneAt || nowISO()) : "" }); if (st === "submitted" || st === "graded") { S.asgOpen = id; toast(st === "submitted" ? "Submitted. Well done! Add what you learned for your portfolio." : "Graded. Add your mark and what you learned."); } } }
  else if (d.asgDel) { if (S.asgDel !== d.asgDel) { S.asgDel = d.asgDel; renderStudy(); } else { del("assignments", d.asgDel); S.asgDel = null; S.asgOpen = null; } }
});
document.addEventListener("keydown", e => { const m = e.target.closest && e.target.closest("[data-asg-open]"); if (m && (e.key === "Enter" || e.key === " ") && e.target === m) { e.preventDefault(); m.click(); } });
document.addEventListener("submit", e => {
  const f = e.target; if (!f.closest || !f.closest("#v-study")) return; e.preventDefault();
  if (f.id === "subj-form") { const n = $("#sj-name").value.trim(); if (!n) return;
    put("subjects", newId(), { sem: S.curSem || "", code: $("#sj-code").value.trim().toUpperCase(), name: n, lecturer: $("#sj-lect").value.trim(), location: $("#sj-loc").value.trim(), color: S.subjects.length % 6, credits: "", grade: "", createdAt: nowISO() });
    toast("Subject added"); setTimeout(() => { if ($("#sj-code")) { $("#sj-code").value = ""; $("#sj-name").value = ""; $("#sj-lect").value = ""; $("#sj-loc").value = ""; $("#sj-code").focus(); } }, 50); }
  else if (f.id === "cls-form") { const sj = $("#cl-subj").value; if (!sj) { toast("Choose a subject"); return; }
    const st = $("#cl-start").value, en = $("#cl-end").value; if (!st || !en || en <= st) { toast("End time must be after start time"); return; }
    const rec = { subj: sj, day: +$("#cl-day").value, start: st, end: en, type: S.clsType, room: $("#cl-room").value.trim() };
    put("classes", S.stEdit || newId(), rec); toast(S.stEdit ? "Class updated" : "Class added"); S.stEdit = null; }
  else if (f.id === "asg-form") { const ti = $("#as-title").value.trim(), sj = $("#as-subj").value; if (!ti) return; if (!sj) { toast("Choose a subject"); return; }
    put("assignments", newId(), { subj: sj, title: ti, type: S.asgType, due: $("#as-due").value, time: $("#as-time").value, weight: $("#as-weight").value ? +$("#as-weight").value : "", status: "todo", mark: "", notes: "", link: "", createdAt: nowISO(), doneAt: "" });
    toast("Added"); }
});
document.addEventListener("change", e => {
  const t = e.target; if (!t.closest || !t.closest("#v-study")) return;
  if (t.dataset && t.dataset.sbf) { const id = t.closest("[data-sbid]").dataset.sbid; S.semBreaks = (S.semBreaks || []).map(b => b.id === id ? { ...b, [t.dataset.sbf]: t.value } : b); const b = S.semBreaks.find(x => x.id === id); if (b && b.from && b.to && b.to < b.from) { b.to = b.from; } saveCats(); renderStudy(); return; }
  if (t.id === "st-semstart") { S.semStart = t.value; saveCats(); renderStudy(); }
  else if (t.id === "st-semweeks") { S.semWeeks = Math.max(1, +t.value || 14); saveCats(); renderStudy(); }
  else if (t.id === "st-pcgpa") { S.prevCgpa = t.value; saveCats(); renderStudy(); }
  else if (t.id === "st-pcr") { S.prevCredits = t.value; saveCats(); renderStudy(); }
  else if (t.dataset.sjCr) { const s = subj(t.dataset.sjCr); if (s) put("subjects", s.id, { ...strip(s), credits: t.value === "" ? "" : +t.value }); }
  else if (t.dataset.sjGr) { const s = subj(t.dataset.sjGr); if (s) put("subjects", s.id, { ...strip(s), grade: t.value }); }
  else if (t.dataset.asgMark) { const a = S.asg.find(x => x.id === t.dataset.asgMark); if (a) put("assignments", a.id, { ...strip(a), mark: t.value === "" ? "" : +t.value }); }
  else if (t.dataset.asgNotes) { const a = S.asg.find(x => x.id === t.dataset.asgNotes); if (a) put("assignments", a.id, { ...strip(a), notes: t.value }); }
  else if (t.dataset.asgLink) { const a = S.asg.find(x => x.id === t.dataset.asgLink); if (a) put("assignments", a.id, { ...strip(a), link: t.value.trim() }); }
});

// ---------- Study notes & resources, links on assignments, portfolio
S.snotes = []; S.curSem = ""; S.noteSubj = ""; S.noteKind = "note"; S.noteTag = "lecture"; S.noteEdit = null; S.noteOpen = null; S.noteDel = null;
S.pfSubj = ""; S.pfSkill = ""; S.pfOpen = null;
const NOTE_TAGS = [["lecture","Lecture notes"],["summary","Summary"],["formula","Formulas"],["tutorial","Tutorial"],["pastpaper","Past paper"],["slides","Slides"],["reading","Reading"],["tips","Tips"],["other","Other"]];
const isCur = s => (s.sem || "") === (S.curSem || "");
const curSubjects = () => S.subjects.filter(isCur);
const linkUrl = u => /^https?:\/\//i.test(u) ? u : "https://" + u;
const hostOf = u => { try { return new URL(linkUrl(u)).hostname.replace(/^www\./, ""); } catch { return u; } };
function asgLinks(a){ const L = (a.links || []).slice(); if (a.link && !L.some(l => l.url === a.link)) L.unshift({ url: a.link, label: "" }); return L; }
function linksEditor(kind, id, links){
  return `<div class="f lk"><span class="small muted" style="font-weight:600">Files & links <span style="font-weight:400">· Google Drive, OneDrive, slides, briefs, submissions</span></span>
    ${links.length ? `<ul class="links">${links.map((l, i) => `<li>${SVG(ICON.link)}<a href="${esc(linkUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label || hostOf(l.url))}</a><button type="button" class="x" data-link-del="${kind}:${esc(id)}:${i}" aria-label="Remove link">✕</button></li>`).join("")}</ul>` : ""}
    <div class="qrow rwrap"><input class="inp" data-link-url="${kind}:${esc(id)}" placeholder="Paste a link" inputmode="url"><input class="inp" data-link-label="${kind}:${esc(id)}" placeholder="Name (optional)" style="max-width:170px"><button class="btn sm" type="button" data-link-add="${kind}:${esc(id)}">Add link</button></div></div>`;
}
function asgDetail(a){
  const done = ["submitted", "graded"].includes(a.status);
  return `${done ? `<div class="pf-prompt"><label class="f">What did you learn? <span class="muted" style="font-weight:400">· saved to your Portfolio</span><textarea data-asg-learned="${esc(a.id)}" rows="3" placeholder="Key takeaways, what was hard, what you'd do differently, what you're proud of">${esc(a.learned || "")}</textarea></label>
      <label class="f">Skills used <span class="muted" style="font-weight:400">· separate with commas</span><input data-asg-skills="${esc(a.id)}" value="${esc((a.skills || []).join(", "))}" placeholder="e.g. SQL, k-means clustering, report writing, teamwork"></label></div>` : ""}
    <label class="f">Notes<textarea data-asg-notes="${esc(a.id)}" rows="4" placeholder="Requirements, rubric, group members, approach, feedback from lecturer…">${esc(a.notes || "")}</textarea></label>
    ${linksEditor("asg", a.id, asgLinks(a))}
    <div class="row"><button type="button" class="btn sm" data-asg-edit="${esc(a.id)}">${SVG(ICON.edit)}Edit details</button><button type="button" class="btn sm ghost danger" data-asg-del="${esc(a.id)}">${S.asgDel === a.id ? "Tap again to delete" : "Delete"}</button></div>`;
}
// ----- edit an assignment
S.asgEdit = null; S.asgEType = "assignment";
function asgEditForm(a){
  return `<form class="asg asg-editing st-form" id="asg-edit-form" data-id="${esc(a.id)}" autocomplete="off">
    <div class="small"><b>Edit</b></div>
    <div class="asg-row1"><select id="ae-subj" class="inp">${subjOptions(a.subj)}</select><input id="ae-title" class="inp" value="${esc(a.title)}" required></div>
    <div class="qa-chips cwrap">${ASG_TYPES.map(([v, l]) => `<button type="button" class="qc" data-asge-type="${v}" aria-pressed="${S.asgEType === v}">${l}</button>`).join("")}</div>
    <div class="asg-row2"><label class="f">Due date<input type="date" id="ae-due" data-dhint value="${esc(a.due || "")}"><span class="dhint"></span></label><label class="f">Time<input type="time" id="ae-time" value="${esc(a.time || "")}"></label><label class="f">Weight %<input type="number" id="ae-weight" min="0" max="100" value="${esc(a.weight ?? "")}"></label></div>
    <div class="row"><button class="btn sm primary" type="submit">Save</button><button class="btn sm" type="button" data-asg-edit-x>Cancel</button></div></form>`;
}
document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("[data-asg-edit],[data-asg-edit-x],[data-asge-type],[data-dswap]"); if (!t || !t.closest("#v-study")) return;
  const d = t.dataset;
  if (d.asgEdit) { const a = S.asg.find(x => x.id === d.asgEdit); if (!a) return; S.asgEdit = a.id; S.asgEType = a.type || "assignment"; renderStudy(); dateHints(); $("#ae-title") && $("#ae-title").focus(); }
  else if (d.asgEditX !== undefined) { S.asgEdit = null; renderStudy(); dateHints(); }
  else if (d.asgeType) { S.asgEType = d.asgeType; t.parentElement.querySelectorAll("[data-asge-type]").forEach(b => b.setAttribute("aria-pressed", b === t)); }
  else if (d.dswap) { const inp = t.closest("label").querySelector("input[type=date]"); inp.value = d.dswap; dateHint(inp); }
});
document.addEventListener("submit", e => {
  if (e.target.id !== "asg-edit-form") return; e.preventDefault();
  const a = S.asg.find(x => x.id === e.target.dataset.id), ti = $("#ae-title").value.trim(); if (!a || !ti) return;
  put("assignments", a.id, { ...strip(a), subj: $("#ae-subj").value || a.subj, title: ti, type: S.asgEType, due: $("#ae-due").value, time: $("#ae-time").value, weight: $("#ae-weight").value ? +$("#ae-weight").value : "" });
  S.asgEdit = null; toast("Assignment updated");
}, true);
// ----- readable due date under date boxes, and a fix when day and month were typed the other way round
function dateHint(inp){
  const h = (inp.closest("label") || inp.parentElement).querySelector(".dhint"); if (!h) return;
  const v = inp.value, tk = todayKey(); if (!v) { h.innerHTML = ""; return; }
  const [y, m, dd] = v.split("-").map(Number), sw = m !== dd && dd <= 12 ? `${y}-${pad(dd)}-${pad(m)}` : null;
  const past = v < tk, swapOk = sw && sw >= tk && (!past || true);
  h.innerHTML = `<span class="${past ? "dh-past" : ""}">${esc(fmtDate(v))} ${y}${past ? " · in the past" : ""}</span>${past && swapOk ? ` <button type="button" class="linkbtn" data-dswap="${sw}">Did you mean ${esc(fmtDate(sw))}?</button>` : ""}`;
}
function dateHints(){ document.querySelectorAll("#v-study input[data-dhint]").forEach(dateHint); }
document.addEventListener("input", e => { if (e.target.matches && e.target.matches("input[data-dhint]")) dateHint(e.target); });
document.addEventListener("change", e => { if (e.target.matches && e.target.matches("input[data-dhint]")) dateHint(e.target); });
// ----- notes subtab
function renderNotes(){
  const box = $("#st-notes"); if (!box) return;
  const subs = S.subjects;
  if (!subs.length) { box.innerHTML = `<p class="small muted" style="margin:0">Add your subjects in Timetable first, then keep notes and resources for each one here.</p>`; return; }
  if (S.noteSubj && !subj(S.noteSubj)) S.noteSubj = "";
  const list = S.snotes.filter(n => !S.noteSubj || n.subj === S.noteSubj).sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""));
  const ed = S.noteEdit && S.snotes.find(n => n.id === S.noteEdit);
  const kind = ed ? ed.kind : S.noteKind, tag = ed ? ed.tag : S.noteTag;
  const asgFor = S.noteSubj ? S.asg.filter(a => a.subj === S.noteSubj && (a.notes || asgLinks(a).length)) : [];
  box.innerHTML = `
    <div class="qa-chips cwrap"><button type="button" class="qc" data-note-subj="" aria-pressed="${!S.noteSubj}">All subjects</button>${[...curSubjects(), ...subs.filter(s => !isCur(s))].map(s => `<button type="button" class="qc ci-${(+s.color || 0) % 6}" data-note-subj="${esc(s.id)}" aria-pressed="${S.noteSubj === s.id}">${esc(s.code || s.name)}${isCur(s) ? "" : ` <span class="muted">· ${esc(s.sem || "past")}</span>`}</button>`).join("")}</div>
    <form id="note-form" class="st-form" autocomplete="off">
      <div class="row"><div class="seg">${[["note","Note"],["link","Link / file"]].map(([v, l]) => `<button type="button" data-note-kind="${v}" aria-pressed="${kind === v}">${l}</button>`).join("")}</div>
        <select id="nt-subj" class="inp" style="max-width:240px">${subjOptions(ed ? ed.subj : S.noteSubj || (curSubjects()[0] || subs[0]).id)}</select></div>
      <input id="nt-title" class="inp" placeholder="${kind === "link" ? "Name, e.g. Week 5 slides, Lab sheet 3" : "Title, e.g. Week 5: Decision trees"}" value="${esc(ed ? ed.title : "")}" required>
      ${kind === "link" ? `<input id="nt-url" class="inp" inputmode="url" placeholder="Paste the link (Google Drive, OneDrive, Canva, YouTube, LMS…)" value="${esc(ed ? ed.url || "" : "")}">` : ""}
      <textarea id="nt-body" class="inp" rows="${kind === "link" ? 2 : 6}" placeholder="${kind === "link" ? "What's in it? (optional)" : "Your notes: key points, definitions, examples, questions to ask…"}">${esc(ed ? ed.body || "" : "")}</textarea>
      <div class="qa-chips cwrap">${NOTE_TAGS.map(([v, l]) => `<button type="button" class="qc" data-note-tag="${v}" aria-pressed="${tag === v}">${l}</button>`).join("")}</div>
      <div class="row"><button class="btn sm primary" type="submit">${ed ? "Save changes" : kind === "link" ? "Save link" : "Save note"}</button>${ed ? `<button class="btn sm" type="button" data-note-cancel>Cancel</button>` : ""}</div>
    </form>
    ${list.length ? `<div class="notes">${list.map(n => { const open = S.noteOpen === n.id, long = (n.body || "").length > 220;
      return `<article class="note ${n.kind === "link" ? "is-link" : ""}"><div class="nt-top"><span class="tag ${subjCls(n.subj)}">${esc(subjLabel(n.subj))}</span><span class="hl-tag">${esc((NOTE_TAGS.find(t => t[0] === n.tag) || ["", "Note"])[1])}</span><span class="small muted">${esc(fmtDate(isoDay(n.updatedAt || n.createdAt)))}</span></div>
        <h4>${n.kind === "link" ? `${SVG(ICON.link)}<a href="${esc(linkUrl(n.url || ""))}" target="_blank" rel="noopener">${esc(n.title)}</a> <span class="small muted">${esc(hostOf(n.url || ""))}</span>` : esc(n.title)}</h4>
        ${n.body ? `<div class="nt-body ${open || !long ? "" : "clip"}">${esc(n.body)}</div>${long ? `<button type="button" class="btn sm ghost" data-note-open="${esc(n.id)}">${open ? "Show less" : "Read more"}</button>` : ""}` : ""}
        <div class="nt-act"><button type="button" class="btn sm ghost" data-note-edit="${esc(n.id)}">Edit</button><button type="button" class="btn sm ghost danger" data-note-del="${esc(n.id)}">${S.noteDel === n.id ? "Tap again to delete" : "Delete"}</button></div></article>`; }).join("")}</div>`
      : `<p class="empty" style="margin:0">No notes${S.noteSubj ? " for this subject" : ""} yet.</p>`}
    ${asgFor.length ? `<div class="small muted" style="margin-top:6px">From this subject's assignments</div><div class="notes">${asgFor.map(a => `<article class="note"><div class="nt-top"><span class="hl-tag">${esc((ASG_TYPES.find(x => x[0] === a.type) || ["", ""])[1])}</span><b>${esc(a.title)}</b></div>${a.notes ? `<div class="nt-body clip">${esc(a.notes)}</div>` : ""}${asgLinks(a).length ? `<ul class="links">${asgLinks(a).map(l => `<li>${SVG(ICON.link)}<a href="${esc(linkUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label || hostOf(l.url))}</a><span></span></li>`).join("")}</ul>` : ""}</article>`).join("")}</div>` : ""}`;
}
// ----- portfolio subtab
function pfItems(){ return S.asg.filter(a => ["submitted", "graded"].includes(a.status)).sort((a, b) => (b.doneAt || b.due || "").localeCompare(a.doneAt || a.due || "")); }
function renderPortfolio(){
  const box = $("#st-pf"); if (!box) return;
  let items = pfItems();
  const skills = {}; items.forEach(a => (a.skills || []).forEach(s => { const k = s.trim(); if (k) skills[k] = (skills[k] || 0) + 1; }));
  if (S.pfSubj) items = items.filter(a => a.subj === S.pfSubj);
  if (S.pfSkill) items = items.filter(a => (a.skills || []).some(s => s.trim().toLowerCase() === S.pfSkill.toLowerCase()));
  const marks = pfItems().filter(a => a.status === "graded" && a.mark !== "" && a.mark != null).map(a => +a.mark);
  const withLearn = pfItems().filter(a => (a.learned || "").trim()).length;
  const bySem = {}; items.forEach(a => { const s = subj(a.subj); const k = (s && s.sem) || "Earlier work"; (bySem[k] = bySem[k] || []).push(a); });
  const semKeys = Object.keys(bySem).sort((a, b) => (b === S.curSem) - (a === S.curSem) || b.localeCompare(a));
  box.innerHTML = !pfItems().length ? `<p class="small muted" style="margin:0">When you mark an assignment <b>Submitted</b> or <b>Graded</b>, it's saved here with what you learned and the skills you used, so you can look back before exams and interviews.</p>` : `
    <div class="minis"><div class="mini"><span>Completed</span><b>${pfItems().length}</b><small>assignments, tests & projects</small></div>
      <div class="mini"><span>Average mark</span><b>${marks.length ? (marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(1) + "%" : "–"}</b><small>${marks.length} graded</small></div>
      <div class="mini"><span>Reflections</span><b>${withLearn}/${pfItems().length}</b><small>${withLearn < pfItems().length ? "add what you learned" : "all written"}</small></div></div>
    ${Object.keys(skills).length ? `<div class="pf-skills"><span class="small muted">Skills:</span><button type="button" class="qc" data-pf-skill="" aria-pressed="${!S.pfSkill}">All</button>${Object.entries(skills).sort((a, b) => b[1] - a[1]).map(([s, n]) => `<button type="button" class="qc" data-pf-skill="${esc(s)}" aria-pressed="${S.pfSkill.toLowerCase() === s.toLowerCase()}">${esc(s)} <span class="muted">${n}</span></button>`).join("")}</div>` : ""}
    <div class="qa-chips cwrap"><button type="button" class="qc" data-pf-subj="" aria-pressed="${!S.pfSubj}">All subjects</button>${S.subjects.filter(s => pfItems().some(a => a.subj === s.id)).map(s => `<button type="button" class="qc ci-${(+s.color || 0) % 6}" data-pf-subj="${esc(s.id)}" aria-pressed="${S.pfSubj === s.id}">${esc(s.code || s.name)}</button>`).join("")}</div>
    <div class="row"><button class="btn sm" type="button" data-pf-export="word">${SVG(ICON.download)}Download Word</button><button class="btn sm" type="button" data-pf-export="pdf">Save as PDF</button><span class="small muted">Exports what's shown with the current filters.</span></div>
    ${semKeys.map(sk => `<section class="pf-sem"><h3>${esc(sk)}${sk === S.curSem ? ` <span class="small muted">· current semester</span>` : ""}</h3>
      ${bySem[sk].map(a => { const open = S.pfOpen === a.id, L = asgLinks(a);
        return `<article class="pf-item ${subjCls(a.subj)}"><div class="pf-top" data-pf-open="${esc(a.id)}" role="button" tabindex="0">
          <div><b>${esc(a.title)}</b><div class="line small"><span class="tag ${subjCls(a.subj)}">${esc(subjLabel(a.subj))}</span><span>${esc((ASG_TYPES.find(x => x[0] === a.type) || ["", ""])[1])}</span><span class="muted">${esc(fmtDate(isoDay(a.doneAt) || a.due || ""))}</span>${a.weight ? `<span class="muted">${esc(a.weight)}%</span>` : ""}</div></div>
          ${a.status === "graded" && a.mark !== "" && a.mark != null ? `<span class="asg-mark">${esc(a.mark)}%</span>` : `<span class="small muted">Submitted</span>`}</div>
          ${(a.learned || "").trim() ? `<div class="pf-learn ${open ? "" : "clip"}"><span class="small muted">What I learned</span>${esc(a.learned)}</div>` : `<button type="button" class="btn sm ghost" data-pf-write="${esc(a.id)}">+ Add what you learned</button>`}
          ${(a.skills || []).length ? `<div class="pf-tags">${a.skills.map(s => `<span class="feel-pill">${esc(s)}</span>`).join("")}</div>` : ""}
          ${open ? `${a.notes ? `<div class="pf-notes"><span class="small muted">Notes</span>${esc(a.notes)}</div>` : ""}${L.length ? `<ul class="links">${L.map(l => `<li>${SVG(ICON.link)}<a href="${esc(linkUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label || hostOf(l.url))}</a><span></span></li>`).join("")}</ul>` : ""}` : (a.notes || L.length ? `<button type="button" class="btn sm ghost" data-pf-open="${esc(a.id)}">Show notes & files</button>` : "")}
        </article>`; }).join("")}</section>`).join("")}`;
}
function portfolioHTML(){
  let items = pfItems(); if (S.pfSubj) items = items.filter(a => a.subj === S.pfSubj); if (S.pfSkill) items = items.filter(a => (a.skills || []).some(s => s.trim().toLowerCase() === S.pfSkill.toLowerCase()));
  const bySem = {}; items.forEach(a => { const s = subj(a.subj); const k = (s && s.sem) || "Earlier work"; (bySem[k] = bySem[k] || []).push(a); });
  const head = `<h1>Academic Portfolio</h1><p class="who">${esc([S.name, S.org].filter(Boolean).join(" · "))}${S.name || S.org ? "<br>" : ""}${items.length} piece${items.length === 1 ? "" : "s"} of work${S.pfSkill ? " · skill: " + esc(S.pfSkill) : ""}</p>`;
  const body = Object.keys(bySem).sort().reverse().map(k => `<h2 class="xw">${esc(k)}</h2>` + bySem[k].map(a => { const s = subj(a.subj);
    return `<div class="xd"><h3>${esc(a.title)}${a.status === "graded" && a.mark !== "" && a.mark != null ? ` <span class="xm">${esc(a.mark)}%</span>` : ""}</h3>
      <p class="xf">${esc([s ? (s.code ? s.code + " " : "") + s.name : "", (ASG_TYPES.find(x => x[0] === a.type) || ["", ""])[1], a.weight ? a.weight + "% weight" : "", fmtDate(isoDay(a.doneAt) || a.due || "")].filter(Boolean).join(" · "))}</p>
      ${(a.learned || "").trim() ? `<p class="xf"><b>What I learned:</b> ${esc(a.learned.trim()).replace(/\n/g, "<br>")}</p>` : ""}
      ${(a.skills || []).length ? `<p class="xf"><b>Skills:</b> ${a.skills.map(esc).join(", ")}</p>` : ""}
      ${a.notes ? `<p class="xf"><b>Notes:</b> ${esc(a.notes).replace(/\n/g, "<br>")}</p>` : ""}
      ${asgLinks(a).length ? `<p class="xf"><b>Files:</b> ${asgLinks(a).map(l => `<a href="${esc(linkUrl(l.url))}">${esc(l.label || hostOf(l.url))}</a>`).join(" · ")}</p>` : ""}</div>`; }).join("")).join("");
  return { title: "Academic Portfolio", html: head + (body || `<p class="none">Nothing to export.</p>`) };
}
function linkTarget(spec){ const [kind, id] = spec.split(":"); return kind === "asg" ? S.asg.find(x => x.id === id) : null; }
document.addEventListener("click", e => {
  if (S.view !== "study") return;
  const t = e.target.closest("button,[data-pf-open]"); if (!t || !t.closest("#v-study")) return;
  const d = t.dataset;
  if (d.linkAdd) { const a = linkTarget(d.linkAdd); if (!a) return; const u = (document.querySelector(`[data-link-url="${d.linkAdd}"]`).value || "").trim(); if (!u) return;
    const L = asgLinks(a); L.push({ url: u, label: (document.querySelector(`[data-link-label="${d.linkAdd}"]`).value || "").trim() }); put("assignments", a.id, { ...strip(a), links: L, link: "" }); toast("Link added"); }
  else if (d.linkDel) { const [k, id, i] = d.linkDel.split(":"); const a = linkTarget(k + ":" + id); if (!a) return; const L = asgLinks(a); L.splice(+i, 1); put("assignments", a.id, { ...strip(a), links: L, link: "" }); }
  else if (d.noteSubj !== undefined) { S.noteSubj = d.noteSubj; renderNotes(); }
  else if (d.noteKind) { if (S.noteEdit) return; S.noteKind = d.noteKind; renderNotes(); $("#nt-title").focus(); }
  else if (d.noteTag) { if (S.noteEdit) { const n = S.snotes.find(x => x.id === S.noteEdit); if (n) n.tag = d.noteTag; } S.noteTag = d.noteTag; t.parentElement.querySelectorAll("[data-note-tag]").forEach(b => b.setAttribute("aria-pressed", b === t)); }
  else if (d.noteOpen) { S.noteOpen = S.noteOpen === d.noteOpen ? null : d.noteOpen; renderNotes(); }
  else if (d.noteEdit) { S.noteEdit = d.noteEdit; renderNotes(); $("#note-form").scrollIntoView({ block: "nearest", behavior: "smooth" }); $("#nt-title").focus(); }
  else if (d.noteCancel !== undefined) { S.noteEdit = null; renderNotes(); }
  else if (d.noteDel) { if (S.noteDel !== d.noteDel) { S.noteDel = d.noteDel; renderNotes(); } else { del("snotes", d.noteDel); S.noteDel = null; toast("Deleted"); } }
  else if (d.pfOpen) { S.pfOpen = S.pfOpen === d.pfOpen ? null : d.pfOpen; renderPortfolio(); }
  else if (d.pfSubj !== undefined) { S.pfSubj = d.pfSubj; renderPortfolio(); }
  else if (d.pfSkill !== undefined) { S.pfSkill = d.pfSkill; renderPortfolio(); }
  else if (d.pfWrite) { S.asgOpen = d.pfWrite; S.asgFilter = "done"; location.hash = "#study-assignments"; setTimeout(() => { const el = document.querySelector(`[data-asg-learned="${d.pfWrite}"]`); if (el) { el.scrollIntoView({ block: "center" }); el.focus(); } }, 120); }
  else if (d.pfExport) { const X = portfolioHTML();
    if (d.pfExport === "word") { const doc = `<html><head><meta charset="utf-8"><title>${esc(X.title)}</title><style>${EXPORT_CSS}</style></head><body>${X.html}</body></html>`; const url = URL.createObjectURL(new Blob(["﻿", doc], { type: "application/msword" })); const el = document.createElement("a"); el.href = url; el.download = "Academic-Portfolio.doc"; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast("Word file downloaded"); }
    else { $("#print-area").innerHTML = `<style>${EXPORT_CSS.replace(/body\{/, "#print-area{")}</style>${X.html}`; document.body.classList.add("printing-export"); const t0 = document.title; document.title = X.title; setTimeout(() => { window.print(); setTimeout(() => { document.body.classList.remove("printing-export"); document.title = t0; }, 600); }, 80); } }
});
document.addEventListener("keydown", e => { const m = e.target.closest && e.target.closest("[data-pf-open]"); if (m && m.getAttribute("role") === "button" && (e.key === "Enter" || e.key === " ") && e.target === m) { e.preventDefault(); m.click(); } if (e.target.dataset && e.target.dataset.linkUrl && e.key === "Enter") { e.preventDefault(); document.querySelector(`[data-link-add="${e.target.dataset.linkUrl}"]`).click(); } });
document.addEventListener("submit", e => {
  if (e.target.id !== "note-form") return; e.preventDefault();
  const ti = $("#nt-title").value.trim(), sj = $("#nt-subj").value; if (!ti) { $("#nt-title").focus(); return; } if (!sj) { toast("Choose a subject"); return; }
  const ed = S.noteEdit && S.snotes.find(n => n.id === S.noteEdit), kind = ed ? ed.kind : S.noteKind;
  const url = $("#nt-url") ? $("#nt-url").value.trim() : ""; if (kind === "link" && !url) { toast("Paste the link first"); $("#nt-url").focus(); return; }
  const rec = { subj: sj, kind, title: ti, body: $("#nt-body").value, url, tag: ed ? ed.tag || S.noteTag : S.noteTag, createdAt: ed ? ed.createdAt : nowISO(), updatedAt: nowISO() };
  put("snotes", ed ? ed.id : newId(), rec); S.noteEdit = null; S.noteSubj = sj; toast(ed ? "Saved" : kind === "link" ? "Link saved" : "Note saved");
});
document.addEventListener("change", e => {
  const t = e.target; if (!t.dataset) return;
  if (t.dataset.asgLearned) { const a = S.asg.find(x => x.id === t.dataset.asgLearned); if (a) { put("assignments", a.id, { ...strip(a), learned: t.value }); toast("Saved to your portfolio"); } }
  else if (t.dataset.asgSkills) { const a = S.asg.find(x => x.id === t.dataset.asgSkills); if (a) put("assignments", a.id, { ...strip(a), skills: t.value.split(",").map(x => x.trim()).filter(Boolean) }); }
  else if (t.id === "st-semname") { const old = S.curSem; S.curSem = t.value.trim(); saveCats();
    if (!old && S.curSem) batchColl("subjects", S.subjects.filter(s => !s.sem).map(s => ["set", s.id, { ...strip(s), sem: S.curSem }]));
    renderStudy(); toast(S.curSem ? `Current semester: ${S.curSem}` : "Semester name cleared"); }
});

// ---------- study calendar (classes, tests and deadlines; kept apart from the work calendar)
S.scMode = "week"; S.scSel = todayKey(); S.subjEdit = null; S.scPick = null;
const clsLoc = c => (c && (c.room || (subj(c.subj) || {}).location)) || "";
const monKey = k => addDays(k, -((keyDow(k) + 6) % 7));
const asgOpenOn = k => S.asg.filter(a => a.due === k && !["submitted", "graded"].includes(a.status)).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
const asgAllOn = k => S.asg.filter(a => a.due === k).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
const BIG = ["test", "exam", "midterm", "final", "quiz"];
function scDue(a, short){ const ty = (ASG_TYPES.find(x => x[0] === a.type) || ["", ""])[1], done = ["submitted", "graded"].includes(a.status);
  const tag = short ? "span" : "button";
  return `<${tag} ${short ? "" : `type="button" data-sc-asg="${esc(a.id)}"`} class="sc-due ${subjCls(a.subj)} ${BIG.includes(a.type) ? "big" : ""} ${done ? "done" : ""}" title="${esc(subjLabel(a.subj))} · ${esc(ty)}: ${esc(a.title)}${a.time ? " · " + fmt12(a.time) : ""}${done ? " · done" : ""}">${done ? "✓ " : BIG.includes(a.type) ? "! " : ""}${esc(subjLabel(a.subj))}${short ? "" : `<span class="sd-t"> · ${esc(a.title)}</span>`}</${tag}>`; }
function renderStudyCal(){
  const box = $("#st-cal"); if (!box) return;
  const tk = todayKey(), sel = S.scSel || tk, week = S.scMode === "week";
  const sp = semPeriod(addDays(monKey(sel), 2)), semTxt = sp ? sp.label : "";
  let label, body;
  if (week) {
    const m0 = monKey(sel), keys = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(m0, i));
    const cls = keys.map(k => classesOn(k)), dues = keys.map(asgAllOn);
    const showWe = cls[5].length || cls[6].length || dues[5].length || dues[6].length;
    const cols = showWe ? keys.map((k, i) => i) : [0, 1, 2, 3, 4];
    let lo = 8 * 60, hi = 18 * 60; cls.flat().forEach(c => { lo = Math.min(lo, Math.floor(toMin(c.start) / 60) * 60); hi = Math.max(hi, Math.ceil(toMin(c.end) / 60) * 60); });
    const ppm = 0.9, H = (hi - lo) * ppm, nowM = new Date().getHours() * 60 + new Date().getMinutes();
    const hours = []; for (let m = lo; m < hi; m += 60) hours.push(`<span style="top:${((m - lo) * ppm).toFixed(1)}px">${m === lo ? "" : fmt12(pad(Math.floor(m / 60)) + ":00")}</span>`);
    label = `${semTxt ? semTxt + " · " : ""}${longRange(keys[0], keys[6])}`;
    const anyDue = cols.some(i => dues[i].length);
    body = `<div class="tt-scroll"><div class="tt sc-week" style="--cols:${cols.length}">
      <div class="tt-hd"></div>${cols.map(i => `<button type="button" class="tt-hd sc-hd ${keys[i] === tk ? "today" : ""}" data-sc-day="${keys[i]}"><span>${DAYS[keyDow(keys[i])]}</span><b>${+keys[i].slice(8)}</b></button>`).join("")}
      ${anyDue ? `<div class="sc-lbl">Due</div>${cols.map(i => `<div class="sc-dues">${dues[i].map(a => scDue(a)).join("")}</div>`).join("")}` : ""}
      <div class="sch-times" style="height:${H}px">${hours.join("")}</div>
      ${cols.map(i => `<div class="sch-col tt-col ${keys[i] === tk ? "is-today" : ""}" style="height:${H}px;--hr:${60 * ppm}px">${cls[i].map(c => { const top = (toMin(c.start) - lo) * ppm, h = Math.max((toMin(c.end) - toMin(c.start)) * ppm, 24), s = subj(c.subj), loc = clsLoc(c);
        return `<button type="button" class="ev tt-ev sc-ev ${subjCls(c.subj)} ${attOf(c, keys[i]) ? "att-" + attOf(c, keys[i]) : ""} ${S.scPick === c.id + "|" + keys[i] ? "is-pick" : ""}" style="top:${top}px;height:${h}px;left:2px;width:calc(100% - 4px)" data-sc-cls="${esc(c.id)}|${keys[i]}" title="${esc(s ? s.name : "")} · ${esc((CLS_TYPES.find(x => x[0] === c.type) || ["", ""])[1])} · ${fmt12(c.start)}–${fmt12(c.end)}${loc ? " · " + esc(loc) : ""}"><span class="ev-t">${esc(subjLabel(c.subj))}</span>${h > 30 && loc ? `<span class="ev-s ev-loc">${SVG(ICON.pin)}${esc(loc)}</span>` : ""}${h > 46 ? `<span class="ev-s">${esc((CLS_TYPES.find(x => x[0] === c.type) || ["", ""])[1])}</span>` : ""}${h > 62 ? `<span class="ev-s">${fmt12(c.start)}–${fmt12(c.end)}</span>` : ""}</button>`; }).join("")}
        ${keys[i] === tk && nowM >= lo && nowM <= hi ? `<b class="sch-now" style="top:${((nowM - lo) * ppm).toFixed(1)}px"></b>` : ""}</div>`).join("")}
    </div></div>
    ${(() => { if (!S.scPick) return ""; const [pid, pk] = S.scPick.split("|"), c = S.classes.find(x => x.id === pid); if (!c) return ""; const s = subj(c.subj), a = attOf(c, pk);
      return `<div class="sc-pick"><div><b>${esc(subjLabel(c.subj))}</b> ${esc(s ? s.name : "")}<div class="small muted">${esc((CLS_TYPES.find(x => x[0] === c.type) || ["", ""])[1])} · ${esc(fmtDate(pk))} · ${fmt12(c.start)}–${fmt12(c.end)}${clsLoc(c) ? " · " + esc(clsLoc(c)) : ""}</div></div>
        <div class="seg"><button type="button" data-att="${esc(c.id)}|${pk}|" aria-pressed="${!a}">${pk <= todayKey() ? "Attended" : "Going"}</button><button type="button" data-att="${esc(c.id)}|${pk}|absent" aria-pressed="${a === "absent"}">Not attending</button><button type="button" data-att="${esc(c.id)}|${pk}|cancelled" aria-pressed="${a === "cancelled"}">Cancelled</button></div>
        <div class="row"><button type="button" class="btn sm" data-sc-edit="${esc(c.id)}">Edit class</button><button type="button" class="btn sm ghost" data-sc-pickx>Close</button></div></div>`; })()}
    ${cls.flat().length ? "" : `<p class="small muted" style="margin:0">${sp && sp.kind !== "teach" && sp.kind !== "before" ? `<b>${esc(sp.label)}</b>: no classes this week.` : S.classes.length ? "No classes this week." : "Add your classes in Timetable and they'll appear here every week."}</p>`}`;
  } else {
    const [y, mo] = sel.split("-").map(Number), first = dkey(new Date(y, mo - 1, 1)), nDays = new Date(y, mo, 0).getDate();
    label = new Date(y, mo - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
    let h = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => `<span class="cal-dow">${d.slice(0, 1)}<span class="dow-rest">${d.slice(1)}</span></span>`).join("");
    for (let i = 0; i < (keyDow(first) + 6) % 7; i++) h += `<span class="cal-blank"></span>`;
    for (let d = 1; d <= nDays; d++) { const k = dkey(new Date(y, mo - 1, d)), cs = classesOn(k), ds = asgAllOn(k), p = keyDow(k) === 1 ? semPeriod(addDays(k, 2)) : null, bk = breakOn(k);
      h += `<div class="sc-day ${k === tk ? "is-today" : ""} ${isWeekend(keyDow(k)) ? "is-we" : ""} ${bk ? "is-brk brk-" + bk.kind : ""}" data-sc-day="${k}" role="button" tabindex="0" aria-label="${esc(fmtDate(k))}">
        <span class="sc-n">${d}${p ? `<small>${p.kind === "teach" ? "W" + p.week : p.kind === "swotvac" ? "SWOT" : p.kind === "exam" ? "Exams" : p.kind === "break" ? "Break" : ""}</small>` : ""}</span>
        ${cs.length ? `<span class="sc-dots">${cs.map(c => `<i class="${subjCls(c.subj)} ${attOf(c, k) ? "off" : ""}"></i>`).join("")}</span>` : ""}
        ${ds.slice(0, 3).map(a => scDue(a, true)).join("")}${ds.length > 3 ? `<span class="small muted">+${ds.length - 3}</span>` : ""}</div>`; }
    body = `<div class="sc-month">${h}</div><div class="tl-legend"><span><i class="lg sc-lg-dot"></i>Class</span><span><b>!</b> or red: test, quiz or exam</span><span>Faded: submitted</span><span class="muted">Tap a day to see its week</span></div>`;
  }
  const up = S.asg.filter(a => a.due && a.due >= tk && !["submitted", "graded"].includes(a.status)).sort((a, b) => (a.due + (a.time || "")).localeCompare(b.due + (b.time || ""))).slice(0, 6);
  box.innerHTML = `<div class="sch-head">
      <div class="sch-title"><span class="muted small">${esc(label)}</span></div>
      <div class="sch-ctrl"><button class="btn sm" type="button" data-sc-nav="-1" aria-label="Previous">‹</button><button class="btn sm ghost" type="button" data-sc-today>Today</button><button class="btn sm" type="button" data-sc-nav="1" aria-label="Next">›</button>
        <div class="seg"><button type="button" data-sc-mode="week" aria-pressed="${week}">Week</button><button type="button" data-sc-mode="month" aria-pressed="${!week}">Month</button></div></div></div>
    ${body}
    ${up.length ? `<div class="sc-up"><div class="small muted" style="font-weight:600">Coming up</div><ul class="hlist">${up.map(a => { const n = Math.round((new Date(a.due + "T00:00") - new Date(tk + "T00:00")) / 864e5);
      return `<li><span class="hl-t">${n === 0 ? "Today" : n === 1 ? "Tmrw" : n + " days"}</span><span class="tag ${subjCls(a.subj)}">${esc(subjLabel(a.subj))}</span><span class="hl-b">${BIG.includes(a.type) ? "<b>" : ""}${esc(a.title)}${BIG.includes(a.type) ? "</b>" : ""} <span class="muted small">· ${esc(fmtDate(a.due))}${a.time ? " " + fmt12(a.time) : ""}</span></span><span></span></li>`; }).join("")}</ul></div>` : ""}`;
}
document.addEventListener("click", e => {
  if (S.view !== "study") return;
  const t = e.target.closest("[data-sc-nav],[data-sc-today],[data-sc-mode],[data-sc-day],[data-sc-cls],[data-sc-asg],[data-subj-edit],[data-subj-cancel],[data-sc-edit],[data-sc-pickx],[data-sbadd],[data-sbdel]"); if (!t || !t.closest("#v-study")) return;
  const d = t.dataset;
  if (d.scNav) { const [y, m, dd] = S.scSel.split("-").map(Number); S.scSel = S.scMode === "week" ? addDays(S.scSel, 7 * +d.scNav) : dkey(new Date(y, m - 1 + +d.scNav, 1)); renderStudyCal(); }
  else if (d.scToday !== undefined) { S.scSel = todayKey(); renderStudyCal(); }
  else if (d.scMode) { S.scMode = d.scMode; renderStudyCal(); }
  else if (d.scAsg) { e.stopPropagation(); S.asgOpen = d.scAsg; S.asgFilter = "all"; location.hash = "#study-assignments"; }
  else if (d.scCls) { S.scPick = S.scPick === d.scCls ? null : d.scCls; renderStudyCal(); }
  else if (d.scPickx !== undefined) { S.scPick = null; renderStudyCal(); }
  else if (d.sbadd) { const br = (S.semBreaks || []).slice(), last = br.map(b => b.to).sort().pop();
    let from = d.sbadd === "break" ? wkMon(addDays(todayKey(), 7)) : last && last >= (S.semStart || "") ? wkMon(addDays(last, 7)) : S.semStart ? addDays(wkMon(S.semStart), 7 * (S.semWeeks + br.filter(b => b.kind === "break").length)) : wkMon(addDays(todayKey(), 7));
    const len = d.sbadd === "exam" ? 13 : 6; br.push({ id: newId(), kind: d.sbadd, from, to: addDays(from, len) }); S.semBreaks = br; saveCats(); renderStudy(); toast("Added. Check the dates match your university calendar."); }
  else if (d.sbdel) { S.semBreaks = (S.semBreaks || []).filter(b => b.id !== d.sbdel); saveCats(); renderStudy(); }
  else if (d.scEdit) { S.scPick = null; S.stEdit = d.scEdit; S.clsForm = true; const c = S.classes.find(x => x.id === d.scEdit); if (c) S.clsType = c.type; location.hash = "#study-timetable"; setTimeout(() => $("#cls-form") && $("#cls-form").scrollIntoView({ block: "center" }), 120); }
  else if (d.scDay) { if (S.scMode === "month") { S.scSel = d.scDay; S.scMode = "week"; renderStudyCal(); } }
  else if (d.subjEdit) { S.subjEdit = d.subjEdit; S.subjForm = false; renderStudy(); $("#se-name") && $("#se-name").focus(); }
  else if (d.subjCancel !== undefined) { S.subjEdit = null; renderStudy(); }
});
document.addEventListener("keydown", e => { const m = e.target.closest && e.target.closest(".sc-day[data-sc-day]"); if (m && e.target === m && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); m.click(); } });
document.addEventListener("submit", e => {
  if (e.target.id !== "subj-edit-form") return; e.preventDefault();
  const s = subj(S.subjEdit), n = $("#se-name").value.trim(); if (!s || !n) return;
  put("subjects", s.id, { ...strip(s), code: $("#se-code").value.trim().toUpperCase(), name: n, lecturer: $("#se-lect").value.trim(), location: $("#se-loc").value.trim(), cFrom: $("#se-from").value, cTo: $("#se-to").value });
  S.subjEdit = null; toast("Subject updated");
}, true);
document.addEventListener("change", e => { if (e.target.id === "cl-subj" && $("#cl-room")) { const l = (subj(e.target.value) || {}).location; $("#cl-room").placeholder = l ? `Location (blank = ${l})` : "Location, e.g. DK3, Lab 2 or Zoom link"; } });

// ---------- sleep (stored on the morning you woke up)
const SLEEP_Q = [[1,"Awful"],[2,"Poor"],[3,"OK"],[4,"Good"],[5,"Great"]];
const sleepMins = s => s && s.bed && s.wake ? ((toMin(s.wake) - toMin(s.bed)) + 1440) % 1440 || 1440 : null;
const fmtHM = m => { if (m == null) return "–"; m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? `${h}h${r ? " " + r + "m" : ""}` : `${r}m`; };
const clockOf = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return fmt12(pad(Math.floor(m / 60)) + ":" + pad(m % 60)); };
const nightMin = t => { const m = toMin(t); return m < 12 * 60 ? m + 1440 : m; }; // bedtimes after midnight count as late, not early
function sleepGuess(k){
  const tick = (day, re) => { const dd = dayDoc(day); const r = routineFor(day).find(x => re.test(x.label) || (re.source.includes("sleep") && x.kind === "sleep")); const v = r && (dd.done || {})[r.id]; return /^\d\d:\d\d$/.test(v || "") ? v : r ? r.time : null; };
  return { bed: tick(addDays(k, -1), /sleep|bed/i) || "23:30", wake: tick(k, /wake/i) || "07:00" };
}
function renderSleepCard(){
  const box = $("#h-sleep"); if (!box) return;
  const k = hk(), d = hDoc(k), s = d.sleep, g = s || sleepGuess(k), isT = k === todayKey();
  const wk = rangeKeys(7).map(x => sleepMins(hDoc(x).sleep)).filter(v => v != null), avg = wk.length ? wk.reduce((a, b) => a + b, 0) / wk.length : null;
  box.innerHTML = `${s ? `<div class="sl-top"><b class="hw-n">${fmtHM(sleepMins(s))}</b><span class="muted small">${clockOf(toMin(s.bed))} → ${clockOf(toMin(s.wake))}${s.q ? " · " + SLEEP_Q[s.q - 1][1] : ""}</span></div>` : `<p class="small muted" style="margin:0">How did you sleep ${isT ? "last night" : "the night before " + esc(fmtDate(k))}?</p>`}
    <form id="h-sleep-form" class="sl-form" autocomplete="off">
      <label class="f">Went to sleep<input type="time" id="sl-bed" value="${esc(g.bed)}"></label>
      <label class="f">Woke up<input type="time" id="sl-wake" value="${esc(g.wake)}"></label>
      <div class="qa-chips cwrap sl-q">${SLEEP_Q.map(([v, l]) => `<button type="button" class="qc" data-slq="${v}" aria-pressed="${(s ? s.q : S.slQ) === v}">${l}</button>`).join("")}</div>
      <div class="row"><button class="btn sm primary" type="submit">${s ? "Update" : "Save sleep"}</button>${s ? `<button class="btn sm ghost danger" type="button" data-sldel>Remove</button>` : ""}</div>
    </form>
    <p class="small muted" style="margin:0">7-day average: <b>${fmtHM(avg && Math.round(avg))}</b>${wk.length ? ` over ${wk.length} night${wk.length === 1 ? "" : "s"}` : ""} · adults usually need 7–9 hours</p>`;
}
S.slQ = 0;
document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("[data-slq],[data-sldel]"); if (!t || !t.closest("#h-sleep")) return;
  const k = hk(), d = { ...hDoc(k) };
  if (t.dataset.slq) { S.slQ = +t.dataset.slq; t.parentElement.querySelectorAll("[data-slq]").forEach(b => b.setAttribute("aria-pressed", b === t)); if (d.sleep) { d.sleep = { ...d.sleep, q: S.slQ }; saveHealth(k, d); } }
  else { delete d.sleep; saveHealth(k, d); toast("Sleep entry removed"); }
});
document.addEventListener("submit", e => {
  if (e.target.id !== "h-sleep-form") return; e.preventDefault();
  const bed = $("#sl-bed").value, wake = $("#sl-wake").value; if (!bed || !wake) return;
  const k = hk(), d = { ...hDoc(k) }; d.sleep = { bed, wake, q: (d.sleep && d.sleep.q) || S.slQ || 0 }; S.slQ = 0; saveHealth(k, d); toast(`Saved: ${fmtHM(sleepMins(d.sleep))} of sleep`);
});
// ---------- Insights: sleep analysis and where time went
function sleepInsights(keys, labels, mini){
  const tk = todayKey();
  const vals = keys.map(k => k > tk ? null : sleepMins(hDoc(k).sleep)), got = keys.map((k, i) => ({ k, m: vals[i], s: hDoc(k).sleep })).filter(x => x.m != null);
  if (!got.length) return `<p class="small muted" style="margin:0">No sleep logged in this period. Log it each morning on <a href="#health-body">Health → Body</a> and it's analysed here.</p>`;
  const avg = got.reduce((a, x) => a + x.m, 0) / got.length;
  const beds = got.map(x => nightMin(x.s.bed)), wakes = got.map(x => toMin(x.s.wake));
  const mean = a => a.reduce((p, q) => p + q, 0) / a.length, sd = a => Math.sqrt(mean(a.map(v => (v - mean(a)) ** 2)));
  const short = got.filter(x => x.m < 7 * 60).length, qs = got.filter(x => x.s.q).map(x => x.s.q);
  const best = got.reduce((a, x) => x.m > a.m ? x : a), worst = got.reduce((a, x) => x.m < a.m ? x : a);
  const wdA = got.filter(x => !isWeekend(keyDow(x.k))), weA = got.filter(x => isWeekend(keyDow(x.k)));
  const notes = [];
  const sdB = beds.length > 2 ? sd(beds) : null;
  if (sdB != null) notes.push(sdB <= 45 ? `Your bedtime is fairly regular (varies by about ${Math.round(sdB)} min).` : `Your bedtime varies by about ${fmtHM(Math.round(sdB))} night to night. A steadier bedtime usually makes waking up easier.`);
  if (short) notes.push(`${short} of ${got.length} night${got.length === 1 ? "" : "s"} were under 7 hours.`);
  if (wdA.length >= 2 && weA.length >= 1) { const diff = mean(weA.map(x => x.m)) - mean(wdA.map(x => x.m)); if (Math.abs(diff) >= 45) notes.push(diff > 0 ? `You sleep ${fmtHM(Math.round(diff))} more on weekends, which can mean you're catching up on sleep lost during the week.` : `You sleep ${fmtHM(Math.round(-diff))} less on weekends.`); }
  const withMood = got.map(x => ({ ...x, mood: dayMood(x.k) })).filter(x => x.mood != null), good = withMood.filter(x => x.m >= 7 * 60), bad = withMood.filter(x => x.m < 7 * 60);
  if (good.length >= 2 && bad.length >= 2) { const dm = mean(good.map(x => x.mood)) - mean(bad.map(x => x.mood)); notes.push(Math.abs(dm) >= 0.3 ? `Your mood averages ${mean(good.map(x => x.mood)).toFixed(1)}/5 after 7+ hours vs ${mean(bad.map(x => x.mood)).toFixed(1)}/5 after shorter nights.` : `So far your mood looks about the same after short and long nights.`); }
  else notes.push(`Check in your mood on more days to see how sleep affects it.`);
  return `<div class="minis">
      ${mini(fmtHM(Math.round(avg)), "Average sleep", `${got.length} night${got.length === 1 ? "" : "s"} logged`)}
      ${mini(clockOf(mean(beds)), "Usual bedtime", sdB != null ? `± ${Math.round(sdB)} min` : "")}
      ${mini(clockOf(mean(wakes)), "Usual wake-up", "")}
      ${mini(qs.length ? (mean(qs)).toFixed(1) + "/5" : "–", "Sleep quality", qs.length ? SLEEP_Q[Math.round(mean(qs)) - 1][1] : "rate it when you log")}
      ${mini(fmtHM(best.m), "Longest", esc(fmtDate(best.k)))}
      ${mini(fmtHM(worst.m), "Shortest", esc(fmtDate(worst.k)))}</div>
    <div class="sechead" style="margin:6px 0 0"><h3 class="small">Hours slept</h3><span class="meta">dashed line = 7 h</span></div>
    <div class="sl-chart">${barChart(vals.map(v => v == null ? null : +(v / 60).toFixed(1)), labels, 10, v => v.toFixed(1).replace(/\.0$/, "") + "h", "var(--c0)")}<i class="sl-7" style="--y:${(10 + (190 - 10 - 30) * (1 - 7 / 10)) / 190 * 100}%"></i></div>
    <ul class="sl-notes">${notes.map(n => `<li>${n}</li>`).join("")}</ul>`;
}
const TIME_COLORS = ["var(--c0)", "var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--high)", "var(--med)"];
function timeInsights(keys){
  const tk = todayKey(), st = startKey(), days = keys.filter(k => k >= st && k <= tk), seg = {};
  const add = (name, m) => { if (m > 0) seg[name] = (seg[name] || 0) + m; };
  days.forEach(k => {
    add("Sleep", sleepMins(hDoc(k).sleep) || 0);
    classesOn(k).filter(c => !attOf(c, k)).forEach(c => add("Classes", toMin(c.end) - toMin(c.start)));
    S.time.filter(x => x.date === k).forEach(x => { const m = +x.mins || 0;
      if (x.type === "task") { const t = S.tasks.find(y => y.id === x.ref); add("Work · " + catName(t ? t.category : ""), m); }
      else if (x.type === "course") add("Self-study & courses", m);
      else add("Focus sessions", m); });
  });
  const tracked = Object.values(seg).reduce((a, b) => a + b, 0), total = days.length * 1440;
  if (!tracked) return `<p class="small muted" style="margin:0">Nothing tracked yet. Time comes from your sleep log, class timetable and the ▶ timers on work tasks and courses.</p>`;
  let items = Object.entries(seg).sort((a, b) => b[1] - a[1]);
  if (items.length > 7) { const rest = items.slice(6).reduce((a, x) => a + x[1], 0); items = [...items.slice(0, 6), ["Other", rest]]; }
  const withU = S.ovUntracked && total > tracked ? [...items, ["Not tracked", total - tracked]] : items;
  const sum = withU.reduce((a, x) => a + x[1], 0), R = 70, C = 2 * Math.PI * R; let off = 0;
  const arcs = withU.map(([n, m], i) => { const len = m / sum * C, col = n === "Not tracked" ? "var(--line)" : n === "Sleep" ? "var(--c0)" : TIME_COLORS[(i % (TIME_COLORS.length - 1)) + 1];
    const a = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${col}" stroke-width="34" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"><title>${esc(n)}: ${fmtHM(Math.round(m))} (${Math.round(m / sum * 100)}%)</title></circle>`; off += len; return { a, n, m, col }; });
  const perDay = m => fmtHM(Math.round(m / days.length));
  return `<div class="pie-wrap"><svg viewBox="0 0 180 180" class="pie" role="img" aria-label="Where your time went"><g transform="rotate(-90 90 90)">${arcs.map(x => x.a).join("")}</g>
      <text x="90" y="86" text-anchor="middle" class="pie-n">${fmtHM(Math.round(tracked / days.length))}</text><text x="90" y="104" text-anchor="middle" class="pie-s">tracked / day</text></svg>
    <ul class="pie-leg">${arcs.map(x => `<li><i style="background:${x.col}"></i><span>${esc(x.n)}</span><b>${Math.round(x.m / sum * 100)}%</b><span class="muted small">${perDay(x.m)}/day</span></li>`).join("")}</ul></div>
    <label class="small muted pie-tog"><input type="checkbox" data-ovuntracked ${S.ovUntracked ? "checked" : ""}> Include untracked time (${Math.round((total - tracked) / total * 100)}% of the ${days.length} day${days.length === 1 ? "" : "s"})</label>`;
}
S.ovUntracked = false;
document.addEventListener("change", e => { if (e.target.dataset && e.target.dataset.ovuntracked !== undefined) { S.ovUntracked = e.target.checked; renderOverview(); } });

// ---------- calendar
S.calY = new Date().getFullYear(); S.calM = new Date().getMonth(); S.calSel = todayKey();
const loadedMonths = new Set();
function loadMonth(y, m){
  const key = y + "-" + m; if (!db || loadedMonths.has(key)) return; loadedMonths.add(key);
  const a = dkey(new Date(y, m, 1)), b = dkey(new Date(y, m + 1, 0));
  db.collection("checks").where("date", ">=", a).where("date", "<=", b).get().then(s => { s.docs.forEach(d => { if (!S.day[d.id]) { const x = d.data(); S.day[d.id] = { done: x.done || {}, skip: x.skip || {}, extra: x.extra || [] }; } }); if (S.view === "calendar") renderCalendar(); }).catch(e => { loadedMonths.delete(key); console.error(e); });
  db.collection("reflections").where("date", ">=", a).where("date", "<=", b).get().then(s => { s.docs.forEach(d => { if (!S.refl[d.id]) S.refl[d.id] = d.data(); }); if (S.view === "calendar") renderCalendar(); }).catch(e => { loadedMonths.delete(key); console.error(e); });
}
function dayInfo(k){
  const tk = todayKey(), dd = dayDoc(k), skip = dd.skip || {}, done = dd.done || {};
  const items = routineFor(k).filter(r => !skip[r.id]);
  const hasRec = !!S.day[k];
  const rDone = items.filter(r => done[r.id]).length;
  const pct = (k <= tk && hasRec && items.length) ? Math.round(rDone / items.length * 100) : null;
  const todos = S.todos.filter(t => t.date === k || (t.done && isoDay(t.doneAt) === k));
  const todosDone = S.todos.filter(t => t.done && isoDay(t.doneAt) === k);
  const due = S.tasks.filter(t => t.due === k);
  const updates = S.tasks.map(t => ({ t, e: (t.log || []).filter(l => isoDay(l.at) === k && l.note !== "Task added") })).filter(x => x.e.length);
  const added = S.tasks.filter(t => isoDay(t.createdAt) === k);
  const finished = S.tasks.filter(t => t.status === "done" && isoDay(t.doneAt) === k);
  return { k, dd, items, rDone, pct, todos, todosDone, due, updates, added, finished, refl: S.refl[k] };
}
function renderCalendar(){
  const y = S.calY, m = S.calM, tk = todayKey();
  loadMonth(y, m);
  $("#cal-title").textContent = new Date(y, m, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
  const first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, nDays = new Date(y, m + 1, 0).getDate();
  let h = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => `<span class="cal-dow">${d.slice(0,1)}<span class="dow-rest">${d.slice(1)}</span></span>`).join("");
  for (let i = 0; i < lead; i++) h += `<span class="cal-blank"></span>`;
  for (let d = 1; d <= nDays; d++) {
    const k = dkey(new Date(y, m, d)), I = dayInfo(k), we = isWeekend(keyDow(k));
    const doneN = I.todosDone.length + I.finished.length;
    const dueOpen = I.due.filter(t => t.status !== "done").length;
    const pc = I.pct;
    const bar = pc === null ? "" : `<span class="cal-bar"><i style="width:${pc}%;background:${pc >= 80 ? "var(--ok)" : pc >= 50 ? "var(--med)" : "var(--crit)"}"></i></span>`;
    const marks = (I.refl ? `<i class="mk mk-refl" title="Reflection written"></i>` : "") + (I.updates.length || I.finished.length || I.added.length ? `<i class="mk mk-work" title="Work activity"></i>` : "") + (dueOpen ? `<i class="mk mk-due" title="Task due"></i>` : "");
    h += `<button type="button" class="cal-day ${k === tk ? "is-today" : ""} ${k === S.calSel ? "is-sel" : ""} ${we ? "is-we" : ""} ${k > tk ? "is-future" : ""}" data-cdate="${k}" aria-label="${esc(fmtDate(k))}" aria-pressed="${k === S.calSel}">
      <span class="cal-n">${d}</span>${doneN ? `<span class="cal-c">✓${doneN}</span>` : ""}<span class="cal-marks">${marks}</span>${bar}</button>`;
  }
  $("#cal-grid").innerHTML = h;
  renderCalDay();
  renderSchedule();
}
function renderCalDay(){
  const k = S.calSel, I = dayInfo(k), tk = todayKey(), off = Math.round((new Date(k + "T00:00") - new Date(tk + "T00:00")) / 864e5);
  const done = I.dd.done || {}, skip = I.dd.skip || {};
  const sec = (title, body, meta = "") => `<div class="cd-sec"><div class="sechead"><h3>${title}</h3><span class="meta">${meta}</span></div>${body}</div>`;
  const none = t => `<p class="muted small" style="margin:0">${t}</p>`;
  const all = routineFor(k);
  const routineHtml = all.length ? `<ul class="cd-list">${all.map(r => { const st = skip[r.id] ? "skip" : done[r.id] ? "done" : (k < tk || (k === tk && r.time < pad(new Date().getHours()) + ":" + pad(new Date().getMinutes()))) ? "miss" : "todo";
      return `<li class="cd-${st}"><span class="tm">${esc(r.time)}</span><span class="cd-lbl">${routineIcon(r)}${esc(r.label)}</span><span class="cd-st">${st === "done" ? "✓ " + esc(done[r.id]) : st === "skip" ? "Skipped" : st === "miss" ? "Not ticked" : ""}</span></li>`; }).join("")}</ul>` : none("No routine items.");
  const todoHtml = I.todos.length ? `<ul class="cd-list">${I.todos.map(t => `<li class="${t.done ? "cd-done" : ""}"><span>${t.done ? "✓" : "○"}</span><span>${esc(t.title)}</span><span class="cd-st">${t.done ? "Done " + fmtTime(t.doneAt) : t.date < tk ? "Not done" : ""}</span></li>`).join("")}</ul>` : none("No to-dos for this day.");
  const workBits = [];
  I.finished.forEach(t => workBits.push(`<li data-task="${esc(t.id)}"><span class="st done">Finished</span><span>${esc(t.title)}</span></li>`));
  I.due.filter(t => t.status !== "done").forEach(t => workBits.push(`<li data-task="${esc(t.id)}"><span class="urg ${esc(t.urgency)}">Due</span><span>${esc(t.title)} <span class="muted small">· ${esc(STATUS_LABEL[t.status])} ${+t.progress || 0}%</span></span></li>`));
  I.updates.filter(x => !I.finished.includes(x.t)).forEach(x => workBits.push(`<li data-task="${esc(x.t.id)}">${catTag(x.t.category)}<span><b>${esc(x.t.title)}</b>: ${x.e.map(e => esc(e.note)).join("; ")}</span></li>`));
  I.added.filter(t => !I.updates.some(x => x.t === t) && !I.finished.includes(t) && !I.due.includes(t)).forEach(t => workBits.push(`<li data-task="${esc(t.id)}"><span class="tag">New</span><span>${esc(t.title)}</span></li>`));
  const workHtml = workBits.length ? `<ul class="cd-list cd-work">${workBits.join("")}</ul>` : none("No work activity or deadlines.");
  const r = I.refl;
  const reflHtml = r && (r.did || r.learned || r.mistakes || r.improve) ? `<dl class="cd-refl">${[["Did", r.did], ["Learned", r.learned], ["Mistakes", r.mistakes], ["Improve", r.improve]].filter(x => (x[1] || "").trim()).map(([a, b]) => `<dt>${a}</dt><dd>${esc(b)}</dd>`).join("")}${r.mood ? `<dt>Energy</dt><dd>${r.mood}/5</dd>` : ""}</dl>` : none(k <= tk ? "No reflection written for this day." : "Reflection opens on the day.");
  $("#cal-day").innerHTML = `<div class="panel cd">
    <div class="sechead" style="align-items:center"><h2>${esc(DAYS[keyDow(k)])}, ${esc(fmtDate(k).split(", ")[1])} ${k.slice(0, 4)}</h2>
      <span style="display:flex;gap:6px;flex-wrap:wrap">${off >= -1 && off <= 6 ? `<button class="btn sm" type="button" data-calopen="${off}">Open in Today</button>` : ""}${k <= tk ? `<button class="btn sm" type="button" data-calrefl="${k}">${r ? "Edit reflection" : "Write reflection"}</button>` : ""}</span></div>
    ${sec("Work", workHtml)}
    ${sec("Reflection", reflHtml)}
    ${sec("To-dos", todoHtml)}
    ${sec((isWeekend(keyDow(k)) ? "Weekend" : "Weekday") + " routine", routineHtml, I.pct !== null ? `${I.rDone} of ${I.items.length} done` : "")}
  </div>`;
}
document.addEventListener("click", e => {
  const c = e.target.closest("[data-cdate]"); if (c) { S.calSel = c.dataset.cdate; renderCalendar(); return; }
  const m = e.target.closest("[data-calm]"); if (m) { const d = new Date(S.calY, S.calM + +m.dataset.calm, 1); S.calY = d.getFullYear(); S.calM = d.getMonth(); renderCalendar(); return; }
  if (e.target.closest("[data-caltoday]")) { const d = new Date(); S.calY = d.getFullYear(); S.calM = d.getMonth(); S.calSel = todayKey(); renderCalendar(); return; }
  const o = e.target.closest("[data-calopen]"); if (o) { S.dayOff = +o.dataset.calopen; watchChecks(); location.hash = "#today"; return; }
  const rf = e.target.closest("[data-calrefl]"); if (rf) { rDate = rf.dataset.calrefl; rDirty = false; location.hash = "#reflect"; return; }
});

// ---------- reflection
let rDate=todayKey(), rMood=0, rDirty=false;
function workLogFor(day){
  return S.tasks.map(t=>({t,entries:(t.log||[]).filter(l=>isoDay(l.at)===day && l.note!=="Task added")})).filter(x=>x.entries.length || isoDay(x.t.createdAt)===day);
}
function renderReflect(){
  $("#r-date").value=rDate;
  const r=S.refl[rDate]||{};
  if(!rDirty){ $("#r-did").value=r.did||""; $("#r-learned").value=r.learned||""; $("#r-mistakes").value=r.mistakes||""; $("#r-improve").value=r.improve||""; rMood=r.mood||0; }
  $("#r-mood").innerHTML=[1,2,3,4,5].map(n=>`<button type="button" data-mood="${n}" aria-pressed="${rMood===n}">${n}</button>`).join("");
  $("#r-saved").textContent = r.updatedAt?`Saved ${fmtTime(r.updatedAt)}`:"Not saved yet";
  $("#r-del").hidden = !S.refl[rDate]; if(!rDelAsk){ $("#r-del").textContent="Delete"; $("#r-del").classList.remove("armed"); }
  const wl=workLogFor(rDate);
  const doneTodos=S.todos.filter(t=>t.done&&isoDay(t.doneAt)===rDate);
  $("#r-auto").innerHTML = `<b>Pulled from your tasks for ${esc(fmtDate(rDate))}</b>` + (wl.length||doneTodos.length ? `<ul>${wl.map(x=>`<li><b>${esc(x.t.title)}</b> <span class="muted">(${esc(catName(x.t.category))}, ${esc(STATUS_LABEL[x.t.status])} ${+x.t.progress||0}%)</span>${x.entries.length?": "+x.entries.map(e=>esc(e.note)).join("; "):" — added"}</li>`).join("")}${doneTodos.map(t=>`<li>${esc(t.title)} <span class="muted">(to-do done)</span></li>`).join("")}</ul>` : `<div class="muted small">No task updates logged on this day. Updates you log on work tasks appear here automatically.</div>`);
  renderArchive();
}
["#r-did","#r-learned","#r-mistakes","#r-improve"].forEach(s=>$(s).addEventListener("input",()=>{ rDirty=true; $("#r-saved").textContent="Unsaved changes"; }));
["#r-did","#r-learned","#r-mistakes","#r-improve"].forEach(s=>$(s).addEventListener("blur",()=>{ if(rDirty) saveRefl(true); }));
$("#r-date").addEventListener("change",e=>{ rDelAsk=false; S.arcMonth=(e.target.value||todayKey()).slice(0,7);  if(rDirty) saveRefl(true); rDate=e.target.value||todayKey(); rDirty=false; renderReflect(); });
$("#r-mood").addEventListener("click",e=>{ const b=e.target.closest("[data-mood]"); if(!b) return; rMood=+b.dataset.mood; rDirty=true; saveRefl(true); });
$("#r-save").onclick=()=>saveRefl(false);
let rDelAsk=false;
function deleteRefl(k){
  const old=S.refl[k]; if(!old) return;
  delete S.refl[k]; if(k===rDate){ rDirty=false; rDelAsk=false; }
  if(db) write("reflections/"+k, ()=>db.doc("reflections/"+k).delete());
  render(); toast("Reflection deleted", ()=>{ S.refl[k]=old; if(db) write("reflections/"+k, ()=>db.doc("reflections/"+k).set(old)); render(); toast("Reflection restored"); });
}
document.addEventListener("click", e=>{
  const b=e.target.closest&&e.target.closest("#r-del"); if(!b) return;
  if(!rDelAsk){ rDelAsk=true; b.textContent="Tap again to delete"; b.classList.add("armed"); setTimeout(()=>{ rDelAsk=false; if($("#r-del")){ $("#r-del").textContent="Delete"; $("#r-del").classList.remove("armed"); } },3000); return; }
  deleteRefl(rDate);
});
function saveRefl(quiet){
  const data={date:rDate,did:$("#r-did").value,learned:$("#r-learned").value,mistakes:$("#r-mistakes").value,improve:$("#r-improve").value,mood:rMood,updatedAt:nowISO()};
  S.refl[rDate]=data; rDirty=false;
  if(db) write("reflections/"+rDate, ()=>db.doc("reflections/"+rDate).set(data));
  if(!quiet) toast("Reflection saved"); renderReflect();
}
$("#r-copy").onclick=async()=>{
  const wl=workLogFor(rDate);
  const lines=[`Daily Report — ${fmtDate(rDate)} ${rDate.slice(0,4)}`, ...(S.org?[S.org]:[]),``,`Work progress:`];
  wl.forEach(x=>lines.push(`- [${catName(x.t.category)}] ${x.t.title} — ${STATUS_LABEL[x.t.status]}, ${+x.t.progress||0}%${x.entries.length?" ("+x.entries.map(e=>e.note).join("; ")+")":""}${x.t.bottleneck&&x.t.status!=="done"?" | Bottleneck: "+x.t.bottleneck:""}`));
  if(!wl.length) lines.push("- (no task updates logged)");
  const add=(h,v)=>{ if(v.trim()){ lines.push("",h+":",v.trim()); } };
  add("What I did",$("#r-did").value); add("What I learned",$("#r-learned").value); add("Mistakes",$("#r-mistakes").value); add("How I'll improve",$("#r-improve").value);
  const text=lines.join("\n");
  try{ await navigator.clipboard.writeText(text); toast("Report copied"); }
  catch{ const ta=document.createElement("textarea"); ta.value=text; ta.style.minHeight="200px"; $("#r-auto").after(ta); ta.select(); toast("Select all and copy the text below"); }
};

// ---------- calendar alarms
const BYDAY = ["SU","MO","TU","WE","TH","FR","SA"];
const alarmItems = () => S.routine.filter(r => r.alarm).sort((a,b)=>a.time.localeCompare(b.time));
function alarmHash(){ const str=JSON.stringify(alarmItems().map(r=>[r.id,r.time,r.label,(r.days||[]).slice().sort(),+r.before||0])); let h=0; for(const ch of str) h=(h*31+ch.charCodeAt(0))>>>0; return h.toString(36); }
const icsEsc = t => String(t).replace(/\\/g,"\\\\").replace(/[,;]/g,m=>"\\"+m).replace(/\n/g,"\\n");
function buildICS(){
  const now=new Date(), stamp=now.toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
  const L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Daybook//Routine alarms//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:Daybook"];
  for(const r of alarmItems()){
    const days=(r.days&&r.days.length?r.days:[0,1,2,3,4,5,6]);
    const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()); while(!days.includes(d.getDay())) d.setDate(d.getDate()+1);
    const [hh,mm]=r.time.split(":"), ds=dkey(d).replace(/-/g,"")+"T"+hh+mm+"00";
    const end=new Date(d.getFullYear(),d.getMonth(),d.getDate(),+hh,+mm+15), de=dkey(end).replace(/-/g,"")+"T"+pad(end.getHours())+pad(end.getMinutes())+"00";
    L.push("BEGIN:VEVENT","UID:"+r.id+"@daybook","DTSTAMP:"+stamp,"DTSTART:"+ds,"DTEND:"+de,
      "RRULE:FREQ=WEEKLY;BYDAY="+days.slice().sort().map(i=>BYDAY[i]).join(","),
      "SUMMARY:"+icsEsc(r.label),"DESCRIPTION:"+icsEsc("From your Daybook routine"),"TRANSP:TRANSPARENT",
      "BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+icsEsc(r.label),"TRIGGER:-PT"+(+r.before||0)+"M","END:VALARM","END:VEVENT");
  }
  L.push("END:VCALENDAR"); return L.join("\r\n")+"\r\n";
}
function renderAlarmPanel(){
  const n=alarmItems().length, synced=S.calSync, changed=n && (!synced || synced.hash!==alarmHash());
  $("#cal-sync-status").innerHTML = !n ? "No alarms yet. Tap <b>Alarm off</b> on any routine item below to switch it on."
    : changed ? `<span class="warn-dot"></span><b>${n} alarm${n>1?"s":""}</b> · changed since your last sync. Tap Sync to update your phone.`
    : `<span class="ok-dot"></span><b>${n} alarm${n>1?"s":""}</b> · in sync (last synced ${esc(fmtDate(isoDay(synced.at)))} ${fmtTime(synced.at)})`;
  $("#cal-sync").disabled = !n;
}
$("#cal-sync").addEventListener("click", async () => {
  const ics=buildICS(), name="daybook-alarms.ics";
  const file=new File([ics], name, {type:"text/calendar"});
  let done=false;
  try { if (navigator.canShare && navigator.canShare({files:[file]}) && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) { await navigator.share({files:[file], title:"Daybook alarms"}); done=true; } } catch(e){ if(e && e.name==="AbortError") return; }
  if(!done){ const url=URL.createObjectURL(file); const a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),5000); }
  S.calSync={hash:alarmHash(), at:nowISO()}; saveCats(); renderAlarmPanel();
  toast("Calendar file ready. Open it to add your alarms.");
});
$("#cal-help-btn").addEventListener("click", () => { const h=$("#cal-help"); h.hidden=!h.hidden; $("#cal-help-btn").textContent=h.hidden?"How it works":"Hide steps"; });

// ---------- push notifications
const PUSH_KEY = "daybook-push";
const vapidOK = () => !!(CFG.vapidKey && !/PASTE/i.test(CFG.vapidKey));
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => !!(navigator.standalone || (window.matchMedia && matchMedia("(display-mode: standalone)").matches));
const tokenId = t => { let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return "d" + h.toString(36) + t.length.toString(36); };
async function pushState(){
  if (!vapidOK()) return "nokey";
  if (isIOS() && !isStandalone()) return "ios-browser";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  let ok = false; try { ok = await messagingSupported(); } catch {}
  if (!ok) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  let on = false; try { on = localStorage.getItem(PUSH_KEY) === "1"; } catch {}
  return Notification.permission === "granted" && on ? "on" : "off";
}
async function registerDevice(){
  const reg = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(APP), { vapidKey: CFG.vapidKey, serviceWorkerRegistration: reg });
  if (!token) throw new Error("no token");
  await db.doc("devices/" + tokenId(token)).set({ token, device: isIOS() ? "iPhone/iPad" : /Android/i.test(navigator.userAgent) ? "Android" : "Computer", agent: navigator.userAgent.slice(0, 160), updatedAt: nowISO() });
  try { localStorage.setItem(PUSH_KEY, "1"); } catch {}
}
const PUSH_MSG = {
  nokey: "Push notifications need one setup step on the Firebase side. Until then, use calendar alarms below.",
  "ios-browser": "On iPhone, open Daybook from its <b>home-screen icon</b> to turn on notifications.",
  unsupported: "This browser can't receive notifications. Use calendar alarms below instead.",
  denied: "Notifications are blocked for Daybook. Allow them in your phone or browser settings, then reopen the app.",
  off: "Get a notification on <b>this device</b> for every routine item with an alarm on.",
  on: "<span class=\"ok-dot\"></span>Notifications are <b>on for this device</b>. Changes to your alarms apply straight away."
};
let pushBusy = false;
async function refreshPush(silentRegister){
  if (!APP || !db) return;
  const st = await pushState();
  $("#push-status").innerHTML = PUSH_MSG[st];
  // Without the notification server, show calendar alarms as the main option.
  const row = $("#push-status").closest(".ab-row"); if (row) row.hidden = st === "nokey";
  if (st === "nokey") { const d = document.querySelector(".ab-cal"); if (d) d.open = true; }
  $("#push-on").hidden = st !== "off";
  $("#push-test").hidden = st !== "on";
  if (st === "on" && silentRegister) registerDevice().catch(e => console.warn("token refresh", e));
}
$("#push-on").addEventListener("click", async () => {
  if (pushBusy) return; pushBusy = true; $("#push-on").disabled = true;
  try {
    const p = await Notification.requestPermission();
    if (p !== "granted") { toast("Notifications weren't allowed."); }
    else { await registerDevice(); toast("Notifications are on for this device"); }
  } catch (e) { console.error(e); toast("Couldn't turn on notifications. Check your connection and try again."); }
  pushBusy = false; $("#push-on").disabled = false; refreshPush();
});
$("#push-test").addEventListener("click", async () => {
  $("#push-test").disabled = true;
  try { const r = await httpsCallable(getFunctions(APP, "asia-southeast1"), "sendTest")(); toast(r.data && r.data.sent ? `Test sent to ${r.data.sent} device${r.data.sent > 1 ? "s" : ""}` : "Test didn't reach any device"); }
  catch (e) { console.error(e); toast(/not-found|internal|unavailable/.test(e.code || "") ? "The notification server isn't set up yet." : (e.message || "Test failed")); }
  $("#push-test").disabled = false;
});

// ---------- routine editor
const daysLabel = d => { const s=(d||[0,1,2,3,4,5,6]).slice().sort().join(""); return s==="0123456"?"Every day":s==="12345"?"Weekdays":s==="06"?"Weekend":null; };
function renderRoutine(){
  renderAlarmPanel(); if (!renderRoutine._p) { renderRoutine._p = true; refreshPush(); }
  const all=S.routine.slice().sort((a,b)=>a.time.localeCompare(b.time));
  const has = (r,set) => (r.days||[0,1,2,3,4,5,6]).some(d=>set.includes(d));
  const rows = S.rtFilter==="wd" ? all.filter(r=>has(r,[1,2,3,4,5])) : S.rtFilter==="we" ? all.filter(r=>has(r,[0,6])) : all;
  $("#rt-filter").innerHTML = [["all","All items"],["wd","Weekday view"],["we","Weekend view"]].map(([k,l])=>`<button type="button" data-rtf="${k}" aria-pressed="${S.rtFilter===k}">${l} <span class="muted">${k==="all"?all.length:k==="wd"?all.filter(r=>has(r,[1,2,3,4,5])).length:all.filter(r=>has(r,[0,6])).length}</span></button>`).join("");
  $("#rt-edit").innerHTML = rows.length?rows.map(r=>`<div class="rt" data-rid="${esc(r.id)}">
    <input type="time" value="${esc(r.time)}" data-f="time" aria-label="Time" id="rt-t-${esc(r.id)}">
    <input value="${esc(r.label)}" data-f="label" aria-label="Label" id="rt-l-${esc(r.id)}">
    <select data-f="kind" aria-label="Type" id="rt-k-${esc(r.id)}">${KINDS.map(([k,l])=>`<option value="${k}" ${k===r.kind?"selected":""}>${l}</option>`).join("")}</select>
    <button class="x" type="button" data-delrt="${esc(r.id)}" aria-label="Delete">✕</button>
    <div class="days">${DAYS.map((d,i)=>`<button type="button" data-day="${i}" aria-pressed="${!r.days||r.days.includes(i)}">${d.slice(0,2)}</button>`).join("")}</div>
    <div class="rt-alarm"><button type="button" class="bell" data-alarm="${esc(r.id)}" aria-pressed="${!!r.alarm}" aria-label="Alarm for ${esc(r.label)}">${SVG(ICON.bell)}<span>${r.alarm?"Alarm on":"Alarm off"}</span></button>
      <select data-f="before" aria-label="When to alert" id="rt-b-${esc(r.id)}" ${r.alarm?"":"disabled"}>${[[0,"At the time"],[5,"5 min before"],[10,"10 min before"],[15,"15 min before"],[30,"30 min before"],[60,"1 hour before"]].map(([v,l])=>`<option value="${v}" ${(+r.before||0)===v?"selected":""}>${l}</option>`).join("")}</select></div>
    <div class="presets"><span class="small muted" style="padding:2px 4px">${esc(daysLabel(r.days)||"Custom days")} ·</span>${[["all","Every day"],["wd","Weekdays"],["we","Weekend"]].filter(([,l])=>l!==daysLabel(r.days)).map(([k,l])=>`<button type="button" data-preset="${k}">${l}</button>`).join("")}</div>
  </div>`).join(""):`<div class="empty">${S.ready?"No routine items here yet.":"Loading…"}</div>`;
  $("#cat-edit").innerHTML = S.cats.map(c=>`<span class="chip">${esc(c.name)} <span class="muted" style="font-family:var(--f-mono)">#${esc(c.tag)}</span> <button class="x" type="button" data-delcat="${esc(c.tag)}" aria-label="Remove ${esc(c.name)}">✕</button></span>`).join("");
}
// When an alarm should fire, in UTC, so the server can find due alarms with one small query.
function fireFields(r){
  const off = -new Date().getTimezoneOffset();
  const [h, m] = String(r.time || "00:00").split(":").map(Number);
  let t = h * 60 + m - (+r.before || 0) - off;
  const shift = Math.floor(t / 1440); t = ((t % 1440) + 1440) % 1440;
  const days = (r.days && r.days.length ? r.days : [0,1,2,3,4,5,6]);
  return { fireUtc: pad(Math.floor(t / 60)) + ":" + pad(t % 60), fireDaysUtc: [...new Set(days.map(d => ((d + shift) % 7 + 7) % 7))].sort(), tzOffset: off };
}
function saveRt(r){ put("routine", r.id, { ...strip(r), ...fireFields(r) }); }
// Keep stored alarm times right if they were saved before this feature or the device timezone changed.
function syncFireFields(){
  for (const r of S.routine) {
    if (!r.alarm) continue;
    const f = fireFields(r);
    if (r.fireUtc !== f.fireUtc || r.tzOffset !== f.tzOffset || JSON.stringify(r.fireDaysUtc || []) !== JSON.stringify(f.fireDaysUtc)) saveRt(r);
  }
}
$("#rt-edit").addEventListener("change", e=>{ const row=e.target.closest("[data-rid]"); if(!row||!e.target.dataset.f) return; const r=S.routine.find(x=>x.id===row.dataset.rid); if(!r) return; const f=e.target.dataset.f; const c={...r,[f]: f==="before" ? +e.target.value : e.target.value}; saveRt(c); });
$("#rt-edit").addEventListener("click", e=>{
  const bl=e.target.closest("[data-alarm]"); if(bl){ const r=S.routine.find(y=>y.id===bl.dataset.alarm); if(r) saveRt({...r, alarm:!r.alarm, before: r.before ?? 5}); return; }
  const d=e.target.closest("[data-day]"); const x=e.target.closest("[data-delrt]");
  if(d){ const row=d.closest("[data-rid]"); const r=S.routine.find(y=>y.id===row.dataset.rid); let days=r.days?[...r.days]:[0,1,2,3,4,5,6]; const i=+d.dataset.day; days=days.includes(i)?days.filter(v=>v!==i):[...days,i].sort(); saveRt({...r,days}); }
  if(x){ del("routine", x.dataset.delrt); }
});
// ---------- clear all / restore starter routine (only this account's routine)
async function batchRoutine(ops){ // ops: [["delete", id] | ["set", id, data]]
  if (!db || !FS) { ops.forEach(([op, id, d]) => op === "delete" ? del("routine", id) : put("routine", id, d)); return; }
  for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(FS); ops.slice(i, i + 400).forEach(([op, id, d]) => { const ref = doc(FS, "users/" + UID + "/routine/" + id); op === "delete" ? b.delete(ref) : b.set(ref, d); }); await b.commit(); }
}
function showRtConfirm(kind){
  const box = $("#rt-confirm"), n = S.routine.length, alarms = S.routine.filter(r => r.alarm).length;
  if (!kind) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = kind === "clear"
    ? `<p><b>Delete all ${n} routine item${n === 1 ? "" : "s"}?</b> This clears your daily routine${alarms ? `, including ${alarms} alarm${alarms === 1 ? "" : "s"}` : ""}, so you can build your own from scratch. Your tasks, to-dos, reflections and courses stay. This can't be undone.</p>
       <p class="small muted">Tip: tap <b>Download backup</b> in Account &amp; backup first if you might want it back.</p>
       <div class="row"><button class="btn sm solid-danger" type="button" data-rtc="clear">Yes, clear all</button><button class="btn sm" type="button" data-rtc="cancel">Cancel</button></div>`
    : `<p><b>Add the starter routine?</b> This adds ${Object.keys(SEED.routine).length} general weekday and weekend items (wake up, meals, breaks, reflection, sleep) that you can edit.${n ? ` Your current ${n} item${n === 1 ? "" : "s"} stay${n === 1 ? "s" : ""} too.` : ""}</p>
       <div class="row"><button class="btn sm primary" type="button" data-rtc="restore">Add starter routine</button><button class="btn sm" type="button" data-rtc="cancel">Cancel</button></div>`;
  box.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
$("#rt-clear").onclick = () => { if (!S.routine.length) { toast("Your routine is already empty"); return; } showRtConfirm("clear"); };
$("#rt-restore").onclick = () => showRtConfirm("restore");
$("#rt-confirm").addEventListener("click", async e => {
  const b = e.target.closest("[data-rtc]"); if (!b) return;
  const act = b.dataset.rtc;
  if (act === "cancel") { showRtConfirm(null); return; }
  b.disabled = true;
  try {
    if (act === "clear") { const n = S.routine.length; await batchRoutine(S.routine.map(r => ["delete", r.id])); toast(`Cleared ${n} routine item${n === 1 ? "" : "s"}. Add your own with "Add routine item".`); }
    else { const items = Object.values(SEED.routine).map(r => ["set", newId(), { ...r, ...(r.alarm ? fireFields(r) : {}) }]); await batchRoutine(items); toast("Starter routine added"); }
    showRtConfirm(null);
  } catch (err) { console.error(err); toast("Couldn't update your routine. Check your connection and try again."); b.disabled = false; }
});
$("#rt-add").onclick=()=>{ put("routine", newId(), {time:"12:00",label:"New item",kind:"other",days: S.rtFilter==="wd"?[1,2,3,4,5]:S.rtFilter==="we"?[0,6]:[0,1,2,3,4,5,6]}); toast("Item added. Edit its time and name below."); };
$("#addonce").addEventListener("submit", e=>{ e.preventDefault(); const l=$("#ao-l").value.trim(), t=$("#ao-t").value||"12:00"; if(!l){ toast("Type what's happening first"); return; }
  const k=viewKey(), dd=dayDoc(k); saveDay(k, {...dd, extra:[...(dd.extra||[]), {id:newId(), time:t, label:l, kind:"other"}]}); $("#ao-l").value=""; toast("Added for "+fmtDate(k)); });
$("#cat-form").addEventListener("submit",e=>{ e.preventDefault(); const n=$("#cat-new").value.trim(); if(!n) return; let tag=n.split(/[\s\/]+/)[0].toLowerCase().replace(/[^a-z0-9-]/g,"")||"cat"; while(S.cats.find(c=>c.tag===tag)) tag+="2"; S.cats.push({name:n,tag}); saveCats(); $("#cat-new").value=""; renderRoutine(); });
$("#cat-edit").addEventListener("click",e=>{ const b=e.target.closest("[data-delcat]"); if(!b) return; S.cats=S.cats.filter(c=>c.tag!==b.dataset.delcat); saveCats(); renderRoutine(); });

// ---------- global clicks
document.addEventListener("click", e=>{
  const t=e.target.closest("[data-task]"); if(t){ openTask(t.dataset.task); return; }
  const st=e.target.closest("[data-st]"); if(st){ S.stFilter = S.stFilter===st.dataset.st && st.classList.contains("stat") ? "open" : st.dataset.st; renderWork(); return; }
  const c=e.target.closest("[data-cat]"); if(c){ S.catFilter = c.dataset.cat==="" ? null : (S.catFilter===c.dataset.cat?null:c.dataset.cat); renderWork(); return; }
  const dt=e.target.closest("[data-deltodo]"); if(dt){ del("todos",dt.dataset.deltodo); return; }
  const off=e.target.closest("[data-dayoff]"); if(off){ S.dayOff=Math.max(-1,Math.min(6,S.dayOff+ +off.dataset.dayoff)); watchChecks(); renderToday(); return; }
  if(e.target.closest("[data-dayreset]")){ S.dayOff=0; watchChecks(); renderToday(); return; }
  const sk=e.target.closest("[data-skip]"); if(sk){ const k=viewKey(), dd=dayDoc(k), s={...(dd.skip||{})}; if(s[sk.dataset.skip]) delete s[sk.dataset.skip]; else s[sk.dataset.skip]=true; saveDay(k,{...dd,skip:s}); return; }
  const dx=e.target.closest("[data-delextra]"); if(dx){ const k=viewKey(), dd=dayDoc(k), x0=(dd.extra||[]).find(x=>x.id===dx.dataset.delextra), skip={...(dd.skip||{})}; if(x0&&x0.from){ delete skip[x0.from]; } saveDay(k,{...dd,skip,extra:(dd.extra||[]).filter(x=>x.id!==dx.dataset.delextra)}); if(x0&&x0.from) toast("Back to your usual routine"); return; }
  const ov=e.target.closest("[data-ovr]"); if(ov){ S.ovRange=+ov.dataset.ovr; renderOverview(); return; }
  const ot=e.target.closest("[data-ovt]"); if(ot){ S.ovOpen = S.ovOpen===ot.dataset.ovt ? null : ot.dataset.ovt; renderOverview(); if(S.ovOpen && matchMedia("(max-width:700px)").matches) $("#ov-detail").scrollIntoView({block:"nearest",behavior:"smooth"}); return; }
  const od=e.target.closest("[data-ovday]"); if(od){ S.calSel=od.dataset.ovday; const [y,m]=od.dataset.ovday.split("-").map(Number); S.calY=y; S.calM=m-1; location.hash="#work-calendar"; return; }
  const rf=e.target.closest("[data-rtf]"); if(rf){ S.rtFilter=rf.dataset.rtf; renderRoutine(); return; }
  const ps=e.target.closest("[data-preset]"); if(ps){ const r=S.routine.find(y=>y.id===ps.closest("[data-rid]").dataset.rid); const days={all:[0,1,2,3,4,5,6],wd:[1,2,3,4,5],we:[0,6]}[ps.dataset.preset]; if(r) saveRt({...r,days}); return; }
  const rd=e.target.closest("[data-rdate]"); if(rd){ rDate=rd.dataset.rdate; rDirty=false; if(S.main==="journal"&&S.sub!=="reflection"){ location.hash="#journal"; } else { renderReflect(); window.scrollTo({top:0}); } }
});
document.addEventListener("change", e=>{
  const ck=e.target.closest("[data-check]");
  if(ck){ const k=viewKey(); const dd=dayDoc(k); const cur={...(dd.done||{})}; if(ck.checked) cur[ck.dataset.check]=fmtTime(nowISO()); else delete cur[ck.dataset.check];
    saveDay(k, {...dd, done:cur}); }
  const td=e.target.closest("[data-todo]");
  if(td){ const t=S.todos.find(x=>x.id===td.dataset.todo); if(t){ put("todos", t.id, {...strip(t), done:td.checked, doneAt: td.checked?nowISO():""}); } }
});
setInterval(()=>{ if(S.view==="today" && !document.querySelector("dialog[open]")) renderToday(); }, 60000);


// ---------- Firebase data adapter (same shape the rest of the app uses)
function mkdb(fs, uid){
  const base = "users/" + uid + "/";
  const wrapDoc = s => ({ id: s.id, exists: s.exists(), data: () => s.data() });
  const wrapQ = s => ({ docs: s.docs.map(d => ({ id: d.id, exists: true, data: () => d.data() })), size: s.size, empty: s.empty });
  const docRef = r => ({ id: r.id, path: r.path,
    set: d => setDoc(r, d), update: d => updateDoc(r, d), delete: () => deleteDoc(r),
    get: async () => wrapDoc(await getDoc(r)),
    onSnapshot: (n, e) => onSnapshot(r, s => n(wrapDoc(s)), e) });
  const q = (c, cons = []) => ({
    orderBy: (f, d) => q(c, [...cons, orderBy(f, d || "asc")]),
    limit: n => q(c, [...cons, limit(n)]),
    where: (f, o, v) => q(c, [...cons, where(f, o, v)]),
    get: async () => wrapQ(await getDocs(query(c, ...cons))),
    onSnapshot: (n, e) => onSnapshot(query(c, ...cons), s => n(wrapQ(s)), e) });
  return {
    doc: p => docRef(doc(fs, base + p)),
    collection: p => { const c = collection(fs, base + p);
      return Object.assign(q(c), { path: c.path, doc: id => docRef(id ? doc(c, id) : doc(c)),
        add: async d => { const r = doc(c); await setDoc(r, d); return docRef(r); } }); }
  };
}
let FS = null, UID = null, APP = null;
async function seedIfEmpty(){
  const s = await getDoc(doc(FS, "users/" + UID + "/settings/main"));
  if (s.exists()) return;
  const b = writeBatch(FS);
  b.set(doc(FS, "users/" + UID + "/settings/main"), SEED.settings);
  for (const [id, r] of Object.entries(SEED.routine)) b.set(doc(FS, "users/" + UID + "/routine/" + id), r);
  for (const [id, t] of Object.entries(SEED.tasks)) b.set(doc(FS, "users/" + UID + "/tasks/" + id), t);
  await b.commit();
}
function dataProblem(e){
  console.error(e);
  if (e && e.code === "permission-denied") { $("#rules").hidden = false; }
}

// ---------- live data
function startData(){
  const fail = dataProblem;
  let loaded = 0; const mark = () => { if (++loaded >= 5) { S.ready = true; leaveSplash(); } render(); };
  const sub = (coll, key) => { let first = true; db.collection(coll).onSnapshot(s => { S[key] = s.docs.map(d => ({ ...d.data(), id: d.id })); if (first) { first = false; mark(); } else render(); }, fail); };
  sub("tasks", "tasks"); sub("todos", "todos");
  { let first = true; db.collection("routine").onSnapshot(s => { S.routine = s.docs.map(d => ({ ...d.data(), id: d.id })); if (first) { first = false; mark(); refreshPush(true); } else render(); clearTimeout(syncFireFields._t); syncFireFields._t = setTimeout(syncFireFields, 1500); }, fail); }
  db.collection("health").orderBy("date", "desc").limit(400).onSnapshot(s => { const o = {}; s.docs.forEach(d => o[d.id] = d.data()); S.health = o; render(); }, fail);
  db.collection("subjects").onSnapshot(s => { S.subjects = s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")); render(); }, fail);
  db.collection("classes").onSnapshot(s => { S.classes = s.docs.map(d => ({ ...d.data(), id: d.id })); render(); }, fail);
  db.collection("snotes").onSnapshot(s => { S.snotes = s.docs.map(d => ({ ...d.data(), id: d.id })); render(); }, fail);
  db.collection("assignments").onSnapshot(s => { S.asg = s.docs.map(d => ({ ...d.data(), id: d.id })); render(); }, fail);
  db.collection("shop").onSnapshot(s => { S.shop = s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")); render(); }, fail);
  db.collection("expenses").orderBy("date", "desc").limit(3000).onSnapshot(s => { S.exp = s.docs.map(d => ({ ...d.data(), id: d.id })); render(); }, fail);
  db.collection("body").onSnapshot(s => { S.body = s.docs.map(d => ({ ...d.data(), id: d.id })); render(); }, fail);
  db.collection("conditions").onSnapshot(s => { S.conds = s.docs.map(d => ({ ...d.data(), id: d.id })); render(); }, fail);
  db.collection("courses").onSnapshot(s => { S.courses = s.docs.map(d => ({ ...d.data(), id: d.id })); render(); }, fail);
  db.collection("time").orderBy("start", "desc").limit(1500).onSnapshot(s => { S.time = s.docs.map(d => ({ ...d.data(), id: d.id })); render(); }, fail);
  db.doc("settings/timer").onSnapshot(s => { const t = s.exists ? s.data() : null; const changed = JSON.stringify(t) !== JSON.stringify(S.timer); S.timer = t && t.start ? t : null; if (changed) render(); }, fail);
  let f1 = true; db.doc("settings/main").onSnapshot(s => { const c = s.exists && s.data().categories; S.cats = c && c.length ? c.map(x => ({ ...x })) : DEFAULT_CATS.slice(); S.org = (s.exists && s.data().org) || ""; S.name = (s.exists && s.data().name) || ""; S.calSync = (s.exists && s.data().calSync) || null; if (s.exists && s.data().waterGoal) S.waterGoal = s.data().waterGoal; if (s.exists && s.data().showCycle === false) S.showCycle = false; if (s.exists) { const sd = s.data(); if (sd.cur) S.cur = sd.cur; if (sd.budget) S.budget = sd.budget; if (Array.isArray(sd.shopHist)) S.shopHist = sd.shopHist; if (sd.semStart !== undefined) S.semStart = sd.semStart || ""; if (sd.semWeeks) S.semWeeks = sd.semWeeks; if (sd.prevCgpa !== undefined) S.prevCgpa = sd.prevCgpa; if (sd.prevCredits !== undefined) S.prevCredits = sd.prevCredits; if (sd.curSem !== undefined) S.curSem = sd.curSem || ""; if (Array.isArray(sd.semBreaks)) S.semBreaks = sd.semBreaks; } if (document.activeElement !== $("#org")) $("#org").value = S.org; if (document.activeElement !== $("#uname")) $("#uname").value = S.name; if (f1) { f1 = false; mark(); } else render(); }, fail);
  let f2 = true; db.collection("reflections").orderBy("date", "desc").limit(1000).onSnapshot(s => { const o = {}; s.docs.forEach(d => o[d.id] = d.data()); S.refl = o; if (f2) { f2 = false; mark(); } else render(); }, fail);
  let watchedDay = null, unsubCheck = null;
  watchChecks = () => { const k = viewKey(); if (k === watchedDay) return; watchedDay = k; if (unsubCheck) unsubCheck(); unsubCheck = db.doc("checks/" + k).onSnapshot(s => { const d = s.exists ? s.data() : {}; S.day[k] = { done: d.done || {}, skip: d.skip || {}, extra: d.extra || [] }; render(); }, fail); };
  watchChecks(); setInterval(watchChecks, 60000);
  db.collection("checks").orderBy("date", "desc").limit(70).onSnapshot(s => { s.docs.forEach(d => { const x = d.data(); S.day[d.id] = { done: x.done || {}, skip: x.skip || {}, extra: x.extra || [] }; }); render(); }, fail);
}

// ---------- workplace line on reports
$("#org").addEventListener("change", () => { S.org = $("#org").value.trim(); saveCats(); toast(S.org ? "Saved. Reports will show this line." : "Removed from reports"); });

$("#uname").addEventListener("change", () => { S.name = $("#uname").value.trim(); saveCats(); render(); toast("Saved"); });

// ---------- backup
$("#bk-export").onclick = () => {
  const data = { app: "daybook", exportedAt: nowISO(), settings: { categories: S.cats },
    tasks: S.tasks, todos: S.todos, routine: S.routine, refl: S.refl, day: S.day,
    courses: S.courses, time: S.time, health: S.health, body: S.body, conditions: S.conds, shop: S.shop, expenses: S.exp, subjects: S.subjects, classes: S.classes, assignments: S.asg, snotes: S.snotes };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = "daybook-backup-" + todayKey() + ".json"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000); toast("Backup downloaded");
};
$("#bk-import").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f || !FS) return;
  try {
    const d = JSON.parse(await f.text()); if (d.app !== "daybook") throw new Error("not a Daybook backup");
    const ops = [];
    if (d.settings) ops.push(["settings/main", d.settings]);
    (d.tasks || []).forEach(t => ops.push(["tasks/" + t.id, strip(t)]));
    (d.todos || []).forEach(t => ops.push(["todos/" + t.id, strip(t)]));
    (d.routine || []).forEach(t => ops.push(["routine/" + t.id, strip(t)]));
    Object.entries(d.refl || {}).forEach(([k, v]) => ops.push(["reflections/" + k, v]));
    (d.courses || []).forEach(t => ops.push(["courses/" + t.id, strip(t)]));
    (d.time || []).forEach(t => ops.push(["time/" + t.id, strip(t)]));
    (d.body || []).forEach(t => ops.push(["body/" + t.id, strip(t)]));
    (d.snotes || []).forEach(t => ops.push(["snotes/" + t.id, strip(t)]));
    (d.subjects || []).forEach(t => ops.push(["subjects/" + t.id, strip(t)]));
    (d.classes || []).forEach(t => ops.push(["classes/" + t.id, strip(t)]));
    (d.assignments || []).forEach(t => ops.push(["assignments/" + t.id, strip(t)]));
    (d.shop || []).forEach(t => ops.push(["shop/" + t.id, strip(t)]));
    (d.expenses || []).forEach(t => ops.push(["expenses/" + t.id, strip(t)]));
    (d.conditions || []).forEach(t => ops.push(["conditions/" + t.id, strip(t)]));
    Object.entries(d.health || {}).forEach(([k, v]) => ops.push(["health/" + k, v]));
    Object.entries(d.day || {}).forEach(([k, v]) => ops.push(["checks/" + k, { date: k, done: v.done || {}, skip: v.skip || {}, extra: v.extra || [] }]));
    for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(FS); ops.slice(i, i + 400).forEach(([p, v]) => b.set(doc(FS, "users/" + UID + "/" + p), v)); await b.commit(); }
    toast("Backup restored: " + ops.length + " items");
  } catch (err) { console.error(err); toast("That file couldn't be restored. Choose a Daybook backup .json file."); }
};

// ---------- sign-in screen
const AUTH_MSG = {
  "auth/invalid-credential": "Email or password is wrong.", "auth/wrong-password": "Email or password is wrong.", "auth/user-not-found": "No account with that email. Tap Create account.",
  "auth/email-already-in-use": "That email already has an account. Tap Sign in.", "auth/weak-password": "Use a password with at least 6 characters.",
  "auth/invalid-email": "That email address doesn't look right.", "auth/operation-not-allowed": "New accounts are switched off for this Daybook. Ask the owner to add you.",
  "auth/network-request-failed": "No internet connection. Connect and try again.", "auth/too-many-requests": "Too many tries. Wait a minute and try again.",
  "auth/unauthorized-domain": "This web address isn't allowed yet. Add it under Firebase Authentication → Settings → Authorized domains (setup step 6).",
  "auth/admin-restricted-operation": "New accounts are switched off for this Daybook. Ask the owner to add you.",
  "auth/configuration-not-found": "Email/Password sign-in isn't switched on in Firebase yet (setup step 2)."
};
function showAuth(mode){
  $("#auth").hidden = false; document.body.classList.add("locked");
  $("#auth-loading").hidden = mode !== "loading";
  $("#auth-setup").hidden = mode !== "setup"; $("#auth-form").hidden = mode !== "signin";
}
function hideAuth(){ $("#auth").hidden = true; document.body.classList.remove("locked"); }
const authErr = e => { $("#auth-err").textContent = AUTH_MSG[e && e.code] || ("Something went wrong: " + (e && (e.code || e.message))); };

// ---------- boot
route();
updateHint();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
const setOnline = () => { $("#offline").hidden = navigator.onLine; };
addEventListener("online", setOnline); addEventListener("offline", setOnline); setOnline();

// keep sticky side panels below the header
const setHdr = () => { const h=document.querySelector("header.top"); if(h) document.documentElement.style.setProperty("--hdr", h.offsetHeight+"px"); };
addEventListener("resize", setHdr); setHdr(); setTimeout(setHdr, 500);

// ---------- opening screen
const SPLASH_MIN = 1800;
let splashReady = false, splashGone = false;
function leaveSplash(now){
  const sp = $("#splash"); if (!sp || splashGone) return;
  splashReady = true; $("#sp-hint").textContent = "Tap to continue";
  const wait = now ? 0 : Math.max(0, SPLASH_MIN - (Date.now() - (window.__splashStart || 0)));
  clearTimeout(leaveSplash._t);
  leaveSplash._t = setTimeout(() => { if (splashGone) return; splashGone = true; sp.classList.add("out"); setTimeout(() => sp.remove(), 650); }, wait);
}
$("#splash")?.addEventListener("click", () => { if (splashReady) leaveSplash(true); });
setTimeout(() => leaveSplash(), 8000); // never keep the opening screen longer than this

const notConfigured = !firebaseConfig || !firebaseConfig.apiKey || /PASTE/i.test(firebaseConfig.apiKey);
if (notConfigured) { showAuth("setup"); leaveSplash(); }
else {
  const app = initializeApp(firebaseConfig); APP = app;
  const auth = getAuth(app);
  try { FS = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
  catch (e) { FS = getFirestore(app); }
  onAuthStateChanged(auth, async user => {
    if (!user) { if (db) { location.reload(); return; } showAuth("signin"); leaveSplash(); return; }
    hideAuth(); $("#acct-email").textContent = user.email || "";
    UID = user.uid; db = mkdb(FS, UID);
    try { await seedIfEmpty(); } catch (e) { dataProblem(e); }
    startData();
  });
  const creds = () => [$("#a-email").value.trim(), $("#a-pass").value];
  const filled = () => { const [e, p] = creds(); if (!e || !p) { $("#auth-err").textContent = "Type your email and password first."; return false; } if (p.length < 6) { $("#auth-err").textContent = "Use a password with at least 6 characters."; return false; } return true; };
  $("#auth-form").addEventListener("submit", async e => { e.preventDefault(); $("#auth-err").textContent = "";
    try { await signInWithEmailAndPassword(auth, ...creds()); } catch (err) { authErr(err); } });
  $("#a-create").onclick = async () => { $("#auth-err").textContent = ""; if (!filled()) return;
    try { await createUserWithEmailAndPassword(auth, ...creds()); } catch (err) { authErr(err); } };
  $("#a-forgot").onclick = async () => { const em = $("#a-email").value.trim(); if (!em) { $("#auth-err").textContent = "Type your email first, then tap Forgot password."; return; }
    try { await sendPasswordResetEmail(auth, em); $("#auth-err").textContent = "Reset link sent. Check your inbox."; } catch (err) { authErr(err); } };
  $("#signout").onclick = () => signOut(auth);
}
