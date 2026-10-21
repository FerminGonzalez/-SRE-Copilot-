import { ApiError } from '../domain/errors.js';
import { FAILURE_MODES, isFailureMode } from '../domain/failure-modes.js';
import type { FailureModeStore } from '../state/failure-mode-store.js';
import type { BusinessHandler } from './define-route.js';

export interface ChaosDeps {
  failureModes: FailureModeStore;
}

/**
 * `GET /api/chaos` - activa/desactiva un fallo para la demo.
 *
 * - `GET /api/chaos`            -> consulta el modo activo (no cambia nada).
 * - `GET /api/chaos?mode=database` -> fija el modo en caliente.
 * - `GET /api/chaos?mode=reset`    -> vuelve al valor de `FAILURE_MODE`.
 *
 * El cambio afecta a las peticiones siguientes, no a la actual.
 */
export function chaosHandler(deps: ChaosDeps): BusinessHandler {
  return (context, request) => {
    const previousMode = deps.failureModes.current;
    const requested = request.query.mode;

    if (typeof requested === 'string' && requested.trim().length > 0) {
      const value = requested.trim().toLowerCase();
      if (value === 'reset') {
        deps.failureModes.reset();
      } else if (isFailureMode(value)) {
        deps.failureModes.set(value);
      } else {
        throw new ApiError({
          code: 'INVALID_FAILURE_MODE',
          message: `Unknown failure mode "${requested}". Allowed: ${FAILURE_MODES.join(', ')}, reset`,
          status: 400,
          operationName: context.operationName,
          failureMode: context.failureMode,
          exceptionType: 'InvalidFailureModeError',
        });
      }
    }

    return {
      currentMode: deps.failureModes.current,
      previousMode,
      source: deps.failureModes.source,
      changed: deps.failureModes.current !== previousMode,
      availableModes: [...FAILURE_MODES],
      envMode: deps.failureModes.env,
    };
  };
}
