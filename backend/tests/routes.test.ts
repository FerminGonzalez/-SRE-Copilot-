import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers.js';

describe('rutas de negocio (modo healthy)', () => {
  it('GET /api/catalog devuelve productos y stock', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/catalog');

    expect(response.status).toBe(200);
    expect(response.body.count).toBeGreaterThan(0);
    expect(Array.isArray(response.body.products)).toBe(true);
    expect(Array.isArray(response.body.stock)).toBe(true);
    expect(response.headers['x-operation-name']).toBe('Catalog');
    expect(response.body.correlationId).toBeTruthy();
  });

  it('GET /api/checkout crea una orden', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/checkout');

    expect(response.status).toBe(200);
    expect(response.body.orderId).toMatch(/^order_\d{4}$/);
    expect(response.body.status).toBe('confirmed');
    expect(response.body.total).toBeGreaterThan(0);
    expect(response.headers['x-operation-name']).toBe('Checkout');
    expect(response.body.correlationId).toBeTruthy();
  });

  it('GET /api/payment autoriza un cobro', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/payment');

    expect(response.status).toBe(200);
    expect(response.body.paymentId).toMatch(/^payment_\d{4}$/);
    expect(response.body.provider).toBe('payments-api');
    expect(response.body.status).toBe('authorized');
    expect(response.headers['x-operation-name']).toBe('Payment');
    expect(response.body.correlationId).toBeTruthy();
  });

  it('GET /api/inventory devuelve el stock', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/inventory');

    expect(response.status).toBe(200);
    expect(response.body.warehouse).toBe('mad-1');
    expect(response.body.items.length).toBeGreaterThan(0);
    expect(response.body.totalAvailable).toBeGreaterThan(0);
    expect(response.headers['x-operation-name']).toBe('Inventory');
    expect(response.body.correlationId).toBeTruthy();
  });

  it('responde 404 con el mismo formato de error para rutas desconocidas', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/no-existe');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.operationName).toBe('Unknown');
    expect(response.body.error.correlationId).toBeTruthy();
  });
});
