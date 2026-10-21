import { AzureMonitorTraceExporter } from '@azure/monitor-opentelemetry-exporter';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation, ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { getRequestContext } from './request-context.js';
import { applyOperationToSpan, recordSpanError } from './spans.js';

export type TelemetryExporterKind = 'azure-monitor' | 'console' | 'none';

export interface TelemetryOptions {
  serviceName: string;
  serviceVersion: string;
  environment: string;
  /** Si esta definida se usa el exportador de Application Insights. */
  connectionString?: string;
}

export interface TelemetryHandle {
  exporter: TelemetryExporterKind;
  shutdown(): Promise<void>;
}

function createExporter(options: TelemetryOptions): {
  kind: TelemetryExporterKind;
  exporter: SpanExporter;
} {
  if (options.connectionString) {
    return {
      kind: 'azure-monitor',
      exporter: new AzureMonitorTraceExporter({
        connectionString: options.connectionString,
      }),
    };
  }
  // Sin connection string (entorno local, CI, tests) exportamos a consola:
  // los spans se ven en el terminal, que es justo lo que hace falta para
  // entender que se esta instrumentando.
  return { kind: 'console', exporter: new ConsoleSpanExporter() };
}

/**
 * Registra OpenTelemetry.
 *
 * - Exportador de Application Insights si hay `APPLICATIONINSIGHTS_CONNECTION_STRING`.
 * - Exportador de consola en caso contrario.
 * - Auto-instrumentacion de `http` y `express` (no hay spans manuales para el
 *   request: el nombre de la operacion lo ponemos nosotros en el span raiz).
 *
 * La instrumentacion se registra **antes** de cargar Express (ver `index.ts`),
 * porque los auto-instrumentadores parchean el modulo en el momento en que se
 * importa.
 */
export function initTelemetry(options: TelemetryOptions): TelemetryHandle {
  const { kind, exporter } = createExporter(options);

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: options.serviceName,
      [ATTR_SERVICE_VERSION]: options.serviceVersion,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: options.environment,
    }),
    spanProcessors: [
      kind === 'azure-monitor'
        ? new BatchSpanProcessor(exporter)
        : new SimpleSpanProcessor(exporter),
    ],
  });

  provider.register({
    contextManager: new AsyncLocalStorageContextManager().enable(),
    // `traceparent` (W3C) es el propagador por defecto; lo declaramos
    // explicitamente (junto con `baggage`) para que se entienda que es lo que
    // correlaciona el backend con el trace del copilot.
    propagator: new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
    }),
  });

  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({
        // `applyCustomAttributesOnSpan` se ejecuta cuando la respuesta ha
        // terminado, con el span servidor (raiz del trace) en la mano. Es el
        // momento adecuado para el nombre definitivo de la operacion: la
        // instrumentacion HTTP renombra el span a "GET /api/checkout" justo
        // antes, asi que aqui lo volvemos a renombrar a "Checkout".
        applyCustomAttributesOnSpan: (span, _request, response) => {
          const context = getRequestContext(response as unknown as object);
          if (!context) {
            return;
          }
          applyOperationToSpan(span, context);
          if (context.error && !context.errorRecorded) {
            recordSpanError(span, context.error);
            context.errorRecorded = true;
          }
        },
      }),
      new ExpressInstrumentation({
        // Ignoramos los spans de capa (`middleware`/`router`): el nombre del
        // span raiz lo gobierna el `operation_Name` del negocio, no la ruta
        // HTTP. Las capas de tipo `route` si se instrumentan.
        ignoreLayersType: [ExpressLayerType.ROUTER, ExpressLayerType.MIDDLEWARE],
      }),
    ],
  });

  return {
    exporter: kind,
    shutdown: async () => {
      await provider.shutdown();
    },
  };
}
