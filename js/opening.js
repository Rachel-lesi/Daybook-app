// Opening screen
import { hub } from "./registry.js";
import {
  $,
  createUserWithEmailAndPassword,
  firebaseConfig,
  getAuth,
  getFirestore,
  initializeApp,
  initializeFirestore,
  onAuthStateChanged,
  persistentLocalCache,
  persistentMultipleTabManager,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "./core.js";
import { authErr, dataProblem, hideAuth, mkdb, seedIfEmpty, showAuth, startData } from "./boot.js";
// Made available on hub for files that load earlier or need to change these values
Object.defineProperties(hub, {
  leaveSplash: { get: () => leaveSplash, enumerable: true },
});

// ---------- opening screen
// the card sets window.__splashMin from its length; tapping "Another one" holds the screen until you tap
let splashReady = false,
  splashGone = false;
function leaveSplash(now) {
  const sp = $("#splash");
  if (!sp || splashGone) return;
  splashReady = true;
  if (!window.__splashHold) $("#sp-hint").textContent = "Tap to continue";
  const wait = now ? 0 : Math.max(0, (window.__splashMin || 2600) - (Date.now() - (window.__splashStart || 0)));
  clearTimeout(leaveSplash._t);
  leaveSplash._t = setTimeout(() => {
    if (splashGone || (!now && window.__splashHold)) return;
    splashGone = true;
    sp.classList.add("out");
    setTimeout(() => sp.remove(), 650);
  }, wait);
}
$("#splash")?.addEventListener("click", () => {
  if (splashReady || window.__splashHold) {
    splashReady = true;
    leaveSplash(true);
  }
});
setTimeout(() => leaveSplash(), 9000); // never keep the opening screen longer than this unless you asked for another card

const notConfigured = !firebaseConfig || !firebaseConfig.apiKey || /PASTE/i.test(firebaseConfig.apiKey);
if (notConfigured) {
  showAuth("setup");
  leaveSplash();
} else {
  const app = initializeApp(firebaseConfig);
  hub.APP = app;
  const auth = getAuth(app);
  try {
    hub.FS = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    hub.FS = getFirestore(app);
  }
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      if (hub.db) {
        location.reload();
        return;
      }
      showAuth("signin");
      leaveSplash();
      return;
    }
    hideAuth();
    $("#acct-email").textContent = user.email || "";
    hub.UID = user.uid;
    hub.db = mkdb(hub.FS, hub.UID);
    try {
      await seedIfEmpty();
    } catch (e) {
      dataProblem(e);
    }
    startData();
  });
  const creds = () => [$("#a-email").value.trim(), $("#a-pass").value];
  const filled = () => {
    const [e, p] = creds();
    if (!e || !p) {
      $("#auth-err").textContent = "Type your email and password first.";
      return false;
    }
    if (p.length < 6) {
      $("#auth-err").textContent = "Use a password with at least 6 characters.";
      return false;
    }
    return true;
  };
  $("#auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#auth-err").textContent = "";
    try {
      await signInWithEmailAndPassword(auth, ...creds());
    } catch (err) {
      authErr(err);
    }
  });
  $("#a-create").onclick = async () => {
    $("#auth-err").textContent = "";
    if (!filled()) return;
    try {
      await createUserWithEmailAndPassword(auth, ...creds());
    } catch (err) {
      authErr(err);
    }
  };
  $("#a-forgot").onclick = async () => {
    const em = $("#a-email").value.trim();
    if (!em) {
      $("#auth-err").textContent = "Type your email first, then tap Forgot password.";
      return;
    }
    try {
      await sendPasswordResetEmail(auth, em);
      $("#auth-err").textContent = "Reset link sent. Check your inbox.";
    } catch (err) {
      authErr(err);
    }
  };
  $("#signout").onclick = () => signOut(auth);
}
