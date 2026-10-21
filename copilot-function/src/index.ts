/**
 * Punto de entrada de la Function App (Azure Functions v4, modelo Node).
 *
 * Rutas expuestas bajo el prefijo `/api` (CONTRACTS.md §2):
 *
 * | Método | Ruta                          | Handler              |
 * |--------|-------------------------------|----------------------|
 * | POST   | `/api/diagnose`               | `src/http/diagnose`  |
 * | GET    | `/api/incidents`              | `src/http/incidents` |
 * | GET    | `/api/incidents/{id}`         | `src/http/incidents` |
 * | POST   | `/api/incidents/{id}/feedback`| `src/http/incidents` |
 * | GET    | `/api/health`                 | `src/http/health`    |
 * | GET    | `/api/tools`                  | `src/http/health`    |
 *
 * El runtime (proveedor de LLM, registro de herramientas, memoria y
 * telemetría) se crea **una vez** al arrancar el proceso: Azure Functions
 * reutiliza la instancia entre invocaciones.
 */

import { app } from "@azure/functions";
import { createDiagnoseHandler } from "./http/diagnose";
import { createHealthHandler, createToolsHandler } from "./http/health";
import {
  createFeedbackHandler,
  createGetIncidentHandler,
  createListIncidentsHandler,
} from "./http/incidents";
import { createRuntime } from "./runtime";

const runtime = createRuntime();

app.http("diagnose", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "diagnose",
  handler: createDiagnoseHandler(runtime),
});

app.http("incidents", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "incidents",
  handler: createListIncidentsHandler(runtime),
});

app.http("incident", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "incidents/{id}",
  handler: createGetIncidentHandler(runtime),
});

app.http("feedback", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "incidents/{id}/feedback",
  handler: createFeedbackHandler(runtime),
});

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: createHealthHandler(runtime),
});

app.http("tools", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tools",
  handler: createToolsHandler(runtime),
});

export { runtime };
