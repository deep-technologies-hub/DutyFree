import { create } from 'zustand';
import { stockApi, ventesApi, authApi, authStorage } from '../api';
import type { Produit, Fournisseur, Sommier, Mouvement, Commande, Categorie } from '../api';

interface StockStore {
  products: Produit[];
  categories: Categorie[];
  sommiers: Sommier[];
  movements: Mouvement[];
  orders: Commande[];
  suppliers: Fournisseur[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  selectedCategory: string;
  isOffline: boolean;
  setSearchQuery: (q: string) => void;
  setSelectedCategory: (c: string) => void;
  fetchAll: () => Promise<void>;
  fetchProducts: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchSommiers: () => Promise<void>;
  fetchMovements: () => Promise<void>;
  fetchSuppliers: () => Promise<void>;
  addMovement: (data: Partial<Mouvement>) => Promise<void>;
  updateOrder: (orderId: number, updates: Partial<Commande>) => void;
  addOrder: (order: Commande) => void;
}

export const useStockStore = create<StockStore>((set, get) => ({
  products: [],
  categories: [],
  sommiers: [],
  movements: [],
  orders: [],
  suppliers: [],
  loading: false,
  error: null,
  searchQuery: '',
  selectedCategory: 'Tous',
  isOffline: !navigator.onLine,

  setSearchQuery: (q) => set({ searchQuery: q }),
  setSelectedCategory: (c) => set({ selectedCategory: c }),

  fetchProducts: async () => {
    set({ loading: true, error: null });
    try {
      const products = await stockApi.produits.listAll();
      set({ products, loading: false, isOffline: false });
    } catch {
      set({ products: [], loading: false, isOffline: true, error: 'Failed to fetch products' });
    }
  },

  fetchCategories: async () => {
    try {
      set({ categories: await stockApi.categories.list() });
    } catch {
      set({ error: 'Failed to fetch categories' });
    }
  },

  fetchSommiers: async () => {
    set({ loading: true, error: null });
    try {
      const res = await stockApi.sommiers.list();
      set({ sommiers: res.results, loading: false, isOffline: false });
    } catch {
      set({ sommiers: [], loading: false, isOffline: true, error: 'Failed to fetch sommiers' });
    }
  },

  fetchMovements: async () => {
    set({ loading: true, error: null });
    try {
      const res = await stockApi.mouvements.list();
      set({ movements: res.results, loading: false, isOffline: false });
    } catch {
      set({ movements: [], loading: false, isOffline: true, error: 'Failed to fetch movements' });
    }
  },

  fetchAll: async () => {
    const { fetchProducts, fetchCategories, fetchSommiers, fetchMovements } = get();
    set({ loading: true, error: null });

    try {
      await Promise.allSettled([fetchProducts(), fetchCategories(), fetchSommiers(), fetchMovements()]);

      // Fetch suppliers and orders
      const suppliersRes = await stockApi.fournisseurs.list();
      const ordersRes = await stockApi.commandes.list();

      set({
        suppliers: suppliersRes.results,
        orders: ordersRes.results,
        loading: false,
        isOffline: false
      });
    } catch (error) {
      set({
        loading: false,
        isOffline: true,
        error: 'Failed to fetch data'
      });
    }
  },

  fetchSuppliers: async () => {
    set({ loading: true, error: null });
    try {
      const r = await stockApi.fournisseurs.list();
      set({ suppliers: r.results, loading: false, isOffline: false });
    } catch {
      set({ suppliers: [], loading: false, isOffline: true, error: 'Failed to fetch suppliers' });
    }
  },

  addMovement: async (data) => {
    try {
      const m = await stockApi.mouvements.create(data);
      set(s => ({ movements: [m, ...s.movements] }));
      if (data.produit) {
        const p = await stockApi.produits.get(data.produit as number);
        set(s => ({ products: s.products.map(pr => pr.id === p.id ? p : pr) }));
      }
    } catch (error) {
      set({ error: 'Failed to add movement' });
    }
  },

  updateOrder: (orderId: number, updates: Partial<Commande>) => {
    set(s => ({
      orders: s.orders.map(order =>
        order.id === orderId ? { ...order, ...updates } : order
      )
    }));
  },

  addOrder: (order: Commande) => {
    set(s => ({ orders: [order, ...s.orders] }));
  },
}));
