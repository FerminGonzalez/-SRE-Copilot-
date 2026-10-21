/**
 * Servidor MCP (stdio) del SRE Copilot (CONTRACTS.md §6).
 *
 * Publica las nueve herramientas de §3 con sus esquemas JSON Schema usando el
 * transporte stdio del protocolo MCP: mensajes JSON-RPC 2.0 delimitados por
 * saltos de línea.
 *
 * Métodos soportados:
 * - `initialize`              · negociación de protocolo
 * - `notifications/initialized`
 * - `ping`
 * - `tools/list`              · catálogo con JSON Schema
 * - `tools/call`              · ejecución de una herramienta
 * - `resources/list`, `prompts/list` · listas vacías (el copilot no expone más)
 *
 * Arranque: `npm run mcp` (equivale a `node dist/mcp/server.js`).
 */

import type { ToolContext } from "../core/types";
import type { ToolRegistry } from "../tools/registry";
import { createToolRegistry } from "../tools/registry";
import { loadConfig } from "../config";
import type { AppConfig } from "../config";

/** Versión del protocolo MCP implementada. */
export const MCP_PROTOCOL_VERSION = "2024-11-05";

/** Nombre del servidor MCP. */
export const MCP_SERVER_NAME = "sre-copilot";

/** Petición JSON-RPC. */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

/** Respuesta JSON-RPC. */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** Códigos de error JSON-RPC usados por el servidor. */
export const JSON_RPC_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

/** Contexto de ejecución por defecto del servidor MCP. */
export function defaultToolContext(config: AppConfig = loadConfig()): ToolContext {
  return {
    now: new Date(),
    windowMinutes: config.engine.defaultWindowMinutes,
    service: config.defaults.service,
    environment: config.defaults.environment,
  };
}

/** Servidor MCP del copilot. */
export class McpServer {
  private readonly registry: ToolRegistry;

  public constructor(
    registry: ToolRegistry = createToolRegistry(loadConfig()),
    private readonly context: ToolContext = defaultToolContext(),
  ) {
    this.registry = registry;
  }

  /** Catálogo de herramientas con su JSON Schema. */
  public listTools(): Array<{ name: string; description: string; inputSchema: unknown }> {
    return this.registry.toLlmTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters,
    }));
  }

  /** Procesa una petición JSON-RPC y devuelve la respuesta (o `undefined`). */
  public async handle(request: JsonRpcRequest): Promise<JsonRpcResponse | undefined> {
    const id = request.id ?? null;

    if (request.method === "notifications/initialized" || request.method.startsWith("notifications/")) {
      return undefined;
    }

    switch (request.method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: MCP_SERVER_NAME, version: "1.0.0" },
          },
        };
      case "ping":
        return { jsonrpc: "2.0", id, result: {} };
      case "tools/list":
        return { jsonrpc: "2.0", id, result: { tools: this.listTools() } };
      case "resources/list":
        return { jsonrpc: "2.0", id, result: { resources: [] } };
      case "prompts/list":
        return { jsonrpc: "2.0", id, result: { prompts: [] } };
      case "tools/call":
        return this.callTool(id, request.params ?? {});
      default:
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: JSON_RPC_ERRORS.methodNotFound,
            message: `Método no soportado: ${request.method}`,
          },
        };
    }
  }

  /** Ejecuta una herramienta (`tools/call`). */
  private async callTool(
    id: string | number | null,
    params: Record<string, unknown>,
  ): Promise<JsonRpcResponse> {
    const name = typeof params["name"] === "string" ? params["name"] : undefined;
    if (!name) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: JSON_RPC_ERRORS.invalidParams,
          message: "Falta el parámetro `name` en tools/call",
        },
      };
    }
    const rawArgs = params["arguments"];
    const args =
      typeof rawArgs === "object" && rawArgs !== null
        ? (rawArgs as Record<string, unknown>)
        : {};
    const result = await this.registry.run(name, args, this.context);
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                tool: name,
                ok: result.ok,
                summary: result.summary,
                error: result.error,
                data: result.data,
              },
              null,
              2,
            ),
          },
        ],
        isError: !result.ok,
      },
    };
  }

  /** Arranca el bucle stdio: lee peticiones y escribe respuestas. */
  public start(): void {
    let buffer = "";
    // Las peticiones se procesan en orden (una detrás de otra) para que las
    // respuestas JSON-RPC mantengan el mismo orden que las peticiones.
    let queue: Promise<void> = Promise.resolve();

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        queue = queue.then(async () => {
          const response = await this.handleLine(trimmed);
          if (response) {
            process.stdout.write(`${JSON.stringify(response)}\n`);
          }
        });
      }
    });
    process.stdin.on("end", () => {
      void queue.finally(() => {
        process.exit(0);
      });
    });
  }

  /** Procesa una línea JSON cruda. */
  public async handleLine(line: string): Promise<JsonRpcResponse | undefined> {
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(line) as JsonRpcRequest;
    } catch {
      return {
        jsonrpc: "2.0",
        id: null,
        error: { code: JSON_RPC_ERRORS.parse, message: "JSON inválido" },
      };
    }
    return this.handle(request);
  }
}

/* Arranque directo: `npm run mcp` */
if (require.main === module) {
  new McpServer().start();
}
