/* ===========================================================
   exports.js — sorties de l'application
   CSV, PDF récapitulatif, dossier ZIP, sauvegarde iCloud.
   Les bibliothèques sont chargées à la demande et mises en cache
   par le service worker pour rester disponibles hors ligne.
   =========================================================== */

const CDN = {
  jspdf:     'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  autotable: 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
  jszip:     'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
};

const _loaded = new Set();

function loadScript(url) {
  if (_loaded.has(url)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => { _loaded.add(url); resolve(); };
    s.onerror = () => reject(new Error('Chargement impossible : ' + url));
    document.head.appendChild(s);
  });
}

async function ensurePdf() {
  await loadScript(CDN.jspdf);
  await loadScript(CDN.autotable);
}

async function ensureZip() {
  await loadScript(CDN.jszip);
}

/* ---------- Partage / téléchargement ---------- */

/**
 * Sur iPhone, ouvre la feuille de partage : « Enregistrer dans Fichiers » permet
 * de déposer le fichier dans iCloud Drive. Ailleurs, téléchargement classique.
 */
async function deliver(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
      // sinon on retombe sur le téléchargement
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

/* ---------- CSV ---------- */

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

// Séparateur point-virgule et BOM : Excel en configuration française ouvre
// le fichier correctement sans étape d'import.
function toCsv(rows) {
  return '\uFEFF' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
}

function expensesCsv(data) {
  const rows = [[
    'Date', 'Poste', 'Libellé', 'Montant', 'Devise', 'Montant EUR',
    'Quote-part %', 'Déductible EUR', 'Pays', 'Paiement', 'Rattachement',
    'Remboursé', 'Justificatifs', 'Note'
  ]];

  const sorted = [...data.expenses].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of sorted) {
    rows.push([
      e.date,
      CAT_BY_ID[e.category]?.label || e.category,
      e.label || '',
      num(e.amount),
      e.currency || 'EUR',
      num(toEur(e.amount, e.currency)),
      e.share ?? 100,
      num(deductibleAmount(e)),
      COUNTRY_BY_CODE[e.country] || e.country || '',
      e.payment || '',
      e.attach === 'aoa' ? 'Air One Aero' : 'Salaire',
      e.reimbursed ? 'oui' : 'non',
      e.receiptIds?.length || 0,
      e.notes || ''
    ]);
  }

  rows.push([]);
  rows.push(['Total déductible', '', '', '', '', '', '', num(data.deductible)]);
  return toCsv(rows);
}

function tripsCsv(data) {
  const rows = [['Départ', 'Retour', 'Pays', 'Escale', 'Motif', 'Jours', 'Nuits', 'Note']];
  const sorted = [...data.trips].sort((a, b) => a.start.localeCompare(b.start));

  for (const t of sorted) {
    const s = new Date(t.start + 'T12:00:00');
    const e = new Date((t.end || t.start) + 'T12:00:00');
    const days = Math.round((e - s) / 86400000) + 1;
    rows.push([
      t.start, t.end || t.start,
      COUNTRY_BY_CODE[t.country] || t.country,
      t.place || '',
      PURPOSES[t.purpose] || t.purpose || '',
      days, t.nights ?? Math.max(0, days - 1),
      t.notes || ''
    ]);
  }

  rows.push([]);
  rows.push(['Décompte par pays']);
  rows.push(['Pays', 'Jours de présence', 'Nuits hors domicile']);
  for (const c of data.countries.rows) rows.push([c.name, c.days, c.nights]);
  rows.push(['Total', data.countries.totalDays, data.countries.totalNights]);
  rows.push(['dont jours en déplacement', data.countries.awayDays]);
  rows.push(['dont jours au domicile', data.countries.homeDays]);
  return toCsv(rows);
}

function revenuesCsv(data) {
  const rows = [['Date', 'Client', 'Facture', 'Catégorie fiscale', 'Montant EUR']];
  const sorted = [...data.revenues].sort((a, b) => a.date.localeCompare(b.date));
  for (const r of sorted) {
    rows.push([r.date, r.client || '', r.invoice || '', REGIMES[r.regime]?.label || r.regime, num(r.amount)]);
  }
  rows.push([]);
  for (const r of data.revenueRows) {
    rows.push([`Case ${r.box}`, r.label, '', 'CA brut à reporter', num(r.total)]);
  }
  return toCsv(rows);
}

