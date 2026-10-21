import type { FailureMode } from './failure-modes.js';

/**
 * Error de negocio con la forma estable que consume el frontend:
 * `{ error: { code, message, operationName, correlationId } }`.
 *
 * El `name` de la clase es el *tipo* de excepcion que OpenTelemetry registra
 * (`exception.type`), y es lo que el copilot agrupa en la KQL de `exceptions`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly operationName: string;
  readonly failureMode: FailureMode;

  constructor(init: {
    code: string;
    message: string;
    status: number;
    operationName: string;
    failureMode: FailureMode;
    exceptionType: string;
  }) {
    super(init.message);
    this.name = init.exceptionType;
    this.status = init.status;
    this.code = init.code;
    this.operationName = init.operationName;
    this.failureMode = init.failureMode;
    Error.captureStackTrace(this, ApiError);
  }
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  operationName: string;
  correlationId: string;
}

export interface ErrorResponseBody {
  error: ApiErrorPayload;
}

export function toErrorPayload(error: ApiError, correlationId: string): ErrorResponseBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      operationName: error.operationName,
      correlationId,
    },
  };
}
