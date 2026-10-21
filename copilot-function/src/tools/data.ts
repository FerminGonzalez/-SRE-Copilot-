/**
 * Payloads estructurados que devuelven las herramientas.
 *
 * Son el contrato entre cada herramienta (real u offline) y el motor de
 * diagnóstico: el motor extrae hechos de aquí para construir el veredicto
 * trazable (CONTRACTS.md §1 y §3).
 */

/** Origen del dato: consulta real a la API o dataset sintético local. */
export type DataMode = "live" | "offline";

/* ---------- KQL: excepciones ---------- */

/** Grupo de excepciones agregadas por tipo y mensaje. */
export interface ExceptionGroup {
  type: string;
  outerMessage: string;
  operationName: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

/** Salida de `query_exceptions`. */
export interface ExceptionQueryData {
  mode: DataMode;
  query: string;
  rows: ExceptionGroup[];
  totalCount: number;
}

/* ---------- KQL: trazas y dependencias ---------- */

/** Latencia agregada por endpoint. */
export interface RequestLatencyRow {
  name: string;
  count: number;
  failures: number;
  p50: number;
  p95: number;
}

/** Dependencia saliente con fallos. */
export interface DependencyFailure {
  target: string;
  type: string;
  failures: number;
  message: string;
}

/** Salida de `query_traces`. */
export interface TraceQueryData {
  mode: DataMode;
  query: string;
  requests: RequestLatencyRow[];
  dependencies: DependencyFailure[];
}

/* ---------- KQL: custom events (deploys) ---------- */

/** Evento `Deploy` emitido por el pipeline de CI/CD. */
export interface DeployEvent {
  commitSha: string;
  deployedAt: string;
  version?: string;
  author?: string;
  message?: string;
}

/** Salida de `query_custom_events`. */
export interface CustomEventQueryData {
  mode: DataMode;
  query: string;
  deploys: DeployEvent[];
}

/* ---------- KQL: métricas ---------- */

/** Punto de métrica por minuto. */
export interface MetricPoint {
  bucket: string;
  count: number;
  errors: number;
  errorRate: number;
  avgDuration: number;
  p95: number;
}

/** Salida de `query_metrics`. */
export interface MetricQueryData {
  mode: DataMode;
  query: string;
  availability: number;
  errorRate: number;
  points: MetricPoint[];
}

/* ---------- GitHub ---------- */

/** Commit tal y como lo devuelve la API de GitHub. */
export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

/** Fichero modificado dentro de un commit. */
export interface CommitFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

/** Commit con su diff. */
export interface CommitDiff extends CommitInfo {
  files: CommitFile[];
}

/** Salida de `list_recent_commits`. */
export interface CommitListData {
  mode: DataMode;
  repo?: string;
  commits: CommitInfo[];
}

/** Salida de `get_commit_diff`. */
export interface CommitDiffData {
  mode: DataMode;
  commit: CommitDiff;
}

/** Salida de `blame_deploy_window`. */
export interface DeployWindowData {
  mode: DataMode;
  windowMinutes: number;
  since: string;
  until: string;
  commits: CommitInfo[];
}

/* ---------- Logs ---------- */

/** Línea de log encontrada por `search_logs`. */
export interface LogMatch {
  timestamp: string;
  severityLevel: number;
  message: string;
  operationName: string;
}

/** Salida de `search_logs`. */
export interface LogSearchData {
  mode: DataMode;
  query: string;
  matches: LogMatch[];
}

/* ---------- Dynatrace ---------- */

/** Problema abierto en Dynatrace. */
export interface DynatraceProblem {
  id: string;
  title: string;
  status: string;
  severity: string;
  impact: string;
  startTime: string;
}

/** Salida de `dynatrace_problems`. */
export interface DynatraceData {
  mode: DataMode;
  problems: DynatraceProblem[];
}
