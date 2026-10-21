import type { BusinessHandler } from './define-route.js';

export interface HealthDeps {
  startedAt: number;
  serviceName: string;
  serviceVersion: string;
  environment: string;
}

/**
 * `GET /health` - health del backend.
 *
 * Nunca falla a proposito: el health check de App Service y el frontend
 * necesitan una respuesta estable aunque el modo de fallo este activo.
 */
export function healthHandler(deps: HealthDeps): BusinessHandler {
  return (context) => ({
    ok: true,
    service: deps.serviceName,
    version: deps.serviceVersion,
    environment: deps.environment,
    uptimeSeconds: Math.round((Date.now() - deps.startedAt) / 1000),
    failureMode: context.failureMode,
  });
}
