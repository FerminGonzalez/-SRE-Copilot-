# Contratos de la plataforma SRE Copilot

Este documento fija las interfaces entre los componentes. **Todos los componentes deben cumplirlo
exactamente** para que encajen. Si necesitas cambiar algo, dilo en tu informe en lugar de desviarte.

---

## 1. Diagnóstico: esquema del veredicto

Compartido por `copilot-function` (productor) y `frontend` (consumidor).

```ts
export type Confidence = "high" | "medium" | "low";

export interface Verdict {
  incidentId: string;
  service: string;
  environment: string;
  generatedAt: string;              // ISO 8601
  summary: string;                  // 1-2 frases: qué se rompió
  rootCause: string;                // causa raíz técnica
  confidence: Confidence;
  suspectCommits: SuspectCommit[];
  timeline: TimelineEvent[];
  evidence: EvidenceItem[];
  recommendations: string[];
  uncertainties: string[];          // límites explícitos del análisis
  relatedIncidents: RelatedIncident[];
  toolCalls: ToolCallRecord[];
}

export interface SuspectCommit {
  sha: string;                      // 7-40 hex
  message: string;
  author: string;
  url: string;
  date: string;                     // ISO 8601
  why: string;                      // por qué se suspiciona
  confidence: Confidence;
}

export interface TimelineEvent {
  at: string;                       // ISO 8601
  event: string;
  source: "kql" | "github" | "deploy" | "dynatrace" | "logs" | "llm" | "system";
  severity: "info" | "warning" | "error" | "critical";
  detail?: string;
}

export interface EvidenceItem {
  id: string;                       // "EV-001"
  kind: "exception" | "trace" | "metric" | "commit" | "diff" | "deploy" | "log" | "correlation";
  title: string;
  detail: string;
  source: string;                   // consulta KQL, URL, o ruta del artefacto
  observedAt?: string;              // ISO 8601
}

export interface RelatedIncident {
  id: string;
  title: string;
  similarity: number;               // 0.0 - 1.0
  service?: string;
}

export interface ToolCallRecord {
  tool: string;
  args: Record<string, unknown>;
  durationMs: number;
  ok: boolean;
  error?: string;
}
```

## 2. API HTTP de `copilot-function`

Prefijo: `/api`. La Function App expone todas las rutas en el mismo host.

| Método | Ruta | Cuerpo / Query | Respuesta |
|---|---|---|---|
| `POST` | `/api/diagnose` | `{ service: string; environment?: string; windowMinutes?: number; symptom?: string; appVersion?: string; incidentId?: string }` | **SSE** (`text/event-stream`) |
| `GET` | `/api/incidents` | `?service=&limit=` | `{ incidents: IncidentSummary[] }` |
| `GET` | `/api/incidents/:id` | — | `{ incident: Verdict }` |
| `POST` | `/api/incidents/:id/feedback` | `{ verdict: "correct" \| "partially" \| "incorrect"; note?: string }` | `{ ok: true; incidentId: string }` |
| `GET` | `/api/health` | — | `{ ok: boolean; version: string; llm: string; tools: string[]; ragAvailable: boolean }` |
| `GET` | `/api/tools` | — | `{ tools: Array<{ name: string; description: string; parameters: object }> }` |

### Eventos SSE de `POST /api/diagnose`

Cada evento es `data: <json>\n\n`. El campo `type` lo distingue:

```ts
type StreamEvent =
  | { type: "meta"; incidentId: string; service: string; startedAt: string }
  | { type: "plan"; steps: string[]; hypothesis: string }
  | { type: "tool_call"; tool: string; args: Record<string, unknown> }
  | { type: "tool_result"; tool: string; ok: boolean; durationMs: number; summary: string; data?: unknown }
  | { type: "evidence"; evidence: EvidenceItem }
  | { type: "verdict"; verdict: Verdict }
  | { type: "error"; message: string; detail?: string }
  | { type: "done"; elapsedMs: number };
```

El evento `verdict` es el último antes de `done`. El cliente debe poder pintar la interfaz solo con
`meta`, `plan`, `tool_call`, `tool_result`, `evidence` y, al final, `verdict`.

## 3. Interfaz de herramienta (superficie del LLM)

```ts
export interface ToolContext {
  now: Date;
  windowMinutes: number;
  service: string;
  environment: string;
  appVersion?: string;
}

export interface Tool {
  name: string;                     // snake_case, p.ej. "query_exceptions"
  description: string;              // una frase; se inyecta en el prompt del LLM
  parameters: Record<string, unknown>; // JSON Schema (object)
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolResult {
  ok: boolean;
  summary: string;                  // 1 línea para el LLM
  data?: unknown;                   // payload estructurado
  error?: string;
  durationMs: number;
}
```

Herramientas obligatorias (nombres exactos):

| `name` | Qué hace |
|---|---|
| `query_exceptions` | KQL sobre `exceptions`: agrupa por tipo y mensaje, cuenta y ventana temporal |
| `query_traces` | KQL sobre `requests`/`dependencies`: latencia p50/p95, dependencias con error |
| `query_custom_events` | KQL sobre `customEvents`: busca `name == "Deploy"` y devuelve `commit_sha` |
| `query_metrics` | KQL sobre `customMetrics`: disponibilidad y tasa de error por minuto |
| `list_recent_commits` | Commits recientes del repo/servicio vía GitHub API |
| `get_commit_diff` | Diff de un commit (archivos y cambios) |
| `blame_deploy_window` | Commits dentro de la ventana del incidente |
| `search_logs` | Búsqueda de texto libre en trazas/logs de la ventana |
| `dynatrace_problems` | Problemas abiertos en Dynatrace para el servicio |

