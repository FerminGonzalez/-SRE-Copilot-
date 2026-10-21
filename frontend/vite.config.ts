import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configuración mínima: React + Vite, sin plugins pesados.
// La URL del copilot se inyecta en tiempo de build/serve con VITE_COPILOT_URL.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
