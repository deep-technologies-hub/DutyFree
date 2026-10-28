import { useState, useEffect } from 'react';
import { stockApi, type Produit } from '../api';
import { ProductImage } from '../components/ProductImage';
import { Download, Search } from 'lucide-react';
import { useBackofficeStore } from '../store/backofficeStore';
import { downloadExcel } from '../utils/exports';

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));
const STATUTS: Record<string, string> = { ok: 'OK', bas: 'Bas', critique: 'Critique', rupture: 'Rupture' };

export function ProduitsPage() {
  const [produits, setProduits] = useState<Produit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState('');
  const boutique = useBackofficeStore(s => s.user?.organisation?.nom) || 'Duty Free';

  useEffect(() => {
    loadProduits();
  }, []);

  const loadProduits = async () => {
    try {
      setProduits(await stockApi.produits.listAll());
    } catch (error) {
      console.error('Erreur chargement produits:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProduits = produits.filter(p =>
    (!statut || p.statut_stock === statut) && (
      p.nom.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      (p.code_barres || '').includes(search))
  );

  const exporter = () => downloadExcel({
    boutique, title: 'Catalogue produits', filename: `catalogue_${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheets: [{
      name: 'Produits',
      headers: ['Code', 'Code-barres', 'Produit', 'Catégorie', 'Stock', 'Min', 'Unité', 'Prix XOF', 'Prix EUR', 'Prix USD', 'Statut'],
      widths: [12, 16, 34, 16, 9, 8, 11, 12, 10, 10, 10],
      rows: filteredProduits.map(p => [
        p.code, p.code_barres, p.nom, p.categorie_nom || '', p.stock, p.stock_min, p.unite,
        Number(p.prix_xof), Number(p.prix_eur), Number(p.prix_usd), STATUTS[p.statut_stock] ?? p.statut_stock,
      ]),
    }],
  });

  return (
    <div className="fade-in" style={{ padding: '36px 40px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 36 }}>
        <div className="page-eyebrow">Gestion des produits</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h1 className="page-title">Catalogue produits</h1>
          <button className="btn btn-outline" style={{ gap: 6, fontSize: 12 }} onClick={exporter} disabled={loading}><Download size={12} /> Export Excel</button>
        </div>
        <hr className="rule" style={{ marginTop: 16 }} />
      </div>

      {/* Barre de recherche */}
      <div className="card" style={{ marginBottom: 24, padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              type="text"
              placeholder="Rechercher un produit..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '8px 12px 8px 36px', 
                border: '1px solid var(--border)', 
                borderRadius: 6,
                fontSize: 14
              }}
            />
          </div>
          <select value={statut} onChange={e => setStatut(e.target.value)} style={{ width: 180 }}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{filteredProduits.length} / {produits.length}</span>
        </div>
      </div>

      {/* Tableau des produits */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            Chargement des produits...
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Produit</th>
                <th>Catégorie</th>
                <th>Stock</th>
                <th>Prix XOF</th>
                <th>Prix EUR</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {filteredProduits.map((produit) => (
                <tr key={produit.id}>
                  <td>
                    <ProductImage 
                      src={produit.photo_url} 
                      alt={produit.nom}
                      size="small"
                    />
                  </td>
                  <td>
                    <div>
                      <div style={{ fontWeight: 600 }}>{produit.nom}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{produit.code}</div>
                    </div>
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>{produit.categorie_nom || '—'}</td>
                  <td>
                    <div className="mono">{produit.stock} {produit.unite}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Min: {produit.stock_min}</div>
                  </td>
                  <td className="mono" style={{ fontWeight: 500 }}>{fmt(produit.prix_xof)}</td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{fmt(produit.prix_eur)}</td>
                  <td>
                    {produit.statut_stock === 'rupture' && <span className="badge badge-down" style={{ fontSize: 11 }}>Rupture</span>}
                    {produit.statut_stock === 'critique' && <span className="badge badge-down" style={{ fontSize: 11 }}>Critique</span>}
                    {produit.statut_stock === 'bas' && <span className="badge badge-neutral" style={{ fontSize: 11 }}>Bas</span>}
                    {produit.statut_stock === 'ok' && <span className="badge badge-up" style={{ fontSize: 11 }}>OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
