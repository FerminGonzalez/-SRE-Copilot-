import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Los tests son offline: sin red, sin credenciales y sin telemetría real.
    env: {
      OTEL_SDK_DISABLED: 'true',
      OTEL_TRACES_EXPORTER: 'none',
      FAILURE_MODE: 'none',
      LOG_LEVEL: 'error',
      // Base de datos de la demo: sin credenciales y sin host real.
      DATABASE_URL: 'postgres://wrong-host:5432/mydb',
      APPLICATIONINSIGHTS_CONNECTION_STRING: '',
    },
  },
});
