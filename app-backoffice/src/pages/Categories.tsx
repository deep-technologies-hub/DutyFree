import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Search, Download, Tag } from 'lucide-react';
import { useBackofficeStore } from '../store/backofficeStore';
import { stockApi, type ApiError } from '../api';
import { downloadExcel } from '../utils/exports';

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));
const fmtM = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} M` : fmt(n);

interface Category {
  id: number;
  name: string;
  code: string;
  ca: number;
  tickets: number;
  part: number;
  produits: number;
  color: string;
  description: string;
}

const emptyForm = { name: '', description: '', color: '#3D75C4' };

export default function CategoriesPage() {
  const { dashboardData, fetchDashboard, user } = useBackofficeStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState('');

  useEffect(() => { if (!dashboardData) fetchDashboard(); }, [dashboardData, fetchDashboard]);

  // Catégories de la boutique + leurs ventes du mois (tableau de bord)
  const load = useCallback(async () => {
    try {
      const cats = await stockApi.categories.list();
      const ventes = dashboardData?.ca_by_categorie ?? [];
      const totalCA = ventes.reduce((sum, v) => sum + Number(v.ca || 0), 0);
      setCategories(cats.map(c => {
        const v = ventes.find(x => x.lignes__produit__categorie === c.nom);
        const ca = Number(v?.ca || 0);
        return {
          id: c.id, name: c.nom, code: c.code, produits: c.nombre_produits,
          ca, tickets: v?.tickets ?? 0,
          part: totalCA ? Math.round(ca / totalCA * 1000) / 10 : 0,
          color: c.couleur, description: c.description,
        };
      }));
    } catch {
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [dashboardData]);

  useEffect(() => { load(); }, [load]);

  const filteredCategories = categories.filter(cat =>
    String(cat.name).toLowerCase().includes(search.toLowerCase())
  );

  const totalCA = categories.reduce((sum, cat) => sum + (Number(cat.ca) || 0), 0);
  const totalTickets = categories.reduce((sum, cat) => sum + (Number(cat.tickets) || 0), 0);

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingCategory(null);
    setFormData(emptyForm);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const data = { nom: formData.name.trim(), description: formData.description, couleur: formData.color };
    try {
      if (editingCategory) await stockApi.categories.update(editingCategory.id, data);
      else await stockApi.categories.create(data);
      await load();
      closeModal();
    } catch (err) {
      setError((err as ApiError).message || 'Enregistrement impossible');
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      color: category.color || '#3D75C4'
    });
    setShowCreateModal(true);
  };

  const handleDelete = async (category: Category) => {
    const avertissement = category.produits ? `\n\n${category.produits} produit(s) passeront « sans catégorie ».` : '';
    if (!confirm(`Supprimer la catégorie "${category.name}" ?${avertissement}`)) return;
    try {
      await stockApi.categories.delete(category.id);
      await load();
    } catch (err) {
      alert((err as ApiError).message || 'Suppression impossible');
    }
  };

  const handleExport = () => downloadExcel({
    boutique: user?.organisation?.nom || 'Duty Free',
    title: 'Catégories — ventes du mois en cours',
    filename: `categories_${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheets: [{
      name: 'Catégories',
      headers: ['Catégorie', 'Code', 'Produits', 'Tickets (mois)', 'CA XOF (mois)', 'Part du CA'],
      widths: [24, 14, 10, 14, 16, 12],
      rows: categories.map(c => [c.name, c.code, c.produits, c.tickets, Math.round(c.ca), `${c.part} %`]),
      total: ['TOTAL', '', categories.reduce((s, c) => s + c.produits, 0), totalTickets, Math.round(totalCA), '100 %'],
    }],
  });

  return (
    <div className="fade-in" style={{ padding: '36px 40px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <div className="page-eyebrow">Gestion du catalogue</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h1 className="page-title">Catégories</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleExport} className="btn btn-outline" style={{ gap: 6, fontSize: 12 }}>
              <Download size={12} /> Exporter
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary"
              style={{ gap: 6, fontSize: 12 }}
            >
              <Plus size={12} /> Nouvelle catégorie
            </button>
          </div>
        </div>
        <hr className="rule" style={{ marginTop: 16 }} />
      </div>

      {/* Stats Cards */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
        <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--accent)', marginBottom: 8 }}>
            {categories.length}
          </div>
          <div className="section-label">Catégories actives</div>
        </div>
        <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
            {fmtM(totalCA)} XOF
          </div>
          <div className="section-label">CA total</div>
        </div>
        <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--c-info)', marginBottom: 8 }}>
            {fmt(totalTickets)}
          </div>
          <div className="section-label">Tickets émis</div>
        </div>
        <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--c-up)', marginBottom: 8 }}>
            {categories.length > 0 ? Math.round(totalTickets / categories.length) : 0}
          </div>
          <div className="section-label">Tickets / catégorie</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              type="text"
              placeholder="Rechercher une catégorie..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: 40,
                paddingRight: 16,
                height: 44,
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 14,
                color: 'var(--text)',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>
      </div>

      {/* Categories Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-3)' }}>
          Chargement des catégories...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filteredCategories.map((category) => (
            <div key={category.id} className="card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      background: category.color + '18',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <Tag size={18} color={category.color} />
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{category.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                      {category.produits} produits · {category.part}% du CA du mois
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => handleEdit(category)}
                    className="btn btn-ghost"
                    style={{ padding: '6px 8px', fontSize: 11 }}
                    title="Modifier"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(category)}
                    className="btn btn-ghost"
                    style={{ padding: '6px 8px', fontSize: 11, color: 'var(--c-down)' }}
                    title="Supprimer"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <div className="section-label" style={{ marginBottom: 4 }}>Chiffre d'affaires</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'IBM Plex Mono, monospace' }}>
                    {fmtM(category.ca)} XOF
                  </div>
                </div>
                <div>
                  <div className="section-label" style={{ marginBottom: 4 }}>Tickets</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'IBM Plex Mono, monospace' }}>
                    {fmt(category.tickets)}
                  </div>
                </div>
              </div>

              {/* Description */}
              {category.description && (
                <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>
                  {category.description}
                </div>
              )}

              {/* Progress Bar */}
              <div style={{ marginTop: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span className="section-label" style={{ fontSize: 11 }}>Part du CA total</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{category.part}%</span>
                </div>
                <div style={{
                  height: 6,
                  background: 'var(--surface-3)',
                  borderRadius: 3,
                  overflow: 'hidden',
                  position: 'relative'
                }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${category.part}%`,
                      background: category.color,
                      borderRadius: 3,
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            width: '100%',
            maxWidth: 500,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                {editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
              </h2>
              <button
                onClick={closeModal}
                style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
              {error && (
                <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 6, background: 'var(--c-down-dim)', color: 'var(--c-down)', fontSize: 12 }}>{error}</div>
              )}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                  Nom de la catégorie *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Alcools, Parfums..."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 14,
                    color: 'var(--text)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Description optionnelle de la catégorie..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 14,
                    color: 'var(--text)',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                  Couleur
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['#1E3A8A', '#14B8A6', '#F59E0B', '#60A5FA', '#8B5CF6', '#E53E3E'].map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, color }))}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 6,
                        border: formData.color === color ? '2px solid var(--accent)' : '1px solid var(--border)',
                        background: color,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn btn-outline"
                  style={{ padding: '8px 20px' }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!formData.name.trim()}
                  className="btn btn-primary"
                  style={{ padding: '8px 20px', opacity: formData.name.trim() ? 1 : 0.6 }}
                >
                  {editingCategory ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
