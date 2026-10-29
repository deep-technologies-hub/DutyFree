import { useState, useCallback } from 'react';
import { useCaisseStore } from '../store/caisseStore';
import { authStorage } from '../api';
import { Star, Search, Plus, X, CreditCard, Award, User, ChevronRight } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

interface CarteFidelite {
  id: number;
  numero: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  nationalite: string;
  points: number;
  niveau: 'bronze' | 'silver' | 'gold';
  date_inscription: string;
  derniere_visite: string | null;
}

const NIVEAU_COLORS = {
  bronze: { bg: 'rgba(180,83,9,0.15)', border: 'rgba(180,83,9,0.3)', text: 'var(--c-warn)' },
  silver: { bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.3)', text: '#475569' },
  gold: { bg: 'var(--accent-border)', border: 'var(--accent-border)', text: 'var(--accent)' },
};

function NiveauBadge({ niveau }: { niveau: 'bronze' | 'silver' | 'gold' }) {
  const c = NIVEAU_COLORS[niveau];
  return (
    <span style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
      {niveau === 'gold' ? '★ ' : niveau === 'silver' ? '◆ ' : '● '}
      {niveau}
    </span>
  );
}

interface FidelitePageProps {
  onClose: () => void;
  totalVenteXOF?: number;
  numeroTicket?: string;
  onCarteSelectionnee?: (carte: CarteFidelite) => void;
}

