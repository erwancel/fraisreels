/* ===========================================================
   import.js — lecture automatique des PDF
   Roster NetLine/Crew  → séjours et nuits d'escale
   Bulletin Eurowings   → montants du mois
   Le PDF est lu localement, rien n'est envoyé nulle part.
   =========================================================== */

const PDFJS_CDN = {
  lib:    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
};

async function ensurePdfReader() {
  if (!window.pdfjsLib) await loadScript(PDFJS_CDN.lib);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_CDN.worker;
  return window.pdfjsLib;
}

/**
 * Extrait le texte en conservant la géométrie.
 * Le roster est sur trois colonnes : sans les coordonnées, l'ordre de lecture
 * mélange les jours et le décodage devient impossible.
 */
async function pdfItems(file) {
  const lib = await ensurePdfReader();
  const buffer = await file.arrayBuffer();
  const doc = await lib.getDocument({ data: buffer }).promise;
  const items = [];
  const pages = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    // Un planning est imprimé en paysage : la page est stockée tournée.
    // Les coordonnées brutes du texte suivent l'orientation de stockage,
    // pas ce qui s'affiche. Sans cette matrice, les colonnes visuelles
    // sont lues comme des lignes et le document devient indéchiffrable.
    const viewport = page.getViewport({ scale: 1 });
    pages.push({ page: p, rotation: page.rotate, items: content.items.length });

    for (const it of content.items) {
      const str = it.str || '';
      if (!str.trim()) continue;
      const m = lib.Util.transform(viewport.transform, it.transform);
      const size = Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]) || 8;
      items.push({
        page: p,
        x: m[4],
        // La matrice d'affichage oriente y vers le bas. On l'inverse pour
        // conserver la convention « y élevé = haut de page » utilisée ensuite.
        y: -m[5],
        w: it.width || 0,
        size,
        str
      });
    }
  }

  items.meta = { pages, total: items.length };
  return items;
}

/**
 * Regroupe les éléments en lignes, puis recompose les mots.
 *
 * Ce planning est produit par un système à chasse fixe : pdf.js renvoie
 * fréquemment des fragments isolés, parfois lettre par lettre. Coller
 * bêtement les fragments avec un espace produirait « P e r i o d : » et
 * rendrait toute reconnaissance impossible. On se sert donc de l'écart
 * horizontal réel pour décider s'il y a un espace ou non.
 */
function itemsToLines(items, tolerance = 2.5) {
  const byPage = {};
  for (const it of items) (byPage[it.page] ??= []).push(it);

  const lines = [];
  for (const page of Object.keys(byPage).sort((a, b) => a - b)) {
    const sorted = [...byPage[page]].sort((a, b) => b.y - a.y || a.x - b.x);
    let current = null;
    for (const it of sorted) {
      if (!current || Math.abs(current.y - it.y) > tolerance) {
        current = { page: Number(page), y: it.y, fragments: [it] };
        lines.push(current);
      } else {
        current.fragments.push(it);
      }
    }
  }

  for (const line of lines) {
    line.fragments.sort((a, b) => a.x - b.x);

    // Fusion des fragments contigus en mots
    const words = [];
    let word = null;
    for (const f of line.fragments) {
      const gap = word ? f.x - (word.x + word.w) : Infinity;
      const threshold = 0.32 * (f.size || 8);
      if (word && gap < threshold) {
        word.str += f.str;
        word.w = (f.x + f.w) - word.x;
      } else {
        if (word) words.push(word);
        word = { x: f.x, y: f.y, w: f.w, size: f.size, str: f.str };
      }
    }
    if (word) words.push(word);

    for (const w of words) w.str = w.str.trim();
    line.items = words.filter(w => w.str);
    line.text = line.items.map(i => i.str).join(' ');
    line.dense = line.items.map(i => i.str).join('');
  }
  return lines;
}