## 4. Capa LLM

```ts
export interface LlmMessage { role: "system" | "user" | "assistant"; content: string; toolCalls?: ToolCall[] }
export interface ToolCall { id: string; name: string; args: Record<string, unknown> }

export interface LlmProvider {
  name: string;                     // "azure-openai" | "anthropic" | "mock"
  complete(req: {
    messages: LlmMessage[];
    tools: Array<{ name: string; description: string; parameters: unknown }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ content: string; toolCalls: ToolCall[]; raw?: unknown }>;
}
```

Proveedores a implementar en `src/llm/`:
- `azure-openai.ts` — usa `@azure/openai` (SDK v1) con **tool calling**.
- `anthropic.ts` — usa la API Messages de Anthropic con tool use.
- `mock.ts` — **determinista**, sin red. Es el que usan los tests y el modo offline. Debe producir un
  veredicto coherente con la evidencia que recibe (nunca inventar commits que no estén en las tools).

**Selección del proveedor por entorno:** `LLM_PROVIDER=azure-openai | anthropic | mock` (por defecto `mock`).

## 5. Memoria de incidentes (RAG)

```ts
export interface IncidentSummary {
  id: string; service: string; generatedAt: string;
  summary: string; rootCause: string; confidence: Confidence;
  feedback?: "correct" | "partially" | "incorrect";
  tags: string[];
}
```

- Debe funcionar **sin Azure AI Search** (fallback local con búsqueda por tokens + similitud coseno sobre
  embeddings deterministas) para que el repo se pueda ejecutar y testear sin cloud.
- Si `AZURE_SEARCH_ENDPOINT` está definido, usa AI Search.

## 6. MCP

`copilot-function` expone un **servidor MCP (stdio)** en `src/mcp/server.ts` que publica las herramientas
de §3 con sus esquemas JSON Schema. Debe poder arrancarse con:

```bash
npm run mcp        # node dist/mcp/server.js
```

## 7. Backend (API de demostración con errores instrumentados)

Node + TypeScript. Sirve para *generar* el incidente que el copilot diagnostica.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | health del backend |
| `GET` | `/api/catalog` | productos y stock |
| `GET` | `/api/checkout` | operationName `Checkout` |
| `GET` | `/api/payment` | operationName `Payment` |
| `GET` | `/api/inventory` | operationName `Inventory` |
| `GET` | `/api/chaos` | activa/desactiva un fallo (para la demo) |

Requisitos:
- Instrumentación de OpenTelemetry con exportador de Application Insights (o consola si no hay
  `APPLICATIONINSIGHTS_CONNECTION_STRING`).
- Fallos **deterministas y reproducibles**: el modo de fallo se fija por variable de entorno
  (`FAILURE_MODE=none|database|misconfig|dependency`) y se registra en el log de la petición.
- Cada respuesta debe incluir el `operation_Name` para que las consultas KQL del copilot la encuentren.

## 8. Frontend (dashboard)

React + Vite + TypeScript. Sin dependencias pesadas.

Pantallas:
1. **Incidentes** — lista de diagnósticos (endpoint `/api/incidents` del copilot, con URL configurable
   por `VITE_COPILOT_URL`).
2. **Diagnóstico en vivo** — dispara `POST /api/diagnose` y consume el SSE mostrando, en orden: plan,
   llamadas a herramientas con su duración, evidencia acumulada y el veredicto final.
3. **Veredicto** — tarjetas de causa raíz, commits sospechosos (con diff), timeline, evidencia, límites y
   recomendaciones, y un control para enviar feedback (`POST /api/incidents/:id/feedback`).

## 9. Variables de entorno

| Variable | Componente | Default |
|---|---|---|
| `LLM_PROVIDER` | copilot-function | `mock` |
| `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_DEPLOYMENT` | copilot-function | — |
| `ANTHROPIC_API_KEY` | copilot-function | — |
| `GITHUB_TOKEN` / `GITHUB_REPO` | copilot-function | — |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | copilot-function, backend | — |
| `DYNAATRACE_API_URL` / `DYNAATRACE_API_TOKEN` | copilot-function | — |
| `AZURE_SEARCH_ENDPOINT` / `AZURE_SEARCH_INDEX` | copilot-function | — |
| `FAILURE_MODE` | backend | `none` |
| `VITE_COPILOT_URL` | frontend | `http://localhost:7071/api` |

Todos los secretos van por variable de entorno o Key Vault. **Nunca en el código ni en el repositorio.**

## 10. Reglas transversales

- TypeScript estricto en todos los componentes. `npm run typecheck` y `npm run lint` deben pasar.
- Tests: `npm test` (o `pytest` si decides Python) debe pasar sin red y sin credenciales.
- Nada de secretos ni de credenciales en el código, en los `.env` de ejemplo ni en los fixtures.
- Los `.env.example` solo llevan nombres de variable con valores de ejemplo claramente marcados.
- Nada de secrets hardcodeados ni de endpoints de producción.
