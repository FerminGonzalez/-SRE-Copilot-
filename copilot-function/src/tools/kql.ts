/**
 * Herramientas KQL contra Application Insights / Log Analytics (CONTRACTS.md §3).
 *
 * - `query_exceptions`      · KQL sobre `exceptions`
 * - `query_traces`          · KQL sobre `requests` / `dependencies`
 * - `query_custom_events`   · KQL sobre `customEvents` (evento `Deploy`)
 * - `query_metrics`         · KQL sobre `customMetrics` / `availabilityResults`
 *
 * La sintaxis sigue la guía del curso (`guia/05-kql.md`): pipe, `where`,
 * `summarize`, `order by`, `ago()` y `todouble()`.
 *
 * Si no hay workspace configurado se usa el dataset offline determinista
 * (`src/tools/offline.ts`). Si hay workspace pero la consulta falla, la
 * herramienta devuelve `ok: false` con el error: nunca se disimula un fallo
 * real con datos sintéticos.
 */

import { z } from "zod";
import type { AppConfig } from "../config";
import type { Tool, ToolContext, ToolResult } from "../core/types";
import type {
  CustomEventQueryData,
  DependencyFailure,
  DeployEvent,
  ExceptionGroup,
  ExceptionQueryData,
  MetricPoint,
  MetricQueryData,
  RequestLatencyRow,
  TraceQueryData,
} from "./data";
import { buildOfflineDataset } from "./offline";
import { formatZodError, jsonSchemaFromZod } from "./schema";

/* -------------------------------------------------------------------------- */
/* Cliente KQL                                                                 */
/* -------------------------------------------------------------------------- */

/** Tabla devuelta por la API de consulta de Log Analytics. */
export interface KqlTable {
  name: string;
  columns: Array<{ name: string; type: string }>;
  rows: unknown[][];
}

/** Respuesta de la API de consulta. */
export interface KqlResponse {
  tables: KqlTable[];
}

/** Cliente de consulta KQL. */
export interface KqlClient {
  /** ¿Hay backend configurado? */
  readonly configured: boolean;
  /** Ejecuta una consulta KQL. */
  query(text: string): Promise<KqlResponse>;
}

/** Error de configuración del backend de telemetría. */
export class KqlNotConfiguredError extends Error {
  public constructor() {
    super(
      "Azure Monitor no está configurado: define AZURE_MONITOR_WORKSPACE_ID y AZURE_MONITOR_API_KEY.",
    );
    this.name = "KqlNotConfiguredError";
  }
}

const LOG_ANALYTICS_API_VERSION = "2022-10-01";

/** Cliente real contra la API de consulta de Azure Log Analytics. */
export class AzureMonitorKqlClient implements KqlClient {
  public readonly configured = true;

  public constructor(
    private readonly workspaceId: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 15_000,
  ) {}

  public async query(text: string): Promise<KqlResponse> {
    const url = `https://api.loganalytics.io/v1/workspaces/${encodeURIComponent(
      this.workspaceId,
    )}/query?api-version=${LOG_ANALYTICS_API_VERSION}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ query: text }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Azure Monitor respondió ${response.status}: ${body.slice(0, 300)}`);
    }
    return (await response.json()) as KqlResponse;
  }
}

/** Cliente que falla siempre: se usa cuando no hay credenciales. */
export class UnconfiguredKqlClient implements KqlClient {
  public readonly configured = false;

  public async query(): Promise<KqlResponse> {
    throw new KqlNotConfiguredError();
  }
}

/** Crea el cliente KQL a partir de la configuración. */
export function createKqlClient(config: AppConfig): KqlClient {
  const { workspaceId, apiKey } = config.monitor;
  if (workspaceId && apiKey) {
    return new AzureMonitorKqlClient(workspaceId, apiKey);
  }
  return new UnconfiguredKqlClient();
}

/** Convierte las filas (arrays) de la API en objetos usando las columnas. */
export function rowsToObjects(table: KqlTable | undefined): Record<string, unknown>[] {
  if (!table) {
    return [];
  }
  const columnNames = table.columns.map((column) => column.name);
  return table.rows.map((row) => {
    if (Array.isArray(row)) {
      const record: Record<string, unknown> = {};
      columnNames.forEach((name, index) => {
        record[name] = row[index];
      });
      return record;
    }
    if (typeof row === "object" && row !== null) {
      return row;
    }
    return { value: row };
  });
}

