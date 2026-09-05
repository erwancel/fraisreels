/* ===========================================================
   store.js — données, référentiels et calculs
   Tout est local : IndexedDB. Aucune donnée ne sort de l'appareil.
   =========================================================== */

const DB_NAME = 'frais-reels';
const DB_VERSION = 2;
const STORES = ['expenses', 'receipts', 'trips', 'payslips', 'revenues', 'urssaf', 'settings'];

/* ---------- Référentiels ---------- */

// Postes de dépense adaptés au personnel navigant.
// « courrier » marque les frais couverts par le barème forfaitaire de découchés :
// quand le barème est activé, ces postes sont remplacés par le calcul par nuitée.
const CATEGORIES = [
  { id: 'repas',      label: 'Repas',              courrier: true,  hint: 'Repas hors domicile pendant le service' },
  { id: 'hotel',      label: 'Hébergement',        courrier: true,  hint: 'Hôtel non pris en charge, découché' },
  { id: 'escale',     label: 'Transports en escale', courrier: true, hint: 'Navette, taxi, transport local en rotation' },
  { id: 'residence',  label: 'Double résidence',   hint: 'Loyer, charges, énergie, assurance du logement en base' },
  { id: 'trajet',     label: 'Trajet domicile-base', hint: 'Billets, carburant, péage, parking, train' },
  { id: 'uniforme',   label: 'Uniforme',           hint: 'Achat, remplacement, pressing, chaussures' },
  { id: 'materiel',   label: 'Matériel de vol',    hint: 'Tablette, casque, lampe, valise, accessoires' },
  { id: 'doc',        label: 'Documentation',      hint: 'Cartes, abonnements, logiciels, revues' },
  { id: 'licence',    label: 'Licence et médical', hint: 'Visite médicale, renouvellement de licence' },
  { id: 'formation',  label: 'Formation',          hint: 'Qualification, anglais, simulateur, stages' },
  { id: 'cotisation', label: 'Cotisations',        hint: 'Syndicat, associations professionnelles' },
  { id: 'telecom',    label: 'Télécom et bureau',  hint: 'Part professionnelle du téléphone et d\'internet' },
  { id: 'bancaire',   label: 'Frais bancaires',    hint: 'Change, commissions à l\'étranger' },
  { id: 'autre',      label: 'Autre',              hint: '' }
];

const COURRIER_IDS = CATEGORIES.filter(c => c.courrier).map(c => c.id);

const CAT_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

// Pays fréquents en premier, puis le reste par ordre alphabétique.
const COUNTRIES = [
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Allemagne' },
  { code: 'ES', name: 'Espagne' },
  { code: 'IT', name: 'Italie' },
  { code: 'PT', name: 'Portugal' },
  { code: 'GB', name: 'Royaume-Uni' },
  { code: 'CH', name: 'Suisse' },
  { code: 'AT', name: 'Autriche' },
  { code: 'BE', name: 'Belgique' },
  { code: 'NL', name: 'Pays-Bas' },
  { code: 'GR', name: 'Grèce' },
  { code: 'HR', name: 'Croatie' },
  { code: 'PL', name: 'Pologne' },
  { code: 'CZ', name: 'Tchéquie' },
  { code: 'DK', name: 'Danemark' },
  { code: 'SE', name: 'Suède' },
  { code: 'NO', name: 'Norvège' },
  { code: 'IE', name: 'Irlande' },
  { code: 'MA', name: 'Maroc' },
  { code: 'TN', name: 'Tunisie' },
  { code: 'TR', name: 'Turquie' },
  { code: 'EG', name: 'Égypte' },
  { code: 'CV', name: 'Cap-Vert' },
  { code: 'HU', name: 'Hongrie' },
  { code: 'RO', name: 'Roumanie' },
  { code: 'BG', name: 'Bulgarie' },
  { code: 'CY', name: 'Chypre' },
  { code: 'MT', name: 'Malte' },
  { code: 'IS', name: 'Islande' },
  { code: 'FI', name: 'Finlande' },
  { code: 'AL', name: 'Albanie' },
  { code: 'ME', name: 'Monténégro' },
  { code: 'XK', name: 'Kosovo' },
  { code: 'RS', name: 'Serbie' },
  { code: 'MK', name: 'Macédoine du Nord' },
  { code: 'AM', name: 'Arménie' },
  { code: 'GE', name: 'Géorgie' },
  { code: 'IL', name: 'Israël' },
  { code: 'JO', name: 'Jordanie' },
  { code: 'AE', name: 'Émirats arabes unis' },
  { code: 'US', name: 'États-Unis' },
  { code: 'CA', name: 'Canada' },
  { code: 'ZZ', name: 'Autre' }
];

