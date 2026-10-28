import { useState, useEffect, useRef } from 'react';
import { useBackofficeStore } from '../store/backofficeStore';
import { ventesApi, wsUrl } from '../api';
import { TrendingUp, TrendingDown, Minus, WifiOff, Zap, Download, Users } from 'lucide-react';
import { METHODES } from '../utils/exports';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));
const fmtM = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)} K` : fmt(n);
const G = ['#EA580C', '#14B8A6', '#F59E0B', '#3B82F6', '#8B5CF6', '#E53E3E'];

function useWS() {
  const [status, setStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [alerts, setAlerts] = useState<{ level: string; message: string }[]>([]);
  const [lastSale, setLastSale] = useState<{ caisse: string; total: number } | null>(null);
  const ws = useRef<WebSocket | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    let mounted = true;
    const go = () => {
      if (!mounted) return;
      try {
        const s = new WebSocket(wsUrl('/ws/stock/')); ws.current = s;
        s.onopen = () => { if (mounted) setStatus('live'); else s.close(); };
        s.onmessage = ({ data }) => { 
          if (!mounted) return;
          try { 
            const m = JSON.parse(data); 
            if (m.type === 'alert') setAlerts(p => [{ level: m.level, message: m.message }, ...p.slice(0, 3)]); 
            if (m.type === 'new_sale') { setLastSale({ caisse: m.caisse, total: m.total }); setTimeout(() => { if (mounted) setLastSale(null); }, 4000); } 
          } catch { } 
        };
        s.onclose = () => { if (mounted) { setStatus('offline'); t = setTimeout(go, 3000); } };
        s.onerror = () => s.close();
      } catch { if (mounted) { setStatus('offline'); t = setTimeout(go, 5000); } }
    };
    t = setTimeout(go, 150); // slight defer for React 18 strict mode
    return () => { 
      mounted = false; 
      clearTimeout(t); 
      if (ws.current) {
        ws.current.onclose = null;
        if (ws.current.readyState === 1 /* OPEN */) {
          ws.current.close();
        }
      } 
    };
  }, []);
  return { status, alerts, lastSale };
}

function CT({ active, payload, label, unit = '' }: any) {
  if (!active || !payload?.length) return null;
  return <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 5, padding: '8px 12px', fontSize: 12, boxShadow: 'var(--sh-lg)' }}>
    {label && <div style={{ color: 'var(--text-3)', fontSize: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>}
    {payload.map((p: any) => <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, flexShrink: 0 }} /><span style={{ fontFamily: 'IBM Plex Mono,monospace', color: 'var(--text)' }}>{typeof p.value === 'number' ? fmt(p.value) : p.value}{unit ? ' ' + unit : ''}</span></div>)}
  </div>;
}

function KpiCard({ label, value, curr, prev, sub, accent }: { label: string; value: string; curr: number; prev: number; sub: string; accent?: string }) {
  const isZeroData = prev === 0;
  const g = isZeroData ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;
  const up = g >= 0; 
  const flat = Math.abs(g) < 0.1 || (isZeroData && curr === 0);
  
  return <div className="card" style={{ padding: '16px 18px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 11 }}>
      <span className="section-label">{label}</span>
      <span className={`delta ${flat ? 'delta-flat' : up ? 'delta-up' : 'delta-down'}`}>
        {flat ? <Minus size={8} /> : up ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
        {flat ? '—' : isZeroData && curr > 0 ? 'Nouv.' : `${up ? '+' : ''}${g.toFixed(1)}%`}
      </span>
    </div>
    <div className="stat-number" style={{ color: accent || 'var(--text)', marginBottom: 4 }}>{value}</div>
    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{sub}</div>
  </div>;
}

function STitle({ children }: { children: string }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
    <span className="section-label">{children}</span>
    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
  </div>;
}

export default function Dashboard() {
  const { dashboardData, fetchDashboard, tauxCapture, fetchTauxCapture, user } = useBackofficeStore();
  const { status, alerts, lastSale } = useWS();
  const [now, setNow] = useState(new Date());

  const [showPassagersModal, setShowPassagersModal] = useState(false);
  const [passagersForm, setPassagersForm] = useState({
    annee: new Date().getFullYear(),
    mois: new Date().getMonth() + 1,
    nombre_passagers: ''
  });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load dashboard data if not available
  useEffect(() => {
    if (!dashboardData) fetchDashboard();
    if (tauxCapture.length === 0) fetchTauxCapture();
  }, [dashboardData, fetchDashboard, tauxCapture.length, fetchTauxCapture]);

  const exportToExcel = () => {
    if (!dashboardData) return;
    let csv = "CATÉGORIE,CA_XOF,TICKETS\n";
    dashboardData.ca_by_categorie.forEach(c => {
      csv += `"${c.lignes__produit__categorie}",${c.ca},${c.tickets}\n`;
    });
    csv += "\nCAISSIER,CA_XOF,TICKETS\n";
    dashboardData.ca_by_cashier.forEach(c => {
      csv += `"${c.caissier__first_name} ${c.caissier__last_name}",${c.ca},${c.tickets}\n`;
    });
    const pData = (dashboardData as any).ca_by_payment || [];
    csv += "\nMOYEN_PAIEMENT,CA_XOF\n";
    pData.forEach((p: any) => {
      csv += `"${p.paiements__methode}",${p.amount}\n`;
    });
    csv += `\nTAUX_DE_CAPTURE_MENSUEL,${currentMonthCapture? currentMonthCapture.taux : 0}%\n`;
    
    // Blob
    const blob = new Blob(["\ufeff"+csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporting_DutyFree_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const submitPassagers = async () => {
    try {
      await ventesApi.passagers.create({
        annee: passagersForm.annee,
        mois: passagersForm.mois,
        nombre_passagers: parseInt(passagersForm.nombre_passagers)
      });
      await fetchTauxCapture();
      setShowPassagersModal(false);
      setPassagersForm({ ...passagersForm, nombre_passagers: '' });
      alert('Données passagers enregistrées avec succès.');
    } catch {
      alert('Erreur: données pour ce mois déjà existantes ou problème de réseau.');
    }
  };

  // Libellé court du jour (« 28/10 ») pour l'axe des abscisses ; montants DRF convertis en nombres
  const dailyCA = (dashboardData?.ca_daily || []).map(d => ({
    ...d, ca: Number(d.ca), date: new Date(d.jour).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
  }));
  const caByCategory = (dashboardData?.ca_by_categorie || []).map(c => ({ ...c, ca: Number(c.ca) }));
  const caByPayment = (dashboardData?.ca_by_payment || []).map(p => ({
    method: METHODES[p.paiements__methode] ?? p.paiements__methode,
    amount: Number(p.amount),
  }));
  const caByCashier = dashboardData?.ca_by_cashier || [];

  // Calculate KPIs from API data
  const last7 = dailyCA.slice(-7);
  const todayCA = dailyCA[dailyCA.length - 1]?.ca || 0;
  const yesterdayCA = dailyCA[dailyCA.length - 2]?.ca || 0;
  const totalTickets = dailyCA.reduce((sum, d) => sum + (d.tickets || 0), 0);
  const avgTicket = totalTickets > 0 ? dailyCA.reduce((sum, d) => sum + (d.ca || 0), 0) / totalTickets : 0;

  const currentMonthCapture = tauxCapture.find(t => t.annee === new Date().getFullYear() && t.mois === new Date().getMonth() + 1);
  const currTauxValue = currentMonthCapture ? currentMonthCapture.taux : 0;
  const currPaxNumber = currentMonthCapture ? currentMonthCapture.passagers : 0;

  return (
    <div className="fade-in" style={{ padding: '26px 28px', maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }}>
        <div>
          <div className="page-eyebrow">{user?.organisation?.nom}</div>
          <h1 className="page-title">Tableau de bord</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setShowPassagersModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 10px', fontSize: 11, color: 'var(--text)', cursor: 'pointer' }}>
            <Users size={12} /> Saisir Passagers
          </button>
          <button onClick={exportToExcel} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--c-up-dim)', border: '1px solid var(--c-up-bd)', borderRadius: 4, padding: '4px 10px', fontSize: 11, color: 'var(--c-up)', fontWeight: 600, cursor: 'pointer' }}>
            <Download size={12} /> Export Excel
          </button>
          {lastSale && <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--c-up-dim)', border: '1px solid var(--c-up-bd)', borderRadius: 4, padding: '4px 8px', fontSize: 11, color: 'var(--c-up)', fontWeight: 600, animation: 'fadeIn 0.2s ease' }}><Zap size={10} />{lastSale.caisse} · {fmt(lastSale.total)} XOF</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4 }}>
            {status === 'live' ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-up)', animation: 'pulse 2s infinite', flexShrink: 0 }} /> : status === 'connecting' ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-warn)', flexShrink: 0 }} /> : <WifiOff size={10} color="var(--text-3)" />}
            <span style={{ fontSize: 10, fontWeight: 600, color: status === 'live' ? 'var(--c-up)' : 'var(--text-3)', letterSpacing: '0.06em' }}>{status === 'live' ? 'LIVE' : status === 'connecting' ? 'SYNC' : 'HORS LIGNE'}</span>
          </div>
          <div style={{ fontFamily: 'IBM Plex Mono,monospace', fontSize: 13, color: 'var(--text-3)', minWidth: 68, textAlign: 'right' }}>{now.toLocaleTimeString('fr-FR')}</div>
        </div>
      </div>

      {/* Alertes */}
      {alerts.length > 0 && <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>{alerts.map((a, i) => <div key={i} className={`alert ${a.level === 'danger' ? 'alert-red' : 'alert-warn'}`} style={{ fontSize: 11, padding: '5px 10px' }}>{a.message}</div>)}</div>}

      {/* KPI row */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 7, marginBottom: 18 }}>
        <KpiCard label="Chiffre d'affaires" value={fmtM(todayCA) + ' XOF'} curr={todayCA} prev={yesterdayCA} sub="aujourd'hui" accent="var(--accent)" />
        <KpiCard label="Tickets émis" value={fmt(totalTickets)} curr={totalTickets} prev={0} sub="transactions" />
        <KpiCard label="Ticket moyen" value={fmt(avgTicket) + ' F'} curr={avgTicket} prev={0} sub="CA / ticket" />
        <KpiCard label="Taux de capture" value={currTauxValue + '%'} curr={currTauxValue} prev={0} sub="tickets / passagers" accent="var(--c-info)" />
        <KpiCard label="Passagers" value={fmt(currPaxNumber)} curr={currPaxNumber} prev={0} sub="données aéroport" />
      </div>

      {/* Row 1 : Area + Donut */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 290px', gap: 7, marginBottom: 7 }}>
        <div className="card" style={{ padding: '16px 18px' }}>
          <STitle>Évolution CA — 7 derniers jours</STitle>
          {last7.length === 0 ? <div className="empty-state"><strong>Aucune vente</strong>Le chiffre d'affaires apparaîtra ici dès la première vente.</div> : (
          <ResponsiveContainer width="100%" height={185}>
            <AreaChart data={last7} margin={{ top: 2, right: 2, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="gCA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3D75C4" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="#3D75C4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => fmtM(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CT unit="XOF" />} />
              <Area type="monotone" dataKey="ca" stroke="#3D75C4" strokeWidth={1.5} fill="url(#gCA)" dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: '#3D75C4' }} />
            </AreaChart>
          </ResponsiveContainer>
          )}
        </div>

        <div className="card" style={{ padding: '16px 18px' }}>
          <STitle>Catégories</STitle>
          {caByCategory.length === 0 ? <div className="empty-state"><strong>Aucune vente</strong>Répartition du CA du mois par catégorie.</div> : <>
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie data={caByCategory} cx="50%" cy="50%" innerRadius={32} outerRadius={50} dataKey="ca" paddingAngle={2} stroke="none">
                {caByCategory.map((_, i) => <Cell key={i} fill={G[i % G.length]} />)}
              </Pie>
              <Tooltip content={<CT />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
            {caByCategory.slice(0, 5).map((d, i) => {
              const categoryName = d.lignes__produit__categorie || 'Non catégorisé';
              const totalCA = caByCategory.reduce((sum, cat) => sum + cat.ca, 0);
              const part = totalCA > 0 ? (d.ca / totalCA) * 100 : 0;

              return (
                <div key={categoryName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 1, background: G[i], flexShrink: 0 }} />
                    <span style={{ color: 'var(--text-2)' }}>{categoryName}</span>
                  </div>
                  <span style={{ fontFamily: 'IBM Plex Mono,monospace', fontSize: 10, color: 'var(--text-3)' }}>{part.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
          </>}
        </div>
      </div>

      {/* Row 2 : Barres + Règlements + Caissiers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
        <div className="card" style={{ padding: '16px 18px' }}>
          <STitle>Tickets / jour</STitle>
          {dailyCA.length === 0 ? <div className="empty-state"><strong>Aucune vente</strong>Nombre de tickets des 8 derniers jours.</div> : (
          <ResponsiveContainer width="100%" height={155}>
            <BarChart data={dailyCA.slice(-8)} margin={{ top: 2, right: 0, bottom: 0, left: -24 }} barSize={10}>
              <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CT />} />
              <Bar dataKey="tickets" radius={[2, 2, 0, 0]}>
                {dailyCA.slice(-8).map((_, i, arr) => <Cell key={i} fill={i === arr.length - 1 ? '#2EAD78' : 'var(--surface-4)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          )}
        </div>

        <div className="card" style={{ padding: '16px 18px' }}>
          <STitle>Modes de règlement</STitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 4 }}>
            {caByPayment.length === 0 ? (
              <div className="empty-state"><strong>Aucune vente</strong>Encaissements du mois par moyen de paiement.</div>
            ) : caByPayment.map((d, i) => {
              const w = Math.round((d.amount / Math.max(...caByPayment.map(x => x.amount))) * 100);
              return <div key={d.method}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{d.method}</span>
                  <span style={{ fontFamily: 'IBM Plex Mono,monospace', fontSize: 10, color: 'var(--text)' }}>{fmtM(d.amount)}</span>
                </div>
                <div style={{ background: 'var(--surface-3)', borderRadius: 2, height: 3 }}>
                  <div style={{ width: `${w}%`, height: '100%', borderRadius: 2, background: G[i % G.length], transition: 'width 0.5s' }} />
                </div>
              </div>;
            })}
          </div>
        </div>

        <div className="card" style={{ padding: '16px 18px' }}>
          <STitle>Caissiers</STitle>
          {caByCashier.length === 0 && <div className="empty-state"><strong>Aucune vente</strong>Classement des caissiers du mois.</div>}
          {caByCashier.map((d, i) => {
            const cashierName = `${d.caissier__first_name} ${d.caissier__last_name}`.trim();
            return (
              <div key={cashierName} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: i < caByCashier.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 22, height: 22, borderRadius: 4, flexShrink: 0, background: G[i % G.length] + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: G[i % G.length] }}>
                  {cashierName.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cashierName}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'IBM Plex Mono,monospace' }}>{d.tickets} tickets</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontFamily: 'IBM Plex Mono,monospace', fontWeight: 500, color: 'var(--text)' }}>{fmtM(d.ca)}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-3)' }}>XOF</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showPassagersModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div className="card" style={{ width: '90%', maxWidth: 450, padding: 24 }}>
            <h3 style={{ marginBottom: 16, fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Saisir passagers (Mois)</h3>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>Ces données (fournies par l'aéroport) permettent de calculer le taux de capture de la boutique.</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: 'var(--text-3)' }}>Année</label>
                <input type="number" value={passagersForm.annee} onChange={e=>setPassagersForm({...passagersForm, annee: parseInt(e.target.value)})} style={{ width: '100%', padding: '8px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: 'var(--text-3)' }}>Mois (1-12)</label>
                <input type="number" value={passagersForm.mois} onChange={e=>setPassagersForm({...passagersForm, mois: parseInt(e.target.value)})} style={{ width: '100%', padding: '8px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)' }} min={1} max={12} />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: 'var(--text-3)' }}>Embarquements (Nombre de passagers)</label>
              <input type="number" value={passagersForm.nombre_passagers} onChange={e=>setPassagersForm({...passagersForm, nombre_passagers: e.target.value})} style={{ width: '100%', padding: '8px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)' }} placeholder="Ex: 45000" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={()=>setShowPassagersModal(false)} style={{ background: 'transparent', border: '1px solid var(--border-2)', borderRadius: 6, padding: '8px 16px', color: 'var(--text-2)', cursor: 'pointer' }}>Annuler</button>
              <button 
                onClick={submitPassagers} 
                disabled={!passagersForm.nombre_passagers}
                style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '8px 16px', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: !passagersForm.nombre_passagers ? 0.5 : 1 }}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
