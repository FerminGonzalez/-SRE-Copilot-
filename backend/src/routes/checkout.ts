import { CATALOG } from '../domain/catalog.js';
import { injectFailure } from '../domain/failure-injection.js';
import type { BusinessHandler } from './define-route.js';
import type { RouteDeps } from './deps.js';

/**
 * `GET /api/checkout` - operationName `Checkout`.
 *
 * Es la ruta que "crea" el incidente en la demo: aqui se inyecta el fallo del
 * modo activo (si lo hay).
 */
export function checkoutHandler(deps: RouteDeps): BusinessHandler {
  return (context) => {
    injectFailure(context.failureMode, context, deps);

    const items = CATALOG.slice(0, 2).map((product) => ({
      sku: product.sku,
      name: product.name,
      quantity: 1,
      unitPrice: product.price,
    }));
    const total = Number(
      items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0).toFixed(2),
    );

    return {
      orderId: deps.sequence.next('order'),
      items,
      total,
      currency: 'EUR',
      status: 'confirmed',
    };
  };
}
