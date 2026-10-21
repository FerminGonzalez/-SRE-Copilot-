/**
 * Ensamblador del veredicto (CONTRACTS.md §1).
 *
 * Aquí se aplica la regla central del proyecto:
 * **toda afirmación del veredicto tiene que poder rastrearse hasta un
 * resultado de herramienta**.
 *
 * El LLM propone (resumen, causa raíz, commits sospechosos, línea de tiempo);
 * este módulo:
 * 1. descarta los commits y las marcas de tiempo que no aparezcan en los
 *    resultados de las herramientas,
 * 2. sustituye lo que falte por una versión determinista construida con la
 *    evidencia observada,
 * 3. limita la confianza a lo que la evidencia sostiene,
 * 4. garantiza que `uncertainties` nunca esté vacío.
 */

import { z } from "zod";
import type {
  Confidence,
  EvidenceItem,
  RelatedIncident,
  SuspectCommit,
  TimelineEvent,
  ToolCallRecord,
  Verdict,
} from "./types";
import type { FactSet } from "./evidence";
import type { DiagnosisPlan } from "./planner";
import { correlateDeploy, firstErrorAt, totalExceptionCount } from "../tools/deploy";

/* -------------------------------------------------------------------------- */
/* Análisis que devuelve el LLM                                                */
/* -------------------------------------------------------------------------- */

/** Commit sospechoso propuesto por el modelo. */
export const SuspectCommitSchema = z.object({
  sha: z.string().min(1),
  message: z.string().default(""),
  author: z.string().default("desconocido"),
  url: z.string().default(""),
  date: z.string().default(""),
  why: z.string().default(""),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
});

/** Evento de la línea de tiempo propuesto por el modelo. */
export const TimelineEventSchema = z.object({
  at: z.string().min(1),
  event: z.string().default(""),
  source: z
    .enum(["kql", "github", "deploy", "dynatrace", "logs", "llm", "system"])
    .default("system"),
  severity: z.enum(["info", "warning", "error", "critical"]).default("info"),
  detail: z.string().optional(),
});

/** Estructura del análisis que produce el LLM. */
export const AnalysisSchema = z.object({
  summary: z.string().min(1),
  rootCause: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
  suspectCommits: z.array(SuspectCommitSchema).default([]),
  timeline: z.array(TimelineEventSchema).default([]),
  recommendations: z.array(z.string()).default([]),
  uncertainties: z.array(z.string()).default([]),
});

/** Análisis validado del LLM. */
export type Analysis = z.infer<typeof AnalysisSchema>;