const COUNTRY_BY_CODE = Object.fromEntries(COUNTRIES.map(c => [c.code, c.name]));

const CURRENCIES = ['EUR', 'CHF', 'GBP', 'USD', 'PLN', 'CZK', 'DKK', 'SEK', 'NOK', 'HUF', 'RON', 'TRY', 'MAD', 'AED'];

const REGIMES = {
  bic_vente:   { label: 'Vente de marchandises',  abattement: 0.71, box: '5KO', boxVfl: '5TA' },
  bic_service: { label: 'Prestations de services (BIC)', abattement: 0.50, box: '5KP', boxVfl: '5TB' },
  bnc:         { label: 'Prestations libérales (BNC)',   abattement: 0.34, box: '5HQ', boxVfl: '5TE' }
};

// Taux du régime micro-social, relevés sur les récapitulatifs URSSAF.
// Ils évoluent : ils servent au recoupement, jamais au calcul de ce qui est dû.
const MICRO_RATES = {
  bnc:         { cotisations: 0.256, cfp: 0.002, vfl: 0.022 },
  bic_service: { cotisations: 0.212, cfp: 0.003, vfl: 0.017 },
  bic_vente:   { cotisations: 0.123, cfp: 0.001, vfl: 0.010 }
};

const PURPOSES = {
  domicile:  'Au domicile',
  rotation:  'Rotation / découché',
  base:      'Présence en base',
  formation: 'Formation / simulateur',
  convoyage: 'Convoyage véhicule',
  mission:   'Mission Air One Aero',
  autre:     'Autre'
};

// Plancher et plafond de l'abattement de 10 %, par année de revenus.
// À revérifier chaque année : ces bornes sont réévaluées par l'administration.
const ABATEMENT_DEFAULTS = {
  2024: { min: 504, max: 14426 },
  2025: { min: 509, max: 14555 },
  2026: { min: 509, max: 14555 }   // provisoire, à mettre à jour
};

/* ---------- Estimation de l'impôt sur le revenu ---------- */

/* Un barème vaut pour une année de revenus précise et n'est voté qu'à la fin
   de celle-ci. Les paramètres sont donc historisés : consulter une année passée
   doit continuer d'utiliser le barème qui lui était applicable. */
const TAX_SCALES = {
  2024: {
    brackets: [
      { upTo: 11497,  rate: 0 },
      { upTo: 29315,  rate: 0.11 },
      { upTo: 83823,  rate: 0.30 },
      { upTo: 180294, rate: 0.41 },
      { upTo: null,   rate: 0.45 }
    ],
    decote: { single: 889, joint: 1470, rate: 0.4525, capSingle: 1964, capJoint: 3248 }
  },
  2025: {
    brackets: [
      { upTo: 11600,  rate: 0 },
      { upTo: 29579,  rate: 0.11 },
      { upTo: 84577,  rate: 0.30 },
      { upTo: 181917, rate: 0.41 },
      { upTo: null,   rate: 0.45 }
    ],
    decote: { single: 897, joint: 1483, rate: 0.4525, capSingle: 1982, capJoint: 3277 }
  }
};

const TAX_DEFAULTS = {
  parts: 1,
  joint: false,
  otherIncome: 0,        // autres revenus nets imposables, déjà abattus
  withheld: 0,           // prélèvement à la source ou acomptes déjà versés
  years: {}              // surcharges par année de revenus
};

/** Année dont le barème s'applique, avec repli sur la plus proche connue. */
function scaleYearFor(year) {
  const custom = settings.tax?.years?.[year];
  if (custom?.brackets?.length) return year;
  if (TAX_SCALES[year]) return year;

  const known = Object.keys(TAX_SCALES).map(Number);
  const earlier = known.filter(y => y <= year);
  // Après la dernière année connue, on prolonge la plus récente ;
  // avant la première, on remonte à la plus ancienne.
  return earlier.length ? Math.max(...earlier) : Math.min(...known);
}

