import { useNavigate } from 'react-router-dom';
import { useStockStore } from '../store/stockStore';
import { AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react';

export default function Alertes() {
  const { products, sommiers } = useStockStore();
  const navigate = useNavigate();

  const ruptures = products.filter(p => p.statut_stock === 'rupture');
  const critiques = products.filter(p => p.statut_stock === 'critique');
  const bas = products.filter(p => p.statut_stock === 'bas');
  const sommiersApurement = sommiers.filter(s => s.statut === 'en_cours');

  const allAlerts = [
    ...ruptures.map(p => ({ id: p.id, level: 'danger' as const, title: `Rupture de stock`, desc: `${p.nom} — Stock à 0 ${p.unite}`, action: 'Commander maintenant', to: '/commandes' })),
    ...sommiersApurement.map(s => ({ id: s.id, level: 'warn' as const, title: `Apurement sommier requis`, desc: `${s.numero} — ${s.produit_nom} (${s.quantite_restante} restants)`, action: 'Voir le sommier', to: '/sommiers' })),
    ...critiques.map(p => ({ id: p.id, level: 'warn' as const, title: `Stock critique`, desc: `${p.nom} — ${p.stock} ${p.unite} (min: ${p.stock_min})`, action: 'Lancer commande', to: '/commandes' })),
    ...bas.map(p => ({ id: p.id, level: 'info' as const, title: `Stock bas`, desc: `${p.nom} — ${p.stock} ${p.unite} (min: ${p.stock_min})`, action: 'Planifier commande', to: '/commandes' })),
  ];

  return (
    <div className="animate-in" style={{ padding: 32 }}>
      <div style={{ marginBottom: 28 }}>
        <div className="page-eyebrow">Surveillance</div>
          <h1 className="page-title">Centre d'alertes</h1>
        <p className="page-sub">
          {allAlerts.length} alerte{allAlerts.length > 1 ? 's' : ''} active{allAlerts.length > 1 ? 's' : ''}
        </p>
      </div>

      {allAlerts.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <CheckCircle size={40} color="var(--c-up)" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Aucune alerte active</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Tous les stocks sont dans les limites normales</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {allAlerts.map((alert, i) => {
            const Icon = alert.level === 'danger' ? AlertCircle : alert.level === 'warn' ? AlertTriangle : Info;
            const colors = { danger: 'var(--c-down)', warn: 'var(--accent)', info: 'var(--c-info)' };
            const bgs = { danger: 'var(--c-down-dim)', warn: 'var(--accent-dim)', info: 'var(--c-info-dim)' };
            const borders = { danger: 'var(--c-down-bd)', warn: 'var(--accent-border)', info: 'var(--c-info-bd)' };
            return (
              <div key={`${alert.id}-${i}`} style={{ display:'flex', alignItems:'center', gap:16, padding:'16px 20px', background: bgs[alert.level], border:`1px solid ${borders[alert.level]}`, borderRadius:10 }}>
                <Icon size={20} color={colors[alert.level]} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: colors[alert.level] }}>{alert.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{alert.desc}</div>
                </div>
                <button onClick={() => navigate(alert.to)} style={{ background: 'transparent', border: `1px solid ${borders[alert.level]}`, borderRadius: 6, padding: '6px 14px', color: colors[alert.level], fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {alert.action}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
