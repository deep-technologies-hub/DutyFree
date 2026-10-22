import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { tenantStorage } from '../api';
import { Eye, EyeOff, Package, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const { login, loading, error } = useAuthStore();
  const isLoading = loading;
  const [organisation, setOrganisation] = useState(tenantStorage.get());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [tick, setTick] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTick(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!organisation || !username || !password) return;
    tenantStorage.set(organisation);
    login(username, password);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', overflow: 'hidden' }}>
      {/* Colonne gauche — branding */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '44px 52px', borderRight: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
        {/* Accent vertical très subtil */}
        <div style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 1, background: 'linear-gradient(180deg,transparent,var(--accent),transparent)', opacity: 0.3 }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'var(--accent)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={18} color="#0C0D11" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>Duty Free Manager</div>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.18em' }}>Stock Management</div>
          </div>
        </div>

        {/* Titre principal */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 14 }}>
            Contrôle & Inventaire
          </div>
          <h1 style={{ fontFamily: 'Playfair Display,Georgia,serif', fontSize: 46, fontWeight: 500, color: 'var(--text)', lineHeight: 1.12, letterSpacing: '-0.02em', marginBottom: 18 }}>
            Votre stock<br />
            <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>sous contrôle</em><br />
            en temps réel
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.65, maxWidth: 360 }}>
            Gestion rigoureuse des flux de marchandises, suivi des sommiers douaniers et optimisation des approvisionnements.
          </p>
        </div>

        {/* Horloge */}
        <div>
          <div style={{ fontFamily: 'IBM Plex Mono,monospace', fontSize: 26, fontWeight: 400, color: 'var(--text-2)', letterSpacing: '0.04em', marginBottom: 4 }}>
            {tick.toLocaleTimeString('fr-FR')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {tick.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Colonne droite — formulaire */}
      <div style={{ width: 440, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '44px 52px' }}>
        <div style={{ marginBottom: 36 }}>
          <div className="section-label" style={{ marginBottom: 7 }}>Connexion</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>Stock Manager</h2>
        </div>

        {error && <div className="alert alert-red" style={{ marginBottom: 18 }}>
          <AlertCircle size={13} style={{ flexShrink: 0 }} /><span>{error}</span>
        </div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="label-xs" style={{ display: 'block', marginBottom: 6 }}>Code entreprise</label>
            <input
              type="text"
              value={organisation}
              onChange={e => setOrganisation(e.target.value)}
              placeholder="ex : ma-boutique"
              autoFocus={!organisation}
              autoComplete="organization"
            />
          </div>
          <div>
            <label className="label-xs" style={{ display: 'block', marginBottom: 6 }}>Identifiant</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Nom d'utilisateur"
              autoFocus={!!organisation}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label-xs" style={{ display: 'block', marginBottom: 6 }}>Mot de passe</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{ paddingRight: 38 }}
              />
              <button
                type="button"
                onClick={() => setShowPwd(p => !p)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 2 }}
              >
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading || !organisation || !username || !password}
            className="btn btn-primary btn-lg"
            style={{ marginTop: 6, justifyContent: 'center', width: '100%' }}
          >
            {isLoading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <div style={{ marginTop: 48, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
            Accès réservé aux gestionnaires de stock.<br />Le code entreprise est fourni par l'administrateur de votre boutique.
          </p>
        </div>
      </div>
    </div>
  );
}
