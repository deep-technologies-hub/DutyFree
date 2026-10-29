import { useState, useMemo } from 'react';
import { useStockStore } from '../store/stockStore';
import { stockApi, type Produit } from '../api';
import { Plus, Search, Edit2, X, Save, RefreshCw, AlertTriangle, CheckCircle, Package } from 'lucide-react';
import { ProductImage } from '../components/ProductImage';

const UNITES = ['bouteille', 'flacon', 'paquet', 'boite', 'carton', 'piece', 'kg', 'litre'];
const STATUS_COLORS: Record<string, string> = { ok: 'var(--c-up)', bas: 'var(--accent)', critique: 'var(--c-warn)', rupture: 'var(--c-down)' };
const STATUS_LABELS: Record<string, string> = { ok: 'OK', bas: 'Bas', critique: 'Critique', rupture: 'Rupture' };

type ModalMode = 'create' | 'edit' | 'view' | null;
const emptyForm = (): Partial<Produit> => ({ code: '', code_barres: '', nom: '', nom_en: '', categorie: null, prix_xof: 0, prix_eur: 0, prix_usd: 0, stock: 0, stock_min: 5, stock_max: 100, unite: 'bouteille', fournisseur: null });

function Field({ label, value, onChange, placeholder = '' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border-2)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
    </div>
  );
}
function NumberField({ label, value, onChange, step = 1, disabled = false, title }: { label: string; value: number; onChange: (v: number) => void; step?: number; disabled?: boolean; title?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</label>
      <input type="number" min="0" step={step} value={value} disabled={disabled} title={title} onChange={e => onChange(Number(e.target.value))} style={{ width: '100%', opacity: disabled ? 0.6 : 1, background: 'var(--bg)', border: '1px solid var(--border-2)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'IBM Plex Mono, monospace', outline: 'none', boxSizing: 'border-box' }} />
    </div>
  );
}
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border-2)', borderRadius: 7, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export default function Produits() {
  const { products, categories, suppliers, fetchProducts } = useStockStore();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('Tous');
  const [statusFilter, setStatusFilter] = useState('Tous');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<Produit | null>(null);
  const [form, setForm] = useState<Partial<Produit>>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const filtered = useMemo(() => products.filter(p => {
    const matchSearch = !search || p.nom.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase()) || p.code_barres?.includes(search);
    const matchCat = cat === 'Tous' || String(p.categorie) === cat;
    const matchStatus = statusFilter === 'Tous' || p.statut_stock === statusFilter;
    return matchSearch && matchCat && matchStatus;
  }), [products, search, cat, statusFilter]);

  const openCreate = () => { setForm(emptyForm()); setError(''); setModalMode('create'); };
  const openEdit = (p: Produit) => { setSelected(p); setForm({ ...p }); setError(''); setModalMode('edit'); };
  const openView = (p: Produit) => { setSelected(p); setModalMode('view'); };
  const closeModal = () => { setModalMode(null); setSelected(null); setForm(emptyForm()); setError(''); };
  const setField = (k: keyof Produit, v: unknown) => setForm(f => ({ ...f, [k]: v }));
  const flash = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); };

  const handleSave = async () => {
    if (!form.nom || !form.code) { setError('Le nom et le code sont obligatoires.'); return; }
    setSaving(true); setError('');
    try {
      if (modalMode === 'create') { await stockApi.produits.create(form); flash('Produit créé avec succès'); }
      else if (modalMode === 'edit' && selected) { await stockApi.produits.update(selected.id, form); flash('Produit mis à jour'); }
      await fetchProducts();
      closeModal();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur serveur');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
      {successMsg && (
        <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, background: 'var(--c-up)', borderRadius: 8, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
          <CheckCircle size={16} /> {successMsg}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div className="page-eyebrow">Gestion du stock</div>
          <h1 className="page-title">Produits</h1>
          <p className="page-sub">{products.length} produits enregistrés</p>
        </div>
        <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '10px 18px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={15} /> Nouveau produit
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, code, code-barres..." style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '9px 12px 9px 34px', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[{ value: 'Tous', label: 'Tous' }, ...categories.map(c => ({ value: String(c.id), label: c.nom }))].map(c => (
            <button key={c.value} onClick={() => setCat(c.value)} style={{ padding: '6px 12px', borderRadius: 20, border: '1px solid', borderColor: cat === c.value ? 'var(--accent)' : 'var(--border-2)', background: cat === c.value ? 'var(--accent-dim)' : 'transparent', color: cat === c.value ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              {c.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['Tous', 'ok', 'bas', 'critique', 'rupture'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{ padding: '5px 10px', borderRadius: 20, border: '1px solid', borderColor: statusFilter === s ? (STATUS_COLORS[s] || 'var(--accent)') : 'var(--border-2)', background: statusFilter === s ? `${STATUS_COLORS[s] || 'var(--accent)'}18` : 'transparent', color: statusFilter === s ? (STATUS_COLORS[s] || 'var(--accent)') : 'var(--text-3)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              {s === 'Tous' ? 'Tous statuts' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              {['Image', 'Code', 'Produit', 'Catégorie', 'Stock', 'Statut', 'Prix XOF', 'Fournisseur', ''].map(h => (
                <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Aucun produit</td></tr>
            ) : filtered.map((p, i) => (
              <tr key={p.id} style={{ borderTop: '1px solid var(--surface-2)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)', cursor: 'pointer' }} onClick={() => openView(p)}>
                <td style={{ padding: '11px 16px' }}>
                  <ProductImage 
                    src={p.photo_url} 
                    alt={p.nom}
                    size="small"
                  />
                </td>
                <td style={{ padding: '11px 16px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: 'var(--text-3)' }}>{p.code}</td>
                <td style={{ padding: '11px 16px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>{p.nom}</div>
                  {p.nom_en && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.nom_en}</div>}
                </td>
                <td style={{ padding: '11px 16px' }}><span style={{ fontSize: 11, background: 'var(--surface-2)', borderRadius: 4, padding: '3px 8px', color: 'var(--text-2)' }}>{p.categorie_nom || '—'}</span></td>
                <td style={{ padding: '11px 16px' }}>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: p.stock <= p.stock_min ? 'var(--c-down)' : 'var(--text)' }}>{p.stock}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>min {p.stock_min}</div>
                </td>
                <td style={{ padding: '11px 16px' }}><span style={{ fontSize: 11, fontWeight: 700, background: `${STATUS_COLORS[p.statut_stock]}18`, color: STATUS_COLORS[p.statut_stock], borderRadius: 4, padding: '3px 8px' }}>{STATUS_LABELS[p.statut_stock]}</span></td>
                <td style={{ padding: '11px 16px', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text)' }}>{new Intl.NumberFormat('fr-FR').format(p.prix_xof)} F</td>
                <td style={{ padding: '11px 16px', color: 'var(--text-2)', fontSize: 12 }}>{p.fournisseur_nom || '—'}</td>
                <td style={{ padding: '11px 16px' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(p)} style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 6, padding: '5px 10px', color: 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Edit2 size={11} /> Modifier
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-3)' }}>{filtered.length} produit{filtered.length !== 1 ? 's' : ''} affiché{filtered.length !== 1 ? 's' : ''}</div>

      {/* MODAL */}
      {modalMode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={closeModal}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 14, width: '100%', maxWidth: 680, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Package size={18} color="var(--accent)" />
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                  {modalMode === 'create' ? 'Nouveau produit' : modalMode === 'edit' ? `Modifier — ${selected?.nom}` : selected?.nom}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {modalMode === 'view' && <button onClick={() => openEdit(selected!)} style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 6, padding: '7px 14px', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><Edit2 size={12} /> Modifier</button>}
                <button onClick={closeModal} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={18} /></button>
              </div>
            </div>
            <div style={{ padding: '24px 28px' }}>
              {modalMode === 'view' && selected ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[['Code', selected.code], ['Code-barres', selected.code_barres || '—'], ['Nom FR', selected.nom], ['Nom EN', selected.nom_en || '—'], ['Catégorie', selected.categorie_nom || '—'], ['Unité', selected.unite]].map(([l, v]) => (
                      <div key={l} style={{ background: 'var(--bg)', borderRadius: 7, padding: '10px 14px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 3 }}>{l}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {[['Prix XOF', `${new Intl.NumberFormat('fr-FR').format(selected.prix_xof)} F`, 'var(--accent)'], ['Prix EUR', `€${selected.prix_eur}`, 'var(--c-info)'], ['Prix USD', `$${selected.prix_usd}`, 'var(--c-up)']].map(([l, v, c]) => (
                      <div key={l} style={{ background: 'var(--bg)', borderRadius: 7, padding: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>{l}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: c as string, fontFamily: 'IBM Plex Mono, monospace' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {[['Stock actuel', selected.stock, selected.stock <= selected.stock_min ? 'var(--c-down)' : 'var(--c-up)'], ['Stock min', selected.stock_min, 'var(--text-2)'], ['Stock max', selected.stock_max, 'var(--text-2)']].map(([l, v, c]) => (
                      <div key={String(l)} style={{ background: 'var(--bg)', borderRadius: 7, padding: '12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>{l}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: c as string, fontFamily: 'IBM Plex Mono, monospace' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: 'var(--bg)', borderRadius: 7, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 3 }}>Fournisseur</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{selected.fournisseur_nom || '—'}</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, background: `${STATUS_COLORS[selected.statut_stock]}18`, color: STATUS_COLORS[selected.statut_stock], borderRadius: 4, padding: '4px 10px' }}>{STATUS_LABELS[selected.statut_stock]}</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {error && <div style={{ background: 'var(--c-down-dim)', border: '1px solid var(--c-down-bd)', borderRadius: 8, padding: '10px 16px', fontSize: 12, color: 'var(--c-down)', display: 'flex', gap: 8, alignItems: 'center' }}><AlertTriangle size={14} /> {error}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <Field label="Code interne *" value={form.code || ''} onChange={v => setField('code', v)} placeholder="ALC-001" />
                    <Field label="Code-barres (EAN)" value={form.code_barres || ''} onChange={v => setField('code_barres', v)} placeholder="3014260001233" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <Field label="Nom (FR) *" value={form.nom || ''} onChange={v => setField('nom', v)} placeholder="Hennessy VS 70cl" />
                    <Field label="Nom (EN)" value={form.nom_en || ''} onChange={v => setField('nom_en', v)} placeholder="Hennessy VS 70cl" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <SelectField label="Catégorie" value={form.categorie ? String(form.categorie) : ''} onChange={v => setField('categorie', v ? Number(v) : null)} options={[{ value: '', label: '— Sans catégorie —' }, ...categories.map(c => ({ value: String(c.id), label: c.nom }))]} />
                    <SelectField label="Unité" value={form.unite || 'bouteille'} onChange={v => setField('unite', v)} options={UNITES.map(u => ({ value: u, label: u }))} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                    <NumberField label="Prix XOF *" value={form.prix_xof ?? 0} onChange={v => setField('prix_xof', v)} />
                    <NumberField label="Prix EUR" value={form.prix_eur ?? 0} onChange={v => setField('prix_eur', v)} step={0.01} />
                    <NumberField label="Prix USD" value={form.prix_usd ?? 0} onChange={v => setField('prix_usd', v)} step={0.01} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                    <NumberField label={modalMode === 'edit' ? 'Stock actuel' : 'Stock initial'} value={form.stock ?? 0} onChange={v => setField('stock', v)}
                      disabled={modalMode === 'edit'} title={modalMode === 'edit' ? 'Le stock se modifie par un mouvement (page Mouvements ou Inventaire)' : undefined} />
                    <NumberField label="Stock minimum" value={form.stock_min ?? 5} onChange={v => setField('stock_min', v)} />
                    <NumberField label="Stock maximum" value={form.stock_max ?? 100} onChange={v => setField('stock_max', v)} />
                  </div>
                  <SelectField label="Fournisseur" value={String(form.fournisseur ?? '')} onChange={v => setField('fournisseur', v ? Number(v) : null)}
                    options={[{ value: '', label: '— Aucun —' }, ...suppliers.map(s => ({ value: String(s.id), label: s.nom }))]} />
                </div>
              )}
            </div>
            {(modalMode === 'create' || modalMode === 'edit') && (
              <div style={{ padding: '16px 28px', borderTop: '1px solid var(--surface-2)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button onClick={closeModal} style={{ background: 'transparent', border: '1px solid var(--border-2)', borderRadius: 8, padding: '9px 18px', color: 'var(--text-3)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Annuler</button>
                <button onClick={handleSave} disabled={saving} style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 20px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? 0.7 : 1 }}>
                  {saving ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
                  {modalMode === 'create' ? 'Créer le produit' : 'Enregistrer'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
