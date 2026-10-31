const USER_NAME = "Muskan";
// Optional backend: set e.g. "http://127.0.0.1:5000/api/segment".
// It receives {rows, x, y, k} and must return {labels:[...], centroids:[[x,y],...]}.
// Leave empty to run K-Means in the browser.
const API_URL = "";

const COLORS = ["#6b3df2", "#3d9bff", "#ff5c9a", "#ffa62b", "#19c3a1", "#8a93c4"];
const NAMES4 = ["High Value", "Frequent Buyers", "Budget Shoppers", "Occasional Buyers"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const $ = (id) => document.getElementById(id);
let all = [], head = [], map = {}, res = null, view = "dash";

/* ---------- helpers ---------- */
const sum = (a) => a.reduce((x, y) => x + y, 0);
const avg = (a) => (a.length ? sum(a) / a.length : 0);
const compact = (v) => (v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : String(Math.round(v)));
const axisFmt = (v) => (v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "K" : String(Math.round(v)));
const nameOf = (i, k) => (k === 4 ? NAMES4[i] : `Segment ${i + 1}`);
const icon = (id) => `<svg class="i"><use href="#${id}"/></svg>`;
function smooth(p) {
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 1; i < p.length; i++) { const cx = (p[i - 1][0] + p[i][0]) / 2; d += `C${cx},${p[i - 1][1]} ${cx},${p[i][1]} ${p[i][0]},${p[i][1]}`; }
  return d;
}
function say(t, err) { const m = $("msg"); m.textContent = t; m.classList.toggle("err", !!err); }

/* ---------- data ---------- */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const h = lines[0].split(",").map((x) => x.trim());
  const data = lines.slice(1).map((l) => {
    const p = l.split(","), o = {};
    h.forEach((c, i) => { const v = (p[i] || "").trim(); o[c] = v !== "" && !isNaN(v) ? Number(v) : v; });
    return o;
  });
  return { h, data };
}
function monthKey(v) {
  if (typeof v === "number") return v;
  const i = MON.findIndex((m) => String(v).toLowerCase().startsWith(m.toLowerCase()));
  if (i >= 0) return i + 1;
  const d = new Date(v);
  return isNaN(d) ? null : d.getFullYear() * 12 + d.getMonth() + 1;
}
function load(h, data, label) {
  head = h; all = data;
  const find = (re, ex) => h.find((c) => re.test(c) && !(ex && ex.test(c)));
  map = { age: find(/\bage\b/i), inc: find(/income/i), score: find(/score/i), amt: find(/amount|purchase|spend|total/i, /score/i),
    cat: find(/categor|product/i), mon: find(/month|date/i), rate: find(/rating/i) };
  all.forEach((r) => (r._m = map.mon ? monthKey(r[map.mon]) : null));
  const num = h.filter((c) => data.every((r) => typeof r[c] === "number"));
  if (num.length < 2) return say("Need at least two numeric columns, like income and spending score.", true);
  for (const id of ["xcol", "ycol"]) $(id).innerHTML = num.map((c) => `<option>${c}</option>`).join("");
  $("xcol").value = map.inc && num.includes(map.inc) ? map.inc : num[0];
  $("ycol").value = map.score && num.includes(map.score) ? map.score : num[1];
  $("dropText").textContent = label;
  refresh();
}
function sample() {
  let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647, g = () => r() + r() + r() + r() - 2;
  const pick = (w) => { let t = r() * sum(w.map((x) => x[1])); for (const [v, x] of w) if ((t -= x) < 0) return v; return w[0][0]; };
  const blobs = [[[85, 80], 28.5], [[55, 52], 32.1], [[30, 28], 24.3], [[30, 78], 14.1]];
  const ages = [[[18, 25], 24], [[26, 35], 32], [[36, 45], 26], [[46, 60], 12], [[61, 75], 6]];
  const cats = [["Electronics", 35], ["Fashion", 28], ["Home & Living", 20], ["Beauty", 10], ["Sports", 7]];
  const months = [[1, 1.0], [2, 1.3], [3, 1.55], [4, 1.8], [5, 2.1], [6, 2.35]];
  const data = [];
  for (let i = 1; i <= 2240; i++) {
    const [cx, cy] = pick(blobs), [a0, a1] = pick(ages);
    const inc = Math.min(140, Math.max(12, Math.round(cx + g() * 9))), sc = Math.min(99, Math.max(1, Math.round(cy + g() * 9)));
    data.push({ CustomerID: i, Age: a0 + Math.floor(r() * (a1 - a0 + 1)), "Annual Income (k$)": inc, "Spending Score (1-100)": sc,
      Category: pick(cats), "Purchase Amount (INR)": Math.max(200, Math.round((400 + sc * 28 + inc * 6 + g() * 350) / 10) * 10),
      Rating: Math.min(5, Math.max(1, Math.round((3.8 + g() * 0.6 + (sc - 50) / 100) * 10) / 10)), Month: pick(months) });
  }
  load(Object.keys(data[0]), data, "Sample data (2,240 customers)");
}
function filtered() {
  if (!map.mon) return all;
  const keys = all.map((r) => r._m).filter((m) => m != null);
  const mx = Math.max(...keys), n = +$("range").value;
  return all.filter((r) => r._m != null && r._m > mx - n);
}

