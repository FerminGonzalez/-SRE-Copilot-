/**
 * Puente entre zod (validación de argumentos) y JSON Schema (lo que ve el LLM
 * y lo que publica el servidor MCP).
 *
 * El JSON Schema se genera desde el esquema zod para que no haya dos
 * definiciones que se puedan desincronizar.
 */

import { z } from "zod";

/** Genera el JSON Schema de un esquema zod. */
export function jsonSchemaFromZod(schema: z.ZodType): Record<string, unknown> {
  try {
    const generated = z.toJSONSchema(schema, {
      target: "draft-7",
      io: "input",
      unrepresentable: "any",
    }) as Record<string, unknown>;
    return { ...generated, additionalProperties: false };
  } catch {
    // Fallback mínima y válida: nunca dejamos al LLM sin un schema usable.
    return { type: "object", properties: {}, additionalProperties: false };
  }
}

/** Convierte un error de zod en un mensaje legible para el LLM. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}