function payslipsCsv(data) {
  const rows = [[
    'Mois', 'Employeur', 'Pays', 'Devise', 'Taux EUR',
    'Base imposable', 'Cotisations salariales', 'Per diem non imposable', 'Impôt payé sur place',
    'Base France EUR', 'Per diem EUR', 'Impôt payé EUR'
  ]];
  const sorted = [...data.payslips].sort((a, b) => (a.month || '').localeCompare(b.month || ''));

  for (const p of sorted) {
    const e = payslipEur(p);
    rows.push([
      p.month, p.employer || '', p.source || '', p.currency || 'EUR', num(e.rate, 6),
      num(p.taxableBase ?? p.taxable ?? 0), num(p.social || 0), num(p.allowance || 0), num(p.taxPaid ?? p.withheld ?? 0),
      num(e.frenchBase), num(e.allowance), num(e.taxPaid)
    ]);
  }

  rows.push([]);
  rows.push(['Total base retenue pour la déclaration française', '', '', '', '', '', '', '', '', num(data.taxableSalary)]);
  rows.push(['Total per diem non imposable', '', '', '', '', '', '', '', '', '', num(data.allowances)]);
  rows.push(['Total impôt payé à l\'étranger', '', '', '', '', '', '', '', '', '', '', num(data.foreignTax)]);
  return toCsv(rows);
}

/* ---------- PDF récapitulatif ---------- */

/**
 * Nettoie le texte destiné au PDF.
 *
 * Les polices standard de jsPDF sont limitées au jeu Latin-1. Le format
 * français produit une espace insécable étroite comme séparateur de milliers,
 * absente de ce jeu : elle est alors rendue par un glyphe arbitraire, et
 * « 11 467,68 € » s'affiche « 11 /467,68 € ».
 */
function pdfSafe(value) {
  return String(value ?? '')
    .replace(/[\u202F\u2009\u00A0]/g, ' ')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...');
  // Le symbole euro figure bien dans WinAnsi : inutile de le remplacer.
}

const pEur  = (n) => pdfSafe(eur(n));
const pEur0 = (n) => pdfSafe(eur0(n));
const pNum  = (n, d) => pdfSafe(num(n, d));

/** Options communes à tous les tableaux, avec nettoyage systématique. */
const tableBase = {
  theme: 'grid',
  styles: { fontSize: 8.6, cellPadding: 2.4, lineColor: [222, 226, 232], lineWidth: 0.15,
            textColor: [28, 32, 38] },
  headStyles: { fillColor: [38, 48, 62], textColor: 255, fontSize: 8.4, fontStyle: 'bold',
                cellPadding: 2.6 },
  alternateRowStyles: { fillColor: [248, 249, 251] },
  footStyles: { fillColor: [236, 238, 242], textColor: [20, 24, 30], fontStyle: 'bold' },
  didParseCell: (d) => {
    if (Array.isArray(d.cell.text)) d.cell.text = d.cell.text.map(pdfSafe);
  }
};

