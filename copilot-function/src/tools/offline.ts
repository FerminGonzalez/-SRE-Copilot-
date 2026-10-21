/**
 * Dataset sintético determinista para el modo offline.
 *
 * Cuando no hay credenciales (o en los tests) las herramientas no pueden
 * llamar a Application Insights, GitHub ni Dynatrace. En lugar de fallar,
 * devuelven un incidente coherente y **reproducible**: la misma
 * (servicio, entorno, ventana, instante) produce siempre los mismos datos.
 *
 * Esto permite:
 * - ejecutar el copilot entero sin nube,
 * - testear el bucle agentic y el veredicto de forma estable,
 * - que las herramientas sean coherentes entre sí (el commit del deploy es
 *   exactamente el commit que devuelve `list_recent_commits`).
 */

import type { ToolContext } from "../core/types";
import type {
  CommitDiff,
  CommitFile,
  CommitInfo,
  DependencyFailure,
  DeployEvent,
  DynatraceProblem,
  ExceptionGroup,
  LogMatch,
  MetricPoint,
  RequestLatencyRow,
} from "./data";

/** Hash FNV-1a de 32 bits: rápido, estable y sin dependencias. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** PRNG mulberry32: determinista a partir de una semilla numérica. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** SHA hexadecimal determinista (40 caracteres, formato git). */
function fakeSha(random: () => number): string {
  let sha = "";
  for (let index = 0; index < 40; index += 1) {
    sha += Math.floor(random() * 16).toString(16);
  }
  return sha;
}

/** Conjunto completo de datos sintéticos de un incidente. */
export interface OfflineDataset {
  seed: string;
  exceptions: ExceptionGroup[];
  deploys: DeployEvent[];
  commits: CommitInfo[];
  diffs: Map<string, CommitDiff>;
  logs: LogMatch[];
  metrics: MetricPoint[];
  requests: RequestLatencyRow[];
  dependencies: DependencyFailure[];
  problems: DynatraceProblem[];
  availability: number;
  errorRate: number;
}

const AUTHORS = ["marta.gil", "juan.perez", "dana.ops", "svc-release"] as const;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Construye el dataset sintético del incidente.
 *
 * @param ctx Contexto de la herramienta (mismo `now` durante todo el diagnóstico).
 */
