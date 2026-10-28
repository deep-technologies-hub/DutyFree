import { useState } from 'react';
import { useStockStore } from '../store/stockStore';
import { ArrowUpRight, ArrowDownRight, SlidersHorizontal, Plus, X } from 'lucide-react';
import { stockApi } from '../api';

export default function Mouvements() {
  const { movements, products, sommiers, fetchMovements, fetchProducts, fetchSommiers } = useStockStore();
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    produit: '',
    type_mouvement: 'ajustement',
    quantite: '',
    motif: '',
    sommier: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.produit || !form.quantite || !form.motif) {
      alert('Veuillez remplir Produit, Quantité et Motif');
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        produit: parseInt(form.produit),
        type_mouvement: form.type_mouvement,
        quantite: parseInt(form.quantite),
        motif: form.motif
      };
      if (form.sommier) payload.sommier = parseInt(form.sommier);

      await stockApi.mouvements.create(payload);
      
      // Refresh global states
      await fetchMovements();
      await fetchProducts();
      await fetchSommiers();
      
      setShowModal(false);
      setForm({ produit: '', type_mouvement: 'ajustement', quantite: '', motif: '', sommier: '' });
    } catch (err: any) {
      alert("Erreur lors de la création : " + (err?.message || ""));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-in" style={{ padding: 32 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
        <div>
          <div className="page-eyebrow">Traçabilité</div>
          <h1 className="page-title">Mouvements de stock</h1>
          <p className="page-sub">Historique complet des entrées, sorties et ajustements</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', fontSize:12 }}>
            <Plus size={13} /> Nouveau mouvement
          </button>
          <button style={{ display:'flex', alignItems:'center', gap:6, background:'var(--surface-2)', border:'1px solid var(--border-2)', borderRadius:8, padding:'8px 14px', color:'var(--text-2)', fontSize:12, cursor:'pointer' }}>
            <SlidersHorizontal size={13} /> Filtres
          </button>
        </div>
      </div>
      <div className="card" style={{ overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--surface-2)' }}>
              {['Date','Produit','Type','Avant','Mouvement','Après','Motif','Opérateur'].map(h => (
                <th key={h} style={{ textAlign:'left', padding:'12px 16px', color:'var(--text-3)', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {movements.map(m => (
              <tr key={m.id} style={{ borderBottom:'1px solid var(--surface-2)' }}>
                <td style={{ padding:'12px 16px', fontFamily:'IBM Plex Mono, monospace', fontSize:11, color:'var(--text-3)' }}>
                  {new Date(m.date).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                </td>
                <td style={{ padding:'12px 16px', fontWeight:600, color:'var(--text)' }}>{m.produit_nom}</td>
                <td style={{ padding:'12px 16px' }}>
                  <span className={`badge ${m.type_mouvement==='entree'?'badge-ok':m.type_mouvement==='sortie'?'badge-info':'badge-warn'}`}>
                    {m.type_mouvement}
                  </span>
                </td>
                <td style={{ padding:'12px 16px', fontFamily:'IBM Plex Mono, monospace', fontSize:12, color:'var(--text-2)' }}>{m.stock_avant}</td>
                <td style={{ padding:'12px 16px' }}>
                  <span style={{ display:'flex', alignItems:'center', gap:3, fontFamily:'IBM Plex Mono, monospace', fontSize:13, fontWeight:700, color: m.type_mouvement==='entree'?'var(--c-up)':'var(--c-down)' }}>
                    {m.type_mouvement==='entree' ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>}
                    {m.type_mouvement==='entree'?'+':'-'}{Math.abs(m.quantite)}
                  </span>
                </td>
                <td style={{ padding:'12px 16px', fontFamily:'IBM Plex Mono, monospace', fontSize:12, color:'var(--text)', fontWeight:600 }}>{m.stock_apres}</td>
                <td style={{ padding:'12px 16px', color:'var(--text-3)' }}>{m.motif}</td>
                <td style={{ padding:'12px 16px', color:'var(--text-2)' }}>{m.utilisateur_nom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '90%', maxWidth: 500, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Nouveau Mouvement</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, color: 'var(--text-3)' }}>Produit concerne *</label>
                <select value={form.produit} onChange={e => setForm({...form, produit: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }} required>
                  <option value="">Sélectionner un produit</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.code} — {p.nom} (En stock: {p.stock})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-3)' }}>Type *</label>
                  <select value={form.type_mouvement} onChange={e => setForm({...form, type_mouvement: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }} required>
                    <option value="ajustement">Ajustement (Inventaire)</option>
                    <option value="rebut">Rebut (Casse / Péremption)</option>
                    <option value="entree">Entrée exceptionnelle</option>
                    <option value="sortie">Sortie exceptionnelle</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-3)' }}>Quantité (en unités) *</label>
                  <input type="number" value={form.quantite} onChange={e => setForm({...form, quantite: e.target.value})} placeholder={form.type_mouvement === 'rebut' ? "Ex: 2 (Sera déduit)" : "Ex: 5 ou -5"} style={{ width: '100%', padding: '10px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }} required />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, color: 'var(--text-3)' }}>Sommier DJBC (Optionnel)</label>
                <select value={form.sommier} onChange={e => setForm({...form, sommier: e.target.value})} style={{ width: '100%', padding: '10px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }}>
                  <option value="">Auto (Apurement FIFO ou Dernier Actif)</option>
                  {sommiers.filter(s => s.statut !== 'apure' && (!form.produit || s.produit === parseInt(form.produit))).map(s => (
                    <option key={s.id} value={s.id}>{s.numero} (Reste: {s.quantite_restante})</option>
                  ))}
                </select>
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Laissez vide pour que le système mette à jour le bon Sommier automatiquement.</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, color: 'var(--text-3)' }}>Motif / Justification *</label>
                <input type="text" value={form.motif} onChange={e => setForm({...form, motif: e.target.value})} placeholder="Ex: Bouteille brisée en rayon" style={{ width: '100%', padding: '10px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }} required />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ background: 'transparent', border: '1px solid var(--border-2)', borderRadius: 6, padding: '10px 16px', color: 'var(--text-2)', cursor: 'pointer', fontWeight: 600 }}>Annuler</button>
                <button type="submit" disabled={submitting} className="btn btn-primary" style={{ padding: '10px 20px', borderRadius: 6 }}>
                  {submitting ? "Enregistrement..." : "Valider le mouvement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
