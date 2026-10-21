import type { HealthState } from "../../hooks/useHealth";

export interface ConnectionBadgeProps {
  health: HealthState;
  /** Hay un diagnóstico en curso: el indicador pasa a "ocupado". */
  busy?: boolean;
}

const LABELS: Record<HealthState["status"], string> = {
  checking: "Comprobando…",
  online: "Copilot conectado",
  degraded: "Copilot degradado",
  offline: "Sin conexión",
};

/**
 * Indicador de conexión con el copilot, basado en `GET /api/health`.
 * El color nunca es el único indicio: siempre acompaña de un texto.
 */
export function ConnectionBadge({ health, busy = false }: ConnectionBadgeProps) {
  const variant = busy ? "busy" : health.status;
  const label = busy ? "Diagnosticando…" : LABELS[health.status];
  const detail = health.info
    ? `LLM ${health.info.llm} · ${health.info.tools.length} herramientas`
    : health.error;

  return (
    <span
      className={`conn conn--${variant}`}
      role="status"
      aria-live="polite"
      title={detail ?? undefined}
    >
      <span className="conn__dot" aria-hidden="true" />
      <span>{label}</span>
      {detail ? <span className="visually-hidden">. {detail}</span> : null}
    </span>
  );
}
