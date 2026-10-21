/**
 * Fixtures de prueba alineados con CONTRACTS.md §1 y §2.
 * No contienen secretos ni datos reales: son sintéticos.
 */
import type {
  IncidentSummary,
  StreamEvent,
  Verdict,
} from "../types/contract";

export const sampleVerdict: Verdict = {
  incidentId: "INC-2026-0142",
  service: "checkout-api",
  environment: "production",
  generatedAt: "2026-10-20T08:42:11.000Z",
  summary:
    "El servicio checkout-api devuelve HTTP 500 desde las 08:31 UTC tras el despliegue del commit a3f21bc.",
  rootCause:
    "El despliegue a3f21bc sustituyó la variable de entorno de la cadena de conexión de Postgres por un valor vacío, de modo que el pool de conexiones falla al abrirse en el primer request.",
  confidence: "high",
  suspectCommits: [
    {
      sha: "a3f21bc",
      message: "chore(config): rotar credenciales de la base de datos",
      author: "ana.garcia",
      url: "https://github.com/example/checkout-api/commit/a3f21bc",
      date: "2026-10-20T08:29:02.000Z",
      why: "Coincide con el inicio de la incidencia y toca la configuración de la conexión.",
      confidence: "high",
    },
    {
      sha: "7bd0e15",
      message: "feat(checkout): reintentos exponenciales en el pago",
      author: "marc.ruiz",
      url: "https://github.com/example/checkout-api/commit/7bd0e15",
      date: "2026-10-19T17:05:44.000Z",
      why: "Anterior al despliegue, pero aumenta el número de reintentos y el impacto.",
      confidence: "medium",
    },
  ],
  timeline: [
    {
      at: "2026-10-20T08:29:02.000Z",
      event: "Deploy del commit a3f21bc completado",
      source: "deploy",
      severity: "warning",
      detail: "customEvent Deploy con commit_sha=a3f21bc",
    },
    {
      at: "2026-10-20T08:31:10.000Z",
      event: "Primera excepción NullReferenceException en la capa de persistencia",
      source: "kql",
      severity: "error",
      detail: "exceptions | where operation_Name == 'Checkout'",
    },
    {
      at: "2026-10-20T08:36:00.000Z",
      event: "Tasa de error por encima del 40 % durante 5 minutos",
      source: "kql",
      severity: "critical",
      detail: "customMetrics · availability por minuto",
    },
    {
      at: "2026-10-20T08:38:20.000Z",
      event: "Regla de alerta «más de 5 excepciones en 5 minutos» disparada",
      source: "system",
      severity: "critical",
    },
    {
      at: "2026-10-20T08:42:11.000Z",
      event: "SRE Copilot emite el veredicto del incidente",
      source: "llm",
      severity: "info",
    },
  ],
  evidence: [
    {
      id: "EV-001",
      kind: "exception",
      title: "NullReferenceException al abrir el pool de conexiones",
      detail:
        "41 excepciones en 6 minutos. Todas con la misma traza: System.Data.SqlClient.SqlConnection.Open() con connectionString vacío.",
      source:
        "exceptions\n| where timestamp > ago(30m)\n| summarize count() by type, outerMessage",
      observedAt: "2026-10-20T08:37:15.000Z",
    },
    {
      id: "EV-002",
      kind: "deploy",
      title: "customEvent Deploy con commit a3f21bc",
      detail:
        "El evento de despliegue incluye commit_sha=a3f21bc y se emitió 2 minutos antes del primer error.",
      source:
        "customEvents\n| where name == \"Deploy\"\n| top 1 by timestamp desc",
      observedAt: "2026-10-20T08:29:02.000Z",
    },
    {
      id: "EV-003",
      kind: "commit",
      title: "El commit a3f21bc toca la configuración de la base de datos",
      detail:
        "El diff modifica el fichero appsettings de producción y rotura la variable DATABASE_CONNECTION_STRING.",
      source: "https://github.com/example/checkout-api/commit/a3f21bc",
    },
    {
      id: "EV-004",
      kind: "diff",
      title: "src/config/database.ts (+1/-1)",
      detail:
        "@@ -12,7 +12,7 @@ export function databaseUrl(): string {\n-  return process.env.DATABASE_URL ?? 'postgres://localhost:5432/mydb';\n+  return process.env.DATABASE_URL ?? 'postgres://wrong-host:5432/mydb';\n }",
      source: "https://github.com/example/checkout-api/commit/a3f21bc",
      observedAt: "2026-10-20T08:29:02.000Z",
    },
  ],
  recommendations: [
    "Revertir el commit a3f21bc o volver a fijar DATABASE_CONNECTION_STRING en el App Service.",
    "Añadir un health check de arranque que valide la conexión a la base de datos.",
    "Activar la alerta por tasa de error de Checkout para acotar la detección.",
  ],
  uncertainties: [
    "No se ha podido inspeccionar el estado real de la variable de entorno en el App Service.",
    "El repositorio solo expone los commits de los últimos 30 días; podría haber un cambio anterior.",
  ],
  relatedIncidents: [
    {
      id: "INC-2026-0097",
      title: "checkout-api devolvía 502 tras un despliegue",
      similarity: 0.78,
      service: "checkout-api",
    },
    {
      id: "INC-2026-0203",
      title: "Latencia de Checkout por encima de SLO",
      similarity: 0.41,
      service: "checkout-api",
    },
  ],
  toolCalls: [
    {
      tool: "query_exceptions",
      args: { operationName: "Checkout", windowMinutes: 30 },
      durationMs: 412,
      ok: true,
    },
    {
      tool: "query_custom_events",
      args: { name: "Deploy" },
      durationMs: 233,
      ok: true,
    },
    {
      tool: "list_recent_commits",
      args: { service: "checkout-api" },
      durationMs: 890,
      ok: true,
    },
    {
      tool: "get_commit_diff",
      args: { sha: "a3f21bc" },
      durationMs: 1204,
      ok: true,
    },
  ],
};

