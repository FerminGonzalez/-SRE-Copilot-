/**
 * Motor de diagnóstico agentic (el corazón del SRE Copilot).
 *
 * Bucle: **planificar → llamar a herramientas → observar → refinar → veredicto**.
 *
 * - El plan se emite siempre como primer evento útil (CONTRACTS.md §2).
 * - Cada llamada a herramienta produce un evento `tool_call` y un `tool_result`.
 * - La evidencia acumulada se emite evento a evento con id estable `EV-00x`.
 * - El bucle tiene topes: número máximo de iteraciones y de llamadas a
 *   herramientas. Al alcanzarlos se pide una respuesta final sin herramientas.
 * - El veredicto final se ensambla en `src/core/verdict.ts`, que descarta
 *   cualquier afirmación del LLM que no esté respaldada por una herramienta.
 */

import type {
  LlmMessage,
  LlmProvider,
  LlmResponse,
  ToolCall,
} from "../llm/provider";
import { LlmResponseSchema, SYSTEM_PROMPT, buildRequestMessage, serializeToolResults } from "../llm/provider";
import type { ToolRegistry } from "../tools/registry";
import type {
  DiagnosisRequest,
  StreamEvent,
  ToolCallRecord,
  ToolContext,
  ToolResult,
  Verdict,
} from "./types";
import { InMemoryEvidenceStore, createFactSet, extractEvidence, extractFacts, mergeFacts } from "./evidence";
import { buildPlan } from "./planner";
import { buildVerdict, parseAnalysis } from "./verdict";
import type { Telemetry } from "../observability/telemetry";
import type { RelatedIncident } from "./types";

/** Topes del bucle agentic. */
export interface EngineLimits {
  maxIterations: number;
  maxToolCalls: number;
}

/** Dependencias del motor. */
export interface EngineDependencies {
  provider: LlmProvider;
  registry: ToolRegistry;
  telemetry?: Telemetry;
  /** Relación con incidentes previos (memoria RAG). */
  findRelated?: (query: { service: string; summary: string; rootCause: string }) => Promise<
    RelatedIncident[]
  >;
  /** Reloj inyectable (tests). */
  now?: () => Date;
  limits?: Partial<EngineLimits>;
  temperature?: number;
  maxTokens?: number;
}

/** Resultado del diagnóstico. */
export interface DiagnosisResult {
  verdict: Verdict;
  events: StreamEvent[];
}

/** Genera un identificador de incidente estable y legible. */
export function createIncidentId(service: string, now: Date): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const slug = service.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase().slice(0, 24);
  return `inc-${stamp}-${slug}`;
}

/**
 * Ejecuta el diagnóstico completo.
 *
 * @param deps Dependencias inyectadas (proveedor, registro, telemetría…).
 * @param request Petición normalizada de `POST /api/diagnose`.
 * @param onEvent Callback opcional para hacer streaming de los eventos SSE.
 */
