import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// `globals: false` en vitest.config.ts: la limpieza se hace explícita.
afterEach(() => {
  cleanup();
});
