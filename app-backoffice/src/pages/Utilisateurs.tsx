import { useState, useEffect, useMemo } from 'react';
import { utilisateursApi, type Utilisateur, type UtilisateurCreate } from '../api';
import {
  UserPlus, Shield, Edit2, Trash2, X, Save, RefreshCw,
  AlertTriangle, CheckCircle, Eye, EyeOff, Lock, ToggleLeft, ToggleRight, Search
} from 'lucide-react';

const ROLES = [
  { value: 'admin', label: 'Administrateur', color: 'var(--accent)', bg: 'var(--accent-dim)' },
  { value: 'superviseur', label: 'Superviseur', color: 'var(--c-info)', bg: 'var(--c-info-dim)' },
  { value: 'stock_manager', label: 'Stock Manager', color: '#7C3AED', bg: 'rgba(124,58,237,0.10)' },
  { value: 'caissier', label: 'Caissier', color: 'var(--c-up)', bg: 'rgba(52,211,153,0.12)' },
];
const roleInfo = (role: string) => ROLES.find(r => r.value === role) || { label: role, color: 'var(--text-2)', bg: 'rgba(156,163,175,0.12)' };

const emptyCreate = (): UtilisateurCreate => ({
  username: '', first_name: '', last_name: '', email: '',
  role: 'caissier', register_id: '', pin: '', phone: '', password: '',
});

