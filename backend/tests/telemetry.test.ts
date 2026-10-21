import { describe, expect, it } from 'vitest';
import {
  ROOT_CONTEXT,
  SpanStatusCode,
  defaultTextMapGetter,
  defaultTextMapSetter,
  trace,
  type Span,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { ApiError } from '../src/domain/errors.js';
import {
  applyOperationToSpan,
  recordSpanError,
} from '../src/observability/spans.js';
import type { RequestContext } from '../src/observability/request-context.js';

interface SpanStub {
  name: string;
  attributes: Record<string, unknown>;
  exceptions: unknown[];
  status: { code: SpanStatusCode; message?: string } | undefined;
  updateName(name: string): void;
  setAttribute(key: string, value: unknown): void;
  recordException(error: unknown): void;
  setStatus(status: { code: SpanStatusCode; message?: string }): void;
}

function createSpanStub(): SpanStub {
  const stub: SpanStub = {
    name: 'GET',
    attributes: {},
    exceptions: [],
    status: undefined,
    updateName(name) {
      stub.name = name;
    },
    setAttribute(key, value) {
      stub.attributes[key] = value;
    },
    recordException(error) {
      stub.exceptions.push(error);
    },
    setStatus(status) {
      stub.status = status;
    },
  };
  return stub;
}

function createContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    correlationId: 'corr-1',
    operationName: 'Checkout',
    failureMode: 'none',
    method: 'GET',
    path: '/api/checkout',
    startedAt: 0,
    ...overrides,
  };
}

describe('span de la peticion', () => {
  it('renombra el span con el operation name y publica los atributos', () => {
    const stub = createSpanStub();

    applyOperationToSpan(stub as unknown as Span, createContext());

    expect(stub.name).toBe('Checkout');
    expect(stub.attributes.operation_Name).toBe('Checkout');
    expect(stub.attributes['app.failure_mode']).toBe('none');
    expect(stub.attributes['app.correlation_id']).toBe('corr-1');
  });

  it('registra la excepcion y marca el span como error', () => {
    const stub = createSpanStub();
    const error = new ApiError({
      code: 'DATABASE_TIMEOUT',
      message: 'Database connection timed out after 5000ms',
      status: 504,
      operationName: 'Checkout',
      failureMode: 'database',
      exceptionType: 'DatabaseTimeoutError',
    });

    recordSpanError(stub as unknown as Span, error);

    expect(stub.exceptions).toHaveLength(1);
    expect(stub.exceptions[0]).toBe(error);
    expect((stub.exceptions[0] as ApiError).name).toBe('DatabaseTimeoutError');
    expect(stub.status?.code).toBe(SpanStatusCode.ERROR);
  });

  it('no registra excepcion cuando la peticion va bien', () => {
    const stub = createSpanStub();

    applyOperationToSpan(stub as unknown as Span, createContext());

    expect(stub.exceptions).toHaveLength(0);
    expect(stub.status).toBeUndefined();
  });
});

describe('propagacion de traceparent (W3C)', () => {
  it('extrae el traceparent entrante y lo vuelve a inyectar', () => {
    const propagator = new W3CTraceContextPropagator();
    const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

    // La API de OpenTelemetry extrae el `SpanContext` dentro de un `Context`.
    const context = propagator.extract(
      ROOT_CONTEXT,
      { traceparent },
      defaultTextMapGetter,
    );
    const spanContext = trace.getSpanContext(context);

    expect(spanContext).toBeDefined();
    expect(spanContext?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(spanContext?.spanId).toBe('00f067aa0ba902b7');
    expect(spanContext?.traceFlags).toBe(1);

    // Y al reinyectar se obtiene la misma cabecera `traceparent`.
    const carrier: Record<string, string> = {};
    propagator.inject(context, carrier, defaultTextMapSetter);
    expect(carrier['traceparent']).toBe(traceparent);
  });
});
