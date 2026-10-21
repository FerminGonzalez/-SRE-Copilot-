import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config.js';
import { createLogger, type Logger } from '../src/observability/logger.js';
import type { FailureModeStore } from '../src/state/failure-mode-store.js';

export interface TestHarness {
  app: Express;
  logger: Logger;
  /** Lineas de log emitidas (JSON en texto). */
  logs: string[];
  config: AppConfig;
  failureModes: FailureModeStore;
}

/**
 * Crea la app con un entorno controlado y un logger que captura las lineas.
 *
 * Los tests no registran OpenTelemetry (ni red, ni credenciales): la
 * telemetria se comprueba por separado en `telemetry.test.ts`.
 */
export function createTestApp(env: Record<string, string> = {}): TestHarness {
  const config = loadConfig({
    FAILURE_MODE: 'none',
    LOG_LEVEL: 'debug',
    ...env,
  } as NodeJS.ProcessEnv);

  const logs: string[] = [];
  const logger = createLogger(config.serviceName, {
    minLevel: 'debug',
    sink: (line) => {
      logs.push(line);
    },
  });

  const { app, failureModes } = createApp({ config, logger });
  return { app, logger, logs, config, failureModes };
}

export function parsedLogs(harness: TestHarness): Record<string, unknown>[] {
  return harness.logs.map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Primera línea de log emitida (lanza si no hay ninguna). */
export function firstLog(harness: TestHarness): Record<string, unknown> {
  const [line] = parsedLogs(harness);
  if (!line) {
    throw new Error('El backend no emitió ninguna línea de log');
  }
  return line;
}