/** Résumé technique du document, utile quand un import échoue. */
function describeSource(items) {
  const meta = items.meta;
  if (!meta) return '';
  const rotations = [...new Set(meta.pages.map(p => p.rotation))].join('/');
  return `${meta.pages.length} page(s), rotation ${rotations}°, ${meta.total} éléments de texte.`;
}

/* ===========================================================
   Codes d'aéroport
   =========================================================== */

const AIRPORT_COUNTRY = {
  // Allemagne
  DUS: 'DE', CGN: 'DE', FRA: 'DE', MUC: 'DE', HAM: 'DE', TXL: 'DE', BER: 'DE',
  STR: 'DE', HAJ: 'DE', NUE: 'DE', LEJ: 'DE', DRS: 'DE', BRE: 'DE', DTM: 'DE',
  FMO: 'DE', PAD: 'DE', SCN: 'DE', FDH: 'DE', GWT: 'DE', HDF: 'DE', QDU: 'DE',
  // Autriche
  VIE: 'AT', SZG: 'AT', INN: 'AT', GRZ: 'AT', LNZ: 'AT', KLU: 'AT',
  // Tchéquie et Europe centrale
  PRG: 'CZ', BRQ: 'CZ', BTS: 'SK', KSC: 'SK', BUD: 'HU', DEB: 'HU',
  WAW: 'PL', KRK: 'PL', GDN: 'PL', WRO: 'PL', POZ: 'PL', KTW: 'PL',
  // France
  CDG: 'FR', ORY: 'FR', NTE: 'FR', LYS: 'FR', MRS: 'FR', NCE: 'FR', TLS: 'FR',
  BOD: 'FR', BES: 'FR', RNS: 'FR', LIL: 'FR', SXB: 'FR', MPL: 'FR', AJA: 'FR',
  BIA: 'FR', BIQ: 'FR', PGF: 'FR', EGC: 'FR',
  // Espagne et Portugal
  PMI: 'ES', IBZ: 'ES', MAH: 'ES', BCN: 'ES', MAD: 'ES', AGP: 'ES', ALC: 'ES',
  VLC: 'ES', SVQ: 'ES', BIO: 'ES', LPA: 'ES', TFS: 'ES', TFN: 'ES', ACE: 'ES',
  FUE: 'ES', SPC: 'ES', XRY: 'ES', REU: 'ES', GRO: 'ES',
  LIS: 'PT', OPO: 'PT', FAO: 'PT', FNC: 'PT', PDL: 'PT',
  // Italie
  FCO: 'IT', MXP: 'IT', LIN: 'IT', BGY: 'IT', VCE: 'IT', NAP: 'IT', BRI: 'IT',
  CTA: 'IT', PMO: 'IT', CAG: 'IT', OLB: 'IT', BLQ: 'IT', FLR: 'IT', PSA: 'IT',
  TRN: 'IT', VRN: 'IT', AHO: 'IT', SUF: 'IT', BDS: 'IT',
  // Grèce, Croatie, Balkans
  ATH: 'GR', SKG: 'GR', HER: 'GR', RHO: 'GR', CFU: 'GR', KGS: 'GR', JMK: 'GR',
  JTR: 'GR', CHQ: 'GR', ZTH: 'GR', PVK: 'GR', KLX: 'GR', SMI: 'GR', VOL: 'GR',
  SPU: 'HR', DBV: 'HR', ZAG: 'HR', ZAD: 'HR', PUY: 'HR', RJK: 'HR',
  TIV: 'ME', TGD: 'ME', PRN: 'XK', TIA: 'AL', BEG: 'RS', INI: 'RS', SKP: 'MK',
  SJJ: 'BA', TZL: 'BA', LJU: 'SI',
  // Îles britanniques, Bénélux, Nordiques
  LHR: 'GB', LGW: 'GB', STN: 'GB', LTN: 'GB', MAN: 'GB', EDI: 'GB', GLA: 'GB',
  BHX: 'GB', BRS: 'GB', NCL: 'GB', LPL: 'GB', DUB: 'IE', ORK: 'IE',
  AMS: 'NL', EIN: 'NL', RTM: 'NL', BRU: 'BE', CRL: 'BE', ANR: 'BE', LUX: 'LU',
  CPH: 'DK', BLL: 'DK', ARN: 'SE', GOT: 'SE', OSL: 'NO', BGO: 'NO', TRD: 'NO',
  HEL: 'FI', KEF: 'IS', RIX: 'LV', TLL: 'EE', VNO: 'LT',
  // Suisse
  ZRH: 'CH', GVA: 'CH', BSL: 'CH', BRN: 'CH', LUG: 'CH',
  // Roumanie, Bulgarie, Chypre, Malte
  OTP: 'RO', CLJ: 'RO', TSR: 'RO', SBZ: 'RO', IAS: 'RO',
  SOF: 'BG', BOJ: 'BG', VAR: 'BG', LCA: 'CY', PFO: 'CY', MLA: 'MT',
  // Bassin méditerranéen et au-delà
  IST: 'TR', SAW: 'TR', AYT: 'TR', ADB: 'TR', DLM: 'TR', BJV: 'TR',
  RAK: 'MA', CMN: 'MA', AGA: 'MA', FEZ: 'MA', TNG: 'MA', NDR: 'MA',
  TUN: 'TN', DJE: 'TN', MIR: 'TN', ALG: 'DZ', ORN: 'DZ',
  HRG: 'EG', SSH: 'EG', CAI: 'EG', HBE: 'EG',
  TLV: 'IL', AMM: 'JO', AQJ: 'JO', DXB: 'AE', AUH: 'AE',
  RMF: 'EG', SID: 'CV', RAI: 'CV', BJZ: 'ES',
  EVN: 'AM', TBS: 'GE', KUT: 'GE'
};

