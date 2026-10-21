/**
 * Esquemas del contrato de la plataforma (CONTRACTS.md §1 y §2).
 *
 * Estos tipos son la frontera compartida con `copilot-function`: el productor
 * (Azure Function) y este consumidor deben coincidir exactamente. No se
 * modifican aquí; si hace falta un cambio, se reporta en el README del
 * componente en lugar de desviarse del contrato.
 */

/** Nivel de confianza del diagnóstico. */
export type Confidence = "high" | "medium" | "low";

/** Veredicto del feedback del usuario sobre un incidente. */
export type FeedbackVerdict = "correct" | "partially" | "incorrect";

export interface SuspectCommit {
  /** 7-40 hex */
  sha: string;
  message: string;
  author: string;
  url: string;
  /** ISO 8601 */
  date: string;
  /** Por qué se suspiciona. */
  why: string;
  confidence: Confidence;
}

export type TimelineSource =
  | "kql"
  | "github"
  | "deploy"
  | "dynatrace"
  | "logs"
  | "llm"
  | "system";

export type TimelineSeverity = "info" | "warning" | "error" | "critical";

export interface TimelineEvent {
  /** ISO 8601 */
  at: string;
  event: string;
  source: TimelineSource;
  severity: TimelineSeverity;
  detail?: string;
}

export type EvidenceKind =
  | "exception"
  | "trace"
  | "metric"
  | "commit"
  | "diff"
  | "deploy"
  | "log"
  | "correlation";

export interface EvidenceItem {
  /** "EV-001" */
  id: string;
  kind: EvidenceKind;
  title: string;
  detail: string;
  /** Consulta KQL, URL o ruta del artefacto. */
  source: string;
  /** ISO 8601 */
  observedAt?: string;
}

export interface RelatedIncident {
  id: string;
  title: string;
  /** 0.0 - 1.0 */
  similarity: number;
  service?: string;
}

export interface ToolCallRecord {
  tool: string;
  args: Record<string, unknown>;
  durationMs: number;
  ok: boolean;
  error?: string;
}

/** Veredicto completo de un incidente (CONTRACTS.md §1). */
export interface Verdict {
  incidentId: string;
  service: string;
  environment: string;
  /** ISO 8601 */
  generatedAt: string;
  /** 1-2 frases: qué se rompió. */
  summary: string;
  /** Causa raíz técnica. */
  rootCause: string;
  confidence: Confidence;
  suspectCommits: SuspectCommit[];
  timeline: TimelineEvent[];
  evidence: EvidenceItem[];
  recommendations: string[];
  /** Límites explícitos del análisis. */
  uncertainties: string[];
  relatedIncidents: RelatedIncident[];
  toolCalls: ToolCallRecord[];
}

/** Resumen de incidente para la lista (CONTRACTS.md §5). */
export interface IncidentSummary {
  id: string;
  service: string;
  /** ISO 8601 */
  generatedAt: string;
  summary: string;
  rootCause: string;
  confidence: Confidence;
  feedback?: FeedbackVerdict;
  tags: string[];
}

/** Cuerpo de `POST /api/diagnose`. */
export interface DiagnoseRequest {
  service: string;
  environment?: string;
  windowMinutes?: number;
  symptom?: string;
  appVersion?: string;
  incidentId?: string;
}

/** Cuerpo de `POST /api/incidents/:id/feedback`. */
export interface FeedbackRequest {
  verdict: FeedbackVerdict;
  note?: string;
}

/** Respuesta de `GET /api/health`. */
export interface HealthInfo {
  ok: boolean;
  version: string;
  llm: string;
  tools: string[];
  ragAvailable: boolean;
}

/** Eventos del stream SSE de `POST /api/diagnose` (CONTRACTS.md §2). */
export type StreamEvent =
  | { type: "meta"; incidentId: string; service: string; startedAt: string }
  | { type: "plan"; steps: string[]; hypothesis: string }
  | { type: "tool_call"; tool: string; args: Record<string, unknown> }
  | {
      type: "tool_result";
      tool: string;
      ok: boolean;
      durationMs: number;
      summary: string;
      data?: unknown;
    }
  | { type: "evidence"; evidence: EvidenceItem }
  | { type: "verdict"; verdict: Verdict }
  | { type: "error"; message: string; detail?: string }
  | { type: "done"; elapsedMs: number };
