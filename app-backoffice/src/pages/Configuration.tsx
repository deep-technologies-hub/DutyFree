import { useState, useEffect } from 'react';
import { Settings2, DollarSign, Store, FileText, Package, Star, Save, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { configurationApi, type Configuration } from '../api';

const SECTIONS = [
  {
    id: 'boutique', title: 'Informations boutique', icon: <Store size={15} />,
    fields: [
      { key: 'nom_boutique', label: 'Nom de la boutique', type: 'text' },
      { key: 'nif', label: 'NIF / Numéro fiscal', type: 'text' },
      { key: 'adresse', label: 'Adresse', type: 'text' },
      { key: 'telephone', label: 'Téléphone', type: 'text' },
      { key: 'email', label: 'Email', type: 'email' },
    ],
  },
  {
    id: 'taux', title: 'Taux de change', icon: <DollarSign size={15} />,
    fields: [
      { key: 'taux_eur_xof', label: '1 EUR → XOF', type: 'number', step: '0.001' },
      { key: 'taux_usd_xof', label: '1 USD → XOF', type: 'number', step: '0.001' },
    ],
  },
  {
    id: 'ticket', title: 'Messages ticket de caisse', icon: <FileText size={15} />,
    fields: [
      { key: 'msg_accueil_1', label: "Message d'accueil (ligne 1)", type: 'text' },
      { key: 'msg_accueil_2', label: "Message d'accueil (ligne 2)", type: 'text' },
      { key: 'msg_politesse', label: 'Message de politesse (fin de ticket)', type: 'text' },
    ],
  },
  {
    id: 'stock', title: 'Seuils stock & DJBC', icon: <Package size={15} />,
    fields: [
      { key: 'seuil_alerte_stock', label: 'Seuil alerte réapprovisionnement (unités)', type: 'number', step: '1' },
      { key: 'delai_apurement_sommier', label: 'Délai apurement sommier DJBC (jours)', type: 'number', step: '1' },
    ],
  },
  {
    id: 'fidelite', title: 'Programme fidélité', icon: <Star size={15} />,
    fields: [
      { key: 'points_par_xof', label: 'Points gagnés par XOF dépensé', type: 'number', step: '0.0001' },
      { key: 'valeur_point_xof', label: 'Valeur d\'un point en XOF', type: 'number', step: '0.01' },
      { key: 'seuil_fidelite_bronze', label: 'Seuil Bronze → Silver (points)', type: 'number', step: '1' },
      { key: 'seuil_fidelite_silver', label: 'Seuil Silver → Gold (points)', type: 'number', step: '1' },
      { key: 'seuil_fidelite_gold', label: 'Seuil Gold (points)', type: 'number', step: '1' },
    ],
  },
];

export function ConfigurationPage() {
  const [config, setConfig] = useState<Configuration | null>(null);
  const [draft, setDraft] = useState<Partial<Configuration>>({});
  const [activeSection, setActiveSection] = useState('boutique');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    configurationApi.get()
      .then(data => { setConfig(data); setDraft(data); })
      .catch(() => { setErrMsg('Impossible de charger la configuration. Rechargez la page.'); setStatus('error'); })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (key: string, value: string | number) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    setStatus('idle');
  };

  const handleSave = async () => {
    setSaving(true); setStatus('idle');
    try {
      const updated = await configurationApi.update(draft);
      setConfig(updated); setDraft(updated);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error'); setErrMsg('Erreur lors de la sauvegarde');
    } finally { setSaving(false); }
  };

  const hasChanges = config ? SECTIONS.flatMap(s => s.fields).some(f => String((draft as any)[f.key]) !== String((config as any)[f.key])) : false;
  const currentSection = SECTIONS.find(s => s.id === activeSection)!;

  return (
    <div className="fade-in" style={{ padding: '36px 40px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <div className="page-eyebrow">Paramètres système</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h1 className="page-title">Configuration</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {status === 'saved' && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontSize: 12, fontWeight: 600 }}><CheckCircle size={14} /> Sauvegardé</div>}
            {status === 'error' && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--red)', fontSize: 12, fontWeight: 600 }}><AlertCircle size={14} /> {errMsg}</div>}
            <button onClick={() => { if (config) { setDraft(config); setStatus('idle'); } }} disabled={!hasChanges || saving} className="btn btn-ghost" style={{ gap: 6, fontSize: 12 }}>
              <RefreshCw size={13} /> Annuler
            </button>
            <button onClick={handleSave} disabled={!config || !hasChanges || saving} className="btn btn-primary" style={{ gap: 6, fontSize: 12 }}>
              {saving ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Sauvegarde…</> : <><Save size={13} /> Sauvegarder</>}
            </button>
          </div>
        </div>
        <hr className="rule" style={{ marginTop: 16 }} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-3)' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} /><div>Chargement…</div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 20 }}>
          {/* Sidebar */}
          <div style={{ width: 220, flexShrink: 0 }}>
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, width: '100%', marginBottom: 4,
                border: activeSection === s.id ? '1px solid var(--accent-border)' : '1px solid transparent',
                background: activeSection === s.id ? 'var(--accent-dim)' : 'transparent',
                color: activeSection === s.id ? 'var(--gold)' : 'var(--text-2)',
                cursor: 'pointer', fontSize: 13, fontWeight: activeSection === s.id ? 700 : 500, textAlign: 'left',
              }}>
                {s.icon}{s.title}
              </button>
            ))}
            {config?.updated_at && (
              <div style={{ marginTop: 16, padding: '12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Dernière modif.</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{new Date(config.updated_at).toLocaleString('fr-FR')}</div>
              </div>
            )}
          </div>

          {/* Éditeur */}
          <div style={{ flex: 1 }}>
            <div className="card" style={{ padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 8, padding: 8, color: 'var(--gold)' }}>{currentSection.icon}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{currentSection.title}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: currentSection.fields.length > 3 ? '1fr 1fr' : '1fr', gap: 18 }}>
                {currentSection.fields.map(f => {
                  const val = (draft as any)[f.key] ?? '';
                  const original = config ? (config as any)[f.key] : val;
                  const changed = String(val) !== String(original);
                  return (
                    <div key={f.key}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: changed ? 'var(--gold)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                        {f.label} {changed && <span>●</span>}
                      </label>
                      <input type={f.type} step={(f as any).step} value={val}
                        onChange={e => handleChange(f.key, f.type === 'number' ? parseFloat(e.target.value) : e.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box', background: changed ? 'var(--accent-dim)' : 'var(--surface-2)', border: `1px solid ${changed ? 'var(--accent-border)' : 'var(--border-2)'}`, borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
                    </div>
                  );
                })}
              </div>

              {/* Aperçu taux */}
              {activeSection === 'taux' && draft.taux_eur_xof && (
                <div style={{ marginTop: 24, padding: '16px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div className="section-label" style={{ marginBottom: 10 }}>Aperçu conversions</div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {[{ from: 100, currency: 'EUR', rate: Number(draft.taux_eur_xof) }, { from: 100, currency: 'USD', rate: Number(draft.taux_usd_xof) }].map(({ from, currency, rate }) => (
                      <div key={currency} style={{ flex: 1, padding: '14px', background: 'var(--surface-3)', borderRadius: 8, border: '1px solid var(--border-2)' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>{from} {currency}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>= {new Intl.NumberFormat('fr-FR').format(Math.round(from * rate))} XOF</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Aperçu fidélité */}
              {activeSection === 'fidelite' && draft.points_par_xof && (
                <div style={{ marginTop: 24, padding: '16px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div className="section-label" style={{ marginBottom: 10 }}>Aperçu programme — simulation</div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {[10000, 50000, 100000].map(montant => {
                      const pts = Math.round(montant * Number(draft.points_par_xof));
                      const valeur = Math.round(pts * Number(draft.valeur_point_xof));
                      return (
                        <div key={montant} style={{ flex: 1, padding: '12px', background: 'var(--surface-3)', borderRadius: 8, border: '1px solid var(--border-2)', textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Achat {new Intl.NumberFormat('fr-FR').format(montant)} F</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold)', fontFamily: 'JetBrains Mono, monospace' }}>+{pts} pts</div>
                          <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 2 }}>≈ {new Intl.NumberFormat('fr-FR').format(valeur)} XOF</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
