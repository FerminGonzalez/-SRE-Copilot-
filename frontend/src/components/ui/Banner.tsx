import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type BannerTone = "info" | "error" | "warning" | "success";

const TONE_ICON: Record<BannerTone, IconName> = {
  info: "info",
  error: "alert",
  warning: "alert",
  success: "check",
};

export interface BannerProps {
  tone?: BannerTone;
  title: string;
  detail?: ReactNode;
  actions?: ReactNode;
}

export function Banner({ tone = "info", title, detail, actions }: BannerProps) {
  return (
    <div className={`banner banner--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon name={TONE_ICON[tone]} size={18} className="banner__icon" />
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <p className="banner__title">{title}</p>
        {detail ? <p className="banner__detail">{detail}</p> : null}
        {actions ? <div className="view__actions">{actions}</div> : null}
      </div>
    </div>
  );
}
