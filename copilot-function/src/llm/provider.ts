/**
 * Capa LLM — interfaz común (CONTRACTS.md §4).
 *
 * El motor de diagnóstico (`src/core/engine.ts`) sólo conoce esta interfaz,
 * por eso se puede cambiar `mock` por `azure-openai` o `anthropic` sin tocar
 * el bucle agentic.
 */

import { z } from "zod";

/** Llamada a herramienta solicitada por el modelo. */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** Mensaje de la conversación con el modelo. */
export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

/** Definición de herramienta que se inyecta en el prompt. */
export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: unknown;
}

/** Petición de completitud. */
export interface LlmRequest {
  messages: LlmMessage[];
  tools: Array<{ name: string; description: string; parameters: unknown }>;
  temperature?: number;
  maxTokens?: number;
}

/** Respuesta normalizada de un proveedor. */
export interface LlmResponse {
  content: string;
  toolCalls: ToolCall[];
  raw?: unknown;
}

/** Proveedor de lenguaje. */
export interface LlmProvider {
  name: string; // "azure-openai" | "anthropic" | "mock"
  complete(req: LlmRequest): Promise<LlmResponse>;
}

/* -------------------------------------------------------------------------- */
/* Validación (zod) de lo que devuelve el proveedor                            */
/* -------------------------------------------------------------------------- */

/** Forma de una llamada a herramienta tal y como la devuelve el proveedor. */
export const ToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  args: z.record(z.string(), z.unknown()).default({}),
});

/** Forma de la respuesta cruda de un proveedor. */
export const LlmResponseSchema = z.object({
  content: z.string().default(""),
  toolCalls: z.array(ToolCallSchema).default([]),
  raw: z.unknown().optional(),
});

/* -------------------------------------------------------------------------- */
/* Utilidades compartidas por los proveedores                                   */
/* -------------------------------------------------------------------------- */

/** Petición de diagnóstico que viaja al proveedor dentro del prompt. */
export interface DiagnosisPromptPayload {
  service: string;
  environment: string;
  windowMinutes: number;
  symptom?: string;
  appVersion?: string;
  incidentId: string;
}

/** Instrucciones de sistema del SRE Copilot. */
export const SYSTEM_PROMPT = [
  "Eres el motor de diagnóstico del SRE Copilot, un asistente de SRE que explica qué se rompió en un servicio.",
  "Reglas obligatorias:",
  "1. Usa las herramientas para obtener evidencia. Nunca inventes commits, hashes, marcas de tiempo, URLs ni cifras.",
  "2. Si una herramienta falla o no hay datos, dilo explícitamente en `uncertainties` y sigue con las demás.",
  "3. Cuando la evidencia sea suficiente, responde con un único objeto JSON con estas claves:",
  "   summary, rootCause, confidence, suspectCommits, timeline, recommendations, uncertainties.",
  "4. Cada commit de `suspectCommits` y cada marca de tiempo de `timeline` debe existir en los resultados de las herramientas.",
  "5. `uncertainties` nunca puede estar vacío: si el análisis es limitado o incompleto, dilo.",
  "6. `confidence` sólo puede ser \"high\", \"medium\" o \"low\".",
].join("\n");

/**
 * Convierte los resultados de herramientas en un mensaje `user` con JSON.
 *
 * El contrato §4 sólo admite `system | user | assistant`, así que los
 * resultados de herramientas viajan como un mensaje `user` con un payload
 * JSON estable. Cada proveedor lo traduce a su formato nativo.
 */
export interface SerializedToolResult {
  name: string;
  ok: boolean;
  summary: string;
  data?: unknown;
  error?: string;
}

/** Serializa los resultados de herramientas para el mensaje de la conversación. */
export function serializeToolResults(results: SerializedToolResult[]): string {
  return JSON.stringify({ toolResults: results });
}

/**
 * Crea el mensaje de usuario con la petición de diagnóstico.
 *
 * El texto es legible para cualquier proveedor y lleva la petición
 * normalizada en un bloque `<request>` que el proveedor `mock` sabe leer.
 */
export function buildRequestMessage(request: DiagnosisPromptPayload): LlmMessage {
  const lines = [
    `Diagnóstico solicitado para el servicio "${request.service}" (entorno "${request.environment}", ventana de ${request.windowMinutes} minutos).`,
  ];
  if (request.symptom) {
    lines.push(`Síntoma reportado: ${request.symptom}`);
  }
  if (request.appVersion) {
    lines.push(`Versión de la aplicación: ${request.appVersion}`);
  }
  lines.push(`Id del incidente: ${request.incidentId}`);
  lines.push("<request>");
  lines.push(JSON.stringify(request));
  lines.push("</request>");
  return { role: "user", content: lines.join("\n") };
}

/** Lee los resultados de herramientas de un mensaje `user` del proveedor mock. */
export function parseToolResults(content: string): SerializedToolResult[] {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === null) {
      return [];
    }
    const raw = (parsed as { toolResults?: unknown }).toolResults;
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.filter(
      (item): item is SerializedToolResult =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { name?: unknown }).name === "string",
    );
  } catch {
    return [];
  }
}