async function buildPdf(data) {
  await ensurePdf();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const M = 15;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const owner = settings.name || '';
  let y = M;

  /** Réserve la place nécessaire, en changeant de page seulement si besoin. */
  const need = (mm) => { if (y + mm > H - 20) { doc.addPage(); y = M; } };

  const heading = (text) => {
    need(18);
    doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(24, 30, 38);
    doc.text(pdfSafe(text), M, y);
    y += 1.8;
    doc.setDrawColor(196, 202, 210).setLineWidth(0.4).line(M, y, W - M, y);
    y += 5.5;
  };

  const note = (text) => {
    doc.setFont('helvetica', 'italic').setFontSize(7.6).setTextColor(120, 126, 134);
    const lines = doc.splitTextToSize(pdfSafe(text), W - 2 * M);
    doc.text(lines, M, y);
    y += lines.length * 3.4;
  };

  const table = (options) => {
    doc.autoTable({ ...tableBase, ...options, startY: y, margin: { left: M, right: M } });
    y = doc.lastAutoTable.finalY + 7;
  };

  // ---------- En-tête ----------
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(20, 26, 34);
  doc.text(pdfSafe(`Frais reels ${data.year}`), M, y);
  y += 6.5;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110, 116, 124);
  const sub = [owner, settings.home && `Domicile : ${settings.home}`, settings.base && `Base : ${settings.base}`]
    .filter(Boolean).join('   -   ');
  if (sub) { doc.text(pdfSafe(sub), M, y); y += 4.2; }
  doc.text(pdfSafe(`Document etabli le ${new Date().toLocaleDateString('fr-FR')}`), M, y);
  y += 9;

  // ---------- Synthèse ----------
  heading('Synthese');
  const synth = [
    ['Salaire net imposable declare', pEur(data.declaredSalary)],
    [`Abattement forfaitaire de 10 % (plancher ${pEur0(data.abatementBounds.min)}, plafond ${pEur0(data.abatementBounds.max)})`,
     pEur(data.abatement)]
  ];
  if (data.courrierDeduction) {
    synth.push([`Frais en courrier - ${data.courrier.nights} nuits d'escale`, pEur(data.courrierDeduction)]);
    synth.push(['Autres frais sur justificatifs', pEur(data.expensesDeductible)]);
  }
  synth.push(['Total des frais reels', pEur(data.deductible)]);
  synth.push([
    data.advantage >= 0 ? 'Gain de base imposable en optant pour le reel' : "Ecart en faveur de l'abattement",
    pEur(Math.abs(data.advantage))
  ]);

  table({
    theme: 'plain',
    styles: { ...tableBase.styles, cellPadding: { top: 1.7, bottom: 1.7, left: 0, right: 0 } },
    columnStyles: { 0: { cellWidth: 118 }, 1: { halign: 'right', fontStyle: 'bold' } },
    body: synth
  });

  // ---------- Salaire de source étrangère ----------
  if (data.foreignSalary > 0) {
    heading('Salaire de source etrangere');
    table({
      theme: 'plain',
      styles: { ...tableBase.styles, cellPadding: { top: 1.7, bottom: 1.7, left: 0, right: 0 } },
      columnStyles: { 0: { cellWidth: 118 }, 1: { halign: 'right', fontStyle: 'bold' } },
      body: [
        ['Base imposable locale, convertie en euros', pEur(data.grossSalary)],
        ['Cotisations sociales salariales obligatoires', pEur(data.socialPaid)],
        ['Base retenue pour la declaration francaise', pEur(data.taxableSalary)],
        ['Indemnites de deplacement non imposables localement', pEur(data.allowances)],
        ["Impot effectivement paye a l'etranger", pEur(data.foreignTax)]
      ]
    });
    y -= 3;
    note("Conversion au taux porte par chaque bulletin. Traitement conventionnel a confirmer.");
    y += 5;
  }

  // ---------- Détail par poste ----------
  const posteRows = [];
  if (data.courrierDeduction) {
    posteRows.push([
      `Frais en courrier (${data.courrier.nights} nuits)`,
      `${data.courrier.counted} sejours`,
      pEur(data.courrierDeduction)
    ]);
  }
  for (const c of data.categories) {
    const count = data.expenses.filter(e =>
      e.category === c.id && e.attach !== 'aoa' && !e.reimbursed).length;
    posteRows.push([c.label, String(count), pEur(c.total)]);
  }

  if (posteRows.length) {
    heading('Detail par poste de depense');
    table({
      columnStyles: { 1: { halign: 'right', cellWidth: 28 }, 2: { halign: 'right', cellWidth: 32 } },
      head: [['Poste', 'Nombre', 'Montant']],
      body: posteRows,
      foot: [['Total', '', pEur(data.deductible)]]
    });
  }

  // ---------- Présence par pays ----------
  if (data.countries.rows.length) {
    heading('Presence par pays');
    const head = ['Pays', 'Jours', 'Nuits hors domicile'];
    if (data.courrierOn) head.push('Forfait escale');

    table({
      columnStyles: {
        1: { halign: 'right', cellWidth: 24 },
        2: { halign: 'right', cellWidth: 34 },
        3: { halign: 'right', cellWidth: 32 }
      },
      head: [head],
      body: data.countries.rows.map(c => {
        const row = [c.name, String(c.days), c.nights ? String(c.nights) : '-'];
        if (data.courrierOn) {
          const cr = data.courrier.rows.find(x => x.code === c.code);
          row.push(cr ? pEur(cr.total) : '-');
        }
        return row;
      }),
      foot: [data.courrierOn
        ? ['Total', String(data.countries.totalDays), String(data.countries.totalNights), pEur(data.courrier.gross)]
        : ['Total', String(data.countries.totalDays), String(data.countries.totalNights)]]
    });
    y -= 3;
    note(
      `${data.countries.awayDays} jours en deplacement pour ${data.countries.totalNights} nuits hors domicile, ` +
      `et ${data.countries.homeDays} jours au domicile. Une nuit passee chez soi n'est pas une nuitee ` +
      `au sens des frais professionnels : la ligne France ne porte donc aucune nuit.`
    );
    y += 5;
  }

  // ---------- Chiffre d'affaires ----------
  if (data.revenueRows.length) {
    heading("Chiffre d'affaires Air One Aero");
    table({
      columnStyles: {
        0: { cellWidth: 18 },
        2: { halign: 'right', cellWidth: 34 },
        3: { halign: 'right', cellWidth: 36 }
      },
      head: [['Case', 'Categorie', 'CA encaisse', 'Apres abattement']],
      body: data.revenueRows.map(r => [r.box || '', r.label, pEur(r.total), pEur(r.net)]),
      foot: [['', 'Total', pEur(data.turnover), pEur(data.netMicro)]]
    });
  }

  // ---------- Journal des dépenses ----------
  const journal = [...data.expenses]
    .filter(e => e.attach !== 'aoa')
    .sort((a, b) => a.date.localeCompare(b.date));

  if (journal.length) {
    heading('Journal des depenses');
    table({
      styles: { ...tableBase.styles, fontSize: 7.6, cellPadding: 1.8 },
      headStyles: { ...tableBase.headStyles, fontSize: 7.6 },
      columnStyles: {
        0: { cellWidth: 18 }, 1: { cellWidth: 30 }, 3: { cellWidth: 22 },
        4: { cellWidth: 24, halign: 'right' }, 5: { cellWidth: 16, halign: 'center' }
      },
      head: [['Date', 'Poste', 'Libelle', 'Pays', 'Deductible', 'Piece']],
      body: journal.map((e, i) => [
        e.date.split('-').reverse().join('/'),
        CAT_BY_ID[e.category]?.label || e.category,
        e.label || '-',
        COUNTRY_BY_CODE[e.country] || '',
        e.reimbursed ? 'rembourse' : pEur(deductibleAmount(e)),
        e.receiptIds?.length ? `P${String(i + 1).padStart(3, '0')}` : '-'
      ]),
      foot: [['', '', '', 'Total', pEur(data.expensesDeductible), '']]
    });
  }

  // ---------- Pieds de page ----------
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(222, 226, 232).setLineWidth(0.2);
    doc.line(M, H - 12, W - M, H - 12);
    doc.setFont('helvetica', 'normal').setFontSize(7.2).setTextColor(150, 155, 162);
    doc.text(pdfSafe(`Frais reels ${data.year}${owner ? ' - ' + owner : ''}`), M, H - 8);
    doc.text(`${p} / ${pages}`, W - M, H - 8, { align: 'right' });
  }

  return doc.output('blob');
}

