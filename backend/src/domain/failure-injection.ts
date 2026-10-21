import type { Tracer } from '@opentelemetry/api';
import type { DatabaseTarget } from './database.js';
import { ApiError } from './errors.js';
import { FAILURE_DEFINITIONS, type FailureMode } from './failure-modes.js';
import type { RequestContext } from '../observability/request-context.js';
import { recordFailedDependency } from '../observability/spans.js';

export interface FailureInjectionDeps {
  tracer: Tracer;
  database: DatabaseTarget;
}

/**
 * Inyecta el fallo del modo activo.
 *
 * Antes de lanzar el error se registra la dependencia que falla (span CLIENT),
 * para que el copilot vea *que* se rompio (host equivocado, proveedor caido)
 * y no solo el error final.
 */
export function injectFailure(
  mode: FailureMode,
  context: RequestContext,
  deps: FailureInjectionDeps,
): void {
  if (mode === 'none') {
    return;
  }

  const definition = FAILURE_DEFINITIONS[mode];
  const error = new ApiError({
    code: definition.code,
    message: definition.message,
    status: definition.status,
    operationName: context.operationName,
    failureMode: mode,
    exceptionType: definition.exceptionType,
  });

  if (mode === 'database') {
    recordFailedDependency({
      tracer: deps.tracer,
      name: definition.dependency.name,
      target: deps.database.host,
      port: deps.database.port,
      status: definition.status,
      error,
      database: {
        system: 'postgresql',
        name: deps.database.database,
        operation: 'SELECT',
      },
    });
  } else if (mode === 'dependency') {
    recordFailedDependency({
      tracer: deps.tracer,
      name: definition.dependency.name,
      target: `${definition.dependency.name}.internal`,
      status: definition.status,
      error,
    });
  }

  throw error;
}
