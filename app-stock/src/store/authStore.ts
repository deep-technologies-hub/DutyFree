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
      set({ user, isAuthenticated: true });
    } catch {
      authStorage.clear();
      set({ user: null, isAuthenticated: false });
    }
  },
}));
