// Daybook app logic. Data lives in your own Firebase project.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, onSnapshot, query, orderBy, limit, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
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
function saveCats(){ if(!db){ render(); return; } write("settings/main", () => db.doc("settings/main").set({categories:S.cats})); }
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
const VIEWS=["today","work","overview","reflect","routine"];
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
  if(S.view==="overview") renderOverview();
  if(S.view==="reflect") renderReflect();
  if(S.view==="routine") renderRoutine();
}
const sortTasks = arr => arr.slice().sort((a,b)=> (a.status==="done")-(b.status==="done") || (b.status==="blocked")-(a.status==="blocked") || URG_RANK[a.urgency]-URG_RANK[b.urgency] || (a.due||"9999").localeCompare(b.due||"9999"));
function taskCard(t){
  const over = t.due && t.status!=="done" && t.due < todayKey();
  return `<button type="button" class="task ${t.status==="done"?"isdone":""}" data-u="${esc(t.urgency)}" data-task="${esc(t.id)}">
    <span class="stripe"></span><span class="body">
      <span class="ttl">${esc(t.title)}</span>
      <span class="line"><span class="urg ${esc(t.urgency)}">${esc(t.urgency)}</span><span class="tag">${esc(catName(t.category))}</span>
        <span class="st ${esc(t.status)}">${esc(STATUS_LABEL[t.status]||t.status)}</span>
        ${t.due?`<span class="${over?"overdue":""}">${over?"Overdue · ":"Due "}${esc(fmtDate(t.due))}</span>`:""}
        ${t.assignedBy?`<span>from ${esc(t.assignedBy)}</span>`:""}</span>
      <span class="line" style="gap:10px"><span class="bar" style="flex:1"><i style="width:${Math.max(0,Math.min(100,+t.progress||0))}%"></i></span><span style="font-family:var(--f-mono)">${+t.progress||0}%</span></span>
      ${t.bottleneck && t.status!=="done"?`<span class="block"><b>Bottleneck:</b> ${esc(t.bottleneck)}</span>`:""}
    </span></button>`;
}
function routineFor(k){ const wd=keyDow(k); const dd=dayDoc(k);
  return [...S.routine.filter(r=>!r.days||r.days.includes(wd)), ...(dd.extra||[]).map(x=>({...x,extra:true}))].sort((a,b)=>a.time.localeCompare(b.time)); }
