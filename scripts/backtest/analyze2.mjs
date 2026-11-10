import fs from 'node:fs';
const P = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).filter(m => m.o && m.o.p0H && m.o.p0D && m.o.p0A && m.o.pH);
const SPLIT = '2025-07-01';
const K = ['1 - Victoire domicile', 'N - Match nul', '2 - Victoire extérieur'];
const res = m => m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2;
const nv = (a) => { const s = a.reduce((t, x) => t + 1 / x, 0); return a.map(x => 1 / x / s); };
console.log('Matchs avec cotes Pinnacle ouverture + clôture :', P.length);
// (a) log-loss
for (const w of [0, 0.1, 0.2, 0.3, 0.5, 1]) {
  let ll = [0, 0], n = [0, 0];
  for (const m of P) { const po = nv([m.o.p0H, m.o.p0D, m.o.p0A]), pm = K.map(k => m.p[k]);
    const b = po.map((x, i) => w * pm[i] + (1 - w) * x); const v = m.d >= SPLIT ? 1 : 0; ll[v] -= Math.log(b[res(m)]); n[v]++; }
  console.log(`log-loss 1N2  poids modèle ${w * 100}% : 2023-25 ${(ll[0] / n[0]).toFixed(4)}   2025-26+ ${(ll[1] / n[1]).toFixed(4)}`);
}
{ let ll = [0, 0], n = [0, 0]; for (const m of P) { const pc = nv([m.o.pH, m.o.pD, m.o.pA]); const v = m.d >= SPLIT ? 1 : 0; ll[v] -= Math.log(pc[res(m)]); n[v]++; }
  console.log(`log-loss Pinnacle CLÔTURE (référence) : 2023-25 ${(ll[0] / n[0]).toFixed(4)}   2025-26+ ${(ll[1] / n[1]).toFixed(4)}`); }

// (b) value ancrée sur le marché
function run(lbl, wModel, book, t, filt = () => true) {
  const out = [[], []];
  for (const m of P) { const po = nv([m.o.p0H, m.o.p0D, m.o.p0A]), pm = K.map(k => m.p[k]), pc = nv([m.o.pH, m.o.pD, m.o.pA]);
    const odds = { avg: [m.o.H, m.o.D, m.o.A], b365: [m.o.bH, m.o.bD, m.o.bA], max: [m.o.xH, m.o.xD, m.o.xA] }[book];
    for (let i = 0; i < 3; i++) { const p = wModel * pm[i] + (1 - wModel) * po[i], o = odds[i]; if (!o || o < 1.1) continue;
      if (p * o - 1 < t || !filt(p, o, i)) continue;
      const win = res(m) === i; out[m.d >= SPLIT ? 1 : 0].push({ pr: win ? o - 1 : -1, clv: pc[i] * o - 1, win, p, o }); } }
  const f = B => { if (!B.length) return '    0'; const n = B.length, roi = B.reduce((s, b) => s + b.pr, 0) / n, clv = B.reduce((s, b) => s + b.clv, 0) / n, sd = Math.sqrt(B.reduce((s, b) => s + (b.pr - roi) ** 2, 0) / n / n);
    return `${String(n).padStart(5)} paris réussite ${(B.filter(b => b.win).length / n * 100).toFixed(1)}% cote ${(B.reduce((s, b) => s + b.o, 0) / n).toFixed(2)} ROI ${(roi * 100).toFixed(1).padStart(6)}% ±${(sd * 100).toFixed(1)} EV@clôture ${(clv * 100).toFixed(1).padStart(5)}%`; };
  console.log(lbl.padEnd(46) + '| 23-25 ' + f(out[0]) + '\n' + ''.padEnd(46) + '| 25-26+ ' + f(out[1]));
}
console.log('\n--- Value ancrée sur Pinnacle (probabilité = marché sans marge, ± modèle) ---');
for (const book of ['avg', 'b365', 'max']) for (const w of [0, 0.2]) for (const t of [0.0, 0.02, 0.05]) run(`cotes ${book}, poids modèle ${w * 100}%, seuil ${t * 100}%`, w, book, t);
console.log('\n--- Favoris 75-92 % (proba mélangée 20 %), cotes moyennes ---');
run('sécurité 1N2, sans filtre', 0.2, 'avg', -1, (p) => p >= 0.75 && p < 0.92);
run('sécurité 1N2, value ≥ 0', 0.2, 'avg', 0, (p) => p >= 0.75 && p < 0.92);
run('sécurité 1N2, value ≥ 0, meilleure cote', 0.2, 'max', 0, (p) => p >= 0.75 && p < 0.92);
