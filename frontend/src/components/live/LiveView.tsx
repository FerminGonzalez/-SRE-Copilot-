import { formatDuration, truncate } from "../../lib/format";
import { hasRunningToolCall, type LiveRunState } from "../../lib/streamReducer";
import type { DiagnoseRequest } from "../../types/contract";
import { EvidenceList } from "../evidence/EvidenceList";
import { Banner } from "../ui/Banner";
import { Card } from "../ui/Card";
import { ConfidenceBadge } from "../ui/ConfidenceBadge";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";
import { DiagnoseForm } from "./DiagnoseForm";
import { StreamConsole } from "./StreamConsole";
import { ToolCallList } from "./ToolCallList";

export interface LiveViewProps {
  environment: string;
  onEnvironmentChange: (environment: string) => void;
  /** Estado del stream, propiedad del shell. */
  state: LiveRunState;
  /** Lanza un diagnóstico. */
  onRun: (request: DiagnoseRequest) => void;
  /** Cancela el diagnóstico en curso y limpia el estado. */
  onReset: () => void;
}

const STATUS_TEXT: Record<string, string> = {
  idle: "Preparado para iniciar un diagnóstico.",
  running: "Diagnóstico en curso: el copilot está recolectando evidencia.",
  completed: "Diagnóstico completado.",
  error: "El diagnóstico ha fallado.",
};

export function LiveView({
  environment,
  onEnvironmentChange,
  state,
  onRun,
  onReset,
}: LiveViewProps) {
  const running = state.status === "running";

  const toolInFlight = hasRunningToolCall(state);

  return (
    <div className="view">
      <div className="view__header">
        <div>
          <h2 className="view__title">Diagnóstico en vivo</h2>
          <p className="view__description">
            Dispara <code className="mono">POST /api/diagnose</code> y sigue el stream SSE del
            copilot: plan, llamadas a herramientas, evidencia acumulada y veredicto final.
          </p>
        </div>
      </div>

      <div className="live-layout">
        <div className="live-panels">
          <DiagnoseForm
            environment={environment}
            onEnvironmentChange={onEnvironmentChange}
            running={running}
            onSubmit={(request) => {
              onRun(request);
            }}
          />

          <section className="card" aria-labelledby="live-status-title">
            <header className="card__header">
              <h2 className="card__title" id="live-status-title">
                <Icon name="activity" size={15} />
                Estado
              </h2>
              {running ? (
                <button type="button" className="btn btn--ghost btn--sm" onClick={onReset}>
                  <Icon name="stop" size={13} />
                  Detener
                </button>
              ) : null}
            </header>
            <div className="card__body">
              <p role="status" aria-live="polite" style={{ fontSize: "var(--fs-sm)" }}>
                {running ? <Spinner /> : null} {STATUS_TEXT[state.status] ?? state.status}
              </p>

              {running ? (
                <>
                  <div className="progress" aria-hidden="true">
                    <div className="progress__bar" />
                  </div>
                  <p className="field__hint" style={{ marginTop: "var(--sp-2)" }}>
                    {toolInFlight
                      ? "Hay una herramienta en ejecución…"
                      : "Procesando los resultados que llegan por el stream…"}
                  </p>
                </>
              ) : null}

              {state.incidentId ? (
                <dl className="deflist" style={{ marginTop: "var(--sp-3)" }}>
                  <dt>Incidente</dt>
                  <dd className="mono">{state.incidentId}</dd>
                  <dt>Servicio</dt>
                  <dd className="mono">{state.service ?? "—"}</dd>
                  {state.elapsedMs !== undefined ? (
                    <>
                      <dt>Duración</dt>
                      <dd className="mono">{formatDuration(state.elapsedMs)}</dd>
                    </>
                  ) : null}
                </dl>
              ) : null}
            </div>
          </section>

          {state.error ? (
            <Banner
              tone="error"
              title={state.error.message}
              detail={
                state.error.detail ??
                "El copilot ha emitido un evento de error durante el diagnóstico."
              }
            />
          ) : null}
        </div>

        <div className="live-panels">
          <Card
            title="Plan de investigación"
            icon="clipboard"
            headingId="live-plan-title"
            actions={
              state.plan ? (
                <span className="chip chip--muted mono">
                  {state.plan.steps.length} pasos
                </span>
              ) : null
            }
          >
            {state.plan ? (
              <>
                <p
                  style={{
                    fontSize: "var(--fs-sm)",
                    color: "var(--text-secondary)",
                    marginBottom: "var(--sp-4)",
                  }}
                >
                  <strong style={{ color: "var(--text-primary)" }}>Hipótesis: </strong>
                  {state.plan.hypothesis}
                </p>
                <ol className="plan-steps">
                  {state.plan.steps.map((step, index) => (
                    <li className="plan-step" key={`${index}-${step}`}>
                      <span className="plan-step__index" aria-hidden="true">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <EmptyState
                icon="clipboard"
                title="Sin plan todavía"
                description="El plan de investigación aparecerá en cuanto el copilot lo envíe."
              />
            )}
          </Card>

          <Card
            title="Llamadas a herramientas"
            icon="terminal"
            headingId="live-tools-title"
            actions={
              state.toolCalls.length > 0 ? (
                <span className="chip chip--muted mono">
                  {state.toolCalls.length} llamadas
                </span>
              ) : null
            }
            bodyClassName="card__body--flush"
          >
            <ToolCallList toolCalls={state.toolCalls} />
          </Card>

          <Card
            title="Evidencia acumulada"
            icon="database"
            headingId="live-evidence-title"
            actions={
              state.evidence.length > 0 ? (
                <span className="chip chip--accent mono">{state.evidence.length}</span>
              ) : null
            }
            bodyClassName="card__body--flush"
          >
            {state.evidence.length === 0 ? (
              <EmptyState
                icon="database"
                title="Sin evidencia todavía"
                description="Cada evidencia encontrada por el copilot se acum aquí y se muestra sin bloquear el stream."
              />
            ) : (
              <EvidenceList items={state.evidence} />
            )}
          </Card>

          <Card title="Consola del stream" icon="terminal" headingId="live-console-title" bodyClassName="card__body--flush">
            <StreamConsole entries={state.log} />
          </Card>

          {state.verdict ? (
            <Card
              title="Veredicto final"
              icon="check"
              headingId="live-verdict-title"
              actions={<ConfidenceBadge confidence={state.verdict.confidence} />}
            >
              <p
                style={{
                  fontSize: "var(--fs-md)",
                  color: "var(--text-primary)",
                  marginBottom: "var(--sp-3)",
                }}
              >
                {state.verdict.summary}
              </p>
              <p className="text-muted" style={{ fontSize: "var(--fs-sm)" }}>
                <strong style={{ color: "var(--text-secondary)" }}>Causa raíz: </strong>
                {truncate(state.verdict.rootCause, 28)}
              </p>
              {state.verdict.recommendations.length > 0 ? (
                <ul className="stack-list" style={{ marginTop: "var(--sp-4)" }}>
                  {state.verdict.recommendations.slice(0, 3).map((recommendation) => (
                    <li className="stack-list__item" key={recommendation}>
                      <span className="stack-list__marker" aria-hidden="true">
                        →
                      </span>
                      <span>{recommendation}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
