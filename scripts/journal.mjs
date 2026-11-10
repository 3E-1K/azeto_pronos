// Journal des pronos publiés : chaque matin, note les 3 choix sécurité du site, puis les règle après le match.
// Utilise exactement le même code que la page (zone MODELE-DEBUT … MODELE-FIN de index.html).
// Usage : node scripts/journal.mjs   (lit data/donnees.js, écrit data/journal.js)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const a = html.indexOf('/* MODELE-DEBUT'), b = html.indexOf('/* MODELE-FIN */');
if (a < 0 || b < 0) throw new Error('Repères MODELE-DEBUT / MODELE-FIN introuvables dans index.html');
const M = new Function(html.slice(a, b) + '\nreturn {loadMatches, buildModel, computeUpcoming, pickSafe, winOf};')();

const dtxt = fs.readFileSync(path.join(ROOT, 'data/donnees.js'), 'utf8');
const D = JSON.parse(dtxt.slice(dtxt.indexOf('{'), dtxt.lastIndexOf('}') + 1));
const JF = path.join(ROOT, 'data/journal.js');
let J = { maj: '', paris: [] };
if (fs.existsSync(JF)) { const t = fs.readFileSync(JF, 'utf8'); J = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); }

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const benin = new Date(Date.now() + 3600e3);                       // heure du Bénin (UTC+1)
const todayStr = process.env.AZ_TODAY || benin.toISOString().slice(0, 10);
const today = new Date(todayStr + 'T00:00:00');
const dayDiff = (x, y) => Math.round((new Date(x + 'T00:00:00') - new Date(y + 'T00:00:00')) / 86400e3);

const rows = M.loadMatches(D);
const model = M.buildModel(rows);

// 1. régler les paris en attente
const res = rows.filter(r => !r.tier);
let regles = 0;
for (const x of J.paris) {
  if (x.statut !== 'en attente' || x.date >= todayStr) continue;
  const r = res.find(r => r.lg === x.lg && r.h === x.h && r.a === x.a && Math.abs(dayDiff(r.date.toISOString().slice(0, 10), x.date)) <= 1);
  if (r) {
    const w = M.winOf(x.pari, r.hg, r.ag);
    x.score = `${r.hg}-${r.ag}`; x.statut = w ? 'gagné' : 'perdu'; regles++;
  } else if (dayDiff(todayStr, x.date) > 5) x.statut = 'non trouvé';
}

// 2. publier les 3 choix du jour (une seule fois par jour : la mise à jour du vendredi après-midi ne fait que régler)
let ajoutes = 0;
if (!J.paris.some(x => x.pub === todayStr)) {
  const lim = new Date(today); lim.setDate(lim.getDate() + 2);
  const U = M.computeUpcoming(D, model, today).filter(u => u.date <= lim);
  const deja = new Set(J.paris.map(x => x.lg + '|' + x.h + '|' + x.a + '|' + x.date));
  for (const { u, c } of M.pickSafe(U)) {
    if (ajoutes >= 3) break;
    const k = u.lg + '|' + u.H.name + '|' + u.A.name + '|' + ymd(u.date);
    if (deja.has(k)) continue;
    J.paris.push({ pub: todayStr, date: ymd(u.date), heure: u.time || '', lg: u.lg, h: u.H.name, a: u.A.name, pari: c.nm,
      p: +c.p.toFixed(4), source: u.src, coteJuste: +(1 / c.p).toFixed(2), coteMarche: c.o ? +c.o.toFixed(2) : null, statut: 'en attente' });
    ajoutes++;
  }
}

J.maj = todayStr;
fs.writeFileSync(JF, 'window.AZ_JOURNAL = ' + JSON.stringify(J) + ';\n');
console.log(`Journal : ${ajoutes} prono(s) ajouté(s), ${regles} réglé(s), ${J.paris.length} au total.`);
