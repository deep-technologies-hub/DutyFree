import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock } from 'lucide-react';
import type { OrganisationResume } from '../api';

/** Bandeau d'état de l'abonnement : essai en cours, expiré ou suspendu. */
export default function SubscriptionBanner({ organisation }: { organisation: OrganisationResume | null | undefined }) {
  const [bloque, setBloque] = useState(false);

  useEffect(() => {
    const onInactive = () => setBloque(true);
    window.addEventListener('subscription:inactive', onInactive);
    return () => window.removeEventListener('subscription:inactive', onInactive);
  }, []);

  if (!organisation) return null;
  const inactive = bloque || !organisation.est_active;
  if (!inactive && organisation.statut !== 'essai') return null;

  const style = inactive
    ? { background: 'var(--c-down-dim)', borderColor: 'var(--c-down-bd)', color: 'var(--c-down)' }
    : { background: 'var(--c-info-dim)', borderColor: 'var(--c-info-bd)', color: 'var(--c-info)' };

  return (
    <div style={{ ...style, borderBottom: `1px solid ${style.borderColor}`, padding: '8px 24px', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
      {inactive ? <AlertTriangle size={13} /> : <Clock size={13} />}
      <span>
        {inactive
          ? 'Abonnement expiré ou suspendu : les données sont en lecture seule.'
          : `Essai gratuit — ${organisation.jours_restants ?? 0} jour(s) restant(s).`}
      </span>
      <Link to="/abonnement" style={{ marginLeft: 'auto', color: 'inherit', textDecoration: 'underline' }}>
        {inactive ? 'Renouveler' : "Choisir une offre"}
      </Link>
    </div>
  );
}