/* ---------- k-means ---------- */
function kmeans(pts, k) {
  const n = pts.length;
  const mean = [0, 1].map((j) => avg(pts.map((p) => p[j])));
  const sd = [0, 1].map((j) => Math.sqrt(avg(pts.map((p) => (p[j] - mean[j]) ** 2))) || 1);
  const z = pts.map((p) => p.map((v, j) => (v - mean[j]) / sd[j]));
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  let best = null;
  for (let t = 0; t < 5; t++) {
    let c = [z[Math.floor(Math.random() * n)]];
    while (c.length < k) {
      const dist = z.map((p) => Math.min(...c.map((q) => d2(p, q))));
      let x = Math.random() * sum(dist), i = 0;
      while ((x -= dist[i]) > 0 && i < n - 1) i++;
      c.push(z[i]);
    }
    const lab = new Array(n).fill(0);
    for (let it = 0; it < 50; it++) {
      let moved = false;
      z.forEach((p, i) => { let b = 0, bd = Infinity; c.forEach((q, ci) => { const dd = d2(p, q); if (dd < bd) { bd = dd; b = ci; } }); if (lab[i] !== b) { lab[i] = b; moved = true; } });
      c = c.map((q, ci) => { const m = z.filter((_, i) => lab[i] === ci); return m.length ? [0, 1].map((j) => avg(m.map((p) => p[j]))) : q; });
      if (!moved) break;
    }
    const inertia = sum(z.map((p, i) => d2(p, c[lab[i]])));
    if (!best || inertia < best.inertia) best = { lab, c, inertia };
  }
  return { labels: best.lab, centroids: best.c.map((q) => [q[0] * sd[0] + mean[0], q[1] * sd[1] + mean[1]]) };
}

/* ---------- main refresh ---------- */
async function refresh() {
  const x = $("xcol").value, y = $("ycol").value, k = +$("k").value, rows = filtered();
  if (x === y) return say("Pick two different columns.", true);
  say("Finding segments…");
  try {
    const pts = rows.map((r) => [r[x], r[y]]);
    let out;
    if (API_URL) {
      const rs = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows, x, y, k }) });
      if (!rs.ok) throw new Error("server returned " + rs.status);
      out = await rs.json();
    } else out = kmeans(pts, k);
    const mx = [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
    const order = out.centroids.map((c, i) => [i, c[0] / mx[0] + c[1] / mx[1]]).sort((a, b) => b[1] - a[1]);
    const rank = {}; order.forEach(([i], r) => (rank[i] = r));
    res = { rows, x, y, k, pts, labels: out.labels.map((l) => rank[l]), centroids: order.map(([i]) => out.centroids[i]) };
    renderAll(); say(`${rows.length.toLocaleString()} customers analysed.`);
  } catch (e) { say("Could not reach the backend: " + e.message, true); }
}