/** Primera tabla con datos de la respuesta. */
export function firstTable(response: KqlResponse): KqlTable | undefined {
  return response.tables.find((table) => table.rows.length > 0) ?? response.tables[0];
}

/* -------------------------------------------------------------------------- */
/* Construcción de consultas KQL                                               */
/* -------------------------------------------------------------------------- */

/** Filtro opcional por `cloud_RoleName` (nombre del servicio en App Insights). */
function roleFilter(roleName: string | undefined): string {
  return roleName ? `| where cloud_RoleName =~ "${roleName.replace(/"/g, '""')}"\n` : "";
}

/**
 * Consulta de excepciones agrupadas por tipo, mensaje y operación.
 * `exceptions | where timestamp > ago(15m) | summarize count() by ...`
 */
export function buildExceptionsQuery(windowMinutes: number, roleName?: string): string {
  return (
    "exceptions\n" +
    `| where timestamp > ago(${windowMinutes}m)\n` +
    roleFilter(roleName) +
    "| summarize count() by type, outerMessage, operation_Name, firstSeen = min(timestamp), lastSeen = max(timestamp)\n" +
    "| order by count_ desc"
  );
}

/** Consulta de latencia por endpoint (p50/p95 y fallos). */
export function buildRequestsQuery(windowMinutes: number, roleName?: string): string {
  return (
    "requests\n" +
    `| where timestamp > ago(${windowMinutes}m)\n` +
    roleFilter(roleName) +
    "| summarize total = count(), failures = countif(success == false), p50 = percentile(duration, 50), p95 = percentile(duration, 95) by name\n" +
    "| order by p95 desc"
  );
}

/** Consulta de dependencias salientes con error. */
export function buildDependenciesQuery(windowMinutes: number, roleName?: string): string {
  return (
    "dependencies\n" +
    `| where timestamp > ago(${windowMinutes}m) and success == false\n` +
    roleFilter(roleName) +
    "| summarize failures = count() by target, type\n" +
    "| order by failures desc"
  );
}

/** Consulta del evento `Deploy` emitido por el pipeline de CI/CD. */
export function buildDeploysQuery(lookbackMinutes: number, roleName?: string): string {
  return (
    "customEvents\n" +
    `| where timestamp > ago(${lookbackMinutes}m)\n` +
    roleFilter(roleName) +
    '| where name == "Deploy"\n' +
    "| top 5 by timestamp desc\n" +
    "| project commit_sha = tostring(customDimensions.commitSha), deployedAt = timestamp, version = tostring(customDimensions.version), author = tostring(customDimensions.author), message = tostring(customDimensions.message)"
  );
}

/** Serie de métricas por minuto (customMetrics). */
export function buildMetricsQuery(windowMinutes: number, roleName?: string): string {
  return (
    "customMetrics\n" +
    `| where timestamp > ago(${windowMinutes}m)\n` +
    roleFilter(roleName) +
    "| summarize total = count(), errors = countif(success == false), avgDuration = avg(todouble(customMeasurements.duration)) by bin(timestamp, 1m)\n" +
    "| order by bin_timestamp asc"
  );
}

/** Disponibilidad por intervalo (availabilityResults). */
export function buildAvailabilityQuery(windowMinutes: number, roleName?: string): string {
  return (
    "availabilityResults\n" +
    `| where timestamp > ago(${windowMinutes}m)\n` +
    roleFilter(roleName) +
    "| summarize availability = avg(todouble(success)) by name\n" +
    "| where availability < 1.0"
  );
}

