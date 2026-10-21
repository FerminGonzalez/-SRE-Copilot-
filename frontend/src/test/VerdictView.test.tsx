import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VerdictView } from "../components/verdict/VerdictView";
import { sampleVerdict } from "./fixtures";

function mockFetchOk() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ ok: true, incidentId: sampleVerdict.incidentId }),
    text: async () => "",
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("VerdictView", () => {
  it("muestra causa raíz, resumen y confianza", () => {
    render(<VerdictView verdict={sampleVerdict} />);

    expect(screen.getAllByText(sampleVerdict.summary).length).toBeGreaterThan(0);
    expect(screen.getByText(sampleVerdict.rootCause)).toBeInTheDocument();
    expect(screen.getByText("Confianza Alta")).toBeInTheDocument();
  });

  it("lista los commits sospechosos con sha, autor, fecha y motivo", () => {
    render(<VerdictView verdict={sampleVerdict} />);

    const commit = sampleVerdict.suspectCommits[0];
    expect(commit).toBeDefined();
    expect(screen.getByText(commit!.sha)).toBeInTheDocument();
    expect(screen.getByText(commit!.message)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(commit!.author))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(commit!.why))).toBeInTheDocument();
  });

  it("muestra el diff del commit sospechoso (CONTRACTS.md §8.3)", () => {
    render(<VerdictView verdict={sampleVerdict} />);

    const diff = sampleVerdict.evidence.find((item) => item.kind === "diff");
    expect(diff).toBeDefined();

    // El diff aparece bajo el commit sospechoso, plegado en un <details>.
    const commitsCard = screen.getByRole("region", { name: /Commits sospechosos/i });
    const details = within(commitsCard).getByText(diff!.title).closest("details");
    expect(details).not.toBeNull();
    expect(details).toHaveTextContent("wrong-host:5432");
  });

  it("muestra recomendaciones, límites e incidentes relacionados", () => {
    render(<VerdictView verdict={sampleVerdict} />);

    expect(
      screen.getByText("Revertir el commit a3f21bc o volver a fijar DATABASE_CONNECTION_STRING en el App Service."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No se ha podido inspeccionar el estado real de la variable de entorno en el App Service.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("checkout-api devolvía 502 tras un despliegue")).toBeInTheDocument();
    expect(screen.getByText("78 %")).toBeInTheDocument();
  });

  it("deja la evidencia plegada y la despliega al pulsar", async () => {
    const user = userEvent.setup();
    render(<VerdictView verdict={sampleVerdict} />);

    const firstEvidence = sampleVerdict.evidence[0];
    expect(firstEvidence).toBeDefined();

    const toggle = screen.getByRole("button", { name: new RegExp(firstEvidence!.title) });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    const panel = document.getElementById(`evidencia-panel-${firstEvidence!.id}`);
    expect(panel).not.toBeVisible();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(`evidencia-panel-${firstEvidence!.id}`)).toBeVisible();
    expect(screen.getByText(firstEvidence!.detail)).toBeInTheDocument();
  });

  it("envía el feedback al copilot con el veredicto y la nota", async () => {
    const fetchMock = mockFetchOk();
    const user = userEvent.setup();
    render(<VerdictView verdict={sampleVerdict} />);

    await user.click(screen.getByRole("radio", { name: "Parcialmente correcto" }));
    await user.type(screen.getByLabelText(/Nota/i), "Falta la traza de la dependencia");
    await user.click(screen.getByRole("button", { name: /Enviar feedback/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/incidents/${sampleVerdict.incidentId}/feedback`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      verdict: "partially",
      note: "Falta la traza de la dependencia",
    });

    await waitFor(() => {
      expect(screen.getByText("Feedback registrado")).toBeInTheDocument();
    });
  });

  it("no permite enviar feedback sin elegir una opción", () => {
    render(<VerdictView verdict={sampleVerdict} />);

    const submit = screen.getByRole("button", { name: /Enviar feedback/i });
    expect(submit).toBeDisabled();
  });

  it("muestra un estado vacío cuando no hay veredicto", () => {
    render(<VerdictView />);

    expect(screen.getByText("Todavía no hay ningún veredicto")).toBeInTheDocument();
  });

  it("muestra el error recibido sin renderizar tarjetas", () => {
    render(<VerdictView error="HTTP 404 Not Found" />);

    expect(screen.getByText("No se ha podido cargar el veredicto")).toBeInTheDocument();
    expect(within(screen.getByRole("alert")).getByText("HTTP 404 Not Found")).toBeInTheDocument();
  });
});
