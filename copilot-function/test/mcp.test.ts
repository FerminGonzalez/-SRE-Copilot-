/**
 * Contrato §6 · el servidor MCP (stdio) del copilot.
 *
 * Se prueba el protocolo JSON-RPC línea a línea, sin arrancar el proceso:
 * es la misma ruta de código que usa `npm run mcp`.
 */

import { describe, expect, it } from "vitest";
import {
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  McpServer,
  type JsonRpcResponse,
} from "../src/mcp/server";
import { REQUIRED_TOOL_NAMES } from "../src/tools/registry";
import { testConfig, testContext, testRegistry } from "./helpers";
import type { ToolContext } from "../src/core/types";

function server(context: ToolContext = testContext()): McpServer {
  return new McpServer(testRegistry(testConfig()), context);
}

describe("servidor MCP (CONTRACTS.md §6)", () => {
  it("responde a `initialize` con la versión del protocolo", async () => {
    const response = (await server().handle({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
    })) as JsonRpcResponse;

    expect(response.id).toBe(1);
    const result = response.result as {
      protocolVersion: string;
      serverInfo: { name: string };
      capabilities: { tools: unknown };
    };
    expect(result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(result.serverInfo.name).toBe(MCP_SERVER_NAME);
    expect(result.capabilities.tools).toBeDefined();
  });

  it("`tools/list` publica las nueve herramientas con su JSON Schema", async () => {
    const response = (await server().handle({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    })) as JsonRpcResponse;

    const result = response.result as {
      tools: Array<{ name: string; description: string; inputSchema: unknown }>;
    };
    expect(result.tools).toHaveLength(9);
    expect(result.tools.map((tool) => tool.name).sort()).toEqual(
      [...REQUIRED_TOOL_NAMES].sort(),
    );
    for (const tool of result.tools) {
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema).toBeTypeOf("object");
    }
  });

  it("`tools/call` ejecuta la herramienta y devuelve su resultado", async () => {
    const response = (await server().handle({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "query_exceptions", arguments: {} },
    })) as JsonRpcResponse;

    const result = response.result as {
      content: Array<{ type: string; text: string }>;
      isError: boolean;
    };
    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
      tool: string;
      ok: boolean;
    };
    expect(payload.tool).toBe("query_exceptions");
    expect(payload.ok).toBe(true);
  });

  it("`tools/call` sin `name` devuelve un error de parámetros inválidos", async () => {
    const response = (await server().handle({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {},
    })) as JsonRpcResponse;

    expect(response.error?.code).toBe(-32602);
  });

  it("un método desconocido devuelve `methodNotFound`", async () => {
    const response = (await server().handle({
      jsonrpc: "2.0",
      id: 5,
      method: "no/existe",
    })) as JsonRpcResponse;

    expect(response.error?.code).toBe(-32601);
  });

  it("una línea JSON inválida devuelve un error de parseo", async () => {
    const response = (await server().handleLine("{ esto no es json")) as JsonRpcResponse;

    expect(response.error?.code).toBe(-32700);
  });

  it("las notificaciones no producen respuesta", async () => {
    const response = await server().handle({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    expect(response).toBeUndefined();
  });
});