function saveDay(k, dd){ S.day[k]=dd; if(db) write("checks/"+k, ()=>db.doc("checks/"+k).set({date:k,done:dd.done||{},skip:dd.skip||{},extra:dd.extra||[]})); renderToday(); }
const DAYLBL = {"-1":"Yesterday","0":"Today","1":"Tomorrow"};
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
    : !isToday ? `<span><span class="l">Planning ${esc(fmtDate(k))}</span><br><span class="s">Skip or add items for this day only. Your usual routine stays the same.</span></span> <button class="btn sm" type="button" data-dayreset style="margin-left:auto">Back to today</button>`
    : next ? `<span class="t">${esc(next.time)}</span><span><span class="l">${esc(next.label)}</span><br><span class="s">Next up${missed?` · ${missed} earlier item${missed>1?"s":""} not ticked`:""}</span></span>`
    : active.length ? `<span class="l">Routine complete for today.</span>` : `<span class="s">No routine yet. Add items in the Routine tab.</span>`;
  $("#rt-meta").textContent = active.length ? `${active.filter(r=>done[r.id]).length} of ${active.length} done` : "";
  $("#timeline").innerHTML = items.length ? items.map(r=>{ const sk=!!skip[r.id];
    return `<li class="${done[r.id]?"done":""} ${sk?"skipped":""} ${r.time<nowHM?"past":""} ${next&&next.id===r.id?"next":""}">
    <span class="tm">${esc(r.time)}</span><input type="checkbox" data-check="${esc(r.id)}" ${done[r.id]?"checked":""} ${sk?"disabled":""} aria-label="Done: ${esc(r.label)}">
    <span class="lbl">${esc(r.label)}${sk?'<span class="pill">Skipped</span>':""}${r.extra?'<span class="pill">This day only</span>':""}</span>
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
function openTask(id){
  const t=S.tasks.find(x=>x.id===id); if(!t) return; editing={...t,log:[...(t.log||[])]}; confirmDel=false; drawTask(); $("#dlg").showModal();
}
function drawTask(){
  const t=editing;
  $("#tf").innerHTML = `<h3>Work task</h3>
    <label class="f">Task<input id="t-title" value="${esc(t.title)}" required></label>
    <label class="f">Description<textarea id="t-desc" placeholder="What exactly was asked, expected output, where the data is">${esc(t.desc)}</textarea></label>
    <div class="grid2">
      <label class="f">Category<select id="t-cat"><option value="">Uncategorised</option>${S.cats.map(c=>`<option value="${esc(c.tag)}" ${c.tag===t.category?"selected":""}>${esc(c.name)}</option>`).join("")}</select></label>
      <label class="f">Due date<input type="date" id="t-due" value="${esc(t.due)}"></label>
      <label class="f">Assigned by<input id="t-by" value="${esc(t.assignedBy)}" placeholder="Supervisor's name"></label>
      <label class="f">Progress: <span id="t-pv">${+t.progress||0}%</span><input type="range" id="t-prog" min="0" max="100" step="5" value="${+t.progress||0}" style="padding:0;border:0;background:none"></label>
    </div>
    <div class="f" style="display:grid;gap:4px"><span class="small muted" style="font-weight:600">Urgency</span><div class="seg" id="t-urg">${URG.map(u=>`<button type="button" data-v="${u}" aria-pressed="${t.urgency===u}">${u[0].toUpperCase()+u.slice(1)}</button>`).join("")}</div></div>
    <div class="f" style="display:grid;gap:4px"><span class="small muted" style="font-weight:600">Status</span><div class="seg" id="t-st">${STATUS.map(([k,l])=>`<button type="button" data-v="${k}" aria-pressed="${t.status===k}">${l}</button>`).join("")}</div></div>
    <label class="f">Bottleneck<textarea id="t-block" placeholder="What's slowing this down? Waiting for data, access, clarification…" style="min-height:52px">${esc(t.bottleneck)}</textarea></label>
    <div style="display:grid;gap:6px"><span class="small muted" style="font-weight:600">Progress log</span>
      <div class="qrow"><input id="t-note" placeholder="Add an update, e.g. Finished joining the sales tables" style="flex:1;min-width:0;border:1px solid var(--line);background:var(--bg);border-radius:8px;padding:7px 10px"><button class="btn sm" type="button" id="t-addnote">Log</button></div>
      <ul class="log">${t.log.slice().reverse().map(l=>`<li><time>${esc(fmtDate(isoDay(l.at)))} ${fmtTime(l.at)}</time><span>${esc(l.note)}</span></li>`).join("")}</ul></div>
    <div class="dlgfoot">
      <button class="btn ghost danger sm" type="button" id="t-del">${confirmDel?"Tap again to delete":"Delete"}</button>
      <div style="display:flex;gap:8px"><button class="btn" type="button" id="t-cancel">Cancel</button><button class="btn primary" type="button" id="t-save">Save</button></div>
    </div>`;
}
function readTaskForm(){ const t=editing; t.title=$("#t-title").value.trim()||t.title; t.desc=$("#t-desc").value; t.category=$("#t-cat").value; t.due=$("#t-due").value; t.assignedBy=$("#t-by").value.trim(); t.progress=+$("#t-prog").value; t.bottleneck=$("#t-block").value.trim(); }
$("#tf").addEventListener("input", e=>{ if(e.target.id==="t-prog") $("#t-pv").textContent=e.target.value+"%"; });
$("#tf").addEventListener("click", e=>{
  const b=e.target.closest("button"); if(!b) return;
  if(b.parentElement.id==="t-urg"){ readTaskForm(); editing.urgency=b.dataset.v; drawTask(); }
  else if(b.parentElement.id==="t-st"){ readTaskForm(); editing.status=b.dataset.v; if(b.dataset.v==="done") editing.progress=100; drawTask(); }
  else if(b.id==="t-addnote"){ readTaskForm(); const n=$("#t-note").value.trim(); if(n){ editing.log.push({at:nowISO(),note:n}); drawTask(); $("#t-note").focus(); } }
  else if(b.id==="t-cancel"){ $("#dlg").close(); }
  else if(b.id==="t-del"){ if(!confirmDel){ readTaskForm(); confirmDel=true; drawTask(); } else { del("tasks",editing.id); $("#dlg").close(); toast("Task deleted"); } }
  else if(b.id==="t-save"){ readTaskForm(); saveTask(); }
});
$("#tf").addEventListener("keydown", e=>{ if(e.key==="Enter" && e.target.id==="t-note"){ e.preventDefault(); $("#t-addnote").click(); } });
function saveTask(){
  const t=editing, old=S.tasks.find(x=>x.id===t.id)||{};
  const pending=$("#t-note")&&$("#t-note").value.trim(); if(pending) t.log.push({at:nowISO(),note:pending});
  if(old.status!==t.status) t.log.push({at:nowISO(),note:`Status: ${STATUS_LABEL[old.status]||"—"} → ${STATUS_LABEL[t.status]}`});
  if((+old.progress||0)!==t.progress) t.log.push({at:nowISO(),note:`Progress ${+old.progress||0}% → ${t.progress}%`});
  if(t.bottleneck && t.bottleneck!==old.bottleneck) t.log.push({at:nowISO(),note:`Bottleneck: ${t.bottleneck}`});
  if(t.status==="done" && old.status!=="done") t.doneAt=nowISO();
  if(t.status!=="done") t.doneAt="";
  t.updatedAt=nowISO(); if(t.log.length>200) t.log=t.log.slice(-200);
  put("tasks", t.id, strip(t)); $("#dlg").close(); toast("Saved");
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
    return `<tr><td><span class="tag">${esc(catName(c))}</span></td><td>${op.length}</td><td>${ts.filter(t=>t.status==="blocked").length||"–"}</td><td>${ts.filter(t=>t.status==="done"&&inR(isoDay(t.doneAt))).length}</td><td>${avg===null?"–":`<span style="display:inline-flex;gap:6px;align-items:center"><span class="bar" style="width:60px"><i style="width:${avg}%"></i></span>${avg}%</span>`}</td></tr>`; }).join("")
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
  const lines=[`Daily Report — ${fmtDate(rDate)} ${rDate.slice(0,4)}`,`Internship, Bina Plastic Sdn Bhd`,``,`Work progress:`];
  wl.forEach(x=>lines.push(`- [${catName(x.t.category)}] ${x.t.title} — ${STATUS_LABEL[x.t.status]}, ${+x.t.progress||0}%${x.entries.length?" ("+x.entries.map(e=>e.note).join("; ")+")":""}${x.t.bottleneck&&x.t.status!=="done"?" | Bottleneck: "+x.t.bottleneck:""}`));
  if(!wl.length) lines.push("- (no task updates logged)");
  const add=(h,v)=>{ if(v.trim()){ lines.push("",h+":",v.trim()); } };
  add("What I did",$("#r-did").value); add("What I learned",$("#r-learned").value); add("Mistakes",$("#r-mistakes").value); add("How I'll improve",$("#r-improve").value);
  const text=lines.join("\n");
  try{ await navigator.clipboard.writeText(text); toast("Report copied"); }
  catch{ const ta=document.createElement("textarea"); ta.value=text; ta.style.minHeight="200px"; $("#r-auto").after(ta); ta.select(); toast("Select all and copy the text below"); }
};

// ---------- routine editor
const daysLabel = d => { const s=(d||[0,1,2,3,4,5,6]).slice().sort().join(""); return s==="0123456"?"Every day":s==="12345"?"Weekdays":s==="06"?"Weekend":null; };
function renderRoutine(){
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
    <div class="presets"><span class="small muted" style="padding:2px 4px">${esc(daysLabel(r.days)||"Custom days")} ·</span>${[["all","Every day"],["wd","Weekdays"],["we","Weekend"]].filter(([,l])=>l!==daysLabel(r.days)).map(([k,l])=>`<button type="button" data-preset="${k}">${l}</button>`).join("")}</div>
  </div>`).join(""):`<div class="empty">${S.ready?"No routine items here yet.":"Loading…"}</div>`;
  $("#cat-edit").innerHTML = S.cats.map(c=>`<span class="chip">${esc(c.name)} <span class="muted" style="font-family:var(--f-mono)">#${esc(c.tag)}</span> <button class="x" type="button" data-delcat="${esc(c.tag)}" aria-label="Remove ${esc(c.name)}">✕</button></span>`).join("");
}
function saveRt(r){ put("routine", r.id, strip(r)); }
$("#rt-edit").addEventListener("change", e=>{ const row=e.target.closest("[data-rid]"); if(!row||!e.target.dataset.f) return; const r=S.routine.find(x=>x.id===row.dataset.rid); if(!r) return; const c={...r,[e.target.dataset.f]:e.target.value}; saveRt(c); });
$("#rt-edit").addEventListener("click", e=>{
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
let FS = null, UID = null;
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
  let loaded = 0; const mark = () => { if (++loaded >= 5) { S.ready = true; } render(); };
  const sub = (coll, key) => { let first = true; db.collection(coll).onSnapshot(s => { S[key] = s.docs.map(d => ({ ...d.data(), id: d.id })); if (first) { first = false; mark(); } else render(); }, fail); };
  sub("tasks", "tasks"); sub("todos", "todos"); sub("routine", "routine");
  let f1 = true; db.doc("settings/main").onSnapshot(s => { const c = s.exists && s.data().categories; S.cats = c && c.length ? c.map(x => ({ ...x })) : DEFAULT_CATS.slice(); if (f1) { f1 = false; mark(); } else render(); }, fail);
  let f2 = true; db.collection("reflections").orderBy("date", "desc").limit(90).onSnapshot(s => { const o = {}; s.docs.forEach(d => o[d.id] = d.data()); S.refl = o; if (f2) { f2 = false; mark(); } else render(); }, fail);
  let watchedDay = null, unsubCheck = null;
  watchChecks = () => { const k = viewKey(); if (k === watchedDay) return; watchedDay = k; if (unsubCheck) unsubCheck(); unsubCheck = db.doc("checks/" + k).onSnapshot(s => { const d = s.exists ? s.data() : {}; S.day[k] = { done: d.done || {}, skip: d.skip || {}, extra: d.extra || [] }; render(); }, fail); };
  watchChecks(); setInterval(watchChecks, 60000);
  db.collection("checks").orderBy("date", "desc").limit(70).onSnapshot(s => { s.docs.forEach(d => { const x = d.data(); S.day[d.id] = { done: x.done || {}, skip: x.skip || {}, extra: x.extra || [] }; }); render(); }, fail);
}

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
  "auth/invalid-email": "That email address doesn't look right.", "auth/operation-not-allowed": "Email/Password sign-in isn't switched on in Firebase yet (setup step 2).",
  "auth/network-request-failed": "No internet connection. Connect and try again.", "auth/too-many-requests": "Too many tries. Wait a minute and try again.",
  "auth/unauthorized-domain": "This web address isn't allowed yet. Add it under Firebase Authentication → Settings → Authorized domains (setup step 6).",
  "auth/configuration-not-found": "Email/Password sign-in isn't switched on in Firebase yet (setup step 2)."
};
function showAuth(mode){
  $("#auth").hidden = false; document.body.classList.add("locked");
  $("#auth-setup").hidden = mode !== "setup"; $("#auth-form").hidden = mode === "setup";
}
function hideAuth(){ $("#auth").hidden = true; document.body.classList.remove("locked"); }
const authErr = e => { $("#auth-err").textContent = AUTH_MSG[e && e.code] || ("Something went wrong: " + (e && (e.code || e.message))); };

