export type Currency = 'XOF' | 'EUR' | 'USD';
export type PaymentMethod = 'especes' | 'carte' | 'mobile_money';
export type SaleStatus = 'en_cours' | 'payée' | 'annulée' | 'suspendue';
export type UserRole = 'caissier' | 'superviseur' | 'admin';

export interface Product {
  id: number | string;
  code: string;
  code_barres?: string;
  barcode?: string;      // alias legacy
  nom?: string;
  name?: string;         // alias legacy
  nom_en?: string;
  nameEn?: string;       // alias legacy
  categorie?: string;
  category?: string;     // alias legacy
  prix_xof?: number;
  prix_eur?: number;
  prix_usd?: number;
  priceXOF?: number;     // alias legacy
  priceEUR?: number;     // alias legacy
  priceUSD?: number;     // alias legacy
  stock: number;
  image?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  currency: Currency;
  discount: number;   // % de remise
  total: number;
}

export interface Payment {
  method: PaymentMethod;
  currency: Currency;
  amount: number;
  amountXOF: number;  // toujours converti en XOF
  change?: number;
}

export interface Sale {
  id: string;
  ticketNumber: string;
  cashierId: string;
  cashierName: string;
  registerNumber: string;
  items: CartItem[];
  payments: Payment[];
  subtotal: number;
  discountTotal: number;
  total: number;
  currency: Currency;
  status: SaleStatus;
  createdAt: string;
  completedAt?: string;
  passengerName?: string;
  flightRef?: string;
  destination?: string;
  synced: boolean;    // false = offline, pas encore envoyé au serveur
}

export interface User {
  id: string;
  name: string;
  pin: string;
  role: UserRole;
  registerId: string;
}

export interface ExchangeRates {
  EUR_XOF: number;
  USD_XOF: number;
  updatedAt: string;
}