/** Paramètres applicables à une année : surcharge manuelle, sinon barème officiel. */
function taxParams(year) {
  const base = settings.tax || TAX_DEFAULTS;
  const custom = base.years?.[year] || {};
  const source = scaleYearFor(year);
  const scale = TAX_SCALES[source] || TAX_SCALES[Math.max(...Object.keys(TAX_SCALES).map(Number))];

  return {
    parts:       custom.parts       ?? base.parts       ?? 1,
    joint:       custom.joint       ?? base.joint       ?? false,
    otherIncome: custom.otherIncome ?? base.otherIncome ?? 0,
    withheld:    custom.withheld    ?? base.withheld    ?? 0,
    brackets:    custom.brackets?.length ? custom.brackets : scale.brackets,
    decote:      { ...scale.decote, ...(custom.decote || {}) },
    scaleYear:   custom.brackets?.length ? year : source,
    // Vrai lorsque aucun barème propre à l'année n'existe encore
    provisional: !custom.brackets?.length && source !== year
  };
}

/** Impôt brut sur un revenu par part, avant quotient. */
function applyBrackets(perPart, brackets) {
  let tax = 0, floor = 0;
  for (const b of brackets) {
    const ceiling = b.upTo ?? Infinity;
    if (perPart > floor) tax += (Math.min(perPart, ceiling) - floor) * b.rate;
    floor = ceiling;
    if (perPart <= floor) break;
  }
  return tax;
}

/**
 * Estimation de l'impôt dû.
 *
 * Le versement libératoire sort le chiffre d'affaires du barème mais il reste
 * retenu pour déterminer le taux applicable aux autres revenus : on calcule
 * l'impôt sur l'ensemble, puis on ne garde que la fraction correspondant aux
 * revenus réellement soumis au barème.
 */
function estimateTax(d) {
  const t = taxParams(d.year);
  const parts = Math.max(1, Number(t.parts) || 1);

  // Salaires : la déduction la plus favorable l'emporte
  const useReal = d.deductible > d.abatement;
  const salaryDeduction = Math.max(d.abatement, d.deductible);
  const netSalary = Math.max(0, d.declaredSalary - salaryDeduction);

  const other = Number(t.otherIncome) || 0;

  // Micro-entreprise : hors barème avec le versement libératoire,
  // mais toujours pris en compte pour le taux effectif
  const microAtScale = settings.vfl ? 0 : d.netMicro;
  const microForRate = d.netMicro;

  const scaleBase = netSalary + other + microAtScale;
  const totalBase = netSalary + other + microForRate;

  const grossOnTotal = applyBrackets(totalBase / parts, t.brackets) * parts;
  const effectiveShare = totalBase > 0 ? scaleBase / totalBase : 0;
  const grossTax = grossOnTotal * effectiveShare;

  // Décote
  const dec = t.decote;
  const cap = t.joint ? dec.capJoint : dec.capSingle;
  const forfait = t.joint ? dec.joint : dec.single;
  const decote = grossTax > 0 && grossTax < cap
    ? Math.max(0, Math.min(grossTax, forfait - dec.rate * grossTax))
    : 0;

  const afterDecote = Math.max(0, grossTax - decote);

  // Crédit d'impôt étranger, plafonné à l'impôt français correspondant
  const foreignCredit = Math.min(d.foreignTax, afterDecote);
  const netTax = Math.max(0, afterDecote - foreignCredit);

  const withheld = Number(t.withheld) || 0;
  const balance = netTax - withheld;

  // Taux marginal atteint
  const perPart = totalBase / parts;
  let marginal = 0;
  for (const b of t.brackets) {
    if (perPart > (b.upTo ?? Infinity)) continue;
    marginal = b.rate;
    break;
  }
  if (perPart > (t.brackets.at(-2)?.upTo ?? Infinity)) marginal = t.brackets.at(-1).rate;

  return {
    parts, useReal, salaryDeduction, netSalary, other,
    microAtScale, microForRate, vfl: !!settings.vfl,
    scaleBase, totalBase, effectiveShare,
    grossOnTotal, grossTax, decote, afterDecote,
    foreignCredit, netTax, withheld, balance,
    marginal,
    averageRate: totalBase > 0 ? (netTax / totalBase) * 100 : 0,
    vflPaid: d.vflPaid || 0,
    scaleYear: t.scaleYear,
    provisional: t.provisional,
    brackets: t.brackets
  };
}

