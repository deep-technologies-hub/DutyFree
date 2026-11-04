import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, stockApi, ventesApi, authApi, authStorage } from '../api';
import type { Produit, VentePayload, VenteResponse } from '../api';
import type { CartItem, Sale, User, Currency, Payment, PaymentMethod, ExchangeRates } from '../types';

// Numéro de ticket : T<AAMMJJ>-<appareil>-<séquence du jour>, ex. T261029-K7QZ-0001.
// Généré hors ligne, il doit rester unique entre caisses : le serveur rejette les doublons
// et la resynchronisation considère un numéro déjà connu comme « déjà envoyé ».
// L'identifiant d'appareil est tiré au hasard une fois ; s'il est effacé, un nouveau
// est tiré, ce qui évite de reprendre une séquence déjà utilisée.
const deviceId = (() => {
  let id = localStorage.getItem('df_device_id');
  if (!id) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    id = Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
    localStorage.setItem('df_device_id', id);
  }
  return id;
})();

const nextTicketNumber = () => {
  const d = new Date();
  const jour = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  let seq = 1;
  try {
    const prev = JSON.parse(localStorage.getItem('df_ticket_seq') || 'null');
    if (prev?.jour === jour) seq = prev.seq + 1;
  } catch { /* compteur illisible : on repart à 1 */ }
  localStorage.setItem('df_ticket_seq', JSON.stringify({ jour, seq }));
  return `T${jour}-${deviceId}-${String(seq).padStart(4, '0')}`;
};

// Taux de change configurés par la boutique (/configuration/) ; null tant qu'ils n'ont jamais été chargés.
export type Rates = Pick<ExchangeRates, 'EUR_XOF' | 'USD_XOF'>;

const taux = (currency: Currency, rates: Rates | null) =>
  currency === 'XOF' ? 1 : rates ? rates[currency === 'EUR' ? 'EUR_XOF' : 'USD_XOF'] : NaN;

export const toXOF = (amount: number, currency: Currency, rates: Rates | null) => amount * taux(currency, rates);
export const fromXOF = (amount: number, currency: Currency, rates: Rates | null) => amount / taux(currency, rates);

const priceInCurrency = (p: Produit, currency: Currency) => {
  if (currency === 'EUR') return Number(p.prix_eur) || 0;
  if (currency === 'USD') return Number(p.prix_usd) || 0;
  return Number(p.prix_xof) || 0;
};

/** Vente locale complétée avec les montants enregistrés par le serveur. */
const saleFromApi = (v: VenteResponse, local: Sale): Sale => ({
  ...local,
  items: v.lignes.map(l => ({
    product: local.items.find(i => String(i.product.id) === String(l.produit))?.product
      ?? { id: l.produit, code: '', nom: l.produit_nom, stock: 0 },
    quantity: l.quantite,
    unitPrice: Number(l.prix_unitaire),
    currency: l.devise as Currency,
    discount: Number(l.remise),
    total: Number(l.total),
  })),
  payments: v.paiements.map(p => ({
    method: p.methode as PaymentMethod,
    currency: p.devise as Currency,
    amount: Number(p.montant),
    amountXOF: Number(p.montant_xof),
    change: Number(p.monnaie_rendue),
  })),
  subtotal: Number(v.sous_total),
  discountTotal: Number(v.remise_totale),
  total: Number(v.total),
  currency: v.devise as Currency,
  synced: true,
});

export interface CarteAssociee { id: number; numero: string; nom: string }

interface CaisseStore {
  currentUser: User | null;
  isOnline: boolean;
  setOnline: (v: boolean) => void;
  activeCurrency: Currency;
  setActiveCurrency: (c: Currency) => void;
  rates: Rates | null;
  loadRates: () => Promise<void>;
  cart: CartItem[];
  products: Produit[];
  productsLoaded: boolean;
  addToCart: (productId: string | number) => void;
  removeFromCart: (productId: string | number) => void;
  updateQty: (productId: string | number, qty: number) => void;
  clearCart: () => void;
  cartTotal: () => number;
  cartItemCount: () => number;
  passengerName: string;
  flightRef: string;
  destination: string;
  setPassenger: (name: string, flight: string, dest: string) => void;
  clearPassenger: () => void;
  carteFidelite: CarteAssociee | null;
  setCarteFidelite: (carte: CarteAssociee | null) => void;
  sales: Sale[];
  offlineQueue: VentePayload[];
  completeSale: (payments: Payment[]) => Promise<Sale>;
  syncOfflineQueue: () => Promise<void>;
  login: (user: User) => void;
  loginWithApi: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  loadProducts: () => Promise<void>;
  searchProducts: (q: string) => Produit[];
}

