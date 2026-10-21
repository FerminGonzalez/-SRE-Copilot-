import { describe, expect, it } from "vitest";
import { createSseParser, parseStreamEvent } from "../api/sse";

describe("createSseParser", () => {
  it("parsea un evento `data: <json>` completo", () => {
    const parser = createSseParser();
    const events = parser.push(
      'data: {"type":"meta","incidentId":"INC-1","service":"checkout-api","startedAt":"2026-10-20T09:00:00.000Z"}\n\n',
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "meta", incidentId: "INC-1" });
  });

  it("reassembla un evento partido entre varios chunks", () => {
    const parser = createSseParser();
    const payload = 'data: {"type":"done","elapsedMs":8240}\n\n';

    expect(parser.push(payload.slice(0, 12))).toHaveLength(0);
    expect(parser.push(payload.slice(12, 25))).toHaveLength(0);
    const events = parser.push(payload.slice(25));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "done", elapsedMs: 8240 });
  });

  it("acepta finales de línea CRLF", () => {
    const parser = createSseParser();
    const events = parser.push('data: {"type":"done","elapsedMs":10}\r\n\r\n');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "done" });
  });

  it("ignora comentarios y heartbeats", () => {
    const parser = createSseParser();
    const events = parser.push(": keep-alive\n\n");

    expect(events).toHaveLength(0);
  });

  it("devuelve el último evento en flush si no lleva separador", () => {
    const parser = createSseParser();
    expect(parser.push('data: {"type":"done","elapsedMs":7}')).toHaveLength(0);
    expect(parser.flush()).toHaveLength(1);
  });

  it("descarta el JSON que no es un evento válido", () => {
    const parser = createSseParser();
    const events = parser.push('data: {"tipo":"inventado"}\n\n');

    expect(events).toHaveLength(0);
  });

  it("encadena varios eventos en un único chunk", () => {
    const parser = createSseParser();
    const events = parser.push(
      'data: {"type":"plan","steps":["a"],"hypothesis":"h"}\n\n' +
        'data: {"type":"done","elapsedMs":1}\n\n',
    );

    expect(events.map((event) => event.type)).toEqual(["plan", "done"]);
  });
});

describe("parseStreamEvent", () => {
  it("rechaza valores que no son objetos", () => {
    expect(parseStreamEvent(null)).toBeNull();
    expect(parseStreamEvent("texto")).toBeNull();
    expect(parseStreamEvent(42)).toBeNull();
  });

  it("rechaza un tipo de evento desconocido", () => {
    expect(parseStreamEvent({ type: "inventado" })).toBeNull();
  });

  it("exige los campos obligatorios de cada evento", () => {
    expect(parseStreamEvent({ type: "meta", incidentId: "INC-1" })).toBeNull();
    expect(parseStreamEvent({ type: "tool_result", tool: "x" })).toBeNull();
    expect(parseStreamEvent({ type: "plan", steps: "no-array", hypothesis: "h" })).toBeNull();
  });

  it("normaliza los campos opcionales", () => {
    const event = parseStreamEvent({
      type: "tool_call",
      tool: "query_exceptions",
    });

    expect(event).toEqual({ type: "tool_call", tool: "query_exceptions", args: {} });
  });
});
