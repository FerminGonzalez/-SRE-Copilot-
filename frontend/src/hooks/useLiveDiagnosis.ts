import { useCallback, useEffect, useRef, useState } from "react";
import { streamDiagnosis } from "../api/client";
import type { StreamEvent, Verdict } from "../types/contract";
import {
  initialLiveRunState,
  reduceStreamEvent,
  type LiveRunState,
} from "../lib/streamReducer";

export interface UseLiveDiagnosisOptions {
  /** Se invoca cuando el stream entrega el veredicto final. */
  onVerdict?: (verdict: Verdict) => void;
}

export interface UseLiveDiagnosis {
  state: LiveRunState;
  run: (request: Parameters<typeof streamDiagnosis>[0]) => Promise<void>;
  reset: () => void;
  verdictReceived: boolean;
}

/**
 * Dispara `POST /api/diagnose` y consume el SSE en vivo, acumulando el estado
 * que necesita la vista "Diagnóstico en vivo".
 */
export function useLiveDiagnosis(options?: UseLiveDiagnosisOptions): UseLiveDiagnosis {
  const [state, setState] = useState<LiveRunState>(initialLiveRunState);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const onVerdict = options?.onVerdict;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const run = useCallback(
    async (request: Parameters<typeof streamDiagnosis>[0]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState(initialLiveRunState());

      const onEvent = (event: StreamEvent) => {
        if (!mountedRef.current) return;
        setState((current) =>
          reduceStreamEvent(current, event, new Date().toISOString()),
        );
        if (event.type === "verdict") onVerdict?.(event.verdict);
      };

      try {
        await streamDiagnosis(request, onEvent, controller.signal);
        if (!mountedRef.current) return;
        // El stream terminó: si no llegó evento `done`, se cierra el estado.
        setState((current) => {
          if (current.status !== "running") return current;
          if (current.verdict) return { ...current, status: "completed" };
          return {
            ...current,
            status: "error",
            error: {
              message: "El flujo SSE ha terminado sin entregar un veredicto.",
            },
          };
        });
      } catch (caught) {
        if (!mountedRef.current || controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          status: "error",
          error: {
            message:
              caught instanceof Error
                ? caught.message
                : "No se ha podido completar el diagnóstico.",
          },
        }));
      }
    },
    [onVerdict],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(initialLiveRunState());
  }, []);

  return { state, run, reset, verdictReceived: state.verdict !== undefined };
}
