/**
 * Planificador del diagnóstico.
 *
 * El plan es determinista: se construye con la petición, el contexto y las
 * herramientas disponibles. El LLM puede desviarse de él (para eso está la
 * llamada a herramientas), pero el cliente siempre recibe un plan desde el
 * primer evento SSE (CONTRACTS.md §2).
 */

import type { DiagnosisRequest, ToolContext } from "./types";

/** Plan de diagnóstico. */
export interface DiagnosisPlan {
  steps: string[];
  hypothesis: string;
}

/** Herramientas que el planificador da por disponibles. */
const CORE_STEPS: Array<{ tool: string; text: string }> = [
  { tool: "query_exceptions", text: "Agrupar las excepciones de la ventana por tipo y mensaje" },
  { tool: "query_custom_events", text: "Localizar el último deploy y su commit_sha" },
  { tool: "query_traces", text: "Medir latencia p50/p95 y localizar dependencias con error" },
  { tool: "query_metrics", text: "Comprobar disponibilidad y tasa de error por minuto" },
  { tool: "list_recent_commits", text: "Revisar los commits recientes del servicio" },
  { tool: "blame_deploy_window", text: "Listar los commits publicados dentro de la ventana" },
  { tool: "search_logs", text: "Buscar el síntoma en las trazas de la ventana" },
  { tool: "dynatrace_problems", text: "Contrastar con los problemas abiertos en Dynatrace" },
  { tool: "get_commit_diff", text: "Inspeccionar el diff del commit sospechoso" },
];

/** Herramientas que siempre se incluyen en el plan. */
const ALWAYS = ["query_exceptions", "query_custom_events", "list_recent_commits"];

/**
 * Construye el plan del diagnóstico.
 *
 * @param request Petición normalizada.
 * @param ctx Contexto de la herramienta (ventana y servicio).
 * @param availableTools Nombres de herramientas disponibles en el registro.
 */
export function buildPlan(
  request: DiagnosisRequest,
  ctx: ToolContext,
  availableTools: string[],
): DiagnosisPlan {
  const available = new Set(availableTools);
  const symptom = request.symptom?.trim();

  const ordered = [...ALWAYS];
  for (const step of CORE_STEPS) {
    if (!ordered.includes(step.tool)) {
      ordered.push(step.tool);
    }
  }

  // `get_commit_diff` sólo tiene sentido cuando hay un commit entre el que elegir.
  const steps: string[] = [];
  for (const tool of ordered) {
    if (!available.has(tool)) {
      continue;
    }
    const definition = CORE_STEPS.find((step) => step.tool === tool);
    const suffix = tool === "search_logs" && symptom ? ` («${symptom}»)` : "";
    steps.push(`${definition?.text ?? tool} · ${tool}${suffix}`);
  }

  const hypothesis = symptom
    ? `El síntoma «${symptom}» en ${ctx.service}/${ctx.environment} apunta a un cambio reciente: se correlacionarán excepciones, deploys y commits de los últimos ${ctx.windowMinutes} minutos.`
    : `Sin síntoma explícito: se buscará el error dominante de ${ctx.service}/${ctx.environment} en los últimos ${ctx.windowMinutes} minutos y se correlacionará con el último deploy.`;

  return { steps, hypothesis };
}
