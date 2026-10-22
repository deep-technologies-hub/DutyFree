import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, RefreshCw, AlertTriangle, CheckCircle, Copy, Smartphone } from 'lucide-react';
import { saasApi, type Facture, type Organisation, type Plan } from '../api';
import { useBackofficeStore } from '../store/backofficeStore';

const fmt = (n: number | string) => new Intl.NumberFormat('fr-FR').format(Number(n));
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');

const STATUTS: Record<Organisation['statut'], { label: string; badge: string }> = {
  essai: { label: "Période d'essai", badge: 'badge-info' },
  actif: { label: 'Abonnement actif', badge: 'badge-ok' },
  expire: { label: 'Expiré', badge: 'badge-danger' },
  suspendu: { label: 'Suspendu', badge: 'badge-danger' },
};

const FACTURE_STATUTS: Record<Facture['statut'], { label: string; badge: string }> = {
  en_attente: { label: 'En attente', badge: 'badge-warn' },
  payee: { label: 'Payée', badge: 'badge-ok' },
  annulee: { label: 'Annulée', badge: 'badge-neutral' },
};

function Jauge({ label, usage, max }: { label: string; usage: number; max: number | null }) {
  const pct = max ? Math.min(100, Math.round((usage / max) * 100)) : 0;
  const couleur = pct >= 100 ? 'var(--c-down)' : pct >= 80 ? 'var(--c-warn)' : 'var(--c-up)';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{label}</span>
        <span className="mono" style={{ color: 'var(--text-3)' }}>{fmt(usage)} / {max === null ? '∞' : fmt(max)}</span>
      </div>
      <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: max === null ? '4%' : `${pct}%`, height: '100%', background: couleur }} />
      </div>
    </div>
  );
}

