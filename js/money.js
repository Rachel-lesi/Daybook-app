// Money: expenses and shopping list
import { hub } from "./registry.js";
import {
  $,
  DAYS,
  ICON,
  S,
  SVG,
  del,
  dkey,
  doc,
  esc,
  fmtDate,
  keyDow,
  newId,
  nowISO,
  pad,
  put,
  saveCats,
  strip,
  toast,
  todayKey,
  writeBatch,
} from "./core.js";
import { barChart } from "./overview.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  batchColl: { get: () => batchColl, enumerable: true },
  expCat: { get: () => expCat, enumerable: true },
  money: { get: () => money, enumerable: true },
  renderMoney: { get: () => renderMoney, enumerable: true },
});

// ---------- Money: shopping list + expenses
S.shop = [];
S.exp = [];
S.cur = "RM";
S.budget = 0;
S.shopHist = [];
S.eDay = null;
S.eMonth = null;
S.shopCat = "other";
S.shopPicked = false;
S.expCat = "food";
S.expPay = "cash";
S.groceryLog = false;
const SHOP_CATS = [
  ["produce", "Fruit & veg"],
  ["meat", "Meat & fish"],
  ["dairy", "Dairy & eggs"],
  ["bakery", "Bread"],
  ["pantry", "Pantry"],
  ["frozen", "Frozen"],
  ["snacks", "Snacks & drinks"],
  ["household", "Household"],
  ["personal", "Toiletries"],
  ["other", "Other"],
];
const EXP_CATS = [
  ["food", "Food & drinks", 0],
  ["groceries", "Groceries", 1],
  ["transport", "Transport", 5],
  ["shopping", "Shopping", 2],
  ["bills", "Bills", 3],
  ["health", "Health", 4],
  ["fun", "Entertainment", 2],
  ["education", "Education", 0],
  ["other", "Other", 5],
];
const PAY = [
  ["cash", "Cash"],
  ["card", "Card"],
  ["ewallet", "E-wallet"],
  ["transfer", "Transfer"],
];
const money = (n) =>
  S.cur + " " + (+n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const expCat = (c) => EXP_CATS.find((x) => x[0] === c) || ["other", "Other", 5];
const ek = () => S.eDay || todayKey(),
  em = () => S.eMonth || todayKey().slice(0, 7);
function renderMoney() {
  if (S.view !== "money") return;
  const k = ek(),
    tk = todayKey(),
    isT = k === tk;
  // ---- expenses for the day
  const dayExp = S.exp.filter((e) => e.date === k).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const dayTot = dayExp.reduce((s, e) => s + (+e.amount || 0), 0);
  $("#m-day").innerHTML =
    `<div class="pager" style="margin:0"><button class="btn sm" type="button" data-eday="-1" aria-label="Previous day">‹</button><span class="mid">${isT ? "Today" : esc(DAYS[keyDow(k)])}<small>${esc(fmtDate(k))}</small></span><button class="btn sm" type="button" data-eday="1" ${isT ? "disabled" : ""} aria-label="Next day">›</button></div>
    <div class="m-total"><span class="small muted">Spent ${isT ? "today" : "this day"}</span><b>${money(dayTot)}</b></div>
    <form id="m-exp-form" class="m-form" autocomplete="off">
      <div class="m-amt"><span>${esc(S.cur)}</span><input id="m-amt" inputmode="decimal" placeholder="0.00" aria-label="Amount"></div>
      <input id="m-note" class="inp" placeholder="What was it? e.g. Lunch at mamak, Grab to office" aria-label="What was it">
      <button class="btn primary" type="submit">Add</button>
    </form>
    <div class="qa-chips cwrap">${EXP_CATS.map(([v, l, ci]) => `<button type="button" class="qc ci-${ci}" data-ecat="${v}" aria-pressed="${S.expCat === v}">${l}</button>`).join("")}</div>
    <div class="qa-chips cwrap">${PAY.map(([v, l]) => `<button type="button" class="qc" data-epay="${v}" aria-pressed="${S.expPay === v}">${l}</button>`).join("")}</div>
    ${
      dayExp.length
        ? `<ul class="hlist m-list">${dayExp
            .map((e) => {
              const c = expCat(e.cat);
              return `<li><span class="hl-tag cat-${c[2]}">${esc(c[1])}</span><span class="hl-b">${esc(e.note || c[1])}<span class="small muted"> · ${esc((PAY.find((p) => p[0] === e.pay) || ["", ""])[1])}</span></span><b class="m-amtv">${money(e.amount)}</b><button type="button" class="x tl-ed" data-ge="exp:${esc(e.id)}" aria-label="Edit" title="Edit">${SVG(ICON.edit)}</button><button type="button" class="x" data-edel="${esc(e.id)}" aria-label="Delete">✕</button></li>`;
            })
            .join("")}</ul>`
        : `<p class="small muted" style="margin:0">No spending logged${isT ? " today" : ""}.</p>`
    }`;
  // ---- month summary
  const mk = em(),
    [y, m] = mk.split("-").map(Number),
    nDays = new Date(y, m, 0).getDate();
  const mExp = S.exp.filter((e) => (e.date || "").startsWith(mk)),
    mTot = mExp.reduce((s, e) => s + (+e.amount || 0), 0);
  const prevMk = dkey(new Date(y, m - 2, 1)).slice(0, 7),
    prevTot = S.exp.filter((e) => (e.date || "").startsWith(prevMk)).reduce((s, e) => s + (+e.amount || 0), 0);
  const byCat = {};
  mExp.forEach((e) => (byCat[e.cat] = (byCat[e.cat] || 0) + (+e.amount || 0)));
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const daily = Array.from({ length: nDays }, (_, i) => {
    const d = mk + "-" + pad(i + 1);
    return d > tk ? null : mExp.filter((e) => e.date === d).reduce((s, e) => s + (+e.amount || 0), 0);
  });
  const isCur = mk === tk.slice(0, 7),
    daysLeft = isCur ? nDays - +tk.slice(8) + 1 : 0,
    left = S.budget ? S.budget - mTot : 0;
  const maxD = Math.max(10, ...daily.map((v) => v || 0)),
    niceMax = Math.ceil(maxD / 10) * 10;
  const labels = daily.map((_, i) => ({
    full: fmtDate(mk + "-" + pad(i + 1)),
    short: String(i + 1),
    show: i === 0 || i === nDays - 1 || ((i + 1) % 5 === 0 && i + 1 <= nDays - 3),
  }));
  $("#m-month").innerHTML =
    `<div class="pager" style="margin:0"><button class="btn sm" type="button" data-emon="-1" aria-label="Previous month">‹</button><span class="mid">${hub.MONTHS[m - 1]} ${y}</span><button class="btn sm" type="button" data-emon="1" ${isCur ? "disabled" : ""} aria-label="Next month">›</button></div>
    <div class="m-sum"><div><span class="small muted">Spent this month</span><b>${money(mTot)}</b>${prevTot ? `<span class="small ${mTot > prevTot ? "up" : "down"}">${mTot > prevTot ? "▲" : "▼"} ${money(Math.abs(mTot - prevTot))} vs ${hub.MONTHS[(m + 10) % 12].slice(0, 3)}</span>` : ""}</div>
      <div><span class="small muted">Daily average</span><b>${money(mTot / (isCur ? +tk.slice(8) : nDays))}</b><span class="small muted">${mExp.length} entr${mExp.length === 1 ? "y" : "ies"}</span></div></div>
    ${
      S.budget
        ? `<div class="m-budget"><div class="m-bud-top"><span class="small"><b>Budget ${money(S.budget)}</b></span><span class="small ${left < 0 ? "over" : "muted"}">${left >= 0 ? `${money(left)} left${isCur && daysLeft ? ` · about ${money(left / daysLeft)}/day for ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : ""}` : `${money(-left)} over budget`}</span></div>
      <span class="bar m-bar"><i style="width:${Math.min(100, (mTot / S.budget) * 100)}%;background:${mTot / S.budget > 1 ? "var(--crit)" : mTot / S.budget > 0.85 ? "var(--high)" : "var(--accent)"}"></i></span></div>`
        : ""
    }
    <label class="small muted m-setbud">Monthly budget <span class="m-amt sm"><span>${esc(S.cur)}</span><input id="m-budget" inputmode="decimal" value="${S.budget || ""}" placeholder="None"></span></label>
    ${mTot ? `<div class="chartbox m-chart">${barChart(daily, labels, niceMax, (v) => (v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v)), "var(--accent)")}</div>` : ""}
    ${
      cats.length
        ? `<div class="m-cats">${cats
            .map(([c, v]) => {
              const C = expCat(c);
              return `<div class="m-cat"><span class="hl-tag cat-${C[2]}">${esc(C[1])}</span><span class="bar"><i style="width:${((v / cats[0][1]) * 100).toFixed(1)}%;background:var(--c${C[2]})"></i></span><b>${money(v)}</b><span class="small muted">${Math.round((v / mTot) * 100)}%</span></div>`;
            })
            .join("")}</div>`
        : `<p class="small muted" style="margin:0">No spending this month yet.</p>`
    }
    ${
      mExp.length
        ? `<details><summary class="small">Biggest spends</summary><ul class="hlist m-list">${mExp
            .slice()
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5)
            .map(
              (e) =>
                `<li><span class="hl-t">${esc(fmtDate(e.date).split(", ")[1])}</span><span class="hl-b">${esc(e.note || expCat(e.cat)[1])}</span><b class="m-amtv">${money(e.amount)}</b></li>`,
            )
            .join("")}</ul></details>`
        : ""
    }
    <label class="small muted m-setbud">Currency <select id="m-cur">${["RM", "S$", "$", "¥", "£", "€", "₱", "Rp", "฿"].map((c) => `<option ${c === S.cur ? "selected" : ""}>${c}</option>`).join("")}</select></label>`;
  // ---- shopping list
  const open = S.shop.filter((i) => !i.done),
    got = S.shop.filter((i) => i.done);
  const groups = SHOP_CATS.map(([v, l]) => [v, l, open.filter((i) => (i.cat || "other") === v)]).filter(
    (g) => g[2].length,
  );
  const onList = new Set(open.map((i) => i.name.toLowerCase()));
  const sugg = S.shopHist.filter((n) => !onList.has(n.toLowerCase())).slice(0, 12);
  $("#m-shop").innerHTML =
    `<form id="m-shop-form" class="m-form" autocomplete="off"><input id="m-item" class="inp" placeholder="Add item, e.g. Eggs" aria-label="Item"><input id="m-qty" class="inp" placeholder="Qty" aria-label="Quantity" style="max-width:80px"><button class="btn primary" type="submit">Add</button></form>
    <div class="qa-chips cwrap">${SHOP_CATS.map(([v, l]) => `<button type="button" class="qc" data-scat="${v}" aria-pressed="${S.shopCat === v}">${l}</button>`).join("")}</div>
    ${sugg.length ? `<div class="m-sugg"><span class="small muted">Buy again:</span>${sugg.map((n) => `<button type="button" class="qc ghost" data-sagain="${esc(n)}">+ ${esc(n)}</button>`).join("")}</div>` : ""}
    ${groups.length ? groups.map(([v, l, items]) => `<div class="m-grp"><div class="m-grp-h">${esc(l)} <span class="muted">${items.length}</span></div><ul class="m-items">${items.map((i) => `<li><input type="checkbox" data-sdone="${esc(i.id)}" aria-label="Bought ${esc(i.name)}"><span class="m-iname">${esc(i.name)}</span>${i.qty ? `<span class="m-qty">${esc(i.qty)}</span>` : ""}<button type="button" class="x tl-ed" data-ge="shop:${esc(i.id)}" aria-label="Edit" title="Edit">${SVG(ICON.edit)}</button><button type="button" class="x" data-sdel="${esc(i.id)}" aria-label="Remove">✕</button></li>`).join("")}</ul></div>`).join("") : `<p class="small muted" style="margin:0">Your list is empty. Add what you need above.</p>`}
    ${
      got.length
        ? `<div class="m-grp got"><div class="m-grp-h">In the basket <span class="muted">${got.length}</span><button type="button" class="btn sm ghost" data-sclear>Clear bought</button></div><ul class="m-items">${got.map((i) => `<li class="done"><input type="checkbox" checked data-sdone="${esc(i.id)}" aria-label="Not bought ${esc(i.name)}"><span class="m-iname">${esc(i.name)}</span>${i.qty ? `<span class="m-qty">${esc(i.qty)}</span>` : ""}</li>`).join("")}</ul>
      ${
        S.groceryLog
          ? `<form id="m-groc-form" class="m-form" autocomplete="off"><div class="m-amt"><span>${esc(S.cur)}</span><input id="m-groc" inputmode="decimal" placeholder="Total paid"></div><button class="btn sm primary" type="submit">Save expense</button><button class="btn sm" type="button" data-sgroc="0">Cancel</button></form>`
          : `<button type="button" class="btn sm" data-sgroc="1">Log grocery bill as an expense</button>`
      }</div>`
        : ""
    }`;
}
async function batchColl(coll, ops) {
  if (!hub.db || !hub.FS) {
    ops.forEach(([op, id, d]) => (op === "delete" ? del(coll, id) : put(coll, id, d)));
    return;
  }
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(hub.FS);
    ops.slice(i, i + 400).forEach(([op, id, d]) => {
      const r = doc(hub.FS, `users/${hub.UID}/${coll}/${id}`);
      op === "delete" ? b.delete(r) : b.set(r, d);
    });
    await b.commit();
  }
}
function rememberItem(name) {
  const n = name.trim();
  if (!n) return;
  S.shopHist = [n, ...S.shopHist.filter((x) => x.toLowerCase() !== n.toLowerCase())].slice(0, 40);
  saveCats();
}
function guessShopCat(name) {
  const n = name.toLowerCase();
  const R = [
    [
      "produce",
      /\b(apple|banana|orange|veg|sayur|tomato|onion|garlic|potato|carrot|lettuce|cabbage|fruit|lemon|lime|chili|cili|ginger|spinach|kangkung|cucumber|grape|mango|papaya)/,
    ],
    ["meat", /\b(chicken|ayam|beef|pork|fish|ikan|prawn|udang|meat|sausage|ham|bacon|squid)/],
    ["dairy", /\b(milk|susu|egg|telur|cheese|yogurt|yoghurt|butter|cream)/],
    ["bakery", /\b(bread|roti|bun|cake|croissant)/],
    [
      "pantry",
      /\b(rice|beras|flour|sugar|salt|oil|minyak|sauce|kicap|pasta|noodle|mee|bihun|cereal|oat|spice|coffee|tea|kopi|teh|honey|jam)/,
    ],
    ["frozen", /\b(frozen|ice cream|nugget|dumpling)/],
    ["snacks", /\b(snack|chips|biscuit|chocolate|candy|juice|soda|coke|drink|water|milo)/],
    ["household", /\b(soap|detergent|tissue|toilet paper|dish|bin bag|sponge|bleach|cleaner|light bulb|battery)/],
    [
      "personal",
      /\b(shampoo|toothpaste|toothbrush|lotion|pad|tampon|deodorant|razor|sunscreen|floss|medicine|vitamin)/,
    ],
  ];
  const hit = R.find(([, re]) => re.test(n));
  return hit ? hit[0] : null;
}
document.addEventListener("click", async (e) => {
  if (S.view !== "money") return;
  const t = e.target.closest("button");
  if (!t || !t.closest("#v-money")) return;
  if (t.dataset.eday) {
    const n = hub.addDays(ek(), +t.dataset.eday);
    S.eDay = n > todayKey() ? todayKey() : n;
    renderMoney();
  } else if (t.dataset.emon) {
    const [y, m] = em().split("-").map(Number);
    const d = new Date(y, m - 1 + +t.dataset.emon, 1);
    const mk = dkey(d).slice(0, 7);
    S.eMonth = mk > todayKey().slice(0, 7) ? null : mk;
    renderMoney();
  } else if (t.dataset.ecat) {
    S.expCat = t.dataset.ecat;
    t.parentElement.querySelectorAll("[data-ecat]").forEach((b) => b.setAttribute("aria-pressed", b === t));
  } else if (t.dataset.epay) {
    S.expPay = t.dataset.epay;
    t.parentElement.querySelectorAll("[data-epay]").forEach((b) => b.setAttribute("aria-pressed", b === t));
  } else if (t.dataset.edel) {
    del("expenses", t.dataset.edel);
    toast("Expense deleted");
  } else if (t.dataset.scat) {
    S.shopCat = t.dataset.scat;
    S.shopPicked = true;
    t.parentElement.querySelectorAll("[data-scat]").forEach((b) => b.setAttribute("aria-pressed", b === t));
    $("#m-item").focus();
  } else if (t.dataset.sagain) {
    const n = t.dataset.sagain;
    put("shop", newId(), {
      name: n,
      qty: "",
      cat: guessShopCat(n) || "other",
      done: false,
      doneAt: "",
      createdAt: nowISO(),
    });
  } else if (t.dataset.sdel) {
    del("shop", t.dataset.sdel);
  } else if (t.dataset.sclear !== undefined) {
    const got = S.shop.filter((i) => i.done);
    await batchColl(
      "shop",
      got.map((i) => ["delete", i.id]),
    );
    S.groceryLog = false;
    toast(`Cleared ${got.length} item${got.length === 1 ? "" : "s"}`);
  } else if (t.dataset.sgroc) {
    S.groceryLog = t.dataset.sgroc === "1";
    renderMoney();
    if (S.groceryLog) $("#m-groc").focus();
  }
});
document.addEventListener("change", (e) => {
  const c = e.target.closest && e.target.closest("[data-sdone]");
  if (c) {
    const i = S.shop.find((x) => x.id === c.dataset.sdone);
    if (i) {
      put("shop", i.id, { ...strip(i), done: c.checked, doneAt: c.checked ? nowISO() : "" });
      if (c.checked) rememberItem(i.name);
    }
    return;
  }
  if (e.target.id === "m-budget") {
    S.budget = Math.max(0, parseFloat(e.target.value) || 0);
    saveCats();
    renderMoney();
    toast(S.budget ? "Budget saved" : "Budget removed");
  }
  if (e.target.id === "m-cur") {
    S.cur = e.target.value;
    saveCats();
    renderMoney();
  }
});
document.addEventListener("submit", (e) => {
  const f = e.target;
  if (!f.closest || !f.closest("#v-money")) return;
  e.preventDefault();
  if (f.id === "m-exp-form") {
    const amt = parseFloat(($("#m-amt").value || "").replace(/[^\d.]/g, ""));
    if (!amt || amt <= 0) {
      toast("Enter an amount first");
      $("#m-amt").focus();
      return;
    }
    put("expenses", newId(), {
      date: ek(),
      amount: Math.round(amt * 100) / 100,
      cat: S.expCat,
      pay: S.expPay,
      note: $("#m-note").value.trim(),
      createdAt: nowISO(),
    });
    toast(`${money(amt)} · ${expCat(S.expCat)[1]}`);
    $("#m-amt").value = "";
    $("#m-note").value = "";
    $("#m-amt").focus();
  } else if (f.id === "m-shop-form") {
    const n = $("#m-item").value.trim();
    if (!n) {
      $("#m-item").focus();
      return;
    }
    // a category you tapped wins; otherwise guess from the name (eggs → Dairy & eggs)
    const cat = S.shopPicked ? S.shopCat : guessShopCat(n) || S.shopCat || "other";
    put("shop", newId(), { name: n, qty: $("#m-qty").value.trim(), cat, done: false, doneAt: "", createdAt: nowISO() });
    S.shopPicked = false;
    $("#m-item").value = "";
    $("#m-qty").value = "";
    $("#m-item").focus();
  } else if (f.id === "m-groc-form") {
    const amt = parseFloat(($("#m-groc").value || "").replace(/[^\d.]/g, ""));
    if (!amt) {
      $("#m-groc").focus();
      return;
    }
    const n = S.shop.filter((i) => i.done).length;
    put("expenses", newId(), {
      date: todayKey(),
      amount: Math.round(amt * 100) / 100,
      cat: "groceries",
      pay: S.expPay,
      note: `Groceries (${n} item${n === 1 ? "" : "s"})`,
      createdAt: nowISO(),
    });
    S.groceryLog = false;
    toast("Grocery bill saved to expenses");
    renderMoney();
  }
});
// Enter in the amount box jumps to the description
document.addEventListener("keydown", (e) => {
  if (e.target.id === "m-amt" && e.key === "Enter" && !$("#m-note").value.trim()) {
    e.preventDefault();
    $("#m-note").focus();
  }
});

export { EXP_CATS, PAY, SHOP_CATS };
