/**
 * Contrato §2 · el stream SSE de `POST /api/diagnose`.
 */

import { describe, expect, it } from "vitest";
import { runDiagnosis } from "../src/core/engine";
import { toSseFrame } from "../src/http/diagnose";
import type { StreamEvent } from "../src/core/types";
import { testContext, testProvider, testRegistry } from "./helpers";

/** Tipos de evento que permite el contrato §2. */
const ALLOWED_EVENT_TYPES = [
  "meta",
  "plan",
  "tool_call",
  "tool_result",
  "evidence",
  "verdict",
  "error",
  "done",
] as const;

/**
 * Exhaustividad a nivel de tipos: si `StreamEvent` gana un tipo nuevo, este
 * objeto deja de compilar (falta una clave).
 */
const EVENT_TYPE_COVERAGE: Record<StreamEvent["type"], true> = {
  meta: true,
  plan: true,
  tool_call: true,
  tool_result: true,
  evidence: true,
  verdict: true,
  error: true,
  done: true,
};

async function diagnose(): Promise<StreamEvent[]> {
  const registry = testRegistry();
  const provider = testProvider();
  const ctx = testContext();
  const { events } = await runDiagnosis(
    { provider, registry, now: () => ctx.now, limits: { maxIterations: 8, maxToolCalls: 20 } },
    { service: ctx.service, environment: ctx.environment, windowMinutes: ctx.windowMinutes },
  );
  return events;
}

describe("eventos SSE (CONTRACTS.md §2)", () => {
  it("el contrato define exactamente los ocho tipos de evento", () => {
    expect(Object.keys(EVENT_TYPE_COVERAGE).sort()).toEqual([...ALLOWED_EVENT_TYPES].sort());
  });

  it("todos los eventos emitidos usan un tipo del contrato", async () => {
    const events = await diagnose();

    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(ALLOWED_EVENT_TYPES).toContain(event.type);
    }
  });

  it("el stream empieza por `meta` y termina con `verdict` y `done`", async () => {
    const events = await diagnose();
    const types = events.map((event) => event.type);

    expect(types[0]).toBe("meta");
    expect(types[1]).toBe("plan");
    expect(types[types.length - 1]).toBe("done");
    expect(types[types.length - 2]).toBe("verdict");
  });

  it("cada `tool_call` va seguido de su `tool_result`", async () => {
    const events = await diagnose();

    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      if (event?.type !== "tool_call") {
        continue;
      }
      const next = events[index + 1];
      expect(next?.type).toBe("tool_result");
      if (next?.type === "tool_result") {
        expect(next.tool).toBe(event.tool);
        expect(next.durationMs).toBeGreaterThanOrEqual(0);
        expect(next.summary.length).toBeGreaterThan(0);
      }
    }
  });

  it("el evento `meta` lleva los datos del contrato", async () => {
    const events = await diagnose();
    const meta = events.find((event) => event.type === "meta");

    expect(meta).toBeDefined();
    if (meta?.type === "meta") {
      expect(meta.incidentId).toMatch(/^inc-/);
      expect(meta.service).toBe("sre-copilot-api");
      expect(Number.isNaN(Date.parse(meta.startedAt))).toBe(false);
    }
  });

  it("el evento `plan` lleva los pasos y la hipótesis", async () => {
    const events = await diagnose();
    const plan = events.find((event) => event.type === "plan");

    expect(plan).toBeDefined();
    if (plan?.type === "plan") {
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.hypothesis.length).toBeGreaterThan(0);
    }
  });

  it("la evidencia acumulada usa ids estables y correlativos", async () => {
    const events = await diagnose();
    const evidence = events.filter((event) => event.type === "evidence");

    expect(evidence.length).toBeGreaterThan(0);
    evidence.forEach((event, index) => {
      if (event.type === "evidence") {
        expect(event.evidence.id).toBe(`EV-${String(index + 1).padStart(3, "0")}`);
      }
    });
  });

  it("cada evento se serializa como `data: <json>\\n\\n`", async () => {
    const events = await diagnose();
    const frame = toSseFrame(events[0] as StreamEvent);

    expect(frame.startsWith("data: ")).toBe(true);
    expect(frame.endsWith("\n\n")).toBe(true);
    const json = frame.slice("data: ".length, -2);
    expect(() => JSON.parse(json) as unknown).not.toThrow();
  });
});
