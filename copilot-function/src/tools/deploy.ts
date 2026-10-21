/**
 * Correlación de despliegues (deploy ↔ errores ↔ commits).
 *
 * Este módulo no es una herramienta del contrato §3: es la capa de *razonamiento*
 * que usa el motor para decidir qué commits son sospechosos y por qué.
 * Vive en `src/tools/` porque trabaja con los mismos payloads que las
 * herramientas (`src/tools/data.ts`).
 */

import type { SuspectCommit, Confidence } from "../core/types";
import type { CommitDiff, CommitInfo, DeployEvent, ExceptionGroup } from "./data";

/** Resultado de correlacionar un deploy con las excepciones y los commits. */
export interface DeployCorrelation {
  /** Último deploy conocido. */
  deploy?: DeployEvent;
  /** Minutos transcurridos entre el deploy y el primer error. */
  minutesToFirstError?: number;
  /** Commits publicados dentro de la ventana del incidente. */
  commitsInWindow: CommitInfo[];
  /** Commits sospechosos ordenados por probabilidad. */
  suspectCommits: SuspectCommit[];
}

/** Devuelve el deploy más reciente de la lista. */
export function selectLatestDeploy(deploys: DeployEvent[]): DeployEvent | undefined {
  return [...deploys].sort(
    (left, right) => Date.parse(right.deployedAt) - Date.parse(left.deployedAt),
  )[0];
}

/** Minutos (con signo) entre dos instantes ISO. */
export function minutesBetween(from: string, to: string): number {
  const delta = Date.parse(to) - Date.parse(from);
  return Math.round(delta / 60_000);
}

/** Commits publicados dentro de `[since, until]`. */
export function commitsWithinWindow(
  commits: CommitInfo[],
  since: string,
  until: string,
): CommitInfo[] {
  const from = Date.parse(since);
  const to = Date.parse(until);
  return commits.filter((commit) => {
    const date = Date.parse(commit.date);
    return date >= from && date <= to;
  });
}

/** Agrupa las excepciones por tipo y devuelve el primer momento con errores. */
export function firstErrorAt(exceptions: ExceptionGroup[]): string | undefined {
  const times = exceptions
    .map((exception) => Date.parse(exception.firstSeen))
    .filter((time) => Number.isFinite(time))
    .sort((left, right) => left - right);
  const first = times[0];
  return first === undefined ? undefined : new Date(first).toISOString();
}

/** Total de excepciones registradas. */
export function totalExceptionCount(exceptions: ExceptionGroup[]): number {
  return exceptions.reduce((sum, exception) => sum + exception.count, 0);
}

/** Opciones de la correlación. */
export interface CorrelateOptions {
  deploys: DeployEvent[];
  commits: CommitInfo[];
  exceptions: ExceptionGroup[];
  diffs?: Map<string, CommitDiff>;
  since: string;
  until: string;
}

/**
 * Correlaciona el último deploy con el inicio de los errores y con el
 * historial de commits para producir los commits sospechosos.
 *
 * Reglas (deterministas, sin LLM):
 * - El commit del deploy es sospechoso si los errores empiezan **después** del deploy.
 * - Los demás commits de la ventana son sospechosos de forma más débil.
 * - La confianza baja si no hay excepciones o si el deploy es anterior a la ventana.
 */
export function correlateDeploy(options: CorrelateOptions): DeployCorrelation {
  const deploy = selectLatestDeploy(options.deploys);
  const commitsInWindow = commitsWithinWindow(options.commits, options.since, options.until);
  const errorStart = firstErrorAt(options.exceptions);
  const exceptionCount = totalExceptionCount(options.exceptions);

  const minutesToFirstError =
    deploy && errorStart ? minutesBetween(deploy.deployedAt, errorStart) : undefined;

  const suspectCommits: SuspectCommit[] = [];

  if (deploy) {
    const deployCommit = options.commits.find(
      (commit) => commit.sha.toLowerCase() === deploy.commitSha.toLowerCase(),
    );
    const errorsAfterDeploy =
      minutesToFirstError !== undefined && minutesToFirstError >= 0 && minutesToFirstError <= 30;

    if (deployCommit) {
      const diff = options.diffs?.get(deployCommit.sha.toLowerCase());
      const files = diff?.files.map((file) => file.filename).join(", ");
      const why = errorsAfterDeploy
        ? `Es el commit desplegado ${Math.abs(minutesToFirstError ?? 0)} min antes del inicio de los errores (${exceptionCount} excepciones)${files ? `; toca ${files}` : ""}.`
        : `Es el último deploy conocido${files ? `; toca ${files}` : ""}, pero no hay evidencia de que los errores empiecen después.`;
      suspectCommits.push({
        sha: deployCommit.sha,
        message: deployCommit.message,
        author: deployCommit.author,
        url: deployCommit.url,
        date: deployCommit.date,
        why,
        confidence: errorsAfterDeploy ? "high" : "low",
      });
    }
  }

  for (const commit of commitsInWindow) {
    if (suspectCommits.some((suspect) => suspect.sha === commit.sha)) {
      continue;
    }
    const diff = options.diffs?.get(commit.sha.toLowerCase());
    const files = diff?.files.map((file) => file.filename).join(", ");
    suspectCommits.push({
      sha: commit.sha,
      message: commit.message,
      author: commit.author,
      url: commit.url,
      date: commit.date,
      why: `Publicado dentro de la ventana del incidente${files ? `; toca ${files}` : ""}.`,
      confidence: "medium",
    });
  }

  return {
    ...(deploy ? { deploy } : {}),
    ...(minutesToFirstError !== undefined ? { minutesToFirstError } : {}),
    commitsInWindow,
    suspectCommits,
  };
}

/** Traduce una confianza a su etiqueta en castellano. */
export function confidenceLabel(confidence: Confidence): string {
  switch (confidence) {
    case "high":
      return "alta";
    case "medium":
      return "media";
    default:
      return "baja";
  }
}