const airportCountry = (code) => AIRPORT_COUNTRY[code] || null;

/* ===========================================================
   Roster NetLine/Crew
   =========================================================== */

const MONTHS_EN = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
                    JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

const DAY_MARKER = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*(\d{2})$/;
const HOTEL_MARKER = /^H(\d)$/;
const AIRPORT = /^[A-Z]{3}$/;

/**
 * Décode un planning individuel.
 *
 * Règle centrale : une nuit hors domicile se lit sur la ligne « Hn LIEU »,
 * jamais sur le lieu affiché en face du jour. Un roster peut indiquer la base
 * contractuelle pendant les jours de repos alors que l'équipage est rentré chez lui ;
 * l'absence de ligne hôtel est la seule preuve fiable du retour au domicile.
 */
function parseRoster(items) {
  const lines = itemsToLines(items);
  const fullText = lines.map(l => l.text).join('\n');
  // Version sans espaces : résiste aux fragments et aux espacements irréguliers
  const denseText = lines.map(l => l.dense).join('\n');

  const DATE = '(\\d{2})([A-Za-z]{3})(\\d{2})';
  const period =
       denseText.match(new RegExp(`Period:${DATE}\\D{1,4}${DATE}`))
    || fullText.match(new RegExp(`Period:\\s*${DATE}\\s*\\D{1,3}\\s*${DATE}`))
    || denseText.match(new RegExp(`Period:${DATE}`));

  if (!period) {
    const sample = fullText.slice(0, 220).replace(/\s+/g, ' ');
    throw new Error(
      `Période introuvable. ${describeSource(items)} Début du texte lu : « ${sample} »`
    );
  }

  const startMonth = MONTHS_EN[period[2].toUpperCase()];
  const startYear = 2000 + Number(period[3]);
  const firstDay = Number(period[1]);
  // Le second groupe de dates est absent si seule la date de début a été reconnue
  const endMonth = period[5] ? MONTHS_EN[period[5].toUpperCase()] : startMonth;
  const endYear = period[6] ? 2000 + Number(period[6]) : startYear;
  if (!startMonth) throw new Error(`Mois non reconnu : ${period[2]}`);

  // Repérage des jours, avec leur colonne et leur hauteur
  const markers = [];
  for (const line of lines) {
    for (const w of line.items) {
      const m = w.str.match(DAY_MARKER);
      if (m) markers.push({ page: line.page, x: w.x, y: line.y, day: Number(m[2]) });
    }
  }
  if (!markers.length) {
    throw new Error("Aucun jour détecté dans ce planning. " + describeSource(items));
  }

  // Lignes hôtel. Le planning est sur trois colonnes : une même hauteur porte
  // souvent un hébergement pour chacune d'elles, il faut donc toutes les lire.
  const hotelLines = [];
  for (const line of lines) {
    const positions = [];
    for (let i = 0; i < line.items.length; i++) {
      if (HOTEL_MARKER.test(line.items[i].str)) positions.push(i);
    }
    for (let k = 0; k < positions.length; k++) {
      const i = positions[k];
      const stop = positions[k + 1] ?? line.items.length;
      const place = line.items.slice(i + 1, stop).find(n =>
        AIRPORT.test(n.str) && n.x - line.items[i].x < 300);
      if (!place) continue;
      hotelLines.push({
        page: line.page, y: line.y, x: line.items[i].x,
        hotel: line.items[i].str, place: place.str
      });
    }
  }

  if (!hotelLines.length) {
    throw new Error(
      `Aucune ligne hôtel trouvée sur les ${markers.length} jours lus. ` +
      `Sans hébergement identifiable, les nuits ne peuvent pas être déduites. ` +
      describeSource(items)
    );
  }

  // Rattachement : chaque hôtel appartient au jour le plus proche au-dessus,
  // dans la même colonne et sur la même page.
  const nights = new Map();       // 'YYYY-MM-DD' -> code de lieu
  const orphans = [];

  for (const h of hotelLines) {
    const candidates = markers.filter(m =>
      m.page === h.page &&
      Math.abs(m.x - h.x) < 90 &&
      m.y >= h.y - 2 &&
      m.y - h.y < 130
    );
    if (!candidates.length) { orphans.push(h); continue; }
    const owner = candidates.reduce((a, b) => (a.y - h.y <= b.y - h.y ? a : b));

    // Un roster peut chevaucher deux mois : le numéro de jour tranche.
    const sameMonth = startMonth === endMonth && startYear === endYear;
    const useEnd = !sameMonth && owner.day < firstDay;
    const month = useEnd ? endMonth : startMonth;
    const year = useEnd ? endYear : startYear;
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(owner.day).padStart(2, '0')}`;
    nights.set(iso, h.place);
  }

  const unknownPlaces = [...new Set([...nights.values()].filter(p => !airportCountry(p)))];

  return {
    startMonth, startYear, endMonth, endYear,
    nights: [...nights.entries()].map(([date, place]) => ({ date, place })).sort((a, b) => a.date.localeCompare(b.date)),
    orphans: orphans.length,
    unknownPlaces,
    daysDetected: new Set(markers.map(m => m.day)).size
  };
}

/**
 * Regroupe les nuits consécutives au même endroit en un seul séjour.
 * Un séjour par nuit gonflerait artificiellement le forfait d'escale,
 * qui accorde une demi-indemnité de retour par séjour.
 */
function nightsToTrips(nights, baseAirports = []) {
  const bases = new Set(baseAirports.map(s => s.toUpperCase()));
  const trips = [];
  let cur = null;

  const flush = () => { if (cur) trips.push(cur); cur = null; };

  for (const n of nights) {
    const prev = cur && new Date(cur.lastDate + 'T12:00:00');
    const here = new Date(n.date + 'T12:00:00');
    const consecutive = prev && Math.round((here - prev) / 86400000) === 1;

    if (cur && cur.place === n.place && consecutive) {
      cur.lastDate = n.date;
      cur.nights++;
    } else {
      flush();
      cur = { place: n.place, start: n.date, lastDate: n.date, nights: 1 };
    }
  }
  flush();

  return trips.map(t => {
    // Le retour a lieu le lendemain de la dernière nuit
    const end = new Date(t.lastDate + 'T12:00:00');
    end.setDate(end.getDate() + 1);
    return {
      start: t.start,
      end: end.toISOString().slice(0, 10),
      country: airportCountry(t.place) || 'ZZ',
      place: t.place,
      nights: t.nights,
      purpose: bases.has(t.place) ? 'base' : 'rotation'
    };
  });
}

/* ===========================================================
   Récapitulatif de déclaration URSSAF
   =========================================================== */

const MICRO_RATES_FALLBACK = {
  bnc:         { cotisations: 0.256, cfp: 0.002, vfl: 0.022 },
  bic_service: { cotisations: 0.212, cfp: 0.003, vfl: 0.017 },
  bic_vente:   { cotisations: 0.123, cfp: 0.001, vfl: 0.010 }
};
const microRates = () => (typeof MICRO_RATES !== 'undefined' ? MICRO_RATES : MICRO_RATES_FALLBACK);

const MONTHS_FR = {
  JANVIER: 1, FEVRIER: 2, MARS: 3, AVRIL: 4, MAI: 5, JUIN: 6,
  JUILLET: 7, AOUT: 8, SEPTEMBRE: 9, OCTOBRE: 10, NOVEMBRE: 11, DECEMBRE: 12
};

const deaccent = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

/** « 1 234,56 € » → 1234.56 */
function parseEuroAmount(str) {
  const n = parseFloat(String(str).replace(/[\s\u00a0]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Relève les montants en euros d'une ligne, en conservant leur position. */
function moneyTokens(line) {
  const out = [];
  const items = line.items;
  for (let i = 0; i < items.length; i++) {
    const w = items[i];
    let m = w.str.match(/^(-?[\d\s\u00a0.]*\d(?:,\d+)?)\s*€$/);
    if (m) { out.push({ x: w.x, value: parseEuroAmount(m[1]) }); continue; }
    m = w.str.match(/^(-?[\d\s\u00a0.]*\d(?:,\d+)?)$/);
    if (m && items[i + 1] && /^€$/.test(items[i + 1].str)) {
      out.push({ x: w.x, value: parseEuroAmount(m[1]) });
      i++;
    }
  }
  return out;
}

/**
 * Décode un récapitulatif de déclaration en ligne.
 *
 * Le document est un tableau : les libellés de nature de chiffre d'affaires
 * tiennent sur plusieurs lignes, les montants sont alignés en colonnes.
 * La ligne « Montant totaux » sert de gabarit : elle donne l'abscisse de
 * chaque colonne, ce qui permet ensuite de lire la bonne valeur pour chaque
 * nature d'activité sans dépendre de l'ordre du texte.
 */
function parseUrssafPdf(items) {
  const lines = itemsToLines(items);
  const fullText = lines.map(l => l.text).join('\n');
  const flat = deaccent(fullText.replace(/[\s\u00a0]+/g, ' '));

  if (!/URSSAF|MICRO-SOCIAL|CHIFFRE D'AFFAIRES/.test(flat)) {
    const sample = fullText.slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(`Ce PDF ne ressemble pas à un récapitulatif URSSAF. ${describeSource(items)} Texte lu : « ${sample} »`);
  }

  // Période : « Régime micro-social simplifié - août 2026 » ou un trimestre
  let month = null, quarter = null, year = null;
  const monthMatch = flat.match(new RegExp(`(${Object.keys(MONTHS_FR).join('|')})\\s+(\\d{4})`));
  const quarterMatch = flat.match(/(\d)(?:ER|EME|E)?\s*TRIMESTRE\s+(\d{4})/);
  if (monthMatch) {
    month = MONTHS_FR[monthMatch[1]];
    year = Number(monthMatch[2]);
  } else if (quarterMatch) {
    quarter = Number(quarterMatch[1]);
    year = Number(quarterMatch[2]);
    month = quarter * 3;
  } else {
    throw new Error("Période introuvable sur ce récapitulatif URSSAF.");
  }

  const siret = (flat.match(/SIRET\s*(\d[\d\s]{12,})/) || [])[1]?.replace(/\s/g, '') || '';
  const vfl = /VERSEMENT LIBERATOIRE/.test(flat) && !/N'AVEZ PAS OPTE/.test(flat);

  // Gabarit de colonnes, donné par la ligne de totaux
  const totalsLine = lines.find(l => /Montant\s+totaux/i.test(l.text));
  if (!totalsLine) throw new Error("Ligne « Montant totaux » introuvable sur ce récapitulatif.");
  const totals = moneyTokens(totalsLine);
  if (totals.length < 1) throw new Error("Aucun montant lisible sur la ligne de totaux.");

  const caColumnX = totals[0].x;
  const pick = (n) => totals[n]?.value ?? 0;

  // Nature du chiffre d'affaires : chaque libellé ouvre un bloc jusqu'au suivant
  const NATURES = [
    { key: 'bnc',        test: /ACTIVITES LIBERALES/ },
    { key: 'bicVente',   test: /VENTES DE MARCHANDISES/ },
    { key: 'bicService', test: /PRESTATIONS DE SERVICES/ }
  ];

  const anchors = [];
  lines.forEach((l, i) => {
    const t = deaccent(l.text);
    for (const n of NATURES) {
      if (n.test.test(t) && !anchors.some(a => a.key === n.key)) {
        anchors.push({ key: n.key, index: i });
      }
    }
  });
  anchors.sort((a, b) => a.index - b.index);

  const amounts = { bnc: 0, bicVente: 0, bicService: 0 };
  for (let a = 0; a < anchors.length; a++) {
    const from = anchors[a].index;
    const to = anchors[a + 1]?.index ?? Math.min(lines.length, from + 8);
    let best = null;
    for (let i = from; i < to; i++) {
      for (const tok of moneyTokens(lines[i])) {
        const d = Math.abs(tok.x - caColumnX);
        if (d < 60 && (!best || d < best.d)) best = { d, value: tok.value };
      }
    }
    if (best) amounts[anchors[a].key] = best.value;
  }

  const result = {
    month: `${year}-${String(month).padStart(2, '0')}`,
    year,
    quarter,
    siret,
    vfl,
    bnc: amounts.bnc,
    bicVente: amounts.bicVente,
    bicService: amounts.bicService,
    totalCa: pick(0),
    totalDue: pick(1),
    cotisations: pick(2),
    cfp: pick(3),
    vflAmount: pick(4)
  };

  // Contrôles : la ventilation doit reconstituer le total, et les
  // prélèvements doivent correspondre aux taux du régime.
  const ventilated = result.bnc + result.bicVente + result.bicService;
  const expectedDue = result.cotisations + result.cfp + result.vflAmount;

  const rate = (ca, r) => ca > 0 ? r : 0;
  const theoretical = ['bnc', 'bicVente', 'bicService'].reduce((acc, k) => {
    const map = { bnc: 'bnc', bicVente: 'bic_vente', bicService: 'bic_service' };
    const r = microRates()[map[k]];
    const ca = result[k];
    if (!r || !ca) return acc;
    acc.cotisations += ca * rate(ca, r.cotisations);
    acc.cfp += ca * rate(ca, r.cfp);
    acc.vfl += result.vfl ? ca * rate(ca, r.vfl) : 0;
    return acc;
  }, { cotisations: 0, cfp: 0, vfl: 0 });

  result.check = {
    ventilated,
    ventilationOk: Math.abs(ventilated - result.totalCa) <= 1,
    dueOk: result.totalDue === 0 || Math.abs(expectedDue - result.totalDue) <= 1,
    theoretical,
    ratesOk: Math.abs(theoretical.cotisations - result.cotisations) <= 2
             && Math.abs(theoretical.vfl - result.vflAmount) <= 2
  };

  if (result.totalCa === 0 && ventilated === 0) {
    throw new Error("Aucun chiffre d'affaires détecté sur ce récapitulatif.");
  }
  return result;
}


const MONTHS_LONG = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12
};

/** Convertit « 109.103,00 » en 109103. */
function parseCzAmount(str) {
  if (!str) return 0;
  const n = parseFloat(String(str).replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

const AMOUNT_AT_END = /(-?[\d.]+,\d{2})\s*\|?\s*$/;

/**
 * Additionne toutes les occurrences d'un code, quelle que soit leur période.
 * C'est le point délicat de ces bulletins : les paiements différés sont
 * rattachés à leur mois d'origine et apparaissent sur plusieurs lignes.
 */
function sumCode(lines, matcher) {
  let total = 0;
  const found = [];
  for (const text of lines) {
    if (!matcher.test(text)) continue;
    const m = text.match(AMOUNT_AT_END);
    if (!m) continue;
    const v = parseCzAmount(m[1]);
    total += v;
    found.push({ text: text.trim(), value: v });
  }
  return { total, found };
}

function parsePayslipPdf(items) {
  const parsedLines = itemsToLines(items);
  const lines = parsedLines.map(l => l.text);
  const fullText = lines.join('\n');
  const denseText = parsedLines.map(l => l.dense).join('\n');

  const monthMatch = fullText.match(/Month:\s*([A-Za-z]+)\s+(\d{4})/i)
                  || denseText.match(/Month:([A-Za-z]+)(\d{4})/i);
  if (!monthMatch) {
    const sample = fullText.slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(`Mois introuvable. ${describeSource(items)} Début du texte lu : « ${sample} »`);
  }
  const month = MONTHS_LONG[monthMatch[1].toUpperCase()];
  const year = Number(monthMatch[2]);
  if (!month) throw new Error(`Mois non reconnu : ${monthMatch[1]}`);

  const totalCurMatch = fullText.match(/Total payment\s+([A-Z]{3})\s*:\s*([\d.]+,\d{2})/)
                     || denseText.match(/Totalpayment([A-Z]{3}):([\d.]+,\d{2})/);
  const totalEurMatch = fullText.match(/Total payment\s+EUR\s*:\s*([\d.]+,\d{2})/)
                     || denseText.match(/TotalpaymentEUR:([\d.]+,\d{2})/);

  const currency = totalCurMatch?.[1] || 'CZK';
  const totalCur = parseCzAmount(totalCurMatch?.[2]);
  const totalEur = parseCzAmount(totalEurMatch?.[1]);

  const base      = sumCode(lines, /\/106\s+Eval\.base tax/i);
  const hi        = sumCode(lines, /\/350\s+HI part EE/i);
  const si        = sumCode(lines, /\/360\s+SI part EE/i);
  const allowance = sumCode(lines, /202F\s+Travel tax free/i);
  const tax       = sumCode(lines, /\/401\s+Tax advance/i);
  const transfer  = sumCode(lines, /\/559\s+Bank\s+TRANSFER/i);

  const employerMatch = fullText.match(/(Eurowings[^|\n]*?)\s+Month:/i);

  const result = {
    month: `${year}-${String(month).padStart(2, '0')}`,
    year,
    employer: (employerMatch?.[1] || 'Eurowings Europe Ltd.').trim(),
    currency,
    totalCur,
    totalEur,
    rate: totalCur > 0 && totalEur > 0 ? totalEur / totalCur : null,
    taxableBase: base.total,
    social: hi.total + si.total,
    allowance: allowance.total,
    taxPaid: tax.total,
    net: transfer.total,
    detail: {
      base: base.found, hi: hi.found, si: si.found,
      allowance: allowance.found, tax: tax.found
    }
  };

  // Contrôle immédiat : la somme doit retomber sur le virement
  const expected = result.taxableBase - result.social - result.taxPaid + result.allowance;
  result.check = {
    expected,
    actual: result.net,
    diff: expected - result.net,
    ok: result.net > 0 && Math.abs(expected - result.net) <= 2
  };

  if (result.taxableBase <= 0) {
    throw new Error("Aucune ligne /106 trouvée. Le bulletin est peut-être dans un format différent.");
  }
  return result;
}
