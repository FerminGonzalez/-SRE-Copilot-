/**
 * Utilidades compartidas por los tests del copilot.
 *
 * Todos los tests son **offline**: sin red y sin credenciales. El proveedor de
 * LLM por defecto es `mock` y las herramientas usan el dataset determinista
 * (`src/tools/offline.ts`).
 */

import { loadConfig, type AppConfig } from "../src/config";
import { MockLlmProvider } from "../src/llm/mock";
import { createToolRegistry, type ToolRegistry } from "../src/tools/registry";
import type { ToolContext } from "../src/core/types";

/** Entorno de test: sólo el proveedor `mock`, ninguna credencial. */
export const TEST_ENV: Record<string, string> = {
  LLM_PROVIDER: "mock",
  RAG_ENABLED: "true",
  RAG_BACKEND: "local",
};

/** Configuración de test (sin secretos, sin red). */
export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({ ...TEST_ENV, ...overrides });
}

/** Registro de herramientas de test. */
export function testRegistry(config: AppConfig = testConfig()): ToolRegistry {
  return createToolRegistry(config);
}

/** Contexto de herramienta determinista. */
export function testContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    now: new Date("2026-05-04T10:15:00.000Z"),
    windowMinutes: 30,
    service: "sre-copilot-api",
    environment: "dev",
    ...overrides,
  };
}

/** Proveedor de LLM de test. */
export function testProvider(): MockLlmProvider {
  return new MockLlmProvider();
}

/**
 * Recorre un objeto buscando cadenas que parecen un SHA de git
 * (7 a 40 caracteres hexadecimales).
 */
export function findShaLikeStrings(value: unknown, path = "$"): string[] {
  const found: string[] = [];
  if (typeof value === "string") {
    const matches = value.match(/\b[0-9a-f]{7,40}\b/g);
    if (matches) {
      for (const match of matches) {
        found.push(`${path}:${match}`);
      }
    }
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      found.push(...findShaLikeStrings(item, `${path}[${index}]`));
    });
    return found;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      found.push(...findShaLikeStrings(item, `${path}.${key}`));
    }
  }
  return found;
}

/** Extrae los `sha` completos observados en un payload de herramienta. */
export function collectShas(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectShas(item, into);
    }
    return into;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(record)) {
      if (key === "sha" && typeof item === "string") {
        into.add(item);
      } else if (key === "commitSha" && typeof item === "string") {
        into.add(item);
      } else {
        collectShas(item, into);
      }
    }
  }
  return into;
}

/** Extrae todas las marcas de tiempo ISO observadas en un payload. */
export function collectTimestamps(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTimestamps(item, into);
    }
    return into;
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value as Record<string, unknown>)) {
      if (typeof item === "string" && /^\d{4}-\d{2}-\d{2}T/.test(item)) {
        into.add(item);
      } else {
        collectTimestamps(item, into);
      }
    }
  }
  return into;
}
