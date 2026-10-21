/**
 * Lectura del stream SSE de `POST /api/diagnose`.
 *
 * El endpoint es un POST, así que `EventSource` no sirve: se usa `fetch` con
 * `Accept: text/event-stream` y se lee el `ReadableStream` del cuerpo con un
 * `TextDecoder` en modo streaming, para poder pintar la interfaz mientras los
 * eventos llegan.
 *
 * Formato del contrato (CONTRACTS.md §2): cada evento es `data: <json>\n\n`.
 */
import type { EvidenceItem, StreamEvent, Verdict } from "../types/contract";

/** Separador de eventos SSE según la especificación (fin de evento). */
const EVENT_SEPARATOR = "\n\n";

/**
 * Valida que un JSON desconocido tenga forma de `StreamEvent`.
 * Un stream corrupto no debe tumbar la vista en vivo.
 */
export function parseStreamEvent(value: unknown): StreamEvent | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const type = raw.type;
  if (typeof type !== "string") return null;

  switch (type) {
    case "meta":
      if (typeof raw.incidentId !== "string" || typeof raw.service !== "string") {
        return null;
      }
      return {
        type: "meta",
        incidentId: raw.incidentId,
        service: raw.service,
        startedAt: typeof raw.startedAt === "string" ? raw.startedAt : "",
      };
    case "plan":
      if (!Array.isArray(raw.steps) || typeof raw.hypothesis !== "string") {
        return null;
      }
      return {
        type: "plan",
        steps: raw.steps.filter((step): step is string => typeof step === "string"),
        hypothesis: raw.hypothesis,
      };
    case "tool_call":
      if (typeof raw.tool !== "string") return null;
      return {
        type: "tool_call",
        tool: raw.tool,
        args:
          typeof raw.args === "object" && raw.args !== null
            ? (raw.args as Record<string, unknown>)
            : {},
      };
    case "tool_result":
      if (typeof raw.tool !== "string" || typeof raw.ok !== "boolean") {
        return null;
      }
      return {
        type: "tool_result",
        tool: raw.tool,
        ok: raw.ok,
        durationMs: typeof raw.durationMs === "number" ? raw.durationMs : 0,
        summary: typeof raw.summary === "string" ? raw.summary : "",
        data: raw.data,
      };
    case "evidence":
      if (typeof raw.evidence !== "object" || raw.evidence === null) return null;
      return { type: "evidence", evidence: raw.evidence as EvidenceItem };
    case "verdict":
      if (typeof raw.verdict !== "object" || raw.verdict === null) return null;
      return { type: "verdict", verdict: raw.verdict as Verdict };
    case "error":
      if (typeof raw.message !== "string") return null;
      return {
        type: "error",
        message: raw.message,
        detail: typeof raw.detail === "string" ? raw.detail : undefined,
      };
    case "done":
      return {
        type: "done",
        elapsedMs: typeof raw.elapsedMs === "number" ? raw.elapsedMs : 0,
      };
    default:
      return null;
  }
}

/** Parser incremental: tolera que un evento llegue partido entre varios chunks. */
export interface SseParser {
  /** Alimenta un fragmento de texto y devuelve los eventos completos. */
  push(chunk: string): StreamEvent[];
  /** Cierra el parser y devuelve el evento final si quedó sin separador. */
  flush(): StreamEvent[];
}

function parseBlock(block: string): StreamEvent | null {
  const dataLines: string[] = [];
  let eventName: string | undefined;

  for (const rawLine of block.split("\n")) {
    if (rawLine.length === 0 || rawLine.startsWith(":")) continue; // comentario / heartbeat
    const separatorIndex = rawLine.indexOf(":");
    const field = separatorIndex === -1 ? rawLine : rawLine.slice(0, separatorIndex);
    const value =
      separatorIndex === -1 ? "" : rawLine.slice(separatorIndex + 1).replace(/^ /, "");
    if (field === "data") dataLines.push(value);
    else if (field === "event") eventName = value;
  }

  if (dataLines.length === 0) return null;
  const payload = dataLines.join("\n");
  if (payload.trim().length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  const event = parseStreamEvent(parsed);
  if (event) return event;

  // Respaldo: si el JSON no trae `type` pero el bloque declara `event:`, se usa.
  if (eventName && typeof parsed === "object" && parsed !== null) {
    return parseStreamEvent({ ...(parsed as Record<string, unknown>), type: eventName });
  }
  return null;
}

export function createSseParser(): SseParser {
  let buffer = "";

  return {
    push(chunk: string): StreamEvent[] {
      buffer += chunk;
      // Normaliza los finales de línea (CRLF y CR sueltos) a LF.
      buffer = buffer.replace(/\r\n|\r/g, "\n");

      const events: StreamEvent[] = [];
      let separatorIndex = buffer.indexOf(EVENT_SEPARATOR);
      while (separatorIndex !== -1) {
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + EVENT_SEPARATOR.length);
        const event = parseBlock(block);
        if (event) events.push(event);
        separatorIndex = buffer.indexOf(EVENT_SEPARATOR);
      }
      return events;
    },

    flush(): StreamEvent[] {
      const rest = buffer.trim();
      buffer = "";
      if (rest.length === 0) return [];
      const event = parseBlock(rest);
      return event ? [event] : [];
    },
  };
}

/**
 * Lee el cuerpo de la respuesta como stream SSE y entrega cada evento en el
 * momento en que llega.
 */
export async function readEventStream(
  response: Response,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const body = response.body;
  if (!body) {
    throw new Error(
      "El navegador no ha expuesto el cuerpo de la respuesta; no se puede leer el stream SSE.",
    );
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const event of parser.push(chunk)) onEvent(event);
    }
    const tail = decoder.decode();
    for (const event of parser.push(tail)) onEvent(event);
    for (const event of parser.flush()) onEvent(event);
  } finally {
    reader.releaseLock();
  }
}
