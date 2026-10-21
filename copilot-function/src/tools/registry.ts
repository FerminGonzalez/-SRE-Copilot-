/**
 * Registro de herramientas.
 *
 * El registro es lo que el LLM ve: cada herramienta expone su nombre,
 * descripción y JSON Schema. El motor traduce las llamadas del modelo en
 * eventos SSE `tool_call` / `tool_result` (CONTRACTS.md §2 y §3).
 *
 * Los nueve nombres de `CONTRACTS.md` §3 son obligatorios y no se renombran.
 */

import type { AppConfig } from "../config";
import type { Tool, ToolContext, ToolResult } from "../core/types";
import { createDynatraceTools } from "./dynatrace";
import { createGitHubTools } from "./github";
import { createKqlTools } from "./kql";
import { createSearchLogsTools } from "./logs";

/** Definición de herramienta tal y como la ve el LLM. */
export interface LlmToolView {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Registro de herramientas del copilot. */
export interface ToolRegistry {
  /** Todas las herramientas, en orden estable. */
  list(): Tool[];
  /** Busca una herramienta por nombre. */
  get(name: string): Tool | undefined;
  /** Vista para el LLM (nombre + descripción + JSON Schema). */
  toLlmTools(): LlmToolView[];
  /** Ejecuta una herramienta validando sus argumentos. */
  run(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

/** Nombres obligatorios de las herramientas (CONTRACTS.md §3). */
export const REQUIRED_TOOL_NAMES = [
  "query_exceptions",
  "query_traces",
  "query_custom_events",
  "query_metrics",
  "list_recent_commits",
  "get_commit_diff",
  "blame_deploy_window",
  "search_logs",
  "dynatrace_problems",
] as const;

/** Nombre de una herramienta obligatoria. */
export type RequiredToolName = (typeof REQUIRED_TOOL_NAMES)[number];

/** Crea el registro con las nueve herramientas del contrato. */
export function createToolRegistry(config: AppConfig): ToolRegistry {
  const tools: Tool[] = [
    ...createKqlTools(config),
    ...createGitHubTools(config),
    ...createSearchLogsTools(config),
    ...createDynatraceTools(config),
  ];

  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  const missing = REQUIRED_TOOL_NAMES.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(`Faltan herramientas obligatorias del contrato: ${missing.join(", ")}`);
  }

  return {
    list: () => [...tools],
    get: (name: string) => byName.get(name),
    toLlmTools: () =>
      tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    async run(
      name: string,
      args: Record<string, unknown>,
      ctx: ToolContext,
    ): Promise<ToolResult> {
      const tool = byName.get(name);
      if (!tool) {
        return {
          ok: false,
          summary: `Herramienta desconocida: ${name}`,
          error: `La herramienta "${name}" no existe en el registro`,
          durationMs: 0,
        };
      }
      try {
        return await tool.run(args, ctx);
      } catch (error) {
        return {
          ok: false,
          summary: `La herramienta ${name} lanzó una excepción`,
          error: error instanceof Error ? error.message : String(error),
          durationMs: 0,
        };
      }
    },
  };
}
