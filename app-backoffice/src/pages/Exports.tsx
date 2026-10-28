import { useState } from 'react';
import { useBackofficeStore } from '../store/backofficeStore';
import { FileSpreadsheet, FileText, Download, RefreshCw, CheckCircle, Calendar } from 'lucide-react';
import { stockApi, ventesApi, type ApiError, type VenteListItem } from '../api';
import {
  downloadExcel, downloadPdf, venteXof, methodesVente, fmtDateHeure, fmtNombre, METHODES, type Cell,
} from '../utils/exports';

const today = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const frDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');
const STATUTS_STOCK: Record<string, string> = { ok: 'OK', bas: 'Bas', critique: 'Critique', rupture: 'Rupture' };
const STATUTS_SOMMIER: Record<string, string> = { actif: 'Actif', en_cours: "En cours d'apurement", apure: 'Apuré' };

type ExportDef = { id: string; title: string; desc: string; format: 'Excel' | 'PDF'; section: string; periode: boolean };

const EXPORTS: ExportDef[] = [
  { id: 'journal_ventes', title: 'Journal des ventes', desc: 'Chaque ticket : date, caisse, vendeur, articles, montant, paiement, passager', format: 'Excel', section: 'Ventes', periode: true },
  { id: 'synthese_ventes', title: 'Synthèse des ventes', desc: 'CA et tickets par jour, par heure, par caisse / vendeur et par moyen de paiement', format: 'Excel', section: 'Ventes', periode: true },
  { id: 'journal_paiements', title: 'Journal des paiements', desc: 'Tous les encaissements détaillés par mode et devise, monnaie rendue', format: 'Excel', section: 'Ventes', periode: true },
  { id: 'mix_produits', title: 'Mix des ventes par produit', desc: 'Quantités, CA et part du CA par article sur la période', format: 'Excel', section: 'Ventes', periode: true },
  { id: 'rapport_stock', title: 'Rapport de stock', desc: 'État actuel du stock, seuils, ruptures et valorisation au prix de vente', format: 'Excel', section: 'Stock', periode: false },
  { id: 'sommiers_djbc', title: 'État des sommiers douaniers', desc: 'Sommiers ouverts sur la période, pour transmission à la douane', format: 'PDF', section: 'Douane', periode: true },
  { id: 'taux_capture', title: 'Taux de capture passagers', desc: 'Ratio tickets / passagers par mois (données aéroport saisies)', format: 'PDF', section: 'Reporting', periode: false },
  { id: 'tickets_duplicata', title: 'Duplicata de tickets', desc: 'Liste des tickets de la période (filtrable par numéro de ticket)', format: 'PDF', section: 'Caisse', periode: true },
];

/** Agrège des lignes par clé en sommant CA et nombre de tickets. */
function grouper(ventes: VenteListItem[], cle: (v: VenteListItem) => string) {
  const map = new Map<string, { ca: number; tickets: number }>();
  for (const v of ventes) {
    const k = cle(v);
    const cur = map.get(k) ?? { ca: 0, tickets: 0 };
    cur.ca += venteXof(v);
    cur.tickets += 1;
    map.set(k, cur);
  }
  return [...map.entries()];
}

