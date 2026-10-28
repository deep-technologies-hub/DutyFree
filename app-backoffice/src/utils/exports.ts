/**
 * Génération des exports Excel / PDF du backoffice, à partir des données réelles
 * de l'organisation connectée. L'en-tête porte le nom de la boutique.
 */
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type Cell = string | number | null | undefined;

export const METHODES: Record<string, string> = {
  especes: 'Espèces',
  carte: 'Carte',
  mobile_money: 'Mobile Money',
};

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface Sheet {
  name: string;
  headers: string[];
  rows: Cell[][];
  widths?: number[];
  /** Ligne de total ajoutée en gras en fin de tableau */
  total?: Cell[];
}

export async function downloadExcel(opts: {
  boutique: string; title: string; periode?: string; filename: string; sheets: Sheet[];
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = opts.boutique;
  wb.created = new Date();

  for (const sheet of opts.sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31));
    const cols = sheet.headers.length;

    ws.mergeCells(1, 1, 1, cols);
    const titre = ws.getCell('A1');
    titre.value = opts.boutique.toUpperCase();
    titre.font = { bold: true, size: 13 };
    titre.alignment = { horizontal: 'center' };

    ws.mergeCells(2, 1, 2, cols);
    const sous = ws.getCell('A2');
    sous.value = [opts.title, opts.periode && `Période : ${opts.periode}`, `Généré le ${new Date().toLocaleString('fr-FR')}`]
      .filter(Boolean).join(' | ');
    sous.font = { size: 9, italic: true, color: { argb: 'FF556680' } };
    sous.alignment = { horizontal: 'center' };
    ws.addRow([]);

    const head = ws.addRow(sheet.headers);
    head.eachCell(c => {
      c.font = { bold: true, size: 11 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5C842' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    if (sheet.rows.length === 0) {
      ws.addRow(['Aucune donnée sur la période']).getCell(1).font = { italic: true, color: { argb: 'FF8090A0' } };
    }
    sheet.rows.forEach(r => ws.addRow(r).eachCell(c => {
      c.font = { size: 10 };
      c.border = { bottom: { style: 'thin', color: { argb: 'FFE8ECF4' } } };
    }));
    if (sheet.total) {
      ws.addRow(sheet.total).eachCell(c => {
        c.font = { bold: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0EDE6' } };
      });
    }
    ws.columns = sheet.headers.map((h, i) => ({ width: sheet.widths?.[i] ?? Math.max(12, h.length + 4) }));
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    opts.filename,
  );
}

export function downloadPdf(opts: {
  boutique: string; title: string; periode?: string; filename: string;
  headers: string[]; rows: Cell[][]; total?: Cell[];
  landscape?: boolean;
  /** Bloc de signatures (ex. visa direction / visa douane) */
  visas?: string[];
}) {
  const doc = new jsPDF({ orientation: opts.landscape ? 'landscape' : 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFontSize(9); doc.setTextColor(120, 120, 120);
  doc.text(opts.boutique.toUpperCase(), pageW / 2, 14, { align: 'center' });
  doc.setFontSize(16); doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'bold');
  doc.text(opts.title, pageW / 2, 26, { align: 'center' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
  doc.text([opts.periode && `Période : ${opts.periode}`, `Généré le ${new Date().toLocaleString('fr-FR')}`]
    .filter(Boolean).join('  |  '), pageW / 2, 33, { align: 'center' });
  doc.setDrawColor(220, 200, 100); doc.setLineWidth(0.5); doc.line(14, 37, pageW - 14, 37);

  const str = (r: Cell[]) => r.map(c => (c === null || c === undefined ? '' : String(c)));
  autoTable(doc, {
    startY: 44,
    head: [opts.headers],
    body: opts.rows.length ? opts.rows.map(str) : [[{ content: 'Aucune donnée sur la période', colSpan: opts.headers.length }]],
    foot: opts.total ? [str(opts.total)] : undefined,
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [245, 200, 66], textColor: [0, 0, 0], fontStyle: 'bold' },
    footStyles: { fillColor: [240, 237, 230], textColor: [0, 0, 0], fontStyle: 'bold' },
  });

  if (opts.visas?.length) {
    const y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
    const w = (pageW - 28) / opts.visas.length;
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    opts.visas.forEach((v, i) => {
      const x = 14 + i * w;
      doc.text(v, x, y);
      doc.line(x, y + 18, x + w - 10, y + 18);
    });
  }

  doc.save(opts.filename);
}

/** Montant encaissé d'une vente en XOF (paiements nets de la monnaie rendue). Les décimaux DRF arrivent en chaînes. */
export function venteXof(v: { total: number | string; devise: string; paiements?: { montant_xof: number | string; monnaie_rendue: number | string }[] }) {
  if (v.paiements?.length) {
    return v.paiements.reduce((s, p) => s + Number(p.montant_xof) - Number(p.monnaie_rendue || 0), 0);
  }
  return v.devise === 'XOF' ? Number(v.total) : 0;
}

/** Libellé des moyens de paiement d'une vente (« Carte + Espèces ») */
export function methodesVente(v: { paiements?: { methode: string }[] }) {
  return [...new Set((v.paiements ?? []).map(p => METHODES[p.methode] ?? p.methode))].join(' + ') || '—';
}

export const fmtNombre =(n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));
export const fmtDateHeure = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
