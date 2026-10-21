import { STOCK } from '../domain/catalog.js';
import { injectFailure } from '../domain/failure-injection.js';
import type { BusinessHandler } from './define-route.js';
import type { RouteDeps } from './deps.js';

/**
 * `GET /api/inventory` - operationName `Inventory`.
 *
 * Simula la lectura de stock (base de datos de inventario).
 */
export function inventoryHandler(deps: RouteDeps): BusinessHandler {
  return (context) => {
    injectFailure(context.failureMode, context, deps);

    const items = STOCK.map((level) => ({
      sku: level.sku,
      available: level.available,
      reserved: level.reserved,
      warehouse: level.warehouse,
    }));

    return {
      warehouse: 'mad-1',
      items,
      totalAvailable: items.reduce((sum, item) => sum + item.available, 0),
    };
  };
}