/* ---------- Dossier ZIP annuel ---------- */

const slug = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 40)
  .toLowerCase() || 'sans-libelle';

async function buildZip(data, onProgress) {
  await ensureZip();
  const zip = new JSZip();
  const root = `frais-reels-${data.year}`;

  onProgress?.('Récapitulatif PDF…');
  zip.file(`${root}/recapitulatif-${data.year}.pdf`, await buildPdf(data));

  onProgress?.('Tableaux CSV…');
  zip.file(`${root}/depenses-${data.year}.csv`, expensesCsv(data));
  zip.file(`${root}/sejours-${data.year}.csv`, tripsCsv(data));
  if (data.payslips.length) zip.file(`${root}/bulletins-${data.year}.csv`, payslipsCsv(data));
  if (data.revenues.length) zip.file(`${root}/recettes-${data.year}.csv`, revenuesCsv(data));

  onProgress?.('Justificatifs…');
  const sorted = [...data.expenses]
    .filter(e => e.attach !== 'aoa')
    .sort((a, b) => a.date.localeCompare(b.date));

  let index = 0;
  for (const e of sorted) {
    index++;
    if (!e.receiptIds?.length) continue;
    let sub = 0;
    for (const rid of e.receiptIds) {
      const rec = await db.get('receipts', rid);
      if (!rec) continue;
      sub++;
      const ext = rec.mime === 'application/pdf' ? 'pdf' : 'jpg';
      const suffix = e.receiptIds.length > 1 ? `-${sub}` : '';
      const name = `P${String(index).padStart(3, '0')}_${e.date}_${slug(CAT_BY_ID[e.category]?.label)}_${slug(e.label)}_${num(toEur(e.amount, e.currency)).replace(/\s/g, '')}eur${suffix}.${ext}`;
      zip.file(`${root}/justificatifs/${name}`, rec.blob);
    }
  }

  // Justificatifs des revenus, dans un dossier séparé
  for (const list of [
    { rows: data.payslips, dir: 'bulletins', key: p => `${p.month}_${slug(p.employer)}` },
    { rows: data.revenues, dir: 'factures', key: r => `${r.date}_${slug(r.invoice || r.client)}` }
  ]) {
    for (const row of list.rows) {
      for (const rid of row.receiptIds || []) {
        const rec = await db.get('receipts', rid);
        if (!rec) continue;
        const ext = rec.mime === 'application/pdf' ? 'pdf' : 'jpg';
        zip.file(`${root}/${list.dir}/${list.key(row)}.${ext}`, rec.blob);
      }
    }
  }

  onProgress?.('Compression…');
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } });
}

