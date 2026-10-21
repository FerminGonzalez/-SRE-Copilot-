import { Icon } from "../ui/Icon";

export type ViewId = "incidents" | "live" | "verdict";

export interface SidebarProps {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
  /** Número de incidentes cargados (se muestra como contador). */
  incidentCount?: number;
  /** Id del veredicto abierto, si lo hay. */
  verdictId?: string;
  copilotUrl: string;
}

const ITEMS: Array<{ id: ViewId; label: string; icon: "list" | "activity" | "clipboard" }> = [
  { id: "incidents", label: "Incidentes", icon: "list" },
  { id: "live", label: "Diagnóstico en vivo", icon: "activity" },
  { id: "verdict", label: "Veredicto", icon: "clipboard" },
];

export function Sidebar({
  view,
  onNavigate,
  incidentCount,
  verdictId,
  copilotUrl,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand__mark">
          <Icon name="pulse" size={20} />
        </span>
        <span>
          <span className="brand__name">SRE Copilot</span>
          <span className="brand__tagline">Consola de diagnóstico</span>
        </span>
      </div>

      <nav className="nav" aria-label="Navegación principal">
        <p className="nav__heading">Vistas</p>
        <ul>
          {ITEMS.map((item) => {
            const isActive = view === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="nav__item"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  <Icon name={item.icon} size={17} className="nav__icon" />
                  <span>{item.label}</span>
                  {item.id === "incidents" && incidentCount !== undefined ? (
                    <span className="nav__badge">{incidentCount}</span>
                  ) : null}
                  {item.id === "verdict" && verdictId ? (
                    <span className="nav__badge">{verdictId}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar__footer">
        <dl>
          <dt>Endpoint</dt>
          <dd>{copilotUrl}</dd>
        </dl>
      </div>
    </aside>
  );
}