/* ---------- Ouverture de la base ---------- */

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('expenses')) {
        const s = db.createObjectStore('expenses', { keyPath: 'id' });
        s.createIndex('year', 'year');
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('receipts')) {
        const s = db.createObjectStore('receipts', { keyPath: 'id' });
        s.createIndex('ownerId', 'ownerId');
      }
      if (!db.objectStoreNames.contains('trips')) {
        const s = db.createObjectStore('trips', { keyPath: 'id' });
        s.createIndex('year', 'year');
      }
      if (!db.objectStoreNames.contains('payslips')) {
        const s = db.createObjectStore('payslips', { keyPath: 'id' });
        s.createIndex('year', 'year');
      }
      if (!db.objectStoreNames.contains('revenues')) {
        const s = db.createObjectStore('revenues', { keyPath: 'id' });
        s.createIndex('year', 'year');
      }
      if (!db.objectStoreNames.contains('urssaf')) {
        const s = db.createObjectStore('urssaf', { keyPath: 'id' });
        s.createIndex('year', 'year');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = 'readonly') {
  return openDB().then(db => db.transaction(store, mode).objectStore(store));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ---------- CRUD générique ---------- */

const db = {
  async put(store, obj) {
    const s = await tx(store, 'readwrite');
    await wrap(s.put(obj));
    return obj;
  },
  async get(store, id) {
    const s = await tx(store);
    return wrap(s.get(id));
  },
  async all(store) {
    const s = await tx(store);
    return wrap(s.getAll());
  },
  async byYear(store, year) {
    const s = await tx(store);
    return wrap(s.index('year').getAll(year));
  },
  async byOwner(store, ownerId) {
    const s = await tx(store);
    return wrap(s.index('ownerId').getAll(ownerId));
  },
  async remove(store, id) {
    const s = await tx(store, 'readwrite');
    return wrap(s.delete(id));
  },
  async clear(store) {
    const s = await tx(store, 'readwrite');
    return wrap(s.clear());
  },
  async wipeAll() {
    for (const s of STORES) await db.clear(s);
  }
};

/* ---------- Réglages ---------- */

const SETTINGS_DEFAULTS = {
  name: '',
  home: '',
  base: '',
  baseAirports: '',
  vfl: false,
  theme: 'auto',
  lastView: 'board',      // vue à rouvrir au démarrage
  rates: { CHF: 1.06, GBP: 1.17, USD: 0.92, PLN: 0.23, CZK: 0.0413, DKK: 0.134,
           SEK: 0.088, NOK: 0.086, HUF: 0.0026, RON: 0.20, TRY: 0.028, MAD: 0.093, AED: 0.25 },
  abatement: {},          // { 2026: {min,max} } — surcharge manuelle
  tax: null,              // paramètres d'estimation, complétés au chargement
  lastBackup: null,

  /* Frais en courrier — indemnités journalières d'escale.
     Base : lettre DLF n°99002172 du 15 février 1999, renvoyant au barème du groupe II
     des indemnités journalières de mission à l'étranger.
     Les taux ci-dessous sont des ordres de grandeur relevés dans la documentation
     syndicale, à remplacer par le document officiel de l'année déclarée. */
  courrier: {
    enabled: false,
    method: 'brute',      // 'brute' : per diem réintégré en 1AJ, forfait entier en 1AK
                          // 'nette' : 1AK = forfait moins per diem reçu
    halfReturn: true,     // demi-indemnité le jour du retour en base
    // Une indemnité journalière de mission à l'étranger se ventile en 65 % pour
    // l'hébergement et 35 % pour la restauration (deux repas à 17,5 %).
    // Arrêté du 3 juillet 2006, article 3 : logé gratuitement, le taux est
    // réduit de 65 %. Il reste donc la part repas, soit 35 %.
    lodgedRate: 35,       // part retenue quand l'hôtel est payé par la compagnie
    rates: {
      DEFAUT: 174,        // zone euro et Schengen, moyen-courrier
      GB: 207, CH: 248, NO: 222, SE: 196, DK: 228,
      TR: 128, MA: 150, TN: 120, IL: 228, EG: 162,
      US: 301, CA: 222
    }
  }
};

let settings = { ...SETTINGS_DEFAULTS };

async function loadSettings() {
  const rows = await db.all('settings');
  const stored = Object.fromEntries(rows.map(r => [r.key, r.value]));
  settings = { ...SETTINGS_DEFAULTS, ...stored };
  settings.rates = { ...SETTINGS_DEFAULTS.rates, ...(stored.rates || {}) };
  settings.abatement = { ...(stored.abatement || {}) };
  settings.tax = {
    ...TAX_DEFAULTS,
    ...(stored.tax || {}),
    years: { ...(stored.tax?.years || {}) }
  };
  settings.courrier = {
    ...SETTINGS_DEFAULTS.courrier,
    ...(stored.courrier || {}),
    rates: { ...SETTINGS_DEFAULTS.courrier.rates, ...(stored.courrier?.rates || {}) }
  };
  return settings;
}

async function saveSetting(key, value) {
  settings[key] = value;
  await db.put('settings', { key, value });
}

function abatementBounds(year) {
  return settings.abatement[year]
      || ABATEMENT_DEFAULTS[year]
      || ABATEMENT_DEFAULTS[Math.max(...Object.keys(ABATEMENT_DEFAULTS).map(Number))];
}

/* ---------- Utilitaires ---------- */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const yearOf = (isoDate) => Number(String(isoDate).slice(0, 4));

/** Accepte « 12,50 », « 12.50 », « 1 234,56 », « 12,50 € ». */
function parseAmount(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  const cleaned = String(str)
    .replace(/[^\d.,-]/g, '')
    .replace(/\s/g, '')
    .replace(/,/g, '.');
  const parts = cleaned.split('.');
  const normalized = parts.length > 2
    ? parts.slice(0, -1).join('') + '.' + parts.at(-1)
    : cleaned;
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

const eur = (n) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2
}).format(n || 0);

