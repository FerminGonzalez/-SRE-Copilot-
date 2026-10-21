import { DEFAULT_DATABASE_URL } from './domain/database.js';
import {
  FAILURE_MODES,
  isFailureMode,
  type FailureMode,
} from './domain/failure-modes.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
  port: number;
  serviceName: string;
  serviceVersion: string;
  environment: string;
  /** Modo de fallo inicial (viene de `FAILURE_MODE`). */
  initialFailureMode: FailureMode;
  databaseUrl: string;
  appInsightsConnectionString?: string;
  telemetryEnabled: boolean;
  logLevel: LogLevel;
  /** Avisos de configuracion (valores invalidos corregidos). */
  warnings: string[];
}

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const warnings: string[] = [];

  const rawMode = (env.FAILURE_MODE ?? 'none').trim();
  let initialFailureMode: FailureMode = 'none';
  if (rawMode.length === 0) {
    initialFailureMode = 'none';
  } else if (isFailureMode(rawMode)) {
    initialFailureMode = rawMode;
  } else {
    warnings.push(
      `FAILURE_MODE="${rawMode}" no es valido. Valores permitidos: ${FAILURE_MODES.join(', ')}. Se usa "none".`,
    );
  }

  const rawLevel = (env.LOG_LEVEL ?? 'info').trim();
  let logLevel: LogLevel = 'info';
  if (LOG_LEVELS.includes(rawLevel as LogLevel)) {
    logLevel = rawLevel as LogLevel;
  } else {
    warnings.push(`LOG_LEVEL="${rawLevel}" no es valido. Se usa "info".`);
  }

  const rawPort = (env.PORT ?? '8080').trim();
  const parsedPort = Number.parseInt(rawPort, 10);
  let port = 8080;
  if (Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536) {
    port = parsedPort;
  } else {
    warnings.push(`PORT="${rawPort}" no es valido. Se usa 8080.`);
  }

  const connectionString = env.APPLICATIONINSIGHTS_CONNECTION_STRING?.trim();
  const tracesExporter = env.OTEL_TRACES_EXPORTER?.trim().toLowerCase();
  const telemetryEnabled =
    env.OTEL_SDK_DISABLED?.trim().toLowerCase() !== 'true' && tracesExporter !== 'none';

  return {
    port,
    serviceName: env.OTEL_SERVICE_NAME?.trim() || 'sre-copilot-backend',
    serviceVersion: env.SERVICE_VERSION?.trim() || '1.0.0',
    environment: env.ENVIRONMENT?.trim() || 'local',
    initialFailureMode,
    // La demo arranca con la cadena de conexion mal configurada de Terraform.
    databaseUrl: env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL,
    ...(connectionString ? { appInsightsConnectionString: connectionString } : {}),
    telemetryEnabled,
    logLevel,
    warnings,
  };
}
