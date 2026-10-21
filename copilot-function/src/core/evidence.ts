/**
 * Evidencia y hechos trazables.
 *
 * Regla central del proyecto (CONTRACTS.md §1): **toda afirmación del veredicto
 * tiene que poder rastrearse hasta el resultado de una herramienta**.
 *
 * - `EvidenceStore` asigna identificadores estables y correlativos (`EV-001`).
 * - `extractFacts` convierte el payload de cada herramienta en hechos
 *   (commits, deploys, marcas de tiempo) que luego usa el ensamblador del
 *   veredicto para descartar cualquier afirmación no respaldada.
 */

import type {
  CommitDiff,
  CommitDiffData,
  CommitInfo,
  CommitListData,
  CustomEventQueryData,
  DataMode,
  DeployWindowData,
  DynatraceData,
  ExceptionGroup,
  ExceptionQueryData,
  LogSearchData,
  MetricQueryData,
  TraceQueryData,
} from "../tools/data";
import type { EvidenceItem } from "./types";

/** Evidencia candidata antes de recibir su identificador estable. */
export interface EvidenceCandidate {
  kind: EvidenceItem["kind"];
  title: string;
  detail: string;
  source: string;
  observedAt?: string;
}

/* -------------------------------------------------------------------------- */
/* Almacén de evidencia                                                         */
/* -------------------------------------------------------------------------- */

/** Almacén de evidencia con identificadores correlativos. */
export interface EvidenceStore {
  add(candidate: EvidenceCandidate): EvidenceItem;
  addAll(candidates: EvidenceCandidate[]): EvidenceItem[];
  items(): EvidenceItem[];
  size(): number;
}

/** Formatea el identificador estable de evidencia. */
export function formatEvidenceId(index: number): string {
  return `EV-${String(index).padStart(3, "0")}`;
}

/** Implementación en memoria del almacén de evidencia. */
export class InMemoryEvidenceStore implements EvidenceStore {
  private readonly collected: EvidenceItem[] = [];

  public add(candidate: EvidenceCandidate): EvidenceItem {
    const item: EvidenceItem = {
      id: formatEvidenceId(this.collected.length + 1),
      kind: candidate.kind,
      title: candidate.title,
      detail: candidate.detail,
      source: candidate.source,
      ...(candidate.observedAt ? { observedAt: candidate.observedAt } : {}),
    };
    this.collected.push(item);
    return item;
  }

  public addAll(candidates: EvidenceCandidate[]): EvidenceItem[] {
    return candidates.map((candidate) => this.add(candidate));
  }

  public items(): EvidenceItem[] {
    return [...this.collected];
  }

  public size(): number {
    return this.collected.length;
  }
}

/* -------------------------------------------------------------------------- */
/* Hechos observados                                                           */
/* -------------------------------------------------------------------------- */

/** Commit observado por una herramienta. */
export interface CommitFact {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

/** Deploy observado por una herramienta. */
export interface DeployFact {
  commitSha: string;
  deployedAt: string;
  version?: string;
}

/** Hechos extraídos de una única llamada a herramienta. */
export interface ToolFacts {
  commits: CommitFact[];
  deploys: DeployFact[];
  timestamps: string[];
  exceptions: ExceptionGroup[];
  diffs: Map<string, CommitDiff>;
  mode: DataMode;
}

/** Hechos acumulados de todo el diagnóstico. */
export interface FactSet {
  commits: Map<string, CommitFact>;
  deploys: DeployFact[];
  timestamps: Set<string>;
  exceptions: ExceptionGroup[];
  diffs: Map<string, CommitDiff>;
  offline: boolean;
  failedTools: string[];
}

function asObject<T>(data: unknown): T | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }
  return data as T;
}

function commitFact(commit: CommitInfo): CommitFact {
  return {
    sha: commit.sha,
    message: commit.message,
    author: commit.author,
    date: commit.date,
    url: commit.url,
  };
}

