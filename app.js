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
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2200); }

// ---------- data ops (db or in-memory fallback)
function newId(){ return db ? db.collection("tasks").doc().id : Math.random().toString(36).slice(2,12); }
function put(coll, id, data){
  const list = coll==="tasks"?S.tasks:coll==="todos"?S.todos:coll==="routine"?S.routine:null;
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
function saveCats(){ if(!db){ render(); return; } write("settings/main", () => db.doc("settings/main").set({categories:S.cats, org:S.org||"", name:S.name||"", calSync:S.calSync||null})); }

// ---------- look & feel helpers
const SVG = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  meal: '<path d="M4 3v7a2 2 0 0 0 2 2h1v9"/><path d="M8 3v6"/><path d="M6 3v6"/><path d="M18 21V3c-2 1-3 3.5-3 7v4h3"/>',
  supplement: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-40 12 12)"/><path d="m9.2 9.6 5.2 4.6"/>',
  break: '<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 2.5v2.5M12 2.5v2.5"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  study: '<path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"/>',
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
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  flame: '<path d="M12 22c4 0 7-2.7 7-6.8 0-3.6-2.3-5.6-3.6-7.6-.4 1.7-1.3 2.9-2.4 3.4.3-3.1-1-6.6-3.9-9-.3 3.6-2.5 5.6-4 7.7C3.9 11.6 5 13.2 5 15.2 5 19.3 8 22 12 22z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
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
function updateHint(){
  const v=$("#q").value; const p=parseQuick(v);
  const mode = (p.work ? "work" : S.mode);
  if(p.work && S.mode!=="work"){ setMode("work", true); S.autoWork=true; }
  else if(!p.work && S.autoWork){ setMode("todo", true); S.autoWork=false; }
  const h=$("#qhint");
  if(!v.trim()){ h.innerHTML = mode==="work"
    ? 'Tags: <code>#sql</code> <code>#excel</code> <code>#python</code> <code>#admin</code> · urgency <code>!critical</code> <code>!high</code> <code>!med</code> <code>!low</code> · due <code>@fri</code> <code>@tmr</code> <code>@3/11</code>'
    : 'Type a to-do and press Enter. <code>@tmr</code> sets a date. Add <code>#tag</code> or <code>!high</code> to make it a work task.'; return; }
  const bits=[];
  bits.push('<span class="tag">'+(mode==="work"?"Work task":"To-do")+'</span>');
  if(mode==="work"){ bits.push('<span class="tag">'+esc(p.cat?catName(p.cat):p.newCat?("New: "+p.newCat):"Uncategorised")+'</span>'); bits.push('<span class="urg '+(p.urg||"medium")+'">'+(p.urg||"medium")+'</span>'); }
  if(p.due) bits.push('<span>due '+esc(fmtDate(p.due))+'</span>');
  h.innerHTML=bits.join(" ");
}
function setMode(m, auto){ if(!auto) S.autoWork=false; S.mode=m; $("#m-todo").setAttribute("aria-pressed",m==="todo"); $("#m-work").setAttribute("aria-pressed",m==="work"); if(!auto) updateHint(); }
$("#m-todo").onclick=()=>setMode("todo"); $("#m-work").onclick=()=>setMode("work");
$("#q").addEventListener("input", updateHint);
$("#quick").addEventListener("submit", e => {
  e.preventDefault(); const p=parseQuick($("#q").value); if(!p.title){ toast("Type a name first"); return; }
  const work = p.work || S.mode==="work";
  if(work){
    let cat=p.cat;
    if(p.newCat){ const tag=p.newCat.toLowerCase().replace(/[^a-z0-9-]/g,""); const name=p.newCat.charAt(0).toUpperCase()+p.newCat.slice(1); if(!S.cats.find(c=>c.tag===tag)){ S.cats.push({name,tag}); saveCats(); } cat=tag; }
    const id=newId();
    put("tasks", id, {title:p.title,desc:"",category:cat||"",urgency:p.urg||"medium",status:"todo",progress:0,bottleneck:"",assignedBy:"",due:p.due||"",createdAt:nowISO(),updatedAt:nowISO(),doneAt:"",log:[{at:nowISO(),note:"Task added"}]});
    toast("Work task added");
  } else {
    put("todos", newId(), {title:p.title,date:p.due||todayKey(),done:false,doneAt:"",createdAt:nowISO()});
    toast("To-do added");
  }
  $("#q").value=""; updateHint();
});

