/**
 * Configuración por variables de entorno.
 *
 * Reglas (CONTRACTS.md §9 y §10):
 * - Ningún secreto en el código: todo entra por `process.env`.
 * - Valores por defecto seguros: sin credenciales el copilot arranca en modo
 *   `mock` + herramientas offline, que es lo que usan los tests.
 * - Si el proveedor elegido no tiene credenciales, se falla al arrancar con un
 *   mensaje explícito en vez de degradar en silencio.
 */

import { z } from "zod";

/** Proveedores de LLM soportados. */
export type LlmProviderName = "azure-openai" | "anthropic" | "mock";

/** Configuración efectiva de la Function App. */
export interface AppConfig {
  llmProvider: LlmProviderName;
  azureOpenAi: {
    endpoint?: string;
    apiKey?: string;
    deployment: string;
    apiVersion: string;
  };
  anthropic: {
    apiKey?: string;
    model: string;
  };
  github: {
    token?: string;
    repo?: string;
  };
  dynatrace: {
    apiUrl?: string;
    apiToken?: string;
  };
  monitor: {
    workspaceId?: string;
    apiKey?: string;
  };
  azureSearch: {
    endpoint?: string;
    index?: string;
    apiKey?: string;
  };
  appInsights: {
    connectionString?: string;
  };
  rag: {
    enabled: boolean;
    backend: "auto" | "local" | "azure-search";
    topK: number;
  };
  engine: {
    maxIterations: number;
    maxToolCalls: number;
    defaultWindowMinutes: number;
    temperature: number;
    maxTokens: number;
  };
  defaults: {
    service: string;
    environment: string;
  };
  sweep: {
    services: string[];
    windowMinutes: number;
  };
  alertQueueName: string;
}

/** Error de configuración con mensaje accionable. */
export class ConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const intWithDefault = (fallback: number, min: number, max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(min).max(max).default(fallback),
  );

const boolWithDefault = (fallback: boolean) =>
  z.preprocess(emptyToUndefined, z.coerce.boolean().default(fallback));

/** Esquema de las variables de entorno. */
const envSchema = z.object({
  LLM_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["azure-openai", "anthropic", "mock"]).default("mock")),
  AZURE_OPENAI_ENDPOINT: optionalString,
  AZURE_OPENAI_API_KEY: optionalString,
  AZURE_OPENAI_DEPLOYMENT: optionalString,
  AZURE_OPENAI_API_VERSION: z.preprocess(emptyToUndefined, z.string().min(1).default("2024-10-21")),
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.preprocess(emptyToUndefined, z.string().min(1).default("claude-sonnet-4-5")),
  GITHUB_TOKEN: optionalString,
  GITHUB_REPO: optionalString,
  DYNAATRACE_API_URL: optionalString,
  DYNAATRACE_API_TOKEN: optionalString,
  AZURE_MONITOR_WORKSPACE_ID: optionalString,
  AZURE_MONITOR_API_KEY: optionalString,
  AZURE_SEARCH_ENDPOINT: optionalString,
  AZURE_SEARCH_INDEX: optionalString,
  AZURE_SEARCH_API_KEY: optionalString,
  APPLICATIONINSIGHTS_CONNECTION_STRING: optionalString,
  RAG_ENABLED: boolWithDefault(true),
  RAG_BACKEND: z.preprocess(emptyToUndefined, z.enum(["auto", "local", "azure-search"]).default("auto")),
  RAG_TOP_K: intWithDefault(5, 1, 50),
  DIAGNOSTIC_MAX_ITERATIONS: intWithDefault(6, 1, 20),
  DIAGNOSTIC_MAX_TOOL_CALLS: intWithDefault(12, 1, 60),
  DIAGNOSTIC_DEFAULT_WINDOW_MINUTES: intWithDefault(15, 1, 1440),
  DIAGNOSTIC_TEMPERATURE: z.preprocess(
    emptyToUndefined,
    z.coerce.number().min(0).max(2).default(0.2),
  ),
  DIAGNOSTIC_MAX_TOKENS: intWithDefault(2048, 256, 32768),
  DIAGNOSTIC_DEFAULT_SERVICE: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default("sre-copilot-api"),
  ),
  DIAGNOSTIC_DEFAULT_ENVIRONMENT: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default("dev"),
  ),
  SWEEP_SERVICES: z.preprocess(emptyToUndefined, z.string().optional()),
  SWEEP_WINDOW_MINUTES: intWithDefault(30, 1, 1440),
  ALERT_QUEUE_NAME: z.preprocess(emptyToUndefined, z.string().min(1).default("sre-copilot-alerts")),
});

/** Formato de `process.env` (o de cualquier objeto plano equivalente). */
export type EnvLike = Record<string, string | undefined>;

/**
 * Carga y valida la configuración.
 *
 * @throws {ConfigError} cuando falta una variable obligatoria del proveedor elegido.
 */