/** Búsqueda de texto libre en la tabla `traces`. */
export function buildSearchLogsQuery(
  needle: string,
  windowMinutes: number,
  roleName?: string,
): string {
  return (
    "traces\n" +
    `| where timestamp > ago(${windowMinutes}m)\n` +
    roleFilter(roleName) +
    `| where message contains "${needle}"\n` +
    "| project timestamp, message, severityLevel, operation_Name\n" +
    "| order by timestamp desc\n" +
    "| take 50"
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers de conversión                                                        */
/* -------------------------------------------------------------------------- */

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return fallback;
}

export { asString };

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export { asNumber };

function toIso(value: unknown, fallback: string): string {
  const text = asString(value);
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? fallback : new Date(parsed).toISOString();
}

export { toIso };

/* -------------------------------------------------------------------------- */
/* Esquemas de argumentos                                                       */
/* -------------------------------------------------------------------------- */

const windowArg = z.number().int().min(1).max(1440).optional();
const roleArg = z.string().min(1).max(200).optional();

/** Argumentos de `query_exceptions`. */
export const exceptionsArgsSchema = z.object({
  windowMinutes: windowArg,
  top: z.number().int().min(1).max(100).optional(),
  roleName: roleArg,
});

/** Argumentos de `query_traces`. */
export const tracesArgsSchema = z.object({
  windowMinutes: windowArg,
  top: z.number().int().min(1).max(100).optional(),
  roleName: roleArg,
});

/** Argumentos de `query_custom_events`. */
export const customEventsArgsSchema = z.object({
  windowMinutes: windowArg,
  top: z.number().int().min(1).max(20).optional(),
  roleName: roleArg,
});

/** Argumentos de `query_metrics`. */
export const metricsArgsSchema = z.object({
  windowMinutes: windowArg,
  top: z.number().int().min(1).max(200).optional(),
  roleName: roleArg,
});

/* -------------------------------------------------------------------------- */
/* Herramientas                                                                 */
/* -------------------------------------------------------------------------- */

/** Helper: construye el resultado de error de una herramienta. */
function failure(summary: string, error: string, startedAt: number): ToolResult {
  return { ok: false, summary, error, durationMs: Date.now() - startedAt };
}

/**
 * `query_exceptions` — agrupa excepciones por tipo y mensaje en la ventana.
 */
export function createQueryExceptionsTool(client: KqlClient): Tool {
  return {
    name: "query_exceptions",
    description:
      "Consulta KQL sobre `exceptions`: agrupa por tipo y mensaje, cuenta y ventana temporal.",
    parameters: jsonSchemaFromZod(exceptionsArgsSchema),
    async run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      const startedAt = Date.now();
      const parsed = exceptionsArgsSchema.safeParse(args);
      if (!parsed.success) {
        return failure(
          "Argumentos inválidos para query_exceptions",
          formatZodError(parsed.error),
          startedAt,
        );
      }
      const windowMinutes = parsed.data.windowMinutes ?? ctx.windowMinutes;
      const top = parsed.data.top ?? 10;
      const query = buildExceptionsQuery(windowMinutes, parsed.data.roleName);

      if (client.configured) {
        try {
          const response = await client.query(query);
          const rows: ExceptionGroup[] = rowsToObjects(firstTable(response))
            .slice(0, top)
            .map((row) => ({
              type: asString(row["type"]),
              outerMessage: asString(row["outerMessage"]),
              operationName: asString(row["operation_Name"]),
              count: asNumber(row["count_"] ?? row["count"]),
              firstSeen: toIso(row["firstSeen"], ctx.now.toISOString()),
              lastSeen: toIso(row["lastSeen"], ctx.now.toISOString()),
            }));
          const data: ExceptionQueryData = {
            mode: "live",
            query,
            rows,
            totalCount: rows.reduce((sum, row) => sum + row.count, 0),
          };
          const dominant = rows[0];
          return {
            ok: true,
            summary: dominant
              ? `${data.totalCount} excepciones en ${rows.length} grupos; dominante: ${dominant.type} (${dominant.count})`
              : "Sin excepciones en la ventana",
            data,
            durationMs: Date.now() - startedAt,
          };
        } catch (error) {
          return failure(
            "Fallo la consulta de excepciones a Azure Monitor",
            error instanceof Error ? error.message : String(error),
            startedAt,
          );
        }
      }

      const dataset = buildOfflineDataset(ctx);
      const rows = dataset.exceptions.slice(0, top);
      const data: ExceptionQueryData = {
        mode: "offline",
        query,
        rows,
        totalCount: rows.reduce((sum, row) => sum + row.count, 0),
      };
      const dominant = rows[0];
      return {
        ok: true,
        summary: dominant
          ? `[offline] ${data.totalCount} excepciones; dominante: ${dominant.type} (${dominant.count})`
          : "[offline] Sin excepciones en la ventana",
        data,
        durationMs: Date.now() - startedAt,
      };
    },
  };
}

/**
 * `query_traces` — latencia p50/p95 por endpoint y dependencias con error.
 */
