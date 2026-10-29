import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBackofficeStore } from '../store/backofficeStore';
import { ventesApi, type ApiError, type VenteListItem } from '../api';
import { downloadExcel, downloadPdf, venteXof, methodesVente, fmtDateHeure, fmtNombre } from '../utils/exports';
import { Search, Download, Receipt, CreditCard, Banknote, Smartphone, SlidersHorizontal } from 'lucide-react';

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));
const fmtM = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} M` : `${fmt(n)}`;

const METHOD_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  carte: { icon: <CreditCard size={11} />, label: 'Carte', color: 'var(--c-info)', bg: 'var(--c-info-dim)' },
  especes: { icon: <Banknote size={11} />, label: 'Espèces', color: 'var(--c-up)', bg: 'var(--c-up-dim)' },
  mobile_money: { icon: <Smartphone size={11} />, label: 'Mobile Money', color: 'var(--c-warn)', bg: 'var(--c-warn-dim)' },
};

export default function Ventes() {
  const { ventes, fetchVentes, user } = useBackofficeStore();
  const boutique = user?.organisation?.nom || 'Duty Free';
  const [search, setSearch] = useState('');
  const [caisse, setCaisse] = useState('');
  const [method, setMethod] = useState('');
  const [caisses, setCaisses] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<VenteListItem | null>(null);
  const [motif, setMotif] = useState('');
  const [annulation, setAnnulation] = useState<{ enCours: boolean; erreur: string }>({ enCours: false, erreur: '' });

  const ouvrirTicket = (sale: VenteListItem | null) => {
    setSelectedTicket(sale);
    setMotif('');
    setAnnulation({ enCours: false, erreur: '' });
  };

  const annulerVente = async () => {
    if (!selectedTicket || !motif.trim()) return;
    setAnnulation({ enCours: true, erreur: '' });
    try {
      const maj = await ventesApi.annuler(selectedTicket.id, motif.trim());
      setSelectedTicket({ ...selectedTicket, statut: maj.statut });
      setAnnulation({ enCours: false, erreur: '' });
      const qs = new URLSearchParams(Object.entries(filtres).filter(([, v]) => v)).toString();
      fetchVentes(qs ? `?${qs}` : '');
    } catch (e) {
      setAnnulation({ enCours: false, erreur: (e as ApiError).message || "Annulation impossible." });
    }
  };

  useEffect(() => {
    ventesApi.caisses().then(setCaisses).catch(() => setCaisses([]));
  }, []);

  const filtres = { search: search.trim(), numero_caisse: caisse, methode: method };

  // Filtrage côté serveur (sur toutes les ventes, pas seulement la page chargée)
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams(Object.entries({ search: search.trim(), numero_caisse: caisse, methode: method }).filter(([, v]) => v)).toString();
      fetchVentes(qs ? `?${qs}` : '');
    }, 300);
    return () => clearTimeout(t);
  }, [search, caisse, method, fetchVentes]);

  const filtered = ventes || [];

  const exporter = async (format: 'excel' | 'pdf') => {
    setExporting(true);
    try {
      const toutes = await ventesApi.listAll(filtres);
      // Les ventes annulées restent listées (traçabilité) mais ne comptent pas dans le total
      const payees = toutes.filter(v => v.statut !== 'annulee');
      const total = payees.reduce((s, v) => s + venteXof(v), 0);
      const rows = toutes.map(v => [
        v.numero_ticket, fmtDateHeure(v.date_locale), v.numero_caisse, v.caissier_nom, v.nb_articles,
        Math.round(venteXof(v)), methodesVente(v), v.passager_nom || '', v.statut === 'annulee' ? 'Annulée' : 'Payée',
      ]);
      const headers = ['N° ticket', 'Date', 'Caisse', 'Vendeur', 'Articles', 'Montant XOF', 'Paiement', 'Passager', 'Statut'];
      const base = { boutique, title: 'Ventes & tickets', filename: `ventes_${new Date().toISOString().slice(0, 10)}` };
      if (format === 'excel') {
        await downloadExcel({ ...base, filename: `${base.filename}.xlsx`, sheets: [{
          name: 'Ventes', headers, rows, widths: [20, 18, 12, 22, 9, 14, 20, 22, 10],
          total: ['TOTAL', `${payees.length} tickets payés`, '', '', '', Math.round(total)],
        }] });
      } else {
        downloadPdf({ ...base, filename: `${base.filename}.pdf`, landscape: true, headers,
          rows: rows.map(r => r.map((c, i) => (i === 5 ? fmtNombre(Number(c)) : c))),
          total: ['TOTAL', `${payees.length} tickets payés`, '', '', '', fmtNombre(total), '', '', ''] });
      }
    } catch (e) {
      alert(`Export impossible : ${(e as ApiError).message ?? 'réessayez'}`);
    } finally {
      setExporting(false);
    }
  };

  const payees = filtered.filter(v => v.statut !== 'annulee');
  const totalCA = payees.reduce((s, v) => s + venteXof(v), 0);
  const avgTicket = payees.length ? totalCA / payees.length : 0;
  const withPass = payees.filter(s => s.passager_nom).length;

  return (
    <div className="fade-in" style={{ padding: '28px 32px', maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div className="page-eyebrow">Transactions</div>
          <h1 className="page-title">
            Ventes & Tickets
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <button className="btn btn-ghost btn-sm" style={{ gap: 5 }} disabled={exporting} onClick={() => exporter('excel')}><Download size={12} /> Excel</button>
          <button className="btn btn-ghost btn-sm" style={{ gap: 5 }} disabled={exporting} onClick={() => exporter('pdf')}><Download size={12} /> PDF</button>
        </div>
      </div>
      <hr className="rule" style={{ marginBottom: 20 }} />

      {/* KPI strip */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 20, border: '1px solid var(--border)' }}>
        {[
          { label: 'CA affiché', value: fmtM(totalCA) + ' XOF', color: 'var(--accent)' },
          { label: 'Transactions', value: String(payees.length) },
          { label: 'Ticket moyen', value: fmt(avgTicket) + ' F' },
          { label: 'Avec passager ID', value: `${withPass} / ${payees.length}`, color: 'var(--c-info)' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', padding: '15px 20px' }}>
            <div className="section-label" style={{ marginBottom: 5 }}>{k.label}</div>
            <div className="stat-number-sm" style={{ color: k.color || 'var(--text)' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <SlidersHorizontal size={13} color="var(--text-3)" />
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ticket, caissier, passager…" style={{ paddingLeft: 30 }} />
        </div>
        <select value={caisse} onChange={e => setCaisse(e.target.value)} style={{ width: 160 }}>
          <option value="">Toutes les caisses</option>
          {caisses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={method} onChange={e => setMethod(e.target.value)} style={{ width: 160 }}>
          <option value="">Tous paiements</option>
          <option value="carte">Carte</option>
          <option value="especes">Espèces</option>
          <option value="mobile_money">Mobile Money</option>
        </select>
        {(search || caisse || method) && (
          <button className="btn btn-xs btn-ghost" onClick={() => { setSearch(''); setCaisse(''); setMethod(''); }} style={{ color: 'var(--c-down)' }}>
            Réinitialiser
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)', fontFamily: 'DM Mono, monospace' }}>
          {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>N° Ticket</th>
              <th>Date & Heure</th>
              <th>Caissier</th>
              <th style={{ textAlign: 'center' }}>Articles</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th>Paiement</th>
              <th>Passager / Vol</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-3)' }}>
                Aucune transaction correspondante
              </td></tr>
            ) : filtered.map(sale => {
              const methodes = [...new Set(sale.paiements.map(p => p.methode))];
              const m = methodes.length === 1 ? METHOD_CONFIG[methodes[0]] : null;
              return (
                <tr key={sale.id}>
                  <td>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 500, color: 'var(--accent)' }}>{sale.numero_ticket}</span>
                    {sale.statut === 'annulee' && <span className="badge badge-danger" style={{ marginLeft: 6 }}>Annulée</span>}
                  </td>
                  <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text-3)' }}>
                    {new Date(sale.date_locale).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ fontWeight: 500, color: 'var(--text)', fontSize: 12 }}>{sale.numero_caisse}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text-2)' }}>{sale.nb_articles ?? 0}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600, color: 'var(--text)', textDecoration: sale.statut === 'annulee' ? 'line-through' : undefined }}>
                      {sale.devise === 'XOF' ? fmt(Number(sale.total)) : Number(sale.total).toFixed(2)}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 4, fontFamily: 'Space Grotesk, sans-serif' }}>{sale.devise}</span>
                  </td>
                  <td>
                    {m ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 20, fontSize: 11, background: m.bg, color: m.color, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600 }}>
                        {m.icon}{m.label}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>{methodesVente(sale)}</span>
                    )}
                  </td>
                  <td style={{ fontSize: 11, color: sale.passager_nom ? 'var(--c-info)' : 'var(--text-3)', fontFamily: sale.passager_nom ? 'Space Grotesk, sans-serif' : undefined }}>
                    {sale.passager_nom || '—'}
                  </td>
                  <td>
                    <button className="btn btn-xs btn-ghost" style={{ gap: 4 }} onClick={() => ouvrirTicket(sale)}>
                      <Receipt size={10} /> Ticket
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Ticket */}
      {selectedTicket && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => ouvrirTicket(null)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 420, boxShadow: '0 24px 60px rgba(0,0,0,0.15)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '28px 24px', borderBottom: '1px dashed var(--border-3)', textAlign: 'center', background: '#FAFAFA' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>{boutique}</div>
              <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', fontFamily: 'IBM Plex Mono, monospace', margin: '4px 0', wordBreak: 'break-all' }}>Ticket {selectedTicket.numero_ticket}</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{new Date(selectedTicket.date_locale).toLocaleString('fr-FR')}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8, fontWeight: 500 }}>Caisse: <span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{selectedTicket.numero_caisse}</span></div>
              {selectedTicket.passager_nom && <div style={{ fontSize: 12, color: '#fff', background: 'var(--c-info)', display: 'inline-block', padding: '2px 8px', borderRadius: 12, marginTop: 8, fontWeight: 600 }}>{selectedTicket.passager_nom}{selectedTicket.vol_reference ? ` · Vol ${selectedTicket.vol_reference}` : ''}</div>}
            </div>

            <div style={{ padding: '20px 24px', maxHeight: '50vh', overflowY: 'auto' }}>
              {!selectedTicket.lignes || selectedTicket.lignes.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 20 }}>Détail indisponible</div>
              ) : selectedTicket.lignes.map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 13 }}>
                  <div style={{ flex: 1, paddingRight: 16 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{l.produit_nom || `Produit n° ${l.produit}`}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{l.quantite} x {fmt(l.prix_unitaire || 0)} {selectedTicket.devise}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--text)', fontFamily: 'IBM Plex Mono, monospace' }}>
                    {fmt(Number(l.total))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '20px 24px', background: '#FAFAFA', borderTop: '2px dashed var(--border-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-2)' }}>TOTAL TTC</span>
                <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)', fontFamily: 'IBM Plex Mono, monospace' }}>
                  {fmt(Number(selectedTicket.total))} <span style={{ fontSize: 16 }}>{selectedTicket.devise}</span>
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: -12, marginBottom: 16 }}>
                Paiement : {methodesVente(selectedTicket)}
              </div>
              {selectedTicket.statut === 'annulee' ? (
                <div className="badge badge-danger" style={{ display: 'block', textAlign: 'center', padding: 8, marginBottom: 12 }}>
                  Vente annulée : articles remis en stock
                </div>
              ) : (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Annuler cette vente</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="input" style={{ flex: 1 }} placeholder="Motif (obligatoire)" value={motif} maxLength={200}
                      onChange={e => setMotif(e.target.value)} />
                    <button className="btn btn-sm" disabled={!motif.trim() || annulation.enCours} onClick={annulerVente}
                      style={{ background: 'var(--c-down)', color: '#fff', border: 'none' }}>
                      {annulation.enCours ? 'Annulation…' : 'Annuler'}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>Les articles sont remis en stock, le sommier et les points fidélité sont rétablis.</div>
                  {annulation.erreur && <div style={{ fontSize: 12, color: 'var(--c-down)', marginTop: 6 }}>{annulation.erreur}</div>}
                </div>
              )}
              <button 
                onClick={() => ouvrirTicket(null)}
                style={{ width: '100%', padding: '14px', background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'transform 0.1s' }}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                Fermer le reçu
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