const eur0 = (n) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0
}).format(n || 0);

const num = (n, d = 2) => new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: d, maximumFractionDigits: d
}).format(n || 0);

function toEur(amount, currency) {
  if (!currency || currency === 'EUR') return amount;
  const rate = settings.rates[currency];
  return rate ? amount * rate : amount;
}

/** Montant réellement déductible : conversion, quote-part, exclusion des remboursements. */
function deductibleAmount(expense) {
  if (expense.attach !== 'salaire') return 0;
  if (expense.reimbursed) return 0;
  const base = toEur(expense.amount, expense.currency);
  return base * ((expense.share ?? 100) / 100);
}

/* ---------- Compression des justificatifs ---------- */

/**
 * Réduit une photo à 1600 px de côté maximum en JPEG.
 * Un ticket de caisse pèse alors ~150 Ko au lieu de 3 Mo.
 * Les PDF passent tels quels.
 */
async function prepareFile(file) {
  if (file.type === 'application/pdf' || !file.type.startsWith('image/')) {
    return { blob: file, mime: file.type || 'application/octet-stream', name: file.name };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.78));
    if (!blob) throw new Error('encodage impossible');
    return { blob, mime: 'image/jpeg', name: (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg' };
  } catch {
    return { blob: file, mime: file.type, name: file.name };
  }
}

async function addReceipt(file, ownerId) {
  const { blob, mime, name } = await prepareFile(file);
  const rec = { id: uid(), ownerId, blob, mime, name, size: blob.size, createdAt: Date.now() };
  await db.put('receipts', rec);
  return rec;
}

/* ---------- Bulletins de paie en devise étrangère ---------- */

/**
 * Un bulletin étranger se convertit avec le taux du bulletin lui-même
 * (total versé en devise ÷ total versé en euros), ce qui est plus défendable
 * qu'un taux générique puisque le document en porte la trace.
 *
 * La base retenue pour la déclaration française est estimée à
 * base imposable locale − cotisations sociales obligatoires du salarié.
 * C'est une estimation : le traitement exact dépend de la convention applicable.
 */
function payslipRate(p) {
  if (p.rate && p.rate > 0) return p.rate;
  if (!p.currency || p.currency === 'EUR') return 1;
  return settings.rates[p.currency] || 1;
}

function payslipEur(p) {
  // Compatibilité avec l'ancien format (champ « taxable » seul)
  const base   = p.taxableBase ?? p.taxable ?? 0;
  const social = p.social ?? 0;
  const rate = payslipRate(p);
  return {
    rate,
    taxableBase: base * rate,
    social:      social * rate,
    allowance:   (p.allowance || 0) * rate,
    taxPaid:     (p.taxPaid ?? p.withheld ?? 0) * rate,
    frenchBase:  Math.max(0, base - social) * rate
  };
}

