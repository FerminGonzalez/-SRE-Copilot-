import type { Span } from '@opentelemetry/api';
import type { ApiError } from '../domain/errors.js';
import type { FailureMode } from '../domain/failure-modes.js';

/**
 * Contexto de la peticion en curso.
 *
 * Viaja asociado a la respuesta (WeakMap) para que el middleware, los
 * handlers, el manejador de errores y el hook de OpenTelemetry compartan
 * exactamente los mismos datos sin contaminar el objeto `Request` de Express.
 */
export interface RequestContext {
  correlationId: string;
  operationName: string;
  failureMode: FailureMode;
  method: string;
  path: string;
  startedAt: number;
  traceId?: string;
  error?: ApiError;
  /**
   * Span raiz de la peticion (el span servidor de OpenTelemetry).
   *
   * Lo capturamos en el middleware de contexto porque ahi el span activo es
   * el raiz (las capas de Express de tipo `middleware` no se instrumentan).
   * Asi la excepcion se cuelga del span raiz y no de un span de capa, y la
   * tabla `exceptions` queda asociada al `operation_Name` correcto.
   */
  rootSpan?: Span;
  /** Marca que la excepcion ya se registro en algun span (evita duplicados). */
  errorRecorded?: boolean;
}

const contexts = new WeakMap<object, RequestContext>();

export function setRequestContext(response: object, context: RequestContext): void {
  contexts.set(response, context);
}

export function getRequestContext(response: object): RequestContext | undefined {
  return contexts.get(response);
}
