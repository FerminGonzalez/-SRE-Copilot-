import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";

export interface RecommendationsCardProps {
  recommendations: string[];
}

/** Recomendaciones de remediación. */
export function RecommendationsCard({ recommendations }: RecommendationsCardProps) {
  return (
    <Card
      title="Recomendaciones"
      icon="shield"
      headingId="verdict-recommendations-title"
      actions={
        recommendations.length > 0 ? (
          <span className="chip chip--success mono">{recommendations.length}</span>
        ) : null
      }
    >
      {recommendations.length === 0 ? (
        <EmptyState
          icon="shield"
          title="Sin recomendaciones"
          description="El copilot no ha propuesto acciones para este incidente."
        />
      ) : (
        <ol className="stack-list">
          {recommendations.map((recommendation, index) => (
            <li className="stack-list__item" key={`${index}-${recommendation}`}>
              <span className="stack-list__marker" aria-hidden="true">
                {index + 1}
              </span>
              <span>{recommendation}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export interface UncertaintiesCardProps {
  uncertainties: string[];
}

/** Límites explícitos del análisis. */
export function UncertaintiesCard({ uncertainties }: UncertaintiesCardProps) {
  return (
    <Card
      title="Límites del análisis"
      icon="alert"
      headingId="verdict-uncertainties-title"
      actions={
        uncertainties.length > 0 ? (
          <span className="chip chip--warning mono">{uncertainties.length}</span>
        ) : null
      }
    >
      {uncertainties.length === 0 ? (
        <EmptyState
          icon="check"
          title="Sin límites declarados"
          description="El copilot no ha identificado incertidumbres relevantes en este diagnóstico."
        />
      ) : (
        <ul className="stack-list">
          {uncertainties.map((uncertainty, index) => (
            <li className="stack-list__item" key={`${index}-${uncertainty}`}>
              <span className="stack-list__marker stack-list__marker--warning" aria-hidden="true">
                !
              </span>
              <span>{uncertainty}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export interface RootCauseCardProps {
  summary: string;
  rootCause: string;
}

/** Causa raíz y resumen del incidente. */
export function RootCauseCard({ summary, rootCause }: RootCauseCardProps) {
  return (
    <Card title="Causa raíz" icon="alert" headingId="verdict-rootcause-title">
      <p className="root-cause">{summary}</p>
      <p className="root-cause">{rootCause}</p>
    </Card>
  );
}

export interface ToolCallsSummaryProps {
  toolCalls: Array<{ tool: string; durationMs: number; ok: boolean; error?: string }>;
}

/** Resumen de las herramientas ejecutadas para llegar al veredicto. */
export function ToolCallsSummary({ toolCalls }: ToolCallsSummaryProps) {
  if (toolCalls.length === 0) return null;

  return (
    <Card title="Herramientas ejecutadas" icon="terminal" headingId="verdict-tools-title" bodyClassName="card__body--flush">
      <ul className="toolcalls">
        {toolCalls.map((call, index) => (
          <li key={`${call.tool}-${index}`} className={`toolcall toolcall--${call.ok ? "ok" : "error"}`}>
            <span className="toolcall__icon" aria-hidden="true">
              <Icon name={call.ok ? "check" : "cross"} size={15} />
            </span>
            <div>
              <span className="toolcall__name">{call.tool}</span>
              {call.error ? <p className="toolcall__summary">{call.error}</p> : null}
            </div>
            <span className="toolcall__duration">{Math.round(call.durationMs)} ms</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
