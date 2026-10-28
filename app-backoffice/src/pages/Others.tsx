import { useEffect, useState } from 'react';
import { useBackofficeStore } from '../store/backofficeStore';
import { ventesApi, type ApiError, type TauxCapture } from '../api';
import { Plus, Trash2 } from 'lucide-react';

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));

type Form = { id: number | null; annee: number; mois: number; nombre_passagers: string; source: string; notes: string };

const emptyForm = (): Form => {
  const now = new Date();
  return { id: null, annee: now.getFullYear(), mois: now.getMonth() + 1, nombre_passagers: '', source: '', notes: '' };
};

export function PassagersPage() {
  const { tauxCapture, fetchTauxCapture } = useBackofficeStore();
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchTauxCapture(); }, [fetchTauxCapture]);

  // L'API renvoie du plus récent au plus ancien : on affiche dans l'ordre chronologique
  const passengerData = [...tauxCapture].reverse();

  const edit = (p: TauxCapture) => setForm({
    id: p.id, annee: p.annee, mois: p.mois, nombre_passagers: String(p.passagers), source: p.source, notes: p.notes,
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    const data = {
      annee: form.annee, mois: form.mois, nombre_passagers: Number(form.nombre_passagers),
      source: form.source, notes: form.notes,
    };
    try {
      if (form.id) await ventesApi.passagers.update(form.id, data);
      else await ventesApi.passagers.create(data);
      await fetchTauxCapture();
      setForm(null);
    } catch (err) {
      const e = err as ApiError;
      setError(e.status === 400 && !form.id
        ? 'Des données existent déjà pour ce mois : modifiez la ligne existante.'
        : e.message || 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: TauxCapture) => {
    const mois = new Date(p.annee, p.mois - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    if (!confirm(`Supprimer les données passagers de ${mois} ?`)) return;
    try {
      await ventesApi.passagers.delete(p.id);
      await fetchTauxCapture();
    } catch (err) {
      alert((err as ApiError).message || 'Suppression impossible');
    }
  };

  return (
    <div className="fade-in" style={{ padding: '36px 40px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 36 }}>
        <div className="page-eyebrow">Données externes aéroport</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h1 className="page-title">Taux de capture</h1>
          <button className="btn btn-outline" style={{ gap: 6, fontSize: 12 }} onClick={() => { setError(''); setForm(emptyForm()); }}>
            <Plus size={12} /> Saisir données passagers
          </button>
        </div>
        <hr className="rule" style={{ marginTop: 16 }} />
      </div>

      <div style={{ padding: '14px 18px', background: 'var(--c-info-dim)', border: '1px solid var(--border)', borderRadius: 4, marginBottom: 28, fontSize: 13, color: 'var(--c-info)' }}>
        ℹ Les données de fréquentation passagers sont fournies mensuellement par l'aéroport. Le taux de capture = tickets émis / passagers du mois.
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Mois</th>
              <th>Passagers (aéroport)</th>
              <th>Tickets émis</th>
              <th>Taux de capture</th>
              <th>Évolution</th>
              <th>Source</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {passengerData.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
                Aucune donnée saisie. Cliquez sur « Saisir données passagers » pour commencer.
              </td></tr>
            )}
            {passengerData.map((p, i) => {
              const prev = i > 0 ? passengerData[i - 1].taux : p.taux;
              const diff = p.taux - prev;
              const monthName = new Date(p.annee, p.mois - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
              return (
                <tr key={p.id}>
                  <td style={{ fontWeight: i === passengerData.length - 1 ? 600 : 400 }}>
                    {monthName} {i === passengerData.length - 1 && <span className="badge badge-gold" style={{ marginLeft: 6 }}>Dernier</span>}
                  </td>
                  <td className="mono">{fmt(p.passagers)}</td>
                  <td className="mono">{p.tickets}</td>
                  <td>
                    <span className="mono" style={{ fontSize: 18, fontWeight: 500 }}>{p.taux}%</span>
                  </td>
                  <td>
                    {i === 0 ? '—' : (
                      <span className={`badge ${diff >= 0 ? 'badge-up' : 'badge-down'}`}>
                        {diff >= 0 ? '+' : ''}{diff.toFixed(1)} pts
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{p.source || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-xs btn-ghost" onClick={() => { setError(''); edit(p); }}>Modifier</button>
                    <button className="btn btn-xs btn-ghost" onClick={() => remove(p)} style={{ color: 'var(--c-down)', marginLeft: 4 }} title="Supprimer">
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {form && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <form onSubmit={save} className="card" style={{ width: '100%', maxWidth: 460, padding: 24 }}>
            <h3 style={{ marginBottom: 6, fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
              {form.id ? 'Modifier les données passagers' : 'Saisir les données passagers'}
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 18 }}>Nombre d'embarquements du mois communiqué par l'aéroport.</p>
            {error && <div style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 4, background: 'var(--c-down-dim)', color: 'var(--c-down)', fontSize: 12 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <label style={{ flex: 1 }}>
                <span className="section-label">Année</span>
                <input type="number" required min={2000} max={2100} value={form.annee} disabled={!!form.id}
                  onChange={e => setForm({ ...form, annee: Number(e.target.value) })} style={{ width: '100%' }} />
              </label>
              <label style={{ flex: 1 }}>
                <span className="section-label">Mois</span>
                <select value={form.mois} disabled={!!form.id} onChange={e => setForm({ ...form, mois: Number(e.target.value) })} style={{ width: '100%' }}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleDateString('fr-FR', { month: 'long' })}</option>
                  ))}
                </select>
              </label>
            </div>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span className="section-label">Nombre de passagers</span>
              <input type="number" required min={1} value={form.nombre_passagers} placeholder="Ex : 45000"
                onChange={e => setForm({ ...form, nombre_passagers: e.target.value })} style={{ width: '100%' }} />
            </label>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span className="section-label">Source</span>
              <input value={form.source} placeholder="Ex : Rapport mensuel aéroport"
                onChange={e => setForm({ ...form, source: e.target.value })} style={{ width: '100%' }} />
            </label>
            <label style={{ display: 'block', marginBottom: 20 }}>
              <span className="section-label">Notes</span>
              <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ width: '100%', resize: 'vertical' }} />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
