import { useMemo } from "react";
import {
  TIMELINE_SEVERITY_LABELS,
  TIMELINE_SOURCE_LABELS,
  formatDateTime,
} from "../../lib/format";
import type { TimelineEvent } from "../../types/contract";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";

export interface TimelineCardProps {
  events: TimelineEvent[];
}

/**
 * Línea de tiempo vertical del incidente, ordenada cronológicamente y coloreada
 * por severidad. Cada evento lleva su fuente y su severidad en texto, para no
 * depender solo del color.
 */
export function TimelineCard({ events }: TimelineCardProps) {
  const ordered = useMemo(
    () =>
      [...events].sort((a, b) => {
        const left = Date.parse(a.at);
        const right = Date.parse(b.at);
        if (Number.isNaN(left) || Number.isNaN(right)) return 0;
        return left - right;
      }),
    [events],
  );

  return (
    <Card
      title="Línea de tiempo"
      icon="clock"
      headingId="verdict-timeline-title"
      bodyClassName="card__body--flush"
      actions={
        ordered.length > 0 ? (
          <span className="chip chip--muted mono">{ordered.length} eventos</span>
        ) : null
      }
    >
      {ordered.length === 0 ? (
        <EmptyState
          icon="clock"
          title="Sin eventos"
          description="El copilot no ha devuelto ningún evento para este incidente."
        />
      ) : (
        <ol className="timeline" aria-labelledby="verdict-timeline-title">
          {ordered.map((event, index) => (
            <li
              className="timeline__item"
              key={`${event.at}-${event.source}-${index}`}
              data-severity={event.severity}
            >
              <span className="timeline__dot" aria-hidden="true" />
              <div className="timeline__meta">
                <time className="timeline__time" dateTime={event.at}>
                  {formatDateTime(event.at)}
                </time>
                <span className="sev-chip" data-severity={event.severity}>
                  {TIMELINE_SEVERITY_LABELS[event.severity]}
                </span>
                <span className="chip chip--muted">
                  {TIMELINE_SOURCE_LABELS[event.source] ?? event.source}
                </span>
              </div>
              <p className="timeline__event">{event.event}</p>
              {event.detail ? <p className="timeline__detail">{event.detail}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
