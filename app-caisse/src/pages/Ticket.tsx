import { useRef, useState } from 'react';
import { useCaisseStore } from '../store/caisseStore';
import { Printer, ShoppingBag, Check, RotateCcw, Usb } from 'lucide-react';
import type { Sale } from '../types';
import { escposPrinter, buildTicketHtml } from '../utils/escpos';
import { useBoutique } from '../hooks/useBoutique';

const fmt = (n: number, c: string) => {
  if (c === 'EUR') return `€${n.toFixed(2)}`;
  if (c === 'USD') return `$${n.toFixed(2)}`;
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' F';
};

export default function Ticket({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { currentUser } = useCaisseStore();
  const boutique = useBoutique();
  const nomBoutique = boutique?.nom_boutique || 'DUTY FREE';
  const printRef = useRef<HTMLDivElement>(null);
  const [usbConnecting, setUsbConnecting] = useState(false);
  const [usbConnected, setUsbConnected] = useState(escposPrinter.isConnected());

  const handlePrint = () => {
    // Fallback window.print() avec CSS dédié
    const html = buildTicketHtml({
      numero_ticket: sale.id,
      createdAt: sale.createdAt,
      items: sale.items.map(i => ({ name: i.product.name ?? i.product.nom ?? '', qty: i.quantity, price: i.unitPrice, currency: sale.currency })),
      total: sale.total,
      currency: sale.currency,
      paiements: sale.payments.map(p => ({ methode: p.method, montant: p.amount, devise: p.currency })),
      passengerName: sale.passengerName,
      flightRef: sale.flightRef,
      destination: sale.destination,
    }, {
      nom: nomBoutique,
      adresse: boutique?.adresse,
      nif: boutique?.nif,
      msg1: boutique?.msg_accueil_1,
      msg2: boutique?.msg_accueil_2,
      msgPolitesse: boutique?.msg_politesse,
    });
    escposPrinter.printFallback(html);
  };

  const handleUsbConnect = async () => {
    setUsbConnecting(true);
    const ok = await escposPrinter.connect();
    setUsbConnected(ok);
    setUsbConnecting(false);
    if (ok) handleUsbPrint();
  };

  const handleUsbPrint = async () => {
    if (!escposPrinter.isConnected()) { handlePrint(); return; }
    const fmtN = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));
    escposPrinter
      .init()
      .align('center').bold(true).text(`${nomBoutique}\n`).bold(false)
      .text(boutique?.adresse ? `${boutique.adresse}\n` : '')
      .text(boutique?.nif ? `NIF : ${boutique.nif}\n` : '')
      .separator()
      .text(`${boutique?.msg_accueil_1 || 'Bienvenue - Welcome'}\n`)
      .separator()
      .align('left')
      .line(`Ticket : ${sale.id}`)
      .line(`Date   : ${new Date(sale.createdAt).toLocaleString('fr-FR')}`)
      .separator();
    sale.items.forEach(item => {
      escposPrinter.line((item.product.name ?? item.product.nom ?? '').substring(0, 32));
      escposPrinter.row(`  ${item.quantity} x ${fmtN(item.unitPrice)}`, fmtN(item.quantity * item.unitPrice));
    });
    escposPrinter
      .separator()
      .bold(true).row('TOTAL', `${fmtN(sale.total)} ${sale.currency}`).bold(false)
      .separator()
      .align('center').text(`${boutique?.msg_politesse || 'Merci. Bon voyage.'}\n`)
      .feed(4).cut();
    await escposPrinter.print();
  };

  const totalXOF = sale.payments.reduce((s, p) => s + p.amountXOF, 0);
  const totalPaid = sale.payments.reduce((s, p) => s + p.amount, 0);
  const changeXOF = Math.max(0, totalXOF - sale.total);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 24px', fontFamily: 'IBM Plex Sans, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>

        {/* Succès */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--c-up-dim)', border: '2px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <Check size={26} color="var(--c-up)" strokeWidth={2.5} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Vente enregistrée</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'IBM Plex Mono, monospace' }}>#{sale.id?.toString().slice(-6).toUpperCase() || 'DFR-' + Date.now().toString().slice(-6)}</div>
        </div>

        {/* Ticket */}
        <div ref={printRef} className="card" style={{ padding: '24px', marginBottom: 16 }}>

          {/* En-tête */}
          <div style={{ textAlign: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 18, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 28, height: 28, background: 'var(--accent)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShoppingBag size={14} color="var(--bg)" />
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{nomBoutique.toUpperCase()}</div>
            </div>
            {boutique?.adresse && <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>{boutique.adresse}</div>}
            {boutique?.nif && <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 2 }}>NIF : {boutique.nif}</div>}
          </div>

          {/* Passager */}
          {sale.passengerName && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--c-info-dim)', borderRadius: 7, border: '1px solid rgba(96,165,250,0.2)', fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: 'var(--c-info)', marginBottom: 2 }}>✈ {sale.passengerName}</div>
              <div style={{ color: 'var(--text-3)', fontFamily: 'IBM Plex Mono, monospace' }}>
                Vol {sale.flightRef} → {sale.destination}
              </div>
            </div>
          )}

          {/* Articles */}
          <div style={{ marginBottom: 16 }}>
            {sale.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.product.nom || item.product.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'IBM Plex Mono, monospace' }}>
                    {item.quantity} × {fmt(item.unitPrice, item.currency)}
                    {item.discount > 0 && <span style={{ color: 'var(--c-up)', marginLeft: 5 }}>−{item.discount}%</span>}
                  </div>
                </div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'var(--text)' }}>
                  {fmt(item.total, item.currency)}
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div style={{ borderTop: '1px solid var(--border-2)', paddingTop: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Total payé</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>
                {fmt(sale.total, sale.currency)}
              </div>
            </div>
            {changeXOF > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: 'var(--text-3)' }}>
                <span>Monnaie rendue</span>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--c-up)', fontWeight: 600 }}>
                  {new Intl.NumberFormat('fr-FR').format(Math.round(changeXOF))} F
                </span>
              </div>
            )}
          </div>

          {/* Paiements */}
          <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
            {sale.payments.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                <span style={{ color: 'var(--text-3)' }}>{p.method === 'especes' ? 'Espèces' : p.method === 'carte' ? 'Carte bancaire' : 'Mobile Money'}</span>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600, color: 'var(--text)' }}>{fmt(p.amount, p.currency)}</span>
              </div>
            ))}
          </div>

          {/* Pied ticket */}
          <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-3)', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', marginBottom: 4 }}>
              {new Date(sale.createdAt).toLocaleString('fr-FR')} · {currentUser?.registerId}
            </div>
            <div style={{ textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent)', fontWeight: 700, marginTop: 6 }}>
              Merci pour votre achat
            </div>
            <div style={{ marginTop: 2, letterSpacing: '0.05em' }}>Conservez ce ticket — Goods purchased Duty Free</div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handlePrint} className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', gap: 7 }}>
              <Printer size={14} /> Imprimer
            </button>
            <button
              onClick={usbConnected ? handleUsbPrint : handleUsbConnect}
              disabled={usbConnecting}
              className="btn btn-ghost"
              style={{ flex: 1, justifyContent: 'center', gap: 7, color: usbConnected ? 'var(--c-up)' : 'var(--text-3)', borderColor: usbConnected ? 'rgba(34,197,94,0.3)' : undefined }}
            >
              <Usb size={14} />
              {usbConnecting ? 'Connexion…' : usbConnected ? 'Ticket USB' : 'Relier imprimante'}
            </button>
          </div>
          <button onClick={onClose} className="btn btn-primary" style={{ justifyContent: 'center', gap: 7 }}>
            <RotateCcw size={14} /> Nouvelle vente
          </button>
        </div>
      </div>
    </div>
  );
}
