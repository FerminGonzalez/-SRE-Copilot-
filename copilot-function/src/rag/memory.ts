/**
 * Memoria de incidentes (CONTRACTS.md §5).
 *
 * Funciona **sin Azure AI Search**: el fallback local indexa los incidentes en
 * memoria y los ordena por similitud coseno sobre embeddings deterministas
 * (hashing de tokens). Si `AZURE_SEARCH_ENDPOINT` está definido, además
 * consulta AI Search y reordena con la misma similitud local.
 *
 * Sin credenciales ni red: los tests usan sólo el fallback local.
 */

import type { Feedback, IncidentSummary, RelatedIncident, Verdict } from "../core/types";
import { fnv1a } from "../tools/offline";

/** Configuración de Azure AI Search (opcional). */
export interface AzureSearchOptions {
  endpoint: string;
  index: string;
  apiKey?: string;
}

/** Opciones de la memoria. */
export interface IncidentMemoryOptions {
  enabled: boolean;
  topK: number;
  azureSearch?: AzureSearchOptions;
  timeoutMs?: number;
}

/** Incidente almacenado con su veredicto completo. */
interface StoredIncident {
  verdict: Verdict;
  summary: IncidentSummary;
  note?: string;
}

/** Dimensión de los embeddings deterministas. */
export const EMBEDDING_DIMENSIONS = 256;

/** Normaliza un texto: minúsculas, sin acentos y sólo tokens alfanuméricos. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9._-]+/)
    .filter((token) => token.length > 2);
}

/**
 * Embedding determinista: bolsa de tokens dispersa sobre un espacio fijo.
 *
 * El mismo texto produce siempre el mismo vector, sin depender de ningún
 * servicio externo.
 */
export function embed(text: string, dimensions = EMBEDDING_DIMENSIONS): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  for (const token of tokenize(text)) {
    const index = fnv1a(token) % dimensions;
    vector[index] = (vector[index] ?? 0) + 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
}

/** Similitud coseno entre dos vectores. */
export function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  for (let index = 0; index < length; index += 1) {
    dot += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return dot;
}

/** Texto indexable de un incidente. */
export function incidentText(summary: IncidentSummary, rootCause?: string): string {
  return [summary.summary, rootCause ?? summary.rootCause, summary.service, ...summary.tags].join(
    " ",
  );
}

/** Construye las etiquetas de un incidente a partir del veredicto. */
export function buildTags(verdict: Verdict): string[] {
  const tags = new Set<string>();
  tags.add(verdict.service);
  tags.add(verdict.environment);
  tags.add(`confianza:${verdict.confidence}`);
  for (const commit of verdict.suspectCommits) {
    tags.add(`commit:${commit.sha.slice(0, 7)}`);
  }
  for (const evidence of verdict.evidence) {
    tags.add(evidence.kind);
  }
  return [...tags].slice(0, 12);
}

/** Memoria de incidentes con fallback local y soporte opcional de AI Search. */
export class IncidentMemory {
  private readonly incidents = new Map<string, StoredIncident>();
  private readonly vectors = new Map<string, number[]>();

  public constructor(private readonly options: IncidentMemoryOptions) {}

  /** ¿La memoria está operativa? */
  public get available(): boolean {
    return this.options.enabled;
  }

  /** ¿Se está usando Azure AI Search? */
  public get usesAzureSearch(): boolean {
    return Boolean(this.options.azureSearch);
  }

  /** Registra un veredicto y devuelve su resumen. */
  public async record(verdict: Verdict): Promise<IncidentSummary> {
    const summary: IncidentSummary = {
      id: verdict.incidentId,
      service: verdict.service,
      generatedAt: verdict.generatedAt,
      summary: verdict.summary,
      rootCause: verdict.rootCause,
      confidence: verdict.confidence,
      tags: buildTags(verdict),
    };
    if (!this.options.enabled) {
      return summary;
    }
    this.incidents.set(verdict.incidentId, { verdict, summary });
    this.vectors.set(
      verdict.incidentId,
      embed(incidentText(summary, verdict.rootCause)),
    );
    await this.upsertToAzureSearch(summary, verdict.rootCause);
    return summary;
  }

  /** Devuelve el veredicto completo de un incidente. */
  public get(id: string): Verdict | undefined {
    return this.incidents.get(id)?.verdict;
  }

  /** Devuelve el resumen de un incidente. */
  public getSummary(id: string): IncidentSummary | undefined {
    return this.incidents.get(id)?.summary;
  }

