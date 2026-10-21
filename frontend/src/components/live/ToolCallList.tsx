import { formatDuration } from "../../lib/format";
import type { LiveToolCall } from "../../lib/streamReducer";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";

export interface ToolCallListProps {
  toolCalls: LiveToolCall[];
}

/**
 * Llamadas a herramientas con su duración. Una llamada en vuelo muestra un
 * indicador de progreso explícito (además del color).
 */
export function ToolCallList({ toolCalls }: ToolCallListProps) {
  if (toolCalls.length === 0) {
    return (
      <p className="text-muted" style={{ fontSize: "var(--fs-sm)" }}>
        Todavía no se ha ejecutado ninguna herramienta.
      </p>
    );
  }

  return (
    <ul className="toolcalls">
      {toolCalls.map((call) => {
        const running = call.status === "running";
        const failed = call.status === "error";
        return (
          <li key={call.id} className={`toolcall toolcall--${call.status}`}>
            <span className="toolcall__icon" aria-hidden="true">
              {running ? (
                <Spinner />
              ) : failed ? (
                <Icon name="cross" size={15} />
              ) : (
                <Icon name="check" size={15} />
              )}
            </span>

            <div>
              <div>
                <span className="toolcall__name">{call.tool}</span>
                <span className="toolcall__status">
                  {running ? (
                    <>
                      <Spinner />
                      en curso
                    </>
                  ) : failed ? (
                    "falló"
                  ) : (
                    "completada"
                  )}
                </span>
              </div>

              {call.summary ? <p className="toolcall__summary">{call.summary}</p> : null}

              {Object.keys(call.args).length > 0 ? (
                <details style={{ marginTop: "var(--sp-2)" }}>
                  <summary
                    style={{
                      cursor: "pointer",
                      fontSize: "var(--fs-2xs)",
                      color: "var(--text-dim)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Argumentos
                  </summary>
                  <pre className="codeblock" style={{ marginTop: "var(--sp-2)" }}>
                    {JSON.stringify(call.args, null, 2)}
                  </pre>
                </details>
              ) : null}
            </div>

            <span className="toolcall__duration">
              {running ? "—" : formatDuration(call.durationMs ?? 0)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