/** Analiza la respuesta del LLM; devuelve `null` si no es utilizable. */
export function parseAnalysis(content: string): { analysis: Analysis | null; error?: string } {
  const text = content.trim();
  if (!text) {
    return { analysis: null, error: "el proveedor devolvió una respuesta vacía" };
  }
  const candidate = extractJsonObject(text);
  if (!candidate) {
    return { analysis: null, error: "la respuesta del proveedor no contenía un objeto JSON" };
  }
  const parsed = AnalysisSchema.safeParse(candidate);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "raíz"}: ${issue.message}`)
      .join("; ");
    return { analysis: null, error: `el análisis no cumple el esquema (${detail})` };
  }
  return { analysis: parsed.data };
}

/** Extrae el primer objeto JSON de un texto (tolerante a vallas markdown). */
export function extractJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return undefined;
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* Ensamblado                                                                   */
/* -------------------------------------------------------------------------- */

/** Entrada del ensamblador del veredicto. */
export interface VerdictInput {
  incidentId: string;
  service: string;
  environment: string;
  generatedAt: string;
  since: string;
  until: string;
  analysis: Analysis | null;
  analysisError?: string;
  facts: FactSet;
  evidence: EvidenceItem[];
  toolCalls: ToolCallRecord[];
  relatedIncidents: RelatedIncident[];
  plan: DiagnosisPlan;
  warnings: string[];
}

const CONFIDENCE_ORDER: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

function minConfidence(left: Confidence, right: Confidence): Confidence {
  return CONFIDENCE_ORDER[left] <= CONFIDENCE_ORDER[right] ? left : right;
}

/** Confianza que sostiene la evidencia observada. */
export function evidenceConfidence(facts: FactSet): Confidence {
  const hasExceptions = facts.exceptions.length > 0;
  const hasDeploy = facts.deploys.length > 0;
  const hasCommits = facts.commits.size > 0;
  if (hasExceptions && hasDeploy && hasCommits) {
    return "high";
  }
  if (hasExceptions && (hasDeploy || hasCommits)) {
    return "medium";
  }
  if (hasExceptions || hasDeploy || hasCommits) {
    return "low";
  }
  return "low";
}

/** Línea de tiempo determinista construida con los hechos observados. */
export function buildDeterministicTimeline(facts: FactSet): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const deploy = [...facts.deploys].sort(
    (left, right) => Date.parse(left.deployedAt) - Date.parse(right.deployedAt),
  )[0];
  if (deploy) {
    const commit = facts.commits.get(deploy.commitSha.toLowerCase());
    events.push({
      at: deploy.deployedAt,
      event: `Deploy ${deploy.commitSha.slice(0, 7)} publicado`,
      source: "deploy",
      severity: "warning",
      detail: commit ? commit.message : "commit no disponible en el historial",
    });
  }
  for (const exception of facts.exceptions) {
    events.push({
      at: exception.firstSeen,
      event: `Primera aparición de ${exception.type}`,
      source: "kql",
      severity: "error",
      detail: exception.outerMessage,
    });
    events.push({
      at: exception.lastSeen,
      event: `Última aparición de ${exception.type}`,
      source: "kql",
      severity: "error",
      detail: `${exception.count} ocurrencias en la ventana`,
    });
  }
  for (const commit of facts.commits.values()) {
    events.push({
      at: commit.date,
      event: `Commit ${commit.sha.slice(0, 7)}: ${commit.message}`,
      source: "github",
      severity: "info",
      detail: commit.author,
    });
  }
  return events.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

/** Resumen determinista: sólo afirma lo observado. */
export function buildDeterministicSummary(facts: FactSet, service: string): string {
  const dominant = [...facts.exceptions].sort((left, right) => right.count - left.count)[0];
  if (!dominant) {
    return `No se observaron excepciones para ${service} en la ventana analizada.`;
  }
  const total = totalExceptionCount(facts.exceptions);
  const deploy = [...facts.deploys].sort(
    (left, right) => Date.parse(right.deployedAt) - Date.parse(left.deployedAt),
  )[0];
  return `Se observaron ${total} excepciones de tipo ${dominant.type} en la operación ${
    dominant.operationName || "desconocida"
  }${deploy ? ` tras el deploy ${deploy.commitSha.slice(0, 7)}` : ""}.`;
}

/** Causa raíz determinista: sólo afirma lo observado. */
export function buildDeterministicRootCause(facts: FactSet): string {
  const dominant = [...facts.exceptions].sort((left, right) => right.count - left.count)[0];
  if (!dominant) {
    return "No hay evidencia suficiente para determinar la causa raíz.";
  }
  const errorStart = firstErrorAt(facts.exceptions);
  const deploy = [...facts.deploys].sort(
    (left, right) => Date.parse(right.deployedAt) - Date.parse(left.deployedAt),
  )[0];
  if (deploy && errorStart && Date.parse(errorStart) >= Date.parse(deploy.deployedAt)) {
    const commit = facts.commits.get(deploy.commitSha.toLowerCase());
    return `El deploy ${deploy.commitSha.slice(0, 7)}${
      commit ? ` (${commit.message})` : ""
    } es el cambio más reciente anterior al inicio de los errores; la evidencia apunta a ${dominant.type}: ${dominant.outerMessage}`;
  }
  return `El error dominante es ${dominant.type}: ${dominant.outerMessage}. No hay un deploy en la ventana que permita atribuirlo a un cambio concreto.`;
}

/** Recomendaciones deterministas (complementan a las del modelo). */
export function buildDeterministicRecommendations(facts: FactSet): string[] {
  const recommendations: string[] = [];
  const deploy = [...facts.deploys].sort(
    (left, right) => Date.parse(right.deployedAt) - Date.parse(left.deployedAt),
  )[0];
  if (deploy) {
    const commit = facts.commits.get(deploy.commitSha.toLowerCase());
    recommendations.push(
      `Revisar el commit ${deploy.commitSha.slice(0, 7)}${commit ? ` (${commit.message})` : ""} y preparar el rollback.`,
    );
  }
  const hasDbError = facts.exceptions.some((exception) =>
    exception.type.toLowerCase().includes("sql"),
  );
  if (hasDbError) {
    recommendations.push(
      "Validar la cadena de conexión, el host y el firewall de base de datos en la configuración desplegada.",
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "Revisar la configuración desplegada y repetir el diagnóstico con una ventana mayor.",
    );
  }
  return recommendations;
}

/**
 * Ensambla el veredicto final aplicando el control de trazabilidad.
 */
export function buildVerdict(input: VerdictInput): Verdict {
  const { facts, analysis } = input;
  const uncertainties: string[] = [];
  const droppedClaims: string[] = [];

  /* --- Commits sospechosos: sólo los observados en las herramientas --- */
  const allowedShas = new Set([...facts.commits.keys()]);
  const proposedCommits = analysis?.suspectCommits ?? [];
  const suspectCommits: SuspectCommit[] = [];
  for (const commit of proposedCommits) {
    if (allowedShas.has(commit.sha.toLowerCase())) {
      suspectCommits.push(commit);
    } else {
      droppedClaims.push(`commit ${commit.sha.slice(0, 7)}`);
    }
  }

  if (suspectCommits.length === 0) {
    const correlation = correlateDeploy({
      deploys: facts.deploys,
      commits: [...facts.commits.values()],
      exceptions: facts.exceptions,
      diffs: facts.diffs,
      since: input.since,
      until: input.until,
    });
    suspectCommits.push(...correlation.suspectCommits);
  }

  /* --- Línea de tiempo: sólo marcas de tiempo observadas --- */
  const proposedTimeline = analysis?.timeline ?? [];
  const timeline: TimelineEvent[] = [];
  for (const event of proposedTimeline) {
    if (facts.timestamps.has(event.at)) {
      timeline.push(event);
    } else {
      droppedClaims.push(`evento en ${event.at}`);
    }
  }
  if (timeline.length === 0) {
    timeline.push(...buildDeterministicTimeline(facts));
  }

  /* --- Resumen y causa raíz --- */
  const summary = analysis?.summary ?? buildDeterministicSummary(facts, input.service);
  const rootCause = analysis?.rootCause ?? buildDeterministicRootCause(facts);

  /* --- Confianza: nunca por encima de lo que sostiene la evidencia --- */
  const evidenceBased = evidenceConfidence(facts);
  const confidence = analysis
    ? minConfidence(analysis.confidence, evidenceBased)
    : evidenceBased;

  /* --- Recomendaciones --- */
  const recommendations = dedupe([
    ...(analysis?.recommendations ?? []),
    ...buildDeterministicRecommendations(facts),
  ]);

  /* --- Incertidumbres: siempre hay al menos una --- */
  uncertainties.push(...(analysis?.uncertainties ?? []));
  if (input.analysisError) {
    uncertainties.push(
      `El proveedor de LLM no devolvió un análisis utilizable (${input.analysisError}); el veredicto se construyó exclusivamente con la evidencia de las herramientas.`,
    );
  }
  if (droppedClaims.length > 0) {
    uncertainties.push(
      `Se descartaron afirmaciones sin respaldo en los resultados de las herramientas: ${droppedClaims.join(", ")}.`,
    );
  }
  if (facts.offline) {
    uncertainties.push(
      "Los datos provienen del dataset offline determinista (sin credenciales de Application Insights, GitHub ni Dynatrace): no reflejan el estado real del servicio.",
    );
  }
  if (facts.failedTools.length > 0) {
    uncertainties.push(
      `Herramientas con error durante el diagnóstico: ${facts.failedTools.join(", ")}.`,
    );
  }
  if (input.evidence.length === 0) {
    uncertainties.push(
      "No se obtuvo ninguna evidencia: el veredicto describe únicamente la ausencia de datos, no el estado del servicio.",
    );
  }
  if (input.warnings.length > 0) {
    uncertainties.push(...input.warnings);
  }
  uncertainties.push(
    "El análisis se limita a la ventana temporal y a las herramientas consultadas; puede haber señales fuera de ese rango.",
  );

  return {
    incidentId: input.incidentId,
    service: input.service,
    environment: input.environment,
    generatedAt: input.generatedAt,
    summary,
    rootCause,
    confidence,
    suspectCommits,
    timeline,
    evidence: input.evidence,
    recommendations,
    uncertainties: dedupe(uncertainties),
    relatedIncidents: input.relatedIncidents,
    toolCalls: input.toolCalls,
  };
}

/** Elimina duplicados conservando el orden. */
export function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
