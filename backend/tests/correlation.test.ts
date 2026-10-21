import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers.js';

describe('correlation id', () => {
  it('cada peticion lleva un correlation id distinto', async () => {
    const { app } = createTestApp();

    const first = await request(app).get('/api/checkout');
    const second = await request(app).get('/api/checkout');

    expect(first.body.correlationId).toBeTruthy();
    expect(second.body.correlationId).toBeTruthy();
    expect(first.body.correlationId).not.toBe(second.body.correlationId);
  });

  it('el correlation id del cuerpo coincide con la cabecera', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/payment');

    expect(response.headers['x-correlation-id']).toBe(response.body.correlationId);
  });

  it('reutiliza el correlation id que envia el cliente', async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .get('/api/inventory')
      .set('x-correlation-id', 'demo-1234');

    expect(response.body.correlationId).toBe('demo-1234');
    expect(response.headers['x-correlation-id']).toBe('demo-1234');
  });

  it('el correlation id tambien viaja en el cuerpo del error', async () => {
    const { app } = createTestApp({ FAILURE_MODE: 'database' });

    const response = await request(app).get('/api/checkout');

    expect(response.body.error.correlationId).toBe(response.headers['x-correlation-id']);
    expect(response.body.error.correlationId).toBeTruthy();
  });
});
