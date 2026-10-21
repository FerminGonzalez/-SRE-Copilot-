/**
 * Datos de la demo. Todo es fijo a proposito: el mismo request produce siempre
 * la misma respuesta (salvo los identificadores correlativos), y asi la demo
 * es reproducible.
 */

export interface Product {
  sku: string;
  name: string;
  price: number;
  currency: string;
  stock: number;
  warehouse: string;
}

export const CATALOG: readonly Product[] = [
  {
    sku: 'SKU-1001',
    name: 'Aurora Mechanical Keyboard',
    price: 129,
    currency: 'EUR',
    stock: 42,
    warehouse: 'mad-1',
  },
  {
    sku: 'SKU-1002',
    name: 'Nimbus Wireless Mouse',
    price: 59.5,
    currency: 'EUR',
    stock: 118,
    warehouse: 'mad-1',
  },
  {
    sku: 'SKU-1003',
    name: 'Helios 27" 4K Monitor',
    price: 449,
    currency: 'EUR',
    stock: 7,
    warehouse: 'bcn-1',
  },
  {
    sku: 'SKU-1004',
    name: 'Orion USB-C Dock',
    price: 189.99,
    currency: 'EUR',
    stock: 0,
    warehouse: 'bcn-1',
  },
  {
    sku: 'SKU-1005',
    name: 'Vega Noise Cancelling Headset',
    price: 219,
    currency: 'EUR',
    stock: 23,
    warehouse: 'mad-1',
  },
] as const;

export interface StockLevel {
  sku: string;
  available: number;
  reserved: number;
  warehouse: string;
}

export const STOCK: readonly StockLevel[] = CATALOG.map((product) => ({
  sku: product.sku,
  available: product.stock,
  reserved: Math.min(5, Math.floor(product.stock / 4)),
  warehouse: product.warehouse,
}));

/** Contador correlativo para los ids de la demo (order_0001, pay_0001...). */
export class Sequence {
  private current = 0;

  next(prefix: string): string {
    this.current += 1;
    return `${prefix}_${String(this.current).padStart(4, '0')}`;
  }
}
