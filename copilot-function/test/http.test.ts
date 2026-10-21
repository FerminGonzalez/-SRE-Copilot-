/**
 * Contrato §2 · la API HTTP de la Function App.
 *
 * Los handlers se prueban sin el runtime de Azure Functions: construyen un
 * `HttpRequest`/`InvocationContext` de mentira y devuelven un `Response` (API
 * estándar de Node 18+), que es exactamente lo que devuelve el runtime.
 */

import { describe, expect, it } from "vitest";
import { HttpRequest, InvocationContext } from "@azure/functions";
import { createDiagnoseHandler } from "../src/http/diagnose";
import { createHealthHandler, createToolsHandler } from "../src/http/health";
import {
  createFeedbackHandler,
  createGetIncidentHandler,
  createListIncidentsHandler,
} from "../src/http/incidents";
import { createRuntime } from "../src/runtime";
import { testConfig } from "./helpers";
import type { StreamEvent } from "../src/core/types";
import type { Verdict } from "../src/core/types";

function makeContext(): InvocationContext {
  return new InvocationContext({
    invocationId: "test-invocation",
    functionName: "test",
  });
}

function postRequest(url: string, body: unknown, params: Record<string, string> = {}): HttpRequest {
  return new HttpRequest({
    method: "POST",
    url,
    body: { string: JSON.stringify(body) },
    headers: { "content-type": "application/json" },
    params,
  });
}

function getRequest(
  url: string,
  query: Record<string, string> = {},
  params: Record<string, string> = {},
): HttpRequest {
  return new HttpRequest({ method: "GET", url, query, params });
}

/** Lee el cuerpo de un `Response` como texto. */
async function readText(response: Response): Promise<string> {
  return response.text();
}

describe("API HTTP del copilot (CONTRACTS.md §2)", () => {
  it("POST /api/diagnose responde con un stream SSE", async () => {
    const runtime = createRuntime(testConfig(), { telemetryDisabled: true });
    const handler = createDiagnoseHandler(runtime);

    const response = await handler(
      postRequest("http://localhost/api/diagnose", {
        service: "sre-copilot-api",
        environment: "dev",
        windowMinutes: 30,
      }),
      makeContext(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const text = await readText(response);
    const frames = text.split("\n\n").filter((frame) => frame.trim().length > 0);
    expect(frames.length).toBeGreaterThan(0);

    const events = frames.map((frame) => {
      const payload = frame.replace(/^data: /, "");
      return JSON.parse(payload) as StreamEvent;
    });
    expect(events[0]?.type).toBe("meta");
    expect(events[events.length - 1]?.type).toBe("done");
  });

  it("POST /api/diagnose rechaza un cuerpo inválido", async () => {
    const runtime = createRuntime(testConfig(), { telemetryDisabled: true });
    const handler = createDiagnoseHandler(runtime);

    const response = await handler(
      postRequest("http://localhost/api/diagnose", { environment: "dev" }),
      makeContext(),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("GET /api/health devuelve el contrato de §2", async () => {
    const runtime = createRuntime(testConfig(), { telemetryDisabled: true });
    const handler = createHealthHandler(runtime);

    const response = await handler(getRequest("http://localhost/api/health"), makeContext());
    const body = JSON.parse(await readText(response)) as {
      ok: boolean;
      version: string;
      llm: string;
      tools: string[];
      ragAvailable: boolean;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.version.length).toBeGreaterThan(0);
    expect(body.llm).toBe("mock");
    expect(body.tools).toHaveLength(9);
    expect(body.ragAvailable).toBe(true);
  });

  it("GET /api/tools publica las nueve herramientas con su JSON Schema", async () => {
    const runtime = createRuntime(testConfig(), { telemetryDisabled: true });
    const handler = createToolsHandler(runtime);

    const response = await handler(getRequest("http://localhost/api/tools"), makeContext());
    const body = JSON.parse(await readText(response)) as {
      tools: Array<{ name: string; description: string; parameters: object }>;
    };

    expect(response.status).toBe(200);
    expect(body.tools).toHaveLength(9);
    for (const tool of body.tools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.parameters).toBeTypeOf("object");
    }
  });

  it("GET /api/incidents lista los diagnósticos y POST del feedback los actualiza", async () => {
    const runtime = createRuntime(testConfig(), { telemetryDisabled: true });
    const diagnose = createDiagnoseHandler(runtime);
    const list = createListIncidentsHandler(runtime);
    const get = createGetIncidentHandler(runtime);
    const feedback = createFeedbackHandler(runtime);

    // Diagnóstico en vivo para tener un incidente en la memoria.
    // El stream SSE sólo se ejecuta cuando se consume el cuerpo: hay que
    // leerlo para que el veredicto llegue a la memoria.
    const diagnoseResponse = await diagnose(
      postRequest("http://localhost/api/diagnose", {
        service: "sre-copilot-api",
        environment: "dev",
        windowMinutes: 30,
      }),
      makeContext(),
    );
    await readText(diagnoseResponse);

    const listResponse = await list(getRequest("http://localhost/api/incidents"), makeContext());
    const listBody = JSON.parse(await readText(listResponse)) as {
      incidents: Array<{ id: string; service: string }>;
    };

    expect(listResponse.status).toBe(200);
    expect(listBody.incidents.length).toBeGreaterThan(0);
    const incidentId = listBody.incidents[0]?.id ?? "";

    const getResponse = await get(
      getRequest(`http://localhost/api/incidents/${incidentId}`, {}, { id: incidentId }),
      makeContext(),
    );
    const getBody = JSON.parse(await readText(getResponse)) as { incident: Verdict };
    expect(getResponse.status).toBe(200);
    expect(getBody.incident.incidentId).toBe(incidentId);

    const feedbackResponse = await feedback(
      postRequest(
        `http://localhost/api/incidents/${incidentId}/feedback`,
        { verdict: "correct" },
        { id: incidentId },
      ),
      makeContext(),
    );
    const feedbackBody = JSON.parse(await readText(feedbackResponse)) as {
      ok: boolean;
      incidentId: string;
    };
    expect(feedbackResponse.status).toBe(200);
    expect(feedbackBody).toEqual({ ok: true, incidentId });

    // El feedback aparece en el resumen del incidente.
    const listAfter = await list(getRequest("http://localhost/api/incidents"), makeContext());
    const after = JSON.parse(await readText(listAfter)) as {
      incidents: Array<{ id: string; feedback?: string }>;
    };
    expect(after.incidents.find((item) => item.id === incidentId)?.feedback).toBe("correct");
  });

  it("GET /api/incidents/:id responde 404 si el incidente no existe", async () => {
    const runtime = createRuntime(testConfig(), { telemetryDisabled: true });
    const get = createGetIncidentHandler(runtime);

    const response = await get(
      getRequest("http://localhost/api/incidents/inc-inexistente", {}, { id: "inc-inexistente" }),
      makeContext(),
    );

    expect(response.status).toBe(404);
  });
});
