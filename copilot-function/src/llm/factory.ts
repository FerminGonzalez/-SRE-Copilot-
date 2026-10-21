/**
 * Fábrica de proveedores de LLM (CONTRACTS.md §4 y §9).
 *
 * La selección es **por variable de entorno**: `LLM_PROVIDER=azure-openai |
 * anthropic | mock`, con `mock` como valor por defecto. El proveedor `mock` es
 * el único que funciona sin red y sin credenciales, y es el que usan los
 * tests.
 *
 * Ningún proveedor guarda secretos: los recibe por parámetro desde la
 * configuración, que a su vez los lee de `process.env`.
 */

import type { AppConfig } from "../config";
import type { LlmProvider } from "./provider";
import { MockLlmProvider } from "./mock";
import { createAnthropicProvider } from "./anthropic";
import { createAzureOpenAiProvider } from "./azure-openai";

/** Crea el proveedor de LLM indicado por la configuración. */
export function createLlmProvider(config: AppConfig): LlmProvider {
  switch (config.llmProvider) {
    case "azure-openai":
      return createAzureOpenAiProvider(config);
    case "anthropic":
      return createAnthropicProvider(config);
    case "mock":
      return new MockLlmProvider();
    default: {
      // `loadConfig` ya valida el valor: aquí sólo se cubre el exhaustivo.
      const exhaustive: never = config.llmProvider;
      throw new Error(`Proveedor de LLM desconocido: ${String(exhaustive)}`);
    }
  }
}
