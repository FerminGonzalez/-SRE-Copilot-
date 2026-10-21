import type { HealthState } from "../../hooks/useHealth";
import { Icon } from "../ui/Icon";
import { ConnectionBadge } from "./ConnectionBadge";

export interface TopBarProps {
  title: string;
  subtitle?: string;
  /** Entorno en el que se está diagnosturando. */
  environment: string;
  /** URL base configurada del copilot. */
  copilotUrl: string;
  health: HealthState;
  busy?: boolean;
}

export function TopBar({
  title,
  subtitle,
  environment,
  copilotUrl,
  health,
  busy = false,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar__lead">
        <h1 className="topbar__title">{title}</h1>
        {subtitle ? <p className="topbar__subtitle">{subtitle}</p> : null}
      </div>

      <div className="topbar__meta">
        <span className="chip chip--accent">
          <Icon name="server" size={12} />
          entorno: {environment}
        </span>

        <span className="topbar__url" title={`Endpoint del copilot: ${copilotUrl}`}>
          <Icon name="terminal" size={13} />
          <span>{copilotUrl}</span>
          <span className="visually-hidden">Endpoint del copilot</span>
        </span>

        <ConnectionBadge health={health} busy={busy} />
      </div>
    </header>
  );
}
