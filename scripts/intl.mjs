// Sélections nationales : Elo mondial (méthode eloratings.net) calculé sur tous les matchs depuis 1872
// + modèle de buts (régression de Poisson sur l'écart Elo). Source : github.com/martj42/international_results
export function parseCSVq(txt) {
  const out = []; let row = [], f = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1) out.push(row); row = []; }
    else f += c;
  }
  if (f || row.length) { row.push(f); if (row.length > 1) out.push(row); }
  const head = out.shift();
  return out.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const K_OF = t => t === 'FIFA World Cup' ? 60
  : ['African Cup of Nations', 'UEFA Euro', 'Copa América', 'AFC Asian Cup', 'Gold Cup', 'Oceania Nations Cup', 'Confederations Cup'].includes(t) ? 50
  : /qualification/.test(t) || ['UEFA Nations League', 'CONCACAF Nations League'].includes(t) ? 40
  : t === 'Friendly' ? 20 : 30;
const G_OF = n => n <= 1 ? 1 : n === 2 ? 1.5 : (11 + n) / 8;

const CONF_T = {
  Afrique: ['African Cup of Nations qualification', 'African Cup of Nations', 'COSAFA Cup', 'CECAFA Cup', 'WAFU Cup of Nations', 'African Nations Championship'],
  Europe: ['UEFA Nations League', 'UEFA Euro qualification', 'UEFA Euro'],
  Asie: ['AFC Asian Cup qualification', 'AFC Asian Cup', 'AFF Championship', 'ASEAN Championship', 'SAFF Cup', 'EAFF Championship', 'Gulf Cup', 'WAFF Championship', 'CAFA Nations Cup'],
  'Amérique du Nord et centrale': ['CONCACAF Nations League', 'CONCACAF Nations League qualification', 'Gold Cup qualification'],
  'Océanie': ['Oceania Nations Cup', 'Oceania Nations Cup qualification', 'Pacific Games', "MSG Prime Minister's Cup"],
};
const CONMEBOL = ['Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador', 'Paraguay', 'Peru', 'Uruguay', 'Venezuela'];

