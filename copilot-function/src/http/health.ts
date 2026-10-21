/**
 * Health y catálogo de herramientas (CONTRACTS.md §2).
 *
 * - `GET /api/health` · `{ ok, version, llm, tools, ragAvailable }`
 * - `GET /api/tools`  · `{ tools: [{ name, description, parameters }] }`
 */

import type { HttpRequest, InvocationContext } from "@azure/functions";
import type { Runtime } from "../runtime";
import { JSON_HEADERS } from "./diagnose";

/** Versión del componente (se inyecta por variable de entorno en CI). */
export function readVersion(): string {
  return process.env["COPILOT_VERSION"] ?? "1.0.0";
}

/** Handler de `GET /api/health`. */
export function createHealthHandler(runtime: Runtime) {
  return async function healthHandler(
    _request: HttpRequest,
    _context: InvocationContext,
  ): Promise<Response> {
    const body = {
      ok: true,
      version: readVersion(),
      llm: runtime.provider.name,
      tools: runtime.registry.list().map((tool) => tool.name),
      ragAvailable: runtime.memory.available,
    };
    return new Response(JSON.stringify(body), { status: 200, headers: JSON_HEADERS });
  };
}

/** Handler de `GET /api/tools`. */
export function createToolsHandler(runtime: Runtime) {
  return async function toolsHandler(
    _request: HttpRequest,
    _context: InvocationContext,
  ): Promise<Response> {
    const body = {
      tools: runtime.registry.toLlmTools().map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    };
    return new Response(JSON.stringify(body), { status: 200, headers: JSON_HEADERS });
  };
}
