/**
 * Proveedor de LLM `azure-openai` (CONTRACTS.md §4).
 *
 * Usa el SDK `@azure/openai` (v1) con **tool calling** nativo: las nueve
 * herramientas de §3 se publican como `tools` de tipo `function` con su JSON
 * Schema, y las llamadas que devuelve el modelo se traducen a `ToolCall`.
 *
 * El motor de diagnóstico habla en `system | user | assistant` (contrato §4),
 * así que este módulo traduce:
 * - el mensaje `user` que lleva los resultados de las herramientas → mensajes
 *   `role: "tool"` con su `toolCallId` (protocolo de OpenAI),
 * - el mensaje `assistant` con `toolCalls` → mensaje `assistant` con
 *   `toolCalls` de tipo `function`.
 *
 * Las credenciales vienen **siempre** por variable de entorno
 * (`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`);
 * nunca están en el código.
 */

import { AzureKeyCredential, OpenAIClient } from "@azure/openai";
import type {
  ChatCompletionsFunctionToolCall,
  ChatRequestMessageUnion,
  ChatRequestToolMessage,
} from "@azure/openai";
import type { AppConfig } from "../config";
import type { LlmMessage, LlmProvider, LlmRequest, LlmResponse, ToolCall } from "./provider";
import { parseToolResults } from "./provider";

/** Configuración mínima del proveedor de Azure OpenAI. */
export interface AzureOpenAiOptions {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
  /** Timeout de la llamada HTTP (ms). */
  timeoutMs?: number;
}

/** Error de configuración de Azure OpenAI. */
export class AzureOpenAiNotConfiguredError extends Error {
  public constructor() {
    super(
      "Azure OpenAI no está configurado: define AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY y AZURE_OPENAI_DEPLOYMENT.",
    );
    this.name = "AzureOpenAiNotConfiguredError";
  }
}

/** Construye el proveedor a partir de la configuración de la Function App. */
export function createAzureOpenAiProvider(config: AppConfig): LlmProvider {
  const { endpoint, apiKey, deployment, apiVersion } = config.azureOpenAi;
  if (!endpoint || !apiKey || !deployment) {
    throw new AzureOpenAiNotConfiguredError();
  }
  return new AzureOpenAiLlmProvider({ endpoint, apiKey, deployment, apiVersion });
}

/** Traduce los mensajes del motor al protocolo de herramientas de OpenAI. */
export function toChatMessages(messages: LlmMessage[]): ChatRequestMessageUnion[] {
  const result: ChatRequestMessageUnion[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }

    if (message.role === "system") {
      result.push({ role: "system", content: message.content });
      continue;
    }

    if (message.role === "assistant") {
      const toolCalls = message.toolCalls ?? [];
      result.push({
        role: "assistant",
        content: message.content.length > 0 ? message.content : null,
        ...(toolCalls.length > 0
          ? {
              toolCalls: toolCalls.map((call) => ({
                id: call.id,
                type: "function" as const,
                function: { name: call.name, arguments: JSON.stringify(call.args) },
              })),
            }
          : {}),
      });
      continue;
    }

    // `user`: puede ser la petición de diagnóstico o el resultado de las
    // herramientas (el motor los serializa como un JSON con `toolResults`).
    const toolResults = parseToolResults(message.content);
    if (toolResults.length === 0) {
      result.push({ role: "user", content: message.content });
      continue;
    }

    const previous = messages[index - 1];
    const calls = previous?.toolCalls ?? [];
    for (const toolResult of toolResults) {
      const call = calls.find((candidate) => candidate.name === toolResult.name);
      const toolMessage: ChatRequestToolMessage = {
        role: "tool",
        toolCallId: call?.id ?? toolResult.name,
        content: JSON.stringify(toolResult),
      };
      result.push(toolMessage);
    }
  }

  return result;
}

/** Convierte las llamadas a herramienta del modelo en `ToolCall` del motor. */
export function toToolCalls(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const calls: ToolCall[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const typed = item as ChatCompletionsFunctionToolCall;
    if (typed.type !== "function" || !typed.function) {
      continue;
    }
    calls.push({
      id: typed.id,
      name: typed.function.name,
      args: parseArguments(typed.function.arguments),
    });
  }
  return calls;
}

/** Parsea los argumentos JSON que devuelve el modelo. */
function parseArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Argumentos inválidos: la herramienta validará los que falten.
  }
  return {};
}

/** Proveedor de Azure OpenAI con tool calling. */
export class AzureOpenAiLlmProvider implements LlmProvider {
  public readonly name = "azure-openai";

  private readonly client: OpenAIClient;

  public constructor(private readonly options: AzureOpenAiOptions) {
    this.client = new OpenAIClient(
      options.endpoint,
      new AzureKeyCredential(options.apiKey),
      {
        apiVersion: options.apiVersion,
      },
    );
  }

  public async complete(req: LlmRequest): Promise<LlmResponse> {
    const response = await this.client.getChatCompletions(
      this.options.deployment,
      toChatMessages(req.messages),
      {
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
        ...(req.tools.length > 0
          ? {
              tools: req.tools.map((tool) => ({
                type: "function" as const,
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.parameters as Record<string, unknown>,
                },
              })),
            }
          : {}),
      },
    );

    const message = response.choices[0]?.message;
    return {
      content: message?.content ?? "",
      toolCalls: toToolCalls(message?.toolCalls),
      raw: response,
    };
  }
}
