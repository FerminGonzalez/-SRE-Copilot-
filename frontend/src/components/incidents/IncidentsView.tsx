import { useMemo, useState } from "react";
import { useIncidents } from "../../hooks/useIncidents";
import { FEEDBACK_LABELS, formatRelative } from "../../lib/format";
import { Banner } from "../ui/Banner";
import { ConfidenceBadge } from "../ui/ConfidenceBadge";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";

export interface IncidentsViewProps {
  /** Callback al pulsar un incidente: carga su veredicto completo. */
  onOpenIncident: (incidentId: string) => void;
  /** Id del incidente ya abierto, para marcarlo visualmente. */
  activeIncidentId?: string;
}

const LIMIT_OPTIONS = [10, 25, 50, 100];

export function IncidentsView({ onOpenIncident, activeIncidentId }: IncidentsViewProps) {
  const [serviceFilter, setServiceFilter] = useState("");
  const [appliedFilter, setAppliedFilter] = useState("");
  const [limit, setLimit] = useState(25);

  const { incidents, loading, error, reload } = useIncidents({
    service: appliedFilter,
    limit,
  });

  const hasFilter = useMemo(() => appliedFilter.trim().length > 0, [appliedFilter]);

  return (
    <div className="view">
      <div className="view__header">
        <div>
          <h2 className="view__title">Incidentes</h2>
          <p className="view__description">
            Diagnósticos anteriores almacenados por el copilot. Cada incidente conserva su causa
            raíz, la evidencia recolectada y el feedback recibido del equipo.
          </p>
        </div>
      </div>

      <section className="card" aria-label="Filtros de incidentes">
        <div className="card__body">
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedFilter(serviceFilter);
            }}
          >
            <div className="field">
              <label className="field__label" htmlFor="incident-service">
                Servicio
              </label>
              <input
                id="incident-service"
                className="input"
                type="search"
                placeholder="Todos los servicios"
                value={serviceFilter}
                onChange={(event) => setServiceFilter(event.target.value)}
                autoComplete="off"
              />
              <span className="field__hint">Filtra por nombre de servicio (opcional).</span>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="incident-limit">
                Límite
              </label>
              <select
                id="incident-limit"
                className="select"
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
              >
                {LIMIT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option} incidentes
                  </option>
                ))}
              </select>
              <span className="field__hint">Máximo de resultados devueltos por el copilot.</span>
            </div>

            <div className="field" style={{ justifyContent: "flex-end" }}>
              <div className="view__actions">
                <button type="submit" className="btn btn--ghost">
                  <Icon name="search" size={15} />
                  Aplicar filtro
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setServiceFilter("");
                    setAppliedFilter("");
                  }}
                  disabled={!hasFilter}
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    reload();
                  }}
                  disabled={loading}
                >
                  {loading ? <Spinner /> : <Icon name="refresh" size={15} />}
                  Actualizar
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>

      {error ? (
        <Banner
          tone="error"
          title="No se ha podido cargar la lista de incidentes"
          detail={error}
          actions={
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => reload()}>
              Reintentar
            </button>
          }
        />
      ) : null}

      <section className="card" aria-label="Lista de incidentes" aria-busy={loading}>
        <header className="card__header">
          <h3 className="card__title">
            <Icon name="list" size={15} />
            Diagnósticos previos
          </h3>
          <span className="chip chip--muted mono">
            {incidents.length} {incidents.length === 1 ? "resultado" : "resultados"}
          </span>
        </header>

        <div className="card__body card__body--flush">
          {loading && incidents.length === 0 ? (
            <div className="empty">
              <Spinner size="lg" label="Cargando incidentes" />
              <p className="empty__title">Cargando incidentes…</p>
            </div>
          ) : incidents.length === 0 ? (
            <EmptyState
              icon="inbox"
              title="No hay diagnósticos que mostrar"
              description={
                hasFilter
                  ? `Ningún incidente registrado para «${appliedFilter}».`
                  : "Aún no se ha ejecutado ningún diagnóstico contra el copilot."
              }
            />
          ) : (
            <ul className="incident-list">
              {incidents.map((incident) => (
                <li key={incident.id}>
                  <button
                    type="button"
                    className="incident-row"
                    onClick={() => onOpenIncident(incident.id)}
                    aria-label={`Abrir el veredicto del incidente ${incident.id} de ${incident.service}`}
                    style={
                      activeIncidentId === incident.id
                        ? { background: "var(--bg-active)" }
                        : undefined
                    }
                  >
                    <span className="incident-row__top">
                      <span className="incident-row__service">{incident.service}</span>
                      <span className="incident-row__id">{incident.id}</span>
                      <ConfidenceBadge confidence={incident.confidence} withLabel={false} />
                      {incident.feedback ? (
                        <span className="chip chip--muted">
                          feedback: {FEEDBACK_LABELS[incident.feedback] ?? incident.feedback}
                        </span>
                      ) : null}
                    </span>

                    <span className="incident-row__summary">{incident.summary}</span>
                    <span className="incident-row__root">{incident.rootCause}</span>

                    <span className="incident-row__side">
                      <span className="incident-row__time">
                        {formatRelative(incident.generatedAt)}
                      </span>
                      <span className="chip chip--accent">Ver veredicto</span>
                    </span>

                    {incident.tags.length > 0 ? (
                      <span className="incident-row__tags">
                        {incident.tags.map((tag) => (
                          <span key={tag} className="chip chip--muted">
                            {tag}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
