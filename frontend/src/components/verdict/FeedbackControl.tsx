import { useState, type FormEvent } from "react";
import { sendFeedback } from "../../api/client";
import type { FeedbackVerdict } from "../../types/contract";
import { Banner } from "../ui/Banner";
import { Card } from "../ui/Card";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";

export interface FeedbackControlProps {
  incidentId: string;
  /** Permite inyectar el envío en los tests. */
  submit?: (incidentId: string, body: { verdict: FeedbackVerdict; note?: string }) => Promise<unknown>;
}

const OPTIONS: Array<{ value: FeedbackVerdict; label: string }> = [
  { value: "correct", label: "Correcto" },
  { value: "partially", label: "Parcialmente correcto" },
  { value: "incorrect", label: "Incorrecto" },
];

type FeedbackState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

/**
 * Control de feedback: `POST /api/incidents/:id/feedback`.
 */
export function FeedbackControl({ incidentId, submit }: FeedbackControlProps) {
  const [selected, setSelected] = useState<FeedbackVerdict | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<FeedbackState>({ kind: "idle" });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;

    setState({ kind: "sending" });
    try {
      const send = submit ?? sendFeedback;
      const body: { verdict: FeedbackVerdict; note?: string } = { verdict: selected };
      if (note.trim().length > 0) body.note = note.trim();
      await send(incidentId, body);
      setState({ kind: "sent" });
    } catch (caught) {
      setState({
        kind: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "No se ha podido enviar el feedback al copilot.",
      });
    }
  };

  return (
    <Card title="Feedback" icon="send" headingId="verdict-feedback-title">
      {state.kind === "sent" ? (
        <Banner
          tone="success"
          title="Feedback registrado"
          detail="Gracias. El copilot usará esta valoración para afinar los próximos diagnósticos."
        />
      ) : null}

      {state.kind === "error" ? (
        <Banner tone="error" title="No se ha podido enviar el feedback" detail={state.message} />
      ) : null}

      <form className="feedback" onSubmit={handleSubmit} noValidate>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="feedback__legend">¿Qué tal ha acertado el diagnóstico?</legend>

          <div className="feedback__options">
            {OPTIONS.map((option) => (
              <label className="feedback__option" key={option.value}>
                <input
                  type="radio"
                  name="verdict"
                  value={option.value}
                  checked={selected === option.value}
                  onChange={() => setSelected(option.value)}
                  disabled={state.kind === "sending"}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label className="field__label" htmlFor="feedback-note">
            Nota <span className="text-muted">(opcional)</span>
          </label>
          <textarea
            id="feedback-note"
            className="textarea"
            name="note"
            placeholder="Contexto adicional: la causa raíz era otra, faltaba una traza…"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={state.kind === "sending"}
          />
        </div>

        <div className="view__actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!selected || state.kind === "sending"}
          >
            {state.kind === "sending" ? <Spinner /> : <Icon name="send" size={15} />}
            {state.kind === "sending" ? "Enviando…" : "Enviar feedback"}
          </button>
        </div>
      </form>
    </Card>
  );
}
