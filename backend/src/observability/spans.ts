import { SpanKind, SpanStatusCode, type Span, type Tracer } from '@opentelemetry/api';
import type { ApiError } from '../domain/errors.js';
import type { RequestContext } from './request-context.js';

/**
 * Atributos del span.
 *
 * `operation_Name` es el atributo que conecta el span con la KQL del copilot
 * (`exceptions | summarize by type, outerMessage, operation_Name`). Ademas se
 * renombra el span raiz para que la tabla `requests` de Application Insights
 * tenga `operation_Name = "Checkout" | "Payment" | "Inventory"`.
 */
export const ATTRIBUTE_OPERATION_NAME = 'operation_Name';
export const ATTRIBUTE_FAILURE_MODE = 'app.failure_mode';
export const ATTRIBUTE_CORRELATION_ID = 'app.correlation_id';
export const ATTRIBUTE_TRACE_ID = 'app.trace_id';

/** Aplica nombre y atributos al span (idempotente). */
export function applyOperationToSpan(span: Span, context: RequestContext): void {
  span.updateName(context.operationName);
  span.setAttribute(ATTRIBUTE_OPERATION_NAME, context.operationName);
  span.setAttribute(ATTRIBUTE_FAILURE_MODE, context.failureMode);
  span.setAttribute(ATTRIBUTE_CORRELATION_ID, context.correlationId);
  if (context.traceId) {
    span.setAttribute(ATTRIBUTE_TRACE_ID, context.traceId);
  }
}

/** Marca el span como fallido y cuelga la excepcion (columna `type`). */
export function recordSpanError(span: Span, error: ApiError): void {
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
}

export interface FailedDependencyOptions {
  tracer: Tracer;
  /** Nombre logico de la dependencia (columna `Target` de `dependencies`). */
  name: string;
  /** Host o URL de la dependencia (atributo `server.address`). */
  target: string;
  port?: number;
  /** Estado HTTP devuelto por la dependencia. */
  status: number;
  error: ApiError;
  database?: {
    system: string;
    name: string;
    operation: string;
  };
}

/**
 * Registra la dependencia que ha fallado como span de tipo CLIENT.
 *
 * Asi la KQL `dependencies | where success == false` del copilot encuentra el
 * host equivocado (o el proveedor de pagos caido) junto a la peticion que lo
 * disparo, y no solo la excepcion final.
 */
export function recordFailedDependency(options: FailedDependencyOptions): void {
  const { tracer, name, error } = options;
  const span = tracer.startSpan(name, {
    kind: SpanKind.CLIENT,
    attributes: {
      'peer.service': name,
      'server.address': options.target,
      ...(options.port ? { 'server.port': options.port } : {}),
      // Convenciones HTTP semanticas (nuevas y antiguas: el exportador de
      // Azure Monitor lee las dos).
      'http.request.method': 'GET',
      'http.method': 'GET',
      'http.response.status_code': options.status,
      'http.status_code': options.status,
      ...(options.database
        ? {
            'db.system': options.database.system,
            'db.name': options.database.name,
            'db.operation': options.database.operation,
          }
        : {}),
    },
  });

  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  span.end();
}