export function createQueryTracesTool(client: KqlClient): Tool {
  return {
    name: "query_traces",
    description:
      "Consulta KQL sobre `requests`/`dependencies`: latencia p50/p95 y dependencias con error.",
    parameters: jsonSchemaFromZod(tracesArgsSchema),
    async run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      const startedAt = Date.now();
      const parsed = tracesArgsSchema.safeParse(args);
      if (!parsed.success) {
        return failure(
          "Argumentos inválidos para query_traces",
          formatZodError(parsed.error),
          startedAt,
        );
      }
      const windowMinutes = parsed.data.windowMinutes ?? ctx.windowMinutes;
      const top = parsed.data.top ?? 10;
      const requestsQuery = buildRequestsQuery(windowMinutes, parsed.data.roleName);
      const dependenciesQuery = buildDependenciesQuery(windowMinutes, parsed.data.roleName);
      const query = `${requestsQuery}\n---\n${dependenciesQuery}`;

      if (client.configured) {
        try {
          const [requestsResponse, dependenciesResponse] = await Promise.all([
            client.query(requestsQuery),
            client.query(dependenciesQuery),
          ]);
          const requests: RequestLatencyRow[] = rowsToObjects(firstTable(requestsResponse))
            .slice(0, top)
            .map((row) => ({
              name: asString(row["name"]),
              count: asNumber(row["total"]),
              failures: asNumber(row["failures"]),
              p50: asNumber(row["p50"]),
              p95: asNumber(row["p95"]),
            }));
          const dependencies: DependencyFailure[] = rowsToObjects(firstTable(dependenciesResponse))
            .slice(0, top)
            .map((row) => ({
              target: asString(row["target"]),
              type: asString(row["type"], "Unknown"),
              failures: asNumber(row["failures"]),
              message: asString(row["message"], `fallos en ${asString(row["target"])}`),
            }));
          const data: TraceQueryData = { mode: "live", query, requests, dependencies };
          const worst = requests[0];
          return {
            ok: true,
            summary: worst
              ? `p95 más alto en ${worst.name} (${worst.p95}ms, ${worst.failures} fallos); ${dependencies.length} dependencias con error`
              : `Sin tráfico en la ventana; ${dependencies.length} dependencias con error`,
            data,
            durationMs: Date.now() - startedAt,
          };
        } catch (error) {
          return failure(
            "Falló la consulta de trazas a Azure Monitor",
            error instanceof Error ? error.message : String(error),
            startedAt,
          );
        }
      }

      const dataset = buildOfflineDataset(ctx);
      const data: TraceQueryData = {
        mode: "offline",
        query,
        requests: dataset.requests.slice(0, top),
        dependencies: dataset.dependencies.slice(0, top),
      };
      const worst = data.requests[0];
      return {
        ok: true,
        summary: worst
          ? `[offline] p95 más alto en ${worst.name} (${worst.p95}ms, ${worst.failures} fallos); ${data.dependencies.length} dependencias con error`
          : "[offline] Sin tráfico en la ventana",
        data,
        durationMs: Date.now() - startedAt,
      };
    },
  };
}

/**
 * `query_custom_events` — busca `name == "Deploy"` y devuelve `commit_sha`.
 */
export function createQueryCustomEventsTool(client: KqlClient): Tool {
  return {
    name: "query_custom_events",
    description:
      'Consulta KQL sobre `customEvents`: busca `name == "Deploy"` y devuelve `commit_sha`.',
    parameters: jsonSchemaFromZod(customEventsArgsSchema),
    async run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      const startedAt = Date.now();
      const parsed = customEventsArgsSchema.safeParse(args);
      if (!parsed.success) {
        return failure(
          "Argumentos inválidos para query_custom_events",
          formatZodError(parsed.error),
          startedAt,
        );
      }
      const top = parsed.data.top ?? 5;
      // El deploy puede ser anterior a la ventana del incidente: se mira más atrás.
      const lookbackMinutes = Math.max(parsed.data.windowMinutes ?? ctx.windowMinutes, 360);
      const query = buildDeploysQuery(lookbackMinutes, parsed.data.roleName);

      if (client.configured) {
        try {
          const response = await client.query(query);
          const deploys: DeployEvent[] = rowsToObjects(firstTable(response))
            .slice(0, top)
            .map((row) => {
              const deploy: DeployEvent = {
                commitSha: asString(row["commit_sha"]),
                deployedAt: toIso(row["deployedAt"], ctx.now.toISOString()),
              };
              const version = asString(row["version"]);
              const author = asString(row["author"]);
              const message = asString(row["message"]);
              return {
                ...deploy,
                ...(version ? { version } : {}),
                ...(author ? { author } : {}),
                ...(message ? { message } : {}),
              };
            });
          const data: CustomEventQueryData = { mode: "live", query, deploys };
          const latest = deploys[0];
          return {
            ok: true,
            summary: latest
              ? `Deploy más reciente: ${latest.commitSha.slice(0, 7)} a las ${latest.deployedAt}`
              : "Sin eventos Deploy registrados",
            data,
            durationMs: Date.now() - startedAt,
          };
        } catch (error) {
          return failure(
            "Falló la consulta de eventos Deploy a Azure Monitor",
            error instanceof Error ? error.message : String(error),
            startedAt,
          );
        }
      }

      const dataset = buildOfflineDataset(ctx);
      const deploys = dataset.deploys.slice(0, top);
      const data: CustomEventQueryData = { mode: "offline", query, deploys };
      const latest = deploys[0];
      return {
        ok: true,
        summary: latest
          ? `[offline] Deploy más reciente: ${latest.commitSha.slice(0, 7)} a las ${latest.deployedAt}`
          : "[offline] Sin eventos Deploy registrados",
        data,
        durationMs: Date.now() - startedAt,
      };
    },
  };
}

