import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { LiveView } from "../components/live/LiveView";
import { useLiveDiagnosis } from "../hooks/useLiveDiagnosis";
import { sampleVerdict } from "./fixtures";

/**
 * Construye una respuesta SSE real (ReadableStream) para comprobar que la
 * vista consume el stream de forma incremental, no como un JSON completo.
 */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function mockSse(chunks: string[]) {
  const fetchMock = vi.fn().mockResolvedValue(sseResponse(chunks));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/**
 * Monta la vista con el hook real, que es quien consume el stream.
 */
function renderLive(onVerdictReady = vi.fn()) {
  function Harness() {
    const [environment, setEnvironment] = useState("production");
    const live = useLiveDiagnosis({ onVerdict: onVerdictReady });
    return (
      <LiveView
        environment={environment}
        onEnvironmentChange={setEnvironment}
        state={live.state}
        onRun={(request) => {
          void live.run(request);
        }}
        onReset={live.reset}
      />
    );
  }
  return render(<Harness />);
}

describe("LiveView", () => {
  it("consume el stream SSE y muestra plan, herramientas, evidencia y veredicto", async () => {
    mockSse([
      'data: {"type":"meta","incidentId":"INC-2026-0150","service":"checkout-api","startedAt":"2026-10-20T09:00:00.000Z"}\n\n',
      'data: {"type":"plan","steps":["Consultar excepciones","Cruzar con GitHub"],"hypothesis":"El error empezó tras un despliegue."}\n\n',
      'data: {"type":"tool_call","tool":"query_exceptions","args":{"windowMinutes":30}}\n\n',
      'data: {"type":"tool_result","tool":"query_exceptions","ok":true,"durationMs":412,"summary":"41 excepciones"}\n\n',
      'data: {"type":"evidence","evidence":{"id":"EV-001","kind":"exception","title":"NullReferenceException en persistencia","detail":"41 excepciones en 6 minutos.","source":"exceptions | summarize count()"}}\n\n',
      `data: ${JSON.stringify({ type: "verdict", verdict: sampleVerdict })}\n\n`,
      'data: {"type":"done","elapsedMs":8240}\n\n',
    ]);

    const onVerdictReady = vi.fn();
    const user = userEvent.setup();
    renderLive(onVerdictReady);

    await user.type(screen.getByLabelText(/Servicio/i), "checkout-api");
    await user.click(screen.getByRole("button", { name: /Iniciar diagnóstico/i }));

    // Plan
    expect(
      await screen.findByText("El error empezó tras un despliegue."),
    ).toBeInTheDocument();

    // Herramienta completada con su duración
    await waitFor(() => {
      expect(screen.getByText("query_exceptions")).toBeInTheDocument();
    });
    expect(await screen.findByText("412 ms")).toBeInTheDocument();

    // Evidencia acumulada (dentro de su tarjeta, no en la consola)
    const evidenceCard = screen.getByRole("region", { name: /Evidencia acumulada/i });
    expect(
      await within(evidenceCard).findByText(/NullReferenceException en persistencia/),
    ).toBeInTheDocument();

    // Veredicto final
    expect(await screen.findByText("Veredicto final")).toBeInTheDocument();
    await waitFor(() => {
      expect(onVerdictReady).toHaveBeenCalledWith(sampleVerdict);
    });
  });

  it("envía el POST con el cuerpo que espera el contrato", async () => {
    const fetchMock = mockSse(['data: {"type":"done","elapsedMs":10}\n\n']);
    const user = userEvent.setup();
    renderLive();

    await user.type(screen.getByLabelText(/Servicio/i), "checkout-api");
    await user.click(screen.getByRole("button", { name: /Iniciar diagnóstico/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/diagnose");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Accept: "text/event-stream" });
    expect(JSON.parse(String(init.body))).toEqual({
      service: "checkout-api",
      environment: "production",
      windowMinutes: 30,
    });
  });

  it("muestra el evento de error del stream", async () => {
    mockSse([
      'data: {"type":"meta","incidentId":"INC-1","service":"checkout-api","startedAt":"2026-10-20T09:00:00.000Z"}\n\n',
      'data: {"type":"error","message":"KQL inválido","detail":"Unknown column foo"}\n\n',
    ]);

    const user = userEvent.setup();
    renderLive();

    await user.type(screen.getByLabelText(/Servicio/i), "checkout-api");
    await user.click(screen.getByRole("button", { name: /Iniciar diagnóstico/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("KQL inválido");
    expect(alert).toHaveTextContent("Unknown column foo");
  });

  it("exige un servicio antes de lanzar el diagnóstico", async () => {
    const fetchMock = mockSse([]);
    const user = userEvent.setup();
    renderLive();

    await user.click(screen.getByRole("button", { name: /Iniciar diagnóstico/i }));

    expect(
      await screen.findByText("Indica el servicio afectado para poder diagnosticar."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pinta el plan antes de que el stream termine (consumo incremental)", async () => {
    // El stream se deja abierto a propósito: si la vista pintase sólo al
    // final, el plan no aparecería nunca y el test fallaría.
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );

    const user = userEvent.setup();
    renderLive();

    await user.type(screen.getByLabelText(/Servicio/i), "checkout-api");
    await user.click(screen.getByRole("button", { name: /Iniciar diagnóstico/i }));

    streamController?.enqueue(
      encoder.encode(
        'data: {"type":"meta","incidentId":"INC-1","service":"checkout-api","startedAt":"2026-10-20T09:00:00.000Z"}\n\n' +
          'data: {"type":"plan","steps":["Consultar excepciones"],"hypothesis":"El error empezó tras un despliegue."}\n\n',
      ),
    );

    // El plan aparece con el stream todavía abierto.
    expect(
      await screen.findByText("El error empezó tras un despliegue."),
    ).toBeInTheDocument();
    expect(screen.getByText("Diagnóstico en curso: el copilot está recolectando evidencia.")).toBeInTheDocument();

    // Y sigue en curso: no ha llegado el evento `done`.
    expect(screen.queryByText("Diagnóstico completado.")).not.toBeInTheDocument();

    streamController?.close();
  });
});