/* ---------- Sauvegarde et restauration ---------- */

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result.split(',')[1]);
  r.onerror = reject;
  r.readAsDataURL(blob);
});

function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** Sauvegarde intégrale, photos comprises. Un seul fichier à déposer dans iCloud Drive. */
async function buildBackup(onProgress) {
  onProgress?.('Lecture des données…');
  const payload = {
    format: 'frais-reels-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    expenses: await db.all('expenses'),
    trips:    await db.all('trips'),
    payslips: await db.all('payslips'),
    revenues: await db.all('revenues'),
    urssaf:   await db.all('urssaf'),
    settings: await db.all('settings'),
    receipts: []
  };

  onProgress?.('Encodage des justificatifs…');
  const receipts = await db.all('receipts');
  for (const r of receipts) {
    payload.receipts.push({
      id: r.id, ownerId: r.ownerId, mime: r.mime, name: r.name,
      size: r.size, createdAt: r.createdAt,
      data: await blobToBase64(r.blob)
    });
  }

  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

async function restoreBackup(file, mode = 'replace') {
  const text = await file.text();
  const payload = JSON.parse(text);
  if (payload.format !== 'frais-reels-backup') {
    throw new Error('Ce fichier n\'est pas une sauvegarde de cette application.');
  }

  if (mode === 'replace') await db.wipeAll();

  for (const key of ['expenses', 'trips', 'payslips', 'revenues', 'urssaf']) {
    for (const row of payload[key] || []) await db.put(key, row);
  }
  for (const r of payload.receipts || []) {
    await db.put('receipts', {
      id: r.id, ownerId: r.ownerId, mime: r.mime, name: r.name,
      size: r.size, createdAt: r.createdAt,
      blob: base64ToBlob(r.data, r.mime)
    });
  }
  for (const s of payload.settings || []) await db.put('settings', s);

  return {
    expenses: payload.expenses?.length || 0,
    receipts: payload.receipts?.length || 0,
    trips: payload.trips?.length || 0
  };
}
