/**
 * Proveedor de LLM `mock` — determinista, sin red y sin credenciales.
 *
 * Es el proveedor por defecto (CONTRACTS.md §4) y el que usan los tests.
 *
 * Garantía central: **el mock nunca inventa commits, hashes ni marcas de
 * tiempo**. Todo lo que devuelve en el veredicto final procede literalmente
 * de los resultados de herramientas que ha recibido. Si no ha visto un
 * commit, no devuelve `suspectCommits`; si no ha visto una marca de tiempo,
 * no la usa en la línea de tiempo.
 */

import type {
  DiagnosisPromptPayload,
  LlmMessage,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  ToolCall,
} from "./provider";
import { parseToolResults, serializeToolResults } from "./provider";
import type { SerializedToolResult } from "./provider";
import type {
  CommitDiff,
  CommitInfo,
  DeployEvent,
  DynatraceProblem,
  ExceptionGroup,
  LogMatch,
  MetricPoint,
} from "../tools/data";
import type { Confidence } from "../core/types";

/** Petición que el motor envía al proveedor en el primer mensaje de usuario. */
export type MockRequestPayload = DiagnosisPromptPayload;

/** Fases de la investigación, en orden. */
const PHASES: string[][] = [
  ["query_exceptions", "query_custom_events", "list_recent_commits"],
  ["query_traces", "query_metrics"],
  ["blame_deploy_window"],
  ["search_logs"],
  ["get_commit_diff"],
  ["dynatrace_problems"],
];

function asObject<T>(value: unknown): T | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value as T;
}

/** Datos observados por el mock a partir de los resultados de herramientas. */
interface Observations {
  exceptions: ExceptionGroup[];
  deploys: DeployEvent[];
  commits: CommitInfo[];
  diffs: Map<string, CommitDiff>;
  logs: LogMatch[];
  metrics: MetricPoint[];
  availability?: number;
  problems: DynatraceProblem[];
  failedTools: string[];
  offline: boolean;
}

/** Extrae de los resultados de herramientas todo lo que el mock puede citar. */
export function collectObservations(results: SerializedToolResult[]): Observations {
  const observations: Observations = {
    exceptions: [],
    deploys: [],
    commits: [],
    diffs: new Map(),
    logs: [],
    metrics: [],
    problems: [],
    failedTools: [],
    offline: false,
  };

  for (const result of results) {
    if (!result.ok) {
      observations.failedTools.push(result.name);
      continue;
    }
    const data = asObject<Record<string, unknown>>(result.data);
    if (!data) {
      continue;
    }
    if (data["mode"] === "offline") {
      observations.offline = true;
    }

    switch (result.name) {
      case "query_exceptions": {
        const rows = Array.isArray(data["rows"]) ? (data["rows"] as ExceptionGroup[]) : [];
        observations.exceptions.push(...rows);
        break;
      }
      case "query_custom_events": {
        const deploys = Array.isArray(data["deploys"]) ? (data["deploys"] as DeployEvent[]) : [];
        observations.deploys.push(...deploys);
        break;
      }
      case "list_recent_commits":
      case "blame_deploy_window": {
        const commits = Array.isArray(data["commits"]) ? (data["commits"] as CommitInfo[]) : [];
        for (const commit of commits) {
          if (!observations.commits.some((known) => known.sha === commit.sha)) {
            observations.commits.push(commit);
          }
        }
        break;
      }
      case "get_commit_diff": {
        const commit = asObject<CommitDiff>(data["commit"]);
        if (commit) {
          observations.diffs.set(commit.sha.toLowerCase(), commit);
        }
        break;
      }
      case "search_logs": {
        const matches = Array.isArray(data["matches"]) ? (data["matches"] as LogMatch[]) : [];
        observations.logs.push(...matches);
        break;
      }
      case "query_metrics": {
        const points = Array.isArray(data["points"]) ? (data["points"] as MetricPoint[]) : [];
        observations.metrics.push(...points);
        const availability = data["availability"];
        if (typeof availability === "number") {
          observations.availability = availability;
        }
        break;
      }
      case "dynatrace_problems": {
        const problems = Array.isArray(data["problems"])
          ? (data["problems"] as DynatraceProblem[])
          : [];
        observations.problems.push(...problems);
        break;
      }
      default:
        break;
    }
  }

  return observations;
}

