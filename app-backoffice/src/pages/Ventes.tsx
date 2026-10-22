import { useState, useEffect } from 'react';
import { useBackofficeStore } from '../store/backofficeStore';
import { Search, Download, Receipt, CreditCard, Banknote, Smartphone, SlidersHorizontal } from 'lucide-react';

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));
const fmtM = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} M` : `${fmt(n)}`;

const METHOD_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  carte: { icon: <CreditCard size={11} />, label: 'Carte', color: 'var(--c-info)', bg: 'var(--c-info-dim)' },
  especes: { icon: <Banknote size={11} />, label: 'Espèces', color: 'var(--c-up)', bg: 'var(--c-up-dim)' },
  mobile_money: { icon: <Smartphone size={11} />, label: 'Mobile Money', color: 'var(--c-warn)', bg: 'var(--c-warn-dim)' },
};

export default function Ventes() {
  const { ventes, fetchVentes } = useBackofficeStore();
  const [search, setSearch] = useState('');
  const [caisse, setCaisse] = useState('');
  const [method, setMethod] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<any>(null);

  // Use API data instead of mock
  const recentSales = ventes || [];

  useEffect(() => {
    fetchVentes();
  }, [fetchVentes]);

  const filtered = recentSales.filter(s => {
    if (search && !s.numero_ticket?.toLowerCase().includes(search.toLowerCase()) && !s.numero_caisse?.toLowerCase().includes(search.toLowerCase()) && !s.passager_nom?.toLowerCase().includes(search.toLowerCase())) return false;
    if (caisse && !s.numero_caisse?.toLowerCase().includes(caisse.toLowerCase())) return false;
    // TODO: Filter by payment method when available in API
    return true;
  });

  const totalCA = filtered.reduce((s, v) => s + (v.devise === 'XOF' ? +v.total : +v.total * 655.957), 0);
  const avgTicket = filtered.length ? totalCA / filtered.length : 0;
  const withPass = filtered.filter(s => s.passager_nom).length;

  return (
    <div className="fade-in" style={{ padding: '28px 32px', maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div className="section-label" style={{ marginBottom: 5 }}>Transactions</div>
          <h1 style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: 28, fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            Ventes & Tickets
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <button className="btn btn-ghost btn-sm" style={{ gap: 5 }}><Download size={12} /> Excel</button>
          <button className="btn btn-ghost btn-sm" style={{ gap: 5 }}><Download size={12} /> PDF</button>
        </div>
      </div>
      <hr className="rule" style={{ marginBottom: 20 }} />

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 20, border: '1px solid var(--border)' }}>
        {[
          { label: 'CA affiché', value: fmtM(totalCA) + ' XOF', color: 'var(--accent)' },
          { label: 'Transactions', value: String(filtered.length) },
          { label: 'Ticket moyen', value: fmt(avgTicket) + ' F' },
          { label: 'Avec passager ID', value: `${withPass} / ${filtered.length}`, color: 'var(--c-info)' },
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
          <option value="CAISSE-01">CAISSE-01</option>
          <option value="CAISSE-02">CAISSE-02</option>
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
              // TODO: Handle payment method when available in API
              const m = METHOD_CONFIG.especes; // Default for now
              return (
                <tr key={sale.id}>
                  <td>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 500, color: 'var(--accent)' }}>{sale.numero_ticket}</span>
                  </td>
                  <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text-3)' }}>
                    {new Date(sale.date_locale).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ fontWeight: 500, color: 'var(--text)', fontSize: 12 }}>{sale.numero_caisse}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text-2)' }}>{sale.nb_articles ?? 0}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                      {sale.devise === 'XOF' ? `${fmt(sale.total)}` : `€${sale.total.toFixed(2)}`}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 4, fontFamily: 'Space Grotesk, sans-serif' }}>{sale.devise}</span>
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 20, fontSize: 11, background: m.bg, color: m.color, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600 }}>
                      {m.icon}{m.label}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: sale.passager_nom ? 'var(--c-info)' : 'var(--text-3)', fontFamily: sale.passager_nom ? 'Space Grotesk, sans-serif' : undefined }}>
                    {sale.passager_nom || '—'}
                  </td>
                  <td>
                    <button className="btn btn-xs btn-ghost" style={{ gap: 4 }} onClick={() => setSelectedTicket(sale)}>
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
      {selectedTicket && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setSelectedTicket(null)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 420, boxShadow: '0 24px 60px rgba(0,0,0,0.15)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '28px 24px', borderBottom: '1px dashed var(--border-3)', textAlign: 'center', background: '#FAFAFA' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>DJBC Duty Free</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', fontFamily: 'IBM Plex Mono, monospace', margin: '4px 0' }}>Ticket #{selectedTicket.numero_ticket}</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{new Date(selectedTicket.date_locale).toLocaleString('fr-FR')}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8, fontWeight: 500 }}>Caisse: <span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{selectedTicket.numero_caisse}</span></div>
              {selectedTicket.passager_nom && <div style={{ fontSize: 12, color: '#fff', background: 'var(--c-info)', display: 'inline-block', padding: '2px 8px', borderRadius: 12, marginTop: 8, fontWeight: 600 }}>Vol: {selectedTicket.passager_nom}</div>}
            </div>

            <div style={{ padding: '20px 24px', maxHeight: '50vh', overflowY: 'auto' }}>
              {!selectedTicket.lignes || selectedTicket.lignes.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 20 }}>Détail indisponible</div>
              ) : selectedTicket.lignes.map((l: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 13 }}>
                  <div style={{ flex: 1, paddingRight: 16 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{l.produit__nom || l.produit_nom || `Détail Produit ID: ${l.produit}`}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{l.quantite} x {fmt(l.prix_unitaire || 0)} {selectedTicket.devise}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--text)', fontFamily: 'IBM Plex Mono, monospace' }}>
                    {fmt(l.quantite * (l.prix_unitaire || 0))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '20px 24px', background: '#FAFAFA', borderTop: '2px dashed var(--border-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-2)' }}>TOTAL TTC</span>
                <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)', fontFamily: 'IBM Plex Mono, monospace' }}>
                  {fmt(selectedTicket.total)} <span style={{ fontSize: 16 }}>{selectedTicket.devise}</span>
                </span>
              </div>
              <button 
                onClick={() => setSelectedTicket(null)}
                style={{ width: '100%', padding: '14px', background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'transform 0.1s' }}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                Fermer le reçu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
