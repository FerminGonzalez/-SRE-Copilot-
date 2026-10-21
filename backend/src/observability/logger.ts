import type { LogLevel } from '../config.js';

export type { LogLevel };

export interface LogFields {
  readonly [key: string]: unknown;
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export interface LoggerOptions {
  minLevel?: LogLevel;
  /** Destino de las lineas. Por defecto `process.stdout`. */
  sink?: (line: string) => void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Logger estructurado: una linea JSON por evento.
 *
 * Cada peticion emite una linea con `timestamp`, `level`, `message`,
 * `operationName`, `correlationId`, `durationMs` y `status`, que es
 * exactamente lo que el copilot encuentra en `customEvents`/`traces` y lo
 * que se ve en `kubectl logs` o en el Log Stream de App Service.
 */
export function createLogger(serviceName: string, options: LoggerOptions = {}): Logger {
  const minLevel = options.minLevel ?? 'info';
  const sink = options.sink ?? ((line: string) => process.stdout.write(`${line}\n`));

  const write = (level: LogLevel, message: string, fields: LogFields = {}): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) {
      return;
    }
    const record: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      service: serviceName,
      ...fields,
    };
    // `message` es el *nombre del evento* (por ejemplo `request_completed`) y
    // es una clave reservada: ningún campo extra puede sobrescribirlo. El
    // texto libre de un error va en `errorMessage` o en `detail`.
    record.message = message;
    sink(JSON.stringify(record));
  };

  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  };
}
