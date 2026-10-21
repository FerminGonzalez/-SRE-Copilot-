import { CATALOG, STOCK } from '../domain/catalog.js';
import type { BusinessHandler } from './define-route.js';

/**
 * `GET /api/catalog` - productos y stock.
 *
 * Ruta de apoyo: siempre responde bien para que la demo pueda mostrar el
 * catalogo aunque el backend este "roto" en las operaciones de negocio.
 */
export function catalogHandler(): BusinessHandler {
  return () => ({
    count: CATALOG.length,
    currency: 'EUR',
    products: CATALOG,
    stock: STOCK,
  });
}
