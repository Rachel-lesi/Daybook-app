// Header banner scenes, one per colour theme, drawn with that theme's own colours.
// Nature keeps the foggy mountain scene that is already in index.html.
// Every scene is 1200 × 110; the banner crops it to fit the screen width.

const W = 1200, H = 110;

// small seeded random so each scene looks the same every time
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => Math.round(n * 10) / 10;
let uid = 0;

function grad(id, stops, vertical = true) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">${stops
    .map(([o, c, op = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${op}"/>`)
    .join("")}</linearGradient>`;
}
function sky(id, stops) {
  return { defs: grad(id, stops), body: `<rect width="${W}" height="${H}" fill="url(#${id})"/>` };
}
// rolling hills
function hills(r, base, amp, step, fill, op = 1) {
  let d = `M0 ${H} L0 ${base}`, x = 0;
  while (x < W) {
    const nx = x + step * (0.7 + r() * 0.6), y = base - r() * amp;
    d += ` Q${f((x + nx) / 2)} ${f(y - amp * 0.4)} ${f(nx)} ${f(base - r() * amp * 0.3)}`;
    x = nx;
  }
  return `<path d="${d} L${W} ${H}Z" fill="${fill}" opacity="${op}"/>`;
}
function pines(r, x0, x1, base, hmin, hmax, step, fill, snow) {
  let d = "", s = "", x = x0;
  while (x < x1) {
    const h = hmin + r() * (hmax - hmin), w = h * 0.38;
    d += `M${f(x - w)} ${base}L${f(x)} ${f(base - h)}L${f(x + w)} ${base}Z`;
    if (snow) s += `M${f(x - w * 0.35)} ${f(base - h * 0.62)}L${f(x)} ${f(base - h)}L${f(x + w * 0.35)} ${f(base - h * 0.62)}Q${f(x)} ${f(base - h * 0.55)} ${f(x - w * 0.35)} ${f(base - h * 0.62)}Z`;
    x += step * (0.7 + r() * 0.55);
  }
  return `<path d="${d}" fill="${fill}"/>` + (snow ? `<path d="${s}" fill="${snow}"/>` : "");
}
function dots(r, n, box, rmin, rmax, colors, op = 1) {
  let o = "";
  for (let i = 0; i < n; i++)
    o += `<circle cx="${f(box[0] + r() * (box[2] - box[0]))}" cy="${f(box[1] + r() * (box[3] - box[1]))}" r="${f(rmin + r() * (rmax - rmin))}" fill="${colors[i % colors.length]}" opacity="${op}"/>`;
  return o;
}
function wave(y, amp, len, fill, op = 1, phase = 0) {
  let d = `M0 ${H} L0 ${y}`;
  for (let x = 0; x <= W; x += 20) d += ` L${x} ${f(y + amp * Math.sin((x / len) * Math.PI * 2 + phase))}`;
  return `<path d="${d} L${W} ${H}Z" fill="${fill}" opacity="${op}"/>`;
}
function fish(x, y, s, fill, flip = false, op = 1) {
  const k = flip ? -1 : 1;
  return `<path transform="translate(${f(x)} ${f(y)}) scale(${f(k * s)} ${f(s)})" d="M-12 0C-6-6 6-6 10 0 6 6-6 6-12 0ZM10 0l7-5-2 5 2 5Z" fill="${fill}" opacity="${op}"/>`;
}

const SCENES = {
  lotus(c) { // night pond: water, lily pads, lotus flowers, fireflies
    const [dg, moss, beige, rose, mid] = c, r = rng(3), sk = sky("sl" + uid, [[0, dg], [1, mid]]);
    let pads = "", flowers = "";
    for (let i = 0; i < 26; i++) {
      const x = r() * W, y = 70 + r() * 40, rx = 14 + r() * 18;
      pads += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(rx * 0.32)}" fill="${i % 3 ? moss : dg}" opacity="${0.75 + r() * 0.25}"/>`;
    }
    for (let i = 0; i < 9; i++) {
      const x = 60 + r() * (W - 120), y = 66 + r() * 34, s = 0.8 + r() * 0.6;
      flowers += `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s)})"><path d="M0 0C-9-2-12-10-10-14-5-12-2-6 0 0Z" fill="${rose}"/><path d="M0 0C9-2 12-10 10-14 5-12 2-6 0 0Z" fill="${rose}"/><path d="M0 0C-4-6-3-14 0-18 3-14 4-6 0 0Z" fill="${rose}" opacity=".85"/><ellipse cx="0" cy="1" rx="11" ry="2.5" fill="${moss}"/></g>`;
    }
    return { defs: sk.defs, body: sk.body + pines(r, 0, W, 62, 14, 30, 13, dg) + `<rect y="60" width="${W}" height="50" fill="${mid}" opacity=".55"/>` + wave(64, 1.5, 160, beige, 0.12) + pads + flowers + dots(r, 22, [0, 8, W, 70], 1, 2.4, [beige], 0.85) };
  },
  autumn(c) { // dusk hills with round autumn trees and falling leaves
    const [seal, gold, dun, cadet, bistre] = c, r = rng(5), sk = sky("sa" + uid, [[0, seal], [0.7, gold], [1, dun]]);
    let trees = "";
    for (let x = -10; x < W + 20; x += 26 + r() * 22) {
      const cr = 12 + r() * 12, base = 104 - r() * 8, col = [seal, gold, bistre, "#b5652f"][Math.floor(r() * 4)];
      trees += `<rect x="${f(x - 1.5)}" y="${f(base - cr)}" width="3" height="${f(cr + 6)}" fill="${bistre}"/><circle cx="${f(x)}" cy="${f(base - cr - 4)}" r="${f(cr)}" fill="${col}"/>`;
    }
    let leaves = "";
    for (let i = 0; i < 24; i++) leaves += `<ellipse cx="${f(r() * W)}" cy="${f(8 + r() * 70)}" rx="3" ry="1.4" transform="rotate(${Math.floor(r() * 180)})" fill="${[gold, seal, dun][i % 3]}" opacity=".85" style="transform-box:fill-box;transform-origin:center"/>`;
    return { defs: sk.defs, body: sk.body + `<circle cx="760" cy="42" r="16" fill="${dun}" opacity=".9"/>` + hills(r, 70, 26, 160, cadet, 0.55) + hills(r, 86, 18, 120, bistre, 0.7) + trees + `<rect y="104" width="${W}" height="6" fill="${bistre}"/>` + leaves };
  },
  breeze(c) { // wisteria hanging over a bright summer sky
    const [garg, pear, dew, celes, havel, smalt] = c, r = rng(7), sk = sky("sb" + uid, [[0, havel], [0.6, celes], [1, dew]]);
    let hang = "";
    for (let i = 0; i < 46; i++) {
      const x = r() * W, len = 22 + r() * 46, col = [smalt, havel, celes][i % 3];
      for (let y = 4; y < len; y += 5) hang += `<circle cx="${f(x + Math.sin(y / 9) * 2)}" cy="${f(y)}" r="${f(3.4 - (y / len) * 2)}" fill="${col}"/>`;
    }
    let lv = "";
    for (let i = 0; i < 40; i++) lv += `<ellipse cx="${f(r() * W)}" cy="${f(2 + r() * 12)}" rx="7" ry="3" fill="${i % 2 ? pear : garg}"/>`;
    return { defs: sk.defs, body: sk.body + `<circle cx="760" cy="60" r="40" fill="#fff" opacity=".25"/>` + hills(r, 92, 14, 140, pear) + hills(r, 102, 8, 90, garg, 0.9) + `<path d="M0 6 Q300 18 600 6 T1200 8 V0 H0Z" fill="${smalt}"/>` + lv + hang };
  },
  garden(c) { // rose garden: cypress trees, rose bushes, stone path
    const [olive, sage, ivory, rose, clay] = c, r = rng(9), sk = sky("sg" + uid, [[0, sage], [1, ivory]]);
    let cyp = "", bush = "";
    for (let x = 20; x < W; x += 70 + r() * 90) cyp += `<ellipse cx="${f(x)}" cy="${f(62)}" rx="${f(8 + r() * 5)}" ry="${f(34 + r() * 12)}" fill="${olive}" opacity="${f(0.75 + r() * 0.25)}"/>`;
    for (let x = -20; x < W + 30; x += 34 + r() * 26) {
      const rr = 14 + r() * 10;
      bush += `<circle cx="${f(x)}" cy="${f(104 - rr * 0.4)}" r="${f(rr)}" fill="${olive}"/>` + dots(r, 5, [x - rr * 0.7, 104 - rr * 1.1, x + rr * 0.7, 104 - rr * 0.3], 2.2, 3.4, [rose, ivory]);
    }
    return { defs: sk.defs, body: sk.body + hills(r, 70, 16, 180, sage, 0.8) + cyp + `<path d="M470 110 Q560 84 600 84 Q640 84 730 110Z" fill="${clay}" opacity=".7"/>` + bush };
  },
  koi(c) { // dark water, ripple circles, gold islands, koi
    const [navy, blue, ink, cream, gold] = c, r = rng(11);
    let rip = "";
    for (let i = 0; i < 30; i++) { const x = r() * W, y = r() * H; for (let k = 1; k < 5; k++) rip += `<circle cx="${f(x)}" cy="${f(y)}" r="${k * 7}" fill="none" stroke="${blue}" stroke-width="1" opacity=".55"/>`; }
    let fishes = "";
    for (let i = 0; i < 9; i++) fishes += fish(150 + r() * 900, 20 + r() * 75, 1.1 + r() * 0.5, i === 4 ? "#e07a3a" : i % 2 ? cream : gold, r() > 0.5, 0.95);
    return { defs: "", body: `<rect width="${W}" height="${H}" fill="${navy}"/>` + rip + `<path d="M0 0H170C150 30 90 46 0 40Z" fill="${gold}" opacity=".9"/><path d="M1200 70C1100 60 1030 90 1010 110H1200Z" fill="${gold}" opacity=".9"/><path d="M820 0C860 20 980 26 1060 0Z" fill="${ink}" opacity=".7"/>` + fishes };
  },
  linen(c) { // washing line with fresh linen and soap bubbles
    const [white, shower, joust, dodger, denim, viol] = c, r = rng(13), sk = sky("sn" + uid, [[0, denim], [0.7, dodger], [1, shower]]);
    let cloth = "";
    const line = (x) => 30 + 10 * Math.sin((x / W) * Math.PI);
    for (let x = 40; x < W - 40; x += 60 + r() * 40) {
      const w = 34 + r() * 22, h = 34 + r() * 26, col = [white, viol, joust, shower, white][Math.floor(r() * 5)], y = line(x);
      cloth += `<path d="M${f(x)} ${f(y)}h${f(w)}l${f(r() * 4 - 2)} ${f(h)}q${f(-w / 2)} 6 ${f(-w)} 0Z" fill="${col}" opacity=".95"/><rect x="${f(x + 3)}" y="${f(y - 4)}" width="3" height="8" fill="${denim}"/><rect x="${f(x + w - 6)}" y="${f(y - 4)}" width="3" height="8" fill="${denim}"/>`;
    }
    let bub = "";
    for (let i = 0; i < 28; i++) bub += `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(2 + r() * 7)}" fill="${white}" fill-opacity=".12" stroke="${white}" stroke-opacity=".7"/>`;
    return { defs: sk.defs, body: sk.body + `<path d="M0 30 Q600 50 1200 30" fill="none" stroke="${white}" stroke-width="1.4" opacity=".8"/>` + cloth + bub };
  },
  lime(c) { // lime slices and fizz
    const [ruri, oasis, lark, lemon, aven, spear] = c, r = rng(15), sk = sky("sm" + uid, [[0, ruri], [1, oasis]]);
    let sl = "";
    for (let i = 0; i < 11; i++) {
      const x = 40 + i * 110 + r() * 40, y = 30 + r() * 70, R = 26 + r() * 20;
      let seg = "";
      for (let k = 0; k < 8; k++) { const a1 = (k / 8) * Math.PI * 2 + 0.06, a2 = ((k + 1) / 8) * Math.PI * 2 - 0.06, rr = R * 0.78; seg += `<path d="M${f(x)} ${f(y)}L${f(x + rr * Math.cos(a1))} ${f(y + rr * Math.sin(a1))}A${f(rr)} ${f(rr)} 0 0 1 ${f(x + rr * Math.cos(a2))} ${f(y + rr * Math.sin(a2))}Z" fill="${aven}" opacity=".85"/>`; }
      sl += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(R)}" fill="${lark}"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(R * 0.86)}" fill="${spear}" opacity=".9"/>` + seg;
    }
    let fz = "";
    for (let i = 0; i < 40; i++) fz += `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(1 + r() * 3.5)}" fill="none" stroke="${spear}" opacity=".7"/>`;
    return { defs: sk.defs, body: sk.body + `<g opacity=".9">${sl}</g>` + `<rect width="${W}" height="${H}" fill="${lemon}" opacity=".12"/>` + fz };
  },
  shoal(c) { // a school of golden fish over deep blue
    const [ink, steel, blue, navy, gold] = c, r = rng(17);
    let fishes = "";
    for (let i = 0; i < 34; i++) { const t = r(); fishes += fish(380 + t * 700 + r() * 60, 12 + t * 50 + r() * 30, 0.8 + r() * 0.6, gold, true, 0.85 + r() * 0.15); }
    return { defs: "", body: `<rect width="${W}" height="${H}" fill="${blue}"/><path d="M500 110C620 40 800 10 1200 20V110Z" fill="${navy}"/><path d="M0 0H360C300 40 160 80 0 70Z" fill="${steel}" opacity=".5"/><path d="M700 110C820 70 1000 60 1200 64V110Z" fill="${ink}" opacity=".7"/>` + fishes };
  },
  coast(c) { // sea cove between cliffs, bougainvillea and pebbles
    const [amar, thul, brook, chalk, olive] = c, r = rng(19), sk = sky("sc" + uid, [[0, brook], [1, chalk]]);
    let flw = "";
    for (let i = 0; i < 90; i++) { const left = i % 2, x = left ? r() * 240 : W - r() * 280, y = r() * 40; flw += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(5 + r() * 8)}" fill="${[amar, thul, amar][i % 3]}" opacity=".95"/>`; }
    return { defs: sk.defs + grad("scs" + uid, [[0, "#cfe3dc"], [1, brook]]), body: sk.body + `<rect y="56" width="${W}" height="54" fill="url(#scs${uid})"/>` + wave(60, 2, 120, "#fff", 0.35) + wave(74, 1.5, 90, "#fff", 0.2, 1) + `<path d="M0 20C80 30 160 60 220 110H0Z" fill="${olive}"/><path d="M1200 14C1080 30 980 70 930 110H1200Z" fill="${olive}"/><path d="M0 40C60 50 120 80 150 110H0Z" fill="${chalk}" opacity=".6"/>` + dots(r, 40, [260, 98, 930, 110], 2, 5, [chalk, "#fff", olive], 0.9) + flw };
  },
  osaka(c) { // street of shops with lanterns and signs
    const [burg, red, sats, lunar, cobalt] = c, r = rng(21);
    let b = "", x = 0;
    while (x < W) {
      const w = 60 + r() * 70, h = 50 + r() * 50, col = [burg, red, sats, burg][Math.floor(r() * 4)];
      b += `<rect x="${f(x)}" y="${f(H - h)}" width="${f(w)}" height="${f(h)}" fill="${col}"/>`;
      for (let wy = H - h + 8; wy < H - 14; wy += 12) for (let wx = x + 6; wx < x + w - 8; wx += 12) if (r() > 0.35) b += `<rect x="${f(wx)}" y="${f(wy)}" width="6" height="6" fill="${lunar}" opacity="${f(0.55 + r() * 0.45)}"/>`;
      if (r() > 0.5) b += `<rect x="${f(x + w - 14)}" y="${f(H - h - 6)}" width="10" height="34" fill="${lunar}"/><rect x="${f(x + w - 12)}" y="${f(H - h)}" width="6" height="24" fill="${red}"/>`;
      x += w + 2;
    }
    let lan = "";
    for (let lx = 20; lx < W; lx += 46) { const ly = 30 + 8 * Math.sin(lx / 90); lan += `<ellipse cx="${lx}" cy="${f(ly + 6)}" rx="6" ry="8" fill="${lunar}"/><rect x="${lx - 4}" y="${f(ly - 3)}" width="8" height="3" fill="${red}"/><rect x="${lx - 4}" y="${f(ly + 13)}" width="8" height="3" fill="${red}"/>`; }
    return { defs: "", body: `<rect width="${W}" height="${H}" fill="${cobalt}"/>` + b + `<path d="M0 30 Q600 50 1200 30" fill="none" stroke="${burg}" stroke-width="1.5"/>` + lan };
  },
  lotustea(c) { // lily pads and pink buds in a glass of tea
    const [haze, gum, clover, lily, after] = c, r = rng(23), sk = sky("st" + uid, [[0, after], [1, lily]]);
    let pads = "";
    for (let i = 0; i < 16; i++) {
      const x = r() * W, y = 30 + r() * 80, R = 16 + r() * 22, a = r() * 6.28;
      pads += `<path d="M${f(x)} ${f(y)}L${f(x + R * Math.cos(a))} ${f(y + R * Math.sin(a))}A${f(R)} ${f(R)} 0 1 1 ${f(x + R * Math.cos(a + 0.5))} ${f(y + R * Math.sin(a + 0.5))}Z" fill="${i % 3 ? clover : lily}" opacity=".95"/>`;
    }
    let buds = "";
    for (let i = 0; i < 8; i++) { const x = 50 + r() * 1100, y = 30 + r() * 60; buds += `<path d="M${f(x)} ${f(y)}c-7-8-5-18 0-22 5 4 7 14 0 22Z" fill="${gum}"/>`; }
    return { defs: sk.defs, body: sk.body + pads + buds + dots(r, 36, [0, 0, W, H], 1.5, 5, [haze], 0.35) };
  },
  sakura(c) { // cherry trees in bloom with falling petals
    const [meadow, bark, candy, lemonade, quartz] = c, r = rng(25), sk = sky("sk" + uid, [[0, candy], [1, quartz]]);
    let t = "";
    for (let x = 10; x < W; x += 90 + r() * 70) {
      const base = 100, h = 34 + r() * 20;
      t += `<path d="M${f(x)} ${base}L${f(x + 3)} ${f(base - h)}L${f(x + 6)} ${base}Z" fill="${bark}"/>`;
      t += dots(r, 9, [x - 34, base - h - 26, x + 40, base - h + 14], 9, 17, [candy, lemonade, quartz, lemonade], 0.95);
    }
    return { defs: sk.defs, body: sk.body + hills(r, 82, 14, 160, meadow, 0.9) + t + `<rect y="100" width="${W}" height="10" fill="${meadow}"/>` + dots(r, 50, [0, 0, W, H], 1.4, 2.6, ["#fff", quartz, lemonade], 0.9) };
  },
  tokyo(c) { // night skyline, neon signs and a crossing
    const [verm, honey, fawn, spruce, asphalt] = c, r = rng(27);
    let b = "", x = 0;
    while (x < W) {
      const w = 40 + r() * 60, h = 40 + r() * 64;
      b += `<rect x="${f(x)}" y="${f(H - h)}" width="${f(w)}" height="${f(h)}" fill="${spruce}"/>`;
      for (let wy = H - h + 6; wy < H - 20; wy += 9) for (let wx = x + 5; wx < x + w - 6; wx += 9) if (r() > 0.55) b += `<rect x="${f(wx)}" y="${f(wy)}" width="4" height="4" fill="${r() > 0.8 ? verm : honey}" opacity="${f(0.5 + r() * 0.5)}"/>`;
      if (r() > 0.6) b += `<rect x="${f(x + 6)}" y="${f(H - h + 6)}" width="${f(w - 12)}" height="8" rx="2" fill="${r() > 0.5 ? verm : honey}"/>`;
      x += w + 3;
    }
    let cross = "";
    for (let cx = 0; cx < W; cx += 34) cross += `<rect x="${cx}" y="102" width="20" height="8" fill="${fawn}" opacity=".7"/>`;
    return { defs: "", body: `<rect width="${W}" height="${H}" fill="${asphalt}"/>` + dots(r, 30, [0, 0, W, 40], 0.6, 1.2, [honey], 0.7) + b + cross };
  },
  winter(c) { // snowy pines by a frozen lake
    const [moon, frost, steel, storm, oxford] = c, r = rng(29), sk = sky("sw" + uid, [[0, oxford], [0.6, storm], [1, frost]]);
    return { defs: sk.defs, body: sk.body + `<circle cx="780" cy="34" r="12" fill="${moon}" opacity=".9"/>` + hills(r, 66, 22, 180, steel, 0.6) + pines(r, 0, W, 100, 36, 66, 22, oxford, moon) + `<rect y="94" width="${W}" height="16" fill="${frost}" opacity=".85"/><rect y="101" width="${W}" height="9" fill="${moon}"/>` + dots(r, 60, [0, 0, W, H], 0.8, 2, [moon, "#fff"], 0.9) };
  },
  dusk(c) { // snowy pines at sunset
    const [concrete, wsteel, rosewood, peach, dawn] = c, r = rng(31), sk = sky("sd" + uid, [[0, concrete], [0.45, rosewood], [1, dawn]]);
    return { defs: sk.defs + `<radialGradient id="sdg${uid}"><stop offset="0" stop-color="${dawn}"/><stop offset="1" stop-color="${dawn}" stop-opacity="0"/></radialGradient>`, body: sk.body + `<circle cx="760" cy="70" r="70" fill="url(#sdg${uid})" opacity=".8"/><circle cx="760" cy="70" r="14" fill="${dawn}"/>` + hills(r, 70, 24, 200, wsteel, 0.8) + pines(r, 0, W, 102, 32, 60, 22, concrete, peach) + `<rect y="96" width="${W}" height="14" fill="${peach}"/>` };
  },
  town(c) { // a row of colourful houses in the sun
    const [sun, cat, palm, azure, pink] = c, r = rng(33);
    let h = "", x = 0;
    while (x < W) {
      const w = 54 + r() * 40, hh = 50 + r() * 40, col = [sun, pink, cat, "#f6e3c4", sun, pink][Math.floor(r() * 6)];
      h += `<rect x="${f(x)}" y="${f(H - hh)}" width="${f(w)}" height="${f(hh)}" fill="${col}"/><rect x="${f(x)}" y="${f(H - hh)}" width="${f(w)}" height="5" fill="${palm}" opacity=".5"/>`;
      for (let wy = H - hh + 12; wy < H - 22; wy += 16) for (let wx = x + 8; wx < x + w - 12; wx += 16) h += `<rect x="${f(wx)}" y="${f(wy)}" width="7" height="10" rx="2" fill="${azure}" opacity=".85"/>`;
      h += `<rect x="${f(x + w / 2 - 5)}" y="${H - 18}" width="10" height="18" rx="4" fill="${palm}"/>`;
      x += w;
    }
    let lv = "";
    for (let i = 0; i < 30; i++) lv += `<ellipse cx="${f(W - r() * 260)}" cy="${f(80 + r() * 30)}" rx="10" ry="4" transform="rotate(${Math.floor(r() * 90 - 45)})" style="transform-box:fill-box;transform-origin:center" fill="${i % 2 ? palm : cat}"/>`;
    return { defs: "", body: `<rect width="${W}" height="${H}" fill="${azure}"/><circle cx="1000" cy="22" r="13" fill="${sun}"/>` + h + lv };
  },
};

// Returns the banner SVG for a theme, or null to keep the default (Nature) scene.
export function sceneSVG(id, colors) {
  const draw = SCENES[id];
  if (!draw) return null;
  uid++;
  const s = draw(colors);
  return `<svg class="scene scene-${id}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs>${s.defs}</defs>${s.body}<rect class="scene-shade" width="${W}" height="${H}"/></svg>`;
}
