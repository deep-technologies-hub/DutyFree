import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle, KeyRound } from 'lucide-react';
import { motDePasseApi, tenantStorage } from '../api';

function Cadre({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <KeyRound size={18} color="var(--accent)" />
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{titre}</h1>
        </div>
        {children}
        <div style={{ marginTop: 18, fontSize: 12 }}>
          <Link to="/login" style={{ color: 'var(--text-2)' }}>← Retour à la connexion</Link>
        </div>
      </div>
    </div>
  );
}

const messageErreur = (e: unknown) => (e as { message?: string })?.message || 'Une erreur est survenue.';

/** Demande d'un lien de réinitialisation par email. */
export function MotDePasseOubliePage() {
  const [organisation, setOrganisation] = useState(tenantStorage.get());
  const [email, setEmail] = useState('');
  const [envoye, setEnvoye] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setEnvoye((await motDePasseApi.demander(organisation.trim().toLowerCase(), email)).detail);
    } catch (err) {
      setError(messageErreur(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Cadre titre="Mot de passe oublié">
      {envoye ? (
        <div className="alert alert-green"><CheckCircle size={13} /><span>{envoye}</span></div>
      ) : (
        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          {error && <div className="alert alert-red"><AlertTriangle size={13} /><span>{error}</span></div>}
          <div>
            <label className="label-xs" style={{ display: 'block', marginBottom: 6 }}>Code entreprise</label>
            <input value={organisation} onChange={e => setOrganisation(e.target.value)} required />
          </div>
          <div>
            <label className="label-xs" style={{ display: 'block', marginBottom: 6 }}>Email du compte</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: 'center' }}>
            {loading ? 'Envoi…' : 'Recevoir un lien'}
          </button>
        </form>
      )}
    </Cadre>
  );
}

/** Choix du nouveau mot de passe depuis le lien reçu par email. */
export function ReinitialiserPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirmation) { setError('Les deux mots de passe ne correspondent pas.'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await motDePasseApi.reinitialiser(params.get('uid') || '', params.get('token') || '', password);
      if (res.organisation) tenantStorage.set(res.organisation);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(messageErreur(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Cadre titre="Nouveau mot de passe">
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        {error && <div className="alert alert-red"><AlertTriangle size={13} /><span>{error}</span></div>}
        <div>
          <label className="label-xs" style={{ display: 'block', marginBottom: 6 }}>Nouveau mot de passe (8 caractères min.)</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required autoFocus autoComplete="new-password" />
        </div>
        <div>
          <label className="label-xs" style={{ display: 'block', marginBottom: 6 }}>Confirmation</label>
          <input type="password" value={confirmation} onChange={e => setConfirmation(e.target.value)} minLength={8} required autoComplete="new-password" />
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: 'center' }}>
          {loading ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </Cadre>
  );
}
