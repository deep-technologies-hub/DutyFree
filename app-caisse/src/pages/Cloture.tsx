import { useState, useRef, useEffect } from 'react';
import { useCaisseStore } from '../store/caisseStore';
import { FileText, WifiOff, LogOut, ChevronLeft, TrendingUp, ShoppingBag } from 'lucide-react';

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));

function SignaturePad({ id }: { id: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#4F46E5'; // Accent color for signature
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, []);

  const getCoordinates = (canvas: HTMLCanvasElement, e: React.MouseEvent | React.TouchEvent) => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).nativeEvent.offsetX, y: (e as React.MouseEvent).nativeEvent.offsetY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      const { x, y } = getCoordinates(canvas, e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };
  
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault(); // Prevent scrolling on touch
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      const { x, y } = getCoordinates(canvas, e);
      ctx.lineTo(x, y);
      ctx.stroke();
      if (!hasSig) setHasSig(true);
    }
  };

  const stopDraw = () => setIsDrawing(false);
  
  const clear = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0,0, canvas.width, canvas.height);
      setHasSig(false);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', marginBottom: 8 }}>
      <canvas
        ref={canvasRef}
        width={300}
        height={80}
        style={{ width: '100%', height: 80, background: 'var(--surface-2)', borderRadius: 6, border: '1px solid var(--border)', cursor: 'crosshair', touchAction: 'none' }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      {hasSig && (
        <button onClick={clear} style={{ position: 'absolute', top: 5, right: 5, fontSize: 10, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', zIndex: 2 }}>Effacer</button>
      )}
      {!hasSig && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', color: 'var(--text-3)', fontSize: 11 }}>Signer ici avec la souris ou au doigt</div>}
    </div>
  );
}

export default function Cloture({ onBack }: { onBack: () => void }) {
  const { currentUser, sales, offlineQueue, logout } = useCaisseStore();

  const todaySales = sales.filter(s => {
    const d = new Date(s.createdAt);
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const totalXOF = todaySales.reduce((s, v) => s + v.total, 0);
  const totalArticles = todaySales.reduce((s, v) => s + v.items.reduce((a, i) => a + i.quantity, 0), 0);
  const avgTicket = todaySales.length > 0 ? totalXOF / todaySales.length : 0;

  const byMethod: Record<string, number> = {};
  todaySales.forEach(v => v.payments.forEach(p => { byMethod[p.method] = (byMethod[p.method] || 0) + p.amountXOF; }));

  const byCurrency: Record<string, number> = {};
  todaySales.forEach(v => v.payments.forEach(p => { byCurrency[p.currency] = (byCurrency[p.currency] || 0) + p.amount; }));

  const methodLabel = (m: string) => ({ especes: 'Espèces', carte: 'Carte bancaire', mobile_money: 'Mobile Money' }[m] || m);

  const handleCloture = () => {
    if (confirm('Confirmer la clôture de caisse ? Cette action déconnectera la session.')) logout();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'IBM Plex Sans, sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onBack} className="btn btn-ghost btn-icon"><ChevronLeft size={15} /></button>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Clôture de caisse</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'IBM Plex Mono, monospace' }}>
            {currentUser?.registerId} · {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--border)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 24 }}>
          {[
            { label: 'Chiffre d\'affaires', value: `${fmt(totalXOF)} F`, icon: <TrendingUp size={15} color="var(--accent)" /> },
            { label: 'Tickets émis', value: String(todaySales.length), icon: <FileText size={15} color="var(--c-info)" /> },
            { label: 'Articles vendus', value: String(totalArticles), icon: <ShoppingBag size={15} color="var(--c-up)" /> },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--surface)', padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{k.label}</div>
                {k.icon}
              </div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{k.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>

          {/* Par méthode */}
          <div className="card" style={{ padding: '18px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Par mode de paiement</div>
            {Object.entries(byMethod).length === 0 ? (
              <div style={{ color: 'var(--text-3)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>Aucune vente</div>
            ) : Object.entries(byMethod).map(([m, amount]) => {
              const pct = totalXOF > 0 ? (amount / totalXOF) * 100 : 0;
              return (
                <div key={m} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{methodLabel(m)}</span>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600, color: 'var(--text)' }}>{fmt(amount)} F</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Par devise */}
          <div className="card" style={{ padding: '18px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Encaissements par devise</div>
            {Object.entries(byCurrency).length === 0 ? (
              <div style={{ color: 'var(--text-3)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>Aucune vente</div>
            ) : Object.entries(byCurrency).map(([c, amount]) => (
              <div key={c} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 4 }}>{c}</span>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  {c === 'XOF' ? `${fmt(amount)} F` : c === 'EUR' ? `€${amount.toFixed(2)}` : `$${amount.toFixed(2)}`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Transactions */}
        {todaySales.length > 0 && (
          <div className="card" style={{ overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Transactions de la session ({todaySales.length})
            </div>
            <table className="data-table">
              <thead>
                <tr><th>Ticket</th><th>Heure</th><th>Articles</th><th>Montant</th><th>Mode</th></tr>
              </thead>
              <tbody>
                {todaySales.slice(-10).map((sale, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{sale.ticketNumber}</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{new Date(sale.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={{ fontSize: 12 }}>{sale.items.reduce((s, i) => s + i.quantity, 0)} art.</td>
                    <td className="mono" style={{ fontWeight: 700 }}>{fmt(sale.total)} F</td>
                    <td>
                      {sale.payments.map((p, j) => (
                        <span key={j} className="badge badge-neutral" style={{ fontSize: 9, marginRight: 3 }}>{methodLabel(p.method)}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Alerte sync */}
        {offlineQueue.length > 0 && (
          <div className="alert alert-amber" style={{ marginBottom: 24 }}>
            <WifiOff size={14} style={{ flexShrink: 0 }} />
            <div>
              <strong>{offlineQueue.length} vente(s) en attente de synchronisation.</strong>
              <br />Assurez-vous d'être en ligne avant de clôturer pour éviter toute perte de données.
            </div>
          </div>
        )}

        {/* Zones signature AVEC CANVAS DE DESSIN */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
          {[{ title: 'Signature Caissier', name: currentUser?.name }, { title: 'Visa Superviseur', name: '' }].map(({ title, name }) => (
            <div key={title} className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>{title}</div>
              <SignaturePad id={title} />
              {name && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{name}</div>}
              {!name && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>_____________</div>}
            </div>
          ))}
        </div>

        {/* Ticket moyen */}
        <div className="card" style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Ticket moyen</span>
          <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{fmt(avgTicket)} F</span>
        </div>

        {/* Bouton clôture */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onBack} className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}>
            <ChevronLeft size={14} /> Retour
          </button>
          <button onClick={handleCloture} className="btn btn-danger" style={{ flex: 2, justifyContent: 'center', gap: 7, padding: '12px' }}>
            <LogOut size={15} /> Clôturer la caisse
          </button>
        </div>
      </div>
    </div>
  );
}
