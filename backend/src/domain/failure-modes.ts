/**
 * Modos de fallo del backend.
 *
 * El modo se fija con la variable de entorno `FAILURE_MODE` y puede cambiarse
 * en caliente con `GET /api/chaos?mode=<m>`. El contrato (CONTRACTS.md §7)
 * exige que los fallos sean *deterministas*: el mismo modo produce siempre el
 * mismo codigo, el mismo mensaje, el mismo tipo de excepcion y el mismo
 * `operation_Name`. Asi el diagnostico del copilot es estable entre demos.
 */

export const FAILURE_MODES = ['none', 'database', 'misconfig', 'dependency'] as const;

export type FailureMode = (typeof FAILURE_MODES)[number];

/** Modos que realmente inyectan un fallo (todo lo demas es `none`). */
export const BUSINESS_FAILURE_MODES = ['database', 'misconfig', 'dependency'] as const;

export type BusinessFailureMode = (typeof BUSINESS_FAILURE_MODES)[number];

export interface FailureDefinition {
  readonly mode: BusinessFailureMode;
  /** Codigo HTTP devuelto al cliente. */
  readonly status: number;
  /** Codigo estable del error (viaja en `error.code`). */
  readonly code: string;
  /** Mensaje estable: es lo que el copilot agrupa en la KQL de `exceptions`. */
  readonly message: string;
  /** Nombre de la excepcion: es la columna `type` de la tabla `exceptions`. */
  readonly exceptionType: string;
  /** Descripcion de la dependencia que falla, para la tabla `dependencies`. */
  readonly dependency: {
    readonly name: string;
    readonly kind: 'database' | 'http';
  };
}

export const FAILURE_DEFINITIONS: Record<BusinessFailureMode, FailureDefinition> = {
  database: {
    mode: 'database',
    status: 504,
    code: 'DATABASE_TIMEOUT',
    message: 'Database connection timed out after 5000ms',
    exceptionType: 'DatabaseTimeoutError',
    dependency: { name: 'postgres', kind: 'database' },
  },
  misconfig: {
    mode: 'misconfig',
    status: 500,
    code: 'CONFIGURATION_ERROR',
    message: "Invalid application configuration: required setting 'PAYMENT_PROVIDER_KEY' is missing",
    exceptionType: 'ConfigurationError',
    dependency: { name: 'app-settings', kind: 'http' },
  },
  dependency: {
    mode: 'dependency',
    status: 502,
    code: 'UPSTREAM_DEPENDENCY_ERROR',
    message: "Upstream dependency 'payments-api' returned 502 Bad Gateway",
    exceptionType: 'UpstreamDependencyError',
    dependency: { name: 'payments-api', kind: 'http' },
  },
};

export function isFailureMode(value: string): value is FailureMode {
  return (FAILURE_MODES as readonly string[]).includes(value);
}
