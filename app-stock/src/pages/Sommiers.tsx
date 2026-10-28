import { useState } from 'react';
import { useStockStore } from '../store/stockStore';
import { stockApi, type ApiError } from '../api';
import { FileText, AlertTriangle, CheckCircle, Clock, Plus, X } from 'lucide-react';

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

export default function Sommiers() {
  const { sommiers, products, fetchSommiers } = useStockStore();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ numero: '', reference_djbc: '', produit: '', quantite_initiale: '', date_ouverture: new Date().toISOString().slice(0, 10), notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const qte = Number(form.quantite_initiale);
      // La quantité initiale est entrée sous ce sommier ; les ventes l'apurent ensuite (FIFO)
      await stockApi.sommiers.create({ ...form, produit: Number(form.produit), quantite_initiale: qte, quantite_entree: qte });
      await fetchSommiers();
      setShowForm(false);
      setForm({ ...form, numero: '', reference_djbc: '', produit: '', quantite_initiale: '', notes: '' });
    } catch (err) {
      setError((err as ApiError).message || 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const actifs = sommiers.filter(s => s.statut === 'actif').length;
  const enCours = sommiers.filter(s => s.statut === 'en_cours').length;
  const apurés = sommiers.filter(s => s.statut === 'apure').length;

  return (
    <div className="animate-in" style={{ padding: 32 }}>
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div className="page-eyebrow">Conformité douanière</div>
          <h1 className="page-title">Sommiers DJBC</h1>
          <p className="page-sub">
            Gestion des sommiers d'entreposage fictif — Conformité douanière
          </p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 16px', color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
          <Plus size={14} /> Ouvrir un sommier
        </button>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <div className="card" style={{ padding: 20, display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ background: 'var(--c-info-bd)', padding: 10, borderRadius: 8 }}><FileText size={18} color="var(--c-info)" /></div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', fontFamily: 'IBM Plex Mono, monospace' }}>{actifs}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Sommiers actifs</div>
          </div>
        </div>
        <div className="card" style={{ padding: 20, display: 'flex', gap: 14, alignItems: 'center', borderColor: 'var(--accent-border)' }}>
          <div style={{ background: 'var(--accent-border)', padding: 10, borderRadius: 8 }}><Clock size={18} color="var(--accent)" /></div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent)', fontFamily: 'IBM Plex Mono, monospace' }}>{enCours}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>En cours d'apurement</div>
          </div>
        </div>
        <div className="card" style={{ padding: 20, display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ background: 'var(--c-up-bd)', padding: 10, borderRadius: 8 }}><CheckCircle size={18} color="var(--c-up)" /></div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--c-up)', fontFamily: 'IBM Plex Mono, monospace' }}>{apurés}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Apurés</div>
          </div>
        </div>
      </div>

      {/* Alert apurement */}
      {enCours > 0 && (
        <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
          <AlertTriangle size={16} color="var(--accent)" />
          <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
            {enCours} sommier(s) nécessitent un apurement imminent — Stock quasi nul
          </span>
        </div>
      )}

      {/* Table sommiers */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--surface-2)' }}>
              {['N° Sommier','Réf DJBC','Produits','Qté Init.','Entrées','Sorties','Restant','Taux','Ouverture','Statut'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--text-3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sommiers.map(s => {
              const taux = Math.round(s.taux_apurement);
              const isUrgent = s.statut === 'en_cours';
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--surface-2)', background: isUrgent ? 'var(--accent-dim)' : 'transparent' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{s.numero}</span>
                  </td>
                  <td style={{ padding: '14px 16px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: 'var(--text-3)' }}>{s.reference_djbc}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--text)', fontWeight: 500 }}>{s.produit_nom}</td>
                  <td style={{ padding: '14px 16px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: 'var(--text-2)' }}>{fmt(s.quantite_initiale)}</td>
                  <td style={{ padding: '14px 16px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: 'var(--c-up)' }}>+{fmt(s.quantite_entree)}</td>
                  <td style={{ padding: '14px 16px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: 'var(--c-down)' }}>-{fmt(s.quantite_sortie)}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, fontWeight: 700, color: s.quantite_restante === 0 ? 'var(--c-up)' : isUrgent ? 'var(--accent)' : 'var(--text)' }}>
                      {fmt(s.quantite_restante)}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden', width: 60 }}>
                        <div style={{ height: '100%', width: `${taux}%`, background: taux > 90 ? 'var(--c-down)' : taux > 70 ? 'var(--accent)' : 'var(--c-up)', borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'IBM Plex Mono, monospace' }}>{taux}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 11, color: 'var(--text-3)' }}>
                    {new Date(s.date_ouverture).toLocaleDateString('fr-FR')}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span className={`badge ${s.statut === 'actif' ? 'badge-ok' : s.statut === 'en_cours' ? 'badge-warn' : 'badge-info'}`}>
                      {s.statut === 'actif' ? 'Actif' : s.statut === 'en_cours' ? '⚠ Apurement' : '✓ Apuré'}
                    </span>
                    {s.notes && <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 3 }}>{s.notes}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Guide réglementaire */}
      <div style={{ marginTop: 24, padding: '16px 20px', background: 'var(--c-info-dim)', border: '1px solid var(--c-info-bd)', borderRadius: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-info)', marginBottom: 6 }}>📋 Rappel réglementaire DJBC</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.7 }}>
          Les sommiers d'entreposage fictif doivent être apurés dès que le stock atteint zéro.<br />
          Un sommier non apuré avec stock nul constitue une irrégularité douanière passible de sanctions.<br />
          Délai d'apurement maximum : 30 jours après épuisement du stock.
        </div>
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <form onSubmit={submit} className="card" style={{ width: '100%', maxWidth: 480, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Ouvrir un sommier</h2>
              <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            {error && <div style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 6, background: 'var(--c-down-dim)', color: 'var(--c-down)', fontSize: 12 }}>{error}</div>}
            {([
              ['numero', 'N° de sommier *', 'text', 'SOM-2026-001'],
              ['reference_djbc', 'Référence DJBC', 'text', 'Déclaration en douane'],
              ['quantite_initiale', 'Quantité entrée en entrepôt *', 'number', '0'],
              ['date_ouverture', "Date d'ouverture *", 'date', ''],
            ] as const).map(([key, label, type, placeholder]) => (
              <label key={key} style={{ display: 'block', marginBottom: 12 }}>
                <span style={LABEL}>{label}</span>
                <input type={type} min={type === 'number' ? 1 : undefined} required={label.endsWith('*')} placeholder={placeholder} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} style={INPUT} />
              </label>
            ))}
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={LABEL}>Produit *</span>
              <select required value={form.produit} onChange={e => setForm({ ...form, produit: e.target.value })} style={INPUT}>
                <option value="">— Choisir —</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.code} — {p.nom}</option>)}
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: 18 }}>
              <span style={LABEL}>Notes</span>
              <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...INPUT, resize: 'vertical' }} />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setShowForm(false)} style={{ background: 'transparent', border: '1px solid var(--border-2)', borderRadius: 7, padding: '8px 16px', color: 'var(--text-2)', cursor: 'pointer' }}>Annuler</button>
              <button type="submit" disabled={saving} style={{ background: 'var(--accent)', border: 'none', borderRadius: 7, padding: '8px 16px', color: '#000', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Enregistrement…' : 'Ouvrir'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const LABEL: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 };
const INPUT: React.CSSProperties = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border-2)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' };
