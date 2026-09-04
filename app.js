/* ===========================================================
   app.js — interface
   =========================================================== */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  year: new Date().getFullYear(),
  view: 'board',
  data: null,
  editing: null,        // id en cours d'édition
  sheetOwner: null,     // id du enregistrement dont on gère les pièces
  sheetIsNew: false,
  sheetReceipts: [],    // pièces attachées dans la feuille ouverte
  filter: 'all',
  search: ''
};

const VIEW_TITLES = {
  board: 'Tableau de bord',
  expenses: 'Dépenses',
  trips: 'Séjours',
  income: 'Revenus',
  report: 'Bilan'
};

/* ---------- Retours visuels ---------- */

let toastTimer;
function toast(message, ms = 2600) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const dayMonth = (iso) => {
  const [, m, d] = iso.split('-');
  const months = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
  return { day: d, month: months[Number(m) - 1] };
};

/* ---------- Rafraîchissement ---------- */

async function refresh() {
  state.data = await computeYear(state.year);
  const renderers = {
    board: renderBoard, expenses: renderExpenses,
    trips: renderTrips, income: renderIncome, report: renderReport
  };
  renderers[state.view]?.();
}

function switchView(view) {
  state.view = view;
  $$('.tabbar button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === view)));
  $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + view; });
  $('#view-title').textContent = VIEW_TITLES[view];
  $('#quick-add').hidden = (view === 'report' || view === 'income');
  window.scrollTo(0, 0);
  refresh();
}

/* ===========================================================
   Vue : tableau de bord
   =========================================================== */