export async function runDiagnosis(
  deps: EngineDependencies,
  request: DiagnosisRequest,
  onEvent?: (event: StreamEvent) => void,
): Promise<DiagnosisResult> {
  const startedAtMs = Date.now();
  const events: StreamEvent[] = [];
  const emit = (event: StreamEvent): void => {
    events.push(event);
    onEvent?.(event);
  };

  const now = deps.now?.() ?? new Date();
  const service = request.service;
  const environment = request.environment ?? "dev";
  const windowMinutes = request.windowMinutes ?? 15;
  const incidentId = request.incidentId ?? createIncidentId(service, now);
  const since = new Date(now.getTime() - windowMinutes * 60_000).toISOString();
  const until = now.toISOString();

  const ctx: ToolContext = {
    now,
    windowMinutes,
    service,
    environment,
    ...(request.appVersion ? { appVersion: request.appVersion } : {}),
  };

  const limits: EngineLimits = {
    maxIterations: deps.limits?.maxIterations ?? 6,
    maxToolCalls: deps.limits?.maxToolCalls ?? 12,
  };

  const telemetry = deps.telemetry;
  const diagnosisSpan = telemetry?.startSpan("diagnosis", {
    "incident.id": incidentId,
    "service.name": service,
    "deployment.environment": environment,
    "diagnostic.window_minutes": windowMinutes,
    "llm.provider": deps.provider.name,
  });

  emit({ type: "meta", incidentId, service, startedAt: now.toISOString() });

  const plan = buildPlan(
    request,
    ctx,
    deps.registry.list().map((tool) => tool.name),
  );
  emit({ type: "plan", steps: plan.steps, hypothesis: plan.hypothesis });

  const store = new InMemoryEvidenceStore();
  const facts = createFactSet();
  const toolCalls: ToolCallRecord[] = [];
  const warnings: string[] = [];
  const messages: LlmMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    buildRequestMessage({
      service,
      environment,
      windowMinutes,
      ...(request.symptom ? { symptom: request.symptom } : {}),
      ...(request.appVersion ? { appVersion: request.appVersion } : {}),
      incidentId,
    }),
  ];

  let toolCallCount = 0;
  let analysisContent: string | undefined;
  let providerError: string | undefined;
  let capped = false;

  for (let iteration = 0; iteration < limits.maxIterations; iteration += 1) {
    let response: LlmResponse;
    try {
      const raw = await deps.provider.complete({
        messages,
        tools: deps.registry.toLlmTools(),
        ...(deps.temperature !== undefined ? { temperature: deps.temperature } : {}),
        ...(deps.maxTokens !== undefined ? { maxTokens: deps.maxTokens } : {}),
      });
      const validated = LlmResponseSchema.safeParse(raw);
      if (!validated.success) {
        providerError = `respuesta del proveedor inválida: ${validated.error.issues
          .map((issue) => issue.path.join("."))
          .join(", ")}`;
        response = { content: "", toolCalls: [] };
      } else {
        response = validated.data;
      }
    } catch (error) {
      providerError = error instanceof Error ? error.message : String(error);
      emit({ type: "error", message: "El proveedor de LLM falló", detail: providerError });
      break;
    }

    if (response.toolCalls.length === 0) {
      analysisContent = response.content;
      break;
    }

    if (toolCallCount >= limits.maxToolCalls) {
      capped = true;
      break;
    }

    const executed: Array<{ name: string; ok: boolean; summary: string; data?: unknown; error?: string }> =
      [];

    for (const call of response.toolCalls) {
      if (toolCallCount >= limits.maxToolCalls) {
        capped = true;
        break;
      }
      toolCallCount += 1;
      emit({ type: "tool_call", tool: call.name, args: call.args });

      const result: ToolResult = telemetry
        ? await telemetry.withSpan<ToolResult>(
            "tool.call",
            {
              "tool.name": call.name,
              "incident.id": incidentId,
            },
            async (span) => {
              const value = await deps.registry.run(call.name, call.args, ctx);
              span.setAttribute("tool.ok", value.ok);
              span.setAttribute("tool.duration_ms", value.durationMs);
              if (value.error) {
                span.setAttribute("tool.error", value.error);
              }
              return value;
            },
          )
        : await deps.registry.run(call.name, call.args, ctx);

      emit({
        type: "tool_result",
        tool: call.name,
        ok: result.ok,
        durationMs: result.durationMs,
        summary: result.summary,
        ...(result.data !== undefined ? { data: result.data } : {}),
      });

      const record: ToolCallRecord = {
        tool: call.name,
        args: call.args,
        durationMs: result.durationMs,
        ok: result.ok,
        ...(result.error ? { error: result.error } : {}),
      };
      toolCalls.push(record);

      if (!result.ok) {
        facts.failedTools.push(call.name);
      }

      for (const candidate of extractEvidence(call.name, result.data)) {
        const item = store.add(candidate);
        emit({ type: "evidence", evidence: item });
      }

      mergeFacts(facts, extractFacts(call.name, result.data));

      executed.push({
        name: call.name,
        ok: result.ok,
        summary: result.summary,
        ...(result.data !== undefined ? { data: result.data } : {}),
        ...(result.error ? { error: result.error } : {}),
      });
    }

    messages.push({
      role: "assistant",
      content: "",
      toolCalls: response.toolCalls.map((call: ToolCall) => ({
        id: call.id,
        name: call.name,
        args: call.args,
      })),
    });
    messages.push({
      role: "user",
      content: serializeToolResults(executed),
    });
  }

  if (analysisContent === undefined) {
    if (capped) {
      warnings.push(
        `Se alcanzó el límite de ${limits.maxToolCalls} llamadas a herramientas: el análisis puede estar incompleto.`,
      );
    }
    // Última llamada: sin herramientas, para forzar la respuesta final.
    try {
      const final = await deps.provider.complete({
        messages: [
          ...messages,
          {
            role: "user",
            content:
              "No puedes llamar a más herramientas. Devuelve el análisis final en JSON con las claves summary, rootCause, confidence, suspectCommits, timeline, recommendations y uncertainties.",
          },
        ],
        tools: [],
        ...(deps.temperature !== undefined ? { temperature: deps.temperature } : {}),
        ...(deps.maxTokens !== undefined ? { maxTokens: deps.maxTokens } : {}),
      });
      const validated = LlmResponseSchema.safeParse(final);
      analysisContent = validated.success ? validated.data.content : "";
      if (!validated.success) {
        providerError = `respuesta final del proveedor inválida: ${validated.error.issues
          .map((issue) => issue.path.join("."))
          .join(", ")}`;
      }
    } catch (error) {
      providerError = error instanceof Error ? error.message : String(error);
    }
  }

  const { analysis, error: analysisError } = parseAnalysis(analysisContent ?? "");

  const relatedIncidents = deps.findRelated
    ? await deps.findRelated({
        service,
        summary: analysis?.summary ?? "",
        rootCause: analysis?.rootCause ?? "",
      })
    : [];

  const verdict = buildVerdict({
    incidentId,
    service,
    environment,
    generatedAt: new Date().toISOString(),
    since,
    until,
    analysis,
    ...(analysisError ? { analysisError } : {}),
    ...(providerError && !analysisError ? { analysisError: providerError } : {}),
    facts,
    evidence: store.items(),
    toolCalls,
    relatedIncidents,
    plan,
    warnings,
  });

  emit({ type: "verdict", verdict });
  emit({ type: "done", elapsedMs: Date.now() - startedAtMs });

  diagnosisSpan?.setAttribute("diagnosis.tool_calls", toolCallCount);
  diagnosisSpan?.setAttribute("diagnosis.evidence_count", store.size());
  diagnosisSpan?.setAttribute("diagnosis.confidence", verdict.confidence);
  diagnosisSpan?.end();

  return { verdict, events };
}