export const sampleIncidents: IncidentSummary[] = [
  {
    id: "INC-2026-0142",
    service: "checkout-api",
    generatedAt: "2026-10-20T08:42:11.000Z",
    summary: "HTTP 500 en checkout-api tras el despliegue a3f21bc.",
    rootCause: "Cadena de conexión de Postgres vacía tras el despliegue.",
    confidence: "high",
    feedback: "correct",
    tags: ["checkout", "database", "deploy"],
  },
  {
    id: "INC-2026-0139",
    service: "inventory-api",
    generatedAt: "2026-10-19T21:03:44.000Z",
    summary: "Latencia p95 por encima de 2 s en inventory-api.",
    rootCause: "N+1 en el acceso al catálogo de productos.",
    confidence: "medium",
    tags: ["inventory", "latency"],
  },
];

export const streamEvents: StreamEvent[] = [
  {
    type: "meta",
    incidentId: "INC-2026-0150",
    service: "checkout-api",
    startedAt: "2026-10-20T09:00:00.000Z",
  },
  {
    type: "plan",
    steps: ["Consultar excepciones", "Buscar el deploy reciente", "Cruzar con GitHub"],
    hypothesis: "El error 500 empezó tras un despliegue reciente.",
  },
  { type: "tool_call", tool: "query_exceptions", args: { windowMinutes: 30 } },
  {
    type: "tool_result",
    tool: "query_exceptions",
    ok: true,
    durationMs: 412,
    summary: "41 excepciones agrupadas por tipo",
  },
  {
    type: "evidence",
    evidence: {
      id: "EV-001",
      kind: "exception",
      title: "NullReferenceException en persistencia",
      detail: "41 excepciones en 6 minutos.",
      source: "exceptions | summarize count() by type",
    },
  },
  { type: "tool_call", tool: "search_logs", args: { query: "connection" } },
  {
    type: "tool_result",
    tool: "search_logs",
    ok: false,
    durationMs: 95,
    summary: "La búsqueda de logs agotó el tiempo de espera.",
  },
  { type: "verdict", verdict: sampleVerdict },
  { type: "done", elapsedMs: 8240 },
];