export default function AbonnementPage() {
  const [org, setOrg] = useState<Organisation | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [factures, setFactures] = useState<Facture[]>([]);
  const [plan, setPlan] = useState('');
  const [mois, setMois] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<{ facture: Facture; texte: string } | null>(null);
  const [paiementEnCours, setPaiementEnCours] = useState<number | null>(null);
  const [retour, setRetour] = useState<{ type: 'ok' | 'attente' | 'echec'; texte: string } | null>(null);
  const [params, setParams] = useSearchParams();
  const { checkAuth } = useBackofficeStore();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, p, f] = await Promise.all([saasApi.organisation(), saasApi.plans(), saasApi.factures()]);
      setOrg(o);
      setPlans(p);
      setFactures(f.results);
      setPlan(prev => prev || o.plan.code);
    } catch (e) {
      setError((e as { message?: string })?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Retour depuis la page de paiement : /abonnement?facture=12&paiement=payee|en_attente
  useEffect(() => {
    const id = Number(params.get('facture'));
    const statut = params.get('paiement');
    if (!id || !statut) return;
    setParams({}, { replace: true });
    let annule = false;

    const conclure = async (f: Facture) => {
      if (f.statut === 'payee') {
        setRetour({ type: 'ok', texte: `Paiement confirmé — facture ${f.numero}. Merci ! Votre abonnement est actif.` });
        await Promise.all([load(), checkAuth()]);
        return true;
      }
      return false;
    };

    (async () => {
      if (statut === 'payee') { await conclure(await saasApi.facture(id)); return; }
      // La confirmation du prestataire peut arriver quelques secondes après le retour du client.
      setRetour({ type: 'attente', texte: 'Confirmation du paiement en cours…' });
      for (let i = 0; i < 6 && !annule; i++) {
        try {
          if (await conclure(await saasApi.verifier(id))) return;
        } catch { /* on réessaie */ }
        await new Promise(r => setTimeout(r, 2500));
      }
      if (!annule) setRetour({ type: 'echec', texte: "Paiement non confirmé. S'il a été débité, il sera pris en compte automatiquement ; sinon réessayez." });
    })();
    return () => { annule = true; };
  }, [params, setParams, load, checkAuth]);

  const payer = async (id: number) => {
    setPaiementEnCours(id);
    setError(null);
    try {
      const { url } = await saasApi.payer(id);
      window.location.href = url;
    } catch (e) {
      setError((e as { message?: string })?.message || 'Paiement indisponible');
      setPaiementEnCours(null);
    }
  };

  const souscrire = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await saasApi.souscrire(plan, mois);
      setInstructions({ facture: res.facture, texte: res.instructions });
      await load();
    } catch (e) {
      setError((e as { message?: string })?.message || 'Erreur lors de la souscription');
    } finally {
      setSaving(false);
    }
  };

  const planChoisi = plans.find(p => p.code === plan);

  if (loading && !org) {
    return <div style={{ padding: 40, color: 'var(--text-3)', fontSize: 13 }}><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Chargement…</div>;
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100 }}>
      <div style={{ marginBottom: 22 }}>
        <div className="section-label" style={{ marginBottom: 6 }}>Compte</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CreditCard size={18} /> Abonnement
        </h1>
      </div>

      {error && <div className="alert alert-red" style={{ marginBottom: 16 }}><AlertTriangle size={13} /><span>{error}</span></div>}
      {retour && (
        <div className={`alert ${retour.type === 'ok' ? 'alert-green' : retour.type === 'attente' ? 'alert-blue' : 'alert-warn'}`} style={{ marginBottom: 16 }}>
          {retour.type === 'ok' ? <CheckCircle size={13} /> : retour.type === 'attente' ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <AlertTriangle size={13} />}
          <span>{retour.texte}</span>
        </div>
      )}

      {org && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{org.nom}</div>
              <span className={`badge ${STATUTS[org.statut].badge}`}>{STATUTS[org.statut].label}</span>
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 13, margin: 0 }}>
              <dt style={{ color: 'var(--text-3)' }}>Code entreprise</dt>
              <dd className="mono" style={{ margin: 0, color: 'var(--text)', fontWeight: 600 }}>{org.slug}</dd>
              <dt style={{ color: 'var(--text-3)' }}>Plan</dt>
              <dd style={{ margin: 0, color: 'var(--text)' }}>{org.plan.nom} — {fmt(org.plan.prix_mensuel_xof)} XOF / mois</dd>
              <dt style={{ color: 'var(--text-3)' }}>{org.statut === 'essai' ? "Fin de l'essai" : 'Échéance'}</dt>
              <dd style={{ margin: 0, color: 'var(--text)' }}>
                {fmtDate(org.date_fin)}{org.jours_restants !== null && org.est_active ? ` (${org.jours_restants} j restants)` : ''}
              </dd>
            </dl>
            {!org.est_active && (
              <div className="alert alert-red" style={{ marginTop: 14 }}>
                <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                <span>L'application est en lecture seule. Renouvelez votre abonnement pour reprendre les ventes et la gestion du stock.</span>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 20, display: 'grid', gap: 14, alignContent: 'start' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Consommation du plan</div>
            <Jauge label="Caisses" usage={org.usage.caisses} max={org.plan.max_caisses} />
            <Jauge label="Utilisateurs actifs" usage={org.usage.utilisateurs} max={org.plan.max_utilisateurs} />
            <Jauge label="Produits actifs" usage={org.usage.produits} max={org.plan.max_produits} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Renouveler ou changer de plan</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ minWidth: 220 }}>
            <label className="label-xs" style={{ display: 'block', marginBottom: 6 }}>Plan</label>
            <select value={plan} onChange={e => setPlan(e.target.value)}>
              {plans.map(p => <option key={p.code} value={p.code}>{p.nom} — {fmt(p.prix_mensuel_xof)} XOF/mois</option>)}
            </select>
          </div>
          <div style={{ minWidth: 140 }}>
            <label className="label-xs" style={{ display: 'block', marginBottom: 6 }}>Durée</label>
            <select value={mois} onChange={e => setMois(Number(e.target.value))}>
              {[1, 3, 6, 12].map(m => <option key={m} value={m}>{m} mois</option>)}
            </select>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', paddingBottom: 9 }}>
            Total : <strong className="mono">{planChoisi ? fmt(Number(planChoisi.prix_mensuel_xof) * mois) : '—'} XOF</strong>
          </div>
          <button className="btn btn-primary" onClick={souscrire} disabled={saving || !plan} style={{ marginLeft: 'auto' }}>
            {saving ? 'Création…' : 'Générer la facture'}
          </button>
        </div>

        {instructions && (
          <div className="alert alert-green" style={{ marginTop: 16, alignItems: 'flex-start' }}>
            <CheckCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 13, lineHeight: 1.6, flex: 1 }}>
              Facture <strong className="mono">{instructions.facture.numero}</strong> de <strong>{fmt(instructions.facture.montant_xof)} XOF</strong> créée.
              <div style={{ margin: '10px 0' }}>
                <button className="btn btn-primary" onClick={() => payer(instructions.facture.id)} disabled={paiementEnCours !== null}>
                  <Smartphone size={13} /> {paiementEnCours === instructions.facture.id ? 'Redirection…' : 'Payer maintenant (Mobile Money / carte)'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Autre moyen : {instructions.texte}
                <button className="btn btn-ghost btn-xs" style={{ marginLeft: 6 }} onClick={() => navigator.clipboard?.writeText(instructions.facture.numero)}>
                  <Copy size={11} /> Copier le n°
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', fontSize: 13, fontWeight: 700, color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>Factures</div>
        {factures.length === 0 ? (
          <div className="empty-state" style={{ padding: 28, fontSize: 13, color: 'var(--text-3)' }}>Aucune facture pour le moment.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>N°</th><th>Date</th><th>Plan</th><th>Durée</th><th>Montant</th><th>Statut</th><th>Période couverte</th><th></th></tr>
              </thead>
              <tbody>
                {factures.map(f => (
                  <tr key={f.id}>
                    <td className="mono">{f.numero}</td>
                    <td>{fmtDate(f.created_at)}</td>
                    <td>{f.plan_nom}</td>
                    <td>{f.mois} mois</td>
                    <td className="mono">{fmt(f.montant_xof)} XOF</td>
                    <td><span className={`badge ${FACTURE_STATUTS[f.statut].badge}`}>{FACTURE_STATUTS[f.statut].label}</span></td>
                    <td>{f.periode_debut ? `${fmtDate(f.periode_debut)} → ${fmtDate(f.periode_fin)}` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {f.statut === 'en_attente' && (
                        <button className="btn btn-primary btn-sm" onClick={() => payer(f.id)} disabled={paiementEnCours !== null}>
                          {paiementEnCours === f.id ? 'Redirection…' : 'Payer'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
