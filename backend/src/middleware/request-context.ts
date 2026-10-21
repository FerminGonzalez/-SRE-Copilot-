import { randomUUID } from 'node:crypto';
import { trace } from '@opentelemetry/api';
import type { RequestHandler } from 'express';
import type { OperationRegistry } from '../domain/operations.js';
import type { FailureModeStore } from '../state/failure-mode-store.js';
import { setRequestContext, type RequestContext } from '../observability/request-context.js';
import { applyOperationToSpan } from '../observability/spans.js';

export interface RequestContextOptions {
  registry: OperationRegistry;
  failureModes: FailureModeStore;
}

const CORRELATION_ID_PATTERN = /^[\w\-.:@]{1,128}$/;

/** Reutiliza el id de correlacion que envíe el cliente (si es razonable). */
export function resolveCorrelationId(header: string | undefined): string {
  const candidate = header?.trim();
  if (candidate && CORRELATION_ID_PATTERN.test(candidate)) {
    return candidate;
  }
  return randomUUID();
}

/**
 * Middleware de contexto.
 *
 * Aqui se decide el `operation_Name` de la peticion y se publica por triple:
 * cabecera `x-operation-name`, atributo del span de OpenTelemetry y log
 * estructurado. Ademas propaga el `correlationId` de la peticion.
 */
export function requestContextMiddleware(options: RequestContextOptions): RequestHandler {
  const middleware: RequestHandler = (req, res, next) => {
    const operationName = options.registry.resolve(req.path);
    const context: RequestContext = {
      correlationId: resolveCorrelationId(req.header('x-correlation-id')),
      operationName,
      failureMode: options.failureModes.current,
      method: req.method,
      path: req.path,
      startedAt: performance.now(),
    };

    // El span activo es el span servidor (raiz del trace): lo renombramos con
    // el nombre de la operacion para que `requests.operation_Name` en
    // Application Insights valga "Checkout", "Payment" o "Inventory".
    const span = trace.getActiveSpan();
    if (span) {
      const traceId = span.spanContext().traceId;
      if (traceId) {
        context.traceId = traceId;
      }
      context.rootSpan = span;
      applyOperationToSpan(span, context);
    }

    setRequestContext(res, context);

    res.setHeader('x-operation-name', operationName);
    res.setHeader('x-correlation-id', context.correlationId);
    res.setHeader('x-failure-mode', context.failureMode);
    if (context.traceId) {
      res.setHeader('x-trace-id', context.traceId);
    }

    next();
  };

  return middleware;
}
