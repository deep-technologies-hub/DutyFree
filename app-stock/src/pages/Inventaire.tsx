import { useState, useMemo } from 'react';
import { useStockStore } from '../store/stockStore';
import { stockApi } from '../api';
import { ClipboardList, Check, X, AlertTriangle, Save, RefreshCw, ChevronDown, ChevronUp, Printer } from 'lucide-react';
import type { Produit } from '../api';

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));

type InventoryLine = {
  produit: Produit;
  theorique: number;
  reel: number | '';
  valide: boolean;
};

type SessionStatus = 'idle' | 'en_cours' | 'termine';

const catNom = (p: { categorie_nom?: string }) => p.categorie_nom || 'Sans catégorie';

export default function Inventaire() {
  const { products, fetchProducts } = useStockStore();
  const CATEGORIES = useMemo(() => ['Tous', ...new Set(products.map(catNom))], [products]);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [lines, setLines] = useState<InventoryLine[]>([]);
  const [filterCat, setFilterCat] = useState('Tous');
  const [filterEcart, setFilterEcart] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(CATEGORIES));

  // Démarrer une session
  const startSession = () => {
    const newLines: InventoryLine[] = products
      .filter(p => p.stock > 0 || true) // inclure même les ruptures
      .sort((a, b) => catNom(a).localeCompare(catNom(b)) || a.nom.localeCompare(b.nom))
      .map(p => ({ produit: p, theorique: p.stock, reel: '', valide: false }));
    setLines(newLines);
    setStatus('en_cours');
  };

  // Mise à jour quantité réelle
  const setReel = (id: number, val: string) => {
    const n = val === '' ? '' : parseInt(val);
    setLines(ls => ls.map(l => l.produit.id === id ? { ...l, reel: n as number | '', valide: false } : l));
  };

  // Valider une ligne
  const validateLine = (id: number) => {
    setLines(ls => ls.map(l => l.produit.id === id && l.reel !== '' ? { ...l, valide: true } : l));
  };

  // Invalider une ligne (corriger)
  const unvalidateLine = (id: number) => {
    setLines(ls => ls.map(l => l.produit.id === id ? { ...l, valide: false } : l));
  };

  // Stats
  const stats = useMemo(() => {
    const saisies = lines.filter(l => l.reel !== '');
    const validees = lines.filter(l => l.valide);
    const avecEcart = saisies.filter(l => l.reel !== '' && Number(l.reel) !== l.theorique);
    const excedents = avecEcart.filter(l => Number(l.reel) > l.theorique);
    const manquants = avecEcart.filter(l => Number(l.reel) < l.theorique);
    return { total: lines.length, saisies: saisies.length, validees: validees.length, avecEcart: avecEcart.length, excedents: excedents.length, manquants: manquants.length };
  }, [lines]);

  // Filtrage
  const filtered = useMemo(() => {
    return lines.filter(l => {
      const matchCat = filterCat === 'Tous' || catNom(l.produit) === filterCat;
      const matchEcart = !filterEcart || (l.reel !== '' && Number(l.reel) !== l.theorique);
      return matchCat && matchEcart;
    });
  }, [lines, filterCat, filterEcart]);

  // Grouper par catégorie
  const grouped = useMemo(() => {
    const g: Record<string, InventoryLine[]> = {};
    filtered.forEach(l => {
      const cat = catNom(l.produit);
      if (!g[cat]) g[cat] = [];
      g[cat].push(l);
    });
    return g;
  }, [filtered]);

  // Enregistrer les ajustements
  const saveInventory = async () => {
    const toAdjust = lines.filter(l => l.valide && Number(l.reel) !== l.theorique);
    if (toAdjust.length === 0) {
      setStatus('termine');
      setSavedAt(new Date().toLocaleString('fr-FR'));
      return;
    }
    setSaving(true);
    try {
      for (const line of toAdjust) {
        const ecart = Number(line.reel) - line.theorique;
        await stockApi.mouvements.create({
          produit: line.produit.id,
          type_mouvement: 'inventaire',
          quantite: ecart,
          motif: `Inventaire physique — écart constaté (théorique: ${line.theorique}, réel: ${line.reel})`,
          reference: `INV-${new Date().toISOString().slice(0,10)}`,
        });
      }
      await fetchProducts();
      setStatus('termine');
      setSavedAt(new Date().toLocaleString('fr-FR'));
    } catch (e) {
      alert('Erreur lors de la sauvegarde. Vérifier la connexion au serveur.');
    } finally {
      setSaving(false);
    }
  };

  const toggleCat = (cat: string) => {
    setExpandedCats(s => {
      const n = new Set(s);
      n.has(cat) ? n.delete(cat) : n.add(cat);
      return n;
    });
  };

  // ── IDLE ──────────────────────────────────────────────────────────
  if (status === 'idle') {
    return (
      <div style={{ padding: '40px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <div className="page-eyebrow">
            Gestion du stock
          </div>
          <h1 className="page-title">Inventaire physique</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 8 }}>
            Comptage physique du stock pour identifier les écarts entre le stock théorique et le stock réel.
          </p>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, padding: 32, marginBottom: 24 }}>
          <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 28 }}>
            {[
              { label: 'Produits à inventorier', value: products.length },
              { label: 'Catégories', value: new Set(products.map(catNom)).size },
              { label: 'Dernier inventaire', value: 'Non enregistré' },
            ].map(k => (
              <div key={k.label} style={{ padding: '16px 20px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--surface-2)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'IBM Plex Mono, monospace' }}>{k.value}</div>
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 8, padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <AlertTriangle size={16} color="var(--accent)" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
              <strong>Recommandation :</strong> Réaliser l'inventaire en dehors des heures d'activité.
              Les écarts constatés créeront automatiquement des mouvements de type "Inventaire" et mettront à jour les sommiers DJBC.
            </div>
          </div>

          <button
            onClick={startSession}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '14px 32px', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <ClipboardList size={18} /> Démarrer la session d'inventaire
          </button>
        </div>
      </div>
    );
  }

  // ── TERMINÉ ───────────────────────────────────────────────────────
  if (status === 'termine') {
    const adjustedLines = lines.filter(l => l.valide && Number(l.reel) !== l.theorique);
    return (
      <div style={{ padding: '40px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', padding: '48px 32px', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, marginBottom: 32 }}>
          <Check size={52} color="var(--c-up)" style={{ marginBottom: 16 }} />
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 8px' }}>Inventaire terminé</h2>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Enregistré le {savedAt}</div>
        </div>

        <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Lignes saisies', value: stats.saisies, color: 'var(--text)' },
            { label: 'Lignes validées', value: stats.validees, color: 'var(--c-up)' },
            { label: 'Avec écart', value: stats.avecEcart, color: 'var(--accent)' },
            { label: 'Ajustements créés', value: adjustedLines.length, color: 'var(--c-info)' },
          ].map(k => (
            <div key={k.label} style={{ padding: '16px', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: k.color, fontFamily: 'IBM Plex Mono, monospace' }}>{k.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', marginTop: 4 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {adjustedLines.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--surface-2)', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Ajustements enregistrés ({adjustedLines.length})
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Produit', 'Code', 'Théorique', 'Réel', 'Écart'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {adjustedLines.map(l => {
                  const ecart = Number(l.reel) - l.theorique;
                  return (
                    <tr key={l.produit.id} style={{ borderTop: '1px solid var(--surface-2)' }}>
                      <td style={{ padding: '10px 16px', color: 'var(--text)', fontWeight: 600 }}>{l.produit.nom}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--text-3)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }}>{l.produit.code}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--text-2)', fontFamily: 'IBM Plex Mono, monospace' }}>{l.theorique}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--text)', fontFamily: 'IBM Plex Mono, monospace' }}>{l.reel}</td>
                      <td style={{ padding: '10px 16px', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: ecart > 0 ? 'var(--c-up)' : 'var(--c-down)' }}>
                        {ecart > 0 ? '+' : ''}{ecart}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => window.print()} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '10px 20px', color: 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Printer size={14} /> Imprimer rapport
          </button>
          <button onClick={() => setStatus('idle')} style={{ background: 'transparent', border: '1px solid var(--border-2)', borderRadius: 8, padding: '10px 20px', color: 'var(--text-3)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Retour
          </button>
        </div>
      </div>
    );
  }

  // ── EN COURS ──────────────────────────────────────────────────────
  const progress = stats.total > 0 ? Math.round((stats.saisies / stats.total) * 100) : 0;

  return (
    <div style={{ padding: '24px 40px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div className="page-eyebrow">
            Session en cours · {new Date().toLocaleDateString('fr-FR')}
          </div>
          <h1 className="page-title">Inventaire physique</h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setStatus('idle')} style={{ background: 'transparent', border: '1px solid var(--border-2)', borderRadius: 8, padding: '8px 16px', color: 'var(--text-3)', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <X size={13} /> Annuler
          </button>
          <button
            onClick={saveInventory}
            disabled={saving || stats.validees === 0}
            style={{ background: stats.validees > 0 ? 'var(--c-up)' : 'var(--surface-2)', border: 'none', borderRadius: 8, padding: '8px 20px', color: '#fff', fontWeight: 700, fontSize: 12, cursor: stats.validees > 0 ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6, opacity: stats.validees === 0 ? 0.5 : 1 }}
          >
            {saving ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
            Enregistrer ({stats.validees} validée{stats.validees > 1 ? 's' : ''})
          </button>
        </div>
      </div>

      {/* Barre de progression */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
            <span style={{ color: 'var(--text)', fontWeight: 700 }}>{stats.saisies}</span>/{stats.total} lignes saisies
            {stats.avecEcart > 0 && <span style={{ color: 'var(--accent)', marginLeft: 12 }}>⚠ {stats.avecEcart} écart{stats.avecEcart > 1 ? 's' : ''}</span>}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', fontFamily: 'IBM Plex Mono, monospace' }}>{progress}%</div>
        </div>
        <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3 }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, var(--c-up), var(--accent))', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setFilterCat(c)}
            style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid', borderColor: filterCat === c ? 'var(--accent)' : 'var(--border-2)', background: filterCat === c ? 'var(--accent-dim)' : 'transparent', color: filterCat === c ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            {c}
          </button>
        ))}
        <div style={{ width: 1, height: 20, background: 'var(--border-2)' }} />
        <button onClick={() => setFilterEcart(!filterEcart)}
          style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid', borderColor: filterEcart ? 'var(--c-down)' : 'var(--border-2)', background: filterEcart ? 'var(--c-down-dim)' : 'transparent', color: filterEcart ? 'var(--c-down)' : 'var(--text-3)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          ⚠ Écarts seulement
        </button>
      </div>

      {/* Table par catégorie */}
      {Object.entries(grouped).map(([cat, catLines]) => {
        const expanded = expandedCats.has(cat);
        const catEcarts = catLines.filter(l => l.reel !== '' && Number(l.reel) !== l.theorique).length;
        const catValides = catLines.filter(l => l.valide).length;
        return (
          <div key={cat} style={{ marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, overflow: 'hidden' }}>
            {/* Header catégorie */}
            <div
              onClick={() => toggleCat(cat)}
              style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 'var(--surface-2)', borderBottom: expanded ? '1px solid var(--surface-2)' : 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{cat}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{catLines.length} produit{catLines.length > 1 ? 's' : ''}</span>
                {catEcarts > 0 && <span style={{ fontSize: 10, background: 'var(--accent-border)', color: 'var(--accent)', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>⚠ {catEcarts} écart{catEcarts > 1 ? 's' : ''}</span>}
                {catValides > 0 && <span style={{ fontSize: 10, background: 'rgba(16,185,129,0.15)', color: 'var(--c-up)', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>✓ {catValides}</span>}
              </div>
              {expanded ? <ChevronUp size={15} color="var(--text-3)" /> : <ChevronDown size={15} color="var(--text-3)" />}
            </div>

            {expanded && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['Code', 'Produit', 'Stock théorique', 'Stock réel (compté)', 'Écart', 'Action'].map(h => (
                      <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {catLines.map(line => {
                    const ecart = line.reel !== '' ? Number(line.reel) - line.theorique : null;
                    const hasEcart = ecart !== null && ecart !== 0;
                    const rowBg = line.valide ? 'rgba(16,185,129,0.04)' : hasEcart ? 'var(--accent-dim)' : 'transparent';
                    return (
                      <tr key={line.produit.id} style={{ borderTop: '1px solid var(--surface-2)', background: rowBg }}>
                        <td style={{ padding: '10px 16px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: 'var(--text-3)' }}>{line.produit.code}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{line.produit.nom}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{line.produit.unite}</div>
                        </td>
                        <td style={{ padding: '10px 16px', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: 16, color: 'var(--text-2)' }}>
                          {line.theorique}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {line.valide ? (
                            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>{line.reel}</span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              value={line.reel}
                              onChange={e => setReel(line.produit.id, e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && line.reel !== '' && validateLine(line.produit.id)}
                              placeholder="Saisir..."
                              style={{ width: 80, background: 'var(--bg)', border: `1px solid ${hasEcart ? 'var(--accent)' : 'var(--border-2)'}`, borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 14, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, textAlign: 'center', outline: 'none' }}
                            />
                          )}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {ecart !== null ? (
                            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: 14, color: ecart === 0 ? 'var(--text-3)' : ecart > 0 ? 'var(--c-up)' : 'var(--c-down)' }}>
                              {ecart > 0 ? '+' : ''}{ecart}
                            </span>
                          ) : <span style={{ color: 'var(--border-2)' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {line.valide ? (
                            <button onClick={() => unvalidateLine(line.produit.id)}
                              style={{ background: 'rgba(16,185,129,0.15)', border: 'none', borderRadius: 6, padding: '5px 12px', color: 'var(--c-up)', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Check size={12} /> Validé
                            </button>
                          ) : (
                            <button
                              onClick={() => line.reel !== '' && validateLine(line.produit.id)}
                              disabled={line.reel === ''}
                              style={{ background: line.reel !== '' ? 'var(--accent-border)' : 'transparent', border: `1px solid ${line.reel !== '' ? 'var(--accent)' : 'var(--border-2)'}`, borderRadius: 6, padding: '5px 12px', color: line.reel !== '' ? 'var(--accent)' : 'var(--border-2)', fontSize: 11, fontWeight: 600, cursor: line.reel !== '' ? 'pointer' : 'not-allowed' }}>
                              Valider
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
