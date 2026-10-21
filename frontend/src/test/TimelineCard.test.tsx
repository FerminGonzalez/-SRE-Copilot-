import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimelineCard } from "../components/verdict/TimelineCard";
import type { TimelineEvent } from "../types/contract";

const events: TimelineEvent[] = [
  {
    at: "2026-10-20T08:42:11.000Z",
    event: "SRE Copilot emite el veredicto del incidente",
    source: "llm",
    severity: "info",
  },
  {
    at: "2026-10-20T08:36:00.000Z",
    event: "Tasa de error por encima del 40 %",
    source: "kql",
    severity: "critical",
    detail: "customMetrics · availability por minuto",
  },
  {
    at: "2026-10-20T08:29:02.000Z",
    event: "Deploy del commit a3f21bc completado",
    source: "deploy",
    severity: "warning",
  },
];

describe("TimelineCard", () => {
  it("renderiza un elemento de lista por evento", () => {
    render(<TimelineCard events={events} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(events.length);
  });

  it("ordena los eventos cronológicamente", () => {
    render(<TimelineCard events={events} />);

    const rendered = screen
      .getAllByRole("listitem")
      .map((item) => item.querySelector("time")?.getAttribute("datetime"));

    expect(rendered).toEqual([
      "2026-10-20T08:29:02.000Z",
      "2026-10-20T08:36:00.000Z",
      "2026-10-20T08:42:11.000Z",
    ]);
  });

  it("codifica la severidad por color y por texto", () => {
    render(<TimelineCard events={events} />);

    const critical = screen.getByText("Tasa de error por encima del 40 %").closest("li");
    expect(critical).toHaveAttribute("data-severity", "critical");
    expect(screen.getByText("CRÍTICO")).toBeInTheDocument();
    expect(screen.getByText("AVISO")).toBeInTheDocument();
    expect(screen.getByText("INFO")).toBeInTheDocument();
  });

  it("muestra la fuente del evento y su detalle", () => {
    render(<TimelineCard events={events} />);

    expect(screen.getByText("Deploy")).toBeInTheDocument();
    expect(screen.getByText("LLM")).toBeInTheDocument();
    expect(
      screen.getByText("customMetrics · availability por minuto"),
    ).toBeInTheDocument();
  });

  it("muestra un estado vacío cuando no hay eventos", () => {
    render(<TimelineCard events={[]} />);

    expect(screen.getByText("Sin eventos")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