export function loadConfig(env: EnvLike = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new ConfigError(`Configuración inválida: ${detail}`);
  }

  const raw = parsed.data;
  const llmProvider = raw.LLM_PROVIDER;

  if (llmProvider === "azure-openai") {
    const missing = [
      ["AZURE_OPENAI_ENDPOINT", raw.AZURE_OPENAI_ENDPOINT],
      ["AZURE_OPENAI_API_KEY", raw.AZURE_OPENAI_API_KEY],
      ["AZURE_OPENAI_DEPLOYMENT", raw.AZURE_OPENAI_DEPLOYMENT],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new ConfigError(
        `LLM_PROVIDER=azure-openai requiere ${missing.join(", ")} (CONTRACTS.md §9).`,
      );
    }
  }

  if (llmProvider === "anthropic" && !raw.ANTHROPIC_API_KEY) {
    throw new ConfigError("LLM_PROVIDER=anthropic requiere ANTHROPIC_API_KEY (CONTRACTS.md §9).");
  }

  const services = (raw.SWEEP_SERVICES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return {
    llmProvider,
    azureOpenAi: {
      ...(raw.AZURE_OPENAI_ENDPOINT !== undefined ? { endpoint: raw.AZURE_OPENAI_ENDPOINT } : {}),
      ...(raw.AZURE_OPENAI_API_KEY !== undefined ? { apiKey: raw.AZURE_OPENAI_API_KEY } : {}),
      deployment: raw.AZURE_OPENAI_DEPLOYMENT ?? "",
      apiVersion: raw.AZURE_OPENAI_API_VERSION,
    },
    anthropic: {
      ...(raw.ANTHROPIC_API_KEY !== undefined ? { apiKey: raw.ANTHROPIC_API_KEY } : {}),
      model: raw.ANTHROPIC_MODEL,
    },
    github: {
      ...(raw.GITHUB_TOKEN !== undefined ? { token: raw.GITHUB_TOKEN } : {}),
      ...(raw.GITHUB_REPO !== undefined ? { repo: raw.GITHUB_REPO } : {}),
    },
    dynatrace: {
      ...(raw.DYNAATRACE_API_URL !== undefined ? { apiUrl: raw.DYNAATRACE_API_URL } : {}),
      ...(raw.DYNAATRACE_API_TOKEN !== undefined ? { apiToken: raw.DYNAATRACE_API_TOKEN } : {}),
    },
    monitor: {
      ...(raw.AZURE_MONITOR_WORKSPACE_ID !== undefined ? { workspaceId: raw.AZURE_MONITOR_WORKSPACE_ID } : {}),
      ...(raw.AZURE_MONITOR_API_KEY !== undefined ? { apiKey: raw.AZURE_MONITOR_API_KEY } : {}),
    },
    azureSearch: {
      ...(raw.AZURE_SEARCH_ENDPOINT !== undefined ? { endpoint: raw.AZURE_SEARCH_ENDPOINT } : {}),
      ...(raw.AZURE_SEARCH_INDEX !== undefined ? { index: raw.AZURE_SEARCH_INDEX } : {}),
      ...(raw.AZURE_SEARCH_API_KEY !== undefined ? { apiKey: raw.AZURE_SEARCH_API_KEY } : {}),
    },
    appInsights: {
      ...(raw.APPLICATIONINSIGHTS_CONNECTION_STRING !== undefined
        ? { connectionString: raw.APPLICATIONINSIGHTS_CONNECTION_STRING }
        : {}),
    },
    rag: {
      enabled: raw.RAG_ENABLED,
      backend: raw.RAG_BACKEND,
      topK: raw.RAG_TOP_K,
    },
    engine: {
      maxIterations: raw.DIAGNOSTIC_MAX_ITERATIONS,
      maxToolCalls: raw.DIAGNOSTIC_MAX_TOOL_CALLS,
      defaultWindowMinutes: raw.DIAGNOSTIC_DEFAULT_WINDOW_MINUTES,
      temperature: raw.DIAGNOSTIC_TEMPERATURE,
      maxTokens: raw.DIAGNOSTIC_MAX_TOKENS,
    },
    defaults: {
      service: raw.DIAGNOSTIC_DEFAULT_SERVICE,
      environment: raw.DIAGNOSTIC_DEFAULT_ENVIRONMENT,
    },
    sweep: {
      services: services.length > 0 ? services : [raw.DIAGNOSTIC_DEFAULT_SERVICE],
      windowMinutes: raw.SWEEP_WINDOW_MINUTES,
    },
    alertQueueName: raw.ALERT_QUEUE_NAME,
  };
}

/** Resumen seguro de la configuración (sin secretos) para logs y `/api/health`. */
export function describeConfig(config: AppConfig): Record<string, unknown> {
  return {
    llmProvider: config.llmProvider,
    azureOpenAi: {
      configured: Boolean(config.azureOpenAi.endpoint && config.azureOpenAi.apiKey),
      deployment: config.azureOpenAi.deployment || undefined,
    },
    anthropic: { configured: Boolean(config.anthropic.apiKey) },
    github: { configured: Boolean(config.github.token && config.github.repo), repo: config.github.repo },
    dynatrace: { configured: Boolean(config.dynatrace.apiUrl && config.dynatrace.apiToken) },
    monitor: { configured: Boolean(config.monitor.workspaceId && config.monitor.apiKey) },
    azureSearch: { configured: Boolean(config.azureSearch.endpoint && config.azureSearch.index) },
    appInsights: { configured: Boolean(config.appInsights.connectionString) },
    rag: config.rag,
    engine: config.engine,
  };
}