/** Extrae los hechos de un resultado de herramienta. */
export function extractFacts(tool: string, data: unknown): ToolFacts {
  const empty: ToolFacts = {
    commits: [],
    deploys: [],
    timestamps: [],
    exceptions: [],
    diffs: new Map(),
    mode: "live",
  };

  switch (tool) {
    case "query_exceptions": {
      const payload = asObject<ExceptionQueryData>(data);
      if (!payload) {
        return empty;
      }
      return {
        ...empty,
        mode: payload.mode,
        exceptions: payload.rows,
        timestamps: payload.rows.flatMap((row) => [row.firstSeen, row.lastSeen]),
      };
    }
    case "query_traces": {
      const payload = asObject<TraceQueryData>(data);
      if (!payload) {
        return empty;
      }
      return { ...empty, mode: payload.mode };
    }
    case "query_custom_events": {
      const payload = asObject<CustomEventQueryData>(data);
      if (!payload) {
        return empty;
      }
      return {
        ...empty,
        mode: payload.mode,
        deploys: payload.deploys.map((deploy) => ({
          commitSha: deploy.commitSha,
          deployedAt: deploy.deployedAt,
          ...(deploy.version ? { version: deploy.version } : {}),
        })),
        timestamps: payload.deploys.map((deploy) => deploy.deployedAt),
      };
    }
    case "query_metrics": {
      const payload = asObject<MetricQueryData>(data);
      if (!payload) {
        return empty;
      }
      return { ...empty, mode: payload.mode, timestamps: payload.points.map((point) => point.bucket) };
    }
    case "list_recent_commits": {
      const payload = asObject<CommitListData>(data);
      if (!payload) {
        return empty;
      }
      return {
        ...empty,
        mode: payload.mode,
        commits: payload.commits.map(commitFact),
        timestamps: payload.commits.map((commit) => commit.date),
      };
    }
    case "blame_deploy_window": {
      const payload = asObject<DeployWindowData>(data);
      if (!payload) {
        return empty;
      }
      return {
        ...empty,
        mode: payload.mode,
        commits: payload.commits.map(commitFact),
        timestamps: payload.commits.map((commit) => commit.date),
      };
    }
    case "get_commit_diff": {
      const payload = asObject<CommitDiffData>(data);
      if (!payload) {
        return empty;
      }
      const diffs = new Map<string, CommitDiff>();
      diffs.set(payload.commit.sha.toLowerCase(), payload.commit);
      return {
        ...empty,
        mode: payload.mode,
        commits: [commitFact(payload.commit)],
        diffs,
        timestamps: [payload.commit.date],
      };
    }
    case "search_logs": {
      const payload = asObject<LogSearchData>(data);
      if (!payload) {
        return empty;
      }
      return {
        ...empty,
        mode: payload.mode,
        timestamps: payload.matches.map((match) => match.timestamp),
      };
    }
    case "dynatrace_problems": {
      const payload = asObject<DynatraceData>(data);
      if (!payload) {
        return empty;
      }
      return {
        ...empty,
        mode: payload.mode,
        timestamps: payload.problems.map((problem) => problem.startTime),
      };
    }
    default:
      return empty;
  }
}

/** Acumula los hechos de una herramienta en el conjunto del diagnóstico. */
export function mergeFacts(facts: FactSet, extracted: ToolFacts): FactSet {
  for (const commit of extracted.commits) {
    if (commit.sha) {
      facts.commits.set(commit.sha.toLowerCase(), commit);
    }
  }
  facts.deploys.push(...extracted.deploys);
  for (const timestamp of extracted.timestamps) {
    if (timestamp) {
      facts.timestamps.add(timestamp);
    }
  }
  facts.exceptions.push(...extracted.exceptions);
  for (const [sha, diff] of extracted.diffs) {
    facts.diffs.set(sha, diff);
  }
  if (extracted.mode === "offline") {
    facts.offline = true;
  }
  return facts;
}

