import { trace } from '@opentelemetry/api';
import express, { type Express } from 'express';
import type { AppConfig } from './config.js';
import { Sequence } from './domain/catalog.js';
import { parseDatabaseUrl } from './domain/database.js';
import { OperationRegistry, OperationName } from './domain/operations.js';
import { createLogger, type Logger } from './observability/logger.js';
import { errorHandlerMiddleware, notFoundMiddleware } from './middleware/error-handler.js';
import { requestContextMiddleware } from './middleware/request-context.js';
import { catalogHandler } from './routes/catalog.js';
import { chaosHandler } from './routes/chaos.js';
import { checkoutHandler } from './routes/checkout.js';
import { defineGet } from './routes/define-route.js';
import type { RouteDeps } from './routes/deps.js';
import { healthHandler } from './routes/health.js';
import { inventoryHandler } from './routes/inventory.js';
import { paymentHandler } from './routes/payment.js';
import { FailureModeStore } from './state/failure-mode-store.js';

export interface CreateAppOptions {
  config: AppConfig;
  /** Logger a usar. Si no se pasa, se crea uno con la configuracion. */
  logger?: Logger;
}

export interface AppBundle {
  app: Express;
  logger: Logger;
  failureModes: FailureModeStore;
}

/**
 * Construye la aplicacion Express.
 *
 * Rutas (CONTRACTS.md §7):
 *   GET /health        -> health del backend
 *   GET /api/catalog   -> productos y stock
 *   GET /api/checkout  -> operationName `Checkout`
 *   GET /api/payment   -> operationName `Payment`
 *   GET /api/inventory -> operationName `Inventory`
 *   GET /api/chaos     -> activa/desactiva un fallo
 */
export function createApp(options: CreateAppOptions): AppBundle {
  const { config } = options;
  const logger = options.logger ?? createLogger(config.serviceName, { minLevel: config.logLevel });
  const failureModes = new FailureModeStore(config.initialFailureMode);
  const registry = new OperationRegistry();
  const sequence = new Sequence();
  const startedAt = Date.now();

  const routeDeps: RouteDeps = {
    tracer: trace.getTracer(config.serviceName),
    database: parseDatabaseUrl(config.databaseUrl),
    sequence,
    failureModes,
  };
  const routeOptions = { registry, logger };

  const app = express();
  app.disable('x-powered-by');

  // 1. Contexto: correlation id, operation name, cabeceras y span raiz.
  app.use(requestContextMiddleware({ registry, failureModes }));

  // 2. Rutas de negocio.
  defineGet(app, routeOptions, '/health', OperationName.Health, healthHandler({
    startedAt,
    serviceName: config.serviceName,
    serviceVersion: config.serviceVersion,
    environment: config.environment,
  }));
  defineGet(app, routeOptions, '/api/catalog', OperationName.Catalog, catalogHandler());
  defineGet(app, routeOptions, '/api/checkout', OperationName.Checkout, checkoutHandler(routeDeps));
  defineGet(app, routeOptions, '/api/payment', OperationName.Payment, paymentHandler(routeDeps));
  defineGet(app, routeOptions, '/api/inventory', OperationName.Inventory, inventoryHandler(routeDeps));
  defineGet(app, routeOptions, '/api/chaos', OperationName.Chaos, chaosHandler({ failureModes }));

  // 3. Errores: 404 y formato de error unico.
  app.use(notFoundMiddleware());
  app.use(errorHandlerMiddleware({ logger }));

  return { app, logger, failureModes };
}
