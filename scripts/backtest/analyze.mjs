import fs from 'node:fs';
const P = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const SPLIT = '2025-07-01';
const MK = {
  '1 - Victoire domicile': { o: x => x.H, c: x => x.cH, w: m => m.hg > m.ag, fam: '1N2' },
  'N - Match nul': { o: x => x.D, c: x => x.cD, w: m => m.hg === m.ag, fam: '1N2' },
  '2 - Victoire extérieur': { o: x => x.A, c: x => x.cA, w: m => m.hg < m.ag, fam: '1N2' },
  '1N - Double chance': { o: x => dc(x.H, x.D), c: x => dc(x.cH, x.cD), w: m => m.hg >= m.ag, fam: 'Double chance' },
  'N2 - Double chance': { o: x => dc(x.D, x.A), c: x => dc(x.cD, x.cA), w: m => m.hg <= m.ag, fam: 'Double chance' },
  '12 - Double chance': { o: x => dc(x.H, x.A), c: x => dc(x.cH, x.cA), w: m => m.hg !== m.ag, fam: 'Double chance' },
  'Plus de 2,5 buts': { o: x => x.O, c: x => x.cO, w: m => m.hg + m.ag >= 3, fam: 'Plus/moins 2,5' },
  'Moins de 2,5 buts': { o: x => x.U, c: x => x.cU, w: m => m.hg + m.ag <= 2, fam: 'Plus/moins 2,5' },
};
function dc(a, b) { return a && b ? 1 / (1 / a + 1 / b) : null; }
// probabilité « juste » de Pinnacle à la clôture (marge retirée)
function fair(m, nm) {
  const x = m.o; if (!x) return null;
  if (MK[nm].fam === 'Plus/moins 2,5') { if (!x.pO || !x.pU) return null; const s = 1 / x.pO + 1 / x.pU; return nm.startsWith('Plus') ? 1 / x.pO / s : 1 / x.pU / s; }
  if (!x.pH || !x.pD || !x.pA) return null;
  const s = 1 / x.pH + 1 / x.pD + 1 / x.pA, f = { H: 1 / x.pH / s, D: 1 / x.pD / s, A: 1 / x.pA / s };
  return { '1 - Victoire domicile': f.H, 'N - Match nul': f.D, '2 - Victoire extérieur': f.A, '1N - Double chance': f.H + f.D, 'N2 - Double chance': f.D + f.A, '12 - Double chance': f.H + f.A }[nm];
}
function bets(sel) {   // sel(m) -> [{nm, p}] ; retourne la liste des paris réglés
  const out = [];
  for (const m of P) { if (!m.o) continue;
    for (const b of sel(m)) { const o = MK[b.nm].o(m.o); if (!o) continue; const win = MK[b.nm].w(m), f = fair(m, b.nm);
      out.push({ m, nm: b.nm, p: b.p, o, win, pr: win ? o - 1 : -1, clv: f ? f * o - 1 : null, val: m.d >= SPLIT }); } }
  return out;
}
function stat(B) {
  const n = B.length; if (!n) return { n: 0 };
  const roi = B.reduce((s, b) => s + b.pr, 0) / n, hit = B.filter(b => b.win).length / n, po = B.reduce((s, b) => s + b.p, 0) / n;
  const cl = B.filter(b => b.clv !== null), clv = cl.length ? cl.reduce((s, b) => s + b.clv, 0) / cl.length : null;
  const sd = Math.sqrt(B.reduce((s, b) => s + (b.pr - roi) ** 2, 0) / n) / Math.sqrt(n);
  const mo = B.reduce((s, b) => s + b.o, 0) / n;
  return { n, roi, sd, hit, po, clv, mo };
}
const pc = x => x === null || x === undefined ? '   —  ' : ((x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%').padStart(7);
function line(lbl, B) {
  const a = stat(B.filter(b => !b.val)), v = stat(B.filter(b => b.val)), t = stat(B);
  const f = s => s.n ? `${String(s.n).padStart(5)} paris  réussite ${(s.hit * 100).toFixed(1)}% (prévu ${(s.po * 100).toFixed(1)}%)  cote moy ${s.mo.toFixed(2)}  ROI ${pc(s.roi)} ±${(s.sd * 100).toFixed(1)}  EV clôture ${pc(s.clv)}` : '    0 pari';
  console.log(lbl.padEnd(34) + '| 2023-25: ' + f(a) + '\n' + ''.padEnd(34) + '| 2025-26+: ' + f(v));
}
const sel = (mk, fn) => m => Object.keys(MK).filter(nm => mk(nm) && m.p[nm] !== undefined).map(nm => ({ nm, p: m.p[nm] })).filter(b => fn(b, m));
const val = (t) => (b, m) => { const o = MK[b.nm].o(m.o); return o && o >= 1.10 && b.p * o - 1 >= t; };

console.log('Matchs prédits :', P.length, ' avec cotes :', P.filter(m => m.o).length, ' période test', P[0].d, '→', P[P.length - 1].d, '\n');
// 1. calibration
console.log('=== 1. CALIBRATION (tous marchés ci-dessus) ===');
const cal = {};
for (const m of P) for (const nm of Object.keys(MK)) { const p = m.p[nm]; if (p === undefined) continue; const k = Math.min(9, Math.floor(p * 10)); const c = cal[k] ||= { n: 0, p: 0, w: 0 }; c.n++; c.p += p; c.w += MK[nm].w(m); }
for (const k of Object.keys(cal).sort((a, b) => a - b)) { const c = cal[k]; console.log(`proba ${k * 10}-${k * 10 + 10}% : ${String(c.n).padStart(6)}  prévu ${(c.p / c.n * 100).toFixed(1)}%  réel ${(c.w / c.n * 100).toFixed(1)}%`); }
// log loss 1N2 modèle vs Pinnacle clôture
let llM = 0, llP = 0, nn = 0;
for (const m of P) { const fH = fair(m, '1 - Victoire domicile'); if (fH === null) continue; const k = m.hg > m.ag ? '1 - Victoire domicile' : m.hg === m.ag ? 'N - Match nul' : '2 - Victoire extérieur';
  llM -= Math.log(m.p[k]); llP -= Math.log(fair(m, k)); nn++; }
console.log(`Log-loss 1N2 (plus bas = mieux) : modèle AZETO ${(llM / nn).toFixed(4)}  vs  Pinnacle clôture ${(llP / nn).toFixed(4)}  (${nn} matchs)\n`);

console.log('=== 2. PARIS VALUE (proba × cote moyenne − 1 ≥ seuil) ===');
for (const t of [0.03, 0.05, 0.10, 0.20]) line(`Tous marchés, seuil ${t * 100}%`, bets(sel(() => true, val(t))));
for (const fam of ['1N2', 'Double chance', 'Plus/moins 2,5']) for (const t of [0.03, 0.10]) line(`${fam}, seuil ${t * 100}%`, bets(sel(nm => MK[nm].fam === fam, val(t))));

console.log('\n=== 3. PARI SÉCURITÉ (meilleur marché 75-92 %, un par match) ===');
const safe = (withVal) => m => { const c = Object.keys(MK).filter(nm => m.p[nm] >= 0.75 && m.p[nm] < 0.92 && m.n >= 15 && MK[nm].o(m.o || {})).map(nm => ({ nm, p: m.p[nm] })).sort((a, b) => b.p - a.p);
  const b = c[0]; if (!b) return []; if (withVal && !(b.p * MK[b.nm].o(m.o) - 1 >= 0.03 && MK[b.nm].o(m.o) >= 1.10)) return []; return [b]; };
line('Sécurité, joué sans filtre', bets(safe(false)));
line('Sécurité + filtre value 3 %', bets(safe(true)));

console.log('\n=== 4. PAR CHAMPIONNAT (value tous marchés, seuil 5 %) ===');
const V5 = bets(sel(() => true, val(0.05)));
for (const lg of [...new Set(P.map(m => m.lg))].sort()) line(lg, V5.filter(b => b.m.lg === lg));

console.log('\n=== 5. PAR TRANCHE DE COTE (value seuil 5 %) ===');
for (const [lo, hi] of [[1.1, 1.5], [1.5, 2], [2, 3], [3, 5], [5, 99]]) line(`cote ${lo}-${hi}`, V5.filter(b => b.o >= lo && b.o < hi));

console.log('\n=== 6. MÉLANGE MODÈLE + MARCHÉ (1N2, Pinnacle ouverture) ===');
for (const w of [0, 0.25, 0.5, 0.75, 1]) for (const t of [0.03]) {
  const B = bets(m => { const x = m.o; if (!x || !x.p0H || !x.p0D || !x.p0A) return [];
    const s = 1 / x.p0H + 1 / x.p0D + 1 / x.p0A, mk = { '1 - Victoire domicile': 1 / x.p0H / s, 'N - Match nul': 1 / x.p0D / s, '2 - Victoire extérieur': 1 / x.p0A / s };
    return Object.keys(mk).map(nm => ({ nm, p: w * m.p[nm] + (1 - w) * mk[nm] })).filter(b => val(t)(b, m)); });
  line(`poids modèle ${w * 100}%, seuil ${t * 100}%`, B);
}
