import type { RelatedIncident } from "../../types/contract";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";

export interface RelatedIncidentsCardProps {
  incidents: RelatedIncident[];
}

/** Incidentes relacionados, con su similitud. */
export function RelatedIncidentsCard({ incidents }: RelatedIncidentsCardProps) {
  return (
    <Card
      title="Incidentes relacionados"
      icon="link"
      headingId="verdict-related-title"
      actions={
        incidents.length > 0 ? (
          <span className="chip chip--muted mono">{incidents.length}</span>
        ) : null
      }
    >
      {incidents.length === 0 ? (
        <EmptyState
          icon="search"
          title="Sin incidentes relacionados"
          description="No se han encontrado diagnósticos similares en la memoria de incidentes."
        />
      ) : (
        <ul>
          {incidents.map((incident) => {
            const percent = Math.max(0, Math.min(100, Math.round(incident.similarity * 100)));
            return (
              <li key={incident.id} className="related">
                <div>
                  <p className="related__title">{incident.title}</p>
                  <p className="related__meta">
                    {incident.id}
                    {incident.service ? ` · ${incident.service}` : ""}
                  </p>
                </div>
                <div>
                  <div
                    className="related__bar"
                    role="img"
                    aria-label={`Similitud del ${percent} % con el incidente ${incident.id}`}
                  >
                    <div className="related__fill" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="related__score mono">{percent} %</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
