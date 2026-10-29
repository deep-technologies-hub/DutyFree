import { create } from 'zustand';
import { authApi, authStorage } from '../api';

interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  role: string;
  register_id: string;
  organisation?: { nom: string; slug: string } | null;
}

interface AuthStore {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

// Le serveur applique déjà ces droits ; on évite simplement d'ouvrir une interface inutilisable.
const ROLES_AUTORISES = ['admin', 'superviseur', 'stock_manager'];
const REFUS_ROLE = "Accès refusé : l'application stock est réservée aux gestionnaires de stock, superviseurs et administrateurs.";

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: false,
  error: null,
  isAuthenticated: !!authStorage.getAccess(),

  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      await authApi.login(username, password);
      const user = await authApi.me();
      if (!ROLES_AUTORISES.includes(user.role)) {
        authApi.logout();
        set({ error: REFUS_ROLE, loading: false });
        return false;
      }
      set({ user, isAuthenticated: true, loading: false });
      return true;
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Identifiants incorrects';
      set({ error: msg, loading: false });
      return false;
    }
  },

  logout: () => {
    authApi.logout();
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    if (!authStorage.getAccess()) return;
    try {
      const user = await authApi.me();
      if (!ROLES_AUTORISES.includes(user.role)) throw new Error(REFUS_ROLE);
      set({ user, isAuthenticated: true });
    } catch {
      authStorage.clear();
      set({ user: null, isAuthenticated: false });
    }
  },
}));
