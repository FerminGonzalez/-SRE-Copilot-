import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IncidentsView } from "../components/incidents/IncidentsView";
import { sampleIncidents } from "./fixtures";

function mockIncidents() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ incidents: sampleIncidents }),
    text: async () => "",
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("IncidentsView", () => {
  it("lista los incidentes devueltos por el copilot", async () => {
    mockIncidents();
    render(<IncidentsView onOpenIncident={() => {}} />);

    expect(await screen.findByText("checkout-api")).toBeInTheDocument();
    expect(screen.getByText("inventory-api")).toBeInTheDocument();
    expect(screen.getByText("INC-2026-0142")).toBeInTheDocument();
    expect(
      screen.getByText("HTTP 500 en checkout-api tras el despliegue a3f21bc."),
    ).toBeInTheDocument();
  });

  it("llama a onOpenIncident al pulsar un incidente", async () => {
    mockIncidents();
    const onOpenIncident = vi.fn();
    const user = userEvent.setup();
    render(<IncidentsView onOpenIncident={onOpenIncident} />);

    const row = await screen.findByRole("button", {
      name: /Abrir el veredicto del incidente INC-2026-0142/i,
    });
    await user.click(row);

    expect(onOpenIncident).toHaveBeenCalledWith("INC-2026-0142");
  });

  it("filtra por servicio al aplicar el formulario", async () => {
    const fetchMock = mockIncidents();
    const user = userEvent.setup();
    render(<IncidentsView onOpenIncident={() => {}} />);

    await screen.findByText("checkout-api");

    await user.type(screen.getByLabelText("Servicio"), "checkout-api");
    await user.click(screen.getByRole("button", { name: /Aplicar filtro/i }));

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1);
      expect(String(lastCall?.[0])).toContain("service=checkout-api");
    });
  });

  it("muestra un error cuando el copilot no responde", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: async () => ({}),
        text: async () => "El copilot no está disponible",
      }),
    );

    render(<IncidentsView onOpenIncident={() => {}} />);

    expect(
      await screen.findByText("No se ha podido cargar la lista de incidentes"),
    ).toBeInTheDocument();
    expect(screen.getByText("El copilot no está disponible")).toBeInTheDocument();
  });

  it("muestra un estado vacío cuando no hay incidentes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ incidents: [] }),
        text: async () => "",
      }),
    );

    render(<IncidentsView onOpenIncident={() => {}} />);

    expect(await screen.findByText("No hay diagnósticos que mostrar")).toBeInTheDocument();
  });
});