/** Crea un conjunto de hechos vacío. */
export function createFactSet(): FactSet {
  return {
    commits: new Map(),
    deploys: [],
    timestamps: new Set(),
    exceptions: [],
    diffs: new Map(),
    offline: false,
    failedTools: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Evidencia por herramienta                                                    */
/* -------------------------------------------------------------------------- */

/** Convierte el payload de una herramienta en evidencias candidatas. */
export function extractEvidence(tool: string, data: unknown): EvidenceCandidate[] {
  switch (tool) {
    case "query_exceptions": {
      const payload = asObject<ExceptionQueryData>(data);
      if (!payload) {
        return [];
      }
      return payload.rows.map((row) => ({
        kind: "exception" as const,
        title: `${row.type} · ${row.count} ocurrencias`,
        detail: `${row.outerMessage} (operación ${row.operationName || "desconocida"})`,
        source: payload.query,
        observedAt: row.firstSeen,
      }));
    }
    case "query_traces": {
      const payload = asObject<TraceQueryData>(data);
      if (!payload) {
        return [];
      }
      const requests = payload.requests.slice(0, 3).map((row) => ({
        kind: "trace" as const,
        title: `${row.name} · p95 ${row.p95}ms`,
        detail: `${row.count} peticiones, ${row.failures} fallos, p50 ${row.p50}ms`,
        source: payload.query,
      }));
      const dependencies = payload.dependencies.slice(0, 3).map((row) => ({
        kind: "trace" as const,
        title: `Dependencia ${row.target} · ${row.failures} fallos`,
        detail: row.message,
        source: payload.query,
      }));
      return [...requests, ...dependencies];
    }
    case "query_custom_events": {
      const payload = asObject<CustomEventQueryData>(data);
      if (!payload) {
        return [];
      }
      return payload.deploys.map((deploy) => ({
        kind: "deploy" as const,
        title: `Deploy ${deploy.commitSha.slice(0, 7)}`,
        detail: `Despliegue registrado${
          deploy.version ? ` (${deploy.version})` : ""
        }${deploy.author ? ` por ${deploy.author}` : ""}`,
        source: payload.query,
        observedAt: deploy.deployedAt,
      }));
    }
    case "query_metrics": {
      const payload = asObject<MetricQueryData>(data);
      if (!payload) {
        return [];
      }
      const worst = [...payload.points].sort((left, right) => right.errorRate - left.errorRate)[0];
      const items: EvidenceCandidate[] = [
        {
          kind: "metric" as const,
          title: `Disponibilidad ${(payload.availability * 100).toFixed(2)}%`,
          detail: `Tasa de error agregada ${(payload.errorRate * 100).toFixed(2)}%`,
          source: payload.query,
        },
      ];
      if (worst) {
        items.push({
          kind: "metric" as const,
          title: `Peor minuto ${worst.bucket}`,
          detail: `${worst.errors} errores de ${worst.count} peticiones (${(worst.errorRate * 100).toFixed(1)}%)`,
          source: payload.query,
          observedAt: worst.bucket,
        });
      }
      return items;
    }
    case "list_recent_commits": {
      const payload = asObject<CommitListData>(data);
      if (!payload) {
        return [];
      }
      return payload.commits.slice(0, 5).map((commit) => ({
        kind: "commit" as const,
        title: `${commit.sha.slice(0, 7)} · ${commit.message}`,
        detail: `${commit.author} · ${commit.date}`,
        source: commit.url || "GitHub",
        observedAt: commit.date,
      }));
    }
    case "blame_deploy_window": {
      const payload = asObject<DeployWindowData>(data);
      if (!payload) {
        return [];
      }
      return payload.commits.slice(0, 5).map((commit) => ({
        kind: "commit" as const,
        title: `Commit en la ventana · ${commit.sha.slice(0, 7)}`,
        detail: `${commit.message} · ${commit.author} · ${commit.date}`,
        source: commit.url || "GitHub",
        observedAt: commit.date,
      }));
    }
    case "get_commit_diff": {
      const payload = asObject<CommitDiffData>(data);
      if (!payload) {
        return [];
      }
      return payload.commit.files.slice(0, 5).map((file) => ({
        kind: "diff" as const,
        title: `${file.filename} (+${file.additions}/-${file.deletions})`,
        detail: file.patch ?? `${file.status}: sin parche disponible`,
        source: payload.commit.url || "GitHub",
        observedAt: payload.commit.date,
      }));
    }
    case "search_logs": {
      const payload = asObject<LogSearchData>(data);
      if (!payload) {
        return [];
      }
      return payload.matches.slice(0, 5).map((match) => ({
        kind: "log" as const,
        title: `${match.operationName || "log"} · severidad ${match.severityLevel}`,
        detail: match.message,
        source: payload.query,
        observedAt: match.timestamp,
      }));
    }
    case "dynatrace_problems": {
      const payload = asObject<DynatraceData>(data);
      if (!payload) {
        return [];
      }
      return payload.problems.slice(0, 3).map((problem) => ({
        kind: "correlation" as const,
        title: `Dynatrace ${problem.id} · ${problem.status}`,
        detail: `${problem.title} · impacto ${problem.impact} · severidad ${problem.severity}`,
        source: "Dynatrace API v2",
        observedAt: problem.startTime,
      }));
    }
    default:
      return [];
  }
}
