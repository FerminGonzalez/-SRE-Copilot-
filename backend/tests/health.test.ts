import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers.js';

describe('GET /health', () => {
  it('responde 200 con el estado del backend', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.service).toBe('sre-copilot-backend');
    expect(response.body.version).toBe('1.0.0');
    expect(response.body.correlationId).toBeTruthy();
  });

  it('expone el operation name en la cabecera x-operation-name', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/health');

    expect(response.headers['x-operation-name']).toBe('Health');
  });

  it('nunca falla aunque el modo de fallo este activo', async () => {
    const { app } = createTestApp({ FAILURE_MODE: 'database' });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.failureMode).toBe('database');
  });
});