export default function FidelitePage({ onClose, totalVenteXOF, numeroTicket, onCarteSelectionnee }: FidelitePageProps) {
  const [recherche, setRecherche] = useState('');
  const [carte, setCarte] = useState<CarteFidelite | null>(null);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState('');
  const [mode, setMode] = useState<'recherche' | 'creation' | 'details'>('recherche');
  const [pointsGagnes, setPointsGagnes] = useState<number | null>(null);
  const [creation, setCreation] = useState({ nom: '', prenom: '', email: '', telephone: '', nationalite: '' });

  const token = authStorage.getAccess();
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const chercher = useCallback(async () => {
    if (!recherche.trim() || recherche.length < 10) {
      if (recherche.length > 0 && recherche.length < 10) {
        setErreur('Numéro de carte incomplet (10 caractères).');
      }
      return;
    }
    setLoading(true); setErreur(''); setCarte(null);
    try {
      const res = await fetch(`${API}/fidelite/par_numero/?numero=${recherche.toUpperCase()}`, { headers });
      if (res.ok) {
        setCarte(await res.json());
        setMode('details');
      } else if (res.status === 404) {
        setErreur('Carte non trouvée. Vérifiez le numéro imprimé sur la carte.');
      } else {
        setErreur('Erreur lors de la recherche. Réessayez plus tard.');
      }
    } catch {
      setErreur('Connexion impossible — mode hors-ligne');
    }
    finally {
      setLoading(false);
    }
  }, [recherche]);

  const creerCarte = async () => {
    if (!creation.nom || !creation.prenom) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/fidelite/`, { method: 'POST', headers, body: JSON.stringify(creation) });
      if (res.ok) { setCarte(await res.json()); setMode('details'); }
    } catch { setErreur('Erreur création'); }
    finally { setLoading(false); }
  };

  const crediterPoints = async () => {
    if (!carte || !totalVenteXOF) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/fidelite/${carte.id}/ajouter_points/`, {
        method: 'POST', headers,
        body: JSON.stringify({ montant_xof: totalVenteXOF, reference: numeroTicket || '' }),
      });
      if (res.ok) {
        const data = await res.json();
        setPointsGagnes(data.points_gagnes);
        setCarte(prev => prev ? { ...prev, points: data.nouveau_solde, niveau: data.niveau } : prev);
        if (onCarteSelectionnee && carte) onCarteSelectionnee(carte);
      }
    } catch { }
    finally { setLoading(false); }
  };

  const pointsEnXOF = carte ? Math.floor(carte.points * 5) : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 520, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
        {/* Header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 8, padding: 8 }}>
              <Star size={18} color="var(--accent)" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)' }}>Programme Fidélité</div>
              {totalVenteXOF && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Achat : {totalVenteXOF.toLocaleString('fr-FR')} XOF</div>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 6 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '24px 28px' }}>
          {/* Onglets */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 24, background: 'var(--surface-2)', borderRadius: 8, padding: 4 }}>
            {[{ id: 'recherche', label: 'Rechercher', icon: <Search size={13} /> }, { id: 'creation', label: 'Nouvelle carte', icon: <Plus size={13} /> }].map(t => (
              <button key={t.id} onClick={() => { setMode(t.id as any); setCarte(null); setErreur(''); setPointsGagnes(null); }}
                style={{ flex: 1, padding: '8px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.15s', background: mode === t.id || (mode === 'details' && t.id === 'recherche') ? 'var(--accent)' : 'transparent', color: mode === t.id || (mode === 'details' && t.id === 'recherche') ? 'var(--bg)' : 'var(--text-3)' }}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* Recherche */}
          {(mode === 'recherche' || mode === 'details') && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={recherche} onChange={e => setRecherche(e.target.value)} onKeyDown={e => e.key === 'Enter' && chercher()}
                  placeholder="N° de carte  (ex: DF00000001)" autoFocus
                  style={{ flex: 1, background: 'var(--surface-3)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 14, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.05em' }} />
                <button onClick={chercher} disabled={loading} className="btn btn-primary" style={{ padding: '10px 18px' }}>
                  {loading ? '…' : <Search size={15} />}
                </button>
              </div>
              {erreur && <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--c-down-dim)', border: '1px solid var(--c-down-bd)', borderRadius: 8, color: 'var(--c-down)', fontSize: 12 }}>{erreur}</div>}
            </div>
          )}

          {/* Création */}
          {mode === 'creation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { key: 'prenom', label: 'Prénom', placeholder: 'Prénom du client' },
                { key: 'nom', label: 'Nom', placeholder: 'Nom de famille' },
                { key: 'telephone', label: 'Téléphone', placeholder: '+226 XX XX XX XX' },
                { key: 'email', label: 'Email', placeholder: 'email@example.com' },
                { key: 'nationalite', label: 'Nationalité', placeholder: 'Burkina Faso' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>{f.label}</label>
                  <input value={(creation as any)[f.key]} onChange={e => setCreation(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ width: '100%', background: 'var(--surface-3)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '9px 14px', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              ))}
              <button onClick={creerCarte} disabled={!creation.nom || !creation.prenom || loading} className="btn btn-primary" style={{ marginTop: 6, padding: '12px', fontSize: 13, gap: 8, justifyContent: 'center' }}>
                <CreditCard size={14} /> Créer la carte
              </button>
            </div>
          )}

          {/* Détails de la carte */}
          {carte && (
            <div style={{ marginTop: mode === 'creation' ? 24 : 0 }}>
              {/* Carte visuelle */}
              <div style={{ background: 'linear-gradient(135deg, var(--surface-3) 0%, var(--surface-2) 100%)', border: '1px solid var(--accent-border)', borderRadius: 14, padding: '20px 22px', marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', right: -20, top: -20, width: 120, height: 120, borderRadius: '50%', background: 'var(--accent-dim)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Carte Fidélité</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 2 }}>{carte.prenom} {carte.nom}</div>
                    <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: 'var(--text-3)', letterSpacing: '0.1em' }}>{carte.numero}</div>
                  </div>
                  <NiveauBadge niveau={carte.niveau} />
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Points</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)', fontFamily: 'IBM Plex Mono, monospace' }}>{Number(carte.points).toLocaleString('fr-FR')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Valeur</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--c-up)', fontFamily: 'IBM Plex Mono, monospace' }}>{pointsEnXOF.toLocaleString('fr-FR')} F</div>
                  </div>
                </div>
              </div>

              {/* Points gagnés confirmation */}
              {pointsGagnes !== null && (
                <div style={{ background: 'var(--c-up-dim)', border: '1px solid var(--c-up-bd)', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Award size={18} color="var(--c-up)" />
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--c-up)', fontSize: 14 }}>+{pointsGagnes} points crédités !</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Nouveau solde : {Number(carte.points).toLocaleString('fr-FR')} pts</div>
                  </div>
                </div>
              )}

              {/* Infos */}
              {carte.nationalite && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8, marginBottom: 12, fontSize: 12, color: 'var(--text-2)' }}>
                  <User size={13} />
                  {carte.nationalite}{carte.telephone && ` · ${carte.telephone}`}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {totalVenteXOF && pointsGagnes === null && (
                  <button onClick={crediterPoints} disabled={loading} className="btn btn-primary" style={{ padding: '13px', fontSize: 13, justifyContent: 'center', gap: 8 }}>
                    <Star size={15} />
                    Créditer les points de cette vente ({Math.round(totalVenteXOF * 0.001)} pts)
                  </button>
                )}
                {onCarteSelectionnee && (
                  <button onClick={() => onCarteSelectionnee(carte)} className="btn btn-ghost" style={{ padding: '10px', fontSize: 12, justifyContent: 'center', gap: 6 }}>
                    <ChevronRight size={14} /> Associer à la vente en cours
                  </button>
                )}
                {!totalVenteXOF && !onCarteSelectionnee && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '8px' }}>
                    Consultez ou gérez les points depuis le backoffice superviseur.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
