/**
 * Contrato §3 · las nueve herramientas obligatorias.
 */

import { describe, expect, it } from "vitest";
import { REQUIRED_TOOL_NAMES, createToolRegistry } from "../src/tools/registry";
import { testConfig, testContext, testRegistry } from "./helpers";
import type { CustomEventQueryData, LogSearchData } from "../src/tools/data";

describe("registro de herramientas (CONTRACTS.md §3)", () => {
  it("expone exactamente las nueve herramientas obligatorias", () => {
    const registry = testRegistry();
    const names = registry.list().map((tool) => tool.name);

    expect([...names].sort()).toEqual([...REQUIRED_TOOL_NAMES].sort());
    expect(names).toHaveLength(9);
  });

  it("cada herramienta tiene nombre en snake_case, descripción y JSON Schema de objeto", () => {
    const registry = testRegistry();
    for (const tool of registry.list()) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.parameters).toBeTypeOf("object");
      expect((tool.parameters as { type?: string }).type).toBe("object");
    }
  });

  it("el registro se construye sin credenciales (modo offline)", () => {
    expect(() => createToolRegistry(testConfig())).not.toThrow();
  });

  it("todas las herramientas responden ok en modo offline y exponen su duración", async () => {
    const registry = testRegistry();
    const ctx = testContext();

    // `get_commit_diff` y `search_logs` necesitan argumentos: se sacan de los
    // resultados de las herramientas que no los necesitan.
    const deploys = await registry.run("query_custom_events", {}, ctx);
    const deploySha = (deploys.data as CustomEventQueryData).deploys[0]?.commitSha ?? "";
    const logs = await registry.run("search_logs", { query: "connection" }, ctx);
    const needle = (logs.data as LogSearchData).matches[0]?.message ?? "connection";

    const argsByTool: Record<string, Record<string, unknown>> = {
      get_commit_diff: { sha: deploySha },
      search_logs: { query: needle },
    };

    for (const tool of registry.list()) {
      const result = await registry.run(tool.name, argsByTool[tool.name] ?? {}, ctx);
      expect(result.ok, `la herramienta ${tool.name} debe responder ok`).toBe(true);
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.data).toBeTypeOf("object");
    }
  });

  it("el registro devuelve un error controlado para una herramienta desconocida", async () => {
    const registry = testRegistry();
    const result = await registry.run("no_existe", {}, testContext());

    expect(result.ok).toBe(false);
    expect(result.error).toContain("no_existe");
  });

  it("la vista para el LLM mantiene nombre, descripción y esquema", () => {
    const registry = testRegistry();
    const views = registry.toLlmTools();

    expect(views.map((view) => view.name).sort()).toEqual([...REQUIRED_TOOL_NAMES].sort());
    for (const view of views) {
      expect(view.description.length).toBeGreaterThan(10);
      expect(view.parameters).toBeTypeOf("object");
    }
  });

  it("las herramientas funcionan sin ninguna credencial y no hacen red", async () => {
    const registry = testRegistry();
    const result = await registry.run("query_exceptions", {}, testContext());

    // Sin credenciales de Azure Monitor la herramienta usa el dataset offline.
    expect(result.ok).toBe(true);
    expect(result.summary).toContain("[offline]");
  });
});
