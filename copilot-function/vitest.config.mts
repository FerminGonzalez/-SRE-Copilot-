import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    /**
     * Los tests son **offline**: sin red y sin credenciales.
     *
     * Se vacían todas las variables que apuntan a servicios externos para
     * que, pase lo que pase en el entorno donde se ejecutan, las herramientas
     * usen el dataset determinista y el proveedor de LLM sea el `mock`.
     */
    env: {
      LLM_PROVIDER: "mock",
      AZURE_OPENAI_ENDPOINT: "",
      AZURE_OPENAI_API_KEY: "",
      AZURE_OPENAI_DEPLOYMENT: "",
      ANTHROPIC_API_KEY: "",
      AZURE_MONITOR_WORKSPACE_ID: "",
      AZURE_MONITOR_API_KEY: "",
      GITHUB_TOKEN: "",
      GITHUB_REPO: "",
      DYNAATRACE_API_URL: "",
      DYNAATRACE_API_TOKEN: "",
      AZURE_SEARCH_ENDPOINT: "",
      AZURE_SEARCH_INDEX: "",
      AZURE_SEARCH_API_KEY: "",
      APPLICATIONINSIGHTS_CONNECTION_STRING: "",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "lcov"],
    },
  },
});
