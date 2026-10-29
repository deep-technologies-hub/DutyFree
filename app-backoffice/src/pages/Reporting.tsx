import { useState } from 'react';
import { useBackofficeStore } from '../store/backofficeStore';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { Download } from 'lucide-react';

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));
const fmtM = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} M` : fmt(n);

const G = ['#1E3A8A', '#14B8A6', '#F59E0B', '#60A5FA', '#8B5CF6', '#E53E3E', '#C9524A'];

const PERIODS = ['Journalier', 'Décade', 'Mensuel', 'Vacation'];
const AXES = ['CA Total', 'Tickets', 'CA Moyen', 'Taux Capture'];

function CT({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 5, padding: '8px 12px', fontSize: 12, boxShadow: 'var(--sh-lg)' }}>
      {label && <div style={{ color: 'var(--text-3)', fontSize: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>}
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color || p.stroke, flexShrink: 0 }} />
          <span style={{ fontFamily: 'IBM Plex Mono,monospace', color: 'var(--text)' }}>{typeof p.value === 'number' ? fmt(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

function STitle({ label, title }: { label: string; title: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="section-label" style={{ marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: 'IBM Plex Sans, system-ui, sans-serif', fontSize: 18, fontWeight: 500, color: 'var(--text)' }}>{title}</div>
    </div>
  );
}

export default function Reporting() {
  const { dashboardData, fetchDashboard, tauxCapture } = useBackofficeStore();
  const [period, setPeriod] = useState('Journalier');
  const [axe, setAxe] = useState('CA Total');
  const dataKey = axe === 'Tickets' ? 'tickets' : 'ca';

  // Montants DRF (chaînes) convertis en nombres ; libellé court du jour pour l'axe
  const dailyCA = (dashboardData?.ca_daily || []).map(d => ({
    ...d, ca: Number(d.ca), date: new Date(d.jour).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
  }));
  const caByCategory = (dashboardData?.ca_by_categorie || []).map(c => ({ ...c, ca: Number(c.ca) }));
  const passengerData = tauxCapture;

  const total30 = dailyCA.reduce((s, d) => s + (d.ca || 0), 0);

  return (
    <div className="fade-in" style={{ padding: '26px 28px', maxWidth: 1440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }}>
        <div>
          <div className="page-eyebrow">Analyse commerciale</div>
          <h1 className="page-title">Reporting</h1>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ gap: 5 }}><Download size={12} /> Exporter Excel</button>
      </div>
      <hr className="rule" style={{ marginBottom: 20 }} />

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div className="section-label" style={{ marginBottom: 6 }}>Période</div>
          <div style={{ display: 'flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
            {PERIODS.map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{ padding: '6px 12px', border: 'none', background: p === period ? 'var(--surface-4)' : 'transparent', color: p === period ? 'var(--text)' : 'var(--text-3)', fontSize: 11, fontWeight: p === period ? 700 : 400, cursor: 'pointer', transition: 'all 0.1s' }}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="section-label" style={{ marginBottom: 6 }}>Axe</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {AXES.map(a => (
              <button key={a} onClick={() => setAxe(a)} style={{ padding: '5px 11px', borderRadius: 4, border: `1px solid ${a === axe ? 'var(--accent-border)' : 'var(--border)'}`, background: a === axe ? 'var(--accent-dim)' : 'transparent', color: a === axe ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, fontWeight: a === axe ? 700 : 500, cursor: 'pointer', transition: 'all 0.1s' }}>
                {a}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <select style={{ width: 150, fontSize: 12 }}>
            <option>Toutes les caisses</option>
            <option>CAISSE-01</option>
            <option>CAISSE-02</option>
          </select>
          <select style={{ width: 150, fontSize: 12 }}>
            <option>Toutes catégories</option>
            <option>Alcools</option>
            <option>Parfums</option>
            <option>Tabac</option>
          </select>
        </div>
      </div>

      {/* Graphe principal */}
      <div className="card" style={{ padding: '18px 20px', marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <STitle label={`Vue ${period.toLowerCase()}`} title={`${axe} — 30 derniers jours`} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'IBM Plex Mono,monospace', fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>{fmtM(total30)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>XOF sur 30 jours</div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={dailyCA} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.5} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
              tickFormatter={v => axe === 'CA Total' ? `${(v / 1_000_000).toFixed(1)}M` : String(v)} />
            <Tooltip content={<CT />} />
            <Line type="monotone" dataKey={dataKey} stroke="#3D75C4" strokeWidth={1.5} dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: '#3D75C4' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Catégories + taux capture */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

        {/* CA par catégorie */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <STitle label="Analyse par famille" title="CA par catégorie" />
          <table className="data-table">
            <thead><tr>
              <th>Catégorie</th>
              <th style={{ textAlign: 'right' }}>CA (XOF)</th>
              <th style={{ textAlign: 'right' }}>Tickets</th>
              <th>Part</th>
            </tr></thead>
            <tbody>
              {caByCategory.map((c, i) => {
                const categoryName = c.lignes__produit__categorie || 'Non catégorisé';
                const totalCA = caByCategory.reduce((sum, cat) => sum + cat.ca, 0);
                const part = totalCA > 0 ? (c.ca / totalCA) * 100 : 0;

                return (
                  <tr key={categoryName}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 1, background: G[i % G.length], flexShrink: 0 }} />
                        <span style={{ color: 'var(--text)', fontWeight: i === 0 ? 600 : 400 }}>{categoryName}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono,monospace', fontSize: 11 }}>{fmt(c.ca)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono,monospace', fontSize: 11 }}>{c.tickets}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ flex: 1, height: 3, background: 'var(--surface-3)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${part}%`, background: G[i % G.length], borderRadius: 2, transition: 'width 0.5s' }} />
                        </div>
                        <span style={{ fontFamily: 'IBM Plex Mono,monospace', fontSize: 10, color: 'var(--text-3)', minWidth: 26 }}>{part.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Taux de capture */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <STitle label="Données aéroport" title="Taux de capture mensuel" />
          <ResponsiveContainer width="100%" height={165}>
            <BarChart data={passengerData} barSize={16} margin={{ top: 2, right: 2, bottom: 0, left: -20 }}>
              <XAxis
                dataKey={(p: any) => new Date(p.annee, p.mois - 1).toLocaleDateString('fr-FR', { month: 'short' })}
                tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
              />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CT />} />
              <Bar dataKey="tickets" radius={[2, 2, 0, 0]}>
                {passengerData.map((_, i) => (
                  <Cell key={i} fill={i === passengerData.length - 1 ? '#1E3A8A' : 'var(--surface-4)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 10 }}>
            {passengerData.slice(-3).map(p => (
              <div key={`${p.annee}-${p.mois}`} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '9px 11px', textAlign: 'center' }}>
                <div className="section-label" style={{ marginBottom: 3 }}>
                  {new Date(p.annee, p.mois - 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}
                </div>
                <div style={{ fontFamily: 'IBM Plex Mono,monospace', fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>{p.taux}%</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{p.tickets} t. / {fmt(p.passagers)} pax</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
