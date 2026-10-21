/**
 * Tipos compartidos del SRE Copilot.
 *
 * Fuente única de verdad: `CONTRACTS.md` §1 (veredicto), §2 (eventos SSE),
 * §3 (interfaz de herramienta) y §5 (memoria de incidentes).
 *
 * Cualquier cambio en este fichero rompe la integración con `frontend`,
 * por eso las formas coinciden literalmente con el contrato.
 */

/** Nivel de confianza del veredicto. */
export type Confidence = "high" | "medium" | "low";

/** Veredicto de diagnóstico que consume el frontend. */
export interface Verdict {
  incidentId: string;
  service: string;
  environment: string;
  generatedAt: string; // ISO 8601
  summary: string; // 1-2 frases: qué se rompió
  rootCause: string; // causa raíz técnica
  confidence: Confidence;
  suspectCommits: SuspectCommit[];
  timeline: TimelineEvent[];
  evidence: EvidenceItem[];
  recommendations: string[];
  uncertainties: string[]; // límites explícitos del análisis
  relatedIncidents: RelatedIncident[];
  toolCalls: ToolCallRecord[];
}

/** Commit sospechoso de haber provocado el incidente. */
export interface SuspectCommit {
  sha: string; // 7-40 hex
  message: string;
  author: string;
  url: string;
  date: string; // ISO 8601
  why: string; // por qué se sospecha
  confidence: Confidence;
}

/** Evento de la línea de tiempo del incidente. */
export interface TimelineEvent {
  at: string; // ISO 8601
  event: string;
  source: "kql" | "github" | "deploy" | "dynatrace" | "logs" | "llm" | "system";
  severity: "info" | "warning" | "error" | "critical";
  detail?: string;
}

/** Pieza de evidencia con identificador estable. */
export interface EvidenceItem {
  id: string; // "EV-001"
  kind: "exception" | "trace" | "metric" | "commit" | "diff" | "deploy" | "log" | "correlation";
  title: string;
  detail: string;
  source: string; // consulta KQL, URL, o ruta del artefacto
  observedAt?: string; // ISO 8601
}

/** Incidente previo relacionado (salida de la memoria RAG). */
export interface RelatedIncident {
  id: string;
  title: string;
  similarity: number; // 0.0 - 1.0
  service?: string;
}

/** Registro de una llamada a herramienta. */
export interface ToolCallRecord {
  tool: string;
  args: Record<string, unknown>;
  durationMs: number;
  ok: boolean;
  error?: string;
}

/** Resumen de un incidente almacenado en la memoria RAG. */
export interface IncidentSummary {
  id: string;
  service: string;
  generatedAt: string;
  summary: string;
  rootCause: string;
  confidence: Confidence;
  feedback?: "correct" | "partially" | "incorrect";
  tags: string[];
}

/** Feedback del usuario sobre un veredicto. */
export type Feedback = "correct" | "partially" | "incorrect";

/* -------------------------------------------------------------------------- */
/* Contrato §2 · eventos SSE                                                   */
/* -------------------------------------------------------------------------- */

/** Eventos del stream SSE de `POST /api/diagnose`. */
export type StreamEvent =
  | { type: "meta"; incidentId: string; service: string; startedAt: string }
  | { type: "plan"; steps: string[]; hypothesis: string }
  | { type: "tool_call"; tool: string; args: Record<string, unknown> }
  | { type: "tool_result"; tool: string; ok: boolean; durationMs: number; summary: string; data?: unknown }
  | { type: "evidence"; evidence: EvidenceItem }
  | { type: "verdict"; verdict: Verdict }
  | { type: "error"; message: string; detail?: string }
  | { type: "done"; elapsedMs: number };

/* -------------------------------------------------------------------------- */
/* Contrato §3 · herramientas                                                   */
/* -------------------------------------------------------------------------- */

/** Contexto que recibe toda herramienta en cada ejecución. */
export interface ToolContext {
  now: Date;
  windowMinutes: number;
  service: string;
  environment: string;
  appVersion?: string;
}

/** Resultado normalizado de una herramienta. */
export interface ToolResult {
  ok: boolean;
  summary: string; // 1 línea para el LLM
  data?: unknown; // payload estructurado
  error?: string;
  durationMs: number;
}

/** Herramienta expuesta al LLM. */
export interface Tool {
  name: string; // snake_case, p.ej. "query_exceptions"
  description: string; // una frase; se inyecta en el prompt del LLM
  parameters: Record<string, unknown>; // JSON Schema (object)
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

/* -------------------------------------------------------------------------- */
/* Solicitud de diagnóstico                                                    */
/* -------------------------------------------------------------------------- */

/** Cuerpo de `POST /api/diagnose`. */
export interface DiagnosisRequest {
  service: string;
  environment?: string;
  windowMinutes?: number;
  symptom?: string;
  appVersion?: string;
  incidentId?: string;
}
