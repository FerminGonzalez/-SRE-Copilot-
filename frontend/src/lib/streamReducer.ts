/**
 * Reducer puro que convierte la secuencia de eventos SSE en el estado que
 * pinta la vista "Diagnóstico en vivo".
 *
 * Es una función pura (sin React, sin red, sin reloj propio: el reloj llega
 * como parámetro) para poder testearla aislada.
 */
import type { EvidenceItem, StreamEvent, Verdict } from "../types/contract";

export type LiveRunStatus = "idle" | "running" | "completed" | "error";

export type LiveToolCallStatus = "running" | "ok" | "error";

export type LiveLogKind =
  | "meta"
  | "plan"
  | "tool_call"
  | "tool_result"
  | "evidence"
  | "verdict"
  | "error"
  | "done";

export interface LiveToolCall {
  /** Identificador estable para React. */
  id: string;
  tool: string;
  args: Record<string, unknown>;
  status: LiveToolCallStatus;
  durationMs?: number;
  summary?: string;
  error?: string;
  /** Orden de llegada, para desempates. */
  sequence: number;
}

export interface LivePlan {
  steps: string[];
  hypothesis: string;
}

/** Línea de la consola del stream (registro append-only). */
export interface LiveLogEntry {
  id: string;
  at: string;
  kind: LiveLogKind;
  text: string;
}

export interface LiveRunState {
  status: LiveRunStatus;
  incidentId?: string;
  service?: string;
  startedAt?: string;
  plan?: LivePlan;
  toolCalls: LiveToolCall[];
  evidence: EvidenceItem[];
  log: LiveLogEntry[];
  verdict?: Verdict;
  error?: { message: string; detail?: string };
  elapsedMs?: number;
  /** Contador monótono de eventos, para claves y orden. */
  sequence: number;
}

export function initialLiveRunState(): LiveRunState {
  return {
    status: "idle",
    toolCalls: [],
    evidence: [],
    log: [],
    sequence: 0,
  };
}

/** Índice del último elemento que cumple la condición; -1 si no hay ninguno. */
function findLastIndex<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item !== undefined && predicate(item)) return index;
  }
  return -1;
}

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args ?? {});
  if (entries.length === 0) return "";
  return ` ${entries
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" ")}`;
}

function mergeToolResult(
  state: LiveRunState,
  event: Extract<StreamEvent, { type: "tool_result" }>,
  sequence: number,
): LiveRunState {
  const index = findLastIndex(
    state.toolCalls,
    (call) => call.tool === event.tool && call.status === "running",
  );

  if (index === -1) {
    // Resultado sin llamada previa (el copilot puede reanudar una sesión):
    // se registra igualmente para no perder trazabilidad.
    const call: LiveToolCall = {
      id: `call-${sequence}`,
      tool: event.tool,
      args: {},
      status: event.ok ? "ok" : "error",
      durationMs: event.durationMs,
      summary: event.summary,
      error: event.ok ? undefined : event.summary || "La herramienta ha fallado.",
      sequence,
    };
    return { ...state, toolCalls: [...state.toolCalls, call] };
  }

  const toolCalls = state.toolCalls.slice();
  const existing = toolCalls[index];
  if (!existing) return state;

  toolCalls[index] = {
    ...existing,
    status: event.ok ? "ok" : "error",
    durationMs: event.durationMs,
    summary: event.summary,
    error: event.ok ? undefined : event.summary || "La herramienta ha fallado.",
  };

  return { ...state, toolCalls };
}

/**
 * Aplica un evento del stream al estado. Nunca muta el estado recibido.
 *
 * @param now Marca temporal (ISO 8601) para la consola. Se inyecta para que
 *            el reducer siga siendo determinista en los tests.
 */
export function reduceStreamEvent(
  state: LiveRunState,
  event: StreamEvent,
  now = "",
): LiveRunState {
  const sequence = state.sequence + 1;
  const base = { ...state, sequence };
  const log = (kind: LiveLogKind, text: string, at = now): LiveRunState => ({
    ...base,
    log: [...state.log, { id: `log-${sequence}-${kind}`, at, kind, text }],
  });

  switch (event.type) {
    case "meta":
      return {
        ...log("meta", `incidente ${event.incidentId} · servicio ${event.service}`, event.startedAt),
        status: "running",
        incidentId: event.incidentId,
        service: event.service,
        startedAt: event.startedAt,
      };

    case "plan":
      return {
        ...log("plan", `plan de ${event.steps.length} pasos · ${event.hypothesis}`),
        plan: { steps: [...event.steps], hypothesis: event.hypothesis },
      };

    case "tool_call": {
      const call: LiveToolCall = {
        id: `call-${sequence}`,
        tool: event.tool,
        args: event.args ?? {},
        status: "running",
        sequence,
      };
      return {
        ...log("tool_call", `→ ${event.tool}${formatArgs(event.args ?? {})}`),
        toolCalls: [...state.toolCalls, call],
      };
    }

    case "tool_result": {
      const merged = mergeToolResult(base, event, sequence);
      const status = event.ok ? "ok" : "error";
      return {
        ...merged,
        log: [
          ...state.log,
          {
            id: `log-${sequence}-tool_result`,
            at: now,
            kind: "tool_result",
            text: `← ${event.tool} ${status} ${event.durationMs} ms · ${event.summary}`,
          },
        ],
      };
    }

    case "evidence": {
      const alreadyKnown = state.evidence.some((item) => item.id === event.evidence.id);
      const next: LiveRunState = {
        ...log(
          "evidence",
          `evidencia ${event.evidence.id} (${event.evidence.kind}) ${event.evidence.title}`,
          event.evidence.observedAt ?? now,
        ),
        evidence: alreadyKnown
          ? state.evidence
          : [...state.evidence, event.evidence],
      };
      return next;
    }

    case "verdict":
      return {
        ...log(
          "verdict",
          `veredicto ${event.verdict.incidentId} · confianza ${event.verdict.confidence}`,
          event.verdict.generatedAt,
        ),
        verdict: event.verdict,
      };

    case "error":
      return {
        ...log("error", `error: ${event.message}`),
        status: "error",
        error: { message: event.message, detail: event.detail },
      };

    case "done":
      return {
        ...log("done", `flujo terminado en ${event.elapsedMs} ms`),
        status: "completed",
        elapsedMs: event.elapsedMs,
      };

    default:
      return state;
  }
}

/** Aplica una lista de eventos en orden. */
export function reduceStreamEvents(
  state: LiveRunState,
  events: readonly StreamEvent[],
  now = "",
): LiveRunState {
  return events.reduce((current, event) => reduceStreamEvent(current, event, now), state);
}

/** ¿Hay alguna herramienta en vuelo? */
export function hasRunningToolCall(state: LiveRunState): boolean {
  return state.toolCalls.some((call) => call.status === "running");
}