/** Serializa las observaciones al formato del veredicto (JSON en el contenido). */
function buildAnalysis(
  observations: Observations,
  request: MockRequestPayload | undefined,
): Record<string, unknown> {
  const dominant = [...observations.exceptions].sort(
    (left, right) => right.count - left.count,
  )[0];
  const totalExceptions = observations.exceptions.reduce(
    (sum, exception) => sum + exception.count,
    0,
  );
  const latestDeploy = [...observations.deploys].sort(
    (left, right) => Date.parse(right.deployedAt) - Date.parse(left.deployedAt),
  )[0];
  const deployCommit = latestDeploy
    ? observations.commits.find(
        (commit) => commit.sha.toLowerCase() === latestDeploy.commitSha.toLowerCase(),
      )
    : undefined;

  const uncertainties: string[] = [];
  if (observations.offline) {
    uncertainties.push(
      "Los datos provienen del dataset offline determinista: no hay telemetría real de Application Insights, GitHub ni Dynatrace.",
    );
  }
  if (observations.failedTools.length > 0) {
    uncertainties.push(
      `Herramientas con error durante el diagnóstico: ${observations.failedTools.join(", ")}.`,
    );
  }
  if (!dominant) {
    uncertainties.push(
      "No se observaron excepciones en la ventana consultada: la causa raíz no puede confirmarse con la evidencia disponible.",
    );
  }
  if (latestDeploy && !deployCommit) {
    uncertainties.push(
      `El evento de deploy ${latestDeploy.commitSha.slice(0, 7)} no se pudo cruzar con el historial de commits: no se puede atribuir el cambio a un autor.`,
    );
  }
  uncertainties.push(
    "El análisis se limita a la ventana y a las herramientas consultadas; puede haber señales fuera de ese rango.",
  );

  const summary = dominant
    ? `Se detectaron ${totalExceptions} excepciones de tipo ${dominant.type} en la operación ${
        dominant.operationName || "desconocida"
      } durante la ventana analizada${latestDeploy ? `, tras el deploy ${latestDeploy.commitSha.slice(0, 7)}` : ""}.`
    : "No se detectaron excepciones en la ventana analizada.";

  const rootCause = dominant
    ? latestDeploy
      ? `El deploy ${latestDeploy.commitSha.slice(0, 7)} (${
          deployCommit ? deployCommit.message : "mensaje no disponible"
        }) coincide con el inicio de los errores de tipo ${dominant.type}: ${dominant.outerMessage}`
      : `El error dominante es ${dominant.type}: ${dominant.outerMessage}. No hay evidencia de un deploy que lo preceda.`
    : "Sin evidencia suficiente para determinar la causa raíz.";

  const suspectCommits = deployCommit
    ? [
        {
          sha: deployCommit.sha,
          message: deployCommit.message,
          author: deployCommit.author,
          url: deployCommit.url,
          date: deployCommit.date,
          why: `Commit desplegado (evento Deploy ${latestDeploy?.deployedAt}) justo antes del inicio de los errores observados.`,
          confidence: "high" as Confidence,
        },
      ]
    : [];

  const timeline: Array<Record<string, unknown>> = [];
  if (latestDeploy) {
    timeline.push({
      at: latestDeploy.deployedAt,
      event: `Deploy ${latestDeploy.commitSha.slice(0, 7)} publicado`,
      source: "deploy",
      severity: "warning",
      detail: deployCommit ? deployCommit.message : "commit no disponible en el historial",
    });
  }
  if (dominant) {
    timeline.push({
      at: dominant.firstSeen,
      event: `Primera aparición de ${dominant.type}`,
      source: "kql",
      severity: "error",
      detail: dominant.outerMessage,
    });
    timeline.push({
      at: dominant.lastSeen,
      event: `Última aparición de ${dominant.type}`,
      source: "kql",
      severity: "error",
      detail: `${dominant.count} ocurrencias en la ventana`,
    });
  }
  const firstLog = observations.logs[0];
  if (firstLog) {
    timeline.push({
      at: firstLog.timestamp,
      event: `Log de ${firstLog.operationName || "aplicación"}: ${firstLog.message.slice(0, 80)}`,
      source: "logs",
      severity: "warning",
    });
  }
  const problem = observations.problems[0];
  if (problem) {
    timeline.push({
      at: problem.startTime,
      event: `Problema Dynatrace ${problem.id}: ${problem.title}`,
      source: "dynatrace",
      severity: "error",
    });
  }

  const recommendations: string[] = [];
  if (deployCommit) {
    recommendations.push(
      `Revisar y revertir si procede el commit ${deployCommit.sha.slice(0, 7)} (${deployCommit.message}).`,
    );
  }
  if (dominant?.type.includes("SqlException")) {
    recommendations.push(
      "Verificar la cadena de conexión y la resolución DNS del host de base de datos en la configuración de la Function App.",
    );
  }
  recommendations.push(
    request
      ? `Confirmar con el equipo de ${request.service} si hubo cambios de configuración en la ventana analizada.`
      : "Confirmar con el equipo de plataforma si hubo cambios de configuración en la ventana analizada.",
  );
  if (observations.availability !== undefined) {
    recommendations.push(
      `Vigilar la disponibilidad (${(observations.availability * 100).toFixed(2)}%) hasta confirmar la recuperación.`,
    );
  }

  const confidence: Confidence = dominant && deployCommit ? "high" : dominant ? "medium" : "low";

  return {
    summary,
    rootCause,
    confidence,
    suspectCommits,
    timeline,
    recommendations,
    uncertainties,
  };
}

