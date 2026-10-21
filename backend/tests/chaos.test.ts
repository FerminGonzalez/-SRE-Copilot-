import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers.js';

describe('GET /api/chaos', () => {
  it('consulta el modo activo sin cambiarlo', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/chaos');

    expect(response.status).toBe(200);
    expect(response.body.currentMode).toBe('none');
    expect(response.body.source).toBe('env');
    expect(response.body.changed).toBe(false);
    expect(response.body.availableModes).toEqual([
      'none',
      'database',
      'misconfig',
      'dependency',
    ]);
    expect(response.headers['x-operation-name']).toBe('Chaos');
  });

  it('cambia el modo en caliente y afecta a las peticiones siguientes', async () => {
    const { app } = createTestApp();

    const chaos = await request(app).get('/api/chaos?mode=database');
    expect(chaos.status).toBe(200);
    expect(chaos.body.currentMode).toBe('database');
    expect(chaos.body.previousMode).toBe('none');
    expect(chaos.body.source).toBe('runtime');
    expect(chaos.body.changed).toBe(true);

    const checkout = await request(app).get('/api/checkout');
    expect(checkout.status).toBe(504);
    expect(checkout.body.error.code).toBe('DATABASE_TIMEOUT');
    expect(checkout.body.error.operationName).toBe('Checkout');
  });

  it('vuelve al modo healthy con mode=none', async () => {
    const { app } = createTestApp();

    await request(app).get('/api/chaos?mode=dependency');
    const reset = await request(app).get('/api/chaos?mode=none');

    expect(reset.body.currentMode).toBe('none');

    const checkout = await request(app).get('/api/checkout');
    expect(checkout.status).toBe(200);
  });

  it('mode=reset vuelve al valor de la variable de entorno', async () => {
    const { app } = createTestApp({ FAILURE_MODE: 'misconfig' });

    await request(app).get('/api/chaos?mode=dependency');
    const reset = await request(app).get('/api/chaos?mode=reset');

    expect(reset.body.currentMode).toBe('misconfig');
    expect(reset.body.source).toBe('env');
  });

  it('rechaza un modo desconocido con 400 y el formato de error habitual', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/chaos?mode=explosion');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_FAILURE_MODE');
    expect(response.body.error.operationName).toBe('Chaos');
    expect(response.body.error.correlationId).toBeTruthy();
  });
});