function renderBoard() {
  const d = state.data;

  // La décision de l'année : frais réels ou abattement de 10 %.
  const scale = Math.max(d.deductible, d.abatement, 1) * 1.18;
  const fillPct = Math.min(100, (d.deductible / scale) * 100);
  const markPct = Math.min(100, (d.abatement / scale) * 100);
  const favourable = d.advantage > 0;

  let note;
  if (d.taxableSalary === 0) {
    note = 'Saisis tes bulletins de paie pour comparer avec l\'abattement automatique de 10 %.';
  } else if (favourable) {
    note = `Les frais réels retirent <strong>${eur(d.advantage)}</strong> de base imposable en plus de l'abattement.`;
  } else {
    note = `Il manque <strong>${eur(-d.advantage)}</strong> de frais justifiés pour que le réel devienne intéressant.`;
  }

  $('#board-verdict').innerHTML = `
    <div class="verdict ${favourable ? 'is-favourable' : ''}">
      <div class="verdict-amounts">
        <div>
          <span class="label">Frais réels ${d.year}</span>
          <span class="value">${eur0(d.deductible)}</span>
        </div>
        <div class="right">
          <span class="label">Abattement 10 %</span>
          <span class="value" style="color:var(--ink-2)">${eur0(d.abatement)}</span>
        </div>
      </div>
      <div class="gauge">
        <div class="gauge-fill" style="width:${fillPct}%"></div>
        <div class="gauge-mark" style="left:${markPct}%" data-label="seuil"></div>
      </div>
      <p class="verdict-note">${note}</p>
    </div>`;

  const stats = [
    { label: 'Jours hors domicile', value: d.countries.totalDays, sub: `${d.countries.totalNights} nuitées` },
    { label: 'Dépenses saisies', value: d.expenses.length, sub: d.missingProof ? `${d.missingProof} sans pièce` : 'toutes justifiées' },
    { label: 'Salaire déclaré', value: eur0(d.declaredSalary), sub: `${d.payslips.length} bulletins` },
    { label: 'CA Air One Aero', value: eur0(d.turnover), sub: `${d.revenues.length} recettes` }
  ];
  $('#board-stats').innerHTML = stats.map(s => `
    <div class="stat">
      <span class="label">${s.label}</span>
      <span class="value">${s.value}</span>
      <div class="sub">${s.sub}</div>
    </div>`).join('');

  // Composition du total, quand le forfait d'escale entre en jeu
  $('#board-composition').innerHTML = d.courrierOn ? `
    <div class="panel">
      <div class="panel-head">
        <h2>Composition des frais réels</h2>
        <span class="hint">${d.courrier.nights} nuits d'escale</span>
      </div>
      <table class="grid">
        <tbody>
          <tr><td>Forfait d'escale${d.useBrute ? '' : ', net du per diem'}</td><td class="num">${eur(d.courrierDeduction)}</td></tr>
          <tr><td>Autres frais sur justificatifs</td><td class="num">${eur(d.expensesDeductible)}</td></tr>
          ${d.useBrute ? `<tr><td style="color:var(--ink-3)">Per diem réintégré au salaire déclaré</td><td class="num" style="color:var(--ink-3)">+ ${eur(d.allowances)}</td></tr>` : ''}
        </tbody>
        <tfoot><tr><td>Total déductible</td><td class="num">${eur(d.deductible)}</td></tr></tfoot>
      </table>
      ${d.supersededByForfait > 0 ? `<p class="verdict-note" style="margin-top:10px">${eur(d.supersededByForfait)} de repas, hébergement et transports en escale sont couverts par le forfait et ne sont donc pas comptés en plus.</p>` : ''}
    </div>` : '';

  // Répartition par poste
  const cats = d.categories;
  $('#board-cat-count').textContent = cats.length ? `${cats.length} postes` : '';
  if (!cats.length) {
    $('#board-categories').innerHTML = `<div class="empty"><strong>Rien pour ${d.year}</strong>Appuie sur + pour saisir ta première dépense.</div>`;
  } else {
    const max = cats[0].total;
    $('#board-categories').innerHTML = `
      <table class="grid">
        <tbody>${cats.map(c => `
          <tr>
            <td class="bar-cell" style="width:60%">
              <div class="bar" style="width:${(c.total / max) * 100}%"></div>
              <span>${escapeHtml(c.label)}</span>
            </td>
            <td class="num">${eur(c.total)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td>Total déductible</td><td class="num">${eur(d.deductible)}</td></tr></tfoot>
      </table>`;
  }

  // Pays
  const rows = d.countries.rows;
  $('#board-countries').innerHTML = rows.length
    ? `<table class="grid">
        <thead><tr><th>Pays</th><th class="num">Jours</th><th class="num">Nuitées</th></tr></thead>
        <tbody>${rows.map(c => `
          <tr><td>${escapeHtml(c.name)}</td><td class="num">${c.days}</td><td class="num">${c.nights}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><td>Total</td><td class="num">${d.countries.totalDays}</td><td class="num">${d.countries.totalNights}</td></tr></tfoot>
      </table>`
    : `<div class="empty"><strong>Aucun séjour enregistré</strong>Le décompte par pays se construit depuis l'onglet Séjours.</div>`;

  // Dernières dépenses
  const recent = [...d.expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  $('#board-recent').innerHTML = recent.length
    ? recent.map(expenseRow).join('')
    : `<div class="empty">Aucune dépense pour l'instant.</div>`;

  renderBackupWarning();
}

function renderBackupWarning() {
  const el = $('#board-backup-warning');
  const last = settings.lastBackup;
  const age = last ? (Date.now() - new Date(last).getTime()) / 86400000 : Infinity;

  if (state.data.expenses.length && age > 30) {
    el.innerHTML = `<div class="notice alert">
      ${last ? `Dernière sauvegarde il y a ${Math.round(age)} jours.` : 'Aucune sauvegarde enregistrée.'}
      Tes données ne vivent que sur cet appareil — enregistre une copie dans iCloud depuis l'onglet Bilan.
    </div>`;
  } else {
    el.innerHTML = '';
  }
}

/* ===========================================================
   Vue : dépenses
   =========================================================== */

function expenseRow(e) {
  const { day, month } = dayMonth(e.date);
  const cat = CAT_BY_ID[e.category]?.label || e.category;
  const country = COUNTRY_BY_CODE[e.country];
  const converted = e.currency && e.currency !== 'EUR';
  const hasProof = e.receiptIds?.length;

  const meta = [
    escapeHtml(cat),
    country ? escapeHtml(country) : null,
    e.attach === 'aoa' ? 'Air One Aero' : null,
    e.reimbursed ? 'remboursé' : null
  ].filter(Boolean).join('<span class="dot"></span>');

  return `
    <button type="button" class="log-row" data-expense="${e.id}">
      <span class="log-date"><b>${day}</b>${month}</span>
      <span class="log-main">
        <span class="log-label">${escapeHtml(e.label || cat)}</span>
        <span class="log-meta">${meta}
          <span class="${hasProof ? 'clip' : 'clip no-clip'}">${hasProof ? `${hasProof} pièce${hasProof > 1 ? 's' : ''}` : 'sans pièce'}</span>
        </span>
      </span>
      <span class="log-amount">${eur(toEur(e.amount, e.currency))}
        ${converted ? `<small>${num(e.amount)} ${e.currency}</small>` : ''}
      </span>
    </button>`;
}

function renderExpenses() {
  const d = state.data;

  // Filtres : seuls les postes réellement utilisés
  const used = [...new Set(d.expenses.map(e => e.category))];
  const chips = [
    { id: 'all', label: 'Tout' },
    { id: 'noproof', label: 'Sans pièce' },
    ...CATEGORIES.filter(c => used.includes(c.id)).map(c => ({ id: c.id, label: c.label }))
  ];
  $('#expense-filters').innerHTML = chips.map(c =>
    `<button type="button" class="chip" data-filter="${c.id}" aria-pressed="${state.filter === c.id}">${escapeHtml(c.label)}</button>`
  ).join('');

  let list = [...d.expenses];
  if (state.filter === 'noproof') list = list.filter(e => !e.receiptIds?.length);
  else if (state.filter !== 'all') list = list.filter(e => e.category === state.filter);

  if (state.search) {
    const q = state.search.toLowerCase();
    list = list.filter(e =>
      (e.label || '').toLowerCase().includes(q) ||
      (e.notes || '').toLowerCase().includes(q) ||
      (COUNTRY_BY_CODE[e.country] || '').toLowerCase().includes(q));
  }

  list.sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((s, e) => s + toEur(e.amount, e.currency), 0);

  $('#expense-list').innerHTML = list.length
    ? list.map(expenseRow).join('') +
      `<div class="log-total"><span>${list.length} ligne${list.length > 1 ? 's' : ''}</span><span class="money">${eur(total)}</span></div>`
    : `<div class="empty"><strong>Aucune dépense</strong>${state.search || state.filter !== 'all' ? 'Aucun résultat pour ce filtre.' : 'Appuie sur + pour commencer.'}</div>`;
}

/* ===========================================================
   Vue : séjours
   =========================================================== */

function renderTrips() {
  const d = state.data;
  const c = d.countries;

  $('#trip-summary').innerHTML = c.rows.length
    ? `<table class="grid">
        <thead><tr><th>Pays</th><th class="num">Jours</th><th class="num">Nuitées</th>${d.courrierOn ? '<th class="num">Forfait</th>' : ''}</tr></thead>
        <tbody>${c.rows.map(r => {
          const cr = d.courrier.rows.find(x => x.code === r.code);
          return `<tr><td>${escapeHtml(r.name)}</td><td class="num">${r.days}</td><td class="num">${r.nights}</td>${d.courrierOn ? `<td class="num">${cr ? eur(cr.total) : '—'}</td>` : ''}</tr>`;
        }).join('')}
        </tbody>
        <tfoot><tr><td>Total</td><td class="num">${c.totalDays}</td><td class="num">${c.totalNights}</td>${d.courrierOn ? `<td class="num">${eur(d.courrier.gross)}</td>` : ''}</tr></tfoot>
      </table>
      ${d.courrierOn ? `<p class="verdict-note" style="margin-top:10px">
        Forfait d'escale sur ${d.courrier.nights} nuits. Per diem déjà reçu de ton employeur :
        ${eur(d.allowances)}. ${d.useBrute
          ? 'Ce per diem est réintégré à ton salaire déclaré et le forfait se déduit en entier.'
          : `Déduction retenue : ${eur(d.courrierNet)}.`}
      </p>` : ''}`
    : `<div class="empty">Rien à décompter pour ${d.year}.</div>`;

  const trips = [...d.trips].sort((a, b) => b.start.localeCompare(a.start));
  $('#trip-list').innerHTML = trips.length ? trips.map(t => {
    const { day, month } = dayMonth(t.start);
    const s = new Date(t.start + 'T12:00:00');
    const e = new Date((t.end || t.start) + 'T12:00:00');
    const days = Math.round((e - s) / 86400000) + 1;
    const nights = t.nights ?? Math.max(0, days - 1);
    const a = tripAllowance(t);
    return `
      <button type="button" class="log-row" data-trip="${t.id}">
        <span class="log-date"><b>${day}</b>${month}</span>
        <span class="log-main">
          <span class="log-label">${escapeHtml(COUNTRY_BY_CODE[t.country] || t.country)}</span>
          <span class="log-meta">${escapeHtml(PURPOSES[t.purpose] || '')}<span class="dot"></span>${t.start.split('-').reverse().slice(0, 2).join('/') } → ${(t.end || t.start).split('-').reverse().slice(0, 2).join('/')}</span>
        </span>
        <span class="log-amount">${a.amount ? eur(a.amount) : days + ' j'}<small>${a.amount ? `${a.units} × ${eur0(a.rate)}` : `${nights} nuit${nights > 1 ? 's' : ''}`}</small></span>
      </button>`;
  }).join('') : `<div class="empty"><strong>Aucun séjour</strong>Ajoute tes rotations et découchés au fil de l'eau.</div>`;
}

/* ===========================================================
   Vue : revenus
   =========================================================== */

function renderIncome() {
  const d = state.data;

  $('#payslip-totals').innerHTML = `
    <div class="stats" style="margin-bottom:12px">
      <div class="stat"><span class="label">Base imposable France</span><span class="value">${eur0(d.taxableSalary)}</span><div class="sub">après cotisations</div></div>
      <div class="stat"><span class="label">Per diem non imposable</span><span class="value">${eur0(d.allowances)}</span><div class="sub">hors base</div></div>
      <div class="stat"><span class="label">Cotisations retenues</span><span class="value">${eur0(d.socialPaid)}</span><div class="sub">part salariale</div></div>
      <div class="stat"><span class="label">Impôt payé sur place</span><span class="value">${eur0(d.foreignTax)}</span><div class="sub">${d.taxToRecover ? 'hors montants contestés' : "crédit d'impôt possible"}</div></div>
    </div>
    ${d.taxToRecover ? `<div class="notice alert">${eur(d.taxToRecover)} d'impôt prélevé à tort, en attente de remboursement. Ce montant n'ouvre aucun crédit d'impôt tant qu'il n'est pas définitivement supporté.</div>` : ''}`;

  const SOURCES = { CZ: 'Tchéquie', MT: 'Malte', DE: 'Allemagne', AT: 'Autriche', FR: 'France', AUTRE: 'Autre' };
  const slips = [...d.payslips].sort((a, b) => (b.month || '').localeCompare(a.month || ''));
  $('#payslip-list').innerHTML = slips.length ? slips.map(p => {
    const [y, m] = (p.month || '').split('-');
    const months = ['janv', 'févr', 'mars', 'avril', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
    const e = payslipEur(p);
    const bal = payslipBalance(p);
    const foreign = p.currency && p.currency !== 'EUR';
    return `
      <button type="button" class="log-row" data-payslip="${p.id}">
        <span class="log-date"><b>${months[Number(m) - 1] || '?'}</b>${y || ''}</span>
        <span class="log-main">
          <span class="log-label">${escapeHtml(p.employer || 'Bulletin')}</span>
          <span class="log-meta">${SOURCES[p.source] || 'Autre'}
            ${e.allowance ? `<span class="dot"></span>${eur0(e.allowance)} de per diem` : ''}
            ${bal.checked && !bal.ok ? '<span class="dot"></span><span class="clip no-clip">à vérifier</span>' : ''}
            ${p.receiptIds?.length ? '<span class="dot"></span><span class="clip">scanné</span>' : ''}
          </span>
        </span>
        <span class="log-amount">${eur(e.frenchBase)}
          <small>${foreign ? `${num(p.taxableBase ?? 0, 0)} ${p.currency}` : 'base imposable'}</small>
        </span>
      </button>`;
  }).join('') + `<div class="log-total"><span>${slips.length} bulletin${slips.length > 1 ? 's' : ''}</span><span class="money">${eur(d.taxableSalary)}</span></div>`
    : `<div class="empty"><strong>Aucun bulletin</strong>Recopie les lignes /106, /350, /360, 202F et /401 de chaque bulletin.</div>`;

  // Chiffre d'affaires
  $('#revenue-totals').innerHTML = d.revenueRows.length
    ? `<table class="grid" style="margin-bottom:10px">
        <thead><tr><th>Case</th><th>Catégorie</th><th class="num">CA</th><th class="num">Après abattement</th></tr></thead>
        <tbody>${d.revenueRows.map(r => `
          <tr><td class="num" style="color:var(--brass);font-weight:600">${r.box || ''}</td>
              <td>${escapeHtml(r.label)}</td>
              <td class="num">${eur(r.total)}</td>
              <td class="num" style="color:var(--ink-3)">${eur(r.net)}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="2">Total</td><td class="num">${eur(d.turnover)}</td><td class="num">${eur(d.netMicro)}</td></tr></tfoot>
      </table>`
    : '';

  const revs = [...d.revenues].sort((a, b) => b.date.localeCompare(a.date));
  $('#revenue-list').innerHTML = revs.length ? revs.map(r => {
    const { day, month } = dayMonth(r.date);
    return `
      <button type="button" class="log-row" data-revenue="${r.id}">
        <span class="log-date"><b>${day}</b>${month}</span>
        <span class="log-main">
          <span class="log-label">${escapeHtml(r.client || 'Recette')}</span>
          <span class="log-meta">${escapeHtml(REGIMES[r.regime]?.label || '')}${r.invoice ? `<span class="dot"></span>${escapeHtml(r.invoice)}` : ''}</span>
        </span>
        <span class="log-amount money gain">${eur(r.amount)}</span>
      </button>`;
  }).join('') : `<div class="empty">Aucune recette enregistrée pour ${d.year}.</div>`;
}

/* ===========================================================
   Vue : bilan
   =========================================================== */

function reportDetailText() {
  const d = state.data;
  const lines = [
    ...(d.courrierDeduction
      ? [`Frais en courrier, ${d.courrier.nights} nuits d'escale : ${eur(d.courrierDeduction)}`]
      : []),
    ...d.categories.map(c => `${c.label} : ${eur(c.total)}`)
  ];
  return `Frais réels ${d.year}\n` +
    `${settings.name ? settings.name + '\n' : ''}` +
    lines.join('\n') +
    `\n\nTotal : ${eur(d.deductible)}` +
    (d.countries.rows.length
      ? `\n\nPrésence hors domicile : ${d.countries.totalDays} jours, ${d.countries.totalNights} nuitées\n` +
        d.countries.rows.map(c => `${c.name} : ${c.days} j / ${c.nights} nuits`).join('\n')
      : '');
}

function renderReport() {
  const d = state.data;
  $('#report-year-label').textContent = `revenus ${d.year}`;

  const foreign = d.foreignSalary > 0;

  const boxes = [
    { code: '1AJ', label: 'Salaires nets imposables',
      sub: d.useBrute
        ? 'base étrangère après cotisations, per diem réintégré'
        : (foreign ? 'base étrangère après cotisations, convertie en euros' : 'cumul des bulletins'),
      value: eur(d.declaredSalary) },
    { code: '1AK', label: 'Frais réels',
      sub: d.advantage > 0 ? 'plus avantageux que l\'abattement' : 'moins avantageux que l\'abattement de 10 %',
      value: eur(d.deductible) },
    ...d.revenueRows.map(r => ({ code: r.box || '—', label: r.label, sub: 'chiffre d\'affaires brut encaissé', value: eur(r.total) }))
  ];

  if (foreign) {
    boxes.push({
      code: '2047', label: 'Revenus de source étrangère',
      sub: 'formulaire annexe, à remplir avant la déclaration principale',
      value: eur(d.foreignSalary)
    });
    if (d.foreignTax > 0) {
      boxes.push({
        code: '8VL', label: 'Crédit d\'impôt étranger',
        sub: 'impôt effectivement payé à l\'étranger — case à confirmer',
        value: eur(d.foreignTax)
      });
    }
  }

  $('#report-boxes').innerHTML = boxes.map(b => `
    <div class="box-line">
      <span class="box-code">${b.code}</span>
      <span class="box-label">${escapeHtml(b.label)}<small>${escapeHtml(b.sub)}</small></span>
      <span class="box-value">${b.value}</span>
    </div>`).join('')
    + (d.unbalanced
      ? `<div class="notice alert" style="margin:12px 0 0">${d.unbalanced} bulletin${d.unbalanced > 1 ? 's ne se recoupent' : ' ne se recoupe'} pas avec le virement reçu. Les montants ci-dessus sont donc incertains.</div>`
      : '');

  $('#report-detail').innerHTML = (d.categories.length || d.courrierDeduction)
    ? `<table class="grid">
        <tbody>
        ${d.courrierDeduction ? `<tr><td>Frais en courrier — ${d.courrier.nights} nuits d'escale</td><td class="num" style="color:var(--ink-3)">${d.courrier.counted}</td><td class="num">${eur(d.courrierDeduction)}</td></tr>` : ''}
        ${d.categories.map(c => {
          const n = d.expenses.filter(e => e.category === c.id && e.attach !== 'aoa' && !e.reimbursed).length;
          return `<tr><td>${escapeHtml(c.label)}</td><td class="num" style="color:var(--ink-3)">${n}</td><td class="num">${eur(c.total)}</td></tr>`;
        }).join('')}</tbody>
        <tfoot><tr><td>Total</td><td></td><td class="num">${eur(d.deductible)}</td></tr></tfoot>
      </table>
      ${d.missingProof ? `<div class="notice alert" style="margin-top:12px">${d.missingProof} dépense${d.missingProof > 1 ? 's' : ''} sans justificatif. En cas de contrôle, chaque ligne doit pouvoir être prouvée.</div>` : ''}`
    : `<div class="empty">Rien à détailler pour ${d.year}.</div>`;

  $('#last-backup').textContent = settings.lastBackup
    ? `Dernière sauvegarde : ${new Date(settings.lastBackup).toLocaleString('fr-FR')}`
    : 'Aucune sauvegarde effectuée.';

  updateStorageUsage();
}

async function updateStorageUsage() {
  if (!navigator.storage?.estimate) return;
  const { usage } = await navigator.storage.estimate();
  const mb = (usage / 1048576).toFixed(1);
  const el = $('#storage-usage');
  if (el) el.textContent = `${mb} Mo utilisés`;
}

/* ===========================================================
   Feuilles de saisie
   =========================================================== */

function openSheet(id) {
  const dlg = $('#' + id);
  dlg.showModal();
  return dlg;
}

function closeSheet(dlg) { dlg.close(); }

/** Nettoie les pièces attachées à un enregistrement abandonné. */
async function discardPendingReceipts() {
  if (!state.sheetIsNew || !state.sheetOwner) return;
  for (const r of state.sheetReceipts) await db.remove('receipts', r.id);
  state.sheetReceipts = [];
  state.sheetOwner = null;
}

function renderReceiptStrip(containerId) {
  const box = $('#' + containerId);
  box.innerHTML = state.sheetReceipts.map(r => `
    <div class="receipt" data-receipt="${r.id}">
      ${r.mime === 'application/pdf'
        ? '<div class="pdfmark">PDF</div>'
        : `<img src="${URL.createObjectURL(r.blob)}" alt="Justificatif">`}
      <button type="button" class="kill" data-kill="${r.id}" aria-label="Retirer">×</button>
    </div>`).join('');
}

async function handleFiles(files, containerId) {
  if (!files?.length) return;
  toast(`Traitement de ${files.length} fichier${files.length > 1 ? 's' : ''}…`, 1400);
  for (const f of files) {
    try {
      const rec = await addReceipt(f, state.sheetOwner);
      state.sheetReceipts.push(rec);
    } catch (err) {
      console.error(err);
      toast('Un fichier n\'a pas pu être ajouté.');
    }
  }
  renderReceiptStrip(containerId);
}

/* ---------- Dépense ---------- */

function fillSelect(sel, items, valueKey, labelKey) {
  sel.innerHTML = items.map(i =>
    `<option value="${i[valueKey]}">${escapeHtml(i[labelKey])}</option>`).join('');
}

function openExpense(expense) {
  const isNew = !expense;
  state.editing = expense?.id || null;
  state.sheetIsNew = isNew;
  state.sheetOwner = expense?.id || uid();
  state.sheetReceipts = [];

  $('#expense-sheet-title').textContent = isNew ? 'Nouvelle dépense' : 'Modifier la dépense';
  $('#ex-delete').hidden = isNew;

  $('#ex-amount').value    = isNew ? '' : num(expense.amount);
  $('#ex-currency').value  = expense?.currency || 'EUR';
  $('#ex-label').value     = expense?.label || '';
  $('#ex-date').value      = expense?.date || todayISO();
  $('#ex-country').value   = expense?.country || 'FR';
  $('#ex-attach').value    = expense?.attach || 'salaire';
  $('#ex-share').value     = expense?.share ?? 100;
  $('#ex-payment').value   = expense?.payment || 'cb';
  $('#ex-reimbursed').checked = !!expense?.reimbursed;
  $('#ex-notes').value     = expense?.notes || '';

  const cat = expense?.category || 'repas';
  $$('#ex-categories .chip').forEach(c =>
    c.setAttribute('aria-pressed', String(c.dataset.cat === cat)));

  $('#ex-receipts').innerHTML = '';
  if (!isNew && expense.receiptIds?.length) {
    Promise.all(expense.receiptIds.map(id => db.get('receipts', id)))
      .then(recs => { state.sheetReceipts = recs.filter(Boolean); renderReceiptStrip('ex-receipts'); });
  }

  updateConversionHint();
  openSheet('dlg-expense');
  if (isNew) setTimeout(() => $('#ex-amount').focus(), 120);
}

function updateConversionHint() {
  const cur = $('#ex-currency').value;
  const hint = $('#ex-conversion');
  if (cur === 'EUR') { hint.style.display = 'none'; return; }
  const amount = parseAmount($('#ex-amount').value);
  const rate = settings.rates[cur];
  hint.style.display = 'block';
  hint.innerHTML = rate
    ? `Converti à <strong>${eur(amount * rate)}</strong> au taux ${num(rate, 4)}. Taux modifiable dans les réglages.`
    : `Aucun taux défini pour ${cur} : le montant sera compté tel quel. Ajoute-le dans les réglages.`;
}

async function saveExpense() {
  const cat = $$('#ex-categories .chip').find(c => c.getAttribute('aria-pressed') === 'true');
  const date = $('#ex-date').value || todayISO();
  const amount = parseAmount($('#ex-amount').value);

  if (amount <= 0) { toast('Indique un montant supérieur à zéro.'); return false; }

  const record = {
    id: state.sheetOwner,
    date,
    year: yearOf(date),
    amount,
    currency: $('#ex-currency').value,
    category: cat?.dataset.cat || 'autre',
    label: $('#ex-label').value.trim(),
    country: $('#ex-country').value,
    attach: $('#ex-attach').value,
    share: Math.min(100, Math.max(0, Number($('#ex-share').value) || 100)),
    payment: $('#ex-payment').value,
    reimbursed: $('#ex-reimbursed').checked,
    notes: $('#ex-notes').value.trim(),
    receiptIds: state.sheetReceipts.map(r => r.id),
    updatedAt: Date.now()
  };

  await db.put('expenses', record);
  state.sheetIsNew = false;
  return true;
}

/* ---------- Séjour ---------- */

function openTrip(trip) {
  const isNew = !trip;
  state.editing = trip?.id || null;
  state.sheetIsNew = isNew;
  state.sheetOwner = trip?.id || uid();
  state.sheetReceipts = [];

  $('#trip-sheet-title').textContent = isNew ? 'Nouveau séjour' : 'Modifier le séjour';
  $('#tr-delete').hidden = isNew;
  $('#tr-start').value   = trip?.start || todayISO();
  $('#tr-end').value     = trip?.end || todayISO();
  $('#tr-country').value = trip?.country || 'DE';
  $('#tr-purpose').value = trip?.purpose || 'rotation';
  $('#tr-notes').value   = trip?.notes || '';
  $('#tr-nights').value  = trip?.nights ?? autoNights();

  openSheet('dlg-trip');
}

function autoNights() {
  const s = new Date($('#tr-start').value + 'T12:00:00');
  const e = new Date($('#tr-end').value + 'T12:00:00');
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 86400000);
}

async function saveTrip() {
  const start = $('#tr-start').value;
  const end = $('#tr-end').value || start;
  if (!start) { toast('Indique une date de départ.'); return false; }
  if (end < start) { toast('Le retour ne peut pas précéder le départ.'); return false; }

  await db.put('trips', {
    id: state.sheetOwner,
    start, end,
    year: yearOf(start),
    country: $('#tr-country').value,
    purpose: $('#tr-purpose').value,
    nights: Number($('#tr-nights').value) || 0,
    notes: $('#tr-notes').value.trim(),
    updatedAt: Date.now()
  });
  state.sheetIsNew = false;
  return true;
}

/* ---------- Bulletin de paie ---------- */

function openPayslip(slip) {
  const isNew = !slip;
  state.editing = slip?.id || null;
  state.sheetIsNew = isNew;
  state.sheetOwner = slip?.id || uid();
  state.sheetReceipts = [];

  const previous = lastPayslip();

  $('#payslip-sheet-title').textContent = isNew ? 'Nouveau bulletin' : 'Modifier le bulletin';
  $('#ps-delete').hidden = isNew;
  $('#ps-month').value     = slip?.month || `${state.year}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  $('#ps-employer').value  = slip?.employer  ?? previous?.employer ?? 'Eurowings Europe Ltd.';
  $('#ps-currency').value  = slip?.currency  ?? previous?.currency ?? 'CZK';
  $('#ps-source').value    = slip?.source    ?? previous?.source   ?? 'CZ';

  $('#ps-total-cur').value = slip?.totalCur ? num(slip.totalCur) : '';
  $('#ps-total-eur').value = slip?.totalEur ? num(slip.totalEur) : '';
  $('#ps-rate').value      = slip?.rate ? num(slip.rate, 6)
                           : (previous?.rate ? num(previous.rate, 6) : '');
  $('#ps-base').value      = slip ? num(slip.taxableBase ?? slip.taxable ?? 0) : '';
  $('#ps-social').value    = slip?.social    ? num(slip.social) : '';
  $('#ps-allowance').value = slip?.allowance ? num(slip.allowance) : '';
  $('#ps-tax').value       = slip?.taxPaid   ? num(slip.taxPaid) : '';
  $('#ps-net').value       = slip?.net       ? num(slip.net) : '';
  $('#ps-tax-disputed').checked = !!slip?.taxDisputed;

  $('#ps-receipts').innerHTML = '';
  if (!isNew && slip.receiptIds?.length) {
    Promise.all(slip.receiptIds.map(id => db.get('receipts', id)))
      .then(recs => { state.sheetReceipts = recs.filter(Boolean); renderReceiptStrip('ps-receipts'); });
  }

  updatePayslipPreview();
  openSheet('dlg-payslip');
}

function lastPayslip() {
  const slips = [...(state.data?.payslips || [])]
    .sort((a, b) => (a.month || '').localeCompare(b.month || ''));
  return slips.at(-1) || null;
}

/** Priorité au taux saisi, sinon celui des réglages. */
function currentPayslipRate() {
  const cur = $('#ps-currency').value;
  if (cur === 'EUR') return 1;
  const manual = parseAmount($('#ps-rate').value);
  if (manual > 0) return manual;
  return settings.rates[cur] || 1;
}

/** Les deux totaux de l'en-tête remplissent le champ de taux. */
function syncRateFromTotals() {
  const totalCur = parseAmount($('#ps-total-cur').value);
  const totalEur = parseAmount($('#ps-total-eur').value);
  if (totalCur > 0 && totalEur > 0) {
    $('#ps-rate').value = num(totalEur / totalCur, 6);
  }
  updatePayslipPreview();
}

function updatePayslipPreview() {
  const cur = $('#ps-currency').value;
  const isEuro = cur === 'EUR';
  $('#ps-rate-block').hidden = isEuro;

  const rate = currentPayslipRate();
  const base = parseAmount($('#ps-base').value);
  const social = parseAmount($('#ps-social').value);
  const allowance = parseAmount($('#ps-allowance').value);
  const tax = parseAmount($('#ps-tax').value);
  const net = parseAmount($('#ps-net').value);
  const frenchBase = Math.max(0, base - social) * rate;

  if (!isEuro) {
    const totalEur = parseAmount($('#ps-total-eur').value);
    $('#ps-rate-hint').innerHTML = totalEur > 0
      ? `Calculé depuis l'en-tête du bulletin : 1 € = ${num(1 / rate, 3)} ${cur}.`
      : `Aucun total en euros sur ce bulletin. Reprends le taux d'un mois voisin ou le taux officiel de la période.`;
  }

  const box = $('#ps-computed');
  if (base <= 0) {
    box.innerHTML = 'Renseigne la base imposable pour voir la conversion.';
    box.style.borderLeftColor = 'var(--line)';
    return;
  }

  // Contrôle : base − cotisations − impôt + per diem doit égaler le virement
  const balance = payslipBalance({ taxableBase: base, social, taxPaid: tax, allowance, net });

  let verdict = '';
  if (balance.checked) {
    verdict = balance.ok
      ? `<br><span style="color:var(--gain)">Saisie cohérente avec le virement.</span>`
      : `<br><span style="color:var(--warn)">Écart de ${num(Math.abs(balance.diff))} ${cur} avec le virement.
         Vérifie les lignes /350 et /360 des périodes antérieures, souvent oubliées.</span>`;
  }

  box.style.borderLeftColor = balance.checked && !balance.ok ? 'var(--warn)' : 'var(--gain)';

  const dual = (v) => isEuro ? eur(v) : `${num(v)} ${cur} <span style="color:var(--ink-3)">/</span> ${eur(v * rate)}`;

  box.innerHTML = `
    <table class="grid" style="margin:-2px 0 0">
      <tbody>
        <tr><td>Base imposable</td><td class="num">${dual(base)}</td></tr>
        <tr><td>Cotisations</td><td class="num">${dual(social)}</td></tr>
        ${allowance ? `<tr><td>Per diem</td><td class="num">${dual(allowance)}</td></tr>` : ''}
        ${tax ? `<tr><td>Impôt sur place</td><td class="num">${dual(tax)}</td></tr>` : ''}
      </tbody>
      <tfoot><tr><td>Base retenue pour la France</td><td class="num">${eur(frenchBase)}</td></tr></tfoot>
    </table>
    ${verdict}`;
}

async function savePayslip() {
  const month = $('#ps-month').value;
  if (!month) { toast('Indique le mois du bulletin.'); return false; }
  const taxableBase = parseAmount($('#ps-base').value);
  if (taxableBase <= 0) { toast('Indique la base imposable du bulletin.'); return false; }

  await db.put('payslips', {
    id: state.sheetOwner,
    month,
    year: Number(month.slice(0, 4)),
    employer: $('#ps-employer').value.trim(),
    currency: $('#ps-currency').value,
    rate: currentPayslipRate(),
    totalCur: parseAmount($('#ps-total-cur').value),
    totalEur: parseAmount($('#ps-total-eur').value),
    taxableBase,
    social: parseAmount($('#ps-social').value),
    allowance: parseAmount($('#ps-allowance').value),
    taxPaid: parseAmount($('#ps-tax').value),
    taxDisputed: $('#ps-tax-disputed').checked,
    net: parseAmount($('#ps-net').value),
    source: $('#ps-source').value,
    receiptIds: state.sheetReceipts.map(r => r.id),
    updatedAt: Date.now()
  });
  state.sheetIsNew = false;
  return true;
}

/* ---------- Recette ---------- */

function openRevenue(rev) {
  const isNew = !rev;
  state.editing = rev?.id || null;
  state.sheetIsNew = isNew;
  state.sheetOwner = rev?.id || uid();
  state.sheetReceipts = [];

  $('#revenue-sheet-title').textContent = isNew ? 'Recette encaissée' : 'Modifier la recette';
  $('#rv-delete').hidden = isNew;
  $('#rv-amount').value  = rev ? num(rev.amount) : '';
  $('#rv-regime').value  = rev?.regime || 'bic_service';
  $('#rv-date').value    = rev?.date || todayISO();
  $('#rv-client').value  = rev?.client || '';
  $('#rv-invoice').value = rev?.invoice || '';

  $('#rv-receipts').innerHTML = '';
  if (!isNew && rev.receiptIds?.length) {
    Promise.all(rev.receiptIds.map(id => db.get('receipts', id)))
      .then(recs => { state.sheetReceipts = recs.filter(Boolean); renderReceiptStrip('rv-receipts'); });
  }
  openSheet('dlg-revenue');
}

async function saveRevenue() {
  const amount = parseAmount($('#rv-amount').value);
  if (amount <= 0) { toast('Indique un montant supérieur à zéro.'); return false; }
  const date = $('#rv-date').value || todayISO();

  await db.put('revenues', {
    id: state.sheetOwner,
    date,
    year: yearOf(date),
    amount,
    regime: $('#rv-regime').value,
    client: $('#rv-client').value.trim(),
    invoice: $('#rv-invoice').value.trim(),
    receiptIds: state.sheetReceipts.map(r => r.id),
    updatedAt: Date.now()
  });
  state.sheetIsNew = false;
  return true;
}

/* ---------- Réglages ---------- */

function ratesToText(rates) {
  return Object.entries(rates).map(([k, v]) => `${k}=${v}`).join('\n');
}

function textToRates(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^([A-Za-z]{2,6})\s*=\s*([\d.,]+)$/);
    if (m) out[m[1].toUpperCase()] = parseAmount(m[2]);
  }
  return out;
}

function openSettings() {
  const b = abatementBounds(state.year);
  $('#st-name').value  = settings.name || '';
  $('#st-home').value  = settings.home || '';
  $('#st-base').value  = settings.base || '';
  $('#st-base-airports').value = settings.baseAirports || '';
  $('#st-abat-min').value = b.min;
  $('#st-abat-max').value = b.max;
  $('#st-vfl').checked = !!settings.vfl;
  $('#st-theme').value = settings.theme || 'auto';
  $('#st-rates').value = ratesToText(settings.rates);

  $('#st-courrier').checked        = !!settings.courrier.enabled;
  $('#st-courrier-half').checked   = settings.courrier.halfReturn !== false;
  $('#st-courrier-method').value   = settings.courrier.method || 'brute';
  $('#st-courrier-rates').value    = ratesToText(settings.courrier.rates);

  openSheet('dlg-settings');
  updateSettingsStorage();
}

async function updateSettingsStorage() {
  const el = $('#st-storage');
  if (!navigator.storage?.estimate) { el.textContent = 'Estimation indisponible sur ce navigateur.'; return; }
  const { usage, quota } = await navigator.storage.estimate();
  const persisted = await navigator.storage.persisted?.() ?? false;
  el.innerHTML = `${(usage / 1048576).toFixed(1)} Mo utilisés sur ${(quota / 1048576).toFixed(0)} Mo disponibles.<br>
    ${persisted
      ? 'Les données sont protégées contre l\'effacement automatique.'
      : 'Le navigateur peut effacer ces données s\'il manque de place.'}`;
}

async function saveSettings() {
  await saveSetting('name', $('#st-name').value.trim());
  await saveSetting('home', $('#st-home').value.trim());
  await saveSetting('base', $('#st-base').value.trim());
  await saveSetting('baseAirports', $('#st-base-airports').value.trim().toUpperCase());
  await saveSetting('vfl', $('#st-vfl').checked);
  await saveSetting('theme', $('#st-theme').value);
  await saveSetting('rates', textToRates($('#st-rates').value));

  await saveSetting('courrier', {
    enabled: $('#st-courrier').checked,
    halfReturn: $('#st-courrier-half').checked,
    method: $('#st-courrier-method').value,
    rates: textToRates($('#st-courrier-rates').value)
  });

  const bounds = { ...settings.abatement };
  bounds[state.year] = {
    min: Number($('#st-abat-min').value) || 0,
    max: Number($('#st-abat-max').value) || 0
  };
  await saveSetting('abatement', bounds);

  applyTheme();
  return true;
}

function applyTheme() {
  const t = settings.theme || 'auto';
  if (t === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', t);
  }
  // La barre d'état iOS suit la couleur de fond réellement appliquée
  const dark = t === 'dark' ||
    (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = dark ? '#0F1620' : '#EFF2F6';
  document.head.appendChild(meta);
}

/* ===========================================================
   Visionneuse
   =========================================================== */

async function viewReceipt(id) {
  const rec = await db.get('receipts', id);
  if (!rec) return;
  const url = URL.createObjectURL(rec.blob);
  $('#viewer-title').textContent = rec.name || 'Justificatif';
  $('#viewer-body').innerHTML = rec.mime === 'application/pdf'
    ? `<p class="verdict-note">Document PDF.</p><a class="btn btn-primary" href="${url}" target="_blank" rel="noopener">Ouvrir le PDF</a>`
    : `<img src="${url}" alt="Justificatif" style="max-width:100%;border-radius:8px">`;
  openSheet('dlg-viewer');
}

/* ===========================================================
   Exports
   =========================================================== */

async function runExport(kind, button) {
  const label = button.textContent;
  button.disabled = true;
  try {
    const d = state.data;
    if (kind === 'pdf') {
      button.textContent = 'Génération…';
      const blob = await buildPdf(d);
      await deliver(blob, `frais-reels-${d.year}.pdf`);
    } else if (kind === 'csv') {
      const blob = new Blob([expensesCsv(d)], { type: 'text/csv;charset=utf-8' });
      await deliver(blob, `depenses-${d.year}.csv`);
    } else if (kind === 'zip') {
      const blob = await buildZip(d, msg => { button.textContent = msg; });
      await deliver(blob, `frais-reels-${d.year}.zip`);
    }
    toast('Fichier prêt.');
  } catch (err) {
    console.error(err);
    toast(err.message?.includes('Chargement')
      ? 'Export indisponible hors ligne pour cette première utilisation.'
      : 'L\'export a échoué : ' + err.message);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

async function runBackup(button) {
  const label = button.textContent;
  button.disabled = true;
  try {
    const blob = await buildBackup(msg => { button.textContent = msg; });
    const stamp = new Date().toISOString().slice(0, 10);
    const result = await deliver(blob, `sauvegarde-frais-reels-${stamp}.json`);
    if (result !== 'cancelled') {
      await saveSetting('lastBackup', new Date().toISOString());
      toast('Sauvegarde créée. Enregistre-la dans iCloud Drive.');
      renderReport();
    }
  } catch (err) {
    console.error(err);
    toast('La sauvegarde a échoué : ' + err.message);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

/* ===========================================================
   Imports PDF
   =========================================================== */

let pendingImport = null;    // { kind, apply() }

function baseAirports() {
  return (settings.baseAirports || '').toUpperCase().split(/[\s,;]+/).filter(Boolean);
}

async function importRoster(file, button) {
  const label = button.textContent;
  button.textContent = 'Lecture du PDF…';
  try {
    const items = await pdfItems(file);
    const roster = parseRoster(items);

    if (!roster.nights.length) {
      toast('Aucune nuit d\'escale détectée dans ce planning.', 4000);
      return;
    }

    const trips = nightsToTrips(roster.nights, baseAirports());
    const existing = await db.all('trips');

    // Un séjour déjà présent au même départ et au même endroit ne sera pas dupliqué
    const seen = new Set(existing.map(t => `${t.start}|${t.country}`));
    const fresh = trips.filter(t => !seen.has(`${t.start}|${t.country}`));
    const dupes = trips.length - fresh.length;

    const byCountry = {};
    for (const t of trips) byCountry[t.country] = (byCountry[t.country] || 0) + t.nights;

    pendingImport = {
      kind: 'roster',
      apply: async () => {
        for (const t of fresh) {
          await db.put('trips', {
            id: uid(),
            start: t.start,
            end: t.end,
            year: yearOf(t.start),
            country: t.country,
            city: '',
            purpose: t.purpose,
            nights: t.nights,
            notes: `Importé du roster — escale ${t.place}`,
            updatedAt: Date.now()
          });
        }
        return `${fresh.length} séjour${fresh.length > 1 ? 's' : ''} ajouté${fresh.length > 1 ? 's' : ''}.`;
      }
    };

    const totalNights = trips.reduce((s, t) => s + t.nights, 0);
    $('#import-title').textContent = 'Roster détecté';
    $('#import-body').innerHTML = `
      <div class="stats" style="margin-bottom:14px">
        <div class="stat"><span class="label">Nuits hors domicile</span><span class="value">${totalNights}</span><div class="sub">${roster.daysDetected} jours lus</div></div>
        <div class="stat"><span class="label">Séjours reconstitués</span><span class="value">${trips.length}</span><div class="sub">${dupes ? `${dupes} déjà présents` : 'aucun doublon'}</div></div>
      </div>

      <table class="grid" style="margin-bottom:14px">
        <thead><tr><th>Période</th><th>Lieu</th><th class="num">Nuits</th><th>Nature</th></tr></thead>
        <tbody>${trips.map(t => `
          <tr>
            <td class="num" style="font-size:.78rem">${t.start.slice(8)}/${t.start.slice(5, 7)}</td>
            <td>${escapeHtml(COUNTRY_BY_CODE[t.country] || t.country)} <span class="flag">${t.place}</span></td>
            <td class="num">${t.nights}</td>
            <td style="font-size:.75rem;color:var(--ink-3)">${t.purpose === 'base' ? 'en base' : 'escale'}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="2">Total</td><td class="num">${totalNights}</td><td></td></tr></tfoot>
      </table>

      <div class="notice">
        Seules les nuits marquées par une ligne hôtel sont retenues. Les jours de repos affichés
        à ta base contractuelle sans hébergement sont considérés comme passés à ton domicile.
      </div>

      ${roster.unknownPlaces.length ? `<div class="notice alert">
        Codes d'aéroport inconnus : ${roster.unknownPlaces.join(', ')}. Ces séjours seront créés
        en « Autre » — corrige le pays à la main ensuite.
      </div>` : ''}

      ${dupes ? `<div class="notice">${dupes} séjour${dupes > 1 ? 's' : ''} déjà enregistré${dupes > 1 ? 's' : ''} ${dupes > 1 ? 'seront ignorés' : 'sera ignoré'}.</div>` : ''}`;

    $('#import-confirm').disabled = fresh.length === 0;
    $('#import-confirm').textContent = fresh.length
      ? `Enregistrer ${fresh.length} séjour${fresh.length > 1 ? 's' : ''}`
      : 'Rien de nouveau à enregistrer';
    openSheet('dlg-import');

  } catch (err) {
    console.error(err);
    toast(err.message || 'Lecture du planning impossible.', 5000);
  } finally {
    button.textContent = label;
  }
}

async function importPayslips(files, button) {
  const label = button.textContent;
  const parsed = [];
  const errors = [];

  try {
    for (const file of files) {
      button.textContent = `Lecture de ${file.name}…`;
      try {
        parsed.push(parsePayslipPdf(await pdfItems(file)));
      } catch (err) {
        errors.push(`${file.name} : ${err.message}`);
      }
    }
    if (!parsed.length) {
      toast(errors[0] || 'Aucun bulletin lisible.', 5000);
      return;
    }

    const existing = await db.all('payslips');
    const byMonth = Object.fromEntries(existing.map(p => [p.month, p]));

    pendingImport = {
      kind: 'payslip',
      apply: async () => {
        for (const p of parsed) {
          const previous = byMonth[p.month];
          // Un bulletin sans taux reprend celui du mois le plus proche
          const rate = p.rate
            || previous?.rate
            || parsed.find(o => o.rate)?.rate
            || settings.rates[p.currency]
            || 1;
          await db.put('payslips', {
            id: previous?.id || uid(),
            month: p.month,
            year: p.year,
            employer: p.employer,
            currency: p.currency,
            rate,
            totalCur: p.totalCur,
            totalEur: p.totalEur,
            taxableBase: p.taxableBase,
            social: p.social,
            allowance: p.allowance,
            taxPaid: p.taxPaid,
            taxDisputed: previous?.taxDisputed ?? false,
            net: p.net,
            source: previous?.source || 'CZ',
            receiptIds: previous?.receiptIds || [],
            updatedAt: Date.now()
          });
        }
        return `${parsed.length} bulletin${parsed.length > 1 ? 's' : ''} enregistré${parsed.length > 1 ? 's' : ''}.`;
      }
    };

    const monthName = (m) => {
      const names = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                     'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
      return `${names[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
    };

    $('#import-title').textContent = parsed.length > 1 ? 'Bulletins détectés' : 'Bulletin détecté';
    $('#import-body').innerHTML = parsed.map(p => {
      // Le taux du bulletin sert à afficher chaque ligne dans les deux monnaies
      const r = p.rate || byMonth[p.month]?.rate || parsed.find(o => o.rate)?.rate || settings.rates[p.currency] || 0;
      const dual = (v) => r
        ? `${num(v)} <span style="color:var(--ink-3)">/</span> ${num(v * r)} €`
        : num(v);
      return `
      <div class="panel" style="margin-bottom:12px">
        <div class="panel-head">
          <h2 style="text-transform:capitalize">${monthName(p.month)}</h2>
          <span class="hint">${p.currency}${byMonth[p.month] ? ' · remplace l\'existant' : ''}</span>
        </div>
        <table class="grid">
          <tbody>
            <tr><td>Base imposable /106</td><td class="num">${dual(p.taxableBase)}</td></tr>
            <tr><td>Cotisations /350 + /360</td><td class="num">${dual(p.social)}</td></tr>
            <tr><td>Per diem 202F</td><td class="num">${dual(p.allowance)}</td></tr>
            <tr><td>Impôt /401</td><td class="num">${dual(p.taxPaid)}</td></tr>
            <tr><td>Virement /559</td><td class="num">${dual(p.net)}</td></tr>
          </tbody>
          <tfoot><tr><td>Base retenue pour la France</td><td class="num">${dual(p.taxableBase - p.social)}</td></tr></tfoot>
        </table>
        <p class="verdict-note" style="margin-top:10px;color:${p.check.ok ? 'var(--gain)' : 'var(--warn)'}">
          ${p.check.ok
            ? 'Recoupement correct avec le virement.'
            : `Écart de ${num(Math.abs(p.check.diff))} ${p.currency} avec le virement — à vérifier après import.`}
        </p>
        <p class="verdict-note" style="margin-top:4px">
          ${p.rate
            ? `Taux appliqué par l'employeur, relevé sur le bulletin : 1 € = ${num(1 / p.rate, 3)} ${p.currency}.`
            : `Aucun taux sur ce bulletin. Conversion au taux de ${r ? `1 € = ${num(1 / r, 3)} ${p.currency}` : 'défaut'}, repris d'un autre mois.`}
        </p>
      </div>`;
    }).join('')
      + (errors.length ? `<div class="notice alert">${errors.map(escapeHtml).join('<br>')}</div>` : '');

    $('#import-confirm').disabled = false;
    $('#import-confirm').textContent = `Enregistrer ${parsed.length} bulletin${parsed.length > 1 ? 's' : ''}`;
    openSheet('dlg-import');

  } catch (err) {
    console.error(err);
    toast(err.message || 'Lecture du bulletin impossible.', 5000);
  } finally {
    button.textContent = label;
  }
}

async function confirmImport() {
  if (!pendingImport) return;
  const btn = $('#import-confirm');
  btn.disabled = true;
  try {
    const message = await pendingImport.apply();
    pendingImport = null;
    $('#dlg-import').close();
    await rebuildYears();
    await refresh();
    toast(message, 3500);
  } catch (err) {
    console.error(err);
    toast('Enregistrement impossible : ' + err.message);
    btn.disabled = false;
  }
}

/* ===========================================================
   Initialisation
   =========================================================== */

async function init() {
  await loadSettings();
  applyTheme();

  // Référentiels dans les listes déroulantes
  fillSelect($('#ex-country'), COUNTRIES, 'code', 'name');
  fillSelect($('#tr-country'), COUNTRIES, 'code', 'name');
  const currencyOptions = CURRENCIES.map(c => `<option value="${c}">${c}</option>`).join('');
  $('#ex-currency').innerHTML = currencyOptions;
  $('#ps-currency').innerHTML = currencyOptions;
  $('#ex-categories').innerHTML = CATEGORIES.map(c =>
    `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="false" title="${escapeHtml(c.hint)}">${escapeHtml(c.label)}</button>`
  ).join('');

  // Années disponibles
  const years = await knownYears();
  if (!years.includes(state.year)) years.unshift(state.year);
  $('#year-picker').innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
  $('#year-picker').value = state.year;

  bindEvents();
  switchView('board');

  // Demande de persistance : évite que Safari purge les données après inactivité
  if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
    navigator.storage.persist().catch(() => {});
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
  }
}

function bindEvents() {
  // Navigation
  $$('.tabbar button').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

  $('#year-picker').addEventListener('change', e => {
    state.year = Number(e.target.value);
    refresh();
  });

  $('#quick-add').addEventListener('click', () => {
    if (state.view === 'trips') openTrip(null);
    else openExpense(null);
  });

  $('#open-settings').addEventListener('click', openSettings);

  // Imports PDF
  $('#roster-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) await importRoster(file, $('label[for="roster-file"]'));
    e.target.value = '';
  });
  $('#payslip-file').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    if (files.length) await importPayslips(files, $('label[for="payslip-file"]'));
    e.target.value = '';
  });
  $('#import-confirm').addEventListener('click', confirmImport);
  $('#add-trip').addEventListener('click', () => openTrip(null));
  $('#add-payslip').addEventListener('click', () => openPayslip(null));
  $('#add-revenue').addEventListener('click', () => openRevenue(null));

  // Ouverture d'une ligne
  document.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-expense],[data-trip],[data-payslip],[data-revenue]');
    if (!row) return;
    if (row.dataset.expense) openExpense(await db.get('expenses', row.dataset.expense));
    else if (row.dataset.trip) openTrip(await db.get('trips', row.dataset.trip));
    else if (row.dataset.payslip) openPayslip(await db.get('payslips', row.dataset.payslip));
    else if (row.dataset.revenue) openRevenue(await db.get('revenues', row.dataset.revenue));
  });

  // Filtres et recherche
  $('#expense-filters').addEventListener('click', e => {
    const chip = e.target.closest('[data-filter]');
    if (!chip) return;
    state.filter = chip.dataset.filter;
    renderExpenses();
  });
  $('#expense-search').addEventListener('input', e => {
    state.search = e.target.value.trim();
    renderExpenses();
  });

  // Chips de catégorie
  $('#ex-categories').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    $$('#ex-categories .chip').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
  });

  // Conversion de devise
  $('#ex-currency').addEventListener('change', updateConversionHint);
  $('#ex-amount').addEventListener('input', updateConversionHint);

  // Aperçu du bulletin recalculé à chaque frappe
  ['#ps-total-cur', '#ps-total-eur'].forEach(sel =>
    $(sel).addEventListener('input', syncRateFromTotals));

  ['#ps-currency', '#ps-rate', '#ps-base', '#ps-social', '#ps-allowance', '#ps-tax', '#ps-net']
    .forEach(sel => {
      $(sel).addEventListener('input', updatePayslipPreview);
      $(sel).addEventListener('change', updatePayslipPreview);
    });

  // Nuitées recalculées quand les dates changent
  $('#tr-start').addEventListener('change', () => { $('#tr-nights').value = autoNights(); });
  $('#tr-end').addEventListener('change', () => { $('#tr-nights').value = autoNights(); });

  // Fichiers
  const fileInputs = [
    ['#ex-camera', 'ex-receipts'], ['#ex-import', 'ex-receipts'],
    ['#ps-camera', 'ps-receipts'], ['#ps-import', 'ps-receipts'],
    ['#rv-camera', 'rv-receipts'], ['#rv-import', 'rv-receipts']
  ];
  for (const [sel, box] of fileInputs) {
    $(sel).addEventListener('change', async (e) => {
      await handleFiles([...e.target.files], box);
      e.target.value = '';
    });
  }

  // Retrait / consultation d'une pièce
  document.addEventListener('click', async (e) => {
    const kill = e.target.closest('[data-kill]');
    if (kill) {
      e.stopPropagation();
      const id = kill.dataset.kill;
      await db.remove('receipts', id);
      state.sheetReceipts = state.sheetReceipts.filter(r => r.id !== id);
      renderReceiptStrip(kill.closest('.receipts').id);
      return;
    }
    const thumb = e.target.closest('[data-receipt]');
    if (thumb && !thumb.closest('dialog[open]')?.id.includes('viewer')) {
      viewReceipt(thumb.dataset.receipt);
    }
  });

  // Enregistrement des feuilles
  const forms = [
    ['#form-expense', saveExpense], ['#form-trip', saveTrip],
    ['#form-payslip', savePayslip], ['#form-revenue', saveRevenue],
    ['#form-settings', saveSettings]
  ];
  for (const [sel, save] of forms) {
    $(sel).addEventListener('submit', async (e) => {
      e.preventDefault();
      const ok = await save();
      if (!ok) return;
      if (sel === '#form-settings') await loadSettings();
      e.target.closest('dialog').close();
      await rebuildYears();
      await refresh();
      toast('Enregistré.');
    });
  }

  // Suppressions
  const deletions = [
    ['#ex-delete', 'expenses', 'Supprimer cette dépense et ses justificatifs ?'],
    ['#tr-delete', 'trips', 'Supprimer ce séjour ?'],
    ['#ps-delete', 'payslips', 'Supprimer ce bulletin ?'],
    ['#rv-delete', 'revenues', 'Supprimer cette recette ?']
  ];
  for (const [sel, store, question] of deletions) {
    $(sel).addEventListener('click', async () => {
      if (!confirm(question)) return;
      const rec = await db.get(store, state.editing);
      for (const rid of rec?.receiptIds || []) await db.remove('receipts', rid);
      await db.remove(store, state.editing);
      state.sheetIsNew = false;
      $(sel).closest('dialog').close();
      await refresh();
      toast('Supprimé.');
    });
  }

  // Fermeture
  $$('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  // Purge des pièces abandonnées : uniquement sur les feuilles de saisie.
  // La visionneuse s'ouvre par-dessus une feuille ouverte et ne doit rien effacer.
  ['#dlg-expense', '#dlg-trip', '#dlg-payslip', '#dlg-revenue']
    .forEach(sel => $(sel).addEventListener('close', discardPendingReceipts));

  // Fermeture par appui sur le fond
  $$('dialog.sheet').forEach(d => d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  }));

  // Exports
  $('#export-pdf').addEventListener('click', e => runExport('pdf', e.currentTarget));
  $('#export-csv').addEventListener('click', e => runExport('csv', e.currentTarget));
  $('#export-zip').addEventListener('click', e => runExport('zip', e.currentTarget));
  $('#backup-now').addEventListener('click', e => runBackup(e.currentTarget));

  $('#copy-detail').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(reportDetailText());
      toast('Détail copié.');
    } catch {
      toast('Copie impossible sur ce navigateur.');
    }
  });

  // Restauration
  $('#restore-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) {
      e.target.value = '';
      return;
    }
    try {
      toast('Restauration en cours…', 5000);
      const res = await restoreBackup(file, 'replace');
      await loadSettings();
      applyTheme();
      await rebuildYears();
      await refresh();
      toast(`${res.expenses} dépenses et ${res.receipts} justificatifs restaurés.`, 4000);
    } catch (err) {
      console.error(err);
      toast('Restauration impossible : ' + err.message, 4000);
    }
    e.target.value = '';
  });

  // Persistance et effacement
  $('#st-persist').addEventListener('click', async () => {
    const granted = await navigator.storage?.persist?.();
    toast(granted ? 'Données protégées.' : 'Le navigateur a refusé la demande.');
    updateSettingsStorage();
  });

  $('#st-wipe').addEventListener('click', async () => {
    if (!confirm('Effacer définitivement toutes les données de cette application ?')) return;
    if (!confirm('Confirme une dernière fois : cette action est irréversible.')) return;
    await db.wipeAll();
    await loadSettings();
    $('#dlg-settings').close();
    await rebuildYears();
    await refresh();
    toast('Toutes les données ont été effacées.');
  });
}

async function rebuildYears() {
  const years = await knownYears();
  if (!years.includes(state.year)) years.push(state.year);
  years.sort((a, b) => b - a);
  const picker = $('#year-picker');
  picker.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
  picker.value = state.year;
}

init().catch(err => {
  console.error(err);
  document.body.innerHTML = `<div style="padding:40px;font-family:system-ui">
    <h1>L'application n'a pas pu démarrer</h1>
    <p>${escapeHtml(err.message)}</p>
    <p style="color:#888">Vérifie que le navigateur autorise le stockage local. En navigation privée, IndexedDB est indisponible sur certains navigateurs.</p>
  </div>`;
});