export function buildOfflineDataset(ctx: ToolContext): OfflineDataset {
  const seed = `${ctx.service}|${ctx.environment}|${ctx.windowMinutes}|${ctx.now.toISOString()}`;
  const random = mulberry32(fnv1a(seed));
  const nowMs = ctx.now.getTime();
  const windowMs = ctx.windowMinutes * 60_000;

  // El deploy ocurre dentro de la ventana: es la causacandidate por defecto.
  const deployOffset = Math.max(2, Math.round(ctx.windowMinutes * 0.55));
  const deployMs = nowMs - deployOffset * 60_000;
  const firstErrorMs = deployMs + 45_000;

  const deploySha = fakeSha(random);
  const previousSha = fakeSha(random);
  const olderSha = fakeSha(random);

  const deployAuthor = AUTHORS[Math.floor(random() * AUTHORS.length)] ?? AUTHORS[0];
  const previousAuthor = AUTHORS[Math.floor(random() * AUTHORS.length)] ?? AUTHORS[1];

  const deploys: DeployEvent[] = [
    {
      commitSha: deploySha,
      deployedAt: iso(deployMs),
      version: `v1.${Math.floor(random() * 9) + 1}.${Math.floor(random() * 20)}`,
      author: deployAuthor,
      message: "chore(config): update database connection settings",
    },
  ];

  const commits: CommitInfo[] = [
    {
      sha: deploySha,
      message: "chore(config): update database connection settings",
      author: deployAuthor,
      date: iso(deployMs),
      url: `https://github.com/${ctx.service}/api/commit/${deploySha}`,
    },
    {
      sha: previousSha,
      message: "feat(checkout): add idempotency key to payment request",
      author: previousAuthor,
      date: iso(deployMs - 3 * 60 * 60_000),
      url: `https://github.com/${ctx.service}/api/commit/${previousSha}`,
    },
    {
      sha: olderSha,
      message: "test: cover inventory retries",
      author: AUTHORS[3],
      date: iso(deployMs - 26 * 60 * 60_000),
      url: `https://github.com/${ctx.service}/api/commit/${olderSha}`,
    },
  ];

  const configPatch = [
    "@@ -12,7 +12,7 @@ export function databaseUrl(): string {",
    "-  return process.env.DATABASE_URL ?? 'postgres://localhost:5432/mydb';",
    "+  return process.env.DATABASE_URL ?? 'postgres://wrong-host:5432/mydb';",
    " }",
  ].join("\n");

  const files: CommitFile[] = [
    {
      filename: "src/config/database.ts",
      status: "modified",
      additions: 1,
      deletions: 1,
      patch: configPatch,
    },
    {
      filename: ".env.production",
      status: "modified",
      additions: 2,
      deletions: 0,
      patch:
        "@@ -3,2 +3,4 @@\n+DATABASE_HOST=wrong-host\n+DATABASE_PORT=5432",
    },
  ];

  const diffs = new Map<string, CommitDiff>();
  for (const commit of commits) {
    diffs.set(
      commit.sha,
      commit.sha === deploySha
        ? { ...commit, files }
        : {
            ...commit,
            files: [
              {
                filename: "src/checkout/payment.ts",
                status: "modified",
                additions: 14,
                deletions: 3,
                patch: "@@ -40,3 +40,14 @@ export async function charge(...) {",
              },
            ],
          },
    );
  }

  const exceptions: ExceptionGroup[] = [
    {
      type: "System.Data.SqlClient.SqlException",
      outerMessage:
        "Connection refused to wrong-host:5432. Connection string points to an unreachable host.",
      operationName: "Checkout",
      count: 37 + Math.floor(random() * 11),
      firstSeen: iso(firstErrorMs),
      lastSeen: iso(nowMs - 20_000),
    },
    {
      type: "System.InvalidOperationException",
      outerMessage: "Object reference not set to an instance of an object (payment gateway response).",
      operationName: "Payment",
      count: 6 + Math.floor(random() * 5),
      firstSeen: iso(firstErrorMs + 90_000),
      lastSeen: iso(nowMs - 45_000),
    },
    {
      type: "System.TimeoutException",
      outerMessage: "The operation has timed out after 30000ms calling dependency 'inventory-service'.",
      operationName: "Inventory",
      count: 2 + Math.floor(random() * 3),
      firstSeen: iso(firstErrorMs + 4 * 60_000),
      lastSeen: iso(nowMs - 90_000),
    },
  ];

  const requests: RequestLatencyRow[] = [
    { name: "GET /api/checkout", count: 214, failures: 41, p50: 128, p95: 1480 },
    { name: "GET /api/payment", count: 132, failures: 11, p50: 96, p95: 640 },
    { name: "GET /api/inventory", count: 88, failures: 4, p50: 74, p95: 311 },
    { name: "GET /api/catalog", count: 305, failures: 0, p50: 41, p95: 120 },
  ];

  const dependencies: DependencyFailure[] = [
    {
      target: "wrong-host:5432",
      type: "SQL",
      failures: 38,
      message: "Connection refused (wrong-host:5432) after 30000ms",
    },
    {
      target: "inventory-service",
      type: "Http",
      failures: 4,
      message: "Request timed out after 30000ms",
    },
  ];

  const logs: LogMatch[] = [
    {
      timestamp: iso(firstErrorMs),
      severityLevel: 3,
      message: "checkout failed: could not open connection to wrong-host:5432",
      operationName: "Checkout",
    },
    {
      timestamp: iso(firstErrorMs + 30_000),
      severityLevel: 3,
      message: "connection string resolves to DATABASE_HOST=wrong-host",
      operationName: "Checkout",
    },
    {
      timestamp: iso(firstErrorMs + 120_000),
      severityLevel: 2,
      message: "payment gateway returned no body after deploying v1.4.3",
      operationName: "Payment",
    },
    {
      timestamp: iso(firstErrorMs + 300_000),
      severityLevel: 3,
      message: "checkout failed: could not open connection to wrong-host:5432",
      operationName: "Checkout",
    },
  ];

  const metrics: MetricPoint[] = [];
  const bucketCount = Math.min(ctx.windowMinutes, 30);
  const stepMs = Math.max(60_000, Math.floor(windowMs / Math.max(1, bucketCount)));
  for (let index = bucketCount - 1; index >= 0; index -= 1) {
    const bucketMs = nowMs - index * stepMs;
    const afterDeploy = bucketMs >= deployMs;
    const count = 20 + Math.floor(random() * 12);
    const errors = afterDeploy ? 4 + Math.floor(random() * 7) : Math.floor(random() * 2);
    metrics.push({
      bucket: iso(bucketMs),
      count,
      errors,
      errorRate: Number((errors / count).toFixed(3)),
      avgDuration: afterDeploy ? 210 + Math.floor(random() * 180) : 80 + Math.floor(random() * 40),
      p95: afterDeploy ? 1200 + Math.floor(random() * 700) : 180 + Math.floor(random() * 90),
    });
  }

  const problems: DynatraceProblem[] = [
    {
      id: `DT-${Math.floor(random() * 90000) + 10000}`,
      title: `Error rate above threshold in ${ctx.service}`,
      status: "OPEN",
      severity: "AVAILABILITY_ERROR",
      impact: "Checkout conversion degraded for 12% of sessions",
      startTime: iso(deployMs + 30_000),
    },
  ];

  const totalRequests = requests.reduce((sum, row) => sum + row.count, 0);
  const totalFailures = requests.reduce((sum, row) => sum + row.failures, 0);

  return {
    seed,
    exceptions,
    deploys,
    commits,
    diffs,
    logs,
    metrics,
    requests,
    dependencies,
    problems,
    availability: Number((1 - totalFailures / Math.max(1, totalRequests)).toFixed(4)),
    errorRate: Number((totalFailures / Math.max(1, totalRequests)).toFixed(4)),
  };
}
