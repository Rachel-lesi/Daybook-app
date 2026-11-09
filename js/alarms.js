// Calendar alarms and push notifications
import { hub } from "./registry.js";
import {
  $,
  CFG,
  S,
  dkey,
  esc,
  fmtDate,
  fmtTime,
  getFunctions,
  getMessaging,
  getToken,
  httpsCallable,
  isoDay,
  messagingSupported,
  nowISO,
  pad,
  saveCats,
  toast,
} from "./core.js";

// ---------- calendar alarms
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const alarmItems = () => S.routine.filter((r) => r.alarm).sort((a, b) => a.time.localeCompare(b.time));
function alarmHash() {
  const str = JSON.stringify(
    alarmItems().map((r) => [r.id, r.time, r.label, (r.days || []).slice().sort(), +r.before || 0]),
  );
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}
const icsEsc = (t) =>
  String(t)
    .replace(/\\/g, "\\\\")
    .replace(/[,;]/g, (m) => "\\" + m)
    .replace(/\n/g, "\\n");
function buildICS() {
  const now = new Date(),
    stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const L = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Daybook//Routine alarms//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Daybook",
  ];
  for (const r of alarmItems()) {
    const days = r.days && r.days.length ? r.days : [0, 1, 2, 3, 4, 5, 6];
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    while (!days.includes(d.getDay())) d.setDate(d.getDate() + 1);
    const [hh, mm] = r.time.split(":"),
      ds = dkey(d).replace(/-/g, "") + "T" + hh + mm + "00";
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +hh, +mm + 15),
      de = dkey(end).replace(/-/g, "") + "T" + pad(end.getHours()) + pad(end.getMinutes()) + "00";
    L.push(
      "BEGIN:VEVENT",
      "UID:" + r.id + "@daybook",
      "DTSTAMP:" + stamp,
      "DTSTART:" + ds,
      "DTEND:" + de,
      "RRULE:FREQ=WEEKLY;BYDAY=" +
        days
          .slice()
          .sort()
          .map((i) => BYDAY[i])
          .join(","),
      "SUMMARY:" + icsEsc(r.label),
      "DESCRIPTION:" + icsEsc("From your Daybook routine"),
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:" + icsEsc(r.label),
      "TRIGGER:-PT" + (+r.before || 0) + "M",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  L.push("END:VCALENDAR");
  return L.join("\r\n") + "\r\n";
}
function renderAlarmPanel() {
  const n = alarmItems().length,
    synced = S.calSync,
    changed = n && (!synced || synced.hash !== alarmHash());
  $("#cal-sync-status").innerHTML = !n
    ? "No alarms yet. Tap <b>Alarm off</b> on any routine item below to switch it on."
    : changed
      ? `<span class="warn-dot"></span><b>${n} alarm${n > 1 ? "s" : ""}</b> · changed since your last sync. Tap Sync to update your phone.`
      : `<span class="ok-dot"></span><b>${n} alarm${n > 1 ? "s" : ""}</b> · in sync (last synced ${esc(fmtDate(isoDay(synced.at)))} ${fmtTime(synced.at)})`;
  $("#cal-sync").disabled = !n;
}
$("#cal-sync").addEventListener("click", async () => {
  const ics = buildICS(),
    name = "daybook-alarms.ics";
  const file = new File([ics], name, { type: "text/calendar" });
  let done = false;
  try {
    if (
      navigator.canShare &&
      navigator.canShare({ files: [file] }) &&
      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    ) {
      await navigator.share({ files: [file], title: "Daybook alarms" });
      done = true;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;
  }
  if (!done) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  S.calSync = { hash: alarmHash(), at: nowISO() };
  saveCats();
  renderAlarmPanel();
  toast("Calendar file ready. Open it to add your alarms.");
});
$("#cal-help-btn").addEventListener("click", () => {
  const h = $("#cal-help");
  h.hidden = !h.hidden;
  $("#cal-help-btn").textContent = h.hidden ? "How it works" : "Hide steps";
});

// ---------- push notifications
const PUSH_KEY = "daybook-push";
const vapidOK = () => !!(CFG.vapidKey && !/PASTE/i.test(CFG.vapidKey));
const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  !!(navigator.standalone || (window.matchMedia && matchMedia("(display-mode: standalone)").matches));
const tokenId = (t) => {
  let h = 0;
  for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return "d" + h.toString(36) + t.length.toString(36);
};
async function pushState() {
  if (!vapidOK()) return "nokey";
  if (isIOS() && !isStandalone()) return "ios-browser";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  let ok = false;
  try {
    ok = await messagingSupported();
  } catch {}
  if (!ok) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  let on = false;
  try {
    on = localStorage.getItem(PUSH_KEY) === "1";
  } catch {}
  return Notification.permission === "granted" && on ? "on" : "off";
}
async function registerDevice() {
  const reg = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(hub.APP), { vapidKey: CFG.vapidKey, serviceWorkerRegistration: reg });
  if (!token) throw new Error("no token");
  await hub.db
    .doc("devices/" + tokenId(token))
    .set({
      token,
      device: isIOS() ? "iPhone/iPad" : /Android/i.test(navigator.userAgent) ? "Android" : "Computer",
      agent: navigator.userAgent.slice(0, 160),
      updatedAt: nowISO(),
    });
  try {
    localStorage.setItem(PUSH_KEY, "1");
  } catch {}
}
const PUSH_MSG = {
  nokey: "Push notifications need one setup step on the Firebase side. Until then, use calendar alarms below.",
  "ios-browser": "On iPhone, open Daybook from its <b>home-screen icon</b> to turn on notifications.",
  unsupported: "This browser can't receive notifications. Use calendar alarms below instead.",
  denied: "Notifications are blocked for Daybook. Allow them in your phone or browser settings, then reopen the app.",
  off: "Get a notification on <b>this device</b> for every routine item with an alarm on.",
  on: '<span class="ok-dot"></span>Notifications are <b>on for this device</b>. Changes to your alarms apply straight away.',
};
let pushBusy = false;
async function refreshPush(silentRegister) {
  if (!hub.APP || !hub.db) return;
  const st = await pushState();
  $("#push-status").innerHTML = PUSH_MSG[st];
  // Without the notification server, show calendar alarms as the main option.
  const row = $("#push-status").closest(".ab-row");
  if (row) row.hidden = st === "nokey";
  if (st === "nokey") {
    const d = document.querySelector(".ab-cal");
    if (d) d.open = true;
  }
  $("#push-on").hidden = st !== "off";
  $("#push-test").hidden = st !== "on";
  if (st === "on" && silentRegister) registerDevice().catch((e) => console.warn("token refresh", e));
}
$("#push-on").addEventListener("click", async () => {
  if (pushBusy) return;
  pushBusy = true;
  $("#push-on").disabled = true;
  try {
    const p = await Notification.requestPermission();
    if (p !== "granted") {
      toast("Notifications weren't allowed.");
    } else {
      await registerDevice();
      toast("Notifications are on for this device");
    }
  } catch (e) {
    console.error(e);
    toast("Couldn't turn on notifications. Check your connection and try again.");
  }
  pushBusy = false;
  $("#push-on").disabled = false;
  refreshPush();
});
$("#push-test").addEventListener("click", async () => {
  $("#push-test").disabled = true;
  try {
    const r = await httpsCallable(getFunctions(hub.APP, "asia-southeast1"), "sendTest")();
    toast(
      r.data && r.data.sent
        ? `Test sent to ${r.data.sent} device${r.data.sent > 1 ? "s" : ""}`
        : "Test didn't reach any device",
    );
  } catch (e) {
    console.error(e);
    toast(
      /not-found|internal|unavailable/.test(e.code || "")
        ? "The notification server isn't set up yet."
        : e.message || "Test failed",
    );
  }
  $("#push-test").disabled = false;
});

export { refreshPush, renderAlarmPanel };