// Sous-composants champs
function Field({ label, value, onChange, placeholder = '', type = 'text', required = false }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
        {label}{required && <span style={{ color: 'var(--c-down)', marginLeft: 3 }}>*</span>}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={isPassword && !show ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5, padding: isPassword ? '8px 36px 8px 10px' : '8px 10px', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
        />
        {isPassword && (
          <button type="button" onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 2 }}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5, padding: '8px 10px', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function UtilisateursPage() {
  const [users, setUsers] = useState<Utilisateur[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('Tous');

  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState<Utilisateur | null>(null);
  const [pinModal, setPinModal] = useState<Utilisateur | null>(null);
  const [pwdModal, setPwdModal] = useState<Utilisateur | null>(null);
  const [deleteModal, setDeleteModal] = useState<Utilisateur | null>(null);

  // Formulaires
  const [createForm, setCreateForm] = useState<UtilisateurCreate>(emptyCreate());
  const [editForm, setEditForm] = useState<Partial<Utilisateur>>({});
  const [newPin, setNewPin] = useState('');
  const [newPwd, setNewPwd] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const flash = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); };

  const loadUsers = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await utilisateursApi.list();
      setUsers(res.results);
    } catch {
      setUsers([]);
      setLoadError('Impossible de charger les utilisateurs. Vérifiez la connexion puis rechargez la page.');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadUsers(); }, []);

  const filtered = useMemo(() => users.filter(u => {
    const matchSearch = !search || u.full_name.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'Tous' || u.role === roleFilter;
    return matchSearch && matchRole;
  }), [users, search, roleFilter]);

  // Stats
  const statsByRole = ROLES.map(r => ({ ...r, count: users.filter(u => u.role === r.value).length }));

  // ── Handlers ──────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!createForm.username || !createForm.first_name || !createForm.last_name || !createForm.password) {
      setError('Username, prénom, nom et mot de passe sont obligatoires.'); return;
    }
    setSaving(true); setError('');
    try {
      await utilisateursApi.create(createForm);
      await loadUsers();
      setCreateModal(false);
      setCreateForm(emptyCreate());
      flash('Utilisateur créé avec succès');
    } catch (e: unknown) { setError((e as { message?: string })?.message || 'Erreur serveur'); }
    finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!editModal) return;
    setSaving(true); setError('');
    try {
      await utilisateursApi.update(editModal.id, editForm);
      await loadUsers();
      setEditModal(null);
      flash('Utilisateur mis à jour');
    } catch (e: unknown) { setError((e as { message?: string })?.message || 'Erreur serveur'); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (u: Utilisateur) => {
    try {
      await utilisateursApi.toggleActive(u.id, !u.is_active);
      await loadUsers();
      flash(u.is_active ? 'Compte désactivé' : 'Compte activé');
    } catch { flash('Erreur lors du changement de statut'); }
  };

  const handleResetPin = async () => {
    if (!pinModal || newPin.length < 4) { setError('Le PIN doit comporter au moins 4 chiffres.'); return; }
    setSaving(true); setError('');
    try {
      await utilisateursApi.resetPin(pinModal.id, newPin);
      setPinModal(null); setNewPin('');
      flash('PIN réinitialisé');
    } catch (e: unknown) { setError((e as { message?: string })?.message || 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleResetPwd = async () => {
    if (!pwdModal || newPwd.length < 6) { setError('Le mot de passe doit comporter au moins 6 caractères.'); return; }
    setSaving(true); setError('');
    try {
      await utilisateursApi.resetPassword(pwdModal.id, newPwd);
      setPwdModal(null); setNewPwd('');
      flash('Mot de passe réinitialisé');
    } catch (e: unknown) { setError((e as { message?: string })?.message || 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    setSaving(true);
    try {
      await utilisateursApi.delete(deleteModal.id);
      await loadUsers();
      setDeleteModal(null);
      flash('Utilisateur supprimé');
    } catch { flash('Erreur lors de la suppression'); }
    finally { setSaving(false); }
  };

  const openEdit = (u: Utilisateur) => {
    setEditForm({ first_name: u.first_name, last_name: u.last_name, email: u.email, role: u.role, register_id: u.register_id, phone: u.phone });
    setError('');
    setEditModal(u);
  };

  const setCreateField = (k: keyof UtilisateurCreate, v: string) => setCreateForm(f => ({ ...f, [k]: v }));
  const setEditField = (k: keyof Utilisateur, v: unknown) => setEditForm(f => ({ ...f, [k]: v }));

  // ── Composant modal réutilisable ──────────────────────────────────
  const ModalShell = ({ title, onClose, children, footer }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 8, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)' }}><X size={17} /></button>
        </div>
        <div style={{ padding: '22px 24px' }}>
          {error && (
            <div style={{ background: 'var(--c-down-dim)', border: '1px solid var(--c-down-bd)', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#DC2626', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
              <AlertTriangle size={13} /> {error}
            </div>
          )}
          {children}
        </div>
        {footer && <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>{footer}</div>}
      </div>
    </div>
  );

  const BtnSave = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button onClick={onClick} disabled={saving} className="btn btn-primary" style={{ gap: 6, opacity: saving ? 0.7 : 1 }}>
      {saving ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
      {label}
    </button>
  );
  const BtnCancel = ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} className="btn btn-outline" style={{ fontSize: 12 }}>Annuler</button>
  );

  // ── Rendu ─────────────────────────────────────────────────────────
  return (
    <div className="fade-in" style={{ padding: '36px 40px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Toast */}
      {loadError && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 6, background: 'var(--c-down-dim)', color: 'var(--c-down)', fontSize: 13 }}>{loadError}</div>
      )}
      {successMsg && (
        <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, background: 'var(--c-up)', borderRadius: 7, padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}>
          <CheckCircle size={15} /> {successMsg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div className="page-eyebrow">Accès & Sécurité</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h1 className="page-title">Utilisateurs</h1>
          <button onClick={() => { setCreateForm(emptyCreate()); setError(''); setCreateModal(true); }} className="btn btn-primary" style={{ gap: 6 }}>
            <UserPlus size={13} /> Nouvel utilisateur
          </button>
        </div>
        <hr className="rule" style={{ marginTop: 16 }} />
      </div>

      {/* KPIs par rôle */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, marginBottom: 28, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
        {statsByRole.map(r => (
          <div key={r.value} style={{ background: 'var(--surface)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="section-label" style={{ marginBottom: 5 }}>{r.label}s</div>
              <div className="mono" style={{ fontSize: 26, fontWeight: 600, color: 'var(--text)' }}>{r.count}</div>
            </div>
            <div style={{ padding: '8px', background: r.bg, borderRadius: '50%' }}>
              <Shield size={16} color={r.color} />
            </div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 280px' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par nom, login, email..."
            style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5, padding: '8px 10px 8px 30px', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['Tous', ...ROLES.map(r => r.value)].map(r => (
            <button key={r} onClick={() => setRoleFilter(r)}
              style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid', borderColor: roleFilter === r ? 'var(--accent)' : 'var(--border)', background: roleFilter === r ? 'var(--accent-dim)' : 'transparent', color: roleFilter === r ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              {r === 'Tous' ? 'Tous' : ROLES.find(x => x.value === r)?.label || r}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)' }}>
            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Login / Email</th>
                <th>Rôle</th>
                <th>Caisse / ID</th>
                <th>Téléphone</th>
                <th>Dernière connexion</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--text-2)' }}>Aucun utilisateur</td></tr>
              ) : filtered.map(u => {
                const ri = roleInfo(u.role);
                const initials = `${u.first_name[0] || ''}${u.last_name[0] || ''}`.toUpperCase();
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: ri.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: ri.color, flexShrink: 0 }}>
                          {initials}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{u.full_name}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="mono" style={{ fontSize: 12, color: 'var(--text)', marginBottom: 2 }}>{u.username}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{u.email}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 700, background: ri.bg, color: ri.color, borderRadius: 4, padding: '3px 8px' }}>
                        {ri.label}
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{u.register_id || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{u.phone || '—'}</td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>
                      {u.last_login ? new Date(u.last_login).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td>
                      <button onClick={() => handleToggleActive(u)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: u.is_active ? 'var(--c-up)' : 'var(--text-2)', fontSize: 11, fontWeight: 600, padding: 0 }}>
                        {u.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        {u.is_active ? 'Actif' : 'Inactif'}
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => openEdit(u)} title="Modifier" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', cursor: 'pointer', color: 'var(--text-2)', display: 'flex' }}>
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => { setNewPin(''); setError(''); setPinModal(u); }} title="Réinitialiser PIN" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', cursor: 'pointer', color: 'var(--text-2)', display: 'flex' }}>
                          <Lock size={12} />
                        </button>
                        <button onClick={() => { setNewPwd(''); setError(''); setPwdModal(u); }} title="Réinitialiser mot de passe" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', cursor: 'pointer', color: 'var(--text-2)', display: 'flex' }}>
                          <Shield size={12} />
                        </button>
                        {u.role !== 'admin' && (
                          <button onClick={() => setDeleteModal(u)} title="Supprimer" style={{ background: 'var(--c-down-dim)', border: '1px solid var(--c-down-bd)', borderRadius: 4, padding: '5px 8px', cursor: 'pointer', color: 'var(--c-down)', display: 'flex' }}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-2)' }}>{filtered.length} utilisateur{filtered.length !== 1 ? 's' : ''}</div>

      {/* ── MODAL CRÉER ──────────────────────────────────────────── */}
      {createModal && (
        <ModalShell title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><UserPlus size={16} /> Nouvel utilisateur</span>}
          onClose={() => setCreateModal(false)}
          footer={<><BtnCancel onClick={() => setCreateModal(false)} /><BtnSave label="Créer l'utilisateur" onClick={handleCreate} /></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Prénom *" value={createForm.first_name} onChange={v => setCreateField('first_name', v)} placeholder="Aminata" required />
              <Field label="Nom *" value={createForm.last_name} onChange={v => setCreateField('last_name', v)} placeholder="Sawadogo" required />
            </div>
            <Field label="Login (username) *" value={createForm.username} onChange={v => setCreateField('username', v)} placeholder="aminata" required />
            <Field label="Email" value={createForm.email} onChange={v => setCreateField('email', v)} placeholder="a.sawadogo@djbc-df.bf" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <SelectField label="Rôle" value={createForm.role} onChange={v => setCreateField('role', v)} options={ROLES.map(r => ({ value: r.value, label: r.label }))} />
              <Field label="ID Caisse" value={createForm.register_id} onChange={v => setCreateField('register_id', v)} placeholder="CAISSE-03" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Téléphone" value={createForm.phone} onChange={v => setCreateField('phone', v)} placeholder="+226 70 00 00 00" />
              <Field label="PIN caisse (4-6 chiffres)" value={createForm.pin} onChange={v => setCreateField('pin', v)} placeholder="1234" />
            </div>
            <Field label="Mot de passe *" value={createForm.password} onChange={v => setCreateField('password', v)} placeholder="••••••••" type="password" required />
            <div style={{ background: 'var(--c-info-dim)', border: '1px solid var(--c-info-bd)', borderRadius: 5, padding: '10px 14px', fontSize: 12, color: '#1E40AF' }}>
              ℹ Le PIN est utilisé par le caissier pour se connecter à l'app Caisse. Le mot de passe est pour la connexion web.
            </div>
          </div>
        </ModalShell>
      )}

      {/* ── MODAL MODIFIER ───────────────────────────────────────── */}
      {editModal && (
        <ModalShell title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Edit2 size={15} /> Modifier — {editModal.full_name}</span>}
          onClose={() => setEditModal(null)}
          footer={<><BtnCancel onClick={() => setEditModal(null)} /><BtnSave label="Enregistrer" onClick={handleEdit} /></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Prénom" value={editForm.first_name || ''} onChange={v => setEditField('first_name', v)} />
              <Field label="Nom" value={editForm.last_name || ''} onChange={v => setEditField('last_name', v)} />
            </div>
            <Field label="Email" value={editForm.email || ''} onChange={v => setEditField('email', v)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <SelectField label="Rôle" value={editForm.role || 'caissier'} onChange={v => setEditField('role', v)} options={ROLES.map(r => ({ value: r.value, label: r.label }))} />
              <Field label="ID Caisse" value={editForm.register_id || ''} onChange={v => setEditField('register_id', v)} placeholder="CAISSE-01" />
            </div>
            <Field label="Téléphone" value={editForm.phone || ''} onChange={v => setEditField('phone', v)} />
          </div>
        </ModalShell>
      )}

      {/* ── MODAL PIN ────────────────────────────────────────────── */}
      {pinModal && (
        <ModalShell title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Lock size={15} /> Réinitialiser PIN — {pinModal.full_name}</span>}
          onClose={() => setPinModal(null)}
          footer={<><BtnCancel onClick={() => setPinModal(null)} /><BtnSave label="Réinitialiser" onClick={handleResetPin} /></>}>
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
              Ce PIN sera utilisé par <strong>{pinModal.full_name}</strong> pour se connecter à l'application Caisse.
            </p>
            <Field label="Nouveau PIN (4-6 chiffres)" value={newPin} onChange={setNewPin} placeholder="1234" />
          </div>
        </ModalShell>
      )}

      {/* ── MODAL MOT DE PASSE ───────────────────────────────────── */}
      {pwdModal && (
        <ModalShell title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Shield size={15} /> Mot de passe — {pwdModal.full_name}</span>}
          onClose={() => setPwdModal(null)}
          footer={<><BtnCancel onClick={() => setPwdModal(null)} /><BtnSave label="Réinitialiser" onClick={handleResetPwd} /></>}>
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
              Nouveau mot de passe de connexion pour <strong>{pwdModal.full_name}</strong> (min. 6 caractères).
            </p>
            <Field label="Nouveau mot de passe" value={newPwd} onChange={setNewPwd} placeholder="••••••••" type="password" />
          </div>
        </ModalShell>
      )}

      {/* ── MODAL SUPPRESSION ────────────────────────────────────── */}
      {deleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setDeleteModal(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '28px', maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <AlertTriangle size={20} color="#DC2626" />
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Supprimer {deleteModal.full_name} ?</div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 22, lineHeight: 1.5 }}>
              Cette action est irréversible. Toutes les données de cet utilisateur seront dissociées. Son historique de ventes sera conservé.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <BtnCancel onClick={() => setDeleteModal(null)} />
              <button onClick={handleDelete} disabled={saving} style={{ background: '#DC2626', border: 'none', borderRadius: 5, padding: '8px 18px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={12} />} Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
