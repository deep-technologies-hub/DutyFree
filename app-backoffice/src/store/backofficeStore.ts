import { create } from 'zustand';
import { ventesApi, authApi, authStorage } from '../api';
import type { DashboardData, VenteListItem, TauxCapture, Me } from '../api';

interface BackofficeStore {
  // Auth
  user: Me | null;
  isAuthenticated: boolean;
  authLoading: boolean;
  authError: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;

  // Dashboard
  dashboardData: DashboardData | null;
  dashboardLoading: boolean;
  isOffline: boolean;
  error: string | null;
  fetchDashboard: () => Promise<void>;

  // Ventes
  ventes: VenteListItem[];
  ventesLoading: boolean;
  fetchVentes: (params?: string) => Promise<void>;

  // Taux capture
  tauxCapture: TauxCapture[];
  fetchTauxCapture: () => Promise<void>;
}

// Le serveur applique déjà ces droits ; on évite simplement d'ouvrir une interface inutilisable.
const ROLES_AUTORISES = ['admin', 'superviseur'];
const REFUS_ROLE = 'Accès refusé : le backoffice est réservé aux administrateurs et superviseurs.';

export const useBackofficeStore = create<BackofficeStore>((set, get) => ({
  user: null,
  isAuthenticated: !!authStorage.getAccess(),
  authLoading: false,
  authError: null,

  login: async (username, password) => {
    set({ authLoading: true, authError: null });
    try {
      await authApi.login(username, password);
      const user = await authApi.me();
      if (!ROLES_AUTORISES.includes(user.role)) {
        authApi.logout();
        set({ authError: REFUS_ROLE, authLoading: false });
        return false;
      }
      set({ user, isAuthenticated: true, authLoading: false });
      return true;
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Identifiants incorrects';
      set({ authError: msg, authLoading: false });
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

  dashboardData: null,
  dashboardLoading: false,
  isOffline: false,
  error: null,

  fetchDashboard: async () => {
    set({ dashboardLoading: true, error: null });
    try {
      const data = await ventesApi.dashboard();
      set({ dashboardData: data, dashboardLoading: false, isOffline: false });
    } catch {
      set({ dashboardData: null, dashboardLoading: false, isOffline: true, error: 'Failed to fetch dashboard data' });
    }
  },

  ventes: [],
  ventesLoading: false,
  fetchVentes: async (params = '') => {
    set({ ventesLoading: true, error: null });
    try {
      const res = await ventesApi.list(params);
      set({ ventes: res.results, ventesLoading: false, isOffline: false });
    } catch {
      set({ ventes: [], ventesLoading: false, isOffline: true, error: 'Failed to fetch sales data' });
    }
  },

  tauxCapture: [],
  fetchTauxCapture: async () => {
    try {
      const data = await ventesApi.tauxCapture();
      set({ tauxCapture: data });
    } catch {
      set({ tauxCapture: [], isOffline: true, error: 'Failed to fetch capture rates' });
    }
  },
}));
