import { describe, expect, it } from "vitest";
import {
  hasRunningToolCall,
  initialLiveRunState,
  reduceStreamEvent,
  reduceStreamEvents,
} from "../lib/streamReducer";
import type { StreamEvent } from "../types/contract";
import { sampleVerdict } from "./fixtures";

describe("reduceStreamEvent", () => {
  it("parte de un estado inicial vacío", () => {
    const state = initialLiveRunState();
    expect(state.status).toBe("idle");
    expect(state.toolCalls).toEqual([]);
    expect(state.evidence).toEqual([]);
    expect(state.log).toEqual([]);
    expect(state.verdict).toBeUndefined();
  });

  it("registra el evento meta y pasa el estado a 'running'", () => {
    const state = reduceStreamEvent(initialLiveRunState(), {
      type: "meta",
      incidentId: "INC-1",
      service: "checkout-api",
      startedAt: "2026-10-20T09:00:00.000Z",
    });

    expect(state.status).toBe("running");
    expect(state.incidentId).toBe("INC-1");
    expect(state.service).toBe("checkout-api");
    expect(state.startedAt).toBe("2026-10-20T09:00:00.000Z");
  });

  it("guarda el plan de investigación con sus pasos", () => {
    const state = reduceStreamEvent(initialLiveRunState(), {
      type: "plan",
      steps: ["Consultar excepciones", "Cruzar con GitHub"],
      hypothesis: "El error empezó tras un despliegue.",
    });

    expect(state.plan?.steps).toHaveLength(2);
    expect(state.plan?.hypothesis).toBe("El error empezó tras un despliegue.");
  });

  it("añade una herramienta en vuelo y la marca como 'running'", () => {
    const state = reduceStreamEvent(initialLiveRunState(), {
      type: "tool_call",
      tool: "query_exceptions",
      args: { windowMinutes: 30 },
    });

    expect(state.toolCalls).toHaveLength(1);
    expect(state.toolCalls[0]?.tool).toBe("query_exceptions");
    expect(state.toolCalls[0]?.status).toBe("running");
    expect(state.toolCalls[0]?.args).toEqual({ windowMinutes: 30 });
    expect(hasRunningToolCall(state)).toBe(true);
  });

  it("fusiona el resultado con la llamada en vuelo y guarda su duración", () => {
    const started = reduceStreamEvent(initialLiveRunState(), {
      type: "tool_call",
      tool: "query_exceptions",
      args: {},
    });
    const finished = reduceStreamEvent(started, {
      type: "tool_result",
      tool: "query_exceptions",
      ok: true,
      durationMs: 412,
      summary: "41 excepciones",
    });

    expect(finished.toolCalls).toHaveLength(1);
    expect(finished.toolCalls[0]?.status).toBe("ok");
    expect(finished.toolCalls[0]?.durationMs).toBe(412);
    expect(finished.toolCalls[0]?.summary).toBe("41 excepciones");
    expect(hasRunningToolCall(finished)).toBe(false);
  });

  it("marca como error la herramienta que falla", () => {
    const started = reduceStreamEvent(initialLiveRunState(), {
      type: "tool_call",
      tool: "search_logs",
      args: {},
    });
    const finished = reduceStreamEvent(started, {
      type: "tool_result",
      tool: "search_logs",
      ok: false,
      durationMs: 95,
      summary: "Tiempo de espera agotado",
    });

    expect(finished.toolCalls[0]?.status).toBe("error");
    expect(finished.toolCalls[0]?.error).toBe("Tiempo de espera agotado");
  });

  it("acumula la evidencia y no duplica ids repetidos", () => {
    const evidence = {
      id: "EV-001",
      kind: "exception" as const,
      title: "Excepción",
      detail: "detalle",
      source: "exceptions",
    };

    const once = reduceStreamEvent(initialLiveRunState(), { type: "evidence", evidence });
    const twice = reduceStreamEvent(once, { type: "evidence", evidence });

    expect(once.evidence).toHaveLength(1);
    expect(twice.evidence).toHaveLength(1);
  });

  it("guarda el veredicto y lo deja disponible sin tocar el estado previo", () => {
    const before = initialLiveRunState();
    const after = reduceStreamEvent(before, { type: "verdict", verdict: sampleVerdict });

    expect(after.verdict).toEqual(sampleVerdict);
    expect(before.verdict).toBeUndefined();
    expect(before).not.toBe(after);
  });

  it("expone el error del stream y pasa el estado a 'error'", () => {
    const state = reduceStreamEvent(initialLiveRunState(), {
      type: "error",
      message: "KQL inválido",
      detail: "Unknown column 'foo'",
    });

    expect(state.status).toBe("error");
    expect(state.error?.message).toBe("KQL inválido");
    expect(state.error?.detail).toBe("Unknown column 'foo'");
  });

  it("cierra el flujo con 'done' y guarda el tiempo total", () => {
    const state = reduceStreamEvent(initialLiveRunState(), {
      type: "done",
      elapsedMs: 8240,
    });

    expect(state.status).toBe("completed");
    expect(state.elapsedMs).toBe(8240);
  });

  it("acumula las líneas de la consola en orden de llegada", () => {
    const events: StreamEvent[] = [
      { type: "meta", incidentId: "INC-1", service: "checkout-api", startedAt: "2026-10-20T09:00:00.000Z" },
      { type: "tool_call", tool: "query_exceptions", args: {} },
      { type: "tool_result", tool: "query_exceptions", ok: true, durationMs: 412, summary: "41 excepciones" },
    ];

    const state = reduceStreamEvents(initialLiveRunState(), events, "2026-10-20T09:00:01.000Z");

    expect(state.log.map((entry) => entry.kind)).toEqual(["meta", "tool_call", "tool_result"]);
    expect(state.log[1]?.text).toContain("query_exceptions");
    expect(state.log[2]?.text).toContain("412 ms");
  });

  it("no muta el estado recibido", () => {
    const before = reduceStreamEvent(initialLiveRunState(), {
      type: "tool_call",
      tool: "query_exceptions",
      args: {},
    });
    const snapshot = JSON.stringify(before);

    reduceStreamEvent(before, {
      type: "tool_result",
      tool: "query_exceptions",
      ok: true,
      durationMs: 10,
      summary: "ok",
    });

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