export function ExportsPage() {
  const { user } = useBackofficeStore();
  const boutique = user?.organisation?.nom || 'Duty Free';
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [ticket, setTicket] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const flash = (id: string) => { setDone(id); setTimeout(() => setDone(null), 3000); };
  const periode = `${frDate(dateFrom)} → ${frDate(dateTo)}`;
  const suffixe = `${dateFrom}_${dateTo}`;

  const ventesPeriode = () => ventesApi.listAll({ date_debut: dateFrom, date_fin: dateTo, statut: 'payee' });

  const generer = async (exp: ExportDef) => {
    const base = { boutique, title: exp.title, periode: exp.periode ? periode : undefined };

    if (exp.id === 'journal_ventes') {
      const ventes = await ventesPeriode();
      const rows: Cell[][] = ventes.map(v => [
        v.numero_ticket, fmtDateHeure(v.date_locale), v.numero_caisse, v.caissier_nom, v.nb_articles,
        Number(v.total), v.devise, Math.round(venteXof(v)), methodesVente(v),
        v.passager_nom, v.vol_reference, v.destination,
      ]);
      const total = ventes.reduce((s, v) => s + venteXof(v), 0);
      await downloadExcel({ ...base, filename: `journal_ventes_${suffixe}.xlsx`, sheets: [{
        name: 'Ventes',
        headers: ['N° ticket', 'Date', 'Caisse', 'Vendeur', 'Articles', 'Montant', 'Devise', 'Montant XOF', 'Paiement', 'Passager', 'Vol', 'Destination'],
        widths: [20, 18, 12, 22, 9, 12, 8, 14, 20, 22, 10, 16],
        rows,
        total: ['TOTAL', `${ventes.length} tickets`, '', '', ventes.reduce((s, v) => s + v.nb_articles, 0), '', '', Math.round(total)],
      }] });
    }

    else if (exp.id === 'synthese_ventes') {
      const ventes = await ventesPeriode();
      const ligne = ([k, x]: [string, { ca: number; tickets: number }]): Cell[] =>
        [k, x.tickets, Math.round(x.ca), Math.round(x.tickets ? x.ca / x.tickets : 0)];
      const headers = (premier: string) => [premier, 'Tickets', 'CA XOF', 'Ticket moyen XOF'];
      const totalCa = ventes.reduce((s, v) => s + venteXof(v), 0);
      const total: Cell[] = ['TOTAL', ventes.length, Math.round(totalCa), Math.round(ventes.length ? totalCa / ventes.length : 0)];

      const parJour = grouper(ventes, v => v.date_locale.slice(0, 10)).sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => ligne([frDate(k), x]));
      const parHeure = grouper(ventes, v => `${String(new Date(v.date_locale).getHours()).padStart(2, '0')}h`)
        .sort(([a], [b]) => a.localeCompare(b)).map(ligne);
      const parVendeur = grouper(ventes, v => `${v.numero_caisse || '—'} · ${v.caissier_nom || '—'}`)
        .sort(([, a], [, b]) => b.ca - a.ca).map(ligne);

      const paiements = new Map<string, { n: number; montant: number }>();
      for (const v of ventes) for (const p of v.paiements) {
        const k = METHODES[p.methode] ?? p.methode;
        const cur = paiements.get(k) ?? { n: 0, montant: 0 };
        cur.n += 1;
        cur.montant += Number(p.montant_xof) - Number(p.monnaie_rendue || 0);
        paiements.set(k, cur);
      }
      const totalPaiements = [...paiements.values()].reduce((s, p) => s + p.montant, 0);

      await downloadExcel({ ...base, filename: `synthese_ventes_${suffixe}.xlsx`, sheets: [
        { name: 'Par jour', headers: headers('Jour'), rows: parJour, total, widths: [14, 10, 16, 18] },
        { name: 'Par heure', headers: headers('Heure'), rows: parHeure, total, widths: [10, 10, 16, 18] },
        { name: 'Par caisse et vendeur', headers: headers('Caisse · vendeur'), rows: parVendeur, total, widths: [32, 10, 16, 18] },
        {
          name: 'Par moyen de paiement',
          headers: ['Moyen de paiement', 'Paiements', 'Encaissé XOF', 'Part (%)'],
          rows: [...paiements.entries()].sort(([, a], [, b]) => b.montant - a.montant).map(([k, p]) => [
            k, p.n, Math.round(p.montant), totalPaiements ? `${(p.montant / totalPaiements * 100).toFixed(1)} %` : '—',
          ]),
          total: ['TOTAL', [...paiements.values()].reduce((s, p) => s + p.n, 0), Math.round(totalPaiements), '100 %'],
          widths: [22, 12, 16, 10],
        },
      ] });
    }

    else if (exp.id === 'journal_paiements') {
      const ventes = await ventesPeriode();
      const rows: Cell[][] = ventes.flatMap(v => v.paiements.map(p => [
        v.numero_ticket, fmtDateHeure(v.date_locale), v.numero_caisse, METHODES[p.methode] ?? p.methode,
        Number(p.montant), p.devise, Number(p.taux_change), Math.round(Number(p.montant_xof)),
        Math.round(Number(p.monnaie_rendue || 0)), Math.round(Number(p.montant_xof) - Number(p.monnaie_rendue || 0)),
      ]));
      const net = rows.reduce((s, r) => s + Number(r[9]), 0);
      await downloadExcel({ ...base, filename: `journal_paiements_${suffixe}.xlsx`, sheets: [{
        name: 'Paiements',
        headers: ['N° ticket', 'Date', 'Caisse', 'Mode', 'Montant', 'Devise', 'Taux', 'Reçu XOF', 'Rendu XOF', 'Encaissé XOF'],
        widths: [20, 18, 12, 16, 12, 8, 10, 14, 12, 14],
        rows,
        total: ['TOTAL', `${rows.length} paiements`, '', '', '', '', '', '', '', Math.round(net)],
      }] });
    }

    else if (exp.id === 'mix_produits') {
      const ventes = await ventesPeriode();
      // Le CA de chaque ligne est converti en XOF au prorata du ticket (gère les ventes en devises)
      const produits = new Map<string, { qte: number; ca: number; tickets: Set<string> }>();
      for (const v of ventes) {
        const totalLignes = v.lignes.reduce((s, l) => s + Number(l.total), 0);
        const ratio = totalLignes ? venteXof(v) / totalLignes : 0;
        for (const l of v.lignes) {
          const cur = produits.get(l.produit_nom) ?? { qte: 0, ca: 0, tickets: new Set<string>() };
          cur.qte += Number(l.quantite);
          cur.ca += Number(l.total) * ratio;
          cur.tickets.add(v.numero_ticket);
          produits.set(l.produit_nom, cur);
        }
      }
      const totalCa = [...produits.values()].reduce((s, p) => s + p.ca, 0);
      const rows: Cell[][] = [...produits.entries()].sort(([, a], [, b]) => b.ca - a.ca).map(([nom, p], i) => [
        i + 1, nom, p.qte, p.tickets.size, Math.round(p.ca), totalCa ? `${(p.ca / totalCa * 100).toFixed(1)} %` : '—',
      ]);
      await downloadExcel({ ...base, filename: `mix_produits_${suffixe}.xlsx`, sheets: [{
        name: 'Mix produits',
        headers: ['Rang', 'Produit', 'Qté vendue', 'Tickets', 'CA XOF', 'Part du CA'],
        widths: [7, 36, 12, 10, 16, 12],
        rows,
        total: ['', 'TOTAL', rows.reduce((s, r) => s + Number(r[2]), 0), ventes.length, Math.round(totalCa), '100 %'],
      }] });
    }

    else if (exp.id === 'rapport_stock') {
      const produits = await stockApi.produits.listAll();
      const valeur = (p: { stock: number; prix_xof: number }) => Number(p.stock) * Number(p.prix_xof);
      const rows: Cell[][] = produits.map(p => [
        p.code, p.nom, p.categorie_nom || '—', p.stock, p.stock_min, p.stock_max, p.unite,
        STATUTS_STOCK[p.statut_stock] ?? p.statut_stock, Number(p.prix_xof), Math.round(valeur(p)),
      ]);
      const ruptures = produits.filter(p => p.statut_stock !== 'ok');
      await downloadExcel({ ...base, filename: `rapport_stock_${today()}.xlsx`, sheets: [
        {
          name: 'Stock',
          headers: ['Code', 'Produit', 'Catégorie', 'Stock', 'Min', 'Max', 'Unité', 'Statut', 'Prix XOF', 'Valeur XOF'],
          widths: [12, 34, 16, 9, 8, 8, 11, 11, 12, 16],
          rows,
          total: ['', 'TOTAL', '', produits.reduce((s, p) => s + Number(p.stock), 0), '', '', '', '', '', Math.round(produits.reduce((s, p) => s + valeur(p), 0))],
        },
        {
          name: 'À réapprovisionner',
          headers: ['Code', 'Produit', 'Stock', 'Min', 'Max', 'Statut', 'Qté à commander'],
          widths: [12, 34, 9, 8, 8, 11, 16],
          rows: ruptures.map(p => [p.code, p.nom, p.stock, p.stock_min, p.stock_max, STATUTS_STOCK[p.statut_stock], Math.max(0, p.stock_max - p.stock)]),
        },
      ] });
    }

    else if (exp.id === 'sommiers_djbc') {
      const sommiers = (await stockApi.sommiers.listAll())
        .filter(s => s.date_ouverture <= dateTo && (s.statut !== 'apure' || !s.date_apurement || s.date_apurement >= dateFrom));
      downloadPdf({ ...base, filename: `sommiers_${suffixe}.pdf`, landscape: true,
        headers: ['N° sommier', 'Réf. douane', 'Produit', 'Ouverture', 'Qté init.', 'Entrées', 'Sorties', 'Restant', 'Apurement', 'Statut'],
        rows: sommiers.map(s => [
          s.numero, s.reference_djbc || '—', s.produit_nom, frDate(s.date_ouverture), fmtNombre(s.quantite_initiale),
          fmtNombre(s.quantite_entree), fmtNombre(s.quantite_sortie), fmtNombre(s.quantite_restante),
          `${s.taux_apurement} %`, STATUTS_SOMMIER[s.statut] ?? s.statut,
        ]),
        visas: ['Visa de la direction', 'Visa des douanes'],
      });
    }

    else if (exp.id === 'taux_capture') {
      const data = [...await ventesApi.tauxCapture()].reverse();
      downloadPdf({ ...base, filename: `taux_capture_${today()}.pdf`,
        headers: ['Mois', 'Passagers', 'Tickets', 'Taux de capture', 'Source'],
        rows: data.map(t => [
          new Date(t.annee, t.mois - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
          fmtNombre(t.passagers), fmtNombre(t.tickets), `${t.taux} %`, t.source || '—',
        ]),
      });
    }

    else if (exp.id === 'tickets_duplicata') {
      let ventes = await ventesPeriode();
      const q = ticket.trim().toLowerCase();
      if (q) ventes = ventes.filter(v => v.numero_ticket.toLowerCase().includes(q));
      const total = ventes.reduce((s, v) => s + venteXof(v), 0);
      downloadPdf({ ...base, filename: `tickets_${suffixe}.pdf`, landscape: true,
        headers: ['N° ticket', 'Date', 'Caisse', 'Vendeur', 'Articles', 'Détail', 'Montant XOF', 'Paiement'],
        rows: ventes.map(v => [
          v.numero_ticket, fmtDateHeure(v.date_locale), v.numero_caisse, v.caissier_nom, v.nb_articles,
          v.lignes.map(l => `${l.quantite} × ${l.produit_nom}`).join(', '),
          fmtNombre(venteXof(v)), methodesVente(v),
        ]),
        total: ['TOTAL', `${ventes.length} tickets`, '', '', '', '', fmtNombre(total), ''],
      });
    }
  };

  const handleExport = async (exp: ExportDef) => {
    if (exp.periode && dateFrom > dateTo) {
      alert('La date de début doit précéder la date de fin.');
      return;
    }
    setLoading(exp.id);
    try {
      await generer(exp);
      flash(exp.id);
    } catch (e) {
      console.error(e);
      alert(`Erreur lors de la génération : ${(e as ApiError).message ?? 'réessayez'}`);
    } finally {
      setLoading(null);
    }
  };

  const sections = [...new Set(EXPORTS.map(e => e.section))];

  return (
    <div className="fade-in" style={{ padding: '36px 40px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 36 }}>
        <div className="page-eyebrow">Extraction de données</div>
        <h1 className="page-title">Exports & Rapports</h1>
        <hr className="rule" style={{ marginTop: 16 }} />
      </div>

      {/* Période */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 36, alignItems: 'center', background: 'var(--surface)', padding: '16px 20px', border: '1px solid var(--border)', borderRadius: 10 }}>
        <Calendar size={14} color="var(--gold)" />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Période</span>
        <input type="date" value={dateFrom} max={dateTo} onChange={e => setDateFrom(e.target.value)} style={{ width: 160, fontSize: 13 }} />
        <span style={{ color: 'var(--text-3)', fontSize: 13 }}>→</span>
        <input type="date" value={dateTo} min={dateFrom} onChange={e => setDateTo(e.target.value)} style={{ width: 160, fontSize: 13 }} />
        <input value={ticket} onChange={e => setTicket(e.target.value)} placeholder="N° de ticket (duplicata)" style={{ width: 200, fontSize: 13 }} />
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>
          Le stock et le taux de capture sont exportés à date du jour
        </div>
      </div>

      {sections.map(section => (
        <div key={section} style={{ marginBottom: 32 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>{section}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10 }}>
            {EXPORTS.filter(e => e.section === section).map(exp => (
              <div key={exp.id} className="card" style={{ padding: '20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ padding: 10, background: exp.format === 'PDF' ? 'var(--amber-dim)' : 'var(--green-dim)', borderRadius: 8, color: exp.format === 'PDF' ? 'var(--amber)' : 'var(--green)', flexShrink: 0 }}>
                  {exp.format === 'Excel' ? <FileSpreadsheet size={18} /> : <FileText size={18} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 13, color: 'var(--text)' }}>{exp.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.5 }}>{exp.desc}</div>
                  <button onClick={() => handleExport(exp)} disabled={!!loading}
                    className="btn btn-primary btn-sm"
                    style={{ gap: 6, background: done === exp.id ? 'var(--green-dim)' : undefined, color: done === exp.id ? 'var(--green)' : undefined, border: done === exp.id ? '1px solid var(--c-up-bd)' : undefined }}>
                    {loading === exp.id
                      ? <><RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> Génération…</>
                      : done === exp.id
                        ? <><CheckCircle size={11} /> Téléchargé</>
                        : <><Download size={11} /> {exp.format}</>
                    }
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
