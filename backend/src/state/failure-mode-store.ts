import type { FailureMode } from '../domain/failure-modes.js';

export type FailureModeSource = 'env' | 'runtime';

/**
 * Estado del modo de fallo.
 *
 * El valor inicial viene de `FAILURE_MODE` (env). `GET /api/chaos?mode=<m>`
 * puede cambiarlo en caliente para la demo, y `?mode=reset` vuelve al valor
 * del entorno. El estado vive en memoria: al reiniciar el proceso se vuelve al
 * valor de la variable de entorno.
 */
export class FailureModeStore {
  private runtimeMode: FailureMode | null = null;

  constructor(private readonly envMode: FailureMode) {}

  get current(): FailureMode {
    return this.runtimeMode ?? this.envMode;
  }

  get source(): FailureModeSource {
    return this.runtimeMode === null ? 'env' : 'runtime';
  }

  get env(): FailureMode {
    return this.envMode;
  }

  set(mode: FailureMode): void {
    this.runtimeMode = mode;
  }

  /** Vuelve al modo definido por la variable de entorno. */
  reset(): void {
    this.runtimeMode = null;
  }
}
