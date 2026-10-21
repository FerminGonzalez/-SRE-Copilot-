/**
 * `POST /api/diagnose` — diagnóstico en vivo por SSE (CONTRACTS.md §2).
 *
 * El stream emite, en este orden: `meta`, `plan`, pares `tool_call`/`tool_result`,
 * `evidence`, `verdict` y `done` (CONTRACTS.md §2).
 */

import type { HttpRequest, InvocationContext } from "@azure/functions";
import { z } from "zod";
import type { Runtime } from "../runtime";
import { runDiagnosis } from "../core/engine";
import type { DiagnosisRequest, StreamEvent } from "../core/types";

/** Cuerpo válido de `POST /api/diagnose`. */
export const DiagnoseRequestSchema = z.object({
  service: z.string().min(1, "service es obligatorio").max(120),
  environment: z.string().min(1).max(60).optional(),
  windowMinutes: z.number().int().min(1).max(1440).optional(),
  symptom: z.string().min(1).max(1000).optional(),
  appVersion: z.string().min(1).max(120).optional(),
  incidentId: z.string().min(1).max(120).optional(),
});

/** Serializa un evento SSE: `data: <json>\n\n` (CONTRACTS.md §2). */
export function toSseFrame(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Cabeceras del stream SSE. */
export const SSE_HEADERS: Record<string, string> = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

/** Cabeceras JSON de la API. */
export const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
};

/**
 * Ejecuta el diagnóstico y devuelve la respuesta SSE.
 *
 * Se separa del handler de Azure Functions para poder testearlo sin runtime.
 */
export function streamDiagnosis(runtime: Runtime, request: DiagnosisRequest): Response {
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller): Promise<void> {
      const send = (event: StreamEvent): void => {
        controller.enqueue(encoder.encode(toSseFrame(event)));
      };
      try {
        const { verdict } = await runDiagnosis(runtime.engineDependencies(), request, send);
        await runtime.memory.record(verdict);
      } catch (error) {
        send({
          type: "error",
          message: "Fallo inesperado durante el diagnóstico",
          detail: error instanceof Error ? error.message : String(error),
        });
        send({ type: "done", elapsedMs: Date.now() - startedAt });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}

/** Handler HTTP de `POST /api/diagnose`. */
export function createDiagnoseHandler(runtime: Runtime) {
  return async function diagnoseHandler(
    request: HttpRequest,
    context: InvocationContext,
  ): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "El cuerpo debe ser JSON válido" }),
        { status: 400, headers: JSON_HEADERS },
      );
    }
    const parsed = DiagnoseRequestSchema.safeParse(body);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ");
      context.warn(`Diagnóstico rechazado: ${detail}`);
      return new Response(JSON.stringify({ error: detail }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }
    return streamDiagnosis(runtime, parsed.data);
  };
}