function fit(obs, np = 5) {   // Poisson : log λ = a + b·d' + h·domicile + g·adversaire à domicile + f·amical ; Newton-Raphson
  let th = Array(np).fill(0);
  for (let it = 0; it < 50; it++) {
    const gr = Array(np).fill(0), H = Array.from({ length: np }, () => Array(np).fill(0));
    let ll = 0;
    for (const o of obs) {
      const x = o.x, eta = x.reduce((s, v, i) => s + v * th[i], 0), mu = Math.exp(eta);
      ll += o.w * (o.y * eta - mu);
      for (let i = 0; i < np; i++) { gr[i] += o.w * (o.y - mu) * x[i]; for (let j = 0; j < np; j++) H[i][j] += o.w * mu * x[i] * x[j]; }
    }
    const A = H.map((r, i) => [...r, gr[i]]);
    for (let i = 0; i < np; i++) { let p = i; for (let k = i + 1; k < np; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k; [A[i], A[p]] = [A[p], A[i]];
      for (let k = 0; k < np; k++) if (k !== i) { const f = A[k][i] / A[i][i]; for (let j = i; j <= np; j++) A[k][j] -= f * A[i][j]; } }
    const dl = A.map((r, i) => r[np] / r[i]); th = th.map((v, i) => v + dl[i]);
    if (Math.max(...dl.map(Math.abs)) < 1e-9) { fit.ll = ll; break; }
  }
  return { a: th[0], b: th[1], h: th[2], g: th[3], f: th[4] };
}
const soft = (d, S) => S * Math.tanh(d / S);   // écart Elo/100 « saturé » : au-delà de ~S les écarts comptent de moins en moins

export const lambdas = (p, eh, ea, neutral, friendly = false) => {
  const d = soft((eh - ea) / 100, p.S), home = neutral ? 0 : 1, fr = friendly ? p.f : 0;
  return [Math.exp(p.a + p.b * d + p.h * home + fr), Math.exp(p.a - p.b * d + p.g * home + fr)];
};

export function buildIntl(csvResults, csvFormer, opts = {}) {
  const ren = {};
  for (const r of parseCSVq(csvFormer)) ren[r.former] = r.current;
  const rows = parseCSVq(csvResults).filter(r => r.home_score !== 'NA' && r.home_score !== '' && r.date)
    .map(r => ({ date: r.date, h: ren[r.home_team] || r.home_team, a: ren[r.away_team] || r.away_team, hg: +r.home_score, ag: +r.away_score,
      t: r.tournament, neutral: r.neutral === 'TRUE', country: r.country }))
    .sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
  const R = {}, N = {}, hist = {};
  for (const m of rows) {
    const rh = R[m.h] ??= 1500, ra = R[m.a] ??= 1500;
    m.eh = rh; m.ea = ra; m.nh = N[m.h] || 0; m.na = N[m.a] || 0;
    const dr = rh - ra + (m.neutral ? 0 : 100), we = 1 / (10 ** (-dr / 400) + 1);
    const w = m.hg > m.ag ? 1 : m.hg === m.ag ? 0.5 : 0, k = K_OF(m.t) * G_OF(Math.abs(m.hg - m.ag));
    R[m.h] = rh + k * (w - we); R[m.a] = ra - k * (w - we);
    N[m.h] = m.nh + 1; N[m.a] = m.na + 1;
    (hist[m.h] ||= []).push(m); (hist[m.a] ||= []).push(m);
  }
  const obsOf = (lo, hi, S) => {
    const o = [];
    for (const m of rows) {
      if (m.date < lo || m.date >= hi || m.nh < 20 || m.na < 20) continue;
      const F = m.t === 'Friendly' ? 1 : 0, d = soft((m.eh - m.ea) / 100, S), home = m.neutral ? 0 : 1;
      o.push({ y: m.hg, x: [1, d, home, 0, F], w: 1 }, { y: m.ag, x: [1, -d, 0, home, F], w: 1 });
    }
    return o;
  };
  // S (saturation) choisi par vraisemblance maximale
  const fitS = (lo, hi) => { let best = null;
    for (const S of [3, 4, 5, 6, 7, 8, 10, 13, 20, 50]) { const p = fit(obsOf(lo, hi, S)); if (!best || fit.ll > best.ll) best = { ...p, S, ll: fit.ll }; }
    delete best.ll; return best; };
  const last = rows[rows.length - 1].date;
  const params = fitS('2014-01-01', '9999');
  // confédérations
  const cnt = {};
  for (const m of rows) if (m.date >= '2010-01-01') for (const [c, ts] of Object.entries(CONF_T)) if (ts.includes(m.t)) for (const t of [m.h, m.a]) { (cnt[t] ||= {})[c] = (cnt[t][c] || 0) + 1; }
  const conf = t => CONMEBOL.includes(t) ? 'Amérique du Sud' : cnt[t] ? Object.entries(cnt[t]).sort((x, y) => y[1] - x[1])[0][0] : null;
  const since = '2022-01-01';
  const teams = Object.keys(R).map(n => ({ n, conf: conf(n), elo: Math.round(R[n]), h: hist[n] })).filter(t => t.conf && t.h.filter(m => m.date >= since).length >= 5);
  teams.sort((x, y) => y.elo - x.elo);
  const byC = {};
  const out = teams.map((t, i) => {
    byC[t.conf] = (byC[t.conf] || 0) + 1;
    const l5 = t.h.slice(-5).map(m => { const me = m.h === t.n, gf = me ? m.hg : m.ag, ga = me ? m.ag : m.hg;
      return { d: m.date, o: me ? m.a : m.h, s: `${gf}-${ga}`, r: gf > ga ? 'V' : gf === ga ? 'N' : 'D', c: m.t, dom: m.neutral ? 'N' : me ? 'D' : 'E' }; });
    return { n: t.n, conf: t.conf, elo: t.elo, rank: i + 1, crank: byC[t.conf], form: l5 };
  });
  const res = { last, params, teams: out, nMatches: rows.length };
  if (opts.backtest) res.rows = rows, res.fitS = fitS;
  return res;
}

export const FR_PAYS = {"Afghanistan":"Afghanistan","Albania":"Albanie","Algeria":"Algérie","American Samoa":"Samoa américaines","Andorra":"Andorre","Angola":"Angola","Anguilla":"Anguilla","Antigua and Barbuda":"Antigua-et-Barbuda","Argentina":"Argentine","Armenia":"Arménie","Aruba":"Aruba","Australia":"Australie","Austria":"Autriche","Azerbaijan":"Azerbaïdjan","Bahamas":"Bahamas","Bahrain":"Bahreïn","Bangladesh":"Bangladesh","Barbados":"Barbade","Belarus":"Biélorussie","Belgium":"Belgique","Belize":"Belize","Benin":"Bénin","Bermuda":"Bermudes","Bhutan":"Bhoutan","Bolivia":"Bolivie","Bonaire":"Bonaire","Bosnia and Herzegovina":"Bosnie-Herzégovine","Botswana":"Botswana","Brazil":"Brésil","British Virgin Islands":"Îles Vierges britanniques","Brunei":"Brunei","Bulgaria":"Bulgarie","Burkina Faso":"Burkina Faso","Burundi":"Burundi","Cambodia":"Cambodge","Cameroon":"Cameroun","Canada":"Canada","Cape Verde":"Cap-Vert","Cayman Islands":"Îles Caïmans","Central African Republic":"Centrafrique","Chad":"Tchad","Chile":"Chili","China":"Chine","Colombia":"Colombie","Comoros":"Comores","Congo":"Congo","Cook Islands":"Îles Cook","Costa Rica":"Costa Rica","Croatia":"Croatie","Cuba":"Cuba","Curaçao":"Curaçao","Cyprus":"Chypre","Czech Republic":"Tchéquie","DR Congo":"RD Congo","Denmark":"Danemark","Djibouti":"Djibouti","Dominica":"Dominique","Dominican Republic":"République dominicaine","Ecuador":"Équateur","Egypt":"Égypte","El Salvador":"Salvador","England":"Angleterre","Equatorial Guinea":"Guinée équatoriale","Estonia":"Estonie","Eswatini":"Eswatini","Ethiopia":"Éthiopie","Faroe Islands":"Îles Féroé","Fiji":"Fidji","Finland":"Finlande","France":"France","French Guiana":"Guyane","Gabon":"Gabon","Gambia":"Gambie","Georgia":"Géorgie","Germany":"Allemagne","Ghana":"Ghana","Gibraltar":"Gibraltar","Greece":"Grèce","Grenada":"Grenade","Guadeloupe":"Guadeloupe","Guam":"Guam","Guatemala":"Guatemala","Guinea":"Guinée","Guinea-Bissau":"Guinée-Bissau","Guyana":"Guyana","Haiti":"Haïti","Honduras":"Honduras","Hong Kong":"Hong Kong","Hungary":"Hongrie","Iceland":"Islande","India":"Inde","Indonesia":"Indonésie","Iran":"Iran","Iraq":"Irak","Israel":"Israël","Italy":"Italie","Ivory Coast":"Côte d'Ivoire","Jamaica":"Jamaïque","Japan":"Japon","Jordan":"Jordanie","Kazakhstan":"Kazakhstan","Kenya":"Kenya","Kosovo":"Kosovo","Kuwait":"Koweït","Kyrgyzstan":"Kirghizistan","Laos":"Laos","Latvia":"Lettonie","Lebanon":"Liban","Lesotho":"Lesotho","Liberia":"Liberia","Libya":"Libye","Liechtenstein":"Liechtenstein","Lithuania":"Lituanie","Luxembourg":"Luxembourg","Macau":"Macao","Madagascar":"Madagascar","Malawi":"Malawi","Malaysia":"Malaisie","Maldives":"Maldives","Mali":"Mali","Malta":"Malte","Martinique":"Martinique","Mauritania":"Mauritanie","Mauritius":"Maurice","Mexico":"Mexique","Moldova":"Moldavie","Mongolia":"Mongolie","Montenegro":"Monténégro","Montserrat":"Montserrat","Morocco":"Maroc","Mozambique":"Mozambique","Myanmar":"Birmanie","Namibia":"Namibie","Nepal":"Népal","Netherlands":"Pays-Bas","New Caledonia":"Nouvelle-Calédonie","New Zealand":"Nouvelle-Zélande","Nicaragua":"Nicaragua","Niger":"Niger","Nigeria":"Nigeria","North Korea":"Corée du Nord","North Macedonia":"Macédoine du Nord","Northern Ireland":"Irlande du Nord","Northern Mariana Islands":"Îles Mariannes du Nord","Norway":"Norvège","Oman":"Oman","Pakistan":"Pakistan","Palestine":"Palestine","Panama":"Panama","Papua New Guinea":"Papouasie-Nouvelle-Guinée","Paraguay":"Paraguay","Peru":"Pérou","Philippines":"Philippines","Poland":"Pologne","Portugal":"Portugal","Puerto Rico":"Porto Rico","Qatar":"Qatar","Republic of Ireland":"Irlande","Romania":"Roumanie","Russia":"Russie","Rwanda":"Rwanda","Saint Kitts and Nevis":"Saint-Christophe-et-Niévès","Saint Lucia":"Sainte-Lucie","Saint Martin":"Saint-Martin","Saint Vincent and the Grenadines":"Saint-Vincent-et-les-Grenadines","Samoa":"Samoa","San Marino":"Saint-Marin","Saudi Arabia":"Arabie saoudite","Scotland":"Écosse","Senegal":"Sénégal","Serbia":"Serbie","Seychelles":"Seychelles","Sierra Leone":"Sierra Leone","Singapore":"Singapour","Sint Maarten":"Sint Maarten","Slovakia":"Slovaquie","Slovenia":"Slovénie","Solomon Islands":"Îles Salomon","Somalia":"Somalie","South Africa":"Afrique du Sud","South Korea":"Corée du Sud","South Sudan":"Soudan du Sud","Spain":"Espagne","Sri Lanka":"Sri Lanka","Sudan":"Soudan","Suriname":"Suriname","Sweden":"Suède","Switzerland":"Suisse","Syria":"Syrie","São Tomé and Príncipe":"Sao Tomé-et-Principe","Tahiti":"Tahiti","Taiwan":"Taïwan","Tajikistan":"Tadjikistan","Tanzania":"Tanzanie","Thailand":"Thaïlande","Timor-Leste":"Timor oriental","Togo":"Togo","Tonga":"Tonga","Trinidad and Tobago":"Trinité-et-Tobago","Tunisia":"Tunisie","Turkey":"Turquie","Turkmenistan":"Turkménistan","Turks and Caicos Islands":"Îles Turques-et-Caïques","Uganda":"Ouganda","Ukraine":"Ukraine","United Arab Emirates":"Émirats arabes unis","United States":"États-Unis","United States Virgin Islands":"Îles Vierges américaines","Uruguay":"Uruguay","Uzbekistan":"Ouzbékistan","Vanuatu":"Vanuatu","Venezuela":"Venezuela","Vietnam":"Viêt Nam","Wales":"Pays de Galles","Yemen":"Yémen","Zambia":"Zambie","Zimbabwe":"Zimbabwe","Eritrea":"Érythrée"};
const FR_COMP = {"Friendly":"Amical","FIFA World Cup":"Coupe du monde","FIFA World Cup qualification":"Qualif. Coupe du monde","African Cup of Nations":"CAN","African Cup of Nations qualification":"Qualif. CAN","UEFA Euro":"Euro","UEFA Euro qualification":"Qualif. Euro","UEFA Nations League":"Ligue des nations UEFA","CONCACAF Nations League":"Ligue des nations CONCACAF","Copa América":"Copa América","AFC Asian Cup":"Coupe d'Asie","AFC Asian Cup qualification":"Qualif. Coupe d'Asie","Gold Cup":"Gold Cup","COSAFA Cup":"Coupe COSAFA"};
export function frIntl(I) {
  const fr = n => FR_PAYS[n] || n;
  for (const t of I.teams) { t.fr = fr(t.n); for (const f of t.form) { f.o = fr(f.o); f.c = FR_COMP[f.c] || f.c; } }
  return I;
}