// ---------- routing
const VIEWS=["today","work","calendar","overview","growth","reflect","routine"];
function route(){ const h=location.hash.slice(1); S.view=VIEWS.includes(h)?h:"today";
  if(S.view==="work") setMode("work"); else if(S.view==="today") setMode("todo");
  render(); }
window.addEventListener("hashchange", route);

// ---------- render
function render(){
  $("#today-label").textContent = fmtDate(todayKey())+" "+new Date().getFullYear();
  for(const v of VIEWS){ $("#v-"+v).hidden = v!==S.view; }
  document.querySelectorAll("#tabs a").forEach(a=>{ if(a.dataset.v===S.view) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current"); });
  $("#c-work").textContent = S.tasks.filter(t=>t.status!=="done").length;
  if(S.view==="today") renderToday();
  if(S.view==="work") renderWork();
  if(S.view==="calendar") renderCalendar();
  if(S.view==="overview") renderOverview();
  if(S.view==="growth") renderGrowth();
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
    <span class="stripe"></span><span class="body">
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
  return [...S.routine.filter(r=>!r.days||r.days.includes(wd)), ...(dd.extra||[]).map(x=>({...x,extra:true}))].sort((a,b)=>a.time.localeCompare(b.time)); }
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
  $("#timeline").innerHTML = items.length ? items.map(r=>{ const sk=!!skip[r.id];
    return `<li class="${done[r.id]?"done":""} ${sk?"skipped":""} ${r.time<nowHM?"past":""} ${next&&next.id===r.id?"next":""}">
    <span class="tm">${esc(r.time)}</span><input type="checkbox" data-check="${esc(r.id)}" ${done[r.id]?"checked":""} ${sk?"disabled":""} aria-label="Done: ${esc(r.label)}">
    <span class="lbl">${routineIcon(r)}<span>${esc(r.label)}${r.alarm&&!r.extra?`<span class="tl-bell" title="Alarm ${+r.before?(+r.before)+" min before":"at the time"}">${SVG(ICON.bell)}</span>`:""}${sk?'<span class="pill">Skipped</span>':""}${r.extra?'<span class="pill">This day only</span>':""}</span></span>
    <span class="kind">${esc((KINDS.find(x=>x[0]===r.kind)||["","Other"])[1])}</span>
    ${r.extra ? `<button class="x" type="button" data-delextra="${esc(r.id)}" aria-label="Remove ${esc(r.label)}">✕</button>`
      : `<button class="x small" type="button" data-skip="${esc(r.id)}">${sk?"Undo":"Skip"}</button>`}</li>`; }).join("")
    : `<li class="empty" style="display:block">${S.ready?"Nothing scheduled for this day.":"Loading…"}</li>`;
  const open=S.todos.filter(t=>!t.done && (!t.date||t.date<=tk)).sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  const later=S.todos.filter(t=>!t.done && t.date>tk).sort((a,b)=>a.date.localeCompare(b.date));
  $("#todo-meta").textContent = later.length?`${later.length} scheduled later`:"";
  const row = t => `<li class="${t.done?"done":""}"><input type="checkbox" data-todo="${esc(t.id)}" ${t.done?"checked":""} aria-label="Done: ${esc(t.title)}">
    <span class="grow"><span>${esc(t.title)}</span>${t.date&&t.date!==tk?`<div class="sub ${t.date<tk&&!t.done?"overdue":""}">${t.date<tk?"From ":""}${esc(fmtDate(t.date))}</div>`:""}</span>
    <button class="x" type="button" data-deltodo="${esc(t.id)}" aria-label="Delete">✕</button></li>`;
  $("#todos").innerHTML = (open.length||later.length) ? open.map(row).join("") + (later.length?`<li class="sub" style="background:var(--sunk)">Later</li>`+later.map(row).join(""):"")
    : `<li class="empty">${S.ready?"Nothing to do. Add one in the box above.":"Loading…"}</li>`;
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
  confirmDel=false; drawTask(); if(!$("#dlg").open) $("#dlg").showModal();
}
function autoProgress(){
  const s=editing.subtasks; if(!s.length) return;
  editing.progress=Math.round(s.filter(x=>x.done).length/s.length*100);
  if(editing.progress>0 && editing.status==="todo") editing.status="doing";
}
function drawTask(){
  const t=editing, subs=t.subtasks, mins=taskMins(t.id);
  $("#tf").innerHTML = `<h3>Work task</h3>
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
      <div class="qrow wrap"><input id="t-linkurl" type="url" placeholder="Paste a link (shared drive, sheet, ticket)" class="inp"><input id="t-linklabel" placeholder="Name (optional)" class="inp" style="max-width:180px"><button class="btn sm" type="button" id="t-linkadd">Add link</button></div></div>
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
S.ovRange=7;
function rangeKeys(n){ const out=[]; const d=new Date(); d.setDate(d.getDate()-(n-1)); for(let i=0;i<n;i++){ out.push(dkey(d)); d.setDate(d.getDate()+1); } return out; }
function startKey(){
  const c=[...S.tasks.map(t=>isoDay(t.createdAt)), ...S.todos.map(t=>isoDay(t.createdAt)), ...Object.keys(S.refl), ...Object.keys(S.day).filter(k=>k<=todayKey())].filter(Boolean).sort();
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
  const wAct = keys.map(k=> k<st?null: S.tasks.reduce((a,t)=>a+(t.log||[]).filter(l=>isoDay(l.at)===k).length,0));
  const tasksDone=S.tasks.filter(t=>t.status==="done"&&inR(isoDay(t.doneAt)));
  const updates=wAct.reduce((a,b)=>a+(b||0),0);
  const todosDone=S.todos.filter(t=>t.done&&inR(isoDay(t.doneAt))).length;
  const weekdays=active.filter(k=>!isWeekend(keyDow(k))).length;
  const refls=Object.values(S.refl).filter(r=>inR(r.date));
  const moods=refls.filter(r=>r.mood).map(r=>r.mood);
  const open=S.tasks.filter(t=>t.status!=="done");
  const tile=(v,l,s)=>`<div class="tile"><span>${l}</span><b>${v}</b>${s?`<small>${s}</small>`:""}</div>`;
  $("#ov-tiles").innerHTML = [
    tile(tasksDone.length,"Work tasks done",`${open.length} still open`),
    tile(updates,"Task updates logged",""),
    tile(todosDone,"To-dos done",""),
    tile(schedTot?Math.round(doneTot/schedTot*100)+"%":"–","Routine kept",`${doneTot} of ${schedTot} items`),
    tile(`${refls.length}<span style="font-size:.9rem;text-transform:none;letter-spacing:0">/${weekdays||0}</span>`,"Reflections","written vs workdays"),
    tile(moods.length?(moods.reduce((a,b)=>a+b,0)/moods.length).toFixed(1):"–","Avg energy",moods.length?"out of 5":"rate it in Reflection")
  ].join("");
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
  for (const c of S.courses) { const hay = [c.name, ...(c.modules || []).map(m => m.title)].join(" \n "); if (match(hay)) R.push({ g: "Courses", title: c.name, sub: `${(c.modules || []).filter(m => m.done).length}/${(c.modules || []).length} modules`, snip: match(c.name) ? "" : snippet(hay, q), act: `data-sr-view="growth"` }); }
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
  const anyDue = keys.some(k => dues(k).length);
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
      ${anyDue ? `<div class="sch-ad-lbl">Due</div>${keys.map(k => `<div class="sch-ad">${dues(k).map(t => `<div class="ev-due cat-${catIdx(t.category)}" data-task="${esc(t.id)}" title="Due: ${esc(t.title)}">${esc(t.title)}</div>`).join("")}</div>`).join("")}` : ""}
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
  const wl=workLogFor(rDate);
  const doneTodos=S.todos.filter(t=>t.done&&isoDay(t.doneAt)===rDate);
  $("#r-auto").innerHTML = `<b>Pulled from your tasks for ${esc(fmtDate(rDate))}</b>` + (wl.length||doneTodos.length ? `<ul>${wl.map(x=>`<li><b>${esc(x.t.title)}</b> <span class="muted">(${esc(catName(x.t.category))}, ${esc(STATUS_LABEL[x.t.status])} ${+x.t.progress||0}%)</span>${x.entries.length?": "+x.entries.map(e=>esc(e.note)).join("; "):" — added"}</li>`).join("")}${doneTodos.map(t=>`<li>${esc(t.title)} <span class="muted">(to-do done)</span></li>`).join("")}</ul>` : `<div class="muted small">No task updates logged on this day. Updates you log on work tasks appear here automatically.</div>`);
  const hist=Object.values(S.refl).sort((a,b)=>b.date.localeCompare(a.date));
  $("#r-history").innerHTML = hist.length?hist.map(h=>`<li><span class="grow"><span>${esc(fmtDate(h.date))}</span><div class="sub">${esc((h.learned||h.did||"").slice(0,90))}</div></span>${h.mood?`<span class="small muted" style="font-family:var(--f-mono)">energy ${h.mood}/5</span>`:""}<button class="btn sm" type="button" data-rdate="${esc(h.date)}">Open</button></li>`).join(""):`<li class="empty">Your saved reflections will be listed here.</li>`;
}
["#r-did","#r-learned","#r-mistakes","#r-improve"].forEach(s=>$(s).addEventListener("input",()=>{ rDirty=true; $("#r-saved").textContent="Unsaved changes"; }));
["#r-did","#r-learned","#r-mistakes","#r-improve"].forEach(s=>$(s).addEventListener("blur",()=>{ if(rDirty) saveRefl(true); }));
$("#r-date").addEventListener("change",e=>{ if(rDirty) saveRefl(true); rDate=e.target.value||todayKey(); rDirty=false; renderReflect(); });
$("#r-mood").addEventListener("click",e=>{ const b=e.target.closest("[data-mood]"); if(!b) return; rMood=+b.dataset.mood; rDirty=true; saveRefl(true); });
$("#r-save").onclick=()=>saveRefl(false);
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
  const dx=e.target.closest("[data-delextra]"); if(dx){ const k=viewKey(), dd=dayDoc(k); saveDay(k,{...dd,extra:(dd.extra||[]).filter(x=>x.id!==dx.dataset.delextra)}); return; }
  const ov=e.target.closest("[data-ovr]"); if(ov){ S.ovRange=+ov.dataset.ovr; renderOverview(); return; }
  const rf=e.target.closest("[data-rtf]"); if(rf){ S.rtFilter=rf.dataset.rtf; renderRoutine(); return; }
  const ps=e.target.closest("[data-preset]"); if(ps){ const r=S.routine.find(y=>y.id===ps.closest("[data-rid]").dataset.rid); const days={all:[0,1,2,3,4,5,6],wd:[1,2,3,4,5],we:[0,6]}[ps.dataset.preset]; if(r) saveRt({...r,days}); return; }
  const rd=e.target.closest("[data-rdate]"); if(rd){ rDate=rd.dataset.rdate; rDirty=false; renderReflect(); window.scrollTo({top:0}); }
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
  db.collection("courses").onSnapshot(s => { S.courses = s.docs.map(d => ({ ...d.data(), id: d.id })); render(); }, fail);
  db.collection("time").orderBy("start", "desc").limit(1500).onSnapshot(s => { S.time = s.docs.map(d => ({ ...d.data(), id: d.id })); render(); }, fail);
  db.doc("settings/timer").onSnapshot(s => { const t = s.exists ? s.data() : null; const changed = JSON.stringify(t) !== JSON.stringify(S.timer); S.timer = t && t.start ? t : null; if (changed) render(); }, fail);
  let f1 = true; db.doc("settings/main").onSnapshot(s => { const c = s.exists && s.data().categories; S.cats = c && c.length ? c.map(x => ({ ...x })) : DEFAULT_CATS.slice(); S.org = (s.exists && s.data().org) || ""; S.name = (s.exists && s.data().name) || ""; S.calSync = (s.exists && s.data().calSync) || null; if (document.activeElement !== $("#org")) $("#org").value = S.org; if (document.activeElement !== $("#uname")) $("#uname").value = S.name; if (f1) { f1 = false; mark(); } else render(); }, fail);
  let f2 = true; db.collection("reflections").orderBy("date", "desc").limit(90).onSnapshot(s => { const o = {}; s.docs.forEach(d => o[d.id] = d.data()); S.refl = o; if (f2) { f2 = false; mark(); } else render(); }, fail);
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
    tasks: S.tasks, todos: S.todos, routine: S.routine, refl: S.refl, day: S.day };
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
