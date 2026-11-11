// Mise à jour des données AZETO Pronos (équivalent de MAJ_DONNEES.ps1, exécuté par GitHub Actions)
// Télécharge résultats + cotes (football-data.co.uk), calendrier (openfootball) et Elo (clubelo.com)
// puis écrit data/donnees.js. Si une source échoue, la copie précédente (data/raw) est gardée.
import fs from 'node:fs';
import path from 'node:path';
import { buildIntl, frIntl } from './intl.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RAW = path.join(ROOT, 'data', 'raw');
fs.mkdirSync(RAW, { recursive: true });

async function get(url, dest) {
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (AZETO Pronos data update)' } });
      if (r.ok) { const t = await r.text(); if (t.length > 200) { fs.writeFileSync(dest, t); return true; } }
      console.log(`HTTP ${r.status} ${url}`);
    } catch (e) { console.log(`Erreur ${url}: ${e.message}`); }
    await new Promise(res => setTimeout(res, 2000 * i));
  }
  console.log(`ECHEC ${url} (ancienne copie conservée si elle existe)`);
  return false;
}
const read = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;

const now = new Date();
const y = now.getUTCMonth() + 1 >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const p2 = n => String(n % 100).padStart(2, '0');
const cur = p2(y) + p2(y + 1), prev = p2(y - 1) + p2(y), prev2 = p2(y - 2) + p2(y - 1);
const okSeasons = new Set([`${y}/${y + 1}`, `${y - 1}/${y}`, `${y + 1}`, `${y}`, `${y - 1}`]);

const files = {};
for (const s of [prev, cur]) for (const l of ['E0','SP1','F1','I1','D1','B1','T1','SC0','G1','N1','P1']) {
  const dest = path.join(RAW, `${s}_${l}.csv`);
  await get(`https://www.football-data.co.uk/mmz4281/${s}/${l}.csv`, dest);
  const t = read(dest); if (t) files[`${s}_${l}`] = t;
}
// 2e divisions (pour les équipes promues) : on ne garde que les colonnes utiles
for (const s of [prev2, prev, cur]) for (const l of ['E1','D2','I2','SP2','F2','SC1']) {
  const dest = path.join(RAW, `${s}_${l}.csv`);
  await get(`https://www.football-data.co.uk/mmz4281/${s}/${l}.csv`, dest);
  const t = read(dest); if (!t) continue;
  const lines = t.replace(/^\uFEFF/, '').split(/\r?\n/).filter(x => x.trim());
  const head = lines[0].split(','), idx = ['Date','HomeTeam','AwayTeam','FTHG','FTAG'].map(c => head.indexOf(c));
  if (idx.includes(-1)) continue;
  files[`${s}_${l}`] = lines.map(x => { const p = x.split(','); return idx.map(i => p[i]).join(','); }).join('\n');
}
for (const l of ['AUT','DNK','FIN','NOR','POL','SWZ','ROU','SWE','IRL']) {
  const dest = path.join(RAW, `new_${l}.csv`);
  await get(`https://www.football-data.co.uk/new/${l}.csv`, dest);
  const t = read(dest); if (!t) continue;
  const lines = t.split(/\r?\n/);
  files[`new_${l}`] = [lines[0], ...lines.slice(1).filter(x => okSeasons.has(x.split(',')[2]))].join('\n');
}
for (const [f, k] of [['fixtures.csv', 'fix_main'], ['new_league_fixtures.csv', 'fix_new']]) {
  const dest = path.join(RAW, f);
  await get(`https://www.football-data.co.uk/${f}`, dest);
  const t = read(dest); if (t) files[k] = t;
}
const saisonOfb = `${y}-${p2(y + 1)}`;
const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const lim = new Date(today); lim.setUTCDate(lim.getUTCDate() + 10);
const calendrier = [];
for (const c of ['en.1','es.1','it.1','de.1','fr.1','nl.1','pt.1']) {
  const dest = path.join(RAW, `calendrier_${c}.json`);
  await get(`https://raw.githubusercontent.com/openfootball/football.json/master/${saisonOfb}/${c}.json`, dest);
  const t = read(dest); if (!t) continue;
  try {
    for (const m of JSON.parse(t).matches) {
      const d = new Date(m.date + 'T00:00:00Z');
      if (d >= today && d <= lim) calendrier.push({ code: c, date: m.date, time: m.time || '', h: m.team1, a: m.team2 });
    }
  } catch { console.log(`Calendrier illisible : ${c}`); }
}
const eloDest = path.join(RAW, 'clubelo_home.html');
await get('http://clubelo.com/', eloDest);
let elo_html = read(eloDest) || '';
const i = elo_html.indexOf('<div class="accordion-item">');
elo_html = i >= 0 ? elo_html.slice(i) : '';

