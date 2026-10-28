import { useState, useRef, useEffect, useMemo } from 'react';
import { useCaisseStore } from '../store/caisseStore';
import { Search, X, Plus, Minus, ChevronRight, Wifi, WifiOff, User, Scan, ShoppingCart, LogOut, Star } from 'lucide-react';
import type { Currency } from '../types';
import { ProductImage } from '../components/ProductImage';
import Paiement from './Paiement';
import Ticket from './Ticket';
import Cloture from './Cloture';
import FidelitePage from './Fidelite';
import type { Sale } from '../types';

const CURS: Currency[] = ['XOF', 'EUR', 'USD'];

const fmt = (n: any, c: Currency) => {
  const num = typeof n === 'number' ? n : parseFloat(n) || 0;
  if (c === 'EUR') return `€${num.toFixed(2)}`;
  if (c === 'USD') return `$${num.toFixed(2)}`;
  return new Intl.NumberFormat('fr-FR', {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num);
};

export default function POS() {
  const {
    products, cart, addToCart, removeFromCart, updateQty,
    cartTotal, cartItemCount, activeCurrency, setActiveCurrency,
    currentUser, logout, isOnline, offlineQueue,
    passengerName, flightRef, destination, setPassenger, clearPassenger,
    loadProducts,
  } = useCaisseStore();

  // Generate dynamic categories from products
  const categories = useMemo(() => {
    const uniqueCategories = new Set(['Tous']);
    products.forEach(p => {
      if (p.categorie_nom) uniqueCategories.add(p.categorie_nom);
    });
    return Array.from(uniqueCategories);
  }, [products]);

  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('Tous');
  const [step, setStep] = useState<'pos' | 'paiement' | 'ticket' | 'cloture'>('pos');
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [showPax, setShowPax] = useState(false);
  const [showFid, setShowFid] = useState(false);
  const [pName, setPName] = useState(passengerName);
  const [pFlt, setPFlt] = useState(flightRef);
  const [pDst, setPDst] = useState(destination);
  const searchRef = useRef<HTMLInputElement>(null);
  const [tick, setTick] = useState(new Date());

  // Forcer le re-rendu quand le panier change
  const [, forceUpdate] = useState({});
  useEffect(() => {
    forceUpdate({});
  }, [cart, cartTotal, activeCurrency]);

  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    loadProducts();
    const t = setInterval(() => setTick(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const filtered = products.filter(p => {
    const q = search.toLowerCase();
    const ok = !q || p.nom.toLowerCase().includes(q) || p.code_barres.includes(search) || p.code.toLowerCase().includes(q);
    return ok && (cat === 'Tous' || p.categorie_nom === cat);
  });

  const total = cartTotal();
  const count = cartItemCount();

  if (step === 'cloture') return <Cloture onBack={() => setStep('pos')} />;
  if (step === 'paiement') return <Paiement onBack={() => setStep('pos')} onComplete={sale => { setLastSale(sale); setStep('ticket'); }} />;
  if (step === 'ticket' && lastSale) return <Ticket sale={lastSale} onClose={() => setStep('pos')} />;

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', flexDirection: 'column' }}>

      {/* ── Topbar ─────────────────────────────────────────────── */}
      <div style={{ height: 48, background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>

        {/* Caissier */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, background: 'var(--accent)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ShoppingCart size={14} color="#0C0D11" />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{currentUser?.name || 'Caissier'}</div>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>{currentUser?.registerId}</div>
          </div>
          {offlineQueue.length > 0 && <span className="badge badge-amber">{offlineQueue.length} en attente</span>}
        </div>

        {/* Sélecteur devise */}
        <div style={{ display: 'flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
          {CURS.map(c => (
            <button key={c} onClick={() => setActiveCurrency(c)}
              style={{ padding: '5px 14px', border: 'none', background: c === activeCurrency ? 'var(--accent)' : 'transparent', color: c === activeCurrency ? '#fff' : 'var(--text-3)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'IBM Plex Mono,monospace', transition: 'all 0.1s' }}>
              {c}
            </button>
          ))}
        </div>

        {/* Droite */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: isOnline ? 'var(--c-up)' : 'var(--c-warn)' }}>
            {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
            {isOnline ? 'En ligne' : 'Hors ligne'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'IBM Plex Mono,monospace' }}>
            {tick.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <button onClick={() => setShowFid(true)} className="btn btn-ghost btn-sm" style={{ gap: 4, color: 'var(--accent)', borderColor: 'var(--accent-border)' }}>
            <Star size={11} /> Fidélité
          </button>
          <button onClick={() => setStep('cloture')} className="btn btn-ghost btn-sm" style={{ gap: 4 }}>
            <LogOut size={11} /> Clôture
          </button>
        </div>
      </div>

      {/* Bannière hors-ligne */}
      {!isOnline && (
        <div style={{ background: 'var(--c-warn-dim)', borderBottom: '1px solid var(--c-warn-bd)', padding: '5px 16px', fontSize: 11, fontWeight: 600, color: 'var(--c-warn)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <WifiOff size={11} /> Mode hors-ligne — synchronisation automatique au retour
        </div>
      )}

      {/* ── Corps ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT : catalogue ──────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--border)' }}>

          {/* Barre de recherche + filtres catégories */}
          <div style={{ padding: '10px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ position: 'relative', marginBottom: 9 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Nom, code-barres…" style={{ paddingLeft: 30 }} />
              {search && (
                <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 2 }}>
                  <X size={12} />
                </button>
              )}
            </div>
            {/* Filtres catégories */}
            <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 1 }}>
              {categories.map(c => (
                <button key={c} onClick={() => setCat(c)} style={{ flexShrink: 0, padding: '4px 12px', borderRadius: 999, border: '1px solid', borderColor: c === cat ? 'var(--accent-border)' : 'var(--border)', background: c === cat ? 'var(--accent-dim)' : 'transparent', color: c === cat ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.1s' }}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Grille produits */}
          <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 8 }}>
              {filtered.map(p => {
                const inCart = cart.find(i => i.product.id === p.id);
                const out = p.stock === 0;
                const price = activeCurrency === 'EUR' ? p.prix_eur : activeCurrency === 'USD' ? p.prix_usd : p.prix_xof;
                return (
                  <button key={p.id} onClick={() => !out && addToCart(p.id)} disabled={out}
                    style={{ background: inCart ? 'var(--accent-dim)' : 'var(--surface)', border: `1px solid ${inCart ? 'var(--accent-border)' : out ? 'var(--c-down-bd)' : 'var(--border)'}`, borderRadius: 7, padding: '10px 11px', cursor: out ? 'not-allowed' : 'pointer', textAlign: 'left', transition: 'border-color 0.12s, background 0.12s', opacity: out ? 0.45 : 1 }}>
                    {/* Image produit */}
                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
                      <ProductImage
                        src={p.photo_url}
                        alt={p.nom}
                        size="medium"
                      />
                    </div>
                    {/* Badge cat + qty */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                      {p.categorie_nom ? <span style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--text-3)', background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.06em', maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.categorie_nom}</span> : <span />}
                      {inCart && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: 'IBM Plex Mono,monospace' }}>×{inCart.quantity}</span>}
                      {out && <span className="badge badge-red" style={{ fontSize: 8.5, padding: '1px 5px' }}>Rupture</span>}
                    </div>
                    {/* Nom */}
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: 9, minHeight: 30 }}>{p.nom}</div>
                    {/* Prix */}
                    <div style={{ fontFamily: 'IBM Plex Mono,monospace', fontSize: 15, fontWeight: 600, color: inCart ? 'var(--accent)' : 'var(--text)', letterSpacing: '-0.01em' }}>
                      {fmt(price, activeCurrency)}
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '48px 20px', color: 'var(--text-3)' }}>
                  <Scan size={26} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.25 }} />
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Aucun produit</div>
                  <div style={{ fontSize: 11, marginTop: 3 }}>Scanner un code-barres</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT : panier ─────────────────────────────────── */}
        <div style={{ width: 320, display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>

          {/* En-tête panier */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
              Panier
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 5 }}>({count} art.)</span>
            </div>
            <button onClick={() => setShowPax(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: passengerName ? 'var(--c-info-dim)' : 'var(--surface-2)', border: `1px solid ${passengerName ? 'var(--c-info-bd)' : 'var(--border)'}`, borderRadius: 5, padding: '4px 9px', fontSize: 11, fontWeight: 600, color: passengerName ? 'var(--c-info)' : 'var(--text-3)', cursor: 'pointer' }}>
              <User size={11} />{passengerName ? passengerName.split(' ')[0] : 'Passager'}
            </button>
          </div>

          {/* Formulaire passager */}
          {showPax && (
            <div style={{ padding: '12px 14px', background: 'rgba(61,117,196,0.05)', borderBottom: '1px solid var(--c-info-bd)', flexShrink: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-info)', marginBottom: 9, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Carte d'embarquement</div>
              <input value={pName} onChange={e => setPName(e.target.value)} placeholder="Nom & Prénom" style={{ marginBottom: 7, fontSize: 12 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={pFlt} onChange={e => setPFlt(e.target.value)} placeholder="Vol" style={{ flex: 1, fontSize: 12 }} />
                <input value={pDst} onChange={e => setPDst(e.target.value)} placeholder="Dest." style={{ flex: 1, fontSize: 12 }} />
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                <button onClick={() => { setPassenger(pName, pFlt, pDst); setShowPax(false); }} className="btn btn-primary" style={{ flex: 1, padding: '7px', fontSize: 11, justifyContent: 'center' }}>Valider</button>
                <button onClick={() => { clearPassenger(); setPName(''); setPFlt(''); setPDst(''); setShowPax(false); }} className="btn btn-ghost" style={{ padding: '7px 10px', fontSize: 11 }}>Effacer</button>
              </div>
            </div>
          )}

          {/* Articles */}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
            {cart.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', gap: 7 }}>
                <ShoppingCart size={28} style={{ opacity: 0.18 }} />
                <div style={{ fontSize: 12, fontWeight: 600 }}>Panier vide</div>
                <div style={{ fontSize: 11 }}>Sélectionnez un produit</div>
              </div>
            ) : cart.map(item => (
              <div key={item.product.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ flex: 1, marginRight: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{item.product.nom || item.product.name || ''}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, fontFamily: 'IBM Plex Mono,monospace' }}>
                      {fmt(item.unitPrice, item.currency)} × {item.quantity}
                      {item.discount > 0 && <span style={{ color: 'var(--c-up)', marginLeft: 5 }}>−{item.discount}%</span>}
                    </div>
                  </div>
                  <button onClick={() => removeFromCart(item.product.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2 }}>
                    <X size={12} />
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {/* Sélecteur quantité */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--surface-2)', borderRadius: 5, padding: '3px 9px', border: '1px solid var(--border)' }}>
                    <button onClick={() => updateQty(item.product.id, item.quantity - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 1 }}><Minus size={11} /></button>
                    <span style={{ fontFamily: 'IBM Plex Mono,monospace', fontSize: 13, fontWeight: 600, minWidth: 18, textAlign: 'center', color: 'var(--text)' }}>{item.quantity}</span>
                    <button onClick={() => updateQty(item.product.id, item.quantity + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', display: 'flex', padding: 1 }}><Plus size={11} /></button>
                  </div>
                  <div style={{ fontFamily: 'IBM Plex Mono,monospace', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{fmt(item.total, item.currency)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Pied panier */}
          {cart.length > 0 && (
            <div style={{ padding: '14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              {passengerName && (
                <div style={{ marginBottom: 11, padding: '7px 11px', background: 'var(--c-info-dim)', borderRadius: 5, fontSize: 10.5, fontWeight: 600, color: 'var(--c-info)', border: '1px solid var(--c-info-bd)' }}>
                  ✈ {passengerName}{flightRef && ` · ${flightRef}`}{destination && ` → ${destination}`}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 13 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Total à payer</div>
                  <div style={{ fontFamily: 'IBM Plex Mono,monospace', fontSize: 28, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>
                    {fmt(total, activeCurrency)}
                  </div>
                  {activeCurrency !== 'XOF' && (
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, fontFamily: 'IBM Plex Mono,monospace' }}>
                      ≈ {new Intl.NumberFormat('fr-FR').format(Math.round(activeCurrency === 'EUR' ? total * 655.957 : total * 607.5))} XOF
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => setStep('paiement')} className="btn btn-primary btn-lg"
                style={{ width: '100%', justifyContent: 'center', gap: 8, fontSize: 13 }}>
                Encaisser <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      </div>

      {showFid && <FidelitePage onClose={() => setShowFid(false)} />}
    </div>
  );
}
