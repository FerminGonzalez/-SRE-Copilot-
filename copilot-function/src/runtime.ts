/**
 * Runtime del copilot: el objeto que junta todas las piezas.
 *
 * Es la dependencia única de los handlers HTTP (`src/http/*`) y del servidor
 * MCP (`src/mcp/server.ts`):
 *
 * - `config`    · configuración validada (CONTRACTS.md §9),
 * - `provider`  · proveedor de LLM elegido por `LLM_PROVIDER` (§4),
 * - `registry`  · las nueve herramientas del contrato (§3),
 * - `memory`    · memoria de incidentes con fallback local (§5),
 * - `telemetry` · spans de OpenTelemetry.
 *
 * Se construye una sola vez por proceso (los triggers de Azure Functions se
 * reutilizan entre invocaciones), así que el registro de herramientas y la
 * memoria viven mientras viva la Function App.
 */

import { loadConfig, type AppConfig } from "./config";
import type { EngineDependencies } from "./core/engine";
import type { RelatedIncident } from "./core/types";
import { createLlmProvider } from "./llm/factory";
import type { LlmProvider } from "./llm/provider";
import { createTelemetry, type Telemetry } from "./observability/telemetry";
import { IncidentMemory } from "./rag/memory";
import { createToolRegistry, type ToolRegistry } from "./tools/registry";

/** Runtime del copilot. */
export interface Runtime {
  readonly config: AppConfig;
  readonly provider: LlmProvider;
  readonly registry: ToolRegistry;
  readonly memory: IncidentMemory;
  readonly telemetry: Telemetry;
  /** Dependencias que necesita el motor de diagnóstico. */
  engineDependencies(): EngineDependencies;
}

/** Opciones de construcción del runtime (útiles en tests). */
export interface RuntimeOptions {
  /** Desactiva la telemetría (tests). */
  telemetryDisabled?: boolean;
}

/** Crea la memoria de incidentes según la configuración (CONTRACTS.md §5). */
export function createMemory(config: AppConfig): IncidentMemory {
  const { endpoint, index, apiKey } = config.azureSearch;
  const useAzureSearch =
    config.rag.backend !== "local" && Boolean(endpoint) && Boolean(index);

  return new IncidentMemory({
    enabled: config.rag.enabled,
    topK: config.rag.topK,
    ...(useAzureSearch && endpoint && index
      ? {
          azureSearch: {
            endpoint,
            index,
            ...(apiKey ? { apiKey } : {}),
          },
        }
      : {}),
  });
}

/** Crea el runtime completo. */
export function createRuntime(
  config: AppConfig = loadConfig(),
  options: RuntimeOptions = {},
): Runtime {
  const provider = createLlmProvider(config);
  const registry = createToolRegistry(config);
  const memory = createMemory(config);
  const telemetry = createTelemetry({
    serviceName: "sre-copilot",
    serviceVersion: process.env["COPILOT_VERSION"] ?? "1.0.0",
    environment: config.defaults.environment,
    ...(config.appInsights.connectionString
      ? { connectionString: config.appInsights.connectionString }
      : {}),
    ...(options.telemetryDisabled ? { disabled: true } : {}),
  });

  return {
    config,
    provider,
    registry,
    memory,
    telemetry,
    engineDependencies(): EngineDependencies {
      return {
        provider,
        registry,
        telemetry,
        limits: {
          maxIterations: config.engine.maxIterations,
          maxToolCalls: config.engine.maxToolCalls,
        },
        temperature: config.engine.temperature,
        maxTokens: config.engine.maxTokens,
        // Incidentes relacionados: memoria local (o AI Search si está configurada).
        findRelated: async (query): Promise<RelatedIncident[]> =>
          memory.search(`${query.summary} ${query.rootCause}`.trim(), {
            service: query.service,
            limit: config.rag.topK,
          }),
      };
    },
  };
}
