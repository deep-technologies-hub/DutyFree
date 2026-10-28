import { useState } from 'react';
import { useCaisseStore } from '../store/caisseStore';
import { ArrowLeft, CreditCard, Banknote, Smartphone, Check, Plus, X } from 'lucide-react';
import type { Currency, PaymentMethod, Payment, Sale } from '../types';

const fmt = (n: number, currency: Currency) => {
  if (currency === 'EUR') return `€${n.toFixed(2)}`;
  if (currency === 'USD') return `$${n.toFixed(2)}`;
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' F';
};

const METHOD_LABELS: Record<PaymentMethod, string> = { especes: 'Espèces', carte: 'Carte bancaire', mobile_money: 'Mobile Money' };
const METHOD_ICONS: Record<PaymentMethod, React.ReactNode> = {
  especes: <Banknote size={17} />, carte: <CreditCard size={17} />, mobile_money: <Smartphone size={17} />,
};
const CURRENCIES: Currency[] = ['XOF', 'EUR', 'USD'];
const METHODS: PaymentMethod[] = ['especes', 'carte', 'mobile_money'];

export default function Paiement({ onBack, onComplete }: { onBack: () => void; onComplete: (sale: Sale) => void }) {
  const { cartTotal, activeCurrency, completeSale, cart, rates } = useCaisseStore();
  const total = cartTotal();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('especes');
  const [currency, setCurrency] = useState<Currency>(activeCurrency);
  const [amount, setAmount] = useState('');
  const [done, setDone] = useState(false);

  const toXOF = (v: number, c: Currency) => c === 'EUR' ? v * rates.EUR_XOF : c === 'USD' ? v * rates.USD_XOF : v;
  const fromXOF = (v: number, c: Currency) => c === 'EUR' ? v / rates.EUR_XOF : c === 'USD' ? v / rates.USD_XOF : v;

  const paidXOF = payments.reduce((s, p) => s + p.amountXOF, 0);
  const totalXOF = toXOF(total, activeCurrency);
  const remainingXOF = Math.max(0, totalXOF - paidXOF);
  const remaining = fromXOF(remainingXOF, currency);
  const changeXOF = Math.max(0, paidXOF - totalXOF);
  const isPaid = paidXOF >= totalXOF;

  const addPayment = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    const amountXOF = toXOF(val, currency);
    setPayments(p => [...p, { method, currency, amount: val, amountXOF, change: method === 'especes' ? Math.max(0, changeXOF + amountXOF - Math.max(0, remainingXOF)) : 0 }]);
    setAmount('');
  };

  const handleConfirm = () => {
    if (!isPaid) return;
    setDone(true);
    setTimeout(() => { const sale = completeSale(payments); onComplete(sale); }, 800);
  };

  const quickAmounts = currency === 'XOF' ? [5000, 10000, 25000, 50000, 100000] : [10, 20, 50, 100, 200];

  if (done) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', flexDirection: 'column', gap: 18 }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--c-up-dim)', border: '2px solid var(--c-up-bd)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Check size={38} color="var(--c-up)" strokeWidth={2.5} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Paiement accepté</div>
      <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Impression du ticket en cours…</div>
    </div>
  );

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: 'IBM Plex Sans, sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <button onClick={onBack} className="btn btn-ghost btn-icon"><ArrowLeft size={15} /></button>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Encaissement</div>
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: 'var(--text-3)', marginLeft: 'auto' }}>
          {cart.length} article{cart.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT */}
        <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>

          {/* Montants */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            <div className="card" style={{ padding: '18px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Total</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>{fmt(total, activeCurrency)}</div>
            </div>
            <div className="card" style={{ padding: '18px', textAlign: 'center', borderColor: isPaid ? 'var(--c-up-bd)' : 'var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                {isPaid ? 'Monnaie' : 'Reste à payer'}
              </div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 700, color: isPaid ? 'var(--c-up)' : 'var(--c-down)' }}>
                {isPaid ? fmt(fromXOF(changeXOF, activeCurrency), activeCurrency) : fmt(remaining, currency)}
              </div>
            </div>
          </div>

          {/* Méthode */}
          <div style={{ marginBottom: 18 }}>
            <label className="label-xs" style={{ marginBottom: 10 }}>Mode de paiement</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {METHODS.map(m => (
                <button key={m} onClick={() => setMethod(m)}
                  style={{ padding: '14px 8px', background: method === m ? 'var(--accent-dim)' : 'var(--surface)', border: `1px solid ${method === m ? 'var(--accent-border)' : 'var(--border)'}`, borderRadius: 10, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, color: method === m ? 'var(--accent)' : 'var(--text-3)', transition: 'all 0.12s' }}>
                  {METHOD_ICONS[m]}
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{METHOD_LABELS[m]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Devise */}
          <div style={{ marginBottom: 18 }}>
            <label className="label-xs" style={{ marginBottom: 8 }}>Devise de paiement</label>
            <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {CURRENCIES.map(c => (
                <button key={c} onClick={() => { setCurrency(c); setAmount(''); }}
                  style={{ flex: 1, padding: '9px', border: 'none', background: currency === c ? 'var(--accent)' : 'transparent', color: currency === c ? 'var(--bg)' : 'var(--text-3)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace', transition: 'all 0.12s' }}>
                  {c}
                </button>
              ))}
            </div>
            {currency !== 'XOF' && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }}>
                1 {currency} = {currency === 'EUR' ? rates.EUR_XOF.toFixed(3) : rates.USD_XOF.toFixed(2)} XOF
              </div>
            )}
          </div>

          {/* Montant */}
          <div style={{ marginBottom: 14 }}>
            <label className="label-xs" style={{ marginBottom: 8 }}>Montant encaissé</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={amount} onChange={e => setAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPayment()} placeholder={`Montant en ${currency}`} type="number"
                style={{ flex: 1, fontFamily: 'IBM Plex Mono, monospace', fontSize: 20, fontWeight: 700 }} autoFocus />
              <button onClick={addPayment} disabled={!amount} className="btn btn-primary" style={{ padding: '10px 16px' }}>
                <Plus size={15} />
              </button>
            </div>
          </div>

          {/* Montants rapides */}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 22 }}>
            <button onClick={() => setAmount(String(remaining.toFixed(2)))}
              style={{ padding: '6px 13px', borderRadius: 6, border: '1px solid var(--c-up-bd)', background: 'var(--c-up-dim)', color: 'var(--c-up)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              Exact ({fmt(remaining, currency)})
            </button>
            {quickAmounts.map(v => (
              <button key={v} onClick={() => setAmount(String(v))}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace' }}>
                {fmt(v, currency)}
              </button>
            ))}
          </div>

          {/* Liste règlements */}
          {payments.length > 0 && (
            <div>
              <label className="label-xs" style={{ marginBottom: 10 }}>Règlements enregistrés</label>
              {payments.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: 'var(--text-3)' }}>{METHOD_ICONS[p.method]}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{METHOD_LABELS[p.method]}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {fmt(p.amount, p.currency)} = {new Intl.NumberFormat('fr-FR').format(Math.round(p.amountXOF))} XOF
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setPayments(p => p.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT : Récap + validation */}
        <div style={{ width: 300, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 16px' }}>
            <label className="label-xs" style={{ marginBottom: 14 }}>Récapitulatif commande</label>
            {cart.map(item => (
              <div key={item.product.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>{item.product.nom || item.product.name || ''}</div>
                  <div style={{ color: 'var(--text-3)', fontFamily: 'IBM Plex Mono, monospace', marginTop: 2 }}>{item.quantity} × {fmt(item.unitPrice, item.currency)}</div>
                </div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'var(--text)' }}>{fmt(item.total, item.currency)}</div>
              </div>
            ))}
          </div>

          <div style={{ padding: '18px 16px', borderTop: '1px solid var(--border)' }}>
            {changeXOF > 0 && isPaid && (
              <div style={{ marginBottom: 16, padding: '14px', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Monnaie à rendre</div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>
                  {fmt(fromXOF(changeXOF, activeCurrency), activeCurrency)}
                </div>
              </div>
            )}
            <button onClick={handleConfirm} disabled={!isPaid} className="btn btn-primary btn-lg"
              style={{ width: '100%', justifyContent: 'center', gap: 8, opacity: isPaid ? 1 : 0.3 }}>
              <Check size={16} /> Valider la vente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
