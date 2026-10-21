import { useState } from "react";
import { EVIDENCE_KIND_LABELS, formatDateTime } from "../../lib/format";
import type { EvidenceItem } from "../../types/contract";
import { Icon } from "../ui/Icon";

export interface EvidenceItemRowProps {
  item: EvidenceItem;
  /** Expandido inicialmente (por defecto, contraído). */
  defaultExpanded?: boolean;
}

/**
 * Una evidencia plegable. El botón expone `aria-expanded` y `aria-controls`
 * para que un lector de pantalla sepa si el detalle está visible.
 */
export function EvidenceItemRow({ item, defaultExpanded = false }: EvidenceItemRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panelId = `evidencia-panel-${item.id}`;

  return (
    <li className="evidence__item">
      <button
        type="button"
        className="evidence__toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
      >
        <Icon name="chevron" size={14} className="evidence__chevron" />
        <span>
          <span className="evidence__title">{item.title}</span>
          <span className="evidence__id"> · {item.id}</span>
        </span>
        <span className="chip chip--accent">{EVIDENCE_KIND_LABELS[item.kind] ?? item.kind}</span>
      </button>

      <div id={panelId} className="evidence__panel" hidden={!expanded}>
        <p className="evidence__detail">{item.detail}</p>
        <div className="evidence__source">
          <span className="evidence__source-label">Origen</span>
          <pre className="codeblock">{item.source}</pre>
        </div>
        {item.observedAt ? (
          <dl className="deflist" style={{ marginTop: "var(--sp-3)" }}>
            <dt>Observado</dt>
            <dd className="mono">{formatDateTime(item.observedAt)}</dd>
          </dl>
        ) : null}
      </div>
    </li>
  );
}

export interface EvidenceListProps {
  items: EvidenceItem[];
  /** Identificador único del `<ul>` para asociarlo a su etiqueta. */
  id?: string;
  labelledBy?: string;
}

export function EvidenceList({ items, id, labelledBy }: EvidenceListProps) {
  return (
    <ul className="evidence" id={id} aria-labelledby={labelledBy}>
      {items.map((item) => (
        <EvidenceItemRow key={item.id} item={item} />
      ))}
    </ul>
  );
}