/* ---------- render ---------- */
function monthly(rows) {
  if (!map.mon) return null;
  const keys = [...new Set(rows.map((r) => r._m).filter((m) => m != null))].sort((a, b) => a - b);
  return keys.map((m) => ({ m, label: MON[(m - 1) % 12], rows: rows.filter((r) => r._m === m) }));
}
function renderAll() {
  const { rows, k, labels, centroids } = res;
  const mo = monthly(rows);
  const amt = (rs) => (map.amt ? sum(rs.map((r) => r[map.amt])) : null);
  const kpiDefs = [
    { id: "people", bg: "#ece6ff", fg: "#6b3df2", label: "Total Customers", f: (rs) => rs.length, show: (v) => v.toLocaleString(), pct: true },
    { id: "cart", bg: "#ece6ff", fg: "#6b3df2", label: "Total Spending", f: amt, show: (v) => "₹" + compact(v), pct: true },
    { id: "bag", bg: "#ece6ff", fg: "#6b3df2", label: "Avg. Purchase Value", f: (rs) => (map.amt && rs.length ? amt(rs) / rs.length : null), show: (v) => "₹" + Math.round(v).toLocaleString(), pct: true },
    { id: "star", bg: "#fff1de", fg: "#f5a623", label: "Avg. Rating", f: (rs) => (map.rate && rs.length ? avg(rs.map((r) => r[map.rate])) : null), show: (v) => v.toFixed(1), pct: false }];
  $("kpis").innerHTML = kpiDefs.map((d, n) => {
    const v = d.f(rows), series = mo ? mo.map((m) => d.f(m.rows)) : [];
    let delta = "", spark = "";
    if (series.length > 1 && series.every((s) => s != null)) {
      const a = series.at(-2), b = series.at(-1), ch = d.pct ? ((b - a) / a) * 100 : b - a;
      const rv = d.pct ? Math.round(ch) : Math.round(ch * 10) / 10, neg = rv < 0;
      delta = `<div class="d ${neg ? "neg" : ""}">${neg ? "↓" : "↑"} ${neg ? "" : "+"}${d.pct ? rv + "%" : rv.toFixed(1)}</div>`;
      const lo = Math.min(...series), hi = Math.max(...series), pts = series.map((s, i) => [(i / (series.length - 1)) * 200, 52 - ((s - lo) / (hi - lo || 1)) * 40]);
      spark = `<svg class="sp" viewBox="0 0 200 56" preserveAspectRatio="none"><defs><linearGradient id="sg${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8c6bff" stop-opacity=".25"/><stop offset="1" stop-color="#8c6bff" stop-opacity="0"/></linearGradient></defs><path d="${smooth(pts)}L200,56L0,56Z" fill="url(#sg${n})"/><path d="${smooth(pts)}" fill="none" stroke="#8c6bff" stroke-width="2.500"/></svg>`;
    }
    return `<article class="kpi"><div class="top"><div class="ic" style="background:${d.bg};color:${d.fg}">${icon(d.id)}</div><div><div class="n">${v == null ? "–" : d.show(v)}</div><div class="l">${d.label}</div></div></div>${delta}${spark}</article>`;
  }).join("");

  const counts = centroids.map((_, i) => labels.filter((l) => l === i).length), tot = rows.length;
  const C = 2 * Math.PI * 70; let off = 0;
  $("donut").innerHTML = `<svg viewBox="0 0 200 200"><g transform="rotate(-90 100 100)" fill="none" stroke-width="40">${counts.map((c, i) => { const len = (c / tot) * C, s = `<circle cx="100" cy="100" r="70" stroke="${COLORS[i]}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"/>`; off += len; return s; }).join("")}</g><text x="100" y="104" text-anchor="middle" font-size="32" font-weight="800" fill="#161233">${k}</text><text x="100" y="124" text-anchor="middle" font-size="13" fill="#161233">Segments</text></svg>`;
  $("legend").innerHTML = counts.map((c, i) => `<li><i style="background:${COLORS[i]}"></i><span>${nameOf(i, k)}<small>(${((c / tot) * 100).toFixed(1)}%)</small></span></li>`).join("");

  // spending trend
  if (mo && map.amt && mo.length > 1) {
    const vals = mo.map((m) => amt(m.rows)), mag = 10 ** Math.floor(Math.log10(Math.max(...vals))), top = Math.ceil(Math.max(...vals) / mag) * mag;
    const W = 640, H = 270, L = 50, R = 20, T = 14, B = 34;
    const px = (i) => L + (i * (W - L - R)) / (mo.length - 1), py = (v) => H - B - (v / top) * (H - T - B);
    const pts = vals.map((v, i) => [px(i), py(v)]);
    $("trend").innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%"><defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a4cf5" stop-opacity=".28"/><stop offset="1" stop-color="#7a4cf5" stop-opacity="0.03"/></linearGradient></defs>
      ${[0, 1, 2, 3].map((i) => `<line x1="${L}" x2="${W - R}" y1="${py((top * i) / 3)}" y2="${py((top * i) / 3)}" stroke="#ece8fa"/><text x="${L - 8}" y="${py((top * i) / 3) + 4}" text-anchor="end" font-size="12" fill="#6b6891">${axisFmt((top * i) / 3)}</text>`).join("")}
      ${mo.map((m, i) => `<line x1="${px(i)}" x2="${px(i)}" y1="${T}" y2="${H - B}" stroke="#ece8fa"/><text x="${px(i)}" y="${H - 10}" text-anchor="middle" font-size="12.500" fill="#161233">${m.label}</text>`).join("")}
      <path d="${smooth(pts)}L${px(mo.length - 1)},${H - B}L${L},${H - B}Z" fill="url(#tg)"/><path d="${smooth(pts)}" fill="none" stroke="#6b3df2" stroke-width="3"/>
      ${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="4.500" fill="#6b3df2"/>`).join("")}</svg>`;
  } else $("trend").innerHTML = `<p class="empty">Add a Month (or Date) column and a purchase amount column to see the trend.</p>`;

  // age distribution
  if (map.age) {
    const bins = [["18-25", 18, 25], ["26-35", 26, 35], ["36-45", 36, 45], ["46-60", 46, 60], ["60+", 61, 200]];
    const pc = bins.map(([, a, b]) => (rows.filter((r) => r[map.age] >= a && r[map.age] <= b).length / tot) * 100);
    const ax = Math.max(10, Math.ceil(Math.max(...pc) / 10) * 10), steps = ax / 10 <= 4 ? 10 : 20;
    const ticks = []; for (let t = 0; t <= ax; t += steps) ticks.push(t);
    $("age").innerHTML = `<div class="ageplot">${ticks.map((t) => `<div class="gl" style="bottom:${(t / ax) * 100}%"><span>${t}%</span></div>`).join("")}<div class="bars">${pc.map((p) => `<div class="bar"><b>${Math.round(p)}%</b><div style="height:${(p / ax) * 100}%"></div></div>`).join("")}</div></div><div class="xl">${bins.map((b) => `<span>${b[0]}</span>`).join("")}</div>`;
  } else $("age").innerHTML = `<p class="empty">No Age column found in this file.</p>`;

  // top products
  if (map.cat) {
    const cnt = {}; rows.forEach((r) => (cnt[r[map.cat]] = (cnt[r[map.cat]] || 0) + 1));
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => [n, (c / tot) * 100]);
    $("prod").innerHTML = `<div class="prod">${top.map(([n, p]) => `<div class="row"><span>${n}</span><div><i style="width:${(p / top[0][1]) * 100}%"></i></div><b>${Math.round(p)}%</b></div>`).join("")}</div>`;
  } else $("prod").innerHTML = `<p class="empty">No Category or Product column found in this file.</p>`;

  // insights
  const tips = [`${nameOf(0, k)} Customers are ${((counts[0] / tot) * 100).toFixed(1)}% of total users.`];
  if (mo && map.amt && mo.length > 1) { const a = amt(mo[0].rows), b = amt(mo.at(-1).rows), ch = Math.round(((b - a) / a) * 100); tips.push(`Spending ${ch >= 0 ? "grew" : "fell"} ${Math.abs(ch)}% from ${mo[0].label} to ${mo.at(-1).label}.`); }
  if (map.cat) { const cnt = {}; rows.forEach((r) => (cnt[r[map.cat]] = (cnt[r[map.cat]] || 0) + 1)); tips.push(`${Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0]} is the most popular category.`); }
  $("ins").innerHTML = tips.map((t) => `<li><svg class="i"><use href="#check"/></svg><span>${t}</span></li>`).join("");

  // segments view
  $("segcards").innerHTML = centroids.map((c, i) => `<article class="seg" style="--c:${COLORS[i]}"><h3>${nameOf(i, k)}</h3><p class="b">${counts[i].toLocaleString()} customers (${((counts[i] / tot) * 100).toFixed(1)}%)</p><p>Avg ${res.x}: ${c[0].toFixed(1)}</p><p>Avg ${res.y}: ${c[1].toFixed(1)}</p></article>`).join("");
  $("table").innerHTML = `<tr><th>Segment</th>${head.map((c) => `<th>${c}</th>`).join("")}</tr>` + rows.slice(0, 60).map((r, i) => `<tr><td><span class="dot" style="--c:${COLORS[labels[i]]}"></span>${nameOf(labels[i], k)}</td>${head.map((c) => `<td>${r[c]}</td>`).join("")}</tr>`).join("");
  drawPlot();
}

