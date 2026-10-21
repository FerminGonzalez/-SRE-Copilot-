import { randomUUID } from 'node:crypto';
import { trace } from '@opentelemetry/api';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError, toErrorPayload } from '../domain/errors.js';
import { OperationName } from '../domain/operations.js';
import type { Logger } from '../observability/logger.js';
import { getRequestContext } from '../observability/request-context.js';
import { recordSpanError } from '../observability/spans.js';

export interface ErrorHandlerOptions {
  logger: Logger;
}

function toApiError(
  error: unknown,
  operationName: string,
  failureMode: ApiError['failureMode'],
): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  return new ApiError({
    code: 'INTERNAL_ERROR',
    message: 'Unexpected internal error',
    status: 500,
    operationName,
    failureMode,
    exceptionType: error instanceof Error ? error.name : 'UnknownError',
  });
}

/**
 * Manejador de errores: un unico formato de respuesta para todo.
 *
 * `{ error: { code, message, operationName, correlationId } }` con el codigo
 * HTTP que corresponde a cada modo de fallo (ver CONTRACTS.md §7).
 *
 * La excepcion se registra en el span activo, que (al no instrumentarse las
 * capas de tipo `middleware`) es el span servidor, es decir, el span raiz del
 * trace: asi la tabla `exceptions` de Application Insights queda asociada a la
 * operacion (`operation_Name = "Checkout"`).
 */
export function errorHandlerMiddleware(options: ErrorHandlerOptions): ErrorRequestHandler {
  const handler: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const context = getRequestContext(res);
    const operationName = context?.operationName ?? OperationName.Unknown;
    const correlationId = context?.correlationId ?? randomUUID();
    const apiError = toApiError(error, operationName, context?.failureMode ?? 'none');

    if (context) {
      context.error = apiError;
    }

    // La excepcion se cuelga del span raiz de la peticion (no del span de la
    // capa de Express), para que la tabla `exceptions` de Application Insights
    // quede asociada a la operacion (`operation_Name = "Checkout"`).
    const span = context?.rootSpan ?? trace.getActiveSpan();
    if (span && context && !context.errorRecorded) {
      recordSpanError(span, apiError);
      context.errorRecorded = true;
    }

    const durationMs = context ? Math.round(performance.now() - context.startedAt) : 0;
    const fields = {
      operationName,
      correlationId,
      durationMs,
      status: apiError.status,
      errorCode: apiError.code,
      errorType: apiError.name,
      failureMode: apiError.failureMode,
      // OJO: el nombre del evento (`message`) lo pone el logger. El texto del
      // error va en `errorMessage` para no pisarlo: el copilot agrupa los logs
      // por el nombre del evento, no por el texto del error.
      errorMessage: apiError.message,
      ...(context ? { method: context.method, path: context.path } : {}),
      ...(context?.traceId ? { traceId: context.traceId } : {}),
    };

    if (apiError.status >= 500) {
      options.logger.error('request_failed', fields);
    } else {
      options.logger.warn('request_rejected', fields);
    }

    res.status(apiError.status).json(toErrorPayload(apiError, correlationId));
  };

  return handler;
}

/**
 * 404 con el mismo formato de error que el resto de la API.
 *
 * Ojo: es un middleware normal (3 argumentos), no un manejador de errores:
 * si tuviera 4 argumentos Express solo lo llamaria cuando hubiera una
 * excepcion y las rutas desconocidas caerian en el handler por defecto.
 */
export function notFoundMiddleware(): RequestHandler {
  const middleware: RequestHandler = (req, res, next) => {
    const context = getRequestContext(res);
    const error = new ApiError({
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      status: 404,
      operationName: context?.operationName ?? OperationName.Unknown,
      failureMode: context?.failureMode ?? 'none',
      exceptionType: 'NotFoundError',
    });
    next(error);
  };

  return middleware;
}
