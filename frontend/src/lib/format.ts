/**
 * Utilidades de presentación: formatos de fecha, duración y etiquetas.
 * Todo en español, coherente con el resto del producto.
 */
import type {
  Confidence,
  EvidenceKind,
  TimelineSeverity,
  TimelineSource,
} from "../types/contract";

const dateTimeFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const dayFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function toDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "20 oct 2026, 14:03" — o el valor original si no es una fecha válida. */
export function formatDateTime(value: string): string {
  const date = toDate(value);
  if (!date) return value;
  return dateTimeFormatter.format(date).replace(".", "");
}

/** "20 oct 2026" */
export function formatDay(value: string): string {
  const date = toDate(value);
  if (!date) return value;
  return dayFormatter.format(date).replace(".", "");
}

/** "14:03:22" */
export function formatClock(value: string): string {
  const date = toDate(value);
  if (!date) return value;
  return timeFormatter.format(date);
}

/** Duración en ms: "412 ms" / "1.24 s" / "2 m 05 s". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes} m ${String(seconds).padStart(2, "0")} s`;
}

/** "hace 5 min" — ventana temporal relativa, con degradado a fecha absoluta. */
export function formatRelative(value: string, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) return value;
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return formatDay(value);
}

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

export const FEEDBACK_LABELS: Record<string, string> = {
  correct: "Correcto",
  partially: "Parcial",
  incorrect: "Incorrecto",
};

export const TIMELINE_SOURCE_LABELS: Record<TimelineSource, string> = {
  kql: "KQL",
  github: "GitHub",
  deploy: "Deploy",
  dynatrace: "Dynatrace",
  logs: "Logs",
  llm: "LLM",
  system: "Sistema",
};

export const TIMELINE_SEVERITY_LABELS: Record<TimelineSeverity, string> = {
  info: "INFO",
  warning: "AVISO",
  error: "ERROR",
  critical: "CRÍTICO",
};

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  exception: "Excepción",
  trace: "Traza",
  metric: "Métrica",
  commit: "Commit",
  diff: "Diff",
  deploy: "Deploy",
  log: "Log",
  correlation: "Correlación",
};

/** Primeras n palabras, para previsualizar textos largos. */
export function truncate(text: string, words = 18): string {
  const parts = text.trim().split(/\s+/);
  if (parts.length <= words) return text.trim();
  return `${parts.slice(0, words).join(" ")}…`;
}