/**
 * Contrôle de saisie : sur ces bulletins, le virement doit toujours valoir
 * base imposable − cotisations − impôt + per diem non imposable.
 * Un écart signale une ligne oubliée, le plus souvent une régularisation
 * de cotisations rattachée à un mois antérieur.
 */
function payslipBalance(p) {
  const base   = p.taxableBase ?? p.taxable ?? 0;
  const social = p.social ?? 0;
  const tax    = p.taxPaid ?? p.withheld ?? 0;
  const perdiem = p.allowance || 0;
  const actual = p.net || 0;
  const expected = base - social - tax + perdiem;
  const diff = expected - actual;
  return {
    expected, actual, diff,
    checked: actual > 0,
    ok: actual > 0 && Math.abs(diff) <= 2
  };
}

/* ---------- Frais en courrier ---------- */

// Motifs qui n'ouvrent pas droit à indemnité d'escale : la présence en base
// d'affectation relève de la double résidence, les missions Air One Aero
// ne sont pas du salariat.
const NO_ALLOWANCE_PURPOSES = new Set(['base', 'mission', 'domicile']);

function courrierRate(country) {
  const r = settings.courrier.rates;
  return r[country] ?? r.DEFAUT ?? 0;
}

/**
 * Indemnité d'un séjour : une nuit d'escale = une indemnité pleine, plus une demie au retour.
 *
 * Le barème couvre à la fois les repas et l'hébergement. Quand l'hôtel est réservé
 * et réglé par la compagnie, la part logement n'est pas une dépense supportée :
 * la déduire intégralement serait indéfendable. Le taux appliqué dans ce cas
 * se règle dans les paramètres.
 */
function tripAllowance(trip) {
  const c = settings.courrier;
  if (!c.enabled) return { eligible: false, nights: 0, rate: 0, units: 0, amount: 0, lodged: false };
  if (NO_ALLOWANCE_PURPOSES.has(trip.purpose)) {
    return { eligible: false, nights: trip.nights ?? 0, rate: 0, units: 0, amount: 0, lodged: false };
  }
  const nights = trip.nights ?? 0;
  if (nights <= 0) return { eligible: true, nights: 0, rate: 0, units: 0, amount: 0, lodged: false };

  const full = courrierRate(trip.country);
  const lodged = !!trip.lodged;
  const share = lodged ? Math.max(0, Math.min(100, c.lodgedRate ?? 100)) / 100 : 1;
  const rate = full * share;

  // La demi-indemnité de retour ne se justifie qu'au terme d'une rotation,
  // c'est-à-dire au retour vers la base contractuelle. Un enchaînement
  // d'escales n'en ouvre qu'une seule, à la fin.
  const half = c.halfReturn && trip.endsAtBase !== false;
  const units = nights + (half ? 0.5 : 0);

  return { eligible: true, nights, rate, fullRate: full, lodged, half, units, amount: units * rate };
}

function courrierTotals(trips) {
  let gross = 0, nights = 0, counted = 0, lodgedNights = 0, forgone = 0;
  const byCountry = {};
  for (const t of trips) {
    const a = tripAllowance(t);
    if (!a.eligible || !a.nights) continue;
    if (a.lodged) {
      lodgedNights += a.nights;
      forgone += a.units * ((a.fullRate || 0) - a.rate);
    }
    if (!a.amount) continue;
    gross += a.amount;
    nights += a.nights;
    counted++;
    byCountry[t.country] = (byCountry[t.country] || 0) + a.amount;
  }
  const rows = Object.entries(byCountry)
    .map(([code, total]) => ({ code, name: COUNTRY_BY_CODE[code] || code, rate: courrierRate(code), total }))
    .sort((a, b) => b.total - a.total);
  return { gross, nights, counted, lodgedNights, forgone, rows };
}

/* ---------- Calculs annuels ---------- */

