import { useState, type FormEvent } from "react";
import { ENVIRONMENTS } from "../../lib/environments";
import type { DiagnoseRequest } from "../../types/contract";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";

export interface DiagnoseFormProps {
  /** Entorno vigente (compartido con la barra superior). */
  environment: string;
  onEnvironmentChange: (environment: string) => void;
  /** Se invoca con el cuerpo que espera `POST /api/diagnose`. */
  onSubmit: (request: DiagnoseRequest) => void;
  running: boolean;
}

export function DiagnoseForm({
  environment,
  onEnvironmentChange,
  onSubmit,
  running,
}: DiagnoseFormProps) {
  const [service, setService] = useState("");
  const [windowMinutes, setWindowMinutes] = useState(30);
  const [symptom, setSymptom] = useState("");
  const [serviceError, setServiceError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = service.trim();
    if (trimmed.length === 0) {
      setServiceError("Indica el servicio afectado para poder diagnosticar.");
      return;
    }
    setServiceError(null);

    const request: DiagnoseRequest = {
      service: trimmed,
      environment,
      windowMinutes,
    };
    if (symptom.trim().length > 0) {
      request.symptom = symptom.trim();
    }
    onSubmit(request);
  };

  return (
    <section className="card" aria-labelledby="diagnose-form-title">
      <header className="card__header">
        <h2 className="card__title" id="diagnose-form-title">
          <Icon name="flask" size={15} />
          Nuevo diagnóstico
        </h2>
      </header>

      <div className="card__body">
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <div className="field">
              <label className="field__label" htmlFor="diagnose-service">
                Servicio <span aria-hidden="true">*</span>
              </label>
              <input
                id="diagnose-service"
                className="input"
                name="service"
                type="text"
                placeholder="checkout-api"
                value={service}
                onChange={(event) => setService(event.target.value)}
                aria-invalid={serviceError ? "true" : undefined}
                aria-describedby={serviceError ? "diagnose-service-error" : undefined}
                disabled={running}
                required
              />
              {serviceError ? (
                <span className="field__error" id="diagnose-service-error">
                  {serviceError}
                </span>
              ) : (
                <span className="field__hint">Nombre del servicio tal y como aparece en App Insights.</span>
              )}
            </div>

            <div className="field">
              <label className="field__label" htmlFor="diagnose-environment">
                Entorno
              </label>
              <select
                id="diagnose-environment"
                className="select"
                name="environment"
                value={environment}
                onChange={(event) => onEnvironmentChange(event.target.value)}
                disabled={running}
              >
                {ENVIRONMENTS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <span className="field__hint">Se aplica a las consultas KQL del diagnóstico.</span>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="diagnose-window">
                Ventana (minutos)
              </label>
              <input
                id="diagnose-window"
                className="input"
                name="windowMinutes"
                type="number"
                min={1}
                max={1440}
                step={1}
                value={windowMinutes}
                onChange={(event) => setWindowMinutes(Number(event.target.value))}
                disabled={running}
              />
              <span className="field__hint">Intervalo temporal hacia atrás que se inspecciona.</span>
            </div>
          </div>

          <div className="field" style={{ marginTop: "var(--sp-4)" }}>
            <label className="field__label" htmlFor="diagnose-symptom">
              Síntoma <span className="text-muted">(opcional)</span>
            </label>
            <textarea
              id="diagnose-symptom"
              className="textarea"
              name="symptom"
              placeholder="HTTP 500 en el 40 % de las peticiones desde hace 12 minutos…"
              value={symptom}
              onChange={(event) => setSymptom(event.target.value)}
              disabled={running}
            />
            <span className="field__hint">
              Contexto adicional que el copilot usará como punto de partida.
            </span>
          </div>

          <div className="view__actions" style={{ marginTop: "var(--sp-4)" }}>
            <button type="submit" className="btn btn--primary" disabled={running}>
              {running ? <Spinner /> : <Icon name="play" size={15} />}
              {running ? "Diagnosticando…" : "Iniciar diagnóstico"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
