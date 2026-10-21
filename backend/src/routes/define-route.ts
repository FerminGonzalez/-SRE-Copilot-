import type { Express, Request } from 'express';
import type { OperationName, OperationRegistry } from '../domain/operations.js';
import type { Logger } from '../observability/logger.js';
import { getRequestContext, type RequestContext } from '../observability/request-context.js';

/**
 * Handler de negocio.
 *
 * Recibe el contexto de la peticion (correlation id, operation name, modo de
 * fallo) y devuelve el cuerpo JSON de la respuesta.
 */
export type BusinessHandler = (
  context: RequestContext,
  request: Request,
) => unknown | Promise<unknown>;

export interface RouteOptions {
  registry: OperationRegistry;
  logger: Logger;
}

/**
 * Registra una ruta GET de negocio.
 *
 * La ruta declara su `operation_Name` en un unico sitio (el registro), de
 * modo que el middleware de contexto, el log y el span usan siempre el mismo
 * nombre.
 */
export function defineGet(
  app: Express,
  options: RouteOptions,
  path: string,
  operationName: OperationName,
  handler: BusinessHandler,
): void {
  options.registry.register(path, operationName);

  app.get(path, (req, res, next) => {
    const context = getRequestContext(res);
    if (!context) {
      next(new Error('Request context is missing'));
      return;
    }

    void (async () => {
      try {
        const payload = await handler(context, req);
        const durationMs = Math.round(performance.now() - context.startedAt);
        options.logger.info('request_completed', {
          operationName: context.operationName,
          correlationId: context.correlationId,
          durationMs,
          status: 200,
          failureMode: context.failureMode,
          method: context.method,
          path: context.path,
        });
        res.status(200).json({
          ...(payload as Record<string, unknown>),
          correlationId: context.correlationId,
          ...(context.traceId ? { traceId: context.traceId } : {}),
        });
      } catch (error) {
        next(error);
      }
    })();
  });
}