/** Jours de présence et nuitées par pays, à partir des séjours. */
function countryTally(trips) {
  const byCountry = {};      // code -> Set de dates
  const nights = {};
  const allDays = new Set();
  const homeDays = new Set();

  for (const t of trips) {
    const start = new Date(t.start + 'T12:00:00');
    const end = new Date((t.end || t.start) + 'T12:00:00');
    if (isNaN(start) || isNaN(end) || end < start) continue;

    const atHome = t.purpose === 'domicile';
    byCountry[t.country] ??= new Set();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      byCountry[t.country].add(key);
      allDays.add(key);
      if (atHome) homeDays.add(key);
    }
    if (atHome) continue;
    const auto = Math.max(0, Math.round((end - start) / 86400000));
    nights[t.country] = (nights[t.country] || 0) + (t.nights ?? auto);
  }

  const rows = Object.entries(byCountry).map(([code, days]) => ({
    code,
    name: COUNTRY_BY_CODE[code] || code,
    days: days.size,
    nights: nights[code] || 0
  })).sort((a, b) => b.days - a.days);

  const totalDays = allDays.size;
  const home = homeDays.size;

  return {
    rows,
    totalDays,                    // toutes les journées enregistrées
    homeDays: home,               // journées passées au domicile
    awayDays: totalDays - home,   // journées en déplacement
    totalNights: Object.values(nights).reduce((a, b) => a + b, 0)
  };
}

