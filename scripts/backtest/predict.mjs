// Rejoue le modèle AZETO match par match (sans connaître l'avenir) et enregistre probabilités + cotes.
import fs from 'node:fs';
const REPO = process.argv[2], OUT = process.argv[3];
const html = fs.readFileSync(REPO + '/index.html', 'utf8');
const code = html.slice(html.indexOf('/* MODELE-DEBUT'), html.indexOf('/* MODELE-FIN */'));   // code pur partagé avec la page
const M = new Function(code + '\nreturn {P, MAIN, NEW, DIV2, parseCSV, parseDate, loadMatches, buildModel, markets};')();

// --- fichiers ---
const files = {};
for (const dir of ['data/hist', 'data/raw']) for (const f of fs.readdirSync(REPO + '/' + dir)) {
  const m = f.match(/^(\d{4}_[A-Z0-9]+|new_[A-Z]+)\.csv$/); if (!m) continue;
  files[m[1]] = fs.readFileSync(REPO + '/' + dir + '/' + f, 'utf8');
}
const rows = M.loadMatches({ files });
// cotes : relecture des CSV pour garder les colonnes de cotes, indexées par ligue|date|dom|ext
const num = x => { const v = parseFloat(x); return v > 1 ? v : null; };
const odds = {};
for (const [key, txt] of Object.entries(files)) {
  const [pre, code] = key.split('_');
  if (pre === 'new') {
    for (const r of M.parseCSV(txt)) { if (!r.HG || !r.Home) continue;
      const k = M.NEW[code] + '|' + +M.parseDate(r.Date) + '|' + r.Home.trim() + '|' + r.Away.trim();
      odds[k] = { closing_only: 1, H: num(r.AvgCH), D: num(r.AvgCD), A: num(r.AvgCA), cH: num(r.AvgCH), cD: num(r.AvgCD), cA: num(r.AvgCA), pH: num(r.PSCH), pD: num(r.PSCD), pA: num(r.PSCA) }; }
  } else if (M.MAIN[code]) {
    for (const r of M.parseCSV(txt)) { if (!r.HomeTeam || r.FTHG === '' || r.FTHG === undefined) continue;
      const k = M.MAIN[code] + '|' + +M.parseDate(r.Date) + '|' + r.HomeTeam.trim() + '|' + r.AwayTeam.trim();
      odds[k] = { H: num(r.AvgH), D: num(r.AvgD), A: num(r.AvgA), O: num(r['Avg>2.5']), U: num(r['Avg<2.5']),
        cH: num(r.AvgCH), cD: num(r.AvgCD), cA: num(r.AvgCA), cO: num(r['AvgC>2.5']), cU: num(r['AvgC<2.5']),
        pH: num(r.PSCH), pD: num(r.PSCD), pA: num(r.PSCA), pO: num(r['PC>2.5']), pU: num(r['PC<2.5']),
        p0H: num(r.PSH), p0D: num(r.PSD), p0A: num(r.PSA), p0O: num(r['P>2.5']), p0U: num(r['P<2.5']),
        xH: num(r.MaxH), xD: num(r.MaxD), xA: num(r.MaxA), xO: num(r['Max>2.5']), xU: num(r['Max<2.5']), bH: num(r.B365H), bD: num(r.B365D), bA: num(r.B365A), bO: num(r['B365>2.5']), bU: num(r['B365<2.5']) }; }
  }
}
const D1 = rows.filter(r => !r.tier);
const test = D1.filter(r => r.date >= new Date('2023-08-01')).sort((a, b) => a.date - b.date);
const dates = [...new Set(test.map(r => +r.date))].sort((a, b) => a - b);
const out = []; let skipped = 0; const t0 = Date.now();
for (const [i, d] of dates.entries()) {
  const lo = d - 730 * 86400000;
  const model = M.buildModel(rows.filter(r => +r.date < d && +r.date >= lo));
  for (const r of test.filter(r => +r.date === d)) {
    const ts = model.teams[r.lg]; const H = ts && ts.find(t => t.name === r.h), A = ts && ts.find(t => t.name === r.a);
    if (!H || !A) { skipped++; continue; }
    const L = model.lg[r.lg], mk = M.markets(H.attH * A.defA * L.LH, A.attA * H.defH * L.LA);
    out.push({ d: new Date(d).toISOString().slice(0, 10), lg: r.lg, h: r.h, a: r.a, hg: r.hg, ag: r.ag, n: Math.min(H.neff, A.neff),
      p: Object.fromEntries(mk.list.map(([k, v]) => [k, +v.toFixed(5)])), o: odds[r.lg + '|' + d + '|' + r.h + '|' + r.a] || null });
  }
  if (i % 100 === 0) console.log(i, '/', dates.length, Math.round((Date.now() - t0) / 1000) + 's');
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('matchs prédits', out.length, 'ignorés', skipped, 'avec cotes', out.filter(x => x.o).length);
