import { useState, useEffect, useCallback } from 'react';
import { Star, Search, Plus, RefreshCw, CreditCard, X, Award, TrendingUp, Users, CheckCircle } from 'lucide-react';
import { fideliteApi, type CarteFidelite, type StatsFidelite } from '../api';

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));

const NIVEAU_STYLE = {
  bronze: { bg: 'rgba(180,83,9,0.12)', border: 'rgba(180,83,9,0.3)', text: '#B45309', label: '● Bronze' },
  silver: { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)', text: '#475569', label: '◆ Silver' },
  gold:   { bg: 'var(--accent-dim)',  border: 'var(--accent-border)',  text: 'var(--accent)', label: '★ Gold'  },
};

function NiveauBadge({ niveau }: { niveau: 'bronze' | 'silver' | 'gold' }) {
  const s = NIVEAU_STYLE[niveau];
  return (
    <span style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
      {s.label}
    </span>
  );
}

function ModalCarte({ carte, onClose, onSaved }: { carte: CarteFidelite | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !carte;
  const [form, setForm] = useState(carte ?? { nom: '', prenom: '', email: '', telephone: '', nationalite: '' });
  const [loading, setLoading] = useState(false);
  const [ajoutPts, setAjoutPts] = useState('');
  const [ptsStatus, setPtsStatus] = useState<'idle' | 'done' | 'error'>('idle');

  const handleSave = async () => {
    setLoading(true);
    try {
      if (isNew) await fideliteApi.create(form);
      else await fideliteApi.update(carte!.id, form);
      onSaved(); onClose();
    } finally { setLoading(false); }
  };

  const handleAjoutPts = async () => {
    if (!carte || !ajoutPts) return;
    setLoading(true);
    try {
      await fideliteApi.ajouterPoints(carte.id, Number(ajoutPts));
      setPtsStatus('done'); setAjoutPts('');
      onSaved();
      setTimeout(() => setPtsStatus('idle'), 2500);
    } catch { setPtsStatus('error'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(7,11,20,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 520, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 8, padding: 7 }}><Star size={16} color="var(--gold)" /></div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{isNew ? 'Nouvelle carte' : `${carte.prenom} ${carte.nom}`}</div>
              {carte && <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'JetBrains Mono, monospace' }}>{carte.numero}</div>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 6 }}><X size={17} /></button>
        </div>
        <div style={{ padding: '22px 26px' }}>
          {/* Infos carte */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            {[
              { key: 'prenom', label: 'Prénom', placeholder: 'Prénom' },
              { key: 'nom', label: 'Nom', placeholder: 'Nom de famille' },
              { key: 'telephone', label: 'Téléphone', placeholder: '+226 XX XX XX XX' },
              { key: 'email', label: 'Email', placeholder: 'email@example.com' },
              { key: 'nationalite', label: 'Nationalité', placeholder: 'Burkina Faso' },
            ].map(f => (
              <div key={f.key} style={f.key === 'nationalite' ? { gridColumn: 'span 2' } : {}}>
                <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>{f.label}</label>
                <input value={(form as any)[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '9px 13px', color: 'var(--text)', fontSize: 13 }} />
              </div>
            ))}
          </div>

          {/* Ajout points (seulement si la carte existe) */}
          {!isNew && carte && (
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>Solde actuel</div>
                <NiveauBadge niveau={carte.niveau} />
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--gold)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 14 }}>
                {fmt(carte.points)} pts
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>Ajustement manuel</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" value={ajoutPts} onChange={e => setAjoutPts(e.target.value)} placeholder="Montant en XOF" min="0"
                  style={{ flex: 1, background: 'var(--surface-3)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }} />
                <button onClick={handleAjoutPts} disabled={!ajoutPts || loading} className="btn btn-primary" style={{ gap: 5, fontSize: 12 }}>
                  <Award size={13} /> Créditer
                </button>
              </div>
              {ptsStatus === 'done' && <div style={{ color: 'var(--green)', fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle size={12} /> Points crédités avec succès</div>}
            </div>
          )}

          <button onClick={handleSave} disabled={loading || !(form as any).nom || !(form as any).prenom} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', gap: 8, padding: '12px', fontSize: 13 }}>
            {loading ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Sauvegarde…</> : <><CreditCard size={13} /> {isNew ? 'Créer la carte' : 'Sauvegarder'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FidelitePage() {
  const [cartes, setCartes] = useState<CarteFidelite[]>([]);
  const [stats, setStats] = useState<StatsFidelite | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalCarte, setModalCarte] = useState<CarteFidelite | null | 'new'>('new' as any);
  const [showModal, setShowModal] = useState(false);
  const [filterNiveau, setFilterNiveau] = useState<'all' | 'bronze' | 'silver' | 'gold'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cartesData, statsData] = await Promise.all([fideliteApi.list(search), fideliteApi.stats()]);
      setCartes(Array.isArray(cartesData) ? cartesData : (cartesData as any).results ?? []);
      setStats(statsData);
    } catch { setCartes([]); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const filtered = filterNiveau === 'all' ? cartes : cartes.filter(c => c.niveau === filterNiveau);

  return (
    <div className="fade-in" style={{ padding: '36px 40px', maxWidth: 1400, margin: '0 auto' }}>
      {showModal && (
        <ModalCarte
          carte={modalCarte === 'new' as any ? null : (modalCarte as CarteFidelite)}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}

      {/* En-tête */}
      <div style={{ marginBottom: 32 }}>
        <div className="page-eyebrow">Gestion clients</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h1 className="page-title">Programme Fidélité</h1>
          <button onClick={() => { setModalCarte(null); setShowModal(true); }} className="btn btn-primary" style={{ gap: 7, fontSize: 13 }}>
            <Plus size={14} /> Nouvelle carte
          </button>
        </div>
        <hr className="rule" style={{ marginTop: 16 }} />
      </div>

      {/* KPIs */}
      {stats && (
        <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          {[
            { label: 'Total cartes actives', value: fmt(stats.total_cartes), icon: <Users size={16} />, color: 'var(--blue)' },
            { label: 'Niveau Gold', value: fmt(stats.by_niveau.gold), icon: <Star size={16} />, color: 'var(--gold)' },
            { label: 'Niveau Silver', value: fmt(stats.by_niveau.silver), icon: <Award size={16} />, color: '#94A3B8' },
            { label: 'Points en circulation', value: fmt(stats.total_points_en_circulation), icon: <TrendingUp size={16} />, color: 'var(--green)' },
          ].map(k => (
            <div key={k.label} className="kpi-box">
              <div style={{ color: k.color, marginBottom: 8 }}>{k.icon}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>{k.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filtres + Recherche */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par nom, numéro, email…"
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px 9px 34px', color: 'var(--text)', fontSize: 13 }} />
        </div>
        <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {(['all', 'gold', 'silver', 'bronze'] as const).map(n => (
            <button key={n} onClick={() => setFilterNiveau(n)}
              style={{ padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: filterNiveau === n ? 700 : 500, background: filterNiveau === n ? 'var(--accent-dim)' : 'transparent', color: filterNiveau === n ? 'var(--gold)' : 'var(--text-2)', borderRight: '1px solid var(--border)' }}>
              {n === 'all' ? 'Tous' : n.charAt(0).toUpperCase() + n.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={load} className="btn btn-ghost" style={{ padding: '9px 12px' }}>
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>N° Carte</th><th>Client</th><th>Nationalité</th><th>Contact</th>
              <th style={{ textAlign: 'right' }}>Points</th><th>Niveau</th><th>Dernière visite</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-3)' }}>
                <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-3)', fontSize: 13 }}>
                Aucune carte trouvée
              </td></tr>
            ) : filtered.map(c => (
              <tr key={c.id}>
                <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text-3)' }}>{c.numero}</td>
                <td style={{ fontWeight: 600 }}>{c.prenom} {c.nom}</td>
                <td style={{ color: 'var(--text-2)', fontSize: 12 }}>{c.nationalite || '—'}</td>
                <td style={{ color: 'var(--text-2)', fontSize: 12 }}>{c.telephone || c.email || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--gold)', fontFamily: 'JetBrains Mono, monospace' }}>{fmt(c.points)}</td>
                <td><NiveauBadge niveau={c.niveau} /></td>
                <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {c.derniere_visite ? new Date(c.derniere_visite).toLocaleDateString('fr-FR') : 'Jamais'}
                </td>
                <td>
                  <button onClick={() => { setModalCarte(c); setShowModal(true); }} className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 11, gap: 4 }}>
                    Gérer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
