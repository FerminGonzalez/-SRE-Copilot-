import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, firstLog, parsedLogs } from './helpers.js';

describe('log estructurado', () => {
  it('emite una linea JSON por peticion correcta', async () => {
    const harness = createTestApp();

    const response = await request(harness.app).get('/api/checkout');

    const lines = parsedLogs(harness);
    expect(lines).toHaveLength(1);

    const line = firstLog(harness);
    expect(line).toMatchObject({
      level: 'info',
      message: 'request_completed',
      operationName: 'Checkout',
      correlationId: response.body.correlationId,
      status: 200,
      failureMode: 'none',
    });
    expect(typeof line.timestamp).toBe('string');
    expect(typeof line.durationMs).toBe('number');
  });

  it('emite una linea JSON por peticion fallida con el modo de fallo', async () => {
    const harness = createTestApp({ FAILURE_MODE: 'dependency' });

    await request(harness.app).get('/api/payment');

    const lines = parsedLogs(harness);
    expect(lines).toHaveLength(1);

    const line = firstLog(harness);
    expect(line).toMatchObject({
      level: 'error',
      message: 'request_failed',
      operationName: 'Payment',
      status: 502,
      errorCode: 'UPSTREAM_DEPENDENCY_ERROR',
      errorType: 'UpstreamDependencyError',
      failureMode: 'dependency',
    });
    expect(typeof line.durationMs).toBe('number');
    // El texto del error va en `errorMessage`: no puede pisar el nombre del
    // evento, que es lo que agrupa el copilot.
    expect(typeof line.errorMessage).toBe('string');
  });

  it('el nombre del evento nunca se sobrescribe con un campo extra', async () => {
    const harness = createTestApp({ FAILURE_MODE: 'database' });

    await request(harness.app).get('/api/checkout');

    const line = firstLog(harness);
    expect(line.message).toBe('request_failed');
    expect(line.message).not.toBe(line.errorMessage);
  });
});