  /** Lista incidentes, opcionalmente filtrados por servicio. */
  public list(options: { service?: string; limit?: number } = {}): IncidentSummary[] {
    const limit = options.limit ?? 50;
    const items = [...this.incidents.values()]
      .filter((item) => !options.service || item.summary.service === options.service)
      .sort((left, right) =>
        Date.parse(right.summary.generatedAt) - Date.parse(left.summary.generatedAt),
      );
    return items.slice(0, limit).map((item) => item.summary);
  }

  /** Registra el feedback de un usuario sobre un veredicto. */
  public setFeedback(id: string, feedback: Feedback, note?: string): boolean {
    const stored = this.incidents.get(id);
    if (!stored) {
      return false;
    }
    stored.summary = { ...stored.summary, feedback };
    stored.note = note;
    return true;
  }

  /** Nota de feedback de un incidente. */
  public getNote(id: string): string | undefined {
    return this.incidents.get(id)?.note;
  }

  /**
   * Busca incidentes relacionados por similitud.
   *
   * @param text Texto de la consulta (resumen + causa raíz).
   * @param service Servicio de referencia (prioriza coincidencias del mismo servicio).
   */
  public async search(
    text: string,
    options: { service?: string; limit?: number } = {},
  ): Promise<RelatedIncident[]> {
    if (!this.options.enabled) {
      return [];
    }
    const limit = options.limit ?? this.options.topK;
    const local = this.searchLocal(text, { ...options, limit });

    if (this.options.azureSearch) {
      const remote = await this.searchAzureSearch(text, limit);
      const merged = new Map<string, RelatedIncident>();
      for (const item of local) {
        merged.set(item.id, item);
      }
      for (const item of remote) {
        const existing = merged.get(item.id);
        if (!existing || item.similarity > existing.similarity) {
          merged.set(item.id, item);
        }
      }
      return [...merged.values()]
        .sort((left, right) => right.similarity - left.similarity)
        .slice(0, limit);
    }

    return local;
  }

  /** Búsqueda local por similitud coseno. */
  private searchLocal(
    text: string,
    options: { service?: string; limit?: number },
  ): RelatedIncident[] {
    const queryVector = embed(text);
    const limit = options.limit ?? this.options.topK;
    const scored: RelatedIncident[] = [];
    for (const [id, vector] of this.vectors) {
      const stored = this.incidents.get(id);
      if (!stored) {
        continue;
      }
      if (options.service && stored.summary.service !== options.service) {
        continue;
      }
      const similarity = cosineSimilarity(queryVector, vector);
      if (similarity <= 0) {
        continue;
      }
      scored.push({
        id,
        title: stored.summary.summary,
        similarity: Number(similarity.toFixed(4)),
        service: stored.summary.service,
      });
    }
    return scored.sort((left, right) => right.similarity - left.similarity).slice(0, limit);
  }

  /** Búsqueda keyword en Azure AI Search (best effort). */
  private async searchAzureSearch(text: string, limit: number): Promise<RelatedIncident[]> {
    const search = this.options.azureSearch;
    if (!search) {
      return [];
    }
    const url = `${search.endpoint.replace(/\/+$/, "")}/indexes/${encodeURIComponent(
      search.index,
    )}/docs/search?api-version=2023-11-01`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(search.apiKey ? { "api-key": search.apiKey } : {}),
        },
        body: JSON.stringify({ search: text, top: limit, queryType: "simple" }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
      if (!response.ok) {
        return [];
      }
      const payload = (await response.json()) as {
        value?: Array<{ id?: string; summary?: string; service?: string }>;
      };
      return (payload.value ?? [])
        .filter((doc): doc is { id: string; summary?: string; service?: string } =>
          typeof doc.id === "string",
        )
        .map((doc) => ({
          id: doc.id,
          title: doc.summary ?? "Incidente previo",
          similarity: 0.5,
          ...(doc.service ? { service: doc.service } : {}),
        }));
    } catch {
      // Sin AI Search disponible: se mantiene el fallback local.
      return [];
    }
  }

  /** Sube el incidente a Azure AI Search (best effort). */
  private async upsertToAzureSearch(
    summary: IncidentSummary,
    rootCause: string,
  ): Promise<void> {
    const search = this.options.azureSearch;
    if (!search) {
      return;
    }
    const url = `${search.endpoint.replace(/\/+$/, "")}/indexes/${encodeURIComponent(
      search.index,
    )}/docs/index?api-version=2023-11-01`;
    try {
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(search.apiKey ? { "api-key": search.apiKey } : {}),
        },
        body: JSON.stringify({
          value: [
            {
              "@search.action": "upsert",
              id: summary.id,
              summary: summary.summary,
              rootCause,
              service: summary.service,
              confidence: summary.confidence,
              generatedAt: summary.generatedAt,
              tags: summary.tags,
            },
          ],
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch {
      // Best effort: la memoria local es la fuente de verdad.
    }
  }
}
