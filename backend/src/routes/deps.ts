import type { Tracer } from '@opentelemetry/api';
import type { Sequence } from '../domain/catalog.js';
import type { DatabaseTarget } from '../domain/database.js';
import type { FailureModeStore } from '../state/failure-mode-store.js';

export interface RouteDeps {
  tracer: Tracer;
  database: DatabaseTarget;
  sequence: Sequence;
  failureModes: FailureModeStore;
}
