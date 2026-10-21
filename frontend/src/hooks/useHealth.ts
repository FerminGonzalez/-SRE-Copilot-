import { useCallback, useEffect, useState } from "react";
import { getHealth } from "../api/client";
import type { HealthInfo } from "../types/contract";

export type HealthStatus = "checking" | "online" | "degraded" | "offline";

export interface HealthState {
  status: HealthStatus;
  info?: HealthInfo;
  error?: string;
  /** Última comprobación (ISO 8601). */
  checkedAt?: string;
}

export interface UseHealth extends HealthState {
  /** Fuerza una comprobación inmediata. */
  refresh: () => void;
}

/**
 * Comprueba el estado del copilot con `GET /api/health` y lo refresca
 * periódicamente para alimentar el indicador de conexión de la barra superior.
 *
 * El estado solo se actualiza dentro de los callbacks de la promesa: nunca de
 * forma síncrona en el cuerpo del efecto (evita renders en cascada).
 */
export function useHealth(intervalMs = 30_000): UseHealth {
  const [tick, setTick] = useState(0);
  const [status, setStatus] = useState<HealthStatus>("checking");
  const [info, setInfo] = useState<HealthInfo | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [checkedAt, setCheckedAt] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    getHealth(controller.signal).then(
      (data) => {
        if (!active) return;
        setStatus(data.ok ? "online" : "degraded");
        setInfo(data);
        setError(undefined);
        setCheckedAt(new Date().toISOString());
      },
      (caught: unknown) => {
        if (!active) return;
        setStatus("offline");
        setError(
          caught instanceof Error ? caught.message : "No se ha podido contactar con el copilot.",
        );
        setCheckedAt(new Date().toISOString());
      },
    );

    return () => {
      active = false;
      controller.abort();
    };
  }, [tick]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  const refresh = useCallback(() => {
    setTick((value) => value + 1);
  }, []);

  return { status, info, error, checkedAt, refresh };
}
