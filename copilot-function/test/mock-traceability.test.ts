/**
 * Propiedad central del proyecto (CONTRACTS.md §1 y §4):
 *
 * **El proveedor de LLM `mock` nunca inventa un commit, un hash ni una marca
 * de tiempo que no proceda de un resultado de herramienta.**
 *
 * Es la propiedad de correlación más importante del SRE Copilot: un veredicto
 * que cita un commit inexistente lleva al equipo a revisar el cambio
 * equivocado. Estos tests la demuestran de tres maneras complementarias:
 *
 * 1. extremo a extremo (motor + herramientas offline + veredicto),
 * 2. el proveedor `mock` en aislamiento, con conversaciones manipuladas,
 * 3. el ensamblador del veredicto, que descarta lo que no está respaldado.
 */

import { describe, expect, it } from "vitest";
import { runDiagnosis } from "../src/core/engine";
import { collectObservations } from "../src/llm/mock";
import { buildRequestMessage, serializeToolResults } from "../src/llm/provider";
import { buildVerdict } from "../src/core/verdict";
import { createFactSet, extractFacts, mergeFacts } from "../src/core/evidence";
import { buildPlan } from "../src/core/planner";
import type { StreamEvent, ToolCallRecord, Verdict } from "../src/core/types";
import {
  collectShas,
  collectTimestamps,
  findShaLikeStrings,
  testContext,
  testProvider,
  testRegistry,
} from "./helpers";

/** Extrae los `sha` (completos) observados en los resultados de herramientas. */
function observedShas(events: readonly StreamEvent[]): Set<string> {
  const shas = new Set<string>();
  for (const event of events) {
    if (event.type === "tool_result" && event.data !== undefined) {
      collectShas(event.data, shas);
    }
  }
  return shas;
}

/** Extrae las marcas de tiempo observadas en los resultados de herramientas. */
function observedTimestamps(events: readonly StreamEvent[]): Set<string> {
  const timestamps = new Set<string>();
  for (const event of events) {
    if (event.type === "tool_result" && event.data !== undefined) {
      collectTimestamps(event.data, timestamps);
    }
  }
  return timestamps;
}

