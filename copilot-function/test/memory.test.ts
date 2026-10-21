/**
 * Contrato §5 · la memoria de incidentes (RAG) con fallback local.
 *
 * Todo el test es offline: sin Azure AI Search, sin red, sin credenciales.
 */

import { describe, expect, it } from "vitest";
import { IncidentMemory, buildTags, cosineSimilarity, embed, tokenize } from "../src/rag/memory";
import type { Verdict } from "../src/core/types";

function verdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    incidentId: "inc-1",
    service: "sre-copilot-api",
    environment: "dev",
    generatedAt: "2026-05-04T10:00:00.000Z",
    summary: "El checkout falla al conectar con la base de datos",
    rootCause: "La cadena de conexión apunta a un host inexistente",
    confidence: "high",
    suspectCommits: [
      {
        sha: "abc1234def5678",
        message: "chore(config): update database connection settings",
        author: "marta.gil",
        url: "https://github.com/acme/repo/commit/abc1234def5678",
        date: "2026-05-04T09:50:00.000Z",
        why: "despliegue justo antes de los errores",
        confidence: "high",
      },
    ],
    timeline: [],
    evidence: [
      {
        id: "EV-001",
        kind: "exception",
        title: "SqlException",
        detail: "Connection refused",
        source: "exceptions",
      },
    ],
    recommendations: [],
    uncertainties: [],
    relatedIncidents: [],
    toolCalls: [],
    ...overrides,
  };
}

describe("memoria de incidentes (CONTRACTS.md §5)", () => {
  it("funciona sin Azure AI Search (fallback local)", async () => {
    const memory = new IncidentMemory({ enabled: true, topK: 5 });
    expect(memory.available).toBe(true);
    expect(memory.usesAzureSearch).toBe(false);

    await memory.record(verdict());
    const related = await memory.search("checkout falla al conectar con la base de datos", {
      service: "sre-copilot-api",
    });

    expect(related.length).toBeGreaterThan(0);
    expect(related[0]?.id).toBe("inc-1");
    expect(related[0]?.similarity).toBeGreaterThan(0);
    expect(related[0]?.similarity).toBeLessThanOrEqual(1);
  });

  it("lista los incidentes y filtra por servicio", async () => {
    const memory = new IncidentMemory({ enabled: true, topK: 5 });
    await memory.record(verdict());
    await memory.record(
      verdict({
        incidentId: "inc-2",
        service: "otro-servicio",
        generatedAt: "2026-05-04T11:00:00.000Z",
        summary: "Otro problema distinto",
      }),
    );

    expect(memory.list()).toHaveLength(2);
    expect(memory.list({ service: "otro-servicio" })).toHaveLength(1);
    expect(memory.list({ service: "sre-copilot-api" })[0]?.id).toBe("inc-1");
  });

  it("guarda y devuelve el veredicto completo", async () => {
    const memory = new IncidentMemory({ enabled: true, topK: 5 });
    await memory.record(verdict());

    const stored = memory.get("inc-1");
    expect(stored?.rootCause).toBe("La cadena de conexión apunta a un host inexistente");
    expect(memory.getSummary("inc-1")?.tags).toContain("sre-copilot-api");
  });

  it("registra el feedback del usuario", async () => {
    const memory = new IncidentMemory({ enabled: true, topK: 5 });
    await memory.record(verdict());

    expect(memory.setFeedback("inc-1", "partially", "falta el diff")).toBe(true);
    expect(memory.getSummary("inc-1")?.feedback).toBe("partially");
    expect(memory.getNote("inc-1")).toBe("falta el diff");
    expect(memory.setFeedback("inc-desconocido", "correct")).toBe(false);
  });

  it("con la memoria desactivada no guarda nada", async () => {
    const memory = new IncidentMemory({ enabled: false, topK: 5 });
    await memory.record(verdict());

    expect(memory.available).toBe(false);
    expect(memory.list()).toHaveLength(0);
    expect(await memory.search("checkout")).toEqual([]);
  });

  it("los embeddings deterministas y la similitud coseno son estables", () => {
    const left = embed("checkout database timeout");
    const right = embed("checkout database timeout");

    expect(left).toEqual(right);
    expect(cosineSimilarity(left, right)).toBeCloseTo(1, 6);
    expect(cosineSimilarity(embed("checkout"), embed("completado"))).toBeLessThan(0.5);
  });

  it("el tokenizador normaliza acentos y mayúsculas", () => {
    expect(tokenize("Conexión Refused")).toEqual(["conexion", "refused"]);
  });

  it("las etiquetas del incidente cubren servicio, entorno y confianza", () => {
    const tags = buildTags(verdict());

    expect(tags).toContain("sre-copilot-api");
    expect(tags).toContain("dev");
    expect(tags).toContain("confianza:high");
    expect(tags).toContain("commit:abc1234");
  });
});
