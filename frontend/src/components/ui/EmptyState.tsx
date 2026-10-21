import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description?: string;
  children?: ReactNode;
}

export function EmptyState({ icon = "inbox", title, description, children }: EmptyStateProps) {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} size={20} />
      </span>
      <p className="empty__title">{title}</p>
      {description ? <p>{description}</p> : null}
      {children}
    </div>
  );
}
