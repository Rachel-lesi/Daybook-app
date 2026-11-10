// Small rich-text box: bold, italic, underline, strike, bullet and numbered lists.
// Stores clean HTML; toPlain() gives the text version used in cards, reports and search.
import { esc } from "./core.js";

const ALLOWED = new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "UL", "OL", "LI", "BR", "DIV", "P", "CODE"]);
const BTNS = [
  ["bold", "<b>B</b>", "Bold (Ctrl+B)"],
  ["italic", "<i>I</i>", "Italic (Ctrl+I)"],
  ["underline", "<u>U</u>", "Underline (Ctrl+U)"],
  ["strikeThrough", "<s>S</s>", "Strikethrough"],
  ["|"],
  ["insertUnorderedList", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/></svg>', "Bullet list"],
  ["insertOrderedList", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 4.5h1.5V9M3.8 9h3.2" stroke-width="1.6"/><path d="M3.8 14.5c.4-.6 2.9-.8 2.9.6 0 1.2-2.9 2.1-2.9 3.4h3.1" stroke-width="1.6"/></svg>', "Numbered list"],
  ["|"],
  ["removeFormat", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 5h12M12 5l-3 14M4 20l16-16" /></svg>', "Clear formatting"],
];

function clean(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html || "";
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) return;
      if (n.nodeType !== 1) return n.remove();
      walk(n);
      if (!ALLOWED.has(n.tagName)) {
        if (/^(SCRIPT|STYLE|IFRAME|OBJECT)$/.test(n.tagName)) return n.remove();
        const blk = /^(H\d|SECTION|ARTICLE|BLOCKQUOTE|PRE|TR)$/.test(n.tagName);
        if (blk) n.after(document.createElement("br"));
        n.replaceWith(...n.childNodes);
      } else [...n.attributes].forEach((a) => n.removeAttribute(a.name));
    });
  };
  walk(tpl.content);
  return tpl.innerHTML.trim();
}

// html -> plain text with "• " bullets and "1. " numbers
function toPlain(html) {
  if (!html) return "";
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  let out = "";
  const nl = () => {
    if (out && !out.endsWith("\n")) out += "\n";
  };
  const walk = (node, list) => {
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) return void (out += n.nodeValue.replace(/ /g, " "));
      if (n.nodeType !== 1) return;
      const tg = n.tagName;
      if (tg === "BR") return void (out += "\n");
      if (tg === "UL" || tg === "OL") {
        nl();
        walk(n, { ol: tg === "OL", i: 0 });
        return nl();
      }
      if (tg === "LI") {
        nl();
        out += list && list.ol ? `${++list.i}. ` : "• ";
        walk(n, null);
        return nl();
      }
      if (tg === "DIV" || tg === "P") {
        nl();
        walk(n, list);
        return nl();
      }
      walk(n, list);
    });
  };
  walk(tpl.content, null);
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

// plain text (older entries) -> html, keeping "- " / "• " lines as bullets
function fromPlain(txt) {
  if (!txt) return "";
  const lines = String(txt).split("\n");
  let h = "",
    inList = false;
  lines.forEach((l) => {
    const m = l.match(/^\s*[-•*]\s+(.*)$/);
    if (m) {
      if (!inList) h += "<ul>";
      inList = true;
      h += `<li>${esc(m[1])}</li>`;
    } else {
      if (inList) h += "</ul>";
      inList = false;
      h += `<div>${esc(l) || "<br>"}</div>`;
    }
  });
  if (inList) h += "</ul>";
  return h;
}

const rteHTML = (id, html, ph, cls = "") =>
  `<div class="rte ${cls}" data-rte="${id}"><div class="rte-bar" role="toolbar" aria-label="Formatting">${BTNS.map((b) =>
    b[0] === "|" ? '<span class="rte-sep"></span>' : `<button type="button" tabindex="-1" data-cmd="${b[0]}" title="${b[2]}" aria-label="${b[2]}">${b[1]}</button>`,
  ).join("")}</div><div class="rte-ed" id="${id}" contenteditable="true" role="textbox" aria-multiline="true" data-ph="${esc(ph || "")}">${clean(html)}</div></div>`;

const rteVal = (id) => {
  const el = document.getElementById(id);
  if (!el) return "";
  const h = clean(el.innerHTML);
  return toPlain(h) ? h : "";
};

function syncBar(ed) {
  const bar = ed.parentElement.querySelector(".rte-bar");
  bar.querySelectorAll("[data-cmd]").forEach((b) => {
    let on = false;
    try {
      on = b.dataset.cmd !== "removeFormat" && document.queryCommandState(b.dataset.cmd);
    } catch {}
    b.setAttribute("aria-pressed", on);
  });
}

// one set of listeners for every rich-text box on the page
document.addEventListener("mousedown", (e) => {
  if (e.target.closest(".rte-bar button")) e.preventDefault(); // keep the caret in the box
});
document.addEventListener("click", (e) => {
  const b = e.target.closest(".rte-bar button");
  if (!b) return;
  const ed = b.closest(".rte").querySelector(".rte-ed");
  if (document.activeElement !== ed) ed.focus();
  document.execCommand(b.dataset.cmd, false, null);
  syncBar(ed);
});
document.addEventListener("paste", (e) => {
  const ed = e.target.closest && e.target.closest(".rte-ed");
  if (!ed) return;
  e.preventDefault();
  const html = e.clipboardData.getData("text/html");
  if (html) document.execCommand("insertHTML", false, clean(html));
  else document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
});
document.addEventListener("input", (e) => {
  const ed = e.target.closest && e.target.closest(".rte-ed");
  if (!ed) return;
  if (!ed.textContent.trim() && !ed.querySelector("li")) ed.innerHTML = "";
});
document.addEventListener("keydown", (e) => {
  const ed = e.target.closest && e.target.closest(".rte-ed");
  if (!ed) return;
  if (e.key === "Enter") e.stopPropagation(); // never submit the form from a text box
  // "- " or "* " at the start of a line starts a bullet list, "1. " a numbered one
  if (e.key === " ") {
    const sel = getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const n = sel.anchorNode;
    if (n.nodeType !== 3 || n.parentElement.closest("li")) return;
    const before = n.nodeValue.slice(0, sel.anchorOffset);
    const isStart = !n.previousSibling || n.previousSibling.nodeName === "BR";
    if (!isStart) return;
    const cmd = /^[-*•]$/.test(before) ? "insertUnorderedList" : /^1[.)]$/.test(before) ? "insertOrderedList" : "";
    if (!cmd) return;
    e.preventDefault();
    const r = document.createRange();
    r.setStart(n, 0);
    r.setEnd(n, sel.anchorOffset);
    sel.removeAllRanges();
    sel.addRange(r);
    document.execCommand("delete");
    document.execCommand(cmd);
  }
});
document.addEventListener("selectionchange", () => {
  const a = document.activeElement;
  if (a && a.classList && a.classList.contains("rte-ed")) syncBar(a);
});

export { clean, fromPlain, rteHTML, rteVal, toPlain };
