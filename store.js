/* ===========================================================
   store.js — données, référentiels et calculs
   Tout est local : IndexedDB. Aucune donnée ne sort de l'appareil.
   =========================================================== */

const DB_NAME = 'frais-reels';
const DB_VERSION = 1;
const STORES = ['expenses', 'receipts', 'trips', 'payslips', 'revenues', 'settings'];

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

const PURPOSES = {
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
  vfl: false,
  theme: 'auto',
  rates: { CHF: 1.06, GBP: 1.17, USD: 0.92, PLN: 0.23, CZK: 0.0413, DKK: 0.134,
           SEK: 0.088, NOK: 0.086, HUF: 0.0026, RON: 0.20, TRY: 0.028, MAD: 0.093, AED: 0.25 },
  abatement: {},          // { 2026: {min,max} } — surcharge manuelle
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
const NO_ALLOWANCE_PURPOSES = new Set(['base', 'mission']);

function courrierRate(country) {
  const r = settings.courrier.rates;
  return r[country] ?? r.DEFAUT ?? 0;
}

/** Indemnité d'un séjour : une nuit d'escale = une indemnité pleine, plus une demie au retour. */
function tripAllowance(trip) {
  const c = settings.courrier;
  if (!c.enabled) return { eligible: false, nights: 0, rate: 0, units: 0, amount: 0 };
  if (NO_ALLOWANCE_PURPOSES.has(trip.purpose)) {
    return { eligible: false, nights: trip.nights ?? 0, rate: 0, units: 0, amount: 0 };
  }
  const nights = trip.nights ?? 0;
  if (nights <= 0) return { eligible: true, nights: 0, rate: 0, units: 0, amount: 0 };
  const rate = courrierRate(trip.country);
  const units = nights + (c.halfReturn ? 0.5 : 0);
  return { eligible: true, nights, rate, units, amount: units * rate };
}

function courrierTotals(trips) {
  let gross = 0, nights = 0, counted = 0;
  const byCountry = {};
  for (const t of trips) {
    const a = tripAllowance(t);
    if (!a.amount) continue;
    gross += a.amount;
    nights += a.nights;
    counted++;
    byCountry[t.country] = (byCountry[t.country] || 0) + a.amount;
  }
  const rows = Object.entries(byCountry)
    .map(([code, total]) => ({ code, name: COUNTRY_BY_CODE[code] || code, rate: courrierRate(code), total }))
    .sort((a, b) => b.total - a.total);
  return { gross, nights, counted, rows };
}

/* ---------- Calculs annuels ---------- */

/** Jours de présence et nuitées par pays, à partir des séjours. */
function countryTally(trips) {
  const byCountry = {};      // code -> Set de dates
  const nights = {};
  const allDays = new Set();

  for (const t of trips) {
    const start = new Date(t.start + 'T12:00:00');
    const end = new Date((t.end || t.start) + 'T12:00:00');
    if (isNaN(start) || isNaN(end) || end < start) continue;

    byCountry[t.country] ??= new Set();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      byCountry[t.country].add(key);
      allDays.add(key);
    }
    const auto = Math.max(0, Math.round((end - start) / 86400000));
    nights[t.country] = (nights[t.country] || 0) + (t.nights ?? auto);
  }

  const rows = Object.entries(byCountry).map(([code, days]) => ({
    code,
    name: COUNTRY_BY_CODE[code] || code,
    days: days.size,
    nights: nights[code] || 0
  })).sort((a, b) => b.days - a.days);

  return { rows, totalDays: allDays.size, totalNights: Object.values(nights).reduce((a, b) => a + b, 0) };
}

/** Consolidation complète d'une année. */
async function computeYear(year) {
  const [expenses, trips, payslips, revenues] = await Promise.all([
    db.byYear('expenses', year),
    db.byYear('trips', year),
    db.byYear('payslips', year),
    db.byYear('revenues', year)
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

  const totalDeductible = deductible + courrierDeduction;

  // Abattement de 10 % vs frais réels
  const bounds = abatementBounds(year);
  const raw = declaredSalary * 0.10;
  const abatement = declaredSalary > 0
    ? Math.min(bounds.max, Math.max(bounds.min, raw))
    : 0;
  const advantage = totalDeductible - abatement;

  // Chiffre d'affaires micro
  const byRegime = {};
  for (const r of revenues) {
    byRegime[r.regime] = (byRegime[r.regime] || 0) + (r.amount || 0);
  }
  const revenueRows = Object.entries(byRegime).map(([id, total]) => ({
    id,
    label: REGIMES[id]?.label || id,
    total,
    net: total * (1 - (REGIMES[id]?.abattement ?? 0)),
    box: settings.vfl ? REGIMES[id]?.boxVfl : REGIMES[id]?.box
  }));
  const turnover = Object.values(byRegime).reduce((a, b) => a + b, 0);
  const netMicro = revenueRows.reduce((a, r) => a + r.net, 0);

  return {
    year, expenses, trips, payslips, revenues,
    expensesDeductible: deductible,
    deductible: totalDeductible,
    courrierOn, courrier, courrierNet, courrierDeduction, method, useBrute,
    supersededByForfait,
    reimbursed, aoaSpend, missingProof, categories,
    taxableSalary, declaredSalary, allowances, grossSalary, socialPaid,
    foreignTax, taxToRecover, foreignSalary, unbalanced,
    abatement, abatementBounds: bounds, advantage,
    countries: countryTally(trips),
    revenueRows, turnover, netMicro
  };
}

/** Années présentes dans la base, plus l'année courante. */
async function knownYears() {
  const sets = await Promise.all(['expenses', 'trips', 'payslips', 'revenues'].map(s => db.all(s)));
  const years = new Set(sets.flat().map(r => r.year).filter(Boolean));
  years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a);
}
