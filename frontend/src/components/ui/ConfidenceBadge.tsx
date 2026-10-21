import { CONFIDENCE_LABELS } from "../../lib/format";
import type { Confidence } from "../../types/contract";

export interface ConfidenceBadgeProps {
  confidence: Confidence;
  /** Muestra el texto además del color (recomendado para accesibilidad). */
  withLabel?: boolean;
}

/**
 * Distintivo de confianza. El color nunca es el único indicio: siempre
 * acompaña del nivel en texto.
 */
export function ConfidenceBadge({ confidence, withLabel = true }: ConfidenceBadgeProps) {
  const label = CONFIDENCE_LABELS[confidence];
  return (
    <span className={`badge badge--${confidence}`}>
      {withLabel ? (
        `Confianza ${label}`
      ) : (
        <>
          <span className="visually-hidden">Confianza </span>
          {label}
        </>
      )}
    </span>
  );
}