/** Consolidation complète d'une année. */
async function computeYear(year) {
  const [expenses, trips, payslips, revenues, declarations] = await Promise.all([
    db.byYear('expenses', year),
    db.byYear('trips', year),
    db.byYear('payslips', year),
    db.byYear('revenues', year),
    db.byYear('urssaf', year)
  ]);

  // Frais réels sur justificatifs.
  // Quand le forfait d'escale est actif, il couvre déjà les repas et l'hébergement
  // en courrier : ces postes sont écartés pour éviter une double déduction.
  const courrierOn = settings.courrier.enabled;
  const COVERED = new Set(['repas', 'hotel', 'escale']);

  let deductible = 0, reimbursed = 0, aoaSpend = 0, missingProof = 0, supersededByForfait = 0;
  const byCategory = {};

  for (const e of expenses) {
    const d = deductibleAmount(e);
    if (e.attach === 'aoa') {
      aoaSpend += toEur(e.amount, e.currency);
    } else if (e.reimbursed) {
      reimbursed += toEur(e.amount, e.currency);
    } else if (courrierOn && COVERED.has(e.category)) {
      supersededByForfait += d;
    } else {
      deductible += d;
      byCategory[e.category] = (byCategory[e.category] || 0) + d;
      if (!e.receiptIds?.length) missingProof++;
    }
  }

  const categories = Object.entries(byCategory)
    .map(([id, total]) => ({ id, label: CAT_BY_ID[id]?.label || id, total }))
    .sort((a, b) => b.total - a.total);

  // Salaire — tout est ramené en euros au taux de chaque bulletin
  const slipTotals = payslips.reduce((acc, p) => {
    const e = payslipEur(p);
    acc.frenchBase  += e.frenchBase;
    acc.taxableBase += e.taxableBase;
    acc.social      += e.social;
    acc.allowance   += e.allowance;
    // Un impôt prélevé à tort n'ouvre pas droit à crédit d'impôt : il sera remboursé.
    if (p.taxDisputed) acc.taxToRecover += e.taxPaid;
    else acc.taxPaid += e.taxPaid;
    return acc;
  }, { frenchBase: 0, taxableBase: 0, social: 0, allowance: 0, taxPaid: 0, taxToRecover: 0 });

  const taxableSalary = slipTotals.frenchBase;
  const allowances    = slipTotals.allowance;
  const grossSalary   = slipTotals.taxableBase;
  const socialPaid    = slipTotals.social;
  const foreignTax    = slipTotals.taxPaid;
  const taxToRecover  = slipTotals.taxToRecover;
  const foreignSalary = payslips.filter(p => p.source && p.source !== 'FR')
                                .reduce((s, p) => s + payslipEur(p).frenchBase, 0);

  const unbalanced = payslips.filter(p => {
    const b = payslipBalance(p);
    return b.checked && !b.ok;
  }).length;

  // Frais en courrier : forfait d'escale, minoré ou compensé par le per diem reçu
  const courrier = courrierTotals(trips);
  const courrierNet = courrierOn ? Math.max(0, courrier.gross - allowances) : 0;

  // Méthode « brute » : le per diem est réintégré au salaire déclaré et le forfait
  // se déduit en entier. Méthode « nette » : on ne déclare que le solde.
  // Les deux aboutissent au même revenu net, seule la présentation change.
  const method = settings.courrier.method || 'brute';
  const useBrute = courrierOn && method === 'brute';
  const declaredSalary = useBrute ? taxableSalary + allowances : taxableSalary;
  const courrierDeduction = courrierOn ? (useBrute ? courrier.gross : courrierNet) : 0;

  // Quand la compagnie verse plus que le barème ne permet de déduire, opter pour
  // le forfait coûte plus qu'il ne rapporte : la réintégration dépasse la déduction.
  const courrierUnfavourable = courrierOn && courrier.gross > 0 && allowances > courrier.gross;
  const courrierLoss = courrierUnfavourable ? allowances - courrier.gross : 0;

  const totalDeductible = deductible + courrierDeduction;

  // Abattement de 10 % vs frais réels
  const bounds = abatementBounds(year);
  const raw = declaredSalary * 0.10;
  const abatement = declaredSalary > 0
    ? Math.min(bounds.max, Math.max(bounds.min, raw))
    : 0;
  const advantage = totalDeductible - abatement;

  // Chiffre d'affaires micro.
  // Une déclaration URSSAF fait foi : c'est le montant réellement déclaré.
  // Les recettes saisies à la main servent alors de contrôle, pas de source.
  const declaredByRegime = {};
  let cotisations = 0, cfp = 0, vflPaid = 0, declaredTotal = 0;
  for (const d of declarations) {
    declaredByRegime.bnc         = (declaredByRegime.bnc || 0) + (d.bnc || 0);
    declaredByRegime.bic_service = (declaredByRegime.bic_service || 0) + (d.bicService || 0);
    declaredByRegime.bic_vente   = (declaredByRegime.bic_vente || 0) + (d.bicVente || 0);
    cotisations += d.cotisations || 0;
    cfp += d.cfp || 0;
    vflPaid += d.vflAmount || 0;
    declaredTotal += (d.bnc || 0) + (d.bicService || 0) + (d.bicVente || 0);
  }
  for (const k of Object.keys(declaredByRegime)) {
    if (!declaredByRegime[k]) delete declaredByRegime[k];
  }

  const invoicedByRegime = {};
  for (const r of revenues) {
    invoicedByRegime[r.regime] = (invoicedByRegime[r.regime] || 0) + (r.amount || 0);
  }
  const invoicedTotal = Object.values(invoicedByRegime).reduce((a, b) => a + b, 0);

  const fromUrssaf = declarations.length > 0;
  const byRegime = fromUrssaf ? declaredByRegime : invoicedByRegime;

  const revenueRows = Object.entries(byRegime).map(([id, total]) => ({
    id,
    label: REGIMES[id]?.label || id,
    total,
    net: total * (1 - (REGIMES[id]?.abattement ?? 0)),
    box: settings.vfl ? REGIMES[id]?.boxVfl : REGIMES[id]?.box
  }));
  const turnover = Object.values(byRegime).reduce((a, b) => a + b, 0);
  const netMicro = revenueRows.reduce((a, r) => a + r.net, 0);

  // Écart entre ce qui a été déclaré et ce qui a été facturé
  const revenueGap = fromUrssaf && revenues.length ? declaredTotal - invoicedTotal : 0;

  const result = {
    year, expenses, trips, payslips, revenues, declarations,
    expensesDeductible: deductible,
    deductible: totalDeductible,
    courrierOn, courrier, courrierNet, courrierDeduction, method, useBrute,
    courrierUnfavourable, courrierLoss,
    supersededByForfait,
    reimbursed, aoaSpend, missingProof, categories,
    taxableSalary, declaredSalary, allowances, grossSalary, socialPaid,
    foreignTax, taxToRecover, foreignSalary, unbalanced,
    abatement, abatementBounds: bounds, advantage,
    countries: countryTally(trips),
    revenueRows, turnover, netMicro,
    fromUrssaf, cotisations, cfp, vflPaid, invoicedTotal, revenueGap
  };

  result.tax = estimateTax(result);
  return result;
}

/** Années présentes dans la base, plus l'année courante. */
async function knownYears() {
  const sets = await Promise.all(['expenses', 'trips', 'payslips', 'revenues', 'urssaf'].map(s => db.all(s)));
  const years = new Set(sets.flat().map(r => r.year).filter(Boolean));
  years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a);
}