/** Proveedor de LLM determinista para tests y modo offline. */
export class MockLlmProvider implements LlmProvider {
  public readonly name = "mock";

  public async complete(req: LlmRequest): Promise<LlmResponse> {
    const results = collectConversationResults(req.messages);
    const request = readRequestPayload(req.messages);
    const observations = collectObservations(results);
    const available = new Set(req.tools.map((tool) => tool.name));
    const called = new Set(results.map((result) => result.name));

    const nextCalls = this.nextToolCalls(req, observations, available, called, request);
    if (nextCalls.length > 0) {
      return {
        content: "",
        toolCalls: nextCalls,
      };
    }

    const analysis = buildAnalysis(observations, request);
    return {
      content: JSON.stringify(analysis),
      toolCalls: [],
    };
  }

  private nextToolCalls(
    req: LlmRequest,
    observations: Observations,
    available: Set<string>,
    called: Set<string>,
    request: MockRequestPayload | undefined,
  ): ToolCall[] {
    for (const phase of PHASES) {
      const pending = phase.filter((tool) => available.has(tool) && !called.has(tool));
      if (pending.length === 0) {
        continue;
      }
      const calls: ToolCall[] = [];
      for (const tool of pending) {
        if (tool === "get_commit_diff") {
          const sha = this.deploySha(observations);
          if (!sha) {
            continue;
          }
          calls.push({ id: `call-${tool}-${sha.slice(0, 7)}`, name: tool, args: { sha } });
          continue;
        }
        if (tool === "search_logs") {
          const needle = this.logNeedle(observations, request);
          if (!needle) {
            continue;
          }
          calls.push({ id: `call-${tool}-1`, name: tool, args: { query: needle } });
          continue;
        }
        calls.push({ id: `call-${tool}-${calls.length + 1}`, name: tool, args: {} });
      }
      if (calls.length > 0) {
        return calls;
      }
    }
    return [];
  }

  /** SHA observado en el evento de deploy (nunca inventado). */
  private deploySha(observations: Observations): string | undefined {
    const latest = [...observations.deploys].sort(
      (left, right) => Date.parse(right.deployedAt) - Date.parse(left.deployedAt),
    )[0];
    if (!latest) {
      return undefined;
    }
    const known = observations.commits.find(
      (commit) => commit.sha.toLowerCase() === latest.commitSha.toLowerCase(),
    );
    return known?.sha ?? latest.commitSha;
  }

  /** Texto a buscar en los logs: el síntoma si es usable o el error dominante. */
  private logNeedle(
    observations: Observations,
    request: MockRequestPayload | undefined,
  ): string | undefined {
    const symptom = request?.symptom?.trim();
    if (symptom && symptom.length >= 2 && symptom.length <= 40 && !symptom.includes(" ")) {
      return symptom;
    }
    const dominant = [...observations.exceptions].sort(
      (left, right) => right.count - left.count,
    )[0];
    if (dominant) {
      const firstWord = dominant.outerMessage.split(/\s+/).find((word) => word.length > 4);
      if (firstWord) {
        const cleaned = firstWord.replace(/[^a-zA-Z0-9._-]/g, "");
        if (cleaned.length >= 2) {
          return cleaned;
        }
      }
    }
    const log = observations.logs[0];
    const firstToken = log?.message.split(/\s+/)[0];
    return firstToken && firstToken.length >= 2 ? firstToken : undefined;
  }
}

/** Lee la petición de diagnóstico del primer mensaje de usuario. */
export function readRequestPayload(messages: LlmMessage[]): MockRequestPayload | undefined {
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }
    const match = /<request>([\s\S]*?)<\/request>/.exec(message.content);
    if (!match?.[1]) {
      continue;
    }
    const request = asObject<MockRequestPayload>(tryParseJson(match[1]));
    if (request && typeof request.service === "string") {
      return request;
    }
  }
  return undefined;
}

/** Acumula los resultados de herramientas de toda la conversación. */
export function collectConversationResults(messages: LlmMessage[]): SerializedToolResult[] {
  const results: SerializedToolResult[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      results.push(...parseToolResults(message.content));
    }
  }
  return results;
}

function tryParseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

/**
 * Crea el mensaje de usuario con los resultados de herramientas.
 */
export function buildToolResultsMessage(results: SerializedToolResult[]): LlmMessage {
  return {
    role: "user",
    content: serializeToolResults(results),
  };
}