// Sélections nationales : tous les matchs internationaux depuis 1872 (martj42/international_results)
let intl = null;
{
  const base = 'https://raw.githubusercontent.com/martj42/international_results/master/';
  const fR = path.join(RAW, 'intl_results.csv'), fN = path.join(RAW, 'intl_former_names.csv');
  await get(base + 'results.csv', fR); await get(base + 'former_names.csv', fN);
  try {
    if (read(fR) && read(fN)) {
      const I = frIntl(buildIntl(read(fR), read(fN)));
      const r4 = x => Math.round(x * 1e4) / 1e4;
      intl = { last: I.last, n: I.nMatches, p: { a: r4(I.params.a), b: r4(I.params.b), h: r4(I.params.h), g: r4(I.params.g), f: r4(I.params.f), S: I.params.S }, teams: I.teams };
    }
  } catch (e) { console.log('Sélections : erreur ' + e.message); }
}

const pad = n => String(n).padStart(2, '0');
// Calendrier des sélections nationales (10 jours) : API publique ESPN, une requête par compétition.
// La source des résultats (martj42) ne publie pas les matchs à venir.
const INTL_COMP = {
  'uefa.nations': 'Ligue des nations UEFA', 'fifa.friendly': 'Match amical', 'uefa.euroq': 'Qualif. Euro',
  'caf.nations': 'Coupe d\'Afrique des nations', 'caf.nations_qual': 'Qualif. CAN', 'fifa.worldq.caf': 'Qualif. Coupe du monde (Afrique)',
  'fifa.worldq.uefa': 'Qualif. Coupe du monde (Europe)', 'fifa.worldq.conmebol': 'Qualif. Coupe du monde (Amérique du Sud)',
  'fifa.worldq.concacaf': 'Qualif. Coupe du monde (CONCACAF)', 'fifa.worldq.afc': 'Qualif. Coupe du monde (Asie)',
  'concacaf.nations.league': 'Ligue des nations CONCACAF', 'afc.asian.cup': 'Coupe d\'Asie', 'afc.cupq': 'Qualif. Coupe d\'Asie',
  'fifa.world': 'Coupe du monde', 'uefa.euro': 'Euro', 'conmebol.america': 'Copa América', 'caf.chan': 'CHAN', 'fifa.arab': 'Coupe arabe'
};
let intl_fix = [];
{
  const ymd = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const end = new Date(now.getTime() + 10 * 86400e3), seen = new Set();
  for (const [slug, comp] of Object.entries(INTL_COMP)) {
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${ymd(now)}-${ymd(end)}&limit=300`, { headers: { 'User-Agent': 'Mozilla/5.0 (AZETO Pronos data update)' } });
      if (!r.ok) { console.log(`Sélections ${slug} : HTTP ${r.status}`); continue; }
      const j = await r.json(); let n = 0;
      for (const e of j.events || []) {
        const c = e.competitions && e.competitions[0]; if (!c) continue;
        const st = (c.status || e.status || {}).type || {}; if (st.state && st.state !== 'pre') continue;
        const h = c.competitors.find(x => x.homeAway === 'home'), a = c.competitors.find(x => x.homeAway === 'away'); if (!h || !a) continue;
        const t = new Date(new Date(e.date).getTime() + 3600e3);      // heure du Bénin
        const m = { date: t.toISOString().slice(0, 10), time: t.toISOString().slice(11, 16), comp, h: h.team.displayName || h.team.name, a: a.team.displayName || a.team.name, neutral: !!c.neutralSite };
        const k = m.date + m.h + m.a; if (seen.has(k)) continue; seen.add(k); intl_fix.push(m); n++;
      }
      if (n) console.log(`Sélections ${slug} : ${n} matchs à venir`);
    } catch (e) { console.log(`Sélections ${slug} : erreur ${e.message}`); }
  }
  intl_fix.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
  console.log(`Calendrier sélections : ${intl_fix.length} matchs`);
}

const local = new Date(now.getTime() + 60 * 60 * 1000); // heure du Bénin (UTC+1)
const maj = `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}/${local.getUTCFullYear()} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
const out = path.join(ROOT, 'data', 'donnees.js');
fs.writeFileSync(out, 'window.AZ_DATA = ' + JSON.stringify({ maj, saison: cur, files, calendrier, elo_html, intl, intl_fix }) + ';');
console.log(`OK : donnees.js ${Math.round(fs.statSync(out).size / 1024)} Ko, ${Object.keys(files).length} fichiers, ${calendrier.length} matchs au calendrier, Elo ${elo_html ? 'OK' : 'absent'}, ${intl ? intl.teams.length + ' sélections (dernier match ' + intl.last + ')' : 'sélections absentes'}`);
