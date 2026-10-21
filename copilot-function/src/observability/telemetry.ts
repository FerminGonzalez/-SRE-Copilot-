/**
 * Telemetría del copilot (OpenTelemetry).
 *
 * El copilot es un *consumidor* de Application Insights (hace consultas KQL),
 * pero también es una Function App instrumentada: cada diagnóstico y cada
 * llamada a herramienta dejan un span, que es lo que permite correlacionar el
 * copilot con el backend cuando ambos están desplegados.
 *
 * - Con `APPLICATIONINSIGHTS_CONNECTION_STRING` se puede etiquetar el recurso
 *   con la conexión; si no hay exporter de Azure Monitor disponible (la
 *   Function App ya trae la instrumentación de App Insights en el host), los
 *   spans se exportan a consola.
 * - Sin telemetría (tests, modo offline) se usa una implementación neutra que
 *   no registra nada pero mantiene la misma interfaz.
 *
 * La interfaz es mínima a propósito (`startSpan` / `withSpan`): así el motor
 * de diagnóstico no depende del SDK de OpenTelemetry y se puede testear sin
 * levantar un provider.
 */

import { context, trace, type Span, type Tracer } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ConsoleSpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

/** Valores admitidos como atributo de span. */
export type TelemetryAttributeValue = string | number | boolean;

/** Atributos de un span. */
export type TelemetryAttributes = Record<string, TelemetryAttributeValue>;

/** Span exponido por la interfaz de telemetría. */
export interface TelemetrySpan {
  setAttribute(key: string, value: TelemetryAttributeValue): void;
  recordError(error: unknown): void;
  end(): void;
}

/** Interfaz de telemetría usada por el motor de diagnóstico. */
export interface Telemetry {
  /** ¿Hay telemetría activa? */
  readonly enabled: boolean;
  /** Abre un span (sin contexto activo). */
  startSpan(name: string, attributes?: TelemetryAttributes): TelemetrySpan | undefined;
  /** Ejecuta `run` dentro de un span, cerrándolo siempre. */
  withSpan<T>(
    name: string,
    attributes: TelemetryAttributes | undefined,
    run: (span: TelemetrySpan) => Promise<T>,
  ): Promise<T>;
  /** Cierra la telemetría (exporta los spans pendientes). */
  shutdown(): Promise<void>;
}

/** Adaptador de un span de OpenTelemetry a la interfaz mínima. */
function adapt(span: Span): TelemetrySpan {
  return {
    setAttribute: (key, value) => {
      span.setAttribute(key, value);
    },
    recordError: (error) => {
      span.recordException(
        error instanceof Error ? error : new Error(String(error)),
      );
    },
    end: () => {
      span.end();
    },
  };
}

/** Telemetría con OpenTelemetry. */
export class OpenTelemetry implements Telemetry {
  public readonly enabled = true;

  private readonly tracer: Tracer;

  public constructor(private readonly provider: NodeTracerProvider, serviceName: string) {
    this.tracer = trace.getTracer(serviceName);
  }

  public startSpan(name: string, attributes?: TelemetryAttributes): TelemetrySpan {
    return adapt(this.tracer.startSpan(name, attributes ? { attributes } : undefined));
  }

  public async withSpan<T>(
    name: string,
    attributes: TelemetryAttributes | undefined,
    run: (span: TelemetrySpan) => Promise<T>,
  ): Promise<T> {
    const span = this.tracer.startSpan(name, attributes ? { attributes } : undefined);
    const active = trace.setSpan(context.active(), span);
    return context.with(active, async () => {
      try {
        return await run(adapt(span));
      } catch (error) {
        span.recordException(
          error instanceof Error ? error : new Error(String(error)),
        );
        throw error;
      } finally {
        span.end();
      }
    });
  }

  public async shutdown(): Promise<void> {
    await this.provider.shutdown();
  }
}

/** Telemetría neutra: mismo contrato, ningún span (tests y modo offline). */
export class NoopTelemetry implements Telemetry {
  public readonly enabled = false;

  public startSpan(): TelemetrySpan | undefined {
    return undefined;
  }

  public async withSpan<T>(
    _name: string,
    _attributes: TelemetryAttributes | undefined,
    run: (span: TelemetrySpan) => Promise<T>,
  ): Promise<T> {
    const noop: TelemetrySpan = {
      setAttribute: () => undefined,
      recordError: () => undefined,
      end: () => undefined,
    };
    return run(noop);
  }

  public async shutdown(): Promise<void> {
    return undefined;
  }
}

/** Opciones de la telemetría del copilot. */
export interface TelemetryOptions {
  serviceName: string;
  serviceVersion: string;
  environment: string;
  /** Connection string de Application Insights (sólo metadatos). */
  connectionString?: string;
  /** Permite desactivar la telemetría (tests, modo offline). */
  disabled?: boolean;
}

/**
 * Crea la telemetría del copilot.
 *
 * Sin `connectionString` los spans se exportan a consola: es lo que hace falta
 * para entender qué está pasando en local, y no requiere ninguna credencial.
 */
export function createTelemetry(options: TelemetryOptions): Telemetry {
  if (options.disabled) {
    return new NoopTelemetry();
  }

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: options.serviceName,
      [ATTR_SERVICE_VERSION]: options.serviceVersion,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: options.environment,
      ...(options.connectionString
        ? { "app.insights.connection_string_set": "true" }
        : {}),
    }),
    spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
  });

  provider.register();

  return new OpenTelemetry(provider, options.serviceName);
}
