import { formatClock } from "../../lib/format";
import type { LiveLogEntry } from "../../lib/streamReducer";

export interface StreamConsoleProps {
  entries: LiveLogEntry[];
}

/**
 * Consola en monoespaciado con los eventos del stream en orden de llegada.
 * `role="log"` hace que los lectores de pantalla anuncien las novedades.
 */
export function StreamConsole({ entries }: StreamConsoleProps) {
  if (entries.length === 0) {
    return (
      <div className="console">
        <p className="console__line">
          <span className="console__text text-muted">
            esperando eventos del copilot…
          </span>
        </p>
      </div>
    );
  }

  return (
    <div
      className="console"
      role="log"
      aria-live="polite"
      aria-label="Consola del stream de diagnóstico"
    >
      {entries.map((entry) => (
        <p className="console__line" key={entry.id}>
          <span className="console__time">{entry.at ? formatClock(entry.at) : "--:--:--"}</span>
          <span
            className={`console__kind${
              entry.kind === "error"
                ? " console__kind--error"
                : entry.kind === "done"
                  ? " console__kind--done"
                  : ""
            }`}
          >
            {entry.kind}
          </span>
          <span className="console__text">{entry.text}</span>
        </p>
      ))}
    </div>
  );
}
