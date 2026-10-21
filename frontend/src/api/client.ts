/**
 * Cliente HTTP del copilot (CONTRACTS.md §2).
 *
 * Todos los endpoints cuelgan del prefijo `/api` de la Function App. La URL base
 * se configura con `VITE_COPILOT_URL` y **nunca** incluye credenciales.
 */
import type {
  DiagnoseRequest,
  FeedbackRequest,
  HealthInfo,
  IncidentSummary,
  Verdict,
} from "../types/contract";
import { readEventStream } from "./sse";
import type { StreamEvent } from "../types/contract";

export const DEFAULT_COPILOT_URL = "http://localhost:7071/api";

/** URL base efectiva, sin barra final. */
export function getCopilotBaseUrl(): string {
  const configured = import.meta.env.VITE_COPILOT_URL;
  const raw = typeof configured === "string" ? configured.trim() : "";
  const base = raw.length > 0 ? raw : DEFAULT_COPILOT_URL;
  return base.replace(/\/+$/, "");
}

export function joinUrl(base: string, path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base.replace(/\/+$/, "")}${suffix}`;
}

/** Error de API con el código HTTP para poder diferenciarlo en la interfaz. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (text.trim().length === 0) {
      return `HTTP ${response.status} ${response.statusText}`.trim();
    }
    return text.slice(0, 400);
  } catch {
    return `HTTP ${response.status} ${response.statusText}`.trim();
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new ApiError(await readError(response), response.status);
  }
  return (await response.json()) as T;
}

/** `GET /api/incidents?service=&limit=` */
export async function listIncidents(options?: {
  service?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<IncidentSummary[]> {
  const params = new URLSearchParams();
  if (options?.service && options.service.trim().length > 0) {
    params.set("service", options.service.trim());
  }
  if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
    params.set("limit", String(options.limit));
  }
  const query = params.toString();
  const url = `${joinUrl(getCopilotBaseUrl(), "/incidents")}${query ? `?${query}` : ""}`;
  const payload = await requestJson<{ incidents?: IncidentSummary[] }>(url, {
    signal: options?.signal,
  });
  return Array.isArray(payload.incidents) ? payload.incidents : [];
}

/** `GET /api/incidents/:id` */
export async function getIncident(incidentId: string, signal?: AbortSignal): Promise<Verdict> {
  const url = joinUrl(getCopilotBaseUrl(), `/incidents/${encodeURIComponent(incidentId)}`);
  const payload = await requestJson<{ incident?: Verdict }>(url, { signal });
  if (!payload.incident) {
    throw new ApiError("La respuesta del copilot no contiene el incidente solicitado.", 502);
  }
  return payload.incident;
}

/** `POST /api/incidents/:id/feedback` */
export async function sendFeedback(
  incidentId: string,
  body: FeedbackRequest,
): Promise<{ ok: boolean; incidentId: string }> {
  const url = joinUrl(
    getCopilotBaseUrl(),
    `/incidents/${encodeURIComponent(incidentId)}/feedback`,
  );
  return requestJson<{ ok: boolean; incidentId: string }>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** `GET /api/health` */
export async function getHealth(signal?: AbortSignal): Promise<HealthInfo> {
  const url = joinUrl(getCopilotBaseUrl(), "/health");
  return requestJson<HealthInfo>(url, { signal });
}

/**
 * `POST /api/diagnose` — dispara el diagnóstico y consume el SSE.
 *
 * Se usa `fetch` + `ReadableStream` (no `EventSource`) porque el endpoint es
 * un POST con cuerpo.
 */
export async function streamDiagnosis(
  request: DiagnoseRequest,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const url = joinUrl(getCopilotBaseUrl(), "/diagnose");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    throw new ApiError(await readError(response), response.status);
  }
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    // El copilot respondió bien pero no con un stream: se avisa para que la
    // interfaz no se quede esperando en silencio.
    throw new ApiError(
      "El copilot no ha devuelto un stream SSE (content-type inesperado).",
      502,
    );
  }

  await readEventStream(response, onEvent);
}
