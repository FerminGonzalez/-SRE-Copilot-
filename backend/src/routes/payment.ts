import { injectFailure } from '../domain/failure-injection.js';
import type { BusinessHandler } from './define-route.js';
import type { RouteDeps } from './deps.js';

/**
 * `GET /api/payment` - operationName `Payment`.
 *
 * Simula el cobro contra el proveedor de pagos (`payments-api`).
 */
export function paymentHandler(deps: RouteDeps): BusinessHandler {
  return (context) => {
    injectFailure(context.failureMode, context, deps);

    return {
      paymentId: deps.sequence.next('payment'),
      provider: 'payments-api',
      method: 'card',
      amount: 188.5,
      currency: 'EUR',
      status: 'authorized',
    };
  };
}
