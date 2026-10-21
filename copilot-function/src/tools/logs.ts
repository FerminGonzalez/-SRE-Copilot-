/**
 * Herramienta `search_logs` — búsqueda de texto libre en trazas/logs (CONTRACTS.md §3).
 *
 * Consulta la tabla `traces` de Application Insights dentro de la ventana del
 * incidente. Reutiliza el cliente KQL de `src/tools/kql.ts`.
 */

import { z } from "zod";
import type { AppConfig } from "../config";
import type { Tool, ToolContext, ToolResult } from "../core/types";
import type { LogMatch, LogSearchData } from "./data";
import { buildOfflineDataset } from "./offline";
import { formatZodError, jsonSchemaFromZod } from "./schema";
import {
  asNumber,
  asString,
  buildSearchLogsQuery,
  createKqlClient,
  firstTable,
  rowsToObjects,
  toIso,
} from "./kql";
import type { KqlClient } from "./kql";

/** Argumentos de `search_logs`. */
export const searchLogsArgsSchema = z.object({
  query: z.string().min(2).max(500),
  windowMinutes: z.number().int().min(1).max(1440).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  roleName: z.string().min(1).max(200).optional(),
});

/**
 * `search_logs` — búsqueda de texto libre en trazas/logs de la ventana.
 */
export function createSearchLogsTool(client: KqlClient): Tool {
  return {
    name: "search_logs",
    description: "Búsqueda de texto libre en trazas/logs de la ventana.",
    parameters: jsonSchemaFromZod(searchLogsArgsSchema),
    async run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      const startedAt = Date.now();
      const parsed = searchLogsArgsSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          summary: "Argumentos inválidos para search_logs",
          error: formatZodError(parsed.error),
          durationMs: Date.now() - startedAt,
        };
      }
      const windowMinutes = parsed.data.windowMinutes ?? ctx.windowMinutes;
      const limit = parsed.data.limit ?? 25;
      const needle = parsed.data.query.replace(/"/g, '""');
      const query = buildSearchLogsQuery(needle, windowMinutes, parsed.data.roleName);

      if (client.configured) {
        try {
          const response = await client.query(query);
          const matches: LogMatch[] = rowsToObjects(firstTable(response))
            .slice(0, limit)
            .map((row) => ({
              timestamp: toIso(row["timestamp"], ctx.now.toISOString()),
              severityLevel: asNumber(row["severityLevel"], 3),
              message: asString(row["message"]),
              operationName: asString(row["operation_Name"]),
            }));
          const data: LogSearchData = { mode: "live", query, matches };
          return {
            ok: true,
            summary: `${matches.length} líneas de log contienen "${parsed.data.query}"`,
            data,
            durationMs: Date.now() - startedAt,
          };
        } catch (error) {
          return {
            ok: false,
            summary: "Falló la búsqueda de logs en Azure Monitor",
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startedAt,
          };
        }
      }

      const dataset = buildOfflineDataset(ctx);
      const lowered = parsed.data.query.toLowerCase();
      const matches = dataset.logs
        .filter((line) => line.message.toLowerCase().includes(lowered))
        .slice(0, limit);
      const data: LogSearchData = { mode: "offline", query, matches };
      return {
        ok: true,
        summary: `[offline] ${matches.length} líneas de log contienen "${parsed.data.query}"`,
        data,
        durationMs: Date.now() - startedAt,
      };
    },
  };
}

/** Crea la herramienta de búsqueda de logs. */
export function createSearchLogsTools(config: AppConfig): Tool[] {
  return [createSearchLogsTool(createKqlClient(config))];
}
