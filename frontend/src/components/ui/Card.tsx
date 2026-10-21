import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export interface CardProps {
  title: string;
  icon?: IconName;
  actions?: ReactNode;
  children: ReactNode;
  /** `flush` elimina el padding del cuerpo (listas, timelines). */
  bodyClassName?: string;
  className?: string;
  /** Etiqueta opcional para asociar la tarjeta a su título. */
  headingId?: string;
}

export function Card({
  title,
  icon,
  actions,
  children,
  bodyClassName = "",
  className = "",
  headingId,
}: CardProps) {
  return (
    <section className={`card ${className}`.trim()} aria-labelledby={headingId}>
      <header className="card__header">
        <h2 className="card__title" id={headingId}>
          {icon ? <Icon name={icon} size={15} /> : null}
          {title}
        </h2>
        {actions ? <div className="view__actions">{actions}</div> : null}
      </header>
      <div className={`card__body ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
}
