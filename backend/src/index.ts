import type { Server } from 'node:http';
import { loadConfig } from './config.js';
import { redactDatabaseUrl } from './domain/database.js';
import { createLogger } from './observability/logger.js';
import { initTelemetry, type TelemetryHandle } from './observability/telemetry.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.serviceName, { minLevel: config.logLevel });

  for (const warning of config.warnings) {
    logger.warn('configuration_warning', { detail: warning });
  }

  // La instrumentacion de OpenTelemetry tiene que registrarse ANTES de que se
  // cargue Express: los auto-instrumentadores parchean el modulo en el
  // momento de importarlo. Por eso la app se carga con `import()` dinamico.
  let telemetry: TelemetryHandle = {
    exporter: 'none',
    shutdown: async () => undefined,
  };
  if (config.telemetryEnabled) {
    telemetry = initTelemetry({
      serviceName: config.serviceName,
      serviceVersion: config.serviceVersion,
      environment: config.environment,
      ...(config.appInsightsConnectionString
        ? { connectionString: config.appInsightsConnectionString }
        : {}),
    });
  }

  const { createApp } = await import('./app.js');
  const { app } = createApp({ config, logger });

  const server: Server = app.listen(config.port, () => {
    logger.info('server_started', {
      port: config.port,
      environment: config.environment,
      failureMode: config.initialFailureMode,
      telemetryExporter: telemetry.exporter,
      // Sin credenciales: la cadena de conexion puede llevar usuario y
      // contrasena, asi que al loguearla se redactan.
      databaseUrl: redactDatabaseUrl(config.databaseUrl),
    });
  });

  const shutdown = (signal: string): void => {
    logger.info('server_stopping', { signal });
    server.close(() => {
      void telemetry.shutdown().finally(() => {
        process.exit(0);
      });
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'fatal_startup_error',
      error: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exit(1);
});
