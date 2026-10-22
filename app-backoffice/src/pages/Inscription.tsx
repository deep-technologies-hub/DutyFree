import { useEffect, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, BarChart3, Check } from 'lucide-react';
import { saasApi, type Plan } from '../api';
import { useBackofficeStore } from '../store/backofficeStore';

const fmt = (n: number | string) => new Intl.NumberFormat('fr-FR').format(Number(n));
const limite = (n: number | null, unite: string) => (n === null ? `${unite} illimités` : `${fmt(n)} ${unite}`);

const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export default function InscriptionPage() {
  const navigate = useNavigate();
  const { checkAuth } = useBackofficeStore();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plan, setPlan] = useState('business');
  const [form, setForm] = useState({
    nom_organisation: '', slug: '', email: '', telephone: '', pays: 'Burkina Faso',
    admin_first_name: '', admin_last_name: '', admin_username: 'admin', admin_password: '',
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    saasApi.plans().then(setPlans).catch(() => setError('Impossible de charger les offres. Réessayez plus tard.'));
  }, []);

  const set = (k: keyof typeof form, v: string) =>
    setForm(f => ({
      ...f,
      [k]: v,
      ...(k === 'nom_organisation' && !slugTouched ? { slug: slugify(v) } : {}),
    }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await saasApi.inscription({ ...form, plan });
      await checkAuth();
      navigate('/abonnement');
    } catch (err) {
      setError((err as { message?: string })?.message || "L'inscription a échoué.");
    } finally {
      setLoading(false);
    }
  };

  const field = (k: keyof typeof form, label: string, props: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label-xs" style={{ display: 'block', marginBottom: 6 }}>{label}</label>
      <input value={form[k]} onChange={e => set(k, e.target.value)} {...props} />
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '40px 16px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{ width: 32, height: 32, background: 'var(--accent)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChart3 size={16} color="#0C0D11" strokeWidth={2.5} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Duty Free Manager</div>
          <Link to="/login" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-2)' }}>Déjà client ? Se connecter</Link>
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Créez l'espace de votre boutique</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24 }}>
          Essai gratuit, sans engagement. Choisissez une offre — vous pourrez en changer à tout moment.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 28 }}>
          {plans.map(p => {
            const actif = p.code === plan;
            return (
              <button key={p.code} type="button" onClick={() => setPlan(p.code)} className="card"
                style={{ textAlign: 'left', padding: 18, cursor: 'pointer', border: `1.5px solid ${actif ? 'var(--accent)' : 'var(--border)'}`, background: actif ? 'var(--accent-dim)' : 'var(--surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{p.nom}</div>
                  {actif && <Check size={16} color="var(--accent)" />}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: '8px 0 2px' }}>
                  {fmt(p.prix_mensuel_xof)} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)' }}>XOF / mois</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10, minHeight: 32 }}>{p.description}</div>
                <ul style={{ fontSize: 12, color: 'var(--text-2)', paddingLeft: 16, margin: 0, lineHeight: 1.7 }}>
                  <li>{limite(p.max_caisses, 'caisses')}</li>
                  <li>{limite(p.max_utilisateurs, 'utilisateurs')}</li>
                  <li>{limite(p.max_produits, 'produits')}</li>
                </ul>
              </button>
            );
          })}
        </div>

        <form onSubmit={submit} className="card" style={{ padding: 24, display: 'grid', gap: 22 }}>
          {error && <div className="alert alert-red"><AlertTriangle size={13} style={{ flexShrink: 0 }} /><span>{error}</span></div>}

          <div>
            <div className="section-label" style={{ marginBottom: 12 }}>Votre boutique</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {field('nom_organisation', 'Nom de la boutique', { required: true, placeholder: 'Duty Free Aéroport de …' })}
              <div>
                <label className="label-xs" style={{ display: 'block', marginBottom: 6 }}>Code entreprise (connexion)</label>
                <input value={form.slug} required minLength={3} maxLength={40} pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
                  title="Minuscules, chiffres et tirets"
                  onChange={e => { setSlugTouched(true); set('slug', e.target.value.toLowerCase()); }} />
              </div>
              {field('email', 'Email de contact', { type: 'email', required: true })}
              {field('telephone', 'Téléphone')}
              {field('pays', 'Pays')}
            </div>
          </div>

          <div>
            <div className="section-label" style={{ marginBottom: 12 }}>Compte administrateur</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {field('admin_first_name', 'Prénom')}
              {field('admin_last_name', 'Nom')}
              {field('admin_username', 'Identifiant', { required: true, autoComplete: 'username' })}
              {field('admin_password', 'Mot de passe (8 caractères min.)', { type: 'password', required: true, minLength: 8, autoComplete: 'new-password' })}
            </div>
          </div>

          <button type="submit" disabled={loading || !plans.length} className="btn btn-primary btn-lg" style={{ justifyContent: 'center' }}>
            {loading ? 'Création de votre espace…' : "Démarrer l'essai gratuit"}
          </button>
        </form>
      </div>
    </div>
  );
}
