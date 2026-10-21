import { formatDateTime } from "../../lib/format";
import type { Verdict } from "../../types/contract";
import { EvidenceList } from "../evidence/EvidenceList";
import { Banner } from "../ui/Banner";
import { Card } from "../ui/Card";
import { ConfidenceBadge } from "../ui/ConfidenceBadge";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import { FeedbackControl } from "./FeedbackControl";
import { RelatedIncidentsCard } from "./RelatedIncidentsCard";
import { SuspectCommitsCard } from "./SuspectCommitsCard";
import { TimelineCard } from "./TimelineCard";
import {
  RecommendationsCard,
  RootCauseCard,
  ToolCallsSummary,
  UncertaintiesCard,
} from "./VerdictCards";

export interface VerdictViewProps {
  verdict?: Verdict;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}

/**
 * Vista "Veredicto": causa raíz, confianza, commits sospechosos, timeline,
 * evidencia, recomendaciones, límites, incidentes relacionados y feedback.
 */
export function VerdictView({ verdict, loading = false, error, onRetry }: VerdictViewProps) {
  if (error) {
    return (
      <div className="view">
        <Banner
          tone="error"
          title="No se ha podido cargar el veredicto"
          detail={error}
          actions={
            onRetry ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>
                Reintentar
              </button>
            ) : null
          }
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="view">
        <div className="card">
          <div className="empty">
            <Spinner size="lg" label="Cargando veredicto" />
            <p className="empty__title">Cargando el veredicto…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!verdict) {
    return (
      <div className="view">
        <div className="card">
          <EmptyState
            icon="clipboard"
            title="Todavía no hay ningún veredicto"
            description="Abre un incidente desde la vista «Incidentes» o ejecuta un diagnóstico en vivo para ver aquí su análisis completo."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="view">
      <header className="verdict-header">
        <div>
          <div className="incident-row__top">
            <span className="chip chip--accent">
              <Icon name="server" size={12} />
              {verdict.service}
            </span>
            <span className="chip chip--muted">{verdict.environment}</span>
            <span className="incident-row__id">{verdict.incidentId}</span>
          </div>
          <h2 className="verdict-header__title" style={{ marginTop: "var(--sp-3)" }}>
            {verdict.summary}
          </h2>
          <div className="verdict-header__meta">
            <span>Generado el {formatDateTime(verdict.generatedAt)}</span>
            <span className="mono">{verdict.incidentId}</span>
          </div>
        </div>
        <ConfidenceBadge confidence={verdict.confidence} />
      </header>

      <div className="verdict-grid">
        <div className="verdict-grid__full">
          <RootCauseCard summary={verdict.summary} rootCause={verdict.rootCause} />
        </div>

        <SuspectCommitsCard commits={verdict.suspectCommits} evidence={verdict.evidence} />

        <Card
          title="Evidencia"
          icon="database"
          headingId="verdict-evidence-title"
          bodyClassName="card__body--flush"
          actions={
            verdict.evidence.length > 0 ? (
              <span className="chip chip--accent mono">{verdict.evidence.length}</span>
            ) : null
          }
        >
          {verdict.evidence.length === 0 ? (
            <EmptyState
              icon="database"
              title="Sin evidencia"
              description="El copilot no ha adjuntado evidencia a este diagnóstico."
            />
          ) : (
            <EvidenceList items={verdict.evidence} labelledBy="verdict-evidence-title" />
          )}
        </Card>

        <div className="verdict-grid__full">
          <TimelineCard events={verdict.timeline} />
        </div>

        <RecommendationsCard recommendations={verdict.recommendations} />

        <UncertaintiesCard uncertainties={verdict.uncertainties} />

        <RelatedIncidentsCard incidents={verdict.relatedIncidents} />

        <div className="verdict-grid__full">
          <ToolCallsSummary toolCalls={verdict.toolCalls} />
        </div>

        <div className="verdict-grid__full">
          <FeedbackControl incidentId={verdict.incidentId} />
        </div>
      </div>
    </div>
  );
}
