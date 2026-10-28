import { useState, useMemo } from 'react';
import { useStockStore } from '../store/stockStore';
import { stockApi, type Fournisseur } from '../api';
import { Plus, Mail, Phone, Globe, Edit2, Trash2, X, Save, RefreshCw, AlertTriangle, CheckCircle, Truck } from 'lucide-react';

const PAYS = ['France', 'Suisse', 'Belgique', 'Sénégal', 'Côte d\'Ivoire', 'Ghana', 'Nigeria', 'Afrique du Sud', 'Emirats Arabes Unis', 'Autre'];

const emptyForm = (): Partial<Fournisseur> => ({ nom: '', contact: '', email: '', telephone: '', pays: 'France', actif: true });

function Field({ label, value, onChange, placeholder = '', type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border-2)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
    </div>
  );
}

export default function Fournisseurs() {
  const { suppliers, fetchSuppliers } = useStockStore();
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<Fournisseur | null>(null);
  const [form, setForm] = useState<Partial<Fournisseur>>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const flash = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); };
  const openCreate = () => { setForm(emptyForm()); setError(''); setModalMode('create'); };
  const openEdit = (s: Fournisseur) => { setSelected(s); setForm({ ...s }); setError(''); setModalMode('edit'); };
  const closeModal = () => { setModalMode(null); setSelected(null); setForm(emptyForm()); setError(''); };
  const setField = (k: keyof Fournisseur, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.nom || !form.email) { setError('Le nom et l\'email sont obligatoires.'); return; }
    setSaving(true); setError('');
    try {
      if (modalMode === 'create') { await stockApi.fournisseurs.create(form); flash('Fournisseur créé'); }
      else if (modalMode === 'edit' && selected) { await stockApi.fournisseurs.update(selected.id, form); flash('Fournisseur mis à jour'); }
      await fetchSuppliers();
      closeModal();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erreur serveur'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await stockApi.fournisseurs.delete(deleteId);
      await fetchSuppliers();
      flash('Fournisseur supprimé');
      setDeleteId(null);
    } catch { flash('Erreur lors de la suppression'); }
    finally { setDeleting(false); }
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
      {successMsg && (
        <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, background: 'var(--c-up)', borderRadius: 8, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
          <CheckCircle size={16} /> {successMsg}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div className="page-eyebrow">Gestion des achats</div>
          <h1 className="page-title">Fournisseurs</h1>
          <p className="page-sub">{suppliers.length} fournisseur{suppliers.length !== 1 ? 's' : ''} enregistré{suppliers.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '10px 18px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={15} /> Nouveau fournisseur
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {suppliers.map(s => (
          <div key={s.id} style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, padding: 24, transition: 'border-color 0.15s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{s.nom}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Contact : {s.contact || '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 10, background: 'var(--surface-2)', borderRadius: 4, padding: '3px 8px', color: 'var(--text-2)' }}>{s.pays}</span>
                <span style={{ fontSize: 10, fontWeight: 700, background: s.actif ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)', color: s.actif ? 'var(--c-up)' : 'var(--text-3)', borderRadius: 4, padding: '3px 8px' }}>
                  {s.actif ? 'Actif' : 'Inactif'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
                <Mail size={12} color="var(--text-3)" /> {s.email || '—'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
                <Phone size={12} color="var(--text-3)" /> {s.telephone || '—'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
                <Globe size={12} color="var(--text-3)" /> {s.pays}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, paddingTop: 14, borderTop: '1px solid var(--surface-2)' }}>
              <button onClick={() => openEdit(s)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 7, padding: '8px', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <Edit2 size={12} /> Modifier
              </button>
              <button onClick={() => setDeleteId(s.id)} style={{ background: 'var(--c-down-dim)', border: '1px solid var(--c-down-bd)', borderRadius: 7, padding: '8px 12px', color: 'var(--c-down)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL Création / Modification */}
      {modalMode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={closeModal}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 14, width: '100%', maxWidth: 540, boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Truck size={17} color="var(--accent)" />
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                  {modalMode === 'create' ? 'Nouveau fournisseur' : `Modifier — ${selected?.nom}`}
                </div>
              </div>
              <button onClick={closeModal} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && <div style={{ background: 'var(--c-down-dim)', border: '1px solid var(--c-down-bd)', borderRadius: 8, padding: '10px 16px', fontSize: 12, color: 'var(--c-down)', display: 'flex', gap: 8 }}><AlertTriangle size={14} /> {error}</div>}
              <Field label="Nom de la société *" value={form.nom || ''} onChange={v => setField('nom', v)} placeholder="LVMH Distribution" />
              <Field label="Contact principal" value={form.contact || ''} onChange={v => setField('contact', v)} placeholder="Jean Dupont" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Email *" value={form.email || ''} onChange={v => setField('email', v)} placeholder="contact@fournisseur.com" type="email" />
                <Field label="Téléphone" value={form.telephone || ''} onChange={v => setField('telephone', v)} placeholder="+33 1 23 45 67 89" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Pays</label>
                <select value={form.pays || 'France'} onChange={e => setField('pays', e.target.value)}
                  style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border-2)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                  {PAYS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="actif" checked={form.actif ?? true} onChange={e => setField('actif', e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <label htmlFor="actif" style={{ fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>Fournisseur actif</label>
              </div>
            </div>
            <div style={{ padding: '16px 28px', borderTop: '1px solid var(--surface-2)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={closeModal} style={{ background: 'transparent', border: '1px solid var(--border-2)', borderRadius: 8, padding: '9px 18px', color: 'var(--text-3)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleSave} disabled={saving} style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 20px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? 0.7 : 1 }}>
                {saving ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
                {modalMode === 'create' ? 'Créer' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation suppression */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setDeleteId(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--c-down)', borderRadius: 14, padding: '28px', maxWidth: 400, width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <AlertTriangle size={20} color="var(--c-down)" />
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Supprimer ce fournisseur ?</div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 22, lineHeight: 1.5 }}>
              Cette action est irréversible. Le fournisseur sera dissocié de tous les produits.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setDeleteId(null)} style={{ background: 'transparent', border: '1px solid var(--border-2)', borderRadius: 8, padding: '9px 18px', color: 'var(--text-3)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleDelete} disabled={deleting} style={{ background: 'var(--c-down)', border: 'none', borderRadius: 8, padding: '9px 18px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                {deleting ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />} Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