export const useCaisseStore = create<CaisseStore>()(
  persist(
    (set, get) => ({
      currentUser: null,
      isOnline: navigator.onLine,
      setOnline: (v) => set({ isOnline: v }),
      activeCurrency: 'XOF',
      setActiveCurrency: (c) => set({ activeCurrency: c }),
      rates: null,
      loadRates: async () => {
        try {
          const cfg = await api.get<{ taux_eur_xof: string; taux_usd_xof: string }>('/configuration/');
          set({ rates: { EUR_XOF: Number(cfg.taux_eur_xof), USD_XOF: Number(cfg.taux_usd_xof) } });
        } catch { /* hors ligne : on garde les derniers taux connus */ }
      },
      cart: [],
      products: [],
      productsLoaded: false,

      loadProducts: async () => {
        try {
          const products = await stockApi.produits.listAll();
          set({ products, productsLoaded: true });
        } catch {
          // Hors ligne : on garde le dernier catalogue connu pour continuer à vendre
          set(s => ({ productsLoaded: s.products.length > 0 }));
        }
      },

      addToCart: (productId) => {
        const pid = String(productId);
        const product = get().products.find(
          p => String(p.id) === pid || p.code_barres === pid || p.code === pid
        );
        if (!product || product.stock === 0) return;
        const currency = get().activeCurrency;
        const unitPrice = priceInCurrency(product, currency);
        set(s => {
          const existing = s.cart.find(i => i.product.id === product.id);
          if (existing) {
            return {
              cart: s.cart.map(i => i.product.id === product.id
                ? { ...i, quantity: i.quantity + 1, total: Number(i.total) + Number(unitPrice) * (1 - Number(i.discount) / 100) }
                : i)
            };
          }
          return {
            cart: [...s.cart, {
              product: { ...product, id: product.id } as unknown as CartItem['product'],
              quantity: 1, unitPrice: Number(unitPrice), currency, discount: 0, total: Number(unitPrice)
            }]
          };
        });
      },

      removeFromCart: (id) => set(s => ({ cart: s.cart.filter(i => i.product.id !== id) })),
      updateQty: (id, qty) => {
        if (qty <= 0) { get().removeFromCart(id); return; }
        set(s => ({
          cart: s.cart.map(i => {
            if (i.product.id === id) {
              const total = qty * Number(i.unitPrice) * (1 - Number(i.discount) / 100);
              return { ...i, quantity: qty, total: Math.round(total * 100) / 100 };
            }
            return i;
          })
        }));
      },
      clearCart: () => set({ cart: [], passengerName: '', flightRef: '', destination: '', carteFidelite: null }),
      cartTotal: () => {
        const { cart, activeCurrency, rates } = get();
        return cart.reduce((sum, item) =>
          sum + fromXOF(toXOF(Number(item.total), item.currency, rates), activeCurrency, rates), 0);
      },
      cartItemCount: () => get().cart.reduce((s, i) => s + i.quantity, 0),

      passengerName: '', flightRef: '', destination: '',
      setPassenger: (name, flight, dest) => set({ passengerName: name, flightRef: flight, destination: dest }),
      clearPassenger: () => set({ passengerName: '', flightRef: '', destination: '' }),

      carteFidelite: null,
      setCarteFidelite: (carte) => set({ carteFidelite: carte }),

      sales: [],
      offlineQueue: [],

      completeSale: async (payments) => {
        const { cart, currentUser, activeCurrency, passengerName, flightRef, destination, carteFidelite, isOnline, rates } = get();
        const now = new Date().toISOString();
        const total = get().cartTotal();
        const ticketNumber = nextTicketNumber();

        const sale: Sale = {
          id: `sale-${Date.now()}`,
          ticketNumber,
          cashierId: currentUser!.id,
          cashierName: currentUser!.name,
          registerNumber: currentUser!.registerId,
          items: [...cart],
          payments,
          subtotal: total,
          discountTotal: cart.reduce((s, i) => s + (i.unitPrice * i.quantity * i.discount / 100), 0),
          total,
          currency: activeCurrency,
          status: 'payée',
          createdAt: now,
          completedAt: now,
          passengerName,
          flightRef,
          destination,
          synced: isOnline,
        };

        // Construire le payload API
        const payload: VentePayload = {
          numero_ticket: ticketNumber,
          numero_caisse: currentUser!.registerId,
          devise: activeCurrency,
          sous_total: total,
          remise_totale: sale.discountTotal,
          total,
          passager_nom: passengerName,
          carte_fidelite: carteFidelite?.id ?? null,
          vol_reference: flightRef,
          destination,
          synced: isOnline,
          date_locale: now,
          lignes: cart.map(item => ({
            produit: item.product.id as unknown as number,
            quantite: item.quantity,
            prix_unitaire: item.unitPrice,
            devise: item.currency,
            remise: item.discount,
            total: item.total,
          })),
          paiements: payments.map(p => ({
            methode: p.method,
            devise: p.currency,
            montant: p.amount,
            montant_xof: p.amountXOF,
            monnaie_rendue: p.change || 0,
            taux_change: toXOF(1, p.currency, rates),
          })),
        };

        // En ligne, le ticket reprend les montants recalculés par le serveur ;
        // hors ligne, il garde le calcul local jusqu'à la synchronisation.
        let saved = sale;
        if (isOnline) {
          try {
            saved = saleFromApi(await ventesApi.create(payload), sale);
          } catch {
            set(s => ({ offlineQueue: [...s.offlineQueue, payload] }));
          }
        } else {
          set(s => ({ offlineQueue: [...s.offlineQueue, payload] }));
        }

        set(s => ({ sales: [saved, ...s.sales] }));
        get().clearCart();
        return saved;
      },

      syncOfflineQueue: async () => {
        const { offlineQueue } = get();
        if (offlineQueue.length === 0) return;
        try {
          const result = await ventesApi.syncOffline(offlineQueue);
          // Ne retirer que les tickets confirmés par le serveur (les autres restent en file)
          const confirmes = new Set(result.tickets ?? []);
          set(s => ({ offlineQueue: s.offlineQueue.filter(v => !confirmes.has(v.numero_ticket)) }));
        } catch { /* retry later */ }
      },

      login: (user) => set({ currentUser: user }),

      loginWithApi: async (username, password) => {
        try {
          await authApi.login(username, password);
          const me = await authApi.me();
          const user: User = {
            id: String(me.id),
            name: me.full_name,
            pin: '',
            role: me.role as User['role'],
            registerId: me.register_id || 'CAISSE',
          };
          set({ currentUser: user });
          return true;
        } catch { return false; }
      },

      logout: () => {
        authStorage.clear();
        set({ currentUser: null, cart: [] });
      },

      searchProducts: (q) => {
        const lower = q.toLowerCase();
        return get().products.filter(p =>
          p.nom.toLowerCase().includes(lower) ||
          p.code_barres?.includes(q) ||
          p.code.toLowerCase().includes(lower) ||
          p.categorie_nom?.toLowerCase().includes(lower)
        );
      },
    }),
    {
      name: 'df-caisse-store',
      // Ne persister que les données essentielles offline
      partialize: (s) => ({
        currentUser: s.currentUser,
        activeCurrency: s.activeCurrency,
        rates: s.rates, // derniers taux connus, pour encaisser en devises hors ligne
        offlineQueue: s.offlineQueue,
        products: s.products, // catalogue disponible hors ligne, même après un rechargement
        sales: s.sales.slice(0, 50), // Garder 50 dernières ventes
      }),
    }
  )
);
