/**
 * api.ts — Client HTTP centralisé pour les 3 apps
 * - JWT auto-refresh (intercepteur)
 * - Gestion mode offline (queue)
 * - Base URL configurable par .env
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

/** URL WebSocket authentifiée. Sans VITE_WS_URL, on utilise l'hôte courant (derrière nginx). */
export function wsUrl(path: string): string {
  const base = import.meta.env.VITE_WS_URL
    || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
  const token = authStorage.getAccess();
  return `${base}${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

// ── Storage helpers ──────────────────────────────────────────────────
const TOKEN_KEY = 'df_access';
const REFRESH_KEY = 'df_refresh';
const ORG_KEY = 'df_org';

/** Code entreprise (organisation SaaS) mémorisé sur ce poste. */
export const tenantStorage = {
  get: () => localStorage.getItem(ORG_KEY) || '',
  set: (slug: string) => localStorage.setItem(ORG_KEY, slug.trim().toLowerCase()),
};

export const authStorage = {
  getAccess: () => localStorage.getItem(TOKEN_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set: (access: string, refresh: string) => {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

// ── Types ────────────────────────────────────────────────────────────
export interface OrganisationResume {
  id: number;
  nom: string;
  slug: string;
  plan: string;
  statut: 'essai' | 'actif' | 'expire' | 'suspendu';
  est_active: boolean;
  jours_restants: number | null;
}

export interface Me {
  id: number;
  username: string;
  full_name: string;
  role: string;
  register_id: string;
  email?: string;
  organisation: OrganisationResume | null;
}

export interface ApiError {
  status: number;
  message: string;
  detail?: Record<string, unknown>;
}

/** Premier message d'erreur de validation DRF ({champ: ["message"]}) */
function firstFieldError(body: Record<string, unknown>): string | undefined {
  for (const [field, value] of Object.entries(body)) {
    const msg = Array.isArray(value) ? value[0] : value;
    if (typeof msg === 'string') return field === 'non_field_errors' ? msg : `${field} : ${msg}`;
  }
  return undefined;
}

// ── Fetch wrapper avec JWT ───────────────────────────────────────────
// Les refresh tokens sont à usage unique : un seul renouvellement à la fois, partagé
// par toutes les requêtes en attente.
let refreshEnCours: Promise<string | null> | null = null;

function refreshTokens(): Promise<string | null> {
  if (!refreshEnCours) refreshEnCours = doRefresh().finally(() => { refreshEnCours = null; });
  return refreshEnCours;
}

async function doRefresh(): Promise<string | null> {
  const refresh = authStorage.getRefresh();
  if (!refresh) return null;
  try {
    const res = await fetch(`${BASE_URL}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) {
      // Un autre onglet a peut-être déjà renouvelé la session : on reprend ses jetons.
      if (authStorage.getRefresh() !== refresh) return authStorage.getAccess();
      authStorage.clear();
      return null;
    }
    const data = await res.json();
    authStorage.set(data.access, data.refresh ?? refresh);
    return data.access;
  } catch {
    return null;
  }
}

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const token = authStorage.getAccess();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });

  // Token expiré → refresh automatique
  if (res.status === 401 && retry) {
    const newToken = await refreshTokens();
    if (newToken) return apiFetch<T>(endpoint, options, false);
    authStorage.clear();
    window.dispatchEvent(new Event('auth:logout'));
    throw { status: 401, message: 'Session expirée' } as ApiError;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Abonnement expiré / suspendu : l'application passe en lecture seule
    if (res.status === 402) {
      window.dispatchEvent(new CustomEvent('subscription:inactive', { detail: body.detail }));
    }
    throw {
      status: res.status,
      message: body.detail || body.message || firstFieldError(body) || `Erreur ${res.status}`,
      detail: body,
    } as ApiError;
  }

  // 204 No Content
  if (res.status === 204) return null as T;
  return res.json();
}

