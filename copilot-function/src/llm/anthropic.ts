/**
 * Proveedor de LLM `anthropic` (CONTRACTS.md §4).
 *
 * Usa la API Messages de Anthropic con **tool use** nativo: las nueve
 * herramientas de §3 se publican con su JSON Schema (`input_schema`) y los
 * bloques `tool_use` que devuelve el modelo se traducen a `ToolCall`.
 *
 * El motor de diagnóstico habla en `system | user | assistant` (contrato §4),
 * así que este módulo traduce:
 * - el mensaje `system` → parámetro `system` de la API,
 * - el mensaje `user` con resultados de herramientas → mensaje `user` con
 *   bloques `tool_result`,
 * - el mensaje `assistant` con `toolCalls` → mensaje `assistant` con bloques
 *   `tool_use`.
 *
 * La credencial viene **siempre** por variable de entorno (`ANTHROPIC_API_KEY`);
 * nunca está en el código.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam, MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import type { AppConfig } from "../config";
import type { LlmMessage, LlmProvider, LlmRequest, LlmResponse, ToolCall } from "./provider";
import { parseToolResults } from "./provider";

/** Configuración mínima del proveedor de Anthropic. */
export interface AnthropicOptions {
  apiKey: string;
  model: string;
  /** Timeout de la llamada HTTP (ms). */
  timeoutMs?: number;
}

/** Error de configuración de Anthropic. */
export class AnthropicNotConfiguredError extends Error {
  public constructor() {
    super("Anthropic no está configurado: define ANTHROPIC_API_KEY.");
    this.name = "AnthropicNotConfiguredError";
  }
}

/** Construye el proveedor a partir de la configuración de la Function App. */
export function createAnthropicProvider(config: AppConfig): LlmProvider {
  const { apiKey, model } = config.anthropic;
  if (!apiKey) {
    throw new AnthropicNotConfiguredError();
  }
  return new AnthropicLlmProvider({ apiKey, model });
}

/** Resultado de traducir los mensajes del motor al formato de Anthropic. */
export interface AnthropicConversation {
  system: string;
  messages: MessageParam[];
}

/** Traduce los mensajes del motor al formato de la API Messages. */
export function toAnthropicConversation(messages: LlmMessage[]): AnthropicConversation {
  const systemParts: string[] = [];
  const result: MessageParam[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }

    if (message.role === "system") {
      systemParts.push(message.content);
      continue;
    }

    if (message.role === "assistant") {
      const toolCalls = message.toolCalls ?? [];
      const blocks: ContentBlockParam[] = [];
      if (message.content.length > 0) {
        blocks.push({ type: "text", text: message.content });
      }
      for (const call of toolCalls) {
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: call.args,
        });
      }
      if (blocks.length > 0) {
        result.push({ role: "assistant", content: blocks });
      }
      continue;
    }

    // `user`: la petición de diagnóstico o el resultado de las herramientas.
    const toolResults = parseToolResults(message.content);
    if (toolResults.length === 0) {
      result.push({ role: "user", content: message.content });
      continue;
    }

    const previous = messages[index - 1];
    const calls = previous?.toolCalls ?? [];
    const blocks: ContentBlockParam[] = [];
    for (const toolResult of toolResults) {
      const call = calls.find((candidate) => candidate.name === toolResult.name);
      blocks.push({
        type: "tool_result",
        tool_use_id: call?.id ?? toolResult.name,
        content: JSON.stringify(toolResult),
        ...(toolResult.ok ? {} : { is_error: true }),
      });
    }
    result.push({ role: "user", content: blocks });
  }

  return { system: systemParts.join("\n\n"), messages: result };
}

/** Convierte los bloques `tool_use` del modelo en `ToolCall` del motor. */
export function toToolCalls(blocks: readonly unknown[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const block of blocks) {
    if (typeof block !== "object" || block === null) {
      continue;
    }
    const typed = block as { type?: string; id?: string; name?: string; input?: unknown };
    if (typed.type !== "tool_use" || typeof typed.id !== "string" || typeof typed.name !== "string") {
      continue;
    }
    const input = typed.input;
    calls.push({
      id: typed.id,
      name: typed.name,
      args:
        typeof input === "object" && input !== null
          ? (input as Record<string, unknown>)
          : {},
    });
  }
  return calls;
}

/** Proveedor de Anthropic con tool use. */
export class AnthropicLlmProvider implements LlmProvider {
  public readonly name = "anthropic";

  private readonly client: Anthropic;

  public constructor(private readonly options: AnthropicOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}),
    });
  }

  public async complete(req: LlmRequest): Promise<LlmResponse> {
    const { system, messages } = toAnthropicConversation(req.messages);
    const tools: Tool[] = req.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Tool.InputSchema,
    }));

    const response = await this.client.messages.create({
      model: this.options.model,
      max_tokens: req.maxTokens ?? 2048,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(system.length > 0 ? { system } : {}),
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    });

    const content = response.content;
    const text = content
      .filter(
        (block): block is Extract<(typeof content)[number], { type: "text" }> =>
          block.type === "text",
      )
      .map((block) => block.text)
      .join("");

    return {
      content: text,
      toolCalls: toToolCalls(content),
      raw: response,
    };
  }
}
