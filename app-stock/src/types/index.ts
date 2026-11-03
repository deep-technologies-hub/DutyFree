export type StockStatus = 'ok' | 'low' | 'critical' | 'rupture';
export type ProductCategory = 'Alcools' | 'Parfums' | 'Tabac' | 'Confiserie' | 'Cosmétiques' | 'Accessoires' | 'Alimentaire';
export type Currency = 'XOF' | 'EUR' | 'USD';
export type SommierStatus = 'actif' | 'apuré' | 'en_cours';
export type MovementType = 'entree' | 'sortie' | 'ajustement' | 'inventaire';

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  country: string;
  products: string[];
}

export interface Product {
  id: string;
  code: string;
  barcode: string;
  name: string;
  nameEn: string;
  category: ProductCategory;
  supplier: string;
  unitPrice: number;
  currency: Currency;
  priceEur: number;
  priceUsd: number;
  stock: number;
  minStock: number;
  maxStock: number;
  unit: string;
  sommier?: string;
  photo?: string;
  description?: string;
  status: StockStatus;
  lastUpdated: string;
}

export interface Sommier {
  id: string;
  numero: string;
  productId: string;
  productName: string;
  quantiteInitiale: number;
  quantiteEntree: number;
  quantiteSortie: number;
  quantiteRestante: number;
  dateOuverture: string;
  dateApurement?: string;
  status: SommierStatus;
  reference: string;
  notes?: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: MovementType;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string;
  userId: string;
  userName: string;
  date: string;
  sommierId?: string;
}

export interface SupplierOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  status: 'brouillon' | 'envoyée' | 'reçue' | 'validée';
  items: OrderItem[];
  totalAmount: number;
  currency: Currency;
  createdAt: string;
  expectedAt?: string;
  receivedAt?: string;
  approachCosts: number;
  notes?: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  currency: Currency;
}

export interface InventorySession {
  id: string;
  date: string;
  userId: string;
  userName: string;
  status: 'en_cours' | 'terminé';
  items: InventoryItem[];
}

export interface InventoryItem {
  productId: string;
  productName: string;
  stockTheorique: number;
  stockReel: number;
  ecart: number;
  validated: boolean;
}