/**
 * `query_metrics` — disponibilidad y tasa de error por minuto.
 */
export function createQueryMetricsTool(client: KqlClient): Tool {
  return {
    name: "query_metrics",
    description:
      "Consulta KQL sobre `customMetrics`: disponibilidad y tasa de error por minuto.",
    parameters: jsonSchemaFromZod(metricsArgsSchema),
    async run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      const startedAt = Date.now();
      const parsed = metricsArgsSchema.safeParse(args);
      if (!parsed.success) {
        return failure(
          "Argumentos inválidos para query_metrics",
          formatZodError(parsed.error),
          startedAt,
        );
      }
      const windowMinutes = parsed.data.windowMinutes ?? ctx.windowMinutes;
      const top = parsed.data.top ?? 60;
      const metricsQuery = buildMetricsQuery(windowMinutes, parsed.data.roleName);
      const availabilityQuery = buildAvailabilityQuery(windowMinutes, parsed.data.roleName);
      const query = `${metricsQuery}\n---\n${availabilityQuery}`;

      if (client.configured) {
        try {
          const [metricsResponse, availabilityResponse] = await Promise.all([
            client.query(metricsQuery),
            client.query(availabilityQuery),
          ]);
          const points: MetricPoint[] = rowsToObjects(firstTable(metricsResponse))
            .slice(0, top)
            .map((row) => {
              const total = asNumber(row["total"]);
              const errors = asNumber(row["errors"]);
              return {
                bucket: toIso(row["bin_timestamp"] ?? row["Timestamp"], ctx.now.toISOString()),
                count: total,
                errors,
                errorRate: total > 0 ? Number((errors / total).toFixed(3)) : 0,
                avgDuration: asNumber(row["avgDuration"]),
                p95: 0,
              };
            });
          const availabilityRows = rowsToObjects(firstTable(availabilityResponse));
          const availability =
            availabilityRows.length > 0
              ? asNumber(availabilityRows[0]?.["availability"], 1)
              : points.length > 0
                ? Number(
                    (
                      1 -
                      points.reduce((sum, point) => sum + point.errors, 0) /
                        Math.max(1, points.reduce((sum, point) => sum + point.count, 0))
                    ).toFixed(4),
                  )
                : 1;
          const data: MetricQueryData = {
            mode: "live",
            query,
            availability,
            errorRate: points.length > 0 ? points[points.length - 1]?.errorRate ?? 0 : 0,
            points,
          };
          return {
            ok: true,
            summary: `Disponibilidad ${(availability * 100).toFixed(2)}% con ${points.length} buckets por minuto`,
            data,
            durationMs: Date.now() - startedAt,
          };
        } catch (error) {
          return failure(
            "Falló la consulta de métricas a Azure Monitor",
            error instanceof Error ? error.message : String(error),
            startedAt,
          );
        }
      }

      const dataset = buildOfflineDataset(ctx);
      const points = dataset.metrics.slice(-top);
      const data: MetricQueryData = {
        mode: "offline",
        query,
        availability: dataset.availability,
        errorRate: dataset.errorRate,
        points,
      };
      return {
        ok: true,
        summary: `[offline] Disponibilidad ${(dataset.availability * 100).toFixed(2)}% con ${points.length} buckets por minuto`,
        data,
        durationMs: Date.now() - startedAt,
      };
    },
  };
}

/** Crea las cuatro herramientas KQL. */
export function createKqlTools(config: AppConfig): Tool[] {
  const client = createKqlClient(config);
  return [
    createQueryExceptionsTool(client),
    createQueryTracesTool(client),
    createQueryCustomEventsTool(client),
    createQueryMetricsTool(client),
  ];
}
