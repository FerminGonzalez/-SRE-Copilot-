/**
 * API de incidentes (CONTRACTS.md §2).
 *
 * - `GET  /api/incidents`              · lista de diagnósticos
 * - `GET  /api/incidents/:id`          · veredicto completo
 * - `POST /api/incidents/:id/feedback` · feedback del usuario
 */

import type { HttpRequest, InvocationContext } from "@azure/functions";
import { z } from "zod";
import type { Runtime } from "../runtime";
import { JSON_HEADERS } from "./diagnose";

/** Cuerpo válido del endpoint de feedback. */
export const FeedbackBodySchema = z.object({
  verdict: z.enum(["correct", "partially", "incorrect"]),
  note: z.string().max(2000).optional(),
});

/** Handler de `GET /api/incidents`. */
export function createListIncidentsHandler(runtime: Runtime) {
  return async function listIncidentsHandler(
    request: HttpRequest,
    context: InvocationContext,
  ): Promise<Response> {
    const service = request.query.get("service") ?? undefined;
    const rawLimit = request.query.get("limit");
    const parsedLimit = rawLimit ? Number(rawLimit) : 50;
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 200) : 50;
    const incidents = runtime.memory.list({
      ...(service ? { service } : {}),
      limit,
    });
    context.info(`Listados ${incidents.length} incidentes${service ? ` de ${service}` : ""}`);
    return new Response(JSON.stringify({ incidents }), { status: 200, headers: JSON_HEADERS });
  };
}

/** Handler de `GET /api/incidents/:id`. */
export function createGetIncidentHandler(runtime: Runtime) {
  return async function getIncidentHandler(
    request: HttpRequest,
    context: InvocationContext,
  ): Promise<Response> {
    const id = request.params["id"] ?? "";
    const incident = runtime.memory.get(id);
    if (!incident) {
      context.warn(`Incidente no encontrado: ${id}`);
      return new Response(JSON.stringify({ error: `Incidente no encontrado: ${id}` }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }
    return new Response(JSON.stringify({ incident }), { status: 200, headers: JSON_HEADERS });
  };
}

/** Handler de `POST /api/incidents/:id/feedback`. */
export function createFeedbackHandler(runtime: Runtime) {
  return async function feedbackHandler(
    request: HttpRequest,
    context: InvocationContext,
  ): Promise<Response> {
    const id = request.params["id"] ?? "";
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "El cuerpo debe ser JSON válido" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }
    const parsed = FeedbackBodySchema.safeParse(body);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ");
      return new Response(JSON.stringify({ error: detail }), { status: 400, headers: JSON_HEADERS });
    }
    const stored = runtime.memory.setFeedback(id, parsed.data.verdict, parsed.data.note);
    if (!stored) {
      return new Response(JSON.stringify({ error: `Incidente no encontrado: ${id}` }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }
    context.info(`Feedback registrado para ${id}: ${parsed.data.verdict}`);
    return new Response(JSON.stringify({ ok: true, incidentId: id }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  };
}