describe("trazabilidad del proveedor mock", () => {
  it("el diagnóstico completo sólo cita shas y marcas de tiempo observados", async () => {
    const registry = testRegistry();
    const provider = testProvider();
    const ctx = testContext();

    const { verdict, events } = await runDiagnosis(
      {
        provider,
        registry,
        now: () => ctx.now,
        limits: { maxIterations: 8, maxToolCalls: 20 },
      },
      { service: ctx.service, environment: ctx.environment, windowMinutes: ctx.windowMinutes },
    );

    const shas = observedShas(events);
    const timestamps = observedTimestamps(events);

    expect(shas.size).toBeGreaterThan(0);
    expect(timestamps.size).toBeGreaterThan(0);

    // 1. Los commits sospechosos existen en los resultados de las herramientas.
    for (const commit of verdict.suspectCommits) {
      expect(
        shas.has(commit.sha),
        `el commit ${commit.sha} no viene de ninguna herramienta`,
      ).toBe(true);
      expect(commit.sha).toMatch(/^[0-9a-f]{7,40}$/);
    }

    // 2. Cada marca de tiempo de la línea de tiempo viene de una herramienta.
    for (const event of verdict.timeline) {
      expect(
        timestamps.has(event.at),
        `la marca ${event.at} no viene de ninguna herramienta`,
      ).toBe(true);
    }

    // 3. Ningún texto libre del veredicto contiene un sha que no se haya visto.
    const observed = [...shas];
    const suspicious = [
      verdict.summary,
      verdict.rootCause,
      ...verdict.recommendations,
      ...verdict.uncertainties,
      ...verdict.suspectCommits.map((commit) => `${commit.message} ${commit.why}`),
      ...verdict.timeline.map((event) => `${event.event} ${event.detail ?? ""}`),
    ].join(" \n ");

    for (const found of findShaLikeStrings(suspicious)) {
      const sha = found.split(":").pop() ?? "";
      const known = observed.some((candidate) => candidate.startsWith(sha));
      expect(known, `el veredicto cita el sha desconocido ${sha}`).toBe(true);
    }
  });

  it("el veredicto cumple el esquema de CONTRACTS.md §1 campo a campo", async () => {
    const registry = testRegistry();
    const provider = testProvider();
    const ctx = testContext();

    const { verdict } = await runDiagnosis(
      { provider, registry, now: () => ctx.now, limits: { maxIterations: 8, maxToolCalls: 20 } },
      { service: ctx.service, environment: ctx.environment, windowMinutes: ctx.windowMinutes },
    );

    // §1 · Verdict: exactamente estos campos, sin más y sin menos.
    expect(Object.keys(verdict).sort()).toEqual(
      [
        "confidence",
        "environment",
        "evidence",
        "generatedAt",
        "incidentId",
        "recommendations",
        "relatedIncidents",
        "rootCause",
        "service",
        "summary",
        "suspectCommits",
        "timeline",
        "toolCalls",
        "uncertainties",
      ].sort(),
    );

    expect(verdict.incidentId).toMatch(/^inc-/);
    expect(verdict.service).toBe(ctx.service);
    expect(verdict.environment).toBe(ctx.environment);
    expect(Number.isNaN(Date.parse(verdict.generatedAt))).toBe(false);
    expect(verdict.summary.length).toBeGreaterThan(0);
    expect(verdict.rootCause.length).toBeGreaterThan(0);
    expect(["high", "medium", "low"]).toContain(verdict.confidence);
    expect(verdict.uncertainties.length).toBeGreaterThan(0);

    // §1 · SuspectCommit
    for (const commit of verdict.suspectCommits) {
      expect(Object.keys(commit).sort()).toEqual(
        ["author", "confidence", "date", "message", "sha", "url", "why"].sort(),
      );
      expect(commit.sha).toMatch(/^[0-9a-f]{7,40}$/);
      expect(["high", "medium", "low"]).toContain(commit.confidence);
      expect(Number.isNaN(Date.parse(commit.date))).toBe(false);
    }

    // §1 · TimelineEvent
    for (const event of verdict.timeline) {
      expect(
        ["kql", "github", "deploy", "dynatrace", "logs", "llm", "system"],
      ).toContain(event.source);
      expect(["info", "warning", "error", "critical"]).toContain(event.severity);
      expect(Number.isNaN(Date.parse(event.at))).toBe(false);
    }

    // §1 · EvidenceItem
    for (const item of verdict.evidence) {
      expect(item.id).toMatch(/^EV-\d{3}$/);
      expect(
        [
          "exception",
          "trace",
          "metric",
          "commit",
          "diff",
          "deploy",
          "log",
          "correlation",
        ],
      ).toContain(item.kind);
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.detail.length).toBeGreaterThan(0);
      expect(item.source.length).toBeGreaterThan(0);
    }

    // §1 · ToolCallRecord (`error` es opcional: sólo aparece si la falló)
    for (const record of verdict.toolCalls) {
      expect(Object.keys(record).sort()).toEqual(
        record.ok
          ? ["args", "durationMs", "ok", "tool"].sort()
          : ["args", "durationMs", "error", "ok", "tool"].sort(),
      );
      expect(record.ok).toBeTypeOf("boolean");
      expect(record.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("el mock sólo cita el commit que ha visto en los resultados de herramientas", async () => {
    const provider = testProvider();
    const observedSha = "abc1234def5678";
    const observedAt = "2026-05-04T10:00:00.000Z";

    const response = await provider.complete({
      messages: [
        {
          role: "user",
          content: serializeToolResults([
            {
              name: "query_custom_events",
              ok: true,
              summary: "deploy",
              data: {
                mode: "offline",
                deploys: [{ commitSha: observedSha, deployedAt: observedAt }],
              },
            },
            {
              name: "list_recent_commits",
              ok: true,
              summary: "commits",
              data: {
                mode: "offline",
                commits: [
                  {
                    sha: observedSha,
                    message: "fix: reventar la database",
                    author: "marta.gil",
                    date: observedAt,
                    url: "https://github.com/acme/repo/commit/abc1234def5678",
                  },
                ],
              },
            },
            {
              name: "query_exceptions",
              ok: true,
              summary: "excepciones",
              data: {
                mode: "offline",
                rows: [
                  {
                    type: "System.Data.SqlClient.SqlException",
                    outerMessage: "Connection refused",
                    operationName: "Checkout",
                    count: 12,
                    firstSeen: observedAt,
                    lastSeen: observedAt,
                  },
                ],
              },
            },
          ]),
        },
      ],
      tools: [],
    });

    const analysis = JSON.parse(response.content) as {
      suspectCommits: Array<{ sha: string }>;
      timeline: Array<{ at: string }>;
    };

    expect(analysis.suspectCommits).toHaveLength(1);
    expect(analysis.suspectCommits[0]?.sha).toBe(observedSha);
    for (const event of analysis.timeline) {
      expect(event.at).toBe(observedAt);
    }

    // Ningún sha inventado en todo el texto devuelto.
    for (const found of findShaLikeStrings(response.content)) {
      const sha = found.split(":").pop() ?? "";
      expect(sha.startsWith(observedSha) || observedSha.startsWith(sha)).toBe(true);
    }
  });

  it("sin evidencia el mock no inventa commits ni marcas de tiempo", async () => {
    const provider = testProvider();

    const response = await provider.complete({
      messages: [{ role: "user", content: serializeToolResults([]) }],
      tools: [],
    });

    const analysis = JSON.parse(response.content) as {
      suspectCommits: unknown[];
      timeline: unknown[];
      uncertainties: string[];
      confidence: string;
    };

    expect(analysis.suspectCommits).toEqual([]);
    expect(analysis.timeline).toEqual([]);
    expect(analysis.confidence).toBe("low");
    expect(analysis.uncertainties.length).toBeGreaterThan(0);
  });

  it("el ensamblador descarta los commits que el modelo propone sin respaldo", () => {
    const observedSha = "1111111aaaaaaa";
    const observedAt = "2026-05-04T10:00:00.000Z";
    const facts = createFactSet();
    mergeFacts(
      facts,
      extractFacts("list_recent_commits", {
        mode: "offline",
        commits: [
          {
            sha: observedSha,
            message: "fix: algo",
            author: "marta.gil",
            date: observedAt,
            url: "https://github.com/acme/repo/commit/1111111aaaaaaa",
          },
        ],
      }),
    );

    const toolCalls: ToolCallRecord[] = [];
    const verdict: Verdict = buildVerdict({
      incidentId: "inc-test",
      service: "svc",
      environment: "dev",
      generatedAt: observedAt,
      since: observedAt,
      until: observedAt,
      analysis: {
        summary: "resumen",
        rootCause: "causa",
        confidence: "high",
        suspectCommits: [
          {
            sha: "deadbeefdeadbeef",
            message: "inventado",
            author: "nadie",
            url: "",
            date: observedAt,
            why: "lo he leído en un tweet",
            confidence: "high",
          },
        ],
        timeline: [
          {
            at: "1999-01-01T00:00:00.000Z",
            event: "evento inventado",
            source: "llm",
            severity: "info",
          },
        ],
        recommendations: [],
        uncertainties: [],
      },
      facts,
      evidence: [],
      toolCalls,
      relatedIncidents: [],
      plan: buildPlan({ service: "svc" }, testContext(), []),
      warnings: [],
    });

    // El commit inventado no llega al veredicto.
    expect(verdict.suspectCommits.some((commit) => commit.sha === "deadbeefdeadbeef")).toBe(
      false,
    );
    // Y queda constancia explícita del descarte.
    expect(verdict.uncertainties.join(" ")).toContain("deadbee");
    // La marca de tiempo inventada tampoco.
    expect(verdict.timeline.some((event) => event.at === "1999-01-01T00:00:00.000Z")).toBe(
      false,
    );
    // La confianza nunca por encima de lo que sostiene la evidencia.
    expect(verdict.confidence).not.toBe("high");
  });

  it("las observaciones del mock proceden literalmente de los resultados de herramientas", () => {
    const observations = collectObservations([
      {
        name: "list_recent_commits",
        ok: true,
        summary: "commits",
        data: {
          mode: "offline",
          commits: [
            {
              sha: "0123456789abcdef",
              message: "chore: algo",
              author: "ana",
              date: "2026-05-04T09:00:00.000Z",
              url: "https://github.com/acme/repo/commit/0123456789abcdef",
            },
          ],
        },
      },
      { name: "query_exceptions", ok: false, summary: "fallo", error: "boom" },
    ]);

    expect(observations.commits).toHaveLength(1);
    expect(observations.commits[0]?.sha).toBe("0123456789abcdef");
    expect(observations.failedTools).toEqual(["query_exceptions"]);
  });

  it("el mensaje de petición del motor lleva los datos de la petición", () => {
    const message = buildRequestMessage({
      service: "svc",
      environment: "dev",
      windowMinutes: 15,
      incidentId: "inc-1",
    });

    expect(message.role).toBe("user");
    expect(message.content).toContain("svc");
    expect(message.content).toContain("inc-1");
  });
});
