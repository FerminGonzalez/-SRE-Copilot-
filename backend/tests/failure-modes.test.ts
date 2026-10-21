import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers.js';
import { FAILURE_DEFINITIONS, type BusinessFailureMode } from '../src/domain/failure-modes.js';

const BUSINESS_ROUTES = [
  { path: '/api/checkout', operationName: 'Checkout' },
  { path: '/api/payment', operationName: 'Payment' },
  { path: '/api/inventory', operationName: 'Inventory' },
] as const;

describe.each(BUSINESS_ROUTES)('modo de fallo sobre $path', ({ path, operationName }) => {
  it.each([
    ['database', 504, 'DATABASE_TIMEOUT'],
    ['misconfig', 500, 'CONFIGURATION_ERROR'],
    ['dependency', 502, 'UPSTREAM_DEPENDENCY_ERROR'],
  ] as [BusinessFailureMode, number, string][])(
    'FAILURE_MODE=%s devuelve %i con el codigo %s',
    async (mode, status, code) => {
      const { app } = createTestApp({ FAILURE_MODE: mode });

      const response = await request(app).get(path);

      expect(response.status).toBe(status);
      expect(response.body.error).toEqual({
        code,
        message: FAILURE_DEFINITIONS[mode].message,
        operationName,
        correlationId: expect.any(String),
      });
    },
  );

  it('el mismo modo produce siempre la misma forma de error', async () => {
    const { app } = createTestApp({ FAILURE_MODE: 'database' });

    const first = await request(app).get(path);
    const second = await request(app).get(path);

    expect(first.status).toBe(second.status);
    expect(first.body.error.code).toBe(second.body.error.code);
    expect(first.body.error.message).toBe(second.body.error.message);
    expect(first.body.error.operationName).toBe(second.body.error.operationName);
    // ...pero el correlation id es distinto en cada peticion.
    expect(first.body.error.correlationId).not.toBe(second.body.error.correlationId);
  });

  it('la cabecera x-operation-name sigue siendo la de la operacion', async () => {
    const { app } = createTestApp({ FAILURE_MODE: 'misconfig' });

    const response = await request(app).get(path);

    expect(response.headers['x-operation-name']).toBe(operationName);
    expect(response.body.error.operationName).toBe(operationName);
  });
});

describe('detalle de cada modo de fallo', () => {
  it('database: error de timeout de base de datos (504)', async () => {
    const { app } = createTestApp({ FAILURE_MODE: 'database' });

    const response = await request(app).get('/api/checkout');

    expect(response.status).toBe(504);
    expect(response.body.error.message).toBe('Database connection timed out after 5000ms');
  });

  it('misconfig: error de configuracion (500)', async () => {
    const { app } = createTestApp({ FAILURE_MODE: 'misconfig' });

    const response = await request(app).get('/api/payment');

    expect(response.status).toBe(500);
    expect(response.body.error.message).toContain('PAYMENT_PROVIDER_KEY');
  });

  it('dependency: la dependencia upstream devuelve 5xx (502)', async () => {
    const { app } = createTestApp({ FAILURE_MODE: 'dependency' });

    const response = await request(app).get('/api/inventory');

    expect(response.status).toBe(502);
    expect(response.body.error.message).toContain('payments-api');
  });

  it('las rutas de apoyo no fallan con el modo de fallo activo', async () => {
    const { app } = createTestApp({ FAILURE_MODE: 'database' });

    const catalog = await request(app).get('/api/catalog');
    const chaos = await request(app).get('/api/chaos');

    expect(catalog.status).toBe(200);
    expect(chaos.status).toBe(200);
  });
});