// ── API helpers ──────────────────────────────────────────────────────
export const api = {
  get: <T>(url: string) => apiFetch<T>(url),
  post: <T>(url: string, data: unknown) =>
    apiFetch<T>(url, { method: 'POST', body: JSON.stringify(data) }),
  put: <T>(url: string, data: unknown) =>
    apiFetch<T>(url, { method: 'PUT', body: JSON.stringify(data) }),
  patch: <T>(url: string, data: unknown) =>
    apiFetch<T>(url, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(url: string) => apiFetch<T>(url, { method: 'DELETE' }),
};

/** Toutes les pages d'une liste paginée (catalogue complet, exports). */
export async function fetchAllPages<T>(endpoint: string): Promise<T[]> {
  const sep = endpoint.includes('?') ? '&' : '?';
  const results: T[] = [];
  for (let page = 1; ; page++) {
    const res = await api.get<PaginatedResponse<T>>(`${endpoint}${sep}page_size=1000&page=${page}`);
    results.push(...res.results);
    if (!res.next) return results;
  }
}

// ── Auth ─────────────────────────────────────────────────────────────
export const authApi = {
  login: async (username: string, password: string) => {
    const data = await api.post<{ access: string; refresh: string }>(
      '/auth/token/',
      { organisation: tenantStorage.get(), username, password }
    );
    authStorage.set(data.access, data.refresh);
    return data;
  },
  logout: () => {
    // Révoque le refresh token côté serveur (best effort, n'attend pas la réponse)
    const refresh = authStorage.getRefresh();
    if (refresh) {
      fetch(`${BASE_URL}/auth/logout/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }), keepalive: true,
      }).catch(() => {});
    }
    authStorage.clear();
  },
  me: () => api.get<Me>('/utilisateurs/me/'),
};

// ── Utilisateurs ─────────────────────────────────────────────────────
export interface Utilisateur {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  role: 'admin' | 'superviseur' | 'stock_manager' | 'caissier';
  register_id: string;
  phone: string;
  is_active: boolean;
  last_login: string | null;
}

export interface UtilisateurCreate {
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  register_id: string;
  pin: string;
  phone: string;
  password: string;
}

export const utilisateursApi = {
  list: () => api.get<PaginatedResponse<Utilisateur>>('/utilisateurs/'),
  create: (data: UtilisateurCreate) => api.post<Utilisateur>('/utilisateurs/', data),
  update: (id: number, data: Partial<Utilisateur>) => api.patch<Utilisateur>(`/utilisateurs/${id}/`, data),
  resetPin: (id: number, pin: string) => api.patch(`/utilisateurs/${id}/`, { pin }),
  resetPassword: (id: number, password: string) => api.patch(`/utilisateurs/${id}/`, { password }),
  toggleActive: (id: number, is_active: boolean) => api.patch<Utilisateur>(`/utilisateurs/${id}/`, { is_active }),
  delete: (id: number) => api.delete(`/utilisateurs/${id}/`),
};

// ── Stock ─────────────────────────────────────────────────────────────
export const stockApi = {
  produits: {
    list: (params = '') => api.get<PaginatedResponse<Produit>>(`/stock/produits/${params}`),
    listAll: () => fetchAllPages<Produit>('/stock/produits/'),
    get: (id: number) => api.get<Produit>(`/stock/produits/${id}/`),
    byBarcode: (code: string) => api.get<Produit>(`/stock/produits/par_barcode/?code=${code}`),
    alertes: () => api.get<{ ruptures: Produit[]; critiques: Produit[]; bas: Produit[] }>('/stock/produits/alertes/'),
    stats: () => api.get<StockStats>('/stock/produits/stats/'),
    create: (data: Partial<Produit>) => api.post<Produit>('/stock/produits/', data),
    update: (id: number, data: Partial<Produit>) => api.patch<Produit>(`/stock/produits/${id}/`, data),
  },
  categories: {
    list: () => api.get<Categorie[]>('/stock/categories/avec_stats/'),
    create: (data: Partial<Categorie>) => api.post<Categorie>('/stock/categories/', data),
    update: (id: number, data: Partial<Categorie>) => api.patch<Categorie>(`/stock/categories/${id}/`, data),
    delete: (id: number) => api.delete(`/stock/categories/${id}/`),
  },
  fournisseurs: {
    list: () => api.get<PaginatedResponse<Fournisseur>>('/stock/fournisseurs/'),
    create: (data: Partial<Fournisseur>) => api.post<Fournisseur>('/stock/fournisseurs/', data),
  },
  sommiers: {
    list: () => api.get<PaginatedResponse<Sommier>>('/stock/sommiers/'),
    listAll: () => fetchAllPages<Sommier>('/stock/sommiers/'),
    aApurer: () => api.get<Sommier[]>('/stock/sommiers/a_apurer/'),
  },
  mouvements: {
    list: (params = '') => api.get<PaginatedResponse<Mouvement>>(`/stock/mouvements/${params}`),
    create: (data: Partial<Mouvement>) => api.post<Mouvement>('/stock/mouvements/', data),
  },
  commandes: {
    list: () => api.get<PaginatedResponse<Commande>>('/stock/commandes/'),
    create: (data: Partial<Commande>) => api.post<Commande>('/stock/commandes/', data),
    recevoir: (id: number) => api.post(`/stock/commandes/${id}/recevoir/`, {}),
  },
};

// ── Ventes ────────────────────────────────────────────────────────────
export const ventesApi = {
  create: (data: VentePayload) => api.post<VenteResponse>('/ventes/', data),
  list: (params = '') => api.get<PaginatedResponse<VenteListItem>>(`/ventes/${params}`),
  /** Toutes les ventes d'une période (filtres : date_debut, date_fin, numero_caisse, methode) */
  listAll: (filtres: Record<string, string> = {}) => {
    const qs = new URLSearchParams(Object.entries(filtres).filter(([, v]) => v)).toString();
    return fetchAllPages<VenteListItem>(`/ventes/${qs ? `?${qs}` : ''}`);
  },
  caisses: () => api.get<string[]>('/ventes/caisses/'),
  /** Annule une vente (remise en stock, sommier et points rétablis). Réservé admin / superviseur. */
  annuler: (id: number, motif: string) => api.post<VenteListItem>(`/ventes/${id}/annuler/`, { motif }),
  syncOffline: (ventes: VentePayload[]) =>
    api.post<{ synced: number; errors: unknown[] }>('/ventes/sync_offline/', { ventes }),
  dashboard: () => api.get<DashboardData>('/ventes/dashboard/'),
  tauxCapture: () => api.get<TauxCapture[]>('/ventes/taux_capture/'),
  passagers: {
    list: () => api.get<PaginatedResponse<DonneesPassagers>>('/ventes/passagers/'),
    create: (data: Partial<DonneesPassagers>) => api.post<DonneesPassagers>('/ventes/passagers/', data),
    update: (id: number, data: Partial<DonneesPassagers>) => api.patch<DonneesPassagers>(`/ventes/passagers/${id}/`, data),
    delete: (id: number) => api.delete(`/ventes/passagers/${id}/`),
  },
};

// ── Types partagés ────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Produit {
  id: number;
  code: string;
  code_barres: string;
  nom: string;
  nom_en: string;
  categorie: number | null;
  categorie_nom?: string;
  prix_xof: number;
  prix_eur: number;
  prix_usd: number;
  stock: number;
  stock_min: number;
  stock_max: number;
  unite: string;
  statut_stock: 'ok' | 'bas' | 'critique' | 'rupture';
  fournisseur: number | null;
  fournisseur_nom?: string;
  photo_url?: string;
}

export interface Categorie {
  id: number;
  nom: string;
  code: string;
  description: string;
  couleur: string;
  icone: string;
  nombre_produits: number;
}

export interface Fournisseur {
  id: number;
  nom: string;
  contact: string;
  email: string;
  telephone: string;
  pays: string;
  actif: boolean;
}

export interface Sommier {
  id: number;
  numero: string;
  reference_djbc: string;
  produit: number;
  produit_nom: string;
  quantite_initiale: number;
  quantite_entree: number;
  quantite_sortie: number;
  quantite_restante: number;
  taux_apurement: number;
  date_ouverture: string;
  date_apurement: string | null;
  statut: 'actif' | 'en_cours' | 'apure';
  notes: string;
}

export interface Mouvement {
  id: number;
  produit: number;
  produit_nom: string;
  sommier: number | null;
  type_mouvement: 'entree' | 'sortie' | 'ajustement' | 'rebut' | 'inventaire';
  quantite: number;
  stock_avant: number;
  stock_apres: number;
  motif: string;
  reference: string;
  utilisateur: number;
  utilisateur_nom: string;
  date: string;
}

export interface Commande {
  id: number;
  numero: string;
  fournisseur: number;
  fournisseur_nom: string;
  statut: 'brouillon' | 'envoyee' | 'recue' | 'validee' | 'annulee';
  devise: string;
  montant_total: number;
  frais_approche: number;
  notes: string;
  created_at: string;
  date_attendue: string | null;
  lignes: LigneCommande[];
}

export interface LigneCommande {
  id: number;
  produit: number;
  produit_nom: string;
  quantite: number;
  prix_unitaire: number;
  montant_total: number;
}

export interface StockStats {
  total: number;
  ruptures: number;
  en_alerte: number;
  valeur_stock: number;
}

export interface VentePayload {
  numero_ticket: string;
  numero_caisse: string;
  devise: string;
  sous_total: number;
  remise_totale: number;
  total: number;
  passager_nom?: string;
  vol_reference?: string;
  destination?: string;
  synced: boolean;
  date_locale: string;
  lignes: LigneVentePayload[];
  paiements: PaiementPayload[];
}

export interface LigneVentePayload {
  produit: number;
  quantite: number;
  prix_unitaire: number;
  devise: string;
  remise: number;
  total: number;
}

export interface PaiementPayload {
  methode: string;
  devise: string;
  montant: number;
  montant_xof: number;
  monnaie_rendue: number;
  taux_change: number;
}

export interface VenteResponse {
  id: number;
  numero_ticket: string;
}

export interface VenteListItem {
  id: number;
  numero_ticket: string;
  caissier_nom: string;
  numero_caisse: string;
  total: number;
  devise: string;
  statut: string;
  date_locale: string;
  passager_nom: string;
  vol_reference: string;
  destination: string;
  synced: boolean;
  nb_articles: number;
  lignes: { produit: number; produit_nom: string; quantite: number; prix_unitaire: number; total: number }[];
  paiements: { methode: 'especes' | 'carte' | 'mobile_money'; devise: string; montant: number; montant_xof: number; monnaie_rendue: number; taux_change: number }[];
}

export interface DashboardData {
  ca_month: number;
  ca_today: number;
  tickets_month: number;
  tickets_today: number;
  ticket_moyen: number;
  ca_daily: { jour: string; ca: number; tickets: number }[];
  ca_by_categorie: { lignes__produit__categorie: string; ca: number; tickets: number }[];
  ca_by_cashier: { caissier__first_name: string; caissier__last_name: string; ca: number; tickets: number }[];
  ca_by_payment: { paiements__methode: string; amount: number }[];
}

export interface TauxCapture {
  id: number;
  source: string;
  notes: string;
  annee: number;
  mois: number;
  passagers: number;
  tickets: number;
  taux: number;
}

export interface DonneesPassagers {
  id: number;
  annee: number;
  mois: number;
  nombre_passagers: number;
  source: string;
  notes: string;
}

// ── Configuration ────────────────────────────────────────────────────
export interface Configuration {
  id: number;
  nom_boutique: string;
  nif: string;
  adresse: string;
  telephone: string;
  email: string;
  taux_eur_xof: number;
  taux_usd_xof: number;
  msg_accueil_1: string;
  msg_accueil_2: string;
  msg_politesse: string;
  seuil_alerte_stock: number;
  delai_apurement_sommier: number;
  points_par_xof: number;
  valeur_point_xof: number;
  seuil_fidelite_bronze: number;
  seuil_fidelite_silver: number;
  seuil_fidelite_gold: number;
  updated_at: string;
}

export const configurationApi = {
  get: () => apiFetch<Configuration>('/configuration/'),
  update: (data: Partial<Configuration>) => apiFetch<Configuration>('/configuration/', { method: 'PATCH', body: JSON.stringify(data) }),
};

// ── Fidélité ─────────────────────────────────────────────────────────
export interface CarteFidelite {
  id: number;
  numero: string;
  nom: string;
  prenom: string;
  nom_complet: string;
  email: string;
  telephone: string;
  nationalite: string;
  points: number;
  niveau: 'bronze' | 'silver' | 'gold';
  actif: boolean;
  date_inscription: string;
  derniere_visite: string | null;
}

export interface StatsFidelite {
  total_cartes: number;
  by_niveau: { bronze: number; silver: number; gold: number };
  total_points_en_circulation: number;
}

export const fideliteApi = {
  list: (search?: string) => apiFetch<{ results: CarteFidelite[]; count: number }>(`/fidelite/${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  get: (id: number) => apiFetch<CarteFidelite>(`/fidelite/${id}/`),
  create: (data: Partial<CarteFidelite>) => apiFetch<CarteFidelite>('/fidelite/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<CarteFidelite>) => apiFetch<CarteFidelite>(`/fidelite/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  toggleActif: (id: number) => apiFetch<CarteFidelite>(`/fidelite/${id}/`, { method: 'PATCH', body: JSON.stringify({ actif: false }) }),
  stats: () => apiFetch<StatsFidelite>('/fidelite/statistiques/'),
  ajouterPoints: (id: number, montant_xof: number, reference?: string) =>
    apiFetch(`/fidelite/${id}/ajouter_points/`, { method: 'POST', body: JSON.stringify({ montant_xof, reference }) }),
};

// ── SaaS : inscription, organisation, abonnement ─────────────────────
export interface Plan {
  id: number;
  code: string;
  nom: string;
  description: string;
  prix_mensuel_xof: string;
  max_utilisateurs: number | null;
  max_produits: number | null;
  max_caisses: number | null;
}

export interface Organisation {
  id: number;
  nom: string;
  slug: string;
  email: string;
  telephone: string;
  pays: string;
  plan: Plan;
  statut: 'essai' | 'actif' | 'expire' | 'suspendu';
  essai_fin: string | null;
  periode_fin: string | null;
  date_fin: string | null;
  jours_restants: number | null;
  est_active: boolean;
  usage: { utilisateurs: number; produits: number; caisses: number };
  created_at: string;
}

export interface Facture {
  id: number;
  numero: string;
  plan: number;
  plan_nom: string;
  mois: number;
  montant_xof: string;
  statut: 'en_attente' | 'payee' | 'annulee';
  methode: string;
  reference_paiement: string;
  prestataire: string;
  periode_debut: string | null;
  periode_fin: string | null;
  created_at: string;
  payee_le: string | null;
}

export interface InscriptionPayload {
  nom_organisation: string;
  slug?: string;
  email: string;
  telephone?: string;
  pays?: string;
  plan: string;
  admin_username: string;
  admin_password: string;
  admin_first_name?: string;
  admin_last_name?: string;
}

export const saasApi = {
  plans: () => api.get<Plan[]>('/saas/plans/'),
  inscription: async (data: InscriptionPayload) => {
    const res = await api.post<{ organisation: Organisation; access: string; refresh: string }>('/saas/inscription/', data);
    authStorage.set(res.access, res.refresh);
    tenantStorage.set(res.organisation.slug);
    return res;
  },
  organisation: () => api.get<Organisation>('/saas/organisation/'),
  updateOrganisation: (data: Partial<Pick<Organisation, 'nom' | 'email' | 'telephone' | 'pays'>>) =>
    api.patch<Organisation>('/saas/organisation/', data),
  factures: () => api.get<PaginatedResponse<Facture>>('/saas/factures/'),
  souscrire: (plan: string, mois: number) =>
    api.post<{ facture: Facture; instructions: string }>('/saas/factures/souscrire/', { plan, mois }),
  facture: (id: number) => api.get<Facture>(`/saas/factures/${id}/`),
  /** Démarre un paiement en ligne : renvoie l'URL de la page du prestataire */
  payer: (id: number) => api.post<{ url: string; prestataire: string }>(`/saas/factures/${id}/payer/`, {}),
  verifier: (id: number) => api.post<Facture>(`/saas/factures/${id}/verifier/`, {}),
};

// ── Mot de passe oublié ──────────────────────────────────────────────
export const motDePasseApi = {
  demander: (organisation: string, email: string) =>
    api.post<{ detail: string }>('/auth/mot-de-passe/oublie/', { organisation, email }),
  reinitialiser: (uid: string, token: string, password: string) =>
    api.post<{ detail: string; organisation: string | null }>('/auth/mot-de-passe/reinitialiser/', { uid, token, password }),
};