// ---------- boot
route();
updateHint();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
const setOnline = () => { $("#offline").hidden = navigator.onLine; };
addEventListener("online", setOnline); addEventListener("offline", setOnline); setOnline();

const notConfigured = !firebaseConfig || !firebaseConfig.apiKey || /PASTE/i.test(firebaseConfig.apiKey);
if (notConfigured) { showAuth("setup"); }
else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try { FS = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
  catch (e) { FS = getFirestore(app); }
  onAuthStateChanged(auth, async user => {
    if (!user) { if (db) { location.reload(); return; } showAuth("signin"); return; }
    hideAuth(); $("#acct-email").textContent = user.email || "";
    UID = user.uid; db = mkdb(FS, UID);
    try { await seedIfEmpty(); } catch (e) { dataProblem(e); }
    startData();
  });
  const creds = () => [$("#a-email").value.trim(), $("#a-pass").value];
  $("#auth-form").addEventListener("submit", async e => { e.preventDefault(); $("#auth-err").textContent = "";
    try { await signInWithEmailAndPassword(auth, ...creds()); } catch (err) { authErr(err); } });
  $("#a-create").onclick = async () => { $("#auth-err").textContent = "";
    try { await createUserWithEmailAndPassword(auth, ...creds()); } catch (err) { authErr(err); } };
  $("#a-forgot").onclick = async () => { const em = $("#a-email").value.trim(); if (!em) { $("#auth-err").textContent = "Type your email first, then tap Forgot password."; return; }
    try { await sendPasswordResetEmail(auth, em); $("#auth-err").textContent = "Reset link sent. Check your inbox."; } catch (err) { authErr(err); } };
  $("#signout").onclick = () => signOut(auth);
}
