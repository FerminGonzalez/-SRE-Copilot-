/**
 * Herramienta `dynatrace_problems` — problemas abiertos en Dynatrace (CONTRACTS.md §3).
 *
 * API real: `GET {DYNAATRACE_API_URL}/api/v2/problems?status=open&text={servicio}`
 * con cabecera `Authorization: Api-Token {DYNAATRACE_API_TOKEN}`.
 */

import { z } from "zod";
import type { AppConfig } from "../config";
import type { Tool, ToolContext, ToolResult } from "../core/types";
import type { DynatraceData, DynatraceProblem } from "./data";
import { buildOfflineDataset } from "./offline";
import { formatZodError, jsonSchemaFromZod } from "./schema";

/** Error de configuración de Dynatrace. */
export class DynatraceNotConfiguredError extends Error {
  public constructor() {
    super(
      "Dynatrace no está configurado: define DYNAATRACE_API_URL y DYNAATRACE_API_TOKEN.",
    );
    this.name = "DynatraceNotConfiguredError";
  }
}

/** Cliente de la API de problemas de Dynatrace. */
export interface DynatraceClient {
  readonly configured: boolean;
  listProblems(options: { service: string; status: string; limit: number }): Promise<DynatraceProblem[]>;
}

/** Cliente real contra la API v2 de Dynatrace. */
export class RealDynatraceClient implements DynatraceClient {
  public readonly configured = true;

  public constructor(
    private readonly apiUrl: string,
    private readonly apiToken: string,
    private readonly timeoutMs = 15_000,
  ) {}

  public async listProblems(options: {
    service: string;
    status: string;
    limit: number;
  }): Promise<DynatraceProblem[]> {
    const base = this.apiUrl.replace(/\/+$/, "");
    const params = new URLSearchParams({
      status: options.status,
      text: options.service,
      pageSize: String(Math.min(options.limit, 100)),
    });
    const response = await fetch(`${base}/api/v2/problems?${params.toString()}`, {
      headers: {
        Authorization: `Api-Token ${this.apiToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Dynatrace respondió ${response.status}: ${body.slice(0, 300)}`);
    }
    const payload = (await response.json()) as {
      problems?: Array<{
        id?: string;
        displayId?: string;
        title?: string;
        status?: string;
        severity?: string;
        impactLevel?: string;
        startTime?: string;
      }>;
    };
    return (payload.problems ?? []).map((problem) => ({
      id: problem.displayId ?? problem.id ?? "desconocido",
      title: problem.title ?? "Problema sin título",
      status: problem.status ?? options.status.toUpperCase(),
      severity: problem.severity ?? "UNCLASSIFIED",
      impact: problem.impactLevel ?? "UNKNOWN",
      startTime: problem.startTime ?? new Date(0).toISOString(),
    }));
  }
}

/** Cliente que falla siempre: se usa cuando no hay credenciales. */
export class UnconfiguredDynatraceClient implements DynatraceClient {
  public readonly configured = false;

  public async listProblems(): Promise<DynatraceProblem[]> {
    throw new DynatraceNotConfiguredError();
  }
}

/** Crea el cliente de Dynatrace a partir de la configuración. */
export function createDynatraceClient(config: AppConfig): DynatraceClient {
  const { apiUrl, apiToken } = config.dynatrace;
  if (apiUrl && apiToken) {
    return new RealDynatraceClient(apiUrl, apiToken);
  }
  return new UnconfiguredDynatraceClient();
}

/** Argumentos de `dynatrace_problems`. */
export const dynatraceProblemsArgsSchema = z.object({
  status: z.enum(["open", "resolved", "any"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

/**
 * `dynatrace_problems` — problemas abiertos en Dynatrace para el servicio.
 */
export function createDynatraceProblemsTool(client: DynatraceClient): Tool {
  return {
    name: "dynatrace_problems",
    description: "Problemas abiertos en Dynatrace para el servicio.",
    parameters: jsonSchemaFromZod(dynatraceProblemsArgsSchema),
    async run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      const startedAt = Date.now();
      const parsed = dynatraceProblemsArgsSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          summary: "Argumentos inválidos para dynatrace_problems",
          error: formatZodError(parsed.error),
          durationMs: Date.now() - startedAt,
        };
      }
      const status = parsed.data.status ?? "open";
      const limit = parsed.data.limit ?? 10;

      if (client.configured) {
        try {
          const problems = await client.listProblems({
            service: ctx.service,
            status,
            limit,
          });
          const data: DynatraceData = { mode: "live", problems };
          return {
            ok: true,
            summary: `${problems.length} problemas Dynatrace (${status}) para ${ctx.service}`,
            data,
            durationMs: Date.now() - startedAt,
          };
        } catch (error) {
          return {
            ok: false,
            summary: "Falló la consulta de problemas a Dynatrace",
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startedAt,
          };
        }
      }

      const dataset = buildOfflineDataset(ctx);
      const problems = status === "any" ? dataset.problems : dataset.problems.slice(0, limit);
      const data: DynatraceData = { mode: "offline", problems };
      return {
        ok: true,
        summary: `[offline] ${problems.length} problemas Dynatrace (${status}) para ${ctx.service}`,
        data,
        durationMs: Date.now() - startedAt,
      };
    },
  };
}

/** Crea la herramienta de Dynatrace. */
export function createDynatraceTools(config: AppConfig): Tool[] {
  return [createDynatraceProblemsTool(createDynatraceClient(config))];
}