function drawPlot() {
  const cv = $("plot");
  if (!res || !cv.clientWidth) return;
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext("2d"); g.scale(dpr, dpr);
  const { pts, labels, centroids, x, y } = res, m = { l: 52, r: 14, t: 12, b: 44 };
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const px = (v) => m.l + ((v - x0) / (x1 - x0 || 1)) * (W - m.l - m.r), py = (v) => H - m.b - ((v - y0) / (y1 - y0 || 1)) * (H - m.t - m.b);
  g.font = "12px Plus Jakarta Sans, sans-serif"; g.strokeStyle = "#ece8fa";
  for (let i = 0; i <= 5; i++) {
    const vx = x0 + ((x1 - x0) * i) / 5, vy = y0 + ((y1 - y0) * i) / 5;
    g.beginPath(); g.moveTo(px(vx), m.t); g.lineTo(px(vx), H - m.b); g.moveTo(m.l, py(vy)); g.lineTo(W - m.r, py(vy)); g.stroke();
    g.fillStyle = "#6b6891"; g.textAlign = "center"; g.fillText(Math.round(vx), px(vx), H - m.b + 16); g.textAlign = "right"; g.fillText(Math.round(vy), m.l - 8, py(vy) + 4);
  }
  g.fillStyle = "#161233"; g.textAlign = "center"; g.fillText(x, (W + m.l) / 2, H - 8);
  g.save(); g.translate(13, (H - m.b) / 2); g.rotate(-Math.PI / 2); g.fillText(y, 0, 0); g.restore();
  g.globalAlpha = 0.65; pts.forEach((p, i) => { g.fillStyle = COLORS[labels[i]]; g.beginPath(); g.arc(px(p[0]), py(p[1]), 3.500, 0, 7); g.fill(); });
  g.globalAlpha = 1; g.lineWidth = 3; g.strokeStyle = "#161233";
  centroids.forEach((c, i) => { g.fillStyle = COLORS[i]; g.beginPath(); g.arc(px(c[0]), py(c[1]), 9, 0, 7); g.fill(); g.stroke(); });
}

/* ---------- events ---------- */
function show(v) {
  view = v;
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  document.querySelectorAll("[data-v]").forEach((el) => (el.hidden = !el.dataset.v.split(" ").includes(v)));
  drawPlot();
}
function readFile(f) {
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { const { h, data } = parseCSV(rd.result); load(h, data, f.name); };
  rd.readAsText(f);
}
document.querySelectorAll("#nav button").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));
$("report").addEventListener("click", () => show("segs"));
$("file").addEventListener("change", (e) => readFile(e.target.files[0]));
const drop = $("drop");
["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
drop.addEventListener("drop", (e) => { e.preventDefault(); readFile(e.dataTransfer.files[0]); });
$("sample").addEventListener("click", sample);
$("run").addEventListener("click", refresh);
$("range").addEventListener("change", refresh);
$("k").addEventListener("input", (e) => ($("kOut").textContent = e.target.value));
window.addEventListener("resize", drawPlot);
$("who").textContent = USER_NAME;
show("dash");
sample();
