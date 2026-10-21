import { useCallback, useEffect, useState } from "react";
import { listIncidents } from "../api/client";
import type { IncidentSummary } from "../types/contract";

export interface IncidentsState {
  incidents: IncidentSummary[];
  loading: boolean;
  error?: string;
  /** Fuerza una recarga. */
  reload: () => void;
}

/**
 * Carga la lista de incidentes (`GET /api/incidents`) con filtro opcional por
 * servicio y recarga manual.
 *
 * `loading` se deriva de la clave de la petición: mientras la clave vigente no
 * se haya resuelto hay un spinner, y al cambiar el filtro o pedir una recarga
 * la clave cambia sin necesidad de actualizar estado dentro del efecto.
 */
export function useIncidents(options?: { service?: string; limit?: number }): IncidentsState {
  const service = options?.service ?? "";
  const limit = options?.limit ?? 25;

  const [reloadToken, setReloadToken] = useState(0);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const requestKey = `${service}|${limit}|${reloadToken}`;
  const loading = settledKey !== requestKey;

  useEffect(() => {
    let active = true;

    listIncidents({ service, limit }).then(
      (result) => {
        if (!active) return;
        setIncidents(result);
        setError(undefined);
        setSettledKey(requestKey);
      },
      (caught: unknown) => {
        if (!active) return;
        setIncidents([]);
        setError(
          caught instanceof Error
            ? caught.message
            : "No se ha podido cargar la lista de incidentes.",
        );
        setSettledKey(requestKey);
      },
    );

    return () => {
      active = false;
    };
  }, [service, limit, requestKey]);

  const reload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  return { incidents, loading, error, reload };
}
