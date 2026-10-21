import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Configuración propia de los tests: jsdom + Testing Library.
// Se mantiene separada de vite.config.ts para no acoplar el build a Vitest.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    clearMocks: true,
    unstubGlobals: true,
  },
});
